import {
  APPLIANCE_SLOTS,
  hingesPerDoor,
  moduleDepthMm,
  moduleHeightMm,
} from './modules';
import { allModules } from './layout';
import type {
  Estimate,
  EstimateLine,
  EstimateUnit,
  Module,
  Run,
  VariantKey,
} from '@/types/millwork';

/**
 * Смета из спецификации материалов.
 *
 * Ни одно число здесь не приходит от модели. Ставки берутся из каталога
 * организации, а не из кода: у каждой компании своя себестоимость.
 * В сохранённую смету кладётся снимок ставок на дату расчёта — иначе
 * подписанный договор «поплывёт» при следующей переоценке каталога.
 */

const MM2_IN_M2 = 1_000_000;
const MM_IN_M = 1000;

/** Ставки: ключ статьи → цена за единицу. Приходят из catalog_items. */
export type RateTable = Record<string, number>;

type Draft = {
  key: string;
  title: string;
  unit: EstimateUnit;
  quantity: number;
};

const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/* ─────────────────────────  Раскрой  ───────────────────────── */

/**
 * Площадь деталей ЛДСП на модуль: два бока, дно, крыша и одна полка.
 * Задняя стенка идёт ХДФ и считается отдельной статьёй.
 */
function carcassAreaM2(unit: Module, ceilingHeightMm: number, upperToCeiling: boolean): number {
  const h = moduleHeightMm(unit.kind, { upperToCeiling, ceilingHeightMm });
  const d = moduleDepthMm(unit.kind);
  const w = unit.widthMm;

  const sides = 2 * h * d;
  const horizontals = 2 * w * d;
  const shelf = unit.frontType === 'drawers' ? 0 : w * d;

  return (sides + horizontals + shelf) / MM2_IN_M2;
}

function backPanelAreaM2(unit: Module, ceilingHeightMm: number, upperToCeiling: boolean): number {
  const h = moduleHeightMm(unit.kind, { upperToCeiling, ceilingHeightMm });
  return (h * unit.widthMm) / MM2_IN_M2;
}

/** Площадь фасадов. У техники фасада нет — она приходит со своей панелью. */
function frontAreaM2(unit: Module, ceilingHeightMm: number, upperToCeiling: boolean): number {
  if (unit.frontType === 'appliance' || unit.frontType === 'none') return 0;
  const h = moduleHeightMm(unit.kind, { upperToCeiling, ceilingHeightMm });
  return (unit.widthMm * h) / MM2_IN_M2;
}

/**
 * Кромка ПВХ клеится по видимым торцам: периметр каждого фасада плюс
 * передние торцы корпуса. Это самая недооценённая статья в ручных сметах.
 */
function edgeBandingMm(unit: Module, ceilingHeightMm: number, upperToCeiling: boolean): number {
  const h = moduleHeightMm(unit.kind, { upperToCeiling, ceilingHeightMm });
  const w = unit.widthMm;

  if (unit.frontType === 'appliance' || unit.frontType === 'none') {
    return 2 * (h + w);
  }

  const fronts = unit.frontType === 'drawers' ? unit.drawerCount : unit.doorCount;
  const frontHeight = unit.frontType === 'drawers' ? h / Math.max(1, unit.drawerCount) : h;
  const frontWidth = unit.frontType === 'door' ? w / Math.max(1, unit.doorCount) : w;

  const frontEdges = fronts * 2 * (frontHeight + frontWidth);
  const carcassEdges = 2 * (h + w);

  return frontEdges + carcassEdges;
}

/* ─────────────────────────  Сборка строк  ───────────────────────── */

