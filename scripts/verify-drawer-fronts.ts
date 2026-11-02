/**
 * ПРИЁМКА РЕДАКТОРА «ФАСАДЫ ЯЩИКОВ» (ТЗ 2026-11-02, «PROFESSIONAL DRAWERS», A2–A3). Входит в
 * `npm run test:hardware` (минимум системы ящика меряется по фактам Blum).
 *
 * Путь экрана: `workspaceInput` → `objectInput` → `composeVariants` → `applyOps`, модуль
 * `base-3300@w1` «Ящики». Правки — те же операции, что шлёт редактор (`set_fill`, `set_fronts`), с
 * местами, посчитанными теми же функциями редактора (`resizeDrawerFront`, `evenDrawerFronts`,
 * `proportionalDrawerFronts`). Высоты вводятся ДЕТАЛЬЮ: место = деталь + зазор цеха.
 */

import { DEFAULT_PRODUCTION, type CatalogEntryFull, type HardwareItem, type ProductionSettings } from '../types/catalog';
import type { MillworkOp, Module, Run, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { allModules } from '../lib/millwork/layout';
import { buildPanels } from '../lib/millwork/panels';
import { frontCutsOf, openablePartIds, runBoxes } from '../lib/millwork/cabinetBoxes';
import { moduleDrawerKits } from '../lib/millwork/drawerKit';
import { moduleCarcassHeightMm, moduleDepthMm, moveDrawerBoundary } from '../lib/millwork/fill';
import { runFingerprint } from '../lib/millwork/fingerprint';
import {
  drawerFrontRows,
  drawerLocksOf,
  evenDrawerFronts,
  proportionalDrawerFronts,
  resizeDrawerFront,
  withDrawerFronts,
  withDrawerInners,
  withDrawerInsert,
  withDrawerSplit,
} from '../lib/millwork/drawerFronts';
import { toggleDrawerInterlock } from '../lib/millwork/drawerGrid';

type Check = (name: string, ok: boolean, detail?: string) => void;
let passed = 0;
let failed = 0;
const own: Check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
};

const MODULE = 'base-3300@w1';
const RUNNER = 'MFR-BLUM-576.4501M';
const SIDES = 'MFR-BLUM-378M4502SA';
/* Правила короба — числа проверки (те же, что у приёмки TANDEMBOX), а не умолчание продукта. */
const RULES = { sideMm: 16, bottomMm: 4, bottomMaterial: 'hdf', bottomMount: 'groove', bottomGrooveMm: 6, gapBelowMm: 10, gapAboveMm: 30, runnerAxisMm: 40, edge: '0.4', confirmed: true } as const;

function catalog(): Map<string, HardwareItem> {
  return hardwareCatalog(
    HARDWARE_FACTS.map((fact) => {
      const row = hardwareCatalogRow(fact);
      return {
        id: `hw:${fact.article}`, org_id: 'org', category_id: 'cat', article: row.article, name_ru: row.name_ru, name_kk: row.name_kk, description: '',
        price: 0, unit: row.unit, dimensions: {}, tiling: {}, meta: { hardware: fact.hardware }, is_active: true, assets: [],
      } as unknown as CatalogEntryFull;
    }),
  );
}

