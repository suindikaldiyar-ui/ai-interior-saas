import * as THREE from 'three';
import { frontSwatch } from '@/lib/millwork/frontSwatch';
import type { FinishSpec } from '@/lib/millwork/materialCollection';
import type { FrontSpec } from '@/types/millwork';

/**
 * КАК ВЫГЛЯДИТ САПР-ВИД — ОДНО МЕСТО НА СЦЕНУ И НА КАРТИНКИ БИБЛИОТЕКИ.
 *
 * Картинка карточки рисовалась своей копией настроек: Ламберт вместо
 * стандартного материала, свой свет с другой стороны и без тон-маппинга,
 * который сцена получает от R3F. Итог — карточки темнее и серее мебели
 * рядом: клиент видел в панели не тот фасад, что в сцене.
 *
 * Здесь всё, что решает вид: свет, тон-маппинг, цветовое пространство,
 * шероховатость по фактуре и базовый тон корпуса. Сцена и отрисовщик
 * картинок читают это отсюда, а не держат копии.
 */

/**
 * СВЕТ: РАССЕЯННЫЙ И ОДИН ИСТОЧНИК С ТЕНЬЮ (слой 53).
 *
 * Было два плоских: общий 0.72 и направленный без тени — мебель без
 * тени висела над полом, углы комнаты не читались. Теперь рассеянный
 * свет — общий плюс полусферический (сверху светлее, у пола темнее), а
 * ключевой — ОДИН направленный источник, и только он даёт тень: кухня
 * кладёт её на пол и на стены. Второй источник с тенью на планшете —
 * второй проход по каждому мешу (ловушка 299: бликов по-прежнему нет).
 *
 * Картинки библиотеки берут тот же набор (`moduleThumb`): карточка рядом
 * со сценой светом от неё не отличается.
 */
export const CAD_LIGHT = {
  ambient: 0.3,
  /** Полусферический: цвет неба и цвет пола. */
  hemisphere: 0.62,
  hemisphereSky: '#FFFFFF',
  hemisphereGround: '#A39B8C',
  /** Для картинок: откуда светит относительно модуля. */
  keyPosition: [2.5, 5, 4] as [number, number, number],
  keyIntensity: 1.05,
  /**
   * Для сцены: направление ключевого света от центра комнаты — сверху, с
   * открытой стороны и чуть слева, чтобы тень шкафов легла на стену и пол.
   */
  keyFromOpen: 0.55,
  keySide: 0.35,
  keyUp: 1,
};

/**
 * ТЕНЬ — ОДИН ИСТОЧНИК, РАЗМЕР КАРТЫ — КОНСТАНТА.
 *
 * Карта пересчитывается только при изменении сцены (правка, материал,
 * открытая створка) — `autoUpdate` выключен, иначе она перерисовывалась бы
 * каждым кадром вращения камеры, а камера тени не меняет вовсе.
 */
export const CAD_SHADOW = {
  mapSize: 1024,
  bias: -0.0004,
  normalBias: 0.03,
  radius: 3,
};

/** Настройки карты теней для `<Canvas shadows>`: мягкая, без автопересчёта. */
export const CAD_SHADOW_MAP = {
  enabled: true,
  type: THREE.PCFSoftShadowMap,
  autoUpdate: false,
} as const;

/**
 * КОМНАТА: СВЕТЛЫЕ НЕЙТРАЛЬНЫЕ ЦВЕТА ПО УМОЛЧАНИЮ, ОДНИМ МЕСТОМ.
 *
 * Стены и пол — фон, а не отделка: отделку показывает рендер по фото
 * клиента. Допущение замера — полупрозрачным, не замеренный вынос — контуром.
 */
export const CAD_ROOM = {
  wall: '#E9E5DD',
  floor: '#D6CFC2',
  object: '#DCD6CA',
  contour: '#8A8373',
  assumedOpacity: 0.42,
  /** Затенение у пола и в углах: насколько темнее у самого стыка. */
  corner: 0.3,
  /** Ширина полосы затенения, м. */
  cornerM: 0.32,
  /** Затенение ПОД шкафами: пол у цоколя, насколько темнее у самой планки. */
  under: 0.38,
  /** Сколько пола перед цоколем оно захватывает, м. */
  underM: 0.24,
};

/**
 * ЗАТЕНЕНИЕ СТЫКОВ — ПОЛОСОЙ С ГРАДИЕНТОМ, А НЕ ПОСТОБРАБОТКОЙ.
 *
 * Угол комнаты и пол у цоколя без него читаются стыком двух одинаково
 * освещённых листов. Второй проход по кадру (SSAO) на планшете стоит
 * половины кадра, поэтому стык затеняет плоскость: тёмная у стыка,
 * прозрачная через заданную ширину. Текстура градиента одна на вкладку —
 * 128 × 1, её не освобождают: делят комната и мебель.
 */
let shadeTexture: THREE.DataTexture | null = null;

