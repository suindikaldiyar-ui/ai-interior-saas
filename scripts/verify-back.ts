/**
 * ПРИЁМКА «КОРПУС — ЛДСП, ЗАДНЯЯ СТЕНКА — ХДФ» (FINAL FURNITURE EDITOR, задача 4, BK1–BK3). В `npm run test:hardware`.
 *
 * Путь экрана: демо-кухня с каталогом организации (`objectInput` с декорами корпуса), `set_carcass` — как шлёт панель
 * «Материалы» → «Корпус всей кухни». Меряется, что смена корпуса не трогает ХДФ: задняя стенка — своя деталь
 * деталировки, своя группа раскроя и своя строка сметы, при любом декоре корпуса.
 */

import { DEFAULT_PRODUCTION } from '../types/catalog';
import type { MillworkOp, Run, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { DEMO_CATALOG, DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { BACK_PANEL_NAME, buildPanels } from '../lib/millwork/panels';
import { carcassCatalog, carcassLink } from '../lib/millwork/carcassMaterial';
import { stockKey } from '../lib/millwork/cutting';
import catalogJson from '../data/catalog/catalog.json';
import { catalogEntriesFromRows, manualMaterialRow, materialCatalog, materialOps, parseMaterialFile, planMaterialImport, TARGET_ROLE } from '../lib/millwork/materialCatalog';
import { runBoxesByModule } from '../lib/millwork/cabinetBoxes';
import { buildEstimate } from '../lib/millwork/estimate';

type Check = (name: string, ok: boolean, detail?: string) => void;
let passed = 0;
let failed = 0;
const own: Check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
};

const P = DEFAULT_PRODUCTION;
const CARCASS = carcassCatalog(DEMO_CATALOG);

function kitchen() {
  const base = workspaceInput({ title: 'BK', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production: P, milling: new Map(), carcass: CARCASS, materials: new Map() });
  const disabled = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
  let edited: Partial<Record<VariantKey, Run>> = {};
  const variant = () => composeVariants(input, disabled, edited).find((v) => v.key === 'optimal')!;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: variant().run, requirements: DEMO_REQUIREMENTS, ops: list, openings: input.openings });
    edited = { optimal: next };
    return next;
  };
  return { shown: () => variant().run, ops, estimate: () => variant().estimate };
}

const backs = (run: Run) => buildPanels({ run, production: P, carcass: CARCASS }).filter((p) => p.name === BACK_PANEL_NAME);
const backText = (run: Run) => {
  const list = backs(run);
  return `${list.reduce((s, p) => s + p.qty, 0)}×${Array.from(new Set(list.map((p) => `${p.material}|${stockKey(p.stock!, p.thicknessMm)}`))).join(',')}`;
};
const keys = (run: Run) => Array.from(new Set(buildPanels({ run, production: P, carcass: CARCASS }).filter((p) => p.stock).map((p) => stockKey(p.stock!, p.thicknessMm)))).sort();
const hdfLine = (lines: { key: string; quantity: number }[]) => lines.find((l) => l.key === 'hdf_back')?.quantity ?? null;

