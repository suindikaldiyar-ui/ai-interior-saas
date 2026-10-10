import { valueOf, type SurveyWall } from '@/types/survey';

/**
 * ГДЕ СТОИТ КАЖДАЯ СТЕНА ЗАМЕРА НА ПЛАНЕ — ОДНА ФУНКЦИЯ НА ДВА ПЛАНА.
 *
 * Цепочка сегментов: каждый следующий отсчитывается от конца предыдущего и
 * поворачивает на замеренный угол. Пара «ширина × длина» не годится —
 * реальные кухни бывают Г-образными, с эркерами и коробами.
 *
 * Жила внутри `SurveyPlan` (план на шаге замера мастера). План комнаты
 * Studio (STAGE 01B) строится из того же замера, и вторая копия обхода
 * разошлась бы с первой на первом же нестандартном угле: на одном экране
 * стена поворачивала бы направо, на другом налево. Поэтому обход здесь, а
 * оба плана его только рисуют.
 *
 * Единицы — миллиметры; ось X вправо, ось Y вниз (как в SVG), курс 0° —
 * вправо, поворот «направо» увеличивает курс. Стена без замеренной длины
 * стоит в цепочке нулевой длины: её нет на плане, но место в обходе за
 * ней сохраняется — следующая стена идёт от того же угла.
 */
export type PlanPoint = { x: number; y: number };

export type PlacedWall = {
  wall: SurveyWall;
  /** Номер стены в обходе: «Стена 1» — индекс 0. */
  index: number;
  from: PlanPoint;
  to: PlanPoint;
  /** Длина по замеру (замер или допущение); 0 — не замерена. */
  lengthMm: number;
  /** Курс стены, градусы. */
  angle: number;
};

export function surveyWalk(walls: SurveyWall[]): PlacedWall[] {
  const placed: PlacedWall[] = [];
  let cursor: PlanPoint = { x: 0, y: 0 };
  let heading = 0; // 0° — вправо

  walls.forEach((wall, index) => {
    const lengthMm = valueOf(wall.lengthMm) ?? 0;
    const rad = (heading * Math.PI) / 180;
    const to = {
      x: cursor.x + Math.cos(rad) * lengthMm,
      y: cursor.y + Math.sin(rad) * lengthMm,
    };

    placed.push({ wall, index, from: cursor, to, lengthMm, angle: heading });

    cursor = to;
    heading += wall.turn === 'left' ? -wall.turnDeg : wall.turnDeg;
  });

  return placed;
}

/**
 * С КАКОЙ СТОРОНЫ СТЕНЫ КОМНАТА.
 *
 * Обход «направо» (по часовой на экране, ось Y вниз) держит комнату справа
 * от направления стены; обход «налево» — слева. Решает сумма поворотов: у
 * замкнутого контура она ±360°, у незамкнутого — знак преобладающего
 * поворота. Ряд мебели на плане рисуется полосой внутрь комнаты, и сторона
 * обязана быть одной на все стены.
 *
 * Возвращает множитель нормали: `+1` — комната по нормали (−dy, dx),
 * `−1` — по противоположной.
 */
export function interiorSide(walls: SurveyWall[]): 1 | -1 {
  const total = walls.reduce((sum, wall) => sum + (wall.turn === 'left' ? -wall.turnDeg : wall.turnDeg), 0);
  return total < 0 ? -1 : 1;
}

/** Точка на стене в `atMm` от её начала. */
export function pointOnWall(placed: PlacedWall, atMm: number): PlanPoint {
  if (placed.lengthMm <= 0) return placed.from;
  const t = atMm / placed.lengthMm;
  return {
    x: placed.from.x + (placed.to.x - placed.from.x) * t,
    y: placed.from.y + (placed.to.y - placed.from.y) * t,
  };
}

/**
 * НА СКОЛЬКО НЕ СХОДИТСЯ КОНТУР КОМНАТЫ.
 *
 * Обход, повернувший в сумме на ±360°, — замкнутая комната: конец последней
 * стены обязан прийти в начало первой. Не пришёл — какая-то длина или угол
 * записаны не так. Правка одной стены прямоугольной комнаты (3600 → 3700)
 * даёт ровно такой зазор, пока противоположная стена прежняя, и план
 * рисует его разрывом в углу — без слов это читается ошибкой построения.
 *
 * Возвращает зазор в целых миллиметрах (0 — сходится). `null` — считать
 * нечего: обход не замкнут по углам (замерена часть комнаты) или в нём
 * есть стена без длины — про неё план говорит отдельно.
 */
export function contourGapMm(walls: SurveyWall[]): number | null {
  if (walls.length < 3) return null;
  const total = walls.reduce((sum, wall) => sum + (wall.turn === 'left' ? -wall.turnDeg : wall.turnDeg), 0);
  if (Math.abs(Math.abs(total) - 360) > 0.5) return null;
  const placed = surveyWalk(walls);
  if (placed.some((wall) => wall.lengthMm <= 0)) return null;
  const end = placed[placed.length - 1].to;
  return Math.round(Math.hypot(end.x, end.y));
}
