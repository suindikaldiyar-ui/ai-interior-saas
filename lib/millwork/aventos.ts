import type { HardwareItem } from '@/types/catalog';
import { linkagePose, rotate, type FourBar, type Pt } from './hingeLinkage';

/**
 * ПОДЪЁМНИКИ BLUM AVENTOS МЕХАНИЗМОМ — HK top, HS top, HL top (решение владельца 2026-11-01, п. 4).
 *
 * Без three. Оси (мм) — оси механизма: Z — вперёд от передней кромки корпуса, Y — вверх от низа
 * крыши (`[z, y]`). Крыша — Y ∈ [0, толщина]. Тыл закрытого фасада — Z = 0, как в сцене (Blum рисует
 * у HK top 1,5 мм между фасадом и кромкой — не применён, как FS у CLIP top). Фасад — шатун: его поза
 * при доле хода u — поворот на θ вокруг начала осей и перенос (`aventosPose`); точка фасада q идёт в
 * `rotate(q, θ) + shift`. Механизм у каждой боковины одинаковый.
 *
 * ЧТО НАПЕЧАТАНО, ЧТО СНЯТО, ЧТО ВЫВЕДЕНО. Напечатано (каталог Blum 2024-2025) — угол, необходимое
 * пространство, крепление фасада, корпус у боковины; это — `*_PRINTED`. Снято с чертежа масштабом — вид
 * корпуса механизма (`*_TRACE`). Выведено из напечатанного — ось поворота HK top, дуга HL top; подобрано
 * под напечатанное — оси рычагов (CAD Blum — за входом, его в проекте нет). Ход — визуальная
 * реконструкция механизма, статус VISUAL_RECONSTRUCTION; присадка, раскрой и смета его не читают.
 */

export type AventosFamily = 'HK top' | 'HS top' | 'HL top';

/** Рычаг из двух жёстких звеньев: ось в корпусе, колено, ось на креплении фасада. */
export type AventosDyad = { g: Pt; p0: Pt; l1: number; l2: number; branch: 0 | 1 };

export type AventosMotion =
  /** Поворот фасада вокруг оси механизма (HK top): ось выведена из напечатанного; рычаг — `dyad`. */
  | { kind: 'axis'; centerMm: Pt; dyad: AventosDyad }
  /** Четырёхзвенник (HS top): оси подобраны под две напечатанные позы — закрытую и открытую. */
  | { kind: 'fourbar'; bar: FourBar }
  /** Параллелограмм (HL top): фасад не поворачивается, идёт по дуге; радиус и дуга — из a, b, c. */
  | { kind: 'parallel'; armMm: number; pivotMm: Pt; startRad: number; sweepRad: number; secondMm: Pt };

export type AventosModel = {
  key: string;
  family: AventosFamily;
  /** Комплект рычагов (HL top) — по высоте корпуса из таблицы. */
  armSet?: string;
  motion: AventosMotion;
  /** Угол фасада в конце хода, градусы (у HL top — 0: фасад не поворачивается). */
  openDeg: number;
  /** Корпус механизма у боковины (мм осей механизма) и его толщина от боковины. */
  housing: { z0: number; z1: number; y0: number; y1: number; sideMm: number };
  /** Крепление фасада: саморезы под низом крыши (мм), их Z от тыла фасада — тело на тыле. */
  bracket: { screwsY: number[]; depthMm: number };
  source: string;
  status: 'VISUAL_RECONSTRUCTION';
  words: string;
};

/* ═════════════════════════════  HK top  ═════════════════════════════ */

/**
 * AVENTOS HK top (22K2300…22K2910, TIP-ON 22K2300T…22K2910T). Каталог Blum 2024-2025: заказ —
 * pdf 50 / печ. 46, проектирование — pdf 52 / печ. 48, TIP-ON — pdf 54 / печ. 50 (те же числа).
 */
