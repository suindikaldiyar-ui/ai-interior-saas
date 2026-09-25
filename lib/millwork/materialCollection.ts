import type { CatalogEntryFull, CatalogUnit } from '@/types/catalog';

/**
 * КОЛЛЕКЦИЯ МАТЕРИАЛОВ — ЭТО КАТЕГОРИЯ КАТАЛОГА, А НЕ ВТОРОЙ КАТАЛОГ.
 *
 * Позиции `catalog.json` ложатся в ту же `catalog_items`, что фасады,
 * фурнитура и ставки (ловушка 19). Коллекция — «Эмаль · RAL Design»,
 * «ЛДСП · EGGER» — становится категорией с ключом `collection:<id>`, и
 * позиция узнаёт свою коллекцию по категории. Второго поля с той же
 * ссылкой нет: две ссылки на одну коллекцию однажды разошлись бы.
 *
 * Здесь только то, что нужно читать СРАЗУ и без файла каталога: к какой
 * коллекции относится позиция, на что она идёт и сколько стоит. Модуль
 * без зависимостей — его зовут смета, корпус и палитра, и цикл импортов
 * через него не пройдёт.
 */

export const COLLECTION_PREFIX = 'collection:';

/**
 * Файл, который не читается, называет место, а не падает стеком.
 *
 * Молча пропущенная позиция — это цвет, который клиент не найдёт, а
 * молча подставленная шероховатость — поверхность, которой нет. Поэтому
 * разбор строгий: неизвестная роль, поверхность без параметров, код
 * дважды — отказ с адресом ошибки в файле.
 */
export function catalogFail(message: string): never {
  throw new Error(`catalog.json: ${message}`);
}

export function catalogText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function unit01(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    catalogFail(`${where} — нужно число от 0 до 1, пришло ${JSON.stringify(value)}`);
  }
  return value;
}

/** Параметры сцены у поверхности — из файла, не из кода. */
export type FinishSpec = {
  label: string;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
};

/** Таблица поверхностей: шероховатость и лак для сцены. */
export function parseFinishes(raw: unknown): Record<string, FinishSpec> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) catalogFail('нет таблицы finishes');

  const out: Record<string, FinishSpec> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const spec = value as Record<string, unknown> | null;
    if (!spec || typeof spec !== 'object') catalogFail(`поверхность ${id} — не объект`);
    const label = catalogText(spec.label) || catalogFail(`поверхность ${id} без названия`);
    const clearcoat = spec.clearcoat === undefined ? 0 : unit01(spec.clearcoat, `${id}.clearcoat`);
    /*
     * Лак без его шероховатости — это число, которое пришлось бы
     * выдумать. Там, где лака нет, шероховатость лака ни на что не
     * влияет, и ноль честен.
     */
    if (clearcoat > 0 && spec.clearcoatRoughness === undefined) {
      catalogFail(`поверхность ${id}: лак ${clearcoat} без clearcoatRoughness`);
    }
    out[id] = {
      label,
      roughness: unit01(spec.roughness, `${id}.roughness`),
      clearcoat,
      clearcoatRoughness:
        spec.clearcoatRoughness === undefined ? 0 : unit01(spec.clearcoatRoughness, `${id}.clearcoatRoughness`),
    };
  }
  return out;
}

export function collectionCategoryKey(collectionId: string): string {
  return `${COLLECTION_PREFIX}${collectionId}`;
}

/** Коллекция позиции — по ключу её категории. Не из коллекции — `null`. */
export function collectionOf(entry: { category?: { key?: string } | null }): string | null {
  const key = entry.category?.key ?? '';
  return key.startsWith(COLLECTION_PREFIX) ? key.slice(COLLECTION_PREFIX.length) : null;
}

/** На что идёт материал. Роли — из файла каталога, код их не выдумывает. */
export type MaterialRole = 'front' | 'carcass' | 'countertop' | 'backsplash';
export const MATERIAL_ROLES: readonly MaterialRole[] = ['front', 'carcass', 'countertop', 'backsplash'];

/**
 * За что назначена цена.
 *
 * Лист ЛДСП продают листами, эмаль — квадратными метрами, столешницу —
 * погонными. Смета меряет фасады и корпус в м², столешницу в пог. м, и
 * цена в другой единице в эти количества не пересчитывается без размера
 * листа, которого в файле нет. Такую цену смета не умножает — она
 * называет её словами.
 */
export type PriceUnit = 'm2' | 'running_m' | 'sheet' | 'piece';
export const PRICE_UNITS: readonly PriceUnit[] = ['m2', 'running_m', 'sheet', 'piece'];

export const PRICE_UNIT_LABEL: Record<PriceUnit, string> = {
  m2: 'м²',
  running_m: 'пог. м',
  sheet: 'лист',
  piece: 'шт',
};

/**
 * Единица цены в колонке каталога. Листа среди `catalog_unit` нет, и
 * заводить значение перечисления ради него — миграция базы. Лист идёт
 * штукой, а что это ЛИСТ, помнит `meta.priceUnit`.
 */
