import { textureUrl } from '@/lib/catalog';
import type { CatalogCategory, CatalogEntryFull, CatalogUnit, TilingSpec } from '@/types/catalog';
import type { FrontBase, FrontFinish, FrontSpec, MillworkOp, Module, Run, ZoneKind } from '@/types/millwork';
import { hasFacade } from './applianceFront';
import { CARCASS_SCOPES, isAntresol } from './carcassMaterial';
import { DEFAULT_FRONT, frontConflict, frontOf, leafFrontOf } from './frontMaterial';
import { allModules } from './layout';
import { NO_MILLING_ID } from './milling';
import {
  CATALOG_UNIT_OF,
  MATERIAL_ROLES,
  catalogFail as fail,
  catalogText as text,
  parseFinishes,
  type FinishSpec,
  PRICE_UNITS,
  collectionCategoryKey,
  collectionOf,
  collectionRateKey,
  materialColorOf,
  metaFinishPrices,
  metaFinishes,
  metaRoles,
  priceUnitOf,
  reviewNoteOf,
  type MaterialItem,
  type MaterialPhoto,
  type MaterialRole,
  type PriceUnit,
} from './materialCollection';
import { zoneProfile } from './zones';
import { referenceImageAllowed, referenceKeyOf, referenceUrl } from './referenceTextures';
import { WOOD_TILE_MM, woodPatternOf, woodPatternUrl } from './woodPattern';

export type { FinishSpec, MaterialItem, MaterialRole, PriceUnit } from './materialCollection';
export {
  PRICE_UNIT_LABEL,
  PRICE_UNSET,
  collectionCategoryKey,
  collectionOf,
  collectionRateKey,
  materialPrice,
  materialPriceOf,
  parseFinishes,
  priceState,
} from './materialCollection';

/**
 * КАТАЛОГ МАТЕРИАЛОВ ИЗ `data/catalog/catalog.json`.
 *
 * Файл — это то, что компания получила от поставщиков: палитра МДФ-панелей,
 * 1825 цветов RAL Design, пустые пока коллекции EGGER, шпона и столешниц.
 * Он ложится в СУЩЕСТВУЮЩИЙ каталог (`catalog_items`), а не рядом с ним:
 * после загрузки позиция — такой же товар организации, как фасад или
 * петля, и правит его компания, а не файл.
 *
 * Здесь чистые функции: разбор файла, строки загрузки, вкладки, поиск,
 * позиции для сметы и операции «куда применить». Сеть, база и экран —
 * снаружи.
 */

/* ─────────────────────────  Файл  ───────────────────────── */

export type MaterialFileItem = {
  code: string;
  name: string;
  hex: string | null;
  price: number | null;
  prices: Record<string, number | null> | null;
  /**
   * ОТКУДА ПОЗИЦИЯ И ЧТО О НЕЙ НЕ ИЗВЕСТНО (P3): производитель, код декора,
   * поверхность, класс изделия, страница брошюры, статусы образца, прав и
   * цены. Есть у позиций из пакета проверки поставщика; у остальных пусто.
   */
  provenance: Record<string, unknown> | null;
};

export type MaterialCollection = {
  id: string;
  category: string;
  label: string;
  roles: MaterialRole[];
  finishes: string[];
  finishesNote: string | null;
  priceUnit: PriceUnit;
  /** Цена задаётся по поверхности (МДФ-панели), а не одна на позицию. */
  pricePerFinish: boolean;
  sourceNote: string | null;
  /**
   * КОЛЛЕКЦИЯ НА ПРОВЕРКЕ (P3): справочные карточки поставщика без цен и
   * без подтверждённых прав на изображения. В каталог организации она
   * загружается только явно — после показа того, что ляжет, и нажатием
   * человека (`planMaterialImport` с явным списком `collections`).
   */
  review: boolean;
  items: MaterialFileItem[];
};

export type MaterialFile = {
  version: number;
  generated: string;
  notes: string[];
  finishes: Record<string, FinishSpec>;
  collections: MaterialCollection[];
  /** Пакеты проверки поставщиков (P3): сколько карточек, что слито и что не встаёт. */
  reviewPacks: ReviewPack[];
};

/**
 * ПАКЕТ ПРОВЕРКИ ПОСТАВЩИКА (P3) — сводка того, что в коллекции НЕ попало:
 * слитые повторы, карточки без детали в Studio, карточки без кода. Нужна
 * показу «что ляжет» до записи — позиции в коллекциях этого уже не знают.
 */
export type ReviewPack = {
  id: string;
  label: string;
  source: string;
  records: number;
  brands: Record<string, number>;
  collections: string[];
  duplicate: number;
  ineligible: number;
  incomplete: number;
  nameUnverified: number;
  note: string;
};

function parseReviewPacks(raw: unknown): ReviewPack[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) fail('reviewPacks — не список');
  return raw.map((entry, i) => {
    const pack = entry as Record<string, unknown>;
    const num = (key: string) => (typeof pack[key] === 'number' ? (pack[key] as number) : fail('reviewPacks[' + i + ']: нет числа ' + key));
    return {
      id: text(pack.id) || fail('reviewPacks[' + i + ']: нет id'),
      label: text(pack.label),
      source: text(pack.source),
      records: num('records'),
      brands: (pack.brands as Record<string, number>) ?? {},
      collections: Array.isArray(pack.collections) ? pack.collections.map(String) : [],
      duplicate: num('duplicate'),
      ineligible: num('ineligible'),
      incomplete: num('incomplete'),
      nameUnverified: num('nameUnverified'),
      note: text(pack.note),
    };
  });
}

/** Коллекция без позиций: то, что нужно панели и без 1825 строк RAL. */
export type CollectionDef = Omit<MaterialCollection, 'items'> & { itemCount: number };

export type MaterialDefs = Omit<MaterialFile, 'collections'> & { collections: CollectionDef[] };

const HEX = /^#[0-9a-f]{6}$/i;

