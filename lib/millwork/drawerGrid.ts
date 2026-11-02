import { DEFAULT_ALLOWANCES, type ProductionSettings } from '@/types/catalog';
import type { Module, ModuleFill } from '@/types/millwork';

/**
 * ЯЩИКИ НА ВСЮ ШИРИНУ — РЯДЫ И СТОЛБЦЫ (ТЗ 2026-11-02, A4; решение владельца: перегородка +
 * перемычка, накладные фасады).
 *
 * Канон — `fill.drawerHeights` (места РЯДОВ сверху вниз, сумма = корпус) и `fill.drawerSplit`
 * (верхние `rows` рядов разделены на два столбца перегородкой; `leftMm` — место левого столбца
 * от левого края модуля до оси перегородки). Отсюда одна раскладка — ячейки (`drawerCells`): их
 * зовут раскрой, сцена, комплект ящика, смета, отпечаток, чертёж и редактор. Деталь ячейки — место
 * минус зазор цеха (`drawerFrontCutMm`).
 *
 * Конструкция: перегородка — от крыши вниз на высоту разделённых рядов; если ниже идёт ряд на всю
 * ширину — горизонтальная перемычка сразу под границей (внутри его зоны), и перегородка стоит на
 * ней; разделены все ряды — перегородка до дна. Глубина обеих — корпус минус припуск перегородки
 * цеха (`allowances.dividerDepthMm`), как у перегородок отсеков. Присадку их правила цеха не задают —
 * у детали «присадка не рассчитана» словами (тот же путь, что у прочих деталей без правил).
 *
 * Ключ детали фасада — `drawer:<k>` по порядку чтения (ряд за рядом, слева направо): без деления
 * k = номер ряда, как было до A4; регулярки `drawer:\d+` у всех потребителей те же.
 */

/** Перегородка ящиков не ближе к боковине (просвет столбца): уже — направляющей негде стоять. */
export const MIN_DRAWER_COLUMN_MM = 150;

export type DrawerCell = {
  /** `drawer:<k>` — деталь так, как её зовут сцена, раскрой и смета. */
  leaf: string;
  index: number;
  row: number;
  column: 0 | 1;
  columns: 1 | 2;
  /** Место ячейки: левый край от левого края модуля и ширина; низ от дна корпуса и высота, мм. */
  xMm: number;
  widthMm: number;
  yMm: number;
  heightMm: number;
};

/** Деталь фасада ящика: место минус зазор цеха — одна формула на раскрой, сцену и редактор. */
export function drawerFrontCutMm(slotHeightMm: number, slotWidthMm: number, gapMm: number): { heightMm: number; widthMm: number } {
  return { heightMm: slotHeightMm - gapMm, widthMm: slotWidthMm - gapMm };
}

/** Деление, которое можно применить к этим рядам; иначе — нет деления (раскладка как до A4). */
export function drawerSplitOf(fill: Pick<ModuleFill, 'drawerHeights' | 'drawerSplit'> | undefined, widthMm: number): { leftMm: number; rows: number } | null {
  const split = fill?.drawerSplit;
  const n = fill?.drawerHeights.length ?? 0;
  if (!split || n === 0) return null;
  if (!Number.isInteger(split.rows) || split.rows < 1 || split.rows > n) return null;
  if (!Number.isFinite(split.leftMm) || split.leftMm <= 0 || split.leftMm >= widthMm) return null;
  return split;
}

/** Ячейки ящиков модуля: ряд за рядом сверху вниз, в разделённом ряду — слева направо. */
export function drawerCells(fill: Pick<ModuleFill, 'drawerHeights' | 'drawerSplit'> | undefined, widthMm: number, carcassMm: number): DrawerCell[] {
  const heights = fill?.drawerHeights ?? [];
  const split = drawerSplitOf(fill, widthMm);
  const out: DrawerCell[] = [];
  let above = 0;
  heights.forEach((h, row) => {
    const yMm = carcassMm - above - h;
    above += h;
    if (split && row < split.rows) {
      out.push({ leaf: `drawer:${out.length}`, index: out.length, row, column: 0, columns: 2, xMm: 0, widthMm: split.leftMm, yMm, heightMm: h });
      out.push({ leaf: `drawer:${out.length}`, index: out.length, row, column: 1, columns: 2, xMm: split.leftMm, widthMm: widthMm - split.leftMm, yMm, heightMm: h });
    } else {
      out.push({ leaf: `drawer:${out.length}`, index: out.length, row, column: 0, columns: 1, xMm: 0, widthMm, yMm, heightMm: h });
    }
  });
  return out;
}

