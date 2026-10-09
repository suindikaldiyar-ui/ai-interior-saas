import { moduleCarcassHeightMm, moduleDepthMm } from './fill';
import { carcassHeightMm, shopOf } from './shop';
import { millingLink, type MillingItem } from './milling';
import { carcassMaterialName, type CarcassItem } from './carcassMaterial';
import { BUILT_IN_FRIDGE_FRONTS } from './modules';
import { hasBottom } from './moduleVariants';
import { hasFacade, moduleFronts } from './applianceFront';
import {
  FRAME_WIDTH_MM,
  frontMaterialName,
  frontOf,
  hasEdgeBanding,
  isFramed,
} from './frontMaterial';
import {
  DEFAULT_ALLOWANCES,
  DEFAULT_PRODUCTION,
  type ProductionSettings,
} from '@/types/catalog';
import { moduleNumbers } from './positions';
import { blindPartMm, cornerFillersOf, openFrontMm } from './corner';
import { tailFillersOf } from './countertop';
import type { Module, Panel, PanelTotals, Run } from '@/types/millwork';

/**
 * ДЕТАЛИРОВКА — карта деталей для цеха.
 *
 * Самое дорогое в мебельной компании — не рисунок, а час технолога. На
 * каждый заказ уходит час-два: расписать детали, посчитать раскрой,
 * отметить кромку. Платформа отдаёт это готовым — и вот это, а не картинка,
 * оправдывает её цену.
 *
 * Числа берутся из настроек компании (`ProductionSettings`): толщины и
 * зазоры у всех разные, и захардкоженные значения сделали бы детализировку
 * неверной для половины клиентов. Схема сборки — вкладное дно и крыша
 * между боковинами.
 */

/*
 * ПРИПУСКИ ПРИШЛИ ИЗ НАСТРОЕК ЦЕХА.
 *
 * Здесь стояли три числа: полка уже проёма на 2 мм, полка мельче
 * глубины на 20, задняя стенка вкладная минус 8. У каждого цеха они
 * свои — мебельщик называет их первыми, когда смотрит чужой раскрой, —
 * и захардкоженные они делают детализировку неверной для половины
 * клиентов. Теперь они в `ProductionSettings.allowances`, рядом с
 * толщинами и зазором фасада, которые тоже припуски.
 */

export type PanelInput = {
  run: Run;
  production?: ProductionSettings;
  /**
   * Фрезеровки организации. Пусто — раскрой ровно такой, каким был до
   * каталога: ни один сохранённый лист от появления параметра не едет.
   */
  milling?: Map<string, MillingItem>;
  /**
   * МАТЕРИАЛЫ КОРПУСА ОРГАНИЗАЦИИ.
   *
   * Нужны, чтобы назвать декор в деталировке: «ЛДСП 16 · Графит» вместо
   * «ЛДСП 16». Размеров и количеств каталог не трогает — он задаёт
   * НАЗВАНИЕ и цену, а не второй раскрой.
   */
  carcass?: Map<string, CarcassItem>;
};

/**
 * ИМЕНА ДЕТАЛЕЙ — ОДНА ТАБЛИЦА НА ПРОДУКТ.
 *
 * По имени деталь находит вид, который её рисует: разрез ищет полку,
 * выноска — фасад и боковину. Строка, набранная в двух местах, молча
 * разъезжается, и вид перестаёт находить деталь — ровно та связь
 * подписью, от которой уводит номер.
 */
export const SIDE_PANEL_NAME = 'Боковина';
/** Имя детали-полки в раскрое. По нему полки уходят в свою статью сметы. */
export const SHELF_PANEL_NAME = 'Полка';
export const FACADE_PANEL_NAME = 'Фасад';
export const BOTTOM_PANEL_NAME = 'Дно';
/** Крыша верхнего модуля и пенала — сплошная. */
export const TOP_PANEL_NAME = 'Крыша';
/** У нижнего модуля крыши нет: её заменяют две планки под столешницей. */
export const TOP_RAIL_PANEL_NAME = 'Планки верхние';
export const BACK_PANEL_NAME = 'Задняя стенка';
export const DIVIDER_PANEL_NAME = 'Перегородка вертикальная';
export const DRAWER_FRONT_PANEL_NAME = 'Фронт ящика';
/**
 * ФАЛЬШ-ПАНЕЛЬ УГЛА — ДЕТАЛЬ, А НЕ ВЫЧЕТ ИЗ ДЛИНЫ.
 *
 * Сто миллиметров вычитались из полезной длины соседней стены с первого
 * захода — и на этом всё: в раскрое детали не было, в сцене полосы не
 * было, в смете денег не было. Между рядами оставалась дыра, и угловая
 * кухня выглядела двумя приставленными рядами.
 *
 * Панель режут из ФАСАДНОГО материала: она стоит в плоскости фасадов
 * соседнего ряда и обязана быть с ними одного цвета.
 */
