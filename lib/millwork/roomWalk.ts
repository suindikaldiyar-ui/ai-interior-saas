import {
  DEFAULT_TURN_DEG,
  UNKNOWN,
  WALK_VERSION,
  cornerTurns,
  interiorOf,
  isClosedWalk,
  measured,
  valueOf,
  walkHonored,
  type CanonicalWalk,
  type Known,
  type Survey,
  type SurveyComm,
  type SurveyOpening,
  type SurveyWall,
} from '@/types/survey';

export {
  WALK_VERSION,
  canonicalWalk,
  cornerTurns,
  interiorOf,
  isClosedWalk,
  signedTurn,
  walkHonored,
  type CanonicalWalk,
  type InteriorSide,
  type WalkWall,
} from '@/types/survey';

/**
 * ОБХОД ЗАМЕРА — ОДНО МЕСТО, ГДЕ ПОВОРОТЫ СТАНОВЯТСЯ ГЕОМЕТРИЕЙ (Measurement 2.0).
 *
 * Замерщик обходит комнату в любую сторону и на каждом углу пишет
 * «влево» или «вправо». Мебельный движок (ряды, углы P0, комната,
 * раскрой) знает одну сторону: стены идут ПО ЧАСОВОЙ, комната справа по
 * ходу, угол — в конце стены до угла и в начале стены после. Поворот
 * замера туда не доезжал вовсе (`compositionWalls` брал только длины), и
 * обход «налево» давал зеркальную кухню: на плане стена 2 слева, в 3D —
 * справа.
 *
 * Здесь обход приводится к часовой: обход против часовой разворачивается
 * (стены в обратном порядке, знак углов наоборот). Второй геометрии нет —
 * движок получает ту же цепочку по часовой, что получал всегда, только
 * теперь собранную из того, что замерено.
 *
 * Привязки проёмов и коммуникаций — «от левого угла, если стоять лицом к
 * стене» (так они подписаны в замере). Это и есть начало стены по
 * часовой, поэтому при развороте обхода они не меняются.
 *
 * Работает только у замера версии 2 (`walkHonored`). Прежний замер
 * строится как строился: все углы — поворот направо (ловушка 705: то,
 * что показали клиенту, без действия человека не меняется).
 */

/* ─────────────────────────  Стены под мебель  ───────────────────────── */

export type KitchenChain = {
  /** Стены ряда по часовой: первая — стена А (левая, если стоять лицом к углу). */
  chain: string[];
  /** Остальные стены за цепочкой — для списков и комнаты. */
  rest: string[];
  /** Стены комнаты по часовой без разрывов, вокруг цепочки: для 3D-комнаты. */
  room: string[];
  /** Почему цепочка не собирается — словами. Пусто — собирается. */
  refusal: string | null;
};

const SHAPE_NAME: Record<number, string> = { 1: 'Прямая', 2: 'Угловая', 3: 'П-образная' };
const COUNT_WORD: Record<number, string> = { 1: 'одну стену', 2: 'две стены', 3: 'три стены' };

/** «Стена 2» — как подписана в замере. */
export function walkTitle(walk: CanonicalWalk, id: string): string {
  const wall = walk.walls.find((item) => item.id === id);
  return wall ? `Стена ${wall.walkIndex + 1}` : `Стена ${id}`;
}

/**
 * КАКИЕ СТЕНЫ ПОД МЕБЕЛЬ.
 *
 * Ряд начинается у стены «ряд здесь» и идёт по часовой (вправо, если
 * стоять лицом к ней). У незамкнутого обхода за последней стеной стены
 * нет: не хватило стен вперёд — окно сдвигается назад, и угловая кухня
 * из Г-замера «стена 1 → налево → стена 2» встаёт ровно в этот угол.
 *
 * Отказ словами, а не тихая цепочка: стена без длины, наружный угол
 * (выступ) и угол не 90° внутри цепочки ряд не держат.
 */
