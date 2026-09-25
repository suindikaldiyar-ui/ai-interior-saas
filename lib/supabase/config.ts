/**
 * Проект обязан собираться и работать без Supabase: фазы 1 и 2 (сцена, чат,
 * рендер) от каталога не зависят. Поэтому все клиенты возвращают null, если
 * ключей нет, а вызывающий код показывает «каталог не настроен».
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const SUPABASE_READY = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const CATALOG_BUCKET = 'catalog';
export const PROJECTS_BUCKET = 'projects';

/** Публичный URL файла в Storage. Бакеты публичные на чтение. */
export function storageUrl(bucket: string, path: string): string {
  if (!SUPABASE_URL || !path) return '';
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

export function catalogUrl(path: string): string {
  /*
   * Путь, который уже адрес, отдаётся как есть: фото своей позиции в
   * демонстрации живёт в памяти вкладки (`blob:`), базы и Storage у
   * демо нет (слой 51).
   */
  if (/^(blob:|data:|https?:)/.test(path)) return path;
  return storageUrl(CATALOG_BUCKET, path);
}
