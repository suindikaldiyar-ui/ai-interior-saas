import type { ReliefDesign, ReliefEdge, ReliefLayer, ReliefLen, ReliefPath, ReliefShape } from '@/types/millwork';

/**
 * РИСУНКИ МОДЕЛЕЙ KIRA — ПРИБЛИЖЕНИЯ ПО ФОТО ПРОИЗВОДИТЕЛЯ (VISUAL_ONLY).
 *
 * У каждой модели свой рисунок: слои над фигурами (`lib/millwork/reliefDesign.ts`),
 * снятые глазом с фото товара на kira-group.kz. Это НЕ заводская геометрия:
 * чертежа фрезы, глубин, отступов и размеров KIRA не публикует. Числа ниже —
 * то, что правдоподобно выглядит на встрече: снято с фото фасада, которое
 * считается номинально 400 × 800 мм. Отступы рамок — в мм (у производителя
 * рамка от размера фасада не растёт), элементы, которые растут вместе с
 * фасадом (линии «Асимметрии», прямоугольники «Тандема»), — долями.
 *
 * Где правдоподобного приближения нет (орнамент из кривых, который по фото
 * без искажения не повторить), у модели нет 3D: `preview: 'NOT_AVAILABLE'`
 * и причина словами. Подменять такой рисунок рамкой нельзя — клиент
 * выберет по картинке не ту мебель.
 *
 * Факты о модели (название, uid, адрес, категории) — в `data/catalog/kira.json`;
 * здесь только рисунок, его тип и что в нём не воспроизведено.
 */

/** Тип рисунка — фильтр в каталоге KIRA; классификация по фото, на глаз. */
export type KiraPatternType = 'frame' | 'arch' | 'grooves' | 'steps' | 'flutes' | 'ornament' | 'vitrine' | 'handle';

export const KIRA_PATTERN_TYPES: { key: KiraPatternType; title: string }[] = [
  { key: 'frame', title: 'Рамка, выборка' },
  { key: 'arch', title: 'Арка, фигурный контур' },
  { key: 'grooves', title: 'Канавки, линии' },
  { key: 'steps', title: 'Ступени' },
  { key: 'flutes', title: 'Рифление' },
  { key: 'ornament', title: 'Орнамент' },
  { key: 'vitrine', title: 'Витрина' },
  { key: 'handle', title: 'Ручка' },
];

export type KiraDesignEntry = {
  /** Что на фасаде — словами. */
  pattern: string;
  type: KiraPatternType;
  /** Чего приближение не воспроизводит — словами. */
  notReproduced?: string;
} & ({ design: ReliefDesign } | { preview: 'NOT_AVAILABLE'; reason: string });

/* ─────────────────────────  помощники  ───────────────────────── */

/** Доля размера фасада (и ещё мм): `f(0.5)` — середина, `f(1, -64)` — 64 мм от правого/нижнего края. */
const f = (share: number, mm?: number): ReliefLen => (mm === undefined ? { f: share } : { f: share, mm });
type RectExtra = Omit<Extract<ReliefShape, { rect: unknown }>, 'rect'>;
/** Прямоугольник отступами от краёв: слева, справа, сверху, снизу. */
const box = (l: ReliefLen, r: ReliefLen, t: ReliefLen, b: ReliefLen, extra: RectExtra = {}): ReliefShape => ({ rect: [l, r, t, b], ...extra });
/** Прямоугольник с одинаковым отступом со всех сторон. */
const inset = (a: ReliefLen, extra: RectExtra = {}): ReliefShape => box(a, a, a, a, extra);
const level = (shape: ReliefShape, depth: number, w: number, edge: ReliefEdge = 'cove'): ReliefLayer => ({ op: 'level', shape, depth, w, edge });
const groove = (paths: ReliefPath[], w: number, depth: number, profile: 'v' | 'round' | 'flat' = 'v'): ReliefLayer => ({
  op: 'groove',
  paths,
  w,
  depth,
  profile,
});
const bead = (paths: ReliefPath[], w: number, height: number, profile: 'round' | 'flat' = 'round', top?: number): ReliefLayer => ({
  op: 'bead',
  paths,
  w,
  height,
  profile,
  ...(top === undefined ? {} : { top }),
});
const outline = (shape: ReliefShape): ReliefPath => ({ outline: shape });
const line = (x0: ReliefLen, y0: ReliefLen, x1: ReliefLen, y1: ReliefLen, ends?: 'round' | 'square'): ReliefPath => ({
  line: [
    [x0, y0],
    [x1, y1],
  ],
  ...(ends ? { ends } : {}),
});
/** Вертикаль на `x` от левого края — во всю высоту, сквозь кромки. */
const vline = (x: ReliefLen, from: ReliefLen = f(-0.02), to: ReliefLen = f(1.02)): ReliefPath => line(x, from, x, to, 'square');
/** Горизонталь на `y` от верхнего края — во всю ширину, сквозь кромки. */
const hline = (y: ReliefLen, from: ReliefLen = f(-0.02), to: ReliefLen = f(1.02)): ReliefPath => line(from, y, to, y, 'square');
const design = (...layers: ReliefLayer[]): ReliefDesign => ({ layers });