function parsePrice(value: unknown, where: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(`${where}: цена ${JSON.stringify(value)} — нужно число или null`);
  }
  // Ноль в файле — та же «цена не задана»: бесплатного материала не бывает.
  return value > 0 ? value : null;
}

function parseItem(
  raw: unknown,
  index: number,
  where: string,
  finishes: string[],
  codes: Set<string>,
): MaterialFileItem {
  const item = raw as Record<string, unknown> | null;
  if (!item || typeof item !== 'object') fail(`${where}: позиция №${index + 1} — не объект`);

  const code = text(item.code) || fail(`${where}: позиция №${index + 1} без кода`);
  if (codes.has(code)) fail(`${where}: код «${code}» встречается дважды`);
  codes.add(code);

  const hexRaw = item.hex;
  let hex: string | null = null;
  if (hexRaw !== undefined && hexRaw !== null) {
    if (typeof hexRaw !== 'string' || !HEX.test(hexRaw)) fail(`${where}, ${code}: цвет «${String(hexRaw)}» — нужен #rrggbb`);
    hex = hexRaw;
  }

  let prices: Record<string, number | null> | null = null;
  if (item.prices !== undefined && item.prices !== null) {
    if (typeof item.prices !== 'object' || Array.isArray(item.prices)) fail(`${where}, ${code}: prices — не объект`);
    prices = {};
    for (const [surface, value] of Object.entries(item.prices as Record<string, unknown>)) {
      if (!finishes.includes(surface)) {
        fail(`${where}, ${code}: цена за поверхность «${surface}», которой у коллекции нет`);
      }
      prices[surface] = parsePrice(value, `${where}, ${code}, ${surface}`);
    }
  }

  return {
    code,
    // У RAL имени по-русски нет, есть английское; переводить его значит выдумывать.
    name: text(item.name) || text(item.name_en),
    hex,
    price: parsePrice(item.price, `${where}, ${code}`),
    prices,
    provenance:
      item.provenance && typeof item.provenance === 'object' && !Array.isArray(item.provenance)
        ? { ...(item.provenance as Record<string, unknown>) }
        : null,
  };
}

function parseCollection(
  raw: unknown,
  index: number,
  finishes: Record<string, FinishSpec>,
  ids: Set<string>,
): MaterialCollection {
  const collection = raw as Record<string, unknown> | null;
  if (!collection || typeof collection !== 'object') fail(`коллекция №${index + 1} — не объект`);

  const id = text(collection.id) || fail(`коллекция №${index + 1} без id`);
  if (ids.has(id)) fail(`коллекция ${id} встречается дважды`);
  ids.add(id);
  const where = `коллекция ${id}`;

  const roles = (Array.isArray(collection.roles) ? collection.roles : []).map((role) =>
    MATERIAL_ROLES.includes(role as MaterialRole) ? (role as MaterialRole) : fail(`${where}: роль «${String(role)}» неизвестна`),
  );
  if (roles.length === 0) fail(`${where}: не сказано, на что идёт материал (roles)`);

  const own = (Array.isArray(collection.finishes) ? collection.finishes : []).map((finish) =>
    typeof finish === 'string' && finishes[finish]
      ? finish
      : fail(`${where}: поверхности «${String(finish)}» нет в таблице finishes`),
  );
  if (own.length === 0) fail(`${where}: нет ни одной поверхности`);

  const priceUnit = PRICE_UNITS.includes(collection.priceUnit as PriceUnit)
    ? (collection.priceUnit as PriceUnit)
    : fail(`${where}: единица цены «${String(collection.priceUnit)}» неизвестна`);

  if (collection.items !== undefined && !Array.isArray(collection.items)) fail(`${where}: items — не список`);
  const codes = new Set<string>();
  const items = ((collection.items as unknown[] | undefined) ?? []).map((item, n) =>
    parseItem(item, n, where, own, codes),
  );

  const source = collection.source as Record<string, unknown> | undefined;

  return {
    id,
    category: text(collection.category) || fail(`${where}: нет category`),
    label: text(collection.label) || fail(`${where}: нет label`),
    roles,
    finishes: own,
    finishesNote: text(collection.finishesNote) || null,
    priceUnit,
    pricePerFinish: items.some((item) => item.prices !== null),
    sourceNote: text(source?.note) || null,
    review: collection.review === true,
    items,
  };
}

export function parseMaterialFile(raw: unknown): MaterialFile {
  const file = raw as Record<string, unknown> | null;
  if (!file || typeof file !== 'object') fail('файл — не объект');
  const finishes = parseFinishes(file.finishes);
  if (!Array.isArray(file.collections)) fail('нет списка collections');
  const ids = new Set<string>();

  return {
    version: typeof file.version === 'number' ? file.version : fail('нет version'),
    generated: text(file.generated),
    notes: Array.isArray(file.notes) ? file.notes.map((note) => String(note)) : [],
    finishes,
    collections: file.collections.map((collection, i) => parseCollection(collection, i, finishes, ids)),
    reviewPacks: parseReviewPacks(file.reviewPacks),
  };
}

/** Коллекции без позиций — всё, что нужно панели, кроме самих цветов. */
export function materialDefs(file: MaterialFile): MaterialDefs {
  return {
    version: file.version,
    generated: file.generated,
    notes: file.notes,
    finishes: file.finishes,
    collections: file.collections.map(({ items, ...rest }) => ({ ...rest, itemCount: items.length })),
    reviewPacks: file.reviewPacks,
  };
}

/* ─────────────────────────  Загрузка в каталог  ───────────────────────── */

/** Строка `catalog_items` без организации и категории: их знает загрузчик. */
export type MaterialRow = {
  collectionId: string;
  article: string;
  name_ru: string;
  name_kk: string;
  price: number;
  unit: CatalogUnit;
  tiling: TilingSpec;
  meta: Record<string, unknown>;
};

export type ManualMaterialInput = {
  code: string;
  name: string;
  hex?: string | null;
  price?: number | null;
  finishPrices?: Record<string, number | null> | null;
  /** Настоящий размер фото, мм: по нему текстура ложится на деталь. */
  photoSizeMm?: [number, number] | null;
};

