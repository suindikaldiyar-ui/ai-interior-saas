import { compositionFingerprint } from './fingerprint';
import type { Composition, Estimate, EstimateLine, Run } from '@/types/millwork';

/**
 * НЕСКОЛЬКО СТЕН НА ОДНОМ РАБОЧЕМ ЭКРАНЕ.
 *
 * Угловая кухня — половина заказов, и до сих пор руками её было не
 * собрать: рабочее место знало ровно один ряд. Композицию (`Composition`)
 * умел строить только шаблон, и правке она не поддавалась.
 *
 * Здесь ровно то, чего не хватало между `buildComposition` и рабочим
 * местом: как сложить сметы нескольких рядов в одну и как назвать стены
 * человеку. Раскладку по-прежнему считает `buildRun`, правки идут через
 * `applyOps` — второго пути записи не появляется.
 */

/** Как стены называются в разговоре и на чертеже. */
export const WALL_LABELS = ['Стена А', 'Стена Б', 'Стена В'];

export function wallLabel(index: number): string {
  return WALL_LABELS[index] ?? `Стена ${index + 1}`;
}

/**
 * СМЕТА КОМПОЗИЦИИ — СУММА СМЕТ РЯДОВ, А НЕ ВТОРОЙ РАСЧЁТ.
 *
 * Считать угловую кухню отдельной формулой значило бы завести второй
 * калькулятор: он разошёлся бы с первым на первой же правке ставок, и
 * клиенту показали бы одну сумму, а в цех уехала другая.
 *
 * Строки складываются ПО КЛЮЧУ статьи — по тому же, по которому смета
 * группируется в пять групп: количество суммируется, ставка берётся
 * общая (она одна на организацию), итог пересчитывается из них.
 *
 * Разовые статьи объекта — доставка, замер, монтажная бригада — не
 * удваиваются: их платят за объект, а не за стену.
 */
const ONCE_PER_OBJECT = ['delivery', 'assembly', 'measure', 'design'];

export function mergeEstimates(parts: Estimate[]): Estimate {
  const first = parts[0];
  if (parts.length === 1) return first;

  const byKey = new Map<string, EstimateLine>();
  const seenOnce = new Set<string>();

  for (const part of parts) {
    for (const line of part.lines) {
      const once = ONCE_PER_OBJECT.some((key) => line.key.startsWith(key));
      if (once) {
        if (seenOnce.has(line.key)) continue;
        seenOnce.add(line.key);
      }

      const before = byKey.get(line.key);
      if (!before) {
        byKey.set(line.key, { ...line });
        continue;
      }

      const quantity = round2(before.quantity + line.quantity);
      byKey.set(line.key, {
        ...before,
        quantity,
        total: Math.round(quantity * before.rate),
        // Пропавшая ставка на любой из стен — пропавшая ставка на объекте.
        missingRate: before.missingRate || line.missingRate,
      });
    }
  }

  const lines = Array.from(byKey.values());
  const total = lines
    .filter((line) => line.enabled)
    .reduce((sum, line) => sum + line.total, 0);

  return {
    ...first,
    lines,
    total: Math.round(total),
    preliminary: parts.some((part) => part.preliminary),
    priceSnapshot: Object.assign({}, ...parts.map((part) => part.priceSnapshot)),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Композиция из уже собранных рядов.
 *
 * Нужна там, где ряды правились руками: `buildComposition` строит их с
 * нуля, а здесь они уже есть — с правками замерщика. Отпечаток считается
 * от того же, от чего считает раскладка, и включает решение угла.
 */
export function compositionOf(
  base: Composition,
  runs: Run[],
): Composition {
  const segments = base.segments.map((segment, i) => ({
    ...segment,
    run: runs[i] ?? segment.run,
  }));

  return {
    ...base,
    segments,
    fingerprint: compositionFingerprint({ segments, corners: base.corners }),
  };
}
