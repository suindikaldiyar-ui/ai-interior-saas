/**
 * ОБЪЕКТЫ И ОЖИДАНИЯ БРАУЗЕРНОЙ ПРИЁМКИ OVAL & RADIUS (`check-radius.mjs`) —
 * тем же путём экрана, что `verify-radius.ts`: замер → `workspaceInput` →
 * `objectInput` → `composeVariants` → правка `applyOps`, как `runOps`;
 * остров — `newIsland` и `islandWithShape`, как блок «Остров».
 *
 *   free    — стена 3800 без окна, свободная сборка 600 · 600 · 400, у 400 —
 *             фасад МДФ в эмали. Ожидания: что даст «Скруглить торец справа»
 *             (то же, что под кнопкой блока, `radiusOffers`), что даст
 *             «+ Остров» и «Овал» — модули, детали по контуру в сцене,
 *             плиты по контуру, строки сметы;
 *   living  — гостиная по шаблону зоны: что даст «Скруглить торец» у крайних
 *             модулей — форма или отказ словами;
 *   facade  — та же сборка, эмаль у среднего и крайнего модуля: «Фасад дугой»
 *             у среднего (то, что предложит кнопка) — гнутые створки и площадь
 *             гнутых фасадов; торец справа, закрытый рейками, — рейки, подложка;
 *             сколько деталей по контуру сцена покажет в «Дизайне» и в
 *             «Каркасе» (`boxShown` с наборами слоёв `presetLayers`).
 *
 * Выход — JSON в stdout. Отказ движка там, где его не ждали, — падение.
 */
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectEstimateOf, objectInput } from '../lib/millwork/objectEstimate';
import { applyOps } from '../lib/millwork/ops';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { boxShown, runBoxesByModule } from '../lib/millwork/cabinetBoxes';
import { countertopSlabs } from '../lib/millwork/countertop';
import { bentLeavesOf, pathBounds } from '../lib/millwork/radius';
import { RADIUS_PART_NAME } from '../lib/millwork/panels';
import { presetLayers, type ScenePreset } from '../lib/millwork/sceneLayers';
import { radiusOffers } from '../lib/millwork/radiusPlace';
import { runPlacements } from '../lib/millwork/composition';
import { islandOvalOf, islandPlacement, islandTopDepthMm } from '../lib/millwork/island';
import { islandWithShape, newIsland } from '../lib/millwork/islandEdit';
import { RUN_TEMPLATES, requirementsFromTemplate } from '../lib/millwork/templates';
import { surveyFromMeasurement, type Survey } from '../types/survey';
import { DEFAULT_PRODUCTION } from '../types/catalog';
import type { Measurement, MillworkOp, Run, RunRequirements, VariantKey } from '../types/millwork';

const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
const SHOP = DEFAULT_PRODUCTION;

/** Замер как замеренный: приёмка не про допущения (тот же приём, что у `p1-vitrines-fixture`). */
function measuredSurvey(measurement: Measurement): Survey {
  const survey = surveyFromMeasurement(measurement, 'R', 'R', '2026-10-28');
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
  const base = workspaceInput({ title: 'R', zone, measurement, requirements, rates: DEMO_RATES, cornerAt: null, wallId: 'w1' });
  const input = objectInput({ base, resolution: null, requirements, rates: DEMO_RATES, production: SHOP, milling: new Map(), carcass: new Map(), materials: new Map() });
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, DISABLED, edited).find((variant) => variant.key === 'optimal')!;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown().run, requirements, ops: list, openings: input.openings });
    if (next.warnings.length > 0) throw new Error(`движок отказал: ${next.warnings.join(' | ')}`);
    edited = { optimal: next };
    return shown();
  };
  return { shown, ops, input };
}

const sceneBoxes = (run: Run) =>
  runBoxesByModule(run, { production: SHOP, thicknessMm: SHOP.carcassMm, frontThicknessMm: SHOP.frontMm, gapMm: SHOP.frontGapMm }).modules;
