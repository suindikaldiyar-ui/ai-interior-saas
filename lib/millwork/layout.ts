import {
  APPLIANCE_SLOTS,
  CORNER_SIZE_MM,
  GEOMETRY,
  MIN_WIDTH,
  STANDARD_WIDTHS,
  frontPlan,
  isStandardWidth,
  largestStandardUpTo,
} from './modules';
import type {
  ApplianceKind,
  CommPoint,
  Module,
  ModuleKind,
  Opening,
  Run,
  RunRequirements,
  UpperSegment,
} from '@/types/millwork';

/**
 * Детерминированная раскладка ряда.
 *
 * Одна и та же длина с одними и теми же требованиями обязана давать
 * побайтово одинаковый результат при любом числе пересчётов. Случайность
 * здесь означала бы, что 3D, чертёж и смета покажут клиенту разную мебель,
 * а договор подпишут по третьей сумме.
 *
 * Поэтому никакого Math.random, никакой зависимости от порядка ключей
 * объекта и никаких дат внутри расчёта.
 */

/**
 * Идентификатор модуля выводится из позиции и роли, а не из счётчика:
 * при пересчёте тот же модуль получает тот же id, и выделение на чертеже
 * не слетает.
 */
function moduleId(kind: ModuleKind, offsetMm: number, appliance?: ApplianceKind): string {
  return `${kind}-${offsetMm}${appliance ? `-${appliance}` : ''}`;
}

/* ─────────────────────────  Якорные модули  ───────────────────────── */

/** Допуск на попадание мойки в точку водоснабжения. */
export const WATER_TOLERANCE_MM = 600;
/** Варочная не ближе этого расстояния к краю ряда. */
const HOB_EDGE_CLEARANCE_MM = 400;
/** И не ближе этого к мойке — иначе некуда ставить посуду. */
const HOB_SINK_CLEARANCE_MM = 300;

type Anchor = {
  kind: ModuleKind;
  appliance: ApplianceKind;
  widthMm: number;
  desiredCenterMm: number;
  /** Чем меньше, тем важнее сохранить место при нехватке длины. */
  priority: number;
};

function commOffset(comms: CommPoint[], kind: CommPoint['kind']): number | null {
  const point = comms.find((c) => c.kind === kind);
  return point ? point.fromCornerMm : null;
}

/**
 * Расставляет якоря: мойку — к воде, посудомойку — вплотную к мойке,
 * варочную — на отдалении, холодильник и духовую колонну — в торец.
 */
