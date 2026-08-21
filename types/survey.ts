import type { CommKind, Measurement, OpeningKind, WallSegment } from './millwork';

/**
 * Режим замерщика.
 *
 * ГЛАВНОЕ ПРАВИЛО СЛОЯ: система не имеет права выглядеть уверенной там, где
 * она не знает. Замерщик показывает этот экран клиенту, и всё, что на нём
 * написано, клиент примет за факт. Поэтому у каждой величины есть состояние,
 * и подставленное по умолчанию число НИКОГДА не выглядит как замеренное.
 */

export type Known<T> =
  | { state: 'measured'; value: T }
  | { state: 'assumed'; value: T; basis: string }
  | { state: 'unknown' };

export type KnownState = 'measured' | 'assumed' | 'unknown';

export const UNKNOWN: Known<never> = { state: 'unknown' };

export function measured<T>(value: T): Known<T> {
  return { state: 'measured', value };
}

export function assumed<T>(value: T, basis: string): Known<T> {
  return { state: 'assumed', value, basis };
}

export function isKnown<T>(k: Known<T> | undefined): k is
  | { state: 'measured'; value: T }
  | { state: 'assumed'; value: T; basis: string } {
  return k !== undefined && k.state !== 'unknown';
}

/** Значение или undefined. Никаких «удобных» подстановок молча. */
export function valueOf<T>(k: Known<T> | undefined): T | undefined {
  return isKnown(k) ? k.value : undefined;
}

/**
 * Довести неизвестное до рабочего числа — но не молча.
 * Возвращает величину, помеченную `assumed`, с объяснением, откуда она.
 */
export function resolveAssumed<T>(
  k: Known<T> | undefined,
  fallback: T,
  basis: string,
): Known<T> {
  return isKnown(k) ? k : assumed(fallback, basis);
}

export type Assumption = {
  /** Где именно принято допущение: «Стена 1 · окно · высота подоконника». */
  where: string;
  basis: string;
  /** Влияет ли на количество материала — от этого зависит статус сметы. */
  affectsQuantity: boolean;
};

export type Pending = {
  where: string;
  /** Что произойдёт, если не уточнить. Формулировка называет последствие. */
  consequence: string;
};

/* ─────────────────────────  Модель замера  ───────────────────────── */

export type SurveyStep = 'ceiling' | 'walls' | 'openings' | 'comms' | 'photos';

export const SURVEY_STEPS: SurveyStep[] = [
  'ceiling',
  'walls',
  'openings',
  'comms',
  'photos',
];

export const STEP_TITLE: Record<SurveyStep, string> = {
  ceiling: 'Высота потолка',
  walls: 'Стены по кругу',
  openings: 'Проёмы',
  comms: 'Коммуникации',
  photos: 'Фото',
};

export type StepState = 'todo' | 'done' | 'skipped';

export type SurveyTurn = 'left' | 'right' | 'custom';

export interface SurveyOpening {
  id: string;
  kind: OpeningKind;
  fromCornerMm: Known<number>;
  widthMm: Known<number>;
  heightMm: Known<number>;
  /** Низ проёма от пола. У двери — 0. */
  sillMm: Known<number>;
  depthMm?: Known<number>;
}

export interface SurveyWall {
  id: string;
  lengthMm: Known<number>;
  /** Куда поворачивает стена после этого сегмента. */
  turn: SurveyTurn;
  turnDeg: number;
  openings: SurveyOpening[];
  /** Ряд гарнитура строится вдоль этой стены. */
  isRunWall?: boolean;
}

export interface SurveyComm {
  id: string;
  kind: CommKind;
  wallId: string;
  fromCornerMm: Known<number>;
  heightMm: Known<number>;
  note?: string;
}

export interface SurveyPhoto {
  id: string;
  dataUrl?: string;
  path?: string;
  name: string;
  primary: boolean;
}

export interface Survey {
  ceilingHeightMm: Known<number>;
  walls: SurveyWall[];
  comms: SurveyComm[];
  photos: SurveyPhoto[];
  /** Пожелания со слов клиента. Ничего не интерпретируем, просто храним. */
  clientNotes: string;
  steps: Record<SurveyStep, StepState>;
  measuredBy: string;
  measuredAt: string;
  /** Замер объявлен завершённым: показывается сводка и замерный лист. */
  finishedAt?: string;
}