/* ─────────────────────────  простая фрезеровка  ───────────────────────── */

/** Контур «Антика»: дуга сверху и снизу, углы вырезаны внутрь. */
const ANTIK_SHAPE = inset(70, { arch: 26, archSide: 'both', notch: 24 });

const SIMPLE: Record<string, KiraDesignEntry> = {
  ANTIK: {
    type: 'arch',
    pattern: 'контур с дугой сверху и снизу, углы вырезаны внутрь; поле утоплено',
    design: design(level(ANTIK_SHAPE, 3, 9, 'cove')),
  },
  'ANTIK-RESHETKA': {
    type: 'ornament',
    pattern: 'контур «Антика» и решётка ромбами по полю',
    design: design(level(ANTIK_SHAPE, 3, 9, 'cove'), {
      op: 'flutes',
      area: inset(84, { arch: 22, archSide: 'both', notch: 18 }),
      dir: 45,
      cross: true,
      pitch: 48,
      w: 28,
      depth: 2.5,
      profile: 'v',
    }),
    notReproduced: 'ромбы — пирамидками из канавок; скругление подушек на фото мягче',
  },
  ARKA: {
    type: 'arch',
    pattern: 'контур с аркой сверху, низ слегка дугой, углы скруглены; второй тонкий кант внутри',
    design: design(
      level(inset(62, { corner: 'round', r: 34, arch: 40, archSide: 'both', archBottom: 14 }), 4, 11, 'cove'),
      groove([outline(inset(80, { corner: 'round', r: 22, arch: 36, archSide: 'both', archBottom: 12 }))], 5, 1.5, 'round'),
    ),
  },
  KLASSIKA: {
    type: 'arch',
    pattern: 'арка с плечиками сверху, низ прямой; тонкий кант внутри',
    design: design(
      level(box(62, 62, 66, 62, { arch: 44, shoulder: 30 }), 3.5, 10, 'cove'),
      groove([outline(box(78, 78, 82, 78, { arch: 40, shoulder: 26 }))], 4, 1.2, 'round'),
    ),
    notReproduced: 'дуга «колоколом» на фото — здесь дуга окружности с плечиками',
  },
  'IZABELLA-PROSTAYA': {
    type: 'frame',
    pattern: 'двойной контур — тонкая линия и выборка; резной орнамент вверху и внизу по центру',
    design: design(
      groove([outline(inset(46))], 5, 1.5, 'v'),
      level(inset(60), 2.5, 6, 'cove'),
      groove(
        [
          outline({ ellipse: [f(0.5), 100, 13, 13] }),
          outline({ ellipse: [f(0.5, -22), 92, 9, 9] }),
          outline({ ellipse: [f(0.5, 22), 92, 9, 9] }),
          outline({ ellipse: [f(0.5), f(1, -100), 13, 13] }),
          outline({ ellipse: [f(0.5, -22), f(1, -92), 9, 9] }),
          outline({ ellipse: [f(0.5, 22), f(1, -92), 9, 9] }),
        ],
        4,
        1.5,
        'round',
      ),
    ),
    notReproduced: 'резной орнамент — тремя кольцами, а не резьбой',
  },
  'KVADRO-PROSTAYA': {
    type: 'frame',
    pattern: 'прямоугольная выборка, углы чуть скруглены',
    design: design(level(inset(62, { corner: 'round', r: 14 }), 3, 8, 'cove')),
  },
  ASIMMETRIYA: {
    type: 'grooves',
    pattern: 'четыре тонкие наклонные канавки от края до края, пересекаются',
    design: design(
      groove(
        [
          line(f(0.368), f(-0.02), f(1.02), f(0.661)),
          line(f(1.02), f(0.103), f(-0.02), f(0.764)),
          line(f(-0.02), f(0.34), f(1.02), f(0.911)),
          line(f(1.02), f(0.451), f(0.4085), f(1.02)),
        ],
        5,
        1.5,
        'v',
      ),
    ),
  },
  KANTRI: {
    type: 'grooves',
    pattern: 'стойки и перекладины канавками, поле — вертикальные «доски»',
    design: design(
      groove([vline(64), vline(f(1, -64)), line(64, 66, f(1, -64), 66, 'square'), line(64, f(1, -66), f(1, -64), f(1, -66), 'square')], 6, 2, 'v'),
      { op: 'flutes', area: box(108, 108, 66, 66), dir: 'v', pitch: 45, w: 6, depth: 2, profile: 'v' },
    ),
  },
  KLETKA: {
    type: 'grooves',
    pattern: 'по две сквозные канавки у каждого края — решётка «#»',
    design: design(groove([vline(72), vline(f(1, -72)), hline(70), hline(f(1, -70))], 6, 2, 'v')),
  },
  KRISTALL: {
    type: 'frame',
    pattern: 'рамка гранями к центру, швы граней «на ус» от углов',
    /* Скос — от узкого пояска у кромки: с самой кромки лицо нигде не дошло бы до толщины фасада. */
    design: design(level(inset(2), 4, 68, 'bevel'), groove([outline(inset(70))], 4, 1, 'v')),
  },
  LIRA: {
    type: 'grooves',
    pattern: 'рамка «шейкер» канавками: стойки во всю высоту, перекладины между ними',
    design: design(
      groove([vline(72), vline(f(1, -72)), line(72, 80, f(1, -72), 80, 'square'), line(72, f(1, -92), f(1, -72), f(1, -92), 'square')], 6, 2.5, 'v'),
    ),
  },
  TANDEM: {
    type: 'grooves',
    pattern: 'два перекрывающихся прямоугольных жёлоба',
    design: design(
      groove([outline(box(f(0.17), f(0.4), f(0.09), f(0.385))), outline(box(f(0.4), f(0.15), f(0.386), f(0.097)))], 14, 3, 'round'),
    ),
  },
};

