import type { FrontRelief, ReliefDesign, ReliefKind } from '@/types/millwork';
import { compileDesign, designDepthBound, designHasCut, designHash, designParamRefusal, type CurvedZone } from './reliefDesign';

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
  /** Буква типа на карточке; у рисунка модели буквы нет. */
  letter: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | '';
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

/**
 * РИСУНОК МОДЕЛИ КАТАЛОГА — не седьмой тип на карточке, а рисунок
 * конкретной модели (KIRA): слои над фигурами (`reliefDesign.ts`). Своих
 * параметров у него нет — правят его не числами типа, а выбором модели.
 */
export const DESIGN_KIND_DEF: ReliefKindDef = {
  kind: 'design',
  letter: '',
  title: 'Рисунок модели',
  hint: 'Рисунок модели каталога по фото производителя — приближение VISUAL_ONLY.',
  params: {},
  labels: {},
};

export function reliefKindDef(kind: ReliefKind): ReliefKindDef {
  if (kind === 'design') return DESIGN_KIND_DEF;
  const def = RELIEF_KINDS.find((item) => item.kind === kind);
  if (!def) throw new Error(`Тип рельефа «${kind}» неизвестен: есть ${RELIEF_KINDS.map((item) => item.kind).join(', ')}, design`);
  return def;
}

/** Рельеф, который движок умеет строить: тип A–F или рисунок модели со слоями. */
export function isKnownRelief(relief: FrontRelief | undefined | null): relief is FrontRelief {
  if (!relief || typeof relief !== 'object') return false;
  if (relief.kind === 'design') return designParamRefusal(relief.design) === null;
  return RELIEF_KINDS.some((def) => def.kind === relief.kind);
}

/**
 * РАДИУС КРОМКИ — визуальный, 1.5 мм. Кромку крашеного МДФ скругляют, и
 * блик по ней — то, что отличает фасад от крашеной коробки. Подтверждённого
 * цехом радиуса нет: число VISUAL_ONLY, как и остальные.
 */
export const RELIEF_EDGE_MM = 1.5;

/** Излом круче этого угла — острая кромка; положе — гладкая дуга. */
const CREASE_DEG = 30;

/**
 * Сколько ячеек лица бывает у одного фасада, не больше: ~60–90 тыс.
 * треугольников. Больше — сцена на планшете начинает отставать, а сборка
 * сетки идёт секундами. Рисунок, который просит больше, строится крупнее.
 */
export const RELIEF_CELL_BUDGET = 30000;

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
  /** Слои рисунка модели (`kind: 'design'`). */
  design?: ReliefDesign;
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
    ...(relief.kind === 'design' && relief.design ? { design: relief.design } : {}),
  };
}

/**
 * КЛЮЧ РЕЛЬЕФА — для ключа материала и кэша геометрии. Только параметры
 * этого типа: у гладкого «шаг» не существует, и в ключ он не идёт. У
 * рисунка модели — модель и отпечаток слоёв: уточнённое приближение той же
 * модели — уже другая сетка.
 */