/** Детали по контуру и гнутые в сцене — сколько коробок с формой, тем же `runBoxesByModule`, что у `Cabinet3D`. */
const shapedParts = (run: Run) => sceneBoxes(run).reduce((sum, entry) => sum + entry.boxes.filter((box) => box.shape).length, 0);
/** То же при наборе слоёв предустановки — фильтр `boxShown`, которым `Cabinet3D` отбирает коробки до пачек. */
const shapedShown = (run: Run, preset: ScenePreset) => {
  const layers = presetLayers(preset);
  return sceneBoxes(run).reduce((sum, entry) => sum + entry.boxes.filter((box) => box.shape && boxShown(box, layers)).length, 0);
};
/** Плиты ряда по контуру: длина и глубина габарита, мм. */
const plates = (run: Run) =>
  countertopSlabs(run)
    .filter((slab) => slab.outline)
    .map((slab) => {
      const b = pathBounds(slab.outline!);
      return { lengthMm: Math.round(b.maxX - b.minX), depthMm: Math.round(b.maxZ - b.minZ) };
    });
const qty = (estimate: { lines: { key: string; quantity: number }[] }, key: string) =>
  Math.round(estimate.lines.filter((line) => line.key === key).reduce((sum, line) => sum + line.quantity, 0) * 1000) / 1000;

const OPEN_WALL: Measurement = {
  ...DEMO_MEASUREMENT,
  id: 'radius-open-wall',
  walls: DEMO_MEASUREMENT.walls.map((wall, i) => (i === 0 ? { ...wall, openings: [] } : wall)),
};
const FREE: RunRequirements = { ...DEMO_REQUIREMENTS, mode: 'free', appliances: [] };

/* ── свободная сборка 600 · 600 · 400 ── */
const f = screen(OPEN_WALL, FREE, 'Кухня');
f.ops([
  { op: 'add_module', kind: 'base', widthMm: 600, atMm: 0 },
  { op: 'add_module', kind: 'base', widthMm: 600, atMm: 600 },
  { op: 'add_module', kind: 'base', widthMm: 400, atMm: 1200 },
]);
const END = 'base-1200@w1';
const seeded = f.ops([{ op: 'set_front', moduleId: END, front: { base: 'mdf_enamel', construct: 'solid', finish: 'matte' } }]);
const endUnit = seeded.run.modules.find((unit) => unit.id === END);
if (!endUnit) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${END} нет`);
/** Что под кнопкой блока «Форма · радиус» — та же `radiusOffers`, что рисует кнопки. */
const button = (unit: (typeof seeded.run.modules)[number], run: Run, key: 'right' | 'left' | 'front') => {
  const found = radiusOffers(unit, run).find((item) => item.key === key);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: кнопки «${key}» у ${unit.id} нет`);
  return found;
};
const offer = button(endUnit, seeded.run, 'right');
if (offer.refusal) throw new Error(`торец не встаёт: ${offer.refusal}`);
const rounded = f.ops([{ op: 'set_radius', moduleId: END, radius: offer.spec }]);

/* «+ Остров» и «Овал» — на ряду со скруглённым торцом, как в прогоне. */
const base = { requirements: FREE, ceilingHeightMm: f.input.ceilingHeightMm, production: f.input.production };
const madeIsland = newIsland(base, rounded.run.lengthMm);
if ('refusal' in madeIsland) throw new Error(`остров: ${madeIsland.refusal}`);
const ovalEdit = islandWithShape(madeIsland.run, 'oval', base);
if ('refusal' in ovalEdit) throw new Error(`овал: ${ovalEdit.refusal}`);
const island = ovalEdit.run;
const place = runPlacements({ runs: [rounded.run], zone: rounded.run.zone, production: SHOP })[0];
const withIsland = objectEstimateOf({ layout: null, segments: [rounded.run], wallAEstimate: rounded.estimate, variantKey: 'optimal', input: f.input, disabled: DISABLED, island });

/* ── гостиная по шаблону зоны ── */
const livingTemplate = RUN_TEMPLATES.find((t) => t.zone === 'living');
if (!livingTemplate) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: шаблона гостиной нет');
const livingReq = requirementsFromTemplate(livingTemplate, DEMO_REQUIREMENTS.options);
const l = screen(DEMO_MEASUREMENT, livingReq, 'Гостиная');
const livingRun = l.shown().run;
const ordered = [...livingRun.modules].sort((a, b) => a.offsetMm - b.offsetMm);
const ends = [
  { place: 'left' as const, unit: ordered[0] },
  { place: 'right' as const, unit: ordered[ordered.length - 1] },
].map(({ place: side, unit }) => {
  const answer = button(unit, livingRun, side);
  return { side, id: unit.id, label: unit.label, ...(answer.refusal ? { refusal: answer.refusal } : { spec: answer.spec }) };
});
let livingAfter = livingRun;
for (const end of ends) if ('spec' in end) livingAfter = l.ops([{ op: 'set_radius', moduleId: end.id, radius: end.spec }]).run;