function rowOf(
  collection: Pick<CollectionDef, 'id' | 'roles' | 'finishes' | 'priceUnit'>,
  item: {
    code: string;
    name: string;
    hex: string | null;
    price: number | null;
    prices: Record<string, number | null> | null;
    photoSizeMm?: [number, number] | null;
    provenance?: Record<string, unknown> | null;
  },
): MaterialRow {
  return {
    collectionId: collection.id,
    // Артикул = код: по нему позицию ищут, по нему её называет выноска.
    article: item.code,
    name_ru: item.name,
    name_kk: item.name,
    /*
     * `price` в базе NOT NULL: «не задана» лежит нулём, и читает это одна
     * функция `materialPrice`. У позиции с ценами по поверхностям колонка
     * пустует, цены — в `meta.finishPrices`.
     */
    price: item.prices ? 0 : (item.price ?? 0),
    unit: CATALOG_UNIT_OF[collection.priceUnit],
    /* Настоящий размер фото — тот же `moduleSize`, что у плитки пола. */
    tiling: item.photoSizeMm
      ? { moduleSize: [item.photoSizeMm[0] / 1000, item.photoSizeMm[1] / 1000] }
      : {},
    meta: {
      ...(item.hex ? { color: item.hex } : {}),
      /*
       * Роли и поверхности — ДАННЫЕ ПОЗИЦИИ после загрузки. Каталог
       * принадлежит компании: поправит она роль у позиции — позиция её
       * и сохранит, повторная загрузка файла чужого не перезаписывает.
       */
      roles: [...collection.roles],
      finishes: [...collection.finishes],
      ...(item.prices ? { finishPrices: { ...item.prices } } : {}),
      ...(collection.priceUnit === 'sheet' ? { priceUnit: 'sheet' } : {}),
      /*
       * Провенанс пакета проверки (P3) едет с позицией в каталог: брошюра,
       * страница, статусы образца, прав и цены. Производитель — отдельным
       * полем: по нему фильтр «EGGER · GRANDEX · другие».
       */
      ...(item.provenance
        ? { provenance: { ...item.provenance }, ...(typeof item.provenance.brand === 'string' ? { brand: item.provenance.brand } : {}) }
        : {}),
    },
  };
}

/** Позиция, заведённая руками, — та же строка, что из файла. */
export function manualMaterialRow(
  collection: Pick<CollectionDef, 'id' | 'roles' | 'finishes' | 'priceUnit' | 'pricePerFinish'>,
  input: ManualMaterialInput,
): MaterialRow {
  const code = input.code.trim();
  if (!code) throw new Error('У позиции нет кода: по нему её ищут и называют на чертеже.');
  const hex = input.hex ?? null;
  if (hex !== null && !HEX.test(hex)) throw new Error(`Цвет «${hex}» не читается: нужен #rrggbb.`);
  const size = input.photoSizeMm ?? null;
  if (size && !(size[0] > 0 && size[1] > 0)) {
    throw new Error('Размер фото — два числа в миллиметрах больше нуля.');
  }

  const prices = collection.pricePerFinish
    ? Object.fromEntries(
        collection.finishes.map((finish) => {
          const value = input.finishPrices?.[finish];
          return [finish, typeof value === 'number' && value > 0 ? value : null];
        }),
      )
    : null;

  return rowOf(collection, {
    code,
    name: input.name.trim(),
    hex,
    price: typeof input.price === 'number' && input.price > 0 ? input.price : null,
    prices,
    photoSizeMm: size,
  });
}

/**
 * ЦЕНА КОЛЛЕКЦИИ НА ПОВЕРХНОСТЬ — СТРОКА КАТАЛОГА СО СТАВКОЙ.
 *
 * Та же `catalog_items`, что у ставок цеха: `meta.estimateKey` делает её
 * ставкой, и её читает `ratesFromCatalog` — второго места под цены нет.
 * Лежит она в категории своей коллекции, рядом с позициями, но позицией
 * не считается (`materialItemOf` её пропускает). Артикул выводится из
 * коллекции и поверхности: на пару — одна строка.
 */
export function collectionPriceArticle(collectionId: string, surface: string): string {
  return `price:${collectionId}:${surface}`;
}

export function collectionPriceRow(
  collection: Pick<CollectionDef, 'id' | 'label' | 'priceUnit'>,
  surface: string,
  price: number,
  surfaceLabel: string = surface,
): MaterialRow {
  return {
    collectionId: collection.id,
    article: collectionPriceArticle(collection.id, surface),
    name_ru: `Цена коллекции «${collection.label}», ${surfaceLabel}`,
    name_kk: `Цена коллекции «${collection.label}», ${surfaceLabel}`,
    price: price > 0 ? price : 0,
    unit: CATALOG_UNIT_OF[collection.priceUnit],
    tiling: {},
    meta: { estimateKey: collectionRateKey(collection.id, surface) },
  };
}

/** Категория коллекции — в `ensureCategories`: заводится, только если её нет. */
export function collectionCategory(collection: Pick<CollectionDef, 'id' | 'label' | 'priceUnit'>) {
  return {
    key: collectionCategoryKey(collection.id),
    name: collection.label,
    appliesTo: 'object' as CatalogCategory['applies_to'],
    unit: CATALOG_UNIT_OF[collection.priceUnit],
  };
}

export type ImportPlan = {
  /** Что вставить. */
  rows: MaterialRow[];
  /** Уже есть в каталоге с тем же ключом «коллекция + код». */
  skipped: number;
  /** Код занят другой коллекцией — не грузится, и это названо. */
  conflicts: string[];
  byCollection: Record<string, { inFile: number; added: number; skipped: number }>;
};

