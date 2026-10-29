import { DEFAULT_PRODUCTION } from '@/types/catalog';
import type {
  CornerChoice,
  CornerLevel,
  CornerOwner,
  FillBay,
  FrontOpening,
  Module,
  ModuleFill,
  Opening,
  Run,
  RunCorner,
  RunRequirements,
  SavedCornerChoice,
  VariantKey,
  VitrineLed,
} from '@/types/millwork';
import { moduleFronts } from './applianceFront';
import { bayWidths } from './bays';
import { cornerOwnerOf, ownersOf } from './corner';
import { moduleCarcassHeightMm } from './fill';
import { runFingerprint } from './fingerprint';
import type { LightFixture, RoomLighting } from './lightingState';
import type { MillworkState } from '../projects';

/**
 * МЕБЕЛЬ В ЗЕРКАЛЕ — ВМЕСТЕ С КОМНАТОЙ (Measurement 2.0).
 *
 * Отражение комнаты (`mirroredSurvey`) меняет стороны: левый угол каждой
 * стены становится правым. Ряд по готовому решению выводится из замера сам,
 * а правленый ряд лежит в объекте числами — модули на своих отметках,
 * петли со своей стороны, свои фасады у каждой створки. Отразить комнату и
 * оставить правленую мебель как есть — значит поставить её зеркально к
 * новой комнате: окно уехало бы на другой конец ряда, а мойка осталась.
 *
 * Здесь отражается то, у чего есть сторона, — и только оно:
 *
 *   модули всех рядов   отметка `o → L − o − ширина`, порядок слева направо;
 *   наполнение          петли «слева» ↔ «справа», перегородка от другого края,
 *                       отсеки в обратном порядке (ширины те же);
 *   створки рядом       ключи `door:i` ↔ `door:(n − 1 − i)` у фасада, разбитого
 *                       по ширине: свой фасад и своя ручка едут со створкой;
 *   витрина             лента «слева» ↔ «справа»;
 *   ряд                 ригели и препятствия на ряду, обрезка плиты у торцов,
 *                       углы у начала и конца местами;
 *   состав              ручные позиции приборов от другого края, стены приборов
 *                       по номеру — с другого конца; пеналы у другого торца —
 *                       только у прямой кухни (у угловой сторона пеналов
 *                       читается от угла: «у стены комнаты» им и остаётся);
 *   углы                порядок стен у каждого угла, кто ведёт уровень —
 *                       та же физическая стена (`prev` ↔ `next`);
 *   свет                трек — от другого угла стены, поворот со знаком наоборот.
 *
 * Идентификаторы модулей НЕ переписываются: по ним держатся выделение, лента
 * модуля и выбор каталога. Уникальность от отражения не меняется, а следующая
 * правка свободной сборки выведет их из новых отметок, как всегда.
 *
 * Ряд по готовому решению здесь не отражается — его нет в объекте: он
 * пересобирается раскладкой по отражённой комнате, и это не обязательно
 * зеркало прежнего (раскладка идёт слева направо). Так и сказано до
 * нажатия (`mirrorPreview` экрана).
 *
 * Отражение правленой мебели — инволюция: дважды — тот же объект (M2.19).
 */

const MIRROR_HINGE: Partial<Record<FrontOpening, FrontOpening>> = { left: 'right', right: 'left' };
const MIRROR_LED: Partial<Record<VitrineLed, VitrineLed>> = { left: 'right', right: 'left' };
const OTHER_OWNER: Record<CornerOwner, CornerOwner> = { prev: 'next', next: 'prev' };

/** Участок ряда в зеркале: `[from, from + w)` → `[L − from − w, L − from)`. */
function mirroredSpan(lengthMm: number, fromMm: number, widthMm: number): number {
  return lengthMm - fromMm - widthMm;
}

function mirroredOpenings(list: Opening[] | undefined, lengthMm: number): Opening[] | undefined {
  if (!list) return list;
  return list
    .map((item) => ({ ...item, fromCornerMm: mirroredSpan(lengthMm, item.fromCornerMm, item.widthMm) }))
    .sort((a, b) => a.fromCornerMm - b.fromCornerMm);
}

/**
 * Отсеки в зеркале: тот же ряд отсеков, прочитанный с другого края. Ширина
 * хранится у всех, кроме последнего (`bayWidths`), — поэтому сначала
 * ширины, потом порядок: бывший последний получает своё число, новый
 * последний — остаток, как всегда.
 */
