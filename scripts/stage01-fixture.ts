/**
 * ОБЪЕКТЫ И ОЖИДАНИЯ БРАУЗЕРНОЙ ПРИЁМКИ STAGE 01 — путём экрана, базу не трогает.
 *
 *   kitchen — демо-кухня, ПРАВЛЕНЫЙ ряд (эмаль на фасад одного нижнего
 *             модуля). Ряд лежит со снимком школы цеха — ровно то
 *             состояние, в котором «Глубина нижнего» 450 стояла в поле, а
 *             мебель оставалась 560. На экране сначала правится ширина
 *             (450 → 400), потом отметки — они ложатся на ряд с этой правкой.
 *   bedroom — шкаф спальни по шаблону «Шкаф-купе», без антресоли и без
 *             правок: «Добавить антресоль» ставит полосу над шкафом.
 *   living  — зал: антресоли в составе зоны нет — нет и кнопки.
 *   bedroomHinged — шкаф спальни с распашными дверцами: на нём проверяется,
 *             что материал спальни ложится на её стены и не трогает кухню.
 *
 * Ожидания считает тот же путь, что экран: `workspaceInput` →
 * `composeVariants` (правленый ряд — в `editedRuns`) → `applyOps`, как
 * `runOps`. Браузер сверяет с ними то, что нарисовано, — и с абсолютными
 * числами там, где они названы в задаче (450, 760, 400, 600).
 *
 * Отметки фасада (`data-bottom-mm`, `data-top-mm`) — с того же
 * `ElevationDrawing`, отрисованного здесь для ряда движка: браузер сверяет,
 * что экран отдаёт чертежу тот же ряд, а не пересчитывает правила чертежа.
 *
 * Запуск: `npx tsx --tsconfig tsconfig.scripts.json scripts/stage01-fixture.ts`
 * (JSX чертежа — как у `test:millwork`). Выход — JSON в stdout. Отказ движка
 * там, где его не ждали, — падение.
 */
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { applyOps } from '../lib/millwork/ops';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { OBJECT_MARKS, productionFor, withMark } from '../lib/millwork/shop';
import { markShownMm, marksOfZone, moduleCarcassHeightMm, moduleDepthMm } from '../lib/millwork/fill';
import { runPlaces } from '../lib/millwork/cabinetBoxes';
import { BOTTOM_PANEL_NAME, buildPanels, SIDE_PANEL_NAME } from '../lib/millwork/panels';
import { contextChange } from '../lib/millwork/runContext';
import { projectOffer } from '../lib/millwork/objectEstimate';
import { allModules } from '../lib/millwork/layout';
import { hasFacade } from '../lib/millwork/applianceFront';
import { RUN_TEMPLATES, requirementsFromTemplate } from '../lib/millwork/templates';
import { DEFAULT_MEZZANINE_MM } from '../lib/millwork/sections';
import { surveyFromMeasurement, type Survey } from '../types/survey';
import type { ProductionOverrides } from '../types/catalog';
import type { Measurement, MillworkOp, Run, RunRequirements, VariantKey, ZoneKind } from '../types/millwork';
import type { MillworkState } from '../lib/projects';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ElevationDrawing from '../components/millwork/ElevationDrawing';

const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
const MM = 1000;

