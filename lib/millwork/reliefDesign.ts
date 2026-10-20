import type { ReliefDesign, ReliefEdge, ReliefLayer, ReliefLen, ReliefPath, ReliefShape } from '@/types/millwork';

/**
 * РИСУНОК МОДЕЛИ — СЛОИ НАД ФИГУРАМИ (KIRA, VISUAL_ONLY).
 *
 * Шесть типов A–F описывают рисунок пятью числами, и модель производителя
 * в них не укладывается: у «Арки» дуга, у «Классики» скруглённые углы и
 * выпуклая филёнка, у SL-14 десять ступеней с разным шагом сверху и снизу.
 * Подменять их рамкой «ради количества» нельзя — клиент увидит не ту
 * мебель. Поэтому у модели свой рисунок: слои над фигурами, в миллиметрах.
 *
 * Это ЧАСТЬ ТОГО ЖЕ ДВИЖКА, а не второй: модуль только отвечает на
 * вопросы, которые задаёт `fieldOf` в `facadeRelief.ts`, — глубина в точке,
 * где лежат прямые изломы (точные линии сетки) и где рисунок кривой (там
 * сетка сгущается). Сетку, торцы, тыл и нормали строит прежний `reliefMesh`.
 *
 * Координаты — мм от центра фасада, X вправо, Y вверх; глубина — мм от лица
 * вниз. Отступы и точки в данных — от краёв фасада (слева/справа/сверху/
 * снизу; точка — от левого и верхнего края). Чистый модуль: ни three, ни DOM.
 */

type Box = [number, number, number, number];

/** Где поле кривое и как мелко там резать сетку. */
export type CurvedZone = {
  box: Box;
  /** Шаг сетки в зоне, мм. */
  h: number;
  /** Меняется ли поле этого слоя в круге (центр, радиус) — иначе резать незачем. */
  hits: (x: number, y: number, radius: number) => boolean;
  /**
   * Точные линии ТОЛЬКО ВНУТРИ фигуры: рифление в фигуре, а не во всё лицо.
   * Общая линия сетки прошла бы сквозь весь фасад и перемножилась с линиями
   * соседней зоны — рейки вдоль и поперёк на одном фасаде давали полмиллиона
   * треугольников. Режут только ячейку, целиком лежащую в фигуре
   * (`inside` — круг ячейки внутри); у края фигуры работает обычный шаг.
   */
  lines?: { xs: number[]; ys: number[]; inside: (x: number, y: number, radius: number) => boolean };
};

export type CompiledDesign = {
  /** Точные линии сетки: изломы прямых участков, мм. */
  xs: number[];
  ys: number[];
  zones: CurvedZone[];
  /** Глубина в точке без скругления кромки фасада, мм. */
  depthAt: (x: number, y: number) => number;
  /** Сверху оценка самой большой глубины рисунка, мм (окна витрины не в счёт). */
  maxDepth: number;
  /** Габариты сквозных окон витрины — по ним ставится стекло. */
  cuts: Box[];
};

const EPS = 1e-9;

/** Длина по размеру фасада: мм или доля плюс мм. */
export function lenOf(value: ReliefLen, dim: number): number {
  if (typeof value === 'number') return value;
  return value.f * dim + (value.mm ?? 0);
}

/* ─────────────────────────  профили  ───────────────────────── */

/** Переход ступени: доля пути по высоте от доли пути по ширине, 0…1 → 0…1. */
function edgeCurve(edge: ReliefEdge): (t: number) => number {
  switch (edge) {
    case 'bevel':
    case 'step':
      return (t) => t;
    case 'cove':
      /* круто у внешнего края, полого внутри — четверть круга */
      return (t) => Math.sqrt(Math.max(0, t * (2 - t)));
    case 'ovolo':
      /* полого у внешнего края, круто внутри */
      return (t) => 1 - Math.sqrt(Math.max(0, 1 - t * t));
    case 'ogee':
      return (t) => (1 - Math.cos(Math.PI * t)) / 2;
  }
}

/** Изломы перехода по доле ширины: где сетке нужны узлы. */
function edgeKinks(edge: ReliefEdge, w: number): number[] {
  if (edge === 'bevel' || edge === 'step') return [0, 1];
  /* Узкому переходу хватает трёх отрезков: шесть дают линии сетки гуще пикселя. */
  const steps = w < 12 ? 3 : 6;
  return Array.from({ length: steps + 1 }, (_, k) => {
    const psi = ((Math.PI / 2) * k) / steps;
    /* узлы гуще там, где профиль круче */
    return edge === 'cove' ? 1 - Math.cos(psi) : edge === 'ovolo' ? Math.sin(psi) : k / steps;
  });
}

type Section = { at: (dist: number) => number; kinks: number[] };

/** Сечение канавки по расстоянию от оси: глубина ≥ 0. */
function grooveSection(profile: 'v' | 'round' | 'flat' | 'reed', w: number, depth: number): Section {
  const half = w / 2;
  if (profile === 'v' || (profile === 'flat' && 2 * depth >= w)) {
    return { kinks: [0, half], at: (d) => (d >= half ? 0 : depth * (1 - d / half)) };
  }
  if (profile === 'flat') {
    /* плоское дно, стенки под 45° */
    const flat = half - depth;
    return { kinks: [0, flat, half], at: (d) => (d >= half ? 0 : d <= flat ? depth : depth - (d - flat)) };
  }
  if (profile === 'reed') {
    /* Выпуклая рейка: у стыка (ось канавки) — глубина, к макушке рейки — полого. */
    const steps = w < 10 ? 3 : 6;
    const kinks = Array.from({ length: steps + 1 }, (_, k) => half * (1 - Math.cos(((Math.PI / 2) * k) / steps)));
    return { kinks, at: (d) => (d >= half ? 0 : depth * (1 - Math.sqrt(Math.max(0, 1 - (1 - d / half) * (1 - d / half))))) };
  }
  /* дуга окружности по ширине и глубине — как желобок рифления */
  const radius = (half * half + depth * depth) / (2 * depth);
  const steps = w < 10 ? 3 : 6;
  const limit = Math.asin(Math.min(1, half / radius));
  const kinks = Array.from({ length: steps + 1 }, (_, k) => radius * Math.sin((limit * k) / steps));
  return {
    kinks,
    at: (d) => (d >= half ? 0 : Math.max(0, Math.sqrt(Math.max(0, radius * radius - d * d)) - (radius - depth))),
  };
}