/**
 * ЧТО ДОБАВИТЬ, ЧТОБЫ ДУБЛЕЙ НЕ БЫЛО.
 *
 * Ключ позиции — коллекция + код. Артикул в каталоге организации
 * единственный (`unique (org_id, article)`), поэтому код, который уже
 * занят ДРУГОЙ коллекцией или своим товаром компании, не грузится
 * поверх и не пропадает молча — он называется конфликтом.
 */
export function planMaterialImport(
  file: MaterialFile,
  existing: { article: string; collection: string | null }[],
  /**
   * Какие коллекции грузить. Пусто — все, КРОМЕ коллекций на проверке
   * (`review`, P3): справочные карточки поставщика без цен и прав ложатся в
   * каталог только явным списком после показа того, что ляжет.
   */
  options: { collections?: string[] } = {},
): ImportPlan {
  const owner = new Map<string, string | null>();
  for (const entry of existing) owner.set(entry.article, entry.collection);

  const rows: MaterialRow[] = [];
  const conflicts: string[] = [];
  const byCollection: ImportPlan['byCollection'] = {};
  let skipped = 0;

  const wanted = (collection: MaterialCollection) =>
    options.collections ? options.collections.includes(collection.id) : !collection.review;

  for (const collection of file.collections) {
    /*
     * Коллекция, которую сейчас не грузят (на проверке или не в списке), не
     * пропадает из счёта: «в файле N, загружено 0» — числом, а не пропуском.
     */
    if (!wanted(collection)) {
      byCollection[collection.id] = { inFile: collection.items.length, added: 0, skipped: 0 };
      continue;
    }
    const tally = { inFile: collection.items.length, added: 0, skipped: 0 };
    byCollection[collection.id] = tally;

    for (const item of collection.items) {
      if (!owner.has(item.code)) {
        rows.push(rowOf(collection, item));
        owner.set(item.code, collection.id);
        tally.added += 1;
        continue;
      }
      const holder = owner.get(item.code);
      if (holder === collection.id) {
        tally.skipped += 1;
        skipped += 1;
        continue;
      }
      conflicts.push(
        `«${item.code}» уже есть в каталоге ${holder ? `в коллекции ${holder}` : 'как свой товар компании'} — ` +
          `позиция коллекции «${collection.label}» не загружена`,
      );
    }
  }

  return { rows, skipped, conflicts, byCollection };
}

/** Что ляжет из выбранных коллекций — числами, ДО записи (P3). */
export type ImportPreview = {
  collections: string[];
  /** Позиций в выбранных коллекциях файла. */
  inFile: number;
  /** Уже в каталоге организации той же коллекцией и тем же артикулом. */
  exists: number;
  /** Ляжет новыми строками. */
  fresh: number;
  /** Артикул занят другой коллекцией или своим товаром — не ляжет, назван. */
  conflict: number;
  /** Из новых — без цены: строка сметы будет «цена не задана», итог «неполный». */
  unpriced: number;
  /** Карточек пакета, слитых с такой же (производитель + код + поверхность + класс). */
  duplicate: number;
  /** Карточек без кода или поверхности. */
  incomplete: number;
  /** Карточек, которым в Studio нет детали (кромка, ламинат, компакт). */
  ineligible: number;
  /** Позиций с неподтверждённым названием. */
  nameUnverified: number;
  byCollection: ImportPlan['byCollection'];
  conflicts: string[];
};

/**
 * ПОКАЗ ИМПОРТА (P3) — тот же `planMaterialImport`, что и запись, только
 * без записи. Повторный показ после записи даёт ноль новых: ключ позиции —
 * коллекция и артикул, и второй раз она не ляжет. Чужая организация в
 * `existing` не попадает: список артикулов читает вызывающий по своей.
 */
export function importPreview(
  file: MaterialFile,
  existing: { article: string; collection: string | null }[],
  collections: string[],
): ImportPreview {
  const plan = planMaterialImport(file, existing, { collections });
  const chosen = file.collections.filter((collection) => collections.includes(collection.id));
  const packs = file.reviewPacks.filter((pack) => pack.collections.some((id) => collections.includes(id)));
  const inFile = chosen.reduce((sum, collection) => sum + collection.items.length, 0);
  const exists = Object.values(plan.byCollection).reduce((sum, tally) => sum + tally.skipped, 0);
  return {
    collections,
    inFile,
    exists,
    fresh: plan.rows.length,
    conflict: plan.conflicts.length,
    unpriced: plan.rows.filter(
      (row) => !(row.price > 0) && !Object.values((row.meta.finishPrices as Record<string, number | null> | undefined) ?? {}).some((p) => typeof p === 'number' && p > 0),
    ).length,
    duplicate: packs.reduce((sum, pack) => sum + pack.duplicate, 0),
    incomplete: packs.reduce((sum, pack) => sum + pack.incomplete, 0),
    ineligible: packs.reduce((sum, pack) => sum + pack.ineligible, 0),
    nameUnverified: chosen.reduce(
      (sum, collection) => sum + collection.items.filter((item) => item.provenance?.nameVerified === false).length,
      0,
    ),
    byCollection: plan.byCollection,
    conflicts: plan.conflicts,
  };
}

/**
 * Строки — в позиции каталога в памяти.
 *
 * Так живёт каталог демонстрации: у неё нет организации и базы, а
 * панель, смета и сцена обязаны видеть ту же позицию, что у компании.
 * Идентификатор выводится из артикула — он единственный в каталоге.
 */
