import { moduleId } from './layout';
import { isStandardWidth } from './modules';
import type { Module } from '@/types/millwork';

/**
 * ПОЗИЦИИ В СВОБОДНОЙ СБОРКЕ.
 *
 * В раскладке по шаблону `offsetMm` — величина ВЫВЕДЕННАЯ: модули идут
 * подряд, и позиция каждого это сумма ширин предыдущих. В свободной сборке
 * всё наоборот: человек ставит модуль ТУДА, КУДА ХОЧЕТ, и позиция
 * становится собственным свойством модуля, а между модулями законно
 * появляется пустое место.
 *
 * Инвариантный слой к этому был готов: `assertRunFits` уже сверяет
 * `offsetMm + widthMm` с началом следующего модуля и с длиной стены, а
 * `moduleOverlaps` считает габариты по тем же числам. Repack делал только
 * `reindex`.
 *
 * Ширины и высоты этот файл не трогает вовсе — он отвечает на один вопрос:
 * что где стоит и куда ещё можно встать.
 */

/**
 * Шаг перемещения — 50 мм.
 *
 * Тот же, что у ручки ширины (ловушка 189): пальцем миллиметр не поставить,
 * а цех считает пятёрками. Миллиметровый шаг дал бы ложное ощущение
 * контроля и позиции вроде 1237 мм, которые никто не проверяет.
 */
export const MOVE_STEP_MM = 50;

export function snapMove(mm: number): number {
  return Math.round(mm / MOVE_STEP_MM) * MOVE_STEP_MM;
}

/**
 * Разложить модули по их собственным позициям.
 *
 * Порядок в массиве — слева направо, потому что на нём держатся и чертёж,
 * и отпечаток, и нумерация позиций. Идентификатор по-прежнему выводится из
 * позиции и роли: пересчитали ряд — тот же модуль получил тот же id.
 */
export function placeFree(modules: Module[], wallId?: string): Module[] {
  return [...modules]
    .sort((a, b) => a.offsetMm - b.offsetMm)
    .map((unit) => ({
      ...unit,
      // Строку собирает `moduleId` — здесь была её вторая копия.
      id: moduleId(unit.kind, unit.offsetMm, unit.appliance, wallId),
      isFiller: unit.kind === 'filler' || !isStandardWidth(unit.widthMm),
    }));
}

export type Gap = { fromMm: number; toMm: number; widthMm: number };

/**
 * Пустые места ряда, слева направо.
 *
 * Свободное место в свободной сборке не одно: удалили модуль в середине —
 * дырка осталась там, где была, и ряд не схлопнулся. Именно поэтому одного
 * числа `residualMm` для интерфейса мало.
 */
export function gapsIn(
  modules: Module[],
  lengthMm: number,
  /**
   * Занятое препятствиями у стены (слой 56): колонна, короб, выступ.
   * Пустота у препятствия кончается на нём — внутрь модуль не встаёт.
   */
  blocked: { from: number; to: number }[] = [],
): Gap[] {
  const sorted = [
    ...modules.map((unit) => ({ from: unit.offsetMm, to: unit.offsetMm + unit.widthMm })),
    ...blocked,
  ].sort((a, b) => a.from - b.from);
  const gaps: Gap[] = [];
  let cursor = 0;

  for (const taken of sorted) {
    if (taken.from > cursor) {
      gaps.push({ fromMm: cursor, toMm: taken.from, widthMm: taken.from - cursor });
    }
    cursor = Math.max(cursor, taken.to);
  }

  if (cursor < lengthMm) {
    gaps.push({ fromMm: cursor, toMm: lengthMm, widthMm: lengthMm - cursor });
  }

  return gaps;
}

/** Самое широкое пустое место: столько ещё влезет одним модулем. */
export function widestGapMm(modules: Module[], lengthMm: number): number {
  return gapsIn(modules, lengthMm).reduce((max, gap) => Math.max(max, gap.widthMm), 0);
}

/**
 * Куда встанет добавляемый модуль.
 *
 * Сначала — место сразу за выделенным модулем: человек указал, куда
 * ставить, и спорить с ним незачем. Если там не помещается, берётся первое
 * подходящее слева направо. Не нашлось вовсе — `null`, и операция
 * отказывает с числом.
 */
