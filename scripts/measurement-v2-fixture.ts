/**
 * ОБЪЕКТЫ ПРИЁМКИ MEASUREMENT 2.0 — ОТ ЗАМЕРА, ПУТЁМ ЭКРАНА.
 *
 * Замер (`Survey`) → `resolveSurvey` → `objectSite` (цепочка стен под
 * мебель) → `compositionFor` → `objectInput` → `composeVariants` →
 * `wallSegments` → `runPlacements` (ряды в мире) → `roomSourceOf` →
 * `roomAroundRows` (комната). Те же функции и в том же порядке, что у
 * рабочего места; своей арифметики у приёмки нет.
 *
 * Сторона кухни меряется по ФИЗИЧЕСКИМ точкам, а не по направлению обхода:
 * угол двух стен и их дальние концы на плане замера (`surveyWalk`, ось Y
 * вниз) и те же точки в мире (комната, ось Z вниз на виде сверху). Знак
 * векторного произведения «стена А → угол → стена Б» на плане и в мире
 * один — кухня та же; разный — зеркальная.
 */
import { DEFAULT_PRODUCTION, type ProductionSettings } from '../types/catalog';
import {
  DEFAULT_TURN_DEG,
  UNKNOWN,
  WALK_VERSION,
  measured,
  resolveSurvey,
  type Survey,
  type SurveyComm,
  type SurveyOpening,
  type SurveyWall,
} from '../types/survey';
import type { Composition, CompositionKind, Run, RunRequirements, SavedCornerChoice, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import {
  compositionFor,
  objectEstimateOf,
  objectInput,
  objectSite,
  wallCornerOf,
  wallRequirementsOf,
  wallSegments,
} from '../lib/millwork/objectEstimate';
import { runPlacements, segmentCount } from '../lib/millwork/composition';
import { cornerChoicesOf } from '../lib/millwork/corner';
import { roomAroundRows, roomSourceOf, type Room } from '../lib/millwork/room';
import { rowStandardDepthMm } from '../lib/millwork/fill';
import { runBoxesByModule, runPlaces } from '../lib/millwork/cabinetBoxes';
import { surveyWalk, type PlacedWall, type PlanPoint } from '../lib/millwork/surveyPlan';
import { DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import type { MaterialItem } from '../lib/millwork/materialCollection';
import { unpricedLines } from '../lib/millwork/estimate';

const MM = 1000;

export type WallSpec = {
  /** Длина, мм; null — не замерена. */
  length: number | null;
  /** Поворот ПОСЛЕ стены: 'left' / 'right' (90°) или свой угол со знаком. */
  turn?: 'left' | 'right' | number;
  /** «Ряд здесь». */
  run?: boolean;
  openings?: SurveyOpening[];
  id?: string;
};

/** Замер из описания стен. `version: false` — замер до 2.0 (повороты мебель не читает). */
export function surveyOf(
  walls: WallSpec[],
  opts: { version?: boolean; interior?: 'right' | 'left'; rotation?: 0 | 90 | 180 | 270; ceiling?: number; comms?: SurveyComm[] } = {},
): Survey {
  const list: SurveyWall[] = walls.map((spec, i) => ({
    id: spec.id ?? `w${i + 1}`,
    lengthMm: spec.length === null ? UNKNOWN : measured(spec.length),
    turn: typeof spec.turn === 'number' ? 'custom' : spec.turn ?? 'right',
    turnDeg: typeof spec.turn === 'number' ? spec.turn : DEFAULT_TURN_DEG,
    openings: spec.openings ?? [],
    isRunWall: spec.run ?? i === 0,
  }));
  return {
    ceilingHeightMm: measured(opts.ceiling ?? 2700),
    walls: list,
    comms: opts.comms ?? [],
    photos: [],
    clientNotes: '',
    steps: { ceiling: 'done', walls: 'done', openings: 'done', comms: 'done', photos: 'todo' },
    measuredBy: 'Measurement 2.0',
    measuredAt: '2026-10-26',
    ...(opts.version === false ? {} : { version: WALK_VERSION }),
    ...(opts.interior ? { interior: opts.interior } : {}),
    ...(opts.rotation !== undefined ? { planRotationDeg: opts.rotation } : {}),
  };
}

export type BuildSpec = {
  title: string;
  survey: Survey;
  shape: CompositionKind;
  /** Выбор углов (как `cornerPicks` экрана) — с метками пар стен. */
  corners?: SavedCornerChoice[];
  requirements?: RunRequirements;
  production?: ProductionSettings;
  /** Правки соседних стен (`editedWalls` экрана): ключ — `wallId`. */
  editedWalls?: Record<string, Run>;
  /** Правленый ряд стены А (`editedRuns` экрана). */
  working?: Run;
  /**
   * Позиции каталога материалов организации (`materialCatalog`) — те же,
   * что экран кладёт в `objectInput`. Пусто — каталога материалов нет.
   */
  materials?: Map<string, MaterialItem>;
};

const DISABLED: Record<VariantKey, string[]> = { basic: [], optimal: [], premium: [] };

/** Точка ряда (м, x вдоль ряда, z от фасада к стене — минус) → мир, мм (x, z). */
export function rowToWorld(place: { xM: number; zM: number; rotationYDeg: number }, x: number, z: number): [number, number] {
  const a = (place.rotationYDeg * Math.PI) / 180;
  return [
    Math.round((x * Math.cos(a) + z * Math.sin(a) + place.xM) * MM * 10) / 10,
    Math.round((-x * Math.sin(a) + z * Math.cos(a) + place.zM) * MM * 10) / 10,
  ];
}

export type Built = {
  title: string;
  /** Отказ словами — композиция не собралась (цепочка стен или движок). */
  refusal: string | null;
  /** Стены цепочки по часовой: [А, Б, В]. */
  chain: string[];
  site: ReturnType<typeof objectSite>;
  resolution: ReturnType<typeof resolveSurvey>;
  /** Композиция экрана; `null` — прямая. */
  layout: Composition | null;
  /** Стена ряда прямой кухни и стены А — как у `objectInput` экрана. */
  runWallId: string;
  segments: Run[];
  places: { xM: number; zM: number; rotationYDeg: number }[];
  room: Room | null;
  total: number;
  /** Строки сметы объекта без цены (`unpricedLines`): ключи — как у `__mwEstimateLines` экрана. */
  unpriced: string[];
  /** Модули по стенам: id, габарит в мире на полу (x, z), мм. */
  rows: { wallId: string; lengthMm: number; modules: { id: string; kind: string; min: [number, number]; max: [number, number] }[] }[];
};

export function buildFromSurvey(spec: BuildSpec): Built {
  const requirements = spec.requirements ?? DEMO_REQUIREMENTS;
  const production = spec.production ?? DEFAULT_PRODUCTION;
  const resolution = resolveSurvey(spec.survey);
  const segmentsNeeded = segmentCount(spec.shape);
  const base = workspaceInput({
    title: spec.title,
    zone: 'Кухня',
    measurement: resolution.measurement,
    requirements,
    rates: DEMO_RATES,
    cornerAt: null,
  } as never);
  const site = objectSite(base, resolution, segmentsNeeded);
  const wallIds = site.walls.slice(0, segmentsNeeded).map((wall) => wall.id);
  const choices = cornerChoicesOf({ corners: spec.corners, cornerSolution: 'false_panel' }, segmentsNeeded - 1, wallIds);
  const attempt = compositionFor({
    shape: spec.shape,
    requirements,
    cornerSolution: 'false_panel',
    corners: choices,
    site,
    production,
    variantKey: 'optimal',
  });
  const empty: Built = {
    title: spec.title,
    refusal: null,
    chain: wallIds,
    site,
    resolution,
    layout: null,
    runWallId: site.runWallId,
    segments: [],
    places: [],
    room: null,
    total: 0,
    unpriced: [],
    rows: [],
  };
  if (attempt?.state === 'refused') return { ...empty, refusal: attempt.reason };
  const layout = attempt?.state === 'built' ? attempt.composition : null;

  const input = objectInput({
    base,
    resolution,
    requirements: wallRequirementsOf(layout, requirements),
    rates: DEMO_RATES,
    production,
    milling: new Map(),
    carcass: new Map(),
    materials: spec.materials ?? new Map(),
    corner: wallCornerOf(layout),
    runWallId: site.runWallId,
  });
  const variant = composeVariants(input, DISABLED, spec.working ? { optimal: spec.working } : {}).find((item) => item.key === 'optimal');
  if (!variant) throw new Error(`${spec.title}: варианта optimal нет`);
  const segments = wallSegments(layout, variant.run, spec.editedWalls ?? {}, input.wallEnds);
  const places = runPlacements({ runs: segments, solution: 'false_panel', corners: choices, zone: variant.run.zone, production });
  const source = roomSourceOf({
    walls: site.roomWalls ?? site.walls,
    runOpenings: input.openings,
    runWallId: site.runWallId,
    signedTurns: resolution.measurement.walk === 'clockwise',
    measuredWalls: resolution.measurement.walls,
    ceilingMm: site.ceilingMm,
    depthMm: rowStandardDepthMm(requirements.zone, 'base', production),
    solution: 'false_panel',
    corners: choices,
    zone: requirements.zone,
    production,
    survey: spec.survey,
  });
  const room = roomAroundRows(source, segments.map((run, i) => ({ run, placement: places[i] })), null);
  const estimate = objectEstimateOf({ layout, segments, wallAEstimate: variant.estimate, variantKey: variant.key, input, disabled: DISABLED });

  const rows = segments.map((run, i) => {
    const place = places[i];
    return {
      wallId: run.wallId ?? `#${i}`,
      lengthMm: run.lengthMm,
      modules: runPlaces(run).map((item) => {
        const a = rowToWorld(place, item.x, item.zM - item.depthM);
        const b = rowToWorld(place, item.x + item.unit.widthMm / MM, item.zM);
        return {
          id: item.unit.id,
          kind: item.unit.kind,
          min: [Math.min(a[0], b[0]), Math.min(a[1], b[1])] as [number, number],
          max: [Math.max(a[0], b[0]), Math.max(a[1], b[1])] as [number, number],
        };
      }),
    };
  });

  return {
    title: spec.title,
    refusal: null,
    chain: layout ? layout.segments.map((segment) => segment.wallId) : [site.runWallId],
    site,
    resolution,
    layout,
    runWallId: input.runWallId,
    segments,
    places,
    room,
    total: Math.round(estimate.total),
    unpriced: unpricedLines(estimate).map((line) => line.key),
    rows,
  };
}

/* ─────────────────────────  Сторона кухни  ───────────────────────── */

const sub = (a: PlanPoint, b: PlanPoint): PlanPoint => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (u: PlanPoint, v: PlanPoint) => u.x * v.y - u.y * v.x;
const near = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.y - b.y) < 1;

/**
 * Угол двух стен и их дальние концы на плане замера: точки, а не направления
 * обхода. `rotationDeg` — поворот изображения, как у плана на экране.
 */
export function planCorner(
  survey: Survey,
  idA: string,
  idB: string,
  rotationDeg = 0,
): { far: PlanPoint; corner: PlanPoint; farB: PlanPoint } {
  const placed = surveyWalk(survey.walls, rotationDeg);
  const a = placed.find((wall) => wall.wall.id === idA);
  const b = placed.find((wall) => wall.wall.id === idB);
  if (!a || !b) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: стен ${idA}/${idB} на плане нет`);
  const ends = (wall: PlacedWall) => [wall.from, wall.to];
  for (const pa of ends(a)) {
    for (const pb of ends(b)) {
      if (near(pa, pb)) {
        const far = near(a.from, pa) ? a.to : a.from;
        const farB = near(b.from, pb) ? b.to : b.from;
        return { far, corner: pa, farB };
      }
    }
  }
  throw new Error(`Стены ${idA} и ${idB} на плане не сходятся углом`);
}

/** Те же точки в мире — по стенам комнаты вокруг рядов (x, z). */
export function worldCorner(room: Room, idA: string, idB: string): { far: PlanPoint; corner: PlanPoint; farB: PlanPoint } {
  const a = room.walls.find((wall) => wall.id === idA);
  const b = room.walls.find((wall) => wall.id === idB);
  if (!a || !b) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: стен ${idA}/${idB} в комнате нет`);
  const pts = (wall: Room['walls'][number]) => [
    { x: wall.startMm[0], y: wall.startMm[1] },
    { x: wall.startMm[0] + wall.dir[0] * wall.lengthMm, y: wall.startMm[1] + wall.dir[1] * wall.lengthMm },
  ];
  const [a0, a1] = pts(a);
  const [b0, b1] = pts(b);
  for (const pa of [a0, a1]) {
    for (const pb of [b0, b1]) {
      if (near(pa, pb)) {
        return { far: near(pa, a0) ? a1 : a0, corner: pa, farB: near(pb, b0) ? b1 : b0 };
      }
    }
  }
  throw new Error(`Стены ${idA} и ${idB} в комнате не сходятся углом`);
}

