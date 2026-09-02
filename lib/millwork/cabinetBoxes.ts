import { columnNiches } from '@/lib/millwork/fill';
import type { Module } from '@/types/millwork';

/**
 * КОРПУС МОДУЛЯ ЧИСЛАМИ.
 *
 * Боковины, дно, крыша, задняя стенка, полки и перегородка — это восемь
 * одинаковых коробок на модуль, отличающихся только положением и
 * размером. В ряду из тринадцати модулей их под сотню, и каждая была
 * отдельным мешем: сотня вызовов отрисовки на мебель, которая не
 * двигается вовсе.
 *
 * Поэтому корпус описывается ЧИСЛАМИ, а рисуется одним `InstancedMesh`
 * ([InstancedBoxes.tsx](components/millwork/cabinet3d/InstancedBoxes.tsx)).
 * Двери и ящики сюда не входят: они ездят, и у каждого своя матрица.
 *
 * Единственный источник геометрии корпуса — этот файл. Полки берутся из
 * `fill` КАК ЕСТЬ: они уже сели на систему 32, и второй расчёт развёл бы
 * 3D с чертежом и детализировкой.
 */

const MM = 1000;

/** Коробка в координатах ряда: где стоит и какого размера. */
export type BoxDraw = {
  position: [number, number, number];
  scale: [number, number, number];
};

/** Материал коробки: по нему они собираются в группы отрисовки. */
export type BoxMaterial = 'carcass' | 'front' | 'metal' | 'appliance';

export type PartBox = BoxDraw & {
  material: BoxMaterial;
  /**
   * Идентификатор подвижной детали. Пока дверца закрыта, она рисуется
   * вместе со всеми одним вызовом; открылась — уходит из общей отрисовки
   * и едет своим мешем.
   */
  part?: string;
};

export type ModulePlacement = {
  /** Левый край модуля от левого края ряда, метры. */
  x: number;
  /** Низ корпуса от пола, метры. */
  y: number;
  heightM: number;
  depthM: number;
  thicknessM: number;
};

export function carcassBoxes(unit: Module, place: ModulePlacement): BoxDraw[] {
  const { x, y, heightM, depthM, thicknessM } = place;
  const widthM = unit.widthMm / MM;
  const fill = unit.fill;

  // Внутренние размеры считаются той же формулой, что в детализировке:
  // разойдись они — клиент увидит одно, а цех получит другое.
  const innerW = Math.max(0.05, widthM - 2 * thicknessM);
  const innerDepth = depthM - thicknessM;

  const at = (dx: number, dy: number, dz: number, w: number, h: number, d: number): BoxDraw => ({
    position: [x + dx, y + dy, dz],
    scale: [w, h, d],
  });

  const boxes: BoxDraw[] = [
    // Боковины
    at(thicknessM / 2, heightM / 2, -depthM / 2, thicknessM, heightM, depthM),
    at(widthM - thicknessM / 2, heightM / 2, -depthM / 2, thicknessM, heightM, depthM),
    // Дно и крыша
    at(widthM / 2, thicknessM / 2, -depthM / 2, innerW, thicknessM, depthM),
    at(widthM / 2, heightM - thicknessM / 2, -depthM / 2, innerW, thicknessM, depthM),
    // Задняя стенка
    at(widthM / 2, heightM / 2, -depthM + 0.004, widthM, heightM, 0.004),
  ];

  /*
   * Полки — ровно на тех высотах, что стоят на чертеже. Высота отсчитана
   * от НИЗА МОДУЛЯ, как в `fill`: перевод в высоту от пола делает только
   * чертёж, и делать его здесь второй раз незачем.
   */
  for (const mm of fill?.shelves ?? []) {
    boxes.push(
      at(widthM / 2, mm / MM, -depthM / 2 - 0.01, innerW - 0.002, thicknessM, innerDepth),
    );
  }

  // Вертикальная перегородка
  if (fill && fill.dividerMm > 0) {
    boxes.push(
      at(
        fill.dividerMm / MM,
        heightM / 2,
        -depthM / 2 - 0.01,
        thicknessM,
        heightM - 2 * thicknessM,
        innerDepth,
      ),
    );
  }

  return boxes;
}