export type DrawerSplitBody = {
  kind: 'partition' | 'traverse';
  /** ИД детали — общий у сцены и раскроя: `<модуль>:drawer-partition`, `<модуль>:drawer-traverse`. */
  partId: string;
  xFromMm: number;
  xToMm: number;
  /** Низ и верх от дна корпуса, мм. */
  yFromMm: number;
  yToMm: number;
  /** Глубина от передней кромки корпуса назад, мм. */
  depthMm: number;
  /** Размеры детали в раскрое: длина и ширина, мм. */
  lengthMm: number;
  widthMm: number;
};

/** Перегородка и перемычка деления на столбцы — числами, по которым режет цех и рисует сцена. */
export function drawerSplitBodies(
  unit: Pick<Module, 'id' | 'widthMm' | 'fill'>,
  carcassMm: number,
  depthMm: number,
  production: { carcassMm: number; allowances?: ProductionSettings['allowances'] },
): DrawerSplitBody[] {
  const split = drawerSplitOf(unit.fill, unit.widthMm);
  if (!split || !unit.fill) return [];
  const t = production.carcassMm;
  const allow = production.allowances ?? DEFAULT_ALLOWANCES;
  const depth = depthMm - allow.dividerDepthMm;
  const heights = unit.fill.drawerHeights;
  const boundary = carcassMm - heights.slice(0, split.rows).reduce((a, b) => a + b, 0);
  const all = split.rows >= heights.length;
  const out: DrawerSplitBody[] = [];
  const partitionFrom = all ? t : boundary;
  out.push({
    kind: 'partition',
    partId: `${unit.id}:drawer-partition`,
    xFromMm: split.leftMm - t / 2,
    xToMm: split.leftMm + t / 2,
    yFromMm: partitionFrom,
    yToMm: carcassMm - t,
    depthMm: depth,
    lengthMm: carcassMm - t - partitionFrom,
    widthMm: depth,
  });
  if (!all) {
    out.push({
      kind: 'traverse',
      partId: `${unit.id}:drawer-traverse`,
      xFromMm: t,
      xToMm: unit.widthMm - t,
      yFromMm: boundary - t,
      yToMm: boundary,
      depthMm: depth,
      lengthMm: unit.widthMm - 2 * t,
      widthMm: depth,
    });
  }
  return out;
}

export type DrawerCellZone = {
  cell: DrawerCell;
  /** Проём ящика в свету и его левый край от левого края модуля, мм. */
  openingWidthMm: number;
  xFromMm: number;
  /** Зона короба по высоте от дна корпуса, мм: место без дна, крыши и перемычки. */
  fromMm: number;
  toMm: number;
};

/**
 * ЗОНЫ КОРОБОВ ЯЧЕЕК. Фронт накладной: нижний закрывает дно, верхний — крышу; короб стоит ВНУТРИ —
 * между дном, крышей и перемычкой, а по ширине — между боковиной и перегородкой.
 */
export function drawerCellZones(
  unit: Pick<Module, 'id' | 'widthMm' | 'fill'>,
  carcassMm: number,
  thicknessMm: number,
): DrawerCellZone[] {
  /* Внутренние ящики (A6) — в верхней части зоны: короб наружного ниже на их сумму. */
  return cellZonesRaw(unit, carcassMm, thicknessMm).map((zone) => {
    const inner = innerHeightsOf(unit.fill, zone.cell.index).reduce((a, b) => a + b, 0);
    return inner > 0 ? { ...zone, toMm: zone.toMm - inner } : zone;
  });
}

