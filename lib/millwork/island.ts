/**
 * ОСТРОВ — РЯД БЕЗ СТЕНЫ (OVAL & RADIUS, этап A).
 *
 * Остров — такой же ряд (`Run`), как ряд у стены: модули, правка `applyOps`,
 * раскрой, смета и сцена — те же функции. Отличий три, и все они здесь:
 *
 *   место — не стена, а отметка у ряда стены А (`IslandPlacement`): от его
 *     левого края, проход между фасадами и куда смотрит фасад острова
 *     (`islandFrame`) — одна функция на сцену, план и проходы;
 *   тыл — не стена: его закрывает панель фасадного листа на каждом прямом
 *     модуле (`islandBackOf`), а скруглённый торец обходит дугой и сзади
 *     (`RadiusSpec.back`);
 *   форма — полукруглый торец, капсула и овал — это модули ряда: торец
 *     острова — модуль шириной R = D/2 со скруглёнными передним и задним
 *     углом, одна полуокружность (`islandEnds`); овал — столешница поверх
 *     капсулы из четырёх дуг с касанием (`islandOvalOf`).
 *
 * Хранится остров в `MillworkState.island` целым рядом, как правки стен
 * (ловушка 42). Без three.js: его читают смета, раскрой и план.
 */
import type { IslandPlacement, Module, Run } from '@/types/millwork';
import { COUNTER_OVERHANG_MM, moduleCarcassHeightMm, rowStandardDepthMm } from './fill';
import { standsOnFloor } from './modules';
import { plinthMm, shopOf } from './shop';
import { pathArc, type PlanPath, type PlanPoint } from './radius';

/** Идентичность ряда острова: ключ его модулей (`base-0@island`) и стены раскроя. */
export const ISLAND_WALL_ID = 'island';
/** Как остров подписан на экране, на чертеже и в раскрое. */
export const ISLAND_LABEL = 'Остров';
/** Деталь, закрывающая тыл прямого модуля острова. */
export const ISLAND_BACK_PANEL_NAME = 'Панель тыла острова';

/** Остров стоит без стены: у ряда есть его место у стены А. */
export function isIsland(run: Pick<Run, 'island'> | null | undefined): boolean {
  return Boolean(run?.island);
}

/** Модули острова на полу — слева направо. */
function floorOf(run: Pick<Run, 'modules'>): Module[] {
  return run.modules.filter((unit) => standsOnFloor(unit)).sort((a, b) => a.offsetMm - b.offsetMm);
}

/**
 * СКРУГЛЁННЫЕ ТОРЦЫ ОСТРОВА — крайние модули со скруглённым задним углом
 * (`RadiusSpec.back`): у ряда вдоль стены такого не бывает (`radiusPlaceRefusal`).
 */
export function islandEnds(run: Pick<Run, 'modules'>): { left: Module | null; right: Module | null } {
  const floor = floorOf(run);
  const first = floor[0];
  const last = floor[floor.length - 1];
  return {
    left: first?.radius?.back && first.radius.place === 'left' ? first : null,
    right: last?.radius?.back && last.radius.place === 'right' && last !== first ? last : null,
  };
}

export type IslandShape = 'rect' | 'half' | 'capsule' | 'oval';

export const ISLAND_SHAPE_TITLE: Record<IslandShape, string> = {
  rect: 'Прямой',
  half: 'Полукруглый торец',
  capsule: 'Капсула',
  oval: 'Овал',
};

/**
 * ФОРМА ОСТРОВА — ВЫВОДИТСЯ ИЗ МОДУЛЕЙ, А НЕ ХРАНИТСЯ: торцы — это модули
 * ряда; овал — столешница над капсулой (`top: 'oval'`), без двух торцов его
 * нет. Флаг формы разошёлся бы с модулями на первой правке.
 */
export function islandShapeOf(run: Pick<Run, 'modules' | 'island'>): IslandShape {
  const { left, right } = islandEnds(run);
  if (left && right) return run.island?.top === 'oval' ? 'oval' : 'capsule';
  if (left || right) return 'half';
  return 'rect';
}

/** Глубина корпуса острова — глубина нижнего ряда зоны и школы цеха. */
export function islandDepthMm(run: Pick<Run, 'zone' | 'production'>): number {
  return rowStandardDepthMm(run.zone, 'base', run.production);
}

/**
 * РАДИУС ПОЛУКРУГЛОГО ТОРЦА — половина глубины корпуса, целые мм
 * (`RadiusSpec.radiusMm` — целое): у нечётной глубины две дуги на 1 мм
 * друг от друга и прямой отрезок между ними — касание сохраняется.
 */
