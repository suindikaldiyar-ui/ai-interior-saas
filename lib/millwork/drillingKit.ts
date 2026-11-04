import { DEFAULT_PRODUCTION, DRILLING_KIT_SLOTS, EMPTY_DRILLING } from '@/types/catalog';
import type { DrillingKit, DrillingKitSlot, DrillingSettings, HardwareItem, ProductionSettings } from '@/types/catalog';
import type { MillworkOp, Run, RunRequirements } from '@/types/millwork';
import { DEMO_REQUIREMENTS } from './demo';
import { drawerBoxRulesOf } from './drawerBox';
import {
  cupScrewsUnknown,
  drillingBlockers,
  drillingPlan,
  drillingSummary,
  hardwareSource,
  hardwareSpec,
  type DrillingPlan,
} from './drillingPlan';
import { FITTING_SLOT_TITLE, fittingItemId, fittingSlotsOf, fittingVerdict, hingeBoringMm, slotAccepts } from './fittings';
import { handleItemModel } from './handleModel';
import { hingeCupOf, plateHolesOf } from './hingePlace';
import { allModules, buildRun } from './layout';
import { applyOps } from './ops';
import { chainPositions } from './drilling';
import {
  CORNER_FILLER_PANEL_NAME,
  CORNER_MEZZ_FILLER_PANEL_NAME,
  CORNER_OWNER_FILLER_PANEL_NAME,
  CORNER_OWNER_MEZZ_FILLER_PANEL_NAME,
  CORNER_OWNER_UPPER_FILLER_PANEL_NAME,
  CORNER_UPPER_FILLER_PANEL_NAME,
  DIVIDER_PANEL_NAME,
  DRAWER_FRONT_PANEL_NAME,
  HDIVIDER_PANEL_NAME,
  TAIL_FILLER_PANEL_NAME,
  type PanelWall,
} from './panels';
import { DRAWER_BOTTOM_PANEL_NAME, DRAWER_WALL_PANEL_NAME } from './drawerBox';
import { TOP_FILLER_PANEL_NAME } from './topFiller';

/**
 * КОМПЛЕКТ ЦЕХА И ГОТОВНОСТЬ ПРИСАДКИ (слой 88).
 *
 * Присадка считается `drillingPlan` — здесь ни одного отверстия. Здесь два ответа, без которых человек, не
 * знающий мебельной присадки, не дойдёт до неё сам:
 *
 *   КОМПЛЕКТ — какие изделия цех обычно ставит. На модули он ложится ОДНИМ нажатием (`kitPlan`): те же
 *   `set_fitting`, та же проверка паспорта `fittingVerdict`, только на пустые места. Поставленное человеком не
 *   трогается, не вставшее названо словами. После этого смета, сцена и присадка читают обычные `Module.fittings`.
 *
 *   ГОТОВНОСТЬ — что уже есть и чего нет, по шагам, и кто это закрывает: числа производителя не правятся,
 *   правила цеха не подставляются, галочку ставит только человек.
 *
 * Учебный шкаф 600 × 720 × 560 собран тем же движком, что любой ряд: это проба настроек, а не образец размеров.
 */

export const KIT_SLOT_TITLE: Record<DrillingKitSlot, string> = {
  hinge: 'Петля',
  hinge_plate: 'Монтажная планка',
  slide: 'Направляющая',
  handle: 'Ручка',
  shelf_support: 'Полкодержатель',
};

/**
 * Детали, которые цех вправе отметить «крепится без присадки» (`noDrillParts`). Боковин, дна и крыши здесь нет:
 * у них присадка считается. Имена — константы раскроя, как их видит план.
 */
export const DRILL_OPTIONAL_PARTS: readonly string[] = [
  DRAWER_FRONT_PANEL_NAME,
  DRAWER_WALL_PANEL_NAME,
  DRAWER_BOTTOM_PANEL_NAME,
  DIVIDER_PANEL_NAME,
  HDIVIDER_PANEL_NAME,
  'Доборная планка',
  TAIL_FILLER_PANEL_NAME,
  CORNER_FILLER_PANEL_NAME,
  CORNER_UPPER_FILLER_PANEL_NAME,
  CORNER_OWNER_FILLER_PANEL_NAME,
  CORNER_OWNER_UPPER_FILLER_PANEL_NAME,
  CORNER_MEZZ_FILLER_PANEL_NAME,
  CORNER_OWNER_MEZZ_FILLER_PANEL_NAME,
  TOP_FILLER_PANEL_NAME,
  'Рейка',
];

