'use client';

import * as THREE from 'three';
import { CAD_COLOR_SPACE, CAD_RENDER, CAD_TONE_MAPPING } from './cadLook';
import { realSizeOf, realSizeUvGeometry } from './realSizeMap';
import { pathTraceCounters } from './pathTraceStatus';
import type {
  FromWorker,
  ToWorker,
  WireAttribute,
  WireCamera,
  WireGeometry,
  WireLight,
  WireLook,
  WireMaterial,
  WireMesh,
  WireScene,
  WireTexture,
} from './pathTraceWire';

/**
 * РЕНДЕР ПО ЧЕРТЕЖУ: PATH TRACING ТОЙ ЖЕ СЦЕНЫ (слой 54).
 *
 * Картинка = то, что режет цех. Второй сцены здесь нет: рендер берёт то,
 * что нарисовано в САПР-виде (`CadScene`), — те же коробки мебели, те же
 * материалы с поверхностями из каталога, те же стены комнаты с проёмами, —
 * и считает свет честно, лучами. Ни одного числа модель не выдумывает:
 * Gemini остаётся только для вставки в фотографию помещения клиента.
 *
 * Модуль грузится ТОЛЬКО по нажатию «Рендер» (динамический импорт): в нём
 * three.js и трассировщик, и в первой загрузке `/demo` им не место.
 *
 * Здесь решается, ЧТО идёт в картинку (`pathTraceSceneOf`), и сцена
 * уезжает данными в фоновый поток (`pathTrace.worker.ts`): там свой
 * контекст WebGL на холсте превью, свой размер (1920×1080 не зависит от
 * окна) и вся работа видеокарты. На главном потоке её быть не может:
 * первая сборка шейдера на D3D11 держит спросивший её поток около минуты
 * (замерено: 57 360 мс в `getProgramInfoLog` у three.js), и это была
 * минута мёртвого экрана. «Остановить» отпускает экран сразу, а поток
 * уходит сам, когда сборка кончилась: закрытый снаружи посреди сборки,
 * он останавливал кадры страницы ещё на ~38 с.
 */

export type PathTraceSource = {
  /** Живая сцена САПР-вида: из неё берётся то, что нарисовано. */
  scene: THREE.Scene;
  /** Камера, которой она снята сейчас, — «текущий вид». */
  camera: THREE.Camera;
};

export type PathTraceJob = {
  source: PathTraceSource;
  width: number;
  height: number;
  /** Сколько проходов досчитать. */
  passes: number;
  signal: AbortSignal;
  /** Проходов готово и что сейчас идёт: сборка шейдера или счёт. */
  onProgress: (samples: number, phase: 'compile' | 'trace') => void;
  /** Куда положить холст, чтобы картинка проявлялась на глазах. */
  preview?: HTMLElement | null;
};

export type PathTraceResult = {
  /** PNG; `null`, если рендер остановили. */
  blob: Blob | null;
  samples: number;
  ms: number;
  stopped: boolean;
  width: number;
  height: number;
  /** Сколько деталей и объектов комнаты попало в картинку. */
  meshes: number;
  /**
   * Чего на картинке нет, хотя в САПР-виде оно нарисовано: виды проёмов,
   * показанных там контуром (вынос не замерен). Контур — условное
   * обозначение чертежа, а не предмет; на фотокартинке его нет, и панель
   * говорит об этом словами.
   */
  skipped: string[];
};

/* ─────────────────────  Что из сцены идёт в картинку  ───────────────────── */

type Built = {
  scene: THREE.Scene;
  meshes: number;
  skipped: string[];
  dispose: () => void;
};

/**
 * МАТЕРИАЛ ДЛЯ ТРАССИРОВЩИКА — ТОТ ЖЕ, ЧТО В СЦЕНЕ, ИЛИ ЕГО РАВНЫЙ.
 *
 * Стандартный и физический материалы идут как есть: у них цвет, глянец,
 * лак и фото из каталога (`frontLookOf`). Неосвещаемый (`MeshBasic`) в
 * растре значит одно из двух — и различается ПРИЗНАКОМ, а не цветом:
 * подсветка витрины светит сама (`userData.emissive`), контур незамеренного
 * объекта — полупрозрачная плёнка. Полосы затенения (`userData.shade`) и
 * невидимые зоны касания в картинку не идут: затенение трассировщик
 * считает сам, а зона касания — это палец, а не мебель.
 */
