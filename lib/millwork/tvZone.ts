/**
 * ТВ-ЗОНА (STAGE B) — ТЕЛЕВИЗОР, ДЕКОРАТИВНЫЕ ПАНЕЛИ СТЕНЫ И ГОТОВЫЕ ВАРИАНТЫ.
 *
 * Телевизор и панели — поля ряда (`Run.tv`, `Run.wallPanels`): их правят те же
 * операции (`applyOps`), их видят сцена, чертёж, раскрой и смета, и
 * пересечения с мебелью проверяет движок ряда. Здесь — одна геометрия на всех:
 * габарит телевизора и его вынос от стены (`tvBoxMm`), детали панели
 * (`wallPanelParts`), проверки до записи (`tvRefusal`, `wallPanelRefusal`) и
 * раскладка вариантов A, B, C под длину стены (`tvZonePlan`).
 *
 * Координаты — мм ряда: `u` вдоль ряда от его левого края, `v` от пола, `w`
 * от стены в комнату. Мебель стоит на стене (`w` от нуля), поэтому всё, что
 * на стене, не пересекается с ней в плоскости фасада — или пересекается
 * совсем.
 *
 * Что не выдумывается: паспорт конкретного телевизора (рамка, толщина) и его
 * крепление (VESA, вынос кронштейна). Пока их не ввели, числа условные, и это
 * сказано (`tvFacts`). Экран по диагонали — геометрия 16:9, а не паспорт.
 */
import type {
  FrontSpec,
  Module,
  RadiusSpec,
  Run,
  TvSpec,
  TvZoneVariant,
  VitrineSpec,
  WallPanel,
  WallPanelKind,
} from '@/types/millwork';
import type { ProductionSettings } from '@/types/catalog';
import { moduleCarcassHeightMm, upperBottomFor } from './fill';
import { plinthMm, shopOf } from './shop';
import { standsOnFloor } from './modules';
import { zoneHeightMm } from './zones';
import { reliefKindDef } from './facadeRelief';

/* ─────────────────────────  Телевизор  ───────────────────────── */

/** Диагонали, которые предлагает выбор и раскладка вариантов, дюймы. */
export const TV_DIAGONALS_IN = [43, 50, 55, 65, 75, 85] as const;
/** Диагональ, которую принимает правка: меньше — не ТВ-зона, больше — проектор. */
export const TV_DIAGONAL_RANGE: readonly [number, number] = [32, 100];

const MM_PER_IN = 25.4;

/** Экран 16:9 по диагонали — геометрия, а не паспорт модели. */
export function tvScreenMm(diagonalIn: number): { widthMm: number; heightMm: number } {
  const d = diagonalIn * MM_PER_IN;
  const k = Math.hypot(16, 9);
  return { widthMm: Math.round((d * 16) / k), heightMm: Math.round((d * 9) / k) };
}

/**
 * УСЛОВНЫЙ КОРПУС ДО ПАСПОРТА: рамка и толщина у моделей разные, и до ввода
 * паспорта (`TvSpec.measured`) числа корпуса — условные, сказано словами.
 */
export const TV_BEZEL_MM = 8;
export const TV_DEPTH_MM = 60;
/** Условный вынос кронштейна от стены — пока кронштейн не выбран (`TvSpec.mountMm`). */
export const TV_MOUNT_MM = 30;

/** Телевизор по диагонали: экран — геометрия, корпус — условный до паспорта. */
export function tvFromDiagonal(diagonalIn: number, place: { centerMm: number; bottomMm: number }): TvSpec {
  const screen = tvScreenMm(diagonalIn);
  return {
    diagonalIn,
    widthMm: screen.widthMm + 2 * TV_BEZEL_MM,
    heightMm: screen.heightMm + 2 * TV_BEZEL_MM,
    depthMm: TV_DEPTH_MM,
    bezelMm: TV_BEZEL_MM,
    centerMm: Math.round(place.centerMm),
    bottomMm: Math.round(place.bottomMm),
    supply: 'client',
  };
}

/** Что известно о телевизоре, а что нет — словами для блока и спецификации. */
export function tvFacts(tv: TvSpec): string[] {
  const screen = tvScreenMm(tv.diagonalIn);
  return [
    `Экран ${tv.diagonalIn}″ — ${screen.widthMm} × ${screen.heightMm} мм (16:9, по диагонали).`,
    tv.measured
      ? `Корпус ${tv.widthMm} × ${tv.heightMm} × ${tv.depthMm} мм — по паспорту модели.`
      : `Корпус ${tv.widthMm} × ${tv.heightMm} × ${tv.depthMm} мм — условно: рамка ${tv.bezelMm} мм и толщина взяты до паспорта модели. Введите габариты модели.`,
    tv.mountMm !== undefined
      ? `Кронштейн: вынос ${tv.mountMm} мм от стены — по паспорту кронштейна; крепление (VESA) подбирают по модели телевизора.`
      : `Кронштейн не выбран: вынос ${TV_MOUNT_MM} мм — условно, крепление (VESA) модели не указано.`,
    tv.supply === 'client' ? 'Телевизор заказчика — в смету не идёт.' : 'Телевизор покупает компания — строка «Техника» сметы.',
  ];
}

/** Прямоугольник по фасаду, мм ряда. */
export type FaceRect = { x0: number; x1: number; y0: number; y1: number };

export function tvRect(tv: TvSpec): FaceRect {
  return {
    x0: Math.round(tv.centerMm - tv.widthMm / 2),
    x1: Math.round(tv.centerMm + tv.widthMm / 2),
    y0: Math.round(tv.bottomMm),
    y1: Math.round(tv.bottomMm + tv.heightMm),
  };
}

/** Вынос кронштейна: по паспорту кронштейна или условный. */
export function tvMountMm(tv: TvSpec): number {
  return tv.mountMm ?? TV_MOUNT_MM;
}

/** На какой панели висит телевизор: та, что накрывает его целиком; нет — на стене. */
export function tvPanel(run: Pick<Run, 'wallPanels'>, tv: TvSpec): WallPanel | null {
  const r = tvRect(tv);
  return (run.wallPanels ?? []).find((panel) => contains(panelRect(panel), r)) ?? null;
}