/** Параметры цеха, от которых зависит вид фасада. */
export type FrontOptions = {
  gapM: number;
  frontThicknessM: number;
  integratedHandles: boolean;
  cutaway: boolean;
};

/**
 * Техника, которую ВИДНО в кадре.
 *
 * Холодильник, посудомойка и мойка встроены за фасад: в реальной кухне на
 * их месте обычная дверца, а не чёрная плита. Тёмными остаются только
 * приборы со своей лицевой панелью.
 */
const VISIBLE_APPLIANCES = new Set(['oven', 'hob', 'hood', 'microwave']);

export function hasVisibleAppliance(unit: Module): boolean {
  return (
    Boolean(unit.appliance) &&
    !unit.column &&
    (VISIBLE_APPLIANCES.has(unit.appliance as string) || unit.builtIn === false)
  );
}

/** Сторона петель у одностворчатого модуля — та же, что на чертеже. */
export function doorHinge(unit: Module, index: number, doors: number): 'left' | 'right' {
  if (doors > 1) return index === 0 ? 'left' : 'right';
  return unit.fill?.hinge === 'right' ? 'right' : 'left';
}

/** Сколько створок у модуля: тот же расчёт, что в сцене и на чертеже. */
export function doorCount(unit: Module): number {
  return Math.max(1, unit.doorCount);
}

/**
 * Фасад одной створки в ЗАКРЫТОМ положении и его ручка.
 *
 * Эти же числа берёт `InteractiveDoor`, когда дверь открыта и едет своим
 * мешем: пока положение считается в одном месте, закрытая и открытая
 * дверь не могут оказаться разной мебелью.
 */
export function doorBoxes(
  unit: Module,
  place: ModulePlacement,
  index: number,
  options: FrontOptions,
): PartBox[] {
  if (options.cutaway) return [];

  const { x, y, heightM } = place;
  const doors = doorCount(unit);
  const widthM = unit.widthMm / MM;
  const doorW = widthM / doors;
  const hinge = doorHinge(unit, index, doors);

  const { gapM: gap, frontThicknessM: thickness, integratedHandles } = options;
  const hingeX = x + index * doorW + (hinge === 'left' ? 0 : doorW);
  const panelX = hinge === 'left' ? doorW / 2 : -doorW / 2;
  const cx = hingeX + panelX;
  const cy = y + heightM / 2;
  const part = unit.id + ':door:' + index;

  const handle: PartBox = integratedHandles
    ? {
        material: 'metal',
        part,
        position: [cx, cy + heightM / 2 - gap - 0.01, thickness + 0.004],
        scale: [doorW - 2 * gap, 0.02, 0.015],
      }
    : {
        material: 'metal',
        part,
        position: [
          cx + (hinge === 'left' ? doorW / 2 - 0.05 : -doorW / 2 + 0.05),
          cy,
          thickness + 0.012,
        ],
        scale: [0.016, Math.min(0.22, heightM * 0.4), 0.016],
      };

  return [
    {
      material: 'front',
      part,
      position: [cx, cy, thickness / 2],
      scale: [doorW - 2 * gap, heightM - 2 * gap, thickness],
    },
    handle,
  ];
}