function materialFor(
  material: THREE.Material,
  own: Map<THREE.Material, THREE.Material>,
): THREE.Material | null {
  if (!material.visible || material.userData?.shade === true) return null;
  if (material.transparent && material.opacity <= 0.001) return null;
  if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) return material;

  const basic = material as THREE.MeshBasicMaterial;
  if (!basic.isMeshBasicMaterial) return null;

  let converted = own.get(material);
  if (!converted) {
    const emissive = material.userData?.emissive === true;
    converted = new THREE.MeshStandardMaterial({
      color: emissive ? new THREE.Color('#000000') : basic.color.clone(),
      emissive: emissive ? basic.color.clone() : new THREE.Color('#000000'),
      emissiveIntensity: emissive ? CAD_RENDER.glow : 0,
      transparent: basic.transparent,
      opacity: basic.opacity,
      roughness: 1,
      metalness: 0,
      side: basic.side,
      map: basic.map,
    });
    own.set(material, converted);
  }
  return converted;
}

/**
 * Фото «в настоящем размере» рисует шейдер сцены, а трассировщик шейдеров
 * не выполняет: развёртка запекается в копию коробки той же таблицей
 * граней (`realSizeUvGeometry`), а материал получает карту без сдвигов —
 * в шейдере сцены координаты карты тоже задаёт только развёртка.
 */
function realSizeMaterial(
  material: THREE.MeshStandardMaterial,
  own: Map<THREE.Material, THREE.Material>,
): THREE.MeshStandardMaterial {
  const cached = own.get(material);
  if (cached) return cached as THREE.MeshStandardMaterial;
  const clone = material.clone();
  if (material.map) {
    const map = material.map.clone();
    map.userData = { ...map.userData, pathTraceOwn: true };
    map.repeat.set(1, 1);
    map.offset.set(0, 0);
    map.center.set(0, 0);
    map.rotation = 0;
    map.updateMatrix();
    clone.map = map;
  }
  own.set(material, clone);
  return clone;
}

/**
 * Сцена для трассировщика из живой сцены — экспорт для приёмки: правила
 * «что идёт в картинку» проверяются без видеокарты.
 */
export function pathTraceSceneOf(live: THREE.Scene): Built {
  return renderSceneOf(live);
}