/** Короб телевизора, мм ряда: по фасаду и от стены — за панелью и кронштейном. */
export function tvBoxMm(run: Pick<Run, 'wallPanels'>, tv: TvSpec): FaceRect & { z0: number; z1: number } {
  const panel = tvPanel(run, tv);
  const z0 = (panel ? wallPanelDepthMm(panel) : 0) + tvMountMm(tv);
  return { ...tvRect(tv), z0, z1: z0 + tv.depthMm };
}

/* ─────────────────────────  Мебель по фасаду  ───────────────────────── */

/** Модуль по фасаду, мм ряда: напольный — от пола (цоколь под ним), навесной — от своего низа. */
export function moduleFaceRect(
  unit: Module,
  run: Pick<Run, 'zone' | 'ceilingHeightMm' | 'options' | 'upperSegments'> & Partial<Run>,
): FaceRect {
  const height = moduleCarcassHeightMm(unit, run);
  if (standsOnFloor(unit)) return { x0: unit.offsetMm, x1: unit.offsetMm + unit.widthMm, y0: 0, y1: plinthMm(run.production) + height };
  const bottom = upperBottomFor(unit, run);
  return { x0: unit.offsetMm, x1: unit.offsetMm + unit.widthMm, y0: bottom, y1: bottom + height };
}

function overlap(a: FaceRect, b: FaceRect): { x: number; y: number } | null {
  const x = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const y = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return x > 0 && y > 0 ? { x, y } : null;
}

function contains(outer: FaceRect, inner: FaceRect): boolean {
  return inner.x0 >= outer.x0 && inner.x1 <= outer.x1 && inner.y0 >= outer.y0 && inner.y1 <= outer.y1;
}

function allRowModules(run: Pick<Run, 'modules' | 'upperSegments'>): Module[] {
  return [...run.modules, ...run.upperSegments.flatMap((segment) => segment.modules)];
}

/** Насколько надо сдвинуть, чтобы разойтись: меньшее из захождений. */
function intrusionMm(o: { x: number; y: number }): number {
  return Math.round(Math.min(o.x, o.y));
}

/**
 * КАБЕЛЬ-КАНАЛ ОТ ТЕЛЕВИЗОРА ВНИЗ, мм — до верха мебели под его центром
 * (тумба, где стоят приставка и ресивер) или до пола, если под ним пусто.
 * Покупная позиция той же ставки, что кабель-канал ниши ТВ.
 */
export function tvCableMm(
  run: Pick<Run, 'modules' | 'upperSegments' | 'zone' | 'ceilingHeightMm' | 'options'> & Partial<Run>,
  tv: TvSpec,
): number {
  const r = tvRect(tv);
  let below = 0;
  for (const unit of allRowModules(run)) {
    const face = moduleFaceRect(unit, run);
    if (tv.centerMm >= face.x0 && tv.centerMm <= face.x1 && face.y1 <= r.y0) below = Math.max(below, face.y1);
  }
  return Math.max(0, r.y0 - below);
}

/* ─────────────────────────  Проверка телевизора  ───────────────────────── */

/**
 * ВСТАНЕТ ЛИ ТЕЛЕВИЗОР — словами; `null` — встаёт.
 *
 * Мебель, витрины и телевизор не пересекаются: телевизор висит на стене (или на
 * панели) перед мебелью по фасаду не бывает — шкаф стоит на стене от её
 * плоскости. Панель под телевизором — целиком или никак: наполовину на панели
 * кронштейн встанет на две плоскости.
 */
export function tvRefusal(run: Pick<Run, 'modules' | 'upperSegments' | 'lengthMm' | 'zone' | 'ceilingHeightMm' | 'options'> & Partial<Run>, tv: TvSpec): string | null {
  const [lo, hi] = TV_DIAGONAL_RANGE;
  if (!(tv.diagonalIn >= lo && tv.diagonalIn <= hi)) return `Диагональ ${tv.diagonalIn}″ вне ряда ${lo}–${hi}″: меньше — не ТВ-зона, больше — проектор и экран.`;
  const screen = tvScreenMm(tv.diagonalIn);
  if (!(tv.widthMm >= screen.widthMm && tv.heightMm >= screen.heightMm)) {
    return `Корпус ${tv.widthMm} × ${tv.heightMm} мм меньше экрана ${tv.diagonalIn}″ (${screen.widthMm} × ${screen.heightMm} мм): так не бывает — проверьте паспорт модели.`;
  }
  if (!(tv.depthMm >= 10 && tv.depthMm <= 200)) return `Толщина ${tv.depthMm} мм: у настенного телевизора — от 10 до 200 мм.`;
  if (!(tv.bezelMm >= 0 && tv.bezelMm * 2 <= Math.min(tv.widthMm - screen.widthMm, tv.heightMm - screen.heightMm) + 1)) {
    return `Рамка ${tv.bezelMm} мм не сходится с корпусом и экраном: корпус шире экрана на ${tv.widthMm - screen.widthMm} мм.`;
  }
  if (tv.mountMm !== undefined && !(tv.mountMm >= 0 && tv.mountMm <= 600)) return `Вынос кронштейна ${tv.mountMm} мм: от 0 до 600 мм.`;
  const r = tvRect(tv);
  if (r.x0 < 0 || r.x1 > run.lengthMm) {
    return `Телевизор ${tv.widthMm} мм выходит за ряд ${run.lengthMm} мм на ${Math.max(-r.x0, r.x1 - run.lengthMm)} мм — сдвиньте его к середине.`;
  }
  if (r.y0 < 0) return `Низ телевизора ниже пола на ${-r.y0} мм.`;
  if (r.y1 > run.ceilingHeightMm) return `Верх телевизора ${r.y1} мм выше потолка ${run.ceilingHeightMm} мм на ${r.y1 - run.ceilingHeightMm} мм.`;
  for (const unit of allRowModules(run)) {
    const o = overlap(r, moduleFaceRect(unit, run));
    if (o) return `Телевизор заходит в «${unit.label}» на ${intrusionMm(o)} мм — мебель стоит на стене, и телевизор с ней не пересекается. Поднимите или сдвиньте телевизор.`;
  }
  for (const panel of run.wallPanels ?? []) {
    const o = overlap(r, panelRect(panel));
    if (o && !contains(panelRect(panel), r)) {
      return `Телевизор наполовину на панели «${WALL_PANEL_TITLE[panel.kind]}» (${intrusionMm(o)} мм): кронштейн встал бы на две плоскости. Телевизор — целиком на панели или целиком на стене.`;
    }
  }
  return null;
}