function mirroredBays(bays: FillBay[], widthMm: number, thicknessMm: number): FillBay[] {
  const widths = bayWidths(bays, widthMm, thicknessMm);
  const reversed = [...bays].reverse();
  const reversedWidths = [...widths].reverse();
  return reversed.map((bay, i) => {
    const { widthMm: _dropped, ...rest } = bay;
    void _dropped;
    return i < reversed.length - 1 ? { ...rest, widthMm: reversedWidths[i] } : rest;
  });
}

function mirroredFill(fill: ModuleFill, unit: Module, thicknessMm: number): ModuleFill {
  const next: ModuleFill = { ...fill, hinge: MIRROR_HINGE[fill.hinge] ?? fill.hinge };
  if (fill.dividerMm > 0) next.dividerMm = unit.widthMm - fill.dividerMm;
  if (fill.bays && fill.bays.length > 1) next.bays = mirroredBays(fill.bays, unit.widthMm, thicknessMm);
  return next;
}

/**
 * Сколько створок стоят РЯДОМ (по ширине). Створки над нишей и под ней,
 * двери встроенного холодильника — друг над другом: их ключи от
 * отражения не меняются. Ответ о створках — у `moduleFronts`, своего
 * разбора здесь нет.
 */
function sideBySideLeaves(unit: Module, run: Run): number {
  const heightMm = moduleCarcassHeightMm(unit, run);
  const { leaves } = moduleFronts(unit, heightMm);
  if (leaves.length < 2) return 0;
  return leaves.every((leaf) => leaf.fromMm === 0) ? leaves.length : 0;
}

function mirroredLeafKey(key: string, count: number): string {
  const m = /^door:(\d+)$/.exec(key);
  if (!m || count < 2) return key;
  const i = Number(m[1]);
  return i < count ? `door:${count - 1 - i}` : key;
}

function mirroredModule(unit: Module, run: Run, lengthMm: number, thicknessMm: number): Module {
  const count = sideBySideLeaves(unit, run);
  const next: Module = { ...unit, offsetMm: mirroredSpan(lengthMm, unit.offsetMm, unit.widthMm) };
  if (unit.fill) next.fill = mirroredFill(unit.fill, unit, thicknessMm);
  if (unit.leafFronts && count > 1) {
    next.leafFronts = Object.fromEntries(Object.entries(unit.leafFronts).map(([key, spec]) => [mirroredLeafKey(key, count), spec]));
  }
  if (unit.fittings && count > 1) {
    next.fittings = unit.fittings.map((fitting) => (fitting.leaf ? { ...fitting, leaf: mirroredLeafKey(fitting.leaf, count) } : fitting));
  }
  if (unit.vitrine?.led && MIRROR_LED[unit.vitrine.led]) next.vitrine = { ...unit.vitrine, led: MIRROR_LED[unit.vitrine.led] };
  /* Скруглённый торец (OVAL & RADIUS) — у другого края ряда; фасад дугой симметричен. */
  if (unit.radius && unit.radius.place !== 'front') {
    next.radius = { ...unit.radius, place: unit.radius.place === 'left' ? 'right' : 'left' };
  }
  return next;
}

/**
 * Выбор угла, прочитанный с другой стороны: та же ФИЗИЧЕСКАЯ стена ведёт
 * тот же уровень. Умолчание «ведёт стена до угла» после отражения указало
 * бы на другую стену, поэтому сначала читается, кто ведёт сейчас
 * (`cornerOwnerOf`), и записывается наоборот — только выбранное
 * (`ownersOf`, ловушка 246).
 */
export function mirroredChoice<T extends CornerChoice>(choice: T): T {
  const set = choice.owners ?? {};
  const owners: Partial<Record<CornerLevel, CornerOwner>> = {
    lower: OTHER_OWNER[cornerOwnerOf(choice, 'lower')],
    upper: OTHER_OWNER[cornerOwnerOf(choice, 'upper')],
  };
  if (set.mezzanine) owners.mezzanine = OTHER_OWNER[set.mezzanine];
  if (set.countertop) owners.countertop = OTHER_OWNER[set.countertop];
  const written = ownersOf({ owners, mezzanine: choice.mezzanine });
  const { owners: _was, ...rest } = choice;
  void _was;
  return (written ? { ...rest, owners: written } : rest) as T;
}

function mirroredRunCorner(corner: RunCorner | undefined): RunCorner | undefined {
  if (!corner) return corner;
  const next: RunCorner = {};
  if (corner.end) next.start = mirroredChoice(corner.end);
  if (corner.start) next.end = mirroredChoice(corner.start);
  return next;
}

