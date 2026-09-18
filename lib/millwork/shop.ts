import {
  DEFAULT_PRODUCTION,
  type ProductionOverrides,
  type ProductionSettings,
} from '@/types/catalog';
import type { ModuleKind } from '@/types/millwork';

/**
 * ШКОЛА ЦЕХА: ГЛУБИНЫ И ВЫСОТЫ РЯДА.
 *
 * «Глубина 550, верх 350, цоколь 100, боковина 760, столешница 40» —
 * так работает один мебельщик. У другого 600/300 и 100/720/38. Это не
 * отраслевой стандарт, а школа конкретного цеха, и захардкоженные числа
 * делают раскрой неверным для половины клиентов.
 *
 * ЗДЕСЬ ЖИВУТ ПРОИЗВОДНЫЕ ВЕЛИЧИНЫ — И ТОЛЬКО ЗДЕСЬ.
 *
 *   рабочая поверхность = цоколь + боковина + столешница
 *   низ верхнего ряда   = рабочая поверхность + фартук
 *
 * Ни 858, ни 900, ни 1450, ни 1500 не лежат в продукте отдельным числом
 * и не вводятся руками. Заведи их полем — и они разойдутся с цоколем и
 * боковиной на первой же правке, а разошедшийся размер хуже
 * отсутствующего: по нему сверлят присадку.
 *
 * Что НЕ параметризуется и остаётся стандартом: шаг присадки 32
 * (`SYSTEM32_STEP_MM`) и угловой модуль 900×900 (`CORNER_SIZE_MM`).
 */

/** Настройки цеха с подстановкой умолчаний: ряд мог быть собран до них. */
export function shopOf(production?: ProductionSettings): ProductionSettings {
  return production ?? DEFAULT_PRODUCTION;
}

/**
 * ОТМЕТКИ ЭТОГО ОБЪЕКТА: НАСЛЕДОВАНИЕ, А НЕ КОПИЯ.
 *
 * ЕДИНСТВЕННОЕ место, где решается «чьё это число — объекта или
 * организации». Дальше по продукту едет уже разрешённый набор, и его
 * читает всё та же `shopOf`: ряд, раскрой, смета, чертёж и сцена
 * спрашивают отметку одной функцией и получают один ответ.
 *
 * Второго такого разрешения заводить нельзя. Спроси где-нибудь ещё
 * «а нет ли у объекта своего цоколя» — и появится вторая ветка того же
 * выбора: она разойдётся с первой на первой же правке, а расходятся
 * такие вещи молча, на одном модуле из тринадцати.
 *
 * Отсутствующее поле — это НЕ ноль и не умолчание: это «не трогали», и
 * оно читается у организации. Поэтому здесь `??` по каждому полю, а не
 * поверхностное слияние объектов: `{...org.heights, ...own.heights}`
 * затёрло бы высоту, у которой в объекте лежит `undefined`.
 */
export function productionFor(
  org: ProductionSettings | undefined,
  own?: ProductionOverrides,
): ProductionSettings {
  const base = shopOf(org);
  if (!own) return base;

  return {
    ...base,
    heights: {
      plinthMm: own.heights?.plinthMm ?? base.heights.plinthMm,
      carcassMm: own.heights?.carcassMm ?? base.heights.carcassMm,
      countertopMm: own.heights?.countertopMm ?? base.heights.countertopMm,
      apronMm: own.heights?.apronMm ?? base.heights.apronMm,
    },
    depths: {
      baseMm: own.depths?.baseMm ?? base.depths.baseMm,
      upperMm: own.depths?.upperMm ?? base.depths.upperMm,
      mezzanineMm: own.depths?.mezzanineMm ?? base.depths.mezzanineMm,
    },
  };
}

/**
 * Что из отметок правится на объекте, и в каких границах.
 *
 * Границы — это физика, а не вкус: цоколь ниже 60 мм не вместит опору,
 * боковина выше 900 мм не даёт работать стоя, фартук ниже 400 мм не
 * закрывает стену между столешницей и навесными. Число принимается
 * ЛЮБОЕ внутри границ: «правильных» значений у чужого цеха не бывает.
 */
export const OBJECT_MARKS = [
  { key: 'plinthMm', group: 'heights', title: 'Цоколь', min: 60, max: 200 },
  { key: 'carcassMm', group: 'heights', title: 'Боковина', min: 500, max: 900 },
  { key: 'countertopMm', group: 'heights', title: 'Столешница', min: 10, max: 80 },
  { key: 'apronMm', group: 'heights', title: 'Фартук', min: 400, max: 900 },
  { key: 'baseMm', group: 'depths', title: 'Глубина нижнего', min: 300, max: 700 },
  { key: 'upperMm', group: 'depths', title: 'Глубина верхнего', min: 200, max: 600 },
  { key: 'mezzanineMm', group: 'depths', title: 'Глубина антресоли', min: 200, max: 700 },
] as const;

