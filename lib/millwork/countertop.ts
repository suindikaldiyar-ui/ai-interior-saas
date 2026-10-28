import { cornerBandMm, cornerOwnerOf, lowerGapMm, sideAt } from './corner';
import { bearsCountertop, counterSlabDepthMm, moduleDepthMm, rowStandardDepthMm, upperBottomFor } from './fill';
import { standsOnFloor } from './modules';
import { obstaclesInBand, wallObstacles, type WallObstacle } from './obstacles';
import { countertopMm, countertopStripOf, plinthMm, upperBottomMm, workTopMm } from './shop';
import { vitrineOnCounter } from './vitrine';
import { islandDepthMm, islandOvalOf, islandReachMm, ovalPath } from './island';
import {
  curvedLengthOf,
  frontArcCenter,
  pathArc,
  pathBounds,
  pathLine,
  plinthOutline,
  translatePath,
  type PathSeg,
  type PlanPath,
  type PlanPoint,
} from './radius';
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
 *   пустотой, которую человек вправе снять (`Run.counterEnds`);
 *   сквозь колонну, короб и выступ стены плита не идёт никогда (слой 56):
 *   полоса плиты перед препятствием не уже настройки цеха
 *   (`countertopStrip`, типовая 300 мм) — ВЫРЕЗ, плита обходит его сзади
 *   и остаётся одной (`cuts`); уже или вынос не замерен — РАЗРЫВ, две
 *   плиты с торцами. Решает `counterObstacles`.
 *
 * Отметки — в миллиметрах от начала ряда; отрицательная — заход в угол.
 */
export type CounterSlab = {
  fromMm: number;
  toMm: number;
  /** Вырезы сзади под препятствия у стены: где и на сколько плита мельче. */
  cuts?: CounterCut[];
  /**
   * КОНТУР ПЛИТЫ НАД РАДИУСНЫМИ МОДУЛЯМИ (OVAL & RADIUS) — мм ряда: x вдоль
   * ряда, z — 0 на лицевой плоскости корпусов, к стене минус. Есть только у
   * плиты, под которой стоит радиусный модуль (`slabOutline`): её режут по
   * дуге, и рисуют контуром. `fromMm` и `toMm` — габарит контура по ряду.
   */
  outline?: PlanPath;
};

/** Вырез плиты под препятствие: отрезок ряда и глубина выреза от стены. */
export type CounterCut = { fromMm: number; toMm: number; depthMm: number; reason: string };

/** Что заходит в полосу высот полосы ряда — колонна, короб, выступ стены. */
function obstaclesAt(run: RunLike, bottomMm: number, topMm: number): WallObstacle[] {
  return obstaclesInBand(wallObstacles(run.obstacles, run.ceilingHeightMm), { row: 'base', bottomMm, topMm });
}