function renderSceneOf(live: THREE.Scene): Built {
  live.updateMatrixWorld(true);

  const scene = new THREE.Scene();
  const own = new Map<THREE.Material, THREE.Material>();
  const geometries: THREE.BufferGeometry[] = [];
  const keys: THREE.DirectionalLight[] = [];
  const scale = new THREE.Vector3();
  const unusedPosition = new THREE.Vector3();
  const unusedRotation = new THREE.Quaternion();
  let meshes = 0;
  const skipped: string[] = [];

  /* `from` — какой меш сцены это нарисовал: приёмка сверяет по нему, что куда ушло. */
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, world: THREE.Matrix4, from: THREE.Object3D) => {
    let geo = geometry;
    let mat = material;
    const size = realSizeOf(material);
    const standard = material as THREE.MeshStandardMaterial;
    if (size && standard.map && material.userData?.realSizePatched === true) {
      world.decompose(unusedPosition, unusedRotation, scale);
      geo = realSizeUvGeometry(geometry, scale, size);
      geometries.push(geo);
      mat = realSizeMaterial(standard, own);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(world);
    mesh.userData.from = from.uuid;
    scene.add(mesh);
    meshes += 1;
  };

  const instance = new THREE.Matrix4();
  const walk = (object: THREE.Object3D) => {
    /*
     * Спрятанное не рисуется и здесь: стена между камерой и кухней
     * (`wallsFacingAway`) закрыла бы картинку, а зоны касания и ручки
     * выделения — инструменты, а не мебель.
     */
    if (!object.visible || object.userData?.helper === true) return;
    if (object.userData?.role === 'contour') {
      if (typeof object.userData.kind === 'string') skipped.push(object.userData.kind);
      return;
    }

    const light = object as THREE.DirectionalLight;
    if (light.isDirectionalLight) keys.push(light);

    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material)) {
      const material = materialFor(mesh.material, own);
      if (material) {
        const batch = object as THREE.InstancedMesh;
        if (batch.isInstancedMesh) {
          for (let i = 0; i < batch.count; i += 1) {
            batch.getMatrixAt(i, instance);
            add(batch.geometry, material, new THREE.Matrix4().multiplyMatrices(batch.matrixWorld, instance), batch);
          }
        } else {
          add(mesh.geometry, material, mesh.matrixWorld, mesh);
        }
      }
    }
    for (const child of object.children) walk(child);
  };
  walk(live);

  /* Ключевой свет САПР-вида — тем же местом и направлением. */
  for (const source of keys) {
    const key = new THREE.DirectionalLight(source.color, source.intensity * CAD_RENDER.keyScale);
    key.position.setFromMatrixPosition(source.matrixWorld);
    key.target.position.setFromMatrixPosition(source.target.matrixWorld);
    scene.add(key, key.target);
  }

  scene.background = new THREE.Color(CAD_RENDER.background);
  scene.environmentIntensity = CAD_RENDER.environment;

  return {
    scene,
    meshes,
    skipped: Array.from(new Set(skipped)),
    dispose: () => {
      own.forEach((material) => {
        const map = (material as THREE.MeshStandardMaterial).map;
        // Карта-копия своя; общая с материалом сцены — не трогаем.
        if (map && map.userData?.pathTraceOwn === true) map.dispose();
        material.dispose();
      });
      geometries.forEach((geometry) => geometry.dispose());
    },
  };
}

/* ─────────────────────  Камера: текущий вид целиком  ───────────────────── */

/**
 * КАДР ЭКРАНА ЦЕЛИКОМ ВНУТРИ КАДРА РЕНДЕРА.
 *
 * У холста на экране своя пропорция (1408×691 ≈ 2.04), у картинки своя
 * (16:9 ≈ 1.78). Обрезать нельзя: мебель, которую человек видел на
 * экране, обязана остаться на картинке. Поэтому у́же — держим ширину
 * кадра, шире — высоту; место и направление камеры те же.
 */
function renderCamera(live: THREE.Camera, aspect: number): THREE.Camera {
  live.updateMatrixWorld(true);
  const perspective = live as THREE.PerspectiveCamera;
  if (perspective.isPerspectiveCamera) {
    const camera = new THREE.PerspectiveCamera(perspective.fov, aspect, perspective.near, perspective.far);
    if (aspect < perspective.aspect) {
      const halfWidth = Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2)) * perspective.aspect;
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfWidth / aspect));
    }
    live.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    return camera;
  }

  const ortho = live as THREE.OrthographicCamera;
  const zoom = ortho.zoom || 1;
  const width = (ortho.right - ortho.left) / zoom;
  const height = (ortho.top - ortho.bottom) / zoom;
  const cx = (ortho.right + ortho.left) / 2 / zoom;
  const cy = (ortho.top + ortho.bottom) / 2 / zoom;
  const w = aspect < width / height ? width : height * aspect;
  const h = aspect < width / height ? width / aspect : height;
  const camera = new THREE.OrthographicCamera(cx - w / 2, cx + w / 2, cy + h / 2, cy - h / 2, ortho.near, ortho.far);
  live.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}


/* ─────────────────────  Сцена данными: для фонового потока  ───────────────────── */

/** Гнёзда карт стандартного и физического материалов. */
const MAP_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'specularIntensityMap',
  'specularColorMap',
  'transmissionMap',
  'thicknessMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'anisotropyMap',
] as const;

