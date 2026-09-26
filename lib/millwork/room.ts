import type { CornerJoin, Opening, OpeningKind } from '@/types/millwork';
import { OPENING_KIND_TITLE } from '@/types/millwork';
import type { KnownState, Survey, SurveyOpening } from '@/types/survey';
import { beamDropMm } from './ceiling';
import { cornerLostMm, markOnRun } from './composition';
import { wallLabel } from './walls';

/**
 * КОМНАТА ИЗ ЗАМЕРА — ОДНА ФУНКЦИЯ НА СЦЕНУ, СХЕМУ И ПЛАН (слой 53).
 *
 * «Стены должны стоять как в PRO100» — а стояли плоскости по рядам:
 * по одной за каждым рядом, без окон, дверей и толщины, ригель глубиной
 * РЯДА (числа, которого в замере нет), пол — квадрат по радиусу мебели.
 * Комната при этом давно лежит в замере: длины стен, высота потолка,
 * проёмы с привязкой и размерами.
 *
 * Здесь считается место всего, что принадлежит комнате, — как
 * `runPlaces` для модулей ряда. Сцена строит из этого коробки, схема и
 * план — прямоугольники в координатах ряда (`wallObjectsOnRow`), и
 * второго места «где окно» в продукте нет.
 *
 * СИСТЕМА КООРДИНАТ — ТА ЖЕ, ЧТО У РЯДОВ (`runPlacements`): у ряда фасад
 * на нуле, корпус уходит в −z, задняя плоскость на −глубина ряда. Эта
 * плоскость и есть ВНУТРЕННЯЯ ГРАНЬ стены: стена стоит от неё наружу,
 * и ни один модуль в неё не входит. Стены идут цепочкой, как в замере,
 * с тем же поворотом на −90° на каждом углу, что и ряды.
 *
 * Чего замер не знает, того здесь нет: величина без числа не рисуется, а
 * её имя уходит в `missing` словами. Допущение (`assumed`) рисуется, но
 * помечено — сцена кладёт его полупрозрачным.
 */

/**
 * ТОЛЩИНА СТЕНЫ — ВИЗУАЛЬНАЯ КОНСТАНТА, НЕ ЗАМЕР.
 *
 * Замерщик меряет стену изнутри комнаты, толщины он не видит и в замер её
 * не пишет. Здесь она нужна только затем, чтобы стена читалась стеной, а
 * не листом: в смету, раскрой и чертёж это число не идёт, и считать от
 * него что-либо нельзя.
 */
export const ROOM_WALL_THICKNESS_MM = 120;

/** Как рисовать: замерено — сплошным, допущение — полупрозрачным. */
export type RoomState = 'measured' | 'assumed';

/** Прямоугольник на внутренней грани стены: мм по стене и от пола. */
export type RoomRect = { u0: number; u1: number; v0: number; v1: number };

export type RoomWall = {
  index: number;
  id: string;
  lengthMm: number;
  heightMm: number;
  /** Начало внутренней грани (угол у пола), мир, мм: x и z. */
  startMm: [number, number];
  /** Единичный вектор вдоль стены. */
  dir: [number, number];
  /** Единичная нормаль в комнату. */
  inward: [number, number];
  /** Поворот вокруг вертикали — та же мера, что у рядов. */
  rotationYDeg: number;
  /** Глухие куски стены вокруг проёмов, на внутренней грани. */
  pieces: RoomRect[];
  /**
   * Угловой блок: стена продолжается за свой конец наружу на толщину и
   * закрывает внешний угол со следующей стеной. Ноль — у последней стены
   * незамкнутой цепочки.
   */
  cornerEndMm: number;
  /** Где на этой стене начинается ряд — от угла, мм (`cornerLostMm`). */
  rowStartMm: number;
  state: RoomState;
};

/**
 * Проём сквозь стену (окно, дверь, арка), углубление (ниша) или объём
 * в комнате (ригель, колонна, короб).
 */
export type RoomCut = 'through' | 'recess' | 'volume';