export function kitchenChain(walk: CanonicalWalk, runWallId: string | undefined, segments: number): KitchenChain {
  const walls = walk.walls;
  const n = walls.length;
  const need = Math.max(1, segments);
  const longest = [...walls].sort((a, b) => b.lengthMm - a.lengthMm)[0];
  let at = walls.findIndex((wall) => wall.id === runWallId && wall.lengthMm > 0);
  if (at < 0) at = longest ? walls.indexOf(longest) : 0;

  const title = (id: string) => walkTitle(walk, id);
  const empty = (refusal: string): KitchenChain => ({ chain: [], rest: walls.map((w) => w.id), room: [], refusal });

  if (n === 0) return empty('Стен в замере нет — ставить мебель не на что.');
  if (n < need) {
    return {
      ...empty(`${SHAPE_NAME[need] ?? 'Эта'} кухня ставит мебель на ${COUNT_WORD[need] ?? `${need} стены`}, а в замере ${n === 1 ? 'одна стена' : `${n} стены`}.`),
    };
  }

  const start = walk.closed ? at : Math.min(at, n - need);
  const index = (k: number) => (walk.closed ? (start + k) % n : start + k);
  const chainIdx = Array.from({ length: need }, (_, k) => index(k));
  const chain = chainIdx.map((i) => walls[i].id);

  let refusal: string | null = null;
  for (const i of chainIdx) {
    if (walls[i].lengthMm <= 0) {
      refusal = `${title(walls[i].id)}: длина не замерена — ${need > 1 ? 'угловой ряд через неё не собрать' : 'ряд ставить не на что'}.`;
      break;
    }
  }
  if (!refusal) {
    for (let k = 0; k < need - 1; k += 1) {
      const turn = walls[chainIdx[k]].turnDeg;
      /* Номера стен — как в замере и по порядку: «между стенами 1 и 2». */
      const numbers = [walls[chainIdx[k]].walkIndex, walls[chainIdx[k + 1]].walkIndex].sort((a, b) => a - b).map((i) => i + 1);
      const pair = `${numbers[0]} и ${numbers[1]}`;
      if (turn < 0) {
        refusal = `Угол между стенами ${pair} наружный (выступ): ряд через наружный угол не собирается.`;
        break;
      }
      if (Math.abs(turn - DEFAULT_TURN_DEG) > 0.5) {
        refusal = `Угол между стенами ${pair} — ${Math.round(Math.abs(turn))}°: угловой ряд собирается только под 90°.`;
        break;
      }
    }
  }

  /* Комната — без разрывов: от цепочки в обе стороны, пока стены замерены. */
  const forward: number[] = [];
  const backward: number[] = [];
  const seen = new Set(chainIdx);
  const step = (from: number, dir: 1 | -1) => (walk.closed ? (from + dir + n) % n : from + dir);
  for (let i = step(chainIdx[need - 1], 1); i >= 0 && i < n && !seen.has(i) && walls[i].lengthMm > 0; i = step(i, 1)) {
    forward.push(i);
    seen.add(i);
  }
  for (let i = step(chainIdx[0], -1); i >= 0 && i < n && !seen.has(i) && walls[i].lengthMm > 0; i = step(i, -1)) {
    backward.unshift(i);
    seen.add(i);
  }
  const room = [...backward, ...chainIdx, ...forward].map((i) => walls[i].id);
  const restIdx = [...forward, ...backward, ...walls.map((_, i) => i).filter((i) => !seen.has(i))];
  return { chain, rest: restIdx.map((i) => walls[i].id), room, refusal };
}

/* ─────────────────────────  Правка обхода  ───────────────────────── */

/** Новый идентификатор стены: не повторяет ни одного живого (у удалённой w2 новая — не w3 второй раз). */
export function nextWallId(walls: Pick<SurveyWall, 'id'>[]): string {
  const used = new Set(walls.map((wall) => wall.id));
  let k = walls.length + 1;
  while (used.has(`w${k}`)) k += 1;
  return `w${k}`;
}

/** Знак поворота наоборот: «влево» ↔ «вправо», свой угол — со знаком наоборот. */
function flippedTurn(wall: SurveyWall): Pick<SurveyWall, 'turn' | 'turnDeg'> {
  if (wall.turn === 'left') return { turn: 'right', turnDeg: wall.turnDeg };
  if (wall.turn === 'right') return { turn: 'left', turnDeg: wall.turnDeg };
  return { turn: 'custom', turnDeg: -wall.turnDeg };
}