export type ObjectMark = (typeof OBJECT_MARKS)[number];

/** Что стоит в поле сейчас: своё число объекта или унаследованное. */
export function markValue(mark: ObjectMark, production: ProductionSettings): number {
  return mark.group === 'heights'
    ? production.heights[mark.key as keyof ProductionSettings['heights']]
    : production.depths[mark.key as keyof ProductionSettings['depths']];
}

/** Тронул ли мебельщик эту отметку на объекте. */
export function markOwn(mark: ObjectMark, own?: ProductionOverrides): boolean {
  return mark.group === 'heights'
    ? own?.heights?.[mark.key as keyof ProductionOverrides['heights']] !== undefined
    : own?.depths?.[mark.key as keyof ProductionOverrides['depths']] !== undefined;
}

/**
 * Записать или снять отметку объекта.
 *
 * `null` снимает: поле исчезает из объекта целиком, и число снова
 * читается у организации. Ноль и пустая строка отметкой не считаются —
 * это «не трогали», а не «ноль миллиметров».
 */
export function withMark(
  own: ProductionOverrides | undefined,
  mark: ObjectMark,
  valueMm: number | null,
): ProductionOverrides {
  const group = { ...(own?.[mark.group] ?? {}) } as Record<string, number | undefined>;

  if (valueMm === null) delete group[mark.key];
  else group[mark.key] = Math.round(valueMm);

  const next: ProductionOverrides = { ...own, [mark.group]: group };

  // Пустая группа не хранится: «не трогали» не должно выглядеть правкой.
  if (Object.keys(group).length === 0) delete next[mark.group];
  return next;
}

/**
 * РАБОЧАЯ ПОВЕРХНЫЙ УРОВЕНЬ — ВЕРХ СТОЛЕШНИЦЫ ОТ ПОЛА.
 *
 * Единственное место, где это число получается. Прежняя константа
 * `BASE_TOTAL_H` (858) была той же формулой — её и продолжаем считать,
 * только слагаемые теперь принадлежат цеху.
 */
export function workTopMm(production?: ProductionSettings): number {
  const h = shopOf(production).heights;
  return h.plinthMm + h.carcassMm + h.countertopMm;
}

/**
 * НИЗ ВЕРХНЕГО РЯДА = рабочая поверхность плюс фартук.
 *
 * Прежние 1450 лежали числом в ДВУХ местах — `GEOMETRY.upper.bottomFromFloor`
 * и `ZONE_PROFILES.kitchen.upperBottomMm`, — и ни одно из них не знало,
 * что оно сумма столешницы и фартука. Поднял столешницу — навесные
 * оставались на месте, и фартук молча становился ниже.
 */
export function upperBottomMm(production?: ProductionSettings): number {
  return workTopMm(production) + shopOf(production).heights.apronMm;
}

/** Высота фартука — величина первичная, но спрашивают её отсюда. */
export function apronMm(production?: ProductionSettings): number {
  return shopOf(production).heights.apronMm;
}

/** Высота цоколя: на нём стоит корпус. */
export function plinthMm(production?: ProductionSettings): number {
  return shopOf(production).heights.plinthMm;
}

/** Высота боковины нижнего корпуса. */
export function carcassHeightMm(production?: ProductionSettings): number {
  return shopOf(production).heights.carcassMm;
}

/** Толщина столешницы. */
export function countertopMm(production?: ProductionSettings): number {
  return shopOf(production).heights.countertopMm;
}

/**
 * ГЛУБИНА КОРПУСА ПО РЯДУ.
 *
 * Колонна прибора стоит в нижнем ряду и идёт его глубиной: у неё нет
 * своей школы. Антресоль — своя: у мебельщика она идёт по глубине
 * НИЖНЕГО ряда, а не верхнего.
 */
export function rowDepthMm(kind: ModuleKind, production?: ProductionSettings): number {
  const depths = shopOf(production).depths;
  if (kind === 'upper' || kind === 'corner_upper') return depths.upperMm;
  return depths.baseMm;
}

/** Глубина антресоли: своё число цеха, а не глубина верхнего ряда. */
export function mezzanineDepthMm(production?: ProductionSettings): number {
  return shopOf(production).depths.mezzanineMm;
}
