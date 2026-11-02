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
  return hingeHeightsByRule(lengthMm, count, edgeMm);
}

/**
 * СВОИ ВЫСОТЫ ПЕТЕЛЬ — ВСТАЮТ ЛИ (фаза 2). Только физика узла, без выдуманных отступов: чашка целиком на
 * двери; чашки не друг на друге; планка на боковине не в полке (ось петли в корпусе — от низа корпуса через
 * половину зазора фасада). Петель не меньше двух. Отказ — словами с мм; `null` — встают.
 */
export function hingeAtRefusal(input: {
  heightsMm: number[];
  leafHeightMm: number;
  cupDiameterMm: number | null;
  shelvesMm: number[];
  carcassMm: number;
  gapMm: number;
  label: string;
}): string | null {
  const { heightsMm, leafHeightMm, carcassMm, gapMm, label } = input;
  const cup = input.cupDiameterMm ?? 35;
  const r = cup / 2;
  const cupWords = input.cupDiameterMm === null ? `Ø${cup} условно (чашка позиции не напечатана)` : `Ø${cup}`;
  if (heightsMm.length < 2) return `«${label}»: на одной петле створка проворачивается — петель нужно не меньше двух.`;
  const sorted = [...heightsMm].sort((a, b) => a - b);
  for (const h of sorted) {
    if (!Number.isFinite(h) || h - r < 0) return `«${label}»: петля на ${h} мм — чашка ${cupWords} выходит за низ двери на ${Math.round((r - h) * 10) / 10} мм.`;
    if (h + r > leafHeightMm) return `«${label}»: петля на ${h} мм — чашка ${cupWords} выходит за верх двери (${leafHeightMm} мм) на ${Math.round((h + r - leafHeightMm) * 10) / 10} мм.`;
  }
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - sorted[i - 1] < cup) return `«${label}»: петли на ${sorted[i - 1]} и ${sorted[i]} мм — чашки ${cupWords} заходят друг на друга: между осями нужно не меньше ${cup} мм.`;
  }
  for (const h of sorted) {
    const axis = gapMm / 2 + h;
    for (const shelf of input.shelvesMm) {
      const near = Math.abs(axis - shelf) - (carcassMm + r);
      if (near < 0) return `«${label}»: петля на ${h} мм — её узел на боковине встаёт в полку на ${shelf} мм (заход ${Math.round(-near * 10) / 10} мм). Сдвиньте петлю или полку.`;
    }
  }
  return null;
}

function hingeHeightsByRule(lengthMm: number, count: number, edgeMm: number | null): number[] {
  if (count <= 0) return [];
  if (edgeMm === null) return Array.from({ length: count }, (_, i) => (lengthMm * (i + 1)) / (count + 1));
  if (count === 1) return [lengthMm / 2];
  return Array.from({ length: count }, (_, i) => edgeMm + ((lengthMm - 2 * edgeMm) * i) / (count - 1));
}