/* ─────────────────────────  выборка (без орнаментов)  ───────────────────────── */

const CUTOUT: Record<string, KiraDesignEntry> = {
  'VIBORKA-4': {
    type: 'frame',
    pattern: 'одна выборка — поле утоплено, узкий скруглённый уступ',
    design: design(level(box(58, 58, 70, 64), 3, 5, 'cove')),
  },
  'VIBORKA-42': {
    type: 'steps',
    pattern: 'выборка двумя близкими уступами',
    design: design(level(box(56, 56, 66, 62), 2, 3, 'cove'), level(box(68, 68, 78, 74), 4, 3, 'cove')),
  },
  'VIBORKA-12024': {
    type: 'steps',
    pattern: 'выборка двумя уступами, внутренний со скруглённым носиком',
    design: design(level(inset(60), 2, 4, 'cove'), level(inset(76), 4, 5, 'ovolo')),
  },
  'VIBORKA-1208': {
    type: 'frame',
    pattern: 'выборка с широким скосом к полю',
    design: design(level(inset(58), 6, 28, 'bevel')),
  },
  'VIBORKA-RIF-1': {
    type: 'flutes',
    pattern: 'по раме — частые контурные канавки, поле утоплено скосом',
    design: design(
      groove(
        [8, 15.5, 23, 30.5, 38, 45.5, 53].map((a) => outline(inset(a))),
        4,
        1,
        'round',
      ),
      level(inset(64), 3, 8, 'bevel'),
    ),
  },
  'VIBORKA-RIF-2': {
    type: 'steps',
    pattern: 'четыре вложенные ступени вокруг поля',
    design: design(
      level(inset(52), 1, 2.5, 'ovolo'),
      level(inset(66), 2, 2.5, 'ovolo'),
      level(inset(80), 3, 2.5, 'ovolo'),
      level(inset(94), 4, 2.5, 'ovolo'),
    ),
  },
  GEOMETRIYA: {
    type: 'ornament',
    pattern: 'карманы со скосами, между ними плоские бруски: стойки, перекладины в боковых колонках и два «икса» по центру',
    design: design(
      level(box(f(0.146), f(0.144), f(0.073), f(0.081)), 4, 13, 'bevel'),
      bead(
          [
            line(f(0.307), f(0.05), f(0.307), f(0.174), 'square'),
            line(f(0.697), f(0.05), f(0.697), f(0.174), 'square'),
            line(f(0.307), f(0.378), f(0.307), f(0.6), 'square'),
            line(f(0.697), f(0.378), f(0.697), f(0.6), 'square'),
            line(f(0.307), f(0.813), f(0.307), f(0.95), 'square'),
            line(f(0.697), f(0.813), f(0.697), f(0.95), 'square'),
            ...[0.174, 0.378, 0.6, 0.813].flatMap((y) => [
              line(f(0.12), f(y), f(0.307), f(y), 'square'),
              line(f(0.697), f(y), f(0.88), f(y), 'square'),
            ]),
            line(f(0.307), f(0.174), f(0.697), f(0.378)),
            line(f(0.697), f(0.174), f(0.307), f(0.378)),
            line(f(0.307), f(0.6), f(0.697), f(0.813)),
            line(f(0.697), f(0.6), f(0.307), f(0.813)),
          ],
        33,
        4,
        'flat',
        7,
      ),
    ),
    notReproduced: 'стыки брусков — пересечением, без подрезки',
  },
  KANT: {
    type: 'grooves',
    pattern: 'рама из сегментов вокруг высокого поля: кант по контурам',
    design: design(
      groove(
        [
          outline(box(35, 35, 30, 30)),
          outline(box(f(0.3), f(0.3), f(0.13), f(0.14))),
          line(f(0.5), 30, f(0.5), f(0.13), 'square'),
          line(f(0.5), f(0.86), f(0.5), f(1, -30), 'square'),
          line(35, f(0.33), f(0.3), f(0.33), 'square'),
          line(35, f(0.66), f(0.3), f(0.66), 'square'),
          line(f(0.7), f(0.33), f(1, -35), f(0.33), 'square'),
          line(f(0.7), f(0.66), f(1, -35), f(0.66), 'square'),
        ],
        8,
        2.5,
        'round',
      ),
    ),
    notReproduced: 'сегменты на фото — выпуклые подушки; здесь канавки по их контурам',
  },
  'PR-1': {
    type: 'frame',
    pattern: 'выборка со скруглённым носиком уступа',
    design: design(level(inset(62), 3, 6, 'ovolo')),
  },
  'PR-5': {
    type: 'frame',
    pattern: 'тонкая линия у края и выборка со скруглённым носиком',
    design: design(groove([outline(inset(16))], 4, 1.2, 'v'), level(inset(58), 3, 6, 'ovolo')),
  },
  'PR-7': {
    type: 'frame',
    pattern: 'узкая рамка у самого края, поле утоплено',
    design: design(level(inset(18), 2, 4, 'cove')),
  },
};

