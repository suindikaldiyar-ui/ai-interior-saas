/**
 * ПРИЁМКА ВЫСОКОГО ШКАФА ТВ-ЗОНЫ (COMPLETE UNFINISHED, P1/P2): деление фасада по высоте, шкаф до потолка в зале,
 * антресоль над шкафом и объединение двух корпусов в один, смена секции-витрины на шкаф.
 *
 * Путь экрана: `workspaceInput` → `objectInput` → `composeVariants` → `applyOps` — готовая ТВ-зона C на стене 3800,
 * правая витрина → секция «Полки» (`set_section`). Числа — из той же деталировки (`buildPanels`), створок сцены
 * (`sceneLeaves`, коробки `runBoxesByModule`), петель (`openingHardware`), рисунка листа (`frontGlyph`), что у экрана.
 */

import { DEFAULT_PRODUCTION } from '../types/catalog';
import type { Measurement, MillworkOp, Module, Run, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { buildPanels } from '../lib/millwork/panels';
import { runBoxesByModule, runPlaces, sceneLeaves } from '../lib/millwork/cabinetBoxes';
import { leafHinges, openingHardware } from '../lib/millwork/opening';
import { frontGlyph } from '../lib/millwork/frontGlyph';
import { moduleCarcassHeightMm, moduleDepthMm, snapTo32 } from '../lib/millwork/fill';
import { runFingerprint } from '../lib/millwork/fingerprint';
import { vitrineOf } from '../lib/millwork/vitrine';
import { RUN_TEMPLATES, requirementsFromTemplate } from '../lib/millwork/templates';
import { plinthMm, workTopMm } from '../lib/millwork/shop';
import { allModules as allModulesOf } from '../lib/millwork/layout';
import { tvFromDiagonal } from '../lib/millwork/tvZone';

type Check = (name: string, ok: boolean, detail?: string) => void;
let passed = 0;
let failed = 0;

const P = DEFAULT_PRODUCTION;
const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
const WALL: Measurement = {
  ...DEMO_MEASUREMENT,
  id: 'tall',
  walls: DEMO_MEASUREMENT.walls.map((wall, i) => (i === 0 ? { ...wall, lengthMm: 3800, openings: [] } : wall)),
  comms: [],
};

function screen() {
  const template = RUN_TEMPLATES.find((t) => t.tvZone === 'C');
  if (!template) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: шаблона ТВ-зоны C нет');
  const requirements = requirementsFromTemplate(template, DEMO_REQUIREMENTS.options);
  const base = workspaceInput({ title: 'TV', zone: 'Гостиная', measurement: WALL, requirements, rates: DEMO_RATES, cornerAt: null, wallId: 'w1' });
  const input = objectInput({ base, resolution: null, requirements, rates: DEMO_RATES, production: P, milling: new Map(), carcass: new Map(), materials: new Map() });
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, DISABLED, edited).find((v) => v.key === 'optimal')!;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown().run, requirements, ops: list, openings: input.openings });
    if (next.warnings.length > 0) throw new Error(`движок отказал: ${next.warnings.join(' | ')}`);
    edited = { optimal: next };
    return shown();
  };
  const refused = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown().run, requirements, ops: list, openings: input.openings });
    if (next.warnings.length === 0) throw new Error(`ждали отказа, а движок принял: ${JSON.stringify(list)}`);
    return next.warnings[0];
  };
  const reopen = (run: Run) => {
    edited = { optimal: JSON.parse(JSON.stringify(run)) as Run };
    return shown();
  };
  return { shown, ops, refused, reopen };
}

const fronts = (run: Run, id: string) =>
  buildPanels({ run, production: P })
    .filter((p) => p.moduleId === id && p.name === 'Фасад')
    .map((p) => `${p.lengthMm}x${p.widthMm}x${p.qty}`);
const sidesOf = (run: Run, id: string) =>
  buildPanels({ run, production: P })
    .filter((p) => p.moduleId === id && p.name === 'Боковина')
    .map((p) => `${p.lengthMm}x${p.widthMm}x${p.qty}`);
const doorBoxes = (run: Run, id: string) =>
  (runBoxesByModule(run, { thicknessMm: P.carcassMm, frontThicknessMm: P.frontMm, gapMm: P.frontGapMm }).modules.find((m) => m.unit.id === id)?.boxes ?? [])
    .filter((b) => b.material === 'front' && b.part?.includes(':door:'))
    .map((b) => `${b.part}@${Math.round((b.position[1] - b.scale[1] / 2) * 1000)}+${Math.round(b.scale[1] * 1000)}`)
    .sort();

