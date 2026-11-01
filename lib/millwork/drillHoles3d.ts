/**
 * ПРИСАДКА 3D (ТЗ 2026-10-31, § 10–11) — ОТОБРАЖЕНИЕ ОПЕРАЦИЙ ПЛАНА, А НЕ ВТОРОЙ РАСЧЁТ.
 *
 * Отверстия считает один `drillingPlan`: деталь, операция, X/Y в осях детали
 * (`PART_AXES`), пласть A/B или торец, Ø, глубина, источник. Здесь каждая
 * операция переносится на ту коробку, которую рисует сцена (`runBoxesByModule`),
 * по тем же осям: начало, направления X и Y, пласть A. Ни одного своего
 * числа отверстия здесь нет — только перевод координат. Деталь, которую
 * сцена не рисует, и операция без пласти и торца — не выдумываются, а
 * считаются (`unplaced`), чтобы экран сказал это словами.
 *
 * Координаты — метры ряда (как коробки `runBoxes`): сцена ставит отверстия
 * в группу своего ряда.
 */
import type { Run } from '@/types/millwork';
import type { DrillOp, DrillPart, DrillingPlan } from './drillingPlan';
import { runBoxesByModule, type PartBox, type RunBoxesOptions } from './cabinetBoxes';
import { BOTTOM_PANEL_NAME, SIDE_PANEL_NAME, TOP_PANEL_NAME } from './panels';

export type Hole3d = {
  wallId: string;
  partId: string;
  opId: string;
  role: DrillOp['role'];
  /** Устье отверстия на грани детали, метры ряда. */
  at: [number, number, number];
  /** Ось сверла — внутрь детали, единичный вектор. */
  dir: [number, number, number];
  diameterM: number;
  depthM: number;
  through: boolean;
  article: string | null;
  /**
   * Подвижная деталь, с которой отверстие едет (`part:<ИД>` сцены): створка или
   * фронт ящика — по ключу створки, царга — по ящику комплекта. Корпус не едет.
   */
  carrier?: string;
};

/** Коробка детали, на которую легли её отверстия, — подсветка и камера «Показать в 3D». */
export type Part3d = { wallId: string; partId: string; moduleId: string; name: string; number: string; position: [number, number, number]; scale: [number, number, number]; carrier?: string };

type Vec = [number, number, number];
type Frame = { origin: Vec; ax: Vec; ay: Vec; normalA: Vec; planeA: number; planeB: number; normalAxis: 0 | 1 | 2; lengthX: number; lengthY: number };

const MM = 1000;
const add = (a: Vec, b: Vec, k = 1): Vec => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

function extents(box: PartBox): { min: Vec; max: Vec } {
  return {
    min: [box.position[0] - box.scale[0] / 2, box.position[1] - box.scale[1] / 2, box.position[2] - box.scale[2] / 2],
    max: [box.position[0] + box.scale[0] / 2, box.position[1] + box.scale[1] / 2, box.position[2] + box.scale[2] / 2],
  };
}

/**
 * ОСИ ДЕТАЛИ В ОСЯХ РЯДА — словами `PART_AXES`: начало, куда идут X и Y, где
 * пласть A. Модуль нарисован от нуля вглубь (передняя плоскость — max Z).
 */
function frameOf(part: DrillPart, box: PartBox): Frame | null {
  const { min, max } = extents(box);
  const sz: Vec = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const left = part.role === 'side_left' || (part.role === 'drawer_side' && (part.leaf ?? '').endsWith(':side:1'));
  switch (part.role) {
    case 'side_left':
    case 'side_right':
      /* X — по высоте от нижнего торца, Y — от передней кромки; A — внутренняя пласть. */
      return { origin: [0, min[1], max[2]], ax: [0, 1, 0], ay: [0, 0, -1], normalA: [left ? 1 : -1, 0, 0], planeA: left ? max[0] : min[0], planeB: left ? min[0] : max[0], normalAxis: 0, lengthX: sz[1], lengthY: sz[2] };
    case 'door':
    case 'drawer_front':
      /* X — по высоте от нижнего торца, Y — от левой кромки при взгляде на лицо; A — лицо. */
      return { origin: [min[0], min[1], 0], ax: [0, 1, 0], ay: [1, 0, 0], normalA: [0, 0, 1], planeA: max[2], planeB: min[2], normalAxis: 2, lengthX: sz[1], lengthY: sz[0] };
    case 'drawer_side':
      /* X — по длине от передней кромки, Y — по высоте от нижней кромки; A — внутренняя пласть. */
      return { origin: [0, min[1], max[2]], ax: [0, 0, -1], ay: [0, 1, 0], normalA: [left ? 1 : -1, 0, 0], planeA: left ? max[0] : min[0], planeB: left ? min[0] : max[0], normalAxis: 0, lengthX: sz[2], lengthY: sz[1] };
    case 'bottom':
    case 'top':
      /* X — по длине от левого торца, Y — от передней кромки; A — верхняя у дна, нижняя у крыши. */
      return {
        origin: [min[0], 0, max[2]],
        ax: [1, 0, 0],
        ay: [0, 0, -1],
        normalA: [0, part.role === 'bottom' ? 1 : -1, 0],
        planeA: part.role === 'bottom' ? max[1] : min[1],
        planeB: part.role === 'bottom' ? min[1] : max[1],
        normalAxis: 1,
        lengthX: sz[0],
        lengthY: sz[2],
      };
    default:
      return null;
  }
}

