/**
 * ПРИЁМКА «РУЧКА И ПЕТЛИ ДЕТАЛИ» (FINAL MASTER STAGE, фаза 2, LP1–LP10). Входит в `npm run test:hardware`.
 *
 * Путь экрана: `workspaceInput` → `objectInput` → `composeVariants` → `applyOps` — демо-кухня, дверца
 * `base-1200@w1` (деталь 446 × 716) и ящики. Правки — те же операции, что шлёт блок «Ручка и петли детали»
 * (`set_handle_at`, `set_handle_custom`, `set_hinges`); ручка в сцене — коробка `runBoxes`, присадка —
 * `drillingPlan`, смета — та же, что у экрана.
 */

import { DEFAULT_PRODUCTION, type CatalogEntryFull, type DrillingSettings, type HardwareItem, type ProductionSettings } from '../types/catalog';
import type { MillworkOp, Module, Run, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput, panelWallsOf, wallSegments } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { allModules } from '../lib/millwork/layout';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { drillingPlan, type DrillPart } from '../lib/millwork/drillingPlan';
import { frontCutsOf, runBoxes, type PartBox } from '../lib/millwork/cabinetBoxes';
import { runFingerprint } from '../lib/millwork/fingerprint';

type Check = (name: string, ok: boolean, detail?: string) => void;
let passed = 0;
let failed = 0;
const own: Check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
};