export const HK_TOP_PRINTED = {
  openDeg: 107,
  minOpenDeg: 75,
  housingDepthMm: 187,
  housingDepthServoMm: 235,
  housingSideMm: 30,
  housingSideServoMm: 67,
  /** Верх корпуса — на 3 мм под крышей. */
  housingTopGapMm: 3,
  minInnerHeightMm: 173,
  /** Крепление фасада: первый саморез — 62 + FAo от верха фасада, шаг 32 / 32 / 32. */
  frontFixingMm: 62,
  screwPitchMm: 32,
  faoMaxMm: 25.4,
  /** Необходимое пространство при максимальном угле: Y = FH · 0,29 + FD − SOB (от верха крыши). */
  yOf: (fhMm: number, fdMm: number, sobMm: number) => fhMm * 0.29 + fdMm - sobMm,
  /** Декоративная панель на крыше: X по толщине фасада FD. */
  xByFd: [
    [16, 68],
    [19, 57],
    [22, 47],
    [26, 33],
    [28, 27],
  ] as const,
} as const;

/** Снято с чертежа pdf 52 («Необходимое пространство», масштаб по 187): высота корпуса механизма. */
export const HK_TOP_TRACE = { housingHeightMm: 92 } as const;

/**
 * ОСЬ ПОВОРОТА ФАСАДА HK top — ВЫВЕДЕНА ИЗ НАПЕЧАТАННОГО (не подобрана глазом).
 *
 * Фасад при максимальном угле 107° по формуле Y поднимается на FH · 0,29 + FD над низом крыши
 * (Y — от её верха, SOB 16): тыл верхней кромки остаётся на уровне низа крыши. Таблица X (FD 16…28 →
 * 68…27) падает на 3,42 мм на миллиметр фасада = 1 / sin 17°: так меряется лицо фасада, наклонённого
 * на 107° − 90°, где он проходит верх декоративной панели на крыше. Обе связи сходятся на одной оси,
 * неподвижной относительно корпуса: на уровне верха крыши (верхняя кромка фасада при открывании не
 * уходит назад — иначе задела бы крышу) и в 15,86 мм перед кромкой. С панелью 16 мм таблица X
 * воспроизводится до 0,7 мм у всех пяти толщин — проверка HK2.
 *
 * Простой четырёхзвенник с осями в корпусе такой ход не даёт (серединные перпендикуляры поз уходят
 * над крышей) — рычаг рисуется двумя жёсткими звеньями (`HK_TOP_ARM`), колено — расчёт по длинам.
 */
export const HK_TOP_AXIS: Pt = [15.86, 16];

/**
 * РЫЧАГ HK top — ПОДОБРАН (не напечатан): ось у передней кромки корпуса (6 мм за ней, 17 под крышей),
 * ось на креплении фасада у первого самореза (30 мм за тылом, 60 под крышей), звенья 54,9 и 55 мм.
 * На всём ходу 0…107° звенья не заходят ни в крышу, ни в фасад; в закрытом колено — в корпусе.
 */
export const HK_TOP_ARM: AventosDyad = { g: [-6.1, -16.64], p0: [-30.18, -60.21], l1: 54.93, l2: 55, branch: 0 };

/* ═════════════════════════════  HS top  ═════════════════════════════ */

/**
 * AVENTOS HS top (22S2200…22S2810). Каталог Blum 2024-2025, проектирование — pdf 40 / печ. 36.
 * Открытая поза напечатана: тыл верхней кромки — 57 мм за плоскостью корпуса и 140 мм над крышей;
 * та же грань фасада при FH 350 / 600 / 800 — на 277 / 516 / 707 вперёд и 36 / −39 / −99 по высоте
 * (одна прямая: 17,3° вниз от горизонтали, фасад повёрнут на 72,7°).
 */
export const HS_TOP_PRINTED = {
  open: { behindMm: 57, aboveTopMm: 140 },
  farEnds: [
    { fhMm: 350, forwardMm: 277, aboveMm: 36 },
    { fhMm: 600, forwardMm: 516, aboveMm: -39 },
    { fhMm: 800, forwardMm: 707, aboveMm: -99 },
  ],
  /** Крепление фасада: Z = 195 + FAo от верха фасада, шаг 32 / 32 / 32. */
  frontFixingMm: 195,
  screwPitchMm: 32,
  minInnerHeightMm: 307,
  minInnerDepthMm: 264,
  housingSideMm: 30,
  housingSideServoMm: 66,
  /** Корпус механизма: верх на 9,5, низ на 141 под крышей (чертёж «Необходимое пространство»). */
  housingTopMm: 9.5,
  housingBottomMm: 141,
} as const;

/** Угол открытого фасада HS top — из напечатанной прямой (140 − 36 по высоте на 277 + 57 вперёд). */
export const HS_TOP_OPEN_DEG = 90 - (Math.atan2(140 - 36, 277 + 57) * 180) / Math.PI;