function planAnchors(
  lengthMm: number,
  req: RunRequirements,
  comms: CommPoint[],
): Anchor[] {
  const anchors: Anchor[] = [];
  const has = (a: ApplianceKind) => req.appliances.includes(a);
  const tallLeft = req.tallSide === 'left';

  const sinkKind: ApplianceKind | null = has('sink800')
    ? 'sink800'
    : has('sink600')
      ? 'sink600'
      : null;

  const dishKind: ApplianceKind | null = has('dishwasher60')
    ? 'dishwasher60'
    : has('dishwasher45')
      ? 'dishwasher45'
      : null;

  // Пеналы у стены: холодильник в самом торце, за ним духовая колонна.
  let tallCursor = tallLeft ? 0 : lengthMm;
  const pushTall = (appliance: ApplianceKind) => {
    const width = APPLIANCE_SLOTS[appliance].widthMm;
    const center = tallLeft ? tallCursor + width / 2 : tallCursor - width / 2;
    anchors.push({
      kind: 'tall',
      appliance,
      widthMm: width,
      desiredCenterMm: center,
      priority: appliance === 'fridge' ? 0 : 3,
    });
    tallCursor += tallLeft ? width : -width;
  };

  if (has('fridge')) pushTall('fridge');
  if (has('oven')) pushTall('oven');

  let sinkCenter = lengthMm * 0.35;
  if (sinkKind) {
    const width = APPLIANCE_SLOTS[sinkKind].widthMm;
    const water = commOffset(comms, 'water_supply');
    // Мойка садится напротив вывода воды: перенос коммуникации на объекте
    // стоит дороже, чем сдвиг модуля на бумаге.
    const desired = water ?? lengthMm * 0.35;
    const low = tallLeft ? tallCursor + width / 2 : width / 2;
    const high = tallLeft ? lengthMm - width / 2 : tallCursor - width / 2;
    sinkCenter = Math.min(Math.max(desired, low), Math.max(low, high));
    anchors.push({
      kind: 'base',
      appliance: sinkKind,
      widthMm: width,
      desiredCenterMm: sinkCenter,
      priority: 1,
    });
  }

  if (dishKind && sinkKind) {
    const width = APPLIANCE_SLOTS[dishKind].widthMm;
    const sinkWidth = APPLIANCE_SLOTS[sinkKind].widthMm;
    // Вплотную к мойке — общий узел водоснабжения и слива.
    const rightSide = sinkCenter + sinkWidth / 2 + width <= lengthMm;
    anchors.push({
      kind: 'base',
      appliance: dishKind,
      widthMm: width,
      desiredCenterMm: rightSide
        ? sinkCenter + sinkWidth / 2 + width / 2
        : sinkCenter - sinkWidth / 2 - width / 2,
      priority: 4,
    });
  }

  if (has('hob')) {
    const width = APPLIANCE_SLOTS.hob.widthMm;
    const fromSink = sinkKind
      ? sinkCenter +
        APPLIANCE_SLOTS[sinkKind].widthMm / 2 +
        HOB_SINK_CLEARANCE_MM +
        width / 2
      : lengthMm * 0.6;
    const low = HOB_EDGE_CLEARANCE_MM + width / 2;
    const high = lengthMm - HOB_EDGE_CLEARANCE_MM - width / 2;
    anchors.push({
      kind: 'base',
      appliance: 'hob',
      widthMm: width,
      desiredCenterMm: Math.min(Math.max(fromSink, low), Math.max(low, high)),
      priority: 2,
    });
  }

  return anchors.sort((a, b) => a.desiredCenterMm - b.desiredCenterMm);
}

/* ─────────────────────────  Заполнение промежутков  ───────────────────────── */

/**
 * Промежуток закрывается стандартными ширинами, начиная с наибольшей.
 * Остаток меньше минимального стандарта распределяется равномерным
 * расширением уже поставленных модулей: 630 мм — нормальная ширина,
 * мебель делается на заказ. Отдельный доборный появляется только тогда,
 * когда расширять нечего.
 */
export function fillGap(gapMm: number): number[] {
  if (gapMm < 1) return [];

  const widths: number[] = [];
  let rest = Math.round(gapMm);

  while (rest >= MIN_WIDTH) {
    const next = largestStandardUpTo(rest);
    if (next === null) break;
    widths.push(next);
    rest -= next;
  }

  if (rest > 0) {
    if (widths.length === 0) return [rest];
    const add = Math.floor(rest / widths.length);
    const extra = rest - add * widths.length;
    for (let i = 0; i < widths.length; i++) {
      widths[i] += add + (i < extra ? 1 : 0);
    }
  }

  return widths;
}

function makeModule(
  kind: ModuleKind,
  widthMm: number,
  offsetMm: number,
  appliance?: ApplianceKind,
  drawersRequested?: number,
): Module {
  const spec = appliance ? APPLIANCE_SLOTS[appliance] : null;
  const fronts = appliance
    ? { doorCount: 0, drawerCount: 0 }
    : frontPlan(kind, widthMm, drawersRequested);

  return {
    id: moduleId(kind, offsetMm, appliance),
    kind,
    widthMm,
    offsetMm,
    appliance,
    frontType: appliance ? 'appliance' : fronts.drawerCount > 0 ? 'drawers' : 'door',
    drawerCount: fronts.drawerCount,
    doorCount: fronts.doorCount,
    isFiller: kind === 'filler' || !isStandardWidth(widthMm),
    label: spec ? spec.title : kind === 'tall' ? 'Пенал' : String(widthMm),
  };
}