export function tallChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : (name, ok, detail = '') => {
        if (ok) passed += 1;
        else failed += 1;
        console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
      };

  console.log('\n── Высокий шкаф ТВ-зоны (TL): деление фасада, до потолка, антресоль, объединение');
  const s = screen();
  const right = (): Module => {
    const unit = s.shown().run.modules.find((m) => m.kind === 'tall' && m.offsetMm > 3000);
    if (!unit) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: правого высокого шкафа ТВ-зоны C нет');
    return unit;
  };
  const start = right();
  const fp0 = s.shown().run.fingerprint;

  /* TL1 — витрина → секция «Полки»: витрины нет, корпус ЛДСП с боковинами, одна створка. */
  const v1 = s.ops([{ op: 'set_section', moduleId: start.id, section: 'shelves' }]);
  const r1 = right();
  const h1 = moduleCarcassHeightMm(r1, v1.run);
  check(
    'TL1 витрина C → «Полки»: витрины нет, боковины 2 шт., одна створка во всю высоту, на листе — створка, не стекло',
    vitrineOf(start) !== null &&
      vitrineOf(r1) === null &&
      sidesOf(v1.run, r1.id).join() === `${h1}x${moduleDepthMm(r1, 'living', P)}x2` &&
      fronts(v1.run, r1.id).length === 1 &&
      frontGlyph(r1, 'fronts', h1).some((el) => el.kind === 'panel') &&
      !frontGlyph(r1, 'fronts', h1).some((el) => el.kind === 'glass'),
    `${sidesOf(v1.run, r1.id)} · ${fronts(v1.run, r1.id)}`,
  );

  /* TL2 — до потолка в зале: профиль 2000, потолок 2700 (зазор цеха 0, цоколь 100) — корпус 2600; 2700 — отказ. */
  const v2 = s.ops([{ op: 'set_height', moduleId: right().id, heightMm: 2600 }]);
  const place2 = runPlaces(v2.run).find((p) => p.unit.id === right().id)!;
  const no2 = s.refused([{ op: 'set_height', moduleId: right().id, heightMm: 2700 }]);
  check(
    'TL2 до потолка: корпус 2600, верх 2700 = потолок; 2700 — «лишние 100 мм»',
    moduleCarcassHeightMm(right(), v2.run) === 2600 && Math.round((place2.y + place2.heightM) * 1000) === 2700 && /лишние 100 мм/.test(no2),
    `${moduleCarcassHeightMm(right(), v2.run)} · верх ${Math.round((place2.y + place2.heightM) * 1000)} · ${no2}`,
  );

  /* TL3 — деление фасада 800: две детали, две створки сцены, петли по высоте каждой, швы на листе, отпечаток. */
  const fpBefore3 = v2.run.fingerprint;
  const v3 = s.ops([{ op: 'set_front_split', moduleId: right().id, seamsMm: [800] }]);
  const r3 = right();
  const leaves3 = sceneLeaves(r3, 2.6, undefined, 0, P).map((l) => (l.kind === 'door' ? `${l.id}@${Math.round(l.bottomM * 1000)}+${Math.round(l.heightM * 1000)}` : l.kind));
  const hw3 = openingHardware([{ unit: r3, heightMm: 2600 }], v3.run).byModule[r3.id];
  const glyph3 = frontGlyph(r3, 'fronts', 2600);
  const seam3 = glyph3.find((el) => el.kind === 'hseam');
  check(
    'TL3 деление 800: детали 796 + 1796 × 442 (ширина как у неделённой створки), створки сцены 0+800 и 800+1800, коробки фасадов сцены от пола: цоколь + ползазора, 796 и 1796, петли по высоте каждой, шов на листе 800/2600',
    fronts(v3.run, r3.id).join() === '796x442x1,1796x442x1' &&
      leaves3.join() === `${r3.id}:door:0@0+800,${r3.id}:door:1@800+1800` &&
      doorBoxes(v3.run, r3.id).join() === `${r3.id}:door:0@${plinthMm(P) + 2}+796,${r3.id}:door:1@${plinthMm(P) + 802}+1796` &&
      hw3.hinges === leafHinges(800, 'left', P) + leafHinges(1800, 'left', P) &&
      hw3.handleBar === 2 &&
      seam3?.kind === 'hseam' &&
      Math.abs(seam3.shares[0] - 800 / 2600) < 1e-9 &&
      v3.run.fingerprint !== fpBefore3,
    `${fronts(v3.run, r3.id)} · ${leaves3} · ${doorBoxes(v3.run, r3.id)} · петли ${hw3.hinges} · ${fpBefore3} → ${v3.run.fingerprint}`,
  );

  /* TL4 — отказы деления: часть ниже фасадного минимума, ящики, две створки. */
  const no4a = s.refused([{ op: 'set_front_split', moduleId: right().id, seamsMm: [40] }]);
  const drawersUnit = s.shown().run.modules.find((m) => m.frontType === 'drawers');
  const doorsTwo = s.shown().run.modules.find((m) => m.frontType === 'door' && m.doorCount >= 2);
  if (!drawersUnit || !doorsTwo) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: у тумбы ТВ-зоны C нет модуля с ящиками или с двумя створками');
  const no4b = s.refused([{ op: 'set_front_split', moduleId: drawersUnit.id, seamsMm: [200] }]);
  const no4c = s.refused([{ op: 'set_front_split', moduleId: doorsTwo.id, seamsMm: [200] }]);
  check(
    'TL4 отказы деления: 40 мм — «ниже фасадного минимума 90 мм»; ящики — «Фасадах ящиков»; две створки — «Разделите модуль по ширине»',
    /40 мм, ниже фасадного минимума 90 мм/.test(no4a) && /Фасадах ящиков/.test(no4b) && /Разделите модуль по ширине/.test(no4c),
    `${no4a} · ${no4b} · ${no4c}`,
  );

  /* TL5 — антресоль над шкафом и объединение с сохранением шва: один корпус, линия фасадов на прежней границе. */
  s.ops([{ op: 'set_front_split', moduleId: right().id, seamsMm: [] }]);
  const v5a = s.ops([{ op: 'add_overhead', moduleId: right().id, heightMm: 500, baseHeightMm: 2100 }]);
  const over5 = v5a.run.upperSegments.flatMap((seg) => seg.modules).find((m) => m.overhead);
  if (!over5) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: антресоль над шкафом не встала');
  const overBottom = Math.round(runPlaces(v5a.run).find((p) => p.unit.id === over5.id)!.y * 1000);
  const v5 = s.ops([{ op: 'merge_overhead', moduleId: over5.id, keepSeam: true }]);
  const r5 = right();
  const overLeft = v5.run.upperSegments.flatMap((seg) => seg.modules).filter((m) => m.overhead).length;
  const leaves5 = sceneLeaves(r5, 2.6, undefined, 0, P).map((l) => (l.kind === 'door' ? Math.round((l.bottomM + l.heightM) * 1000) : -1));
  check(
    'TL5 объединить шкаф 2100 с антресолью 500: корпус 2600 один (боковины 2600 × 2), антресоли нет, шов на 2100 = прежний низ антресоли (2200 от пола), полка на месте крыши 2112',
    overBottom === 2200 &&
      overLeft === 0 &&
      moduleCarcassHeightMm(r5, v5.run) === 2600 &&
      sidesOf(v5.run, r5.id).join() === `2600x${moduleDepthMm(r5, 'living', P)}x2` &&
      (r5.frontSplitMm ?? []).join() === '2100' &&
      fronts(v5.run, r5.id).join() === '2096x442x1,496x442x1' &&
      leaves5.join() === '2100,2600' &&
      plinthMm(P) + 2100 === overBottom &&
      (r5.fill?.shelves ?? []).includes(snapTo32(2100)),
    `низ антресоли ${overBottom} · створки до ${leaves5} · ${sidesOf(v5.run, r5.id)} · швы ${r5.frontSplitMm} · ${fronts(v5.run, r5.id)} · полки ${r5.fill?.shelves}`,
  );

  /* TL6 — высота шкафа с делением: верхняя часть ниже минимума — отказ с мм; снятие деления — одна створка. */
  const no6 = s.refused([{ op: 'set_height', moduleId: right().id, heightMm: 2150 }]);
  check(
    'TL6 шкаф 2150 при шве 2100 — «осталось бы 50 мм при фасадном минимуме 90 мм», ряд прежний',
    /осталось бы 50 мм/.test(no6) && moduleCarcassHeightMm(right(), s.shown().run) === 2600,
    no6,
  );

  /* TL7 — объединять не с чем: отказ словами. */
  const no7 = s.refused([{ op: 'merge_overhead', moduleId: right().id }]);
  check('TL7 объединение без антресоли — «антресоли нет — объединять не с чем»', /антресоли нет — объединять не с чем/.test(no7), no7);

  /* TL8 — запись и открытие: тот же отпечаток и те же детали. */
  const before8 = s.shown();
  const after8 = s.reopen(before8.run);
  check(
    'TL8 записал → открыл: отпечаток, швы и детали фасадов те же',
    after8.run.fingerprint === before8.run.fingerprint &&
      runFingerprint(after8.run) === before8.run.fingerprint &&
      fronts(after8.run, right().id).join() === fronts(before8.run, right().id).join(),
    `${before8.run.fingerprint} → ${after8.run.fingerprint}`,
  );

  /* TL9 — снять деление: одна створка, отпечаток без «fs=». */
  const v9 = s.ops([{ op: 'set_front_split', moduleId: right().id, seamsMm: [] }]);
  check(
    'TL9 снять деление: одна деталь фасада во всю высоту, швов нет',
    fronts(v9.run, right().id).join() === '2596x442x1' && right().frontSplitMm === undefined && v9.run.fingerprint !== fp0,
    `${fronts(v9.run, right().id)}`,
  );

  /*
   * TL10 — витрина на тумбе (P1): корпус над тумбой зоны без столешницы, витрина на нём; низ — крыша тумбы. Телевизор
   * и панель реек сначала уступают место — иначе отказ словами (мебель не входит в телевизор и не стоит на панели).
   */
  const tumba = s.shown().run.modules.find((m) => m.kind === 'base' && m.offsetMm === 550);
  if (!tumba) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: тумбы ТВ-зоны C на 550 нет');
  const no10a = s.refused([{ op: 'add_overhead', moduleId: tumba.id, heightMm: 700, widthMm: 900, depthMm: 350 }]);
  const tvNow = s.shown().run.tv!;
  s.ops([{ op: 'set_tv', tv: { ...tvFromDiagonal(55, { centerMm: 2400, bottomMm: 1000 }), supply: tvNow.supply } }]);
  const panel = (s.shown().run.wallPanels ?? [])[0];
  if (!panel) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: панели реек у ТВ-зоны C нет');
  const no10b = s.refused([{ op: 'add_overhead', moduleId: tumba.id, heightMm: 700, widthMm: 900, depthMm: 350 }]);
  s.ops([{ op: 'set_wall_panel', panel: { ...panel, fromMm: 1450, widthMm: 1900 } }]);
  const no10c = s.refused([{ op: 'add_overhead', moduleId: tumba.id, heightMm: 700, baseHeightMm: 600 }]);
  const v10 = s.ops([{ op: 'add_overhead', moduleId: tumba.id, heightMm: 700, widthMm: 900, depthMm: 350 }]);
  const onTumba = () => s.shown().run.upperSegments.flatMap((seg) => seg.modules).find((m) => m.overhead && m.offsetMm === 550);
  const ov10 = onTumba();
  if (!ov10) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: корпус на тумбе не встал');
  const v10b = s.ops([{ op: 'set_vitrine', moduleId: ov10.id, vitrine: { construction: 'frame', led: 'contour' } }]);
  const v10c = s.ops([{ op: 'set_overhead', moduleId: ov10.id, heightMm: 800, widthMm: 700, depthMm: 300 }]);
  const ovNow = onTumba()!;
  const placeOv = runPlaces(v10c.run).find((p) => p.unit.id === ovNow.id)!;
  const no10d = s.refused([{ op: 'merge_overhead', moduleId: ovNow.id }]);
  check(
    'TL10 витрина на тумбе: ТВ в корпус и корпус на рейках — отказ словами; витрина (каркас, лента по контуру) 700 × 800 × 300 низом на крыше тумбы 550; высоту тумбы — «задаёт её секция»; объединять тумбу с витриной — отказ',
    /телевизор заходит/.test(no10a) &&
      /Рейки/.test(no10b) &&
      /задаёт её секция/.test(no10c) &&
      v10.run.fingerprint !== v10b.run.fingerprint &&
      vitrineOf(ovNow)?.construction === 'frame' &&
      vitrineOf(ovNow)?.led === 'contour' &&
      ovNow.widthMm === 700 &&
      ovNow.overhead?.depthMm === 300 &&
      moduleCarcassHeightMm(ovNow, v10c.run) === 800 &&
      Math.round(placeOv.y * 1000) === plinthMm(P) + moduleCarcassHeightMm(tumba, v10c.run) &&
      /в один не объединяют/.test(no10d),
    `${no10a} · ${no10b} · ${no10c} · низ ${Math.round(placeOv.y * 1000)} · ${ovNow.widthMm}×${moduleCarcassHeightMm(ovNow, v10c.run)}×${ovNow.overhead?.depthMm} · ${no10d}`,
  );

  /*
   * TL11 — витрина на столешнице (P4) идёт за рабочей поверхностью: тот же объект открыт другой школой цеха (цоколь
   * +50, столешница +12) — низ витрины = новая рабочая поверхность (`workTopMm`), в верхние шкафы и в нижние модули не
   * входит; ширина, высота, глубина, стекло, профиль и лента — правкой той же витрины.
   */
  const OPEN: Measurement = { ...DEMO_MEASUREMENT, id: 'tl11', walls: DEMO_MEASUREMENT.walls.map((w, i) => (i === 0 ? { ...w, openings: [] } : w)) };
  const kitchenAt = (production: typeof P, saved: Run | null) => {
    const base = workspaceInput({ title: 'TL11', zone: 'Кухня', measurement: OPEN, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null, wallId: 'w1' });
    const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production, milling: new Map(), carcass: new Map(), materials: new Map() });
    let edited: Partial<Record<VariantKey, Run>> = saved ? { optimal: saved } : {};
    const shown = () => composeVariants(input, DISABLED, edited).find((v) => v.key === 'optimal')!.run;
    const ops = (list: MillworkOp[]) => {
      const next = applyOps({ run: shown(), requirements: DEMO_REQUIREMENTS, ops: list, openings: input.openings });
      if (next.warnings.length > 0) throw new Error(`TL11: движок отказал: ${next.warnings.join(' | ')}`);
      edited = { optimal: next };
      return shown();
    };
    return { shown, ops };
  };
  const ka = kitchenAt(P, null);
  const runA = ka.shown();
  const overDoor = runA.upperSegments
    .flatMap((seg) => seg.modules)
    .find((u) => u.kind === 'upper' && !u.appliance && u.section !== 'mezzanine' && runA.modules.some((m) => m.kind === 'base' && !m.appliance && m.frontType === 'door' && m.offsetMm <= u.offsetMm && u.offsetMm + u.widthMm <= m.offsetMm + m.widthMm));
  if (!overDoor) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: верхнего над дверцей в демо без окна нет');
  ka.ops([{ op: 'set_vitrine', moduleId: overDoor.id, vitrine: { construction: 'frame', onCounter: true, led: 'contour', profile: 'black', glassMm: 6 }, heightMm: 900 }]);
  const runB = ka.shown();
  const bottomOf = (run: Run) => Math.round(runPlaces(run).find((p) => p.unit.id === overDoor.id)!.y * 1000);
  const P2 = { ...P, heights: { ...P.heights, plinthMm: P.heights.plinthMm + 50, countertopMm: P.heights.countertopMm + 12 } };
  const kb = kitchenAt(P2, JSON.parse(JSON.stringify(runB)) as Run);
  const runC = kb.shown();
  const placesC = runPlaces(runC);
  const vit = placesC.find((p) => p.unit.id === overDoor.id)!;
  const hits = placesC.filter(
    (p) =>
      p.unit.id !== overDoor.id &&
      p.unit.offsetMm < overDoor.offsetMm + overDoor.widthMm &&
      overDoor.offsetMm < p.unit.offsetMm + p.unit.widthMm &&
      p.y < vit.y + vit.heightM - 1e-6 &&
      vit.y < p.y + p.heightM - 1e-6,
  );
  const vitC = vitrineOf(allModulesOf(runC).find((m) => m.id === overDoor.id)!);
  check(
    'TL11 витрина на столешнице (каркас, профиль чёрный, стекло 6, лента по контуру, 900 мм): низ = рабочая поверхность при умолчаниях и при цоколе +50 / столешнице +12; ни во что не входит',
    bottomOf(runB) === workTopMm(P) && Math.round(vit.y * 1000) === workTopMm(P2) && workTopMm(P2) === workTopMm(P) + 62 && hits.length === 0 &&
      vitC?.onCounter === true && vitC.led === 'contour' && vitC.glassMm === 6,
    `низ ${bottomOf(runB)} = ${workTopMm(P)} → ${Math.round(vit.y * 1000)} = ${workTopMm(P2)} · пересечений ${hits.map((p) => p.unit.label).join(',') || 0}`,
  );

  return { passed, failed };
}

if (process.argv[1]?.endsWith('verify-tall.ts')) {
  const result = tallChecks();
  console.log(`\n${result.passed} passed, ${result.failed} failed`);
  process.exit(result.failed > 0 ? 1 : 0);
}
