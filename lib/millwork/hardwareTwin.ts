/**
 * HARDWARE DIGITAL TWIN ENGINE — РЕЕСТР 3D-ФУРНИТУРЫ (ТЗ 2026-10-31, § 3–4).
 *
 * Производитель → Серия → Артикул → CAD → 3D → Кинематика → Монтаж →
 * Присадка → BOM. Второго каталога нет: запись реестра лежит в той же строке
 * `catalog_items`, рядом с записью изделия, — `meta.twin` (как фото в
 * `meta.media`): импорт фактов переписывает `meta.hardware` и реестр не
 * трогает. Сам файл (GLB) — в Storage, в каталоге — только путь, размер и
 * отпечаток sha256: бинарная геометрия в JSON каталога не хранится.
 *
 * Модель в файле нормализована при импорте: миллиметры, ось Y вверх, X вдоль
 * фасада (от петельной кромки внутрь), Z — к человеку. Монтажная точка
 * (`anchor`) — точка модели, которая встаёт на монтажную точку движка
 * (`hingeCupPlace`, начало направляющей, середина ручки): 3D ставится по
 * инженерной модели, а не наоборот, и ни одного размера деревянной детали
 * CAD-ресурс не меняет.
 *
 * Достоверность (§ 3.2) — пять состояний, и они не смешиваются:
 *   OFFICIAL_CAD            — геометрия производителя, допустимая к использованию;
 *   VERIFIED_RECONSTRUCTION — построена по подтверждённым чертежам и размерам;
 *   VISUAL_RECONSTRUCTION   — внешний вид по фото, часть геометрии не проверена;
 *   PLACEHOLDER             — временная примитивная модель;
 *   NO_MODEL                — 3D нет.
 * Отдельно — состояние производственных данных (`verification.manufacturing`):
 * официальная модель не делает присадку готовой, и наоборот.
 */

import type { FittingSlot } from '@/types/millwork';
import type { HardwareItem, HardwareModel3dStatus, HardwareTwin, TwinAnchorKind, TwinFinish, TwinRole, TwinStatus } from '@/types/catalog';

export type { HardwareTwin, TwinAnchorKind, TwinFinish, TwinRole, TwinStatus };

export const TWIN_STATUS_WORDS: Record<TwinStatus, string> = {
  OFFICIAL_CAD: 'CAD производителя',
  VERIFIED_RECONSTRUCTION: 'Реконструкция по подтверждённым размерам',
  VISUAL_RECONSTRUCTION: 'Визуальная реконструкция — часть геометрии не проверена',
  PLACEHOLDER: 'Временная условная модель — не профессиональная 3D-фурнитура',
  NO_MODEL: '3D-модели нет',
};

const STATUSES = ['OFFICIAL_CAD', 'VERIFIED_RECONSTRUCTION', 'VISUAL_RECONSTRUCTION'] as const;
const ANCHORS: TwinAnchorKind[] = ['cup_axis', 'plate_center', 'runner_front', 'handle_center', 'mount_point'];
const ROLES: TwinRole[] = ['fixed', 'moving', 'middle'];
const FINISHES: TwinFinish[] = ['chrome', 'nickel', 'stainless', 'aluminium', 'black_matte', 'white', 'grey', 'brass', 'anthracite'];

const isVec = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
const str = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * ЗАПИСЬ РЕЕСТРА ИЗ `meta.twin` — строго. Чего нет или что не того вида —
 * записи нет (null), а не запись с придуманными значениями: модель без
 * монтажной точки или без габарита в сцену не ставится.
 */
