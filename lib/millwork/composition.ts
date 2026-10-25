import { allModules, buildRun } from './layout';
import { APPLIANCE_SLOTS, CORNER, CORNER_SIZE_MM, MIN_WIDTH, moduleAppliances } from './modules';
import { compositionFingerprint } from './fingerprint';
import { assertCornerFits } from './invariants';
import { APPLIANCE_BACK_GAP_MM, rowStandardDepthMm } from './fill';
import {
  clashWords,
  cornerKinematics,
  fixKey,
  panelWidthMm,
  raisedChoice,
  stripWords,
  stuckWords,
  type CornerClash,
  type CornerKinematics,
  type CornerPair,
} from './cornerKinematics';
import { lowerWall, wallLabel } from './walls';
import { cornerSizesOf, shopOf } from './shop';
import {
  choiceFromSolution,
  cornerChoicesOf,
  cornerGeometry,
  cornerOfSegment,
  cornerOwnerOf,
  levelBoundsOf,
  levelOfChoice,
  solutionOf,
} from './corner';
import type { ProductionSettings } from '@/types/catalog';
import { COMM_TITLE } from '@/types/survey';
import type {
  ApplianceKind,
  CommPoint,
  Composition,
  CompositionKind,
  CornerChoice,
  CornerClashNote,
  CornerJoin,
  Opening,
  Run,
  RunCorner,
  RunRequirements,
  RunSegment,
  ZoneKind,
} from '@/types/millwork';

/* ─────────────────────────  Форма композиции  ───────────────────────── */

export type RunShape = 'linear' | 'corner_l' | 'u_shape';

/**
 * ФОРМА ГАРНИТУРА — ЯВНЫМ ЗАПРЕТОМ, А НЕ УМОЛЧАНИЕМ.
 *
 * Композиция прямая, один ряд вдоль одной стены — а модель дорисовывала
 * угол: слева пеналы на перпендикулярной стене, гарнитур загибается.
 * Клиент видит одно, цех получает другое, договор подписывают по третьему.
 *
 * Это та же история, что с раскладкой и микроволновкой в пенале: пустоту
 * модель заполняет по-своему, пока запрет не назван прямо. Числа берутся
 * из состава, руками здесь не пишется ничего.
 */
export function compositionBlock(input: {
  shape: RunShape;
  /** Длина ряда В КАДРЕ, мм. */
  lengthMm: number;
  /** Сколько модулей В КАДРЕ. */
  moduleCount: number;
  /** Полезные длины ВСЕХ рядов композиции слева направо. */
  rowsMm?: number[];
}): string {
  const rows = input.rowsMm ?? [input.lengthMm];

  /*
   * КАДР ПОКАЗЫВАЕТ ОДИН РЯД, И ОБ ЭТОМ СКАЗАНО ПРЯМО.
   *
   * Сцена генерации собирается из ОДНОГО `Run` (`KitchenScene`), поэтому
   * в clay-кадр попадает только стена А. Пока форма выводилась из типов
   * модулей первого ряда, угловая кухня на фальш-панели считалась
   * прямой — углового модуля в ней нет вовсе, — и промпт писал
   * «Второго ряда нет. На перпендикулярных стенах мебели нет вовсе».
   *
   * То есть модель не додумывала: ей ПРЯМО ЗАПРЕЩАЛИ рисовать стену Б.
   * Замерено: композиция 2 ряда и 16 модулей, в запрос уходил 1 ряд и
   * 12 модулей с запретом на остальные.
   *
   * Врать в обе стороны нельзя. Дорисовать стену Б модель тоже не может:
   * в кадре её нет, и нарисованное будет выдумкой — мебелью, которой цех
   * не сделает. Поэтому промпт говорит правду: рядов столько-то, в кадре
   * первый, остального в кадре нет и дорисовывать его нельзя.
   */
  if (rows.length > 1) {
    const shapeName = input.shape === 'u_shape' ? 'П-ОБРАЗНАЯ' : 'Г-ОБРАЗНАЯ';
    const others = rows
      .slice(1)
      .map((mm, i) => `${SEGMENT_NAMES[i + 1] ?? `ряд ${i + 2}`} (${mm} мм)`)
      .join(', ');

    return `ФОРМА ГАРНИТУРА: ${shapeName}, РЯДОВ ${rows.length} (${rows.join(' + ')} мм).
В КАДРЕ ТОЛЬКО СТЕНА А — ряд от 0 до ${input.lengthMm} мм, модулей ровно ${input.moduleCount}.
Остальные ряды — ${others} — в кадр НЕ ПОПАЛИ. Их не видно, и дорисовывать их НЕЛЬЗЯ:
что не в кадре, то не согласовано. У края кадра ряд просто обрывается.
Островов, полуостровов и барных стоек нет.`;
  }

  return `ФОРМА ГАРНИТУРА: ПРЯМОЙ ОДИНОЧНЫЙ РЯД.
Гарнитур стоит ВДОЛЬ ОДНОЙ СТЕНЫ, от 0 до ${input.lengthMm} мм, и нигде не загибается.
Углов нет. Второго ряда нет. На перпендикулярных стенах мебели нет вовсе —
там пустая стена.
Модулей ровно ${input.moduleCount}, все в один ряд слева направо.
Островов, полуостровов и барных стоек нет.`;
}

/** Имена рядов для промпта — те же, что на чертеже. */
const SEGMENT_NAMES = ['стена А', 'стена Б', 'стена В'];

/** Слова, которых в прямой композиции быть не может. */
const CORNER_WORDS = ['Г-ОБРАЗНАЯ', 'угловая кухня', 'два ряда', 'в углу'];

/**
 * Сверка формы перед отправкой.
 *
 * `configurationFingerprint` сводит чертёж, смету и кадр. Форму он не
 * ловит — она живёт в тексте промпта. Расхождение здесь означает, что
 * клиенту нарисуют не ту кухню, поэтому это исключение на сборке запроса,
 * а не предупреждение в интерфейсе.
 */
export function assertShapeMatches(prompt: string, shape: RunShape): void {
  if (shape !== 'linear') return;

  const found = CORNER_WORDS.filter((word) =>
    prompt.toLowerCase().includes(word.toLowerCase()),
  );

  // «Углов нет» — это сам запрет, он и содержит слово «углов».
  const suspicious = found.filter((word) => {
    if (word === 'в углу') return !prompt.includes('Углов нет');
    return true;
  });

  if (suspicious.length > 0) {
    throw new Error(
      `Композиция прямая, но в промпте есть «${suspicious.join('», «')}» — ` +
        'рендер нарисовал бы не ту кухню.',
    );
  }
}


/* ─────────────────────  Сборка угловой композиции  ───────────────────── */

/** Метки рядов: цех и клиент говорят «стена А», а не «сегмент 0». */
/**
 * КАК ФОРМА НАЗЫВАЕТСЯ ЧЕЛОВЕКУ.
 *
 * Лежит здесь, а не на экране: отказ композиции пишется тоже здесь, и
 * вторая таблица названий дала бы замерщику «u_shape» в одном месте и
 * «П-образная» в другом.
 */
export const SHAPE_TITLE: Record<CompositionKind, string> = {
  linear: 'Прямая',
  corner_l: 'Угловая',
  u_shape: 'П-образная',
};

/** Сколько стен эта форма ставит под мебель, словами. */
export const SHAPE_WALLS: Record<CompositionKind, string> = {
  linear: 'одну стену',
  corner_l: 'две стены',
  u_shape: 'три стены',
};

/** Сколько стен нужно этой форме. */
export function segmentCount(kind: CompositionKind): number {
  return kind === 'u_shape' ? 3 : kind === 'corner_l' ? 2 : 1;
}

export interface CompositionWall {
  id: string;
  lengthMm: number;
  openings?: Opening[];
}

export interface BuildCompositionInput {
  id?: string;
  kind: CompositionKind;
  /** Стены замера по порядку обхода. Лишние не используются. */
  walls: CompositionWall[];
  ceilingHeightMm: number;
  requirements: RunRequirements;
  comms?: CommPoint[];
  /** Школа цеха: глубины и высоты. Едет в каждый ряд композиции. */
  production?: ProductionSettings;
}

