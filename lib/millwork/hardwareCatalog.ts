import {
  HARDWARE_GROUPS,
  type CatalogEntryFull,
  type HardwareBrand,
  type HardwareMeta,
} from '@/types/catalog';
import facts from '@/data/catalog/hardware.json';
import { parseCsv } from '@/lib/csv';
import { sanitizeHardwareMeta } from './hardware';

/**
 * КАТАЛОГ ФУРНИТУРЫ ПРОИЗВОДИТЕЛЕЙ (HARDWARE-01).
 *
 * Одна точка на импорт в каталог организации, демонстрацию и приёмку:
 *
 *   факты   — `data/catalog/hardware.json`: что напечатано в каталогах
 *             производителей, которые лежат в `MANUFACTURER_CATALOGS`
 *             (Blum, Hettich, Häfele): артикул как напечатан, название,
 *             размеры для подбора под каноническими именами (`FIT_KEYS`),
 *             размеры «как напечатано» словами, присадка как напечатана,
 *             файл, страница и дата сверки, инженерный статус и чего нет.
 *             Сведены `scripts/hardware-facts.mjs` из сверенных по
 *             изображению страниц (`CATALOG_STAGING/02_HARDWARE`).
 *   строка  — `hardwareCatalogRow`: товар `catalog_items` с `meta.hardware`
 *             (ловушка 19 — второго каталога нет). Цены нет: ноль — «цена
 *             не задана», рыночная цена не подставляется.
 *
 * CAD производителей здесь нет: у Blum он за входом, у Hettich скачивание —
 * это согласие с условиями, у BOYARD права не подтверждены. Сцена рисует
 * своё приближение по размерам паспорта (`VISUAL_APPROXIMATION`), и это
 * сказано у каждой позиции.
 */

/** Запись факта: артикул каталога организации, бренд, название и запись изделия. */
export type HardwareFact = {
  /** Артикул позиции каталога: `MFR-<ПРОИЗВОДИТЕЛЬ>-<артикул без пробелов>`. Ключ дубля при импорте. */
  article: string;
  /** Бренд из списка продукта; производителя вне списка нет в бренде — только в записи. */
  brand?: HardwareBrand;
  /** Название позиции для каталога организации. */
  name: string;
  hardware: HardwareMeta;
};

export type HardwareFactSource = {
  key: string;
  manufacturer: string;
  file: string;
  pages: number | null;
  /** Как печатная страница соотносится с индексом PDF — словами. */
  pageRule: string;
};

type FactsFile = {
  checkedAt: string;
  sources: HardwareFactSource[];
  /** Чего в локальных каталогах нет — словами (BOYARD, GTV, DTC, CAD). */
  notFound: string[];
  items: HardwareFact[];
};

const FILE = facts as unknown as FactsFile;

export const HARDWARE_FACTS: HardwareFact[] = FILE.items;
export const HARDWARE_FACTS_CHECKED_AT: string = FILE.checkedAt;
export const HARDWARE_SOURCES: HardwareFactSource[] = FILE.sources;
export const HARDWARE_NOT_FOUND: string[] = FILE.notFound;

/** Префикс артикула позиций производителей: не пересекается с типовым прайсом (`HW-…`). */
export const MFR_ARTICLE_PREFIX = 'MFR-';

/**
 * КАНОНИЧЕСКИЕ ИМЕНА РАЗМЕРОВ ДЛЯ ПОДБОРА — что читает движок
 * (`fittings.ts`, `drawerBox.ts`). Подпись — для карточки. Число в
 * паспорте одно; здесь оно под именем, по которому его спрашивают.
 */
