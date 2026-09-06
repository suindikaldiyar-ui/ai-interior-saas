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
  withStrategy,
  MAX_ARRANGEMENTS,
  buildArrangements,
  buildVariants,
  mostDifferent,
} from '../lib/millwork/variants';
import {
  RUN_TEMPLATES,
  parseOrgTemplates,
  requirementsFromTemplate,
  templateById,
  templateFits,
} from '../lib/millwork/templates';
import {
  ZONE_ORDER,
  ZONE_PROFILES,
  allowsAppliance,
  allowsSection,
  applianceRefusal,
  zoneAppliances,
  zoneOptions,
  zoneProfile,
} from '../lib/millwork/zones';
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
import { surfaceFinish, surfaceLook } from '../lib/millwork/surfaces';
import { GROUP_ORDER, estimateGroups, groupsTotal } from '../lib/millwork/estimateGroups';
import {
  STANDARD_SCALES,
  chooseFormat,
  fitComposition,
  MIN_SCALE_DEN,
  paginate,
  scaleLabel,
  sheetField,
  sheetNumber,
  viewWidthMm,
} from '../lib/millwork/sheet';
import { buildLeaders, layoutLeaders } from '../lib/millwork/leaders';
import { positionCode, projectPositions } from '../lib/millwork/positions';
import { frontGlyph, glyphSignature } from '../lib/millwork/frontGlyph';
import {
  BASE_ROW_TITLE,
  NO_UPPER_ROW,
  UPPER_ROW_TITLE,
  assertCompositionMatches,
  countFrontRows,
  describeFronts,
  frontRules,
  frontsBlock,
} from '../lib/millwork/promptFronts';
import { MODULE_VARIANTS, applyVariant } from '../lib/millwork/moduleVariants';
import { assertNoOverlap, moduleOverlaps } from '../lib/millwork/invariants';
import { configurationFingerprint } from '../lib/millwork/fingerprint';
import { panelMaterials } from '../lib/millwork/panels';
import { visibleVariantCount } from '../lib/millwork/frontGlyph';
import { DEMO_TEMPLATE_ID } from '../lib/millwork/demoProject';
import type { ProductionSettings } from '../types/catalog';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ElevationDrawing from '../components/millwork/ElevationDrawing';
import SectionDrawing from '../components/millwork/SectionDrawing';
import PlanDrawing from '../components/millwork/PlanDrawing';
import AxonometryDrawing from '../components/millwork/AxonometryDrawing';
import { describeFront, interiorVisible } from '../lib/millwork/promptFronts';
import {
  REQUIRED_RATE_KEYS,
  TYPICAL_PRICE_LIST,
  missingRequiredRates,
} from '../lib/millwork/rates';
import { axonometryExtentMm, buildAxonometry, project } from '../lib/millwork/axonometry';
import { carcassBoxes, moduleBoxes } from '../lib/millwork/cabinetBoxes';
import { DEFAULT_PRODUCTION } from '../types/catalog';
import type { ZoneKind } from '../types/millwork';
import { commIssues, layoutIssues, validateRun } from '../lib/millwork/validate';
import {
  CornerOverlapError,
  RunOverflowError,
  appliancesPlacedOnce,
  assertRunFits,
  manualAnchorCost,
  widthOverflowMm,
} from '../lib/millwork/invariants';
import {
  APPLIANCE_SLOTS,
  CORNER,
  CORNER_SIZE_MM,
  moduleAppliances,
  GEOMETRY,
  MIN_WIDTH,
  STANDARD_WIDTHS,
} from '../lib/millwork/modules';
import {
  DEMO_COMMS,
  DEMO_MEASUREMENT,
  DEMO_OPENINGS,
  DEMO_PROJECT,
  DEMO_RATES,
  DEMO_REQUIREMENTS,
} from '../lib/millwork/demo';
import type {
  CommPoint,
  MillworkOp,
  Module,
  ModuleVariantKind,
  Opening,
  Run,
  RunRequirements,
  SectionKind,
} from '../types/millwork';
import { allModules } from '../lib/millwork/layout';
import {
  DEFAULT_TOLERANCE_MM,
  MAX_READY_PER_ZONE,
  SCHEME_TOLERANCE_MM,
  hasSchemeSizes,
  isMeasured,
  libraryBasis,
  planRunLengthMm,
  planToleranceMm,
  planZone,
  sizeBasis,
  sizeSourceFor,
  zoneRunLengthMm,
  type DerivedWall,
  type FloorPlan,
  type PlanPoint,
  type ReadyProject,
} from '../types/complexes';
import { limitByZone } from '../lib/complexes';
import {
  buildComposition,
  linearComposition,
  splitAppliances,
} from '../lib/millwork/composition';
import {
  CARGO_MAX_MM,
  CARGO_MIN_MM,
  hasBottom,
  variantsForModule,
} from '../lib/millwork/moduleVariants';
import {
  calibrationDriftPercent,
  lengthMm as planLengthMm,
  measurementFromWall,
  mmPerPxFromArea,
  openingOnWall,
  polygonAreaPx,
  polygonSizeMm,
} from '../lib/planCalibration';
import { buildAutoProjects } from '../lib/millwork/autoProject';
import { slugify, uniqueSlug } from '../lib/slug';
import {
  isEstimatePreliminary,
  resolveSurvey,
  surveyFromMeasurement,
  surveyStats,
} from '../types/survey';

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

/*
 * ДЛИНА БЕРЁТСЯ У ДЕМО-РЯДА, а не задаётся здесь числом.
 *
 * Проёмы и коммуникации приёмка и так берёт из демо-данных. Держать рядом
 * с ними СВОЮ длину значит собирать ряд, которого нигде не существует:
 * когда демо-стена выросла с 3200 до 3800, окно и вывод воды переехали
 * вместе с ней, а длина осталась старой — и вытяжка пропала из ряда,
 * потому что над варочной не осталось свободной стены.
 */
