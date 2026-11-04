/**
 * ПРИЁМКА ДВУХ КОРЗИН НИЖНЕЙ СУШКИ (FINAL FURNITURE EDITOR, задача 3, DRB1–DRB5). В `npm run test:hardware`.
 *
 * Путь экрана — тот же, что у сушек (DRY): демо-кухня, стена А 3900 без окна, нижний модуль у стены — «Сушка нижняя
 * выдвижная», корзина KRS06/1/3/600 путём «Фурнитуры», вторая корзина и её высота — `set_dryer`, как шлёт блок
 * «Сушка». Меряется: обе корзины едут с фасадом, вторая — условная композиция (словами и строкой сметы без цены),
 * в раскрое сушки нет, отказы числом, отпечаток и запись.
 */

import { DEFAULT_PRODUCTION, type CatalogEntryFull } from '../types/catalog';
import type { MillworkOp, Module, Run, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { runBoxes, runPlaces, type PartBox } from '../lib/millwork/cabinetBoxes';
import { buildPanels } from '../lib/millwork/panels';
import { runFingerprint } from '../lib/millwork/fingerprint';
import { allModules } from '../lib/millwork/layout';
import { dryerOf } from '../lib/millwork/dryer';
import { installedItem } from '../lib/millwork/fittings';

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
const KRS06 = 'MFR-BOYARD-KRS06/1/3/600';
const BASE = 'base-3300@w1';
const P = DEFAULT_PRODUCTION;
const t = P.carcassMm;
const MEASUREMENT = {
  ...DEMO_MEASUREMENT,
  walls: DEMO_MEASUREMENT.walls.map((w) => ({ ...w, lengthMm: w.id === 'w1' ? 3900 : w.lengthMm, openings: w.openings.filter((o) => o.kind !== 'window') })),
} as typeof DEMO_MEASUREMENT;

function kitchen() {
  const base = workspaceInput({ title: 'DRB', zone: 'Кухня', measurement: MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production: P, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: CATALOG });
  const disabled = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
  let edited: Partial<Record<VariantKey, Run>> = {};
  const variant = () => composeVariants(input, disabled, edited).find((v) => v.key === 'optimal')!;
  const shown = () => variant().run;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown(), requirements: DEMO_REQUIREMENTS, ops: list, openings: input.openings, hardware: CATALOG });
    edited = { optimal: next };
    return next;
  };
  return { shown, ops, estimate: () => variant().estimate, restore: (run: Run) => (edited = { optimal: run }) };
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
const envOf = (run: Run, id: string) => {
  const p = placeOf(run, id);
  return { widthMm: p.unit.widthMm, heightMm: Math.round(p.heightM * 1000), depthMm: Math.round(p.depthM * 1000), thicknessMm: t };
};
const dryerBoxes = (run: Run, id: string): PartBox[] => {
  const p = placeOf(run, id);
  return (runBoxes(run, { thicknessMm: t, frontThicknessMm: P.frontMm, gapMm: P.frontGapMm, hardware: CATALOG } as never) as PartBox[]).filter(
    (b) => b.dryer && b.position[0] > p.x && b.position[0] < p.x + p.unit.widthMm / 1000,
  );
};

