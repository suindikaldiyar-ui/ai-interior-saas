import { SCHEME_TOLERANCE_MM, type DerivedWall, type PlanPoint } from '@/types/complexes';
import type { CommPoint, Measurement, Opening } from '@/types/millwork';

/**
 * МАСШТАБ СХЕМЫ ПЛАНИРОВКИ.
 *
 * Схема застройщика — масштабный чертёж, а площади комнат в объявлении
 * известны до сотой доли метра. Значит масштаб выводится из них: обвели
 * комнату известной площади — получили миллиметры в пикселе, а из них
 * длину любой стены.
 *
 * Файл чистый: ни базы, ни DOM. Всё, что тут считается, проверяется
 * приёмкой без браузера — это те самые числа, из которых потом получится
 * цена, и ошибаться им нельзя.
 */

/** Меньше трёх точек — не контур, а линия. */
export const MIN_POLYGON_POINTS = 3;

/**
 * Площадь многоугольника в пикселях, формула шнурков.
 *
 * Знак отбрасываем: обводить по часовой или против — дело человека,
 * а не системы.
 */
export function polygonAreaPx(points: PlanPoint[]): number {
  if (points.length < MIN_POLYGON_POINTS) return 0;

  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Масштаб из обведённой комнаты: миллиметров в пикселе.
 *
 * Площадь растёт как квадрат линейного размера, поэтому масштаб — корень
 * из отношения площадей. Ноль и отрицательные значения не возвращаем:
 * дальше на этот множитель делят.
 */
export function mmPerPxFromArea(areaPx: number, areaM2: number): number | null {
  if (areaPx <= 0 || areaM2 <= 0) return null;
  return Math.sqrt((areaM2 * 1_000_000) / areaPx);
}

export function distancePx(a: PlanPoint, b: PlanPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Длина отрезка в миллиметрах, целых: внутри движка мебели дробных нет. */
export function lengthMm(a: PlanPoint, b: PlanPoint, mmPerPx: number): number {
  return Math.round(distancePx(a, b) * mmPerPx);
}

/**
 * Габариты обведённой комнаты — то, что человек сверяет глазами.
 *
 * Одна проверка «кухня 3180 × 3720» стоит дешевле неверного проекта,
 * поэтому она стоит сразу после обводки, а не в конце.
 */
export function polygonSizeMm(
  points: PlanPoint[],
  mmPerPx: number,
): { widthMm: number; heightMm: number } {
  if (points.length === 0) return { widthMm: 0, heightMm: 0 };

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);

  return {
    widthMm: Math.round((Math.max(...xs) - Math.min(...xs)) * mmPerPx),
    heightMm: Math.round((Math.max(...ys) - Math.min(...ys)) * mmPerPx),
  };
}

/**
 * Проём на стене: две точки проецируются на линию стены.
 *
 * Человек кликает по краям окна на схеме, а не по стене — попасть точно
 * в линию нельзя. Проекция даёт привязку от угла и ширину, а всё, что
 * вылезло за стену, обрезается: окна шире стены не бывает.
 */
export function openingOnWall(
  wall: { from: PlanPoint; to: PlanPoint },
  a: PlanPoint,
  b: PlanPoint,
  mmPerPx: number,
): { fromCornerMm: number; widthMm: number } | null {
  const wallLength = distancePx(wall.from, wall.to);
  if (wallLength <= 0) return null;

  const dx = (wall.to.x - wall.from.x) / wallLength;
  const dy = (wall.to.y - wall.from.y) / wallLength;

  const project = (p: PlanPoint) =>
    (p.x - wall.from.x) * dx + (p.y - wall.from.y) * dy;

  const totalMm = wallLength * mmPerPx;
  const first = Math.min(project(a), project(b)) * mmPerPx;
  const second = Math.max(project(a), project(b)) * mmPerPx;

  const fromCornerMm = Math.round(Math.max(0, Math.min(first, totalMm)));
  const toMm = Math.round(Math.max(0, Math.min(second, totalMm)));
  const widthMm = toMm - fromCornerMm;

  // Проём в пару сантиметров — это промах мышью, а не окно.
  return widthMm >= 100 ? { fromCornerMm, widthMm } : null;
}

/* ─────────────────  Стена со схемы → замер для движка  ───────────────── */

/** Высота потолка, которой на схеме нет вовсе. */
export const SCHEME_CEILING_MM = 2700;

/** Стандартные высоты проёмов: на плане их не видно, это вид сверху. */
const OPENING_GEOMETRY = {
  window: { sillMm: 850, heightMm: 1400 },
  door: { sillMm: 0, heightMm: 2100 },
} as const;

/**
 * Стена со схемы → `Measurement`.
 *
 * Дальше работает обычный конвейер: `surveyFromMeasurement` пометит каждую
 * величину допущением, `buildRun` соберёт ряд, `buildEstimate` посчитает
 * смету. Никакой отдельной ветки «для схемы» в движке нет и не должно быть:
 * вторая ветка разъедется с первой на первом же изменении.
 *
 * Высоты проёмов на плане отсутствуют физически — план это вид сверху.
 * Ставим отраслевые и НЕ делаем вид, что их измерили: сверху вся эта
 * цепочка помечена как `assumed`.
 */
export function measurementFromWall(
  wall: DerivedWall,
  ceilingHeightMm = SCHEME_CEILING_MM,
): Measurement {
  const openings: Opening[] = wall.openings.map((opening, i) => ({
    id: `${wall.zone}-o${i + 1}`,
    kind: opening.kind,
    fromCornerMm: opening.fromCornerMm,
    widthMm: opening.widthMm,
    ...OPENING_GEOMETRY[opening.kind],
  }));

  const comms: CommPoint[] = [];

  return {
    id: `scheme-${wall.zone}`,
    ceilingHeightMm,
    walls: [{ id: 'w1', lengthMm: wall.lengthMm, angleDeg: 90, openings }],
    comms,
    photos: [],
    measuredBy: '',
    measuredAt: '',
    notes: 'Размеры сняты со схемы планировки.',
  };
}

/**
 * Насколько обводка разошлась с объявлением, в процентах.
 *
 * Показывается человеку сразу: расхождение в 8 % значит, что он обвёл не ту
 * комнату или промахнулся углом. Ноль здесь недостижим и не нужен — нужна
 * возможность заметить грубую ошибку до того, как по ней посчитают цену.
 */
export function calibrationDriftPercent(
  points: PlanPoint[],
  mmPerPx: number,
  areaM2: number,
): number {
  const areaPx = polygonAreaPx(points);
  if (areaPx <= 0 || areaM2 <= 0) return 0;

  const measured = (areaPx * mmPerPx * mmPerPx) / 1_000_000;
  return Math.round((Math.abs(measured - areaM2) / areaM2) * 1000) / 10;
}

/** Погрешность на конкретной длине: ±100 мм на 3200 — это 3 %. */
export function toleranceNote(lengthMmValue: number): string {
  const percent = lengthMmValue > 0
    ? Math.round((SCHEME_TOLERANCE_MM / lengthMmValue) * 1000) / 10
    : 0;
  return `±${SCHEME_TOLERANCE_MM} мм${percent > 0 ? ` (${percent} %)` : ''}`;
}