/* ─────────────────────────  объёмная выборка: орнаменты ОВ  ───────────────────────── */

/** Плоская рамка, скос в выборку, орнамент по дну — общее у всех ОВ. */
const ovFrame = (border: number, depth: number, bevel: number) => level(inset(border), depth, bevel, 'bevel');

/** Прямоугольник с центром (cx, cy) и размером w × h — отступами от краёв клетки мотива. */
const centered = (cx: number, cy: number, w: number, h: number, cell: [number, number], extra: RectExtra = {}): ReliefShape =>
  box(cx - w / 2, cell[0] - cx - w / 2, cy - h / 2, cell[1] - cy - h / 2, extra);

/** «Фонарик» марокканской решётки: в центре клетки и по её углам (центрированная решётка). */
const LANTERN_CELL: [number, number] = [96, 55];
const lantern = (cx: number, cy: number) =>
  level(centered(cx, cy, 42, 50, LANTERN_CELL, { arch: 13, archSide: 'both', notch: 8 }), 3, 2.5, 'cove');

/** Шестиугольник «кубика» (вершиной вверх): три ромба-кармана вокруг центра. */
const CUBE_S = 30.6;
const CUBE_CELL: [number, number] = [Math.sqrt(3) * CUBE_S, 3 * CUBE_S];
function cubeRhombi(hx: number, hy: number): ReliefLayer[] {
  const s = CUBE_S;
  const k = (Math.sqrt(3) / 2) * s;
  const c: [number, number] = [hx, hy];
  const top: [number, number] = [hx, hy - s];
  const ur: [number, number] = [hx + k, hy - s / 2];
  const lr: [number, number] = [hx + k, hy + s / 2];
  const bottom: [number, number] = [hx, hy + s];
  const ll: [number, number] = [hx - k, hy + s / 2];
  const ul: [number, number] = [hx - k, hy - s / 2];
  /* Ромб ужат к своему центру: между карманами остаётся ребро. */
  const shrink = (points: [number, number][]): [ReliefLen, ReliefLen][] => {
    const mx = points.reduce((a, p) => a + p[0], 0) / points.length;
    const my = points.reduce((a, p) => a + p[1], 0) / points.length;
    return points.map(([x, y]) => [mx + (x - mx) * 0.84, my + (y - my) * 0.84]);
  };
  return [
    [c, top, ur, lr],
    [c, lr, bottom, ll],
    [c, ll, ul, top],
  ].map((points) => level({ poly: shrink(points as [number, number][]) }, 3, 1.6, 'bevel'));
}

