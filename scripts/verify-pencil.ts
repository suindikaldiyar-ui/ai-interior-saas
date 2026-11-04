/**
 * ПРИЁМКА ПЕНАЛА — ДУХОВКА И МИКРОВОЛНОВКА (FINAL FURNITURE EDITOR, задача 1, PN1–PN10). В `npm run test:hardware`.
 *
 * Путь экрана: демо-кухня (`workspaceInput` → `objectInput` → `composeVariants`), пенал с духовкой стены А и те
 * операции, что шлёт блок «Пенал» в инспекторе Studio: `set_pencil_appliances`, `set_appliance_at`,
 * `set_column_order`, `set_appliance_model`, `set_fill`, `set_height`, `set_module_depth`, `set_width`.
 * Меряется один корпус на два прибора, ниши и опоры на системе 32, фасады над, между и под приборами, раскрой,
 * смета, сцена (коробки и модели приборов), отпечаток, запись и чтение.
 */

import { DEFAULT_PRODUCTION } from '../types/catalog';
import type { MillworkOp, Module, Run, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { buildPanels } from '../lib/millwork/panels';
import { runFingerprint } from '../lib/millwork/fingerprint';
import { runBoxesByModule } from '../lib/millwork/cabinetBoxes';
import { tallOvensOf } from '../lib/millwork/cookingStack';
import { moduleCarcassHeightMm, moduleDepthMm, pencilNiches } from '../lib/millwork/fill';
import { plinthMm } from '../lib/millwork/shop';
import { runInContext } from '../lib/millwork/runContext';

type Check = (name: string, ok: boolean, detail?: string) => void;
let passed = 0;
let failed = 0;
const own: Check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
};

const P = DEFAULT_PRODUCTION;
const t = P.carcassMm;
const PLINTH = plinthMm(P);

function kitchen() {
  const base = workspaceInput({ title: 'PN', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production: P, milling: new Map(), carcass: new Map(), materials: new Map() });
  const disabled = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
  let edited: Partial<Record<VariantKey, Run>> = {};
  const variant = () => composeVariants(input, disabled, edited).find((v) => v.key === 'optimal')!;
  const shown = () => variant().run;
  /* Как `runOps`: ряд пишется и тогда, когда движок назвал отказ, — вернувший ряд без правки. */
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown(), requirements: DEMO_REQUIREMENTS, ops: list, openings: input.openings });
    edited = { optimal: next };
    return next;
  };
  return { shown, ops, estimate: () => variant().estimate, restore: (run: Run) => (edited = { optimal: run }) };
}

/** Пенал стены А — по месту: идентификатор выводится из прибора. */
const pencilOf = (run: Run, offsetMm: number): Module => {
  const found = run.modules.find((m) => m.kind === 'tall' && m.offsetMm === offsetMm);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: пенала на ${offsetMm} мм нет`);
  return found;
};
const nichesOf = (run: Run, unit: Module) => pencilNiches(unit, moduleCarcassHeightMm(unit, run), P);
const partsOf = (run: Run, id: string) => buildPanels({ run, production: P }).filter((p) => p.moduleId === id);
const qtyOf = (run: Run, id: string, name: string) => partsOf(run, id).filter((p) => p.name === name).reduce((s, p) => s + p.qty, 0);
const frontsOf = (run: Run, id: string) =>
  partsOf(run, id)
    .filter((p) => p.name === 'Фасад')
    .map((p) => p.lengthMm)
    .sort((a, b) => a - b);
const boxesOf = (run: Run, id: string) => {
  const boxes = runBoxesByModule(run, { thicknessMm: t, frontThicknessMm: P.frontMm, gapMm: P.frontGapMm, production: P }).modules.find((e) => e.unit.id === id)?.boxes;
  if (!boxes || boxes.length === 0) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: коробок модуля ${id} нет`);
  return boxes;
};