export type RoomObject = {
  id: string;
  kind: OpeningKind;
  wallIndex: number;
  wallId: string;
  /** По стене от её начального угла, мм. */
  fromMm: number;
  widthMm: number;
  /** От пола, мм. */
  bottomMm: number;
  topMm: number;
  /**
   * Вынос в комнату от внутренней грани (ригель, колонна, короб) или
   * глубина ниши. `null` — не замерен: объект рисуется КОНТУРОМ на стене,
   * а не выдуманным объёмом.
   */
  depthMm: number | null;
  cut: RoomCut;
  state: RoomState;
};

export type Room = {
  walls: RoomWall[];
  objects: RoomObject[];
  /**
   * Пол по внутренним граням, мир, мм. `null` — комнаты нет вовсе.
   * У одной стены глубина комнаты не замерена: пол идёт только под
   * мебелью, и это сказано в `missing`.
   */
  floor: [number, number][] | null;
  floorState: RoomState;
  ceilingMm: number;
  ceilingState: RoomState;
  thicknessMm: number;
  /** Чего замер не знает — словами. Это не рисуется. */
  missing: string[];
};

export type RoomWallInput = {
  id: string;
  lengthMm: number;
  openings: Opening[];
  /** Поворот к следующей стене из замера, градусы. */
  angleDeg?: number;
};

export type RoomInput = {
  /** Стены композиции замера по порядку обхода (`compositionWalls`). */
  walls: RoomWallInput[];
  ceilingMm: number;
  /** Глубина ряда: на столько задняя плоскость ряда лежит за его фасадом. */
  depthMm: number;
  /** Решение угла: с какого миллиметра стены начинается её ряд. */
  solution: CornerJoin['solution'];
  /**
   * ОПОРНЫЙ РЯД: на какой стене он стоит и где в мире его начало (фасад,
   * левый край). Комната строится вокруг него — так же, как ряды вокруг
   * первого (`runPlacements`), или вокруг одной стены на видах-чертежах.
   */
  anchor: { wallIndex: number; xM: number; zM: number; rotationYDeg: number };
  /** Живой замер: откуда состояния величин. Нет — всё в замере замерено. */
  survey?: Survey | null;
  /**
   * Глубина мебели от стены, мм: пол под ней, когда комната не замкнута
   * ничем (одна стена). Это не размер комнаты — это то место, где мебель
   * стоит, и оно известно.
   */
  footprintDepthMm?: number;
};

const DEG = Math.PI / 180;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Где на стене начинается её ряд — то же число, что урезало длину ряда. */
export function rowStartOnWallMm(
  wallIndex: number,
  solution: CornerJoin['solution'],
  depthMm: number,
): number {
  return wallIndex === 0 ? 0 : cornerLostMm(solution, depthMm);
}

/** Что из полей проёма читается для этого вида. */
function usedFields(kind: OpeningKind): (keyof Pick<SurveyOpening, 'fromCornerMm' | 'widthMm' | 'heightMm' | 'sillMm'>)[] {
  if (kind === 'window' || kind === 'niche' || kind === 'column' || kind === 'pipe_box') {
    return ['fromCornerMm', 'widthMm', 'heightMm', 'sillMm'];
  }
  // Дверь и арка стоят на полу, у ригеля низ считается из потолка.
  return ['fromCornerMm', 'widthMm', 'heightMm'];
}

const FIELD_TITLE: Record<string, string> = {
  fromCornerMm: 'привязка',
  widthMm: 'ширина',
  heightMm: 'высота',
  sillMm: 'низ от пола',
  depthMm: 'вынос от стены',
};

/** «Ширина не замерена», «низ от пола не замерен», «привязка и ширина не замерены». */
function notMeasured(fields: string[]): string {
  const names = fields.map((field) => FIELD_TITLE[field]).join(' и ');
  if (fields.length > 1) return `${names} не замерены`;
  return fields[0] === 'sillMm' || fields[0] === 'depthMm' ? `${names} не замерен` : `${names} не замерена`;
}

function cutOf(kind: OpeningKind): RoomCut {
  if (kind === 'window' || kind === 'door' || kind === 'arch') return 'through';
  if (kind === 'niche') return 'recess';
  return 'volume';
}

/** Состояние величины замера: по живому замеру, иначе «замерено». */
function stateOf(state: KnownState | undefined): KnownState {
  return state ?? 'measured';
}