/**
 * «ОВ 81»: квадратные карманы на дне выборки. На фото они уложены по сетке
 * гнёзд ~47 × 50 мм: в гнезде один большой квадрат, средний или пара-тройка
 * мелких. Клетка мотива — 4 × 4 гнезда; что в каком гнезде — таблицей ниже
 * (x, y от угла гнезда и сторона, мм).
 */
const NEST: [number, number] = [47, 50];
const POCKETS_CELL: [number, number] = [4 * NEST[0], 4 * NEST[1]];
const NEST_FILL: Record<string, [number, number, number][]> = {
  B: [[4, 5, 39]],
  b: [[6, 8, 34]],
  M: [[10, 12, 26]],
  m: [[5, 16, 27]],
  S2: [[8, 7, 13], [8, 27, 13]],
  S2h: [[5, 10, 13], [24, 10, 13]],
  SM: [[4, 4, 11], [17, 18, 26]],
  SM2: [[26, 6, 12], [5, 20, 24]],
};
const NESTS = [
  ['B', 'SM', 'M', 'S2'],
  ['m', 'B', 'S2h', 'b'],
  ['S2', 'b', 'B', 'M'],
  ['M', 'SM2', 'm', 'B'],
];
const pockets = (): ReliefLayer[] =>
  NESTS.flatMap((row, j) =>
    row.flatMap((kind, i) =>
      NEST_FILL[kind].map(([x, y, side]) => {
        const left = i * NEST[0] + x;
        const top = j * NEST[1] + y;
        return level(box(left, POCKETS_CELL[0] - left - side, top, POCKETS_CELL[1] - top - side), 3, 1.2, 'bevel');
      }),
    ),
  );

const NOT_AVAILABLE_ORNAMENT =
  'орнамент из кривых лент и розеток: по фото его не повторить без искажения, а похожий рисунок выдал бы другую модель за эту';

const ORNAMENT: Record<string, KiraDesignEntry> = {
  'OV-76-195813335644': {
    type: 'ornament',
    pattern: 'марокканская решётка «фонариками» на дне выборки',
    design: design(ovFrame(48, 3, 12), {
      op: 'tiles',
      area: inset(62),
      cell: LANTERN_CELL,
      layers: [lantern(48, 27.5), lantern(0, 0), lantern(96, 0), lantern(0, 55), lantern(96, 55)],
    }),
    notReproduced: 'фонарики — дугами «Антика», а не точным марокканским контуром',
  },
  'OV-76-800964498042': {
    type: 'ornament',
    pattern: 'переплетённые кольца с малыми кольцами в узлах на дне выборки',
    design: design(ovFrame(48, 3, 12), {
      op: 'tiles',
      area: inset(62),
      cell: [52, 52],
      layers: [
        groove(
          [
            outline({ ellipse: [26, 26, 25, 25] }),
            outline({ ellipse: [0, 0, 25, 25] }),
            outline({ ellipse: [52, 0, 25, 25] }),
            outline({ ellipse: [0, 52, 25, 25] }),
            outline({ ellipse: [52, 52, 25, 25] }),
            outline({ ellipse: [26, 26, 9, 9] }),
          ],
          4,
          2.5,
          'round',
        ),
      ],
    }),
    notReproduced: 'розетки — пересечением колец; мелкие лепестки фото переданы кольцами',
  },
  'OV-77': {
    type: 'ornament',
    pattern: '«кубики»: шестиугольники из трёх ромбов-карманов на дне выборки',
    design: design(ovFrame(50, 3, 14), {
      op: 'tiles',
      area: inset(64),
      cell: CUBE_CELL,
      layers: [
        ...cubeRhombi(CUBE_CELL[0] / 2, CUBE_CELL[1] / 2),
        ...cubeRhombi(0, 0),
        ...cubeRhombi(CUBE_CELL[0], 0),
        ...cubeRhombi(0, CUBE_CELL[1]),
        ...cubeRhombi(CUBE_CELL[0], CUBE_CELL[1]),
      ],
    }),
    notReproduced: 'грани ромбов одной глубины: объём «кубиков» — от рёбер, как на фото',
  },
  'OV-81': {
    type: 'ornament',
    pattern: 'квадратные карманы разного размера по сетке гнёзд на дне выборки',
    design: design(ovFrame(46, 3, 18), {
      op: 'tiles',
      area: inset(66),
      cell: POCKETS_CELL,
      layers: pockets(),
    }),
    notReproduced: 'расстановка карманов повторяется клеткой 188 × 200 мм; на фото она без повтора; стенки карманов — шагом сетки, не отвесно',
  },
  'OV-84': {
    type: 'ornament',
    pattern: 'неровные многоугольные карманы с узкими рёбрами — «битое стекло» на дне выборки',
    design: design(ovFrame(50, 3, 14), {
      op: 'cells',
      area: inset(64),
      size: 30,
      jitter: 0.9,
      seed: 84,
      w: 8,
      depth: 3,
      profile: 'flat',
      invert: true,
    }),
    notReproduced: 'ячейки — выпуклые многоугольники (Вороной); на фото встречаются и вогнутые',
  },
  'OV-71': {
    type: 'ornament',
    pattern: 'трёхлучевые ленты вокруг малых шестиугольников на дне выборки',
    preview: 'NOT_AVAILABLE',
    reason: NOT_AVAILABLE_ORNAMENT,
  },
  'OV-73': {
    type: 'ornament',
    pattern: 'восьмилучевые звёзды-розетки из переплетённых лент на дне выборки',
    preview: 'NOT_AVAILABLE',
    reason: NOT_AVAILABLE_ORNAMENT,
  },
  'OV-75': {
    type: 'ornament',
    pattern: 'завитки-спирали на дне выборки',
    preview: 'NOT_AVAILABLE',
    reason: NOT_AVAILABLE_ORNAMENT,
  },
  'OV-80': {
    type: 'ornament',
    pattern: 'переплетённые волнистые ленты на дне выборки',
    preview: 'NOT_AVAILABLE',
    reason: NOT_AVAILABLE_ORNAMENT,
  },
};

