import {
  MODULE_VARIANTS,
  applyVariant,
  currentVariant,
  variantFitsWidth,
  variantsForModule,
  variantsToAdd,
} from './moduleVariants';
import type { ModuleVariantSpec } from './moduleVariants';
import { STANDARD_WIDTHS, MAX_WIDTH, MIN_WIDTH } from './modules';
import { applyOps } from './ops';
import { moduleById, rowOfModule, type RunRow } from './selection';
import { moduleCarcassHeightMm } from './fill';
import { rowSpansOfRun } from './layout';
import type {
  MillworkOp,
  Module,
  ModuleVariantKind,
  Opening,
  Run,
  RunRequirements,
} from '@/types/millwork';

/**
 * БИБЛИОТЕКА МОДУЛЕЙ: ЧТО МОЖЕТ СТОЯТЬ НА ЭТОМ МЕСТЕ.
 *
 * «Модули должны быть готовы: нажал — сразу поменялось» — так говорит
 * компания, которая делает только нестандартные кухни. Шаблон ей не
 * нужен вовсе: у всех квартиры разные, и ряд собирается на месте, из
 * готовых модулей.
 *
 * Отсюда правило этого файла: НИЧЕГО НОВОГО ОН НЕ ПРИДУМЫВАЕТ. Типы
 * модулей — те, что уже умеет движок (`MODULE_VARIANTS`); ширины — те,
 * что уже стоят стандартом (`STANDARD_WIDTHS`); цена — та, что считает
 * смета. Библиотека только перебирает сочетания и спрашивает движок,
 * встанет ли каждое.
 *
 * ПРОВЕРКА ВСТАВАНИЯ — НЕ ВТОРАЯ ФОРМУЛА. Она идёт тем же `applyOps`,
 * которым правка и применится: вариант собирается операцией, и если
 * движок отказал — карточка серая, а причина взята из его же слов.
 * Своего «влезет ли» здесь нет и быть не может: оно разошлось бы с
 * настоящим на первой же правке школы цеха.
 *
 * ШИРИНА — ЧАСТЬ КАРТОЧКИ, А НЕ УСЛОВИЕ ОТБОРА. `variantsForModule`
 * отвечает на вопрос «чем может быть модуль ЭТОЙ ширины» и отсекает
 * карго в месте на 600 мм. Карточка «Карго 300» при этом законна: она
 * меняет и начинку, и ширину одной операцией. Поэтому вопрос задаётся
 * ПО КАЖДОЙ ШИРИНЕ отдельно — той же функции, с пробным модулем этой
 * ширины. Своего отбора по ширине здесь нет.
 */

/** Одна карточка библиотеки: что поставить и во что это обойдётся. */
export type LibraryCard = {
  /** Ключ карточки: вариант и ширина. По нему же идёт кэш картинки. */
  key: string;
  spec: ModuleVariantSpec;
  /**
   * Ширина, которая ПОЛУЧИЛАСЬ у движка, а не запрошенная.
   *
   * `add_module` в нижнем ряду сажает ширину на стандарт
   * (`snapToStandard`), и карточка, обещающая 630 мм там, где встанет
   * 600, — это обещание, которого движок не давал.
   */
  widthMm: number;
  /** Высота корпуса — она же высота картинки. */
  heightMm: number;
  /** Операции, которыми карточка применяется. */
  ops: MillworkOp[];
  /** Так стоит на месте прямо сейчас. */
  current: boolean;
  /** Почему нажать нельзя. Пусто — можно. */
  refusal?: string;
  /** Модуль, который получится: по нему рисуется картинка. */
  preview: Module | null;
};

/**
 * ШИРИНЫ, В КОТОРЫХ ПЕРЕБИРАЕТСЯ МЕСТО.
 *
 * Стандартный ряд плюс ТЕКУЩАЯ ширина места: раскладка выдаёт и 630 мм,
 * и предложить там только круглые числа значит заставить человека
 * менять ширину, которую он не просил.
 *
 * Физические границы вариантов здесь не проверяются вовсе — на них
 * отвечает `variantsForModule`, и второго списка «карго не шире 400»
 * не появляется.
 */
