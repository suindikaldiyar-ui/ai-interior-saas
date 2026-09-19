import type { CatalogEntryFull } from '@/types/catalog';
import type { FrontSpec, Module, Run } from '@/types/millwork';
import { frontOf } from './frontMaterial';
import { hasFacade } from './applianceFront';
import { isUpperRow } from './modules';

/**
 * ФРЕЗЕРОВКА ФАСАДА — ПОЗИЦИЯ КАТАЛОГА ОРГАНИЗАЦИИ.
 *
 * Мебельщик показывает клиенту не «филёнчатый фасад», а лист с
 * рисунками: Модерн, Александрия, Ампир, Волна. Это ОТДЕЛЬНЫЙ выбор,
 * которого в продукте не было вовсе: у фасада были база, конструкция и
 * фактура, и ни одно из трёх не отвечает на вопрос «какой профиль».
 *
 * Отдельной таблицы под фрезеровки нет и не будет (ловушка 19): это
 * ТОВАР, и живёт он в `catalog_items` рядом с декорами и фурнитурой.
 * Признак — `meta.milling`:
 *
 *   meta.milling.profile   контур профиля, путь SVG
 *   meta.milling.typical   позиция из типовой поставки, а не своя
 *
 * ЦЕНА ЛЕЖИТ В ОДНОМ МЕСТЕ — в позиции каталога. Модуль хранит ссылку
 * (`FrontSpec.millingId`), смета берёт `item.price`. Копия цены в модуле
 * означала бы, что переоценка каталога не доедет до сметы.
 *
 * ПЛОЩАДЬ ЗДЕСЬ НЕ СЧИТАЕТСЯ. Сколько квадратных метров фасада — знает
 * раскрой, и второй расчёт площади разошёлся бы с ним на первой же
 * правке. Каталог задаёт ЦЕНУ, а не второе количество.
 */

/**
 * СЛОЙ ПРОФИЛЯ: замкнутый контур и его глубина.
 *
 * `depth` — ОТНОСИТЕЛЬНАЯ глубина: 0 — плоскость фасада, 1 — дно самой
 * глубокой выборки этого профиля. Это «темнее/светлее», а не миллиметры:
 * настоящей глубины фрезы в каталоге организации нет, и выдавать рисунок
 * за размер значило бы назвать цеху число, которого никто не подтверждал.
 */
export type MillingLayer = { path: string; depth: number };

/** Что именно фрезеровано и как это выглядит. */
export type MillingMeta = {
  /**
   * ЧТО УТОПЛЕНО, А ЧТО ВЫСТУПАЕТ.
   *
   * Плоский контур не читается: «Верона» и «Ампир» — обе рамки в рамке,
   * и на карточке они выглядели одинаково. Фрезеровку узнают по
   * РЕЛЬЕФУ: где фреза сняла материал, там тень.
   *
   * Поэтому профиль описан слоями, а не одной строкой. Каждый слой —
   * замкнутый контур и его глубина: 0 — плоскость фасада, 1 — дно самой
   * глубокой выборки. Вид красит слой тем темнее, чем он глубже, и
   * кладёт тень по верхней кромке — так рамка выглядит утопленной, а не
   * нарисованной.
   *
   * Глубина здесь ОТНОСИТЕЛЬНАЯ и означает «темнее/светлее», а не
   * миллиметры: настоящей глубины фрезы в каталоге нет, и выдавать
   * рисунок за размер нельзя.
   */
  layers?: MillingLayer[];
  /**
   * КОНТУР ПРОФИЛЯ — ПУТЬ SVG, А НЕ ФОТОГРАФИЯ.
   *
   * Фотографий профилей у нас нет и брать их неоткуда: снимки чужих
   * поставщиков в репозитории — это обещание товара, которого у компании
   * нет (ловушка 261). Вектор при этом лучше подходит по существу: лист
   * печатают чёрно-белым, где фотография схлопывается, а контур читается
   * (ловушка 203); он же детерминирован — тот же профиль даёт тот же
   * рисунок на любой машине; и он же масштабируется от карточки 96 px до
   * выноски на листе, оставаясь ОДНИМ источником рисунка.
   *
   * Путь рисуется в поле 100×100 и описывает сечение профиля: слева
   * плоскость фасада, справа глубина фрезы.
   */
  profile: string;
  /** Позиция типовой поставки, а не своя: подписана ориентиром. */
  typical: boolean;
};

