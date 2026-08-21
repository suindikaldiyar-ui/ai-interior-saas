import { APPLIANCE_SLOTS, WATER_TOLERANCE_MM } from './modules';
import { appliancesPlacedOnce } from './invariants';
import type { CommPoint, LayoutIssue, Module, Run } from '@/types/millwork';

/**
 * Проверки раскладки.
 *
 * Здесь два принципиально разных класса проблем, и путать их нельзя:
 *
 *  - `layout` — поломка конфигуратора. Пользователь такого видеть не должен
 *    никогда, поэтому нарушение инварианта бросает исключение на сборке,
 *    а не показывается сообщением в интерфейсе.
 *  - `comm` — расхождение с реальными коммуникациями. Это нормальная рабочая
 *    ситуация: мойка в 900 мм от вывода воды решается на объекте. Показывается
 *    красным флажком на плане, где видно, куда именно смотреть.
 */

const NEEDS_LABEL: Record<string, string> = {
  water: 'вывод воды',
  sewer: 'канализация',
  socket: 'розетка',
  vent: 'вентканал',
  gas: 'газ',
};

/*
 * Формулировка называет ПОСЛЕДСТВИЕ, а не факт: «розетка не отмечена» — это
 * строка в фоне, а «монтажник не будет знать, где её выводить» — причина
 * дозамерить. Род подставляется явно, иначе фраза читается как машинная.
 */
const NEEDS_MISSING: Record<string, string> = {
  water: 'Вывод воды не отмечен на замере — монтажник не будет знать, где его выводить',
  sewer: 'Канализация не отмечена на замере — монтажник не будет знать, где её выводить',
  socket: 'Розетка не отмечена на замере — монтажник не будет знать, где её выводить',
  vent: 'Вентканал не отмечен на замере — вытяжку будет некуда подключить',
  gas: 'Газ не отмечен на замере — подключение придётся согласовывать на месте',
};

const COMM_FOR_NEED: Record<string, CommPoint['kind']> = {
  water: 'water_supply',
  sewer: 'sewer',
  socket: 'socket',
  vent: 'ventilation',
  gas: 'gas',
};

/** Насколько далеко точка может быть от модуля — розетку перенести проще. */
const TOLERANCE_MM: Record<string, number> = {
  water: WATER_TOLERANCE_MM,
  sewer: WATER_TOLERANCE_MM,
  socket: 1200,
  vent: 800,
  gas: 600,
};

function centerOf(unit: Module): number {
  return unit.offsetMm + unit.widthMm / 2;
}

/* ─────────────────────────  Мягкие проверки  ───────────────────────── */

export function validateRun(run: Run, comms: CommPoint[]): LayoutIssue[] {
  const issues: LayoutIssue[] = [];

  // Что не поместилось — это не поломка, а честный отказ движка.
  for (const warning of run.warnings) {
    issues.push({ kind: 'fit', level: 'warning', message: warning });
  }

  // Дубль прибора означал бы, что клиенту посчитали лишнюю технику.
  for (const [appliance, count] of Array.from(appliancesPlacedOnce(run))) {
    if (count > 1) {
      issues.push({
        kind: 'layout',
        level: 'error',
        message: `${APPLIANCE_SLOTS[appliance as keyof typeof APPLIANCE_SLOTS]?.title ?? appliance}: попал в ряд ${count} раза.`,
      });
    }
  }

  const modules = [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)];

  for (const unit of modules) {
    if (!unit.appliance) continue;
    const spec = APPLIANCE_SLOTS[unit.appliance];
    const center = centerOf(unit);

    for (const need of spec.needs) {
      const kind = COMM_FOR_NEED[need];
      const points = comms.filter((c) => c.kind === kind);

      if (points.length === 0) {
        issues.push({
          kind: 'comm',
          level: 'warning',
          moduleId: unit.id,
          atMm: center,
          message: `${NEEDS_MISSING[need] ?? `${NEEDS_LABEL[need]} не отмечен`} (модуль «${spec.title}»).`,
        });
        continue;
      }

      const nearest = points.reduce((best, point) =>
        Math.abs(point.fromCornerMm - center) < Math.abs(best.fromCornerMm - center)
          ? point
          : best,
      );

      const distance = Math.round(Math.abs(nearest.fromCornerMm - center));
      if (distance > (TOLERANCE_MM[need] ?? 600)) {
        issues.push({
          kind: 'comm',
          level: 'error',
          moduleId: unit.id,
          atMm: center,
          message: `${spec.title} в ${distance} мм от точки «${NEEDS_LABEL[need]}». Перенос коммуникации или сдвиг модуля.`,
        });
      }
    }
  }

  // Вытяжка обязана висеть строго над варочной панелью.
  const hob = run.modules.find((m) => m.appliance === 'hob');
  const hood = run.upperSegments
    .flatMap((s) => s.modules)
    .find((m) => m.appliance === 'hood');

  if (hob && !hood) {
    issues.push({
      kind: 'fit',
      level: 'warning',
      moduleId: hob.id,
      atMm: centerOf(hob),
      message: 'Вытяжка не встала над варочной панелью: мешает разрыв верхнего ряда над окном.',
    });
  }

  if (hob && hood && Math.abs(centerOf(hob) - centerOf(hood)) > 20) {
    issues.push({
      kind: 'layout',
      level: 'error',
      moduleId: hood.id,
      atMm: centerOf(hood),
      message: 'Вытяжка смещена относительно варочной панели.',
    });
  }

  return issues;
}

export function hasErrors(issues: LayoutIssue[]): boolean {
  return issues.some((i) => i.level === 'error');
}

/** Расхождения с коммуникациями — их место на плане, а не в баннере ошибок. */
export function commIssues(issues: LayoutIssue[]): LayoutIssue[] {
  return issues.filter((i) => i.kind === 'comm');
}

/** Что не поместилось в ряд — это отдельный разговор с замерщиком. */
export function fitIssues(issues: LayoutIssue[]): LayoutIssue[] {
  return issues.filter((i) => i.kind === 'fit');
}

/** Поломка конфигуратора. В норме список пуст. */
export function layoutIssues(issues: LayoutIssue[]): LayoutIssue[] {
  return issues.filter((i) => i.kind === 'layout');
}