/* ── фасад дугой у среднего модуля и рейки на торце — та же сборка, эмаль у обоих ── */
const MID = 'base-600@w1';
const ENAMEL = { base: 'mdf_enamel', construct: 'solid', finish: 'matte' } as const;
const g = screen(OPEN_WALL, FREE, 'Кухня');
g.ops([
  { op: 'add_module', kind: 'base', widthMm: 600, atMm: 0 },
  { op: 'add_module', kind: 'base', widthMm: 600, atMm: 600 },
  { op: 'add_module', kind: 'base', widthMm: 400, atMm: 1200 },
]);
const gSeeded = g.ops([
  { op: 'set_front', moduleId: MID, front: ENAMEL },
  { op: 'set_front', moduleId: END, front: ENAMEL },
]);
const midUnit = gSeeded.run.modules.find((unit) => unit.id === MID);
if (!midUnit) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${MID} нет`);
const arcOffer = button(midUnit, gSeeded.run, 'front');
if (arcOffer.refusal) throw new Error(`фасад дугой не встаёт: ${arcOffer.refusal}`);
const arc = g.ops([{ op: 'set_radius', moduleId: MID, radius: arcOffer.spec }]);
const endBeside = arc.run.modules.find((unit) => unit.id === END);
if (!endBeside) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${END} нет`);
const endOffer = button(endBeside, arc.run, 'right');
if (endOffer.refusal) throw new Error(`торец рядом с фасадом дугой не встаёт: ${endOffer.refusal}`);
/* Блок меняет только то, чем закрыта дуга (`patch({ cover })`): остальное — как у предложения. */
const slatSpec = { ...endOffer.spec, cover: 'slats' as const };
const slatted = g.ops([{ op: 'set_radius', moduleId: END, radius: slatSpec }]);
const slatCount = sceneBoxes(slatted.run)
  .filter((entry) => entry.unit.id === END)
  .flatMap((entry) => entry.boxes)
  .filter((box) => box.panel === RADIUS_PART_NAME.slat).length;

const object = (title: string, measurement: Measurement, requirements: RunRequirements, zone: string) => ({
  title,
  zone,
  measurement,
  survey: measuredSurvey(measurement),
  requirements,
  shape: 'linear' as const,
});

process.stdout.write(
  JSON.stringify({
    free: {
      ...object('Радиус · свободная сборка 3800', OPEN_WALL, FREE, 'Кухня'),
      runs: { optimal: seeded.run },
      ids: { end: END, first: 'base-0@w1' },
      expect: {
        radius: offer.spec,
        shapedBefore: shapedParts(seeded.run),
        shapedAfter: shapedParts(rounded.run),
        plates: plates(rounded.run),
        lines: {
          radius_bent_front: qty(rounded.estimate, 'radius_bent_front'),
          radius_cnc: qty(rounded.estimate, 'radius_cnc'),
          radius_countertop_cut: qty(rounded.estimate, 'radius_countertop_cut'),
        },
        island: {
          modules: island.modules.length,
          shaped: shapedParts(island),
          plates: plates(island),
          topDepthMm: islandTopDepthMm(island),
          oval: islandOvalOf(island),
          placement: islandPlacement(place, island),
          countertopIsland: qty(withIsland, 'countertop_island'),
        },
      },
    },
    living: {
      ...object('Радиус · гостиная', DEMO_MEASUREMENT, livingReq, 'Гостиная'),
      templateId: livingTemplate.id,
      expect: { ends, shapedAfter: shapedParts(livingAfter) },
    },
    facade: {
      ...object('Радиус · фасад дугой и рейки 3800', OPEN_WALL, FREE, 'Кухня'),
      runs: { optimal: gSeeded.run },
      ids: { mid: MID, end: END },
      expect: {
        arc: {
          radius: arcOffer.spec,
          leaves: bentLeavesOf({ radius: arcOffer.spec, widthMm: midUnit.widthMm }).length,
          shaped: shapedParts(arc.run),
          bentFront: qty(arc.estimate, 'radius_bent_front'),
        },
        slats: {
          offer: endOffer.spec,
          radius: slatSpec,
          count: slatCount,
          shaped: shapedParts(slatted.run),
          frame: shapedShown(slatted.run, 'frame'),
          design: shapedShown(slatted.run, 'design'),
          bentPanel: qty(slatted.estimate, 'radius_bent_panel'),
        },
      },
    },
  }),
);
