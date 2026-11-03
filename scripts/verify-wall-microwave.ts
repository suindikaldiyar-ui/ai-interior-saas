/**
 * ПРИЁМКА СВЧ В НАВЕСНОМ ШКАФУ (FINAL MASTER STAGE, задача 2, WM1–WM9). В `npm run test:hardware`.
 *
 * Путь экрана: демо-кухня, стена А 3900 без окна (над мойкой — верхний шкаф 600), `set_variant` «Ниша под
 * микроволновку» и `set_appliance_model` с `moduleId` — то, что шлёт блок «СВЧ в навесном шкафу» в инспекторе.
 * Меряется по инструкции BFL524MB2 (9001974035, с. 21, рис. 16.5): ниша, высота от пола, нет задней стенки, полка
 * над нишей, модель в сцене на дне шкафа, строка сметы, «выпуск заперт» словами, присадка, запись и чтение.
 */

import { DEFAULT_PRODUCTION, type CatalogEntryFull } from '../types/catalog';
import type { MillworkOp, Module, Run, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput, panelWallsOf } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { runBoxesByModule } from '../lib/millwork/cabinetBoxes';
import { buildPanels } from '../lib/millwork/panels';
import { runFingerprint } from '../lib/millwork/fingerprint';
import { allModules } from '../lib/millwork/layout';
import { drillingPlan } from '../lib/millwork/drillingPlan';
import { moduleCarcassHeightMm, upperBottomFor } from '../lib/millwork/fill';
import { applianceDoorIds, stageFourModelsOf } from '../lib/millwork/cookingStack';
import { applianceModelFindings } from '../lib/millwork/applianceChecks';
import { WALL_MICROWAVE_SHELF_NAME } from '../lib/millwork/wallMicrowave';

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
const t = P.carcassMm;
const MODEL = 'BFL524MB2';
const UPPER = 'upper-1650@w1';

const MEASUREMENT = {
  ...DEMO_MEASUREMENT,
  walls: DEMO_MEASUREMENT.walls.map((w) => ({ ...w, lengthMm: w.id === 'w1' ? 3900 : w.lengthMm, openings: w.openings.filter((o) => o.kind !== 'window') })),
} as typeof DEMO_MEASUREMENT;

function kitchen() {
  const base = workspaceInput({ title: 'WM', zone: 'Кухня', measurement: MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production: P, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: CATALOG });
  const disabled = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
  let edited: Partial<Record<VariantKey, Run>> = {};
  const variant = () => composeVariants(input, disabled, edited).find((v) => v.key === 'optimal')!;
  const shown = () => variant().run;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown(), requirements: DEMO_REQUIREMENTS, ops: list, openings: input.openings, hardware: CATALOG });
    if (next.warnings.length === 0) edited = { optimal: next };
    return next;
  };
  return { shown, ops, estimate: () => variant().estimate, restore: (run: Run) => (edited = { optimal: run }) };
}
const unitOf = (run: Run, id: string): Module => {
  const found = allModules(run).find((m) => m.id === id);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${id} нет`);
  return found;
};
const boxesOf = (run: Run, id: string) => {
  const boxes = runBoxesByModule(run, { thicknessMm: t, frontThicknessMm: P.frontMm, gapMm: P.frontGapMm, production: P, hardware: CATALOG }).modules.find((e) => e.unit.id === id)?.boxes;
  if (!boxes || boxes.length === 0) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: коробок модуля ${id} нет`);
  return boxes;
};
const partsOf = (run: Run, id: string) => buildPanels({ run, production: P }).filter((p) => p.moduleId === id);

