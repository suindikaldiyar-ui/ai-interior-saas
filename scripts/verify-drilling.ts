/**
 * ПРИЁМКА ДВИЖКА ПРИСАДКИ (HW-08). Входит в `npm run test:hardware`.
 *
 * Путь экрана: замер демо → `objectInput` (с каталогом фурнитуры) →
 * `composeVariants` → правка `applyOps` → `panelWallsOf` / `wallSegments` →
 * `drillingPlan` — тот же, что экран «Присадка». Каталог — строки фактов
 * (`hardwareCatalogRow`), без правки руками.
 *
 * Числа не подобраны под код:
 *   Blum CLIP top 71B3550 (каталог Blum 2024/2025, печ. 76): чашка Ø35,
 *     глубина 13, TB по таблице наложения; планка 173L8130 (печ. 154): Ø5,
 *     глубина 11,5, 37 от кромки, 32 между отверстиями, подъём 3;
 *   наложение FA = корпус 16 − зазор 4 = 12 → при MD 3 (FA 11–15 ↔ TB 3–7)
 *     TB = 12 − 11 + 3 = 4 → ось чашки от кромки 4 + 17,5 = 21,5;
 *   правила цеха фикстуры: от края фасада до оси чашки 100, петель — до 900
 *     две, до 1600 три; винт ручки Ø5; конфирмат 7 / 5 / 50, оси 50 от кромок;
 *   фасад дверцы 716 при корпусе 720 — по центру: низ фасада на 2 мм выше
 *     низа корпуса → оси планки 2 + 100 ∓ 16 = 86 / 118, 2 + 616 ∓ 16 = 602 / 634.
 */

import { DEFAULT_PRODUCTION, type CatalogEntryFull, type DrillingSettings, type HardwareItem, type ProductionSettings } from '../types/catalog';
import type { MillworkOp, Module, Run, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput, panelWallsOf, wallSegments } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { allModules } from '../lib/millwork/layout';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { drillChecks, drillingPlan, type DrillPart, type DrillingPlan } from '../lib/millwork/drillingPlan';
import { DRILL_CSV_HEADER, drillingCsv, drillingDxf, drillingJson, readDrillDxf } from '../lib/millwork/drillingExport';
import { unzipStored, zipFiles } from '../lib/millwork/zip';
import { objectPanels } from '../lib/millwork/panels';
import { runBoxes } from '../lib/millwork/cabinetBoxes';
import { BAZIS_CHECK_WORDS, BAZIS_PACKAGE_VERSION, bazisPackage } from '../lib/millwork/bazisExport';

type Check = (name: string, ok: boolean, detail?: string) => void;
let passed = 0;
let failed = 0;
function own(name: string, ok: boolean, detail = ''): void {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
}
let check: Check = own;

