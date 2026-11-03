/**
 * ПРИЁМКА ТВ-ЗОНЫ ПРИ СМЕНЕ ДЛИНЫ СТЕНЫ В СВОЕЙ СБОРКЕ (FINAL MASTER STAGE, задача 3, TVL1–TVL5). В `npm run test:millwork`.
 *
 * Путь экрана: готовая ТВ-зона (A, C) на стене 3800 → своя сборка (`mode: 'free'`, ряд правленый) → правка руками →
 * новая длина стены тем же путём, что `applyWallLength` экрана: `wallLengthVerdict` до записи, затем ряд новой длины
 * через `applyOps` с пустым списком операций. Мебель, телевизор и панели сами не двигаются: всё, что стоит на стене,
 * обязано остаться на своих отметках или длина — отказ словами с мм.
 */

import { DEFAULT_PRODUCTION } from '../types/catalog';
import type { MillworkOp, Run, RunRequirements, VariantKey } from '../types/millwork';
import type { Survey } from '../types/survey';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { allModules } from '../lib/millwork/layout';
import { wallLengthVerdict } from '../lib/millwork/wallLength';
import { tvRect, tvRefusal, wallPanelRefusal } from '../lib/millwork/tvZone';
import { RUN_TEMPLATES, requirementsFromTemplate } from '../lib/millwork/templates';

type Check = (name: string, ok: boolean, detail?: string) => void;
const P = DEFAULT_PRODUCTION;
const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;

