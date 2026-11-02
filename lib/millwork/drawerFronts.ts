import type { HardwareItem, ProductionSettings } from '@/types/catalog';
import type { Module, ModuleFill, Run } from '@/types/millwork';
import { MIN_DRAWER_MM, moduleCarcassHeightMm } from './fill';
import { drawerZoneNeedMm, innerSystemWords, moduleDrawerKits, type DrawerKit } from './drawerKit';
import {
  DRAWER_INSERT_TITLE,
  drawerCellZones,
  drawerCells,
  drawerFrontCutMm,
  drawerInnerZones,
  drawerInnersRefusal,
  drawerInsertsRefusal,
  drawerSplitRefusal,
  insertWords,
  type DrawerInsertKind,
} from './drawerGrid';
import { handleItemOf } from './fittings';
import { frontTitle, leafFrontOf } from './frontMaterial';
import { HANDLE_TITLE, handleOf, milledGrip } from './opening';
import { shopOf } from './shop';

/**
 * ФАСАДЫ ЯЩИКОВ НА ВСЮ ШИРИНУ — РЕДАКТОР (ТЗ 2026-11-02, «PROFESSIONAL DRAWERS», A2–A3).
 *
 * Канон один — `fill.drawerHeights`: МЕСТА фасадов сверху вниз, сумма равна высоте
 * корпуса (ловушка 83). Здесь нет ни второго списка высот, ни своей арифметики
 * детали: деталь — место минус зазор цеха (`drawerFrontCutMm`, её же зовёт раскрой),
 * зона короба — `drawerCellZones` через `moduleDrawerKits`, минимум системы ящика —
 * `drawerZoneNeedMm` того же комплекта.
 *
 * Высота, которую вводит человек, — высота ДЕТАЛИ (то, что режет цех и видит
 * клиент); место = деталь + зазор. Закреплённые (`fill.drawerLocked`) перераспределение
 * не трогает; общую высоту модуля редактор не меняет никогда.
 */

export { drawerFrontCutMm } from './drawerGrid';

/** Закрепления по длине фасадов: чужая длина (старые данные, правка числа) не тянет мусор. */
export function drawerLocksOf(fill: Pick<ModuleFill, 'drawerHeights' | 'drawerLocked'> | undefined): boolean[] {
  const n = fill?.drawerHeights.length ?? 0;
  return Array.from({ length: n }, (_, i) => fill?.drawerLocked?.[i] === true);
}

/** Пустое закрепление не пишется: наполнение без закреплений — без поля (ловушка 246). */
export function withDrawerFronts(fill: ModuleFill, heights: number[], locked: boolean[]): ModuleFill {
  const { drawerLocked: _drop, ...rest } = fill;
  void _drop;
  return locked.some(Boolean) ? { ...rest, drawerHeights: heights, drawerLocked: locked } : { ...rest, drawerHeights: heights };
}

export type DrawerFrontsResult = { heights: number[]; locked: boolean[] } | { refusal: string };

/** Свободная высота — поровну незакреплённым; остаток деления — нижнему из них (он самый большой, как в раскладке). */
function spreadFree(heights: number[], locked: boolean[], totalMm: number, keep: Set<number>): DrawerFrontsResult {
  const fixedSum = heights.reduce((sum, h, i) => sum + (locked[i] || keep.has(i) ? h : 0), 0);
  const free = heights.map((_, i) => i).filter((i) => !locked[i] && !keep.has(i));
  const freeMm = totalMm - fixedSum;
  if (free.length === 0) {
    if (freeMm === 0) return { heights, locked };
    return {
      refusal:
        `Разницу ${Math.abs(freeMm)} мм некуда отдать: все остальные фасады закреплены. ` +
        'Снимите закрепление с фасада, который может стать ' + (freeMm > 0 ? 'выше.' : 'ниже.'),
    };
  }
  const each = Math.floor(freeMm / free.length);
  const next = [...heights];
  for (const i of free) next[i] = each;
  next[free[free.length - 1]] += freeMm - each * free.length;
  return { heights: next, locked };
}

/**
 * «ОСТАТОК АВТОМАТИЧЕСКИ»: фасад `index` получает место `slotMm` и закрепляется (его
 * размер задал человек), свободная высота корпуса — поровну незакреплённым.
 */
