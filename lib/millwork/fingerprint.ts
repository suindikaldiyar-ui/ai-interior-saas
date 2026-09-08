import { frontPart } from './frontMaterial';
import type { Module, Run } from '@/types/millwork';

/**
 * Отпечаток конфигурации.
 *
 * Чертёж, смета и рендер обязаны показывать ОДИН И ТОТ ЖЕ ряд. Раньше это
 * проверялось числом модулей — этого мало: `modulesFromRun` теряла `kind`,
 * пенал приезжал в сцену обычным модулем, и число сходилось при разной
 * мебели. Считаем по составу, а не по длине списка.
 *
 * Расхождение — исключение на сборке, а не предупреждение в интерфейсе:
 * показать клиенту чертёж одной кухни и смету другой хуже, чем не показать
 * ничего.
 */

export type FingerprintPart = {
  kind: string;
  widthMm: number;
  heightMm?: number;
  appliance?: string;
  frontCount: number;
  /** Наполнение: полки и штанги — тоже мебель, и разъезжаться им нельзя. */
  fill?: string;
  /**
   * Колонна и встройка. Микроволновка над духовкой и духовка над
   * микроволновкой — это разная мебель, а холодильник за фасадом стоит
   * других денег, чем отдельностоящий. Отпечаток обязан их различать.
   */
  extras?: string;
};

export function moduleParts(modules: Module[]): FingerprintPart[] {
  return modules.map((unit) => ({
    kind: unit.kind,
    widthMm: unit.widthMm,
    appliance: unit.appliance,
    frontCount: unit.frontType === 'drawers' ? unit.drawerCount : unit.doorCount,
    fill: fillPart(unit),
    extras: extrasPart(unit),
  }));
}

/**
 * Наполнение в отпечатке: замерщик подвинул полку — чертёж, смета и рендер
 * обязаны знать об этом все трое. Складываем в короткую строку, порядок
 * полей фиксирован.
 */
function fillPart(unit: Module): string | undefined {
  const fill = unit.fill;
  if (!fill) return undefined;
  return [
    fill.shelves.join('.'),
    fill.dividerMm,
    fill.rodsMm.join('.'),
    fill.drawerHeights.join('.'),
    fill.hinge,
  ].join('/');
}

/** Колонна, встройка и секция — короткой строкой в фиксированном порядке. */
function extrasPart(unit: Module): string | undefined {
  const parts = [
    unit.column ? `${unit.column.bottom}<${unit.column.top}` : '',
    unit.builtIn ? 'built_in' : '',
    unit.section ?? '',
    // Карго вместо дверцы — другая мебель и другие деньги.
    unit.variant ?? '',
    /*
     * Материал фасада. Эмаль вместо ЛДСП — это другая мебель, другой
     * раскрой (кромки нет) и другие деньги. Умолчание в отпечаток не
     * пишется намеренно: иначе изменились бы отпечатки всех рядов,
     * собранных до появления материалов.
     */
    frontPart(unit.front) ?? '',
    /*
     * Габарит прибора. Холодильник 700 вместо 600 — это другая ниша,
     * другой раскрой и другие деньги: отпечаток обязан их различать.
     */
    unit.applianceSize
      ? `app${unit.applianceSize.widthMm}x${unit.applianceSize.heightMm ?? 0}x${unit.applianceSize.depthMm ?? 0}`
      : '',
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(',') : undefined;
}

/** Устойчивый хеш: порядок полей фиксирован, случайности нет. */
export function configurationFingerprint(modules: Module[]): string {
  const text = moduleParts(modules)
    .map(
      (p) =>
        `${p.kind}:${p.widthMm}:${p.appliance ?? '-'}:${p.frontCount}:${p.fill ?? '-'}:${p.extras ?? '-'}`,
    )
    .join('|');

  // FNV-1a: коротко, детерминированно и без зависимостей.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function runFingerprint(run: Pick<Run, 'modules' | 'upperSegments'>): string {
  return configurationFingerprint([
    ...run.modules,
    ...run.upperSegments.flatMap((s) => s.modules),
  ]);
}

/**
 * Отпечаток всей композиции.
 *
 * Считается от отпечатков сегментов И от решения угла: сменил фальш-панель
 * на угловой модуль — это другая мебель и другие деньги, и чертёж со сметой
 * обязаны об этом знать.
 */
export function compositionFingerprint(composition: {
  segments: { run: Pick<Run, 'modules' | 'upperSegments' | 'lengthMm'> }[];
  corners: { solution: string; falsePanelMm?: number; hingeAngleDeg?: number }[];
}): string {
  const text = [
    ...composition.segments.map(
      (segment) => `${segment.run.lengthMm}:${runFingerprint(segment.run)}`,
    ),
    ...composition.corners.map(
      (corner) => `${corner.solution}/${corner.falsePanelMm ?? 0}/${corner.hingeAngleDeg ?? 0}`,
    ),
  ].join('|');

  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export class ConfigurationMismatchError extends Error {
  constructor(
    readonly where: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `${where}: конфигурация разошлась с раскладкой (${expected} против ${actual}). ` +
        'Чертёж, смета и рендер обязаны показывать один и тот же ряд.',
    );
    this.name = 'ConfigurationMismatchError';
  }
}

export function assertSameConfiguration(
  where: string,
  expected: string,
  actual: string,
): void {
  if (expected !== actual) {
    throw new ConfigurationMismatchError(where, expected, actual);
  }
}
