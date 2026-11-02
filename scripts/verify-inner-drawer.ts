/**
 * ПРИЁМКА ВНУТРЕННЕГО ЯЩИКА TANDEMBOX (ТЗ 2026-11-02, «исправить внутренний скрытый ящик»). Входит в
 * `npm run test:hardware`.
 *
 * Сценарий владельца («ЖК ТУМАР»): модуль «Ящики», два одинаковых наружных фасада, за верхним — внутренний
 * ящик с зоной 120 мм; система Blum TANDEMBOX antaro — направляющие 576.4501M, царги 378M4502SA, NL 450.
 * Источник — каталог Blum 2024-2025, «Внутренний ящик – M» (pdf.js 302–303 / печ. 298–299): передняя панель
 * Z31L1036A под раскрой LW − 132, держатели ZIF.71M0, ручка ZIF.80M5; место min 106 / 136 «с удобным
 * доступом сверху». Путь экрана: `workspaceInput` → `objectInput` → `composeVariants` → `applyOps`.
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
import { runBoxes } from '../lib/millwork/cabinetBoxes';
import { innerSystemWords, moduleDrawerKits, drawerRunnerOf } from '../lib/millwork/drawerKit';
import { moduleCarcassHeightMm } from '../lib/millwork/fill';
import { runFingerprint } from '../lib/millwork/fingerprint';
import { drawerFrontRows, evenDrawerFronts, withDrawerFronts, withDrawerInners } from '../lib/millwork/drawerFronts';
import { toggleDrawerInterlock } from '../lib/millwork/drawerGrid';
import { drillingPlan } from '../lib/millwork/drillingPlan';

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
const INNER_KIT = ['MFR-BLUM-Z31L1036A', 'MFR-BLUM-ZIF.71M0', 'MFR-BLUM-ZIF.80M5', 'MFR-BLUM-ZIF.80M7'];
/* Правила короба — числа проверки (те же, что у приёмки TANDEMBOX), а не умолчание продукта. */
const RULES = { sideMm: 16, bottomMm: 4, bottomMaterial: 'hdf', bottomMount: 'groove', bottomGrooveMm: 6, gapBelowMm: 10, gapAboveMm: 30, runnerAxisMm: 40, edge: '0.4', confirmed: true } as const;
const SHOP: ProductionSettings = { ...DEFAULT_PRODUCTION, drawerBox: { ...RULES } as never };

function catalog(skip: string[] = []): Map<string, HardwareItem> {
  return hardwareCatalog(
    HARDWARE_FACTS.filter((fact) => !skip.includes(fact.article)).map((fact) => {
      const row = hardwareCatalogRow(fact);
      return {
        id: `hw:${fact.article}`, org_id: 'org', category_id: 'cat', article: row.article, name_ru: row.name_ru, name_kk: row.name_kk, description: '',
        price: 0, unit: row.unit, dimensions: {}, tiling: {}, meta: { hardware: fact.hardware }, is_active: true, assets: [],
      } as unknown as CatalogEntryFull;
    }),
  );
}

