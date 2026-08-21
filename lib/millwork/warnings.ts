import { APPLIANCE_SLOTS } from './modules';
import type { CommPoint, LayoutIssue, Opening, Run } from '@/types/millwork';
import type { SurveyStats } from '@/types/survey';

/**
 * Предупреждения по последствиям, а не по факту.
 *
 * Десяток строк «Расхождение с коммуникациями · 10» не читает никто — они
 * превращаются в фон. Поэтому список делится по тому, что произойдёт, если
 * ничего не делать, а формулировка называет именно последствие: не «розетка
 * не отмечена», а «монтажник не будет знать, где её выводить».
 */

export type Severity = 'blocking' | 'clarify' | 'info';

export type SurveyWarning = {
  id: string;
  severity: Severity;
  message: string;
  /** Куда смотреть на плане. */
  atMm?: number;
  moduleId?: string;
};

/** Сколько предупреждений видно одновременно. Остальные — под «ещё N». */
export const VISIBLE_WARNINGS = 3;

const SEVERITY_ORDER: Record<Severity, number> = { blocking: 0, clarify: 1, info: 2 };

/**
 * Мойка дальше этого расстояния от вывода воды — переделка на объекте,
 * а не мелочь: сифон столько не тянется.
 */
const SINK_BLOCKING_MM = 600;

export function classifyIssue(issue: LayoutIssue): Severity {
  if (issue.kind === 'layout') return 'blocking';

  if (issue.kind === 'comm') {
    // «Не отмечено» — уточнение. «Отмечено, но далеко» — переделка.
    return issue.level === 'error' ? 'blocking' : 'clarify';
  }

  return issue.level === 'error' ? 'blocking' : 'clarify';
}

/** Модуль поперёк дверного проёма — гарнитур физически не встанет. */
export function doorwayConflicts(run: Run | null, openings: Opening[]): SurveyWarning[] {
  if (!run) return [];

  return openings
    .filter((opening) => opening.kind === 'door' || opening.kind === 'arch')
    .flatMap((opening) => {
      const from = opening.fromCornerMm;
      const to = opening.fromCornerMm + opening.widthMm;

      const hit = run.modules.find(
        (unit) => unit.offsetMm < to && unit.offsetMm + unit.widthMm > from,
      );
      if (!hit) return [];

      return [
        {
          id: `door-${opening.id}`,
          severity: 'blocking' as const,
          moduleId: hit.id,
          atMm: from + opening.widthMm / 2,
          message:
            `Гарнитур перекрывает ${opening.kind === 'door' ? 'дверной проём' : 'арку'} ` +
            `на ${from}–${to} мм — дверь не откроется, монтаж встанет.`,
        },
      ];
    });
}

/** Мойка далеко от вывода воды — при том, что вывод на замере отмечен. */
export function sinkWaterConflicts(run: Run | null, comms: CommPoint[]): SurveyWarning[] {
  if (!run) return [];

  const water = comms.filter((c) => c.kind === 'water_supply');
  if (water.length === 0) return [];

  return run.modules
    .filter((unit) => unit.appliance?.startsWith('sink'))
    .flatMap((unit) => {
      const center = unit.offsetMm + unit.widthMm / 2;
      const nearest = water.reduce((best, point) =>
        Math.abs(point.fromCornerMm - center) < Math.abs(best.fromCornerMm - center)
          ? point
          : best,
      );
      const distance = Math.round(Math.abs(nearest.fromCornerMm - center));
      if (distance <= SINK_BLOCKING_MM) return [];

      return [
        {
          id: `sink-water-${unit.id}`,
          severity: 'blocking' as const,
          moduleId: unit.id,
          atMm: center,
          message:
            `${APPLIANCE_SLOTS[unit.appliance as keyof typeof APPLIANCE_SLOTS]?.title ?? 'Мойка'} ` +
            `в ${distance} мм от вывода воды — на объекте это перенос трубы за счёт компании.`,
        },
      ];
    });
}

/** Незамеренное и принятое по умолчанию — жёлтым, с последствием. */
export function surveyWarnings(stats: SurveyStats): SurveyWarning[] {
  const pending = stats.pending.map((p, i) => ({
    id: `pending-${i}`,
    severity: 'clarify' as const,
    message: `${p.where} не замерено — ${p.consequence}.`,
  }));

  const assumptions = stats.assumptions.map((a, i) => ({
    id: `assumed-${i}`,
    severity: 'clarify' as const,
    message: `${a.where}: принято по умолчанию (${a.basis}) — уточните на объекте.`,
  }));

  return [...pending, ...assumptions];
}

/**
 * Всё вместе, отсортировано по последствиям. Информационные не показываются
 * на экране вовсе — они уходят в примечания чертежа.
 */
export function collectWarnings(input: {
  issues: LayoutIssue[];
  run: Run | null;
  openings: Opening[];
  comms: CommPoint[];
  stats?: SurveyStats | null;
}): SurveyWarning[] {
  const fromIssues: SurveyWarning[] = input.issues.map((issue, i) => ({
    id: `issue-${i}`,
    severity: classifyIssue(issue),
    message: issue.message,
    atMm: issue.atMm,
    moduleId: issue.moduleId,
  }));

  const all = [
    ...doorwayConflicts(input.run, input.openings),
    ...sinkWaterConflicts(input.run, input.comms),
    ...fromIssues,
    ...(input.stats ? surveyWarnings(input.stats) : []),
  ];

  // Одна и та же беда не должна прийти дважды из двух источников.
  const seen = new Set<string>();
  const unique = all.filter((w) => {
    const key = `${w.severity}:${w.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/**
 * Схлопывание повторов.
 *
 * Шесть строк «Розетка не отмечена» — это один вопрос к замеру, а не шесть
 * проблем. Скобка с именем модуля отбрасывается, одинаковые сообщения
 * становятся одной строкой со счётчиком; сами модули остаются внутри,
 * их видно по тапу.
 */
export type GroupedWarning = SurveyWarning & {
  count: number;
  members: SurveyWarning[];
};

const MODULE_SUFFIX = /\s*\(модуль «[^»]*»\)\.?$/;

function groupKey(w: SurveyWarning): string {
  return `${w.severity}:${w.message.replace(MODULE_SUFFIX, '')}`;
}

export function groupWarnings(warnings: SurveyWarning[]): GroupedWarning[] {
  const groups = new Map<string, GroupedWarning>();

  for (const warning of warnings) {
    const key = groupKey(warning);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, { ...warning, count: 1, members: [warning] });
      continue;
    }

    existing.count += 1;
    existing.members.push(warning);
  }

  return Array.from(groups.values()).map((group) =>
    group.count === 1
      ? group
      : {
          ...group,
          message: `${group.message.replace(MODULE_SUFFIX, '')} — ${group.count} модуля.`,
        },
  );
}

export function hasBlocking(warnings: SurveyWarning[]): boolean {
  return warnings.some((w) => w.severity === 'blocking');
}

/** На экране — не больше трёх. Остальные сворачиваются в «ещё N». */
export function splitWarnings(warnings: SurveyWarning[], max = VISIBLE_WARNINGS) {
  const visible = warnings.filter((w) => w.severity !== 'info');
  return { shown: visible.slice(0, max), hidden: Math.max(0, visible.length - max) };
}