export const CORNER_FILLER_PANEL_NAME = 'Фальш-панель угла';
/** Фальш-панель верхнего ряда у слепого верхнего угла (слой 55). */
export const CORNER_UPPER_FILLER_PANEL_NAME = 'Фальш-панель угла верхняя';
/**
 * ДОБОР ХВОСТА У СТЕНЫ (слой 55): у ряда угловой кухни хвост меньше
 * 150 мм под плитой закрывает планка — щели у стены под столешницей нет.
 */
export const TAIL_FILLER_PANEL_NAME = 'Доборная планка у стены';

/**
 * ДЕТАЛЬ НОГИ Г-ОБРАЗНОГО МОДУЛЯ: «Дно (нога А)».
 *
 * У Г-модуля корпус в две ноги, и детали одного назначения разного
 * размера: дно ноги А вдоль своей стены, дно ноги Б вдоль соседней.
 * Имя одно на раскрой и на сцену — по нему деталировка находит место.
 */
export function legName(name: string, leg: 'А' | 'Б'): string {
  return `${name} (нога ${leg})`;
}

/**
 * КАКИЕ ТОРЦЫ ДЕТАЛИ ОКЛЕЕНЫ — ОДИН ОТВЕТ НА ПРОДУКТ.
 *
 * В раскрое лежит ЧИСЛО торцов (`edges.long`, `edges.short`), а не их
 * имена: цеху хватает «кромка Д1» — он знает, что у боковины видимый
 * торец один и это передний. Виду детали этого мало: чтобы нарисовать
 * кромку, надо знать, КАКАЯ сторона оклеена.
 *
 * Правило то же, что записано в раскрое словами: клеится СНАЧАЛА
 * видимое. У длинных торцов видимый — передний, у коротких — верхний.
 * Вторая кромка ложится на противоположный.
 *
 * Это не новая величина: числа остаются теми же, здесь только их
 * раскладка по сторонам. Второй раз кромку никто не считает.
 */
export type EdgeSide = 'front' | 'back' | 'top' | 'bottom';

export function edgeSides(panel: Pick<Panel, 'edges'>): EdgeSide[] {
  const out: EdgeSide[] = [];
  const long: EdgeSide[] = ['front', 'back'];
  const short: EdgeSide[] = ['top', 'bottom'];

  for (let i = 0; i < Math.min(panel.edges.long, long.length); i += 1) out.push(long[i]);
  for (let i = 0; i < Math.min(panel.edges.short, short.length); i += 1) out.push(short[i]);

  return out;
}

/** Кромка: видимые торцы толстой, скрытые — тонкой. */
function edgeType(production: ProductionSettings): Panel['edgeType'] {
  return production.visibleEdgeMm === 1 ? '1' : '2';
}

/**
 * Детали одного модуля.
 *
 * Порядок деталей фиксирован: боковины, дно, крыша, полки, задняя стенка,
 * фасады. Технолог читает список сверху вниз, и порядок не должен плавать
 * от пересчёта к пересчёту.
 */