/**
 * Куски глухой стены вокруг проёмов — вертикальными полосами.
 *
 * Без библиотек булевых операций: стена режется на полосы по краям
 * проёмов, и в каждой полосе остаётся то, что проёмы не закрыли. Соседние
 * полосы с одинаковой высотой сливаются: кусков столько, сколько видно.
 */
export function wallPieces(lengthMm: number, heightMm: number, holes: RoomRect[]): RoomRect[] {
  const clipped = holes
    .map((hole) => ({
      u0: Math.max(0, Math.min(lengthMm, hole.u0)),
      u1: Math.max(0, Math.min(lengthMm, hole.u1)),
      v0: Math.max(0, Math.min(heightMm, hole.v0)),
      v1: Math.max(0, Math.min(heightMm, hole.v1)),
    }))
    .filter((hole) => hole.u1 - hole.u0 > 0 && hole.v1 - hole.v0 > 0);

  const cuts = Array.from(
    new Set([0, lengthMm, ...clipped.flatMap((hole) => [hole.u0, hole.u1])]),
  ).sort((a, b) => a - b);

  const strips: { u0: number; u1: number; spans: [number, number][] }[] = [];
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const u0 = cuts[i];
    const u1 = cuts[i + 1];
    if (u1 - u0 <= 0) continue;

    const covering = clipped
      .filter((hole) => hole.u0 <= u0 && hole.u1 >= u1)
      .map((hole) => [hole.v0, hole.v1] as [number, number])
      .sort((a, b) => a[0] - b[0]);

    const spans: [number, number][] = [];
    let at = 0;
    for (const [v0, v1] of covering) {
      if (v0 > at) spans.push([at, v0]);
      at = Math.max(at, v1);
    }
    if (at < heightMm) spans.push([at, heightMm]);

    const last = strips[strips.length - 1];
    if (last && last.u1 === u0 && JSON.stringify(last.spans) === JSON.stringify(spans)) {
      last.u1 = u1;
    } else {
      strips.push({ u0, u1, spans });
    }
  }

  return strips.flatMap((strip) =>
    strip.spans.map(([v0, v1]) => ({ u0: strip.u0, u1: strip.u1, v0, v1 })),
  );
}

