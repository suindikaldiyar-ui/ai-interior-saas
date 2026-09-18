import { ceilingOverSpanMm } from './ceiling';
import { plinthMm } from './shop';
import { GEOMETRY, moduleAppliances } from './modules';
import { moduleCarcassHeightMm, moduleDepthMm, upperBottomFor } from './fill';
import type { Module, Run } from '@/types/millwork';

/**
 * Инварианты ряда. Файл намеренно не зависит ни от чего, кроме отраслевых
 * стандартов: его импортируют и раскладка, и проверки, а взаимный импорт
 * между ними уронил бы модуль на инициализации.
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

/**
 * Что потеряет ряд, если поставить прибор сюда.
 *
 * Ручная позиция сильнее умолчаний, но не сильнее стены: когда прибор
 * встаёт посреди ряда, остальным может не хватить места. Считаем это ДО
 * применения — как и для ширины модуля: правка, которая молча выкидывает
 * посудомойку, показала бы клиенту не тот состав, который он заказывал.
 *
 * Возвращает список приборов, которые пришлось бы выбросить, и сколько
 * миллиметров не хватает.
 */
export function manualAnchorCost(
  before: Run,
  after: Run,
): { dropped: string[]; missingMm: number } {
  const placed = (run: Run) =>
    new Set(
      [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)].flatMap((m) =>
        moduleAppliances(m),
      ) as string[],
    );

  const was = placed(before);
  const now = placed(after);

  /*
   * Вытяжка сюда не входит: она не занимает места в ряду и висит там, где
   * варочная. Если варочная уехала под окно, вытяжки в верхнем ряду не
   * будет — но это повод предупредить, а не запретить перенос: решение
   * принимает замерщик, стоя в квартире.
   */
  const dropped = Array.from(was).filter((a) => a !== 'hood' && !now.has(a));

  const widths: Record<string, number> = {};
  for (const unit of before.modules) {
    if (unit.appliance) widths[unit.appliance] = unit.widthMm;
  }
  const missingMm = dropped.reduce((sum, a) => sum + (widths[a] ?? 0), 0);

  return { dropped, missingMm };
}

/**
 * Стык двух рядов под 90°.
 *
 * Второй ряд ОБЯЗАН быть короче своей стены на глубину первого — иначе
 * модули в углу физически налезают друг на друга. Это не предупреждение:
 * наложение в углу вскрывается на монтаже, когда мебель уже распилена.
 */
export class CornerOverlapError extends Error {
  constructor(
    readonly label: string,
    readonly wallLengthMm: number,
    readonly lostMm: number,
  ) {
    super(
      `${label}: стена ${wallLengthMm} мм, а после стыка с соседним рядом ` +
        `остаётся ${wallLengthMm - lostMm} мм — модули встали бы в углу друг на друга.`,
    );
    this.name = 'CornerOverlapError';
  }
}

export function assertCornerFits(input: {
  label: string;
  wallLengthMm: number;
  /** Глубина соседнего ряда плюс фальш-панель, если она есть. */
  lostMm: number;
  minWidthMm: number;
}): void {
  if (input.wallLengthMm - input.lostMm < input.minWidthMm) {
    throw new CornerOverlapError(input.label, input.wallLengthMm, input.lostMm);
  }
}

/** Сколько раз каждый прибор попал в ряд. В норме — ровно один. */
export function appliancesPlacedOnce(run: Run): Map<string, number> {
  const counts = new Map<string, number>();
  for (const unit of [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)]) {
    // В колонне два прибора: считаем оба, иначе дубль микроволновки
    // пройдёт мимо проверки.
    for (const appliance of moduleAppliances(unit)) {
      counts.set(appliance, (counts.get(appliance) ?? 0) + 1);
    }
  }
  return counts;
}


/* ────────────────  Два модуля в одном объёме  ──────────────── */

/**
 * Габарит модуля в миллиметрах: где он стоит и сколько занимает.
 *
 * Числа те же, что у сцены и у аксонометрии (`runPlaces`): низ ряда
 * от цоколя, верхний ряд от отметки навески, глубина по ряду. Считать
 * габарит здесь второй формулой значило бы проверять не ту мебель,
 * которую рисуем.
 */
