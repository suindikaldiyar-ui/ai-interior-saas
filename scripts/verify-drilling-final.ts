/**
 * ПРИЁМКА ПРИСАДКИ ПОСЛЕ ВЫБОРА ФУРНИТУРЫ И ПОДТВЕРЖДЁННЫХ ПРАВИЛ ЦЕХА (FINAL MASTER STAGE, задача 5, DF1–DF6).
 * В `npm run test:hardware`.
 *
 * Путь экрана: демо-кухня, позиции производителей — `set_fitting` (то, что ставит «Фурнитура»), правила цеха —
 * `ProductionSettings.drilling` (то, что сохраняют «Настройки цеха» и «Документы → Присадка»). Отверстия появляются
 * там, где известно всё: правило цеха подтверждено, позиция выбрана, производитель напечатал Ø и глубину. Всё
 * остальное — «не рассчитано» словами, и выпуск в цех заперт: неподтверждённое не выдаётся за готовое.
 */

import { DEFAULT_PRODUCTION, type CatalogEntryFull, type DrillingSettings, type HardwareItem, type ProductionSettings } from '../types/catalog';
import type { MillworkOp, Run, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput, panelWallsOf, wallSegments } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { drillingBlockers, drillingPlan, drillingSummary, type DrillingPlan } from '../lib/millwork/drillingPlan';
import { drillingCsv, drillingPdfPages } from '../lib/millwork/drillingExport';
import { FRIDGE_PANEL_PART_NAME } from '../lib/millwork/fridgePanels';
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
const item = (article: string): HardwareItem => {
  const found = CATALOG.get(`hw:${article}`);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: позиции ${article} в фактах нет`);
  return found;
};
/** Правила цеха, как их сохраняет форма «Присадка — правила цеха»: числа цеха и галочка «Цех подтвердил». */
const RULES: DrillingSettings = {
  hingeEdgeMm: 100,
  hingeCount: [
    { upToMm: 900, hinges: 2 },
    { upToMm: 1600, hinges: 3 },
  ],
  plateOnCupAxis: true,
  handleHoleMm: 5,
  handlePlaceConfirmed: true,
  shelfSupport: { frontMm: 37, backMm: 37 },
  confirmat: { faceDiameterMm: 7, edgeDiameterMm: 5, edgeDepthMm: 50, fromFrontMm: 50, fromBackMm: 50 },
  minRemainMm: 3,
  confirmed: true,
};
const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
const DOORS = ['base-1200@w1', 'base-3300@w1'];

/* Стена А 3900 без окна: над мойкой — навесной шкаф 600 (для СВЧ в навесном шкафу, как у WM). */
const NO_WINDOW = {
  ...DEMO_MEASUREMENT,
  walls: DEMO_MEASUREMENT.walls.map((w) => ({ ...w, lengthMm: w.id === 'w1' ? 3900 : w.lengthMm, openings: w.openings.filter((o) => o.kind !== 'window') })),
} as typeof DEMO_MEASUREMENT;

function kitchen(production: ProductionSettings, measurement: typeof DEMO_MEASUREMENT = DEMO_MEASUREMENT) {
  const base = workspaceInput({ title: 'DF', zone: 'Кухня', measurement, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: CATALOG });
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, DISABLED, edited).find((v) => v.key === 'optimal')!.run;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown(), requirements: DEMO_REQUIREMENTS, ops: list, openings: input.openings, hardware: CATALOG });
    if (next.warnings.length > 0) throw new Error(`правка отклонена: ${next.warnings.join(' | ')}`);
    edited = { optimal: next };
  };
  const plan = (p: ProductionSettings = production): DrillingPlan =>
    drillingPlan({ walls: panelWallsOf(null, wallSegments(null, shown(), {}), input.runWallId), production: p, hardware: CATALOG });
  return { shown, ops, plan };
}

/** Фурнитура, как её ставит «Фурнитура»: петля Blum с планкой и скоба Häfele на двух дверцах. */
const FITTINGS: MillworkOp[] = DOORS.flatMap((moduleId) => [
  { op: 'set_fitting', moduleId, slot: 'hinge', itemId: item('MFR-BLUM-71B3550').id },
  { op: 'set_fitting', moduleId, slot: 'hinge_plate', itemId: item('MFR-BLUM-173L8130').id },
  { op: 'set_fitting', moduleId, slot: 'handle', itemId: item('MFR-HAFELE-115.52.630').id },
] as MillworkOp[]);

const META: Parameters<typeof drillingCsv>[1] = { projectId: 'df', title: 'DF', date: '2026-11-03', fingerprint: 'df' };

export function drillingFinalChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nПРИСАДКА ПОСЛЕ ВЫБОРА ФУРНИТУРЫ: подтверждённое — отверстиями, неподтверждённое — словами и под замком');

  /* DF1 — без правил цеха и без позиций: отверстий 0 у всего ряда, причины у каждой детали. */
  const bare = kitchen(DEFAULT_PRODUCTION);
  const p0 = bare.plan();
  const s0 = drillingSummary(p0);
  check(
    `DF1 без правил цеха и позиций: отверстий 0 у ${s0.parts} деталей, «не рассчитано» у ${s0.pending}; выпуск заперт «не подтверждены цехом»`,
    s0.ops === 0 && s0.pending > 0 && !p0.release.open && p0.release.reasons.some((r) => /не подтверждены цехом/.test(r)),
    p0.release.reasons.join(' | '),
  );

  /* DF2 — правила цеха подтверждены, позиции выбраны: чашки, планки, ручки, конфирматы — отверстиями; проверки чисты. */
  const k = kitchen({ ...DEFAULT_PRODUCTION, drilling: RULES });
  k.ops(FITTINGS);
  const p2 = k.plan();
  const s2 = drillingSummary(p2);
  const opsOf = (moduleId: string, role: string) => p2.parts.filter((p) => p.moduleId === moduleId).flatMap((p) => p.ops.filter((o) => o.role === role));
  const cups = DOORS.map((m) => opsOf(m, 'hinge_cup').length);
  const plates = DOORS.map((m) => opsOf(m, 'hinge_plate').length);
  const handles = DOORS.map((m) => opsOf(m, 'handle').length);
  const confirmats = p2.parts.flatMap((p) => p.ops).filter((o) => /confirmat/.test(o.role)).length;
  check(
    `DF2 правила подтверждены, позиции выбраны: чашки ${cups.join('/')}, планки ${plates.join('/')}, ручки ${handles.join('/')}, конфирматов ${confirmats}; отверстий всего ${s2.ops} у ${s2.drilled} деталей; проверок 0`,
    cups.every((n) => n === 2) && plates.every((n) => n === 4) && handles.every((n) => n === 2) && confirmats > 0 && s2.ops > s0.ops && p2.issues.length === 0,
    `роли: ${Array.from(new Set(p2.parts.flatMap((p) => p.ops.map((o) => o.role)))).join(', ')} · ${p2.issues.map((i) => i.words).slice(0, 2).join(' | ')}`,
  );

  /* DF3 — но у позиций, которые не выбраны, и у того, чего производитель не напечатал, отверстий нет: выпуск заперт. */
  const blockers = drillingBlockers(p2);
  check(
    `DF3 отверстий нет там, где не выбрана позиция (${blockers.filter((b) => b.who === 'choose').length} причин) или производитель не напечатал (${blockers.filter((b) => b.who === 'manufacturer').length}); выпуск заперт «не рассчитано на N дет.»`,
    !p2.release.open && p2.release.reasons.some((r) => /не рассчитано на \d+ дет\./.test(r)) && blockers.some((b) => b.who === 'choose') && s2.pending > 0,
    `${p2.release.reasons.join(' | ')} · ${blockers.slice(0, 4).map((b) => `${b.who}: ${b.words} (${b.parts})`).join(' ; ')}`,
  );

  /* DF4 — правила записаны, но «Цех подтвердил» снят: отверстия считаются для проверки, выпуск заперт и PDF — черновик. */
  const p4 = k.plan({ ...DEFAULT_PRODUCTION, drilling: { ...RULES, confirmed: false } });
  const pdf = drillingPdfPages(p4, META).join('\n');
  check(
    'DF4 «Цех подтвердил» снят: те же отверстия, выпуск заперт «не подтверждены цехом», PDF — «ЧЕРНОВИК ПРИСАДКИ — НЕ ДЛЯ ЦЕХА»',
    drillingSummary(p4).ops === s2.ops && !p4.release.open && p4.release.reasons.some((r) => /не подтверждены цехом/.test(r)) && /ЧЕРНОВИК ПРИСАДКИ/.test(pdf),
    p4.release.reasons.join(' | '),
  );

  /* DF5 — детали этого этапа под подтверждёнными правилами: планки холодильника и полка над нишей СВЧ — «правило цеха не задано». */
  const k5 = kitchen({ ...DEFAULT_PRODUCTION, drilling: RULES }, NO_WINDOW);
  const fridge = k5.shown().modules.find((m) => m.appliance === 'fridge')!;
  k5.ops([{ op: 'set_fridge_panel', moduleId: fridge.id, side: 'left', panel: { kind: 'decorative' } }]);
  const upper = k5.shown().upperSegments.flatMap((s) => s.modules).find((m) => m.kind === 'upper' && m.widthMm === 600 && !m.appliance);
  if (upper) {
    k5.ops([{ op: 'set_variant', moduleId: upper.id, variant: 'upper_micro' }]);
    k5.ops([{ op: 'set_appliance_model', appliance: 'microwave', model: 'BFL524MB2', moduleId: upper.id }]);
  }
  const p5 = k5.plan();
  const plank = p5.parts.find((p) => p.name === FRIDGE_PANEL_PART_NAME.left);
  const shelf = p5.parts.find((p) => p.name === WALL_MICROWAVE_SHELF_NAME);
  check(
    'DF5 планка холодильника и полка над нишей СВЧ при подтверждённых правилах: отверстий 0, «правило цеха не задано» — неподтверждённое не выдаётся за готовое',
    Boolean(plank) && plank!.ops.length === 0 && plank!.pending.length > 0 && Boolean(upper) && Boolean(shelf) && shelf!.ops.length === 0 && shelf!.pending.length > 0 &&
      drillingBlockers(p5).filter((b) => /планки холодильника|неподвижной полки/.test(b.words)).every((b) => b.who === 'shop'),
    `${plank?.pending.map((x) => x.why[0]).join('; ')} | ${shelf ? shelf.pending.map((x) => x.why[0]).join('; ') : 'НУЛЕВОЙ СЕЛЕКТОР: верхнего шкафа 600 в демо нет'}`,
  );

  /* DF6 — CSV говорит цеху то же, что план: у незакрытой детали строка «не рассчитано: …» и «готова: нет». */
  const csv = drillingCsv(p5, META).split('\n');
  const plankRows = csv.filter((line) => line.includes(FRIDGE_PANEL_PART_NAME.left));
  check(
    'DF6 CSV: у планки холодильника — «не рассчитано: крепление планки холодильника» и «нет» в готовности; выпуск заперт',
    plankRows.length > 0 && plankRows.every((line) => /не рассчитано: крепление планки холодильника/.test(line) && /;нет\s*(;|$)/.test(line)) && !p5.release.open,
    plankRows.slice(0, 1).join('').slice(0, 300) || 'НУЛЕВОЙ СЕЛЕКТОР: строки планки в CSV нет',
  );

  return { passed, failed };
}

if (process.argv[1]?.endsWith('verify-drilling-final.ts')) {
  const result = drillingFinalChecks();
  console.log(`\n${result.passed} passed, ${result.failed} failed`);
  process.exit(result.failed > 0 ? 1 : 0);
}