/* ─────────────────────────── комплект на модули ─────────────────────────── */

export type KitRow = {
  wallId: string;
  wallLabel: string;
  moduleId: string;
  moduleLabel: string;
  slot: DrillingKitSlot;
  bayId?: string;
  where: string;
  /** `set` — встанет, `kept` — у места уже своя позиция (не трогаем), `refused` — паспорт не сходится с модулем. */
  state: 'set' | 'kept' | 'refused';
  words: string;
};

export type KitPlan = {
  rows: KitRow[];
  /** Операции по стенам: то, что уйдёт в `applyOps`. */
  ops: Record<string, MillworkOp[]>;
  set: number;
  kept: number;
  refused: number;
  /** Места, для которых в комплекте цеха изделия нет: названия мест, без повторов. */
  empty: string[];
  /** Что встанет без цены каталога: итог станет «неполным» — это говорится до нажатия. */
  unpriced: string[];
};

export function kitPlan(input: {
  walls: PanelWall[];
  kit: DrillingKit | undefined;
  hardware: Map<string, HardwareItem>;
  production?: ProductionSettings;
}): KitPlan {
  const production = input.production ?? DEFAULT_PRODUCTION;
  const kit = input.kit ?? {};
  const rows: KitRow[] = [];
  const ops: Record<string, MillworkOp[]> = {};
  const empty = new Set<string>();
  const unpriced = new Set<string>();
  for (const wall of input.walls) {
    for (const unit of allModules(wall.run)) {
      for (const place of fittingSlotsOf(unit, wall.run, production, input.hardware)) {
        if (!(DRILLING_KIT_SLOTS as readonly string[]).includes(place.slot)) continue;
        const slot = place.slot as DrillingKitSlot;
        const row = {
          wallId: wall.wallId,
          wallLabel: wall.label,
          moduleId: unit.id,
          moduleLabel: unit.label,
          slot,
          ...(place.bayId ? { bayId: place.bayId } : {}),
          where: place.where,
        };
        if (fittingItemId(unit, slot, place.bayId)) {
          rows.push({ ...row, state: 'kept', words: 'здесь уже своя позиция — комплект её не трогает' });
          continue;
        }
        const id = kit[slot];
        if (!id) {
          empty.add(KIT_SLOT_TITLE[slot]);
          continue;
        }
        const item = input.hardware.get(id);
        if (!item) {
          rows.push({ ...row, state: 'refused', words: `позиции комплекта «${KIT_SLOT_TITLE[slot]}» нет в каталоге организации` });
          continue;
        }
        const verdict = fittingVerdict({ unit, run: wall.run, slot, item, bayId: place.bayId, production, catalog: input.hardware });
        if (verdict.state === 'refused') {
          rows.push({ ...row, state: 'refused', words: verdict.summary });
          continue;
        }
        rows.push({ ...row, state: 'set', words: `${FITTING_SLOT_TITLE[slot]}: ${item.hardware.manufacturerArticle ?? item.article}` });
        if (!(item.price > 0)) unpriced.add(KIT_SLOT_TITLE[slot]);
        (ops[wall.wallId] ??= []).push({ op: 'set_fitting', moduleId: unit.id, slot, itemId: item.id, ...(place.bayId ? { bayId: place.bayId } : {}) } as MillworkOp);
      }
    }
  }
  const count = (state: KitRow['state']) => rows.filter((r) => r.state === state).length;
  return { rows, ops, set: count('set'), kept: count('kept'), refused: count('refused'), empty: Array.from(empty), unpriced: Array.from(unpriced) };
}

/* ─────────────────────────── что о позиции известно ─────────────────────────── */

/** Четыре уровня настройки: их нельзя смешивать (ТЗ, этап 3). */
export type FactLevel = 'manufacturer' | 'shop' | 'unconfirmed' | 'missing';
export const FACT_LEVEL_TITLE: Record<FactLevel, string> = {
  manufacturer: 'Подтверждено производителем',
  shop: 'Подтверждено цехом',
  unconfirmed: 'Требует подтверждения',
  missing: 'Не рассчитано',
};
export type SettingFact = { label: string; value: string | null; level: FactLevel; source?: string };