export const DEFAULT_TURN_DEG = 90;

export function emptySurvey(measuredBy = '', measuredAt = ''): Survey {
  return {
    ceilingHeightMm: UNKNOWN,
    walls: [],
    comms: [],
    photos: [],
    clientNotes: '',
    steps: { ceiling: 'todo', walls: 'todo', openings: 'todo', comms: 'todo', photos: 'todo' },
    measuredBy,
    measuredAt,
  };
}

export function newWall(index: number): SurveyWall {
  return {
    id: `w${index + 1}`,
    lengthMm: UNKNOWN,
    turn: 'right',
    turnDeg: DEFAULT_TURN_DEG,
    openings: [],
    isRunWall: index === 0,
  };
}

/* ─────────────────────────  Подсчёт состояний  ───────────────────────── */

export type SurveyStats = {
  measured: number;
  assumed: number;
  unknown: number;
  /** Что осталось неизвестным — с последствием, а не с фактом. */
  pending: Pending[];
  assumptions: Assumption[];
};

const OPENING_TITLE: Record<OpeningKind, string> = {
  window: 'окно',
  door: 'дверь',
  arch: 'арка',
  niche: 'ниша',
  column: 'колонна',
  pipe_box: 'короб',
};

export const COMM_TITLE: Record<CommKind, string> = {
  water_supply: 'вывод воды',
  sewer: 'канализация',
  gas: 'газ',
  ventilation: 'вентканал',
  socket: 'розетка',
  switch: 'выключатель',
  radiator: 'радиатор',
};

/** Стандартные допущения. Каждое обязано объяснять, откуда взялось число. */
export const ASSUMPTION_BASIS = {
  ceiling: 'стандарт новостройки — 2700 мм',
  sill: 'стандартная высота подоконника — 850 мм',
  doorHeight: 'стандартный дверной проём — 2100 мм',
} as const;

function count(stats: SurveyStats, k: Known<unknown> | undefined) {
  if (!k || k.state === 'unknown') stats.unknown++;
  else if (k.state === 'assumed') stats.assumed++;
  else stats.measured++;
}

export function surveyStats(survey: Survey): SurveyStats {
  const stats: SurveyStats = {
    measured: 0,
    assumed: 0,
    unknown: 0,
    pending: [],
    assumptions: [],
  };

  const note = (k: Known<unknown> | undefined, where: string, consequence: string, affects: boolean) => {
    count(stats, k);
    if (!k || k.state === 'unknown') stats.pending.push({ where, consequence });
    else if (k.state === 'assumed') {
      stats.assumptions.push({ where, basis: k.basis, affectsQuantity: affects });
    }
  };

  note(
    survey.ceilingHeightMm,
    'Высота потолка',
    'верхний ряд и антресоль посчитаны по стандарту — на объекте может не встать',
    true,
  );

  survey.walls.forEach((wall, i) => {
    note(
      wall.lengthMm,
      `Стена ${i + 1} · длина`,
      'длина ряда взята приблизительно — смета изменится после замера',
      true,
    );

    wall.openings.forEach((opening) => {
      const where = `Стена ${i + 1} · ${OPENING_TITLE[opening.kind]}`;
      note(opening.fromCornerMm, `${where} · привязка`, 'разрыв верхнего ряда встанет не туда', true);
      note(opening.widthMm, `${where} · ширина`, 'разрыв верхнего ряда встанет не туда', true);
      note(opening.heightMm, `${where} · высота`, 'верхние шкафы могут упереться в проём', false);
      if (opening.kind === 'window') {
        note(opening.sillMm, `${where} · подоконник`, 'столешница может упереться в подоконник', false);
      }
    });
  });

  survey.comms.forEach((comm) => {
    const where = `${COMM_TITLE[comm.kind]}`;
    note(comm.fromCornerMm, `${where} · привязка`, 'монтажник не будет знать, где выводить', false);
    note(comm.heightMm, `${where} · высота`, 'монтажник не будет знать, где выводить', false);
  });

  return stats;
}