/** Зоны ячеек без внутренних ящиков — от них считаются и наружный короб, и внутренние. */
function cellZonesRaw(
  unit: Pick<Module, 'id' | 'widthMm' | 'fill'>,
  carcassMm: number,
  thicknessMm: number,
): DrawerCellZone[] {
  const t = thicknessMm;
  const cells = drawerCells(unit.fill, unit.widthMm, carcassMm);
  const split = drawerSplitOf(unit.fill, unit.widthMm);
  const heights = unit.fill?.drawerHeights ?? [];
  const boundary = split ? carcassMm - heights.slice(0, split.rows).reduce((a, b) => a + b, 0) : null;
  const traverseUnder = split && split.rows < heights.length ? split.rows : -1;
  return cells.map((cell) => {
    let toMm = Math.min(cell.yMm + cell.heightMm, carcassMm - t);
    if (cell.row === traverseUnder && boundary !== null) toMm = Math.min(toMm, boundary - t);
    const fromMm = Math.max(cell.yMm, t);
    if (cell.columns === 1) return { cell, openingWidthMm: unit.widthMm - 2 * t, xFromMm: t, fromMm, toMm };
    const axis = split!.leftMm;
    return cell.column === 0
      ? { cell, openingWidthMm: axis - t / 2 - t, xFromMm: t, fromMm, toMm }
      : { cell, openingWidthMm: unit.widthMm - t - axis - t / 2, xFromMm: axis + t / 2, fromMm, toMm };
  });
}

/**
 * МОЖНО ЛИ ТАК РАЗДЕЛИТЬ — словами с миллиметрами. Деление — у модуля с ящиками на всю ширину без
 * техники, колонны и отсеков; разделены от одного верхнего ряда до всех; оба столбца — не уже
 * `MIN_DRAWER_COLUMN_MM` в свету.
 */
export function drawerSplitRefusal(fill: ModuleFill, unit: Pick<Module, 'label' | 'widthMm' | 'appliance' | 'column'>, thicknessMm: number): string | null {
  const split = fill.drawerSplit;
  if (!split) return null;
  const n = fill.drawerHeights.length;
  if (n === 0) return `У «${unit.label}» нет ящиков на всю ширину — делить на столбцы нечего.`;
  if (unit.appliance || unit.column) return `«${unit.label}»: ящики под техникой на столбцы не делятся — место сверху занимает прибор.`;
  if (fill.bays?.length) return `«${unit.label}»: у модуля отсеки — деление ящиков на столбцы задаётся отсеками.`;
  if (!Number.isInteger(split.rows) || split.rows < 1 || split.rows > n) {
    return split.rows > n
      ? `Разделены верхние ${split.rows} ряда, а рядов ${n} — сначала поменяйте деление на столбцы (меньше рядов или «Без деления»).`
      : `Разделить можно от одного верхнего ряда до всех ${n}: ${split.rows} — такого ряда нет.`;
  }
  if (!Number.isInteger(split.leftMm)) return `Ширина левого столбца — целые миллиметры: ${split.leftMm} мм не режется.`;
  const t = thicknessMm;
  const left = split.leftMm - t / 2 - t;
  const right = unit.widthMm - split.leftMm - t / 2 - t;
  if (left < MIN_DRAWER_COLUMN_MM || right < MIN_DRAWER_COLUMN_MM) {
    const narrow = left < right ? left : right;
    return (
      `${left < right ? 'Левый' : 'Правый'} столбец в свету ${narrow} мм, а нужно от ${MIN_DRAWER_COLUMN_MM} мм — ` +
      `не хватает ${MIN_DRAWER_COLUMN_MM - narrow} мм: направляющей негде стоять.`
    );
  }
  return null;
}


/* ─────────────────────────  Внутренние ящики и вставки (A6)  ───────────────────────── */

/** Ключ внутреннего ящика: `idrawer:<ячейка>:<номер сверху>`. */
export function innerLeaf(cell: number, j: number): string {
  return `idrawer:${cell}:${j}`;
}

/** Зоны внутренних ящиков ячейки сверху вниз, мм (пусто — нет). */
export function innerHeightsOf(fill: Pick<ModuleFill, 'drawerInners'> | undefined, cell: number): number[] {
  return fill?.drawerInners?.find((entry) => entry.cell === cell)?.heightsMm ?? [];
}

export type DrawerInnerZone = {
  leaf: string;
  cell: number;
  j: number;
  openingWidthMm: number;
  xFromMm: number;
  fromMm: number;
  toMm: number;
};