/**
 * Приборы РАСПРЕДЕЛЯЮТСЯ, а не дублируются.
 *
 * Мойка одна на всю кухню, а не по одной на стену. Пеналы уходят на
 * короткую стену, мокрая группа и варочная — на длинную: это рабочий
 * треугольник, а не предпочтение. Вытяжка едет за варочной сама.
 */
export function splitAppliances(
  appliances: ApplianceKind[],
  usableMm: number[],
  /**
   * Выбор человека: прибор → стена. Он сильнее рабочего треугольника —
   * замерщик видит квартиру, а правило видит только длины стен.
   * Стена — `wallId` физической стены (число — старая запись номером).
   */
  walls?: Partial<Record<ApplianceKind, number | string>>,
  /** Стены композиции по порядку (`wallId`): по ним ищется закреплённая стена. */
  wallIds?: string[],
): ApplianceKind[][] {
  const out: ApplianceKind[][] = usableMm.map(() => []);
  if (usableMm.length === 0) return out;
  if (usableMm.length === 1) return [[...appliances]];

  const order = usableMm
    .map((length, index) => ({ length, index }))
    .sort((a, b) => b.length - a.length || a.index - b.index);

  const longest = order[0].index;
  const shortest = order[order.length - 1].index;
  // У П-образной варочная уходит на третью стену: между мойкой и пеналами.
  const middle = order.length > 2 ? order[1].index : longest;

  const wanted = new Set(appliances);
  const put = (appliance: ApplianceKind, at: number) => {
    if (!wanted.has(appliance)) return;

    /*
     * ПЕРЕНЕСЁННЫЙ ПРИБОР ИДЁТ ТУДА, КУДА ЕГО ПОСТАВИЛИ.
     *
     * Правило рабочего треугольника остаётся умолчанием: оно верно, пока
     * человек не сказал иначе. Сказал — слушаем его, а не длины стен.
     */
    const chosen = pinnedWallIndex(walls?.[appliance], wallIds);
    const at2 = chosen >= 0 && chosen < out.length ? chosen : at;
    out[at2].push(appliance);
  };

  // Пеналы держат короткую стену: они не требуют рабочей поверхности рядом.
  put('fridge', shortest);
  put('oven', shortest);
  put('microwave', shortest);

  // Мокрая группа — на самую длинную: там помещается и мойка, и посудомойка.
  put('sink600', longest);
  put('sink800', longest);
  put('dishwasher45', longest);
  put('dishwasher60', longest);

  put('hob', middle);
  // Вытяжка обязана висеть над варочной — значит и в том же ряду.
  put('hood', middle);

  return out;
}

/**
 * НОМЕР СТЕНЫ КОМПОЗИЦИИ, ЗА КОТОРОЙ ЗАКРЕПЛЁН ПРИБОР.
 *
 * Закрепление — физическая стена замера (`wallId`): её место в обходе
 * ищется в стенах композиции, и если стены там сейчас нет, прибор стоит
 * по правилу, а закрепление ждёт её возвращения. Число — старая запись
 * номером стены по обходу: оно читается, как читалось. −1 — не закреплён.
 */
export function pinnedWallIndex(pin: number | string | undefined, wallIds?: string[]): number {
  if (typeof pin === 'string') return wallIds ? wallIds.indexOf(pin) : -1;
  if (typeof pin === 'number' && Number.isInteger(pin)) return pin;
  return -1;
}

/**
 * ПРИБОР, НЕ ВСТАВШИЙ НА СВОЮ СТЕНУ, ИЩЕТ ДРУГУЮ — ДО ОТКАЗА (ADVANCED CAD, STAGE A).
 *
 * Рабочий треугольник ставит пеналы на короткую стену, не спрашивая, влезут
 * ли они там. На Г 3800 + 1140 короткой стене после угла остаётся 480 мм, и
 * холодильник с духовкой отказывались словами («не помещается — свободно
 * 480 мм, нужно 600 мм»), хотя стена А той же длины, что у прямой кухни,
 * где обе колонны встают. Угловая кухня из замера выходила без
 * холодильника.
 *
 * Прибор, который человек НЕ закреплял за стеной (`applianceWalls`) и
 * который раскладка его стены не поставила, пробует остальные стены от
 * самой длинной. Остаётся там, где встал, не выбив ни одного прибора ни на
 * той стене, ни на своей. Нигде не встал — отказ прежний, словами, на
 * своей стене. Ряд пересобирает та же `buildRun`: второй раскладки
 * «влезет ли» нет.
 *
 * Едут вместе: духовка с микроволновкой своей колонны, варочная с
 * вытяжкой над ней. Переезжает только то, чему нужна одна розетка
 * (`APPLIANCE_SLOTS.needs`): мойка, посудомойка и вытяжка привязаны к
 * воде, канализации и вентканалу, и увести их на стену, где вывода нет, —
 * переделка на объекте. Это решение замерщика: он закрепляет прибор за
 * стеной сам.
 */
const STANDS_WITH: Partial<Record<ApplianceKind, ApplianceKind>> = {
  oven: 'microwave',
  microwave: 'oven',
  hob: 'hood',
  hood: 'hob',
};

export function rehomeRefused(input: {
  /** Приборы по стенам — правится на месте. */
  assigned: ApplianceKind[][];
  /** Ряды по стенам — правятся на месте. */
  runs: Run[];
  usable: number[];
  runOf: (wall: number, appliances: ApplianceKind[]) => Run;
  /** Закреплён ли прибор человеком: такой не переезжает никогда. */
  pinned: (appliance: ApplianceKind) => boolean;
}): void {
  const { assigned, runs } = input;
  const holds = (run: Run, appliance: ApplianceKind) =>
    allModules(run).some((unit) => moduleAppliances(unit).includes(appliance));
  const socketOnly = (appliance: ApplianceKind) =>
    APPLIANCE_SLOTS[appliance].needs.every((need) => need === 'socket');
  const byLength = input.usable
    .map((length, index) => ({ length, index }))
    .sort((a, b) => b.length - a.length || a.index - b.index)
    .map((entry) => entry.index);

  for (let i = 0; i < assigned.length; i += 1) {
    const groups: ApplianceKind[][] = [];
    for (const appliance of assigned[i]) {
      if (holds(runs[i], appliance) || groups.some((group) => group.includes(appliance))) continue;
      const partner = STANDS_WITH[appliance];
      const group = partner && assigned[i].includes(partner) ? [appliance, partner] : [appliance];
      if (group.some((member) => input.pinned(member) || !socketOnly(member))) continue;
      groups.push(group);
    }

    for (const group of groups) {
      const stoodHere = assigned[i].filter((appliance) => holds(runs[i], appliance));
      const rest = assigned[i].filter((appliance) => !group.includes(appliance));
      const restRun = input.runOf(i, rest);
      if (!stoodHere.every((appliance) => holds(restRun, appliance))) continue;
      for (const j of byLength) {
        if (j === i) continue;
        const trial = [...assigned[j], ...group];
        const run = input.runOf(j, trial);
        const stoodThere = assigned[j].filter((appliance) => holds(runs[j], appliance));
        if (!group.every((appliance) => holds(run, appliance))) continue;
        if (!stoodThere.every((appliance) => holds(run, appliance))) continue;
        assigned[j] = trial;
        runs[j] = run;
        assigned[i] = rest;
        runs[i] = restRun;
        break;
      }
    }
  }
}

/** Правка состава кухни — те её поля, по которым видно, каких стен она касается. */
export type CompositionChange = {
  appliances?: ApplianceKind[];
  sections?: unknown;
  doorSystem?: unknown;
  tallSide?: unknown;
  glassDisplay?: unknown;
  upperToCeiling?: unknown;
  columnTop?: RunRequirements['columnTop'];
  fridgeType?: RunRequirements['fridgeType'];
  applianceWalls?: Partial<Record<ApplianceKind, number | string>>;
  applianceSizes?: RunRequirements['applianceSizes'];
  applianceTypes?: RunRequirements['applianceTypes'];
};

