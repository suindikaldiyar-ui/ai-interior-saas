import type { CatalogEntryFull } from '@/types/catalog';
import {
  collectionOf,
  materialColorOf,
  metaFinishPrices,
  metaRoles,
  priceState,
  priceUnitOf,
} from './materialCollection';
import type { Module, Run } from '@/types/millwork';
import { MILLING_SCOPES, millingScopeOf, type MillingScope } from './milling';

/**
 * МАТЕРИАЛ КОРПУСА — ПОЗИЦИЯ КАТАЛОГА, ОТДЕЛЬНАЯ ОТ ФАСАДА.
 *
 * Внутри шкафа своя плита: белый корпус под цветной фасад — самый частый
 * заказ, и стоит она других денег. До сих пор корпус был один на весь
 * продукт — «ЛДСП 16», серая плашка в сцене и одна строка в смете, — и
 * выбрать его было негде.
 *
 * Отдельной таблицы под это нет (ловушка 19): корпус красит тот же
 * ДЕКОР, что и фасад, — позиция `catalog_items` с `meta.color`. Разница
 * только в том, куда он применён.
 *
 * НАСЛЕДОВАНИЕ — ТЕМ ЖЕ МЕХАНИЗМОМ, ЧТО ФРЕЗЕРОВКА: модуль → полоса →
 * низ, и полосы те же самые (`MILLING_SCOPES`). Второй лестницы в
 * продукте нет и быть не должно: две лестницы наследования расходятся на
 * первом же ряду, где назначено и то, и другое.
 */

export type CarcassScope = MillingScope;

/** Полосы те же, что у фрезеровки: это один и тот же вопрос «где модуль». */
export const CARCASS_SCOPES = MILLING_SCOPES;

/** В какую полосу попадает модуль. Та же функция, что у фрезеровки. */
export const carcassScopeOf = millingScopeOf;

export type CarcassItem = {
  id: string;
  name: string;
  article: string;
  /** Цена за м² плиты. Ноль — «цену не задали», а не «бесплатно». */
  price: number;
  active: boolean;
  /** Цвет декора: им красится корпус в сцене. */
  colorHex: string;
  /**
   * Коллекция каталога материалов, если позиция оттуда.
   *
   * У такой позиции своё правило цены: не заданная цена — строка «цена
   * не задана» и итог «неполный», а не молчаливая ставка цеха.
   */
  collection?: string | null;
  /** Почему цену позиции коллекции не умножить на м²: словами. */
  priceNote?: string | null;
};

/**
 * Позиция каталога — материал корпуса, если у неё есть ДЕКОР.
 *
 * Признак тот же, по которому позиция попадает в палитру фасадов:
 * `meta.color` плюс база. Своего признака «это для корпуса» не заводим —
 * плита одна и та же, и компания сама решает, куда её ставить.
 */
export function carcassItemOf(entry: CatalogEntryFull): CarcassItem | null {
  /*
   * ПОЗИЦИЯ КОЛЛЕКЦИИ — МАТЕРИАЛ КОРПУСА, ТОЛЬКО ЕСЛИ ЕЁ РОЛЬ КОРПУС.
   *
   * Цвет есть у каждого из 1825 цветов RAL, но эмаль — фасад: пусти её
   * сюда, и выбор корпуса нарисовал бы 1825 кнопок. Роль берётся из
   * данных позиции (её скопировала туда загрузка файла), а не угадывается.
   */
  const collection = collectionOf(entry);
  if (collection) {
    if (!metaRoles(entry.meta).includes('carcass')) return null;
    const colorHex = materialColorOf(entry);
    if (!colorHex) return null;
    /*
     * Здесь только СВОЯ цена позиции: цену коллекции знает ставка, а
     * ставки у каталога корпуса нет. Её спрашивает смета — той же
     * `materialPrice`, что и у фасадов (слой 52).
     */
    const price = priceState(
      {
        price: typeof entry.price === 'number' && entry.price > 0 ? entry.price : null,
        finishPrices: metaFinishPrices(entry.meta),
        unit: priceUnitOf(entry),
        collection,
      },
      undefined,
      'm2',
    );
    return {
      id: entry.id,
      name: entry.name_ru,
      article: entry.article ?? '',
      price: price.state === 'priced' ? price.rate : 0,
      active: entry.is_active !== false,
      colorHex,
      collection,
      priceNote: price.state === 'unset' ? price.reason : null,
    };
  }

  const meta = entry.meta as { color?: unknown; frontBase?: unknown } | null | undefined;
  const color = typeof meta?.color === 'string' ? meta.color.trim() : '';
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return null;

  return {
    id: entry.id,
    name: entry.name_ru,
    article: entry.article ?? '',
    price: typeof entry.price === 'number' && Number.isFinite(entry.price) ? entry.price : 0,
    active: entry.is_active !== false,
    colorHex: color,
  };
}

/** Материалы корпуса организации: ключ — идентификатор позиции. */
export function carcassCatalog(items: CatalogEntryFull[]): Map<string, CarcassItem> {
  const out = new Map<string, CarcassItem>();
  for (const entry of items) {
    const item = carcassItemOf(entry);
    if (item) out.set(item.id, item);
  }
  return out;
}