type Slots = Record<string, unknown>;

/** Числа вида — из `cadLook`; своих у потока нет. */
const LOOK: WireLook = {
  toneMapping: CAD_TONE_MAPPING,
  outputColorSpace: CAD_COLOR_SPACE,
  bounces: CAD_RENDER.bounces,
  tiles: CAD_RENDER.tiles,
  environmentSize: CAD_RENDER.environmentSize,
};

function imageSize(image: unknown): { width: number; height: number } {
  const element = image as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number } | null;
  if (!element) return { width: 0, height: 0 };
  return { width: element.naturalWidth ?? element.width ?? 0, height: element.naturalHeight ?? element.height ?? 0 };
}

/**
 * ФОТО ЕДЕТ `ImageBitmap`, А НЕ СТРОКОЙ.
 *
 * `toJSON` текстуры кодирует картинку в data URL — секунды на большом фото,
 * и все на главном потоке. `ImageBitmap` переезжает без копии. У него
 * WebGL не читает `UNPACK_FLIP_Y` и умножение на альфу, поэтому и то и
 * другое делается здесь — ровно так, как three загрузил бы то же фото.
 * Фото, которое ещё не загрузилось, — отказ словами: картинка без фото
 * фасада показала бы клиенту не ту мебель.
 */
async function textureWire(texture: THREE.Texture): Promise<{ wire: WireTexture; transfer: Transferable[] }> {
  const params = {
    id: texture.uuid,
    wrapS: texture.wrapS,
    wrapT: texture.wrapT,
    repeat: [texture.repeat.x, texture.repeat.y] as [number, number],
    offset: [texture.offset.x, texture.offset.y] as [number, number],
    center: [texture.center.x, texture.center.y] as [number, number],
    rotation: texture.rotation,
    colorSpace: texture.colorSpace,
    generateMipmaps: texture.generateMipmaps,
    minFilter: texture.minFilter,
    magFilter: texture.magFilter,
    anisotropy: texture.anisotropy,
  };
  const data = texture as THREE.DataTexture;
  if (data.isDataTexture) {
    const image = data.image as { data: ArrayBufferView | null; width: number; height: number };
    if (!image.data) throw new Error('Таблица данных материала пуста — рендер не может её взять.');
    const copy = (image.data as Uint8Array).slice();
    return {
      wire: {
        ...params,
        source: { kind: 'data', data: copy, width: image.width, height: image.height, format: data.format, type: data.type },
      },
      transfer: [copy.buffer],
    };
  }
  const size = imageSize(texture.image);
  if (size.width === 0 || size.height === 0) {
    throw new Error('Фото материала ещё не загрузилось в 3D — дождитесь его на фасадах и нажмите «Рендер» ещё раз.');
  }
  const bitmap = await createImageBitmap(texture.image as ImageBitmapSource, {
    imageOrientation: texture.flipY ? 'flipY' : 'from-image',
    premultiplyAlpha: texture.premultiplyAlpha ? 'premultiply' : 'none',
    colorSpaceConversion: 'none',
  });
  return { wire: { ...params, source: { kind: 'bitmap', bitmap } }, transfer: [bitmap] };
}

/** Массив атрибута — копией: свои массивы сцены в поток не отдаются, ей ещё рисовать. */
function attributeCopy(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): WireAttribute {
  const size = attribute.itemSize;
  if (size > 4) throw new Error(`Атрибут геометрии на ${size} чисел — рендер его не возьмёт.`);
  const array = new Float32Array(attribute.count * size);
  for (let i = 0; i < attribute.count; i += 1) {
    array[i * size] = attribute.getX(i);
    if (size > 1) array[i * size + 1] = attribute.getY(i);
    if (size > 2) array[i * size + 2] = attribute.getZ(i);
    if (size > 3) array[i * size + 3] = attribute.getW(i);
  }
  // getX…getW уже отдают значения без нормализации.
  return { array, itemSize: size, normalized: false };
}

