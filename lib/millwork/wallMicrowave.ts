/**
 * СВЧ В НАВЕСНОМ ШКАФУ (FINAL MASTER STAGE, задача 2).
 *
 * Шкаф — вариант «Ниша под микроволновку» (`upper_micro`) верхнего ряда; модель прибора лежит на модуле
 * (`applianceModels.microwave`, операция `set_appliance_model` с `moduleId`). Без модели — прежняя открытая
 * ниша: ни чисел ниши, ни проверки нет, и это сказано. С моделью — ниша по инструкции производителя для
 * навесного шкафа (у BFL524MB2 — 9001974035, с. 21, рис. 16.5: 560⁺⁸ × 362⁺³ × ≥ 300, сзади до стены 16 мм,
 * у шкафа нет задней стенки, ставить не ниже 850 мм от пола).
 *
 * Одна раскладка ниши (`wallMicrowaveNiche`) на раскрой (полка над нишей, нет задней стенки), сцену
 * (коробка полки, модель прибора на дне шкафа), смету (строка модели) и проверки (`wallMicrowaveFindings`).
 * Своих чисел нет: просвет ниши — нижняя граница напечатанного диапазона, если шкаф выше; полка над ним —
 * неподвижная (на отверстиях 32 этот просвет не получить), и как цех крепит неподвижную полку, не задано —
 * выпуск заперт словами. Без three.
 */
import type { ProductionSettings } from '@/types/catalog';
import type { Module, Run } from '@/types/millwork';
import { applianceModel, modelTitle, ruleSource, type ApplianceModel } from './appliances';
import { moduleCarcassHeightMm, moduleDepthMm, upperBottomFor } from './fill';
import { shopOf } from './shop';

export const WALL_MICROWAVE_SHELF_NAME = 'Полка над нишей СВЧ';

/** Модель СВЧ, у которой напечатаны правила навесного шкафа; иначе `null`. */
export function wallMicrowaveModel(unit: Pick<Module, 'variant' | 'applianceModels'>): ApplianceModel | null {
  if (unit.variant !== 'upper_micro') return null;
  const model = applianceModel(unit.applianceModels?.microwave);
  return model?.microwave?.wall ? model : null;
}

export type WallMicrowaveNiche = {
  model: ApplianceModel;
  /** Просвет ниши от верха дна до низа полки (или крыши), мм. */
  clearMm: number;
  /** Полка над нишей: низ от низа корпуса, мм. Шкаф ровно на нишу — полки нет. */
  shelf: { fromMm: number } | null;
  /** Над полкой до крыши в свету, мм (открытая полка: фасада над нишей у шкафа нет). */
  aboveMm: number | null;
  /** Ниша не встаёт по высоте: внутри шкафа меньше напечатанного минимума. */
  short: boolean;
};

/**
 * РАСКЛАДКА НИШИ по высоте корпуса — одна на раскрой и сцену (им известна высота корпуса, ряд — нет).
 * Внутри ровно в напечатанном диапазоне — полки нет; выше — полка на нижней границе диапазона.
 */
export function wallMicrowaveNiche(unit: Pick<Module, 'variant' | 'applianceModels'>, carcassMm: number, production: Pick<ProductionSettings, 'carcassMm'>): WallMicrowaveNiche | null {
  const model = wallMicrowaveModel(unit);
  if (!model?.microwave?.wall) return null;
  const t = production.carcassMm;
  const inner = carcassMm - 2 * t;
  const [lo, hi] = model.microwave.wall.nicheHeightMm;
  if (inner < lo) return { model, clearMm: inner, shelf: null, aboveMm: null, short: true };
  if (inner <= hi) return { model, clearMm: inner, shelf: null, aboveMm: null, short: false };
  /* Полке нужна её толщина над нишей; не помещается — ниша до крыши, и это тот же отказ по высоте. */
  if (inner - lo < t) return { model, clearMm: inner, shelf: null, aboveMm: null, short: false };
  return { model, clearMm: lo, shelf: { fromMm: t + lo }, aboveMm: inner - lo - t, short: false };
}