/* ─────────────────────────  рифы  ───────────────────────── */

/** Рифление во всё лицо: от кромки до кромки, по вертикали. */
const allOver = inset(-6);
const ribs = (pitch: number, w: number, depth: number, profile: 'v' | 'round' | 'reed', area: ReliefShape = allOver): ReliefLayer => ({
  op: 'flutes',
  area,
  dir: 'v',
  pitch,
  w,
  depth,
  profile,
});

const RIBBED: Record<string, KiraDesignEntry> = {
  'RIF-1': { type: 'flutes', pattern: 'частые тонкие канавки во всё лицо', design: design(ribs(12, 3, 1, 'v')) },
  'RIF-2': { type: 'flutes', pattern: 'выпуклые рейки во всё лицо', design: design(ribs(19, 19, 3, 'reed')) },
  'RIF-3': { type: 'flutes', pattern: 'узкие канавки с шагом ~14 мм во всё лицо', design: design(ribs(14, 4, 1.5, 'v')) },
  'RIF-4': { type: 'flutes', pattern: 'тонкие канавки с шагом ~17 мм во всё лицо', design: design(ribs(17, 3, 1, 'v')) },
  'RIF-5': { type: 'flutes', pattern: 'редкие тонкие канавки во всё лицо', design: design(ribs(26, 4, 1.5, 'v')) },
  'RIF-6': { type: 'flutes', pattern: 'частые глубокие выпуклые рейки во всё лицо', design: design(ribs(18, 18, 3.5, 'reed')) },
  'RIF-7': { type: 'flutes', pattern: 'широкие пологие рейки во всё лицо', design: design(ribs(33, 33, 2.5, 'reed')) },
  'RIF-8': { type: 'flutes', pattern: 'частые глубокие узкие канавки во всё лицо', design: design(ribs(10, 3, 1.5, 'v')) },
  'RIF-9': {
    type: 'flutes',
    pattern: 'парные тонкие линии с шагом ~30 мм во всё лицо',
    design: design(ribs(30, 3, 1.2, 'v'), ribs(30, 3, 1.2, 'v', box(0, -12, -6, -6))),
  },
  'RIF-10': {
    type: 'flutes',
    pattern: 'три зоны реек, сходящиеся в точку: сверху наклонные, слева вертикальные, справа горизонтальные',
    design: design(
      {
        op: 'flutes',
        area: { poly: [[f(-0.02), f(-0.02)], [f(1.02), f(-0.02)], [f(1.02), f(0.48)], [f(0.58), f(0.655)], [f(-0.02), f(0.355)]] },
        dir: 45,
        pitch: 12,
        w: 12,
        depth: 2,
        profile: 'reed',
      },
      {
        op: 'flutes',
        area: { poly: [[f(-0.02), f(0.355)], [f(0.58), f(0.655)], [f(0.13), f(1.02)], [f(-0.02), f(1.02)]] },
        dir: 'v',
        pitch: 12,
        w: 12,
        depth: 2,
        profile: 'reed',
      },
      {
        op: 'flutes',
        area: { poly: [[f(0.58), f(0.655)], [f(1.02), f(0.48)], [f(1.02), f(1.02)], [f(0.13), f(1.02)]] },
        dir: 'h',
        pitch: 12,
        w: 12,
        depth: 2,
        profile: 'reed',
      },
    ),
    notReproduced: 'наклон верхних реек — 45° при любой пропорции фасада',
  },
  'PR-4': {
    type: 'steps',
    pattern: 'пять вложенных ступеней к полю',
    design: design(
      ...[0, 1, 2, 3, 4].map((k) => level(box(54 + 15 * k, 54 + 15 * k, 67 + 20 * k, 67 + 20 * k), k + 1, 2, 'ovolo')),
    ),
  },
  'PR-6': {
    type: 'flutes',
    pattern: 'две тонкие наклонные линии и полоса вертикальных реек между параллельными наклонными',
    design: design(
      groove([line(f(-0.02), f(0.305), f(0.555), f(-0.02)), line(f(-0.02), f(0.775), f(1.02), f(0.226))], 4, 1.5, 'v'),
      {
        op: 'flutes',
        area: { poly: [[f(-0.02), f(0.775)], [f(1.02), f(0.226)], [f(1.02), f(0.684)], [f(0.405), f(1.02)], [f(-0.02), f(1.02)]] },
        dir: 'v',
        pitch: 9,
        w: 9,
        depth: 2,
        profile: 'reed',
      },
    ),
  },
  'PR-8': {
    type: 'flutes',
    pattern: 'рейки вдоль наклона в верхнем левом и нижнем правом углах, тонкая линия посередине',
    design: design(
      {
        op: 'flutes',
        area: { poly: [[f(-0.02), f(-0.02)], [f(1.02), f(-0.02)], [f(1.02), f(0.01)], [f(-0.02), f(0.51)]] },
        dir: 40,
        pitch: 10,
        w: 10,
        depth: 2,
        profile: 'reed',
      },
      groove([line(f(-0.02), f(0.87), f(1.02), f(0.38))], 4, 1.5, 'v'),
      {
        op: 'flutes',
        area: { poly: [[f(0.45), f(1.02)], [f(1.02), f(1.02)], [f(1.02), f(0.73)]] },
        dir: 40,
        pitch: 10,
        w: 10,
        depth: 2,
        profile: 'reed',
      },
    ),
    notReproduced: 'наклон реек — 40° при любой пропорции фасада',
  },
  'PR-13': {
    type: 'steps',
    pattern: 'три ступени у самого края, поле ровное',
    design: design(
      level(box(28, 28, 34, 34), 1, 2.5, 'ovolo'),
      level(box(46, 46, 52, 52), 2, 2.5, 'ovolo'),
      level(box(64, 64, 70, 70), 3, 2.5, 'ovolo'),
    ),
  },
};