function modulePanels(
  unit: Module,
  run: Run,
  production: ProductionSettings,
  moduleNumber: number,
  milling?: Map<string, MillingItem>,
  carcass?: Map<string, CarcassItem>,
): Panel[] {
  // Доборная планка — это одна деталь, а не корпус.
  const heightMm = moduleCarcassHeightMm(unit, run);
  const depthMm = moduleDepthMm(unit, run.zone, run.production);
  const t = production.carcassMm;
  const allow = production.allowances ?? DEFAULT_ALLOWANCES;
  const inner = unit.widthMm - 2 * t;
  const thick = edgeType(production);

  const label = unit.label || unit.kind;
  /*
   * НАЗВАНИЕ МАТЕРИАЛА КОРПУСА — С ДЕКОРОМ, ЕСЛИ ОН ВЫБРАН.
   *
   * Толщина остаётся тем, что режут, декор добавляется к ней. Размеры и
   * количества деталей каталог не трогает: он задаёт НАЗВАНИЕ и цену, а
   * не второй раскрой.
   */
  const material = carcassMaterialName(`ЛДСП ${t}`, unit, run, carcass ?? new Map());
  const panels: Panel[] = [];

  /*
   * НОМЕР ДЕТАЛИ РОЖДАЕТСЯ ЗДЕСЬ — там же, где сама деталь.
   *
   * `<номер модуля>.<номер детали в модуле>`: первая половина уже стоит
   * на чертеже в кружке (`moduleNumbers`), вторая — порядок деталей
   * ВНУТРИ модуля, который задан этой функцией и от других модулей не
   * зависит вовсе. Поэтому добавленный или удалённый сосед не сдвигает
   * номера чужих деталей, а пересчёт того же состава даёт те же номера.
   *
   * Второй формулы номера в продукте нет: чертёж, разрез, детализировка,
   * раскрой и CSV читают это поле.
   */
  const push = (panel: Omit<Panel, 'moduleId' | 'moduleLabel' | 'number'>) =>
    panels.push({
      moduleId: unit.id,
      moduleLabel: label,
      number: `${moduleNumber}.${panels.length + 1}`,
      ...panel,
    });

  if (unit.kind === 'filler') {
    push({
      name: 'Доборная планка',
      material,
      thicknessMm: t,
      lengthMm: heightMm,
      widthMm: unit.widthMm,
      qty: 1,
      edges: { long: 1, short: 0 },
      edgeType: thick,
      grain: 'along',
    });
    return panels;
  }

  // Ниша под технику: корпуса нет, есть только боковины соседей.
  const isAppliance = Boolean(unit.appliance);

  /*
   * Г-ОБРАЗНЫЙ УГЛОВОЙ МОДУЛЬ — КОРПУС В ДВЕ НОГИ (слой 55).
   *
   * Нога А вдоль своей стены (сторона S, глубина ряда), нога Б вдоль
   * соседней — от фасада А до боковины Б (S − глубина). Схема сборки та
   * же, что у всего ряда: вкладное дно и верх между боковинами, задняя
   * стенка в паз. До этого слоя в раскрое лежал прямоугольник S ×
   * глубина, а вторая нога была фальш-панелью — плоской деталью фасада.
   */
  const lCorner = unit.kind === 'corner_base' || unit.kind === 'corner_upper';
  const legB = Math.max(0, unit.widthMm - depthMm);
  if (lCorner) {
    const legInner = Math.max(0, legB - t);
    const topName = unit.kind === 'corner_base' ? TOP_RAIL_PANEL_NAME : TOP_PANEL_NAME;
    const backInsetL = production.backMount === 'inset' ? allow.backInsetMm : 0;
    const carcassPart = (name: string, lengthMm: number, widthMm: number, qty: number) =>
      push({
        name,
        material,
        thicknessMm: t,
        lengthMm,
        widthMm,
        qty,
        edges: { long: 1, short: 0 },
        edgeType: thick,
        grain: name === SIDE_PANEL_NAME ? 'along' : 'across',
      });

    carcassPart(SIDE_PANEL_NAME, heightMm, depthMm, 2);
    carcassPart(legName(BOTTOM_PANEL_NAME, 'А'), unit.widthMm - t, depthMm, 1);
    carcassPart(legName(BOTTOM_PANEL_NAME, 'Б'), legInner, depthMm, 1);
    carcassPart(legName(topName, 'А'), unit.widthMm - t, depthMm, 1);
    carcassPart(legName(topName, 'Б'), legInner, depthMm, 1);

    const count = unit.fill?.shelves.length ?? 0;
    if (count > 0) {
      carcassPart(SHELF_PANEL_NAME, unit.widthMm - t - allow.shelfSideMm, depthMm - allow.shelfDepthMm, count);
      carcassPart(SHELF_PANEL_NAME, legInner - allow.shelfSideMm, depthMm - allow.shelfDepthMm, count);
    }

    for (const [leg, widthMm] of [
      ['А', unit.widthMm - backInsetL],
      ['Б', unit.widthMm - backInsetL - production.backMm],
    ] as const) {
      push({
        name: legName(BACK_PANEL_NAME, leg),
        material: `ХДФ ${production.backMm}`,
        thicknessMm: production.backMm,
        lengthMm: heightMm - backInsetL,
        widthMm,
        qty: 1,
        edges: { long: 0, short: 0 },
        edgeType: '0.4',
        grain: 'none',
      });
    }
  }

  if (!lCorner) {
  push({
    name: SIDE_PANEL_NAME,
    material,
    thicknessMm: t,
    lengthMm: heightMm,
    widthMm: depthMm,
    qty: 2,
    // Видимый торец у боковины один — передний.
    edges: { long: 1, short: 0 },
    edgeType: thick,
    grain: 'along',
  });

  /*
   * У модуля под мойку дна нет: там сифон. Деталь не должна попасть
   * в раскрой — цех распилит лист и выбросит его.
   */
  if (hasBottom(unit)) {
    push({
      name: BOTTOM_PANEL_NAME,
      material,
      thicknessMm: t,
      lengthMm: inner,
      widthMm: depthMm,
      qty: 1,
      edges: { long: 1, short: 0 },
      edgeType: thick,
      grain: 'across',
    });
  }

  push({
    name:
      unit.kind === 'base' || unit.kind === 'corner_base'
        ? TOP_RAIL_PANEL_NAME
        : TOP_PANEL_NAME,
    material,
    thicknessMm: t,
    lengthMm: inner,
    widthMm: depthMm,
    qty: 1,
    edges: { long: 1, short: 0 },
    edgeType: thick,
    grain: 'across',
  });

  const shelves = unit.fill?.shelves.length ?? 0;
  if (shelves > 0) {
    push({
      name: SHELF_PANEL_NAME,
      material,
      thicknessMm: t,
      lengthMm: inner - allow.shelfSideMm,
      widthMm: depthMm - allow.shelfDepthMm,
      qty: shelves,
      edges: { long: 1, short: 0 },
      edgeType: thick,
      grain: 'across',
    });
  }

  if (unit.fill?.dividerMm) {
    push({
      name: DIVIDER_PANEL_NAME,
      material,
      thicknessMm: t,
      lengthMm: heightMm - 2 * t,
      widthMm: depthMm - allow.dividerDepthMm,
      qty: 1,
      edges: { long: 1, short: 0 },
      edgeType: thick,
      grain: 'along',
    });
  }

  // Задняя стенка: вкладная садится в паз, накладная кроется по габариту.
  const backInset = production.backMount === 'inset' ? allow.backInsetMm : 0;
  push({
    name: BACK_PANEL_NAME,
    material: `ХДФ ${production.backMm}`,
    thicknessMm: production.backMm,
    lengthMm: heightMm - backInset,
    widthMm: unit.widthMm - backInset,
    qty: 1,
    edges: { long: 0, short: 0 },
    edgeType: '0.4',
    grain: 'none',
  });
  }

  const gap = production.frontGapMm;

  /*
   * ДЕТАЛИ ОДНОГО ФАСАДА — ОДНО МЕСТО НА ВСЕ ТРИ СЛУЧАЯ.
   *
   * Створка, фронт ящика и фасад встройки отличаются только размером, а
   * правила материала у них общие:
   *
   *   эмаль и плёнка — БЕЗ КРОМКИ. Эмаль ложится сплошным слоем, плёнка
   *     запрессовывается с загибом на торцы: клеить на них ПВХ некуда.
   *     Смета считает из раскроя, поэтому исчезнувшая строка забирает с
   *     собой и метры, и деньги — второй раз нигде править не нужно.
   *
   *   филёнчатый — ДВЕ ДЕТАЛИ. Рама и вставка режутся отдельно и из
   *     разного. Одна панель означала бы, что цех сделает гладкий фасад,
   *     а узнает об этом на сборке.
   */
  const spec = frontOf(unit);
  const edged = hasEdgeBanding(spec);

  /*
   * ФРЕЗЕРОВКА НАЗВАНА В МАТЕРИАЛЕ ДЕТАЛИ.
   *
   * Лист раскроя уходит в цех, и по нему фрезеруют. «Фасад Эмаль 16» и
   * «Фасад Эмаль 16, фрезеровка Модерн» — это разные операции и разные
   * деньги; молчание здесь означает фасад, который приедет ровным.
   *
   * Название берётся из ТОЙ ЖЕ позиции каталога, что считает смета:
   * второго имени фрезеровки в продукте нет.
   */
  const millingName = (() => {
    if (!milling) return null;
    const link = millingLink(unit, run, milling);
    return link.state === 'resolved' || link.state === 'priceless' ? link.item.name : null;
  })();

  const frontMaterial = millingName
    ? `${frontMaterialName(spec, production.frontMm)}, фрезеровка ${millingName}`
    : frontMaterialName(spec, production.frontMm);

  const pushFront = (
    name: string,
    lengthMm: number,
    widthMm: number,
    qty: number,
  ) => {
    const edges = edged ? { long: 2, short: 2 } : { long: 0, short: 0 };

    if (!isFramed(spec)) {
      push({
        name,
        material: frontMaterial,
        thicknessMm: production.frontMm,
        lengthMm,
        widthMm,
        qty,
        edges,
        edgeType: thick,
        grain: 'along',
      });
      return;
    }

    push({
      name: `${name}: рама`,
      material: frontMaterial,
      thicknessMm: production.frontMm,
      lengthMm,
      widthMm,
      qty,
      edges,
      edgeType: thick,
      grain: 'along',
    });
    push({
      name: `${name}: вставка`,
      material: frontMaterial,
      thicknessMm: production.frontMm,
      // Вставка садится в паз обвязки: минус рама с двух сторон.
      lengthMm: Math.max(0, lengthMm - 2 * FRAME_WIDTH_MM),
      widthMm: Math.max(0, widthMm - 2 * FRAME_WIDTH_MM),
      qty,
      // Вставка целиком внутри рамы: видимых торцов у неё нет.
      edges: { long: 0, short: 0 },
      edgeType: thick,
      grain: 'along',
    });
  };

  /*
   * Г-ОБРАЗНЫЙ: ДВА ФАСАДА, ОТКРЫВАЮТСЯ ВМЕСТЕ (слой 55).
   *
   * Фасад А — в плоскости своего ряда, до плоскости корпуса соседа
   * (S − глубина); фасад Б — в плоскости фасадов соседа, от лица фасада А
   * до боковины Б (S − глубина − толщина фасада). Зазор — как у всех.
   */
  if (lCorner) {
    pushFront(legName(FACADE_PANEL_NAME, 'А'), heightMm - gap, legB - gap, 1);
    pushFront(legName(FACADE_PANEL_NAME, 'Б'), heightMm - gap, legB - production.frontMm - gap, 1);
    return panels;
  }

  /*
   * Встроенный холодильник закрыт фасадом заподлицо: две створки во всю
   * высоту пенала. Без этих деталей раскрой уедет — фасад есть в смете,
   * а в цех уходит лист без него.
   */
  if (unit.builtIn && hasFacade(unit)) {
    const doorHeight = Math.round((heightMm - gap * (BUILT_IN_FRIDGE_FRONTS + 1)) / BUILT_IN_FRIDGE_FRONTS);
    pushFront('Фасад встройки', doorHeight, unit.widthMm - gap, BUILT_IN_FRIDGE_FRONTS);
    return panels;
  }

  /*
   * ПРИБОРНЫЙ МОДУЛЬ ТОЖЕ ЗАКРЫТ ФАСАДОМ.
   *
   * Раньше здесь стоял безусловный выход: модуль с техникой не получал ни
   * одной фасадной детали. Из-за этого под мойкой не было створки, под
   * варочной — ящиков, у колонны — фасадов над нишей и под ней. Цех не
   * видел их в раскрое, смета не брала за них денег, а материал к ним не
   * применялся вовсе: нажимаешь «шпон» — половина ряда остаётся серой.
   *
   * Участки считает `facadeSpans` — по тем же нишам, что `columnNiches`.
   * Второй формулой их считать нельзя: разойдясь, раскрой начнёт пилить
   * фасад поверх духовки.
   */
  if (isAppliance) {
    /*
     * ФРОНТЫ ПОД ПРИБОРОМ РАСКЛАДЫВАЮТСЯ ТАК ЖЕ, КАК У ОБЫЧНОГО МОДУЛЯ.
     *
     * Под варочной панелью стоят ящики: чертёж рисовал два фронта и
     * промпт называл два, а сюда уходила ОДНА глухая панель на всю
     * высоту — цех собрал бы не ту мебель. Высоты берутся из `fill`,
     * того же, что читают чертёж и 3D; второй расклад развёл бы их.
     */
    /*
     * ЧТО РЕЖЕТСЯ — ТО ЖЕ, ЧТО ВИСИТ.
     *
     * Здесь стояли свои ветки по фронтам и участкам. Спрашиваем один
     * ответ: у вытяжки створки нет вовсе, и лист под неё больше не
     * пилится, а у мойки она есть — и режется, и оплачивается петлями.
     */
    const fronts = moduleFronts(unit, heightMm);

    for (const front of fronts.drawers) {
      pushFront('Фронт ящика', front - gap, unit.widthMm - gap, 1);
    }
    for (const leaf of fronts.leaves) {
      pushFront(FACADE_PANEL_NAME, leaf.heightMm - gap, unit.widthMm - gap, 1);
    }
    return panels;
  }

  if (unit.frontType === 'door' && unit.doorCount > 0) {
    /*
     * СЛЕПОЙ УГОЛ (слой 55): за глухой частью модуля стоит корпус соседа,
     * и створка там упёрлась бы в фальш-панель. Режется одна створка на
     * доступную часть (`openFrontMm`) — та же ширина, что в сцене; если
     * доступной части меньше корпуса, створки нет вовсе.
     */
    const blind = blindPartMm(unit, run) > 0;
    const openMm = blind ? openFrontMm(unit, run) : unit.widthMm;
    const doors = blind ? 1 : unit.doorCount;
    if (openMm > 0) {
      const doorWidth = Math.round((openMm - gap * (doors + 1)) / doors);
      // У фасада видны все четыре торца — если кромка на нём вообще есть.
      pushFront(FACADE_PANEL_NAME, heightMm - gap, doorWidth, doors);
    }
  }

  if (unit.frontType === 'drawers') {
    const heights = unit.fill?.drawerHeights ?? [];
    for (const front of heights) {
      pushFront('Фронт ящика', front - gap, unit.widthMm - gap, 1);
    }
  }

  return panels;
}