function zone(variant: 'A' | 'C') {
  const tpl = RUN_TEMPLATES.find((t) => t.tvZone === variant);
  if (!tpl) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: шаблона ТВ-зоны ${variant} нет`);
  const template = requirementsFromTemplate(tpl, DEMO_REQUIREMENTS.options);
  const measurement = { ...DEMO_MEASUREMENT, walls: DEMO_MEASUREMENT.walls.map((w, i) => (i === 0 ? { ...w, lengthMm: 3800, openings: [] } : w)) };
  const base = workspaceInput({ title: 'TVL', zone: 'Зал', measurement, requirements: template, rates: DEMO_RATES, cornerAt: null, wallId: 'w1' });
  const input = objectInput({ base, resolution: null, requirements: template, rates: DEMO_RATES, production: P, milling: new Map(), carcass: new Map(), materials: new Map() });
  /* Своя сборка от собранной зоны: ряд правленый, раскладка больше не выводится из длины. */
  const free: RunRequirements = { ...template, mode: 'free' };
  let run = composeVariants(input, DISABLED, {}).find((v) => v.key === 'optimal')!.run;
  const survey = { walls: measurement.walls.map((w) => ({ id: w.id, lengthMm: { state: 'measured', value: w.lengthMm }, openings: [] })), comms: [] } as unknown as Survey;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run, requirements: free, ops: list, openings: input.openings });
    if (next.warnings.length === 0) run = next;
    return next.warnings;
  };
  /* Новая длина — как у экрана: вердикт до записи, ряд новой длины пустой правкой. */
  const length = (lengthMm: number) => {
    const verdict = wallLengthVerdict({ survey, wallId: 'w1', lengthMm, label: 'Стена 1', furniture: { run, startMm: 0, edited: true, free: true } });
    if (verdict.kind !== 'apply') return { verdict, next: null };
    const next = verdict.runLengthMm === null ? run : applyOps({ run: { ...run, lengthMm: verdict.runLengthMm }, requirements: free, ops: [], openings: input.openings });
    return { verdict, next };
  };
  return { shown: () => run, ops, length };
}

const placesOf = (run: Run) => allModules(run).map((m) => `${m.label}@${m.offsetMm}+${m.widthMm}`).join(' | ');

export function tvWallLengthChecks(check: Check): void {
  console.log('\nТВ-ЗОНА В СВОЕЙ СБОРКЕ ПРИ СМЕНЕ ДЛИНЫ СТЕНЫ: телевизор, тумбы и витрины на своих отметках');

  /* TVL1 — длиннее (4200) и короче, но с запасом (3400): модули, телевизор и панели на своих отметках, ряд новой длины. */
  const a = zone('A');
  const a0 = a.shown();
  const long = a.length(4200);
  const short = a.length(3400);
  const same = (r: Run | null) => Boolean(r) && placesOf(r!) === placesOf(a0) && JSON.stringify(r!.tv) === JSON.stringify(a0.tv);
  check(
    'TVL1 A, своя сборка: стена 3800 → 4200 и → 3400 — тумбы и телевизор на своих отметках, ряд новой длины, отказов нет',
    long.next?.lengthMm === 4200 && short.next?.lengthMm === 3400 && same(long.next) && same(short.next) && (short.next?.warnings.length ?? 1) === 0 && Boolean(a0.tv),
    `${placesOf(a0)} · ТВ ${a0.tv?.centerMm}`,
  );

  /* TVL2 — короче мебели: отказ словами с мм, ряд и замер прежние. */
  const r2 = a.length(3000);
  check(
    'TVL2 A: стена 3000 при тумбе до 3100 — отказ «не хватает 100 мм», ничего не записано',
    r2.verdict.kind === 'refuse' && /не хватает 100 мм/.test(r2.verdict.text) && r2.next === null,
    r2.verdict.kind === 'refuse' ? r2.verdict.text : JSON.stringify(r2.verdict),
  );

  /* TVL3 — сняли правую тумбу: мебель кончается на 2300, телевизор — на 2849. Стена 2500: телевизор вышел бы за стену. */
  const right = allModules(a.shown()).reduce((far, m) => (m.offsetMm > far.offsetMm ? m : far));
  const w3 = a.ops([{ op: 'remove_module', moduleId: right.id }]);
  const tvEnd = tvRect(a.shown().tv!).x1;
  const r3 = a.length(2500);
  check(
    `TVL3 A без правой тумбы: мебель до 2300, телевизор до ${tvEnd} мм — стена 2500: отказ «телевизор … не хватает ${tvEnd - 2500} мм» (раньше телевизор молча уходил за стену)`,
    w3.length === 0 && r3.verdict.kind === 'refuse' && new RegExp(`телевизор .*не хватает ${tvEnd - 2500} мм`).test(r3.verdict.text),
    r3.verdict.kind === 'refuse' ? r3.verdict.text : `применено: ТВ ${r3.next?.tv ? tvRefusal(r3.next, r3.next.tv) : '—'}`,
  );

  /* TVL4 — C: сняли правую витрину — панель стены идёт до 3350; стена 3300: отказ про панель. */
  const c = zone('C');
  const c0 = c.shown();
  const vit = allModules(c0).reduce((far, m) => (m.offsetMm > far.offsetMm ? m : far));
  const w4 = c.ops([{ op: 'remove_module', moduleId: vit.id }]);
  const panelEnd = Math.max(...(c.shown().wallPanels ?? []).map((p) => p.fromMm + p.widthMm));
  const r4 = c.length(3300);
  check(
    `TVL4 C без правой витрины: панель стены до ${panelEnd} мм — стена 3300 (мебель до 3250 влезает): отказ «панель стены … не хватает ${panelEnd - 3300} мм»`,
    w4.length === 0 && r4.verdict.kind === 'refuse' && new RegExp(`панель стены .*не хватает ${panelEnd - 3300} мм`).test(r4.verdict.text),
    r4.verdict.kind === 'refuse' ? r4.verdict.text : `применено: панели ${(r4.next?.wallPanels ?? []).map((p) => wallPanelRefusal(r4.next!, p)).join('/')}`,
  );

  /* TVL5 — C целиком, стена 4200: витрины, тумбы, телевизор и панель на своих отметках — ничего не потеряно. */
  const c2 = zone('C');
  const c2r = c2.length(4200).next;
  check(
    'TVL5 C, своя сборка, стена 3800 → 4200: витрины, тумбы, телевизор и панель на своих отметках, ряд 4200',
    Boolean(c2r) && c2r!.lengthMm === 4200 && placesOf(c2r!) === placesOf(c0) && JSON.stringify(c2r!.tv) === JSON.stringify(c0.tv) && JSON.stringify(c2r!.wallPanels) === JSON.stringify(c0.wallPanels),
    `${placesOf(c0)} · панели ${JSON.stringify((c0.wallPanels ?? []).map((p) => [p.fromMm, p.widthMm]))}`,
  );
}

if (process.argv[1]?.endsWith('verify-tv-wall-length.ts')) {
  let passed = 0;
  let failed = 0;
  tvWallLengthChecks((name, ok, detail = '') => {
    if (ok) passed += 1;
    else failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
  });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
