/**
 * ОБЪЕКТ ДЛЯ ПРИЁМКИ ОСВЕЩЕНИЯ В БРАУЗЕРЕ (V3D-02) — путём экрана, базу не трогает.
 *
 *   kitchen — демо-замер (окно 1500…2400, короб 2400…3400) по готовому
 *             решению: нижний и верхний ряд, столешница, фартук, витрина с
 *             подсветкой в торце, у неё четыре полки (`set_fill`, система 32).
 *
 * Ряд собирает тот же `composeVariants`, правит тот же `applyOps`, что у
 * экрана. Свет здесь НЕ ставится: трек, ленту и сценарии ставит человек в
 * Studio («Освещение»). Материалы каталога — тоже в браузере: их ИД — строки
 * организации, известные только после заведения типовой палитры.
 *
 * Выход — JSON в stdout: `{ kitchen: { requirements, measurement, survey, run, ids } }`.
 * Отказ движка на любой операции — падение со словами движка.
 */
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { applyOps } from '../lib/millwork/ops';
import { allModules } from '../lib/millwork/layout';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { DEFAULT_PRODUCTION } from '../types/catalog';
import { surveyFromMeasurement, type Survey } from '../types/survey';
import type { Measurement, MillworkOp, Run, RunRequirements } from '../types/millwork';

/** Замер как замеренный: приёмка не про допущения. */
function measuredSurvey(measurement: Measurement): Survey {
  const survey = surveyFromMeasurement(measurement, 'V3D-02', 'V3D-02', '2026-10-23');
  const known = <T,>(value: unknown): T => {
    const v = value as { state?: string; value?: unknown };
    return (v && v.state === 'assumed' ? { state: 'measured', value: v.value } : value) as T;
  };
  return {
    ...survey,
    ceilingHeightMm: known(survey.ceilingHeightMm),
    walls: survey.walls.map((wall) => ({
      ...wall,
      lengthMm: known(wall.lengthMm),
      openings: wall.openings.map((o) => ({
        ...o,
        fromCornerMm: known(o.fromCornerMm),
        widthMm: known(o.widthMm),
        heightMm: known(o.heightMm),
        sillMm: known(o.sillMm),
      })),
    })),
    comms: survey.comms.map((c) => ({ ...c, fromCornerMm: known(c.fromCornerMm), heightMm: known(c.heightMm) })),
    steps: { ceiling: 'done', walls: 'done', openings: 'done', comms: 'done', photos: 'todo' },
  };
}

const REQUIREMENTS: RunRequirements = { ...DEMO_REQUIREMENTS, glassDisplay: true };
const input = workspaceInput({
  title: 'V3D-02 kitchen',
  zone: 'Кухня',
  measurement: DEMO_MEASUREMENT,
  requirements: REQUIREMENTS,
  rates: DEMO_RATES,
  wallId: 'w1',
  cornerAt: null,
  production: DEFAULT_PRODUCTION,
} as never);
let edited: Run | null = null;
const shown = (): Run =>
  composeVariants(input, { basic: [], optimal: [], premium: [] } as never, (edited ? { optimal: edited } : {}) as never).find(
    (v: { key: string }) => v.key === 'optimal',
  )!.run as Run;
const apply = (ops: MillworkOp[]): Run => {
  const next = applyOps({ run: shown(), requirements: REQUIREMENTS, ops, openings: input.openings });
  if (next.warnings.length) throw new Error(`V3D-02 kitchen: движок отказал: ${next.warnings.join(' | ')}`);
  edited = next;
  return shown();
};

const vitrine = allModules(shown()).find((unit) => unit.section === 'glass_display');
if (!vitrine?.fill) throw new Error('V3D-02 kitchen: НУЛЕВОЙ СЕЛЕКТОР — витрины в демо-кухне нет');
apply([{ op: 'set_fill', moduleId: vitrine.id, fill: { ...vitrine.fill, shelves: [544, 1056, 1568, 2080] } }]);

const run = shown();
const uppers = run.upperSegments.flatMap((segment) => segment.modules).filter((u) => u.section !== 'mezzanine' && !u.appliance);
const base = run.modules.find((unit) => unit.kind === 'base' && !unit.appliance);
if (uppers.length === 0 || !base) throw new Error('V3D-02 kitchen: НУЛЕВОЙ СЕЛЕКТОР — нет верхних шкафов или обычного нижнего модуля');

const kitchen = {
  requirements: REQUIREMENTS,
  measurement: DEMO_MEASUREMENT,
  survey: measuredSurvey(DEMO_MEASUREMENT),
  run,
  ids: { vitrine: vitrine.id, upper: uppers[0].id, base: base.id },
};

process.stdout.write(JSON.stringify({ kitchen }));