/** Все детали ряда, сгруппированные по модулям слева направо. */
export function buildPanels({ run, production = DEFAULT_PRODUCTION, milling, carcass }: PanelInput): Panel[] {
  const modules = [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)];

  /*
   * Номер модуля считается ОДИН раз на ряд той же функцией, что рисует
   * кружок на чертеже. Своя нумерация здесь означала бы, что деталь
   * «3.2» лежит у модуля, который на чертеже подписан четвёркой.
   */
  const numbers = moduleNumbers(run);

  const fromModules = modules.flatMap((unit) => {
    const number = numbers.get(unit.id);

    /*
     * Модуль без номера — это разошедшиеся список деталей и нумерация,
     * а не повод подставить ноль: по детали с выдуманным номером цех
     * распилит плиту.
     */
    if (number === undefined) {
      throw new Error(
        `Модуль ${unit.id} есть в списке деталей и отсутствует в нумерации модулей: ` +
          'номер детали выводить не из чего.',
      );
    }

    return modulePanels(unit, run, production, number, milling, carcass);
  });

  /*
   * ДЕТАЛЬ УГЛА ИДЁТ ПОСЛЕ МОДУЛЕЙ И СВОИМ НОМЕРОМ.
   *
   * Модулем она быть не может: модули складываются в длину ряда
   * (`runWidthSum`), стоят в отпечатке и несут столешницу, а панель
   * живёт в полосе, которую ряд уже отдал углу. Номер «У.1» — угол,
   * первая деталь: он не сталкивается с номерами модулей (те числовые)
   * и читается в цеху без пояснения.
   */
  const shop = shopOf(production);
  const extra: Panel[] = [];

  /*
   * ФАЛЬШ-ПАНЕЛИ УГЛА — нижняя и верхняя, место и ширина из
   * `cornerFillersOf` (слой 55): та же функция ставит их в сцену.
   */
  let cornerNo = 0;
  for (const piece of cornerFillersOf(run)) {
    const lower = piece.level === 'lower';
    const neighbour = lower
      ? run.modules[0]
      : [...run.upperSegments.flatMap((sg) => sg.modules)]
          .filter((unit) => unit.section !== 'mezzanine')
          .sort((a, b) => a.offsetMm - b.offsetMm)[0];
    if (!neighbour) continue;
    const spec = frontOf(neighbour);
    cornerNo += 1;
    extra.push({
      moduleId: `${run.id}:corner`,
      moduleLabel: 'Угол',
      number: `У.${cornerNo}`,
      name: lower ? CORNER_FILLER_PANEL_NAME : CORNER_UPPER_FILLER_PANEL_NAME,
      material: `Фасад ${shop.frontMm}`,
      thicknessMm: shop.frontMm,
      /*
       * Высота — корпуса своего ряда: нижняя закрывает его от пола до
       * столешницы, верхняя — высоту навесного. Зазор снимается с обеих
       * сторон, как у фасада: она стоит в одной с ними плоскости.
       */
      lengthMm:
        (lower ? carcassHeightMm(production) : moduleCarcassHeightMm(neighbour, run)) -
        production.frontGapMm,
      widthMm: Math.round(piece.toMm - piece.fromMm) - production.frontGapMm,
      qty: 1,
      /*
       * Видно все четыре торца: панель стоит в углу отдельно стоящей
       * полосой. Кромки у эмали и плёнки нет вовсе — то же правило, что
       * у фасада (`hasEdgeBanding`), и считает его та же функция.
       */
      edges: hasEdgeBanding(spec) ? { long: 2, short: 2 } : { long: 0, short: 0 },
      edgeType: edgeType(production),
      grain: 'along',
    });
  }

  /*
   * ДОБОР ХВОСТА У СТЕНЫ (слой 55): планка той же школы, что доборная
   * планка ряда (`filler`), — корпусная плита, кромка по лицевому торцу.
   */
  let tailNo = 0;
  for (const piece of tailFillersOf(run)) {
    tailNo += 1;
    extra.push({
      moduleId: `${run.id}:tail`,
      moduleLabel: 'Хвост у стены',
      number: `Х.${tailNo}`,
      name: TAIL_FILLER_PANEL_NAME,
      material: `ЛДСП ${shop.carcassMm}`,
      thicknessMm: shop.carcassMm,
      lengthMm: carcassHeightMm(production),
      widthMm: Math.round(piece.toMm - piece.fromMm),
      qty: 1,
      edges: { long: 1, short: 0 },
      edgeType: edgeType(production),
      grain: 'along',
    });
  }

  return extra.length > 0 ? [...fromModules, ...extra] : fromModules;
}