export function widthsFor(currentMm: number): number[] {
  const list = [...STANDARD_WIDTHS, Math.round(currentMm)].filter(
    (mm) => mm >= MIN_WIDTH && mm <= MAX_WIDTH,
  );

  return Array.from(new Set(list)).sort((a, b) => a - b);
}

/** Пустое место ряда: откуда, какой ширины и в каком ряду. */
export type LibraryGap = { fromMm: number; widthMm: number; row: RunRow };

/** Что строит карточки: ряд, место и ставки для цены. */
export type LibraryInput = {
  run: Run;
  requirements: RunRequirements;
  openings: Opening[];
  /** Выбранный модуль. Пусто — библиотека для пустого места. */
  moduleId: string | null;
  /** Свободное место, если модуля нет: отметка и ширина промежутка. */
  gap?: { fromMm: number; widthMm: number; row?: RunRow } | null;
  /**
   * Глубина комнаты — тот же вход `applyOps`, что у правки на экране:
   * по ней движок отказывает, если ряд съедает проход (слой 35).
   * Карточка, проверенная без неё, пообещала бы то, чего нажатие не
   * сделает.
   */
  roomDepthMm?: number;
};

/**
 * ПОЧЕМУ У ЭТОГО МЕСТА БИБЛИОТЕКИ НЕТ ВОВСЕ.
 *
 * Пустая панель читается как «не загрузилось», поэтому место, которое
 * не выбирают, объясняет себя СЛОВАМИ — и объясняет МИР, а не запрет
 * (ловушка 147). Возвращает `null`, если библиотека есть.
 */
export function libraryLock(input: LibraryInput): string | null {
  const unit = moduleById(input.run, input.moduleId);

  if (!unit) {
    const gap = input.gap;
    if (!gap) return null;

    if (gap.widthMm < MIN_WIDTH) {
      return `Здесь ${gap.widthMm} мм: самый узкий корпус — ${MIN_WIDTH} мм, он сюда не встанет.`;
    }

    return null;
  }

  if (unit.appliance || unit.column) {
    return 'Здесь стоит прибор: его габарит и начинку диктует сам прибор. Менять — в составе.';
  }

  if (unit.kind === 'filler') {
    return 'Доборная планка закрывает остаток ряда — это вынужденная деталь, а не выбор.';
  }

  /*
   * КЛАДОВКА НАД КОЛОННОЙ СОБИРАЕТСЯ САМА.
   *
   * Её высота — это то, что осталось над холодильником (слой 38), и
   * движок пересобирает полосу на каждой правке. Предложить там замену
   * значит показать шестьдесят карточек, из которых не встанет ни одна:
   * так и было замерено — 67 карточек, доступных 0.
   */
  if (rowOfModule(input.run, unit.id)?.row === 'storage') {
    return 'Кладовка над колонной собирается сама: её высота — это то, что осталось над холодильником.';
  }

  return null;
}

/**
 * КАРТОЧКИ ДЛЯ ЭТОГО МЕСТА.
 *
 * Занятое место спрашивает `variantsForModule` — тот же ряд, те же
 * правила зоны и места (карусель только в углу, сушилка только над
 * мойкой). Пустое спрашивает ту же функцию пробным модулем ряда, а на
 * вовсе пустой стене — `variantsToAdd`, у которой мерка другая: модуля
 * там ещё нет.
 */
export function libraryCards(input: LibraryInput): LibraryCard[] {
  if (libraryLock(input)) return [];

  const { run, requirements, moduleId } = input;
  const zone = requirements.zone ?? run.zone ?? 'kitchen';
  const unit = moduleById(run, moduleId);

  const raw = unit ? occupiedCards(input, unit, zone) : gapCards(input, zone);

  return order(dedupe(raw));
}