/** Ряд в зеркале: та же стена, тот же ряд, прочитанный от другого угла. */
export function mirroredRun(run: Run): Run {
  const L = run.lengthMm;
  const t = (run.production ?? DEFAULT_PRODUCTION).carcassMm;
  const flip = (list: Module[]) => list.map((unit) => mirroredModule(unit, run, L, t)).sort((a, b) => a.offsetMm - b.offsetMm);
  const next: Run = {
    ...run,
    modules: flip(run.modules),
    upperSegments: run.upperSegments
      .map((segment) => ({ fromMm: L - segment.toMm, toMm: L - segment.fromMm, modules: flip(segment.modules) }))
      .sort((a, b) => a.fromMm - b.fromMm),
  };
  const beams = mirroredOpenings(run.beams, L);
  if (beams) next.beams = beams;
  const obstacles = mirroredOpenings(run.obstacles, L);
  if (obstacles) next.obstacles = obstacles;
  const corner = mirroredRunCorner(run.corner);
  if (corner) next.corner = corner;
  if (run.counterEnds) {
    const ends: NonNullable<Run['counterEnds']> = {};
    if (run.counterEnds.end) ends.start = run.counterEnds.end;
    if (run.counterEnds.start) ends.end = run.counterEnds.start;
    next.counterEnds = ends;
  }
  /* Скруглённый угол столешницы (OVAL & RADIUS) — у другого конца ряда. */
  if (run.counterCorners) {
    const corners: NonNullable<Run['counterCorners']> = {};
    if (run.counterCorners.end) corners.start = run.counterCorners.end;
    if (run.counterCorners.start) corners.end = run.counterCorners.start;
    next.counterCorners = corners;
  }
  /*
   * Телевизор и декоративные панели (STAGE B) — от другого угла: центр
   * телевизора `c → L − c`, панель — участок ряда. Рисунок реек и стыки
   * частей симметричны, скругления — у обоих крайних углов.
   */
  if (run.tv) next.tv = { ...run.tv, centerMm: L - run.tv.centerMm };
  if (run.wallPanels) {
    next.wallPanels = run.wallPanels.map((panel) => ({ ...panel, fromMm: mirroredSpan(L, panel.fromMm, panel.widthMm) }));
  }
  /* Стена комнаты у конца ряда — у другого конца (показ кладёт её заново из отражённого замера). */
  if (run.wallEnds) {
    next.wallEnds = { ...(run.wallEnds.end ? { start: true as const } : {}), ...(run.wallEnds.start ? { end: true as const } : {}) };
  }
  next.fingerprint = runFingerprint(next);
  return next;
}

/**
 * Выбор по углам в зеркале. Запись без метки стен — старая, номером угла:
 * метку она получает от цепочки ДО отражения, иначе номер указал бы на
 * другой угол. Список — в обратном порядке: первый угол стал последним.
 */
export function mirroredCorners(corners: SavedCornerChoice[] | undefined, chainBefore: string[]): SavedCornerChoice[] | undefined {
  if (!corners) return corners;
  return corners
    .map((choice, i): SavedCornerChoice => {
      const walls = choice.walls ?? (chainBefore[i] && chainBefore[i + 1] ? ([chainBefore[i], chainBefore[i + 1]] as [string, string]) : undefined);
      const flipped = mirroredChoice(choice);
      return walls ? { ...flipped, walls: [walls[1], walls[0]] } : flipped;
    })
    .reverse();
}

export type MirrorContext = {
  /** Стены под мебелью ДО отражения, по часовой: [А, Б, В]. */
  chainBefore: string[];
  /** Длина ряда каждой стены цепочки, мм — у отражённой мебели она та же. */
  rowLengthMm: Record<string, number>;
  /** Длина каждой стены замера, мм — от другого угла меряется свет. */
  wallLengthMm: Record<string, number>;
  /** На какой стене стоит прибор сейчас — чтобы его ручная позиция отразилась в своём ряду. */
  applianceWall: (appliance: string) => string | null;
};

/**
 * Состав в зеркале: ручные позиции от другого края. Сторона пеналов у
 * прямой кухни — буквально левый или правый торец, и он меняется; у
 * угловой композиция читает её от угла («у стены комнаты»,
 * `buildComposition`), и выбор «у стены» остаётся тем же выбором.
 */
