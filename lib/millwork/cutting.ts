import { DRAWER_FRONT_PANEL_NAME, edgeSides, panelEdgeMm, type EdgeSide, type ObjectPanel } from './panels';
import { finishParams } from './materialFinishes';
import { collectionOf } from './materialCollection';
import { cell, csvFile, type CsvEncoding } from './csv-export';
import type { CatalogEntryFull, CuttingSettings, SheetFormat } from '@/types/catalog';
import type { Panel, PanelStock, StockKind } from '@/types/millwork';

/**
 * КАРТА РАСКРОЯ (CUT-01): детали деталировки на листах цеха.
 *
 * ДЕТАЛИ — ТОЛЬКО ИЗ ДЕТАЛИРОВКИ. Сюда приходит ровно то, что режет
 * `objectPanels` (её же читают таблица, смета и CSV деталировки): размеры,
 * количество, текстура, кромка и лист детали (`Panel.stock`). Своего
 * расчёта деталей здесь нет — ни одного размера, ни одной детали карта не
 * придумывает. Деталь с неположительным размером не раскладывается, а
 * называется: по ней цех распилил бы не то.
 *
 * ЛИСТЫ ДЕЛЯТСЯ ПО ВИДУ ПЛИТЫ, ТОЛЩИНЕ И ДЕКОРУ. H1113 и H1180, ЛДСП 16 и
 * 18 на одном листе не встречаются: ключ группы (`stockKey`) — вид плиты,
 * толщина, декор и поверхность. Формат листа — настройка цеха
 * (`CuttingSettings.sheets`); нет формата — группа не раскладывается, и это
 * сказано словами: лист выбирает человек, код его не подставляет.
 *
 * РАСКЛАДКА — ГИЛЬОТИННАЯ И ДЕТЕРМИНИРОВАННАЯ. Каждый рез идёт через весь
 * кусок, от края до края: такую схему пилит форматно-раскроечный станок.
 * Свободные прямоугольники режутся пропилом цеха; рабочее поле — лист без
 * обрезки по краям. Перебирается конечный набор правил (порядок деталей ×
 * выбор места × направление первого реза), и берётся лучшая раскладка: меньше
 * листов, затем больше полезных остатков. Это эвристика, а не доказанный
 * оптимум, и так и написано на экране. Случайности нет: та же деталировка и
 * те же настройки дают те же листы до миллиметра.
 *
 * ВНУТРИ — ДЕСЯТЫЕ ДОЛИ МИЛЛИМЕТРА. Пропил 4.4 мм — обычное число, и в
 * десятых долях вся арифметика целая: сумма деталей, пропилов и отходов
 * равна рабочему полю точно, без «почти».
 */

const U = 10;

/* ─────────────────────────  Группы листов  ───────────────────────── */

/** Ключ группы листа: вид плиты, толщина, декор и поверхность. Один на раскладку и настройки. */
export function stockKey(stock: PanelStock, thicknessMm: number): string {
  return `${stock.kind}:${thicknessMm}:${stock.decor ?? '-'}${stock.surface ? `~${stock.surface}` : ''}`;
}

/** Ключ формата «для всех листов этого вида и толщины». */
export function stockBaseKey(kind: StockKind, thicknessMm: number): string {
  return `${kind}:${thicknessMm}`;
}

export const STOCK_TITLE: Record<StockKind, string> = {
  ldsp: 'ЛДСП',
  mdf: 'МДФ',
  hdf: 'ХДФ',
  veneer: 'Шпон',
};

/** Классы материалов на экране — в этом порядке. Фанеры в каталоге нет, и класса под неё нет. */
export type StockClass = 'ldsp_egger' | 'ldsp' | 'mdf' | 'hdf' | 'other';
export const STOCK_CLASS_TITLE: Record<StockClass, string> = {
  ldsp_egger: 'ЛДСП EGGER',
  ldsp: 'ЛДСП',
  mdf: 'МДФ',
  hdf: 'ХДФ',
  other: 'Другие листовые материалы',
};
const CLASS_ORDER: StockClass[] = ['ldsp_egger', 'ldsp', 'mdf', 'hdf', 'other'];

/**
 * ТИПОВЫЕ ФОРМАТЫ ЛИСТА — ВЫБОР ЧЕЛОВЕКА, А НЕ УМОЛЧАНИЕ.
 *
 * Кнопки быстрого выбора там, где лист ещё не выбран. В расчёт формат
 * попадает только нажатием: без него группа не раскладывается.
 */
export const TYPICAL_SHEET_FORMATS: Record<StockKind, { lengthMm: number; widthMm: number }[]> = {
  ldsp: [
    { lengthMm: 2800, widthMm: 2070 },
    { lengthMm: 2750, widthMm: 1830 },
  ],
  mdf: [
    { lengthMm: 2800, widthMm: 2070 },
    { lengthMm: 2750, widthMm: 1830 },
    { lengthMm: 2440, widthMm: 1220 },
  ],
  hdf: [
    { lengthMm: 2800, widthMm: 2070 },
    { lengthMm: 2745, widthMm: 1700 },
    { lengthMm: 2440, widthMm: 1220 },
  ],
  veneer: [
    { lengthMm: 2800, widthMm: 2070 },
    { lengthMm: 2440, widthMm: 1220 },
  ],
};

/** Что известно о декоре из каталога организации. */
export type DecorInfo = {
  name: string;
  article: string;
  collection: string | null;
  /**
   * ТЕКСТУРА ДЕКОРА ПО КАТАЛОГУ: группа производителя «Wood», «Feelwood» —
   * древесный рисунок, направление обязательно; «Uni» — однотонный. Нет
   * данных — `null`, и тогда текстура учитывается: так безопаснее.
   */
  texture: 'grain' | 'plain' | null;
  /** Откуда известна текстура — словами. */
  textureSource: string | null;
};

/**
 * ДЕКОРЫ КАТАЛОГА ДЛЯ КАРТЫ: ключ — `item:<id>`, как у листа детали.
 *
 * Название — то же, что пишет деталировка корпуса (имя, иначе артикул),
 * текстура — по группе производителя из `meta.provenance.group`.
 */