/**
 * ЧЕТЫРЁХЗВЕННИК HS top — ПОДОБРАН под две напечатанные позы: оси на креплении фасада (A1, B1 —
 * у саморезов 195…209), оси в корпусе (A0, B0 — на серединных перпендикулярах поз, у передней кромки
 * корпуса под крышей). Фасад не заходит в корпус ни на одном шаге, звенья — под крышей, угол передачи
 * не меньше 55°. Это реконструкция механизма, а не CAD Blum: путь между позами — расчёт четырёхзвенника.
 */
export const HS_TOP_BAR: FourBar = {
  a0: [-27.21, -21.97],
  a1: [-44.97, -195.39],
  b0: [-6.14, -19.88],
  b1: [-20.38, -185.76],
};

/* ═════════════════════════════  HL top  ═════════════════════════════ */

/**
 * AVENTOS HL top (22L2200…22L2510) и комплекты рычагов 22L3200…22L3900. Каталог Blum 2024-2025,
 * проектирование — pdf 46 / печ. 42: a — фасад перед корпусом в конце хода, b (= Y) — подъём фасада,
 * c — наибольший вылет на ходу (зазоры F = 0); крепление фасада Z + FAo от верха фасада.
 */
export const HL_TOP_ARM_SETS = [
  { article: '22L3200', khMm: [300, 339], aMm: 112, bMm: 272.5, cMm: 155.5, zMm: 113, lhMinMm: 255 },
  { article: '22L3500', khMm: [340, 389], aMm: 140.5, bMm: 340, cMm: 195, zMm: 153, lhMinMm: 295 },
  { article: '22L3800', khMm: [390, 540], aMm: 176, bMm: 425, cMm: 245, zMm: 203, lhMinMm: 345 },
  { article: '22L3900', khMm: [480, 580], aMm: 214.5, bMm: 517, cMm: 297.5, zMm: 256, lhMinMm: 399 },
] as const;

export const HL_TOP_PRINTED = {
  housingSideMm: 30,
  housingSideServoMm: 66,
  /** Корпус механизма: верх на 4, низ на 141 под крышей. */
  housingTopMm: 4,
  housingBottomMm: 141,
  minInnerDepthMm: 264,
  screwPitchMm: 32,
} as const;

/** Снято с чертежей pdf 40 и 46 (масштаб по «min 264»): длина корпуса HS и HL у боковины. */
export const HS_HL_TRACE = { housingDepthMm: 240 } as const;

/**
 * ДУГА HL top — ВЫВЕДЕНА ИЗ a, b, c КОМПЛЕКТА. Фасад не поворачивается (фасад «поднимается
 * параллельно корпусу», с. 42): каждая его точка идёт по окружности одного радиуса — рычаги
 * параллелограмма. Конец хода (a, b) и наибольший вылет c дают радиус и центр: у всех четырёх
 * комплектов дуга начинается на −88° и проходит 131°, центр — на 6,6…9,7 мм за точкой (проверка HL1).
 */
export function hlArc(set: { aMm: number; bMm: number; cMm: number }): { r: number; center: Pt; startRad: number; sweepRad: number } {
  const { aMm: a, bMm: b, cMm: c } = set;
  /* Центр (cz, cy) от точки в закрытом: cz + r = c; cz² + cy² = r²; (a − cz)² + (b − cy)² = r². */
  const f = (r: number) => {
    const cz = c - r;
    const cy2 = r * r - cz * cz;
    if (cy2 < 0) return Number.NaN;
    const cy = Math.sqrt(cy2);
    return (a - cz) ** 2 + (b - cy) ** 2 - r * r;
  };
  /* Корень на малом радиусе: c/2 … 4c (второй корень — дуга в 14° с центром в метре за корпусом). */
  let lo = c / 2 + 1e-6;
  let hi = c * 4;
  let flo = f(lo);
  for (let i = 0; i < 200 && (Number.isNaN(flo) || flo > 0); i += 1) {
    lo += c / 400;
    flo = f(lo);
  }
  for (let i = 0; i < 100; i += 1) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Number.isNaN(fm) || (fm < 0) === (flo < 0)) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  const r = (lo + hi) / 2;
  const cz = c - r;
  const cy = Math.sqrt(Math.max(0, r * r - cz * cz));
  const startRad = Math.atan2(-cy, -cz);
  const endRad = Math.atan2(b - cy, a - cz);
  return { r, center: [cz, cy], startRad, sweepRad: endRad - startRad };
}

