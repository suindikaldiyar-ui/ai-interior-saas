import type { FrontRelief, ReliefKind } from '@/types/millwork';

/**
 * РЕЛЬЕФ МДФ-ФАСАДА — ОБЪЁМ, А НЕ КАРТИНКА (P3D-MDF).
 *
 * Фрезеровка до этого слоя была картой нормалей на плоской коробке: свет
 * обманывался, а силуэт, кромка и тень в канавке оставались плоскими — на
 * крупном плане «рифлёный» фасад читался нарисованным, а открытая створка
 * показывала ровный торец. Здесь рельеф — ГЕОМЕТРИЯ: поле высот лица фасада
 * на прямоугольной сетке, у которой узлы стоят ровно на изломах профиля
 * (край канавки, дно, начало скругления), а диагональ каждой ячейки
 * выбирается по данным — так угол рамки «на ус» и торец остановленной
 * канавки ложатся точно, без зубцов. Нормали гладкие внутри дуги и острые
 * на изломе (угол больше `CREASE_DEG`): кромка фрезеровки чёткая.
 *
 * ГАБАРИТ НЕ МЕНЯЕТСЯ: сетка строится внутри W × H × T фасада — того же
 * прямоугольника, что режет раскрой. Рельеф снимает материал с лица, тыл
 * плоский и лежит там же, где тыл коробки; соседей, корпус и щели он не
 * двигает.
 *
 * ВСЕ ПАРАМЕТРЫ — VISUAL_ONLY. Чертежа фрезы и подтверждённых цехом
 * размеров нет: умолчания ниже — то, что выглядит правдоподобно на
 * встрече, а не то, что фрезеруют. ЧПУ по ним не выпускается, в раскрой и
 * смету они не идут. Чистый модуль: ни three, ни DOM — его меряет приёмка.
 */

export const RELIEF_STATUS = 'VISUAL_ONLY' as const;

/** Параметры рисунка, которые правит человек. */
export type ReliefParam = 'insetMm' | 'count' | 'pitchMm' | 'widthMm' | 'depthMm' | 'zoneMm';

export type ReliefKindDef = {
  kind: ReliefKind;
  letter: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  title: string;
  /** Что это за рисунок — словами мебельщика. */
  hint: string;
  /** Какие параметры у рисунка есть и их умолчания (VISUAL_ONLY). */
  params: Partial<Record<ReliefParam, number>>;
  /** Подписи параметров у ЭТОГО рисунка: у рамки ширина — профиля, у канавок — канавки. */
  labels: Partial<Record<ReliefParam, string>>;
};

export const RELIEF_KINDS: ReliefKindDef[] = [
  {
    kind: 'slab',
    letter: 'A',
    title: 'Гладкий',
    hint: 'Ровное лицо, кромка скруглена.',
    params: {},
    labels: {},
  },
  {
    kind: 'frame',
    letter: 'B',
    title: 'Рамочный',
    hint: 'Поле утоплено, по контуру — профиль: рамка из одной плиты.',
    params: { insetMm: 70, widthMm: 16, depthMm: 5 },
    labels: { insetMm: 'Ширина рамки', widthMm: 'Ширина профиля', depthMm: 'Глубина поля' },
  },
  {
    kind: 'vgrooves',
    letter: 'C',
    title: 'Вертикальная фрезеровка',
    hint: 'Канавки сверху вниз с шагом.',
    params: { insetMm: 0, count: 0, pitchMm: 100, widthMm: 8, depthMm: 3 },
    labels: { insetMm: 'Отступ сверху и снизу', count: 'Число линий (0 — по шагу)', pitchMm: 'Шаг', widthMm: 'Ширина канавки', depthMm: 'Глубина' },
  },
  {
    kind: 'hgrooves',
    letter: 'D',
    title: 'Горизонтальная фрезеровка',
    hint: 'Канавки поперёк с шагом.',
    params: { insetMm: 0, count: 0, pitchMm: 100, widthMm: 8, depthMm: 3 },
    labels: { insetMm: 'Отступ слева и справа', count: 'Число линий (0 — по шагу)', pitchMm: 'Шаг', widthMm: 'Ширина канавки', depthMm: 'Глубина' },
  },
  {
    kind: 'fluted',
    letter: 'E',
    title: 'Рифлёный',
    hint: 'Частые полукруглые желобки во всю высоту.',
    params: { insetMm: 0, pitchMm: 26, widthMm: 22, depthMm: 3.5, zoneMm: 0 },
    labels: { insetMm: 'Поле слева и справа', pitchMm: 'Шаг', widthMm: 'Ширина желобка', depthMm: 'Глубина', zoneMm: 'Пояс снизу (0 — во всю высоту)' },
  },
  {
    kind: 'grooves',
    letter: 'F',
    title: 'Декоративные канавки',
    hint: 'Контуры канавок по периметру.',
    params: { insetMm: 60, count: 2, pitchMm: 22, widthMm: 6, depthMm: 2.5 },
    labels: { insetMm: 'Отступ от края', count: 'Число контуров', pitchMm: 'Шаг', widthMm: 'Ширина канавки', depthMm: 'Глубина' },
  },
];