export function roomLayout(input: RoomInput): Room {
  const missing: string[] = [];
  const survey = input.survey ?? null;
  const T = ROOM_WALL_THICKNESS_MM;
  const walls = input.walls.filter((wall) => wall.lengthMm > 0);
  const n = walls.length;

  const ceilingState: RoomState =
    survey && stateOf(survey.ceilingHeightMm.state) === 'assumed' ? 'assumed' : 'measured';
  const ceilingMm = Math.round(input.ceilingMm);

  /* Состояния по живому замеру: стена по id, проём по id. */
  const surveyWall = new Map((survey?.walls ?? []).map((wall) => [wall.id, wall]));
  const surveyOpening = new Map(
    (survey?.walls ?? []).flatMap((wall) => wall.openings.map((opening) => [opening.id, opening] as const)),
  );
  /* Имя стены — как у замерщика («Стена 2»), без замера — как у композиции. */
  const wallTitle = (id: string, index = -1) => {
    const at = (survey?.walls ?? []).findIndex((wall) => wall.id === id);
    if (at >= 0) return `Стена ${at + 1}`;
    return index >= 0 ? wallLabel(index) : `Стена ${id}`;
  };

  /*
   * Что живой замер знает, а до композиции не доехало: стена без длины
   * и проём без привязки или ширины. Молча их не теряем — называем.
   */
  for (const wall of survey?.walls ?? []) {
    if (wall.lengthMm.state === 'unknown') {
      missing.push(`${wallTitle(wall.id)}: длина не замерена — стена не рисуется`);
    }
    for (const opening of wall.openings) {
      const lost = (['fromCornerMm', 'widthMm'] as const).filter(
        (field) => opening[field].state === 'unknown',
      );
      if (lost.length > 0) {
        missing.push(
          `${wallTitle(wall.id)} · ${OPENING_KIND_TITLE[opening.kind].toLowerCase()}: ${notMeasured(lost)} — не рисуется`,
        );
      }
    }
  }

  /* ── Цепочка стен от опорной ── */
  const anchorIndex = Math.max(0, Math.min(n - 1, input.anchor.wallIndex));
  const rotOf = (j: number) => input.anchor.rotationYDeg - 90 * (j - anchorIndex);
  const dirOf = (j: number): [number, number] => [Math.cos(rotOf(j) * DEG), -Math.sin(rotOf(j) * DEG)];
  const inwardOf = (j: number): [number, number] => [Math.sin(rotOf(j) * DEG), Math.cos(rotOf(j) * DEG)];

  const starts: [number, number][] = new Array(n);
  if (n > 0) {
    const rowStart = rowStartOnWallMm(anchorIndex, input.solution, input.depthMm);
    const d = dirOf(anchorIndex);
    const nin = inwardOf(anchorIndex);
    starts[anchorIndex] = [
      input.anchor.xM * 1000 - input.depthMm * nin[0] - rowStart * d[0],
      input.anchor.zM * 1000 - input.depthMm * nin[1] - rowStart * d[1],
    ];
    for (let j = anchorIndex + 1; j < n; j += 1) {
      const prev = starts[j - 1];
      const pd = dirOf(j - 1);
      starts[j] = [prev[0] + walls[j - 1].lengthMm * pd[0], prev[1] + walls[j - 1].lengthMm * pd[1]];
    }
    for (let j = anchorIndex - 1; j >= 0; j -= 1) {
      const next = starts[j + 1];
      const d0 = dirOf(j);
      starts[j] = [next[0] - walls[j].lengthMm * d0[0], next[1] - walls[j].lengthMm * d0[1]];
    }
  }

  /* ── Объекты стен ── */
  const objects: RoomObject[] = [];
  walls.forEach((wall, index) => {
    if (wall.angleDeg !== undefined && Math.abs(Math.abs(wall.angleDeg) - 90) > 0.5 && index < n - 1) {
      missing.push(
        `${wallTitle(wall.id, index)}: угол к следующей стене ${wall.angleDeg}° — ряды и комната собраны под 90°`,
      );
    }

    for (const opening of wall.openings) {
      const title = `${wallTitle(wall.id, index)} · ${OPENING_KIND_TITLE[opening.kind].toLowerCase()}`;
      const known = surveyOpening.get(opening.id);
      const states = usedFields(opening.kind).map((field) => stateOf(known?.[field]?.state));
      const unknownFields = usedFields(opening.kind).filter(
        (field, i) => states[i] === 'unknown' || (field !== 'sillMm' && field !== 'fromCornerMm' && !(opening[field] > 0)),
      );
      if (unknownFields.length > 0) {
        missing.push(`${title}: ${notMeasured(unknownFields)} — не рисуется`);
        continue;
      }

      const cut = cutOf(opening.kind);
      let bottomMm: number;
      let topMm: number;
      if (opening.kind === 'beam') {
        const drop = beamDropMm(opening);
        bottomMm = Math.max(0, ceilingMm - drop);
        topMm = ceilingMm;
      } else if (opening.kind === 'door' || opening.kind === 'arch') {
        bottomMm = 0;
        topMm = Math.min(ceilingMm, Math.round(opening.heightMm));
      } else {
        bottomMm = Math.max(0, Math.round(opening.sillMm));
        topMm = Math.min(ceilingMm, bottomMm + Math.round(opening.heightMm));
      }

      /*
       * ВЫНОС ОТ СТЕНЫ — ТОЛЬКО ЗАМЕРЕННЫЙ.
       *
       * Ригель рисовался глубиной РЯДА: числа, которого в замере нет. Нет
       * выноса — объект встаёт контуром на стену, а не выдуманным брусом.
       */
      let depthMm: number | null = null;
      if (cut !== 'through') {
        const depthState = known?.depthMm ? stateOf(known.depthMm.state) : opening.depthMm !== undefined ? 'measured' : 'unknown';
        if (depthState !== 'unknown' && typeof opening.depthMm === 'number' && opening.depthMm > 0) {
          depthMm = Math.round(opening.depthMm);
          states.push(depthState);
        } else {
          missing.push(`${title}: вынос от стены не замерен — нарисован контуром на стене`);
        }
      }

      objects.push({
        id: opening.id,
        kind: opening.kind,
        wallIndex: index,
        wallId: wall.id,
        fromMm: Math.round(opening.fromCornerMm),
        widthMm: Math.round(opening.widthMm),
        bottomMm,
        topMm,
        depthMm,
        cut,
        state: states.includes('assumed') ? 'assumed' : 'measured',
      });
    }
  });

  /* ── Стены: куски вокруг проёмов ── */
  const roomWalls: RoomWall[] = walls.map((wall, index) => {
    /*
     * Сквозь стену — окно, дверь, арка. Ниша вырезается, только если её
     * глубина замерена: иначе за вырезом нечего поставить, и стена
     * показала бы дыру, которой в квартире нет.
     */
    const holes = objects
      .filter(
        (object) =>
          object.wallIndex === index &&
          (object.cut === 'through' || (object.cut === 'recess' && object.depthMm !== null)),
      )
      .map((object) => ({
        u0: object.fromMm,
        u1: object.fromMm + object.widthMm,
        v0: object.bottomMm,
        v1: object.topMm,
      }));
    const lengthState = surveyWall.get(wall.id)?.lengthMm.state;
    return {
      index,
      id: wall.id,
      lengthMm: Math.round(wall.lengthMm),
      heightMm: ceilingMm,
      startMm: [round(starts[index][0]), round(starts[index][1])],
      dir: dirOf(index).map(round) as [number, number],
      inward: inwardOf(index).map(round) as [number, number],
      rotationYDeg: rotOf(index),
      pieces: wallPieces(Math.round(wall.lengthMm), ceilingMm, holes),
      cornerEndMm: index < n - 1 ? T : 0,
      rowStartMm: rowStartOnWallMm(index, input.solution, input.depthMm),
      state: lengthState === 'assumed' || ceilingState === 'assumed' ? 'assumed' : 'measured',
    };
  });

  /* ── Пол по внутренним граням ── */
  let floor: [number, number][] | null = null;
  if (n >= 2) {
    const points: [number, number][] = starts.map((p) => [round(p[0]), round(p[1])]);
    const lastDir = dirOf(n - 1);
    const end: [number, number] = [
      round(starts[n - 1][0] + walls[n - 1].lengthMm * lastDir[0]),
      round(starts[n - 1][1] + walls[n - 1].lengthMm * lastDir[1]),
    ];
    const closes = Math.hypot(end[0] - points[0][0], end[1] - points[0][1]) < 1;
    if (!closes) points.push(end);
    /*
     * Две стены — это угол: пол замыкается прямоугольником по ним же.
     * Сторон у него две, и обе замерены — вторая пара параллельна им.
     */
    if (n === 2) {
      points.push([round(points[0][0] + end[0] - points[1][0]), round(points[0][1] + end[1] - points[1][1])]);
    }
    floor = points;
  } else if (n === 1) {
    missing.push(
      'Одна стена в замере: глубина комнаты не замерена — пол нарисован только под мебелью',
    );
    const depth = input.footprintDepthMm ?? 0;
    if (depth > 0) {
      const start = starts[0];
      const d = dirOf(0);
      const nin = inwardOf(0);
      const L = walls[0].lengthMm;
      floor = [
        [round(start[0]), round(start[1])],
        [round(start[0] + L * d[0]), round(start[1] + L * d[1])],
        [round(start[0] + L * d[0] + depth * nin[0]), round(start[1] + L * d[1] + depth * nin[1])],
        [round(start[0] + depth * nin[0]), round(start[1] + depth * nin[1])],
      ];
    }
  }

  return {
    walls: roomWalls,
    objects,
    floor,
    floorState: roomWalls.some((wall) => wall.state === 'assumed') ? 'assumed' : 'measured',
    ceilingMm,
    ceilingState,
    thicknessMm: T,
    missing,
  };
}

