/**
 * Приёмка конфигуратора корпусной мебели.
 *
 * Запуск: npm run test:millwork
 *
 * Здесь проверяется то, на чём держится доверие к инструменту: одна раскладка
 * обязана давать одну смету при любом числе пересчётов, а сумма модулей —
 * сходиться с длиной ряда до миллиметра. Если цена «плавает», компания
 * подпишет договор по неверной сумме и потеряет деньги на своём производстве.
 */

import { buildRun, fillGap, runWidthSum } from '../lib/millwork/layout';
import { applyOps } from '../lib/millwork/ops';
import { buildEstimate, recalcTotal } from '../lib/millwork/estimate';
import {
  DEFAULT_STRATEGIES,
  MAIN_VARIANT,
  MAX_ARRANGEMENTS,
  buildArrangements,
  buildVariants,
  mostDifferent,
} from '../lib/millwork/variants';
import { RUN_TEMPLATES, requirementsFromTemplate, templateFits } from '../lib/millwork/templates';
import { ZONE_ORDER, ZONE_PROFILES } from '../lib/millwork/zones';
import {
  templateAppliancesWidthMm,
  templatesForZone,
  zoneReadiness,
} from '../lib/millwork/templates';
import {
  manualPlacementWarnings,
  sinkWaterConflicts,
  vanityWaterConflicts,
} from '../lib/millwork/warnings';
import {
  SYSTEM32_BASE_MM,
  SYSTEM32_STEP_MM,
  addShelf,
  columnNiches,
  moduleCarcassHeightMm,
  moveDrawerBoundary,
  moveShelf,
  removeShelf,
  snapTo32,
} from '../lib/millwork/fill';
import { buildPanels, panelTotals } from '../lib/millwork/panels';
import { panelsCsvFile, panelsToCsv } from '../lib/millwork/csv-export';
import { runFingerprint } from '../lib/millwork/fingerprint';
import { DEFAULT_PRODUCTION } from '../types/catalog';
import type { ZoneKind } from '../types/millwork';
import { commIssues, layoutIssues, validateRun } from '../lib/millwork/validate';
import {
  RunOverflowError,
  appliancesPlacedOnce,
  assertRunFits,
  manualAnchorCost,
  widthOverflowMm,
} from '../lib/millwork/invariants';
import {
  CORNER_SIZE_MM,
  GEOMETRY,
  MIN_WIDTH,
  STANDARD_WIDTHS,
} from '../lib/millwork/modules';
import {
  DEMO_COMMS,
  DEMO_OPENINGS,
  DEMO_PROJECT,
  DEMO_RATES,
  DEMO_REQUIREMENTS,
} from '../lib/millwork/demo';
import type { CommPoint, Opening, RunRequirements } from '../types/millwork';

