import type { Measurement, Run, ZoneKind } from './millwork';
import type { RateTable } from '@/lib/millwork/estimate';

/**
 * БИБЛИОТЕКА ПЛАНИРОВОК ЖК.
 *
 * Застройщики сдают дома сериями: в одном ЖК сотни одинаковых квартир.
 * Отсюда три вещи, ради которых всё и строится:
 *
 *  1. Один замер работает на сотни квартир. Замерщик один раз меряет
 *     квартиру этого типа — и замер годится для всех одинаковых.
 *  2. Клиенту говорят фразу, после которой он слушает: «на вашу квартиру
 *     у нас уже есть готовый проект».
 *  3. У компании появляется актив: двадцать обмеренных планировок — это то,
 *     чего нет у конкурента, и принадлежит оно организации.
 */

/** Жилой комплекс. */
export interface Complex {
  id: string;
  orgId: string;
  /** Часть адреса публичной страницы: /zk/[slug]. */
  slug: string;
  name: string;
  developer: string;
  city: string;
  isPublic: boolean;
  createdAt?: string;
}

/** Площадь комнаты из объявления застройщика: «спальня 14.71». */
export interface RoomArea {
  name: string;
  areaM2: number;
}

/** Замер одной зоны квартиры. */
export interface FloorPlanZone {
  zone: ZoneKind;
  measurement: Measurement;
  notes?: string;
}

/**
 * Планировка внутри ЖК.
 *
 * Заводится ДО замера и уже в этом виде работает: публичная страница
 * открывается, заявка приходит. Замер добавляется потом и «открывает»
 * планировку — см. `isMeasured`.
 */
export interface FloorPlan {
  id: string;
  complexId: string;
  /** Часть адреса: /zk/[complex]/[slug]. */
  slug: string;
  code: string;
  rooms: number;
  areaM2: number;
  /** Площади комнат из объявления застройщика. Это НЕ замер. */
  roomAreas: RoomArea[];
  /** Схема планировки: свой файл в Storage, не скачанный у застройщика. */
  schemePath?: string;

  /** Замеры по зонам. Пусто — планировка ещё не обмерена. */
  zones: FloorPlanZone[];
  measuredAt?: string;
  measuredBy?: string;
  /** Честность: на какой именно квартире снят замер. */
  sourceApartment?: string;
  /** Допуск: у одинаковых квартир стены гуляют. */
  toleranceMm: number;
  isPublic: boolean;
  createdAt?: string;
}

/** Готовый проект под конкретную планировку и зону. */
export interface ReadyProject {
  id: string;
  floorPlanId: string;
  zone: ZoneKind;
  title: string;
  run: Run;
  priceSnapshot: RateTable;
  total: number;
  renderPath?: string;
  isPublic: boolean;
  createdAt?: string;
}

/** Заявка с публичной страницы планировки. */
export interface PlanLead {
  id: string;
  floorPlanId: string;
  name: string;
  phone: string;
  comment?: string;
  createdAt?: string;
}

/** Допуск по умолчанию: у одинаковых квартир стены расходятся на сантиметры. */
export const DEFAULT_TOLERANCE_MM = 30;

/**
 * Больше трёх готовых проектов на зону не показываем — то же правило,
 * что у компоновок: клиент теряется, а не выбирает.
 */
export const MAX_READY_PER_ZONE = 3;

/**
 * Обмерена ли планировка.
 *
 * СЧИТАЕТСЯ, а не хранится флагом: флаг забудут переключить, и продукт
 * начнёт обещать проекты, которых нет. Ровно так же считается готовность
 * зоны в `zoneReadiness`.
 */
export function isMeasured(plan: Pick<FloorPlan, 'zones' | 'measuredAt'>): boolean {
  return plan.zones.length > 0 && Boolean(plan.measuredAt);
}

/** Есть ли в библиотеке замер под эту зону. */
export function planZone(
  plan: Pick<FloorPlan, 'zones'>,
  zone: ZoneKind,
): FloorPlanZone | null {
  return plan.zones.find((z) => z.zone === zone) ?? null;
}

/**
 * Длина стены ряда из библиотечного замера. Ради неё всё и хранится:
 * площадь комнаты сметы не даёт, а длина ряда — даёт.
 */
export function planRunLengthMm(zone: FloorPlanZone | null): number | null {
  const wall = zone?.measurement.walls[0];
  return wall && wall.lengthMm > 0 ? wall.lengthMm : null;
}

/**
 * Откуда взяты размеры. Строка уходит в `basis` каждой подставленной
 * величины и в предупреждение на экране — замерщик обязан видеть, что
 * это чужой замер, а не его собственный.
 */
export function libraryBasis(plan: Pick<FloorPlan, 'measuredAt' | 'sourceApartment' | 'toleranceMm'>): string {
  const date = plan.measuredAt ? new Date(plan.measuredAt).toLocaleDateString('ru-RU') : 'без даты';
  const where = plan.sourceApartment ? ` на ${plan.sourceApartment}` : '';
  return `размеры из библиотеки, замер ${date}${where}, допуск ±${plan.toleranceMm} мм`;
}

/** Сколько готовых проектов у зоны: больше `MAX_READY_PER_ZONE` не показываем. */
export function readyForZone(list: ReadyProject[], zone: ZoneKind): ReadyProject[] {
  return list.filter((p) => p.zone === zone).slice(0, MAX_READY_PER_ZONE);
}

/** Сумма площадей комнат: сверка с общей площадью объявления. */
export function roomAreasTotal(areas: RoomArea[]): number {
  return Math.round(areas.reduce((sum, a) => sum + (a.areaM2 || 0), 0) * 100) / 100;
}