export function reliefKindDef(kind: ReliefKind): ReliefKindDef {
  const def = RELIEF_KINDS.find((item) => item.kind === kind);
  if (!def) throw new Error(`Тип рельефа «${kind}» неизвестен: есть ${RELIEF_KINDS.map((item) => item.kind).join(', ')}`);
  return def;
}

/**
 * РАДИУС КРОМКИ — визуальный, 1.5 мм. Кромку крашеного МДФ скругляют, и
 * блик по ней — то, что отличает фасад от крашеной коробки. Подтверждённого
 * цехом радиуса нет: число VISUAL_ONLY, как и остальные.
 */
export const RELIEF_EDGE_MM = 1.5;

/** Излом круче этого угла — острая кромка; положе — гладкая дуга. */
const CREASE_DEG = 30;

/** Рельеф с умолчаниями типа — то, по чему строится сетка. */
export type ResolvedRelief = {
  kind: ReliefKind;
  insetMm: number;
  count: number;
  pitchMm: number;
  widthMm: number;
  depthMm: number;
  zoneMm: number;
  model?: string;
};

export function resolveRelief(relief: FrontRelief): ResolvedRelief {
  const def = reliefKindDef(relief.kind);
  const pick = (key: ReliefParam) => {
    const own = relief[key];
    return typeof own === 'number' && Number.isFinite(own) ? own : (def.params[key] ?? 0);
  };
  return {
    kind: relief.kind,
    insetMm: pick('insetMm'),
    count: Math.round(pick('count')),
    pitchMm: pick('pitchMm'),
    widthMm: pick('widthMm'),
    depthMm: pick('depthMm'),
    zoneMm: pick('zoneMm'),
    ...(relief.model ? { model: relief.model } : {}),
  };
}

/**
 * КЛЮЧ РЕЛЬЕФА — для ключа материала и кэша геометрии. Только параметры
 * этого типа: у гладкого «шаг» не существует, и в ключ он не идёт.
 */
export function reliefKey(relief: FrontRelief): string {
  const r = resolveRelief(relief);
  const def = reliefKindDef(r.kind);
  const parts = (Object.keys(def.params) as ReliefParam[]).map((key) => `${r[key]}`);
  return [r.kind, ...parts].join(':');
}

/* ─────────────────────────  проверка размеров  ───────────────────────── */

/** Пределы VISUAL_ONLY: за ними рисунок не правдоподобен ни на каком фасаде. */
export const RELIEF_LIMITS: Record<ReliefParam, { min: number; max: number }> = {
  insetMm: { min: 0, max: 400 },
  count: { min: 0, max: 40 },
  pitchMm: { min: 4, max: 600 },
  widthMm: { min: 2, max: 80 },
  depthMm: { min: 0.5, max: 8 },
  zoneMm: { min: 0, max: 2400 },
};

/** Поле лица, которое остаётся между краем фасада и крайней канавкой. */
const LAND_MM = 15;
/** Меньше этого поля в середине рамки или контура — рисунка нет. */
const FIELD_MM = 30;