/**
 * Сечение валика: полуэллипс высотой `height` на ширине `w`; плоский —
 * брусок с макушкой `topWidth` (пусто — бока 45°).
 */
function beadSection(w: number, height: number, profile: 'round' | 'flat' = 'round', topWidth?: number): Section {
  const half = w / 2;
  if (profile === 'flat') {
    const top = topWidth !== undefined ? Math.max(0, Math.min(half, topWidth / 2)) : Math.max(0, half - height);
    const run = Math.max(1e-6, half - top);
    return { kinks: [0, top, half], at: (d) => (d >= half ? 0 : d <= top ? height : height * (1 - (d - top) / run)) };
  }
  const steps = w < 10 ? 3 : 6;
  const kinks = Array.from({ length: steps + 1 }, (_, k) => half * Math.sin(((Math.PI / 2) * k) / steps));
  return { kinks, at: (d) => (d >= half ? 0 : height * Math.sqrt(Math.max(0, 1 - (d / half) * (d / half)))) };
}

/* ─────────────────────────  фигуры  ───────────────────────── */

type Leaf = { W: number; H: number };

type CompiledShape = {
  /** Расстояние со знаком: + внутри, мм. */
  sdf: (x: number, y: number) => number;
  /** Габарит фигуры. */
  box: Box;
  /**
   * Прямые участки контура — по осям: линия на смещении `o` внутрь от
   * каждой стороны прямоугольника. `null` — у фигуры осевых сторон нет.
   */
  sides: { x0: number; x1: number; y0: number; y1: number } | null;
  /** Где контур не по осям (углы, дуга, наклон): зоны без отступа полосы. */
  curved: Box[];
  /** Почему фигура не встаёт на этот фасад; `null` — встаёт. */
  refusal: string | null;
};

const mm = (value: number) => `${Math.round(value * 10) / 10} мм`;