function geometryWire(geometry: THREE.BufferGeometry): { wire: WireGeometry; transfer: Transferable[] } {
  const attributes: Record<string, WireAttribute> = {};
  const transfer: Transferable[] = [];
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    attributes[name] = attributeCopy(attribute as THREE.BufferAttribute);
    transfer.push(attributes[name].array.buffer);
  }
  let index: Uint32Array | null = null;
  if (geometry.index) {
    index = Uint32Array.from(geometry.index.array as ArrayLike<number>);
    transfer.push(index.buffer);
  }
  return { wire: { id: geometry.uuid, attributes, index }, transfer };
}

/**
 * Материал — `toJSON` копии без карт: цвет, глянец, лак, свечение и
 * прозрачность восстанавливает `MaterialLoader` в потоке, а карты едут
 * фото по своим гнёздам. `userData` не едет: потоку он не нужен, а
 * функция в нём уронила бы передачу.
 */
function materialWire(material: THREE.Material, mapId: (texture: THREE.Texture) => string): WireMaterial {
  const bare = material.clone();
  const maps: Record<string, string> = {};
  for (const slot of MAP_SLOTS) {
    const texture = (material as unknown as Slots)[slot] as THREE.Texture | null | undefined;
    if (texture?.isTexture) maps[slot] = mapId(texture);
    if (slot in bare) (bare as unknown as Slots)[slot] = null;
  }
  if ('envMap' in bare) (bare as unknown as Slots).envMap = null;
  const json = bare.toJSON() as { userData?: unknown };
  delete json.userData;
  bare.dispose();
  return { id: material.uuid, json, maps };
}

function cameraWire(camera: THREE.Camera): WireCamera {
  const pose = {
    position: camera.position.toArray(),
    quaternion: camera.quaternion.toArray(),
    scale: camera.scale.toArray(),
  };
  const perspective = camera as THREE.PerspectiveCamera;
  if (perspective.isPerspectiveCamera) {
    return { kind: 'perspective', fov: perspective.fov, aspect: perspective.aspect, near: perspective.near, far: perspective.far, ...pose };
  }
  const ortho = camera as THREE.OrthographicCamera;
  return {
    kind: 'orthographic',
    left: ortho.left,
    right: ortho.right,
    top: ortho.top,
    bottom: ortho.bottom,
    near: ortho.near,
    far: ortho.far,
    ...pose,
  };
}

/**
 * СЦЕНА ТРАССИРОВЩИКА ДАННЫМИ — то, что решил `pathTraceSceneOf`, без
 * единого нового правила. Экспорт для приёмки: числа материалов, матрицы
 * деталей, свет и камера сверяются после обратной сборки без видеокарты.
 */
export async function wireSceneOf(
  built: Pick<Built, 'scene'>,
  camera: THREE.Camera,
): Promise<{ scene: WireScene; transfer: Transferable[] }> {
  const transfer: Transferable[] = [];
  const geometries = new Map<string, WireGeometry>();
  const materials = new Map<string, WireMaterial>();
  const textures = new Map<string, Promise<{ wire: WireTexture; transfer: Transferable[] }>>();
  const mapId = (texture: THREE.Texture) => {
    if (!textures.has(texture.uuid)) textures.set(texture.uuid, textureWire(texture));
    return texture.uuid;
  };
  const meshes: WireMesh[] = [];
  const lights: WireLight[] = [];

  built.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material)) {
      const material = mesh.material;
      if (!geometries.has(mesh.geometry.uuid)) {
        const geometry = geometryWire(mesh.geometry);
        geometries.set(geometry.wire.id, geometry.wire);
        transfer.push(...geometry.transfer);
      }
      if (!materials.has(material.uuid)) materials.set(material.uuid, materialWire(material, mapId));
      meshes.push({
        geometry: mesh.geometry.uuid,
        material: material.uuid,
        matrix: mesh.matrix.toArray(),
        from: String(mesh.userData.from ?? ''),
      });
    }
    const light = object as THREE.DirectionalLight;
    if (light.isDirectionalLight) {
      lights.push({
        color: light.color.toArray() as [number, number, number],
        intensity: light.intensity,
        position: light.position.toArray() as [number, number, number],
        target: light.target.position.toArray() as [number, number, number],
      });
    }
  });

  const settled = await Promise.allSettled(textures.values());
  const failed = settled.find((item): item is PromiseRejectedResult => item.status === 'rejected');
  if (failed) {
    // Уже снятые фото не уедут — закрываем, чтобы не держали память.
    for (const item of settled) {
      if (item.status === 'fulfilled' && item.value.wire.source.kind === 'bitmap') item.value.wire.source.bitmap.close();
    }
    throw failed.reason;
  }
  const wires: WireTexture[] = [];
  for (const item of settled) {
    if (item.status !== 'fulfilled') continue;
    wires.push(item.value.wire);
    transfer.push(...item.value.transfer);
  }

  const background = built.scene.background as THREE.Color | null;
  return {
    scene: {
      geometries: Array.from(geometries.values()),
      materials: Array.from(materials.values()),
      textures: wires,
      meshes,
      lights,
      camera: cameraWire(camera),
      background: background?.isColor ? `#${background.getHexString()}` : CAD_RENDER.background,
      environmentIntensity: built.scene.environmentIntensity,
    },
    transfer,
  };
}

