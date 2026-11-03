/**
 * ПРИЁМКА ДЕТАЛИРОВКИ И КАРТЫ РАСКРОЯ (FINAL MASTER STAGE, задача 4, DT1–DT5). В `npm run test:millwork`.
 *
 * Деталь, которую режет цех, и деталь, которую видит клиент в 3D, — одна: у каждого модуля каждая деталь раскроя с
 * местом в сцене (корпус, полки, перегородки, задняя стенка, планки холодильника, полка над нишей СВЧ) сверяется с
 * коробками сцены по имени — штуки и три размера до миллиметра. Фасады сверяет F9. Карта раскроя — каждая деталь на
 * листе, ошибок раскладки нет, кромка карты = кромка деталировки, лист детали — из её материала.
 *
 * Конфигурации — те же, что у эталона P1 (`baselineKeys`: каждый шаблон на мин / середине / макс длины), на двух
 * школах цеха (умолчания и 600/300), плюс демо-кухня со всеми деталями этого этапа. Число сверенных деталей
 * объявлено: тихо уменьшиться оно не имеет права.
 */

import { DEFAULT_PRODUCTION, TYPICAL_CUTTING, type CatalogEntryFull, type CuttingSettings, type ProductionSettings } from '../types/catalog';
import type { MillworkOp, Panel, Run, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput, panelWallsOf } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { runBoxesByModule } from '../lib/millwork/cabinetBoxes';
import {
  BACK_PANEL_NAME,
  BOTTOM_PANEL_NAME,
  DIVIDER_PANEL_NAME,
  HDIVIDER_PANEL_NAME,
  SHELF_PANEL_NAME,
  SIDE_PANEL_NAME,
  TOP_PANEL_NAME,
  TOP_RAIL_PANEL_NAME,
  buildPanels,
  objectPanels,
  panelMaterials,
} from '../lib/millwork/panels';
import { FRIDGE_PANEL_PART_NAME } from '../lib/millwork/fridgePanels';
import { WALL_MICROWAVE_SHELF_NAME } from '../lib/millwork/wallMicrowave';
import { cuttingPlan } from '../lib/millwork/cutting';
import { baselineKeys, baselineRun } from './p1-baseline';

type Check = (name: string, ok: boolean, detail?: string) => void;

const CATALOG = hardwareCatalog(
  HARDWARE_FACTS.map((fact) => {
    const row = hardwareCatalogRow(fact);
    return {
      id: `hw:${fact.article}`, org_id: 'org', category_id: 'cat', article: row.article, name_ru: row.name_ru, name_kk: row.name_kk, description: '',
      price: 0, unit: row.unit, dimensions: {}, tiling: {}, meta: { hardware: fact.hardware }, is_active: true, assets: [],
    } as unknown as CatalogEntryFull;
  }),
);
const SCHOOL_B: ProductionSettings = { ...DEFAULT_PRODUCTION, depths: { baseMm: 600, upperMm: 300, mezzanineMm: 600 } };
/* Третья школа — свои припуски цеха: на умолчаниях полка «проём − 2» и перегородка «глубина − 16» неотличимы от раскроя. */
const SCHOOL_C: ProductionSettings = { ...DEFAULT_PRODUCTION, backMm: 4, allowances: { shelfSideMm: 3, shelfDepthMm: 26, dividerDepthMm: 30, backInsetMm: 10 } };
const SHEETS: CuttingSettings = {
  ...TYPICAL_CUTTING,
  sheets: ['ldsp:16', 'ldsp:18', 'mdf:16', 'mdf:18', 'mdf:19', 'hdf:3', 'hdf:4', 'veneer:16', 'veneer:18'].map((stock) => ({ stock, lengthMm: 2800, widthMm: 2070 })),
  confirmed: true,
};
/** Детали, у которых место в сцене — коробка с тем же именем. Фасады — F9, стекло и покупное — свой список (P1). */
const SCENE_PARTS = new Set([
  SIDE_PANEL_NAME, BOTTOM_PANEL_NAME, TOP_PANEL_NAME, TOP_RAIL_PANEL_NAME, SHELF_PANEL_NAME, DIVIDER_PANEL_NAME, HDIVIDER_PANEL_NAME, BACK_PANEL_NAME,
  FRIDGE_PANEL_PART_NAME.left, FRIDGE_PANEL_PART_NAME.right, WALL_MICROWAVE_SHELF_NAME, 'Доборная планка',
]);

const dims = (a: number[]) => a.map((v) => Math.round(v)).sort((x, y) => x - y).join('×');

type Tally = { modules: number; parts: number; diffs: string[]; frameBoards: number };

/*
 * ОБЪЯВЛЕННОЕ ИСКЛЮЧЕНИЕ (не сведено, названо в отчёте): у витрины-каркаса (конструкция B) дно и крышу из плиты
 * сцена подрезает до середины паза профиля, а раскрой режет их на всю глубину корпуса. Паз профиля условный
 * (сечения профиля в каталоге нет), размер плиты в каркасе цех не подтверждал — выдумывать его нельзя. Считается
 * числом: исключений ровно столько, сколько таких деталей, и тихо их больше стать не может.
 */
