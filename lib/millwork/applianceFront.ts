import { BUILT_IN_FRIDGE_FRONTS, moduleAppliances } from './modules';
import { columnNiches, singleNicheOf, OVEN_FROM_FLOOR_MM } from './fill';
import { hasFrontZones, zoneFronts, type ZoneLeaf, type ZoneSpan } from './frontZones';
import { plinthMm, workTopMm } from './shop';
import type { Module } from '@/types/millwork';
import type { ProductionSettings } from '@/types/catalog';

/**
 * ЕСТЬ ЛИ У ПРИБОРНОГО МОДУЛЯ ФАСАД — И ГДЕ ИМЕННО.
 *
 * Модуль с техникой числился «нишей» и не получал НИЧЕГО: ни фасадной
 * детали в раскрое, ни материала. Физически это неверно. Прибор занимает
 * нишу, но у модуля остаётся корпус (он и так считался) и остаётся фасад:
 *
 *   мойка          — под чашей створка, за ней сифон;
 *   варочная       — под панелью ящики;
 *   посудомойка    — полностью встроенная закрыта фасадом заподлицо;
 *   колонна        — фасады НАД нишей и ПОД ней;
 *   вытяжка        — декоративный фасад шкафа;
 *   холодильник    — встроенный закрыт створками во всю высоту.
 *
 * Не имеет фасада ровно одно: ОТДЕЛЬНОСТОЯЩИЙ прибор. Он виден целиком,
 * и рисовать ему створку — значит показать клиенту мебель, которой нет.
 *
 * Правило живёт здесь одним списком: раскрой, чертёж, смета и промпт
 * обязаны отвечать на этот вопрос одинаково.
 */

/**
 * Закрыт ли модуль фасадом.
 *
 * `builtIn === false` — единственный случай, когда фасада нет. У прочих
 * приборов встройка подразумевается: варочную панель врезают в
 * столешницу, мойку — тоже, и створка под ними есть всегда.
 */
export function hasFacade(unit: Module): boolean {
  /*
   * ДОБОРНАЯ ПЛАНКА — САМА ДЕТАЛЬ, ФАСАДА ПЕРЕД НЕЙ НЕТ (задача 4): режется одной планкой. Её тип фасада
   * `door` нёс в сцену дверцу с ручкой и петлями, а в смету — три петли и ручку, которых на объекте нет.
   */
  if (unit.kind === 'filler') return false;
  if (unit.appliance === undefined && unit.column === undefined) return true;
  return unit.builtIn !== false;
}

export type FacadeSpan = {
  /** Низ участка от дна корпуса, мм. */
  fromMm: number;
  /** Высота участка, мм. */
  heightMm: number;
  /** Место створки зоны по ширине: левый край и ширина, мм (две в ширину). Пусто — вся ширина. */
  xMm?: number;
  widthMm?: number;
  /** Сторона петель створки зоны, когда их две в ширину. */
  hinge?: 'left' | 'right';
  /** Дверь витрины зоны: покупная, полотна из плиты нет. */
  glass?: true;
};

/**
 * Участки фасада по высоте модуля.
 *
 * У обычного модуля он один — во всю высоту. У колонны их два: над
 * нишами и под ними, потому что сама ниша фасадом не закрывается — в неё
 * встаёт прибор. Считать эти участки второй формулой нельзя: ниши уже
 * считает `columnNiches`, и разойдясь с ней, раскрой начнёт пилить
 * фасад поверх духовки.
 */