/* ─────────────────────────  Декоративные панели  ───────────────────────── */

export const WALL_PANEL_KINDS: readonly WallPanelKind[] = ['mdf', 'slats', 'wood', 'insert', 'milled', 'stone'];

export const WALL_PANEL_TITLE: Record<WallPanelKind, string> = {
  mdf: 'МДФ-панель',
  slats: 'Рейки',
  wood: 'Деревянная панель',
  insert: 'Панель со вставкой',
  milled: 'Панель с фрезеровкой',
  stone: 'Панель под камень',
};

/** Рисунок реек по умолчанию: ширина и зазор — числа рисунка, как у реек по дуге. */
export const SLAT_DEFAULTS = { widthMm: 40, gapMm: 20 } as const;
/** Поле вставки по умолчанию — от края панели. */
export const INSERT_MARGIN_MM = 100;
/** Ширина части панели по умолчанию: стык через столько — проверьте по листу цеха (карта раскроя). */
export const PANEL_PIECE_MM = 1200;
/** Пределы чисел панели. */
export const PANEL_LIMITS = {
  sizeMm: [100, 6000] as const,
  thicknessMm: [6, 60] as const,
  slatWidthMm: [10, 300] as const,
  slatGapMm: [0, 300] as const,
  pieces: [1, 20] as const,
};

/** Лицо панели по умолчанию: МДФ в эмали, шпон у дерева и реек, плёнка у камня. */
export function defaultPanelFront(kind: WallPanelKind): FrontSpec {
  if (kind === 'wood' || kind === 'slats') return { base: 'veneer_solid', construct: 'solid', finish: 'matte', colorHex: '#9a7650' };
  if (kind === 'stone') return { base: 'mdf_film', construct: 'solid', finish: 'gloss', colorHex: '#d8d5cf', pattern: 'stone' };
  if (kind === 'milled') return { base: 'mdf_enamel', construct: 'solid', finish: 'matte', colorHex: '#e6e1d8', relief: { kind: 'vgrooves', ...reliefKindDef('vgrooves').params } };
  return { base: 'mdf_enamel', construct: 'solid', finish: 'matte', colorHex: '#e6e1d8' };
}

/** Новая панель вида `kind` на прямоугольнике стены; толщина — лист фасада цеха. */
export function newWallPanel(
  id: string,
  kind: WallPanelKind,
  rect: { fromMm: number; widthMm: number; bottomMm: number; heightMm: number },
  production?: ProductionSettings,
): WallPanel {
  const panel: WallPanel = {
    id,
    kind,
    fromMm: Math.round(rect.fromMm),
    widthMm: Math.round(rect.widthMm),
    bottomMm: Math.round(rect.bottomMm),
    heightMm: Math.round(rect.heightMm),
    thicknessMm: shopOf(production).frontMm,
    front: defaultPanelFront(kind),
  };
  if (kind === 'slats') panel.slats = { direction: 'vertical', ...SLAT_DEFAULTS };
  if (kind === 'insert') panel.insert = { marginMm: INSERT_MARGIN_MM, front: { base: 'veneer_solid', construct: 'solid', finish: 'matte', colorHex: '#9a7650' } };
  const pieces = Math.max(1, Math.ceil(panel.widthMm / PANEL_PIECE_MM));
  if (kind !== 'slats' && pieces > 1) panel.pieces = pieces;
  return panel;
}

export function panelRect(panel: WallPanel): FaceRect {
  return { x0: panel.fromMm, x1: panel.fromMm + panel.widthMm, y0: panel.bottomMm, y1: panel.bottomMm + panel.heightMm };
}

/** Насколько панель выходит от стены: со вставкой — две плиты. */
export function wallPanelDepthMm(panel: WallPanel): number {
  return panel.kind === 'insert' ? 2 * panel.thicknessMm : panel.thicknessMm;
}

/** Рейки панели — где каждая, мм ряда (`u` у вертикальных, `v` у горизонтальных). */
export function slatLayout(panel: WallPanel): { from: number; to: number }[] {
  if (panel.kind !== 'slats' || !panel.slats) return [];
  const { widthMm: w, gapMm: g, direction } = panel.slats;
  const span = direction === 'vertical' ? panel.widthMm : panel.heightMm;
  const start = direction === 'vertical' ? panel.fromMm : panel.bottomMm;
  const count = Math.max(0, Math.floor((span + g) / (w + g)));
  if (count === 0) return [];
  const used = count * w + (count - 1) * g;
  const margin = (span - used) / 2;
  return Array.from({ length: count }, (_, i) => {
    const from = start + margin + i * (w + g);
    return { from: Math.round(from * 10) / 10, to: Math.round((from + w) * 10) / 10 };
  });
}

/** Части панели по ширине — где стыки, мм ряда. */
export function panelPieces(panel: WallPanel): { from: number; to: number }[] {
  const n = Math.max(1, Math.round(panel.pieces ?? 1));
  const w = panel.widthMm / n;
  return Array.from({ length: n }, (_, i) => ({
    from: Math.round((panel.fromMm + i * w) * 10) / 10,
    to: Math.round((panel.fromMm + (i + 1) * w) * 10) / 10,
  }));
}

/** Какие углы у части панели скруглены: левая часть — левые углы, правая — правые. */
export type PanelCorners = { r: number; tl: boolean; tr: boolean; bl: boolean; br: boolean };

/**
 * ДЕТАЛЬ ПАНЕЛИ — ОДНА НА РАСКРОЙ, СМЕТУ, СЦЕНУ И ЧЕРТЁЖ.
 *
 *   board   часть плиты панели (стыки — `pieces`); у крайних частей скруглённые
 *           углы (`corners`) — контур на ЧПУ;
 *   slat    рейка: из листа лицевой стороны, на стену без подложки;
 *   insert  вставка: плита своего материала поверх основы, поле от края.
 */
export type WallPanelPart = {
  key: string;
  kind: 'board' | 'slat' | 'insert';
  name: string;
  /** Мм ряда. */
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  /** От стены, мм. */
  w0: number;
  w1: number;
  front: FrontSpec;
  corners?: PanelCorners;
  /** Видимые вертикальные торцы: у частей панели внутренние стыки не видны. */
  ends: { left: boolean; right: boolean };
};

