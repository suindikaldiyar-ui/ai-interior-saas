import { APPLIANCE_SLOTS } from './modules';
import { WATER_TOLERANCE_MM, runWidthSum } from './layout';
import type { CommPoint, LayoutIssue, Module, Run } from '@/types/millwork';

/**
 * Проверки раскладки против реальных коммуникаций.
 *
 * Мойка в 900 мм от вывода воды — это переделка на объекте. Увидеть её надо
 * в квартире на замере, а не на монтаже: именно эта функция экономит компании
 * живые деньги, поэтому расхождение показывается красным флажком на плане,
 * а не прячется в лог.
 */

const NEEDS_LABEL: Record<string, string> = {
  water: 'вывод воды',
  sewer: 'канализация',
  socket: 'розетка',
  vent: 'вентканал',
  gas: 'газ',
};

const COMM_FOR_NEED: Record<string, CommPoint['kind']> = {
  water: 'water_supply',
  sewer: 'sewer',
  socket: 'socket',
  vent: 'ventilation',
  gas: 'gas',
};

/** Насколько далеко розетка может быть от модуля — её проще перенести. */
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

export function validateRun(run: Run, comms: CommPoint[]): LayoutIssue[] {
  const issues: LayoutIssue[] = [];

  for (const warning of run.warnings) {
    issues.push({ level: 'warning', message: warning });
  }

  // Сумма ширин обязана сойтись с длиной ряда до миллиметра.
  const sum = runWidthSum(run);
  if (sum !== run.lengthMm) {
    issues.push({
      level: 'error',
      message: `Сумма модулей ${sum} мм не сходится с длиной ряда ${run.lengthMm} мм (расхождение ${run.lengthMm - sum} мм).`,
    });
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
          level: 'warning',
          moduleId: unit.id,
          atMm: center,
          message: `${spec.title}: не отмечен ${NEEDS_LABEL[need]} — уточните на замере.`,
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
      level: 'warning',
      moduleId: hob.id,
      atMm: centerOf(hob),
      message: 'Вытяжка не встала над варочной панелью: мешает разрыв верхнего ряда над окном.',
    });
  }

  if (hob && hood && Math.abs(centerOf(hob) - centerOf(hood)) > 20) {
    issues.push({
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
