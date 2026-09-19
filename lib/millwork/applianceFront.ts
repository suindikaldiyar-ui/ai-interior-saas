import { moduleAppliances, nicheHeightMm } from './modules';
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
