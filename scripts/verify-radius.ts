/**
 * ПРИЁМКА OVAL & RADIUS, ЭТАП A — РАДИУСНЫЙ ДВИЖОК И ПРИМЕРЫ.
 * Входит в `test:millwork`; отдельно —
 * `npx tsx --tsconfig tsconfig.scripts.json scripts/verify-radius.ts`.
 *
 * Путь экрана: замер → `workspaceInput` → `objectInput` → `composeVariants` →
 * правка `applyOps` (как `runOps`: ряд с отказом записывается без правки) →
 * `composeVariants` снова; остров — правками `islandEdit` и `applyOps` с
 * составом острова (`islandRequirements`), на показе — `islandOnShow`;
 * объект — `objectEstimateOf` с островом, кабинет клиента — `projectOffer`
 * по записи; комната — `buildFromSurvey` (замер 2.0, все стены комнаты).
 *
 * Меряется нарисованное и посчитанное, а числа ожиданий выводятся из
 * геометрии здесь же (радиус, свес, стрелка дуги, касание), а не берутся из
 * ответа движка:
 *
 *   R.1  радиусный кухонный шкаф (торец R400, гнутая дверца): сцена = раскрой = смета, плита и цоколь по дуге,
 *        петли и «нажатием», DEMO ONLY словами, снятие — тот же модуль и тот же отпечаток;
 *   R.2  фасад дугой: выпуклая R1200 — две гнутые створки, концы по наружной грани; вогнутая R1500;
 *   R.3  декоративная панель — рейки по дуге торца на гнутой подложке: число реек и подложка в смете;
 *   R.4  отказы до записи словами: ящики, техника, ЛДСП, середина ряда, тыл у стены, стрелка дуги, длина дуги;
 *   R.5  отказы после правки: сосед за торцом, ширина не равна радиусу, ЛДСП — правка не применена;
 *   R.6  остров: прямой, полукруглый торец, капсула, овал — торцы, плита (свес, дуги, касание), тыл, смета;
 *   R.7  смета объекта с островом и без: без острова — та же смета и отпечаток, с островом — сумма рядов;
 *   R.8  «записал — открыл» и кабинет клиента: тот же остров, итог и отпечаток;
 *   R.9  место острова: проходы по норме, вход в мебель угловой — блокирующее (цены нет, выпуск заперт,
 *        запись идёт), стена комнаты, расстояние до стены без мебели — числом;
 *   R.10 отражение комнаты: прямая — остров отражён вдоль ряда, торцы на своих местах; угловая — снят словами;
 *   R.11 отражение ряда со скруглённым торцом — торец у другого края и собирается;
 *   R.12 дизайн «Эмаль с радиусом» — форма модуля (`set_radius`), а не пометка фасада; что не встало — словами;
 *   R.13 пометка «радиусный» без формы — прямая деталь, сказано словами; промпт не называет её гнутой;
 *   R.14 ТВ-зона: подвесные модули со скруглёнными торцами вокруг ниши;
 *   R.15 способы цеха: подтверждены — не DEMO ONLY; наименьший радиус гибки — отказ радиусу меньше;
 *   R.16 карта раскроя: гнутые детали не на листах, выпуск заперт словами, остров — своей стеной раскроя;
 *   R.17 чертёж и план: метка радиуса на фасаде, контур на плане, остров на плане Studio;
 *   R.18 «Радиусный» в выборе фасада — форма модуля: у края ряда торец, в середине фасад дугой, у ЛДСП — нет;
 *   R.19 скруглённый угол столешницы у свободного конца ряда и у прямого торца острова: дуга касается кромок,
 *        рез по дуге в смете, отпечаток, отказы, проверка после правки, зеркало;
 *   R.20 стена комнаты у конца ряда — по обходу замера: торец и угол плиты у стены не скругляют (дизайн,
 *        кнопка, «Радиусный», правка, угол плиты), хвост до стены, ряд от выступа, Г в замкнутой комнате,
 *        форма, заданная раньше, — словами и с запертым выпуском.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_PRODUCTION, TYPICAL_CUTTING, type ProductionSettings } from '../types/catalog';
import type { FrontSpec, Measurement, MillworkOp, Module, RadiusSpec, Run, RunRequirements, VariantKey } from '../types/millwork';
import type { MillworkState } from '../lib/projects';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { islandOnShow, islandPanelWall, objectEstimateOf, objectInput, projectOffer } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { allModules, buildRun } from '../lib/millwork/layout';
import { openablePartIds, runBoxesByModule, runPlaces, sceneLeaves, type PartBox } from '../lib/millwork/cabinetBoxes';
import { BENT_FACADE_PANEL_NAME, RADIUS_PART_NAME, buildPanels, objectPanels } from '../lib/millwork/panels';
import { buildEstimate } from '../lib/millwork/estimate';
import { counterCornerOf, counterCornerRefusal, countertopCurveMm, countertopSlabs, plinthSpans, radiusPlinths } from '../lib/millwork/countertop';
import {
  SLATS,
  curvedLengthOf,
  frontArcCenter,
  pathBounds,
  sagittaMm,
  segEnd,
  segStart,
  shellDevelopedMm,
  type PathSeg,
  type PlanPath,
} from '../lib/millwork/radius';
import { moduleCarcassHeightMm, moduleDepthMm, COUNTER_OVERHANG_MM } from '../lib/millwork/fill';
import { openingHardware } from '../lib/millwork/opening';
import {
  flatRadiusFronts,
  radiusLists,
  radiusMethodState,
  radiusOfferFor,
  radiusOffers,
  radiusPlaceRefusal,
  radiusRowOf,
  staleRadius,
} from '../lib/millwork/radiusPlace';
import { runWithWallEnds, wallEndsOf } from '../lib/millwork/room';
import { standsOnFloor } from '../lib/millwork/modules';
import {
  ISLAND_BACK_PANEL_NAME,
  ISLAND_LABEL,
  islandOvalOf,
  islandPlacement,
  islandShapeOf,
  islandTopDepthMm,
  ovalPath,
} from '../lib/millwork/island';
import { islandRequirements, islandWithBodyLength, islandWithPlacement, islandWithShape, newIsland, type IslandBase, type IslandEdit } from '../lib/millwork/islandEdit';
import { islandIssues, islandWallClearance } from '../lib/millwork/islandCheck';
import { screenState } from '../lib/millwork/screen';
import { mirroredRun, mirroredState } from '../lib/millwork/mirror';
import { RUN_DESIGNS, designOps, designRadiusPlan } from '../lib/millwork/designs';
import { describeFront } from '../lib/millwork/promptFronts';
import { cuttingPlan } from '../lib/millwork/cutting';
import { wallFurnitureOf } from '../lib/millwork/wallLength';
import { buildObject, NEW_CORNER } from './corner-quality-fixture';
import { buildFromSurvey, surveyOf } from './measurement-v2-fixture';
import ElevationDrawing from '../components/millwork/ElevationDrawing';
import PlanDrawing from '../components/millwork/PlanDrawing';
import RoomPlan from '../components/millwork/studio/RoomPlan';

type Check = (name: string, condition: boolean, detail?: string) => void;

const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
const SHOP = DEFAULT_PRODUCTION;
const near = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;
const r1 = (v: number) => Math.round(v * 10) / 10;
const ENAMEL: FrontSpec = { base: 'mdf_enamel', construct: 'solid', finish: 'matte' };
const FREE: RunRequirements = { ...DEMO_REQUIREMENTS, mode: 'free', appliances: [] };
const D = 560;
const TF = SHOP.frontMm;
const GAP = SHOP.frontGapMm;
/** Свес плиты спереди от плоскости корпусов: фасад и свес (`counterSlabDepthMm` минус глубина ряда). */
const REACH = TF + COUNTER_OVERHANG_MM;

/** Замер демо без окна и короба: стена 3800 пустая. */
const OPEN_WALL: Measurement = {
  ...DEMO_MEASUREMENT,
  id: 'radius-open-wall',
  walls: DEMO_MEASUREMENT.walls.map((wall, i) => (i === 0 ? { ...wall, openings: [] } : wall)),
};

/** Экран одной стены: правка как у `runOps` — ряд с отказом записывается без правки. */
function screen(options: { requirements?: RunRequirements; production?: ProductionSettings; zone?: string } = {}) {
  const requirements = options.requirements ?? FREE;
  const production = options.production ?? SHOP;
  const base = workspaceInput({ title: 'R', zone: options.zone ?? 'Кухня', measurement: OPEN_WALL, requirements, rates: DEMO_RATES, cornerAt: null, wallId: 'w1' });
  const input = objectInput({ base, resolution: null, requirements, rates: DEMO_RATES, production, milling: new Map(), carcass: new Map(), materials: new Map() });
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, DISABLED, edited).find((variant) => variant.key === 'optimal')!;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown().run, requirements, ops: list, openings: input.openings });
    edited = { optimal: next };
    return next.warnings;
  };
  return { input, shown, ops, requirements, production };
}

const moduleAt = (run: Run, offsetMm: number): Module => {
  const found = run.modules.find((unit) => unit.offsetMm === offsetMm);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля на ${offsetMm} мм нет — ${run.modules.map((u) => `${u.id}@${u.offsetMm}`).join(' ')}`);
  return found;
};
const boxesOf = (run: Run, id: string, production: ProductionSettings = SHOP): PartBox[] => {
  const entry = runBoxesByModule(run, { production, thicknessMm: production.carcassMm, frontThicknessMm: production.frontMm, gapMm: production.frontGapMm }).modules.find((m) => m.unit.id === id);
  if (!entry) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${id} в сцене нет`);
  return entry.boxes;
};
const lineQty = (estimate: { lines: { key: string; quantity: number }[] }, key: string) =>
  Math.round(estimate.lines.filter((line) => line.key === key).reduce((sum, line) => sum + line.quantity, 0) * 1000) / 1000;
const line = (estimate: { lines: { key: string; quantity: number; priceUnset?: string; title: string }[] }, key: string) =>
  estimate.lines.find((item) => item.key === key) ?? null;
const ok = (edit: IslandEdit, label: string): Run => {
  if ('refusal' in edit) throw new Error(`${label}: ${edit.refusal}`);
  return edit.run;
};

/** Контур замкнут, а на стыках отрезков и дуг нет излома — касание (направления совпадают). */
function contourFacts(path: PlanPath): { gap: number; kinkDeg: number } {
  const dirAt = (seg: PathSeg, end: boolean): number => {
    if (seg.kind === 'line') return Math.atan2(seg.b[1] - seg.a[1], seg.b[0] - seg.a[0]);
    const angle = end ? seg.to : seg.from;
    return angle + (Math.sign(seg.to - seg.from) * Math.PI) / 2;
  };
  let gap = 0;
  let kink = 0;
  for (let i = 0; i < path.length; i += 1) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const pa = segEnd(a);
    const pb = segStart(b);
    gap = Math.max(gap, Math.hypot(pa[0] - pb[0], pa[1] - pb[1]));
    /* Излом считается только там, где сходятся дуга и прямая или две дуги — прямая с прямой бывает углом плиты. */
    if (a.kind === 'line' && b.kind === 'line') continue;
    let d = Math.abs(dirAt(a, true) - dirAt(b, false)) % (2 * Math.PI);
    if (d > Math.PI) d = 2 * Math.PI - d;
    kink = Math.max(kink, (d * 180) / Math.PI);
  }
  return { gap, kinkDeg: kink };
}