export function wallPanelParts(panel: WallPanel): WallPanelPart[] {
  const t = panel.thicknessMm;
  const title = WALL_PANEL_TITLE[panel.kind];
  const v0 = panel.bottomMm;
  const v1 = panel.bottomMm + panel.heightMm;
  if (panel.kind === 'slats') {
    const vertical = panel.slats?.direction !== 'horizontal';
    return slatLayout(panel).map((slat, i) => ({
      key: `${panel.id}:slat:${i}`,
      kind: 'slat',
      name: 'Рейка',
      u0: vertical ? slat.from : panel.fromMm,
      u1: vertical ? slat.to : panel.fromMm + panel.widthMm,
      v0: vertical ? v0 : slat.from,
      v1: vertical ? v1 : slat.to,
      w0: 0,
      w1: t,
      front: panel.front,
      ends: { left: true, right: true },
    }));
  }
  const pieces = panelPieces(panel);
  const r = panel.cornerRadiusMm ?? 0;
  const boards: WallPanelPart[] = pieces.map((piece, i) => ({
    key: `${panel.id}:board:${i}`,
    kind: 'board',
    name: pieces.length > 1 ? `${title} · часть ${i + 1}` : title,
    u0: piece.from,
    u1: piece.to,
    v0,
    v1,
    w0: 0,
    w1: t,
    front: panel.front,
    ends: { left: i === 0, right: i === pieces.length - 1 },
    ...(r > 0
      ? { corners: { r, tl: i === 0, bl: i === 0, tr: i === pieces.length - 1, br: i === pieces.length - 1 } }
      : {}),
  }));
  if (panel.kind === 'insert' && panel.insert) {
    const m = panel.insert.marginMm;
    boards.push({
      key: `${panel.id}:insert:0`,
      kind: 'insert',
      name: 'Вставка',
      u0: panel.fromMm + m,
      u1: panel.fromMm + panel.widthMm - m,
      v0: v0 + m,
      v1: v1 - m,
      w0: t,
      w1: 2 * t,
      front: panel.insert.front,
      ends: { left: true, right: true },
    });
  }
  return boards;
}

/**
 * ДЕТАЛЬ ПАНЕЛИ В РАСКРОЕ: сторона вдоль текстуры, торцы под кромку и длина
 * кромки точной длиной (скруглённый угол: две прямые по R меньше и дуга).
 * Текстура — вдоль рейки, у плит и вставки — по высоте стены.
 *
 * Кромки нет у эмали и плёнки — то же правило, что у фасада (`banded`).
 */
export function wallPanelPartCut(part: WallPanelPart, banded: boolean): {
  lengthMm: number;
  widthMm: number;
  edges: { long: number; short: number };
  edgeMm: number;
} {
  const w = Math.round(part.u1 - part.u0);
  const h = Math.round(part.v1 - part.v0);
  const horizontal = part.kind === 'slat' && w > h;
  const lengthMm = horizontal ? w : h;
  const widthMm = horizontal ? h : w;
  /* Видимые торцы вдоль длины: у плиты — свои края (не стыки частей), у рейки и вставки — оба. */
  const longVisible = part.kind === 'board' ? Number(part.ends.left) + Number(part.ends.right) : 2;
  const edges = banded ? { long: longVisible, short: 2 } : { long: 0, short: 0 };
  const c = part.corners;
  const rounded = c ? [c.tl, c.tr, c.bl, c.br].filter(Boolean).length : 0;
  const straight = edges.long * lengthMm + edges.short * widthMm;
  const edgeMm = banded ? straight - rounded * 2 * (c?.r ?? 0) + wallPanelPartCurvedMm(part) : 0;
  return { lengthMm, widthMm, edges, edgeMm: Math.round(edgeMm * 10) / 10 };
}

/**
 * КОНТУР ДЕТАЛИ ПАНЕЛИ СО СКРУГЛЁННЫМИ УГЛАМИ, мм от её центра — замкнутый
 * обход против часовой: прямые и дуги радиуса `r` у отмеченных углов (дуга —
 * хордами не длиннее 5°). Одна функция на рёбра сцены, чертёж и проверки.
 */
export function panelOutlineMm(widthMm: number, heightMm: number, corners: PanelCorners | undefined): [number, number][] {
  const x0 = -widthMm / 2;
  const x1 = widthMm / 2;
  const y0 = -heightMm / 2;
  const y1 = heightMm / 2;
  const r = corners?.r ?? 0;
  const arc = (cx: number, cy: number, from: number, to: number): [number, number][] => {
    const steps = Math.max(2, Math.ceil(Math.abs(to - from) / (Math.PI / 36)));
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = from + ((to - from) * i) / steps;
      return [cx + r * Math.cos(t), cy + r * Math.sin(t)] as [number, number];
    });
  };
  const out: [number, number][] = [];
  if (corners?.bl && r > 0) out.push(...arc(x0 + r, y0 + r, Math.PI, 1.5 * Math.PI));
  else out.push([x0, y0]);
  if (corners?.br && r > 0) out.push(...arc(x1 - r, y0 + r, 1.5 * Math.PI, 2 * Math.PI));
  else out.push([x1, y0]);
  if (corners?.tr && r > 0) out.push(...arc(x1 - r, y1 - r, 0, 0.5 * Math.PI));
  else out.push([x1, y1]);
  if (corners?.tl && r > 0) out.push(...arc(x0 + r, y1 - r, 0.5 * Math.PI, Math.PI));
  else out.push([x0, y1]);
  return out;
}

/** Площадь детали по контуру, м²: скруглённый угол отнимает квадрат без четверти круга. */
export function wallPanelPartAreaM2(part: WallPanelPart): number {
  const w = part.u1 - part.u0;
  const h = part.v1 - part.v0;
  const c = part.corners;
  const n = c ? [c.tl, c.tr, c.bl, c.br].filter(Boolean).length : 0;
  const r = c?.r ?? 0;
  return (w * h - n * (r * r - (Math.PI * r * r) / 4)) / 1e6;
}

/** Длина дуг контура детали, мм: её фрезеруют на ЧПУ. */
export function wallPanelPartCurvedMm(part: WallPanelPart): number {
  const c = part.corners;
  if (!c) return 0;
  const n = [c.tl, c.tr, c.bl, c.br].filter(Boolean).length;
  return n * (Math.PI / 2) * c.r;
}