/** Коробка детали в сцене: та же, что нарисована (боковины — слева и справа, фасад — по ключу створки, короб — по ИД). */
function boxOf(part: DrillPart, boxes: PartBox[]): PartBox | null {
  switch (part.role) {
    case 'side_left':
    case 'side_right': {
      const sides = boxes.filter((b) => b.panel === SIDE_PANEL_NAME && !b.part).sort((a, b) => a.position[0] - b.position[0]);
      if (sides.length < 2) return null;
      return part.role === 'side_left' ? sides[0] : sides[sides.length - 1];
    }
    case 'door':
    case 'drawer_front': {
      if (!part.leaf) return null;
      const key = part.leaf.startsWith(`${part.moduleId}:`) ? part.leaf : `${part.moduleId}:${part.leaf}`;
      const fronts = boxes.filter((b) => b.material === 'front' && b.part === key);
      return fronts.sort((a, b) => b.scale[0] * b.scale[1] - a.scale[0] * a.scale[1])[0] ?? null;
    }
    case 'drawer_side':
      return part.leaf ? (boxes.find((b) => b.partId === part.leaf) ?? null) : null;
    case 'bottom':
      return boxes.find((b) => b.panel === BOTTOM_PANEL_NAME && !b.part) ?? null;
    case 'top':
      return boxes.find((b) => b.panel === TOP_PANEL_NAME && !b.part) ?? null;
    default:
      return null;
  }
}

/** С чем деталь едет в сцене: створка, фронт ящика, короб ящика (`<модуль>:drawer:<n>`). */
function carrierOf(part: DrillPart): string | undefined {
  if (!part.leaf) return undefined;
  if (part.role === 'door' || part.role === 'drawer_front') return part.leaf.startsWith(`${part.moduleId}:`) ? part.leaf : `${part.moduleId}:${part.leaf}`;
  if (part.role === 'drawer_side') return part.leaf.replace(/:box:.*$/, '');
  return undefined;
}

/** Операция → устье и ось сверла на грани коробки. */
function holeOf(part: DrillPart, op: DrillOp, f: Frame): { at: Vec; dir: Vec } | null {
  const mm = (v: number) => v / MM;
  const onPlane = (p: Vec, plane: number): Vec => {
    const q: Vec = [...p];
    q[f.normalAxis] = plane;
    return q;
  };
  if (op.face) {
    const p = add(add(f.origin, f.ax, mm(op.xMm)), f.ay, mm(op.yMm));
    const into: Vec = op.face === 'A' ? [-f.normalA[0], -f.normalA[1], -f.normalA[2]] : f.normalA;
    return { at: onPlane(p, op.face === 'A' ? f.planeA : f.planeB), dir: into };
  }
  if (op.edge && op.zMm !== undefined) {
    /* Торец: точка на кромке, `zMm` — от пласти A внутрь; сверло — вдоль оси детали внутрь. */
    const depthPoint = f.planeA - (f.normalA[f.normalAxis] * op.zMm) / MM;
    const alongX = op.edge === 'x0' || op.edge === 'x1';
    const base = alongX ? add(f.origin, f.ay, mm(op.yMm)) : add(f.origin, f.ax, mm(op.xMm));
    const atEdge = alongX ? add(base, f.ax, op.edge === 'x0' ? 0 : f.lengthX) : add(base, f.ay, op.edge === 'y0' ? 0 : f.lengthY);
    const dirAxis = alongX ? f.ax : f.ay;
    const sign = op.edge === 'x0' || op.edge === 'y0' ? 1 : -1;
    return { at: onPlane(atEdge, depthPoint), dir: [dirAxis[0] * sign, dirAxis[1] * sign, dirAxis[2] * sign] };
  }
  void part;
  return null;
}

/**
 * ОТВЕРСТИЯ ПЛАНА НА КОРОБКАХ СЦЕНЫ. `walls` — ряды стен с теми же
 * настройками, что у сцены (`RunBoxesOptions`). Деталь без коробки и операция
 * без пласти — в `unplaced` поимённо, отверстие не придумывается.
 */
export function drillHoles3d(
  plan: DrillingPlan,
  walls: { wallId: string; run: Run }[],
  options: RunBoxesOptions,
): { holes: Hole3d[]; parts: Part3d[]; unplaced: { partId: string; opId?: string; why: string }[] } {
  const holes: Hole3d[] = [];
  const parts: Part3d[] = [];
  const unplaced: { partId: string; opId?: string; why: string }[] = [];
  for (const wall of walls) {
    const modules = runBoxesByModule(wall.run, options).modules;
    for (const part of plan.parts.filter((p) => p.wallId === wall.wallId && p.ops.length > 0)) {
      const boxes = modules.find((m) => m.unit.id === part.moduleId)?.boxes ?? [];
      const box = boxOf(part, boxes);
      const frame = box ? frameOf(part, box) : null;
      if (!box || !frame) {
        unplaced.push({ partId: part.partId, why: box ? `оси детали «${part.name}» в сцене не заданы` : `деталь «${part.name}» в сцене не нарисована` });
        continue;
      }
      parts.push({ wallId: wall.wallId, partId: part.partId, moduleId: part.moduleId, name: part.name, number: part.number, position: [...box.position], scale: [...box.scale], ...(carrierOf(part) ? { carrier: carrierOf(part) } : {}) });
      for (const op of part.ops) {
        const h = holeOf(part, op, frame);
        if (!h) {
          unplaced.push({ partId: part.partId, opId: op.id, why: 'у операции нет ни пласти, ни торца с глубиной от пласти' });
          continue;
        }
        holes.push({
          wallId: wall.wallId,
          partId: part.partId,
          opId: op.id,
          role: op.role,
          at: h.at,
          dir: h.dir,
          diameterM: op.diameterMm / MM,
          depthM: op.depthMm / MM,
          through: op.through,
          article: op.article,
          ...(carrierOf(part) ? { carrier: carrierOf(part) } : {}),
        });
      }
    }
  }
  return { holes, parts, unplaced };
}
