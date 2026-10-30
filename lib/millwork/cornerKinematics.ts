import { FALSE_PANEL_RANGE_MM, type HardwareItem, type ProductionSettings } from '@/types/catalog';
import type { CornerChoice, CornerClearance, Module, OpeningKind, Run, ZoneKind } from '@/types/millwork';
import {
  DRAWER_TRAVEL_M,
  L_PAIR_FIRST_LEG,
  bentLeafPoses,
  bifoldMotion,
  lPairMotion,
  leafOpenAngle,
  leafPoses,
  legOptions,
  runBoxesByModule,
  runPlaces,
  sceneLeaves,
  type PartBox,
} from './cabinetBoxes';
import { ovenShape } from './applianceShapes';
import { cookingStackOf, ovenDoorId, tallOvensOf } from './cookingStack';
import { cornerGeometry, cornerOwnerOf, openFrontOf, wallOfRole } from './corner';
import { rowStandardDepthMm } from './fill';
import { installedItem } from './fittings';
import { shopOf } from './shop';
import { isUpperRow, standsOnFloor } from './modules';
import { vitrineOf } from './vitrine';
/* Только тип: `room.ts` берёт `walls.ts`, а тот — этот модуль; значение здесь замкнуло бы цикл. */
import type { DoorRoomSolid } from './room';

/**
 * КИНЕМАТИКА УГЛА — ЧТО ЗАДЕВАЕТ НА ХОДУ И КАКАЯ ФАЛЬШ-ПАНЕЛЬ ЭТО СНИМАЕТ
 * (ADVANCED CAD · STAGE A).
 *
 * У слепого угла зазор между стенами держат две полосы фасада:
 *
 *   фальш-панель СОСЕДА — в плоскости фасадов ряда, который к углу
 *   стыкуется, между фасадами владельца и его первым модулем (`fillerMm`);
 *   фальш-панель ВЛАДЕЛЬЦА — в плоскости фасадов владельца, между его
 *   последним открывающимся модулем и фасадами соседа (`ownerFillerMm`).
 *
 * Обе считаются здесь: каждая створка, ящик и Г-фасад одного ряда угла
 * проходит свой ход целиком мимо закрытых фасадов, ручек, корпусов и
 * фальш-панелей другого ряда.
 *
 * ХОД — ТОТ, ЧТО ИЗВЕСТЕН (`assumptions` говорит, что взято из сцены):
 *   створка — до угла раскрытия петли из каталога (`openingAngleDeg`);
 *             петля не выбрана — до 90°, как её открывает сцена;
 *   ящик    — на ход направляющей из каталога (`strokeMm`); не выбрана —
 *             на 300 мм, как в сцене (`DRAWER_TRAVEL_M`);
 *   ручка   — та коробка, что нарисована (`runBoxes`): модель позиции
 *             каталога или условная скоба, когда позиция не выбрана.
 *
 * ВЕСЬ ХОД, А НЕ ЧЕТЫРЕ ТОЧКИ. Заход меряется с шагом 0,25° у створки и
 * 1 мм у ящика, и каждый локальный максимум, который между точками мог
 * дойти до касания, уточняется золотым сечением. Четыре точки (¼…1) на
 * П 3800 + 2400 + 1740 (600/300) показывали 9,8 мм там, где ящик заходил
 * в ручку соседа на 11,3 мм.
 *
 * ЧЬЯ ПАНЕЛЬ СНИМАЕТ ЗАХОД — ТОГО РЯДА, ЧТО ДВИЖЕТСЯ. Створка или ящик
 * соседа отходит от фасадов владельца вместе со своим рядом (его панель
 * шире), створка или ящик владельца — от фасадов соседа (панель владельца
 * шире). Сколько — наименьший сдвиг, при котором заход по всему ходу не
 * больше нуля, в целых миллиметрах вверх. Допусков сверх касания нет.
 */

const MM = 1000;

type V3 = [number, number, number];
/** Коробка в мире, мм: центр, полуразмеры, оси; `r` — полуразмеры по осям мира; `aligned` — оси коробки совпадают с осями мира. */
type Obb = { c: V3; e: V3; u: [V3, V3, V3]; r: V3; aligned: boolean };
type Box = { min: V3; max: V3 };

/** Место ряда в мире: начало (метры) и поворот вокруг вертикали — как у `runPlacements`. */
export type RowPlace = { xM: number; zM: number; rotationYDeg: number };

export type ClashSide = 'dock' | 'owner';
export type ClashLevel = 'lower' | 'upper';

/** Одна подвижная деталь, заходящая на ходу в деталь другого ряда угла. */
export type CornerClash = {
  /** Угол: стык стен `corner` и `corner + 1`. */
  corner: number;
  /**
   * Чей ряд движется: стыкующийся (`dock`) или ведущий (`owner`) — на уровне
   * этой детали (P0): у низа и у верха одной стены роли бывают разными.
   */
  side: ClashSide;
  /** Ряд движущейся детали: нижний (с колоннами) или навесной. `null` — антресоль, полка над шкафом. */
  level: ClashLevel | null;
  /** Стена движущейся детали и деталь словами. */
  wall: number;
  moduleId: string;
  moduleLabel: string;
  leaf: string;
  /** Что именно заходит: полотно, ручка, короб. */
  part: string;
  /** Стена, модуль и деталь, в которую заходит. */
  obstacleWall: number;
  obstacleModuleId: string | null;
  obstacleLabel: string;
  obstaclePart: string;
  /** Наибольший заход по всему ходу, мм, и где он (доля хода, 0…1). */
  depthMm: number;
  atS: number;
  /**
   * Наименьший сдвиг, при котором заход по всему ходу не больше касания,
   * мм. `null` — сдвигом панели не снимается (до 400 мм) или у этого угла
   * панели нет ни у одного из двух рядов.
   */
  needMm: number | null;
  /** Тот же сдвиг в целых миллиметрах — проверенный прямо, им панель и шире. */
  needWholeMm: number | null;
  /** Чья панель это снимает: ряд и уровень, который отходит от угла. `null` — ничья. */
  fix: { side: ClashSide; level: ClashLevel } | null;
  /**
   * Пара «деталь — модуль, в который она заходит»: у всех коробок одной
   * пары (корпус, фасад, ручка, фурнитура) решение одно.
   */
  pair: string;
  /**
   * Решение, которое сняло бы заход, но не годится: панель вышла бы шире
   * `FALSE_PANEL_RANGE_MM` («шире 100 — это уже модуль») или пустому углу
   * не хватает ряда. Для слов отказа: что понадобилось бы и почему нельзя.
   */
  blocked: { fix: PanelFix; needWholeMm: number; widthMm: number; limitMm: number } | null;
  /**
   * ЗАХОД ВНУТРИ ПАРЫ ДВЕРЕЦ ВЕРХНЕГО Г-МОДУЛЯ (P0): одна дверца пары — в
   * другую. Панелью его не снять: решают ручка у угла и угол раскрытия
   * петель. `first` — заходит дверца, которая открывается первой (Б — мимо
   * закрытой А); иначе вторая (А — мимо открытой Б). Стены дверец — для слов.
   * `needDeg` — наименьший угол раскрытия дверцы Б, при котором А проходит,
   * градусы, найденный тем же ходом; `null` — не нашёлся до 180°.
   */
  own?: {
    first: boolean;
    doorWall: number;
    partnerWall: number;
    partnerAngleDeg: number;
    partnerKnown: boolean;
    needDeg: number | null;
  };
};

/** Сколько добавить к панелям угла, целые миллиметры. Ноль — ничего. */
export type CornerRaise = { dockMm: number; ownerMm: number; upperDockMm: number; upperOwnerMm: number };

/** Пара и решение, выбранное ей, — для проверки, что решение подействовало. */
export type CornerPair = { pair: string; corner: number; fix: PanelFix | null; depthMm: number };

export type CornerKinematics = {
  clashes: CornerClash[];
  /** По каждому углу. */
  raise: CornerRaise[];
  /** Заходы, которые панелью не снимаются. */
  unresolved: CornerClash[];
  /** Пары с заходом и выбранное им решение. */
  pairs: CornerPair[];
  /** Что взято из сцены, а не из паспорта, — словами. */
  assumptions: string[];
};

/** Решение пары одной строкой: `пара|сторона:ряд` — ключ того, что не подействовало. */
export function fixKey(pair: string, fix: PanelFix): string {
  return `${pair}|${fix.side}:${fix.level}`;
}

/**
 * Предел ПОИСКА сдвига, мм, — не допуск: дальше заход не меряется, и деталь
 * названа «не снять». Годится ли найденный сдвиг, решает не он, а правило
 * панели (`FALSE_PANEL_RANGE_MM`) и длина ряда у пустого угла.
 */
export const MAX_PANEL_SHIFT_MM = 400;

/** Выбор угла `corner` — как он лежит на рядах (с их панелями по ходу). */
export function choiceOfCorner(runs: Pick<Run, 'corner'>[], corner: number): CornerChoice | undefined {
  return runs[corner + 1]?.corner?.start ?? runs[corner]?.corner?.end;
}

/* ─────────────────────────  панели угла  ───────────────────────── */

/** Чья панель и какого ряда: та, которой ряд отходит от угла. */
export type PanelFix = { side: ClashSide; level: ClashLevel };

/**
 * ШИРИНА ТОГО, ЧЕМ РЯД ОТХОДИТ ОТ УГЛА, мм — та, что стоит сейчас.
 *
 * Фальш-панель соседа (у слепого — от настройки цеха, у Г-угла — полоса у
 * ноги, по умолчанию ноль), панель владельца у слепого модуля, а у пустого
 * верхнего угла — сама пустота: детали там нет, угол просто шире.
 * Числа — из `cornerGeometry`, второго расчёта угла здесь нет.
 */