export function pencilChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nПЕНАЛ — ДУХОВКА И МИКРОВОЛНОВКА: один корпус, ниши на системе 32, отметки, порядок, полки, раскрой, сцена');

  const k = kitchen();
  const run0 = k.shown();
  const start = run0.modules.find((m) => m.kind === 'tall' && m.appliance === 'oven' && !m.column);
  if (!start) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: пенала с духовкой в демо-кухне нет');
  const AT = start.offsetMm;
  const tallCount0 = run0.modules.filter((m) => m.kind === 'tall').length;
  const est0 = k.estimate();

  /* PN1 — поставить микроволновку в пенал с духовкой: один корпус, колонна, ниши на системе 32, опоры. */
  const w1 = k.ops([{ op: 'set_pencil_appliances', moduleId: start.id, oven: true, microwave: true }]).warnings;
  const run1 = k.shown();
  const p1 = pencilOf(run1, AT);
  const n1 = nichesOf(run1, p1);
  check(
    'PN1 микроволновка в пенал с духовкой: тот же корпус (пеналов столько же), колонна, ниши духовки 480…1088 и СВЧ 1088…1504 мм от дна, опоры 480 / 1088 / 1504',
    w1.length === 0 &&
      run1.modules.filter((m) => m.kind === 'tall').length === tallCount0 &&
      p1.column?.top === 'microwave' &&
      n1.map((n) => `${n.appliance}:${n.fromMm}-${n.toMm}`).join(';') === 'oven:480-1088;microwave:1088-1504' &&
      p1.fill?.shelves.join('/') === '480/1088/1504' &&
      n1.every((n) => (n.fromMm - 32) % 32 === 0),
    `${w1.join(' ')} · пеналов ${tallCount0} → ${run1.modules.filter((m) => m.kind === 'tall').length} · ${n1.map((n) => `${n.appliance}:${n.fromMm}-${n.toMm}@${n.markMm}`).join(';')} · опоры ${p1.fill?.shelves.join('/')}`,
  );

  /* PN2 — раскрой одного корпуса: боковин 2, полок-опор 3, фасады под, над (без промежутка); смета — строка СВЧ. */
  const est1 = k.estimate();
  const mwLine = est1.lines.find((l) => /microwave/.test(l.key));
  check(
    'PN2 раскрой — один корпус: боковин 2, полок 3, фасады 476 и 792 мм; в смете появилась строка микроволновки, итог вырос',
    qtyOf(run1, p1.id, 'Боковина') === 2 &&
      qtyOf(run1, p1.id, 'Полка') === 3 &&
      frontsOf(run1, p1.id).join('/') === '476/792' &&
      Boolean(mwLine) &&
      !est0.lines.some((l) => /microwave/.test(l.key)) &&
      est1.total > est0.total,
    `боковин ${qtyOf(run1, p1.id, 'Боковина')} · полок ${qtyOf(run1, p1.id, 'Полка')} · фасады ${frontsOf(run1, p1.id).join('/')} · ${mwLine ? `${mwLine.key} ×${mwLine.quantity}` : 'СТРОКИ НЕТ'} · ${Math.round(est0.total)} → ${Math.round(est1.total)}`,
  );

  /* PN3 — низ микроволновки 1500 от пола: опора на отверстии не выше отметки — 1484; появился фасад между приборами. */
  const w3 = k.ops([{ op: 'set_appliance_at', moduleId: p1.id, appliance: 'microwave', fromFloorMm: 1500 }]).warnings;
  const run3 = k.shown();
  const p3 = pencilOf(run3, AT);
  const n3 = nichesOf(run3, p3);
  const mw3 = n3.find((n) => n.appliance === 'microwave');
  check(
    'PN3 «низ микроволновки 1500 мм» — встала на 1484 мм (отверстие 1376 не выше отметки), габарит прибора тот же (ниша 416), опоры 480/1088/1376/1792, фасадов 3 (476 / 284 / 504), полок 4',
    w3.length === 0 &&
      mw3?.markMm === 1484 &&
      mw3.toMm - mw3.fromMm === 416 &&
      p3.applianceAt?.microwave === 1500 &&
      p3.fill?.shelves.join('/') === '480/1088/1376/1792' &&
      frontsOf(run3, p3.id).join('/') === '284/476/504' &&
      qtyOf(run3, p3.id, 'Полка') === 4 &&
      run3.fingerprint !== run1.fingerprint,
    `${w3.join(' ')} · ${mw3 ? `${mw3.fromMm}-${mw3.toMm}@${mw3.markMm}` : 'НИШИ НЕТ'} · опоры ${p3.fill?.shelves.join('/')} · фасады ${frontsOf(run3, p3.id).join('/')} · ${run1.fingerprint} → ${run3.fingerprint}`,
  );

  /* PN4 — сцена: лицо микроволновки целиком в своей нише между опорами, модель духовки на своей полке. */
  const boxes3 = boxesOf(run3, p3.id).filter((b) => b.node === 'appliance');
  const faceLow = boxes3.length ? Math.round(Math.min(...boxes3.map((b) => (b.position[1] - b.scale[1] / 2) * 1000))) : null;
  const faceHigh = boxes3.length ? Math.round(Math.max(...boxes3.map((b) => (b.position[1] + b.scale[1] / 2) * 1000))) : null;
  const shelfTop = mw3 ? PLINTH + mw3.fromMm + t / 2 : NaN;
  const shelfAbove = mw3 ? PLINTH + mw3.toMm - t / 2 : NaN;
  const oven3 = tallOvensOf(run3, P).find((o) => o.unit.id === p3.id);
  check(
    `PN4 сцена: лицо СВЧ между опорами (${shelfTop}…${shelfAbove} мм от пола), модель духовки низом на 588 мм — те же ниши, что раскрой`,
    faceLow !== null && faceHigh !== null && faceLow >= shelfTop && faceHigh <= shelfAbove && faceHigh - faceLow >= 380 && oven3?.bottomMm === 588,
    `лицо СВЧ ${faceLow}…${faceHigh} мм · духовка ${oven3?.bottomMm ?? 'НЕТ'}`,
  );

  /* PN5 — отказы словами с мм: промежуток меньше полки, прибор под крышу, полка в нише. */
  const r5a = k.ops([{ op: 'set_appliance_at', moduleId: p3.id, appliance: 'microwave', fromFloorMm: 1240 }]).warnings[0] ?? '';
  const r5b = k.ops([{ op: 'set_appliance_at', moduleId: p3.id, appliance: 'microwave', fromFloorMm: 2100 }]).warnings[0] ?? '';
  const p5 = pencilOf(k.shown(), AT);
  const r5c = k.ops([{ op: 'set_fill', moduleId: p5.id, fill: { ...p5.fill!, shelves: [...p5.fill!.shelves, 1600].sort((a, b) => a - b) } }]).warnings[0] ?? '';
  check(
    'PN5 отказы: СВЧ на 1240 — «между приборами 16 мм … не ниже 1292 мм»; на 2100 — «лишние 124 мм»; полка 1600 — «попала бы в нишу «Микроволновка» (1376…1792)»; ряд прежний',
    /Между приборами 16 мм/.test(r5a) && /не ниже 1292 мм/.test(r5a) && /лишние 124 мм/.test(r5b) && /нишу «Микроволновка» \(1376…1792 мм\)/.test(r5c) && k.shown().fingerprint === run3.fingerprint,
    `${r5a} | ${r5b} | ${r5c}`,
  );

  /* PN6 — своя полка в верхнем отсеке: встаёт, переживает смену порядка; отметки при смене порядка сняты. */
  const w6 = k.ops([{ op: 'set_fill', moduleId: p5.id, fill: { ...p5.fill!, shelves: [...p5.fill!.shelves, 2016].sort((a, b) => a - b) } }]).warnings;
  const run6 = k.shown();
  const w6b = k.ops([{ op: 'set_column_order', moduleId: pencilOf(run6, AT).id, top: 'oven' }]).warnings;
  const run6b = k.shown();
  const p6b = pencilOf(run6b, AT);
  const n6b = nichesOf(run6b, p6b);
  check(
    'PN6 своя полка 2016 в верхнем отсеке — полок 5; «сверху духовка»: СВЧ 480…896, духовка 896…1504, отметки сняты, полка 2016 осталась',
    w6.length === 0 &&
      qtyOf(run6, pencilOf(run6, AT).id, 'Полка') === 5 &&
      w6b.length === 0 &&
      n6b.map((n) => `${n.appliance}:${n.fromMm}-${n.toMm}`).join(';') === 'microwave:480-896;oven:896-1504' &&
      p6b.applianceAt === undefined &&
      p6b.fill?.shelves.includes(2016) === true,
    `${w6.join(' ')}${w6b.join(' ')} · ${n6b.map((n) => `${n.appliance}:${n.fromMm}-${n.toMm}`).join(';')} · ${JSON.stringify(p6b.applianceAt ?? null)} · ${p6b.fill?.shelves.join('/')}`,
  );

  /* PN7 — модель духовки, затем убрать СВЧ: духовка осталась со своей моделью и полкой; вернуть СВЧ — тот же корпус. */
  const w7a = k.ops([{ op: 'set_appliance_model', appliance: 'oven', model: 'HBG272EB3' }]).warnings;
  const w7b = k.ops([{ op: 'set_pencil_appliances', moduleId: pencilOf(k.shown(), AT).id, oven: true, microwave: false }]).warnings;
  const run7 = k.shown();
  const p7 = pencilOf(run7, AT);
  const estNoMw = k.estimate();
  check(
    'PN7 модель HBG272EB3, СВЧ убрана: духовка осталась (модель та же), колонны нет, ниша 832…1440, своя полка 2016 на месте, строки СВЧ в смете нет',
    w7a.length === 0 &&
      w7b.length === 0 &&
      p7.appliance === 'oven' &&
      !p7.column &&
      p7.applianceModels?.oven === 'HBG272EB3' &&
      nichesOf(run7, p7).map((n) => `${n.fromMm}-${n.toMm}`).join() === '832-1440' &&
      p7.fill?.shelves.includes(2016) === true &&
      !estNoMw.lines.some((l) => /microwave/.test(l.key)),
    `${w7a.join(' ')}${w7b.join(' ')} · ${p7.label} · ${JSON.stringify(p7.applianceModels ?? null)} · ${nichesOf(run7, p7).map((n) => `${n.fromMm}-${n.toMm}`).join()} · ${p7.fill?.shelves.join('/')}`,
  );

  /* PN8 — вторая СВЧ в ряд не ставится молча; пенал без приборов — полки, фасад во всю высоту. */
  const extra = run7.modules.find((m) => m.kind === 'tall' && m.appliance === 'fridge');
  const r8 = extra ? k.ops([{ op: 'set_pencil_appliances', moduleId: extra.id, oven: true, microwave: false }]).warnings[0] ?? '' : 'НУЛЕВОЙ СЕЛЕКТОР';
  const w8 = k.ops([{ op: 'set_pencil_appliances', moduleId: p7.id, oven: false, microwave: false }]).warnings;
  const run8 = k.shown();
  const p8 = pencilOf(run8, AT);
  check(
    'PN8 холодильник пеналом с духовкой не становится («не найден»); пенал без приборов — «Пенал», фасад один во весь корпус, модели духовки нет',
    /не найден/.test(r8) && w8.length === 0 && p8.label === 'Пенал' && !p8.appliance && frontsOf(run8, p8.id).length === 1 && p8.applianceModels === undefined,
    `${r8} | ${w8.join(' ')} · ${p8.label} · фасады ${frontsOf(run8, p8.id).join('/')}`,
  );

  /* PN9 — корпус: высота 2000 с приборами, глубина 600 (задняя на стене), уже 600 — отказ; глубина мельче прибора — отказ. */
  k.ops([{ op: 'set_pencil_appliances', moduleId: p8.id, oven: true, microwave: true }]);
  const p9 = pencilOf(k.shown(), AT);
  const w9a = k.ops([{ op: 'set_height', moduleId: p9.id, heightMm: 2000 }]).warnings;
  const w9b = k.ops([{ op: 'set_module_depth', moduleId: p9.id, depthMm: 600 }]).warnings;
  const r9c = k.ops([{ op: 'set_width', moduleId: p9.id, widthMm: 550 }]).warnings[0] ?? '';
  const k9 = k.shown();
  const p9b = pencilOf(k9, AT);
  check(
    'PN9 корпус 2000 × 600 глубиной: боковины 2000 × 600 в раскрое, корпус в сцене 600 мм вглубь от стены; пенал 550 — «не хватает 50 мм»',
    w9a.length === 0 &&
      w9b.length === 0 &&
      moduleCarcassHeightMm(p9b, k9) === 2000 &&
      moduleDepthMm(p9b, k9.zone, P) === 600 &&
      partsOf(k9, p9b.id).some((p) => p.name === 'Боковина' && p.lengthMm === 2000 && p.widthMm === 600) &&
      /не хватает 50 мм/.test(r9c),
    `${w9a.join(' ')}${w9b.join(' ')} · ${moduleCarcassHeightMm(p9b, k9)} × ${moduleDepthMm(p9b, k9.zone, P)} · ${partsOf(k9, p9b.id).filter((p) => p.name === 'Боковина').map((p) => `${p.lengthMm}x${p.widthMm}`).join()} · ${r9c}`,
  );

  /* PN10 — запись и чтение: отметка, глубина и высота переживают JSON; отпечаток тот же; без отметок — прежний. */
  k.ops([{ op: 'set_appliance_at', moduleId: p9b.id, appliance: 'microwave', fromFloorMm: 1500 }]);
  const before = k.shown();
  const saved = JSON.parse(JSON.stringify(before)) as Run;
  k.restore(saved);
  const reopened = k.shown();
  const pr = pencilOf(reopened, AT);
  k.ops([{ op: 'set_appliance_at', moduleId: pr.id, appliance: 'microwave', fromFloorMm: null }]);
  const cleared = k.shown();
  check(
    'PN10 записали и открыли — отметка 1500, высота 2000, глубина 600 и отпечаток те же; отметку сняли — СВЧ на 1196 мм, отпечаток другой',
    runFingerprint(reopened) === before.fingerprint &&
      pr.applianceAt?.microwave === 1500 &&
      pr.heightMm === 2000 &&
      pr.ownDepthMm === 600 &&
      nichesOf(cleared, pencilOf(cleared, AT)).find((n) => n.appliance === 'microwave')?.markMm === 1196 &&
      cleared.fingerprint !== before.fingerprint,
    `${before.fingerprint} / ${runFingerprint(reopened)} · ${JSON.stringify(pr.applianceAt)} · ${nichesOf(cleared, pencilOf(cleared, AT)).map((n) => `${n.appliance}@${n.markMm}`).join()}`,
  );

  /*
   * PN11 — открытие объекта: настройки цеха приходят из базы НОВЫМ объектом, и `runInContext` пересчитывает опоры
   * колонны. Своя полка человека 2016 обязана остаться — в сцене, раскрое и смете (TEST A поймал её потерю).
   */
  const withShelf = applyOps({
    run: before,
    requirements: DEMO_REQUIREMENTS,
    ops: [{ op: 'set_fill', moduleId: pencilOf(before, AT).id, fill: { ...pencilOf(before, AT).fill!, shelves: [...pencilOf(before, AT).fill!.shelves, 1888].sort((a, b) => a - b) } }],
    openings: [],
  });
  const fromDb = JSON.parse(JSON.stringify(withShelf)) as Run;
  const opened = runInContext(fromDb, { production: JSON.parse(JSON.stringify(fromDb.production ?? P)), ceilingHeightMm: fromDb.ceilingHeightMm }).run;
  const shelvesOpened = pencilOf(opened, AT).fill?.shelves ?? [];
  check(
    'PN11 открыли объект (цех из базы новым объектом): опоры колонны пересчитаны, своя полка 1888 (верхний отсек корпуса 2000) осталась — в наполнении и в раскрое',
    withShelf.warnings.length === 0 &&
      shelvesOpened.includes(1888) &&
      shelvesOpened.join('/') === (pencilOf(withShelf, AT).fill?.shelves ?? []).join('/') &&
      qtyOf(opened, pencilOf(opened, AT).id, 'Полка') === qtyOf(withShelf, pencilOf(withShelf, AT).id, 'Полка'),
    `${withShelf.warnings.join(' ')} · ${(pencilOf(withShelf, AT).fill?.shelves ?? []).join('/')} → ${shelvesOpened.join('/')}`,
  );

  /*
   * PN12 — ПЕНАЛ С ОДНОЙ ДУХОВКОЙ ПРИ ДРУГОМ ЦОКОЛЕ (P0). Своя отметка прибора — от пола: цоколь 150 вместо 100 —
   * ниша ниже, а опоры правленого ряда оставались на прежних отметках сквозь прибор. Теперь — опоры = ниша новой школы.
   */
  const single = kitchen();
  const singleRun = single.shown();
  const oven = singleRun.modules.find((m) => m.kind === 'tall' && m.appliance === 'oven' && !m.column)!;
  const edited = applyOps({ run: singleRun, requirements: DEMO_REQUIREMENTS, ops: [{ op: 'set_appliance_at', moduleId: oven.id, appliance: 'oven', fromFloorMm: 900 }], openings: [] });
  const school = { ...P, heights: { ...P.heights, plinthMm: 150 } };
  const reopened12 = runInContext(JSON.parse(JSON.stringify(edited)) as Run, { production: school, ceilingHeightMm: edited.ceilingHeightMm }).run;
  const u12 = reopened12.modules.find((m) => m.offsetMm === oven.offsetMm)!;
  const n12 = pencilNiches(u12, moduleCarcassHeightMm(u12, reopened12), school);
  const before12 = pencilNiches(edited.modules.find((m) => m.id === oven.id)!, moduleCarcassHeightMm(oven, edited), P);
  check(
    'PN12 пенал с одной духовкой, низ духовки 900 от пола, цоколь 150: ниша сдвинулась, опоры = ниша новой школы (полка не внутри ниши)',
    edited.warnings.length === 0 &&
      n12.length === 1 &&
      before12.length === 1 &&
      n12[0].fromMm !== before12[0].fromMm &&
      (u12.fill?.shelves ?? []).includes(n12[0].fromMm) &&
      (u12.fill?.shelves ?? []).every((s) => !(s > n12[0].fromMm && s < n12[0].toMm)),
    `${edited.warnings.join(' ')} · ниша ${before12.map((n) => `${n.fromMm}-${n.toMm}`).join()} → ${n12.map((n) => `${n.fromMm}-${n.toMm}`).join()} · полки ${(u12.fill?.shelves ?? []).join('/')} (были ${(edited.modules.find((m) => m.id === oven.id)?.fill?.shelves ?? []).join('/')})`,
  );

  return { passed, failed };
}

if (process.argv[1]?.endsWith('verify-pencil.ts')) {
  const result = pencilChecks();
  console.log(`\n${result.passed} passed, ${result.failed} failed`);
  process.exit(result.failed > 0 ? 1 : 0);
}