export function islandEndRadiusMm(run: Pick<Run, 'zone' | 'production'>): number {
  return Math.floor(islandDepthMm(run) / 2);
}

/* ─────────────────────────  Место острова  ───────────────────────── */

/**
 * ОСТРОВ В КООРДИНАТАХ РЯДА СТЕНЫ А, мм — ОДНА ФУНКЦИЯ НА СЦЕНУ, ПЛАН И ПРОХОДЫ.
 *
 * Координаты ряда А: X — вдоль ряда от его начала, Z — 0 на лицевой плоскости
 * корпусов ряда, плюс — в комнату. Проход `gapMm` — между лицом фасадов ряда
 * А и ближней к нему гранью острова: лицом его фасадов (остров смотрит на
 * стену) или панелью тыла (смотрит в комнату). Остров, повёрнутый к стене,
 * стоит развёрнутым на 180°: его левый край — справа, если смотреть со стены.
 */
export type IslandFrame = { x0: number; z0: number; flip: boolean };

export function islandFrame(run: Pick<Run, 'island' | 'lengthMm' | 'zone' | 'production'>): IslandFrame {
  const at: IslandPlacement = run.island ?? { fromLeftMm: 0, gapMm: 0, facing: 'wall' };
  const tf = shopOf(run.production).frontMm;
  if (at.facing === 'room') return { x0: at.fromLeftMm, z0: tf + at.gapMm + tf + islandDepthMm(run), flip: false };
  return { x0: at.fromLeftMm + run.lengthMm, z0: tf + at.gapMm + tf, flip: true };
}

/** Точка острова (мм острова: x вдоль, z — 0 на его фасаде) в координатах ряда А. */
export function islandPoint(frame: IslandFrame, x: number, z: number): PlanPoint {
  return frame.flip ? [frame.x0 - x, frame.z0 - z] : [frame.x0 + x, frame.z0 + z];
}

/** Место ряда в сцене: смещение (м) и поворот вокруг вертикали (°) — как у `runPlacements`. */
export type RowPlace = { xM: number; zM: number; rotationYDeg: number };

/**
 * МЕСТО ОСТРОВА В СЦЕНЕ — ОТ МЕСТА РЯДА СТЕНЫ А (`runPlacements`).
 *
 * Тот же поворот, что у группы ряда в сцене: точка (X, Z) ряда А в мире —
 * (x + X·cos a + Z·sin a, z − X·sin a + Z·cos a). Остров, смотрящий на
 * стену, повёрнут ещё на 180°.
 */
export function islandPlacement(rowA: RowPlace, run: Pick<Run, 'island' | 'lengthMm' | 'zone' | 'production'>): RowPlace {
  const frame = islandFrame(run);
  const a = (rowA.rotationYDeg * Math.PI) / 180;
  const X = frame.x0 / 1000;
  const Z = frame.z0 / 1000;
  return {
    xM: rowA.xM + X * Math.cos(a) + Z * Math.sin(a),
    zM: rowA.zM - X * Math.sin(a) + Z * Math.cos(a),
    rotationYDeg: rowA.rotationYDeg + (frame.flip ? 180 : 0),
  };
}

/* ─────────────────────────  Тыл острова  ───────────────────────── */

/**
 * ПАНЕЛЬ ТЫЛА — У КАЖДОГО ПРЯМОГО МОДУЛЯ ОСТРОВА НА ПОЛУ.
 *
 * У ряда вдоль стены сзади стена, и задняя стенка из ХДФ её не показывает.
 * У острова тыл виден из комнаты: его закрывает панель фасадного листа
 * модуля — того же декора, той же кромки, той же цены, что его фасад
 * (`panels.ts` и сцена спрашивают эту функцию). Высота — от пола до низа
 * столешницы (цоколь и корпус) минус зазор у пола; ширина — модуль минус
 * зазор фасадов, как у створок, и между панелями соседей тот же зазор.
 * Скруглённый торец тыл обходит дугой — панели у него нет.
 */
export function islandBackOf(
  unit: Module,
  run: Pick<Run, 'island' | 'zone' | 'production' | 'ceilingHeightMm'> & Partial<Run>,
): { widthMm: number; heightMm: number; bottomMm: number; thicknessMm: number } | null {
  if (!run.island || !standsOnFloor(unit) || unit.radius?.back) return null;
  const shop = shopOf(run.production);
  const gap = shop.frontGapMm;
  const top = plinthMm(run.production) + moduleCarcassHeightMm(unit, run);
  return { widthMm: unit.widthMm - gap, heightMm: top - gap, bottomMm: gap, thicknessMm: shop.frontMm };
}

