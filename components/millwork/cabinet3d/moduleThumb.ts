import * as THREE from 'three';
import { moduleBoxes, type PartBox } from '@/lib/millwork/cabinetBoxes';
import type { DrawerKit } from '@/lib/millwork/drawerKit';
import { frontOf } from '@/lib/millwork/frontMaterial';
import { frontSwatch } from '@/lib/millwork/frontSwatch';
import { moduleCarcassHeightMm, moduleDepthMm } from '@/lib/millwork/fill';
import { roleColors } from '@/lib/millwork/sceneColors';
import {
  CAD_CARCASS_BASE,
  CAD_ENVIRONMENT,
  CAD_LIGHT,
  CARCASS_ROUGHNESS,
  INNER_ROUGHNESS,
  HANDLE_LOOK,
  applyCadLook,
  cadEnvironment,
  cavityLook,
  frontLookOf,
} from './cadLook';
import { accentKindOf, buildHandleGeometry } from './handleGeometry';
import { MATERIAL_FINISHES } from '@/lib/millwork/materialFinishes';
import type { HardwareItem, ProductionSettings } from '@/types/catalog';
import type { Module, Run } from '@/types/millwork';

/**
 * КАРТИНКА МОДУЛЯ — ИЗ ТОЙ ЖЕ ГЕОМЕТРИИ, ЧТО СЦЕНА.
 *
 * Библиотека показывает десятки вариантов, и каждый обязан выглядеть
 * так, как он встанет в кухню. Нарисовать их отдельно нельзя по той же
 * причине, по которой у варианта нет своей иконки (ловушка 220): свой
 * рисунок разойдётся с мебелью на первой же правке, а новый вариант
 * потребует художника.
 *
 * Коробки берутся у `moduleBoxes` — той самой функции, которая ставит
 * детали в сцене.
 *
 * ОДИН ОТРИСОВЩИК НА ВСЮ ПАНЕЛЬ.
 *
 * Пятьдесят карточек — это пятьдесят холстов WebGL, а браузер держит
 * около шестнадцати контекстов и закрывает лишние: сцена рядом гаснет
 * вместе с ними. Поэтому здесь ОДИН `WebGLRenderer` на вкладку, а
 * карточки получают готовый PNG — обычную картинку, которой контекст не
 * нужен вовсе.
 *
 * И он НЕ КРУТИТ СЦЕНУ: рисует в свой буфер по запросу и ни одного
 * кадра в общий цикл не добавляет (`frameloop="demand"` рядом остаётся
 * нулевым).
 */

const MM = 1000;
/** Размер картинки: карточка на планшете, ретина учтена вдвое. */
const PX = 256;

let shared: THREE.WebGLRenderer | null = null;

/** Отрисовщик поднимается ЛЕНИВО и живёт один на вкладку. */
function renderer(): THREE.WebGLRenderer | null {
  if (shared) return shared;
  if (typeof document === 'undefined') return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = PX;
    canvas.height = PX;
    shared = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    shared.setSize(PX, PX, false);
    /* Тон-маппинг и цветовое пространство — те же, что у сцены. */
    applyCadLook(shared);
    return shared;
  } catch {
    /*
     * WebGL может быть недоступен вовсе — старый планшет, политика
     * браузера, headless без флага. Картинки тогда просто нет, и
     * карточка показывает подпись: врать заглушкой нельзя.
     */
    return null;
  }
}

/** Готовые картинки по ключу: второй раз тот же модуль не рисуется. */
const cache = new Map<string, string>();

/** Ключ кэша: тип, ширина, высота и материал — всё, что видно. */
export function thumbKey(unit: Module, heightMm: number): string {
  const front = frontOf(unit);
  return [
    unit.variant ?? unit.kind,
    unit.frontType,
    unit.doorCount,
    unit.fill?.drawerHeights.length ?? 0,
    Math.round(unit.widthMm),
    Math.round(heightMm),
    front.base,
    front.construct,
    front.finish,
    // Поверхность каталога — другая шероховатость, значит другая картинка.
    front.surface ?? '',
    frontSwatch(front).color,
  ].join('|');
}


/**
 * ФУРНИТУРА НА КАРТИНКЕ (HARDWARE-PHOTO-PERF-01): превью позиции в
 * карточке фурнитуры — модуль с установленной позицией, механизм рисует
 * та же `moduleBoxes`, что сцена. Числа петель и комплекты ящиков считает
 * вызывающий теми же функциями, что ряд (`openingHardware`,
 * `moduleDrawerKits`): своей формулы здесь нет.
 */
