import { columnNiches, moduleCarcassHeightMm, upperBottomFor } from '@/lib/millwork/fill';
import { carcassHeightMm, plinthMm } from './shop';
import {
  BACK_PANEL_NAME,
  BOTTOM_PANEL_NAME,
  CORNER_FILLER_PANEL_NAME,
  CORNER_UPPER_FILLER_PANEL_NAME,
  DIVIDER_PANEL_NAME,
  FACADE_PANEL_NAME,
  SHELF_PANEL_NAME,
  SIDE_PANEL_NAME,
  TAIL_FILLER_PANEL_NAME,
  TOP_PANEL_NAME,
  TOP_RAIL_PANEL_NAME,
  legName,
} from './panels';
import { blindPartMm, cornerFillersOf, cornerOfModule, openFrontMm } from './corner';
import { tailFillersOf } from './countertop';
import { moduleDepthMm, rowStandardDepthMm } from './fill';
import type { ProductionSettings } from '@/types/catalog';
import type { ApplianceKind } from '@/types/millwork';
import { FRAME_WIDTH_MM, frontKey, frontOf, isFramed } from './frontMaterial';
import { moduleFronts, type FacadeSpan } from './applianceFront';
import { carcassKeyOf, type CarcassItem } from './carcassMaterial';
import { handleBoxOf, handleSpotOf } from './handlePlace';

/**
 * ОТСТУП ЧАШКИ ОТ КРОМКИ — УСЛОВНЫЙ, ДЛЯ КАРТИНКИ.
 *
 * Взят как половина диаметра чашки плюс типовой зазор: чашка ⌀35 мм,
 * значит её центр отстоит от кромки примерно на 22 мм. Это ИЗОБРАЖЕНИЕ
 * УЗЛА, а не присадка: подтверждённого `edgeOffsetMm` в каталоге
 * организации нет, и по этому числу сверлить нельзя.
 */
const HINGE_NODE_EDGE_MM = 22;
/** Чашка ⌀35 мм — отраслевой стандарт, он же размер картинки. */
const HINGE_CUP_M = 0.035;
const HINGE_CUP_DEPTH_M = 0.012;
/** Корпусная часть уходит вглубь шкафа: её видно, когда створка открыта. */
const HINGE_ARM_DEPTH_M = 0.07;
import { frontWithMilling } from './milling';
import { leafHinges, openingHardware, openingOf } from './opening';
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
  /**
   * УЗЕЛ, А НЕ ДЕТАЛЬ РАСКРОЯ.
   *
   * Петля и ручка — покупная фурнитура: их не режут из листа, у них нет
   * номера в деталировке, и в раскрой они не уезжают. Признак нужен,
   * чтобы их можно было посчитать и отличить от металла столешницы, и
   * чтобы проверка могла спросить «петель в сцене столько же, сколько в
   * смете».
   */
  node?: 'hinge' | 'hinge-arm' | 'handle';
  /**
   * КЛЮЧ МАТЕРИАЛА КОРПУСА.
   *
   * Пусто — корпус красится РОЛЬЮ, как и раньше. Заполнен — у него декор
   * из каталога, и пачки отрисовки делятся по этому ключу так же, как
   * фасады по `frontKey` (ловушка 248).
   */
  carcassKey?: string | null;
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

  /*
   * ЗАДНЯЯ СТЕНКА — УПОР ДЛЯ ПОЛКИ И ПЕРЕГОРОДКИ.
   *
   * Полка стояла центром на «−глубина/2 − 10 мм» при глубине «глубина −
   * толщина»: её задний край выходил на 2 мм ЗА заднюю плоскость корпуса,
   * сквозь заднюю стенку — то есть в стену комнаты (слой 53: стена стоит
   * от задней плоскости ряда наружу, и пробник это поймал). Теперь место
   * выводится из того, во что деталь упирается: задний край — на лицевой
   * плоскости задней стенки. Размер детали прежний.
   */
  const backZ = -depthM + 0.004;
  const backFaceZ = backZ + 0.004 / 2;

  const boxes: BoxDraw[] = [
    // Боковины
    at(thicknessM / 2, heightM / 2, -depthM / 2, thicknessM, heightM, depthM, false, SIDE_PANEL_NAME),
    at(widthM - thicknessM / 2, heightM / 2, -depthM / 2, thicknessM, heightM, depthM, false, SIDE_PANEL_NAME),
    // Дно и крыша
    at(widthM / 2, thicknessM / 2, -depthM / 2, innerW, thicknessM, depthM, false, BOTTOM_PANEL_NAME),
    at(widthM / 2, heightM - thicknessM / 2, -depthM / 2, innerW, thicknessM, depthM, false, topName),
    // Задняя стенка
    at(widthM / 2, heightM / 2, backZ, widthM, heightM, 0.004, false, BACK_PANEL_NAME),
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
        backFaceZ + innerDepth / 2,
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
        backFaceZ + innerDepth / 2,
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
   * СКОЛЬКО ПЕТЕЛЬ КУПЛЕНО НА ЭТОТ МОДУЛЬ.
   *
   * Считает их `openingHardware` — та же функция, из которой смета
   * выписывает позиции. Сцена НЕ считает петли сама: своя формула
   * означала бы створку с тремя петлями на картинке и двумя в смете, а
   * клиент их пересчитывает глазами.
   *
   * Пусто — петли не рисуются вовсе: значит, вызывающий не знает их
   * числа, и выдумывать его здесь нельзя.
   */
  hinges?: number;
  /**
   * КЛЮЧ МАТЕРИАЛА КОРПУСА, если у модуля выбран свой декор.
   *
   * Пусто — корпус красится ролью, как и раньше.
   */
  carcassKey?: string | null;
  /**
   * ФРЕЗЕРОВКА, НАЗНАЧЕННАЯ ПОЛОСАМ РЯДА.
   *
   * Едет сюда, а не берётся из модуля, по той же причине, что и высота
   * антресоли: назначение полосе лежит на РЯДУ, и модуль о нём не знает.
   * Пусто — у ряда полос не назначено, и фасад берёт только своё.
   */
  rowMilling?: Run['milling'];
  /**
   * ДОСТУПНАЯ ШИРИНА ФАСАДА У СЛЕПОГО УГЛА, мм (слой 55).
   *
   * За глухой частью модуля стоит корпус соседнего ряда: створка там
   * упрётся в фальш-панель. Число считает `openFrontMm` — та же функция,
   * по которой режется фасад. Ноль — створки нет вовсе; пусто — модуль
   * не у слепого угла, фасад во всю ширину.
   */
  openWidthMm?: number;
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
  /*
   * ВИТРИНА ЗАКРЫТА СТЕКЛОМ, И РИСУЕТ ЕГО СВОЙ КОД.
   *
   * Полотно у неё есть — оно и режется, и висит на петлях, — но это
   * стекло в раме, а не глухая панель: нарисуй её здесь, и клиент увидит
   * закрытый ящик там, где заказывал витрину.
   */
  if (unit.section === 'glass_display') return [];

  /*
   * ЧТО ВИСИТ НА МОДУЛЕ — СПРАШИВАЕМ, А НЕ ВЫВОДИМ ЗДЕСЬ.
   *
   * Свой разбор «ящики, ниши, видимый прибор, `doorCount`» был ЧЕТВЁРТОЙ
   * копией одного и того же: такие же ветки стояли в раскрое, в расчёте
   * фурнитуры и в направлении открывания, и расходились они молча — у
   * вытяжки фасад резался и не рисовался, у мойки висел без петель.
   */
  const fronts = moduleFronts(unit, heightMm);
  if (fronts.drawers.length > 0) return [];

  return fronts.leaves.map((span, index) => ({
    index,
    /*
     * Полотно во всю высоту модуля ставится без участка: так его рисует
     * прежний код, и числа у него свои (зазор, ручка, петли).
     */
    span: span.fromMm === 0 && span.heightMm === heightMm ? null : span,
  }));
}