/* ─────────────────────────  Сборка ряда  ───────────────────────── */

export interface BuildRunInput {
  id?: string;
  lengthMm: number;
  ceilingHeightMm: number;
  requirements: RunRequirements;
  comms?: CommPoint[];
  openings?: Opening[];
  /** Ряд примыкает к соседнему — на этом краю встаёт угловой модуль. */
  cornerAt?: 'start' | 'end' | null;
}

export function buildRun(input: BuildRunInput): Run {
  const {
    lengthMm,
    ceilingHeightMm,
    requirements,
    comms = [],
    openings = [],
    cornerAt = null,
  } = input;

  const warnings: string[] = [];
  const usable = Math.max(0, Math.round(lengthMm));

  /*
   * Угол: соседний ряд укорачивается на глубину примыкающего, поэтому
   * в углу стоит один модуль 900 × 900, а не два наложенных друг на друга.
   */
  let cursor = 0;
  let limit = usable;
  const cornerModules: Module[] = [];

  if (cornerAt === 'start') {
    cornerModules.push(makeModule('corner_base', CORNER_SIZE_MM, 0));
    cursor = CORNER_SIZE_MM;
  } else if (cornerAt === 'end') {
    limit = Math.max(0, usable - CORNER_SIZE_MM);
  }

  const span = Math.max(0, limit - cursor);
  const anchors = planAnchors(span, requirements, comms).map((a) => ({
    ...a,
    desiredCenterMm: a.desiredCenterMm + cursor,
  }));

  /*
   * Если якоря не помещаются, отказываемся от наименее важных, а не ужимаем
   * технику: духовку 600 мм нельзя сделать 500 мм, она просто не влезет.
   */
  const anchorsTotal = anchors.reduce((sum, a) => sum + a.widthMm, 0);
  let kept = anchors;
  if (anchorsTotal > span) {
    let running = 0;
    kept = [...anchors]
      .sort((a, b) => a.priority - b.priority)
      .filter((a) => {
        if (running + a.widthMm > span) {
          warnings.push(
            `${APPLIANCE_SLOTS[a.appliance].title}: не помещается в ряд ${usable} мм.`,
          );
          return false;
        }
        running += a.widthMm;
        return true;
      })
      .sort((a, b) => a.desiredCenterMm - b.desiredCenterMm);
  }

  /*
   * Раскладываем якоря слева направо, не давая им наезжать друг на друга.
   *
   * Каждый якорь садится не дальше, чем позволяет ОСТАТОК под ещё не
   * поставленные: иначе техника встаёт по своим желаемым позициям, между
   * ними остаются промежутки, и хвост ряда вылезает за стену, хотя по
   * сумме ширин всё помещалось.
   */
  const placed: { anchor: Anchor; startMm: number }[] = [];
  let flow = cursor;
  for (let i = 0; i < kept.length; i++) {
    const anchor = kept[i];
    const reserve = kept.slice(i + 1).reduce((sum, a) => sum + a.widthMm, 0);
    const desired = Math.round(anchor.desiredCenterMm - anchor.widthMm / 2);
    const maxStart = limit - anchor.widthMm - reserve;
    const startMm = Math.max(flow, Math.min(desired, maxStart));
    placed.push({ anchor, startMm });
    flow = startMm + anchor.widthMm;
  }

  // Промежутки между якорями закрываем стандартными ширинами.
  const modules: Module[] = [...cornerModules];
  let at = cursor;

  for (const { anchor, startMm } of placed) {
    for (const width of fillGap(startMm - at)) {
      modules.push(makeModule('base', width, at));
      at += width;
    }
    modules.push(makeModule(anchor.kind, anchor.widthMm, at, anchor.appliance));
    at += anchor.widthMm;
  }

  for (const width of fillGap(limit - at)) {
    modules.push(makeModule('base', width, at));
    at += width;
  }

  if (cornerAt === 'end') {
    modules.push(makeModule('corner_base', CORNER_SIZE_MM, at));
    at += CORNER_SIZE_MM;
  }

  const upperSegments = requirements.options.hasUpper
    ? buildUpperRow(modules, usable, openings, requirements, ceilingHeightMm)
    : [];

  return {
    id: input.id ?? 'run',
    lengthMm: usable,
    ceilingHeightMm,
    modules,
    upperSegments,
    options: requirements.options,
    residualMm: usable - at,
    warnings,
  };
}