/**
 * ТОТ ЖЕ ОБХОД В ОБРАТНУЮ СТОРОНУ. Комната та же: стены в обратном
 * порядке, повороты — те же углы, пройденные с другой стороны. Привязки
 * не меняются: «от левого угла» от направления обхода не зависит.
 */
export function reversedWalk(survey: Survey): Survey {
  const walls = survey.walls;
  const n = walls.length;
  const closed = isClosedWalk(walls);
  const next = walls.map((_, k) => {
    const i = n - 1 - k;
    const before = i - 1 >= 0 ? walls[i - 1] : closed ? walls[n - 1] : null;
    return {
      ...walls[i],
      ...(before ? flippedTurn(before) : { turn: 'right' as const, turnDeg: DEFAULT_TURN_DEG }),
    };
  });
  return {
    ...survey,
    walls: next,
    ...(survey.interior ? { interior: survey.interior === 'right' ? 'left' : 'right' } : {}),
  };
}

/** Обход замкнутой комнаты с другой стены. Стены и углы те же. */
export function startedAt(survey: Survey, wallId: string): Survey {
  const at = survey.walls.findIndex((wall) => wall.id === wallId);
  if (at <= 0 || !isClosedWalk(survey.walls)) return survey;
  return { ...survey, walls: [...survey.walls.slice(at), ...survey.walls.slice(0, at)] };
}

/** Поворот после стены. */
export function withTurn(survey: Survey, wallId: string, turn: 'left' | 'right' | number): Survey {
  return {
    ...survey,
    walls: survey.walls.map((wall) =>
      wall.id !== wallId
        ? wall
        : typeof turn === 'number'
          ? { ...wall, turn: 'custom', turnDeg: turn }
          : { ...wall, turn, turnDeg: DEFAULT_TURN_DEG },
    ),
  };
}

/** Новая стена после указанной (или в конец обхода). */
export function withWallAdded(survey: Survey, afterWallId?: string | null): { survey: Survey; wallId: string } {
  const id = nextWallId(survey.walls);
  /* Первая стена замера — «ряд здесь», как у `newWall(0)`: замер всегда начинается с неё. */
  const wall: SurveyWall = {
    id,
    lengthMm: UNKNOWN,
    turn: 'right',
    turnDeg: DEFAULT_TURN_DEG,
    openings: [],
    ...(survey.walls.length === 0 ? { isRunWall: true } : {}),
  };
  const at = afterWallId ? survey.walls.findIndex((item) => item.id === afterWallId) : -1;
  const walls = at >= 0 ? [...survey.walls.slice(0, at + 1), wall, ...survey.walls.slice(at + 1)] : [...survey.walls, wall];
  return { survey: { ...survey, walls }, wallId: id };
}

/** Что пропадёт вместе со стеной — словами, ДО нажатия. */
export function wallRemovalLosses(survey: Survey, wallId: string): string[] {
  const at = survey.walls.findIndex((wall) => wall.id === wallId);
  if (at < 0) return [];
  const wall = survey.walls[at];
  const losses: string[] = [];
  if (wall.openings.length > 0) losses.push(`проёмы стены ${at + 1}: ${wall.openings.length}`);
  const comms = survey.comms.filter((comm) => comm.wallId === wallId).length;
  if (comms > 0) losses.push(`коммуникации на стене ${at + 1}: ${comms}`);
  return losses;
}

/**
 * Удалить стену. Её проёмы и коммуникации уходят вместе с ней (сказано
 * до нажатия, `wallRemovalLosses`); «ряд здесь» переходит к соседней.
 */
export function withoutWall(survey: Survey, wallId: string): Survey {
  const at = survey.walls.findIndex((wall) => wall.id === wallId);
  if (at < 0) return survey;
  const walls = survey.walls.filter((wall) => wall.id !== wallId);
  const lostRun = survey.walls[at].isRunWall;
  const heir = walls[Math.min(at, walls.length - 1)];
  return {
    ...survey,
    walls: lostRun && heir ? walls.map((wall) => ({ ...wall, isRunWall: wall.id === heir.id })) : walls,
    comms: survey.comms.filter((comm) => comm.wallId !== wallId),
  };
}

/* ─────────────────────────  Отражение  ───────────────────────── */

