import {
  EMPTY_MOUNTING,
  HARDWARE_BRANDS,
  type CatalogEntryFull,
  type HardwareBrand,
  type HardwareCategory,
  type HardwareDrillingSpec,
  type HardwareItem,
  type HardwareMeta,
  type HardwareSource,
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
  /* Группы каталога производителей (HARDWARE-01). */
  'drawer_system',
  'lift',
  'wardrobe',
  'kitchen',
  'handle',
  'carcass',
  'sliding',
]);

const MOVEMENTS = new Set<string>(['rotate', 'slide_out', 'lift_up', 'fold_up', 'lower', 'slide_lateral', 'push_open', 'none']);
const ENGINEERING = new Set<string>(['VERIFIED', 'PARTIAL', 'MISSING_DATA', 'CONFLICT', 'NOT_READABLE']);

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;
const number = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** Размеры по источнику: только конечные числа под непустыми именами. */
function numbers(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = number(raw);
    if (key.trim() && n !== undefined) out[key.trim()] = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Пределы по источнику: пара чисел, меньшее первым. Мусор не принимается. */
function ranges(value: unknown): Record<string, [number, number]> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, [number, number]> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(raw) || raw.length !== 2) continue;
    const a = number(raw[0]);
    const b = number(raw[1]);
    if (key.trim() && a !== undefined && b !== undefined && a <= b) out[key.trim()] = [a, b];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.map(text).filter((v): v is string => Boolean(v));
  return out.length > 0 ? out : undefined;
}

/** Размеры «как напечатано»: подпись и значение — только непустые строки. */
function printedList(value: unknown): { label: string; value: string }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: { label: string; value: string }[] = [];
  for (const raw of value) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const label = text(row.label);
    const val = typeof row.value === 'number' ? String(row.value) : text(row.value);
    if (label && val) out.push({ label, value: val });
  }
  return out.length > 0 ? out : undefined;
}

/** Присадка по источнику: неизвестное остаётся `null`, а не нулём. */
function drillingSpecs(value: unknown): HardwareDrillingSpec[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parts = new Set(['door', 'cabinet_side', 'drawer_side', 'front', 'other']);
  const out: HardwareDrillingSpec[] = [];
  for (const raw of value) {
    const spec = (raw ?? {}) as Record<string, unknown>;
    const part = String(spec.part ?? '');
    const what = text(spec.what);
    if (!parts.has(part) || !what) continue;
    out.push({
      part: part as HardwareDrillingSpec['part'],
      what,
      diameterMm: number(spec.diameterMm) ?? null,
      depthMm: number(spec.depthMm) ?? null,
      positionsMm: text(spec.positionsMm) ?? null,
      datum: text(spec.datum) ?? null,
    });
  }
  return out.length > 0 ? out : undefined;
}

/** Где есть 3D (HW-01): архив библиотеки БАЗИС, права не подтверждены; число файлов. */
function cadRefs(value: unknown): HardwareMeta['cad'] {
  if (!Array.isArray(value)) return undefined;
  const out: NonNullable<HardwareMeta['cad']> = [];
  for (const raw of value) {
    const ref = (raw ?? {}) as Record<string, unknown>;
    const file = text(ref.file);
    const files = number(ref.files);
    if (ref.format !== 'BAZIS' || !file || files === undefined) continue;
    out.push({ format: 'BAZIS', file, rightsStatus: 'NOT_VERIFIED', files });
  }
  return out.length > 0 ? out : undefined;
}

function sourceOf(value: unknown): HardwareSource | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const checkedAt = text(raw.checkedAt);
  if (!checkedAt) return undefined;
  const page = number(raw.pdfPage);
  return {
    checkedAt,
    ...(text(raw.file) ? { file: text(raw.file) } : {}),
    /* Источник — архив библиотеки БАЗИС: запись базы номенклатуры внутри него (HW-01). */
    ...(text(raw.entry) ? { entry: text(raw.entry) } : {}),
    ...(text(raw.url) ? { url: text(raw.url) } : {}),
    ...(page !== undefined ? { pdfPage: page } : {}),
    ...(raw.printedPage !== undefined && raw.printedPage !== null ? { printedPage: String(raw.printedPage) } : {}),
  };
}

/**
 * ЗАПИСЬ ИЗДЕЛИЯ ПРОИЗВОДИТЕЛЯ ИЗ `meta.hardware` (HARDWARE-01).
 *
 * Читается то, что положено и того типа, что положено; остальное — как
 * будто его нет. Неизвестное число не превращается в ноль.
 */