const inRange = (value: number, [lo, hi]: readonly [number, number]) => Number.isFinite(value) && value >= lo && value <= hi;

/**
 * ВСТАНЕТ ЛИ ПАНЕЛЬ — словами; `null` — встаёт.
 *
 * Мебель стоит на стене, а не на панели: панель с модулями по фасаду не
 * пересекается. Две панели не лежат одна на другой. Рисунок реек и вставка —
 * числами, которые укладываются в панель.
 */
export function wallPanelRefusal(
  run: Pick<Run, 'modules' | 'upperSegments' | 'lengthMm' | 'zone' | 'ceilingHeightMm' | 'options'> & Partial<Run>,
  panel: WallPanel,
): string | null {
  const title = `«${WALL_PANEL_TITLE[panel.kind] ?? 'Панель'}»`;
  if (!WALL_PANEL_KINDS.includes(panel.kind)) return `Панели «${String(panel.kind)}» нет.`;
  if (!inRange(panel.widthMm, PANEL_LIMITS.sizeMm) || !inRange(panel.heightMm, PANEL_LIMITS.sizeMm)) {
    return `${title}: ${panel.widthMm} × ${panel.heightMm} мм — стороны панели от ${PANEL_LIMITS.sizeMm[0]} до ${PANEL_LIMITS.sizeMm[1]} мм.`;
  }
  if (!inRange(panel.thicknessMm, PANEL_LIMITS.thicknessMm)) {
    return `${title}: толщина ${panel.thicknessMm} мм — от ${PANEL_LIMITS.thicknessMm[0]} до ${PANEL_LIMITS.thicknessMm[1]} мм.`;
  }
  const r = panelRect(panel);
  if (r.x0 < 0 || r.x1 > run.lengthMm) return `${title} выходит за ряд ${run.lengthMm} мм на ${Math.max(-r.x0, r.x1 - run.lengthMm)} мм.`;
  if (r.y0 < 0) return `${title}: низ ниже пола на ${-r.y0} мм.`;
  if (r.y1 > run.ceilingHeightMm) return `${title}: верх ${r.y1} мм выше потолка ${run.ceilingHeightMm} мм на ${r.y1 - run.ceilingHeightMm} мм.`;
  if (panel.kind === 'slats') {
    const slats = panel.slats;
    if (!slats) return `${title}: не задан рисунок реек.`;
    if (!inRange(slats.widthMm, PANEL_LIMITS.slatWidthMm)) return `${title}: ширина рейки ${slats.widthMm} мм — от ${PANEL_LIMITS.slatWidthMm[0]} до ${PANEL_LIMITS.slatWidthMm[1]} мм.`;
    if (!inRange(slats.gapMm, PANEL_LIMITS.slatGapMm)) return `${title}: зазор ${slats.gapMm} мм — от ${PANEL_LIMITS.slatGapMm[0]} до ${PANEL_LIMITS.slatGapMm[1]} мм.`;
    if (slatLayout(panel).length === 0) return `${title}: рейка ${slats.widthMm} мм шире панели — ни одной не встаёт.`;
    if (panel.cornerRadiusMm) return `${title}: у реек скругления углов нет — у каждой рейки свои торцы.`;
  }
  if (panel.kind === 'insert') {
    const m = panel.insert?.marginMm ?? -1;
    if (!(m >= 20 && panel.widthMm - 2 * m >= 100 && panel.heightMm - 2 * m >= 100)) {
      return `${title}: поле вставки ${m} мм — от 20 мм, и вставке остаётся от 100 мм по каждой стороне.`;
    }
  }
  if (panel.kind === 'milled' && !panel.front.relief) return `${title}: рисунок фрезеровки не выбран.`;
  if (panel.kind === 'milled' && panel.cornerRadiusMm) {
    return `${title}: рисунок фрезеровки строится на прямоугольной панели — скругления углов у неё нет.`;
  }
  const pieces = Math.round(panel.pieces ?? 1);
  if (!inRange(pieces, PANEL_LIMITS.pieces) || panel.widthMm / pieces < 100) {
    return `${title}: частей ${pieces} — от ${PANEL_LIMITS.pieces[0]} до ${PANEL_LIMITS.pieces[1]}, и каждая не уже 100 мм.`;
  }
  const radius = panel.cornerRadiusMm ?? 0;
  if (radius !== 0) {
    const piece = panel.widthMm / pieces;
    const limit = Math.floor(Math.min(piece, panel.heightMm) / 2);
    if (!(Number.isInteger(radius) && radius >= 10 && radius <= limit)) {
      return `${title}: радиус угла ${radius} мм — целым числом от 10 до ${limit} мм (половина меньшей стороны крайней части).`;
    }
  }
  for (const unit of allRowModules(run)) {
    const o = overlap(r, moduleFaceRect(unit, run));
    if (o) return `${title} заходит за «${unit.label}» на ${intrusionMm(o)} мм — мебель стоит на стене, а не на панели. Сдвиньте или уменьшите панель.`;
  }
  for (const other of run.wallPanels ?? []) {
    if (other.id === panel.id) continue;
    const o = overlap(r, panelRect(other));
    if (o) return `${title} ложится на «${WALL_PANEL_TITLE[other.kind]}» на ${intrusionMm(o)} мм — панели не кладут одну на другую.`;
  }
  return null;
}

/* ─────────────────────────  Что предложить кнопкой «+»  ───────────────────────── */

/** Верх мебели под точкой ряда `u`, мм от пола; под ней пусто — 0. */
function furnitureTopAt(
  run: Pick<Run, 'modules' | 'upperSegments' | 'zone' | 'ceilingHeightMm' | 'options'> & Partial<Run>,
  u: number,
): number {
  let top = 0;
  for (const unit of allRowModules(run)) {
    const face = moduleFaceRect(unit, run);
    if (u >= face.x0 && u <= face.x1 && face.y0 < 1200) top = Math.max(top, face.y1);
  }
  return top;
}

/**
 * ТЕЛЕВИЗОР ДЛЯ КНОПКИ «+ ТЕЛЕВИЗОР»: по центру ряда, над мебелью под центром
 * на зазор раскладки (`TV_ZONE_RULES.tvGapMm`); под центром пусто — на высоте,
 * где он стоит в варианте A (над подвесной тумбой). Самый большой из ряда
 * диагоналей, который встаёт (`tvRefusal`); ни один — отказ словами.
 */