export function dryerBasketChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nДВЕ КОРЗИНЫ НИЖНЕЙ СУШКИ: обе на фасаде, вторая — условная композиция, высота, отказы, смета');

  const k = kitchen();
  if (unitOf(k.shown(), BASE).widthMm !== 600) throw new Error('ряд не тот: ждали нижний 600 у стены');
  k.ops([{ op: 'set_variant', moduleId: BASE, variant: 'base_dryer' }]);
  k.ops([{ op: 'set_fitting', moduleId: BASE, slot: 'dryer', itemId: `hw:${KRS06}` }]);
  const run0 = k.shown();
  const item = installedItem(unitOf(run0, BASE), 'dryer', CATALOG);
  const lay0 = dryerOf(unitOf(run0, BASE), envOf(run0, BASE), item)!;
  const grids0 = dryerBoxes(run0, BASE).filter((b) => b.dryer === 'grid').length;
  const est0 = k.estimate();

  /* DRB1 — две корзины: обе едут с фасадом; вторая над первой и внутри корпуса; условная — словами. */
  const w1 = k.ops([{ op: 'set_dryer', moduleId: BASE, levels: 2 }]).warnings;
  const run1 = k.shown();
  const lay1 = dryerOf(unitOf(run1, BASE), envOf(run1, BASE), item)!;
  const boxes1 = dryerBoxes(run1, BASE);
  /* Всё, кроме корпусной части направляющей, едет с фасадом: корзины, стойки между ними, поддон, подвижная часть. */
  const moving = boxes1.filter((b) => b.dryer !== 'runner-cabinet');
  const innerTop = (placeOf(run1, BASE).y + placeOf(run1, BASE).heightM) * 1000 - t;
  const topOf = Math.max(...boxes1.map((b) => (b.position[1] + b.scale[1] / 2) * 1000));
  check(
    'DRB1 «2 корзины»: решёток 1 → 2, обе корзины на ходу фасада (`travel`), вторая над первой, внутри корпуса; «условная композиция» словами',
    w1.length === 0 &&
      grids0 === 1 &&
      boxes1.filter((b) => b.dryer === 'grid').length === 2 &&
      lay1.baskets === 2 &&
      lay1.composed === true &&
      lay1.levels.length === 2 &&
      lay1.levels[1].atMm > lay1.levels[0].atMm &&
      moving.length > 0 && moving.every((b) => b.part === `${BASE}:door:0` && (b.travel?.mm ?? 0) > 0) &&
      topOf <= innerTop + 0.5 &&
      lay1.visual.some((v) => /условная композиция/.test(v)),
    `${w1.join(' ')} · решёток ${grids0} → ${boxes1.filter((b) => b.dryer === 'grid').length} · уровни ${lay1.levels.map((l) => `${l.atMm} ${l.basis}`).join(', ')} · верх ${Math.round(topOf)} ≤ ${Math.round(innerTop)} · ${lay1.visual.find((v) => /композиция/.test(v)) ?? 'СЛОВ НЕТ'}`,
  );

  /* DRB2 — смета: позиция одна, вторая корзина — своей строкой без цены, итог «неполный»; раскрой без сушки. */
  const est1 = k.estimate();
  const second = est1.lines.find((l) => l.key === 'dryer_second_basket');
  const itemLines = (lines: typeof est1.lines) => lines.filter((l) => l.key.startsWith('fitting_dryer_')).map((l) => `${l.key}×${l.quantity}`).join(',');
  const parts1 = buildPanels({ run: run1, production: P, hardware: CATALOG }).filter((p) => p.moduleId === BASE).map((p) => p.name);
  check(
    'DRB2 смета: позиция KRS06 × 1 как была, «Вторая корзина сушки — условная композиция» × 1 «цена не задана»; в раскрое деталей сушки нет',
    itemLines(est1.lines) === itemLines(est0.lines) &&
      Boolean(second) &&
      second!.quantity === 1 &&
      Boolean(second!.priceUnset) &&
      !est0.lines.some((l) => l.key === 'dryer_second_basket') &&
      !parts1.some((n) => /сушк|корзин/i.test(n)),
    `${itemLines(est1.lines)} · ${second ? `${second.title} ×${second.quantity} «${second.priceUnset}»` : 'СТРОКИ НЕТ'} · детали ${parts1.join(',')}`,
  );

  /* DRB3 — высота второй корзины: своя — встаёт; в первую — отказ; выше корпуса — отказ числом; ряд прежний. */
  const firstTop = lay1.levels[0].atMm + (lay1.levels[1].atMm - lay1.levels[0].atMm - 40);
  const w3 = k.ops([{ op: 'set_dryer', moduleId: BASE, upperMm: lay1.levels[1].atMm + 64 }]).warnings;
  const run3 = k.shown();
  const lay3 = dryerOf(unitOf(run3, BASE), envOf(run3, BASE), item)!;
  const r3a = k.ops([{ op: 'set_dryer', moduleId: BASE, upperMm: firstTop - 30 }]).warnings[0] ?? '';
  const r3b = k.ops([{ op: 'set_dryer', moduleId: BASE, upperMm: 900 }]).warnings[0] ?? '';
  const r3c = k.ops([{ op: 'set_dryer', moduleId: BASE, lowerMm: 120 }]).warnings[0] ?? '';
  check(
    'DRB3 вторая корзина +64 мм — встала («выбрано»); в первую — «заходит в первую»; на 900 — «лишние … мм»; высоту первой — «уровни задаёт корзина»; ряд прежний',
    w3.length === 0 &&
      lay3.levels[1].atMm === lay1.levels[1].atMm + 64 &&
      lay3.levels[1].basis === 'chosen' &&
      /заходит в первую/.test(r3a) &&
      /лишние \d+ мм/.test(r3b) &&
      /уровни задаёт корзина/.test(r3c) &&
      k.shown().fingerprint === run3.fingerprint,
    `${w3.join(' ')} · ${lay3.levels.map((l) => `${l.atMm} ${l.basis}`).join(', ')} | ${r3a} | ${r3b} | ${r3c}`,
  );

  /* DRB4 — отпечаток: две корзины — другая сушка; запись и чтение — то же. */
  const saved = JSON.parse(JSON.stringify(run3)) as Run;
  k.restore(saved);
  check(
    'DRB4 отпечаток: одна корзина ≠ две; записали и открыли — тот же, вторая корзина на месте',
    run0.fingerprint !== run1.fingerprint && runFingerprint(k.shown()) === run3.fingerprint && unitOf(k.shown(), BASE).dryer?.levels === 2,
    `${run0.fingerprint} → ${run1.fingerprint} → ${run3.fingerprint} / ${runFingerprint(k.shown())}`,
  );

  /* DRB5 — «1 корзина» — вторая уходит, высота с ней; сушка как до правки (отпечаток исходный). */
  const w5 = k.ops([{ op: 'set_dryer', moduleId: BASE, levels: null, upperMm: null }]).warnings;
  const run5 = k.shown();
  check(
    'DRB5 «1 корзина»: вторая и её высота ушли, решётка одна, строки второй корзины нет, отпечаток исходный',
    w5.length === 0 &&
      unitOf(run5, BASE).dryer === undefined &&
      dryerBoxes(run5, BASE).filter((b) => b.dryer === 'grid').length === 1 &&
      !k.estimate().lines.some((l) => l.key === 'dryer_second_basket') &&
      run5.fingerprint === run0.fingerprint &&
      lay0.baskets === 1,
    `${w5.join(' ')} · ${JSON.stringify(unitOf(run5, BASE).dryer ?? null)} · ${run0.fingerprint} / ${run5.fingerprint}`,
  );

  return { passed, failed };
}

if (process.argv[1]?.endsWith('verify-dryer-baskets.ts')) {
  const result = dryerBasketChecks();
  console.log(`\n${result.passed} passed, ${result.failed} failed`);
  process.exit(result.failed > 0 ? 1 : 0);
}
