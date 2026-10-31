import type { HardwareItem } from '@/types/catalog';
import { hingeBoringMm } from './fittings';

/**
 * МЕСТО ПЕТЛИ НА ФАСАДЕ — ОДИН РАСЧЁТ НА СЦЕНУ И ПРИСАДКУ (HW-03 / HW-08).
 *
 * Ось чашки от петельной кромки = TB по таблице наложения паспорта с
 * выбранной планкой плюс радиус чашки (`hingeBoringMm`). Петли нет или TB
 * не получается — у сцены условный отступ картинки (`HINGE_IMAGE_EDGE_MM`),
 * и это сказано: по нему не сверлят (присадка такой петли не ставит).
 *
 * Высоты — по правилу цеха «от края фасада до оси крайней чашки»; правила
 * нет — сцена раскладывает петли поровну по полотну (картинка), присадка
 * их не ставит.
 */

/*
 * Числа берутся из размеров для подбора (`dimensionsMm`): их несёт и лёгкая
 * запись Studio, и паспорт. Строку присадки паспорта в эти имена разбирает
 * свод фактов (`hardware-facts.mjs`) — второго разбора здесь нет, иначе
 * сцена по лёгкой записи и присадка по паспорту поставили бы петлю по-разному.
 */
const dimOf = (item: HardwareItem | null | undefined, key: string): number | null => {
  const v = item?.hardware.dimensionsMm?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** Отверстия планки: межосевое и отступ от передней кромки. Не напечатано — null. */
export function plateHolesOf(plate: HardwareItem | null | undefined): { spacing: number; fromEdge: number } | null {
  const spacing = dimOf(plate, 'plateHoleSpacing');
  const fromEdge = dimOf(plate, 'plateHoleFromEdge');
  return spacing !== null && fromEdge !== null ? { spacing, fromEdge } : null;
}

/** Чашка петли: диаметр и глубина сверления. Не напечатано — null. */
export function hingeCupOf(hinge: HardwareItem | null | undefined): { diameterMm: number | null; depthMm: number | null } {
  return { diameterMm: dimOf(hinge, 'cupDiameter'), depthMm: dimOf(hinge, 'cupDepth') };
}

/** Условный отступ картинки: ⌀35 / 2 плюс типовой зазор. Не присадка. */
export const HINGE_IMAGE_EDGE_MM = 22;

export type CupPlace = { fromEdgeMm: number; diameterMm: number; depthMm: number; passport: boolean };

export function hingeCupPlace(
  production: { carcassMm: number; frontGapMm: number },
  hinge: HardwareItem | null | undefined,
  plate: HardwareItem | null | undefined,
): CupPlace {
  const cup = hingeCupOf(hinge);
  const tb = hinge ? hingeBoringMm({ carcassMm: production.carcassMm, gapMm: production.frontGapMm }, hinge, plate ?? null) : null;
  if (cup.diameterMm !== null && tb !== null) {
    return { fromEdgeMm: Math.round((tb + cup.diameterMm / 2) * 10) / 10, diameterMm: cup.diameterMm, depthMm: cup.depthMm ?? 12, passport: true };
  }
  return { fromEdgeMm: HINGE_IMAGE_EDGE_MM, diameterMm: cup.diameterMm ?? 35, depthMm: cup.depthMm ?? 12, passport: false };
}

/**
 * Оси чашек по длине полотна (от его нижнего торца), мм. `edgeMm` —
 * правило цеха; нет — поровну по полотну (так сцена рисовала всегда).
 */
export function hingeHeightsMm(lengthMm: number, count: number, edgeMm: number | null): number[] {
  if (count <= 0) return [];
  if (edgeMm === null) return Array.from({ length: count }, (_, i) => (lengthMm * (i + 1)) / (count + 1));
  if (count === 1) return [lengthMm / 2];
  return Array.from({ length: count }, (_, i) => edgeMm + ((lengthMm - 2 * edgeMm) * i) / (count - 1));
}
