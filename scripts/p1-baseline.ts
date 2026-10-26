/**
 * ЭТАЛОН «ДО P1» ДЛЯ СЦЕНАРИЯ 20 — старые проекты без витрин не меняются.
 *
 * Те же 99 конфигураций, что сверяет «Смета берёт количества из раскроя»
 * (`test:millwork`): каждый шаблон на минимальной, средней и максимальной
 * длине, демо-проёмы и коммуникации. Для каждой — отпечаток состава, итог
 * сметы (`optimal`, типовой прайс) и строки сметы ключом и количеством.
 * Несобравшаяся конфигурация записывается своим отказом, а не пропускается:
 * «не собралось» и «нет записи» — разные состояния.
 *
 * Снимается на дереве, где P1 ещё нет (`git worktree add <папка> f2fbf9d`),
 * и кладётся рядом: `scripts/p1-baseline.json`. Приёмка P1 сверяет с ним
 * текущий код: у конфигураций без витрин — тот же отпечаток и тот же итог до
 * тенге; у конфигураций с прежней витриной — тот же отпечаток, а итог
 * сдвинут только строками витрины (названы в отчёте слоя).
 *
 * Запуск (в дереве f2fbf9d):
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/p1-baseline.ts > scripts/p1-baseline.json
 */
import { buildRun } from '../lib/millwork/layout';
import { buildEstimate } from '../lib/millwork/estimate';
import { DEMO_COMMS, DEMO_OPENINGS, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { RUN_TEMPLATES, requirementsFromTemplate } from '../lib/millwork/templates';
import type { Run } from '../types/millwork';

export type BaselineEntry =
  | { fingerprint: string; total: number; lines: Record<string, number> }
  | { refused: string };

/** Ряд конфигурации — той же сборкой, что у сверки сметы с раскроем; отказ — словами движка. */
export function baselineRun(templateId: string, lengthMm: number): Run | { refused: string } {
  const template = RUN_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: шаблона ${templateId} нет`);
  try {
    return buildRun({
      lengthMm,
      ceilingHeightMm: 2700,
      requirements: requirementsFromTemplate(template, DEMO_REQUIREMENTS.options),
      openings: DEMO_OPENINGS,
      comms: DEMO_COMMS,
    });
  } catch (error) {
    return { refused: `${(error as Error).name}: ${(error as Error).message.split('\n')[0]}` };
  }
}

export function baselineKeys(): { key: string; templateId: string; lengthMm: number }[] {
  return RUN_TEMPLATES.flatMap((t) =>
    [t.minLengthMm, Math.round((t.minLengthMm + t.maxLengthMm) / 2), t.maxLengthMm].map((lengthMm) => ({
      key: `${t.id}@${lengthMm}`,
      templateId: t.id,
      lengthMm,
    })),
  );
}

export function baselineEntry(run: Run | { refused: string }): BaselineEntry {
  if ('refused' in run) return run;
  const estimate = buildEstimate(run, 'optimal', DEMO_RATES);
  const lines: Record<string, number> = {};
  for (const line of estimate.lines) lines[line.key] = Math.round(((lines[line.key] ?? 0) + line.quantity) * 1000) / 1000;
  return { fingerprint: run.fingerprint, total: Math.round(estimate.total), lines };
}

const direct = process.argv[1] && /p1-baseline\.ts$/.test(process.argv[1]);
if (direct) {
  const out: Record<string, BaselineEntry> = {};
  for (const { key, templateId, lengthMm } of baselineKeys()) out[key] = baselineEntry(baselineRun(templateId, lengthMm));
  process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
}