/** Уже снятые фото сцены, если до потока она так и не доехала. */
function closeBitmaps(scene: WireScene): void {
  for (const texture of scene.textures) if (texture.source.kind === 'bitmap') texture.source.bitmap.close();
}

/* ─────────────────────  Счёт в фоновом потоке  ───────────────────── */

/**
 * ПОТОК РЕНДЕРА — ОДИН НА СТРАНИЦУ, ЖИВЁТ, ПОКА ЖИВЁТ СТРАНИЦА.
 *
 * Уничтоженный вскоре после сборки шейдера контекст останавливал кадры
 * страницы на 38–43 с — как бы его ни уничтожали (`terminate`, `close`,
 * `forceContextLoss`); живой поток в том же сценарии — ни на один кадр.
 * Поэтому поток не закрывается ни после рендера, ни после «Остановить»:
 * он отпускает большие буферы и ждёт следующего задания, а собранная
 * программа остаётся — следующий рендер не ждёт сборки. Закрывается он
 * вместе со страницей (`pagehide`) или когда потерял контекст.
 *
 * Задания идут по очереди: второе ждёт, пока первое не отпустило поток.
 */
type Service = {
  worker: Worker;
  /** Кончилось ли прошлое задание (поток сказал `idle`). */
  turn: Promise<void>;
  listener: ((message: FromWorker) => void) | null;
};

let service: Service | null = null;

function renderService(): Service {
  if (service) return service;
  const counters = pathTraceCounters();
  const worker = new Worker(new URL('./pathTrace.worker.ts', import.meta.url));
  counters.created += 1;
  counters.alive += 1;
  const own: Service = { worker, turn: Promise.resolve(), listener: null };
  const drop = () => {
    if (service !== own) return;
    service = null;
    worker.terminate();
    counters.alive -= 1;
    window.removeEventListener('pagehide', drop);
  };
  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    own.listener?.(event.data);
    // Потерянный контекст поток не вернёт: следующий рендер заведёт новый.
    if (event.data.type === 'error' && event.data.fatal) drop();
  };
  worker.onerror = (event) => {
    own.listener?.({ type: 'error', message: `рендер остановился в фоновом потоке: ${event.message || 'причина не названа'}`, fatal: true });
    own.listener?.({ type: 'idle' });
    drop();
  };
  worker.onmessageerror = () => {
    own.listener?.({ type: 'error', message: 'фоновый поток рендера прислал ответ, который не читается', fatal: false });
  };
  window.addEventListener('pagehide', drop);
  service = own;
  return own;
}