/** Ящик в задвинутом положении: короб, фронт и ручка. */
export function drawerBoxes(
  unit: Module,
  place: ModulePlacement,
  index: number,
  options: FrontOptions,
): PartBox[] {
  const fill = unit.fill;
  if (!fill) return [];

  const { x, y, heightM, depthM, thicknessM } = place;
  const widthM = unit.widthMm / MM;
  const innerDepth = depthM - thicknessM;
  const frontMm = fill.drawerHeights[index];
  if (frontMm === undefined) return [];

  // Высоты идут сверху вниз, а сцена считает от пола.
  const above = fill.drawerHeights.slice(0, index).reduce((sum, h) => sum + h, 0);
  const bottomMm = Math.max(0, heightM * MM - above - frontMm);

  const height = frontMm / MM;
  const cx = x + widthM / 2;
  const cy = y + bottomMm / MM + height / 2;
  const part = unit.id + ':drawer:' + index;

  const { gapM: gap, frontThicknessM: thickness, integratedHandles, cutaway } = options;
  const boxH = Math.max(0.06, height - 0.04);
  const inner = Math.max(0.05, widthM - 2 * thickness);

  const boxes: PartBox[] = [
    // Короб: дно, две боковины, задняя стенка.
    {
      material: 'carcass',
      part,
      position: [cx, cy - boxH / 2 + thickness / 2, 0],
      scale: [inner, thickness, innerDepth * 0.9],
    },
    {
      material: 'carcass',
      part,
      position: [cx - inner / 2, cy, 0],
      scale: [thickness, boxH, innerDepth * 0.9],
    },
    {
      material: 'carcass',
      part,
      position: [cx + inner / 2, cy, 0],
      scale: [thickness, boxH, innerDepth * 0.9],
    },
    {
      material: 'carcass',
      part,
      position: [cx, cy, -innerDepth * 0.45],
      scale: [inner, boxH, thickness],
    },
  ];

  if (cutaway) return boxes;

  boxes.push({
    material: 'front',
    part,
    position: [cx, cy, innerDepth / 2 + thickness / 2],
    scale: [widthM - 2 * gap, height - 2 * gap, thickness],
  });

  boxes.push(
    integratedHandles
      ? {
          material: 'metal',
          part,
          position: [cx, cy + height / 2 - gap - 0.01, innerDepth / 2 + thickness + 0.004],
          scale: [widthM - 2 * gap, 0.02, 0.015],
        }
      : {
          material: 'metal',
          part,
          position: [cx, cy, innerDepth / 2 + thickness + 0.012],
          scale: [Math.min(0.26, widthM * 0.5), 0.016, 0.016],
        },
  );

  return boxes;
}

/**
 * Техника: тёмный блок в нише и панель управления.
 *
 * Ниши колонны берутся из `columnNiches` — той же функции, что рисует
 * чертёж: посчитай их здесь заново, и 3D разойдётся с эскизом.
 */
export function applianceBoxes(unit: Module, place: ModulePlacement): PartBox[] {
  const { x, y, heightM, depthM } = place;
  const widthM = unit.widthMm / MM;
  const boxes: PartBox[] = [];

  if (hasVisibleAppliance(unit)) {
    boxes.push({
      material: 'appliance',
      position: [x + widthM / 2, y + heightM / 2, -depthM / 2 + 0.01],
      scale: [widthM - 0.05, heightM - 0.05, depthM - 0.06],
    });
    // Панель управления: по ней прибор узнаётся без подписи.
    boxes.push({
      material: 'metal',
      position: [x + widthM / 2, y + heightM - 0.09, -depthM / 2 + 0.03],
      scale: [widthM - 0.09, 0.02, 0.01],
    });
  }

  for (const niche of unit.column ? columnNiches(unit, heightM * MM) : []) {
    const nicheH = (niche.toMm - niche.fromMm) / MM;
    boxes.push({
      material: 'appliance',
      position: [x + widthM / 2, y + niche.fromMm / MM + nicheH / 2, -depthM / 2 + 0.01],
      scale: [widthM - 0.05, nicheH - 0.02, depthM - 0.06],
    });
  }

  return boxes;
}

/**
 * ВСЁ НЕПОДВИЖНОЕ У МОДУЛЯ ОДНИМ СПИСКОМ.
 *
 * Корпус, закрытые фасады, ручки и техника. Открытая дверца и выехавший
 * ящик сюда не попадают: их рисует свой меш, и только пока они едут.
 */
export function moduleBoxes(
  unit: Module,
  place: ModulePlacement,
  options: FrontOptions,
): PartBox[] {
  const boxes: PartBox[] = carcassBoxes(unit, place).map((box) => ({
    ...box,
    material: 'carcass' as const,
  }));

  boxes.push(...applianceBoxes(unit, place));

  const isDisplay = unit.section === 'glass_display';

  if (!unit.appliance) {
    const drawers = unit.fill?.drawerHeights.length ?? 0;
    for (let i = 0; i < drawers; i += 1) boxes.push(...drawerBoxes(unit, place, i, options));
  }

  if (!options.cutaway && !hasVisibleAppliance(unit) && !unit.column && !isDisplay) {
    for (let i = 0; i < doorCount(unit); i += 1) boxes.push(...doorBoxes(unit, place, i, options));
  }

  return boxes;
}