/** Комплект рычагов HL top по высоте корпуса; в перекрытии диапазонов — меньший (вес фасада не проверен). */
export function hlArmSetOf(cabinetHeightMm: number) {
  return HL_TOP_ARM_SETS.find((s) => cabinetHeightMm >= s.khMm[0] && cabinetHeightMm <= s.khMm[1]) ?? null;
}

/* ═════════════════════════════  модель позиции  ═════════════════════════════ */

const SOURCE_HK = 'Blum, каталог 2024-2025: pdf 50 / печ. 46, pdf 52 / печ. 48 (TIP-ON — pdf 54 / печ. 50)';
const SOURCE_HS = 'Blum, каталог 2024-2025: pdf 38 / печ. 34, pdf 40 / печ. 36';
const SOURCE_HL = 'Blum, каталог 2024-2025: pdf 44 / печ. 40, pdf 46 / печ. 42';

const screws = (first: number, pitch: number) => [0, 1, 2, 3].map((i) => -(first + i * pitch));

/**
 * МОДЕЛЬ AVENTOS ДЛЯ ПОЗИЦИИ НА МЕСТЕ: HK top, HS top, HL top Blum; у HL — комплект рычагов по высоте
 * корпуса (`cabinetHeightMm`). Остальные подъёмники (HK-S, HK-XS, HKi, HF top, DTC, Häfele) — `null`:
 * модели нет, и это сказано у позиции.
 */
export function aventosOf(item: HardwareItem | null | undefined, cabinetHeightMm?: number): AventosModel | null {
  const hw = item?.hardware;
  if (!hw || hw.manufacturer !== 'Blum' || hw.category !== 'lift') return null;
  const sub = hw.subcategory;
  if (sub === 'lift_hk_top' || sub === 'lift_hk_top_tip_on') {
    return {
      key: 'blum-aventos-hk-top',
      family: 'HK top',
      motion: { kind: 'axis', centerMm: HK_TOP_AXIS, dyad: HK_TOP_ARM },
      openDeg: HK_TOP_PRINTED.openDeg,
      housing: {
        z0: -HK_TOP_PRINTED.housingDepthMm,
        z1: 0,
        y0: -(HK_TOP_PRINTED.housingTopGapMm + HK_TOP_TRACE.housingHeightMm),
        y1: -HK_TOP_PRINTED.housingTopGapMm,
        sideMm: HK_TOP_PRINTED.housingSideMm,
      },
      bracket: { screwsY: screws(HK_TOP_PRINTED.frontFixingMm, HK_TOP_PRINTED.screwPitchMm), depthMm: 34 },
      source: SOURCE_HK,
      status: 'VISUAL_RECONSTRUCTION',
      words:
        'AVENTOS HK top: фасад поворачивается до 107° (pdf 50) вокруг оси, выведенной из напечатанного «необходимого пространства» (Y и таблица X, pdf 52); рычаг — два жёстких звена, оси подобраны; механизм корпуса (пружина, ограничитель угла) не воспроизводится',
    };
  }
  if (sub === 'lift_hs_top') {
    return {
      key: 'blum-aventos-hs-top',
      family: 'HS top',
      motion: { kind: 'fourbar', bar: HS_TOP_BAR },
      openDeg: HS_TOP_OPEN_DEG,
      housing: {
        z0: -HS_HL_TRACE.housingDepthMm,
        z1: 0,
        y0: -HS_TOP_PRINTED.housingBottomMm,
        y1: -HS_TOP_PRINTED.housingTopMm,
        sideMm: HS_TOP_PRINTED.housingSideMm,
      },
      bracket: { screwsY: screws(HS_TOP_PRINTED.frontFixingMm, HS_TOP_PRINTED.screwPitchMm), depthMm: 48 },
      source: SOURCE_HS,
      status: 'VISUAL_RECONSTRUCTION',
      words:
        'AVENTOS HS top: фасад поднимается и ложится над корпусом — в конце хода тыл верхней кромки на 57 мм за корпусом и 140 мм над крышей, наклон 72,7° (pdf 40); рычаги — четырёхзвенник, оси подобраны под обе позы',
    };
  }
  if (sub === 'lift_hl_top') {
    const set = cabinetHeightMm !== undefined ? hlArmSetOf(cabinetHeightMm) : null;
    if (!set) return null;
    const arc = hlArc(set);
    /* Ось на креплении фасада — у нижнего самореза (Z + 3 · 32 под крышей), 25 мм за тылом фасада. */
    const p0: Pt = [-25, -(set.zMm + 3 * HL_TOP_PRINTED.screwPitchMm)];
    const pivot: Pt = [p0[0] + arc.center[0], p0[1] + arc.center[1]];
    return {
      key: `blum-aventos-hl-top-${set.article}`,
      family: 'HL top',
      armSet: set.article,
      motion: { kind: 'parallel', armMm: arc.r, pivotMm: pivot, startRad: arc.startRad, sweepRad: arc.sweepRad, secondMm: [-22, 22] },
      openDeg: 0,
      housing: {
        z0: -HS_HL_TRACE.housingDepthMm,
        z1: 0,
        y0: -HL_TOP_PRINTED.housingBottomMm,
        y1: -HL_TOP_PRINTED.housingTopMm,
        sideMm: HL_TOP_PRINTED.housingSideMm,
      },
      bracket: { screwsY: screws(set.zMm, HL_TOP_PRINTED.screwPitchMm), depthMm: 34 },
      source: SOURCE_HL,
      status: 'VISUAL_RECONSTRUCTION',
      words: `AVENTOS HL top, рычаги ${set.article} (по высоте корпуса, вес фасада не проверен): фасад поднимается параллельно корпусу на ${set.bMm} мм и выходит на ${set.aMm} мм (наибольший вылет ${set.cMm}, pdf 46); рычаги — параллелограмм, радиус ${arc.r.toFixed(0)} мм выведен из a, b, c`,
    };
  }
  return null;
}

