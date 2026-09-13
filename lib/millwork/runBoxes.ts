import { moduleBoxes, type PartBox } from './cabinetBoxes';
import { countertopMm, plinthMm, rowDepthMm, workTopMm } from './shop';
import { GEOMETRY } from './modules';
import { moduleCarcassHeightMm, moduleDepthMm, upperBottomFor } from './fill';
import { zoneProfile } from './zones';
import type { Module, Run } from '@/types/millwork';

/**
 * КОРОБКИ РЯДА, СГРУППИРОВАННЫЕ ПО МОДУЛЯМ.
 *
 * Те же числа, что дают `cabinetBoxes` печатной аксонометрии и старой сцене:
 * третьего набора геометрии в продукте быть не должно. Отличие одно — здесь
 * коробки НЕ теряют модуль, которому принадлежат.
 *
 * Ради этого модуль и заведён. `buildAxonometry` сразу проецирует всё в
 * плоскость листа и модуль забывает: для печати он и не нужен. А технической
 * сцене нужен на каждом шагу — по нему идёт клик, подсветка рёбер и подпись
 * ширины над модулем.
 *
 * Совпадение с печатной аксонометрией проверяется приёмкой по числу коробок
 * и габариту: разъедутся — объём на экране покажет не ту мебель, что на
 * листе, и это заметят на монтаже, а не на встрече.
 */

const MM = 1000;

export type ModuleBoxes = {
  moduleId: string;
  unit: Module;
  /** Верхний ряд: у него своя глубина и своя отметка низа. */
  upper: boolean;
  boxes: PartBox[];
  /** Габарит модуля в метрах — по нему ставится зона клика и подпись. */
  x: number;
  y: number;
  widthM: number;
  heightM: number;
  depthM: number;
};

export type RunBoxes = {
  modules: ModuleBoxes[];
  /**
   * Цоколь и столешница — детали РЯДА, а не модуля.
   *
   * Кликом они не выбираются: заказывают их погонными метрами, а правят
   * переключателями комплектации. Но в кадре они обязаны быть — без
   * столешницы ряд не читается кухней, без цоколя висит в воздухе.
   */
  shared: PartBox[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
};

export type RunBoxOptions = {
  thicknessMm: number;
  frontMm: number;
  gapMm: number;
  /** Фасады сняты: наполнение видно насквозь. */
  cutaway?: boolean;
  integratedHandles?: boolean;
};

export function runModuleBoxes(run: Run, options: RunBoxOptions): RunBoxes {
  const zone = zoneProfile(run.zone ?? 'kitchen');
  const depthM = (zone.depthMm ?? rowDepthMm('base', run.production)) / MM;
  const thicknessM = options.thicknessMm / MM;

  const frontOptions = {
    gapM: options.gapMm / MM,
    frontThicknessM: options.frontMm / MM,
    integratedHandles: Boolean(options.integratedHandles ?? run.options.integratedHandles),
    cutaway: Boolean(options.cutaway),
  };

  const modules: ModuleBoxes[] = [];

  const place = (unit: Module, upper: boolean): void => {
    const heightMm = moduleCarcassHeightMm(unit, run);

    const placement = {
      x: unit.offsetMm / MM,
      y: upper ? upperBottomFor(unit, run) / MM : plinthMm(run.production) / MM,
      heightM: heightMm / MM,
      depthM: upper ? moduleDepthMm(unit, run.zone, run.production) / MM : depthM,
      thicknessM,
    };

    modules.push({
      moduleId: unit.id,
      unit,
      upper,
      boxes: moduleBoxes(unit, placement, frontOptions),
      x: placement.x,
      y: placement.y,
      widthM: unit.widthMm / MM,
      heightM: placement.heightM,
      depthM: placement.depthM,
    });
  };

  for (const unit of run.modules) place(unit, false);
  for (const segment of run.upperSegments) {
    for (const unit of segment.modules) place(unit, true);
  }

  const lengthM = run.lengthMm / MM;
  const shared: PartBox[] = [
    {
      material: 'carcass',
      position: [lengthM / 2, plinthMm(run.production) / MM / 2, -depthM / 2 - 0.025],
      scale: [lengthM, plinthMm(run.production) / MM, depthM - 0.05],
    },
  ];

  // Столешница поверх нижнего ряда — по ней ряд читается кухней.
  if (zone.hasCountertop) {
    const counterY =
      (workTopMm(run.production) - countertopMm(run.production) / 2) / MM;
    shared.push({
      material: 'metal',
      position: [lengthM / 2, counterY, -depthM / 2 + 0.0125],
      scale: [lengthM, countertopMm(run.production) / MM, depthM + 0.025],
    });
  }

  const all = [...modules.flatMap((m) => m.boxes), ...shared];
  return { modules, shared, bounds: boundsOf(all) };
}

/** Габарит по коробкам. Пустой список даёт нулевой габарит, а не NaN. */
export function boundsOf(boxes: PartBox[]): RunBoxes['bounds'] {
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };

  for (const box of boxes) {
    const [px, py, pz] = box.position;
    const [sx, sy, sz] = box.scale;
    bounds.minX = Math.min(bounds.minX, px - sx / 2);
    bounds.maxX = Math.max(bounds.maxX, px + sx / 2);
    bounds.minY = Math.min(bounds.minY, py - sy / 2);
    bounds.maxY = Math.max(bounds.maxY, py + sy / 2);
    bounds.minZ = Math.min(bounds.minZ, pz - sz / 2);
    bounds.maxZ = Math.max(bounds.maxZ, pz + sz / 2);
  }

  if (!Number.isFinite(bounds.minX)) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  }
  return bounds;
}

/* ─────────────────────────  Рёбра одной пачкой  ───────────────────────── */

/** Двенадцать рёбер единичного куба: пары индексов вершин. */
const CUBE_EDGES: [number, number][] = [
  [0, 1], [1, 3], [3, 2], [2, 0],
  [4, 5], [5, 7], [7, 6], [6, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/**
 * РЁБРА ВСЕХ КОРОБОК ОДНИМ БУФЕРОМ.
 *
 * Это ответ на вопрос производительности. `EdgesGeometry` на каждую коробку
 * дал бы на ряде 5000 мм тысячи объектов, тысячи вызовов отрисовки и
 * неотзывчивый планшет — ту самую беду, из-за которой старую сцену пришлось
 * переводить на инстансы.
 *
 * Здесь все рёбра складываются в ОДИН плоский массив вершин и рисуются
 * одним `LineSegments` — один вызов отрисовки на весь гарнитур, сколько бы
 * в нём ни было ящиков. Пересобирается только при смене состава.
 */
export function edgeVertices(boxes: PartBox[]): Float32Array {
  const out = new Float32Array(boxes.length * CUBE_EDGES.length * 6);
  let at = 0;

  for (const box of boxes) {
    const [px, py, pz] = box.position;
    const [sx, sy, sz] = box.scale;
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;

    // Вершины куба в порядке, на который рассчитан CUBE_EDGES.
    const vx = [px - hx, px + hx];
    const vy = [py - hy, py + hy];
    const vz = [pz - hz, pz + hz];
    const corner = (i: number): [number, number, number] => [
      vx[i & 1],
      vy[(i >> 1) & 1],
      vz[(i >> 2) & 1],
    ];

    for (const [a, b] of CUBE_EDGES) {
      const from = corner(a);
      const to = corner(b);
      out[at++] = from[0];
      out[at++] = from[1];
      out[at++] = from[2];
      out[at++] = to[0];
      out[at++] = to[1];
      out[at++] = to[2];
    }
  }

  return out;
}
