import { textureRepeat, textureUrl } from '@/lib/catalog';
import type { CatalogEntryFull } from '@/types/catalog';

/**
 * КАК ВЫГЛЯДИТ ПОВЕРХНОСТЬ.
 *
 * Клиент на встрече перебирает фасады: белый, дуб, графит, фрезерованный.
 * Между нажатием и картинкой не должно быть ничего — ни загрузки, ни
 * пересборки сцены. Поэтому смена материала — это присвоение цвета
 * существующему материалу, а не новый материал и не новый меш.
 *
 * Что берётся из артикула каталога:
 *   цвет      → `meta.color`, шестнадцатеричный;
 *   фактура   → `meta.finish`: глянец, мат, софт-тач, фрезеровка;
 *   текстура  → файл вида `texture` или `swatch` у товара;
 *   раскладка → `tiling.moduleSize`, из неё считается число повторов.
 *
 * Артикула нет — берётся цвет по умолчанию, и интерфейс об этом говорит
 * прямо: клиент видит настроение, а не ваш товар.
 */

/** Фактура поверхности: шероховатость решает, глянец это или мат. */
export type SurfaceFinish = 'gloss' | 'matte' | 'soft' | 'milled' | 'wood' | 'stone';

/**
 * Шероховатость по фактуре.
 *
 * Числа не из головы: глянцевый фасад отражает окно почти зеркально,
 * софт-тач не бликует вовсе. Разница между 0.12 и 0.62 — это разница
 * между «дорого» и «покрашено».
 */
const FINISH_ROUGHNESS: Record<SurfaceFinish, number> = {
  gloss: 0.12,
  matte: 0.62,
  soft: 0.85,
  milled: 0.55,
  wood: 0.7,
  stone: 0.28,
};

export type SurfaceLook = {
  color: string;
  roughness: number;
  metalness: number;
  /** Текстура артикула. Пусто — поверхность красится цветом. */
  textureUrl: string | null;
  /** Сколько раз текстура повторяется по ширине и высоте. */
  repeat: [number, number];
  /** Фрезерованный фасад: вертикальные бороздки нормалью. */
  milled: boolean;
  /** Артикул выбран: по этому признаку интерфейс говорит правду. */
  fromCatalog: boolean;
};

const HEX = /^#[0-9a-f]{6}$/i;

function metaString(entry: CatalogEntryFull, key: string): string | null {
  const value = entry.meta?.[key];
  return typeof value === 'string' ? value : null;
}

export function surfaceFinish(entry: CatalogEntryFull | null): SurfaceFinish | null {
  if (!entry) return null;
  const raw = (metaString(entry, 'finish') ?? '').toLowerCase();
  return raw in FINISH_ROUGHNESS ? (raw as SurfaceFinish) : null;
}

/**
 * Вид поверхности по артикулу.
 *
 * @param surfaceSize габарит поверхности в метрах — по нему считается,
 *                    сколько раз ляжет модуль текстуры.
 */
export function surfaceLook(
  entry: CatalogEntryFull | null,
  fallback: { color: string; roughness: number; metalness?: number },
  surfaceSize: [number, number] = [1, 1],
): SurfaceLook {
  if (!entry) {
    return {
      color: fallback.color,
      roughness: fallback.roughness,
      metalness: fallback.metalness ?? 0,
      textureUrl: null,
      repeat: [1, 1],
      milled: false,
      fromCatalog: false,
    };
  }

  const finish = surfaceFinish(entry);
  const color = metaString(entry, 'color');
  const url = textureUrl(entry);

  return {
    color: color && HEX.test(color) ? color : fallback.color,
    roughness: finish ? FINISH_ROUGHNESS[finish] : fallback.roughness,
    metalness: fallback.metalness ?? 0,
    textureUrl: url || null,
    repeat: textureRepeat(entry.tiling, surfaceSize[0], surfaceSize[1]),
    milled: finish === 'milled',
    fromCatalog: true,
  };
}