export type WallMicrowaveFinding = { moduleId: string; level: 'blocking' | 'release'; words: string };

/** Можно ли получить просвет на отверстиях 32: полка t на шаге 32 даёт просветы 32·k − t. */
function onSystem32(lo: number, hi: number, t: number): boolean {
  for (let k = 1; k * 32 - t <= hi; k += 1) if (k * 32 - t >= lo) return true;
  return false;
}

/**
 * ПРОВЕРКИ ПО ИНСТРУКЦИИ: нарушено или физически не встаёт — блокирующее; нечем выпустить — выпуск заперт
 * (ловушка 792). Слова — с числом, документом и страницей; число — из факта модели.
 */
export function wallMicrowaveFindings(unit: Module, run: Run, production: ProductionSettings = shopOf(run.production)): WallMicrowaveFinding[] {
  const shop = shopOf(production);
  const t = shop.carcassMm;
  const carcass = moduleCarcassHeightMm(unit, run);
  const niche = wallMicrowaveNiche(unit, carcass, shop);
  if (!niche) return [];
  const wall = niche.model.microwave!.wall!;
  const general = niche.model.microwave!;
  const title = modelTitle(niche.model);
  const label = `«${unit.label || 'модуль'}»`;
  const src = ruleSource(niche.model, 'wall');
  const out: WallMicrowaveFinding[] = [];
  const innerW = unit.widthMm - 2 * t;
  const [wlo, whi] = wall.nicheWidthMm;
  if (innerW < wlo || innerW > whi) {
    out.push({
      moduleId: unit.id,
      level: 'blocking',
      words: `${label}: ${title} — ниша между боковинами ${innerW} мм, а нужно ${wlo}…${whi} мм (${src}) — ${innerW > whi ? `лишние ${innerW - whi}` : `не хватает ${wlo - innerW}`} мм`,
    });
  }
  const depth = moduleDepthMm(unit, run.zone, run.production);
  if (depth < wall.nicheDepthMinMm) {
    out.push({ moduleId: unit.id, level: 'blocking', words: `${label}: глубина шкафа ${depth} мм, а нише ${title} нужно не меньше ${wall.nicheDepthMinMm} мм (${src})` });
  }
  const [lo, hi] = wall.nicheHeightMm;
  if (niche.short) {
    out.push({ moduleId: unit.id, level: 'blocking', words: `${label}: внутри шкафа ${niche.clearMm} мм, а нише ${title} нужно ${lo}…${hi} мм (${src}) — не хватает ${lo - niche.clearMm} мм` });
  }
  const bottom = upperBottomFor(unit, run) + t;
  if (bottom < general.installFromFloorMinMm) {
    out.push({ moduleId: unit.id, level: 'blocking', words: `${label}: ${title} стоит на ${bottom} мм от пола, а ставить её нужно не ниже ${general.installFromFloorMinMm} мм (${ruleSource(niche.model, 'general')})` });
  }
  if (niche.shelf && !onSystem32(lo, hi, t)) {
    out.push({
      moduleId: unit.id,
      level: 'release',
      words:
        `${label}: полка над нишей ${title} — неподвижная, низ на ${niche.shelf.fromMm} мм от низа корпуса: на отверстиях 32 при полке ${t} мм просвета ${lo}…${hi} мм (${src}) не получить; ` +
        'как цех крепит неподвижную полку, не задано — присадка не рассчитана',
    });
  }
  out.push({
    moduleId: unit.id,
    level: 'release',
    words: `${label}: от задней кромки шкафа до стены нужно ${wall.backGapMm} мм (${src}), а навесной ряд висит на стене вплотную — как цех даёт этот зазор, не подтверждено`,
  });
  if (general.furnitureTempMinC) {
    const [, strict] = general.furnitureTempMinC;
    out.push({
      moduleId: unit.id,
      level: 'release',
      words: `${label}: мебель вокруг ${title} должна выдерживать ${strict} °C (${ruleSource(niche.model, 'temperature')}) — термостойкости плиты и кромки в каталоге нет, не проверено`,
    });
  }
  return out;
}