/** Поля, которые меняют ВСЕ стены: секции, двери, сторона пеналов, витрина, высота верхнего ряда. */
const KITCHEN_WIDE: (keyof CompositionChange)[] = ['sections', 'doorSystem', 'tallSide', 'glassDisplay', 'upperToCeiling'];

/** Поля, по которым стена прибора известна. Всё прочее — правка всей кухни. */
const BY_APPLIANCE: (keyof CompositionChange)[] = [
  'appliances',
  'columnTop',
  'fridgeType',
  'applianceWalls',
  'applianceSizes',
  'applianceTypes',
];

/**
 * КАКИХ СТЕН КАСАЕТСЯ ПРАВКА СОСТАВА.
 *
 * Правка состава пересобирала стену А всегда и не трогала стены Б и В
 * никогда: удаление холодильника со стены Б стирало правки стены А и
 * оставляло на стене Б её прежний ряд — вместе с холодильником.
 *
 * Раздача приборов независима: стену каждого прибора выбирает
 * `splitAppliances` по длинам стен и закреплению, а не по остальным
 * приборам. Поэтому правку, относящуюся к прибору, видит ровно та стена,
 * где он стоит (и та, куда он уходит или куда встанет новый), а правку
 * всей кухни — все стены. Поле, которого здесь нет, считается правкой
 * всей кухни: лишняя пересборка честнее устаревшего ряда.
 */
export function wallsTouchedByChange(
  change: CompositionChange,
  current: {
    /** Раздача сейчас: приборы каждой стены композиции. */
    assignment: ApplianceKind[][];
    /** Полезная длина каждой стены: по ней раздаёт `splitAppliances`. */
    usableMm: number[];
    requirements: Pick<
      RunRequirements,
      'appliances' | 'applianceWalls' | 'applianceSizes' | 'applianceTypes' | 'columnTop' | 'fridgeType'
    >;
    /** Стены композиции по порядку (`wallId`): закрепление прибора — за физической стеной. */
    wallIds?: string[];
  },
): number[] {
  const all = current.assignment.map((_, i) => i);
  const keys = (Object.keys(change) as (keyof CompositionChange)[]).filter((key) => change[key] !== undefined);
  if (keys.some((key) => KITCHEN_WIDE.includes(key) || !BY_APPLIANCE.includes(key))) return all;

  const walls = new Set<number>();
  const touch = (appliance: ApplianceKind) =>
    current.assignment.forEach((list, i) => {
      if (list.includes(appliance)) walls.add(i);
    });
  const req = current.requirements;

  if (change.appliances) {
    for (const appliance of req.appliances) if (!change.appliances.includes(appliance)) touch(appliance);
    const pinned = { ...(req.applianceWalls ?? {}), ...(change.applianceWalls ?? {}) };
    for (const appliance of change.appliances) {
      if (req.appliances.includes(appliance)) continue;
      splitAppliances([appliance], current.usableMm, pinned, current.wallIds).forEach((list, i) => {
        if (list.length > 0) walls.add(i);
      });
    }
  }
  if (change.fridgeType !== undefined && change.fridgeType !== req.fridgeType) touch('fridge');
  if (change.columnTop !== undefined && change.columnTop !== req.columnTop) {
    touch('oven');
    touch('microwave');
  }
  for (const [appliance, id] of Object.entries(change.applianceTypes ?? {}) as [ApplianceKind, string][]) {
    if (req.applianceTypes?.[appliance] !== id) touch(appliance);
  }
  for (const [appliance, size] of Object.entries(change.applianceSizes ?? {}) as [ApplianceKind, unknown][]) {
    if (JSON.stringify(req.applianceSizes?.[appliance]) !== JSON.stringify(size)) touch(appliance);
  }
  for (const [appliance, pin] of Object.entries(change.applianceWalls ?? {}) as [ApplianceKind, number | string][]) {
    if (req.applianceWalls?.[appliance] === pin) continue;
    touch(appliance);
    const wall = pinnedWallIndex(pin, current.wallIds);
    if (wall >= 0 && wall < all.length) walls.add(wall);
  }

  return Array.from(walls).sort((a, b) => a - b);
}

/**
 * СБОРКА КОМПОЗИЦИИ.
 *
 * Главный инвариант: при стыке под 90° второй ряд короче своей стены
 * на глубину первого. Без этого модули в углу физически налезают друг
 * на друга — а это переделка на объекте, поэтому нарушение здесь
 * исключение, а не предупреждение.
 */
/**
 * ПОПЫТКА СОБРАТЬ КОМПОЗИЦИЮ: СОБРАЛОСЬ ИЛИ НЕ СОБРАЛОСЬ С ПРИЧИНОЙ.
 *
 * Рабочий экран ловил исключение сборки и возвращал `null` — то есть
 * говорил «формы нет». Это разные вещи: «композиции не просили» и
 * «композиция не сошлась». Слитые в одно, они показывают замерщику
 * пустоту вместо причины, а он стоит в квартире и объясняет её клиенту.
 *
 * Наружу уходит СОСТОЯНИЕ. У отказа нет `composition` — значит нечего
 * положить ни в чертёж, ни в смету: цену от несобравшейся раскладки
 * показать физически не из чего, и это свойство типа, а не дисциплина
 * вызывающего.
 *
 * Исключения при этом не глушатся и не ослабляются: `CornerOverlapError`
 * и `ModuleOverlapError` по-прежнему летят из `buildComposition`, просто
 * здесь они превращаются в состояние, у которого есть слова.
 */
export type CompositionAttempt =
  | { state: 'built'; composition: Composition }
  | {
      state: 'refused';
      /** Имя исключения и текст — для отчёта и приёмки. */
      error: string;
      /** Одна строка словами для замерщика: что именно не сошлось. */
      reason: string;
    };

export function tryBuildComposition(input: BuildCompositionInput): CompositionAttempt {
  try {
    return { state: 'built', composition: buildComposition(input) };
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error';
    const text = error instanceof Error ? error.message : String(error);

    /*
     * Текст исключения в этом слое уже написан словами и называет
     * последствие («Такую мебель нельзя ни собрать, ни повесить»).
     * Переписывать его здесь значило бы завести второй словарь причин,
     * который разойдётся с первым.
     */
    return { state: 'refused', error: `${name}: ${text}`, reason: text.trim() };
  }
}