export function resizeDrawerFront(heights: number[], locked: boolean[], index: number, slotMm: number, totalMm: number): DrawerFrontsResult {
  if (!Number.isInteger(slotMm)) return { refusal: `Высота фасада — целые миллиметры: ${slotMm} мм не режется.` };
  if (index < 0 || index >= heights.length) return { refusal: `Фасада ${index + 1} у модуля нет.` };
  const next = [...heights];
  next[index] = slotMm;
  const lock = [...locked];
  lock[index] = true;
  return spreadFree(next, lock, totalMm, new Set([index]));
}

/** «РАВНОМЕРНО»: все фасады одной высоты; остаток деления — нижнему. Закрепления снимаются. */
export function evenDrawerFronts(count: number, totalMm: number): { heights: number[]; locked: boolean[] } {
  const each = Math.floor(totalMm / count);
  const heights = Array.from({ length: count }, () => each);
  heights[count - 1] += totalMm - each * count;
  return { heights, locked: heights.map(() => false) };
}

/**
 * «ПРОПОРЦИОНАЛЬНО»: места по долям («1 : 2 : 2»), округление вниз, остаток — нижнему.
 * Доли — числа больше нуля, по одной на фасад. Закрепления снимаются.
 */
export function proportionalDrawerFronts(shares: number[], totalMm: number): DrawerFrontsResult {
  if (shares.length === 0) return { refusal: 'Нужна хотя бы одна доля.' };
  if (shares.some((s) => !Number.isFinite(s) || s <= 0)) return { refusal: 'Доли — числа больше нуля, по одной на фасад: например «1 : 2 : 2».' };
  const sum = shares.reduce((a, b) => a + b, 0);
  const heights = shares.map((s) => Math.floor((totalMm * s) / sum));
  heights[heights.length - 1] += totalMm - heights.reduce((a, b) => a + b, 0);
  return { heights, locked: heights.map(() => false) };
}

/** Разбор долей из строки: «1:2:2», «1 2 2», «1, 2, 2». */
export function parseShares(text: string): number[] {
  return text
    .split(/[\s:;,]+/)
    .filter((part) => part.length > 0)
    .map((part) => Number(part.replace(',', '.')));
}

/**
 * ДРУГОЕ ЧИСЛО ЯЩИКОВ без потери правок: закреплённые фасады стоят на своих местах (те,
 * что выше нового числа, уходят — это сказано словами), свободная высота — поровну
 * остальным.
 */
export function recountDrawerFronts(
  heights: number[],
  locked: boolean[],
  count: number,
  totalMm: number,
): (DrawerFrontsResult & { dropped?: number[] }) {
  if (!Number.isInteger(count) || count < 1) return { refusal: 'Ящиков — целое число от одного.' };
  const kept = Array.from({ length: count }, (_, i) => (i < heights.length ? heights[i] : 0));
  const lock = Array.from({ length: count }, (_, i) => i < locked.length && locked[i] === true);
  const dropped = locked.map((l, i) => (l && i >= count ? i : -1)).filter((i) => i >= 0);
  const result = spreadFree(kept, lock, totalMm, new Set());
  return 'refusal' in result ? result : { ...result, ...(dropped.length ? { dropped } : {}) };
}

/* ─────────────────────────  Минимумы и отказ  ───────────────────────── */

export type DrawerSlotMin = {
  /** Наименьшее место РЯДА, мм. */
  minSlotMm: number;
  /** Почему: «ящик ниже 100 мм места не делают» или «царга 83,6 мм + зазор снизу 10 мм и 16 мм крыши корпуса». */
  why: string;
};

/**
 * НАИМЕНЬШЕЕ МЕСТО КАЖДОГО РЯДА: продуктовый минимум ящика (`MIN_DRAWER_MM`) и короб системы, если
 * комплект рассчитан, — зона короба (`drawerZoneNeedMm`) плюс то, что у места срезают дно, крыша и
 * перемычка. Срезанное считает та же `drawerCellZones`, по которой ставит короб комплект: второй
 * формулы «сколько съело дно» нет. У разделённого ряда — наибольшее из его ячеек.
 */