export type MillingItem = {
  id: string;
  name: string;
  article: string;
  /** Цена за м² фасада. Ноль — «цену не задали», а не «бесплатно». */
  price: number;
  active: boolean;
  milling: MillingMeta;
};

/** Фрезеровки нет: ровный фасад. Не позиция каталога, а её отсутствие. */
export const NO_MILLING_ID = 'none';

/**
 * Позиция каталога — фрезеровка, только если у неё есть профиль.
 *
 * Товар без `meta.milling.profile` — это не фрезеровка, а материал
 * вообще: он остаётся ставкой сметы и в этот список не попадает.
 */
export function millingOf(entry: CatalogEntryFull): MillingItem | null {
  const meta = entry.meta?.milling as Partial<MillingMeta> | undefined;
  const profile = typeof meta?.profile === 'string' ? meta.profile.trim() : '';
  if (!profile) return null;

  return {
    id: entry.id,
    name: entry.name_ru,
    article: entry.article ?? '',
    price: typeof entry.price === 'number' && Number.isFinite(entry.price) ? entry.price : 0,
    active: entry.is_active !== false,
    milling: {
      profile,
      layers: Array.isArray(meta?.layers) ? meta.layers : [],
      typical: meta?.typical === true,
    },
  };
}

/**
 * ФАСАД МОДУЛЯ С УЧЁТОМ ФРЕЗЕРОВКИ РЯДА.
 *
 * `frontOf` знает только то, что записано НА МОДУЛЕ, а фрезеровку
 * назначают ещё и полосе («низ Модерн, верх ровный») — и лежит она на
 * ряду. Сцена спрашивала `frontOf` напрямую и полосу не видела вовсе:
 * замерщик выбирал фрезеровку по рядам, смета её считала, раскрой писал
 * в название детали, а фасад в 3D оставался ровным.
 *
 * Это тот же класс ошибки, что ловушка 307: у одной величины оказалось
 * два ответа, и слабый стоял там, куда смотрит клиент. Теперь ответ
 * один — `millingFor`, а эта функция только надевает его на фасад.
 */
export function frontWithMilling(
  unit: Module,
  run: Pick<Run, 'milling'>,
): FrontSpec {
  const spec = frontOf(unit);
  const id = millingFor(unit, run);
  return id === (spec.millingId ?? null) ? spec : { ...spec, millingId: id ?? undefined };
}

/** Фрезеровки организации: ключ — идентификатор позиции. */
export function millingCatalog(items: CatalogEntryFull[]): Map<string, MillingItem> {
  const out = new Map<string, MillingItem>();
  for (const entry of items) {
    const milling = millingOf(entry);
    if (milling) out.set(milling.id, milling);
  }
  return out;
}