const mm = (value: number) => `${Math.round(value * 10) / 10} мм`;

/**
 * ПАРАМЕТРЫ САМИ ПО СЕБЕ — без фасада: шаг меньше канавки, глубина больше
 * толщины. Отказ называет число и причину.
 */
export function reliefParamRefusal(relief: FrontRelief, thicknessMm: number): string | null {
  const r = resolveRelief(relief);
  const def = reliefKindDef(r.kind);
  for (const key of Object.keys(def.params) as ReliefParam[]) {
    const value = r[key];
    const { min, max } = RELIEF_LIMITS[key];
    if (!Number.isFinite(value) || value < min || value > max) {
      return `${def.labels[key] ?? key}: ${value} — бывает от ${min} до ${max}${key === 'count' ? '' : ' мм'}.`;
    }
  }
  if ('depthMm' in def.params && r.depthMm > thicknessMm - 6) {
    return `Глубина ${mm(r.depthMm)} при толщине фасада ${mm(thicknessMm)}: под фрезеровкой осталось бы меньше 6 мм плиты.`;
  }
  if ((r.kind === 'vgrooves' || r.kind === 'hgrooves') && r.pitchMm < r.widthMm + 2) {
    return `Шаг ${mm(r.pitchMm)} меньше ширины канавки ${mm(r.widthMm)} с перемычкой 2 мм: канавки слились бы.`;
  }
  if (r.kind === 'fluted' && r.pitchMm < r.widthMm) {
    return `Шаг ${mm(r.pitchMm)} меньше ширины желобка ${mm(r.widthMm)}: желобки наехали бы друг на друга.`;
  }
  if (r.kind === 'grooves' && r.count >= 2 && r.pitchMm < r.widthMm + 2) {
    return `Шаг контуров ${mm(r.pitchMm)} меньше ширины канавки ${mm(r.widthMm)} с перемычкой 2 мм.`;
  }
  if (r.kind === 'grooves' && r.count < 1) return 'Контуров должно быть хотя бы один.';
  if (r.kind === 'frame' && r.insetMm < 10) return `Рамка ${mm(r.insetMm)} — уже 10 мм рамки не бывает.`;
  return null;
}

export type ReliefLeaf = { widthMm: number; heightMm: number; thicknessMm: number };

/** Где встают линии вдоль одной оси: центры, по шагу, по центру фасада. */
function lineCenters(spanMm: number, r: ResolvedRelief): number[] {
  const room = spanMm - 2 * LAND_MM - r.widthMm;
  if (room < 0) return [];
  const most = Math.floor(room / r.pitchMm) + 1;
  const count = r.count > 0 ? r.count : most;
  if (count > most || count < 1) return [];
  const first = -((count - 1) * r.pitchMm) / 2;
  return Array.from({ length: count }, (_, i) => first + i * r.pitchMm);
}

/** Центры желобков рифления: по шагу, по центру поля без отступов. */
function fluteCenters(spanMm: number, r: ResolvedRelief): number[] {
  const room = spanMm - 2 * r.insetMm;
  const count = Math.floor((room + 1e-6) / r.pitchMm);
  if (count < 1) return [];
  const first = -((count - 1) * r.pitchMm) / 2;
  return Array.from({ length: count }, (_, i) => first + i * r.pitchMm);
}

/**
 * ПОМЕЩАЕТСЯ ЛИ РИСУНОК НА ЭТОТ ФАСАД. Ящик 140 мм рамку в 70 не вместит:
 * такой фасад остаётся гладким, и это называется словами, а не ужимается
 * молча до неузнаваемости.
 */
