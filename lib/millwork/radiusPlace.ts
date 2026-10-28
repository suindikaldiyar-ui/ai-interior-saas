/**
 * МЕСТО РАДИУСНОГО МОДУЛЯ (OVAL & RADIUS, этап A) — ПРОВЕРКИ, КОТОРЫМ НУЖЕН РЯД.
 *
 * Сама форма проверяется `radiusRefusal` (модуль и его размер). Здесь —
 * то, что видно только из ряда: скруглённый торец бывает у КРАЙНЕГО модуля
 * ряда и не у угла (там стыкуется соседняя стена), задний угол — только у
 * острова, рисунок фрезеровки МДФ на гнутой детали не режут, корпус над
 * шкафом по дуге не встанет. Ответ — словами, ДО записи (`radiusEdit`), и
 * ещё раз после любой правки ряда (`radiusAfterEdit`): правка, которая
 * ломает форму модуля, отклоняется целиком, а не оставляет дугу, которую
 * нельзя собрать.
 */
import type { Module, RadiusSpec, Run } from '@/types/millwork';
import { BEND_METHOD_TITLE, radiusMethods, type ProductionSettings } from '@/types/catalog';
import { TAIL_FILLER_MAX_MM, counterCornerOf, counterCornerRefusal, countertopCurveMm } from './countertop';
import { moduleCarcassHeightMm, moduleDepthMm } from './fill';
import { radiusDimsOf } from './radiusDims';
import { millingFor } from './milling';
import { frontPlan, plainModuleLabel } from './modules';
import { MODULE_VARIANTS } from './moduleVariants';
import { RADIUS_MIN_MM, bentLeavesOf, defaultRadiusMm, radiusLabel, radiusParts, radiusRefusal, type RadiusPartKind } from './radius';

/** Варианты места, у которых начинка встаёт и в радиусный корпус: дверца и открытые полки. */
const RADIUS_VARIANTS = new Set(['door', 'door_two', 'upper_door', 'upper_door_two', 'open_base', 'upper_open', 'tall_shelves']);

/** Ряд модуля: этаж, соседи по ряду, угол и стена комнаты у концов, остров ли это. */
export type RadiusRow = {
  level: 'base' | 'upper' | 'mezz' | 'over';
  units: Module[];
  corner: { start: boolean; end: boolean };
  /** Стена комнаты поперёк конца ряда (`Run.wallEnds`): до неё меряется хвост от крайнего модуля. */
  wallEnds: { start: boolean; end: boolean };
  /** Длина ряда, мм: конец ряда — у стены его конца. */
  lengthMm: number;
  island: boolean;
  /** Корпуса над шкафами (P2) — по дуге шкафа под ними они не встанут. */
  over: Module[];
};

/** Ряд, в котором стоит модуль: нижний (с пеналами), верхний, антресоль или корпус над шкафом. */
export function radiusRowOf(
  unit: Module,
  lists: { modules: Module[]; upper: Module[]; mezz: Module[]; over: Module[] },
  run: Pick<Run, 'corner' | 'island' | 'wallEnds' | 'lengthMm'>,
): RadiusRow {
  const level = lists.modules.some((m) => m.id === unit.id)
    ? 'base'
    : lists.upper.some((m) => m.id === unit.id)
      ? 'upper'
      : lists.mezz.some((m) => m.id === unit.id)
        ? 'mezz'
        : 'over';
  const units = { base: lists.modules, upper: lists.upper, mezz: lists.mezz, over: lists.over }[level];
  return {
    level,
    units,
    corner: { start: Boolean(run.corner?.start), end: Boolean(run.corner?.end) },
    wallEnds: { start: Boolean(run.wallEnds?.start), end: Boolean(run.wallEnds?.end) },
    lengthMm: run.lengthMm,
    island: Boolean(run.island),
    over: lists.over,
  };
}

/**
 * ТОРЕЦ У СТЕНЫ КОМНАТЫ — СЛОВАМИ. Хвост до стены меньше `TAIL_FILLER_MAX_MM`
 * — это ещё «у стены» (так его закрывает добор, слой 55): дуга там отошла бы
 * от стены клином, и скругляют торец у прохода, а не у стены.
 */