function productRecord(raw: Partial<HardwareMeta> | undefined): Partial<HardwareMeta> {
  if (!raw) return {};
  const model3d = raw.model3d as HardwareMeta['model3d'] | undefined;
  const out: Partial<HardwareMeta> = {
    manufacturer: text(raw.manufacturer),
    manufacturerArticle: text(raw.manufacturerArticle),
    officialName: text(raw.officialName),
    subcategory: text(raw.subcategory),
    series: text(raw.series),
    variant: text(raw.variant),
    dimensionsMm: numbers(raw.dimensionsMm),
    ranges: ranges(raw.ranges),
    formulas: strings(raw.formulas),
    printed: printedList(raw.printed),
    loadCapacityKg: number(raw.loadCapacityKg),
    material: text(raw.material),
    finish: text(raw.finish),
    movementType: MOVEMENTS.has(String(raw.movementType)) ? raw.movementType : undefined,
    openingAngleDeg: number(raw.openingAngleDeg),
    strokeMm: number(raw.strokeMm),
    packaging: text(raw.packaging),
    saleUnit: raw.saleUnit === 'pair' || raw.saleUnit === 'piece' || raw.saleUnit === 'set' ? raw.saleUnit : undefined,
    compatibleWith: text(raw.compatibleWith),
    drilling: drillingSpecs(raw.drilling),
    source: sourceOf(raw.source),
    rightsStatus:
      raw.rightsStatus === 'PERMITTED' || raw.rightsStatus === 'RESTRICTED' || raw.rightsStatus === 'NOT_VERIFIED'
        ? raw.rightsStatus
        : undefined,
    engineeringStatus: ENGINEERING.has(String(raw.engineeringStatus)) ? raw.engineeringStatus : undefined,
    visualStatus: raw.visualStatus === 'CAD' || raw.visualStatus === 'VISUAL_APPROXIMATION' ? raw.visualStatus : undefined,
    model3d:
      model3d && typeof model3d.url === 'string' && model3d.format === 'glb' && model3d.units === 'mm'
        ? { url: model3d.url, format: 'glb', units: 'mm' }
        : undefined,
    cad: cadRefs(raw.cad),
    missing: strings(raw.missing),
    notes: text(raw.notes),
  };
  /* Пустые поля не держим вовсе: запись сравнивается и сохраняется без мусора. */
  for (const key of Object.keys(out) as (keyof HardwareMeta)[]) if (out[key] === undefined) delete out[key];
  return out;
}

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
      ...productRecord(raw),
    },
    mounting: mountingOf(raw?.mounting),
    ...(item.detail === 'light' ? { detail: 'light' as const } : {}),
  };
}

/**
 * ЗАПИСЬ ИЗДЕЛИЯ ИЗ ЧУЖОГО ВХОДА (HARDWARE-01): загрузка файла, импорт
 * фактов. Тот же разбор, что у `hardwareOf`: категория из списка, бренд
 * из списка, поля производителя — только своих типов. Нет категории —
 * записи нет (`null`): позиция без группы в каталоге не живёт.
 */
export function sanitizeHardwareMeta(raw: unknown): HardwareMeta | null {
  const value = (raw ?? {}) as Partial<HardwareMeta>;
  const category = value.category;
  if (!category || !CATEGORIES.has(category)) return null;
  const brand = value.brand && BRANDS.has(value.brand) ? (value.brand as HardwareBrand) : undefined;
  return { category, ...(brand ? { brand } : {}), ...productRecord(value) };
}

/**
 * РАЗОБРАННАЯ ФУРНИТУРА — ОДНА НА МАССИВ КАТАЛОГА (HARDWARE-PHOTO-PERF-01).
 *
 * Каталог в сторе меняется заменой массива, а не правкой на месте, поэтому
 * массив — ключ: рабочее место, схема, сцена каждой стены и смета объекта
 * спрашивали `hardwareCatalog` у одного и того же массива и разбирали
 * 1199 записей изделий каждый по-своему. Теперь разбор один на массив, а
 * карта общая — её не меняют, только читают.
 */
const PARSED = new WeakMap<CatalogEntryFull[], Map<string, HardwareItem>>();

/** Вся фурнитура каталога по идентификатору позиции. */
export function hardwareCatalog(items: CatalogEntryFull[]): Map<string, HardwareItem> {
  const known = PARSED.get(items);
  if (known) return known;
  const out = new Map<string, HardwareItem>();
  for (const item of items) {
    const hardware = hardwareOf(item);
    if (hardware) out.set(hardware.id, hardware);
  }
  PARSED.set(items, out);
  return out;
}

/**
 * НА КАКИЕ ПОЗИЦИИ БЕЗ ПАСПОРТА ССЫЛАЕТСЯ СОСТОЯНИЕ.
 *
 * Обходит значение целиком (ряды стен: `fittings`, `hardwareItemId`,
 * `slideItemId` отсеков, `slidingSystemItemId` — и любое будущее место
 * ссылки) и возвращает идентификаторы строк каталога с `detail: 'light'`,
 * которые в нём встречаются. Лишняя строка в ответе стоит одного лишнего
 * чтения; пропущенная — присадки «не дочитано» у установленной позиции,
 * поэтому обход не знает мест ссылки поимённо.
 */
export function lightReferences(state: unknown, catalog: CatalogEntryFull[]): string[] {
  const light = new Set(catalog.filter((entry) => entry.detail === 'light').map((entry) => entry.id));
  if (light.size === 0) return [];
  const found = new Set<string>();
  const seen = new Set<object>();
  const walk = (value: unknown) => {
    if (typeof value === 'string') {
      if (light.has(value)) found.add(value);
      return;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const child of Array.isArray(value) ? value : Object.values(value)) walk(child);
  };
  walk(state);
  return Array.from(found).sort();
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