const FRAME_BOARD = new Set([BOTTOM_PANEL_NAME, TOP_PANEL_NAME]);

/** Деталировка против сцены одного ряда: по модулю, по имени детали — штуки и размеры. */
function sceneVsCut(run: Run, production: ProductionSettings, tag: string, tally: Tally): void {
  const byModule = runBoxesByModule(run, { thicknessMm: production.carcassMm, frontThicknessMm: production.frontMm, gapMm: production.frontGapMm, production, hardware: CATALOG }).modules;
  const panels = buildPanels({ run, production, hardware: CATALOG });
  for (const { unit, boxes } of byModule) {
    tally.modules += 1;
    const rows = panels.filter((p) => p.moduleId === unit.id && SCENE_PARTS.has(p.name));
    for (const name of Array.from(new Set(rows.map((r) => r.name)))) {
      const want = rows.filter((r) => r.name === name).flatMap((r) => Array.from({ length: r.qty }, () => dims([r.lengthMm, r.widthMm, r.thicknessMm]))).sort();
      const got = boxes.filter((b) => b.panel === name).map((b) => dims(b.scale.map((s) => s * 1000))).sort();
      tally.parts += want.length;
      if (want.join(',') !== got.join(',') && unit.vitrine?.construction === 'frame' && FRAME_BOARD.has(name)) {
        tally.frameBoards += want.length;
        continue;
      }
      if (want.join(',') !== got.join(',')) tally.diffs.push(`${tag} ${unit.id} «${name}»: раскрой ${want.join(',')} | сцена ${got.join(',') || 'нет'}`);
    }
    /* Деталь в сцене без детали в раскрое — то, что нарисовано и не режется (дно под мойкой). */
    const cutNames = new Set(panels.filter((p) => p.moduleId === unit.id).map((p) => p.name));
    for (const name of Array.from(new Set(boxes.map((b) => b.panel).filter((n): n is string => Boolean(n) && SCENE_PARTS.has(n!))))) {
      if (!cutNames.has(name)) tally.diffs.push(`${tag} ${unit.id} «${name}»: в сцене есть, в раскрое нет`);
    }
  }
}

/** Карта раскроя ряда: всё на листах, ошибок нет, кромка = деталировка, лист — из материала детали. */
function cutting(run: Run, production: ProductionSettings): { pieces: number; placed: number; errors: string[]; edgeCut: number; edgeParts: number; wrongStock: string[] } {
  const parts = objectPanels({ walls: panelWallsOf(null, [run], 'w1'), production, milling: new Map(), carcass: new Map(), hardware: CATALOG });
  const plan = cuttingPlan({ parts, settings: SHEETS, fingerprint: run.fingerprint });
  const kindOf = (p: Panel) => (p.material.startsWith('ХДФ') ? 'hdf' : p.material.startsWith('ЛДСП') ? 'ldsp' : null);
  const wrongStock = parts.filter((p) => p.stock && kindOf(p) && p.stock.kind !== kindOf(p)).map((p) => `${p.moduleId} «${p.name}» ${p.material} → ${p.stock!.kind}`);
  return {
    pieces: plan.pieces,
    placed: plan.placed,
    errors: plan.errors,
    edgeCut: Math.round(plan.edges.reduce((s, e) => s + e.meters, 0) * 100) / 100,
    edgeParts: panelMaterials(parts).edgeM,
    wrongStock,
  };
}

