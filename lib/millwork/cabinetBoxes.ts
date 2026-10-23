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
  HDIVIDER_PANEL_NAME,
  legName,
  partOfPanel,
} from './panels';
import { blindPartMm, cornerFillersOf, cornerOfModule, openFrontMm } from './corner';
import { tailFillersOf } from './countertop';
import { moduleDepthMm, rowStandardDepthMm } from './fill';
import { bayDrawerStackOf, bayEnvelope, bayLayout, placeEnvelope } from './bays';
import type { HardwareItem, ProductionSettings } from '@/types/catalog';
import type { ApplianceKind } from '@/types/millwork';
import { moduleDrawerKits, type DrawerKit } from './drawerKit';
import { DRAWER_BOTTOM_PANEL_NAME, DRAWER_SIDE_PANEL_NAME, DRAWER_WALL_PANEL_NAME } from './drawerBox';
import { shopOf } from './shop';
import { FRAME_WIDTH_MM, frontKey, frontOf, isFramed } from './frontMaterial';
import { moduleFronts, type FacadeSpan } from './applianceFront';
import { carcassKeyOf, type CarcassItem } from './carcassMaterial';
import { handleItemOf, installedItem, slidingAccepts } from './fittings';
import { SLIDING_DOOR, slidingDoorCount } from './sections';
import { handleBoxOf, handleSpotOf, type HandleSpot, type LeafGeometry } from './handlePlace';
import {
  genericBarModel,
  genericStripModel,
  handleItemModel,
  placeHandle,
  type HandleModel,
  type HandleOrient,
} from './handleModel';

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
import { leafFrontWithMilling } from './milling';
import type { FrontRelief } from '@/types/millwork';
import { gripOrient, reliefGlassMm, type ReliefOrient } from './facadeRelief';
import { isUpperRow } from './modules';
import { isPullOut, leafHinges, milledGrip, openingHardware, openingOf } from './opening';
import type { GlassKind, Module, Run } from '@/types/millwork';
import { GLASS_SHELF_MM, glassOf, shelvesAreGlass } from './glass';
import type { SceneLayer } from './sceneLayers';

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
  node?: 'hinge' | 'hinge-arm' | 'handle' | 'rod' | 'glass' | 'runner' | 'lift' | 'pantograph' | 'pullout' | 'basket' | 'dryer' | 'track' | 'frame' | 'glass-shelf';
  /**
   * ИД ФИЗИЧЕСКОЙ ДЕТАЛИ (R01): тот же, что в строке раскроя (`Panel.partIds`).
   * Есть у полок и перегородок отсеков — по нему сверяются сцена и цех.
   */
  partId?: string;
  /** Отсек, которому принадлежит деталь. */
  bayId?: string;
  /**
   * КЛЮЧ МАТЕРИАЛА КОРПУСА.
   *
   * Пусто — корпус красится РОЛЬЮ, как и раньше. Заполнен — у него декор
   * из каталога, и пачки отрисовки делятся по этому ключу так же, как
   * фасады по `frontKey` (ловушка 248).
   */
  carcassKey?: string | null;
  /**
   * ВИД СТЕКЛА (V3D-02) — у стекла витрины: двери в раме и окон рамы KIRA
   * (`Module.glass`, не выбран — прозрачное). У стекла прибора поля нет: его
   * вид не выбирают.
   */
  glass?: GlassKind;
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
  /**
   * РЕЛЬЕФ МДФ ЭТОГО ФАСАДА (P3D-MDF) — из фасада ЕГО створки
   * (`leafFrontWithMilling`). Есть — сцена рисует коробку объёмом рисунка
   * (`reliefMesh`) того же габарита; нет — коробкой, как раньше. Габарит,
   * место и раскрой от него не меняются.
   */
  relief?: FrontRelief;
  /**
   * Разворот рисунка с фрезерованной ручкой на ЭТОЙ створке (`gripOrient`):
   * ручка там, где открывают. Пусто — рисунок как снят.
   */
  reliefOrient?: ReliefOrient;
  /**
   * КУДА СМОТРИТ ЛИЦО ФАСАДА. Пусто — на зрителя (+Z ряда). `-x` — фасад Б
   * Г-образного модуля: он стоит в плоскости фасадов соседа, лицом влево,
   * и коробка у него узкая по X. Рельеф ложится на лицо, а не на торец.
   */
  face?: '-x';
  /**
   * РУЧКА ЭТОЙ КОРОБКИ (HANDLE-REAL): модель, поворот и откуда она. Есть —
   * сцена рисует сетку модели на месте коробки (центр тот же, масштаб 1);
   * коробка — её габарит, по нему меряют проверки открывания и рёбра.
   */
  handle?: HandleDraw;
};

/** Ручка в сцене: что нарисовано, как повёрнуто и какая позиция за ним стоит. */
export type HandleDraw = {
  model: HandleModel;
  orient: HandleOrient;
  /** Толщина фасада, мм: у ручки на кромке стенка идёт по тылу фасада. */
  frontMm: number;
  /** Позиция каталога на этой детали; `null` — условная ручка типа модуля. */
  itemId: string | null;
  /** Деталь фасада: `door:0`, `drawer:1`. */
  leaf: string;
  /** Ручка помещается на полотне; нет — нарисована, а вердикт места говорит словами. */
  fits: boolean;
};

/**
 * СЛОЙ КОРОБКИ В СЦЕНЕ (P1) — одна функция на сцену, рёбра и приёмку.
 *
 * Решается по признакам, которые коробка УЖЕ несёт, а не по догадке о
 * цвете: роль материала, имя детали раскроя, ключ подвижной детали и
 * узел фурнитуры. Второй классификации в продукте нет — сцена прячет
 * слой, рёбра идут по тем же слоям, приёмка считает по этой же функции.
 *
 *   фасад (материал `front`)                        → фасады
 *   петля, ручка, штанга — узел или металл детали   → фурнитура
 *   короб и габарит ящика (`<модуль>:…drawer:…`)    → ящики
 *   полка (`SHELF_PANEL_NAME`)                      → полки
 *   перегородка, горизонтальная перегородка зоны    → перегородки
 *   остальное: боковины, дно, крыша, задняя стенка,
 *   планки, прибор и его стекло                     → корпус
 *
 * Металл без узла и без подвижной детали — это лицо прибора (конфорки,
 * панель духовки): он идёт с прибором, а не с фурнитурой мебели.
 */
export function boxLayer(box: Pick<PartBox, 'material' | 'panel' | 'part' | 'node'>): SceneLayer {
  if (box.material === 'front') return 'fronts';
  /* Рама двери витрины (V3D-02) — сама дверь, а не фурнитура на ней. */
  if (box.node === 'frame') return 'fronts';
  /* Стеклянная полка витрины (V3D-02) — полка, хоть и не из листа. */
  if (box.node === 'glass-shelf') return 'shelves';
  /* Стекло рамы витрины — часть фасада: без фасада оно висело бы в воздухе. */
  if (box.material === 'glass' && box.node === 'glass') return 'fronts';
  if (box.material === 'metal' && (box.node !== undefined || box.part !== undefined)) return 'hardware';
  if (box.part !== undefined && box.part.includes(':drawer:')) return 'drawers';
  if (box.panel === DRAWER_ENVELOPE_NAME) return 'drawers';
  if (box.panel === SHELF_PANEL_NAME) return 'shelves';
  if (box.panel === DIVIDER_PANEL_NAME || box.panel === HDIVIDER_PANEL_NAME) return 'partitions';
  return 'carcass';
}