export function drawerSlotMinimums(unit: Module, kits: DrawerKit[], carcassMm: number, thicknessMm: number): DrawerSlotMin[] {
  const rows = unit.fill?.drawerHeights.length ?? 0;
  const zones = drawerCellZones(unit, carcassMm, thicknessMm);
  return Array.from({ length: rows }, (_, row) => {
    let best: DrawerSlotMin = { minSlotMm: MIN_DRAWER_MM, why: `ящик ниже ${MIN_DRAWER_MM} мм места не делают` };
    for (const zone of zones.filter((z) => z.cell.row === row)) {
      const kit = kits.find((k) => k.place.key === `${unit.id}:${zone.cell.leaf}`);
      const profile = kit?.profile;
      if (!profile) continue;
      const need = drawerZoneNeedMm(profile);
      const clip = zone.cell.heightMm - (zone.toMm - zone.fromMm);
      /* Царге системы зоны хватает и ровно впритык; коробу цеха нужно больше его зазоров. */
      const minSlot = profile.system ? Math.ceil(need + clip) : Math.floor(need + clip) + 1;
      if (minSlot <= best.minSlotMm) continue;
      const what = profile.system
        ? `царга ${tenth(profile.system.sideHeightMm)} мм + зазор снизу ${tenth(profile.gapBelowMm ?? 0)} мм`
        : `зазоры короба цеха ${tenth(need)} мм`;
      best = { minSlotMm: minSlot, why: `${what}${clip > 0 ? ` и ${tenth(clip)} мм корпуса (дно, крыша или перемычка)` : ''}` };
    }
    return best;
  });
}

function tenth(mm: number): string {
  return String(Math.round(mm * 10) / 10).replace('.', ',');
}

/** «Фасад 2» у ряда из одного фасада, «Ряд 1 (фасады 1 и 2)» у разделённого. */
function rowWords(unit: Module, row: number): string {
  const cells = drawerCells(unit.fill, unit.widthMm, 0).filter((c) => c.row === row);
  return cells.length > 1 ? `Ряд ${row + 1} (фасады ${cells.map((c) => c.index + 1).join(' и ')})` : `Фасад ${(cells[0]?.index ?? row) + 1}`;
}

/**
 * ОТКАЗ РАСКЛАДКИ — словами с миллиметрами ДЕТАЛИ (её видит человек): сумма мест — высота корпуса;
 * каждое ИЗМЕНЁННОЕ место — не меньше своего минимума (проверяется вносимое, как у полок:
 * `fillRefusal`).
 */
export function drawerFrontsRefusal(
  unit: Module,
  heights: number[],
  previous: number[] | undefined,
  totalMm: number,
  mins: DrawerSlotMin[],
  gapMm: number,
): string | null {
  const sum = heights.reduce((a, b) => a + b, 0);
  if (sum !== totalMm) {
    return `Места фасадов дают ${sum} мм вместо ${totalMm} мм высоты корпуса — ${sum > totalMm ? 'лишние' : 'не хватает'} ${Math.abs(sum - totalMm)} мм.`;
  }
  for (let i = 0; i < heights.length; i += 1) {
    if (previous && previous.length === heights.length && previous[i] === heights[i]) continue;
    const words = drawerRowMinRefusal(unit, i, heights[i], mins[i], gapMm);
    if (words) return words;
  }
  return null;
}

/**
 * МЕСТО РЯДА МЕНЬШЕ СВОЕГО МИНИМУМА — словами детали. Одна формулировка на отказ движка и на
 * редактор: он спрашивает её ПЕРВОЙ, до перераспределения, — введённое число и есть причина.
 */
export function drawerRowMinRefusal(unit: Module, row: number, slotMm: number, min: DrawerSlotMin | undefined, gapMm: number): string | null {
  const need = min ?? { minSlotMm: MIN_DRAWER_MM, why: `ящик ниже ${MIN_DRAWER_MM} мм места не делают` };
  if (slotMm >= need.minSlotMm) return null;
  return (
    `${rowWords(unit, row)} вышел бы ${slotMm - gapMm} мм, а нужно от ${need.minSlotMm - gapMm} мм (${need.why}) — ` +
    `не хватает ${need.minSlotMm - slotMm} мм.`
  );
}

/**
 * ОТКАЗ ДВИЖКА ДЛЯ `set_fill` / `set_fronts`: минимумы — по комплектам ящиков модуля с ЭТИМИ местами
 * (короб системы ящика считается от зоны), отказ — словами детали; деление — `drawerSplitRefusal`.
 */