export const FIT_KEYS: Record<string, { title: string; kind: 'mm' | 'range' }> = {
  nominalLength: { title: 'NL — номинальная длина', kind: 'mm' },
  sideClearance: { title: 'Монтажная ширина с каждой стороны', kind: 'mm' },
  minCabinetDepth: { title: 'KT — мин. глубина корпуса (накладной фасад)', kind: 'mm' },
  minCabinetSide: { title: 'Мин. толщина боковины корпуса', kind: 'mm' },
  minDrawerSide: { title: 'Мин. толщина боковины ящика', kind: 'mm' },
  maxDrawerSide: { title: 'Макс. толщина боковины ящика', kind: 'mm' },
  railHeight: { title: 'Высота направляющей', kind: 'mm' },
  plateHeight: { title: 'MD — подъём ответной планки', kind: 'mm' },
  cupDiameter: { title: 'Чашка петли, Ø', kind: 'mm' },
  cupDepth: { title: 'Глубина сверления чашки', kind: 'mm' },
  /* Петля и планка (HW-03): числа присадки паспорта под своими именами — сцена читает их без паспорта. */
  flangeWidth: { title: 'FLB — ширина фланца чашки', kind: 'mm' },
  plateHoleSpacing: { title: 'Планка: между отверстиями', kind: 'mm' },
  plateHoleFromEdge: { title: 'Планка: отверстия от передней кромки', kind: 'mm' },
  /* Короб скрытого монтажа (HW-04): формулы паспорта «SKW = LW − …» и «SKL = NL − …». */
  drawerInnerDeduct: { title: 'SKW = LW − … — внутренняя ширина ящика', kind: 'mm' },
  drawerLengthDeduct: { title: 'SKL = NL − … — длина ящика', kind: 'mm' },
  /* Система ящика (HW-04): высота царги и раскрой дна и задней стенки по формулам паспорта. */
  sideHeight: { title: 'Высота царги', kind: 'mm' },
  bottomWidthDeduct: { title: 'Дно: ширина LW − …', kind: 'mm' },
  bottomLengthDeduct: { title: 'Дно: длина NL − … (задняя стенка из ДСП)', kind: 'mm' },
  backWidthDeduct: { title: 'Задняя стенка: ширина LW − …', kind: 'mm' },
  backHeight: { title: 'Задняя стенка: высота', kind: 'mm' },
  cabinetWidth: { title: 'Под корпус шириной', kind: 'mm' },
  minInnerDepth: { title: 'Мин. глубина корпуса в свету', kind: 'mm' },
  length: { title: 'Длина', kind: 'mm' },
  holeSpacing: { title: 'Межосевое расстояние', kind: 'mm' },
  reach: { title: 'Вылет вперёд', kind: 'mm' },
  doorsInKit: { title: 'Дверей в комплекте', kind: 'mm' },
  doorThickness: { title: 'Толщина фасада', kind: 'range' },
  boringDistance: { title: 'TB — от кромки до чашки', kind: 'range' },
  cabinetInnerWidth: { title: 'Ширина корпуса в свету', kind: 'range' },
  cabinetInnerHeight: { title: 'Высота корпуса в свету', kind: 'range' },
  cabinetHeight: { title: 'Высота корпуса', kind: 'range' },
  frontHeight: { title: 'Высота фасада', kind: 'range' },
  frontWidth: { title: 'Ширина фасада', kind: 'range' },
  powerFactor: { title: 'Фактор мощности', kind: 'range' },
  legHeight: { title: 'Высота опоры', kind: 'range' },
  drawerSide: { title: 'Толщина боковины ящика', kind: 'range' },
  /* Ручки (HANDLE-REAL): размеры, по которым строится модель ручки. */
  projection: { title: 'B — вылет ручки от фасада', kind: 'mm' },
  diameter: { title: 'Диаметр', kind: 'mm' },
  flangeDiameter: { title: 'A — диаметр фланца', kind: 'mm' },
  bodyDiameter: { title: 'B — диаметр корпуса', kind: 'mm' },
  bodyDepth: { title: 'C — глубина корпуса', kind: 'mm' },
  flangeThickness: { title: 'Толщина фланца', kind: 'mm' },
  edgeDepth: { title: 'Глубина профиля в плане', kind: 'mm' },
  edgeDepthEnd: { title: 'Глубина профиля на краю (волна)', kind: 'mm' },
  backLeg: { title: 'Стенка по тылу фасада', kind: 'mm' },
  lipHeight: { title: 'Губа по лицу фасада', kind: 'mm' },
  edgeReach: { title: 'Вылет губы', kind: 'mm' },
  sheetThickness: { title: 'Толщина листа', kind: 'mm' },
};

/** Наложение по высоте планки: «overlayMd3» — FA при MD 3 мм. */
export function fitKeyTitle(key: string): string {
  const md = /^overlayMd(-?\d+(?:\.\d+)?)$/.exec(key);
  if (md) return `FA — наложение при планке MD ${md[1]}`;
  return FIT_KEYS[key]?.title ?? key;
}

/** Группа A–I позиции — по категории; прежние ключи — в свою группу. */
export function hardwareGroupOf(category: HardwareMeta['category']): (typeof HARDWARE_GROUPS)[number] {
  return HARDWARE_GROUPS.find((group) => group.categories.includes(category)) ?? HARDWARE_GROUPS[HARDWARE_GROUPS.length - 1];
}