export function reliefLeafRefusal(relief: FrontRelief, leaf: ReliefLeaf): string | null {
  const own = reliefParamRefusal(relief, leaf.thicknessMm);
  if (own) return own;
  const r = resolveRelief(relief);
  const size = `${Math.round(leaf.widthMm)}×${Math.round(leaf.heightMm)}`;
  const short = Math.min(leaf.widthMm, leaf.heightMm);
  switch (r.kind) {
    case 'slab':
      return short < 4 * RELIEF_EDGE_MM ? `Фасад ${size}: меньше скругления кромки.` : null;
    case 'frame': {
      const need = 2 * (r.insetMm + r.widthMm) + FIELD_MM;
      return short < need ? `Фасад ${size}: рамке ${mm(r.insetMm)} с профилем ${mm(r.widthMm)} нужно ${mm(need)} по меньшей стороне.` : null;
    }
    case 'vgrooves':
    case 'hgrooves': {
      const across = r.kind === 'vgrooves' ? leaf.widthMm : leaf.heightMm;
      const along = r.kind === 'vgrooves' ? leaf.heightMm : leaf.widthMm;
      if (lineCenters(across, r).length === 0) {
        return r.count > 0
          ? `Фасад ${size}: ${r.count} линий с шагом ${mm(r.pitchMm)} не помещаются.`
          : `Фасад ${size}: ни одной канавки с шагом ${mm(r.pitchMm)} не помещается.`;
      }
      return along - 2 * r.insetMm < FIELD_MM ? `Фасад ${size}: отступы ${mm(r.insetMm)} съедают всю длину линии.` : null;
    }
    case 'fluted':
      if (fluteCenters(leaf.widthMm, r).length < 2) return `Фасад ${size}: двух желобков с шагом ${mm(r.pitchMm)} не помещается.`;
      return r.zoneMm > 0 && leaf.heightMm - r.zoneMm < FIELD_MM
        ? `Фасад ${size}: пояс рифления ${mm(r.zoneMm)} выше самого фасада.`
        : null;
    case 'grooves': {
      const need = 2 * (r.insetMm + (r.count - 1) * r.pitchMm + r.widthMm) + FIELD_MM;
      return short < need ? `Фасад ${size}: ${r.count} контуров от ${mm(r.insetMm)} нужно ${mm(need)} по меньшей стороне.` : null;
    }
  }
}

/* ─────────────────────────  поле высот  ───────────────────────── */

/**
 * Профиль рельефа: «на сколько снято» по расстоянию, и точки излома.
 * Глубина — миллиметры от лица фасада вниз.
 */
type Profile = { at: (s: number) => number; breaks: number[] };

/** Скругление кромки: четверть окружности, расстояние — от края фасада. */
function edgeProfile(radius: number): Profile {
  const steps = 4;
  const breaks: number[] = [];
  for (let k = 0; k <= steps; k += 1) breaks.push(radius * (1 - Math.cos(((Math.PI / 2) * k) / steps)));
  return {
    breaks,
    at: (e) => {
      if (e >= radius) return 0;
      const c = Math.max(0, e);
      return radius - Math.sqrt(Math.max(0, radius * radius - (radius - c) * (radius - c)));
    },
  };
}

/** Кусочно-линейное по точкам — сетка всё равно линейна между изломами. */
function polyline(points: [number, number][]): (s: number) => number {
  return (s) => {
    if (s <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i += 1) {
      const [x1, y1] = points[i];
      if (s <= x1) {
        const [x0, y0] = points[i - 1];
        return x1 === x0 ? y1 : y0 + ((y1 - y0) * (s - x0)) / (x1 - x0);
      }
    }
    return points[points.length - 1][1];
  };
}

/**
 * Галтель рамки: стенка у рамки отвесная, к полю — плавно. Расстояние —
 * от начала профиля (край рамки) к середине фасада.
 */
function coveProfile(width: number, depth: number): Profile {
  const steps = 6;
  const points: [number, number][] = [];
  for (let k = 0; k <= steps; k += 1) {
    const psi = ((Math.PI / 2) * k) / steps;
    points.push([width * (1 - Math.cos(psi)), depth * Math.sin(psi)]);
  }
  const at = polyline(points);
  return { breaks: points.map(([s]) => s), at: (s) => (s <= 0 ? 0 : s >= width ? depth : at(s)) };
}

/** V-канавка: расстояние — от оси канавки. */
function vProfile(width: number, depth: number): Profile {
  const half = width / 2;
  return { breaks: [-half, 0, half], at: (s) => Math.max(0, depth * (1 - Math.abs(s) / half)) };
}