export function reliefKey(relief: FrontRelief): string {
  if (relief.kind === 'design') return `design:${relief.model ?? ''}:${designHash(relief.design)}`;
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
  if (relief.kind === 'design') {
    const own = designParamRefusal(relief.design);
    if (own) return own;
    const bound = designDepthBound(relief.design!);
    return bound > thicknessMm - 6
      ? `Рисунок модели уходит на ${mm(bound)} при толщине фасада ${mm(thicknessMm)}: под фрезеровкой осталось бы меньше 6 мм плиты.`
      : null;
  }
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
    case 'design': {
      const compiled = compileDesign(r.design!, leaf);
      return 'refusal' in compiled ? `Фасад ${size}: ${compiled.refusal}` : null;
    }
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
  /**
   * Где рисунок кривой (дуга, скруглённый угол, наклон): там ячейку сетки
   * режут мельче. У типов A–F зон нет — все изломы лежат на линиях сетки.
   */
  zones: CurvedZone[];
  /** Габарит окон витрины (мм от центра фасада) — там стекло; `null` — окон нет. */
  glass: [number, number, number, number] | null;
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

/**
 * РАЗВОРОТ РИСУНКА НА СТВОРКЕ — только у рисунка с фрезерованной ручкой
 * (`design.grip`): ручка там, где открывают. Остальные рисунки
 * симметричны, и разворачивать их незачем — была бы лишняя сетка в кэше.
 */
export type ReliefOrient = { flipX?: boolean; flipY?: boolean };

/** Поле высот фасада: что и где снято, и узлы, на которых лежат изломы. */
function fieldOf(r: ResolvedRelief, leaf: ReliefLeaf, plain: boolean, orient?: ReliefOrient): Field {
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
  let zones: CurvedZone[] = [];
  let glass: [number, number, number, number] | null = null;

  if (!plain) {
    switch (r.kind) {
      case 'slab':
        break;
      case 'design': {
        const compiled = compileDesign(r.design!, leaf);
        if ('refusal' in compiled) break;
        /* Ручка у открываемой стороны: рисунок отражается по оси, поле и линии — вместе. */
        const sx = orient?.flipX && r.design?.grip ? -1 : 1;
        const sy = orient?.flipY && r.design?.grip ? -1 : 1;
        xs.push(...compiled.xs.map((v) => sx * v));
        ys.push(...compiled.ys.map((v) => sy * v));
        zones = compiled.zones.map((zone) => ({
          h: zone.h,
          box: [
            Math.min(sx * zone.box[0], sx * zone.box[2]),
            Math.min(sy * zone.box[1], sy * zone.box[3]),
            Math.max(sx * zone.box[0], sx * zone.box[2]),
            Math.max(sy * zone.box[1], sy * zone.box[3]),
          ],
          hits: (x: number, y: number, radius: number) => zone.hits(sx * x, sy * y, radius),
          ...(zone.lines
            ? {
                lines: {
                  xs: sx === 1 ? zone.lines.xs : zone.lines.xs.map((v) => -v).reverse(),
                  ys: sy === 1 ? zone.lines.ys : zone.lines.ys.map((v) => -v).reverse(),
                  inside: (x: number, y: number, radius: number) => zone.lines!.inside(sx * x, sy * y, radius),
                },
              }
            : {}),
        }));
        feature = sx === 1 && sy === 1 ? compiled.depthAt : (x, y) => compiled.depthAt(sx * x, sy * y);
        glass = compiled.cuts.length
          ? compiled.cuts.reduce<[number, number, number, number]>(
              (acc, box) => [
                Math.min(acc[0], Math.min(sx * box[0], sx * box[2])),
                Math.min(acc[1], Math.min(sy * box[1], sy * box[3])),
                Math.max(acc[2], Math.max(sx * box[0], sx * box[2])),
                Math.max(acc[3], Math.max(sy * box[1], sy * box[3])),
              ],
              [Infinity, Infinity, -Infinity, -Infinity],
            )
          : null;
        break;
      }
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
    zones,
    glass,
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
  /**
   * Стекло рамы витрины: габарит окон (мм от центра фасада, X, Y). Сетка
   * в окнах пустая — плиты там нет; стекло ставит сцена по этому габариту.
   */
  glassMm: [number, number, number, number] | null;
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
 *
 * У рамы витрины лицо в окнах ложится на тыл: такие треугольники в сетку не
 * идут вовсе, а тыл повторяет лицо — окно сквозное, кромка замкнута.
 */
export function reliefMesh(relief: FrontRelief, leaf: ReliefLeaf, orient?: ReliefOrient): ReliefMesh {
  const r = resolveRelief(relief);
  const refusal = reliefLeafRefusal(relief, leaf);
  const plain = refusal !== null;
  const field = fieldOf(r, leaf, plain, orient);
  const { xs, ys } = field;
  const T = leaf.thicknessMm;
  const top = T / 2;
  /* Глубже тыла не бывает: окно витрины — это лицо, легшее на тыл. */
  const depthOf = (x: number, y: number) => Math.min(T, field.depthAt(x, y));

  /*
   * ── ячейки: сетка изломов; в кривых зонах — мельче ──
   *
   * Прямые изломы лежат на линиях сетки точно. Дугу, скруглённый угол и
   * наклонную канавку на прямоугольных линиях не уложить — там ячейка
   * делится пополам, пока не станет мельче шага зоны, и только там, где
   * поле этой зоны действительно меняется. У типов A–F зон нет: ячейки —
   * ровно ячейки сетки, сетка та же до байта.
   */
  type Cell = [number, number, number, number];
  let cells: Cell[] = [];
  /* Во сколько раз крупнее шаг зон, чем просит рисунок: растёт, если сетка не влезла в бюджет. */
  let coarse = 1;
  const stepAt = (x0: number, y0: number, x1: number, y1: number) => {
    let h = Infinity;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const radius = Math.hypot(x1 - x0, y1 - y0) / 2;
    for (const zone of field.zones) {
      if (zone.h * coarse >= h) continue;
      if (x1 < zone.box[0] || x0 > zone.box[2] || y1 < zone.box[1] || y0 > zone.box[3]) continue;
      if (zone.hits(cx, cy, radius)) h = zone.h * coarse;
    }
    return h;
  };
  /* Зоны с точными линиями внутри фигуры (`CurvedZone.lines`): режут ячейку, целиком лежащую в фигуре. */
  const lined = field.zones.filter((zone) => zone.lines && (zone.lines.xs.length > 0 || zone.lines.ys.length > 0));
  /** Значения списка строго между `from` и `to`. */
  const inside = (list: number[], from: number, to: number, out: number[]) => {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (list[m] <= from + 1e-4) lo = m + 1;
      else hi = m;
    }
    for (let k = lo; k < list.length && list[k] < to - 1e-4; k += 1) out.push(list[k]);
  };
  const linesIn = (x0: number, y0: number, x1: number, y1: number): [number[], number[]] | null => {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const radius = Math.hypot(x1 - x0, y1 - y0) / 2;
    const lx: number[] = [];
    const ly: number[] = [];
    for (const zone of lined) {
      if (x1 < zone.box[0] || x0 > zone.box[2] || y1 < zone.box[1] || y0 > zone.box[3]) continue;
      if (!zone.lines!.inside(cx, cy, radius)) continue;
      inside(zone.lines!.xs, x0, x1, lx);
      inside(zone.lines!.ys, y0, y1, ly);
    }
    if (lx.length === 0 && ly.length === 0) return null;
    return [uniqueSorted(lx, x0, x1), uniqueSorted(ly, y0, y1)];
  };
  const split = (x0: number, y0: number, x1: number, y1: number, level: number): void => {
    const local = lined.length === 0 || level > 24 ? null : linesIn(x0, y0, x1, y1);
    if (local) {
      const [gx, gy] = local;
      for (let j = 0; j + 1 < gy.length; j += 1) {
        for (let i = 0; i + 1 < gx.length; i += 1) split(gx[i], gy[j], gx[i + 1], gy[j + 1], level + 1);
      }
      return;
    }
    const h = field.zones.length === 0 ? Infinity : stepAt(x0, y0, x1, y1);
    const wide = x1 - x0 > h;
    const tall = y1 - y0 > h;
    if (level > 24 || (!wide && !tall)) {
      cells.push([x0, y0, x1, y1]);
      return;
    }
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    if (wide && tall) {
      split(x0, y0, mx, my, level + 1);
      split(mx, y0, x1, my, level + 1);
      split(x0, my, mx, y1, level + 1);
      split(mx, my, x1, y1, level + 1);
    } else if (wide) {
      split(x0, y0, mx, y1, level + 1);
      split(mx, y0, x1, y1, level + 1);
    } else {
      split(x0, y0, x1, my, level + 1);
      split(x0, my, x1, y1, level + 1);
    }
  };
  const cellsOf = () => {
    cells = [];
    for (let j = 0; j + 1 < ys.length; j += 1) {
      for (let i = 0; i + 1 < xs.length; i += 1) split(xs[i], ys[j], xs[i + 1], ys[j + 1], 0);
    }
  };
  cellsOf();
  /*
   * БЮДЖЕТ СЕТКИ. Густой орнамент на высокой двери просил бы сотни тысяч
   * ячеек — секунды счёта в главном потоке и планшет, который не тянет
   * сцену. Не влезло — шаг кривых зон растёт (ячеек меньше как квадрат
   * шага), рисунок тот же, мельче детали — грубее.
   */
  for (let round = 0; round < 4 && field.zones.length > 0 && cells.length > RELIEF_CELL_BUDGET; round += 1) {
    coarse *= Math.min(3, Math.max(1.3, Math.sqrt(cells.length / RELIEF_CELL_BUDGET)));
    cellsOf();
  }

  /* ── узлы лица: один на точку, высота — по полю ── */
  const keyOf = (v: number) => Math.round(v * 1e4);
  const vx: number[] = [];
  const vy: number[] = [];
  const vz: number[] = [];
  const index = new Map<number, number>();
  /* Узлы по линиям: на какой горизонтали и вертикали что лежит — для стыков без Т. */
  const rows = new Map<number, number[]>();
  const cols = new Map<number, number[]>();
  const vertex = (x: number, y: number): number => {
    /* Ключ числом: x и y в десятитысячных мм, со сдвигом в положительные. */
    const key = (keyOf(x) + 2e7) * 4e7 + (keyOf(y) + 2e7);
    let n = index.get(key);
    if (n === undefined) {
      n = vx.length;
      index.set(key, n);
      vx.push(x);
      vy.push(y);
      vz.push(top - depthOf(x, y));
      const row = rows.get(keyOf(y));
      if (row) row.push(x);
      else rows.set(keyOf(y), [x]);
      const col = cols.get(keyOf(x));
      if (col) col.push(y);
      else cols.set(keyOf(x), [y]);
    }
    return n;
  };
  for (const [x0, y0, x1, y1] of cells) {
    vertex(x0, y0);
    vertex(x1, y0);
    vertex(x1, y1);
    vertex(x0, y1);
  }
  rows.forEach((list) => list.sort((a, b) => a - b));
  cols.forEach((list) => list.sort((a, b) => a - b));
  /** Точки строго между `from` и `to` на линии — по возрастанию. */
  const between = (list: number[] | undefined, from: number, to: number): number[] => {
    if (!list) return [];
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (list[m] <= from + 1e-6) lo = m + 1;
      else hi = m;
    }
    const out: number[] = [];
    for (let k = lo; k < list.length && list[k] < to - 1e-6; k += 1) out.push(list[k]);
    return out;
  };
  const point = (n: number): [number, number, number] => [vx[n], vy[n], vz[n]];

  /* ── лицо: два треугольника на ячейку (диагональ по данным) или веер, если у соседа узлы на стороне ── */
  type Tri = { p: [number, number, number][]; nodes: number[] };
  const face: Tri[] = [];
  for (const [x0, y0, x1, y1] of cells) {
    const a = vertex(x0, y0);
    const b = vertex(x1, y0);
    const c = vertex(x1, y1);
    const d = vertex(x0, y1);
    const bottom = between(rows.get(keyOf(y0)), x0, x1);
    const right = between(cols.get(keyOf(x1)), y0, y1);
    const upper = between(rows.get(keyOf(y1)), x0, x1).reverse();
    const left = between(cols.get(keyOf(x0)), y0, y1).reverse();
    const mid = top - depthOf((x0 + x1) / 2, (y0 + y1) / 2);
    if (bottom.length + right.length + upper.length + left.length === 0) {
      const viaAC = Math.abs((vz[a] + vz[c]) / 2 - mid);
      const viaBD = Math.abs((vz[b] + vz[d]) / 2 - mid);
      if (viaAC <= viaBD) {
        face.push({ p: [point(a), point(b), point(c)], nodes: [a, b, c] }, { p: [point(a), point(c), point(d)], nodes: [a, c, d] });
      } else {
        face.push({ p: [point(a), point(b), point(d)], nodes: [a, b, d] }, { p: [point(b), point(c), point(d)], nodes: [b, c, d] });
      }
      continue;
    }
    /* Веер из середины ячейки по всем узлам её сторон — против часовой при взгляде с +Z. */
    const ring = [
      a,
      ...bottom.map((x) => vertex(x, y0)),
      b,
      ...right.map((y) => vertex(x1, y)),
      c,
      ...upper.map((x) => vertex(x, y1)),
      d,
      ...left.map((y) => vertex(x0, y)),
    ];
    const center = vx.length;
    vx.push((x0 + x1) / 2);
    vy.push((y0 + y1) / 2);
    vz.push(mid);
    for (let k = 0; k < ring.length; k += 1) {
      const p = ring[k];
      const q = ring[(k + 1) % ring.length];
      face.push({ p: [point(center), point(p), point(q)], nodes: [center, p, q] });
    }
  }

  /*
   * ОКНО ВИТРИНЫ: треугольник, все вершины которого легли на тыл, — это
   * не плита, а дыра под стекло. В сетку он не идёт, и тыл под ним тоже.
   */
  const back = -T / 2;
  const floor = (t: Tri) => t.p.every((v) => v[2] <= back + 1e-9);
  if (field.glass) {
    const kept = face.filter((t) => !floor(t));
    face.length = 0;
    face.push(...kept);
  }

  /* Нормаль треугольника лица и её площадь (вес). */
  const faceNormal = (t: Tri): [number, number, number] => {
    const [p, q, s] = t.p;
    const ux = q[0] - p[0];
    const uy = q[1] - p[1];
    const uz = q[2] - p[2];
    const wx = s[0] - p[0];
    const wy = s[1] - p[1];
    const wz = s[2] - p[2];
    return [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
  };
  const unit = (v: [number, number, number]): [number, number, number] => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const raw = face.map(faceNormal);
  const dirs = raw.map(unit);
  /* Какие треугольники сходятся в узле — для гладких нормалей внутри дуги. */
  const incident: number[][] = Array.from({ length: vx.length }, () => []);
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
  /* Узлы контура фасада — все, что легли на его стороны, по возрастанию. */
  const xLo = xs[0];
  const xHi = xs[xs.length - 1];
  const yLo = ys[0];
  const yHi = ys[ys.length - 1];
  const along = (list: number[] | undefined) => list ?? [];
  const lowRow = along(rows.get(keyOf(yLo)));
  const highRow = along(rows.get(keyOf(yHi)));
  const leftCol = along(cols.get(keyOf(xLo)));
  const rightCol = along(cols.get(keyOf(xHi)));
  const at = (x: number, y: number) => point(vertex(x, y));
  /* Порядок тот же, что у прежней сетки: низ и верх парами, потом лево и право. */
  for (let i = 0; i + 1 < Math.max(lowRow.length, highRow.length); i += 1) {
    if (i + 1 < lowRow.length) {
      /* низ: смотрит в −Y */
      const l = at(lowRow[i], yLo);
      const rr = at(lowRow[i + 1], yLo);
      quad([l[0], l[1], back], [rr[0], rr[1], back], rr, l, [0, -1, 0]);
    }
    if (i + 1 < highRow.length) {
      /* верх: смотрит в +Y */
      const tl = at(highRow[i], yHi);
      const tr = at(highRow[i + 1], yHi);
      quad([tr[0], tr[1], back], [tl[0], tl[1], back], tl, tr, [0, 1, 0]);
    }
  }
  for (let j = 0; j + 1 < Math.max(leftCol.length, rightCol.length); j += 1) {
    if (j + 1 < leftCol.length) {
      /* левый: смотрит в −X */
      const lb = at(xLo, leftCol[j]);
      const lt = at(xLo, leftCol[j + 1]);
      quad([lt[0], lt[1], back], [lb[0], lb[1], back], lb, lt, [-1, 0, 0]);
    }
    if (j + 1 < rightCol.length) {
      /* правый: смотрит в +X */
      const rb = at(xHi, rightCol[j]);
      const rt = at(xHi, rightCol[j + 1]);
      quad([rb[0], rb[1], back], [rt[0], rt[1], back], rt, rb, [1, 0, 0]);
    }
  }

  if (field.glass) {
    /*
     * ── тыл рамы витрины: те же треугольники, что у лица, но на тыле ──
     * Окна в тыле там же, где в лице, и кромка окна замкнута: нижнее ребро
     * стенки окна — ребро треугольника тыла под ней.
     */
    for (const t of face) {
      const [p, q, s] = t.p;
      push([p[0], p[1], back], [0, 0, -1]);
      push([s[0], s[1], back], [0, 0, -1]);
      push([q[0], q[1], back], [0, 0, -1]);
    }
  } else {
    /* ── тыл: веер из центра по всем узлам контура — тоже без Т-стыков ── */
    const ring: [number, number][] = [];
    for (const x of lowRow) ring.push([x, yLo]);
    for (const y of rightCol.slice(1)) ring.push([xHi, y]);
    for (const x of highRow.slice(0, -1).reverse()) ring.push([x, yHi]);
    for (const y of leftCol.slice(1, -1).reverse()) ring.push([xLo, y]);
    const center: [number, number, number] = [0, 0, back];
    for (let k = 0; k < ring.length; k += 1) {
      const [ax, ay] = ring[k];
      const [bx, by] = ring[(k + 1) % ring.length];
      /* Контур обходится против часовой при взгляде с +Z; тыл смотрит в −Z — обход обратный. */
      push(center, [0, 0, -1]);
      push([bx, by, back], [0, 0, -1]);
      push([ax, ay, back], [0, 0, -1]);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    triangles: positions.length / 9,
    drawn: plain ? 'slab' : r.kind,
    refusal,
    glassMm: field.glass,
  };
}

/**
 * Ключ сетки фасада: рисунок и габарит с точностью до десятой миллиметра;
 * у рисунка с ручкой — ещё и разворот (зеркальная ручка — другая сетка).
 */
export function reliefMeshKey(relief: FrontRelief, leaf: ReliefLeaf, orient?: ReliefOrient): string {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const turned = relief.kind === 'design' && relief.design?.grip ? `|${orient?.flipX ? 'fx' : ''}${orient?.flipY ? 'fy' : ''}` : '';
  return `${reliefKey(relief)}|${r1(leaf.widthMm)}x${r1(leaf.heightMm)}x${r1(leaf.thicknessMm)}${turned === '|' ? '' : turned}`;
}

/**
 * КАК РАЗВЕРНУТЬ РИСУНОК С РУЧКОЙ НА ЭТОЙ СТВОРКЕ. Рисунок снят для нижнего
 * шкафа с петлями слева: ручка сверху, угловая — у правого края. Петли
 * справа — угловая ручка уходит влево; верхний ряд и подъёмник — ручка
 * вниз (за неё берутся снизу). У рисунка без ручки разворота нет.
 */
export function gripOrient(relief: FrontRelief | undefined, hinge: string, upper: boolean): ReliefOrient | undefined {
  const grip = relief?.kind === 'design' ? relief.design?.grip : undefined;
  if (!grip) return undefined;
  const flipX = grip === 'corner' && hinge === 'right';
  const flipY = upper || hinge === 'lift';
  return flipX || flipY ? { ...(flipX ? { flipX } : {}), ...(flipY ? { flipY } : {}) } : undefined;
}

/* ─────────────────────────  поле глубины и затенение  ───────────────────────── */

/**
 * ГЛУБИНА РЕЛЬЕФА В ТОЧКЕ ФАСАДА, мм — та же функция, по которой строится
 * сетка. Координаты — мм от центра фасада, Y вверх. Рисунок не встал на
 * этот фасад — поле гладкого (только кромка), как у сетки.
 */
/** Стекло в раме витрины заходит под раму на четверть — VISUAL_ONLY, четверти цеха нет. */
export const GLASS_REBATE_MM = 6;

/**
 * СТЕКЛО РАМЫ ВИТРИНЫ НА ЭТОМ ФАСАДЕ: прямоугольник (мм от центра фасада)
 * — габарит окон плюс четверть, внутри фасада. У рисунка без окон и у
 * рамы, которая на фасад не встала, стекла нет (`null`).
 */
export function reliefGlassMm(relief: FrontRelief | undefined, leaf: ReliefLeaf, orient?: ReliefOrient): [number, number, number, number] | null {
  if (!relief || relief.kind !== 'design' || !designHasCut(relief.design)) return null;
  if (reliefLeafRefusal(relief, leaf) !== null) return null;
  const glass = fieldOf(resolveRelief(relief), leaf, false, orient).glass;
  if (!glass) return null;
  const limitX = leaf.widthMm / 2 - 10;
  const limitY = leaf.heightMm / 2 - 10;
  return [
    Math.max(-limitX, glass[0] - GLASS_REBATE_MM),
    Math.max(-limitY, glass[1] - GLASS_REBATE_MM),
    Math.min(limitX, glass[2] + GLASS_REBATE_MM),
    Math.min(limitY, glass[3] + GLASS_REBATE_MM),
  ];
}

export function reliefDepthAt(relief: FrontRelief, leaf: ReliefLeaf, orient?: ReliefOrient): (xMm: number, yMm: number) => number {
  const plain = reliefLeafRefusal(relief, leaf) !== null;
  const depthAt = fieldOf(resolveRelief(relief), leaf, plain, orient).depthAt;
  return (x, y) => Math.min(leaf.thicknessMm, depthAt(x, y));
}

/** Свет карточки — сверху слева, как у рисунков фрезеровки (`RELIEF_LIGHT`). */
const SHADE_LIGHT = (() => {
  const v = [-0.45, 0.55, 0.7];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

/** Стекло в окне рамы витрины на карточке: холодный серый — видно, что это не лицо фасада. */
const SHADE_GLASS = [150, 168, 176];

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
  const rgb = /^#[0-9a-f]{6}$/i.test(tint) ? [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16)) : [217, 212, 203];
  /*
   * Глубина — одна выборка на пиксель (с рамкой в пиксель), наклон — по
   * соседним пикселям: у рисунка модели десятки слоёв, и пять выборок на
   * пиксель делали карточку списка медленной.
   */
  const gw = width + 2;
  const grid = new Float64Array(gw * (height + 2));
  for (let gy = 0; gy < height + 2; gy += 1) {
    const yMm = -(gy - 0.5 - oy) / scale;
    for (let gx = 0; gx < gw; gx += 1) grid[gy * gw + gx] = depthAt((gx - 0.5 - ox) / scale, yMm);
  }
  const step = 1 / scale;
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
      const g = (py + 1) * gw + (px + 1);
      /* Окно рамы витрины — насквозь, до тыла: там стекло, а не лицо фасада. */
      if (grid[g] >= leaf.thicknessMm - 1e-6) {
        out[k] = SHADE_GLASS[0];
        out[k + 1] = SHADE_GLASS[1];
        out[k + 2] = SHADE_GLASS[2];
        out[k + 3] = 255;
        continue;
      }
      /* Нормаль по разностям глубины: z = −d, наклон — против роста глубины. */
      const dx = (grid[g + 1] - grid[g - 1]) / (2 * step);
      const dy = (grid[g - gw] - grid[g + gw]) / (2 * step);
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
