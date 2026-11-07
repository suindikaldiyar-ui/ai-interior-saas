import { levelAt, type CornerEnd } from './corner';
import { rowSpansOfRun } from './layout';
import { hangingRowBlocks } from './invariants';
import { mezzanineBaseOf } from './fill';
import { MAX_WIDTH, MIN_WIDTH, moduleAppliances } from './modules';
import type { Module, Opening, Run, RunRequirements } from '@/types/millwork';

/**
 * МЕСТО РЯДА НА СТЕНЕ — ОДИН ОТВЕТ НА ЭКРАН И НА «ЗАПОЛНИТЬ ДО ГРАНИЦЫ».
 *
 * Стена А дошла до угла, а стена Б начинается не с нуля: нижний, верхний и
 * антресольный ряды отступают от соседа каждый на своё — у них своя глубина и
 * свой вид стыка (`levelAt`). Здесь это сказано числами по каждому ряду: длина
 * стены, занятое углами, доступное, собранное и свободные участки. Своей
 * геометрии нет: участки — `rowSpansOfRun`, те же, что у раскладки и правки,
 * поэтому модуль, поставленный по этому плану, не войдёт в соседнюю стену.
 */

export type FitRow = 'base' | 'upper' | 'mezzanine';

export const FIT_ROW_TITLE: Record<FitRow, string> = { base: 'Низ', upper: 'Верх', mezzanine: 'Антресоль' };

export type RowFit = {
  row: FitRow;
  /** Длина стены по замеру, мм. */
  wallMm: number;
  /** Занято углом у начала и у конца стены на высоте ЭТОГО ряда, мм. */
  startMm: number;
  endMm: number;
  /** Доступно ряду: стена минус углы и то, что его рвёт (окно, колонна, выступ), мм. */
  availableMm: number;
  /** Собрано: сумма ширин модулей ряда, мм. */
  builtMm: number;
  /** Свободные участки в координатах ряда — всё, что не занято модулями. */
  free: { fromMm: number; toMm: number }[];
  freeMm: number;
};

/** Модули ряда на сейчас: нижний — всё, что стоит на полу; антресоль — кроме кладовки над колонной. */
export function fitRowModules(run: Run, row: FitRow): Module[] {
  if (row === 'base') return run.modules;
  const hanging = run.upperSegments.flatMap((segment) => segment.modules);
  if (row === 'upper') return hanging.filter((unit) => unit.section !== 'mezzanine' && !unit.overhead);
  return hanging.filter((unit) => unit.section === 'mezzanine' && mezzanineBaseOf(unit, run) === null);
}

/**
 * Что занимает этот ряд. Поднятая тумба зала (`hangMm`) остаётся модулем нижнего ряда: под ней шкаф не ставят, и «свободно»
 * считать её место нельзя — иначе «Заполнить» предлагал мебель под телевизор.
 */
function occupied(run: Run, row: FitRow): Module[] {
  return fitRowModules(run, row);
}

const levelOfRow = (row: FitRow) => (row === 'base' ? ('lower' as const) : row);

/** Занятое углом у конца стены на высоте этого ряда. */
function cornerMm(run: Run, end: CornerEnd, row: FitRow): number {
  return levelAt(run, end, levelOfRow(row))?.gapMm ?? 0;
}

/** Участки без того, что заходит в ряд снизу: своя мебель считается отдельно, это — чужая. */
function withoutBlocks(spans: { from: number; to: number }[], blocks: { fromMm: number; toMm: number }[]): { from: number; to: number }[] {
  return blocks.reduce(
    (list, block) =>
      list.flatMap((span) => {
        if (block.toMm <= span.from || block.fromMm >= span.to) return [span];
        return [
          ...(block.fromMm > span.from ? [{ from: span.from, to: block.fromMm }] : []),
          ...(block.toMm < span.to ? [{ from: block.toMm, to: span.to }] : []),
        ];
      }),
    spans,
  );
}