/* ═════════════════════════════  поза  ═════════════════════════════ */

/** Поза фасада при доле хода u ∈ [0, 1]: точка q (закрытое, мм) → `rotate(q, theta) + shift`. */
export function aventosPose(model: AventosModel, u: number): { theta: number; shift: Pt } {
  const s = Math.max(0, Math.min(1, u));
  const m = model.motion;
  if (m.kind === 'axis') {
    const theta = s * ((model.openDeg * Math.PI) / 180);
    const r = rotate(m.centerMm, theta);
    return { theta, shift: [m.centerMm[0] - r[0], m.centerMm[1] - r[1]] };
  }
  if (m.kind === 'fourbar') {
    const pose = linkagePose({ bar: m.bar, openDeg: model.openDeg }, s * ((model.openDeg * Math.PI) / 180));
    return { theta: pose.theta, shift: pose.shift };
  }
  /* Параллелограмм: перенос точки рычага по дуге, поворота нет. */
  const p0: Pt = [m.pivotMm[0] + m.armMm * Math.cos(m.startRad), m.pivotMm[1] + m.armMm * Math.sin(m.startRad)];
  const a = m.startRad + s * m.sweepRad;
  return { theta: 0, shift: [m.pivotMm[0] + m.armMm * Math.cos(a) - p0[0], m.pivotMm[1] + m.armMm * Math.sin(a) - p0[1]] };
}

/** Точка фасада (мм, закрытое положение) при доле хода. */
export function aventosPoint(model: AventosModel, u: number, q: Pt): Pt {
  const pose = aventosPose(model, u);
  const r = rotate(q, pose.theta);
  return [r[0] + pose.shift[0], r[1] + pose.shift[1]];
}

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (a: Pt) => Math.hypot(a[0], a[1]);

/** Колено двухзвенного рычага: пересечение окружностей, ветвь — своя у механизма (`branch`). */
function kneeOf(d: AventosDyad, p: Pt): Pt {
  const dd = len(sub(p, d.g));
  const a = (d.l1 * d.l1 - d.l2 * d.l2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, d.l1 * d.l1 - a * a));
  const m: Pt = [d.g[0] + (a * (p[0] - d.g[0])) / dd, d.g[1] + (a * (p[1] - d.g[1])) / dd];
  const s0: Pt = [m[0] + (h * (p[1] - d.g[1])) / dd, m[1] - (h * (p[0] - d.g[0])) / dd];
  const s1: Pt = [m[0] - (h * (p[1] - d.g[1])) / dd, m[1] + (h * (p[0] - d.g[0])) / dd];
  return d.branch === 0 ? s0 : s1;
}