export function facadeSpans(
  unit: Module,
  heightMm: number,
  /*
   * Школа цеха (ЭТАП 4, часть 4): ниши колонны садятся ОТ ПОЛА, а цоколь у
   * цеха свой. Без неё раскрой и створки шли по нишам цоколя 100, а полки и
   * прибор в сцене — по своей школе: при цоколе 150 створка заходила на
   * духовку на 22 мм, над микроволновкой оставалась щель 28 мм.
   */
  production?: ProductionSettings,
): FacadeSpan[] {
  if (!hasFacade(unit)) return [];

  const niches = unit.column
    ? columnNiches(unit, heightMm, production).map((niche) => ({
        fromMm: niche.fromMm,
        heightMm: niche.toMm - niche.fromMm,
      }))
    : nicheOf(unit, heightMm, production);
  if (niches.length === 0) return frontSplitSpans(unit, heightMm, production) ?? [{ fromMm: 0, heightMm }];

  const spans: FacadeSpan[] = [];
  let cursor = 0;

  for (const niche of [...niches].sort((a, b) => a.fromMm - b.fromMm)) {
    if (niche.fromMm > cursor) {
      spans.push({ fromMm: cursor, heightMm: niche.fromMm - cursor });
    }
    cursor = Math.max(cursor, niche.fromMm + niche.heightMm);
  }

  if (cursor < heightMm) spans.push({ fromMm: cursor, heightMm: heightMm - cursor });

  // Огрызок ниже фасадного минимума фасадом не закрывают: его закрывает
  // сам прибор или соседняя деталь.
  return spans.filter((span) => span.heightMm >= MIN_FACADE_SPAN_MM);
}

/**
 * ДЕЛЕНИЕ ФАСАДА ПО ВЫСОТЕ (P1/P2) — участки между швами `frontSplitMm`, снизу вверх, или `null`.
 *
 * У модуля без прибора: ниш нет, и швы ставит человек. Дальше участки идут той же дорогой, что участки над нишей и
 * под ней у пенала (`nicheFacadeSpans` → `moduleFronts` → раскрой, сцена, петли, ручки): второй раскладки нет.
 * Шов вне корпуса не считается вовсе (его не пишет операция `set_front_split`).
 */
export function frontSplitSpans(
  unit: Pick<Module, 'frontSplitMm' | 'appliance' | 'column' | 'seamAtCounter'>,
  heightMm: number,
  production?: ProductionSettings,
): FacadeSpan[] | null {
  const seams = unit.seamAtCounter ? [counterSeamMm(production), ...(unit.frontSplitMm ?? []).slice(1)] : unit.frontSplitMm;
  /* Шкаф под мойку — корпус с участками: фальшфасад над створками делит его тем же швом (задача 2). */
  const appliance = unit.appliance !== undefined && !unit.appliance.startsWith('sink');
  if (!seams || seams.length === 0 || appliance || unit.column) return null;
  const cuts = [0, ...[...seams].filter((s) => s > 0 && s < heightMm).sort((a, b) => a - b), heightMm];
  const spans = cuts.slice(1).map((to, i) => ({ fromMm: cuts[i], heightMm: to - cuts[i] }));
  return spans.length > 1 ? spans : null;
}

/**
 * ПЕРЕГОРОДКИ МЕЖДУ ЗОНАМИ (задача 4), мм от дна корпуса: шов делит корпус на отсеки, и на шве стоит плита. Только у модуля
 * без приборов: у пенала участки разделены опорами ниш (`pencilShelves`), у шкафа под мойку фальшфасад — панель, а не отсек.
 * Одна функция на раскрой и сцену.
 */
export function zoneDividersMm(unit: Module, heightMm: number, production?: ProductionSettings): number[] {
  if (!hasFrontZones(unit) || moduleAppliances(unit).length > 0) return [];
  return facadeSpans(unit, heightMm, production)
    .slice(1)
    .map((span) => span.fromMm);
}

/**
 * ШОВ ПО СТОЛЕШНИЦЕ, мм от дна корпуса (задача 4): верх рабочей поверхности минус цоколь. Одна отметка на границу зон,
 * сцену и раскрой: столешница поднялась — шов поехал за ней, если человек выбрал границу по столешнице.
 */
export function counterSeamMm(production?: ProductionSettings): number {
  return workTopMm(production) - plinthMm(production);
}