/** Скос/закругление/вырез угла и арка — Евклид; прямые стороны — «на ус» (Чебышёв), как у рамки типа B. */
function compileShape(shape: ReliefShape, leaf: Leaf, label: string): CompiledShape {
  const { W, H } = leaf;
  if ('rect' in shape) {
    const [l, r, t, b] = shape.rect;
    const x0 = -W / 2 + lenOf(l, W);
    const x1 = W / 2 - lenOf(r, W);
    const y1 = H / 2 - lenOf(t, H);
    const y0 = -H / 2 + lenOf(b, H);
    const width = x1 - x0;
    const height = y1 - y0;
    if (width < 10 || height < 10) {
      return { sdf: () => -1, box: [x0, y0, x1, y1], sides: null, curved: [], refusal: `${label}: остаётся ${mm(width)} × ${mm(height)}` };
    }
    const miter = (x: number, y: number) => Math.min(x - x0, x1 - x, y - y0, y1 - y);
    const corner = shape.corner;
    const rr = Math.max(0, Math.min(shape.r ?? 0, width / 2, height / 2));
    const curved: Box[] = [];
    let base = miter;
    if (corner && rr > 0) {
      curved.push([x0, y0, x0 + rr, y0 + rr], [x1 - rr, y0, x1, y0 + rr], [x0, y1 - rr, x0 + rr, y1], [x1 - rr, y1 - rr, x1, y1]);
      const corners: [number, number][] = [
        [x0, y0],
        [x1, y0],
        [x0, y1],
        [x1, y1],
      ];
      if (corner === 'round') {
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const hx = width / 2 - rr;
        const hy = height / 2 - rr;
        base = (x, y) => {
          const qx = Math.abs(x - cx) - hx;
          const qy = Math.abs(y - cy) - hy;
          const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
          return -outside;
        };
      } else if (corner === 'inner') {
        base = (x, y) => {
          let s = miter(x, y);
          for (const [px, py] of corners) s = Math.min(s, Math.hypot(x - px, y - py) - rr);
          return s;
        };
      } else {
        const k = Math.SQRT1_2;
        base = (x, y) =>
          Math.min(
            miter(x, y),
            (x - x0 + (y - y0) - rr) * k,
            (x1 - x + (y - y0) - rr) * k,
            (x - x0 + (y1 - y) - rr) * k,
            (x1 - x + (y1 - y) - rr) * k,
          );
      }
    }
    let sdf = base;
    if (shape.arch !== undefined) {
      const side = shape.archSide ?? 'top';
      const notch = Math.max(0, shape.notch ?? 0);
      const shoulder = Math.max(notch, shape.shoulder ?? 0);
      const a = width / 2 - shoulder;
      const cx = (x0 + x1) / 2;
      const topRise = side === 'bottom' ? 0 : lenOf(shape.arch, H);
      const bottomRise = side === 'top' ? 0 : lenOf(shape.archBottom ?? shape.arch, H);
      for (const rise of [topRise, bottomRise]) {
        if (rise === 0) continue;
        if (a < 5 || Math.abs(rise) < 0.5 || Math.abs(rise) > a) {
          return {
            sdf: () => -1,
            box: [x0, y0, x1, y1],
            sides: null,
            curved: [],
            refusal: `${label}: дуге с подъёмом ${mm(rise)} на пролёте ${mm(2 * a)} не встать`,
          };
        }
      }
      if (Math.abs(topRise) + Math.abs(bottomRise) > height - 10) {
        return { sdf: () => -1, box: [x0, y0, x1, y1], sides: null, curved: [], refusal: `${label}: дуга выше самой фигуры` };
      }
      /*
       * Арка вверх: вершина на отступе сверху, пята ниже на подъём. Фигура —
       * прямоугольник ∩ (полуплоскость ниже пяты ∪ круг через пяты и
       * вершину). Арка внутрь (подъём < 0): прямоугольник до пяты минус круг.
       */
      const archTerm = (rise: number, top: number, flip: number) => {
        /* top — сторона прямоугольника, flip = +1 для верха, −1 для низа (зеркально) */
        const h = Math.abs(rise);
        const R = (a * a + h * h) / (2 * h);
        if (rise > 0) {
          const ys = top - flip * h;
          const yc = top - flip * R;
          return (x: number, y: number) => Math.max(flip * (ys - y), R - Math.hypot(x - cx, y - yc));
        }
        const ys = top;
        const yc = top - flip * h + flip * R;
        return (x: number, y: number) => Math.min(flip * (ys - y), Math.hypot(x - cx, y - yc) - R);
      };
      const terms: ((x: number, y: number) => number)[] = [];
      /* Вырез на пятах: круг с центром в углу на уровне пяты — сторона уходит в него внутрь. */
      const notchTerm = (ys: number) => (x: number, y: number) =>
        Math.min(Math.hypot(x - x0, y - ys) - notch, Math.hypot(x - x1, y - ys) - notch);
      if (topRise !== 0) {
        terms.push(archTerm(topRise, y1, 1));
        curved.push([cx - a, y1 - Math.abs(topRise) - 1, cx + a, y1 + 1]);
        if (notch > 0) {
          const ys = y1 - Math.max(0, topRise);
          terms.push(notchTerm(ys));
          curved.push([x0, ys - notch, x0 + notch, ys + notch], [x1 - notch, ys - notch, x1, ys + notch]);
        }
      }
      if (bottomRise !== 0) {
        terms.push(archTerm(bottomRise, y0, -1));
        curved.push([cx - a, y0 - 1, cx + a, y0 + Math.abs(bottomRise) + 1]);
        if (notch > 0) {
          const ys = y0 + Math.max(0, bottomRise);
          terms.push(notchTerm(ys));
          curved.push([x0, ys - notch, x0 + notch, ys + notch], [x1 - notch, ys - notch, x1, ys + notch]);
        }
      }
      sdf = (x, y) => {
        let s = base(x, y);
        for (const term of terms) s = Math.min(s, term(x, y));
        return s;
      };
    }
    return {
      sdf,
      box: [x0, y0, x1, y1],
      sides: { x0, x1, y0, y1 },
      curved,
      refusal: null,
    };
  }

  if ('ellipse' in shape) {
    const [cxL, cyT, rxL, ryL] = shape.ellipse;
    const cx = -W / 2 + lenOf(cxL, W);
    const cy = H / 2 - lenOf(cyT, H);
    const rx = lenOf(rxL, W);
    const ry = lenOf(ryL, H);
    if (rx < 5 || ry < 5) {
      return { sdf: () => -1, box: [cx, cy, cx, cy], sides: null, curved: [], refusal: `${label}: эллипс ${mm(2 * rx)} × ${mm(2 * ry)}` };
    }
    const box: Box = [cx - rx, cy - ry, cx + rx, cy + ry];
    const sdf =
      Math.abs(rx - ry) < EPS
        ? (x: number, y: number) => rx - Math.hypot(x - cx, y - cy)
        : (x: number, y: number) => {
            const qx = (x - cx) / rx;
            const qy = (y - cy) / ry;
            const q = Math.hypot(qx, qy);
            if (q < 1e-9) return Math.min(rx, ry);
            const gx = qx / rx / q;
            const gy = qy / ry / q;
            return (1 - q) / Math.hypot(gx, gy);
          };
    return { sdf, box, sides: null, curved: [box], refusal: null };
  }

  const points = shape.poly.map(([px, py]): [number, number] => [-W / 2 + lenOf(px, W), H / 2 - lenOf(py, H)]);
  if (points.length < 3) return { sdf: () => -1, box: [0, 0, 0, 0], sides: null, curved: [], refusal: `${label}: меньше трёх точек` };
  const xsP = points.map((p) => p[0]);
  const ysP = points.map((p) => p[1]);
  const box: Box = [Math.min(...xsP), Math.min(...ysP), Math.max(...xsP), Math.max(...ysP)];
  /* Точное расстояние до многоугольника со знаком (+ внутри). */
  const sdf = (x: number, y: number) => {
    let d = Infinity;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const [ax, ay] = points[i];
      const [bx, by] = points[j];
      const ex = bx - ax;
      const ey = by - ay;
      const wx = x - ax;
      const wy = y - ay;
      const k = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
      d = Math.min(d, Math.hypot(wx - ex * k, wy - ey * k));
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    }
    return inside ? d : -d;
  };
  return { sdf, box, sides: null, curved: [box], refusal: null };
}

/* ─────────────────────────  пути  ───────────────────────── */

type CompiledPath = {
  /** Расстояние от оси пути, мм (≥ 0). */
  dist: (x: number, y: number) => number;
  /** Осевые прямые участки: линии сетки поперёк и вдоль. */
  lines: (offsets: number[], xs: number[], ys: number[]) => void;
  curved: Box[];
  box: Box;
  refusal: string | null;
};

