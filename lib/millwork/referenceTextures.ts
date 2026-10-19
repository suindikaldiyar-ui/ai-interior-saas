import type { CatalogEntryFull, ReferenceTexture } from '@/types/catalog';

export type { ReferenceTexture };

/**
 * ОБРАЗЦЫ ДЕКОРОВ ИЗ БРОШЮР — НА КАРТОЧКЕ И НА ДЕТАЛИ, С ПОМЕТКОЙ REFERENCE_ONLY.
 *
 * У позиций EGGER и GRANDEX из пакета проверки нет файлов каталога
 * (`catalog_assets`): права на изображения не подтверждены, и в Storage они
 * не кладутся. Поэтому карточка показывала плашку цвета, а 3D — плоский цвет.
 *
 * Образец берётся из таблицы (`referenceTextures.generated.ts`), собранной
 * из тех же PDF: картинка образца ↔ подпись «КОД СТРУКТУРА» по геометрии
 * страницы, подпись ↔ позиция дословно. Ключ — `meta.provenance.preview`:
 * он уже лежит в строках базы, поэтому ни одной записи в базу не нужно.
 *
 * Файлы образцов лежат ВНЕ git (папка пакета на этом сервере) и отдаются
 * только вошедшему (`/api/catalog/materials/preview`). Нет папки — нет
 * картинки, и это сказано словами; цвет позиции при этом — средний цвет
 * самого образца, а не страницы вокруг него.
 */

/** Откуда образец — так и пишется на карточке. */
export const REFERENCE_SOURCE_TITLE: Record<ReferenceTexture['source'], string> = {
  edc26: 'EGGER Decorative Collection 26+ (брошюра)',
  worktops: 'EGGER Worktops (брошюра столешниц)',
  'grandex-pack': 'GRANDEX 2025 (кроп каталога из пакета)',
};

/** Ключ образца у позиции каталога — путь кропа пакета без `assets/`. */
export function referenceKeyOf(meta: Record<string, unknown> | null | undefined): string | null {
  const provenance = meta?.provenance as { preview?: unknown } | undefined;
  const preview = typeof provenance?.preview === 'string' ? provenance.preview.trim() : '';
  return preview ? preview.replace(/^assets\//, '') : null;
}

/**
 * МОЖНО ЛИ ПРИМЕНЯТЬ ОБРАЗЕЦ БРОШЮРЫ — РЕШАЮТ ДАННЫЕ ПОЗИЦИИ, А НЕ ОКРУЖЕНИЕ.
 *
 * Картинка производителя ложится на деталь и показывается в карточке и в
 * списке, только когда права на неё подтверждены
 * (`provenance.rightsStatus = 'VERIFIED'`). Пакет проверки пишет `NOT_VERIFIED`
 * у всех 337 позиций — картинки не применяются нигде, ни на проде (там их
 * файлов и нет: 404), ни здесь. Цвет позиции — средний цвет самого образца:
 * это число, а не картинка, и он остаётся.
 */
export function referenceImageAllowed(meta: Record<string, unknown> | null | undefined): boolean {
  const provenance = meta?.provenance as { rightsStatus?: unknown } | undefined;
  return provenance?.rightsStatus === 'VERIFIED';
}

/** Адрес образца: тот же маршрут, что у карточки, — только вошедшему. */
export function referenceUrl(key: string): string {
  return `/api/catalog/materials/preview?file=${encodeURIComponent(key)}`;
}

/**
 * Позиции каталога с образцами из таблицы.
 *
 * Новый объект — только у позиции, у которой образец есть: остальные
 * возвращаются теми же ссылками. В базу это поле не пишется ни одной
 * дорогой — правки каталога отправляют свои поля, а не позицию целиком.
 */
export function withReferences(
  entries: CatalogEntryFull[],
  table: Record<string, ReferenceTexture>,
): CatalogEntryFull[] {
  return entries.map((entry) => {
    const key = referenceKeyOf(entry.meta);
    const reference = key ? table[key] : undefined;
    return reference ? { ...entry, reference } : entry;
  });
}

/** Таблица образцов — отдельным куском сборки: первая загрузка её не несёт. */
export async function loadReferenceTable(): Promise<Record<string, ReferenceTexture>> {
  const { REFERENCE_TEXTURES } = await import('./referenceTextures.generated');
  return REFERENCE_TEXTURES;
}

/**
 * Масштаб рисунка словами: размер ПРИНЯТ, и это говорится рядом с числом.
 *
 * Производитель масштаб печати не указывает; число — допущение генератора
 * (`REFERENCE_SCALE`), и выдать его за замер значило бы соврать.
 */
export function referenceScaleWords(reference: ReferenceTexture): string {
  return `образец принят за ${reference.mm[0]} × ${reference.mm[1]} мм — масштаб печати производитель не указывает`;
}

/** Что это за картинка — одной строкой для карточки и подсказки. */
export const REFERENCE_STATUS_WORDS =
  'REFERENCE_ONLY: образец из PDF производителя, не PBR и не бесшовная текстура; права не подтверждены';