export type ThumbExtra = {
  hardware?: Map<string, HardwareItem>;
  hinges?: number;
  drawerKits?: DrawerKit[];
  /** Без фасадов: механизм внутри корпуса видно. */
  cutaway?: boolean;
  /**
   * КРУПНЫЙ ПЛАН РУЧКИ (HANDLE-REAL): кадр по ручкам модуля — по ручке этой
   * детали, если она названа, — а не по модулю целиком: ручку 128 мм на
   * шкафу 720 мм в картинке 256 px не разглядеть. Ручек нет — кадр по модулю.
   */
  focus?: { leaf?: string };
};

/** Крупный план рисуется в два раза плотнее: карточка показывает его на 300 px. */
const FOCUS_PX = 512;

/**
 * Нарисовать модуль и отдать PNG.
 *
 * Возвращает `null`, если рисовать нечем: карточка тогда показывает
 * подпись, а не пустой квадрат, который читается как «не загрузилось».
 */
export function renderThumb(
  unit: Module,
  run: Pick<Run, 'zone' | 'ceilingHeightMm' | 'options' | 'production'> & Partial<Run>,
  production?: ProductionSettings,
  extra: ThumbExtra = {},
): string | null {
  const heightMm = moduleCarcassHeightMm(unit, run);
  const withHardware = Boolean(extra.hardware && extra.hardware.size > 0);
  const key = [
    withHardware
      ? [thumbKey(unit, heightMm), JSON.stringify(unit.fittings ?? []), extra.hinges ?? 0, extra.drawerKits?.length ?? 0, extra.cutaway ? 1 : 0].join('|')
      : thumbKey(unit, heightMm),
    /* Ручка модуля видна на картинке: её тип и место — часть картинки. */
    unit.fill?.handle ?? '',
    `${unit.fill?.handleLevel ?? ''}:${unit.fill?.handleTurn ?? ''}:${unit.fill?.handlePlace ?? ''}`,
    extra.focus ? `focus:${extra.focus.leaf ?? '*'}` : '',
  ].join('|');
  const ready = cache.get(key);
  if (ready) return ready;

  const gl = renderer();
  if (!gl) return null;

  const depthMm = moduleDepthMm(unit, run.zone, production);
  const boxes: PartBox[] = moduleBoxes(
    unit,
    {
      x: 0,
      y: 0,
      heightM: heightMm / MM,
      depthM: depthMm / MM,
      zM: 0,
      thicknessM: 0.016,
    },
    {
      gapM: 0.003,
      frontThicknessM: 0.018,
      integratedHandles: false,
      cutaway: Boolean(extra.cutaway),
      ...(withHardware ? { hardware: extra.hardware } : {}),
      ...(extra.hinges ? { hinges: extra.hinges } : {}),
      ...(extra.drawerKits?.length ? { drawerKits: extra.drawerKits } : {}),
    },
    production,
  );

  if (boxes.length === 0) return null;

  const scene = new THREE.Scene();
  const spec = frontOf(unit);
  const front = frontSwatch(spec).color;
  /*
   * ЦВЕТА РОЛЕЙ — ТЕ ЖЕ, ЧТО В СЦЕНЕ: `roleColors` от того же тона
   * корпуса, фасад — `frontSwatch`, шероховатость — по фактуре.
   */
  const roles = roleColors({ facade: front, carcass: CAD_CARCASS_BASE, counter: front });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const made = new Map<string, THREE.MeshStandardMaterial>();
  const meshes: THREE.Mesh[] = [];
  /* Сетки ручек — свои у картинки: живут, пока она рисуется. */
  const handleGeometries: THREE.BufferGeometry[] = [];
  const handleBounds = new THREE.Box3();
  const materialOf = (key: string, look: { color: string; metalness: number; roughness: number }) => {
    let material = made.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.color), metalness: look.metalness, roughness: look.roughness });
      made.set(key, material);
    }
    return material;
  };

  /*
   * Шероховатость фасада — та же функция, что у сцены (`frontLookOf`):
   * поверхность каталога материалов берёт числа из таблицы файла.
   */
  const frontLook = frontLookOf(spec, MATERIAL_FINISHES);

  for (const box of boxes) {
    /*
     * РУЧКА — ЕЁ МОДЕЛЬЮ (HANDLE-REAL): та же сетка, что в сцене, на месте
     * коробки ручки без растяжения; покрытие — по исполнению позиции.
     */
    if (box.node === 'handle' && box.handle) {
      const draw = box.handle;
      const shape = buildHandleGeometry(draw, true);
      const look = HANDLE_LOOK[draw.model.finish] ?? HANDLE_LOOK.demo;
      const accent = accentKindOf(draw, shape);
      const parts: [THREE.BufferGeometry, THREE.MeshStandardMaterial][] = [
        [shape.body, materialOf(`handle:${draw.model.finish}`, look)],
      ];
      if (shape.accent && accent) {
        parts.push([
          shape.accent,
          accent === 'cavity'
            ? materialOf(`handle:${draw.model.finish}:cavity`, cavityLook(look))
            : materialOf('handle:rubber', HANDLE_LOOK.rubber),
        ]);
      }
      for (const [part, material] of parts) {
        handleGeometries.push(part);
        const mesh = new THREE.Mesh(part, material);
        mesh.position.set(...box.position);
        scene.add(mesh);
        meshes.push(mesh);
      }
      if (!extra.focus?.leaf || draw.leaf === extra.focus.leaf) {
        handleBounds.expandByPoint(new THREE.Vector3(box.position[0] - box.scale[0] / 2, box.position[1] - box.scale[1] / 2, box.position[2] - box.scale[2] / 2));
        handleBounds.expandByPoint(new THREE.Vector3(box.position[0] + box.scale[0] / 2, box.position[1] + box.scale[1] / 2, box.position[2] + box.scale[2] / 2));
      }
      continue;
    }
    const isFront = box.material === 'front';
    const key = box.material;
    let material = made.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(isFront ? front : roles[box.material]),
        roughness: isFront
          ? frontLook.roughness
          : box.material === 'inner'
            ? INNER_ROUGHNESS
            : CARCASS_ROUGHNESS,
        metalness: isFront ? frontLook.metalness : 0,
      });
      made.set(key, material);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...box.position);
    mesh.scale.set(...box.scale);
    scene.add(mesh);
    meshes.push(mesh);
  }

  /*
   * СВЕТ ТОТ ЖЕ, ЧТО В САПР-ВИДЕ, — и не копией: `CAD_LIGHT`. Своя
   * копия света и Ламберт вместо стандартного материала давали карточки
   * темнее мебели в сцене рядом.
   */
  /* Окружение то же, что у сцены (P3D-LDSP): модуль смотрит фасадом в +z — к светлой стороне. */
  scene.environment = cadEnvironment(gl);
  scene.environmentIntensity = CAD_ENVIRONMENT.intensity;
  scene.add(
    new THREE.HemisphereLight(CAD_LIGHT.hemisphereSky, CAD_LIGHT.hemisphereGround, CAD_LIGHT.hemisphere),
  );
  const keyLight = new THREE.DirectionalLight(0xffffff, CAD_LIGHT.keyIntensity);
  keyLight.position.set(...CAD_LIGHT.keyPosition);
  scene.add(keyLight);

  /* Габарит модуля: по нему и кадрируем — как `sceneBounds` у сцены. */
  const bounds = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  bounds.getSize(size);
  bounds.getCenter(centre);

  /*
   * КРУПНЫЙ ПЛАН (HANDLE-REAL): кадр по ручке и пол-ладони фасада вокруг —
   * с той же стороны трёх четвертей, чтобы читался вылет от фасада.
   */
  const focused = Boolean(extra.focus) && !handleBounds.isEmpty();
  if (focused) {
    handleBounds.getSize(size);
    handleBounds.getCenter(centre);
  }
  const span = focused ? Math.max(size.x, size.y, size.z) * 0.85 + 0.035 : Math.max(size.x, size.y, size.z) || 1;
  const camera = new THREE.OrthographicCamera(-span, span, span, -span, 0.01, 100);
  /* Три четверти: видно фасад, бок и глубину — как на общем виде сцены. */
  if (focused) camera.position.set(centre.x + span * 0.9, centre.y + span * 0.55, centre.z + span * 1.8);
  else camera.position.set(centre.x + span, centre.y + span * 0.8, centre.z + span * 1.6);
  camera.lookAt(centre);
  camera.zoom = focused ? 1 : 1.45;
  camera.updateProjectionMatrix();

  if (focused) gl.setSize(FOCUS_PX, FOCUS_PX, false);
  gl.setClearColor(0x000000, 0);
  gl.render(scene, camera);

  const png = gl.domElement.toDataURL('image/png');
  if (focused) gl.setSize(PX, PX, false);

  /* Геометрия и материалы освобождаются сразу: их тут десятки в минуту. */
  geometry.dispose();
  for (const part of handleGeometries) part.dispose();
  made.forEach((material) => material.dispose());
  for (const mesh of meshes) scene.remove(mesh);

  cache.set(key, png);
  return png;
}

/** Сколько картинок уже нарисовано: для приёмки. */
export function thumbCacheSize(): number {
  return cache.size;
}