export function panelWidthMm(
  choice: CornerChoice,
  fix: PanelFix,
  zone: ZoneKind | undefined,
  production: ProductionSettings | undefined,
): number {
  const g = cornerGeometry(choice, zone, production);
  const upperDepth = rowStandardDepthMm(zone, 'upper', production);
  if (fix.level === 'lower') return fix.side === 'dock' ? g.fillerMm : g.ownerFillerMm;
  if (choice.upper === 'empty') return fix.side === 'dock' ? g.upperStartMm - upperDepth : g.ownerUpperCutMm - upperDepth;
  return fix.side === 'dock' ? g.upperFillerMm : g.ownerUpperFillerMm;
}

/**
 * ВЫБОР УГЛА С ПАНЕЛЯМИ ПО ХОДУ: к тем, что стоят, — то, что требует ход.
 * Поля, которым добавлять нечего, остаются прежними (или отсутствуют).
 */
export function raisedChoice(
  choice: CornerChoice,
  raise: CornerRaise | undefined,
  zone: ZoneKind | undefined,
  production: ProductionSettings | undefined,
): CornerChoice {
  if (!raise || (raise.dockMm <= 0 && raise.ownerMm <= 0 && raise.upperDockMm <= 0 && raise.upperOwnerMm <= 0)) return choice;
  const width = (side: ClashSide, level: ClashLevel) => panelWidthMm(choice, { side, level }, zone, production);
  const clearance: CornerClearance = { ...(choice.clearance ?? {}) };
  if (raise.dockMm > 0) clearance.dockMm = width('dock', 'lower') + raise.dockMm;
  if (raise.ownerMm > 0) clearance.ownerMm = width('owner', 'lower') + raise.ownerMm;
  if (raise.upperDockMm > 0) clearance.upperDockMm = width('dock', 'upper') + raise.upperDockMm;
  if (raise.upperOwnerMm > 0) clearance.upperOwnerMm = width('owner', 'upper') + raise.upperOwnerMm;
  return { ...choice, clearance };
}

/**
 * Полоса такой ширины — деталь или зазор: не шире зазора между фасадами цеха
 * (`frontGapMm`) — зазор, детали нет (`cornerFillersOf`). Слова — те же.
 */
export function stripWords(
  choice: CornerChoice,
  fix: PanelFix,
  corner: number,
  wallOf: (wall: number) => string,
  widthMm: number,
  production: ProductionSettings | undefined,
): string {
  const gap = shopOf(production).frontGapMm;
  if (widthMm > gap || (fix.level === 'upper' && choice.upper === 'empty')) return `${panelWords(choice, fix, corner, wallOf)} — ${widthMm} мм`;
  const wall = wallOf(wallOfRole(choice, corner, fix.level, fix.side));
  return (
    `у угла ${wall} зазор${fix.level === 'upper' ? ' навесного ряда' : ''} — ${widthMm} мм, ` +
    `без детали: он не шире зазора между фасадами (${gap} мм)`
  );
}

/** Что именно шире — словами: «фальш-панель стены В», «пустой угол над столешницей у стены Б». */
export function panelWords(choice: CornerChoice, fix: PanelFix, corner: number, wallOf: (wall: number) => string): string {
  const wall = wallOf(wallOfRole(choice, corner, fix.level, fix.side));
  if (fix.level === 'upper' && choice.upper === 'empty') return `пустой угол над столешницей у ${wall}`;
  const owner = fix.side === 'owner' ? ' у слепого модуля' : choice[fix.level] === 'l_shape' ? ' у Г-модуля' : '';
  return `фальш-панель ${wall}${owner}${fix.level === 'upper' ? ' (навесной ряд)' : ''}`;
}

/* ─────────────────────────  геометрия  ───────────────────────── */

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function turnOf(place: RowPlace) {
  const a = (place.rotationYDeg * Math.PI) / 180;
  return (v: V3): V3 => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
}

