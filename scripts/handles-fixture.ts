/**
 * ОБЪЕКТ ДЛЯ ПРИЁМКИ РУЧЕК В БРАУЗЕРЕ (HANDLE-REAL) — путём экрана, базу не трогает.
 *
 *   handles — демо-стена без окна, свободная сборка:
 *             две дверцы 800 (`door_two`), дверца 450 на левой петле,
 *             ящики 600 (три фронта), дверца 450 на правой петле и
 *             верхний шкаф 600 над ними.
 *
 * Ряд собирает тот же `composeVariants`, правит тот же `applyOps`, что у
 * экрана. Ручки здесь НЕ ставятся: их ИД — строки каталога организации, и
 * ставит их человек в Studio («Фурнитура» → «Ручки» → «Установить»).
 *
 * Выход — JSON в stdout: `{ handles: { requirements, measurement, survey, run, ids } }`.
 * Отказ движка на любой операции — падение со словами движка.
 */
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { applyOps } from '../lib/millwork/ops';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { DEFAULT_PRODUCTION } from '../types/catalog';
import { surveyFromMeasurement, type Survey } from '../types/survey';
import type { Measurement, MillworkOp, Run, RunRequirements } from '../types/millwork';

/** Замер как замеренный: приёмка не про допущения. */
function measuredSurvey(measurement: Measurement): Survey {
  const survey = surveyFromMeasurement(measurement, 'HANDLE-REAL', 'HANDLE-REAL', '2026-10-22');
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

const noWindow: Measurement = {
  ...DEMO_MEASUREMENT,
  id: 'hr-kitchen',
  walls: DEMO_MEASUREMENT.walls.map((wall) => ({ ...wall, openings: wall.openings.filter((o) => o.kind !== 'window') })),
};
const FREE: RunRequirements = { ...DEMO_REQUIREMENTS, mode: 'free', appliances: [] };

const input = workspaceInput({
  title: 'HR kitchen',
  zone: 'Кухня',
  measurement: noWindow,
  requirements: FREE,
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
  const next = applyOps({ run: shown(), requirements: FREE, ops, openings: input.openings, roomDepthMm: 0 });
  if (next.warnings.length) throw new Error(`HR kitchen: движок отказал: ${next.warnings.join(' | ')}`);
  edited = next;
  return shown();
};

apply([{ op: 'add_module', kind: 'base', widthMm: 800, variant: 'door_two' }]);
apply([{ op: 'add_module', kind: 'base', widthMm: 450, afterModuleId: shown().modules.at(-1)!.id }]);
apply([{ op: 'add_module', kind: 'base', widthMm: 600, variant: 'drawers', afterModuleId: shown().modules.at(-1)!.id }]);
apply([{ op: 'add_module', kind: 'base', widthMm: 450, afterModuleId: shown().modules.at(-1)!.id }]);

const [double, left, drawers, right] = shown().modules;
if (!double || double.doorCount !== 2) throw new Error(`HR kitchen: НУЛЕВОЙ СЕЛЕКТОР — двух дверец нет (${double?.id ?? '—'})`);
if (!drawers || (drawers.fill?.drawerHeights.length ?? 0) !== 3) throw new Error(`HR kitchen: у ящиков не три фронта (${drawers?.fill?.drawerHeights.length ?? 0})`);
if (!left || !right) throw new Error('HR kitchen: одностворчатых модулей нет');
apply([
  { op: 'set_opening', moduleId: left.id, opening: 'left' },
  { op: 'set_opening', moduleId: right.id, opening: 'right' },
]);
apply([{ op: 'add_module', kind: 'upper', widthMm: 600, row: 'upper', atMm: double.offsetMm } as MillworkOp]);
const upper = shown().upperSegments.flatMap((segment) => segment.modules).find((u) => u.section !== 'mezzanine');
if (!upper) throw new Error('HR kitchen: НУЛЕВОЙ СЕЛЕКТОР — верхнего шкафа нет');

const run = shown();
const handles = {
  requirements: FREE,
  measurement: noWindow,
  survey: measuredSurvey(noWindow),
  run,
  ids: { double: double.id, left: left.id, drawers: drawers.id, right: right.id, upper: upper.id },
};

process.stdout.write(JSON.stringify({ handles }));
