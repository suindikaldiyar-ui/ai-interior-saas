import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isKitchen,
  readKitchenMeta,
  readKitchenPricing,
  runningMeters,
} from './kitchen';
import { catalogUrl } from './supabase/config';
import {
  UNIT_LABEL,
  isSurfaceKind,
  targetLabel,
  type CatalogAsset,
  type CatalogCategory,
  type CatalogEntryFull,
  type CatalogItem,
  type ProjectSelections,
  type AssetRole,
  type SpecLine,
  type TargetKey,
  type TilingSpec,
} from '@/types/catalog';
import type { FurnitureItem, RoomConfig, WallSide } from '@/types/interior';

/* ─────────────────────────  Загрузка каталога  ───────────────────────── */

type RawItem = CatalogItem & {
  catalog_categories: CatalogCategory | null;
  catalog_assets: CatalogAsset[] | null;
};

/**
 * Весь активный каталог организации одним запросом.
 * Категории и файлы приезжают вложенными — отдельных round-trip нет.
 */
export async function fetchCatalog(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CatalogEntryFull[]> {
  const { data, error } = await supabase
    .from('catalog_items')
    .select(
      `id, org_id, category_id, article, name_ru, name_kk, description, price, unit,
       dimensions, tiling, meta, is_active,
       catalog_categories!inner(id, org_id, key, name_ru, name_kk, applies_to, unit, sort_order, is_active),
       catalog_assets(id, item_id, kind, storage_path, sort_order)`,
    )
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('article');

  if (error || !data) return [];

  return (data as unknown as RawItem[])
    .filter((row) => row.catalog_categories?.is_active !== false)
    .map((row) => ({
      ...row,
      dimensions: row.dimensions ?? {},
      tiling: row.tiling ?? {},
      meta: row.meta ?? {},
      category: row.catalog_categories as CatalogCategory,
      assets: [...(row.catalog_assets ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order,
      ),
    }));
}

export async function fetchCategories(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CatalogCategory[]> {
  const { data, error } = await supabase
    .from('catalog_categories')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order');
  return error || !data ? [] : (data as CatalogCategory[]);
}

/* ─────────────────────────  Файлы товара  ───────────────────────── */

export function assetByKind(
  entry: Pick<CatalogEntryFull, 'assets'>,
  kind: CatalogAsset['kind'],
  role: AssetRole = 'main',
): CatalogAsset | null {
  return (
    entry.assets.find((a) => a.kind === kind && (a.role ?? 'main') === role) ?? null
  );
}

/** Референс конкретной поверхности товара: фасад, столешница, фартук. */
export function referenceByRole(
  entry: CatalogEntryFull,
  role: AssetRole,
): CatalogAsset | null {
  return assetByKind(entry, 'composite', role) ?? assetByKind(entry, 'texture', role);
}

/**
 * Что уходит в модель как референс.
 *
 * Для покрытий — только composite: кроп текстуры без перспективы плюс полоска
 * цвета. Фотография укладки не годится, модель копирует чужую комнату вместе
 * с её светом и мебелью.
 */
export function referenceAsset(entry: CatalogEntryFull): CatalogAsset | null {
  if (isSurfaceKind(entry.category.applies_to)) {
    return (
      assetByKind(entry, 'composite') ??
      assetByKind(entry, 'texture') ??
      assetByKind(entry, 'swatch')
    );
  }

  /*
   * Зона (кухня, шкаф-купе) — только композит поверхности.
   * Фотография смонтированного изделия в рендер не уходит НИКОГДА: модель
   * затащит чужую комнату вместе с её планировкой, светом и мебелью.
   * Для одиночного предмета фото на белом фоне — нормальный референс.
   */
  if (entry.category.applies_to === 'zone') {
    return (
      referenceByRole(entry, 'facade') ??
      assetByKind(entry, 'composite') ??
      assetByKind(entry, 'texture')
    );
  }

  return (
    assetByKind(entry, 'photo') ??
    assetByKind(entry, 'composite') ??
    assetByKind(entry, 'texture')
  );
}

/** Есть ли у зоны композит фасада — без него рендер работает, но хуже. */
export function hasFacadeReference(entry: CatalogEntryFull): boolean {
  return referenceByRole(entry, 'facade') !== null;
}

/** Картинка для карточки в интерфейсе. */
export function previewUrl(entry: CatalogEntryFull): string {
  const asset =
    assetByKind(entry, 'swatch') ??
    assetByKind(entry, 'texture') ??
    assetByKind(entry, 'photo') ??
    assetByKind(entry, 'composite');
  return asset ? catalogUrl(asset.storage_path) : '';
}

/** Текстура для подстановки в 3D-сцену. */
export function textureUrl(entry: CatalogEntryFull): string {
  const asset = assetByKind(entry, 'texture') ?? assetByKind(entry, 'swatch');
  return asset ? catalogUrl(asset.storage_path) : '';
}

export function referenceUrl(entry: CatalogEntryFull): string {
  const asset = referenceAsset(entry);
  return asset ? catalogUrl(asset.storage_path) : '';
}

/* ─────────────────────────  Раскладка в 3D  ───────────────────────── */

/**
 * Сколько раз текстура повторяется на поверхности.
 * Модуль берётся из tiling.moduleSize — доска 1.2×0.19, плитка 0.6×0.6 и т.д.
 */
export function textureRepeat(
  tiling: TilingSpec,
  surfaceWidth: number,
  surfaceHeight: number,
): [number, number] {
  const [mw, mh] = tiling.moduleSize ?? [1.2, 1.2];
  const safeW = mw > 0.01 ? mw : 1.2;
  const safeH = mh > 0.01 ? mh : 1.2;
  return [
    Math.max(1, Math.round(surfaceWidth / safeW)),
    Math.max(1, Math.round(surfaceHeight / safeH)),
  ];
}

/* ─────────────────────────  Спецификация  ───────────────────────── */

const WALL_LENGTH: Record<WallSide, (room: RoomConfig) => number> = {
  north: (r) => r.width,
  south: (r) => r.width,
  west: (r) => r.depth,
  east: (r) => r.depth,
};

/** Площадь окон на стене — вычитается из площади отделки. */
function windowArea(room: RoomConfig, wall: WallSide): number {
  return (room.windows ?? [])
    .filter((w) => w.wall === wall)
    .reduce((sum, w) => sum + w.width * w.height, 0);
}

/** Количество товара для цели: м² считаются из габаритов комнаты. */
export function quantityFor(
  targetKey: TargetKey,
  entry: CatalogEntryFull,
  room: RoomConfig,
  sceneItem?: FurnitureItem | null,
): number {
  const unit = entry.unit;

  /*
   * Зона считается по своей длине в сцене, а не по габариту из каталога:
   * у кухни цена за погонный метр, а длину задаёт комната.
   */
  if (sceneItem && isKitchen(sceneItem)) {
    const meta = readKitchenMeta(sceneItem.meta as Record<string, unknown> | undefined);
    const length = runningMeters(sceneItem.dimensions, meta);
    if (unit === 'running_meter') return length;
    if (unit === 'm2') return round2(length * 0.6);
    return 1;
  }

  if (unit === 'piece' || unit === 'set') return 1;

  if (targetKey === 'floor' || targetKey === 'ceiling') {
    const area = room.width * room.depth;
    if (unit === 'm2') return round2(area);
    if (unit === 'running_meter') return round2(2 * (room.width + room.depth));
    return 1;
  }

  if (targetKey.startsWith('wall:')) {
    const wall = targetKey.slice(5) as WallSide;
    const length = WALL_LENGTH[wall]?.(room) ?? room.width;
    if (unit === 'm2') {
      return round2(Math.max(0, length * room.height - windowArea(room, wall)));
    }
    if (unit === 'running_meter') return round2(length);
    return 1;
  }

  // zone / object / opening — считаем по габариту товара, если он задан.
  if (unit === 'running_meter') return round2(entry.dimensions.width ?? 1);
  if (unit === 'm2') {
    const w = entry.dimensions.width ?? 1;
    const d = entry.dimensions.depth ?? 1;
    return round2(w * d);
  }
  return 1;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Физическая площадь цели в м². По ней решаем, чей референс уйдёт картинкой,
 * когда выбранных артикулов больше лимита: ошибка в тоне пола видна сразу,
 * ошибка в тоне дверной ручки — нет.
 */
export function surfaceArea(targetKey: TargetKey, room: RoomConfig): number {
  if (targetKey === 'floor' || targetKey === 'ceiling') {
    return round2(room.width * room.depth);
  }
  if (targetKey.startsWith('wall:')) {
    const wall = targetKey.slice(5) as WallSide;
    const length = WALL_LENGTH[wall]?.(room) ?? room.width;
    return round2(Math.max(0, length * room.height - windowArea(room, wall)));
  }
  return 1;
}

/**
 * Спецификация проекта: что выбрано, сколько и на какую сумму.
 *
 * `items` нужны для зон: длину кухни задаёт сцена, а не карточка каталога.
 */
export function buildSpec(
  selections: ProjectSelections,
  catalog: CatalogEntryFull[],
  room: RoomConfig,
  items: FurnitureItem[] = [],
): SpecLine[] {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const sceneById = new Map(items.map((i) => [i.id, i]));
  const lines: SpecLine[] = [];

  for (const [targetKey, itemId] of Object.entries(selections)) {
    const entry = byId.get(itemId);
    if (!entry) continue;

    const sceneItem = sceneById.get(targetKey) ?? null;
    const quantity = quantityFor(targetKey, entry, room, sceneItem);

    lines.push({
      targetKey,
      targetLabel: sceneItem ? sceneItem.label : targetLabel(targetKey),
      article: entry.article,
      name: entry.name_ru,
      unit: entry.unit,
      price: entry.price,
      quantity,
      total: round2(entry.price * quantity),
    });

    // Столешница и верхний ряд у кухни продаются отдельными позициями —
    // сметчик ждёт их своими строками, а не «в комплекте».
    if (sceneItem && isKitchen(sceneItem)) {
      const pricing = readKitchenPricing(entry.price, entry.meta);

      if (pricing.countertopPerMeter > 0) {
        lines.push({
          targetKey: `${targetKey}#countertop`,
          targetLabel: `${sceneItem.label} · столешница`,
          article: `${entry.article}-STL`,
          name: String(entry.meta.countertopMaterial ?? 'Столешница'),
          unit: 'running_meter',
          price: pricing.countertopPerMeter,
          quantity,
          total: round2(pricing.countertopPerMeter * quantity),
        });
      }

      if (!pricing.includesUpper && pricing.upperPerMeter > 0) {
        lines.push({
          targetKey: `${targetKey}#upper`,
          targetLabel: `${sceneItem.label} · верхний ряд`,
          article: `${entry.article}-UP`,
          name: 'Верхние шкафы',
          unit: 'running_meter',
          price: pricing.upperPerMeter,
          quantity,
          total: round2(pricing.upperPerMeter * quantity),
        });
      }
    }
  }

  return lines.sort((a, b) => a.targetLabel.localeCompare(b.targetLabel, 'ru'));
}

export function specTotal(lines: SpecLine[]): number {
  return round2(lines.reduce((sum, l) => sum + l.total, 0));
}

export function formatUnit(unit: SpecLine['unit']): string {
  return UNIT_LABEL[unit] ?? unit;
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}