export function rowFit(run: Run, row: FitRow, openings: Opening[], requirements: RunRequirements): RowFit {
  const wallMm = run.lengthMm + cornerMm(run, 'start', 'base') + cornerMm(run, 'end', 'base');
  const units = [...occupied(run, row)].sort((a, b) => a.offsetMm - b.offsetMm);
  const raw = rowSpansOfRun(row, run, run.modules, openings, requirements, run.options).free;
  const spans = row === 'base' ? raw : withoutBlocks(raw, hangingRowBlocks(run, row, units));
  const free: { fromMm: number; toMm: number }[] = [];
  for (const span of spans) {
    let at = span.from;
    for (const unit of units) {
      const from = unit.offsetMm;
      const to = unit.offsetMm + unit.widthMm;
      if (to <= span.from || from >= span.to) continue;
      if (from > at) free.push({ fromMm: at, toMm: from });
      at = Math.max(at, to);
    }
    if (at < span.to) free.push({ fromMm: at, toMm: span.to });
  }
  return {
    row,
    wallMm,
    startMm: cornerMm(run, 'start', row),
    endMm: cornerMm(run, 'end', row),
    availableMm: Math.round(spans.reduce((sum, span) => sum + span.to - span.from, 0)),
    builtMm: Math.round(units.reduce((sum, unit) => sum + unit.widthMm, 0)),
    free,
    freeMm: Math.round(free.reduce((sum, part) => sum + part.toMm - part.fromMm, 0)),
  };
}

/** Ряды, которые у стены есть: нижний всегда, верхний и антресоль — включённые. */
export function rowFits(run: Run, openings: Opening[], requirements: RunRequirements): RowFit[] {
  const rows: FitRow[] = ['base'];
  if (run.options.hasUpper) rows.push('upper');
  if (run.mezzanine) rows.push('mezzanine');
  /* Ряд, которому на этой стене негде стоять и в котором ничего нет, не показывается: «Верх» над шкафом до потолка — не место. */
  return rows.map((row) => rowFit(run, row, openings, requirements)).filter((fit) => fit.row === 'base' || fit.availableMm > 0 || fit.builtMm > 0);
}

/** Что сделать с одним свободным участком. */
export type RowFillStep =
  /** Новые корпуса точных ширин. */
  | { kind: 'add'; fromMm: number; widthsMm: number[] }
  /** Сосед шире на участок: `offsetMm` — его новый левый край. */
  | { kind: 'grow'; moduleId: string; label: string; offsetMm: number; widthMm: number; byMm: number }
  /** Участок уже корпуса, а соседа расширить нельзя: доборная планка (только нижний ряд). */
  | { kind: 'filler'; fromMm: number; widthMm: number };

export type RowFillPlan = { steps: RowFillStep[]; refusal: string | null; words: string };

/** Самый широкий корпус, который ставит «Заполнить»: шире — две секции поровну. */
const FILL_MAX_MM = 900;

/** Корпус без прибора, ширину которого можно поправить: его фасад пересчитает правка. */
function growable(unit: Module | undefined, byMm: number): boolean {
  if (!unit) return false;
  if (moduleAppliances(unit).length > 0 || unit.kind === 'filler') return false;
  if (unit.kind === 'corner_base' || unit.kind === 'corner_upper') return false;
  if (unit.radius || unit.vitrine) return false;
  return unit.widthMm + byMm <= MAX_WIDTH;
}

/** Поровну: остаток миллиметров — последней секции, сумма сходится до миллиметра. */
function evenWidths(totalMm: number): number[] {
  const count = Math.max(1, Math.ceil(totalMm / FILL_MAX_MM));
  const base = Math.floor(totalMm / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? totalMm - base * (count - 1) : base));
}

/**
 * ЗАПОЛНИТЬ РЯД ДО ДОСТУПНОЙ ГРАНИЦЫ — ЧТО ИМЕННО БУДЕТ СДЕЛАНО, ДО НАЖАТИЯ.
 *
 * Каждый свободный участок внутри границ ряда: от самого узкого корпуса —
 * новые модули точных ширин; уже — соседний шкаф становится шире на эти
 * миллиметры, а где сосед — прибор, в нижнем ряду ставится доборная планка, в
 * висящем — отказ числом. Свободного места нет — сказано и это: кнопка,
 * которая ничего не делает, читается как поломка.
 */