/**
 * УЧАСТКИ, ОСВОБОЖДЁННЫЕ НИШАМИ, — ИЛИ `null`.
 *
 * Отвечает на один вопрос: «у этого модуля фасад разбит приборами?».
 * `null` — не разбит: либо ниш нет вовсе, либо прибор занимает модуль
 * целиком. Список — те самые свободные отрезки, которые обязаны стать
 * фасадами: деталь в раскрое, полотно в сцене, петли и ручка в смете.
 *
 * Функция одна на продукт, потому что ответ нужен ТРЁМ: раскрою (он и
 * так считает по `facadeSpans`), сцене и расчёту фурнитуры. Своя проверка
 * «есть ли ниши» в каждом из них — это ровно тот класс ошибки, из-за
 * которого фасады уже лежали в раскрое и не рисовались в сцене: цех
 * получал детали, которых на картинке не было.
 */
export function nicheFacadeSpans(unit: Module, heightMm: number, production?: ProductionSettings): FacadeSpan[] | null {
  const spans = facadeSpans(unit, heightMm, production);
  if (spans.length === 0) return null;
  /*
   * Разбит — значит хотя бы один участок короче модуля. Считать по числу
   * участков нельзя: у колонны, где прибор упёрся в крышу, останется один
   * участок, и он всё равно свободный.
   */
  return spans.some((span) => span.heightMm < heightMm) ? spans : null;
}

/**
 * НИША ПРИБОРА ПЕНАЛА — ТА, ЧТО РАЗБИЛА ЕГО ФАСАД, — ИЛИ `null`.
 *
 * Пенал с одним прибором режется створками над нишей и под ней
 * (`facadeSpans` по `nicheOf`), и прибор рисуется в этой же нише:
 * нарисованный во всю высоту модуля, он вставал за открытыми створками
 * чёрной плитой вместо полок (STAGE A). У колонны ниши свои
 * (`columnNiches`); прибор без фасада занимает модуль целиком — `null`.
 */
export function tallNicheOf(unit: Module, heightMm: number, production?: ProductionSettings): FacadeSpan | null {
  if (unit.column || !hasFacade(unit)) return null;
  return nicheOf(unit, heightMm, production)[0] ?? null;
}

/**
 * ЧТО ФИЗИЧЕСКИ ВИСИТ НА ЭТОМ МОДУЛЕ — ОДИН ОТВЕТ НА ПРОДУКТ.
 *
 * До этого вопрос решался по `frontType`, и решался неверно. `frontType`
 * говорит, ОТКУДА фронт взялся: раскладка поставила створку, ящики или
 * прибор. На вопрос «что на модуле висит» он не отвечает вовсе — у мойки
 * там `appliance`, а створка под чашей есть и в раскрое, и в сцене.
 *
 * Из этого корня вышла целая семья дефектов, и три из них стоили денег:
 *
 *   направляющие под варочной не выписывались   (`frontType === 'drawers'`)
 *   петли и ручки фасадов колонны не выписывались (`frontType !== 'door'`)
 *   петли мойки и посудомойки не выписывались     (то же условие)
 *   ручки ящиков под варочной не выписывались     (`frontType === 'drawers'`)
 *   фасад вытяжки резался, но не рисовался        (разные ветки у раскроя и сцены)
 *
 * Чинить их по одному значило бы завести шестую формулу вместо того,
 * чтобы убрать пятую. Поэтому ответ ОДИН и опирается на ФАКТЫ:
 *
 *   ящики      — `fill.drawerHeights`, высоты фронтов, которые уже режутся
 *   створки    — свободные участки (`nicheFacadeSpans`) либо `doorCount`
 *   ничего     — прибор виден целиком или фронта нет вовсе
 *
 * `frontType` здесь читается ровно в одном месте и ровно как «какой
 * фронт задуман»: `doorCount` уже отвечает нулём там, где фронт не
 * створка. Это законно — незаконно было спрашивать его о фурнитуре.
 */