export function decorCatalog(entries: CatalogEntryFull[]): Map<string, DecorInfo> {
  const out = new Map<string, DecorInfo>();
  for (const entry of entries) {
    const provenance = (entry.meta as { provenance?: { group?: unknown } } | null | undefined)?.provenance;
    const group = typeof provenance?.group === 'string' ? provenance.group : '';
    const texture = /\bUni\b/i.test(group) ? 'plain' : /Wood|Feelwood/i.test(group) ? 'grain' : null;
    out.set(`item:${entry.id}`, {
      name: entry.name_ru?.trim() || entry.article || entry.id,
      article: entry.article ?? '',
      collection: collectionOf(entry),
      texture,
      textureSource: texture ? `группа каталога «${group}»` : null,
    });
  }
  return out;
}

/* ─────────────────────────  Типы карты  ───────────────────────── */

/** Одна физическая деталь: строка деталировки и её номер экземпляра. */
export type CutPiece = {
  /** Номер на листе и в CSV: «3.2», у строки из нескольких штук — «3.1/2». */
  id: string;
  part: ObjectPanel;
  instance: number;
  lengthMm: number;
  widthMm: number;
  /** Порядок в деталировке — последний ключ всех сортировок. */
  ordinal: number;
};

/** Деталь на листе: угол у начала координат листа и размер вдоль осей листа. */
export type CutPlacement = {
  piece: CutPiece;
  /** X — вдоль длины листа от левого края, Y — поперёк от верхнего, мм. */
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
  /** 0 — длина детали вдоль длины листа, 90 — поперёк. */
  rotation: 0 | 90;
};

/** Рез: продольный идёт вдоль длины листа (линия Y = at), поперечный — поперёк (X = at). */
export type CutLine = {
  n: number;
  direction: 'along' | 'across';
  atMm: number;
  fromMm: number;
  toMm: number;
  /** Сколько сняла пила: пропил, а у самого края куска — сколько там было. */
  kerfMm: number;
  /** Этап реза: смена направления — следующий этап. */
  stage: number;
};

export type CutRect = { xMm: number; yMm: number; wMm: number; hMm: number };

/** Площади листа, мм². Сумма деталей, пропила, обрезки, остатков и отходов — площадь листа, точно. */
export type CutArea = {
  sheetMm2: number;
  partsMm2: number;
  kerfMm2: number;
  trimMm2: number;
  remnantMm2: number;
  scrapMm2: number;
};

export type CutSheet = {
  /** Номер листа по объекту: «Лист 3» — один на экран, PDF и CSV. */
  number: number;
  groupKey: string;
  indexInGroup: number;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  trimMm: number;
  kerfMm: number;
  placements: CutPlacement[];
  cuts: CutLine[];
  remnants: CutRect[];
  scraps: CutRect[];
  area: CutArea;
  /** Доля площади листа под деталями. */
  utilization: number;
};

export type CutGroup = {
  key: string;
  kind: StockKind;
  thicknessMm: number;
  decor: string | null;
  surface?: string;
  cls: StockClass;
  /** «ЛДСП 16 · EGGER-H1113-ST10». */
  title: string;
  decorLabel: string;
  /** Декор не выбран (кроме ХДФ, у которой декор в продукте не выбирается). */
  decorMissing: boolean;
  /** Учитывается текстура: детали с направлением не поворачиваются. */
  grain: boolean;
  grainNote: string;
  format: SheetFormat | null;
  /** Чей формат: этой группы или всех листов вида и толщины. */
  formatScope: 'group' | 'kind' | null;
  pieces: CutPiece[];
  sheets: CutSheet[];
  unplaced: { piece: CutPiece; reason: string }[];
  /** Правило, давшее раскладку, и сколько правил перебрано. */
  heuristic: string | null;
  candidates: number;
  area: CutArea;
  utilization: number;
};

export type CutEdgeTotal = { edgeType: Panel['edgeType']; label: string; meters: number };

export type CuttingPlan = {
  settings: CuttingSettings;
  groups: CutGroup[];
  sheets: CutSheet[];
  /** Деталей деталировки, штук. */
  pieces: number;
  placed: number;
  area: CutArea;
  utilization: number;
  /** Кромка по типам — та же формула, что итоги деталировки (`panelEdgeMm`). */
  edges: CutEdgeTotal[];
  /** Ящиков в деталировке (фронтов ящиков): короба у них в раскрое нет. */
  drawers: number;
  /** Выпуск в цех: открыт или заперт — и почему, словами. */
  release: { ok: boolean; reasons: string[] };
  /** Уточнения: не запирают выпуск, но называют последствие. */
  warnings: string[];
  /** Ошибки проверки раскладки — каждая запирает выпуск. */
  errors: string[];
  /** Подпись раскладки: та же деталировка и те же настройки — та же подпись. */
  signature: string;
  fingerprint: string;
};

/* ─────────────────────────  Текстура и повороты  ───────────────────────── */

/**
 * УЧИТЫВАЕТСЯ ЛИ ТЕКСТУРА ГРУППЫ — и почему.
 *
 * Человек сильнее каталога: «однотонный» или «учитывать» на группе — его
 * слово. Дальше факты: у ХДФ и МДФ без покрытия рисунка нет; группа
 * производителя «Uni» — однотонный декор. Всё остальное учитывается: без
 * данных безопаснее не вращать — повёрнутый древесный фасад цех не
 * исправит.
 */
export function groupGrain(
  key: string,
  stock: PanelStock,
  settings: CuttingSettings,
  info: DecorInfo | null,
): { grain: boolean; note: string } {
  const said = settings.texture[key];
  if (said === 'grain') return { grain: true, note: 'текстура учитывается — так указано в настройках раскроя' };
  if (said === 'plain') return { grain: false, note: 'без текстуры — так указано в настройках раскроя' };
  if (stock.kind === 'hdf') return { grain: false, note: 'ХДФ — рисунка нет, детали можно поворачивать' };
  if (stock.decor === 'raw') return { grain: false, note: 'МДФ без покрытия — рисунка нет, детали можно поворачивать' };
  if (info?.texture === 'plain') return { grain: false, note: `однотонный декор (${info.textureSource})` };
  if (info?.texture === 'grain') return { grain: true, note: `древесный рисунок (${info.textureSource}) — направление обязательно` };
  return { grain: true, note: 'текстура учитывается: о рисунке декора данных нет, поворачивать не безопасно' };
}