/**
 * Точной смета называется, только когда ВСЕ величины замерены. Любое
 * допущение — уже предварительная: клиент подписывает сумму, а не намерение.
 */
export function isEstimatePreliminary(stats: SurveyStats): boolean {
  return stats.unknown > 0 || stats.assumptions.length > 0;
}

/** Меняет ли допущение сумму. От этого зависит формулировка, а не статус. */
export function assumptionsAffectPrice(stats: SurveyStats): boolean {
  return stats.unknown > 0 || stats.assumptions.some((a) => a.affectsQuantity);
}

/* ─────────────────────────  Замер → конфигуратор  ───────────────────────── */

export type SurveyResolution = {
  measurement: Measurement;
  stats: SurveyStats;
  /** Стена, вдоль которой строится ряд. */
  runWallId: string;
};

/**
 * Перевод замера в вход конфигуратора.
 *
 * Здесь и только здесь неизвестные величины превращаются в числа — и каждая
 * помечается допущением. Молча подставить «удобное» значение нельзя: клиент
 * увидит его на экране и примет за замеренное.
 */
export function resolveSurvey(survey: Survey): SurveyResolution {
  const resolved: Survey = {
    ...survey,
    ceilingHeightMm: resolveAssumed(survey.ceilingHeightMm, 2700, ASSUMPTION_BASIS.ceiling),
    walls: survey.walls.map((wall) => ({
      ...wall,
      openings: wall.openings.map((opening) => ({
        ...opening,
        sillMm:
          opening.kind === 'window'
            ? resolveAssumed(opening.sillMm, 850, ASSUMPTION_BASIS.sill)
            : opening.kind === 'door'
              ? measured(0)
              : opening.sillMm,
        heightMm:
          opening.kind === 'door'
            ? resolveAssumed(opening.heightMm, 2100, ASSUMPTION_BASIS.doorHeight)
            : opening.heightMm,
      })),
    })),
  };

  const walls: WallSegment[] = resolved.walls.map((wall) => ({
    id: wall.id,
    // Стена без длины в конфигуратор не попадает вовсе — её просто нет.
    lengthMm: valueOf(wall.lengthMm) ?? 0,
    angleDeg: wall.turn === 'left' ? -wall.turnDeg : wall.turnDeg,
    openings: wall.openings
      .filter((o) => valueOf(o.fromCornerMm) !== undefined && valueOf(o.widthMm) !== undefined)
      .map((o) => ({
        id: o.id,
        kind: o.kind,
        fromCornerMm: valueOf(o.fromCornerMm) ?? 0,
        widthMm: valueOf(o.widthMm) ?? 0,
        sillMm: valueOf(o.sillMm) ?? 0,
        heightMm: valueOf(o.heightMm) ?? 0,
        depthMm: valueOf(o.depthMm),
      })),
  }));

  const measurement: Measurement = {
    id: 'survey',
    ceilingHeightMm: valueOf(resolved.ceilingHeightMm) ?? 2700,
    walls: walls.filter((w) => w.lengthMm > 0),
    comms: resolved.comms
      .filter((c) => valueOf(c.fromCornerMm) !== undefined)
      .map((c) => ({
        id: c.id,
        kind: c.kind,
        wallId: c.wallId,
        fromCornerMm: valueOf(c.fromCornerMm) ?? 0,
        heightMm: valueOf(c.heightMm) ?? 0,
        note: c.note,
      })),
    photos: resolved.photos.map((p) => p.path ?? p.id),
    measuredBy: survey.measuredBy,
    measuredAt: survey.measuredAt,
    notes: survey.clientNotes,
  };

  const runWall = resolved.walls.find((w) => w.isRunWall && valueOf(w.lengthMm));
  const longest = [...measurement.walls].sort((a, b) => b.lengthMm - a.lengthMm)[0];

  return {
    measurement,
    stats: surveyStats(resolved),
    runWallId: runWall?.id ?? longest?.id ?? 'w1',
  };
}