/* ─────────────────────────  Раскрой объекта: все стены композиции  ───────────────────────── */

/**
 * СТЕНА ОБЪЕКТА ДЛЯ РАСКРОЯ: физическая стена замера, её подпись на
 * чертеже и ряд — тот, что на экране видят сцена и смета.
 */
export type PanelWall = { wallId: string; label: string; run: Run };

/** Деталь объекта: деталь ряда и её происхождение. */
export interface ObjectPanel extends Panel {
  /** Физическая стена замера, чей ряд режет деталь. */
  wallId: string;
  /** «Стена Б» — как стена подписана на чертеже. */
  wallLabel: string;
  /** Номер детали в своём ряду, как его пишет `buildPanels` («3.2»). */
  rowNumber: string;
  /** Идентификатор детали по объекту: стена и номер в ряду. Не повторяется. */
  partId: string;
  /** Откуда деталь — словами, для цеха: стена и модуль. */
  comment: string;
}

/**
 * ДЕТАЛИ ОБЪЕКТА — ВСЕ СТЕНЫ КОМПОЗИЦИИ, А НЕ ОДНА (P0-5).
 *
 * «Детализировка» и выгрузка получали один ряд — стены А, а чертёжный
 * лист — все стены: в Г и П детали стен Б и В в раскрой не попадали
 * вовсе, цех получал половину заказа. Здесь стены складываются, и каждая
 * режется ТЕМ ЖЕ `buildPanels`: второго расчёта размеров нет.
 *
 * Номер на листе — номер в ряду («3.2»). Ряды нумеруют модули каждый с
 * единицы, как и чертёж каждой стены, поэтому у Г и П номер с буквой
 * стены («Б-3.2»); у прямой — прежний. `partId` — стена и номер в ряду:
 * по нему деталь не спутать и при объединении стен.
 *
 * Стена, переданная дважды, — исключение, а не тихая склейка: это одна
 * физическая стена из `runs` и `wallRuns`, и порезать её дважды значит
 * отправить в цех лишние детали.
 */
