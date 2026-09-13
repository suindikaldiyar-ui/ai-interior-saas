import { recalcTotal } from './estimate';
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
 * ИТОГ СТРОКИ СЧИТАЕТСЯ ОДИН РАЗ — при расчёте стены (`buildEstimate`).
 * Здесь он только СКЛАДЫВАЕТСЯ. Раньше слияние пересчитывало его из
 * `quantity × rate` — и это был тот самый второй калькулятор: у
 * процентной статьи `rate` это ПРОЦЕНТЫ, а не цена за единицу, и крепёж
 * на угловой кухне схлопывался с 27 406 ₸ до 288 ₸ (24.04 × 12).
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
        /*
         * Разовая статья остаётся ОДНА. Её величину пересчитает
         * `recalcTotal` — от объектной базы, а не от базы первой стены:
         * везут и монтируют весь объект, а не его половину.
         */
        if (seenOnce.has(line.key)) continue;
        seenOnce.add(line.key);
        byKey.set(line.key, { ...line });
        continue;
      }

      const before = byKey.get(line.key);
      if (!before) {
        byKey.set(line.key, { ...line });
        continue;
      }

      byKey.set(line.key, {
        ...before,
        quantity: round2(before.quantity + line.quantity),
        // Складываем посчитанное, а не считаем заново.
        total: round2(before.total + line.total),
        // Пропавшая ставка на любой из стен — пропавшая ставка на объекте.
        missingRate: before.missingRate || line.missingRate,
      });
    }
  }

  const merged: Estimate = {
    ...first,
    lines: Array.from(byKey.values()),
    total: 0,
    preliminary: parts.some((part) => part.preliminary),
    priceSnapshot: Object.assign({}, ...parts.map((part) => part.priceSnapshot)),
  };

  /*
   * ПРОЦЕНТ ОБЪЕКТА СЧИТАЕТСЯ ОТ ОБЪЕКТНОЙ БАЗЫ, И СЧИТАЕТ ЕГО ТА ЖЕ
   * ФУНКЦИЯ, ЧТО ПРИ РАСЧЁТЕ ОДНОЙ СТЕНЫ.
   *
   * `recalcTotal` уже умеет ровно это: подытог по всем строкам, кроме
   * доставки, и доставка процентом от него. Написать это здесь второй
   * раз значило бы завести второй расчёт того же числа — то есть ровно
   * то, от чего эта правка избавляется.
   */
  return recalcTotal(
    merged,
    merged.lines.filter((line) => !line.enabled).map((line) => line.key),
  );
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

/* ─────────────────────  Ряд, собранный на другой стене  ───────────────────── */

/** Ряд не сходится со своей стеной: собран на одной длине, стоит на другой. */
export type WallMismatch = {
  /** Номер стены в композиции. */
  index: number;
  label: string;
  /** Длина, на которой ряд собран. */
  runLengthMm: number;
  /** Полезная длина стены сейчас — то, что осталось после угла. */
  usableMm: number;
};

/**
 * РЯД, СОБРАННЫЙ НА ДРУГОЙ ДЛИНЕ, — ЭТО УСТАРЕВШЕЕ СОСТОЯНИЕ, А НЕ ФАКТ.
 *
 * Соседние стены восстанавливаются из сохранённого состояния дословно и
 * с текущей стеной не сверяются. Замерщик поправил стену Б с 1800 на
 * 1140 — полезная длина стала 480, а ряд остался на 1140. Дальше хуже:
 * место рядов считается цепочкой от `run.lengthMm`, поэтому всё, что
 * стоит ЗА этим рядом, уезжает на разницу. На П-образной между стеной А
 * и стеной В открывалась пустота 680 мм, и угол переставал замыкаться.
 *
 * Расхождение здесь ВЫВОДИТСЯ сравнением, а не хранится флагом: флаг
 * пришлось бы сбрасывать, и он разошёлся бы с длиной на первой правке.
 */
export function wallMismatches(
  layout: { segments: { label: string; run: Pick<Run, 'lengthMm'> }[] },
  runs: Pick<Run, 'lengthMm'>[],
): WallMismatch[] {
  const found: WallMismatch[] = [];

  layout.segments.forEach((segment, index) => {
    const run = runs[index];
    if (!run) return;

    const usableMm = segment.run.lengthMm;
    if (Math.abs(run.lengthMm - usableMm) <= 1) return;

    found.push({
      index,
      label: segment.label ?? wallLabel(index),
      runLengthMm: run.lengthMm,
      usableMm,
    });
  });

  return found;
}

/**
 * Одна строка словами: что именно не сходится и чем это кончится.
 *
 * Последствие, а не факт: «ряд 1140 при стене 480» замерщик прочитает и
 * не поймёт, чем это ему грозит.
 */
export function wallMismatchMessage(mismatch: WallMismatch): string {
  const diff = Math.abs(mismatch.runLengthMm - mismatch.usableMm);
  const longer = mismatch.runLengthMm > mismatch.usableMm;

  return longer
    ? `${mismatch.label}: ряд собран на ${mismatch.runLengthMm} мм, а на стене осталось ` +
      `${mismatch.usableMm} мм — он не встанет и сдвинет соседний ряд на ${diff} мм. ` +
      'Пересоберите эту стену: правки по ней придётся сделать заново.'
    : `${mismatch.label}: ряд собран на ${mismatch.runLengthMm} мм, а на стене ` +
      `${mismatch.usableMm} мм — ${diff} мм стены останутся пустыми. ` +
      'Пересоберите эту стену, чтобы мебель встала во всю длину.';
}
