import type { FurnitureItem, RoomConfig } from './interior';

/**
 * Фаза 2: 3D перестаёт быть конечным результатом и становится каркасом,
 * который держит геометрию. Кадр из вьюпорта уходит в модель как
 * GEOMETRY_REFERENCE, поэтому планировка не уезжает между вариантами.
 */

/**
 * `run` — кадр конфигуратора: весь ряд гарнитура в поле зрения целиком.
 * Съёмочная точка «героя» рассчитана на комнату, и в кухне 3.2 × 2.4 м
 * она встаёт вплотную к столешнице: холодильник и духовая колонна
 * не попадают в кадр, а именно их клиент и сверяет с чертежом.
 */
export type CaptureFraming = 'hero' | 'current' | 'run' | 'run-left' | 'run-right';

/**
 * С какой стороны снят ряд. Фотографию помещения замерщик делает от двери,
 * то есть почти всегда с угла: если clay снят фронтально, а фото с угла,
 * модель вынуждена выбирать между ними — и выбирает не то.
 */
export type RunAngle = 'front' | 'left' | 'right';

export const RUN_ANGLE_LABEL: Record<RunAngle, string> = {
  front: 'Фронтально',
  left: 'От левого угла',
  right: 'От правого угла',
};

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

/**
 * Фотография помещения клиента — dataURL, сжатый на клиенте до 1600 px.
 * Она главнее любого кадра из вьюпорта: окна, двери и ракурс берутся с неё.
 */
export type RoomPhoto = string;

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
  /** Фотография помещения клиента. С ней геометрию задаёт она, а не сцена. */
  roomPhoto?: RoomPhoto;
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