/** Привязка от левого угла после отражения: от того же угла, что был правым. */
function mirroredFrom(lengthMm: number, from: Known<number>, width: Known<number> | null): Known<number> {
  const at = valueOf(from);
  if (at === undefined) return from;
  const w = width ? valueOf(width) ?? 0 : 0;
  const next = Math.max(0, Math.round(lengthMm - at - w));
  return from.state === 'assumed' ? { state: 'assumed', value: next, basis: from.basis } : measured(next);
}

export type MirrorResult = { survey: Survey } | { refusal: string };

/**
 * КОМНАТА В ЗЕРКАЛЕ: повороты наоборот, привязки от другого угла.
 *
 * Привязку проёма от другого угла не посчитать без длины стены — такую
 * стену отражать нечем, и это отказ словами, а не проём, уехавший молча.
 * `chainWallIds` — стены под мебелью ДО отражения: ряд остаётся на тех же
 * стенах, а начинается теперь с другой (была последней по часовой —
 * стала первой).
 */
export function mirroredSurvey(survey: Survey, chainWallIds: string[] = []): MirrorResult {
  const blind = survey.walls.findIndex(
    (wall) =>
      valueOf(wall.lengthMm) === undefined &&
      (wall.openings.some((opening) => valueOf(opening.fromCornerMm) !== undefined) ||
        survey.comms.some((comm) => comm.wallId === wall.id && valueOf(comm.fromCornerMm) !== undefined)),
  );
  if (blind >= 0) {
    return { refusal: `Стена ${blind + 1}: длина не замерена — привязки её проёмов от другого угла не посчитать.` };
  }
  const lengthOf = (id: string) => valueOf(survey.walls.find((wall) => wall.id === id)?.lengthMm) ?? 0;
  const lastOfChain = chainWallIds[chainWallIds.length - 1];

  const walls = survey.walls.map((wall) => ({
    ...wall,
    ...flippedTurn(wall),
    openings: wall.openings.map(
      (opening): SurveyOpening => ({
        ...opening,
        fromCornerMm: mirroredFrom(valueOf(wall.lengthMm) ?? 0, opening.fromCornerMm, opening.widthMm),
      }),
    ),
    ...(lastOfChain ? { isRunWall: wall.id === lastOfChain } : {}),
  }));
  const comms = survey.comms.map(
    (comm): SurveyComm => ({ ...comm, fromCornerMm: mirroredFrom(lengthOf(comm.wallId), comm.fromCornerMm, null) }),
  );
  return {
    survey: {
      ...survey,
      walls,
      comms,
      ...(survey.interior ? { interior: survey.interior === 'right' ? 'left' : 'right' } : {}),
    },
  };
}

/* ─────────────────────────  Формы помещения  ───────────────────────── */

/**
 * ФОРМЫ НА СХЕМЕ. Г в четырёх положениях — это ОДНА кухня, повёрнутая на
 * экране: стена А всегда левая, если стоять лицом к углу, стена Б —
 * правая. Положение плитки — поворот изображения плана, в геометрию он не
 * идёт. Какая стена длиннее — решают длины А и Б; зеркальная кухня — это
 * другие длины по сторонам, а не другая геометрия.
 */
export type RoomTile =
  | { kind: 'straight' }
  | { kind: 'L'; rotation: 0 | 90 | 180 | 270 }
  | { kind: 'U'; rotation: 0 | 90 | 180 | 270 }
  | { kind: 'perimeter' };

/** Плитки Г: символ на экране → поворот плана. Обход «А, направо, Б» рисуется ┐. */
export const L_TILES: { glyph: string; rotation: 0 | 90 | 180 | 270 }[] = [
  { glyph: '└', rotation: 180 },
  { glyph: '┘', rotation: 90 },
  { glyph: '┌', rotation: 270 },
  { glyph: '┐', rotation: 0 },
];

/** Плитки П: проём кухни вниз, вверх, влево, вправо. Обход «А, Б, В направо» рисуется ⊐. */
export const U_TILES: { glyph: string; rotation: 0 | 90 | 180 | 270 }[] = [
  { glyph: '⊓', rotation: 270 },
  { glyph: '⊔', rotation: 90 },
  { glyph: '⊏', rotation: 180 },
  { glyph: '⊐', rotation: 0 },
];