/** Желобок рифления: дуга окружности по ширине и глубине. */
function fluteProfile(width: number, depth: number): Profile {
  const half = width / 2;
  const radius = (half * half + depth * depth) / (2 * depth);
  const steps = 6;
  const points: [number, number][] = [];
  const limit = Math.asin(Math.min(1, half / radius));
  for (let k = -steps; k <= steps; k += 1) {
    const beta = (limit * k) / steps;
    points.push([radius * Math.sin(beta), Math.max(0, radius * Math.cos(beta) - (radius - depth))]);
  }
  points[0][1] = 0;
  points[points.length - 1][1] = 0;
  const at = polyline(points);
  return { breaks: points.map(([s]) => s), at: (s) => (Math.abs(s) >= half ? 0 : at(s)) };
}

type Field = {
  /** Узлы сетки по X и по Y, мм, от центра фасада. */
  xs: number[];
  ys: number[];
  /** Глубина снятого материала в точке, мм. */
  depthAt: (x: number, y: number) => number;
};

const EPS = 1e-6;

function uniqueSorted(values: number[], from: number, to: number): number[] {
  const inside = values.filter((v) => v >= from - EPS && v <= to + EPS).map((v) => Math.min(to, Math.max(from, v)));
  inside.push(from, to);
  inside.sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of inside) if (out.length === 0 || v - out[out.length - 1] > 1e-4) out.push(v);
  return out;
}

/** Поле высот фасада: что и где снято, и узлы, на которых лежат изломы. */
function fieldOf(r: ResolvedRelief, leaf: ReliefLeaf, plain: boolean): Field {
  const W = leaf.widthMm;
  const H = leaf.heightMm;
  const x0 = -W / 2;
  const x1 = W / 2;
  const y0 = -H / 2;
  const y1 = H / 2;
  const edge = edgeProfile(Math.min(RELIEF_EDGE_MM, Math.min(W, H) / 4));
  /* Расстояние до края фасада «по квадрату»: на углах — шов на ус. */
  const fromEdge = (x: number, y: number) => Math.min(x - x0, x1 - x, y - y0, y1 - y);
  const xs: number[] = [];
  const ys: number[] = [];
  const byEdge = (offsets: number[]) => {
    for (const e of offsets) {
      xs.push(x0 + e, x1 - e);
      ys.push(y0 + e, y1 - e);
    }
  };
  byEdge(edge.breaks);
  let feature: (x: number, y: number) => number = () => 0;

  if (!plain) {
    switch (r.kind) {
      case 'slab':
        break;
      case 'frame': {
        const cove = coveProfile(r.widthMm, r.depthMm);
        byEdge(cove.breaks.map((s) => r.insetMm + s));
        feature = (x, y) => cove.at(fromEdge(x, y) - r.insetMm);
        break;
      }
      case 'grooves': {
        const groove = vProfile(r.widthMm, r.depthMm);
        const centers = Array.from({ length: r.count }, (_, k) => r.insetMm + r.widthMm / 2 + k * r.pitchMm);
        byEdge(centers.flatMap((c) => groove.breaks.map((s) => c + s)));
        feature = (x, y) => {
          const e = fromEdge(x, y);
          let d = 0;
          for (const c of centers) d = Math.max(d, groove.at(e - c));
          return d;
        };
        break;
      }
      case 'vgrooves':
      case 'hgrooves': {
        const vertical = r.kind === 'vgrooves';
        const groove = vProfile(r.widthMm, r.depthMm);
        const centers = lineCenters(vertical ? W : H, r);
        const half = r.widthMm / 2;
        /* Остановленная канавка кончается пирамидкой: фреза уходит вверх на длине полуширины. */
        const lo = (vertical ? y0 : x0) + r.insetMm;
        const hi = (vertical ? y1 : x1) - r.insetMm;
        const across = vertical ? xs : ys;
        const along = vertical ? ys : xs;
        for (const c of centers) for (const s of groove.breaks) across.push(c + s);
        if (r.insetMm > 0) along.push(lo - half, lo, hi, hi + half);
        feature = (x, y) => {
          const u = vertical ? x : y;
          const v = vertical ? y : x;
          const beyond = r.insetMm > 0 ? Math.max(0, lo - v, v - hi) : 0;
          let d = 0;
          for (const c of centers) d = Math.max(d, groove.at(Math.max(Math.abs(u - c), beyond)));
          return d;
        };
        break;
      }
      case 'fluted': {
        const flute = fluteProfile(r.widthMm, r.depthMm);
        const centers = fluteCenters(W, r);
        const half = r.widthMm / 2;
        for (const c of centers) for (const s of flute.breaks) xs.push(c + s);
        /*
         * Пояс снизу: желобки кончаются на его верхней кромке «на ус» —
         * фреза выходит вверх на длине полуширины, как у остановленной канавки.
         */
        const top = r.zoneMm > 0 ? y0 + r.zoneMm : Infinity;
        if (r.zoneMm > 0) for (const s of flute.breaks) if (s >= 0) ys.push(top + s);
        if (r.zoneMm > 0) ys.push(top);
        feature = (x, y) => {
          const beyond = Math.max(0, y - top);
          if (beyond >= half) return 0;
          let d = 0;
          for (const c of centers) {
            const u = Math.max(Math.abs(x - c), beyond);
            if (u < half) d = Math.max(d, flute.at(u));
          }
          return d;
        };
        break;
      }
    }
  }

  return {
    xs: uniqueSorted(xs, x0, x1),
    ys: uniqueSorted(ys, y0, y1),
    depthAt: (x, y) => Math.max(edge.at(fromEdge(x, y)), feature(x, y)),
  };
}

