import type { FurnitureItem, RoomConfig } from './interior';

/**
 * Фаза 2: 3D перестаёт быть конечным результатом и становится каркасом,
 * который держит геометрию. Кадр из вьюпорта уходит в модель как
 * GEOMETRY_REFERENCE, поэтому планировка не уезжает между вариантами.
 */

export type CaptureFraming = 'hero' | 'current';

/** Оба кадра — JPEG в dataURL. PNG на 1536×1024 даёт 3–5 МБ и ловит 413. */
export type CaptureResult = {
  beauty: string;
  clay: string;
};

export type RenderStatus = 'queued' | 'rendering' | 'done' | 'error';

export type RenderVariant = {
  styleId: string;
  status: RenderStatus;
  image?: string;
  error?: string;
  durationMs?: number;
};

export type ReferencePayload = {
  label: string;
  dataUrl: string;
};

/**
 * Выбранный из каталога артикул, назначенный на поверхность или зону.
 * Именно он, а не абстрактный материал стиля, уходит в BINDING TABLE.
 */
export type CatalogReference = {
  targetKey: string;
  targetLabel: string;
  article: string;
  name: string;
  appliesTo: string;
  /** Площадь поверхности в м². По ней выбираем, кого слать картинкой при лимите. */
  area: number;
  /** Композитный референс. Может отсутствовать — тогда только текстовое описание. */
  dataUrl?: string;
  description?: string;
};

export type RenderRequest = {
  styleId: string;
  beauty: string;
  clay: string;
  room: RoomConfig;
  items: FurnitureItem[];
  references?: ReferencePayload[];
  catalogRefs?: CatalogReference[];
  customNotes?: string;
};

/** clay + beauty + это число = не больше восьми картинок на запрос. */
export const MAX_CATALOG_IMAGES = 6;

/** Роут никогда не бросает: упавший вариант возвращает error и живёт как карточка. */
export type RenderResponse = {
  styleId: string;
  image?: string;
  error?: string;
  durationMs?: number;
};
