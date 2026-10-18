/**
 * EGGER И GRANDEX ИЗ ПАКЕТА ПРОВЕРКИ — В КОЛЛЕКЦИИ СУЩЕСТВУЮЩЕГО КАТАЛОГА (P3).
 *
 * Пакет `CATALOG_STAGING/99_IMPORT_QUEUE/EGGER_GRANDEX/` — это 397 СПРАВОЧНЫХ
 * карточек (307 EGGER из брошюры Decorative Collection 26+ EAST EN, стр.
 * 76–83, и 90 GRANDEX из каталога поставщика 2025): код декора, поверхность,
 * группа, страница и кроп образца из PDF. Это не 397 товаров с ценой и не
 * текстуры для 3D: цен нет, права на изображения не подтверждены, кропы —
 * печатные образцы, а не PBR.
 *
 * Второго каталога не появляется: карточки становятся позициями ТЕХ ЖЕ
 * коллекций `data/catalog/catalog.json` (`egger-ldsp`, `grandex-acrylic`
 * и две новые рядом — PerfectSense и столешницы EGGER), а оттуда — строками
 * `catalog_items` организации тем же `planMaterialImport`, что у МДФ и RAL.
 *
 * Ключ позиции — производитель + код декора + поверхность + класс изделия:
 * один декор бывает и плитой, и столешницей, и это РАЗНЫЕ изделия. Повтор
 * той же четвёрки в пакете (одна карточка на двух страницах) — дубль: он
 * сливается в одну позицию, и страницы называются обе.
 *
 * Здесь чистые функции; файлы, сеть и база — у вызывающего.
 */

/** Запись пакета проверки — как она лежит в `COMBINED_EGGER_GRANDEX_REVIEW.json`. */
export type ReviewRecord = {
  id: string;
  brand: string;
  code: string;
  finish: string;
  name: string;
  name_verified: boolean;
  group: string;
  category: string;
  preview: string;
  source: string;
  page: number;
  preview_status: string;
  price_status: string;
  pbr_status: string;
  rights: string;
};

/** Класс изделия: от него зависят коллекция, роль и куда материал вообще можно положить. */
export type ProductClass = 'decorative_board' | 'perfectsense_board' | 'egger_worktop' | 'solid_surface_worktop';

/** Коллекция каталога для класса изделия — существующие и две новые рядом с ними. */
export const REVIEW_COLLECTION_OF: Record<ProductClass, string> = {
  decorative_board: 'egger-ldsp',
  perfectsense_board: 'egger-perfectsense',
  egger_worktop: 'egger-worktops',
  solid_surface_worktop: 'grandex-acrylic',
};

/** На что изделие идёт в Studio — по физике изделия, а не по картинке. */
export const ELIGIBLE_USE: Record<ProductClass, string[]> = {
  decorative_board: ['carcass', 'front'],
  perfectsense_board: ['front'],
  egger_worktop: ['countertop'],
  solid_surface_worktop: ['countertop', 'backsplash'],
};

/** Провенанс позиции: откуда она, что о ней известно и чего нет. */
export type ReviewProvenance = {
  brand: string;
  manufacturerDecorCode: string;
  surfaceCode: string;
  productClass: ProductClass;
  group: string;
  imageSource: 'pdf_print_crop';
  /** Путь кропа внутри пакета (`assets/…`), без папки пакета. Только для карточки. */
  preview: string;
  sourcePdf: string;
  pages: number[];
  reviewIds: string[];
  checkedAt: string;
  nameVerified: boolean;
  previewStatus: string;
  textureStatus: string;
  rightsStatus: string;
  priceStatus: string;
  eligibleUse: string[];
  /** Цвет на геометрии — среднее по кропу образца, а не цвет плиты. */
  colorSource: 'mean_of_pdf_swatch' | 'none';
};

export type ReviewItem = {
  code: string;
  name: string;
  hex: string | null;
  price: null;
  provenance: ReviewProvenance;
};

export type ReviewMapping = {
  /** Позиции по коллекциям каталога. */
  items: Record<string, ReviewItem[]>;
  /** Карточки, слитые с другой той же четвёрки: какая осталась и какие слились. */
  duplicates: { code: string; kept: string; merged: string[] }[];
  /** Карточки, которым в Studio нет детали: кромка, ламинат, компакт. Названы, не загружены. */
  ineligible: { id: string; reason: string }[];
  /** Карточки без кода или поверхности — по ним позицию не опознать. */
  incomplete: { id: string; reason: string }[];
};

