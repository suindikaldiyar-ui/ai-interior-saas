import { BUILT_IN_FRIDGE_FRONTS, moduleAppliances, nicheHeightMm } from './modules';
import { columnNiches } from './fill';
import type { Module } from '@/types/millwork';

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
  if (unit.appliance === undefined && unit.column === undefined) return true;
  return unit.builtIn !== false;
}

export type FacadeSpan = {
  /** Низ участка от дна корпуса, мм. */
  fromMm: number;
  /** Высота участка, мм. */
  heightMm: number;
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
export function facadeSpans(unit: Module, heightMm: number): FacadeSpan[] {
  if (!hasFacade(unit)) return [];

  const niches = unit.column
    ? columnNiches(unit, heightMm).map((niche) => ({
        fromMm: niche.fromMm,
        heightMm: niche.toMm - niche.fromMm,
      }))
    : nicheOf(unit, heightMm);
  if (niches.length === 0) return [{ fromMm: 0, heightMm }];

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
export function nicheFacadeSpans(unit: Module, heightMm: number): FacadeSpan[] | null {
  const spans = facadeSpans(unit, heightMm);
  if (spans.length === 0) return null;
  /*
   * Разбит — значит хотя бы один участок короче модуля. Считать по числу
   * участков нельзя: у колонны, где прибор упёрся в крышу, останется один
   * участок, и он всё равно свободный.
   */
  return spans.some((span) => span.heightMm < heightMm) ? spans : null;
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
};

export function moduleFronts(unit: Module, heightMm: number): ModuleFronts {
  const empty: ModuleFronts = { leaves: [], drawers: [] };

  /* Отдельностоящий прибор: он виден целиком, полотна перед ним нет. */
  if (!hasFacade(unit)) return empty;

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
  const spans = nicheFacadeSpans(unit, heightMm);
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
   * ВИТРИНА ЗАКРЫТА СТЕКЛОМ, А НЕ ГЛУХОЙ СТВОРКОЙ.
   *
   * Полотно у неё есть и в раскрое, и в фурнитуре — на петлях, как
   * обычная дверца; рисует его сцена своим стеклом, а не этой пачкой.
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
function nicheOf(unit: Module, heightMm: number): FacadeSpan[] {
  const appliance = moduleAppliances(unit)[0];
  if (!appliance || unit.kind !== 'tall') return [];

  const niche = nicheHeightMm(appliance, unit.applianceSizes?.[appliance]);
  if (!niche) return [];

  /*
   * Прибор в пенале ставят на удобную высоту, а не на пол: духовка на
   * уровне пояса — это отраслевая норма, а не предпочтение.
   */
  const from = Math.max(0, Math.min(heightMm - niche, OVEN_FROM_FLOOR_MM));
  return [{ fromMm: from, heightMm: niche }];
}

/** Низ ниши духовки от дна пенала: на этой высоте её и ставят. */
export const OVEN_FROM_FLOOR_MM = 850;