/** Коробка ряда (метры, в осях ряда; повороты створки — `yaw`/`pitch`) → коробка мира, мм. */
function obbOf(place: RowPlace, center: V3, size: V3, yaw = 0, pitch = 0): Obb {
  const a = (place.rotationYDeg * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  /* Оси коробки в осях ряда (наклон вокруг x, затем поворот вокруг y) — и поворот ряда. */
  const u: [V3, V3, V3] = [
    [cy * ca - sy * sa, 0, -cy * sa - sy * ca],
    [sy * sp * ca + cy * sp * sa, cp, -sy * sp * sa + cy * sp * ca],
    [sy * cp * ca + cy * cp * sa, -sp, -sy * cp * sa + cy * cp * ca],
  ];
  const e: V3 = [(size[0] * MM) / 2, (size[1] * MM) / 2, (size[2] * MM) / 2];
  const r: V3 = [
    e[0] * Math.abs(u[0][0]) + e[1] * Math.abs(u[1][0]) + e[2] * Math.abs(u[2][0]),
    e[0] * Math.abs(u[0][1]) + e[1] * Math.abs(u[1][1]) + e[2] * Math.abs(u[2][1]),
    e[0] * Math.abs(u[0][2]) + e[1] * Math.abs(u[1][2]) + e[2] * Math.abs(u[2][2]),
  ];
  /* Выровнена по осям мира: поворот ряда кратен 90°, и у коробки нет своего поворота, кроме кратного 90°. */
  const right = (v: number) => Math.abs(Math.sin(2 * v)) < 1e-12;
  const aligned = right(a) && right(yaw) && right(pitch);
  const c: V3 = [
    (center[0] * ca + center[2] * sa + place.xM) * MM,
    center[1] * MM,
    (-center[0] * sa + center[2] * ca + place.zM) * MM,
  ];
  return { c, e, u, r, aligned };
}

function boxOf(obb: Obb): Box {
  return {
    min: [obb.c[0] - obb.r[0], obb.c[1] - obb.r[1], obb.c[2] - obb.r[2]],
    max: [obb.c[0] + obb.r[0], obb.c[1] + obb.r[1], obb.c[2] + obb.r[2]],
  };
}

function boxesMeet(a: Box, b: Box): boolean {
  return (
    a.min[0] <= b.max[0] && b.min[0] <= a.max[0] &&
    a.min[1] <= b.max[1] && b.min[1] <= a.max[1] &&
    a.min[2] <= b.max[2] && b.min[2] <= a.max[2]
  );
}

/** Перекрытие проекций двух коробок на ось (x, y, z), мм. */
function overlapOn(A: Obb, B: Obb, d: V3, x: number, y: number, z: number): number {
  let ra = 0;
  let rb = 0;
  for (let k = 0; k < 3; k += 1) {
    ra += A.e[k] * Math.abs(A.u[k][0] * x + A.u[k][1] * y + A.u[k][2] * z);
    rb += B.e[k] * Math.abs(B.u[k][0] * x + B.u[k][1] * y + B.u[k][2] * z);
  }
  return ra + rb - Math.abs(d[0] * x + d[1] * y + d[2] * z);
}

/**
 * Насколько коробки входят друг в друга, мм: теорема о разделяющей оси,
 * 15 осей. Ноль и меньше — не входят (минус — зазор по найденной оси, он
 * не больше настоящего расстояния).
 *
 * Две коробки, выровненные по осям мира, — три оси: остальные двенадцать
 * у них нулевые или повторяют эти, и ответ тот же. `stop` — порог, ниже
 * которого точное число вызывающему не нужно: проверка выходит, как только
 * заход опустился под него.
 */
function depthOf(A: Obb, B: Obb, stop = -Infinity): number {
  const d: V3 = [B.c[0] - A.c[0], B.c[1] - A.c[1], B.c[2] - A.c[2]];
  if (A.aligned && B.aligned) {
    return Math.min(
      A.r[0] + B.r[0] - Math.abs(d[0]),
      A.r[1] + B.r[1] - Math.abs(d[1]),
      A.r[2] + B.r[2] - Math.abs(d[2]),
    );
  }
  let least = Infinity;
  for (const axis of [A.u[0], A.u[1], A.u[2], B.u[0], B.u[1], B.u[2]]) {
    least = Math.min(least, overlapOn(A, B, d, axis[0], axis[1], axis[2]));
    if (least < stop) return least;
  }
  for (const a of A.u) {
    for (const b of B.u) {
      const n = cross(a, b);
      const len = Math.hypot(n[0], n[1], n[2]);
      if (len <= 1e-9) continue;
      least = Math.min(least, overlapOn(A, B, d, n[0] / len, n[1] / len, n[2] / len));
      if (least < stop) return least;
    }
  }
  return least;
}

/* ─────────────────────────  что движется и обо что  ───────────────────────── */

type Moving = {
  wall: number;
  unit: Module;
  leaf: string;
  level: ClashLevel | null;
  /** Коробки детали в мире при доле хода `s`. */
  at: (s: number) => { obb: Obb; part: string }[];
  /** Шаг выборки по доле хода и наибольшая скорость точки, мм на единицу доли. */
  steps: number;
  speed: number;
  /** Положения на шагах выборки — один раз на деталь, а не на каждую пару. */
  samples: { obbs: Obb[]; box: Box }[];
  /** Ручка детали — условная скоба (позиции каталога нет). */
  conditionalHandle: boolean;
  /** Габарит всего хода в мире — для отбора пар. */
  swept: Box;
  /**
   * ВТОРАЯ ДВЕРЦА ПАРЫ Г-МОДУЛЯ (P0) — в том положении, в каком она стоит,
   * пока эта едет: первая (Б) идёт мимо закрытой А, вторая (А) — мимо
   * открытой Б (`L_PAIR_FIRST_LEG`). `openB` — коробки Б при угле `angle`,
   * для поиска угла, при котором А проходит.
   */
  partner?: {
    corner: number;
    leaf: string;
    first: boolean;
    doorWall: number;
    partnerWall: number;
    solids: Solid[];
    angleDeg: number;
    known: boolean;
    openB?: (angle: number) => Solid[];
  };
};

type Solid = {
  wall: number;
  obb: Obb;
  box: Box;
  moduleId: string | null;
  label: string;
  part: string;
  /** Ручка без позиции каталога — условная скоба (её размер — не паспорт). */
  conditional: boolean;
  /** Ряд детали: нижний (с колоннами), навесной; `null` — антресоль, полка над шкафом. */
  level: ClashLevel | null;
  /** Тело комнаты (ход двери прибора): стена, угловой блок, колонна, короб, выступ. */
  room?: DoorRoomSolid;
};

/**
 * ЕСТЬ ЛИ У ЭТОГО УГЛА ПАНЕЛЬ, КОТОРОЙ РЯД ОТХОДИТ ОТ УГЛА.
 *
 *   сосед внизу    — у слепого (фальш-панель) и у Г-угла (полоса у ноги);
 *   владелец внизу — у слепого (панель у слепого модуля); Г-модуль от угла не отходит;
 *   сосед наверху  — у слепого, у Г и у пустого (пустой угол шире);
 *   владелец наверху — у слепого и у пустого.
 */
function panelAt(choice: CornerChoice | undefined, side: ClashSide, level: ClashLevel): boolean {
  if (!choice) return false;
  if (level === 'lower') return side === 'dock' ? true : choice.lower === 'blind';
  return side === 'dock' ? true : choice.upper === 'blind' || choice.upper === 'empty';
}

function shopBoxes(run: Run, production: ProductionSettings, hardware?: Map<string, HardwareItem>) {
  return runBoxesByModule(run, {
    thicknessMm: production.carcassMm,
    frontThicknessMm: production.frontMm,
    gapMm: production.frontGapMm,
    production,
    ...(hardware ? { hardware } : {}),
  });
}

/** Деталь словами — в винительном падеже: «заходит в ручку», «в корпус». */
function partWords(box: Pick<PartBox, 'node' | 'material' | 'panel'>): string {
  if (box.node === 'handle') return 'ручку';
  if (box.material === 'front') return 'фасад';
  if (box.material === 'glass') return 'стекло';
  if (box.material === 'metal') return 'фурнитуру';
  if (box.material === 'appliance') return 'прибор';
  return 'корпус';
}

function levelOf(unit: Module): ClashLevel | null {
  if (standsOnFloor(unit)) return 'lower';
  if (isUpperRow(unit) && unit.section !== 'mezzanine' && !unit.overhead) return 'upper';
  return null;
}

/** Ход ящика, метры: направляющая каталога — её паспорт; нет — как в сцене. */
function travelOf(unit: Module, hardware: Map<string, HardwareItem> | undefined): { travelM: number; known: boolean } {
  const stroke = installedItem(unit, 'slide', hardware)?.hardware.strokeMm;
  return stroke && stroke > 0 ? { travelM: stroke / MM, known: true } : { travelM: DRAWER_TRAVEL_M, known: false };
}

function movingOf(
  run: Run,
  wall: number,
  place: RowPlace,
  production: ProductionSettings,
  hardware: Map<string, HardwareItem> | undefined,
  rowBoxes: PartBox[],
  told: Set<string>,
  /** Встречает ли габарит хода соседние ряды угла. */
  near: (box: Box) => boolean,
  /** Чьи детали меряются: у угла — все, вдоль ряда (P1) — двери витрин. */
  pick?: (unit: Module) => boolean,
): Moving[] {
  const out: Moving[] = [];
  const tf = production.frontMm / MM;
  const gap = production.frontGapMm / MM;
  for (const entry of runPlaces(run)) {
    const unit = entry.unit;
    if (pick && !pick(unit)) continue;
    /* Доступная часть у слепого угла — та же, что ставит сцена: ширина и сторона (`openFrontOf`, P0). */
    const open = openFrontOf(unit, run);
    const leaves = sceneLeaves(unit, entry.heightM, open ? open.widthMm / MM : undefined, open ? open.fromMm / MM : 0, production);
    for (const leaf of leaves) {
      const level = levelOf(unit);
      let at: Moving['at'];
      let steps: number;
      let speed: number;
      let partner: Moving['partner'];
      if (leaf.kind === 'door') {
        const own = rowBoxes.find((box) => box.part === leaf.id && box.node === 'handle');
        const handle = own
          ? { ...own, position: [own.position[0] - entry.x, own.position[1] - entry.y, own.position[2] - entry.zM] as V3 }
          : null;
        const { angle, known } = leafOpenAngle(unit, leaf.id.slice(unit.id.length + 1), hardware, leaf.opening);
        if (!known) told.add('створка — до 90°, как в сцене: петля каталога не выбрана');
        at = (s) =>
          leafPoses({
            opening: leaf.opening,
            x: leaf.xM,
            y: leaf.bottomM,
            width: leaf.widthM,
            height: leaf.heightM,
            thickness: tf,
            gap,
            handle,
            s,
            openAngle: angle,
          }).map((box) => ({
            obb: obbOf(place, [box.center[0] + entry.x, box.center[1] + entry.y, box.center[2] + entry.zM], box.size, box.yaw ?? 0, box.pitch ?? 0),
            part: box.role === 'handle' ? 'ручка' : 'полотно',
          }));
        /*
         * Шаг 0,5°. Скорость — верхняя оценка для отбора максимумов на
         * уточнение, а не допуск результата: точка дальше всех от оси — край
         * полотна или ручки, и до неё не больше полотна плюс 250 мм.
         */
        steps = Math.max(8, Math.ceil(((angle * 180) / Math.PI) / 0.5));
        const reach = (leaf.opening === 'lift' || leaf.opening === 'flap' ? leaf.heightM : leaf.widthM) + 0.25;
        speed = reach * angle * MM;
      } else if (leaf.kind === 'lpair') {
        /*
         * ДВЕРЦА ПАРЫ ВЕРХНЕГО Г-МОДУЛЯ (P0): своя петля у дальнего края ноги,
         * угол — петли каталога на этой дверце (или модуле), не выбрана — 90°,
         * как в сцене. Дверцы ходят по очереди (`L_PAIR_FIRST_LEG`): первая —
         * мимо закрытой второй, вторая — мимо открытой первой.
         */
        const placeM = { x: entry.x, y: entry.y, heightM: entry.heightM, depthM: entry.depthM, thicknessM: production.carcassMm / MM, zM: entry.zM };
        const opts = {
          gapM: gap,
          frontThicknessM: tf,
          integratedHandles: Boolean(run.options.integratedHandles),
          ...(hardware ? { hardware } : {}),
          ...legOptions(unit, run),
        };
        const angleOf = (leg: 0 | 1) => leafOpenAngle(unit, `door:${leg}`, hardware, 'left');
        const own = angleOf(leaf.leg);
        if (!own.known) told.add('створка — до 90°, как в сцене: петля каталога не выбрана');
        /* Ход дверцы — функция доли (`lPairMotion`): ручка и размеры считаются один раз на ход. */
        const motionOf = (leg: 0 | 1, angle: number) => {
          const motion = lPairMotion(unit, placeM, leg, { ...opts, openAngle: angle });
          /* Полотно — габаритом хода; рамка и стекло двери витрины лежат внутри него (P1). */
          return (s: number) =>
            motion(s)
              .filter((box) => box.role === 'front' || box.role === 'handle')
              .map((box) => ({
                obb: obbOf(place, box.center, box.size, box.yaw ?? 0, box.pitch ?? 0),
                part: box.role === 'handle' ? 'ручка' : 'полотно',
              }));
        };
        const posesAt = (leg: 0 | 1, s: number, angle: number) => motionOf(leg, angle)(s);
        at = motionOf(leaf.leg, own.angle);
        steps = Math.max(8, Math.ceil(((own.angle * 180) / Math.PI) / 0.5));
        speed = (unit.widthMm / MM + 0.25) * own.angle * MM;
        /* Стены дверец: А — ряд модуля, Б — соседний (Г-модуль у начала ряда — угол перед рядом). */
        const atStart = legOptions(unit, run).legSide === 'left';
        const corner = atStart ? wall - 1 : wall;
        const neighbour = atStart ? wall - 1 : wall + 1;
        const doorWall = leaf.leg === 0 ? wall : neighbour;
        const partnerWall = leaf.leg === 0 ? neighbour : wall;
        const otherLeg: 0 | 1 = leaf.leg === 0 ? 1 : 0;
        const other = angleOf(otherLeg);
        const first = leaf.leg === L_PAIR_FIRST_LEG;
        const solidsOfPoses = (list: { obb: Obb; part: string }[]): Solid[] =>
          list.map(({ obb, part }) => ({
            wall,
            obb,
            box: boxOf(obb),
            moduleId: unit.id,
            label: unit.label,
            part: part === 'ручка' ? 'ручку' : 'фасад',
            conditional: part === 'ручка',
            level: 'upper' as const,
          }));
        partner = {
          corner,
          leaf: `door:${otherLeg}`,
          first,
          doorWall,
          partnerWall,
          /* Первая едет мимо закрытой второй; вторая — мимо первой, открытой на свой угол. */
          solids: solidsOfPoses(first ? posesAt(otherLeg, 0, other.angle) : posesAt(otherLeg, 1, other.angle)),
          angleDeg: Math.round((other.angle * 180) / Math.PI),
          known: other.known,
          ...(first ? {} : { openB: (angle: number) => solidsOfPoses(posesAt(otherLeg, 1, angle)) }),
        };
      } else if (leaf.kind === 'bifold') {
        /* Ход «книжки» — функция доли (`bifoldMotion`): ручка фасада А считается один раз на ход, а не на каждом шаге. */
        const motion = bifoldMotion(
          unit,
          { x: entry.x, y: entry.y, heightM: entry.heightM, depthM: entry.depthM, thicknessM: production.carcassMm / MM, zM: entry.zM },
          {
            gapM: gap,
            frontThicknessM: tf,
            integratedHandles: Boolean(run.options.integratedHandles),
            ...(hardware ? { hardware } : {}),
            /* Г-модуль в начале ряда (P0) — нога слева, фасады складываются зеркально. */
            ...legOptions(unit, run),
          },
        );
        at = (s) =>
          motion(s).map((box) => ({
            obb: obbOf(place, box.center, box.size, box.yaw ?? 0, box.pitch ?? 0),
            part: box.role === 'handle' ? 'ручка' : 'фасад',
          }));
        told.add('Г-фасады — до 90° и ещё 90°, как в сцене');
        steps = 720;
        speed = (unit.widthMm / MM) * Math.PI * MM;
      } else if (leaf.kind === 'bent') {
        /*
         * ГНУТАЯ СТВОРКА (OVAL & RADIUS): полотно — та же форма, что в пачке
         * ряда, на ходу — хордами (`bentLeafPoses`), ось и вынос — как у
         * плоской. Угол — петли каталога на этой дверце, не выбрана — 90°.
         */
        const panel = rowBoxes.find((box) => box.part === leaf.id && box.material === 'front' && box.shape?.form.kind === 'shell');
        if (!panel?.shape || panel.shape.form.kind !== 'shell') continue;
        const form = panel.shape.form;
        const { angle, known } = leafOpenAngle(unit, leaf.id.slice(unit.id.length + 1), hardware, leaf.opening);
        if (!known) told.add('створка — до 90°, как в сцене: петля каталога не выбрана');
        at = (s) =>
          bentLeafPoses({ form, opening: leaf.opening, pivotM: leaf.pivotM, thickness: tf, s, openAngle: angle }).map((box) => ({
            obb: obbOf(place, [box.center[0] + entry.x, box.center[1] + entry.y, box.center[2] + entry.zM], box.size, box.yaw, 0),
            part: 'полотно',
          }));
        steps = Math.max(8, Math.ceil(((angle * 180) / Math.PI) / 0.5));
        speed = (Math.hypot(form.r1, unit.widthMm) / MM + 0.25) * angle * MM;
      } else {
        const parts = rowBoxes.filter((box) => box.part === leaf.id);
        if (parts.length === 0) continue;
        const { travelM, known } = travelOf(unit, hardware);
        if (!known) told.add('ящик — на 300 мм, как в сцене: ход направляющей каталога не выбран');
        at = (s) =>
          parts.map((box) => ({
            obb: obbOf(place, [box.position[0], box.position[1], box.position[2] + travelM * s], box.scale),
            part: box.node === 'handle' ? 'ручка' : box.material === 'front' ? 'фасад' : 'короб',
          }));
        steps = Math.max(8, Math.ceil(travelM * MM));
        speed = travelM * MM;
      }
      /*
       * Грубый отбор: ход по восьми долям с запасом на путь точки между ними.
       * Не встречает соседние ряды угла — полной выборки не нужно: деталь
       * далеко от угла, и запас шире любого пути между долями.
       */
      const coarsePad = speed / 8;
      let coarse: Box | null = null;
      for (let i = 0; i <= 8; i += 1) {
        for (const { obb } of at(i / 8)) {
          const b = boxOf(obb);
          coarse = coarse
            ? { min: [0, 1, 2].map((k) => Math.min(coarse!.min[k], b.min[k])) as V3, max: [0, 1, 2].map((k) => Math.max(coarse!.max[k], b.max[k])) as V3 }
            : b;
        }
      }
      if (!coarse) continue;
      coarse = { min: coarse.min.map((v) => v - coarsePad) as V3, max: coarse.max.map((v) => v + coarsePad) as V3 };
      /* Дверца пары меряется и против второй дверцы своего модуля — она всегда у угла. */
      if (!near(coarse) && !partner) continue;

      /* Положения на всех шагах и габарит хода — с запасом на то, что между шагами. */
      const pad = speed / steps;
      const samples: Moving['samples'] = [];
      let swept: Box | null = null;
      for (let i = 0; i <= steps; i += 1) {
        const obbs = at(i / steps).map((entry) => entry.obb);
        if (obbs.length === 0) continue;
        const boxes = obbs.map(boxOf);
        const box: Box = {
          min: [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b.min[k])) - pad) as V3,
          max: [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.max[k])) + pad) as V3,
        };
        samples.push({ obbs, box });
        swept = swept
          ? { min: [0, 1, 2].map((k) => Math.min(swept!.min[k], box.min[k])) as V3, max: [0, 1, 2].map((k) => Math.max(swept!.max[k], box.max[k])) as V3 }
          : box;
      }
      if (!swept || samples.length !== steps + 1) continue;
      const handleBox = rowBoxes.find((box) => box.part === leaf.id && box.node === 'handle');
      out.push({
        wall,
        unit,
        leaf: leaf.id.slice(unit.id.length + 1),
        level,
        at,
        steps,
        speed,
        samples,
        swept,
        conditionalHandle: Boolean(handleBox) && !handleBox!.handle?.itemId,
        ...(partner ? { partner } : {}),
      });
    }
  }
  return out;
}