export function objectPanels(input: {
  walls: PanelWall[];
  production?: ProductionSettings;
  milling?: Map<string, MillingItem>;
  carcass?: Map<string, CarcassItem>;
}): ObjectPanel[] {
  const { walls, production = DEFAULT_PRODUCTION, milling, carcass } = input;
  const many = walls.length > 1;
  const seen = new Set<string>();
  return walls.flatMap((wall) => {
    if (seen.has(wall.wallId)) {
      throw new Error(`Стена ${wall.wallId} передана в раскрой дважды: одна физическая стена режется один раз.`);
    }
    seen.add(wall.wallId);
    const mark = wall.label.slice(wall.label.indexOf(' ') + 1);
    return buildPanels({ run: wall.run, production, milling, carcass }).map((panel) => ({
      ...panel,
      number: many ? `${mark}-${panel.number}` : panel.number,
      rowNumber: panel.number,
      wallId: wall.wallId,
      wallLabel: wall.label,
      partId: `${wall.wallId}:${panel.number}`,
      comment: `${wall.label} (${wall.wallId}) · ${panel.moduleLabel}`,
    }));
  });
}

/**
 * Номер детали по модулю и названию — для видов, которые рисуют деталь.
 *
 * Разрез подписывает полку, выноска — фасад и боковину. Оба ЧИТАЮТ номер
 * отсюда: посчитай его на месте, и вид разойдётся с раскроем ровно так,
 * как расходилась подпись.
 */
