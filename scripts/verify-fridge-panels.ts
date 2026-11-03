/**
 * ПРИЁМКА ПЛАНОК ХОЛОДИЛЬНИКА — ЛЕВОЙ И ПРАВОЙ (FINAL MASTER STAGE, фаза 5, FP1–FP10). В `npm run test:hardware`.
 *
 * Путь экрана: `workspaceInput` → `objectInput` → `composeVariants` → `applyOps` с `set_fridge_panel` — то, что шлёт
 * блок «Планки холодильника» в инспекторе Studio. Демо-кухня: встроенный холодильник у левой стены, над ним
 * кладовка (2400…2700). Меряется то, что видят цех и сцена: детали раскроя, коробки сцены, створки на ходу,
 * смета, присадка, модель прибора, карта раскроя, запись туда и обратно.
 */

import { DEFAULT_PRODUCTION, TYPICAL_CUTTING, type CatalogEntryFull, type CuttingSettings } from '../types/catalog';
import type { MillworkOp, Module, Panel, Run, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput, panelWallsOf } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { runBoxesByModule, sceneLeaves, type PartBox } from '../lib/millwork/cabinetBoxes';
import { buildPanels, objectPanels, panelMaterials } from '../lib/millwork/panels';
import { runFingerprint } from '../lib/millwork/fingerprint';
import { allModules } from '../lib/millwork/layout';
import { drillingBlockers, drillingPlan } from '../lib/millwork/drillingPlan';
import { moduleCarcassHeightMm, moduleDepthMm } from '../lib/millwork/fill';
import { plinthMm } from '../lib/millwork/shop';
import { stageFourModelsOf } from '../lib/millwork/cookingStack';
import { cuttingPlan } from '../lib/millwork/cutting';

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
const P = DEFAULT_PRODUCTION;
const SHEETS: CuttingSettings = {
  ...TYPICAL_CUTTING,
  sheets: [
    { stock: 'ldsp:16', lengthMm: 2800, widthMm: 2070 },
    { stock: 'ldsp:18', lengthMm: 2800, widthMm: 2070 },
    { stock: 'hdf:3', lengthMm: 2800, widthMm: 2070 },
  ],
  confirmed: true,
};

function kitchen(requirements = DEMO_REQUIREMENTS) {
  const base = workspaceInput({ title: 'FP', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements, rates: DEMO_RATES, production: P, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: CATALOG });
  const disabled = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
  let edited: Partial<Record<VariantKey, Run>> = {};
  const variant = () => composeVariants(input, disabled, edited).find((v) => v.key === 'optimal')!;
  const shown = () => variant().run;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown(), requirements, ops: list, openings: input.openings, hardware: CATALOG });
    if (next.warnings.length === 0) edited = { optimal: next };
    return next;
  };
  return { shown, ops, estimate: () => variant().estimate, restore: (run: Run) => (edited = { optimal: run }) };
}

