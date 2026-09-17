import { recalcTotal } from './estimate';
import { compositionFingerprint } from './fingerprint';
import type { Composition, Estimate, EstimateLine, Opening, Run } from '@/types/millwork';

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

/** Падеж, в котором стена стоит во фразе. */
export type WallCase = 'nominative' | 'accusative' | 'prepositional';

/** Слово «стена» по падежам. Буква стены не склоняется — это обозначение. */
const WALL_WORD: Record<WallCase, string> = {
  nominative: 'стена',
  accusative: 'стену',
  prepositional: 'стене',
};

/**
 * «Стена Б» В СЕРЕДИНЕ ФРАЗЫ.
 *
 * Строчным делается только слово, буква остаётся заглавной: `toLowerCase()`
 * целиком давал «стена б», и фраза читалась оборванной на союзе. Падеж
 * задаёт вызывающий — «Пересобрать стену Б», но «Прибор стоит на стене Б»;
 * подставить один падеж во все места значит написать по-русски неверно
 * ровно там, где замерщик показывает экран клиенту.
 *
 * Склоняется НАЗВАНИЕ, а не индекс: название по-прежнему выдаёт
 * `wallLabel`, и второго источника имени стены не появляется.
 */
export function lowerWall(label: string, wordCase: WallCase = 'nominative'): string {
  const space = label.indexOf(' ');
  if (space < 0) return label.toLowerCase();
  return `${WALL_WORD[wordCase]}${label.slice(space)}`;
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

/* ────────────────────  Какие стены уходят в композицию  ──────────────────── */

/** Стена композиции: столько, сколько нужно `buildComposition`. */
export type SelectedWall = { id: string; lengthMm: number; openings: Opening[] };

/**
 * СТЕНЫ ОТБИРАЮТСЯ ПО ИДЕНТИФИКАТОРУ, А НЕ ПО ДЛИНЕ.
 *
 * Рабочее место вычитало соседние стены ЗНАЧЕНИЕМ — брало все, чья длина
 * не равна длине рабочей стены. Пока стены разные, это совпадает с
 * правдой, и потому держалось долго:
 *
 *   А=3800, Б=1140  →  3800 и 1140                            ✓
 *   А=3800, Б=3800  →  Б выпадала как «та же самая»            ✗
 *   А=3000, Б=3000  →  выпадали обе, композиция вся выдумана   ✗
 *
 * На место выпавших вставала глубина помещения — величина, которой в
 * замере нет вовсе. Клиент видел её на экране как размер своей стены.
 *
 * Идентичность у стены есть с захода про id модуля (`wallId`), и она
 * устойчива: длина меняется, идентификатор — нет.
 *
 * Функция живёт здесь, а не на экране, ровно по правилу слоя 42:
 * проверять надо ТО, что показано человеку, а не похожий пересчёт рядом.
 */
export function compositionWalls(input: {
  /** Стены разрешённого замера по порядку обхода. */
  measured: { id: string; lengthMm: number; openings?: Opening[] }[];
  /** Идентификатор рабочей стены — той, вдоль которой стоит ряд. */
  runWallId?: string;
  /** Длина рабочей стены. Её считает `workspaceInput`, а не этот отбор. */
  runLengthMm: number;
  /** Проёмы рабочей стены. */
  runOpenings: Opening[];
}): SelectedWall[] {
  const measured = input.measured
    .filter((wall) => wall.lengthMm > 0)
    .map((wall) => ({
      id: wall.id,
      lengthMm: Math.round(wall.lengthMm),
      openings: wall.openings ?? [],
    }));

  const at = measured.findIndex((wall) => wall.id === input.runWallId);

  const first: SelectedWall = {
    id: measured[at]?.id ?? input.runWallId ?? 'a',
    lengthMm: Math.round(input.runLengthMm),
    openings: input.runOpenings,
  };

  /*
   * ОБХОД ИДЁТ ОТ РАБОЧЕЙ СТЕНЫ В ОДНУ СТОРОНУ.
   *
   * Стены замера лежат по порядку обхода — у каждой записан поворот к
   * следующей. Композиция ставит ряды цепочкой, поэтому соседом стены А
   * обязана быть та, что стоит за ней В ЗАМЕРЕ, а не та, что просто
   * осталась в списке.
   *
   * Отметил замерщик рядом вторую стену из трёх — раньше выходило
   * «Б, А, В»: Стена В оказывалась соседом стены А через комнату.
   * Сдвигом порядка получается «Б, В, А» — обход в ту же сторону,
   * какой его и вёл человек. Отмечена первая (обычный случай) — сдвиг
   * ничего не меняет вовсе.
   */
  const rest = at >= 0 ? [...measured.slice(at + 1), ...measured.slice(0, at)] : measured;

  /*
   * Стену, которой в замере нет, придумывать нечем и не из чего: кухня
   * 11.85 м² бывает и 3200 × 3700, и 2900 × 4100. Не хватило — об этом
   * скажет отказ композиции, назвав стену по имени.
   */
  return [first, ...rest.filter((wall) => wall.id !== first.id)];
}