/** Зоны внутренних ящиков: под верхом зоны своей ячейки, сверху вниз; проём — проём ячейки. */
export function drawerInnerZones(unit: Pick<Module, 'id' | 'widthMm' | 'fill'>, carcassMm: number, thicknessMm: number): DrawerInnerZone[] {
  const out: DrawerInnerZone[] = [];
  for (const zone of cellZonesRaw(unit, carcassMm, thicknessMm)) {
    let top = zone.toMm;
    innerHeightsOf(unit.fill, zone.cell.index).forEach((h, j) => {
      out.push({ leaf: innerLeaf(zone.cell.index, j), cell: zone.cell.index, j, openingWidthMm: zone.openingWidthMm, xFromMm: zone.xFromMm, fromMm: top - h, toMm: top });
      top -= h;
    });
  }
  return out;
}

/**
 * МОЖНО ЛИ ПОСТАВИТЬ ВНУТРЕННИЕ ЯЩИКИ — словами с миллиметрами: ячейка есть, зоны — целые мм
 * больше нуля, и наружному коробу остаётся место (сколько ему нужно, говорит его комплект).
 */
export function drawerInnersRefusal(fill: ModuleFill, unit: Pick<Module, 'id' | 'label' | 'widthMm'>, carcassMm: number, thicknessMm: number): string | null {
  const inners = fill.drawerInners ?? [];
  if (inners.length === 0) return null;
  const zones = cellZonesRaw({ ...unit, fill }, carcassMm, thicknessMm);
  const seen = new Set<number>();
  for (const entry of inners) {
    const zone = zones.find((z) => z.cell.index === entry.cell);
    if (!zone) return `У «${unit.label}» нет ящика ${entry.cell + 1} — внутренние ящики ставить не за что.`;
    if (seen.has(entry.cell)) return `У ящика ${entry.cell + 1} внутренние ящики заданы дважды.`;
    seen.add(entry.cell);
    if (entry.heightsMm.length === 0 || entry.heightsMm.some((h) => !Number.isInteger(h) || h <= 0)) {
      return `Зона внутреннего ящика — целые миллиметры больше нуля: ${entry.heightsMm.join(', ') || 'пусто'}.`;
    }
    const sum = entry.heightsMm.reduce((a, b) => a + b, 0);
    const room = zone.toMm - zone.fromMm;
    if (sum >= room) {
      return `Внутренним ящикам ${sum} мм, а в зоне ящика ${entry.cell + 1} всего ${room} мм — наружному коробу не остаётся места (лишние ${sum - room} мм и сколько нужно его коробу).`;
    }
  }
  return null;
}

/**
 * ОТКРЫВАНИЕ С БЛОКИРОВКОЙ (A7): внутренний ящик стоит за закрытым наружным фасадом — открыть его
 * значит сначала открыть наружный; закрыть наружный — значит сначала закрыть его внутренние. Иначе
 * короб внутреннего прошёл бы сквозь закрытый фасад.
 */
export function toggleDrawerInterlock(open: string[], id: string): string[] {
  const isOpen = open.includes(id);
  const inner = /^(.*):idrawer:(\d+):\d+$/.exec(id);
  if (inner) {
    if (isOpen) return open.filter((x) => x !== id);
    const outer = `${inner[1]}:drawer:${inner[2]}`;
    return open.includes(outer) ? [...open, id] : [...open, outer, id];
  }
  const outer = /^(.*):drawer:(\d+)$/.exec(id);
  if (isOpen && outer) {
    const prefix = `${outer[1]}:idrawer:${outer[2]}:`;
    return open.filter((x) => x !== id && !x.startsWith(prefix));
  }
  return isOpen ? open.filter((x) => x !== id) : [...open, id];
}

export type DrawerInsertKind = 'organizer' | 'dividers' | 'rails';

export const DRAWER_INSERT_TITLE: Record<DrawerInsertKind, string> = {
  organizer: 'Органайзер для столовых приборов',
  dividers: 'Разделители на секции',
  rails: 'Релинги высокого ящика',
};

/**
 * ЧИСЛА ВСТАВОК — ВИЗУАЛЬНЫЙ ПРОТОТИП. Подтверждённых артикулов с размерами (Blum ORGA-LINE,
 * галерейные релинги TANDEMBOX) в каталоге нет: это картинка, а не деталь, и так и названо. В
 * раскрой, присадку и подбор фурнитуры эти числа не идут.
 */
