import { carcassBoxes, moduleBoxes, type BoxMaterial, type PartBox } from './cabinetBoxes';
import { countertopMm, plinthMm, rowDepthMm, workTopMm } from './shop';
import { moduleCarcassHeightMm, moduleDepthMm, upperBottomFor } from './fill';
import { zoneProfile } from './zones';
import type { Run } from '@/types/millwork';

/**
 * АКСОНОМЕТРИЯ ЧЕРТЕЖА.
 *
 * Небольшой объёмный вид рядом с плоскими. Он отвечает на вопрос, которого
 * нет ни на фасаде, ни в разрезе: как это стоит вместе. Проектировщик кладёт
 * такой вид на лист именно за этим.
 *
 * РИСУЕТСЯ В SVG, А НЕ СНИМАЕТСЯ СО СЦЕНЫ. Чертёж печатают, и вектор на
 * бумаге читается, а снимок канваса рассыпается. Плюс это детерминировано:
 * тот же ряд — тот же рисунок, без GPU, без ожидания кадра и без разницы
 * между машинами.
 *
 * Изометрия простая: 30° по горизонтали, 30° по вертикали, без перспективы.
 * Каждый модуль — параллелепипед из ТЕХ ЖЕ чисел, что дают `cabinetBoxes`:
 * второй набор геометрии развёл бы объёмный вид с фасадом.
 */

const MM = 1000;

/** Косинус и синус 30° — вся изометрия держится на них. */
const COS30 = Math.cos(Math.PI / 6);
const SIN30 = Math.sin(Math.PI / 6);

export type Point2 = { x: number; y: number };

/**
 * Точка мира на бумаге.
 *
 * Мир: x вправо, y вверх, z на зрителя (перёд мебели z = 0, корпус уходит
 * в минус). На бумаге y растёт вниз, поэтому высота вычитается.
 */
export function project(x: number, y: number, z: number): Point2 {
  return {
    x: (x - z) * COS30,
    y: (x + z) * SIN30 - y,
  };
}

/** Что показываем: закрытый гарнитур, наполнение или голый корпус. */
export type AxonometryMode = 'closed' | 'inside' | 'carcass';

export type AxonFace = {
  /** Контур грани на бумаге. */
  points: Point2[];
  material: BoxMaterial;
  /** Верх, перёд или бок: от этого зависит светлота заливки. */
  face: 'top' | 'front' | 'side';
  /** Порядок отрисовки: дальние грани идут первыми. */
  depth: number;
};

/**
 * Три видимые грани коробки.
 *
 * Скрытые грани не рисуются вовсе: в аксонометрии чертежа их не показывают,
 * а лишние линии на бумаге читаются как ошибка построения.
 */
function boxFaces(box: PartBox): AxonFace[] {
  const [cx, cy, cz] = box.position;
  const [w, h, d] = box.scale;

  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;

  const p = (x: number, y: number, z: number) => project(x, y, z);

  /*
   * Глубина по направлению взгляда: чем больше сумма координат, тем ближе
   * коробка к зрителю. Художник рисует дальние первыми.
   */
  const depth = cx + cy + cz;

  return [
    {
      face: 'top',
      material: box.material,
      depth,
      points: [p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)],
    },
    {
      face: 'front',
      material: box.material,
      depth,
      points: [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)],
    },
    {
      face: 'side',
      material: box.material,
      depth,
      points: [p(x1, y0, z0), p(x1, y0, z1), p(x1, y1, z1), p(x1, y1, z0)],
    },
  ];
}

/** Габарит рисунка на бумаге в тех же единицах, что и проекция. */
export type AxonBounds = { minX: number; minY: number; maxX: number; maxY: number };

export type Axonometry = {
  faces: AxonFace[];
  bounds: AxonBounds;
};

/**
 * Ряд в изометрии.
 *
 * Коробки берутся из общей геометрии: закрытый вид — фасады на месте,
 * «внутри» — фасады сняты и видно полки, «корпус» — только каркас.
 */