function compilePath(path: ReliefPath, leaf: Leaf, label: string): CompiledPath {
  const { W, H } = leaf;
  if ('outline' in path) {
    const shape = compileShape(path.outline, leaf, label);
    return {
      dist: (x, y) => Math.abs(shape.sdf(x, y)),
      lines: (offsets, xs, ys) => {
        if (!shape.sides) return;
        const { x0, x1, y0, y1 } = shape.sides;
        for (const o of offsets) {
          xs.push(x0 + o, x0 - o, x1 - o, x1 + o);
          ys.push(y0 + o, y0 - o, y1 - o, y1 + o);
        }
      },
      curved: shape.curved,
      box: shape.box,
      refusal: shape.refusal,
    };
  }
  if ('line' in path) {
    const [[ax, ay], [bx, by]] = path.line;
    const x0 = -W / 2 + lenOf(ax, W);
    const y0 = H / 2 - lenOf(ay, H);
    const x1 = -W / 2 + lenOf(bx, W);
    const y1 = H / 2 - lenOf(by, H);
    const ex = x1 - x0;
    const ey = y1 - y0;
    const length = Math.hypot(ex, ey);
    if (length < 5) return { dist: () => Infinity, lines: () => {}, curved: [], box: [x0, y0, x1, y1], refusal: `${label}: отрезок короче 5 мм` };
    const ux = ex / length;
    const uy = ey / length;
    const square = path.ends === 'square';
    const box: Box = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
    const dist = (x: number, y: number) => {
      const wx = x - x0;
      const wy = y - y0;
      const along = wx * ux + wy * uy;
      const across = Math.abs(wx * uy - wy * ux);
      const beyond = Math.max(0, -along, along - length);
      /* «квадратный» торец — фреза выходит вверх на длине полуширины, как у типа C */
      return square ? Math.max(across, beyond) : Math.hypot(across, beyond);
    };
    const vertical = Math.abs(ux) < 1e-9;
    const horizontal = Math.abs(uy) < 1e-9;
    const axis = square && (vertical || horizontal);
    return {
      dist,
      lines: (offsets, xs, ys) => {
        if (!axis) return;
        if (vertical) {
          for (const o of offsets) xs.push(x0 + o, x0 - o);
          for (const o of offsets) ys.push(box[1] - o, box[3] + o);
          ys.push(box[1], box[3]);
        } else {
          for (const o of offsets) ys.push(y0 + o, y0 - o);
          for (const o of offsets) xs.push(box[0] - o, box[2] + o);
          xs.push(box[0], box[2]);
        }
      },
      curved: axis ? [] : [box],
      box,
      refusal: null,
    };
  }
  const { c, r, from, to } = path.arc;
  const cx = -W / 2 + lenOf(c[0], W);
  const cy = H / 2 - lenOf(c[1], H);
  const radius = lenOf(r, Math.min(W, H));
  if (radius < 3) return { dist: () => Infinity, lines: () => {}, curved: [], box: [cx, cy, cx, cy], refusal: `${label}: дуга радиуса ${mm(radius)}` };
  /* углы в градусах, против часовой от оси X; Y — вверх */
  const a0 = (Math.min(from, to) * Math.PI) / 180;
  const a1 = (Math.max(from, to) * Math.PI) / 180;
  const ends: [number, number][] = [
    [cx + radius * Math.cos(a0), cy + radius * Math.sin(a0)],
    [cx + radius * Math.cos(a1), cy + radius * Math.sin(a1)],
  ];
  const dist = (x: number, y: number) => {
    let angle = Math.atan2(y - cy, x - cx);
    while (angle < a0) angle += 2 * Math.PI;
    while (angle > a0 + 2 * Math.PI) angle -= 2 * Math.PI;
    if (angle <= a1) return Math.abs(Math.hypot(x - cx, y - cy) - radius);
    return Math.min(Math.hypot(x - ends[0][0], y - ends[0][1]), Math.hypot(x - ends[1][0], y - ends[1][1]));
  };
  const box: Box = [cx - radius, cy - radius, cx + radius, cy + radius];
  return { dist, lines: () => {}, curved: [box], box, refusal: null };
}

/* ─────────────────────────  слои  ───────────────────────── */

const pad = (box: Box, by: number): Box => [box[0] - by, box[1] - by, box[2] + by, box[3] + by];
/** Больше стольких осевых изломов на клетку мотив режется шагом зоны, а не линиями (`dense`). */
const TILE_LINES_MAX = 48;

/** Шаг сетки у кривого излома: четверть ширины, но не мельче 0.9 мм и не крупнее 8. */
const stepOf = (w: number) => Math.min(8, Math.max(0.9, w / 4));

type Apply = (d: number, x: number, y: number) => number;

/**
 * ПРОВЕРКА ЧИСЕЛ РИСУНКА — без фасада. Отказ называет слой и число:
 * рисунок модели правит не человек, но и каталог не должен принести в
 * сцену пустую или вывернутую сетку.
 */
export function designParamRefusal(design: ReliefDesign | undefined): string | null {
  if (!design || !Array.isArray(design.layers) || design.layers.length === 0) return 'У рисунка модели нет ни одного слоя.';
  if (design.grip !== undefined && design.grip !== 'edge' && design.grip !== 'corner') return `Ручка «${String(design.grip)}» неизвестна: есть edge и corner.`;
  return layersRefusal(design.layers, 'Слой', 0);
}