/**
 * СТЕНЫ МЕЖДУ КАМЕРОЙ И КОМНАТОЙ.
 *
 * Камера по ту сторону внутренней грани — значит стена стоит между ней и
 * мебелью и закрывает её. Такие стены прячутся: видны три, открытая
 * сторона — к зрителю. Считается от позы камеры, а не в цикле кадров.
 */
export function wallsFacingAway(room: Room, cameraMm: [number, number]): number[] {
  return room.walls
    .filter((wall) => {
      const dx = cameraMm[0] - wall.startMm[0];
      const dz = cameraMm[1] - wall.startMm[1];
      return dx * wall.inward[0] + dz * wall.inward[1] < 0;
    })
    .map((wall) => wall.index);
}

export type RowRoomObject = RoomObject & {
  /** Отметка на ряду, мм от его начала — тем же `markOnRun`, что раскладка. */
  onRowFromMm: number;
  onRowWidthMm: number;
};

/**
 * ОБЪЕКТЫ СТЕНЫ В КООРДИНАТАХ ЕЁ РЯДА — для схемы и плана.
 *
 * Перевод тот же, что у раскладки (`markOnRun`): ряд на стене Б
 * начинается не от угла, и отметки замера сдвинуты на то, что занял
 * угол. Своей арифметики у чертежа нет — иначе ригель на схеме встал бы
 * не там, где по нему урезан шкаф.
 */