/**
 * КЛАСС ИЗДЕЛИЯ КАРТОЧКИ — по группе брошюры и категории пакета.
 *
 * `null` — у карточки нет детали в Studio: кромка, ламинат и компакт не
 * плита корпуса, не фасад и не столешница конструктора.
 */
export function productClassOf(record: Pick<ReviewRecord, 'brand' | 'category' | 'group'>): ProductClass | null {
  const brand = record.brand.trim().toUpperCase();
  if (brand === 'GRANDEX') return record.category === 'worktop' ? 'solid_surface_worktop' : null;
  if (brand !== 'EGGER') return null;
  if (record.category === 'worktop') return 'egger_worktop';
  if (record.category === 'furniture_board') {
    return /perfectsense/i.test(record.group) ? 'perfectsense_board' : 'decorative_board';
  }
  return null;
}

/** Артикул позиции: производитель, класс (у столешницы EGGER), код и поверхность. */
export function reviewArticle(record: Pick<ReviewRecord, 'brand' | 'code' | 'finish'>, productClass: ProductClass): string {
  const brand = record.brand.trim().toUpperCase();
  const code = record.code.trim().toUpperCase();
  if (productClass === 'solid_surface_worktop') return `${brand}-${code}`;
  const finish = record.finish.trim().toUpperCase().replace(/\s*&\s*/g, '+').replace(/\s+/g, '');
  return productClass === 'egger_worktop' ? `${brand}-WT-${code}-${finish}` : `${brand}-${code}-${finish}`;
}

/**
 * КАРТОЧКИ ПАКЕТА → ПОЗИЦИИ КОЛЛЕКЦИЙ.
 *
 * `hexOf` — цвет кропа образца (среднее по пикселям) или `null`: функция
 * чистая, картинки читает вызывающий. Имя без подтверждения не выдумывается:
 * пусто, и карточка пишет «название не подтверждено». Цены нет ни у одной —
 * `price: null` («цена не задана»), и это не ноль.
 */
export function mapReviewRecords(
  records: ReviewRecord[],
  hexOf: (record: ReviewRecord) => string | null,
  checkedAt: string,
): ReviewMapping {
  const items: Record<string, ReviewItem[]> = {};
  const byArticle = new Map<string, ReviewItem>();
  const duplicates: ReviewMapping['duplicates'] = [];
  const ineligible: ReviewMapping['ineligible'] = [];
  const incomplete: ReviewMapping['incomplete'] = [];

  for (const record of records) {
    if (!record.code?.trim() || !record.finish?.trim() || !record.brand?.trim()) {
      incomplete.push({ id: record.id, reason: 'нет кода, поверхности или производителя' });
      continue;
    }
    const productClass = productClassOf(record);
    if (!productClass) {
      ineligible.push({
        id: record.id,
        reason: `«${record.group}»: в Studio нет такой детали — это не плита корпуса, не фасад и не столешница`,
      });
      continue;
    }
    const code = reviewArticle(record, productClass);
    const held = byArticle.get(code);
    if (held) {
      held.provenance.pages = Array.from(new Set([...held.provenance.pages, record.page])).sort((a, b) => a - b);
      held.provenance.reviewIds = [...held.provenance.reviewIds, record.id];
      const dup = duplicates.find((entry) => entry.code === code);
      if (dup) dup.merged.push(record.id);
      else duplicates.push({ code, kept: held.provenance.reviewIds[0], merged: [record.id] });
      continue;
    }
    const hex = hexOf(record);
    const item: ReviewItem = {
      code,
      name: record.name_verified ? record.name.trim() : '',
      hex,
      price: null,
      provenance: {
        brand: record.brand.trim().toUpperCase(),
        manufacturerDecorCode: record.code.trim().toUpperCase(),
        surfaceCode: record.finish.trim(),
        productClass,
        group: record.group,
        imageSource: 'pdf_print_crop',
        preview: record.preview.replace(/^assets\//, ''),
        sourcePdf: record.source,
        pages: [record.page],
        reviewIds: [record.id],
        checkedAt,
        nameVerified: Boolean(record.name_verified),
        previewStatus: record.preview_status,
        textureStatus: record.pbr_status,
        rightsStatus: record.rights,
        priceStatus: record.price_status,
        eligibleUse: ELIGIBLE_USE[productClass],
        colorSource: hex ? 'mean_of_pdf_swatch' : 'none',
      },
    };
    byArticle.set(code, item);
    const collection = REVIEW_COLLECTION_OF[productClass];
    (items[collection] ??= []).push(item);
  }

  for (const list of Object.values(items)) list.sort((a, b) => a.code.localeCompare(b.code));
  return { items, duplicates, ineligible, incomplete };
}
