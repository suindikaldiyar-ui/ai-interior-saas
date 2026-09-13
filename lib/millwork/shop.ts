import { DEFAULT_PRODUCTION, type ProductionSettings } from '@/types/catalog';
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