function layersRefusal(layers: ReliefLayer[], prefix: string, nesting: number): string | null {
  if (layers.length > 120) return `У рисунка модели ${layers.length} слоёв — больше 120 сетка не держит.`;
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index];
    const at = `${prefix} ${index + 1}`;
    switch (layer.op) {
      case 'level':
        /* В мотиве отметка бывает и отрицательной: выпуклая площадка над дном выборки. */
        if (!finite(layer.depth) || layer.depth < (nesting > 0 ? -14 : 0) || layer.depth > 14) {
          return `${at}: глубина ${layer.depth} — бывает от ${nesting > 0 ? -14 : 0} до 14 мм.`;
        }
        if (!finite(layer.w) || layer.w < (layer.edge === 'step' ? 0.3 : 0.5) || layer.w > 200) return `${at}: ширина перехода ${layer.w} — бывает от 0.5 до 200 мм.`;
        break;
      case 'groove':
        if (!finite(layer.depth) || layer.depth < 0.2 || layer.depth > 10) return `${at}: глубина канавки ${layer.depth} — бывает от 0.2 до 10 мм.`;
        if (!finite(layer.w) || layer.w < 1 || layer.w > 80) return `${at}: ширина канавки ${layer.w} — бывает от 1 до 80 мм.`;
        if (!Array.isArray(layer.paths) || layer.paths.length === 0) return `${at}: у канавки нет пути.`;
        break;
      case 'bead':
        if (!finite(layer.height) || layer.height < 0.2 || layer.height > 10) return `${at}: высота валика ${layer.height} — бывает от 0.2 до 10 мм.`;
        if (!finite(layer.w) || layer.w < 1 || layer.w > 80) return `${at}: ширина валика ${layer.w} — бывает от 1 до 80 мм.`;
        if (!Array.isArray(layer.paths) || layer.paths.length === 0) return `${at}: у валика нет пути.`;
        break;
      case 'flutes':
        if (!finite(layer.depth) || layer.depth < 0.2 || layer.depth > 10) return `${at}: глубина желобка ${layer.depth} — бывает от 0.2 до 10 мм.`;
        if (!finite(layer.w) || layer.w < 2 || layer.w > 80) return `${at}: ширина желобка ${layer.w} — бывает от 2 до 80 мм.`;
        if (!finite(layer.pitch) || layer.pitch < layer.w) return `${at}: шаг ${layer.pitch} меньше ширины желобка ${layer.w} — желобки наехали бы друг на друга.`;
        if (layer.dir !== 'v' && layer.dir !== 'h' && !finite(layer.dir)) return `${at}: направление рифления «${String(layer.dir)}» — бывает v, h или угол в градусах.`;
        break;
      case 'cut':
        if (!layer.shape) return `${at}: у окна нет фигуры.`;
        if (layer.bars && (!finite(layer.bars.w) || layer.bars.w < 6 || layer.bars.w > 80)) {
          return `${at}: шпрос ${layer.bars.w} мм — бывает от 6 до 80 мм.`;
        }
        break;
      case 'cells':
        if (!finite(layer.size) || layer.size < 10 || layer.size > 300) return `${at}: ячейка ${layer.size} — бывает от 10 до 300 мм.`;
        if (!finite(layer.jitter) || layer.jitter < 0 || layer.jitter > 1) return `${at}: неровность ${layer.jitter} — бывает от 0 до 1.`;
        if (!finite(layer.seed)) return `${at}: у ячеек нет числа-зерна.`;
        if (!finite(layer.depth) || layer.depth < 0.2 || layer.depth > 10) return `${at}: глубина ${layer.depth} — бывает от 0.2 до 10 мм.`;
        if (!finite(layer.w) || layer.w < 2 || layer.w > 80) return `${at}: ширина канавки ${layer.w} — бывает от 2 до 80 мм.`;
        break;
      case 'tiles': {
        if (nesting > 0) return `${at}: мотив внутри мотива не строится.`;
        const [cw, ch] = Array.isArray(layer.cell) ? layer.cell : [NaN, NaN];
        if (!finite(cw) || !finite(ch) || cw < 6 || ch < 6 || cw > 400 || ch > 400) return `${at}: клетка мотива ${cw}×${ch} — бывает от 6 до 400 мм.`;
        if (layer.stagger !== undefined && (!finite(layer.stagger) || Math.abs(layer.stagger) > 1)) return `${at}: сдвиг рядов ${layer.stagger} — бывает от −1 до 1 клетки.`;
        if (!Array.isArray(layer.layers) || layer.layers.length === 0) return `${at}: у мотива нет слоёв.`;
        if (layer.layers.some((inner) => inner.op === 'cut' || inner.op === 'tiles')) return `${at}: в мотиве не бывает окна и вложенного мотива.`;
        const inner = layersRefusal(layer.layers, `${at}, мотив`, nesting + 1);
        if (inner) return inner;
        break;
      }
      default:
        return `${at}: операция «${(layer as { op: string }).op}» неизвестна.`;
    }
  }
  return null;
}

/**
 * ВЕРХНЯЯ ОЦЕНКА ГЛУБИНЫ БЕЗ ФАСАДА: ступень — не глубже своей отметки,
 * канавка, рифление и мотив — вглубь от текущей поверхности, валик не
 * углубляет. Окно витрины сквозное по определению и в оценку не входит:
 * под ним плиты нет, там стекло. По оценке проверяется, что под рисунком
 * остаётся плита.
 */
export function designDepthBound(design: ReliefDesign): number {
  return layersDepthBound(design.layers);
}

function layersDepthBound(layers: ReliefLayer[]): number {
  let bound = 0;
  for (const layer of layers) {
    if (layer.op === 'level') bound = Math.max(bound, layer.depth);
    else if (layer.op === 'groove' || layer.op === 'flutes' || layer.op === 'cells') bound += layer.depth;
    else if (layer.op === 'tiles') bound += layersDepthBound(layer.layers);
  }
  return bound;
}

/** Есть ли у рисунка сквозное окно — рама витрины под стекло. */
export function designHasCut(design: ReliefDesign | undefined): boolean {
  return Boolean(design?.layers.some((layer) => layer.op === 'cut'));
}

/**
 * РИСУНОК НА ЭТОТ ФАСАД: поле глубины, точные линии и кривые зоны.
 * Не встаёт — отказ словами, и фасад остаётся гладким (как у типов A–F).
 */
export function compileDesign(design: ReliefDesign, leaf: { widthMm: number; heightMm: number }): CompiledDesign | { refusal: string } {
  const own = designParamRefusal(design);
  if (own) return { refusal: own };
  return compileLayers(design.layers, { W: leaf.widthMm, H: leaf.heightMm }, 'слой');
}