/**
 * ЧТО У МОДУЛЯ ОТКРЫВАЕТСЯ В СЦЕНЕ И ГДЕ — ОДИН СПИСОК (слой 55).
 *
 * Разметка `CabinetModule3D` решала сама: какие створки рисовать, сколько
 * их у слепого угла, куда они открываются, где стоят ящики. Проверка «у
 * угла всё открывается и не задевает соседнюю стену» мерила бы свою копию
 * этих веток — и была бы зелёной при сцене, которая рисует другое. Теперь
 * сцена рисует этот список, а проверка меряет его же.
 *
 * Координаты — модуля, метры: `xM` — левый край створки, `bottomM` — низ
 * фронта ящика от низа корпуса. `openWidthM` — доступная часть фасада у
 * слепого угла (`openFrontMm`); ноль — створки нет.
 */
export type SceneLeaf =
  | { kind: 'door'; id: string; opening: 'left' | 'right' | 'lift' | 'flap'; xM: number; widthM: number }
  | { kind: 'bifold'; id: string }
  | { kind: 'drawer'; id: string; bottomM: number; heightM: number };

export function sceneLeaves(unit: Module, heightM: number, openWidthM?: number): SceneLeaf[] {
  const out: SceneLeaf[] = [];
  const fill = unit.fill;
  /*
   * Ящики выдвигаются и под варочной: прибор занимает нишу, под ним
   * обычные ящики (ловушка 358). Высоты идут сверху вниз, сцена — от пола.
   */
  if (!unit.column && fill) {
    fill.drawerHeights.forEach((frontMm, i) => {
      const above = fill.drawerHeights.slice(0, i).reduce((sum, h) => sum + h, 0);
      out.push({
        kind: 'drawer',
        id: `${unit.id}:drawer:${i}`,
        bottomM: Math.max(0, heightM * MM - above - frontMm) / MM,
        heightM: frontMm / MM,
      });
    });
  }
  /* Г-образный: два фасада на одном ключе, открываются вместе. */
  if (unit.kind === 'corner_base' || unit.kind === 'corner_upper') {
    out.push({ kind: 'bifold', id: `${unit.id}:door:0` });
    return out;
  }
  /*
   * Створок нет у видимого прибора, у колонны (её фасады — над и под
   * нишами, их рисует общая отрисовка), у витрины (стекло рисует свой код)
   * и у слепого угла, где доступной части не осталось.
   */
  if (hasVisibleAppliance(unit) || unit.column || unit.section === 'glass_display' || openWidthM === 0) {
    return out;
  }
  /*
   * У слепого угла створка одна и на доступной части: вторая легла бы
   * петлями к фальш-панели и упёрлась бы в неё.
   */
  const doors = openWidthM !== undefined ? 1 : doorCount(unit);
  const doorW = (openWidthM ?? unit.widthMm / MM) / doors;
  for (let i = 0; i < doors; i += 1) {
    out.push({
      kind: 'door',
      id: `${unit.id}:door:${i}`,
      opening: doorOpening(unit, i, doors),
      xM: i * doorW,
      widthM: doorW,
    });
  }
  return out;
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
  /**
   * ВЫНОС ПОЛОТНА ВПЕРЁД ПО ХОДУ — толщина фасада, метры (слой 55).
   *
   * Распашное полотно поворачивалось вокруг заднего ребра на месте, и
   * кромка у петли на ходу заходила в соседний фасад той же плоскости:
   * 12 мм при 90° (18 мм фасада без двух зазоров), около 2 мм на
   * середине хода. Так открывалась любая створка рядом с соседней, а у
   * угла — створка рядом с фасадом Г-модуля другой стены. Петля так не
   * работает: она выносит полотно вперёд, и соседний фасад оно проходит
   * перед его лицом. Ось остаётся на передней плоскости корпуса
   * (ловушка 95) — полотно при открывании уходит вперёд на `kick ·
   * |sin угла|`, то есть на толщину фасада при 90°.
   */
  kickM = 0,
) {
  if (opening === 'lift') {
    return {
      axis: 'x' as const,
      angle: -OPEN_ANGLE,
      origin: [x + width / 2, y + height, 0] as [number, number, number],
      panel: [0, -height / 2, 0] as [number, number, number],
      kick: 0,
    };
  }
  if (opening === 'flap') {
    return {
      axis: 'x' as const,
      angle: OPEN_ANGLE,
      origin: [x + width / 2, y, 0] as [number, number, number],
      panel: [0, height / 2, 0] as [number, number, number],
      kick: 0,
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
    kick: kickM,
  };
}

/** Насколько полотно вынесено вперёд при повороте на `angle` (радианы). */
export function doorKick(pivot: { kick: number; angle: number }, angle: number): number {
  return pivot.kick * Math.abs(Math.sin(angle));
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
  /*
   * Участок закрывается ОДНИМ полотном: делить его ещё и по ширине
   * незачем. У слепого угла — тоже одно, на доступной части: вторая
   * створка легла бы петлями к фальш-панели и в неё бы упёрлась.
   */
  const blind = options.openWidthMm !== undefined && options.openWidthMm < unit.widthMm;
  const doors = span || blind ? 1 : doorCount(unit);
  const widthM = (blind ? options.openWidthMm! : unit.widthMm) / MM;
  const doorW = widthM / doors;
  const hinge = doorHinge(unit, span ? 0 : index, doors);

  const { gapM: gap, frontThicknessM: thickness, integratedHandles } = options;
  const hingeX = x + (span ? 0 : index) * doorW + (hinge === 'left' ? 0 : doorW);
  const panelX = hinge === 'left' ? doorW / 2 : -doorW / 2;
  const cx = hingeX + panelX;
  const cy = y + heightM / 2;
  const part = unit.id + ':door:' + index;

  /*
   * Где ручка — отвечает `handleSpotOf` ниже: у механизма она на
   * свободном крае, у распашной створки напротив петель. Правило одно на
   * закрытую створку, открытую и на лист.
   */


  /*
   * ЧЕМ ОТКРЫВАЮТ — ВЫБОР МОДУЛЯ, А НЕ ОПЦИЯ РЯДА.
   *
   * Скоба, врезной профиль или нажатие. «Без ручки» рисуется буквально:
   * на фасаде нет ничего, и это видно — именно за этим её и выбирают.
   */
  const kind = unit.fill?.handle ?? (integratedHandles ? 'profile' : 'bar');

  /*
   * ГДЕ РУЧКА — ВЫБОР МОДУЛЯ, А НЕ СЛЕДСТВИЕ СТОРОНЫ ПЕТЕЛЬ.
   *
   * Здесь стояли три ветки: профиль по верхней кромке, механизм по
   * свободной, скоба вертикально у края напротив петель. Это ровно три
   * из восьми положений — остальных пяти в продукте не было вовсе,
   * хотя мебельщик ставит ручку и так, и поперёк.
   *
   * Умолчание повторяет прежние три случая до последнего, поэтому ряды,
   * собранные раньше, выглядят так же (`defaultHandlePlace`).
   */
  /*
   * СТОРОНА ВЫВОДИТСЯ ИЗ ОТКРЫВАНИЯ, А НЕ ХРАНИТСЯ.
   *
   * Одна функция на сцену, чертёж и таблицу фурнитуры: сменилось
   * направление — ручка переехала везде разом.
   */
  const geometry = handleBoxOf(handleSpotOf(unit, { options: { integratedHandles } } as Run, hinge), {
    cx,
    cy,
    widthM: doorW - 2 * gap,
    heightM: heightM - 2 * gap,
    thicknessM: thickness,
  });

  const handle: PartBox = {
    material: 'metal',
    part,
    node: 'handle',
    position: geometry.position,
    scale: geometry.scale,
  };

  /*
   * ПЕТЛИ — УЗЕЛ, А НЕ КООРДИНАТА СВЕРЛЕНИЯ.
   *
   * Точного места чашки от кромки у нас нет: монтажных данных цеха в
   * каталоге не существует, все поля `MountingData` равны null, и
   * выдуманное отверстие в чертеже равно испорченной детали. Поэтому
   * здесь рисуется ИЗОБРАЖЕНИЕ УЗЛА: чашка на полотне у петельной
   * кромки, корпусная часть на боковине, по высоте — равномерно.
   *
   * `HINGE_NODE_EDGE_MM` — условный отступ картинки, а НЕ монтажный
   * размер. Появится подтверждённый `edgeOffsetMm` — он встанет сюда
   * одной строкой, и сцена не изменится ничем другим.
   */
  const hingeNodes: PartBox[] = [];
  const count = Math.max(0, Math.round(options.hinges ?? 0));

  for (let i = 0; i < count; i += 1) {
    const edgeX =
      hinge === 'left'
        ? cx - doorW / 2 + HINGE_NODE_EDGE_MM / MM
        : cx + doorW / 2 - HINGE_NODE_EDGE_MM / MM;
    const at = y + (heightM * (i + 1)) / (count + 1);

    /* Чашка живёт на ПОЛОТНЕ: открылась створка — уехала вместе с ней. */
    hingeNodes.push({
      material: 'metal',
      part,
      node: 'hinge',
      position: [edgeX, at, -HINGE_CUP_DEPTH_M / 2],
      scale: [HINGE_CUP_M, HINGE_CUP_M, HINGE_CUP_DEPTH_M],
    });

    /* Корпусная часть стоит на боковине и с места не двигается. */
    hingeNodes.push({
      material: 'metal',
      node: 'hinge-arm',
      position: [edgeX, at, -HINGE_ARM_DEPTH_M / 2 - HINGE_CUP_DEPTH_M],
      scale: [HINGE_CUP_M * 1.2, HINGE_CUP_M * 0.4, HINGE_ARM_DEPTH_M],
    });
  }

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
  const withHandle = (parts: PartBox[]) =>
    kind === 'none' ? [...parts, ...hingeNodes] : [...parts, handle, ...hingeNodes];

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
 * Г-ОБРАЗНЫЙ УГЛОВОЙ МОДУЛЬ ЧИСЛАМИ (слой 55).
 *
 * Квадрат S×S в углу: нога А вдоль своей стены (`widthMm`, глубина ряда
 * назад от фасада) и нога Б вдоль соседней — вперёд от фасада, у правого
 * края модуля, на S минус глубину. До этого слоя модуль рисовался
 * прямоугольником S × глубина, а вторую ногу «закрывала» фальш-панель —
 * в раскрое её не было, и цех получал плоскую деталь вместо корпуса.
 *
 * Детали названы так же, как в раскрое (`panels.ts`, `legName`): по имени
 * деталировка находит место детали в модуле.
 *
 * Фасадов два, и открываются они вместе: створка Б висит на петлях у
 * боковины Б, створка А — на створке Б. Ключ открывания у них ОДИН
 * (`<модуль>:door:0`), поэтому «открыть» одну без другой нельзя.
 */
export function lCornerBoxes(unit: Module, place: ModulePlacement, options: FrontOptions): PartBox[] {
  const { x, y, heightM: H, depthM: D, thicknessM: t } = place;
  const S = unit.widthMm / MM;
  const legB = Math.max(0, S - D);
  const back = 0.004;
  const upper = unit.kind === 'corner_upper';
  const topName = upper ? TOP_PANEL_NAME : TOP_RAIL_PANEL_NAME;
  const carcassKey = options.carcassKey ?? null;
  const zM = place.zM;

  const box = (
    cx: number,
    cy: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    panel: string,
    inside = false,
  ): PartBox => ({
    material: inside ? 'inner' : 'carcass',
    position: [x + cx, y + cy, zM + cz],
    scale: [w, h, d],
    panel,
    inside,
    carcassKey,
  });

  const boxes: PartBox[] = [
    /* Боковины: в торце ноги А и в торце ноги Б. */
    box(t / 2, H / 2, -D / 2, t, H, D, SIDE_PANEL_NAME),
    box(S - D / 2, H / 2, legB - t / 2, D, H, t, SIDE_PANEL_NAME),
    /* Дно: нога А от боковины до стены соседа, нога Б от фасада А до боковины Б. */
    box((t + S) / 2, t / 2, -D / 2, S - t, t, D, legName(BOTTOM_PANEL_NAME, 'А')),
    box(S - D / 2, t / 2, (legB - t) / 2, D, t, Math.max(0, legB - t), legName(BOTTOM_PANEL_NAME, 'Б')),
    /* Верх: планки у нижнего, крыша у навесного — по ногам. */
    box((t + S) / 2, H - t / 2, -D / 2, S - t, t, D, legName(topName, 'А')),
    box(S - D / 2, H - t / 2, (legB - t) / 2, D, t, Math.max(0, legB - t), legName(topName, 'Б')),
    /* Задние стенки: вдоль своей стены и вдоль соседней. */
    box(S / 2, H / 2, -D + back / 2, S, H, back, legName(BACK_PANEL_NAME, 'А')),
    box(S - back / 2, H / 2, (legB - D) / 2 + back / 2, back, H, S - back, legName(BACK_PANEL_NAME, 'Б')),
  ];

  for (const mm of unit.fill?.shelves ?? []) {
    boxes.push(
      box((t + S) / 2, mm / MM, (-D + back) / 2, S - t - 0.002, t, D - back, SHELF_PANEL_NAME, true),
      box(S - D / 2 - back / 2, mm / MM, (legB - t) / 2, D - back - 0.002, t, Math.max(0, legB - t), SHELF_PANEL_NAME, true),
    );
  }

  if (options.cutaway) return boxes;

  const { gapM: gap, frontThicknessM: tf } = options;
  const part = `${unit.id}:door:0`;
  const key = frontKey(frontWithMilling(unit, { milling: options.rowMilling }));
  /* Высота фасадов — та же, что режется (`H − зазор` в раскрое): деталь одна. */
  const h = H - gap;

  /* Фасад А — в плоскости своего ряда, до плоскости корпуса соседа. */
  const aW = Math.max(0, legB - gap);
  boxes.push({
    material: 'front',
    part,
    frontKey: key,
    position: [x + legB / 2, y + H / 2, zM + tf / 2],
    scale: [aW, h, tf],
    panel: legName(FACADE_PANEL_NAME, 'А'),
  });

  /* Фасад Б — в плоскости фасадов соседа, от лица фасада А до боковины Б. */
  const bW = Math.max(0, legB - tf - gap);
  boxes.push({
    material: 'front',
    part,
    frontKey: key,
    position: [x + legB - tf / 2, y + H / 2, zM + tf + gap / 2 + bW / 2],
    scale: [tf, h, bW],
    panel: legName(FACADE_PANEL_NAME, 'Б'),
  });

  /*
   * Ручка — на свободном краю фасада А (левом): за неё тянут, и пара
   * складывается. Место и габарит — тем же `handleBoxOf`, что у створок.
   */
  const kind = unit.fill?.handle ?? (options.integratedHandles ? 'profile' : 'bar');
  if (kind !== 'none') {
    const geometry = handleBoxOf(
      handleSpotOf(unit, { options: { integratedHandles: options.integratedHandles } } as Run, 'right'),
      { cx: x + legB / 2, cy: y + H / 2, widthM: aW, heightM: h, thicknessM: tf },
    );
    boxes.push({
      material: 'metal',
      part,
      node: 'handle',
      position: [geometry.position[0], geometry.position[1], zM + geometry.position[2]],
      scale: geometry.scale,
    });
  }

  /*
   * Петли — узлом, а не присадкой (как у створок): у боковины Б, по
   * высоте равномерно; сколько — столько, сколько купила смета.
   */
  const count = Math.max(0, Math.round(options.hinges ?? 0));
  for (let i = 0; i < count; i += 1) {
    const at = y + (H * (i + 1)) / (count + 1);
    boxes.push({
      material: 'metal',
      part,
      node: 'hinge',
      position: [x + legB + HINGE_CUP_DEPTH_M / 2, at, zM + legB - HINGE_NODE_EDGE_MM / MM],
      scale: [HINGE_CUP_DEPTH_M, HINGE_CUP_M, HINGE_CUP_M],
    });
  }

  return boxes;
}

/** Коробка с поворотом: так стоят фасады на ходу. */
export type PosedBox = {
  center: [number, number, number];
  /** Размер в собственных осях коробки. */
  size: [number, number, number];
  /** Поворот вокруг вертикали, радианы (как `rotation.y` у three). */
  yaw: number;
  /** Поворот вокруг горизонтали вдоль ряда (подъёмник, откидной), радианы. */
  pitch?: number;
  role: 'front' | 'handle';
  panel?: string;
};

/**
 * СТВОРКА НА ХОДУ — ТО, ЧТО РИСУЕТ `InteractiveDoor`, ЧИСЛАМИ.
 *
 * Сцена держит открытую створку своим мешем: группа на оси петель,
 * полотно сдвинуто на полширины, ручка на свободном краю. Эти числа
 * жили только в компоненте, и проверить «створка не задевает соседнюю
 * стену» было нечем, кроме глаз. Теперь компонент рисует ровно то, что
 * отдаёт эта функция, а проверка открывания меряет её же (слой 55).
 *
 * `s` — доля хода: 0 закрыто, 1 открыто на `OPEN_ANGLE`. Координаты —
 * модуля (`x`, `y` — левый нижний угол полотна относительно модуля).
 */
/**
 * Полотно и ручка створки В ОСЯХ ЕЁ ПЕТЕЛЬ — то, что `InteractiveDoor`
 * кладёт в свою группу. Одно место на компонент и на `leafPoses`.
 */
export function leafLocal(input: {
  opening: 'left' | 'right' | 'lift' | 'flap';
  width: number;
  height: number;
  thickness: number;
  gap: number;
  integratedHandle: boolean;
}): {
  panel: { at: [number, number, number]; size: [number, number, number] };
  handle: { at: [number, number, number]; size: [number, number, number] };
} {
  const { opening, width, height, thickness, gap, integratedHandle } = input;
  const [panelX, panelY] = doorPivot(opening, 0, 0, width, height).panel;
  return {
    panel: { at: [panelX, panelY, thickness / 2], size: [width - 2 * gap, height - 2 * gap, thickness] },
    handle: integratedHandle
      ? {
          at: [panelX, panelY + height / 2 - gap - 0.01, thickness + 0.004],
          size: [width - 2 * gap, 0.02, 0.015],
        }
      : opening === 'lift' || opening === 'flap'
        ? {
            at: [
              panelX,
              panelY + (opening === 'lift' ? -height / 2 + 0.04 : height / 2 - 0.04),
              thickness + 0.012,
            ],
            size: [Math.min(0.24, width * 0.5), 0.016, 0.016],
          }
        : {
            at: [panelX + (opening === 'left' ? width / 2 - 0.05 : -width / 2 + 0.05), panelY, thickness + 0.012],
            size: [0.016, Math.min(0.22, height * 0.4), 0.016],
          },
  };
}

export function leafPoses(input: {
  opening: 'left' | 'right' | 'lift' | 'flap';
  x: number;
  y: number;
  width: number;
  height: number;
  thickness: number;
  gap: number;
  integratedHandle: boolean;
  s: number;
}): PosedBox[] {
  const { opening, x, y, width, height, thickness, gap, integratedHandle } = input;
  const pivot = doorPivot(opening, x, y, width, height, thickness);
  const angle = pivot.angle * Math.max(0, Math.min(1, input.s));
  /* Вынос вперёд по ходу — тот же, что двигает группу `InteractiveDoor`. */
  const kick = doorKick(pivot, angle);
  const local = leafLocal({ opening, width, height, thickness, gap, integratedHandle });

  /* Локальные точки группы на оси → координаты модуля. */
  const place = (local: [number, number, number]): [number, number, number] => {
    if (pivot.axis === 'y') {
      return [
        pivot.origin[0] + local[0] * Math.cos(angle) + local[2] * Math.sin(angle),
        pivot.origin[1] + local[1],
        pivot.origin[2] + kick - local[0] * Math.sin(angle) + local[2] * Math.cos(angle),
      ];
    }
    return [
      pivot.origin[0] + local[0],
      pivot.origin[1] + local[1] * Math.cos(angle) - local[2] * Math.sin(angle),
      pivot.origin[2] + local[1] * Math.sin(angle) + local[2] * Math.cos(angle),
    ];
  };
  const turn = pivot.axis === 'y' ? { yaw: angle } : { yaw: 0, pitch: angle };

  return [
    { center: place(local.panel.at), size: local.panel.size, role: 'front', ...turn },
    { center: place(local.handle.at), size: local.handle.size, role: 'handle', ...turn },
  ];
}

/** Ход ящика при «Открыть всё», метры: столько выдвигает сцена. */
export const DRAWER_TRAVEL_M = 0.3;

/**
 * ДВА ФАСАДА Г-МОДУЛЯ НА ХОДУ — ОДНА ФУНКЦИЯ НА СЦЕНУ И НА ПРОВЕРКУ.
 *
 * Фасад Б висит на петлях у боковины Б: ось — у его дальнего края, на
 * лице. Фасад А висит на фасаде Б и, открываясь, ложится на него. Ход
 * `s` от 0 (закрыто) до 1 (открыто): Б поворачивается на 90° от угла в
 * комнату, А — ещё на 90° относительно Б. Сцена рисует ровно эти коробки,
 * и проверка «створка не задевает соседнюю стену» меряет их же.
 *
 * Координаты — ряда, как у остальных коробок модуля (`ModulePlacement`).
 */
export function bifoldPoses(
  unit: Module,
  place: ModulePlacement,
  options: Pick<FrontOptions, 'gapM' | 'frontThicknessM' | 'integratedHandles'>,
  s: number,
): PosedBox[] {
  const { x, y, heightM: H, depthM: D } = place;
  const S = unit.widthMm / MM;
  const legB = Math.max(0, S - D);
  const { gapM: gap, frontThicknessM: tf } = options;
  /* Та же высота, что у закрытых фасадов Г-модуля и у детали раскроя. */
  const h = H - gap;
  const aW = Math.max(0, legB - gap);
  const bW = Math.max(0, legB - tf - gap);
  const zM = place.zM;

  const theta = (Math.PI / 2) * Math.max(0, Math.min(1, s));
  const psi = theta;
  const turn = (px: number, pz: number, angle: number): [number, number] => [
    px * Math.cos(angle) + pz * Math.sin(angle),
    -px * Math.sin(angle) + pz * Math.cos(angle),
  ];

  /* Ось Б — дальний край фасада Б, на его лице. */
  const P: [number, number] = [legB - tf, legB];
  /* Фасад Б относительно оси. */
  const bRel: [number, number] = [tf / 2, -(legB - tf) / 2];
  /* Шарнир А–Б — ближний край Б относительно оси. */
  const jRel: [number, number] = [0, tf - legB];
  /* Фасад А относительно шарнира. */
  const aRel: [number, number] = [tf - legB / 2, -tf / 2];

  const bTurned = turn(bRel[0], bRel[1], theta);
  const aLocal = turn(aRel[0], aRel[1], psi);
  const aTurned = turn(jRel[0] + aLocal[0], jRel[1] + aLocal[1], theta);

  const boxes: PosedBox[] = [
    {
      center: [x + P[0] + bTurned[0], y + H / 2, zM + P[1] + bTurned[1]],
      size: [tf, h, bW],
      yaw: theta,
      role: 'front',
      panel: legName(FACADE_PANEL_NAME, 'Б'),
    },
    {
      center: [x + P[0] + aTurned[0], y + H / 2, zM + P[1] + aTurned[1]],
      size: [aW, h, tf],
      yaw: theta + psi,
      role: 'front',
      panel: legName(FACADE_PANEL_NAME, 'А'),
    },
  ];

  /* Ручка — на свободном краю фасада А, тем же `handleBoxOf`, что у створок. */
  const kind = unit.fill?.handle ?? (options.integratedHandles ? 'profile' : 'bar');
  if (kind !== 'none') {
    const closed = handleBoxOf(
      handleSpotOf(unit, { options: { integratedHandles: options.integratedHandles } } as Run, 'right'),
      { cx: legB / 2, cy: H / 2, widthM: aW, heightM: h, thicknessM: tf },
    );
    /* Ручка относительно центра фасада А в его закрытом положении. */
    const off = turn(closed.position[0] - legB / 2, closed.position[2] - tf / 2, theta + psi);
    boxes.push({
      center: [boxes[1].center[0] + off[0], y + closed.position[1], boxes[1].center[2] + off[1]],
      size: closed.scale,
      yaw: theta + psi,
      role: 'handle',
    });
  }

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
   * Г-ОБРАЗНЫЙ МОДУЛЬ — СВОЯ ГЕОМЕТРИЯ (слой 55): корпус в две ноги и
   * два фасада, которые открываются вместе. Прямоугольник 900 × глубина
   * с фальш-панелью вместо второй ноги — то, что было до слоя, — описывал
   * мебель, которой цех не делает.
   */
  if (unit.kind === 'corner_base' || unit.kind === 'corner_upper') {
    return lCornerBoxes(unit, place, options);
  }

  /*
   * Полки, перегородки и короба ящиков уже помечены в данных
   * (`BoxDraw.inside`) — по этому же признаку сцена решает, вести ли по
   * ним рёбра. Цвет берётся оттуда же: второго признака «это внутри»
   * заводить нельзя, он разойдётся с первым.
   */
  const boxes: PartBox[] = carcassBoxes(unit, place).map((box) => ({
    ...box,
    material: (box.inside ? 'inner' : 'carcass') as BoxMaterial,
    /* Декор корпуса: пусто — красит роль, как и раньше. */
    carcassKey: options.carcassKey ?? null,
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
    /*
     * У слепого угла створка одна и только на доступной части; если
     * доступной части меньше самого узкого корпуса — створки нет вовсе.
     */
    const blind = options.openWidthMm !== undefined && options.openWidthMm < unit.widthMm;
    const all = options.openWidthMm === 0 ? [] : doorLeaves(unit, Math.round(place.heightM * MM));
    const leaves = blind ? all.slice(0, 1) : all;

    /*
     * ПЕТЛИ РАСКЛАДЫВАЮТСЯ ПО ПОЛОТНАМ, А НЕ СЧИТАЮТСЯ ЗАНОВО.
     *
     * Сколько их куплено — знает смета, и это число приходит сюда целым.
     * Каждому полотну достаётся столько, сколько держит его высота
     * (`leafHinges` — та же функция, которой считала смета), а остаток
     * ложится на первое: у встроенного холодильника смета берёт петли на
     * ДВЕ створки, а сцена рисует одно полотно во всю высоту (известное
     * расхождение слоя 43). Сумма при этом сходится всегда, и петель на
     * картинке ровно столько, сколько в смете.
     */
    const total = Math.max(0, Math.round(options.hinges ?? 0));
    const byLeaf = leaves.map((leaf) =>
      leafHinges(leaf.span ? leaf.span.heightMm : Math.round(place.heightM * MM), openingOf(unit).opening),
    );
    const spread = byLeaf.reduce((sum, v) => sum + v, 0);
    if (byLeaf.length > 0) byLeaf[0] += total - spread;

    leaves.forEach((leaf, i) => {
      boxes.push(
        ...doorBoxes(
          unit,
          place,
          leaf.index,
          { ...options, hinges: Math.max(0, byLeaf[i] ?? 0) },
          leaf.span ?? undefined,
        ),
      );
    });
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
    /** Материалы корпуса организации: по ним корпус красится своим декором. */
    carcass?: Map<string, CarcassItem>;
  },
): PartBox[] {
  /* Глубину ряда считает `runPlaces`: передать её снаружи больше нельзя. */
  const placed = runPlaces(run);

  /*
   * ПЕТЛИ СЧИТАЮТСЯ ОДИН РАЗ НА РЯД — ТОЙ ЖЕ ФУНКЦИЕЙ, ЧТО ИХ ПОКУПАЕТ.
   *
   * Направление открывания зависит от МЕСТА модуля в ряду (`index`,
   * `total`), поэтому посчитать петли по одному модулю нельзя: у
   * крайнего шкафа сторона другая. Берём разрез `byModule` — тот самый,
   * из которого смета выписывает позиции.
   */
  const all = [...run.modules, ...run.upperSegments.flatMap((sg) => sg.modules)];
  /*
   * Угловые петли — у Г-модуля и у створки слепого угла (слой 55):
   * тот же список, по которому смета пишет строку `hinge_corner_175`.
   */
  const hardware = openingHardware(
    all.map((unit, index) => ({
      unit,
      heightMm: moduleCarcassHeightMm(unit, run),
      index,
      total: all.length,
    })),
    run,
    cornerOfModule(run),
  );

  const carcassItems = options.carcass ?? new Map<string, CarcassItem>();

  /*
   * ФАЛЬШ-ПАНЕЛИ УГЛА — КОРОБКИ НАРАВНЕ С ОСТАЛЬНЫМИ.
   *
   * Они стоят в полосе, которую ряд уже отдал углу: локально ЛЕВЕЕ
   * нуля, в плоскости фасадов. Модулем им быть нельзя — модули
   * складываются в длину ряда и несут столешницу, — но нарисованы они
   * обязаны быть: до слоя 46 между рядами была дыра.
   *
   * Место и ширина — `cornerFillersOf` (слой 55), та же функция, по
   * которой режется деталь: нижняя у слепого угла, верхняя у слепого
   * верхнего угла.
   */
  const filler: PartBox[] = [];
  const frontM = options.frontThicknessMm / MM;
  const gapM = options.gapMm / MM;
  for (const piece of cornerFillersOf(run)) {
    const widthM = (piece.toMm - piece.fromMm) / MM;
    const lower = piece.level === 'lower';
    const neighbour = lower
      ? run.modules[0]
      : [...run.upperSegments.flatMap((sg) => sg.modules)]
          .filter((unit) => unit.section !== 'mezzanine')
          .sort((a, b) => a.offsetMm - b.offsetMm)[0];
    if (!neighbour) continue;
    const heightM = lower
      ? carcassHeightMm(run.production) / MM
      : moduleCarcassHeightMm(neighbour, run) / MM;
    const bottomM = lower ? plinthMm(run.production) / MM : upperBottomFor(neighbour, run) / MM;
    /* Верхняя панель стоит в плоскости фасадов верхнего ряда — он мельче. */
    const planeM = lower
      ? 0
      : (moduleDepthMm(neighbour, run.zone, run.production) -
          rowStandardDepthMm(run.zone, 'base', run.production)) /
        MM;

    filler.push({
      position: [(piece.fromMm + piece.toMm) / 2 / MM, bottomM + heightM / 2, planeM + frontM / 2],
      scale: [Math.max(0, widthM - gapM), Math.max(0, heightM - gapM), frontM],
      material: 'front',
      panel: lower ? CORNER_FILLER_PANEL_NAME : CORNER_UPPER_FILLER_PANEL_NAME,
      frontKey: frontKey(frontOf(neighbour)),
    });
  }

  /*
   * ДОБОР ХВОСТА У СТЕНЫ (слой 55): хвост меньше 150 мм у ряда угловой
   * кухни закрыт планкой под столешницей. Место — `tailFillersOf`, та же
   * функция, по которой плита идёт до стены и режется деталь.
   */
  for (const piece of tailFillersOf(run)) {
    const widthM = (piece.toMm - piece.fromMm) / MM;
    const heightM = carcassHeightMm(run.production) / MM;
    filler.push({
      position: [(piece.fromMm + piece.toMm) / 2 / MM, plinthMm(run.production) / MM + heightM / 2, frontM / 2],
      scale: [Math.max(0, widthM - gapM), Math.max(0, heightM - gapM), frontM],
      material: 'carcass',
      panel: TAIL_FILLER_PANEL_NAME,
    });
  }

  return filler.concat(placed.flatMap((entry) =>
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
        hinges:
          (hardware.byModule[entry.unit.id]?.hinges ?? 0) +
          (hardware.byModule[entry.unit.id]?.cornerHinges ?? 0),
        carcassKey: carcassKeyOf(entry.unit, run, carcassItems),
        /* У слепого угла фасад — только на доступной части (`openFrontMm`). */
        ...(blindPartMm(entry.unit, run) > 0 ? { openWidthMm: openFrontMm(entry.unit, run) } : {}),
      },
      run.production,
    ),
  ));
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

    /*
     * Г-ОБРАЗНЫЙ: два фасада — ОДИН ключ (слой 55). Открываются они вместе,
     * и «открыть» один без другого значило бы показать мебель, которой
     * так не сделать.
     */
    if (unit.kind === 'corner_base' || unit.kind === 'corner_upper') {
      if (!unit.fill || unit.fill.drawerHeights.length === 0) ids.push(`${unit.id}:door:0`);
      continue;
    }

    /*
     * СЛЕПОЙ УГОЛ: створка одна, на доступной части; доступной части
     * меньше корпуса — створки нет и открывать нечего. Те же условия, что
     * у отрисовки (`openWidthMm` в `moduleBoxes`).
     */
    const blind = blindPartMm(unit, run) > 0;
    const open = blind ? openFrontMm(unit, run) : unit.widthMm;
    const leaves = open === 0 ? [] : doorLeaves(unit, moduleCarcassHeightMm(unit, run));
    for (const leaf of blind ? leaves.slice(0, 1) : leaves) {
      ids.push(`${unit.id}:door:${leaf.index}`);
    }
  }

  return ids;
}