/** Сколько стен у плитки и как они подписаны. */
export function tileWalls(tile: RoomTile): string[] {
  if (tile.kind === 'straight') return ['А'];
  if (tile.kind === 'L') return ['А', 'Б'];
  if (tile.kind === 'U') return ['А', 'Б', 'В'];
  return ['А', 'Б', 'В', 'Г'];
}

/**
 * ЗАМЕР ИЗ ПЛИТКИ: стены по часовой, «ряд здесь» на стене А, поворот
 * плана — как на плитке. Проёмы и коммуникации стен, которые остались
 * (тот же идентификатор), переезжают с ними; что пропадает — экран
 * называет до нажатия (`tileLosses`).
 */
export function tileSurvey(survey: Survey, tile: RoomTile, lengthsMm: (number | null)[]): Survey {
  const labels = tileWalls(tile);
  const walls: SurveyWall[] = labels.map((_, i) => {
    const id = `w${i + 1}`;
    const kept = survey.walls.find((wall) => wall.id === id);
    const length = lengthsMm[i];
    return {
      id,
      lengthMm: typeof length === 'number' && length > 0 ? measured(Math.round(length)) : kept?.lengthMm ?? UNKNOWN,
      turn: 'right',
      turnDeg: DEFAULT_TURN_DEG,
      openings: kept?.openings ?? [],
      isRunWall: i === 0,
    };
  });
  const ids = new Set(walls.map((wall) => wall.id));
  const rotation = tile.kind === 'L' || tile.kind === 'U' ? tile.rotation : 0;
  const { interior: _dropped, ...rest } = survey;
  void _dropped;
  return {
    ...rest,
    version: WALK_VERSION,
    walls,
    comms: survey.comms.filter((comm) => ids.has(comm.wallId)),
    planRotationDeg: rotation,
    steps: { ...survey.steps, walls: walls.some((wall) => valueOf(wall.lengthMm)) ? 'done' : survey.steps.walls },
  };
}

/** Что пропадёт при смене формы: стены, которых в новой форме нет, — с их проёмами и коммуникациями. */
export function tileLosses(survey: Survey, tile: RoomTile): string[] {
  const keep = new Set(tileWalls(tile).map((_, i) => `w${i + 1}`));
  const losses: string[] = [];
  survey.walls.forEach((wall, i) => {
    if (keep.has(wall.id)) return;
    const parts = [`стена ${i + 1}`];
    if (wall.openings.length > 0) parts.push(`её проёмы: ${wall.openings.length}`);
    const comms = survey.comms.filter((comm) => comm.wallId === wall.id).length;
    if (comms > 0) parts.push(`коммуникации: ${comms}`);
    losses.push(parts.join(', '));
  });
  return losses;
}

/**
 * ПРЕЖНИЙ ЗАМЕР, КОТОРЫЙ МЕБЕЛЬ ЧИТАЛА НЕ ТАК.
 *
 * До 2.0 мебель строилась так, будто каждый угол — поворот направо:
 *
 *   `mirrored` — комната слева от обхода (обход «налево»): план показывает
 *                одну комнату, а ряды и 3D — её зеркало;
 *   `outer`    — комната справа, но среди углов есть выступ (поворот
 *                налево): 3D-комната за выступом идёт не туда, а ряд через
 *                такой угол замер 2.0 не соберёт вовсе.
 *
 * Сам по себе объект не меняется (ловушка 705): экран называет расхождение
 * и предлагает перестроить по замеру — с тем, что изменится, до нажатия.
 */
export type LegacyWalk = 'mirrored' | 'outer' | null;

export function legacyWalkOf(survey: Survey | null | undefined): LegacyWalk {
  if (!survey || walkHonored(survey)) return null;
  if (interiorOf(survey) === 'left') return 'mirrored';
  return cornerTurns(survey.walls).some((turn) => turn < 0) ? 'outer' : null;
}

export function legacyMirrored(survey: Survey | null | undefined): boolean {
  return legacyWalkOf(survey) === 'mirrored';
}

/** Прежний замер — замером 2.0: стены, углы и привязки те же, теперь мебель их читает. */
export function honoredWalk(survey: Survey): Survey {
  return { ...survey, version: WALK_VERSION };
}