const printed = (label: string, value: number | string | null | undefined, unit: string, item: HardwareItem): SettingFact =>
  value === null || value === undefined || value === ''
    ? { label, value: null, level: 'missing', source: `${hardwareSource(item)}: не напечатано` }
    : { label, value: `${value}${unit}`, level: 'manufacturer', source: hardwareSource(item) };

/**
 * ЧТО НАПЕЧАТАЛ ПРОИЗВОДИТЕЛЬ — той же записью, что читает присадка. Позиция прочитана без паспорта (`detail:
 * 'light'`) — «ещё не дочитан», а не «нет»: отсутствие и недочитанное — разные вещи.
 */
export function itemFacts(slot: DrillingKitSlot, item: HardwareItem): { facts: SettingFact[]; complete: boolean; why: string[]; unread: boolean } {
  /* Ручку считают размеры записи изделия: присадка паспорта ей не нужна. Остальным — нужна. */
  if (item.detail === 'light' && slot !== 'handle') return { facts: [], complete: false, why: ['паспорт позиции ещё не дочитан'], unread: true };
  const why: string[] = [];
  const facts: SettingFact[] = [];
  if (slot === 'hinge') {
    const cup = hingeCupOf(item);
    facts.push(printed('Чашка, Ø', cup.diameterMm, ' мм', item), printed('Чашка, глубина', cup.depthMm, ' мм', item));
    if (cup.diameterMm === null) why.push('диаметр чашки не напечатан');
    if (cup.depthMm === null) why.push('глубина чашки не напечатана');
    if (cupScrewsUnknown(item)) why.push('положение саморезов чашки в паспорте не образмерено — выпуск останется заперт: выберите петлю с напечатанным креплением');
  } else if (slot === 'hinge_plate') {
    const holes = plateHolesOf(item);
    const spec = hardwareSpec(item, 'cabinet_side');
    facts.push(
      printed('Между отверстиями', holes?.spacing ?? null, ' мм', item),
      printed('От передней кромки', holes?.fromEdge ?? null, ' мм', item),
      printed('Отверстие, Ø', spec?.diameterMm ?? null, ' мм', item),
      printed('Отверстие, глубина', spec?.depthMm ?? null, ' мм', item),
    );
    if (!holes) why.push('расстояния отверстий планки не напечатаны');
    if (spec?.diameterMm === null || spec?.diameterMm === undefined) why.push('диаметр отверстий планки не напечатан');
    if (spec?.depthMm === null || spec?.depthMm === undefined) why.push('глубина отверстий планки не напечатана');
  } else if (slot === 'slide') {
    const cab = hardwareSpec(item, 'cabinet_side');
    const chain = chainPositions(cab?.positionsMm ?? null);
    facts.push(
      printed('Цепочка на корпусе', cab?.positionsMm ?? null, ' мм', item),
      printed('Крепёж (как напечатано)', cab?.what ?? null, '', item),
      printed('Длина NL', item.hardware.dimensionsMm?.nominalLength ?? null, ' мм', item),
    );
    if (!chain) why.push('цепочки отверстий на корпусе в паспорте нет');
  } else if (slot === 'handle') {
    const model = handleItemModel(item).model;
    const spacing = model?.shape === 'knob' ? 0 : (item.hardware.dimensionsMm?.holeSpacing ?? null);
    facts.push(printed('Межосевое', spacing === 0 ? 'кнопка: одно отверстие' : spacing, spacing === 0 ? '' : ' мм', item));
    if (!model) why.push('модели ручки по размерам паспорта нет — место не вычислить');
    if (spacing === null) why.push('межосевое не напечатано');
    if (model?.shape === 'edge' || model?.shape === 'strip') why.push('ручка для кромки: крепление в паспорте не образмерено');
  } else {
    const spec = hardwareSpec(item, 'cabinet_side') ?? hardwareSpec(item, 'other');
    facts.push(printed('Отверстие, Ø', spec?.diameterMm ?? null, ' мм', item), printed('Отверстие, глубина', spec?.depthMm ?? null, ' мм', item));
    if (!spec) why.push('присадки полкодержателя в паспорте нет');
    else {
      if (spec.diameterMm === null) why.push('диаметр отверстия не напечатан');
      if (spec.depthMm === null) why.push('глубина отверстия не напечатана');
    }
  }
  return { facts, complete: why.length === 0, why, unread: false };
}