export function suggestTv(
  run: Pick<Run, 'modules' | 'upperSegments' | 'lengthMm' | 'zone' | 'ceilingHeightMm' | 'options'> & Partial<Run>,
): TvSpec | { refusal: string } {
  const R = TV_ZONE_RULES;
  const centerMm = Math.round(run.lengthMm / 2);
  const below = furnitureTopAt(run, centerMm);
  const bottomMm = below > 0 ? below + R.tvGapMm : R.hangMm + 450 + R.tvGapMm;
  let last: string | null = null;
  for (const d of [...TV_DIAGONALS_IN].reverse()) {
    const tv = tvFromDiagonal(d, { centerMm, bottomMm });
    if (tv.widthMm > run.lengthMm - 2 * R.tvSideMm) continue;
    last = tvRefusal(run, tv);
    if (!last) return tv;
  }
  return { refusal: last ?? `Ряд ${run.lengthMm} мм: телевизор ${TV_DIAGONALS_IN[0]}″ не встаёт и по ширине.` };
}

/**
 * ПАНЕЛЬ ДЛЯ КНОПКИ «+ ПАНЕЛЬ»: за телевизором — шире его на 300 мм с каждой
 * стороны, от верха мебели под ним до 300 мм над ним; без телевизора — 1200 мм
 * по центру ряда до верха зоны. Не встаёт — уже (на 100 мм с каждой стороны от
 * телевизора), и тогда отказ — словами `wallPanelRefusal`.
 */
export function suggestPanel(
  run: Pick<Run, 'modules' | 'upperSegments' | 'lengthMm' | 'zone' | 'ceilingHeightMm' | 'options'> & Partial<Run>,
  kind: WallPanelKind,
  production?: ProductionSettings,
): WallPanel | { refusal: string } {
  const id = nextPanelId(run);
  const top = zoneHeightMm(run.zone ?? 'living', run.ceilingHeightMm, production ?? run.production);
  const tv = run.tv ? tvRect(run.tv) : null;
  const center = run.tv ? run.tv.centerMm : Math.round(run.lengthMm / 2);
  const bottom = furnitureTopAt(run, center);
  const candidates: { from: number; to: number; y1: number }[] = tv
    ? [
        { from: tv.x0 - 300, to: tv.x1 + 300, y1: Math.min(top, tv.y1 + 300) },
        { from: tv.x0 - 100, to: tv.x1 + 100, y1: Math.min(top, tv.y1 + 100) },
      ]
    : [{ from: center - 600, to: center + 600, y1: top }];
  let last = '';
  for (const c of candidates) {
    const from = Math.max(0, Math.round(c.from));
    const to = Math.min(run.lengthMm, Math.round(c.to));
    const panel = newWallPanel(id, kind, { fromMm: from, widthMm: to - from, bottomMm: bottom, heightMm: Math.max(100, c.y1 - bottom) }, production ?? run.production);
    const words = wallPanelRefusal(run, panel) ?? (run.tv ? tvRefusal({ ...run, wallPanels: [...(run.wallPanels ?? []), panel] }, run.tv) : null);
    if (!words) return panel;
    last = words;
  }
  return { refusal: last };
}

/* ─────────────────────────  Правка: что принимается  ───────────────────────── */

/**
 * ТЕЛЕВИЗОР И ПАНЕЛИ — В ЗАЛЕ. Кухня, спальня, прихожая и санузел со своими
 * рядами (фартук, витрины, зеркала) эту проверку не проходили: на них
 * телевизор и панели не ставятся, и это сказано, а не сделано молча.
 */