/**
 * ВИДНА ЛИ КОРОБКА ПРИ ЭТИХ СЛОЯХ (P1) — одна функция на сцену, рёбра и приёмку.
 *
 * Слой включён — видна. С одной оговоркой: фурнитура НА ФАСАДЕ (чашка петли,
 * ручка — у них есть подвижная деталь-фасад) без фасада висела бы в воздухе,
 * поэтому она видна вместе с фасадом. Исключение — вид «только фурнитура»
 * (всё, кроме неё, выключено): там узлы показываются на своих местах, ради
 * этого вид и выбирают. Штанги и корпусные части петель от фасада не зависят.
 */
export function boxShown(box: Pick<PartBox, 'material' | 'panel' | 'part' | 'node'>, layers: Record<SceneLayer, boolean>): boolean {
  const layer = boxLayer(box);
  if (!layers[layer]) return false;
  /* Направляющая и механизмы наполнения стоят в корпусе, а не на фасаде (HARDWARE-01). */
  const onFront =
    layer === 'hardware' &&
    box.part !== undefined &&
    box.node !== 'rod' &&
    box.node !== 'hinge-arm' &&
    box.node !== 'runner' &&
    box.node !== 'pantograph' &&
    box.node !== 'pullout' &&
    box.node !== 'basket';
  if (!onFront || layers.fronts) return true;
  const hardwareOnly = !layers.carcass && !layers.partitions && !layers.shelves && !layers.drawers;
  return hardwareOnly;
}

/** Сколько коробок каждого слоя в рядах — для кнопок слоёв: пустой слой не притворяется рабочим. */
export function layerCounts(runs: Run[]): Partial<Record<SceneLayer, number>> {
  const out: Partial<Record<SceneLayer, number>> = {};
  for (const run of runs) {
    for (const box of runBoxes(run, { thicknessMm: 16, frontThicknessMm: 18, gapMm: 3 })) {
      const layer = boxLayer(box);
      out[layer] = (out[layer] ?? 0) + 1;
    }
  }
  return out;
}

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

/**
 * ШТАНГИ ЗОН ОТСЕКОВ (R02B) ЧИСЛАМИ — из `bayLayout`: пролёт — просвет
 * отсека, ось — по высоте зоны, по глубине — середина корпуса. Сечение
 * условное (`diameterMm`): штанга из каталога не выбрана, и это сказано
 * словами в инспекторе и на листе. Коробка несёт ИД штанги: по нему
 * сверяются сцена, лист и проверка пересечений.
 */
export function bayRodBoxes(
  unit: Module,
  place: ModulePlacement,
  production?: ProductionSettings,
  hardware?: Map<string, HardwareItem>,
): PartBox[] {
  const layout = bayLayout(unit, placeEnvelope(unit, place, production));
  if (!layout) return [];
  return layout.bays.flatMap((bay) =>
    (installedItem(unit, 'pantograph', hardware, bay.id) ? [] : bay.rods).map(
      (rod): PartBox => ({
        material: 'metal',
        node: 'rod',
        inside: true,
        partId: rod.partId,
        bayId: bay.id,
        position: [place.x + (rod.xFromMm + rod.xToMm) / 2 / MM, place.y + rod.atMm / MM, rod.zMm / MM],
        scale: [rod.lengthMm / MM, rod.diameterMm / MM, rod.diameterMm / MM],
      }),
    ),
  );
}