export function buildComposition(input: BuildCompositionInput): Composition {
  const { kind, requirements, ceilingHeightMm } = input;
  /*
   * Глубина ряда в углу — ШКОЛА ЦЕХА, а не профиль зоны: от неё зависит,
   * сколько занял в углу соседний ряд (`cornerLostMm`), а значит и
   * полезная длина следующей стены.
   */
  const depthMm = rowStandardDepthMm(requirements.zone, 'base', input.production);

  /*
   * СВОБОДНАЯ СБОРКА УГЛОВ РАБОТАЕТ.
   *
   * Раньше здесь стоял отказ: `buildRun` в свободном режиме возвращает
   * пустой ряд, и композиция получалась угловой кухней без единого
   * модуля. Но пустые стены — это ЗАКОННОЕ начало работы, ровно как на
   * одной прямой: человек ставит модули сам, на каждую стену свои.
   *
   * Геометрия угла при этом считается та же: второй ряд короче своей
   * стены на глубину первого либо на 900 при угловом модуле. Пустой ряд
   * ничего в углу не занимает, но МЕСТО под мебель урезано с самого
   * начала — иначе первый же поставленный модуль налез бы на соседний.
   */

  const need = segmentCount(kind);
  const walls = input.walls.slice(0, need);
  const warnings: string[] = [];

  /*
   * НЕ ХВАТАЕТ СТЕНЫ — ЭТО ИМЯ, А НЕ СЧЁТ.
   *
   * «Требует 3 стен, а в замере их 2» замерщик прочитает и пойдёт
   * искать, какой именно. Он стоит в квартире с рулеткой: назвать надо
   * ту стену, которую ему сейчас мерить.
   *
   * Придумать её длину нельзя ни из глубины помещения, ни из соседней:
   * кухня 11.85 м² бывает и 3200 × 3700, и 2900 × 4100, а смету считает
   * длина ряда.
   */
  if (walls.length < need) {
    const missing = Array.from({ length: need - walls.length }, (_, i) =>
      wallLabel(walls.length + i),
    ).join(' и ');

    throw new Error(
      `${SHAPE_TITLE[kind]} ставит мебель на ${SHAPE_WALLS[kind]}, ` +
        `а в замере их ${walls.length}: не хватает ${missing}. ` +
        'Добавьте её в замер — длину такой стены выдумать нельзя, ' +
        'по ней считается и раскрой, и цена.',
    );
  }

  /*
   * Каждый следующий ряд теряет глубину предыдущего. Считаем это ДО
   * раскладки: buildRun должен получить уже полезную длину, иначе он
   * честно разложит модули по всей стене — и они окажутся в углу
   * поверх соседних.
   *
   * ВЫБОР — ПО КАЖДОМУ УГЛУ (слой 55): у П-образной кухни два угла, и
   * в одном Г-модуль, а в другом слепой угол — обычное дело. Прежнее
   * `cornerSolution` читается, только если выбора по углам нет.
   */
  /* Выбор угла — за физической парой стен, где бы она ни стояла в обходе. */
  const choices = cornerChoicesOf(requirements, walls.length - 1, walls.map((wall) => wall.id));

  /*
   * РЯДЫ ДРУГ ПРОТИВ ДРУГА НЕ ВХОДЯТ ДРУГ В ДРУГА (ADVANCED CAD, STAGE A).
   *
   * Стены А и В П-образной кухни стоят напротив, и между ними — длина
   * стены Б. Нижнему ряду с каждой стороны нужен корпус и фасад; меньше —
   * фасады входят друг в друга, и такую кухню не собрать и не открыть. На
   * П 3800 + 1140 + 1740 нижние ряды заходили друг в друга на 12 мм, а
   * композиция собиралась с предупреждением «проход 20 мм» — проход
   * считался между корпусами, без фасадов. Это отказ, а не предупреждение:
   * отрицательного прохода не бывает. Что делать — словами
   * (`facingRefusal`): какой нужна стена Б, можно ли уменьшить глубину и
   * какая композиция на этих стенах собирается.
   */
  if (kind === 'u_shape') {
    const refusal = facingRefusal({ walls, depthMm, production: input.production, requirements });
    if (refusal) throw new Error(refusal);
  }

  /*
   * П-образная кухня с узким проходом — это кухня, в которой не
   * разойтись. Предупреждаем блокирующе: переделывать её будут уже
   * на объекте.
   */
  if (kind === 'u_shape') {
    const aisle = Math.round(walls[1].lengthMm) - 2 * depthMm;
    if (aisle < CORNER.minAisleMm) {
      warnings.push(
        `Проход между рядами ${Math.max(0, aisle)} мм — меньше ${CORNER.minAisleMm} мм. ` +
          'В такой кухне не разойтись вдвоём и не открыть ящик напротив.',
      );
    }
  }

  const wallIds = walls.map((wall) => wall.id);

  /*
   * РАСКЛАДКА ВСЕХ СТЕН ПО ВЫБОРУ УГЛОВ — одна на первую сборку и на
   * пересборку под фальш-панели по ходу (STAGE A). `fixed` — раздача
   * приборов первой сборки: панели не должны переселять технику.
   */
  const assemble = (now: CornerChoice[], fixed: ApplianceKind[][] | null) => {
    const siteWarnings: string[] = [];
    /*
     * Сколько ряд теряет в каждом своём углу.
     *
     * Г-образный модуль — квадрат: он занимает свою сторону и вдоль своей
     * стены, и вдоль соседней. Считать здесь глубину ряда (560) значит
     * налезть на него на 340 мм — ровно та ошибка, которую замечают
     * на монтаже, когда мебель уже распилена.
     *
     * Слепой угол: там глубина соседнего ряда плюс фальш-панель,
     * отодвигающая фасад от чужого фасада. Считает `cornerGeometry`.
     *
     * Теряет тот, кто к углу СТЫКУЕТСЯ, — у начала ряда или у его конца
     * (P0): стена после угла, которая идёт в угол сама, начинается от стены
     * соседа, а стена до угла кончается раньше неё.
     */
    const gapsOf = (i: number) => ({
      start: i > 0 ? levelOfChoice(now[i - 1], 'next', 'lower', requirements.zone, input.production).gapMm : 0,
      end: i < walls.length - 1 ? levelOfChoice(now[i], 'prev', 'lower', requirements.zone, input.production).gapMm : 0,
    });
    const usable = walls.map((wall, i) => {
      const gaps = gapsOf(i);
      if (gaps.start + gaps.end === 0) return Math.max(0, Math.round(wall.lengthMm));

      const value = Math.round(wall.lengthMm) - gaps.start - gaps.end;

      assertCornerFits({
        label: wallLabel(i),
        wallLengthMm: Math.round(wall.lengthMm),
        lostMm: gaps.start + gaps.end,
        minWidthMm: MIN_WIDTH,
      });

      return value;
    });

    const perSegment = fixed ?? splitAppliances(requirements.appliances, usable, requirements.applianceWalls, wallIds);

    /* Что у стены своё, кроме приборов, — один раз: при переезде прибора ряд собирается заново. */
    const sites = walls.map((wall, i) => {
      /*
       * Коммуникации ЭТОЙ стены, пересчитанные от начала ряда. Чужие сюда
       * не попадают вовсе: у коммуникации есть своя стена, и спрашивают
       * именно её.
       */
      const gaps = gapsOf(i);
      const lostHere = gaps.start;
      const wallComms = commsOnRun(input.comms, wall.id, lostHere, usable[i]);

      /*
       * Попавшее в угол не пропадает молча: этот кусок стены закрыт
       * соседним рядом, и привязать к нему мойку ЭТОГО ряда нельзя.
       */
      for (const comm of wallComms.inCorner) {
        /*
         * Подлежащее — «точка»: у видов коммуникаций разный род, и
         * «канализация попал в угол» читается как машинный текст.
         */
        const atEnd = comm.fromCornerMm > lostHere + usable[i];
        siteWarnings.push(
          `${wallLabel(i)}: точка «${COMM_TITLE[comm.kind]}» на ${comm.fromCornerMm} мм от угла ` +
            `попала в угол — там стоит соседний ряд. Мебель этой стены ` +
            (atEnd ? `кончается на ${lostHere + usable[i]} мм` : `начинается с ${lostHere} мм`) +
            ', и привязать к этой точке её нельзя.',
        );
      }

      /*
       * РОЛЬ РЯДА В ЕГО УГЛАХ — ДО РАСКЛАДКИ, А НЕ ПОСЛЕ.
       *
       * Ведущий ряд собирает угловой модуль у своего конца (Г-образный или
       * слепой), стыкующийся начинает или кончает верхний ряд иначе, чем
       * нижний, — и всё это решает раскладка. Кладёт роль та же функция,
       * что и шов экрана (`cornerOfSegment`), поэтому у стены А, собранной
       * из вариантов, угол тот же, что у композиции.
       */
      const corner: RunCorner | undefined = cornerOfSegment(now, i, walls.length);
      const shell = { corner, zone: requirements.zone, production: input.production, lengthMm: usable[i] };
      const upper = levelBoundsOf(shell, 'upper');
      const mezz = levelBoundsOf(shell, 'mezzanine');
      /*
       * Проёмы этой стены, пересчитанные от начала РЯДА: угол занят
       * соседним рядом, и отметки замера сдвинуты на него. У ряда остаётся
       * и полоса за краем нижнего ряда, куда заходит его верхний ряд или
       * антресоль (раньше нуля или дальше длины, P0): окно там рвёт их так
       * же, как на остальной стене.
       */
      const openings = openingsOnRun(
        wall.openings,
        lostHere,
        usable[i],
        Math.min(0, upper.fromMm, mezz.fromMm),
        Math.max(usable[i], upper.toMm, mezz.toMm),
      );

      /*
       * ПЕНАЛЫ — У СТЕНЫ КОМНАТЫ, А НЕ В УГЛУ (слой 55).
       *
       * «Пеналы у стены: холодильник в самом торце» — у ряда стены А торец
       * у стены комнаты — его начало (`tallSide: 'left'`). У ряда, который к
       * углу только стыкуется, начало — угол, а торец у стены комнаты — его
       * конец; то же правило ставило холодильник вплотную к углу. Пенал
       * глубиной нижнего ряда выступает там на 240 мм перед верхними шкафами
       * стены-владельца, и их створки, открываясь, упирались в его фасад —
       * это и поймала проверка открывания у угла. Сторона зеркалится: выбор
       * «у стены» остаётся выбором «у стены».
       */
      /* Угол только в начале ряда: торец у стены комнаты — его конец (P0: кто бы угол ни вёл). */
      const startOnly = Boolean(corner?.start) && !corner?.end;
      const tallSide = startOnly
        ? requirements.tallSide === 'right'
          ? ('left' as const)
          : ('right' as const)
        : requirements.tallSide;

      return { wall, wallComms, corner, openings, tallSide };
    });

    /* Ряд стены `i` с этими приборами — одна сборка на раздачу и на переезд прибора. */
    const runOf = (i: number, appliances: ApplianceKind[]): Run =>
      buildRun({
        id: `${input.id ?? 'composition'}-${i}`,
        lengthMm: usable[i],
        ceilingHeightMm,
        requirements: { ...requirements, appliances, tallSide: sites[i].tallSide },
        openings: sites[i].openings,
        comms: sites[i].wallComms.kept,
        corner: sites[i].corner,
        production: input.production,
        // Стена замера едет в ряд: она же идентичность его модулей.
        wallId: sites[i].wall.id,
      });

    const assigned = perSegment.map((list) => [...list]);
    const runs = walls.map((_, i) => runOf(i, assigned[i]));
    if (!fixed && requirements.mode !== 'free') {
      rehomeRefused({ assigned, runs, usable, runOf, pinned: (appliance) => pinnedWallIndex(requirements.applianceWalls?.[appliance], wallIds) >= 0 });
    }
    return { usable, sites, runs, assigned, siteWarnings };
  };

  /*
   * ФАЛЬШ-ПАНЕЛИ ПО ХОДУ (ADVANCED CAD · STAGE A).
   *
   * Слепой угол держат две полосы фасада: фальш-панель соседа и — когда
   * нужно — фальш-панель владельца. Ширина первой — настройка цеха, но
   * створка соседа у угла на полном ходу ложилась ручкой в ручку владельца
   * (П смешанная, школа «угол 60/1000»: на 4 мм), а ящик владельца у
   * слепого модуля, выезжая, заходил в ручку первой двери соседа (П 3800 +
   * 2400 + 1740, 600/300: на 12 мм). Здесь каждая створка, ящик и Г-фасад
   * обоих рядов угла проходит весь свой ход (`cornerKinematics`), и панель
   * того ряда, что движется, становится шире ровно настолько, чтобы заход
   * стал касанием. Ряды пересобираются той же раскладкой с той же раздачей
   * приборов: сумма модулей по-прежнему равна стене, приборы не переезжают.
   * Не встаёт прибор или заход панелью не снять — отказ словами, с
   * миллиметрами и тем, что можно сделать.
   *
   * Свободная сборка ряды не раскладывает — их ставит человек, и его
   * модули композиция не двигает: заход там называет проверка экрана
   * (`cornerClashMismatches`).
   */
  const wallOf = (wall: number) => lowerWall(wallLabel(wall), 'genitive');
  let current = choices;
  let built = assemble(current, null);
  /*
   * Почему панель шире — заход БЕЗ неё (первый проход, самый глубокий на эту
   * панель); ширина — та, что встала после всех пересборок. Слова проходов
   * не копятся: «20 мм», а потом «22 мм» про одну панель — две правды.
   */
  let reasons: Map<string, { fix: NonNullable<CornerClash['fix']>; clash: CornerClash; pass: number }>[] = [];
  let basis: string[][] = [];
  /*
   * НЕ ПОДЕЙСТВОВАВШЕЕ РЕШЕНИЕ ОТБРАСЫВАЕТСЯ. Сдвиг ряда по модели — это
   * сдвиг всего ряда, а раскладка двигает то, что у угла: панель владельца
   * не уводит пенал, стоящий в другом конце его ряда (П 3600 + 2800 + 3600:
   * створка стены В и духовой шкаф стены Б — 114,2 мм до и 114,2 после).
   * Пара, у которой заход после её решения не уменьшился, получает другое
   * решение, и расчёт идёт заново от выбора человека — без накопленных
   * панелей.
   */
  const avoid = new Set<string>();
  /*
   * ЗАХОД, КОТОРЫЙ ПАНЕЛЬЮ НЕ СНЯТЬ, — НЕ ИСКЛЮЧЕНИЕ, А БЛОКИРУЮЩЕЕ.
   * Ряды остаются на экране (их правят руками: сторона петель, ручка,
   * решение угла), а цена спрятана и «Дальше» заперто, пока заход есть
   * (`cornerClashes` → `cornerClashMismatches`). Места под панель нет —
   * панель не расширяется: слова называют, какой прибор тогда не встал бы.
   */
  const noRoom = new Map<string, string>();
  let left: CornerKinematics | null = null;
  if (requirements.mode !== 'free' && walls.length > 1) {
    settle: for (let attempt = 0; ; attempt += 1) {
      current = choices;
      built = attempt === 0 ? built : assemble(current, null);
      reasons = choices.map(() => new Map());
      basis = choices.map(() => []);
      let last = new Map<string, CornerPair>();
      for (let pass = 0; ; pass += 1) {
        const places = runPlacements({ runs: built.runs, corners: current, zone: requirements.zone, production: input.production });
        const kin = cornerKinematics({ runs: built.runs, places, production: shopOf(input.production), avoid });
        left = kin;
        if (kin.clashes.length === 0) break settle;
        const stale = kin.pairs.filter((pair) => {
          const was = last.get(pair.pair);
          return was?.fix && pair.depthMm >= was.depthMm - 0.05;
        });
        if (stale.length > 0 && attempt < 3) {
          for (const pair of stale) avoid.add(fixKey(pair.pair, last.get(pair.pair)!.fix!));
          continue settle;
        }
        /* Снимать панелью больше нечего — то, что осталось, называет экран. */
        if (!kin.pairs.some((pair) => pair.fix) || pass >= 4) break settle;
        const next = current.map((choice, c) => raisedChoice(choice, kin.raise[c], requirements.zone, input.production));
        /* Из чего посчитано: ход из сцены, условные ручки — словами, рядом с шириной панели. */
        for (const clash of kin.clashes) basis[clash.corner].push(...kin.assumptions);
        kin.clashes.forEach((clash) => {
          if (!clash.fix) return;
          const key = `${clash.fix.side}:${clash.fix.level}`;
          const was = reasons[clash.corner].get(key);
          if (!was || (was.pass === pass && (clash.needMm ?? 0) > (was.clash.needMm ?? 0))) {
            reasons[clash.corner].set(key, { fix: clash.fix, clash, pass });
          }
        });
        const again = assemble(next, built.assigned);
        /*
         * МЕСТА ДЛЯ ПАНЕЛИ ФИЗИЧЕСКИ НЕТ — не расширяем. Панель забирает у
         * ряда длину; если после этого ряд не ставит прибор, который стоял,
         * панели этого прохода не годятся: расчёт заново без них, а заход
         * назван словами — какой прибор тогда не встал бы.
         */
        const lost = droppedAppliances(built.runs, again.runs);
        if (lost) {
          for (const pair of kin.pairs) {
            if (!pair.fix) continue;
            avoid.add(fixKey(pair.pair, pair.fix));
            noRoom.set(
              pair.pair,
              `фальш-панель шире сняла бы это, но места под неё нет: на ${lowerWall(lost.label, 'prepositional')} ` +
                `тогда не помещается «${APPLIANCE_SLOTS[lost.appliance].title}»`,
            );
          }
          if (attempt < 3) continue settle;
          break settle;
        }
        last = new Map(kin.pairs.map((pair) => [pair.pair, pair]));
        current = next;
        built = again;
      }
    }
  } else {
    reasons = choices.map(() => new Map());
    basis = choices.map(() => []);
  }
  /* Заходы, которые остались: по одной строке на пару, самой глубокой коробкой. */
  const cornerClashes: CornerClashNote[] = [];
  if (left) {
    const deepest = new Map<string, CornerClash>();
    for (const clash of left.clashes) {
      const was = deepest.get(clash.pair);
      if (!was || clash.depthMm > was.depthMm) deepest.set(clash.pair, clash);
    }
    for (const clash of Array.from(deepest.values())) {
      cornerClashes.push({
        corner: clash.corner,
        wall: clash.wall,
        obstacleWall: clash.obstacleWall,
        leaf: clash.leaf,
        pair: clash.pair,
        depthMm: Math.round(clash.depthMm * 10) / 10,
        words: `${clashWords(clash, wallOf)} — ${noRoom.get(clash.pair) ?? stuckWords(clash, current[clash.corner], wallOf)}`,
        ...(clash.own ? { own: true as const } : {}),
      });
    }
  }

  warnings.push(...built.siteWarnings);
  const { runs, assigned, sites } = built;

  const segments: RunSegment[] = walls.map((wall, i) => {
    warnings.push(...runs[i].warnings.map((w) => `${wallLabel(i)}: ${w}`));

    return {
      id: `seg-${i}`,
      label: wallLabel(i),
      wallId: wall.id,
      angleDeg: i === 0 ? 0 : 90,
      wallLengthMm: Math.round(wall.lengthMm),
      appliances: assigned[i],
      comms: sites[i].wallComms.kept,
      openings: sites[i].openings,
      run: runs[i],
    };
  });

  /*
   * УГЛЫ КОМПОЗИЦИИ: владелец — стена ДО угла по обходу, одно поле.
   *
   * Фальш-панели и угол раскрытия петли — из того же выбора и той же
   * школы цеха, что урезали длину: второго расчёта занятого в углу нет.
   * Ширины — те, что стоят (`cornerGeometry` с панелями по ходу).
   */
  const corners: CornerJoin[] = segments.slice(1).map((segment, i) => {
    const g = cornerGeometry(current[i], requirements.zone, input.production);
    return {
      fromSegmentId: segments[i].id,
      toSegmentId: segment.id,
      /* Низ ведёт стена, выбранная человеком (P0); умолчание — стена до угла. */
      ownerSegmentId: cornerOwnerOf(current[i], 'lower') === 'next' ? segment.id : segments[i].id,
      choice: { ...current[i] },
      solution: solutionOf(current[i]),
      /* У Г-угла панель есть только по ходу — и тогда она в отпечатке, как у слепого. */
      falsePanelMm: current[i].lower === 'blind' || g.fillerMm > 0 ? g.fillerMm : undefined,
      ...(g.ownerFillerMm > 0 ? { ownerPanelMm: g.ownerFillerMm } : {}),
      ...(current[i].clearance?.upperDockMm
        ? { upperPanelMm: panelWidthMm(current[i], { side: 'dock', level: 'upper' }, requirements.zone, input.production) }
        : {}),
      ...(current[i].clearance?.upperOwnerMm
        ? { ownerUpperPanelMm: panelWidthMm(current[i], { side: 'owner', level: 'upper' }, requirements.zone, input.production) }
        : {}),
      ...(reasons[i].size > 0
        ? {
            clearanceWhy: [
              ...Array.from(reasons[i].values()).map(
                ({ fix, clash }) =>
                  `${stripWords(current[i], fix, i, wallOf, panelWidthMm(current[i], fix, requirements.zone, input.production), input.production)}: ` +
                  `без этого ${clashWords(clash, wallOf)}`,
              ),
              ...(basis[i].length > 0 ? [`посчитано так: ${Array.from(new Set(basis[i])).join(', ')}`] : []),
            ],
          }
        : {}),
      hingeAngleDeg: CORNER.hingeAngleDeg,
      frontGapMm: CORNER.frontGapMm,
    };
  });

  return {
    kind,
    segments,
    corners,
    fingerprint: compositionFingerprint({ segments, corners }),
    warnings,
    ...(cornerClashes.length > 0 ? { cornerClashes } : {}),
  };
}