/** Поиск по артикулу (с пробелами и без), названию, серии и производителю. */
export function hardwareMatches(entry: { article: string; name: string; hardware: HardwareMeta }, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return true;
  const squeeze = (value: string | undefined) => (value ?? '').toLowerCase().replace(/[\s.]/g, '');
  const qs = q.replace(/[\s.]/g, '');
  const h = entry.hardware;
  return (
    entry.name.toLowerCase().includes(q) ||
    (h.officialName ?? '').toLowerCase().includes(q) ||
    (h.series ?? '').toLowerCase().includes(q) ||
    (h.manufacturer ?? '').toLowerCase().includes(q) ||
    squeeze(h.manufacturerArticle).includes(qs) ||
    squeeze(entry.article).includes(qs)
  );
}

/**
 * ФАКТ В ВИДЕ ТОВАРА КАТАЛОГА — для импорта в `/admin/catalog`.
 *
 * Цена — ноль, и это «цена не задана» (ловушка 452): рыночную цену не
 * подставляем. Единица строки — как в паспорте: комплект — «компл.»,
 * иначе штука; что такое «компл.», решает `saleUnit` (нет в паспорте —
 * смета цену не применит, пока компания не укажет).
 */
export function hardwareCatalogRow(fact: HardwareFact) {
  return {
    article: fact.article,
    name_ru: fact.name,
    name_kk: fact.name,
    price: 0,
    unit: (fact.hardware.saleUnit === 'set' ? 'set' : 'piece') as 'set' | 'piece',
    categoryKey: 'hardware',
    meta: { hardware: fact.hardware },
  };
}

export type HardwareCatalogRow = ReturnType<typeof hardwareCatalogRow>;

/* ─────────────────────────  импорт в каталог организации  ───────────────────────── */

/** Строка каталога организации с артикулом «MFR-…» — то, что импорт видит до записи. */
export type HardwareExistingRow = { id: string; article: string; meta: Record<string, unknown> | null };

export type HardwareImportCount = { found: number; insert: number; update: number; unchanged: number; verified: number };

export type HardwareImportPlan = {
  insert: HardwareCatalogRow[];
  /** Своя строка производителя, у которой поменялась запись изделия: только `meta.hardware`. */
  update: { id: string; article: string; meta: Record<string, unknown> }[];
  unchanged: string[];
  /** Артикул занят чужой позицией или задвоен — строка не трогается, причина словами. */
  conflicts: { article: string; why: string }[];
  /** Ошибки входа (загрузка файла): строка не принята — почему. */
  errors: { article: string; why: string }[];
  /** По группам A–I и по производителям. */
  byGroup: Record<string, HardwareImportCount>;
  byManufacturer: Record<string, HardwareImportCount>;
};

/** JSON с упорядоченными ключами — «поменялось ли» без зависимости от порядка полей. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v,
  );
}

/**
 * ЧТО ЛЯЖЕТ В КАТАЛОГ ОРГАНИЗАЦИИ — до записи.
 *
 * Ключ дубля — артикул «MFR-<производитель>-<артикул>». Новой позиции —
 * строка целиком (цена ноль, «цена не задана»). Своя строка производителя
 * обновляет в `meta` ровно запись изделия (`meta.hardware`) — и в ней
 * единицу продажи, которую компания указала сама, не трогает; цена,
 * название, активность и прочее компании импорт не трогает. Ничего не
 * удаляется. Артикул, занятый позицией не производителя или задвоенный, —
 * конфликт словами. Повтор того же файла — ноль новых, всё «без изменений».
 */
