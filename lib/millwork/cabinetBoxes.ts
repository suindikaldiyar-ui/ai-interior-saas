import { columnNiches, moduleCarcassHeightMm } from '@/lib/millwork/fill';
import { GEOMETRY } from './modules';
import { FRAME_WIDTH_MM, frontKey, frontOf, isFramed } from './frontMaterial';
import { openingOf } from './opening';
import type { Module, Run } from '@/types/millwork';

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
  /** Деталь стоит ВНУТРИ корпуса: за закрытым фасадом её не видно. */
  inside?: boolean;
};

/** Материал коробки: по нему они собираются в группы отрисовки. */
export type BoxMaterial = 'carcass' | 'front' | 'metal' | 'appliance';

export type PartBox = BoxDraw & {
  material: BoxMaterial;
  /**
   * Какой именно фасад. Модули с ОДИНАКОВЫМ материалом обязаны попадать
   * в одну пачку отрисовки: ключ и есть признак этой пачки. Без него
   * ряд из тринадцати модулей снова стал бы тринадцатью вызовами.
   *
   * У корпуса, металла и техники ключа нет — там материал один на сцену.
   */
  frontKey?: string;
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

  const at = (
    dx: number,
    dy: number,
    dz: number,
    w: number,
    h: number,
    d: number,
    inside = false,
  ): BoxDraw => ({
    position: [x + dx, y + dy, dz],
    scale: [w, h, d],
    /*
     * ДЕТАЛЬ ВНУТРИ ИЛИ СНАРУЖИ.
     *
     * Полка и перегородка стоят за закрытым фасадом: их не видно, пока
     * дверь не открыли. Рёбра по ним рисовать нельзя — именно из-за
     * внутренних линий сплошная мебель читается каркасом.
     */
    inside,
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
      at(widthM / 2, mm / MM, -depthM / 2 - 0.01, innerW - 0.002, thicknessM, innerDepth, true),
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
        true,
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

/**
 * Куда открывается ЭТА створка.
 *
 * У двух створок стороны очевидны. У одной — то, что выбрано, и берётся
 * оно из `openingOf`: сцена, чертёж и смета обязаны читать одно поле,
 * иначе фасад откроется не туда, куда указывает диагональ на листе.
 */
export function doorOpening(
  unit: Module,
  index: number,
  doors: number,
): 'left' | 'right' | 'lift' | 'flap' {
  if (doors > 1) return index === 0 ? 'left' : 'right';
  const { opening } = openingOf(unit);
  if (opening === 'lift' || opening === 'flap' || opening === 'right') return opening;
  return 'left';
}

/** Сторона петель у одностворчатого модуля — та же, что на чертеже. */
export function doorHinge(unit: Module, index: number, doors: number): 'left' | 'right' {
  const opening = doorOpening(unit, index, doors);
  return opening === 'right' ? 'right' : 'left';
}

/** Сколько створок у модуля: тот же расчёт, что в сцене и на чертеже. */
export function doorCount(unit: Module): number {
  return Math.max(1, unit.doorCount);
}

/** Распахнутая створка: 90°. */
export const OPEN_ANGLE = Math.PI / 2;

/**
 * ГДЕ СТОИТ ОСЬ И ВОКРУГ ЧЕГО ИДЁТ ПОВОРОТ.
 *
 * Все четыре оси лежат на ПЕРЕДНЕЙ плоскости корпуса (z = 0) и на краю
 * полотна: у распашного — на петельном, у подъёмника — на верхнем, у
 * откидного — на нижнем. Знак угла подобран так, чтобы фасад уходил
 * ВПЕРЁД, наружу: тот же поворот в другую сторону утапливает полотно в
 * корпус, и мебель на глазах разваливается.
 */
export function doorPivot(
  opening: 'left' | 'right' | 'lift' | 'flap',
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (opening === 'lift') {
    return {
      axis: 'x' as const,
      angle: -OPEN_ANGLE,
      origin: [x + width / 2, y + height, 0] as [number, number, number],
      panel: [0, -height / 2, 0] as [number, number, number],
    };
  }
  if (opening === 'flap') {
    return {
      axis: 'x' as const,
      angle: OPEN_ANGLE,
      origin: [x + width / 2, y, 0] as [number, number, number],
      panel: [0, height / 2, 0] as [number, number, number],
    };
  }

  /*
   * ЗНАК ПОВОРОТА У РАСПАШНОГО.
   *
   * Корпус нарисован ОТ НУЛЯ ВГЛУБЬ (z от 0 до −depth), комната — со
   * стороны +z. Поворот вокруг Y на +90° уводит полотно в −z, то есть
   * СКВОЗЬ корпус: дверь открывалась внутрь шкафа. Глазами это заметно
   * только если открыть створку, а нажать на неё до вчерашнего дня было
   * негде — поэтому и жило. Ловится числом: центр открытого полотна
   * обязан оказаться перед фасадом, а не за ним.
   */
  const left = opening === 'left';
  return {
    axis: 'y' as const,
    angle: left ? -OPEN_ANGLE : OPEN_ANGLE,
    origin: [left ? x : x + width, y + height / 2, 0] as [number, number, number],
    panel: [left ? width / 2 : -width / 2, 0, 0] as [number, number, number],
  };
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

  /*
   * У механизма ручка на СВОБОДНОМ крае: у подъёмника снизу, у откидного
   * сверху. Закрытая створка рисуется здесь, открытая — своим мешем; обе
   * обязаны показывать одну и ту же мебель, поэтому правило одно.
   */
  const opening = doorOpening(unit, index, doors);
  const mechanism = opening === 'lift' || opening === 'flap';

  const handle: PartBox = integratedHandles
    ? {
        material: 'metal',
        part,
        position: [cx, cy + heightM / 2 - gap - 0.01, thickness + 0.004],
        scale: [doorW - 2 * gap, 0.02, 0.015],
      }
    : mechanism
      ? {
          material: 'metal',
          part,
          position: [
            cx,
            cy + (opening === 'lift' ? -heightM / 2 + 0.04 : heightM / 2 - 0.04),
            thickness + 0.012,
          ],
          scale: [Math.min(0.24, doorW * 0.5), 0.016, 0.016],
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

  const spec = frontOf(unit);
  const key = frontKey(spec);
  const w = doorW - 2 * gap;
  const h = heightM - 2 * gap;

  /*
   * ФИЛЁНКА — ЭТО РАМА И ВСТАВКА, А НЕ ГЛАДКАЯ ПАНЕЛЬ.
   *
   * В раскрое филёнчатый фасад уже даёт две детали; сцена обязана
   * показывать то же самое, иначе клиент выбирает по картинке одно, а
   * подписывает раскрой на другое. Рисуется так же, как делается: четыре
   * бруска обвязки по контуру и вставка, утопленная внутрь.
   */
  if (isFramed(spec)) {
    const frame = FRAME_WIDTH_MM / MM;
    const bar = Math.min(frame, Math.min(w, h) / 3);
    const insetZ = thickness * 0.45;

    return [
      // Обвязка: верх, низ, левая и правая стойки.
      { material: 'front', part, frontKey: key, position: [cx, cy + h / 2 - bar / 2, thickness / 2], scale: [w, bar, thickness] },
      { material: 'front', part, frontKey: key, position: [cx, cy - h / 2 + bar / 2, thickness / 2], scale: [w, bar, thickness] },
      { material: 'front', part, frontKey: key, position: [cx - w / 2 + bar / 2, cy, thickness / 2], scale: [bar, h - 2 * bar, thickness] },
      { material: 'front', part, frontKey: key, position: [cx + w / 2 - bar / 2, cy, thickness / 2], scale: [bar, h - 2 * bar, thickness] },
      // Вставка: тоньше и глубже — отсюда и видна филёнка.
      {
        material: 'front',
        part,
        frontKey: key,
        position: [cx, cy, insetZ / 2],
        scale: [w - 2 * bar, h - 2 * bar, insetZ],
      },
      handle,
    ];
  }

  return [
    {
      material: 'front',
      part,
      frontKey: key,
      position: [cx, cy, thickness / 2],
      scale: [w, h, thickness],
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
    // Короб: дно, две боковины, задняя стенка. Всё это ВНУТРИ модуля.
    {
      material: 'carcass',
      part,
      inside: true,
      position: [cx, cy - boxH / 2 + thickness / 2, 0],
      scale: [inner, thickness, innerDepth * 0.9],
    },
    {
      material: 'carcass',
      part,
      inside: true,
      position: [cx - inner / 2, cy, 0],
      scale: [thickness, boxH, innerDepth * 0.9],
    },
    {
      material: 'carcass',
      part,
      inside: true,
      position: [cx + inner / 2, cy, 0],
      scale: [thickness, boxH, innerDepth * 0.9],
    },
    {
      material: 'carcass',
      part,
      inside: true,
      position: [cx, cy, -innerDepth * 0.45],
      scale: [inner, boxH, thickness],
    },
  ];

  if (cutaway) return boxes;

  boxes.push({
    material: 'front',
    part,
    frontKey: frontKey(frontOf(unit)),
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


/* ────────────────  Весь ряд одним списком  ──────────────── */

/**
 * КОРОБКИ ВСЕГО РЯДА — ОДНА ФУНКЦИЯ НА ВСЮ СЦЕНУ.
 *
 * Раскладка модулей по высоте и глубине считалась внутри `Cabinet3D`,
 * и всё, что хотело те же габариты — рёбра, аксонометрия, инвариант —
 * считало их заново. Вторая формула тех же чисел рано или поздно
 * разъезжается с первой: этот класс ошибки мы ловили шесть раз.
 */
export function runBoxes(
  run: Run,
  options: {
    zoneDepthMm: number;
    thicknessMm: number;
    frontThicknessMm: number;
    gapMm: number;
    cutaway?: boolean;
  },
): PartBox[] {
  const depthM = options.zoneDepthMm / MM;
  const plinthM = GEOMETRY.base.plinthH / MM;

  const placed = [
    ...run.modules.map((unit) => {
      const isUpper = unit.kind === 'upper' || unit.kind === 'corner_upper';
      return {
        unit,
        x: unit.offsetMm / MM,
        // Верхние висят, нижние стоят на цоколе.
        y: isUpper ? GEOMETRY.upper.bottomFromFloor / MM : plinthM,
        heightM: moduleCarcassHeightMm(unit, run) / MM,
        depthM: isUpper ? GEOMETRY.upper.depth / MM : depthM,
      };
    }),
    ...run.upperSegments.flatMap((segment) =>
      segment.modules.map((unit) => ({
        unit,
        // `offsetMm` у верхних модулей уже абсолютный (ловушка 92).
        x: unit.offsetMm / MM,
        y: GEOMETRY.upper.bottomFromFloor / MM,
        heightM: moduleCarcassHeightMm(unit, run) / MM,
        depthM: GEOMETRY.upper.depth / MM,
      })),
    ),
  ];

  return placed.flatMap((entry) =>
    moduleBoxes(
      entry.unit,
      {
        x: entry.x,
        y: entry.y,
        heightM: entry.heightM,
        depthM: entry.depthM,
        thicknessM: options.thicknessMm / MM,
      },
      {
        gapM: options.gapMm / MM,
        frontThicknessM: options.frontThicknessMm / MM,
        integratedHandles: Boolean(run.options.integratedHandles),
        cutaway: Boolean(options.cutaway),
      },
    ),
  );
}
