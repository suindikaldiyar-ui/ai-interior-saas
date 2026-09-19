import { moduleCarcassHeightMm, moduleDepthMm } from './fill';
import { millingLink, type MillingItem } from './milling';
import { BUILT_IN_FRIDGE_FRONTS } from './modules';
import { hasBottom } from './moduleVariants';
import { facadeSpans, hasFacade } from './applianceFront';
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
): Panel[] {
  // Доборная планка — это одна деталь, а не корпус.
  const heightMm = moduleCarcassHeightMm(unit, run);
  const depthMm = moduleDepthMm(unit, run.zone, run.production);
  const t = production.carcassMm;
  const allow = production.allowances ?? DEFAULT_ALLOWANCES;
  const inner = unit.widthMm - 2 * t;
  const thick = edgeType(production);

  const label = unit.label || unit.kind;
  const material = `ЛДСП ${t}`;
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

  push({
    name: SIDE_PANEL_NAME,
    material,
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
      name: 'Дно',
      material,
      lengthMm: inner,
      widthMm: depthMm,
      qty: 1,
      edges: { long: 1, short: 0 },
      edgeType: thick,
      grain: 'across',
    });
  }

  push({
    name: unit.kind === 'base' || unit.kind === 'corner_base' ? 'Планки верхние' : 'Крыша',
    material,
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
      name: 'Перегородка вертикальная',
      material,
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
    name: 'Задняя стенка',
    material: `ХДФ ${production.backMm}`,
    lengthMm: heightMm - backInset,
    widthMm: unit.widthMm - backInset,
    qty: 1,
    edges: { long: 0, short: 0 },
    edgeType: '0.4',
    grain: 'none',
  });

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
    const drawers = unit.fill?.drawerHeights ?? [];
    if (drawers.length > 0) {
      for (const front of drawers) {
        pushFront('Фронт ящика', front - gap, unit.widthMm - gap, 1);
      }
      return panels;
    }

    for (const span of facadeSpans(unit, heightMm)) {
      pushFront(FACADE_PANEL_NAME, span.heightMm - gap, unit.widthMm - gap, 1);
    }
    return panels;
  }

  if (unit.frontType === 'door' && unit.doorCount > 0) {
    const doorWidth = Math.round((unit.widthMm - gap * (unit.doorCount + 1)) / unit.doorCount);
    // У фасада видны все четыре торца — если кромка на нём вообще есть.
    pushFront(FACADE_PANEL_NAME, heightMm - gap, doorWidth, unit.doorCount);
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
export function buildPanels({ run, production = DEFAULT_PRODUCTION, milling }: PanelInput): Panel[] {
  const modules = [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)];

  /*
   * Номер модуля считается ОДИН раз на ряд той же функцией, что рисует
   * кружок на чертеже. Своя нумерация здесь означала бы, что деталь
   * «3.2» лежит у модуля, который на чертеже подписан четвёркой.
   */
  const numbers = moduleNumbers(run);

  return modules.flatMap((unit) => {
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

    return modulePanels(unit, run, production, number, milling);
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
