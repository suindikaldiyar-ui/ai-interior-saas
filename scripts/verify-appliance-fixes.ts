/**
 * ПРИЁМКА ИСПРАВЛЕНИЙ ТЕХНИКИ И СВОДКИ ПРИСАДКИ (FINAL MASTER STAGE, фазы 5–6, AF1–AF7). В `npm run test:hardware`.
 *
 * Своя сборка кухни: пустая стена демо, приборы ставит человек (`add_module`), модель — `set_appliance_model`
 * (то, что шлёт выбор модели в своей сборке). По готовому решению — демо-кухня. Замена модуля — `replace_module`
 * («Тип» и «Техника» в списке модуля). Присадка — `drillingPlan` и `drillingBlockers`.
 */

import { DEFAULT_PRODUCTION, type CatalogEntryFull } from '../types/catalog';
import type { MillworkOp, Module, Run, RunRequirements, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput, panelWallsOf, wallSegments } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { allModules } from '../lib/millwork/layout';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { drillingBlockers, drillingPlan } from '../lib/millwork/drillingPlan';

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
const FREE: RunRequirements = { ...DEMO_REQUIREMENTS, mode: 'free', appliances: [], sections: [] };

function screen(requirements: RunRequirements) {
  const base = workspaceInput({ title: 'AF', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements, rates: DEMO_RATES, production: P, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: CATALOG });
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>, edited).find((v) => v.key === 'optimal')!.run;
  const ops = (list: MillworkOp[], req: RunRequirements = requirements) => {
    const next = applyOps({ run: shown(), requirements: req, ops: list, openings: input.openings, hardware: CATALOG });
    if (next.warnings.length === 0 || next.fingerprint !== shown().fingerprint) edited = { optimal: next };
    return next;
  };
  return { shown, ops, input };
}
const withAppliance = (run: Run, kind: string): Module[] => allModules(run).filter((m) => m.appliance === kind || m.column?.top === kind || m.column?.bottom === kind);

