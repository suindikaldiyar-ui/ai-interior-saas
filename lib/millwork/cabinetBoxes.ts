import { columnNiches, moduleCarcassHeightMm, upperBottomFor } from '@/lib/millwork/fill';
import { plinthMm } from './shop';
import {
  BACK_PANEL_NAME,
  BOTTOM_PANEL_NAME,
  DIVIDER_PANEL_NAME,
  SHELF_PANEL_NAME,
  SIDE_PANEL_NAME,
  TOP_PANEL_NAME,
  TOP_RAIL_PANEL_NAME,
} from './panels';
import { moduleDepthMm, rowStandardDepthMm } from './fill';
import type { ProductionSettings } from '@/types/catalog';
import type { ApplianceKind } from '@/types/millwork';
import { FRAME_WIDTH_MM, frontKey, isFramed } from './frontMaterial';
import { nicheFacadeSpans, type FacadeSpan } from './applianceFront';
import { frontWithMilling } from './milling';
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
  /**
   * КАКОЙ ДЕТАЛЬЮ РАСКРОЯ ЭТА КОРОБКА ЯВЛЯЕТСЯ.
   *
   * Имя из той же таблицы, что у панели (`SIDE_PANEL_NAME` и соседи), —
   * по нему деталировка находит место детали в модуле. Без него место
   * пришлось бы выводить ВТОРОЙ формулой: сцена знает, где стоит
   * боковина, а таблица знает только её размер, и связать их было нечем.
   *
   * Пусто у того, что деталью раскроя не является вовсе: прибор, ручка,
   * короб ящика — это не распиленный лист.
   */
  panel?: string;
};

/** Материал коробки: по нему они собираются в группы отрисовки. */
/**
 * РОЛЬ ДЕТАЛИ В СЦЕНЕ — ЭТО И ЕСТЬ ЕЁ ЦВЕТ.
 *
 * Корпус, внутренности, фасад, металл, прибор и стекло различаются не
 * подписью, а плотным цветом: в САПР-виде деталь узнают по тону, а не по
 * тому, что на неё нажали. Пока внутренности шли ролью `carcass`, полка
 * и боковина были одного цвета, и разрез читался сплошной плитой.
 *
 * Роль — не материал каталога: артикул красит ФАСАД (`frontKey`), а
 * роль отвечает на другой вопрос — что это за деталь.
 */