function atWallRefusal(side: 'Справа' | 'Слева', name: string, gapMm: number): string | null {
  if (gapMm >= TAIL_FILLER_MAX_MM) return null;
  const gap = Math.max(0, Math.round(gapMm));
  return `${side} от ${name} — стена комнаты${gap > 0 ? ` (до неё ${gap} мм)` : ''}: торец к стене не скругляют — между дугой и стеной остался бы пустой клин. Скругляют торец у прохода.`;
}

/** Где модуль может быть скруглён — словами; `null` — может. */
export function radiusPlaceRefusal(unit: Module, spec: RadiusSpec, row: RadiusRow): string | null {
  const name = `«${unit.label || 'модуль'}»`;
  /* Корпус над шкафом стоит на крыше нижнего: шкаф под ним по дуге — корпус повиснет над дугой. */
  const above =
    row.level === 'base' ? row.over.find((m) => m.offsetMm < unit.offsetMm + unit.widthMm && unit.offsetMm < m.offsetMm + m.widthMm) : undefined;
  if (above) return `Над ${name} стоит корпус «${above.label}»: он прямоугольный и повиснет над дугой — сначала снимите его.`;
  if (spec.back && !row.island) return 'Задний угол скругляют только у острова: у ряда вдоль стены сзади — стена.';
  if (spec.place === 'front') return null;
  const sorted = [...row.units].sort((a, b) => a.offsetMm - b.offsetMm);
  const at = sorted.findIndex((m) => m.id === unit.id);
  if (spec.place === 'right') {
    const next = sorted[at + 1];
    if (next) return `Скруглённый торец — у крайнего модуля ряда: справа от ${name} стоит «${next.label}», и дуга упрётся в него.`;
    if (row.corner.end) return 'Справа у ряда угол: там стыкуется соседняя стена, и торца у ряда нет.';
    if (row.wallEnds.end) return atWallRefusal('Справа', name, row.lengthMm - (unit.offsetMm + unit.widthMm));
  } else {
    const prev = sorted[at - 1];
    if (prev) return `Скруглённый торец — у крайнего модуля ряда: слева от ${name} стоит «${prev.label}», и дуга упрётся в него.`;
    if (row.corner.start) return 'Слева у ряда угол: там стыкуется соседняя стена, и торца у ряда нет.';
    if (row.wallEnds.start) return atWallRefusal('Слева', name, unit.offsetMm);
  }
  return null;
}

/**
 * Рисунок фрезеровки на гнутой дверце и рейках: рисунок МДФ строится по
 * плоскому фасаду (`facadeRelief`), а фрезеровка ряда легла бы и на рейки —
 * смета взяла бы её за площадь реек.
 */
function millingRefusal(unit: Module, spec: RadiusSpec, run: Pick<Run, 'milling'>): string | null {
  if (spec.cover === 'open') return null;
  const leafRelief = Object.values(unit.leafFronts ?? {}).some((leaf) => leaf.relief || leaf.millingId);
  if (unit.front?.relief || leafRelief || millingFor(unit, run)) {
    return `Рисунок фрезеровки МДФ строится по плоскому фасаду: на ${spec.cover === 'door' ? 'гнутую дверцу' : 'рейки по дуге'} его не положить. Снимите фрезеровку с модуля (или с ряда).`;
  }
  return null;
}

/** Всё, что решает форма модуля на этом месте: модуль, ряд и школа цеха. */
export function radiusCheck(
  unit: Module,
  spec: RadiusSpec,
  row: RadiusRow,
  run: Pick<Run, 'zone' | 'production' | 'milling'>,
  production?: ProductionSettings,
): string | null {
  const depthMm = moduleDepthMm(unit, run.zone, run.production);
  /* Сначала место (у стены сзади — стена, посередине ряда — сосед), потом форма: причина называется та, что мешает первой. */
  return (
    radiusPlaceRefusal(unit, spec, row) ??
    radiusRefusal(unit, spec, { widthMm: unit.widthMm, depthMm }, (production ?? run.production)?.radius?.bend) ??
    millingRefusal(unit, spec, run)
  );
}

/**
 * ПЕТЛИ ДВЕРЦЫ ТОРЦА — У БОКОВИНЫ СТЫКА: с другой стороны дуга (`bentLeavesOf`).
 * Наполнение с другой стороной петель (жест на чертеже, операция) разошлось бы
 * с дверцей сцены и раскроя. Только после правки: `radiusEdit` наполнение
 * раскладывает заново, и сторону ставит умолчание (`defaultOpening`).
 */