export function wallObjectsOnRow(room: Room, wallIndex: number, rowLengthMm: number): RowRoomObject[] {
  const wall = room.walls[wallIndex];
  if (!wall) return [];
  return room.objects
    .filter((object) => object.wallIndex === wallIndex)
    .flatMap((object) => {
      const at = markOnRun({ fromCornerMm: object.fromMm, widthMm: object.widthMm }, wall.rowStartMm, rowLengthMm);
      return at ? [{ ...object, onRowFromMm: at.fromCornerMm, onRowWidthMm: at.widthMm }] : [];
    });
}

/**
 * СТЕНА РЯДА И ЕЁ ОБЪЕКТЫ — ДЛЯ СХЕМЫ И ПЛАНА.
 *
 * Стена ищется по `wallId` ряда: у угловой кухни рядов несколько, и окно
 * стены Б на схеме стены А было бы окном не там. Нет комнаты или стены —
 * пусто, и чертёж рисует прежнюю условную стену.
 */
export function roomOnRow(
  room: Room | null,
  run: { wallId?: string; lengthMm: number },
): { wall: { fromMm: number; toMm: number; state: RoomState } | null; objects: RowRoomObject[] | undefined } {
  if (!room) return { wall: null, objects: undefined };
  const index = room.walls.findIndex((wall) => wall.id === run.wallId);
  if (index < 0) return { wall: null, objects: undefined };
  return { wall: wallOnRow(room, index), objects: wallObjectsOnRow(room, index, run.lengthMm) };
}

/** Стена под рядом — от угла до угла, в координатах ряда. */
export function wallOnRow(
  room: Room,
  wallIndex: number,
): { fromMm: number; toMm: number; state: RoomState } | null {
  const wall = room.walls[wallIndex];
  if (!wall) return null;
  return { fromMm: -wall.rowStartMm, toMm: wall.lengthMm - wall.rowStartMm, state: wall.state };
}

/* ─────────────────────  Комната на экране  ───────────────────── */

/** Что комнате нужно от объекта: всё, кроме опоры, которую даёт сцена. */
export type RoomSource = Omit<RoomInput, 'anchor' | 'footprintDepthMm'>;

/**
 * ИСТОЧНИК КОМНАТЫ НА РАБОЧЕМ МЕСТЕ.
 *
 * Стены композиции замера (`objectSite`), живые проёмы рабочей стены —
 * те, по которым собран ряд, — и углы из замера. Жило это разметкой
 * внутри `Workspace`, и проверка комнаты могла пройти только мимо экрана;
 * теперь экран и приёмка зовут одну функцию.
 */
export function roomSourceOf(input: {
  /** Стены композиции по порядку обхода (`objectSite(...).walls`). */
  walls: { id: string; lengthMm: number; openings: Opening[] }[];
  /** Проёмы рабочей стены, по которым собран ряд. */
  runOpenings: Opening[];
  /** Стены замера: откуда угол к следующей стене. */
  measuredWalls: { id: string; angleDeg?: number }[];
  ceilingMm: number;
  depthMm: number;
  solution: CornerJoin['solution'];
  survey?: Survey | null;
}): RoomSource {
  return {
    walls: input.walls.map((wall, i) => ({
      ...wall,
      openings: i === 0 ? input.runOpenings : wall.openings,
      angleDeg: input.measuredWalls.find((measured) => measured.id === wall.id)?.angleDeg,
    })),
    ceilingMm: input.ceilingMm,
    depthMm: input.depthMm,
    solution: input.solution,
    survey: input.survey ?? null,
  };
}