export function catalogEntriesFromRows(
  rows: MaterialRow[],
  /* Нужны только коллекции — файл, их описания или одна коллекция. */
  file: { collections: Pick<CollectionDef, 'id' | 'label' | 'priceUnit'>[] },
  orgId: string,
  idPrefix: string,
): CatalogEntryFull[] {
  const categories = new Map<string, CatalogCategory>();
  file.collections.forEach((collection, index) => {
    const wanted = collectionCategory(collection);
    categories.set(collection.id, {
      id: `${idPrefix}category:${collection.id}`,
      org_id: orgId,
      key: wanted.key,
      name_ru: wanted.name,
      name_kk: wanted.name,
      applies_to: wanted.appliesTo,
      unit: wanted.unit,
      sort_order: 100 + index,
      is_active: true,
    });
  });

  return rows.map((row) => {
    const category = categories.get(row.collectionId);
    if (!category) throw new Error(`Коллекции ${row.collectionId} нет в файле — позиции «${row.article}» некуда лечь.`);
    return {
      id: `${idPrefix}${row.article}`,
      org_id: orgId,
      category_id: category.id,
      article: row.article,
      name_ru: row.name_ru,
      name_kk: row.name_kk,
      description: '',
      price: row.price,
      unit: row.unit,
      dimensions: {},
      tiling: row.tiling,
      meta: row.meta,
      is_active: true,
      category,
      assets: [],
    };
  });
}

/* ─────────────────────────  Позиции для сметы и сцены  ───────────────────────── */

/**
 * Позиция коллекции глазами сметы и сцены.
 *
 * Не из коллекции — `null`: палитра и корпус организации живут своими
 * правилами (слои 34 и 40), и этот модуль их не перечитывает.
 */
export function materialItemOf(entry: CatalogEntryFull): MaterialItem | null {
  const collection = collectionOf(entry);
  if (!collection || entry.is_active === false) return null;
  /* Цена коллекции лежит рядом с позициями, но это ставка, а не материал. */
  if (typeof entry.meta?.estimateKey === 'string' && entry.meta.estimateKey) return null;

  const color = materialColorOf(entry);
  const url = textureUrl(entry) || null;
  const size = entry.tiling?.moduleSize;
  const sized = Array.isArray(size) && size[0] > 0 && size[1] > 0;
  /*
   * ПЛИТА (ЛДСП, PerfectSense) — ДЕМОНСТРАЦИОННЫЙ РИСУНОК, А НЕ ОБРАЗЕЦ БРОШЮРЫ.
   *
   * Права на изображения EGGER не подтверждены: образец брошюры на деталь
   * плиты не кладётся (P3D-LDSP). Плита-дерево (декор H…) получает НАШ
   * рисунок — цвет, контраст и шаг колец от декора, сам рисунок условный и
   * так назван; артикул остаётся своим. Однотон и камень на плите — ровным
   * цветом самого образца: подрисованное волокно на W1000 было бы враньём.
   *
   * Столешницы — образец брошюры только с подтверждёнными правами
   * (`referenceImageAllowed`); у всех позиций пакета их нет, и столешница
   * лежит ровным цветом самого образца (материалы, финал: GRANDEX A-401 на
   * кухне выходил белым — белый множитель под картинкой, которой на проде
   * нет). Своё фото компании сильнее всего: оно её, и размер у него настоящий.
   */
  const provenance = (entry.meta?.provenance ?? null) as Record<string, unknown> | null;
  const productClass = typeof provenance?.productClass === 'string' ? provenance.productClass : null;
  /* Тот же признак, что `isBoardItem`, — но здесь позиции ещё нет, есть её строка. */
  const board = productClass === 'decorative_board' || productClass === 'perfectsense_board';
  const pattern =
    board && entry.reference
      ? woodPatternOf({
          decorCode: typeof provenance?.manufacturerDecorCode === 'string' ? provenance.manufacturerDecorCode : null,
          surfaceCode: typeof provenance?.surfaceCode === 'string' ? provenance.surfaceCode : null,
          hex: entry.reference.hex,
        })
      : null;
  const demo: MaterialPhoto | null = pattern
    ? {
        url: woodPatternUrl(pattern),
        sizeM: [WOOD_TILE_MM[0] / 1000, WOOD_TILE_MM[1] / 1000],
        procedural: pattern,
        reference: entry.reference,
        mirror: false,
      }
    : null;
  const referenceKey = !board && entry.reference && referenceImageAllowed(entry.meta) ? referenceKeyOf(entry.meta) : null;
  const reference: MaterialPhoto | null =
    entry.reference && referenceKey
      ? {
          url: referenceUrl(referenceKey),
          sizeM: [entry.reference.mm[0] / 1000, entry.reference.mm[1] / 1000] as [number, number],
          reference: entry.reference,
          mirror: true,
        }
      : null;

  return {
    id: entry.id,
    code: entry.article,
    name: entry.name_ru,
    collection,
    roles: metaRoles(entry.meta),
    finishes: metaFinishes(entry.meta),
    unit: priceUnitOf(entry),
    price: typeof entry.price === 'number' && entry.price > 0 ? entry.price : null,
    finishPrices: metaFinishPrices(entry.meta),
    colorHex: color,
    photo: url && sized ? { url, sizeM: [size![0], size![1]] } : (demo ?? reference),
    photoWithoutSize: Boolean(url) && !sized,
    brand: typeof entry.meta?.brand === 'string' && entry.meta.brand ? entry.meta.brand : null,
    review: reviewNoteOf(entry.meta),
  };
}

export function materialCatalog(entries: CatalogEntryFull[]): Map<string, MaterialItem> {
  const out = new Map<string, MaterialItem>();
  for (const entry of entries) {
    const item = materialItemOf(entry);
    if (item) out.set(item.id, item);
  }
  return out;
}

/** Плита (ЛДСП, PerfectSense) — по классу позиции из пакета поставщика. */
export function isBoardItem(item: MaterialItem): boolean {
  const cls = item.review?.productClass;
  return cls === 'decorative_board' || cls === 'perfectsense_board';
}

/**
 * БЕЛОЕ ЛДСП ДЛЯ СРАВНЕНИЯ С ДЕКОРОМ-ДЕРЕВОМ (P3D-LDSP).
 *
 * Позиция плиты с декором W1000 («белый премиум» EGGER) из каталога
 * организации — с поверхностью ST9, если такая есть. Своего «белого» код
 * не придумывает: нет такой позиции — сравнения нет, и кнопки нет.
 */
