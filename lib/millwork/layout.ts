import {
  APPLIANCE_SLOTS,
  CORNER_SIZE_MM,
  GEOMETRY,
  MIN_WIDTH,
  STANDARD_WIDTHS,
  WATER_TOLERANCE_MM,
  frontPlan,
  isStandardWidth,
  largestStandardUpTo,
} from './modules';
import { assertRunFits, runWidthSum } from './invariants';
import { SECTION_SPECS, sectionSpec } from './sections';
import { isSectionZone, zoneProfile } from './zones';
import { runFingerprint } from './fingerprint';
import type {
  ApplianceKind,
  CommPoint,
  Module,
  ModuleKind,
  Opening,
  Run,
  RunRequirements,
  SectionKind,
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

/** Варочная не ближе этого расстояния к краю ряда. */
const HOB_EDGE_CLEARANCE_MM = 400;
/** И не ближе этого к мойке — иначе некуда ставить посуду. */
const HOB_SINK_CLEARANCE_MM = 300;
/** Абсолютный минимум столешницы между мойкой и плитой. */
const MIN_COUNTER_GAP_MM = 150;

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
  openings: Opening[] = [],
  offsetMm = 0,
): Anchor[] {
  const anchors: Anchor[] = [];
  /*
   * Дубликаты в требованиях схлопываются: два одинаковых прибора в списке —
   * это опечатка ввода, а не заказ на две варочные панели. Иначе техника
   * попадает в ряд дважды и в смету уходят несуществующие деньги.
   */
  const wanted = new Set(req.appliances);
  const has = (a: ApplianceKind) => wanted.has(a);
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
    const low = HOB_EDGE_CLEARANCE_MM + width / 2;
    const high = Math.max(low, lengthMm - HOB_EDGE_CLEARANCE_MM - width / 2);
    const sinkWidth = sinkKind ? APPLIANCE_SLOTS[sinkKind].widthMm : 0;

    /*
     * Плита отходит от мойки на рабочий зазор. Если справа места нет,
     * она уходит ВЛЕВО от мойки, а не зажимается к правому краю: иначе
     * плита оказывается перед мойкой и рабочий треугольник разваливается.
     */
    let desired: number;
    if (!sinkKind) {
      desired = Math.min(Math.max(lengthMm * 0.6, low), high);
    } else {
      const sinkRight = sinkCenter + sinkWidth / 2;
      const wanted = sinkRight + HOB_SINK_CLEARANCE_MM + width / 2;
      // Не отбрасываем правую сторону сразу: сначала пробуем прижать плиту
      // к допустимому краю. Пока между мойкой и плитой остаётся рабочая
      // столешница, справа лучше, чем зеркальный прыжок налево.
      const rightCandidate = Math.min(Math.max(wanted, low), high);
      const gapToSink = rightCandidate - width / 2 - sinkRight;
      const left = sinkCenter - sinkWidth / 2 - HOB_SINK_CLEARANCE_MM - width / 2;
      desired = gapToSink >= MIN_COUNTER_GAP_MM ? rightCandidate : Math.max(left, low);
    }

    /*
     * Вытяжка обязана висеть строго над плитой, а верхний ряд разрывается
     * над окном. Значит плита под окном — это гарантированно кухня без
     * вытяжки. Сдвигаем её из оконного пролёта, если вытяжка заказана.
     */
    if (has('hood')) {
      desired = clearOfWindows(desired, width, openings, offsetMm, low, high);
    }

    anchors.push({
      kind: 'base',
      appliance: 'hob',
      widthMm: width,
      desiredCenterMm: desired,
      priority: 2,
    });
  }

  return anchors.sort((a, b) => a.desiredCenterMm - b.desiredCenterMm);
}