export function rowFillPlan(run: Run, row: FitRow, openings: Opening[], requirements: RunRequirements): RowFillPlan {
  const fit = rowFit(run, row, openings, requirements);
  const title = FIT_ROW_TITLE[row].toLowerCase();
  if (fit.free.length === 0) return { steps: [], refusal: `${FIT_ROW_TITLE[row]}: ряд уже занимает всё доступное место — заполнять нечего.`, words: '' };

  const units = [...occupied(run, row)].sort((a, b) => a.offsetMm - b.offsetMm);
  const steps: RowFillStep[] = [];
  const words: string[] = [];
  for (const part of fit.free) {
    const widthMm = Math.round(part.toMm - part.fromMm);
    if (widthMm <= 0) continue;
    if (widthMm >= MIN_WIDTH) {
      const widthsMm = evenWidths(widthMm);
      steps.push({ kind: 'add', fromMm: Math.round(part.fromMm), widthsMm });
      words.push(`${widthsMm.length > 1 ? 'корпуса' : 'корпус'} ${widthsMm.join(' + ')} мм с отметки ${Math.round(part.fromMm)}`);
      continue;
    }
    const left: Module | undefined = units.find((unit) => Math.abs(unit.offsetMm + unit.widthMm - part.fromMm) < 0.5);
    const right: Module | undefined = units.find((unit) => Math.abs(unit.offsetMm - part.toMm) < 0.5);
    const near = left?.label ?? right?.label;
    if (left && growable(left, widthMm)) {
      steps.push({ kind: 'grow', moduleId: left.id, label: left.label, offsetMm: left.offsetMm, widthMm: left.widthMm + widthMm, byMm: widthMm });
      words.push(`«${left.label}» шире на ${widthMm} мм: ${left.widthMm} → ${left.widthMm + widthMm}`);
      continue;
    }
    if (right && growable(right, widthMm)) {
      steps.push({ kind: 'grow', moduleId: right.id, label: right.label, offsetMm: right.offsetMm - widthMm, widthMm: right.widthMm + widthMm, byMm: widthMm });
      words.push(`«${right.label}» шире на ${widthMm} мм: ${right.widthMm} → ${right.widthMm + widthMm}`);
      continue;
    }
    if (row === 'base') {
      steps.push({ kind: 'filler', fromMm: Math.round(part.fromMm), widthMm });
      words.push(`доборная планка ${widthMm} мм с отметки ${Math.round(part.fromMm)}`);
      continue;
    }
    return {
      steps: [],
      words: '',
      refusal:
        `${FIT_ROW_TITLE[row]}: на участке ${Math.round(part.fromMm)}…${Math.round(part.toMm)} мм остаётся ${widthMm} мм — ` +
        `это уже самого узкого корпуса (${MIN_WIDTH} мм), а ${near ? `«${near}»` : 'рядом ничего нет, и'} шире не сделать.`,
    };
  }
  if (steps.length === 0) return { steps, words: '', refusal: `${FIT_ROW_TITLE[row]}: заполнять нечего.` };
  return { steps, refusal: null, words: `${title}: ${words.join('; ')}` };
}

/**
 * ДЛИНА ПРАВЛЕНОГО РЯДА ПОД СТЕНУ — БЕЗ ПЕРЕСБОРКИ.
 *
 * Стену домерили или угол занял другое число, а ряд правили: «ряд собран на
 * 2800 мм, а на стене 2850 мм». Единственным выходом была пересборка — и с ней
 * пропадала вся ручная работа. Модули стоят на своих отметках, у ряда меняется
 * только длина: разница становится свободным участком. Короче мебели ряд не
 * делается — отказ числом.
 */
export function fitRunLength(run: Run, usableMm: number): { run: Run } | { refusal: string } {
  const far = [...run.modules].sort((a, b) => b.offsetMm + b.widthMm - (a.offsetMm + a.widthMm))[0];
  if (far && far.offsetMm + far.widthMm > usableMm) {
    return {
      refusal:
        `Ряд не короче мебели: «${far.label}» стоит до ${far.offsetMm + far.widthMm} мм, а места ${usableMm} мм — ` +
        `лишние ${far.offsetMm + far.widthMm - usableMm} мм. Сдвиньте или сузьте этот модуль.`,
    };
  }
  return { run: { ...run, lengthMm: usableMm, residualMm: usableMm - run.modules.reduce((sum, unit) => sum + unit.widthMm, 0) } };
}