export const CATALOG_UNIT_OF: Record<PriceUnit, CatalogUnit> = {
  m2: 'm2',
  running_m: 'running_meter',
  sheet: 'piece',
  piece: 'piece',
};

export function priceUnitOf(entry: Pick<CatalogEntryFull, 'unit' | 'meta'>): PriceUnit {
  if (entry.meta?.priceUnit === 'sheet') return 'sheet';
  if (entry.unit === 'm2') return 'm2';
  if (entry.unit === 'running_meter') return 'running_m';
  return 'piece';
}

export function metaRoles(meta: Record<string, unknown> | null | undefined): MaterialRole[] {
  const raw = meta?.roles;
  if (!Array.isArray(raw)) return [];
  return raw.filter((role): role is MaterialRole => MATERIAL_ROLES.includes(role as MaterialRole));
}

export function metaFinishes(meta: Record<string, unknown> | null | undefined): string[] {
  const raw = meta?.finishes;
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
}

/**
 * Цены по поверхностям — у МДФ-панели High Gloss и Touch Sense стоят по-
 * разному. `null` у поверхности — «цена не задана», как и в файле.
 */
export function metaFinishPrices(
  meta: Record<string, unknown> | null | undefined,
): Record<string, number | null> | null {
  const raw = meta?.finishPrices;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, number | null> = {};
  for (const [surface, value] of Object.entries(raw as Record<string, unknown>)) {
    out[surface] = typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  }
  return out;
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Цвет позиции: заданный, а у позиции с одним фото — средний цвет фото.
 *
 * Средний цвет не выдумывается: его считает загрузка файла
 * (`tiling.averageColor`), тем же проходом, что собирает композит для
 * рендера. Им красится схема и корпус до того, как текстура приехала.
 */
export function materialColorOf(entry: Pick<CatalogEntryFull, 'meta' | 'tiling'>): string | null {
  const own = entry.meta?.color;
  if (typeof own === 'string' && HEX.test(own)) return own;
  const average = (entry.tiling as { averageColor?: unknown } | undefined)?.averageColor;
  return typeof average === 'string' && HEX.test(average) ? average : null;
}

/** Фото позиции и его НАСТОЯЩИЙ размер в метрах — по нему ложится текстура. */
export type MaterialPhoto = { url: string; sizeM: [number, number] };

/** Позиция коллекции глазами сметы, сцены и панели. */
export type MaterialItem = {
  id: string;
  /** Код позиции — он же артикул в каталоге организации. */
  code: string;
  name: string;
  collection: string;
  roles: MaterialRole[];
  finishes: string[];
  unit: PriceUnit;
  /** Цена за единицу; `null` — не задана. */
  price: number | null;
  /** Цены по поверхностям; `null` — цена у позиции одна. */
  finishPrices: Record<string, number | null> | null;
  /** Цвет, sRGB `#rrggbb`. В сцене переводится в линейное пространство. */
  colorHex: string | null;
  photo: MaterialPhoto | null;
  /**
   * Фото есть, а размера нет. Растягивать фото по детали нельзя —
   * в сцене остаётся цвет, и это сказано в карточке.
   */
  photoWithoutSize: boolean;
};

export const PRICE_UNSET = 'цена не задана';

/**
 * Цена позиции за единицу — для выбранной поверхности.
 *
 * Ноль в колонке `price` — не «бесплатно», а «цену не задали» (тот же
 * уговор, что у фрезеровки): `null` из файла колонка NOT NULL хранит
 * нулём. Читается это ОДНОЙ функцией, и смета, и карточка спрашивают её.
 */
export function materialPrice(
  item: Pick<MaterialItem, 'price' | 'finishPrices'>,
  surface?: string,
): number | null {
  if (item.finishPrices) {
    if (!surface) return null;
    const value = item.finishPrices[surface];
    return typeof value === 'number' && value > 0 ? value : null;
  }
  return typeof item.price === 'number' && item.price > 0 ? item.price : null;
}

export type PriceState = { state: 'priced'; rate: number } | { state: 'unset'; reason: string };

/**
 * Можно ли умножить цену позиции на количество сметы.
 *
 * Нет цены — «цена не задана». Цена в другой единице — сказано, в какой
 * и почему её не умножить: лист на квадратные метры без размера листа
 * пересчитать нельзя, и выдумывать этот размер значит выдумывать деньги.
 */
export function priceState(
  item: Pick<MaterialItem, 'price' | 'finishPrices' | 'unit'>,
  surface: string | undefined,
  quantityUnit: PriceUnit,
): PriceState {
  const rate = materialPrice(item, surface);
  if (rate === null) return { state: 'unset', reason: PRICE_UNSET };
  if (item.unit !== quantityUnit) {
    return {
      state: 'unset',
      reason: `цена за ${PRICE_UNIT_LABEL[item.unit]} — в ${PRICE_UNIT_LABEL[quantityUnit]} не пересчитать`,
    };
  }
  return { state: 'priced', rate };
}
