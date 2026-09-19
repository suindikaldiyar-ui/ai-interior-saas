import type { CatalogEntryFull } from '@/types/catalog';
import type { Module, Run } from '@/types/millwork';
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

/** Что именно фрезеровано и как это выглядит. */
export type MillingMeta = {
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
    milling: { profile, typical: meta?.typical === true },
  };
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
export type TypicalMilling = { article: string; name: string; profile: string };

export const TYPICAL_MILLING: TypicalMilling[] = [
  {
    article: 'MIL-NONE',
    name: 'Без фрезеровки',
    profile: 'M10 20 L90 20 L90 80 L10 80 Z',
  },
  {
    article: 'MIL-MODERN',
    name: 'Модерн',
    profile: 'M10 20 L90 20 L90 80 L10 80 Z M22 32 L78 32 L78 68 L22 68 Z',
  },
  {
    article: 'MIL-ALEXANDRIA',
    name: 'Александрия',
    profile:
      'M10 20 L90 20 L90 80 L10 80 Z M20 30 L80 30 L80 70 L20 70 Z M28 38 Q50 30 72 38 L72 62 Q50 70 28 62 Z',
  },
  {
    article: 'MIL-EMPIRE',
    name: 'Ампир',
    profile:
      'M10 20 L90 20 L90 80 L10 80 Z M18 28 L82 28 L82 72 L18 72 Z M26 36 L74 36 L74 64 L26 64 Z M34 44 L66 44 L66 56 L34 56 Z',
  },
  {
    article: 'MIL-WAVE',
    name: 'Волна',
    profile: 'M10 20 L90 20 L90 80 L10 80 Z M18 50 Q32 30 46 50 Q60 70 74 50 Q82 40 86 46',
  },
  {
    article: 'MIL-BLINDS',
    name: 'Жалюзи',
    profile:
      'M10 20 L90 20 L90 80 L10 80 Z M20 32 L80 32 M20 42 L80 42 M20 52 L80 52 M20 62 L80 62 M20 72 L80 72',
  },
  {
    article: 'MIL-VENICE',
    name: 'Венеция',
    profile:
      'M10 20 L90 20 L90 80 L10 80 Z M22 30 L78 30 L78 70 L22 70 Z M22 30 L50 50 L78 30 M22 70 L50 50 L78 70',
  },
  {
    article: 'MIL-FLORENCE',
    name: 'Флоренсия',
    profile:
      'M10 20 L90 20 L90 80 L10 80 Z M20 30 L80 30 L80 70 L20 70 Z M50 34 Q64 50 50 66 Q36 50 50 34 Z',
  },
  {
    article: 'MIL-VALENCIA',
    name: 'Валенсия',
    profile:
      'M10 20 L90 20 L90 80 L10 80 Z M20 30 Q50 22 80 30 L80 70 Q50 78 20 70 Z',
  },
  {
    article: 'MIL-VERONA',
    name: 'Верона',
    profile:
      'M10 20 L90 20 L90 80 L10 80 Z M20 30 L80 30 L80 70 L20 70 Z M30 40 L70 40 M30 50 L70 50 M30 60 L70 60',
  },
  {
    article: 'MIL-PROFILE',
    name: 'Профильный',
    profile: 'M10 20 L90 20 L90 80 L10 80 Z M18 28 Q26 50 18 72 M82 28 Q74 50 82 72',
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
      milling: { profile: milling.profile, typical: true },
    },
  };
}