/**
 * КАК ДЕТАЛЬ МОЖЕТ ЛЕЧЬ НА ЛИСТ.
 *
 * У листа с текстурой она идёт вдоль его длины: деталь «вдоль» ложится
 * длиной вдоль листа (0°), «поперёк» — шириной (90°). Без текстуры —
 * как разрешает цех (`rotate`): оба положения или только 0°.
 */
export function orientationsOf(part: Pick<Panel, 'grain' | 'lengthMm' | 'widthMm'>, grain: boolean, rotate: boolean): (0 | 90)[] {
  if (grain && part.grain === 'along') return [0];
  if (grain && part.grain === 'across') return [90];
  return rotate && part.lengthMm !== part.widthMm ? [0, 90] : [0];
}

/* ─────────────────────────  Гильотинная раскладка  ───────────────────────── */

type Box = { x: number; y: number; w: number; h: number };
type Node = {
  box: Box;
  kind: 'free' | 'part' | 'split';
  piece?: number;
  rotation?: 0 | 90;
  /** `x` — линия X = at (поперечный рез), `y` — линия Y = at (продольный). */
  axis?: 'x' | 'y';
  at?: number;
  kerf?: number;
  first?: Node;
  second?: Node | null;
};
type OpenSheet = { root: Node; free: Node[] };

type Order = 'area' | 'long' | 'short' | 'perimeter';
type Fit = 'area' | 'short' | 'long';
type Split = 'maxArea' | 'minArea' | 'longer' | 'shorter';
type Rule = { order: Order; fit: Fit; split: Split };

const ORDERS: Order[] = ['area', 'long', 'short', 'perimeter'];
const FITS: Fit[] = ['area', 'short', 'long'];
const SPLITS: Split[] = ['maxArea', 'minArea', 'longer', 'shorter'];
/** Конечный набор правил: 4 × 3 × 4 = 48. Порядок фиксирован — от него зависит выбор при равенстве. */
const RULES: Rule[] = ORDERS.flatMap((order) => FITS.flatMap((fit) => SPLITS.map((split) => ({ order, fit, split }))));
/** Сколько правил перебирается на группу — пишется на экране и в PDF. */
export const CUTTING_RULE_COUNT = RULES.length;

const ORDER_TITLE: Record<Order, string> = {
  area: 'по площади',
  long: 'по длинной стороне',
  short: 'по короткой стороне',
  perimeter: 'по периметру',
};
const FIT_TITLE: Record<Fit, string> = { area: 'по остатку площади', short: 'по короткому зазору', long: 'по длинному зазору' };
const SPLIT_TITLE: Record<Split, string> = {
  maxArea: 'крупный остаток',
  minArea: 'ровные остатки',
  longer: 'вдоль большего зазора',
  shorter: 'вдоль меньшего зазора',
};

type PackItem = { len: number; wid: number; orient: (0 | 90)[]; ordinal: number };

function sortKey(item: PackItem, order: Order): number[] {
  const a = Math.max(item.len, item.wid);
  const b = Math.min(item.len, item.wid);
  switch (order) {
    case 'area':
      return [item.len * item.wid, a, b];
    case 'long':
      return [a, b];
    case 'short':
      return [b, a];
    case 'perimeter':
      return [a + b, a];
  }
}

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

function fitScore(fit: Fit, f: Box, w: number, h: number): [number, number] {
  const dw = f.w - w;
  const dh = f.h - h;
  if (fit === 'area') return [f.w * f.h - w * h, Math.min(dw, dh)];
  if (fit === 'short') return [Math.min(dw, dh), Math.max(dw, dh)];
  return [Math.max(dw, dh), Math.min(dw, dh)];
}

/** Первый рез — поперечный (X = const, на всю высоту куска)? */
function crossFirst(split: Split, f: Box, w: number, h: number, kerf: number): boolean {
  const dw = f.w - w;
  const dh = f.h - h;
  const kx = dw > 0 ? Math.min(kerf, dw) : 0;
  const ky = dh > 0 ? Math.min(kerf, dh) : 0;
  const crossBig = Math.max((dw - kx) * f.h, w * (dh - ky));
  const alongBig = Math.max(f.w * (dh - ky), (dw - kx) * h);
  switch (split) {
    case 'maxArea':
      return crossBig >= alongBig;
    case 'minArea':
      return crossBig <= alongBig;
    case 'longer':
      return dw >= dh;
    case 'shorter':
      return dw < dh;
  }
}

/** Кладёт деталь в угол свободного куска и режет остаток двумя гильотинными резами. */
function place(open: OpenSheet, f: Node, piece: number, rotation: 0 | 90, w: number, h: number, split: Split, kerf: number) {
  open.free.splice(open.free.indexOf(f), 1);
  const { x, y, w: fw, h: fh } = f.box;
  const dw = fw - w;
  const dh = fh - h;
  const freeNode = (box: Box): Node => {
    const node: Node = { box, kind: 'free' };
    open.free.push(node);
    return node;
  };
  const partNode = (): Node => ({ box: { x, y, w, h }, kind: 'part', piece, rotation });

  if (crossFirst(split, f.box, w, h, kerf)) {
    let column = f;
    if (dw > 0) {
      const k = Math.min(kerf, dw);
      const left: Node = { box: { x, y, w, h: fh }, kind: 'free' };
      const right = dw - k > 0 ? freeNode({ x: x + w + k, y, w: dw - k, h: fh }) : null;
      Object.assign(f, { kind: 'split', axis: 'x', at: x + w, kerf: k, first: left, second: right });
      column = left;
    }
    if (dh > 0) {
      const k = Math.min(kerf, dh);
      const top = dh - k > 0 ? freeNode({ x, y: y + h + k, w, h: dh - k }) : null;
      Object.assign(column, { kind: 'split', axis: 'y', at: y + h, kerf: k, first: partNode(), second: top });
    } else {
      Object.assign(column, { kind: 'part', piece, rotation, box: { x, y, w, h } });
    }
    return;
  }

  let strip = f;
  if (dh > 0) {
    const k = Math.min(kerf, dh);
    const bottom: Node = { box: { x, y, w: fw, h }, kind: 'free' };
    const top = dh - k > 0 ? freeNode({ x, y: y + h + k, w: fw, h: dh - k }) : null;
    Object.assign(f, { kind: 'split', axis: 'y', at: y + h, kerf: k, first: bottom, second: top });
    strip = bottom;
  }
  if (dw > 0) {
    const k = Math.min(kerf, dw);
    const right = dw - k > 0 ? freeNode({ x: x + w + k, y, w: dw - k, h }) : null;
    Object.assign(strip, { kind: 'split', axis: 'x', at: x + w, kerf: k, first: partNode(), second: right });
  } else {
    Object.assign(strip, { kind: 'part', piece, rotation, box: { x, y, w, h } });
  }
}

