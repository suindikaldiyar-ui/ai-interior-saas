import {
  EMPTY_MOUNTING,
  HARDWARE_BRANDS,
  type CatalogEntryFull,
  type HardwareBrand,
  type HardwareCategory,
  type HardwareItem,
  type HardwareMeta,
  type MountingData,
} from '@/types/catalog';
import type { Module, Run } from '@/types/millwork';

/**
 * ФУРНИТУРА ОРГАНИЗАЦИИ — ТОТ ЖЕ КАТАЛОГ, ЧТО И ВСЁ ОСТАЛЬНОЕ.
 *
 * Петли, направляющие, крепёж и наполнение лежат в `catalog_items` рядом
 * с фасадами и столешницами: одна таблица плюс поля `meta` (ловушка 19).
 * Здесь — чтение этих полей и разрешение ссылки модуля в позицию.
 *
 * Цена НЕ копируется никуда: модуль хранит `hardwareItemId`, смета берёт
 * `item.price`. Второго места, где лежит цена, не появляется.
 *
 * Количество здесь тоже НЕ считается: сколько петель и направляющих
 * нужно, знает состав ряда (`openingHardware`) и раскрой. Каталог задаёт
 * ЦЕНУ, а не второе количество.
 */

const BRANDS = new Set<string>(HARDWARE_BRANDS);

const CATEGORIES = new Set<HardwareCategory>([
  'hinge',
  'slide',
  'fastener',
  'filling',
  'other',
]);

/** Монтажные размеры товара: чего не подтверждено — то `null`. */
export function mountingOf(meta: Partial<MountingData> | undefined): MountingData {
  const num = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

  const extra: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(meta?.extra ?? {})) extra[key] = num(value);

  return {
    holeDiameterMm: num(meta?.holeDiameterMm),
    holeDepthMm: num(meta?.holeDepthMm),
    edgeOffsetMm: num(meta?.edgeOffsetMm),
    firstHoleOffsetMm: num(meta?.firstHoleOffsetMm),
    pitchMm: num(meta?.pitchMm),
    topOffsetMm: num(meta?.topOffsetMm),
    bottomOffsetMm: num(meta?.bottomOffsetMm),
    runnerOffsetMm: num(meta?.runnerOffsetMm),
    extra,
  };
}

/**
 * ЗАДАНЫ ЛИ МОНТАЖНЫЕ РАЗМЕРЫ.
 *
 * Пусто — «подтверждённых данных нет», и это НЕ ноль: по нулю цех
 * просверлит отверстие на кромке. По такой позиции присадка не
 * рассчитывается и операция сверления не создаётся.
 *
 * Расчёт присадки в этом заходе не тронут: функция существует, чтобы
 * состояние было названо, а не додумано.
 */
export function hasMountingData(item: Pick<HardwareItem, 'mounting'>): boolean {
  const m = item.mounting;
  const named = [
    m.holeDiameterMm,
    m.holeDepthMm,
    m.edgeOffsetMm,
    m.firstHoleOffsetMm,
    m.pitchMm,
    m.topOffsetMm,
    m.bottomOffsetMm,
    m.runnerOffsetMm,
  ];
  return (
    named.some((value) => value !== null) ||
    Object.values(m.extra).some((value) => value !== null)
  );
}

/** Прочитать позицию каталога как фурнитуру. Не фурнитура — `null`. */
export function hardwareOf(item: CatalogEntryFull): HardwareItem | null {
  const raw = item.meta?.hardware as Partial<HardwareMeta> | undefined;
  const category = raw?.category;
  if (!category || !CATEGORIES.has(category)) return null;

  const brand =
    raw?.brand && BRANDS.has(raw.brand) ? (raw.brand as HardwareBrand) : undefined;

  return {
    id: item.id,
    orgId: item.org_id,
    name: item.name_ru,
    article: item.article,
    price: item.price,
    active: item.is_active,
    estimateKey: String(item.meta?.estimateKey ?? '').trim(),
    hardware: {
      category,
      brand,
      model: typeof raw?.model === 'string' ? raw.model : undefined,
      softClose: typeof raw?.softClose === 'boolean' ? raw.softClose : undefined,
      slideKind: raw?.slideKind,
      fastenerKind: raw?.fastenerKind,
      fillingKind: raw?.fillingKind,
      otherKind: raw?.otherKind,
      pricingUnit: raw?.pricingUnit,
      currency: typeof raw?.currency === 'string' ? raw.currency : undefined,
    },
    mounting: mountingOf(raw?.mounting),
  };
}