export type BoxMaterial = 'carcass' | 'inner' | 'front' | 'metal' | 'appliance' | 'glass';

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
  /**
   * СМЕЩЕНИЕ ФАСАДА ОТ ПЛОСКОСТИ РЯДА, метры. Ноль — фасад в плоскости
   * нижнего ряда; минус — модуль мельче и его фасад стоит ГЛУБЖЕ.
   *
   * Нужно оно ровно затем, чтобы задняя плоскость легла на стену. Ряд
   * рисуется от фасада (локальный ноль по z), и без этого смещения
   * мельче становился не перёд, а зад: верхний ряд висел в 240 мм от
   * стены, заподлицо с нижним. Разрез и план всё это время рисовали
   * правильно — от стены.
   *
   * ПОЛЕ ОБЯЗАТЕЛЬНОЕ, И ЭТО НЕ ПРИДИРКА ТИПОВ. Пока его можно было не
   * писать, его и не писали: сцена звала `moduleBoxes` своим обходом без
   * `zM`, и весь верхний ряд с антресолью уезжал на 240 мм вперёд от
   * стены (цех 550/350 — на 200), при том что рёбра, рамка выделения и
   * открытая дверца стояли на месте. Умолчание здесь равно второму
   * расчёту одной величины — тому самому классу ошибки, который в этом
   * продукте ловился уже девять раз. Ноль пишется явно и объясняется.
   */
  zM: number;
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
    panel?: string,
  ): BoxDraw => ({
    position: [x + dx, y + dy, dz],
    scale: [w, h, d],
    panel,
    /*
     * ДЕТАЛЬ ВНУТРИ ИЛИ СНАРУЖИ.
     *
     * Полка и перегородка стоят за закрытым фасадом: их не видно, пока
     * дверь не открыли. Рёбра по ним рисовать нельзя — именно из-за
     * внутренних линий сплошная мебель читается каркасом.
     */
    inside,
  });

  /*
   * ИМЕНА ТЕ ЖЕ, ЧТО В РАСКРОЕ.
   *
   * Крыша нижнего модуля называется «Планки верхние» — так её и режут, и
   * так она подписана в детализировке. Своя строка здесь означала бы, что
   * деталировка не найдёт место детали, которую сама же и напечатала.
   */
  const topName = unit.kind === 'base' || unit.kind === 'corner_base' ? TOP_RAIL_PANEL_NAME : TOP_PANEL_NAME;

  const boxes: BoxDraw[] = [
    // Боковины
    at(thicknessM / 2, heightM / 2, -depthM / 2, thicknessM, heightM, depthM, false, SIDE_PANEL_NAME),
    at(widthM - thicknessM / 2, heightM / 2, -depthM / 2, thicknessM, heightM, depthM, false, SIDE_PANEL_NAME),
    // Дно и крыша
    at(widthM / 2, thicknessM / 2, -depthM / 2, innerW, thicknessM, depthM, false, BOTTOM_PANEL_NAME),
    at(widthM / 2, heightM - thicknessM / 2, -depthM / 2, innerW, thicknessM, depthM, false, topName),
    // Задняя стенка
    at(widthM / 2, heightM / 2, -depthM + 0.004, widthM, heightM, 0.004, false, BACK_PANEL_NAME),
  ];

  /*
   * Полки — ровно на тех высотах, что стоят на чертеже. Высота отсчитана
   * от НИЗА МОДУЛЯ, как в `fill`: перевод в высоту от пола делает только
   * чертёж, и делать его здесь второй раз незачем.
   */
  for (const mm of fill?.shelves ?? []) {
    boxes.push(
      at(
        widthM / 2,
        mm / MM,
        -depthM / 2 - 0.01,
        innerW - 0.002,
        thicknessM,
        innerDepth,
        true,
        SHELF_PANEL_NAME,
      ),
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
        DIVIDER_PANEL_NAME,
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
  /**
   * ФРЕЗЕРОВКА, НАЗНАЧЕННАЯ ПОЛОСАМ РЯДА.
   *
   * Едет сюда, а не берётся из модуля, по той же причине, что и высота
   * антресоли: назначение полосе лежит на РЯДУ, и модуль о нём не знает.
   * Пусто — у ряда полос не назначено, и фасад берёт только своё.
   */
  rowMilling?: Run['milling'];
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

/**
 * СКОЛЬКО СТВОРОК У МОДУЛЯ — ОДИН РАСЧЁТ НА СЦЕНУ, РЁБРА И ОТКРЫВАНИЕ.
 *
 * Фронт у модуля ОДИН: либо створки, либо ящики, либо его нет вовсе.
 * `Math.max(1, …)` подставлял створку там, где число не проставлено, —
 * и заодно вешал её поверх ящиков: у ящичного модуля `doorCount` ноль,
 * и сцена рисовала ему дверь во всю высоту прямо на фронтах ящиков, а у
 * открытой секции — дверь на открытой секции.
 *
 * В раскрое ни той, ни другой нет (`panels.ts` смотрит `frontType`), то
 * есть сцена показывала мебель, которой цех не сделает. В демо ящичных
 * и открытых модулей не было, поэтому этого никто не видел — ровно так
 * же пряталась их геометрия по Z.
 *
 * Приборный модуль — исключение, и оно осознанное: у мойки и встроенного
 * холодильника `frontType = 'appliance'`, но фасад у них есть (слой 33),
 * и число створок в данных не проставлено.
 */
export function doorCount(unit: Module): number {
  if (unit.frontType === 'drawers' || unit.frontType === 'none') return 0;
  return Math.max(1, unit.doorCount);
}


/**
 * СТВОРКИ МОДУЛЯ: сколько их и какой участок высоты закрывает каждая.
 *
 * Один ответ на отрисовку, на «Открыть всё» и на расчёт петель. Свой
 * список у каждого — это ровно то расхождение, от которого уводит
 * ловушка 360, и оно уже стоило нам дыры над духовкой: раскрой пилил
 * два фасада, а сцена не рисовала ни одного.
 *
 * `span: null` — полотно во всю высоту модуля; горизонтальную разбивку
 * (одна створка или две) держит `doorCount`, она в другой оси.
 */
export function doorLeaves(
  unit: Module,
  heightMm: number,
): { index: number; span: FacadeSpan | null }[] {
  if (unit.section === 'glass_display') return [];

  /* Ящики и створки — разные фронты одного модуля, вместе их не бывает. */
  if (!unit.column && (unit.fill?.drawerHeights.length ?? 0) > 0) return [];

  /* Фасад разбит приборами — значит створка на каждом свободном участке. */
  const spans = nicheFacadeSpans(unit, heightMm);
  if (spans) return spans.map((span, index) => ({ index, span }));

  /*
   * Прибор виден целиком (варочная, вытяжка, отдельностоящий) — створки
   * там нет: она закрыла бы то, ради чего прибор и покупают.
   */
  if (hasVisibleAppliance(unit) || unit.column) return [];

  return Array.from({ length: doorCount(unit) }, (_, index) => ({ index, span: null }));
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
  /**
   * УЧАСТОК ВЫСОТЫ, ЕСЛИ ФАСАД РАЗБИТ ПРИБОРАМИ.
   *
   * У колонны створка закрывает не весь модуль, а свободный отрезок над
   * нишей или под ней. Числа берутся у `nicheFacadeSpans` — у той же
   * функции, по которой этот отрезок попал в раскрой; своей арифметики
   * «высота минус ниша» здесь нет, иначе полотно уедет с детали.
   */
  span?: { fromMm: number; heightMm: number },
): PartBox[] {
  if (options.cutaway) return [];

  const { x } = place;
  const y = span ? place.y + span.fromMm / MM : place.y;
  const heightM = span ? span.heightMm / MM : place.heightM;
  /* Участок закрывается ОДНИМ полотном: делить его ещё и по ширине незачем. */
  const doors = span ? 1 : doorCount(unit);
  const widthM = unit.widthMm / MM;
  const doorW = widthM / doors;
  const hinge = doorHinge(unit, span ? 0 : index, doors);

  const { gapM: gap, frontThicknessM: thickness, integratedHandles } = options;
  const hingeX = x + (span ? 0 : index) * doorW + (hinge === 'left' ? 0 : doorW);
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

  /*
   * ЧЕМ ОТКРЫВАЮТ — ВЫБОР МОДУЛЯ, А НЕ ОПЦИЯ РЯДА.
   *
   * Скоба, врезной профиль или нажатие. «Без ручки» рисуется буквально:
   * на фасаде нет ничего, и это видно — именно за этим её и выбирают.
   */
  const kind = unit.fill?.handle ?? (integratedHandles ? 'profile' : 'bar');

  const handle: PartBox = kind === 'profile'
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

  const spec = frontWithMilling(unit, { milling: options.rowMilling });
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
  const withHandle = (parts: PartBox[]) => (kind === 'none' ? parts : [...parts, handle]);

  if (isFramed(spec)) {
    const frame = FRAME_WIDTH_MM / MM;
    const bar = Math.min(frame, Math.min(w, h) / 3);
    const insetZ = thickness * 0.45;

    return withHandle([
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
    ]);
  }

  return withHandle([
    {
      material: 'front',
      part,
      frontKey: key,
      position: [cx, cy, thickness / 2],
      scale: [w, h, thickness],
    },
  ]);
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

  /*
   * ЯЩИК СТОИТ В КОРПУСЕ, А НЕ ПЕРЕД НИМ.
   *
   * Здесь была своя система координат: короб центрировался на НУЛЕ, то
   * есть на передней плоскости корпуса, и наполовину торчал наружу, а
   * фронт улетал на пол-глубины вперёд — закрытый ящик рисовался
   * выехавшим на 270 мм. В демо-кухне ящичных модулей нет, поэтому это
   * жило незамеченным, пока под варочной не появились настоящие ящики.
   *
   * Теперь как у дверей: фасад на нуле, корпус уходит в −z.
   */
  const boxZ = -innerDepth / 2;

  const boxes: PartBox[] = [
    // Короб: дно, две боковины, задняя стенка. Всё это ВНУТРИ модуля.
    {
      material: 'carcass',
      part,
      inside: true,
      position: [cx, cy - boxH / 2 + thickness / 2, boxZ],
      scale: [inner, thickness, innerDepth * 0.9],
    },
    {
      material: 'carcass',
      part,
      inside: true,
      position: [cx - inner / 2, cy, boxZ],
      scale: [thickness, boxH, innerDepth * 0.9],
    },
    {
      material: 'carcass',
      part,
      inside: true,
      position: [cx + inner / 2, cy, boxZ],
      scale: [thickness, boxH, innerDepth * 0.9],
    },
    {
      material: 'carcass',
      part,
      inside: true,
      position: [cx, cy, boxZ - innerDepth * 0.45],
      scale: [inner, boxH, thickness],
    },
  ];

  if (cutaway) return boxes;

  boxes.push({
    material: 'front',
    part,
    frontKey: frontKey(frontWithMilling(unit, { milling: options.rowMilling })),
    position: [cx, cy, thickness / 2],
    scale: [widthM - 2 * gap, height - 2 * gap, thickness],
  });

  boxes.push(
    integratedHandles
      ? {
          material: 'metal',
          part,
          position: [cx, cy + height / 2 - gap - 0.01, thickness + 0.004],
          scale: [widthM - 2 * gap, 0.02, 0.015],
        }
      : {
          material: 'metal',
          part,
          position: [cx, cy, thickness + 0.012],
          scale: [Math.min(0.26, widthM * 0.5), 0.016, 0.016],
        },
  );

  return boxes;
}

/**
 * ЛИЦО ПРИБОРА: ТО, ПО ЧЕМУ ЕГО УЗНАЮТ.
 *
 * Прибор рисовался тёмным блоком, и духовка от посудомойки отличалась
 * только высотой: клиент видел стену чёрных плит и спрашивал, что это.
 *
 * Узнаётся прибор ГЕОМЕТРИЕЙ, а не текстурой: у духовки стекло и панель
 * управления, у варочной — конфорки, у холодильника — две дверцы с
 * ручками. Ничего сверх габарита здесь не выдумывается: все доли
 * считаются от той же ширины и высоты ниши, которые уже посчитаны
 * `columnNiches` и `applianceSizes`.
 *
 * ПРИСАДКИ ЗДЕСЬ НЕТ И НЕ БУДЕТ, пока цех не даст монтажные размеры:
 * выдуманное отверстие в сцене — испорченная деталь в цехе.
 */
function applianceFace(
  kind: ApplianceKind | undefined,
  x: number,
  y: number,
  widthM: number,
  heightM: number,
  depthM: number,
): PartBox[] {
  const cx = x + widthM / 2;
  const cy = y + heightM / 2;
  /** Лицевая плоскость ниши: всё, что видно, лежит на ней. */
  const faceZ = -depthM / 2 + 0.01;
  const boxes: PartBox[] = [];

  /** Корпус прибора — общий у всех: тёмный объём в нише. */
  const body = (h = heightM, center = cy): PartBox => ({
    material: 'appliance',
    position: [cx, center, faceZ],
    scale: [widthM - 0.05, h - 0.02, depthM - 0.06],
  });

  if (kind === 'hob') {
    /*
     * Варочная лежит СВЕРХУ, а не стоит фасадом: видно её плоскость и
     * конфорки. Четыре конфорки у панели 600 — отраслевая раскладка, и
     * их положение считается от ширины, а не вписано числом.
     */
    const top = y + heightM - 0.01;
    boxes.push({
      material: 'appliance',
      position: [cx, top, faceZ],
      scale: [widthM - 0.04, 0.02, depthM - 0.06],
    });

    const stepX = (widthM - 0.16) / 2;
    const stepZ = (depthM - 0.2) / 2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        boxes.push({
          material: 'metal',
          position: [cx + sx * stepX * 0.5, top + 0.012, faceZ + sz * stepZ * 0.5],
          scale: [widthM * 0.26, 0.006, widthM * 0.26],
        });
      }
    }
    return boxes;
  }

  if (kind === 'hood') {
    // Вытяжка: корпус и светлая полоса фильтра по нижней кромке.
    boxes.push(body());
    boxes.push({
      material: 'metal',
      position: [cx, y + 0.02, faceZ + 0.02],
      scale: [widthM - 0.09, 0.02, depthM * 0.5],
    });
    return boxes;
  }

  if (kind === 'fridge') {
    /*
     * Холодильник — ДВЕ дверцы: камера сверху, морозильник снизу. Доля
     * взята не с потолка: у отдельностоящего морозильник занимает
     * примерно треть высоты, и раскрой встроенного делит фасад так же
     * (`BUILT_IN_FRIDGE_FRONTS`).
     */
    const freezer = heightM * 0.33;
    const gap = 0.012;

    boxes.push(body(heightM - freezer - gap, y + freezer + gap + (heightM - freezer - gap) / 2));
    boxes.push(body(freezer, y + freezer / 2));

    for (const doorTop of [y + freezer + gap + (heightM - freezer - gap) - 0.12, y + freezer - 0.1]) {
      boxes.push({
        material: 'metal',
        position: [cx + widthM / 2 - 0.06, doorTop, faceZ + depthM / 2 - 0.02],
        scale: [0.016, Math.min(0.22, heightM * 0.2), 0.016],
      });
    }
    return boxes;
  }

  // Духовка, СВЧ, посудомойка: дверца со стеклом, панель и ручка.
  boxes.push(body());

  const panelH = Math.min(0.06, heightM * 0.16);
  boxes.push({
    material: 'metal',
    position: [cx, y + heightM - panelH / 2 - 0.01, faceZ + depthM / 2 - 0.02],
    scale: [widthM - 0.09, panelH * 0.4, 0.012],
  });

  boxes.push({
    material: 'metal',
    position: [cx, y + heightM - panelH - 0.03, faceZ + depthM / 2 - 0.015],
    scale: [widthM - 0.12, 0.016, 0.016],
  });

  /*
   * Стекло дверцы. У посудомойки его нет: дверца глухая, и рисовать
   * окно там значит показать прибор, которого не привезут.
   */
  if (kind !== 'dishwasher45' && kind !== 'dishwasher60') {
    boxes.push({
      material: 'glass',
      position: [cx, y + (heightM - panelH) / 2, faceZ + depthM / 2 - 0.012],
      scale: [widthM - 0.16, Math.max(0.04, (heightM - panelH) * 0.62), 0.008],
    });
  }

  return boxes;
}