let failed = 0;
let passed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}${detail ? `  ${detail}` : ''}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? `  ${detail}` : ''}`);
  }
}

const REQ: RunRequirements = {
  ...DEMO_REQUIREMENTS,
  appliances: [...DEMO_REQUIREMENTS.appliances],
};

const OPENINGS: Opening[] = DEMO_OPENINGS;
const COMMS: CommPoint[] = DEMO_COMMS;

const baseInput = {
  lengthMm: 3200,
  ceilingHeightMm: 2700,
  requirements: REQ,
  openings: OPENINGS,
  comms: COMMS,
};

/* ─────────────────────────  Детерминизм  ───────────────────────── */

console.log('\nДетерминированность раскладки');
{
  const runs = Array.from({ length: 100 }, () => buildRun(baseInput));
  const first = JSON.stringify(runs[0]);
  check(
    'сто прогонов дают побайтово одинаковый ряд',
    runs.every((r) => JSON.stringify(r) === first),
    `модулей: ${runs[0].modules.length}`,
  );

  // Порядок техники в требованиях не должен влиять на результат.
  const shuffled = buildRun({
    ...baseInput,
    requirements: {
      ...REQ,
      appliances: [...REQ.appliances].reverse(),
    },
  });
  check(
    'порядок техники в требованиях не меняет раскладку',
    JSON.stringify(shuffled.modules) === JSON.stringify(runs[0].modules),
  );

  const estimates = Array.from({ length: 20 }, () =>
    buildEstimate(runs[0], 'basic', DEMO_RATES),
  );
  check(
    'двадцать пересчётов дают одну смету',
    estimates.every((e) => e.total === estimates[0].total),
    `${estimates[0].total} ₸`,
  );
}

/* ─────────────────────────  Сумма сходится  ───────────────────────── */

console.log('\nСумма модулей');
{
  for (const lengthMm of [1800, 2400, 3000, 3200, 3650, 4210, 5000]) {
    const run = buildRun({ ...baseInput, lengthMm });
    check(
      `ряд ${lengthMm} мм: сумма ширин равна длине`,
      runWidthSum(run) === lengthMm && run.residualMm === 0,
      `сумма ${runWidthSum(run)}, остаток ${run.residualMm}`,
    );
  }

  const gap = fillGap(1234);
  check(
    'заполнение промежутка не теряет миллиметры',
    gap.reduce((s, w) => s + w, 0) === 1234,
    gap.join(' + '),
  );

  const tiny = fillGap(90);
  check('промежуток меньше минимума становится добором', tiny.length === 1 && tiny[0] === 90);

  const exact = fillGap(600);
  check('ровный промежуток берётся одним стандартом', exact.length === 1 && exact[0] === 600);
}

/* ─────────────────────────  Жёсткий инвариант  ───────────────────────── */

console.log('\nИнвариант «ряд помещается в стену»');
{
  const run = buildRun(baseInput);

  // Отрицательного остатка пользователь не должен увидеть никогда: сборка
  // такого ряда обязана падать, а не показывать сообщение в интерфейсе.
  let threw = false;
  try {
    assertRunFits({ ...run, lengthMm: 2000 });
  } catch (err) {
    threw = err instanceof RunOverflowError;
  }
  check('ряд длиннее стены бросает RunOverflowError', threw);

  let overlapThrew = false;
  try {
    assertRunFits({
      ...run,
      modules: [
        { ...run.modules[0], offsetMm: 0, widthMm: 900 },
        { ...run.modules[1], offsetMm: 400 },
      ],
    });
  } catch {
    overlapThrew = true;
  }
  check('наложение модулей бросает исключение', overlapThrew);

  let overflow = 0;
  for (let lengthMm = 300; lengthMm <= 6000; lengthMm += 50) {
    try {
      const r = buildRun({ ...baseInput, lengthMm });
      if (runWidthSum(r) > lengthMm) overflow++;
    } catch {
      overflow++;
    }
  }
  check('115 длин подряд собираются без превышения', overflow === 0, `сбоев: ${overflow}`);

  let cornerOverflow = 0;
  for (let lengthMm = 1200; lengthMm <= 6000; lengthMm += 50) {
    try {
      const r = buildRun({ ...baseInput, lengthMm, cornerAt: 'end' });
      if (runWidthSum(r) > lengthMm) cornerOverflow++;
    } catch {
      cornerOverflow++;
    }
  }
  check('с угловым модулем инвариант тоже держится', cornerOverflow === 0, `сбоев: ${cornerOverflow}`);

  const wide = applyOps({
    run,
    requirements: REQ,
    ops: Array.from({ length: 8 }, () => ({
      op: 'add_module' as const,
      kind: 'base' as const,
      widthMm: 1200,
    })),
    openings: OPENINGS,
  });
  check(
    'массовое добавление модулей не выводит ряд за стену',
    runWidthSum(wide) === wide.lengthMm,
    `сумма ${runWidthSum(wide)} при длине ${wide.lengthMm}`,
  );
}

/* ─────────────────────────  Приборы не дублируются  ───────────────────────── */

console.log('\nКаждый прибор ровно один раз');
{
  const run = buildRun(baseInput);
  const counts = appliancesPlacedOnce(run);
  const missing = REQ.appliances.filter((a) => counts.get(a) !== 1);
  check(
    'все приборы из требований попали в ряд по одному разу',
    missing.length === 0,
    missing.length ? `не по одному: ${missing.join(', ')}` : REQ.appliances.join(', '),
  );

  // Дубликаты в требованиях — опечатка ввода, а не заказ двух плит.
  const dupes = buildRun({
    ...baseInput,
    requirements: {
      ...REQ,
      appliances: [...REQ.appliances, 'hob', 'sink600', 'fridge'],
    },
  });
  const dupeCounts = appliancesPlacedOnce(dupes);
  check(
    'дубликаты в требованиях схлопываются',
    dupeCounts.get('hob') === 1 &&
      dupeCounts.get('sink600') === 1 &&
      dupeCounts.get('fridge') === 1,
    `плит ${dupeCounts.get('hob')}, моек ${dupeCounts.get('sink600')}, холодильников ${dupeCounts.get('fridge')}`,
  );
  check('ряд с дубликатами всё равно сходится', runWidthSum(dupes) === dupes.lengthMm);

  const estimate = buildEstimate(dupes, 'basic', DEMO_RATES);
  const keys = estimate.lines.map((l) => l.key);
  check(
    'в смете нет двух строк с одним ключом',
    new Set(keys).size === keys.length,
    `строк ${keys.length}, уникальных ${new Set(keys).size}`,
  );
  const hobLines = estimate.lines.filter((l) => l.key === 'appliance_hob');
  check(
    'варочная панель посчитана один раз',
    hobLines.length === 1 && hobLines[0].quantity === 1,
    `строк ${hobLines.length}, количество ${hobLines[0]?.quantity}`,
  );
}

/* ─────────────────────────  Демонстрация  ───────────────────────── */

console.log('\nДемо-проект');
{
  const demo = buildRun({
    lengthMm: DEMO_PROJECT.lengthMm,
    ceilingHeightMm: DEMO_PROJECT.ceilingHeightMm,
    requirements: DEMO_REQUIREMENTS,
    openings: DEMO_OPENINGS,
    comms: DEMO_COMMS,
    cornerAt: DEMO_PROJECT.cornerAt,
  });

  const issues = validateRun(demo, DEMO_COMMS);
  check(
    'демо открывается без единого предупреждения',
    issues.length === 0,
    issues.map((i) => `${i.level}: ${i.message}`).join(' | ') || 'чисто',
  );
  check('сумма демо сходится с длиной ряда', runWidthSum(demo) === demo.lengthMm);

  const sink = demo.modules.find((m) => m.appliance === 'sink600');
  const win = DEMO_OPENINGS[0];
  const sinkCenter = sink ? sink.offsetMm + sink.widthMm / 2 : -1;
  check(
    'мойка стоит под окном',
    sinkCenter > win.fromCornerMm && sinkCenter < win.fromCornerMm + win.widthMm,
    `центр мойки ${sinkCenter}, окно ${win.fromCornerMm}…${win.fromCornerMm + win.widthMm}`,
  );

  const hob = demo.modules.find((m) => m.appliance === 'hob');
  const hood = demo.upperSegments.flatMap((s) => s.modules).find((m) => m.appliance === 'hood');
  check(
    'вытяжка встала над варочной панелью',
    Boolean(hob && hood && hob.offsetMm === hood.offsetMm),
  );

  check(
    'модулей уже стандарта в ряду нет',
    demo.modules.every((m) => m.widthMm >= 150),
    demo.modules.map((m) => m.widthMm).join(' '),
  );
}

/* ─────────────────────────  Категории проблем  ───────────────────────── */

console.log('\nКатегории проблем');
{
  const run = buildRun(baseInput);
  const movedVent = DEMO_COMMS.map((c) =>
    c.kind === 'ventilation' ? { ...c, fromCornerMm: 100 } : c,
  );
  const issues = validateRun(run, movedVent);

  check(
    'расхождение с вентканалом — это comm, а не поломка раскладки',
    commIssues(issues).some((i) => i.message.includes('вентканал')) &&
      layoutIssues(issues).length === 0,
  );
  check(
    'у каждой проблемы есть категория',
    issues.every((i) => ['layout', 'comm', 'fit'].includes(i.kind)),
  );
  check(
    'в исправном ряду поломок раскладки нет',
    layoutIssues(validateRun(run, DEMO_COMMS)).length === 0,
  );
}

/* ─────────────────────────  Подписи модулей  ───────────────────────── */

console.log('\nПодписи по содержанию');
{
  const run = buildRun({ ...baseInput, lengthMm: 4200 });
  const wide = run.modules.find((m) => !m.appliance && m.widthMm > 600);
  check(
    'широкий модуль подписан как двухдверный, а не «дверца 900»',
    Boolean(wide && wide.label.includes('дверцы')),
    wide ? `${wide.widthMm} мм → «${wide.label}»` : 'широкого модуля не нашлось',
  );
}

/* ─────────────────────────  Угол  ───────────────────────── */

console.log('\nГ-образная раскладка');
{
  const run = buildRun({ ...baseInput, cornerAt: 'end' });

  const overlaps = run.modules.some((m, i) => {
    const next = run.modules[i + 1];
    return next ? m.offsetMm + m.widthMm > next.offsetMm : false;
  });
  check('модули не накладываются друг на друга', !overlaps);

  const last = run.modules[run.modules.length - 1];
  check(
    'в углу стоит угловой модуль 900 × 900',
    last.kind === 'corner_base' && last.widthMm === CORNER_SIZE_MM,
    `${last.kind} ${last.widthMm}`,
  );
  check(
    'ряд не вышел за стену',
    last.offsetMm + last.widthMm === run.lengthMm,
    `край ${last.offsetMm + last.widthMm} при длине ${run.lengthMm}`,
  );

  const atStart = buildRun({ ...baseInput, cornerAt: 'start' });
  check(
    'угол в начале ряда тоже сходится',
    runWidthSum(atStart) === atStart.lengthMm && atStart.modules[0].kind === 'corner_base',
  );
}

/* ─────────────────────────  Верхний ряд и окно  ───────────────────────── */

console.log('\nВерхний ряд');
{
  const run = buildRun(baseInput);
  const window = OPENINGS[0];
  const windowFrom = window.fromCornerMm;
  const windowTo = window.fromCornerMm + window.widthMm;

  check('верхний ряд разорван на два участка', run.upperSegments.length === 2,
    run.upperSegments.map((s) => `${s.fromMm}..${s.toMm}`).join(' | '));

  const crosses = run.upperSegments.some(
    (s) => s.fromMm < windowTo && s.toMm > windowFrom,
  );
  check('ни один участок не заходит на окно', !crosses, `окно ${windowFrom}..${windowTo}`);

  // Окно выше верхнего ряда ряд не разрывает.
  const highWindow: Opening = {
    id: 'w-high',
    kind: 'window',
    fromCornerMm: 1400,
    widthMm: 1200,
    sillMm: 2300,
    heightMm: 300,
  };
  const solid = buildRun({ ...baseInput, openings: [highWindow] });
  check(
    'окно выше шкафов ряд не разрывает',
    solid.upperSegments.length === 1,
    `участков: ${solid.upperSegments.length}`,
  );

  const noUpper = buildRun({
    ...baseInput,
    requirements: { ...REQ, options: { ...REQ.options, hasUpper: false } },
  });
  check('без верхнего ряда участков нет', noUpper.upperSegments.length === 0);
}

/* ─────────────────────────  Коммуникации  ───────────────────────── */

console.log('\nПроверка по коммуникациям');
{
  const good = buildRun(baseInput);
  const goodIssues = validateRun(good, COMMS);
  const sinkModule = good.modules.find((m) => m.appliance === 'sink600');
  const waterPoint = COMMS.find((c) => c.kind === 'water_supply');
  const distance = Math.abs(
    (sinkModule!.offsetMm + sinkModule!.widthMm / 2) - waterPoint!.fromCornerMm,
  );
  check(
    'мойка села на вывод воды',
    distance <= 600,
    `расхождение ${Math.round(distance)} мм`,
  );
  check(
    'при совпадении мойки с водой ошибки по воде нет',
    !goodIssues.some((i) => i.level === 'error' && i.message.includes('вывод воды')),
  );

  // Вывод воды оказался не там, где ждали на раскладке: мойка обязана
  // дать красный флажок, а не молча остаться на месте.
  const movedWater: CommPoint[] = COMMS.map((c) =>
    c.kind === 'water_supply' ? { ...c, fromCornerMm: 3100 } : c,
  );
  const farIssues = validateRun(good, movedWater);
  check(
    'мойка дальше 600 мм от воды даёт ошибку с флажком',
    farIssues.some((i) => i.level === 'error' && i.message.includes('вывод воды')),
    farIssues.find((i) => i.level === 'error')?.message ?? '',
  );
}

/* ─────────────────────────  Текстовое редактирование  ───────────────────────── */

console.log('\nОперации над составом');
{
  const run = buildRun(baseInput);
  const tall = run.modules.find((m) => m.kind === 'tall' && m.appliance === 'oven');
  check('в исходном ряду есть духовая колонна', Boolean(tall));

  const after = applyOps({
    run,
    requirements: REQ,
    ops: [{ op: 'remove_module', moduleId: tall!.id }],
    openings: OPENINGS,
  });

  check(
    '«убери пенал» удалил колонну',
    !after.modules.some((m) => m.appliance === 'oven'),
  );
  check(
    'место после удаления перезаполнено',
    runWidthSum(after) === after.lengthMm && after.residualMm === 0,
    `сумма ${runWidthSum(after)}`,
  );
  check(
    'мойка и варочная на месте',
    after.modules.some((m) => m.appliance === 'sink600') &&
      after.modules.some((m) => m.appliance === 'hob'),
  );

  // Ширина техники не меняется даже по прямой команде.
  const sink = after.modules.find((m) => m.appliance === 'sink600')!;
  const resized = applyOps({
    run: after,
    requirements: REQ,
    ops: [{ op: 'set_width', moduleId: sink.id, widthMm: 400 }],
    openings: OPENINGS,
  });
  check(
    'ширину техники изменить нельзя',
    resized.modules.find((m) => m.appliance === 'sink600')?.widthMm === 600,
  );

  /*
   * Ширина вводится числом: мебель заказная, и сама раскладка выдаёт
   * модули вроде 630 мм. Нестандарт принимается, но ряд шире стены
   * не становится ни при каком вводе.
   */
  const plain = after.modules.find((m) => !m.appliance && m.kind === 'base')!;
  const custom = applyOps({
    run: after,
    requirements: REQ,
    ops: [{ op: 'set_width', moduleId: plain.id, widthMm: 437 }],
    openings: OPENINGS,
  });
  check(
    'нестандартная ширина принимается как есть',
    custom.modules.some((m) => m.widthMm === 437),
    `ширины: ${custom.modules.map((m) => m.widthMm).join(' ')}`,
  );
  check(
    'после ручной ширины сумма по-прежнему сходится с рядом',
    runWidthSum(custom) === custom.lengthMm,
    `сумма ${runWidthSum(custom)}`,
  );
  check(
    'нестандартный модуль помечен, но это не добор',
    custom.modules.find((m) => m.widthMm === 437)?.isFiller === true &&
      custom.modules.find((m) => m.widthMm === 437)?.kind !== 'filler',
  );

  // Ширина за пределами диапазона не применяется вовсе.
  const tooWide = applyOps({
    run: after,
    requirements: REQ,
    ops: [{ op: 'set_width', moduleId: plain.id, widthMm: 1800 }],
    openings: OPENINGS,
  });
  check(
    'ширина вне 150…1200 отклоняется с объяснением',
    tooWide.modules.every((m) => m.widthMm !== 1800) && tooWide.warnings.length > 0,
    tooWide.warnings[0] ?? 'предупреждения нет',
  );

  /*
   * Проверка «не влезает» ДО применения: правка отклоняется целиком,
   * а не съедает соседние модули.
   */
  const tightRun = buildRun({
    lengthMm: 1800,
    ceilingHeightMm: 2700,
    requirements: { ...REQ, appliances: ['sink600', 'hob'] },
    openings: [],
    comms: [],
  });
  const tightPlain = tightRun.modules.find((m) => !m.appliance)!;
  const overflowMm = widthOverflowMm(tightRun, tightPlain.id, 1200, MIN_WIDTH);
  const rejected = applyOps({
    run: tightRun,
    requirements: { ...REQ, appliances: ['sink600', 'hob'] },
    ops: [{ op: 'set_width', moduleId: tightPlain.id, widthMm: 1200 }],
    openings: [],
  });
  check(
    'слишком широкий модуль не применяется и превышение названо',
    overflowMm > 0 &&
      rejected.modules.every((m) => m.widthMm !== 1200) &&
      rejected.warnings.some((w) => w.includes(String(overflowMm))),
    `превышение ${overflowMm} мм · ${rejected.warnings[0] ?? '—'}`,
  );
  check(
    'после отклонённой правки ряд по-прежнему сходится',
    runWidthSum(rejected) === rejected.lengthMm,
  );

  const drawers = applyOps({
    run: after,
    requirements: REQ,
    ops: [{ op: 'set_fronts', moduleId: plain.id, drawerCount: 3 }],
    openings: OPENINGS,
  });
  check(
    '«ящики вместо дверцы» меняет тип фасада',
    drawers.modules.find((m) => m.id.startsWith(plain.kind))?.drawerCount === 3 ||
      drawers.modules.some((m) => m.drawerCount === 3),
  );

  const toCeiling = applyOps({
    run: after,
    requirements: REQ,
    ops: [{ op: 'set_option', key: 'upperToCeiling', value: true }],
    openings: OPENINGS,
  });
  check('«подними верхние до потолка» меняет опцию', toCeiling.options.upperToCeiling === true);
}

/* ─────────────────────────  Смета и ставки  ───────────────────────── */

console.log('\nСмета');
{
  const run = buildRun(baseInput);
  const before = buildEstimate(run, 'basic', DEMO_RATES);

  // Компания подняла цену ЛДСП — новая смета меняется, сохранённая нет.
  const newRates = { ...DEMO_RATES, ldsp_carcass: DEMO_RATES.ldsp_carcass * 2 };
  const after = buildEstimate(run, 'basic', newRates);

  check('новая смета учитывает новую ставку', after.total > before.total,
    `${before.total} → ${after.total}`);
  check(
    'сохранённая смета держит снимок старой ставки',
    before.priceSnapshot.ldsp_carcass === DEMO_RATES.ldsp_carcass,
    `снимок ${before.priceSnapshot.ldsp_carcass}`,
  );
  check(
    'сохранённая смета не изменилась после переоценки каталога',
    buildEstimate(run, 'basic', DEMO_RATES).total === before.total,
  );

  // Снятая галочка убирает строку из итога.
  const line = before.lines.find((l) => l.key === 'wall_panel' && l.total > 0);
  const off = recalcTotal(before, [line!.key]);
  check(
    'снятая галочка уменьшает итог',
    off.total < before.total,
    `${before.total} → ${off.total}`,
  );
  check(
    'выключенная строка помечена, а не удалена',
    off.lines.some((l) => l.key === line!.key && !l.enabled),
  );

  const missing = buildEstimate(run, 'basic', {});
  check(
    'отсутствие ставок помечается, а не молча даёт ноль',
    missing.lines.every((l) => l.missingRate) && missing.total === 0,
  );
}

/* ─────────────────────────  Комплектация  ───────────────────────── */

console.log('\nКомплектация');
{
  const variants = buildVariants({ ...baseInput, rates: DEMO_RATES });

  check('в поток уходит одна комплектация', variants.length === 1, `вариантов: ${variants.length}`);
  check('и это «Оптимальный»', variants[0].key === MAIN_VARIANT, variants[0].title);
  check('у неё есть цена', variants[0].estimate.total > 0, String(variants[0].estimate.total));

  /*
   * Три бюджета убраны из потока, но не из кода: вернуть их — это поменять
   * SINGLE_VARIANT, а не восстанавливать удалённые стратегии.
   */
  check('стратегии на три бюджета сохранены', DEFAULT_STRATEGIES.length === 3);

  const all = buildVariants({ ...baseInput, rates: DEMO_RATES, strategies: DEFAULT_STRATEGIES });
  check('под флагом остаётся одна даже из полного списка', all.length === 1);

  // Ключевое свойство трёх бюджетов: одна кухня, а не три разные.
  // Считаем ряды напрямую: под флагом buildVariants вернул бы только один.
  const layouts = DEFAULT_STRATEGIES.map((strategy) =>
    JSON.stringify(
      buildRun({
        ...baseInput,
        requirements: {
          ...baseInput.requirements,
          options: { ...baseInput.requirements.options, ...strategy.options },
        },
      }).modules.map((m) => [m.kind, m.widthMm, m.appliance ?? '']),
    ),
  );
  check('раскладка нижнего ряда у всех стратегий одна', new Set(layouts).size === 1);
}

/* ─────────────────────  Шаблон меняет состав  ───────────────────── */

console.log('\nШаблон доходит до раскладки');
{
  /*
   * Выбор шаблона обязан менять чертёж. Если цепочка «шаблон → requirements →
   * buildRun» где-то оборвётся, все шаблоны дадут один и тот же ряд, а
   * замерщик будет выбирать из карточек, которые ничего не решают.
   */
  const lengthMm = 3200;
  const fitting = RUN_TEMPLATES.filter((t) => templateFits(t, lengthMm));
  check('на 3200 мм подходит хотя бы три шаблона', fitting.length >= 3, `подходит: ${fitting.length}`);

  const prints = fitting.map(
    (t) =>
      buildRun({
        lengthMm,
        ceilingHeightMm: 2700,
        requirements: requirementsFromTemplate(t),
        openings: [],
        comms: [],
      }).fingerprint,
  );

  check(
    'разные шаблоны дают разные отпечатки конфигурации',
    new Set(prints).size === fitting.length,
    prints.join(' '),
  );

  const withColumn = requirementsFromTemplate(
    RUN_TEMPLATES.find((t) => t.id === 'linear-column')!,
  );
  const withoutColumn = requirementsFromTemplate(
    RUN_TEMPLATES.find((t) => t.id === 'linear-standard')!,
  );
  const a = buildRun({ lengthMm, ceilingHeightMm: 2700, requirements: withColumn, openings: [], comms: [] });
  const b = buildRun({ lengthMm, ceilingHeightMm: 2700, requirements: withoutColumn, openings: [], comms: [] });
  check(
    'шаблон с колонной ставит духовой шкаф, а стандартный — нет',
    a.modules.some((m) => m.appliance === 'oven') && !b.modules.some((m) => m.appliance === 'oven'),
  );
}

/* ─────────────────────────  Зоны квартиры  ───────────────────────── */

console.log('\nЗоны: ряд собирается и сходится');
{
  /*
   * Каждая зона обязана собрать ряд на любой разумной длине и сойтись с ней
   * до миллиметра. Ряд, который не сходится, — это мебель, которая не встанет
   * в стену, и деньги, которые компания потеряет на своём производстве.
   */
  for (const zone of ZONE_ORDER) {
    for (const lengthMm of [1200, 1800, 2600, 3400, 4200]) {
      const run = buildRun({
        lengthMm,
        ceilingHeightMm: 2700,
        requirements: { ...baseInput.requirements, zone },
        openings: [],
        comms: [],
      });
      check(
        `${ZONE_PROFILES[zone].title}: ряд ${lengthMm} мм сходится`,
        runWidthSum(run) === lengthMm && run.residualMm === 0,
        `сумма ${runWidthSum(run)}`,
      );
    }
  }
}

console.log('\nЗоны: в смете нет чужих строк');
{
  const estimateFor = (zone: ZoneKind, lengthMm = 3000) =>
    buildEstimate(
      buildRun({
        lengthMm,
        ceilingHeightMm: 2700,
        requirements: { ...baseInput.requirements, zone },
        openings: [],
        comms: [],
      }),
      'optimal',
      DEMO_RATES,
    );

  const keys = (zone: ZoneKind) => estimateFor(zone).lines.map((l) => l.key);

  const bedroom = keys('bedroom');
  check('спальня: столешницы нет', !bedroom.some((k) => k.startsWith('countertop_')));
  check('спальня: фартука нет', !bedroom.includes('wall_panel'));
  check('спальня: есть двери-купе и система', bedroom.includes('sliding_door') && bedroom.includes('sliding_system'));
  check('спальня: штанга и держатели', bedroom.includes('wardrobe_rod') && bedroom.includes('rod_holder'));
  check('спальня: полки и ящики', bedroom.includes('shelf_panel') && bedroom.includes('drawer_box'));
  const bedroomFronts =
    estimateFor('bedroom').lines.find((l) => l.key === 'front_panel')?.quantity ?? 0;
  check(
    'спальня: распашных фасадов и петель нет — шкаф закрыт купе',
    !bedroom.includes('hinge_standard') && bedroomFronts < 1,
    `фасадов ${bedroomFronts} м² — это фронты ящиков`,
  );

  const living = keys('living');
  check('зал: фартука нет', !living.includes('wall_panel'));
  check('зал: столешницы нет', !living.some((k) => k.startsWith('countertop_')));
  check(
    'зал: кабель-канал, подсветка ниши и подвесной крепёж',
    living.includes('cable_channel') && living.includes('led_niche') && living.includes('hanging_bracket'),
  );

  const bathroom = keys('bathroom');
  check('санузел: фартука нет', !bathroom.includes('wall_panel'));
  check('санузел: корпус влагостойкий, а не обычный',
    bathroom.includes('ldsp_moisture') && !bathroom.includes('ldsp_carcass'));
  check('санузел: столешница влагостойкая', bathroom.includes('countertop_moisture'));
  check('санузел: вырез под раковину', bathroom.includes('sink_cutout'));

  const hallway = keys('hallway');
  check('прихожая: столешницы нет', !hallway.some((k) => k.startsWith('countertop_')));
  check(
    'прихожая: зеркало, крючки, обувница, скамья',
    hallway.includes('mirror_panel') &&
      hallway.includes('coat_hook') &&
      hallway.includes('shoe_rack') &&
      hallway.includes('bench_seat'),
  );
  check(
    'прихожая: штанга торцевая или пантограф — вдоль стены в 400 мм плечики не встают',
    hallway.includes('rod_pantograph'),
  );

  const kitchen = keys('kitchen');
  check('кухня: столешница и фартук на месте',
    kitchen.some((k) => k.startsWith('countertop_')) && kitchen.includes('wall_panel'));
  check('кухня: секционных статей нет', !kitchen.includes('sliding_door') && !kitchen.includes('mirror_panel'));

  // Ни одна зона не считается по нулевым ставкам: это была бы выдуманная сумма.
  for (const zone of ZONE_ORDER) {
    const zero = estimateFor(zone).lines.filter((l) => l.missingRate);
    check(
      `${ZONE_PROFILES[zone].title}: все строки со ставкой`,
      zero.length === 0,
      zero.map((l) => l.key).join(' ') || 'нулевых нет',
    );
  }
}

console.log('\nЗоны: двери-купе');
{
  // Двери-купе — самая дорогая позиция после корпуса, и она обязана расти
  // вместе с шириной шкафа: иначе трёхметровый шкаф стоит как двухметровый.
  const area = (lengthMm: number) => {
    const run = buildRun({
      lengthMm,
      ceilingHeightMm: 2700,
      requirements: { ...baseInput.requirements, zone: 'bedroom' },
      openings: [],
      comms: [],
    });
    const line = buildEstimate(run, 'optimal', DEMO_RATES).lines.find((l) => l.key === 'sliding_door');
    return line?.quantity ?? 0;
  };

  const small = area(1800);
  const large = area(3600);
  check('двери-купе считаются по м²', small > 0 && large > 0, `${small} м² против ${large} м²`);
  check('и растут вместе с шириной шкафа', large > small * 1.5);

  const doors = buildEstimate(
    buildRun({
      lengthMm: 3600,
      ceilingHeightMm: 2700,
      requirements: { ...baseInput.requirements, zone: 'bedroom' },
      openings: [],
      comms: [],
    }),
    'optimal',
    DEMO_RATES,
  ).lines.find((l) => l.key === 'sliding_system');
  check('система купе — комплектом на каждую дверь', (doors?.quantity ?? 0) >= 3, String(doors?.quantity));
}

console.log('\nЗоны: тумба под раковину привязана к воде');
{
  const run = buildRun({
    lengthMm: 2000,
    ceilingHeightMm: 2700,
    requirements: { ...baseInput.requirements, zone: 'bathroom' },
    openings: [],
    comms: [],
  });

  const water = (fromCornerMm: number): CommPoint[] => [
    { id: 'w1', wallId: 'w1', kind: 'water_supply', fromCornerMm, heightMm: 500 },
  ];

  const near = vanityWaterConflicts(run, water(400));
  const far = vanityWaterConflicts(run, water(1800));

  check('в допуске 300 мм молчит', near.length === 0);
  check('дальше 300 мм — блокирующее', far.length === 1 && far[0].severity === 'blocking', far[0]?.message);
}

console.log('\nЗоны: шаблоны и готовность');
{
  for (const zone of ZONE_ORDER) {
    const list = templatesForZone(zone);
    check(`${ZONE_PROFILES[zone].title}: минимум два шаблона`, list.length >= 2, `${list.length}`);
    check(
      `${ZONE_PROFILES[zone].title}: шаблоны только своей зоны`,
      list.every((t) => (t.zone ?? 'kitchen') === zone),
    );

    // Карточка, обещающая ряд короче суммы секций, не соберётся.
    for (const template of list) {
      check(
        `${template.name}: диапазон вмещает состав`,
        template.minLengthMm >= templateAppliancesWidthMm(template),
        `${template.minLengthMm} против ${templateAppliancesWidthMm(template)}`,
      );
    }

    const readiness = zoneReadiness(zone);
    check(
      `${ZONE_PROFILES[zone].title}: готовность посчитана, а не проставлена руками`,
      readiness.ready,
      readiness.missing.join(', ') || 'всё на месте',
    );
  }

  // Шаблон зоны разворачивается через buildRun, своей раскладки у него нет.
  const wardrobe = templatesForZone('bedroom')[0];
  const run = buildRun({
    lengthMm: 2800,
    ceilingHeightMm: 2700,
    requirements: requirementsFromTemplate(wardrobe),
    openings: [],
    comms: [],
  });
  check('шаблон шкафа разворачивается в ряд', run.modules.length >= 3);
  check('и ряд сходится с длиной', runWidthSum(run) === 2800);
  check('шкаф-купе помечен как купе', run.doorSystem === 'sliding');
}

/* ─────────────────────  Ручная расстановка техники  ───────────────────── */

console.log('\nРучная расстановка');
{
  const at = (run: ReturnType<typeof buildRun>, appliance: string) => {
    const unit = [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)].find(
      (m) => m.appliance === appliance,
    );
    return unit ? unit.offsetMm + unit.widthMm / 2 : null;
  };

  const auto = buildRun(baseInput);

  /*
   * Ручная позиция сильнее умолчаний: замерщик стоит в квартире и видит
   * то, чего алгоритм не знает. Прибор обязан встать ИМЕННО туда, а не
   * упереться в то, что уже стоит слева.
   */
  for (const centerMm of [700, 1200, 2000, 2900]) {
    const run = buildRun({
      ...baseInput,
      requirements: { ...REQ, manualAnchors: { hob: centerMm } },
    });
    check(
      `варочная встаёт на ${centerMm} мм`,
      at(run, 'hob') === centerMm,
      `оказалась на ${at(run, 'hob')}`,
    );
    check(`и ряд сходится с длиной`, runWidthSum(run) === run.lengthMm);
  }

  // Вытяжка едет за варочной сама: отдельная вытяжка — ошибка монтажа.
  const moved = buildRun({
    ...baseInput,
    requirements: { ...REQ, manualAnchors: { hob: 2900 } },
  });
  check('вытяжка следует за варочной', at(moved, 'hood') === at(moved, 'hob'));

  const hoodTry = buildRun({
    ...baseInput,
    requirements: { ...REQ, manualAnchors: { hood: 300 } },
  });
  check(
    'вытяжку отдельно перетащить нельзя',
    at(hoodTry, 'hood') === at(hoodTry, 'hob'),
    `вытяжка ${at(hoodTry, 'hood')}, варочная ${at(hoodTry, 'hob')}`,
  );

  // Инвариант «ряд помещается в стену» ручная расстановка не отменяет.
  let overflow = 0;
  for (let centerMm = 300; centerMm <= 3200; centerMm += 50) {
    try {
      const run = buildRun({
        ...baseInput,
        requirements: { ...REQ, manualAnchors: { hob: centerMm } },
      });
      if (runWidthSum(run) !== run.lengthMm) overflow++;
    } catch {
      overflow++;
    }
  }
  check('шестьдесят позиций подряд не ломают ряд', overflow === 0, `сбоев: ${overflow}`);

  // Правка, из-за которой прибор перестаёт помещаться, не применяется.
  const tight = buildRun({
    ...baseInput,
    requirements: { ...REQ, manualAnchors: { hob: 700 } },
  });
  const cost = manualAnchorCost(auto, tight);
  check(
    'выпавшие приборы названы до применения',
    cost.dropped.length > 0,
    cost.dropped.join(', ') || 'ничего не выпало',
  );
  check(
    'а при свободной позиции ничего не выпадает',
    manualAnchorCost(auto, buildRun({
      ...baseInput,
      requirements: { ...REQ, manualAnchors: { hob: 2900 } },
    })).dropped.length === 0,
  );

  // Ручная позиция переживает пересчёт: она часть требований.
  const twice = [1, 2].map(() =>
    buildRun({ ...baseInput, requirements: { ...REQ, manualAnchors: { hob: 2000 } } }),
  );
  check(
    'пересчёт не сбрасывает ручную позицию',
    at(twice[0], 'hob') === 2000 && at(twice[1], 'hob') === 2000,
  );
  check(
    'и даёт тот же ряд',
    JSON.stringify(twice[0].modules) === JSON.stringify(twice[1].modules),
  );

  /* Нарушение правила предупреждает, но не запрещает. */
  const nearEdge = buildRun({
    ...baseInput,
    requirements: { ...REQ, manualAnchors: { hob: 350 } },
  });
  const edgeWarnings = manualPlacementWarnings(nearEdge);
  check(
    'варочная у края даёт жёлтое предупреждение',
    edgeWarnings.some((w) => w.severity === 'clarify' && w.message.includes('от края ряда')),
    edgeWarnings.map((w) => w.message).join(' | ') || 'предупреждений нет',
  );
  check('но раскладка применена', at(nearEdge, 'hob') === 350);

  const nearSink = buildRun({
    ...baseInput,
    requirements: { ...REQ, manualAnchors: { hob: 2100 } },
  });
  check(
    'варочная вплотную к мойке — тоже жёлтое',
    manualPlacementWarnings(nearSink).some((w) => w.message.includes('Между мойкой и варочной')),
  );

  // Мойка, переставленная руками, перестаёт быть красным флажком.
  const farSink = buildRun({
    ...baseInput,
    requirements: { ...REQ, manualAnchors: { sink600: 3000 } },
  });
  const asAuto = sinkWaterConflicts(farSink, COMMS, false);
  const asManual = sinkWaterConflicts(farSink, COMMS, true);
  check('автоматически — блокирующее', asAuto[0]?.severity === 'blocking');
  check('вручную — предупреждение', asManual[0]?.severity === 'clarify');
}

/* ─────────────────────  Компоновки одной кухни  ───────────────────── */

console.log('\nКомпоновки');
{
  const list = buildArrangements({
    lengthMm: 3200,
    ceilingHeightMm: 2700,
    requirements: REQ,
    openings: OPENINGS,
    comms: COMMS,
    rates: DEMO_RATES,
  });

  /*
   * Больше трёх не показываем никогда: это прямые слова мебельщика —
   * «клиент теряется». Меньше двух — это не выбор, а показ одного варианта.
   */
  check('вариантов не больше трёх', list.length <= MAX_ARRANGEMENTS, `их ${list.length}`);
  check('и не меньше двух', list.length >= 2, `их ${list.length}`);

  check(
    'варианты действительно разные',
    new Set(list.map((a) => a.run.fingerprint)).size === list.length,
    list.map((a) => `${a.key}:${a.run.fingerprint}`).join(' · '),
  );

  // Ряд каждого варианта — обычный ряд: инвариант его касается так же.
  check(
    'каждый вариант сходится с длиной ряда',
    list.every((a) => runWidthSum(a.run) === a.run.lengthMm),
  );
  check(
    'и ни один не потерял технику',
    list.every((a) => !a.run.warnings.some((w) => w.includes('не помещается'))),
    list.flatMap((a) => a.run.warnings).join(' | ') || 'предупреждений нет',
  );

  /*
   * Своей раскладки у варианта нет: это ДРУГИЕ ТРЕБОВАНИЯ, а `buildRun`
   * тот же. Иначе карточка разошлась бы с чертежом и сметой — ровно та же
   * ловушка, что и с шаблонами.
   */
  check(
    'вариант разворачивается через buildRun',
    list.every((a) => {
      const again = buildRun({
        lengthMm: 3200,
        ceilingHeightMm: 2700,
        requirements: a.requirements,
        openings: OPENINGS,
        comms: COMMS,
      });
      return again.fingerprint === a.run.fingerprint;
    }),
  );

  // Детерминизм: одна и та же кухня не должна предлагать разные варианты.
  const again = buildArrangements({
    lengthMm: 3200,
    ceilingHeightMm: 2700,
    requirements: REQ,
    openings: OPENINGS,
    comms: COMMS,
    rates: DEMO_RATES,
  });
  check(
    'два прогона дают те же варианты',
    JSON.stringify(again.map((a) => a.key)) === JSON.stringify(list.map((a) => a.key)),
    list.map((a) => a.key).join(', '),
  );

  check(
    'у каждого варианта своя сумма в карточке',
    list.every((a) => a.estimate.total > 0),
  );
  check(
    'и смета посчитана по его же ряду',
    list.every((a) => a.estimate.fingerprint === a.run.fingerprint),
  );

  /*
   * Смена варианта сбрасывает ручную расстановку: вариант собран заново,
   * и прежние позиции к нему не относятся. В интерфейсе об этом сказано
   * словами, а здесь проверяется, что требования варианта их не тащат.
   */
  const withManual = buildArrangements({
    lengthMm: 3200,
    ceilingHeightMm: 2700,
    requirements: { ...REQ, manualAnchors: { hob: 900 } },
    openings: OPENINGS,
    comms: COMMS,
    rates: DEMO_RATES,
  });
  check(
    'вариант не тащит за собой чужую ручную расстановку',
    withManual.every((a) => (a.requirements.manualAnchors ?? {}).hob === undefined),
  );

  // Три самые разные, а не первые попавшиеся.
  const many = [...list, ...list.map((a) => ({ ...a, key: `${a.key}-2` }))];
  const picked = mostDifferent(many, 3);
  check('отбор оставляет ровно три', picked.length === 3);
  check(
    'и не берёт две одинаковые расстановки подряд',
    new Set(picked.map((a) => a.run.fingerprint)).size >= 2,
    picked.map((a) => a.key).join(', '),
  );

  // Длинная стена: вариантов больше, и отбор обязан их проредить.
  const long = buildArrangements({
    lengthMm: 4200,
    ceilingHeightMm: 2700,
    requirements: REQ,
    openings: OPENINGS,
    comms: COMMS,
    rates: DEMO_RATES,
  });
  check('на длинной стене вариантов тоже не больше трёх', long.length <= MAX_ARRANGEMENTS);
  check(
    'и они не повторяют друг друга',
    new Set(long.map((a) => a.run.fingerprint)).size === long.length,
  );
}

/* ──────────────  Колонна, встройка, витрина, верхний ряд  ────────────── */

console.log('\nКолонна, встройка и витрина');
{
  const REQ_MW: RunRequirements = { ...REQ, appliances: [...REQ.appliances, 'microwave'] };
  const long = { ...baseInput, lengthMm: 3600 };

  const withColumn = buildRun({ ...long, requirements: REQ_MW });
  const column = withColumn.modules.find((m) => m.column);

  /*
   * Духовка и микроволновка — ОДИН пенал 600 мм. Двумя пеналами это лишние
   * 600 мм стены, и мебельщик так не делает никогда.
   */
  check('микроволновка встаёт в ряд', Boolean(column), column ? '' : 'колонны нет');
  check(
    'колонна занимает один модуль 600 мм',
    column?.widthMm === 600 && withColumn.modules.filter((m) => m.column).length === 1,
    `ширина ${column?.widthMm}`,
  );
  check('и ряд сходится с длиной', runWidthSum(withColumn) === withColumn.lengthMm);
  check(
    'по умолчанию микроволновка сверху',
    column?.column?.top === 'microwave' && column?.column?.bottom === 'oven',
    `${column?.column?.bottom} снизу, ${column?.column?.top} сверху`,
  );

  // Оба прибора попадают в смету: потерянный второй — это деньги клиента.
  const columnEstimate = buildEstimate(withColumn, MAIN_VARIANT, DEMO_RATES);
  const line = (key: string) => columnEstimate.lines.find((l) => l.key === key);
  check('духовка в смете', (line('appliance_oven')?.quantity ?? 0) === 1);
  check('микроволновка в смете', (line('appliance_microwave')?.quantity ?? 0) === 1);
  check(
    'и ни один прибор не попал в ряд дважды',
    Array.from(appliancesPlacedOnce(withColumn).values()).every((n) => n === 1),
  );

  // Ниши: высоты паспортные и на системе 32 — полка садится на отверстие.
  const niches = columnNiches(column!, moduleCarcassHeightMm(column!, withColumn));
  check(
    'ниша духовки не меньше 595 мм',
    niches.find((n) => n.appliance === 'oven')!.toMm -
      niches.find((n) => n.appliance === 'oven')!.fromMm >=
      595,
  );
  check(
    'ниша микроволновки не меньше 380 мм',
    niches.find((n) => n.appliance === 'microwave')!.toMm -
      niches.find((n) => n.appliance === 'microwave')!.fromMm >=
      380,
  );
  check(
    'опоры ниш стоят на шаге 32 мм',
    niches.every(
      (n) =>
        (n.fromMm - SYSTEM32_BASE_MM) % SYSTEM32_STEP_MM === 0 &&
        (n.toMm - SYSTEM32_BASE_MM) % SYSTEM32_STEP_MM === 0,
    ),
    niches.map((n) => `${n.fromMm}–${n.toMm}`).join(' · '),
  );
  check(
    'колонна помещается в высоту пенала',
    niches[1].toMm <= moduleCarcassHeightMm(column!, withColumn),
  );

  // «Поменять местами» — это ДРУГАЯ мебель, и отпечаток обязан её различать.
  const swapped = buildRun({ ...long, requirements: { ...REQ_MW, columnTop: 'oven' } });
  const swappedColumn = swapped.modules.find((m) => m.column);
  check(
    'смена мест меняет порядок приборов',
    swappedColumn?.column?.top === 'oven' && swappedColumn?.column?.bottom === 'microwave',
  );
  check(
    'и меняет отпечаток конфигурации',
    swapped.fingerprint !== withColumn.fingerprint,
    `${withColumn.fingerprint} против ${swapped.fingerprint}`,
  );
  check(
    'а раскладка при этом та же',
    swapped.modules.map((m) => m.widthMm).join() ===
      withColumn.modules.map((m) => m.widthMm).join(),
  );

  // Микроволновка без духовки: свой пенал, а не пропажа.
  const alone = buildRun({
    ...long,
    requirements: { ...REQ, appliances: ['sink600', 'hob', 'hood', 'microwave'] },
  });
  check(
    'микроволновка без духовки встаёт своим пеналом',
    alone.modules.some((m) => m.appliance === 'microwave' && m.kind === 'tall'),
  );

  /* ── Холодильник: встроенный или отдельностоящий ── */

  const builtIn = buildRun({ ...long, requirements: { ...REQ_MW, fridgeType: 'built_in' } });
  const freeStanding = buildRun({
    ...long,
    requirements: { ...REQ_MW, fridgeType: 'freestanding' },
  });

  check(
    'по умолчанию холодильник встроенный',
    withColumn.modules.find((m) => m.appliance === 'fridge')?.builtIn === true,
  );

  const frontOf = (run: ReturnType<typeof buildRun>) =>
    buildEstimate(run, MAIN_VARIANT, DEMO_RATES).lines.find((l) => l.key === 'front_panel')
      ?.quantity ?? 0;
  const hingesOf = (run: ReturnType<typeof buildRun>) =>
    buildEstimate(run, MAIN_VARIANT, DEMO_RATES).lines.find((l) => l.key === 'hinge_standard')
      ?.quantity ?? 0;

  check(
    'встроенный добавляет фасад в смету',
    frontOf(builtIn) > frontOf(freeStanding),
    `${frontOf(builtIn)} м² против ${frontOf(freeStanding)} м²`,
  );
  check(
    'и петли для встройки',
    hingesOf(builtIn) > hingesOf(freeStanding),
    `${hingesOf(builtIn)} против ${hingesOf(freeStanding)}`,
  );
  check(
    'отдельностоящий фасада не даёт',
    !buildPanels({ run: freeStanding, production: DEFAULT_PRODUCTION }).some(
      (panel) => panel.name === 'Фасад встройки',
    ),
  );
  check(
    'а встроенный даёт детали фасада для цеха',
    buildPanels({ run: builtIn, production: DEFAULT_PRODUCTION }).some(
      (panel) => panel.name === 'Фасад встройки',
    ),
  );
  check(
    'встройка меняет отпечаток конфигурации',
    builtIn.fingerprint !== freeStanding.fingerprint,
  );

  /* ── Витрина с подсветкой ── */

  const display = buildRun({ ...long, requirements: { ...REQ_MW, glassDisplay: true } });
  const displayUnit = display.modules.find((m) => m.section === 'glass_display');

  check('витрина встаёт в ряд', Boolean(displayUnit));
  check('ряд с витриной сходится с длиной', runWidthSum(display) === display.lengthMm);
  check(
    'витрина стоит в торце ряда',
    display.modules[display.modules.length - 1]?.section === 'glass_display',
  );
  check(
    'и не выкидывает технику',
    Array.from(appliancesPlacedOnce(display).keys()).length ===
      Array.from(appliancesPlacedOnce(withColumn).keys()).length,
  );

  const displayEstimate = buildEstimate(display, MAIN_VARIANT, DEMO_RATES);
  const led = displayEstimate.lines.find((l) => l.key === 'led_display');
  const glass = displayEstimate.lines.find((l) => l.key === 'glass_front');
  check(
    'подсветка витрины считается в погонных метрах',
    led?.unit === 'mp' && (led?.quantity ?? 0) > 0,
    `${led?.quantity} м.п.`,
  );
  check('стеклянная дверь идёт своей строкой', (glass?.quantity ?? 0) > 0);
  check(
    'у витрины нет распашного фасада',
    displayUnit?.frontType === 'none' && displayUnit?.doorCount === 0,
  );

  // Короткий ряд: отказывается витрина, а не холодильник.
  const tight = buildRun({
    ...baseInput,
    lengthMm: 2400,
    requirements: { ...REQ, glassDisplay: true },
  });
  check(
    'в коротком ряду отказывается витрина, а не техника',
    !tight.modules.some((m) => m.section === 'glass_display') &&
      tight.modules.some((m) => m.appliance === 'fridge'),
  );
  check(
    'и отказ назван словами',
    tight.warnings.some((w) => w.includes('Витрина')),
    tight.warnings.join(' | ') || 'предупреждений нет',
  );

  /* ── Верхний ряд до потолка ── */

  const standard = buildRun({ ...long, requirements: REQ_MW });
  const toCeiling = buildRun({
    ...long,
    requirements: { ...REQ_MW, options: { ...REQ_MW.options, upperToCeiling: true } },
  });

  const upperHeight = (run: ReturnType<typeof buildRun>) => {
    const unit = run.upperSegments.flatMap((seg) => seg.modules)[0];
    return unit ? moduleCarcassHeightMm(unit, run) : 0;
  };

  check(
    'до потолка верхний ряд выше стандартного',
    upperHeight(toCeiling) > upperHeight(standard),
    `${upperHeight(toCeiling)} против ${upperHeight(standard)}`,
  );
  check(
    'и это другая смета',
    buildEstimate(toCeiling, MAIN_VARIANT, DEMO_RATES).total !==
      buildEstimate(standard, MAIN_VARIANT, DEMO_RATES).total,
  );
}

/* ─────────────────────────  Наполнение модулей  ───────────────────────── */

console.log('\nНаполнение: система 32');
{
  /*
   * Полка садится ТОЛЬКО на присадочное отверстие. Полки на «высоте 412 мм»
   * не существует, и мебельщик замечает это первым: если полка встаёт куда
   * угодно, инструмент писал человек не из отрасли.
   */
  const offGrid: string[] = [];
  const drawerMismatch: string[] = [];

  for (const zone of ZONE_ORDER) {
    for (const lengthMm of [1800, 2600, 3200, 4000]) {
      const run = buildRun({
        lengthMm,
        ceilingHeightMm: 2700,
        requirements: { ...baseInput.requirements, zone },
        openings: [],
        comms: [],
      });

      for (const unit of [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)]) {
        const fill = unit.fill;
        if (!fill) {
          offGrid.push(`${zone}/${unit.id}: нет наполнения`);
          continue;
        }

        for (const shelf of fill.shelves) {
          if ((shelf - SYSTEM32_BASE_MM) % SYSTEM32_STEP_MM !== 0) {
            offGrid.push(`${zone}/${unit.id}: полка ${shelf}`);
          }
        }

        if (fill.drawerHeights.length > 0) {
          const sum = fill.drawerHeights.reduce((a, b) => a + b, 0);
          const height = moduleCarcassHeightMm(unit, run);
          if (sum !== height) drawerMismatch.push(`${zone}/${unit.id}: ${sum} против ${height}`);
        }
      }
    }
  }

  check('каждая полка стоит на шаге 32 мм', offGrid.length === 0, offGrid.slice(0, 3).join(' · '));
  check(
    'сумма высот фронтов ящиков равна высоте модуля',
    drawerMismatch.length === 0,
    drawerMismatch.slice(0, 3).join(' · '),
  );

  check('snapTo32 не опускается ниже первого отверстия', snapTo32(-500) === SYSTEM32_BASE_MM);
  check('snapTo32 берёт ближайшее отверстие', snapTo32(412) === 416, String(snapTo32(412)));

  // Наполнение — часть конфигурации: чертёж, смета и рендер видят одну мебель.
  const run = buildRun(baseInput);
  const moved = {
    ...run,
    modules: run.modules.map((unit, i) =>
      // Берём модуль, у которого полка есть: у ниши под технику её нет.
      i === run.modules.findIndex((m) => (m.fill?.shelves.length ?? 0) > 0) && unit.fill
        ? { ...unit, fill: moveShelf(unit.fill, 0, 500, moduleCarcassHeightMm(unit, run)) }
        : unit,
    ),
  };
  check(
    'отпечаток меняется при изменении наполнения',
    runFingerprint(moved) !== run.fingerprint,
    `${run.fingerprint} → ${runFingerprint(moved)}`,
  );

  // Ограничения правок: полка не липнет к соседней, ящик не выходит за пределы.
  const fill = { shelves: [352, 704], dividerMm: 0, rodsMm: [], drawerHeights: [], hinge: 'none' as const };
  check('полку нельзя поставить вплотную к соседней', moveShelf(fill, 0, 690, 2000).shelves[0] === 352);
  check('полка добавляется на свободное место', addShelf(fill, 1200, 2000).shelves.length === 3);
  check('полка убирается', removeShelf(fill, 0).shelves.length === 1);

  const drawers = {
    shelves: [],
    dividerMm: 0,
    rodsMm: [],
    drawerHeights: [140, 220, 220, 220],
    hinge: 'none' as const,
  };
  const shifted = moveDrawerBoundary(drawers, 0, 60);
  check(
    'граница ящиков двигается, а сумма не меняется',
    shifted.drawerHeights.reduce((a, b) => a + b, 0) === 800 && shifted.drawerHeights[0] === 200,
    shifted.drawerHeights.join(' + '),
  );
  check(
    'ящик выше 400 мм не делается',
    moveDrawerBoundary(drawers, 0, 400).drawerHeights[0] === 140,
  );
}

/* ─────────────────────────  Детализировка  ───────────────────────── */

console.log('\nДетализировка');
{
  const run = buildRun(baseInput);
  const panels = buildPanels({ run });
  const totals = panelTotals(panels);

  check('детали посчитаны для всех модулей', panels.length > run.modules.length, `${panels.length} деталей`);
  check('в каждом корпусе есть боковины, дно и крыша',
    run.modules.every((unit) =>
      unit.kind === 'filler' ||
      panels.some((p) => p.moduleId === unit.id && p.name === 'Боковина'),
    ),
  );
  check('у фасада кромка по всем четырём торцам',
    panels.filter((p) => p.name === 'Фасад').every((p) => p.edges.long === 2 && p.edges.short === 2),
  );
  check('у задней стенки кромки нет',
    panels.filter((p) => p.name === 'Задняя стенка').every((p) => p.edges.long + p.edges.short === 0),
  );
  check('текстура проставлена у каждой детали ЛДСП',
    panels.filter((p) => p.material.startsWith('ЛДСП')).every((p) => p.grain !== 'none'),
  );
  check('итоги считаются', totals.ldspM2 > 0 && totals.edgeThickM > 0,
    `ЛДСП ${totals.ldspM2} м², кромка ${totals.edgeThickM} м`);

  /*
   * Площадь корпуса из детализировки обязана сойтись с площадью в смете:
   * это одна и та же плита, и расходиться им негде.
   */
  const estimate = buildEstimate(run, 'optimal', DEMO_RATES);
  const carcassLine = estimate.lines.find((l) => l.key === 'ldsp_carcass');
  const ratio = (carcassLine?.quantity ?? 0) / Math.max(totals.ldspM2, 0.001);
  check(
    'площадь ЛДСП сходится со сметой в пределах 25%',
    ratio > 0.75 && ratio < 1.25,
    `смета ${carcassLine?.quantity} м², детализировка ${totals.ldspM2} м²`,
  );

  // Толщина плиты — настройка компании, а не константа кода.
  const thick = buildPanels({ run, production: { ...DEFAULT_PRODUCTION, carcassMm: 18 } });
  const bottom16 = panels.find((p) => p.name === 'Дно');
  const bottom18 = thick.find((p) => p.name === 'Дно');
  check(
    'смена толщины ЛДСП меняет размеры дна',
    Boolean(bottom16 && bottom18) && bottom18!.lengthMm === bottom16!.lengthMm - 4,
    `${bottom16?.lengthMm} → ${bottom18?.lengthMm}`,
  );

  const gap3 = buildPanels({ run, production: { ...DEFAULT_PRODUCTION, frontGapMm: 3 } });
  const front4 = panels.find((p) => p.name === 'Фасад');
  const front3 = gap3.find((p) => p.name === 'Фасад');
  check(
    'зазор фасада берётся из настроек цеха',
    Boolean(front3 && front4) && front3!.lengthMm === front4!.lengthMm + 1,
    `${front4?.lengthMm} → ${front3?.lengthMm}`,
  );

  // Выгрузка для раскроя: разделитель, колонки и кириллица без искажений.
  const csv = panelsToCsv(panels);
  const head = csv.split('\r\n')[0];
  check('в CSV десять колонок через точку с запятой', head.split(';').length === 10, head);

  const cp = panelsCsvFile(panels, 'windows-1251');
  const decoded = new TextDecoder('windows-1251').decode(cp.bytes);
  check('windows-1251 читается обратно без потерь', decoded === csv);

  const utf = panelsCsvFile(panels, 'utf-8');
  check('в UTF-8 файле есть BOM для Excel',
    utf.bytes[0] === 0xef && utf.bytes[1] === 0xbb && utf.bytes[2] === 0xbf);
}

/* ─────────────────────────  Стандарты не параметризуются  ───────────────────────── */

console.log('\nОтраслевые стандарты');
{
  check('высота корпуса нижнего ряда 720 мм', GEOMETRY.base.carcassH === 720);
  check('низ верхнего ряда 1450 мм от пола', GEOMETRY.upper.bottomFromFloor === 1450);
  check('глубина нижнего ряда 560 мм', GEOMETRY.base.depth === 560);
  check(
    'стандартные ширины идут по возрастанию без дублей',
    STANDARD_WIDTHS.every((w, i) => i === 0 || w > STANDARD_WIDTHS[i - 1]),
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