export type AventosLink = { from: Pt; to: Pt; role: 'arm' | 'link' };

/**
 * ЗВЕНЬЯ МЕХАНИЗМА ПРИ ДОЛЕ ХОДА — одна функция на сцену и приёмку. У HK top колено — на одной ветви на
 * всём ходу (что она не перескакивает, меряет приёмка AV3), у HS top — оси четырёхзвенника, у HL top — два
 * параллельных рычага.
 */
export function aventosLinks(model: AventosModel, u: number): AventosLink[] {
  const m = model.motion;
  if (m.kind === 'axis') {
    const d = m.dyad;
    const p = aventosPoint(model, u, d.p0);
    const knee = kneeOf(d, p);
    return [
      { from: d.g, to: knee, role: 'arm' },
      { from: knee, to: p, role: 'link' },
    ];
  }
  if (m.kind === 'fourbar') {
    const pose = linkagePose({ bar: m.bar, openDeg: model.openDeg }, Math.max(0, Math.min(1, u)) * ((model.openDeg * Math.PI) / 180));
    return [
      { from: m.bar.a0, to: pose.a1, role: 'arm' },
      { from: m.bar.b0, to: pose.b1, role: 'link' },
    ];
  }
  const a = m.startRad + Math.max(0, Math.min(1, u)) * m.sweepRad;
  const tip: Pt = [m.pivotMm[0] + m.armMm * Math.cos(a), m.pivotMm[1] + m.armMm * Math.sin(a)];
  const g2: Pt = [m.pivotMm[0] + m.secondMm[0], m.pivotMm[1] + m.secondMm[1]];
  return [
    { from: m.pivotMm, to: tip, role: 'arm' },
    { from: g2, to: [tip[0] + m.secondMm[0], tip[1] + m.secondMm[1]], role: 'link' },
  ];
}

/** Оси звеньев на креплении фасада (закрытое положение) — они едут с фасадом. */
export function aventosFrontPivots(model: AventosModel): Pt[] {
  const m = model.motion;
  if (m.kind === 'axis') return [m.dyad.p0];
  if (m.kind === 'fourbar') return [m.bar.a1, m.bar.b1];
  const p0: Pt = [m.pivotMm[0] + m.armMm * Math.cos(m.startRad), m.pivotMm[1] + m.armMm * Math.sin(m.startRad)];
  return [p0, [p0[0] + m.secondMm[0], p0[1] + m.secondMm[1]]];
}

/**
 * ХОД ФАСАДА ПРОТИВ КОРПУСА И ПОТОЛКА — одна функция на проверку места и приёмку. Фасад: верх на
 * `frontTopMm` над низом крыши, высота, толщина; корпус: крыша `topMm`. Возвращает наибольшую высоту
 * фасада над крышей на ходу, наибольший вылет вперёд и заход в корпус (точки фасада за плоскостью
 * корпуса ниже верха крыши), шаг 0,5 % хода.
 */
export function aventosSweep(
  model: AventosModel,
  front: { topMm: number; heightMm: number; thicknessMm: number },
  topMm: number,
): { aboveTopMm: number; forwardMm: number; intoCarcassMm: number } {
  const corners: Pt[] = [
    [0, front.topMm],
    [front.thicknessMm, front.topMm],
    [front.thicknessMm, front.topMm - front.heightMm],
    [0, front.topMm - front.heightMm],
  ];
  let above = -Infinity;
  let forward = -Infinity;
  let into = 0;
  for (let i = 0; i <= 200; i += 1) {
    const pts = corners.map((q) => aventosPoint(model, i / 200, q));
    for (let k = 0; k < 4; k += 1) {
      const a = pts[k];
      const b = pts[(k + 1) % 4];
      for (let j = 0; j <= 20; j += 1) {
        const p: Pt = [a[0] + ((b[0] - a[0]) * j) / 20, a[1] + ((b[1] - a[1]) * j) / 20];
        above = Math.max(above, p[1] - topMm);
        forward = Math.max(forward, p[0]);
        if (p[0] < -0.01 && p[1] < topMm) into = Math.max(into, Math.min(-p[0], topMm - p[1]));
      }
    }
  }
  return { aboveTopMm: above, forwardMm: forward, intoCarcassMm: into };
}