function hingeRefusal(unit: Module, spec: RadiusSpec): string | null {
  if (spec.cover !== 'door' || spec.place === 'front') return null;
  const hinge = unit.fill?.hinge;
  const own = spec.place === 'right' ? 'left' : 'right';
  if (!hinge || hinge === 'none' || hinge === own) return null;
  return `Дверца торца висит на петлях у боковины стыка — ${own === 'left' ? 'слева' : 'справа'}: с другой стороны дуга, петлю там не поставить.`;
}

/** Списки модулей ряда по этажам — те же, что держит правка. */
export function radiusLists(run: Pick<Run, 'modules' | 'upperSegments'>): { modules: Module[]; upper: Module[]; mezz: Module[]; over: Module[] } {
  const hanging = run.upperSegments.flatMap((segment) => segment.modules);
  return {
    modules: run.modules,
    upper: hanging.filter((unit) => unit.section !== 'mezzanine' && !unit.overhead),
    mezz: hanging.filter((unit) => unit.section === 'mezzanine' && !unit.overhead),
    over: hanging.filter((unit) => Boolean(unit.overhead)),
  };
}

/**
 * ФОРМА ПОСЛЕ ПРАВКИ: правка ряда, после которой радиусный модуль собрать
 * нельзя (сосед встал за торцом, ширина ушла от радиуса, фасад стал ЛДСП,
 * легла фрезеровка), — отказ словами. Только то, что стояло ДО правки и
 * перестало ПОСЛЕ: давнее не повторяется и правку не запирает.
 */
export function radiusAfterEdit(before: Run, after: Run): string | null {
  const was = radiusLists(before);
  const now = radiusLists(after);
  const wasById = new Map([...was.modules, ...was.upper, ...was.mezz, ...was.over].map((unit) => [unit.id, unit] as const));
  for (const unit of [...now.modules, ...now.upper, ...now.mezz, ...now.over]) {
    if (!unit.radius) continue;
    const refusal = radiusCheck(unit, unit.radius, radiusRowOf(unit, now, after), after) ?? hingeRefusal(unit, unit.radius);
    if (!refusal) continue;
    const prev = wasById.get(unit.id);
    const prevBroken = prev?.radius ? radiusCheck(prev, prev.radius, radiusRowOf(prev, was, before), before) : null;
    if (prev?.radius && prevBroken) continue;
    return `«${unit.label}»: после этой правки модуль не собрать — ${refusal.charAt(0).toLowerCase()}${refusal.slice(1)} Правка не применена.`;
  }
  return null;
}

/**
 * ПРАВКА РАДИУСА — встанет ли и каким станет модуль.
 *
 * Снять радиус — модуль снова обычный, с дверцей по ширине (`frontPlan`).
 * Поставить — фасад по виду закрытия: гнутые створки (`bentLeavesOf`),
 * открытые полки или рейки (своего фасада нет); начинка места, которая по
 * дуге не встаёт (ящики, карго, витрина, сушилка), — отказ словами. Наполнение
 * раскладывается заново: полки у радиусного корпуса — по его контуру.
 */
export function radiusEdit(
  unit: Module,
  spec: RadiusSpec | null,
  row: RadiusRow,
  run: Pick<Run, 'zone' | 'production' | 'milling'>,
): { unit: Module } | { refusal: string } {
  if (!spec) {
    if (!unit.radius) return { unit };
    const { radius: _before, ...rest } = unit;
    void _before;
    const fronts = frontPlan(unit.kind, unit.widthMm);
    return {
      unit: { ...rest, frontType: 'door', doorCount: fronts.doorCount, drawerCount: 0, label: plainModuleLabel(unit.kind, fronts), fill: undefined },
    };
  }
  if (unit.variant && !RADIUS_VARIANTS.has(unit.variant)) {
    return {
      refusal: `У «${unit.label}» своя начинка — «${MODULE_VARIANTS[unit.variant].title}»: по дуге она не встаёт. Сначала верните обычную дверцу или открытые полки.`,
    };
  }
  const refusal = radiusCheck(unit, spec, row, run);
  if (refusal) return { refusal };
  const stored: RadiusSpec = {
    place: spec.place,
    radiusMm: spec.radiusMm,
    ...(spec.place === 'front' && spec.direction === 'concave' ? { direction: 'concave' as const } : {}),
    ...(spec.back ? { back: true as const } : {}),
    cover: spec.cover,
  };
  const { variant: _variant, ...rest } = unit;
  void _variant;
  const doors = stored.cover === 'door' ? bentLeavesOf({ radius: stored, widthMm: unit.widthMm }).length : 0;
  return {
    unit: {
      ...rest,
      radius: stored,
      frontType: doors > 0 ? 'door' : 'none',
      doorCount: doors,
      drawerCount: 0,
      label: radiusLabel(stored, doors),
      fill: undefined,
    },
  };
}