export function detailingChecks(check: Check): void {
  console.log('\nДЕТАЛИРОВКА И КАРТА РАСКРОЯ: деталь раскроя = деталь сцены, всё на листах, кромка и материал');

  /* DT1–DT2 — 108 конфигураций шаблонов на двух школах цеха. */
  const keys = baselineKeys();
  const SCHOOLS = [['умолчания', DEFAULT_PRODUCTION, 1], ['600/300', SCHOOL_B, 2], ['припуски 3/26/30/10, ХДФ 4', SCHOOL_C, 6]] as const;
  for (const [school, production, n] of SCHOOLS) {
    const tally: Tally = { modules: 0, parts: 0, diffs: [], frameBoards: 0 };
    let built = 0;
    let cutBad: string[] = [];
    for (const { key, templateId, lengthMm } of keys) {
      const run = baselineRun(templateId, lengthMm);
      if ('refused' in run) continue;
      const shopRun = { ...run, production } as Run;
      built += 1;
      sceneVsCut(shopRun, production, key, tally);
      const c = cutting(shopRun, production);
      if (c.placed !== c.pieces || c.errors.length > 0 || Math.abs(c.edgeCut - c.edgeParts) > 0.011 || c.wrongStock.length > 0) {
        cutBad = [...cutBad, `${key}: на листах ${c.placed}/${c.pieces}, ошибок ${c.errors.length}, кромка ${c.edgeCut} / ${c.edgeParts}${c.wrongStock.length ? `, лист: ${c.wrongStock[0]}` : ''}`];
      }
    }
    check(
      `DT${n} школа ${school}: ${built} конфигураций из ${keys.length}, модулей ${tally.modules}, деталей ${tally.parts} — деталь раскроя = коробка сцены по штукам и размерам; исключение — дно и крыша каркаса витрины: ${tally.frameBoards} (объявлено 12)`,
      built === keys.length && tally.parts > 1000 && tally.diffs.length === 0 && tally.frameBoards === 12,
      tally.diffs.slice(0, Number(process.env.DT_ALL ?? 4)).join(' ; ') || `построено ${built}`,
    );
    check(
      `DT${n === 1 ? 3 : n === 2 ? 4 : 7} школа ${school}: карта раскроя — каждая деталь на листе, ошибок нет, кромка карты = кромка деталировки, лист из материала детали`,
      cutBad.length === 0,
      cutBad.slice(0, 3).join(' ; '),
    );
  }

  /* DT5 — демо-кухня со всеми деталями этапа: планки холодильника, СВЧ в навесном шкафу. */
  const MEASUREMENT = {
    ...DEMO_MEASUREMENT,
    walls: DEMO_MEASUREMENT.walls.map((w) => ({ ...w, lengthMm: w.id === 'w1' ? 3900 : w.lengthMm, openings: w.openings.filter((o) => o.kind !== 'window') })),
  } as typeof DEMO_MEASUREMENT;
  const base = workspaceInput({ title: 'DT', zone: 'Кухня', measurement: MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production: DEFAULT_PRODUCTION, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: CATALOG });
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>, edited).find((v) => v.key === 'optimal')!.run;
  const refusals: string[] = [];
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown(), requirements: DEMO_REQUIREMENTS, ops: list, openings: input.openings, hardware: CATALOG });
    if (next.warnings.length === 0) edited = { optimal: next };
    else refusals.push(...next.warnings);
  };
  const fridge = shown().modules.find((m) => m.appliance === 'fridge');
  if (!fridge) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: холодильника в демо нет');
  ops([{ op: 'set_fridge_panel', moduleId: fridge.id, side: 'left', panel: { kind: 'decorative' } }]);
  ops([{ op: 'set_fridge_panel', moduleId: fridge.id, side: 'right', panel: { kind: 'constructive', thicknessMm: 18, depthMm: 500, setbackMm: 20, heightMm: 2000 } }]);
  ops([{ op: 'set_variant', moduleId: 'upper-1650@w1', variant: 'upper_micro' }]);
  ops([{ op: 'set_appliance_model', appliance: 'microwave', model: 'BFL524MB2', moduleId: 'upper-1650@w1' }]);
  /* Перегородка наполнения (`fill.dividerMm`) — в шаблонах её нет: ставим тем же `set_fill`, что шлёт чертёж. */
  const plain = shown().modules.find((m) => m.kind === 'base' && !m.appliance && m.widthMm >= 400 && m.fill);
  if (!plain?.fill) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: обычного нижнего модуля в демо нет');
  ops([{ op: 'set_fill', moduleId: plain.id, fill: { ...plain.fill, dividerMm: Math.round(plain.widthMm / 2) } }]);
  const run = shown();
  const tally: Tally = { modules: 0, parts: 0, diffs: [], frameBoards: 0 };
  sceneVsCut(run, DEFAULT_PRODUCTION, 'демо', tally);
  const c = cutting(run, DEFAULT_PRODUCTION);
  const names = new Set(buildPanels({ run, production: DEFAULT_PRODUCTION }).map((p) => p.name));
  check(
    `DT5 демо-кухня с планками холодильника, СВЧ в навесном шкафу и перегородкой наполнения: деталей ${tally.parts}, деталь = коробка; карта — ${c.placed}/${c.pieces} на листах, кромка ${c.edgeCut} = ${c.edgeParts} м`,
    refusals.length === 0 && tally.diffs.length === 0 && c.placed === c.pieces && c.errors.length === 0 && Math.abs(c.edgeCut - c.edgeParts) <= 0.011 && c.wrongStock.length === 0 &&
      names.has('Планка холодильника левая') && names.has('Планка холодильника правая') && names.has(WALL_MICROWAVE_SHELF_NAME) && names.has(DIVIDER_PANEL_NAME),
    [...refusals, ...tally.diffs.slice(0, 3), ...c.errors.slice(0, 2), ...c.wrongStock.slice(0, 2)].join(' ; '),
  );
}

if (process.argv[1]?.endsWith('verify-detailing.ts')) {
  let passed = 0;
  let failed = 0;
  detailingChecks((name, ok, detail = '') => {
    if (ok) passed += 1;
    else failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
  });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