/* ─────────────────────────  витрины  ───────────────────────── */

/**
 * Рама витрины: окно со шпросами, края окна — профилем. Ставится только на
 * модуль-витрину (`vitrineFrameRefusal`): прежний вариант со стеклом или витрину из панели.
 */
const vitrine = (opening: ReliefShape, rim: ReliefShape, bars: ReliefPath[], barW: number): ReliefDesign =>
  design(level(rim, 3, 8, 'cove'), { op: 'cut', shape: opening, ...(bars.length ? { bars: { paths: bars, w: barW } } : {}) });

const GLASS: Record<string, KiraDesignEntry> = {
  V2: {
    type: 'vitrine',
    pattern: 'рама под стекло, крестовина на четыре окна',
    design: vitrine(box(66, 66, 62, 70), box(56, 56, 52, 60), [vline(f(0.5)), hline(f(0.485))], 17),
  },
  V3: {
    type: 'vitrine',
    pattern: 'рама под стекло, шпросы ромбами',
    design: vitrine(
      box(64, 64, 58, 64),
      box(54, 54, 48, 54),
      [
        line(f(0.5), f(0.07), f(0.2), f(0.28)),
        line(f(0.2), f(0.28), f(0.5), f(0.5)),
        line(f(0.5), f(0.5), f(0.2), f(0.72)),
        line(f(0.2), f(0.72), f(0.5), f(0.93)),
        line(f(0.5), f(0.07), f(0.8), f(0.28)),
        line(f(0.8), f(0.28), f(0.5), f(0.5)),
        line(f(0.5), f(0.5), f(0.8), f(0.72)),
        line(f(0.8), f(0.72), f(0.5), f(0.93)),
      ],
      12,
    ),
    notReproduced: 'короткие шпросы у верхнего края окна',
  },
  V4: {
    type: 'vitrine',
    pattern: 'рама под стекло со скосом, крестовина на четыре окна',
    design: design(level(box(48, 48, 46, 52), 3, 14, 'bevel'), {
      op: 'cut',
      shape: box(64, 64, 62, 68),
      bars: { paths: [vline(f(0.5)), hline(f(0.44))], w: 16 },
    }),
  },
  V5: {
    type: 'vitrine',
    pattern: 'рама под стекло, два «икса» и перекладина посередине',
    design: vitrine(
      box(60, 60, 50, 56),
      box(50, 50, 40, 46),
      [
        hline(f(0.5)),
        line(f(0.14), f(0.06), f(0.86), f(0.5)),
        line(f(0.86), f(0.06), f(0.14), f(0.5)),
        line(f(0.14), f(0.5), f(0.86), f(0.94)),
        line(f(0.86), f(0.5), f(0.14), f(0.94)),
      ],
      12,
    ),
  },
  V6: {
    type: 'vitrine',
    pattern: 'широкая рама со скосом, шпросы: центральный прямоугольник, перемычки к раме сверху, снизу и по две с боков',
    design: design(level(box(46, 46, 40, 40), 3, 24, 'bevel'), {
      op: 'cut',
      shape: box(86, 86, 72, 72),
      bars: {
        paths: [
          outline(box(f(0.4), f(0.4), f(0.222), f(0.224))),
          line(f(0.5), f(0.05), f(0.5), f(0.222), 'square'),
          line(f(0.5), f(0.776), f(0.5), f(0.95), 'square'),
          line(f(0.1), f(0.404), f(0.4), f(0.404), 'square'),
          line(f(0.1), f(0.59), f(0.4), f(0.59), 'square'),
          line(f(0.6), f(0.404), f(0.9), f(0.404), 'square'),
          line(f(0.6), f(0.59), f(0.9), f(0.59), 'square'),
        ],
        w: 12,
      },
    }),
  },
};

