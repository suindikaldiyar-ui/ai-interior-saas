import { buildRun } from './layout';
import { CORNER, CORNER_SIZE_MM, MIN_WIDTH, moduleAppliances } from './modules';
import { compositionFingerprint } from './fingerprint';
import { assertCornerFits } from './invariants';
import { rowStandardDepthMm } from './fill';
import type { ProductionSettings } from '@/types/catalog';
import type {
  ApplianceKind,
  CommPoint,
  Composition,
  CompositionKind,
  CornerJoin,
  Opening,
  Run,
  RunRequirements,
  RunSegment,
  ZoneKind,
} from '@/types/millwork';

/* ─────────────────────────  Форма композиции  ───────────────────────── */

export type RunShape = 'linear' | 'corner_l';

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
  lengthMm: number;
  moduleCount: number;
  /** Длины сторон угла, если композиция угловая. */
  sidesMm?: [number, number];
}): string {
  if (input.shape === 'corner_l') {
    const [a, b] = input.sidesMm ?? [input.lengthMm, input.lengthMm];
    return `ФОРМА ГАРНИТУРА: Г-ОБРАЗНАЯ, ДВА РЯДА ПОД ПРЯМЫМ УГЛОМ.
Стена А (слева, ${a} мм) и стена Б (справа, ${b} мм) сходятся в углу,
гарнитур идёт по обеим без разрыва.
Модулей ровно ${input.moduleCount}, они распределены по двум рядам.
Прямой одиночный ряд недопустим. Третьего ряда нет.
Островов, полуостровов и барных стоек нет.`;
  }

  return `ФОРМА ГАРНИТУРА: ПРЯМОЙ ОДИНОЧНЫЙ РЯД.
Гарнитур стоит ВДОЛЬ ОДНОЙ СТЕНЫ, от 0 до ${input.lengthMm} мм, и нигде не загибается.
Углов нет. Второго ряда нет. На перпендикулярных стенах мебели нет вовсе —
там пустая стена.
Модулей ровно ${input.moduleCount}, все в один ряд слева направо.
Островов, полуостровов и барных стоек нет.`;
}

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
const SEGMENT_LABELS = ['Стена А', 'Стена Б', 'Стена В'];

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

  if (walls.length < need) {
    throw new Error(
      `Форма «${kind}» требует ${need} стен, а в замере их ${walls.length}. ` +
        'Собирать угол по одной стене нельзя: вторая половина будет выдуманной.',
    );
  }

  /*
   * Каждый следующий ряд теряет глубину предыдущего. Считаем это ДО
   * раскладки: buildRun должен получить уже полезную длину, иначе он
   * честно разложит модули по всей стене — и они окажутся в углу
   * поверх соседних.
   */
  const solution: CornerJoin['solution'] = requirements.cornerSolution ?? 'false_panel';

  const usable = walls.map((wall, i) => {
    if (i === 0) return Math.max(0, Math.round(wall.lengthMm));

    /*
     * Сколько второй ряд теряет в углу.
     *
     * Угловой модуль — квадрат 900 × 900: он занимает 900 и вдоль своей
     * стены, и вдоль соседней. Считать здесь глубину ряда (560) значит
     * налезть на него на 340 мм — ровно та ошибка, которую замечают
     * на монтаже, когда мебель уже распилена.
     *
     * Фальш-панель угол не занимает: там мёртвая зона глубиной ряда,
     * плюс сама панель, отодвигающая фасад от чужого фасада.
     */
    const lost = cornerLostMm(solution, depthMm);

    const value = Math.round(wall.lengthMm) - lost;

    assertCornerFits({
      label: SEGMENT_LABELS[i] ?? `Стена ${i + 1}`,
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
     * Угловой модуль стоит В УГЛУ и принадлежит первому ряду: он и есть
     * доступ в угол. При фальш-панели угол остаётся мёртвой зоной, и
     * модуля там нет вовсе.
     */
    const cornerAt =
      solution === 'corner_module' && i < walls.length - 1 ? ('end' as const) : null;

    const run = buildRun({
      id: `${input.id ?? 'composition'}-${i}`,
      lengthMm: usable[i],
      ceilingHeightMm,
      requirements: { ...requirements, appliances: perSegment[i] },
      openings: wall.openings ?? [],
      comms: input.comms ?? [],
      cornerAt,
      production: input.production,
      // Стена замера едет в ряд: она же идентичность его модулей.
      wallId: wall.id,
    });

    warnings.push(...run.warnings.map((w) => `${SEGMENT_LABELS[i]}: ${w}`));

    return {
      id: `seg-${i}`,
      label: SEGMENT_LABELS[i] ?? `Стена ${i + 1}`,
      wallId: wall.id,
      angleDeg: i === 0 ? 0 : 90,
      wallLengthMm: Math.round(wall.lengthMm),
      appliances: perSegment[i],
      run,
    };
  });

  const corners: CornerJoin[] = segments.slice(1).map((segment, i) => ({
    fromSegmentId: segments[i].id,
    toSegmentId: segment.id,
    solution,
    falsePanelMm: solution === 'false_panel' ? CORNER.falsePanelMm : undefined,
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
      label: SEGMENT_LABELS[0],
      wallId,
      angleDeg: 0,
      wallLengthMm: run.lengthMm,
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
  /** Решение угла: от него зависит, сколько занято в углу. */
  solution: CornerJoin['solution'];
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
  const lostM = cornerLostMm(input.solution, depthMm) / MM_IN_M;
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
): number {
  return solution === 'corner_module' ? CORNER_SIZE_MM : depthMm + CORNER.falsePanelMm;
}

const MM_IN_M = 1000;