function solidsOf(grouped: ReturnType<typeof shopBoxes>, wall: number, place: RowPlace): Solid[] {
  const out: Solid[] = [];
  for (const box of grouped.fillers) {
    const obb = obbOf(place, box.position, box.scale);
    out.push({
      wall,
      obb,
      box: boxOf(obb),
      moduleId: null,
      label: box.panel ?? 'добор',
      part: 'фальш-панель',
      conditional: false,
      /* Панель навесного ряда — та, что выше столешницы (её имя «…верхняя»); у антресоли уровня нет. */
      level: box.panel?.includes('антресоли') ? null : box.panel?.endsWith('верхняя') ? 'upper' : 'lower',
    });
  }
  for (const { unit, boxes } of grouped.modules) {
    for (const box of boxes) {
      const obb = obbOf(place, box.position, box.scale);
      out.push({
        wall,
        obb,
        box: boxOf(obb),
        moduleId: unit.id,
        label: unit.label,
        part: partWords(box),
        conditional: box.node === 'handle' && !box.handle?.itemId,
        level: levelOf(unit),
      });
    }
  }
  return out;
}

/**
 * НАИБОЛЬШИЙ ЗАХОД ПО ВСЕМУ ХОДУ, мм, и где он.
 *
 * Выборка с шагом `1/steps`; каждый локальный максимум, который между
 * соседними точками мог подняться до касания (запас — скорость точки на
 * шаг), уточняется золотым сечением на двух шагах вокруг.
 */
function worstOf(moving: Moving, solid: Solid, shift: V3): { depth: number; s: number } {
  const moveOf = (obb: Obb): Obb => ({ ...obb, c: [obb.c[0] + shift[0], obb.c[1] + shift[1], obb.c[2] + shift[2]] });
  const shiftedSolid: Box = {
    min: [solid.box.min[0] - shift[0], solid.box.min[1] - shift[1], solid.box.min[2] - shift[2]],
    max: [solid.box.max[0] - shift[0], solid.box.max[1] - shift[1], solid.box.max[2] - shift[2]],
  };
  const n = moving.steps;
  const slack = moving.speed / n;
  /*
   * Ниже «касание минус путь точки за шаг» точное число не нужно: такая
   * точка не касание и между соседними шагами им не станет.
   */
  const stop = TOUCH_MM - slack - 1;
  const depthOfObbs = (obbs: Obb[]) => {
    let worst = -Infinity;
    for (const obb of obbs) worst = Math.max(worst, depthOf(moveOf(obb), solid.obb, stop));
    return worst;
  };
  const depthAt = (s: number) => depthOfObbs(moving.at(s).map((entry) => entry.obb));
  /*
   * Точка хода, чей габарит (с запасом на шаг) не встречает деталь, —
   * не касание и на соседних долях: ей ставится «далеко», и SAT там не
   * считается. Это не допуск: запас шире пути точки за шаг.
   */
  const values: number[] = moving.samples.map((sample) =>
    boxesMeet(sample.box, shiftedSolid) ? depthOfObbs(sample.obbs) : -Infinity,
  );
  let best = { depth: -Infinity, s: 0 };
  for (let i = 0; i <= n; i += 1) {
    const v = values[i];
    if (v > best.depth) best = { depth: v, s: i / n };
    const left = i > 0 ? values[i - 1] : -Infinity;
    const right = i < n ? values[i + 1] : -Infinity;
    if (v < left || v < right) continue;
    if (!(v > -slack)) continue;
    /*
     * Внутри плато уточнять нечего: заход там постоянный (ящик идёт мимо
     * ручки, перекрытие по ширине одно), а края плато уточняются.
     */
    if (v === left && v === right) continue;
    /* Золотое сечение на [i − 1, i + 1]: максимум между точками. */
    let a = Math.max(0, (i - 1) / n);
    let b = Math.min(1, (i + 1) / n);
    const g = (Math.sqrt(5) - 1) / 2;
    let x1 = b - g * (b - a);
    let x2 = a + g * (b - a);
    let f1 = depthAt(x1);
    let f2 = depthAt(x2);
    for (let k = 0; k < 40 && b - a > 1e-7; k += 1) {
      if (f1 < f2) {
        a = x1;
        x1 = x2;
        f1 = f2;
        x2 = a + g * (b - a);
        f2 = depthAt(x2);
      } else {
        b = x2;
        x2 = x1;
        f2 = f1;
        x1 = b - g * (b - a);
        f1 = depthAt(x1);
      }
    }
    for (const [s, f] of [
      [x1, f1],
      [x2, f2],
    ] as [number, number][]) {
      if (f > best.depth) best = { depth: f, s };
    }
  }
  return best;
}

