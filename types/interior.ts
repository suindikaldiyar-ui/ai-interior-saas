/**
 * ПРОСТРАНСТВЕННОЕ СОГЛАШЕНИЕ — единый источник правды для всего проекта.
 * Нарушать нельзя ни в рендере, ни в сторе, ни в промпте для Gemini.
 *
 *   Единица измерения : МЕТР
 *   Начало координат  : центр комнаты (0, 0, 0), пол Y = 0
 *   X                 : слева направо,          -width/2  … +width/2
 *   Z                 : от задней стены вперёд,  -depth/2  … +depth/2
 *   Y                 : вверх,                   0         … height
 *   position          : НИЖНИЙ ЦЕНТР объекта (bottom-center), НЕ центр
 *   rotation          : в ГРАДУСАХ (не радианы). rotationY = 0 → объект смотрит в +Z
 *
 * Стены: north = z=-depth/2, south = z=+depth/2, west = x=-width/2, east = x=+width/2.
 *
 * Единственное исключение из bottom-center: placement === 'ceiling'. Подвесной
 * светильник крепится к потолку, поэтому его origin — ТОЧКА ПОДВЕСА (y = room.height),
 * а геометрия уходит вниз, в отрицательный локальный Y.
 */

export type Vec3 = { x: number; y: number; z: number };

export type Dimensions = { width: number; height: number; depth: number };

export const FURNITURE_TYPES = [
  'sofa',
  'corner_sofa',
  'armchair',
  'chair',
  'coffee_table',
  'dining_table',
  'side_table',
  'rug',
  'floor_lamp',
  'pendant_lamp',
  'plant',
  'tv_unit',
  'tv',
  'bookshelf',
  'bed',
  'nightstand',
  'wardrobe',
  'kitchen_unit',
  'wall_panel',
  'wall_art',
  'curtain',
  'box',
] as const;

export type FurnitureType = (typeof FURNITURE_TYPES)[number];

/** Правило высоты. Определяет, чему равен position.y — см. resolveY(). */
export type PlacementRule =
  | 'floor'
  | 'floor_flat'
  | 'on_surface'
  | 'wall'
  | 'ceiling';

export const PLACEMENT_RULES = [
  'floor',
  'floor_flat',
  'on_surface',
  'wall',
  'ceiling',
] as const;

export const MATERIAL_PRESETS = [
  'fabric',
  'boucle',
  'leather',
  'wood_oak',
  'wood_walnut',
  'marble',
  'porcelain',
  'metal',
  'brass',
  'glass',
  'plaster',
  'foliage',
  'wool',
] as const;

export type MaterialPreset = (typeof MATERIAL_PRESETS)[number];

export type MaterialSpec = {
  preset: MaterialPreset;
  color: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
};

export type FurnitureItem = {
  id: string;
  type: FurnitureType;
  label: string;
  /** Нижний центр объекта в метрах (кроме ceiling — там точка подвеса). */
  position: Vec3;
  /** Градусы. */
  rotation: Vec3;
  dimensions: Dimensions;
  material: MaterialSpec;
  placement: PlacementRule;
  locked?: boolean;
  visible?: boolean;
  createdAt: number;
  meta?: Record<string, unknown>;
};

export const WALL_SIDES = ['north', 'south', 'west', 'east'] as const;
export type WallSide = (typeof WALL_SIDES)[number];

export type WindowSpec = {
  id: string;
  wall: WallSide;
  /** Смещение центра окна вдоль стены от её середины, в метрах. */
  offset: number;
  width: number;
  height: number;
  /** Высота подоконника от пола. */
  sill: number;
};

export const FLOOR_MATERIALS = ['parquet', 'plank', 'concrete'] as const;
export type FloorMaterial = (typeof FLOOR_MATERIALS)[number];

export type RoomConfig = {
  width: number;
  depth: number;
  height: number;
  wallColor: string;
  floorColor: string;
  floorMaterial: FloorMaterial;
  ceilingColor: string;
  windows: WindowSpec[];
};

/* ─────────────────────────  Протокол AI  ───────────────────────── */

export const SPATIAL_OPS = [
  'add',
  'move',
  'rotate',
  'resize',
  'recolor',
  'remove',
  'clear',
  'set_room',
] as const;

export type SpatialOp = (typeof SPATIAL_OPS)[number];

/**
 * Одно действие модели. Схема намеренно плоская: у Gemini подмножество
 * OpenAPI без oneOf, поэтому разные op делят одни и те же поля.
 *
 * set_room использует dimensions (габариты комнаты) и material.color (цвет стен).
 */
/**
 * Параметры зоны. Зона (кухня, шкаф-купе) — не предмет с фиксированным
 * габаритом, а конфигурация, поэтому у неё есть свои поля сверх dimensions.
 * Схема типизирована: свободный объект Gemini разбирает ненадёжно.
 */
export type KitchenActionSpec = {
  layout?: 'linear' | 'corner_l' | 'u_shape' | null;
  secondaryLength?: number | null;
  side?: 'left' | 'right' | null;
  hasUpper?: boolean | null;
  appliances?: string[] | null;
};

export type SpatialAction = {
  op: SpatialOp;
  id?: string | null;
  type?: FurnitureType | null;
  label?: string | null;
  position?: Partial<Vec3> | null;
  rotationY?: number | null;
  dimensions?: Partial<Dimensions> | null;
  material?: Partial<MaterialSpec> | null;
  kitchen?: KitchenActionSpec | null;
  reason?: string | null;
};

export type SpatialResponse = {
  reply: string;
  actions: SpatialAction[];
};

export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  actions?: SpatialAction[];
};

export type SpatialRequestBody = {
  message: string;
  room: RoomConfig;
  items: FurnitureItem[];
  selectedId?: string | null;
  history?: ChatMessage[];
};

export type SceneSnapshot = {
  version: 1;
  room: RoomConfig;
  items: FurnitureItem[];
};

/* ─────────────────────────  Константы  ───────────────────────── */

/** Высота рабочей поверхности предмета — на неё встают объекты с placement 'on_surface'. */
export const SURFACE_HEIGHT: Partial<Record<FurnitureType, number>> = {
  coffee_table: 0.42,
  dining_table: 0.75,
  tv_unit: 0.45,
  nightstand: 0.55,
  side_table: 0.55,
};

export const DEFAULT_ROOM: RoomConfig = {
  width: 6,
  depth: 5,
  height: 2.9,
  wallColor: '#E8E4DC',
  floorColor: '#A87B4F',
  floorMaterial: 'parquet',
  ceilingColor: '#F4F2ED',
  windows: [
    {
      id: 'win-north',
      wall: 'north',
      offset: 0,
      width: 2.4,
      height: 1.5,
      sill: 0.85,
    },
  ],
};
