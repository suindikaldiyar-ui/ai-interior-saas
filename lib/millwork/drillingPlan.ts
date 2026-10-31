import type { DrillingSettings, HardwareDrillingSpec, HardwareItem, ProductionSettings } from '@/types/catalog';
import type { Module, Run } from '@/types/millwork';
import { DEFAULT_PRODUCTION } from '@/types/catalog';
import {
  BOTTOM_PANEL_NAME,
  FACADE_PANEL_NAME,
  SIDE_PANEL_NAME,
  TOP_PANEL_NAME,
  objectPanels,
  panelLeaves,
  type ObjectPanel,
  type PanelWall,
} from './panels';
import { DRAWER_SIDE_PANEL_NAME, runnerAxisMissingWhy, type DrawerProfile } from './drawerBox';
import { moduleDrawerKits } from './drawerKit';
import { fittingItemId, handleItemOf, hingeBoringMm } from './fittings';
import { allModules } from './layout';
import { hingeCountBasis } from './modules';
import { isPullOut, isSwing, leafHinges, openingOf } from './opening';
import { frontOnApplianceDoor } from './appliances';
import { chainPositions } from './drilling';
import { handleSpotOf } from './handlePlace';
import { handleItemModel, placeHandle } from './handleModel';
import { hingeCupOf, hingeCupPlace, hingeHeightsMm, plateHolesOf } from './hingePlace';
export { plateHolesOf } from './hingePlace';

/**
 * ДВИЖОК ПРИСАДКИ (HW-08) — операции сверления по деталям раскроя.
 *
 * Деталь — штука строки раскроя (`objectPanels`): «Боковина · 2 шт.» — две
 * детали со своими ИД. Размеры детали — из строки, второго расчёта нет.
 * Операция — отверстие на пласти или в торце в координатах ДЕТАЛИ:
 *
 *   X — вдоль длины детали (`lengthMm`), Y — вдоль ширины (`widthMm`),
 *   начало — угол детали, названный у роли (`PART_AXES`); A и B — пласти.
 *
 * Каждое число операции — из паспорта изделия (документ, страница) или из
 * правила цеха (`ProductionSettings.drilling`). Чего-то нет — операция не
 * ставится, а у детали строка «не рассчитано: …» с причиной словами.
 * Выпуск в цех — только когда отверстия полные, правила подтверждены цехом
 * и проверки (край, пересечение, глубина, совпадение) чисты.
 *
 * Шаг 32 мм здесь не подставляется: он есть только там, где его напечатал
 * паспорт (планка «37 / 32», цепочка направляющей).
 */

export const DRILLING_PLAN_VERSION = 'HW-08.1';

export type DrillFace = 'A' | 'B';
/** Торец детали: x0 / x1 — концы по длине, y0 / y1 — кромки по ширине. */
export type DrillEdge = 'x0' | 'x1' | 'y0' | 'y1';

export type DrillRole =
  | 'hinge_cup'
  | 'hinge_cup_fix'
  | 'hinge_plate'
  | 'runner_cabinet'
  | 'runner_drawer'
  | 'handle'
  | 'shelf_support'
  | 'confirmat_face'
  | 'confirmat_edge';

export const DRILL_ROLE_TITLE: Record<DrillRole, string> = {
  hinge_cup: 'чашка петли',
  hinge_cup_fix: 'крепёж чашки',
  hinge_plate: 'планка петли',
  runner_cabinet: 'направляющая на корпусе',
  runner_drawer: 'направляющая на ящике',
  handle: 'ручка',
  shelf_support: 'полкодержатель',
  confirmat_face: 'конфирмат (пласть)',
  confirmat_edge: 'конфирмат (торец)',
};

export type DrillOp = {
  /** Уникален в детали. */
  id: string;
  role: DrillRole;
  /** Пласть (`face`) или торец (`edge`). У торцевого `x`/`y` — точка на кромке, `zMm` — от пласти A. */
  face?: DrillFace;
  edge?: DrillEdge;
  xMm: number;
  yMm: number;
  zMm?: number;
  diameterMm: number;
  depthMm: number;
  through: boolean;
  /** Ось сверла — словами: «перпендикулярно пласти B», «вдоль Y в торец y0». */
  direction: string;
  itemId: string | null;
  article: string | null;
  /** Откуда каждое число: паспорт (файл, страница) и правило цеха. */
  source: string;
};

export type PartRole = 'side_left' | 'side_right' | 'side' | 'door' | 'drawer_front' | 'drawer_side' | 'bottom' | 'top' | 'other';

export const PART_AXES: Record<PartRole, string> = {
  side_left:
    'X — по высоте от нижнего торца, Y — от передней кромки; A — внутренняя пласть (к полости корпуса), B — наружная',
  side_right:
    'X — по высоте от нижнего торца, Y — от передней кромки; A — внутренняя пласть (к полости корпуса), B — наружная',
  side: 'X — по высоте от нижнего торца, Y — от передней кромки; A — внутренняя пласть, B — наружная',
  door: 'X — по высоте от нижнего торца, Y — от левой кромки при взгляде на лицо; A — лицо, B — тыл',
  drawer_front: 'X — по высоте от нижнего торца, Y — от левой кромки при взгляде на лицо; A — лицо, B — тыл',
  drawer_side: 'X — по длине от передней кромки, Y — по высоте от нижней кромки; A — внутренняя пласть, B — наружная',
  bottom: 'X — по длине от левого торца (вид спереди), Y — от передней кромки; A — верхняя пласть, B — нижняя',
  top: 'X — по длине от левого торца (вид спереди), Y — от передней кромки; A — нижняя пласть, B — верхняя',
  other: 'X — по длине детали, Y — по ширине; A и B — пласти',
};