/** Карточки для занятого места: чем может стать этот модуль. */
function occupiedCards(
  input: LibraryInput,
  unit: Module,
  zone: NonNullable<RunRequirements['zone']>,
): LibraryCard[] {
  const now = currentVariant(unit);

  return widthsFor(unit.widthMm).flatMap((widthMm) =>
    /*
     * Пробный модуль — это ВОПРОС, а не запись: он никуда не уходит,
     * а настоящий модуль сделает `applyOps`. Поля берутся у того, что
     * стоит на месте: выдумывать их здесь значило бы завести второй
     * способ собрать модуль.
     */
    variantsForModule({ ...unit, widthMm }, input.run, zone)
      .filter((spec) => !spec.impliesAppliance)
      .map((spec) =>
        card({
          ...input,
          spec,
          widthMm,
          current: spec.kind === now && widthMm === unit.widthMm,
          ops: [
            {
              op: 'replace_module',
              moduleId: unit.id,
              kind: unit.kind,
              variant: spec.kind,
              widthMm,
            },
          ],
          sample: unit,
        }),
      ),
  );
}

/** Карточки для пустоты: что встанет в этот промежуток. */
function gapCards(
  input: LibraryInput,
  zone: NonNullable<RunRequirements['zone']>,
): LibraryCard[] {
  return gapCandidates(input, zone).map((make) => make());
}

/**
 * ВСТАЁТ ЛИ В ЭТУ ПУСТОТУ ХОТЬ ЧТО-НИБУДЬ — спрашивается у движка.
 *
 * Участки висящего ряда отвечают, где ряд МОЖЕТ стоять, но не всё
 * знают: антресоль под выступом на потолке движок снимает уже ПОСЛЕ
 * укладки (её низ выше низа ригеля). Замерено на демо-стене: полоса
 * антресоли 2400…3800 проходит по участкам целиком, а не встаёт туда
 * ни одна из карточек — под коробом вентиляции антресоли нет.
 *
 * Своей копии правила «под ригелем антресоли нет» здесь не заводится:
 * пустота показывается, только если движок принял в неё хотя бы одну
 * карточку. Перебор кончается на первой принятой — у живой пустоты это
 * одна операция.
 */
function gapAccepts(
  input: LibraryInput,
  zone: NonNullable<RunRequirements['zone']>,
): boolean {
  for (const make of gapCandidates(input, zone)) {
    if (!make().refusal) return true;
  }
  return false;
}

/** Карточки пустоты — ЛЕНИВО: каждую собирает движок, когда её спросят. */
function gapCandidates(
  input: LibraryInput,
  zone: NonNullable<RunRequirements['zone']>,
): (() => LibraryCard)[] {
  const gap = input.gap;
  if (!gap || gap.widthMm < MIN_WIDTH) return [];

  const row = gap.row ?? 'base';
  /* Сосед СЛЕВА — по нему видно, что это за ряд. Место — из пустоты. */
  const after = afterOf(input.run, row, gap.fromMm);
  /*
   * Висящий ряд бывает ПУСТЫМ (свободная сборка) — соседа нет, и ряд
   * называет пробный модуль: вид «верхний», у антресоли её секция. Это
   * ВОПРОС к `variantsForModule`, а не модуль: в ряд его не пишут, модуль
   * собирает движок по `add_module.row`.
   */
  const sample: Module | null =
    after ??
    modulesOfRow(input.run, row)[0] ??
    (row === 'upper' || row === 'mezzanine'
      ? ({
          id: `пробный:${row}`,
          kind: 'upper',
          widthMm: gap.widthMm,
          offsetMm: gap.fromMm,
          frontType: 'door',
          doorCount: 1,
          drawerCount: 0,
          isFiller: false,
          label: '',
          section: row === 'mezzanine' ? 'mezzanine' : undefined,
        } as Module)
      : null);

  return widthsFor(gap.widthMm)
    .filter((widthMm) => widthMm <= gap.widthMm)
    .flatMap((widthMm) => {
      const specs = sample
        ? /*
           * У ряда есть СОСЕД, и по нему видно, что это за ряд: вид,
           * секция, высота. Пробуем его же — тем самым вопросом, каким
           * спрашивают занятое место.
           */
          variantsForModule(
            {
              ...sample,
              offsetMm: gap.fromMm,
              widthMm,
              appliance: undefined,
              column: undefined,
              variant: undefined,
              front: undefined,
              fill: undefined,
            },
            input.run,
            zone,
          )
        : /*
           * Стена пустая: соседа нет, и мерка у движка своя. Ширина
           * проверяется ТЕМ ЖЕ правилом, что у занятого места: без него
           * пустая стена предлагала «Высокое карго 1200» при пределе
           * 600, и движок его ставил — размер, которого не бывает.
           */
          variantsToAdd(zone, widthMm)
            .map((entry) => entry.spec)
            .filter((spec) => variantFitsWidth(spec, widthMm));

      return specs
        .filter((spec) => !spec.impliesAppliance)
        .map((spec) => () =>
          card({
            ...input,
            spec,
            widthMm,
            current: false,
            ops: [
              {
                op: 'add_module',
                kind: spec.row === 'tall' ? 'tall' : spec.row === 'upper' ? 'upper' : 'base',
                widthMm,
                variant: spec.kind,
                /*
                 * НА ОТМЕТКУ ПУСТОТЫ — ВСЕГДА.
                 *
                 * «За соседом» не годится дважды. В висящем ряду сосед
                 * слева может стоять ПО ТУ СТОРОНУ ОКНА — модуль въехал
                 * бы в окно, и движок честно отказал бы: так снятый за
                 * окном шкаф нельзя было поставить обратно. В нижнем ряду
                 * поиск места молча уводит модуль в другую пустоту, если
                 * в показанной он не помещается.
                 *
                 * В висящем ряду ряд называется по имени (`row`), место
                 * задаёт отметка.
                 */
                atMm: gap.fromMm,
                /* Висящий ряд называется по имени: соседа может не быть. */
                ...(row === 'upper' || row === 'mezzanine' ? { row } : {}),
              },
            ],
            sample: null,
          }),
        );
    });
}

