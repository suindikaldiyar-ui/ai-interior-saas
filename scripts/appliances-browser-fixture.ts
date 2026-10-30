/**
 * ОБЪЕКТЫ И ОЖИДАНИЯ БРАУЗЕРНОЙ ПРИЁМКИ ТЕХНИКИ (`check-appliances.mjs`, ЭТАП 3) —
 * тем же путём экрана, что `verify-appliances.ts` и STAGE A (`buildObject`:
 * `compositionFor` → `objectInput` → `composeVariants` → `wallSegments` →
 * `runPlacements`); проверки техники — `cookingFindings` и `applianceDoorFindings`.
 *
 *   kitchen — прямая 3800, демо-состав. В браузере выбирают «Духовой шкаф: под
 *             варочной», PUE611BB5E и HBG272EB3; ожидания — модуль, вырез, место
 *             панели и шкафа, дверь, строки сметы, поза камеры у шкафа; газ
 *             PGH6B5K90R — блокирующее словами (вытяжка ниже 650 мм);
 *   u       — П 3800 + 1500 + 1740 с той же парой: дверь шкафа стены В на ходу —
 *             в мебель стены А, блокирующее словами движка.
 *
 * Выход — JSON в stdout. Отказ сборки там, где его не ждали, — падение.
 */
import { DEFAULT_PRODUCTION } from '../types/catalog';
import type { Run, RunRequirements } from '../types/millwork';
import { DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applianceDoorIds, cookingFindings, cookingStackOf } from '../lib/millwork/cookingStack';
import { applianceDoorFindings } from '../lib/millwork/walls';
import { layerCounts } from '../lib/millwork/cabinetBoxes';
import { buildObject, NEW_CORNER } from './corner-quality-fixture';

const MODELS = { hob: 'PUE611BB5E', oven: 'HBG272EB3' };
const GAS = { hob: 'PGH6B5K90R', oven: 'HBG272EB3' };

const straight = (requirements: RunRequirements) =>
  buildObject({ key: 'ap-kitchen', title: 'Техника · прямая 3800', lengths: [3800], shape: 'linear', corners: [], requirements });

function hobOf(run: Run) {
  const unit = run.modules.find((m) => m.appliance === 'hob');
  if (!unit) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: модуля варочной в ряду нет');
  return unit;
}

/** Что сцена обязана нарисовать для ряда: то же, что кладёт в окошко `__mwApplianceModels`. */
function drawn(run: Run) {
  return run.modules
    .filter((unit) => unit.appliance === 'hob')
    .map((unit) => {
      const stack = cookingStackOf(unit, run, DEFAULT_PRODUCTION);
      if (!stack) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: раскладки техники у ${unit.id} нет`);
      return {
        moduleId: unit.id,
        hob: stack.hob?.article ?? null,
        oven: stack.ovenBelow ? (stack.oven?.article ?? 'типовой') : null,
        hobAt: stack.hobAt,
        ovenBottomMm: stack.ovenAt?.bottomMm ?? null,
        cutout: stack.cutout,
        doorId: applianceDoorIds({ modules: [unit] })[0] ?? null,
      };
    });
}

const sceneRows = (object: ReturnType<typeof buildObject>) => object.engine.segments.map((run, i) => ({ run, placement: object.engine.places[i] }));
const findingsOf = (object: ReturnType<typeof buildObject>) => [
  ...object.engine.segments.flatMap((run) => cookingFindings(run, DEFAULT_PRODUCTION)),
  ...applianceDoorFindings({ rows: sceneRows(object), production: DEFAULT_PRODUCTION }),
];

/* ── прямая: как открыли, с парой и с газом ── */
const plain = straight(DEMO_REQUIREMENTS);
const main = straight({ ...DEMO_REQUIREMENTS, ovenUnderHob: true, applianceModels: MODELS });
const gas = straight({ ...DEMO_REQUIREMENTS, ovenUnderHob: true, applianceModels: GAS });
const mainRun = main.engine.active.run;
const mainHob = hobOf(mainRun);
const stack = cookingStackOf(mainHob, mainRun, DEFAULT_PRODUCTION);
if (!stack?.ovenAt) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: шкафа под варочной нет');
/* Камера у шкафа: место панели в мире — место ряда (`runPlacements`) плюс середина модуля. */
const place = main.engine.places[0];
if (Math.abs(place.rotationYDeg) > 1e-9) throw new Error(`ряд прямой кухни повёрнут на ${place.rotationYDeg}°`);
const hobWorld: [number, number, number] = [place.xM + stack.hobAt.xMm / 1000, stack.worktop.topMm / 1000, place.zM + stack.hobAt.zMm / 1000];
const keys = (estimate: { lines: { key: string }[] }) => estimate.lines.map((line) => line.key);

/* ── П с узким проходом ── */
const u = buildObject({
  key: 'ap-u',
  title: 'Техника · П 3800 + 1500 + 1740',
  lengths: [3800, 1500, 1740],
  shape: 'u_shape',
  corners: [NEW_CORNER, NEW_CORNER],
  requirements: { ...DEMO_REQUIREMENTS, ovenUnderHob: true, applianceModels: MODELS },
});
const uFindings = findingsOf(u);
if (!uFindings.some((f) => f.level === 'blocking')) throw new Error('П 3800 + 1500 + 1740: блокирующего по двери шкафа нет — объект приёмки не тот');

const object = (o: ReturnType<typeof buildObject>) => ({
  title: o.title,
  zone: 'Кухня',
  measurement: o.measurement,
  survey: o.survey,
  requirements: o.requirements,
  shape: o.shape,
  corners: o.corners,
});

process.stdout.write(
  JSON.stringify({
    kitchen: {
      ...object(plain),
      expect: {
        plain: drawn(plain.engine.active.run),
        main: drawn(mainRun),
        mainKeys: keys(main.engine.active.estimate),
        mainFingerprint: mainRun.fingerprint,
        mainFindings: findingsOf(main),
        /* Кнопка слоя «Техника» — тем же счётом, что у экрана (`layerCounts`): коробки лиц приборов и модели. */
        layerCount: layerCounts(main.engine.segments).appliances ?? 0,
        gas: drawn(gas.engine.active.run),
        gasFindings: findingsOf(gas),
        camera: {
          position: [hobWorld[0] + 0.85, 1.35, hobWorld[2] + 1.75] as [number, number, number],
          target: [hobWorld[0], 0.55, hobWorld[2]] as [number, number, number],
        },
      },
    },
    u: {
      ...object(u),
      expect: {
        drawn: u.engine.segments.flatMap((run) => drawn(run)),
        findings: uFindings,
        cornerClashes: u.cornerClashes,
      },
    },
  }),
);