export function mirroredRequirements(requirements: RunRequirements, ctx: MirrorContext): RunRequirements {
  const n = ctx.chainBefore.length;
  const next: RunRequirements = { ...requirements };
  if (n <= 1) next.tallSide = requirements.tallSide === 'left' ? 'right' : 'left';
  if (requirements.manualAnchors) {
    const anchors: NonNullable<RunRequirements['manualAnchors']> = {};
    for (const [appliance, center] of Object.entries(requirements.manualAnchors) as [keyof typeof anchors, number][]) {
      const wall = ctx.applianceWall(appliance);
      const length = wall ? ctx.rowLengthMm[wall] : undefined;
      anchors[appliance] = length === undefined ? center : length - center;
    }
    next.manualAnchors = anchors;
  }
  if (requirements.applianceWalls) {
    const walls: NonNullable<RunRequirements['applianceWalls']> = {};
    for (const [appliance, wall] of Object.entries(requirements.applianceWalls) as [keyof typeof walls, number | string][]) {
      walls[appliance] = typeof wall === 'number' ? n - 1 - wall : wall;
    }
    next.applianceWalls = walls;
  }
  if (requirements.corners) next.corners = mirroredCorners(requirements.corners, ctx.chainBefore);
  return next;
}

/** Свет комнаты в зеркале: трек — от другого угла своей стены, повороты со знаком наоборот. */
export function mirroredLighting(lighting: RoomLighting, wallLengthMm: Record<string, number>): RoomLighting {
  return {
    ...lighting,
    fixtures: lighting.fixtures.map((fixture): LightFixture => {
      if (fixture.kind !== 'track') return fixture;
      const length = wallLengthMm[fixture.wallId];
      return {
        ...fixture,
        alongMm: length === undefined ? fixture.alongMm : length - fixture.alongMm,
        rotationDeg: -fixture.rotationDeg,
        heads: fixture.heads.map((head) => ({ ...head, panDeg: -head.panDeg })),
      };
    }),
  };
}

export type MirroredState = {
  state: MillworkState;
  /** Что отражено и что пропало — словами, ДО нажатия. */
  notes: string[];
};

/**
 * ОБЪЕКТ В ЗЕРКАЛЕ. Правки рабочей стены (`runs`) и соседних (`wallRuns`)
 * отражаются и переезжают: цепочка стен читается в обратном порядке, и
 * стена А становится последней. Правка, найденная под номером стены
 * (старая запись), получает метку своей стены — от цепочки ДО отражения.
 *
 * Правки других комплектаций рабочей стены (не выбранной) к новой стене А
 * не подходят: комплектация одна (`SINGLE_VARIANT`), и они называются
 * потерей, а не уезжают молча.
 */
export function mirroredState(state: MillworkState, ctx: MirrorContext): MirroredState {
  const notes: string[] = [];
  const chain = ctx.chainBefore;
  const n = chain.length;
  const variant: VariantKey = state.selectedVariant ?? 'optimal';
  const working = state.runs?.[variant];
  const ownWorking = working && (!working.wallId || working.wallId === chain[0]) ? working : undefined;
  if (working && !ownWorking) {
    notes.push(`Правка рабочей стены лежала для стены ${working.wallId}, которой в цепочке нет, и на экране не показывалась — снята.`);
  }

  /* Правки по стенам — до отражения, под меткой стены. */
  const edits = new Map<string, Run>();
  if (ownWorking) edits.set(chain[0], { ...ownWorking, wallId: chain[0] });
  for (const [key, run] of Object.entries(state.wallRuns ?? {})) {
    const index = Number(key);
    const wallId = run.wallId ?? (Number.isInteger(index) && index > 0 ? chain[index] : undefined);
    if (!wallId) {
      notes.push(`Правка под ключом «${key}» не принадлежит ни одной стене цепочки — не отражена.`);
      continue;
    }
    if (!edits.has(wallId)) edits.set(wallId, { ...run, wallId });
  }

  const after = [...chain].reverse();
  const next: MillworkState = { ...state };
  const runs: NonNullable<MillworkState['runs']> = {};
  const newWorking = edits.get(after[0]);
  if (newWorking) runs[variant] = mirroredRun(newWorking);
  for (const [key, run] of Object.entries(state.runs ?? {}) as [VariantKey, Run][]) {
    if (key === variant || !run) continue;
    notes.push(`Правка комплектации «${key}» стены А к стене после отражения не подходит — снята.`);
  }
  if (Object.keys(runs).length > 0) next.runs = runs;
  else delete next.runs;

  const wallRuns: Record<string, Run> = {};
  for (let i = 1; i < n; i += 1) {
    const run = edits.get(after[i]);
    if (run) wallRuns[after[i]] = mirroredRun(run);
  }
  if (Object.keys(wallRuns).length > 0) next.wallRuns = wallRuns;
  else delete next.wallRuns;

  if (state.requirements) next.requirements = mirroredRequirements(state.requirements, ctx);
  if (state.corners) next.corners = mirroredCorners(state.corners, chain);
  if (state.lighting) next.lighting = mirroredLighting(state.lighting, ctx.wallLengthMm);

  /*
   * ОСТРОВ (OVAL & RADIUS): у прямой кухни стена А та же — остров отражается
   * вдоль её ряда (модули и торцы в обратном порядке, отметка — от другого
   * края). У угловой и П стеной А становится другая стена: место острова у
   * неё не выводится — он снимается, и это сказано до нажатия.
   */
  if (state.island?.island) {
    const rowA = n === 1 ? ctx.rowLengthMm[chain[0]] : undefined;
    if (rowA !== undefined) {
      const island = mirroredRun(state.island);
      next.island = {
        ...island,
        island: { ...state.island.island, fromLeftMm: rowA - state.island.island.fromLeftMm - state.island.lengthMm },
      };
      notes.push('Остров отражён вместе с рядом стены А: модули и торцы — в обратном порядке, отметка — от другого края.');
    } else {
      delete next.island;
      notes.push('Остров снят: после отражения стена А — другая стена, и его место у неё надо задать заново.');
    }
  }

  const mirrored = edits.size;
  if (mirrored > 0) notes.unshift(`Правленых рядов: ${mirrored} — модули встанут в обратном порядке, петли — на другую сторону.`);
  return { state: next, notes };
}

