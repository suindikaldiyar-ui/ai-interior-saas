/**
 * ПРИЁМКА «АНТРЕСОЛЬ ДО ПОТОЛКА + AVENTOS» (ТЗ 2026-11-02, задача B). Входит в `npm run test:hardware`.
 *
 * Путь экрана: `workspaceInput` → `objectInput` → `composeVariants` → `applyOps`, демо-кухня (потолок 2700,
 * зазор цеха 0), верхний ряд до потолка и антресоль 350 над ним (`mezz-1200@w1`, вне короба вентиляции).
 * Правки — те же операции, что шлёт блок «Антресоль до потолка» (`set_top_filler`, `set_fitting`,
 * `set_lift_angle`); подбор — `liftChoices`, та же `fittingVerdict`, что запирает «Установить».
 */

import { DEFAULT_PRODUCTION, type CatalogEntryFull, type HardwareItem } from '../types/catalog';
import type { MillworkOp, Module, Run, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { fittingVerdict } from '../lib/millwork/fittings';
import { runBoxes, runPlaces } from '../lib/millwork/cabinetBoxes';
import { buildPanels } from '../lib/millwork/panels';
import { runFingerprint } from '../lib/millwork/fingerprint';
import { allModules } from '../lib/millwork/layout';
import { zoneTopOfRun } from '../lib/millwork/zones';
import { TOP_FILLER_PANEL_NAME, ceilingStack, topFillerSpans } from '../lib/millwork/topFiller';
import { liftChoices } from '../lib/millwork/liftChoice';
import { liftPose } from '../lib/millwork/liftKinematics';
import { aventosOf } from '../lib/millwork/aventos';

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
const MEZZ = 'mezz-1200@w1';
const HK = 'MFR-BLUM-22K2300';
const HS = 'MFR-BLUM-22S2200';
const HL = 'MFR-BLUM-22L2500';

function kitchen(measurement = DEMO_MEASUREMENT) {
  const base = workspaceInput({ title: 'CEILING', zone: 'Кухня', measurement, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production: DEFAULT_PRODUCTION, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: CATALOG });
  const disabled = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
  let edited: Partial<Record<VariantKey, Run>> = {};
  const variant = () => composeVariants(input, disabled, edited).find((v) => v.key === 'optimal')!;
  const shown = () => variant().run;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown(), requirements: DEMO_REQUIREMENTS, ops: list, openings: input.openings, hardware: CATALOG });
    if (next.warnings.length === 0 || next.fingerprint !== shown().fingerprint) edited = { optimal: next };
    return next;
  };
  return { shown, ops, estimate: () => variant().estimate };
}
const unitOf = (run: Run, id: string): Module => {
  const u = allModules(run).find((m) => m.id === id);
  if (!u) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${id} нет`);
  return u;
};
const topOf = (run: Run, id: string) => {
  const p = runPlaces(run).find((x) => x.unit.id === id);
  if (!p) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: места ${id} нет`);
  return Math.round((p.y + p.heightM) * 1000);
};
const verdict = (run: Run, id: string, article: string) =>
  fittingVerdict({ unit: unitOf(run, id), run, slot: 'lift', item: item(article), production: DEFAULT_PRODUCTION, catalog: CATALOG });