export function parseTwin(raw: unknown): HardwareTwin | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const asset = t.asset as Record<string, unknown> | undefined;
  const source = t.source as Record<string, unknown> | undefined;
  const bounds = t.boundsMm as Record<string, unknown> | undefined;
  const anchor = t.anchor as Record<string, unknown> | undefined;
  const verification = t.verification as Record<string, unknown> | undefined;
  if (t.version !== 1 || !STATUSES.includes(t.status as (typeof STATUSES)[number])) return null;
  if (!asset || !str(asset.path) || typeof asset.bytes !== 'number' || !(asset.bytes > 0) || !str(asset.sha256)) return null;
  if (!source || !str(source.fileName) || !str(source.license) || !str(source.rightsNote) || !str(source.importedAt)) return null;
  if (!['manufacturer_cad', 'drawing_reconstruction', 'photo_reconstruction'].includes(String(source.kind))) return null;
  if (!['step', 'iges', 'glb', 'gltf', 'obj'].includes(String(source.format))) return null;
  if (!['VERIFIED', 'NOT_VERIFIED', 'RESTRICTED'].includes(String(source.rights))) return null;
  if (!bounds || !isVec(bounds.min) || !isVec(bounds.max) || bounds.min.some((v, i) => !(v < (bounds.max as number[])[i]))) return null;
  if (!anchor || !ANCHORS.includes(anchor.kind as TwinAnchorKind) || !isVec(anchor.pointMm)) return null;
  if (!Array.isArray(t.parts) || !t.parts.every((p) => p && str((p as { node?: unknown }).node) && ROLES.includes((p as { role?: unknown }).role as TwinRole))) return null;
  if (!verification || !['CHECKED', 'UNCHECKED'].includes(String(verification.visual)) || !['VERIFIED', 'UNVERIFIED'].includes(String(verification.manufacturing))) return null;
  /* Официальная модель — только с подтверждённым правом: иначе это чужая геометрия под видом своей. */
  if (t.status === 'OFFICIAL_CAD' && (source.kind !== 'manufacturer_cad' || source.rights !== 'VERIFIED')) return null;
  if (t.finish !== undefined && !FINISHES.includes(t.finish as TwinFinish)) return null;
  return t as unknown as HardwareTwin;
}

const FINISH_WORDS: Record<TwinFinish, string> = {
  chrome: 'хром',
  nickel: 'никель',
  stainless: 'нержавеющая сталь',
  aluminium: 'алюминий',
  black_matte: 'чёрный матовый',
  white: 'белый',
  grey: 'серый',
  brass: 'латунь',
  anthracite: 'антрацит',
};

/**
 * ПОКРЫТИЕ МОДЕЛИ РЕЕСТРА — словами (решение владельца 2026-11-01, п. 3): без
 * `finish` — материалы самого файла; с ним — выбрано при импорте. Ни то, ни
 * другое производитель не подтверждал, пока модель не его CAD с правами.
 */
export function twinFinishWords(twin: HardwareTwin): string {
  const confirmed = twin.status === 'OFFICIAL_CAD';
  if (twin.finish === undefined) return confirmed ? 'материалы — из CAD производителя' : 'материалы — как в файле модели; цвет производителем не подтверждён';
  return `покрытие «${FINISH_WORDS[twin.finish]}» выбрано при импорте — производителем не подтверждено`;
}

/** Запись реестра позиции: `meta.twin` строки каталога (`hardwareOf` кладёт её в `HardwareItem.twin`). */
export function twinOf(item: HardwareItem | null | undefined): HardwareTwin | null {
  return item?.twin ?? null;
}

/**
 * ДОСТОВЕРНОСТЬ 3D ПОЗИЦИИ — словами ТЗ (§ 3.2). Запись реестра сильнее
 * всего; без неё — то, чем позицию рисует сцена (`model3dStatusOf`):
 * модель по размерам паспорта — проверенная реконструкция, по чертежу —
 * визуальная, условная коробка — временная, ничего — нет модели.
 */
export function twinStatusOf(item: HardwareItem, drawn: HardwareModel3dStatus): TwinStatus {
  const twin = twinOf(item);
  if (twin) return twin.status;
  switch (drawn) {
    case 'OFFICIAL_CAD':
      return 'OFFICIAL_CAD';
    case 'MEASURED_RECONSTRUCTION':
      return 'VERIFIED_RECONSTRUCTION';
    case 'VISUAL_RECONSTRUCTION':
      return 'VISUAL_RECONSTRUCTION';
    case 'VISUAL_APPROXIMATION':
      return 'PLACEHOLDER';
    default:
      return 'NO_MODEL';
  }
}

/** Монтажная точка места модуля, на которую встаёт модель. */
export function anchorKindFor(slot: FittingSlot): TwinAnchorKind {
  switch (slot) {
    case 'hinge':
      return 'cup_axis';
    case 'hinge_plate':
      return 'plate_center';
    case 'slide':
    case 'drawer_side':
      return 'runner_front';
    case 'handle':
      return 'handle_center';
    default:
      return 'mount_point';
  }
}