const fridgeOf = (run: Run): Module => {
  const found = run.modules.find((m) => m.appliance === 'fridge');
  if (!found) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: холодильника в нижнем ряду нет');
  return found;
};
const boxesOf = (run: Run, id: string): PartBox[] => {
  const boxes = runBoxesByModule(run, { thicknessMm: P.carcassMm, frontThicknessMm: P.frontMm, gapMm: P.frontGapMm, production: P, hardware: CATALOG }).modules.find((e) => e.unit.id === id)?.boxes;
  if (!boxes || boxes.length === 0) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: коробок модуля ${id} нет`);
  return boxes;
};
const panelsOf = (run: Run, id: string): Panel[] => buildPanels({ run, production: P }).filter((p) => p.moduleId === id);
const named = (list: Panel[], name: string) => list.filter((p) => p.name === name);
const mm = (m: number) => Math.round(m * 10000) / 10;
const line = (lines: { key: string; quantity: number }[], key: string) => lines.find((l) => l.key === key)?.quantity ?? 0;

export function fridgePanelChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nПЛАНКИ ХОЛОДИЛЬНИКА: левая и правая, размеры, 3D, деталировка, раскрой, смета, присадка');

  const k = kitchen();
  const run0 = k.shown();
  const fridge0 = fridgeOf(run0);
  const ID = fridge0.id;
  const W0 = fridge0.widthMm;
  const fp0 = run0.fingerprint;
  const depth = moduleDepthMm(fridge0, run0.zone, run0.production);
  const full = moduleCarcassHeightMm(fridge0, run0) + plinthMm(P);
  const panels0 = panelsOf(run0, ID);
  const est0 = k.estimate().lines;
  const mat0 = panelMaterials(buildPanels({ run: run0, production: P }));
  const leaves0 = sceneLeaves(fridge0, moduleCarcassHeightMm(fridge0, run0) / 1000, undefined, 0, P);
  const box0 = boxesOf(run0, ID);
  const neighbors0 = run0.modules.filter((m) => m.id !== ID).map((m) => `${m.id}@${m.offsetMm}+${m.widthMm}`).join(',');

  /* FP1 — левая декоративная по умолчанию: модуль шире на толщину фасада, ядро холодильника то же, деталь — фасадный лист. */
  const r1 = k.ops([{ op: 'set_fridge_panel', moduleId: ID, side: 'left', panel: { kind: 'decorative' } }]);
  const run1 = k.shown();
  const f1 = fridgeOf(run1);
  const p1 = panelsOf(run1, ID);
  const left1 = named(p1, 'Планка холодильника левая');
  const stay = (r: Run): string => r.modules.filter((m) => m.appliance === 'sink600' || m.appliance === 'sink800' || m.appliance === 'hob' || m.appliance === 'dishwasher45' || m.appliance === 'dishwasher60').map((m) => `${m.appliance}@${m.offsetMm}+${m.widthMm}`).join(',');
  const uppers = (r: Run) => r.upperSegments.flatMap((sg) => sg.modules).length;
  const coreRows0 = panels0.map((p) => `${p.name}:${p.lengthMm}x${p.widthMm}x${p.qty}`).sort().join('|');
  const coreRows1 = p1.filter((p) => !p.name.startsWith('Планка холодильника')).map((p) => `${p.name}:${p.lengthMm}x${p.widthMm}x${p.qty}`).sort().join('|');
  check(
    `FP1 левая декоративная: модуль ${W0} → ${W0 + P.frontMm} мм, детали холодильника те же (${panels0.length} строк), планка ${full} × ${depth} × ${P.frontMm} из листа фасада; мойка, ПММ и варочная на местах, верхних модулей столько же; отпечаток другой`,
    r1.warnings.length === 0 && f1.widthMm === W0 + P.frontMm && f1.sidePanels?.left?.kind === 'decorative' && coreRows0 === coreRows1 &&
      left1.length === 1 && left1[0].lengthMm === full && left1[0].widthMm === depth && left1[0].thicknessMm === P.frontMm &&
      left1[0].material.startsWith('Фасад') && run1.fingerprint !== fp0 && stay(run1) === stay(run0) && uppers(run1) === uppers(run0),
    `${f1.widthMm} · мойка, ПММ, варочная ${stay(run0) === stay(run1) ? 'на местах' : `${stay(run0)} → ${stay(run1)}`} · верхних ${uppers(run0)} → ${uppers(run1)} · ${left1.map((p) => `${p.material} ${p.lengthMm}×${p.widthMm}×${p.thicknessMm}`).join(';')} · ${r1.warnings.join(' | ')}`,
  );

  /* FP2 — сцена: ядро сдвинуто на левую планку, планка у левого края модуля от пола; створки холодильника — там же, где ядро. */
  const box1 = boxesOf(run1, ID);
  const plank = box1.find((b) => b.panel === 'Планка холодильника левая');
  const core1 = box1.filter((b) => b.panel !== 'Планка холодильника левая');
  const shifted = core1.length === box0.length && core1.every((b, i) => Math.abs(b.position[0] - box0[i].position[0] - P.frontMm / 1000) < 1e-9 && b.position[1] === box0[i].position[1]);
  const leaves1 = sceneLeaves(f1, moduleCarcassHeightMm(f1, run1) / 1000, undefined, 0, P);
  const leavesShifted =
    leaves1.length === leaves0.length && leaves0.length > 0 &&
    leaves1.every((l, i) => l.kind === 'door' && leaves0[i].kind === 'door' && Math.abs(l.xM - (leaves0[i] as { xM: number }).xM - P.frontMm / 1000) < 1e-9 && Math.abs(l.widthM - (leaves0[i] as { widthM: number }).widthM) < 1e-9);
  const plankBottom = plank ? mm(plank.position[1] - plank.scale[1] / 2) : NaN;
  check(
    `FP2 сцена: ${box0.length} коробок холодильника сдвинуты на ${P.frontMm} мм, планка — у левого края от пола (низ ${plankBottom} мм, высота ${plank ? mm(plank.scale[1]) : '—'}), створки (${leaves0.length}) — по ядру`,
    Boolean(plank) && shifted && Math.abs((plank?.position[0] ?? 0) - P.frontMm / 2000) < 1e-9 && Math.abs(plankBottom + plinthMm(P)) < 0.05 + plinthMm(P) && leavesShifted,
    `планка x ${plank ? mm(plank.position[0]) : '—'} мм, низ от пола ${plank ? mm(plank.position[1] - plank.scale[1] / 2) + plinthMm(P) : '—'}; створки ${leaves1.map((l) => (l.kind === 'door' ? `${mm(l.xM)}+${mm(l.widthM)}` : l.kind)).join(',')}`,
  );

  /* FP3 — правая конструктивная своих размеров: корпусная плита, глубина и отступ свои; модуль шире на обе планки. */
  const r3 = k.ops([{ op: 'set_fridge_panel', moduleId: ID, side: 'right', panel: { kind: 'constructive', thicknessMm: 18, depthMm: 500, setbackMm: 20, heightMm: 2000 } }]);
  const run3 = k.shown();
  const f3 = fridgeOf(run3);
  const right3 = named(panelsOf(run3, ID), 'Планка холодильника правая');
  const rb = boxesOf(run3, ID).find((b) => b.panel === 'Планка холодильника правая');
  check(
    'FP3 правая конструктивная 18 мм, глубина 500, отступ 20, высота 2000: деталь «ЛДСП 16» 2000 × 500 × 18; в сцене — у правого края, лицом на 20 мм за фасадом; модуль шире на обе',
    r3.warnings.length === 0 && f3.widthMm === W0 + P.frontMm + 18 && right3.length === 1 && right3[0].lengthMm === 2000 && right3[0].widthMm === 500 && right3[0].thicknessMm === 18 &&
      right3[0].material === 'ЛДСП 18' && Boolean(rb) && Math.abs((rb?.position[0] ?? 0) - (f3.widthMm - 9) / 1000) < 1e-9 && Math.abs((rb?.position[2] ?? 0) + 0.27) < 1e-9 &&
      Math.abs((rb?.scale[1] ?? 0) - 2) < 1e-9,
    `${f3.widthMm} · ${right3.map((p) => `${p.material} ${p.lengthMm}×${p.widthMm}×${p.thicknessMm}`).join(';')} · z ${rb ? mm(rb.position[2]) : '—'} · ${r3.warnings.join(' | ')}`,
  );

  /* FP3б — правка размера без смены ширины (глубина 500 → 480) — другая деталь, другой отпечаток. */
  const fp3 = run3.fingerprint;
  const r3b = k.ops([{ op: 'set_fridge_panel', moduleId: ID, side: 'right', panel: { kind: 'constructive', thicknessMm: 18, depthMm: 480, setbackMm: 20, heightMm: 2000 } }]);
  const run3b = k.shown();
  check(
    'FP3б глубина правой 500 → 480: ширина модуля та же, деталь 2000 × 480, отпечаток другой',
    r3b.warnings.length === 0 && fridgeOf(run3b).widthMm === f3.widthMm && named(panelsOf(run3b, ID), 'Планка холодильника правая')[0]?.widthMm === 480 && run3b.fingerprint !== fp3,
    `${fp3} → ${run3b.fingerprint}`,
  );
  k.ops([{ op: 'set_fridge_panel', moduleId: ID, side: 'right', panel: { kind: 'constructive', thicknessMm: 18, depthMm: 500, setbackMm: 20, heightMm: 2000 } }]);

  /* FP4 — переключатели независимы: сняли левую — правая на месте, модуль уже на левую. */
  const r4 = k.ops([{ op: 'set_fridge_panel', moduleId: ID, side: 'left', panel: null }]);
  const run4 = k.shown();
  const f4 = fridgeOf(run4);
  check(
    'FP4 сняли левую — правая осталась, модуль уже ровно на левую, деталей левой нет ни в раскрое, ни в сцене',
    r4.warnings.length === 0 && !f4.sidePanels?.left && f4.sidePanels?.right?.thicknessMm === 18 && f4.widthMm === W0 + 18 &&
      named(panelsOf(run4, ID), 'Планка холодильника левая').length === 0 && !boxesOf(run4, ID).some((b) => b.panel === 'Планка холодильника левая'),
    `${f4.widthMm} ${JSON.stringify(f4.sidePanels)}`,
  );

  /* FP5 — отказы до записи словами с мм: толщина, перед фасадом, в стену, в кладовку; не холодильник. Ряд прежний. */
  const fp4 = run4.fingerprint;
  const words = [
    k.ops([{ op: 'set_fridge_panel', moduleId: ID, side: 'left', panel: { thicknessMm: 5 } }]).warnings[0] ?? '',
    k.ops([{ op: 'set_fridge_panel', moduleId: ID, side: 'left', panel: { setbackMm: -10 } }]).warnings[0] ?? '',
    k.ops([{ op: 'set_fridge_panel', moduleId: ID, side: 'left', panel: { depthMm: depth, setbackMm: 40 } }]).warnings[0] ?? '',
    k.ops([{ op: 'set_fridge_panel', moduleId: ID, side: 'left', panel: { heightMm: full + 300 } }]).warnings[0] ?? '',
    k.ops([{ op: 'set_fridge_panel', moduleId: run4.modules.find((m) => !m.appliance)!.id, side: 'left', panel: {} }]).warnings[0] ?? '',
  ];
  check(
    'FP5 отказы словами: толщина 5 — «от 8 до 100»; отступ −10 — «дверь холодильника на ходу упрётся»; глубина + отступ — «ушла бы в стену» с мм; выше низа кладовки — «упрётся в кладовку … лишние 300 мм»; не холодильник — отказ; ряд прежний',
    /от 8 до 100/.test(words[0]) && /на ходу упрётся/.test(words[1]) && /на 40 мм — ушла бы в стену/.test(words[2]) &&
      /упрётся в кладовку над холодильником .*лишние 300 мм/.test(words[3]) && /холодильника нет/.test(words[4]) && k.shown().fingerprint === fp4,
    words.join(' | '),
  );

  /*
   * FP6 — смета: декоративная планка — в «Фасадах», конструктивная — в корпусе, кромка — на видимые торцы. Площади
   * считаются от деталей раскроя: сосед, отдавший толщину планки, тоже меняет свои детали, и «планка + ничего» — не правда.
   */
  k.ops([{ op: 'set_fridge_panel', moduleId: ID, side: 'left', panel: { kind: 'decorative' } }]);
  const run6 = k.shown();
  const est6 = k.estimate().lines;
  const all6 = buildPanels({ run: run6, production: P });
  const mat6 = panelMaterials(all6);
  const matNo = panelMaterials(all6.filter((p) => !p.name.startsWith('Планка холодильника')));
  const frontAdd = Math.round((full * depth) / 10_000) / 100;
  const carcAdd = Math.round((2000 * 500) / 10_000) / 100;
  check(
    `FP6 смета: «Фасады» = раскрой, планки в ней — +${frontAdd} м² (левая ${full} × ${depth}), корпус +${carcAdd} м² (правая 2000 × 500), кромка — на их торцы`,
    Math.abs(mat6.frontM2 - matNo.frontM2 - frontAdd) <= 0.011 && Math.abs(mat6.carcassM2 - matNo.carcassM2 - carcAdd) <= 0.011 && mat6.edgeM > matNo.edgeM &&
      Math.abs(line(est6, 'front_panel') - mat6.frontM2) <= 0.011 && Math.abs(line(est6, 'pvc_edge') - mat6.edgeM) <= 0.011 &&
      line(est6, 'front_panel') > line(est0, 'front_panel'),
    `фасады ${mat0.frontM2} → ${mat6.frontM2} (без планок ${matNo.frontM2}; строка ${line(est0, 'front_panel')} → ${line(est6, 'front_panel')}), корпус ${matNo.carcassM2} → ${mat6.carcassM2}, кромка ${matNo.edgeM} → ${mat6.edgeM}`,
  );

  /* FP7 — карта раскроя: обе планки на листах своих групп, выпуск не запирается планками сверх обычного. */
  const parts6 = objectPanels({ walls: panelWallsOf(null, [run6], 'w1'), production: P, milling: new Map(), carcass: new Map() });
  const plan6 = cuttingPlan({ parts: parts6, settings: SHEETS, fingerprint: run6.fingerprint });
  const onSheets = plan6.sheets.flatMap((s) => s.placements.map((pl) => ({ stock: s.groupKey, name: pl.piece.part.name, l: pl.piece.lengthMm, w: pl.piece.widthMm })));
  const lp = onSheets.filter((x) => x.name === 'Планка холодильника левая');
  const rp = onSheets.filter((x) => x.name === 'Планка холодильника правая');
  check(
    'FP7 карта раскроя: левая — на листе фасада 16, правая 18 мм — на листе ЛДСП 18, по одной штуке своих размеров; ошибок раскладки нет',
    lp.length === 1 && rp.length === 1 && lp[0].l === full && lp[0].w === depth && rp[0].l === 2000 && rp[0].w === 500 && /^ldsp:16/.test(lp[0].stock) && /^ldsp:18/.test(rp[0].stock) && plan6.errors.length === 0,
    `${lp.map((x) => `${x.stock} ${x.l}×${x.w}`).join(';')} | ${rp.map((x) => `${x.stock} ${x.l}×${x.w}`).join(';')} · ошибок ${plan6.errors.length}`,
  );

  /* FP8 — присадка: крепление планок — правило цеха не задано, «не рассчитано»; выпуск заперт этим. */
  const plan8 = drillingPlan({ walls: panelWallsOf(null, [run6], 'w1'), production: P, hardware: CATALOG });
  const plankParts = plan8.parts.filter((p) => p.name.startsWith('Планка холодильника'));
  const blockers = drillingBlockers(plan8).filter((b) => /крепление планки холодильника/.test(b.words));
  check(
    'FP8 присадка: у обеих планок отверстий 0 и «крепление планки холодильника — правило цеха не задано»; причина — у цеха',
    plankParts.length === 2 && plankParts.every((p) => p.ops.length === 0 && p.pending.some((x) => /правило цеха не задано/.test(x.why.join(' ')))) &&
      blockers.length === 1 && blockers[0].who === 'shop' && blockers[0].parts === 2 && !plan8.release.open,
    `${plankParts.map((p) => `${p.name}: ${p.ops.length} оп, ${p.pending.map((x) => x.why[0]).join('; ')}`).join(' | ')} · ${blockers.map((b) => `${b.who} ${b.parts}`).join(',')}`,
  );

  /* FP9 — модель прибора: встроенный KIN86AF3M8 стоит по центру ядра, а не модуля с планками. */
  const models = stageFourModelsOf({ ...run6, modules: run6.modules.map((m) => (m.id === ID ? { ...m, applianceModels: { ...(m.applianceModels ?? {}), fridge: 'KIN86AF3M8' } } : m)) }, P);
  const fm = models.find((m) => m.unit.id === ID);
  const f6 = fridgeOf(run6);
  const coreCenter = f6.offsetMm + P.frontMm + (f6.widthMm - P.frontMm - 18) / 2;
  check(
    `FP9 модель KIN86AF3M8 — по центру ядра (${coreCenter} мм), а не модуля с планками (${f6.offsetMm + f6.widthMm / 2} мм)`,
    Boolean(fm) && Math.abs((fm?.xMm ?? 0) - coreCenter) < 1e-9,
    `${fm?.kind} x ${fm?.xMm}`,
  );

  /* FP10 — запись и чтение: планки едут с модулем, ряд тот же; снять обе — модуль прежней ширины, отпечаток прежний, соседи на месте. */
  const saved = JSON.parse(JSON.stringify(run6)) as Run;
  k.restore(saved);
  const back = k.shown();
  const sameBack = runFingerprint(back) === run6.fingerprint && JSON.stringify(fridgeOf(back).sidePanels) === JSON.stringify(f6.sidePanels);
  k.ops([{ op: 'set_fridge_panel', moduleId: ID, side: 'left', panel: null }]);
  k.ops([{ op: 'set_fridge_panel', moduleId: ID, side: 'right', panel: null }]);
  const run10 = k.shown();
  const neighbors10 = run10.modules.filter((m) => m.id !== ID).map((m) => `${m.id}@${m.offsetMm}+${m.widthMm}`).join(',');
  check(
    'FP10 записали и открыли — планки и отпечаток те же; сняли обе — модуль прежней ширины, поля нет, отпечаток и соседи прежние',
    sameBack && fridgeOf(run10).widthMm === W0 && fridgeOf(run10).sidePanels === undefined && run10.fingerprint === fp0 && neighbors10 === neighbors0,
    `${sameBack} · ${fridgeOf(run10).widthMm} · ${run10.fingerprint} / ${fp0} · соседи ${neighbors10 === neighbors0 ? 'те же' : `${neighbors0} → ${neighbors10}`}`,
  );

  void allModules;
  return { passed, failed };
}

if (process.argv[1]?.endsWith('verify-fridge-panels.ts')) {
  const result = fridgePanelChecks();
  console.log(`\n${result.passed} passed, ${result.failed} failed`);
  process.exit(result.failed > 0 ? 1 : 0);
}