/**
 * СОСЕД СЛЕВА ОТ ПУСТОТЫ. Пусто — пустота в начале ряда.
 *
 * Строго: модуль, который КОНЧАЕТСЯ не правее начала пустоты. Вернуть
 * сюда «любой модуль ряда» было бы удобно и неверно — `add_module`
 * ставит ЗА названным соседом, и модуль уехал бы в другое место ряда.
 */
function afterOf(run: Run, row: RunRow, fromMm: number): Module | null {
  let best: Module | null = null;

  for (const unit of modulesOfRow(run, row)) {
    if (unit.offsetMm + unit.widthMm <= fromMm) {
      if (!best || unit.offsetMm > best.offsetMm) best = unit;
    }
  }

  return best;
}

/** Модули ряда: тем же разбором, каким их находит жест на схеме. */
function modulesOfRow(run: Run, row: RunRow): Module[] {
  if (row === 'base') return run.modules;

  const all = run.upperSegments.flatMap((segment) => segment.modules);
  const sample = all.find((unit) => rowOfModule(run, unit.id)?.row === row);

  return sample ? (rowOfModule(run, sample.id)?.modules ?? []) : [];
}

/** Собрать одну карточку и спросить движок, встанет ли она. */
function card(
  input: LibraryInput & {
    spec: ModuleVariantSpec;
    widthMm: number;
    current: boolean;
    ops: MillworkOp[];
    sample: Module | null;
  },
): LibraryCard {
  const { run, requirements, openings, spec, widthMm, current, ops, sample } = input;
  const key = `${spec.kind}:${widthMm}`;
  /* Ряд места: у занятого — ряд модуля, у пустоты — её собственный. */
  const row: RunRow =
    (sample ? rowOfModule(run, sample.id)?.row : input.gap?.row) ?? 'base';

  /*
   * ВСТАНЕТ ЛИ — СПРАШИВАЕМ ДВИЖОК, А НЕ СЧИТАЕМ САМИ.
   *
   * Операция применяется «вхолостую»: ряд, который получится, нам и
   * нужен — по нему же считается цена. Отказ движок оформляет словами
   * и числом, и в карточку идёт его текст, а не наш пересказ.
   */
  const next = tryRun(run, requirements, openings, ops, input.roomDepthMm);

  if (!next.ok) {
    return { key, spec, widthMm, heightMm: 0, ops, current, refusal: next.why, preview: null };
  }

  const preview = pickPreview(run, next.run, sample, spec.kind);
  /* Ширина карточки — та, что получилась у движка, а не запрошенная. */
  const made = preview?.widthMm ?? widthMm;

  /*
   * СОСЕДИ СТОЯТ, ГДЕ СТОЯЛИ.
   *
   * Библиотека меняет ОДИН модуль. Движок же вправе на том же нажатии
   * двигать соседей: по готовому решению `rebalance` сводит ряд со
   * стеной (ловушка 29), в висящем ряду `placeInSpans` толкает правых
   * внутри участка (ловушка 411). Для ручки ширины это правильно — её
   * тянут, глядя на соседей. Для карточки — нет: замерено на демо-ряду,
   * 44 из 48 «доступных» карточек у модуля на 1200 сдвигали мойку с
   * 1650 на 1500 мм — прочь от вывода воды — и дописывали в хвост ряда
   * доборную планку, которую никто не просил.
   *
   * Поэтому карточка, после которой соседи поехали, серая, и отказ
   * называет число. Считается по РЕЗУЛЬТАТУ движка, а не своей
   * арифметикой: второго «сдвинется ли» здесь нет.
   */
  const moved = neighboursMoved(run, next.run, row, sample?.offsetMm ?? null, preview);
  if (moved) {
    const template = requirements.mode !== 'free' && row === 'base';
    return {
      key: `${spec.kind}:${made}`,
      spec,
      widthMm: made,
      heightMm: 0,
      ops,
      current,
      refusal:
        `${made} мм ${moved}.` +
        (template
          ? ' Ряд по готовому решению сходится со стеной — ширины меняются в своей сборке.'
          : ' Замена соседей не двигает — ширину тянут за границу модуля.'),
      preview: null,
    };
  }

  return {
    key: `${spec.kind}:${made}`,
    spec,
    widthMm: made,
    heightMm: preview ? moduleCarcassHeightMm(preview, next.run) : 0,
    ops,
    current,
    preview,
  };
}

