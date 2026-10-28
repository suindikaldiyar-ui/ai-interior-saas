/**
 * ОБЪЕКТЫ ПРИЁМКИ STAGE A (ADVANCED CAD) — угол и чистота 3D, путём экрана.
 *
 * Числа директивы, замер — цепочка стен под прямым углом, без проёмов
 * (меряется угол, а не обход окна):
 *
 *   straight  прямая, стена A 3800;
 *   l         Г, A 3800 + B 1140, углы нового объекта (низ и верх слепые);
 *   u         П, A 3800 + B 2400 + C 1740, углы нового объекта. П директивы
 *             (A 3800 + B 1140 + C 1740) не собирается физически: стены А и
 *             В стоят друг против друга в 1140 мм, а двум нижним рядам нужно
 *             2 × (560 + 16) = 1152 мм — фасады входят друг в друга на 12 мм.
 *             Композиция отказывает словами (`U_DIRECTIVE`); для 3D взята
 *             ближайшая собираемая — изменена только стена Б;
 *   u-lshape  П 3600 + 2800 + 3600, у обоих углов Г-модули (низ и верх) —
 *             угловые корпуса с двумя фасадами на одном ключе. На стенах
 *             директивы так нельзя: стене B 1140 после двух Г-модулей по 900
 *             остаётся 240 мм — движок отказывает словами («сумма модулей
 *             900 мм при длине 240 мм»).
 *
 * Рабочая стена — как у экрана (`projectWorkspace` не передаёт её): самая
 * длинная в замере; у всех объектов это первая стена, и обход идёт от неё.
 *
 * Ожидания считает ТОТ ЖЕ путь, что рабочее место (`objectSite` →
 * `compositionFor` → `objectInput` → `composeVariants` → `wallSegments` →
 * `runPlacements`): какие модули на какой стене, где их корпус в мире,
 * какие у них подвижные детали (`sceneLeaves`). Браузер меряет
 * НАРИСОВАННОЕ и сверяет с этим; своей арифметики места у приёмки нет.
 *
 * Выход — JSON в stdout. Композиция не собралась — падение со словами
 * движка, а не пустой объект.
 */
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import {
  compositionFor,
  objectInput,
  objectSite,
  wallCornerOf,
  wallRequirementsOf,
  wallSegments,
} from '../lib/millwork/objectEstimate';
import { runPlacements } from '../lib/millwork/composition';
import { runPlaces, sceneLeaves } from '../lib/millwork/cabinetBoxes';
import { blindPartMm, openFrontMm, openFrontOf } from '../lib/millwork/corner';
import { DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { DEFAULT_PRODUCTION } from '../types/catalog';
import { surveyFromMeasurement, type Survey } from '../types/survey';
import type {
  CompositionKind,
  CornerChoice,
  Measurement,
  Opening,
  Run,
  RunRequirements,
  SavedCornerChoice,
  VariantKey,
} from '../types/millwork';
import type { ProductionSettings } from '../types/catalog';

const MM = 1000;

/**
 * Доступная часть фасада у слепого угла — так же, как её передаёт сцена
 * (`Cabinet3D` → `openWidthM`). Без неё список створок врёт у модуля, который
 * слепая зона съела целиком (П 3800 + 2400 + 1740 на школе 600/300 с панелью
 * владельца 12 мм: 600 + 16 + 12 = 628 — вся ширина модуля): сцена створку не
 * ставит, а `sceneLeaves` без ширины называл её.
 */
export const openWidthOf = (unit: Run['modules'][number], run: Run) =>
  blindPartMm(unit, run) > 0 ? openFrontMm(unit, run) / MM : undefined;

/**
 * С какой отметки модуля доступная часть, метры (P0): у слепого модуля в
 * начале ряда (угол перед рядом ведёт он) створка стоит справа — так её
 * ставит сцена (`openFrontOf` → `openFromM`).
 */
export const openFromOf = (unit: Run['modules'][number], run: Run) => (openFrontOf(unit, run)?.fromMm ?? 0) / MM;

/** Замер как замеренный: приёмка не про допущения (как у `lighting-fixture`). */
function measuredSurvey(measurement: Measurement, runWallId?: string): Survey {
  const survey = surveyFromMeasurement(measurement, 'STAGE A', 'STAGE A', '2026-10-24');
  const known = <T,>(value: unknown): T => {
    const v = value as { state?: string; value?: unknown };
    return (v && v.state === 'assumed' ? { state: 'measured', value: v.value } : value) as T;
  };
  return {
    ...survey,
    ceilingHeightMm: known(survey.ceilingHeightMm),
    walls: survey.walls.map((wall) => ({
      ...wall,
      /* Рабочая стена задана — она и рабочая у экрана (`resolveSurvey`), а не самая длинная. */
      ...(runWallId ? { isRunWall: wall.id === runWallId } : {}),
      lengthMm: known(wall.lengthMm),
      openings: wall.openings.map((o) => ({
        ...o,
        fromCornerMm: known(o.fromCornerMm),
        widthMm: known(o.widthMm),
        heightMm: known(o.heightMm),
        sillMm: known(o.sillMm),
      })),
    })),
    comms: survey.comms.map((c) => ({ ...c, fromCornerMm: known(c.fromCornerMm), heightMm: known(c.heightMm) })),
    steps: { ceiling: 'done', walls: 'done', openings: 'done', comms: 'done', photos: 'todo' },
  };
}

export function measurementOf(lengths: number[], openings: Opening[][] = []): Measurement {
  return {
    id: `stage-a-${lengths.join('-')}`,
    ceilingHeightMm: 2700,
    walls: lengths.map((lengthMm, i) => ({ id: `w${i + 1}`, lengthMm, angleDeg: 90, openings: openings[i] ?? [] })),
    comms: [],
    photos: [],
    measuredBy: 'STAGE A',
    measuredAt: '2026-10-24',
    notes: 'Приёмка STAGE A: числа директивы.',
  };
}

export type Spec = {
  key: string;
  title: string;
  lengths: number[];
  shape: CompositionKind;
  corners: CornerChoice[];
  /** Состав кухни; по умолчанию — демо (холодильник, духовка, мойка, посудомойка, варочная, вытяжка). */
  requirements?: RunRequirements;
  /** Школа цеха; по умолчанию — типовая. */
  production?: ProductionSettings;
  /** Проёмы и препятствия по стенам; по умолчанию — нет (меряется угол, а не обход окна). */
  openings?: Opening[][];
  /** Правки соседних стен (`editedWalls` экрана): ключ — `wallId`. По умолчанию — нет. */
  edits?: Record<string, Run>;
  /** Рабочая стена замера; по умолчанию — самая длинная, как у экрана. */
  wallId?: string;
  /**
   * Правленый ряд РАБОЧЕЙ стены (`editedRuns` экрана, P1): стену А экран берёт
   * из `composeVariants`, а не из `editedWalls`, — и правку туда же.
   */
  working?: Run;
};

export const NEW_CORNER: CornerChoice = { lower: 'blind', upper: 'blind' };
export const L_MODULE: CornerChoice = { lower: 'l_shape', upper: 'l_shape' };

export const SPECS: Spec[] = [
  { key: 'straight', title: 'прямая 3800', lengths: [3800], shape: 'linear', corners: [] },
  { key: 'l', title: 'Г 3800 + 1140', lengths: [3800, 1140], shape: 'corner_l', corners: [NEW_CORNER] },
  { key: 'u', title: 'П 3800 + 2400 + 1740', lengths: [3800, 2400, 1740], shape: 'u_shape', corners: [NEW_CORNER, NEW_CORNER] },
  { key: 'u-lshape', title: 'П 3600 + 2800 + 3600, Г-модули', lengths: [3600, 2800, 3600], shape: 'u_shape', corners: [L_MODULE, L_MODULE] },
];

/** Школы цеха браузерной приёмки панелей по ходу: те же числа уходят в `orgs.production` временной организации. */
export const SCHOOL_600: ProductionSettings = { ...DEFAULT_PRODUCTION, depths: { baseMm: 600, upperMm: 300, mezzanineMm: 600 } };
export const SCHOOL_60_1000: ProductionSettings = {
  ...DEFAULT_PRODUCTION,
  corner: { falsePanelMm: 60, lowerLMm: 1000, upperLMm: 600, confirmed: true },
};

/**
 * ПАНЕЛИ ПО ХОДУ (STAGE A) — объекты браузерной части `clearance`:
 *   u-600      П 3800 + 2400 + 1740 на школе 600/300 — панель стены Б у слепого модуля 12 мм;
 *   u-mixed60  П 2800 + 3600 + 2800 смешанная на школе «угол 60/1000» — панель стены В 64 мм вместо 60
 *              (рабочая стена — первая, как в слое 55);
 *   u-tall     П 3600 + 2800 + 3600 со слепыми углами — заход, который панелью не снять: блокирующее.
 */
export const CLEARANCE_SPECS: Spec[] = [
  { key: 'u-600', title: 'П 3800 + 2400 + 1740 · 600/300', lengths: [3800, 2400, 1740], shape: 'u_shape', corners: [NEW_CORNER, NEW_CORNER], production: SCHOOL_600 },
  {
    key: 'u-mixed60',
    title: 'П 2800 + 3600 + 2800 смешанная · угол 60/1000',
    lengths: [2800, 3600, 2800],
    shape: 'u_shape',
    corners: [
      { lower: 'l_shape', upper: 'empty' },
      { lower: 'blind', upper: 'l_shape' },
    ],
    production: SCHOOL_60_1000,
    wallId: 'w1',
  },
  { key: 'u-tall', title: 'П 3600 + 2800 + 3600, слепые углы', lengths: [3600, 2800, 3600], shape: 'u_shape', corners: [NEW_CORNER, NEW_CORNER] },
];

/** П директивы: ряды стен А и В друг против друга в 1140 мм — отказ словами, а не кухня одна в другой. */
export const U_DIRECTIVE: Spec = {
  key: 'u-directive',
  title: 'П 3800 + 1140 + 1740',
  lengths: [3800, 1140, 1740],
  shape: 'u_shape',
  corners: [NEW_CORNER, NEW_CORNER],
};

const DISABLED: Record<VariantKey, string[]> = { basic: [], optimal: [], premium: [] };

/** Точка ряда (м, x вдоль ряда, z от фасадов к стене — минус) → мир, мм. */
function toWorld(place: { xM: number; zM: number; rotationYDeg: number }, [x, y, z]: [number, number, number]): [number, number, number] {
  const a = (place.rotationYDeg * Math.PI) / 180;
  return [
    Math.round((x * Math.cos(a) + z * Math.sin(a) + place.xM) * MM * 10) / 10,
    Math.round(y * MM * 10) / 10,
    Math.round((-x * Math.sin(a) + z * Math.cos(a) + place.zM) * MM * 10) / 10,
  ];
}

/** Композиция объекта тем же путём экрана — собранная или отказ словами движка (без исключения). */
export function compositionAttemptOf(spec: Spec) {
  const measurement = measurementOf(spec.lengths, spec.openings);
  const requirements = spec.requirements ?? DEMO_REQUIREMENTS;
  const production = spec.production ?? DEFAULT_PRODUCTION;
  const base = workspaceInput({
    title: spec.title,
    zone: 'Кухня',
    measurement,
    requirements,
    rates: DEMO_RATES,
    cornerAt: null,
    ...(spec.wallId ? { wallId: spec.wallId } : {}),
  } as never);
  return compositionFor({
    shape: spec.shape,
    requirements,
    cornerSolution: 'false_panel',
    corners: spec.corners,
    site: objectSite(base, null),
    production,
    variantKey: 'optimal',
  });
}

export function buildObject(spec: Spec) {
  const measurement = measurementOf(spec.lengths, spec.openings);
  const requirements = spec.requirements ?? DEMO_REQUIREMENTS;
  const production = spec.production ?? DEFAULT_PRODUCTION;
  const base = workspaceInput({
    title: spec.title,
    zone: 'Кухня',
    measurement,
    requirements,
    rates: DEMO_RATES,
    cornerAt: null,
    ...(spec.wallId ? { wallId: spec.wallId } : {}),
  } as never);
  const site = objectSite(base, null);
  const attempt =
    spec.shape === 'linear'
      ? null
      : compositionFor({
          shape: spec.shape,
          requirements,
          cornerSolution: 'false_panel',
          corners: spec.corners,
          site,
          production,
          variantKey: 'optimal',
        });
  if (spec.shape !== 'linear' && attempt?.state !== 'built') {
    throw new Error(`STAGE A ${spec.title}: композиция не собралась — ${attempt?.state === 'refused' ? attempt.reason : 'нет композиции'}`);
  }
  const layout = attempt && attempt.state === 'built' ? attempt.composition : null;
  const input = objectInput({
    base,
    resolution: null,
    requirements: layout ? wallRequirementsOf(layout, requirements) : requirements,
    rates: DEMO_RATES,
    production,
    milling: new Map(),
    carcass: new Map(),
    materials: new Map(),
    ...(layout ? { corner: wallCornerOf(layout) } : {}),
  });
  const active = composeVariants(input, DISABLED, spec.working ? { optimal: spec.working } : {}).find((variant) => variant.key === 'optimal');
  if (!active) throw new Error(`STAGE A ${spec.title}: варианта optimal нет`);
  const segments: Run[] = wallSegments(layout, active.run, spec.edits ?? {}, input.wallEnds);
  const places = runPlacements({ runs: segments, corners: spec.corners, zone: active.run.zone, production });

  const rows = segments.map((run, i) => {
    const placement = places[i];
    const modules = runPlaces(run).map((place) => {
      const unit = place.unit;
      const min: [number, number, number] = [place.x, place.y, place.zM - place.depthM];
      const max: [number, number, number] = [place.x + unit.widthMm / MM, place.y + place.heightM, place.zM];
      /* Габарит в мире — по восьми углам коробки ряда (поворот кратен 90°). */
      const corners = [0, 1].flatMap((ix) =>
        [0, 1].flatMap((iy) => [0, 1].map((iz) => toWorld(placement, [ix ? max[0] : min[0], iy ? max[1] : min[1], iz ? max[2] : min[2]]))),
      );
      const worldMin = [0, 1, 2].map((k) => Math.min(...corners.map((c) => c[k])));
      const worldMax = [0, 1, 2].map((k) => Math.max(...corners.map((c) => c[k])));
      return {
        id: unit.id,
        kind: unit.kind,
        label: unit.label,
        appliance: unit.appliance ?? null,
        column: unit.column ?? null,
        builtIn: unit.builtIn ?? null,
        section: unit.section ?? null,
        rowLocal: { x: Math.round(place.x * MM), y: Math.round(place.y * MM), zFront: Math.round(place.zM * MM), w: unit.widthMm, h: Math.round(place.heightM * MM), d: Math.round(place.depthM * MM) },
        world: { min: worldMin, max: worldMax },
        leaves: sceneLeaves(unit, place.heightM, openWidthOf(unit, run), openFromOf(unit, run)).map((leaf) => ({ id: leaf.id, kind: leaf.kind })),
      };
    });
    return {
      wallId: run.wallId ?? null,
      lengthMm: run.lengthMm,
      placement,
      modules,
    };
  });

  const corners: SavedCornerChoice[] = spec.corners.map((choice, i) => ({
    ...choice,
    walls: [`w${i + 1}`, `w${i + 2}`] as [string, string],
  }));

  return {
    key: spec.key,
    title: spec.title,
    shape: spec.shape,
    measurement,
    survey: measuredSurvey(measurement, spec.wallId),
    requirements,
    corners,
    rows,
    /* Панели по ходу и заходы, которые панелью не снять (STAGE A), — словами, как их видит экран. */
    clearance: (layout?.corners ?? []).map((corner) => ({ choice: corner.choice, why: corner.clearanceWhy ?? [] })),
    cornerClashes: (layout?.cornerClashes ?? []).map((note) => ({ wall: note.wall, leaf: note.leaf, words: note.words })),
    /** Для приёмки движка: композиция, ряды экрана и их места — без пересчёта. */
    engine: { layout, segments, places, active, input },
  };
}

/* Прямой запуск — JSON объектов для браузерной приёмки (без движковой части). */
const direct = process.argv[1] && /corner-quality-fixture\.ts$/.test(process.argv[1]);
if (direct) {
  const out: Record<string, Omit<ReturnType<typeof buildObject>, 'engine'>> = {};
  for (const spec of [...SPECS, ...CLEARANCE_SPECS]) {
    const { engine: _engine, ...object } = buildObject(spec);
    out[spec.key] = object;
  }
  const refused = compositionAttemptOf(U_DIRECTIVE);
  if (refused?.state !== 'refused') throw new Error('STAGE A: П 3800 + 1140 + 1740 собралась — ждали отказ словами');
  const measurement = measurementOf(U_DIRECTIVE.lengths);
  process.stdout.write(
    JSON.stringify({
      ...out,
      [U_DIRECTIVE.key]: {
        key: U_DIRECTIVE.key,
        title: U_DIRECTIVE.title,
        shape: U_DIRECTIVE.shape,
        measurement,
        survey: measuredSurvey(measurement),
        requirements: DEMO_REQUIREMENTS,
        corners: U_DIRECTIVE.corners.map((choice, i) => ({ ...choice, walls: [`w${i + 1}`, `w${i + 2}`] })),
        refusal: refused.reason,
      },
    }),
  );
}