export function placementFor(
  modules: Module[],
  lengthMm: number,
  widthMm: number,
  afterModuleId?: string,
  /** Препятствия у стены — занятое место (слой 56). */
  blocked: { from: number; to: number }[] = [],
): number | null {
  const gaps = gapsIn(modules, lengthMm, blocked);
  const after = afterModuleId ? modules.find((m) => m.id === afterModuleId) : undefined;

  if (after) {
    const wanted = after.offsetMm + after.widthMm;
    const gap = gaps.find((g) => g.fromMm <= wanted && wanted + widthMm <= g.toMm);
    if (gap) return wanted;
  }

  const fits = gaps.find((gap) => gap.widthMm >= widthMm);
  return fits ? fits.fromMm : null;
}

export type MoveConflict = {
  /** Модуль, который уже стоит на этом месте. */
  blockedBy: Module;
  /** На сколько миллиметров перекрываются. */
  overlapMm: number;
  /** Ближайшая позиция, где модуль поместится целиком. `null` — таких нет. */
  nearestMm: number | null;
};

/**
 * Можно ли поставить модуль сюда.
 *
 * СОСЕДИ НЕ РАЗДВИГАЮТСЯ. Это главное отличие от раскладки по шаблону:
 * там `rebalance` подвинул бы всех и ряд сошёлся, здесь ряд собирает
 * человек, и молча ужать соседа — значит показать клиенту не тот состав,
 * который он заказывал. Занято — отказ, и он называет, НА СКОЛЬКО занято
 * и куда встать можно.
 */
export function moveConflict(
  modules: Module[],
  moduleId: string,
  offsetMm: number,
  lengthMm: number,
  /**
   * Препятствия у стены (слой 56): подсказка «ближайшее свободное место»
   * не отправляет внутрь выступа. Само захождение в препятствие отказывает
   * правка ряда (`applyOps`), со словами и миллиметрами.
   */
  blocked: { from: number; to: number }[] = [],
): MoveConflict | null {
  const moving = modules.find((m) => m.id === moduleId);
  if (!moving) return null;

  const others = modules.filter((m) => m.id !== moduleId);
  const x1 = offsetMm + moving.widthMm;

  const hit = others.find((unit) => offsetMm < unit.offsetMm + unit.widthMm && x1 > unit.offsetMm);
  if (!hit) return null;

  const overlapMm = Math.min(x1, hit.offsetMm + hit.widthMm) - Math.max(offsetMm, hit.offsetMm);

  /*
   * Ближайшее место ищется по СВОБОДНЫМ ПРОМЕЖУТКАМ без этого модуля:
   * сам он в расчёт не входит, иначе своя же старая позиция считалась бы
   * занятой и подсказка отправляла бы человека дальше, чем нужно.
   */
  const candidates: number[] = [];
  for (const gap of gapsIn(others, lengthMm, blocked)) {
    if (gap.widthMm < moving.widthMm) continue;
    // В промежутке ближе всего либо его край, либо сама желаемая позиция.
    const lo = gap.fromMm;
    const hi = gap.toMm - moving.widthMm;
    candidates.push(snapMove(Math.min(Math.max(offsetMm, lo), hi)));
  }

  const nearestMm = candidates.length
    ? candidates.reduce((best, mm) =>
        Math.abs(mm - offsetMm) < Math.abs(best - offsetMm) ? mm : best,
      )
    : null;

  return { blockedBy: hit, overlapMm, nearestMm };
}

/**
 * Текст отказа: чем занято, на сколько и куда можно встать.
 *
 * Отказ без числа — это «нельзя», после которого человек пробует наугад.
 */
export function moveRefusal(conflict: MoveConflict): string {
  const where =
    conflict.nearestMm === null
      ? 'Свободного места такой ширины в ряду нет.'
      : `Ближайшее свободное место — ${conflict.nearestMm} мм.`;

  return (
    `Здесь стоит «${conflict.blockedBy.label}»: перекрытие ${conflict.overlapMm} мм. ${where}`
  );
}
