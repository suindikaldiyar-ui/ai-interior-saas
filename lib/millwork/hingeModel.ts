import type { HardwareItem } from '@/types/catalog';
import { hingeCupOf, plateHolesOf } from './hingePlace';

/**
 * МОДЕЛЬ ПЕТЛИ ДЛЯ СЦЕНЫ (HW-03) — из паспорта позиции, без three.
 *
 * Из паспорта: диаметр и глубина чашки, ширина фланца (FLB, где напечатана),
 * межосевое и отступ отверстий планки. Плечо, корпус шарнира и звенья в
 * паспортах не образмерены — их размеры условные и названы в `conditional`.
 * Поэтому статус не выше VISUAL_RECONSTRUCTION: это изображение узла по
 * размерам паспорта, а не CAD производителя.
 */

export type HingeModelStatus = 'VISUAL_RECONSTRUCTION' | 'VISUAL_APPROXIMATION';

export type HingeModel = {
  /** Ключ сетки: одинаковые петли — одна сетка. */
  key: string;
  article: string | null;
  cupDiameterMm: number;
  cupDepthMm: number;
  flangeWidthMm: number;
  plateSpacingMm: number;
  plateFromEdgeMm: number;
  status: HingeModelStatus;
  /** Что условно — словами. */
  conditional: string[];
};

export function hingeModelOf(hinge: HardwareItem | null | undefined, plate: HardwareItem | null | undefined): HingeModel {
  const conditional: string[] = ['плечо, корпус шарнира и звенья — условные: в паспорте не образмерены'];
  /* Только размеры для подбора: их несёт и лёгкая запись Studio (см. `hingePlace`). */
  const cup = hingeCupOf(hinge);
  const flbMm = hinge?.hardware.dimensionsMm?.flangeWidth;
  const flb = typeof flbMm === 'number' && Number.isFinite(flbMm) ? flbMm : null;
  const holes = plateHolesOf(plate);
  const cupDiameterMm = cup?.diameterMm ?? 35;
  if (!cup?.diameterMm) conditional.push('чашка Ø35 — условно (отраслевой размер, паспорта нет)');
  const cupDepthMm = cup?.depthMm ?? 12;
  if (!cup?.depthMm) conditional.push('глубина чашки 12 мм — условно');
  const flangeWidthMm = flb ?? 50;
  if (flb === null) conditional.push('ширина фланца 50 мм — условно (FLB в паспорте не напечатана)');
  const plateSpacingMm = holes?.spacing ?? 32;
  const plateFromEdgeMm = holes?.fromEdge ?? 37;
  if (!holes) conditional.push('планка 32 / 37 мм — условно (планка не выбрана или её отверстия не разобраны)');
  const article = hinge?.hardware.manufacturerArticle ?? null;
  return {
    key: `hinge:${cupDiameterMm}:${cupDepthMm}:${flangeWidthMm}:${plateSpacingMm}:${plateFromEdgeMm}`,
    article,
    cupDiameterMm,
    cupDepthMm,
    flangeWidthMm,
    plateSpacingMm,
    plateFromEdgeMm,
    status: hinge ? 'VISUAL_RECONSTRUCTION' : 'VISUAL_APPROXIMATION',
    conditional,
  };
}

/**
 * ЧАСТИ ПЕТЛИ В ЛОКАЛЬНЫХ ММ: начало — ось чашки на тыльной плоскости
 * фасада; +X — от петельной кромки внутрь фасада, +Y — вверх, +Z — в фасад
 * (к лицу), −Z — в корпус. `sideInnerXMm` — внутренняя плоскость боковины в
 * этих осях (отрицательная: боковина ближе к кромке, чем чашка).
 */
export type HingeBox = { min: [number, number, number]; max: [number, number, number] };
export type HingeLink = { fixed: [number, number, number]; moving: [number, number, number]; widthMm: number };

export type HingeParts = {
  /** Едет с фасадом: чашка (цилиндр), фланец, корпус шарнира. */
  cup: { center: [number, number]; radius: number; depth: number };
  cupBoxes: HingeBox[];
  /** Стоит на боковине: планка и плечо. */
  armBoxes: HingeBox[];
  /** Звенья: от плеча (неподвижная точка) к корпусу шарнира (едет с фасадом). */
  links: HingeLink[];
};

export function hingeParts(model: HingeModel, sideInnerXMm: number): HingeParts {
  const r = model.cupDiameterMm / 2;
  const flangeH = model.flangeWidthMm / 2;
  const knuckleX: [number, number] = [-r - 3, -r + 9];
  const plateHalf = model.plateSpacingMm / 2 + 9;
  const plateZ = -model.plateFromEdgeMm;
  const plateFace = Math.min(sideInnerXMm, -1);
  return {
    cup: { center: [0, 0], radius: r, depth: model.cupDepthMm },
    cupBoxes: [
      /* Фланец заподлицо с тылом фасада. */
      { min: [-r * 0.85, -flangeH, -1.5], max: [r * 0.75, flangeH, 0] },
      /* Корпус шарнира — выступ из чашки в корпус шкафа. */
      { min: [knuckleX[0], -9, -11], max: [knuckleX[1], 9, -1.5] },
    ],
    armBoxes: [
      /* Планка на внутренней плоскости боковины, ось — на оси чашки. */
      { min: [plateFace, -plateHalf, plateZ - 16], max: [plateFace + 4, plateHalf, plateZ + 16] },
      /* Плечо: от планки к корпусу шарнира, вдоль боковины. */
      { min: [plateFace + 4, -8, plateZ - 12], max: [plateFace + 12, 8, -16] },
    ],
    links: [
      { fixed: [plateFace + 8, 5, -16], moving: [knuckleX[0] + 2, 5, -9], widthMm: 4 },
      { fixed: [plateFace + 8, -5, -16], moving: [knuckleX[1] - 2, -5, -9], widthMm: 4 },
    ],
  };
}