/**
 * ПРАВКИ ПРИ НОВОЙ ЦЕПОЧКЕ СТЕН — БЕЗ ОТРАЖЕНИЯ.
 *
 * Форма, поворот или стена поменялись — стены под мебелью могут стать
 * другими: стена А стала стеной Б, стена Б ушла из цепочки. Правленый
 * ряд держится за своё место в цепочке: у стены А угол в конце ряда, у
 * стены Б — в начале, и ряд, правленый под один угол, под другим — не
 * та мебель. Поэтому правка остаётся, только если её стена на том же
 * месте цепочки; иначе она снимается и называется ДО нажатия — молча её
 * не выбрасывают.
 */
export function rechainedState(
  state: MillworkState,
  chainBefore: string[],
  chainAfter: string[],
  /** Стена в родительном падеже, как её называет замер: «стены 1». */
  nameOf: (wallId: string) => string = (wallId) => `стены ${wallId}`,
): MirroredState {
  const notes: string[] = [];
  const variant: VariantKey = state.selectedVariant ?? 'optimal';
  const title = (wallId: string, chain: string[]) => {
    const i = chain.indexOf(wallId);
    return i < 0 ? 'вне кухни' : `стена ${'АБВГ'[i] ?? i + 1}`;
  };
  const next: MillworkState = { ...state };

  const working = state.runs?.[variant];
  if (working && chainBefore[0] && chainAfter[0] !== chainBefore[0]) {
    notes.push(
      `Правки ${nameOf(chainBefore[0])} (была стеной А) сняты: она станет «${title(chainBefore[0], chainAfter)}» — ряд соберётся заново.`,
    );
    const runs = { ...state.runs };
    delete runs[variant];
    if (Object.keys(runs).length > 0) next.runs = runs;
    else delete next.runs;
  }

  const kept: Record<string, Run> = {};
  for (const [key, run] of Object.entries(state.wallRuns ?? {})) {
    const index = Number(key);
    const wallId = run.wallId ?? (Number.isInteger(index) && index > 0 ? chainBefore[index] : undefined);
    if (!wallId) continue;
    const was = chainBefore.indexOf(wallId);
    const now = chainAfter.indexOf(wallId);
    if (was >= 1 && was === now) kept[wallId] = { ...run, wallId };
    else notes.push(`Правки ${nameOf(wallId)} (была «${title(wallId, chainBefore)}») сняты: она станет «${title(wallId, chainAfter)}» — ряд соберётся заново.`);
  }
  if (Object.keys(kept).length > 0) next.wallRuns = kept;
  else delete next.wallRuns;
  /* Остров стоит от ряда стены А: стена А стала другой — его место у неё не выводится. */
  if (state.island && chainBefore[0] && chainAfter[0] !== chainBefore[0]) {
    delete next.island;
    notes.push(`Остров снят: он стоял у ${nameOf(chainBefore[0])}, а стеной А станет другая — его место надо задать заново.`);
  }
  return { state: next, notes };
}
