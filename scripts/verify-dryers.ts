/**
 * ПРИЁМКА СУШЕК (FINAL MASTER STAGE, фаза 1, DRY1–DRY11). Входит в `npm run test:hardware`.
 *
 * Путь экрана: `workspaceInput` → `objectInput` → `composeVariants` → `applyOps` — демо-кухня, стена А 3900 мм
 * без окна (над мойкой — верхний шкаф 600, у стены — нижний 600): «Сушка верхняя» над мойкой и «Сушка
 * нижняя выдвижная» у стены. Правки — те же операции, что шлёт экран (`set_variant`, `set_fitting`,
 * `set_dryer`); места деталей — коробки сцены (`runBoxes`), смета и раскрой — те же функции, что у экрана.
 */

import { DEFAULT_PRODUCTION, type CatalogEntryFull, type HardwareItem } from '../types/catalog';
import type { MillworkOp, Module, Run, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { fittingSlotsOf, fittingVerdict } from '../lib/millwork/fittings';
import { runBoxes, runPlaces, sceneLeaves, type PartBox } from '../lib/millwork/cabinetBoxes';
import { buildPanels } from '../lib/millwork/panels';
import { runFingerprint } from '../lib/millwork/fingerprint';
import { allModules } from '../lib/millwork/layout';
import { drillingPlan } from '../lib/millwork/drillingPlan';
import { dryerOf } from '../lib/millwork/dryer';

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
const SU02 = 'MFR-BOYARD-SU02/600';
const SU02_500 = 'MFR-BOYARD-SU02/500';
const SU06 = 'MFR-BOYARD-SU06/600';
const KRS06 = 'MFR-BOYARD-KRS06/1/3/600';
const KRS03_800 = 'MFR-BOYARD-KRS03/1/3/800';
const UPPER = 'upper-1650@w1';
const BASE = 'base-3300@w1';
const P = DEFAULT_PRODUCTION;
const t = P.carcassMm;

/** Демо-кухня: стена А 3900 без окна — над мойкой верхний шкаф 600, у стены нижний 600. */
const MEASUREMENT = {
  ...DEMO_MEASUREMENT,
  walls: DEMO_MEASUREMENT.walls.map((w) => ({ ...w, lengthMm: w.id === 'w1' ? 3900 : w.lengthMm, openings: w.openings.filter((o) => o.kind !== 'window') })),
} as typeof DEMO_MEASUREMENT;

function kitchen() {
  const base = workspaceInput({ title: 'DRYER', zone: 'Кухня', measurement: MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
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
  return { shown, ops, estimate: () => variant().estimate };
}
const unitOf = (run: Run, id: string): Module => {
  const u = allModules(run).find((m) => m.id === id);
  if (!u) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${id} нет`);
  return u;
};
const placeOf = (run: Run, id: string) => {
  const p = runPlaces(run).find((x) => x.unit.id === id);
  if (!p) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: места ${id} нет`);
  return p;
};
const boxesOf = (run: Run, id: string): PartBox[] => {
  const p = placeOf(run, id);
  const x0 = p.x;
  const x1 = p.x + p.unit.widthMm / 1000;
  return (runBoxes(run, { thicknessMm: t, frontThicknessMm: P.frontMm, gapMm: P.frontGapMm, hardware: CATALOG } as never) as PartBox[]).filter(
    (b) => b.dryer && b.position[0] > x0 && b.position[0] < x1,
  );
};
const envOf = (run: Run, id: string) => {
  const p = placeOf(run, id);
  return { widthMm: p.unit.widthMm, heightMm: Math.round(p.heightM * 1000), depthMm: Math.round(p.depthM * 1000), thicknessMm: t };
};
const verdict = (run: Run, id: string, article: string) =>
  fittingVerdict({ unit: unitOf(run, id), run, slot: 'dryer', item: item(article), production: P, catalog: CATALOG });
const fails = (v: ReturnType<typeof verdict>) => v.checks.filter((c) => c.state === 'fail').map((c) => `${c.label}: ${c.words}`);
const count = (boxes: PartBox[], role: string) => boxes.filter((b) => b.dryer === role).length;
/** Все коробки сушки — внутри корпуса в свету (мм, допуск 0,5). */
function inside(run: Run, id: string, boxes: PartBox[]): string[] {
  const p = placeOf(run, id);
  const bad: string[] = [];
  const lim = { x0: p.x * 1000 + t, x1: (p.x * 1000) + p.unit.widthMm - t, y0: p.y * 1000 + t, y1: (p.y + p.heightM) * 1000 - t, z0: p.zM * 1000 - p.depthM * 1000, z1: p.zM * 1000 };
  for (const b of boxes) {
    const [x, y, z] = b.position.map((v) => v * 1000);
    const [sx, sy, sz] = b.scale.map((v) => v * 1000);
    if (x - sx / 2 < lim.x0 - 0.5 || x + sx / 2 > lim.x1 + 0.5 || y - sy / 2 < lim.y0 - 0.5 || y + sy / 2 > lim.y1 + 0.5 || z - sz / 2 < lim.z0 - 0.5 || z + sz / 2 > lim.z1 + 0.5) {
      bad.push(`${b.dryer} ${[x, y, z].map(Math.round).join('/')}`);
    }
  }
  return bad;
}

export function dryerChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nСУШКИ: верхняя (уровни, поддон, держатели) и нижняя выдвижная (корзина на направляющих)');

  const k = kitchen();
  const run0 = k.shown();
  const fp0 = runFingerprint(run0);
  if (unitOf(run0, UPPER).widthMm !== 600 || unitOf(run0, BASE).widthMm !== 600) throw new Error('ряд не тот: ждали верхний 600 над мойкой и нижний 600 у стены');

  /* DRY1 — «Сушка верхняя» без позиции: условная, решётки в корпусе, полок нет, смета — типовая строка. */
  const w1 = k.ops([{ op: 'set_variant', moduleId: UPPER, variant: 'upper_dryer' }]);
  const run1 = k.shown();
  const b1 = boxesOf(run1, UPPER);
  const lay1 = dryerOf(unitOf(run1, UPPER), envOf(run1, UPPER), null)!;
  const shelves1 = buildPanels({ run: run1, production: P, hardware: CATALOG }).filter((p) => p.moduleId === UPPER && /Полка/.test(p.name));
  const est1 = k.estimate().lines.filter((l) => l.key === 'dish_dryer');
  const pend1 = drillingPlan({ walls: [{ wallId: 'w1', label: 'Стена А', run: run1 }], production: P, hardware: CATALOG }).parts.filter((p) => p.moduleId === UPPER).flatMap((p) => p.pending.map((x) => x.why.join(' ')));
  check(
    'DRY1 «Сушка верхняя» без позиции — условная, в корпусе; полок нет; смета — типовая строка; присадки нет словами',
    w1.warnings.length === 0 &&
      count(b1, 'grid') === 2 && count(b1, 'plate-bar') > 0 && count(b1, 'cup-bar') > 0 && count(b1, 'tray') === 1 && count(b1, 'holder') === 4 &&
      inside(run1, UPPER, b1).length === 0 &&
      lay1.levels.every((l) => l.basis === 'visual') && lay1.visual.some((w) => /не выбрана/.test(w)) &&
      shelves1.length === 0 && est1.length === 1 && est1[0].quantity === 1 &&
      pend1.some((w) => /сушка производителя не выбрана/.test(w)),
    `коробок ${b1.length} (решёток ${count(b1, 'grid')}, поддонов ${count(b1, 'tray')}, держателей ${count(b1, 'holder')}), вне корпуса ${inside(run1, UPPER, b1).length}; полок ${shelves1.length}; строка «${est1[0]?.title}» ×${est1[0]?.quantity}`,
  );

  /* DRY2 — SU02/600: встаёт; уровни по паспорту 50 / 325, поддон один (стальной); строка позиции вместо типовой; отпечаток умолчаниями не двигается. */
  const fpBeforeFit = runFingerprint(run1);
  const v2 = verdict(run1, UPPER, SU02);
  k.ops([{ op: 'set_fitting', moduleId: UPPER, slot: 'dryer', itemId: `hw:${SU02}` }]);
  const run2 = k.shown();
  const lay2 = dryerOf(unitOf(run2, UPPER), envOf(run2, UPPER), item(SU02))!;
  const b2 = boxesOf(run2, UPPER);
  const p2 = placeOf(run2, UPPER);
  const gridY = b2.filter((b) => b.dryer === 'grid').map((b) => Math.round(b.position[1] * 1000 - p2.y * 1000 - t)).sort((a, b) => a - b);
  const lines2 = k.estimate().lines;
  check(
    'DRY2 SU02/600 встаёт; уровни по паспорту 50 / 325 (стр. 260), поддон 1; в смете позиция, типовой строки нет',
    fails(v2).length === 0 &&
      lay2.levels.map((l) => l.atMm).join('/') === '50/325' && lay2.levels.every((l) => l.basis === 'passport') && lay2.trays === 1 &&
      gridY.join('/') === '50/325' && count(b2, 'tray') === 1 &&
      !lines2.some((l) => l.key === 'dish_dryer') && lines2.some((l) => l.title.includes('SU02/600')) &&
      runFingerprint(run2) !== fpBeforeFit,
    `вердикт: ${fails(v2).join(' · ') || 'встаёт'}; уровни ${lay2.levels.map((l) => `${l.atMm} ${l.basis}`).join(', ')}; решётки в сцене ${gridY.join('/')}; строка «${lines2.find((l) => l.title.includes('SU02'))?.title ?? '—'}»`,
  );

  /* DRY3 — отказы по паспорту: нижний ниже 50, шаг меньше 275, один уровень у двухуровневой; ряд прежний. */
  const fp2 = runFingerprint(run2);
  const r3a = k.ops([{ op: 'set_dryer', moduleId: UPPER, lowerMm: 30 }]);
  const r3b = k.ops([{ op: 'set_dryer', moduleId: UPPER, upperMm: 300 }]);
  const r3c = k.ops([{ op: 'set_dryer', moduleId: UPPER, levels: 1 }]);
  check(
    'DRY3 отказ словами паспорта: «не ниже 50 мм… не хватает 20», «не меньше 275… не хватает 25», «двухуровневая»; ряд прежний',
    /не ниже 50 мм \(стр\. 260\).*не хватает 20 мм/.test(r3a.warnings[0] ?? '') &&
      /не меньше 275 мм \(стр\. 260\).*не хватает 25 мм/.test(r3b.warnings[0] ?? '') &&
      /двухуровневая/.test(r3c.warnings[0] ?? '') &&
      runFingerprint(k.shown()) === fp2,
    `${r3a.warnings[0]} | ${r3b.warnings[0]} | ${r3c.warnings[0]}`,
  );

  /* DRY4 — свои высоты 80 / 400 доезжают до сцены; отпечаток другой; «По паспорту» — обратно. */
  k.ops([{ op: 'set_dryer', moduleId: UPPER, lowerMm: 80, upperMm: 400 }]);
  const run4 = k.shown();
  const b4 = boxesOf(run4, UPPER);
  const p4 = placeOf(run4, UPPER);
  const y4 = b4.filter((b) => b.dryer === 'grid').map((b) => Math.round(b.position[1] * 1000 - p4.y * 1000 - t)).sort((a, b) => a - b);
  const fp4 = runFingerprint(run4);
  k.ops([{ op: 'set_dryer', moduleId: UPPER, reset: true }]);
  check(
    'DRY4 свои высоты 80 / 400 — решётки в сцене там же, отпечаток другой; «По паспорту» — отпечаток прежний',
    y4.join('/') === '80/400' && unitOf(run4, UPPER).dryer?.lowerMm === 80 && fp4 !== fp2 && runFingerprint(k.shown()) === fp2 && unitOf(k.shown(), UPPER).dryer === undefined,
    `решётки ${y4.join('/')}; ${fp2} → ${fp4} → ${runFingerprint(k.shown())}`,
  );

  /* DRY5 — поддон снят: в сцене поддона нет, отпечаток другой; вернули — прежний. */
  k.ops([{ op: 'set_dryer', moduleId: UPPER, tray: false }]);
  const b5 = boxesOf(k.shown(), UPPER);
  const fp5 = runFingerprint(k.shown());
  k.ops([{ op: 'set_dryer', moduleId: UPPER, tray: null }]);
  check(
    'DRY5 поддон снят — в сцене 0, отпечаток другой; вернули — 1 и прежний',
    count(b5, 'tray') === 0 && fp5 !== fp2 && count(boxesOf(k.shown(), UPPER), 'tray') === 1 && runFingerprint(k.shown()) === fp2,
    `поддонов ${count(b5, 'tray')} → ${count(boxesOf(k.shown(), UPPER), 'tray')}`,
  );

  /* DRY6 — не та позиция: SU02/500 на корпус 600, SU06 (под плиту 18) на корпус 16, корзина KRS06 — в верхний. */
  const f6a = fails(verdict(k.shown(), UPPER, SU02_500));
  const f6b = fails(verdict(k.shown(), UPPER, SU06));
  const f6c = fails(verdict(k.shown(), UPPER, KRS06));
  check(
    'DRY6 отказ места: SU02/500 — ширина корпуса; SU06/600 — в свету 568 при 564; KRS06 — выдвижная в верхний',
    f6a.some((w) => /ширина корпуса/.test(w)) && f6b.some((w) => /ширина в свету: корпус в свету 568 мм, позиция — под 564/.test(w)) && f6c.some((w) => /^вид: .*выдвижная корзина/.test(w)),
    `${f6a[0]} | ${f6b.find((w) => /свету/.test(w))} | ${f6c[0]}`,
  );

  /* DRY7 — «Сушка нижняя выдвижная» без позиции: место «сушка», а не «карго»; фасад один и выдвигается; корзина едет с ним; смета «цена не задана». */
  const w7 = k.ops([{ op: 'set_variant', moduleId: BASE, variant: 'base_dryer' }]);
  const run7 = k.shown();
  const u7 = unitOf(run7, BASE);
  const slots7 = fittingSlotsOf(u7, run7, P).map((s) => s.slot);
  const leaves7 = sceneLeaves(u7, placeOf(run7, BASE).heightM, undefined, 0, P);
  const b7 = boxesOf(run7, BASE);
  const moving7 = b7.filter((b) => b.part === `${BASE}:door:0`);
  const panels7 = buildPanels({ run: run7, production: P, hardware: CATALOG }).filter((p) => p.moduleId === BASE);
  const line7 = k.estimate().lines.find((l) => l.key === 'dish_dryer_pullout');
  check(
    'DRY7 нижняя без позиции: место «dryer» (не «cargo»), один выдвижной фасад, корзина едет с ним, в корпусе; полок нет; строка «цена не задана»',
    w7.warnings.length === 0 && slots7.includes('dryer') && !slots7.includes('cargo') &&
      leaves7.length === 1 && leaves7[0].kind === 'pullout' && leaves7[0].id === `${BASE}:door:0` &&
      moving7.length > 0 && moving7.every((b) => b.travel && b.travel.known === false) && count(b7, 'runner-cabinet') === 2 && moving7.some((b) => b.dryer === 'tray') &&
      inside(run7, BASE, b7).length === 0 &&
      panels7.filter((p) => /Фасад/.test(p.name)).reduce((s, p) => s + p.qty, 0) === 1 && !panels7.some((p) => /Полка/.test(p.name)) &&
      line7 !== undefined && line7.quantity === 1 && line7.total === 0 && Boolean(line7.missingRate || line7.priceUnset),
    `места ${slots7.join(',')}; створки ${leaves7.map((l) => `${l.kind}:${l.id}`).join(',')}; едут ${moving7.length}, ход ${moving7[0]?.travel?.mm} мм; вне корпуса ${inside(run7, BASE, b7).length}; фасадов ${panels7.filter((p) => /Фасад/.test(p.name)).reduce((s, p) => s + p.qty, 0)}; строка «${line7?.title}» ${line7?.total} ₸`,
  );

  /* DRY8 — KRS06/1/3/600: встаёт; направляющие на 79 мм от дна (стр. 240); строка позиции; присадка — «не рассчитано» с напечатанным. */
  const v8 = verdict(run7, BASE, KRS06);
  k.ops([{ op: 'set_fitting', moduleId: BASE, slot: 'dryer', itemId: `hw:${KRS06}` }]);
  const run8 = k.shown();
  const b8 = boxesOf(run8, BASE);
  const p8 = placeOf(run8, BASE);
  const runnerY = b8.filter((b) => b.dryer === 'runner-cabinet').map((b) => Math.round(b.position[1] * 1000 - p8.y * 1000 - t));
  const lines8 = k.estimate().lines;
  const plan8 = drillingPlan({ walls: [{ wallId: 'w1', label: 'Стена А', run: run8 }], production: P, hardware: CATALOG });
  const parts8 = plan8.parts.filter((p) => p.moduleId === BASE);
  const sidePend = parts8.filter((p) => p.role === 'side_left' || p.role === 'side_right').flatMap((p) => p.pending).filter((x) => /направляющие корзины-сушки/.test(x.what));
  const frontPend = parts8.filter((p) => p.role === 'door').flatMap((p) => p.pending).filter((x) => /держатели фасада корзины/.test(x.what));
  check(
    'DRY8 KRS06/1/3/600 встаёт; направляющие 79 мм от дна (стр. 240); строка позиции, без «цена не задана» варианта; присадка «не рассчитано» у боковин и фасада',
    fails(v8).length === 0 && runnerY.length === 2 && runnerY.every((y) => y === 79) &&
      !lines8.some((l) => l.key === 'dish_dryer_pullout') && lines8.some((l) => l.title.includes('KRS06/1/3/600')) &&
      sidePend.length === 2 && sidePend.every((x) => x.why.some((w) => /диаметр не напечатан/.test(w))) && frontPend.length === 1 &&
      parts8.every((p) => p.ops.every((o) => !/суш|корзин/i.test(String((o as { what?: string }).what ?? '')))),
    `вердикт: ${fails(v8).join(' · ') || 'встаёт'}; направляющие ${runnerY.join('/')}; боковины «${sidePend[0]?.why[0] ?? '—'}»; фасад ${frontPend.length}`,
  );

  /* DRY9 — нижняя: KRS03/800 на корпус 600 — ширина; SU02 (навесная) — вид; уровни у нижней — отказ. */
  const f9a = fails(verdict(run8, BASE, KRS03_800));
  const f9b = fails(verdict(run8, BASE, SU02));
  const r9 = k.ops([{ op: 'set_dryer', moduleId: BASE, lowerMm: 100 }]);
  check(
    'DRY9 нижняя: KRS03/800 на 600 — ширина; SU02 — навесная в нижнюю; уровни — «задаёт корзина»',
    f9a.some((w) => /ширина корпуса/.test(w)) && f9b.some((w) => /^вид: .*навесная/.test(w)) && /уровни задаёт корзина/.test(r9.warnings[0] ?? ''),
    `${f9a[0]} | ${f9b[0]} | ${r9.warnings[0]}`,
  );

  /* DRY10 — в раскрое сушки нет: покупное изделие; деталей «Полка» у модулей сушек нет. */
  const allPanels = buildPanels({ run: run8, production: P, hardware: CATALOG });
  check(
    'DRY10 раскрой: деталей сушки нет, полок у модулей сушек нет — покупное изделие в смете, не в листе',
    !allPanels.some((p) => /суш|корзин/i.test(p.name)) && !allPanels.some((p) => (p.moduleId === UPPER || p.moduleId === BASE) && /Полка/.test(p.name)),
    `деталей модулей сушек ${allPanels.filter((p) => p.moduleId === UPPER || p.moduleId === BASE).map((p) => p.name).join(', ')}`,
  );

  /* DRY11 — сушку сменили на дверцу: уровни и поддон уходят с местом; ряд без сушек — отпечаток исходный. */
  k.ops([{ op: 'set_dryer', moduleId: UPPER, lowerMm: 90 }]);
  k.ops([
    { op: 'set_fitting', moduleId: UPPER, slot: 'dryer', itemId: null },
    { op: 'set_fitting', moduleId: BASE, slot: 'dryer', itemId: null },
    { op: 'set_variant', moduleId: UPPER, variant: 'upper_door' },
    { op: 'set_variant', moduleId: BASE, variant: 'door' },
  ]);
  const run11 = k.shown();
  check(
    'DRY11 сушку сменили на дверцу — уровни ушли с местом (`dryer` нет), коробок сушки 0',
    unitOf(run11, UPPER).dryer === undefined && boxesOf(run11, UPPER).length === 0 && boxesOf(run11, BASE).length === 0,
    `dryer ${JSON.stringify(unitOf(run11, UPPER).dryer ?? null)}; коробок ${boxesOf(run11, UPPER).length + boxesOf(run11, BASE).length}; исходный отпечаток ${fp0}`,
  );

  return { passed, failed };
}

if (process.argv[1]?.includes('verify-dryers')) {
  const r = dryerChecks();
  console.log(`\n${r.passed} passed, ${r.failed} failed`);
  if (r.failed > 0) process.exit(1);
}