/* ─────────────────────────  Верхний ряд  ───────────────────────── */

/** Окна, которые пересекают полосу верхнего ряда по высоте. */
function blockingOpenings(
  openings: Opening[],
  ceilingHeightMm: number,
  options: { upperToCeiling: boolean },
): Opening[] {
  const bottom = GEOMETRY.upper.bottomFromFloor;
  const top = options.upperToCeiling
    ? ceilingHeightMm
    : bottom + GEOMETRY.upper.carcassH;

  return openings.filter((o) => {
    if (o.kind !== 'window' && o.kind !== 'arch') return false;
    const openingTop = o.sillMm + o.heightMm;
    return openingTop > bottom && o.sillMm < top;
  });
}

/**
 * Верхний ряд идёт по проекции нижнего и РАЗРЫВАЕТСЯ на участке окна.
 * Шкафы поперёк окна — грубая ошибка, которую клиент замечает мгновенно.
 */
export function buildUpperRow(
  baseModules: Module[],
  lengthMm: number,
  openings: Opening[],
  req: RunRequirements,
  ceilingHeightMm: number,
): UpperSegment[] {
  const blockers = blockingOpenings(openings, ceilingHeightMm, req.options)
    .map((o) => ({ from: o.fromCornerMm, to: o.fromCornerMm + o.widthMm }))
    .sort((a, b) => a.from - b.from);

  // Свободные интервалы = длина ряда минус участки окон.
  const free: { from: number; to: number }[] = [];
  let start = 0;
  for (const blocker of blockers) {
    if (blocker.from > start) {
      free.push({ from: start, to: Math.min(blocker.from, lengthMm) });
    }
    start = Math.max(start, blocker.to);
  }
  if (start < lengthMm) free.push({ from: start, to: lengthMm });

  // Вытяжка обязана висеть строго над варочной панелью.
  const hob = baseModules.find((m) => m.appliance === 'hob');
  const wantsHood = req.appliances.includes('hood');

  const segments: UpperSegment[] = [];

  for (const interval of free) {
    if (interval.to - interval.from < MIN_WIDTH) continue;

    const modules: Module[] = [];
    let at = interval.from;

    const hoodInside =
      wantsHood &&
      hob !== undefined &&
      hob.offsetMm >= interval.from &&
      hob.offsetMm + hob.widthMm <= interval.to;

    if (hoodInside && hob) {
      for (const width of fillGap(hob.offsetMm - at)) {
        modules.push(makeModule('upper', width, at));
        at += width;
      }
      modules.push(makeModule('upper', hob.widthMm, at, 'hood'));
      at += hob.widthMm;
    }

    for (const width of fillGap(interval.to - at)) {
      modules.push(makeModule('upper', width, at));
      at += width;
    }

    if (modules.length > 0) {
      segments.push({ fromMm: interval.from, toMm: interval.to, modules });
    }
  }

  return segments;
}

/* ─────────────────────────  Помощь интерфейсу  ───────────────────────── */

export function runWidthSum(run: Run): number {
  return run.modules.reduce((sum, m) => sum + m.widthMm, 0);
}

export function freeSpaceMm(run: Run): number {
  return run.lengthMm - runWidthSum(run);
}

export function allModules(run: Run): Module[] {
  return [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)];
}

export { STANDARD_WIDTHS };