export function buildEstimateDrafts(run: Run): Draft[] {
  const upperToCeiling = run.options.upperToCeiling;
  const ceiling = run.ceilingHeightMm;
  const modules = allModules(run);

  const baseModules = run.modules.filter(
    (m) => m.kind === 'base' || m.kind === 'corner_base' || m.kind === 'filler',
  );

  let carcass = 0;
  let backs = 0;
  let fronts = 0;
  let edge = 0;
  let hinges = 0;
  let slides = 0;
  let lifts = 0;
  let handles = 0;

  for (const unit of modules) {
    carcass += carcassAreaM2(unit, ceiling, upperToCeiling);
    backs += backPanelAreaM2(unit, ceiling, upperToCeiling);
    fronts += frontAreaM2(unit, ceiling, upperToCeiling);
    edge += edgeBandingMm(unit, ceiling, upperToCeiling);

    if (unit.frontType === 'door') {
      const h = moduleHeightMm(unit.kind, { upperToCeiling, ceilingHeightMm: ceiling });
      // Верхние шкафы чаще делают на подъёмниках, нижние — на петлях.
      if (unit.kind === 'upper' || unit.kind === 'corner_upper') {
        lifts += unit.doorCount;
      }
      hinges += unit.doorCount * hingesPerDoor(h);
      handles += unit.doorCount;
    }

    if (unit.frontType === 'drawers') {
      slides += unit.drawerCount;
      handles += unit.drawerCount;
    }
  }

  // Столешница: длина ряда плюс запил на угол, если ряд угловой.
  const hasCorner = run.modules.some((m) => m.kind === 'corner_base');
  const counterMp = round3(run.lengthMm / MM_IN_M);

  const drafts: Draft[] = [
    { key: 'ldsp_carcass', title: 'Корпус ЛДСП', unit: 'm2', quantity: round2(carcass) },
    { key: 'hdf_back', title: 'Задние стенки ХДФ', unit: 'm2', quantity: round2(backs) },
    { key: 'front_panel', title: 'Фасады', unit: 'm2', quantity: round2(fronts) },
    { key: 'pvc_edge', title: 'Кромка ПВХ', unit: 'mp', quantity: round2(edge / MM_IN_M) },
    {
      key: `countertop_${run.options.countertop}`,
      title: `Столешница (${countertopTitle(run.options.countertop)})`,
      unit: 'mp',
      quantity: counterMp,
    },
  ];

  if (hasCorner) {
    drafts.push({ key: 'countertop_miter', title: 'Запил столешницы на угол', unit: 'pcs', quantity: 1 });
  }

  drafts.push(
    { key: 'countertop_plinth', title: 'Плинтус столешницы', unit: 'mp', quantity: counterMp },
    {
      key: 'wall_panel',
      title: 'Стеновая панель (фартук)',
      unit: 'mp',
      quantity: run.options.hasUpper ? counterMp : 0,
    },
    { key: `hinge_${run.options.hardwareClass}`, title: `Петли (${hardwareTitle(run.options.hardwareClass)})`, unit: 'pcs', quantity: hinges },
    { key: `slide_${run.options.hardwareClass}`, title: `Направляющие (${hardwareTitle(run.options.hardwareClass)})`, unit: 'set', quantity: slides },
    { key: 'lift_mechanism', title: 'Подъёмники верхних фасадов', unit: 'pcs', quantity: lifts },
    {
      key: run.options.integratedHandles ? 'handle_integrated' : 'handle_standard',
      title: run.options.integratedHandles ? 'Ручка-профиль' : 'Ручки',
      unit: run.options.integratedHandles ? 'mp' : 'pcs',
      quantity: run.options.integratedHandles ? counterMp : handles,
    },
    // Четыре регулируемые опоры на каждый нижний модуль.
    { key: 'leg_support', title: 'Опоры регулируемые', unit: 'pcs', quantity: baseModules.length * 4 },
    { key: 'fasteners', title: 'Крепёж и эксцентрики', unit: 'percent', quantity: round2(carcass) },
    { key: 'cutting', title: 'Распил и присадка', unit: 'm2', quantity: round2(carcass + fronts) },
  );

  if (run.options.hasCornice) {
    drafts.push({ key: 'cornice', title: 'Антресоль до потолка', unit: 'mp', quantity: counterMp });
  }

  // Техника и мойка — отдельными позициями, их клиент часто покупает сам.
  for (const unit of modules) {
    if (!unit.appliance) continue;
    drafts.push({
      key: `appliance_${unit.appliance}`,
      title: APPLIANCE_SLOTS[unit.appliance].title,
      unit: 'pcs',
      quantity: 1,
    });
  }

  if (modules.some((m) => m.appliance === 'sink600' || m.appliance === 'sink800')) {
    drafts.push({ key: 'faucet', title: 'Смеситель', unit: 'pcs', quantity: 1 });
  }

  return drafts.filter((d) => d.quantity > 0);
}