export type DrillPart = {
  /** ИД детали по объекту: строка раскроя и номер штуки. */
  partId: string;
  /** Номер строки раскроя («3.2», «Б-3.2») — тот же, что на карте раскроя. */
  number: string;
  /** Номер штуки в строке, с 1. */
  piece: number;
  wallId: string;
  wallLabel: string;
  moduleId: string;
  moduleLabel: string;
  name: string;
  role: PartRole;
  /** Створка или ящик детали (`door:0`, `<ящик>:box:side:1`). */
  leaf?: string;
  material: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  axes: string;
  ops: DrillOp[];
  /** Чего не хватило, чтобы поставить операцию, — словами. */
  pending: { what: string; why: string[] }[];
};

export type DrillIssueKind = 'edge' | 'overlap' | 'depth' | 'duplicate' | 'thickness';
export type DrillIssue = { partId: string; number: string; kind: DrillIssueKind; opIds: string[]; words: string };

export type DrillingPlan = {
  version: string;
  parts: DrillPart[];
  issues: DrillIssue[];
  /** Выпуск в цех: все операции на месте, правила подтверждены, проверки чисты. */
  release: { open: boolean; reasons: string[] };
};

/* ─────────────────────────── источники чисел ─────────────────────────── */

function sourceOf(item: HardwareItem): string {
  const s = item.hardware.source;
  const page = s?.printedPage ? `, с. ${s.printedPage}` : '';
  const pdf = s?.pdfPage ? ` (PDF ${s.pdfPage})` : '';
  return `${item.hardware.manufacturer ?? 'позиция компании'} ${item.hardware.manufacturerArticle ?? item.article}${page}${pdf}`;
}