const ROWS = HARDWARE_FACTS.map((fact) => {
  const row = hardwareCatalogRow(fact);
  return {
    id: `hw:${fact.article}`,
    org_id: 'org-drill',
    category_id: 'cat-hardware',
    article: row.article,
    name_ru: row.name_ru,
    name_kk: row.name_kk,
    description: '',
    price: 0,
    unit: row.unit,
    dimensions: {},
    tiling: {},
    meta: { hardware: fact.hardware },
    is_active: true,
    assets: [],
  } as unknown as CatalogEntryFull;
});
const CATALOG = hardwareCatalog(ROWS);
function item(article: string): HardwareItem {
  const found = CATALOG.get(`hw:${article}`);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: позиции ${article} в фактах нет`);
  return found;
}

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
const SHOP: ProductionSettings = { ...DEFAULT_PRODUCTION, drilling: RULES };
const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
const DOOR = 'base-1200@w1';

function kitchen(production: ProductionSettings) {
  const base = workspaceInput({ title: 'HW-08', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({
    base,
    resolution: null,
    requirements: DEMO_REQUIREMENTS,
    rates: DEMO_RATES,
    production,
    milling: new Map(),
    carcass: new Map(),
    materials: new Map(),
    hardware: CATALOG,
  });
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, DISABLED, edited).find((v) => v.key === 'optimal')!;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown().run, requirements: DEMO_REQUIREMENTS, ops: list, openings: input.openings, hardware: CATALOG });
    if (next.warnings.length > 0) throw new Error(`правка отклонена: ${next.warnings.join(' | ')}`);
    edited = { optimal: next };
    return shown();
  };
  const plan = (p: ProductionSettings = production): DrillingPlan => {
    const run = shown().run;
    return drillingPlan({ walls: panelWallsOf(null, wallSegments(null, run, {}), input.runWallId), production: p, hardware: CATALOG });
  };
  return { shown, ops, plan };
}

function partOf(plan: DrillingPlan, moduleId: string, role: DrillPart['role'], leaf?: string): DrillPart {
  const found = plan.parts.find((p) => p.moduleId === moduleId && p.role === role && (leaf === undefined || p.leaf === leaf));
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: детали ${role}${leaf ? ` ${leaf}` : ''} модуля ${moduleId} в плане нет`);
  return found;
}
function moduleOf(run: Run, id: string): Module {
  const unit = allModules(run).find((m) => m.id === id);
  if (!unit) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${id} нет`);
  return unit;
}
const xs = (part: DrillPart, role: string) => part.ops.filter((o) => o.role === role).map((o) => o.xMm).sort((a, b) => a - b);

const BLUM = [
  { op: 'set_fitting', moduleId: DOOR, slot: 'hinge', itemId: item('MFR-BLUM-71B3550').id },
  { op: 'set_fitting', moduleId: DOOR, slot: 'hinge_plate', itemId: item('MFR-BLUM-173L8130').id },
] as MillworkOp[];

export function drillingChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nHW-08: движок присадки — путём экрана');

  /* ── DR1: без правил цеха отверстий петли нет, причины словами ── */
  {
    const k = kitchen(DEFAULT_PRODUCTION);
    k.ops(BLUM);
    const plan = k.plan();
    const door = partOf(plan, DOOR, 'door', 'door:0');
    const side = partOf(plan, DOOR, 'side_left');
    check(
      'DR1 правил присадки у цеха нет: чашек 0, планки 0, у фасада «правило цеха не задано», выпуск заперт с «не подтверждены цехом»',
      door.ops.length === 0 &&
        side.ops.filter((o) => o.role === 'hinge_plate').length === 0 &&
        door.pending.some((p) => p.why.some((w) => w.includes('правило цеха не задано'))) &&
        !plan.release.open &&
        plan.release.reasons.some((r) => r.includes('не подтверждены цехом')),
      `${door.pending.map((p) => p.why.join('; ')).join(' | ')}`,
    );
  }

  /* ── DR2: Blum CLIP top + планка MD 3 по правилам цеха ── */
  const k = kitchen(SHOP);
  const run = k.ops(BLUM).run;
  const plan = k.plan();
  const door = partOf(plan, DOOR, 'door', 'door:0');
  const left = partOf(plan, DOOR, 'side_left');
  const right = partOf(plan, DOOR, 'side_right');
  const cups = door.ops.filter((o) => o.role === 'hinge_cup');
  check(
    'DR2 чашки 71B3550 на дверце 716 × 442: X 100 и 616, Y 21,5 (TB 4 + Ø35/2), Ø35, глубина 13, пласть B; источник — печ. 76',
    door.lengthMm === 716 &&
      JSON.stringify(xs(door, 'hinge_cup')) === '[100,616]' &&
      cups.every((c) => c.yMm === 21.5 && c.diameterMm === 35 && c.depthMm === 13 && c.face === 'B' && !c.through) &&
      cups.every((c) => c.source.includes('с. 76')),
    cups.map((c) => `${c.xMm};${c.yMm} Ø${c.diameterMm}×${c.depthMm} ${c.face}`).join(' | '),
  );
  const plates = left.ops.filter((o) => o.role === 'hinge_plate');
  check(
    'DR3 планка 173L8130 на левой боковине: X 86 / 118 / 602 / 634, Y 37, Ø5, глубина 11,5, пласть A; на правой боковине планки нет',
    JSON.stringify(xs(left, 'hinge_plate')) === '[86,118,602,634]' &&
      plates.every((p) => p.yMm === 37 && p.diameterMm === 5 && p.depthMm === 11.5 && p.face === 'A') &&
      right.ops.every((o) => o.role !== 'hinge_plate') &&
      plates.every((p) => p.source.includes('с. 154')),
    plates.map((p) => `${p.xMm};${p.yMm}`).join(' | '),
  );

  /* ── DR4: число петель — одна функция на смету, сцену и присадку ── */
  {
    const k3 = kitchen({ ...SHOP, drilling: { ...RULES, hingeCount: [{ upToMm: 600, hinges: 2 }, { upToMm: 1600, hinges: 3 }] } });
    const r3 = k3.ops(BLUM).run;
    const p3 = k3.plan();
    const d3 = partOf(p3, DOOR, 'door', 'door:0');
    const sceneHinges = runBoxes(r3, { thicknessMm: 16, frontThicknessMm: 16, gapMm: 4, hardware: CATALOG }).filter(
      (b) => b.node === 'hinge' && b.part === `${DOOR}:door:0`,
    ).length;
    const sceneHinges2 = runBoxes(run, { thicknessMm: 16, frontThicknessMm: 16, gapMm: 4, hardware: CATALOG }).filter(
      (b) => b.node === 'hinge' && b.part === `${DOOR}:door:0`,
    ).length;
    check(
      'DR4 таблица цеха «до 600 — 2, до 1600 — 3»: на дверце 716 три чашки (100 / 358 / 616) и три петли в сцене; при «до 900 — 2» — две и две',
      JSON.stringify(xs(d3, 'hinge_cup')) === '[100,358,616]' && sceneHinges === 3 && sceneHinges2 === 2,
      `чашки ${JSON.stringify(xs(d3, 'hinge_cup'))} · сцена ${sceneHinges} / ${sceneHinges2}`,
    );
  }

  /* ── DR5: ручка-скоба Häfele 115.52.630 — межосевое паспорта, место — как в сцене ── */
  {
    const kh = kitchen(SHOP);
    const rh = kh.ops([...BLUM, { op: 'set_fitting', moduleId: DOOR, slot: 'handle', itemId: item('MFR-HAFELE-115.52.630').id } as MillworkOp]).run;
    const ph = kh.plan();
    const dh = partOf(ph, DOOR, 'door', 'door:0');
    const holes = dh.ops.filter((o) => o.role === 'handle');
    const boxes = runBoxes(rh, { thicknessMm: 16, frontThicknessMm: 16, gapMm: 4, hardware: CATALOG });
    const leaf = boxes.find((b) => b.part === `${DOOR}:door:0` && !b.node && b.material !== 'metal');
    const handle = boxes.find((b) => b.part === `${DOOR}:door:0` && b.node === 'handle');
    if (!leaf || !handle) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: полотна или ручки дверцы в сцене нет');
    /*
     * Ось ручки: от свободной (правой) кромки — по горизонтали, от центра полотна —
     * по вертикали (ручка «посередине»). Сцена рисует полотно на зазор меньше
     * детали раскроя (F9, слой 59), поэтому вертикаль меряется от центра, а не от
     * верхней кромки: правило одно, полотна разного размера.
     */
    const sceneFromRight = (leaf.position[0] + leaf.scale[0] / 2 - handle.position[0]) * 1000;
    const sceneFromTop = (handle.position[1] - leaf.position[1]) * 1000;
    const midY = holes.length === 2 ? (holes[0].yMm + holes[1].yMm) / 2 : NaN;
    const midX = holes.length === 2 ? (holes[0].xMm + holes[1].xMm) / 2 : NaN;
    const drillFromRight = dh.widthMm - midY;
    const drillFromTop = midX - dh.lengthMm / 2;
    const spacing = holes.length === 2 ? Math.hypot(holes[0].xMm - holes[1].xMm, holes[0].yMm - holes[1].yMm) : NaN;
    check(
      'DR5 скоба 115.52.630: два сквозных Ø5 (правило цеха) с тыла, межосевое 160 (паспорт); ось — от свободной кромки и от центра полотна, как у ручки в сцене (± 0,5 мм)',
      holes.length === 2 &&
        holes.every((h) => h.through && h.diameterMm === 5 && h.face === 'B') &&
        Math.abs(spacing - 160) < 0.01 &&
        Math.abs(drillFromRight - sceneFromRight) <= 0.5 &&
        Math.abs(drillFromTop - sceneFromTop) <= 0.5,
      `межосевое ${spacing} · от правой ${drillFromRight.toFixed(1)} / сцена ${sceneFromRight.toFixed(1)} · от центра ${drillFromTop.toFixed(1)} / сцена ${sceneFromTop.toFixed(1)}`,
    );
    const kk = kitchen(SHOP);
    kk.ops([...BLUM, { op: 'set_fitting', moduleId: DOOR, slot: 'handle', itemId: item('MFR-HAFELE-134.88.610').id } as MillworkOp]);
    const knob = partOf(kk.plan(), DOOR, 'door', 'door:0').ops.filter((o) => o.role === 'handle');
    const kf = kitchen(SHOP);
    kf.ops([...BLUM, { op: 'set_fitting', moduleId: DOOR, slot: 'handle', itemId: item('MFR-HAFELE-151.38.100').id } as MillworkOp]);
    const flush = partOf(kf.plan(), DOOR, 'door', 'door:0').ops.filter((o) => o.role === 'handle');
    check(
      'DR6 кнопка 134.88.610 — одно сквозное отверстие; врезная 151.38.100 — гнездо Ø40 глубиной 15 с лица (паспорт), не винты',
      knob.length === 1 && knob[0].through && flush.length === 1 && flush[0].diameterMm === 40 && flush[0].depthMm === 15 && flush[0].face === 'A' && !flush[0].through,
      `кнопка ${knob.length} · врезная ${flush.map((f) => `Ø${f.diameterMm}×${f.depthMm} ${f.face}`).join()}`,
    );
  }

  /* ── DR7: Hettich Sensys — глубины чашки в паспорте нет: чашек нет, причина словами ── */
  {
    const kh = kitchen(SHOP);
    kh.ops([
      { op: 'set_fitting', moduleId: DOOR, slot: 'hinge', itemId: item('MFR-HETTICH-9071208').id },
      { op: 'set_fitting', moduleId: DOOR, slot: 'hinge_plate', itemId: item('MFR-HETTICH-9075045').id },
    ] as MillworkOp[]);
    const dh = partOf(kh.plan(), DOOR, 'door', 'door:0');
    check(
      'DR7 Hettich Sensys 9 071 208: глубина сверления чашки не напечатана — чашек 0, у фасада причина словами',
      dh.ops.filter((o) => o.role === 'hinge_cup').length === 0 && dh.pending.some((p) => p.why.some((w) => w.includes('глубина сверления чашки не напечатана'))),
      dh.pending.map((p) => p.why.join('; ')).join(' | '),
    );
  }

  /* ── DR8: конфирматы по схеме цеха: торец дна и пласть боковины — одни оси ── */
  {
    const bottom = partOf(plan, DOOR, 'bottom');
    const edge = bottom.ops.filter((o) => o.role === 'confirmat_edge');
    const face = left.ops.filter((o) => o.role === 'confirmat_face' && o.id.startsWith('conf-bottom'));
    const ys = (list: typeof edge) => Array.from(new Set(list.map((o) => o.yMm))).sort((a, b) => a - b);
    check(
      'DR8 конфирматы дна: в торцах x0 и x1 по 2 отверстия Ø5×50 на Y 50 и 510; в левой боковине — 2 сквозных Ø7 на X 8 (середина толщины дна) и тех же Y',
      edge.length === 4 &&
        edge.every((o) => o.diameterMm === 5 && o.depthMm === 50 && o.zMm === 8) &&
        JSON.stringify(ys(edge)) === '[50,510]' &&
        face.length === 2 &&
        face.every((o) => o.through && o.diameterMm === 7 && o.xMm === 8) &&
        JSON.stringify(ys(face)) === JSON.stringify(ys(edge)),
      `торец ${edge.map((o) => `${o.edge}:${o.yMm}`).join(' ')} · боковина ${face.map((o) => `${o.xMm};${o.yMm}`).join(' ')}`,
    );
  }

  /* ── DR9: направляющая KA — диаметр отверстий в паспорте не напечатан ── */
  {
    const kr = kitchen({ ...SHOP, drawerBox: { sideMm: 16, bottomMm: 4, bottomMaterial: 'hdf', bottomMount: 'groove', bottomGrooveMm: 6, gapBelowMm: 10, gapAboveMm: 30, runnerAxisMm: 40, edge: '0.4', confirmed: true } });
    kr.ops([{ op: 'set_fitting', moduleId: 'base-2700-hob@w1', slot: 'slide', itemId: item('MFR-HETTICH-9114276').id } as MillworkOp]);
    const pr = kr.plan();
    const sideHob = partOf(pr, 'base-2700-hob@w1', 'side_left');
    const boxSides = pr.parts.filter((p) => p.moduleId === 'base-2700-hob@w1' && p.role === 'drawer_side');
    check(
      'DR9 KA 4532 под варочной: отверстий направляющей нет ни на корпусе, ни на ящике — «диаметр … не напечатан»; боковин ящиков в плане 4',
      sideHob.ops.every((o) => !o.role.startsWith('runner')) &&
        sideHob.pending.some((p) => p.what.startsWith('направляющая на корпусе') && p.why.some((w) => w.includes('не напечатан'))) &&
        boxSides.length === 4 &&
        boxSides.every((b) => b.ops.length === 0 && b.pending.length > 0),
      `${sideHob.pending.map((p) => p.what).join(', ')} · боковин ящиков ${boxSides.length}`,
    );
  }

  /* ── DR10: проверки — каждая ловит своё ── */
  {
    const base: DrillPart = {
      partId: 't#1', number: 'T', piece: 1, wallId: 'w', wallLabel: 'Стена', moduleId: 'm', moduleLabel: 'M', name: 'Тест', role: 'other', material: 'ЛДСП 16',
      lengthMm: 500, widthMm: 300, thicknessMm: 16, axes: '', ops: [], pending: [],
    };
    const op = (id: string, x: number, y: number, d: number, depth: number, extra: Partial<DrillPart['ops'][number]> = {}) => ({
      id, role: 'hinge_plate' as const, face: 'A' as const, xMm: x, yMm: y, diameterMm: d, depthMm: depth, through: false, direction: '', itemId: null, article: null, source: '', ...extra,
    });
    const kinds = (ops: DrillPart['ops']) => drillChecks({ ...base, ops }, RULES).map((i) => i.kind).sort().join(',');
    const clean = kinds([op('a', 100, 100, 5, 10), op('b', 200, 100, 5, 10)]);
    check(
      'DR10 проверки: чисто — 0; за край — edge; пересечение и касание — overlap; насквозь глухим — thickness; остаток меньше 3 — depth; одно дважды — duplicate',
      clean === '' &&
        kinds([op('a', 2, 100, 5, 10)]) === 'edge' &&
        kinds([op('a', 100, 100, 35, 10), op('b', 120, 100, 5, 10)]) === 'overlap' &&
        kinds([op('a', 100, 100, 35, 10), op('b', 115, 100, 5, 10)]) === 'overlap' &&
        kinds([op('a', 100, 100, 5, 16)]) === 'thickness' &&
        kinds([op('a', 100, 100, 5, 14)]) === 'depth' &&
        kinds([op('a', 100, 100, 5, 10), op('b', 100, 100, 5, 10)]) === 'duplicate',
      `чисто «${clean}»`,
    );
    check('DR11 план Blum по правилам цеха: замечаний проверки 0 (край, пересечение, глубина, совпадение)', plan.issues.length === 0, plan.issues.map((i) => i.words).join(' | '));
  }

  /* ── DR12: выгрузки читают план, а не считают своё ── */
  {
    const meta = { projectId: 'p-test', title: 'Тест', date: '2026-10-30', fingerprint: 'abc' };
    const csv = drillingCsv(plan, meta);
    const lines = csv.trim().split('\r\n');
    const opRows = lines.filter((l) => l.split(';')[11]?.startsWith('cup-'));
    const totalOps = plan.parts.reduce((s, p) => s + p.ops.length, 0);
    const emptyParts = plan.parts.filter((p) => p.ops.length === 0).length;
    const dxf = readDrillDxf(drillingDxf(door, meta, plan.version));
    const zip = zipFiles([{ name: 'a.dxf', data: drillingDxf(door, meta, plan.version) }, { name: 'папка/б.txt', data: 'тест' }], '2026-10-30');
    const back = unzipStored(zip);
    const json = JSON.parse(drillingJson(plan, meta)) as { parts: unknown[]; units: string };
    check(
      'DR12 CSV: шапка 24 колонки, строка на операцию и строка на деталь без отверстий; DXF дверцы: контур 4 отрезка, окружности = чашки на слое DRILL_B_D35_H13; ZIP читается обратно с CRC; JSON — все детали, мм',
      lines[0].split(';').length === DRILL_CSV_HEADER.length &&
        DRILL_CSV_HEADER.length === 24 &&
        lines.length === 1 + totalOps + emptyParts &&
        opRows.length === 2 &&
        dxf.lines === 4 &&
        dxf.circles.length === door.ops.filter((o) => o.face).length &&
        dxf.circles.filter((c) => c.layer === 'DRILL_B_D35_H13' && c.r === 17.5).length === 2 &&
        back.length === 2 &&
        new TextDecoder().decode(back[1].data) === 'тест' &&
        back[1].name === 'папка/б.txt' &&
        json.parts.length === plan.parts.length &&
        json.units === 'mm',
      `строк ${lines.length} = 1 + ${totalOps} + ${emptyParts} · DXF окружностей ${dxf.circles.length}`,
    );
  }

  /* ── DR13: створки строки — у каждой штуки фасада своя створка, строки раскроя прежние ── */
  {
    const rows = objectPanels({ walls: panelWallsOf(null, wallSegments(null, run, {}), 'w1'), production: SHOP, hardware: CATALOG });
    const doors = plan.parts.filter((p) => p.role === 'door');
    const withLeaf = doors.filter((p) => p.leaf && /^door:\d+$/.test(p.leaf));
    const unitTwo = allModules(run).find((m) => m.doorCount === 2);
    const two = unitTwo ? plan.parts.filter((p) => p.moduleId === unitTwo.id && p.role === 'door').map((p) => p.leaf).sort() : [];
    check(
      'DR13 у каждой штуки фасада своя створка (door:N); у модуля на две дверцы — door:0 и door:1; строки раскроя не несут лишних полей',
      doors.length > 0 &&
        withLeaf.length === doors.filter((p) => p.name !== 'Фасад: вставка').length &&
        (!unitTwo || JSON.stringify(two) === '["door:0","door:1"]') &&
        rows.every((r) => !('leaves' in r)),
      `фасадов ${doors.length}, со створкой ${withLeaf.length}; две дверцы: ${unitTwo?.id ?? 'нет'} ${JSON.stringify(two)}`,
    );
  }

  /* ── DR14: число деталей плана = штуки раскроя ── */
  {
    const rows = objectPanels({ walls: panelWallsOf(null, wallSegments(null, run, {}), 'w1'), production: SHOP, hardware: CATALOG });
    const pieces = rows.reduce((s, r) => s + r.qty, 0);
    const ids = new Set(plan.parts.map((p) => p.partId));
    check(
      'DR14 деталей в плане присадки столько же, сколько штук в раскрое; ИД деталей не повторяются',
      plan.parts.length === pieces && ids.size === plan.parts.length,
      `план ${plan.parts.length} · раскрой ${pieces}`,
    );
  }

  /* ═════════════ HW-09: экспорт для БАЗИС — пакет данных из того же плана, раскроя, сметы и сцены ═════════════ */
  {
    const meta = { projectId: 'p-test', title: 'Тест', date: '2026-10-31', fingerprint: run.fingerprint ?? 'нет' };
    const walls = panelWallsOf(null, wallSegments(null, run, {}), 'w1');
    const panels = objectPanels({ walls, production: SHOP, hardware: CATALOG });
    const lines = k.shown().estimate.lines;
    const boxes = walls.map((w) => ({ label: w.label, boxes: runBoxes(w.run, { thicknessMm: SHOP.carcassMm, frontThicknessMm: SHOP.frontMm, gapMm: SHOP.frontGapMm, hardware: CATALOG, production: SHOP }) }));
    const locked = bazisPackage({ meta, panels, plan, lines, hardware: CATALOG, walls: boxes, exportLock: null });
    const names = locked.files.map((f) => f.name);
    const zipBack = unzipStored(zipFiles(locked.files, meta.date));
    const text = (name: string, pack = locked) => {
      const f = pack.files.find((x) => x.name === name);
      if (!f) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: файла ${name} в пакете нет`);
      return typeof f.data === 'string' ? f.data : new TextDecoder(name.endsWith('.csv') && !name.startsWith('hardware') ? 'windows-1251' : 'utf-8').decode(f.data).replace(/^﻿/, '');
    };
    check(
      'BZ1 пакет для БАЗИС: номенклатура XML, детали CSV, фурнитура CSV, OBJ, манифест и README; ни .b3d, ни .f3d, ни .fr3d, ни .cfrn; «Экспорт создан; проверка в БАЗИС ожидается» в манифесте и README; ZIP читается обратно с CRC',
      ['nomenclature.xml', 'parts.csv', 'hardware.csv', 'model.obj', 'manifest.json', 'README.txt'].every((n) => names.includes(n)) &&
        !names.some((n) => /\.(b3d|f3d|fr3d|cfrn)$/i.test(n)) &&
        locked.manifest.bazisCheck === BAZIS_CHECK_WORDS &&
        BAZIS_CHECK_WORDS === 'Экспорт создан; проверка в БАЗИС ожидается' &&
        text('README.txt').includes(BAZIS_CHECK_WORDS) &&
        !/импорт проверен/i.test(text('README.txt') + text('manifest.json')) &&
        zipBack.length === locked.files.length,
      names.join(', '),
    );

    /* Выпуск присадки заперт настоящими причинами плана; открытый — копия плана с открытым выпуском, чтобы проверить сам замок пакета. */
    const open = bazisPackage({ meta, panels, plan: { ...plan, release: { open: true, reasons: [] } }, lines, hardware: CATALOG, walls: boxes, exportLock: null });
    const screenLock = bazisPackage({ meta, panels, plan: { ...plan, release: { open: true, reasons: [] } }, lines, hardware: CATALOG, walls: boxes, exportLock: 'Стена Б: ряд не сходится' });
    const drilled = plan.parts.filter((p) => p.ops.length > 0);
    const opRows = text('drilling.csv', open).trim().split('\r\n').length - 1;
    const totalRows = drilled.reduce((s, p) => s + p.ops.length, 0) + plan.parts.filter((p) => p.ops.length === 0).length;
    check(
      'BZ2 присадка в пакете — только при открытом выпуске: заперт — ни CSV, ни JSON, ни DXF, причины плана в манифесте; открыт — CSV строкой на операцию и DXF на каждую деталь с отверстиями; замок экрана — черновик без присадки',
      !plan.release.open &&
        !names.some((n) => n.startsWith('drilling') || n.startsWith('dxf/')) &&
        !locked.manifest.drilling.issued &&
        JSON.stringify(locked.manifest.drilling.reasons) === JSON.stringify(plan.release.reasons) &&
        open.manifest.drilling.issued &&
        opRows === totalRows &&
        open.files.filter((f) => f.name.startsWith('dxf/')).length === drilled.length &&
        drilled.length > 0 &&
        !screenLock.manifest.drilling.issued &&
        screenLock.manifest.draft === 'Стена Б: ряд не сходится' &&
        !screenLock.files.some((f) => f.name.startsWith('drilling')),
      `заперт: ${plan.release.reasons.length} причин · открыт: строк ${opRows} = ${totalRows}, DXF ${open.files.filter((f) => f.name.startsWith('dxf/')).length} = ${drilled.length}`,
    );

    const xml = text('nomenclature.xml');
    const materials = xml.split('<Material>').length - 1;
    const fittingIds = Array.from(new Set(lines.filter((l) => l.key.startsWith('fitting_') && !l.key.endsWith('_missing')).map((l) => l.key)));
    const sheetKinds = new Set(panels.map((p) => `${p.material}|${p.thicknessMm}`)).size;
    const edgeKinds = new Set(panels.filter((p) => p.edges.long + p.edges.short > 0).map((p) => p.edgeType)).size;
    check(
      'BZ3 номенклатура по Приложению I: Database → Materials → Material; листовых — по материалам и толщинам деталировки, кромок — по типам, фурнитуры — по строкам сметы; у CLIP top артикул 71B3550; цены нет — Price не пишется, «цена не задана» в Comment',
      xml.startsWith('<?xml') &&
        /<Database>\s*<Materials>/.test(xml) &&
        materials === sheetKinds + edgeKinds + fittingIds.length &&
        fittingIds.length >= 2 &&
        xml.includes('<Article>71B3550</Article>') &&
        xml.includes('<Article>173L8130</Article>') &&
        (xml.match(/<IsTape>Y<\/IsTape>/g) ?? []).length === edgeKinds &&
        !/<Price>0<\/Price>/.test(xml) &&
        xml.includes('цена не задана'),
      `Material ${materials} = листовых ${sheetKinds} + кромок ${edgeKinds} + фурнитуры ${fittingIds.length}`,
    );

    const parts = text('parts.csv').trim().split('\r\n');
    const hw = text('hardware.csv').trim().split('\r\n');
    const hwLines = lines.filter((l) => l.key.startsWith('fitting_'));
    const clip = hw.find((row) => row.includes('71B3550'));
    const clipLine = hwLines.find((l) => l.key.includes('71B3550'));
    check(
      'BZ4 детали CSV — та же выгрузка, что «Выгрузить для раскроя» (строка на строку деталировки); фурнитура CSV — строка на строку сметы, количество и единица из сметы, «Цена не задана» и «Требуется подтверждение производства» словами',
      parts.length === 1 + panels.length &&
        hw.length === 1 + hwLines.length &&
        clip !== undefined &&
        clipLine !== undefined &&
        clip.split(';')[4] === String(Math.round(clipLine.quantity * 1000) / 1000) &&
        clip.includes('Цена не задана') &&
        hw.slice(1).every((row) => row.includes('подтверждены') || row.includes('Требуется подтверждение производства')),
      `деталей ${parts.length - 1} = ${panels.length} · фурнитуры ${hw.length - 1} = ${hwLines.length} · CLIP top: ${clip ?? '—'}`,
    );

    const obj = text('model.obj');
    const verts = obj.split('\n').filter((l) => l.startsWith('v ')).map((l) => l.slice(2).split(' ').map(Number));
    const faces = obj.split('\n').filter((l) => l.startsWith('f ')).length;
    const nBoxes = boxes.reduce((s, w) => s + w.boxes.length, 0);
    const xs = verts.map((v) => v[0]);
    const ys = verts.map((v) => v[1]);
    check(
      'BZ5 OBJ — справочная геометрия из коробок сцены: 8 вершин и 6 граней на коробку, мм; по X — в длине ряда, по Y — от пола; подписано «нередактируемый полигональный объект»',
      verts.length === 8 * nBoxes &&
        faces === 6 * nBoxes &&
        nBoxes > 0 &&
        Math.min(...xs) >= -1 &&
        Math.max(...xs) <= run.lengthMm + 1 &&
        Math.min(...ys) >= -1 &&
        obj.includes('нередактируемый полигональный объект'),
      `коробок ${nBoxes} · X ${Math.round(Math.min(...xs))}…${Math.round(Math.max(...xs))} при ряде ${run.lengthMm} · Y от ${Math.round(Math.min(...ys))}`,
    );

    const again = bazisPackage({ meta, panels, plan, lines, hardware: CATALOG, walls: boxes, exportLock: null });
    check(
      'BZ6 пакет детерминирован: тот же объект и дата — те же байты; в манифесте проект, отпечаток, дата, версия пакета и единицы мм',
      JSON.stringify(again.files.map((f) => [f.name, typeof f.data === 'string' ? f.data : Array.from(f.data).join(',')])) ===
        JSON.stringify(locked.files.map((f) => [f.name, typeof f.data === 'string' ? f.data : Array.from(f.data).join(',')])) &&
        locked.manifest.project === 'p-test' &&
        locked.manifest.fingerprint === meta.fingerprint &&
        locked.manifest.exportedAt === '2026-10-31' &&
        locked.manifest.version === BAZIS_PACKAGE_VERSION &&
        locked.manifest.units === 'mm',
      `${locked.manifest.version} · ${locked.manifest.fingerprint}`,
    );
  }

  void moduleOf;
  console.log(`\nHW-08 присадка: ${passed} / ${failed}`);
  return { passed, failed };
}

if (require.main === module) {
  const r = drillingChecks();
  if (r.failed > 0) process.exit(1);
}
