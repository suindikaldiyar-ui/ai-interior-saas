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

/** Точка на схеме планировки, в её же пикселях. */
export interface PlanPoint {
  x: number;
  y: number;
}

/**
 * Масштаб схемы планировки.
 *
 * Схема застройщика — это МАСШТАБНЫЙ ЧЕРТЁЖ, а площади комнат в объявлении
 * известны с точностью до сотой. Значит масштаб выводится из них: обвели
 * комнату известной площади — получили миллиметры в пикселе, а из них
 * длину любой стены.
 *
 * Это НЕ заменяет замер. Это даёт предварительный проект и предварительную
 * цену в тот же день, когда планировку завели.
 */
export interface PlanCalibration {
  /** Миллиметров в одном пикселе схемы. */
  mmPerPx: number;
  /** По какой комнате калибровали и её площадь — для проверки глазами. */
  basisRoom: string;
  basisAreaM2: number;
  /** Контур комнаты в координатах схемы. */
  basisPolygon: PlanPoint[];
  calibratedAt: string;
}

/** Стена, снятая со схемы: под неё и собирается ряд. */
export interface DerivedWall {
  zone: ZoneKind;
  from: PlanPoint;
  to: PlanPoint;
  lengthMm: number;
  openings: { kind: 'window' | 'door'; fromCornerMm: number; widthMm: number }[];
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
  /**
   * Масштаб схемы. Пусто — размеров со схемы нет, и цены тоже нет:
   * цена без длины ряда — выдуманное число.
   */
  calibration?: PlanCalibration;
  /** Стены, снятые со схемы. Живут ОТДЕЛЬНО от `zones`: это не замер. */
  derivedWalls: DerivedWall[];
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
  /**
   * Собран автоматически по размерам со схемы. Такой проект — стартовая
   * точка, а не финал: замерщик откроет и поправит. Ручной всегда главнее,
   * и при его появлении автоматический уходит.
   */
  isAuto?: boolean;
  /** Откуда размеры: замер квартиры или схема застройщика. */
  sizeSource?: SizeSource;
  createdAt?: string;
}

/** Откуда взялись размеры. От этого зависят допуск и слово «предварительно». */
export type SizeSource = 'survey' | 'scheme';

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
 * Допуск размеров, снятых со схемы.
 *
 * Обводка контура даёт 2–3 % погрешности, на стене 3200 мм это ±60–100 мм.
 * Обещать здесь тридцать миллиметров — врать: клиент запомнит первую
 * названную сумму, а разница на замере будет стоить компании доверия.
 */
export const SCHEME_TOLERANCE_MM = 100;

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

/**
 * Есть ли у планировки размеры со схемы.
 *
 * Третье состояние между «заведена» и «обмерена»: чертёж и предварительная
 * цена уже есть, замерщик ещё не выезжал.
 */
export function hasSchemeSizes(
  plan: Pick<FloorPlan, 'calibration' | 'derivedWalls'>,
): boolean {
  return Boolean(plan.calibration) && plan.derivedWalls.length > 0;
}

/**
 * Откуда у зоны размеры. НАСТОЯЩИЙ ЗАМЕР ВСЕГДА СИЛЬНЕЕ: появился он —
 * выведенное со схемы отходит, и допуск возвращается к тридцати миллиметрам.
 */
export function sizeSourceFor(
  plan: Pick<FloorPlan, 'zones' | 'measuredAt' | 'calibration' | 'derivedWalls'>,
  zone: ZoneKind,
): SizeSource | null {
  if (isMeasured(plan) && plan.zones.some((z) => z.zone === zone)) return 'survey';
  if (hasSchemeSizes(plan) && plan.derivedWalls.some((w) => w.zone === zone)) return 'scheme';
  return null;
}

/** Допуск планировки: замер — свой, схема — сто миллиметров. */
export function planToleranceMm(
  plan: Pick<FloorPlan, 'zones' | 'measuredAt' | 'toleranceMm' | 'calibration' | 'derivedWalls'>,
  zone?: ZoneKind,
): number {
  const source = zone ? sizeSourceFor(plan, zone) : isMeasured(plan) ? 'survey' : hasSchemeSizes(plan) ? 'scheme' : null;
  return source === 'scheme' ? SCHEME_TOLERANCE_MM : plan.toleranceMm;
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
 * Длина стены зоны: сначала замер, потом схема.
 *
 * Порядок здесь и есть правило «настоящий замер сильнее»: пока его нет,
 * работает выведенное со схемы; появился — схема молчит.
 */
export function zoneRunLengthMm(
  plan: Pick<FloorPlan, 'zones' | 'measuredAt' | 'calibration' | 'derivedWalls'>,
  zone: ZoneKind,
): number | null {
  const measured = planRunLengthMm(planZone(plan, zone));
  if (measured) return measured;

  if (!hasSchemeSizes(plan)) return null;
  const wall = plan.derivedWalls.find((w) => w.zone === zone);
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

/**
 * Откуда размеры, словами. Уходит в `basis` каждой подставленной величины
 * и на публичную страницу: клиент имеет право знать, что цена посчитана
 * по схеме застройщика, а не по его квартире.
 */
export function schemeBasis(plan: Pick<FloorPlan, 'calibration'>): string {
  const room = plan.calibration?.basisRoom;
  return (
    'размеры сняты со схемы планировки' +
    (room ? ` (масштаб по комнате «${room}»)` : '') +
    `, погрешность ±${SCHEME_TOLERANCE_MM} мм`
  );
}

/** Основание для зоны: замер, схема или ничего. */
export function sizeBasis(
  plan: Pick<
    FloorPlan,
    'zones' | 'measuredAt' | 'sourceApartment' | 'toleranceMm' | 'calibration' | 'derivedWalls'
  >,
  zone: ZoneKind,
): string | null {
  const source = sizeSourceFor(plan, zone);
  if (source === 'survey') return libraryBasis(plan);
  if (source === 'scheme') return schemeBasis(plan);
  return null;
}

/** Сколько готовых проектов у зоны: больше `MAX_READY_PER_ZONE` не показываем. */
export function readyForZone(list: ReadyProject[], zone: ZoneKind): ReadyProject[] {
  return list.filter((p) => p.zone === zone).slice(0, MAX_READY_PER_ZONE);
}

/** Сумма площадей комнат: сверка с общей площадью объявления. */
export function roomAreasTotal(areas: RoomArea[]): number {
  return Math.round(areas.reduce((sum, a) => sum + (a.areaM2 || 0), 0) * 100) / 100;
}