export function radiusChecks(check: Check): void {
  /* ── R.1 радиусный кухонный шкаф ── */
  const kitchen = screen();
  kitchen.ops([
    { op: 'add_module', kind: 'base', widthMm: 600, atMm: 0 },
    { op: 'add_module', kind: 'base', widthMm: 600, atMm: 600 },
    { op: 'add_module', kind: 'base', widthMm: 400, atMm: 1200 },
  ]);
  const plainEnd = moduleAt(kitchen.shown().run, 1200);
  kitchen.ops([{ op: 'set_front', moduleId: plainEnd.id, front: ENAMEL }]);
  const flatPrint = kitchen.shown().run.fingerprint;
  const R = 400;
  const words1 = kitchen.ops([{ op: 'set_radius', moduleId: plainEnd.id, radius: { place: 'right', radiusMm: R, cover: 'door' } }]);
  const k1 = kitchen.shown();
  const end = moduleAt(k1.run, 1200);
  {
    const H = moduleCarcassHeightMm(end, k1.run);
    const boxes = boxesOf(k1.run, end.id);
    const door = boxes.find((box) => box.material === 'front' && box.shape?.form.kind === 'shell');
    const plates = boxes.filter((box) => box.shape?.form.kind === 'plate');
    const panels = buildPanels({ run: k1.run, production: SHOP }).filter((panel) => panel.moduleId === end.id);
    const bent = panels.find((panel) => panel.name === BENT_FACADE_PANEL_NAME);
    const bottom = panels.find((panel) => panel.name === RADIUS_PART_NAME.bottom);
    /* Ожидание — геометрией: дуга торца R от 90° к 0°, зазор фасада g/2 с обеих сторон по дуге. */
    const angle = Math.PI / 2 - 2 * (GAP / 2 / R);
    const developed = ((R + R + TF) / 2) * angle;
    const quarter = (R * Math.PI) / 2;
    const form = door?.shape?.form;
    const sceneDev = form?.kind === 'shell' ? shellDevelopedMm(form) : NaN;
    const hw = openingHardware([{ unit: end, heightMm: H }], k1.run);
    check(
      'R.1 радиусный шкаф: торец R400 с гнутой дверцей — в сцене гнутая деталь кольцевым сектором R400…416 и дно с крышей по контуру; в раскрое та же дверца развёрткой (длина, радиус, угол — из одной формы) и детали по контуру с дугой R·π/2; петли 2 и открывание нажатием',
      words1.length === 0 &&
        form?.kind === 'shell' &&
        near(form.r0, R) &&
        near(form.r1, R + TF) &&
        near(sceneDev, developed, 0.5) &&
        plates.length >= 2 &&
        plates.every((box) => box.panel === RADIUS_PART_NAME.shelf || near(curvedLengthOf((box.shape!.form as { path: PlanPath }).path), quarter, 0.5)) &&
        bent?.shape?.kind === 'bent' &&
        bent.shape.radiusMm === R &&
        near(bent.shape.angleDeg, r1((angle * 180) / Math.PI), 0.05) &&
        bent.widthMm === Math.round(developed) &&
        bent.lengthMm === H - GAP &&
        bottom?.shape?.kind === 'contour' &&
        near(bottom.shape.curvedMm, quarter, 0.1) &&
        hw.hinges === 2 &&
        hw.handlePush === 1 &&
        hw.handleBar === 0 &&
        openablePartIds(k1.run).includes(`${end.id}:door:0`),
      `слова «${words1.join(' | ')}» · дверца сцены R ${form?.kind === 'shell' ? `${form.r0}…${form.r1}` : '—'}, развёртка ${sceneDev.toFixed(1)} (ожидание ${developed.toFixed(1)}) · раскрой ${bent ? `${bent.lengthMm}×${bent.widthMm}, R${bent.shape?.kind === 'bent' ? bent.shape.radiusMm : '—'}, ${bent.shape?.kind === 'bent' ? bent.shape.angleDeg : '—'}°` : 'нет'} · дно дуга ${bottom?.shape?.kind === 'contour' ? bottom.shape.curvedMm : '—'} (ожидание ${quarter.toFixed(1)}) · петель ${hw.hinges}, нажатием ${hw.handlePush}`,
    );

    const slab = countertopSlabs(k1.run)[0];
    const outline = slab?.outline;
    const arcs = outline?.filter((seg): seg is Extract<PathSeg, { kind: 'arc' }> => seg.kind === 'arc') ?? [];
    const plinth = radiusPlinths(k1.run)[0];
    const pb = plinth ? pathBounds(plinth.path) : null;
    const facts = outline ? contourFacts(outline) : null;
    check(
      'R.1 плита над торцом — дугой того же центра радиусом R + свес (фасад и 25 мм): плита кончается в 1200 + R + свес, дуга четверть окружности; контур замкнут, стыки касательные; цоколь торца — по дуге R − 50, прямой цоколь до торца',
      Boolean(outline) &&
        slab.fromMm === 0 &&
        near(slab.toMm, 1200 + R + REACH, 0.1) &&
        arcs.length === 1 &&
        near(arcs[0].r, R + REACH, 1e-6) &&
        near(arcs[0].c[0], 1200, 1e-6) &&
        near(curvedLengthOf(outline!), ((R + REACH) * Math.PI) / 2, 0.1) &&
        facts!.gap < 1e-6 &&
        facts!.kinkDeg < 1e-6 &&
        Boolean(pb) &&
        near(pb!.minX, 1200) &&
        near(pb!.maxX, 1200 + R - 50) &&
        JSON.stringify(plinthSpans(k1.run)) === JSON.stringify([{ fromMm: 0, toMm: 1200 }]),
      `плита ${slab?.fromMm}…${slab?.toMm} (ожидание 0…${1200 + R + REACH}) · дуга R${arcs[0]?.r} · разрыв ${facts?.gap.toExponential(1)}, излом ${facts?.kinkDeg.toExponential(1)}° · цоколь по дуге ${pb ? `${pb.minX.toFixed(0)}…${pb.maxX.toFixed(0)}` : 'нет'} · прямой ${JSON.stringify(plinthSpans(k1.run))}`,
    );

    const est = k1.estimate;
    const bentLine = line(est, 'radius_bent_front');
    const cnc = line(est, 'radius_cnc');
    const cut = line(est, 'radius_countertop_cut');
    const contourSum = panels.filter((panel) => panel.shape?.kind === 'contour').reduce((sum, panel) => sum + (panel.shape!.kind === 'contour' ? panel.shape!.curvedMm * panel.qty : 0), 0);
    const state = radiusMethodState(k1.run, SHOP);
    check(
      'R.1 смета: гнутые фасады — площадь развёртки из раскроя, ЧПУ — длина дуг деталей по контуру, рез плиты по дуге — длина дуги плиты; у всех трёх «цена не задана» (итог неполный); DEMO ONLY — ЧПУ и гибка не подтверждены цехом, словами',
      Boolean(bentLine && cnc && cut) &&
        near(bentLine!.quantity, Math.round(((bent!.lengthMm * bent!.widthMm) / 1e6) * 100) / 100, 0.011) &&
        near(cnc!.quantity, Math.round((contourSum / 1000) * 100) / 100, 0.011) &&
        near(cut!.quantity, Math.round((((R + REACH) * Math.PI) / 2 / 1000) * 1000) / 1000, 0.002) &&
        Boolean(bentLine!.priceUnset && cnc!.priceUnset && cut!.priceUnset) &&
        state.demoOnly &&
        state.reasons.some((reason) => /ЧПУ/.test(reason)) &&
        state.reasons.some((reason) => /гнутые детали/.test(reason)),
      `гнутые ${bentLine?.quantity} м² · ЧПУ ${cnc?.quantity} м.п. (дуги ${contourSum.toFixed(1)} мм) · рез плиты ${cut?.quantity} м.п. · без цены: ${[bentLine, cnc, cut].map((l) => (l?.priceUnset ? 'да' : 'нет')).join('/')} · DEMO ONLY: ${state.reasons.join('; ')}`,
    );

    const words = kitchen.ops([{ op: 'set_radius', moduleId: end.id, radius: null }]);
    const back = kitchen.shown().run;
    const plain = moduleAt(back, 1200);
    check(
      'R.1 «Снять радиус»: модуль снова прямоугольный — дверца по ширине, без деталей по контуру и строк радиуса; отпечаток тот же, что до радиуса',
      words.length === 0 &&
        !plain.radius &&
        plain.frontType === 'door' &&
        back.fingerprint === flatPrint &&
        flatPrint !== k1.run.fingerprint &&
        buildPanels({ run: back, production: SHOP }).every((panel) => !panel.shape) &&
        !kitchen.shown().estimate.lines.some((item) => item.key.startsWith('radius_')),
      `отпечаток ${flatPrint} → ${k1.run.fingerprint} → ${back.fingerprint} · «${plain.label}»`,
    );
    kitchen.ops([{ op: 'set_radius', moduleId: plain.id, radius: { place: 'right', radiusMm: R, cover: 'door' } }]);
  }

  /* ── R.2 фасад дугой ── */
  {
    const arc = screen();
    arc.ops([{ op: 'add_module', kind: 'base', widthMm: 900, atMm: 0 }]);
    const unit = moduleAt(arc.shown().run, 0);
    arc.ops([{ op: 'set_front', moduleId: unit.id, front: ENAMEL }]);
    const W = 900;
    const RC = 1200;
    const words = arc.ops([{ op: 'set_radius', moduleId: unit.id, radius: { place: 'front', radiusMm: RC, cover: 'door' } }]);
    const run = arc.shown().run;
    const shaped = moduleAt(run, 0);
    const doors = boxesOf(run, shaped.id).filter((box) => box.material === 'front' && box.shape?.form.kind === 'shell');
    const c = frontArcCenter(W, RC, true);
    const ends = doors.flatMap((box) => {
      const form = box.shape?.form;
      return form?.kind === 'shell' ? [c[0] + form.r1 * Math.cos(form.from), c[0] + form.r1 * Math.cos(form.to)] : [];
    }).sort((a, b) => a - b);
    const leaves = sceneLeaves(shaped, moduleCarcassHeightMm(shaped, run) / 1000);
    const s = sagittaMm(RC, W);
    const plan = runPlaces(run).find((place) => place.unit.id === shaped.id);
    const outline = countertopSlabs(run)[0]?.outline;
    const slabArc = outline?.find((seg): seg is Extract<PathSeg, { kind: 'arc' }> => seg.kind === 'arc');
    check(
      'R.2 фасад дугой выпуклый R1200 на 900: дуга длиннее 600 — две гнутые створки на петлях у краёв модуля; концы створок по наружной грани ровно в g/2 от краёв и g между собой; дуга выходит вперёд на стрелку; плита — дугой R + свес того же центра',
      words.length === 0 &&
        shaped.doorCount === 2 &&
        doors.length === 2 &&
        leaves.filter((leaf) => leaf.kind === 'bent').length === 2 &&
        ends.length === 4 &&
        near(ends[0], GAP / 2, 0.01) &&
        near(ends[1], W / 2 - GAP / 2, 0.01) &&
        near(ends[2], W / 2 + GAP / 2, 0.01) &&
        near(ends[3], W - GAP / 2, 0.01) &&
        Boolean(plan) &&
        Boolean(slabArc) &&
        near(slabArc!.r, RC + REACH, 1e-6) &&
        near(slabArc!.c[0], c[0], 1e-6) &&
        near(slabArc!.c[1], c[1], 1e-6),
      `слова «${words.join(' | ')}» · створок ${shaped.doorCount}/${doors.length} · концы ${ends.map((x) => x.toFixed(2)).join(', ')} · стрелка ${s.toFixed(1)} · плита R${slabArc?.r}`,
    );
    const concave = screen();
    concave.ops([{ op: 'add_module', kind: 'base', widthMm: 900, atMm: 0 }]);
    const cu = moduleAt(concave.shown().run, 0);
    concave.ops([{ op: 'set_front', moduleId: cu.id, front: ENAMEL }]);
    const cw = concave.ops([{ op: 'set_radius', moduleId: cu.id, radius: { place: 'front', radiusMm: 1500, direction: 'concave', cover: 'door' } }]);
    const crun = concave.shown().run;
    const cdoors = boxesOf(crun, moduleAt(crun, 0).id).filter((box) => box.material === 'front' && box.shape?.form.kind === 'shell');
    const cform = cdoors[0]?.shape?.form;
    const cc = frontArcCenter(900, 1500, false);
    check(
      'R.2 фасад дугой вогнутый R1500: центр дуги перед фасадом, дверца по внутренней стороне дуги (R1484…1500), в раскрое — гнутая дверца с пометкой «вогнутая»',
      cw.length === 0 &&
        cform?.kind === 'shell' &&
        near(cform.r0, 1500 - TF) &&
        near(cform.r1, 1500) &&
        near(cform.c[1], cc[1], 1e-6) &&
        cc[1] > 0 &&
        buildPanels({ run: crun, production: SHOP }).some((panel) => panel.shape?.kind === 'bent' && panel.shape.concave === true),
      `слова «${cw.join(' | ')}» · дверца R ${cform?.kind === 'shell' ? `${cform.r0}…${cform.r1}` : '—'} · центр z ${cc[1].toFixed(1)}`,
    );
  }

  /* ── R.3 рейки по дуге ── */
  {
    const slats = screen();
    slats.ops([
      { op: 'add_module', kind: 'base', widthMm: 600, atMm: 0 },
      { op: 'add_module', kind: 'base', widthMm: 400, atMm: 600 },
    ]);
    const unit = moduleAt(slats.shown().run, 600);
    slats.ops([{ op: 'set_front', moduleId: unit.id, front: ENAMEL }]);
    const words = slats.ops([{ op: 'set_radius', moduleId: unit.id, radius: { place: 'right', radiusMm: 400, cover: 'slats' } }]);
    const shown = slats.shown();
    const run = shown.run;
    const shaped = moduleAt(run, 600);
    const rc = 400 + SLATS.substrateMm + TF / 2;
    const expected = Math.floor((rc * (Math.PI / 2) + SLATS.gapMm) / (SLATS.widthMm + SLATS.gapMm));
    const panels = buildPanels({ run, production: SHOP }).filter((panel) => panel.moduleId === shaped.id);
    const slatRows = panels.filter((panel) => panel.name === RADIUS_PART_NAME.slat);
    const substrate = panels.find((panel) => panel.name === RADIUS_PART_NAME.substrate);
    const H = moduleCarcassHeightMm(shaped, run);
    const subDev = ((400 + 400 + SLATS.substrateMm) / 2) * (Math.PI / 2);
    check(
      'R.3 декоративная панель — рейки по дуге торца: реек столько, сколько ширин «рейка + зазор» укладывается по дуге (30 + 15 мм), каждая 30 × высота корпуса × толщина фасада; подложка гнутая R400…406 развёрткой, в смете — «Подложка реек гнутая»',
      words.length === 0 &&
        slatRows.reduce((sum, panel) => sum + panel.qty, 0) === expected &&
        slatRows.every((panel) => panel.widthMm === SLATS.widthMm && panel.lengthMm === H && panel.thicknessMm === TF) &&
        substrate?.shape?.kind === 'bent' &&
        substrate.shape.radiusMm === 400 &&
        substrate.widthMm === Math.round(subDev) &&
        (line(shown.estimate, 'radius_bent_panel')?.quantity ?? 0) > 0,
      `слова «${words.join(' | ')}» · реек ${slatRows.reduce((sum, panel) => sum + panel.qty, 0)} (ожидание ${expected}) · подложка ${substrate ? `${substrate.lengthMm}×${substrate.widthMm}` : 'нет'} (развёртка ${subDev.toFixed(1)}) · в смете ${line(shown.estimate, 'radius_bent_panel')?.quantity} м²`,
    );
  }

  /* ── R.4 отказы до записи ── */
  {
    const t = screen();
    t.ops([
      { op: 'add_module', kind: 'base', widthMm: 600, atMm: 0 },
      { op: 'add_module', kind: 'base', widthMm: 900, atMm: 600 },
      { op: 'add_module', kind: 'base', widthMm: 1200, atMm: 1500 },
      { op: 'add_module', kind: 'base', widthMm: 400, atMm: 2700 },
    ]);
    const run0 = t.shown().run;
    const [a, b, c, d] = [0, 600, 1500, 2700].map((x) => moduleAt(run0, x));
    t.ops([{ op: 'set_fronts', moduleId: d.id, drawerCount: 3 }]);
    for (const unit of [b, c]) t.ops([{ op: 'set_front', moduleId: unit.id, front: ENAMEL }]);
    const before = t.shown().run.fingerprint;
    const tries: { name: string; ops: MillworkOp[]; expect: RegExp }[] = [
      { name: 'ящики', ops: [{ op: 'set_radius', moduleId: moduleAt(t.shown().run, 2700).id, radius: { place: 'right', radiusMm: 400, cover: 'open' } }], expect: /ящики/ },
      { name: 'ЛДСП', ops: [{ op: 'set_radius', moduleId: a.id, radius: { place: 'front', radiusMm: 1200, cover: 'door' } }], expect: /не гнутся/ },
      { name: 'середина', ops: [{ op: 'set_radius', moduleId: b.id, radius: { place: 'right', radiusMm: 560, cover: 'open' } }], expect: /крайнего модуля/ },
      { name: 'тыл у стены', ops: [{ op: 'set_radius', moduleId: a.id, radius: { place: 'left', radiusMm: 280, back: true, cover: 'open' } }], expect: /только у острова/ },
      { name: 'стрелка', ops: [{ op: 'set_radius', moduleId: b.id, radius: { place: 'front', radiusMm: 451, cover: 'open' } }], expect: /выходит вперёд на 421 мм/ },
      { name: 'вогнутая', ops: [{ op: 'set_radius', moduleId: b.id, radius: { place: 'front', radiusMm: 460, direction: 'concave', cover: 'open' } }], expect: /останется 195 мм/ },
      { name: 'длина дуги', ops: [{ op: 'set_radius', moduleId: c.id, radius: { place: 'front', radiusMm: 1000, cover: 'door' } }], expect: /1287 мм.*больше двух/ },
    ];
    const answers = tries.map((item) => ({ item, words: t.ops(item.ops), print: t.shown().run.fingerprint }));
    const tech = screen({ requirements: DEMO_REQUIREMENTS });
    const sink = allModules(tech.shown().run).find((unit) => unit.appliance?.startsWith('sink'));
    if (!sink) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: в демо-ряду нет мойки');
    const techWords = tech.ops([{ op: 'set_radius', moduleId: sink.id, radius: { place: 'front', radiusMm: 1200, cover: 'door' } }]);
    check(
      'R.4 что по дуге не встаёт — отказ словами до записи, ряд прежний: ящики, ЛДСП, середина ряда, тыл у стены, стрелка больше 400, вогнутая глубже корпуса, дуга длиннее двух створок, техника',
      answers.every(({ item, words, print }) => item.expect.test(words[0] ?? '') && print === before) && /техника/.test(techWords[0] ?? ''),
      answers.map(({ item, words, print }) => `${item.name}: «${words[0] ?? 'МОЛЧА'}»${print === before ? '' : ' (РЯД ИЗМЕНИЛСЯ)'}`).join(' | ') + ` | техника: «${techWords[0] ?? 'МОЛЧА'}»`,
    );
  }

  /* ── R.5 отказы после правки ── */
  {
    const before = kitchen.shown().run;
    const end = moduleAt(before, 1200);
    const tries: { name: string; ops: MillworkOp[]; expect: RegExp }[] = [
      { name: 'сосед за торцом', ops: [{ op: 'add_module', kind: 'base', widthMm: 600, atMm: 1600 }], expect: /после этой правки.*справа/ },
      { name: 'ширина', ops: [{ op: 'set_width', moduleId: end.id, widthMm: 450 }], expect: /ширина модуля должна быть равна радиусу|не встают/ },
      { name: 'ЛДСП', ops: [{ op: 'set_front', moduleId: end.id, front: { base: 'ldsp', construct: 'solid', finish: 'matte' } }], expect: /не гнутся/ },
    ];
    const answers = tries.map((item) => {
      const next = applyOps({ run: before, requirements: FREE, ops: item.ops, openings: [] });
      return { item, words: next.warnings, same: next.fingerprint === before.fingerprint && allModules(next).length === allModules(before).length };
    });
    check(
      'R.5 правка, после которой скруглённый торец не собрать (сосед встал за торцом, ширина ушла от радиуса, фасад стал ЛДСП), не применяется целиком — словами, ряд прежний',
      answers.every(({ item, words, same }) => item.expect.test(words[0] ?? '') && same),
      answers.map(({ item, words, same }) => `${item.name}: «${words[0] ?? 'МОЛЧА'}»${same ? '' : ' (ПРИМЕНЕНО)'}`).join(' | '),
    );
  }

  /* ── R.6 остров: формы, плита, тыл, смета ── */
  const base: IslandBase = { requirements: FREE, ceilingHeightMm: kitchen.input.ceilingHeightMm, production: kitchen.input.production };
  const rect = ok(newIsland(base, kitchen.shown().run.lengthMm), 'новый остров');
  const half = ok(islandWithShape(rect, 'half', base), 'полукруглый');
  const capsule = ok(islandWithShape(rect, 'capsule', base), 'капсула');
  const oval = ok(islandWithShape(rect, 'oval', base), 'овал');
  const RI = Math.floor(D / 2);
  {
    const facts = [rect, half, capsule, oval].map((run) => {
      const slab = countertopSlabs(run)[0];
      const b = slab.outline ? pathBounds(slab.outline) : null;
      return { run, slab, b, contour: slab.outline ? contourFacts(slab.outline) : null, shape: islandShapeOf(run) };
    });
    const [fr, fh, fc, fo] = facts;
    const ovalOf = islandOvalOf(oval)!;
    const c = (oval.lengthMm - 2 * RI) / 2;
    const r1o = RI + REACH;
    const r2o = r1o + (c * c + 150 * 150) / (2 * 150);
    check(
      'R.6 остров: прямой 2400 → полукруглый торец (+R280 справа) → капсула (оба торца) → овал (капсула и столешница из четырёх дуг); торцы — полуокружности R = половина глубины корпуса, открытые полки; плита замкнута, стыки касательные',
      fr.shape === 'rect' && fh.shape === 'half' && fc.shape === 'capsule' && fo.shape === 'oval' &&
        rect.lengthMm === 2400 && half.lengthMm === 2400 + RI && capsule.lengthMm === 2400 + 2 * RI &&
        [half, capsule].every((run) => run.modules.filter((unit) => unit.radius?.back && unit.radius.radiusMm === RI && unit.widthMm === RI && unit.radius.cover === 'open').length === (run === half ? 1 : 2)) &&
        facts.every((f) => f.contour !== null && f.contour.gap < 1e-6 && f.contour.kinkDeg < 1e-6),
      facts.map((f) => `${f.shape} ${f.run.lengthMm}: плита ${f.slab.fromMm}…${f.slab.toMm}, разрыв ${f.contour?.gap.toExponential(1)}, излом ${f.contour?.kinkDeg.toExponential(1)}°`).join(' | '),
    );
    const curved = (path: PlanPath | undefined) => (path ? curvedLengthOf(path) : NaN);
    check(
      'R.6 плита острова: спереди фасад и свес, сзади панель тыла и свес — глубина D + 2·(фасад + 25); у торцов — дуги R + свес (полуокружность), длина капсулы с плитой L + 2·свес; овал — боковые дуги R₂ = r₁ + (c² + 150²)/300, выпучивание 150, глубина в середине 2·(r₁ + 150)',
      Boolean(fr.b && fo.b && ovalOf) &&
        near(fr.b!.maxZ, REACH) && near(fr.b!.minZ, -D - REACH) && islandTopDepthMm(rect) === D + 2 * REACH &&
        near(fh.slab.toMm, 2400 + RI + REACH, 0.1) &&
        near(curved(fh.slab.outline), Math.PI * (RI + REACH), 0.1) &&
        near(fc.slab.fromMm, -REACH, 0.1) && near(fc.slab.toMm, capsule.lengthMm + REACH, 0.1) &&
        near(curved(fc.slab.outline), 2 * Math.PI * (RI + REACH), 0.1) &&
        near(ovalOf.r1, r1o) && ovalOf.r2 === Math.ceil(r2o) && near(ovalOf.bulgeMm, 150, 0.5) &&
        near(fo.b!.maxZ, REACH + ovalOf.bulgeMm, 0.5) && islandTopDepthMm(oval) === Math.round(2 * (r1o + ovalOf.bulgeMm)) &&
        contourFacts(ovalPath(ovalOf)).kinkDeg < 1e-6,
      `прямой ${fr.b ? `z ${fr.b.minZ}…${fr.b.maxZ}` : 'БЕЗ КОНТУРА'}, глубина ${islandTopDepthMm(rect)} · полукруглый до ${fh.slab.toMm}, дуги ${curved(fh.slab.outline).toFixed(1)} · капсула ${fc.slab.fromMm}…${fc.slab.toMm} · овал ${ovalOf ? `r₁ ${ovalOf.r1}, r₂ ${ovalOf.r2} (ожидание ${r2o}), выпучивание ${ovalOf.bulgeMm.toFixed(1)}` : 'НЕ ПОСТРОЕН'}, глубина ${islandTopDepthMm(oval)}`,
    );
    const bar = ok(islandWithPlacement(capsule, { backOverhangMm: 300 }), 'бар');
    const barB = pathBounds(countertopSlabs(bar)[0].outline!);
    const barC = contourFacts(countertopSlabs(bar)[0].outline!);
    const ovalBar = islandWithPlacement(oval, { backOverhangMm: 300 });
    const tooSmall = islandWithPlacement(oval, { sideRadiusMm: 400 });
    const dropEnd = applyOps({ run: oval, requirements: islandRequirements(FREE), ops: [{ op: 'set_radius', moduleId: oval.modules.find((unit) => unit.radius?.place === 'left')!.id, radius: null }] });
    check(
      'R.6 барная стойка у капсулы: свес с тыла 300 — плита сзади на D + фасад + 300, торцы — две четверти одного радиуса с прямой между ними, касание; у овала свес с тыла — отказ словами; радиус боковой дуги меньше касания — отказ с наименьшим числом; снять торец овала — правка не применена',
      near(barB.minZ, -D - TF - 300) && near(barB.maxZ, REACH) && barC.gap < 1e-6 && barC.kinkDeg < 1e-6 &&
        'refusal' in ovalBar && /симметричен/.test(ovalBar.refusal) &&
        'refusal' in tooSmall && /от \d+ мм/.test(tooSmall.refusal) &&
        /Правка не применена/.test(dropEnd.warnings[0] ?? '') && dropEnd.modules.length === oval.modules.length,
      `бар z ${barB.minZ}…${barB.maxZ} · овал с баром: «${'refusal' in ovalBar ? ovalBar.refusal : 'ПРИНЯТ'}» · R₂ 400: «${'refusal' in tooSmall ? tooSmall.refusal : 'ПРИНЯТ'}» · торец: «${dropEnd.warnings[0] ?? 'МОЛЧА'}»`,
    );

    const longerEdit = islandWithBodyLength(capsule, 2800, base);
    const longer = 'run' in longerEdit ? longerEdit.run : null;
    const rightEnd = longer?.modules.find((unit) => unit.radius?.place === 'right');
    const shorter = islandWithBodyLength(capsule, 2000, base);
    check(
      'R.6 длина прямой части острова: 2400 → 2800 — правый торец уехал на 400, модули тела на своих местах, длина 280 + 2800 + 280; короче модулей тела — отказ словами с миллиметрами, остров прежний',
      longer !== null &&
        longer.lengthMm === RI + 2800 + RI &&
        rightEnd?.offsetMm === RI + 2800 &&
        JSON.stringify(longer.modules.filter((unit) => !unit.radius).map((unit) => [unit.offsetMm, unit.widthMm])) ===
          JSON.stringify(capsule.modules.filter((unit) => !unit.radius).map((unit) => [unit.offsetMm, unit.widthMm])) &&
        'refusal' in shorter && /2400 мм от начала прямой части/.test(shorter.refusal),
      `длина ${capsule.lengthMm} → ${longer ? longer.lengthMm : `ОТКАЗ «${'refusal' in longerEdit ? longerEdit.refusal : ''}»`}, торец на ${rightEnd?.offsetMm} · короче: «${'refusal' in shorter ? shorter.refusal : 'ПРИНЯТ'}»`,
    );

    const backs = buildPanels({ run: capsule, production: SHOP }).filter((panel) => panel.name === ISLAND_BACK_PANEL_NAME);
    const sceneBacks = runBoxesByModule(capsule, { production: SHOP, thicknessMm: SHOP.carcassMm, frontThicknessMm: TF, gapMm: GAP }).modules.flatMap((entry) => entry.boxes.filter((box) => box.panel === ISLAND_BACK_PANEL_NAME));
    const body = capsule.modules.filter((unit) => !unit.radius);
    const height = moduleCarcassHeightMm(body[0], capsule) + 100 - GAP;
    const est = buildEstimate(capsule, 'optimal', DEMO_RATES);
    const wallEst = buildEstimate(kitchen.shown().run, 'optimal', DEMO_RATES);
    check(
      'R.6 тыл острова: у каждого прямого модуля — панель фасадного листа (от пола до столешницы минус зазор, ширина модуля минус зазор) — та же деталь в раскрое и коробка в сцене за задней стенкой; у полукруглых торцов панели нет; в смете — «Столешница острова» без цены, без плинтуса столешницы (у ряда у стены он есть)',
      backs.length === body.length && sceneBacks.length === body.length &&
        backs.every((panel) => panel.lengthMm === height && panel.widthMm === 600 - GAP && panel.thicknessMm === TF && panel.material.startsWith('Фасад')) &&
        sceneBacks.every((box) => near(box.scale[0] * 1000, 600 - GAP, 0.01) && near(box.scale[1] * 1000, height, 0.01) && near(box.position[2] * 1000, -D - TF / 2, 0.01)) &&
        Boolean(line(est, 'countertop_island')?.priceUnset) &&
        !line(est, 'countertop_plinth') && !line(est, 'countertop_ldsp') &&
        Boolean(line(wallEst, 'countertop_plinth')),
      `панелей тыла ${backs.length} в раскрое, ${sceneBacks.length} в сцене (модулей тела ${body.length}) · ${backs[0]?.lengthMm}×${backs[0]?.widthMm} · «${line(est, 'countertop_island')?.title}» · ${line(est, 'countertop_island')?.priceUnset ?? 'С ЦЕНОЙ'}`,
    );
  }

  /* ── R.7 смета объекта с островом и без ── */
  const wallShown = kitchen.shown();
  {
    const args = { layout: null, segments: [wallShown.run], wallAEstimate: wallShown.estimate, variantKey: 'optimal' as VariantKey, input: kitchen.input, disabled: DISABLED };
    const without = objectEstimateOf(args);
    const withIsland = objectEstimateOf({ ...args, island: capsule });
    const islandEst = buildEstimate(capsule, 'optimal', DEMO_RATES);
    const front = (e: typeof without) => lineQty(e, 'front_panel');
    check(
      'R.7 смета объекта: без острова — ровно смета стены (тот же итог и отпечаток); с островом — строки острова сложены со строками стены (фасады стены + фасады острова с панелями тыла), отпечаток объекта другой',
      without.total === wallShown.estimate.total &&
        without.fingerprint === wallShown.estimate.fingerprint &&
        near(front(withIsland), front(wallShown.estimate) + front(islandEst), 0.011) &&
        withIsland.total > without.total &&
        withIsland.fingerprint !== without.fingerprint &&
        Boolean(line(withIsland, 'countertop_island')),
      `итог ${without.total} → ${withIsland.total} · фасады ${front(wallShown.estimate)} + ${front(islandEst)} = ${front(withIsland)} · отпечаток ${without.fingerprint} → ${withIsland.fingerprint}`,
    );
  }

  /* ── R.8 записал — открыл, кабинет клиента ── */
  {
    const state: MillworkState = {
      requirements: FREE,
      runs: { optimal: wallShown.run },
      selectedVariant: 'optimal',
      disabled: DISABLED,
      shape: 'linear',
      island: oval,
      savedAt: '2026-10-28T12:00:00.000Z',
    };
    const reopened = JSON.parse(JSON.stringify(state)) as MillworkState;
    const shownIsland = islandOnShow(reopened.island, { production: kitchen.input.production, ceilingHeightMm: kitchen.input.ceilingHeightMm });
    const screenEst = objectEstimateOf({ layout: null, segments: [wallShown.run], wallAEstimate: wallShown.estimate, variantKey: 'optimal', input: kitchen.input, disabled: DISABLED, island: shownIsland });
    const offer = projectOffer({ title: 'R', zone: 'Кухня', measurement: OPEN_WALL, state: reopened, production: SHOP, catalog: [], rates: DEMO_RATES });
    const built = offer.state === 'built' ? offer : null;
    check(
      'R.8 «записал — открыл» (JSON): остров тем же рядом — модули, торцы и овал; кабинет клиента по записи (`projectOffer`) — тот же остров, тот же итог и тот же отпечаток, что на экране',
      Boolean(shownIsland) &&
        JSON.stringify(shownIsland!.modules) === JSON.stringify(oval.modules) &&
        islandShapeOf(shownIsland!) === 'oval' &&
        Boolean(built?.island) &&
        built!.estimate.total === screenEst.total &&
        built!.estimate.fingerprint === screenEst.fingerprint,
      `остров ${shownIsland ? islandShapeOf(shownIsland) : 'нет'} · экран ${screenEst.total} / ${screenEst.fingerprint} · кабинет ${built ? `${built.estimate.total} / ${built.estimate.fingerprint}` : offer.state === 'refused' ? offer.refusal : '—'}`,
    );
  }

  /* ── R.9 место острова: проходы, вход в мебель и в стену, стена без мебели ── */
  {
    const room = buildFromSurvey({
      title: 'комната 4000 × 3500',
      survey: surveyOf([{ length: 4000, run: true }, { length: 3500 }, { length: 4000 }, { length: 3500 }]),
      shape: 'linear',
    });
    if (room.refusal) throw new Error(`R.9: ${room.refusal}`);
    const rows = room.segments.map((run, i) => ({ run, placement: room.places[i] }));
    const nameOf = (wall: { id: string }) => `стена ${wall.id.slice(1)} замера`;
    const island = ok(newIsland(base, rows[0].run.lengthMm), 'остров в комнате');
    const at1200 = islandIssues({ island, rows, room: room.room, nameOf });
    const close = ok(islandWithPlacement(island, { gapMm: 900 }), 'проход 900');
    const at900 = islandIssues({ island: close, rows, room: room.room, nameOf });
    const out = ok(islandWithPlacement(island, { fromLeftMm: -100 }), 'за стену');
    const outIssues = islandIssues({ island: out, rows, room: room.room, nameOf });
    const behind = islandWallClearance({ island, rowA: rows[0].placement, room: room.room, rowWallIds: [room.runWallId], nameOf });
    /* Ожидание: остров посередине стены 4000 (отступ (4000 − 2400)/2 = 800 до боковых стен); до стены напротив — 3500 − (560 + 16 + 1200 + 16 + 560 + 16). */
    const sides = (4000 - 2400) / 2;
    const opposite = 3500 - (D + TF + 1200 + TF + D + TF);
    check(
      'R.9 место острова в закрытой комнате 4000 × 3500 (замер 2.0): проход 1200 — без слов; 900 — уточнение с числом и последствием; заходит за боковую стену на 100 мм — блокирующее с числом; до ближайшей стены без мебели — числом (боковые 800, напротив 1132)',
      at1200.length === 0 &&
        at900.length === 1 && at900[0].severity === 'clarify' && /900 мм, меньше 1200/.test(at900[0].message) &&
        outIssues.some((issue) => issue.severity === 'blocking' && /заходит за внутреннюю грань стены \(стена 4 замера\) на 100 мм/.test(issue.message)) &&
        behind !== null && behind.mm === Math.min(sides, opposite),
      `1200: ${at1200.length} · 900: «${at900[0]?.message ?? 'МОЛЧА'}» · за стену: «${outIssues.map((i) => i.message).join(' | ') || 'МОЛЧА'}» · до стены без мебели ${behind ? `${behind.name} ${behind.mm} мм` : 'нет'} (ожидание ${Math.min(sides, opposite)}; напротив ${opposite})`,
    );
    /* Мир: лицо фасадов острова, смотрящего на стену, — ровно на проход от лица фасадов ряда А. */
    const place = islandPlacement(rows[0].placement, island);
    const a = (place.rotationYDeg * Math.PI) / 180;
    const faceZ = place.zM * 1000 + (-0 * Math.sin(a) + TF * Math.cos(a));
    const wallFaceZ = rows[0].placement.zM * 1000 + TF;
    check(
      'R.9 остров в мире: повёрнут к стене А (180°), лицо его фасадов — ровно на проход (1200) от лица фасадов ряда А',
      place.rotationYDeg === rows[0].placement.rotationYDeg + 180 && near(faceZ - wallFaceZ, 1200, 0.01),
      `поворот ${place.rotationYDeg}° · лицо острова ${faceZ.toFixed(2)}, ряда ${wallFaceZ.toFixed(2)} → проход ${(faceZ - wallFaceZ).toFixed(2)} мм`,
    );

    const corner = buildObject({ key: 'r9-l', title: 'Г 3600 + 2800', lengths: [3600, 2800], shape: 'corner_l', corners: [NEW_CORNER] });
    const cRows = corner.engine.segments.map((run, i) => ({ run, placement: corner.engine.places[i] }));
    const intoB = ok(islandWithPlacement(ok(newIsland(base, cRows[0].run.lengthMm), 'остров Г'), { fromLeftMm: 2600, gapMm: 300 }), 'к стене Б');
    const clash = islandIssues({ island: intoB, rows: cRows, room: null });
    const blocked = clash.find((issue) => issue.severity === 'blocking');
    const shown = screenState({
      refusal: null,
      mismatches: [],
      walls: [{ lengthMm: 3600 }, { lengthMm: 2800 }],
      segments: corner.engine.segments,
      shape: 'corner_l',
      warnings: [],
      islandBlock: blocked?.message ?? null,
    });
    check(
      'R.9 угловая Г 3600 + 2800: остров, задвинутый к стене Б, заходит в её мебель — блокирующее с мм и стеной; на экране: цены нет, «Дальше» и выпуск в цех заперты словами острова, запись идёт',
      Boolean(blocked) && /Стена Б/.test(blocked!.message) && /на \d+ мм/.test(blocked!.message) &&
        shown.priceHidden && shown.nextLocked && shown.exportLocked && !shown.autosaveLocked &&
        /остров/.test(shown.exportLockText ?? ''),
      `«${blocked?.message ?? 'МОЛЧА'}» · цена скрыта ${shown.priceHidden}, выпуск ${shown.exportLocked ? 'заперт' : 'открыт'}, запись ${shown.autosaveLocked ? 'заперта' : 'идёт'}`,
    );
  }

  /* ── R.10 отражение комнаты ── */
  {
    const state: MillworkState = { requirements: FREE, runs: { optimal: wallShown.run }, selectedVariant: 'optimal', shape: 'linear', island: half };
    const rowA = wallShown.run.lengthMm;
    const mirrored = mirroredState(state, { chainBefore: ['w1'], rowLengthMm: { w1: rowA }, wallLengthMm: { w1: rowA }, applianceWall: () => 'w1' });
    const m = mirrored.state.island;
    const endM = m?.modules.find((unit) => unit.radius?.back);
    const recheck = m ? applyOps({ run: m, requirements: islandRequirements(FREE), ops: [{ op: 'set_front', moduleId: m.modules[0].id, front: ENAMEL }] }) : null;
    const lState: MillworkState = { ...state, shape: 'corner_l' };
    const lMirror = mirroredState(lState, { chainBefore: ['w1', 'w2'], rowLengthMm: { w1: rowA, w2: 2000 }, wallLengthMm: { w1: rowA, w2: 2000 }, applianceWall: () => 'w1' });
    check(
      'R.10 «Отразить комнату»: у прямой кухни остров отражён вдоль ряда стены А — отметка от другого края (L − отметка − длина), полукруглый торец стал левым и на краю, правка острова после отражения проходит; у угловой стена А — другая, остров снят, и это сказано до нажатия',
      Boolean(m) &&
        m!.island!.fromLeftMm === rowA - half.island!.fromLeftMm - half.lengthMm &&
        endM?.radius?.place === 'left' && endM.offsetMm === 0 &&
        recheck !== null && recheck.warnings.length === 0 &&
        !lMirror.state.island && lMirror.notes.some((note) => /Остров снят/.test(note)),
      `отметка ${half.island!.fromLeftMm} → ${m?.island?.fromLeftMm} · торец ${endM?.radius?.place}@${endM?.offsetMm} · правка «${recheck?.warnings[0] ?? 'принята'}» · угловая: ${lMirror.notes.find((n) => /Остров/.test(n)) ?? 'МОЛЧА'}`,
    );
  }

  /* ── R.11 отражение ряда со скруглённым торцом ── */
  {
    const run = kitchen.shown().run;
    const flipped = mirroredRun(run);
    const endR = flipped.modules.find((unit) => unit.radius);
    const again = applyOps({ run: flipped, requirements: FREE, ops: [{ op: 'set_front', moduleId: flipped.modules[flipped.modules.length - 1].id, front: ENAMEL }] });
    check(
      'R.11 ряд со скруглённым торцом в зеркале: модуль у другого края ряда, торец — слева, дверца на петлях у стыка (справа); ряд собирается — правка после отражения проходит без отказа',
      endR?.radius?.place === 'left' && endR.offsetMm === run.lengthMm - 1200 - 400 && endR.fill?.hinge === 'right' && again.warnings.length === 0,
      `торец ${endR?.radius?.place}@${endR?.offsetMm}, петли ${endR?.fill?.hinge} · правка «${again.warnings[0] ?? 'принята'}»`,
    );
  }

  /* ── R.12 дизайн «Эмаль с радиусом» ── */
  {
    const design = RUN_DESIGNS.find((item) => item.id === 'radius-enamel');
    if (!design) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: дизайна radius-enamel нет');
    const t = screen();
    t.ops([
      { op: 'add_module', kind: 'base', widthMm: 600, atMm: 0 },
      { op: 'add_module', kind: 'base', widthMm: 600, atMm: 600 },
      { op: 'add_module', kind: 'base', widthMm: 400, atMm: 1200 },
    ]);
    const run = t.shown().run;
    const plan = designRadiusPlan(design, run);
    const words = t.ops([...designOps(design, []), ...plan.ops]);
    const after = t.shown().run;
    const left = moduleAt(after, 0);
    const right = moduleAt(after, 1200);
    const anyRadiusMark = allModules(after).some((unit) => unit.front?.construct === 'radius');
    const parts = buildPanels({ run: after, production: SHOP });
    check(
      'R.12 «Эмаль с радиусом» — формой модуля, а не пометкой фасада: свободные торцы нижнего ряда скруглены (`set_radius`): 400 — R400 гнутой дверцей, 600 — R560 открытыми полками (дверца дугу целиком не закроет); пометки «радиусный» на фасадах нет; в раскрое гнутая дверца и детали по контуру',
      words.length === 0 &&
        right.radius?.place === 'right' && right.radius.radiusMm === 400 && right.radius.cover === 'door' &&
        left.radius?.place === 'left' && left.radius.radiusMm === D && left.radius.cover === 'open' &&
        !anyRadiusMark &&
        design.lower.construct === 'solid' &&
        parts.some((panel) => panel.name === BENT_FACADE_PANEL_NAME) &&
        parts.some((panel) => panel.shape?.kind === 'contour'),
      `слова «${words.join(' | ')}» · план: ${plan.ops.length} правки, ${plan.notes.join(' | ') || 'без слов'} · левый ${left.radius ? `R${left.radius.radiusMm} ${left.radius.cover}` : 'прямой'}, правый ${right.radius ? `R${right.radius.radiusMm} ${right.radius.cover}` : 'прямой'}`,
    );
    const corner = buildObject({ key: 'r12-l', title: 'Г для дизайна', lengths: [3600, 2800], shape: 'corner_l', corners: [NEW_CORNER] });
    const lPlan = designRadiusPlan(design, corner.engine.segments[0]);
    check(
      'R.12 у ряда угловой кухни торец у угла не скругляется — словами («там угол»), свободный — по правилу; ничего не пропущено молча',
      lPlan.notes.some((note) => /угол/.test(note)) && lPlan.ops.length + lPlan.notes.length === 2,
      `правок ${lPlan.ops.length}, слов: ${lPlan.notes.join(' | ')}`,
    );
  }

  /* ── R.13 пометка «радиусный» без формы ── */
  {
    const run = kitchen.shown().run;
    const flat = moduleAt(run, 0);
    const marked = applyOps({ run, requirements: FREE, ops: [{ op: 'set_front', moduleId: flat.id, front: { ...ENAMEL, construct: 'radius' } }] });
    const warn = flatRadiusFronts([marked]);
    const meta = (unit: Module) => ({ widthMm: unit.widthMm, offsetMm: unit.offsetMm, kind: unit.kind, frontType: unit.frontType, front: unit.front, radius: unit.radius, fill: unit.fill });
    const flatText = describeFront(meta(moduleAt(marked, 0)) as never).text;
    const roundText = describeFront(meta(moduleAt(marked, 1200)) as never).text;
    const panels = buildPanels({ run: marked, production: SHOP }).filter((panel) => panel.moduleId === flat.id);
    check(
      'R.13 сохранённая пометка «радиусный» без формы модуля: деталь в раскрое прямая, и это сказано одной строкой с последствием; промпт визуализации не называет её гнутой; модуль с формой промпт описывает дугой с точным радиусом',
      warn.length === 1 && /в раскрое, смете и сцене он прямой/.test(warn[0].message) &&
        panels.every((panel) => !panel.shape) &&
        !/гнут/i.test(flatText) &&
        /СКРУГЛЁН/.test(roundText) && /радиус 400 мм/.test(roundText) && /ГНУТОЙ дверцей/.test(roundText),
      `«${warn[0]?.message ?? 'МОЛЧА'}» · без формы: «${flatText}» · с формой: «${roundText}»`,
    );
  }

  /* ── R.14 ТВ-зона: подвесные модули со скруглёнными торцами ── */
  {
    const living: RunRequirements = { ...DEMO_REQUIREMENTS, zone: 'living', appliances: [], sections: ['hanging_module', 'tv_niche', 'hanging_module'] };
    let run = buildRun({ lengthMm: 2400, ceilingHeightMm: 2700, requirements: living });
    const first = run.modules[0];
    const last = run.modules[run.modules.length - 1];
    const depth = moduleDepthMm(first, run.zone, run.production);
    const words: string[] = [];
    for (const [unit, place] of [[first, 'left'], [last, 'right']] as const) {
      const spec: RadiusSpec = { place, radiusMm: Math.min(unit.widthMm, depth), cover: 'open' };
      run = applyOps({ run, requirements: living, ops: [{ op: 'set_radius', moduleId: unit.id, radius: spec }] });
      words.push(...run.warnings);
    }
    const ends = run.modules.filter((unit) => unit.radius);
    const niche = run.modules.find((unit) => unit.section === 'tv_niche');
    const shaped = ends.flatMap((unit) => boxesOf(run, unit.id).filter((box) => box.shape?.form.kind === 'plate'));
    const est = buildEstimate(run, 'optimal', DEMO_RATES);
    check(
      'R.14 ТВ-зона (зал 2400: подвесной модуль, ниша под ТВ, подвесной модуль): оба подвесных модуля со скруглёнными торцами R = глубина корпуса (400), открытые полки по дуге; ниша под ТВ на месте; висящим цоколя нет; в сцене — детали по контуру, в смете — ЧПУ по дуге',
      words.length === 0 &&
        ends.length === 2 && ends.every((unit) => unit.kind === 'upper' && unit.radius!.radiusMm === depth) &&
        Boolean(niche) &&
        radiusPlinths(run).length === 0 &&
        shaped.length >= 4 &&
        (line(est, 'radius_cnc')?.quantity ?? 0) > 0,
      `слова «${words.join(' | ')}» · торцы ${ends.map((unit) => `${unit.kind} R${unit.radius!.radiusMm}`).join(', ')} · ниша ${niche?.widthMm ?? 'нет'} · по контуру в сцене ${shaped.length} · ЧПУ ${line(est, 'radius_cnc')?.quantity}`,
    );
  }

  /* ── R.15 способы цеха ── */
  {
    const confirmed: ProductionSettings = { ...SHOP, radius: { cnc: { confirmed: true }, bend: { method: 'flex_mdf', minRadiusMm: 300, confirmed: true } } };
    const run = kitchen.shown().run;
    const free = radiusMethodState({ ...run, production: confirmed }, confirmed);
    const strict: ProductionSettings = { ...SHOP, radius: { cnc: { confirmed: true }, bend: { method: 'flex_mdf', minRadiusMm: 500, confirmed: true } } };
    const t = screen({ production: strict });
    t.ops([{ op: 'add_module', kind: 'base', widthMm: 400, atMm: 0 }]);
    const u = moduleAt(t.shown().run, 0);
    t.ops([{ op: 'set_front', moduleId: u.id, front: ENAMEL }]);
    const refused = t.ops([{ op: 'set_radius', moduleId: u.id, radius: { place: 'left', radiusMm: 400, cover: 'door' } }]);
    check(
      'R.15 цех подтвердил ЧПУ и гибку (гибкий МДФ, от R300) — радиусный шкаф не DEMO ONLY; цех назвал наименьший радиус гибки 500 — гнутая дверца R400 отказ словами с числом цеха',
      !free.demoOnly && free.reasons.length === 0 && /наименьшего радиуса гибки цеха — 500 мм/.test(refused[0] ?? ''),
      `подтверждено: DEMO ONLY ${free.demoOnly} · R400 при 500: «${refused[0] ?? 'ПРИНЯТ'}»`,
    );
  }

  /* ── R.16 карта раскроя ── */
  {
    const walls = [{ wallId: 'w1', label: 'Стена А', run: wallShown.run }, ...islandPanelWall(capsule)];
    const parts = objectPanels({ walls, production: SHOP });
    const reasons = Array.from(new Set(walls.flatMap((wall) => radiusMethodState(wall.run, SHOP).reasons)));
    const plan = cuttingPlan({ parts, settings: TYPICAL_CUTTING, fingerprint: wallShown.run.fingerprint, radius: { reasons } });
    const onSheets = plan.groups.flatMap((group) => group.pieces).map((piece) => piece.part);
    const islandParts = parts.filter((part) => part.wallId === 'island');
    check(
      'R.16 карта раскроя: гнутые детали (дверца, цоколь, подложка) — отдельным списком, на листах их нет; детали по контуру — на листах заготовкой; остров — своей стеной раскроя («Остров», панели тыла); выпуск заперт словами «Радиусная мебель — DEMO ONLY»',
      plan.bent.length > 0 &&
        plan.bent.every((part) => part.shape?.kind === 'bent') &&
        !onSheets.some((part) => part.shape?.kind === 'bent') &&
        onSheets.some((part) => part.shape?.kind === 'contour') &&
        islandParts.length > 0 && islandParts.every((part) => part.wallLabel === ISLAND_LABEL) &&
        islandParts.some((part) => part.name === ISLAND_BACK_PANEL_NAME) &&
        !plan.release.ok && plan.release.reasons.some((reason) => /Радиусная мебель — DEMO ONLY/.test(reason)),
      `гнутых ${plan.bent.length} · на листах гнутых ${onSheets.filter((part) => part.shape?.kind === 'bent').length}, по контуру ${onSheets.filter((part) => part.shape?.kind === 'contour').length} · деталей острова ${islandParts.length} · выпуск: ${plan.release.reasons.find((reason) => /Радиус/.test(reason)) ?? 'ОТКРЫТ'}`,
    );
  }

  /* ── R.17 чертёж и план ── */
  {
    const run = kitchen.shown().run;
    const elevation = renderToStaticMarkup(createElement(ElevationDrawing, { run, mode: 'fronts' }));
    const plan = renderToStaticMarkup(createElement(PlanDrawing, { run, comms: [], issues: [] }));
    const room = buildFromSurvey({
      title: 'план Studio',
      survey: surveyOf([{ length: 4000, run: true }, { length: 3500 }, { length: 4000 }, { length: 3500 }]),
      shape: 'linear',
      requirements: FREE,
    });
    const rowA = wallFurnitureOf({ runs: room.segments, layout: null, runWallId: room.runWallId, edited: () => false, free: true })[0];
    const island = ok(islandWithShape(ok(newIsland(base, rowA.run.lengthMm), 'остров плана'), 'capsule', base), 'капсула плана');
    const survey = surveyOf([{ length: 4000, run: true }, { length: 3500 }, { length: 4000 }, { length: 3500 }]);
    const studio = renderToStaticMarkup(
      createElement(RoomPlan, {
        survey,
        selectedWallId: null,
        onSelectWall: () => {},
        furniture: [{ wallId: rowA.wallId, run: rowA.run, startMm: rowA.startMm }],
        selectedModuleId: null,
        island: { run: island, rowA: { wallId: rowA.wallId, run: rowA.run, startMm: rowA.startMm } },
      }),
    );
    const islandModules = (studio.match(/data-plan-module="[^"]*@island"/g) ?? []).length;
    const islandEnds = (studio.match(/data-plan-radius="(left|right):280"/g) ?? []).length;
    const islandBacks = (studio.match(/data-plan-island-back=/g) ?? []).length;
    check(
      'R.17 чертёж: у скруглённого торца — метка радиуса «R400» и линии цилиндра на фасаде; план ряда — контур модуля по дуге и плита контуром; план Studio — остров его контуром: все модули, два полукруглых торца R280 и панели тыла у прямых модулей',
      /data-radius-mark="right:400"/.test(elevation) &&
        /R400/.test(elevation) &&
        /data-plan-radius/.test(plan) &&
        /data-counter-piece="outline"/.test(plan) &&
        /data-plan-island=/.test(studio) &&
        islandModules === island.modules.length &&
        islandEnds === 2 &&
        islandBacks === island.modules.filter((unit) => !unit.radius).length,
      `фасад: метка ${/data-radius-mark="right:400"/.test(elevation)} · план ряда: контур ${/data-plan-radius/.test(plan)}, плита ${/data-counter-piece="outline"/.test(plan)} · Studio: модулей острова ${islandModules} из ${island.modules.length}, торцов ${islandEnds}, панелей тыла ${islandBacks}`,
    );
  }
}

export function radiusPickerChecks(check: Check): void {
  /* ── R.18 «Радиусный» в выборе фасада ── */
  const t = screen();
  t.ops([
    { op: 'add_module', kind: 'base', widthMm: 600, atMm: 0 },
    { op: 'add_module', kind: 'base', widthMm: 600, atMm: 600 },
    { op: 'add_module', kind: 'base', widthMm: 400, atMm: 1200 },
  ]);
  const run = t.shown().run;
  const [left, middle, right] = [0, 600, 1200].map((x) => moduleAt(run, x));
  const withFront = (unit: Module): Module => ({ ...unit, front: ENAMEL });
  const offers = [left, middle, right].map((unit) => radiusOfferFor(withFront(unit), run));
  const specs = offers.map((offer) => ('spec' in offer ? offer.spec : null));
  for (const unit of [left, middle, right]) t.ops([{ op: 'set_front', moduleId: unit.id, front: ENAMEL }]);
  const words = t.ops([{ op: 'set_radius', moduleId: right.id, radius: specs[2]! }]);
  const after = moduleAt(t.shown().run, 1200);
  const ldsp = radiusOfferFor(left, run);
  check(
    'R.18 «Радиусный» в выборе фасада — форма модуля, а не пометка: правый край ряда — торец R = ширина 400 гнутой дверцей, левый край 600 — торец R560 открытыми полками (дверца дугу целиком не закроет), середина — фасад дугой R600 гнутыми створками; правка ставит ту же форму; у ЛДСП — открытые полки по дуге: гнутую дверцу из ЛДСП не делают',
    specs[2]?.place === 'right' && specs[2].radiusMm === 400 && specs[2].cover === 'door' &&
      specs[0]?.place === 'left' && specs[0].radiusMm === D && specs[0].cover === 'open' &&
      specs[1]?.place === 'front' && specs[1].radiusMm === 600 && specs[1].cover === 'door' &&
      words.length === 0 && after.radius?.place === 'right' && after.radius.radiusMm === 400 &&
      'spec' in ldsp && ldsp.spec.cover === 'open',
    `слева ${JSON.stringify(specs[0])} · середина ${JSON.stringify(specs[1])} · справа ${JSON.stringify(specs[2])} · правка «${words.join(' | ')}» → ${after.radius ? `${after.radius.place} R${after.radius.radiusMm}` : 'нет'} · ЛДСП слева: ${'spec' in ldsp ? JSON.stringify(ldsp.spec) : ldsp.refusal}`,
  );
}

export function counterCornerChecks(check: Check): void {
  /* ── R.19 угол столешницы ── */
  const t = screen();
  t.ops([
    { op: 'add_module', kind: 'base', widthMm: 600, atMm: 0 },
    { op: 'add_module', kind: 'base', widthMm: 600, atMm: 600 },
  ]);
  const plain = t.shown();
  const words = t.ops([{ op: 'set_counter_corner', end: 'end', radiusMm: 100 }]);
  const shown = t.shown();
  const slab = countertopSlabs(shown.run)[0];
  const arc = slab?.outline?.find((seg): seg is Extract<PathSeg, { kind: 'arc' }> => seg.kind === 'arc');
  const facts = slab?.outline ? contourFacts(slab.outline) : null;
  const cut = line(shown.estimate, 'radius_countertop_cut');
  const state = radiusMethodState(shown.run, SHOP);
  check(
    'R.19 угол столешницы у свободного конца ряда R100: плита контуром — четверть окружности R100 с центром в 100 мм от торца и от кромки, касание с обеими кромками; в смете «Рез столешницы по дуге» π·100/2 мм без цены; DEMO ONLY — ЧПУ; отпечаток ряда другой, плита та же длины',
    words.length === 0 &&
      Boolean(arc) && near(arc!.r, 100, 1e-6) && near(arc!.c[0], 1200 - 100, 1e-6) && near(arc!.c[1], REACH - 100, 1e-6) &&
      facts !== null && facts.gap < 1e-6 && facts.kinkDeg < 1e-6 &&
      slab.fromMm === 0 && near(slab.toMm, 1200, 0.1) &&
      cut !== null && near(cut.quantity, Math.round(((100 * Math.PI) / 2 / 1000) * 1000) / 1000, 0.002) && Boolean(cut.priceUnset) &&
      state.reasons.some((reason) => /ЧПУ/.test(reason)) &&
      shown.run.fingerprint !== plain.run.fingerprint,
    `слова «${words.join(' | ')}» · дуга R${arc?.r} c ${arc ? arc.c.map((v) => v.toFixed(1)).join(',') : '—'} · разрыв ${facts?.gap.toExponential(1)}, излом ${facts?.kinkDeg.toExponential(1)}° · плита ${slab?.fromMm}…${slab?.toMm} · рез ${cut?.quantity} ${cut?.priceUnset ? 'без цены' : 'С ЦЕНОЙ'} · отпечаток ${plain.run.fingerprint} → ${shown.run.fingerprint}`,
  );

  const refusals = [
    { name: 'R5', op: { op: 'set_counter_corner', end: 'start', radiusMm: 5 } as MillworkOp, expect: /профиль кромки/ },
    { name: 'R700', op: { op: 'set_counter_corner', end: 'start', radiusMm: 700 } as MillworkOp, expect: /больше глубины плиты \(601 мм\)/ },
  ].map((item) => ({ ...item, words: applyOps({ run: shown.run, requirements: FREE, ops: [item.op] }).warnings }));
  const endUnit = moduleAt(shown.run, 600);
  const afterRadius = applyOps({ run: shown.run, requirements: FREE, ops: [
    { op: 'set_front', moduleId: endUnit.id, front: ENAMEL },
    { op: 'set_radius', moduleId: endUnit.id, radius: { place: 'right', radiusMm: 560, cover: 'open' } },
  ] });
  const corner = buildObject({ key: 'r19-l', title: 'Г для угла плиты', lengths: [3600, 2800], shape: 'corner_l', corners: [NEW_CORNER] });
  const atCorner = applyOps({ run: corner.engine.segments[0], requirements: corner.requirements, ops: [{ op: 'set_counter_corner', end: 'end', radiusMm: 100 }] });
  const mirrored = mirroredRun(shown.run);
  check(
    'R.19 угол плиты — отказы словами до записи и после правки: R5 — это профиль кромки; R700 больше глубины плиты 601; у конца ряда угловой кухни — стык с соседней плитой; торец, скруглённый после скругления угла плиты, — правка не применена; в зеркале угол у другого конца ряда',
    refusals.every((item) => item.expect.test(item.words[0] ?? '')) &&
      /Правка не применена: у конца ряда скруглён угол столешницы R100/.test(afterRadius.warnings[0] ?? '') &&
      afterRadius.counterCorners?.end === 100 && !moduleAt(afterRadius, 600).radius &&
      /угол кухни/.test(atCorner.warnings[0] ?? '') &&
      mirrored.counterCorners?.start === 100 && !mirrored.counterCorners?.end,
    refusals.map((item) => `${item.name}: «${item.words[0] ?? 'МОЛЧА'}»`).join(' | ') + ` | торец после угла: «${afterRadius.warnings[0] ?? 'МОЛЧА'}» | угловая: «${atCorner.warnings[0] ?? 'МОЛЧА'}» | зеркало ${JSON.stringify(mirrored.counterCorners)}`,
  );

  const base: IslandBase = { requirements: FREE, ceilingHeightMm: t.input.ceilingHeightMm, production: t.input.production };
  const island = ok(newIsland(base, 3800), 'остров угла плиты');
  const rounded = applyOps({ run: island, requirements: islandRequirements(FREE), ops: [{ op: 'set_counter_corner', end: 'start', radiusMm: 200 }] });
  const islandSlab = countertopSlabs(rounded)[0];
  const islandArcs = islandSlab?.outline?.filter((seg): seg is Extract<PathSeg, { kind: 'arc' }> => seg.kind === 'arc') ?? [];
  const islandFacts = islandSlab?.outline ? contourFacts(islandSlab.outline) : null;
  const tooBig = applyOps({ run: island, requirements: islandRequirements(FREE), ops: [{ op: 'set_counter_corner', end: 'start', radiusMm: 400 }] });
  check(
    'R.19 прямой торец острова со скруглёнными углами плиты R200: передний и задний — две четверти R200, касание; R400 больше половины глубины плиты острова (321) — отказ словами',
    rounded.warnings.length === 0 &&
      islandArcs.length === 2 && islandArcs.every((seg) => near(seg.r, 200, 1e-6)) &&
      islandFacts !== null && islandFacts.gap < 1e-6 && islandFacts.kinkDeg < 1e-6 &&
      near(curvedLengthOf(islandSlab.outline!), Math.PI * 200, 0.1) &&
      /половины глубины плиты \(321 мм\)/.test(tooBig.warnings[0] ?? ''),
    `слова «${rounded.warnings.join(' | ')}» · дуг ${islandArcs.length} R ${islandArcs.map((seg) => seg.r).join(',')} · разрыв ${islandFacts?.gap.toExponential(1)}, излом ${islandFacts?.kinkDeg.toExponential(1)}° · R400: «${tooBig.warnings[0] ?? 'МОЛЧА'}»`,
  );
}

/**
 * R.20 СТЕНА КОМНАТЫ У КОНЦА РЯДА — путём экрана (`workspaceInput` →
 * `composeVariants` → `wallSegments`, `buildFromSurvey` для замера 2.0).
 * Скруглённый торец и угол плиты у стены не делают: между дугой и стеной
 * остался бы пустой клин. Стену у конца ряда знает обход замера — тот же, по
 * которому стоит комната (`wallEndsOf`); ряду её кладёт показ.
 */
export function wallEndChecks(check: Check): void {
  const CONFIRMED: ProductionSettings = { ...SHOP, radius: { cnc: { confirmed: true }, bend: { method: 'flex_mdf', minRadiusMm: 300, confirmed: true } } };
  const floorOf = (run: Run) => run.modules.filter((unit) => standsOnFloor(unit)).sort((a, b) => a.offsetMm - b.offsetMm);
  const rowWords = (run: Run) => JSON.stringify(run.wallEnds ?? {});

  /* ── обход замера → стены у концов ── */
  const demo = wallEndsOf(DEMO_MEASUREMENT);
  const square = wallEndsOf({ walls: [3600, 2800, 3600, 2800].map((lengthMm, i) => ({ id: `s${i + 1}`, lengthMm, angleDeg: 90 })) });
  /* Г-образная комната по часовой: после стены 4 — выступ (поворот налево), кухня на стене 5 от выступа до стены 6. */
  const lRoom = buildFromSurvey({
    title: 'R.20 Г-комната, ряд от выступа',
    survey: surveyOf([
      { length: 4000, run: false },
      { length: 2000, run: false },
      { length: 1500, run: false },
      { length: 1000, turn: 'left', run: false },
      { length: 2500, run: true },
      { length: 3000, run: false },
    ]),
    shape: 'linear',
    requirements: FREE,
  });
  if (lRoom.refusal) throw new Error(`R.20 Г-комната: ${lRoom.refusal}`);
  const lRow = lRoom.segments[0];
  check(
    'R.20 стена у конца ряда — по обходу замера, как комната: прежний «стена 1 → стена 2» — у конца стены 1 стена, у начала нет; замкнутая комната — у обоих концов каждой стены; замер 2.0, ряд от выступа — у начала стены нет, у конца стена 6; ряду её кладёт показ',
    JSON.stringify(demo.w1) === '{"end":true}' &&
      JSON.stringify(demo.w2) === '{"start":true}' &&
      Object.values(square).every((ends) => ends.start === true && ends.end === true) &&
      lRow.wallId === 'w5' && !lRow.wallEnds?.start && lRow.wallEnds?.end === true,
    `демо ${JSON.stringify(demo)} · замкнутая ${JSON.stringify(square)} · ряд ${lRow.wallId} ${rowWords(lRow)}`,
  );

  /* ── демо-кухня во всю стену 3800: справа стена 2 ── */
  {
    const t = screen({ requirements: DEMO_REQUIREMENTS });
    const run = t.shown().run;
    const floor = floorOf(run);
    const last = floor[floor.length - 1];
    const design = RUN_DESIGNS.find((item) => item.id === 'radius-enamel');
    if (!design) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: дизайна radius-enamel нет');
    const plan = designRadiusPlan(design, run);
    const button = radiusOffers(last, run).find((offer) => offer.key === 'right');
    const offer = radiusOfferFor(last, run);
    const corner = counterCornerRefusal(run, 'end', 100);
    const words = t.ops([{ op: 'set_radius', moduleId: last.id, radius: { place: 'right', radiusMm: Math.min(last.widthMm, D), cover: 'open' } }]);
    const after = t.shown().run.modules.find((unit) => unit.id === last.id);
    check(
      'R.20 демо-кухня во всю стену (справа стена 2): «Эмаль с радиусом» торец у стены не скругляет и говорит почему; «Скруглить торец справа» выключена словами «стена комнаты»; «Радиусный» предлагает фасад дугой, а не торец; правка торца у стены — отказ, модуль прямой; угол плиты у стены — отказ',
      run.wallEnds?.end === true &&
        last.offsetMm + last.widthMm === run.lengthMm &&
        !plan.ops.some((op) => op.op === 'set_radius' && op.moduleId === last.id) &&
        plan.notes.some((note) => /стена комнаты/.test(note)) &&
        /стена комнаты/.test(button?.refusal ?? '') &&
        'spec' in offer && offer.spec.place === 'front' &&
        words.some((word) => /стена комнаты/.test(word)) &&
        !after?.radius &&
        /стена комнаты/.test(corner ?? ''),
      `ряд ${rowWords(run)} · «${last.label}» ${last.offsetMm}…${last.offsetMm + last.widthMm} · дизайн: ${plan.ops.length} правок, «${plan.notes.join(' | ')}» · кнопка «${button?.refusal ?? 'ВКЛЮЧЕНА'}» · «Радиусный» ${'spec' in offer ? offer.spec.place : offer.refusal} · правка «${words.join(' | ') || 'МОЛЧА'}» · угол плиты «${corner ?? 'РАЗРЕШЁН'}»`,
    );
  }

  /* ── хвост до стены: меньше добора (150) — у стены; правка, приводящая торец к стене, — отказ ── */
  {
    const near100 = screen();
    near100.ops([
      { op: 'add_module', kind: 'base', widthMm: 600, atMm: 0 },
      { op: 'add_module', kind: 'base', widthMm: 400, atMm: 3300 },
    ]);
    const at3300 = moduleAt(near100.shown().run, 3300);
    const words100 = near100.ops([{ op: 'set_radius', moduleId: at3300.id, radius: { place: 'right', radiusMm: 400, cover: 'open' } }]);
    const free200 = screen();
    free200.ops([
      { op: 'add_module', kind: 'base', widthMm: 600, atMm: 0 },
      { op: 'add_module', kind: 'base', widthMm: 400, atMm: 3200 },
    ]);
    const at3200 = moduleAt(free200.shown().run, 3200);
    const words200 = free200.ops([{ op: 'set_radius', moduleId: at3200.id, radius: { place: 'right', radiusMm: 400, cover: 'open' } }]);
    const rounded = free200.shown().run.modules.find((unit) => unit.id === at3200.id);
    const moveWords = free200.ops([{ op: 'move_module', moduleId: at3200.id, offsetMm: 3400, exact: true }]);
    const stayed = free200.shown().run.modules.find((unit) => unit.id === at3200.id);
    check(
      'R.20 хвост до стены меньше добора (150 мм) — это ещё «у стены»: торец в 100 мм от стены — отказ «до неё 100 мм»; в 200 мм — скругляется; перенос скруглённого модуля вплотную к стене — правка не применена, модуль на месте',
      /стена комнаты \(до неё 100 мм\)/.test(words100[0] ?? '') &&
        words200.length === 0 && rounded?.radius?.place === 'right' &&
        moveWords.some((word) => /Правка не применена/.test(word) && /стена комнаты/.test(word)) &&
        stayed?.offsetMm === 3200 && stayed.radius?.place === 'right',
      `100 мм: «${words100[0] ?? 'МОЛЧА'}» · 200 мм: «${words200.join(' | ') || 'встал'}» ${rounded?.radius ? `R${rounded.radius.radiusMm}` : 'прямой'} · перенос: «${moveWords.join(' | ') || 'МОЛЧА'}», модуль на ${stayed?.offsetMm}`,
    );
  }

  /* ── ряд от выступа: у начала стены нет — торец слева скругляется; справа стена 6 — нет ── */
  {
    const built = applyOps({
      run: lRow,
      requirements: FREE,
      ops: [
        { op: 'add_module', kind: 'base', widthMm: 400, atMm: 0 },
        { op: 'add_module', kind: 'base', widthMm: 600, atMm: 400 },
        { op: 'add_module', kind: 'base', widthMm: 400, atMm: 2100 },
      ],
    });
    if (built.warnings.length > 0) throw new Error(`R.20 ряд от выступа: ${built.warnings.join(' | ')}`);
    const left = applyOps({ run: built, requirements: FREE, ops: [{ op: 'set_radius', moduleId: moduleAt(built, 0).id, radius: { place: 'left', radiusMm: 400, cover: 'open' } }] });
    const right = applyOps({ run: built, requirements: FREE, ops: [{ op: 'set_radius', moduleId: moduleAt(built, 2100).id, radius: { place: 'right', radiusMm: 400, cover: 'open' } }] });
    check(
      'R.20 ряд стены 5 от выступа: у начала стены нет — торец слева R400 скругляется; у конца стена 6 — торец справа отказ словами «стена комнаты»',
      left.warnings.length === 0 && moduleAt(left, 0).radius?.place === 'left' && /стена комнаты/.test(right.warnings[0] ?? '') && !moduleAt(right, 2100).radius,
      `слева «${left.warnings.join(' | ') || 'встал'}» · справа «${right.warnings[0] ?? 'МОЛЧА'}»`,
    );
  }

  /* ── Г в замкнутой комнате: стене Б стену у конца кладёт `wallSegments` ── */
  {
    const closed = buildFromSurvey({
      title: 'R.20 Г в замкнутой комнате',
      survey: surveyOf([{ length: 3600 }, { length: 2800 }, { length: 3600 }, { length: 2800 }]),
      shape: 'corner_l',
    });
    if (closed.refusal) throw new Error(`R.20 Г в замкнутой комнате: ${closed.refusal}`);
    const [a, b] = closed.segments;
    const bFloor = floorOf(b);
    const bLast = bFloor[bFloor.length - 1];
    const aFirst = floorOf(a)[0];
    const words = radiusPlaceRefusal(bLast, { place: 'right', radiusMm: 300, cover: 'open' }, radiusRowOf(bLast, radiusLists(b), b));
    const startWords = radiusPlaceRefusal(aFirst, { place: 'left', radiusMm: 300, cover: 'open' }, radiusRowOf(aFirst, radiusLists(a), a));
    check(
      'R.20 Г в замкнутой комнате: ряд стены А начинается у стены 4, ряд стены Б кончается у стены 3 — на показе у обоих (стене Б — `wallSegments`); торец у конца стены Б и у начала стены А — отказ «стена комнаты»',
      a.wallEnds?.start === true && b.wallEnds?.end === true && /стена комнаты/.test(words ?? '') && /^Слева от .* — стена комнаты/.test(startWords ?? ''),
      `А ${rowWords(a)} · Б ${rowWords(b)} · «${bLast?.label}»: «${words ?? 'РАЗРЕШЁН'}» · «${aFirst?.label}»: «${startWords ?? 'РАЗРЕШЁН'}»`,
    );
  }

  /* ── форма, заданная раньше, которая сейчас не встала бы: слова на экране и запертый выпуск ── */
  {
    const t = screen({ requirements: DEMO_REQUIREMENTS });
    /* Как до этого правила: стены у конца ряда никто не знал — торец и угол плиты встали. */
    const blind = runWithWallEnds(t.shown().run, undefined);
    const last = floorOf(blind)[floorOf(blind).length - 1];
    const round = applyOps({ run: blind, requirements: DEMO_REQUIREMENTS, ops: [{ op: 'set_radius', moduleId: last.id, radius: { place: 'right', radiusMm: Math.min(last.widthMm, D), cover: 'open' } }] });
    const corner = applyOps({ run: blind, requirements: DEMO_REQUIREMENTS, ops: [{ op: 'set_counter_corner', end: 'end', radiusMm: 100 }] });
    if (round.warnings.length > 0 || corner.warnings.length > 0) throw new Error(`R.20 без стены: ${[...round.warnings, ...corner.warnings].join(' | ')}`);
    const shownRound = composeVariants(t.input, DISABLED, { optimal: round }).find((variant) => variant.key === 'optimal')!.run;
    const shownCorner = composeVariants(t.input, DISABLED, { optimal: corner }).find((variant) => variant.key === 'optimal')!.run;
    const roundWords = staleRadius([shownRound], SHOP);
    const cornerWords = staleRadius([shownCorner], SHOP);
    const methods = radiusMethodState(shownRound, CONFIRMED);
    check(
      'R.20 форма, заданная раньше, у стены сейчас не встала бы: на экране одна строка — торец «стена комнаты», дугой в сцене и смете, в цех не уходит (выпуск заперт и при подтверждённых способах цеха); угол плиты R100 у стены не применён — плита прямая, и это сказано',
      shownRound.wallEnds?.end === true &&
        roundWords.length === 1 && /стена комнаты/.test(roundWords[0].message) && /в цех не уходит/.test(roundWords[0].message) &&
        methods.demoOnly && methods.reasons.some((reason) => /форма не встаёт/.test(reason)) &&
        counterCornerOf(shownCorner, 'end') === null && countertopCurveMm(shownCorner) === 0 &&
        cornerWords.length === 1 && /угол плиты у конца ряда R100 не применён/.test(cornerWords[0].message) && /прямая/.test(cornerWords[0].message),
      `торец: «${roundWords[0]?.message ?? 'МОЛЧА'}» · выпуск: ${methods.demoOnly ? `заперт «${methods.reasons.join(' | ')}»` : 'ОТКРЫТ'} · угол: «${cornerWords[0]?.message ?? 'МОЛЧА'}», рез по дуге ${countertopCurveMm(shownCorner)} мм`,
    );
  }
}

/* Отдельный запуск — свой счёт. */
const direct = process.argv[1] && /verify-radius\.ts$/.test(process.argv[1]);
if (direct) {
  let passed = 0;
  let failed = 0;
  const report: Check = (name, condition, detail) => {
    if (condition) passed += 1;
    else failed += 1;
    console[condition ? 'log' : 'error'](`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
  };
  radiusChecks(report);
  radiusPickerChecks(report);
  counterCornerChecks(report);
  wallEndChecks(report);
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}