/** Прибор, который стоял в ряду, а после пересборки — нет. */
function droppedAppliances(before: Run[], after: Run[]): { label: string; appliance: ApplianceKind } | null {
  for (let i = 0; i < before.length; i += 1) {
    const now = new Set(allModules(after[i]).flatMap((unit) => moduleAppliances(unit)));
    for (const appliance of allModules(before[i]).flatMap((unit) => moduleAppliances(unit))) {
      if (!now.has(appliance)) return { label: wallLabel(i), appliance };
    }
  }
  return null;
}

/**
 * П-ОБРАЗНАЯ НЕ СОБИРАЕТСЯ — ПРИЧИНА, НУЖНЫЙ РАЗМЕР И ЧТО МОЖНО СДЕЛАТЬ.
 *
 * Стены А и В стоят друг против друга в длину стены Б. Ряду с каждой
 * стороны нужен корпус и фасад; между рядами — проход, в котором
 * открываются ящики и расходятся двое (`CORNER.minAisleMm`). Отсюда три
 * числа: сколько нужно рядам, сколько — рабочей П, и можно ли выйти из
 * положения мельче шкафами: глубину ниже той, что нужна приборам с
 * замеренной глубиной, взять нельзя, а у прибора без замера глубина
 * неизвестна, и обещать её нельзя тоже.
 *
 * Замер стен не меняется: что не помещается — называется, а не
 * подгоняется.
 */