/** Позиции каталога для места комплекта: те же, что принимает место модуля; производитель и артикул — как у панели. */
export function kitCandidates(slot: DrillingKitSlot, hardware: Map<string, HardwareItem>): HardwareItem[] {
  return Array.from(hardware.values())
    .filter((item) => item.active && slotAccepts(slot, item))
    .sort((a, b) => (a.hardware.manufacturer ?? '').localeCompare(b.hardware.manufacturer ?? '', 'ru') || (a.hardware.manufacturerArticle ?? a.article).localeCompare(b.hardware.manufacturerArticle ?? b.article, 'ru'));
}

/* ─────────────────────────── готовность ─────────────────────────── */

export type ReadinessState = 'ready' | 'needs_item' | 'needs_rule' | 'needs_confirm' | 'error';
export const READINESS_TITLE: Record<ReadinessState, string> = {
  ready: 'Готово',
  needs_item: 'Требуется выбор изделия',
  needs_rule: 'Требуется правило цеха',
  needs_confirm: 'Требуется подтверждение',
  error: 'Обнаружена конструкционная ошибка',
};
const WORST: ReadinessState[] = ['error', 'needs_item', 'needs_rule', 'needs_confirm', 'ready'];

export type ReadinessKey = 'joints' | 'shelves' | 'hinges' | 'plates' | 'runners' | 'handles' | 'remain' | 'confirm';
export type ReadinessStep = { key: ReadinessKey; title: string; state: ReadinessState; words: string[]; facts: SettingFact[] };
export type DrillingReadiness = { steps: ReadinessStep[]; state: ReadinessState; title: string };

const worst = (states: ReadinessState[]): ReadinessState => WORST.find((s) => states.includes(s)) ?? 'ready';

/** Число правила цеха: задано и подтверждено, задано и не подтверждено, не задано. */
function ruleFact(label: string, value: string | null, confirmed: boolean): SettingFact {
  return value === null ? { label, value: null, level: 'missing', source: 'правило цеха не задано' } : { label, value, level: confirmed ? 'shop' : 'unconfirmed', source: 'правило цеха' };
}

