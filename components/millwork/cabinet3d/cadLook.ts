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

/** Свет ровно два: общий и один направленный (ловушка 299: без бликов). */
export const CAD_LIGHT = {
  ambient: 0.72,
  keyPosition: [2.5, 5, 4] as [number, number, number],
  keyIntensity: 0.85,
};

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