export function planHardwareImport(existing: HardwareExistingRow[], list: HardwareFact[] = HARDWARE_FACTS): HardwareImportPlan {
  const byArticle = new Map<string, HardwareExistingRow[]>();
  for (const row of existing) {
    const rows = byArticle.get(row.article) ?? [];
    rows.push(row);
    byArticle.set(row.article, rows);
  }
  const zero = (): HardwareImportCount => ({ found: 0, insert: 0, update: 0, unchanged: 0, verified: 0 });
  const plan: HardwareImportPlan = {
    insert: [],
    update: [],
    unchanged: [],
    conflicts: [],
    errors: [],
    byGroup: Object.fromEntries(HARDWARE_GROUPS.map((group) => [group.key, zero()])),
    byManufacturer: {},
  };
  const seen = new Set<string>();
  for (const fact of list) {
    if (!fact.article.startsWith(MFR_ARTICLE_PREFIX)) {
      plan.errors.push({ article: fact.article, why: `артикул позиции производителя начинается с «${MFR_ARTICLE_PREFIX}»` });
      continue;
    }
    if (seen.has(fact.article)) {
      plan.errors.push({ article: fact.article, why: 'артикул повторяется во входе — вторая запись не принята' });
      continue;
    }
    seen.add(fact.article);
    const manufacturer = fact.hardware.manufacturer ?? '—';
    const buckets = [plan.byGroup[hardwareGroupOf(fact.hardware.category).key], (plan.byManufacturer[manufacturer] ??= zero())];
    const count = (field: keyof HardwareImportCount) => buckets.forEach((bucket) => (bucket[field] += 1));
    count('found');
    if (fact.hardware.engineeringStatus === 'VERIFIED') count('verified');

    const row = hardwareCatalogRow(fact);
    const mine = byArticle.get(fact.article) ?? [];
    if (mine.length === 0) {
      plan.insert.push(row);
      count('insert');
      continue;
    }
    if (mine.length > 1) {
      plan.conflicts.push({ article: fact.article, why: `в каталоге ${mine.length} позиции с этим артикулом — какую обновлять, не угадываем` });
      continue;
    }
    const current = mine[0];
    const meta = current.meta ?? {};
    const had = meta.hardware as Partial<HardwareMeta> | undefined;
    if (!had?.manufacturer) {
      plan.conflicts.push({ article: fact.article, why: 'артикул занят позицией не из каталога производителя — она не трогается' });
      continue;
    }
    /* Единицу продажи, которую указала компания, импорт не стирает. */
    const hardware: HardwareMeta =
      had.saleUnit && !fact.hardware.saleUnit ? { ...fact.hardware, saleUnit: had.saleUnit } : fact.hardware;
    const nextMeta: Record<string, unknown> = { ...meta, hardware };
    if (stable(nextMeta) === stable(meta)) {
      plan.unchanged.push(fact.article);
      count('unchanged');
    } else {
      plan.update.push({ id: current.id, article: fact.article, meta: nextMeta });
      count('update');
    }
  }
  return plan;
}

/**
 * ДЕМОНСТРАЦИЯ: недостающие позиции производителей строками её каталога —
 * той же формы, что получила бы организация. Категория и поля — у первой
 * строки демо; нет демо-строк — не демо, ничего не добавляется.
 */
export function hardwareDemoEntries(catalog: CatalogEntryFull[]): CatalogEntryFull[] {
  const template = catalog.find((entry) => entry.org_id === 'demo');
  if (!template) return [];
  const have = new Set(catalog.map((entry) => entry.article));
  return HARDWARE_FACTS.filter((fact) => !have.has(fact.article)).map((fact) => {
    const row = hardwareCatalogRow(fact);
    return {
      ...template,
      id: `demo-${fact.article}`,
      article: row.article,
      name_ru: row.name_ru,
      name_kk: row.name_kk,
      description: '',
      price: row.price,
      unit: row.unit,
      dimensions: {},
      tiling: {},
      meta: row.meta as unknown as CatalogEntryFull['meta'],
      is_active: true,
      assets: [],
    };
  });
}

/* ─────────────────────────  своя пачка: JSON или CSV  ───────────────────────── */

/** Комбинирующие диакритические знаки (U+0300…U+036F) — то, что NFD отделяет от буквы. */
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');

/**
 * Кириллица латиницей. Без неё «Боярд» и «Компания» оба становились «MFR», и
 * их одинаковые артикулы сливались в одну строку каталога — ключ «производитель
 * + артикул» терял производителя.
 */
const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ә: 'a', ғ: 'g', қ: 'q', ң: 'n', ө: 'o', ұ: 'u',
  ү: 'u', һ: 'h', і: 'i',
};
const CYRILLIC_LETTER = /[а-яёәғқңөұүһі]/g;

/** Производитель в артикуле: латиница и цифры, без диакритики («Häfele» → «HAFELE», «Боярд» → «BOYARD»). */
export function manufacturerSlug(name: string): string {
  const latin = name
    .toLowerCase()
    .replace(CYRILLIC_LETTER, (letter) => CYRILLIC[letter] ?? '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
  return latin || 'MFR';
}

/** Артикул строки каталога: «MFR-HETTICH-9114271» — производитель и артикул без пробелов. */
export function manufacturerArticleKey(manufacturer: string, article: string): string {
  return `${MFR_ARTICLE_PREFIX}${manufacturerSlug(manufacturer)}-${article.replace(/\s+/g, '')}`;
}

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '');

/**
 * СВОЯ ПАЧКА ПОЗИЦИЙ — те же записи и та же проверка, что у фактов.
 *
 * Строка без производителя, без артикула или с категорией не из списка не
 * принимается — причина словами; остальные строки пачки идут дальше. Числа
 * — только конечные; неизвестное остаётся отсутствием, а не нулём.
 */
