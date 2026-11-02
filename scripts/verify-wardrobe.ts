/**
 * ПРИЁМКА ГАРДЕРОБА (FINAL MASTER STAGE, фаза 3, WR1–WR7). Входит в `npm run test:hardware`.
 *
 * Путь экрана: шкаф спальни 1000 мм, отсек b1 476 мм со штангой (зона z1), отсек b2 с полками — та же сборка,
 * что у приёмки фурнитуры (H5). Правки — то, что шлёт блок «Наполнение» (`setZoneRodLook` → `set_fill`) и
 * панель «Фурнитура» (`set_fitting_finish`); штанга, держатели и вешалки — коробки сцены, длина — смета.
 */

import { DEFAULT_PRODUCTION, type CatalogEntryFull, type HardwareItem } from '../types/catalog';
import type { Measurement, MillworkOp, Module, ModuleFill, Run, RunRequirements, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { bayEnvelope, setZoneRod, setZoneRodLook } from '../lib/millwork/bays';
import { runBoxes, type PartBox } from '../lib/millwork/cabinetBoxes';
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
const P = DEFAULT_PRODUCTION;
const W_REQ: RunRequirements = { ...DEMO_REQUIREMENTS, zone: 'bedroom', mode: 'free', appliances: [], sections: [] };
const MEASUREMENT: Measurement = {
  id: 'wr',
  ceilingHeightMm: 2500,
  walls: [{ id: 'w1', lengthMm: 3000, angleDeg: 90, openings: [] }],
  comms: [],
  photos: [],
  measuredBy: 'WR',
  measuredAt: '2026-11-03',
  notes: '',
};

function wardrobe() {
  const input = workspaceInput({ title: 'WR', zone: 'Спальня', measurement: MEASUREMENT, requirements: W_REQ, rates: DEMO_RATES, wallId: 'w1', cornerAt: null, production: P, hardware: CATALOG });
  let edited: Partial<Record<VariantKey, Run>> = {};
  const variant = () => composeVariants(input, { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>, edited).find((v) => v.key === 'optimal')!;
  const shown = () => variant().run;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown(), requirements: W_REQ, ops: list, openings: input.openings, hardware: CATALOG });
    if (next.warnings.length === 0 || next.fingerprint !== shown().fingerprint) edited = { optimal: next };
    return next;
  };
  return { shown, ops, estimate: () => variant().estimate };
}
const boxes = (run: Run) => runBoxes(run, { thicknessMm: P.carcassMm, frontThicknessMm: P.frontMm, gapMm: P.frontGapMm, hardware: CATALOG, production: P } as never) as PartBox[];

