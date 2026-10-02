import { cornerBandMm } from './corner';
import { bearsCountertop, counterSlabDepthMm, rowStandardDepthMm } from './fill';
import { standsOnFloor } from './modules';
import type { Run } from '@/types/millwork';

/**
 * ГДЕ ЛЕЖИТ СТОЛЕШНИЦА — ОДИН ОТВЕТ НА СМЕТУ И НА СЦЕНУ.
 *
 * Смета считала столешницу по модулям, которые её несут, а сцена клала
 * одну плиту на всю длину ряда — сквозь колонну холодильника. Пока ряд
 * шёл вплотную, разница пряталась внутри колонн (на демо 3800 против
 * 2600 мм), а с пустотами всплыла: карточка «уже» показывала дешевле на
 * столешницу, которая на деле не укоротилась.
 *
 * Правило одно:
 *   плита идёт по модулям, которые её несут, и СПЛОШНАЯ над пустотой
 *   между ними — это будущее место модуля, а не разрыв;
 *   плиту рвёт то, что её не несёт: колонна во всю высоту;
 *   у прямой кухни за крайним модулем плиты нет — там не собрано
 *   (ловушка 230);
 *   в углу (слой 55) плиту на всю глубину угла даёт ВЛАДЕЛЕЦ угла, а
 *   ряд, который к нему стыкуется, заходит назад ровно до её края
 *   (`cornerBandMm`); отдельным куском, если первая плита ряда до угла
 *   не доходит;
 *   у ряда угловой кухни плита доходит до стены (слой 55): хвост меньше
 *   150 мм закрывает добор (`counterTailsOf`), больший — плита над
 *   пустотой, которую человек вправе снять (`Run.counterEnds`).
 *
 * Отметки — в миллиметрах от начала ряда; отрицательная — заход в угол.
 */
export type CounterSlab = { fromMm: number; toMm: number };

/**
 * ХВОСТ МЕНЬШЕ ЭТОГО ЗАКРЫВАЕТ ДОБОР — число задачи слоя 55.
 *
 * Оно же — самый узкий корпус (`MIN_WIDTH`): в хвост уже 150 мм модуль
 * не встанет, а пустая щель у стены под плитой — это щель.
 */
export const TAIL_FILLER_MAX_MM = 150;

/**
 * Утопление цоколя от лицевой плоскости корпуса — картинка, не замер.
 *
 * Жило числом в сцене (`plinthSetbackM`); теперь его спрашивает и место
 * цоколя в углу (`plinthSpans`), а второго числа заводить нельзя.
 */
export const PLINTH_SETBACK_MM = 50;

type RunLike = Pick<Run, 'modules' | 'lengthMm' | 'corner' | 'zone' | 'ceilingHeightMm' | 'production'> &
  Partial<Run>;

/**
 * ХВОСТЫ РЯДА У СТЕНЫ — ГДЕ ПЛИТА ДОЛЖНА ДОЙТИ ДО КОНЦА РЯДА.
 *
 * Только у ряда угловой кухни: у прямой правило прежнее, за крайним
 * модулем плиты нет (ловушка 230, задача слоя 55 прямые не трогает).
 *
 * Конец ряда — стена комнаты или угол. Хвост — от крайнего модуля, несущего
 * столешницу, до конца ряда. Меньше 150 мм — плита до стены, под ней
 * добор; больше — плита над пустотой, и человек вправе её снять. У конца,
 * где угол, плиту не снимают: она и есть стык с соседней.
 */
export type CounterTail = {
  end: 'start' | 'end';
  /** От крайнего модуля до конца ряда, мм. */
  widthMm: number;
  /** Хвост закрывает добор (меньше 150 мм). */
  filler: boolean;
  /** Конец ряда — угол (стык с соседней плитой), а не стена комнаты. */
  corner: boolean;
  /** Отметки хвоста в координатах ряда. */
  fromMm: number;
  toMm: number;
};