/**
 * КОМНАТА ВОКРУГ РЯДОВ СЦЕНЫ.
 *
 * Опора — ПЕРВЫЙ ряд: его стена и его место (`rowPlacement`), как у
 * камеры (ловушка 302). Остальные стены идут от неё цепочкой той же
 * меры, что `runPlacements`, поэтому ряды угла ложатся на свои стены
 * сами. `frontZM` — перёд габарита мебели: у одной стены глубина комнаты
 * не замерена, и пол идёт только под мебелью.
 */
export function roomAroundRows(
  source: RoomSource,
  rows: { run: { lengthMm: number; wallId?: string }; placement?: { xM: number; zM: number; rotationYDeg: number } }[],
  frontZM: number | null,
): Room | null {
  if (rows.length === 0) return null;
  const first = rows[0];
  const place = rowPlacement(first);
  const at = source.walls.findIndex((wall) => wall.id === first.run.wallId);
  const wallLineZ = place.zM - source.depthMm / 1000;
  const front = frontZM ?? wallLineZ;
  return roomLayout({
    ...source,
    anchor: { wallIndex: at >= 0 ? at : 0, ...place },
    footprintDepthMm: Math.max(0, Math.round((front - wallLineZ) * 1000)),
  });
}

/**
 * Поворот открытой стороны у прямой кухни: камера смещена вбок, чтобы
 * была видна глубина ряда и боковая стена, если она замерена.
 */
export const STRAIGHT_VIEW_YAW_DEG = 22;

/**
 * ОТКРЫТАЯ СТОРОНА КОМНАТЫ — С НЕЁ СМОТРЯТ НА КУХНЮ.
 *
 * Сумма нормалей стен, у которых стоит мебель: прямая смотрит с фронта
 * (со сдвигом вбок ради глубины), угловая — с диагонали на угол,
 * П-образная — в перемычку. С неё ставятся камера «Общего вида» и свет, и
 * по той же камере прячутся стены между ней и кухней (`wallsFacingAway`).
 * Единичный вектор по полу (x, z).
 */
export function openSideOf(
  room: Room | null,
  rows: { run: { lengthMm: number; wallId?: string }; placement?: { xM: number; zM: number; rotationYDeg: number } }[],
): [number, number] {
  const walls = room
    ? rows
        .map((row) => room.walls.find((wall) => wall.id === row.run.wallId))
        .filter((wall): wall is RoomWall => Boolean(wall))
    : [];
  let x = 0;
  let z = 0;
  if (walls.length === 0) {
    for (const row of rows) {
      const a = (rowPlacement(row).rotationYDeg * Math.PI) / 180;
      x += Math.sin(a);
      z += Math.cos(a);
    }
  } else {
    for (const wall of walls) {
      x += wall.inward[0];
      z += wall.inward[1];
    }
  }
  if (Math.hypot(x, z) < 1e-6) {
    x = 0;
    z = 1;
  }
  if (rows.length <= 1) {
    const yaw = (STRAIGHT_VIEW_YAW_DEG * Math.PI) / 180;
    const rx = x * Math.cos(yaw) - z * Math.sin(yaw);
    const rz = x * Math.sin(yaw) + z * Math.cos(yaw);
    x = rx;
    z = rz;
  }
  const length = Math.hypot(x, z) || 1;
  return [x / length, z / length];
}

/* ─────────────────────  Место ряда и коробки комнаты  ───────────────────── */

/**
 * ГДЕ СТОИТ РЯД — ОДНА ФУНКЦИЯ НА СЦЕНУ, РЁБРА И КОМНАТУ.
 *
 * Ряд лежит от −L/2 до +L/2, фасады на z = 0, корпус уходит в −z; у
 * рядов угла место считает `runPlacements`. Жила эта функция в сцене, и
 * комнате, которая строится вокруг того же ряда, пришлось бы тянуть
 * three.js ради одной строки — или завести вторую формулу места.
 */
export function rowPlacement(row: {
  run: { lengthMm: number };
  placement?: { xM: number; zM: number; rotationYDeg: number };
}): { xM: number; zM: number; rotationYDeg: number } {
  return row.placement ?? { xM: -row.run.lengthMm / 2000, zM: 0, rotationYDeg: 0 };
}