export function panelNumberOf(
  panels: Panel[],
  moduleId: string,
  name: string,
): string | null {
  return panels.find((p) => p.moduleId === moduleId && p.name === name)?.number ?? null;
}

/**
 * Итоги внизу листа: площади и погонные метры кромки.
 *
 * По ним технолог сверяет заказ плиты, а сметчик — площади в смете.
 */
export function panelTotals(panels: Panel[]): PanelTotals {
  let ldspM2 = 0;
  let hdfM2 = 0;
  let frontM2 = 0;
  let edgeThickM = 0;
  let edgeThinM = 0;
  let count = 0;

  for (const panel of panels) {
    const areaM2 = (panel.lengthMm * panel.widthMm * panel.qty) / 1_000_000;
    count += panel.qty;

    if (panel.material.startsWith('ХДФ')) hdfM2 += areaM2;
    else if (panel.material.startsWith('Фасад')) frontM2 += areaM2;
    else ldspM2 += areaM2;

    const perimeterM =
      (panel.edges.long * panel.lengthMm + panel.edges.short * panel.widthMm) / 1000;
    const totalM = perimeterM * panel.qty;

    if (panel.edgeType === '0.4') edgeThinM += totalM;
    else edgeThickM += totalM;
  }

  const round2 = (v: number) => Math.round(v * 100) / 100;

  return {
    count,
    ldspM2: round2(ldspM2),
    hdfM2: round2(hdfM2),
    frontM2: round2(frontM2),
    edgeThickM: round2(edgeThickM),
    edgeThinM: round2(edgeThinM),
  };
}

/** Высота цоколя: он идёт отдельной строкой заказа, а не деталью модуля. */
/*
 * `PLINTH_HEIGHT_MM` ЖИЛА ЗДЕСЬ.
 *
 * Высота цоколя — величина цеха (`plinthMm(run.production)`), и читателей
 * у этого экспорта не осталось. Оставленный, он однажды дал бы кому-то
 * сто миллиметров там, где у цеха сто двадцать.
 */