/**
 * ПОЛОЖЕНИЕ МОДЕЛИ В СЦЕНЕ — одна проверяемая трансформация (§ 22): миллиметры
 * файла → метры сцены, монтажная точка модели → монтажная точка движка.
 * `mirror` — петля справа, направляющая правой стороны: ось X отражена
 * (модель хранится в положении «слева»).
 */
export function twinPlacement(
  twin: Pick<HardwareTwin, 'anchor'>,
  anchorM: [number, number, number],
  mirror = false,
): { position: [number, number, number]; scale: [number, number, number] } {
  const s = 0.001;
  const sx = mirror ? -s : s;
  const [ax, ay, az] = twin.anchor.pointMm;
  return { position: [anchorM[0] - ax * sx, anchorM[1] - ay * s, anchorM[2] - az * s], scale: [sx, s, s] };
}

/**
 * ГАБАРИТ МОДЕЛИ ПРОТИВ ИЗДЕЛИЯ (§ 14, аномалии). Модель, которая больше
 * своего изделия, — ошибка масштаба (мм ↔ м), осей или файла, а не
 * фурнитура: в «Дизайне» она не рисуется, разработчику — слова. Пределы — из
 * напечатанных размеров позиции; где размера нет — из класса изделия, и это
 * сказано (предел не выдаётся за паспорт).
 */
export function twinBoundsCheck(twin: Pick<HardwareTwin, 'boundsMm'>, item: HardwareItem, slot: FittingSlot): { ok: boolean; words: string } {
  const size = [0, 1, 2].map((i) => twin.boundsMm.max[i] - twin.boundsMm.min[i]);
  const longest = Math.max(...size);
  const dims = item.hardware.dimensionsMm ?? {};
  const nl = typeof dims.nominalLength === 'number' ? dims.nominalLength : null;
  if (slot === 'slide' || slot === 'drawer_side') {
    if (nl === null) return longest <= 800 ? { ok: true, words: 'длина NL не напечатана — предел класса 800 мм' } : { ok: false, words: `модель ${Math.round(longest)} мм длиннее предела направляющей 800 мм` };
    const tolerance = Math.max(10, nl * 0.03);
    return Math.abs(longest - nl) <= tolerance
      ? { ok: true, words: `длина модели ${Math.round(longest)} мм — NL ${nl} ± ${Math.round(tolerance)}` }
      : { ok: false, words: `длина модели ${Math.round(longest)} мм, а NL позиции ${nl} мм (допуск ± ${Math.round(tolerance)})` };
  }
  if (slot === 'hinge' || slot === 'hinge_plate') {
    return longest <= 160 ? { ok: true, words: `габарит ${Math.round(longest)} мм — в пределе петли 160 мм` } : { ok: false, words: `модель петли ${Math.round(longest)} мм — больше предела 160 мм (масштаб или оси)` };
  }
  if (slot === 'handle') {
    const length = typeof dims.length === 'number' ? dims.length : typeof dims.A === 'number' ? (dims.A as number) : null;
    if (length !== null) {
      const tolerance = Math.max(5, length * 0.05);
      return Math.abs(longest - length) <= tolerance
        ? { ok: true, words: `длина модели ${Math.round(longest)} мм — по паспорту ${length} ± ${Math.round(tolerance)}` }
        : { ok: false, words: `длина модели ${Math.round(longest)} мм, а по паспорту ${length} мм (допуск ± ${Math.round(tolerance)})` };
    }
    return longest <= 1200 ? { ok: true, words: 'длина ручки не напечатана — предел класса 1200 мм' } : { ok: false, words: `модель ручки ${Math.round(longest)} мм — больше предела 1200 мм` };
  }
  return longest <= 1500 ? { ok: true, words: 'предел класса 1500 мм' } : { ok: false, words: `модель ${Math.round(longest)} мм — больше предела механизма 1500 мм` };
}

/** Узлы модели по роли: неподвижные — на корпусе, едущие — с фасадом, средние — на половину хода. */
export function twinRoleOf(twin: Pick<HardwareTwin, 'parts'>, node: string): TwinRole {
  return twin.parts.find((p) => p.node === node)?.role ?? 'fixed';
}