/**
 * Касание — это ноль захода. Сравнение идёт с микрометром, а не с нулём:
 * сдвиг ровно на заход даёт ноль, а сумма косинусов — 1e-13 мм.
 */
const TOUCH_MM = 1e-3;

/**
 * НАИМЕНЬШИЙ СДВИГ вдоль `dir` (единичный, мир), при котором заход по всему
 * ходу не больше касания: точный (до 0,01 мм) и в целых миллиметрах — его
 * проверяют прямо, а не округляют вверх, иначе сдвиг ровно 4 мм стал бы 5.
 * `null` — не нашёлся до предела.
 */
function needOf(moving: Moving, solid: Solid, dir: V3, depthMm: number, searchMm: number): { exact: number; whole: number } | null {
  const at = (mm: number) => worstOf(moving, solid, [dir[0] * mm, dir[1] * mm, dir[2] * mm]).depth;
  /* Вилка: от найденного захода, удваивая до предела поиска. */
  let lo = 0;
  let hi = Math.min(searchMm, Math.max(1, depthMm));
  while (at(hi) > TOUCH_MM) {
    if (hi >= searchMm) return null;
    lo = hi;
    hi = Math.min(searchMm, hi * 2);
  }
  while (hi - lo > 0.01) {
    const mid = (lo + hi) / 2;
    if (at(mid) > TOUCH_MM) lo = mid;
    else hi = mid;
  }
  const first = Math.ceil(lo);
  const whole = at(first) > TOUCH_MM ? first + 1 : first;
  return { exact: hi, whole };
}

/**
 * ЧТО ЗАДЕВАЕТ У УГЛОВ И КАКИЕ ПАНЕЛИ ЭТО СНИМАЮТ.
 *
 * `runs` — ряды композиции по обходу, каждый со своим углом (`run.corner`);
 * `places` — их места (`runPlacements`). Меряется каждый угол: подвижные
 * детали владельца против закрытых деталей соседа и наоборот. Стены
 * напротив друг друга (А и В у П) здесь не меряются — их держит проход.
 */
export function cornerKinematics(input: {
  runs: Run[];
  places: RowPlace[];
  production: ProductionSettings;
  hardware?: Map<string, HardwareItem>;
  /**
   * Решения, которые уже пробовали и которые не подействовали (`fixKey`).
   * Сдвиг по модели — это сдвиг всего ряда, а раскладка двигает то, что у
   * угла: пенал в другом конце ряда с панелью владельца не уезжает.
   */
  avoid?: ReadonlySet<string>;
}): CornerKinematics {
  const { runs, places, production, hardware } = input;
  const avoid = input.avoid ?? new Set<string>();
  const told = new Set<string>();
  const grouped = runs.map((run) => shopBoxes(run, production, hardware));
  const solids = runs.map((_, wall) => solidsOf(grouped[wall], wall, places[wall]));
  /* Габарит каждого ряда — для грубого отбора: створке у противоположного конца ряда до угла не дотянуться. */
  const rowBox = solids.map((list) =>
    list.length === 0
      ? null
      : {
          min: [0, 1, 2].map((k) => Math.min(...list.map((s) => s.box.min[k]))) as V3,
          max: [0, 1, 2].map((k) => Math.max(...list.map((s) => s.box.max[k]))) as V3,
        },
  );
  const moving = runs.map((run, wall) =>
    movingOf(run, wall, places[wall], production, hardware, grouped[wall].modules.flatMap((m) => m.boxes), told, (box) =>
      [wall - 1, wall + 1].some((other) => {
        const b = rowBox[other];
        return Boolean(b) && boxesMeet(box, b!);
      }),
    ),
  );

  const clashes: CornerClash[] = [];
  const raise: CornerRaise[] = runs.slice(1).map(() => ({ dockMm: 0, ownerMm: 0, upperDockMm: 0, upperOwnerMm: 0 }));
  /*
   * Варианты решения у каждой коробки: чья панель и на сколько — и годится
   * ли. Панель — деталь, и шире `FALSE_PANEL_RANGE_MM` её не делают («шире
   * 100 — это уже модуль»): сдвиг сверх этого — не решение, а слова отказа.
   * Пустой верхний угол — не деталь: его предел — длина ряда.
   */
  type Option = { fix: PanelFix; need: { exact: number; whole: number }; widthMm: number; limitMm: number };
  const allowed = (option: Option) => option.need.whole <= option.limitMm;
  const optionsOf = new Map<CornerClash, Option[]>();

  for (let corner = 0; corner + 1 < runs.length; corner += 1) {
    const choice: CornerChoice | undefined = choiceOfCorner(runs, corner);
    /* Прочь от угла: стена после угла — вдоль своего ряда, стена до угла — против своего. */
    const away: Record<'prev' | 'next', V3> = {
      next: turnOf(places[corner + 1])([1, 0, 0]),
      prev: turnOf(places[corner])([-1, 0, 0]),
    };
    /*
     * РОЛЬ РЯДА — ПО УРОВНЮ ДЕТАЛИ (P0). Ведущий и стыкующийся — свои у низа
     * и у верха: низ стены А может вести угол, а её верх — стыковаться к
     * верху стены Б. Панель, которую ход сделает шире, — того ряда и того
     * уровня, что отходит от угла.
     */
    const roleAt = (pos: 'prev' | 'next', level: ClashLevel): ClashSide => {
      if (!choice) return pos === 'prev' ? 'owner' : 'dock';
      return cornerOwnerOf(choice, level) === pos ? 'owner' : 'dock';
    };
    for (const pos of ['prev', 'next'] as const) {
      const wall = pos === 'prev' ? corner : corner + 1;
      const other = pos === 'prev' ? corner + 1 : corner;
      const otherPos = pos === 'prev' ? 'next' : 'prev';
      for (const m of moving[wall]) {
        /* Деталь без уровня (антресоль, полка над шкафом) — сторона по месту в обходе, как было. */
        const side: ClashSide = m.level ? roleAt(pos, m.level) : pos === 'prev' ? 'owner' : 'dock';
        for (const solid of solids[other]) {
          if (!boxesMeet(m.swept, solid.box)) continue;
          const worst = worstOf(m, solid, [0, 0, 0]);
          if (worst.depth <= TOUCH_MM) continue;
          /*
           * ЧЕЙ СДВИГ СНИМАЕТ ЗАХОД — ДВА КАНДИДАТА.
           * Ряд детали отходит от угла (деталь уезжает от препятствия) или
           * ряд препятствия (препятствие уезжает от детали) — тот, у кого
           * у этого угла есть панель (`panelAt`). Ящик владельца у слепого
           * модуля и ручка соседа: владельцу хватает 12 мм, соседу не хватило
           * бы и 160. Г-модуль от угла не отходит — отходит сосед.
           */
          const candidates: { fix: PanelFix; dir: V3 }[] = [];
          if (m.level && panelAt(choice, side, m.level)) candidates.push({ fix: { side, level: m.level }, dir: away[pos] });
          if (solid.level) {
            const otherSide = roleAt(otherPos, solid.level);
            if (panelAt(choice, otherSide, solid.level)) {
              const d = away[otherPos];
              candidates.push({ fix: { side: otherSide, level: solid.level }, dir: [-d[0], -d[1], -d[2]] });
            }
          }
          const options: Option[] = [];
          for (const candidate of candidates) {
            const empty = candidate.fix.level === 'upper' && choice?.upper === 'empty';
            const widthMm = panelWidthMm(choice!, candidate.fix, runs[corner].zone, production);
            const limitMm = empty
              ? runs[wallOfRole(choice, corner, candidate.fix.level, candidate.fix.side)].lengthMm
              : FALSE_PANEL_RANGE_MM[1] - widthMm;
            const found = needOf(m, solid, candidate.dir, worst.depth, Math.max(limitMm, MAX_PANEL_SHIFT_MM));
            if (found) options.push({ fix: candidate.fix, need: found, widthMm, limitMm });
          }
          const clash: CornerClash = {
            corner,
            side,
            level: m.level,
            wall,
            moduleId: m.unit.id,
            moduleLabel: m.unit.label,
            leaf: m.leaf,
            part: m.at(worst.s).length > 0 ? partAt(m, solid, worst.s) : 'деталь',
            obstacleWall: other,
            obstacleModuleId: solid.moduleId,
            obstacleLabel: solid.label,
            obstaclePart: solid.part,
            depthMm: worst.depth,
            atS: worst.s,
            needMm: null,
            needWholeMm: null,
            fix: null,
            blocked: null,
            /* Подписи, а не id: id выводится из места, и после пересборки ряда у той же пары он другой. */
            pair: `${corner}|${wall}:${m.unit.label}:${m.leaf}|${other}:${solid.moduleId ? solid.label : solid.part}`,
          };
          clashes.push(clash);
          optionsOf.set(clash, options);
          if ((clash.part === 'ручка' && m.conditionalHandle) || solid.conditional) {
            told.add('ручки — условные скобы: позиции каталога не выбраны');
          }
        }
      }
    }
  }

  /*
   * ПАРА ДВЕРЕЦ ВЕРХНЕГО Г-МОДУЛЯ — ДРУГ МИМО ДРУГА (P0). Первая (Б) идёт
   * мимо закрытой А: у угла на её пути ручка А. Вторая (А) — мимо открытой Б:
   * свободные кромки обеих сходятся в один угол, и Б, открытая только на
   * 90°, стоит на пути А. Панелью это не снять — заход называется словами,
   * а для второй ищется угол раскрытия Б, при котором А проходит.
   */
  for (const list of moving) {
    for (const m of list) {
      const own = m.partner;
      if (!own) continue;
      const worstOver = (solids: Solid[]) => {
        let best: { depth: number; s: number; solid: Solid | null } = { depth: -Infinity, s: 0, solid: null };
        for (const solid of solids) {
          if (!boxesMeet(m.swept, solid.box)) continue;
          const w = worstOf(m, solid, [0, 0, 0]);
          if (w.depth > best.depth) best = { depth: w.depth, s: w.s, solid };
        }
        return best;
      };
      const found = worstOver(own.solids);
      if (!found.solid || found.depth <= TOUCH_MM) continue;
      let needDeg: number | null = null;
      if (own.openB) {
        for (let deg = own.angleDeg + 1; deg <= 180; deg += 1) {
          if (worstOver(own.openB((deg * Math.PI) / 180)).depth <= TOUCH_MM) {
            needDeg = deg;
            break;
          }
        }
      }
      const clash: CornerClash = {
        corner: own.corner,
        side: 'owner',
        level: 'upper',
        wall: m.wall,
        moduleId: m.unit.id,
        moduleLabel: m.unit.label,
        leaf: m.leaf,
        part: partAt(m, found.solid, found.s),
        obstacleWall: m.wall,
        obstacleModuleId: m.unit.id,
        obstacleLabel: m.unit.label,
        obstaclePart: found.solid.part,
        depthMm: found.depth,
        atS: found.s,
        needMm: null,
        needWholeMm: null,
        fix: null,
        blocked: null,
        pair: `${own.corner}|${m.wall}:${m.unit.label}:${m.leaf}|${m.wall}:${m.unit.label}:${own.leaf}`,
        own: {
          first: own.first,
          doorWall: own.doorWall,
          partnerWall: own.partnerWall,
          partnerAngleDeg: own.angleDeg,
          partnerKnown: own.known,
          needDeg,
        },
      };
      clashes.push(clash);
      optionsOf.set(clash, []);
      if (found.solid.conditional || m.conditionalHandle) told.add('ручки — условные скобы: позиции каталога не выбраны');
    }
  }

  /*
   * РЕШЕНИЕ ОДНО НА ПАРУ. Корпус, фасад, ручка и фурнитура пенала — одна
   * мебель: дай им разные решения, и пенал «отодвинут» и панелью владельца,
   * и сдвигом всего ряда соседа, а сдвиг ряда уводит его пеналы к другому
   * углу. Берётся решение, которое годится каждой коробке пары, с
   * наименьшим наибольшим сдвигом; не подействовавшее раньше (`avoid`) —
   * не берётся.
   */
  const pairs: CornerPair[] = [];
  const byPair = new Map<string, CornerClash[]>();
  for (const clash of clashes) byPair.set(clash.pair, [...(byPair.get(clash.pair) ?? []), clash]);
  const same = (a: PanelFix, b: PanelFix) => a.side === b.side && a.level === b.level;
  for (const [pair, list] of Array.from(byPair.entries())) {
    let best: { fix: PanelFix; whole: number } | null = null;
    /* Лучшее из негодных — для слов отказа: что понадобилось бы. */
    let blocked: { option: Option; whole: number } | null = null;
    for (const option of optionsOf.get(list[0]) ?? []) {
      if (avoid.has(fixKey(pair, option.fix))) continue;
      let whole = 0;
      let fits = true;
      let ok = true;
      for (const clash of list) {
        const mine = (optionsOf.get(clash) ?? []).find((o) => same(o.fix, option.fix));
        if (!mine) {
          fits = false;
          break;
        }
        whole = Math.max(whole, mine.need.whole);
        ok &&= allowed(mine);
      }
      if (!fits) continue;
      if (ok && whole <= option.limitMm) {
        if (!best || whole < best.whole) best = { fix: option.fix, whole };
        continue;
      }
      /*
       * Для слов отказа — только решение, которое правда двигает деталь:
       * ряд самой детали или ряд соседа, начало которого уходит от угла.
       * Панель владельца пенал в другом конце его ряда не двигает, и число
       * «развела бы N мм» про неё было бы неправдой.
       */
      const fixWall = wallOfRole(choiceOfCorner(runs, list[0].corner), list[0].corner, option.fix.level, option.fix.side);
      const honest = fixWall === list[0].wall || option.fix.side === 'dock';
      if (honest && (!blocked || whole < blocked.whole)) blocked = { option, whole };
    }
    pairs.push({ pair, corner: list[0].corner, fix: best?.fix ?? null, depthMm: Math.max(...list.map((clash) => clash.depthMm)) });
    if (!best) {
      if (blocked) {
        for (const clash of list) {
          clash.blocked = { fix: { ...blocked.option.fix }, needWholeMm: blocked.whole, widthMm: blocked.option.widthMm, limitMm: blocked.option.limitMm };
        }
      }
      continue;
    }
    for (const clash of list) {
      const mine = optionsOf.get(clash)!.find((o) => same(o.fix, best!.fix))!;
      clash.fix = { ...best.fix };
      clash.needMm = mine.need.exact;
      clash.needWholeMm = mine.need.whole;
    }
    const r = raise[list[0].corner];
    const key: keyof CornerRaise =
      best.fix.level === 'lower' ? (best.fix.side === 'dock' ? 'dockMm' : 'ownerMm') : best.fix.side === 'dock' ? 'upperDockMm' : 'upperOwnerMm';
    r[key] = Math.max(r[key], best.whole);
  }

  return {
    clashes,
    raise,
    unresolved: clashes.filter((clash) => clash.needMm === null),
    pairs,
    assumptions: Array.from(told),
  };
}