/** Знак угла «дальний конец А → угол → дальний конец Б»: +1 / −1. */
export function turnSign(points: { far: PlanPoint; corner: PlanPoint; farB: PlanPoint }): 1 | -1 {
  return cross(sub(points.corner, points.far), sub(points.farB, points.corner)) > 0 ? 1 : -1;
}

/* ─────────────────────────  Детали в мире  ───────────────────────── */

export type V3 = [number, number, number];
export type Box = { min: V3; max: V3; owner: string; tag: string };

/** Коробка ряда (центр, размер, м) → габарит в мире, мм: тот же поворот, что у группы ряда в сцене. */
export function worldBox(place: { xM: number; zM: number; rotationYDeg: number }, center: V3, size: V3, owner: string, tag: string): Box {
  const a = (place.rotationYDeg * Math.PI) / 180;
  const pts: V3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const x = center[0] + (sx * size[0]) / 2;
    const y = center[1] + (sy * size[1]) / 2;
    const z = center[2] + (sz * size[2]) / 2;
    pts.push([(x * Math.cos(a) + z * Math.sin(a) + place.xM) * 1000, y * 1000, (-x * Math.sin(a) + z * Math.cos(a) + place.zM) * 1000]);
  }
  return {
    min: [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]))) as V3,
    max: [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k]))) as V3,
    owner,
    tag,
  };
}