export function facingRefusal(input: {
  walls: { lengthMm: number }[];
  depthMm: number;
  production?: ProductionSettings;
  requirements: Pick<RunRequirements, 'appliances' | 'applianceSizes'>;
}): string | null {
  const { walls, depthMm } = input;
  const facingMm = Math.round(walls[1].lengthMm);
  const frontMm = shopOf(input.production).frontMm;
  const needMm = 2 * (depthMm + frontMm);
  if (facingMm >= needMm) return null;

  const workMm = needMm + CORNER.minAisleMm;
  /* Глубина, при которой рядам и проходу хватило бы стены Б: (Б − проход) / 2 − фасад. */
  const fitDepthMm = Math.floor((facingMm - CORNER.minAisleMm) / 2 - frontMm);
  /* Приборы с замеренной глубиной не встанут в корпус мельче «прибор + просвет 20 мм». */
  const measured = Object.entries(input.requirements.applianceSizes ?? {})
    .filter(([kind, size]) => input.requirements.appliances.includes(kind as ApplianceKind) && (size?.depthMm ?? 0) > 0)
    .map(([kind, size]) => ({ kind: kind as ApplianceKind, needMm: Math.round(size!.depthMm!) + APPLIANCE_BACK_GAP_MM }));
  const deepest = measured.sort((a, b) => b.needMm - a.needMm)[0];
  const unknown = input.requirements.appliances.filter(
    (kind) => APPLIANCE_SLOTS[kind].kind !== 'upper' && !measured.some((entry) => entry.kind === kind),
  );

  const depthWords =
    fitDepthMm <= 0
      ? `Мельче шкафами не выйти: одному проходу нужно ${CORNER.minAisleMm} мм, а это не меньше всей стены Б (${facingMm} мм).`
      : deepest && fitDepthMm < deepest.needMm
        ? `Мельче шкафами не выйти: рядам и проходу хватило бы глубины ${fitDepthMm} мм, а «${APPLIANCE_SLOTS[deepest.kind].title}» нужен корпус не мельче ${deepest.needMm} мм.`
        : `Рядам и проходу хватило бы глубины ${fitDepthMm} мм${
            unknown.length > 0
              ? `, но глубина ${unknown.map((kind) => `«${APPLIANCE_SLOTS[kind].title}»`).join(', ')} не замерена — встанут ли они в такой корпус, неизвестно`
              : ''
          }.`;

  return (
    `${SHAPE_TITLE.u_shape} на этих стенах не собирается: ${lowerWall(wallLabel(0))} и ${lowerWall(wallLabel(2))} ` +
    `стоят друг против друга в ${facingMm} мм — это длина ${lowerWall(wallLabel(1), 'genitive')}, — а двум нижним рядам ` +
    `нужно ${needMm} мм: корпус ${depthMm} мм и фасад ${frontMm} мм с каждой стороны. Фасады вошли бы друг ` +
    `в друга на ${needMm - facingMm} мм, и ни одна дверца не открылась бы. Рабочей П-образной нужна стена Б ` +
    `не короче ${workMm} мм: два ряда по ${depthMm + frontMm} мм и проход ${CORNER.minAisleMm} мм. ${depthWords} ` +
    `Что можно: угловая кухня на стенах А и Б или проверьте замер ${lowerWall(wallLabel(1), 'genitive')}.`
  );
}