/* ─────────────────────────  Столешница острова  ───────────────────────── */

/**
 * СВЕС СТОЛЕШНИЦЫ ОСТРОВА, мм от плоскости корпусов: спереди — фасад и свес
 * (`counterSlabDepthMm` минус глубина ряда, как у ряда у стены); сзади —
 * панель тыла и свес с тыла (`backOverhangMm`, пусто — как спереди; больше
 * — барная стойка).
 */
export function islandReachMm(run: Pick<Run, 'island' | 'production'>): { front: number; back: number } {
  const tf = shopOf(run.production).frontMm;
  return {
    front: tf + COUNTER_OVERHANG_MM,
    back: tf + (run.island?.backOverhangMm ?? COUNTER_OVERHANG_MM),
  };
}

/**
 * ОВАЛ ПО УМОЛЧАНИЮ: середина боковой дуги выходит за капсулу на 150 мм.
 * Это кнопка «Овал», а не размер цеха: радиус боковой дуги — целые мм, и его
 * правят числом.
 */
export const OVAL_BULGE_DEFAULT_MM = 150;

/**
 * ОВАЛ ИЗ ЧЕТЫРЁХ ДУГ — ТОРЦЫ И БОКА С КАСАНИЕМ.
 *
 * Торцевые дуги — радиуса r₁ = R + свес, концентричны дугам торцов острова;
 * центры — на расстоянии 2c друг от друга. Боковые дуги — радиуса r₂, центры
 * на поперечной оси. Касание — центры на одной прямой с точкой касания:
 * √(c² + d²) = r₂ − r₁, отсюда d = √((r₂ − r₁)² − c²); середина боковой
 * дуги дальше капсулы на r₂ − d − r₁. Овал есть, только если r₂ − r₁ > c.
 */
export type IslandOval = {
  /** Центры торцевых дуг (мм острова) и их радиус. */
  left: PlanPoint;
  right: PlanPoint;
  r1: number;
  /** Радиус боковых дуг, мм — целый, его называет чертёж. */
  r2: number;
  /** Насколько середина бока дальше капсулы, мм. */
  bulgeMm: number;
};

/** Радиус боковой дуги для выпучивания `bulge` при торцах r₁ на расстоянии 2c. */
export function ovalSideRadiusFor(c: number, r1: number, bulgeMm: number): number {
  return r1 + (c * c + bulgeMm * bulgeMm) / (2 * bulgeMm);
}

/** Наименьший целый радиус боковой дуги, при котором овал строится. */
export function ovalSideRadiusMinMm(c: number, r1: number): number {
  return Math.floor(r1 + c) + 1;
}

/**
 * ОВАЛ СТОЛЕШНИЦЫ ОСТРОВА — по его торцам и сохранённому радиусу боковой
 * дуги. Торцев двух нет или радиус не строится — `null` (и отказ правки
 * называет это словами, `islandTopRefusal`).
 */
export function islandOvalOf(run: Pick<Run, 'modules' | 'island' | 'production'>): IslandOval | null {
  if (run.island?.top !== 'oval') return null;
  const { left, right } = islandEnds(run);
  if (!left || !right) return null;
  const R = left.radius!.radiusMm;
  if (right.radius!.radiusMm !== R) return null;
  const reach = islandReachMm(run).front;
  /*
   * Центр по глубине — центр дуги торца (−R): у полуокружности это середина
   * корпуса, и свес спереди и сзади один (овал симметричен). У нечётной
   * глубины задний центр на 1 мм дальше — свес сзади на 1 мм меньше.
   */
  const zc = -R;
  const leftC: PlanPoint = [left.offsetMm + R, zc];
  const rightC: PlanPoint = [right.offsetMm + right.widthMm - R, zc];
  const r1 = R + reach;
  const c = (rightC[0] - leftC[0]) / 2;
  const r2 = run.island.sideRadiusMm ?? Math.ceil(ovalSideRadiusFor(c, r1, OVAL_BULGE_DEFAULT_MM));
  if (!(r2 - r1 > c)) return null;
  const d = Math.sqrt((r2 - r1) ** 2 - c * c);
  return { left: leftC, right: rightC, r1, r2, bulgeMm: r2 - d - r1 };
}