/** Ближайшая позиция центра, при которой модуль не попадает в оконный пролёт. */
function clearOfWindows(
  desiredCenterMm: number,
  widthMm: number,
  openings: Opening[],
  offsetMm: number,
  lowMm: number,
  highMm: number,
): number {
  const spans = openings
    .filter((o) => o.kind === 'window' || o.kind === 'arch')
    .filter((o) => o.sillMm + o.heightMm > GEOMETRY.upper.bottomFromFloor)
    // Проёмы заданы от угла стены, а якоря — от начала полезного участка.
    .map((o) => ({ from: o.fromCornerMm - offsetMm, to: o.fromCornerMm + o.widthMm - offsetMm }))
    .sort((a, b) => a.from - b.from);

  let center = desiredCenterMm;
  for (const span of spans) {
    const left = center - widthMm / 2;
    const right = center + widthMm / 2;
    if (right <= span.from || left >= span.to) continue;

    const toRight = span.to + widthMm / 2;
    const toLeft = span.from - widthMm / 2;
    // Предпочитаем сдвиг вправо: слева обычно стоят пеналы.
    center = toRight <= highMm ? toRight : Math.max(toLeft, lowMm);
  }

  return Math.min(Math.max(center, lowMm), highMm);
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

/** Подпись по содержанию, а не по ширине: 900 мм — это двухдверный модуль. */
function describeFronts(doorCount: number, drawerCount: number): string {
  if (drawerCount > 0) {
    const word = drawerCount === 1 ? 'ящик' : drawerCount < 5 ? 'ящика' : 'ящиков';
    return `${drawerCount} ${word}`;
  }
  if (doorCount >= 2) return `${doorCount} дверцы`;
  return 'Дверца';
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
    label: spec
      ? spec.title
      : kind === 'tall'
        ? 'Пенал'
        : describeFronts(fronts.doorCount, fronts.drawerCount),
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

/* ─────────────────────  Ряд из секций (не кухня)  ───────────────────── */

/**
 * Раскладка зон без техники.
 *
 * У кухни порядок диктует прибор: мойка у воды, варочная не у края. В шкафу
 * приборов нет, поэтому порядок задаёт замерщик через состав секций, а
 * ширины считаются здесь — по тем же правилам, что и на кухне: сначала
 * желаемая ширина, потом сжатие до минимума, потом остаток раздаётся
 * поровну. Инвариант тот же: сумма ширин сходится с длиной ряда
 * до миллиметра.
 *
 * Детерминизм обязателен так же, как на кухне: тот же состав и та же длина
 * дают тот же ряд, иначе чертёж, смета и рендер покажут разную мебель.
 */
/** Шаг сетки цеха: ширины кратны 50 мм, а не «сколько получилось». */
const SECTION_STEP_MM = 50;

function planSections(
  sections: SectionKind[],
  fill: SectionKind,
  spanMm: number,
): { kinds: SectionKind[]; widths: number[] } {
  if (sections.length === 0 || spanMm <= 0) return { kinds: [], widths: [] };

  /*
   * Секций больше, чем помещается: отбрасываем с конца. Ужимать ниже
   * минимума нельзя — штанга в 300 мм это не штанга, а щель.
   */
  const kinds: SectionKind[] = [];
  let minTotal = 0;
  for (const kind of sections) {
    const spec = sectionSpec(kind);
    if (minTotal + spec.minWidthMm > spanMm) break;
    kinds.push(kind);
    minTotal += spec.minWidthMm;
  }
  if (kinds.length === 0) return { kinds: [], widths: [spanMm] };

  /*
   * Стена длиннее, чем состав: добираем повторяемой секцией зоны, а не
   * оставляем метровую доборную планку. Полка или подвесной модуль — это
   * мебель, доборная планка в 2750 мм — это дыра в проекте.
   */
  const fillSpec = sectionSpec(fill);
  let maxTotal = kinds.reduce((sum, k) => sum + sectionSpec(k).maxWidthMm, 0);
  while (spanMm - maxTotal >= fillSpec.minWidthMm) {
    kinds.push(fill);
    maxTotal += fillSpec.maxWidthMm;
  }

  const specs = kinds.map(sectionSpec);
  const widths = specs.map((spec) => spec.preferredWidthMm);
  let total = widths.reduce((sum, w) => sum + w, 0);

  // Не помещается — жмём по очереди до минимума, начиная с самых широких.
  if (total > spanMm) {
    const order = specs
      .map((spec, i) => ({ i, room: spec.preferredWidthMm - spec.minWidthMm }))
      .sort((a, b) => b.room - a.room || a.i - b.i);

    for (const { i } of order) {
      if (total <= spanMm) break;
      const cut = Math.min(widths[i] - specs[i].minWidthMm, total - spanMm);
      widths[i] -= cut;
      total -= cut;
    }
  }

  // Остаток раздаём шагами по 50 мм, не переходя максимум секции.
  let rest = spanMm - total;
  while (rest >= SECTION_STEP_MM) {
    let placed = 0;
    for (let i = 0; i < widths.length && rest >= SECTION_STEP_MM; i++) {
      if (specs[i].maxWidthMm - widths[i] < SECTION_STEP_MM) continue;
      widths[i] += SECTION_STEP_MM;
      rest -= SECTION_STEP_MM;
      placed += SECTION_STEP_MM;
    }
    if (placed === 0) break;
  }

  // Мельче шага сетки — прирастает к последней секции: доборная планка
  // в 30 мм не нужна ни цеху, ни клиенту.
  if (rest > 0 && rest < SECTION_STEP_MM && widths.length > 0) {
    widths[widths.length - 1] += rest;
    rest = 0;
  }

  return { kinds, widths };
}

function buildSectionRun(input: BuildRunInput): Run {
  const { lengthMm, ceilingHeightMm, requirements, cornerAt = null } = input;

  const warnings: string[] = [];
  const usable = Math.max(0, Math.round(lengthMm));
  const profile = zoneProfile(requirements.zone);

  const wanted = (requirements.sections?.length
    ? requirements.sections
    : profile.defaultSections
  ).filter((kind) => profile.sections.includes(kind));

  // Антресоль живёт над рядом, а не в нём: в раскладке по длине её нет.
  const inRow = wanted.filter((kind) => kind !== 'mezzanine');
  const hasMezzanine = wanted.includes('mezzanine');

  const doorSystem = requirements.doorSystem ?? profile.doorSystem;

  const modules: Module[] = [];
  let at = 0;
  let limit = usable;

  if (cornerAt === 'start') {
    modules.push(makeModule('corner_base', CORNER_SIZE_MM, 0));
    at = CORNER_SIZE_MM;
  } else if (cornerAt === 'end') {
    limit = Math.max(0, usable - CORNER_SIZE_MM);
  }

  const plan = planSections(inRow, profile.fillSection, Math.max(0, limit - at));
  const { kinds, widths } = plan;

  if (kinds.length < inRow.length) {
    warnings.push(
      `В ряд ${usable} мм поместились не все секции: ${kinds.length} из ${inRow.length}.`,
    );
  }

  widths.forEach((widthMm, i) => {
    const kind = kinds[i] ?? profile.fillSection;
    const spec = SECTION_SPECS[kind];
    const unit = makeModule(
      spec.moduleKind,
      widthMm,
      at,
      undefined,
      spec.frontType === 'drawers' ? spec.drawerCount : undefined,
    );
    unit.section = kind;
    unit.label = spec.title;
    if (spec.frontType === 'none') {
      unit.frontType = 'none';
      unit.doorCount = 0;
      unit.drawerCount = 0;
    }

    /*
     * Шкаф-купе закрыт полотнами, а не распашными фасадами: внутренние
     * секции остаются открытыми. Иначе смета посчитала бы и двери-купе,
     * и фасады с петлями — клиент заплатил бы за фасады, которых нет.
     */
    if (doorSystem === 'sliding' && unit.frontType === 'door') {
      unit.frontType = 'none';
      unit.doorCount = 0;
    }
    modules.push(unit);
    at += widthMm;
  });

  // Хвост закрываем доборным: ряд обязан сходиться с длиной стены.
  const tail = limit - at;
  if (tail > 0) {
    const filler = makeModule('filler', tail, at);
    filler.label = 'Доборная планка';
    modules.push(filler);
    at += tail;
  }

  if (cornerAt === 'end') {
    modules.push(makeModule('corner_base', CORNER_SIZE_MM, at));
    at += CORNER_SIZE_MM;
  }

  /*
   * Антресоль — сплошной верхний ряд по всей длине. Разрывов под окна здесь
   * не делаем: шкаф ставят к глухой стене, а если окно есть, его поймает
   * проверка проёмов.
   */
  const upperSegments: UpperSegment[] = [];
  if (hasMezzanine && usable > 0) {
    const spec = SECTION_SPECS.mezzanine;
    const mezzanine: Module[] = [];
    let mAt = 0;
    for (const width of fillGap(usable)) {
      const unit = makeModule('upper', Math.min(width, spec.maxWidthMm), mAt);
      unit.section = 'mezzanine';
      unit.label = spec.title;
      mezzanine.push(unit);
      mAt += unit.widthMm;
    }
    if (mAt < usable && mezzanine.length > 0) {
      mezzanine[mezzanine.length - 1].widthMm += usable - mAt;
    }
    upperSegments.push({ fromMm: 0, toMm: usable, modules: mezzanine });
  }

  const run: Run = {
    id: input.id ?? 'run',
    zone: requirements.zone ?? 'kitchen',
    doorSystem,
    lengthMm: usable,
    ceilingHeightMm,
    modules,
    upperSegments,
    options: requirements.options,
    residualMm: usable - at,
    warnings,
    fingerprint: runFingerprint({ modules, upperSegments }),
  };

  assertRunFits(run);
  return run;
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

  // Зоны без техники собираются из секций: у них нет ни мойки, ни варочной.
  if (isSectionZone(requirements.zone)) return buildSectionRun(input);

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
  const anchors = planAnchors(span, requirements, comms, openings, cursor).map((a) => ({
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
    let startMm = Math.max(flow, Math.min(desired, maxStart));

    /*
     * Щель уже самого узкого стандарта закрывать нечем — получился бы
     * доборный модуль в 50 мм, которого цех не делает. Подтягиваем якорь
     * влево вплотную: сдвиг на пару сантиметров дешевле нелепого модуля.
     */
    if (startMm > flow && startMm - flow < MIN_WIDTH) startMm = flow;

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

  const tail = limit - at;
  if (tail > 0 && tail < MIN_WIDTH && modules.length > 0) {
    // Огрызок в хвосте прирастает к последнему обычному модулю.
    const lastPlain = [...modules].reverse().find((m) => !m.appliance && m.kind === 'base');
    if (lastPlain) {
      lastPlain.widthMm += tail;
      lastPlain.isFiller = !isStandardWidth(lastPlain.widthMm);
      for (let i = modules.indexOf(lastPlain) + 1; i < modules.length; i++) {
        modules[i].offsetMm += tail;
      }
      at = limit;
    }
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

  const run: Run = {
    id: input.id ?? 'run',
    // Зона едет с рядом дальше: от неё зависит состав статей сметы.
    zone: requirements.zone ?? 'kitchen',
    doorSystem: 'hinged',
    lengthMm: usable,
    ceilingHeightMm,
    modules,
    upperSegments,
    options: requirements.options,
    residualMm: usable - at,
    warnings,
    fingerprint: runFingerprint({ modules, upperSegments }),
  };

  // Жёсткий инвариант: ряд, не помещающийся в стену, наружу не выходит.
  assertRunFits(run);

  return run;
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

export { runWidthSum };

export function freeSpaceMm(run: Run): number {
  return run.lengthMm - runWidthSum(run);
}

export function allModules(run: Run): Module[] {
  return [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)];
}

export { STANDARD_WIDTHS, WATER_TOLERANCE_MM };