export function cadShadeTexture(): THREE.DataTexture {
  if (shadeTexture) return shadeTexture;
  const size = 128;
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i += 1) {
    // Нелинейно: у самого стыка темнее, дальше быстро светлеет.
    const t = i / (size - 1);
    const a = Math.round(255 * (1 - t) ** 2.2);
    data.set([a, a, a, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  shadeTexture = texture;
  return texture;
}

/** Материал полосы затенения: чёрный, прозрачность по градиенту. */
export function cadShadeMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: '#000000',
    transparent: true,
    opacity,
    alphaMap: cadShadeTexture(),
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
}

/**
 * Поворот полосы по двум её ортам: тёмный край — у `−xAxis`, нормаль —
 * их произведение. Полосу не надо крутить углами: она задаётся тем, куда
 * смотрит.
 */
export function cadShadeQuaternion(
  xAxis: [number, number, number],
  yAxis: [number, number, number],
): THREE.Quaternion {
  const x = new THREE.Vector3(...xAxis);
  const y = new THREE.Vector3(...yAxis);
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Тон-маппинг и цветовое пространство — те же, что R3F ставит сцене. */
export const CAD_TONE_MAPPING = THREE.ACESFilmicToneMapping;
export const CAD_COLOR_SPACE = THREE.SRGBColorSpace;

/** Настроить отрисовщик так же, как настроена сцена. */
export function applyCadLook(gl: THREE.WebGLRenderer): void {
  gl.toneMapping = CAD_TONE_MAPPING;
  gl.outputColorSpace = CAD_COLOR_SPACE;
}

/** Базовый тон корпуса: от него `roleColors` выводит корпус и нутро. */
export const CAD_CARCASS_BASE = '#B9B2A4';

/**
 * ШЕРОХОВАТОСТЬ ПО ФАКТУРЕ.
 *
 * Разница обязана быть ЗАМЕТНОЙ, а не тонкой: клиент на встрече сравнивает
 * глянец с матом на планшете, при комнатном свете, за две секунды. 0.06
 * отражает окно почти зеркально, 0.78 не бликует вовсе — между ними видно
 * невооружённым глазом, в отличие от «0.4 против 0.5».
 */
export const FRONT_ROUGHNESS: Record<FrontSpec['finish'], number> = {
  gloss: 0.06,
  matte: 0.78,
  textured: 0.62,
};

/**
 * Небольшая «металличность» глянца.
 *
 * Чистый диэлектрик с нулевой шероховатостью на схематичной сцене
 * выглядит просто светлым пятном: блик появляется, когда есть что
 * отражать. Это не физика краски, а способ показать разницу.
 */
export const FRONT_METALNESS: Record<FrontSpec['finish'], number> = {
  gloss: 0.16,
  matte: 0,
  textured: 0.02,
};

/** Шероховатость корпуса и нутра — та же, что у материалов сцены. */
export const CARCASS_ROUGHNESS = 0.72;
export const INNER_ROUGHNESS = 0.78;

/* ────────────────  Вид фасада: одна функция  ──────────────── */

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * ЦВЕТ ФАСАДА — ОДНА ФОРМУЛА НА СЦЕНУ И НА СХЕМУ.
 *
 * Считает `frontSwatch` (слой 36): «артикул выбран — его цвет, иначе
 * типовой цвет этой базы». Сцена только спрашивает.
 */
export function frontColor(spec: FrontSpec, fallback: string): string {
  const color = frontSwatch(spec).color;
  return HEX.test(color) ? color : fallback;
}

export type FrontLook = {
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
};

/**
 * ШЕРОХОВАТОСТЬ И ЛАК ФАСАДА.
 *
 * Поверхность из каталога материалов (`spec.surface`) берёт числа из
 * таблицы `finishes` файла — High Gloss 0.05 и лак 1.0, Touch Sense 0.9
 * без лака. Металличности в файле нет, и краска с ламинатом — диэлектрик:
 * блик глянцу даёт лак, а не подмешанный металл. Фасад без поверхности
 * выглядит как раньше — по `finish`.
 */
export function frontLookOf(spec: FrontSpec, finishes: Record<string, FinishSpec>): FrontLook {
  const surface = spec.surface ? finishes[spec.surface] : undefined;
  if (surface) {
    return {
      roughness: surface.roughness,
      metalness: 0,
      clearcoat: surface.clearcoat,
      clearcoatRoughness: surface.clearcoatRoughness,
    };
  }
  return {
    roughness: FRONT_ROUGHNESS[spec.finish],
    metalness: FRONT_METALNESS[spec.finish],
    clearcoat: 0,
    clearcoatRoughness: 0,
  };
}

/**
 * ПОКРАСИТЬ МАТЕРИАЛ ФАСАДА.
 *
 * `color.set(hex)` переводит sRGB в линейное пространство сам —
 * `ColorManagement` в three включён, и hex из каталога (sRGB) ложится в
 * материал линейным. Присвой компоненты числами напрямую — и цвет в сцене
 * уйдёт светлее образца. Приёмка сверяет материал с hex, переведённым
 * своей формулой.
 *
 * Под фото цвет белый: текстура несёт цвет сама, а подмешанный цвет
 * позиции затемнил бы её.
 */
export function applyFrontLook(
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  spec: FrontSpec,
  fallbackColor: string,
  finishes: Record<string, FinishSpec>,
  withPhoto = false,
): void {
  material.color.set(withPhoto ? '#ffffff' : frontColor(spec, fallbackColor));
  const look = frontLookOf(spec, finishes);
  material.roughness = look.roughness;
  material.metalness = look.metalness;
  if (material instanceof THREE.MeshPhysicalMaterial) {
    material.clearcoat = look.clearcoat;
    material.clearcoatRoughness = look.clearcoatRoughness;
  }
}