function specOf(item: HardwareItem, part: HardwareDrillingSpec['part'], match?: RegExp): HardwareDrillingSpec | null {
  return item.hardware.drilling?.find((d) => d.part === part && (!match || match.test(d.what))) ?? null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (s: string) => Number(s.replace(',', '.'));


/** Крепёж чашки Hettich: «2 отверстия, 52 между ними; смещение 5,5 от оси чашки (в сторону от кромки двери)». */
export function cupFixOf(spec: HardwareDrillingSpec | null): { spacing: number; offset: number } | null {
  const text = spec?.positionsMm ?? '';
  const spacing = /(\d+(?:[.,]\d+)?)\s*между\s+ними/.exec(text);
  const offset = /смещение\s+(\d+(?:[.,]\d+)?)\s+от\s+оси\s+чашки\s*\(в\s+сторону\s+от\s+кромки/.exec(text);
  if (!spacing || !offset) return null;
  return { spacing: num(spacing[1]), offset: num(offset[1]) };
}

/** Правила цеха, или «пусто» — тогда ни одно правило не задано. */
function rulesOf(production: ProductionSettings): DrillingSettings {
  return (
    production.drilling ?? {
      hingeEdgeMm: null,
      hingeCount: [],
      plateOnCupAxis: false,
      handleHoleMm: null,
      handlePlaceConfirmed: false,
      shelfSupport: null,
      confirmat: null,
      minRemainMm: null,
      confirmed: false,
    }
  );
}

/* ─────────────────────────── детали ─────────────────────────── */

function roleOf(panel: ObjectPanel, piece: number): PartRole {
  if (panel.name === SIDE_PANEL_NAME) return panel.qty === 2 ? (piece === 0 ? 'side_left' : 'side_right') : 'side';
  if (panel.name === DRAWER_SIDE_PANEL_NAME) return 'drawer_side';
  if (panel.name === BOTTOM_PANEL_NAME) return 'bottom';
  if (panel.name === TOP_PANEL_NAME) return 'top';
  if (panel.name === 'Фронт ящика') return 'drawer_front';
  if (panel.name === FACADE_PANEL_NAME || /^Фасад( [АБ])?$/.test(panel.name) || panel.name === 'Фасад встройки' || panel.name === `${FACADE_PANEL_NAME}: рама`) {
    return 'door';
  }
  return 'other';
}

type Ctx = {
  unit: Module;
  run: Run;
  production: ProductionSettings;
  rules: DrillingSettings;
  hardware: Map<string, HardwareItem>;
  /** Высота корпуса модуля — длина его боковины в раскрое. */
  carcassHeightMm: number | null;
};

/* ─────────────────────────── петли ─────────────────────────── */

type HingeLeaf = { leaf: string; index: number; total: number; hinge: 'left' | 'right'; lengthMm: number; bottomInCarcassMm: number };

/** Створки модуля на петлях — те же, что режутся (`panelLeaves`), с местом по высоте корпуса. */
function hingeLeaves(ctx: Ctx, doorRows: ObjectPanel[]): HingeLeaf[] {
  const out: HingeLeaf[] = [];
  const leaves = doorRows.flatMap((row) => (panelLeaves(row) ?? []).map((leaf) => ({ leaf, row })));
  const total = leaves.length;
  leaves.forEach(({ leaf, row }) => {
    const index = Number(leaf.split(':')[1] ?? 0);
    const { opening } = openingOf(ctx.unit, index, total);
    if (!isSwing(opening)) return;
    const hinge: 'left' | 'right' = opening === 'right' || (opening === 'double' && index === 1) ? 'right' : 'left';
    /* Фасад по центру корпуса по высоте — так его ставят сцена и чертёж: деталь короче корпуса на зазор, поровну сверху и снизу. */
    const bottom = ctx.carcassHeightMm === null ? NaN : (ctx.carcassHeightMm - row.lengthMm) / 2;
    out.push({ leaf, index, total, hinge, lengthMm: row.lengthMm, bottomInCarcassMm: bottom });
  });
  return out;
}

function hingeOps(ctx: Ctx, door: DrillPart, side: { left?: DrillPart; right?: DrillPart }, leaf: HingeLeaf): void {
  const hingeId = fittingItemId(ctx.unit, 'hinge');
  const hinge = hingeId ? ctx.hardware.get(hingeId) : undefined;
  if (!hinge) {
    door.pending.push({ what: 'чашки петель', why: ['петля производителя на модуле не выбрана — присадка не рассчитана'] });
    return;
  }
  if (frontOnApplianceDoor(ctx.unit)) {
    door.pending.push({ what: 'чашки петель', why: ['фасад висит на двери прибора — мебельных петель нет'] });
    return;
  }
  if (hinge.detail === 'light') {
    door.pending.push({ what: 'чашки петель', why: ['паспорт позиции ещё не дочитан — присадка не рассчитана'] });
    return;
  }
  const plateId = fittingItemId(ctx.unit, 'hinge_plate');
  const plate = plateId ? (ctx.hardware.get(plateId) ?? null) : null;
  /* Числа чашки — те же размеры для подбора, по которым петлю ставит сцена (`hingeCupOf`). */
  const cup = hingeCupOf(hinge);
  const why: string[] = [];
  if (cup.diameterMm === null && cup.depthMm === null) why.push(`присадки чашки в паспорте ${sourceOf(hinge)} нет`);
  else if (cup.diameterMm === null) why.push('диаметр чашки не напечатан');
  else if (cup.depthMm === null) why.push('глубина сверления чашки не напечатана');
  const tb = hingeBoringMm({ carcassMm: ctx.production.carcassMm, gapMm: ctx.production.frontGapMm }, hinge, plate);
  if (tb === null) why.push(plate ? 'TB с выбранной планкой не получается из таблицы наложения паспорта' : 'ответная планка не выбрана — TB не вычислить');
  if (ctx.rules.hingeEdgeMm === null) why.push('от края фасада до оси крайней чашки — правило цеха не задано');
  if (why.length > 0 || cup.diameterMm === null || cup.depthMm === null || tb === null || ctx.rules.hingeEdgeMm === null) {
    door.pending.push({ what: 'чашки петель', why });
    return;
  }
  const count = leafHinges(leaf.lengthMm, 'left', ctx.production);
  const basis = hingeCountBasis(leaf.lengthMm, ctx.rules.hingeCount);
  if (!basis.shop) door.pending.push({ what: 'число петель', why: [basis.words] });
  const edge = ctx.rules.hingeEdgeMm;
  /* Высоты и отступ чашки — тот же расчёт, что ставит петлю в сцене (`hingePlace`). */
  const xs = hingeHeightsMm(leaf.lengthMm, count, edge);
  const place = hingeCupPlace(ctx.production, hinge, plate);
  const yCup = leaf.hinge === 'left' ? place.fromEdgeMm : door.widthMm - place.fromEdgeMm;
  const src = `${sourceOf(hinge)}: Ø${cup.diameterMm}, глубина ${cup.depthMm}, TB ${tb} (таблица наложения с планкой ${plate?.hardware.manufacturerArticle ?? '—'}); по высоте — правило цеха ${edge} мм от края, ${basis.shop ? 'число петель — таблица цеха' : 'число петель — правило продукта'}`;
  const fix = cupFixOf(specOf(hinge, 'door', /крепёжн|крепежн/i));
  const fixSpec = specOf(hinge, 'door', /крепёжн|крепежн/i);
  xs.forEach((x, i) => {
    door.ops.push({
      id: `cup-${i + 1}`,
      role: 'hinge_cup',
      face: 'B',
      xMm: r1(x),
      yMm: r1(yCup),
      diameterMm: cup.diameterMm!,
      depthMm: cup.depthMm!,
      through: false,
      direction: 'перпендикулярно пласти B (тыл фасада)',
      itemId: hinge.id,
      article: hinge.hardware.manufacturerArticle ?? hinge.article,
      source: src,
    });
    if (fix && fixSpec && fixSpec.diameterMm !== null && fixSpec.depthMm !== null) {
      const away = leaf.hinge === 'left' ? 1 : -1;
      for (const [k, dx] of [
        [1, -fix.spacing / 2],
        [2, fix.spacing / 2],
      ] as const) {
        door.ops.push({
          id: `cup-${i + 1}-fix-${k}`,
          role: 'hinge_cup_fix',
          face: 'B',
          xMm: r1(x + dx),
          yMm: r1(yCup + away * fix.offset),
          diameterMm: fixSpec.diameterMm,
          depthMm: fixSpec.depthMm,
          through: false,
          direction: 'перпендикулярно пласти B (тыл фасада)',
          itemId: hinge.id,
          article: hinge.hardware.manufacturerArticle ?? hinge.article,
          source: `${sourceOf(hinge)}: крепёж чашки — ${fixSpec.positionsMm}`,
        });
      }
    }
  });
  const cupSpec = specOf(hinge, 'door', /чашк/i) ?? specOf(hinge, 'door');
  if (!fix && cupSpec?.what && /точк|саморез/i.test(cupSpec.what)) {
    door.pending.push({ what: 'крепёж чашки', why: ['положение саморезов чашки в паспорте не образмерено — отверстия под саморезы не ставятся'] });
  }

  /* Планка — на боковине со стороны петель, на высоте оси чашки (правило цеха). */
  const sidePart = leaf.hinge === 'left' ? side.left : side.right;
  if (!sidePart) return;
  if (!plate) {
    sidePart.pending.push({ what: 'планка петли', why: ['ответная планка не выбрана'] });
    return;
  }
  const plateSpec = specOf(plate, 'cabinet_side');
  const holes = plateHolesOf(plate);
  const pwhy: string[] = [];
  if (!plateSpec) pwhy.push(`присадки планки в паспорте ${sourceOf(plate)} нет`);
  if (plateSpec && plateSpec.diameterMm === null) pwhy.push(`диаметр отверстий планки не напечатан (${plateSpec.what})`);
  if (plateSpec && plateSpec.depthMm === null) pwhy.push('глубина отверстий планки не напечатана');
  if (plateSpec && !holes) pwhy.push(`расстояния планки не разобраны: «${plateSpec.positionsMm ?? '—'}»`);
  if (!ctx.rules.plateOnCupAxis) pwhy.push('«ось планки — на высоте оси чашки» цехом не подтверждено');
  if (!Number.isFinite(leaf.bottomInCarcassMm)) pwhy.push('высота корпуса модуля не найдена в раскрое');
  if (pwhy.length > 0 || !plateSpec || !holes || plateSpec.diameterMm === null || plateSpec.depthMm === null) {
    sidePart.pending.push({ what: `планка петли (${leaf.leaf})`, why: pwhy });
    return;
  }
  xs.forEach((x, i) => {
    const axis = leaf.bottomInCarcassMm + x;
    for (const [k, dx] of [
      [1, -holes.spacing / 2],
      [2, holes.spacing / 2],
    ] as const) {
      sidePart.ops.push({
        id: `${leaf.leaf}-plate-${i + 1}-${k}`,
        role: 'hinge_plate',
        face: 'A',
        xMm: r1(axis + dx),
        yMm: holes.fromEdge,
        diameterMm: plateSpec.diameterMm!,
        depthMm: plateSpec.depthMm!,
        through: false,
        direction: 'перпендикулярно пласти A (внутренняя)',
        itemId: plate.id,
        article: plate.hardware.manufacturerArticle ?? plate.article,
        source: `${sourceOf(plate)}: Ø${plateSpec.diameterMm}, глубина ${plateSpec.depthMm}, ${holes.fromEdge} от передней кромки, ${holes.spacing} между отверстиями; по высоте — ось чашки (правило цеха)`,
      });
    }
  });
}

/* ─────────────────────────── направляющие ─────────────────────────── */

/**
 * ЧТО НАПЕЧАТАНО О ПРИСАДКЕ, СЛОВАМИ (HW-04): Ø, глубина, места и база — чтобы
 * у детали было видно, какого числа не хватает. Отверстие по таким словам не
 * ставится: место и размер должны быть заданы полностью.
 */
function printedDrilling(spec: HardwareDrillingSpec): string[] {
  return [
    `${spec.what}: ${spec.diameterMm !== null ? `Ø ${spec.diameterMm}` : 'диаметр не напечатан'}, ${spec.depthMm !== null ? `глубина ${spec.depthMm}` : 'глубина не напечатана'}${spec.positionsMm ? `; места «${spec.positionsMm}»` : ''}`,
    ...(spec.datum ? [`база: ${spec.datum}`] : []),
    'отверстие не ставится: место и размер в паспорте заданы не полностью',
  ];
}

/**
 * ФРОНТ И ЗАДНЯЯ СТЕНКА ЯЩИКА ПОД ДНОМ И СИСТЕМЫ (HW-04): крепление фасада,
 * держатель задней стенки, задний крючок направляющей — из паспортов ходовой
 * и царг. Ставится только «не рассчитано» с напечатанным: ни у одной из этих
 * записей нет полной пары «место + Ø + глубина».
 */
function underBoxPending(ctx: Ctx, kit: { place: { key: string }; profile: DrawerProfile }, runner: HardwareItem, label: string, front: DrillPart | undefined, back: DrillPart | undefined): void {
  const sideItem = kit.profile.system ? ctx.hardware.get(kit.profile.system.sideItemId) : undefined;
  for (const src of [runner, ...(sideItem ? [sideItem] : [])]) {
    const name = src.hardware.manufacturerArticle ?? src.article;
    if (src.detail === 'light') {
      for (const p of [front, back]) p?.pending.push({ what: `${name}, ${label}`, why: ['паспорт позиции ещё не дочитан'] });
      continue;
    }
    for (const spec of src.hardware.drilling ?? []) {
      const target = spec.part === 'front' ? front : spec.part === 'other' ? back : undefined;
      target?.pending.push({ what: `${name}: ${spec.what}, ${label}`, why: printedDrilling(spec) });
    }
  }
}

function runnerOps(
  ctx: Ctx,
  side: { left?: DrillPart; right?: DrillPart },
  drawerSides: Map<string, DrillPart[]>,
  fronts: Map<string, DrillPart>,
  backs: Map<string, DrillPart>,
): void {
  for (const kit of moduleDrawerKits(ctx.unit, ctx.run, ctx.production, ctx.hardware)) {
    if (kit.state !== 'box') continue;
    const item = kit.profile.slideItemId ? ctx.hardware.get(kit.profile.slideItemId) : undefined;
    if (!item) continue;
    const label = `ящик ${kit.place.key.split(':').pop()}`;
    if (kit.profile.mount === 'under' || kit.profile.system) {
      underBoxPending(ctx, kit, item, label, fronts.get(kit.place.key), backs.get(kit.place.key));
    }
    const targets = [side.left, side.right].filter((p): p is DrillPart => Boolean(p));
    const boxes = drawerSides.get(kit.place.key) ?? [];
    if (item.detail === 'light') {
      for (const p of [...targets, ...boxes]) p.pending.push({ what: `направляющая, ${label}`, why: ['паспорт позиции ещё не дочитан'] });
      continue;
    }
    const cab = specOf(item, 'cabinet_side');
    const drw = specOf(item, 'drawer_side');
    const cabChain = chainPositions(cab?.positionsMm ?? null);
    const drwChain = chainPositions(drw?.positionsMm ?? null);
    const axis = kit.plan.runnerAxisFromZoneMm;
    const why: string[] = [];
    if (kit.place.bayId) why.push('ящик отсека: стенка отсека — не боковина корпуса, присадка по ней не рассчитывается');
    if (!kit.place.overlay) why.push('привязка отверстий в паспорте дана для накладного фасада');
    if (axis === null) why.push(runnerAxisMissingWhy(kit.profile));
    const cabWhy = [...why];
    if (!cabChain) cabWhy.push('цепочки отверстий на корпусе в паспорте нет');
    if (cab && cab.diameterMm === null) cabWhy.push(`диаметр отверстия на корпусе не напечатан: ${cab.what}`);
    if (cab && cab.depthMm === null) cabWhy.push('глубина отверстия на корпусе не напечатана');
    if (cabWhy.length > 0 || !cab || !cabChain || cab.diameterMm === null || cab.depthMm === null || axis === null) {
      for (const p of targets) p.pending.push({ what: `направляющая на корпусе, ${label}`, why: cabWhy });
    } else {
      const height = kit.place.zoneFromMm + axis;
      for (const p of targets) {
        cabChain.forEach((y, i) =>
          p.ops.push({
            id: `${kit.place.key}-runner-${i + 1}`,
            role: 'runner_cabinet',
            face: 'A',
            xMm: r1(height),
            yMm: y,
            diameterMm: cab.diameterMm!,
            depthMm: cab.depthMm!,
            through: false,
            direction: 'перпендикулярно пласти A (внутренняя)',
            itemId: item.id,
            article: item.hardware.manufacturerArticle ?? item.article,
            source: `${sourceOf(item)}: цепочка «${cab.positionsMm}» от передней кромки; по высоте — ось направляющей короба цеха`,
          }),
        );
      }
    }
    const drwWhy = [...why.filter((w) => !w.startsWith('ящик отсека'))];
    if (!drwChain) drwWhy.push('цепочки отверстий на ящике в паспорте нет');
    if (drw && drw.diameterMm === null) drwWhy.push(`диаметр отверстия на ящике не напечатан: ${drw.what}`);
    if (drw && drw.depthMm === null) drwWhy.push('глубина отверстия на ящике не напечатана');
    if (drwWhy.length > 0 || !drw || !drwChain || drw.diameterMm === null || drw.depthMm === null || axis === null) {
      for (const p of boxes) p.pending.push({ what: `направляющая на ящике, ${label}`, why: drwWhy });
    } else {
      const y = axis - kit.plan.bottomFromMm;
      for (const p of boxes) {
        drwChain.forEach((x, i) =>
          p.ops.push({
            id: `runner-${i + 1}`,
            role: 'runner_drawer',
            face: 'B',
            xMm: x,
            yMm: r1(y),
            diameterMm: drw.diameterMm!,
            depthMm: drw.depthMm!,
            through: false,
            direction: 'перпендикулярно пласти B (наружная)',
            itemId: item.id,
            article: item.hardware.manufacturerArticle ?? item.article,
            source: `${sourceOf(item)}: цепочка «${drw.positionsMm}» от передней кромки; по высоте — ось направляющей короба цеха`,
          }),
        );
      }
    }
  }
}

/* ─────────────────────────── ручки ─────────────────────────── */

function handleOps(ctx: Ctx, part: DrillPart, leaf: string, hinge: 'left' | 'right' | undefined, seat: 'spot' | 'center'): void {
  const kind = ctx.unit.fill?.handle ?? (ctx.run.options.integratedHandles ? 'profile' : 'bar');
  if (kind !== 'bar') return;
  const item = handleItemOf(ctx.unit, leaf, ctx.hardware);
  if (!item) {
    part.pending.push({ what: 'ручка', why: ['позиция ручки производителя не выбрана — отверстий нет (условная скоба сцены — не изделие)'] });
    return;
  }
  const model = handleItemModel(item).model;
  const why: string[] = [];
  if (!model) why.push('модели ручки по размерам паспорта нет — место не вычислить');
  if (model?.shape === 'edge' || model?.shape === 'strip') {
    part.pending.push({ what: 'ручка', why: ['ручка для кромки / профиль: крепление в торец и тыл по паспорту не образмерено — присадка не рассчитана'] });
    return;
  }
  /* Врезная — гнездо под корпус по паспорту (Ø и глубина), а не отверстия под винты. */
  const pocket = model?.shape === 'flush' ? specOf(item, 'front') : null;
  const spacing = model?.shape === 'knob' ? 0 : item.hardware.dimensionsMm?.holeSpacing;
  if (model?.shape === 'flush') {
    if (!pocket || pocket.diameterMm === null || pocket.depthMm === null) why.push(`гнезда врезной ручки в паспорте ${sourceOf(item)} нет`);
  } else {
    if (spacing === undefined || spacing === null) why.push(`межосевое у ${sourceOf(item)} не напечатано`);
    if (ctx.rules.handleHoleMm === null) why.push('диаметр отверстия под винт ручки — правило цеха не задано (в паспорте напечатан винт, а не сверло)');
  }
  if (!ctx.rules.handlePlaceConfirmed) why.push('место ручки на фасаде (правило продукта) цехом не подтверждено');
  if (why.length > 0 || !model) {
    part.pending.push({ what: 'ручка', why });
    return;
  }
  const MM = 1000;
  const geometry = { cx: part.widthMm / 2 / MM, cy: part.lengthMm / 2 / MM, widthM: part.widthMm / MM, heightM: part.lengthMm / MM, thicknessM: part.thicknessMm / MM };
  const spot = handleSpotOf(ctx.unit, ctx.run, hinge);
  const upper = ctx.unit.kind === 'upper' || ctx.unit.kind === 'corner_upper';
  const placed = placeHandle(model, spot, geometry, { seat, edge: upper ? 'bottom' : 'top' });
  const cy = placed.mount[0] * MM;
  const cx = placed.mount[1] * MM;
  const along = placed.orient === 'v' ? 'x' : 'y';
  if (pocket && pocket.diameterMm !== null && pocket.depthMm !== null) {
    part.ops.push({
      id: 'handle-pocket',
      role: 'handle',
      face: 'A',
      xMm: r1(cx),
      yMm: r1(cy),
      diameterMm: pocket.diameterMm,
      depthMm: pocket.depthMm,
      through: false,
      direction: 'перпендикулярно лицу (A)',
      itemId: item.id,
      article: item.hardware.manufacturerArticle ?? item.article,
      source: `${sourceOf(item)}: ${pocket.what}; место — правило продукта (подтверждено цехом)`,
    });
    return;
  }
  const hole = ctx.rules.handleHoleMm!;
  const points: [number, number][] = spacing ? [[1, -spacing / 2], [2, spacing / 2]] : [[1, 0]];
  for (const [k, d] of points) {
    part.ops.push({
      id: `handle-${k}`,
      role: 'handle',
      face: 'B',
      xMm: r1(along === 'x' ? cx + d : cx),
      yMm: r1(along === 'y' ? cy + d : cy),
      diameterMm: hole,
      depthMm: part.thicknessMm,
      through: true,
      direction: 'насквозь, с тыла (B) к лицу',
      itemId: item.id,
      article: item.hardware.manufacturerArticle ?? item.article,
      source: `${sourceOf(item)}: ${spacing ? `межосевое ${spacing}` : 'кнопка — одно отверстие по центру'}; Ø — правило цеха; место — правило продукта (подтверждено цехом)`,
    });
  }
}

/* ─────────────────────────── полкодержатели ─────────────────────────── */

function shelfOps(ctx: Ctx, sides: DrillPart[]): void {
  const shelves = ctx.unit.fill?.shelves ?? [];
  if (shelves.length === 0 || sides.length === 0) return;
  const supportId = fittingItemId(ctx.unit, 'shelf_support');
  const item = supportId ? ctx.hardware.get(supportId) : undefined;
  if (!item) {
    for (const p of sides) p.pending.push({ what: 'полкодержатели', why: ['полкодержатель производителя на модуле не выбран — отверстий нет'] });
    return;
  }
  const spec = specOf(item, 'cabinet_side') ?? specOf(item, 'other');
  const why: string[] = [];
  if (item.detail === 'light') why.push('паспорт позиции ещё не дочитан');
  if (!spec) why.push(`присадки полкодержателя в паспорте ${sourceOf(item)} нет`);
  if (spec && spec.diameterMm === null) why.push('диаметр отверстия полкодержателя не напечатан');
  if (spec && spec.depthMm === null) why.push('глубина отверстия полкодержателя не напечатана');
  if (!ctx.rules.shelfSupport) why.push('оси полкодержателей от передней и задней кромки — правило цеха не задано');
  if (why.length > 0 || !spec || spec.diameterMm === null || spec.depthMm === null || !ctx.rules.shelfSupport) {
    for (const p of sides) p.pending.push({ what: 'полкодержатели', why });
    return;
  }
  for (const p of sides) {
    shelves.forEach((h, i) => {
      for (const [k, y] of [
        ['f', ctx.rules.shelfSupport!.frontMm],
        ['b', p.widthMm - ctx.rules.shelfSupport!.backMm],
      ] as const) {
        p.ops.push({
          id: `shelf-${i + 1}-${k}`,
          role: 'shelf_support',
          face: 'A',
          xMm: r1(h),
          yMm: r1(y),
          diameterMm: spec.diameterMm!,
          depthMm: spec.depthMm!,
          through: false,
          direction: 'перпендикулярно пласти A (внутренняя)',
          itemId: item.id,
          article: item.hardware.manufacturerArticle ?? item.article,
          source: `${sourceOf(item)}: Ø${spec.diameterMm}, глубина ${spec.depthMm}; оси от кромок — правило цеха; отметка полки — ось отверстия`,
        });
      }
    });
  }
}

/* ─────────────────────────── конфирматы ─────────────────────────── */

function confirmatOps(ctx: Ctx, sides: { left?: DrillPart; right?: DrillPart }, horizontal: DrillPart[]): void {
  const rule = ctx.rules.confirmat;
  if (!rule) {
    for (const p of [sides.left, sides.right, ...horizontal].filter((x): x is DrillPart => Boolean(x))) {
      p.pending.push({ what: 'конфирматы корпуса', why: ['схема конфирматов — правило цеха не задано'] });
    }
    return;
  }
  for (const h of horizontal) {
    const ys = [rule.fromFrontMm, h.widthMm - rule.fromBackMm];
    for (const [end, side] of [
      ['x0', sides.left],
      ['x1', sides.right],
    ] as const) {
      ys.forEach((y, i) => {
        h.ops.push({
          id: `conf-${end}-${i + 1}`,
          role: 'confirmat_edge',
          edge: end,
          xMm: end === 'x0' ? 0 : h.lengthMm,
          yMm: r1(y),
          zMm: r1(h.thicknessMm / 2),
          diameterMm: rule.edgeDiameterMm,
          depthMm: rule.edgeDepthMm,
          through: false,
          direction: `в торец ${end === 'x0' ? 'левый' : 'правый'}, вдоль X`,
          itemId: null,
          article: null,
          source: 'схема конфирматов — правило цеха',
        });
        if (!side) return;
        /* В боковине — насквозь, на оси толщины горизонтальной детали: низ дна у низа боковины, крыша — у верха. */
        const x = h.role === 'bottom' ? h.thicknessMm / 2 : side.lengthMm - h.thicknessMm / 2;
        side.ops.push({
          id: `conf-${h.role}-${i + 1}`,
          role: 'confirmat_face',
          face: 'B',
          xMm: r1(x),
          yMm: r1(y),
          diameterMm: rule.faceDiameterMm,
          depthMm: side.thicknessMm,
          through: true,
          direction: 'насквозь, с наружной пласти B',
          itemId: null,
          article: null,
          source: `схема конфирматов — правило цеха; ${h.role === 'bottom' ? 'дно' : 'крыша'} вкладные между боковинами (схема сборки продукта)`,
        });
      });
    }
  }
}

/* ─────────────────────────── проверки ─────────────────────────── */

export function drillChecks(part: DrillPart, rules: DrillingSettings): DrillIssue[] {
  const issues: DrillIssue[] = [];
  const add = (kind: DrillIssueKind, opIds: string[], words: string) => issues.push({ partId: part.partId, number: part.number, kind, opIds, words });
  for (const op of part.ops) {
    const r = op.diameterMm / 2;
    if (op.face) {
      if (op.xMm - r < 0 || op.xMm + r > part.lengthMm || op.yMm - r < 0 || op.yMm + r > part.widthMm) {
        add('edge', [op.id], `${DRILL_ROLE_TITLE[op.role]} Ø${op.diameterMm} в (${op.xMm}; ${op.yMm}) выходит за край детали ${part.lengthMm} × ${part.widthMm}`);
      }
      if (!op.through) {
        const remain = part.thicknessMm - op.depthMm;
        if (remain <= 0) add('thickness', [op.id], `${DRILL_ROLE_TITLE[op.role]}: глубина ${op.depthMm} при толщине ${part.thicknessMm} — деталь пробита насквозь`);
        else if (rules.minRemainMm !== null && remain < rules.minRemainMm) {
          add('depth', [op.id], `${DRILL_ROLE_TITLE[op.role]}: под отверстием остаётся ${r1(remain)} мм при минимуме цеха ${rules.minRemainMm}`);
        }
      }
    } else if (op.edge) {
      if (op.zMm !== undefined && (op.zMm - r < 0 || op.zMm + r > part.thicknessMm)) {
        add('edge', [op.id], `${DRILL_ROLE_TITLE[op.role]} Ø${op.diameterMm} в торце толщиной ${part.thicknessMm} — сверло шире торца`);
      }
      const across = op.edge === 'x0' || op.edge === 'x1' ? part.lengthMm : part.widthMm;
      if (op.depthMm >= across) add('depth', [op.id], `${DRILL_ROLE_TITLE[op.role]}: глубина ${op.depthMm} больше детали (${across})`);
    }
  }
  /* Пересечение и совпадение — на одной пласти; сквозные видны с обеих. */
  const onFace = (face: DrillFace) => part.ops.filter((o) => o.face === face || (o.face && o.through));
  for (const face of ['A', 'B'] as const) {
    const list = onFace(face);
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        if (a.face !== face && b.face !== face) continue;
        const d = Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm);
        if (d < 0.05 && a.diameterMm === b.diameterMm) add('duplicate', [a.id, b.id], `${DRILL_ROLE_TITLE[a.role]} и ${DRILL_ROLE_TITLE[b.role]} — одно отверстие дважды в (${a.xMm}; ${a.yMm})`);
        /* Касание — тоже брак: между отверстиями не остаётся материала. */
        else if (d <= a.diameterMm / 2 + b.diameterMm / 2 + 1e-6) {
          add('overlap', [a.id, b.id], `${DRILL_ROLE_TITLE[a.role]} Ø${a.diameterMm} и ${DRILL_ROLE_TITLE[b.role]} Ø${b.diameterMm} пересекаются или касаются: между осями ${r1(d)} мм`);
        }
      }
    }
  }
  return issues;
}