export function uploadedFacts(rows: unknown): { facts: HardwareFact[]; errors: { article: string; why: string }[] } {
  const facts: HardwareFact[] = [];
  const errors: { article: string; why: string }[] = [];
  if (!Array.isArray(rows)) return { facts, errors: [{ article: '—', why: 'пачка — не список строк' }] };
  rows.forEach((raw, i) => {
    /* Запись фактов (`{ article, name, hardware }`) — та же строка: выгрузка каталога читается обратно как есть. */
    const given = (raw ?? {}) as Record<string, unknown>;
    const nested = given.hardware && typeof given.hardware === 'object' && !Array.isArray(given.hardware);
    const row = nested ? { ...(given.hardware as Record<string, unknown>), name: given.name } : given;
    const manufacturer = asText(row.manufacturer);
    const article = asText(row.manufacturerArticle ?? row.article);
    const where = article || `строка ${i + 1}`;
    if (!manufacturer) return errors.push({ article: where, why: 'нет производителя' });
    if (!article) return errors.push({ article: where, why: 'нет артикула производителя' });
    const hardware = sanitizeHardwareMeta({ ...row, manufacturer, manufacturerArticle: article });
    if (!hardware) return errors.push({ article: where, why: `категория «${asText(row.category) || '—'}» не из списка групп A–I` });
    const name = asText(row.name) || `${manufacturer} ${hardware.officialName ?? ''} ${article}`.replace(/\s+/g, ' ').trim();
    facts.push({ article: manufacturerArticleKey(manufacturer, article), ...(hardware.brand ? { brand: hardware.brand } : {}), name, hardware });
  });
  return { facts, errors };
}

/**
 * CSV ПОЗИЦИЙ ФУРНИТУРЫ → строки пачки. Разделитель «;» или «,», BOM и
 * windows-1251 снимает тот же разбор, что у прайса (`parseCsv`). Колонки
 * по заголовку: manufacturer; article; name; category; subcategory; series;
 * variant; saleUnit; packaging; loadKg; engineeringStatus; sourceFile;
 * pdfPage; printedPage; checkedAt; dimensions («nominalLength=500,
 * sideClearance=12.7»); ranges («doorThickness=15..24»); missing («a | b»).
 */
export function csvHardwareRows(text: string): Record<string, unknown>[] {
  const table = parseCsv(text);
  if (table.length < 2) return [];
  const head = table[0].map((cell) => cell.trim());
  const num = (value: string) => {
    const n = Number(value.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  };
  return table.slice(1).filter((cells) => cells.some((cell) => cell.trim())).map((cells) => {
    const cell = (name: string) => (cells[head.indexOf(name)] ?? '').trim();
    const dims: Record<string, number> = {};
    for (const pair of cell('dimensions').split(/[;,]\s*(?=[A-Za-z])/)) {
      const [key, value] = pair.split('=').map((part) => part?.trim() ?? '');
      const n = value ? num(value) : undefined;
      if (key && n !== undefined) dims[key] = n;
    }
    const ranges: Record<string, [number, number]> = {};
    for (const pair of cell('ranges').split(/[;,]\s*(?=[A-Za-z])/)) {
      const [key, value] = pair.split('=').map((part) => part?.trim() ?? '');
      const [a, b] = (value ?? '').split('..').map((part) => num(part.trim()));
      if (key && a !== undefined && b !== undefined) ranges[key] = [a, b];
    }
    const missing = cell('missing').split('|').map((m) => m.trim()).filter(Boolean);
    const sourceFile = cell('sourceFile');
    return {
      manufacturer: cell('manufacturer'),
      manufacturerArticle: cell('article'),
      name: cell('name'),
      officialName: cell('name'),
      category: cell('category'),
      subcategory: cell('subcategory') || undefined,
      series: cell('series') || undefined,
      variant: cell('variant') || undefined,
      saleUnit: cell('saleUnit') || undefined,
      packaging: cell('packaging') || undefined,
      loadCapacityKg: num(cell('loadKg')),
      engineeringStatus: cell('engineeringStatus') || undefined,
      ...(Object.keys(dims).length ? { dimensionsMm: dims } : {}),
      ...(Object.keys(ranges).length ? { ranges } : {}),
      ...(missing.length ? { missing } : {}),
      ...(sourceFile
        ? {
            source: {
              file: sourceFile,
              pdfPage: num(cell('pdfPage')),
              printedPage: cell('printedPage') || undefined,
              /* Дата сверки — то, что указал загрузивший; сегодняшняя подставленная выдала бы файл за сверенный сегодня. */
              checkedAt: cell('checkedAt') || 'не указано',
            },
          }
        : {}),
    };
  });
}