export type ModuleFronts = {
  /** Полотна: каждый участок закрывается ОДНОЙ створкой. */
  leaves: FacadeSpan[];
  /** Фронты ящиков снизу вверх, миллиметры. */
  drawers: number[];
  /** Глухие панели зон: фасад есть, не открывается, петель и ручки нет (`frontZones`). */
  fixed?: FacadeSpan[];
};

export function moduleFronts(unit: Module, heightMm: number, production?: ProductionSettings): ModuleFronts {
  const empty: ModuleFronts = { leaves: [], drawers: [] };

  /* Отдельностоящий прибор: он виден целиком, полотна перед ним нет. */
  if (!hasFacade(unit)) return empty;

  /*
   * ЗОНЫ ФАСАДА (задачи 2–4): на участках своё наполнение. Участки те же (`facadeSpans`), дорога дальше та же.
   * Ящики зоны — те же фронты в наполнении, поэтому и створки, и ящики здесь могут быть вместе.
   */
  if (hasFrontZones(unit)) {
    const zoned = zoneFronts(unit, facadeSpans(unit, heightMm, production) as ZoneSpan[]);
    return {
      leaves: zoned.leaves.map((leaf: ZoneLeaf) => ({ ...leaf })),
      drawers: zoned.drawers ? [...(unit.fill?.drawerHeights ?? [])] : [],
      fixed: zoned.fixed.map(({ fromMm, heightMm: h }) => ({ fromMm, heightMm: h })),
    };
  }

  /*
   * ФРОНТ У МОДУЛЯ ОДИН: СТВОРКИ ИЛИ ЯЩИКИ (ловушка 359).
   *
   * Ящики есть у того, у кого есть фронты ящиков, — а не у того, чей тип
   * «ящичный»: под варочной панелью тип `appliance`, а ящики там есть, и
   * в раскрое они режутся (ловушка 358).
   */
  const drawers = unit.column ? [] : (unit.fill?.drawerHeights ?? []);
  if (drawers.length > 0) return { leaves: [], drawers: [...drawers] };

  /* Фасад разбит приборами — створка на каждом свободном участке. */
  const spans = nicheFacadeSpans(unit, heightMm, production);
  if (spans) return { leaves: spans, drawers: [] };

  /*
   * ВСТРОЕННЫЙ ХОЛОДИЛЬНИК ЗАКРЫТ ДВУМЯ СТВОРКАМИ ДРУГ НАД ДРУГОМ.
   *
   * Дверь камеры и дверь морозильника — так его и собирают, и так он
   * режется в раскрое (`BUILT_IN_FRIDGE_FRONTS`). Сцена рисовала одно
   * полотно во всю высоту: у неё не было вертикальной раскладки вовсе, и
   * это расхождение жило известным (слой 43). Теперь ответ один, и оно
   * закрыто здесь, а не в трёх местах по-разному.
   */
  if (unit.builtIn) {
    const leafH = heightMm / BUILT_IN_FRIDGE_FRONTS;
    return {
      leaves: Array.from({ length: BUILT_IN_FRIDGE_FRONTS }, (_, i) => ({
        fromMm: leafH * i,
        heightMm: leafH,
      })),
      drawers: [],
    };
  }

  /*
   * ВИТРИНА ЗАКРЫТА СТЕКЛОМ, А НЕ ГЛУХОЙ СТВОРКОЙ — но створка у неё есть:
   * на петлях, с ручкой, как обычная дверца (P1). Чем она сделана — стекло
   * в алюминиевой рамке, рама KIRA или стекло без рамки — решает
   * `vitrineDoorKind`, а не этот список.
   */
  if (hasVisibleWholeAppliance(unit) || unit.column) return empty;

  const doors = doorCountOf(unit);
  if (doors === 0) return empty;

  return {
    leaves: Array.from({ length: doors }, () => ({ fromMm: 0, heightMm })),
    drawers: [],
  };
}