/** Замер как замеренный: приёмка не про допущения (тот же приём, что у `hardware-fixture`). */
function measuredSurvey(measurement: Measurement): Survey {
  const survey = surveyFromMeasurement(measurement, 'STAGE 01', 'STAGE 01', '2026-10-22');
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

const markOf = (key: string) => {
  const found = OBJECT_MARKS.find((m) => m.key === key);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: отметки «${key}» в OBJECT_MARKS нет`);
  return found;
};
const marks = (pairs: [string, number][]): ProductionOverrides | undefined =>
  pairs.reduce<ProductionOverrides | undefined>((own, [key, value]) => withMark(own, markOf(key), value), undefined);

/** Экран одного объекта: вход на этих отметках, показанный ряд, правка как `runOps`. */
function screen(title: string, zone: string, measurement: Measurement, requirements: RunRequirements) {
  const inputFor = (own?: ProductionOverrides) =>
    workspaceInput({
      title,
      zone,
      measurement,
      requirements,
      rates: DEMO_RATES,
      wallId: 'w1',
      cornerAt: null,
      production: productionFor(undefined, own),
    });
  const shown = (edited: Run | null, own?: ProductionOverrides): Run =>
    composeVariants(inputFor(own), DISABLED, edited ? { optimal: edited } : {}).find((v) => v.key === 'optimal')!.run;
  const apply = (run: Run, ops: MillworkOp[], own?: ProductionOverrides): { run: Run; warnings: string[] } => {
    const next = applyOps({ run, requirements, ops, openings: inputFor(own).openings, roomDepthMm: 0 });
    return { run: next, warnings: next.warnings };
  };
  const applied = (run: Run, ops: MillworkOp[], own?: ProductionOverrides): Run => {
    const next = apply(run, ops, own);
    if (next.warnings.length) throw new Error(`${title}: движок отказал: ${next.warnings.join(' | ')}`);
    return next.run;
  };
  return { inputFor, shown, apply, applied };
}

/** Отметки модулей на развёртке — так, как их рисует `ElevationDrawing` для этого ряда. */
function facadeOf(run: Run): Map<string, { bottomMm: number; topMm: number }> {
  const svg = renderToStaticMarkup(createElement(ElevationDrawing, { run, mode: 'fronts' }));
  const out = new Map<string, { bottomMm: number; topMm: number }>();
  for (const tag of svg.match(/<g [^>]*data-module-id="[^"]+"[^>]*>/g) ?? []) {
    const id = /data-module-id="([^"]+)"/.exec(tag)![1];
    out.set(id, { bottomMm: Number(/data-bottom-mm="(-?\d+)"/.exec(tag)?.[1]), topMm: Number(/data-top-mm="(-?\d+)"/.exec(tag)?.[1]) });
  }
  return out;
}

/** То, что браузер читает с плана, фасада и инспектора: место, глубина, высота корпуса, отметки фасада. */
function placesOf(run: Run) {
  const facade = facadeOf(run);
  return runPlaces(run).map((p) => ({
    id: p.unit.id,
    offsetMm: p.unit.offsetMm,
    widthMm: p.unit.widthMm,
    kind: p.unit.kind,
    section: p.unit.section ?? null,
    appliance: p.unit.appliance ?? null,
    depthMm: moduleDepthMm(p.unit, run.zone, run.production),
    bottomMm: Math.round(p.y * MM),
    heightMm: moduleCarcassHeightMm(p.unit, run),
    facadeBottomMm: facade.get(p.unit.id)?.bottomMm ?? null,
    facadeTopMm: facade.get(p.unit.id)?.topMm ?? null,
  }));
}

/** Детали модуля в деталировке по имени: «длина x ширина x толщина», как `data-part-size`. */
function partsOf(run: Run, moduleId: string, name: string): string[] {
  return buildPanels({ run })
    .filter((panel) => panel.moduleId === moduleId && panel.name === name)
    .map((panel) => `${panel.lengthMm}x${panel.widthMm}x${panel.thicknessMm}`)
    .sort();
}
const sidesOf = (run: Run, moduleId: string) => partsOf(run, moduleId, SIDE_PANEL_NAME);

/** Метраж ЛДСП корпуса — та же смета объекта, что у кабинета клиента (`projectOffer`). */
function carcassAreaOf(title: string, zoneTitle: string, measurement: Measurement, state: MillworkState): number {
  const offer = projectOffer({ title, zone: zoneTitle, measurement, state, catalog: [], rates: DEMO_RATES });
  if (offer.state !== 'built') throw new Error(`${title}: смета объекта не собралась: ${offer.refusal}`);
  const line = offer.estimate.lines.find((l) => l.key === 'ldsp_carcass');
  if (!line) throw new Error(`${title}: в смете нет строки ldsp_carcass`);
  return line.quantity;
}

/* ═════════════════════════  kitchen  ═════════════════════════ */

const K_TITLE = 'STAGE 01 · кухня';
const kitchenScreen = screen(K_TITLE, 'Кухня', DEMO_MEASUREMENT, DEMO_REQUIREMENTS);
const kPlain = kitchenScreen.shown(null);
const kTarget = kPlain.modules.find((u) => u.kind === 'base' && !u.appliance && !u.column);
if (!kTarget) throw new Error('kitchen: НУЛЕВОЙ СЕЛЕКТОР — в ряду нет обычного нижнего модуля');
const kFront = kitchenScreen.applied(kPlain, [
  { op: 'set_front', moduleId: kTarget.id, front: { base: 'mdf_enamel', construct: 'solid', finish: 'matte' } },
]);
/*
 * Своя раскладка ящиков на другом обычном модуле: 4 фронта 140/140/140/300 —
 * как граница, протянутая на чертеже. На ней «Боковина» 500 отказывает словами.
 */
const kDrawer = kPlain.modules.filter((u) => u.kind === 'base' && !u.appliance && !u.column && u.id !== kTarget.id).pop();
if (!kDrawer) throw new Error('kitchen: НУЛЕВОЙ СЕЛЕКТОР — второго обычного нижнего модуля нет');
const kFour = kitchenScreen.applied(kitchenScreen.shown(kFront), [{ op: 'set_fronts', moduleId: kDrawer.id, drawerCount: 4 }]);
const kFourUnit = kFour.modules.find((u) => u.id === kDrawer.id)!;
const kEdited = kitchenScreen.applied(kitchenScreen.shown(kFour), [
  { op: 'set_fill', moduleId: kDrawer.id, fill: { ...kFourUnit.fill!, drawerHeights: [140, 140, 140, 300] } },
]);
if (kEdited.modules.find((u) => u.id === kDrawer.id)?.fill?.drawerHeights.join('/') !== '140/140/140/300') {
  throw new Error('kitchen: своя раскладка ящиков не легла');
}
const OWN_DEPTH = marks([['baseMm', 450]]);
const OWN_BOTH = marks([['baseMm', 450], ['carcassMm', 760]]);
/* Ширина — полем инспектора, как `runOps`: правка ложится на ПОКАЗАННЫЙ ряд. */
const kInitial = kitchenScreen.shown(kEdited);
const K_WIDTH_FROM = kInitial.modules.find((u) => u.id === kTarget.id)!.widthMm;
const K_WIDTH_TO = K_WIDTH_FROM - 50;
const kWidth = kitchenScreen.applied(kInitial, [{ op: 'set_width', moduleId: kTarget.id, widthMm: K_WIDTH_TO }]);
const kBefore = kitchenScreen.shown(kWidth);
const kDepth = kitchenScreen.shown(kWidth, OWN_DEPTH);
const kBoth = kitchenScreen.shown(kWidth, OWN_BOTH);
/* Обычные нижние модули ПОСЛЕ сужения: id выводится из места, и сдвинутые соседи — уже другие id. */
const plainIds = kBefore.modules.filter((u) => u.kind === 'base' && !u.appliance && !u.column).map((u) => u.id);
/* Высота корпуса — правленый ряд против тех же отметок: что подогнано у ящиков. */
const heightChange = contextChange([
  { saved: kWidth, live: { production: productionFor(undefined, OWN_BOTH), ceilingHeightMm: kWidth.ceilingHeightMm } },
]);
/* «Боковина» 500 после всех отметок: своей раскладке нижнему ящику не хватает — отказ до записи. */
const K_CARCASS_TRY = 500;
const carcassChange = contextChange([
  {
    saved: kWidth,
    live: { production: productionFor(undefined, withMark(OWN_BOTH, markOf('carcassMm'), K_CARCASS_TRY)), ceilingHeightMm: kWidth.ceilingHeightMm },
  },
]);
if (carcassChange.losses.length === 0) throw new Error('kitchen: боковина 500 принята — отказ поля отметки проверить нельзя');

const kState = (own?: ProductionOverrides): MillworkState =>
  JSON.parse(
    JSON.stringify({
      survey: measuredSurvey(DEMO_MEASUREMENT),
      requirements: DEMO_REQUIREMENTS,
      runs: { optimal: kWidth },
      selectedVariant: 'optimal',
      ...(own ? { production: own } : {}),
    }),
  );

const kitchen = {
  zoneTitle: 'Кухня',
  requirements: DEMO_REQUIREMENTS,
  measurement: DEMO_MEASUREMENT,
  survey: measuredSurvey(DEMO_MEASUREMENT),
  run: kEdited,
  expect: {
    target: kTarget.id,
    plainIds,
    width: { from: K_WIDTH_FROM, to: K_WIDTH_TO },
    initial: placesOf(kInitial),
    bottoms: { initial: partsOf(kInitial, kTarget.id, BOTTOM_PANEL_NAME), width: partsOf(kBefore, kTarget.id, BOTTOM_PANEL_NAME) },
    before: placesOf(kBefore),
    depth: placesOf(kDepth),
    both: placesOf(kBoth),
    sides: {
      before: sidesOf(kBefore, kTarget.id),
      depth: sidesOf(kDepth, kTarget.id),
      both: sidesOf(kBoth, kTarget.id),
    },
    ldsp: {
      before: carcassAreaOf(K_TITLE, 'Кухня', DEMO_MEASUREMENT, kState()),
      depth: carcassAreaOf(K_TITLE, 'Кухня', DEMO_MEASUREMENT, kState(OWN_DEPTH)),
      both: carcassAreaOf(K_TITLE, 'Кухня', DEMO_MEASUREMENT, kState(OWN_BOTH)),
    },
    refitted: heightChange.refitted.length,
    carcassTry: K_CARCASS_TRY,
    carcassLoss: carcassChange.losses[0].words,
    losses: heightChange.losses.length,
    own: { depth: OWN_DEPTH, both: OWN_BOTH },
    marks: marksOfZone('kitchen').map((m) => m.key),
  },
};

/* ═════════════════════════  bedroom  ═════════════════════════ */

const B_TITLE = 'STAGE 01 · спальня';
const wardrobeTemplate = RUN_TEMPLATES.find((t) => t.id === 'wardrobe-sliding');
if (!wardrobeTemplate) throw new Error('bedroom: НУЛЕВОЙ СЕЛЕКТОР — шаблона wardrobe-sliding нет');
const B_REQ: RunRequirements = requirementsFromTemplate(wardrobeTemplate);
if ((B_REQ.sections ?? []).includes('mezzanine')) throw new Error('bedroom: в шаблоне уже есть антресоль — проверять нечего');
const bMeasurement: Measurement = {
  id: 'stage01-bedroom',
  ceilingHeightMm: 2700,
  walls: [3000, 2800, 3000, 2800].map((lengthMm, i) => ({ id: `w${i + 1}`, lengthMm, angleDeg: 90, openings: [] })),
  comms: [],
  photos: [],
  measuredBy: 'STAGE 01',
  measuredAt: '2026-10-22',
  notes: '',
};
const bedroomScreen = screen(B_TITLE, 'Спальня', bMeasurement, B_REQ);
const bInitial = bedroomScreen.shown(null);
const bWith = bedroomScreen.applied(bInitial, [{ op: 'set_mezzanine', heightMm: DEFAULT_MEZZANINE_MM }]);
const bWithShown = bedroomScreen.shown(bWith);
const OWN_MEZZ = marks([['mezzanineMm', 400]]);
const bMezz400 = bedroomScreen.shown(bWith, OWN_MEZZ);
const mezzIds = allModules(bWithShown).filter((u) => u.section === 'mezzanine').map((u) => u.id);
if (mezzIds.length === 0) throw new Error('bedroom: «Добавить антресоль» не поставила полосу — проверять нечего');
/* Слишком высокая антресоль — отказ словами, ряд прежний. */
const TOO_HIGH_MM = 900;
const tooHigh = bedroomScreen.apply(bMezz400, [{ op: 'set_mezzanine', heightMm: TOO_HIGH_MM }], OWN_MEZZ);
if (tooHigh.warnings.length === 0) throw new Error(`bedroom: антресоль ${TOO_HIGH_MM} мм принята — отказа проверить нельзя`);
const bRemoved = bedroomScreen.shown(bedroomScreen.applied(bMezz400, [{ op: 'set_mezzanine', heightMm: null }], OWN_MEZZ), OWN_MEZZ);


const bedroom = {
  zoneTitle: 'Спальня',
  templateId: wardrobeTemplate.id,
  requirements: B_REQ,
  measurement: bMeasurement,
  survey: measuredSurvey(bMeasurement),
  expect: {
    initial: placesOf(bInitial),
    withMezz: placesOf(bWithShown),
    mezz400: placesOf(bMezz400),
    removed: placesOf(bRemoved),
    mezzIds,
    mezzHeightMm: DEFAULT_MEZZANINE_MM,
    tooHighMm: TOO_HIGH_MM,
    tooHighWords: tooHigh.warnings[0],

    marks: marksOfZone('bedroom').map((m) => m.key),
    shown: Object.fromEntries(
      marksOfZone('bedroom').map((m) => [m.key, markShownMm(m, productionFor(undefined, undefined), 'bedroom')]),
    ),
    own: OWN_MEZZ,
  },
};

/* ═════════════════════════  living  ═════════════════════════ */

const livingTemplate = RUN_TEMPLATES.find((t) => t.id === 'living-tv');
if (!livingTemplate) throw new Error('living: НУЛЕВОЙ СЕЛЕКТОР — шаблона living-tv нет');
const L_REQ = requirementsFromTemplate(livingTemplate);
const living = {
  zoneTitle: 'Зал',
  templateId: livingTemplate.id,
  requirements: L_REQ,
  measurement: { ...bMeasurement, id: 'stage01-living' },
  survey: measuredSurvey({ ...bMeasurement, id: 'stage01-living' }),
  expect: {
    marks: marksOfZone('living' as ZoneKind).map((m) => m.key),
    modules: allModules(screen('STAGE 01 · зал', 'Зал', bMeasurement, L_REQ).shown(null)).length,
  },
};

/* ═════════════════════════  bedroomHinged  ═════════════════════════ */

const hingedTemplate = RUN_TEMPLATES.find((t) => t.id === 'wardrobe-hinged');
if (!hingedTemplate) throw new Error('bedroomHinged: НУЛЕВОЙ СЕЛЕКТОР — шаблона wardrobe-hinged нет');
const H_REQ = requirementsFromTemplate(hingedTemplate);
const hingedRun = screen('STAGE 01 · спальня, распашной', 'Спальня', bMeasurement, H_REQ).shown(null);
/* С фасадом — по той же `hasFacade`, по которой материал кладёт `materialOps` (и доборная планка: она из фасада). */
const hingedFronts = allModules(hingedRun).filter((u) => hasFacade(u)).length;
if (hingedFronts === 0) throw new Error('bedroomHinged: фасадов нет — материал проверить не на чем');
const bedroomHinged = {
  zoneTitle: 'Спальня',
  templateId: hingedTemplate.id,
  requirements: H_REQ,
  measurement: { ...bMeasurement, id: 'stage01-bedroom-hinged' },
  survey: measuredSurvey({ ...bMeasurement, id: 'stage01-bedroom-hinged' }),
  expect: { fronts: hingedFronts },
};

process.stdout.write(JSON.stringify({ kitchen, bedroom, living, bedroomHinged }));