/* ─────────────────────────  интегрированные ручки  ───────────────────────── */

/** Полоса у верхней кромки во всю ширину: от кромки вниз на `to` мм. */
const topBand = (to: number) => box(-50, -50, -50, f(1, -to));

const HANDLES: Record<string, KiraDesignEntry> = {
  'IR-1': {
    type: 'handle',
    pattern: 'ручка-канал во всю ширину под верхней губой, нижняя стенка скосом',
    design: { grip: 'edge', layers: [level(topBand(52), 8, 18, 'bevel'), level(topBand(12), 0, 0.6, 'step')] },
  },
  'IR-2': {
    type: 'handle',
    pattern: 'ручка-выборка по верхней кромке во всю ширину',
    design: { grip: 'edge', layers: [level(topBand(22), 7, 6, 'cove')] },
  },
  'IR-3': {
    type: 'handle',
    pattern: 'глубокий скруглённый канал во всю ширину под верхней губой',
    design: { grip: 'edge', layers: [level(topBand(48), 8, 12, 'cove'), level(topBand(10), 0, 0.6, 'step')] },
  },
  'IR-4': {
    type: 'handle',
    pattern: 'серповидная выемка у верхней кромки',
    design: { grip: 'corner', layers: [level({ ellipse: [f(0.6), -12, 75, 42] }, 7, 12, 'cove')] },
  },
  'IR-5': {
    type: 'handle',
    pattern: 'длинная выемка у верхней кромки со скруглёнными концами',
    design: { grip: 'edge', layers: [level(box(f(0.2), f(0.15), -20, f(1, -26), { corner: 'round', r: 10 }), 6, 3, 'cove')] },
  },
  'IR-6': {
    type: 'handle',
    pattern: 'трапециевидная выемка у верхней кромки',
    design: {
      grip: 'corner',
      layers: [level({ poly: [[f(0.36), -10], [f(0.74), -10], [f(0.68), 26], [f(0.42), 26]] }, 6, 4, 'cove')],
    },
  },
  'IR-7': {
    type: 'handle',
    pattern: 'короткая трапециевидная выемка у верхней кромки',
    design: {
      grip: 'corner',
      layers: [level({ poly: [[f(0.47), -10], [f(0.75), -10], [f(0.71), 22], [f(0.51), 22]] }, 6, 4, 'cove')],
    },
  },
};

export const KIRA_DESIGNS: Record<string, KiraDesignEntry> = {
  ...SIMPLE,
  ...CUTOUT,
  ...ORNAMENT,
  ...RIBBED,
  ...GLASS,
  ...HANDLES,
};