function sizeOn(item: PackItem, rotation: 0 | 90): [number, number] {
  return rotation === 0 ? [item.len, item.wid] : [item.wid, item.len];
}

/** Одна раскладка по одному правилу. Детали, не влезающие в пустое поле, сюда не приходят. */
function pack(items: PackItem[], work: Box, kerf: number, rule: Rule): OpenSheet[] {
  const order = items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const ka = sortKey(a.item, rule.order);
      const kb = sortKey(b.item, rule.order);
      for (let j = 0; j < ka.length; j += 1) if (ka[j] !== kb[j]) return kb[j] - ka[j];
      return a.item.ordinal - b.item.ordinal;
    });

  type Candidate = { sheet: OpenSheet; node: Node; rotation: 0 | 90; w: number; h: number; score: number[] };
  const sheets: OpenSheet[] = [];
  const consider = (best: Candidate | null, sheet: OpenSheet, s: number, node: Node, item: PackItem): Candidate | null => {
    let out = best;
    for (const rotation of item.orient) {
      const [w, h] = sizeOn(item, rotation);
      if (w > node.box.w || h > node.box.h) continue;
      const score = [...fitScore(rule.fit, node.box, w, h), s, node.box.y, node.box.x, rotation];
      if (!out || lexLess(score, out.score)) out = { sheet, node, rotation, w, h, score };
    }
    return out;
  };
  for (const { item, i } of order) {
    let best: Candidate | null = null;
    for (let s = 0; s < sheets.length; s += 1) {
      for (const node of sheets[s].free) best = consider(best, sheets[s], s, node, item);
    }
    if (!best) {
      const root: Node = { box: { ...work }, kind: 'free' };
      const sheet: OpenSheet = { root, free: [root] };
      sheets.push(sheet);
      best = consider(null, sheet, sheets.length - 1, root, item);
    }
    if (!best) throw new Error(`Деталь ${i} не влезает в пустое поле — её не должно было быть в раскладке.`);
    place(best.sheet, best.node, i, best.rotation, best.w, best.h, rule.split, kerf);
  }
  return sheets;
}

type Walked = {
  parts: { piece: number; rotation: 0 | 90; box: Box }[];
  free: Box[];
  cuts: { axis: 'x' | 'y'; at: number; from: number; to: number; kerf: number; stage: number }[];
  kerfArea: number;
};

/** Обход дерева резов: детали, свободные куски и резы в порядке, в каком их пилят. */
function walk(root: Node): Walked {
  const out: Walked = { parts: [], free: [], cuts: [], kerfArea: 0 };
  const visit = (node: Node, stage: number, parentAxis: 'x' | 'y' | null) => {
    if (node.kind === 'part') {
      out.parts.push({ piece: node.piece!, rotation: node.rotation!, box: node.box });
      return;
    }
    if (node.kind === 'free') {
      out.free.push(node.box);
      return;
    }
    const axis = node.axis!;
    const at = stage === 0 ? 1 : parentAxis === axis ? stage : stage + 1;
    const from = axis === 'x' ? node.box.y : node.box.x;
    const length = axis === 'x' ? node.box.h : node.box.w;
    out.cuts.push({ axis, at: node.at!, from, to: from + length, kerf: node.kerf!, stage: at });
    out.kerfArea += node.kerf! * length;
    visit(node.first!, at, axis);
    if (node.second) visit(node.second, at, axis);
  };
  visit(root, 0, null);
  return out;
}

/* ─────────────────────────  Карта объекта  ───────────────────────── */

const mm = (units: number) => units / U;
const mm2 = (units2: number) => units2 / (U * U);

function areaZero(): CutArea {
  return { sheetMm2: 0, partsMm2: 0, kerfMm2: 0, trimMm2: 0, remnantMm2: 0, scrapMm2: 0 };
}

function addArea(into: CutArea, area: CutArea) {
  into.sheetMm2 += area.sheetMm2;
  into.partsMm2 += area.partsMm2;
  into.kerfMm2 += area.kerfMm2;
  into.trimMm2 += area.trimMm2;
  into.remnantMm2 += area.remnantMm2;
  into.scrapMm2 += area.scrapMm2;
}

/** Номер экземпляра: у строки из одной штуки — номер детали как есть. */
export function pieceId(part: Pick<Panel, 'number' | 'qty'>, instance: number): string {
  return part.qty > 1 ? `${part.number}/${instance}` : part.number;
}

/** Подпись декора листа. */
export function decorLabelOf(stock: PanelStock, info: DecorInfo | null): string {
  if (stock.decor === 'raw') return 'без покрытия — эмаль и плёнка после раскроя';
  if (stock.decor === null) return stock.kind === 'hdf' ? 'декор в продукте не выбирается' : 'декор не выбран';
  if (stock.decor.startsWith('color:')) return `цвет ${stock.decor.slice(6)} — позиции каталога нет`;
  if (info) {
    const name = info.name && info.name !== info.article ? ` ${info.name}` : '';
    return `${info.article || info.name}${name}`;
  }
  return `позиции ${stock.decor.replace(/^item:/, '')} в каталоге нет`;
}

function classOf(stock: PanelStock, info: DecorInfo | null): StockClass {
  if (stock.kind === 'ldsp') return info?.collection?.startsWith('egger') ? 'ldsp_egger' : 'ldsp';
  if (stock.kind === 'mdf') return 'mdf';
  if (stock.kind === 'hdf') return 'hdf';
  return 'other';
}

function surfaceLabel(surface: string | undefined): string {
  if (!surface) return '';
  return ` · ${finishParams(surface)?.label ?? surface}`;
}

