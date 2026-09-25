import * as THREE from 'three';
import { moduleBoxes, type PartBox } from '@/lib/millwork/cabinetBoxes';
import { frontOf } from '@/lib/millwork/frontMaterial';
import { frontSwatch } from '@/lib/millwork/frontSwatch';
import { moduleCarcassHeightMm, moduleDepthMm } from '@/lib/millwork/fill';
import type { ProductionSettings } from '@/types/catalog';
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
    frontSwatch(front).color,
  ].join('|');
}

const COLOR: Record<string, string> = {
  carcass: '#d8d2c4',
  inner: '#c6c0b2',
  metal: '#9aa0a6',
  appliance: '#43464a',
  glass: '#cfe0e6',
};

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
): string | null {
  const heightMm = moduleCarcassHeightMm(unit, run);
  const key = thumbKey(unit, heightMm);
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
      cutaway: false,
    },
    production,
  );

  if (boxes.length === 0) return null;

  const scene = new THREE.Scene();
  const front = frontSwatch(frontOf(unit)).color;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const made = new Map<string, THREE.MeshLambertMaterial>();
  const meshes: THREE.Mesh[] = [];

  for (const box of boxes) {
    const tone = box.material === 'front' ? front : (COLOR[box.material] ?? '#d8d2c4');
    let material = made.get(tone);
    if (!material) {
      material = new THREE.MeshLambertMaterial({ color: new THREE.Color(tone) });
      made.set(tone, material);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...box.position);
    mesh.scale.set(...box.scale);
    scene.add(mesh);
    meshes.push(mesh);
  }

  /*
   * СВЕТ ТОТ ЖЕ, ЧТО В САПР-ВИДЕ: один направленный плюс общий. Бликов
   * нет намеренно — клиент не должен выбирать цвет по блику (ловушка 299).
   */
  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  const key1 = new THREE.DirectionalLight(0xffffff, 0.66);
  key1.position.set(1.2, 1.6, 1.4);
  scene.add(key1);

  /* Габарит модуля: по нему и кадрируем — как `sceneBounds` у сцены. */
  const bounds = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  bounds.getSize(size);
  bounds.getCenter(centre);

  const span = Math.max(size.x, size.y, size.z) || 1;
  const camera = new THREE.OrthographicCamera(-span, span, span, -span, 0.01, 100);
  /* Три четверти: видно фасад, бок и глубину — как на общем виде сцены. */
  camera.position.set(centre.x + span, centre.y + span * 0.8, centre.z + span * 1.6);
  camera.lookAt(centre);
  camera.zoom = 1.45;
  camera.updateProjectionMatrix();

  gl.setClearColor(0x000000, 0);
  gl.render(scene, camera);

  const png = gl.domElement.toDataURL('image/png');

  /* Геометрия и материалы освобождаются сразу: их тут десятки в минуту. */
  geometry.dispose();
  made.forEach((material) => material.dispose());
  for (const mesh of meshes) scene.remove(mesh);

  cache.set(key, png);
  return png;
}

/** Сколько картинок уже нарисовано: для приёмки. */
export function thumbCacheSize(): number {
  return cache.size;
}