/** Из чего организация выбирает: только включённые, порядок устойчивый. */
export function millingChoices(catalog: Map<string, MillingItem>): MillingItem[] {
  return Array.from(catalog.values())
    .filter((item) => item.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/* ────────────────  Наследование по рядам  ──────────────── */

/**
 * КАКОМУ РЯДУ НАЗНАЧЕНА ФРЕЗЕРОВКА.
 *
 * Мебельщик назначает её не модулю, а полосе: «низ Модерн, верх ровный».
 * Ряды здесь — те же пять, о которых он говорит вслух.
 */
export type MillingScope = 'base' | 'upper' | 'tall' | 'drawers' | 'mezzanine';

export const MILLING_SCOPES: { key: MillingScope; title: string }[] = [
  { key: 'base', title: 'Нижний ряд' },
  { key: 'upper', title: 'Верхний ряд' },
  { key: 'tall', title: 'Пеналы' },
  { key: 'drawers', title: 'Ящики' },
  { key: 'mezzanine', title: 'Антресоль' },
];

/**
 * В КАКУЮ ПОЛОСУ ПОПАДАЕТ МОДУЛЬ.
 *
 * Спрашиваем то, что уже отвечает на этот вопрос в продукте:
 * `isUpperRow` различает висящее и стоящее, `section` — антресоль,
 * `fill.drawerHeights` — ящики (ловушка 358: ящики есть у того, у кого
 * есть фронты ящиков, а не у того, чей тип «ящичный»).
 *
 * Порядок проверок — от частного к общему: ящики под варочной панелью
 * это и ящики, и нижний ряд, и назначенное ЯЩИКАМ сильнее.
 */
export function millingScopeOf(unit: Module): MillingScope {
  if (unit.section === 'mezzanine') return 'mezzanine';
  if (!unit.column && (unit.fill?.drawerHeights.length ?? 0) > 0) return 'drawers';
  if (isUpperRow(unit)) return 'upper';
  if (unit.kind === 'tall') return 'tall';
  return 'base';
}

/** Что назначено рядам объекта. Пусто у ряда — «как у нижних». */
export type RunMilling = Partial<Record<MillingScope, string>>;

/**
 * КАКАЯ ФРЕЗЕРОВКА У ЭТОГО ФАСАДА — ОДНА ТОЧКА ЧТЕНИЯ.
 *
 * Три уровня, и они НАСЛЕДУЮТСЯ, а не копируются:
 *
 *   1. выбор на самом модуле  (`front.millingId`)
 *   2. назначенное его ряду   (`run.milling[scope]`)
 *   3. назначенное нижнему    (`run.milling.base`) — «как у нижних»
 *
 * Разложи это по вызывающим — и смета, сцена, чертёж и деталировка
 * ответят по-разному на один и тот же фасад. Именно так этот продукт
 * ловил один и тот же класс ошибки девять раз.
 *
 * Пусто на всех трёх уровнях — фрезеровки нет, и это нормальное
 * состояние: ровный фасад продаётся чаще фрезерованного.
 */
export function millingFor(
  unit: Module,
  run: Pick<Run, 'milling'>,
): string | null {
  const own = unit.front?.millingId?.trim();
  if (own) return own === NO_MILLING_ID ? null : own;

  const scope = millingScopeOf(unit);
  const byRow = run.milling?.[scope]?.trim();
  if (byRow) return byRow === NO_MILLING_ID ? null : byRow;

  const byBase = run.milling?.base?.trim();
  if (byBase) return byBase === NO_MILLING_ID ? null : byBase;

  return null;
}

/* ────────────────  Что стало со ссылкой  ──────────────── */

/**
 * ССЫЛКА, КОТОРАЯ НЕ РАЗРЕШИЛАСЬ, — ЭТО НЕ НОЛЬ И НЕ МОЛЧАНИЕ.
 *
 * Позицию могли отключить, удалить или открыть проект в другой
 * организации. Во всех этих случаях фасад считается ПО-ПРЕЖНЕМУ — без
 * строки фрезеровки, — а расхождение называется словами.
 *
 * Молча обнулить цену здесь значило бы отдать клиенту смету, в которой
 * фрезеровки нет, а в цех уехал бы фрезерованный фасад.
 */
export type MillingLink =
  | { state: 'none' }
  | { state: 'missing'; id: string; reason: string }
  | { state: 'inactive'; item: MillingItem; reason: string }
  | { state: 'priceless'; item: MillingItem; reason: string }
  | { state: 'resolved'; item: MillingItem };

export function millingLink(
  unit: Module,
  run: Pick<Run, 'milling'>,
  catalog: Map<string, MillingItem>,
): MillingLink {
  const id = millingFor(unit, run);
  if (!id) return { state: 'none' };

  const item = catalog.get(id);
  if (!item) {
    return {
      state: 'missing',
      id,
      reason:
        `«${unit.label}»: фрезеровки ${id} в каталоге нет. ` +
        'Фасад считается ровным — строки фрезеровки в смете не будет.',
    };
  }

  if (!item.active) {
    return {
      state: 'inactive',
      item,
      reason:
        `«${unit.label}»: фрезеровка «${item.name}» отключена в каталоге. ` +
        'Фасад считается ровным — цена отключённой позиции не применяется.',
    };
  }

  /*
   * Ноль здесь не «бесплатно», а «цену не задали». Пропустить его молча
   * значит отдать клиенту смету, в которой фрезеровка стоит ничего.
   */
  if (!Number.isFinite(item.price) || item.price <= 0) {
    return {
      state: 'priceless',
      item,
      reason:
        `«${item.name}»: цена не задана — фрезеровка в смету не попала. ` +
        'Задайте цену за м² в каталоге.',
    };
  }

  return { state: 'resolved', item };
}

/**
 * Расхождения каталога словами — тем же каналом, что остальные
 * предупреждения ряда. Повторы схлопываются: десять модулей с одной
 * позицией без цены — это один вопрос к каталогу, а не десять проблем.
 */
export function millingWarnings(
  run: Pick<Run, 'modules' | 'upperSegments' | 'milling'>,
  catalog: Map<string, MillingItem>,
): { id: string; severity: 'clarify'; message: string }[] {
  const seen = new Map<string, string>();

  const all = [...run.modules, ...run.upperSegments.flatMap((segment) => segment.modules)];
  for (const unit of all) {
    if (!hasFacade(unit)) continue;

    const link = millingLink(unit, run, catalog);
    if (link.state === 'none' || link.state === 'resolved') continue;

    const key = link.state === 'missing' ? `missing:${link.id}` : `${link.state}:${link.item.id}`;
    if (!seen.has(key)) seen.set(key, link.reason);
  }

  return Array.from(seen.entries()).map(([key, message]) => ({
    id: `milling-${key}`,
    severity: 'clarify' as const,
    message,
  }));
}

/* ────────────────  Стартовый набор  ──────────────── */

/**
 * ТИПОВЫЕ ФРЕЗЕРОВКИ — ОРИЕНТИР, А НЕ ПРАЙС КОМПАНИИ.
 *
 * Названия отраслевые: их произносит мебельщик и узнаёт клиент. А вот
 * ЦЕН ЗДЕСЬ НЕТ и быть не может: фрезеровка стоит по-разному у каждого
 * цеха — зависит от станка, числа проходов и того, кто точит фрезу.
 * Выдуманная цена уехала бы в подписанную смету.
 *
 * Поэтому позиция заводится БЕЗ цены и подписана «цена не задана» — ровно
 * так же, как это уже сделано для фурнитуры (`hardware.ts`).
 *
 * Профиль — путь SVG в поле 100×100: слева плоскость фасада, справа
 * глубина фрезы. Это СЕЧЕНИЕ, а не узор на плоскости: мебельщик узнаёт
 * фрезеровку именно по нему.
 */
export type TypicalMilling = {
  article: string;
  name: string;
  layers: MillingLayer[];
};

/** Плоскость фасада в поле 100×100: слой нулевой глубины, он же контур. */
const FACE: MillingLayer = { path: 'M4 4 H96 V96 H4 Z', depth: 0 };

/**
 * ПЛОСКИЙ КОНТУР ВЫВОДИТСЯ ИЗ СЛОЁВ, А НЕ ХРАНИТСЯ ВТОРЫМ РИСУНКОМ.
 *
 * Рисунок профиля один: слои. Держать рядом с ними отдельную строку
 * контура значит завести вторую формулу одной величины — и однажды
 * получить карточку с рельефом одной фрезеровки и выноску на листе с
 * контуром другой.
 *
 * `profile` при этом остаётся: по нему позиция каталога ОПОЗНАЁТСЯ как
 * фрезеровка (`millingOf`), и его рисуют там, где рельефа не нужно —
 * на чёрно-белой печати листа.
 */
export function profileOf(layers: MillingLayer[]): string {
  return layers.map((layer) => layer.path).join(' ');
}

export const TYPICAL_MILLING: TypicalMilling[] = [
  {
    article: 'MIL-NONE',
    name: 'Без фрезеровки',
    /* Одна плоскость фасада: фреза по нему не прошла вовсе. */
    layers: [FACE],
  },
  {
    article: 'MIL-MODERN',
    name: 'Модерн',
    /* Одна прямая выборка: ровное поле, утопленное на всю глубину. */
    layers: [FACE, { path: 'M18 18 H82 V82 H18 Z', depth: 1 }],
  },
  {
    article: 'MIL-ALEXANDRIA',
    name: 'Александрия',
    /* Ступень, а в ней ОВАЛЬНОЕ поле: узнаётся по скруглению. */
    layers: [
      FACE,
      { path: 'M14 14 H86 V86 H14 Z', depth: 0.45 },
      { path: 'M24 50 Q24 26 50 26 Q76 26 76 50 Q76 74 50 74 Q24 74 24 50 Z', depth: 1 },
    ],
  },
  {
    article: 'MIL-EMPIRE',
    name: 'Ампир',
    /* ТРИ ступени подряд: классическая многоступенчатая рамка. */
    layers: [
      FACE,
      { path: 'M12 12 H88 V88 H12 Z', depth: 0.3 },
      { path: 'M22 22 H78 V78 H22 Z', depth: 0.6 },
      { path: 'M32 32 H68 V68 H32 Z', depth: 1 },
    ],
  },
  {
    article: 'MIL-WAVE',
    name: 'Волна',
    /* Волна идёт ПОЛОСОЙ поперёк фасада, а не линией по нему. */
    layers: [
      FACE,
      { path: 'M14 14 H86 V86 H14 Z', depth: 0.35 },
      { path: 'M14 60 Q32 28 50 60 Q68 92 86 60 V86 H14 Z', depth: 1 },
    ],
  },
  {
    article: 'MIL-BLINDS',
    name: 'Жалюзи',
    /* Четыре рейки во всю ширину поля, каждая — своя выборка. */
    layers: [
      FACE,
      { path: 'M14 14 H86 V86 H14 Z', depth: 0.25 },
      { path: 'M20 24 H80 V34 H20 Z', depth: 1 },
      { path: 'M20 39 H80 V49 H20 Z', depth: 1 },
      { path: 'M20 54 H80 V64 H20 Z', depth: 1 },
      { path: 'M20 69 H80 V79 H20 Z', depth: 1 },
    ],
  },
  {
    article: 'MIL-VENICE',
    name: 'Венеция',
    /* РОМБ в рамке: диагонали, а не прямые — ни с чем не спутать. */
    layers: [
      FACE,
      { path: 'M14 14 H86 V86 H14 Z', depth: 0.4 },
      { path: 'M50 22 L78 50 L50 78 L22 50 Z', depth: 1 },
    ],
  },
  {
    article: 'MIL-FLORENCE',
    name: 'Флоренсия',
    /* Вертикальный ЛЕПЕСТОК по центру: острые концы сверху и снизу. */
    layers: [
      FACE,
      { path: 'M14 14 H86 V86 H14 Z', depth: 0.35 },
      { path: 'M50 18 Q72 50 50 82 Q28 50 50 18 Z', depth: 1 },
    ],
  },
  {
    article: 'MIL-VALENCIA',
    name: 'Валенсия',
    /* Бочка: стороны выгнуты наружу, углов у поля нет вовсе. */
    layers: [
      FACE,
      { path: 'M16 30 Q50 16 84 30 Q98 50 84 70 Q50 84 16 70 Q2 50 16 30 Z', depth: 1 },
    ],
  },
  {
    article: 'MIL-VERONA',
    name: 'Верона',
    /* ТРИ коротких штриха в узкой рамке — не рейки и не ступени. */
    layers: [
      FACE,
      { path: 'M16 16 H84 V84 H16 Z', depth: 0.5 },
      { path: 'M30 36 H70 V42 H30 Z', depth: 1 },
      { path: 'M30 47 H70 V53 H30 Z', depth: 1 },
      { path: 'M30 58 H70 V64 H30 Z', depth: 1 },
    ],
  },
  {
    article: 'MIL-PROFILE',
    name: 'Профильный',
    /* Две вертикальные канавки по краям, середина фасада не тронута. */
    layers: [
      FACE,
      { path: 'M12 8 H26 V92 H12 Z', depth: 1 },
      { path: 'M74 8 H88 V92 H74 Z', depth: 1 },
    ],
  },
];


/** Позиция типового набора в виде товара каталога. */
export function typicalMillingItem(milling: TypicalMilling) {
  return {
    article: milling.article,
    name_ru: milling.name,
    name_kk: milling.name,
    /*
     * ЦЕНЫ НЕТ — И ЭТО НЕ ЗАБЫТОЕ ПОЛЕ.
     *
     * Ноль здесь читается продуктом как «цену не задали»: строка
     * фрезеровки в смету не попадает, а каталог говорит об этом словами.
     */
    price: 0,
    unit: 'm2' as const,
    categoryKey: 'materials',
    meta: {
      milling: { profile: profileOf(milling.layers), layers: milling.layers, typical: true },
    },
  };
}
