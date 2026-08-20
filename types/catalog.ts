import type { Dimensions, WallSide } from './interior';

/**
 * Универсальная модель каталога.
 *
 * Добавление новой товарной категории не должно требовать ни строчки кода:
 * компания заводит категорию, указывает applies_to и unit — и товар сам
 * появляется в панели материалов и уходит в рендер.
 */

export const APPLIES_TO = [
  'floor',
  'wall',
  'ceiling',
  'zone',
  'object',
  'opening',
] as const;

export type AppliesTo = (typeof APPLIES_TO)[number];

export const APPLIES_TO_LABEL: Record<AppliesTo, string> = {
  floor: 'Пол',
  wall: 'Стены',
  ceiling: 'Потолок',
  zone: 'Зона',
  object: 'Предмет',
  opening: 'Проём',
};

export const CATALOG_UNITS = ['m2', 'piece', 'running_meter', 'set'] as const;
export type CatalogUnit = (typeof CATALOG_UNITS)[number];

export const UNIT_LABEL: Record<CatalogUnit, string> = {
  m2: 'м²',
  piece: 'шт',
  running_meter: 'пог. м',
  set: 'компл.',
};

export const ASSET_KINDS = [
  'texture',
  'swatch',
  'composite',
  'photo',
  'model',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export type OrgRole = 'owner' | 'manager' | 'designer';

export type Org = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  accent_color: string;
  domain: string | null;
  plan: string;
};

export type CatalogCategory = {
  id: string;
  org_id: string;
  key: string;
  name_ru: string;
  name_kk: string;
  applies_to: AppliesTo;
  unit: CatalogUnit;
  sort_order: number;
  is_active: boolean;
};

/** Раскладка модуля покрытия — из неё считается масштаб текстуры в 3D. */
export type TilingSpec = {
  /** Размер одного модуля в метрах: доска, плитка, полотно. */
  moduleSize?: [number, number];
  pattern?: 'straight' | 'herringbone' | 'brick' | 'grid';
  grout?: number;
};

/**
 * Какая поверхность товара. Для покрытий всегда 'main', а вот у зон —
 * кухни, шкафа-купе — поверхностей несколько, и у каждой свой референс.
 */
export const ASSET_ROLES = ['main', 'facade', 'countertop', 'backsplash'] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

export const ASSET_ROLE_LABEL: Record<AssetRole, string> = {
  main: 'Основной',
  facade: 'Фасад',
  countertop: 'Столешница',
  backsplash: 'Фартук',
};

export type CatalogAsset = {
  id: string;
  item_id: string;
  kind: AssetKind;
  role: AssetRole;
  storage_path: string;
  sort_order: number;
};

export type CatalogItem = {
  id: string;
  org_id: string;
  category_id: string;
  article: string;
  name_ru: string;
  name_kk: string;
  description: string;
  price: number;
  unit: CatalogUnit;
  dimensions: Partial<Dimensions>;
  tiling: TilingSpec;
  meta: Record<string, unknown>;
  is_active: boolean;
};

/** Товар вместе с категорией и файлами — то, чем оперирует интерфейс. */
export type CatalogEntryFull = CatalogItem & {
  category: CatalogCategory;
  assets: CatalogAsset[];
};

/* ─────────────────────────  Цели назначения  ───────────────────────── */

/**
 * targetKey — куда назначен товар:
 *   'floor' | 'ceiling'          — поверхность целиком
 *   'wall:north' | 'wall:east'   — конкретная стена
 *   'zone:kitchen'               — функциональная зона
 *   <itemId>                     — конкретный объект сцены
 */
export type TargetKey = string;

export const SURFACE_TARGETS = [
  'floor',
  'ceiling',
  'wall:north',
  'wall:south',
  'wall:west',
  'wall:east',
] as const;

export function wallTarget(wall: WallSide): TargetKey {
  return `wall:${wall}`;
}

export function targetLabel(key: TargetKey): string {
  if (key === 'floor') return 'Пол';
  if (key === 'ceiling') return 'Потолок';
  if (key.startsWith('wall:')) {
    const map: Record<string, string> = {
      north: 'Стена north (задняя)',
      south: 'Стена south (передняя)',
      west: 'Стена west (левая)',
      east: 'Стена east (правая)',
    };
    return map[key.slice(5)] ?? key;
  }
  if (key.startsWith('zone:')) return `Зона: ${key.slice(5)}`;
  return key;
}

/** Какие targetKey допустимы для товара с данным applies_to. */
export function targetsFor(appliesTo: AppliesTo): TargetKey[] {
  switch (appliesTo) {
    case 'floor':
      return ['floor'];
    case 'ceiling':
      return ['ceiling'];
    case 'wall':
      return ['wall:north', 'wall:south', 'wall:west', 'wall:east'];
    default:
      return [];
  }
}

/** Покрытия подставляются в 3D мгновенно; zone/object/opening — только в рендере. */
export function isSurfaceKind(appliesTo: AppliesTo): boolean {
  return appliesTo === 'floor' || appliesTo === 'wall' || appliesTo === 'ceiling';
}

/* ─────────────────────────  Проекты  ───────────────────────── */

export type ProjectSelections = Record<TargetKey, string>;

export type Measurements = {
  width?: number;
  depth?: number;
  height?: number;
  note?: string;
  confirmed?: boolean;
};

export type SpecLine = {
  targetKey: TargetKey;
  targetLabel: string;
  article: string;
  name: string;
  unit: CatalogUnit;
  price: number;
  quantity: number;
  total: number;
};
