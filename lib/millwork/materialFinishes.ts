import catalogFile from '@/data/catalog/catalog.json';
import { parseFinishes, type FinishSpec } from './materialCollection';

/**
 * ПАРАМЕТРЫ ПОВЕРХНОСТЕЙ ДЛЯ СЦЕНЫ — ИЗ ФАЙЛА КАТАЛОГА, В ОДНОМ МЕСТЕ.
 *
 * `high_gloss` — шероховатость 0.05 и лак 1.0, `touch_sense` — 0.9 без
 * лака: числа лежат в `finishes` файла и больше нигде. Сцена, картинки
 * модулей и подписи панели читают их отсюда; своя таблица в коде
 * разошлась бы с файлом на первой же правке поставщика.
 *
 * Берётся ТОЛЬКО таблица поверхностей: цвета коллекций сюда не нужны, и
 * сцена работает без сети — таблица приезжает со сборкой, а не запросом.
 */
export const MATERIAL_FINISHES: Record<string, FinishSpec> = parseFinishes(catalogFile.finishes);

/** Параметры поверхности; неизвестная — `null`, и сцена берёт свою фактуру. */
export function finishParams(surface: string | undefined): FinishSpec | null {
  if (!surface) return null;
  return MATERIAL_FINISHES[surface] ?? null;
}