/**
 * ЧТО СТАЛО С СОСЕДЯМИ: `null` — ничего, иначе словами и числом.
 *
 * Соседи сравниваются МЕСТАМИ (отметка и ширина), а не идентификаторами:
 * идентификатор выводится из позиции (ловушка 291), и сдвинутый сосед
 * получает новый — по id он выглядел бы «удалённым и добавленным».
 * Своё место из сравнения исключается с обеих сторон: у замены оно на
 * прежней отметке, у вставки его раньше не было.
 */
function neighboursMoved(
  before: Run,
  after: Run,
  row: RunRow,
  placeMm: number | null,
  made: Module | null,
): string | null {
  const spots = (list: Module[], skipMm: number | null) =>
    list
      .filter((unit) => unit.offsetMm !== skipMm)
      .map((unit) => ({ at: unit.offsetMm, width: unit.widthMm }))
      .sort((a, b) => a.at - b.at);

  const was = spots(modulesOfRow(before, row), placeMm);
  const now = spots(modulesOfRow(after, row), made?.offsetMm ?? placeMm);

  if (now.length > was.length) return `добавит в ряд модулей: ${now.length - was.length}`;
  if (now.length < was.length) return `уберёт из ряда модулей: ${was.length - now.length}`;

  let shift = 0;
  for (let i = 0; i < was.length; i += 1) {
    shift = Math.max(
      shift,
      Math.abs(now[i].at - was[i].at),
      Math.abs(now[i].width - was[i].width),
    );
  }

  return shift > 0 ? `сдвинет соседей на ${shift} мм` : null;
}

/** Ряд после операций либо причина отказа. */
export function tryRun(
  run: Run,
  requirements: RunRequirements,
  openings: Opening[],
  ops: MillworkOp[],
  roomDepthMm?: number,
): { ok: true; run: Run } | { ok: false; why: string } {
  try {
    const next = applyOps({ run, requirements, openings, ops, roomDepthMm });
    if (next.warnings.length > 0) return { ok: false, why: next.warnings[0] };
    return { ok: true, run: next };
  } catch (error) {
    /*
     * Инвариант ряда — это не «не влезло», а «так собрать нельзя».
     * Текст исключения написан для человека там же, где и брошен.
     */
    return { ok: false, why: error instanceof Error ? error.message : 'Так собрать нельзя.' };
  }
}