/* ─────────────────────────  сетка  ───────────────────────── */

export type ReliefMesh = {
  /** Метры, от центра фасада: X вправо, Y вверх, Z на зрителя. */
  positions: Float32Array;
  normals: Float32Array;
  /** Развёртка лица в метрах (X, Y): та же, что считает шейдер «настоящего размера». */
  uvs: Float32Array;
  triangles: number;
  /** Чем стал фасад: рисунок типа или гладкий, потому что рисунок не встал. */
  drawn: ReliefKind;
  /** Почему рисунок не встал на этот фасад — словами; `null` — встал. */
  refusal: string | null;
};

/**
 * СЕТКА ФАСАДА: лицо полем высот, четыре торца и тыл.
 *
 * Центр — середина фасада, лицо смотрит в +Z: z = +T/2 у нетронутого лица,
 * тыл z = −T/2. Положи её на место коробки фасада (тот же центр, масштаб 1) —
 * и габарит совпадёт с раскроем до миллиметра.
 *
 * Не помещается рисунок на этот фасад (`reliefLeafRefusal`) — фасад
 * строится гладким, причина лежит в `refusal`.
 */
export function reliefMesh(relief: FrontRelief, leaf: ReliefLeaf): ReliefMesh {
  const r = resolveRelief(relief);
  const refusal = reliefLeafRefusal(relief, leaf);
  const plain = refusal !== null;
  const field = fieldOf(r, leaf, plain);
  const { xs, ys } = field;
  const T = leaf.thicknessMm;
  const top = T / 2;
  const nx = xs.length;
  const ny = ys.length;

  /* Высоты узлов лица. */
  const z = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) z[j * nx + i] = top - field.depthAt(xs[i], ys[j]);
  }
  const node = (i: number, j: number): [number, number, number] => [xs[i], ys[j], z[j * nx + i]];

  /* ── лицо: треугольники ячеек, диагональ — по данным ── */
  type Tri = { p: [number, number, number][]; nodes: number[] };
  const face: Tri[] = [];
  for (let j = 0; j + 1 < ny; j += 1) {
    for (let i = 0; i + 1 < nx; i += 1) {
      const a = j * nx + i;
      const b = j * nx + i + 1;
      const c = (j + 1) * nx + i + 1;
      const d = (j + 1) * nx + i;
      const mid = top - field.depthAt((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2);
      const viaAC = Math.abs((z[a] + z[c]) / 2 - mid);
      const viaBD = Math.abs((z[b] + z[d]) / 2 - mid);
      const pa = node(i, j);
      const pb = node(i + 1, j);
      const pc = node(i + 1, j + 1);
      const pd = node(i, j + 1);
      if (viaAC <= viaBD) {
        face.push({ p: [pa, pb, pc], nodes: [a, b, c] }, { p: [pa, pc, pd], nodes: [a, c, d] });
      } else {
        face.push({ p: [pa, pb, pd], nodes: [a, b, d] }, { p: [pb, pc, pd], nodes: [b, c, d] });
      }
    }
  }

  /* Нормаль треугольника лица и её площадь (вес). */
  const faceNormal = (t: Tri): [number, number, number] => {
    const [p, q, s] = t.p;
    const ux = q[0] - p[0];
    const uy = q[1] - p[1];
    const uz = q[2] - p[2];
    const vx = s[0] - p[0];
    const vy = s[1] - p[1];
    const vz = s[2] - p[2];
    return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  };
  const unit = (v: [number, number, number]): [number, number, number] => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const raw = face.map(faceNormal);
  const dirs = raw.map(unit);
  /* Какие треугольники сходятся в узле — для гладких нормалей внутри дуги. */
  const incident: number[][] = Array.from({ length: nx * ny }, () => []);
  face.forEach((t, k) => t.nodes.forEach((n) => incident[n].push(k)));
  const crease = Math.cos((CREASE_DEG * Math.PI) / 180);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const push = (p: [number, number, number], n: [number, number, number]) => {
    positions.push(p[0] / 1000, p[1] / 1000, p[2] / 1000);
    normals.push(n[0], n[1], n[2]);
    uvs.push(p[0] / 1000, p[1] / 1000);
  };

  face.forEach((t, k) => {
    t.nodes.forEach((n, corner) => {
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (const other of incident[n]) {
        const o = dirs[other];
        const own = dirs[k];
        if (o[0] * own[0] + o[1] * own[1] + o[2] * own[2] < crease) continue;
        const w = raw[other];
        sx += w[0];
        sy += w[1];
        sz += w[2];
      }
      push(t.p[corner], unit([sx, sy, sz]));
    });
  });

  /* ── торцы: от кромки лица до тыла, по узлам лица — без Т-стыков ── */
  const back = -T / 2;
  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    n: [number, number, number],
  ) => {
    push(a, n);
    push(b, n);
    push(c, n);
    push(a, n);
    push(c, n);
    push(d, n);
  };
  for (let i = 0; i + 1 < nx; i += 1) {
    /* низ: смотрит в −Y */
    const l = node(i, 0);
    const rr = node(i + 1, 0);
    quad([l[0], l[1], back], [rr[0], rr[1], back], rr, l, [0, -1, 0]);
    /* верх: смотрит в +Y */
    const tl = node(i, ny - 1);
    const tr = node(i + 1, ny - 1);
    quad([tr[0], tr[1], back], [tl[0], tl[1], back], tl, tr, [0, 1, 0]);
  }
  for (let j = 0; j + 1 < ny; j += 1) {
    /* левый: смотрит в −X */
    const lb = node(0, j);
    const lt = node(0, j + 1);
    quad([lt[0], lt[1], back], [lb[0], lb[1], back], lb, lt, [-1, 0, 0]);
    /* правый: смотрит в +X */
    const rb = node(nx - 1, j);
    const rt = node(nx - 1, j + 1);
    quad([rb[0], rb[1], back], [rt[0], rt[1], back], rt, rb, [1, 0, 0]);
  }

  /* ── тыл: веер из центра по всем узлам контура — тоже без Т-стыков ── */
  const ring: [number, number][] = [];
  for (let i = 0; i < nx; i += 1) ring.push([xs[i], ys[0]]);
  for (let j = 1; j < ny; j += 1) ring.push([xs[nx - 1], ys[j]]);
  for (let i = nx - 2; i >= 0; i -= 1) ring.push([xs[i], ys[ny - 1]]);
  for (let j = ny - 2; j >= 1; j -= 1) ring.push([xs[0], ys[j]]);
  const center: [number, number, number] = [0, 0, back];
  for (let k = 0; k < ring.length; k += 1) {
    const [ax, ay] = ring[k];
    const [bx, by] = ring[(k + 1) % ring.length];
    /* Контур обходится против часовой при взгляде с +Z; тыл смотрит в −Z — обход обратный. */
    push(center, [0, 0, -1]);
    push([bx, by, back], [0, 0, -1]);
    push([ax, ay, back], [0, 0, -1]);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    triangles: positions.length / 9,
    drawn: plain ? 'slab' : r.kind,
    refusal,
  };
}

