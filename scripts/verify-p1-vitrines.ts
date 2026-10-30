/**
 * ПРИЁМКА P1 — СТЕКЛЯННЫЕ ВИТРИНЫ (ТЗ ALDIK STUDIO P1, § 11, сценарии 1–20).
 * Входит в `test:millwork`; отдельно —
 * `npx tsx --tsconfig tsconfig.scripts.json scripts/verify-p1-vitrines.ts`.
 *
 * Путь экрана: замер → `workspaceInput` → `objectInput` → `composeVariants`
 * → правка `applyOps` (как `runOps`: ряд с отказом записывается — движок
 * возвращает его без правки) → `composeVariants` снова. Угловые кухни — путём
 * фикстуры STAGE A (`buildObject`: композиция, ряды экрана, их места).
 *
 * Меряется нарисованное и посчитанное, а не поля данных: коробки сцены
 * (`runBoxes`, `leafRiders`, `doorPivot`), ход двери (`vitrineSweep` — те же
 * позы, что у угла), раскрой (`buildPanels`), список стекла и изделий
 * (`vitrineParts`), смета показанного варианта, рисунок фасада
 * (`frontGlyph`), план и разрез (`PlanDrawing`, `SectionDrawing`), промпт
 * (`vitrineMeta` → `describeFront`), карта раскроя (`cuttingPlan`), кабинет
 * клиента (`projectOffer`), эталон «до P1» (`p1-baseline.json`, снят на f2fbf9d).
 *
 *   P1.1  верхний шкаф — дверь стекло в алюминиевой рамке: рамка и стекло — свои коробки,
 *         фасада ЛДСП нет ни в сцене, ни в раскрое; стекло в смете по размеру двери; петли под рамку;
 *   P1.2  каркас из профиля, две стеклянные боковины: стекло вместо боковин в сцене и в списке;
 *   P1.3  цельностеклянная: всё стекло, дверь без рамки, стыки стекла; под столешницей — отказ;
 *   P1.4  высокая витрина, четыре стеклянные полки: полки ЛДСП ушли, держатели, нагрузка — словами;
 *   P1.5  на столешнице: низ — рабочая поверхность, до потолка, фартук рвётся; над мойкой — отказ;
 *   P1.6  антресоль; P1.7 Г; P1.8 П; P1.9 рядом с пеналом — заход двери вдоль ряда;
 *   P1.10 петли слева/справа; P1.11 доступ сзади — отказ; P1.12 вид стекла; P1.13 цвет профиля;
 *   P1.14 лента вкл/выкл; P1.15 сохранение и кабинет; P1.16 3D = 2D = BOM = деталировка;
 *   P1.17 помещения; P1.18 ход и пересечения; P1.19 углы P0; P1.20 старые объекты без витрин.
 */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_PRODUCTION, TYPICAL_CUTTING, type CatalogEntryFull, type HardwareItem, type ProductionSettings } from '../types/catalog';
import type { Measurement, MillworkOp, Module, Run, RunRequirements, VariantKey, VitrineSpec, ZoneKind } from '../types/millwork';
import type { MillworkState } from '../lib/projects';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput, projectOffer } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { allModules } from '../lib/millwork/layout';
import {
  doorKick,
  doorPivot,
  leafRiders,
  openablePartIds,
  runBoxes,
  runBoxesByModule,
  runPlaces,
  sceneLeaves,
  type PartBox,
} from '../lib/millwork/cabinetBoxes';
import { BOTTOM_PANEL_NAME, FACADE_PANEL_NAME, SHELF_PANEL_NAME, SIDE_PANEL_NAME, TOP_PANEL_NAME, buildPanels, objectPanels } from '../lib/millwork/panels';
import { vitrineParts, type VitrinePart } from '../lib/millwork/vitrineParts';
import { vitrineBlocker, vitrineDoorCount as vitrineDoorsOf, vitrineLedMeters, vitrineLedStrips, vitrineOf, vitrineProductionReasons } from '../lib/millwork/vitrine';
import { glassOf } from '../lib/millwork/glass';
import { defaultFill, mezzanineBaseOf, moduleCarcassHeightMm, moduleDepthMm, singleNicheOf } from '../lib/millwork/fill';
import { runFingerprint } from '../lib/millwork/fingerprint';
import { workTopMm } from '../lib/millwork/shop';
import { apronSpans, countertopSlabs } from '../lib/millwork/countertop';
import { underCabinetSpans, lightingPlan, EMPTY_LIGHTING } from '../lib/millwork/lighting';
import { cornerKinematics, rowSweepWords, vitrineSweep } from '../lib/millwork/cornerKinematics';
import { vitrineSweepMismatches, wallMismatchMessage, mismatchPriceText } from '../lib/millwork/walls';
import { screenState } from '../lib/millwork/screen';
import { frontGlyph, glyphSignature } from '../lib/millwork/frontGlyph';
import { describeFront, vitrineMeta } from '../lib/millwork/promptFronts';
import { cuttingPlan } from '../lib/millwork/cutting';
import { fittingSlotsOf, fittingVerdict } from '../lib/millwork/fittings';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { RUN_TEMPLATES, requirementsFromTemplate } from '../lib/millwork/templates';
import { baselineEntry, baselineRun, type BaselineEntry } from './p1-baseline';
import { buildObject, NEW_CORNER, type Spec } from './corner-quality-fixture';
import { facadeOps as mdfFacadeOps } from '../lib/millwork/mdfFacade';
import { millingCatalog } from '../lib/millwork/milling';
import { kiraDemoEntries } from '../lib/millwork/kiraCatalog';
import { DEMO_CATALOG } from '../lib/millwork/demo';
import PlanDrawing from '../components/millwork/PlanDrawing';
import SectionDrawing from '../components/millwork/SectionDrawing';

type Check = (name: string, condition: boolean, detail?: string) => void;

const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
const SHOP = DEFAULT_PRODUCTION;
const MM = 1000;
const round2 = (v: number) => Math.round(v * 100) / 100;

/* ─────────────────────────  экран одной стены  ───────────────────────── */

/** Замер демо без окна и короба вентиляции: над мойкой и варочной висят шкафы, до потолка ничего. */
const OPEN_WALL: Measurement = {
  ...DEMO_MEASUREMENT,
  id: 'p1-open-wall',
  walls: DEMO_MEASUREMENT.walls.map((wall, i) => (i === 0 ? { ...wall, openings: [] } : wall)),
};

function screen(options: { measurement?: Measurement; requirements?: RunRequirements; zone?: string; production?: ProductionSettings } = {}) {
  const requirements = options.requirements ?? DEMO_REQUIREMENTS;
  const production = options.production ?? SHOP;
  const base = workspaceInput({
    title: 'P1',
    zone: options.zone ?? 'Кухня',
    measurement: options.measurement ?? DEMO_MEASUREMENT,
    requirements,
    rates: DEMO_RATES,
    cornerAt: null,
    wallId: 'w1',
  });
  const input = objectInput({ base, resolution: null, requirements, rates: DEMO_RATES, production, milling: new Map(), carcass: new Map(), materials: new Map() });
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, DISABLED, edited).find((variant) => variant.key === 'optimal')!;
  /** Правка как у `runOps`: ряд с отказом тоже записывается — движок возвращает его без правки. */
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown().run, requirements, ops: list, openings: input.openings });
    edited = { optimal: next };
    return next.warnings;
  };
  const reset = () => {
    edited = {};
  };
  return { input, shown, ops, reset, requirements, production };
}