/**
 * МОДУЛЬ, КОТОРЫЙ ПОЛУЧИЛСЯ: ЕГО И РИСУЕМ.
 *
 * У замены он стоит на прежней отметке — `replace_module` её сохраняет.
 * У добавления его узнают по тому, что раньше такого идентификатора не
 * было: искать по ширине нельзя, соседей той же ширины в ряду сколько
 * угодно.
 */
function pickPreview(
  before: Run,
  next: Run,
  sample: Module | null,
  kind: ModuleVariantKind,
): Module | null {
  const all = (run: Run): Module[] => [
    ...run.modules,
    ...run.upperSegments.flatMap((segment) => segment.modules),
  ];

  const after = all(next);

  if (sample) {
    const sameSpot = after.find((unit) => unit.offsetMm === sample.offsetMm);
    if (sameSpot && currentVariant(sameSpot) === kind) return sameSpot;
  }

  const had = new Set(all(before).map((unit) => unit.id));
  return after.find((unit) => !had.has(unit.id)) ?? null;
}

/**
 * ОДНА КАРТОЧКА НА СОЧЕТАНИЕ.
 *
 * Разные запрошенные ширины могут дать одну и ту же настоящую: движок
 * сажает ширину на стандарт. Два одинаковых «Дверца 600» подряд — это
 * не выбор, а впечатление, что панель сломалась.
 */
function dedupe(cards: LibraryCard[]): LibraryCard[] {
  const seen = new Map<string, LibraryCard>();

  for (const card of cards) {
    const was = seen.get(card.key);
    /* Из двух одинаковых остаётся та, которая встаёт. */
    if (!was || (was.refusal && !card.refusal) || card.current) seen.set(card.key, card);
  }

  return Array.from(seen.values());
}

const VARIANT_ORDER = Object.keys(MODULE_VARIANTS) as ModuleVariantKind[];

/**
 * ЧТО ВИДНО ПЕРВЫМ.
 *
 * Доступные выше серых: на верхнем ряду замерено 48 карточек, из
 * которых встают 4 — четыре нужные не должны лежать под сорока
 * четырьмя, которые не встанут. Текущая стоит первой: с ней сравнивают.
 */
function order(cards: LibraryCard[]): LibraryCard[] {
  const rank = (card: LibraryCard): number => (card.current ? 0 : card.refusal ? 2 : 1);

  return [...cards].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);

    const byKind = VARIANT_ORDER.indexOf(a.spec.kind) - VARIANT_ORDER.indexOf(b.spec.kind);
    return byKind !== 0 ? byKind : a.widthMm - b.widthMm;
  });
}

/**
 * НАСКОЛЬКО ДОРОЖЕ ИЛИ ДЕШЕВЛЕ.
 *
 * Разница считается НАСТОЯЩИМ пересчётом: смета до и после, той же
 * функцией, что считает итог внизу экрана. Прикидка по прайсу
 * разошлась бы с этим итогом, а клиент видит оба числа сразу
 * (ловушка 160).
 *
 * ИТОГ СЧИТАЕТ ВЫЗЫВАЮЩИЙ, А НЕ БИБЛИОТЕКА. У `buildEstimate` восемь
 * аргументов: снятые галочки, школа цеха, фрезеровка, декоры корпуса.
 * Позови её здесь «покороче» — и карточка пообещает одно, а итог внизу
 * экрана покажет другое, причём оба числа клиент видит одновременно.
 * Поэтому наружу отдаётся ровно вопрос «сколько стоит этот ряд», и
 * отвечает на него то самое место, которое считает итог.
 *
 * Считается по требованию — для тех карточек, которые видно: замерено
 * 5 мс на цену, то есть шестьдесят карточек подряд стоят 290 мс
 * подвисшего планшета.
 */