export function tvZoneRefusal(zone: Run['zone'] | undefined): string | null {
  return (zone ?? 'kitchen') === 'living'
    ? null
    : 'Телевизор и декоративные панели стены — в зале (ТВ-зона): на этой стене их не ставят.';
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Телевизор из правки: числа — целыми мм, поля — только известные; мусор — `null`. */
export function normalizedTv(tv: TvSpec): TvSpec | null {
  const numbers = [tv.diagonalIn, tv.widthMm, tv.heightMm, tv.depthMm, tv.bezelMm, tv.centerMm, tv.bottomMm];
  if (!numbers.every(finite)) return null;
  if (tv.mountMm !== undefined && !finite(tv.mountMm)) return null;
  if (tv.supply !== 'client' && tv.supply !== 'company') return null;
  return {
    diagonalIn: Math.round(tv.diagonalIn * 10) / 10,
    widthMm: Math.round(tv.widthMm),
    heightMm: Math.round(tv.heightMm),
    depthMm: Math.round(tv.depthMm),
    bezelMm: Math.round(tv.bezelMm),
    centerMm: Math.round(tv.centerMm),
    bottomMm: Math.round(tv.bottomMm),
    ...(tv.measured ? { measured: true as const } : {}),
    ...(tv.mountMm !== undefined ? { mountMm: Math.round(tv.mountMm) } : {}),
    supply: tv.supply,
  };
}

/** Панель из правки: числа — целыми мм, у вида — только его поля; пусто не пишется (ловушка 246). */
export function normalizedPanel(panel: WallPanel): WallPanel | null {
  if (typeof panel.id !== 'string' || !/^[\w-]{1,24}$/.test(panel.id)) return null;
  if (!WALL_PANEL_KINDS.includes(panel.kind)) return null;
  const numbers = [panel.fromMm, panel.widthMm, panel.bottomMm, panel.heightMm, panel.thicknessMm];
  if (!numbers.every(finite) || !panel.front || typeof panel.front !== 'object') return null;
  const next: WallPanel = {
    id: panel.id,
    kind: panel.kind,
    fromMm: Math.round(panel.fromMm),
    widthMm: Math.round(panel.widthMm),
    bottomMm: Math.round(panel.bottomMm),
    heightMm: Math.round(panel.heightMm),
    thicknessMm: Math.round(panel.thicknessMm),
    front: panel.front,
  };
  if (panel.kind === 'slats' && panel.slats) {
    if (!finite(panel.slats.widthMm) || !finite(panel.slats.gapMm)) return null;
    next.slats = {
      direction: panel.slats.direction === 'horizontal' ? 'horizontal' : 'vertical',
      widthMm: Math.round(panel.slats.widthMm),
      gapMm: Math.round(panel.slats.gapMm),
    };
  }
  if (panel.kind === 'insert' && panel.insert) {
    if (!finite(panel.insert.marginMm) || !panel.insert.front) return null;
    next.insert = { marginMm: Math.round(panel.insert.marginMm), front: panel.insert.front };
  }
  if (panel.cornerRadiusMm !== undefined && panel.cornerRadiusMm !== 0) {
    if (!finite(panel.cornerRadiusMm)) return null;
    next.cornerRadiusMm = panel.cornerRadiusMm;
  }
  if (panel.pieces !== undefined && panel.pieces !== 1) {
    if (!finite(panel.pieces)) return null;
    next.pieces = panel.pieces;
  }
  return next;
}

/** Ключ новой панели ряда: `wp1`, `wp2`… — не повторяет живые. */
export function nextPanelId(run: Pick<Run, 'wallPanels'>): string {
  const used = new Set((run.wallPanels ?? []).map((panel) => panel.id));
  let k = (run.wallPanels?.length ?? 0) + 1;
  while (used.has(`wp${k}`)) k += 1;
  return `wp${k}`;
}

/* ─────────────────────────  Готовые варианты A, B, C  ───────────────────────── */

export const TV_ZONE_TITLE: Record<TvZoneVariant, string> = {
  A: 'ТВ-зона минималистичная',
  B: 'ТВ-зона с радиусной тумбой',
  C: 'Большая ТВ-зона',
};

export const TV_ZONE_HINT: Record<TvZoneVariant, string> = {
  A: 'Подвесная тумба без ручек, телевизор над ней',
  B: 'Подвесная тумба со скруглёнными торцами, телевизор',
  C: 'Декоративная стена из реек, телевизор, две витрины с подсветкой',
};

/** Числа раскладки — рисунок композиции, а не производство: их правят руками после сборки. */
export const TV_ZONE_RULES = {
  /** Низ подвесной тумбы от пола, мм. */
  hangMm: 300,
  /** Зазор от верха тумбы до низа телевизора, мм. */
  tvGapMm: 150,
  /** Телевизор уже тумбы и панели на столько с каждой стороны, мм. */
  tvSideMm: 100,
  /** Поле у стены по краям подвесной тумбы: A — 200, B — 300 (у скруглённого торца проход). */
  marginA: 200,
  marginB: 300,
  /** Тумба: от и до, мм. */
  unitMinA: 1200,
  unitMaxA: 2400,
  unitMinB: 1600,
  unitMaxB: 2800,
  unitMinC: 1200,
  unitMaxC: 3000,
  /** Витрина варианта C: ширина и зазор до тумбы, мм. */
  vitrineMm: 450,
  vitrineGapMm: 100,
} as const;

/** С какой длины стены вариант собирается. */
export function tvZoneMinLengthMm(variant: TvZoneVariant): number {
  const R = TV_ZONE_RULES;
  if (variant === 'A') return R.unitMinA + 2 * R.marginA;
  if (variant === 'B') return R.unitMinB + 2 * R.marginB;
  return 2 * R.vitrineMm + 2 * R.vitrineGapMm + R.unitMinC;
}

export type TvZonePlanModule = {
  section: 'tv_drawers' | 'tv_doors' | 'tv_open' | 'glass_display';
  kind: 'base' | 'upper' | 'tall';
  offsetMm: number;
  widthMm: number;
  /** Низ подвесного модуля от пола, мм. */
  hangMm?: number;
  radius?: RadiusSpec;
  vitrine?: VitrineSpec;
  glassShelves?: true;
};

export type TvZonePlan = { modules: TvZonePlanModule[]; panels: WallPanel[]; tv: TvSpec };

/** Модули тумбы по ширине: ящики по краям, дверцы между ними. */
function unitSections(count: number): ('tv_drawers' | 'tv_doors')[] {
  if (count <= 1) return ['tv_doors'];
  if (count === 2) return ['tv_drawers', 'tv_doors'];
  return Array.from({ length: count }, (_, i) => (i === 0 || i === count - 1 ? 'tv_drawers' : 'tv_doors'));
}

/** Делит ширину тумбы на модули не шире 1000 мм: целые миллиметры, остаток — последнему. */
function splitWidth(totalMm: number, maxMm = 1000, minCount = 1): number[] {
  const count = Math.max(minCount, Math.ceil(totalMm / maxMm));
  const base = Math.floor(totalMm / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? totalMm - base * (count - 1) : base));
}

const roundDown100 = (mm: number) => Math.floor(mm / 100) * 100;

/** Самый большой телевизор из ряда диагоналей шириной не больше `maxWidthMm` и высотой не больше `maxHeightMm`. */
function largestTv(maxWidthMm: number, maxHeightMm: number): number | null {
  let best: number | null = null;
  for (const d of TV_DIAGONALS_IN) {
    const s = tvScreenMm(d);
    if (s.widthMm + 2 * TV_BEZEL_MM <= maxWidthMm && s.heightMm + 2 * TV_BEZEL_MM <= maxHeightMm) best = d;
  }
  return best;
}

/**
 * РАСКЛАДКА ВАРИАНТА ПОД ДЛИНУ СТЕНЫ — или отказ с миллиметрами.
 *
 *   A  подвесная тумба по центру (без ручек — от нажатия), телевизор над ней;
 *   B  подвесная тумба со скруглёнными торцами (открытые полки по дуге, R —
 *      глубина корпуса), телевизор над ней;
 *   C  две высокие витрины по краям (каркас из профиля, стеклянные полки,
 *      подсветка по контуру), напольная тумба между ними, над тумбой —
 *      стена из реек от верха тумбы до верха зоны, телевизор на ней.
 *
 * Тумба шире — модулей больше: ни один не шире 1000 мм. Телевизор — самый
 * большой из ряда, что уже тумбы на 100 мм с каждой стороны и помещается по
 * высоте. Пересечений нет по построению; их проверяет и движок ряда.
 */