export function counterTailsOf(run: RunLike): CounterTail[] {
  if (!run.corner) return [];
  const bearing = [...run.modules]
    .filter((unit) => bearsCountertop(unit, run))
    .sort((a, b) => a.offsetMm - b.offsetMm);
  if (bearing.length === 0) return [];

  const floor = [...run.modules].filter((unit) => standsOnFloor(unit)).sort((a, b) => a.offsetMm - b.offsetMm);
  const tails: CounterTail[] = [];

  /* Начало: крайний модуль у начала ряда несёт плиту — иначе это колонна. */
  const first = floor[0];
  if (first && bearing[0] === first && first.offsetMm > 0) {
    tails.push({
      end: 'start',
      widthMm: first.offsetMm,
      filler: first.offsetMm < TAIL_FILLER_MAX_MM,
      corner: Boolean(run.corner.dock),
      fromMm: 0,
      toMm: first.offsetMm,
    });
  }

  const last = floor[floor.length - 1];
  const lastEnd = last ? last.offsetMm + last.widthMm : 0;
  if (last && bearing[bearing.length - 1] === last && lastEnd < run.lengthMm) {
    tails.push({
      end: 'end',
      widthMm: run.lengthMm - lastEnd,
      filler: run.lengthMm - lastEnd < TAIL_FILLER_MAX_MM,
      corner: Boolean(run.corner.own),
      fromMm: lastEnd,
      toMm: run.lengthMm,
    });
  }

  return tails;
}

/** Где доборы хвостов: только у хвостов меньше 150 мм, под плитой. */
export function tailFillersOf(run: RunLike): { fromMm: number; toMm: number }[] {
  return counterTailsOf(run)
    .filter((tail) => tail.filler)
    .map((tail) => ({ fromMm: tail.fromMm, toMm: tail.toMm }));
}

export function countertopSlabs(run: RunLike): CounterSlab[] {
  const sorted = [...run.modules].sort((a, b) => a.offsetMm - b.offsetMm);
  const slabs: CounterSlab[] = [];
  let open: CounterSlab | null = null;

  for (const unit of sorted) {
    if (bearsCountertop(unit, run)) {
      const to = unit.offsetMm + unit.widthMm;
      if (open) open.toMm = to;
      else open = { fromMm: unit.offsetMm, toMm: to };
    } else if (open) {
      slabs.push(open);
      open = null;
    }
  }
  if (open) slabs.push(open);

  /* Пустой ряд угла не получает: заход — это плита НАД мебелью. */
  if (slabs.length === 0) return [];

  /*
   * ХВОСТЫ У СТЕНЫ (слой 55): плита идёт до конца ряда, если человек
   * её не снял. У угла её не снимают — это стык с соседней плитой.
   */
  for (const tail of counterTailsOf(run)) {
    const cut = !tail.filler && !tail.corner && run.counterEnds?.[tail.end] === 'cut';
    if (cut) continue;
    if (tail.end === 'start') slabs[0] = { ...slabs[0], fromMm: 0 };
    else slabs[slabs.length - 1] = { ...slabs[slabs.length - 1], toMm: run.lengthMm };
  }

  const band = cornerBandMm({
    corner: run.corner,
    bandDepthMm: counterSlabDepthMm(run.zone, run.production),
    zone: run.zone,
    production: run.production,
  });

  if (band.backMm > 0) {
    if (slabs[0].fromMm === 0) slabs[0] = { ...slabs[0], fromMm: -band.backMm };
    else slabs.unshift({ fromMm: -band.backMm, toMm: 0 });
  }

  return slabs.filter((slab) => slab.toMm > slab.fromMm);
}

/** Сколько столешницы, мм: сумма плит. */
export function countertopLengthMm(run: Parameters<typeof countertopSlabs>[0]): number {
  return countertopSlabs(run).reduce((sum, slab) => sum + slab.toMm - slab.fromMm, 0);
}