/**
 * ГЛУБИНА ОКНА ВИТРИНЫ — «насквозь»: сетка обрезает её толщиной фасада,
 * а точки, где лицо легло на тыл, в сетку не идут вовсе — там стекло.
 */
export const CUT_DEPTH = 1000;

function compileLayers(layers: ReliefLayer[], geo: Leaf, prefix: string): CompiledDesign | { refusal: string } {
  const xs: number[] = [];
  const ys: number[] = [];
  const zones: CurvedZone[] = [];
  const steps: Apply[] = [];
  const cuts: Box[] = [];
  let maxDepth = 0;

  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index];
    const label = `${prefix} ${index + 1}`;
    if (layer.op === 'cut') {
      const shape = compileShape(layer.shape, geo, label);
      if (shape.refusal) return { refusal: `Рисунок не встаёт: ${shape.refusal}.` };
      /* Шпросы: бруски по путям, окно вокруг них — окно минус брусок (пересечение с «вне бруска»). */
      const bars = (layer.bars?.paths ?? []).map((p, k) => compilePath(p, geo, `${label}, шпрос ${k + 1}`));
      const badBar = bars.find((p) => p.refusal);
      if (badBar) return { refusal: `Рисунок не встаёт: ${badBar.refusal}.` };
      const barHalf = (layer.bars?.w ?? 0) / 2;
      const sdf =
        bars.length === 0
          ? shape.sdf
          : (x: number, y: number) => {
              let s = shape.sdf(x, y);
              for (const bar of bars) s = Math.min(s, bar.dist(x, y) - barHalf);
              return s;
            };
      /* Стенка окна — почти отвесная: полмиллиметра на всю толщину. */
      const w = 0.5;
      if (shape.sides) {
        const { x0, x1, y0, y1 } = shape.sides;
        xs.push(x0, x0 + w, x1 - w, x1);
        ys.push(y0, y0 + w, y1 - w, y1);
      }
      for (const bar of bars) bar.lines([-barHalf, -barHalf - w, barHalf, barHalf + w], xs, ys);
      for (const box of [...shape.curved, ...bars.flatMap((bar) => bar.curved)]) {
        zones.push({
          box: pad(box, barHalf + 2),
          h: 1,
          hits: (x, y, radius) => {
            const s = sdf(x, y);
            return s > -radius && s < w + radius;
          },
        });
      }
      steps.push((d, x, y) => {
        const s = sdf(x, y);
        if (s <= 0) return d;
        if (s >= w) return CUT_DEPTH;
        return d + (CUT_DEPTH - d) * (s / w);
      });
      cuts.push(shape.box);
      continue;
    }

    if (layer.op === 'tiles') {
      const area = compileShape(layer.area, geo, label);
      if (area.refusal) return { refusal: `Рисунок не встаёт: ${area.refusal}.` };
      const [cw, ch] = layer.cell;
      const motif = compileLayers(layer.layers, { W: cw, H: ch }, `${label}, мотив`);
      if ('refusal' in motif) return motif;
      const stagger = layer.stagger ?? 0;
      const [bx0, by0, bx1, by1] = area.box;
      const ox = (bx0 + bx1) / 2;
      const oy = (by0 + by1) / 2;
      /* Точка фасада → клетка и точка в клетке (от её середины). */
      const local = (x: number, y: number): [number, number] => {
        const yy = y - oy;
        const row = Math.floor(yy / ch + 0.5);
        const xx = x - ox - row * stagger * cw;
        const col = Math.floor(xx / cw + 0.5);
        return [xx - col * cw, yy - row * ch];
      };
      /* Осевые изломы мотива — линии в каждой клетке, в пределах площади. */
      const rowsCount = Math.ceil((by1 - by0) / ch) + 2;
      const colsCount = Math.ceil((bx1 - bx0) / cw) + 2;
      /*
       * ГУСТОЙ МОТИВ — десятки прямых изломов на клетку (квадраты «ОВ 81»):
       * линии всех клеток перемножились бы в сетку на сотни тысяч ячеек.
       * Его изломы режет шаг зоны, как у наклонных: стенка кармана выходит
       * шириной в шаг, а не точной — для рисунка VISUAL_ONLY это допустимо.
       */
      const dense = motif.xs.length > TILE_LINES_MAX || motif.ys.length > TILE_LINES_MAX;
      if (stagger === 0 && !dense) {
        for (let c = -colsCount; c <= colsCount; c += 1) {
          for (const v of motif.xs) {
            const x = ox + c * cw + v;
            if (x >= bx0 - 1 && x <= bx1 + 1) xs.push(x);
          }
        }
      }
      for (let r = -rowsCount; r <= rowsCount && !dense; r += 1) {
        for (const v of motif.ys) {
          const y = oy + r * ch + v;
          if (y >= by0 - 1 && y <= by1 + 1) ys.push(y);
        }
      }
      if (area.sides) {
        const { x0, x1, y0, y1 } = area.sides;
        xs.push(x0, x1);
        ys.push(y0, y1);
      }
      const motifStep = motif.zones.reduce((h, z) => Math.min(h, z.h), stagger === 0 && !dense ? Infinity : 2);
      if (Number.isFinite(motifStep)) {
        /* Мотив покрывает всю площадь: шаг крупнее, иначе сетка орнамента — сотни тысяч треугольников. */
        const h = Math.max(2.5, motifStep);
        zones.push({
          box: pad(area.box, h),
          h,
          hits: (x, y, radius) => {
            if (area.sdf(x, y) <= -radius) return false;
            if (stagger !== 0 || dense) return true;
            const [lx, ly] = local(x, y);
            return motif.zones.some(
              (z) => lx >= z.box[0] - radius && lx <= z.box[2] + radius && ly >= z.box[1] - radius && ly <= z.box[3] + radius && z.hits(lx, ly, radius),
            );
          },
        });
      }
      if (area.curved.length > 0) {
        zones.push({ box: pad(area.box, 2), h: 1.5, hits: (x, y, radius) => Math.abs(area.sdf(x, y)) < radius + 1 });
      }
      steps.push((d, x, y) => {
        if (area.sdf(x, y) <= 0) return d;
        const [lx, ly] = local(x, y);
        /* Мотив может и поднимать (выпуклые квадраты на дне выборки) — но не выше лица. */
        return Math.max(0, d + motif.depthAt(lx, ly));
      });
      maxDepth += motif.maxDepth;
      continue;
    }

    if (layer.op === 'cells') {
      const area = compileShape(layer.area, geo, label);
      if (area.refusal) return { refusal: `Рисунок не встаёт: ${area.refusal}.` };
      const section = grooveSection(layer.profile, layer.w, layer.depth);
      const half = layer.w / 2;
      const size = layer.size;
      const jitter = Math.max(0, Math.min(1, layer.jitter));
      const [ax0, ay0] = area.box;
      /* Точка ячейки (i, j): сетка с детерминированным сдвигом — тот же seed, тот же рисунок. */
      const noise = (i: number, j: number, k: number) => {
        let v = Math.imul(i * 374761393 + j * 668265263 + k * 2147483647 + layer.seed * 1274126177, 1) | 0;
        v = Math.imul(v ^ (v >>> 13), 1274126177);
        v ^= v >>> 16;
        return ((v >>> 0) % 100000) / 100000;
      };
      const site = (i: number, j: number): [number, number] => [
        ax0 + (i + 0.5 + jitter * (noise(i, j, 1) - 0.5)) * size,
        ay0 + (j + 0.5 + jitter * (noise(i, j, 2) - 0.5)) * size,
      ];
      /* Расстояние до ближайшей границы ячеек: до серединного перпендикуляра двух ближайших точек. */
      const border = (x: number, y: number) => {
        const ci = Math.floor((x - ax0) / size);
        const cj = Math.floor((y - ay0) / size);
        let d1 = Infinity;
        let p1: [number, number] = [0, 0];
        let d2 = Infinity;
        let p2: [number, number] = [0, 0];
        for (let i = ci - 2; i <= ci + 2; i += 1) {
          for (let j = cj - 2; j <= cj + 2; j += 1) {
            const p = site(i, j);
            const d = (x - p[0]) * (x - p[0]) + (y - p[1]) * (y - p[1]);
            if (d < d1) {
              d2 = d1;
              p2 = p1;
              d1 = d;
              p1 = p;
            } else if (d < d2) {
              d2 = d;
              p2 = p;
            }
          }
        }
        const gap = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
        return (d2 - d1) / (2 * gap);
      };
      const h = Math.max(2.5, layer.w / 3);
      zones.push({
        box: pad(area.box, layer.w + h),
        h,
        hits: (x, y, radius) => {
          const s = area.sdf(x, y);
          if (s <= -radius) return false;
          return s < half + radius || border(x, y) < half + radius;
        },
      });
      steps.push((d, x, y) => {
        const s = area.sdf(x, y);
        if (s <= 0) return d;
        if (layer.invert) {
          /* Ячейки утоплены, по границам — рёбра: у границы глубина ноль, в глубине ячейки — `depth`. */
          const dist = Math.min(border(x, y), Math.max(0, s));
          return d + layer.depth - (dist >= half ? 0 : section.at(dist));
        }
        const dist = Math.max(border(x, y), half - s);
        return dist >= half ? d : d + section.at(dist);
      });
      maxDepth += layer.depth;
      continue;
    }

    if (layer.op === 'level') {
      const shape = compileShape(layer.shape, geo, label);
      if (shape.refusal) return { refusal: `Рисунок не встаёт: ${shape.refusal}.` };
      const curve = edgeCurve(layer.edge);
      const w = layer.edge === 'step' ? Math.min(layer.w, 0.6) : layer.w;
      const target = layer.depth;
      if (shape.sides) {
        const { x0, x1, y0, y1 } = shape.sides;
        for (const k of edgeKinks(layer.edge, w)) {
          const o = k * w;
          xs.push(x0 + o, x1 - o);
          ys.push(y0 + o, y1 - o);
        }
      }
      const h = stepOf(w);
      for (const box of shape.curved) {
        zones.push({
          box: pad(box, w + h),
          h,
          hits: (x, y, radius) => {
            const s = shape.sdf(x, y);
            return s > -radius && s < w + radius;
          },
        });
      }
      steps.push((d, x, y) => {
        const s = shape.sdf(x, y);
        if (s <= 0) return d;
        if (s >= w) return target;
        return d + (target - d) * curve(s / w);
      });
      maxDepth = Math.max(maxDepth, target);
      continue;
    }

    if (layer.op === 'groove' || layer.op === 'bead') {
      const section =
        layer.op === 'groove'
          ? grooveSection(layer.profile, layer.w, layer.depth)
          : beadSection(layer.w, layer.height, layer.profile, layer.top);
      const paths = layer.paths.map((p, k) => compilePath(p, geo, `${label}, путь ${k + 1}`));
      const bad = paths.find((p) => p.refusal);
      if (bad) return { refusal: `Рисунок не встаёт: ${bad.refusal}.` };
      const offsets = section.kinks.flatMap((k) => (k === 0 ? [0] : [k, -k]));
      for (const p of paths) p.lines(offsets, xs, ys);
      const half = layer.w / 2;
      /* Узкой канавке по кривой хватает шага 1.6 мм: мельче — десятки тысяч треугольников на линию. */
      const h = Math.max(1.6, stepOf(layer.w));
      for (const p of paths) {
        for (const box of p.curved) {
          zones.push({ box: pad(box, half + h), h, hits: (x, y, radius) => p.dist(x, y) < half + radius });
        }
      }
      if (layer.op === 'groove') {
        steps.push((d, x, y) => {
          let g = 0;
          for (const p of paths) {
            const dist = p.dist(x, y);
            if (dist < half) g = Math.max(g, section.at(dist));
          }
          return d + g;
        });
        maxDepth += layer.depth;
      } else {
        steps.push((d, x, y) => {
          let b = 0;
          for (const p of paths) {
            const dist = p.dist(x, y);
            if (dist < half) b = Math.max(b, section.at(dist));
          }
          return Math.max(0, d - b);
        });
      }
      continue;
    }

    /* flutes */
    const area = compileShape(layer.area, geo, label);
    if (area.refusal) return { refusal: `Рисунок не встаёт: ${area.refusal}.` };
    const section = grooveSection(layer.profile, layer.w, layer.depth);
    const half = layer.w / 2;
    const axis = layer.dir === 'v' || layer.dir === 'h';
    /*
     * Желобки идут вдоль направления d; поперёк — ось n, по ней шаг. У
     * вертикальных n = X, у горизонтальных n = Y, у наклонных — повёрнутая.
     */
    const angle = layer.dir === 'v' ? 90 : layer.dir === 'h' ? 0 : layer.dir;
    const rad = (angle * Math.PI) / 180;
    const nx = layer.dir === 'v' ? 1 : layer.dir === 'h' ? 0 : -Math.sin(rad);
    const ny = layer.dir === 'v' ? 0 : layer.dir === 'h' ? 1 : Math.cos(rad);
    const [bx0, by0, bx1, by1] = area.box;
    /* Семейство желобков поперёк оси (ax, ay): центры с шагом по проекции габарита. */
    const family = (ax: number, ay: number) => {
      const projections = [bx0 * ax + by0 * ay, bx1 * ax + by0 * ay, bx0 * ax + by1 * ay, bx1 * ax + by1 * ay];
      const lo = Math.min(...projections);
      const hi = Math.max(...projections);
      const count = Math.floor((hi - lo - layer.w) / layer.pitch + 1e-6) + 1;
      const first = (lo + hi) / 2 - ((count - 1) * layer.pitch) / 2;
      const centers = Array.from({ length: Math.max(0, count) }, (_, k) => first + k * layer.pitch);
      const nearest = (u: number) => {
        const k = Math.round((u - first) / layer.pitch);
        return Math.abs(u - centers[Math.max(0, Math.min(count - 1, k))]);
      };
      return { count, centers, nearest };
    };
    const main = family(nx, ny);
    if (main.count < 2) return { refusal: `Рисунок не встаёт: ${label} — двух желобков с шагом ${mm(layer.pitch)} не помещается.` };
    /* Поперечное семейство (решётка): ось — вдоль первого. На пересечении — одна канавка, а не две. */
    const second = layer.cross ? family(ny, -nx) : null;
    const nearestBoth = (x: number, y: number) =>
      second ? Math.min(main.nearest(x * nx + y * ny), second.nearest(x * ny - y * nx)) : main.nearest(x * nx + y * ny);
    const centers = main.centers;
    const h = stepOf(layer.w);
    if (axis) {
      const vertical = layer.dir === 'v';
      const offsets = section.kinks.flatMap((k) => (k === 0 ? [0] : [k, -k]));
      if (!area.sides && !second) {
        /* Рифление в фигуре (не в прямоугольнике): линии желобков — только внутри неё. */
        const local = centers.flatMap((c) => offsets.map((o) => c + o)).sort((a, b) => a - b);
        zones.push({
          box: area.box,
          h: Infinity,
          hits: () => false,
          lines: { xs: vertical ? local : [], ys: vertical ? [] : local, inside: (x, y, radius) => area.sdf(x, y) >= radius },
        });
      } else {
        for (const c of centers) for (const o of offsets) (vertical ? xs : ys).push(c + o);
      }
      /* Поперечное семейство осевой решётки: у вертикальных — горизонтальные. Ось его (ny, −nx) = (0, −1) или (1, 0). */
      if (second) {
        for (const c of second.centers) for (const o of offsets) (vertical ? ys : xs).push(vertical ? -(c + o) : c + o);
      }
      if (area.sides && !second) {
        /* скос на концах желобков — линии вдоль, на полуширине от стороны */
        const ends = section.kinks.map((k) => half - k);
        const { x0, x1, y0, y1 } = area.sides;
        for (const e of ends) {
          if (vertical) ys.push(y0 + e, y1 - e);
          else xs.push(x0 + e, x1 - e);
        }
      }
      for (const box of area.curved) {
        zones.push({
          box: pad(box, layer.w + h),
          h,
          hits: (x, y, radius) => {
            const s = area.sdf(x, y);
            return s > -radius && s < half + radius;
          },
        });
      }
    } else {
      /* Наклонные желобки сеткой не уложить: режем мельче вдоль самих желобков и у края фигуры. */
      zones.push({
        box: pad(area.box, layer.w + h),
        h,
        hits: (x, y, radius) => {
          const s = area.sdf(x, y);
          if (s <= -radius) return false;
          return s < half + radius || nearestBoth(x, y) < half + radius;
        },
      });
    }
    steps.push((d, x, y) => {
      const s = area.sdf(x, y);
      if (s <= 0) return d;
      const dist = Math.max(nearestBoth(x, y), half - s);
      return dist >= half ? d : d + section.at(dist);
    });
    maxDepth += layer.depth;
  }

  return {
    xs,
    ys,
    zones,
    maxDepth,
    cuts,
    depthAt: (x, y) => {
      let d = 0;
      for (const step of steps) d = step(d, x, y);
      return d;
    },
  };
}

/** Устойчивый ключ рисунка: FNV-1a по JSON с упорядоченными ключами. */
export function designHash(design: ReliefDesign | undefined): string {
  const text = JSON.stringify(design ?? null, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, (value as Record<string, unknown>)[k]]))
      : value,
  );
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