export function drawerHeightsRefusal(
  unit: Module,
  heights: number[],
  previous: number[] | undefined,
  run: Run,
  hardware?: Map<string, HardwareItem>,
  /**
   * Наполнение ПОСЛЕ правки — целиком (деление, внутренние ящики, вставки): проверяется то, что
   * правка вносит, а не то, что лежит на модуле. Пусто — прежнее наполнение с новыми местами.
   */
  next?: ModuleFill,
): string | null {
  if (heights.length === 0) return null;
  const production = shopOf(run.production);
  const totalMm = Math.round(moduleCarcassHeightMm(unit, run));
  const fill: ModuleFill = { ...(next ?? unit.fill ?? emptyFill()), drawerHeights: heights };
  const splitWords = drawerSplitRefusal(fill, unit, production.carcassMm);
  if (splitWords) return splitWords;
  /*
   * ВНУТРЕННИЕ ЯЩИКИ И ВСТАВКИ (A6) — при новом числе ящиков или новых местах: ящик, на котором они
   * стоят, уходит — отказ словами (потеря называется ДО правки, а не случается молча).
   */
  const cellsN = drawerCells(fill, unit.widthMm, totalMm).length;
  for (const entry of fill.drawerInners ?? []) {
    if (entry.cell >= cellsN) return `Ящик ${entry.cell + 1} с внутренними ящиками при ${cellsN} ящиках уходит — сначала снимите внутренние ящики.`;
  }
  for (const leaf of Object.keys(fill.drawerInserts ?? {})) {
    const k = Number(/^i?drawer:(\d+)/.exec(leaf)?.[1] ?? -1);
    if (k >= cellsN) return `Ящик ${k + 1} со вставкой при ${cellsN} ящиках уходит — сначала снимите вставку.`;
  }
  const innerWords = drawerInnersRefusal(fill, unit, totalMm, production.carcassMm) ?? drawerInsertsRefusal(fill, unit, totalMm, production.carcassMm);
  if (innerWords) return innerWords;
  const probe: Module = { ...unit, fill };
  const kits = moduleDrawerKits(probe, run, production, hardware);
  return drawerFrontsRefusal(probe, heights, previous, totalMm, drawerSlotMinimums(probe, kits, totalMm, production.carcassMm), production.frontGapMm);
}

function emptyFill(): ModuleFill {
  return { shelves: [], dividerMm: 0, rodsMm: [], drawerHeights: [], hinge: 'none' };
}

/** Деление ряда на столбцы: пусто (`rows` 0) — снять; иначе — верхние `rows` рядов, левый столбец `leftMm`. */
export function withDrawerSplit(fill: ModuleFill, rows: number, leftMm: number): ModuleFill {
  const { drawerSplit: _drop, ...rest } = fill;
  void _drop;
  return rows > 0 ? { ...rest, drawerSplit: { leftMm, rows } } : rest;
}

/** Внутренние ящики ячейки: пусто — снять; иначе — зоны сверху вниз. */
export function withDrawerInners(fill: ModuleFill, cell: number, heightsMm: number[]): ModuleFill {
  const rest = (fill.drawerInners ?? []).filter((entry) => entry.cell !== cell);
  const next = heightsMm.length > 0 ? [...rest, { cell, heightsMm }].sort((a, b) => a.cell - b.cell) : rest;
  const { drawerInners: _drop, ...base } = fill;
  void _drop;
  return next.length > 0 ? { ...base, drawerInners: next } : base;
}

/** Вставка в ящик `leaf`: `null` — снять. */
export function withDrawerInsert(fill: ModuleFill, leaf: string, insert: { kind: DrawerInsertKind; sections?: number } | null): ModuleFill {
  const next = { ...(fill.drawerInserts ?? {}) };
  if (insert) next[leaf] = insert;
  else delete next[leaf];
  const { drawerInserts: _drop, ...base } = fill;
  void _drop;
  return Object.keys(next).length > 0 ? { ...base, drawerInserts: next } : base;
}

/* ─────────────────────────  Таблица редактора  ───────────────────────── */