/** Сколько ящиков в деталировке: по фронтам ящиков (у филёнки — по раме). */
export function drawerCount(parts: Pick<Panel, 'name' | 'qty'>[]): number {
  return parts
    .filter((part) => part.name === DRAWER_FRONT_PANEL_NAME || part.name === `${DRAWER_FRONT_PANEL_NAME}: рама`)
    .reduce((sum, part) => sum + part.qty, 0);
}

const EDGE_LABEL: Record<Panel['edgeType'], string> = {
  '2': 'кромка 2 мм',
  '1': 'кромка 1 мм',
  '0.4': 'кромка 0.4 мм',
};

/** Кромка детали словами: «Д1, Д2 · кромка 2 мм», без кромки — «—». */
export function edgeWords(part: Pick<Panel, 'edges' | 'edgeType'>): string {
  const sides = edgeSides(part);
  if (sides.length === 0) return '—';
  const name: Record<EdgeSide, string> = { front: 'Д1', back: 'Д2', top: 'Ш1', bottom: 'Ш2' };
  return `${sides.map((side) => name[side]).join(', ')} · ${EDGE_LABEL[part.edgeType]}`;
}

/** Направление текстуры детали словами — как в выгрузке деталировки. */
export const GRAIN_WORDS: Record<Panel['grain'], string> = {
  along: 'вдоль',
  across: 'поперёк',
  none: 'без текстуры',
};