function countertopTitle(kind: Run['options']['countertop']): string {
  if (kind === 'quartz') return 'кварцевый агломерат';
  if (kind === 'solid_wood') return 'массив';
  return 'ЛДСП';
}

function hardwareTitle(kind: Run['options']['hardwareClass']): string {
  if (kind === 'blum') return 'Blum';
  if (kind === 'soft_close') return 'с доводчиками';
  return 'стандарт';
}

/* ─────────────────────────  Итог  ───────────────────────── */

/** Доставка и монтаж считаются процентом от подытога, а не от корпуса. */
export const DELIVERY_KEY = 'delivery_install';

export function buildEstimate(
  run: Run,
  variant: VariantKey,
  rates: RateTable,
  disabledKeys: string[] = [],
  calculatedAt = '1970-01-01T00:00:00.000Z',
): Estimate {
  const drafts = buildEstimateDrafts(run);
  const disabled = new Set(disabledKeys);
  const priceSnapshot: Record<string, number> = {};

  const lines: EstimateLine[] = drafts.map((draft) => {
    const rate = rates[draft.key] ?? 0;
    priceSnapshot[draft.key] = rate;

    // Крепёж задаётся процентом от стоимости корпуса, а не ценой за м².
    const isPercent = draft.unit === 'percent';
    const carcassRate = rates.ldsp_carcass ?? 0;
    const carcassQty = drafts.find((d) => d.key === 'ldsp_carcass')?.quantity ?? 0;

    const total = isPercent
      ? round2((carcassRate * carcassQty * rate) / 100)
      : round2(draft.quantity * rate);

    return {
      id: draft.key,
      key: draft.key,
      title: draft.title,
      unit: draft.unit,
      quantity: draft.quantity,
      rate,
      total,
      enabled: !disabled.has(draft.key),
      missingRate: rates[draft.key] === undefined,
    };
  });

  const subtotal = lines
    .filter((l) => l.enabled)
    .reduce((sum, l) => sum + l.total, 0);

  const deliveryRate = rates[DELIVERY_KEY] ?? 0;
  priceSnapshot[DELIVERY_KEY] = deliveryRate;

  if (deliveryRate > 0) {
    lines.push({
      id: DELIVERY_KEY,
      key: DELIVERY_KEY,
      title: 'Доставка и монтаж',
      unit: 'percent',
      quantity: round2(deliveryRate),
      rate: deliveryRate,
      total: round2((subtotal * deliveryRate) / 100),
      enabled: !disabled.has(DELIVERY_KEY),
    });
  }

  const total = round2(
    lines.filter((l) => l.enabled).reduce((sum, l) => sum + l.total, 0),
  );

  return { variant, lines, total, priceSnapshot, calculatedAt };
}

/** Пересчёт итога после снятия галочек — без обращения к каталогу. */
export function recalcTotal(estimate: Estimate, disabledKeys: string[]): Estimate {
  const disabled = new Set(disabledKeys);
  const lines = estimate.lines.map((l) => ({ ...l, enabled: !disabled.has(l.key) }));

  const withoutDelivery = lines.filter((l) => l.key !== DELIVERY_KEY && l.enabled);
  const subtotal = withoutDelivery.reduce((sum, l) => sum + l.total, 0);

  const withDelivery = lines.map((l) =>
    l.key === DELIVERY_KEY
      ? { ...l, total: round2((subtotal * l.rate) / 100) }
      : l,
  );

  const total = round2(
    withDelivery.filter((l) => l.enabled).reduce((sum, l) => sum + l.total, 0),
  );

  return { ...estimate, lines: withDelivery, total };
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

export const UNIT_LABEL_MW: Record<EstimateUnit, string> = {
  m2: 'м²',
  mp: 'м.п.',
  pcs: 'шт',
  set: 'компл.',
  percent: '%',
};