/** Какая коробка детали заходит глубже всех в этом положении — словами. */
function partAt(moving: Moving, solid: Solid, s: number): string {
  let best = { depth: -Infinity, part: 'деталь' };
  for (const { obb, part } of moving.at(s)) {
    const d = depthOf(obb, solid.obb);
    if (d > best.depth) best = { depth: d, part };
  }
  return best.part;
}

/** Заход двери витрины вдоль своего ряда (P1): что, во что и на сколько. */
export type RowSweepClash = {
  moduleId: string;
  moduleLabel: string;
  leaf: string;
  /** Чем задевает: «ручка» или «полотно». */
  part: string;
  obstacleModuleId: string | null;
  obstacleLabel: string;
  /** Во что — в винительном падеже: «корпус», «фасад», «ручку», «фальш-панель». */
  obstaclePart: string;
  depthMm: number;
  atS: number;
  /** Дверь витрины или створка кладовки своей глубины и её соседа (ЭТАП 4). */
  vitrine?: boolean;
};

/**
 * ХОД ДВЕРЕЙ ВИТРИНЫ ВДОЛЬ СВОЕГО РЯДА (P1).
 *
 * У угла ход меряет `cornerKinematics`; вдоль ряда не мерил никто — а витрина
 * на столешнице или в верхнем ряду стоит мельче пенала рядом, и дверь на
 * петлях у пенала на полном ходу встречает его боковину. Здесь та же
 * выборка (шаг 0,5°, уточнение максимумов), те же позы полотна и ручки
 * (`leafPoses` с выносом `doorKick`) и тот же заход по 15 осям — против
 * корпусов, фасадов, ручек и фальш-панелей ДРУГИХ модулей своего ряда.
 * Меряются двери витрин; ход обычных створок вдоль ряда держит вынос полотна
 * (ловушка 525), и его здесь не трогают.
 */