/* ────────────────  Материалы для сметы — ИЗ ДЕТАЛИРОВКИ  ──────────────── */

/**
 * Сколько чего заказывать — по тем же деталям, что уходят в цех.
 *
 * ЕДИНСТВЕННЫЙ ИСТОЧНИК КОЛИЧЕСТВ. Смета раньше считала площади и кромку
 * своими формулами: корпус как габаритный прямоугольник, кромку — по числу
 * створок. Деталировка тем временем выдавала настоящие детали с настоящими
 * торцами, и две цифры расходились: на шкафе-купе и в прихожей кромки в
 * раскрое было на 13 % больше, чем в смете. Цех клеил, компания не брала
 * за это денег.
 *
 * Разбивка идёт по МАТЕРИАЛУ и ИМЕНИ детали — по тем же полям, что читает
 * технолог в списке на раскрой:
 *
 *   полки        — своя статья, у них своя ставка
 *   ХДФ          — задние стенки
 *   «Фасад …»    — фасады и фронты ящиков, включая фасад встройки
 *   остальное    — корпус ЛДСП
 *
 * Кромка складывается вся: и толстая по видимым торцам, и тонкая по
 * скрытым. Разделять их в смете незачем — статья одна.
 */
export type PanelMaterials = {
  /** Корпус ЛДСП без полок: боковины, дно, крыша, перегородки, доборы. */
  carcassM2: number;
  /** Полки — отдельной статьёй, как и в смете. */
  shelfM2: number;
  backM2: number;
  frontM2: number;
  /** Кромка, погонные метры. */
  edgeM: number;
  /** Деталей всего — по нему сверяется, что список тот же. */
  count: number;
};

export function panelMaterials(panels: Panel[]): PanelMaterials {
  let carcassM2 = 0;
  let shelfM2 = 0;
  let backM2 = 0;
  let frontM2 = 0;
  let edgeM = 0;
  let count = 0;

  for (const panel of panels) {
    const areaM2 = (panel.lengthMm * panel.widthMm * panel.qty) / 1_000_000;
    count += panel.qty;

    if (panel.material.startsWith('ХДФ')) backM2 += areaM2;
    else if (panel.material.startsWith('Фасад')) frontM2 += areaM2;
    else if (panel.name === SHELF_PANEL_NAME) shelfM2 += areaM2;
    else carcassM2 += areaM2;

    edgeM +=
      ((panel.edges.long * panel.lengthMm + panel.edges.short * panel.widthMm) / 1000) *
      panel.qty;
  }

  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    carcassM2: r2(carcassM2),
    shelfM2: r2(shelfM2),
    backM2: r2(backM2),
    frontM2: r2(frontM2),
    edgeM: r2(edgeM),
    count,
  };
}

/** Итог стены в деталировке: модули, детали, площади по листам, фасады. */
export type WallPanelSummary = {
  wallId: string;
  label: string;
  lengthMm: number;
  /** Модулей в ряду стены. */
  modules: number;
  /** Модулей, у которых есть детали в раскрое. */
  cutModules: number;
  /** Деталей, штук — с количеством. */
  parts: number;
  materials: PanelMaterials;
  /**
   * Фасадов, штук: створки и фронты ящиков. Рама и вставка филёнки — один
   * фасад, фальш-панель угла — не фасад, хоть и того же листа.
   */
  fronts: number;
};

export function wallPanelSummaries(walls: PanelWall[], parts: ObjectPanel[]): WallPanelSummary[] {
  return walls.map((wall) => {
    const own = parts.filter((part) => part.wallId === wall.wallId);
    const modules = allModulesOf(wall.run);
    const ids = new Set(modules.map((unit) => unit.id));
    return {
      wallId: wall.wallId,
      label: wall.label,
      lengthMm: wall.run.lengthMm,
      modules: modules.length,
      cutModules: new Set(own.filter((part) => ids.has(part.moduleId)).map((part) => part.moduleId)).size,
      parts: own.reduce((sum, part) => sum + part.qty, 0),
      materials: panelMaterials(own),
      fronts: own
        .filter(
          (part) =>
            part.material.startsWith('Фасад') &&
            !part.name.endsWith(': вставка') &&
            part.name !== CORNER_FILLER_PANEL_NAME &&
            part.name !== CORNER_UPPER_FILLER_PANEL_NAME,
        )
        .reduce((sum, part) => sum + part.qty, 0),
    };
  });
}

/** Модули ряда: нижний ряд и висящие — то же, что режет `buildPanels`. */
function allModulesOf(run: Run): Module[] {
  return [...run.modules, ...run.upperSegments.flatMap((segment) => segment.modules)];
}
