import { interiorOf, valueOf, walkHonored, type InteriorSide, type Survey, type SurveyWall } from '@/types/survey';

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
 *
 * Поворот плана (`Survey.planRotationDeg`, замер 2.0) — это курс первой
 * стены: изображение поворачивается целиком, по часовой на экране. В
 * геометрию он не идёт — мебель, смета и 3D его не видят.
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

export function surveyWalk(walls: SurveyWall[], startHeadingDeg = 0): PlacedWall[] {
  const placed: PlacedWall[] = [];
  let cursor: PlanPoint = { x: 0, y: 0 };
  let heading = startHeadingDeg; // 0° — вправо

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
 * от направления стены; обход «налево» — слева. Решает та же `interiorOf`,
 * что разворачивает обход для мебели: выбор человека, иначе знак поворотов
 * МЕЖДУ стенами. Поворот после последней стены незамкнутого обхода не
 * считается — за ней стены нет. Раньше он входил в сумму, и Г «стена 1 →
 * налево → стена 2» с умолчанием «направо» у стены 2 давала ноль: ряд и
 * тело стены рисовались не с той стороны.
 *
 * Возвращает множитель нормали: `+1` — комната по нормали (−dy, dx),
 * `−1` — по противоположной.
 */
export function interiorSide(walls: SurveyWall[], interior?: InteriorSide): 1 | -1 {
  return interiorOf({ walls, interior }) === 'left' ? -1 : 1;
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
 * ОТКУДА НА ЭТОМ ПЛАНЕ МЕРЯЕТСЯ «ОТ ЛЕВОГО УГЛА».
 *
 * Проёмы и точки замера привязаны «от левого угла, если стоять в комнате
 * лицом к стене», и ряд мебели идёт оттуда же. Комната справа от обхода —
 * левый угол это начало стены, слева — её конец.
 *
 * Замер до 2.0 (`walkHonored` нет) меряется от начала стены, как раньше:
 * его мебель стоит по обходу «направо», и план рисует её вместе с
 * проёмами там, где их видит она. Что такая мебель стоит зеркально к
 * замеру, экран говорит словами (`legacyMirrored`), а не план молча.
 *
 * Возвращает `+1` — от начала стены, `−1` — от конца.
 */
export function leftCornerOf(survey: Pick<Survey, 'version'>, side: 1 | -1): 1 | -1 {
  return walkHonored(survey) ? side : 1;
}

/** Точка на стене в `atMm` от левого угла (`leftCornerOf`). */
export function pointFromLeft(placed: PlacedWall, atMm: number, from: 1 | -1): PlanPoint {
  return pointOnWall(placed, from === 1 ? atMm : placed.lengthMm - atMm);
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
