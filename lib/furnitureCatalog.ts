import {
  FURNITURE_TYPES,
  type Dimensions,
  type FurnitureType,
  type MaterialPreset,
  type MaterialSpec,
  type PlacementRule,
} from '@/types/interior';

export type CatalogEntry = {
  type: FurnitureType;
  kk: string;
  ru: string;
  en: string;
  dimensions: Dimensions;
  material: MaterialSpec;
  placement: PlacementRule;
  /** Объект по смыслу прижимается к стене спинкой/задником. */
  wallHugging: boolean;
};

/** Габариты реальные, а не круглые: width × height × depth в метрах. */
export const CATALOG: Record<FurnitureType, CatalogEntry> = {
  sofa: {
    type: 'sofa',
    kk: 'Диван',
    ru: 'Диван',
    en: 'Sofa',
    dimensions: { width: 2.2, height: 0.82, depth: 0.95 },
    material: { preset: 'boucle', color: '#C9C2B4' },
    placement: 'floor',
    wallHugging: true,
  },
  corner_sofa: {
    type: 'corner_sofa',
    kk: 'Бұрыштық диван',
    ru: 'Угловой диван',
    en: 'Corner sofa',
    dimensions: { width: 2.7, height: 0.82, depth: 2.0 },
    material: { preset: 'boucle', color: '#BFB8A9' },
    placement: 'floor',
    wallHugging: true,
  },
  armchair: {
    type: 'armchair',
    kk: 'Кресло',
    ru: 'Кресло',
    en: 'Armchair',
    dimensions: { width: 0.86, height: 0.8, depth: 0.85 },
    material: { preset: 'fabric', color: '#8E7F6D' },
    placement: 'floor',
    wallHugging: false,
  },
  chair: {
    type: 'chair',
    kk: 'Орындық',
    ru: 'Стул',
    en: 'Chair',
    dimensions: { width: 0.46, height: 0.92, depth: 0.52 },
    material: { preset: 'wood_oak', color: '#B08A5C' },
    placement: 'floor',
    wallHugging: false,
  },
  coffee_table: {
    type: 'coffee_table',
    kk: 'Журнал үстелі',
    ru: 'Журнальный стол',
    en: 'Coffee table',
    dimensions: { width: 1.1, height: 0.42, depth: 0.62 },
    material: { preset: 'marble', color: '#E6E3DC' },
    placement: 'floor',
    wallHugging: false,
  },
  dining_table: {
    type: 'dining_table',
    kk: 'Ас үстелі',
    ru: 'Обеденный стол',
    en: 'Dining table',
    dimensions: { width: 1.8, height: 0.75, depth: 0.9 },
    material: { preset: 'wood_walnut', color: '#6B4A31' },
    placement: 'floor',
    wallHugging: false,
  },
  side_table: {
    type: 'side_table',
    kk: 'Қосымша үстел',
    ru: 'Приставной столик',
    en: 'Side table',
    dimensions: { width: 0.42, height: 0.55, depth: 0.42 },
    material: { preset: 'metal', color: '#4B4F52' },
    placement: 'floor',
    wallHugging: false,
  },
  rug: {
    type: 'rug',
    kk: 'Кілем',
    ru: 'Ковёр',
    en: 'Rug',
    dimensions: { width: 2.6, height: 0.02, depth: 1.8 },
    material: { preset: 'wool', color: '#A8A093' },
    placement: 'floor_flat',
    wallHugging: false,
  },
  floor_lamp: {
    type: 'floor_lamp',
    kk: 'Едендік шам',
    ru: 'Торшер',
    en: 'Floor lamp',
    dimensions: { width: 0.42, height: 1.65, depth: 0.42 },
    material: { preset: 'brass', color: '#B08D4B' },
    placement: 'floor',
    wallHugging: false,
  },
  pendant_lamp: {
    type: 'pendant_lamp',
    kk: 'Аспалы шам',
    ru: 'Подвесной светильник',
    en: 'Pendant lamp',
    dimensions: { width: 0.45, height: 0.95, depth: 0.45 },
    material: { preset: 'brass', color: '#C09A55' },
    placement: 'ceiling',
    wallHugging: false,
  },
  plant: {
    type: 'plant',
    kk: 'Өсімдік',
    ru: 'Растение',
    en: 'Plant',
    dimensions: { width: 0.75, height: 1.45, depth: 0.75 },
    material: { preset: 'foliage', color: '#3F6B43' },
    placement: 'floor',
    wallHugging: false,
  },
  tv_unit: {
    type: 'tv_unit',
    kk: 'ТД тумбасы',
    ru: 'ТВ-тумба',
    en: 'TV unit',
    dimensions: { width: 1.8, height: 0.45, depth: 0.4 },
    material: { preset: 'wood_oak', color: '#8A6742' },
    placement: 'floor',
    wallHugging: true,
  },
  tv: {
    type: 'tv',
    kk: 'Теледидар',
    ru: 'Телевизор',
    en: 'TV',
    dimensions: { width: 1.25, height: 0.72, depth: 0.06 },
    material: { preset: 'metal', color: '#191B1D' },
    placement: 'on_surface',
    wallHugging: true,
  },
  bookshelf: {
    type: 'bookshelf',
    kk: 'Кітап сөресі',
    ru: 'Стеллаж',
    en: 'Bookshelf',
    dimensions: { width: 1.2, height: 2.0, depth: 0.34 },
    material: { preset: 'wood_oak', color: '#9A7247' },
    placement: 'floor',
    wallHugging: true,
  },
  bed: {
    type: 'bed',
    kk: 'Төсек',
    ru: 'Кровать',
    en: 'Bed',
    dimensions: { width: 1.8, height: 1.0, depth: 2.1 },
    material: { preset: 'fabric', color: '#9E958A' },
    placement: 'floor',
    wallHugging: true,
  },
  nightstand: {
    type: 'nightstand',
    kk: 'Түнгі тумба',
    ru: 'Прикроватная тумба',
    en: 'Nightstand',
    dimensions: { width: 0.45, height: 0.55, depth: 0.4 },
    material: { preset: 'wood_walnut', color: '#6E4E35' },
    placement: 'floor',
    wallHugging: true,
  },
  wardrobe: {
    type: 'wardrobe',
    kk: 'Шкаф',
    ru: 'Шкаф',
    en: 'Wardrobe',
    dimensions: { width: 1.8, height: 2.2, depth: 0.6 },
    material: { preset: 'wood_oak', color: '#8F6B45' },
    placement: 'floor',
    wallHugging: true,
  },
  kitchen_unit: {
    type: 'kitchen_unit',
    kk: 'Ас үй жиһазы',
    ru: 'Кухонный гарнитур',
    en: 'Kitchen unit',
    // Не предмет с фиксированным габаритом, а линейная конфигурация вдоль
    // стены: длина задаётся комнатой, цена — погонными метрами.
    dimensions: { width: 3.0, height: 2.2, depth: 0.6 },
    material: { preset: 'plaster', color: '#8E9296' },
    placement: 'floor',
    wallHugging: true,
  },
  wall_panel: {
    type: 'wall_panel',
    kk: 'Қабырға панелі',
    ru: 'Керамогранитная панель',
    en: 'Wall panel',
    dimensions: { width: 2.4, height: 2.6, depth: 0.03 },
    material: { preset: 'porcelain', color: '#D8D3C8' },
    placement: 'wall',
    wallHugging: true,
  },
  wall_art: {
    type: 'wall_art',
    kk: 'Картина',
    ru: 'Картина',
    en: 'Wall art',
    dimensions: { width: 0.9, height: 1.2, depth: 0.04 },
    material: { preset: 'plaster', color: '#CFC6B6' },
    placement: 'wall',
    wallHugging: true,
  },
  curtain: {
    type: 'curtain',
    kk: 'Перде',
    ru: 'Штора',
    en: 'Curtain',
    dimensions: { width: 1.6, height: 2.5, depth: 0.08 },
    material: { preset: 'fabric', color: '#DCD5C7' },
    placement: 'floor',
    wallHugging: true,
  },
  box: {
    type: 'box',
    kk: 'Блок',
    ru: 'Блок',
    en: 'Block',
    dimensions: { width: 0.6, height: 0.6, depth: 0.6 },
    material: { preset: 'plaster', color: '#B9B3A7' },
    placement: 'floor',
    wallHugging: false,
  },
};