/**
 * ФАРТУК — ГДЕ ОН ЛЕЖИТ НА СТЕНЕ. ОДНА ФУНКЦИЯ НА СЦЕНУ И СМЕТУ (слой 55).
 *
 * Сцена рисовала фартук на всю длину ряда — за колонной холодильника и
 * без верхнего ряда тоже, — а смета брала его по длине столешницы и
 * только при верхнем ряде. Теперь ответ один: фартук лежит на стене над
 * столешницей и только там, где есть верхний ряд (полоса между плитой и
 * низом навесных).
 *
 * В углу фартук стены, которая стыкуется к владельцу, идёт до самой стены
 * владельца: над угловой плитой владельца эта стена тоже открыта. Фартук
 * владельца идёт до стены соседа. Встречаются они по линии угла —
 * отметки на поверхностях двух стен, без щели и без нахлёста.
 */
export function apronSpans(run: RunLike): CounterSlab[] {
  if (!run.options?.hasUpper) return [];
  const slabs = countertopSlabs(run);
  if (slabs.length === 0) return [];

  const band = cornerBandMm({
    corner: run.corner,
    bandDepthMm: counterSlabDepthMm(run.zone, run.production),
    zone: run.zone,
    production: run.production,
  });
  if (band.backMm <= 0) return slabs;

  /* Заход угла у стыкующегося ряда — до стены владельца целиком. */
  const lostMm = band.backMm + counterSlabDepthMm(run.zone, run.production);
  return slabs.map((slab, i) => (i === 0 && slab.fromMm === -band.backMm ? { ...slab, fromMm: -lostMm } : slab));
}

/** Сколько фартука, мм — то же число в сцене и в смете. */
export function apronLengthMm(run: RunLike): number {
  return apronSpans(run).reduce((sum, span) => sum + span.toMm - span.fromMm, 0);
}

/**
 * ЦОКОЛЬ — ГДЕ ОН СТОИТ. ОДНА ФУНКЦИЯ НА СЦЕНУ (и на смету, когда у
 * цоколя появится строка — сегодня её нет, BLOCKED BY, слой 55).
 *
 * Цоколь идёт под тем, что стоит на полу, сплошной полосой по соседним
 * модулям и рвётся пустотой: под пустым местом его не на что крепить.
 * Сцена рисовала одну планку на всю длину ряда — и под пустотой тоже.
 *
 * В углу правило то же, что у плиты: владелец идёт до стены соседа,
 * стыкующийся ряд заходит назад до лицевой плоскости цоколя владельца.
 */
export function plinthSpans(run: RunLike): CounterSlab[] {
  const floor = [...run.modules]
    .filter((unit) => standsOnFloor(unit))
    .sort((a, b) => a.offsetMm - b.offsetMm);
  const spans: CounterSlab[] = [];
  for (const unit of floor) {
    const last = spans[spans.length - 1];
    const to = unit.offsetMm + unit.widthMm;
    if (last && unit.offsetMm <= last.toMm) last.toMm = Math.max(last.toMm, to);
    else spans.push({ fromMm: unit.offsetMm, toMm: to });
  }
  if (spans.length === 0) return [];

  /*
   * Хвост с добором у стены: добор стоит на цоколе, как модуль, — иначе
   * под ним снизу щель.
   */
  for (const filler of tailFillersOf(run)) {
    if (filler.fromMm === 0 && spans[0].fromMm === filler.toMm) spans[0].fromMm = 0;
    const last = spans[spans.length - 1];
    if (filler.toMm === run.lengthMm && last.toMm === filler.fromMm) last.toMm = run.lengthMm;
  }

  const band = cornerBandMm({
    corner: run.corner,
    bandDepthMm: rowStandardDepthMm(run.zone, 'base', run.production) - PLINTH_SETBACK_MM,
    zone: run.zone,
    production: run.production,
  });
  if (band.backMm > 0) {
    if (spans[0].fromMm === 0) spans[0] = { ...spans[0], fromMm: -band.backMm };
    else spans.unshift({ fromMm: -band.backMm, toMm: 0 });
  }
  return spans.filter((span) => span.toMm > span.fromMm);
}