export function backChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nКОРПУС — ЛДСП, ЗАДНЯЯ СТЕНКА — ХДФ: смена декора корпуса не трогает ХДФ (деталировка, раскрой, смета)');

  const decor = Array.from(CARCASS.values())[0];
  if (!decor) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: декоров корпуса в каталоге демо нет');
  const k = kitchen();
  const run0 = k.shown();
  const back0 = backText(run0);
  const hdf0 = hdfLine(k.estimate().lines);

  /* BK1 — корпус в декоре каталога: ЛДСП корпуса — своя группа листа, задняя стенка — ХДФ без изменений. */
  const w1 = k.ops([{ op: 'set_carcass', itemId: decor.id }]).warnings;
  const run1 = k.shown();
  const keys1 = keys(run1);
  check(
    `BK1 корпус «${decor.name}»: задние стенки те же (${back0}), лист ХДФ своей группой, корпус — группой своего декора`,
    w1.length === 0 && backText(run1) === back0 && keys1.some((key) => key.startsWith('hdf:')) && keys1.some((key) => key.startsWith('ldsp:') && key.includes(decor.id)),
    `${w1.join(' ')} · ${backText(run1)} · группы ${keys1.join(' ')}`,
  );

  /* BK2 — смета: строка ХДФ та же по количеству; корпус — своей строкой. */
  const hdf1 = hdfLine(k.estimate().lines);
  check('BK2 смета: «ХДФ — задние стенки» отдельной строкой, количество то же', hdf0 !== null && hdf1 === hdf0, `${hdf0} → ${hdf1}`);

  /* BK3 — корпус снят обратно: ХДФ всё та же; отпечаток корпуса вернулся. */
  k.ops([{ op: 'set_carcass', itemId: null }]);
  const run3 = k.shown();
  check('BK3 корпус снят: задние стенки те же, отпечаток исходный', backText(run3) === back0 && run3.fingerprint === run0.fingerprint, `${backText(run3)} · ${run0.fingerprint} / ${run3.fingerprint}`);

  /*
   * BK4–BK6 — СВОЙ МАТЕРИАЛ ЗАДНЕЙ СТЕНКИ (P3): позиций ХДФ в файле поставщиков нет — коллекция «ХДФ · задняя стенка»
   * ждёт импорта, позиция заводится своей (`manualMaterialRow`, тот же путь, что «Своя позиция» в панели), выбор —
   * цель «Задняя стенка всей кухни» (`materialOps('back')`). Выдуманных артикулов нет: код позиции — проба приёмки.
   */
  const file = parseMaterialFile(catalogJson);
  const hdf = file.collections.find((collection) => collection.id === 'hdf-back');
  if (!hdf) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: коллекции «ХДФ · задняя стенка» нет в файле');
  const egger = file.collections.find((collection) => collection.id === 'egger-ldsp');
  if (!egger) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: коллекции EGGER ЛДСП нет в файле');
  const fileEntries = catalogEntriesFromRows(planMaterialImport(file, []).rows, file, 'demo', 'demo-mat:');
  const ownEntries = catalogEntriesFromRows(
    [
      manualMaterialRow(hdf, { code: 'HDF-PROBE', name: 'ХДФ проба белая', hex: '#f1efe8', price: null }),
      manualMaterialRow(egger, { code: 'EGGER-PROBE', name: 'Проба корпуса', hex: '#8a6f55', price: null }),
    ],
    file,
    'demo',
    'demo-own:',
  );
  const entries = [...fileEntries, ...ownEntries];
  const items = materialCatalog(entries);
  const carcassItems = new Map([...Array.from(CARCASS.entries()), ...Array.from(carcassCatalog(entries).entries())]);
  const hdfItem = Array.from(items.values()).find((item) => item.code === 'HDF-PROBE');
  const eggerItem = Array.from(items.values()).find((item) => item.code === 'EGGER-PROBE');
  if (!hdfItem || !eggerItem) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: позиции ХДФ или EGGER нет в каталоге');
  const kb = kitchen();
  const plan4 = materialOps('back', { item: hdfItem, collection: hdf, surface: 'matte' }, kb.shown(), null);
  if ('refusal' in plan4) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: задняя стенка отказала: ${plan4.refusal}`);
  kb.ops(plan4.ops);
  const backsOf = (run: Run) => buildPanels({ run, production: P, carcass: carcassItems }).filter((p) => p.name === BACK_PANEL_NAME);
  const run4 = kb.shown();
  const b4 = backsOf(run4);
  const stock4 = Array.from(new Set(b4.map((p) => stockKey(p.stock!, p.thicknessMm))));
  check(
    'BK4 цель «Задняя стенка всей кухни» — своя позиция ХДФ: роль коллекции «back»; все задние стенки «ХДФ 3 · ХДФ проба белая», лист своей группой hdf:3:item:<id>; корпус не тронут',
    TARGET_ROLE.back === 'back' &&
      hdf.roles.join() === 'back' &&
      b4.length > 0 &&
      b4.every((p) => p.material === `ХДФ ${P.backMm} · ${hdfItem.name}`) &&
      stock4.length === 1 &&
      stock4[0] === `hdf:${P.backMm}:item:${hdfItem.id}` &&
      run4.carcass?.back === hdfItem.id &&
      run4.carcass?.base === undefined,
    `${b4.length} шт. · ${Array.from(new Set(b4.map((p) => p.material)))} · ${stock4}`,
  );

  /* BK5 — EGGER на корпус после выбора ХДФ: задняя стенка та же позиция; корпус — EGGER. */
  const plan5 = materialOps('carcass', { item: eggerItem, collection: egger, surface: eggerItem.finishes[0] ?? 'matte' }, kb.shown(), null);
  if ('refusal' in plan5) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: EGGER на корпус отказал: ${plan5.refusal}`);
  kb.ops(plan5.ops);
  const run5 = kb.shown();
  const b5 = backsOf(run5);
  const sides5 = buildPanels({ run: run5, production: P, carcass: carcassItems }).filter((p) => p.name === 'Боковина');
  check(
    'BK5 EGGER на корпус после ХДФ: задние стенки — та же «ХДФ проба белая», боковины — EGGER; ХДФ не сброшена',
    b5.length === b4.length &&
      b5.every((p) => p.material === `ХДФ ${P.backMm} · ${hdfItem.name}`) &&
      run5.carcass?.back === hdfItem.id &&
      sides5.length > 0 &&
      sides5.every((p) => p.stock?.decor === `item:${eggerItem.id}`),
    `${Array.from(new Set(b5.map((p) => p.material)))} · боковины ${Array.from(new Set(sides5.map((p) => p.stock?.decor)))}`,
  );

  /* BK6 — смета, сцена, запись: строка позиции ХДФ «цена не задана», общая строка ХДФ уменьшилась ровно на неё; цвет сцены — ключ позиции; JSON туда и обратно. */
  const est6 = buildEstimate(run5, 'optimal', DEMO_RATES, [], undefined, undefined, undefined, undefined, carcassItems, items);
  const own6 = est6.lines.find((l) => l.key === `hdf_back_${hdfItem.id}`);
  const gen6 = est6.lines.find((l) => l.key === 'hdf_back');
  const area6 = Math.round(b5.reduce((s, p) => s + (p.lengthMm * p.widthMm * p.qty) / 1e6, 0) * 100) / 100;
  const scene6 = runBoxesByModule(run5, { thicknessMm: P.carcassMm, frontThicknessMm: P.frontMm, gapMm: P.frontGapMm, carcass: carcassItems } as never).modules
    .flatMap((m) => m.boxes)
    .filter((b) => b.panel === BACK_PANEL_NAME);
  const reopened = JSON.parse(JSON.stringify(run5)) as Run;
  check(
    'BK6 смета: «Задние стенки ХДФ «ХДФ проба белая»» = площадь задних стенок, цена не задана; общая ХДФ без них (все задние стенки своей позиции — строки нет); сцена — цвет позиции у каждой задней стенки; записал → открыл — позиция та же',
    own6 !== undefined &&
      Math.abs(own6.quantity - area6) < 0.011 &&
      Boolean(own6.priceUnset) &&
      hdf0 !== null &&
      Math.abs((gen6?.quantity ?? 0) + own6.quantity - hdf0) < 0.021 &&
      scene6.length > 0 &&
      scene6.every((b) => b.carcassKey === `carcass/${hdfItem.id}`) &&
      reopened.carcass?.back === hdfItem.id &&
      backsOf(reopened).every((p) => p.material === `ХДФ ${P.backMm} · ${hdfItem.name}`),
    `своя ${own6?.quantity} м² (${own6?.priceUnset ?? own6?.rate}) · общая ${gen6?.quantity} · было ${hdf0} · сцена ${Array.from(new Set(scene6.map((b) => b.carcassKey)))}`,
  );

  /*
   * BK7 — связь «задняя стенка → позиция» без своего выбора — «нет» даже при декоре корпуса ряда и модуля: та же
   * `carcassLink`, что зовут раскрой, сцена и смета. Иначе ХДФ брала бы ЛДСП корпуса, как только кто-то спросит без выбора.
   */
  const kc = kitchen();
  kc.ops([{ op: 'set_carcass', itemId: decor.id }]);
  const runC = kc.shown();
  const unitC = runC.modules.find((m) => m.kind === 'base');
  if (!unitC) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: нижнего модуля в демо нет');
  const withOwn = { ...unitC, carcassItemId: decor.id };
  check(
    'BK7 без своей позиции задней стенки связь — «нет» при декоре корпуса ряда и своём декоре модуля',
    carcassLink(unitC, runC, CARCASS, 'back').state === 'none' && carcassLink(withOwn, runC, CARCASS, 'back').state === 'none' && carcassLink(unitC, runC, CARCASS).state !== 'none',
    `${carcassLink(unitC, runC, CARCASS, 'back').state} · ${carcassLink(withOwn, runC, CARCASS, 'back').state} · корпус ${carcassLink(unitC, runC, CARCASS).state}`,
  );

  return { passed, failed };
}

if (process.argv[1]?.endsWith('verify-back.ts')) {
  const result = backChecks();
  console.log(`\n${result.passed} passed, ${result.failed} failed`);
  process.exit(result.failed > 0 ? 1 : 0);
}