export function whiteLdspOf(items: Iterable<MaterialItem>): MaterialItem | null {
  let found: MaterialItem | null = null;
  for (const item of Array.from(items)) {
    if (!isBoardItem(item) || item.review?.decorCode !== 'W1000' || !item.colorHex) continue;
    if (item.review.surfaceCode === 'ST9') return item;
    if (!found || item.code < found.code) found = item;
  }
  return found;
}

/* ─────────────────────────  Панель: вкладки и поиск  ───────────────────────── */

/** Вкладки панели — категории файла, названные так, как их зовёт мебельщик. */
export const MATERIAL_TABS: { key: string; title: string }[] = [
  { key: 'ldsp', title: 'ЛДСП' },
  { key: 'mdf_panel', title: 'МДФ панели' },
  { key: 'mdf_paint', title: 'Эмаль RAL' },
  { key: 'veneer', title: 'Шпон' },
  { key: 'countertop', title: 'Столешницы' },
];

/**
 * Куда ложится материал.
 *
 * Полки, перегородки и антресоль — НЕЗАВИСИМО от корпуса: «корпус дуб,
 * полки белые», «антресоль в цвет фасадов». Полки и перегородки — род
 * детали по ряду (`run.carcass.shelves`/`partitions`), антресоль — её
 * модули (корпус и фасады), тем же `set_carcass`/`set_front`.
 */
export type MaterialTarget =
  | 'fronts'
  | 'carcass'
  | 'shelves'
  | 'partitions'
  | 'antresol'
  | 'countertop'
  | 'module'
  | 'leaf'
  | 'module-carcass';

export const MATERIAL_TARGETS: MaterialTarget[] = [
  'fronts',
  'carcass',
  'shelves',
  'partitions',
  'antresol',
  'countertop',
  'module',
  'leaf',
  'module-carcass',
];

export const TARGET_TITLE: Record<MaterialTarget, string> = {
  fronts: 'Фасады всей кухни',
  carcass: 'Корпус всей кухни',
  shelves: 'Полки',
  partitions: 'Перегородки',
  antresol: 'Антресоль',
  countertop: 'Столешница',
  module: 'Выбранный модуль',
  /* Одна створка или ящик (P3D-MDF): соседняя створка и корпус не трогаются. */
  leaf: 'Выбранная дверь',
  'module-carcass': 'Корпус выбранного модуля',
};

/**
 * ПОДПИСЬ ЦЕЛИ — ПО КОМНАТЕ ОБЪЕКТА (STAGE 01).
 *
 * «Фасады всей кухни» и «Корпус всей кухни» ложатся на все стены ЭТОГО
 * объекта, а объект — одна комната. В спальне подпись называла кухню,
 * которой здесь нет, и читалась как правка чужой комнаты.
 */
export function targetTitle(target: MaterialTarget, zone?: ZoneKind | null): string {
  if (!zone || zone === 'kitchen') return TARGET_TITLE[target];
  if (target === 'fronts') return 'Фасады всей комнаты';
  if (target === 'carcass') return 'Корпус всей комнаты';
  return TARGET_TITLE[target];
}

/** Выбранный модуль — это его фасад: корпус модуля красит панель модуля. */
export const TARGET_ROLE: Record<MaterialTarget, MaterialRole> = {
  fronts: 'front',
  carcass: 'carcass',
  shelves: 'carcass',
  partitions: 'carcass',
  /* Антресоль — её корпус; фасады ложатся вместе с ним, если позиция идёт и на фасад. */
  antresol: 'carcass',
  countertop: 'countertop',
  module: 'front',
  leaf: 'front',
  'module-carcass': 'carcass',
};

/** «Столешницы не идут на корпус» — винительный падеж цели. */
const TARGET_ON: Record<MaterialTarget, string> = {
  fronts: 'на фасады',
  carcass: 'на корпус',
  shelves: 'на полки',
  partitions: 'на перегородки',
  antresol: 'на корпус антресоли',
  countertop: 'на столешницу',
  module: 'на фасад модуля',
  leaf: 'на фасад двери',
  'module-carcass': 'на корпус модуля',
};

export type MaterialTab = {
  key: string;
  title: string;
  available: boolean;
  /** Почему вкладка закрыта — словами, а не серой кнопкой без ответа. */
  reason: string | null;
  /** Только те коллекции вкладки, что идут на эту цель. */
  collections: CollectionDef[];
};

/**
 * ВКЛАДКА ПОКАЗЫВАЕТ ТОЛЬКО ТО, ЧТО ИДЁТ НА ЦЕЛЬ.
 *
 * Роли — из файла: столешницу на корпус не кладут, эмаль по RAL не
 * бывает столешницей. Категория, которой нет среди пяти вкладок,
 * не пропадает молча — она получает свою вкладку с названием коллекции.
 */
export function materialTabs(collections: CollectionDef[], target: MaterialTarget): MaterialTab[] {
  const role = TARGET_ROLE[target];
  const known = new Set(MATERIAL_TABS.map((tab) => tab.key));
  const extra = Array.from(new Set(collections.map((c) => c.category).filter((key) => !known.has(key)))).map(
    (key) => ({ key, title: collections.find((c) => c.category === key)!.label }),
  );

  return [...MATERIAL_TABS, ...extra].map((tab) => {
    const inTab = collections.filter((collection) => collection.category === tab.key);
    const fitting = inTab.filter((collection) => collection.roles.includes(role));
    return {
      key: tab.key,
      title: tab.title,
      available: fitting.length > 0,
      reason:
        fitting.length > 0
          ? null
          : inTab.length === 0
            ? `«${tab.title}»: в каталоге таких коллекций нет`
            : `«${tab.title}» не идут ${TARGET_ON[target]}`,
      collections: fitting,
    };
  });
}

const normal = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

/** Поиск по коду и названию, без учёта регистра и лишних пробелов. */
export function searchMaterials<T extends Pick<CatalogEntryFull, 'article' | 'name_ru'>>(
  entries: T[],
  query: string,
): T[] {
  const needle = normal(query);
  if (!needle) return entries;
  return entries.filter(
    (entry) => normal(entry.article).includes(needle) || normal(entry.name_ru).includes(needle),
  );
}

