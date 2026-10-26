/**
 * ОБЪЕКТЫ И ОЖИДАНИЯ БРАУЗЕРНОЙ ПРИЁМКИ P1 (`check-p1-vitrines.mjs`) — тем же
 * путём экрана, что `verify-p1-vitrines.ts`: замер → `workspaceInput` →
 * `objectInput` → `composeVariants` → правка `applyOps`, как `runOps`.
 *
 *   kitchen — демо-кухня 3800 (окно, короб вентиляции): верхний шкаф 3300…3800
 *             (витрина A → каркас B → цельностеклянная C), шкаф 1200…1500 у
 *             пенала духовки (ход двери), антресоль над холодильником;
 *   open    — та же стена без окна и короба: витрина на столешнице до потолка;
 *   living  — гостиная по шаблону «ТВ-зона»: витрина в другой комнате.
 *
 * Ожидания — числа того, что нарисует сцена, посчитанные тем же правилом,
 * что пачки `Cabinet3D`: стекло по виду (`material: glass`, кроме полок),
 * профиль по покрытию (`material: metal` с `profile`). Выход — JSON в stdout.
 * Отказ движка там, где его не ждали, — падение.
 */
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { applyOps } from '../lib/millwork/ops';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { allModules } from '../lib/millwork/layout';
import { runBoxes, runPlaces } from '../lib/millwork/cabinetBoxes';
import { vitrineParts } from '../lib/millwork/vitrineParts';
import { vitrineBlocker } from '../lib/millwork/vitrine';
import { workTopMm } from '../lib/millwork/shop';
import { RUN_TEMPLATES, requirementsFromTemplate } from '../lib/millwork/templates';
import { surveyFromMeasurement, type Survey } from '../types/survey';
import { DEFAULT_PRODUCTION } from '../types/catalog';
import type { Measurement, MillworkOp, Run, RunRequirements, VariantKey, VitrineSpec } from '../types/millwork';

const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
const SHOP = DEFAULT_PRODUCTION;

/** Замер как замеренный: приёмка не про допущения (тот же приём, что у `stage01-fixture`). */
function measuredSurvey(measurement: Measurement): Survey {
  const survey = surveyFromMeasurement(measurement, 'P1', 'P1', '2026-10-25');
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
      openings: wall.openings.map((o) => ({ ...o, fromCornerMm: known(o.fromCornerMm), widthMm: known(o.widthMm), heightMm: known(o.heightMm), sillMm: known(o.sillMm) })),
    })),
    comms: survey.comms.map((c) => ({ ...c, fromCornerMm: known(c.fromCornerMm), heightMm: known(c.heightMm) })),
    steps: { ceiling: 'done', walls: 'done', openings: 'done', comms: 'done', photos: 'todo' },
  };
}

function screen(measurement: Measurement, requirements: RunRequirements, zone: string) {
  const base = workspaceInput({ title: 'P1', zone, measurement, requirements, rates: DEMO_RATES, cornerAt: null, wallId: 'w1' });
  const input = objectInput({ base, resolution: null, requirements, rates: DEMO_RATES, production: SHOP, milling: new Map(), carcass: new Map(), materials: new Map() });
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, DISABLED, edited).find((variant) => variant.key === 'optimal')!.run;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown(), requirements, ops: list, openings: input.openings });
    if (next.warnings.length > 0) throw new Error(`движок отказал: ${next.warnings.join(' | ')}`);
    edited = { optimal: next };
    return shown();
  };
  return { shown, ops };
}

/** Пачки сцены: стекло по виду и профиль по покрытию — тем же правилом, что `Cabinet3D`. */
function packs(run: Run) {
  const glass: Record<string, number> = {};
  const profile: Record<string, number> = {};
  for (const box of runBoxes(run, { production: SHOP, thicknessMm: SHOP.carcassMm, frontThicknessMm: SHOP.frontMm, gapMm: SHOP.frontGapMm })) {
    if (box.material === 'glass' && box.node !== 'glass-shelf' && box.glass) glass[box.glass] = (glass[box.glass] ?? 0) + 1;
    if (box.material === 'metal' && box.profile) profile[box.profile] = (profile[box.profile] ?? 0) + 1;
  }
  return { glass, profile };
}