export function vitrineSweep(input: {
  run: Run;
  production: ProductionSettings;
  hardware?: Map<string, HardwareItem>;
}): { clashes: RowSweepClash[]; assumptions: string[] } {
  const { run, production, hardware } = input;
  /*
   * КЛАДОВКА НАД ХОЛОДИЛЬНИКОМ СВОЕЙ ГЛУБИНЫ (ЭТАП 4) — та же выборка: её
   * створки и створки соседей, что стоят с ней на одной высоте вплотную. При
   * глубине 560 рядом с антресолью 320 дверь соседа на петлях у кладовки на
   * ходу встречает её боковину. Глубина по умолчанию (антресоли цеха) — как у
   * соседа, ход держит вынос полотна (ловушка 525), и здесь его не мерят.
   */
  const entries = runPlaces(run);
  const ownStorage = entries.filter((entry) => entry.unit.section === 'mezzanine' && entry.unit.storageSize?.depthMm !== undefined);
  const nextTo = (entry: (typeof entries)[number], storage: (typeof entries)[number]) =>
    entry.unit.id !== storage.unit.id &&
    Math.abs(entry.depthM - storage.depthM) * MM > TOUCH_MM &&
    (entry.unit.offsetMm + entry.unit.widthMm === storage.unit.offsetMm || storage.unit.offsetMm + storage.unit.widthMm === entry.unit.offsetMm) &&
    entry.y < storage.y + storage.heightM &&
    storage.y < entry.y + entry.heightM;
  const storageIds = new Set(ownStorage.map((entry) => entry.unit.id));
  const neighbours = new Set(entries.filter((entry) => ownStorage.some((storage) => nextTo(entry, storage))).map((entry) => entry.unit.id));
  const storageSide = new Set<string>([...Array.from(storageIds), ...Array.from(neighbours)]);
  const isVitrine = (unit: Module) => vitrineOf(unit) !== null || storageSide.has(unit.id);
  if (!entries.some((entry) => isVitrine(entry.unit))) return { clashes: [], assumptions: [] };
  const told = new Set<string>();
  const place: RowPlace = { xM: 0, zM: 0, rotationYDeg: 0 };
  const grouped = shopBoxes(run, production, hardware);
  const solids = solidsOf(grouped, 0, place);
  const moving = movingOf(run, 0, place, production, hardware, grouped.modules.flatMap((m) => m.boxes), told, () => true, isVitrine);
  /* Одна строка на пару «дверь — модуль»: её самая глубокая коробка. */
  const deepest = new Map<string, RowSweepClash>();
  for (const m of moving) {
    /*
     * Сосед кладовки (ЭТАП 4) меряется только против самой кладовки: его ход
     * вдоль остального ряда держит вынос полотна (ловушка 525), и чужой заход,
     * не связанный с кладовкой, не должен всплывать оттого, что у неё своя глубина.
     */
    const onlyStorage = vitrineOf(m.unit) === null && neighbours.has(m.unit.id) && !storageIds.has(m.unit.id);
    for (const solid of solids) {
      if (solid.moduleId === m.unit.id) continue;
      if (onlyStorage && !(solid.moduleId && storageIds.has(solid.moduleId))) continue;
      if (!boxesMeet(m.swept, solid.box)) continue;
      const worst = worstOf(m, solid, [0, 0, 0]);
      if (worst.depth <= TOUCH_MM) continue;
      const key = `${m.unit.id}:${m.leaf}|${solid.moduleId ?? solid.label}`;
      const was = deepest.get(key);
      if (was && was.depthMm >= worst.depth) continue;
      deepest.set(key, {
        moduleId: m.unit.id,
        moduleLabel: m.unit.label,
        leaf: m.leaf,
        part: partAt(m, solid, worst.s),
        obstacleModuleId: solid.moduleId,
        obstacleLabel: solid.label,
        obstaclePart: solid.part,
        depthMm: worst.depth,
        atS: worst.s,
        vitrine: vitrineOf(m.unit) !== null,
      });
    }
  }
  return { clashes: Array.from(deepest.values()), assumptions: Array.from(told) };
}

/** Заход двери витрины словами: «дверь 1 витрины «Витрина» на ходу заходит в корпус модуля «Холодильник» на 12 мм». */
export function rowSweepWords(clash: RowSweepClash): string {
  const leaf = /^door:(\d+)$/.exec(clash.leaf);
  const door = leaf ? `дверь ${Number(leaf[1]) + 1}` : 'дверь';
  const subject = clash.part === 'ручка' ? `ручка: ${door}` : door;
  const into = clash.obstaclePart === 'фальш-панель' ? 'фальш-панель' : `${clash.obstaclePart} модуля «${clash.obstacleLabel}»`;
  /* Кладовка и её соседи (ЭТАП 4) — не витрины: «модуля», а не «витрины». */
  const whose = clash.vitrine === false ? 'модуля' : 'витрины';
  return `${subject} ${whose} «${clash.moduleLabel}» на ходу заходит в ${into} на ${formatMm(clash.depthMm)} мм`;
}

/** Заход двери духового шкафа на ходу (ЭТАП 3): что, во что и на сколько. */
export type ApplianceDoorClash = {
  /** Ряд двери — номер в `rows`. */
  row: number;
  moduleId: string;
  moduleLabel: string;
  /** Ключ двери в «Открыть всё» (`ovenDoorId`). */
  doorId: string;
  /** Чем задевает: «полотно» или «ручка». */
  part: string;
  obstacleRow: number;
  obstacleModuleId: string | null;
  obstacleLabel: string;
  /** Во что — в винительном падеже: «корпус», «фасад», «ручку», «фальш-панель». */
  obstaclePart: string;
  depthMm: number;
  /** Где наибольший заход: угол двери, градусы (0 — закрыта, 90 — горизонтально). */
  atDeg: number;
  /** Насколько открытая дверь выходит перед плоскостью корпусов, мм. */
  reachMm: number;
  /**
   * Заход не в мебель, а в комнату (ЭТАП 4): стену, колонну, короб, выступ.
   * `unknownDepth` — вынос объекта не замерен, и задето его наибольшее тело:
   * это «не проверено», а не «упирается».
   */
  room?: { wallId: string; wallIndex: number; kind?: OpeningKind; role: DoorRoomSolid['role']; unknownDepth: boolean };
};

/** Ход двери духового шкафа: 90° вниз — полотно встаёт горизонтально (`ovenShape`, сцена). */
const OVEN_DOOR_ANGLE = Math.PI / 2;

/**
 * ХОД ДВЕРИ ДУХОВОГО ШКАФА ПОД ВАРОЧНОЙ (ЭТАП 3).
 *
 * Дверь шкафа откидывается вниз на 90° вокруг нижней кромки и встаёт
 * горизонтально перед рядом — на полметра. Вдоль своего ряда её держит
 * ширина ниши; а НАПРОТИВ стоят ряд через проход П-образной и остров —
 * их `cornerKinematics` не меряет («держит проход»), а проход уже двери
 * её не пускает. Выборка та же, что у угла и витрины (шаг 0,5°, уточнение
 * максимумов, заход по 15 осям); дверь — те же детали, что рисует сцена
 * (`ovenShape`: полотно, окно, ручка), на той же оси (`door.pivotMm`);
 * препятствия — всё, что стоит мебелью: модули и фальш-панели всех рядов
 * объекта (`runBoxesByModule`), и свой модуль тоже — фасад под шкафом и
 * боковины ниши: ось не у той кромки уводит полотно в них.
 */
export function applianceDoorSweep(input: {
  /** Ряды объекта с местами — те же, что у сцены (`runPlacements`, остров — `islandPlacement`). */
  rows: { run: Run; placement: RowPlace }[];
  production: ProductionSettings;
  hardware?: Map<string, HardwareItem>;
  /**
   * Комната вокруг рядов (ЭТАП 4) — те же коробки, что рисует сцена
   * (`doorRoomSolids` из `roomAroundRows`): стена напротив, колонна, короб,
   * выступ. Без неё дверь, упёршаяся в стену коридора, проходила с ценой.
   */
  room?: DoorRoomSolid[];
}): ApplianceDoorClash[] {
  const { rows, production, hardware } = input;
  const doors: { row: number; moving: Moving; reachMm: number }[] = [];
  rows.forEach(({ run, placement }, row) => {
    /*
     * ДВЕРИ ДУХОВЫХ ШКАФОВ РЯДА: под варочной (ЭТАП 3) и в пенале и колонне
     * (ЭТАП 4, A5) — та же модель (`ovenShape`), та же ось у нижней кромки и
     * те же препятствия; место — у шкафа под панелью `cookingStackOf`, у
     * пенала — верх полки-опоры его ниши (`tallOvensOf`).
     */
    const ovens = [
      ...run.modules.flatMap((unit) => {
        if (unit.appliance !== 'hob' || !unit.ovenBelow) return [];
        const stack = cookingStackOf(unit, run, production);
        return stack?.ovenAt ? [{ unit, xMm: stack.hobAt.xMm, bottomMm: stack.ovenAt.bottomMm, model: stack.oven }] : [];
      }),
      ...tallOvensOf(run, production).map((oven) => ({ unit: oven.unit, xMm: oven.xMm, bottomMm: oven.bottomMm, model: oven.model })),
    ];
    for (const { unit, xMm, bottomMm, model } of ovens) {
      const shape = ovenShape(model);
      const [, pivotY, pivotZ] = shape.door.pivotMm;
      const pieces = shape.parts
        .filter((part) => 'moving' in part && part.moving === 'ovenDoor')
        .map((part) => {
          const size: V3 =
            part.kind === 'box'
              ? part.size
              : part.kind === 'rod'
                ? [part.length, part.radius * 2, part.radius * 2]
                : part.kind === 'cylinder'
                  ? [part.radius * 2, part.height, part.radius * 2]
                  : [part.outer * 2, 1, part.outer * 2];
          const center: V3 = part.kind === 'cylinder' ? [part.at[0], part.at[1] + part.height / 2, part.at[2]] : part.at;
          return { center, size, part: part.name === 'ручка' || part.name === 'держатель ручки' ? 'ручка' : 'полотно' };
        });
      /* Деталь в осях ряда при угле `t`: поворот вокруг оси двери, вдоль ряда. */
      const at = (s: number) => {
        const t = OVEN_DOOR_ANGLE * s;
        const c = Math.cos(t);
        const sn = Math.sin(t);
        return pieces.map((piece) => {
          const dy = piece.center[1] - pivotY;
          const dz = piece.center[2] - pivotZ;
          return {
            obb: obbOf(
              placement,
              [(xMm + piece.center[0]) / MM, (bottomMm + pivotY + dy * c - dz * sn) / MM, (pivotZ + dy * sn + dz * c) / MM],
              [piece.size[0] / MM, piece.size[1] / MM, piece.size[2] / MM],
              0,
              t,
            ),
            part: piece.part,
          };
        });
      };
      /* Дальняя от оси точка — для отбора максимумов на уточнение (как у створки: верхняя оценка, не допуск). */
      const reachFromPivot = Math.max(
        ...pieces.map((piece) => Math.hypot(Math.abs(piece.center[1] - pivotY) + piece.size[1] / 2, Math.abs(piece.center[2] - pivotZ) + piece.size[2] / 2)),
      );
      const steps = Math.ceil(((OVEN_DOOR_ANGLE * 180) / Math.PI) / 0.5);
      const speed = reachFromPivot * OVEN_DOOR_ANGLE;
      const pad = speed / steps;
      const samples: Moving['samples'] = [];
      let swept: Box | null = null;
      for (let i = 0; i <= steps; i += 1) {
        const obbs = at(i / steps).map((entry) => entry.obb);
        const boxes = obbs.map(boxOf);
        const box: Box = {
          min: [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b.min[k])) - pad) as V3,
          max: [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.max[k])) + pad) as V3,
        };
        samples.push({ obbs, box });
        swept = swept
          ? { min: [0, 1, 2].map((k) => Math.min(swept!.min[k], box.min[k])) as V3, max: [0, 1, 2].map((k) => Math.max(swept!.max[k], box.max[k])) as V3 }
          : box;
      }
      if (!swept) continue;
      /* Открытая дверь перед корпусом: передняя грань полотна в горизонтали — ось плюс полотно. */
      const reachMm = Math.round((pivotZ + Math.max(...pieces.map((piece) => piece.center[1] - pivotY + piece.size[1] / 2))) * 10) / 10;
      doors.push({
        row,
        reachMm,
        moving: {
          wall: row,
          unit,
          leaf: ovenDoorId(unit.id),
          level: 'lower',
          at,
          steps,
          speed,
          samples,
          swept,
          conditionalHandle: false,
        },
      });
    }
  });
  if (doors.length === 0) return [];

  const solids = [
    ...rows.flatMap(({ run, placement }, row) => solidsOf(shopBoxes(run, production, hardware), row, placement)),
    /* Комната — в том же мире, что ряды: `obbOf` с местом стены вместо места ряда. */
    ...(input.room ?? []).map((body): Solid => {
      const obb = obbOf({ xM: body.center[0], zM: body.center[2], rotationYDeg: body.rotationYDeg }, [0, body.center[1], 0], body.size);
      return { wall: -1, obb, box: boxOf(obb), moduleId: null, label: body.key, part: 'стену', conditional: false, level: null, room: body };
    }),
  ];
  /* Одна строка на пару «дверь — модуль»: её самая глубокая коробка. */
  const deepest = new Map<string, ApplianceDoorClash>();
  for (const { row, moving, reachMm } of doors) {
    for (const solid of solids) {
      if (!boxesMeet(moving.swept, solid.box)) continue;
      const worst = worstOf(moving, solid, [0, 0, 0]);
      if (worst.depth <= TOUCH_MM) continue;
      const key = `${moving.leaf}|${solid.wall}:${solid.moduleId ?? solid.label}`;
      const was = deepest.get(key);
      if (was && was.depthMm >= worst.depth) continue;
      deepest.set(key, {
        row,
        moduleId: moving.unit.id,
        moduleLabel: moving.unit.label,
        doorId: moving.leaf,
        part: partAt(moving, solid, worst.s),
        obstacleRow: solid.wall,
        obstacleModuleId: solid.moduleId,
        obstacleLabel: solid.label,
        obstaclePart: solid.part,
        depthMm: worst.depth,
        atDeg: Math.round(worst.s * ((OVEN_DOOR_ANGLE * 180) / Math.PI) * 10) / 10,
        reachMm,
        ...(solid.room
          ? {
              room: {
                wallId: solid.room.wallId,
                wallIndex: solid.room.wallIndex,
                ...(solid.room.kind ? { kind: solid.room.kind } : {}),
                role: solid.room.role,
                unknownDepth: solid.room.unknownDepth,
              },
            }
          : {}),
      });
    }
  }
  return Array.from(deepest.values()).sort((a, b) => a.row - b.row || b.depthMm - a.depthMm);
}