export type PbrSpec = {
  roughness: number;
  metalness: number;
  clearcoat?: number;
  sheen?: number;
};

/** Физические параметры пресетов. Переопределяются полями MaterialSpec. */
export const PBR: Record<MaterialPreset, PbrSpec> = {
  fabric: { roughness: 0.92, metalness: 0 },
  boucle: { roughness: 0.98, metalness: 0, sheen: 0.85 },
  leather: { roughness: 0.55, metalness: 0, clearcoat: 0.25 },
  wood_oak: { roughness: 0.62, metalness: 0 },
  wood_walnut: { roughness: 0.52, metalness: 0, clearcoat: 0.15 },
  marble: { roughness: 0.16, metalness: 0, clearcoat: 0.6 },
  porcelain: { roughness: 0.22, metalness: 0, clearcoat: 0.5 },
  metal: { roughness: 0.34, metalness: 0.9 },
  brass: { roughness: 0.28, metalness: 1 },
  glass: { roughness: 0.06, metalness: 0 },
  plaster: { roughness: 0.95, metalness: 0 },
  foliage: { roughness: 0.78, metalness: 0 },
  wool: { roughness: 1, metalness: 0, sheen: 0.5 },
};

export const CATALOG_LIST: CatalogEntry[] = FURNITURE_TYPES.map((t) => CATALOG[t]);

export function isFurnitureType(value: unknown): value is FurnitureType {
  return typeof value === 'string' && value in CATALOG;
}

export function getEntry(type: unknown): CatalogEntry {
  return isFurnitureType(type) ? CATALOG[type] : CATALOG.box;
}
