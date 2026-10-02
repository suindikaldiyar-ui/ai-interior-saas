import { buildRun } from './layout';
import { CORNER, CORNER_SIZE_MM, MIN_WIDTH, moduleAppliances } from './modules';
import { compositionFingerprint } from './fingerprint';
import { assertCornerFits } from './invariants';
import { rowStandardDepthMm } from './fill';
import { wallLabel } from './walls';
import { cornerSizesOf } from './shop';
import {
  choiceFromSolution,
  cornerChoicesOf,
  cornerGeometry,
  cornerOfSegment,
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
   */
  walls?: Partial<Record<ApplianceKind, number>>,
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
    const chosen = walls?.[appliance];
    const at2 = chosen !== undefined && chosen >= 0 && chosen < out.length ? chosen : at;
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
  const choices = cornerChoicesOf(requirements, walls.length - 1);

  const usable = walls.map((wall, i) => {
    if (i === 0) return Math.max(0, Math.round(wall.lengthMm));

    /*
     * Сколько второй ряд теряет в углу.
     *
     * Г-образный модуль — квадрат: он занимает свою сторону и вдоль своей
     * стены, и вдоль соседней. Считать здесь глубину ряда (560) значит
     * налезть на него на 340 мм — ровно та ошибка, которую замечают
     * на монтаже, когда мебель уже распилена.
     *
     * Слепой угол: там глубина соседнего ряда плюс фальш-панель,
     * отодвигающая фасад от чужого фасада. Считает `cornerGeometry`.
     */
    const lost = cornerGeometry(choices[i - 1], requirements.zone, input.production).lostMm;

    const value = Math.round(wall.lengthMm) - lost;

    assertCornerFits({
      label: wallLabel(i),
      wallLengthMm: Math.round(wall.lengthMm),
      lostMm: lost,
      minWidthMm: MIN_WIDTH,
    });

    return value;
  });

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

  const perSegment = splitAppliances(
    requirements.appliances,
    usable,
    requirements.applianceWalls,
  );

  const segments: RunSegment[] = walls.map((wall, i) => {
    /*
     * Коммуникации ЭТОЙ стены, пересчитанные от начала ряда. Чужие сюда
     * не попадают вовсе: у коммуникации есть своя стена, и спрашивают
     * именно её.
     */
    const lostHere = Math.round(wall.lengthMm) - usable[i];
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
      warnings.push(
        `${wallLabel(i)}: точка «${COMM_TITLE[comm.kind]}» на ${comm.fromCornerMm} мм от угла ` +
          `попала в угол — там стоит соседний ряд. Мебель этой стены начинается ` +
          `с ${lostHere} мм, и привязать к этой точке её нельзя.`,
      );
    }

    /*
     * РОЛЬ РЯДА В ЕГО УГЛАХ — ДО РАСКЛАДКИ, А НЕ ПОСЛЕ.
     *
     * Ряд-владелец собирает угловой модуль в своём конце (Г-образный или
     * слепой), ряд после угла начинает верхний ряд раньше нуля — и всё
     * это решает раскладка. Кладёт роль та же функция, что и шов экрана
     * (`cornerOfSegment`), поэтому у стены А, собранной из вариантов,
     * угол тот же, что у композиции.
     */
    const corner: RunCorner | undefined = cornerOfSegment(choices, i, walls.length);
    const upperFromMm = corner?.dock
      ? (() => {
          const g = cornerGeometry(corner.dock!, requirements.zone, input.production);
          return g.upperStartMm - g.lostMm;
        })()
      : 0;
    /*
     * Проёмы этой стены, пересчитанные от начала РЯДА: угол занят
     * соседним рядом, и отметки замера сдвинуты на него. У ряда после
     * угла остаётся и полоса перед нулём, куда заходит его верхний ряд:
     * окно там рвёт верхний ряд так же, как на остальной стене.
     */
    const openings = openingsOnRun(wall.openings, lostHere, usable[i], Math.min(0, upperFromMm));

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
    const dockOnly = Boolean(corner?.dock) && !corner?.own;
    const tallSide = dockOnly
      ? requirements.tallSide === 'right'
        ? ('left' as const)
        : ('right' as const)
      : requirements.tallSide;

    const run = buildRun({
      id: `${input.id ?? 'composition'}-${i}`,
      lengthMm: usable[i],
      ceilingHeightMm,
      requirements: { ...requirements, appliances: perSegment[i], tallSide },
      openings,
      comms: wallComms.kept,
      corner,
      production: input.production,
      // Стена замера едет в ряд: она же идентичность его модулей.
      wallId: wall.id,
    });

    warnings.push(...run.warnings.map((w) => `${wallLabel(i)}: ${w}`));

    return {
      id: `seg-${i}`,
      label: wallLabel(i),
      wallId: wall.id,
      angleDeg: i === 0 ? 0 : 90,
      wallLengthMm: Math.round(wall.lengthMm),
      appliances: perSegment[i],
      comms: wallComms.kept,
      openings,
      run,
    };
  });

  /*
   * УГЛЫ КОМПОЗИЦИИ: владелец — стена ДО угла по обходу, одно поле.
   *
   * Фальш-панель и угол раскрытия петли — из того же выбора и той же
   * школы цеха, что урезали длину: второго расчёта занятого в углу нет.
   */
  const sizes = cornerSizesOf(input.production);
  const corners: CornerJoin[] = segments.slice(1).map((segment, i) => ({
    fromSegmentId: segments[i].id,
    toSegmentId: segment.id,
    ownerSegmentId: segments[i].id,
    choice: { ...choices[i] },
    solution: solutionOf(choices[i]),
    falsePanelMm: choices[i].lower === 'blind' ? sizes.falsePanelMm : undefined,
    hingeAngleDeg: CORNER.hingeAngleDeg,
    frontGapMm: CORNER.frontGapMm,
  }));

  return {
    kind,
    segments,
    corners,
    fingerprint: compositionFingerprint({ segments, corners }),
    warnings,
  };
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
): { fromCornerMm: number; widthMm: number } | null {
  const width = mark.widthMm ?? 0;
  const from = mark.fromCornerMm - lostMm;

  if (width === 0) {
    if (from < fromMm || from > lengthMm) return null;
    return { fromCornerMm: Math.round(from), widthMm: 0 };
  }

  const clippedFrom = Math.max(fromMm, from);
  const clippedTo = Math.min(lengthMm, from + width);
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
): Opening[] {
  const moved: Opening[] = [];

  for (const opening of openings ?? []) {
    const at = markOnRun(opening, lostMm, lengthMm, fromMm);
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
  /** Ряды композиции слева направо: их ПОЛЕЗНЫЕ длины, а не длины стен. */
  runs: Pick<Run, 'lengthMm'>[];
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
  const lostOf = (corner: number) =>
    cornerGeometry(choices[corner] ?? choiceFromSolution(input.solution), input.zone, input.production).lostMm /
    MM_IN_M;
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
   *   P(i+1) = E(i) + занято_в_углу · направление(i+1)
   * Отсюда и начало координат ряда: P минус глубина по нормали.
   */
  let point: [number, number] = [0, 0];

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
      const lostM = lostOf(i - 1);
      point = [point[0] + lostM * dir[0], point[1] + lostM * dir[1]];
    }

    places.push({
      xM: point[0] + depthM * facade[0],
      zM: point[1] + depthM * facade[1],
      rotationYDeg,
    });

    // Конец ряда у стены — начало отсчёта для следующего угла.
    point = [point[0] + lengthM * dir[0], point[1] + lengthM * dir[1]];
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
