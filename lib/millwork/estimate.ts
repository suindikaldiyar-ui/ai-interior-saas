import {
  APPLIANCE_SLOTS,
  BUILT_IN_FRIDGE_FRONTS,
  hingesPerDoor,
  moduleAppliances,
  moduleDepthMm,
  moduleHeightMm,
} from './modules';
import { allModules } from './layout';
import { SLIDING_DOOR, displayLedMeters, sectionSpec, slidingDoorCount } from './sections';
import { MODULE_VARIANTS, hasBottom, isSinkBase, variantEstimateKeys } from './moduleVariants';
import { zoneProfile } from './zones';
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
  /*
   * У модуля под мойку ДНА НЕТ: там сифон. Это не мелочь оформления —
   * лишний лист ЛДСП в каждой кухне складывается в деньги, а в раскрое
   * появляется деталь, которую цех выбросит.
   */
  const horizontals = (hasBottom(unit) ? 2 : 1) * w * d;
  const shelf = unit.frontType === 'drawers' ? 0 : w * d;

  return (sides + horizontals + shelf) / MM2_IN_M2;
}

function backPanelAreaM2(unit: Module, ceilingHeightMm: number, upperToCeiling: boolean): number {
  const h = moduleHeightMm(unit.kind, { upperToCeiling, ceilingHeightMm });
  return (h * unit.widthMm) / MM2_IN_M2;
}