export function applianceFixChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nТЕХНИКА И ПРИСАДКА: модель в своей сборке, замена модуля без потери прибора, «почему нет отверстий»');

  /* AF1 — своя сборка: СВЧ и духовка — модулями; модель СВЧ кладётся операцией на модуль, ряд не пересобирается. */
  const f = screen(FREE);
  f.ops([{ op: 'add_module', kind: 'tall', appliance: 'microwave' }]);
  f.ops([{ op: 'add_module', kind: 'tall', appliance: 'oven' }]);
  const before = f.shown().modules.map((m) => `${m.id}:${m.widthMm}`).join(',');
  const w1 = f.ops([{ op: 'set_appliance_model', appliance: 'microwave', model: 'BFL524MB2' }]);
  const mw = withAppliance(f.shown(), 'microwave')[0];
  check(
    'AF1 своя сборка: модель СВЧ BFL524MB2 легла на модуль ряда операцией, модули и ширины те же',
    w1.warnings.length === 0 && mw?.applianceModels?.microwave === 'BFL524MB2' && f.shown().modules.map((m) => `${m.id}:${m.widthMm}`).join(',') === before,
    `${mw?.id} ${JSON.stringify(mw?.applianceModels ?? null)} · ${w1.warnings.join(' | ')}`,
  );

  /* AF2 — модель другой ширины модуля — отказ словами; чужая модель — отказ. */
  f.ops([{ op: 'add_module', kind: 'base', appliance: 'hob' }]);
  const r2 = f.ops([{ op: 'set_appliance_model', appliance: 'hob', model: 'PIV975DC1E' }]);
  const r2b = f.ops([{ op: 'set_appliance_model', appliance: 'microwave', model: 'PUE611BB5E' }]);
  check(
    'AF2 модель варочной 90 см на модуль 600 — «ставится в модуль 900 мм»; модель чужого прибора — отказ',
    /ставится в модуль 900 мм/.test(r2.warnings[0] ?? '') && /в фактах нет/.test(r2b.warnings[0] ?? ''),
    `${r2.warnings[0]} | ${r2b.warnings[0]}`,
  );

  /* AF3 — прибор, добавленный руками, получает модель кухни; без выбора — без модели. */
  const req3: RunRequirements = { ...FREE, applianceModels: { dishwasher60: 'SMV4HMX25Q' } };
  const w3 = f.ops([{ op: 'add_module', kind: 'base', appliance: 'dishwasher60' }], req3);
  const dw = withAppliance(f.shown(), 'dishwasher60')[0];
  check('AF3 посудомойка, поставленная руками, получила модель кухни SMV4HMX25Q', w3.warnings.length === 0 && dw?.applianceModels?.dishwasher60 === 'SMV4HMX25Q', `${dw?.id} ${JSON.stringify(dw?.applianceModels ?? null)}`);

  /* AF4 — своя сборка: замена модуля СВЧ шкафом — отказ словами (прибор не пропадает молча). */
  const r4 = f.ops([{ op: 'replace_module', moduleId: mw!.id, kind: 'tall' }]);
  check(
    'AF4 своя сборка: СВЧ заменить пеналом без прибора — отказ «пропали бы … микроволновка», СВЧ на месте',
    /пропали бы/.test(r4.warnings[0] ?? '') && withAppliance(f.shown(), 'microwave').length === 1,
    r4.warnings[0] ?? '',
  );

  /* AF5 — замена тем же прибором (другой вариант «Техники») — модель остаётся. */
  const w5 = f.ops([{ op: 'replace_module', moduleId: mw!.id, kind: 'tall', appliance: 'microwave' }]);
  const mw5 = withAppliance(f.shown(), 'microwave')[0];
  check('AF5 замена тем же прибором — модель BFL524MB2 и ширина на месте', w5.warnings.length === 0 && mw5?.applianceModels?.microwave === 'BFL524MB2' && mw5.widthMm === mw!.widthMm, `${JSON.stringify(mw5?.applianceModels ?? null)} ${mw5?.widthMm}`);

  /* AF6 — по готовому решению прежний запрет на месте: колонну «духовка + СВЧ» нижним шкафом не заменить. */
  const t = screen(DEMO_REQUIREMENTS);
  const col = allModules(t.shown()).find((m) => m.appliance === 'oven');
  const r6 = col ? t.ops([{ op: 'replace_module', moduleId: col.id, kind: 'base' }]) : null;
  check('AF6 по готовому решению прежний запрет: пенал духовки шкафом не заменить — прибор принадлежит кухне', Boolean(r6 && /пропали бы/.test(r6.warnings[0] ?? '')), r6?.warnings[0] ?? 'пенала духовки нет');

  /* AF7 — «почему нет отверстий»: без правил цеха первая группа — цех; ручка без позиции — «выбирают в проекте». */
  const plan = drillingPlan({ walls: panelWallsOf(null, wallSegments(null, t.shown(), {}), t.input.runWallId), production: P, hardware: CATALOG });
  const blockers = drillingBlockers(plan);
  check(
    'AF7 «почему нет отверстий» (демо без правил цеха): группы «цех» (конфирматы), «выбор» (ручка, полкодержатель) — с числом деталей',
    plan.parts.every((p) => p.ops.length === 0) &&
      blockers.some((b) => b.who === 'shop' && /конфирмат/.test(b.words) && b.parts > 0) &&
      blockers.some((b) => b.who === 'choose' && /ручк/.test(b.words) && b.parts > 0) &&
      blockers.some((b) => b.who === 'choose' && /полкодержател/.test(b.words) && b.parts > 0) &&
      blockers[0].who === 'shop',
    blockers.slice(0, 5).map((b) => `${b.who} ${b.parts}: ${b.words.slice(0, 70)}`).join(' | '),
  );

  return { passed, failed };
}

if (process.argv[1]?.includes('verify-appliance-fixes')) {
  const r = applianceFixChecks();
  console.log(`\n${r.passed} passed, ${r.failed} failed`);
  if (r.failed > 0) process.exit(1);
}
