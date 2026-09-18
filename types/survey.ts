import { OPENING_KIND_TITLE } from './millwork';
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

/**
 * ОБЪЕКТ И ПОЛЕ — ОТДЕЛЬНО ОТ СТРОКИ.
 *
 * `where` — это «Стена 1 · окно · привязка», одна строка для замерного
 * листа. Но на экране три таких строки об ОДНОМ окне должны сойтись в
 * одну, а склеенный текст для этого разобрать нельзя: разбор строки —
 * та же связь подписью, от которой продукт уходит.
 *
 * Поэтому объект («Стена 1 · окно») и поле («привязка») лежат рядом
 * готовыми: их и так собирает тот, кто строит `where`.
 */
export type Assumption = {
  /** Где именно принято допущение: «Стена 1 · окно · высота подоконника». */
  where: string;
  /** Чьё это допущение: «Стена 1 · окно». */
  subject: string;
  /** Какая величина: «привязка». Пусто — у объекта она одна. */
  field?: string;
  basis: string;
  /** Влияет ли на количество материала — от этого зависит статус сметы. */
  affectsQuantity: boolean;
};

export type Pending = {
  where: string;
  /** Чей это замер: «Стена 1 · окно». */
  subject: string;
  /** Какая величина: «привязка». Пусто — у объекта она одна. */
  field?: string;
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

/* ────────────────  Замер из библиотеки планировок  ──────────────── */

/**
 * Библиотечный замер → замер объекта.
 *
 * КАЖДАЯ ВЕЛИЧИНА ПРИХОДИТ КАК `assumed`, а не `measured`. Замер снят на
 * другой квартире: у одинаковых планировок стены расходятся на сантиметры,
 * и подставить чужие миллиметры как свои — это ровно то враньё, от которого
 * защищает весь слой состояний. Замерщик подтверждает их на объекте, и до
 * этого смета остаётся предварительной.
 *
 * `basis` объясняет происхождение прямо в интерфейсе: откуда число, когда
 * и на какой квартире оно снято, какой допуск.
 */
export function surveyFromMeasurement(
  measurement: Measurement,
  basis: string,
  measuredBy = '',
  measuredAt = '',
): Survey {
  const from = <T>(value: T | undefined | null): Known<T> =>
    value === undefined || value === null ? UNKNOWN : assumed(value, basis);

  const walls: SurveyWall[] = measurement.walls.map((wall, index) => ({
    id: wall.id || `w${index + 1}`,
    lengthMm: from(wall.lengthMm > 0 ? wall.lengthMm : undefined),
    // Прямой угол — это `right`; всё остальное замерщик уточнит сам.
    turn: wall.angleDeg === DEFAULT_TURN_DEG ? 'right' : 'custom',
    turnDeg: wall.angleDeg || DEFAULT_TURN_DEG,
    isRunWall: index === 0,
    openings: wall.openings.map((opening, i) => ({
      id: opening.id || `${wall.id || index}-o${i + 1}`,
      kind: opening.kind,
      fromCornerMm: from(opening.fromCornerMm),
      widthMm: from(opening.widthMm),
      heightMm: from(opening.heightMm),
      sillMm: from(opening.sillMm),
      ...(opening.depthMm !== undefined ? { depthMm: from(opening.depthMm) } : {}),
    })),
  }));

  const comms: SurveyComm[] = measurement.comms.map((comm, i) => ({
    id: comm.id || `c${i + 1}`,
    kind: comm.kind,
    wallId: comm.wallId,
    fromCornerMm: from(comm.fromCornerMm),
    heightMm: from(comm.heightMm),
    note: comm.note,
  }));

  return {
    ceilingHeightMm: from(measurement.ceilingHeightMm > 0 ? measurement.ceilingHeightMm : undefined),
    walls: walls.length > 0 ? walls : [newWall(0)],
    comms,
    photos: [],
    clientNotes: '',
    /*
     * Шаги не отмечены пройденными: замерщик обязан пройти их и подтвердить
     * размеры на месте. Подставленное — это черновик, а не сделанная работа.
     */
    steps: { ceiling: 'todo', walls: 'todo', openings: 'todo', comms: 'todo', photos: 'todo' },
    measuredBy,
    measuredAt,
  };
}

/** Все ли величины замера подтверждены на объекте. */
export function allMeasured(survey: Survey): boolean {
  return surveyStats(survey).assumed === 0 && surveyStats(survey).unknown === 0;
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

  /*
   * Строка `where` собирается ЗДЕСЬ, а не у каждого вызова: раньше
   * `${where} · привязка` набиралось на месте по четыре раза подряд, и
   * объект от поля было уже не отделить.
   */
  const note = (
    k: Known<unknown> | undefined,
    subject: string,
    field: string | undefined,
    consequence: string,
    affects: boolean,
  ) => {
    const where = field ? `${subject} · ${field}` : subject;
    count(stats, k);
    if (!k || k.state === 'unknown') stats.pending.push({ where, subject, field, consequence });
    else if (k.state === 'assumed') {
      stats.assumptions.push({
        where,
        subject,
        field,
        basis: k.basis,
        affectsQuantity: affects,
      });
    }
  };

  note(
    survey.ceilingHeightMm,
    'Высота потолка',
    undefined,
    'верхний ряд и антресоль посчитаны по стандарту — на объекте может не встать',
    true,
  );

  survey.walls.forEach((wall, i) => {
    note(
      wall.lengthMm,
      `Стена ${i + 1}`,
      'длина',
      'длина ряда взята приблизительно — смета изменится после замера',
      true,
    );

    wall.openings.forEach((opening) => {
      const where = `Стена ${i + 1} · ${OPENING_KIND_TITLE[opening.kind].toLowerCase()}`;
      note(opening.fromCornerMm, where, 'привязка', 'разрыв верхнего ряда встанет не туда', true);
      note(opening.widthMm, where, 'ширина', 'разрыв верхнего ряда встанет не туда', true);
      note(opening.heightMm, where, 'высота', 'верхние шкафы могут упереться в проём', false);
      if (opening.kind === 'window') {
        note(opening.sillMm, where, 'подоконник', 'столешница может упереться в подоконник', false);
      }
    });
  });

  survey.comms.forEach((comm) => {
    const where = `${COMM_TITLE[comm.kind]}`;
    note(comm.fromCornerMm, where, 'привязка', 'монтажник не будет знать, где выводить', false);
    note(comm.heightMm, where, 'высота', 'монтажник не будет знать, где выводить', false);
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
