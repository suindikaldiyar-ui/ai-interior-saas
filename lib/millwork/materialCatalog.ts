import { textureUrl } from '@/lib/catalog';
import type { CatalogCategory, CatalogEntryFull, CatalogUnit, TilingSpec } from '@/types/catalog';
import type { FrontBase, FrontFinish, FrontSpec, MillworkOp, Module, Run } from '@/types/millwork';
import { hasFacade } from './applianceFront';
import { CARCASS_SCOPES } from './carcassMaterial';
import { DEFAULT_FRONT, frontConflict, frontOf } from './frontMaterial';
import { allModules } from './layout';
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
  type MaterialItem,
  type MaterialRole,
  type PriceUnit,
} from './materialCollection';
import { zoneProfile } from './zones';

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
  items: MaterialFileItem[];
};

export type MaterialFile = {
  version: number;
  generated: string;
  notes: string[];
  finishes: Record<string, FinishSpec>;
  collections: MaterialCollection[];
};

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
): ImportPlan {
  const owner = new Map<string, string | null>();
  for (const entry of existing) owner.set(entry.article, entry.collection);

  const rows: MaterialRow[] = [];
  const conflicts: string[] = [];
  const byCollection: ImportPlan['byCollection'] = {};
  let skipped = 0;

  for (const collection of file.collections) {
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
    photo: url && sized ? { url, sizeM: [size![0], size![1]] } : null,
    photoWithoutSize: Boolean(url) && !sized,
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

/* ─────────────────────────  Панель: вкладки и поиск  ───────────────────────── */

/** Вкладки панели — категории файла, названные так, как их зовёт мебельщик. */
export const MATERIAL_TABS: { key: string; title: string }[] = [
  { key: 'ldsp', title: 'ЛДСП' },
  { key: 'mdf_panel', title: 'МДФ панели' },
  { key: 'mdf_paint', title: 'Эмаль RAL' },
  { key: 'veneer', title: 'Шпон' },
  { key: 'countertop', title: 'Столешницы' },
];

/** Куда ложится материал. */
export type MaterialTarget = 'fronts' | 'carcass' | 'countertop' | 'module';

export const MATERIAL_TARGETS: MaterialTarget[] = ['fronts', 'carcass', 'countertop', 'module'];

export const TARGET_TITLE: Record<MaterialTarget, string> = {
  fronts: 'Фасады всей кухни',
  carcass: 'Корпус всей кухни',
  countertop: 'Столешница',
  module: 'Выбранный модуль',
};

/** Выбранный модуль — это его фасад: корпус модуля красит панель модуля. */
export const TARGET_ROLE: Record<MaterialTarget, MaterialRole> = {
  fronts: 'front',
  carcass: 'carcass',
  countertop: 'countertop',
  module: 'front',
};

/** «Столешницы не идут на корпус» — винительный падеж цели. */
const TARGET_ON: Record<MaterialTarget, string> = {
  fronts: 'на фасады',
  carcass: 'на корпус',
  countertop: 'на столешницу',
  module: 'на фасад модуля',
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
  return { front: next, reset };
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

  if (!FRONT_BASE_OF_CATEGORY[choice.collection.category]) {
    return {
      refusal: `Для «${choice.collection.label}» не сказано, из чего фасад, — фасадом её не поставить.`,
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
  const ops: MillworkOp[] = fronts.map((unit) => {
    const made = frontFrom(frontOf(unit), choice, finishes);
    if (made.reset) reset += 1;
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
      reset > 0
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