/* ─────────────────────────  Куда применить  ───────────────────────── */

/**
 * Из чего фасад — по категории коллекции.
 *
 * Правила технологии и раскрой (кромка, радиус, филёнка) знают базу, а не
 * коллекцию. МДФ-панели High Gloss / Touch Sense — это плита с
 * покрытием, которую кроят и кромят, как акрил; эмаль по RAL — крашеный
 * МДФ, без кромки. Категории, которой здесь нет, база не выдумывается —
 * её позиция фасадом не ставится, и отказ это называет.
 */
export const FRONT_BASE_OF_CATEGORY: Record<string, FrontBase> = {
  ldsp: 'ldsp',
  mdf_panel: 'acrylic',
  mdf_paint: 'mdf_enamel',
  veneer: 'veneer_solid',
};

/**
 * Глянец, мат или текстура — для чертежа и правил, по поверхности.
 *
 * Поверхность, которой нет в таблице, не получает выдуманного ответа:
 * глянцем её делает шероховатость из файла, а не догадка.
 */
const FINISH_OF_SURFACE: Record<string, FrontFinish> = {
  high_gloss: 'gloss',
  gloss: 'gloss',
  touch_sense: 'matte',
  matte: 'matte',
  satin: 'matte',
  wood_texture: 'textured',
};

export function frontFinishOf(surface: string, finishes: Record<string, FinishSpec>): FrontFinish {
  const known = FINISH_OF_SURFACE[surface];
  if (known) return known;
  const spec = finishes[surface];
  return spec && spec.roughness <= 0.3 ? 'gloss' : 'matte';
}

export type MaterialChoice = {
  item: MaterialItem;
  collection: Pick<CollectionDef, 'id' | 'category' | 'label' | 'roles' | 'finishes'>;
  /** Поверхность из списка коллекции. */
  surface: string;
};

export type MaterialPlan = { ops: MillworkOp[]; note: string | null } | { refusal: string };

/** Фасад из позиции — поверх того, что человек уже выбрал на модуле. */
function frontFrom(current: FrontSpec, choice: MaterialChoice, finishes: Record<string, FinishSpec>) {
  const base = FRONT_BASE_OF_CATEGORY[choice.collection.category];
  const next: FrontSpec = {
    ...current,
    base,
    finish: frontFinishOf(choice.surface, finishes),
    surface: choice.surface,
    colorHex: choice.item.colorHex ?? undefined,
    itemId: choice.item.id,
  };
  /*
   * Конструкция, которой у новой базы не бывает, возвращается к цельной —
   * так же, как в выборе материала модуля: человек выбрал МАТЕРИАЛ.
   * Конструкцию, которая годится, не трогаем: её выбрал человек.
   */
  const reset = frontConflict(next) !== null;
  if (reset) next.construct = 'solid';
  /*
   * Рисунок МДФ (P3D-MDF), которого у новой базы не бывает (ЛДСП, акрил не
   * фрезеруют), снимается — человек выбрал материал, и это сказано словами,
   * а не отказом всей правки.
   */
  const reliefDropped = Boolean(next.relief) && frontConflict(next) !== null;
  if (reliefDropped) {
    delete next.relief;
    if (next.millingId === NO_MILLING_ID) delete next.millingId;
  }
  return { front: next, reset, reliefDropped };
}

/**
 * ОПЕРАЦИИ «ПОЛОЖИТЬ МАТЕРИАЛ НА ЦЕЛЬ» ДЛЯ ОДНОГО РЯДА.
 *
 * Тот же механизм, что у материала модуля сегодня: `set_front` на
 * каждый модуль с фасадом, `set_carcass` на каждую полосу ряда,
 * `set_countertop` на ряд. Поэтому выбор переживает правки ряда и
 * закрытие объекта: он лежит в модулях и в ряду, а не рядом с ними.
 *
 * `set_front` идёт ПОМОДУЛЬНО, а не одной операцией на всё: у модулей
 * своя конструкция и своя фрезеровка, и одна спецификация на весь ряд
 * молча стёрла бы их.
 */