/**
 * МОЖЕТ ЛИ У МОДУЛЯ БЫТЬ РАСПАШНАЯ СТВОРКА — без высоты.
 *
 * Тот же вопрос, что и у `moduleFronts`, только без разбивки по
 * участкам: направление открывания спрашивают и там, где наполнение ещё
 * не посчитано. Модули с нишами сюда не попадают — их фурнитуру считает
 * отдельная ветка по свободным участкам.
 */
export function hasSwingLeaf(unit: Module): boolean {
  if (!hasFacade(unit)) return false;
  /* Зоны: створки есть, если хоть одна зона на петлях. */
  if (hasFrontZones(unit)) return (unit.frontZones ?? []).some((zone) => zone.fill === 'door' || zone.fill === 'doors2' || zone.fill === 'glass');
  if (!unit.column && (unit.fill?.drawerHeights.length ?? 0) > 0) return false;
  if (hasVisibleWholeAppliance(unit) || unit.column) return false;
  return doorCountOf(unit) > 0;
}

/**
 * Прибор, который ВИДЕН ЦЕЛИКОМ: полотна перед ним не бывает.
 *
 * Варочная лежит в столешнице, вытяжка висит на виду, отдельностоящий
 * прибор не закрывают вовсе. Колонна сюда не входит: у неё приборы в
 * нишах, а над ними и под ними — обычные створки.
 */
const WHOLE_APPLIANCES = new Set(['oven', 'hob', 'hood', 'microwave']);

export function hasVisibleWholeAppliance(unit: Module): boolean {
  /* Шкаф со встроенной вытяжкой закрыт фасадом (задача 7): прибор внутри, створка на корпусе. */
  if (unit.appliance === 'hood' && (unit.hoodCabinet === 'door' || unit.hoodCabinet === 'lift')) return false;
  return (
    Boolean(unit.appliance) &&
    !unit.column &&
    (WHOLE_APPLIANCES.has(unit.appliance as string) || unit.builtIn === false)
  );
}

/**
 * Сколько СТВОРОК задумано у модуля.
 *
 * Единственное место продукта, где читается `frontType`, и читается он
 * по делу: «какой фронт задуман». Ящики и открытая секция дают ноль —
 * там створки нет ни в раскрое, ни в сцене, ни в смете.
 */
function doorCountOf(unit: Module): number {
  /*
   * СЕКЦИЯ-ВИТРИНА (P1): её стеклянная дверь хранится не створкой
   * (`frontType: 'none'`, чтобы ей не резали фасад ЛДСП), но висит она на
   * петлях и за ручку её открывают — створка одна. До P1 здесь был ноль, и
   * петель с ручкой для этой двери не покупал никто.
   */
  if (unit.section === 'glass_display' && unit.frontType === 'none') return 1;
  if (unit.frontType === 'drawers' || unit.frontType === 'none') return 0;
  return Math.max(1, unit.doorCount);
}

/** Меньше этого фасад не делают: полоска в палец не деталь, а мусор. */
export const MIN_FACADE_SPAN_MM = 90;

/**
 * Ниша одиночного прибора в пенале.
 *
 * У колонны их две и считает их `columnNiches`; здесь одиночная духовка
 * или микроволновка в пенале — тот же случай, только ниша одна.
 */
function nicheOf(unit: Module, heightMm: number, production?: ProductionSettings): FacadeSpan[] {
  const appliance = moduleAppliances(unit)[0];
  if (!appliance || unit.kind !== 'tall') return [];

  /* Ниша — одна `singleNicheOf` (ЭТАП 4): её границы — оси полок-опор, их же режет раскрой. */
  const niche = singleNicheOf(unit, heightMm, production);
  return niche ? [{ fromMm: niche.fromMm, heightMm: niche.toMm - niche.fromMm }] : [];
}

export { OVEN_FROM_FLOOR_MM };
