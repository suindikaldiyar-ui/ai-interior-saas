import type { HardwareItem } from '@/types/catalog';

/**
 * ПАНТОГРАФ (ГАРДЕРОБНЫЙ ЛИФТ) — МЕХАНИЗМ, А НЕ ПАЛКА (решение владельца 2026-11-01, п. 3).
 *
 * Häfele Vitaflex (805.20.xxx, 805.19.xxx), «КОМПАКТ 2025», pdf 125 / печ. 125. На каждой
 * боковине отсека — корпус механизма (демпфер «вверх и вниз»), в нём ось тяги; две тяги
 * поворачиваются вокруг своих осей СИНХРОННО — их концы держит одна штанга; ручка висит на
 * середине штанги. Штанга идёт по дуге: вниз и вперёд, без поворота.
 *
 * Напечатано (монтаж в середине боковой стенки шкафа): штанга поднятого лифта — на 30 мм ниже
 * крыши и на 250 мм от задней стенки; опущенная — на 365 мм перед корпусом и на 830 мм ниже
 * крыши; торец штанги — 30 мм от боковины, корпус механизма — 68 мм от боковины; ширины
 * корпуса в свету 440–610, 600–1000, 770–1200; нагрузка 10 кг; поворот тяги 90° (лифт 805.11
 * на той же странице). Отсюда ось и длина тяги ВЫВОДЯТСЯ, а не задаются: ось — вершина
 * прямого угла над хордой «поднята — опущена» внутрь шкафа (`pantographGeometry`).
 *
 * Снято с фото и чертежа (вид, не производственный размер): корпус механизма 140 × 230,
 * тяга 26 × 10 с изгибом, штанга Ø 25, ручка. Присадку механизма каталог не печатает —
 * отверстий нет, словами.
 */

export type PantographFinish = 'white' | 'grey' | 'black' | 'brown' | 'anthracite';

export const VITAFLEX_PRINTED = {
  source: 'Häfele «КОМПАКТ 2025», pdf 125 / печ. 125',
  railBelowTopMm: 30,
  railFromBackMm: 250,
  lowerForwardMm: 365,
  lowerBelowTopMm: 830,
  railFromSideMm: 30,
  housingFromSideMm: 68,
  /** Поворот тяги — напечатан у лифта 805.11 той же страницы. */
  swingDeg: 90,
  loadKg: 10,
} as const;

export const VITAFLEX_TRACE = {
  housingDepthMm: 140,
  housingHeightMm: 230,
  /** Ось тяги — на высоте ниже верха корпуса. */
  pivotBelowHousingTopMm: 40,
  armWidthMm: 26,
  armThicknessMm: 10,
  /** Изгиб тяги (S) — смещение середины от прямой, мм. */
  armBendMm: 18,
  railDiameterMm: 25,
  handleRodDiameterMm: 12,
  handleLengthMm: 300,
  handleGripLengthMm: 120,
  handleGripDiameterMm: 22,
} as const;

/** Колонки таблицы: ширина корпуса в свету. */
const WIDTHS: Record<'a' | 'b' | 'c', [number, number]> = { a: [440, 610], b: [600, 1000], c: [770, 1200] };