export function tvZonePlan(
  variant: TvZoneVariant,
  input: { lengthMm: number; ceilingHeightMm: number; zone?: Run['zone']; production?: ProductionSettings; depthMm: number },
): TvZonePlan | { refusal: string } {
  const R = TV_ZONE_RULES;
  const L = Math.round(input.lengthMm);
  const need = tvZoneMinLengthMm(variant);
  if (L < need) {
    return { refusal: tvZoneShortWords(variant, L, need) };
  }
  const top = zoneHeightMm(input.zone ?? 'living', input.ceilingHeightMm, input.production);
  const unitHeight = 450;
  const tvPlace = (unitFrom: number, unitWidth: number, unitTop: number, ceilingMm: number, panelWidth?: number) => {
    const maxWidth = Math.min(unitWidth, panelWidth ?? unitWidth) - 2 * R.tvSideMm;
    const bottom = unitTop + R.tvGapMm;
    const d = largestTv(maxWidth, ceilingMm - bottom);
    return d ? tvFromDiagonal(d, { centerMm: unitFrom + unitWidth / 2, bottomMm: bottom }) : null;
  };

  if (variant === 'A' || variant === 'B') {
    const margin = variant === 'A' ? R.marginA : R.marginB;
    const width = Math.min(variant === 'A' ? R.unitMaxA : R.unitMaxB, roundDown100(L - 2 * margin));
    const from = Math.round((L - width) / 2);
    const modules: TvZonePlanModule[] = [];
    let at = from;
    if (variant === 'A') {
      const widths = splitWidth(width, 1000, width > 1400 ? 3 : 2);
      const sections = unitSections(widths.length);
      widths.forEach((w, i) => {
        modules.push({ section: sections[i], kind: 'upper', offsetMm: at, widthMm: w, hangMm: R.hangMm });
        at += w;
      });
    } else {
      const end = input.depthMm;
      const middle = splitWidth(width - 2 * end, 1000, 1);
      const sections = unitSections(middle.length);
      modules.push({ section: 'tv_open', kind: 'upper', offsetMm: at, widthMm: end, hangMm: R.hangMm, radius: { place: 'left', radiusMm: end, cover: 'open' } });
      at += end;
      middle.forEach((w, i) => {
        modules.push({ section: sections[i], kind: 'upper', offsetMm: at, widthMm: w, hangMm: R.hangMm });
        at += w;
      });
      modules.push({ section: 'tv_open', kind: 'upper', offsetMm: at, widthMm: end, hangMm: R.hangMm, radius: { place: 'right', radiusMm: end, cover: 'open' } });
    }
    const tv = tvPlace(from, width, R.hangMm + unitHeight, top);
    if (!tv) return { refusal: `${TV_ZONE_TITLE[variant]}: над тумбой ${width} мм не встаёт и телевизор ${TV_DIAGONALS_IN[0]}″ — нужна тумба от ${tvScreenMm(TV_DIAGONALS_IN[0]).widthMm + 2 * TV_BEZEL_MM + 2 * R.tvSideMm} мм.` };
    return { modules, panels: [], tv };
  }

  /* C — витрины у краёв стены, тумба между ними, стена из реек над тумбой. */
  const vitrine = R.vitrineMm;
  const room = L - 2 * vitrine - 2 * R.vitrineGapMm;
  const width = Math.min(R.unitMaxC, roundDown100(room));
  const from = Math.round((L - width) / 2);
  const modules: TvZonePlanModule[] = [
    {
      section: 'glass_display',
      kind: 'tall',
      offsetMm: 0,
      widthMm: vitrine,
      vitrine: { construction: 'frame', led: 'contour' },
      glassShelves: true,
    },
  ];
  let at = from;
  const widths = splitWidth(width, 1000, width > 1400 ? 3 : 2);
  const sections = unitSections(widths.length);
  widths.forEach((w, i) => {
    modules.push({ section: sections[i], kind: 'base', offsetMm: at, widthMm: w });
    at += w;
  });
  modules.push({
    section: 'glass_display',
    kind: 'tall',
    offsetMm: L - vitrine,
    widthMm: vitrine,
    vitrine: { construction: 'frame', led: 'contour' },
    glassShelves: true,
  });
  const unitTop = plinthMm(input.production) + unitHeight;
  const panelFrom = vitrine;
  const panelWidth = L - 2 * vitrine;
  const panel = newWallPanel('wp1', 'slats', { fromMm: panelFrom, widthMm: panelWidth, bottomMm: unitTop, heightMm: Math.max(100, top - unitTop) }, input.production);
  const tv = tvPlace(from, width, unitTop, top - R.tvSideMm, panelWidth);
  if (!tv) return { refusal: `${TV_ZONE_TITLE.C}: над тумбой ${width} мм не встаёт и телевизор ${TV_DIAGONALS_IN[0]}″.` };
  return { modules, panels: [panel], tv };
}

/**
 * ГОТОВАЯ ТВ-ЗОНА НЕ СОБРАЛАСЬ НА ЭТОЙ СТЕНЕ — словами раскладки (`tvZonePlan`,
 * она кладёт отказ в `warnings` пустого ряда); `null` — собралась, правлена
 * руками или это не ТВ-зона. Экран называет это блокирующим (`screenState`).
 */
export function tvZoneFitRefusal(
  requirements: { tvZone?: TvZoneVariant; zone?: Run['zone'] },
  run: Pick<Run, 'modules' | 'warnings'>,
): string | null {
  const variant = requirements.tvZone;
  if (!variant || requirements.zone !== 'living' || run.modules.length > 0) return null;
  return run.warnings.find((words) => words.startsWith(TV_ZONE_TITLE[variant])) ?? null;
}

/** Отказ варианта по длине — словами, с миллиметрами и тем, из чего они. */
export function tvZoneShortWords(variant: TvZoneVariant, lengthMm: number, needMm = tvZoneMinLengthMm(variant)): string {
  const R = TV_ZONE_RULES;
  const parts =
    variant === 'A'
      ? `тумба от ${R.unitMinA} мм и по ${R.marginA} мм стены с каждой стороны`
      : variant === 'B'
        ? `тумба со скруглёнными торцами от ${R.unitMinB} мм и по ${R.marginB} мм прохода у торцов`
        : `две витрины по ${R.vitrineMm} мм, зазоры по ${R.vitrineGapMm} мм и тумба от ${R.unitMinC} мм`;
  return `${TV_ZONE_TITLE[variant]} не помещается: стене нужно от ${needMm} мм (${parts}), а она ${lengthMm} мм — не хватает ${needMm - lengthMm} мм.`;
}
