/**
 * ЧИСЛА РАДИУСНОГО МОДУЛЯ — ОДНИ НА СЦЕНУ И НА РАСКРОЙ (OVAL & RADIUS, этап A).
 *
 * Высота и глубина корпуса приходят от вызывающего, и оба берут их у одних
 * функций: раскрой — `moduleCarcassHeightMm` / `moduleDepthMm`, сцена — у места
 * модуля в ряду (`runPlaces`), которое считают они же. Толщины, зазор и
 * припуск — школа цеха; цоколь — у того, что стоит на полу; полки —
 * `fill.shelves` как есть (система 32). Своя копия этих чисел в сцене или в
 * раскрое развела бы нарисованную деталь с распиленной.
 *
 * Отдельный файл — чтобы `radius.ts` не тянул наполнение и цех, а
 * `panels.ts` и `cabinetBoxes.ts` брали одно и то же.
 */
import { DEFAULT_ALLOWANCES, type ProductionSettings } from '@/types/catalog';
import type { Module } from '@/types/millwork';
import { bentHingeOf } from './opening';
import { plinthMm, shopOf } from './shop';
import type { RadiusDims } from './radius';

export function radiusDimsOf(
  unit: Module,
  size: { heightMm: number; depthMm: number },
  production?: ProductionSettings,
): RadiusDims {
  const shop = shopOf(production);
  return {
    widthMm: unit.widthMm,
    depthMm: Math.round(size.depthMm),
    heightMm: Math.round(size.heightMm),
    carcassMm: shop.carcassMm,
    frontMm: shop.frontMm,
    gapMm: shop.frontGapMm,
    backMm: shop.backMm,
    /* Висящее цоколя не имеет: навесной шкаф и подвесная тумба. */
    plinthMm: unit.kind === 'upper' ? null : plinthMm(shop),
    shelvesMm: unit.fill?.shelves ?? [],
    shelfSetbackMm: (shop.allowances ?? DEFAULT_ALLOWANCES).shelfDepthMm,
    hinge: bentHingeOf(unit),
  };
}