/** Строки таблицы pdf 125: цвет корпуса и тяг, покрытие штанги и ручки — напечатаны у артикула. */
type Row = { body: PantographFinish; rail: 'chrome' | 'body'; handle: 'chrome' | 'body'; words: string; cols: Record<'a' | 'b' | 'c', string> };
const ROWS: Row[] = [
  { body: 'white', rail: 'body', handle: 'body', words: 'белый', cols: { a: '805.20.625', b: '805.20.632', c: '805.20.657' } },
  { body: 'grey', rail: 'body', handle: 'body', words: 'серый', cols: { a: '805.20.525', b: '805.20.532', c: '805.20.557' } },
  { body: 'black', rail: 'chrome', handle: 'chrome', words: 'чёрный, ручка и штанга хромированные', cols: { a: '805.20.024', b: '805.20.031', c: '805.20.055' } },
  { body: 'black', rail: 'chrome', handle: 'body', words: 'чёрный, штанга хромированная', cols: { a: '805.19.224', b: '805.19.231', c: '805.19.255' } },
  { body: 'white', rail: 'chrome', handle: 'chrome', words: 'белый, ручка и штанга хромированные', cols: { a: '805.20.824', b: '805.20.831', c: '805.20.855' } },
  { body: 'brown', rail: 'chrome', handle: 'chrome', words: 'коричневый, ручка и штанга хромированные', cols: { a: '805.20.125', b: '805.20.132', c: '805.20.157' } },
  { body: 'anthracite', rail: 'chrome', handle: 'chrome', words: 'антрацит, ручка и штанга хромированные', cols: { a: '805.20.225', b: '805.20.232', c: '805.20.257' } },
];

export type PantographSpec = {
  key: string;
  article: string;
  widthMm: [number, number];
  body: PantographFinish;
  rail: 'chrome' | 'body';
  handle: 'chrome' | 'body';
  finishWords: string;
  /** Отделка — вид поверх исполнения артикула (фаза 3): тогда материал матовый, а слова говорят это. */
  visualFinish?: 'black_matte';
  status: 'VISUAL_RECONSTRUCTION';
  words: string;
};

/** Модель пантографа по артикулу: только напечатанные в таблице pdf 125 — остальные без модели. */
export function pantographSpecOf(item: HardwareItem | null | undefined): PantographSpec | null {
  const h = item?.hardware;
  if (!h || h.manufacturer !== 'Häfele') return null;
  const article = h.manufacturerArticle ?? '';
  for (const row of ROWS) {
    for (const col of ['a', 'b', 'c'] as const) {
      if (row.cols[col] !== article) continue;
      return {
        key: `vitaflex:${article}`,
        article,
        widthMm: WIDTHS[col],
        body: row.body,
        rail: row.rail,
        handle: row.handle,
        finishWords: row.words,
        status: 'VISUAL_RECONSTRUCTION',
        words: `Пантограф Häfele Vitaflex ${article} — визуальная реконструкция по каталогу (${VITAFLEX_PRINTED.source}): напечатаны положения штанги поднятой и опущенной, поворот 90°, ширина отсека ${WIDTHS[col][0]}–${WIDTHS[col][1]} мм, нагрузка 10 кг, исполнение «${row.words}»; ось тяги выведена из них; корпус механизма, тяга и ручка — по фото, не CAD производителя.`,
      };
    }
  }
  return null;
}

/** Точка в плоскости хода: z — от передней кромки корпуса (внутрь — минус), y — от дна корпуса. */
export type ZY = { z: number; y: number };

export type PantographGeometry = {
  /** Ось тяги (у обеих сторон одна и та же точка в плоскости хода). */
  pivot: ZY;
  armMm: number;
  raised: ZY;
  lowered: ZY;
  /** Направление поворота: угол тяги (рад) от поднятой к опущенной. */
  swingRad: number;
  /** Торцы штанги и плоскости тяг и корпусов по ширине (от левого края модуля). */
  railFromMm: number;
  railToMm: number;
  sides: { x: number; inward: 1 | -1 }[];
  /** Корпус механизма в плоскости хода. */
  housing: { z0: number; z1: number; y0: number; y1: number };
  refusal: string | null;
};

const rot = (v: ZY, a: number): ZY => ({ z: v.z * Math.cos(a) - v.y * Math.sin(a), y: v.z * Math.sin(a) + v.y * Math.cos(a) });

/**
 * ГЕОМЕТРИЯ ЛИФТА В ОТСЕКЕ: напечатанные положения штанги → ось и длина тяги. `topMm` — низ
 * крыши (верх отсека) от дна корпуса, `depthMm` — глубина корпуса (задняя стенка на −depth),
 * `x0Mm…x1Mm` — отсек в свету от левого края модуля.
 */
