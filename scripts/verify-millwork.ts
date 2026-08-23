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
import { DEFAULT_STRATEGIES, MAIN_VARIANT, buildVariants } from '../lib/millwork/variants';
import { RUN_TEMPLATES, requirementsFromTemplate, templateFits } from '../lib/millwork/templates';
import { ZONE_ORDER, ZONE_PROFILES } from '../lib/millwork/zones';
import { commIssues, layoutIssues, validateRun } from '../lib/millwork/validate';
import {
  RunOverflowError,
  appliancesPlacedOnce,
  assertRunFits,
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

console.log('\nЗоны');
{
  /*
   * Полностью просчитана кухня. У остальных зон честно убраны статьи,
   * которых там нет: столешницы и фартука в спальне не существует, и
   * показывать их в смете нельзя — это выдуманные деньги.
   */
  const kitchen = buildRun({ ...baseInput, requirements: { ...baseInput.requirements, zone: 'kitchen' } });
  const bedroom = buildRun({ ...baseInput, requirements: { ...baseInput.requirements, zone: 'bedroom' } });

  const kitchenLines = buildEstimate(kitchen, 'optimal', DEMO_RATES).lines.map((l) => l.key);
  const bedroomLines = buildEstimate(bedroom, 'optimal', DEMO_RATES).lines.map((l) => l.key);

  check('в кухне есть столешница и фартук',
    kitchenLines.some((k) => k.startsWith('countertop_')) && kitchenLines.includes('wall_panel'));
  check('в спальне их нет вовсе',
    !bedroomLines.some((k) => k.startsWith('countertop_')) && !bedroomLines.includes('wall_panel'));
  check('и спальня от этого дешевле',
    buildEstimate(bedroom, 'optimal', DEMO_RATES).total <
      buildEstimate(kitchen, 'optimal', DEMO_RATES).total);
  check('корпус считается в обеих зонах', bedroomLines.includes('ldsp_carcass'));

  check('зона едет вместе с рядом', bedroom.zone === 'bedroom');
  check('кухня — зона по умолчанию', buildRun(baseInput).zone === 'kitchen');
  check('каждая зона знает свои габариты',
    ZONE_ORDER.every((k) => ZONE_PROFILES[k].depthMm >= 300 && ZONE_PROFILES[k].title.length > 0));
  check('готовой отмечена только кухня',
    ZONE_ORDER.filter((k) => ZONE_PROFILES[k].ready).join(',') === 'kitchen');
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