/** Полосы минус отрезки препятствий: там, где стоит препятствие, полосы нет. */
function withoutObstacles<T extends { fromMm: number; toMm: number }>(
  spans: T[],
  obstacles: { from: number; to: number }[],
): T[] {
  let out = spans;
  for (const obstacle of obstacles) {
    out = out.flatMap((span) => {
      if (obstacle.to <= span.fromMm || obstacle.from >= span.toMm) return [span];
      const pieces: T[] = [];
      if (obstacle.from > span.fromMm) pieces.push({ ...span, toMm: obstacle.from });
      if (obstacle.to < span.toMm) pieces.push({ ...span, fromMm: obstacle.to });
      return pieces;
    });
  }
  return out;
}

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

  /*
   * Начало: крайний модуль у начала ряда несёт плиту — иначе это колонна.
   * Скруглённый торец (OVAL & RADIUS) — сам конец плиты: она идёт по его дуге,
   * а не до стены.
   */
  const first = floor[0];
  if (first && bearing[0] === first && first.offsetMm > 0 && first.radius?.place !== 'left') {
    tails.push({
      end: 'start',
      widthMm: first.offsetMm,
      filler: first.offsetMm < TAIL_FILLER_MAX_MM,
      corner: Boolean(run.corner.start),
      fromMm: 0,
      toMm: first.offsetMm,
    });
  }

  const last = floor[floor.length - 1];
  const lastEnd = last ? last.offsetMm + last.widthMm : 0;
  if (last && bearing[bearing.length - 1] === last && lastEnd < run.lengthMm && last.radius?.place !== 'right') {
    tails.push({
      end: 'end',
      widthMm: run.lengthMm - lastEnd,
      filler: run.lengthMm - lastEnd < TAIL_FILLER_MAX_MM,
      corner: Boolean(run.corner.end),
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

/** Плиты по модулям, хвостам и углу — ДО препятствий: их обходит `countertopSlabs`. */
function slabsOverModules(run: RunLike): CounterSlab[] {
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

  /*
   * ПЛИТА — СВОЙ КОНТУР (P0): через угол идёт плита той стены, что выбрана
   * для плиты (`owners.countertop`, умолчание — кто ведёт низ). Она заходит
   * до стены соседа, даже если её нижний ряд к углу стыкуется; плита второго
   * ряда кончается по её краю, даже если её нижний ряд идёт в угол.
   */
  const band = cornerBandMm({
    corner: run.corner,
    bandDepthMm: counterSlabDepthMm(run.zone, run.production),
    zone: run.zone,
    production: run.production,
    level: 'countertop',
  });

  return reachCorners(slabs, band, run.lengthMm);
}

/**
 * ПОЛОСА У УГЛОВ — ТЕМ, ЧТО ОТДАЛ `cornerBandMm`: плюс — заход за край ряда,
 * минус — не доходит до него. У начала плита ряда, начатая не с нуля, —
 * отдельным куском; у конца — так же.
 */
function reachCorners(spans: CounterSlab[], band: { startMm: number; endMm: number }, lengthMm: number): CounterSlab[] {
  let out = [...spans];
  if (out.length === 0) return out;
  if (band.startMm > 0) {
    if (out[0].fromMm === 0) out[0] = { ...out[0], fromMm: -band.startMm };
    else out.unshift({ fromMm: -band.startMm, toMm: 0 });
  } else if (band.startMm < 0) {
    out = out.map((span) => ({ ...span, fromMm: Math.max(span.fromMm, -band.startMm) })).filter((span) => span.toMm > span.fromMm);
  }
  if (out.length === 0) return out;
  const last = out.length - 1;
  if (band.endMm > 0) {
    if (out[last].toMm === lengthMm) out[last] = { ...out[last], toMm: lengthMm + band.endMm };
    else out.push({ fromMm: lengthMm, toMm: lengthMm + band.endMm });
  } else if (band.endMm < 0) {
    out = out.map((span) => ({ ...span, toMm: Math.min(span.toMm, lengthMm + band.endMm) })).filter((span) => span.toMm > span.fromMm);
  }
  return out;
}

/** Препятствие в толщине столешницы и что с ним делает плита (слой 56). */
export type CounterObstacle = {
  obstacle: WallObstacle;
  /** Полоса плиты перед препятствием, мм. `null` — вынос не замерен. */
  stripMm: number | null;
  /** Полоса, начиная с которой плита вырезается: настройка цеха. */
  minStripMm: number;
  /** Цех подтвердил полосу. Нет — «не подтверждено цехом». */
  confirmed: boolean;
  /** Вырез — плита одна и обходит препятствие сзади; разрыв — две плиты с торцами. */
  decision: 'cut' | 'break';
};

/**
 * ЧТО ПЛИТА ДЕЛАЕТ У ПРЕПЯТСТВИЯ — ОДИН ОТВЕТ НА ПЛИТЫ, СМЕТУ И СЛОВА.
 *
 * Сквозь колонну, короб и выступ стены плита не идёт никогда. Перед
 * препятствием остаётся полоса плиты — её глубина минус вынос. Не уже
 * настройки цеха (`countertopStrip`, типовая 300 мм) — вырез: плита одна
 * и обходит препятствие сзади. Уже или вынос не замерен — разрыв: узкая
 * полоса без опоры снизу ломается, и плиты две, с торцами у препятствия.
 *
 * Только препятствия, над которыми плита и правда лежит: за крайним
 * модулем плиты нет, и решать там нечего.
 */
export function counterObstacles(run: RunLike): CounterObstacle[] {
  const slabs = slabsOverModules(run);
  if (slabs.length === 0) return [];
  const slabDepthMm = counterSlabDepthMm(run.zone, run.production);
  const strip = countertopStripOf(run.production);
  const top = workTopMm(run.production);
  return obstaclesAt(run, top - countertopMm(run.production), top)
    .filter((obstacle) => slabs.some((slab) => obstacle.from < slab.toMm && obstacle.to > slab.fromMm))
    .map((obstacle) => {
      const stripMm = obstacle.depthMm === null ? null : slabDepthMm - obstacle.depthMm;
      return {
        obstacle,
        stripMm,
        minStripMm: strip.minStripMm,
        confirmed: strip.confirmed,
        decision: stripMm !== null && stripMm > 0 && stripMm >= strip.minStripMm ? ('cut' as const) : ('break' as const),
      };
    });
}

export function countertopSlabs(run: RunLike): CounterSlab[] {
  const slabs = slabsOverModules(run);
  if (slabs.length === 0) return [];

  const decided = counterObstacles(run);
  const breaks = decided.filter((item) => item.decision === 'break').map((item) => item.obstacle);
  const notches = decided.filter((item) => item.decision === 'cut').map((item) => item.obstacle);

  return withoutObstacles(slabs, breaks)
    .filter((slab) => slab.toMm > slab.fromMm)
    .map((slab) => {
      const cuts = notches
        .filter((obstacle) => obstacle.from < slab.toMm && obstacle.to > slab.fromMm)
        .map((obstacle) => ({
          fromMm: Math.max(slab.fromMm, obstacle.from),
          toMm: Math.min(slab.toMm, obstacle.to),
          depthMm: obstacle.depthMm!,
          reason: obstacle.reason,
        }));
      const withCuts: CounterSlab = cuts.length > 0 ? { ...slab, cuts } : slab;
      /*
       * ПЛИТА НАД РАДИУСНЫМ МОДУЛЕМ — КОНТУРОМ (OVAL & RADIUS): у скруглённого
       * торца она выходит за модуль на свес и по дуге, и её габарит по ряду —
       * габарит контура: столько плиты и покупают.
       */
      const outline = run.island ? islandSlabOutline(run, withCuts) : slabOutline(run, withCuts);
      if (!outline) return withCuts;
      const bounds = pathBounds(outline);
      return { ...withCuts, fromMm: Math.round(bounds.minX * 10) / 10, toMm: Math.round(bounds.maxX * 10) / 10, outline };
    });
}

/**
 * КОНТУР ПЛИТЫ НАД РАДИУСНЫМИ МОДУЛЯМИ — ОДИН НА СЦЕНУ, СМЕТУ И ЛИСТ.
 *
 * Дуга плиты — того же центра, что дуга корпуса, радиусом больше на свес:
 * фасад и свес плиты (`counterSlabDepthMm` минус глубина ряда) — плита обходит
 * гнутую дверцу на те же 25 мм, что прямой фасад. Скруглённый торец — дугой до
 * боковины и дальше вдоль неё до стены (сбоку плита выходит за модуль на
 * свес); фасад дугой — дугой между точками, где она встречает фасадную линию
 * соседей. Сзади — у стены, с вырезами под препятствия (`slabPieces`). Под
 * плитой нет радиусного модуля — `null`: её рисуют куски, как раньше.
 */
export function slabOutline(run: RunLike, slab: CounterSlab): PlanPath | null {
  const round = run.modules
    .filter(
      (unit) =>
        unit.radius &&
        bearsCountertop(unit, run) &&
        unit.offsetMm < slab.toMm &&
        unit.offsetMm + unit.widthMm > slab.fromMm,
    )
    .sort((a, b) => a.offsetMm - b.offsetMm);
  /* Скруглённый угол плиты у свободного конца ряда — тоже контур (`counterCornerOf`). */
  const rStart = slabCorner(run, slab, 'start');
  const rEnd = slabCorner(run, slab, 'end');
  if (round.length === 0 && !rStart && !rEnd) return null;

  const depthMm = rowStandardDepthMm(run.zone, 'base', run.production);
  const reach = counterSlabDepthMm(run.zone, run.production) - depthMm;
  const backZ = -depthMm;
  const leftEnd = round.find((unit) => unit.radius!.place === 'left' && unit.offsetMm === slab.fromMm);
  const rightEnd = round.find((unit) => unit.radius!.place === 'right' && unit.offsetMm + unit.widthMm === slab.toMm);

  const segs: PathSeg[] = [];
  let start: PlanPoint;
  let cursor: PlanPoint;
  if (leftEnd) {
    const R = leftEnd.radius!.radiusMm;
    const c: PlanPoint = [leftEnd.offsetMm + R, -R];
    start = [c[0] - (R + reach), -R];
    segs.push(...pathArc(c, R + reach, Math.PI, Math.PI / 2));
    cursor = [c[0], reach];
  } else if (rStart) {
    start = [slab.fromMm, reach - rStart];
    segs.push(...pathArc([slab.fromMm + rStart, reach - rStart], rStart, Math.PI, Math.PI / 2));
    cursor = [slab.fromMm + rStart, reach];
  } else {
    start = [slab.fromMm, reach];
    cursor = start;
  }
  cursor = frontArcSegs(round, reach, cursor, segs);
  let end: PlanPoint;
  if (rightEnd) {
    const R = rightEnd.radius!.radiusMm;
    const c: PlanPoint = [rightEnd.offsetMm + rightEnd.widthMm - R, -R];
    segs.push(...pathLine(cursor, [c[0], reach]));
    segs.push(...pathArc(c, R + reach, Math.PI / 2, 0));
    end = [c[0] + R + reach, -R];
  } else if (rEnd) {
    segs.push(...pathLine(cursor, [slab.toMm - rEnd, reach]), ...pathArc([slab.toMm - rEnd, reach - rEnd], rEnd, Math.PI / 2, 0));
    end = [slab.toMm, reach - rEnd];
  } else {
    segs.push(...pathLine(cursor, [slab.toMm, reach]));
    end = [slab.toMm, reach];
  }
  /* Правая сторона до стены, задняя — справа налево с вырезами, левая — от стены. */
  segs.push(...pathLine(end, [end[0], backZ]));
  let at: PlanPoint = [end[0], backZ];
  for (const cut of [...(slab.cuts ?? [])].sort((a, b) => b.fromMm - a.fromMm)) {
    const inner = backZ + cut.depthMm;
    segs.push(...pathLine(at, [cut.toMm, backZ]), ...pathLine([cut.toMm, backZ], [cut.toMm, inner]), ...pathLine([cut.toMm, inner], [cut.fromMm, inner]));
    segs.push(...pathLine([cut.fromMm, inner], [cut.fromMm, backZ]));
    at = [cut.fromMm, backZ];
  }
  segs.push(...pathLine(at, [start[0], backZ]), ...pathLine([start[0], backZ], start));
  return segs;
}

/**
 * ФАСАДЫ ДУГОЙ ПОД ПЛИТОЙ — дуги плиты того же центра, радиусом больше на
 * свес (у вогнутой — меньше), между точками, где они встречают фасадную
 * линию соседей. Одна функция на плиту ряда у стены и плиту острова.
 * Отрезки кладутся в `segs`; возвращается, где кончилась фасадная линия.
 */
function frontArcSegs(round: Run['modules'], reach: number, from: PlanPoint, segs: PathSeg[]): PlanPoint {
  let cursor = from;
  for (const unit of round) {
    if (unit.radius!.place !== 'front') continue;
    const convex = unit.radius!.direction !== 'concave';
    const R = unit.radius!.radiusMm;
    const local = frontArcCenter(unit.widthMm, R, convex);
    const c: PlanPoint = [unit.offsetMm + local[0], local[1]];
    const r = convex ? R + reach : R - reach;
    const dz = reach - c[1];
    const dx = Math.sqrt(Math.max(0, r * r - dz * dz));
    /* Где дуга плиты встречает фасадную линию соседей; соседняя дуга уже ушла дальше — с её конца. */
    const xa = Math.max(c[0] - dx, cursor[0]);
    const xb = c[0] + dx;
    const za = c[1] + (convex ? 1 : -1) * Math.sqrt(Math.max(0, r * r - (xa - c[0]) ** 2));
    segs.push(...pathLine(cursor, [xa, reach]));
    if (Math.abs(za - reach) > 1e-6) segs.push(...pathLine([xa, reach], [xa, za]));
    segs.push(...pathArc(c, r, Math.atan2(za - c[1], xa - c[0]), Math.atan2(dz, dx)));
    cursor = [xb, reach];
  }
  return cursor;
}

/**
 * КОНТУР СТОЛЕШНИЦЫ ОСТРОВА — ВСЕГДА КОНТУРОМ (OVAL & RADIUS).
 *
 * У острова нет стены: плита выходит за корпус и спереди (фасад и свес), и
 * сзади (панель тыла и свес с тыла, `islandReachMm`). Скруглённый торец
 * плита обходит дугами тех же центров, что дуги корпуса: спереди и сзади —
 * четверти одного радиуса R + меньший из свесов, а разница свесов — прямой
 * вдоль торца между ними, с касанием на обоих концах. Овал — своим контуром
 * из четырёх дуг (`islandOvalOf`). Без модулей плиты нет.
 */
function islandSlabOutline(run: RunLike, slab: CounterSlab): PlanPath | null {
  const oval = islandOvalOf(run);
  if (oval) return ovalPath(oval);
  const depthMm = rowStandardDepthMm(run.zone, 'base', run.production);
  const { front: reach, back } = islandReachMm(run);
  const backZ = -depthMm - back;
  const m = Math.min(reach, back);
  /*
   * Торец плиты над скруглённым торцом острова. Только передний угол — дуга
   * R + свес центра (cx, −R), дальше прямой бок до тыла. Оба угла — четверти
   * одного радиуса R + меньший свес: передняя сдвинута к фасаду, задняя — к
   * тылу на разницу свесов, между ними прямой вдоль торца.
   */
  const endOf = (unit: Run['modules'][number], side: 'left' | 'right') => {
    const R = unit.radius!.radiusMm;
    const cx = side === 'left' ? unit.offsetMm + R : unit.offsetMm + unit.widthMm - R;
    if (!unit.radius!.back) return { cx, front: -R, back: null, r: R + reach };
    return { cx, front: -R + (reach - m), back: -depthMm + R - (back - m), r: R + m };
  };
  const leftUnit = run.modules.find((unit) => unit.radius?.place === 'left' && unit.offsetMm === slab.fromMm);
  const rightUnit = run.modules.find((unit) => unit.radius?.place === 'right' && unit.offsetMm + unit.widthMm === slab.toMm);
  const left = leftUnit ? endOf(leftUnit, 'left') : null;
  const right = rightUnit ? endOf(rightUnit, 'right') : null;
  /* Прямой торец острова со скруглёнными углами плиты — передний и задний одного радиуса (`counterCornerOf`). */
  const rStart = left ? null : slabCorner(run, slab, 'start');
  const rEnd = right ? null : slabCorner(run, slab, 'end');

  const segs: PathSeg[] = [];
  const start: PlanPoint = left ? [left.cx - left.r, left.front] : rStart ? [slab.fromMm, reach - rStart] : [slab.fromMm, reach];
  let cursor: PlanPoint = start;
  if (left) {
    segs.push(...pathArc([left.cx, left.front], left.r, Math.PI, Math.PI / 2));
    cursor = [left.cx, reach];
  } else if (rStart) {
    segs.push(...pathArc([slab.fromMm + rStart, reach - rStart], rStart, Math.PI, Math.PI / 2));
    cursor = [slab.fromMm + rStart, reach];
  }
  const round = run.modules
    .filter((unit) => unit.radius?.place === 'front' && bearsCountertop(unit, run) && unit.offsetMm < slab.toMm && unit.offsetMm + unit.widthMm > slab.fromMm)
    .sort((a, b) => a.offsetMm - b.offsetMm);
  cursor = frontArcSegs(round, reach, cursor, segs);

  let backFrom: number;
  if (right) {
    segs.push(...pathLine(cursor, [right.cx, reach]), ...pathArc([right.cx, right.front], right.r, Math.PI / 2, 0));
    if (right.back !== null) {
      segs.push(...pathLine([right.cx + right.r, right.front], [right.cx + right.r, right.back]));
      segs.push(...pathArc([right.cx, right.back], right.r, 0, -Math.PI / 2));
      backFrom = right.cx;
    } else {
      segs.push(...pathLine([right.cx + right.r, right.front], [right.cx + right.r, backZ]));
      backFrom = right.cx + right.r;
    }
  } else if (rEnd) {
    segs.push(...pathLine(cursor, [slab.toMm - rEnd, reach]), ...pathArc([slab.toMm - rEnd, reach - rEnd], rEnd, Math.PI / 2, 0));
    segs.push(...pathLine([slab.toMm, reach - rEnd], [slab.toMm, backZ + rEnd]), ...pathArc([slab.toMm - rEnd, backZ + rEnd], rEnd, 0, -Math.PI / 2));
    backFrom = slab.toMm - rEnd;
  } else {
    segs.push(...pathLine(cursor, [slab.toMm, reach]), ...pathLine([slab.toMm, reach], [slab.toMm, backZ]));
    backFrom = slab.toMm;
  }
  if (left && left.back !== null) {
    segs.push(...pathLine([backFrom, backZ], [left.cx, backZ]), ...pathArc([left.cx, left.back], left.r, -Math.PI / 2, -Math.PI));
    segs.push(...pathLine([left.cx - left.r, left.back], start));
  } else if (rStart) {
    segs.push(...pathLine([backFrom, backZ], [slab.fromMm + rStart, backZ]), ...pathArc([slab.fromMm + rStart, backZ + rStart], rStart, -Math.PI / 2, -Math.PI));
    segs.push(...pathLine([slab.fromMm, backZ + rStart], start));
  } else {
    const x0 = start[0];
    segs.push(...pathLine([backFrom, backZ], [x0, backZ]), ...pathLine([x0, backZ], start));
  }
  return segs;
}

/**
 * СКРУГЛЁННЫЙ УГОЛ СТОЛЕШНИЦЫ У СВОБОДНОГО КОНЦА РЯДА (OVAL & RADIUS).
 *
 * Радиус угла плиты в плане — у конца ряда, где нет угла кухни и торец
 * крайнего модуля прямой: у скруглённого торца плита и так идёт по его дуге.
 * У ряда у стены скругляется передний угол, у острова — передний и задний.
 * Дуга касается фасадной линии и торца плиты; рез по ней — та же строка
 * «Рез столешницы по дуге», способ — ЧПУ (DEMO ONLY, пока цех не подтвердил).
 * Меньше 10 мм — это профиль кромки, а не угол плиты в плане.
 */
export const COUNTER_CORNER_MIN_MM = 10;

/** Крайний модуль ряда на полу у начала или конца. */
function endFloorModule(run: RunLike, end: 'start' | 'end'): Run['modules'][number] | null {
  const floor = run.modules.filter((unit) => standsOnFloor(unit)).sort((a, b) => a.offsetMm - b.offsetMm);
  return (end === 'start' ? floor[0] : floor[floor.length - 1]) ?? null;
}

/** Можно ли скруглить угол плиты у этого конца ряда этим радиусом — словами; `null` — можно. */
export function counterCornerRefusal(run: RunLike, end: 'start' | 'end', radiusMm: number): string | null {
  const where = end === 'start' ? 'начала' : 'конца';
  if (!Number.isInteger(radiusMm) || radiusMm < COUNTER_CORNER_MIN_MM) {
    return `Радиус угла столешницы — целое число миллиметров, от ${COUNTER_CORNER_MIN_MM}: меньше — это профиль кромки, а не угол плиты.`;
  }
  if (run.corner?.[end]) return `У ${where} ряда угол кухни: там стык с плитой соседней стены — скруглять нечего.`;
  const unit = endFloorModule(run, end);
  if (!unit || !bearsCountertop(unit, run)) return `У ${where} ряда столешницы нет: крайний модуль её не несёт.`;
  if (unit.radius && unit.radius.place !== 'front') return `«${unit.label}» скруглён сам: плита у ${where} ряда идёт по его дуге.`;
  /* Стена комнаты поперёк конца ряда (`Run.wallEnds`): хвост до неё меньше добора — плита у стены (слой 55). */
  const gap = end === 'start' ? unit.offsetMm : run.lengthMm - (unit.offsetMm + unit.widthMm);
  if (run.wallEnds?.[end] && gap < TAIL_FILLER_MAX_MM) {
    const toWall = Math.max(0, Math.round(gap));
    return `У ${where} ряда стена комнаты${toWall > 0 ? ` (до неё ${toWall} мм)` : ''}: угол плиты у стены не скругляют — между дугой и стеной осталась бы щель.`;
  }
  const reach = run.island ? islandReachMm(run) : null;
  const depth = reach ? islandDepthMm(run) + reach.front + reach.back : counterSlabDepthMm(run.zone, run.production);
  const limit = run.island ? Math.floor(depth / 2) : depth;
  if (radiusMm > limit) {
    return `Радиус ${radiusMm} мм больше ${run.island ? 'половины глубины' : 'глубины'} плиты (${limit} мм): дуга в плиту не помещается.`;
  }
  return null;
}

/** Действующий радиус угла плиты у конца ряда; `null` — угол прямой. */
export function counterCornerOf(run: RunLike, end: 'start' | 'end'): number | null {
  const radius = run.counterCorners?.[end];
  if (!radius) return null;
  return counterCornerRefusal(run, end, radius) ? null : radius;
}

/** Угол плиты у конца ряда — только у плиты, что доходит до крайнего модуля этого конца. */
function slabCorner(run: RunLike, slab: CounterSlab, end: 'start' | 'end'): number | null {
  const radius = counterCornerOf(run, end);
  const unit = endFloorModule(run, end);
  if (!radius || !unit) return null;
  return end === 'start' ? (unit.offsetMm === slab.fromMm ? radius : null) : unit.offsetMm + unit.widthMm === slab.toMm ? radius : null;
}

/** Рез плиты по дуге, мм — по контурам плит (`slabOutline`): строка сметы «Рез столешницы по дуге». */
export function countertopCurveMm(run: Parameters<typeof countertopSlabs>[0]): number {
  return countertopSlabs(run).reduce((sum, slab) => sum + (slab.outline ? curvedLengthOf(slab.outline) : 0), 0);
}

/**
 * ЦОКОЛЬ ПОД РАДИУСНЫМИ МОДУЛЯМИ — КОНТУРОМ (OVAL & RADIUS), мм ряда.
 * Контур — `plinthOutline`, той же дугой, что гнутая планка цоколя в раскрое;
 * прямой цоколь (`plinthSpans`) под этими модулями не идёт.
 */
export function radiusPlinths(run: RunLike): { moduleId: string; path: PlanPath }[] {
  return run.modules
    .filter((unit) => unit.radius && standsOnFloor(unit))
    .flatMap((unit) => {
      const path = plinthOutline(unit, { widthMm: unit.widthMm, depthMm: moduleDepthMm(unit, run.zone, run.production) });
      return path ? [{ moduleId: unit.id, path: translatePath(path, unit.offsetMm, 0) }] : [];
    });
}

/**
 * КУСКИ ПЛИТЫ ПО ГЛУБИНЕ: где она на всю глубину, а где вырезана сзади.
 *
 * Плита с вырезом — одна деталь, и в смете она идёт одной длиной. Сцене
 * же надо знать, где плита мельче: у препятствия она начинается не от
 * стены, а от его лицевой плоскости (`backCutMm` — сколько срезано от
 * стены). Одна функция на сцену и на приёмку пересечений.
 */
export function slabPieces(slab: CounterSlab): { fromMm: number; toMm: number; backCutMm: number }[] {
  const cuts = [...(slab.cuts ?? [])].sort((a, b) => a.fromMm - b.fromMm);
  const pieces: { fromMm: number; toMm: number; backCutMm: number }[] = [];
  let at = slab.fromMm;
  for (const cut of cuts) {
    if (cut.fromMm > at) pieces.push({ fromMm: at, toMm: cut.fromMm, backCutMm: 0 });
    pieces.push({ fromMm: Math.max(at, cut.fromMm), toMm: cut.toMm, backCutMm: cut.depthMm });
    at = Math.max(at, cut.toMm);
  }
  if (at < slab.toMm) pieces.push({ fromMm: at, toMm: slab.toMm, backCutMm: 0 });
  return pieces.filter((piece) => piece.toMm > piece.fromMm);
}

/** Вырезы плиты под препятствия — одни на сцену и на строку сметы «Вырез столешницы». */
export function countertopCuts(run: RunLike): CounterCut[] {
  return countertopSlabs(run).flatMap((slab) => slab.cuts ?? []);
}

/**
 * СТЫКИ ПЛИТЫ У УГЛОВ РЯДА — у тех его концов, где через угол идёт ЕГО плита.
 *
 * Стык — операция над плитой, которая идёт через угол: на кухню один на
 * угол, и считается он у того ряда, чья плита ведёт угол (P0: это выбор,
 * а не всегда стена до угла). У средней стены П, ведущей плиту в оба угла,
 * стыков два.
 */
export function counterMitersOf(run: Pick<Run, 'corner'>): number {
  let miters = 0;
  for (const end of ['start', 'end'] as const) {
    const choice = run.corner?.[end];
    if (choice && cornerOwnerOf(choice, 'countertop') === sideAt(end)) miters += 1;
  }
  return miters;
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
  const slabs = countertopSlabs(run).map(({ fromMm, toMm }) => ({ fromMm, toMm }));
  if (slabs.length === 0) return [];

  /*
   * Колонна, короб и выступ стены в полосе фартука рвут его (слой 56):
   * стена там закрыта препятствием, и плитка на нём — уже не фартук.
   */
  const inApron = obstaclesAt(run, workTopMm(run.production), upperBottomMm(run.production));
  /*
   * Витрина на столешнице (P1) закрывает стену от плиты до верхнего ряда:
   * фартука за ней нет — плитку под мебель не кладут и не оплачивают.
   */
  const onCounter = (run.upperSegments ?? [])
    .flatMap((segment) => segment.modules)
    .filter((unit) => vitrineOnCounter(unit))
    .map((unit) => ({ from: unit.offsetMm, to: unit.offsetMm + unit.widthMm }));

  /*
   * У угла фартук идёт до линии угла — до стены соседа, чья бы плита ни шла
   * через угол (P0): стена над плитой соседа тоже открыта. Край плиты у угла
   * — тот, что поставил `cornerBandMm`; плита, до угла не дошедшая (колонна у
   * угла), фартук к углу не тянет.
   */
  const band = cornerBandMm({
    corner: run.corner,
    bandDepthMm: counterSlabDepthMm(run.zone, run.production),
    zone: run.zone,
    production: run.production,
    level: 'countertop',
  });
  let out = slabs;
  if (run.corner?.start) {
    const edge = -band.startMm;
    out = out.map((slab, i) => (i === 0 && slab.fromMm === edge ? { ...slab, fromMm: -lowerGapMm(run, 'start') } : slab));
  }
  if (run.corner?.end) {
    const edge = run.lengthMm + band.endMm;
    const last = out.length - 1;
    out = out.map((slab, i) => (i === last && slab.toMm === edge ? { ...slab, toMm: run.lengthMm + lowerGapMm(run, 'end') } : slab));
  }
  return withoutObstacles(withoutObstacles(out, inApron), onCounter);
}

/** Сколько фартука, мм — то же число в сцене и в смете. */
export function apronLengthMm(run: RunLike): number {
  return apronSpans(run).reduce((sum, span) => sum + span.toMm - span.fromMm, 0);
}

/** Тёмная полоса под висящим шкафом: где, на какой высоте и какой глубины. */
export type NicheSpan = { fromMm: number; toMm: number; bottomMm: number; depthMm: number };

/**
 * НИША ПОД ВИСЯЩИМ РЯДОМ — ТОЛЬКО ПОД ВИСЯЩИМИ ШКАФАМИ (P0).
 *
 * Сцена клала полосу «по низу верхнего ряда» на ВСЮ длину ряда и на
 * кухонной отметке навески (`upperBottomMm`, 1450 мм), как только в ряду
 * был хоть один верхний сегмент. В спальне верхний ряд — антресоли НА
 * КРЫШЕ шкафов, и полоса проходила сквозь шкафы на 1446…1454 мм: на
 * объекте владельца её было видно в открытом модуле `tall-0@w1` как
 * «полку посередине», которой нет ни в раскрое, ни в смете. У кухни та же
 * полоса шла сквозь колонну холодильника.
 *
 * Полоса — не деталь: это затенение под шкафом. Поэтому её место — низ
 * каждого ВИСЯЩЕГО шкафа (`upperBottomFor`, та же функция, что ставит
 * модуль), его глубина у стены (`moduleDepthMm`), и только там, где шкаф
 * висит. Антресоль на крыше шкафа (`section: 'mezzanine'`) и отдельный
 * верхний корпус (`overhead`) не висят — под ними полосы нет. Соседние
 * шкафы на одной отметке и одной глубины сливаются в одну полосу.
 */
export function upperNicheSpans(run: Run): NicheSpan[] {
  const hanging = run.upperSegments
    .flatMap((segment) => segment.modules)
    .filter(
      (unit) =>
        (unit.kind === 'upper' || unit.kind === 'corner_upper') &&
        unit.section !== 'mezzanine' &&
        !unit.overhead &&
        /* Витрина на столешнице (P1) не висит: тени-ниши под ней нет. */
        !vitrineOnCounter(unit) &&
        unit.widthMm > 0,
    )
    .map((unit) => ({
      fromMm: unit.offsetMm,
      toMm: unit.offsetMm + unit.widthMm,
      bottomMm: upperBottomFor(unit, run),
      depthMm: moduleDepthMm(unit, run.zone, run.production),
    }))
    .sort((a, b) => a.fromMm - b.fromMm);

  const spans: NicheSpan[] = [];
  for (const piece of hanging) {
    const last = spans[spans.length - 1];
    if (last && piece.fromMm <= last.toMm && piece.bottomMm === last.bottomMm && piece.depthMm === last.depthMm) {
      last.toMm = Math.max(last.toMm, piece.toMm);
    } else {
      spans.push({ ...piece });
    }
  }
  return spans;
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
  /* Под радиусным модулем цоколь — его контуром (`radiusPlinths`), прямой туда не идёт. */
  const curved = new Set(radiusPlinths(run).map((plinth) => plinth.moduleId));
  const floor = [...run.modules]
    .filter((unit) => standsOnFloor(unit) && !curved.has(unit.id))
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

  /* Цоколь ведёт тот, кто ведёт низ: он под корпусами. */
  const band = cornerBandMm({
    corner: run.corner,
    bandDepthMm: rowStandardDepthMm(run.zone, 'base', run.production) - PLINTH_SETBACK_MM,
    zone: run.zone,
    production: run.production,
  });
  /* Препятствие у пола рвёт цоколь там же, где ряд (слой 56). */
  return withoutObstacles(reachCorners(spans, band, run.lengthMm), obstaclesAt(run, 0, plinthMm(run.production))).filter(
    (span) => span.toMm > span.fromMm,
  );
}