export function priceDeltaOf(
  input: Pick<LibraryInput, 'run' | 'requirements' | 'openings' | 'roomDepthMm'>,
  cardOps: MillworkOp[],
  totalOf: (run: Run) => number,
  /**
   * Итог, который на экране СЕЙЧАС. «До» не пересчитывается: карточка
   * обещает сдвиг ТОГО числа, на которое человек смотрит, а не числа,
   * которое библиотека получила бы сама.
   */
  shownNow: number,
): number | null {
  const next = tryRun(input.run, input.requirements, input.openings, cardOps, input.roomDepthMm);
  if (!next.ok) return null;

  /*
   * РАЗНИЦА ДВУХ ЧИСЕЛ, КОТОРЫЕ ВИДНО, А НЕ ОКРУГЛЁННАЯ РАЗНИЦА СМЕТ.
   *
   * Итог на экране показан в целых тенге. Карточка, округлявшая разницу
   * НЕОКРУГЛЁННЫХ смет, обещала 17 384 ₸ там, где итог на экране
   * сдвигался на 17 383 ₸: 1 901 191.6 → 1 918 575.3 даёт 17 383.7, а
   * человек видит 1 901 192 → 1 918 575. Поймал это браузер — приёмка
   * движка считала обе стороны одной арифметикой и была зелёной.
   */
  return Math.round(totalOf(next.run)) - Math.round(shownNow);
}

/**
 * ПУСТОТЫ В РЯДУ — МЕСТА, КУДА МОЖНО ПОСТАВИТЬ МОДУЛЬ.
 *
 * Свободное место и самый широкий промежуток — разные величины
 * (ловушка 236), поэтому пустоты возвращаются ПООТДЕЛЬНОСТИ: «свободно
 * 900 мм» может означать три щели по 300.
 *
 * ПУСТО — ЭТО НЕ «МЕЖДУ МОДУЛЯМИ». У висящего ряда между модулями
 * бывают окно, колонна холодильника и выступ на потолке. Считать
 * пустотой всё, что не занято, значит предложить поставить шкаф поперёк
 * окна: первая версия так и рисовала на схеме «пусто 900» ровно на
 * окне, а над холодильником — «пусто 3200» в полосе кладовки, которая
 * собирается сама.
 *
 * Поэтому у висящих рядов пустота считается внутри УЧАСТКОВ — тех же,
 * по которым движок укладывает верхний ряд и антресоль
 * (`upperSpansOfRun` → `placeInSpans`). Второго ответа на «где ряд может
 * стоять» не появляется. У нижнего ряда преград нет: стена целиком его.
 */
export function gapsOfRow(
  run: Run,
  row: RunRow,
  openings: Opening[],
  requirements: RunRequirements,
): LibraryGap[] {
  /* Кладовка над колонной — не место для выбора: её строит правило. */
  if (row === 'storage') return [];
  /* Верхнего ряда нет вовсе — нет и его пустот; антресоль не включена — тоже. */
  if (row === 'upper' && !run.options.hasUpper) return [];
  if (row === 'mezzanine' && !run.mezzanine) return [];

  const modules = modulesOfRow(run, row);

  /*
   * УЧАСТКИ — У ДВИЖКА: у нижнего ряда вся стена, у верхнего — между
   * окном, колонной и выступом, у антресоли — ещё и без того, что съел
   * ригель. Пустой висящий ряд — это вся свободная длина его участков.
   */
  const { free } = rowSpansOfRun(row, run, run.modules, openings, requirements, run.options);

  const sorted = [...modules].sort((a, b) => a.offsetMm - b.offsetMm);
  const gaps: LibraryGap[] = [];

  for (const span of free) {
    let at = span.from;
    for (const unit of sorted) {
      const from = unit.offsetMm;
      const to = unit.offsetMm + unit.widthMm;
      if (to <= span.from || from >= span.to) continue;
      if (from > at) gaps.push({ fromMm: at, widthMm: from - at, row });
      at = Math.max(at, to);
    }
    if (at < span.to) gaps.push({ fromMm: at, widthMm: span.to - at, row });
  }

  return gaps.filter((gap) => gap.widthMm >= MIN_WIDTH);
}

/**
 * ВСЕ ПУСТОТЫ РЯДА ПО ВСЕМ ЕГО ПОЛОСАМ — то, что схема даёт нажать.
 *
 * Полосы берутся у того, что в ряду ЕСТЬ: нижняя всегда, висящие — по
 * своим модулям. Разбирает их `rowOfModule`, та же функция, что
 * выбирает ряд переносу и наполнению.
 */