export function pantographGeometry(bay: { topMm: number; depthMm: number; x0Mm: number; x1Mm: number }): PantographGeometry {
  const P = VITAFLEX_PRINTED;
  const raised: ZY = { z: -bay.depthMm + P.railFromBackMm, y: bay.topMm - P.railBelowTopMm };
  const lowered: ZY = { z: P.lowerForwardMm, y: bay.topMm - P.lowerBelowTopMm };
  const chord = { z: lowered.z - raised.z, y: lowered.y - raised.y };
  const len = Math.hypot(chord.z, chord.y);
  const half = (P.swingDeg * Math.PI) / 360;
  /* Ось — над хордой на (len/2)/tan(половины угла), со стороны корпуса (внутрь и вниз). */
  const h = len / 2 / Math.tan(half);
  const mid = { z: (raised.z + lowered.z) / 2, y: (raised.y + lowered.y) / 2 };
  const n1 = { z: -chord.y / len, y: chord.z / len };
  const candidates = [n1, { z: -n1.z, y: -n1.y }].map((n) => ({ z: mid.z + n.z * h, y: mid.y + n.y * h }));
  const pivot = candidates.sort((a, b) => a.z - b.z)[0];
  const armMm = Math.hypot(raised.z - pivot.z, raised.y - pivot.y);
  const a0 = Math.atan2(raised.y - pivot.y, raised.z - pivot.z);
  const a1 = Math.atan2(lowered.y - pivot.y, lowered.z - pivot.z);
  let swingRad = a1 - a0;
  while (swingRad > Math.PI) swingRad -= 2 * Math.PI;
  while (swingRad < -Math.PI) swingRad += 2 * Math.PI;
  const T = VITAFLEX_TRACE;
  const housing = {
    z0: pivot.z - T.housingDepthMm / 2,
    z1: pivot.z + T.housingDepthMm / 2,
    y0: pivot.y + T.pivotBelowHousingTopMm - T.housingHeightMm,
    y1: pivot.y + T.pivotBelowHousingTopMm,
  };
  let refusal: string | null = null;
  if (lowered.y < 0) refusal = `Отсек низкий: опущенная штанга встала бы на ${Math.round(-lowered.y)} мм ниже дна (штанга опускается на ${P.lowerBelowTopMm} мм от крыши)`;
  else if (pivot.z < -bay.depthMm || housing.z0 < -bay.depthMm) refusal = `Корпус неглубокий: корпус механизма вышел бы за заднюю стенку на ${Math.round(-bay.depthMm - Math.min(pivot.z, housing.z0))} мм`;
  else if (housing.z1 > 0) refusal = `Корпус неглубокий: корпус механизма вышел бы за переднюю кромку на ${Math.round(housing.z1)} мм`;
  return {
    pivot,
    armMm,
    raised,
    lowered,
    swingRad,
    railFromMm: bay.x0Mm + P.railFromSideMm,
    railToMm: bay.x1Mm - P.railFromSideMm,
    sides: [
      { x: bay.x0Mm, inward: 1 },
      { x: bay.x1Mm, inward: -1 },
    ],
    housing,
    refusal,
  };
}

/** Поза при доле хода `s` (0 — поднят, 1 — опущен): угол тяги и центр штанги в плоскости хода. */
export function pantographPose(geom: PantographGeometry, s: number): { armRad: number; rail: ZY } {
  const t = Math.max(0, Math.min(1, s));
  const armRad = geom.swingRad * t;
  const r = rot({ z: geom.raised.z - geom.pivot.z, y: geom.raised.y - geom.pivot.y }, armRad);
  return { armRad, rail: { z: geom.pivot.z + r.z, y: geom.pivot.y + r.y } };
}

/** Препятствие хода в плоскости отсека: полка, перегородка, другая штанга. */
export type SweepObstacle = { what: string; z0: number; z1: number; y0: number; y1: number };

/**
 * ХОД ЛИФТА ВНУТРИ ШКАФА: штанга (с радиусом) и тяга на всём ходу против полок, перегородок
 * и других штанг отсека. Шаг 1°. Возвращает первое задевание словами с миллиметрами.
 */