/** Ключ сетки фасада: рисунок и габарит с точностью до десятой миллиметра. */
export function reliefMeshKey(relief: FrontRelief, leaf: ReliefLeaf): string {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return `${reliefKey(relief)}|${r1(leaf.widthMm)}x${r1(leaf.heightMm)}x${r1(leaf.thicknessMm)}`;
}

/* ─────────────────────────  поле глубины и затенение  ───────────────────────── */

/**
 * ГЛУБИНА РЕЛЬЕФА В ТОЧКЕ ФАСАДА, мм — та же функция, по которой строится
 * сетка. Координаты — мм от центра фасада, Y вверх. Рисунок не встал на
 * этот фасад — поле гладкого (только кромка), как у сетки.
 */
export function reliefDepthAt(relief: FrontRelief, leaf: ReliefLeaf): (xMm: number, yMm: number) => number {
  const plain = reliefLeafRefusal(relief, leaf) !== null;
  return fieldOf(resolveRelief(relief), leaf, plain).depthAt;
}

/** Свет карточки — сверху слева, как у рисунков фрезеровки (`RELIEF_LIGHT`). */
const SHADE_LIGHT = (() => {
  const v = [-0.45, 0.55, 0.7];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

/**
 * КАРТИНКА РИСУНКА — серым светом по полю глубины, без three и без фото.
 *
 * Ей показывают тип фасада на карточке и сверяют приближение модели с
 * референсом: картинка выводится из ТЕХ ЖЕ чисел, что сетка в сцене, —
 * второго рисунка у типа нет. Возвращает RGBA ширины × высоты; фасад
 * вписан с полем 4 %.
 */
export function reliefShade(relief: FrontRelief, leaf: ReliefLeaf, width: number, height: number, tint = '#d9d4cb'): Uint8ClampedArray {
  const depthAt = reliefDepthAt(relief, leaf);
  const out = new Uint8ClampedArray(width * height * 4);
  const scale = Math.min((width * 0.92) / leaf.widthMm, (height * 0.92) / leaf.heightMm);
  const ox = width / 2;
  const oy = height / 2;
  const step = 0.5 / scale;
  const rgb = /^#[0-9a-f]{6}$/i.test(tint) ? [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16)) : [217, 212, 203];
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const xMm = (px + 0.5 - ox) / scale;
      const yMm = -(py + 0.5 - oy) / scale;
      const k = (py * width + px) * 4;
      if (Math.abs(xMm) > leaf.widthMm / 2 || Math.abs(yMm) > leaf.heightMm / 2) {
        out[k] = 0;
        out[k + 1] = 0;
        out[k + 2] = 0;
        out[k + 3] = 0;
        continue;
      }
      /* Нормаль по разностям глубины: z = −d, наклон — против роста глубины. */
      const dx = (depthAt(xMm + step, yMm) - depthAt(xMm - step, yMm)) / (2 * step);
      const dy = (depthAt(xMm, yMm + step) - depthAt(xMm, yMm - step)) / (2 * step);
      const n = [dx, dy, 1];
      const l = Math.hypot(n[0], n[1], n[2]);
      const lambert = Math.max(0, (n[0] * SHADE_LIGHT[0] + n[1] * SHADE_LIGHT[1] + n[2] * SHADE_LIGHT[2]) / l);
      const flat = SHADE_LIGHT[2];
      const tone = Math.min(1.25, 0.25 + 0.75 * (lambert / flat));
      out[k] = rgb[0] * tone;
      out[k + 1] = rgb[1] * tone;
      out[k + 2] = rgb[2] * tone;
      out[k + 3] = 255;
    }
  }
  return out;
}