export function drillingReadiness(input: {
  rules: DrillingSettings | null | undefined;
  hardware: Map<string, HardwareItem>;
  production?: ProductionSettings;
}): DrillingReadiness {
  const rules = input.rules ?? EMPTY_DRILLING;
  const production = input.production ?? DEFAULT_PRODUCTION;
  const kit = rules.kit ?? {};
  const ok = rules.confirmed;
  const itemOf = (slot: DrillingKitSlot) => (kit[slot] ? (input.hardware.get(kit[slot]!) ?? null) : null);
  const steps: ReadinessStep[] = [];
  /* Изделие: не выбрано, нет в каталоге, паспорт неполон — всё «выбор изделия»: другой артикул это и закрывает. */
  const itemStep = (slot: DrillingKitSlot, words: string[], facts: SettingFact[]): boolean => {
    const item = itemOf(slot);
    if (!kit[slot]) {
      words.push(`${KIT_SLOT_TITLE[slot]} цеха не выбрана`);
      return false;
    }
    if (!item) {
      words.push(`${KIT_SLOT_TITLE[slot]}: позиции нет в прочитанном каталоге организации`);
      return false;
    }
    const known = itemFacts(slot, item);
    facts.push({ label: KIT_SLOT_TITLE[slot], value: `${item.hardware.manufacturer ?? ''} ${item.hardware.manufacturerArticle ?? item.article}`.trim(), level: 'manufacturer', source: hardwareSource(item) }, ...known.facts);
    if (!known.complete) words.push(...known.why);
    return known.complete;
  };
  const push = (key: ReadinessKey, title: string, itemOk: boolean, ruleOk: boolean, words: string[], facts: SettingFact[]) => {
    const state: ReadinessState = !itemOk ? 'needs_item' : !ruleOk ? 'needs_rule' : 'ready';
    steps.push({ key, title, state, words, facts });
  };

  {
    const c = rules.confirmat;
    const words: string[] = c ? [] : ['схема конфирматов не задана'];
    const facts = [
      ruleFact('Конфирмат: Ø в пласти', c ? `${c.faceDiameterMm} мм` : null, ok),
      ruleFact('Конфирмат: Ø в торце', c ? `${c.edgeDiameterMm} мм` : null, ok),
      ruleFact('Конфирмат: глубина в торце', c ? `${c.edgeDepthMm} мм` : null, ok),
      ruleFact('От передней кромки', c ? `${c.fromFrontMm} мм` : null, ok),
      ruleFact('От задней кромки', c ? `${c.fromBackMm} мм` : null, ok),
    ];
    push('joints', 'Соединение корпуса', true, c !== null, words, facts);
  }
  {
    const words: string[] = [];
    const facts: SettingFact[] = [];
    const itemOk = itemStep('shelf_support', words, facts);
    const s = rules.shelfSupport;
    if (!s) words.push('оси полкодержателей от кромок не заданы');
    facts.push(ruleFact('Ось от передней кромки', s ? `${s.frontMm} мм` : null, ok), ruleFact('Ось от задней кромки', s ? `${s.backMm} мм` : null, ok));
    push('shelves', 'Полкодержатели', itemOk, s !== null, words, facts);
  }
  {
    const words: string[] = [];
    const facts: SettingFact[] = [];
    const itemOk = itemStep('hinge', words, facts);
    if (rules.hingeEdgeMm === null) words.push('от края фасада до оси крайней чашки не задано');
    if (rules.hingeCount.length === 0) words.push('сколько петель на какую высоту фасада — не задано');
    facts.push(
      ruleFact('От края фасада до чашки', rules.hingeEdgeMm === null ? null : `${rules.hingeEdgeMm} мм`, ok),
      ruleFact('Петель по высоте фасада', rules.hingeCount.length ? rules.hingeCount.map((r) => `до ${r.upToMm} — ${r.hinges}`).join(', ') : null, ok),
    );
    push('hinges', 'Петли', itemOk, rules.hingeEdgeMm !== null && rules.hingeCount.length > 0, words, facts);
  }
  {
    const words: string[] = [];
    const facts: SettingFact[] = [];
    let itemOk = itemStep('hinge_plate', words, facts);
    const hinge = itemOf('hinge');
    const plate = itemOf('hinge_plate');
    if (hinge && plate && hinge.detail !== 'light' && plate.detail !== 'light') {
      const tb = hingeBoringMm({ carcassMm: production.carcassMm, gapMm: production.frontGapMm }, hinge, plate);
      if (tb === null) {
        itemOk = false;
        words.push('с этой планкой TB не получается из таблицы наложения паспорта петли — выберите планку другого подъёма');
      } else facts.push({ label: 'TB (от кромки фасада до чашки)', value: `${tb} мм`, level: 'manufacturer', source: `${hardwareSource(hinge)}: таблица наложения с планкой ${plate.hardware.manufacturerArticle ?? plate.article}` });
    }
    if (!rules.plateOnCupAxis) words.push('«ось планки — на высоте оси чашки» цехом не отмечено');
    facts.push(ruleFact('Ось планки на оси чашки', rules.plateOnCupAxis ? 'да' : null, ok));
    push('plates', 'Монтажные планки', itemOk, rules.plateOnCupAxis, words, facts);
  }
  {
    const words: string[] = [];
    const facts: SettingFact[] = [];
    const itemOk = itemStep('slide', words, facts);
    const box = drawerBoxRulesOf(production.drawerBox);
    const hole = rules.runnerHole ?? null;
    if (!hole) words.push('сверло под винт направляющей (Ø и глубина) не задано');
    if (!box) words.push('правила короба ящика цеха не заданы — «Настройки цеха» → «Короб ящика»');
    facts.push(ruleFact('Сверло под винт, Ø', hole ? `${hole.diameterMm} мм` : null, ok), ruleFact('Сверло под винт, глубина', hole ? `${hole.depthMm} мм` : null, ok), ruleFact('Короб ящика цеха', box ? (production.drawerBox?.confirmed ? 'задан и подтверждён' : 'задан, не подтверждён') : null, production.drawerBox?.confirmed === true));
    push('runners', 'Направляющие и ящики', itemOk, hole !== null && box !== null, words, facts);
  }
  {
    const words: string[] = [];
    const facts: SettingFact[] = [];
    const itemOk = itemStep('handle', words, facts);
    if (rules.handleHoleMm === null) words.push('сверло под винт ручки не задано');
    if (!rules.handlePlaceConfirmed) words.push('место ручки на фасаде цехом не принято');
    facts.push(ruleFact('Сверло под винт ручки, Ø', rules.handleHoleMm === null ? null : `${rules.handleHoleMm} мм`, ok), ruleFact('Место ручки как в сцене', rules.handlePlaceConfirmed ? 'да' : null, ok));
    push('handles', 'Ручки', itemOk, rules.handleHoleMm !== null && rules.handlePlaceConfirmed, words, facts);
  }
  {
    const words = rules.minRemainMm === null ? ['минимальный остаток под глухим отверстием не задан'] : [];
    push('remain', 'Проверка глубины', true, rules.minRemainMm !== null, words, [ruleFact('Минимальный остаток материала', rules.minRemainMm === null ? null : `${rules.minRemainMm} мм`, ok)]);
  }
  steps.push({
    key: 'confirm',
    title: 'Подтверждение технологом',
    state: ok ? 'ready' : 'needs_confirm',
    words: ok ? [] : ['пока нет галочки «Цех подтвердил эти правила», присадка — черновик: выпуск заперт'],
    facts: [],
  });
  const state = worst(steps.map((s) => s.state));
  return { steps, state, title: READINESS_TITLE[state] };
}