export async function renderPathTraced(job: PathTraceJob): Promise<PathTraceResult> {
  const counters = pathTraceCounters();
  const started = performance.now();

  const built = renderSceneOf(job.source.scene);
  const meshes = built.meshes;
  const skipped = built.skipped;
  let wire: { scene: WireScene; transfer: Transferable[] };
  try {
    wire = await wireSceneOf(built, renderCamera(job.source.camera, job.width / job.height));
  } finally {
    // Своё (копии материалов, запечённые развёртки) уже уехало данными.
    built.dispose();
  }

  const result = (blob: Blob | null, samples: number, stopped: boolean): PathTraceResult => {
    const ms = Math.round(performance.now() - started);
    counters.lastSamples = samples;
    counters.lastMs = ms;
    counters.lastSize = `${job.width}x${job.height}`;
    return { blob, samples, ms, stopped, width: job.width, height: job.height, meshes, skipped };
  };

  /* Очередь: прошлое задание (например, только что остановленное) отпускает поток. */
  const svc = renderService();
  const previousTurn = svc.turn;
  let endTurn: () => void = () => undefined;
  svc.turn = new Promise<void>((done) => {
    endTurn = done;
  });
  await previousTurn;

  if (job.signal.aborted) {
    closeBitmaps(wire.scene);
    endTurn();
    return result(null, 0, true);
  }

  /*
   * ПРЕВЬЮ — СНИМКАМИ, А НЕ ХОЛСТОМ ПОТОКА.
   *
   * Холст страницы, отданный потоку (`transferControlToOffscreen`),
   * привязывал к потоку кадры страницы. У потока свой холст, а сюда
   * приезжают готовые снимки — картинка проявляется на глазах, и кадры
   * страницы от потока не зависят.
   *
   * Каждый снимок рисуется и СРАЗУ закрывается (`close`): он держит 8 МБ
   * видеопамяти, и отданный холсту `bitmaprenderer` спрятанного превью
   * отпускался сборкой мусора пачкой — на рендере в 256 проходов главный
   * поток вставал на 28 с.
   */
  const canvas = document.createElement('canvas');
  canvas.width = job.width;
  canvas.height = job.height;
  const view = canvas.getContext('2d');
  if (job.preview) {
    canvas.setAttribute('data-pathtrace-live', '');
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    job.preview.appendChild(canvas);
  }
  counters.running += 1;
  counters.buffers = 'held';

  return new Promise<PathTraceResult>((resolve, reject) => {
    let samples = 0;
    let delivered = false;
    /* Итог — экрану сразу: ждать, пока поток отпустит буферы, человеку незачем. */
    const deliver = (settle: () => void) => {
      if (delivered) return;
      delivered = true;
      counters.running -= 1;
      job.signal.removeEventListener('abort', onAbort);
      canvas.remove();
      settle();
    };
    const onAbort = () =>
      deliver(() => {
        svc.worker.postMessage({ type: 'stop' } satisfies ToWorker);
        resolve(result(null, samples, true));
      });
    job.signal.addEventListener('abort', onAbort);

    svc.listener = (message) => {
      if (message.type === 'progress') {
        if (delivered) return;
        samples = message.done;
        job.onProgress(message.done, message.phase);
        return;
      }
      if (message.type === 'preview') {
        // Спрятанное превью не рисуется вовсе; снимок закрывается в любом случае.
        if (!delivered && view && canvas.isConnected && canvas.offsetParent !== null) {
          view.drawImage(message.bitmap, 0, 0, canvas.width, canvas.height);
        }
        message.bitmap.close();
        return;
      }
      if (message.type === 'done') {
        samples = message.samples;
        deliver(() => resolve(result(message.blob, message.samples, false)));
        return;
      }
      if (message.type === 'error') {
        deliver(() => reject(new Error(message.message)));
        return;
      }
      // idle: поток отпустил буферы — задание кончено, очередь свободна.
      svc.listener = null;
      counters.buffers = 'released';
      deliver(() => resolve(result(null, samples, true)));
      endTurn();
    };

    const start: ToWorker = {
      type: 'start',
      scene: wire.scene,
      look: LOOK,
      width: job.width,
      height: job.height,
      passes: job.passes,
    };
    svc.worker.postMessage(start, wire.transfer);
  });
}