export type DrawerFrontRow = {
  /** Номер фасада (ячейки) и его ряд. */
  index: number;
  row: number;
  column: 0 | 1;
  columns: 1 | 2;
  /** Деталь фасада так, как её зовут сцена, раскрой и смета: `drawer:<k>`. */
  leaf: string;
  /** Место по корпусу (ряда — по высоте, ячейки — по ширине) и деталь, мм. */
  slotMm: number;
  slotWidthMm: number;
  heightMm: number;
  widthMm: number;
  /** Левый нижний угол детали: от левого края модуля и от низа корпуса, мм. */
  xMm: number;
  yMm: number;
  material: string;
  thicknessMm: number;
  handle: string;
  /** Ящик за фасадом: короб рассчитан (и чем) или черновик с причиной. */
  drawer: string;
  drawerReady: boolean;
  locked: boolean;
  min: DrawerSlotMin;
  /** Внутренние ящики за этим фасадом (A6): зона и короб словами. */
  inners: { leaf: string; zoneMm: number; drawer: string; ready: boolean }[];
  /** Вставка в этот ящик и её слова (визуальный прототип). */
  insert: { kind: DrawerInsertKind; sections?: number; words: string } | null;
};

/** Фасады ящиков модуля для таблицы — числами того же раскроя, той же сцены и того же комплекта. */
export function drawerFrontRows(
  unit: Module,
  run: Run,
  production: ProductionSettings = shopOf(run.production),
  hardware?: Map<string, HardwareItem>,
): DrawerFrontRow[] {
  const heights = unit.column ? [] : (unit.fill?.drawerHeights ?? []);
  if (heights.length === 0) return [];
  const gap = production.frontGapMm;
  const totalMm = Math.round(moduleCarcassHeightMm(unit, run));
  const kits = moduleDrawerKits(unit, run, production, hardware);
  const mins = drawerSlotMinimums(unit, kits, totalMm, production.carcassMm);
  const locks = drawerLocksOf(unit.fill);
  const kind = handleOf(unit, run);
  return drawerCells(unit.fill, unit.widthMm, totalMm).map((cell) => {
    const leaf = cell.leaf;
    const cut = drawerFrontCutMm(cell.heightMm, cell.widthMm, gap);
    const kit = kits.find((k) => k.place.key === `${unit.id}:${leaf}`);
    const item = handleItemOf(unit, leaf, hardware);
    const handle = milledGrip(unit, leaf)
      ? 'интегрированная (фрезеровка фасада)'
      : kind.handle !== 'bar'
        ? HANDLE_TITLE[kind.handle]
        : item
          ? `${HANDLE_TITLE.bar} ${item.article}`
          : `${HANDLE_TITLE.bar} условная`;
    const system = kit?.state === 'box' ? kit.profile.system : undefined;
    return {
      index: cell.index,
      row: cell.row,
      column: cell.column,
      columns: cell.columns,
      leaf,
      slotMm: cell.heightMm,
      slotWidthMm: cell.widthMm,
      heightMm: cut.heightMm,
      widthMm: cut.widthMm,
      xMm: cell.xMm + gap / 2,
      yMm: cell.yMm + gap / 2,
      material: frontTitle(leafFrontOf(unit, leaf)),
      thicknessMm: production.frontMm,
      handle,
      drawer: kit
        ? kit.state === 'box'
          ? `короб ${system ? 'системы' : 'ЛДСП'} ${tenth(kit.plan.heightMm)} мм`
          : `черновик: ${kit.missing[0] ?? 'короб не рассчитан'}`
        : 'ящика нет',
      drawerReady: kit?.state === 'box',
      locked: locks[cell.row] ?? false,
      min: mins[cell.row],
      inners: drawerInnerZones(unit, totalMm, production.carcassMm)
        .filter((zone) => zone.cell === cell.index)
        .map((zone) => {
          const inner = kits.find((k) => k.place.key === `${unit.id}:${zone.leaf}`);
          return {
            leaf: zone.leaf,
            zoneMm: zone.toMm - zone.fromMm,
            drawer: inner
              ? inner.state === 'box'
                ? `короб ${inner.profile.system ? 'системы' : 'ЛДСП'} ${tenth(inner.plan.heightMm)} мм${inner.inner ? `: ${innerSystemWords(inner)}` : ''}`
                : `черновик: ${inner.missing[0] ?? 'короб не рассчитан'}`
              : 'ящика нет',
            ready: inner?.state === 'box',
          };
        }),
      insert: (() => {
        const ins = unit.fill?.drawerInserts?.[leaf];
        return ins ? { kind: ins.kind, ...(ins.sections ? { sections: ins.sections } : {}), words: insertWords(ins.kind) } : null;
      })(),
    };
  });
}

export { DRAWER_INSERT_TITLE };