function moduleBox(unit: Module, run: Run, upper: boolean) {
  const heightMm = moduleCarcassHeightMm(unit, run);

  /*
   * ГЛУБИНА — ТА ЖЕ, ЧТО У РАСКРОЯ, А НЕ ПРОФИЛЬ ЗОНЫ.
   *
   * Здесь стояло «верхний ряд — `rowDepthMm('upper')`, остальное —
   * `zone.depthMm ?? …`», и оба ответа расходились с той мебелью, которую
   * мы на самом деле строим. Замерено на демо-ряду: у цеха с глубиной
   * 600 весь нижний ряд проверялся по 560 (−40 мм), а антресоль — по
   * глубине верхнего ряда вместо своей настройки (−200 мм при школе
   * 600/300/500 и −240 при 560/320/560).
   *
   * Инвариант, меряющий не ту мебель, хуже его отсутствия: он зелёный
   * там, где шкафы заходят друг в друга. Габарит обязан быть ТОТ ЖЕ, что
   * ушёл в раскрой, — его и спрашиваем.
   */
  const depth = moduleDepthMm(unit, run.zone, run.production);
  const y0 = upper ? upperBottomFor(unit, run) : plinthMm(run.production);

  return {
    id: unit.id,
    label: unit.label || unit.kind,
    x0: unit.offsetMm,
    x1: unit.offsetMm + unit.widthMm,
    y0,
    y1: y0 + heightMm,
    // Перёд у обоих рядов на нуле, корпус уходит от зрителя.
    z0: -depth,
    z1: 0,
  };
}

export type ModuleOverlap = {
  a: string;
  b: string;
  message: string;
};

/** Пересечение по всем трём осям сразу — иначе это соседи, а не наложение. */
function overlapOf(a: ReturnType<typeof moduleBox>, b: ReturnType<typeof moduleBox>) {
  const x = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const y = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  const z = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  // Миллиметр допуска: касание торцами соседних модулей — это не наложение.
  return x > 1 && y > 1 && z > 1 ? { x, y, z } : null;
}

/**
 * Кто с кем пересекается по объёму.
 *
 * Возвращает список, а не бросает: приёмке нужно перечислить все случаи
 * разом, а не падать на первом.
 */
export function moduleOverlaps(run: Run): ModuleOverlap[] {
  const boxes = [
    ...run.modules.map((unit) => moduleBox(unit, run, false)),
    ...run.upperSegments.flatMap((segment) =>
      segment.modules.map((unit) => moduleBox(unit, run, true)),
    ),
  ];

  const found: ModuleOverlap[] = [];

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const hit = overlapOf(boxes[i], boxes[j]);
      if (!hit) continue;

      found.push({
        a: boxes[i].id,
        b: boxes[j].id,
        message:
          `«${boxes[i].label}» и «${boxes[j].label}» занимают один объём: ` +
          `перекрытие ${Math.round(hit.x)}×${Math.round(hit.y)}×${Math.round(hit.z)} мм.`,
      });
    }
  }

  return found;
}

export class ModuleOverlapError extends Error {
  constructor(readonly overlaps: ModuleOverlap[]) {
    super(
      `Два модуля в одном объёме: ${overlaps.map((o) => o.message).join(' ')} ` +
        'Такую мебель нельзя ни собрать, ни повесить, а смета и раскрой ' +
        'посчитают корпус дважды.',
    );
    this.name = 'ModuleOverlapError';
  }
}

/**
 * НИ ОДИН МОДУЛЬ НЕ ПЕРЕСЕКАЕТСЯ С ДРУГИМ.
 *
 * Проверка ОБЩАЯ, а не «верхний против пенала». Частный случай нашёлся
 * так: верхний ряд вешался поверх колонн во всю высоту — механизм разрыва
 * применялся к окну и не применялся к пеналам. Заплатка на этот случай
 * оставила бы все остальные, которых мы ещё не видели.
 *
 * Это ИСКЛЮЧЕНИЕ, а не предупреждение, по тому же правилу, что и
 * `assertRunFits`: мебель, которую нельзя собрать, не должна доехать ни до
 * чертежа, ни до сметы. На фасаде наложение читается безобидной
 * антресолью — глазами такое не ловится, только счётом.
 */
export function assertNoOverlap(run: Run): void {
  const overlaps = moduleOverlaps(run);
  if (overlaps.length > 0) throw new ModuleOverlapError(overlaps);
}