/** Площадь фасадов. У техники фасада нет — она приходит со своей панелью. */
function frontAreaM2(unit: Module, ceilingHeightMm: number, upperToCeiling: boolean): number {
  /*
   * Встроенный холодильник закрыт фасадом заподлицо — это плита ЛДСП или
   * МДФ во всю высоту пенала, и стоит она заметных денег. Отдельностоящий
   * не даёт в смету ни фасада, ни петель: разница между вариантами
   * измеряется десятками тысяч, поэтому это отдельные строки.
   */
  if (unit.builtIn) {
    const h = moduleHeightMm(unit.kind, { upperToCeiling, ceilingHeightMm });
    return (unit.widthMm * h) / MM2_IN_M2;
  }

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

  if (unit.builtIn) {
    // Корпус плюс периметр каждой створки фасада встройки.
    const doorH = h / BUILT_IN_FRIDGE_FRONTS;
    return 2 * (h + w) + BUILT_IN_FRIDGE_FRONTS * 2 * (doorH + w);
  }

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

/**
 * Статьи, которых на кухне нет вовсе.
 *
 * Двери-купе, штанга, зеркало, кабель-канал — это не «прочее», а самые
 * заметные деньги в своей зоне: система купе стоит дороже корпуса, а
 * зеркало в прихожей дороже фасада. Считаем их от того же ряда, что даёт
 * чертёж, чтобы смета и рисунок не разошлись.
 */
function sectionDrafts(run: Run): Draft[] {
  const zone = zoneProfile(run.zone);
  if (!run.zone || run.zone === 'kitchen') return [];

  const drafts: Draft[] = [];
  const modules = allModules(run);
  const heightMm =
    zone.height === 'ceiling' ? run.ceilingHeightMm : zone.height;
  const heightM = heightMm / MM_IN_M;

  /*
   * Двери-купе считаются по м² полотна и растут вместе с шириной шкафа,
   * а система (направляющие, ролики, стопоры) — комплектом на каждую дверь.
   */
  if (run.doorSystem === 'sliding') {
    const doors = slidingDoorCount(run.lengthMm);
    const doorWidthM = (run.lengthMm / doors + SLIDING_DOOR.overlapMm) / MM_IN_M;

    drafts.push(
      {
        key: 'sliding_door',
        title: 'Двери-купе',
        unit: 'm2',
        quantity: round2(doors * doorWidthM * heightM),
      },
      { key: 'sliding_system', title: 'Система купе (комплект на дверь)', unit: 'set', quantity: doors },
    );
  }

  for (const unit of modules) {
    if (!unit.section) continue;
    const spec = sectionSpec(unit.section);
    const widthM = round3(unit.widthMm / MM_IN_M);

    switch (unit.section) {
      case 'hanging_long':
        drafts.push(
          { key: 'wardrobe_rod', title: 'Штанга для одежды', unit: 'mp', quantity: widthM },
          { key: 'rod_holder', title: 'Держатели штанги', unit: 'pcs', quantity: 2 },
        );
        break;

      case 'hanging_double':
        // Две штанги в одной секции: 1000 сверху и 900 снизу.
        drafts.push(
          { key: 'wardrobe_rod', title: 'Штанга для одежды', unit: 'mp', quantity: round2(widthM * 2) },
          { key: 'rod_holder', title: 'Держатели штанги', unit: 'pcs', quantity: 4 },
        );
        break;

      case 'shelves':
      case 'open': {
        // Шаг полок 350 мм: сколько их влезает по высоте секции.
        const usableH = spec.heightMm > 0 ? spec.heightMm : heightMm;
        const count = Math.max(1, Math.floor(usableH / 350));
        drafts.push({
          key: 'shelf_panel',
          title: 'Полки',
          unit: 'm2',
          quantity: round2(count * widthM * (zone.depthMm / MM_IN_M)),
        });
        break;
      }

      case 'drawers':
        drafts.push({
          key: 'drawer_box',
          title: 'Ящики в сборе',
          unit: 'set',
          quantity: unit.drawerCount || spec.drawerCount,
        });
        break;

      case 'hooks':
        // Крючки по одному на 150 мм ширины: куртка, сумка, зонт.
        drafts.push({
          key: 'coat_hook',
          title: 'Крючки',
          unit: 'pcs',
          quantity: Math.max(2, Math.round(unit.widthMm / 150)),
        });
        break;

      case 'shoes':
        drafts.push({
          key: 'shoe_rack',
          title: 'Обувница наклонная (ярус)',
          unit: 'pcs',
          quantity: 3,
        });
        break;

      case 'bench':
        drafts.push({ key: 'bench_seat', title: 'Скамья с мягким сиденьем', unit: 'pcs', quantity: 1 });
        break;

      case 'mirror':
        drafts.push({
          key: 'mirror_panel',
          title: 'Зеркало',
          unit: 'm2',
          quantity: round2(widthM * (spec.heightMm / MM_IN_M)),
        });
        break;

      case 'tv_niche':
        drafts.push(
          { key: 'cable_channel', title: 'Кабель-канал за нишей', unit: 'mp', quantity: widthM },
          { key: 'led_niche', title: 'Подсветка ниши LED', unit: 'mp', quantity: widthM },
        );
        break;

      case 'hanging_module':
        drafts.push({
          key: 'hanging_bracket',
          title: 'Подвесной крепёж (комплект на модуль)',
          unit: 'set',
          quantity: 1,
        });
        break;

      case 'vanity':
        drafts.push({ key: 'sink_cutout', title: 'Вырез под раковину', unit: 'pcs', quantity: 1 });
        break;

      case 'mirror_cabinet':
        drafts.push({
          key: 'mirror_panel',
          title: 'Зеркало',
          unit: 'm2',
          quantity: round2(widthM * (spec.heightMm / MM_IN_M)),
        });
        break;

      default:
        break;
    }
  }

  /*
   * Прихожая с открытой вешалкой: обычная штанга вдоль стены в 400 мм не
   * помещается — плечики упираются в фасад. Нужен пантограф или торцевая
   * штанга, и это отдельные деньги, а не «штанга как везде».
   */
  if (run.zone === 'hallway' && modules.some((m) => m.section === 'hooks')) {
    drafts.push({
      key: 'rod_pantograph',
      title: 'Штанга торцевая или пантограф',
      unit: 'set',
      quantity: 1,
    });
  }

  return drafts;
}

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

    /*
     * Петли для встройки: фасад висит на дверце прибора, а не на корпусе,
     * и комплект у них свой. Без этой строки встроенный холодильник стоил
     * бы столько же, сколько отдельностоящий, — а разница ощутимая.
     */
    if (unit.builtIn) {
      const h = moduleHeightMm(unit.kind, { upperToCeiling, ceilingHeightMm: ceiling });
      hinges += BUILT_IN_FRIDGE_FRONTS * hingesPerDoor(h / BUILT_IN_FRIDGE_FRONTS);
      handles += BUILT_IN_FRIDGE_FRONTS;
    }
  }

  // Столешница: длина ряда плюс запил на угол, если ряд угловой.
  const hasCorner = run.modules.some((m) => m.kind === 'corner_base');
  const counterMp = round3(run.lengthMm / MM_IN_M);

  /*
   * Столешницы и фартука в спальне и прихожей нет вовсе. Считать их «на всякий
   * случай» нельзя: клиент увидел бы в смете позицию, которой не существует.
   */
  const zone = zoneProfile(run.zone);

  /*
   * В санузле корпус влагостойкий: обычный ЛДСП разбухает по кромке за пару
   * лет. Это другой материал и другая ставка, поэтому и ключ другой —
   * подставлять цену обычного было бы враньём в смете.
   */
  const carcassKey = zone.moistureProof ? 'ldsp_moisture' : 'ldsp_carcass';
  const carcassTitle = zone.moistureProof ? 'Корпус влагостойкий ЛДСП' : 'Корпус ЛДСП';

  const drafts: Draft[] = [
    { key: carcassKey, title: carcassTitle, unit: 'm2', quantity: round2(carcass) },
    { key: 'hdf_back', title: 'Задние стенки ХДФ', unit: 'm2', quantity: round2(backs) },
    { key: 'front_panel', title: 'Фасады', unit: 'm2', quantity: round2(fronts) },
    { key: 'pvc_edge', title: 'Кромка ПВХ', unit: 'mp', quantity: round2(edge / MM_IN_M) },
  ];

  if (zone.hasCountertop && zone.moistureProof) {
    // Санузел: столешница своя, влагостойкая, и запила на угол там не бывает.
    drafts.push({
      key: 'countertop_moisture',
      title: 'Столешница влагостойкая',
      unit: 'mp',
      quantity: counterMp,
    });
  } else if (zone.hasCountertop) {
    drafts.push({
      key: `countertop_${run.options.countertop}`,
      title: `Столешница (${countertopTitle(run.options.countertop)})`,
      unit: 'mp',
      quantity: counterMp,
    });

    if (hasCorner) {
      drafts.push({ key: 'countertop_miter', title: 'Запил столешницы на угол', unit: 'pcs', quantity: 1 });
    }

    drafts.push({
      key: 'countertop_plinth',
      title: 'Плинтус столешницы',
      unit: 'mp',
      quantity: counterMp,
    });
  }

  if (zone.hasApron) {
    drafts.push({
      key: 'wall_panel',
      title: 'Стеновая панель (фартук)',
      unit: 'mp',
      quantity: run.options.hasUpper ? counterMp : 0,
    });
  }

  drafts.push(
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

  /*
   * Витрина живёт и в кухне, и в зале, поэтому считается отдельно от
   * секционных зон: `sectionDrafts` на кухне не работает вовсе. Стекло в
   * раме — это не фасад ЛДСП, и подсветка идёт по контуру погонными
   * метрами, а не «комплектом».
   */
  for (const unit of modules) {
    if (unit.section !== 'glass_display') continue;
    const h = moduleHeightMm(unit.kind, { upperToCeiling, ceilingHeightMm: ceiling });

    drafts.push(
      {
        key: 'glass_front',
        title: 'Стеклянная дверь в раме',
        unit: 'm2',
        quantity: round2((unit.widthMm * h) / MM2_IN_M2),
      },
      {
        key: 'led_display',
        title: 'Подсветка витрины LED',
        unit: 'mp',
        quantity: displayLedMeters(unit.widthMm, h),
      },
    );
  }

  /*
   * Статьи вариантов: механизм карго, сушилка, подъёмник, карусель.
   * Корпус у них обычный — отдельной строкой идёт именно механизм,
   * иначе он растворится в стоимости ЛДСП и пропадёт из сметы.
   */
  for (const unit of modules) {
    for (const key of variantEstimateKeys(unit)) {
      const spec = MODULE_VARIANTS[unit.variant!];
      drafts.push({
        key,
        title: `${spec.title} (${unit.widthMm} мм)`,
        unit: key === 'glass_front' ? 'm2' : 'pcs',
        quantity:
          key === 'glass_front'
            ? round2(
                (unit.widthMm *
                  moduleHeightMm(unit.kind, { upperToCeiling, ceilingHeightMm: ceiling })) /
                  MM2_IN_M2,
              )
            : 1,
      });
    }
  }

  drafts.push(...sectionDrafts(run));

  /*
   * Техника и мойка — отдельными позициями, их клиент часто покупает сам.
   * В колонне приборов ДВА, и второй терять нельзя: клиент заказал
   * микроволновку, а в смете её нет — это разговор о доверии, а не о
   * девяноста тысячах.
   */
  for (const unit of modules) {
    for (const appliance of moduleAppliances(unit)) {
      drafts.push({
        key: `appliance_${appliance}`,
        title: APPLIANCE_SLOTS[appliance].title,
        unit: 'pcs',
        quantity: 1,
      });
    }
  }

  if (modules.some((m) => m.appliance === 'sink600' || m.appliance === 'sink800')) {
    drafts.push({ key: 'faucet', title: 'Смеситель', unit: 'pcs', quantity: 1 });
  }

  /*
   * Модуль под мойку — отдельная работа: бездонный корпус и вырез под
   * сифон. Она есть в каждой кухне и раньше не считалась вовсе.
   */
  const sinkBases = modules.filter(isSinkBase).length;
  if (sinkBases > 0) {
    drafts.push({
      key: 'sink_base',
      title: 'Модуль под мойку (без дна, вырез)',
      unit: 'pcs',
      quantity: sinkBases,
    });
  }

  /*
   * Схлопываем строки с одинаковым ключом. Два модуля одного прибора обязаны
   * дать ОДНУ строку с количеством 2, а не две строки по одной цене: иначе
   * в смете появляются деньги, которых нет, и итог перестаёт сходиться
   * с составом ряда.
   */
  const merged = new Map<string, Draft>();
  for (const draft of drafts) {
    if (draft.quantity <= 0) continue;
    const existing = merged.get(draft.key);
    if (existing) {
      existing.quantity = round2(existing.quantity + draft.quantity);
    } else {
      merged.set(draft.key, { ...draft });
    }
  }

  return Array.from(merged.values());
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

  return { variant, lines, total, priceSnapshot, calculatedAt, fingerprint: run.fingerprint };
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