/** Общая длина столешницы: сумма полезных длин всех рядов. */
export function compositionLengthMm(composition: Composition): number {
  return composition.segments.reduce((sum, segment) => sum + segment.run.lengthMm, 0);
}

/** Все модули композиции слева направо по сегментам. */
export function compositionModules(composition: Composition): Run['modules'] {
  return composition.segments.flatMap((segment) => segment.run.modules);
}

/** Длины сторон для промпта рендера: они же подписи на чертеже. */
export function compositionSidesMm(composition: Composition): number[] {
  return composition.segments.map((segment) => segment.run.lengthMm);
}

/** Один прямой ряд как композиция: остальной код работает с ней одинаково. */
export function linearComposition(run: Run, wallId = 'w1'): Composition {
  const segments: RunSegment[] = [
    {
      id: 'seg-0',
      label: wallLabel(0),
      wallId,
      angleDeg: 0,
      wallLengthMm: run.lengthMm,
      /*
       * Прямая кухня: угол ничего не занял, перевод тождественный —
       * коммуникации ряда и есть коммуникации стены.
       */
      comms: [],
      // Одна стена — значит все приборы ряда на ней.
      appliances: run.modules.flatMap((unit) => moduleAppliances(unit)),
      run,
    },
  ];

  return {
    kind: 'linear',
    segments,
    corners: [],
    fingerprint: compositionFingerprint({ segments, corners: [] }),
    warnings: [],
  };
}

export { CORNER_SIZE_MM };

/**
 * ОТМЕТКА СТЕНЫ — В КООРДИНАТЫ РЯДА. ОДНА ФОРМУЛА НА ВСЁ, ЧТО ЗАМЕРЕНО.
 *
 * Замерщик меряет от УГЛА СТЕНЫ — и окно, и ригель, и вывод воды. Ряд на
 * этой стене начинается не от угла: там стоит соседний ряд, и он занял
 * `lostMm`. Перевод между этими системами координат один, и живёт он
 * здесь: вторая такая формула разошлась бы с первой на первой правке —
 * этот класс ошибки продукт ловит уже двенадцатый раз.
 *
 * `null` означает «этот участок стены закрыт соседним рядом»: к ЭТОМУ
 * ряду отметка не относится. Выбрасывать её молча нельзя — замерщик её
 * зачем-то мерил; кто её получил, тот про неё и говорит.
 *
 * Проём — отрезок, и он выживает, если после обрезки от него осталась
 * длина. Коммуникация — ТОЧКА (`widthMm` нет вовсе), и она выживает,
 * если попала в пределы ряда: обрезать точку не во что.
 */
export function markOnRun(
  mark: { fromCornerMm: number; widthMm?: number },
  lostMm: number,
  lengthMm: number,
  /**
   * С какой отметки ряд ЕСТЬ. Ноль у нижнего ряда; у ряда после угла
   * верхний ряд начинается раньше нуля (слой 55), и окно там тоже его.
   */
  fromMm = 0,
  /**
   * До какой отметки ряд есть. Длина у нижнего ряда; у ряда, который верхом
   * ведёт угол, а низом к нему стыкуется (P0), верх идёт дальше длины.
   */
  toMm = lengthMm,
): { fromCornerMm: number; widthMm: number } | null {
  const width = mark.widthMm ?? 0;
  const from = mark.fromCornerMm - lostMm;

  if (width === 0) {
    if (from < fromMm || from > toMm) return null;
    return { fromCornerMm: Math.round(from), widthMm: 0 };
  }

  const clippedFrom = Math.max(fromMm, from);
  const clippedTo = Math.min(toMm, from + width);
  if (clippedTo - clippedFrom <= 0) return null;

  return {
    fromCornerMm: Math.round(clippedFrom),
    widthMm: Math.round(clippedTo - clippedFrom),
  };
}

/**
 * ПРОЁМЫ СТЕНЫ — В КООРДИНАТЫ РЯДА.
 *
 * Замерщик меряет окно, дверь и ригель ОТ УГЛА СТЕНЫ. Ряд на этой стене
 * начинается не от угла: там стоит соседний ряд, и он занял `lostMm`.
 * Раскладка же считает всё от начала РЯДА.
 *
 * Пока перевода не было, на стене Б всё уезжало на длину угла:
 *
 *   стена 1800, угол занял 660, полезная 1140
 *   ригель замера 1200+600  →  в ряд не попадал ВОВСЕ (обрезался по 1140)
 *   ригель замера  600+600  →  вставал на 600+540 вместо 0+540
 *   ригель замера    0+600  →  вставал на 0+600, хотя физически он в углу
 *
 * То же самое происходило с окном: верхний ряд рвался не там, где окно.
 * Ригель при этом — ФАКТ ОБМЕРА, и двигать его алгоритм не вправе; он
 * обязан лишь пересчитать отметку в систему координат ряда.
 *
 * Обрезка по длине ряда тут же: то, что осталось за углом, к этому ряду
 * не относится — его закрывает соседний.
 */
export function openingsOnRun(
  openings: Opening[] | undefined,
  lostMm: number,
  lengthMm: number,
  /** С какой отметки ряд есть: у ряда после угла верх начинается раньше нуля. */
  fromMm = 0,
  /** До какой отметки ряд есть: верх, ведущий угол над стыкующимся низом, — дальше длины (P0). */
  toMm = lengthMm,
): Opening[] {
  const moved: Opening[] = [];

  for (const opening of openings ?? []) {
    const at = markOnRun(opening, lostMm, lengthMm, fromMm, toMm);
    if (!at) continue;
    moved.push({ ...opening, ...at });
  }

  return moved;
}

/**
 * КОММУНИКАЦИИ ЭТОЙ СТЕНЫ — В КООРДИНАТЫ РЯДА.
 *
 * Каждый сегмент получал ВСЕ коммуникации объекта: ни отбора по стене,
 * ни перевода отметки. Ряд стены Б садил мойку на вывод воды стены А —
 * и своего вывода не видел вовсе, потому что до композиции доезжали
 * только коммуникации рабочей стены.
 *
 * Стена у коммуникации своя (`CommPoint.wallId`), и отбор идёт по ней —
 * не по совпадению чисел, как это было со стенами (симптом 3).
 *
 * Отдельно возвращаем то, что попало в угол: этот кусок стены закрыт
 * соседним рядом, и к мойке ЭТОГО ряда вывод не привязать. Замерщик
 * обязан узнать об этом словами, а не по пропавшему предупреждению.
 */
export function commsOnRun(
  comms: CommPoint[] | undefined,
  wallId: string,
  lostMm: number,
  lengthMm: number,
): { kept: CommPoint[]; inCorner: CommPoint[] } {
  const kept: CommPoint[] = [];
  const inCorner: CommPoint[] = [];

  for (const comm of comms ?? []) {
    if (comm.wallId !== wallId) continue;

    const at = markOnRun(comm, lostMm, lengthMm);
    if (at) kept.push({ ...comm, fromCornerMm: at.fromCornerMm });
    else inCorner.push(comm);
  }

  return { kept, inCorner };
}

/* ─────────────────────────  Где стоит каждый ряд  ───────────────────────── */

/** Мировое место ряда: точка начала в метрах и поворот вокруг вертикали. */
export type RunPlacement = {
  xM: number;
  zM: number;
  rotationYDeg: number;
};