/**
 * Состояние присадки ОБЪЕКТА — по плану, а не по настройкам: то, что написано над списком деталей. Порядок — кто
 * следующий закрывает: ошибка конструкции, затем выбор изделия, правило цеха, подтверждение.
 */
export function planReadiness(plan: DrillingPlan, rules: DrillingSettings | null | undefined): { state: ReadinessState; title: string; words: string } {
  const s = drillingSummary(plan);
  const blockers = drillingBlockers(plan);
  const state: ReadinessState =
    s.issues > 0
      ? 'error'
      : blockers.some((b) => b.who === 'choose')
        ? 'needs_item'
        : blockers.some((b) => b.who === 'shop')
          ? 'needs_rule'
          : !(rules?.confirmed ?? false)
            ? 'needs_confirm'
            : plan.release.open
              ? 'ready'
              : 'needs_rule';
  return { state, title: READINESS_TITLE[state], words: plan.release.open ? 'Присадка рассчитана и подтверждена: выпуск открыт.' : (plan.release.reasons[0] ?? '') };
}

/* ─────────────────────────── учебный шкаф ─────────────────────────── */

export const LESSON_CABINET = { widthMm: 600, heightMm: 720, depthMm: 560 } as const;

/**
 * Шкаф 600 × 720 × 560, две двери, одна полка. Размеры учебные; мебель собрана тем же `buildRun` и `applyOps`, что
 * любой ряд, а присадка — тем же `drillingPlan`: шаг «Проверка» мастера показывает настоящий результат настроек.
 */
export function lessonCabinet(input: { production?: ProductionSettings; hardware: Map<string, HardwareItem> }): {
  run: Run;
  wall: PanelWall;
  kit: KitPlan;
  plan: DrillingPlan;
} {
  const production = input.production ?? DEFAULT_PRODUCTION;
  const requirements: RunRequirements = { ...DEMO_REQUIREMENTS, mode: 'free', appliances: [], sections: [] };
  const empty = buildRun({ lengthMm: LESSON_CABINET.widthMm, ceilingHeightMm: 2700, requirements, openings: [], comms: [], production });
  const built = applyOps({ run: empty, requirements, ops: [{ op: 'add_module', kind: 'base', widthMm: LESSON_CABINET.widthMm, variant: 'door_two' }], hardware: input.hardware });
  const wall0: PanelWall = { wallId: 'lesson', label: 'Учебный шкаф', run: built };
  const kit = kitPlan({ walls: [wall0], kit: production.drilling?.kit, hardware: input.hardware, production });
  const run = applyOps({ run: built, requirements, ops: kit.ops.lesson ?? [], hardware: input.hardware });
  const wall: PanelWall = { ...wall0, run };
  return { run, wall, kit, plan: drillingPlan({ walls: [wall], production, hardware: input.hardware }) };
}