/**
 * КОНТУР ОВАЛА — обход как у остальных контуров (по часовой при x вправо, z
 * вверх): передняя боковая дуга слева направо, правый торец, задняя боковая
 * справа налево, левый торец. Точки касания — где прямая через центры
 * встречает торцевую дугу: угол θ = atan2(d, c).
 */
export function ovalPath(oval: IslandOval): PlanPath {
  const { left, right, r1, r2 } = oval;
  const c = (right[0] - left[0]) / 2;
  const xm = (left[0] + right[0]) / 2;
  const zc = left[1];
  const d = Math.sqrt((r2 - r1) ** 2 - c * c);
  const theta = Math.atan2(d, c);
  return [
    ...pathArc([xm, zc - d], r2, Math.PI - theta, theta),
    ...pathArc(right, r1, theta, -theta),
    ...pathArc([xm, zc + d], r2, -theta, -(Math.PI - theta)),
    ...pathArc(left, r1, Math.PI + theta, Math.PI - theta),
  ];
}

/**
 * ГЛУБИНА ПЛИТЫ ОСТРОВА, мм — корпус и свесы спереди и сзади; у овала —
 * в середине, вместе с выпучиванием боков. По ней смета называет заготовку.
 */
export function islandTopDepthMm(run: Pick<Run, 'modules' | 'island' | 'production' | 'zone'>): number {
  const oval = islandOvalOf(run);
  if (oval) return Math.round(2 * (oval.r1 + oval.bulgeMm));
  const { front, back } = islandReachMm(run);
  return islandDepthMm(run) + front + back;
}

/**
 * СТОЛЕШНИЦА ОСТРОВА В ОТПЕЧАТКЕ: форма, радиус боковой дуги овала и свес с
 * тыла — другая плита и другой метраж (`withIslandFingerprint`).
 */
export function islandTopKey(run: Pick<Run, 'modules' | 'island' | 'production'>): string {
  return `${islandShapeOf(run)}/${islandOvalOf(run)?.r2 ?? 0}/${run.island?.backOverhangMm ?? '-'}`;
}

/**
 * МОЖНО ЛИ ТАК — СТОЛЕШНИЦА ОСТРОВА, СЛОВАМИ (`null` — можно).
 *
 * Овал — над капсулой: без двух полукруглых торцов дугам не за что
 * держаться. Свес с тыла у овала тот же, что спереди: овал симметричен, и
 * барную стойку делают прямой или капсулой. Радиус боковой дуги — целые мм и
 * больше наименьшего, при котором дуги касаются.
 */
export function islandTopRefusal(run: Pick<Run, 'modules' | 'island' | 'production' | 'zone'>): string | null {
  const at = run.island;
  if (!at) return null;
  if (at.backOverhangMm !== undefined && (!Number.isInteger(at.backOverhangMm) || at.backOverhangMm < 0 || at.backOverhangMm > 1000)) {
    return 'Свес столешницы с тыла — целое число миллиметров от 0 до 1000.';
  }
  if (at.top !== 'oval') return null;
  const { left, right } = islandEnds(run);
  if (!left || !right) {
    return 'Овальная столешница лежит на капсуле: у острова нужны оба полукруглых торца — дугам овала не за что держаться.';
  }
  const half = islandEndRadiusMm(run);
  if (left.radius!.radiusMm !== right.radius!.radiusMm || left.radius!.radiusMm < half) {
    return `Овал лежит на капсуле с одинаковыми полукруглыми торцами R${half} (половина глубины): сейчас торцы R${left.radius!.radiusMm} и R${right.radius!.radiusMm}.`;
  }
  if (at.backOverhangMm !== undefined && at.backOverhangMm !== COUNTER_OVERHANG_MM) {
    return `Овал симметричен: свес с тыла у него тот же, что спереди (${COUNTER_OVERHANG_MM} мм). Барную стойку делают у прямого острова или капсулы.`;
  }
  if (at.sideRadiusMm !== undefined) {
    if (!Number.isInteger(at.sideRadiusMm)) return 'Радиус боковой дуги овала — целое число миллиметров.';
    const R = left.radius!.radiusMm;
    const r1 = R + islandReachMm(run).front;
    const c = (right.offsetMm + right.widthMm - right.radius!.radiusMm - (left.offsetMm + R)) / 2;
    const min = ovalSideRadiusMinMm(c, r1);
    if (at.sideRadiusMm < min) {
      return `Боковая дуга радиуса ${at.sideRadiusMm} мм не касается торцов овала: при этой длине острова радиус — от ${min} мм.`;
    }
  }
  return null;
}