export function libraryGaps(
  run: Run,
  openings: Opening[],
  requirements: RunRequirements,
): LibraryGap[] {
  /*
   * Ряды, которые ЕСТЬ: нижний всегда, верхний — если он включён,
   * антресоль — если заказана. Пустые тоже: их пустоты и есть место.
   */
  const rows: RunRow[] = ['base'];
  if (run.options.hasUpper) rows.push('upper');
  if (run.mezzanine) rows.push('mezzanine');

  const zone = requirements.zone ?? run.zone ?? 'kitchen';

  /*
   * «Пусто» и «сюда ничего не встанет» — разные состояния, и сливать их
   * нельзя: пунктир с подписью «пусто 1400» над коробом вентиляции
   * звал поставить туда то, чего движок не примет.
   */
  return rows
    .flatMap((row) => gapsOfRow(run, row, openings, requirements))
    .filter((gap) =>
      libraryLock({ run, requirements, openings, moduleId: null, gap })
        ? false
        : gapAccepts({ run, requirements, openings, moduleId: null, gap }, zone),
    );
}

/** Сколько карточек библиотека даёт на этом месте: для приёмки и панели. */
export function libraryCount(input: LibraryInput): number {
  return libraryCards(input).length;
}

/** Название варианта с шириной — подпись карточки. */
export function cardTitle(card: LibraryCard): string {
  return `${MODULE_VARIANTS[card.spec.kind].title} ${card.widthMm}`;
}

/** Карточка ленты вариантов: что поставить и почём — или почему нельзя. */
export type VariantPreviewCard = {
  spec: ModuleVariantSpec;
  /** Модуль с применённым вариантом — по нему рисуется мини-чертёж. */
  unit: Module;
  heightMm: number;
  /** Разница показанного итога. `null` — вариант не собирается. */
  deltaKzt: number | null;
  /** Почему не собирается — словами. */
  refusal?: string;
  active: boolean;
};

/**
 * ЛЕНТА ВАРИАНТОВ: ВАРИАНТ, КОТОРЫЙ НЕ СОБИРАЕТСЯ, — СЕРЫЙ С ПРИЧИНОЙ.
 *
 * Здесь стоял `catch { deltaKzt = 0 }`, а отказ движка словами
 * (`warnings`) не проверялся вовсе: вариант, которого не будет, выходил
 * на экран с подписью «та же цена». На демо так выглядели все семь
 * вариантов кладовки над холодильником — движок на каждый отвечал «не
 * найден», а клиент видел выбор.
 *
 * Разница — та же, что у библиотеки: показанный итог после минус
 * показанный сейчас (`priceDeltaOf`).
 */
export function variantPreviews(
  input: Pick<LibraryInput, 'run' | 'requirements' | 'openings' | 'roomDepthMm'> & {
    unit: Module;
    zone: NonNullable<RunRequirements['zone']>;
  },
  totalOf: (run: Run) => number,
  shownNow: number,
): VariantPreviewCard[] {
  const { run, unit, zone } = input;
  const specs = variantsForModule(unit, run, zone);
  /* Один вариант — это не выбор, а надпись. */
  if (specs.length < 2) return [];

  const lock = libraryLock({ ...input, moduleId: unit.id });
  const now = currentVariant(unit);

  return specs.map((spec) => {
    const applied = applyVariant(unit, spec.kind);
    const heightMm = moduleCarcassHeightMm(unit, run);
    const active = spec.kind === now;

    if (lock) {
      return { spec, unit: applied, heightMm, deltaKzt: null, refusal: lock, active };
    }
    if (active) return { spec, unit: applied, heightMm, deltaKzt: 0, active };

    const ops: MillworkOp[] = [{ op: 'set_variant', moduleId: unit.id, variant: spec.kind }];
    const next = tryRun(run, input.requirements, input.openings, ops, input.roomDepthMm);
    if (!next.ok) {
      return { spec, unit: applied, heightMm, deltaKzt: null, refusal: next.why, active };
    }
    return {
      spec,
      unit: applied,
      heightMm,
      deltaKzt: Math.round(totalOf(next.run)) - Math.round(shownNow),
      active,
    };
  });
}