const OPEN_WALL: Measurement = {
  ...DEMO_MEASUREMENT,
  id: 'p1-open-wall',
  walls: DEMO_MEASUREMENT.walls.map((wall, i) => (i === 0 ? { ...wall, openings: [] } : wall)),
};

const object = (title: string, measurement: Measurement, requirements: RunRequirements, zone: string) => ({
  title,
  zone,
  measurement,
  survey: measuredSurvey(measurement),
  requirements,
  shape: 'linear' as const,
  corners: [],
});

/* ── кухня: A → B → C на одном шкафу ── */
const UPPER = 'upper-3300@w1';
const NEXT = 'upper-1200@w1';
const k = screen(DEMO_MEASUREMENT, DEMO_REQUIREMENTS, 'Кухня');
const before = packs(k.shown());
const spec = (vitrine: VitrineSpec): MillworkOp => ({ op: 'set_vitrine', moduleId: UPPER, vitrine });
const A = packs(k.ops([spec({ construction: 'carcass' })]));
const B = k.ops([spec({ construction: 'frame', glassMm: 6 })]);
const Bp = packs(B);
const outsideB = vitrineParts(B, SHOP).length;
const C = k.ops([spec({ construction: 'glass', glassMm: 8 })]);
const Cp = packs(C);
const outsideC = vitrineParts(C, SHOP).length;

/* ── стена без окна: витрина на столешнице ── */
const o = screen(OPEN_WALL, DEMO_REQUIREMENTS, 'Кухня');
const openRun = o.shown();
const overDoor = allModules(openRun).find(
  (unit) =>
    unit.kind === 'upper' &&
    unit.section !== 'mezzanine' &&
    !unit.appliance &&
    unit.offsetMm >= 3000 &&
    openRun.modules.some((m) => m.kind === 'base' && !m.appliance && m.frontType === 'door' && m.offsetMm <= unit.offsetMm && unit.offsetMm + unit.widthMm <= m.offsetMm + m.widthMm),
);
if (!overDoor) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: в стене без окна нет верхнего шкафа над дверцей у правого края');
const onCounter = o.ops([{ op: 'set_vitrine', moduleId: overDoor.id, vitrine: { construction: 'carcass', onCounter: true } }]);
const counterPlace = runPlaces(onCounter).find((p) => p.unit.id === overDoor.id)!;

/* ── гостиная: первый шаблон зоны, где есть модуль, который бывает витриной ── */
const livingTemplate = RUN_TEMPLATES.find((t) => t.zone === 'living');
if (!livingTemplate) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: шаблона гостиной нет');
const livingReq = requirementsFromTemplate(livingTemplate, DEMO_REQUIREMENTS.options);
const l = screen(DEMO_MEASUREMENT, livingReq, 'Гостиная');
const livingRun = l.shown();
const livingTarget = allModules(livingRun).find((unit) => unit.frontType === 'door' && unit.doorCount >= 1 && vitrineBlocker(unit, livingRun) === null);
if (!livingTarget) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: в гостиной нет модуля, который бывает витриной');
const livingAfter = packs(l.ops([{ op: 'set_vitrine', moduleId: livingTarget.id, vitrine: { construction: 'carcass' } }]));

process.stdout.write(
  JSON.stringify({
    kitchen: {
      ...object('P1 · демо-кухня 3800', DEMO_MEASUREMENT, DEMO_REQUIREMENTS, 'Кухня'),
      ids: { upper: UPPER, next: NEXT, mezz: 'mezz-0@w1', base: 'base-1200@w1' },
      expect: { before, A, B: Bp, C: Cp, outsideB, outsideC },
    },
    open: {
      ...object('P1 · стена без окна', OPEN_WALL, DEMO_REQUIREMENTS, 'Кухня'),
      ids: { counter: overDoor.id },
      expect: {
        workTopMm: workTopMm(SHOP),
        bottomMm: Math.round(counterPlace.y * 1000),
        topMm: Math.round((counterPlace.y + counterPlace.heightM) * 1000),
        ceilingMm: openRun.ceilingHeightMm,
      },
    },
    living: {
      ...object('P1 · гостиная', DEMO_MEASUREMENT, livingReq, 'Гостиная'),
      templateId: livingTemplate.id,
      ids: { target: livingTarget.id },
      expect: { after: livingAfter },
    },
  }),
);