const moduleOf = (run: Run, id: string): Module => {
  const found = allModules(run).find((unit) => unit.id === id);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${id} в ряду нет — ${allModules(run).map((u) => u.id).join(' ')}`);
  return found;
};
const boxesOf = (run: Run, production: ProductionSettings = SHOP): PartBox[] =>
  runBoxes(run, { production, thicknessMm: production.carcassMm, frontThicknessMm: production.frontMm, gapMm: production.frontGapMm });
const partBoxes = (run: Run, part: string) => boxesOf(run).filter((box) => box.part === part);
const moduleBoxes = (run: Run, id: string, production: ProductionSettings = SHOP) =>
  runBoxesByModule(run, { production, thicknessMm: production.carcassMm, frontThicknessMm: production.frontMm, gapMm: production.frontGapMm }).modules.find((m) => m.unit.id === id)?.boxes ?? [];
const panelsOf = (run: Run, id: string, name?: string) =>
  buildPanels({ run, production: SHOP }).filter((panel) => panel.moduleId === id && (!name || panel.name === name)).reduce((sum, panel) => sum + panel.qty, 0);
const lineOf = (estimate: { lines: { key: string; quantity: number; title: string; total: number; priceUnset?: string }[] }, key: string) =>
  estimate.lines.filter((line) => line.key === key);
const qty = (estimate: Parameters<typeof lineOf>[0], key: string) => round2(lineOf(estimate, key).reduce((sum, line) => sum + line.quantity, 0));
const partsOf = (run: Run, id: string) => vitrineParts(run, SHOP).filter((part) => part.moduleId === id);
const area = (list: VitrinePart[]) => round2(list.reduce((sum, part) => sum + (part.lengthMm * part.widthMm * part.qty) / 1_000_000, 0));
/** Габарит коробок, мм: min/max по трём осям. */
function bounds(list: PartBox[]) {
  const min = [0, 1, 2].map((k) => Math.min(...list.map((b) => b.position[k] - b.scale[k] / 2)) * MM);
  const max = [0, 1, 2].map((k) => Math.max(...list.map((b) => b.position[k] + b.scale[k] / 2)) * MM);
  return { min, max, size: [0, 1, 2].map((k) => max[k] - min[k]) };
}
const near = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;

/** Насколько габариты входят друг в друга, мм: меньше нуля — зазор. */
function overlapMm(a: PartBox, b: PartBox): number {
  return Math.min(
    ...[0, 1, 2].map(
      (k) =>
        Math.min(a.position[k] + a.scale[k] / 2, b.position[k] + b.scale[k] / 2) * MM - Math.max(a.position[k] - a.scale[k] / 2, b.position[k] - b.scale[k] / 2) * MM,
    ),
  );
}

/** Пересечения коробок модуля с коробками ДРУГИХ модулей ряда, мм (касание — не пересечение). */
function hitsOf(run: Run, id: string): string[] {
  const grouped = runBoxesByModule(run, { production: SHOP, thicknessMm: SHOP.carcassMm, frontThicknessMm: SHOP.frontMm, gapMm: SHOP.frontGapMm });
  const own = grouped.modules.find((m) => m.unit.id === id)?.boxes ?? [];
  const out: string[] = [];
  for (const other of grouped.modules) {
    if (other.unit.id === id) continue;
    for (const a of own) {
      for (const b of other.boxes) {
        const depth = overlapMm(a, b);
        if (depth > 0.01) out.push(`${a.panel ?? a.node ?? a.material} в ${other.unit.id} ${b.panel ?? b.node ?? b.material} на ${depth.toFixed(1)} мм`);
      }
    }
  }
  return out;
}

/** Позиции фактов производителей в каталоге организации — тот же разбор, что у импорта (`hardwareCatalogRow`). */
function factsCatalog(articles: RegExp): Map<string, HardwareItem> {
  const entries = HARDWARE_FACTS.filter((fact) => articles.test(fact.article)).map((fact) => {
    const row = hardwareCatalogRow(fact);
    return {
      id: `hw:${fact.article}`,
      org_id: 'org-p1',
      category_id: 'cat-hardware',
      article: row.article,
      name_ru: row.name_ru,
      name_kk: row.name_kk,
      description: '',
      price: row.price,
      unit: row.unit,
      dimensions: {},
      tiling: {},
      meta: { hardware: fact.hardware },
      is_active: true,
      assets: [],
    } as unknown as CatalogEntryFull;
  });
  return hardwareCatalog(entries);
}

/* ─────────────────────────  приёмка  ───────────────────────── */

export function p1VitrineChecks(check: Check): void {
  console.log('\nP1: стеклянные витрины — путём экрана');

  const k = screen();
  const UPPER = 'upper-3300@w1';
  const NEXT_TO_TALL = 'upper-1200@w1';
  const before = k.shown();
  const beforeRun = before.run;
  const upper0 = moduleOf(beforeRun, UPPER);
  const door0 = partBoxes(beforeRun, `${UPPER}:door:0`).filter((box) => box.material === 'front');
  if (door0.length !== 1) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: у ${UPPER} до витрины ${door0.length} фасадов, ждали 1`);
  const doorBefore = bounds(door0);

  /* ── P1.1 верхний шкаф с алюминиевой стеклянной дверью ── */
  const w11 = k.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'carcass' } }]);
  const a = k.shown();
  const unitA = moduleOf(a.run, UPPER);
  const doorA = partBoxes(a.run, `${UPPER}:door:0`);
  const bars = doorA.filter((box) => box.node === 'frame' && box.material === 'metal');
  const panes = doorA.filter((box) => box.node === 'glass' && box.material === 'glass');
  const fronts = doorA.filter((box) => box.material === 'front');
  const doorAfter = bounds([...bars, ...panes]);
  const leafA = sceneLeaves(unitA, moduleCarcassHeightMm(unitA, a.run) / MM).find((leaf) => leaf.id === `${UPPER}:door:0`);
  const ridersA = leafRiders(doorA, leafA && leafA.kind === 'door' ? leafA : {}) ?? [];
  const partsA = partsOf(a.run, UPPER);
  const doorPart = partsA.find((part) => part.role === 'door:0');
  /* Размер двери в заказе — тот же, что был у фасада в деталировке (сцена рисует створку на зазор меньше — слой 59, F9). */
  const facadePanel = buildPanels({ run: beforeRun, production: SHOP }).find((panel) => panel.moduleId === UPPER && panel.name === FACADE_PANEL_NAME);
  if (!facadePanel) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: у ${UPPER} до витрины нет фасада в деталировке`);
  const facadeBefore = panelsOf(beforeRun, UPPER, FACADE_PANEL_NAME);
  const facadeAfter = panelsOf(a.run, UPPER, FACADE_PANEL_NAME);
  const frontM2 = round2(qty(before.estimate, 'front_panel') - qty(a.estimate, 'front_panel'));
  const glassM2 = qty(a.estimate, 'glass_front');
  const aluHinges = lineOf(a.estimate, 'hinge_alu_frame');
  /* Открыта на полный ход: рамка, стекло и ручка — перед корпусом, тем же поворотом, что у полотна. */
  const pivot = leafA && leafA.kind === 'door' ? doorPivot(leafA.opening, leafA.xM, leafA.bottomM, leafA.widthM, leafA.heightM, SHOP.frontMm / MM) : null;
  const openZ = pivot
    ? ridersA.map((box) => {
        const rel = [box.position[0] - (runPlaces(a.run).find((p) => p.unit.id === UPPER)!.x + pivot.origin[0]), box.position[2] - pivot.origin[2]];
        const angle = pivot.angle;
        const z = -rel[0] * Math.sin(angle) + rel[1] * Math.cos(angle) + doorKick(pivot, angle);
        return z;
      })
    : [];
  check(
    'P1.1 верхний шкаф — дверь стекло в алюминиевой рамке: в сцене 4 планки рамки и стекло, фасада ЛДСП нет; закрытая дверь в плоскости фасада прежней; в раскрое фасада нет, в смете стекло по размеру двери и столько же снято с фасадов; петли под рамку — своей строкой без цены; рамка, стекло и ручка едут с дверью и открытые стоят перед корпусом',
    w11.length === 0 &&
      bars.length === 4 &&
      panes.length === 1 &&
      fronts.length === 0 &&
      [0, 1, 2].every((i) => near(doorAfter.min[i], doorBefore.min[i]) && near(doorAfter.max[i], doorBefore.max[i])) &&
      leafA?.kind === 'door' &&
      leafA.glass === true &&
      ridersA.filter((box) => box.node === 'frame').length === 4 &&
      ridersA.some((box) => box.node === 'glass') &&
      openZ.length > 0 &&
      openZ.every((z) => z > 0) &&
      facadeBefore === 1 &&
      facadeAfter === 0 &&
      doorPart !== undefined &&
      doorPart.lengthMm === facadePanel.lengthMm &&
      doorPart.widthMm === facadePanel.widthMm &&
      near(glassM2, area([doorPart!]), 0.011) &&
      near(frontM2, glassM2, 0.011) &&
      aluHinges.length === 1 &&
      aluHinges[0].quantity === 2 &&
      Boolean(aluHinges[0].priceUnset) &&
      a.run.fingerprint !== beforeRun.fingerprint,
    `правка: ${w11.join(' | ') || 'встала'} · планок ${bars.length}, стекла ${panes.length}, фасадов ${fronts.length} · дверь ${doorAfter.size.map((v) => v.toFixed(1)).join('×')} при прежней ${doorBefore.size.map((v) => v.toFixed(1)).join('×')} · в заказе ${doorPart?.lengthMm}×${doorPart?.widthMm} = фасад деталировки ${facadePanel.lengthMm}×${facadePanel.widthMm} · седоков ${ridersA.length} (z открытой ${openZ.map((z) => (z * MM).toFixed(0)).join('/')} мм) · фасадов в раскрое ${facadeBefore} → ${facadeAfter} · стекло ${glassM2} м² = двери ${doorPart ? area([doorPart]) : '—'} м², фасады −${frontM2} м² · петли под рамку ${aluHinges.map((l) => `${l.quantity} ${l.priceUnset ? '«цена не задана»' : ''}`).join('') || 'НЕТ'} · отпечаток ${beforeRun.fingerprint} → ${a.run.fingerprint}`,
  );

  /* Фурнитура: петля под чашку в плите на рамку не встаёт — словами; место петель — двери витрины. */
  {
    const catalog = factsCatalog(/71B3550$|72T550A\.TL$/);
    const place = fittingSlotsOf(unitA, a.run).find((p) => p.slot === 'hinge');
    const wood = Array.from(catalog.values()).find((item) => item.hardware.category === 'hinge' && item.hardware.subcategory === 'overlay' && /71B3550/.test(item.name));
    const lift = Array.from(catalog.values()).find((item) => /72T550A/.test(item.name));
    if (!wood || !lift) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: в фактах нет петли 71B3550 или 72T550A.TL');
    const woodVerdict = fittingVerdict({ unit: unitA, run: a.run, slot: 'hinge', item: wood, catalog });
    const liftVerdict = fittingVerdict({ unit: unitA, run: a.run, slot: 'hinge', item: lift, catalog });
    check(
      'P1.1 фурнитура: у двери витрины место петель «петли двери в алюминиевой рамке»; петля Blum 71B3550 под чашку в плите — отказ словами (чашку сверлить некуда), петля AVENTOS HF «для алюминиевых рамок» 72T550A.TL — отказ (она подъёмника, дверь распашная)',
      place?.vitrine === 'alu' &&
        place.quantity === 2 &&
        woodVerdict.state === 'refused' &&
        /чашку сверлить некуда/.test(woodVerdict.summary) &&
        liftVerdict.state === 'refused' &&
        /подъёмника/.test(liftVerdict.summary),
      `место: ${place ? `${place.where} ×${place.quantity}` : 'НЕТ'} · 71B3550: ${woodVerdict.state} «${woodVerdict.summary}» · 72T550A.TL: ${liftVerdict.state} «${liftVerdict.summary}»`,
    );
  }

  /* ── P1.2 каркас из профиля, две стеклянные боковины ── */
  const w12 = k.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'frame', glassMm: 6 } }]);
  const b = k.shown();
  const unitB = moduleOf(b.run, UPPER);
  const bBoxes = moduleBoxes(b.run, UPPER);
  const sideGlass = bBoxes.filter((box) => box.node === 'glass-panel' && /^side:/.test(box.vitrineRole ?? ''));
  const sideBoard = bBoxes.filter((box) => box.panel === SIDE_PANEL_NAME);
  const frameBars = bBoxes.filter((box) => box.node === 'vitrine-frame');
  const partsB = partsOf(b.run, UPPER);
  const sideParts = partsB.filter((part) => part.role.startsWith('side:'));
  const hB = moduleCarcassHeightMm(unitB, b.run);
  const dB = moduleDepthMm(unitB, b.run.zone, b.run.production);
  const profileMp = qty(b.estimate, 'vitrine_frame_profile');
  const sheet6 = qty(b.estimate, 'glass_sheet_clear_6');
  const reasonsB = vitrineProductionReasons(unitB);
  check(
    'P1.2 витрина в алюминиевом каркасе, две стеклянные боковины 6 мм: в сцене стекло вместо обеих боковин (толщина 6) и 12 планок каркаса; в раскрое боковин нет; в списке стекла две боковины В × Г; профиль в смете — 4 × (В + Ш + Г); выпуск заперт словами (каркас не подтверждён цехом)',
    w12.length === 0 &&
      sideGlass.length === 2 &&
      sideGlass.every((box) => near(box.scale[0] * MM, 6, 0.01)) &&
      sideBoard.length === 0 &&
      frameBars.length === 12 &&
      panelsOf(b.run, UPPER, SIDE_PANEL_NAME) === 0 &&
      sideParts.length === 2 &&
      /* У каркаса стекло в пазу профиля: на половину профиля (10 мм) меньше с каждой стороны. */
      sideParts.every((part) => part.lengthMm === hB - 20 && part.widthMm === dB - 20 && part.thicknessMm === 6) &&
      near(profileMp, round2((4 * (hB + unitB.widthMm + dB)) / MM), 0.011) &&
      near(sheet6, area(partsB.filter((part) => part.line === 'glass_sheet' && part.thicknessMm === 6)), 0.011) &&
      reasonsB.some((r) => /каркас из алюминиевого профиля/.test(r)),
    `правка: ${w12.join(' | ') || 'встала'} · стекло боковин ${sideGlass.length} (${sideGlass.map((box) => (box.scale[0] * MM).toFixed(1)).join('/')} мм), боковин плиты ${sideBoard.length}, планок ${frameBars.length} · боковин в раскрое ${panelsOf(b.run, UPPER, SIDE_PANEL_NAME)} · в списке ${sideParts.map((p) => `${p.lengthMm}×${p.widthMm}×${p.thicknessMm}`).join(', ')} при ${hB}×${dB} · профиль ${profileMp} м.п. · стекло 6 мм ${sheet6} м² · ${reasonsB.join(' | ')}`,
  );

  /* ── P1.3 цельностеклянная витрина ── */
  const w13 = k.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'glass', glassMm: 8 } }]);
  const c = k.shown();
  const unitC = moduleOf(c.run, UPPER);
  const cBoxes = moduleBoxes(c.run, UPPER);
  const cBoard = cBoxes.filter((box) => box.panel === SIDE_PANEL_NAME || box.panel === BOTTOM_PANEL_NAME || box.panel === TOP_PANEL_NAME);
  const cGlass = cBoxes.filter((box) => box.node === 'glass-panel');
  const cDoor = partBoxes(c.run, `${UPPER}:door:0`);
  const hC = moduleCarcassHeightMm(unitC, c.run);
  const dC = moduleDepthMm(unitC, c.run.zone, c.run.production);
  const innerC = unitC.widthMm - 2 * SHOP.carcassMm;
  const jointsMp = qty(c.estimate, 'vitrine_glass_joint');
  const expectJoints = round2((4 * dC + 2 * hC + 2 * innerC) / MM);
  const glassHinges = lineOf(c.estimate, 'hinge_glass_door');
  const bearsRefusal = (() => {
    const base = beforeRun.modules.find((unit) => unit.id === 'base-3300@w1');
    if (!base) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: нижнего base-3300@w1 нет');
    const probe = screen();
    return probe.ops([{ op: 'set_vitrine', moduleId: base.id, vitrine: { construction: 'glass', glassMm: 8 } }]);
  })();
  check(
    'P1.3 цельностеклянная витрина 8 мм: боковины, крыша, дно и задняя стенка — стекло, плиты корпуса нет; дверь — одно стекло без рамки; стыки стекла с стеклом — строкой по их длине (крепёж не выбран, без цены); петли стеклянной двери — без цены; под столешницей такая витрина — отказ словами',
    w13.length === 0 &&
      cBoard.length === 0 &&
      ['side:left', 'side:right', 'top', 'bottom', 'back'].every((role) => cGlass.some((box) => box.vitrineRole === role && box.glass === glassOf(unitC))) &&
      cDoor.filter((box) => box.node === 'frame').length === 0 &&
      cDoor.filter((box) => box.material === 'glass').length === 1 &&
      near(jointsMp, expectJoints, 0.011) &&
      glassHinges.length === 1 &&
      Boolean(glassHinges[0].priceUnset) &&
      lineOf(c.estimate, 'vitrine_frame_profile').length === 0 &&
      vitrineProductionReasons(unitC).some((r) => /цельностеклянная/.test(r)) &&
      /под столешницей стеклянный корпус её не удержит/.test(bearsRefusal[0] ?? ''),
    `правка: ${w13.join(' | ') || 'встала'} · плиты корпуса ${cBoard.length}, стекла ${cGlass.map((box) => box.vitrineRole).join(',')} · дверь: рамки ${cDoor.filter((box) => box.node === 'frame').length}, стекло ${cDoor.filter((box) => box.material === 'glass').length} · стыки ${jointsMp} м.п. (ждали ${expectJoints}) · петли стекла ${glassHinges.map((l) => l.quantity).join('') || 'НЕТ'} · под столешницей: «${bearsRefusal[0] ?? 'МОЛЧА'}»`,
  );

  /* ── P1.4 высокая витрина с несколькими стеклянными полками ── */
  {
    const t = screen({ requirements: { ...DEMO_REQUIREMENTS, glassDisplay: true } });
    const tall = allModules(t.shown().run).find((unit) => unit.section === 'glass_display');
    if (!tall) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: высокой витрины в кухне с glassDisplay нет');
    const shelves = [544, 1056, 1568, 2080];
    const boardShelvesBefore = (() => {
      t.ops([{ op: 'set_fill', moduleId: tall.id, fill: { ...tall.fill!, shelves } }]);
      return panelsOf(t.shown().run, tall.id, SHELF_PANEL_NAME);
    })();
    const w14 = [
      ...t.ops([{ op: 'set_vitrine', moduleId: tall.id, vitrine: { construction: 'carcass', glassMm: 6 } }]),
      ...t.ops([{ op: 'set_glass_shelves', moduleId: tall.id, glass: true }]),
    ];
    const run = t.shown().run;
    const unit = moduleOf(run, tall.id);
    const glassShelves = moduleBoxes(run, tall.id).filter((box) => box.node === 'glass-shelf');
    const place = runPlaces(run).find((p) => p.unit.id === tall.id)!;
    const shelfParts = partsOf(run, tall.id).filter((part) => part.line === 'glass_shelf');
    const est = t.shown().estimate;
    check(
      'P1.4 высокая витрина, 4 стеклянные полки 6 мм на 544…2080: в сцене 4 стеклянные полки на этих высотах, в раскрое полок ЛДСП 4 → 0; в смете «Полка стеклянная» 4 шт. и держатели 16 шт. без цены; нагрузка и пролёт стеклянной полки — «требует производственной проверки»',
      w14.length === 0 &&
        boardShelvesBefore === 4 &&
        panelsOf(run, tall.id, SHELF_PANEL_NAME) === 0 &&
        glassShelves.length === 4 &&
        glassShelves.every((box) => near(box.scale[1] * MM, 6, 0.01)) &&
        shelves.every((mm) => glassShelves.some((box) => near((box.position[1] - place.y) * MM, mm, 6))) &&
        shelfParts.reduce((sum, part) => sum + part.qty, 0) === 4 &&
        shelfParts.every((part) => part.unconfirmed.some((w) => /пролёт и нагрузка/.test(w))) &&
        qty(est, 'glass_shelf') === 4 &&
        qty(est, 'glass_shelf_support') === 16 &&
        Boolean(lineOf(est, 'glass_shelf_support')[0]?.priceUnset) &&
        unit.glassShelves === true,
      `правка: ${w14.join(' | ') || 'встала'} · полок ЛДСП ${boardShelvesBefore} → ${panelsOf(run, tall.id, SHELF_PANEL_NAME)} · стекло ${glassShelves.map((box) => ((box.position[1] - place.y) * MM).toFixed(0)).join('/')} мм от дна · смета: полки ${qty(est, 'glass_shelf')}, держатели ${qty(est, 'glass_shelf_support')}`,
    );
  }

  /* ── P1.5 витрина на столешнице ── */
  {
    const t = screen({ measurement: OPEN_WALL });
    const run0 = t.shown().run;
    const uppers = allModules(run0).filter((unit) => unit.kind === 'upper' && unit.section !== 'mezzanine' && !unit.appliance);
    const overDoor = uppers.find((unit) => run0.modules.some((m) => !m.appliance && m.frontType === 'door' && m.offsetMm <= unit.offsetMm && unit.offsetMm + unit.widthMm <= m.offsetMm + m.widthMm && m.kind === 'base'));
    const overSink = uppers.find((unit) => run0.modules.some((m) => m.appliance?.startsWith('sink') && m.offsetMm < unit.offsetMm + unit.widthMm && unit.offsetMm < m.offsetMm + m.widthMm));
    if (!overDoor || !overSink) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: в стене без окна нет верхнего над дверцей (${overDoor?.id}) или над мойкой (${overSink?.id})`);
    const sinkRefusal = t.ops([{ op: 'set_vitrine', moduleId: overSink.id, vitrine: { construction: 'carcass', onCounter: true } }]);
    t.reset();
    const w15 = t.ops([{ op: 'set_vitrine', moduleId: overDoor.id, vitrine: { construction: 'carcass', onCounter: true }, doors: 1 }]);
    const r1 = t.shown().run;
    const p1 = runPlaces(r1).find((p) => p.unit.id === overDoor.id)!;
    const rowTop = (() => {
      const other = runPlaces(r1).find((p) => p.unit.kind === 'upper' && p.unit.id !== overDoor.id && !p.unit.overhead && p.unit.section !== 'mezzanine');
      return other ? Math.round((other.y + other.heightM) * MM) : null;
    })();
    const apron = apronSpans(r1);
    const under = underCabinetSpans(r1);
    const slabs = countertopSlabs(r1);
    const from = overDoor.offsetMm;
    const to = overDoor.offsetMm + overDoor.widthMm;
    const toCeiling = t.ops([{ op: 'set_vitrine', moduleId: overDoor.id, vitrine: { construction: 'carcass', onCounter: true }, heightMm: r1.ceilingHeightMm - workTopMm(SHOP) }]);
    const r2 = t.shown().run;
    const p2 = runPlaces(r2).find((p) => p.unit.id === overDoor.id)!;
    /* Демо-стена с коробом вентиляции 2400…3400 (свес 600): над 3300…3400 до потолка не дойти — отказ числом. */
    const d = screen();
    d.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'carcass', onCounter: true } }]);
    const beamRefusal = d.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'carcass', onCounter: true }, heightMm: 2700 - workTopMm(SHOP) }]);
    check(
      'P1.5 витрина на столешнице: низ — рабочая поверхность, верх — верх верхнего ряда; фартук и лента под шкафами под ней рвутся, плита под ней остаётся; до потолка — встаёт (верх 2700); над мойкой — отказ словами; под коробом вентиляции до потолка — отказ числом; пересечений с мебелью ряда нет',
      w15.length === 0 &&
        near(p1.y * MM, workTopMm(SHOP)) &&
        rowTop !== null &&
        near((p1.y + p1.heightM) * MM, rowTop) &&
        !apron.some((span) => span.fromMm < to && from < span.toMm) &&
        !under.some((span) => span.fromMm < to && from < span.toMm) &&
        slabs.some((slab) => slab.fromMm <= from && to <= slab.toMm) &&
        toCeiling.length === 0 &&
        near((p2.y + p2.heightM) * MM, r2.ceilingHeightMm) &&
        hitsOf(r1, overDoor.id).length === 0 &&
        hitsOf(r2, overDoor.id).length === 0 &&
        /мойк/.test(sinkRefusal[0] ?? '') &&
        beamRefusal.length > 0,
      `${overDoor.id}: низ ${(p1.y * MM).toFixed(0)} (рабочая поверхность ${workTopMm(SHOP)}), верх ${((p1.y + p1.heightM) * MM).toFixed(0)} (ряд ${rowTop}) · фартук ${apron.map((s) => `${s.fromMm}…${s.toMm}`).join(', ')} · лента ${under.map((s) => `${s.fromMm}…${s.toMm}`).join(', ')} · плиты ${slabs.map((s) => `${s.fromMm}…${s.toMm}`).join(', ')} · до потолка: ${toCeiling.join(' | ') || `верх ${((p2.y + p2.heightM) * MM).toFixed(0)}`} · над мойкой: «${sinkRefusal[0] ?? 'МОЛЧА'}» · под коробом: «${beamRefusal[0] ?? 'МОЛЧА'}» · пересечений ${hitsOf(r1, overDoor.id).length}/${hitsOf(r2, overDoor.id).length}`,
    );
  }

  /* ── P1.6 витрина в антресоли ── */
  {
    const t = screen();
    const mezz = allModules(t.shown().run).find((unit) => unit.section === 'mezzanine');
    if (!mezz) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: антресоли в демо-кухне нет');
    const w16 = t.ops([{ op: 'set_vitrine', moduleId: mezz.id, vitrine: { construction: 'carcass' } }]);
    const run = t.shown().run;
    const door = partBoxes(run, `${mezz.id}:door:0`);
    const heightRefusal = t.ops([{ op: 'set_vitrine', moduleId: mezz.id, vitrine: { construction: 'carcass' }, heightMm: 500 }]);
    const glassM2 = qty(t.shown().estimate, 'glass_front');
    /* Кладовку пересобирает каждая правка: чужая правка витрину не теряет, снятая — не возвращается. */
    t.ops([{ op: 'set_glass', moduleId: mezz.id, glass: 'grey' }]);
    t.ops([{ op: 'set_opening', moduleId: 'base-1200@w1', opening: 'right' }]);
    const kept = moduleOf(t.shown().run, mezz.id);
    const keptDoor = partBoxes(t.shown().run, `${mezz.id}:door:0`);
    const removed = t.ops([{ op: 'set_vitrine', moduleId: mezz.id, vitrine: null }]);
    t.ops([{ op: 'set_opening', moduleId: 'base-1200@w1', opening: 'left' }]);
    const plain = moduleOf(t.shown().run, mezz.id);
    const plainDoor = partBoxes(t.shown().run, `${mezz.id}:door:0`);
    check(
      'P1.6 витрина в антресоли над холодильником (её пересобирает каждая правка): дверь — стекло в рамке, фасада ЛДСП нет; своя высота антресоли — отказ словами; в смете стекло двери; после чужой правки витрина и серое стекло на месте; снятая — не возвращается, фасад снова из плиты',
      w16.length === 0 &&
        door.filter((box) => box.node === 'frame').length === 4 &&
        door.filter((box) => box.material === 'glass').length === 1 &&
        door.filter((box) => box.material === 'front').length === 0 &&
        heightRefusal.length > 0 &&
        glassM2 > 0 &&
        vitrineOf(kept) !== null &&
        kept.glass === 'grey' &&
        keptDoor.some((box) => box.glass === 'grey') &&
        removed.length === 1 &&
        /сняты вид стекла/.test(removed[0]) &&
        vitrineOf(plain) === null &&
        plain.glass === undefined &&
        plainDoor.some((box) => box.material === 'front') &&
        !plainDoor.some((box) => box.node === 'frame'),
      `${mezz.id}: ${w16.join(' | ') || 'встала'} · планок ${door.filter((box) => box.node === 'frame').length}, стекла ${door.filter((box) => box.material === 'glass').length} · высота: «${heightRefusal[0] ?? 'МОЛЧА'}» · стекло ${glassM2} м² · после чужой правки: ${vitrineOf(kept) ? 'витрина' : 'ПОТЕРЯНА'}, стекло ${kept.glass ?? 'прозрачное'} · снята: ${removed.join(' | ') || 'да'} → ${vitrineOf(plain) ? 'ВЕРНУЛАСЬ' : 'глухой'}, стекло ${plain.glass ?? 'нет'}`,
    );
  }

  /* ── P1.7 / P1.8 Г и П: витрина на соседней стене, угол не меняется ── */
  const cornerCase = (spec: Spec, wall: number, id: string) => {
    const built = buildObject(spec);
    const { segments, places } = built.engine;
    const target = allModules(segments[wall]).find((unit) => unit.id === id);
    if (!target) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: на стене ${wall + 1} «${spec.title}» нет ${id} — ${allModules(segments[wall]).map((u) => u.id).join(' ')}`);
    const kinBefore = cornerKinematics({ runs: segments, places, production: SHOP });
    const edited = applyOps({ run: segments[wall], requirements: built.requirements, ops: [{ op: 'set_vitrine', moduleId: target.id, vitrine: { construction: 'carcass' } }], openings: [] });
    const wallId = segments[wall].wallId!;
    /* Рабочая стена правится как у экрана (`editedRuns`), соседние — `editedWalls`. */
    const after = buildObject(wall === 0 ? { ...spec, working: edited } : { ...spec, edits: { [wallId]: edited } });
    const kinAfter = cornerKinematics({ runs: after.engine.segments, places: after.engine.places, production: SHOP });
    const sig = (kin: ReturnType<typeof cornerKinematics>) => kin.clashes.map((cl) => `${cl.pair}:${cl.depthMm.toFixed(2)}`).sort().join(';');
    const door = partBoxes(after.engine.segments[wall], `${target.id}:door:0`);
    return {
      warnings: edited.warnings,
      target,
      bars: door.filter((box) => box.node === 'frame').length,
      glass: door.filter((box) => box.material === 'glass').length,
      sameCorner: sig(kinBefore) === sig(kinAfter),
      kinBefore: kinBefore.clashes.length,
      sweep: vitrineSweep({ run: after.engine.segments[wall], production: SHOP }).clashes.map(rowSweepWords),
    };
  };
  {
    const l = cornerCase({ key: 'p1-l', title: 'Г 3800 + 2400', lengths: [3800, 2400], shape: 'corner_l', corners: [NEW_CORNER] }, 0, 'upper-1030@w1');
    check(
      'P1.7 Г 3800 + 2400: витрина на стене А (верхний шкаф 600 между двумя шкафами) — стекло в рамке на её двери; заходы у угла те же, что без витрины; хода двери в соседей нет',
      l.warnings.length === 0 && l.bars === 4 && l.glass === 1 && l.sameCorner && l.sweep.length === 0,
      `${l.target.id}: ${l.warnings.join(' | ') || 'встала'} · планок ${l.bars}, стекла ${l.glass} · заходов у угла ${l.kinBefore} — ${l.sameCorner ? 'те же' : 'ДРУГИЕ'} · ход: ${l.sweep.join(' ; ') || 'заходов нет'}`,
    );
    const u = cornerCase({ key: 'p1-u', title: 'П 3200 + 2400 + 3200', lengths: [3200, 2400, 3200], shape: 'u_shape', corners: [NEW_CORNER, NEW_CORNER] }, 2, 'upper-1824@w3');
    check(
      'P1.8 П 3200 + 2400 + 3200: витрина на стене В — стекло в рамке; заходы у углов те же; хода двери в соседей нет',
      u.warnings.length === 0 && u.bars === 4 && u.glass === 1 && u.sameCorner && u.sweep.length === 0,
      `${u.target.id}: ${u.warnings.join(' | ') || 'встала'} · планок ${u.bars}, стекла ${u.glass} · заходов у углов ${u.kinBefore} — ${u.sameCorner ? 'те же' : 'ДРУГИЕ'} · ход: ${u.sweep.join(' ; ') || 'заходов нет'}`,
    );
  }

  /* ── P1.9 рядом с пеналом: петли у пенала — заход назван, цена спрятана; петли с другой стороны — заходов нет ── */
  {
    const t = screen();
    const hingeLeft = [
      ...t.ops([{ op: 'set_vitrine', moduleId: NEXT_TO_TALL, vitrine: { construction: 'carcass' } }]),
      ...t.ops([{ op: 'set_opening', moduleId: NEXT_TO_TALL, opening: 'left' }]),
    ];
    const runL = t.shown().run;
    const sweepL = vitrineSweep({ run: runL, production: SHOP });
    const mismatches = vitrineSweepMismatches({ runs: [runL], production: SHOP });
    const state = screenState({ refusal: null, mismatches, walls: [], segments: [runL], shape: 'linear', warnings: [] });
    t.ops([{ op: 'set_opening', moduleId: NEXT_TO_TALL, opening: 'right' }]);
    const runR = t.shown().run;
    const sweepR = vitrineSweep({ run: runR, production: SHOP });
    check(
      'P1.9 витрина рядом с пеналом духовки, петли у пенала: дверь на ходу заходит в его корпус — словами с миллиметрами, цена спрятана, запись не заперта, выгрузка в цех заперта; петли с другой стороны — заходов нет',
      hingeLeft.length === 0 &&
        sweepL.clashes.length > 0 &&
        sweepL.clashes.every((clash) => clash.obstacleModuleId === 'tall-600-oven@w1' && clash.depthMm > 1) &&
        mismatches.length === 1 &&
        /не откроется до конца/.test(wallMismatchMessage(mismatches[0])) &&
        /Поменяйте сторону петель/.test(wallMismatchMessage(mismatches[0])) &&
        /дверь витрины/.test(mismatchPriceText(mismatches[0])) &&
        state.priceHidden &&
        !state.autosaveLocked &&
        state.exportLocked &&
        sweepR.clashes.length === 0,
      `петли слева: ${sweepL.clashes.map(rowSweepWords).join(' ; ') || 'МОЛЧА'} · «${mismatches[0] ? wallMismatchMessage(mismatches[0]) : '—'}» · цена ${state.priceHidden ? 'спрятана' : 'ВИДНА'}, запись ${state.autosaveLocked ? 'ЗАПЕРТА' : 'идёт'} · петли справа: ${sweepR.clashes.map(rowSweepWords).join(' ; ') || 'заходов нет'}`,
    );
  }

  /* ── P1.10 петли слева и справа ── */
  {
    const t = screen();
    t.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'carcass' } }]);
    const side = (opening: 'left' | 'right') => {
      const w = t.ops([{ op: 'set_opening', moduleId: UPPER, opening }]);
      const run = t.shown().run;
      const unit = moduleOf(run, UPPER);
      const leaf = sceneLeaves(unit, moduleCarcassHeightMm(unit, run) / MM).find((l) => l.id === `${UPPER}:door:0`);
      const handle = partBoxes(run, `${UPPER}:door:0`).find((box) => box.node === 'handle');
      const place = runPlaces(run).find((p) => p.unit.id === UPPER)!;
      const pivot = leaf && leaf.kind === 'door' ? doorPivot(leaf.opening, leaf.xM, leaf.bottomM, leaf.widthM, leaf.heightM) : null;
      const swing = frontGlyph(unit, 'fronts').filter((el) => el.kind === 'swing');
      return {
        w,
        opening: leaf && leaf.kind === 'door' ? leaf.opening : null,
        axisMm: pivot ? Math.round(pivot.origin[0] * MM) : null,
        handleMm: handle ? Math.round((handle.position[0] - place.x) * MM) : null,
        swing: swing.map((el) => (el.kind === 'swing' ? el.hinge : '')).join(','),
        fingerprint: run.fingerprint,
        hinges: qty(t.shown().estimate, 'hinge_alu_frame'),
        widthMm: unit.widthMm,
      };
    };
    const left = side('left');
    const right = side('right');
    check(
      'P1.10 петли слева и справа: ось двери у левой и у правой кромки, ручка — у свободной (не у петель); на листе диагонали в свою сторону; отпечаток разный, петель под рамку столько же',
      left.w.length === 0 &&
        right.w.length === 0 &&
        left.opening === 'left' &&
        right.opening === 'right' &&
        left.axisMm === 0 &&
        right.axisMm === right.widthMm &&
        left.handleMm !== null &&
        right.handleMm !== null &&
        left.handleMm > left.widthMm / 2 &&
        right.handleMm < right.widthMm / 2 &&
        left.swing === 'left' &&
        right.swing === 'right' &&
        left.fingerprint !== right.fingerprint &&
        left.hinges === right.hinges &&
        left.hinges > 0,
      `слева: ось ${left.axisMm}, ручка ${left.handleMm} мм, лист ${left.swing} · справа: ось ${right.axisMm}, ручка ${right.handleMm} мм, лист ${right.swing} · отпечаток ${left.fingerprint}/${right.fingerprint} · петель ${left.hinges}/${right.hinges}`,
    );
  }

  /* ── P1.11 передняя и задняя стороны доступа ── */
  {
    const t = screen();
    t.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'carcass' } }]);
    const fp = t.shown().run.fingerprint;
    const back = t.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'carcass', view: 'back' } }]);
    const both = t.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'carcass', view: 'both' } }]);
    check(
      'P1.11 доступ сзади и с двух сторон у витрины, стоящей задом к стене, — отказ словами; ряд прежний',
      /задом к стене/.test(back[0] ?? '') && /задом к стене/.test(both[0] ?? '') && t.shown().run.fingerprint === fp && vitrineOf(moduleOf(t.shown().run, UPPER))?.view === 'front',
      `сзади: «${back[0] ?? 'МОЛЧА'}» · с двух сторон: «${both[0] ?? 'МОЛЧА'}» · отпечаток ${fp} → ${t.shown().run.fingerprint}`,
    );
  }

  /* ── P1.12 вид стекла · P1.13 цвет профиля · P1.14 лента ── */
  {
    const t = screen();
    t.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'carcass' } }]);
    const fpClear = t.shown().run.fingerprint;
    const wGlass = t.ops([{ op: 'set_glass', moduleId: UPPER, glass: 'bronze' }]);
    const runBronze = t.shown().run;
    const estBronze = t.shown().estimate;
    const paneBronze = partBoxes(runBronze, `${UPPER}:door:0`).find((box) => box.material === 'glass');
    const metaBronze = describeFront({ ...moduleOf(runBronze, UPPER), vitrine: vitrineMeta(moduleOf(runBronze, UPPER)) } as never).text;
    t.ops([{ op: 'set_glass', moduleId: UPPER, glass: 'extra_clear' }]);
    const estExtra = t.shown().estimate;
    check(
      'P1.12 вид стекла: бронзовое — стекло двери в сцене бронзовое, строка сметы своя («цена не задана»), отпечаток другой, в промпте «стекло бронзовое»; осветлённое — своя строка',
      wGlass.length === 0 &&
        paneBronze?.glass === 'bronze' &&
        lineOf(estBronze, 'glass_front_bronze').length === 1 &&
        lineOf(estBronze, 'glass_front').length === 0 &&
        runBronze.fingerprint !== fpClear &&
        /стекло бронзовое/.test(metaBronze) &&
        lineOf(estExtra, 'glass_front_extra_clear').length === 1,
      `стекло ${paneBronze?.glass ?? 'НЕТ'} · строки ${lineOf(estBronze, 'glass_front_bronze').map((l) => `${l.key} ${l.quantity} м² ${l.priceUnset ? '«цена не задана»' : ''}`).join('') || 'НЕТ'} · осветлённое ${lineOf(estExtra, 'glass_front_extra_clear').length} · отпечаток ${fpClear} → ${runBronze.fingerprint} · промпт: ${metaBronze.slice(0, 90)}`,
    );

    const fpBefore = t.shown().run.fingerprint;
    const wProfile = t.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'carcass', profile: 'black' } }]);
    const runBlack = t.shown().run;
    const barsBlack = partBoxes(runBlack, `${UPPER}:door:0`).filter((box) => box.node === 'frame');
    const titleBlack = lineOf(t.shown().estimate, 'glass_front_extra_clear')[0]?.title ?? '';
    const partBlack = partsOf(runBlack, UPPER).find((p) => p.role === 'door:0');
    t.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'carcass', profile: 'champagne' } }]);
    const barsChampagne = partBoxes(t.shown().run, `${UPPER}:door:0`).filter((box) => box.node === 'frame');
    check(
      'P1.13 цвет профиля: чёрный — все 4 планки рамки чёрные, в смете и в списке «профиль: чёрный», отпечаток другой; шампань — планки шампань',
      wProfile.length === 0 &&
        barsBlack.length === 4 &&
        barsBlack.every((box) => box.profile === 'black') &&
        /профиль: чёрный/.test(titleBlack) &&
        /чёрный/.test(partBlack?.material ?? '') &&
        runBlack.fingerprint !== fpBefore &&
        barsChampagne.every((box) => box.profile === 'champagne') &&
        barsChampagne.length === 4,
      `планки ${barsBlack.map((box) => box.profile).join(',')} → ${barsChampagne.map((box) => box.profile).join(',')} · смета «${titleBlack}» · список «${partBlack?.material ?? '—'}» · отпечаток ${fpBefore} → ${runBlack.fingerprint}`,
    );

    const wLed = t.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'carcass', profile: 'champagne', led: 'sides' } }]);
    const runLed = t.shown().run;
    const unitLed = moduleOf(runLed, UPPER);
    const stripsLed = vitrineLedStrips(unitLed, 'sides', moduleCarcassHeightMm(unitLed, runLed), SHOP.carcassMm);
    const planLed = lightingPlan(EMPTY_LIGHTING, [{ run: runLed }], null, SHOP.carcassMm).strips.filter((s) => s.kind === 'display' && s.moduleId === UPPER);
    const ledMp = qty(t.shown().estimate, 'led_display');
    const glyphLed = frontGlyph(unitLed, 'fronts').some((el) => el.kind === 'led');
    t.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'carcass', profile: 'champagne', led: 'off' } }]);
    const runOff = t.shown().run;
    const planOff = lightingPlan(EMPTY_LIGHTING, [{ run: runOff }], null, SHOP.carcassMm).strips.filter((s) => s.kind === 'display' && s.moduleId === UPPER);
    check(
      'P1.14 лента по бокам: две вертикальные полосы в сцене и в плане света, в смете метры этих полос, на листе лента; выключена — ни полос, ни строки, ни ленты на листе',
      wLed.length === 0 &&
        stripsLed.length === 2 &&
        planLed.length === 2 &&
        planLed.every((s) => s.axis === 'y') &&
        near(ledMp, vitrineLedMeters(stripsLed), 0.011) &&
        glyphLed &&
        planOff.length === 0 &&
        lineOf(t.shown().estimate, 'led_display').length === 0 &&
        !frontGlyph(moduleOf(runOff, UPPER), 'fronts').some((el) => el.kind === 'led'),
      `полос ${stripsLed.length} (план ${planLed.length}, ${planLed.map((s) => `${s.axis} ${s.lengthMm}`).join(', ')}) · смета ${ledMp} м.п. = ${vitrineLedMeters(stripsLed)} · выкл.: план ${planOff.length}, строк ${lineOf(t.shown().estimate, 'led_display').length}`,
    );
  }

  /* ── P1.12б рама KIRA «В2» на витрину из панели — ложится; на цельностеклянную — отказ словами ── */
  {
    const millings = millingCatalog([...DEMO_CATALOG, ...kiraDemoEntries(DEMO_CATALOG)]);
    const v2 = Array.from(millings.values()).find((item) => item.article === 'KIRA-V2');
    if (!v2) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: модели KIRA-V2 в каталоге демонстрации нет');
    const t = screen();
    t.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'carcass' } }]);
    const plan = mdfFacadeOps('leaf', { model: v2 }, t.shown().run, UPPER, 'door:0');
    if ('refusal' in plan) throw new Error(`KIRA-V2 на витрину: ${plan.refusal}`);
    const framed = t.ops(plan.ops);
    const door = partBoxes(t.shown().run, `${UPPER}:door:0`);
    const mdf = door.some((box) => box.material === 'front' && box.relief);
    const behind = door.some((box) => box.material === 'glass');
    const bars = door.filter((box) => box.node === 'frame').length;
    const c = screen();
    c.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'glass', glassMm: 8 } }]);
    const planC = mdfFacadeOps('leaf', { model: v2 }, c.shown().run, UPPER, 'door:0');
    const refusedC = 'refusal' in planC ? [planC.refusal] : c.ops(planC.ops);
    check(
      'P1.12б рама KIRA «В2» на витрину, сделанную в панели «Витрина», — ложится: дверь — фасад МДФ с рисунком, за окнами стекло, планок профиля нет; на цельностеклянную витрину — отказ словами (дверь там — стекло без рамки)',
      framed.length === 0 && mdf && behind && bars === 0 && /цельностеклянной/.test(refusedC[0] ?? ''),
      `рама: ${framed.join(' | ') || 'встала'} · фасад МДФ ${mdf}, стекло ${behind}, планок ${bars} · цельностеклянная: «${refusedC[0] ?? 'МОЛЧА'}»`,
    );
  }

  /* ── P1.15 сохранение и повторное открытие ── */
  {
    const t = screen();
    t.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'frame', glassMm: 6, profile: 'black', led: 'top' } }]);
    t.ops([{ op: 'set_glass', moduleId: UPPER, glass: 'grey' }]);
    const shown = t.shown();
    const state: MillworkState = {
      requirements: DEMO_REQUIREMENTS,
      runs: { optimal: shown.run },
      selectedVariant: 'optimal',
      disabled: DISABLED,
      shape: 'linear',
      savedAt: '2026-10-25T12:00:00.000Z',
    };
    const reopened = JSON.parse(JSON.stringify(state)) as MillworkState;
    const offer = projectOffer({ title: 'P1', zone: 'Кухня', measurement: DEMO_MEASUREMENT, state: reopened, production: SHOP, catalog: [], rates: DEMO_RATES });
    const saved = moduleOf(shown.run, UPPER);
    const back = offer.state === 'built' ? moduleOf(offer.run, UPPER) : null;
    check(
      'P1.15 сохранение → открытие: спецификация витрины, вид стекла, отпечаток, итог и список стекла — те же (кабинет клиента тем же путём)',
      offer.state === 'built' &&
        JSON.stringify(back?.vitrine) === JSON.stringify(saved.vitrine) &&
        back?.glass === 'grey' &&
        offer.run.fingerprint === shown.run.fingerprint &&
        Math.abs(offer.estimate.total - shown.estimate.total) < 0.5 &&
        JSON.stringify(vitrineParts(offer.run, SHOP)) === JSON.stringify(vitrineParts(shown.run, SHOP)),
      offer.state === 'built'
        ? `витрина ${JSON.stringify(back?.vitrine)} · стекло ${back?.glass} · отпечаток ${shown.run.fingerprint} / ${offer.run.fingerprint} · итог ${shown.estimate.total} / ${offer.estimate.total}`
        : `не собралось: ${offer.refusal}`,
    );
  }

  /* ── P1.16 3D = 2D = BOM = деталировка ── */
  {
    const t = screen();
    t.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'glass', glassMm: 8 } }]);
    t.ops([{ op: 'set_vitrine', moduleId: NEXT_TO_TALL, vitrine: { construction: 'frame', glassMm: 6 } }]);
    t.ops([{ op: 'set_opening', moduleId: NEXT_TO_TALL, opening: 'right' }]);
    const shown = t.shown();
    const run = shown.run;
    const problems: string[] = [];
    let compared = 0;
    for (const id of [UPPER, NEXT_TO_TALL]) {
      const unit = moduleOf(run, id);
      const boxes = moduleBoxes(run, id);
      for (const part of partsOf(run, id)) {
        if (part.line === 'profile' || part.line === 'glass_joint') continue;
        const scene =
          part.role.startsWith('door:')
            ? partBoxes(run, `${id}:${part.role}`).filter((box) => box.node === 'frame' || box.material === 'glass')
            : boxes.filter((box) => box.vitrineRole === part.role);
        if (scene.length === 0) {
          problems.push(`${id} ${part.name}: в сцене нет`);
          continue;
        }
        const size = bounds(scene).size;
        compared += 1;
        if (part.role.startsWith('door:')) {
          /*
           * ДВЕРЬ: в заказе — размер фасада деталировки (В − зазор), в сцене —
           * створка на зазор с каждой стороны (В − 2 · зазор): давнее
           * расхождение сцены и деталировки (слой 59, F9), здесь оно названо
           * числом, а не спрятано допуском. Ширина одной створки — та же.
           */
          const gap = SHOP.frontGapMm;
          if (!near(size[1] + gap, part.lengthMm, 0.5) || !near(size[0], part.widthMm, 0.5) || vitrineDoorsOf(unit) !== 1) {
            problems.push(`${id} ${part.name}: сцена ${size[1].toFixed(1)} + зазор ${gap} × ${size[0].toFixed(1)} ≠ заказ ${part.lengthMm}×${part.widthMm}`);
          }
          continue;
        }
        const dims = [...size].sort((x, y) => y - x);
        const want = [part.lengthMm, part.widthMm].sort((x, y) => y - x);
        if (!near(dims[0], want[0], 1) || !near(dims[1], want[1], 1)) {
          problems.push(`${id} ${part.name}: сцена ${dims.slice(0, 2).map((v) => v.toFixed(1)).join('×')} ≠ список ${want.join('×')}`);
        }
      }
      const glyph = glyphSignature(frontGlyph(unit, 'fronts'));
      if (!/glass/.test(glyph) || !/frame/.test(glyph)) problems.push(`${id}: на листе нет стекла и рамки — ${glyph}`);
    }
    /* Смета — те же площади, что список; деталировка — список целиком, тем же `vitrineParts`. */
    const sheets = vitrineParts(run, SHOP).filter((part) => part.line === 'glass_sheet');
    const sheetM2 = round2(shown.estimate.lines.filter((line) => line.key.startsWith('glass_sheet_')).reduce((sum, line) => sum + line.quantity, 0));
    if (!near(sheetM2, area(sheets), 0.02)) problems.push(`стекло по размеру: смета ${sheetM2} ≠ список ${area(sheets)} м²`);
    const walls = [{ wallId: 'w1', label: 'Стена А', run }];
    const plan = cuttingPlan({ parts: objectPanels({ walls, production: SHOP }), settings: TYPICAL_CUTTING, fingerprint: run.fingerprint, vitrine: { parts: vitrineParts(run, SHOP), reasons: allModules(run).flatMap((u) => vitrineProductionReasons(u)) } });
    const planSvg = renderToStaticMarkup(createElement(PlanDrawing, { run, comms: [], issues: [] }));
    const sectionSvg = renderToStaticMarkup(createElement(SectionDrawing, { run }));
    check(
      'P1.16 3D = 2D = BOM = деталировка: каждая деталь списка стекла и изделий (двери, боковины, крыша, дно, задняя стенка) — та же коробка в сцене ±1 мм; на листе стекло и рамка; стекло по размеру в смете = площадь списка; карта раскроя несёт тот же список вне листов, а выпуск заперт словами витрины; разрез показывает витрину своей полосой со стеклом',
      problems.length === 0 &&
        compared >= 9 &&
        plan.outside.length === vitrineParts(run, SHOP).length &&
        !plan.release.ok &&
        plan.release.reasons.some((r) => /Витрина «/.test(r)) &&
        (sectionSvg.match(/data-vitrine=""/g) ?? []).length >= 1 &&
        planSvg.length > 0,
      `сверено ${compared} деталей · ${problems.slice(0, 3).join(' | ') || 'расхождений нет'} · стекло ${sheetM2} м² · вне листов ${plan.outside.length} · выпуск: ${plan.release.reasons.filter((r) => /Витрина/.test(r)).length} причин витрины · полос витрины на разрезе ${(sectionSvg.match(/data-vitrine=""/g) ?? []).length}`,
    );
  }

  /* ── P1.17 все поддерживаемые помещения — один компонент ── */
  {
    const rooms: { zone: ZoneKind; title: string }[] = [
      { zone: 'kitchen', title: 'Кухня' },
      { zone: 'living', title: 'Гостиная' },
      { zone: 'bedroom', title: 'Спальня' },
      { zone: 'hallway', title: 'Прихожая' },
      { zone: 'bathroom', title: 'Санузел' },
    ];
    const results: string[] = [];
    let made = 0;
    for (const room of rooms) {
      /* Первый шаблон зоны, где есть модуль, который витриной бывает (`vitrineBlocker`); отказ у остальных — законный и словами. */
      const candidates = RUN_TEMPLATES.filter((tpl) => (tpl.zone ?? 'kitchen') === room.zone);
      if (candidates.length === 0) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: шаблонов зоны ${room.zone} нет`);
      let found: { t: ReturnType<typeof screen>; template: (typeof RUN_TEMPLATES)[number]; target: Module } | null = null;
      for (const template of candidates) {
        const t = screen({ zone: room.title, requirements: requirementsFromTemplate(template, DEMO_REQUIREMENTS.options) });
        const run0 = t.shown().run;
        const target = allModules(run0).find(
          (unit) => unit.frontType === 'door' && unit.doorCount >= 1 && unit.kind !== 'corner_base' && unit.kind !== 'corner_upper' && vitrineBlocker(unit, run0) === null,
        );
        if (target) {
          found = { t, template, target };
          break;
        }
      }
      if (!found) {
        results.push(`${room.title}: ни в одном из ${candidates.length} шаблонов зоны нет модуля, который бывает витриной`);
        continue;
      }
      const { t, template, target } = found;
      const warnings = t.ops([{ op: 'set_vitrine', moduleId: target.id, vitrine: { construction: 'carcass' } }]);
      const run = t.shown().run;
      const door = partBoxes(run, `${target.id}:door:0`);
      const ok = warnings.length === 0 && door.some((box) => box.node === 'frame') && door.some((box) => box.material === 'glass') && run.zone === room.zone;
      if (ok) made += 1;
      results.push(`${room.title} (${template.id}, ${target.id}): ${ok ? 'стекло в рамке' : `НЕТ — ${warnings.join(' | ') || 'двери нет в сцене'}`}`);
    }
    check(
      'P1.17 витрина ставится в кухне, гостиной, спальне, прихожей и санузле одним блоком и одной правкой: у каждой — стекло в рамке в сцене',
      made === rooms.length,
      results.join(' · '),
    );
  }

  /* ── P1.18 ход дверей и пересечения корпусов во время движения ── */
  {
    const runs: { title: string; run: Run; ids: string[] }[] = [];
    const t = screen();
    t.ops([{ op: 'set_vitrine', moduleId: UPPER, vitrine: { construction: 'carcass' }, doors: 1 }]);
    t.ops([{ op: 'set_vitrine', moduleId: NEXT_TO_TALL, vitrine: { construction: 'frame', glassMm: 6 } }]);
    t.ops([{ op: 'set_opening', moduleId: NEXT_TO_TALL, opening: 'right' }]);
    runs.push({ title: 'демо: две витрины', run: t.shown().run, ids: [UPPER, NEXT_TO_TALL] });
    const g = screen({ requirements: { ...DEMO_REQUIREMENTS, glassDisplay: true } });
    const tall = allModules(g.shown().run).find((unit) => unit.section === 'glass_display')!;
    g.ops([{ op: 'set_vitrine', moduleId: tall.id, vitrine: { construction: 'carcass', glassMm: 6, led: 'shelves' } }]);
    runs.push({ title: 'высокая витрина', run: g.shown().run, ids: [tall.id] });
    const o = screen({ measurement: OPEN_WALL });
    const counter = allModules(o.shown().run).find((unit) => unit.kind === 'upper' && unit.offsetMm >= 3000 && !unit.appliance)!;
    o.ops([{ op: 'set_vitrine', moduleId: counter.id, vitrine: { construction: 'carcass', onCounter: true } }]);
    runs.push({ title: 'на столешнице', run: o.shown().run, ids: [counter.id] });
    const report: string[] = [];
    let leaves = 0;
    let clashes = 0;
    let hits = 0;
    for (const entry of runs) {
      const sweep = vitrineSweep({ run: entry.run, production: SHOP });
      clashes += sweep.clashes.length;
      for (const id of entry.ids) {
        leaves += openablePartIds(entry.run).filter((part) => part.startsWith(`${id}:door:`)).length;
        hits += hitsOf(entry.run, id).length;
      }
      report.push(`${entry.title}: заходов ${sweep.clashes.length}${sweep.clashes.length ? ` (${sweep.clashes.map(rowSweepWords).join('; ')})` : ''}, пересечений ${entry.ids.map((id) => hitsOf(entry.run, id).length).join('/')}`);
    }
    check(
      'P1.18 ход дверей витрин по всему ходу (шаг 0,5°, уточнение максимумов) — заходов в мебель ряда 0, корпуса витрин ни с чем не пересекаются; двери — те же, что «Открыть всё»',
      clashes === 0 && hits === 0 && leaves >= 4,
      `дверей ${leaves} · ${report.join(' · ')}`,
    );
  }

  /* ── P1.19 углы P0 работают: Г-модуль пары витриной, слепой угол — отказ ── */
  {
    const built = buildObject({ key: 'p1-lpair', title: 'Г 3800 + 2400, Г-модули', lengths: [3800, 2400], shape: 'corner_l', corners: [{ lower: 'l_shape', upper: 'l_shape', upperDoors: 'pair' }] });
    const { segments, places } = built.engine;
    const pairUnit = segments.flatMap((run, wall) => allModules(run).map((unit) => ({ unit, wall }))).find(({ unit }) => unit.kind === 'corner_upper' && unit.cornerDoors === 'pair');
    if (!pairUnit) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: верхнего Г-модуля с парой дверец нет');
    const kinBefore = cornerKinematics({ runs: segments, places, production: SHOP });
    const edited = applyOps({ run: segments[pairUnit.wall], requirements: built.requirements, ops: [{ op: 'set_vitrine', moduleId: pairUnit.unit.id, vitrine: { construction: 'carcass' } }], openings: [] });
    const pairSpec: Spec = {
      key: 'p1-lpair',
      title: 'Г 3800 + 2400, Г-модули',
      lengths: [3800, 2400],
      shape: 'corner_l',
      corners: [{ lower: 'l_shape', upper: 'l_shape', upperDoors: 'pair' }],
    };
    const after = buildObject(pairUnit.wall === 0 ? { ...pairSpec, working: edited } : { ...pairSpec, edits: { [segments[pairUnit.wall].wallId!]: edited } });
    const run = after.engine.segments[pairUnit.wall];
    const doors = [0, 1].map((leg) => partBoxes(run, `${pairUnit.unit.id}:door:${leg}`));
    const kinAfter = cornerKinematics({ runs: after.engine.segments, places: after.engine.places, production: SHOP });
    const ownBefore = kinBefore.clashes.filter((cl) => cl.own).map((cl) => `${cl.leaf}:${cl.depthMm.toFixed(1)}`).sort();
    const ownAfter = kinAfter.clashes.filter((cl) => cl.own).map((cl) => `${cl.leaf}:${cl.depthMm.toFixed(1)}`).sort();
    const blind = buildObject({ key: 'p1-blind', title: 'Г 3800 + 2400, слепой угол', lengths: [3800, 2400], shape: 'corner_l', corners: [NEW_CORNER] });
    const blindRun = blind.engine.segments[0];
    const blindUpper = allModules(blindRun).filter((unit) => unit.kind === 'upper' && !unit.appliance && unit.section !== 'mezzanine').sort((x, y) => y.offsetMm - x.offsetMm)[0];
    const blindTry = applyOps({ run: blindRun, requirements: blind.requirements, ops: [{ op: 'set_vitrine', moduleId: blindUpper.id, vitrine: { construction: 'carcass' } }], openings: [] });
    check(
      'P1.19 углы P0: верхний Г-модуль с парой дверец — витриной: у обеих дверец стекло в рамке, заход внутри пары тот же, что был (P0 не ослаблен); слепой угол навесного ряда — отказ словами (угловых петель под рамку нет)',
      edited.warnings.length === 0 &&
        doors.every((list) => list.filter((box) => box.node === 'frame').length === 4 && list.some((box) => box.material === 'glass')) &&
        JSON.stringify(ownBefore) === JSON.stringify(ownAfter) &&
        /175°/.test(blindTry.warnings[0] ?? ''),
      `${pairUnit.unit.id}: ${edited.warnings.join(' | ') || 'встала'} · дверцы: ${doors.map((list) => `${list.filter((box) => box.node === 'frame').length} планок/${list.filter((box) => box.material === 'glass').length} стекла`).join(', ')} · внутри пары до ${ownBefore.join(',') || '0'} → после ${ownAfter.join(',') || '0'} · слепой угол ${blindUpper.id}: «${blindTry.warnings[0] ?? 'МОЛЧА'}»`,
    );
  }

  /* ── P1.20 старые проекты без витрин — те же до символа ── */
  /** Конфигураций эталона, у которых отпечаток сдвинули только полка кладовки над холодильником и опоры пенала (ЭТАП 4). */
  const STORAGE_SHELF_SHIFTED = 25;
  /** Конфигураций эталона без витрин, где смету сдвинули только опорные полки одиночного прибора в пенале (ЭТАП 4). */
  const PENCIL_SUPPORTS_ADDED = 12;
  {
    const baseline = JSON.parse(readFileSync(new URL('./p1-baseline.json', import.meta.url), 'utf8')) as Record<string, BaselineEntry>;
    /*
     * Конфигурации ЭТАЛОНА, а не сегодняшних шаблонов: эталон снят до этапа B,
     * и шаблоны ТВ-зоны (их сверяет приёмка ТВ-зоны) в нём не значатся. Шаблон
     * эталона пропал — `baselineRun` падает нулевым селектором.
     */
    const keys = Object.keys(baseline).map((key) => {
      const at = key.lastIndexOf('@');
      return { key, templateId: key.slice(0, at), lengthMm: Number(key.slice(at + 1)) };
    });
    const VITRINE_LINES = new Set(['handle_standard', 'led_display', 'glass_front', 'hinge_alu_frame']);
    /*
     * ПОЛКА КЛАДОВКИ НАД ХОЛОДИЛЬНИКОМ (ЭТАП 4). Наполнение кладовки считалось
     * по оболочке без нижнего ряда — по высоте антресоли 500, и полка стояла на
     * 256 в корпусе 300. Теперь она на 160, и отпечаток таких рядов законно
     * другой. Расхождение принимается, только если ВСЁ оно — эта полка: ряд с
     * полкой кладовки, разложенной по прежней оболочке, даёт отпечаток эталона
     * до символа, а смета та же до строки. Число таких — явно.
     */
    /*
     * ОПОРНЫЕ ПОЛКИ ОДИНОЧНОГО ПРИБОРА В ПЕНАЛЕ (ЭТАП 4). Прибор висел в
     * воздухе: наполнения у пенала не было, ниша садилась мимо сетки 32. Теперь
     * полка под прибором и над ним — в наполнении, раскрое и сцене, ниша — на
     * отверстиях (608 вместо 595: фасады над и под ней на 13 мм короче). Ряд с
     * прежним (пустым) наполнением пенала даёт отпечаток эталона.
     */
    const pencils = (run: Run) => run.modules.filter((unit) => singleNicheOf(unit, moduleCarcassHeightMm(unit, run)) !== null);
    const withLegacyStorageShelf = (run: Run): string =>
      runFingerprint({
        ...run,
        modules: run.modules.map((unit) =>
          unit.fill && singleNicheOf(unit, moduleCarcassHeightMm(unit, run)) ? { ...unit, fill: { ...unit.fill, shelves: [] } } : unit,
        ),
        upperSegments: run.upperSegments.map((segment) => ({
          ...segment,
          modules: segment.modules.map((unit) =>
            unit.section === 'mezzanine' && unit.fill && mezzanineBaseOf(unit, run)?.appliance === 'fridge'
              ? {
                  ...unit,
                  fill: {
                    ...unit.fill,
                    shelves: defaultFill(unit, {
                      zone: run.zone,
                      ceilingHeightMm: run.ceilingHeightMm,
                      options: run.options,
                      beams: run.beams,
                      production: run.production,
                    }).shelves,
                  },
                }
              : unit,
          ),
        })),
      });
    let storageShelf = 0;
    let supports = 0;
    /* Строки, которые двигают опоры пенала: полки, кромка их передних торцов, распил и фасады над и под нишей. */
    const SUPPORT_LINES = new Set(['shelf_panel', 'pvc_edge', 'cutting', 'front_panel']);
    const SUPPORT_AREA_M2 = (566 * 540 * 2) / 1e6;
    let same = 0;
    let legacy = 0;
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const { key, templateId, lengthMm } of keys) {
      if (seen.has(key)) continue;
      seen.add(key);
      const was = baseline[key];
      const run = baselineRun(templateId, lengthMm);
      const now = baselineEntry(run);
      if (!was) {
        problems.push(`${key}: в эталоне нет`);
        continue;
      }
      if ('refused' in was || 'refused' in now) {
        if (!('refused' in was && 'refused' in now)) problems.push(`${key}: ${'refused' in was ? 'не собиралась' : 'собиралась'}, а теперь ${'refused' in now ? 'не собирается' : 'собирается'}`);
        continue;
      }
      const vitrine = !('refused' in run) && allModules(run).some((unit) => vitrineOf(unit));
      if (was.fingerprint !== now.fingerprint) {
        if (!('refused' in run) && withLegacyStorageShelf(run) === was.fingerprint) storageShelf += 1;
        else problems.push(`${key}: отпечаток ${was.fingerprint} → ${now.fingerprint}`);
      }
      if (!vitrine) {
        const pencilCount = 'refused' in run ? 0 : pencils(run).length;
        if (was.total !== now.total || JSON.stringify(was.lines) !== JSON.stringify(now.lines)) {
          const changed = Array.from(new Set([...Object.keys(was.lines), ...Object.keys(now.lines)])).filter((line) => was.lines[line] !== now.lines[line]);
          const shelfDelta = (now.lines.shelf_panel ?? 0) - (was.lines.shelf_panel ?? 0);
          if (pencilCount > 0 && changed.every((line) => SUPPORT_LINES.has(line)) && Math.abs(shelfDelta - SUPPORT_AREA_M2 * pencilCount) <= 0.011) supports += 1;
          else problems.push(`${key}: без витрины, а смета другая (${was.total} → ${now.total}; ${changed.join(', ')})`);
        } else same += 1;
        continue;
      }
      legacy += 1;
      const changed = Array.from(new Set([...Object.keys(was.lines), ...Object.keys(now.lines)])).filter((line) => was.lines[line] !== now.lines[line]);
      const stray = changed.filter((line) => !VITRINE_LINES.has(line));
      if (stray.length > 0) problems.push(`${key}: у прежней витрины сдвинулись чужие строки ${stray.join(', ')}`);
    }
    check(
      'P1.20 старые объекты: из 99 конфигураций эталона f2fbf9d без витрин — тот же отпечаток и та же смета до строки; с прежней витриной — тот же отпечаток, а сдвинуты только строки витрины (ручка двери, лента по полосам сцены, стекло по размеру двери, петли под рамку)',
      problems.length === 0 && seen.size === 99 && same + supports + legacy === 99 && legacy === 6 && storageShelf === STORAGE_SHELF_SHIFTED && supports === PENCIL_SUPPORTS_ADDED,
      `конфигураций ${seen.size}: без витрин тех же ${same}, с опорами пенала ${supports} (объявлено ${PENCIL_SUPPORTS_ADDED}), с прежней витриной ${legacy}; отпечаток сдвинут только полкой кладовки и опорами пенала у ${storageShelf} (объявлено ${STORAGE_SHELF_SHIFTED}) · ${problems.slice(0, 3).join(' | ') || 'расхождений нет'}`,
    );
  }
}

/* Отдельный запуск — свой счёт. */
const direct = process.argv[1] && /verify-p1-vitrines\.ts$/.test(process.argv[1]);
if (direct) {
  let passed = 0;
  let failed = 0;
  p1VitrineChecks((name, condition, detail) => {
    if (condition) passed += 1;
    else failed += 1;
    console[condition ? 'log' : 'error'](`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
  });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}