/**
 * Техника: узнаваемое лицо прибора в нише.
 *
 * Ниши колонны берутся из `columnNiches` — той же функции, что рисует
 * чертёж: посчитай их здесь заново, и 3D разойдётся с эскизом.
 */
export function applianceBoxes(
  unit: Module,
  place: ModulePlacement,
  /** Школа цеха: отметка низа духовки считается от пола, цоколь свой. */
  production?: ProductionSettings,
): PartBox[] {
  const { x, y, heightM, depthM } = place;
  const widthM = unit.widthMm / MM;
  const boxes: PartBox[] = [];

  if (hasVisibleAppliance(unit)) {
    boxes.push(...applianceFace(unit.appliance, x, y, widthM, heightM, depthM));
  }

  for (const niche of unit.column ? columnNiches(unit, heightM * MM, production) : []) {
    const nicheH = (niche.toMm - niche.fromMm) / MM;
    boxes.push(
      ...applianceFace(
        niche.appliance,
        x,
        y + niche.fromMm / MM,
        widthM,
        nicheH,
        depthM,
      ),
    );
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
  /** Школа цеха: её берут ниши колонны и всё, что считается от пола. */
  production?: ProductionSettings,
): PartBox[] {
  /*
   * Полки, перегородки и короба ящиков уже помечены в данных
   * (`BoxDraw.inside`) — по этому же признаку сцена решает, вести ли по
   * ним рёбра. Цвет берётся оттуда же: второго признака «это внутри»
   * заводить нельзя, он разойдётся с первым.
   */
  const boxes: PartBox[] = carcassBoxes(unit, place).map((box) => ({
    ...box,
    material: (box.inside ? 'inner' : 'carcass') as BoxMaterial,
  }));

  boxes.push(...applianceBoxes(unit, place, production));


  /*
   * ЯЩИКИ ЕСТЬ У ВСЕХ, У КОГО ЕСТЬ ФРОНТЫ ЯЩИКОВ.
   *
   * Условия «нет прибора» и «прибор не виден» одинаково не годятся:
   * варочная ВИДНА — она лежит сверху, — а под ней обычные ящики, и в
   * раскрое они есть (слой 34). Сцена оставляла там глухую панель,
   * которая не открывается ни на один жест.
   *
   * Спрашиваем то, что и значит «здесь есть ящики»: фронты в наполнении.
   * Их считает `defaultFill`, и по ним же режется раскрой.
   */
  const drawers = unit.column ? 0 : (unit.fill?.drawerHeights.length ?? 0);
  for (let i = 0; i < drawers; i += 1) boxes.push(...drawerBoxes(unit, place, i, options));

  if (!options.cutaway) {
    /*
     * СТВОРКИ СПРАШИВАЮТСЯ, А НЕ ВЫВОДЯТСЯ ЗДЕСЬ.
     *
     * Стояло условие «не видимый прибор И не колонна»: у колонны и у
     * пенала с духовкой оно давало НОЛЬ фасадов, хотя раскрой резал для
     * них два — над нишей и под ней. В цех уезжал корпус с открытой
     * дырой в полметра, а на картинке её не было видно.
     */
    for (const leaf of doorLeaves(unit, Math.round(place.heightM * MM))) {
      boxes.push(...doorBoxes(unit, place, leaf.index, options, leaf.span ?? undefined));
    }
  }

  /*
   * СДВИГ ПО ГЛУБИНЕ — ОДИН РАЗ, НА ВСЕ КОРОБКИ МОДУЛЯ.
   *
   * Корпус, фасад, ящики, ручки и прибор считаются от локального нуля
   * (фасада). Раздавать им смещение поимённо значило бы завести пять
   * мест, где его можно забыть; здесь оно применяется к готовому списку.
   */
  const zM = place.zM ?? 0;
  if (zM === 0) return boxes;

  return boxes.map((box) => ({
    ...box,
    position: [box.position[0], box.position[1], box.position[2] + zM] as [
      number,
      number,
      number,
    ],
  }));
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
/**
 * ГДЕ СТОИТ КАЖДЫЙ МОДУЛЬ РЯДА — ОДНА ФУНКЦИЯ НА ПРОДУКТ.
 *
 * Отметка низа верхнего ряда была вписана числом в трёх местах: здесь, в
 * сцене и в инварианте непересечения. Числа совпадали, пока верхний ряд
 * был один, и разошлись на антресоли: `upperBottomFor` знает, что она
 * стоит на крыше колонны холодильника (2400 мм), а сцена рисовала её по
 * отметке навески (1450) — ВНУТРИ холодильника.
 *
 * На экране это выглядело двумя дефектами сразу: «маленькая дверца
 * посередине холодильника» и «антресоли не видно в 3D». Одиннадцатый
 * случай одного класса.
 */
export function runPlaces(
  run: Run,
): {
  unit: Module;
  x: number;
  y: number;
  heightM: number;
  depthM: number;
  zM: number;
}[] {
  /*
   * ГЛУБИНА РЯДА — ОДНА, И ПОДСТАВИТЬ ЧУЖУЮ НЕГДЕ.
   *
   * Здесь стоял параметр `size.depthM`, и каждый вызывающий передавал
   * СВОЁ число: сцена — глубину профиля зоны (560), рёбра — глубину
   * школы цеха (550), приёмка — `GEOMETRY.base.depth`. У цеха с 550 ряд
   * в сцене на десять миллиметров уходил в стену, а рёбра при этом
   * лежали правильно. Тот же класс, что и две глубины угла.
   */
  const rowDepthM = rowStandardDepthMm(run.zone, 'base', run.production) / MM;
  const plinthM = plinthMm(run.production) / MM;

  const isUpper = (unit: Module) => unit.kind === 'upper' || unit.kind === 'corner_upper';

  /*
   * ЗАДНЯЯ ПЛОСКОСТЬ ЛЮБОГО МОДУЛЯ ЛЕЖИТ НА СТЕНЕ.
   *
   * Мебель стоит у стены, а не висит в воздухе: разная глубина уводит
   * вперёд ПЕРЕДНЮЮ плоскость. Ряд нарисован от фасада (локальный ноль
   * по z), поэтому модуль мельче ряда отъезжает назад ровно на разницу.
   */
  const place = (unit: Module) => {
    const depthMm = moduleDepthMm(unit, run.zone, run.production);
    return {
      unit,
      // `offsetMm` у верхних модулей уже абсолютный (ловушка 92).
      x: unit.offsetMm / MM,
      // Верхние висят, нижние стоят на цоколе.
      y: isUpper(unit) ? upperBottomFor(unit, run) / MM : plinthM,
      heightM: moduleCarcassHeightMm(unit, run) / MM,
      depthM: depthMm / MM,
      zM: depthMm / MM - rowDepthM,
    };
  };

  return [
    ...run.modules.map(place),
    /*
     * Антресоль идёт СВОЕЙ глубиной: у мебельщика она по нижнему ряду.
     * Спрашивает её та же `moduleDepthMm`, что и всех остальных.
     */
    ...run.upperSegments.flatMap((segment) => segment.modules.map(place)),
  ];
}

export function runBoxes(
  run: Run,
  options: {
    thicknessMm: number;
    frontThicknessMm: number;
    gapMm: number;
    cutaway?: boolean;
  },
): PartBox[] {
  /* Глубину ряда считает `runPlaces`: передать её снаружи больше нельзя. */
  const placed = runPlaces(run);

  return placed.flatMap((entry) =>
    moduleBoxes(
      entry.unit,
      {
        x: entry.x,
        y: entry.y,
        heightM: entry.heightM,
        depthM: entry.depthM,
        zM: entry.zM,
        thicknessM: options.thicknessMm / MM,
      },
      {
        gapM: options.gapMm / MM,
        frontThicknessM: options.frontThicknessMm / MM,
        integratedHandles: Boolean(run.options.integratedHandles),
        rowMilling: run.milling,
        cutaway: Boolean(options.cutaway),
      },
    ),
  );
}

/**
 * ГДЕ СТОИТ КАЖДАЯ ДЕТАЛЬ РАСКРОЯ — ОДНА ФУНКЦИЯ НА ПРОДУКТ.
 *
 * У панели координат нет вовсе: в раскрое лежат длина, ширина, кромка и
 * номер, но не место. Деталировка была таблицей текстом именно поэтому —
 * показать, где боковина стоит в модуле, было нечем.
 *
 * Место НЕ ВЫВОДИТСЯ здесь заново. Оно берётся у тех же коробок, которые
 * рисует сцена: `runPlaces` ставит модуль, `carcassBoxes` раскладывает
 * его детали, и каждая коробка с этого захода помечена именем своей
 * детали (`BoxDraw.panel`). Седьмой формулы места не появляется — здесь
 * только соединение двух списков по имени.
 *
 * Панель с `qty: 2` (боковина) получает ДВЕ коробки: в раскрое это одна
 * строка на две одинаковые детали, а в модуле они стоят по разным краям.
 *
 * Чего в коробках нет и не будет:
 *   • КРОМКА — она не объём, а свойство торца (`Panel.edges`). Вид детали
 *     рисует её из данных панели, а не из сцены.
 *   • ФАСАД ВСТРОЙКИ — в раскрое две створки друг над другом, сцена
 *     рисует одно полотно: вертикальной раскладки створок у неё нет
 *     вовсе (слой 43, известное расхождение).
 */
export type PanelPlace = {
  /** Номер детали: тот же, что в таблице, раскрое и CSV. */
  number: string;
  name: string;
  /** Коробки этой детали в координатах ряда. Пусто — места в сцене нет. */
  boxes: BoxDraw[];
};

export function panelPlaces(
  unit: Module,
  place: ModulePlacement,
  panels: { number: string; name: string; moduleId: string }[],
): PanelPlace[] {
  const boxes = carcassBoxes(unit, place);

  return panels
    .filter((panel) => panel.moduleId === unit.id)
    .map((panel) => ({
      number: panel.number,
      name: panel.name,
      boxes: boxes.filter((box) => box.panel === panel.name),
    }));
}

/** Все открываемые элементы ряда: по ним работает «Открыть всё». */
export function openablePartIds(run: Run): string[] {
  const ids: string[] = [];

  for (const unit of [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)]) {
    /*
     * ОТКРЫВАЕТСЯ РОВНО ТО, ЧТО НАРИСОВАНО.
     *
     * Здесь стоял свой список: «нет прибора» плюс `frontType === 'door'`.
     * Он расходился с `CabinetModule3D` в обе стороны — ящики под
     * варочной рисовались и не открывались («Открыть всё» их не знало),
     * а у ящичного модуля числились створки, которых в сцене нет.
     *
     * Условия теперь ровно те же, что у отрисовки: `drawerHeights`
     * у неколонных модулей и `doorCount` — тот же, что считает
     * `cabinetBoxes`.
     */
    if (!unit.column) {
      unit.fill?.drawerHeights.forEach((_, i) => ids.push(`${unit.id}:drawer:${i}`));
    }

    for (const leaf of doorLeaves(unit, moduleCarcassHeightMm(unit, run))) {
      ids.push(`${unit.id}:door:${leaf.index}`);
    }
  }

  return ids;
}