/** Вся фурнитура каталога по идентификатору позиции. */
export function hardwareCatalog(items: CatalogEntryFull[]): Map<string, HardwareItem> {
  const out = new Map<string, HardwareItem>();
  for (const item of items) {
    const hardware = hardwareOf(item);
    if (hardware) out.set(hardware.id, hardware);
  }
  return out;
}

/** Фурнитура одной категории: из чего организация выбирает. */
export function hardwareByCategory(
  catalog: Map<string, HardwareItem>,
  category: HardwareCategory,
): HardwareItem[] {
  return Array.from(catalog.values())
    .filter((item) => item.hardware.category === category && item.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/**
 * ЧТО СТАЛО СО ССЫЛКОЙ МОДУЛЯ.
 *
 * Ссылка, которая не разрешилась, — это НЕ ноль и не молчание. Позицию
 * могли отключить, удалить или открыть проект в другой организации; во
 * всех этих случаях модуль считается ПО-ПРЕЖНЕМУ — по ключу статьи, как
 * до каталога, — а расхождение называется словами.
 *
 * Молча обнулить цену здесь значило бы отдать клиенту смету без петель.
 */
export type HardwareLink =
  | { state: 'none' }
  | { state: 'resolved'; item: HardwareItem }
  | { state: 'missing'; id: string; reason: string }
  | { state: 'inactive'; item: HardwareItem; reason: string }
  | { state: 'priceless'; item: HardwareItem; reason: string };

export function resolveHardware(
  unit: Pick<Module, 'hardwareItemId' | 'label'>,
  catalog: Map<string, HardwareItem>,
): HardwareLink {
  const id = unit.hardwareItemId;
  if (!id) return { state: 'none' };

  const item = catalog.get(id);
  if (!item) {
    return {
      state: 'missing',
      id,
      reason:
        `«${unit.label}»: выбранная фурнитура в каталоге не найдена. ` +
        'Позицию удалили или проект открыт в другой организации — ' +
        'считаем как раньше, по типовой ставке.',
    };
  }

  if (!item.active) {
    return {
      state: 'inactive',
      item,
      reason:
        `«${unit.label}»: «${item.name}» отключена в каталоге. ` +
        'Считаем как раньше, по типовой ставке, — цена отключённой позиции не применяется.',
    };
  }

  /*
   * Ноль здесь не «бесплатно», а «цену не задали». Пропустить его молча
   * значит отдать клиенту смету, в которой петель нет вовсе.
   */
  if (!Number.isFinite(item.price) || item.price <= 0) {
    return {
      state: 'priceless',
      item,
      reason: `«${unit.label}»: у «${item.name}» цена не задана — считаем по типовой ставке.`,
    };
  }

  return { state: 'resolved', item };
}

/**
 * Несоответствия каталога словами — тем же каналом, что остальные
 * предупреждения ряда. Повторы схлопываются: десять модулей с одной
 * удалённой позицией — это один вопрос к каталогу, а не десять проблем.
 */
export function hardwareWarnings(
  run: Pick<Run, 'modules' | 'upperSegments'>,
  catalog: Map<string, HardwareItem>,
): { id: string; severity: 'clarify'; message: string }[] {
  const seen = new Map<string, string>();

  const units = [...run.modules, ...run.upperSegments.flatMap((segment) => segment.modules)];
  for (const unit of units) {
    const link = resolveHardware(unit, catalog);
    if (link.state === 'none' || link.state === 'resolved') continue;

    const key = link.state === 'missing' ? `missing:${link.id}` : `${link.state}:${link.item.id}`;
    if (!seen.has(key)) seen.set(key, link.reason);
  }

  return Array.from(seen.entries()).map(([key, message]) => ({
    id: `hardware-${key}`,
    severity: 'clarify' as const,
    message,
  }));
}

export { EMPTY_MOUNTING };