export function carcassBoxes(
  unit: Module,
  place: ModulePlacement,
  /** Школа цеха: припуски полок и перегородок отсеков (R01). Пусто — по умолчанию. */
  production?: ProductionSettings,
): BoxDraw[] {
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
   * ОТСЕКИ (R01): полки и перегородки — из `bayLayout`, тех же чисел, что
   * режет цех. Полка по центру своего отсека, короче его на припуск цеха,
   * мельче корпуса на припуск; задним торцом — в заднюю стенку, как и
   * прежняя полка. Перегородка — между дном и крышей. Прежний путь ниже
   * тогда не рисует ничего: деталь одна.
   */
  const bays = bayLayout(unit, placeEnvelope(unit, place, production));
  if (bays) {
    for (const bay of bays.bays) {
      for (const shelf of bay.shelves) {
        boxes.push({
          ...at(
            (shelf.xFromMm + shelf.xToMm) / 2 / MM,
            shelf.atMm / MM,
            backFaceZ + shelf.depthMm / MM / 2,
            shelf.lengthMm / MM,
            shelf.thicknessMm / MM,
            shelf.depthMm / MM,
            true,
            SHELF_PANEL_NAME,
          ),
          partId: shelf.partId,
          bayId: bay.id,
        });
      }
    }
    for (const partition of bays.partitions) {
      boxes.push({
        ...at(
          (partition.xFromMm + partition.xToMm) / 2 / MM,
          heightM / 2,
          backFaceZ + partition.depthMm / MM / 2,
          partition.thicknessMm / MM,
          partition.lengthMm / MM,
          partition.depthMm / MM,
          true,
          DIVIDER_PANEL_NAME,
        ),
        partId: partition.partId,
      });
    }
    /*
     * ГОРИЗОНТАЛЬНЫЕ ПЕРЕГОРОДКИ (R02B) — те же числа, что в раскрое и на
     * листе: от боковины или перегородки до следующей, задней кромкой в
     * заднюю стенку, как полка.
     */
    for (const bay of bays.bays) {
      for (const divider of bay.dividers) {
        boxes.push({
          ...at(
            (divider.xFromMm + divider.xToMm) / 2 / MM,
            (divider.yFromMm + divider.yToMm) / 2 / MM,
            backFaceZ + divider.depthMm / MM / 2,
            divider.lengthMm / MM,
            divider.thicknessMm / MM,
            divider.depthMm / MM,
            true,
            HDIVIDER_PANEL_NAME,
          ),
          partId: divider.partId,
          bayId: bay.id,
        });
      }
    }
    return boxes;
  }

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
   * КОМПЛЕКТЫ ЯЩИКОВ МОДУЛЯ (HARDWARE-01): у ящика с рассчитанным коробом
   * сцена рисует ТЕ ЖЕ детали, что режет раскрой (`moduleDrawerKits`), и
   * направляющую. Пусто — короб условный, как раньше.
   */
  drawerKits?: DrawerKit[];
  /**
   * КЛЮЧИ ДЕКОРА ПОЛОК И ПЕРЕГОРОДОК — та же `carcassKeyOf` с родом детали.
   * Своего декора нет — ключ тот же, что у корпуса.
   */
  partKeys?: Partial<Record<'shelves' | 'partitions', string | null>>;
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
  /**
   * ФУРНИТУРА ОРГАНИЗАЦИИ (HARDWARE-01): механизм на месте модуля рисуется по
   * позиции, которая там стоит (`installedItem`). Пусто — механизмов в
   * сцене нет, как до каталога.
   */
  hardware?: Map<string, HardwareItem>;
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
  | {
      kind: 'door';
      id: string;
      opening: 'left' | 'right' | 'lift' | 'flap';
      xM: number;
      widthM: number;
      /** Дверь витрины в раме (V3D-02): полотна ЛДСП нет — стекло и рама едут «седоками». */
      glass?: true;
    }
  | { kind: 'bifold'; id: string }
  | { kind: 'drawer'; id: string; bottomM: number; heightM: number }
  /** Карго: фасад не открывается, а выдвигается — вместе с корзинами (HARDWARE-01). */
  | { kind: 'pullout'; id: string };

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
  /*
   * ВИТРИНА В РАМЕ (V3D-02) открывается: стекло и профиль — коробки
   * `displayDoorBoxes` на ключе `door:0`, полотна ЛДСП у неё нет.
   */
  if (unit.section === 'glass_display') {
    const opening = doorOpening(unit, 0, 1);
    out.push({
      kind: 'door',
      id: `${unit.id}:door:0`,
      opening: opening === 'lift' || opening === 'flap' ? 'left' : opening,
      xM: 0,
      widthM: unit.widthMm / MM,
      glass: true,
    });
    return out;
  }
  if (hasVisibleAppliance(unit) || unit.column || openWidthM === 0) {
    return out;
  }
  /*
   * КАРГО ВЫДВИГАЕТСЯ, А НЕ ОТКРЫВАЕТСЯ (ловушка 316): петель у него нет ни
   * в смете, ни в сцене, и фасад едет вперёд вместе с корзинами. Ключ —
   * тот же, что у его фасада (`door:0`): фасад детали и раскрой его знают.
   */
  if (isPullOut(unit) && doorCount(unit) > 0 && openWidthM === undefined) {
    out.push({ kind: 'pullout', id: `${unit.id}:door:0` });
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

/** Ручка на кромке: у навесных — на нижней, у механизма — на свободной, у остальных — на верхней. */
function edgeMountOf(spot: HandleSpot, seat: 'spot' | 'center', upper: boolean): 'top' | 'bottom' {
  if (seat === 'spot' && spot.place === 'top-center') return 'top';
  if (seat === 'spot' && spot.place === 'bottom-center') return 'bottom';
  return upper ? 'bottom' : 'top';
}

/**
 * РУЧКА НА ЭТОЙ ДЕТАЛИ ФАСАДА — ОДНА ФУНКЦИЯ НА ВСЮ СЦЕНУ (HANDLE-REAL).
 *
 * Закрытая створка, ящик, Г-модуль, едущая створка (её коробки — те же,
 * `riders`) и проверка открывания у угла берут ручку отсюда. Раньше у
 * закрытой двери был брусок по `handleBoxOf`, у открытой — свой по
 * `leafLocal`, у ящика — свой по опции ряда: «Без ручки» на ящике рисовал
 * скобу, а открытая дверь с «Без ручки» получала ручку на ходу.
 *
 *   «Без ручки» или ручка фрезерована в фасаде → ручки нет;
 *   «Профиль»   → условный уголок во всю ширину полотна;
 *   «Скоба»     → позиция каталога этой детали (`handleItemOf`: своя у
 *                 створки сильнее ручки модуля) по её модели; нет позиции
 *                 или у неё нет модели — условная скоба по правилу места.
 *
 * `geometry` — полотно в координатах ряда (центр, размер в свету зазоров,
 * толщина фасада); ручка ставится на его лицо.
 */
export function leafHandleBox(input: {
  unit: Module;
  leaf: string;
  part: string;
  geometry: LeafGeometry;
  spot: HandleSpot;
  /** `center` — у ящика: ручка посередине фронта. */
  seat: 'spot' | 'center';
  options: Pick<FrontOptions, 'integratedHandles' | 'hardware'>;
}): PartBox | null {
  const { unit, leaf, geometry, spot, seat } = input;
  if (milledGrip(unit, leaf)) return null;
  const kind = unit.fill?.handle ?? (input.options.integratedHandles ? 'profile' : 'bar');
  if (kind === 'none') return null;
  let model: HandleModel;
  const item = kind === 'bar' ? handleItemOf(unit, leaf, input.options.hardware) : null;
  const shaped = item ? handleItemModel(item).model : null;
  if (kind === 'profile') model = genericStripModel(geometry.widthM * MM);
  else if (shaped) model = shaped;
  else {
    /* Условная скоба — длиной прежнего бруска: доля стороны, вдоль которой она стоит. */
    const box = handleBoxOf(seat === 'center' ? { place: 'top-center', turn: 'horizontal' } : spot, geometry);
    model = genericBarModel(Math.max(box.scale[0], box.scale[1]) * MM);
  }
  const placed = placeHandle(model, spot, geometry, { seat, edge: edgeMountOf(spot, seat, isUpperRow(unit)) });
  return {
    material: 'metal',
    part: input.part,
    node: 'handle',
    position: placed.position,
    scale: placed.scale,
    handle: {
      model,
      orient: placed.orient,
      frontMm: Math.round(geometry.thicknessM * MM * 10) / 10,
      itemId: item?.id ?? null,
      leaf,
      fits: placed.fits,
    },
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
   * ЧЕМ ОТКРЫВАЮТ И ГДЕ РУЧКА — `leafHandleBox` (HANDLE-REAL).
   *
   * Тип ручки — выбор модуля («Без ручки» рисуется буквально: на фасаде
   * нет ничего), модель — позиция каталога этой створки, место — правило
   * `handleSpotOf`: сторона выводится из открывания, высота и поворот — у
   * человека. Та же коробка едет с открытой створкой (`riders`).
   */
  const handle = leafHandleBox({
    unit,
    leaf: `door:${index}`,
    part,
    geometry: { cx, cy, widthM: doorW - 2 * gap, heightM: heightM - 2 * gap, thicknessM: thickness },
    spot: handleSpotOf(unit, { options: { integratedHandles } } as Run, hinge),
    seat: 'spot',
    options,
  });

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

  /* Фасад ЭТОЙ створки (P3D-MDF): свой у створки или модульный — одна функция. */
  const spec = leafFrontWithMilling(unit, `door:${index}`, { milling: options.rowMilling });
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
  /* Ручки нет — «Без ручки» или ручка фрезерована в фасаде (KIRA «Интегрированные ручки»). */
  const withHandle = (parts: PartBox[]) => (handle ? [...parts, handle, ...hingeNodes] : [...parts, ...hingeNodes]);

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

  /* Рисунок с ручкой — ручкой к открываемой стороне (`gripOrient`). */
  const reliefOrient = gripOrient(spec.relief, doorOpening(unit, span ? 0 : index, doors), isUpperRow(unit));
  const leafBoxes: PartBox[] = [
    {
      material: 'front',
      part,
      frontKey: key,
      position: [cx, cy, thickness / 2],
      scale: [w, h, thickness],
      ...(spec.relief ? { relief: spec.relief } : {}),
      ...(reliefOrient ? { reliefOrient } : {}),
    },
  ];
  /*
   * РАМА ВИТРИНЫ (KIRA «Витрины»): окна в раме сквозные, за ними стекло —
   * у самого тыла, в четверти. Стекло — деталь ТОЙ ЖЕ створки (`part`):
   * открылась дверь — уехало вместе с ней.
   */
  const glass = reliefGlassMm(spec.relief, { widthMm: w * MM, heightMm: h * MM, thicknessMm: thickness * MM }, reliefOrient);
  if (glass) {
    leafBoxes.push({
      material: 'glass',
      part,
      node: 'glass',
      glass: glassOf(unit),
      position: [cx + (glass[0] + glass[2]) / 2 / MM, cy + (glass[1] + glass[3]) / 2 / MM, GLASS_PANE_Z_M],
      scale: [(glass[2] - glass[0]) / MM, (glass[3] - glass[1]) / MM, GLASS_PANE_M],
    });
  }
  return withHandle(leafBoxes);
}

/** Стекло рамы витрины: 4 мм у самого тыла полотна (VISUAL_ONLY — толщины стекла цех не давал). */
export const GLASS_PANE_M = 0.004;
export const GLASS_PANE_Z_M = 0.0035;

/** Профиль рамы двери витрины, м: ширина планки — условно (VISUAL_ONLY, профиля в каталоге нет). */
export const DISPLAY_FRAME_M = 0.02;

/**
 * ДВЕРЬ ВИТРИНЫ В РАМЕ (V3D-02) — рама из профиля и стекло, деталь `door:0`.
 *
 * Фасада ЛДСП у витрины нет (`frontType: 'none'`): дверь — покупное стекло в
 * раме, строкой `glass_front` («Стеклянная дверь в раме»). Здесь она нарисована
 * теми же коробками, что едут, когда дверь открывают: закрытую — пачка ряда,
 * открытую — `InteractiveDoor` своими «седоками». Петель на ней нет: смета их
 * не покупает отдельно — они в строке стеклянной двери.
 */
export function displayDoorBoxes(unit: Module, place: ModulePlacement, options: Pick<FrontOptions, 'gapM' | 'frontThicknessM'>): PartBox[] {
  if (unit.section !== 'glass_display') return [];
  const { x, y, heightM } = place;
  const gap = options.gapM;
  const t = options.frontThicknessM;
  const w = unit.widthMm / MM - 2 * gap;
  const h = heightM - 2 * gap;
  const cx = x + unit.widthMm / MM / 2;
  const cy = y + heightM / 2;
  const bar = Math.min(DISPLAY_FRAME_M, w / 4, h / 4);
  const part = `${unit.id}:door:0`;
  const frame = (dx: number, dy: number, sx: number, sy: number): PartBox => ({
    material: 'metal',
    part,
    node: 'frame',
    position: [cx + dx, cy + dy, t / 2],
    scale: [sx, sy, t],
  });
  return [
    frame(-w / 2 + bar / 2, 0, bar, h),
    frame(w / 2 - bar / 2, 0, bar, h),
    frame(0, h / 2 - bar / 2, w - 2 * bar, bar),
    frame(0, -h / 2 + bar / 2, w - 2 * bar, bar),
    {
      material: 'glass',
      part,
      node: 'glass',
      glass: glassOf(unit),
      /* Стекло — в пазу профиля: на 4 мм заходит под планки с каждой стороны. */
      position: [cx, cy, t / 2],
      scale: [Math.max(0.01, w - 2 * bar + 0.008), Math.max(0.01, h - 2 * bar + 0.008), GLASS_PANE_M],
    },
  ];
}

/** Справочный габарит ящика отсека в сцене: не деталь, в раскрое его нет. */
export const DRAWER_ENVELOPE_NAME = 'Габарит ящика (справочно)';

/**
 * ЯЩИКИ ОТСЕКОВ (R02A) ЧИСЛАМИ — из `bayLayout`, тех же чисел, что режет цех
 * и рисует лист.
 *
 * Фасад — вкладной: лицом на передней кромке корпуса, весь внутри проёма
 * отсека. За ним — ГАБАРИТ РАБОЧЕЙ ЗОНЫ ящика «внутренним» материалом: это
 * место, которое ящик занимает, а не его короб — короб без правил цеха и
 * подтверждённой направляющей не рассчитан. Ни ручек, ни боковин короба
 * здесь нет: их размеров никто не подтверждал. Обе коробки несут ИД ящика
 * (`part`), и открытый ящик едет своим мешем целиком.
 */
export function bayDrawerBoxes(
  unit: Module,
  place: ModulePlacement,
  options: FrontOptions,
  production?: ProductionSettings,
): PartBox[] {
  const layout = bayLayout(unit, placeEnvelope(unit, place, production));
  if (!layout) return [];
  const out: PartBox[] = [];
  for (const bay of layout.bays) {
    for (const drawer of bay.drawerStack?.drawers ?? []) {
      const env = drawer.envelope;
      const front = drawer.front;
      /* Короб рассчитан (HARDWARE-01) — его детали и направляющая вместо габарита. */
      const kit = options.drawerKits?.find((k) => k.place.key === drawer.id);
      if (kit && kit.state === 'box') {
        out.push(...kitBoxes(kit, place, drawer.id, options.carcassKey ?? null, bay.id));
      } else out.push({
        material: 'inner',
        part: drawer.id,
        inside: true,
        panel: DRAWER_ENVELOPE_NAME,
        bayId: bay.id,
        carcassKey: options.carcassKey ?? null,
        /* Глубина — из `bayLayout` (`zFromMm…zToMm`): те же числа читает разрез. */
        position: [
          place.x + (env.xFromMm + env.xToMm) / 2 / MM,
          place.y + (env.yFromMm + env.yToMm) / 2 / MM,
          (env.zFromMm + env.zToMm) / 2 / MM,
        ],
        scale: [(env.xToMm - env.xFromMm) / MM, (env.yToMm - env.yFromMm) / MM, (env.zToMm - env.zFromMm) / MM],
      });
      if (options.cutaway) continue;
      /* Фасад ЭТОГО ящика (P3D-MDF): деталь — его ключ без имени модуля. */
      const spec = leafFrontWithMilling(unit, drawer.id.slice(unit.id.length + 1), { milling: options.rowMilling });
      const bayOrient = gripOrient(spec.relief, 'flap', isUpperRow(unit));
      out.push({
        material: 'front',
        part: drawer.id,
        partId: front.partId,
        bayId: bay.id,
        panel: 'Фронт ящика',
        frontKey: frontKey(spec),
        ...(spec.relief ? { relief: spec.relief } : {}),
        ...(bayOrient ? { reliefOrient: bayOrient } : {}),
        position: [
          place.x + (front.xFromMm + front.xToMm) / 2 / MM,
          place.y + (front.yFromMm + front.yToMm) / 2 / MM,
          (front.zFromMm + front.zToMm) / 2 / MM,
        ],
        scale: [front.widthMm / MM, front.heightMm / MM, (front.zToMm - front.zFromMm) / MM],
      });
    }
  }
  return out;
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
  /* Короб рассчитан (HARDWARE-01) — рисуем его детали из комплекта, а не условный. */
  const kit = options.drawerKits?.find((k) => k.place.key === part);

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

  const boxes: PartBox[] = kit && kit.state === 'box' ? kitBoxes(kit, place, part, options.carcassKey ?? null) : [
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

  /* Фасад ЭТОГО ящика (P3D-MDF): свой у ящика или модульный. */
  const spec = leafFrontWithMilling(unit, `drawer:${index}`, { milling: options.rowMilling });
  /* Ящик выдвигают за верх; у верхнего ряда — за низ. */
  const drawerOrient = gripOrient(spec.relief, 'flap', isUpperRow(unit));
  boxes.push({
    material: 'front',
    part,
    frontKey: frontKey(spec),
    position: [cx, cy, thickness / 2],
    scale: [widthM - 2 * gap, height - 2 * gap, thickness],
    ...(spec.relief ? { relief: spec.relief } : {}),
    ...(drawerOrient ? { reliefOrient: drawerOrient } : {}),
  });

  /*
   * РУЧКА ЯЩИКА — ТА ЖЕ `leafHandleBox`, что у створок (HANDLE-REAL).
   *
   * Здесь стояла своя ветка по опции ряда: выбор модуля («Без ручки»,
   * «Профиль») до ящика не доезжал, и на фронте с механизмом нажатия
   * рисовалась скоба, висевшая в 4 мм от лица. Ручка ящика — посередине
   * фронта; фрезерованная во фронте (`milledGrip`) накладной не даёт.
   */
  const handle = leafHandleBox({
    unit,
    leaf: `drawer:${index}`,
    part,
    geometry: { cx, cy, widthM: widthM - 2 * gap, heightM: height - 2 * gap, thicknessM: thickness },
    spot: { place: 'top-center', turn: 'horizontal' },
    seat: 'center',
    options: { integratedHandles, hardware: options.hardware },
  });
  if (handle) boxes.push(handle);

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
  const keyOf = (panel: string) => {
    const part = partOfPanel(panel);
    return part && options.partKeys?.[part] !== undefined ? (options.partKeys[part] ?? null) : carcassKey;
  };
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
    carcassKey: keyOf(panel),
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
  /* Пара открывается вместе, и фасад у неё один — створки `door:0` (P3D-MDF). */
  const spec = leafFrontWithMilling(unit, 'door:0', { milling: options.rowMilling });
  const key = frontKey(spec);
  const relief = spec.relief ? { relief: spec.relief } : {};
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
    ...relief,
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
    ...relief,
    face: '-x',
  });

  /*
   * Ручка — на свободном краю фасада А (левом): за неё тянут, и пара
   * складывается. Место и габарит — тем же `handleBoxOf`, что у створок.
   */
  const handle = leafHandleBox({
    unit,
    leaf: 'door:0',
    part,
    geometry: { cx: x + legB / 2, cy: y + H / 2, widthM: aW, heightM: h, thicknessM: tf },
    spot: handleSpotOf(unit, { options: { integratedHandles: options.integratedHandles } } as Run, 'right'),
    seat: 'spot',
    options,
  });
  if (handle) boxes.push({ ...handle, position: [handle.position[0], handle.position[1], zM + handle.position[2]] });

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
  /** Ручка (HANDLE-REAL): сцена рисует её модель, коробка — её габарит. */
  handle?: HandleDraw;
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
 * Полотно створки В ОСЯХ ЕЁ ПЕТЕЛЬ — то, что `InteractiveDoor` кладёт в
 * свою группу. Одно место на компонент и на `leafPoses`.
 *
 * Ручки здесь нет (HANDLE-REAL): у открытой створки своя формула ручки
 * ставила её не туда, где она стояла закрытой, и рисовала её при «Без
 * ручки». Ручка едет с полотном той же коробкой, что у закрытой створки
 * (`doorBoxes` → `riders`, `leafPoses({ handle })`).
 */
export function leafLocal(input: {
  opening: 'left' | 'right' | 'lift' | 'flap';
  width: number;
  height: number;
  thickness: number;
  gap: number;
}): {
  panel: { at: [number, number, number]; size: [number, number, number] };
} {
  const { opening, width, height, thickness, gap } = input;
  const [panelX, panelY] = doorPivot(opening, 0, 0, width, height).panel;
  return {
    panel: { at: [panelX, panelY, thickness / 2], size: [width - 2 * gap, height - 2 * gap, thickness] },
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
  /**
   * РУЧКА ЗАКРЫТОЙ СТВОРКИ в координатах модуля — коробка из `doorBoxes`.
   * Пусто — ручки на створке нет (её нет и в сцене).
   */
  handle?: Pick<PartBox, 'position' | 'scale' | 'handle'> | null;
  s: number;
}): PosedBox[] {
  const { opening, x, y, width, height, thickness, gap } = input;
  const pivot = doorPivot(opening, x, y, width, height, thickness);
  const angle = pivot.angle * Math.max(0, Math.min(1, input.s));
  /* Вынос вперёд по ходу — тот же, что двигает группу `InteractiveDoor`. */
  const kick = doorKick(pivot, angle);
  const local = leafLocal({ opening, width, height, thickness, gap });

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

  const out: PosedBox[] = [{ center: place(local.panel.at), size: local.panel.size, role: 'front', ...turn }];
  if (input.handle) {
    /* Ручка в осях петель — её место у закрытой створки минус ось; дальше она едет с полотном. */
    const at: [number, number, number] = [
      input.handle.position[0] - pivot.origin[0],
      input.handle.position[1] - pivot.origin[1],
      input.handle.position[2] - pivot.origin[2],
    ];
    out.push({
      center: place(at),
      size: input.handle.scale,
      role: 'handle',
      ...turn,
      ...(input.handle.handle ? { handle: input.handle.handle } : {}),
    });
  }
  return out;
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
  options: Pick<FrontOptions, 'gapM' | 'frontThicknessM' | 'integratedHandles' | 'hardware'>,
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

  /* Ручка — на свободном краю фасада А, той же `leafHandleBox`, что у створок и закрытого Г-модуля. */
  const closed = leafHandleBox({
    unit,
    leaf: 'door:0',
    part: `${unit.id}:door:0`,
    geometry: { cx: legB / 2, cy: H / 2, widthM: aW, heightM: h, thicknessM: tf },
    spot: handleSpotOf(unit, { options: { integratedHandles: options.integratedHandles } } as Run, 'right'),
    seat: 'spot',
    options,
  });
  if (closed) {
    /* Ручка относительно центра фасада А в его закрытом положении. */
    const off = turn(closed.position[0] - legB / 2, closed.position[2] - tf / 2, theta + psi);
    boxes.push({
      center: [boxes[1].center[0] + off[0], y + closed.position[1], boxes[1].center[2] + off[1]],
      size: closed.scale,
      yaw: theta + psi,
      role: 'handle',
      ...(closed.handle ? { handle: closed.handle } : {}),
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
  /* Стеклянные полки витрины (V3D-02): та же высота и место, стекло вместо листа. */
  const glassShelves = shelvesAreGlass(unit);
  const boxes: PartBox[] = carcassBoxes(unit, place, production).map((box): PartBox => {
    if (glassShelves && box.panel === SHELF_PANEL_NAME) {
      const { panel: _panel, ...rest } = box;
      void _panel;
      return {
        ...rest,
        material: 'glass',
        node: 'glass-shelf',
        glass: 'clear',
        scale: [box.scale[0], GLASS_SHELF_MM / MM, box.scale[2]],
      };
    }
    /* Полки и перегородки — свой декор, если выбран (`partOfPanel`, та же таблица, что у раскроя). */
    const part = partOfPanel(box.panel);
    const partKey = part ? options.partKeys?.[part] : undefined;
    return {
      ...box,
      material: (box.inside ? 'inner' : 'carcass') as BoxMaterial,
      /* Декор корпуса: пусто — красит роль, как и раньше. */
      carcassKey: partKey !== undefined ? partKey : (options.carcassKey ?? null),
    };
  });

  boxes.push(...applianceBoxes(unit, place, production));
  boxes.push(...bayRodBoxes(unit, place, production, options.hardware));
  /* Механизмы по позиции на месте (HARDWARE-01): картинка по паспорту, без CAD производителя. */
  boxes.push(...mechanismBoxes(unit, place, options, production));


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
  /* Ящики отсеков (R02A) — своей функцией из `bayLayout`. */
  boxes.push(...bayDrawerBoxes(unit, place, options, production));

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
    /* Витрина: стекло в раме своей функцией (V3D-02) — `doorLeaves` её не знает. */
    boxes.push(...displayDoorBoxes(unit, place, options));

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
    /** Фурнитура организации: короба ящиков по комплекту (HARDWARE-01). Пусто — как раньше. */
    hardware?: Map<string, HardwareItem>;
    /**
     * ШКОЛА ЦЕХА ЭКРАНА — та же, по которой режет деталировка. По ней
     * считаются короба ящиков: `run.production` у сохранённого ряда — снимок
     * на момент записи, и короб по нему разошёлся бы с раскроем. Пусто —
     * школа ряда.
     */
    production?: ProductionSettings;
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
          .filter((unit) => unit.section !== 'mezzanine' && !unit.overhead)
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

  /* Система купе ряда (HARDWARE-01): шины и полотна — по позиции ряда. */
  filler.push(...kupeBoxes(run, options));

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
        partKeys: {
          shelves: carcassKeyOf(entry.unit, run, carcassItems, 'shelves'),
          partitions: carcassKeyOf(entry.unit, run, carcassItems, 'partitions'),
        },
        /* У слепого угла фасад — только на доступной части (`openFrontMm`). */
        ...(blindPartMm(entry.unit, run) > 0 ? { openWidthMm: openFrontMm(entry.unit, run) } : {}),
        /* Комплекты ящиков — тем же `moduleDrawerKits`, что режет короб в раскрое. */
        ...(options.hardware && options.hardware.size > 0 && (options.production ?? shopOf(run.production)).drawerBox
          ? { drawerKits: moduleDrawerKits(entry.unit, run, options.production ?? shopOf(run.production), options.hardware) }
          : {}),
        ...(options.hardware && options.hardware.size > 0 ? { hardware: options.hardware } : {}),
      },
      run.production,
    ),
  ));
}

/* ─────────────────  Механизмы по позиции каталога (HARDWARE-01)  ───────────────── */

/**
 * КАРТИНКА МЕХАНИЗМА — VISUAL_APPROXIMATION.
 *
 * CAD производителей у нас нет (Blum — за входом, Hettich — согласие с
 * условиями, Häfele — недоступен), поэтому механизм — коробки условного
 * размера на своём месте. Это изображение узла, а не деталь: по этим числам
 * ничего не сверлят и не заказывают. Где паспорт печатает габарит (глубина
 * механизма подъёмника), картинка берёт его; остальное — константы ниже,
 * и они названы условными.
 */
const MECH = {
  /** Корпус силового механизма подъёмника: толщина у боковины, высота, глубина. */
  liftWidthMm: 30,
  liftHeightMm: 120,
  liftDepthMm: 160,
  /** Корзина карго: шаг по высоте, высота бортика, толщина прутка. */
  basketStepMm: 300,
  basketRailMm: 60,
  wireMm: 4,
  /** Сушилка: высота решёток (тарелки, чашки) и число прутков. */
  dryerPlateMm: 120,
  dryerCupMm: 80,
  dryerBars: 8,
  /** Пантограф: высота тяги над штангой; ход вниз — не больше; вылет вперёд (условно, паспорт печатает его для монтажа). */
  pantographArmMm: 350,
  pantographDropMm: 600,
  pantographReachMm: 350,
  /** Купе: шины и плоскости полотен перед корпусом. */
  /** Выдвижное наполнение шкафа: высота рамки от низа отсека, ход вперёд. */
  pulloutFromBottomMm: 400,
  pulloutTravelMm: 350,
  trackDepthMm: 90,
  trackTopMm: 40,
  trackBottomMm: 10,
  kupeLeafMm: 18,
} as const;

const mm = (v: number) => v / MM;

/**
 * ПАНТОГРАФ ОТСЕКА — где его штанга и куда она едет. Одна функция на
 * коробки и на ход: картинка и движение не расходятся.
 */
export function pantographPlan(
  unit: Module,
  place: ModulePlacement,
  production: ProductionSettings | undefined,
  bayId: string,
): { rodAtMm: number; rodZMm: number; x0Mm: number; x1Mm: number; dropMm: number; reachMm: number } | null {
  const layout = bayLayout(unit, placeEnvelope(unit, place, production));
  const bay = layout?.bays.find((b) => b.id === bayId);
  if (!layout || !bay) return null;
  const t = layout.envelope.thicknessMm;
  const top = layout.envelope.heightMm - t;
  /* Штанга пантографа — на месте верхней штанги отсека; штанг нет — под крышей. */
  const rodAtMm = bay.rods.length > 0 ? Math.max(...bay.rods.map((rod) => rod.atMm)) : top - 80;
  const rodZMm = bay.rods.length > 0 ? bay.rods[0].zMm : -layout.envelope.depthMm / 2;
  return {
    rodAtMm,
    rodZMm,
    x0Mm: bay.xFromMm,
    x1Mm: bay.xToMm,
    /* Ход вниз — не ниже пояса (900 мм от низа корпуса) и не больше условного. */
    dropMm: Math.max(0, Math.min(MECH.pantographDropMm, rodAtMm - 900)),
    reachMm: MECH.pantographReachMm,
  };
}

/**
 * ВЫДВИЖНОЕ НАПОЛНЕНИЕ ОТСЕКА — где стоит и куда едет. Выдвижная штанга —
 * вдоль глубины под крышей, её длина из паспорта (нет — по глубине отсека);
 * брючница, корзина, обувница, галстучница — рамка на условной высоте.
 */
export function pulloutPlan(
  unit: Module,
  place: ModulePlacement,
  production: ProductionSettings | undefined,
  bayId: string,
  item: HardwareItem,
): { rod: boolean; x0Mm: number; x1Mm: number; atMm: number; lengthMm: number; travelMm: number } | null {
  const layout = bayLayout(unit, placeEnvelope(unit, place, production));
  const bay = layout?.bays.find((b) => b.id === bayId);
  if (!layout || !bay) return null;
  const t = layout.envelope.thicknessMm;
  const depth = layout.envelope.depthMm - t - 40;
  const rod = item.hardware.subcategory === 'pullout_rod';
  const length = Math.min(depth, item.hardware.dimensionsMm?.length ?? depth);
  return {
    rod,
    x0Mm: bay.xFromMm,
    x1Mm: bay.xToMm,
    atMm: rod ? layout.envelope.heightMm - t - 60 : Math.min(t + MECH.pulloutFromBottomMm, layout.envelope.heightMm - t - 200),
    lengthMm: length,
    travelMm: rod ? Math.round(length * 0.9) : MECH.pulloutTravelMm,
  };
}

/** Механизмы на местах модуля: подъёмник, корзины карго, сушилка, пантографы отсеков. */
export function mechanismBoxes(
  unit: Module,
  place: ModulePlacement,
  options: FrontOptions,
  production?: ProductionSettings,
): PartBox[] {
  const hardware = options.hardware;
  if (!hardware || hardware.size === 0 || !unit.fittings?.length) return [];
  const out: PartBox[] = [];
  const W = unit.widthMm;
  const H = place.heightM * MM;
  const D = place.depthM * MM;
  const t = place.thicknessM * MM;
  const at = (xMm: number, yMm: number, zMm: number): [number, number, number] => [place.x + mm(xMm), place.y + mm(yMm), mm(zMm)];
  const size = (x: number, y: number, z: number): [number, number, number] => [mm(x), mm(y), mm(z)];

  /* Подъёмник: два силовых механизма у боковин под крышей; рычаг едет с фасадом. */
  const lift = installedItem(unit, 'lift', hardware);
  if (lift && openingOf(unit).opening === 'lift' && !options.cutaway) {
    const h = lift.hardware.dimensionsMm?.mechanismHeight ?? MECH.liftHeightMm;
    const d = Math.min(lift.hardware.dimensionsMm?.mechanismDepth ?? MECH.liftDepthMm, Math.max(40, D - t - 20));
    const y = H - t - 10 - h / 2;
    for (const x of [t + MECH.liftWidthMm / 2, W - t - MECH.liftWidthMm / 2]) {
      out.push({ material: 'metal', node: 'lift', inside: true, position: at(x, y, -(20 + d / 2)), scale: size(MECH.liftWidthMm, h, d) });
      out.push({
        material: 'metal',
        node: 'lift',
        inside: true,
        part: `${unit.id}:door:0`,
        position: at(x, y + h / 2 - 15, -10),
        scale: size(12, 30, 20),
      });
    }
  }

  /* Карго: корзины выезжают с фасадом — тот же ключ, что у его фасада. */
  const cargo = installedItem(unit, 'cargo', hardware);
  if (cargo && isPullOut(unit)) {
    const inner = H - 2 * t;
    const n = Math.max(1, Math.floor(inner / MECH.basketStepMm));
    const step = (inner - 80) / n;
    const w = W - 2 * t - 20;
    const depth = D - t - 60;
    const zc = -(30 + depth / 2);
    for (let i = 0; i < n; i += 1) {
      const y0 = t + 40 + i * step;
      const part = `${unit.id}:door:0`;
      out.push({ material: 'metal', node: 'basket', inside: true, part, position: at(W / 2, y0, zc), scale: size(w, MECH.wireMm, depth) });
      out.push({ material: 'metal', node: 'basket', inside: true, part, position: at(W / 2, y0 + MECH.basketRailMm / 2, -30), scale: size(w, MECH.basketRailMm, MECH.wireMm) });
      out.push({ material: 'metal', node: 'basket', inside: true, part, position: at(W / 2, y0 + MECH.basketRailMm / 2, -(30 + depth)), scale: size(w, MECH.basketRailMm, MECH.wireMm) });
    }
  }

  /* Сушилка: решётка тарелок внизу и решётка чашек выше — в корпусе, неподвижно. */
  const dryer = installedItem(unit, 'dryer', hardware);
  if (dryer) {
    const w = W - 2 * t - 20;
    const depth = D - t - 40;
    const zc = -(20 + depth / 2);
    const levels: [number, number][] = [
      [t + 40, MECH.dryerPlateMm],
      [t + 40 + Math.min(300, (H - 2 * t) / 2), MECH.dryerCupMm],
    ];
    for (const [y0, barH] of levels) {
      out.push({ material: 'metal', node: 'dryer', inside: true, position: at(W / 2, y0, zc), scale: size(w, MECH.wireMm, depth) });
      for (let b = 0; b < MECH.dryerBars; b += 1) {
        const x = t + 10 + ((b + 0.5) * w) / MECH.dryerBars;
        out.push({ material: 'metal', node: 'dryer', inside: true, position: at(x, y0 + barH / 2, zc), scale: size(MECH.wireMm, barH, depth) });
      }
    }
  }

  /* Выдвижное наполнение отсека: едет вперёд; направляющая выдвижной штанги под крышей стоит. */
  for (const fitting of unit.fittings) {
    if (fitting.slot !== 'wardrobe_pullout' || !fitting.bayId) continue;
    const item = installedItem(unit, 'wardrobe_pullout', hardware, fitting.bayId);
    if (!item) continue;
    const plan = pulloutPlan(unit, place, production, fitting.bayId, item);
    if (!plan) continue;
    const part = `${unit.id}:${fitting.bayId}:pullout`;
    const xc = (plan.x0Mm + plan.x1Mm) / 2;
    const zc = -(20 + plan.lengthMm / 2);
    if (plan.rod) {
      out.push({ material: 'metal', node: 'pullout', inside: true, part, bayId: fitting.bayId, position: at(xc, plan.atMm, zc), scale: size(25, 25, plan.lengthMm) });
      out.push({ material: 'metal', node: 'pullout', inside: true, bayId: fitting.bayId, position: at(xc, plan.atMm + 30, zc), scale: size(30, 20, plan.lengthMm) });
    } else {
      const w = plan.x1Mm - plan.x0Mm - 40;
      out.push({ material: 'metal', node: 'pullout', inside: true, part, bayId: fitting.bayId, position: at(xc, plan.atMm, zc), scale: size(w, MECH.wireMm, plan.lengthMm) });
      out.push({ material: 'metal', node: 'pullout', inside: true, part, bayId: fitting.bayId, position: at(xc, plan.atMm + 40, -20), scale: size(w, 80, MECH.wireMm) });
    }
  }

  /* Пантограф отсека: штанга с тягами едет вниз и вперёд; кронштейны на боковинах стоят. */
  for (const fitting of unit.fittings) {
    if (fitting.slot !== 'pantograph' || !fitting.bayId) continue;
    if (!installedItem(unit, 'pantograph', hardware, fitting.bayId)) continue;
    const plan = pantographPlan(unit, place, production, fitting.bayId);
    if (!plan) continue;
    const part = `${unit.id}:${fitting.bayId}:pantograph`;
    const len = plan.x1Mm - plan.x0Mm - 50;
    const xc = (plan.x0Mm + plan.x1Mm) / 2;
    out.push({ material: 'metal', node: 'pantograph', inside: true, part, bayId: fitting.bayId, position: at(xc, plan.rodAtMm, plan.rodZMm), scale: size(len, 25, 25) });
    for (const x of [plan.x0Mm + 12, plan.x1Mm - 12]) {
      out.push({
        material: 'metal',
        node: 'pantograph',
        inside: true,
        part,
        bayId: fitting.bayId,
        position: at(x, plan.rodAtMm + MECH.pantographArmMm / 2, plan.rodZMm),
        scale: size(12, MECH.pantographArmMm, 25),
      });
      out.push({
        material: 'metal',
        node: 'pantograph',
        inside: true,
        bayId: fitting.bayId,
        position: at(x, plan.rodAtMm + MECH.pantographArmMm + 30, plan.rodZMm),
        scale: size(20, 60, 80),
      });
    }
  }
  return out;
}

/**
 * СИСТЕМА КУПЕ НА РЯДУ — шины и полотна (HARDWARE-01, VISUAL_APPROXIMATION).
 *
 * Полотен столько, сколько считает смета (`slidingDoorCount`), ширина — та
 * же, что у строки «Двери-купе» (длина ряда / число + нахлёст). Без
 * выбранной системы полотна купе в сцене не рисуются — как до задачи.
 * Материал полотна в продукте не выбирается: картинка берёт фасад ряда.
 */
export function kupeLeaves(run: Run, hardware?: Map<string, HardwareItem>): {
  id: string;
  x0Mm: number;
  x1Mm: number;
  front: boolean;
  slideMm: number;
}[] {
  const id = run.slidingSystemItemId;
  const item = id ? hardware?.get(id) : undefined;
  if (run.doorSystem !== 'sliding' || !item || !item.active || !slidingAccepts(item) || run.modules.length === 0) return [];
  const L = run.lengthMm;
  const n = slidingDoorCount(L);
  const pitch = L / n;
  const half = SLIDING_DOOR.overlapMm / 2;
  return Array.from({ length: n }, (_, i) => ({
    id: `${run.modules[0].id}:kupe:${i}`,
    x0Mm: Math.max(0, i * pitch - half),
    x1Mm: Math.min(L, (i + 1) * pitch + half),
    front: i % 2 === 0,
    /* Переднее полотно едет на соседа справа, последнее и заднее — влево. */
    slideMm: (i % 2 === 0 && i + 1 < n ? 1 : -1) * (pitch - SLIDING_DOOR.overlapMm),
  }));
}

function kupeBoxes(run: Run, options: { hardware?: Map<string, HardwareItem>; frontThicknessMm: number }): PartBox[] {
  const leaves = kupeLeaves(run, options.hardware);
  if (leaves.length === 0) return [];
  const topMm = Math.max(...runPlaces(run).filter((entry) => run.modules.includes(entry.unit)).map((entry) => (entry.y + entry.heightM) * MM));
  const L = run.lengthMm;
  const key = frontKey(frontOf(run.modules[0]));
  const out: PartBox[] = [
    { material: 'metal', node: 'track', position: [mm(L / 2), mm(topMm - MECH.trackTopMm / 2), mm(MECH.trackDepthMm / 2)], scale: [mm(L), mm(MECH.trackTopMm), mm(MECH.trackDepthMm)] },
    { material: 'metal', node: 'track', position: [mm(L / 2), mm(MECH.trackBottomMm / 2), mm(MECH.trackDepthMm / 2)], scale: [mm(L), mm(MECH.trackBottomMm), mm(MECH.trackDepthMm)] },
  ];
  const leafH = topMm - MECH.trackTopMm - MECH.trackBottomMm - 10;
  for (const leaf of leaves) {
    const z = leaf.front ? 50 + MECH.kupeLeafMm / 2 : 20 + MECH.kupeLeafMm / 2;
    out.push({
      material: 'front',
      part: leaf.id,
      frontKey: key,
      panel: 'Дверь-купе',
      position: [mm((leaf.x0Mm + leaf.x1Mm) / 2), mm(MECH.trackBottomMm + 5 + leafH / 2), mm(z)],
      scale: [mm(leaf.x1Mm - leaf.x0Mm), mm(leafH), mm(MECH.kupeLeafMm)],
    });
  }
  return out;
}

/**
 * ЧТО В РЯДУ ЕДЕТ ПО ПРЯМОЙ — пантографы отсеков и полотна купе: ключ и
 * вектор хода, метры. Одна функция на сцену, «Открыть всё» и проверку.
 */
export function sceneSlides(run: Run, hardware?: Map<string, HardwareItem>): { id: string; vectorM: [number, number, number] }[] {
  const out: { id: string; vectorM: [number, number, number] }[] = [];
  if (hardware && hardware.size > 0) {
    for (const entry of runPlaces(run)) {
      for (const fitting of entry.unit.fittings ?? []) {
        if (fitting.slot !== 'pantograph' || !fitting.bayId) continue;
        if (!installedItem(entry.unit, 'pantograph', hardware, fitting.bayId)) continue;
        const plan = pantographPlan(
          entry.unit,
          { x: entry.x, y: entry.y, heightM: entry.heightM, depthM: entry.depthM, zM: entry.zM, thicknessM: shopOf(run.production).carcassMm / MM },
          run.production,
          fitting.bayId,
        );
        if (plan) out.push({ id: `${entry.unit.id}:${fitting.bayId}:pantograph`, vectorM: [0, -mm(plan.dropMm), mm(plan.reachMm)] });
      }
      for (const fitting of entry.unit.fittings ?? []) {
        if (fitting.slot !== 'wardrobe_pullout' || !fitting.bayId) continue;
        const item = installedItem(entry.unit, 'wardrobe_pullout', hardware, fitting.bayId);
        if (!item) continue;
        const plan = pulloutPlan(
          entry.unit,
          { x: entry.x, y: entry.y, heightM: entry.heightM, depthM: entry.depthM, zM: entry.zM, thicknessM: shopOf(run.production).carcassMm / MM },
          run.production,
          fitting.bayId,
          item,
        );
        if (plan) out.push({ id: `${entry.unit.id}:${fitting.bayId}:pullout`, vectorM: [0, 0, mm(plan.travelMm)] });
      }
    }
  }
  for (const leaf of kupeLeaves(run, hardware)) out.push({ id: leaf.id, vectorM: [mm(leaf.slideMm), 0, 0] });
  return out;
}

/**
 * КОРОБ ЯЩИКА ПО КОМПЛЕКТУ (HARDWARE-01) — коробки сцены из того же плана,
 * по которому режется раскрой (`drawerBoxPlan`): боковины, торцы и дно с
 * ИД своих деталей и направляющая — неподвижная половина на корпусе,
 * ходовая на коробе (едет с ящиком). Направляющая без правила цеха по
 * высоте стоит условно — это видно по признаку плана, а не угадано.
 */
function kitBoxes(
  kit: DrawerKit & { state: 'box' },
  place: ModulePlacement,
  part: string,
  carcassKey: string | null,
  bayId?: string,
): PartBox[] {
  const out: PartBox[] = [];
  const { xFromMm, zoneFromMm, boxFrontZMm, key } = kit.place;
  const idOf: Record<string, string> = {
    'side-left': `${key}:box:side:1`,
    'side-right': `${key}:box:side:2`,
    'wall-front': `${key}:box:wall:1`,
    'wall-back': `${key}:box:wall:2`,
    bottom: `${key}:box:bottom`,
  };
  for (const piece of kit.plan.pieces) {
    const position: [number, number, number] = [
      place.x + (xFromMm + (piece.x0 + piece.x1) / 2) / MM,
      place.y + (zoneFromMm + (piece.y0 + piece.y1) / 2) / MM,
      (boxFrontZMm + (piece.z0 + piece.z1) / 2) / MM,
    ];
    const scale: [number, number, number] = [(piece.x1 - piece.x0) / MM, (piece.y1 - piece.y0) / MM, (piece.z1 - piece.z0) / MM];
    if (piece.member) {
      out.push({
        material: 'metal',
        node: 'runner',
        inside: true,
        position,
        scale,
        ...(piece.member === 'drawer' ? { part } : {}),
        ...(bayId ? { bayId } : {}),
      });
      continue;
    }
    out.push({
      material: 'carcass',
      inside: true,
      part,
      carcassKey,
      panel: piece.key.startsWith('side') ? DRAWER_SIDE_PANEL_NAME : piece.key === 'bottom' ? DRAWER_BOTTOM_PANEL_NAME : DRAWER_WALL_PANEL_NAME,
      partId: idOf[piece.key],
      position,
      scale,
      ...(bayId ? { bayId } : {}),
    });
  }
  return out;
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
  panels: { number: string; name: string; moduleId: string; partIds?: string[] }[],
  /** Школа цеха: у отсеков от неё зависят полки и перегородки (R01). */
  production?: ProductionSettings,
): PanelPlace[] {
  const boxes = carcassBoxes(unit, place, production);

  return panels
    .filter((panel) => panel.moduleId === unit.id)
    .map((panel) => ({
      number: panel.number,
      name: panel.name,
      /*
       * У строки с ИД деталей (отсеки) — ровно её коробки: полки отсека 1 и
       * отсека 2 называются одинаково, а места у них разные.
       */
      boxes: panel.partIds
        ? boxes.filter((box) => box.partId !== undefined && panel.partIds!.includes(box.partId))
        : boxes.filter((box) => box.panel === panel.name && box.partId === undefined),
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
    /* Ящики отсеков (R02A) — и в зонах отсеков (R02B): каждый своим ключом, тем же, что несут его коробки. */
    if (unit.fill?.bays?.some((bay) => bayDrawerStackOf(bay))) {
      for (const bay of bayLayout(unit, bayEnvelope(unit, run))?.bays ?? []) {
        for (const drawer of bay.drawerStack?.drawers ?? []) ids.push(drawer.id);
      }
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
    /* Витрина в раме (V3D-02): дверь из стекла — тот же ключ, что у её коробок. */
    if (unit.section === 'glass_display') {
      ids.push(`${unit.id}:door:0`);
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