/** Из чего организация выбирает: только включённые, порядок устойчивый. */
export function carcassChoices(catalog: Map<string, CarcassItem>): CarcassItem[] {
  return Array.from(catalog.values())
    .filter((item) => item.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/**
 * Какой материал у корпуса ЭТОГО модуля.
 *
 * Тот же порядок, что у `millingFor`: своё сильнее полосы, полоса
 * сильнее низа. Пусто — корпус остаётся обычной плитой цеха, и ни в
 * раскрое, ни в смете ничего не меняется.
 */
export function carcassFor(unit: Module, run: Pick<Run, 'carcass'>): string | null {
  const own = unit.carcassItemId?.trim();
  if (own) return own === NO_CARCASS_ID ? null : own;

  const scope = carcassScopeOf(unit);
  const byRow = run.carcass?.[scope]?.trim();
  if (byRow) return byRow === NO_CARCASS_ID ? null : byRow;

  const byBase = run.carcass?.base?.trim();
  if (byBase) return byBase === NO_CARCASS_ID ? null : byBase;

  return null;
}

/** Материала корпуса нет: обычная плита цеха. Не позиция, а её отсутствие. */
export const NO_CARCASS_ID = 'none';

/**
 * Позиция, которой красится корпус, — или `null` со словами.
 *
 * Ноль в цене здесь значит «цену не задали», а не «бесплатно»: такая
 * позиция красит сцену и называется в раскрое, но своей строки в смету
 * не даёт — иначе клиент получил бы корпус за ничего.
 */
export function carcassLink(
  unit: Module,
  run: Pick<Run, 'carcass'>,
  catalog: Map<string, CarcassItem>,
):
  | { state: 'none' }
  | { state: 'missing'; id: string; reason: string }
  | { state: 'priceless'; item: CarcassItem; reason: string }
  | { state: 'resolved'; item: CarcassItem } {
  const id = carcassFor(unit, run);
  if (!id) return { state: 'none' };

  const item = catalog.get(id);
  if (!item || !item.active) {
    return {
      state: 'missing',
      id,
      reason:
        `«${unit.label}»: материала корпуса ${id} в каталоге нет или он отключён. ` +
        'Корпус считается обычной плитой цеха.',
    };
  }

  if (!Number.isFinite(item.price) || item.price <= 0) {
    return {
      state: 'priceless',
      item,
      /*
       * Позиция коллекции ставкой цеха не подменяется: у неё своя строка
       * «цена не задана», и итог помечен неполным (слой 51).
       */
      reason: item.collection
        ? `«${item.name}»: ${item.priceNote ?? 'цена не задана'} — корпус в смете без цены, итог неполный.`
        : `«${item.name}»: цена не задана — корпус посчитан по ставке цеха. ` +
          'Задайте цену за м² в каталоге.',
    };
  }

  return { state: 'resolved', item };
}

/**
 * Ключ материала корпуса для сцены и для группировки.
 *
 * Пусто — корпус рисуется ролью (`sceneColors`), как и раньше. Пачки
 * отрисовки делятся по этому ключу ровно так же, как фасады по
 * `frontKey` (ловушка 248): два корпуса разного декора — это два
 * материала, а не один.
 */
export function carcassKeyOf(
  unit: Module,
  run: Pick<Run, 'carcass'>,
  catalog: Map<string, CarcassItem>,
): string | null {
  const link = carcassLink(unit, run, catalog);
  if (link.state === 'none' || link.state === 'missing') return null;
  return `carcass/${link.item.id}`;
}

/**
 * Название материала корпуса для деталировки.
 *
 * Толщина остаётся школой цеха — она и есть то, что режут; декор
 * добавляется к ней, а не заменяет её: «ЛДСП 16 · Графит» читается и
 * технологом, и кладовщиком.
 */
export function carcassMaterialName(
  base: string,
  unit: Module,
  run: Pick<Run, 'carcass'>,
  catalog: Map<string, CarcassItem>,
): string {
  const link = carcassLink(unit, run, catalog);
  if (link.state === 'none' || link.state === 'missing') return base;
  return `${base} · ${link.item.name}`;
}

/**
 * Предупреждения по материалу корпуса: словами и без повторов.
 *
 * Тот же разбор, что у фрезеровки: ссылка не разрешилась или цена не
 * задана — это вопрос к каталогу, а не повод молча посчитать по ставке
 * цеха и не сказать об этом.
 */
export function carcassWarnings(
  run: Pick<Run, 'modules' | 'upperSegments' | 'carcass'>,
  catalog: Map<string, CarcassItem>,
): { id: string; severity: 'clarify'; message: string }[] {
  const seen = new Map<string, string>();

  for (const unit of [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)]) {
    const link = carcassLink(unit, run, catalog);
    if (link.state === 'none' || link.state === 'resolved') continue;

    const key = link.state === 'missing' ? `missing:${link.id}` : `priceless:${link.item.id}`;
    if (!seen.has(key)) seen.set(key, link.reason);
  }

  return Array.from(seen.entries()).map(([key, message]) => ({
    id: `carcass-${key}`,
    severity: 'clarify' as const,
    message,
  }));
}
