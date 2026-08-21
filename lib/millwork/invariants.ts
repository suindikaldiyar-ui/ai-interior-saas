import type { Run } from '@/types/millwork';

/**
 * Инварианты ряда. Файл намеренно ни от чего не зависит: его импортируют
 * и раскладка, и проверки, а взаимный импорт между ними уронил бы модуль
 * на инициализации.
 */

export function runWidthSum(run: Pick<Run, 'modules'>): number {
  return run.modules.reduce((sum, unit) => sum + unit.widthMm, 0);
}

export class RunOverflowError extends Error {
  constructor(
    readonly sumMm: number,
    readonly lengthMm: number,
  ) {
    super(
      `Раскладка не помещается в ряд: сумма модулей ${sumMm} мм при длине ${lengthMm} мм ` +
        `(превышение ${sumMm - lengthMm} мм).`,
    );
    this.name = 'RunOverflowError';
  }
}

/**
 * Сумма ширин модулей не может превышать длину ряда НИ ПРИ КАКИХ входных
 * данных. Это не предупреждение и не строка в интерфейсе: отрицательного
 * остатка пользователь не должен увидеть никогда, а смета по такому ряду
 * посчитает деньги, которых нет.
 *
 * Вызывается в конце buildRun и applyOps — то есть на каждом пути, который
 * вообще способен собрать ряд.
 */
export function assertRunFits(run: Run): void {
  const sum = runWidthSum(run);
  if (sum > run.lengthMm) {
    throw new RunOverflowError(sum, run.lengthMm);
  }

  const overlapping = run.modules.find((unit, i) => {
    const next = run.modules[i + 1];
    return next !== undefined && unit.offsetMm + unit.widthMm > next.offsetMm;
  });
  if (overlapping) {
    throw new Error(
      `Модули накладываются: ${overlapping.id} заканчивается на ` +
        `${overlapping.offsetMm + overlapping.widthMm} мм, а следующий начинается раньше.`,
    );
  }

  const last = run.modules[run.modules.length - 1];
  if (last && last.offsetMm + last.widthMm > run.lengthMm) {
    throw new RunOverflowError(last.offsetMm + last.widthMm, run.lengthMm);
  }
}

/**
 * Можно ли задать модулю такую ширину.
 *
 * Мебель делают на заказ, поэтому ширина вводится числом, а не выбирается
 * из списка. Но ряд от этого шире стены не становится: считаем минимально
 * возможную сумму — техника, пеналы и углы держат свой габарит, обычные
 * модули ужимаются до минимума — и если она уже больше длины, правку
 * не применяем и говорим, на сколько не сходится.
 */
export function widthOverflowMm(
  run: Pick<Run, 'modules' | 'lengthMm'>,
  moduleId: string,
  widthMm: number,
  minPlainWidthMm: number,
): number {
  let minSum = widthMm;

  for (const unit of run.modules) {
    if (unit.id === moduleId) continue;
    const fixed =
      Boolean(unit.appliance) || unit.kind === 'tall' || unit.kind === 'corner_base';
    minSum += fixed ? unit.widthMm : Math.min(unit.widthMm, minPlainWidthMm);
  }

  return Math.max(0, minSum - run.lengthMm);
}

/** Сколько раз каждый прибор попал в ряд. В норме — ровно один. */
export function appliancesPlacedOnce(run: Run): Map<string, number> {
  const counts = new Map<string, number>();
  for (const unit of [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)]) {
    if (!unit.appliance) continue;
    counts.set(unit.appliance, (counts.get(unit.appliance) ?? 0) + 1);
  }
  return counts;
}