export function buildAxonometry(
  run: Run,
  mode: AxonometryMode,
  production: { thicknessMm: number; frontMm: number; gapMm: number },
): Axonometry {
  const zone = zoneProfile(run.zone ?? 'kitchen');
  const depthM = (zone.depthMm ?? rowDepthMm('base', run.production)) / MM;
  const thicknessM = production.thicknessMm / MM;

  const options = {
    gapM: production.gapMm / MM,
    frontThicknessM: production.frontMm / MM,
    integratedHandles: Boolean(run.options.integratedHandles),
    // В «корпусе» и «внутри» фасадов нет: это и есть смысл этих видов.
    cutaway: mode !== 'closed',
  };

  const boxes: PartBox[] = [];

  const place = (unit: (typeof run.modules)[number], offsetMm: number, upper: boolean) => {
    // Высота и отметка — из ОДНОГО источника с чертежом и сметой.
    const heightMm = moduleCarcassHeightMm(unit, run);

    const placement = {
      x: offsetMm / MM,
      y: upper ? upperBottomFor(unit, run) / MM : plinthMm(run.production) / MM,
      heightM: heightMm / MM,
      depthM: upper ? moduleDepthMm(unit, run.zone, run.production) / MM : depthM,
      thicknessM,
      /*
       * НОЛЬ ЗДЕСЬ — ЭТО ТО, ЧТО ЛИСТ ПЕЧАТАЕТ СЕГОДНЯ, И ОНО НЕ ТРОГАЕТСЯ.
       *
       * Раскладка у печатной аксонометрии своя: глубина берётся из профиля
       * зоны (`zone.depthMm`) прежде школы цеха, а смещения по глубине нет
       * вовсе — верхний ряд и антресоль выходят заподлицо с нижним по
       * ФАСАДУ, а не по стене. Числа те же, что были: `zM` здесь всегда
       * подразумевался нулём, теперь он написан.
       *
       * Правка этого — правка ЧЕРТЕЖА, и она делается отдельной задачей:
       * лист уходит в цех, и двигать на нём мебель мимоходом нельзя.
       */
      zM: 0,
    };

    /*
     * Голый корпус — это только каркас: ни фасадов, ни техники, ни полок.
     * Остальные виды берут полный состав модуля.
     */
    if (mode === 'carcass') {
      for (const box of carcassBoxes(unit, placement)) {
        boxes.push({ ...box, material: 'carcass' });
      }
      return;
    }

    boxes.push(...moduleBoxes(unit, placement, options));
  };

  for (const unit of run.modules) place(unit, unit.offsetMm, false);
  for (const segment of run.upperSegments) {
    for (const unit of segment.modules) place(unit, unit.offsetMm, true);
  }

  // Цоколь одной планкой: без него ряд висит в воздухе.
  const lengthM = run.lengthMm / MM;
  boxes.push({
    material: 'carcass',
    position: [lengthM / 2, plinthMm(run.production) / MM / 2, -depthM / 2 - 0.025],
    scale: [lengthM, plinthMm(run.production) / MM, depthM - 0.05],
  });

  // Столешница поверх нижнего ряда — по ней ряд читается кухней.
  if (zone.hasCountertop) {
    const counterY =
      (workTopMm(run.production) - countertopMm(run.production) / 2) / MM;
    boxes.push({
      material: 'metal',
      position: [lengthM / 2, counterY, -depthM / 2 + 0.0125],
      scale: [lengthM, countertopMm(run.production) / MM, depthM + 0.025],
    });
  }

  const faces = boxes.flatMap(boxFaces).sort((a, b) => a.depth - b.depth);

  const xs = faces.flatMap((f) => f.points.map((p) => p.x));
  const ys = faces.flatMap((f) => f.points.map((p) => p.y));

  return {
    faces,
    bounds: {
      minX: Math.min(...xs, 0),
      minY: Math.min(...ys, 0),
      maxX: Math.max(...xs, 0),
      maxY: Math.max(...ys, 0),
    },
  };
}

/**
 * Габарит аксонометрии в миллиметрах — по нему считается масштаб на листе.
 *
 * Меряется ПО ПОСТРОЕННОМУ РИСУНКУ, а не по формуле от габарита комнаты.
 * Формула считала бы высоту до потолка, а рисуется мебель: на кухне это
 * лишние полметра пустоты, из-за которых лист рвался на две страницы.
 */
export function axonometryExtentMm(
  run: Run,
  mode: AxonometryMode,
  production: { thicknessMm: number; frontMm: number; gapMm: number },
): { width: number; height: number } {
  const { bounds } = buildAxonometry(run, mode, production);
  // Запас по краям: тонкие рёбра не должны упираться в рамку вида.
  const pad = 1.08;
  return {
    width: (bounds.maxX - bounds.minX) * MM * pad,
    height: (bounds.maxY - bounds.minY) * MM * pad,
  };
}