export function materialOps(
  target: MaterialTarget,
  choice: MaterialChoice,
  run: Run,
  selectedModuleId: string | null,
  finishes: Record<string, FinishSpec> = {},
  /** Выбранная створка модуля (P3D-MDF): `door:1`. Нужна цели «Выбранная дверь». */
  leaf: string | null = null,
): MaterialPlan {
  const role = TARGET_ROLE[target];
  /* Роли позиции — её данные; у позиции без них — роли её коллекции. */
  const roles = choice.item.roles.length > 0 ? choice.item.roles : choice.collection.roles;
  if (!roles.includes(role)) {
    return { refusal: `«${choice.item.code}» не идёт ${TARGET_ON[target]}.` };
  }
  if (!choice.collection.finishes.includes(choice.surface)) {
    return {
      refusal: `У «${choice.collection.label}» нет поверхности «${choice.surface}».`,
    };
  }

  if (target === 'countertop') {
    const zone = zoneProfile(run.zone);
    if (!zone.hasCountertop) {
      const where = zone.locative.charAt(0).toUpperCase() + zone.locative.slice(1);
      return { refusal: `${where} столешницы нет — класть её некуда.` };
    }
    return { ops: [{ op: 'set_countertop', itemId: choice.item.id, surface: choice.surface }], note: null };
  }

  if (target === 'carcass') {
    return {
      ops: CARCASS_SCOPES.map((scope) => ({ op: 'set_carcass' as const, scope: scope.key, itemId: choice.item.id })),
      note: null,
    };
  }

  /*
   * ПОЛКИ И ПЕРЕГОРОДКИ — род детали по ряду: тот же `set_carcass`, адрес —
   * деталь. Корпус не трогается; полки, которые появятся потом, возьмут
   * этот декор сами — он лежит на ряду, а не в сегодняшних модулях.
   */
  if (target === 'shelves' || target === 'partitions') {
    return { ops: [{ op: 'set_carcass', part: target, itemId: choice.item.id }], note: null };
  }

  /*
   * АНТРЕСОЛЬ ЦЕЛИКОМ — корпус и фасады её модулей (полоса антресоли,
   * кладовка над колонной, корпус над шкафом). Позиция только для корпуса
   * фасады не трогает, и это сказано словами.
   */
  if (target === 'antresol') {
    const units = allModules(run).filter(isAntresol);
    if (units.length === 0) {
      return { refusal: 'Антресоли на этой стене нет — сначала поставьте её, затем выбирайте материал.' };
    }
    const ops: MillworkOp[] = units.map((unit) => ({ op: 'set_carcass', moduleId: unit.id, itemId: choice.item.id }));
    const toFronts = roles.includes('front') && Boolean(FRONT_BASE_OF_CATEGORY[choice.collection.category]);
    let reset = 0;
    if (toFronts) {
      for (const unit of units.filter((m) => hasFacade(m))) {
        const made = frontFrom(frontOf(unit), choice, finishes);
        if (made.reset) reset += 1;
        ops.push({ op: 'set_front', moduleId: unit.id, front: made.front });
      }
    }
    return {
      ops,
      note: !toFronts
        ? `Фасады антресоли не тронуты: «${choice.item.code}» не идёт на фасады — только корпус.`
        : reset > 0
          ? `${modulesWord(reset)} цельными: у «${choice.collection.label}» прежней конструкции не бывает.`
          : null,
    };
  }

  /*
   * КОРПУС ОДНОГО МОДУЛЯ (P3): тот же `set_carcass`, адрес — модуль. Соседи
   * не трогаются: «EGGER на корпус левого шкафа» — это ровно левый шкаф.
   */
  if (target === 'module-carcass') {
    if (!selectedModuleId) return { refusal: 'Выберите модуль в сцене — материал ляжет на его корпус.' };
    const unit = allModules(run).find((m) => m.id === selectedModuleId);
    if (!unit) return { refusal: `Модуля ${selectedModuleId} на этой стене нет.` };
    return { ops: [{ op: 'set_carcass', moduleId: unit.id, itemId: choice.item.id }], note: null };
  }

  if (!FRONT_BASE_OF_CATEGORY[choice.collection.category]) {
    return {
      refusal: `Для «${choice.collection.label}» не сказано, из чего фасад, — фасадом её не поставить.`,
    };
  }

  /*
   * ОДНА ДВЕРЬ (P3D-MDF): `set_leaf_front` — фасад этой створки, поверх того,
   * что у неё сейчас (свой или модульный). Соседняя створка и корпус те же.
   */
  if (target === 'leaf') {
    if (!selectedModuleId || !leaf) {
      return { refusal: 'Выберите дверь — в сцене или в списке дверей шкафа: материал ляжет на неё одну.' };
    }
    const unit = allModules(run).find((m) => m.id === selectedModuleId);
    if (!unit) return { refusal: `Модуля ${selectedModuleId} на этой стене нет.` };
    if (!hasFacade(unit)) return { refusal: `У «${unit.label}» фасада нет — красить нечего.` };
    const made = frontFrom(leafFrontOf(unit, leaf), choice, finishes);
    return {
      ops: [{ op: 'set_leaf_front', moduleId: unit.id, leaf, front: made.front }],
      note: made.reliefDropped
        ? `Рисунок фасада снят: «${choice.collection.label}» не фрезеруют.`
        : made.reset
          ? `Дверь стала цельной: у «${choice.collection.label}» прежней конструкции не бывает.`
          : null,
    };
  }

  const fronts: Module[] =
    target === 'module'
      ? allModules(run).filter((unit) => unit.id === selectedModuleId)
      : allModules(run).filter((unit) => hasFacade(unit));

  if (target === 'module') {
    if (!selectedModuleId) return { refusal: 'Выберите модуль в сцене — материал ляжет на его фасад.' };
    const unit = fronts[0];
    if (!unit) return { refusal: `Модуля ${selectedModuleId} на этой стене нет.` };
    if (!hasFacade(unit)) return { refusal: `У «${unit.label}» фасада нет — красить нечего.` };
  }
  if (fronts.length === 0) return { refusal: 'Мебели на этой стене пока нет — красить нечего.' };

  let reset = 0;
  let dropped = 0;
  const ops: MillworkOp[] = fronts.map((unit) => {
    const made = frontFrom(frontOf(unit), choice, finishes);
    if (made.reset) reset += 1;
    if (made.reliefDropped) dropped += 1;
    return { op: 'set_front', moduleId: unit.id, front: made.front };
  });

  /*
   * «НА ВСЮ КУХНЮ» — ЭТО И МАТЕРИАЛ КУХНИ, А НЕ ТОЛЬКО СЕГОДНЯШНИЕ МОДУЛИ.
   *
   * Модуль, который появится после выбора, возьмёт его сам (`applyOps`).
   * Материал кухни — цельный фасад позиции: конструкцию нового модуля
   * никто не выбирал.
   */
  if (target === 'fronts') {
    ops.push({ op: 'set_kitchen_front', front: frontFrom(DEFAULT_FRONT, choice, finishes).front });
  }

  return {
    ops,
    note:
      dropped > 0
        ? `Рисунок фасада снят у ${dropped} мод.: «${choice.collection.label}» не фрезеруют.`
        : reset > 0
          ? `${modulesWord(reset)} цельными: у «${choice.collection.label}» прежней конструкции не бывает.`
          : null,
  };
}

/** «1 модуль стал», «3 модуля стали», «5 модулей стали». */
function modulesWord(n: number): string {
  const tens = n % 100;
  const ones = n % 10;
  if (tens >= 11 && tens <= 14) return `${n} модулей стали`;
  if (ones === 1) return `${n} модуль стал`;
  if (ones >= 2 && ones <= 4) return `${n} модуля стали`;
  return `${n} модулей стали`;
}