export const INSERT_VISUAL_MM = { trayHeight: 50, trayWall: 3, trayBase: 3, dividerHeight: 70, dividerThick: 8, railDiameter: 10, railStep: 70 } as const;

export function insertWords(kind: DrawerInsertKind): string {
  return `${DRAWER_INSERT_TITLE[kind]} — визуальный прототип: подтверждённого артикула с размерами в каталоге нет, в раскрой не идёт, цена не задана.`;
}

export type InsertPiece = { key: string; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; metal?: boolean };

/**
 * ДЕТАЛИ ВСТАВКИ в осях короба (как `DrawerPiece`: x от левого края проёма, y от низа зоны, z от
 * передней плоскости короба назад — минус): внутри короба, по его дну и стенкам.
 */
export function insertPieces(
  kind: DrawerInsertKind,
  sections: number,
  box: { x0: number; x1: number; floorY: number; z0: number; z1: number; sideTopY: number },
): InsertPiece[] {
  const v = INSERT_VISUAL_MM;
  const n = Math.max(2, Math.min(8, Math.round(sections) || 4));
  const out: InsertPiece[] = [];
  const width = box.x1 - box.x0;
  if (kind === 'organizer') {
    const top = box.floorY + v.trayHeight;
    out.push({ key: 'tray-base', x0: box.x0, x1: box.x1, y0: box.floorY, y1: box.floorY + v.trayBase, z0: box.z0, z1: box.z1 });
    out.push({ key: 'tray-front', x0: box.x0, x1: box.x1, y0: box.floorY, y1: top, z0: box.z1 - v.trayWall, z1: box.z1 });
    out.push({ key: 'tray-back', x0: box.x0, x1: box.x1, y0: box.floorY, y1: top, z0: box.z0, z1: box.z0 + v.trayWall });
    for (let i = 0; i <= n; i += 1) {
      const x = box.x0 + (width * i) / n;
      out.push({ key: `tray-wall-${i}`, x0: Math.max(box.x0, x - v.trayWall / 2), x1: Math.min(box.x1, x + v.trayWall / 2), y0: box.floorY, y1: top, z0: box.z0, z1: box.z1 });
    }
  } else if (kind === 'dividers') {
    for (let i = 1; i < n; i += 1) {
      const z = box.z1 + ((box.z0 - box.z1) * i) / n;
      out.push({ key: `divider-${i}`, x0: box.x0, x1: box.x1, y0: box.floorY, y1: box.floorY + v.dividerHeight, z0: z - v.dividerThick / 2, z1: z + v.dividerThick / 2 });
    }
  } else {
    for (const level of [1, 2]) {
      const y = box.sideTopY + level * v.railStep;
      for (const [side, x] of [['l', box.x0], ['r', box.x1 - v.railDiameter]] as const) {
        out.push({ key: `rail-${side}-${level}`, x0: x, x1: x + v.railDiameter, y0: y - v.railDiameter / 2, y1: y + v.railDiameter / 2, z0: box.z0, z1: box.z1, metal: true });
      }
    }
  }
  return out;
}


/** Вставки ставятся в существующий ящик; секций — целое от 2 до 8. Словами, ряд прежний. */
export function drawerInsertsRefusal(fill: ModuleFill, unit: Pick<Module, 'id' | 'label' | 'widthMm'>, carcassMm: number, thicknessMm: number): string | null {
  const inserts = fill.drawerInserts;
  if (!inserts) return null;
  const leaves = new Set([
    ...drawerCells(fill, unit.widthMm, carcassMm).map((c) => c.leaf),
    ...drawerInnerZones({ ...unit, fill }, carcassMm, thicknessMm).map((z) => z.leaf),
  ]);
  for (const [leaf, insert] of Object.entries(inserts)) {
    if (!leaves.has(leaf)) return `У «${unit.label}» нет ящика «${leaf}» — вставку ставить некуда.`;
    if (!(insert.kind in DRAWER_INSERT_TITLE)) return `Вставки «${insert.kind}» в продукте нет: органайзер, разделители или релинги.`;
    if (insert.sections !== undefined && (!Number.isInteger(insert.sections) || insert.sections < 2 || insert.sections > 8)) {
      return `Секций — целое от 2 до 8: ${insert.sections} не встаёт.`;
    }
  }
  return null;
}