/* ────────────────  Мебель под потолком  ──────────────── */

export type BeamHit = {
  moduleId: string;
  message: string;
};

/**
 * НИ ОДИН МОДУЛЬ НЕ ПРОХОДИТ СКВОЗЬ РИГЕЛЬ.
 *
 * Выступ на потолке — физическое препятствие: шкаф, который по расчёту
 * заходит в него на сорок миллиметров, на объекте просто не встанет, а
 * узнают об этом, когда он уже распилен и привезён.
 *
 * Габарит берётся ТОТ ЖЕ, что у проверки непересечения модулей, а
 * доступная высота — та же `ceilingOverSpanMm`, по которой считалась
 * высота корпуса. Вторая формула здесь означала бы проверку не той
 * мебели, которую собрали.
 */
export function beamHits(run: Run): BeamHit[] {
  if (!run.beams || run.beams.length === 0) return [];

  const boxes = [
    ...run.modules.map((unit) => moduleBox(unit, run, false)),
    ...run.upperSegments.flatMap((segment) =>
      segment.modules.map((unit) => moduleBox(unit, run, true)),
    ),
  ];

  const found: BeamHit[] = [];

  for (const box of boxes) {
    const ceiling = ceilingOverSpanMm(box.x0, box.x1, run.beams, run.ceilingHeightMm);
    const over = Math.round(box.y1 - ceiling);
    if (over <= 0) continue;

    found.push({
      moduleId: box.id,
      message:
        `«${box.label}» заходит в выступ на потолке на ${over} мм: ` +
        `верх модуля на ${Math.round(box.y1)} мм, а потолок там ${Math.round(ceiling)} мм.`,
    });
  }

  return found;
}

export class BeamOverlapError extends Error {
  constructor(readonly hits: BeamHit[]) {
    super(
      `Мебель упирается в выступ на потолке: ${hits.map((h) => h.message).join(' ')} ` +
        'Такой шкаф не встанет на объекте, а в цех он уедет распиленным.',
    );
    this.name = 'BeamOverlapError';
  }
}

/**
 * МОДУЛЬ, РАЗДАВЛЕННЫЙ РИГЕЛЕМ, — ЭТО НЕ «ШКАФ НИЖЕ».
 *
 * Высоту под выступом урезает `capByCeiling`, и ноль там — законный
 * ответ: под ригелем может не остаться места вовсе. Убрать такой модуль
 * обязана раскладка — `buildUpperRow` разрывает верхний ряд ровно так
 * же, как под окном.
 *
 * НИЖНИЙ ряд не разрывается никем: мойку и варочную из кухни не выкинешь.
 * И пока этого не было сказано, ригель до пола давал корпуса нулевой
 * высоты, которые уезжали в раскрой отдельными строками. Замерено на
 * демо-ряду, свес 2600: семь модулей высотой 0 и двадцать деталей с
 * неположительным размером — по ним распилили бы плиту.
 *
 * Высоту спрашиваем ТУ ЖЕ, что уходит в раскрой, а предел — тот же
 * `GEOMETRY.upper.minCarcassH`, по которому рвётся верхний ряд: второго
 * числа «полезный минимум» в продукте нет.
 */
export function beamCrushes(run: Run): BeamHit[] {
  if (!run.beams || run.beams.length === 0) return [];

  const found: BeamHit[] = [];

  for (const unit of run.modules) {
    const heightMm = moduleCarcassHeightMm(unit, run);
    if (heightMm >= GEOMETRY.upper.minCarcassH) continue;

    const ceiling = ceilingOverSpanMm(
      unit.offsetMm,
      unit.offsetMm + unit.widthMm,
      run.beams,
      run.ceilingHeightMm,
    );

    found.push({
      moduleId: unit.id,
      message:
        `под выступом на «${unit.label}» остаётся ${Math.round(heightMm)} мм — ` +
        `корпуса ниже ${GEOMETRY.upper.minCarcassH} мм не бывает. ` +
        `Потолок там ${Math.round(ceiling)} мм: мебель под этот выступ не встаёт.`,
    });
  }

  return found;
}

export function assertUnderCeiling(run: Run): void {
  const hits = [...beamHits(run), ...beamCrushes(run)];
  if (hits.length > 0) throw new BeamOverlapError(hits);
}