/**
 * ГДЕ СТОИТ КАЖДЫЙ РЯД КОМПОЗИЦИИ — ОДНА ФУНКЦИЯ НА ПРОДУКТ.
 *
 * Формула жила в рабочем экране (`Workspace.sceneRows`), а у сцены был
 * СВОЙ запасной вариант для первого ряда и ещё один — у фартука внутри
 * `Cabinet3D`. На одном ряду расхождения не видно, на двух и трёх видно
 * сразу: ряды не стыкуются, между ними разрывы.
 *
 * Здесь она одна, и зовут её все: сцена, рёбра, комната, габарит для
 * камеры и приёмка. Числа те же, что урезали полезную длину
 * (`usable` выше), иначе сцена показывает не ту мебель, что посчитала
 * смета.
 */
export function runPlacements(input: {
  /**
   * Ряды композиции слева направо: их ПОЛЕЗНЫЕ длины, а не длины стен.
   * Угол на ряду (`run.corner.start`/`end`) — главнее `corners`: на нём лежат
   * фальш-панели по ходу (STAGE A), и занятое в углу считается ровно тем
   * выбором, по которому ряд урезан.
   */
  runs: (Pick<Run, 'lengthMm'> & Partial<Pick<Run, 'corner'>>)[];
  /**
   * Прежнее решение угла — одно на все углы. Читается, только если
   * выбора по углам (`corners`) нет: так считают старые места и приёмки.
   */
  solution?: CornerJoin['solution'];
  /** Выбор по каждому углу (слой 55): у П два угла, и они бывают разными. */
  corners?: CornerChoice[];
  /**
   * Зона и школа цеха — ГЛУБИНУ СЧИТАЕТ ЭТА ФУНКЦИЯ САМА.
   *
   * Раньше сюда передавали готовое число, и рабочий экран передавал
   * глубину ПРОФИЛЯ ЗОНЫ, пока раскладка брала глубину ЦЕХА: на
   * умолчаниях обе давали 560, а у цеха с 550 занятое в углу выходило
   * 650 в раскладке и 660 в сцене — ряд уезжал на десять миллиметров.
   *
   * Теперь подставить чужое число просто негде: и раскладка, и сцена
   * зовут одну `rowStandardDepthMm`.
   */
  zone: ZoneKind | undefined;
  production?: ProductionSettings;
}): RunPlacement[] {
  const depthMm = rowStandardDepthMm(input.zone, 'base', input.production);
  /*
   * Занятое в КАЖДОМ углу — той же `cornerGeometry`, что урезала
   * полезную длину ряда после него. Своё число здесь развело бы сцену с
   * раскладкой на первом же угле с другим решением.
   */
  const choices =
    input.corners ??
    Array.from({ length: Math.max(0, input.runs.length - 1) }, () => choiceFromSolution(input.solution));
  /*
   * Сколько ряд не доходит до стены соседа у своего конца, метры: у начала —
   * если угол перед ним ведёт стена до угла, у конца — если угол за ним ведёт
   * стена после (P0). Угол — свой у ряда (на нём панели по ходу), иначе
   * выбор композиции.
   */
  const gapOf = (row: number, end: 'start' | 'end'): number => {
    const corner = end === 'start' ? row - 1 : row;
    if (corner < 0 || corner >= input.runs.length - 1) return 0;
    const choice = input.runs[row]?.corner?.[end] ?? choices[corner] ?? choiceFromSolution(input.solution);
    return levelOfChoice(choice, end === 'start' ? 'next' : 'prev', 'lower', input.zone, input.production).gapMm / MM_IN_M;
  };
  const depthM = depthMm / MM_IN_M;

  const places: RunPlacement[] = [];

  /*
   * Ряды идут ЦЕПОЧКОЙ, как стены в замере: каждый следующий начинается
   * там, где кончился предыдущий, повёрнутый на прямой угол.
   *
   * Раньше место считалось «от половины длины предыдущего»: у второго
   * ряда получалось `xM = L/2`, то есть его СПИНКА уезжала за стену на
   * глубину ряда, а начало — на панель назад. На угловой это давало
   * 91 мм расхождения в стыке, на П-образной 2635 мм: третий ряд уходил
   * за стену А и висел в воздухе.
   *
   * Считаем через две точки, которые имеют физический смысл:
   *   P — начало ряда У СТЕНЫ, E — его конец у стены.
   *   E(i) = P(i) + длина · направление
   *   угол(i) = E(i) + недошёл_в_конце(i) · направление(i)
   *   P(i+1) = угол(i) + недошёл_в_начале(i+1) · направление(i+1)
   * До P0 в угол шёл всегда ряд до угла, и `недошёл_в_конце` был нулём.
   * Отсюда и начало координат ряда: P минус глубина по нормали.
   */
  let point: [number, number] = [0, 0];
  let prevDir: [number, number] = [1, 0];

  for (let i = 0; i < input.runs.length; i += 1) {
    const lengthM = input.runs[i].lengthMm / MM_IN_M;

    /*
     * Каждый следующий ряд поворачивает на прямой угол в одну сторону:
     * А вдоль +x, Б вдоль +z, В обратно вдоль −x. Для П-образной это
     * даёт две стойки и перемычку между ними.
     */
    const rotationYDeg = -90 * i;
    const a = (rotationYDeg * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);

    /*
     * Куда идёт длина ряда и куда смотрят его фасады — в мировых осях.
     * Стена за спиной: начало координат ряда лежит на глубину ВПЕРЁД от
     * точки у стены, потому что локальный ноль по z — это фасад.
     */
    const dir: [number, number] = [cos, -sin];
    const facade: [number, number] = [sin, cos];

    if (i === 0) {
      // Первый ряд стоит по центру: от −L/2 до +L/2, фасады на z = 0.
      point = [-lengthM / 2, -depthM];
    } else {
      const endM = gapOf(i - 1, 'end');
      const startM = gapOf(i, 'start');
      point = [
        point[0] + endM * prevDir[0] + startM * dir[0],
        point[1] + endM * prevDir[1] + startM * dir[1],
      ];
    }

    places.push({
      xM: point[0] + depthM * facade[0],
      zM: point[1] + depthM * facade[1],
      rotationYDeg,
    });

    // Конец ряда у стены — начало отсчёта для следующего угла.
    point = [point[0] + lengthM * dir[0], point[1] + lengthM * dir[1]];
    prevDir = dir;
  }

  return places;
}

/**
 * СКОЛЬКО ЗАНЯТО В УГЛУ — одно число на раскладку и на сцену.
 *
 * Угловой модуль — квадрат 900 × 900: он занимает 900 и вдоль своей
 * стены, и вдоль соседней. Фальш-панель угол не занимает: там мёртвая
 * зона глубиной ряда плюс сама панель.
 */
export function cornerLostMm(
  solution: CornerJoin['solution'],
  depthMm: number,
  /** Школа цеха: размеры угла — её настройка (слой 55). Пусто — типовые. */
  production?: ProductionSettings,
): number {
  const sizes = cornerSizesOf(production);
  return solution === 'corner_module' ? sizes.lowerLMm : depthMm + sizes.falsePanelMm;
}

/**
 * ФАЛЬШ-ПАНЕЛЬ НИЖНЕГО УГЛА — ШИРИНА ДЕТАЛИ.
 *
 * Слепой угол: между фасадом владельца и первым модулем соседа полоса в
 * ширину панели — её и закрывает панель (`CORNER.falsePanelMm` по
 * умолчанию, настройка организации в 50–100 мм).
 *
 * Г-образный модуль фальш-панели НЕ имеет (слой 55). До этого слоя он
 * рисовался прямоугольником 900 × глубина, а полосу 340 мм перед его
 * фасадом закрывала панель — то есть вторая нога модуля жила в раскрое
 * плоской деталью фасада. Теперь нога — корпус и свой фасад, и панели
 * там нет.
 */
export function cornerFillerMm(
  solution: CornerJoin['solution'],
  depthMm: number,
  production?: ProductionSettings,
): number {
  if (solution === 'corner_module') return 0;
  return Math.max(0, cornerLostMm(solution, depthMm, production) - depthMm);
}

/*
 * `cornerBandMm` ПЕРЕЕХАЛА В `corner.ts` (слой 55): её спрашивают
 * столешница, цоколь, фартук и ниша, а столешнице незачем тянуть за
 * собой сборку композиции. Отсюда она отдаётся под прежним именем — те
 * же места и приёмки зовут её как раньше.
 */
export { cornerBandMm } from './corner';

const MM_IN_M = 1000;