/** Сценарий владельца путём экрана: «Ящики», TANDEMBOX путём «Фурнитуры», два равных фасада, внутренний 120 за верхним. */
function scenario(hw: Map<string, HardwareItem>, innerMm: number | null = 120) {
  const base = workspaceInput({ title: 'INNER', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production: SHOP, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: hw });
  const disabled = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
  let edited: Partial<Record<VariantKey, Run>> = {};
  const variant = () => composeVariants(input, disabled, edited).find((v) => v.key === 'optimal')!;
  const shown = () => variant().run;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: { ...shown(), production: SHOP }, requirements: DEMO_REQUIREMENTS, ops: list, openings: input.openings, hardware: hw });
    if (next.warnings.length === 0) edited = { optimal: next };
    return next;
  };
  const step = (label: string, list: MillworkOp[]) => {
    const r = ops(list);
    if (r.warnings.length > 0) throw new Error(`${label}: ${r.warnings.join(' | ')}`);
  };
  step('«Ящики»', [{ op: 'set_variant', moduleId: MODULE, variant: 'drawers' }]);
  step('TANDEMBOX', [
    { op: 'set_fitting', moduleId: MODULE, slot: 'slide', itemId: `hw:${RUNNER}` },
    { op: 'set_fitting', moduleId: MODULE, slot: 'drawer_side', itemId: `hw:${SIDES}` },
  ]);
  step('два фасада', [{ op: 'set_fronts', moduleId: MODULE, drawerCount: 2 }]);
  const H = Math.round(moduleCarcassHeightMm(unitOf(shown()), shown()));
  const even = evenDrawerFronts(2, H);
  step('«Равномерно»', [{ op: 'set_fill', moduleId: MODULE, fill: withDrawerFronts(unitOf(shown()).fill!, even.heights, even.locked) }]);
  const inner = innerMm === null ? { warnings: [] as string[] } : ops([{ op: 'set_fill', moduleId: MODULE, fill: withDrawerInners(unitOf(shown()).fill!, 0, [innerMm]) }]);
  return { shown, ops, estimate: () => variant().estimate, inner, H };
}
function unitOf(run: Run): Module {
  const u = allModules(run).find((m) => m.id === MODULE);
  if (!u) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${MODULE} нет`);
  return u;
}
const kitsOf = (run: Run, hw: Map<string, HardwareItem>) => moduleDrawerKits(unitOf(run), run, SHOP, hw);
const INNER_KEY = `${MODULE}:idrawer:0:0`;
const OUTER_KEY = `${MODULE}:drawer:0`;

export function innerDrawerChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nВНУТРЕННИЙ ЯЩИК TANDEMBOX: два равных фасада, внутренний 120 мм за верхним — передняя панель, держатели, ручка по Blum');

  const hw = catalog();
  const s = scenario(hw);
  const run = s.shown();
  const unit = unitOf(run);
  const kits = kitsOf(run, hw);
  const innerKit = kits.find((k) => k.place.key === INNER_KEY);
  const topKit = kits.find((k) => k.place.key === OUTER_KEY);
  const lowKit = kits.find((k) => k.place.key === `${MODULE}:drawer:1`);
  if (!innerKit || !topKit || !lowKit) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: комплектов ящиков модуля ${MODULE} нет (${kits.map((k) => k.place.key).join(', ')})`);
  const LW = innerKit.place.openingWidthMm;
  const zoneInner = innerKit.place.zoneToMm - innerKit.place.zoneFromMm;
  const art = (item?: HardwareItem) => item?.hardware.manufacturerArticle ?? '—';

  /* IN1 — комплект внутреннего ящика: позиции каталога по Blum и раскрой панели. */
  check(
    `IN1 внутренний ящик за верхним фасадом (зона ${zoneInner} мм): короб системы — передняя панель ${art(innerKit.state === 'box' ? innerKit.inner?.panel : undefined)} по раскрою LW − 132 = ${LW} − 132 = ${LW - 132} мм, держатели ZIF.71M0 (царга 83,6), ручка ZIF.80M5; место 120 ≥ min 106, удобного доступа сверху (136) нет — словами`,
    s.inner.warnings.length === 0 &&
      zoneInner === 120 &&
      innerKit.state === 'box' &&
      art(innerKit.inner?.panel) === 'Z31L1036A' &&
      art(innerKit.inner?.holder) === 'ZIF.71M0' &&
      art(innerKit.inner?.handle) === 'ZIF.80M5' &&
      innerKit.inner?.panelLengthMm === LW - 132 &&
      innerKit.inner?.spaceMinMm === 106 &&
      innerKit.inner?.spaceComfortMm === 136 &&
      /удобного доступа сверху нет: для него нужно 136 мм, здесь 120/.test(innerSystemWords(innerKit) ?? ''),
    `${innerKit.state === 'box' ? innerSystemWords(innerKit) : innerKit.missing.join(' | ')}`,
  );

  /* IN2 — два наружных фасада одинаковы; короб верхнего ниже на зону внутреннего; оба наружных — короба системы. */
  const rows = drawerFrontRows(unit, run, SHOP, hw);
  const zoneTop = topKit.place.zoneToMm - topKit.place.zoneFromMm;
  check(
    `IN2 два одинаковых наружных фасада (${(unit.fill?.drawerHeights ?? []).join(' / ')} мм мест): оба ящика — короба системы; короб верхнего — в зоне ${zoneTop} мм под внутренним (зоны не пересекаются)`,
    (unit.fill?.drawerHeights ?? []).length === 2 &&
      unit.fill!.drawerHeights[0] === unit.fill!.drawerHeights[1] &&
      topKit.state === 'box' &&
      lowKit.state === 'box' &&
      topKit.place.zoneToMm <= innerKit.place.zoneFromMm &&
      rows.length >= 2,
    `зона верхнего ${topKit.place.zoneFromMm}…${topKit.place.zoneToMm} · внутреннего ${innerKit.place.zoneFromMm}…${innerKit.place.zoneToMm}`,
  );

  /* IN3 — раскрой: дно (LW − 75) × (NL − 24) и задняя стенка (LW − 87) × 84 у внутреннего; деревянного фасада у него нет. */
  const panels = buildPanels({ run, production: SHOP, hardware: hw });
  const ofInner = panels.filter((p) => (p.partIds ?? []).some((id) => id.startsWith(INNER_KEY)));
  const dims = ofInner.map((p) => `${p.name} ${p.lengthMm}×${p.widthMm}`).sort();
  const hasBottom = ofInner.some((p) => p.lengthMm === LW - 75 && p.widthMm === 450 - 24);
  const hasBack = ofInner.some((p) => p.lengthMm === LW - 87 && p.widthMm === 84);
  const woodFront = ofInner.some((p) => /Фронт|Фасад/i.test(p.name));
  check(
    `IN3 раскрой внутреннего ящика по формулам Blum: дно ${LW - 75} × 426, задняя стенка ${LW - 87} × 84 (ДСП 16); фасада из плиты у него нет — передняя панель металлическая, покупная`,
    hasBottom && hasBack && !woodFront,
    dims.join(' · ') || 'деталей нет',
  );

  /* IN4 — смета: на внутренний ящик — панель (раскрой в строке), держатели, ручка; направляющих и царг — по 3. */
  const lines = s.estimate().lines;
  const innerLines = lines.filter((l) => l.key.startsWith('inner_front_'));
  const panelLine = innerLines.find((l) => l.key === 'inner_front_hw:MFR-BLUM-Z31L1036A');
  const holderLine = innerLines.find((l) => l.key === 'inner_front_hw:MFR-BLUM-ZIF.71M0');
  const handleLine = innerLines.find((l) => l.key === 'inner_front_hw:MFR-BLUM-ZIF.80M5');
  const runnerLine = lines.find((l) => l.key === `fitting_slide_hw:${RUNNER}`);
  const sideLine = lines.find((l) => l.key === `fitting_drawer_side_hw:${SIDES}`);
  const boxLine = lines.find((l) => l.key === 'drawer_box');
  check(
    `IN4 смета: передняя панель ×1 «раскрой ${LW - 132} мм из заготовки 1036», держатели ZIF.71M0 ×1, ручка ZIF.80M5 ×1 — «цена не задана»; направляющие и царги — по 3 комплекта (2 наружных + внутренний); «Ящики в сборе» нет`,
    innerLines.length === 3 &&
      panelLine?.quantity === 1 &&
      new RegExp(`раскрой ${LW - 132} мм из заготовки 1036`).test(panelLine.title) &&
      holderLine?.quantity === 1 &&
      handleLine?.quantity === 1 &&
      innerLines.every((l) => Boolean(l.priceUnset)) &&
      runnerLine?.quantity === 3 &&
      sideLine?.quantity === 3 &&
      !boxLine,
    `${innerLines.map((l) => `${l.title} ×${l.quantity}`).join(' · ')} · направляющие ${runnerLine?.quantity ?? '—'} · царги ${sideLine?.quantity ?? '—'} · ящики в сборе ${boxLine?.quantity ?? 'нет'}`,
  );

  /* IN5 — сцена: передняя часть внутреннего — за плоскостью корпуса (z ≤ 0), наружный фасад — перед ней (z ≥ 0). */
  const boxes = runBoxes(run, { thicknessMm: SHOP.carcassMm, frontThicknessMm: SHOP.frontMm, gapMm: SHOP.frontGapMm, hardware: hw, drawerKits: undefined } as never) as {
    part?: string;
    material: string;
    position: [number, number, number];
    scale: [number, number, number];
    travel?: { mm: number };
  }[];
  const innerBoxes = boxes.filter((b) => b.part === INNER_KEY);
  const innerFrontZ = Math.max(...innerBoxes.map((b) => b.position[2] + b.scale[2] / 2));
  const panelBox = innerBoxes.find((b) => b.material === 'metal' && Math.abs(b.scale[0] * 1000 - (LW - 132)) < 0.5);
  const outerFront = boxes.filter((b) => b.part === OUTER_KEY && b.material === 'front');
  const outerFrontBackZ = Math.min(...outerFront.map((b) => b.position[2] - b.scale[2] / 2));
  check(
    `IN5 сцена: внутренний ящик — царги, ходовая, дно, задняя стенка и передняя панель ${LW - 132} мм (металл) с держателями и ручкой — едут с ним (ключ ${INNER_KEY}); перед ним — плоскость корпуса (${innerFrontZ.toFixed(4)} м), тыл наружного фасада — ${outerFrontBackZ.toFixed(4)} м: в закрытом не пересекаются`,
    innerBoxes.length >= 8 && Boolean(panelBox) && innerFrontZ <= 1e-6 && outerFront.length > 0 && outerFrontBackZ >= -1e-6,
    `коробок внутреннего ${innerBoxes.length} · панель ${panelBox ? (panelBox.scale[0] * 1000).toFixed(1) : 'НЕТ'} мм · фасадов наружного ${outerFront.length}`,
  );

  /* IN6 — ход: та же направляющая у наружного и внутреннего — тот же ход; блокировка — внутренний только с наружным. */
  const runIn = drawerRunnerOf(innerKit, hw);
  const runOut = drawerRunnerOf(topKit, hw);
  const lock1 = toggleDrawerInterlock([], INNER_KEY);
  const lock2 = toggleDrawerInterlock([OUTER_KEY, INNER_KEY], OUTER_KEY);
  const lock3 = toggleDrawerInterlock([OUTER_KEY], INNER_KEY);
  check(
    `IN6 ход по направляющей: наружный ${runOut.travelMm} мм, внутренний ${runIn.travelMm} мм (${runIn.travelBasis}); внутренний открывается только с наружным, закрытие наружного закрывает внутренний; при открытом наружном внутренний — отдельно`,
    runIn.travelMm === runOut.travelMm &&
      runIn.travelMm > 0 &&
      lock1.includes(OUTER_KEY) &&
      lock2.length === 0 &&
      lock3.join('|') === `${OUTER_KEY}|${INNER_KEY}`,
    `${lock1.join(',')} · ${lock2.join(',') || 'пусто'} · ${lock3.join(',')}`,
  );

  /*
   * IN7 — присадка: внутренний ящик добавляет ровно своё — дно и заднюю стенку короба (держатель задней
   * стенки — «не рассчитано» теми же словами, что у наружных) и пункт «направляющая на корпусе» у боковин
   * корпуса — под своим именем «внутренний ящик 0», а не вторым «ящик 0». Передней части сверлить нечего:
   * панель, держатели и ручка покупные; поводок ZIF.80M7 (сверление наружного фасада) не выбран.
   */
  const drillOf = (r: Run) =>
    drillingPlan({ walls: [{ wallId: 'w1', label: 'Стена А', run: r }], production: SHOP, hardware: hw })
      .parts.filter((p) => p.moduleId === MODULE)
      .map((p) => `${p.name}|${p.leaf ?? ''}|${p.lengthMm}×${p.widthMm}|${p.ops.length}|${p.pending.map((x) => x.what).join(',')}`)
      .sort();
  const sNo = scenario(hw, null);
  const withInner = drillOf(run);
  const without = drillOf(sNo.shown());
  const added = withInner.filter((r) => !without.includes(r));
  const innerParts = added.filter((r) => r.includes(`${INNER_KEY}:box:`));
  const sides = added.filter((r) => r.startsWith('Боковина|'));
  const outerBack = without.find((r) => r.includes(`${OUTER_KEY}:box:wall`)) ?? '';
  const innerBack = innerParts.find((r) => r.includes(':box:wall')) ?? '';
  check(
    'IN7 присадка: внутренний ящик добавляет свои дно и заднюю стенку (держатель задней стенки — «не рассчитано», как у наружного) и пункт «направляющая на корпусе, внутренний ящик 0» у двух боковин корпуса; передней части сверлить нечего; фронты наружных — прежние',
    innerParts.length === 2 &&
      innerParts.every((r) => !/Фронт|Фасад/i.test(r)) &&
      innerBack.endsWith(outerBack.split('|').pop()!.replace('ящик 0', 'внутренний ящик 0')) &&
      sides.length === 2 &&
      sides.every((r) => r.includes('направляющая на корпусе, внутренний ящик 0') && (r.match(/направляющая на корпусе, ящик 0/g) ?? []).length === 1) &&
      added.length === innerParts.length + sides.length &&
      without.filter((r) => !withInner.includes(r)).every((r) => r.startsWith('Боковина|')),
    `добавлено: ${added.join(' · ')}`,
  );

  /* IN8 — меньше места, чем у Blum: зона 100 — черновик с миллиметрами; доступ сверху — словами, а не запрет. */
  const s100 = scenario(hw, 100);
  const k100 = kitsOf(s100.shown(), hw).find((k) => k.place.key === INNER_KEY);
  check(
    'IN8 зона 100 мм — черновик словами «нужно по высоте от 106 мм … не хватает 6 мм» (ZIF.71M0, печ. 298), правка применена',
    s100.inner.warnings.length === 0 && k100?.state === 'draft' && /от 106 мм .*не хватает 6 мм/.test(k100.missing.join(' ')),
    k100?.state === 'draft' ? k100.missing[0] : String(k100?.state),
  );

  /* IN9 — у организации без позиций внутреннего ящика (импорт до 2026-11-02) — черновик: что загрузить. */
  const hwOld = catalog(INNER_KIT);
  const sOld = scenario(hwOld);
  const kOld = kitsOf(sOld.shown(), hwOld).find((k) => k.place.key === INNER_KEY);
  check(
    'IN9 каталог без позиций внутреннего ящика — черновик: называет Z31L1036A, ZIF.71M0, ZIF.80M5 и «Фурнитура производителей» → «Загрузить»',
    kOld?.state === 'draft' &&
      ['Z31L1036A', 'ZIF.71M0', 'ZIF.80M5'].every((a) => kOld.missing.join(' ').includes(a)) &&
      /«Фурнитура производителей» → «Загрузить»/.test(kOld.missing.join(' ')),
    kOld?.state === 'draft' ? kOld.missing.join(' | ') : String(kOld?.state),
  );

  /* IN10 — широкий модуль: панели 1036 мм не хватает на LW − 132 — черновик с миллиметрами. */
  const wide: Module = { ...unit, widthMm: 1300 };
  const kWide = moduleDrawerKits(wide, run, SHOP, hw).find((k) => k.place.key === INNER_KEY);
  check(
    'IN10 модуль 1300: по раскрою нужна панель LW − 132 длиннее заготовки 1036 — черновик «не хватает … мм»',
    kWide?.state === 'draft' && /1036 мм, а по раскрою нужна .* не хватает/.test(kWide.missing.join(' ')),
    kWide?.state === 'draft' ? kWide.missing[0] : String(kWide?.state),
  );

  /* IN11 — позиции каталога в отпечаток не входят: тот же ряд с прежним каталогом и с новым — тот же отпечаток. */
  check(
    'IN11 отпечаток ряда от каталога не зависит: с позициями внутреннего ящика и без — тот же',
    runFingerprint(run) === runFingerprint(sOld.shown()),
    `${runFingerprint(run)} / ${runFingerprint(sOld.shown())}`,
  );

  console.log(`\nВНУТРЕННИЙ ЯЩИК TANDEMBOX: ${passed} / ${failed}`);
  return { passed, failed };
}

if (require.main === module) {
  const r = innerDrawerChecks();
  if (r.failed > 0) process.exit(1);
}
