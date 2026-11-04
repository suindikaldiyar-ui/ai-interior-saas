/**
 * ПРИЁМКА «ОТ ПЕНАЛА ДО СТЕНЫ» (FINAL FURNITURE EDITOR, задача 6, SP1–SP8). В `npm run test:hardware`.
 *
 * Путь экрана: своя сборка на стене 3800 без проёмов (`workspaceInput` → `composeVariants`), операции блоков
 * «Пенал» и «Участок до стены и деление»: пенал с духовкой и СВЧ у стены, заполнить участок модулями точных
 * ширин, продолжить столешницу до стены, верхний ряд до стены, разделить модуль, пенал 600 → 650. Меряется раскрой
 * (боковины без двойных), плиты столешницы, смета, отпечаток, запись и чтение.
 */

import { DEFAULT_PRODUCTION } from '../types/catalog';
import type { Measurement, MillworkOp, Run, RunRequirements, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { buildPanels } from '../lib/millwork/panels';
import { countertopSlabs } from '../lib/millwork/countertop';
import { runFingerprint } from '../lib/millwork/fingerprint';
import { libraryGaps } from '../lib/millwork/moduleLibrary';
import { counterSupportFindings } from '../lib/millwork/countertop';
import { screenState } from '../lib/millwork/screen';
import { cuttingPlan } from '../lib/millwork/cutting';
import { objectPanels } from '../lib/millwork/panels';
import { TYPICAL_CUTTING, type CuttingSettings } from '../types/catalog';
import { WALL_SHELF_NAME, wallShelfFindings } from '../lib/millwork/wallShelf';
import { runBoxesByModule } from '../lib/millwork/cabinetBoxes';
import { mirroredRun } from '../lib/millwork/mirror';

type Check = (name: string, ok: boolean, detail?: string) => void;
let passed = 0;
let failed = 0;
const own: Check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
};

const P = DEFAULT_PRODUCTION;
const FREE: RunRequirements = { ...DEMO_REQUIREMENTS, mode: 'free', appliances: [] };
const ROOM: Measurement = {
  ...DEMO_MEASUREMENT,
  id: 'span',
  walls: DEMO_MEASUREMENT.walls.map((wall) => ({ ...wall, lengthMm: wall.id === 'w1' ? 3800 : wall.lengthMm, openings: [] })),
};

function kitchen() {
  const input = workspaceInput({ title: 'SP', zone: 'Кухня', measurement: ROOM, requirements: FREE, rates: DEMO_RATES, wallId: 'w1', cornerAt: null, production: P } as never);
  const disabled = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
  let edited: Partial<Record<VariantKey, Run>> = {};
  const variant = () => composeVariants(input, disabled, edited).find((v) => v.key === 'optimal')!;
  const shown = () => variant().run;
  /* Как `runOps`: ряд пишется и при отказе — движок вернул его без правки. */
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown(), requirements: FREE, ops: list, openings: input.openings, roomDepthMm: 0 });
    edited = { optimal: next };
    return next;
  };
  return { shown, ops, estimate: () => variant().estimate, openings: input.openings, restore: (run: Run) => (edited = { optimal: run }) };
}

const sides = (run: Run) =>
  buildPanels({ run, production: P })
    .filter((p) => p.name === 'Боковина')
    .reduce((s, p) => s + p.qty, 0);
const slabText = (run: Run) => countertopSlabs(run).map((s) => `${s.fromMm}-${s.toMm}`).join(';');
const baseText = (run: Run) =>
  run.modules
    .filter((m) => m.kind === 'base')
    .map((m) => `${m.offsetMm}+${m.widthMm}`)
    .join(';');
const upperText = (run: Run) =>
  run.upperSegments
    .flatMap((s) => s.modules)
    .filter((m) => m.section !== 'mezzanine')
    .map((m) => `${m.offsetMm}+${m.widthMm}`)
    .join(';');
const counterQty = (lines: { key: string; quantity: number }[]) =>
  Math.round(lines.filter((l) => /^countertop_/.test(l.key) && !/miter|plinth|cutout|corner/.test(l.key)).reduce((s, l) => s + l.quantity, 0) * 1000);