function kitchen(hw: Map<string, HardwareItem>, production: ProductionSettings) {
  const base = workspaceInput({ title: 'DF', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: hw });
  const disabled = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, disabled, edited).find((v) => v.key === 'optimal')!.run;
  /* Смета показанного варианта — та, что видит экран (у ряда своей сметы нет). */
  const estimate = () => composeVariants(input, disabled, edited).find((v) => v.key === 'optimal')!.estimate;
  /* Как экран: `applyOps` по показанному ряду; отказ — ряд прежний, слова в `warnings`. */
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: { ...shown(), production }, requirements: DEMO_REQUIREMENTS, ops: list, openings: input.openings, hardware: hw });
    if (next.warnings.length === 0) edited = { optimal: next };
    return next;
  };
  const variant = ops([{ op: 'set_variant', moduleId: MODULE, variant: 'drawers' }]);
  if (variant.warnings.length > 0) throw new Error(`${MODULE} «Ящики» не встал: ${variant.warnings.join(' | ')}`);
  return { shown, ops, estimate };
}
const unitOf = (run: Run): Module => {
  const u = allModules(run).find((m) => m.id === MODULE);
  if (!u) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${MODULE} нет`);
  return u;
};
const fronts = (run: Run) => unitOf(run).fill?.drawerHeights ?? [];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** Детали фронтов модуля в раскрое — «Фронт ящика» по детали `drawer:i`, высоты сверху вниз. */
function cutFronts(run: Run, production: ProductionSettings, hw: Map<string, HardwareItem>): { leaf: string; h: number; w: number }[] {
  const cuts = frontCutsOf(run, production, hw);
  return fronts(run).map((_, i) => {
    const cut = cuts.get(`${MODULE}:drawer:${i}`);
    return { leaf: `drawer:${i}`, h: cut?.lengthMm ?? NaN, w: cut?.widthMm ?? NaN };
  });
}

export function drawerFrontsChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nФАСАДЫ ЯЩИКОВ: места и детали числом, закрепление, «остаток», «равномерно», «пропорционально», минимум системы');

  const hw = catalog();
  const shop: ProductionSettings = { ...DEFAULT_PRODUCTION };
  const gap = shop.frontGapMm;
  const k = kitchen(hw, shop);
  const H = Math.round(moduleCarcassHeightMm(unitOf(k.shown()), k.shown()));
  const fp0 = runFingerprint(k.shown());

  /* DF1 — таблица редактора = раскрой = сцена. */
  const rows1 = drawerFrontRows(unitOf(k.shown()), k.shown(), shop, hw);
  const cut1 = cutFronts(k.shown(), shop, hw);
  const panelFronts = buildPanels({ run: k.shown(), production: shop, hardware: hw }).filter((p) => p.moduleId === MODULE && p.name === 'Фронт ящика');
  const boxes = runBoxes(k.shown(), { thicknessMm: shop.carcassMm, frontThicknessMm: shop.frontMm, gapMm: shop.frontGapMm, hardware: hw, production: shop, cuts: frontCutsOf(k.shown(), shop, hw) } as never) as {
    part?: string;
    material: string;
    scale: [number, number, number];
  }[];
  const sceneFront = (i: number) => boxes.find((b) => b.material === 'front' && b.part === `${MODULE}:drawer:${i}`);
  const sceneOk = rows1.every((r) => {
    const box = sceneFront(r.index);
    return box !== undefined && Math.abs(box.scale[1] * 1000 - r.heightMm) < 0.01 && Math.abs(box.scale[0] * 1000 - r.widthMm) < 0.01;
  });
  check(
    `DF1 модуль «Ящики» (корпус ${H} мм): таблица редактора — ${rows1.length} фасадов, деталь = место − зазор ${gap} мм; те же детали в раскрое («Фронт ящика») и в сцене; сумма мест = корпус`,
    rows1.length > 0 &&
      sum(rows1.map((r) => r.slotMm)) === H &&
      rows1.every((r, i) => r.heightMm === r.slotMm - gap && r.widthMm === unitOf(k.shown()).widthMm - gap && cut1[i].h === r.heightMm && cut1[i].w === r.widthMm) &&
      sum(panelFronts.map((p) => p.qty)) === rows1.length &&
      sceneOk,
    `места ${rows1.map((r) => r.slotMm).join('/')} · детали ${rows1.map((r) => `${r.widthMm}×${r.heightMm}`).join(', ')} · раскрой ${cut1.map((c) => c.h).join('/')} · сцена ${sceneOk ? 'та же' : 'ДРУГАЯ'}`,
  );

  /* DF2 — «Остаток автоматически»: 140, затем 250 — первый закреплён и не едет; сумма — корпус. */
  const at1 = resizeDrawerFront(fronts(k.shown()), drawerLocksOf(unitOf(k.shown()).fill), 0, 140 + gap, H);
  if ('refusal' in at1) throw new Error(`DF2: ${at1.refusal}`);
  const r1 = k.ops([{ op: 'set_fill', moduleId: MODULE, fill: withDrawerFronts(unitOf(k.shown()).fill!, at1.heights, at1.locked) }]);
  const at2 = resizeDrawerFront(fronts(k.shown()), drawerLocksOf(unitOf(k.shown()).fill), 1, 250 + gap, H);
  if ('refusal' in at2) throw new Error(`DF2: ${at2.refusal}`);
  const r2 = k.ops([{ op: 'set_fill', moduleId: MODULE, fill: withDrawerFronts(unitOf(k.shown()).fill!, at2.heights, at2.locked) }]);
  const cut2 = cutFronts(k.shown(), shop, hw);
  const locks2 = drawerLocksOf(unitOf(k.shown()).fill);
  check(
    'DF2 «Остаток автоматически»: верхний 140, затем средний 250 — верхний закреплён и не сдвинулся, остаток поровну незакреплённым; в раскрое детали 140 и 250; сумма мест = корпус, высота модуля та же',
    r1.warnings.length === 0 &&
      r2.warnings.length === 0 &&
      cut2[0].h === 140 &&
      cut2[1].h === 250 &&
      locks2[0] === true &&
      locks2[1] === true &&
      locks2.slice(2).every((l) => !l) &&
      sum(fronts(k.shown())) === H &&
      Math.round(moduleCarcassHeightMm(unitOf(k.shown()), k.shown())) === H,
    `детали ${cut2.map((c) => c.h).join('/')} · закреплены ${locks2.map((l) => (l ? '1' : '0')).join('')} · корпус ${H}`,
  );

  /* DF3 — смена числа: закреплённые остаются (и из поля «Фасад» тоже — та же операция). */
  const n0 = fronts(k.shown()).length;
  const r3 = k.ops([{ op: 'set_fronts', moduleId: MODULE, drawerCount: n0 + 1 }]);
  const cut3 = cutFronts(k.shown(), shop, hw);
  const free3 = H - (140 + gap) - (250 + gap);
  const one = k.ops([{ op: 'set_fronts', moduleId: MODULE, drawerCount: 1 }]);
  check(
    `DF3 число ящиков ${n0} → ${n0 + 1} той же операцией, что у поля «Фасад»: закреплённые 140 и 250 стоят, свободные ${free3} мм — поровну остальным; → 1 при двух закреплённых — отказ словами с миллиметрами, ряд прежний`,
    r3.warnings.length === 0 &&
      cut3.length === n0 + 1 &&
      cut3[0].h === 140 &&
      cut3[1].h === 250 &&
      sum(fronts(k.shown()).slice(2)) === free3 &&
      fronts(k.shown())[2] === Math.floor(free3 / (n0 - 1)) &&
      one.warnings.length === 1 &&
      /не хватает|некуда/.test(one.warnings[0]) &&
      /\d+ мм/.test(one.warnings[0]) &&
      fronts(k.shown()).length === n0 + 1,
    `${n0 + 1}: ${cut3.map((c) => c.h).join('/')} · 1: «${one.warnings[0] ?? '—'}»`,
  );

  /* DF4 — «Равномерно» и «Пропорционально»: закрепления снимаются, места — делением корпуса. */
  const even = evenDrawerFronts(3, H);
  const r4 = k.ops([{ op: 'set_fill', moduleId: MODULE, fill: withDrawerFronts(unitOf(k.shown()).fill!, even.heights, even.locked) }]);
  const evenNow = fronts(k.shown());
  const prop = proportionalDrawerFronts([1, 2, 2], H);
  if ('refusal' in prop) throw new Error(`DF4: ${prop.refusal}`);
  const r5 = k.ops([{ op: 'set_fill', moduleId: MODULE, fill: withDrawerFronts(unitOf(k.shown()).fill!, prop.heights, prop.locked) }]);
  const propNow = fronts(k.shown());
  check(
    `DF4 «Равномерно» — три места по ${Math.floor(H / 3)} (+остаток нижнему), закреплений нет; «Пропорционально» 1 : 2 : 2 — места ${Math.floor(H / 5)} / ${Math.floor((2 * H) / 5)} / остаток`,
    r4.warnings.length === 0 &&
      evenNow.slice(0, 2).every((h) => h === Math.floor(H / 3)) &&
      sum(evenNow) === H &&
      r5.warnings.length === 0 &&
      propNow[0] === Math.floor(H / 5) &&
      propNow[1] === Math.floor((2 * H) / 5) &&
      sum(propNow) === H &&
      !drawerLocksOf(unitOf(k.shown()).fill).some(Boolean),
    `равномерно ${evenNow.join('/')} · 1:2:2 ${propNow.join('/')}`,
  );

  /* DF5 — отказ с миллиметрами: деталь 50 мм; ряд прежний. */
  const small = resizeDrawerFront(fronts(k.shown()), drawerLocksOf(unitOf(k.shown()).fill), 0, 50 + gap, H);
  if ('refusal' in small) throw new Error(`DF5: ${small.refusal}`);
  const before5 = fronts(k.shown()).join('/');
  const r6 = k.ops([{ op: 'set_fill', moduleId: MODULE, fill: withDrawerFronts(unitOf(k.shown()).fill!, small.heights, small.locked) }]);
  check(
    'DF5 фасад 50 мм — отказ движка словами: сколько вышло, от скольких нужно и сколько не хватает (ящик не ниже 100 мм места); ряд прежний',
    r6.warnings.length === 1 && /Фасад 1 вышел бы 50 мм/.test(r6.warnings[0]) && /не хватает 46 мм/.test(r6.warnings[0]) && fronts(k.shown()).join('/') === before5,
    `«${r6.warnings[0] ?? '—'}»`,
  );

  /* DF6 — предела 400 мм больше нет (решение владельца 2026-11-02): два фасада, нижний 480+. */
  const r7 = k.ops([{ op: 'set_fronts', moduleId: MODULE, drawerCount: 2 }]);
  const tall = resizeDrawerFront(fronts(k.shown()), drawerLocksOf(unitOf(k.shown()).fill), 0, 140 + gap, H);
  if ('refusal' in tall) throw new Error(`DF6: ${tall.refusal}`);
  const r8 = k.ops([{ op: 'set_fill', moduleId: MODULE, fill: withDrawerFronts(unitOf(k.shown()).fill!, tall.heights, tall.locked) }]);
  const cut8 = cutFronts(k.shown(), shop, hw);
  const drag = moveDrawerBoundary({ shelves: [], dividerMm: 0, rodsMm: [], drawerHeights: [140, 330, 330], hinge: 'none' }, 1, 100);
  check(
    'DF6 два фасада вместо трёх: верхний 140, нижний — остаток выше 400 мм — встаёт; перетаскивание границы на листе даёт 430 мм — тоже (одно правило на оба пути)',
    r7.warnings.length === 0 && r8.warnings.length === 0 && cut8.length === 2 && cut8[0].h === 140 && cut8[1].h > 400 && drag.drawerHeights[1] === 430,
    `детали ${cut8.map((c) => c.h).join('/')} · лист ${drag.drawerHeights.join('/')}`,
  );

  /* DF7 — отпечаток: места — да, закрепление — нет (выбор, а не величина). */
  const fpA = runFingerprint(k.shown());
  const locks7 = drawerLocksOf(unitOf(k.shown()).fill).map((l) => !l);
  const r9 = k.ops([{ op: 'set_fill', moduleId: MODULE, fill: withDrawerFronts(unitOf(k.shown()).fill!, fronts(k.shown()), locks7) }]);
  const fpB = runFingerprint(k.shown());
  check(
    'DF7 отпечаток: правка мест его меняет, закрепление — нет, но закрепление записано в наполнении',
    fp0 !== fpA && r9.warnings.length === 0 && fpA === fpB && drawerLocksOf(unitOf(k.shown()).fill).join(',') === locks7.join(','),
    `${fp0} → ${fpA} → ${fpB}`,
  );

  /* DF8 — минимум системы ящика: TANDEMBOX (576.4501M + 378M4502SA, правила короба), верхний фасад. */
  const sys: ProductionSettings = { ...DEFAULT_PRODUCTION, drawerBox: { ...RULES } as never };
  const ks = kitchen(hw, sys);
  const fit = ks.ops([
    { op: 'set_fitting', moduleId: MODULE, slot: 'slide', itemId: `hw:${RUNNER}` },
    { op: 'set_fitting', moduleId: MODULE, slot: 'drawer_side', itemId: `hw:${SIDES}` },
  ]);
  const rowsS = drawerFrontRows(unitOf(ks.shown()), ks.shown(), sys, hw);
  const lowTop = resizeDrawerFront(fronts(ks.shown()), drawerLocksOf(unitOf(ks.shown()).fill), 0, 100 + sys.frontGapMm, Math.round(moduleCarcassHeightMm(unitOf(ks.shown()), ks.shown())));
  if ('refusal' in lowTop) throw new Error(`DF8: ${lowTop.refusal}`);
  const r10 = ks.ops([{ op: 'set_fill', moduleId: MODULE, fill: withDrawerFronts(unitOf(ks.shown()).fill!, lowTop.heights, lowTop.locked) }]);
  /* Короб в такой зоне — черновик с миллиметрами, а не царга ниже себя. */
  const probe: Module = { ...unitOf(ks.shown()), fill: { ...unitOf(ks.shown()).fill!, drawerHeights: lowTop.heights } };
  const kitLow = moduleDrawerKits(probe, ks.shown(), sys, hw).find((kit) => kit.place.key === `${MODULE}:drawer:0`);
  check(
    'DF8 TANDEMBOX: у верхнего фасада минимум — царга 83,6 + зазор снизу 10 + крыша корпуса (место от 110 мм); фасад 100 мм — отказ словами «царга 83,6», ряд прежний; короб в такой зоне — черновик с миллиметрами, а не царга ниже себя',
    fit.warnings.length === 0 &&
      rowsS.every((r) => r.drawerReady) &&
      rowsS[0].min.minSlotMm === 110 &&
      /царга 83,6/.test(rowsS[0].min.why) &&
      r10.warnings.length === 1 &&
      /царга 83,6/.test(r10.warnings[0]) &&
      /не хватает 6 мм/.test(r10.warnings[0]) &&
      kitLow?.state === 'draft' &&
      /не хватает 5,6 мм/.test(kitLow.missing.join(' ')),
    `минимум ${rowsS[0]?.min.minSlotMm} (${rowsS[0]?.min.why}) · «${r10.warnings[0] ?? '—'}» · короб: ${kitLow?.state === 'draft' ? kitLow.missing[0] : kitLow?.state}`,
  );

  /* ── A4: столбцы — перегородка и перемычка (решение владельца 2026-11-02) ── */
  const kc = kitchen(hw, shop);
  const unitC = () => unitOf(kc.shown());
  const W = unitC().widthMm;
  const t = shop.carcassMm;
  const depth = moduleDepthMm(unitC(), kc.shown().zone, kc.shown().production);
  const rowsN = fronts(kc.shown()).length;
  const fp1 = runFingerprint(kc.shown());
  const half = Math.round(W / 2);
  const s1 = kc.ops([{ op: 'set_fill', moduleId: MODULE, fill: withDrawerSplit(unitC().fill!, rowsN, half) }]);
  const pan1 = buildPanels({ run: kc.shown(), production: shop, hardware: hw }).filter((p) => p.moduleId === MODULE);
  const fronts1 = pan1.filter((p) => p.name === 'Фронт ящика');
  const part1 = pan1.filter((p) => p.partIds?.includes(`${MODULE}:drawer-partition`));
  const trav1 = pan1.filter((p) => p.partIds?.includes(`${MODULE}:drawer-traverse`));
  const kits1 = moduleDrawerKits(unitC(), kc.shown(), shop, hw);
  const leaves1 = openablePartIds(kc.shown()).filter((id) => id.startsWith(`${MODULE}:drawer:`));
  check(
    `DF9 два столбца (все ${rowsN} ряда, ось ${half} мм): фасадов ${rowsN * 2} шириной ${half - gap} мм в раскрое; перегородка ${H - 2 * t} × ${depth - (shop.allowances?.dividerDepthMm ?? 0)} мм от дна до крыши, перемычки нет; у каждого ящика свой проём ${half - t / 2 - t} мм; «Открыть всё» знает ${rowsN * 2} ящика; отпечаток другой`,
    s1.warnings.length === 0 &&
      sum(fronts1.map((p) => p.qty)) === rowsN * 2 &&
      fronts1.every((p) => p.widthMm === half - gap) &&
      part1.length === 1 &&
      part1[0].name === 'Перегородка вертикальная' &&
      part1[0].lengthMm === H - 2 * t &&
      trav1.length === 0 &&
      kits1.length === rowsN * 2 &&
      kits1.every((k) => k.place.openingWidthMm === half - t / 2 - t) &&
      leaves1.length === rowsN * 2 &&
      runFingerprint(kc.shown()) !== fp1,
    `предупреждения: ${s1.warnings.join(' | ') || 'нет'} · фронтов ${sum(fronts1.map((p) => p.qty))} · перегородка ${part1[0]?.lengthMm}×${part1[0]?.widthMm} · проёмы ${kits1.map((k) => k.place.openingWidthMm).join('/')} · ящиков ${leaves1.length}`,
  );

  /* DF10 — «узкие сверху, широкий снизу»: разделён только верхний ряд, асимметрично (левый 200). */
  const s2 = kc.ops([{ op: 'set_fill', moduleId: MODULE, fill: withDrawerSplit(unitC().fill!, 1, 200) }]);
  const pan2 = buildPanels({ run: kc.shown(), production: shop, hardware: hw }).filter((p) => p.moduleId === MODULE);
  const part2 = pan2.find((p) => p.partIds?.includes(`${MODULE}:drawer-partition`));
  const trav2 = pan2.find((p) => p.partIds?.includes(`${MODULE}:drawer-traverse`));
  const top2 = fronts(kc.shown())[0];
  const cuts2 = frontCutsOf(kc.shown(), shop, hw);
  const zones2 = moduleDrawerKits(unitC(), kc.shown(), shop, hw).map((k) => k.place);
  const boundary = H - top2;
  const below = zones2.find((p) => p.key === `${MODULE}:drawer:2`);
  check(
    `DF10 узкие сверху, широкий снизу: верхний ряд на два фасада ${200 - gap} и ${W - 200 - gap} мм, ниже — на всю ширину; перегородка ${top2 - t} мм от крыши до перемычки; перемычка ${W - 2 * t} мм под границей рядов, зона ящика под ней до ${boundary - t} мм`,
    s2.warnings.length === 0 &&
      cuts2.get(`${MODULE}:drawer:0`)?.widthMm === 200 - gap &&
      cuts2.get(`${MODULE}:drawer:1`)?.widthMm === W - 200 - gap &&
      cuts2.get(`${MODULE}:drawer:2`)?.widthMm === W - gap &&
      part2?.lengthMm === top2 - t &&
      trav2?.lengthMm === W - 2 * t &&
      trav2?.name === 'Перегородка горизонтальная' &&
      below?.zoneToMm === boundary - t,
    `фасады ${[0, 1, 2].map((i) => cuts2.get(`${MODULE}:drawer:${i}`)?.widthMm).join('/')} · перегородка ${part2?.lengthMm} · перемычка ${trav2?.lengthMm} · зона под ней до ${below?.zoneToMm}`,
  );

  /* DF11 — отказы деления словами с миллиметрами. */
  const s3 = kc.ops([{ op: 'set_fill', moduleId: MODULE, fill: withDrawerSplit(unitC().fill!, 1, 120) }]);
  /* Смена числа рядов при делении: деление остаётся; разделённых рядов больше, чем станет, — отказ. */
  const s5 = kc.ops([{ op: 'set_fronts', moduleId: MODULE, drawerCount: 4 }]);
  const kept = unitC().fill?.drawerSplit;
  const rows4 = fronts(kc.shown()).length;
  kc.ops([{ op: 'set_fill', moduleId: MODULE, fill: withDrawerSplit(unitC().fill!, 3, 200) }]);
  const s4 = kc.ops([{ op: 'set_fronts', moduleId: MODULE, drawerCount: 2 }]);
  const rowsAfter = fronts(kc.shown()).length;
  kc.ops([{ op: 'set_fronts', moduleId: MODULE, drawerCount: 3 }, { op: 'set_fill', moduleId: MODULE, fill: withDrawerSplit(unitC().fill!, 1, 200) }]);
  check(
    'DF11 отказ деления: левый столбец в свету 96 мм при минимуме 150 — «не хватает 54 мм», ряд прежний; 3 → 4 ряда — деление то же (верхний ряд, 200 мм); разделены 3 ряда, а станет 2 — отказ словами, рядов по-прежнему 4',
    s3.warnings.length === 1 &&
      /не хватает 54 мм/.test(s3.warnings[0]) &&
      s5.warnings.length === 0 &&
      kept?.leftMm === 200 &&
      kept?.rows === 1 &&
      rows4 === 4 &&
      s4.warnings.length === 1 &&
      rowsAfter === 4,
    `«${s3.warnings[0] ?? '—'}» · 4 ряда: деление ${kept ? `${kept.leftMm}×${kept.rows}` : 'СНЯТО'} · «${s4.warnings[0] ?? '—'}» · рядов ${rowsAfter}`,
  );

  /* DF12 — сцена: фасады разделённого ряда не пересекаются, перегородка между ними, ящики — свои ключи. */
  const boxesC = runBoxes(kc.shown(), { thicknessMm: shop.carcassMm, frontThicknessMm: shop.frontMm, gapMm: shop.frontGapMm, hardware: hw, production: shop, cuts: frontCutsOf(kc.shown(), shop, hw) } as never) as {
    part?: string;
    partId?: string;
    material: string;
    position: [number, number, number];
    scale: [number, number, number];
  }[];
  const fb = (i: number) => boxesC.find((b) => b.material === 'front' && b.part === `${MODULE}:drawer:${i}`);
  const a = fb(0);
  const b = fb(1);
  const partBox = boxesC.find((x) => x.partId === `${MODULE}:drawer-partition`);
  const travBox = boxesC.find((x) => x.partId === `${MODULE}:drawer-traverse`);
  const aRight = a ? a.position[0] + a.scale[0] / 2 : NaN;
  const bLeft = b ? b.position[0] - b.scale[0] / 2 : NaN;
  check(
    'DF12 сцена: фасады верхнего ряда — две коробки рядом, между ними зазор цеха (не пересекаются); перегородка и перемычка — коробки сцены; у каждого ящика свой ключ',
    a !== undefined &&
      b !== undefined &&
      bLeft - aRight > 0 &&
      Math.abs((bLeft - aRight) * 1000 - gap) < 0.01 &&
      partBox !== undefined &&
      travBox !== undefined &&
      Math.abs(partBox.scale[1] * 1000 - (top2 - t)) < 0.01,
    `зазор ${((bLeft - aRight) * 1000).toFixed(2)} мм · перегородка ${partBox ? (partBox.scale[1] * 1000).toFixed(1) : '—'} · перемычка ${travBox ? (travBox.scale[0] * 1000).toFixed(1) : '—'}`,
  );

  /* ── A6: внутренние ящики за общим фасадом и вставки ── */
  const KA = 'MFR-HETTICH-9114276';
  const wood: ProductionSettings = { ...DEFAULT_PRODUCTION, drawerBox: { ...RULES } as never };
  const kw = kitchen(hw, wood);
  const unitW = () => unitOf(kw.shown());
  kw.ops([{ op: 'set_fitting', moduleId: MODULE, slot: 'slide', itemId: `hw:${KA}` }]);
  const rowsW = fronts(kw.shown()).length;
  const lastCell = rowsW - 1;
  const panelsBefore = buildPanels({ run: kw.shown(), production: wood, hardware: hw }).filter((p) => p.moduleId === MODULE);
  const fpW0 = runFingerprint(kw.shown());
  const i1 = kw.ops([{ op: 'set_fill', moduleId: MODULE, fill: withDrawerInners(unitW().fill!, lastCell, [100]) }]);
  const kitsW = moduleDrawerKits(unitW(), kw.shown(), wood, hw);
  const outerKit = kitsW.find((k) => k.place.key === `${MODULE}:drawer:${lastCell}`);
  const innerKit = kitsW.find((k) => k.place.key === `${MODULE}:idrawer:${lastCell}:0`);
  const panelsW = buildPanels({ run: kw.shown(), production: wood, hardware: hw }).filter((p) => p.moduleId === MODULE);
  const innerParts = panelsW.filter((p) => p.partIds?.some((id) => id.includes(`idrawer:${lastCell}:0`)));
  const sceneW = runBoxes(kw.shown(), { thicknessMm: wood.carcassMm, frontThicknessMm: wood.frontMm, gapMm: wood.frontGapMm, hardware: hw, production: wood, drawerKits: kitsW, cuts: frontCutsOf(kw.shown(), wood, hw) } as never) as {
    part?: string;
    material: string;
    node?: string;
    position: [number, number, number];
    scale: [number, number, number];
  }[];
  const innerBoxes = sceneW.filter((b) => b.part === `${MODULE}:idrawer:${lastCell}:0`);
  const innerFrontZ = Math.max(...innerBoxes.map((b) => b.position[2] + b.scale[2] / 2));
  const slidesLine = kw.estimate().lines.find((l) => l.key.includes(KA));
  const zoneOuter = outerKit?.place ? outerKit.place.zoneToMm - outerKit.place.zoneFromMm : NaN;
  check(
    `DF13 внутренний ящик за нижним фасадом (зона 100 мм, KA 4532 + короб цеха): короб наружного ниже на 100 мм (зона ${zoneOuter}), у внутреннего — свой короб и детали в раскрое; направляющих ${rowsW + 1} пары в смете; в сцене внутренний ящик за плоскостью корпуса — фасад не пересекает; ключ «Открыть всё» свой`,
    i1.warnings.length === 0 &&
      outerKit?.state === 'box' &&
      innerKit?.state === 'box' &&
      innerKit.place.zoneToMm - innerKit.place.zoneFromMm === 100 &&
      /* Зоны не пересекаются и вместе — зона ячейки (место нижнего ряда без дна корпуса). */
      outerKit.place.zoneToMm <= innerKit.place.zoneFromMm &&
      zoneOuter + 100 === fronts(kw.shown())[lastCell] - wood.carcassMm &&
      innerParts.length > 0 &&
      panelsW.length > panelsBefore.length &&
      innerBoxes.length > 0 &&
      innerFrontZ <= 1e-6 &&
      openablePartIds(kw.shown()).includes(`${MODULE}:idrawer:${lastCell}:0`) &&
      runFingerprint(kw.shown()) !== fpW0 &&
      (slidesLine?.quantity ?? 0) === rowsW + 1,
    `предупреждения: ${i1.warnings.join(' | ') || 'нет'} · наружный ${outerKit?.state} зона ${zoneOuter} · внутренний ${innerKit?.state} ${innerKit?.state === 'box' ? innerKit.plan.heightMm : innerKit?.missing?.[0]} · деталей внутреннего ${innerParts.length} · перед ${innerFrontZ.toFixed(4)} м · направляющих ${slidesLine?.quantity ?? 'нет строки'}`,
  );

  /* DF14 — блокировка: внутренний только с наружным; закрыли наружный — закрылся и внутренний. */
  const outerId = `${MODULE}:drawer:${lastCell}`;
  const innerId = `${MODULE}:idrawer:${lastCell}:0`;
  const lock1 = toggleDrawerInterlock([], innerId);
  const lock2 = toggleDrawerInterlock(lock1, outerId);
  const lock3 = toggleDrawerInterlock([outerId], innerId);
  check(
    'DF14 открывание с блокировкой: внутренний ящик при закрытом наружном открывает и наружный; закрытие наружного закрывает и внутренний; при открытом наружном внутренний открывается сам',
    lock1.join('|') === `${outerId}|${innerId}` && lock2.length === 0 && lock3.join('|') === `${outerId}|${innerId}`,
    `${lock1.join(',')} → ${lock2.join(',') || 'пусто'} · ${lock3.join(',')}`,
  );

  /* DF15 — отказы и черновик системы. */
  const tooTall = kw.ops([{ op: 'set_fill', moduleId: MODULE, fill: withDrawerInners(unitW().fill!, lastCell, [300]) }]);
  const fewer = kw.ops([{ op: 'set_fronts', moduleId: MODULE, drawerCount: rowsW - 1 }]);
  const sysInner = ks.ops([{ op: 'set_fill', moduleId: MODULE, fill: withDrawerInners(unitOf(ks.shown()).fill!, fronts(ks.shown()).length - 1, [100]) }]);
  const sysKit = moduleDrawerKits(unitOf(ks.shown()), ks.shown(), sys, hw).find((k) => k.place.key.includes(':idrawer:'));
  check(
    'DF15 отказы словами: внутренним 300 мм в зоне ящика — «наружному коробу не остаётся места»; меньше ящиков при внутреннем в последнем — «сначала снимите внутренние ящики»; у TANDEMBOX внутренний ящик — черновик «нужен внутренний фасад и его крепление»',
    tooTall.warnings.length === 1 &&
      /не остаётся места/.test(tooTall.warnings[0]) &&
      fewer.warnings.length === 1 &&
      /сначала снимите внутренние ящики/.test(fewer.warnings[0]) &&
      sysInner.warnings.length === 0 &&
      sysKit?.state === 'draft' &&
      /внутренний фасад/.test(sysKit.missing.join(' ')),
    `«${tooTall.warnings[0] ?? '—'}» · «${fewer.warnings[0] ?? '—'}» · система: ${sysKit?.state} ${sysKit?.state === 'draft' ? sysKit.missing[0] : ''}`,
  );

  /* DF16 — вставки: визуальный прототип — в сцене внутри короба и едут с ящиком, в раскрой не идут, в смете без цены. */
  const panelsI0 = buildPanels({ run: kw.shown(), production: wood, hardware: hw }).filter((p) => p.moduleId === MODULE);
  const fpI0 = runFingerprint(kw.shown());
  const ins = kw.ops([{ op: 'set_fill', moduleId: MODULE, fill: withDrawerInsert(unitW().fill!, 'drawer:1', { kind: 'organizer', sections: 4 }) }]);
  const kitsI = moduleDrawerKits(unitW(), kw.shown(), wood, hw);
  const boxKit = kitsI.find((k) => k.place.key === `${MODULE}:drawer:1`);
  const sceneI = runBoxes(kw.shown(), { thicknessMm: wood.carcassMm, frontThicknessMm: wood.frontMm, gapMm: wood.frontGapMm, hardware: hw, production: wood, drawerKits: kitsI, cuts: frontCutsOf(kw.shown(), wood, hw) } as never) as {
    part?: string;
    node?: string;
    position: [number, number, number];
    scale: [number, number, number];
  }[];
  const tray = sceneI.filter((b) => b.node === 'insert' && b.part === `${MODULE}:drawer:1`);
  const boxParts = sceneI.filter((b) => b.part === `${MODULE}:drawer:1` && b.node !== 'insert' && b.node !== 'handle');
  const span = (xs: { position: [number, number, number]; scale: [number, number, number] }[], axis: 0 | 1 | 2) => [
    Math.min(...xs.map((b) => b.position[axis] - b.scale[axis] / 2)),
    Math.max(...xs.map((b) => b.position[axis] + b.scale[axis] / 2)),
  ];
  const inside = tray.length > 0 && [0, 2].every((axis) => {
    const [a0, a1] = span(tray, axis as 0 | 2);
    const [b0, b1] = span(boxParts, axis as 0 | 2);
    return a0 >= b0 - 1e-6 && a1 <= b1 + 1e-6;
  });
  const panelsI = buildPanels({ run: kw.shown(), production: wood, hardware: hw }).filter((p) => p.moduleId === MODULE);
  const insLine = kw.estimate().lines.find((l) => l.key === 'drawer_insert_organizer');
  check(
    'DF16 органайзер в ящике 2 — визуальный прототип: в сцене деталями внутри короба по комплекту (тот же ключ — едет с ящиком), в раскрое ничего не прибавилось, в смете строкой с количеством 1 без цены; отпечаток другой',
    ins.warnings.length === 0 &&
      boxKit?.state === 'box' &&
      inside &&
      panelsI.length === panelsI0.length &&
      insLine?.quantity === 1 &&
      !(insLine.total > 0) &&
      runFingerprint(kw.shown()) !== fpI0,
    `деталей вставки ${tray.length} · внутри короба ${inside ? 'да' : 'НЕТ'} · раскрой ${panelsI0.length} → ${panelsI.length} · смета ${insLine ? `${insLine.quantity} шт., ${insLine.total} ₸` : 'нет строки'}`,
  );

  console.log(`\nФАСАДЫ ЯЩИКОВ: ${passed} / ${failed}`);
  return { passed, failed };
}

if (require.main === module) {
  const r = drawerFrontsChecks();
  if (r.failed > 0) process.exit(1);
}