/** Детали всех стен в мире — те же коробки, что рисует сцена (`runBoxesByModule`), и входы деталей разных модулей друг в друга. */
export function hitsOf(built: Built, production: ProductionSettings): { hits: string[]; pairs: number } {
  const shop = { thicknessMm: production.carcassMm, frontThicknessMm: production.frontMm, gapMm: production.frontGapMm, production };
  const boxes: Box[] = [];
  built.segments.forEach((run, wall) => {
    const grouped = runBoxesByModule(run, shop);
    for (const box of grouped.fillers) boxes.push(worldBox(built.places[wall], box.position, box.scale, `filler:${wall}:${box.position.join(',')}`, `стена ${wall + 1} ${box.panel ?? 'панель'}`));
    for (const { unit, boxes: parts } of grouped.modules) {
      for (const box of parts) boxes.push(worldBox(built.places[wall], box.position, box.scale, unit.id, `${unit.id} ${box.panel ?? box.node ?? box.material}`));
    }
  });
  const hits: string[] = [];
  let pairs = 0;
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (boxes[i].owner === boxes[j].owner) continue;
      pairs += 1;
      const depth = Math.min(...[0, 1, 2].map((k) => Math.min(boxes[i].max[k], boxes[j].max[k]) - Math.max(boxes[i].min[k], boxes[j].min[k])));
      if (depth > 0.5) hits.push(`${boxes[i].tag} × ${boxes[j].tag} на ${depth.toFixed(1)} мм`);
    }
  }
  return { hits, pairs };
}

/** Низ и верх модуля от пола, мм — по месту, по которому его ставит сцена (`runPlaces`). */
export function levelOf(run: Run, unitId: string): { bottom: number; top: number } | null {
  const entry = runPlaces(run).find((item) => item.unit.id === unitId);
  return entry ? { bottom: Math.round(entry.y * 1000), top: Math.round((entry.y + entry.heightM) * 1000) } : null;
}
