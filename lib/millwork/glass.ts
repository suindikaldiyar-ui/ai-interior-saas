/**
 * СТЕКЛО ВИТРИН (V3D-02) — ВИДЫ, ГДЕ ОНО ЕСТЬ, КАК ЕГО СЧИТАЕТ СМЕТА.
 *
 * Стекло рисуется там, где оно есть в изделии: дверь витрины в раме
 * (секция `glass_display` — стекло строкой `glass_front`, фасада ЛДСП у неё
 * нет) и окна рамы витрины KIRA (рама — на варианте со стеклом, ловушка
 * 562). Вид стекла лежит на модуле (`Module.glass`); у глухой двери его
 * поставить нельзя — отказ словами, а не стекло, которого никто не оплатил.
 */
import type { GlassKind, Module, Run } from '@/types/millwork';
import { designHasCut } from './reliefDesign';
import { frontWithMilling, leafFrontWithMilling } from './milling';

export const GLASS_KINDS: readonly GlassKind[] = ['clear', 'frosted', 'bronze', 'grey', 'fluted', 'mirror'];

export const GLASS_TITLE: Record<GlassKind, string> = {
  clear: 'Прозрачное',
  frosted: 'Матовое',
  bronze: 'Бронзовое',
  grey: 'Серое тонированное',
  fluted: 'Рифлёное',
  mirror: 'Зеркало',
};

/** Род. падеж — для строки сметы: «Стеклянная дверь в раме — бронзовое стекло». */
const GLASS_LINE: Record<Exclude<GlassKind, 'clear'>, string> = {
  frosted: 'матовое стекло',
  bronze: 'бронзовое стекло',
  grey: 'серое тонированное стекло',
  fluted: 'рифлёное стекло',
  mirror: 'зеркало',
};

/** Вид стекла модуля: не выбран — прозрачное. */
export const glassOf = (unit: Pick<Module, 'glass'>): GlassKind => unit.glass ?? 'clear';

/**
 * ЕСТЬ ЛИ У МОДУЛЯ СТЕКЛО В СЦЕНЕ — витрина в раме либо рама KIRA со
 * сквозными окнами на модульном фасаде или на фасаде створки (фрезеровка
 * ряда учитывается: `frontWithMilling`).
 */
export function moduleShowsGlass(unit: Module, run: Pick<Run, 'milling'> | undefined): boolean {
  if (unit.section === 'glass_display') return true;
  const shell = { milling: run?.milling } as Pick<Run, 'milling'>;
  const relief = frontWithMilling(unit, shell).relief;
  if (relief?.kind === 'design' && designHasCut(relief.design)) return true;
  for (const leaf of Object.keys(unit.leafFronts ?? {})) {
    const own = leafFrontWithMilling(unit, leaf, shell).relief;
    if (own?.kind === 'design' && designHasCut(own.design)) return true;
  }
  return false;
}

/**
 * ПОЛКИ ЭТОГО МОДУЛЯ — СТЕКЛО: выбор человека и нет отсеков. Одна функция
 * на раскрой, смету, отпечаток и сцену: у модуля с отсеками полки режутся по
 * отсекам, и поле там не действует — это сказано словами в панели.
 */
export const shelvesAreGlass = (unit: Pick<Module, 'glassShelves' | 'fill'>): boolean =>
  unit.glassShelves === true && !unit.fill?.bays;

/** Толщина стеклянной полки В СЦЕНЕ, мм — VISUAL_ONLY: толщины стекла цех не давал. */
export const GLASS_SHELF_MM = 6;

/** Почему стеклянные полки не ставятся — словами; `null` — ставятся. */
export function glassShelvesRefusal(unit: Module, run: Pick<Run, 'milling'> | undefined): string | null {
  if (!moduleShowsGlass(unit, run)) {
    return `«${unit.label}»: стеклянные полки — у витрины: у модуля без стекла полки остаются из ЛДСП.`;
  }
  if (unit.fill?.bays) {
    return `«${unit.label}»: у модуля отсеки — полки режутся по отсекам, стеклянные сюда не ставятся.`;
  }
  if ((unit.fill?.shelves.length ?? 0) === 0) return `«${unit.label}»: у модуля нет полок.`;
  return null;
}

/** Строка сметы стеклянных полок: своя ставка `glass_shelf`; нет её — «цена не задана». */
export const GLASS_SHELF_LINE = {
  key: 'glass_shelf',
  unsetWithoutRate: 'цена: стеклянная полка — в каталоге организации ставки нет (ключ glass_shelf)',
} as const;

/** Почему вид стекла не ставится — словами; `null` — ставится. */
export function glassRefusal(unit: Module, run: Pick<Run, 'milling'> | undefined): string | null {
  if (moduleShowsGlass(unit, run)) return null;
  return `«${unit.label}»: стекла у модуля нет — вид стекла выбирается у витрины в раме или у фасада с рамой витрины.`;
}

/**
 * СТРОКА СМЕТЫ СТЕКЛА: прозрачное — прежняя статья `glass_front`, другой вид —
 * своя статья `glass_front_<вид>` со своей ценой из каталога организации.
 * Нет цены вида — «цена не задана», а не цена прозрачного.
 */
export function glassLine(kind: GlassKind): { key: string; suffix: string; unsetWithoutRate?: string } {
  if (kind === 'clear') return { key: 'glass_front', suffix: '' };
  return {
    key: `glass_front_${kind}`,
    suffix: ` — ${GLASS_LINE[kind]}`,
    unsetWithoutRate: `цена: ${GLASS_LINE[kind]} — в каталоге организации ставки нет (ключ glass_front_${kind})`,
  };
}