/**
 * Заход двери шкафа словами — последствие первым: «Духовой шкаф в модуле
 * «Варочная и духовой шкаф» стены В не открыть: дверь откидывается на 518,5 мм
 * перед корпусом и на ходу заходит в фасад модуля «2 дверцы» стены А на
 * 153,8 мм». Ряд в родительном падеже даёт вызывающий: словарь стен живёт в
 * `walls.ts`.
 */
export function applianceDoorWords(clash: ApplianceDoorClash, rowOf: (row: number) => string): string {
  const into =
    clash.obstaclePart === 'фальш-панель'
      ? `фальш-панель ${rowOf(clash.obstacleRow)}`
      : `${clash.obstaclePart} модуля «${clash.obstacleLabel}» ${rowOf(clash.obstacleRow)}`;
  const subject = clash.part === 'ручка' ? ', и её ручка' : ' и';
  return `Духовой шкаф в модуле «${clash.moduleLabel}» ${rowOf(clash.row)} не открыть: дверь откидывается на ${formatMm(clash.reachMm)} мм перед корпусом${subject} на ходу заходит в ${into} на ${formatMm(clash.depthMm)} мм`;
}

/**
 * ЗАХОД СЛОВАМИ — одна строка на экран, отказ композиции и отчёт.
 *
 * «ручка створки модуля «2 дверцы» стены В на ходу заходит в ручку модуля
 * «Варочная панель» стены Б на 4 мм». Название стены в родительном падеже
 * даёт вызывающий (`lowerWall(wallLabel(i), 'genitive')`): словарь стен
 * живёт в `walls.ts`, и второго здесь нет.
 */
export function clashWords(clash: CornerClash, wallOf: (wall: number) => string): string {
  if (clash.own) {
    /* Внутри пары дверец Г-модуля: «дверца стены Б углового шкафа … заходит в ручку его дверцы стены А». */
    const subject = clash.part === 'ручка' ? `ручка дверцы ${wallOf(clash.own.doorWall)}` : `дверца ${wallOf(clash.own.doorWall)}`;
    const partner = wallOf(clash.own.partnerWall);
    const into = clash.own.first
      ? clash.obstaclePart === 'ручку'
        ? `ручку дверцы ${partner}`
        : `закрытую дверцу ${partner}`
      : clash.obstaclePart === 'ручку'
        ? `ручку открытой дверцы ${partner}`
        : `открытую дверцу ${partner}`;
    return `${subject} углового шкафа «${clash.moduleLabel}» на ходу заходит в ${into} на ${formatMm(clash.depthMm)} мм`;
  }
  const kind = clash.leaf.startsWith('door') ? 'створк' : clash.leaf.startsWith('drawer') ? 'ящик' : 'фасад';
  const subject =
    clash.part === 'ручка'
      ? `ручка ${kind === 'створк' ? 'створки' : kind === 'ящик' ? 'ящика' : 'фасада'}`
      : kind === 'створк'
        ? clash.part === 'полотно' || clash.part === 'фасад'
          ? 'створка'
          : `створка (${clash.part})`
        : kind === 'ящик'
          ? clash.part === 'фасад'
            ? 'ящик'
            : `ящик (${clash.part})`
          : 'фасад';
  const into =
    clash.obstaclePart === 'фальш-панель'
      ? 'фальш-панель угла'
      : `${clash.obstaclePart} модуля «${clash.obstacleLabel}»`;
  return (
    `${subject} модуля «${clash.moduleLabel}» ${wallOf(clash.wall)} на ходу заходит в ${into} ` +
    `${wallOf(clash.obstacleWall)} на ${formatMm(clash.depthMm)} мм`
  );
}

/**
 * ПОЧЕМУ ЗАХОД НЕ СНЯТЬ ПАНЕЛЬЮ — словами: что понадобилось бы и почему
 * нельзя. Одна строка на отказ композиции и на смену угла.
 */
export function stuckWords(clash: CornerClash, choice: CornerChoice, wallOf: (wall: number) => string): string {
  if (clash.own) {
    const first = wallOf(clash.own.first ? clash.own.doorWall : clash.own.partnerWall);
    const second = wallOf(clash.own.first ? clash.own.partnerWall : clash.own.doorWall);
    if (clash.own.first) {
      return (
        `дверцы открываются по очереди: сначала дверца ${first}, потом ${second}, и ручка у угла стоит на пути первой — ` +
        'снимите её («Без ручки», как на видео) или верните две дверцы вместе («книжка»)'
      );
    }
    const angle = clash.own.partnerKnown
      ? `петля дверцы ${first} раскрывается на ${clash.own.partnerAngleDeg}°`
      : `петля каталога не выбрана — дверцы до ${clash.own.partnerAngleDeg}°, как в сцене`;
    return clash.own.needDeg !== null
      ? `дверца ${second} закрывает угол и открывается второй, после дверцы ${first}; ${angle}, а дверце ${first} нужен ` +
          `угол раскрытия не меньше ${clash.own.needDeg}° — поставьте петлю каталога с таким углом`
      : `дверца ${second} закрывает угол и открывается второй, после дверцы ${first}; ${angle}, и до 180° угол раскрытия ` +
          'этот заход не снимает — верните две дверцы вместе («книжка»)';
  }
  const b = clash.blocked;
  if (b) {
    return b.fix.level === 'upper' && choice.upper === 'empty'
      ? `развести можно, только сделав ${panelWords(choice, b.fix, clash.corner, wallOf)} шире на ${b.needWholeMm} мм, а ряда на это нет`
      : `развела бы ${panelWords(choice, b.fix, clash.corner, wallOf)} ${b.widthMm + b.needWholeMm} мм, ` +
          `а шире ${FALSE_PANEL_RANGE_MM[1]} мм — это уже модуль, а не панель`;
  }
  return clash.level === null
    ? 'у этой детали своего ряда у угла нет — панелью её не отодвинуть'
    : 'фальш-панелью у этого угла этот заход не снять';
}

/** Миллиметры словами: целые без дроби, иначе одна цифра после запятой. */
export function formatMm(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
}