export function wardrobeChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nГАРДЕРОБ: штанга (длина, глубина, сечение, покрытие, держатели), вешалки, чёрный пантограф');

  const w = wardrobe();
  const start = w.shown();
  const cabinet = start.modules.find((m) => m.section === 'shelves');
  if (!cabinet) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: в ряду спальни нет шкафа «Полки»');
  w.ops(start.modules.filter((m) => m.offsetMm > cabinet.offsetMm).map((m) => ({ op: 'remove_module' as const, moduleId: m.id })));
  w.ops([{ op: 'set_width', moduleId: cabinet.id, widthMm: 1000 }]);
  const unit0 = w.shown().modules.find((m) => m.id === cabinet.id)!;
  const fill = {
    ...unit0.fill!,
    shelves: [],
    dividerMm: 0,
    rodsMm: [],
    drawerHeights: [],
    bays: [
      { id: 'b1', widthMm: 476, shelves: { mode: 'even', count: 0 }, zones: [{ id: 'z1', rod: { belowTopMm: 60 } }] },
      { id: 'b2', shelves: { mode: 'even', count: 4 } },
    ],
  } as unknown as ModuleFill;
  const on = w.ops([{ op: 'set_fill', moduleId: cabinet.id, fill }]);
  if (on.warnings.length > 0 && !w.shown().modules.find((m) => m.id === cabinet.id)?.fill?.bays) throw new Error(`отсеки не встали: ${on.warnings.join(' | ')}`);
  const unitOf = (): Module => w.shown().modules.find((m) => m.id === cabinet.id)!;
  const env = () => bayEnvelope(unitOf(), w.shown(), P);
  const look = (patch: Parameters<typeof setZoneRodLook>[4]) => {
    const edit = setZoneRodLook(unitOf(), env(), 'b1', 'z1', patch);
    if ('refusal' in edit) return { refusal: edit.refusal, run: w.shown() };
    return { refusal: null, run: w.ops([{ op: 'set_fill', moduleId: cabinet.id, fill: edit.fill }]) };
  };
  const rodBoxes = (run: Run) => boxes(run).filter((b) => b.node === 'rod' && b.bayId === 'b1');
  const fp0 = runFingerprint(w.shown());
  const rodLine = () => w.estimate().lines.find((l) => l.key === 'bay_rod')?.quantity ?? NaN;
  const b0 = rodBoxes(w.shown());
  const rod0 = b0.find((b) => b.rodPart === 'rod')!;
  const len0 = Math.round(rod0.scale[0] * 1000);
  const line0 = rodLine();

  /* WR1 — штанга во весь проём: одна штанга, два фланца у боковин; сечение Ø25 условно. */
  check(
    `WR1 штанга во весь проём ${len0} мм: в сцене 1 штанга и 2 держателя (фланцы), сечение 25 мм; в смете ${line0} м`,
    b0.filter((b) => b.rodPart === 'rod').length === 1 && b0.filter((b) => b.rodPart === 'holder').length === 2 && Math.round(rod0.scale[1] * 1000) === 25 && len0 === 476,
    `коробок ${b0.length}: ${b0.map((b) => b.rodPart).join(',')}`,
  );

  /* WR2 — своя длина 400: по центру проёма, кронштейны к панели над зоной; смета по длине; отпечаток другой. */
  const r2 = look({ lengthMm: 400 });
  const b2 = rodBoxes(w.shown());
  const rod2 = b2.find((b) => b.rodPart === 'rod')!;
  const holders2 = b2.filter((b) => b.rodPart === 'holder');
  check(
    'WR2 своя длина 400 — штанга 400 по центру проёма, держатели — кронштейны от верха штанги к панели над зоной (60 − 12,5 = 47,5 мм); в смете 0.4 м; отпечаток другой',
    r2.refusal === null && Math.round(rod2.scale[0] * 1000) === 400 && Math.abs(rod2.position[0] - rod0.position[0]) < 1e-6 &&
      holders2.length === 2 && holders2.every((h) => Math.abs(h.scale[1] * 1000 - 47.5) < 0.01) && Math.abs(rodLine() - 0.4) < 1e-9 && runFingerprint(w.shown()) !== fp0,
    `${Math.round(rod2.scale[0] * 1000)} мм · держатели ${holders2.map((h) => Math.round(h.scale[1] * 1000)).join('/')} · смета ${line0} → ${rodLine()} м`,
  );

  /* WR3 — длиннее проёма и у кромки корпуса — отказ словами. */
  const r3a = look({ lengthMm: len0 + 50 });
  const r3b = look({ depthMm: 5 });
  check(
    'WR3 длиннее проёма — «длиннее проёма отсека на 50 мм»; ось у кромки — «вышло бы за корпус»',
    /длиннее проёма отсека .* на 50 мм/.test(r3a.refusal ?? '') && /вышло бы за корпус/.test(r3b.refusal ?? ''),
    `${r3a.refusal} | ${r3b.refusal}`,
  );

  /* WR4 — место по глубине 200, овал, чёрный: ось в сцене на 200 от кромки, сечение 15 × 30, покрытие у штанги и держателей. */
  look({ depthMm: 200 });
  look({ profile: 'oval' });
  look({ finish: 'black' });
  const b4 = rodBoxes(w.shown());
  const rod4 = b4.find((b) => b.rodPart === 'rod')!;
  check(
    'WR4 ось на 200 мм от кромки, овал 30 × 15, чёрный — у штанги и держателей',
    Math.round(-rod4.position[2] * 1000) === 200 && Math.round(rod4.scale[1] * 1000) === 15 && Math.round(rod4.scale[2] * 1000) === 30 && b4.filter((b) => b.rodPart !== 'hanger').every((b) => b.profile === 'black'),
    `z ${Math.round(-rod4.position[2] * 1000)} · сечение ${Math.round(rod4.scale[1] * 1000)}×${Math.round(rod4.scale[2] * 1000)} · ${b4.map((b) => b.profile ?? '-').join(',')}`,
  );

  /* WR5 — вешалки 6 белых поровну по штанге, в смету не идут; 0 и 61 — отказ. */
  const est5 = w.estimate().lines.length;
  look({ hangers: { count: 6, color: 'white' } });
  const hangers = rodBoxes(w.shown()).filter((b) => b.rodPart === 'hanger');
  const xs = Array.from(new Set(hangers.map((h) => Math.round(h.position[0] * 1000)))).sort((a, b) => a - b);
  const steps = xs.slice(1).map((x, i) => x - xs[i]);
  const r5 = look({ hangers: { count: 61 } });
  check(
    'WR5 вешалки 6 белых: 6 поровну по штанге (шаг 67 мм ± 1), белые, в смете строк не прибавилось; 61 — отказ',
    xs.length === 6 && steps.every((s) => Math.abs(s - 400 / 6) <= 1) && hangers.every((h) => h.material === 'carcass') && w.estimate().lines.length === est5 && /от 1 до 60/.test(r5.refusal ?? ''),
    `вешалок ${xs.length}, шаг ${steps.join('/')} · строк сметы ${est5} → ${w.estimate().lines.length} · ${r5.refusal}`,
  );

  /* WR6 — высоту штанги переставили: вид штанги остался. */
  const moved = setZoneRod(unitOf(), env(), 'b1', 'z1', 120);
  if ('refusal' in moved) throw new Error(`высота штанги не встала: ${moved.refusal}`);
  w.ops([{ op: 'set_fill', moduleId: cabinet.id, fill: moved.fill }]);
  const after6 = unitOf().fill!.bays![0].zones![0].rod!;
  check(
    'WR6 высоту штанги переставили (ниже верха зоны 60 → 120) — длина, глубина, сечение, покрытие и вешалки остались',
    after6.belowTopMm === 120 && after6.lengthMm === 400 && after6.depthMm === 200 && after6.profile === 'oval' && after6.finish === 'black' && after6.hangers?.count === 6,
    JSON.stringify(after6),
  );

  /* WR7 — пантограф 805.20.625 (белый по таблице): «чёрный матовый» — вид; артикул и ход те же, подпись говорит это. */
  w.ops([{ op: 'set_fitting', moduleId: cabinet.id, slot: 'pantograph', bayId: 'b1', itemId: item('MFR-HAFELE-805.20.625').id }]);
  const pg0 = boxes(w.shown()).find((b) => b.pantograph && b.bayId === 'b1');
  const fp7 = runFingerprint(w.shown());
  const r7 = w.ops([{ op: 'set_fitting_finish', moduleId: cabinet.id, slot: 'pantograph', bayId: 'b1', finish: 'black_matte' }]);
  const pg1 = boxes(w.shown()).find((b) => b.pantograph && b.bayId === 'b1');
  const fit = unitOf().fittings?.find((f) => f.slot === 'pantograph');
  check(
    'WR7 пантограф «чёрный матовый» — вид: корпус чёрный, позиция та же, ход и геометрия те же, слова «вид, не исполнение позиции»',
    r7.warnings.length === 0 && pg0?.pantograph?.spec.body === 'white' && pg1?.pantograph?.spec.body === 'black' && pg1?.pantograph?.spec.visualFinish === 'black_matte' &&
      /вид, не исполнение позиции/.test(pg1?.pantograph?.spec.finishWords ?? '') && fit?.itemId === item('MFR-HAFELE-805.20.625').id &&
      JSON.stringify(pg0?.pantograph?.geom) === JSON.stringify(pg1?.pantograph?.geom) && runFingerprint(w.shown()) !== fp7,
    `${pg0?.pantograph?.spec.body} → ${pg1?.pantograph?.spec.body} · ${pg1?.pantograph?.spec.finishWords}`,
  );

  return { passed, failed };
}

if (process.argv[1]?.includes('verify-wardrobe')) {
  const r = wardrobeChecks();
  console.log(`\n${r.passed} passed, ${r.failed} failed`);
  if (r.failed > 0) process.exit(1);
}