export function spanChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nОТ ПЕНАЛА ДО СТЕНЫ: участок модулями точных ширин, столешница до стены, верхний ряд, деление, пенал шире');

  const k = kitchen();
  if (k.shown().modules.length !== 0) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: своя сборка начинается не с пустой стены');

  /* SP1 — пенал у левой стены, духовка и СВЧ в одном корпусе. */
  const w1 = [
    ...k.ops([{ op: 'add_module', kind: 'tall', widthMm: 600, atMm: 0 }]).warnings,
  ];
  const pencil0 = k.shown().modules.find((m) => m.kind === 'tall');
  if (!pencil0) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: пенал не встал');
  w1.push(...k.ops([{ op: 'set_pencil_appliances', moduleId: pencil0.id, oven: true, microwave: true }]).warnings);
  const run1 = k.shown();
  const pencil = run1.modules.find((m) => m.kind === 'tall')!;
  const gaps1 = libraryGaps(run1, k.openings, FREE).filter((g) => g.row === 'base');
  check(
    'SP1 пенал 600 у стены, духовка и СВЧ в одном корпусе; пустота внизу 600…3800 — та, что видит библиотека и схема',
    w1.length === 0 && run1.modules.length === 1 && Boolean(pencil.column) && gaps1.some((g) => g.fromMm === 600 && g.widthMm === 3200),
    `${w1.join(' ')} · ${run1.modules.map((m) => m.label).join(',')} · пустоты ${gaps1.map((g) => `${g.fromMm}+${g.widthMm}`).join(';')}`,
  );

  /* SP2 — участок 600…3000 модулями 630 + 770 + 600 + 400: ровно там, точных ширин (630 и 770 — не стандарт), по две боковины. */
  const sides1 = sides(run1);
  const w2 = k.ops([{ op: 'fill_span', row: 'base', fromMm: 600, toMm: 3000, widthsMm: [630, 770, 600, 400] }]).warnings;
  const run2 = k.shown();
  check(
    'SP2 «Заполнить участок» 630 + 770 + 600 + 400: модули 600/1230/2000/2600 точных ширин (не стандарт), боковин +8 — по две у корпуса, двойных нет',
    w2.length === 0 && baseText(run2) === '600+630;1230+770;2000+600;2600+400' && sides(run2) - sides1 === 8,
    `${w2.join(' ')} · ${baseText(run2)} · боковин ${sides1} → ${sides(run2)}`,
  );

  /* SP3 — отказы числом, ряд прежний. */
  const r3a = k.ops([{ op: 'fill_span', row: 'base', fromMm: 3000, toMm: 3800, widthsMm: [400, 300] }]).warnings[0] ?? '';
  const r3b = k.ops([{ op: 'fill_span', row: 'base', fromMm: 3000, toMm: 3800, widthsMm: [400, 500] }]).warnings[0] ?? '';
  const r3c = k.ops([{ op: 'fill_span', row: 'base', fromMm: 3000, toMm: 3800, widthsMm: [700, 100] }]).warnings[0] ?? '';
  const r3d = k.ops([{ op: 'fill_span', row: 'base', fromMm: 2800, toMm: 3800, widthsMm: [500, 500] }]).warnings[0] ?? '';
  check(
    'SP3 отказы: 400 + 300 — «не хватает 100 мм»; 400 + 500 — «лишние 100 мм»; секция 100 — «от 150 до 1200»; на занятое место — словами; ряд прежний',
    /не хватает 100 мм/.test(r3a) && /лишние 100 мм/.test(r3b) && /от 150 до 1200/.test(r3c) && r3d.length > 0 && baseText(k.shown()) === baseText(run2),
    `${r3a} | ${r3b} | ${r3c} | ${r3d}`,
  );

  /* SP4 — столешница: по модулям 600…3000; «продолжить у конца» — до стены 3800, одна плита, смета +0.8 м; у начала — пенал, некуда. */
  const est2 = k.estimate();
  const slab2 = slabText(run2);
  const r4a = k.ops([{ op: 'set_counter_extend', end: 'start', extend: true }]).warnings[0] ?? '';
  const w4 = k.ops([{ op: 'set_counter_extend', end: 'end', extend: true }]).warnings;
  const run4 = k.shown();
  const est4 = k.estimate();
  check(
    'SP4 плита 600…3000 → «продолжить у конца» 600…3800 одной плитой (сквозь пенал не идёт); смета столешницы +800 мм; у начала — «уже доходит»; отпечаток другой',
    slab2 === '600-3000' && w4.length === 0 && slabText(run4) === '600-3800' && counterQty(est4.lines) - counterQty(est2.lines) === 800 && /уже доходит/.test(r4a) && run4.fingerprint !== run2.fingerprint,
    `${slab2} → ${slabText(run4)} · ${counterQty(est2.lines)} → ${counterQty(est4.lines)} мм · ${r4a} · ${run2.fingerprint} → ${run4.fingerprint}`,
  );

  /* SP5 — верхний ряд от пенала до стены: 4 × 800 точно в участок. */
  const upGaps = libraryGaps(run4, k.openings, FREE).filter((g) => g.row === 'upper');
  const up = upGaps.find((g) => g.fromMm === 600);
  const w5 = up ? k.ops([{ op: 'fill_span', row: 'upper', fromMm: up.fromMm, toMm: up.fromMm + up.widthMm, widthsMm: [800, 800, 800, 800] }]).warnings : ['НУЛЕВОЙ СЕЛЕКТОР: пустоты верхнего ряда от пенала нет'];
  const run5 = k.shown();
  check(
    'SP5 «Продолжить верхний ряд до стены»: пустота наверху 600…3800, 4 × 800 — модули 600/1400/2200/3000',
    Boolean(up) && up!.widthMm === 3200 && w5.length === 0 && upperText(run5) === '600+800;1400+800;2200+800;3000+800',
    `пустоты ${upGaps.map((g) => `${g.fromMm}+${g.widthMm}`).join(';')} · ${w5.join(' ')} · ${upperText(run5)}`,
  );

  /* SP6 — разделить модуль 770 на 385 + 385: два корпуса на его месте, плита та же; 385 + 300 — отказ. */
  const m770 = run5.modules.find((m) => m.offsetMm === 1230)!;
  const r6 = k.ops([{ op: 'split_module', moduleId: m770.id, widthsMm: [385, 300] }]).warnings[0] ?? '';
  const w6 = k.ops([{ op: 'split_module', moduleId: m770.id, widthsMm: [385, 385] }]).warnings;
  const run6 = k.shown();
  check(
    'SP6 «Разделить» 770 → 385 + 385: корпуса 1230 и 1615, боковин +2, плита 600…3800 та же; 385 + 300 — «не хватает 85 мм»',
    /не хватает 85 мм/.test(r6) && w6.length === 0 && baseText(run6) === '600+630;1230+385;1615+385;2000+600;2600+400' && sides(run6) - sides(run5) === 2 && slabText(run6) === '600-3800',
    `${r6} | ${w6.join(' ')} · ${baseText(run6)} · боковин ${sides(run5)} → ${sides(run6)} · ${slabText(run6)}`,
  );

  /* SP7 — пенал 600 → 650: справа модуль — отказ числом; столешница и верхний ряд не тронуты. */
  const r7 = k.ops([{ op: 'set_width', moduleId: run6.modules.find((m) => m.kind === 'tall')!.id, widthMm: 650 }]).warnings[0] ?? '';
  const run7 = k.shown();
  check(
    'SP7 пенал 600 → 650 при модуле вплотную — отказ с миллиметрами; плита, нижний и верхний ряды те же (ничего не пропало молча)',
    /не хватает 50 мм/.test(r7) && slabText(run7) === '600-3800' && baseText(run7) === baseText(run6) && upperText(run7) === upperText(run6),
    `${r7} · ${slabText(run7)}`,
  );

  /* SP8 — запись и чтение; «вернуть» плиту — снова по модулям. */
  const saved = JSON.parse(JSON.stringify(run7)) as Run;
  k.restore(saved);
  const reopened = k.shown();
  const w8 = k.ops([{ op: 'set_counter_extend', end: 'end', extend: false }]).warnings;
  const back = k.shown();
  check(
    'SP8 записали и открыли — отпечаток, плита и ряды те же; «вернуть» — плита снова 600…3000',
    runFingerprint(reopened) === run7.fingerprint && slabText(reopened) === '600-3800' && w8.length === 0 && slabText(back) === '600-3000',
    `${run7.fingerprint} / ${runFingerprint(reopened)} · ${slabText(back)}`,
  );

  /*
   * SP9 — ПЛИТА НАД ПУСТОТОЙ БЕЗ ОПОРЫ ЗАПИРАЕТ ВЫПУСК (P0). Продолжили плиту над пустыми 800 мм у стены: слова
   * «конструкция не подтверждена», замок экрана (`screenState`) и тот же замок в карте раскроя (`cuttingPlan.release`)
   * — выгрузка для цеха закрыта. Участок заполнили модулями — плита на модулях, замка нет.
   */
  const SHEETS: CuttingSettings['sheets'] = [
    { stock: 'ldsp:16', lengthMm: 2800, widthMm: 2070 },
    { stock: 'hdf:3', lengthMm: 2800, widthMm: 2070 },
  ];
  const settings: CuttingSettings = { ...TYPICAL_CUTTING, sheets: SHEETS, confirmed: true };
  const lockOf = (run: Run) => {
    const construction = counterSupportFindings(run, 'Стена А');
    const screen = screenState({ refusal: null, mismatches: [], walls: [], segments: [run], shape: 'linear', warnings: [], construction } as never);
    const parts = objectPanels({ walls: [{ wallId: 'w1', label: 'Стена А', run }], production: P });
    const plan = cuttingPlan({ parts, settings, exportLock: screen.exportLockText, fingerprint: run.fingerprint });
    return { construction, screen, plan };
  };
  const k9 = kitchen();
  k9.ops([{ op: 'add_module', kind: 'tall', widthMm: 600, atMm: 0 }]);
  k9.ops([{ op: 'fill_span', row: 'base', fromMm: 600, toMm: 3000, widthsMm: [600, 800, 600, 400] }]);
  const plain9 = lockOf(k9.shown());
  k9.ops([{ op: 'set_counter_extend', end: 'end', extend: true }]);
  const open9 = lockOf(k9.shown());
  k9.ops([{ op: 'fill_span', row: 'base', fromMm: 3000, toMm: 3800, widthsMm: [400, 400] }]);
  const full9 = lockOf(k9.shown());
  check(
    'SP9 плита над пустыми 800 мм: «конструкция не подтверждена», выпуск экрана заперт, карта раскроя — «release.ok = false» с той же причиной; участок заполнен — замка нет',
    plain9.construction.length === 0 &&
      plain9.plan.release.ok &&
      open9.construction.length === 1 &&
      /3000…3800 мм \(800 мм\)/.test(open9.construction[0].words) &&
      /не подтверждена/.test(open9.construction[0].words) &&
      open9.screen.exportLocked &&
      !open9.plan.release.ok &&
      open9.plan.release.reasons.some((r) => r.includes('столешница продолжена над пустотой')) &&
      full9.construction.length === 0 &&
      !full9.screen.exportLocked,
    `${plain9.plan.release.ok} · ${open9.construction[0]?.words ?? 'СЛОВ НЕТ'} · release ${open9.plan.release.ok} · заполнено: ${full9.construction.length} / ${full9.screen.exportLocked}`,
  );

  /*
   * SP10 — полка от пенала до стены (P2): доска на ряду, не модуль. Раскрой, сцена, отпечаток, замок выпуска, отказы,
   * правка, после которой модуль вошёл бы в полку, зеркало, запись и открытие, снятие.
   */
  const k10 = kitchen();
  k10.ops([{ op: 'add_module', kind: 'tall', widthMm: 600, atMm: 0 }]);
  k10.ops([{ op: 'fill_span', row: 'base', fromMm: 600, toMm: 3800, widthsMm: [800, 800, 800, 800] }]);
  const before10 = k10.shown();
  const est10a = k10.estimate();
  const shelf10 = { id: 'shelf-1', fromMm: 600, toMm: 3800, bottomMm: 1600, depthMm: 300, thicknessMm: 22 };
  const w10 = k10.ops([{ op: 'set_wall_shelf', shelf: shelf10 }]).warnings;
  const run10 = k10.shown();
  const est10b = k10.estimate();
  const part10 = buildPanels({ run: run10, production: P }).filter((p) => p.name === WALL_SHELF_NAME);
  const box10 = runBoxesByModule(run10, { thicknessMm: P.carcassMm, frontThicknessMm: P.frontMm, gapMm: P.frontGapMm }).fillers.filter((b) => b.panel === WALL_SHELF_NAME);
  const grew = est10b.lines.filter((line) => {
    const was = est10a.lines.find((l) => l.key === line.key)?.quantity ?? 0;
    return Math.abs(line.quantity - was - 0.96) < 0.011;
  });
  const lock10 = wallShelfFindings(run10, 'Стена А');
  const screen10 = screenState({ refusal: null, mismatches: [], walls: [], segments: [run10], shape: 'linear', warnings: [], construction: lock10 } as never);
  const plan10 = cuttingPlan({
    parts: objectPanels({ walls: [{ wallId: 'w1', label: 'Стена А', run: run10 }], production: P }),
    settings: { ...TYPICAL_CUTTING, sheets: [{ stock: 'ldsp:16', lengthMm: 2800, widthMm: 2070 }, { stock: 'ldsp:22', lengthMm: 2800, widthMm: 2070 }, { stock: 'hdf:3', lengthMm: 2800, widthMm: 2070 }], confirmed: true },
    exportLock: screen10.exportLockText,
    fingerprint: run10.fingerprint,
  });
  check(
    'SP10a полка 600…3800 на 1600, 300 × 22: деталь «Полка настенная» 3200 × 300 × 22 (кромка по передней), коробка сцены 3.2 × 0.022 × 0.3 на 1.611 м, ЛДСП +0.96 м², отпечаток другой; выпуск заперт словами «крепление … не задавал»',
    w10.length === 0 &&
      part10.length === 1 &&
      part10[0].lengthMm === 3200 &&
      part10[0].widthMm === 300 &&
      part10[0].thicknessMm === 22 &&
      part10[0].edges.long === 1 &&
      box10.length === 1 &&
      Math.abs(box10[0].scale[0] - 3.2) < 1e-9 &&
      Math.abs(box10[0].position[1] - 1.611) < 1e-9 &&
      grew.length > 0 &&
      run10.fingerprint !== before10.fingerprint &&
      lock10.length === 1 &&
      /крепление к стене и к боковине и допустимую нагрузку цех не задавал/.test(lock10[0].words) &&
      screen10.exportLocked &&
      !plan10.release.ok,
    `${w10.join(' ')} · ${part10.map((p) => `${p.lengthMm}x${p.widthMm}x${p.thicknessMm}`)} · сцена ${box10.map((b) => b.scale.map((v) => v.toFixed(3)).join('x'))} · рост ${grew.map((l) => l.key)} · ${before10.fingerprint} → ${run10.fingerprint}`,
  );

  const r10a = k10.ops([{ op: 'set_wall_shelf', shelf: { ...shelf10, bottomMm: 400 } }]).warnings[0] ?? '';
  const r10b = k10.ops([{ op: 'set_wall_shelf', shelf: { ...shelf10, thicknessMm: 10 } }]).warnings[0] ?? '';
  const r10c = k10.ops([{ op: 'set_wall_shelf', shelf: { ...shelf10, toMm: 3900 } }]).warnings[0] ?? '';
  const r10d = k10.ops([{ op: 'fill_span', row: 'upper', fromMm: 600, toMm: 1400, widthsMm: [800] }]).warnings[0] ?? '';
  check(
    'SP10b отказы: низ 400 — «заходит в» нижний модуль; толщина 10 — «от 16 до 40 мм»; до 3900 — «выходит за стену»; верхний модуль поверх полки — «Правка не применена»; полка прежняя',
    /заходит в «/.test(r10a) && /от 16 до 40 мм/.test(r10b) && /выходит за стену/.test(r10c) && /Правка не применена: полка/.test(r10d) &&
      JSON.stringify(k10.shown().wallShelves) === JSON.stringify([shelf10]),
    `${r10a} | ${r10b} | ${r10c} | ${r10d}`,
  );

  const mirrored10 = mirroredRun(run10);
  const reopened10 = JSON.parse(JSON.stringify(run10)) as Run;
  k10.restore(reopened10);
  const fpReopen = k10.shown().fingerprint;
  k10.ops([{ op: 'set_wall_shelf', shelf: { ...shelf10, bottomMm: 1700, depthMm: 250 } }]);
  const edited10 = k10.shown().wallShelves?.[0];
  k10.ops([{ op: 'remove_wall_shelf', id: 'shelf-1' }]);
  check(
    'SP10c зеркало — полка 0…3200; записал → открыл — тот же отпечаток; правка низа и глубины — 1700 / 250; «Убрать» — полки нет, отпечаток прежний',
    mirrored10.wallShelves?.[0].fromMm === 0 && mirrored10.wallShelves?.[0].toMm === 3200 && fpReopen === run10.fingerprint &&
      edited10?.bottomMm === 1700 && edited10?.depthMm === 250 && k10.shown().wallShelves === undefined && k10.shown().fingerprint === before10.fingerprint,
    `${mirrored10.wallShelves?.[0].fromMm}…${mirrored10.wallShelves?.[0].toMm} · ${fpReopen} · ${edited10?.bottomMm}/${edited10?.depthMm} · ${k10.shown().fingerprint}`,
  );

  return { passed, failed };
}

if (process.argv[1]?.endsWith('verify-span.ts')) {
  const result = spanChecks();
  console.log(`\n${result.passed} passed, ${result.failed} failed`);
  process.exit(result.failed > 0 ? 1 : 0);
}