function fnv(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * КАРТА РАСКРОЯ ОБЪЕКТА.
 *
 * `parts` — детали объекта (`objectPanels`), тот же список, что у таблицы
 * деталировки и её CSV. `exportLock` — замок выпуска экрана (композиция не
 * собралась, стена не сходится, ящики отсеков): карта его наследует, а не
 * решает заново.
 */
export function cuttingPlan(input: {
  parts: ObjectPanel[];
  settings: CuttingSettings;
  decors?: Map<string, DecorInfo>;
  exportLock?: string | null;
  fingerprint: string;
}): CuttingPlan {
  const { parts, settings, decors = new Map(), exportLock = null, fingerprint } = input;
  const kerf = Math.round(settings.kerfMm * U);
  const trim = Math.round(settings.trimMm * U);
  const minRemnant = settings.minRemnantMm * U;

  /* Группы — в порядке первого появления, затем по классу, толщине и подписи. */
  const byKey = new Map<string, { stock: PanelStock; thicknessMm: number; parts: { part: ObjectPanel; ordinal: number }[] }>();
  parts.forEach((part, ordinal) => {
    const key = stockKey(part.stock, part.thicknessMm);
    const group = byKey.get(key) ?? { stock: part.stock, thicknessMm: part.thicknessMm, parts: [] };
    group.parts.push({ part, ordinal });
    byKey.set(key, group);
  });

  const groups: CutGroup[] = [];
  const errors: string[] = [];

  for (const [key, raw] of Array.from(byKey.entries())) {
    const info = raw.stock.decor ? (decors.get(raw.stock.decor) ?? null) : null;
    const cls = classOf(raw.stock, info);
    const decorLabel = decorLabelOf(raw.stock, info);
    const title = `${STOCK_TITLE[raw.stock.kind]} ${raw.thicknessMm} · ${decorLabel}${surfaceLabel(raw.stock.surface)}`;
    const texture = groupGrain(key, raw.stock, settings, info);
    const own = settings.sheets.find((format) => format.stock === key) ?? null;
    const shared = own ? null : (settings.sheets.find((format) => format.stock === stockBaseKey(raw.stock.kind, raw.thicknessMm)) ?? null);
    const format = own ?? shared;

    const pieces: CutPiece[] = [];
    for (const { part, ordinal } of raw.parts) {
      for (let instance = 1; instance <= part.qty; instance += 1) {
        pieces.push({ id: pieceId(part, instance), part, instance, lengthMm: part.lengthMm, widthMm: part.widthMm, ordinal: ordinal * 1000 + instance });
      }
    }

    const group: CutGroup = {
      key,
      kind: raw.stock.kind,
      thicknessMm: raw.thicknessMm,
      decor: raw.stock.decor,
      ...(raw.stock.surface ? { surface: raw.stock.surface } : {}),
      cls,
      title,
      decorLabel,
      decorMissing: raw.stock.decor === null && raw.stock.kind !== 'hdf',
      grain: texture.grain,
      grainNote: texture.note,
      format,
      formatScope: own ? 'group' : shared ? 'kind' : null,
      pieces,
      sheets: [],
      unplaced: [],
      heuristic: null,
      candidates: 0,
      area: areaZero(),
      utilization: 0,
    };
    groups.push(group);

    /* Деталь без положительного конечного размера не раскладывается — называется. */
    const valid: CutPiece[] = [];
    for (const piece of pieces) {
      const ok = [piece.lengthMm, piece.widthMm].every((v) => Number.isFinite(v) && v > 0);
      if (!ok) {
        group.unplaced.push({
          piece,
          reason: `${piece.id} «${piece.part.name}» ${piece.lengthMm} × ${piece.widthMm}: размер не положительный — в деталировке ошибка, такую деталь не распилить`,
        });
      } else valid.push(piece);
    }
    if (!format) continue;

    const L = format.lengthMm * U;
    const W = format.widthMm * U;
    const work: Box = { x: trim, y: trim, w: L - 2 * trim, h: W - 2 * trim };

    const items: PackItem[] = [];
    const itemPieces: CutPiece[] = [];
    for (const piece of valid) {
      const orient = orientationsOf(piece.part, texture.grain, settings.rotate);
      const len = Math.round(piece.lengthMm * U);
      const wid = Math.round(piece.widthMm * U);
      const fits = orient.some((rotation) => {
        const [w, h] = rotation === 0 ? [len, wid] : [wid, len];
        return w <= work.w && h <= work.h;
      });
      if (!fits) {
        const forced = orient.length === 1 && texture.grain && piece.part.grain !== 'none';
        const along = orient[0] === 0 ? piece.lengthMm : piece.widthMm;
        const across = orient[0] === 0 ? piece.widthMm : piece.lengthMm;
        const reasons: string[] = [];
        if (along > mm(work.w)) reasons.push(`вдоль листа ${along} мм при рабочем поле ${mm(work.w)} мм`);
        if (across > mm(work.h)) reasons.push(`поперёк ${across} мм при рабочем поле ${mm(work.h)} мм`);
        const rotated = !forced && orient.length === 1 && piece.lengthMm <= mm(work.h) && piece.widthMm <= mm(work.w);
        group.unplaced.push({
          piece,
          reason:
            `${piece.id} «${piece.part.name}» ${piece.lengthMm} × ${piece.widthMm} не помещается на лист ${format.lengthMm} × ${format.widthMm}` +
            ` (обрезка по ${settings.trimMm} мм): ${reasons.join(', ') || 'не входит ни в одном положении'}` +
            (forced ? ` — повернуть нельзя: текстура детали ${GRAIN_WORDS[piece.part.grain]}` : rotated ? ' — повёрнутая влезла бы, но поворот деталей выключен' : ''),
        });
        continue;
      }
      items.push({ len, wid, orient, ordinal: piece.ordinal });
      itemPieces.push(piece);
    }
    if (items.length === 0) continue;

    /* Перебор правил: меньше листов, затем больше полезных остатков, затем меньше резов. */
    let winner: { rule: Rule; walked: Walked[]; score: number[] } | null = null;
    for (let index = 0; index < RULES.length; index += 1) {
      const rule = RULES[index];
      const walked = pack(items, work, kerf, rule).map((sheet) => walk(sheet.root));
      let remnant = 0;
      let cuts = 0;
      for (const sheet of walked) {
        cuts += sheet.cuts.length;
        for (const box of sheet.free) if (Math.min(box.w, box.h) >= minRemnant) remnant += box.w * box.h;
      }
      const score = [walked.length, -remnant, cuts, index];
      if (!winner || lexLess(score, winner.score)) winner = { rule, walked, score };
    }
    group.candidates = RULES.length;
    if (!winner) continue;
    group.heuristic = `${ORDER_TITLE[winner.rule.order]} · ${FIT_TITLE[winner.rule.fit]} · ${SPLIT_TITLE[winner.rule.split]}`;

    winner.walked.forEach((walked, s) => {
      const placements: CutPlacement[] = walked.parts
        .map(({ piece, rotation, box }) => ({
          piece: itemPieces[piece],
          xMm: mm(box.x),
          yMm: mm(box.y),
          wMm: mm(box.w),
          hMm: mm(box.h),
          rotation,
        }))
        .sort((a, b) => a.yMm - b.yMm || a.xMm - b.xMm);
      const remnants: CutRect[] = [];
      const scraps: CutRect[] = [];
      let remnantArea = 0;
      let scrapArea = 0;
      for (const box of walked.free) {
        const rect = { xMm: mm(box.x), yMm: mm(box.y), wMm: mm(box.w), hMm: mm(box.h) };
        if (Math.min(box.w, box.h) >= minRemnant) {
          remnants.push(rect);
          remnantArea += box.w * box.h;
        } else {
          scraps.push(rect);
          scrapArea += box.w * box.h;
        }
      }
      remnants.sort((a, b) => b.wMm * b.hMm - a.wMm * a.hMm || a.yMm - b.yMm || a.xMm - b.xMm);
      const partsArea = walked.parts.reduce((sum, p) => sum + p.box.w * p.box.h, 0);
      const area: CutArea = {
        sheetMm2: mm2(L * W),
        partsMm2: mm2(partsArea),
        kerfMm2: mm2(walked.kerfArea),
        trimMm2: mm2(L * W - work.w * work.h),
        remnantMm2: mm2(remnantArea),
        scrapMm2: mm2(scrapArea),
      };
      group.sheets.push({
        number: 0,
        groupKey: key,
        indexInGroup: s + 1,
        lengthMm: format.lengthMm,
        widthMm: format.widthMm,
        thicknessMm: raw.thicknessMm,
        trimMm: settings.trimMm,
        kerfMm: settings.kerfMm,
        placements,
        cuts: walked.cuts.map((cut, n) => ({
          n: n + 1,
          direction: cut.axis === 'y' ? 'along' : 'across',
          atMm: mm(cut.at),
          fromMm: mm(cut.from),
          toMm: mm(cut.to),
          kerfMm: mm(cut.kerf),
          stage: cut.stage,
        })),
        remnants,
        scraps,
        area,
        utilization: area.sheetMm2 > 0 ? area.partsMm2 / area.sheetMm2 : 0,
      });
      addArea(group.area, area);
    });
    group.utilization = group.area.sheetMm2 > 0 ? group.area.partsMm2 / group.area.sheetMm2 : 0;
  }

  /* Порядок групп на экране: класс, толщина, подпись. Номера листов — по нему, сквозные. */
  groups.sort(
    (a, b) =>
      CLASS_ORDER.indexOf(a.cls) - CLASS_ORDER.indexOf(b.cls) ||
      a.thicknessMm - b.thicknessMm ||
      (a.title < b.title ? -1 : a.title > b.title ? 1 : 0),
  );
  const sheets: CutSheet[] = [];
  for (const group of groups) {
    for (const sheet of group.sheets) {
      sheet.number = sheets.length + 1;
      sheets.push(sheet);
    }
  }

  const area = areaZero();
  for (const group of groups) addArea(area, group.area);
  const pieces = groups.reduce((sum, group) => sum + group.pieces.length, 0);
  const placed = sheets.reduce((sum, sheet) => sum + sheet.placements.length, 0);

  /* Кромка — по типам, той же `panelEdgeMm`, что итоги деталировки и смета. */
  const edgeMm = new Map<Panel['edgeType'], number>();
  for (const part of parts) {
    const length = panelEdgeMm(part) * part.qty;
    if (length > 0) edgeMm.set(part.edgeType, (edgeMm.get(part.edgeType) ?? 0) + length);
  }
  const edges: CutEdgeTotal[] = (['2', '1', '0.4'] as Panel['edgeType'][])
    .filter((type) => edgeMm.has(type))
    .map((type) => ({ edgeType: type, label: EDGE_LABEL[type], meters: Math.round((edgeMm.get(type)! / 1000) * 100) / 100 }));

  errors.push(...cuttingErrors({ groups, sheets, parts, settings }));

  const drawers = drawerCount(parts);
  const reasons: string[] = [];
  if (exportLock) reasons.push(exportLock);
  const noFormat = groups.filter((group) => !group.format);
  if (noFormat.length > 0) {
    reasons.push(
      `Лист не выбран: ${noFormat.map((group) => `«${group.title}» (${group.pieces.length} шт.)`).join(', ')} — ` +
        'детали этих групп не разложены.',
    );
  }
  const unplaced = groups.flatMap((group) => group.unplaced);
  if (unplaced.length > 0) {
    reasons.push(
      `Не разложено ${unplaced.length} шт.: ${unplaced
        .slice(0, 2)
        .map((u) => u.reason)
        .join('; ')}${unplaced.length > 2 ? `; и ещё ${unplaced.length - 2}` : ''}.`,
    );
  }
  if (drawers > 0) {
    reasons.push(
      `Ящиков ${drawers}: короба в раскрое нет — нет правил короба цеха и подтверждённой направляющей. ` +
        'По этой карте цех распилит фронты без коробов.',
    );
  }
  if (errors.length > 0) {
    reasons.push(`Проверка раскладки нашла ${errors.length} ошибок: ${errors.slice(0, 2).join('; ')}.`);
  }
  if (!settings.confirmed) {
    reasons.push(
      `Пропил ${settings.kerfMm} мм, обрезка ${settings.trimMm} мм и остаток от ${settings.minRemnantMm} мм — ` +
        'не подтверждено цехом: раскладка может не совпасть с пилой.',
    );
  }

  const warnings: string[] = [];
  const missing = groups.filter((group) => group.decorMissing);
  if (missing.length > 0) {
    warnings.push(
      `Декор не выбран: ${missing.map((group) => `«${group.title}» (${group.pieces.length} шт.)`).join(', ')} — ` +
        'цех возьмёт плиту по своему умолчанию; проверьте, тот ли лист.',
    );
  }

  const signature = fnv(
    [
      `${settings.kerfMm}|${settings.trimMm}|${settings.minRemnantMm}|${settings.rotate ? 1 : 0}`,
      ...sheets.map(
        (sheet) =>
          `${sheet.number}:${sheet.groupKey}:${sheet.lengthMm}x${sheet.widthMm}:` +
          sheet.placements.map((p) => `${p.piece.part.partId}#${p.piece.instance}@${p.xMm},${p.yMm},${p.rotation}`).join(';'),
      ),
      ...groups.flatMap((group) => group.unplaced.map((u) => `!${u.piece.part.partId}#${u.piece.instance}`)),
    ].join('\n'),
  );

  return {
    settings,
    groups,
    sheets,
    pieces,
    placed,
    area,
    utilization: area.sheetMm2 > 0 ? area.partsMm2 / area.sheetMm2 : 0,
    edges,
    drawers,
    release: { ok: reasons.length === 0, reasons },
    warnings,
    errors,
    signature,
    fingerprint,
  };
}

/* ─────────────────────────  Проверка раскладки  ───────────────────────── */

/**
 * ПРОВЕРКА КАРТЫ — ПО РАЗЛОЖЕННОМУ, А НЕ ПО ДЕРЕВУ РЕЗОВ.
 *
 * Дерево раскладки само по себе гарантирует многое, но проверка, которая
 * спрашивает того же, кто строил, ничего не проверяет. Здесь — только
 * положения деталей на листах против деталировки и настроек: конечные
 * положительные размеры, поле листа без обрезки, пересечения, пропил
 * между соседями, текстура, толщина, лист своей группы, баланс площадей и
 * счёт: каждая деталь деталировки — ровно один раз, на листе или в списке
 * неразложенных.
 */
export function cuttingErrors(input: {
  groups: CutGroup[];
  sheets: CutSheet[];
  parts: ObjectPanel[];
  settings: CuttingSettings;
}): string[] {
  const { groups, sheets, parts, settings } = input;
  const errors: string[] = [];
  const eps = 1e-6;
  const groupOf = new Map(groups.map((group) => [group.key, group]));

  for (const sheet of sheets) {
    const group = groupOf.get(sheet.groupKey);
    const label = `лист ${sheet.number}`;
    if (!group) {
      errors.push(`${label}: группы ${sheet.groupKey} нет`);
      continue;
    }
    const x0 = sheet.trimMm;
    const y0 = sheet.trimMm;
    const x1 = sheet.lengthMm - sheet.trimMm;
    const y1 = sheet.widthMm - sheet.trimMm;
    for (const p of sheet.placements) {
      const id = `${label}, деталь ${p.piece.id}`;
      const nums = [p.xMm, p.yMm, p.wMm, p.hMm];
      if (!nums.every(Number.isFinite)) {
        errors.push(`${id}: не число в положении`);
        continue;
      }
      if (p.wMm <= 0 || p.hMm <= 0) errors.push(`${id}: размер не положительный`);
      const [w, h] = p.rotation === 0 ? [p.piece.lengthMm, p.piece.widthMm] : [p.piece.widthMm, p.piece.lengthMm];
      if (Math.abs(p.wMm - w) > eps || Math.abs(p.hMm - h) > eps) {
        errors.push(`${id}: на листе ${p.wMm} × ${p.hMm} при детали ${p.piece.lengthMm} × ${p.piece.widthMm} и повороте ${p.rotation}°`);
      }
      if (p.xMm < x0 - eps || p.yMm < y0 - eps || p.xMm + p.wMm > x1 + eps || p.yMm + p.hMm > y1 + eps) {
        errors.push(`${id}: выходит за рабочее поле листа (${x0}…${x1} × ${y0}…${y1})`);
      }
      const allowed = orientationsOf(p.piece.part, group.grain, settings.rotate);
      if (!allowed.includes(p.rotation)) {
        errors.push(
          group.grain && p.piece.part.grain !== 'none'
            ? `${id}: поворот ${p.rotation}° против текстуры (деталь «${GRAIN_WORDS[p.piece.part.grain]}»)`
            : `${id}: поворот ${p.rotation}° при выключенном повороте деталей`,
        );
      }
      if (p.piece.part.thicknessMm !== sheet.thicknessMm) {
        errors.push(`${id}: толщина детали ${p.piece.part.thicknessMm} мм на листе ${sheet.thicknessMm} мм`);
      }
      if (stockKey(p.piece.part.stock, p.piece.part.thicknessMm) !== sheet.groupKey) {
        errors.push(`${id}: деталь другого листа (${stockKey(p.piece.part.stock, p.piece.part.thicknessMm)})`);
      }
    }
    /* Пересечения и пропил между соседями по одной полосе. */
    const list = sheet.placements;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const ox = Math.min(a.xMm + a.wMm, b.xMm + b.wMm) - Math.max(a.xMm, b.xMm);
        const oy = Math.min(a.yMm + a.hMm, b.yMm + b.hMm) - Math.max(a.yMm, b.yMm);
        if (ox > eps && oy > eps) {
          errors.push(`${label}: детали ${a.piece.id} и ${b.piece.id} пересекаются (${round1(ox)} × ${round1(oy)} мм)`);
          continue;
        }
        if (oy > eps && ox <= eps && -ox < sheet.kerfMm - eps) {
          errors.push(`${label}: между ${a.piece.id} и ${b.piece.id} ${round1(-ox)} мм — меньше пропила ${sheet.kerfMm} мм`);
        }
        if (ox > eps && oy <= eps && -oy < sheet.kerfMm - eps) {
          errors.push(`${label}: между ${a.piece.id} и ${b.piece.id} ${round1(-oy)} мм — меньше пропила ${sheet.kerfMm} мм`);
        }
      }
    }
    /* Баланс: детали + пропил + обрезка + остатки + отходы = лист, точно. */
    const a = sheet.area;
    const sum = a.partsMm2 + a.kerfMm2 + a.trimMm2 + a.remnantMm2 + a.scrapMm2;
    if (Math.abs(sum - a.sheetMm2) > 0.5) {
      errors.push(`${label}: площади не сходятся — сумма ${round1(sum)} мм² при листе ${a.sheetMm2} мм²`);
    }
    const placedArea = sheet.placements.reduce((s, p) => s + p.wMm * p.hMm, 0);
    if (Math.abs(placedArea - a.partsMm2) > 0.5) {
      errors.push(`${label}: площадь деталей ${round1(a.partsMm2)} мм² при разложенных ${round1(placedArea)} мм²`);
    }
  }

  /* Счёт: каждая деталь деталировки — ровно один раз. */
  const seen = new Map<string, number>();
  for (const sheet of sheets) {
    for (const p of sheet.placements) {
      const id = `${p.piece.part.partId}#${p.piece.instance}`;
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  }
  for (const group of groups) {
    for (const u of group.unplaced) {
      const id = `${u.piece.part.partId}#${u.piece.instance}`;
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    if (!group.format) {
      for (const piece of group.pieces) {
        if (group.unplaced.some((u) => u.piece === piece)) continue;
        const id = `${piece.part.partId}#${piece.instance}`;
        seen.set(id, (seen.get(id) ?? 0) + 1);
      }
    }
  }
  let expected = 0;
  for (const part of parts) {
    for (let instance = 1; instance <= part.qty; instance += 1) {
      expected += 1;
      const id = `${part.partId}#${instance}`;
      const n = seen.get(id) ?? 0;
      if (n === 0) errors.push(`деталь ${pieceId(part, instance)} (${part.partId}) потеряна: её нет ни на листе, ни в неразложенных`);
      if (n > 1) errors.push(`деталь ${pieceId(part, instance)} (${part.partId}) посчитана ${n} раза`);
      seen.delete(id);
    }
  }
  for (const id of Array.from(seen.keys())) errors.push(`на листе деталь ${id}, которой нет в деталировке`);
  const counted = groups.reduce((sum, group) => sum + group.pieces.length, 0);
  if (counted !== expected) errors.push(`деталей в карте ${counted} при ${expected} в деталировке`);
  return errors;
}

/* ─────────────────────────  Выгрузка CSV  ───────────────────────── */

export const CUTTING_CSV_HEADER = [
  'PartID',
  'ModuleID',
  'PartName',
  'LengthMm',
  'WidthMm',
  'Quantity',
  'Material',
  'ThicknessMm',
  'GrainDirection',
  'EdgeBanding',
  'SheetNumber',
  'PositionX',
  'PositionY',
  'RotationDeg',
] as const;

/**
 * СТРОКИ CSV КАРТЫ — по детали на строку, в порядке листов и положений.
 *
 * Те же листы и положения, что на экране и в PDF: выгрузка читает
 * раскладку, а не считает её заново. Количество — 1: у каждого экземпляра
 * своё место на листе.
 */
export function cuttingCsvRows(plan: CuttingPlan): (string | number)[][] {
  const titleOf = new Map(plan.groups.map((group) => [group.key, group.title]));
  return plan.sheets.flatMap((sheet) =>
    sheet.placements.map((p) => [
      p.piece.id,
      p.piece.part.moduleId,
      p.piece.part.name,
      p.piece.lengthMm,
      p.piece.widthMm,
      1,
      titleOf.get(sheet.groupKey) ?? sheet.groupKey,
      p.piece.part.thicknessMm,
      GRAIN_WORDS[p.piece.part.grain],
      edgeWords(p.piece.part),
      sheet.number,
      p.xMm,
      p.yMm,
      p.rotation,
    ]),
  );
}

/**
 * ВЫГРУЗКА КАРТЫ РАСКРОЯ: деталь на строку — лист и место на нём.
 *
 * Разделитель, кавычки и кодировка — те же, что у выгрузки деталировки
 * (`cell`, `csvFile`); CRLF — так файл открывают Excel и программы раскроя.
 */
export function cuttingCsv(plan: CuttingPlan): string {
  const rows = cuttingCsvRows(plan).map((row) => row.map(cell).join(';'));
  return [CUTTING_CSV_HEADER.join(';'), ...rows].join('\r\n') + '\r\n';
}

export function cuttingCsvFile(plan: CuttingPlan, encoding: CsvEncoding = 'windows-1251'): { bytes: Uint8Array; type: string } {
  return csvFile(cuttingCsv(plan), encoding);
}

/** Имя файла: объект, «карта раскроя», дата и конфигурация. */
export function cuttingFileName(title: string, date: string, fingerprint: string, ext: 'csv' | 'pdf'): string {
  const safe = title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'объект';
  return `${safe} — карта раскроя ${date} ${fingerprint}.${ext}`;
}

/** Проценты одним знаком после запятой: «78.4 %». */
export function percent(share: number): string {
  return `${(Math.round(share * 1000) / 10).toFixed(1)} %`;
}

/** Квадратные метры двумя знаками. */
export function m2(mm2Value: number): string {
  return (Math.round(mm2Value / 10_000) / 100).toFixed(2);
}