/** Виды гнутых деталей словами — для причин «не для цеха». */
const BENT_WORD: Partial<Record<RadiusPartKind, string>> = {
  door: 'дверца',
  substrate: 'подложка реек',
  plinth: 'цоколь',
};

/**
 * ЧЕМ СДЕЛАТЬ РАДИУСНУЮ МЕБЕЛЬ РЯДА — И ПОДТВЕРДИЛ ЛИ ЭТО ЦЕХ (DEMO ONLY).
 *
 * Способы спрашиваются у деталей (`radiusParts`): контур дна, крыши и полок —
 * ЧПУ, гнутая дверца, подложка и цоколь — гибка; столешница по дуге
 * (`countertopCurveMm`) — тоже ЧПУ. Цех не подтвердил способ — модуль
 * показан, посчитан и назван словами, но в цех не уходит: этими словами
 * заперт выпуск карты раскроя. Ни радиусных модулей, ни плиты по дуге
 * (скруглённый угол столешницы) — причин нет.
 */
export function radiusMethodState(
  run: Run,
  production?: ProductionSettings,
): { demoOnly: boolean; reasons: string[]; modules: number } {
  const lists = radiusLists(run);
  const round = [...lists.modules, ...lists.upper, ...lists.mezz, ...lists.over].filter((unit) => unit.radius);
  /* Плита по дуге бывает и без радиусного модуля: скруглённый угол столешницы у конца ряда — тот же рез на ЧПУ. */
  let cnc = countertopCurveMm(run) > 0;
  if (round.length === 0 && !cnc) return { demoOnly: false, reasons: [], modules: 0 };
  const methods = radiusMethods((production ?? run.production)?.radius);
  const bent = new Set<string>();
  /*
   * Форма, заданная раньше, которую движок сейчас не принял бы (в замере
   * появилась стена у торца, цех поднял наименьший радиус гибки), в цех не
   * уходит: деталь по ней не соберут или не сделают — словами (`staleRadius`).
   */
  const stale = round.flatMap((unit) => {
    const refusal = staleRefusal(unit, lists, run, production);
    return refusal ? [`«${unit.label}» — ${lowerFirst(refusal)}`] : [];
  });
  for (const unit of round) {
    const dims = radiusDimsOf(
      unit,
      { heightMm: moduleCarcassHeightMm(unit, run), depthMm: moduleDepthMm(unit, run.zone, run.production) },
      production ?? run.production,
    );
    for (const part of radiusParts(unit, dims)) {
      if (part.process === 'cnc') cnc = true;
      if (part.process === 'bend') bent.add(BENT_WORD[part.kind] ?? part.kind);
    }
  }
  const reasons: string[] = [];
  if (cnc && !methods.cnc.confirmed) {
    reasons.push('контур по дуге (дно, крыша, полки, столешница) режут на ЧПУ — цех этот способ не подтвердил');
  }
  if (bent.size > 0) {
    const what = Array.from(bent).join(', ');
    if (!methods.bend.method) reasons.push(`гнутые детали (${what}) — способ гибки цех не выбрал`);
    else if (!methods.bend.confirmed) reasons.push(`гнутые детали (${what}) — способ «${BEND_METHOD_TITLE[methods.bend.method]}» не подтверждён цехом`);
    else if (methods.bend.minRadiusMm === null) reasons.push(`гнутые детали (${what}) — наименьший радиус гибки цех не назвал`);
  }
  if (stale.length > 0) reasons.push(`форма не встаёт: ${stale.join('; ')}`);
  return { demoOnly: reasons.length > 0, reasons, modules: round.length };
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Почему форма модуля, заданная раньше, сейчас не встала бы — те же проверки, что у правки; `null` — встаёт. */
function staleRefusal(
  unit: Module,
  lists: ReturnType<typeof radiusLists>,
  run: Run,
  production?: ProductionSettings,
): string | null {
  if (!unit.radius) return null;
  return radiusCheck(unit, unit.radius, radiusRowOf(unit, lists, run), run, production) ?? hingeRefusal(unit, unit.radius);
}

/**
 * ФОРМА, ЗАДАННАЯ РАНЬШЕ, КОТОРАЯ СЕЙЧАС НЕ ВСТАЛА БЫ — СЛОВАМИ (OVAL & RADIUS).
 *
 * Правка ряда такую форму не запирает (`radiusAfterEdit` повторно давнее не
 * называет), а замер и цех меняются отдельно: у торца появилась стена, цех
 * поднял наименьший радиус гибки. Модуль остаётся дугой в сцене и смете, в
 * цех не уходит (`radiusMethodState`). Угол плиты, который сейчас не встал бы,
 * не применяется (`counterCornerOf`) — плита у того конца прямая, и это тоже
 * сказано: хранить радиус, который ни на что не влияет, молча нельзя.
 */
export function staleRadius(runs: Run[], production?: ProductionSettings): { id: string; severity: 'clarify'; message: string }[] {
  const items: string[] = [];
  for (const run of runs) {
    const lists = radiusLists(run);
    for (const unit of [...lists.modules, ...lists.upper, ...lists.mezz, ...lists.over]) {
      const refusal = staleRefusal(unit, lists, run, production);
      if (refusal) items.push(`«${unit.label}» — ${lowerFirst(refusal)} Модуль по-прежнему дугой в сцене и смете, в цех не уходит`);
    }
    for (const end of ['start', 'end'] as const) {
      const radiusMm = run.counterCorners?.[end];
      if (!radiusMm || counterCornerOf(run, end) !== null) continue;
      const why = counterCornerRefusal(run, end, radiusMm) ?? '';
      items.push(`угол плиты у ${end === 'start' ? 'начала' : 'конца'} ряда R${radiusMm} не применён — ${lowerFirst(why)} Плита у этого конца прямая`);
    }
  }
  if (items.length === 0) return [];
  return [
    {
      id: 'radius-stale',
      severity: 'clarify',
      message:
        `Форма, заданная раньше, сейчас не встаёт: ${items.slice(0, 2).join('; ')}` +
        `${items.length > 2 ? `; и ещё ${items.length - 2}` : ''}. Поправьте в блоке «Форма · радиус».`,
    },
  ];
}

/**
 * ПОМЕТКА «РАДИУСНЫЙ» БЕЗ ФОРМЫ МОДУЛЯ — СЛОВАМИ (OVAL & RADIUS).
 *
 * До этапа радиус был пометкой фасада (`construct: 'radius'`): сохранённые с
 * ней модули режутся и рисуются прямыми. Называть их гнутыми нельзя, молчать
 * — тоже: одна строка на объект, с последствием и тем, что делать.
 */
export function flatRadiusFronts(runs: Run[]): { id: string; severity: 'clarify'; message: string }[] {
  const flat = runs
    .flatMap((run) => {
      const lists = radiusLists(run);
      return [...lists.modules, ...lists.upper, ...lists.mezz, ...lists.over];
    })
    .filter(
      (unit) =>
        !unit.radius &&
        (unit.front?.construct === 'radius' || Object.values(unit.leafFronts ?? {}).some((spec) => spec.construct === 'radius')),
    );
  if (flat.length === 0) return [];
  const names = flat.slice(0, 3).map((unit) => `«${unit.label}»`).join(', ');
  return [
    {
      id: 'radius-flat-front',
      severity: 'clarify',
      message:
        `Фасад помечен «радиусный», а формы у модуля нет (${names}${flat.length > 3 ? ` и ещё ${flat.length - 3}` : ''}): ` +
        'в раскрое, смете и сцене он прямой. Дугу задаёт блок «Форма · радиус».',
    },
  ];
}

/**
 * ЧТО ПРЕДЛАГАЕТ БЛОК «ФОРМА · РАДИУС» У ПРЯМОУГОЛЬНОГО МОДУЛЯ — и почему нельзя.
 *
 * Торец справа и слева, фасад дугой выпуклый и вогнутый; радиус — по умолчанию
 * (`defaultRadiusMm`), закрытие — гнутая дверца, если встаёт, иначе открытые
 * полки. Отказ — той же `radiusEdit`, что проверяет правку. Одна функция на
 * кнопки блока и на ожидания приёмки: «что под кнопкой» не считается второй раз.
 */
export function radiusOffers(unit: Module, run: Run): { key: 'right' | 'left' | 'front' | 'concave'; spec: RadiusSpec; refusal: string | null }[] {
  const row = radiusRowOf(unit, radiusLists(run), run);
  const size = { widthMm: unit.widthMm, depthMm: moduleDepthMm(unit, run.zone, run.production) };
  const refusalOf = (spec: RadiusSpec): string | null => {
    const outcome = radiusEdit(unit, spec, row, run);
    return 'refusal' in outcome ? outcome.refusal : null;
  };
  const withCover = (spec: Omit<RadiusSpec, 'cover'>): RadiusSpec => {
    const door: RadiusSpec = { ...spec, cover: 'door' };
    return refusalOf(door) ? { ...spec, cover: 'open' } : door;
  };
  const end = (place: 'left' | 'right'): RadiusSpec =>
    withCover({ place, radiusMm: defaultRadiusMm(place, size, row.island), ...(row.island ? { back: true as const } : {}) });
  const arc = (direction: 'convex' | 'concave'): RadiusSpec =>
    withCover({ place: 'front', radiusMm: defaultRadiusMm('front', size), ...(direction === 'concave' ? { direction } : {}) });
  const specs = [
    { key: 'right' as const, spec: end('right') },
    { key: 'left' as const, spec: end('left') },
    { key: 'front' as const, spec: arc('convex') },
    { key: 'concave' as const, spec: arc('concave') },
  ];
  return specs.map((item) => ({ ...item, refusal: refusalOf(item.spec) }));
}

/**
 * «РАДИУСНЫЙ» В ВЫБОРЕ ФАСАДА — ФОРМА МОДУЛЯ (OVAL & RADIUS).
 *
 * Кнопка конструкции фасада раньше ставила пометку (`construct: 'radius'`):
 * деталь резалась прямой. Теперь она ставит форму: свободный край ряда —
 * скруглённый торец, иначе фасад дугой; радиус — по умолчанию
 * (`defaultRadiusMm`); гнутая дверца, если встаёт, иначе открытые полки. Что
 * встанет — та же `radiusEdit`, что у блока «Форма · радиус»; не встаёт
 * ничего — отказ её словами.
 */
export function radiusOfferFor(unit: Module, run: Run): { spec: RadiusSpec } | { refusal: string } {
  const lists = radiusLists(run);
  const row = radiusRowOf(unit, lists, run);
  const sorted = [...row.units].sort((a, b) => a.offsetMm - b.offsetMm);
  const at = sorted.findIndex((item) => item.id === unit.id);
  /* Торец — у края ряда, где место его принимает (не угол кухни, не стена комнаты); иначе — фасад дугой. */
  const edges: RadiusSpec['place'][] = [...(at === sorted.length - 1 ? (['right'] as const) : []), ...(at === 0 ? (['left'] as const) : [])];
  const place: RadiusSpec['place'] =
    edges.find((side) => radiusPlaceRefusal(unit, { place: side, radiusMm: RADIUS_MIN_MM, cover: 'open' }, row) === null) ?? 'front';
  const size = { widthMm: unit.widthMm, depthMm: moduleDepthMm(unit, run.zone, run.production) };
  const back = row.island && place !== 'front';
  const base = { place, radiusMm: defaultRadiusMm(place, size, back), ...(back ? { back: true as const } : {}) };
  let refusal = '';
  for (const cover of ['door', 'open'] as const) {
    const spec: RadiusSpec = { ...base, cover };
    const outcome = radiusEdit(unit, spec, row, run);
    if (!('refusal' in outcome)) return { spec };
    refusal = outcome.refusal;
  }
  return { refusal };
}