export function ceilingChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nАНТРЕСОЛЬ ДО ПОТОЛКА: верхняя фальшпанель, ограничитель угла, подбор подъёмника');

  const k = kitchen();
  const s0 = k.ops([{ op: 'set_option', key: 'upperToCeiling', value: true }, { op: 'set_mezzanine', heightMm: 350 }]);
  if (s0.warnings.length > 0 && !allModules(k.shown()).some((m) => m.id === MEZZ)) throw new Error(`антресоль не встала: ${s0.warnings.join(' | ')}`);
  /* Подъёмное открывание — у места «Подъёмный механизм» (без него места нет, и проверка это скажет). */
  k.ops([{ op: 'set_opening', moduleId: MEZZ, opening: 'lift' }]);
  const run0 = k.shown();
  const ceiling = run0.ceilingHeightMm;
  const fp0 = runFingerprint(run0);
  const pan0 = buildPanels({ run: run0, production: DEFAULT_PRODUCTION, hardware: CATALOG });
  const fronts0 = k.estimate().lines.find((l) => l.key === 'front_panel')?.quantity ?? NaN;
  const top0 = topOf(run0, MEZZ);
  const hkNo = verdict(run0, MEZZ, HK);

  /* CB1 — фальшпанель 100: корпус ниже на её высоту, деталь в раскрое, коробка в сцене, отпечаток другой. */
  const f1 = k.ops([{ op: 'set_top_filler', heightMm: 100 }]);
  const run1 = k.shown();
  const top1 = topOf(run1, MEZZ);
  const spans = topFillerSpans(run1);
  const pan1 = buildPanels({ run: run1, production: DEFAULT_PRODUCTION, hardware: CATALOG });
  const fillerParts = pan1.filter((p) => p.name === TOP_FILLER_PANEL_NAME);
  const boxes = runBoxes(run1, { thicknessMm: DEFAULT_PRODUCTION.carcassMm, frontThicknessMm: DEFAULT_PRODUCTION.frontMm, gapMm: DEFAULT_PRODUCTION.frontGapMm, hardware: CATALOG } as never) as {
    panel?: string;
    position: [number, number, number];
    scale: [number, number, number];
  }[];
  const fillerBoxes = boxes.filter((b) => b.panel === TOP_FILLER_PANEL_NAME);
  const stack = ceilingStack(unitOf(run1, MEZZ), run1);
  /*
   * Смета — из раскроя: строка «Фасады» = фасадная площадь раскроя вместе с планкой. Корпуса до потолка ниже на
   * 100 мм — их фасады короче ровно на площадь планки над ними, и итог по фасадам тот же: планка не «добавка».
   */
  const fronts1 = k.estimate().lines.find((l) => l.key === 'front_panel')?.quantity ?? NaN;
  const areaM2 = (list: typeof pan1) => list.filter((p) => p.material.startsWith('Фасад')).reduce((s, p) => s + (p.lengthMm * p.widthMm * p.qty) / 1e6, 0);
  const fillerM2 = areaM2(fillerParts);
  const furnitureDeltaM2 = areaM2(pan1.filter((p) => p.name !== TOP_FILLER_PANEL_NAME)) - areaM2(pan0);
  check(
    `CB1б смета: «Фасады» ${fronts0} → ${fronts1} м² = фасадная площадь раскроя с планкой (${areaM2(pan1).toFixed(2)}); фасады мебели до потолка ${furnitureDeltaM2.toFixed(2)} м², планка +${fillerM2.toFixed(2)} м²`,
    Number.isFinite(fronts0) &&
      Math.abs(fronts1 - areaM2(pan1)) <= 0.011 &&
      fillerM2 > 0 &&
      Math.abs(furnitureDeltaM2 + fillerM2) <= 0.011,
  );
  check(
    `CB1 фальшпанель 100 мм: верх антресоли ${top0} → ${top1} мм (= потолок ${ceiling} − зазор цеха − 100); планка в раскрое по участкам мебели до потолка (${spans.length}) и коробкой в сцене над ними, в плоскости фасадов; высоты словами: зазор над планкой ${stack.gapMm} мм; отпечаток другой`,
    f1.warnings.length === 0 &&
      top0 === zoneTopOfRun(run0) &&
      top1 === top0 - 100 &&
      top1 === zoneTopOfRun(run1) &&
      spans.length > 0 &&
      fillerParts.length === spans.length &&
      fillerParts.every((p) => p.widthMm === 100) &&
      fillerParts.reduce((s, p) => s + p.lengthMm, 0) === spans.reduce((s, sp) => s + sp.toMm - sp.fromMm, 0) &&
      pan1.length === pan0.length + spans.length &&
      fillerBoxes.length === spans.length &&
      fillerBoxes.every((b) => Math.abs((b.position[1] - b.scale[1] / 2) * 1000 - top1) < 0.5 && Math.abs(b.scale[1] * 1000 - 100) < 0.5) &&
      stack.underFiller &&
      stack.fillerMm === 100 &&
      stack.topMm + stack.fillerMm + stack.gapMm === ceiling &&
      runFingerprint(run1) !== fp0,
    `участки ${spans.map((s) => `${s.fromMm}…${s.toMm}/${s.depthMm}`).join(', ')} · деталей ${fillerParts.length} · коробок ${fillerBoxes.length} · низ коробок ${fillerBoxes.map((b) => Math.round((b.position[1] - b.scale[1] / 2) * 1000)).join('/')}`,
  );

  /* CB2 — отказ словами: антресоль своей высоты с планкой 500 не встаёт. */
  const big = k.ops([{ op: 'set_top_filler', heightMm: 600 }]);
  check(
    'CB2 фальшпанель 600 мм — отказ движка словами с миллиметрами («кончается на … мм, а верх мебели с планкой … — лишние … мм»), планка прежняя',
    big.warnings.length === 1 && /лишние \d+ мм/.test(big.warnings[0]) && k.shown().topFiller?.heightMm === 100,
    `«${big.warnings[0] ?? '—'}»`,
  );

  /* CB3 — HK top на антресоли до потолка: без планки места нет; с планкой 100 — фасад идёт перед планкой. */
  const hk1 = verdict(run1, MEZZ, HK);
  const placeCheck = (v: ReturnType<typeof verdict>, label: string) => v.checks.find((c) => c.label === label);
  check(
    `CB3 HK top ${HK.replace('MFR-BLUM-', '')} на антресоли до потолка: без планки и зазора — «не хватает» места над корпусом; с планкой 100 проверяется и планка — фасад на ходу проходит перед ней (строка «фальшпанель» ok), место над корпусом — до потолка (${stack.aboveMm} мм)`,
    hkNo.state === 'refused' &&
      placeCheck(hkNo, 'место над корпусом')?.state === 'fail' &&
      placeCheck(hk1, 'фальшпанель')?.state === 'ok' &&
      /до потолка 100 мм/.test(placeCheck(hk1, 'место над корпусом')?.words ?? '') &&
      stack.aboveMm === 100 &&
      stack.limitWords === 'до потолка',
    `без планки: ${hkNo.summary} · с планкой: ${hk1.summary} · ${placeCheck(hk1, 'фальшпанель')?.words ?? 'строки «фальшпанель» нет'}`,
  );

  /* CB4 — HS top через планку: фасад уходит назад над корпусом и заходит в неё — отказ с мм. */
  const hs1 = verdict(run1, MEZZ, HS);
  check(
    `CB4 HS top ${HS.replace('MFR-BLUM-', '')} под планкой: отказ словами с миллиметрами (фасад на ходу заходит в фальшпанель или не хватает места над корпусом)`,
    hs1.state === 'refused' && /(заходит в верхнюю фальшпанель|не хватает) \S*/.test(hs1.summary) && /мм/.test(hs1.summary),
    hs1.summary,
  );

  /* CB5 — ограничитель угла: только у HK top и в пределах 75…107°; входит в отпечаток. */
  const pick = liftChoices(unitOf(k.shown(), MEZZ), k.shown(), CATALOG);
  const hkPick = pick.choices.find((c) => c.article === HK);
  const limiter = hkPick?.changes.find((c) => c.kind === 'limiter');
  const taller = hkPick?.changes.find((c) => c.kind === 'filler-height');
  /* Планка выше — проверено вхолостую тем же движком: применённое изменение и установка без отказа. */
  const tallerRun = taller ? applyOps({ run: k.shown(), requirements: DEMO_REQUIREMENTS, ops: taller.ops, openings: [], hardware: CATALOG }) : null;
  const applied = limiter ? k.ops(limiter.ops) : null;
  const run5 = k.shown();
  const lift5 = unitOf(run5, MEZZ).fittings?.find((f) => f.slot === 'lift');
  const v5 = verdict(run5, MEZZ, HK);
  const tooLow = k.ops([{ op: 'set_lift_angle', moduleId: MEZZ, openDeg: 60 }]);
  check(
    `CB5 подбор: HK top — ${hkPick ? hkPick.state : 'НЕТ'}; изменения: ${hkPick?.changes.map((c) => c.words).join(' · ') || '—'}; ограничитель применён — позиция на месте${lift5?.openDeg ? `, ограничитель ${lift5.openDeg}°` : ''}, проверка «Установить» не отказывает; планка выше — встаёт без ограничителя; угол 60° — отказ «регулируется от 75° до 107°»`,
    Boolean(hkPick) &&
      hkPick!.state === 'fits-with-change' &&
      Boolean(limiter) &&
      (applied?.warnings.length ?? 1) === 0 &&
      lift5?.itemId === `hw:${HK}` &&
      v5.state !== 'refused' &&
      lift5?.openDeg !== undefined &&
      lift5.openDeg >= 75 &&
      lift5.openDeg < 107 &&
      Boolean(tallerRun) &&
      tallerRun!.warnings.length === 0 &&
      (tallerRun!.topFiller?.heightMm ?? 0) > 100 &&
      !unitOf(tallerRun!, MEZZ).fittings?.find((f) => f.slot === 'lift')?.openDeg &&
      tooLow.warnings.length === 1 &&
      /от 75° до 107°/.test(tooLow.warnings[0]),
    `${hkPick?.state} · ${hkPick?.words} · после: ${v5.summary} · «${tooLow.warnings[0] ?? '—'}»`,
  );

  /* CB6 — подбор показывает три состояния и петли; ограничитель — только у моделей с регулировкой. */
  const states = new Set(pick.choices.map((c) => c.state));
  const limiterOnNonHk = pick.choices.some((c) => c.changes.some((ch) => ch.kind === 'limiter') && c.family !== 'HK top');
  check(
    `CB6 подбор подъёмника: позиций с моделью ${pick.choices.length} (HK, HS, HL top), состояния ${Array.from(states).join(' / ')}; ограничитель предлагается только у HK top; петли — отдельным вариантом`,
    pick.choices.length > 0 && pick.choices.some((c) => c.family === 'HS top') && !limiterOnNonHk && pick.hinges.ops.length === 1 && pick.choices.every((c) => c.words.length > 0),
    pick.choices.slice(0, 6).map((c) => `${c.article.replace('MFR-BLUM-', '')}:${c.state}`).join(', '),
  );

  /*
   * CB8 — каждое изменение подбора и каждое «Установить» применяются движком ЦЕЛИКОМ: без отказа, и
   * подъёмник оказывается на месте (ограничитель — с тем углом, что назван).
   */
  let tried = 0;
  const broken: string[] = [];
  for (const choice of pick.choices) {
    const batches = choice.state === 'fits' ? [[{ op: 'set_opening', moduleId: MEZZ, opening: 'lift' }, { op: 'set_fitting', moduleId: MEZZ, slot: 'lift', itemId: choice.itemId }] as MillworkOp[]] : choice.changes.map((c) => c.ops);
    for (const batch of batches) {
      tried += 1;
      const out = applyOps({ run: run1, requirements: DEMO_REQUIREMENTS, ops: batch, openings: [], hardware: CATALOG });
      const lift = allModules(out).find((m) => m.id === MEZZ)?.fittings?.find((f) => f.slot === 'lift');
      if (out.warnings.length > 0 || lift?.itemId !== choice.itemId) broken.push(`${choice.article}: ${out.warnings[0] ?? 'позиции нет'}`);
    }
  }
  check(
    `CB8 подбор: каждое предложенное изменение и «Установить» применяются движком целиком — без отказа, подъёмник на месте (${tried} применений)`,
    tried > 0 && broken.length === 0,
    broken.slice(0, 2).join(' | '),
  );

  /*
   * CB7 — «Убрать» планку: антресоль снова у потолка, детали планки нет; подъёмник, который встал
   * благодаря планке, после правки не встаёт — правка применена, и это сказано словами.
   */
  const off = k.ops([{ op: 'set_top_filler', heightMm: null }]);
  const runOff = k.shown();
  check(
    'CB7 «Убрать» планку: верх антресоли снова у потолка, деталей планки в раскрое нет; подъёмник HK top без планки — «после правки не встаёт» словами',
    topOf(runOff, MEZZ) === top0 &&
      buildPanels({ run: runOff, production: DEFAULT_PRODUCTION, hardware: CATALOG }).every((p) => p.name !== TOP_FILLER_PANEL_NAME) &&
      off.warnings.length === 1 &&
      /после правки не встаёт/.test(off.warnings[0]),
    `верх ${topOf(runOff, MEZZ)} мм · «${off.warnings[0] ?? '—'}»`,
  );

  /*
   * CB9 — настоящее столкновение: планка 180 мм — места над корпусом хватает (167 ≤ 180), но HS top на
   * ходу уходит назад над корпусом и заходит в планку — отказ строкой «фальшпанель» с миллиметрами;
   * HL top (подъём 338 мм) — места нет, словами.
   */
  k.ops([{ op: 'set_top_filler', heightMm: 180 }]);
  const run9 = k.shown();
  const hs9 = verdict(run9, MEZZ, HS);
  const hl9 = verdict(run9, MEZZ, HL);
  check(
    'CB9 планка 180 мм: HS top — место над корпусом есть, но фасад на ходу заходит в фальшпанель — отказ с мм; HL top — «не хватает» места над корпусом',
    run9.topFiller?.heightMm === 180 &&
      hs9.state === 'refused' &&
      placeCheck(hs9, 'место над корпусом')?.state === 'ok' &&
      placeCheck(hs9, 'фальшпанель')?.state === 'fail' &&
      /заходит в верхнюю фальшпанель 180 мм на [\d.]+ мм/.test(placeCheck(hs9, 'фальшпанель')?.words ?? '') &&
      hl9.state === 'refused' &&
      placeCheck(hl9, 'место над корпусом')?.state === 'fail',
    `HS: ${placeCheck(hs9, 'фальшпанель')?.words ?? '—'} · HL: ${placeCheck(hl9, 'место над корпусом')?.words ?? '—'}`,
  );

  /*
   * CB10 — места достаточно: потолок 3100, короб вентиляции снят, антресоль 400 на верхнем ряду (не до
   * потолка) — над ней 530 мм. HK, HS и HL top (корпуса 205…600 и 300…580 по каталогу) встают по ходу и
   * месту; подбор называет все три семейства «подходит», и «Установить» применяется движком.
   */
  const tall: typeof DEMO_MEASUREMENT = {
    ...DEMO_MEASUREMENT,
    ceilingHeightMm: 3100,
    walls: DEMO_MEASUREMENT.walls.map((wall) => ({ ...wall, openings: wall.openings.filter((o) => o.kind !== 'beam') })),
  };
  const k2 = kitchen(tall);
  k2.ops([{ op: 'set_mezzanine', heightMm: 400 }]);
  k2.ops([{ op: 'set_opening', moduleId: MEZZ, opening: 'lift' }]);
  const run10 = k2.shown();
  const all10 = [HK, HS, HL].map((a) => ({ a, v: verdict(run10, MEZZ, a) }));
  const pick10 = liftChoices(unitOf(run10, MEZZ), run10, CATALOG);
  const fits10 = pick10.choices.filter((c) => c.state === 'fits');
  const hl10 = fits10.find((c) => c.article === HL);
  const put10 = hl10 ? k2.ops([{ op: 'set_opening', moduleId: MEZZ, opening: 'lift' }, { op: 'set_fitting', moduleId: MEZZ, slot: 'lift', itemId: hl10.itemId }]) : null;
  const stack10 = ceilingStack(unitOf(run10, MEZZ), run10);
  check(
    `CB10 антресоль 400 под потолком 3100 (над ней ${ceilingStack(unitOf(run10, MEZZ), run10).aboveMm} мм): HK, HS, HL top — ход и место над корпусом в порядке; подбор: «подходит» ${fits10.length} из ${pick10.choices.length}, все три семейства; HL top ставится без отказа`,
    all10.every(({ v }) => v.state !== 'refused' && placeCheck(v, 'место над корпусом')?.state === 'ok' && placeCheck(v, 'ход')?.state === 'ok') &&
      ['HK top', 'HS top', 'HL top'].every((f) => fits10.some((c) => c.family === f)) &&
      (put10?.warnings.length ?? 1) === 0 &&
      unitOf(k2.shown(), MEZZ).fittings?.find((f) => f.slot === 'lift')?.itemId === `hw:${HL}` &&
      all10.every(({ v }) => new RegExp(`${stack10.limitWords} ${stack10.aboveMm} мм`).test(placeCheck(v, 'место над корпусом')?.words ?? '')),
    all10.map(({ a, v }) => `${a.replace('MFR-BLUM-', '')}: ${placeCheck(v, 'место над корпусом')?.words ?? v.summary}`).join(' · '),
  );

  /*
   * CB12 — место над корпусом под ригелем — одно число в блоке высот и в проверке хода (`liftLimitOf`): ряд
   * CB10 (антресоль 400, верх 2570), ригель 1200…1500 со свесом 400 (низ 2700) — «до ригеля 130 мм» и там,
   * и там. Ригель положен на ряд без пересборки: пересборка с ним падает исключением и на HEAD (шкаф под
   * ригелем вырастает до его низа — назван в «нашёл, не тронул»).
   */
  const vent = DEMO_MEASUREMENT.walls.flatMap((wall) => wall.openings).find((o) => o.kind === 'beam');
  if (!vent) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: короба вентиляции в демо-замере нет');
  const run12: Run = { ...run10, beams: [{ ...vent, id: 'beam-cb12', fromCornerMm: 1200, widthMm: 300, heightMm: 400 }] };
  const stack12 = ceilingStack(unitOf(run12, MEZZ), run12);
  const words12 = placeCheck(verdict(run12, MEZZ, HK), 'место над корпусом')?.words ?? '—';
  check(
    `CB12 под ригелем место над корпусом одним числом: блок высот «${stack12.limitWords} ${stack12.aboveMm} мм», проверка хода — «${words12}»`,
    stack12.limitWords === 'до ригеля' && stack12.aboveMm === 2700 - topOf(run12, MEZZ) && words12.includes(`до ригеля ${stack12.aboveMm} мм`),
    `верх антресоли ${topOf(run12, MEZZ)} мм`,
  );

  /*
   * CB11 — ограничитель в позе: `liftPose` с ограничителем кончается на его угле (фасад HK top на 90°,
   * а не на 107°) — та же поза у сцены и у хода у угла; без ограничителя — паспортный угол.
   */
  const model11 = aventosOf(item(HK), 350);
  const mech11 = model11 ? { model: model11, frontTopMm: 334 } : null;
  const full11 = mech11 ? liftPose(null, 1, 0.35, 0.016, mech11) : null;
  const cut11 = mech11 ? liftPose(null, 1, 0.35, 0.016, { ...mech11, limitDeg: 90 }) : null;
  const same11 = mech11 ? liftPose(null, 90 / mech11.model.openDeg, 0.35, 0.016, mech11) : null;
  const deg = (rad: number) => Math.abs((rad * 180) / Math.PI);
  check(
    `CB11 ограничитель в позе: HK top до ${full11 ? deg(full11.angle).toFixed(1) : '—'}°, с ограничителем 90° — ${cut11 ? deg(cut11.angle).toFixed(1) : '—'}°; поза конца хода = поза на доле 90/107`,
    Boolean(full11 && cut11 && same11) &&
      Math.abs(deg(full11!.angle) - 107) < 0.5 &&
      Math.abs(deg(cut11!.angle) - 90) < 0.5 &&
      Math.abs(cut11!.angle - same11!.angle) < 1e-9 &&
      Math.abs(cut11!.liftY - same11!.liftY) < 1e-9 &&
      Math.abs(cut11!.liftZ - same11!.liftZ) < 1e-9,
  );

  console.log(`\nАНТРЕСОЛЬ ДО ПОТОЛКА: ${passed} / ${failed}`);
  return { passed, failed };
}

if (require.main === module) {
  const r = ceilingChecks();
  if (r.failed > 0) process.exit(1);
}