export function pantographSweep(geom: PantographGeometry, obstacles: SweepObstacle[]): { clash: string | null; minClearMm: number } {
  const r = VITAFLEX_TRACE.railDiameterMm / 2;
  const steps = Math.max(8, Math.round((Math.abs(geom.swingRad) * 180) / Math.PI));
  let minClear = Infinity;
  for (let i = 0; i <= steps; i += 1) {
    const pose = pantographPose(geom, i / steps);
    for (const o of obstacles) {
      /* Штанга — окружность r. */
      const dz = Math.max(o.z0 - pose.rail.z, 0, pose.rail.z - o.z1);
      const dy = Math.max(o.y0 - pose.rail.y, 0, pose.rail.y - o.y1);
      const gap = Math.hypot(dz, dy) - r;
      /* Тяга — отрезок от оси до штанги (полуширина тяги). */
      let armGap = Infinity;
      for (let k = 0; k <= 20; k += 1) {
        const p = { z: geom.pivot.z + ((pose.rail.z - geom.pivot.z) * k) / 20, y: geom.pivot.y + ((pose.rail.y - geom.pivot.y) * k) / 20 };
        const qz = Math.max(o.z0 - p.z, 0, p.z - o.z1);
        const qy = Math.max(o.y0 - p.y, 0, p.y - o.y1);
        armGap = Math.min(armGap, Math.hypot(qz, qy) - VITAFLEX_TRACE.armWidthMm / 2);
      }
      const g = Math.min(gap, armGap);
      if (g < minClear) minClear = g;
      if (g < 0) {
        const deg = Math.round((Math.abs(geom.swingRad) * 180 * i) / steps / Math.PI);
        return { clash: `${o.what} в зоне хода пантографа: ${gap < armGap ? 'штанга' : 'тяга'} заходит в неё на ${Math.round(-g)} мм при опускании на ${deg}°`, minClearMm: g };
      }
    }
  }
  return { clash: null, minClearMm: minClear };
}

/**
 * ЛИФТ В ОТСЕКЕ ШКАФА — одна функция на сцену и проверку места (`fittingVerdict`): геометрия
 * по конверту модуля и что стоит на пути — полки, перегородки и блок ящиков ЭТОГО отсека
 * (штанги отсека лифт заменяет). Полка — от задней стенки на свою глубину.
 */
export function bayPantograph(
  layout: { envelope: { heightMm: number; depthMm: number; thicknessMm: number } },
  bay: {
    xFromMm: number;
    xToMm: number;
    shelves: { atMm: number; depthMm: number; thicknessMm: number }[];
    dividers: { yFromMm: number; yToMm: number; depthMm: number }[];
    drawerStack: { fromMm: number; toMm: number } | null;
  },
): { geom: PantographGeometry; obstacles: SweepObstacle[] } {
  const env = layout.envelope;
  const geom = pantographGeometry({ topMm: env.heightMm - env.thicknessMm, depthMm: env.depthMm, x0Mm: bay.xFromMm, x1Mm: bay.xToMm });
  const back = -env.depthMm;
  const obstacles: SweepObstacle[] = [
    ...bay.shelves.map((s) => ({ what: `Полка на ${Math.round(s.atMm)} мм`, z0: back, z1: back + s.depthMm, y0: s.atMm - s.thicknessMm / 2, y1: s.atMm + s.thicknessMm / 2 })),
    ...bay.dividers.map((d) => ({ what: `Перегородка на ${Math.round(d.yFromMm)} мм`, z0: back, z1: back + d.depthMm, y0: d.yFromMm, y1: d.yToMm })),
    ...(bay.drawerStack ? [{ what: `Блок ящиков до ${Math.round(bay.drawerStack.toMm)} мм`, z0: back, z1: 0, y0: bay.drawerStack.fromMm, y1: bay.drawerStack.toMm }] : []),
  ];
  return { geom, obstacles };
}