/* ─────────────────────────── план объекта ─────────────────────────── */

export function drillingPlan(input: {
  walls: PanelWall[];
  production?: ProductionSettings;
  hardware?: Map<string, HardwareItem>;
  milling?: Parameters<typeof objectPanels>[0]['milling'];
  carcass?: Parameters<typeof objectPanels>[0]['carcass'];
}): DrillingPlan {
  const production = input.production ?? DEFAULT_PRODUCTION;
  const hardware = input.hardware ?? new Map<string, HardwareItem>();
  const rules = rulesOf(production);
  const rows = objectPanels({ walls: input.walls, production, milling: input.milling, carcass: input.carcass, hardware });
  const runs = new Map(input.walls.map((w) => [w.wallId, w.run]));

  const parts: DrillPart[] = [];
  const byModule = new Map<string, { rows: ObjectPanel[]; parts: DrillPart[] }>();
  for (const row of rows) {
    const key = `${row.wallId}|${row.moduleId}`;
    const entry = byModule.get(key) ?? { rows: [], parts: [] };
    entry.rows.push(row);
    byModule.set(key, entry);
    const leaves = panelLeaves(row);
    for (let piece = 0; piece < row.qty; piece += 1) {
      const role = roleOf(row, piece);
      const part: DrillPart = {
        partId: `${row.partId}#${piece + 1}`,
        number: row.number,
        piece: piece + 1,
        wallId: row.wallId,
        wallLabel: row.wallLabel,
        moduleId: row.moduleId,
        moduleLabel: row.moduleLabel,
        name: row.name,
        role,
        ...(leaves?.[piece] ? { leaf: leaves[piece] } : row.partIds?.[piece] ? { leaf: row.partIds[piece] } : {}),
        material: row.material,
        lengthMm: row.lengthMm,
        widthMm: row.widthMm,
        thicknessMm: row.thicknessMm,
        axes: PART_AXES[role],
        ops: [],
        pending: [],
      };
      parts.push(part);
      entry.parts.push(part);
    }
  }

  for (const [key, entry] of Array.from(byModule.entries())) {
    const [wallId, moduleId] = key.split('|');
    const run = runs.get(wallId);
    const unit = run ? allModules(run).find((m) => m.id === moduleId) : undefined;
    if (!run || !unit) continue;
    const sideRow = entry.rows.find((r) => r.name === SIDE_PANEL_NAME);
    const ctx: Ctx = { unit, run, production, rules, hardware, carcassHeightMm: sideRow ? sideRow.lengthMm : null };
    const side = {
      left: entry.parts.find((p) => p.role === 'side_left'),
      right: entry.parts.find((p) => p.role === 'side_right'),
    };
    const doorRows = entry.rows.filter((r) => roleOf(r, 0) === 'door' && r.name !== 'Фасад встройки');
    const leaves = isPullOut(unit) ? [] : hingeLeaves(ctx, doorRows);
    for (const leaf of leaves) {
      const door = entry.parts.find((p) => p.role === 'door' && p.leaf === leaf.leaf);
      if (door) hingeOps(ctx, door, side, leaf);
    }
    for (const door of entry.parts.filter((p) => p.role === 'door' && p.leaf)) {
      const leaf = leaves.find((l) => l.leaf === door.leaf);
      handleOps(ctx, door, door.leaf!, leaf?.hinge, 'spot');
    }
    for (const front of entry.parts.filter((p) => p.role === 'drawer_front' && p.leaf)) handleOps(ctx, front, front.leaf!, undefined, 'center');
    const drawerSides = new Map<string, DrillPart[]>();
    for (const p of entry.parts.filter((x) => x.role === 'drawer_side' && x.leaf)) {
      const kitKey = p.leaf!.split(':box:')[0];
      drawerSides.set(kitKey, [...(drawerSides.get(kitKey) ?? []), p]);
    }
    /* Фронт ящика и его задняя стенка — по ИД ящика (HW-04): крепление фасада и держатели системы. */
    /* У фронта ИД детали в модуле (`drawer:0`), у ящика — с модулем (`<модуль>:drawer:0`). */
    const fronts = new Map(entry.parts.filter((p) => p.role === 'drawer_front' && p.leaf).map((p) => [p.leaf!.startsWith(`${moduleId}:`) ? p.leaf! : `${moduleId}:${p.leaf}`, p] as const));
    const backs = new Map<string, DrillPart>();
    for (const p of entry.parts.filter((x) => x.leaf?.includes(':box:wall:'))) {
      const kitKey = p.leaf!.split(':box:')[0];
      /* Задняя стенка — вторая (`wall:2`); у системы торец один — задний. */
      if (!backs.has(kitKey) || p.leaf!.endsWith(':box:wall:2')) backs.set(kitKey, p);
    }
    runnerOps(ctx, side, drawerSides, fronts, backs);
    shelfOps(ctx, [side.left, side.right].filter((p): p is DrillPart => Boolean(p)));
    const horizontal = entry.parts.filter((p) => p.role === 'bottom' || p.role === 'top');
    if (side.left || side.right) confirmatOps(ctx, side, horizontal);
  }

  const issues = parts.flatMap((p) => drillChecks(p, rules));
  const reasons: string[] = [];
  const pendingParts = parts.filter((p) => p.pending.length > 0);
  if (pendingParts.length > 0) reasons.push(`не рассчитано на ${pendingParts.length} дет. — причины у каждой детали`);
  if (issues.length > 0) reasons.push(`проверки присадки: ${issues.length} замечаний (край, пересечение, глубина, совпадение)`);
  if (!rules.confirmed) reasons.push('правила присадки не подтверждены цехом');
  if (parts.every((p) => p.ops.length === 0)) reasons.push('ни одной операции: фурнитура производителя и правила цеха не заданы');
  return { version: DRILLING_PLAN_VERSION, parts, issues, release: { open: reasons.length === 0, reasons } };
}

/** Сводка для экрана и выгрузки: деталей с отверстиями, операций, «не рассчитано». */
export function drillingSummary(plan: DrillingPlan): { parts: number; drilled: number; ops: number; pending: number; issues: number } {
  return {
    parts: plan.parts.length,
    drilled: plan.parts.filter((p) => p.ops.length > 0).length,
    ops: plan.parts.reduce((s, p) => s + p.ops.length, 0),
    pending: plan.parts.reduce((s, p) => s + p.pending.length, 0),
    issues: plan.issues.length,
  };
}