const baseInput = {
  lengthMm: DEMO_PROJECT.lengthMm,
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

  /*
   * ОЖИДАНИЕ ИЗМЕНИЛОСЬ.
   *
   * Раньше здесь стояло «ряд разорван на ДВА участка»: до окна и после.
   * Участок до окна (0…1200) на этом ряду целиком занят холодильной и
   * духовой колоннами во всю высоту — верхнего ряда там быть не может,
   * и он больше не строится. Проверять число участков вообще неверно:
   * оно зависит от состава. Проверяем то, ради чего разрыв и существует.
   */
  const crosses = run.upperSegments.some(
    (s) => s.fromMm < windowTo && s.toMm > windowFrom,
  );
  check('ни один участок не заходит на окно', !crosses, `окно ${windowFrom}..${windowTo}`);

  const tallSpans = run.modules
    .filter((m) => m.kind === 'tall')
    .map((m) => ({ from: m.offsetMm, to: m.offsetMm + m.widthMm }));
  const overTall = run.upperSegments.some((s) =>
    tallSpans.some((t) => s.fromMm < t.to && s.toMm > t.from),
  );
  check(
    'и ни один не заходит на пенал во всю высоту',
    !overTall,
    `пеналы ${tallSpans.map((t) => `${t.from}..${t.to}`).join(' ') || 'нет'} · ` +
      `участки ${run.upperSegments.map((s) => `${s.fromMm}..${s.toMm}`).join(' | ')}`,
  );

  check(
    'на свободной стене верхний ряд остался',
    run.upperSegments.length > 0,
    run.upperSegments.map((s) => `${s.fromMm}..${s.toMm}`).join(' | '),
  );

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

  /*
   * ТЕСНЫЙ РЯД СОБИРАЕТСЯ ЗДЕСЬ, а не берётся у демонстрации.
   *
   * Раньше сценарий «прибору не хватило места» держался на том, что
   * демо-стена 3200 мм была забита техникой вплотную. Стена выросла до
   * 3800 — и выпадать стало нечему: проверка позеленела, перестав что-либо
   * проверять. Тесноту, которую тест изучает, он обязан создавать сам.
   */
  const narrow = { ...baseInput, lengthMm: 2400 };
  const narrowAuto = buildRun(narrow);
  const tight = buildRun({
    ...narrow,
    requirements: { ...REQ, manualAnchors: { hob: 700 } },
  });
  const cost = manualAnchorCost(narrowAuto, tight);
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

/* ─────────────────────  Галерея решений  ───────────────────── */

console.log('\nГалерея решений');
{
  const WALL = 3200;

  /*
   * Карточка галереи собирается ТЕМ ЖЕ `buildRun`, что и чертёж после
   * выбора. Отдельной «картинки решения» не существует намеренно: она
   * разошлась бы с чертежом на первой же правке раскладки.
   */
  const mainStrategy = DEFAULT_STRATEGIES.find((s) => s.key === MAIN_VARIANT)!;

  /*
   * Карточка собирается ровно так же, как галерея: с комплектацией.
   * Считай её без стратегии — и проверка перестанет видеть то, что видит
   * пользователь: два решения, дающие одну и ту же мебель.
   */
  const cardRun = (template: (typeof RUN_TEMPLATES)[number]) =>
    buildRun({
      lengthMm: WALL,
      ceilingHeightMm: 2700,
      requirements: withStrategy(requirementsFromTemplate(template), mainStrategy),
      openings: [],
      comms: [],
    });

  const fitting = templatesForZone('kitchen').filter((t) => templateFits(t, WALL));
  check('на стене 3200 мм есть из чего выбрать', fitting.length >= 3, `${fitting.length} решений`);

  const picked = fitting[0];
  const preview = cardRun(picked);
  const afterPick = buildRun({
    lengthMm: WALL,
    ceilingHeightMm: 2700,
    requirements: withStrategy(requirementsFromTemplate(picked), mainStrategy),
    openings: [],
    comms: [],
  });

  check(
    'макет карточки совпадает с чертежом после выбора',
    preview.fingerprint === afterPick.fingerprint,
    `${preview.fingerprint} против ${afterPick.fingerprint}`,
  );

  /*
   * Решение, которое не собирается на этой стене, не показывается вовсе:
   * карточка, которая не соберётся, хуже её отсутствия.
   */
  const tooLong = templatesForZone('kitchen').find((t) => t.minLengthMm > WALL);
  if (tooLong) {
    check(
      'решение длиннее стены в галерею не попадает',
      !templateFits(tooLong, WALL),
      `${tooLong.name}: от ${tooLong.minLengthMm} мм`,
    );
  }

  // Десяток решений на зону: столько же, сколько в голове у мебельщика.
  for (const zone of ZONE_ORDER) {
    const list = templatesForZone(zone);
    check(
      `${zoneProfile(zone).title}: решений хватает на разговор`,
      list.length >= 4,
      `${list.length} шт.`,
    );
  }

  /*
   * Ни одного чужого решения: в спальне не бывает кухонных, и наоборот.
   * То же правило, что на шаге «Состав».
   */
  check(
    'в спальне нет кухонных решений',
    templatesForZone('bedroom').every((t) => t.appliances.length === 0),
    templatesForZone('bedroom').map((t) => t.name).join(', '),
  );
  check(
    'а на кухне — шкафных',
    templatesForZone('kitchen').every((t) => (t.sections ?? []).length === 0),
  );

  /* ── Разные решения — разная мебель ── */

  const prints = fitting.map((t) => cardRun(t).fingerprint);
  check(
    'разные карточки дают разную мебель',
    new Set(prints).size === prints.length,
    prints.join(' '),
  );

  const totals = fitting.map((t) => buildEstimate(cardRun(t), MAIN_VARIANT, DEMO_RATES).total);
  check('у каждой карточки своя цена', new Set(totals).size === totals.length);
  check(
    'и разница с текущим считается той же сметой',
    Math.round(totals[1] - totals[0]) !== 0,
    `${Math.round(totals[1] - totals[0])} ₸`,
  );

  /* ── Своё решение компании ── */

  const own = parseOrgTemplates([
    {
      id: 'own-1',
      name: 'Наша базовая',
      zone: 'bedroom',
      minLengthMm: 1600,
      maxLengthMm: 3600,
      appliances: [],
      sections: ['hanging_long', 'shelves', 'drawers'],
      doorSystem: 'sliding',
      tallSide: 'left',
    },
  ]);

  /*
   * Решение без техники раньше молча пропадало при сохранении: разбор
   * требовал приборов. Шкаф собирается секциями — и это тоже решение.
   */
  check('своё решение без техники сохраняется', own.length === 1, `${own.length}`);
  check('и остаётся в своей зоне', own[0]?.zone === 'bedroom');
  check('вместе с составом секций', (own[0]?.sections ?? []).length === 3);
  check('и системой дверей', own[0]?.doorSystem === 'sliding');
  check('оно идёт первым в списке зоны', templatesForZone('bedroom', own)[0]?.id === own[0]?.id);

  const emptyOne = parseOrgTemplates([
    { id: 'x', name: 'Пустое', minLengthMm: 1000, maxLengthMm: 2000, appliances: [], sections: [] },
  ]);
  check('решение без техники и без секций не сохраняется', emptyOne.length === 0);
}

/* ─────────────────────  Варианты мест  ───────────────────── */

console.log('\nВарианты мест');
{
  // Без окна: верхний ряд сплошной, над мойкой есть шкаф.
  const run = buildRun({
    lengthMm: 3200,
    ceilingHeightMm: 2700,
    requirements: REQ,
    openings: [],
    comms: [],
  });

  const upper = run.upperSegments.flatMap((segment) => segment.modules);
  const sink = run.modules.find((m) => m.appliance?.startsWith('sink'))!;

  /*
   * Верхний ряд выравнивается по мойке: в шкаф над ней ставят сушилку,
   * и он обязан совпадать с мойкой по ширине. Раньше ряд заполнялся
   * широкими стандартами, накрывал мойку модулем на 1025 мм — вариант
   * существовал, а места под него не было.
   */
  const overSink = upper.find(
    (m) => m.offsetMm === sink.offsetMm && m.widthMm === sink.widthMm,
  );
  check('над мойкой есть свой шкаф той же ширины', Boolean(overSink),
    upper.map((m) => `${m.offsetMm}:${m.widthMm}`).join(' '));

  const dryerHere = variantsForModule(overSink!, run).some((v) => v.kind === 'upper_dryer');
  check('и в нём предлагается сушилка', dryerHere);

  const elsewhere = upper.find((m) => m.id !== overSink!.id && !m.appliance)!;
  check(
    'а в других местах сушилки нет вовсе',
    !variantsForModule(elsewhere, run).some((v) => v.kind === 'upper_dryer'),
    variantsForModule(elsewhere, run).map((v) => v.title).join(', '),
  );

  // Вытяжка привязана к варочной и вариантом не выбирается.
  const hood = upper.find((m) => m.appliance === 'hood')!;
  check('у техники вариантов нет', variantsForModule(hood, run).length === 0);

  /*
   * Ни одного варианта, который не влезает по ширине: серая кнопка —
   * это вопрос «почему нельзя», а задавать его на встрече некому.
   */
  const tooNarrow = upper.find((m) => m.widthMm < 600 && !m.appliance);
  if (tooNarrow) {
    check(
      'в узкое место сушилка не предлагается',
      !variantsForModule(tooNarrow, run).some((v) => v.kind === 'upper_dryer'),
      `${tooNarrow.widthMm} мм`,
    );
  }

  /* ── Карго вместо мёртвого места ── */

  const narrow = run.modules.find((m) => !m.appliance && m.widthMm <= CARGO_MAX_MM);
  check(
    'узкий остаток стал карго, а не глухой дверцей',
    narrow?.variant === 'cargo',
    `${narrow?.widthMm} мм · ${narrow?.label}`,
  );
  check('и подписан как карго', narrow?.label === 'Карго');

  const estimate = buildEstimate(run, MAIN_VARIANT, DEMO_RATES);
  const cargoLine = estimate.lines.find((l) => l.key === 'cargo_150');
  check('механизм карго попал в смету', (cargoLine?.quantity ?? 0) > 0,
    `${cargoLine?.quantity} шт · ${cargoLine?.total} ₸`);

  // Уже 150 мм карго не бывает: такой огрызок прирастает к соседу.
  const tiny = buildRun({
    lengthMm: 2530,
    ceilingHeightMm: 2700,
    requirements: { ...REQ, appliances: ['sink600', 'hob', 'hood'] },
    openings: [],
    comms: [],
  });
  check(
    'остаток уже 150 мм карго не становится',
    tiny.modules.every((m) => m.variant !== 'cargo' || m.widthMm >= CARGO_MIN_MM),
    tiny.modules.map((m) => `${m.widthMm}${m.variant ? ':' + m.variant : ''}`).join(' '),
  );

  /* ── Модуль под мойку ── */

  check('у модуля мойки нет дна', !hasBottom(sink));
  check('а у обычного есть', hasBottom(run.modules.find((m) => !m.appliance)!));

  const sinkPanels = buildPanels({ run }).filter((panel) => panel.moduleId === sink.id);
  check(
    'дно не уходит в раскрой',
    !sinkPanels.some((panel) => panel.name === 'Дно'),
    sinkPanels.map((p) => p.name).join(', '),
  );
  check(
    'и работа по нему есть в смете',
    (estimate.lines.find((l) => l.key === 'sink_base')?.quantity ?? 0) === 1,
  );

  /* ── Выбор варианта ── */

  const before = buildEstimate(run, MAIN_VARIANT, DEMO_RATES).total;
  const withDryer = applyOps({
    run,
    requirements: REQ,
    ops: [{ op: 'set_variant', moduleId: overSink!.id, variant: 'upper_dryer' }],
  });

  check('вариант применился', withDryer.warnings.length === 0, withDryer.warnings.join(' | '));
  check(
    'сушилка сохранилась после пересборки верхнего ряда',
    withDryer.upperSegments
      .flatMap((segment) => segment.modules)
      .some((m) => m.variant === 'upper_dryer'),
  );
  check(
    'отпечаток изменился: это другая мебель',
    withDryer.fingerprint !== run.fingerprint,
    `${run.fingerprint} → ${withDryer.fingerprint}`,
  );

  const after = buildEstimate(withDryer, MAIN_VARIANT, DEMO_RATES).total;
  check('и цена выросла на механизм', after > before, `+${Math.round(after - before)} ₸`);

  /* ── Чужое место ── */

  const refused = applyOps({
    run,
    requirements: REQ,
    ops: [{ op: 'set_variant', moduleId: elsewhere.id, variant: 'upper_dryer' }],
  });
  check(
    'в чужое место вариант не встаёт',
    !refused.upperSegments
      .flatMap((segment) => segment.modules)
      .some((m) => m.id === elsewhere.id && m.variant === 'upper_dryer'),
  );
  check(
    'и отказ назван словами',
    refused.warnings.some((w) => w.includes('не встаёт')),
    refused.warnings.join(' | ') || 'предупреждений нет',
  );

  /* ── Ручная расстановка переживает смену варианта ── */

  const manual = buildRun({
    lengthMm: 3200,
    ceilingHeightMm: 2700,
    requirements: { ...REQ, manualAnchors: { hob: 2000 } },
    openings: [],
    comms: [],
  });
  const hobAt = (r: typeof manual) => {
    const unit = r.modules.find((m) => m.appliance === 'hob');
    return unit ? unit.offsetMm + unit.widthMm / 2 : null;
  };
  const narrowThere = manual.modules.find((m) => !m.appliance && m.widthMm >= 300);

  if (narrowThere) {
    const changed = applyOps({
      run: manual,
      requirements: { ...REQ, manualAnchors: { hob: 2000 } },
      ops: [{ op: 'set_variant', moduleId: narrowThere.id, variant: 'drawers' }],
    });
    check(
      'смена варианта не сбрасывает ручную расстановку',
      hobAt(changed) === hobAt(manual),
      `${hobAt(manual)} → ${hobAt(changed)}`,
    );
  }

  /* ── Зона ── */

  const bedroom = buildRun({
    lengthMm: 3200,
    ceilingHeightMm: 2700,
    requirements: {
      ...REQ,
      zone: 'bedroom',
      appliances: [],
      sections: ['hanging_long', 'shelves'],
      options: { ...REQ.options, hasUpper: false },
    },
    openings: [],
    comms: [],
  });

  const kitchenOnly = bedroom.modules.flatMap((unit) =>
    variantsForModule(unit, bedroom, 'bedroom').map((v) => v.kind),
  );
  check(
    'в спальне не предлагается ни одного кухонного варианта',
    !kitchenOnly.some((kind) =>
      ['cargo', 'sink_base', 'hob_base', 'upper_dryer', 'corner_carousel'].includes(kind),
    ),
    Array.from(new Set(kitchenOnly)).join(', ') || 'вариантов нет',
  );
}

/* ─────────────────  Угловые и П-образные кухни  ───────────────── */

console.log('\nКомпозиция: угол и П');
{
  const REQ_L: RunRequirements = { ...REQ, composition: 'corner_l' };
  const WALLS = [
    { id: 'w1', lengthMm: 3200 },
    { id: 'w2', lengthMm: 2400 },
  ];

  const corner = buildComposition({
    kind: 'corner_l',
    walls: WALLS,
    ceilingHeightMm: 2700,
    requirements: REQ_L,
  });

  /*
   * ГЛАВНЫЙ ИНВАРИАНТ УГЛА: второй ряд короче своей стены. Без этого
   * модули в углу физически налезают друг на друга, и вскрывается это
   * на монтаже — когда мебель уже распилена.
   */
  const [a, b] = corner.segments;
  check('первый ряд занимает свою стену целиком', a.run.lengthMm === 3200);
  check(
    'второй ряд короче стены на глубину соседа и фальш-панель',
    b.run.lengthMm === 2400 - ZONE_PROFILES.kitchen.depthMm - CORNER.falsePanelMm,
    `${b.run.lengthMm} мм при стене ${b.wallLengthMm}`,
  );

  check(
    'сумма ширин каждого ряда сходится со своей длиной',
    corner.segments.every((segment) => runWidthSum(segment.run) === segment.run.lengthMm),
  );

  /*
   * Приборы РАСПРЕДЕЛЯЮТСЯ, а не дублируются: мойка одна на всю кухню.
   * Две мойки — это лишние деньги в смете и кухня, которой не бывает.
   */
  const placed = corner.segments.flatMap((segment) =>
    segment.run.modules.flatMap((unit) => moduleAppliances(unit)),
  );
  const doubled = placed.filter((item, i) => placed.indexOf(item) !== i);
  check('приборы между рядами не дублируются', doubled.length === 0, doubled.join(', '));
  check('мойка одна на всю кухню', placed.filter((x) => x.startsWith('sink')).length === 1);

  // Пеналы на короткой стене, мокрая группа на длинной — рабочий треугольник.
  const shortWall = corner.segments[1].run.modules.map((m) => m.appliance);
  check(
    'пеналы ушли на короткую стену',
    shortWall.includes('fridge') && shortWall.includes('oven'),
    shortWall.filter(Boolean).join(', '),
  );
  const longWall = corner.segments[0].run.modules.map((m) => m.appliance);
  check(
    'мойка и варочная — на длинной',
    longWall.includes('sink600') && longWall.includes('hob'),
    longWall.filter(Boolean).join(', '),
  );

  /* ── Два решения угла ── */

  const withModule = buildComposition({
    kind: 'corner_l',
    walls: WALLS,
    ceilingHeightMm: 2700,
    requirements: { ...REQ_L, cornerSolution: 'corner_module' },
  });

  check(
    'угловой модуль занимает 900 и по второй стене тоже',
    withModule.segments[1].run.lengthMm === 2400 - CORNER_SIZE_MM,
    `${withModule.segments[1].run.lengthMm} мм`,
  );
  check(
    'и стоит в углу первого ряда',
    withModule.segments[0].run.modules.some((m) => m.kind === 'corner_base'),
  );
  check(
    'при фальш-панели углового модуля нет вовсе',
    !corner.segments[0].run.modules.some((m) => m.kind === 'corner_base'),
  );
  check(
    'по умолчанию угол решается фальш-панелью: она дешевле',
    corner.corners[0].solution === 'false_panel',
  );
  check(
    'у угла названы петля и зазор',
    corner.corners[0].hingeAngleDeg === CORNER.hingeAngleDeg &&
      corner.corners[0].frontGapMm === CORNER.frontGapMm,
    `петля ${corner.corners[0].hingeAngleDeg}°, зазор ${corner.corners[0].frontGapMm} мм`,
  );

  /*
   * Смена решения угла — это другая мебель и другие деньги: чертёж,
   * смета и рендер обязаны это заметить.
   */
  check(
    'отпечаток композиции меняется вместе с решением угла',
    withModule.fingerprint !== corner.fingerprint,
    `${corner.fingerprint} против ${withModule.fingerprint}`,
  );

  /* ── Детерминизм ── */

  const again = buildComposition({
    kind: 'corner_l',
    walls: WALLS,
    ceilingHeightMm: 2700,
    requirements: REQ_L,
  });
  check('два прогона дают одну композицию', again.fingerprint === corner.fingerprint);
  check(
    'и побайтово те же ряды',
    JSON.stringify(again.segments.map((s) => s.run.modules)) ===
      JSON.stringify(corner.segments.map((s) => s.run.modules)),
  );

  /* ── Стена короче глубины соседа ── */

  let overlapped = false;
  try {
    buildComposition({
      kind: 'corner_l',
      walls: [
        { id: 'w1', lengthMm: 3200 },
        { id: 'w2', lengthMm: 600 },
      ],
      ceilingHeightMm: 2700,
      requirements: REQ_L,
    });
  } catch (err) {
    overlapped = err instanceof CornerOverlapError;
  }
  check('наложение в углу — исключение, а не предупреждение', overlapped);

  // Одна стена вместо двух: угол по одной стене не собирается вовсе.
  let refusedShape = false;
  try {
    buildComposition({
      kind: 'corner_l',
      walls: [{ id: 'w1', lengthMm: 3200 }],
      ceilingHeightMm: 2700,
      requirements: REQ_L,
    });
  } catch {
    refusedShape = true;
  }
  check('угол по одной стене не собирается', refusedShape);

  /* ── П-образная ── */

  const uShape = buildComposition({
    kind: 'u_shape',
    walls: [
      { id: 'w1', lengthMm: 3200 },
      { id: 'w2', lengthMm: 2600 },
      { id: 'w3', lengthMm: 3000 },
    ],
    ceilingHeightMm: 2700,
    requirements: { ...REQ, composition: 'u_shape' },
  });

  check('П-образная собирается из трёх рядов', uShape.segments.length === 3);
  check('и имеет два угла', uShape.corners.length === 2);
  check(
    'каждый ряд сходится со своей длиной',
    uShape.segments.every((segment) => runWidthSum(segment.run) === segment.run.lengthMm),
  );

  const narrow = buildComposition({
    kind: 'u_shape',
    walls: [
      { id: 'w1', lengthMm: 3200 },
      { id: 'w2', lengthMm: 1600 },
      { id: 'w3', lengthMm: 3000 },
    ],
    ceilingHeightMm: 2700,
    requirements: { ...REQ, composition: 'u_shape' },
  });
  check(
    'узкий проход между рядами назван последствием',
    narrow.warnings.some((w) => w.includes('не разойтись')),
    narrow.warnings.join(' | ') || 'предупреждений нет',
  );

  /* ── Прямой ряд как композиция ── */

  const linear = linearComposition(buildRun(baseInput));
  check('прямой ряд — тоже композиция', linear.segments.length === 1 && linear.corners.length === 0);
  check('и у него свой отпечаток', linear.fingerprint.length === 8);
}

/* ─────────────────────  Состав по зоне  ───────────────────── */

console.log('\nСостав по зоне');
{
  /*
   * Шаг «Состав» долго оставался кухонным: в шкафу-купе предлагались мойка
   * и посудомойка. Замерщик видит кнопки, которых там быть не может, и
   * перестаёт доверять экрану — а он показывает этот экран клиенту.
   */
  check(
    'на кухне доступна вся техника',
    zoneAppliances('kitchen').length === Object.keys(APPLIANCE_SLOTS).length,
    `${zoneAppliances('kitchen').length} приборов`,
  );

  for (const zone of ZONE_ORDER.filter((z) => z !== 'kitchen')) {
    check(
      `в зоне «${zoneProfile(zone).title}» техники нет вовсе`,
      zoneAppliances(zone).length === 0,
      zoneAppliances(zone).join(', '),
    );
  }

  check('в спальне мойки не бывает', !allowsAppliance('bedroom', 'sink600'));
  check('и посудомойки тоже', !allowsAppliance('bedroom', 'dishwasher45'));
  check('а на кухне бывает', allowsAppliance('kitchen', 'sink600'));

  // Секции — наоборот: они есть везде, кроме кухни.
  check('у кухни секций нет', zoneProfile('kitchen').sections.length === 0);
  check(
    'в прихожей есть крючки, обувница, скамья и зеркало',
    ['hooks', 'shoes', 'bench', 'mirror'].every((s) =>
      allowsSection('hallway', s as SectionKind),
    ),
    zoneProfile('hallway').sections.join(', '),
  );
  check('витрина бывает в спальне', allowsSection('bedroom', 'glass_display'));
  check('но штанги в санузле не бывает', !allowsSection('bathroom', 'hanging_long'));

  /* ── Отказ называет причину ── */

  const refusal = applianceRefusal('bedroom', 'dishwasher45');
  check(
    'отказ объясняет мир, а не говорит «не могу»',
    refusal.includes('В спальне') && refusal.toLowerCase().includes('посудомойка'),
    refusal,
  );

  /* ── Движок не пускает чужое ── */

  const bedroom = buildRun({
    lengthMm: 3200,
    ceilingHeightMm: 2700,
    requirements: {
      ...REQ,
      zone: 'bedroom',
      appliances: [],
      sections: ['hanging_long', 'shelves', 'drawers'],
      options: { ...REQ.options, hasUpper: false },
    },
    openings: [],
    comms: [],
  });

  const hacked = applyOps({
    run: bedroom,
    requirements: { ...REQ, zone: 'bedroom', appliances: [] },
    ops: [{ op: 'add_module', kind: 'base', appliance: 'dishwasher45' }],
  });

  check(
    'операция с кухонным прибором в спальне отклонена',
    !hacked.modules.some((m) => m.appliance === 'dishwasher45'),
  );
  check(
    'и отказ назван словами',
    hacked.warnings.some((w) => w.toLowerCase().includes('посудомойка')),
    hacked.warnings.join(' | ') || 'предупреждений нет',
  );
  check('ряд при этом остался целым', runWidthSum(hacked) === hacked.lengthMm);

  // Своя секция меняется, чужая — нет.
  const changed = applyOps({
    run: bedroom,
    requirements: { ...REQ, zone: 'bedroom', appliances: [] },
    ops: [{ op: 'set_section', moduleId: bedroom.modules[0].id, section: 'shelves' }],
  });
  check(
    'секция своей зоны меняется',
    changed.modules[0].section === 'shelves',
    String(changed.modules[0].section),
  );
  check(
    'и наполнение пересчитывается под неё',
    (changed.modules[0].fill?.shelves.length ?? 0) > 0,
  );

  const foreign = applyOps({
    run: bedroom,
    requirements: { ...REQ, zone: 'bedroom', appliances: [] },
    ops: [{ op: 'set_section', moduleId: bedroom.modules[0].id, section: 'vanity' }],
  });
  check(
    'секция чужой зоны отклонена',
    foreign.modules[0].section !== 'vanity',
    String(foreign.modules[0].section),
  );
  check(
    'с объяснением',
    foreign.warnings.some((w) => w.toLowerCase().includes('тумба под раковину')),
    foreign.warnings.join(' | '),
  );

  /* ── Переключатели тоже по зоне ── */

  check('верхний ряд настраивается только на кухне', zoneOptions('kitchen').upperRow);
  check(
    'в шкафу-купе переключателя верхнего ряда нет',
    !zoneOptions('bedroom').upperRow,
    'он там ничего не менял бы: высоту задаёт профиль зоны',
  );
  check('двери-купе предлагаются в спальне и прихожей',
    zoneOptions('bedroom').doorSystem && zoneOptions('hallway').doorSystem);
  check('и не предлагаются на кухне', !zoneOptions('kitchen').doorSystem);
  check(
    'столешница настраивается там, где она есть',
    zoneOptions('kitchen').countertop && !zoneOptions('bedroom').countertop,
  );
}

/* ─────────────────  Размеры со схемы и автопроект  ───────────────── */

console.log('\nРазмеры со схемы');
{
  /*
   * Схема застройщика — масштабный чертёж. Комната 3200 × 3700 мм на нём
   * занимает какой-то прямоугольник в пикселях; площадь из объявления
   * известна — значит масштаб выводится, а из него длина любой стены.
   */
  const KITCHEN_W = 3200;
  const KITCHEN_H = 3700;
  const areaM2 = (KITCHEN_W * KITCHEN_H) / 1_000_000;

  // Пусть на схеме комната занимает 320 × 370 px: масштаб ровно 10 мм/px.
  const square: PlanPoint[] = [
    { x: 100, y: 100 },
    { x: 420, y: 100 },
    { x: 420, y: 470 },
    { x: 100, y: 470 },
  ];

  check('площадь контура считается формулой шнурков', polygonAreaPx(square) === 320 * 370);
  check(
    'обводка по часовой и против даёт одну площадь',
    polygonAreaPx([...square].reverse()) === polygonAreaPx(square),
  );

  const mmPerPx = mmPerPxFromArea(polygonAreaPx(square), areaM2);
  check('масштаб выводится из площади', mmPerPx !== null && Math.abs(mmPerPx - 10) < 0.001,
    String(mmPerPx));

  const size = polygonSizeMm(square, mmPerPx!);
  check(
    'габариты комнаты сходятся с объявлением',
    size.widthMm === KITCHEN_W && size.heightMm === KITCHEN_H,
    `${size.widthMm} × ${size.heightMm}`,
  );
  check(
    'расхождение с объявлением нулевое на точной обводке',
    calibrationDriftPercent(square, mmPerPx!, areaM2) === 0,
  );

  // Промах углом на 5 % площади обязан быть виден человеку.
  const sloppy: PlanPoint[] = [
    { x: 100, y: 100 },
    { x: 436, y: 100 },
    { x: 436, y: 470 },
    { x: 100, y: 470 },
  ];
  check(
    'кривая обводка показывает расхождение',
    calibrationDriftPercent(sloppy, mmPerPx!, areaM2) >= 4,
    `${calibrationDriftPercent(sloppy, mmPerPx!, areaM2)} %`,
  );

  check('вырожденный контур масштаба не даёт', mmPerPxFromArea(0, areaM2) === null);
  check('нулевая площадь из объявления тоже', mmPerPxFromArea(1000, 0) === null);

  /* ── Длина стены и проёмы ── */

  const wallFrom: PlanPoint = { x: 100, y: 100 };
  const wallTo: PlanPoint = { x: 420, y: 100 };
  check(
    'длина стены выводится из масштаба',
    planLengthMm(wallFrom, wallTo, mmPerPx!) === KITCHEN_W,
    String(planLengthMm(wallFrom, wallTo, mmPerPx!)),
  );

  // Клики по краям окна проецируются на стену: попасть точно в линию нельзя.
  const opening = openingOnWall(
    { from: wallFrom, to: wallTo },
    { x: 200, y: 112 },
    { x: 300, y: 96 },
    mmPerPx!,
  );
  check(
    'проём проецируется на стену',
    opening?.fromCornerMm === 1000 && opening?.widthMm === 1000,
    JSON.stringify(opening),
  );
  check(
    'промах мышью в пару сантиметров окном не считается',
    openingOnWall({ from: wallFrom, to: wallTo }, { x: 200, y: 100 }, { x: 202, y: 100 }, mmPerPx!) ===
      null,
  );
  check(
    'проём за краем стены обрезается по стене',
    (openingOnWall(
      { from: wallFrom, to: wallTo },
      { x: 60, y: 100 },
      { x: 200, y: 100 },
      mmPerPx!,
    )?.fromCornerMm ?? -1) === 0,
  );

  /* ── Стена со схемы идёт в обычный конвейер ── */

  const wall: DerivedWall = {
    zone: 'kitchen',
    from: wallFrom,
    to: wallTo,
    lengthMm: KITCHEN_W,
    openings: [{ kind: 'window', fromCornerMm: 1000, widthMm: 1000 }],
  };

  const measurement = measurementFromWall(wall);
  check('стена со схемы становится замером для движка', measurement.walls[0].lengthMm === KITCHEN_W);
  check('и проём едет вместе с ней', measurement.walls[0].openings.length === 1);
  check(
    'у окна появляется отраслевая высота: на плане её нет физически',
    measurement.walls[0].openings[0].sillMm === 850,
  );

  const scheme: FloorPlan = {
    id: 'p-scheme',
    complexId: 'c1',
    slug: '3k-90-5',
    code: '3К-90.5',
    rooms: 3,
    areaM2: 90.5,
    roomAreas: [{ name: 'Кухня', areaM2 }],
    zones: [],
    derivedWalls: [wall],
    calibration: {
      mmPerPx: mmPerPx!,
      basisRoom: 'Кухня',
      basisAreaM2: areaM2,
      basisPolygon: square,
      calibratedAt: '2026-08-30T10:00:00.000Z',
    },
    toleranceMm: DEFAULT_TOLERANCE_MM,
    isPublic: true,
  };

  /*
   * ТРИ СОСТОЯНИЯ, а не два: заведена, размеры со схемы, обмерена.
   * Обещания у них разные, и путать их нельзя.
   */
  check('планировка со схемой не считается обмеренной', !isMeasured(scheme));
  check('но размеры со схемы у неё есть', hasSchemeSizes(scheme));
  check('источник размеров зоны — схема', sizeSourceFor(scheme, 'kitchen') === 'scheme');
  check('длина ряда берётся со схемы', zoneRunLengthMm(scheme, 'kitchen') === KITCHEN_W);
  check(
    'допуск схемы — сто миллиметров, а не тридцать',
    planToleranceMm(scheme, 'kitchen') === SCHEME_TOLERANCE_MM,
    `${planToleranceMm(scheme, 'kitchen')} мм`,
  );
  check(
    'основание названо словами',
    (sizeBasis(scheme, 'kitchen') ?? '').includes('со схемы'),
    sizeBasis(scheme, 'kitchen') ?? '',
  );

  /* ── Настоящий замер сильнее ── */

  const surveyed: FloorPlan = {
    ...scheme,
    zones: [{ zone: 'kitchen', measurement: DEMO_MEASUREMENT }],
    measuredAt: '2026-09-01T09:00:00.000Z',
    measuredBy: 'Ержан',
  };

  check('замер вытесняет схему как источник', sizeSourceFor(surveyed, 'kitchen') === 'survey');
  check(
    'и длина берётся из замера, а не со схемы',
    zoneRunLengthMm(surveyed, 'kitchen') === DEMO_MEASUREMENT.walls[0].lengthMm,
    String(zoneRunLengthMm(surveyed, 'kitchen')),
  );
  check(
    'допуск возвращается к тридцати миллиметрам',
    planToleranceMm(surveyed, 'kitchen') === DEFAULT_TOLERANCE_MM,
  );
  check(
    'основание тоже меняется на замер',
    (sizeBasis(surveyed, 'kitchen') ?? '').includes('замер'),
  );

  /* ── Подстановка со схемы — допущения ── */

  const survey = surveyFromMeasurement(measurement, sizeBasis(scheme, 'kitchen')!, '', '');
  const stats = surveyStats(survey);
  check('величины со схемы не считаются замеренными', stats.measured === 0);
  check('и смета по ним предварительная', isEstimatePreliminary(stats));

  /* ── Автопроект ── */

  console.log('\nАвтопроект');

  const auto = buildAutoProjects({ plan: scheme, rates: DEMO_RATES });
  const kitchen = auto.projects.find((p) => p.zone === 'kitchen');

  check('по стене со схемы собирается проект', Boolean(kitchen), auto.blocked ?? '');
  check('ряд собран на длину со схемы', kitchen?.run.lengthMm === KITCHEN_W);
  check('и сходится с ней до миллиметра', kitchen ? runWidthSum(kitchen.run) === KITCHEN_W : false);
  check('цена посчитана', (kitchen?.estimate.total ?? 0) > 0);
  check('источник размеров помечен схемой', kitchen?.sizeSource === 'scheme');
  check(
    'смета посчитана по тому же ряду',
    kitchen?.estimate.fingerprint === kitchen?.run.fingerprint,
  );

  /*
   * Считает ТОТ ЖЕ код, что у замерщика: две ветки расчёта разошлись бы,
   * и предварительная цена отличалась бы от итоговой не из-за размеров,
   * а из-за двух калькуляторов.
   */
  const sameByHand = buildRun({
    lengthMm: KITCHEN_W,
    ceilingHeightMm: measurement.ceilingHeightMm,
    requirements: kitchen!.run.options
      ? {
          ...requirementsFromTemplate(
            RUN_TEMPLATES.find((t) => t.id === kitchen!.templateId)!,
          ),
          options: kitchen!.run.options,
        }
      : requirementsFromTemplate(RUN_TEMPLATES.find((t) => t.id === kitchen!.templateId)!),
    openings: measurement.walls[0].openings,
    comms: [],
  });
  check(
    'автопроект собран тем же buildRun, что и вручную',
    sameByHand.fingerprint === kitchen!.run.fingerprint,
    `${sameByHand.fingerprint} против ${kitchen!.run.fingerprint}`,
  );

  // Один автопроект на зону: выбор из трёх выдуманных хуже одного честного.
  check(
    'на зону ровно один автопроект',
    auto.projects.filter((p) => p.zone === 'kitchen').length === 1,
  );

  /* ── Без масштаба и без ставок не считаем ── */

  const bare: FloorPlan = { ...scheme, calibration: undefined, derivedWalls: [] };
  check(
    'без размеров автопроект не собирается вовсе',
    Boolean(buildAutoProjects({ plan: bare, rates: DEMO_RATES }).blocked),
    buildAutoProjects({ plan: bare, rates: DEMO_RATES }).blocked ?? '',
  );
  check(
    'и без ставок каталога тоже: нули с виду настоящей цены',
    Boolean(buildAutoProjects({ plan: scheme, rates: {} }).blocked),
    buildAutoProjects({ plan: scheme, rates: {} }).blocked ?? '',
  );

  /* ── Расход материалов ── */

  /*
   * Мебельщику расход интереснее цены: по нему он мгновенно понимает,
   * сходится ли смета с его практикой. Считается из той же детализировки,
   * что уходит в цех, — второй расчёт разошёлся бы с раскроем.
   */
  const materials = kitchen!.materials;
  check('расход ЛДСП посчитан', materials.ldspM2 > 0, `${materials.ldspM2} м²`);
  check('фасады посчитаны', materials.frontM2 > 0, `${materials.frontM2} м²`);
  check('задние стенки посчитаны', materials.hdfM2 > 0, `${materials.hdfM2} м²`);
  check('кромка посчитана', materials.edgeThickM > 0, `${materials.edgeThickM} м.п.`);
  check('детали посчитаны', materials.count > 0, `${materials.count} шт.`);

  check(
    'расход считается той же детализировкой, что уходит в цех',
    JSON.stringify(materials) ===
      JSON.stringify(panelTotals(buildPanels({ run: kitchen!.run }))),
  );

  // Слишком короткая стена: шаблона нет — не выдумываем.
  const tiny: FloorPlan = {
    ...scheme,
    derivedWalls: [{ ...wall, lengthMm: 900, openings: [] }],
  };
  const tinyResult = buildAutoProjects({ plan: tiny, rates: DEMO_RATES });
  check('под несобираемую длину проект не выдумывается', tinyResult.projects.length === 0);
  check(
    'и причина названа',
    tinyResult.skipped.some((s) => s.reason.includes('нет подходящего решения')),
    tinyResult.skipped.map((s) => s.reason).join('; '),
  );
}

/* ─────────────────────  Библиотека планировок ЖК  ───────────────────── */

console.log('\nБиблиотека планировок');
{
  const measurement = DEMO_MEASUREMENT;

  const draft: FloorPlan = {
    id: 'p1',
    complexId: 'c1',
    slug: '3k-90-5',
    code: '3К-90.5',
    rooms: 3,
    areaM2: 90.5,
    roomAreas: [
      { name: 'Кухня', areaM2: 11.85 },
      { name: 'Спальня', areaM2: 14.71 },
    ],
    zones: [],
    derivedWalls: [],
    toleranceMm: DEFAULT_TOLERANCE_MM,
    isPublic: true,
  };

  const measured: FloorPlan = {
    ...draft,
    zones: [{ zone: 'kitchen', measurement }],
    measuredAt: '2026-03-12T09:00:00.000Z',
    measuredBy: 'Ержан',
    sourceApartment: 'кв. 42, 5 этаж',
  };

  /*
   * Планировка работает В ДВУХ состояниях. Флага «обмерена» в базе нет
   * намеренно: его забудут переключить, и продукт начнёт обещать проекты,
   * которых не существует.
   */
  check('заведённая планировка не считается обмеренной', !isMeasured(draft));
  check('обмеренная считается', isMeasured(measured));
  check(
    'зоны без даты замера мало',
    !isMeasured({ ...measured, measuredAt: undefined }),
  );
  check(
    'даты без зон тоже мало',
    !isMeasured({ ...measured, zones: [] }),
  );

  check(
    'длина ряда берётся из библиотечного замера',
    planRunLengthMm(planZone(measured, 'kitchen')) === measurement.walls[0].lengthMm,
    String(planRunLengthMm(planZone(measured, 'kitchen'))),
  );
  check(
    'у необмеренной длины ряда нет вовсе',
    planRunLengthMm(planZone(draft, 'kitchen')) === null,
  );

  // Честная строка: дата, квартира и допуск. Её читает и замерщик, и клиент.
  const basis = libraryBasis(measured);
  check(
    'происхождение размеров названо словами',
    basis.includes('кв. 42') && basis.includes('±30'),
    basis,
  );

  /* ── Подстановка размеров: ДОПУЩЕНИЯ, а не замер ── */

  const survey = surveyFromMeasurement(measurement, basis, 'Ержан', '2026-08-30');
  const stats = surveyStats(survey);

  check(
    'ни одна подставленная величина не считается замеренной',
    stats.measured === 0,
    `замеренных ${stats.measured}, допущений ${stats.assumed}`,
  );
  check('и все они помечены как допущения', stats.assumed > 0);
  check(
    'каждое допущение объясняет, откуда взялось',
    stats.assumptions.every((a) => a.basis === basis),
  );
  check(
    'смета по подставленным размерам — предварительная',
    isEstimatePreliminary(stats),
  );

  // Размеры при этом настоящие: ряд собирается той же длины.
  const resolved = resolveSurvey(survey);
  check(
    'подставленная длина стены совпадает с библиотечной',
    resolved.measurement.walls[0].lengthMm === measurement.walls[0].lengthMm,
    `${resolved.measurement.walls[0].lengthMm} против ${measurement.walls[0].lengthMm}`,
  );
  check(
    'проёмы и коммуникации тоже подставлены',
    resolved.measurement.walls[0].openings.length === measurement.walls[0].openings.length &&
      resolved.measurement.comms.length === measurement.comms.length,
  );
  check(
    'шаги замера не отмечены пройденными',
    Object.values(survey.steps).every((state) => state === 'todo'),
  );

  /* ── Готовых проектов на зону не больше трёх ── */

  const project = (id: string, zone: ZoneKind): ReadyProject => ({
    id,
    floorPlanId: 'p1',
    zone,
    title: `Проект ${id}`,
    run: buildRun(baseInput),
    priceSnapshot: {},
    total: 1_000_000,
    isPublic: true,
  });

  const many = [
    project('1', 'kitchen'),
    project('2', 'kitchen'),
    project('3', 'kitchen'),
    project('4', 'kitchen'),
    project('5', 'bedroom'),
  ];

  const shown = limitByZone(many);
  check(
    'на зону показываем не больше трёх',
    shown.filter((p) => p.zone === 'kitchen').length === MAX_READY_PER_ZONE,
    `их ${shown.filter((p) => p.zone === 'kitchen').length}`,
  );
  check(
    'но другая зона от этого не страдает',
    shown.some((p) => p.zone === 'bedroom'),
  );

  /* ── Адрес публичной страницы читается человеком ── */

  check('слаг из русского названия', slugify('ЖК Апельсин') === 'zhk-apelsin', slugify('ЖК Апельсин'));
  check('слаг из кода планировки', slugify('3К-90.5') === '3k-90-5', slugify('3К-90.5'));
  check('казахские буквы тоже переводятся', slugify('Ұлы Дала') === 'uly-dala', slugify('Ұлы Дала'));
  check(
    'второй такой же код не затирает первый',
    uniqueSlug('3К-90.5', ['3k-90-5']) === '3k-90-5-2',
    uniqueSlug('3К-90.5', ['3k-90-5']),
  );
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
  /*
   * БЕЗ ОКНА. Этот блок про то, что витрина не выталкивает технику
   * (ловушка 109), и мерить он должен только конкуренцию за ширину.
   * С окном в ряду терялась вытяжка — но не из-за витрины, а потому что
   * варочная уезжала под проём, а над проёмом верхнего ряда нет. Проверка
   * падала на постороннем поводе и рассказывала не о том.
   */
  const long = { ...baseInput, lengthMm: 3600, openings: [] };

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
        ? { ...unit, fill: moveShelf(unit.fill, 0, 500, moduleCarcassHeightMm(unit, run)).fill }
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
  const tooClose = moveShelf(fill, 0, 690, 2000);
  check('полку нельзя поставить вплотную к соседней', tooClose.fill.shelves[0] === 352);
  /*
   * ОТКАЗ ОБЯЗАН НАЗВАТЬ ПРИЧИНУ. Молчаливый отказ — та самая поломка:
   * замерщик тянет полку, ничего не происходит, и объяснить это нечем.
   */
  check(
    'отказ по соседней полке объясняет себя',
    Boolean(tooClose.rejected) && tooClose.rejected!.includes('704'),
    tooClose.rejected ?? 'молчит',
  );

  const tooHigh = addShelf(fill, 1990, 2000);
  check(
    'полка выше корпуса отклоняется и объясняет себя',
    tooHigh.fill.shelves.length === 2 && Boolean(tooHigh.rejected),
    tooHigh.rejected ?? 'молчит',
  );

  const tooLow = addShelf(fill, 10, 2000);
  check(
    'полка ниже дна отклоняется и объясняет себя',
    tooLow.fill.shelves.length === 2 && Boolean(tooLow.rejected),
    tooLow.rejected ?? 'молчит',
  );

  const added = addShelf(fill, 1200, 2000);
  check('полка добавляется на свободное место', added.fill.shelves.length === 3);
  check('принятая правка молчит', added.rejected === undefined);
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


/* ─────────────────────────  Поверхности: цвет, фактура, текстура  ───────────────────────── */

console.log('\nМатериал меняется мгновенно');
{
  const fallback = { color: '#B9B2A4', roughness: 0.72 };

  const none = surfaceLook(null, fallback);
  check('без артикула поверхность красится цветом по умолчанию',
    none.color === '#B9B2A4' && none.textureUrl === null && none.fromCatalog === false);

  const entry = {
    id: 'x',
    org_id: 'o',
    category_id: 'c',
    article: 'ART-1',
    name_ru: 'Фасад графит',
    name_kk: '',
    description: '',
    price: 1000,
    unit: 'm2',
    dimensions: {},
    tiling: { moduleSize: [0.6, 0.7] },
    meta: { color: '#2E3236', finish: 'gloss' },
    is_active: true,
    category: {
      id: 'c',
      org_id: 'o',
      key: 'kitchen',
      name_ru: '',
      name_kk: '',
      applies_to: 'zone',
      unit: 'm2',
      sort_order: 0,
      is_active: true,
    },
    assets: [],
  } as unknown as Parameters<typeof surfaceLook>[0];

  const gloss = surfaceLook(entry, fallback, [1.2, 0.7]);
  check('цвет берётся из артикула', gloss.color === '#2E3236');
  check('глянец блестит сильнее матового', gloss.roughness < fallback.roughness);
  check('фактура читается из meta.finish', surfaceFinish(entry) === 'gloss');
  check('раскладка даёт число повторов', gloss.repeat[0] >= 1 && gloss.repeat[1] >= 1);

  const milled = surfaceLook(
    { ...entry, meta: { color: '#EFEAE0', finish: 'milled' } } as typeof entry,
    fallback,
  );
  check('фрезерованный фасад просит рельеф, а не цвет', milled.milled === true);

  const broken = surfaceLook(
    { ...entry, meta: { color: 'графит', finish: 'какая-то' } } as typeof entry,
    fallback,
  );
  check('мусор в meta не красит мебель в чёрное',
    broken.color === fallback.color && broken.roughness === fallback.roughness);
}

/* ─────────────────────────  Корпус числами: одна геометрия на сцену  ───────────────────────── */

console.log('\nКорпус описан числами');
{
  const run = buildRun(baseInput);

  const unit = run.modules[0];
  const place = { x: 0, y: 0.1, heightM: 0.82, depthM: 0.56, thicknessM: 0.016 };

  const carcass = carcassBoxes(unit, place);
  check('у корпуса есть боковины, дно, крыша и задняя стенка', carcass.length >= 5);
  check('корпус стоит на своём месте, а не в начале координат',
    carcass.every((box) => box.position[1] >= place.y - 0.001));

  const all = moduleBoxes(unit, place, {
    gapM: 0.003,
    frontThicknessM: 0.018,
    integratedHandles: false,
    cutaway: false,
  });
  check('фасады считаются вместе с корпусом', all.some((box) => box.material === 'front'));
  check('у подвижных деталей есть идентификатор',
    all.filter((box) => box.material === 'front').every((box) => Boolean(box.part)));

  const cut = moduleBoxes(unit, place, {
    gapM: 0.003,
    frontThicknessM: 0.018,
    integratedHandles: false,
    cutaway: true,
  });
  check('в разрезе фасадов нет вовсе', cut.every((box) => box.material !== 'front'));

  const twice = moduleBoxes(unit, place, {
    gapM: 0.003,
    frontThicknessM: 0.018,
    integratedHandles: false,
    cutaway: false,
  });
  check('один и тот же модуль даёт одни и те же числа',
    JSON.stringify(twice) === JSON.stringify(all));
}


/* ─────────────────────────  Смета в пять групп  ───────────────────────── */

console.log('\nСмета сворачивается в пять групп');
{
  const run = buildRun(baseInput);
  const estimate = buildEstimate(run, 'optimal', DEMO_RATES);
  const groups = estimateGroups(estimate);

  check('групп не больше пяти', groups.length <= 5, `${groups.length}`);
  check('пустых групп не показываем', groups.every((g) => g.lines.length > 0));
  check(
    'сумма групп сходится с итогом до тенге',
    Math.round(groupsTotal(groups)) === Math.round(estimate.total),
    `группы ${Math.round(groupsTotal(groups))}, итог ${Math.round(estimate.total)}`,
  );
  check(
    'порядок групп постоянный',
    groups.every((g, i) => GROUP_ORDER.indexOf(g.key) >= (i === 0 ? 0 : GROUP_ORDER.indexOf(groups[i - 1].key))),
  );
  check(
    'ни одна статья не потерялась',
    groups.reduce((sum, g) => sum + g.lines.length, 0) === estimate.lines.length,
  );
  check('доставка и монтаж — своя группа', groups.some((g) => g.key === 'delivery'));
  check(
    'техника не смешана с корпусом',
    groups
      .find((g) => g.key === 'appliances')
      ?.lines.every((l) => l.key.startsWith('appliance_') || l.key === 'sink_base' || l.key === 'faucet') !== false,
  );

  // Снятая галочка не должна оставаться в группе: клиент видит обе цифры.
  const withoutDelivery = buildEstimate(run, 'optimal', DEMO_RATES, ['delivery_install']);
  const off = estimateGroups(withoutDelivery);
  check(
    'снятая строка выпадает и из группы, и из итога',
    Math.round(groupsTotal(off)) === Math.round(withoutDelivery.total),
  );
}

/* ─────────────────────────  Ширина тянется шагом 50 мм  ───────────────────────── */

console.log('\nШирина тянется в сцене');
{
  const run = buildRun(baseInput);
  const unit = run.modules.find((m) => !m.appliance);

  if (!unit) {
    check('в ряду есть модуль без техники', false);
  } else {
    const step = 50;
    /*
     * Тянем в МЕНЬШУЮ сторону: рост может не поместиться в стену, и тогда
     * проверялась бы только отбивка, а не сама правка.
     */
    const wanted = Math.max(MIN_WIDTH, Math.round((unit.widthMm - 137) / step) * step);
    check('шаг перетаскивания кратен 50 мм', wanted % step === 0);

    const over = widthOverflowMm(run, unit.id, wanted, MIN_WIDTH);
    if (over === 0) {
      const next = applyOps({
        run,
        requirements: REQ,
        ops: [{ op: 'set_width', moduleId: unit.id, widthMm: wanted }],
        openings: OPENINGS,
      });
      const moved = next.modules.find((m) => m.id === unit.id);
      check('вытянутая ширина применилась целиком', moved?.widthMm === wanted, `${moved?.widthMm}`);
      check(
        'ряд по-прежнему сходится со стеной',
        runWidthSum(next) === next.lengthMm,
        `${runWidthSum(next)} против ${next.lengthMm}`,
      );
    } else {
      check('перебор ширины отклоняется до применения', over > 0);
    }
  }
}


/* ─────────────────────────  Чертёжный лист  ───────────────────────── */

console.log('\nЧертёжный лист');
{
  const den = 25;
  check('масштаб подписывается как в отрасли', scaleLabel(den) === '1:25');
  check(
    'при 1:25 тысяча миллиметров мебели — сорок миллиметров бумаги',
    Math.abs(1000 / den - 40) < 0.001,
  );
  check(
    'ширина вида считается вместе с полями',
    Math.abs(viewWidthMm(3200, 25) - (3200 / 25) * (740 / 640)) < 0.001,
  );
  check(
    'масштабы только стандартные',
    STANDARD_SCALES.every((d) => [10, 20, 25, 30, 50].includes(d)),
  );

  const field = sheetField('A3');
  check('поле A3 — 400 на 231 мм', field.width === 400 && field.height > 200);
  check('короткий ряд печатается на A4', chooseFormat({ lengthMm: 1800, views: 3 }) === 'A4');
  check('обычный состав идёт на A3', chooseFormat({ lengthMm: 3200, views: 6 }) === 'A3');

  /*
   * ПРАВИЛО ВЫБОРА МАСШТАБА ИЗМЕНИЛОСЬ.
   *
   * Было: «самый крупный масштаб, при котором лист ОДИН». Оно экономило
   * бумагу за счёт читаемости — раскладка «один вид — один блок» не
   * складывается на A3 в одну страницу крупнее 1:50, и фасад трёхметровой
   * кухни выходил 124 мм на поле в 400 мм.
   *
   * Стало: «масштаб не мельче 1:30, листов столько, сколько нужно».
   * Поэтому проверяем ПРЕДЕЛ МЕЛКОСТИ, а не число листов.
   */
  const sizesFor = (d: number) => [
    { id: 'a', title: 'Фасад', widthMm: 3200 / d, heightMm: 2700 / d },
    { id: 'b', title: 'Разрез', widthMm: 1100 / d, heightMm: 2900 / d },
  ];
  const fitted = fitComposition(sizesFor as never, 'A3');
  check(
    'масштаб не мельче предела',
    fitted.den <= MIN_SCALE_DEN,
    `1:${fitted.den} при пределе 1:${MIN_SCALE_DEN}`,
  );
  check(
    'листов столько, сколько нужно — и все виды на них есть',
    fitted.pages.flatMap((page) => page.views).length === 2,
    `листов: ${fitted.pages.length}`,
  );

  /*
   * Предел уступает ОБРЕЗАНИЮ: вид шире поля не спасёт никакая раскладка,
   * и ради него масштаб уходит мельче 1:30.
   */
  const huge = (d: number) => [
    { id: 'a', title: 'Фасад', widthMm: 18000 / d, heightMm: 2700 / d },
  ];
  const wide = fitComposition(huge as never, 'A3');
  check(
    'ради необрезанного вида масштаб уходит за предел',
    wide.den > MIN_SCALE_DEN && 18000 / wide.den <= sheetField('A3').width,
    `1:${wide.den}, ширина ${(18000 / wide.den).toFixed(0)} мм`,
  );

  /* Что не влезло — уходит на следующий лист, а не ужимается. */
  const many = Array.from({ length: 8 }, (_, i) => ({
    id: `v${i}`,
    title: 'Вид',
    widthMm: 390,
    heightMm: 120,
  }));
  const pages = paginate(many, 'A3');
  check('лишние виды уходят на следующий лист', pages.length > 1, `листов: ${pages.length}`);
  check('нумерация листов сквозная', sheetNumber(1, pages.length) === `Лист 2 из ${pages.length}`);
  check(
    'ни один вид не потерялся при разбивке',
    pages.reduce((sum, page) => sum + page.views.length, 0) === many.length,
  );
}

/* ─────────────────────────  Выноски  ───────────────────────── */

console.log('\nВыноски с материалами');
{
  const run = buildRun(baseInput);
  const anchors = buildLeaders(run);

  check('выноски есть на все главные детали', anchors.length >= 6, `${anchors.length} шт.`);
  check(
    'без артикула сказано, что материал не согласован',
    anchors.some((a) => a.text.includes('не согласован')),
  );
  check(
    'подписи не повторяются',
    new Set(anchors.map((a) => a.id)).size === anchors.length,
  );

  const layout = layoutLeaders(anchors, { lengthMm: run.lengthMm, ceilingMm: run.ceilingHeightMm });
  const check_side = (list: typeof layout.left) => {
    const sorted = [...list].sort((a, b) => b.shelfYMm - a.shelfYMm);
    for (let i = 1; i < sorted.length; i += 1) {
      if (Math.abs(sorted[i].shelfYMm - sorted[i - 1].shelfYMm) < 1) return false;
    }
    return true;
  };
  check('полки выносок не садятся друг на друга', check_side(layout.left) && check_side(layout.right));
  check(
    'полки не выходят за высоту помещения',
    [...layout.left, ...layout.right].every(
      (l) => l.shelfYMm > 0 && l.shelfYMm < run.ceilingHeightMm,
    ),
  );

  const again = buildLeaders(run);
  check('выноски детерминированы', JSON.stringify(again) === JSON.stringify(anchors));
}

/* ─────────────────────────  Аксонометрия  ───────────────────────── */

console.log('\nАксонометрия');
{
  const run = buildRun(baseInput);
  const prod = { thicknessMm: 16, frontMm: 16, gapMm: 3 };

  const first = buildAxonometry(run, 'closed', prod);
  const second = buildAxonometry(run, 'closed', prod);
  check('тот же ряд даёт тот же рисунок', JSON.stringify(first) === JSON.stringify(second));
  check('рисунок не пустой', first.faces.length > 30, `граней: ${first.faces.length}`);

  const inside = buildAxonometry(run, 'inside', prod);
  check('вид «внутри» отличается от закрытого', inside.faces.length !== first.faces.length);

  const carcass = buildAxonometry(run, 'carcass', prod);
  check('в корпусе нет ни фасадов, ни техники',
    carcass.faces.every((f) => f.material === 'carcass' || f.material === 'metal'));

  const p0 = project(0, 0, 0);
  const px = project(1, 0, 0);
  const py = project(0, 1, 0);
  check('высота на бумаге идёт вверх', py.y < p0.y);
  check('длина идёт вправо и вниз', px.x > p0.x && px.y > p0.y);

  const extent = axonometryExtentMm(run, 'closed', prod);
  check('габарит аксонометрии шире ряда', extent.width > run.lengthMm);
  check('и не выше потолка вдвое', extent.height < run.ceilingHeightMm * 2);
}

/* ─────────────────────────  Позиции  ───────────────────────── */

console.log('\nНумерация позиций');
{
  check('позиция подписывается по отрасли', positionCode(3) === 'МИ-поз.3');
  const positions = projectPositions(['kitchen', 'bedroom', 'hallway']);
  check('нумерация сквозная по объекту', positions.map((p) => p.index).join(',') === '1,2,3');
  check('изделие названо изделием, а не помещением', positions[0].title === 'Кухонный гарнитур');
  check(
    'два одинаковых номера на объекте невозможны',
    new Set(positions.map((p) => p.code)).size === positions.length,
  );
}


/* ─────────────────────────  Варианты на чертеже  ───────────────────────── */

console.log('\nКаждый вариант виден на чертеже');
{
  const run = buildRun(baseInput);
  const base = run.modules.find((m) => !m.appliance) ?? run.modules[0];
  const upper = run.upperSegments[0]?.modules[0] ?? base;
  const tall = run.modules.find((m) => m.kind === 'tall') ?? base;

  const hostFor = (row: string) => (row === 'upper' ? upper : row === 'tall' ? tall : base);

  /*
   * Сравниваем варианты ВНУТРИ РЯДА. Клиент выбирает из того, что бывает
   * в этом месте, и различаться должны именно они. Открытая полка наверху
   * и открытая секция внизу — это одна и та же мебель на разной высоте:
   * выдумывать им разный рисунок значит врать в обе стороны.
   */
  const signatures = new Map<string, string>();
  const insideSignatures = new Map<string, string>();

  for (const spec of Object.values(MODULE_VARIANTS)) {
    const host = hostFor(spec.row);
    const unit = applyVariant({ ...host, appliance: undefined, column: undefined }, spec.kind);

    const fronts = `${spec.row}:${glyphSignature(frontGlyph(unit, 'fronts'))}`;
    const inside = `${spec.row}:${glyphSignature(frontGlyph(unit, 'inside'))}`;

    check(`вариант «${spec.title}» что-то рисует`, fronts.length > 0, fronts);
    check(`вариант «${spec.title}» виден и в разрезе`, inside.length > 0, inside);

    const twinFront = signatures.get(fronts);
    check(
      `вариант «${spec.title}» не выглядит как другой в своём ряду`,
      twinFront === undefined,
      twinFront ? `совпал с «${twinFront}»: ${fronts}` : fronts,
    );
    signatures.set(fronts, spec.title);

    const twinInside = insideSignatures.get(inside);
    check(
      `в разрезе «${spec.title}» отличается от других в своём ряду`,
      twinInside === undefined,
      twinInside ? `совпал с «${twinInside}»: ${inside}` : inside,
    );
    insideSignatures.set(inside, spec.title);
  }

  /* Витрина: стекло, полки сквозь него и подсветка — все три обязательны. */
  const display = applyVariant({ ...upper, appliance: undefined }, 'upper_glass');
  const displayFront = frontGlyph(display, 'fronts');
  check(
    'у витрины есть стекло, рама, полки и подсветка',
    ['glass', 'frame', 'shelf', 'led'].every((kind) =>
      displayFront.some((el) => el.kind === kind),
    ),
    glyphSignature(displayFront),
  );
  check(
    'стекло не закрашено сплошной заливкой',
    displayFront.filter((el) => el.kind === 'glass').length === 1,
  );
  check(
    'в разрезе витрины полки остаются, а стекла нет',
    frontGlyph(display, 'inside').some((el) => el.kind === 'shelf') &&
      !frontGlyph(display, 'inside').some((el) => el.kind === 'glass'),
  );

  /* Ящики рисуются ящиками: три фронта — это три фронта, а не одна дверца. */
  const drawers = applyVariant({ ...base, appliance: undefined, drawerCount: 3 }, 'drawers');
  const drawerGlyph = frontGlyph(drawers, 'fronts');
  check(
    'три ящика рисуются тремя фронтами',
    drawerGlyph.filter((el) => el.kind === 'drawer').length === 3,
    glyphSignature(drawerGlyph),
  );
  check(
    'у ящиков нет диагоналей открывания',
    !drawerGlyph.some((el) => el.kind === 'swing'),
  );

  /* Наполнение вариантов видно в разрезе. */
  const cargo = applyVariant({ ...base, appliance: undefined }, 'cargo');
  check('у карго в разрезе видны корзины', frontGlyph(cargo, 'inside').some((el) => el.kind === 'shelf'));
  check('у карго есть стрелка выдвижения', frontGlyph(cargo, 'fronts').some((el) => el.kind === 'cargo'));

  const dryer = applyVariant({ ...upper, appliance: undefined }, 'upper_dryer');
  check('у сушилки видна решётка', frontGlyph(dryer, 'inside').some((el) => el.kind === 'dryer'));

  const sink = applyVariant({ ...base, appliance: undefined }, 'sink_base');
  check('под мойкой пунктирный вырез чаши', frontGlyph(sink, 'fronts').some((el) => el.kind === 'sinkCut'));

  const lift = applyVariant({ ...upper, appliance: undefined }, 'upper_lift');
  check('у подъёмника дуга вверх', frontGlyph(lift, 'fronts').some((el) => el.kind === 'lift'));

  /* Колонна и вытяжка добавляются поверх варианта. */
  const hood = run.upperSegments.flatMap((s) => s.modules).find((m) => m.appliance === 'hood');
  if (hood) {
    check('у вытяжки нарисован воздуховод', frontGlyph(hood, 'fronts').some((el) => el.kind === 'hoodDuct'));
  }

  const column = run.modules.find((m) => m.column);
  if (column) {
    check('у колонны нарисованы обе врезки',
      frontGlyph(column, 'fronts').some((el) => el.kind === 'niche' && el.count === 2));
  }

  /* Рисунок не зависит от того, сколько раз его попросили. */
  const once = glyphSignature(frontGlyph(display, 'fronts'));
  const twice = glyphSignature(frontGlyph(display, 'fronts'));
  check('рисунок варианта детерминирован', once === twice);
}


/* ──────────────  Демо-объект остаётся демонстрируемым  ────────────── */

/*
 * ГЛАВНЫЙ ХОД ВСТРЕЧИ: нажать на модуль, поменять его на витрину,
 * показать новую сумму. Он держится на том, что у модулей демо-ряда
 * ЕСТЬ выбор и что выбор ВИДЕН.
 *
 * Однажды он молча перестал работать: ряд 3200 мм забился техникой
 * вплотную, все модули стали либо под прибор, либо узким карго — и лента
 * вариантов не показывалась вовсе. Заметили это не на демонстрации только
 * потому, что случайно полезли смотреть другое.
 *
 * Считаем не число вариантов, а число РАЗНЫХ РИСУНКОВ фасада: «две
 * дверцы» на модуле 1200 мм выглядят ровно как обычная дверца, и такой
 * выбор на встрече не показать.
 */

console.log('\nДемо-объект можно показать');
{
  const demo = buildRun({
    lengthMm: DEMO_PROJECT.lengthMm,
    ceilingHeightMm: DEMO_MEASUREMENT.ceilingHeightMm,
    requirements: requirementsFromTemplate(
      templateById(DEMO_TEMPLATE_ID)!,
      DEMO_REQUIREMENTS.options,
    ),
    openings: DEMO_MEASUREMENT.walls[0].openings,
    comms: DEMO_MEASUREMENT.comms,
    cornerAt: null,
  });

  const uppers = demo.upperSegments.flatMap((segment) => segment.modules);
  check('в демо-ряду есть верхний ряд', uppers.length > 0, `${uppers.length} модулей наверху`);

  const visible = allModules(demo).filter(
    (unit) => visibleVariantCount(unit, demo, demo.zone) >= 2,
  );

  check(
    'у демо-объекта не меньше трёх модулей с ВИДИМЫМ выбором',
    visible.length >= 3,
    `${visible.length}: ${visible.map((u) => `${u.id}(${u.widthMm})`).join(' ') || 'ни одного'}`,
  );

  /*
   * Одного заметного на глаз мало назвать числом: витрина, открытая полка
   * и ящики вместо дверцы — это то, на что клиент реагирует. Проверяем,
   * что такой вариант в ряду действительно предлагается.
   */
  const striking = allModules(demo).some((unit) =>
    variantsForModule(unit, demo, demo.zone).some((spec) =>
      ['upper_display', 'upper_open', 'open_base', 'drawers_four'].includes(spec.kind),
    ),
  );
  check('и среди них есть заметный: витрина, открытая полка или ящики', striking);

  // Техника на месте: демонстрируем кухню, а не витрину возможностей.
  for (const appliance of ['fridge', 'oven', 'sink600', 'hob', 'hood'] as const) {
    check(
      `техника на месте: ${APPLIANCE_SLOTS[appliance].title}`,
      allModules(demo).some((u) => u.appliance === appliance),
    );
  }

  check('модули демо-ряда не пересекаются', moduleOverlaps(demo).length === 0);

  /*
   * Сумма в правдоподобных пределах для кухни такой длины. Границы широкие
   * намеренно: это защита от нуля и от порядка, а не от копеек.
   */
  const total = buildEstimate(demo, 'optimal', DEMO_RATES).total;
  check(
    'смета демо-ряда правдоподобна',
    total > 1_000_000 && total < 3_000_000,
    `${Math.round(total).toLocaleString('ru')} ₸ на ${DEMO_PROJECT.lengthMm} мм`,
  );
}


/* ──────────  Смета и раскрой считают одни и те же материалы  ────────── */

/*
 * ПЯТЫЙ СЛУЧАЙ ОДНОГО КЛАССА — и последний из известных.
 *
 * Смета считала площади и кромку своими формулами, деталировка — по
 * настоящим деталям. Кромки в раскрое оказывалось на 13 % больше, чем в
 * смете: цех клеил, компания за это не брала денег.
 *
 * Теперь количество берётся ТОЛЬКО из деталировки. Этот тест держит
 * равенство: разойдутся — значит кто-то снова завёл второй расчёт.
 */

console.log('\nСмета берёт количества из раскроя');
{
  /** Статья сметы → величина деталировки. */
  const PAIRS: [string, keyof ReturnType<typeof panelMaterials>][] = [
    ['ldsp_carcass', 'carcassM2'],
    ['ldsp_moisture', 'carcassM2'],
    ['shelf_panel', 'shelfM2'],
    ['hdf_back', 'backM2'],
    ['front_panel', 'frontM2'],
    ['pvc_edge', 'edgeM'],
  ];

  const mismatched: string[] = [];
  let configs = 0;
  let compared = 0;

  for (const t of RUN_TEMPLATES) {
    for (const len of [t.minLengthMm, Math.round((t.minLengthMm + t.maxLengthMm) / 2), t.maxLengthMm]) {
      let sample: Run;
      try {
        sample = buildRun({
          ...baseInput,
          lengthMm: len,
          requirements: requirementsFromTemplate(t, DEMO_REQUIREMENTS.options),
        });
      } catch {
        continue;
      }

      configs += 1;
      const estimate = buildEstimate(sample, 'optimal', DEMO_RATES);
      const cut = panelMaterials(buildPanels({ run: sample }));

      for (const [key, field] of PAIRS) {
        const line = estimate.lines.find((l) => l.key === key);
        if (!line) continue;
        compared += 1;
        if (Math.abs(line.quantity - cut[field]) > 0.01) {
          mismatched.push(`${t.id}@${len} ${key}: смета ${line.quantity} ≠ раскрой ${cut[field]}`);
        }
      }
    }
  }

  check(
    'кромка, ЛДСП, полки, фасады и задние стенки совпадают с раскроем',
    mismatched.length === 0,
    mismatched.length === 0
      ? `конфигураций ${configs}, сверок ${compared}`
      : `ЦЕХ КЛЕИТ И ПИЛИТ ОДНО, КЛИЕНТ ПЛАТИТ ДРУГОЕ — ${mismatched.slice(0, 3).join(' | ')}`,
  );

  check('сверено больше сотни величин', compared > 100, `${compared}`);

  /*
   * НАСТРОЙКИ ЦЕХА ДОХОДЯТ ДО СМЕТЫ.
   *
   * У компании своя толщина плиты. Считай смета по умолчанию, пока цех
   * пилит по 18 мм — расхождение вернулось бы той же дверью, только тише:
   * на тестах с умолчаниями оно бы не всплыло вовсе.
   */
  const run = buildRun(baseInput);
  // 18 мм вместо 16 — реальная альтернатива, а не выдуманная толщина.
  const thick: ProductionSettings = { ...DEFAULT_PRODUCTION, carcassMm: 18 };
  const byDefault = buildEstimate(run, 'optimal', DEMO_RATES);
  const byThick = buildEstimate(run, 'optimal', DEMO_RATES, [], undefined, thick);

  check(
    'толщина плиты компании меняет смету',
    byDefault.total !== byThick.total,
    `${byDefault.total} → ${byThick.total} при плите 18 мм`,
  );

  const cutThick = panelMaterials(buildPanels({ run, production: thick }));
  const lineThick = byThick.lines.find((l) => l.key === 'pvc_edge');
  check(
    'и смета сходится с раскроем на ЕЁ настройках, а не на умолчаниях',
    Math.abs((lineThick?.quantity ?? 0) - cutThick.edgeM) < 0.01,
    `смета ${lineThick?.quantity} · раскрой ${cutThick.edgeM}`,
  );
}


/* ──────────────  Два модуля не могут занимать один объём  ────────────── */

/*
 * НАЙДЕНО ГЛАЗАМИ НА АКСОНОМЕТРИИ, А НЕ ЧИСЛАМИ.
 *
 * Верхний ряд вешался поверх колонн во всю высоту: `buildUpperRow`
 * разрывала ряд под окном и не разрывала под пеналами. На фасаде это
 * читалось безобидной антресолью над холодильником, поэтому и жило —
 * а смета и раскрой считали корпус, которого не может быть.
 *
 * Проверка ОБЩАЯ, а не «верхний против пенала»: заплатка на один случай
 * оставила бы остальные, которых мы ещё не видели. Именно так и вышло —
 * общая проверка сразу нашла второй случай, в другой зоне.
 */

console.log('\nМодули не пересекаются по объёму');
{
  /* ── Разрыв верхнего ряда под пеналами ── */
  const run = buildRun(baseInput);
  const tall = run.modules.filter((m) => m.kind === 'tall');
  const uppers = run.upperSegments.flatMap((seg) => seg.modules);

  check('в ряду есть пеналы во всю высоту', tall.length > 0, `${tall.length} шт.`);

  const overTall = uppers.filter((u) =>
    tall.some((t) => Math.min(t.offsetMm + t.widthMm, u.offsetMm + u.widthMm) - Math.max(t.offsetMm, u.offsetMm) > 1),
  );
  check(
    'верхний ряд разорван на пеналах, как и на окне',
    overTall.length === 0,
    overTall.map((u) => `${u.id}@${u.offsetMm}`).join(' ') || 'ни одного над пеналом',
  );

  check('и сам ряд пересечений не имеет', moduleOverlaps(run).length === 0);

  /* ── Верхний ряд не исчез там, где ему место ── */
  check(
    'верхний ряд остался там, где стены свободны',
    uppers.length > 0,
    `${uppers.length} модулей наверху`,
  );

  /* ── Инвариант ловит подделку ── */
  const broken: Run = {
    ...run,
    upperSegments: [
      {
        fromMm: 0,
        toMm: 600,
        // Ставим верхний модуль ровно поверх первого пенала.
        modules: [{ ...uppers[0], id: 'fake-over-tall', offsetMm: tall[0].offsetMm, widthMm: 600 }],
      },
    ],
  };
  let caught = '';
  try {
    assertNoOverlap(broken);
  } catch (error) {
    caught = (error as Error).message;
  }
  check('подделка падает исключением', caught.length > 0, caught.slice(0, 90));
  check(
    'и ошибка называет оба модуля',
    caught.includes('поз') || caught.includes('объём'),
    caught.slice(0, 60),
  );

  /* ── Все конфигурации всех зон ── */
  const dirty: string[] = [];
  let configs = 0;

  for (const t of RUN_TEMPLATES) {
    for (const len of [t.minLengthMm, Math.round((t.minLengthMm + t.maxLengthMm) / 2), t.maxLengthMm]) {
      let sample: Run;
      try {
        sample = buildRun({
          ...baseInput,
          lengthMm: len,
          requirements: requirementsFromTemplate(t, DEMO_REQUIREMENTS.options),
        });
      } catch {
        continue;
      }
      configs += 1;
      if (moduleOverlaps(sample).length > 0) dirty.push(`${t.id}@${len}`);
    }
  }

  /*
   * ТЕПЕРЬ ПРОВЕРЯЕМ ВСЕ ЗОНЫ, А НЕ ТОЛЬКО КУХНЮ.
   *
   * Запись про «известный дефект антресоли: 12 конфигураций» отсюда
   * убрана — дефект починен. Он держался на том, что высоту корпуса
   * считали две функции: `moduleCarcassHeightMm` знала зону и секцию,
   * а `moduleHeightMm` — только вид модуля, и расходились они на 300 мм.
   * Вторая переименована в `standardHeightMm` и измеряет теперь только
   * отраслевой стандарт, а не реальный модуль.
   */
  check(
    'ни одна конфигурация ни одной зоны не пересекается',
    dirty.length === 0,
    `проверено ${configs}, с наложением ${dirty.length}${dirty.length ? ': ' + dirty.slice(0, 4).join(', ') : ''}`,
  );

  check(
    'проверены все пять зон, а не одна',
    new Set(RUN_TEMPLATES.map((t) => t.zone ?? 'kitchen')).size === 5,
  );
}


/* ──────────────  Правка наполнения обязана менять смету  ────────────── */

/*
 * ТОТ ЖЕ КЛАСС, ЧТО И СЕКЦИЯ ПРО ЛИСТ, но с другой стороны.
 *
 * Там данные менялись, а картинка нет. Здесь данные менялись, а СУММА нет:
 * `carcassAreaM2` считала РОВНО ОДНУ полку на модуль независимо от того,
 * сколько их в `fill`. Цех получал на распил другое количество деталей,
 * чем то, за которое заплатил клиент, — и обе цифры видны одному человеку.
 *
 * Правило простое и проверяется буквально: изменилось число деталей в
 * раскрое — обязана измениться сумма. Не изменилось — обязана остаться.
 */

console.log('\nПравка наполнения меняет смету');
{
  const run = buildRun(baseInput);
  const target = allModules(run).find((u) => u.fill && u.kind !== 'filler' && !u.appliance);

  if (!target) {
    check('в ряду есть модуль с наполнением', false, 'не нашли ни одного');
  } else {
    const heightMm = moduleCarcassHeightMm(target, run);

    const withFill = (source: Run, fill: Module['fill']): Run => {
      const patch = (list: Module[]) =>
        list.map((u) => (u.id === target.id ? { ...u, fill } : u));
      return {
        ...source,
        modules: patch(source.modules),
        upperSegments: source.upperSegments.map((seg) => ({
          ...seg,
          modules: patch(seg.modules),
        })),
      };
    };

    /** Сколько деталей уходит в цех. */
    const partCount = (r: Run) => buildPanels({ run: r }).reduce((sum, p) => sum + p.qty, 0);
    const total = (r: Run) => buildEstimate(r, 'optimal', DEMO_RATES).total;

    const base = { parts: partCount(run), sum: total(run) };

    const edits: { name: string; run: Run }[] = [
      {
        name: 'подвинули полку',
        run: withFill(run, moveShelf(target.fill!, 0, target.fill!.shelves[0] + 192, heightMm).fill),
      },
      { name: 'сняли полку', run: withFill(run, removeShelf(target.fill!, 0)) },
      { name: 'добавили полку', run: withFill(run, addShelf(target.fill!, 544, heightMm).fill) },
      {
        name: 'протянули перегородку',
        run: withFill(run, { ...target.fill!, dividerMm: Math.round(target.widthMm / 2) }),
      },
    ];

    for (const edit of edits) {
      const parts = partCount(edit.run);
      const sum = total(edit.run);
      const partsChanged = parts !== base.parts;
      const sumChanged = sum !== base.sum;

      check(
        `${edit.name}: деталей ${base.parts}→${parts}, сумма ${partsChanged ? 'обязана измениться' : 'обязана остаться'}`,
        partsChanged === sumChanged,
        partsChanged === sumChanged
          ? `${base.sum} → ${sum}`
          : partsChanged
            ? 'ЦЕХ ПИЛИТ ДРУГОЕ КОЛИЧЕСТВО, А КЛИЕНТ ПЛАТИТ ТУ ЖЕ СУММУ'
            : `сумма поехала без изменения раскроя: ${base.sum} → ${sum}`,
      );
    }

    // Направление тоже проверяем: меньше деталей — дешевле, больше — дороже.
    const fewer = total(withFill(run, removeShelf(target.fill!, 0)));
    const more = total(withFill(run, addShelf(target.fill!, 544, heightMm).fill));
    check('снятая полка удешевляет смету', fewer < base.sum, `${base.sum} → ${fewer}`);
    check('добавленная полка удорожает смету', more > base.sum, `${base.sum} → ${more}`);

    /*
     * ГЛАВНАЯ СВЕРКА: число полок в смете и в раскрое — одно и то же,
     * на каждом шаблоне и на каждой длине. Именно оно и разъезжалось.
     */
    let mismatched = 0;
    let configs = 0;

    for (const t of RUN_TEMPLATES) {
      for (const len of [t.minLengthMm, Math.round((t.minLengthMm + t.maxLengthMm) / 2)]) {
        let sample: Run;
        try {
          sample = buildRun({
            ...baseInput,
            lengthMm: len,
            requirements: requirementsFromTemplate(t, DEMO_REQUIREMENTS.options),
          });
        } catch {
          continue;
        }

        configs += 1;
        const cut = buildPanels({ run: sample })
          .filter((panel) => panel.name === 'Полка')
          .reduce((sum, panel) => sum + panel.qty, 0);
        const inFill = allModules(sample).reduce(
          (sum, u) => sum + (u.fill?.shelves.length ?? 0),
          0,
        );
        if (cut !== inFill) mismatched += 1;
      }
    }

    check(
      'полок в смете столько же, сколько в раскрое — на всех шаблонах',
      mismatched === 0 && configs > 20,
      `конфигураций ${configs}, расхождений ${mismatched}`,
    );

    /*
     * Ставка полок обязана быть в списке обязательных: без неё строка
     * посчиталась бы по нулю, и полки снова стали бы бесплатными — только
     * теперь молча и целиком.
     */
    check(
      'ставка полок объявлена обязательной',
      (REQUIRED_RATE_KEYS as readonly string[]).includes('shelf_panel'),
    );
    check(
      'в типовом прайсе все обязательные ставки есть',
      missingRequiredRates(
        Object.fromEntries(TYPICAL_PRICE_LIST.map((r) => [r.estimateKey, r.price])),
      ).length === 0,
    );
  }
}


/* ──────────────  Правка наполнения обязана менять лист  ────────────── */

/*
 * ТРЕТИЙ РАЗ ОДИН И ТОТ ЖЕ КЛАСС ОШИБКИ: данные меняются, картинка нет.
 *
 * Сначала пенал терял `kind` и приезжал в 3D нижним модулем. Потом разные
 * варианты выглядели на чертеже одинаково. Теперь разрез «с наполнением»
 * рисовал полки по выдуманным долям 0.33 / 0.66 и не менялся никогда.
 *
 * Общее у всех трёх одно: проверялись ЧИСЛА, а не то, что нарисовано.
 * Поэтому здесь виды РИСУЮТСЯ по-настоящему и сравнивается разметка до и
 * после правки.
 *
 * Проверяется не «хоть что-то поменялось», а ТАБЛИЦА ОЖИДАНИЙ по каждому
 * виду. Так ловится и регресс (вид перестал реагировать), и сюрприз (вид,
 * которому нутро не видно, вдруг начал его показывать).
 */

console.log('\nПравка наполнения меняет лист');
{
  const run = buildRun(baseInput);
  const target = allModules(run).find((u) => u.fill && u.kind !== 'filler' && !u.appliance);

  if (!target) {
    check('в ряду есть модуль с наполнением', false, 'не нашли ни одного');
  } else {
    const heightMm = moduleCarcassHeightMm(target, run);

    /** Ровно то, что делает `changeFill` в рабочем месте. */
    const withFill = (source: Run, fill: Module['fill']): Run => {
      const patch = (list: Module[]) =>
        list.map((u) => (u.id === target.id ? { ...u, fill } : u));
      return {
        ...source,
        modules: patch(source.modules),
        upperSegments: source.upperSegments.map((seg) => ({
          ...seg,
          modules: patch(seg.modules),
        })),
      };
    };

    /**
     * Все виды листа. `shows` — показывает ли вид наполнение.
     *
     * `false` здесь не отговорка, а утверждение: у фасада с закрытыми
     * дверцами и у плана сверху нутра не видно физически. Начнёт меняться —
     * тест упадёт, и правильно сделает: значит на чертеже появились полки
     * сквозь дверцу.
     */
    const views: { name: string; shows: boolean; render: (r: Run) => string }[] = [
      {
        name: 'фасад · с фасадами',
        shows: false,
        render: (r) => renderToStaticMarkup(createElement(ElevationDrawing, { run: r, mode: 'fronts' })),
      },
      {
        name: 'фасад · внутри',
        shows: true,
        render: (r) => renderToStaticMarkup(createElement(ElevationDrawing, { run: r, mode: 'inside' })),
      },
      {
        name: 'разрез боковой',
        shows: false,
        render: (r) => renderToStaticMarkup(createElement(SectionDrawing, { run: r })),
      },
      {
        name: 'разрез с наполнением',
        shows: true,
        render: (r) =>
          renderToStaticMarkup(
            createElement(SectionDrawing, { run: r, inside: true, selectedModuleId: target.id }),
          ),
      },
      {
        name: 'план',
        shows: false,
        render: (r) =>
          renderToStaticMarkup(createElement(PlanDrawing, { run: r, comms: [], issues: [] })),
      },
      {
        name: 'аксонометрия · наполнение',
        shows: true,
        render: (r) =>
          renderToStaticMarkup(
            createElement(AxonometryDrawing, { run: r, mode: 'inside', production: DEFAULT_PRODUCTION }),
          ),
      },
      {
        name: 'детализировка',
        shows: true,
        render: (r) => JSON.stringify(buildPanels({ run: r })),
      },
    ];

    /*
     * Снятие и добавление меняют СОСТАВ деталей, сдвиг — только положение.
     * Поэтому детализировка на сдвиг не реагирует: в раскрое лежат размеры
     * и количество, а не высота присадки.
     */
    const edits: { name: string; run: Run; countChanges: boolean }[] = [
      {
        name: 'подвинули полку',
        run: withFill(run, moveShelf(target.fill!, 0, target.fill!.shelves[0] + 192, heightMm).fill),
        countChanges: false,
      },
      { name: 'сняли полку', run: withFill(run, removeShelf(target.fill!, 0)), countChanges: true },
      {
        name: 'добавили полку',
        run: withFill(run, addShelf(target.fill!, 544, heightMm).fill),
        countChanges: true,
      },
    ];

    for (const edit of edits) {
      check(
        `${edit.name}: ряд действительно изменился`,
        runFingerprint(edit.run) !== run.fingerprint,
        `${run.fingerprint} → ${runFingerprint(edit.run)}`,
      );
    }

    let reacted = 0;

    for (const view of views) {
      const before = view.render(run);

      for (const edit of edits) {
        const changed = view.render(edit.run) !== before;
        const expected = view.shows && (view.name !== 'детализировка' || edit.countChanges);
        if (changed) reacted += 1;

        check(
          `${view.name} · ${edit.name}: ${expected ? 'вид меняется' : 'вид не меняется'}`,
          changed === expected,
          changed === expected
            ? ''
            : expected
              ? 'ДАННЫЕ ИЗМЕНИЛИСЬ, А КАРТИНКА НЕТ — вид рисует мимо fill'
              : 'вид показал нутро там, где его не видно — полки сквозь фасад',
        );
      }
    }

    /*
     * Главный инвариант секции: правка, меняющая отпечаток, обязана быть
     * ВИДНА хоть где-то. Пройди она молча — клиент подписал бы одно,
     * а цех сделал другое.
     */
    check(
      'ни одна правка наполнения не проходит для листа незаметно',
      reacted >= edits.length,
      `видимых изменений: ${reacted}`,
    );

    /* ── Промпт: наполнение только там, где его видно ── */
    const like = (u: Module) => ({
      widthMm: u.widthMm,
      offsetMm: u.offsetMm,
      kind: u.kind,
      appliance: u.appliance,
      variant: u.variant,
      frontType: u.frontType,
      drawerCount: u.drawerCount,
      fill: u.fill
        ? { shelves: u.fill.shelves, rodsMm: u.fill.rodsMm, drawerHeights: u.fill.drawerHeights }
        : undefined,
    });

    const bare = { ...target, appliance: undefined, column: undefined } as Module;
    const openNiche = like({ ...bare, variant: 'upper_open', frontType: 'none' } as Module);
    const solidDoor = like({ ...bare, variant: 'door', frontType: 'door' } as Module);

    const shelves = openNiche.fill?.shelves ?? [];
    const nicheText = describeFront(openNiche).text;

    check(
      'у открытой ниши полки названы числом и высотами',
      nicheText.includes(`РОВНО ${shelves.length}`) &&
        shelves.every((mm) => nicheText.includes(String(mm))),
      nicheText.slice(0, 95),
    );
    check(
      'за глухим фасадом полки в промпт НЕ уходят',
      !/РОВНО \d+ полк/.test(describeFront(solidDoor).text),
      describeFront(solidDoor).text.slice(0, 70),
    );
    check(
      'наполнение видно только у прозрачных и открытых модулей',
      interiorVisible(openNiche) && !interiorVisible(solidDoor),
    );

    /*
     * Признак прозрачности живёт на спецификации варианта, а рисунок стекла —
     * в `frontGlyph`. Два списка обязаны совпадать: разойдутся — промпт
     * опишет полки там, где чертёж рисует глухую панель.
     */
    const kinds = Object.keys(MODULE_VARIANTS) as ModuleVariantKind[];
    const glassByGlyph = kinds
      .filter((kind) =>
        frontGlyph(applyVariant(bare, kind), 'fronts').some((el) => el.kind === 'glass'),
      )
      .sort();
    const glassBySpec = kinds.filter((kind) => MODULE_VARIANTS[kind].transparentFront).sort();

    check(
      'прозрачные варианты в промпте и на чертеже — один список',
      JSON.stringify(glassByGlyph) === JSON.stringify(glassBySpec),
      `рисунок: ${glassByGlyph.join(',')} | спецификация: ${glassBySpec.join(',')}`,
    );
  }
}


/* ─────────────────────────  Промпт визуализации  ───────────────────────── */

console.log('\nВизуализация видит то же, что чертёж');
{
  const run = buildRun(baseInput);

  // Мета сцены: ровно те поля, что уезжают в запрос на отрисовку.
  const meta = run.modules.map((unit) => ({
    widthMm: unit.widthMm,
    offsetMm: unit.offsetMm,
    kind: unit.kind,
    appliance: unit.appliance,
    column: unit.column ? { top: unit.column.top, bottom: unit.column.bottom } : undefined,
    builtIn: unit.builtIn,
    section: unit.section,
    frontType: unit.frontType,
    drawerCount: unit.drawerCount,
    variant: unit.variant,
  }));

  const fronts = describeFronts(meta);
  check('описан каждый модуль ряда', fronts.length === run.modules.length,
    `${fronts.length} против ${run.modules.length}`);
  check(
    'у каждого модуля назван диапазон по стене',
    fronts.every((f) => f.toMm > f.fromMm),
  );
  check(
    'диапазоны идут подряд, без разрывов и нахлёстов',
    fronts.every((f, i) => i === 0 || f.fromMm === fronts[i - 1].toMm),
  );

  const block = frontsBlock('НИЖНИЙ РЯД', meta);
  check('блок читается строками «от–до»', /\n {2}\d+–\d+ /.test(block));
  check('мойка описана мойкой', /мойка/i.test(block));

  /* Витрина и ящики называются прямо. */
  const withDisplay = [
    { widthMm: 600, offsetMm: 0, kind: 'upper', frontType: 'door', variant: 'upper_display' },
    { widthMm: 600, offsetMm: 600, kind: 'base', frontType: 'drawers', drawerCount: 3 },
  ];
  const displayBlock = frontsBlock('ВЕРХНИЙ РЯД', withDisplay);
  check('витрина названа витриной, а не шкафом', /ВИТРИНА/.test(displayBlock), displayBlock);
  check('подсветка витрины названа включённой', /подсветка ВКЛЮЧЕНА/.test(displayBlock));
  check('ящики названы ящиками', /3 ЯЩИКА/.test(displayBlock));

  /* Верхний ряд описывается так же помодульно: витрина живёт именно там. */
  const upperMeta = run.upperSegments.flatMap((segment) =>
    segment.modules.map((unit) => ({
      widthMm: unit.widthMm,
      offsetMm: unit.offsetMm,
      kind: unit.kind,
      appliance: unit.appliance,
      frontType: unit.frontType,
      drawerCount: unit.drawerCount,
      variant: unit.variant,
    })),
  );
  const upperBlock = frontsBlock('ВЕРХНИЙ РЯД', upperMeta);
  const NEWLINE = String.fromCharCode(10);
  const ROW_RE = new RegExp('^ {2}\\d+.\\d+ ');
  check(
    'верхний ряд описан помодульно',
    upperMeta.length > 0 && upperBlock.split(NEWLINE).some((line) => ROW_RE.test(line)),
    `модулей наверху: ${upperMeta.length}`,
  );
  check('вытяжка наверху названа', /вытяжка/i.test(upperBlock));

  const withDisplayUpper = upperMeta.map((u, i) =>
    i === 0 ? { ...u, variant: 'upper_display', appliance: undefined } : u,
  );
  check(
    'поставленная наверху витрина доезжает до промпта',
    /ВИТРИНА/.test(frontsBlock('ВЕРХНИЙ РЯД', withDisplayUpper)),
  );

  const rules = frontRules(run.modules.length);
  check('правило про ящики есть в тексте', /ЯЩИКИ И ДВЕРЦЫ РАЗЛИЧАЮТСЯ/.test(rules));
  check('правило про витрины есть в тексте', /ОТКРЫТЫМИ/.test(rules));
  check('правило про неизменность состава называет число', rules.includes(`${run.modules.length}`));

  /*
   * СВЕРКА СЧИТАЕТ РЯДЫ ПОРОЗНЬ.
   *
   * Промпт описывает оба ряда, а `run.modules` — это только нижний. Пока
   * сверка складывала все строки подряд, она падала на верном составе:
   * «в промпте 13 модулей, а в ряду 7».
   */
  const drawerFronts = describeFronts([...meta, ...upperMeta]).reduce(
    (sum, f) => sum + f.drawerFronts,
    0,
  );

  const bothRows = [
    frontsBlock(`${BASE_ROW_TITLE}, стена ${run.lengthMm} мм, слева направо`, meta),
    frontsBlock(`${UPPER_ROW_TITLE}, слева направо`, upperMeta),
    rules,
  ].join('\n\n');

  const counted = countFrontRows(bothRows);
  check(
    'строки считаются по своему ряду',
    counted.base === meta.length && counted.upper === upperMeta.length,
    `низ ${counted.base}/${meta.length}, верх ${counted.upper}/${upperMeta.length}`,
  );

  let threw = '';
  try {
    assertCompositionMatches(bothRows, {
      baseCount: meta.length,
      upperCount: upperMeta.length,
      drawerFronts,
    });
  } catch (error) {
    threw = (error as Error).message;
  }
  check('состав с верхним рядом проходит сверку', threw === '', threw.slice(0, 80));

  let caughtBase = '';
  try {
    assertCompositionMatches(bothRows, {
      baseCount: meta.length + 2,
      upperCount: upperMeta.length,
      drawerFronts,
    });
  } catch (error) {
    caughtBase = (error as Error).message;
  }
  check(
    'подменённый нижний ряд падает и называет себя',
    caughtBase.startsWith('Нижний ряд'),
    caughtBase.slice(0, 70),
  );

  let caughtUpper = '';
  try {
    assertCompositionMatches(bothRows, {
      baseCount: meta.length,
      upperCount: upperMeta.length + 1,
      drawerFronts,
    });
  } catch (error) {
    caughtUpper = (error as Error).message;
  }
  check(
    'подменённый верхний ряд падает и называет себя',
    caughtUpper.startsWith('Верхний ряд'),
    caughtUpper.slice(0, 70),
  );

  /* Ряд без верхних шкафов — тоже верный состав. */
  const withoutUpper = [
    frontsBlock(`${BASE_ROW_TITLE}, стена ${run.lengthMm} мм, слева направо`, meta),
    NO_UPPER_ROW,
    rules,
  ].join('\n\n');

  let threwEmpty = '';
  try {
    assertCompositionMatches(withoutUpper, {
      baseCount: meta.length,
      upperCount: 0,
      drawerFronts: fronts.reduce((sum, f) => sum + f.drawerFronts, 0),
    });
  } catch (error) {
    threwEmpty = (error as Error).message;
  }
  check('состав без верхнего ряда проходит сверку', threwEmpty === '', threwEmpty.slice(0, 80));

  let caughtDrawers = '';
  try {
    assertCompositionMatches(`${BASE_ROW_TITLE}:\n  0–600 глухой фасад\n\n${NO_UPPER_ROW}`, {
      baseCount: 1,
      upperCount: 0,
      drawerFronts: 3,
    });
  } catch (error) {
    caughtDrawers = (error as Error).message;
  }
  check('потерянные ящики падают исключением', caughtDrawers.length > 0, caughtDrawers.slice(0, 60));
}


/* ──────────────  Свободная сборка: человек собирает сам  ────────────── */

/*
 * Шаблон остаётся быстрым стартом, но перестаёт быть единственным путём.
 * Проверяется ровно то, что отличает свободную сборку от раскладки:
 * пустая стена — законное состояние, место после удаления НЕ
 * перезаполняется, ряд имеет право не сходиться, а отказ называет
 * миллиметры. И при этом ОДИН И ТОТ ЖЕ состав, собранный руками и
 * собранный шаблоном, обязан дать один отпечаток — иначе чертёж, смета,
 * раскрой и 3D разъедутся по способу сборки.
 */
console.log('\nСвободная сборка');
{
  const FREE: RunRequirements = { ...REQ, mode: 'free', appliances: [] };
  const shell = { ...baseInput, requirements: FREE };
  const step = (run: Run, ops: MillworkOp[]) =>
    applyOps({ run, requirements: FREE, ops, openings: OPENINGS });

  /* 1. Пустая стена — законное состояние, а не поломка. */
  const empty = buildRun(shell);
  const emptyEstimate = buildEstimate(empty, 'optimal', DEMO_RATES);
  check('пустая стена собирается в ряд без модулей', empty.modules.length === 0);
  check(
    'смета пустого ряда — ноль, а не «почти ноль»',
    emptyEstimate.total === 0,
    `${emptyEstimate.total} ₸`,
  );
  check(
    'свободное место пустой стены равно всей стене',
    empty.residualMm === empty.lengthMm,
    `${empty.residualMm}/${empty.lengthMm} мм`,
  );
  check('пустой ряд не нарушает непересечение', moduleOverlaps(empty).length === 0);

  /* 2. Модули и техника добавляются операциями. */
  let run = step(empty, [{ op: 'add_module', kind: 'tall', appliance: 'fridge' }]);
  run = step(run, [
    { op: 'add_module', kind: 'base', widthMm: 600, afterModuleId: run.modules[0].id },
  ]);
  run = step(run, [
    { op: 'add_module', kind: 'base', appliance: 'sink600', afterModuleId: run.modules[1].id },
  ]);
  run = step(run, [
    { op: 'add_module', kind: 'base', widthMm: 450, afterModuleId: run.modules[2].id },
  ]);
  check(
    'модули и техника встают на пустую стену операциями',
    run.modules.length === 4 && run.modules.some((unit) => unit.appliance === 'fridge'),
    `модулей ${run.modules.length}`,
  );
  check(
    'занятое место считается по собранному, а не по стене',
    run.residualMm === run.lengthMm - runWidthSum(run),
    `свободно ${run.residualMm} мм`,
  );
  check('собранный руками ряд не пересекается', moduleOverlaps(run).length === 0);

  /* 3. Удаление освобождает место, и оно НЕ перезаполняется. */
  const removed = step(run, [{ op: 'remove_module', moduleId: run.modules[1].id }]);
  check(
    'удаление освобождает место и не перезаполняет его',
    removed.modules.length === run.modules.length - 1 &&
      removed.residualMm === run.residualMm + 600,
    `${run.modules.length} → ${removed.modules.length}, свободно ${removed.residualMm} мм`,
  );

  /* 4. Ширина: границы соблюдаются, соседей никто не трогает. */
  /* Ширину техники диктует прибор — тянуть можно только обычный модуль. */
  const target = removed.modules.find((unit) => !unit.appliance)!;
  const neighbours = removed.modules
    .filter((unit) => unit.id !== target.id)
    .map((unit) => `${unit.id}:${unit.widthMm}`)
    .join(' ');
  const widened = step(removed, [
    { op: 'set_width', moduleId: target.id, widthMm: 900 },
  ]);
  check(
    'ширина меняется, а соседи остаются как были',
    widened.modules
      .filter((unit) => unit.id !== target.id)
      .map((unit) => `${unit.id}:${unit.widthMm}`)
      .join(' ') === neighbours,
  );
  for (const bad of [100, 1400]) {
    const refused = step(removed, [
      { op: 'set_width', moduleId: target.id, widthMm: bad },
    ]);
    check(
      `ширина ${bad} мм отклоняется с объяснением`,
      refused.warnings.some((w) => /от 150 до 1200/.test(w)),
      refused.warnings[0] ?? 'принято молча',
    );
  }

  /*
   * Ширина, которая не влезает в ОСТАТОК, отклоняется числом и не роняет
   * правку. `widthOverflowMm` считает минимальную сумму — с соседями,
   * ужатыми до `MIN_WIDTH`; в свободной сборке соседей никто не ужимает,
   * и такая проверка пропускала правку, после которой `assertRunFits`
   * роняла исключением всё рабочее место человека.
   */
  let tight = buildRun(shell);
  for (let i = 0; i < 6; i += 1) {
    tight = step(tight, [{ op: 'add_module', kind: 'base', widthMm: 600 }]);
  }
  let threwOnWiden = '';
  let widenRefused = null as Run | null;
  try {
    widenRefused = step(tight, [
      { op: 'set_width', moduleId: tight.modules[0].id, widthMm: 1200 },
    ]);
  } catch (error) {
    threwOnWiden = (error as Error).message;
  }
  check(
    'ширина сверх остатка не роняет правку исключением',
    threwOnWiden === '',
    threwOnWiden.slice(0, 70),
  );
  check(
    'а отклоняется с превышением в миллиметрах',
    Boolean(widenRefused) &&
      runWidthSum(widenRefused!) <= widenRefused!.lengthMm &&
      widenRefused!.warnings.some((w) => /ряд длиннее стены на \d+ мм/.test(w)),
    widenRefused?.warnings[0] ?? 'отказа нет',
  );

  /* 5. Ряд длиннее стены не собирается, и отказ назван в миллиметрах. */
  let crowded = buildRun(shell);
  for (let i = 0; i < 8; i += 1) {
    crowded = step(crowded, [{ op: 'add_module', kind: 'base', widthMm: 600 }]);
  }
  check(
    'модуль, которому не хватает стены, не добавляется',
    runWidthSum(crowded) <= crowded.lengthMm,
    `${runWidthSum(crowded)}/${crowded.lengthMm} мм`,
  );
  check(
    'и отказ называет нехватку числом',
    crowded.warnings.some((w) => /Не хватает \d+ мм/.test(w)),
    crowded.warnings[0] ?? 'отказа нет',
  );

  /* 6. Один состав — один отпечаток, как бы его ни собрали. */
  const freeTemplate = templateById('linear-column')!;
  const templateReq = requirementsFromTemplate(freeTemplate, REQ.options);
  const template = buildRun({ ...baseInput, requirements: templateReq });
  let byHand = buildRun(shell);
  let after: string | undefined;
  for (const unit of template.modules) {
    byHand = step(byHand, [
      {
        op: 'add_module',
        kind: unit.kind,
        widthMm: unit.widthMm,
        appliance: unit.appliance,
        afterModuleId: after,
      },
    ]);
    after = byHand.modules[byHand.modules.length - 1].id;
  }
  const fpTemplate = configurationFingerprint(template.modules);
  const fpHand = configurationFingerprint(byHand.modules);
  check(
    'тот же состав, собранный руками, даёт тот же отпечаток',
    fpTemplate === fpHand,
    `${fpTemplate} · ${fpHand}`,
  );

  /* 7. Шаблоны работают ровно как раньше. */
  check(
    'ряд из шаблона по-прежнему сходится со стеной до миллиметра',
    template.residualMm === 0 && runWidthSum(template) === template.lengthMm,
    `${runWidthSum(template)}/${template.lengthMm} мм`,
  );
  const shrunk = applyOps({
    run: template,
    requirements: templateReq,
    ops: [{ op: 'remove_module', moduleId: template.modules[2].id }],
    openings: OPENINGS,
  });
  check(
    'и перезаполнение места в режиме шаблона осталось',
    shrunk.residualMm === 0 && runWidthSum(shrunk) === shrunk.lengthMm,
    `${runWidthSum(shrunk)}/${shrunk.lengthMm} мм`,
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