export function wallMicrowaveChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nСВЧ В НАВЕСНОМ ШКАФУ: модель, ниша по инструкции, без задней стенки, 3D, смета, присадка');

  const k = kitchen();
  const u0 = unitOf(k.shown(), UPPER);

  /* WM1 — «Ниша под микроволновку» без модели: открытая ниша, как была; модели в сцене и строки сметы нет. */
  const r1 = k.ops([{ op: 'set_variant', moduleId: UPPER, variant: 'upper_micro' }]);
  const run1 = k.shown();
  const parts1 = partsOf(run1, UPPER);
  check(
    `WM1 «Ниша под микроволновку» (${u0.widthMm} мм) без модели — прежняя ниша: задняя стенка в раскрое, модели в сцене и строки модели в смете нет`,
    r1.warnings.length === 0 && unitOf(run1, UPPER).variant === 'upper_micro' && parts1.some((p) => p.name === 'Задняя стенка') &&
      !stageFourModelsOf(run1, P).some((m) => m.unit.id === UPPER) && !k.estimate().lines.some((l) => l.key.startsWith('appliance_microwave_')),
    r1.warnings.join(' | '),
  );

  /* WM2 — модель BFL524MB2 на шкаф: модель на модуле, полок на 32 нет, отпечаток другой. */
  const fp1 = run1.fingerprint;
  const r2 = k.ops([{ op: 'set_appliance_model', appliance: 'microwave', model: MODEL, moduleId: UPPER }]);
  const run2 = k.shown();
  const u2 = unitOf(run2, UPPER);
  check(
    `WM2 модель ${MODEL} легла на шкаф операцией: applianceModels, полок на отверстиях 32 нет, отпечаток другой`,
    r2.warnings.length === 0 && u2.applianceModels?.microwave === MODEL && (u2.fill?.shelves.length ?? -1) === 0 && run2.fingerprint !== fp1,
    `${JSON.stringify(u2.applianceModels ?? null)} · полок ${u2.fill?.shelves.length} · ${r2.warnings.join(' | ')}`,
  );

  /* WM3 — раскрой: задней стенки нет (инструкция), полка над нишей — деталь корпуса на 16 + 362 мм. */
  const H = moduleCarcassHeightMm(u2, run2);
  const parts2 = partsOf(run2, UPPER);
  const shelf = parts2.find((p) => p.name === WALL_MICROWAVE_SHELF_NAME);
  const bottom = parts2.find((p) => p.name === 'Дно');
  check(
    `WM3 раскрой: задней стенки нет; «${WALL_MICROWAVE_SHELF_NAME}» ${shelf?.lengthMm} × ${shelf?.widthMm} — той же плиты и размера, что дно; корпус ${H} мм`,
    !parts2.some((p) => p.name === 'Задняя стенка') && Boolean(shelf) && Boolean(bottom) && shelf!.lengthMm === bottom!.lengthMm && shelf!.widthMm === bottom!.widthMm && shelf!.material === bottom!.material,
    parts2.map((p) => `${p.name} ${p.lengthMm}×${p.widthMm}`).join('; '),
  );

  /* WM4 — сцена: коробки полки над нишей (низ 378 мм от низа корпуса) и нет задней стенки; модель СВЧ на дне, дверь — в «Открыть всё». */
  const boxes = boxesOf(run2, UPPER);
  const sb = boxes.find((b) => b.panel === WALL_MICROWAVE_SHELF_NAME);
  const upperBottom = upperBottomFor(u2, run2);
  const shelfBottomMm = sb ? Math.round((sb.position[1] - sb.scale[1] / 2) * 1000 - upperBottom) : NaN;
  const model = stageFourModelsOf(run2, P).find((m) => m.unit.id === UPPER);
  check(
    `WM4 сцена: полка над нишей низом на ${t + 362} мм от низа корпуса, задней стенки нет; модель ${MODEL} на дне шкафа (${upperBottom + t} мм от пола), по центру; дверь СВЧ в «Открыть всё»`,
    Boolean(sb) && shelfBottomMm === t + 362 && !boxes.some((b) => b.panel === 'Задняя стенка') &&
      model?.kind === 'microwave' && model.bottomMm === upperBottom + t && model.xMm === u2.offsetMm + u2.widthMm / 2 &&
      applianceDoorIds(run2).includes(`${UPPER}:microwave:door`),
    `полка низ ${shelfBottomMm} · модель ${model?.kind} низ ${model?.bottomMm} x ${model?.xMm}`,
  );

  /* WM5 — проверки по инструкции: блокирующих нет; выпуск заперт словами — полка не на 32, зазор до стены 16 мм, 95 °C. */
  const found = applianceModelFindings(run2, P).filter((f) => f.moduleId === UPPER);
  const release = found.filter((f) => f.level === 'release').map((f) => f.words);
  check(
    'WM5 ниша 568 в 560…568, глубина ≥ 300, низ ≥ 850 — блокирующих нет; заперт выпуск: полка неподвижная (просвета 362…365 на 32 нет), до стены 16 мм, 95 °C — с документом',
    found.every((f) => f.level === 'release') && release.length === 3 &&
      release.some((w) => /неподвижная, низ на 378 мм/.test(w) && /9001974035/.test(w)) && release.some((w) => /до стены нужно 16 мм/.test(w)) && release.some((w) => /95 °C/.test(w)),
    found.map((f) => `${f.level}: ${f.words}`).join(' | '),
  );

  /* WM6 — смета: строка модели «цена не задана», типовой микроволновки в смете нет. */
  const lines = k.estimate().lines;
  const mline = lines.find((l) => l.key === `appliance_microwave_${MODEL}`);
  check(
    `WM6 смета: «${mline?.title}» × 1 — цена не задана; строки типовой СВЧ нет`,
    Boolean(mline) && mline!.quantity === 1 && !lines.some((l) => l.key === 'appliance_microwave'),
    `${mline?.title} · ${mline?.quantity} · ${(mline as { unsetWithoutRate?: string } | undefined)?.unsetWithoutRate ?? ''}`,
  );

  /* WM7 — присадка: у полки над нишей — «не рассчитано», правило цеха не задано. */
  const plan = drillingPlan({ walls: panelWallsOf(null, [run2], 'w1'), production: P, hardware: CATALOG });
  const shelfPart = plan.parts.find((p) => p.name === WALL_MICROWAVE_SHELF_NAME);
  check(
    'WM7 присадка: у полки над нишей отверстий 0, «неподвижная полка — правило цеха не задано»',
    Boolean(shelfPart) && shelfPart!.ops.length === 0 && shelfPart!.pending.some((p) => /правило цеха не задано/.test(p.why.join(' '))),
    shelfPart ? shelfPart.pending.map((p) => p.why[0]).join('; ') : 'НУЛЕВОЙ СЕЛЕКТОР: полки в плане присадки нет',
  );

  /* WM8 — отказы: модель на шкаф без ниши; не та ширина — блокирующее с мм; чужой прибор с moduleId. */
  const plain = allModules(run2).find((m) => m.kind === 'upper' && m.id !== UPPER && m.variant !== 'upper_micro' && !m.appliance)!;
  const w8a = k.ops([{ op: 'set_appliance_model', appliance: 'microwave', model: MODEL, moduleId: plain.id }]).warnings[0] ?? '';
  const w8b = k.ops([{ op: 'set_appliance_model', appliance: 'oven', model: 'HBG272EB3', moduleId: UPPER }]).warnings[0] ?? '';
  const narrow = { ...run2, upperSegments: run2.upperSegments.map((s) => ({ ...s, modules: s.modules.map((m) => (m.id === UPPER ? { ...m, widthMm: 500 } : m)) })) } as Run;
  const nb = applianceModelFindings(narrow, P).filter((f) => f.moduleId === UPPER && f.level === 'blocking').map((f) => f.words);
  check(
    'WM8 отказы: шкаф без ниши — «такой ниши нет»; духовка в нишу СВЧ — «ставится только СВЧ»; шкаф 500 — блокирующее «ниша 468 мм … не хватает 92 мм»',
    /такой ниши нет/.test(w8a) && /ставится только СВЧ/.test(w8b) && nb.some((w) => /ниша между боковинами 468 мм/.test(w) && /не хватает 92 мм/.test(w)),
    `${w8a} | ${w8b} | ${nb.join(' ; ')}`,
  );

  /* WM9 — запись и чтение; правка нижнего ряда шкаф не трогает; модель снята — прежняя ниша и прежний отпечаток. */
  const saved = JSON.parse(JSON.stringify(run2)) as Run;
  k.restore(saved);
  const same = runFingerprint(k.shown()) === run2.fingerprint && unitOf(k.shown(), UPPER).applianceModels?.microwave === MODEL;
  k.ops([{ op: 'set_appliance_model', appliance: 'microwave', model: null, moduleId: UPPER }]);
  const back = k.shown();
  k.ops([{ op: 'set_appliance_model', appliance: 'microwave', model: MODEL, moduleId: UPPER }]);
  const base = k.shown().modules.find((m) => m.kind === 'base' && !m.appliance)!;
  k.ops([{ op: 'set_variant', moduleId: base.id, variant: 'drawers' }]);
  const kept = unitOf(k.shown(), UPPER).applianceModels?.microwave === MODEL;
  check(
    'WM9 записали и открыли — модель и отпечаток те же; правка нижнего ряда модель не снимает; сняли модель — задняя стенка вернулась, отпечаток прежний',
    same && kept && unitOf(back, UPPER).applianceModels === undefined && partsOf(back, UPPER).some((p) => p.name === 'Задняя стенка') && back.fingerprint === fp1,
    `${same} · ${kept} · ${back.fingerprint} / ${fp1}`,
  );

  return { passed, failed };
}

if (process.argv[1]?.endsWith('verify-wall-microwave.ts')) {
  const result = wallMicrowaveChecks();
  console.log(`\n${result.passed} passed, ${result.failed} failed`);
  process.exit(result.failed > 0 ? 1 : 0);
}