export type RoomBoxRole = 'wall' | 'corner' | 'object' | 'contour' | 'niche';

/** Коробка комнаты в мире: центр и размер в метрах, поворот как у стены. */
export type RoomBox = {
  key: string;
  role: RoomBoxRole;
  wallIndex: number;
  objectId?: string;
  kind?: OpeningKind;
  center: [number, number, number];
  /** Вдоль стены, по высоте, поперёк стены. */
  size: [number, number, number];
  rotationYDeg: number;
  state: RoomState;
};

/** Толщина контура на стене: объект без замеренного выноса, мм. */
export const ROOM_CONTOUR_MM = 4;

/**
 * КОРОБКИ КОМНАТЫ ДЛЯ СЦЕНЫ — ИЗ ТОЙ ЖЕ `roomLayout`.
 *
 * Стена стоит от внутренней грани НАРУЖУ: задняя плоскость ряда лежит на
 * грани, и ни один модуль не входит в объём стены. Стена по центру линии
 * замера утопила бы шкафы на половину толщины.
 */
export function roomBoxes(room: Room): RoomBox[] {
  const out: RoomBox[] = [];
  const T = room.thicknessMm;
  const at = (wall: RoomWall, u: number, inset: number): [number, number] => [
    wall.startMm[0] + u * wall.dir[0] + inset * wall.inward[0],
    wall.startMm[1] + u * wall.dir[1] + inset * wall.inward[1],
  ];
  const box = (
    wall: RoomWall,
    role: RoomBoxRole,
    key: string,
    rect: RoomRect,
    inset: number,
    thicknessMm: number,
    state: RoomState,
    extra: Partial<RoomBox> = {},
  ): RoomBox => {
    const [x, z] = at(wall, (rect.u0 + rect.u1) / 2, inset);
    return {
      key,
      role,
      wallIndex: wall.index,
      center: [round(x / 1000), round((rect.v0 + rect.v1) / 2000), round(z / 1000)],
      size: [round((rect.u1 - rect.u0) / 1000), round((rect.v1 - rect.v0) / 1000), round(thicknessMm / 1000)],
      rotationYDeg: wall.rotationYDeg,
      state,
      ...extra,
    };
  };

  for (const wall of room.walls) {
    wall.pieces.forEach((piece, i) => {
      out.push(box(wall, 'wall', `wall:${wall.id}:${i}`, piece, -T / 2, T, wall.state));
    });
    if (wall.cornerEndMm > 0) {
      out.push(
        box(
          wall,
          'corner',
          `wall:${wall.id}:corner`,
          { u0: wall.lengthMm, u1: wall.lengthMm + wall.cornerEndMm, v0: 0, v1: wall.heightMm },
          -T / 2,
          T,
          wall.state,
        ),
      );
    }
  }

  for (const object of room.objects) {
    const wall = room.walls[object.wallIndex];
    if (!wall) continue;
    const rect = {
      u0: object.fromMm,
      u1: object.fromMm + object.widthMm,
      v0: object.bottomMm,
      v1: object.topMm,
    };
    const extra = { objectId: object.id, kind: object.kind };

    if (object.cut === 'volume') {
      if (object.depthMm !== null) {
        out.push(
          box(wall, 'object', `${object.kind}:${object.id}`, rect, object.depthMm / 2, object.depthMm, object.state, extra),
        );
      } else {
        // Выноса нет в замере: контур на внутренней грани, а не объём.
        out.push(
          box(wall, 'contour', `${object.kind}:${object.id}`, rect, ROOM_CONTOUR_MM / 2, ROOM_CONTOUR_MM, object.state, extra),
        );
      }
    } else if (object.cut === 'recess') {
      if (object.depthMm !== null) {
        // За нишей — остаток стены либо тонкая стенка, если ниша глубже.
        const back = Math.max(10, T - object.depthMm);
        out.push(
          box(wall, 'niche', `niche:${object.id}`, rect, -object.depthMm - back / 2, back, object.state, extra),
        );
      } else {
        out.push(
          box(wall, 'contour', `niche:${object.id}`, rect, ROOM_CONTOUR_MM / 2, ROOM_CONTOUR_MM, object.state, extra),
        );
      }
    }
  }

  return out;
}