const CATALOG = hardwareCatalog(
  HARDWARE_FACTS.map((fact) => {
    const row = hardwareCatalogRow(fact);
    return {
      id: `hw:${fact.article}`, org_id: 'org', category_id: 'cat', article: row.article, name_ru: row.name_ru, name_kk: row.name_kk, description: '',
      price: 0, unit: row.unit, dimensions: {}, tiling: {}, meta: { hardware: fact.hardware }, is_active: true, assets: [],
    } as unknown as CatalogEntryFull;
  }),
);
const item = (article: string): HardwareItem => {
  const found = CATALOG.get(`hw:${article}`);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: ${article} нет в фактах`);
  return found;
};
const RULES: DrillingSettings = {
  hingeEdgeMm: 100,
  hingeCount: [
    { upToMm: 900, hinges: 2 },
    { upToMm: 1600, hinges: 3 },
  ],
  plateOnCupAxis: true,
  handleHoleMm: 5,
  handlePlaceConfirmed: false,
  shelfSupport: { frontMm: 37, backMm: 37 },
  confirmat: { faceDiameterMm: 7, edgeDiameterMm: 5, edgeDepthMm: 50, fromFrontMm: 50, fromBackMm: 50 },
  minRemainMm: 3,
  confirmed: true,
};
const P: ProductionSettings = { ...DEFAULT_PRODUCTION, drilling: RULES };
const DOOR = 'base-1200@w1';
const DRAWERS = 'base-3300@w1';
const BAR = 'MFR-BOYARD-RS043BL.4/320';

function kitchen() {
  const base = workspaceInput({ title: 'LEAF', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production: P, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: CATALOG });
  const disabled = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
  let edited: Partial<Record<VariantKey, Run>> = {};
  const variant = () => composeVariants(input, disabled, edited).find((v) => v.key === 'optimal')!;
  const shown = () => variant().run;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown(), requirements: DEMO_REQUIREMENTS, ops: list, openings: input.openings, hardware: CATALOG });
    /* Как экран: правка с примечанием (сняли своё место) записывается; отказ ряд не меняет. */
    if (next.warnings.length === 0 || next.fingerprint !== shown().fingerprint) edited = { optimal: next };
    return next;
  };
  const plan = () => drillingPlan({ walls: panelWallsOf(null, wallSegments(null, shown(), {}), input.runWallId), production: P, hardware: CATALOG });
  return { shown, ops, plan, estimate: () => variant().estimate };
}
const unitOf = (run: Run, id: string): Module => {
  const u = allModules(run).find((m) => m.id === id);
  if (!u) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${id} нет`);
  return u;
};
const boxes = (run: Run) => runBoxes(run, { thicknessMm: P.carcassMm, frontThicknessMm: P.frontMm, gapMm: P.frontGapMm, hardware: CATALOG, production: P } as never) as PartBox[];
const handleOf = (run: Run, part: string): PartBox => {
  const found = boxes(run).find((b) => b.node === 'handle' && b.part === part);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: ручки ${part} в сцене нет`);
  return found;
};
/** Полотно детали в сцене — фасад `part` (коробка `front` с тем же ключом). */
const leafOf = (run: Run, part: string): PartBox => {
  const found = boxes(run).find((b) => b.material === 'front' && b.part === part && !b.node);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: фасада ${part} в сцене нет`);
  return found;
};
/** Ось ручки в мм от левого нижнего угла детали — по нарисованному. */
const handleOnLeaf = (run: Run, part: string) => {
  const h = handleOf(run, part);
  const l = leafOf(run, part);
  return {
    x: Math.round((h.position[0] - (l.position[0] - l.scale[0] / 2)) * 1000),
    y: Math.round((h.position[1] - (l.position[1] - l.scale[1] / 2)) * 1000),
    vertical: h.scale[1] > h.scale[0],
  };
};
const partOf = (plan: ReturnType<ReturnType<typeof kitchen>['plan']>, moduleId: string, role: DrillPart['role'], leaf?: string): DrillPart => {
  const found = plan.parts.find((p) => p.moduleId === moduleId && p.role === role && (leaf === undefined || p.leaf === leaf));
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: детали ${role} ${leaf ?? ''} модуля ${moduleId} в присадке нет`);
  return found;
};

export function leafPartsChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nРУЧКА И ПЕТЛИ ДЕТАЛИ: своё место ручки, своя скоба, высоты петель — сцена, присадка, смета');

  const k = kitchen();
  const run0 = k.shown();
  const part = `${DOOR}:door:0`;
  const cut = frontCutsOf(run0, P, CATALOG).get(part);
  if (!cut) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: детали двери base-1200@w1 нет');
  const fp0 = runFingerprint(run0);

  /* LP1 — ручка производителя и своё место: в сцене ось ручки там, где поставили; отпечаток другой; «По правилу» — назад. */
  k.ops([{ op: 'set_fitting', moduleId: DOOR, slot: 'handle', itemId: `hw:${BAR}` }]);
  const runA = k.shown();
  const before = handleOnLeaf(runA, part);
  const fpA = runFingerprint(runA);
  const w1 = k.ops([{ op: 'set_handle_at', moduleId: DOOR, leaf: 'door:0', xMm: 60, yMm: 450, turn: 'vertical' }]);
  const runB = k.shown();
  const placed = handleOnLeaf(runB, part);
  check(
    `LP1 RS043BL.4/320 на двери ${cut.widthMm} × ${cut.lengthMm}: своё место 60 / 450 — ось ручки в сцене там же, планка вертикальна; отпечаток другой`,
    w1.warnings.length === 0 && placed.x === 60 && placed.y === 450 && placed.vertical && runFingerprint(runB) !== fpA,
    `по правилу ${before.x}/${before.y} → своё ${placed.x}/${placed.y} · ${fpA} → ${runFingerprint(runB)}`,
  );

  /* LP2 — ручка за край: отказ с мм, ряд прежний. */
  const fpB = runFingerprint(runB);
  const r2 = k.ops([{ op: 'set_handle_at', moduleId: DOOR, leaf: 'door:0', xMm: 5, yMm: 450, turn: 'vertical' }]);
  const r2b = k.ops([{ op: 'set_handle_at', moduleId: DOOR, leaf: 'door:0', xMm: 200, yMm: 600, turn: 'vertical' }]);
  check(
    'LP2 ручка за край детали — отказ «выходит за деталь слева / сверху на N мм», ряд прежний',
    /выходит за деталь слева на [\d.]+ мм/.test(r2.warnings[0] ?? '') && /сверху на [\d.]+ мм/.test(r2b.warnings[0] ?? '') && runFingerprint(k.shown()) === fpB,
    `${r2.warnings[0]} | ${r2b.warnings[0]}`,
  );

  /* LP3 — присадка за ручкой: два сквозных Ø5 (правило цеха), середина — своё место, между ними межосевое 320. */
  const plan3 = k.plan();
  const door3 = partOf(plan3, DOOR, 'door', 'door:0');
  const holes = door3.ops.filter((o) => o.role === 'handle');
  const mid = holes.length === 2 ? { a: (holes[0].xMm + holes[1].xMm) / 2, b: (holes[0].yMm + holes[1].yMm) / 2 } : null;
  const gap = holes.length === 2 ? Math.hypot(holes[0].xMm - holes[1].xMm, holes[0].yMm - holes[1].yMm) : NaN;
  check(
    'LP3 присадка ручки — по своему месту: 2 отверстия Ø5 насквозь, межосевое 320, середина = 60 / 450 на детали; место «задано на детали», правило места цеху не нужно',
    holes.length === 2 && holes.every((o) => o.diameterMm === 5) && Math.abs(gap - 320) < 0.01 && mid !== null &&
      ((Math.abs(mid.a - 450) < 0.01 && Math.abs(mid.b - 60) < 0.01) || (Math.abs(mid.a - 60) < 0.01 && Math.abs(mid.b - 450) < 0.01)) &&
      holes.every((o) => /задано на детали/.test(o.source)),
    `отверстий ${holes.length} · ${holes.map((o) => `${o.xMm}/${o.yMm}`).join(', ')} · ${holes[0]?.source ?? door3.pending.map((p) => p.why.join(' ')).join(' | ')}`,
  );
  k.ops([{ op: 'set_handle_at', moduleId: DOOR, leaf: 'door:0', reset: true }]);
  const back = handleOnLeaf(k.shown(), part);
  check(
    '«По правилу» — ручка на месте правила, отпечаток как до своего места',
    back.x === before.x && back.y === before.y && runFingerprint(k.shown()) === fpA && unitOf(k.shown(), DOOR).handleAt === undefined,
    `${back.x}/${back.y}`,
  );

  /* LP4 — фронт ящика: своё место и горизонтальная планка по умолчанию. */
  const v4 = k.ops([{ op: 'set_variant', moduleId: DRAWERS, variant: 'drawers' }]);
  if (v4.warnings.length > 0) throw new Error(`ящики на base-3300@w1 не встали: ${v4.warnings.join(' | ')}`);
  const drawerPart = `${DRAWERS}:drawer:0`;
  const dCut = frontCutsOf(k.shown(), P, CATALOG).get(drawerPart);
  if (!dCut) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: фронта ящика base-3300@w1 нет');
  const w4 = k.ops([{ op: 'set_handle_at', moduleId: DRAWERS, leaf: 'drawer:0', xMm: Math.round(dCut.widthMm / 2), yMm: Math.round(dCut.lengthMm) - 40 }]);
  const d4 = handleOnLeaf(k.shown(), drawerPart);
  check(
    `LP4 фронт ящика ${dCut.widthMm} × ${dCut.lengthMm}: своё место у верхней кромки — в сцене там же, планка горизонтальна`,
    w4.warnings.length === 0 && d4.x === Math.round(dCut.widthMm / 2) && d4.y === Math.round(dCut.lengthMm) - 40 && !d4.vertical,
    `${d4.x}/${d4.y} ${d4.vertical ? 'вертикально' : 'горизонтально'} · ${w4.warnings.join(' | ')}`,
  );

  /* LP5 — своя скоба без позиции: длина и покрытие в сцене; присадки нет словами; длина вне 64…1200 и длиннее детали — отказ. */
  const w5 = k.ops([{ op: 'set_handle_custom', moduleId: DRAWERS, lengthMm: 300, finish: 'black_matte' }]);
  const h5 = handleOf(k.shown(), drawerPart).handle!;
  const pend5 = partOf(k.plan(), DRAWERS, 'drawer_front', 'drawer:0').pending.flatMap((p) => p.why).join(' ');
  const r5a = k.ops([{ op: 'set_handle_custom', moduleId: DRAWERS, lengthMm: 40 }]);
  const r5b = k.ops([{ op: 'set_handle_custom', moduleId: DRAWERS, lengthMm: 900 }]);
  check(
    'LP5 своя скоба 300 мм, чёрный матовый: в сцене 300 мм и покрытие; присадки нет — «не подтверждено для производства»; 40 мм и 900 мм — отказ',
    w5.warnings.length === 0 && Math.round(h5.model.lengthMm) === 300 && h5.model.finish === 'black_matte' &&
      /своя скоба 300 мм без артикула — не подтверждено для производства/.test(pend5) &&
      /от 64 до 1200 мм/.test(r5a.warnings[0] ?? '') && /не помещается на деталь/.test(r5b.warnings[0] ?? ''),
    `${Math.round(h5.model.lengthMm)} ${h5.model.finish} · «${pend5.slice(0, 120)}» · ${r5a.warnings[0]} | ${r5b.warnings[0]}`,
  );

  /* LP6 — свои петли: три по высоте — в смете на одну больше, в сцене три узла, присадка чашек на этих высотах. */
  k.ops([
    { op: 'set_fitting', moduleId: DOOR, slot: 'hinge', itemId: 'hw:MFR-BLUM-71B3550' },
    { op: 'set_fitting', moduleId: DOOR, slot: 'hinge_plate', itemId: 'hw:MFR-BLUM-173L8130' },
  ]);
  const hingesBefore = k.estimate().lines.filter((l) => /^hinge/.test(l.key) || l.title.includes('71B3550')).reduce((s, l) => s + l.quantity, 0);
  const cupsBefore = partOf(k.plan(), DOOR, 'door', 'door:0').ops.filter((o) => o.role === 'hinge_cup' || /cup/.test(o.id)).length;
  /* Средняя петля — в стороне от полок модуля: узел в полке — отказ (LP7). */
  const shelves6 = unitOf(k.shown(), DOOR).fill?.shelves ?? [];
  const mid6 = [200, 260, 450, 500, 550].find((h) => shelves6.every((sh) => Math.abs(P.frontGapMm / 2 + h - sh) > 60)) ?? 200;
  const want6 = [90, mid6, cut.lengthMm - 90];
  const w6 = k.ops([{ op: 'set_hinges', moduleId: DOOR, leaf: 'door:0', heightsMm: want6 }]);
  const run6 = k.shown();
  const hingesAfter = k.estimate().lines.filter((l) => /^hinge/.test(l.key) || l.title.includes('71B3550')).reduce((s, l) => s + l.quantity, 0);
  const nodes6 = boxes(run6).filter((b) => b.node === 'hinge' && b.part === part).length;
  const cups6 = partOf(k.plan(), DOOR, 'door', 'door:0').ops.filter((o) => o.role === 'hinge_cup' || /cup/.test(o.id));
  const cupX = cups6.map((o) => o.xMm).sort((a, b) => a - b);
  check(
    `LP6 петли ${want6.join(' / ')}: в смете на 1 больше, в сцене узлов на дверце больше, чашки Ø35 на этих высотах (проект — правило цеха не нужно)`,
    w6.warnings.length === 0 && hingesAfter === hingesBefore + 1 && nodes6 > 0 && cups6.length === 3 && cupX.join('/') === want6.join('/') && cupsBefore === 2,
    `смета ${hingesBefore} → ${hingesAfter} · узлов ${nodes6} · чашки ${cupsBefore} → ${cupX.join('/')} · ${w6.warnings.join(' | ')}`,
  );

  /* LP7 — петли, которые не встают: за низ, друг на друге, одна, в полку. */
  const shelf = unitOf(k.shown(), DOOR).fill?.shelves?.[0];
  const fp7 = runFingerprint(k.shown());
  const r7 = [
    k.ops([{ op: 'set_hinges', moduleId: DOOR, leaf: 'door:0', heightsMm: [10, 600] }]).warnings[0] ?? '',
    k.ops([{ op: 'set_hinges', moduleId: DOOR, leaf: 'door:0', heightsMm: [300, 320] }]).warnings[0] ?? '',
    k.ops([{ op: 'set_hinges', moduleId: DOOR, leaf: 'door:0', heightsMm: [300] }]).warnings[0] ?? '',
    shelf !== undefined ? (k.ops([{ op: 'set_hinges', moduleId: DOOR, leaf: 'door:0', heightsMm: [100, shelf] }]).warnings[0] ?? '') : 'нет полки',
  ];
  check(
    'LP7 петли, которые не встают — отказ словами: чашка за низом, чашки друг на друге, одна петля, узел в полке; ряд прежний',
    /выходит за низ двери/.test(r7[0]) && /заходят друг на друга/.test(r7[1]) && /не меньше двух/.test(r7[2]) && /встаёт в полку/.test(r7[3]) && runFingerprint(k.shown()) === fp7,
    r7.join(' | '),
  );

  /* LP8 — подъёмник: петель нет, высоты не задаются. */
  const upCut = frontCutsOf(k.shown(), P, CATALOG).get('upper-1200@w1:door:0');
  if (!upCut) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: двери upper-1200@w1 нет');
  const r8 = k.ops([{ op: 'set_hinges', moduleId: 'upper-1200@w1', leaf: 'door:0', heightsMm: [90, upCut.lengthMm - 90] }]);
  k.ops([{ op: 'set_opening', moduleId: 'upper-1200@w1', opening: 'lift' }]);
  const r8b = k.ops([{ op: 'set_hinges', moduleId: 'upper-1200@w1', leaf: 'door:0', heightsMm: [90, upCut.lengthMm - 90] }]);
  const lifted = unitOf(k.shown(), 'upper-1200@w1');
  check(
    'LP8 у створки на петлях свои высоты ставятся; перевели на подъёмник — они сняты словами; у подъёмника — отказ «не на петлях»',
    r8.warnings.length === 0 && lifted.hingeAt === undefined && /не на петлях/.test(r8b.warnings[0] ?? ''),
    `${r8.warnings.join(' | ') || 'встали'} | ${r8b.warnings[0]}`,
  );

  /* LP9 — дверцу сменили на ящики: своё место ручки и петли двери сняты словами. */
  const before9 = k.shown();
  const u9 = unitOf(before9, DOOR);
  const after9 = applyOps({
    run: before9,
    requirements: DEMO_REQUIREMENTS,
    ops: [
      { op: 'set_handle_at', moduleId: DOOR, leaf: 'door:0', xMm: 200, yMm: 400 },
      { op: 'set_variant', moduleId: DOOR, variant: 'drawers' },
    ],
    hardware: CATALOG,
  });
  const u9b = unitOf(after9, DOOR);
  check(
    'LP9 дверца → ящики: своё место ручки и петли двери сняты, причина словами',
    u9.hingeAt?.['door:0'] !== undefined && u9b.handleAt?.['door:0'] === undefined && u9b.hingeAt?.['door:0'] === undefined && after9.warnings.some((w) => /место ручки «door:0», петли «door:0» сняты — такой детали или петель у модуля больше нет/.test(w)),
    `${after9.warnings.join(' | ')} · было петель ${JSON.stringify(u9.hingeAt ?? null)}`,
  );

  /* LP10 — ряд без своих мест — отпечаток прежний (пусто не пишется). */
  check('LP10 ряд без своих мест ручки и петель — отпечаток прежний', runFingerprint(run0) === fp0, fp0);

  return { passed, failed };
}

if (process.argv[1]?.includes('verify-leaf-parts')) {
  const r = leafPartsChecks();
  console.log(`\n${r.passed} passed, ${r.failed} failed`);
  if (r.failed > 0) process.exit(1);
}
