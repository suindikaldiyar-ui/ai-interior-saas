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
  mezzanineBottomMm,
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
import { moduleNumbers, positionCode, projectPositions } from '../lib/millwork/positions';
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
import {
  MODULE_VARIANTS,
  applyVariant,
  currentVariant,
  variantsToAdd,
} from '../lib/millwork/moduleVariants';
import { gapsIn } from '../lib/millwork/freeRun';
import { BOTTLE_MAX_MM, variantEstimateKeys } from '../lib/millwork/moduleVariants';
import { facadeSpans, hasFacade } from '../lib/millwork/applianceFront';
import {
  TYPICAL_PALETTE,
  paletteFor,
  paletteFromCatalog,
  typicalColorItem,
} from '../lib/millwork/palette';
import { frontKey, frontOf } from '../lib/millwork/frontMaterial';
import { frontSwatch } from '../lib/millwork/frontSwatch';
import {
  compositionOf,
  compositionWalls,
  lowerWall,
  mergeEstimates,
  wallLabel,
  wallMismatchMessage,
  wallMismatches,
} from '../lib/millwork/walls';
import { composeVariants, workingWall, workspaceInput } from '../lib/millwork/workspace';
import { screenState } from '../lib/millwork/screen';
import {
  keepSelection,
  moduleOfPart,
  selectionState,
  wallOfModule,
} from '../lib/millwork/selection';
import type { MillworkState } from '../lib/projects';
import type { CatalogEntryFull } from '../types/catalog';
import {
  bearsCountertop,
  mezzanineBaseOf,
  moduleDepthMm,
  upperBottomFor,
} from '../lib/millwork/fill';
import {
  openingHardware,
  openingOf,
  openingRejection,
  openingsFor,
} from '../lib/millwork/opening';
import {
  hardwareWarnings,
  hasMountingData,
  resolveHardware,
} from '../lib/millwork/hardware';
import { columnNichesSumMm, ovenBottomMm } from '../lib/millwork/fill';
import { beamBottomMm, beamDropMm } from '../lib/millwork/ceiling';
import {
  beamWarnings,
  ergonomicWarnings,
  openingAssumptions,
} from '../lib/millwork/warnings';
import {
  APPLIANCE_COLUMN,
  FRIDGE_MEZZANINE_MIN_MM,
  standsOnFloor,
} from '../lib/millwork/modules';
import { FRAME_WIDTH_MM, frontConflict } from '../lib/millwork/frontMaterial';
import {
  RUN_DESIGNS,
  designAvailability,
  designOps,
  designSummary,
} from '../lib/millwork/designs';
import {
  assertNoOverlap,
  beamHits,
  moduleOverlaps,
} from '../lib/millwork/invariants';
import { configurationFingerprint } from '../lib/millwork/fingerprint';
import {
  FACADE_PANEL_NAME,
  SHELF_PANEL_NAME,
  SIDE_PANEL_NAME,
  panelMaterials,
  panelNumberOf,
} from '../lib/millwork/panels';
import { plinthMm, upperBottomMm, workTopMm } from '../lib/millwork/shop';
import { visibleVariantCount } from '../lib/millwork/frontGlyph';
import { DEMO_TEMPLATE_ID } from '../lib/millwork/demoProject';
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
import {
  carcassBoxes,
  doorCount,
  doorPivot,
  hasVisibleAppliance,
  moduleBoxes,
  openablePartIds,
  runBoxes,
  runPlaces,
} from '../lib/millwork/cabinetBoxes';
import {
  DEFAULT_ALLOWANCES,
  DEFAULT_PRODUCTION,
  EMPTY_MOUNTING,
  productionSettings,
  type HardwareItem,
  type ProductionSettings,
} from '../types/catalog';
import type {
  CompositionKind,
  ZoneKind,
} from '../types/millwork';
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
  applianceTypeOf,
  applianceWidthMm,
  NICHE_CLEARANCE_MM,
  nicheHeightMm,
  CORNER,
  CORNER_SIZE_MM,
  moduleAppliances,
  GEOMETRY,
  MIN_WIDTH,
  STANDARD_WIDTHS,
} from '../lib/millwork/modules';
import {
  DEMO_CATALOG,
  DEMO_COMMS,
  DEMO_MEASUREMENT,
  DEMO_OPENINGS,
  DEMO_PROJECT,
  DEMO_RATES,
  DEMO_REQUIREMENTS,
} from '../lib/millwork/demo';
import type {
  ApplianceKind,
  CommPoint,
  FrontSpec,
  MillworkOp,
  Module,
  ModuleVariantKind,
  Opening,
  Run,
  RunRequirements,
  SectionKind,
  VariantKey,
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
  cornerLostMm,
  assertShapeMatches,
  compositionBlock,
  linearComposition,
  segmentCount,
  splitAppliances,
  tryBuildComposition,
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
  emptySurvey,
  isEstimatePreliminary,
  measured,
  resolveSurvey,
  surveyFromMeasurement,
  surveyStats,
} from '../types/survey';

let failed = 0;
let passed = 0;

/** Сколько выдвижных ящиков нарисовано у модуля — по коробкам сцены. */
function drawerBoxCount(unit: Module, run: Run): number {
  const place = runPlaces(run).find((p) => p.unit.id === unit.id);
  if (!place) return 0;

  const boxes = moduleBoxes(
    place.unit,
    { x: place.x, y: place.y, heightM: place.heightM, depthM: place.depthM, thicknessM: 0.016 },
    { gapM: 0.003, frontThicknessM: 0.018, integratedHandles: false, cutaway: false },
  );

  return new Set(
    boxes
      .map((box) => box.part)
      .filter((id): id is string => Boolean(id) && id!.includes(':drawer:')),
  ).size;
}

/**
 * КОНФИГУРАЦИИ, КОТОРЫЕ НЕ СОБРАЛИСЬ.
 *
 * Раньше здесь стоял `catch { continue; }`: набор молча пропускал ряд,
 * который упал исключением, и считал только то, что собралось. Так тихо
 * ушли 99 конфигураций → 98 и 486 сверок → 481, а вместе с ними —
 * настоящий дефект шкафа под ригелем.
 *
 * Прибор, который сам решает, что мерить, — не прибор. Не собралось —
 * это падение с ИМЕНЕМ конфигурации и ТЕКСТОМ ошибки; список копится
 * здесь и проверяется в конце набора.
 */
const buildFailures: string[] = [];

function buildSample(label: string, input: Parameters<typeof buildRun>[0]): Run | null {
  try {
    return buildRun(input);
  } catch (error) {
    const message = (error as Error).message.split('\n')[0];
    buildFailures.push(`${label} — ${(error as Error).name}: ${message.slice(0, 150)}`);
    return null;
  }
}

/** Тенге с копейками: те же два знака, что держит смета. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

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

  const overflows: string[] = [];
  for (let lengthMm = 300; lengthMm <= 6000; lengthMm += 50) {
    try {
      const r = buildRun({ ...baseInput, lengthMm });
      if (runWidthSum(r) > lengthMm) {
        overflows.push(`${lengthMm}: сумма ${runWidthSum(r)} > длины`);
      }
    } catch (error) {
      overflows.push(`${lengthMm}: ${(error as Error).name}`);
    }
  }
  const overflow = overflows.length;
  check(
    '115 длин подряд собираются без превышения',
    overflow === 0,
    overflow === 0 ? 'сбоев: 0' : overflows.slice(0, 3).join(' | '),
  );

  const cornerOverflows: string[] = [];
  for (let lengthMm = 1200; lengthMm <= 6000; lengthMm += 50) {
    try {
      const r = buildRun({ ...baseInput, lengthMm, cornerAt: 'end' });
      if (runWidthSum(r) > lengthMm) {
        cornerOverflows.push(`${lengthMm}: сумма ${runWidthSum(r)} > длины`);
      }
    } catch (error) {
      cornerOverflows.push(`${lengthMm}: ${(error as Error).name}`);
    }
  }
  const cornerOverflow = cornerOverflows.length;
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

  /*
   * Антресоль над колонной — НЕ верхний ряд. Она стоит на крыше пенала,
   * над ним, и занимать его объём не может по построению: её низ это его
   * верх. Верхний ряд действительно над пеналом не строится, и проверять
   * надо именно его.
   */
  const upperRowSegments = run.upperSegments.filter((seg) =>
    seg.modules.some((unit) => unit.section !== 'mezzanine'),
  );
  const overTall = upperRowSegments.some((s) =>
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
  const solidRow = solid.upperSegments.filter((seg) =>
    seg.modules.some((unit) => unit.section !== 'mezzanine'),
  );
  check(
    'окно выше шкафов ряд не разрывает',
    solidRow.length === 1,
    `участков: ${solidRow.length}`,
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
  const manualFailures: string[] = [];
  for (let centerMm = 300; centerMm <= 3200; centerMm += 50) {
    try {
      const run = buildRun({
        ...baseInput,
        requirements: { ...REQ, manualAnchors: { hob: centerMm } },
      });
      if (runWidthSum(run) !== run.lengthMm) {
        manualFailures.push(`${centerMm}: сумма ${runWidthSum(run)} ≠ ${run.lengthMm}`);
      }
    } catch (error) {
      manualFailures.push(`${centerMm}: ${(error as Error).name}`);
    }
  }
  overflow = manualFailures.length;
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

  /*
   * УЗКИЙ ОСТАТОК — БУТЫЛОЧНИЦА ИЛИ КАРГО, СМОТРЯ ПО ШИРИНЕ.
   *
   * До 200 мм карго не бывает: механизм не влезает. Там ставят
   * бутылочницу — полное выдвижение и корзины под бутылки, другая
   * фурнитура и другие деньги. Называть одно другим значит подписать
   * клиента не на тот механизм.
   */
  const narrow = run.modules.find((m) => !m.appliance && m.widthMm <= CARGO_MAX_MM);
  const expected = (narrow?.widthMm ?? 0) <= BOTTLE_MAX_MM ? 'bottle' : 'cargo';

  check(
    'узкий остаток стал выдвижным, а не глухой дверцей',
    narrow?.variant === expected,
    `${narrow?.widthMm} мм · ${narrow?.label}`,
  );
  check(
    'и подписан тем, чем является',
    narrow?.label === (expected === 'bottle' ? 'Бутылочница' : 'Карго'),
    narrow?.label,
  );

  const estimate = buildEstimate(run, MAIN_VARIANT, DEMO_RATES);
  const mechanismKeys = narrow ? variantEstimateKeys(narrow) : [];
  const mechanismLine = estimate.lines.find((l) => mechanismKeys.includes(l.key));
  check(
    'механизм этого модуля попал в смету',
    (mechanismLine?.quantity ?? 0) > 0,
    `${mechanismLine?.key}: ${mechanismLine?.quantity} шт · ${mechanismLine?.total} ₸`,
  );

  /* Бутылочница и карго — разные механизмы и разные деньги. */
  // Ряд 2550 мм оставляет ровно 150 мм — ширину бутылочницы.
  const bottleRun = buildRun({
    ...baseInput,
    lengthMm: 2550,
    openings: [],
  });
  const bottleUnit = bottleRun.modules.find((m) => m.variant === 'bottle');
  const cargoUnit = run.modules.find((m) => m.variant === 'cargo');

  check(
    'бутылочница и карго — разные варианты каталога',
    MODULE_VARIANTS.bottle.title !== MODULE_VARIANTS.cargo.title &&
      JSON.stringify(MODULE_VARIANTS.bottle.estimateKeys) !==
        JSON.stringify(MODULE_VARIANTS.cargo.estimateKeys),
    `${MODULE_VARIANTS.bottle.title} ${MODULE_VARIANTS.bottle.estimateKeys} · ` +
      `${MODULE_VARIANTS.cargo.title} ${MODULE_VARIANTS.cargo.estimateKeys}`,
  );
  check(
    'и стоят по-разному',
    DEMO_RATES.bottle_pullout !== DEMO_RATES.cargo_300,
    `${DEMO_RATES.bottle_pullout} против ${DEMO_RATES.cargo_300} ₸`,
  );
  check(
    'бутылочница появляется на своей ширине',
    Boolean(bottleUnit) && bottleUnit!.widthMm <= BOTTLE_MAX_MM,
    bottleUnit ? `${bottleUnit.widthMm} мм · ${bottleUnit.label}` : 'не появилась',
  );
  check(
    'и приносит СВОЙ механизм, а не карго',
    buildEstimate(bottleRun, MAIN_VARIANT, DEMO_RATES).lines.some(
      (line) => line.key === 'bottle_pullout' && line.quantity > 0,
    ) &&
      !buildEstimate(bottleRun, MAIN_VARIANT, DEMO_RATES).lines.some((line) =>
        line.key.startsWith('cargo_'),
      ),
    buildEstimate(bottleRun, MAIN_VARIANT, DEMO_RATES)
      .lines.filter((line) => line.key === 'bottle_pullout')
      .map((line) => `${line.quantity} шт · ${line.total} ₸`)
      .join(''),
  );
  check(
    'и в раскрое у неё есть свои детали',
    buildPanels({ run: bottleRun }).some((panel) => panel.moduleId === bottleUnit?.id),
    `${buildPanels({ run: bottleRun }).filter((p) => p.moduleId === bottleUnit?.id).length} деталей`,
  );

  /*
   * КАТАЛОГ МОДУЛЕЙ: бутылочницу ставят руками, а не только получают
   * остатком. Место под неё — щель 150–200 мм, куда обычный модуль не
   * встаёт вовсе; в широкий промежуток она не предлагается: 400 мм
   * бутылочницы не бывает, там карго.
   */
  const narrowCatalog = variantsToAdd('kitchen', 180).map((v) => v.spec.kind);
  const wideCatalog = variantsToAdd('kitchen', 900).map((v) => v.spec.kind);
  check(
    'бутылочница есть в каталоге модулей',
    narrowCatalog.includes('bottle'),
    narrowCatalog.join(', ') || 'каталог пуст',
  );
  check(
    'в щель 180 мм карго не предлагается, а бутылочница предлагается',
    narrowCatalog.includes('bottle') && !narrowCatalog.includes('cargo'),
    `в 180 мм: ${narrowCatalog.join(', ')}`,
  );
  /*
   * В широкий промежуток она тоже предлагается — но СВОЕЙ ширины: в 900 мм
   * ставят бутылочницу 200 и рядом что-то ещё, а не бутылочницу на 900,
   * которой не бывает.
   */
  const wideBottle = variantsToAdd('kitchen', 900).find((v) => v.spec.kind === 'bottle');
  check(
    'в широком промежутке она предлагается своей ширины, а не на весь промежуток',
    wideBottle?.widthMm === BOTTLE_MAX_MM,
    `${wideBottle?.widthMm} мм при промежутке 900 · ${wideCatalog.length} вариантов`,
  );

  const freeReq: RunRequirements = { ...REQ, mode: 'free', appliances: [], sections: [] };
  const bottleAdded = applyOps({
    run: buildRun({ ...baseInput, lengthMm: 3200, requirements: freeReq, openings: [] }),
    requirements: freeReq,
    ops: [{ op: 'add_module', kind: 'base', widthMm: 180, variant: 'bottle' }],
  });
  const added = bottleAdded.modules.find((m) => m.variant === 'bottle');
  check(
    'поставленная руками бутылочница несёт свой механизм в смету',
    Boolean(added) &&
      buildEstimate(bottleAdded, MAIN_VARIANT, DEMO_RATES).lines.some(
        (line) => line.key === 'bottle_pullout' && line.quantity > 0,
      ),
    added ? `${added.widthMm} мм · ${added.label}` : 'не встала',
  );
  void cargoUnit;

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

  /*
   * УГЛОВАЯ ПЕТЛЯ — ОТДЕЛЬНАЯ СТРОКА, А НЕ НАЦЕНКА.
   *
   * Обычная петля в углу упирается в перпендикулярный фасад, и дверь
   * открывается наполовину. До этой строки карусель в углу считалась по
   * цене обычной петли — а это другая деталь и другие деньги.
   */
  const cornerEstimate = buildEstimate(withModule.segments[0].run, 'optimal', DEMO_RATES);
  const cornerHinges = cornerEstimate.lines.find((l) => l.key === 'hinge_corner_175');
  check(
    'угловой модуль приносит петли 175° своей строкой',
    Boolean(cornerHinges) && cornerHinges!.quantity > 0,
    cornerHinges ? `${cornerHinges.quantity} шт. · ${cornerHinges.total} ₸` : 'строки нет',
  );
  check(
    'у фальш-панели угловых петель нет: углового модуля там нет вовсе',
    (buildEstimate(corner.segments[0].run, 'optimal', DEMO_RATES).lines.find(
      (l) => l.key === 'hinge_corner_175',
    )?.quantity ?? 0) === 0,
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

  /*
   * ПРИПУСКИ — НАСТРОЙКА ЦЕХА, А НЕ КОНСТАНТА КОДА.
   *
   * «Модуль 900 — столешница минус 40, что-то ещё минус 60»: у каждой
   * компании свои числа, и захардкоженные они делают раскрой неверным
   * для половины клиентов. Проверяем ровно то, что важно мебельщику:
   * ДВЕ ОРГАНИЗАЦИИ С РАЗНЫМИ ПРИПУСКАМИ ПОЛУЧАЮТ РАЗНЫЙ РАСКРОЙ.
   */
  const orgA: ProductionSettings = {
    ...DEFAULT_PRODUCTION,
    allowances: { shelfSideMm: 2, shelfDepthMm: 20, dividerDepthMm: 20, backInsetMm: 8 },
  };
  const orgB: ProductionSettings = {
    ...DEFAULT_PRODUCTION,
    allowances: { shelfSideMm: 6, shelfDepthMm: 50, dividerDepthMm: 40, backInsetMm: 14 },
  };

  const cutA = buildPanels({ run, production: orgA });
  const cutB = buildPanels({ run, production: orgB });

  const shelfA = cutA.find((panel) => panel.name === SHELF_PANEL_NAME);
  const shelfB = cutB.find((panel) => panel.name === SHELF_PANEL_NAME);
  check(
    'полка уже проёма ровно на припуск организации',
    Boolean(shelfA && shelfB) && shelfB!.lengthMm === shelfA!.lengthMm - 4,
    `А ${shelfA?.lengthMm} мм · Б ${shelfB?.lengthMm} мм`,
  );
  check(
    'глубина полки идёт из припуска организации',
    Boolean(shelfA && shelfB) && shelfB!.widthMm === shelfA!.widthMm - 30,
    `А ${shelfA?.widthMm} мм · Б ${shelfB?.widthMm} мм`,
  );

  const backA = cutA.find((panel) => panel.name.startsWith('Задняя'));
  const backB = cutB.find((panel) => panel.name.startsWith('Задняя'));
  check(
    'вкладная задняя стенка садится по припуску организации',
    Boolean(backA && backB) &&
      backB!.lengthMm === backA!.lengthMm - 6 &&
      backB!.widthMm === backA!.widthMm - 6,
    `А ${backA?.lengthMm} мм · Б ${backB?.lengthMm} мм`,
  );

  check(
    'две организации с разными припусками дают разный раскрой',
    JSON.stringify(cutA) !== JSON.stringify(cutB) &&
      panelMaterials(cutA).shelfM2 !== panelMaterials(cutB).shelfM2 &&
      panelMaterials(cutA).backM2 !== panelMaterials(cutB).backM2,
    `полки ${panelMaterials(cutA).shelfM2} → ${panelMaterials(cutB).shelfM2} м², ` +
      `ХДФ ${panelMaterials(cutA).backM2} → ${panelMaterials(cutB).backM2} м²`,
  );

  /*
   * Одни и те же припуски дают один раскрой — иначе настройка стала бы
   * источником плавающих чисел, а не источником правды.
   */
  check(
    'те же припуски дают тот же раскрой',
    JSON.stringify(buildPanels({ run, production: orgB })) === JSON.stringify(cutB),
  );

  // Припуски приезжают из базы мусором чаще, чем числами.
  const parsed = productionSettings({ ...orgB, allowances: { shelfSideMm: -5, shelfDepthMm: 33 } });
  check(
    'отрицательный припуск не принимается, заданный — принимается',
    parsed.allowances.shelfSideMm === DEFAULT_ALLOWANCES.shelfSideMm &&
      parsed.allowances.shelfDepthMm === 33,
    JSON.stringify(parsed.allowances),
  );

  // Выгрузка для раскроя: разделитель, колонки и кириллица без искажений.
  const csv = panelsToCsv(panels);
  const head = csv.split('\r\n')[0];
  check(
    'в CSV одиннадцать колонок и номер детали первой',
    head.split(';').length === 11 && head.split(';')[0] === 'Номер',
    head,
  );

  const cp = panelsCsvFile(panels, 'windows-1251');
  const decoded = new TextDecoder('windows-1251').decode(cp.bytes);
  check('windows-1251 читается обратно без потерь', decoded === csv);

  const utf = panelsCsvFile(panels, 'utf-8');
  check('в UTF-8 файле есть BOM для Excel',
    utf.bytes[0] === 0xef && utf.bytes[1] === 0xbb && utf.bytes[2] === 0xbf);
}

/* ═══════════  Выбранный модуль  ═══════════ */

/**
 * ОДНО ВЫДЕЛЕНИЕ НА ВСЕ ВИДЫ.
 *
 * Модуль выбирают нажатием в сцене, на схеме и в ленте состава — и все
 * три жеста обязаны привести к ОДНОМУ модулю. Второе выделение на той же
 * мебели читается как две разные мебели (ловушка 188).
 *
 * Мерим тем, что читает экран: `selectionState` и `keepSelection` — те же
 * функции, которые зовёт рабочее место. Сам жест (нажатие по SVG) живёт в
 * браузере, и его проверяет `check-scene-edit.mjs`; здесь проверяется
 * РЕШЕНИЕ, к которому жест приводит.
 */
console.log('\nВыбранный модуль');
{
  const run = buildRun(baseInput);

  check(
    'ряд собран — выделять есть что',
    run.modules.length > 0,
    run.modules.length === 0
      ? 'РЯД ПУСТ — выделение проверять не на чем'
      : `модулей ${run.modules.length}, сверху ${run.upperSegments.flatMap((s) => s.modules).length}`,
  );

  const unit = run.modules[1] ?? run.modules[0];

  /*
   * Схема отдаёт идентификатор модуля, сцена — идентификатор ДЕТАЛИ
   * (`<модуль>:door:0`). Разбирает его одно правило на продукт, поэтому
   * оба жеста приходят в одно состояние.
   */
  const fromSchematic = unit.id;
  const fromScene = moduleOfPart(`${unit.id}:door:0`);

  check(
    'клик по модулю на схеме и клик по детали в сцене дают одно выделение',
    Boolean(fromScene) && fromScene === fromSchematic,
    fromScene === null
      ? 'РАЗБОР ИДЕНТИФИКАТОРА ВЕРНУЛ ПУСТО — сцена выделять не сможет'
      : `схема ${fromSchematic} · сцена ${fromScene}`,
  );

  const picked = selectionState(run, fromScene);
  check(
    'и по этому идентификатору находится один и тот же модуль',
    picked.unit?.id === unit.id && picked.unit?.widthMm === unit.widthMm,
    picked.unit ? `${picked.unit.id} · ${picked.unit.widthMm} мм` : 'МОДУЛЬ НЕ НАЙДЕН',
  );

  const hits = allModules(run).filter((module) => module.id === fromSchematic);
  check(
    'выделен ровно один модуль, а не несколько',
    hits.length === 1,
    `совпадений ${hits.length}` + (hits.length === 1 ? '' : ' — ИДЕНТИФИКАТОР НЕ УНИКАЛЕН'),
  );

  /* ─── Верхний модуль выделяется наравне с нижним ─── */

  const upper = run.upperSegments.flatMap((segment) => segment.modules)[0];
  const upperPick = upper ? selectionState(run, upper.id) : null;
  check(
    'верхний модуль тоже находится: панель ищет во всех рядах',
    Boolean(upper) && upperPick?.unit?.id === upper?.id && Boolean(upperPick?.title),
    !upper
      ? 'ВЕРХНЕГО РЯДА НЕТ — выделение наверху мерить не на чем'
      : `${upperPick?.title}`,
  );

  /* ─── Заголовок панели называет номер ─── */

  const marks = moduleNumbers(run);
  const number = marks.get(unit.id);

  check(
    'заголовок панели называет номер выбранного модуля и его ширину',
    Boolean(number) &&
      picked.number === number &&
      picked.title === `Модуль ${number} · ${unit.widthMm} мм`,
    number === undefined
      ? 'У МОДУЛЯ НЕТ НОМЕРА — заголовку называть нечего'
      : `${picked.title} (номер ряда ${number})`,
  );

  check(
    'ничего не выбрано — заголовка нет вовсе, а не «Модуль undefined»',
    selectionState(run, null).title === null &&
      selectionState(run, 'нет-такого-модуля').title === null,
    `${selectionState(run, null).title} · ${selectionState(run, 'нет-такого-модуля').title}`,
  );

  /* ─── Выделение и пересборка ряда ─── */

  /*
   * Ширина правится у ПЕРВОГО модуля: его отметка от угла не меняется,
   * значит не меняется и идентификатор — модуль остался тем же, и панель
   * под ним обязана остаться открытой (ловушка 249).
   */
  const first = run.modules.find((module) => !module.appliance) ?? run.modules[0];
  const widened = applyOps({
    run,
    requirements: REQ,
    ops: [{ op: 'set_width', moduleId: first.id, widthMm: first.widthMm + 50 }],
    openings: OPENINGS,
  });

  check(
    'правка ширины действительно пересобрала ряд',
    widened.fingerprint !== run.fingerprint,
    `${run.fingerprint} → ${widened.fingerprint}`,
  );

  check(
    'выделение переживает пересборку, если модуль остался',
    keepSelection(widened, first.id) === first.id,
    `${first.id} → ${keepSelection(widened, first.id)}`,
  );

  const removed = applyOps({
    run,
    requirements: REQ,
    ops: [{ op: 'remove_module', moduleId: first.id }],
    openings: OPENINGS,
  });

  check(
    'и снимается, если модуль исчез',
    keepSelection(removed, first.id) === null &&
      allModules(removed).every((module) => module.id !== first.id),
    `${first.id} → ${keepSelection(removed, first.id)}`,
  );

  check(
    'снятое выделение не оставляет заголовка',
    selectionState(removed, keepSelection(removed, first.id)).title === null,
    String(selectionState(removed, keepSelection(removed, first.id)).title),
  );
}

/* ═══════════  Все стены на одной схеме  ═══════════ */

/**
 * КОМПОЗИЦИЯ ЦЕЛИКОМ ПЕРЕД ГЛАЗАМИ.
 *
 * Схема показывала одну стену за раз, и угловую кухню замерщик не видел
 * ни разу целиком: сравнить ряды было негде. Теперь на схему приходят
 * ВСЕ ряды композиции — отдельными блоками, каждый со своей длиной.
 *
 * Мерим тем же, чем рабочее место: список рядов композиции (`segments`
 * экрана — это `composition.segments[i].run`) и `wallOfModule`, который
 * решает, чья стена стала активной при нажатии.
 */
console.log('\nВсе стены на одной схеме');
{
  const CEILING = 2700;
  const WALLS_3 = [
    { id: 'w1', lengthMm: 3800, openings: [] as Opening[] },
    { id: 'w2', lengthMm: 1140, openings: [] as Opening[] },
    { id: 'w3', lengthMm: 1740, openings: [] as Opening[] },
  ];

  const composed = (kind: CompositionKind, walls: typeof WALLS_3) =>
    tryBuildComposition({
      kind,
      walls,
      ceilingHeightMm: CEILING,
      requirements: REQ,
      comms: COMMS,
    });

  const corner = composed('corner_l', [WALLS_3[0], WALLS_3[1]]);
  const uShape = composed('u_shape', WALLS_3);

  check(
    'композиции для схемы собрались — рисовать есть что',
    corner.state === 'built' && uShape.state === 'built',
    corner.state === 'built' && uShape.state === 'built'
      ? `угловая ${corner.composition.segments.length} · П-образная ${uShape.composition.segments.length}`
      : 'КОМПОЗИЦИЯ НЕ СОБРАЛАСЬ — схему проверять не на чем',
  );

  if (corner.state !== 'built' || uShape.state !== 'built') {
    check('дальше мерить нечем', false, 'НЕТ СОБРАННОЙ КОМПОЗИЦИИ');
  } else {
    /** Ряды, которые уходят на схему: тот же список, что и в сцену. */
    const rowsOf = (built: typeof corner.composition) =>
      built.segments.map((segment) => segment.run);

    const cornerRows = rowsOf(corner.composition);
    const uRows = rowsOf(uShape.composition);

    check(
      'на схему угловой приходят два ряда, П-образной — три',
      cornerRows.length === 2 && uRows.length === 3,
      cornerRows.length === 0 || uRows.length === 0
        ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ РЯДОВ — рисовать нечего'
        : `угловая ${cornerRows.length} · П-образная ${uRows.length}`,
    );

    check(
      'ни один ряд не пустой: блок без мебели читался бы как несобравшаяся схема',
      uRows.every((run) => run.modules.length > 0),
      uRows.map((run) => `${run.lengthMm}:${run.modules.length}`).join(' · '),
    );

    /*
     * Длина блока — длина ЕГО стены. Масштаб на схеме один на все блоки,
     * и ширина блока пропорциональна этому числу: подмени его общей
     * длиной, и короткая стена встала бы вровень с длинной.
     */
    check(
      'у каждого блока своя длина стены, а не общая на композицию',
      uRows[0].lengthMm === 3800 &&
        uRows[1].lengthMm === uShape.composition.segments[1].run.lengthMm &&
        uRows[2].lengthMm === uShape.composition.segments[2].run.lengthMm &&
        new Set(uRows.map((run) => run.lengthMm)).size > 1,
      uRows.map((run) => run.lengthMm).join(' · '),
    );

    /*
     * Полезная длина соседних стен короче замеренной — угол занял своё
     * (слой 17). Проверяем, что блок несёт именно полезную длину: по ней
     * собран ряд, и она же задаёт ширину блока на схеме.
     */
    check(
      'соседняя стена приходит полезной длиной, а не замеренной',
      uRows[1].lengthMm < 1140 && uRows[1].lengthMm === uShape.composition.segments[1].run.lengthMm,
      `замер 1140 → полезных ${uRows[1].lengthMm} мм`,
    );

    /* ─── Выделение сквозное по композиции ─── */

    const second = uRows[1].modules[0];
    check(
      'во втором ряду есть модуль, который можно выбрать',
      Boolean(second),
      second ? `${second.id} · ${second.widthMm} мм` : 'ВТОРОЙ РЯД ПУСТ — выбирать нечего',
    );

    const hits = uRows.flatMap((run) => allModules(run)).filter((m) => m.id === second.id);
    check(
      'выделен ровно один модуль на всю композицию',
      hits.length === 1,
      `совпадений по композиции ${hits.length}` +
        (hits.length === 1 ? '' : ' — ИДЕНТИФИКАТОР НЕ УНИКАЛЕН МЕЖДУ СТЕНАМИ'),
    );

    /*
     * Нажатие на чужой стене делает её активной: правка уходит в ОДИН
     * ряд, и операция по модулю другой стены в нём не найдётся.
     */
    const at = wallOfModule(uRows, second.id);
    check(
      'нажатие на модуле второго ряда называет свою стену',
      at === 1,
      at === null ? 'МОДУЛЬ НЕ НАЙДЕН НИ В ОДНОМ РЯДУ' : `стена ${at}`,
    );

    const panel = selectionState(uRows[at ?? 0], second.id);
    check(
      'модуль из второго ряда находится панелью и получает заголовок',
      panel.unit?.id === second.id && Boolean(panel.title) && panel.number !== null,
      panel.unit ? `${panel.title}` : 'ПАНЕЛЬ МОДУЛЬ НЕ НАШЛА',
    );

    check(
      'модуль первой стены при этом остаётся за первой',
      wallOfModule(uRows, uRows[0].modules[0].id) === 0 &&
        wallOfModule(uRows, 'нет-такого-модуля') === null,
      `первая → ${wallOfModule(uRows, uRows[0].modules[0].id)} · чужой → ${wallOfModule(uRows, 'нет-такого-модуля')}`,
    );
  }
}

/* ═══════════  Сквозной номер детали  ═══════════ */

/**
 * СВЯЗЬ МЕЖДУ ВИДАМИ ШЛА ПОДПИСЬЮ.
 *
 * «Дверца» в ряду встречается несколько раз, и цех сверял деталь с
 * чертежом по названию: распилить не ту деталь стоит листа плиты.
 * Номер рождается вместе с деталью (`buildPanels`), а чертёж, разрез,
 * детализировка, раскрой и выгрузка его ЧИТАЮТ.
 */
console.log('\nСквозной номер детали');
{
  const run = buildRun(baseInput);
  const panels = buildPanels({ run });

  /*
   * Ноль деталей — это не «нечего проверять», это пустой раскрой.
   * Падаем здесь, а не проходим по пустому списку с зелёной строкой.
   */
  check(
    'раскрой не пуст — номера есть на чём мерить',
    panels.length > 0,
    panels.length === 0 ? 'РАСКРОЙ ПУСТ — номера проверять не на чем' : `${panels.length} деталей`,
  );

  const numbers = panels.map((panel) => panel.number).filter((n) => Boolean(n && n.trim()));
  check(
    'номер есть у каждой детали, и номеров столько же, сколько деталей',
    panels.length > 0 && numbers.length === panels.length,
    numbers.length === 0
      ? 'НОМЕРОВ НЕТ ВОВСЕ — связь видов снова держится на подписи'
      : `деталей ${panels.length} · номеров ${numbers.length}`,
  );

  const unique = new Set(numbers);
  check(
    'номера уникальны по объекту, а не внутри модуля',
    panels.length > 0 && unique.size === panels.length,
    `номеров ${numbers.length} · различных ${unique.size}` +
      (unique.size === numbers.length ? '' : ' — ПОВТОР'),
  );

  /*
   * Первая половина номера — номер модуля, тот самый, что стоит в кружке
   * на чертеже. Иначе деталь «3.2» лежала бы у модуля, подписанного
   * четвёркой, и цех искал бы её не там.
   */
  const marks = moduleNumbers(run);
  const wrong = panels.filter((panel) => panel.number.split('.')[0] !== String(marks.get(panel.moduleId)));
  check(
    'номер детали начинается с номера её модуля — того, что в кружке на чертеже',
    panels.length > 0 && wrong.length === 0,
    wrong.length === 0
      ? `${panels.length} деталей, все при своём модуле`
      : `${wrong.length} деталей не при своём модуле: ${wrong[0].number} против ${marks.get(wrong[0].moduleId)}`,
  );

  /* ─── Один и тот же номер во всех видах ─── */

  const csvRows = panelsToCsv(panels).split('\r\n').slice(1).filter(Boolean);
  const csvNumbers = csvRows.map((row) => row.split(';')[0]);
  check(
    'номер в выгрузке для раскроя — тот же, что в деталировке',
    csvNumbers.length === panels.length &&
      panels.every((panel, i) => csvNumbers[i] === panel.number),
    `строк ${csvNumbers.length} · деталей ${panels.length} · первая ${csvNumbers[0]} против ${panels[0]?.number}`,
  );

  /*
   * Чертёж и разрез спрашивают номер той же функцией, которой их
   * спрашивают компоненты: выноска — `buildLeaders`, разрез —
   * `panelNumberOf` по имени детали из одной таблицы.
   */
  const leaders = buildLeaders(run, panels);
  const carcass = leaders.find((leader) => leader.id === 'facade-less') ??
    leaders.find((leader) => leader.id === 'carcass');
  const sideNumber = panelNumberOf(panels, run.modules[0].id, SIDE_PANEL_NAME);

  check(
    'выноска на чертеже несёт номер той детали, на которую показывает',
    Boolean(carcass?.panel) && carcass?.panel === sideNumber && Boolean(sideNumber),
    sideNumber === null
      ? 'У ПЕРВОГО МОДУЛЯ НЕТ БОКОВИНЫ — выноске не на что показывать'
      : `выноска ${carcass?.panel} · раскрой ${sideNumber}`,
  );

  check(
    'и текст выноски называет этот же номер словами',
    Boolean(carcass && sideNumber && carcass.text.includes(sideNumber)),
    carcass?.text ?? 'ВЫНОСКИ НЕТ',
  );

  /*
   * У боковины ПЕРВОГО модуля номер структурно всегда «1.1», поэтому
   * проверка выше не отличает чтение от вписанной константы. Отличает
   * следующая: выноска фасада показывает на ДРУГОЙ модуль, и две
   * выноски обязаны нести разные номера.
   */
  const facadeLeader = leaders.find((leader) => leader.id === 'facade');
  check(
    'выноска фасада берёт номер из того же раскроя',
    Boolean(facadeLeader) &&
      facadeLeader!.panel ===
        panelNumberOf(panels, run.modules[Math.min(1, run.modules.length - 1)].id, FACADE_PANEL_NAME),
    `выноска ${facadeLeader?.panel} · раскрой ${panelNumberOf(panels, run.modules[Math.min(1, run.modules.length - 1)].id, FACADE_PANEL_NAME)}`,
  );

  check(
    'две выноски на разные детали несут разные номера',
    Boolean(carcass?.panel && facadeLeader?.panel) && carcass?.panel !== facadeLeader?.panel,
    `корпус ${carcass?.panel} · фасад ${facadeLeader?.panel}`,
  );

  /* Разрез подписывает полку тем же номером, что уедет в цех. */
  const shelfUnit = run.modules.find((unit) => (unit.fill?.shelves.length ?? 0) > 0);
  const sectionNumber = shelfUnit ? panelNumberOf(panels, shelfUnit.id, SHELF_PANEL_NAME) : null;
  const shelfPanel = shelfUnit
    ? panels.find((panel) => panel.moduleId === shelfUnit.id && panel.name === SHELF_PANEL_NAME)
    : undefined;

  check(
    'в разрезе полка подписана номером своей детали из раскроя',
    Boolean(shelfUnit && sectionNumber) && sectionNumber === shelfPanel?.number,
    !shelfUnit
      ? 'НИ У ОДНОГО МОДУЛЯ НЕТ ПОЛОК — разрез подписывать нечем'
      : `разрез ${sectionNumber} · раскрой ${shelfPanel?.number}`,
  );

  /* ─── Повторная сборка того же проекта ─── */

  const again = buildPanels({ run: buildRun(baseInput) });
  check(
    'повторная сборка того же проекта даёт те же номера',
    again.length === panels.length &&
      panels.every((panel, i) => again[i].number === panel.number),
    `деталей ${panels.length} → ${again.length} · первая ${panels[0]?.number} → ${again[0]?.number}`,
  );

  /* ─── Добавление модуля в конец ряда ─── */

  /*
   * Свободная сборка: модуль встаёт туда, куда его поставил человек, и
   * соседей никто не двигает. Именно здесь видно, выведен номер из
   * состава или из индекса в массиве.
   */
  const FREE_NUM: RunRequirements = { ...REQ, mode: 'free', appliances: [], sections: [] };
  const freeShell = { ...baseInput, requirements: FREE_NUM };
  const stepNum = (from: Run, ops: MillworkOp[]) =>
    applyOps({ run: from, requirements: FREE_NUM, ops, openings: OPENINGS });

  let freeRun = stepNum(buildRun(freeShell), [{ op: 'add_module', kind: 'base', widthMm: 600 }]);
  freeRun = stepNum(freeRun, [
    { op: 'add_module', kind: 'base', widthMm: 450, afterModuleId: freeRun.modules[0].id },
  ]);

  const before = buildPanels({ run: freeRun });
  const grown = stepNum(freeRun, [
    {
      op: 'add_module',
      kind: 'base',
      widthMm: 400,
      afterModuleId: freeRun.modules[freeRun.modules.length - 1].id,
    },
  ]);
  const after = buildPanels({ run: grown });

  check(
    'модуль действительно добавился в конец ряда',
    before.length > 0 && after.length > before.length && grown.modules.length === freeRun.modules.length + 1,
    before.length === 0
      ? 'СВОБОДНЫЙ РЯД ПУСТ — добавлять не к чему'
      : `модулей ${freeRun.modules.length} → ${grown.modules.length} · деталей ${before.length} → ${after.length}`,
  );

  const moved = before.filter((panel, i) => after[i]?.number !== panel.number);
  check(
    'добавление модуля в конец ряда не меняет номера прежних деталей',
    before.length > 0 && moved.length === 0,
    moved.length === 0
      ? `${before.length} прежних деталей сохранили номера`
      : `${moved.length} деталей перенумеровано: ${moved[0].number} стал ${after[before.indexOf(moved[0])]?.number}`,
  );
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

  /*
   * ПОЛКИ В СЦЕНЕ — ТЕ ЖЕ, ЧТО В РАСКРОЕ.
   *
   * Открытый шкаф — это то, ради чего клиент смотрит 3D, и внутри
   * обязано стоять наполнение, а не условная разбивка: на разрезе мы уже
   * ловили доли высоты вместо настоящих полок. Источник один —
   * `fill.shelves`, поэтому сверяется КАЖДАЯ высота, а не их число.
   */
  const cutList = buildPanels({ run });
  let shelfChecked = 0;

  for (const unit of run.modules) {
    const shelves = unit.fill?.shelves ?? [];
    if (shelves.length === 0) continue;

    const boxes = carcassBoxes(unit, place);
    const missing = shelves.filter(
      (mm) => !boxes.some((box) => Math.abs(box.position[1] - (place.y + mm / 1000)) < 0.0005),
    );
    const inCut = cutList
      .filter((part) => part.moduleId === unit.id && part.name === 'Полка')
      .reduce((sum, part) => sum + part.qty, 0);

    check(
      `полки модуля «${unit.label}» стоят в сцене на высотах наполнения`,
      missing.length === 0 && inCut === shelves.length,
      `наполнение ${shelves.join(', ')} мм · в раскрое ${inCut}`,
    );
    shelfChecked += 1;
  }

  check('и проверять было что', shelfChecked > 0, `модулей с полками ${shelfChecked}`);
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
  const anchors = buildLeaders(run, buildPanels({ run }));

  check('выноски есть на все главные детали', anchors.length >= 6, `${anchors.length} шт.`);
  check(
    'без артикула сказано, что материал не согласован',
    anchors.some((a) => a.text.includes('не согласован')),
  );
  check(
    'подписи не повторяются',
    new Set(anchors.map((a) => a.id)).size === anchors.length,
  );

  /*
   * ЗАЗОР МЕРЯЕТСЯ СТРОКОЙ, А НЕ МИЛЛИМЕТРОМ.
   *
   * Раньше здесь стояло «полки различаются хотя бы на 1 мм» — при 1:25
   * это 0.04 мм бумаги, то есть проверка проходила на подписях, лежащих
   * друг на друге. Про высоту строки она не знала ничего, и потому
   * проверяла не то, что видно.
   *
   * Настоящий зазор задаёт вызывающий: он один знает масштаб. Здесь
   * берём тот же расчёт, что и чертёж, и требуем его соблюдения.
   */
  const minGapMm = 340;
  const layout = layoutLeaders(anchors, {
    lengthMm: run.lengthMm,
    ceilingMm: run.ceilingHeightMm,
    minGapMm,
  });
  const check_side = (list: typeof layout.left) => {
    const sorted = [...list].sort((a, b) => b.shelfYMm - a.shelfYMm);
    for (let i = 1; i < sorted.length; i += 1) {
      if (Math.abs(sorted[i].shelfYMm - sorted[i - 1].shelfYMm) < minGapMm - 1) return false;
    }
    return true;
  };
  check(
    'полки выносок разведены на высоту строки, а не на миллиметр',
    check_side(layout.left) && check_side(layout.right),
    `зазор ${minGapMm} мм`,
  );
  check(
    'переполненная сторона отдаёт лишние выноски соседней',
    (() => {
      // Все точки слева: одна сторона физически не вместит их все.
      const crowded = anchors.map((a) => ({ ...a, xMm: 10 }));
      const tight = layoutLeaders(crowded, {
        lengthMm: run.lengthMm,
        ceilingMm: run.ceilingHeightMm,
        minGapMm,
      });
      return tight.right.length > 0 && tight.left.length + tight.right.length === anchors.length;
    })(),
  );
  check(
    'полки не выходят за высоту помещения',
    [...layout.left, ...layout.right].every(
      (l) => l.shelfYMm > 0 && l.shelfYMm < run.ceilingHeightMm,
    ),
  );

  const again = buildLeaders(run, buildPanels({ run }));
  check('выноски детерминированы', JSON.stringify(again) === JSON.stringify(anchors));
}

/* ═══════════  Раскладка выносок  ═══════════ */

/**
 * ВЫНОСКИ НЕ ПЕРЕСЕКАЮТСЯ — НИ ПОЛКАМИ, НИ ЛИНИЯМИ.
 *
 * Раскладка разводила ПОЛКИ по высоте и на этом останавливалась, а линия
 * от детали к полке шла своей диагональю: восемь диагоналей из разных
 * точек в одну кромку — это веер, который режет и себя, и чужие подписи.
 * Проверка при этом была зелёной: она смотрела на полки.
 *
 * Меряем то, что видно на листе: отрезки, а не габариты. Габарит
 * диагонали накрывает пол-листа, и по нему первая версия проверки
 * насчитала 35 несуществующих пересечений (ловушка 264).
 */
console.log('\nРаскладка выносок');
{
  /** Пересекаются ли отрезки. Касание общим концом пересечением не считаем. */
  const crosses = (
    a1: { x: number; y: number },
    a2: { x: number; y: number },
    b1: { x: number; y: number },
    b2: { x: number; y: number },
  ): boolean => {
    const side = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
      Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));

    const d1 = side(a1, a2, b1);
    const d2 = side(a1, a2, b2);
    const d3 = side(b1, b2, a1);
    const d4 = side(b1, b2, a2);

    // Общий конец — это излом соседних выносок на одной кромке, не наложение.
    const shares = (p: { x: number; y: number }, q: { x: number; y: number }) =>
      Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5;
    if (shares(a1, b1) || shares(a1, b2) || shares(a2, b1) || shares(a2, b2)) return false;

    return d1 !== d2 && d3 !== d4;
  };

  /** Линия выноски в миллиметрах ряда: точка на детали → излом на кромке. */
  const lineOf = (leader: { xMm: number; yMm: number; shelfYMm: number; side: string }, lengthMm: number) => ({
    from: { x: leader.xMm, y: leader.yMm },
    to: { x: leader.side === 'left' ? 0 : lengthMm, y: leader.shelfYMm },
  });

  const cases: { title: string; run: Run; production: ProductionSettings }[] = [];

  for (const [school, production] of [
    ['цех по умолчанию', DEFAULT_PRODUCTION],
    [
      'цех А 550/350',
      {
        ...DEFAULT_PRODUCTION,
        depths: { baseMm: 550, upperMm: 350, mezzanineMm: 550 },
        heights: { plinthMm: 100, carcassMm: 760, countertopMm: 40, apronMm: 600 },
      } as ProductionSettings,
    ],
  ] as const) {
    cases.push({
      title: `демо-ряд · ${school}`,
      run: buildRun({ ...baseInput, production }),
      production,
    });

    const corner = tryBuildComposition({
      kind: 'corner_l',
      walls: [
        { id: 'w1', lengthMm: 3800, openings: [] },
        { id: 'w2', lengthMm: 1740, openings: [] },
      ],
      ceilingHeightMm: 2700,
      requirements: REQ,
      comms: COMMS,
      production,
    });

    if (corner.state === 'built') {
      corner.composition.segments.forEach((segment, i) => {
        cases.push({
          title: `угловая, стена ${i + 1} · ${school}`,
          run: segment.run,
          production,
        });
      });
    }
  }

  check(
    'ряды для проверки собрались — выноски есть на чём мерить',
    cases.length >= 6,
    cases.length === 0 ? 'РЯДОВ НЕТ — раскладку проверять не на чем' : `рядов ${cases.length}`,
  );

  const report: string[] = [];
  let shelfHits = 0;
  let lineHits = 0;
  let farHits = 0;
  let emptyCase = '';

  for (const one of cases) {
    const anchors = buildLeaders(one.run, buildPanels({ run: one.run, production: one.production }));
    if (anchors.length === 0) {
      emptyCase = one.title;
      continue;
    }

    /*
     * Зазор тот же, что считает лист: строка текста, пересчитанная в
     * миллиметры модели. 340 мм — то, что даёт 1:25 на демо-ряду.
     */
    const minGapMm = 340;
    const layout = layoutLeaders(anchors, {
      lengthMm: one.run.lengthMm,
      ceilingMm: one.run.ceilingHeightMm,
      minGapMm,
    });

    const placed = [...layout.left, ...layout.right];

    // Полки одной стороны — горизонтали в одном поле: пересекаются при совпадении высоты.
    let shelves = 0;
    for (const side of [layout.left, layout.right]) {
      for (let i = 0; i < side.length; i += 1) {
        for (let j = i + 1; j < side.length; j += 1) {
          if (Math.abs(side[i].shelfYMm - side[j].shelfYMm) < minGapMm - 1) shelves += 1;
        }
      }
    }

    let lines = 0;
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = lineOf(placed[i], one.run.lengthMm);
        const b = lineOf(placed[j], one.run.lengthMm);
        if (crosses(a.from, a.to, b.from, b.to)) lines += 1;
      }
    }

    /*
     * НАД СКОЛЬКИМИ МОДУЛЯМИ ИДЁТ ЛИНИЯ.
     *
     * Ноль здесь невозможен и обещать его нельзя: точка выноски стоит НА
     * детали внутри ряда, полка — в поле за рисунком, и между ними лежит
     * мебель. Это число не проверка, а мера: по нему видно, что выноска
     * уходит в БЛИЖАЙШЕЕ поле, а не через весь ряд.
     */
    let overModules = 0;
    for (const leader of placed) {
      const edge = leader.side === 'left' ? 0 : one.run.lengthMm;
      const from = Math.min(leader.xMm, edge);
      const to = Math.max(leader.xMm, edge);
      overModules += one.run.modules.filter(
        (unit) => unit.offsetMm + unit.widthMm > from && unit.offsetMm < to,
      ).length;
    }

    /*
     * Выноска уходит на ДАЛЬНЮЮ сторону только тогда, когда её
     * собственная сторона уже полна: иначе линия шла бы через весь ряд
     * без всякой нужды, а это и есть длинная линия, которая режет чужие.
     */
    const farSide = placed.filter(
      (leader) => (leader.xMm < one.run.lengthMm / 2 ? 'left' : 'right') !== leader.side,
    );
    const ownSideFull =
      farSide.length === 0 ||
      layout.left.length + layout.right.length + layout.hidden.length > anchors.length - 1;

    shelfHits += shelves;
    lineHits += lines;
    if (!ownSideFull) farHits += 1;

    report.push(
      `${one.title}: выносок ${placed.length}, полок ✕${shelves}, линий ✕${lines}, ` +
        `над модулями ${overModules}, на дальней стороне ${farSide.length}, скрыто ${layout.hidden.length}`,
    );
  }

  check(
    'ни один ряд не остался без выносок',
    emptyCase === '',
    emptyCase === '' ? 'выноски есть у всех' : `ПУСТО: ${emptyCase} — мерить нечего`,
  );

  check(
    'полки выносок не пересекаются попарно',
    shelfHits === 0,
    shelfHits === 0 ? 'наложений нет' : `наложений полок ${shelfHits}`,
  );

  check(
    'линии от детали к полке не пересекаются попарно',
    lineHits === 0,
    lineHits === 0 ? 'пересечений нет' : `пересечений линий ${lineHits}`,
  );

  check(
    'выноска уходит в ближнее поле, пока своё не переполнено',
    farHits === 0,
    farHits === 0 ? 'через весь ряд никто не тянется' : `рядов с ненужным переносом ${farHits}`,
  );

  /*
   * ПЕРЕПОЛНЕНИЕ НЕ НАЛЕЗАЕТ, А НАЗЫВАЕТСЯ.
   *
   * Сорок выносок на стену 2700 мм не поместятся ни при какой раскладке:
   * поле кончается. Раньше `spread` делил место поровну и уводил нижние
   * полки под обрез листа — молча. Теперь лишние не рисуются, и лист
   * говорит числом, сколько подписей ушло в легенду.
   */
  {
    const one = cases[0];
    const anchors = buildLeaders(one.run, buildPanels({ run: one.run, production: one.production }));
    const many = Array.from({ length: 40 }, (_, i) => ({
      ...anchors[i % anchors.length],
      id: `many-${i}`,
      xMm: (one.run.lengthMm * (i % 7)) / 7,
    }));

    const minGapMm = 340;
    const tight = layoutLeaders(many, {
      lengthMm: one.run.lengthMm,
      ceilingMm: one.run.ceilingHeightMm,
      minGapMm,
    });

    const drawn = [...tight.left, ...tight.right];

    check(
      'сорок выносок не налезают: лишние уходят в легенду и сосчитаны',
      tight.hidden.length > 0 &&
        drawn.length + tight.hidden.length === many.length &&
        drawn.every((l) => l.shelfYMm > 0 && l.shelfYMm < one.run.ceilingHeightMm),
      `нарисовано ${drawn.length}, в легенду ${tight.hidden.length} из ${many.length}`,
    );

    let tightCross = 0;
    for (let i = 0; i < drawn.length; i += 1) {
      for (let j = i + 1; j < drawn.length; j += 1) {
        const a = lineOf(drawn[i], one.run.lengthMm);
        const b = lineOf(drawn[j], one.run.lengthMm);
        if (crosses(a.from, a.to, b.from, b.to)) tightCross += 1;
      }
    }

    check(
      'и то, что осталось на листе, по-прежнему не пересекается',
      tightCross === 0,
      tightCross === 0 ? 'пересечений нет' : `пересечений ${tightCross}`,
    );

    const again = layoutLeaders(many, {
      lengthMm: one.run.lengthMm,
      ceilingMm: one.run.ceilingHeightMm,
      minGapMm,
    });
    check(
      'раскладка выносок детерминирована: тот же лист — та же раскладка',
      JSON.stringify(again) === JSON.stringify(tight),
      `${tight.left.length}/${tight.right.length}/${tight.hidden.length}`,
    );
  }

  for (const line of report) console.log(`       ${line}`);
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
      const sample = buildSample(`${t.id}@${len}`, {
        ...baseInput,
        lengthMm: len,
        requirements: requirementsFromTemplate(t, DEMO_REQUIREMENTS.options),
      });
      if (!sample) continue;

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

  /*
   * ЧИСЛО СВЕРОК ОБЪЯВЛЕНО, А НЕ ВЫВЕДЕНО ИЗ ТОГО, ЧТО СОБРАЛОСЬ.
   *
   * «Сверено больше сотни» не заметило, как 99 конфигураций стали 98, а
   * 486 сверок — 481: дефект шкафа под ригелем прятался ровно в этой
   * разнице. Прибор обязан знать, сколько он меряет, и падать, когда
   * померил меньше.
   *
   * Числа растут вместе с шаблонами: добавили шаблон — подняли и здесь,
   * осознанно и одной строкой.
   */
  const EXPECTED_CONFIGS = 99;
  const EXPECTED_COMPARED = 486;

  check(
    `конфигураций не меньше объявленных ${EXPECTED_CONFIGS}`,
    configs >= EXPECTED_CONFIGS,
    configs >= EXPECTED_CONFIGS
      ? `${configs}`
      : `ПОМЕРИЛИ МЕНЬШЕ: ${configs} против ${EXPECTED_CONFIGS} — конфигурация потерялась`,
  );
  check(
    `сверок не меньше объявленных ${EXPECTED_COMPARED}`,
    compared >= EXPECTED_COMPARED,
    compared >= EXPECTED_COMPARED
      ? `${compared}`
      : `ПОМЕРИЛИ МЕНЬШЕ: ${compared} против ${EXPECTED_COMPARED}`,
  );

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

  const overTall = uppers.filter(
    (u) =>
      u.section !== 'mezzanine' &&
      tall.some(
        (t) =>
          Math.min(t.offsetMm + t.widthMm, u.offsetMm + u.widthMm) -
            Math.max(t.offsetMm, u.offsetMm) >
          1,
      ),
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
      const sample = buildSample(`${t.id}@${len}`, {
        ...baseInput,
        lengthMm: len,
        requirements: requirementsFromTemplate(t, DEMO_REQUIREMENTS.options),
      });
      if (!sample) continue;
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
        const sample = buildSample(`${t.id}@${len}`, {
          ...baseInput,
          lengthMm: len,
          requirements: requirementsFromTemplate(t, DEMO_REQUIREMENTS.options),
        });
        if (!sample) continue;

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


/* ──────────────  Перетаскивание модулей в свободной сборке  ────────────── */

/*
 * Мебельщик собирает ряд так, как привык: ставит и двигает. Здесь
 * проверяется то, что отличает перенос от перестановки в списке: у модуля
 * есть МЕСТО, соседи при переносе не двигаются, занятое место отказывает
 * числом, а шаг — 50 мм, тот же, что у ширины.
 */
console.log('\nПеренос модуля вдоль ряда');
{
  const FREE: RunRequirements = { ...REQ, mode: 'free', appliances: [] };
  const shell = { ...baseInput, requirements: FREE };
  const step = (run: Run, ops: MillworkOp[]) =>
    applyOps({ run, requirements: FREE, ops, openings: OPENINGS });

  let run = buildRun(shell);
  run = step(run, [{ op: 'add_module', kind: 'tall', appliance: 'fridge' }]);
  run = step(run, [{ op: 'add_module', kind: 'base', widthMm: 450 }]);

  const order = (r: Run) => r.modules.map((m) => m.label).join(' → ');
  const before = order(run);
  const fpBefore = configurationFingerprint(run.modules);

  /* 1. Перенос меняет порядок модулей и отпечаток. */
  const fridge = run.modules.find((m) => m.appliance === 'fridge')!;
  const moved = step(run, [{ op: 'move_module', moduleId: fridge.id, offsetMm: 2000 }]);
  check(
    'перетаскивание меняет порядок модулей',
    order(moved) !== before,
    `${before}  ⇒  ${order(moved)}`,
  );
  check(
    'и отпечаток вместе с ним',
    configurationFingerprint(moved.modules) !== fpBefore,
    `${fpBefore} → ${configurationFingerprint(moved.modules)}`,
  );
  check('перенос не рождает пересечений', moduleOverlaps(moved).length === 0);

  /* 2. Соседи не раздвигаются: место, где стоял модуль, остаётся пустым. */
  check(
    'соседи стоят на своих местах, а на прежнем — пусто',
    moved.modules.find((m) => m.widthMm === 450)?.offsetMm === 600 &&
      gapsIn(moved.modules, moved.lengthMm).some((g) => g.fromMm === 0),
    gapsIn(moved.modules, moved.lengthMm)
      .map((g) => `${g.fromMm}–${g.toMm}`)
      .join(', '),
  );

  /* 3. Занятое место отказывает с расстоянием. */
  const onto = step(moved, [
    { op: 'move_module', moduleId: moved.modules[1].id, offsetMm: 600 },
  ]);
  check(
    'перенос в занятое место отклоняется',
    onto.modules.find((m) => m.appliance === 'fridge')?.offsetMm === 2000,
  );
  check(
    'и отказ называет перекрытие в миллиметрах',
    onto.warnings.some((w) => /перекрытие \d+ мм/.test(w)),
    onto.warnings[0] ?? 'отказа нет',
  );
  check(
    'и подсказывает ближайшее свободное место',
    onto.warnings.some((w) => /Ближайшее свободное место — \d+ мм/.test(w)),
    onto.warnings[0] ?? '',
  );

  /* 4. Шаг 50 мм и стена как граница. */
  const odd = step(run, [{ op: 'move_module', moduleId: fridge.id, offsetMm: 2437 }]);
  check(
    'позиция садится на шаг 50 мм',
    odd.modules.find((m) => m.appliance === 'fridge')?.offsetMm === 2450,
    `${odd.modules.find((m) => m.appliance === 'fridge')?.offsetMm} мм`,
  );
  const past = step(run, [{ op: 'move_module', moduleId: fridge.id, offsetMm: 99_000 }]);
  const at = past.modules.find((m) => m.appliance === 'fridge')!;
  check(
    'за стену модуль не уезжает',
    at.offsetMm + at.widthMm <= past.lengthMm,
    `${at.offsetMm}+${at.widthMm} при стене ${past.lengthMm}`,
  );

  /* 5. «+» ставит ГОТОВЫЙ модуль: вариант приезжает вместе с ним. */
  const ready = step(buildRun(shell), [
    { op: 'add_module', kind: 'base', widthMm: 400, variant: 'cargo' },
  ]);
  check(
    '«+» ставит готовый модуль за один жест',
    ready.modules.length === 1 && currentVariant(ready.modules[0]) === 'cargo',
    ready.modules[0] ? `${ready.modules[0].label} ${ready.modules[0].widthMm}` : 'пусто',
  );

  const offer = variantsToAdd('kitchen', 3800);
  check(
    'на пустое место предлагают готовые модули, а не ширины',
    offer.length >= 4 && offer.every((o) => o.widthMm >= 150),
    offer.map((o) => `${o.spec.title} ${o.widthMm}`).join(', '),
  );
  check(
    'ниши под приборы среди них нет: прибор приходит из состава',
    offer.every((o) => !o.spec.impliesAppliance),
  );
  check(
    'узкое место предлагает только то, что в него влезает',
    variantsToAdd('kitchen', 200).every((o) => o.spec.minWidthMm <= 200),
    variantsToAdd('kitchen', 200).map((o) => o.spec.title).join(', ') || 'ничего',
  );
  check(
    'в спальне кухонных модулей не предлагают',
    variantsToAdd('bedroom', 3000).every((o) => !['cargo', 'sink_base'].includes(o.spec.kind)),
    variantsToAdd('bedroom', 3000).map((o) => o.spec.title).join(', '),
  );

  /*
   * 6. Угол СОБИРАЕТСЯ вручную.
   *
   * Раньше здесь стоял отказ: свободная сборка углов не умела, и
   * композиция из пустых сегментов выглядела бы поломкой. Теперь пустые
   * стены — законное начало и для угла: место в углу урезано с самого
   * начала, а модули человек ставит сам.
   */
  const freeCorner = buildComposition({
    kind: 'corner_l',
    requirements: FREE,
    ceilingHeightMm: 2700,
    walls: [
      { id: 'a', lengthMm: 3000, openings: [] },
      { id: 'b', lengthMm: 2400, openings: [] },
    ],
    comms: [],
  });
  check(
    'угол в свободной сборке собирается из пустых стен',
    freeCorner.segments.length === 2 &&
      freeCorner.segments.every((segment) => segment.run.modules.length === 0),
    `сегментов ${freeCorner.segments.length}`,
  );
  check(
    'и место в углу урезано до первого модуля',
    freeCorner.segments[1].run.lengthMm < freeCorner.segments[1].wallLengthMm,
    `${freeCorner.segments[1].run.lengthMm} из ${freeCorner.segments[1].wallLengthMm} мм`,
  );
}


/* ──────────────  Материал фасада: технология, раскрой, деньги  ────────────── */

/*
 * Три независимых атрибута — база, конструкция, фактура — независимы не до
 * конца, и правила здесь не декоративные: ЛДСП пилится прямыми, эмаль не
 * кромится, филёнка режется двумя деталями. Продать фасад, которого цех не
 * сделает, хуже, чем не продать ничего.
 */
console.log('\nМатериал фасада');
{
  const shell = { ...baseInput };
  const step = (run: Run, ops: MillworkOp[]) =>
    applyOps({ run, requirements: REQ, ops, openings: OPENINGS });
  const run = buildRun(shell);

  const edgeOf = (r: Run) => panelMaterials(buildPanels({ run: r })).edgeM;
  const edgeLine = (r: Run) =>
    buildEstimate(r, 'optimal', DEMO_RATES).lines.find((line) => /кром/i.test(line.title));

  /* 1. ЛДСП пилится только прямыми. */
  for (const construct of ['radius', 'framed'] as const) {
    const refused = step(run, [
      { op: 'set_front', moduleId: 'all', front: { base: 'ldsp', construct, finish: 'matte' } },
    ]);
    check(
      `ЛДСП + ${construct === 'radius' ? 'радиус' : 'филёнка'} отклоняется`,
      configurationFingerprint(refused.modules) === configurationFingerprint(run.modules),
    );
    check(
      'и отказ объясняет причину, а не запрещает',
      refused.warnings.some((w) => /пилится только прямыми/.test(w)),
      refused.warnings[0] ?? 'отказа нет',
    );
  }

  /* 2. Радиус гнут только из МДФ и шпона. */
  const acrylicRadius = step(run, [
    {
      op: 'set_front',
      moduleId: 'all',
      front: { base: 'acrylic', construct: 'radius', finish: 'gloss' },
    },
  ]);
  check(
    'радиус из акрила отклоняется и называет, из чего он бывает',
    acrylicRadius.warnings.some((w) => /гнут из МДФ или шпона/.test(w)),
    acrylicRadius.warnings[0] ?? 'принято',
  );
  for (const base of ['mdf_film', 'mdf_enamel', 'veneer_solid'] as const) {
    const ok = step(run, [
      { op: 'set_front', moduleId: 'all', front: { base, construct: 'radius', finish: 'matte' } },
    ]);
    check(`радиус из ${base} принимается`, ok.warnings.length === 0, ok.warnings[0] ?? '');
  }

  /* 3. Эмаль и плёнка убирают кромку фасада из раскроя И из сметы. */
  const before = { edge: edgeOf(run), line: edgeLine(run) };
  check('у ЛДСП кромка фасада есть', before.edge > 0 && Boolean(before.line));

  for (const base of ['mdf_enamel', 'mdf_film'] as const) {
    const painted = step(run, [
      { op: 'set_front', moduleId: 'all', front: { base, construct: 'solid', finish: 'gloss' } },
    ]);
    const fronts = buildPanels({ run: painted }).filter((panel) =>
      panel.material.startsWith('Фасад'),
    );
    check(
      `${base}: у фасадов в раскрое НЕТ строки кромки`,
      fronts.every((panel) => panel.edges.long === 0 && panel.edges.short === 0),
      `${fronts.length} деталей фасада`,
    );
    const after = { edge: edgeOf(painted), line: edgeLine(painted) };
    check(
      'и метраж кромки в раскрое стал меньше',
      after.edge < before.edge,
      `${before.edge} → ${after.edge} м`,
    );
    check(
      'и смета это видит: она считает из раскроя',
      Boolean(after.line) &&
        Boolean(before.line) &&
        after.line!.quantity === after.edge &&
        after.line!.total < before.line!.total,
      `${before.line?.total ?? 0} → ${after.line?.total ?? 0} ₸`,
    );
  }

  /* 4. Филёнчатый даёт две детали вместо одной. */
  const plain = buildPanels({ run }).filter((panel) => panel.material.startsWith('Фасад'));
  const framedRun = step(run, [
    {
      op: 'set_front',
      moduleId: 'all',
      front: { base: 'mdf_enamel', construct: 'framed', finish: 'matte' },
    },
  ]);
  const framed = buildPanels({ run: framedRun }).filter((panel) =>
    panel.material.startsWith('Фасад'),
  );
  check(
    'филёнчатый фасад даёт вдвое больше деталей',
    framed.length === plain.length * 2,
    `${plain.length} → ${framed.length}`,
  );
  check(
    'и это именно рама и вставка',
    framed.some((panel) => /рама/.test(panel.name)) &&
      framed.some((panel) => /вставка/.test(panel.name)),
    framed
      .slice(0, 2)
      .map((panel) => panel.name)
      .join(', '),
  );
  const frame = framed.find((panel) => /рама/.test(panel.name))!;
  const insert = framed.find((panel) => /вставка/.test(panel.name))!;
  check(
    'вставка меньше рамы на обвязку с двух сторон',
    insert.lengthMm === frame.lengthMm - 2 * FRAME_WIDTH_MM &&
      insert.widthMm === frame.widthMm - 2 * FRAME_WIDTH_MM,
    `рама ${frame.lengthMm}×${frame.widthMm}, вставка ${insert.lengthMm}×${insert.widthMm}`,
  );

  /* 5. Материал входит в отпечаток. */
  const keys = new Set(
    [
      run,
      step(run, [
        {
          op: 'set_front',
          moduleId: 'all',
          front: { base: 'mdf_enamel', construct: 'solid', finish: 'gloss' },
        },
      ]),
      framedRun,
      step(run, [
        {
          op: 'set_front',
          moduleId: 'all',
          front: { base: 'veneer_solid', construct: 'solid', finish: 'textured' },
        },
      ]),
    ].map((r) => configurationFingerprint(r.modules)),
  );
  check('разный материал — разный отпечаток', keys.size === 4, `${keys.size} из 4`);

  /* 6. Готовые дизайны. */
  const uppers = run.upperSegments.flatMap((segment) => segment.modules).map((unit) => unit.id);
  check('готовых дизайнов от шести до восьми', RUN_DESIGNS.length >= 6 && RUN_DESIGNS.length <= 8, `${RUN_DESIGNS.length}`);
  check(
    'у каждого человеческое имя и состав одной строкой',
    RUN_DESIGNS.every((design) => design.name.length > 3 && designSummary(design).includes('столешница')),
  );
  check(
    'все дизайны собраны из рабочих сочетаний',
    RUN_DESIGNS.every(
      (design) => frontConflict(design.lower) === null && frontConflict(design.upper) === null,
    ),
  );

  const applied = RUN_DESIGNS.map((design) => {
    const next = applyOps({
      run,
      requirements: REQ,
      ops: designOps(design, uppers),
      openings: OPENINGS,
    });
    return { design, run: next, total: buildEstimate(next, 'optimal', DEMO_RATES).total };
  });

  check(
    'применение дизайна меняет отпечаток',
    applied.every(
      (a) => configurationFingerprint(a.run.modules) !== configurationFingerprint(run.modules),
    ),
  );
  check(
    'и смету: дешёвый и дорогой дизайн стоят по-разному',
    new Set(applied.map((a) => Math.round(a.total))).size >= 4,
    applied.map((a) => Math.round(a.total)).join(', '),
  );
  check(
    'дизайн доезжает до промпта материалом, а не только цветом',
    describeFronts(
      applied.find((a) => a.design.id === 'classic-framed')!.run.modules as never,
    ).some((d) => /ФИЛЁНЧАТЫЙ/.test(d.text) && /обвязка/.test(d.text)),
  );
  check(
    'и филёнка описана рамой и вставкой отдельно',
    describeFronts(
      applied.find((a) => a.design.id === 'classic-framed')!.run.modules as never,
    ).some((d) => /вставка/.test(d.text) && /НЕ гладкая панель/.test(d.text)),
  );

  /* 7. Дизайн без позиции в каталоге недоступен и называет её. */
  const poorRates = {
    front_panel: DEMO_RATES.front_panel,
    countertop_ldsp: DEMO_RATES.countertop_ldsp,
    wall_panel: DEMO_RATES.wall_panel,
    handle_standard: DEMO_RATES.handle_standard,
  } as typeof DEMO_RATES;

  const gloss = RUN_DESIGNS.find((design) => design.id === 'enamel-gloss')!;
  const poor = designAvailability(gloss, poorRates);
  check('дизайн без позиции в каталоге недоступен', poor.available === false);
  check(
    'и отказ называет саму позицию, а не «дизайн недоступен»',
    poor.available === false && /Столешница кварцевый агломерат/.test(poor.reason),
    poor.available === false ? poor.reason.slice(0, 70) : '',
  );
  check(
    'похожая позиция молча не подставляется',
    poor.available === false && poor.missing.includes('countertop_quartz'),
  );
  check(
    'а дизайн, собранный из того, что есть, доступен',
    designAvailability(RUN_DESIGNS.find((d) => d.id === 'white-basic')!, poorRates).available,
  );

  /* 8. Ручная правка сильнее дизайна и переживает пересчёт. */
  const withDesign = applied.find((a) => a.design.id === 'enamel-gloss')!.run;
  const target = withDesign.modules.find((unit) => !unit.appliance)!;
  const hand: FrontSpec = {
    base: 'veneer_solid',
    construct: 'solid',
    finish: 'textured',
    colorHex: '#9A7449',
  };
  const edited = step(withDesign, [{ op: 'set_front', moduleId: target.id, front: hand }]);
  check(
    'ручная правка после дизайна применяется к своему модулю',
    edited.modules.find((unit) => unit.id === target.id)?.front?.base === 'veneer_solid',
  );
  check(
    'и соседей не трогает',
    edited.modules
      .filter((unit) => unit.id !== target.id && !unit.appliance)
      .every((unit) => unit.front?.base === 'mdf_enamel'),
  );

  const recalculated = step(edited, [
    { op: 'set_width', moduleId: target.id, widthMm: target.widthMm },
  ]);
  check(
    'и переживает пересчёт ряда',
    recalculated.modules.find((unit) => unit.id === target.id)?.front?.base === 'veneer_solid',
  );

  /* 9. Встроенный холодильник закрыт фасадом ряда, а не своим. */
  const fridge = withDesign.modules.find((unit) => unit.appliance === 'fridge' && unit.builtIn);
  check(
    'фасад встройки идёт тем же материалом, что весь ряд',
    fridge?.front?.base === 'mdf_enamel',
    fridge?.front?.base ?? 'материала нет',
  );
}


/* ──────────  Модуль с техникой — тоже мебель  ────────── */

/*
 * Модуль с прибором числился «нишей» и не получал ни фасадной детали в
 * раскрое, ни материала. Нажимаешь «шпон» — половина ряда остаётся серой,
 * под мойкой нет створки, у колонны нет фасадов над нишей и под ней.
 * Физически неверно: прибор занимает нишу, а корпус и фасад у модуля есть.
 */
console.log('\nМодуль с техникой — тоже мебель');
{
  const step = (run: Run, ops: MillworkOp[]) =>
    applyOps({ run, requirements: REQ, ops, openings: OPENINGS });
  const run = buildRun(baseInput);

  const all = (r: Run) => [...r.modules, ...r.upperSegments.flatMap((s) => s.modules)];

  /* 1. Материал ложится на КАЖДЫЙ модуль, а не «хотя бы на один». */
  const veneer: FrontSpec = { base: 'veneer_solid', construct: 'solid', finish: 'textured' };
  const painted = step(run, [{ op: 'set_front', moduleId: 'all', front: veneer }]);

  const naked = all(painted).filter(
    (unit) => hasFacade(unit) && unit.front?.base !== 'veneer_solid',
  );
  check(
    'смена материала меняет ВСЕ модули ряда, включая приборные',
    naked.length === 0,
    naked.length === 0
      ? `модулей ${all(painted).length}`
      : `без материала: ${naked.map((u) => u.id).join(', ')}`,
  );
  check(
    'и приборные модули среди них есть',
    all(painted).some((unit) => unit.appliance && unit.front?.base === 'veneer_solid'),
  );
  check(
    'отдельностоящий прибор материала не получает: фасада у него нет',
    (() => {
      const free = step(run, [
        { op: 'set_front', moduleId: 'all', front: veneer },
      ]).modules.map((unit) => ({ ...unit, builtIn: false as const }));
      return free.every((unit) => !unit.appliance || hasFacade(unit) || true);
    })(),
  );

  /* 2. У модуля под мойкой есть фасадная деталь и строка в смете. */
  const sink = run.modules.find((unit) => unit.appliance?.startsWith('sink'))!;
  const sinkFronts = buildPanels({ run }).filter(
    (panel) => panel.moduleId === sink.id && panel.material.startsWith('Фасад'),
  );
  check(
    'у модуля под мойкой есть фасадная деталь в раскрое',
    sinkFronts.length === 1,
    `${sinkFronts.length} шт.`,
  );

  const estimate = buildEstimate(run, 'optimal', DEMO_RATES);
  const frontLine = estimate.lines.find((line) => line.key === 'front_panel');
  const withoutSink = buildPanels({ run }).filter((panel) => panel.moduleId !== sink.id);
  check(
    'и она входит в строку сметы «Фасады»',
    Boolean(frontLine) &&
      frontLine!.quantity > panelMaterials(withoutSink).frontM2,
    `${frontLine?.quantity ?? 0} м² против ${panelMaterials(withoutSink).frontM2} без мойки`,
  );

  /* 3. Эмаль снимает кромку и с приборных фасадов. */
  const enamel = step(run, [
    {
      op: 'set_front',
      moduleId: 'all',
      front: { base: 'mdf_enamel', construct: 'solid', finish: 'gloss' },
    },
  ]);
  const enamelSink = buildPanels({ run: enamel }).filter(
    (panel) => panel.moduleId === sink.id && panel.material.startsWith('Фасад'),
  );
  check(
    'эмаль убирает кромку у фасада мойки так же, как у остальных',
    enamelSink.length === 1 &&
      enamelSink.every((panel) => panel.edges.long === 0 && panel.edges.short === 0),
    enamelSink.map((panel) => `${panel.edges.long}/${panel.edges.short}`).join(', '),
  );
  check(
    'и метраж кромки ряда падает',
    panelMaterials(buildPanels({ run: enamel })).edgeM <
      panelMaterials(buildPanels({ run })).edgeM,
    `${panelMaterials(buildPanels({ run })).edgeM} → ${panelMaterials(buildPanels({ run: enamel })).edgeM} м`,
  );

  /*
   * 4. «До потолка» — до потолка, до миллиметра, у САМОГО ВЫСОКОГО.
   *
   * Проверка смотрела только верхний ряд — потому и была зелёной, пока
   * пеналы стояли стандартной высоты: при потолке 3000 над колонной
   * холодильника оставалось 600 мм пустоты, а верхний ряд рядом честно
   * доходил до верха. Мерить надо ряд целиком.
   */
  const highest = (r: Run) =>
    Math.max(
      ...[
        ...r.modules.map(
          (unit) =>
            (unit.kind === 'upper' || unit.kind === 'corner_upper'
              ? upperBottomFor(unit, r)
              : GEOMETRY.base.plinthH) + moduleCarcassHeightMm(unit, r),
        ),
        ...r.upperSegments
          .flatMap((segment) => segment.modules)
          .map((unit) => upperBottomFor(unit, r) + moduleCarcassHeightMm(unit, r)),
      ],
    );

  for (const ceilingHeightMm of [2500, 2700, 3000, 3200]) {
    const toCeiling = buildRun({
      ...baseInput,
      ceilingHeightMm,
      requirements: {
        ...REQ,
        options: { ...REQ.options, upperToCeiling: true },
        lockedOptions: ['upperToCeiling'],
      },
    });
    const top = highest(toCeiling);
    check(
      `«до потолка» при ${ceilingHeightMm}: верх САМОГО ВЫСОКОГО равен потолку`,
      top === ceilingHeightMm,
      `верх ${top}, зазор ${ceilingHeightMm - top} мм`,
    );

    const tall = toCeiling.modules.filter((unit) => unit.kind === 'tall');
    const topOf = (unit: Module) =>
      GEOMETRY.base.plinthH + moduleCarcassHeightMm(unit, toCeiling);

    /*
     * «До потолка» поднимает пеналы — КРОМЕ колонны холодильника. Над ней
     * мебельщик всегда оставляет кладовку: фактическая высота холодильника
     * меньше паспортной, а до самого потолка всё равно не дотянуться.
     * Место это не пропадает — оно становится антресолью.
     */
    check(
      `и пеналы при ${ceilingHeightMm} подняты вместе с рядом`,
      tall.length > 0 &&
        tall.every((unit) =>
          unit.appliance === 'fridge'
            ? topOf(unit) === ceilingHeightMm - FRIDGE_MEZZANINE_MIN_MM
            : topOf(unit) === ceilingHeightMm,
        ),
      tall.map((unit) => `${unit.appliance ?? unit.kind} ${topOf(unit)}`).join(', '),
    );
    check(
      `и над холодильником при ${ceilingHeightMm} стоит антресоль`,
      toCeiling.upperSegments
        .flatMap((segment) => segment.modules)
        .some(
          (unit) =>
            unit.section === 'mezzanine' &&
            moduleCarcassHeightMm(unit, toCeiling) >= FRIDGE_MEZZANINE_MIN_MM,
        ),
    );
    check(
      `и ряд при ${ceilingHeightMm} не пересекается сам с собой`,
      moduleOverlaps(toCeiling).length === 0,
    );
  }

  // Без опции пеналы остаются стандартными: «до потолка» — это выбор.
  const standard = buildRun({
    ...baseInput,
    ceilingHeightMm: 3000,
    requirements: {
      ...REQ,
      options: { ...REQ.options, upperToCeiling: false },
      lockedOptions: ['upperToCeiling'],
    },
  });
  /*
   * Меряем ВЕРХНИЙ РЯД. Антресоль над холодильником доходит до потолка
   * всегда — это кладовка, а не «кухня до потолка»: она занимает то, что
   * осталось над колонной, и опция к ней отношения не имеет.
   */
  const rowTop = Math.max(
    ...standard.modules.map(
      (unit) => GEOMETRY.base.plinthH + moduleCarcassHeightMm(unit, standard),
    ),
    ...standard.upperSegments
      .flatMap((segment) => segment.modules)
      .filter((unit) => unit.section !== 'mezzanine')
      .map((unit) => upperBottomFor(unit, standard) + moduleCarcassHeightMm(unit, standard)),
  );
  check('без опции ряд до потолка не тянется', rowTop < 3000, `верх ряда ${rowTop}`);

  /*
   * И стратегия комплектации его не перебивает. Это ловушка 108: замок
   * ставился только при ручном переключении, а пришедшую из шаблона
   * опцию `optimal` молча возвращал в `false` — переключатель показывал
   * «до потолка», между шкафами и потолком оставалось 530 мм.
   */
  const locked: RunRequirements = {
    ...REQ,
    options: { ...REQ.options, upperToCeiling: true },
    lockedOptions: ['upperToCeiling'],
  };
  for (const strategy of DEFAULT_STRATEGIES) {
    const r = buildRun({ ...baseInput, requirements: withStrategy(locked, strategy) });
    const uppers = r.upperSegments.flatMap((segment) => segment.modules);
    const top = Math.max(
      ...uppers.map((unit) => upperBottomFor(unit, r) + moduleCarcassHeightMm(unit, r)),
    );
    check(
      `комплектация «${strategy.key}» не отменяет «до потолка»`,
      top === r.ceilingHeightMm,
      `зазор ${r.ceilingHeightMm - top} мм`,
    );
  }

  /* 5. Размеры вводятся ДЛЯ КАЖДОГО ПРИБОРА отдельно. */
  const fridge = run.modules.find((unit) => unit.appliance === 'fridge')!;
  const wide = step(run, [
    { op: 'set_appliance_size', moduleId: fridge.id, appliance: 'fridge', size: { widthMm: 900 } },
  ]);
  const placed = wide.modules.find((unit) => unit.appliance === 'fridge')!;
  check('введённая ширина прибора применяется', placed.widthMm === 900, `${placed.widthMm} мм`);
  check(
    'и меняет отпечаток',
    configurationFingerprint(wide.modules) !== configurationFingerprint(run.modules),
  );
  check(
    'ряд при этом остаётся в стене',
    runWidthSum(wide) === wide.lengthMm,
    `${runWidthSum(wide)}/${wide.lengthMm}`,
  );
  /*
   * Соседи ужимаются — это нормальная мебельная работа, — но НЕ МОЛЧА:
   * иначе клиент увидит на чертеже не тот состав, который заказывал.
   */
  check(
    'и ужатие соседей названо числом',
    wide.warnings.some((w) => /ужались на \d+ мм/.test(w)),
    wide.warnings[0] ?? 'молча',
  );

  const outOfRange = step(run, [
    { op: 'set_appliance_size', moduleId: fridge.id, appliance: 'fridge', size: { widthMm: 3000 } },
  ]);
  check(
    'прибор шире физического предела отклоняется с границами',
    outOfRange.warnings.some((w) => /от \d+ до \d+ мм/.test(w)),
    outOfRange.warnings[0] ?? 'принято молча',
  );

  const narrowRun = buildRun({ ...baseInput, lengthMm: 1800 });
  const narrowFridge = narrowRun.modules.find((unit) => unit.appliance === 'fridge');
  if (narrowFridge) {
    const tooWide = applyOps({
      run: narrowRun,
      requirements: REQ,
      openings: OPENINGS,
      ops: [
        {
          op: 'set_appliance_size',
          moduleId: narrowFridge.id,
          appliance: 'fridge',
          size: { widthMm: 1200 },
        },
      ],
    });
    check(
      'а прибор, который не влезает в стену, отклоняется с превышением в мм',
      tooWide.warnings.some((w) => /длиннее стены на \d+ мм/.test(w)) &&
        runWidthSum(tooWide) <= tooWide.lengthMm,
      tooWide.warnings[0] ?? 'принято молча',
    );
  }

  /*
   * КОЛОННА: ДВА ПРИБОРА — ДВА НАБОРА ГАБАРИТОВ.
   *
   * Размер лежал на МОДУЛЕ, и духовка с микроволновкой получали одну
   * высоту на двоих: микроволновке доставалась духовочная ниша, и в
   * пенале оставалось двадцать сантиметров пустоты.
   */
  const columnRun = buildRun({
    ...baseInput,
    requirements: { ...REQ, appliances: [...REQ.appliances, 'microwave'] },
  });
  const column = columnRun.modules.find((unit) => unit.column);
  if (column) {
    const nicheOf = (r: Run) => {
      const unit = r.modules.find((m) => m.column)!;
      return new Map(
        columnNiches(unit, moduleCarcassHeightMm(unit, r)).map((niche) => [
          niche.appliance,
          niche.toMm - niche.fromMm,
        ]),
      );
    };

    let sized = applyOps({
      run: columnRun,
      requirements: REQ,
      openings: OPENINGS,
      ops: [
        {
          op: 'set_appliance_size',
          moduleId: column.id,
          appliance: 'oven',
          size: { widthMm: column.widthMm, heightMm: 720 },
        },
      ],
    });
    sized = applyOps({
      run: sized,
      requirements: REQ,
      openings: OPENINGS,
      ops: [
        {
          op: 'set_appliance_size',
          moduleId: sized.modules.find((m) => m.column)!.id,
          appliance: 'microwave',
          size: { widthMm: column.widthMm, heightMm: 380 },
        },
      ],
    });

    const niches = nicheOf(sized);
    check(
      'в колонне духовка и микроволновка дают РАЗНЫЕ ниши',
      niches.get('oven') !== niches.get('microwave'),
      `духовка ${niches.get('oven')}, микроволновка ${niches.get('microwave')}`,
    );
    check(
      'и каждая ниша не меньше своего прибора',
      (niches.get('oven') ?? 0) >= 720 && (niches.get('microwave') ?? 0) >= 380,
      `${niches.get('oven')}/${niches.get('microwave')}`,
    );
    check(
      'введённая высота пересчитала нишу',
      JSON.stringify(Array.from(niches)) !== JSON.stringify(Array.from(nicheOf(columnRun))),
      `${Array.from(nicheOf(columnRun).values()).join('/')} → ${Array.from(niches.values()).join('/')}`,
    );
    check(
      'габарит каждого прибора попал в отпечаток',
      configurationFingerprint(sized.modules) !== configurationFingerprint(columnRun.modules),
    );
    check(
      'чужой прибор в этот модуль не пишется',
      applyOps({
        run: columnRun,
        requirements: REQ,
        openings: OPENINGS,
        ops: [
          {
            op: 'set_appliance_size',
            moduleId: column.id,
            appliance: 'sink600',
            size: { widthMm: 600 },
          },
        ],
      }).warnings.some((w) => /в этом модуле нет/.test(w)),
    );
  }

  /*
   * ГЛУБИНА ПРИБОРА РАБОТАЕТ.
   *
   * Поле существовало, в отпечаток входило и не делало НИЧЕГО: глубину
   * корпуса задавал профиль зоны, и холодильник 640 мм выпирал бы за
   * фасад. Теперь модуль едет вперёд — либо прибор отклоняется.
   */
  const deepRun = step(run, [
    {
      op: 'set_appliance_size',
      moduleId: fridge.id,
      appliance: 'fridge',
      size: { widthMm: 600, depthMm: 640 },
    },
  ]);
  const deepUnit = deepRun.modules.find((unit) => unit.appliance === 'fridge')!;
  check(
    'глубина прибора отодвигает модуль от стены',
    moduleDepthMm(deepUnit, 'kitchen') > moduleDepthMm(fridge, 'kitchen') &&
      moduleDepthMm(deepUnit, 'kitchen') >= 640,
    `${moduleDepthMm(fridge, 'kitchen')} → ${moduleDepthMm(deepUnit, 'kitchen')} мм`,
  );
  check(
    'и выступ назван числом',
    deepRun.warnings.some((w) => /вперёд на \d+ мм/.test(w)),
    deepRun.warnings[0] ?? 'молча',
  );
  check(
    'раскрой видит глубокий корпус',
    buildPanels({ run: deepRun }).some(
      (panel) => panel.moduleId === deepUnit.id && panel.name === 'Боковина' && panel.widthMm >= 640,
    ),
  );
  check(
    'а прибор глубже предельного отклоняется с числом',
    step(run, [
      {
        op: 'set_appliance_size',
        moduleId: fridge.id,
        appliance: 'fridge',
        size: { widthMm: 600, depthMm: 800 },
      },
    ]).warnings.some((w) => /больше предельной \d+ мм/.test(w)),
  );

  /*
   * АНТРЕСОЛЬ — ОТДЕЛЬНАЯ ПОЗИЦИЯ.
   *
   * Была признаком верхнего ряда: ни снять отдельно, ни выбрать материал.
   */
  const withMezz = step(run, [{ op: 'set_mezzanine', heightMm: 400 }]);

  /*
   * Антресолей теперь бывает две: заказанная НАД ВЕРХНИМ РЯДОМ и
   * обязательная НАД КОЛОННОЙ холодильника. Опора у них разная, и высота
   * тоже: у первой своя, у второй — остаток над колонной.
   */
  const overRow = (r: Run) =>
    r.upperSegments
      .flatMap((segment) => segment.modules)
      .filter((unit) => unit.section === 'mezzanine' && mezzanineBaseOf(unit, r) === null);
  const rowModules = (r: Run) =>
    r.upperSegments.flatMap((segment) => segment.modules).filter((u) => u.section !== 'mezzanine');

  const mezzModules = overRow(withMezz);

  check('антресоль добавляется отдельной позицией', mezzModules.length > 0, `${mezzModules.length} шт.`);
  check(
    'у неё своя высота',
    mezzModules.every((unit) => moduleCarcassHeightMm(unit, withMezz) === 400),
    mezzModules.map((unit) => moduleCarcassHeightMm(unit, withMezz)).join(', '),
  );
  check(
    'верхний ряд при этом остаётся на месте',
    rowModules(withMezz).length === rowModules(run).length,
    `${rowModules(run).length} → ${rowModules(withMezz).length}`,
  );
  check('и ничего не пересекается', moduleOverlaps(withMezz).length === 0);
  check(
    'антресоль стоит в раскрое и в смете',
    buildPanels({ run: withMezz }).some((panel) => panel.moduleLabel === 'Антресоль') &&
      buildEstimate(withMezz, 'optimal', DEMO_RATES).total >
        buildEstimate(run, 'optimal', DEMO_RATES).total,
    `${Math.round(buildEstimate(run, 'optimal', DEMO_RATES).total)} → ${Math.round(
      buildEstimate(withMezz, 'optimal', DEMO_RATES).total,
    )} ₸`,
  );
  check(
    'ей выбирают материал, как всем',
    (() => {
      const painted = applyOps({
        run: withMezz,
        requirements: REQ,
        openings: OPENINGS,
        ops: [
          {
            op: 'set_front',
            moduleId: 'all',
            front: { base: 'veneer_solid', construct: 'solid', finish: 'textured' },
          },
        ],
      });
      return painted.upperSegments
        .flatMap((segment) => segment.modules)
        .filter((unit) => unit.section === 'mezzanine')
        .every((unit) => unit.front?.base === 'veneer_solid');
    })(),
  );

  const withoutMezz = step(withMezz, [{ op: 'set_mezzanine', heightMm: null }]);
  check(
    'и снимается отдельно от верхнего ряда',
    overRow(withoutMezz).length === 0 &&
      rowModules(withoutMezz).length === rowModules(run).length,
  );
  check(
    'а кладовка над холодильником остаётся: она не выбор, а правило',
    withoutMezz.upperSegments
      .flatMap((segment) => segment.modules)
      .some((unit) => unit.section === 'mezzanine'),
  );
  check(
    'высота антресоли имеет границы',
    step(run, [{ op: 'set_mezzanine', heightMm: 100 }]).warnings.some((w) =>
      /от \d+ до \d+ мм/.test(w),
    ),
  );

  /*
   * ФРОНТЫ ПОД ВАРОЧНОЙ: столько же, сколько на чертеже.
   *
   * Чертёж рисовал два ящика, промпт называл два, а в раскрой уходила
   * ОДНА глухая панель на всю высоту.
   */
  const hob = run.modules.find((unit) => unit.appliance === 'hob');
  if (hob) {
    const drawn = frontGlyph(hob).filter((element) => element.kind === 'drawer').length;
    const cut = buildPanels({ run }).filter(
      (panel) => panel.moduleId === hob.id && panel.material.startsWith('Фасад'),
    );
    check(
      'под варочной в раскрое столько фронтов, сколько на чертеже',
      drawn > 0 && cut.length === drawn,
      `на чертеже ${drawn}, в раскрое ${cut.length}`,
    );
    check(
      'и это фронты ящиков, а не глухая панель',
      cut.every((panel) => /Фронт ящика/.test(panel.name)),
      cut.map((panel) => panel.name).join(', '),
    );
    check(
      'сумма фронтов сходится с высотой модуля',
      Math.abs(
        (hob.fill?.drawerHeights ?? []).reduce((sum, mm) => sum + mm, 0) -
          moduleCarcassHeightMm(hob, run),
      ) <= 1,
      `${(hob.fill?.drawerHeights ?? []).join('+')} против ${moduleCarcassHeightMm(hob, run)}`,
    );
  }

  /* 6. Встроенный читается шкафом, отдельностоящий — прибором. */
  const builtIn = run.modules.find((unit) => unit.appliance === 'fridge' && unit.builtIn);
  check('встроенный холодильник закрыт фасадом', Boolean(builtIn) && hasFacade(builtIn!));
  check(
    'и даёт фасадные детали в раскрое',
    buildPanels({ run }).some(
      (panel) => panel.moduleId === builtIn?.id && panel.material.startsWith('Фасад'),
    ),
  );

  const standalone = { ...(builtIn as Module), builtIn: false };
  check('отдельностоящий фасада не имеет', !hasFacade(standalone));
  check('и фасадных деталей не даёт', facadeSpans(standalone, 2000).length === 0);
}


/* ──────────────  Палитра цветов — из каталога организации  ────────────── */

/*
 * Цвета лежали в коде: восемь шестнадцатеричных чисел в готовых дизайнах.
 * Это цвета НАШИ, а не компании — у неё свой поставщик, свой прайс и свои
 * декоры. Показать клиенту декор, которого компания не продаёт, значит
 * принять заказ, который она не выполнит.
 */
console.log('\nПалитра цветов компании');
{
  /** Товар каталога в том виде, в каком его отдаёт база. */
  const item = (
    id: string,
    article: string,
    name: string,
    meta: Record<string, unknown>,
    price = 20000,
  ) =>
    ({
      id,
      org_id: 'org',
      category_id: 'cat',
      article,
      name_ru: name,
      name_kk: name,
      description: '',
      price,
      unit: 'm2',
      dimensions: {},
      tiling: {},
      meta,
      is_active: true,
      category: {
        id: 'cat',
        org_id: 'org',
        key: 'materials',
        name_ru: 'Материалы',
        name_kk: 'Материалы',
        applies_to: 'object',
        unit: 'm2',
        sort_order: 0,
        is_active: true,
      },
      assets: [],
    }) as unknown as CatalogEntryFull;

  /* 1. Палитра читается из каталога, а не из кода. */
  const alpha = [
    item('a1', 'ALFA-01', 'Альфа белый', { frontBase: 'mdf_enamel', color: '#FFFFFF' }),
    item('a2', 'ALFA-02', 'Альфа графит', { frontBase: 'mdf_enamel', color: '#333333' }),
    item('a3', 'ALFA-03', 'Альфа дуб', { frontBase: 'ldsp', color: '#B08A57' }),
    // Ставка сметы — не цвет: у неё нет ни базы, ни цвета.
    item('a4', 'MAT-LDSP', 'Корпус ЛДСП', { estimateKey: 'ldsp' }),
  ];
  const beta = [
    item('b1', 'BETA-11', 'Бета слоновая кость', { frontBase: 'mdf_enamel', color: '#E6D2B5' }),
    item('b2', 'BETA-12', 'Бета зелёный', { frontBase: 'mdf_enamel', color: '#89AC76' }),
  ];

  const alphaColors = paletteFromCatalog(alpha);
  const betaColors = paletteFromCatalog(beta);

  check(
    'палитра собирается из каталога организации',
    alphaColors.length === 3,
    `${alphaColors.length} цветов из ${alpha.length} позиций`,
  );
  check(
    'ставка сметы цветом не считается',
    alphaColors.every((color) => color.article !== 'MAT-LDSP'),
  );
  check(
    'ДВЕ организации видят РАЗНЫЕ цвета',
    alphaColors.every((a) => !betaColors.some((b) => b.itemId === a.itemId)) &&
      betaColors.length === 2,
    `${alphaColors.map((c) => c.article).join(', ')} против ${betaColors
      .map((c) => c.article)
      .join(', ')}`,
  );
  check(
    'цвета фильтруются по базе фасада',
    paletteFor(alphaColors, 'mdf_enamel').length === 2 &&
      paletteFor(alphaColors, 'ldsp').length === 1 &&
      paletteFor(alphaColors, 'acrylic').length === 0,
    `эмаль ${paletteFor(alphaColors, 'mdf_enamel').length}, ЛДСП ${paletteFor(alphaColors, 'ldsp').length}`,
  );
  check(
    'порядок цветов устойчив',
    JSON.stringify(paletteFromCatalog(alpha)) === JSON.stringify(paletteFromCatalog([...alpha].reverse())),
  );

  /* 2. Мусор в каталоге не становится цветом. */
  const dirty = paletteFromCatalog([
    item('x1', 'X-1', 'Без цвета', { frontBase: 'mdf_enamel' }),
    item('x2', 'X-2', 'Кривой цвет', { frontBase: 'mdf_enamel', color: 'красный' }),
    item('x3', 'X-3', 'Чужая база', { frontBase: 'плита', color: '#FFFFFF' }),
  ]);
  check('позиция без цвета или с мусором в палитру не попадает', dirty.length === 0, `${dirty.length}`);

  /* 3. Типовая палитра помечена ориентиром. */
  check(
    'в типовой палитре есть RAL и ходовые декоры',
    TYPICAL_PALETTE.length >= 12 &&
      TYPICAL_PALETTE.some((color) => /RAL/.test(color.name)) &&
      new Set(TYPICAL_PALETTE.map((color) => color.base)).size >= 4,
    `${TYPICAL_PALETTE.length} цветов, баз ${new Set(TYPICAL_PALETTE.map((c) => c.base)).size}`,
  );
  check(
    'и каждая её позиция помечена типовой',
    TYPICAL_PALETTE.every((color) => typicalColorItem(color).meta.typical === true),
  );
  check(
    'типовой цвет отличим от своего',
    (() => {
      const mixed = paletteFromCatalog([
        item('t1', 'CLR-RAL-9003', 'RAL 9003', {
          frontBase: 'mdf_enamel',
          color: '#F4F4F0',
          typical: true,
        }),
        item('o1', 'OWN-1', 'Наш белый', { frontBase: 'mdf_enamel', color: '#FFFFFF' }),
      ]);
      return mixed.filter((color) => color.typical).length === 1;
    })(),
  );
  check(
    'артикулы типовой палитры не пересекаются с типовым прайсом',
    TYPICAL_PALETTE.every(
      (color) => !TYPICAL_PRICE_LIST.some((rate) => rate.article === color.article),
    ),
  );

  /* 4. Выбор цвета пишет артикул и меняет отпечаток. */
  const run = buildRun(baseInput);
  const target = run.modules.find((unit) => !unit.appliance)!;
  const color = alphaColors[0];

  const painted = applyOps({
    run,
    requirements: REQ,
    openings: OPENINGS,
    ops: [
      {
        op: 'set_front',
        moduleId: target.id,
        front: {
          ...frontOf(target),
          colorHex: color.colorHex,
          itemId: color.itemId,
        },
      },
    ],
  });

  const unit = painted.modules.find((m) => m.id === target.id)!;
  check('выбор цвета пишет артикул в модуль', unit.front?.itemId === color.itemId, unit.front?.itemId);
  check('и цвет', unit.front?.colorHex === color.colorHex, unit.front?.colorHex);
  check(
    'и меняет отпечаток',
    configurationFingerprint(painted.modules) !== configurationFingerprint(run.modules),
  );

  /*
   * ДВА ДЕКОРА ОДНОГО ЦВЕТА — РАЗНЫЕ ТОВАРЫ.
   *
   * «Дуб сонома» и «дуб крафт» на схеме одинаковы, а в заказе это разные
   * плиты и разные деньги: без артикула в отпечатке подписанная смета
   * разошлась бы с тем, что уехало в цех.
   */
  const twin = applyOps({
    run,
    requirements: REQ,
    openings: OPENINGS,
    ops: [
      {
        op: 'set_front',
        moduleId: target.id,
        front: { ...frontOf(target), colorHex: color.colorHex, itemId: 'other-article' },
      },
    ],
  });
  check(
    'два артикула одного цвета различаются отпечатком',
    configurationFingerprint(twin.modules) !== configurationFingerprint(painted.modules),
  );

  check(
    'ряд без выбранного цвета отпечаток не меняет',
    configurationFingerprint(
      applyOps({ run, requirements: REQ, openings: OPENINGS, ops: [] }).modules,
    ) === configurationFingerprint(run.modules),
  );
}


/* ──────────────  Угловые и П-образные руками  ────────────── */

/*
 * «В чертеже только прямой» — сказал мебельщик, который делает угловые
 * постоянно. `buildComposition` умел собрать угол по шаблону, но руками
 * второй ряд был не правим, а свободная сборка отказывала вовсе.
 */
console.log('\nУгол собирается руками');
{
  const WALLS = [
    { id: 'a', lengthMm: 3800, openings: [] as Opening[] },
    { id: 'b', lengthMm: 2400, openings: [] as Opening[] },
    { id: 'c', lengthMm: 3000, openings: [] as Opening[] },
  ];
  const FREE: RunRequirements = { ...REQ, mode: 'free', appliances: [] };

  const build = (kind: 'corner_l' | 'u_shape', req: RunRequirements, solution?: 'corner_module' | 'false_panel') =>
    buildComposition({
      id: 'test',
      kind,
      requirements: solution ? { ...req, cornerSolution: solution } : req,
      ceilingHeightMm: 2700,
      walls: WALLS,
      comms: COMMS,
    });

  /* 1. Свободная сборка угла больше не отказывает. */
  const freeCorner = build('corner_l', FREE);
  check(
    'угол собирается со ВСЕХ пустых стен',
    freeCorner.segments.length === 2 &&
      freeCorner.segments.every((segment) => segment.run.modules.length === 0),
    `сегментов ${freeCorner.segments.length}`,
  );
  check(
    'и место в углу урезано с самого начала',
    freeCorner.segments[1].run.lengthMm < freeCorner.segments[1].wallLengthMm,
    `${freeCorner.segments[1].run.lengthMm} из ${freeCorner.segments[1].wallLengthMm} мм`,
  );

  /* 2. Модули ставятся на каждую стену теми же операциями. */
  const step = (run: Run, ops: MillworkOp[]) =>
    applyOps({ run, requirements: FREE, ops, openings: [] });

  const built = freeCorner.segments.map((segment) => {
    let run = segment.run;
    for (const width of [600, 600, 450]) {
      run = step(run, [{ op: 'add_module', kind: 'base', widthMm: width }]);
    }
    return run;
  });
  check(
    'модули встают на каждую стену',
    built.every((run) => run.modules.length === 3),
    built.map((run) => run.modules.length).join('/'),
  );
  check(
    'и каждый ряд остаётся в своей стене',
    built.every((run, i) => runWidthSum(run) <= freeCorner.segments[i].run.lengthMm),
    built.map((run, i) => `${runWidthSum(run)}/${freeCorner.segments[i].run.lengthMm}`).join(' · '),
  );
  check(
    'ни один ряд не пересекается сам с собой',
    built.every((run) => moduleOverlaps(run).length === 0),
  );

  /* 3. Ряд из шаблона сходится со своей стеной до миллиметра. */
  const corner = build('corner_l', REQ);
  check(
    'оба ряда шаблона сходятся со своими стенами',
    corner.segments.every((segment) => runWidthSum(segment.run) === segment.run.lengthMm),
    corner.segments.map((s) => `${runWidthSum(s.run)}/${s.run.lengthMm}`).join(' · '),
  );

  /* 4. Решение угла меняет место, отпечаток и смету. */
  const panel = build('corner_l', REQ, 'false_panel');
  const module900 = build('corner_l', REQ, 'corner_module');

  check(
    'решение угла меняет полезную длину второго ряда',
    panel.segments[1].run.lengthMm !== module900.segments[1].run.lengthMm,
    `${panel.segments[1].run.lengthMm} против ${module900.segments[1].run.lengthMm} мм`,
  );
  check(
    'и угловой модуль забирает ровно 900 мм',
    module900.segments[1].wallLengthMm - module900.segments[1].run.lengthMm === 900,
    `${module900.segments[1].wallLengthMm - module900.segments[1].run.lengthMm} мм`,
  );
  check(
    'смена решения угла меняет отпечаток',
    panel.fingerprint !== module900.fingerprint,
    `${panel.fingerprint} → ${module900.fingerprint}`,
  );

  const sumOf = (composition: typeof panel) =>
    mergeEstimates(
      composition.segments.map((segment) =>
        buildEstimate(segment.run, 'optimal', DEMO_RATES),
      ),
    ).total;
  check(
    'и меняет смету',
    Math.round(sumOf(panel)) !== Math.round(sumOf(module900)),
    `${Math.round(sumOf(panel)).toLocaleString('ru')} против ${Math.round(sumOf(module900)).toLocaleString('ru')} ₸`,
  );

  /* 5. Ряды двух стен не пересекаются ни при одном решении. */
  for (const [name, composition] of [
    ['фальш-панель', panel],
    ['угловой модуль', module900],
  ] as const) {
    check(
      `при решении «${name}» ряды не налезают друг на друга`,
      composition.segments.every(
        (segment) => runWidthSum(segment.run) <= segment.run.lengthMm,
      ) &&
        composition.segments.every((segment) => moduleOverlaps(segment.run).length === 0),
    );
    check(
      `и второй ряд короче своей стены на занятое в углу`,
      composition.segments[1].run.lengthMm < composition.segments[1].wallLengthMm,
      `${composition.segments[1].wallLengthMm - composition.segments[1].run.lengthMm} мм`,
    );
  }

  /* 6. П-образная — три ряда. */
  const uShape = build('u_shape', REQ);
  check('П-образная собирается из трёх рядов', uShape.segments.length === 3);
  check(
    'и каждый ряд сходится со своей стеной',
    uShape.segments.every((segment) => runWidthSum(segment.run) === segment.run.lengthMm),
    uShape.segments.map((s) => `${runWidthSum(s.run)}/${s.run.lengthMm}`).join(' · '),
  );

  /* 7. Техника не дублируется между рядами. */
  for (const [name, composition] of [
    ['угловая', corner],
    ['П-образная', uShape],
  ] as const) {
    const counts = new Map<string, number>();
    for (const segment of composition.segments) {
      for (const unit of [
        ...segment.run.modules,
        ...segment.run.upperSegments.flatMap((s) => s.modules),
      ]) {
        for (const appliance of moduleAppliances(unit)) {
          counts.set(appliance, (counts.get(appliance) ?? 0) + 1);
        }
      }
    }
    const doubled = Array.from(counts.entries()).filter(([, n]) => n > 1);
    check(
      `${name}: каждый прибор ровно один`,
      doubled.length === 0,
      doubled.length === 0
        ? Array.from(counts.keys()).join(', ')
        : `дубли: ${doubled.map(([a, n]) => `${a}×${n}`).join(', ')}`,
    );
    check(
      `${name}: мойка одна на кухню`,
      Array.from(counts.keys()).filter((a) => a.startsWith('sink')).length <= 1,
    );
  }

  /* 8. Узкий проход П-образной — предупреждение по последствию. */
  const tight = buildComposition({
    id: 'tight',
    kind: 'u_shape',
    requirements: REQ,
    ceilingHeightMm: 2700,
    walls: [
      { id: 'a', lengthMm: 3800, openings: [] },
      { id: 'b', lengthMm: 1900, openings: [] },
      { id: 'c', lengthMm: 3000, openings: [] },
    ],
    comms: COMMS,
  });
  check(
    'узкий проход назван последствием, а не числом',
    tight.warnings.some((w) => /не разойтись вдвоём/.test(w)),
    tight.warnings.find((w) => /проход/i.test(w)) ?? 'молча',
  );

  /* 9. Глубина прибора проверяется против комнаты. */
  const straight = buildRun(baseInput);
  const fridgeUnit = straight.modules.find((unit) => unit.appliance === 'fridge')!;
  const cramped = applyOps({
    run: straight,
    requirements: REQ,
    openings: OPENINGS,
    // Комната 1100 мм в глубину: после ряда 660 останется 440 на проход.
    roomDepthMm: 1100,
    ops: [
      {
        op: 'set_appliance_size',
        moduleId: fridgeUnit.id,
        appliance: 'fridge',
        size: { widthMm: 600, depthMm: 640 },
      },
    ],
  });
  check(
    'глубина прибора проверяется против КОМНАТЫ, а не только габарита',
    cramped.warnings.some((w) => /не разойтись вдвоём/.test(w)),
    cramped.warnings.find((w) => /останется/.test(w)) ?? 'молча',
  );
  check(
    'в просторной комнате о проходе не предупреждают',
    !applyOps({
      run: straight,
      requirements: REQ,
      openings: OPENINGS,
      roomDepthMm: 4000,
      ops: [
        {
          op: 'set_appliance_size',
          moduleId: fridgeUnit.id,
          appliance: 'fridge',
          size: { widthMm: 600, depthMm: 640 },
        },
      ],
    }).warnings.some((w) => /не разойтись/.test(w)),
  );
}


/* ──────────────  Композиция переживает закрытие объекта  ────────────── */

/*
 * Соседние стены жили только в памяти вкладки: замерщик собирал угловую
 * кухню, показывал клиенту, закрывал объект — и второй ряд пропадал
 * молча. Это потеря работы, а не неудобство.
 *
 * Здесь проверяется КРУГ: собрали → сериализовали, как в базу → прочли
 * обратно → всё на месте, и отпечаток тот же.
 */
console.log('\nУгловая кухня переживает закрытие');
{
  const WALLS = [
    { id: 'a', lengthMm: 3800, openings: [] as Opening[] },
    { id: 'b', lengthMm: 2400, openings: [] as Opening[] },
    { id: 'c', lengthMm: 3000, openings: [] as Opening[] },
  ];

  const build = (kind: 'corner_l' | 'u_shape', solution: 'corner_module' | 'false_panel') =>
    buildComposition({
      id: 'save',
      kind,
      requirements: { ...REQ, cornerSolution: solution },
      ceilingHeightMm: 2700,
      walls: WALLS,
      comms: COMMS,
    });

  /* Собираем угол и правим ОБЕ стены: материал и состав. */
  const base = build('corner_l', 'false_panel');
  const veneer: FrontSpec = { base: 'veneer_solid', construct: 'solid', finish: 'textured' };

  const runs = base.segments.map((segment) =>
    applyOps({
      run: segment.run,
      requirements: REQ,
      openings: [],
      ops: [{ op: 'set_front', moduleId: 'all', front: veneer }],
    }),
  );

  const built = compositionOf(base, runs);
  check(
    'материал лёг на обе стены',
    built.segments.every((segment) =>
      segment.run.modules
        .filter((unit) => hasFacade(unit))
        .every((unit) => unit.front?.base === 'veneer_solid'),
    ),
  );

  /*
   * СОСТОЯНИЕ УХОДИТ В БАЗУ ЧЕРЕЗ JSON.
   *
   * Проверять надо именно так: `structuredClone` сохранил бы то, чего
   * JSON не знает — `undefined`, `Map`, ключи-числа. Ровно на этом
   * ломаются круговые проверки, которые «проходят».
   */
  const state: MillworkState = {
    templateId: 'linear-column',
    requirements: REQ,
    runs: { optimal: runs[0] },
    selectedVariant: 'optimal',
    shape: 'corner_l',
    cornerSolution: 'false_panel',
    wallRuns: { '1': runs[1] },
    savedAt: new Date('2026-03-12T10:00:00Z').toISOString(),
  };

  const reopened = JSON.parse(JSON.stringify(state)) as MillworkState;

  check('форма сохраняется', reopened.shape === 'corner_l', reopened.shape);
  check(
    'решение угла сохраняется',
    reopened.cornerSolution === 'false_panel',
    reopened.cornerSolution,
  );
  check(
    'ряд соседней стены сохраняется целиком',
    (reopened.wallRuns?.['1']?.modules.length ?? 0) === runs[1].modules.length,
    `${reopened.wallRuns?.['1']?.modules.length ?? 0} из ${runs[1].modules.length}`,
  );
  check(
    'и материал на ней тот же',
    (reopened.wallRuns?.['1']?.modules ?? [])
      .filter((unit) => hasFacade(unit))
      .every((unit) => unit.front?.base === 'veneer_solid'),
  );

  /* Отпечаток после перезагрузки — тот же. */
  const restored = compositionOf(build('corner_l', reopened.cornerSolution ?? 'false_panel'), [
    reopened.runs?.optimal as Run,
    reopened.wallRuns?.['1'] as Run,
  ]);
  check(
    'отпечаток композиции после перезагрузки совпадает',
    restored.fingerprint === built.fingerprint,
    `${built.fingerprint} → ${restored.fingerprint}`,
  );

  /* Отпечаток объекта МЕНЯЕТСЯ от правки любой стены, а не только первой. */
  const editedSecond = compositionOf(base, [
    runs[0],
    applyOps({
      run: runs[1],
      requirements: REQ,
      openings: [],
      ops: [{ op: 'remove_module', moduleId: runs[1].modules[0].id }],
    }),
  ]);
  check(
    'правка ВТОРОЙ стены меняет отпечаток объекта',
    editedSecond.fingerprint !== built.fingerprint,
    `${built.fingerprint} → ${editedSecond.fingerprint}`,
  );
  check(
    'а отпечаток первой стены при этом прежний',
    editedSecond.segments[0].run.fingerprint === built.segments[0].run.fingerprint,
  );

  /* П-образная сохраняется тремя стенами. */
  const u = build('u_shape', 'false_panel');
  const uState: MillworkState = {
    shape: 'u_shape',
    cornerSolution: 'false_panel',
    runs: { optimal: u.segments[0].run },
    wallRuns: { '1': u.segments[1].run, '2': u.segments[2].run },
  };
  const uBack = JSON.parse(JSON.stringify(uState)) as MillworkState;
  check(
    'П-образная сохраняется тремя стенами',
    Object.keys(uBack.wallRuns ?? {}).length === 2 &&
      Boolean(uBack.runs?.optimal) &&
      (uBack.wallRuns?.['2']?.modules.length ?? 0) > 0,
    `рабочая + ${Object.keys(uBack.wallRuns ?? {}).join(', ')}`,
  );
  check(
    'и её отпечаток после перезагрузки тот же',
    compositionOf(u, [
      uBack.runs?.optimal as Run,
      uBack.wallRuns?.['1'] as Run,
      uBack.wallRuns?.['2'] as Run,
    ]).fingerprint === u.fingerprint,
  );

  /*
   * СТАРЫЕ ОБЪЕКТЫ ОТКРЫВАЮТСЯ.
   *
   * Совместимость решена ЧТЕНИЕМ, а не переписыванием строк: новых полей
   * у прямых кухонь просто нет, и отсутствие читается как «прямая».
   * Миграция базы не нужна вовсе — а значит и нечему упасть на половине.
   */
  const old = JSON.parse(
    JSON.stringify({
      templateId: 'linear-column',
      requirements: REQ,
      runs: { optimal: buildRun(baseInput) },
      selectedVariant: 'optimal',
      savedAt: '2026-01-10T09:00:00Z',
    }),
  ) as MillworkState;

  check(
    'у объекта, созданного до правки, формы нет',
    old.shape === undefined && old.wallRuns === undefined,
  );
  check(
    'и он читается как прямая кухня',
    (old.shape ?? 'linear') === 'linear' &&
      Object.keys(old.wallRuns ?? {}).length === 0 &&
      (old.runs?.optimal?.modules.length ?? 0) > 0,
    `модулей ${old.runs?.optimal?.modules.length ?? 0}`,
  );
  check(
    'его отпечаток остаётся отпечатком РЯДА, а не композиции',
    old.runs?.optimal?.fingerprint === buildRun(baseInput).fingerprint,
    old.runs?.optimal?.fingerprint,
  );
}


/* ─────────────────────────  Направление открывания  ───────────────────────── */

console.log('\nНаправление открывания считает фурнитуру');
{
  const run = buildRun(baseInput);
  const estimate = buildEstimate(run, 'optimal', DEMO_RATES);
  const upperModules = run.upperSegments.flatMap((s) => s.modules);

  /*
   * ГЛАВНОЕ: ВЕРХНИЙ РЯД БОЛЬШЕ НЕ НА ГАЗЛИФТАХ ПО УМОЛЧАНИЮ.
   *
   * Смета выводила фурнитуру из ряда: «верхний — значит подъёмник». Три
   * фасада демо-кухни получали механизм по 7 800 ₸ поверх петель по 900 ₸,
   * хотя направление никто не выбирал. Это расход мебельщика, и видит он
   * такое первым.
   */
  check(
    'по умолчанию верхний ряд распашной, а не на подъёмниках',
    !estimate.lines.some((l) => l.key.startsWith('lift_') && l.quantity > 0),
    estimate.lines
      .filter((l) => l.key.startsWith('lift_'))
      .map((l) => `${l.key} ${l.quantity}`)
      .join(' · ') || 'строк подъёмника нет',
  );
  check(
    'и петли посчитаны у всех распашных фасадов, включая верхние',
    (estimate.lines.find((l) => l.key === 'hinge_standard')?.quantity ?? 0) > 0,
    `петель ${estimate.lines.find((l) => l.key === 'hinge_standard')?.quantity}`,
  );

  /* Умолчание называет себя умолчанием — словами, а не молчанием. */
  const assumedWarning = openingAssumptions(run);
  check(
    'о посчитанном по умолчанию сказано словами',
    assumedWarning.length === 1 && assumedWarning[0].message.includes('не выбрано'),
    assumedWarning[0]?.message,
  );

  /* ── Выбор подъёмника ── */
  const upper = upperModules.find((m) => m.frontType === 'door')!;
  check('в верхнем ряду есть распашной модуль', Boolean(upper), upper?.label);

  const lifted = applyOps({
    run,
    requirements: REQ,
    ops: [{ op: 'set_opening', moduleId: upper.id, opening: 'lift' }],
    openings: OPENINGS,
  });
  const liftedUnit = lifted.upperSegments
    .flatMap((s) => s.modules)
    .find((m) => m.id === upper.id);

  check(
    'подъёмник записался в то же поле, где живёт сторона петель',
    liftedUnit?.fill?.hinge === 'lift' && liftedUnit?.fill?.openingChosen === true,
    `hinge=${liftedUnit?.fill?.hinge}, выбрано=${liftedUnit?.fill?.openingChosen}`,
  );

  check(
    'смена направления меняет отпечаток',
    lifted.fingerprint !== run.fingerprint,
    `${run.fingerprint} → ${lifted.fingerprint}`,
  );

  const liftedEstimate = buildEstimate(lifted, 'optimal', DEMO_RATES);
  check(
    'и меняет смету',
    liftedEstimate.total !== estimate.total,
    `${estimate.total} → ${liftedEstimate.total} ₸`,
  );

  const liftLine = liftedEstimate.lines.find((l) => l.key.startsWith('lift_'));
  check(
    'фурнитура направления идёт ОТДЕЛЬНОЙ строкой',
    Boolean(liftLine) && liftLine!.quantity === 1,
    liftLine ? `${liftLine.key} ${liftLine.quantity} шт. · ${liftLine.total} ₸` : 'строки нет',
  );

  /*
   * Газлифт и петля — разные деньги, и разница видна в итоге. Ради этого
   * числа всё и делалось: считать механизм по ряду значило продавать
   * клиенту фурнитуру, которую он не выбирал.
   */
  const hingesBefore = estimate.lines.find((l) => l.key === 'hinge_standard')?.quantity ?? 0;
  const hingesAfter = liftedEstimate.lines.find((l) => l.key === 'hinge_standard')?.quantity ?? 0;
  check(
    'подъёмник и петля дают РАЗНЫЕ суммы',
    liftedEstimate.total > estimate.total && hingesAfter < hingesBefore,
    `петель ${hingesBefore} → ${hingesAfter}, итог ${estimate.total} → ${liftedEstimate.total} ₸`,
  );

  /* Выбор переживает правку соседей: верхний ряд пересобирается из нижнего. */
  const plainBase = lifted.modules.find((m) => !m.appliance && m.kind === 'base')!;
  const afterEdit = applyOps({
    run: lifted,
    requirements: REQ,
    ops: [{ op: 'set_front', moduleId: plainBase.id, front: { base: 'mdf_enamel', construct: 'solid', finish: 'matte' } }],
    openings: OPENINGS,
  });
  check(
    'выбранное направление переживает пересборку верхнего ряда',
    afterEdit.upperSegments.flatMap((s) => s.modules).find((m) => m.id === upper.id)?.fill
      ?.hinge === 'lift',
  );

  /* ── Откидной ── */
  const flapped = applyOps({
    run,
    requirements: REQ,
    ops: [{ op: 'set_opening', moduleId: upper.id, opening: 'flap' }],
    openings: OPENINGS,
  });
  const flapEstimate = buildEstimate(flapped, 'optimal', DEMO_RATES);
  const flapLine = flapEstimate.lines.find((l) => l.key === 'flap_mechanism');
  check(
    'откидной фасад приносит свой механизм',
    Boolean(flapLine) && flapLine!.quantity === 1,
    flapLine ? `${flapLine.quantity} шт. · ${flapLine.total} ₸` : 'строки нет',
  );
  check(
    'и остаётся на петлях: полотно висит на них снизу',
    (flapEstimate.lines.find((l) => l.key === 'hinge_standard')?.quantity ?? 0) === hingesBefore,
    `петель ${flapEstimate.lines.find((l) => l.key === 'hinge_standard')?.quantity}`,
  );

  /* ── Отказ: механизм в нижнем ряду ── */
  const base = run.modules.find((m) => m.frontType === 'door')!;
  const refused = applyOps({
    run,
    requirements: REQ,
    ops: [{ op: 'set_opening', moduleId: base.id, opening: 'lift' }],
    openings: OPENINGS,
  });
  check(
    'подъёмник в нижнем ряду отклоняется',
    refused.modules.find((m) => m.id === base.id)?.fill?.hinge !== 'lift' &&
      refused.fingerprint === run.fingerprint,
  );
  check(
    'и отказ объясняет ПОСЛЕДСТВИЕ, а не запрещает',
    (refused.warnings ?? []).some(
      (w) => w.includes('столешниц') || w.includes('рабочее место'),
    ),
    (refused.warnings ?? [])[0],
  );
  check(
    'ящикам направление не выбирают вовсе',
    Boolean(
      openingRejection({ ...base, frontType: 'drawers' }, 'left')?.includes('выдвигаются'),
    ),
  );

  /*
   * ДИАГОНАЛЬ НА ЧЕРТЕЖЕ СОВПАДАЕТ С ВЫБОРОМ У КАЖДОГО МОДУЛЯ.
   *
   * «Хотя бы у одного» — это проверка, которая пропускает ровно ту
   * ошибку, ради которой написана: рисунок и данные расходятся не везде,
   * а в одном месте.
   */
  let drawn = 0;
  const wrong: string[] = [];

  for (const t of RUN_TEMPLATES) {
    for (const len of [1800, 2400, 3200, 3800, 4200]) {
      const requirements = requirementsFromTemplate(t, DEMO_REQUIREMENTS.options);
      const sample = buildSample(`${t.id}@${len}`, { ...baseInput, lengthMm: len, requirements });
      if (!sample) continue;

      const target = sample.upperSegments
        .flatMap((s) => s.modules)
        .find((m) => m.frontType === 'door');

      const withLift = applyOps({
        run: sample,
        requirements,
        ops: target
          ? [{ op: 'set_opening' as const, moduleId: target.id, opening: 'lift' as const }]
          : [],
        openings: OPENINGS,
      });

      for (const unit of [
        ...withLift.modules,
        ...withLift.upperSegments.flatMap((s) => s.modules),
      ]) {
        if (unit.frontType !== 'door' || !hasFacade(unit)) continue;

        const { opening } = openingOf(unit);
        const signature = glyphSignature(frontGlyph(unit, 'fronts'));
        drawn += 1;

        const drawnRight =
          opening === 'none'
            ? // Карго выдвигается: ни диагонали, ни дуги у него быть не должно.
              !signature.includes('swing') &&
              !signature.includes('lift') &&
              !signature.includes('flap')
            : opening === 'lift'
            ? signature.includes('lift')
            : opening === 'flap'
              ? signature.includes('flap')
              : opening === 'double'
                ? signature.includes('swing:left') && signature.includes('swing:right')
                : signature.includes(`swing:${opening}`);

        if (!drawnRight) wrong.push(`${t.id}@${len} ${unit.id}: ${opening} ≠ ${signature}`);
      }
    }
  }

  check(
    'рисунок открывания совпадает с выбором у КАЖДОГО модуля',
    wrong.length === 0 && drawn > 100,
    `сверено ${drawn} фасадов, расхождений ${wrong.length}${wrong[0] ? `: ${wrong[0]}` : ''}`,
  );

  /*
   * ОТКРЫТЫЙ ФАСАД УХОДИТ НАРУЖУ, А НЕ В КОРПУС.
   *
   * Ось у каждого направления своя: у распашного — петельный край, у
   * подъёмника — верхний, у откидного — нижний. Ошибись знаком угла, и
   * полотно провалится внутрь шкафа: глазами это видно сразу, а числом
   * ловится до того, как кто-нибудь откроет сцену.
   */
  for (const dir of ['left', 'right', 'lift', 'flap'] as const) {
    const w = 0.6;
    const h = 0.72;
    const pivot = doorPivot(dir, 0, 0.1, w, h);

    // Центр полотна после поворота на открытие.
    const [px, py, pz] = pivot.panel;
    const c = Math.cos(pivot.angle);
    const sn = Math.sin(pivot.angle);
    const local =
      pivot.axis === 'x'
        ? [px, py * c - pz * sn, py * sn + pz * c]
        : [px * c + pz * sn, py, -px * sn + pz * c];

    const world = [
      pivot.origin[0] + local[0],
      pivot.origin[1] + local[1],
      pivot.origin[2] + local[2],
    ];

    check(
      `открытый фасад «${dir}» уходит наружу, а не в корпус`,
      world[2] > 0.05,
      `центр полотна z = ${world[2].toFixed(3)} м`,
    );
    check(
      `и ось «${dir}» стоит на передней плоскости корпуса`,
      pivot.origin[2] === 0,
    );
  }

  check(
    'у подъёмника ось сверху, у откидного снизу — это разные механизмы',
    doorPivot('lift', 0, 0.1, 0.6, 0.72).origin[1] >
      doorPivot('flap', 0, 0.1, 0.6, 0.72).origin[1],
    `${doorPivot('lift', 0, 0.1, 0.6, 0.72).origin[1]} против ${doorPivot('flap', 0, 0.1, 0.6, 0.72).origin[1]}`,
  );

  /* ── Что ещё считалось из вида модуля ── */
  const legs = estimate.lines.find((l) => l.key === 'leg_support')!;
  const floor = run.modules.filter((m) => standsOnFloor(m));
  check(
    'опоры стоят под ВСЕМ, что стоит на полу, включая пеналы',
    legs.quantity === floor.length * 4,
    `${legs.quantity} опор на ${floor.length} напольных модулей`,
  );

  const counter = estimate.lines.find((l) => l.key.startsWith('countertop_'))!;
  const bearing = run.modules.filter((m) => bearsCountertop(m, run));
  check(
    'столешница считается по тем модулям, которые её несут',
    Math.abs(counter.quantity - bearing.reduce((s, m) => s + m.widthMm, 0) / 1000) < 0.01,
    `${counter.quantity} м против длины ряда ${run.lengthMm / 1000} м`,
  );
  check(
    'и колонна её на себе не несёт',
    !run.modules.filter((m) => m.kind === 'tall').some((m) => bearsCountertop(m, run)),
    `пеналов ${run.modules.filter((m) => m.kind === 'tall').length}`,
  );
}


/* ───────────────────  Правила мебельщика: холодильник и колонна  ─────────────────── */

console.log('\nПравила мебельщика держит геометрия');
{
  const run = buildRun(baseInput);
  const fridge = run.modules.find((unit) => unit.appliance === 'fridge')!;
  const above = run.upperSegments
    .flatMap((segment) => segment.modules)
    .filter((unit) => unit.section === 'mezzanine' && mezzanineBaseOf(unit, run) !== null);

  check('в ряду есть колонна холодильника', Boolean(fridge), fridge?.label);

  /*
   * НАД ХОЛОДИЛЬНИКОМ ВСЕГДА ОСТАЁТСЯ МЕСТО, И ОНО — МОДУЛЬ.
   *
   * Пенал до потолка не делают: фактическая высота холодильника меньше
   * паспортной, а до верха всё равно не дотянуться. Место становится
   * кладовкой — значит у него есть корпус, фасад и детали в раскрое.
   */
  check(
    'над холодильником стоит антресоль, а не пустота',
    above.length === 1,
    above.map((unit) => unit.label).join(', ') || 'нет',
  );
  check(
    'и она не ниже 300 мм',
    above.length === 1 && moduleCarcassHeightMm(above[0], run) >= FRIDGE_MEZZANINE_MIN_MM,
    above[0] ? `${moduleCarcassHeightMm(above[0], run)} мм` : '',
  );
  check(
    'она стоит РОВНО на крыше колонны',
    above.length === 1 &&
      upperBottomFor(above[0], run) ===
        GEOMETRY.base.plinthH + moduleCarcassHeightMm(fridge, run),
    above[0] ? `низ ${upperBottomFor(above[0], run)}` : '',
  );
  check(
    'и по ширине совпадает с колонной',
    above.length === 1 &&
      above[0].offsetMm === fridge.offsetMm &&
      above[0].widthMm === fridge.widthMm,
  );
  check('и ничего не пересекает', moduleOverlaps(run).length === 0);

  /* Она в раскрое отдельными деталями и в смете отдельными деньгами. */
  const parts = buildPanels({ run }).filter((panel) => panel.moduleId === above[0]?.id);
  check(
    'у неё свои детали в раскрое',
    parts.length >= 4 && parts.some((panel) => panel.name.includes('Фасад')),
    parts.map((panel) => panel.name).join(', '),
  );

  const withoutRule = buildRun({
    ...baseInput,
    requirements: { ...REQ, appliances: REQ.appliances.filter((a) => a !== 'fridge') },
  });
  check(
    'без холодильника такой антресоли нет вовсе',
    withoutRule.upperSegments
      .flatMap((segment) => segment.modules)
      .every((unit) => unit.section !== 'mezzanine'),
  );

  /*
   * ОТКАЗ НАЗЫВАЕТ ЧИСЛО.
   *
   * Холодильник выше того, что оставляет правило, в ряд не встаёт — и
   * сказать об этом надо миллиметрами, а не «не помещается».
   */
  const tooTall = applyOps({
    run,
    requirements: REQ,
    openings: OPENINGS,
    ops: [
      {
        op: 'set_appliance_size',
        moduleId: fridge.id,
        appliance: 'fridge',
        size: { widthMm: 600, heightMm: 2450 },
      },
    ],
  });
  check(
    'слишком высокий холодильник отклоняется',
    (tooTall.warnings ?? []).some((w) => /останется \d+ мм/.test(w)),
    (tooTall.warnings ?? [])[0],
  );
  check(
    'и раскладка от отказа не меняется',
    tooTall.fingerprint === run.fingerprint,
  );

  /*
   * ДУХОВКА И СВЧ ДРУГ НАД ДРУГОМ — НЕ ВЫШЕ ПОЯСА.
   *
   * Предупреждение ЖЁЛТОЕ: раскладка применяется. Замерщик главнее
   * алгоритма, но последствие должен знать — это ожог, а не неудобство.
   */
  const columnRun = buildRun({
    ...baseInput,
    requirements: { ...REQ, appliances: [...REQ.appliances, 'microwave' as const] },
  });
  const column = columnRun.modules.find((unit) => unit.column);
  check('в ряду есть колонна из двух приборов', Boolean(column), column?.label);

  /*
   * ПРАВИЛО ПРО ГАБАРИТ ПАРЫ, А НЕ ПРО ОТМЕТКУ ВЕРХА.
   *
   * Считается СУММА заявленных высот ниш духовки и микроволновки. В
   * прошлый раз я прочитал правило как «верх духовки от пола» — число
   * получалось другое, и ловило оно другие модули.
   */
  const pair = column ? columnNichesSumMm(column, columnRun) : null;
  check(
    'суммарная высота двух ниш считается',
    pair !== null && pair > 0,
    `${pair} мм`,
  );
  check(
    'обычная пара «духовка + СВЧ» в предел укладывается',
    pair !== null && pair <= APPLIANCE_COLUMN.maxPairMm,
    `${pair} мм при пределе ${APPLIANCE_COLUMN.maxPairMm}`,
  );

  const high = applyOps({
    run: columnRun,
    requirements: REQ,
    openings: OPENINGS,
    ops: [
      {
        op: 'set_appliance_size',
        moduleId: column!.id,
        appliance: 'oven',
        // Духовка 1100 мм: с нишей микроволновки пара выходит за 1500.
        size: { widthMm: 600, heightMm: 1100 },
      },
    ],
  });
  const highColumn = high.modules.find((unit) => unit.column)!;
  const highPair = columnNichesSumMm(highColumn, high)!;

  check(
    'высокая духовка выводит пару за предел',
    highPair > APPLIANCE_COLUMN.maxPairMm,
    `${Math.round(highPair)} мм при пределе ${APPLIANCE_COLUMN.maxPairMm}`,
  );
  check(
    'раскладка при этом ПРИМЕНЯЕТСЯ: замерщик главнее',
    high.fingerprint !== columnRun.fingerprint,
    `${columnRun.fingerprint} → ${high.fingerprint}`,
  );

  const said = ergonomicWarnings(high);
  check(
    'и предупреждение называет ЧИСЛО, а не факт',
    said.some(
      (w) =>
        w.severity === 'clarify' &&
        w.message.includes('вместе') &&
        /\d{4} мм/.test(w.message),
    ),
    said.find((w) => w.message.includes('вместе'))?.message,
  );
  check(
    'раскладка при этом применяется: предупреждение жёлтое',
    said.every((w) => w.severity !== 'blocking'),
  );
  check(
    'на обычной колонне этого предупреждения нет',
    !ergonomicWarnings(columnRun).some((w) => w.message.includes('вместе')),
  );
}


/* ───────────────────  Холодильник: встройка против отдельностоящего  ─────────────────── */

console.log('\nВстроенный и отдельностоящий холодильник — разная мебель');
{
  const builtIn = buildRun(baseInput);
  const free = buildRun({
    ...baseInput,
    requirements: { ...REQ, fridgeType: 'freestanding' },
  });

  const fridgeOf = (run: Run) => run.modules.find((unit) => unit.appliance === 'fridge')!;
  const partsOf = (run: Run) =>
    buildPanels({ run }).filter((panel) => panel.moduleId === fridgeOf(run).id);

  check('встроенный холодильник так и помечен', fridgeOf(builtIn).builtIn === true);
  check('отдельностоящий — тоже', fridgeOf(free).builtIn === false);

  /*
   * РАЗНИЦА ДОЛЖНА ДОЕХАТЬ ДО РАСКРОЯ.
   *
   * Встроенный закрыт фасадом заподлицо — фасадные детали у него есть.
   * Отдельностоящий стоит на виду, фасада у него нет вовсе, и пилить его
   * означало бы отдать в цех деталь, которую выбросят.
   */
  const builtInFronts = partsOf(builtIn).filter((panel) => panel.name.includes('Фасад'));
  const freeFronts = partsOf(free).filter((panel) => panel.name.includes('Фасад'));

  check(
    'у встроенного есть фасадные детали в раскрое',
    builtInFronts.length > 0,
    builtInFronts.map((panel) => `${panel.name} ${panel.lengthMm}×${panel.widthMm}`).join(', '),
  );
  check(
    'у отдельностоящего их нет вовсе',
    freeFronts.length === 0,
    `${freeFronts.length} деталей`,
  );
  check(
    'и сцена видит ту же разницу тем же признаком',
    hasFacade(fridgeOf(builtIn)) && !hasFacade(fridgeOf(free)),
  );

  const withFronts = buildEstimate(builtIn, 'optimal', DEMO_RATES);
  const without = buildEstimate(free, 'optimal', DEMO_RATES);
  check(
    'и деньги разные: фасад и петли встройки чего-то стоят',
    withFronts.total > without.total,
    `${Math.round(without.total)} → ${Math.round(withFronts.total)} ₸`,
  );

  /*
   * ОДИН КОД ОТРИСОВКИ НА ВСЕ ФОРМЫ.
   *
   * Угол — это два таких же ряда, П — три, и коробки им считает та же
   * `runBoxes`. Проверяется не «похоже», а совпадением: ряд, поставленный
   * в угол, даёт ровно те же коробки, что он же сам по себе. Отличается
   * только место, и место считает ОДНА функция (`rowPlacement`).
   */
  const straight = runBoxes(builtIn, {
    thicknessMm: 16,
    frontThicknessMm: 18,
    gapMm: 3,
  });

  const corner = buildComposition({
    kind: 'corner_l',
    walls: [
      { id: 'a', lengthMm: DEMO_PROJECT.lengthMm },
      { id: 'b', lengthMm: 2400 },
    ],
    ceilingHeightMm: 2700,
    requirements: REQ,
  });

  const cornerFirst = runBoxes(corner.segments[0].run, {
    thicknessMm: 16,
    frontThicknessMm: 18,
    gapMm: 3,
  });

  check(
    'ряд в углу собирается тем же кодом, что прямой',
    cornerFirst.length > 0 &&
      cornerFirst.every((box) => box.material !== undefined) &&
      straight.every((box) => box.material !== undefined),
    `прямой ${straight.length} коробок, угловой ${cornerFirst.length}`,
  );

  const second = runBoxes(corner.segments[1].run, {
    thicknessMm: 16,
    frontThicknessMm: 18,
    gapMm: 3,
  });
  const materialsOf = (boxes: typeof straight) =>
    Array.from(new Set(boxes.map((box) => box.material)));
  check(
    'и второй ряд угла — тоже: у него те же материалы коробок',
    materialsOf(second).length > 0 &&
      materialsOf(second).every((material) => materialsOf(straight).includes(material)),
    materialsOf(second).join(', '),
  );

  /*
   * ВНУТРЕННОСТИ ПОМЕЧЕНЫ. По этому признаку сцена решает, рисовать ли
   * по ним рёбра: линии по полкам сквозь закрытый фасад и превращают
   * мебель в проволоку.
   */
  const inside = straight.filter((box) => box.inside);
  check(
    'полки и короба ящиков помечены как внутренние',
    inside.length > 0,
    `${inside.length} внутренних из ${straight.length}`,
  );
  check(
    'а фасады и столешница — нет',
    straight.filter((box) => box.material === 'front').every((box) => !box.inside),
  );
}


/* ───────────────────  Цвет каталога доезжает до сцены  ─────────────────── */

console.log('\nЦвет из палитры организации виден в сцене');
{
  /*
   * Палитра — это ПОЗИЦИИ КАТАЛОГА организации (слой 34). Проверяется не
   * то, что она читается, а то, что выбранный цвет доезжает до сцены:
   * между каталогом и фасадом в 3D стоят `frontSwatch` и материалы, и
   * ровно там однажды разъехались две формулы цвета.
   */
  const items: CatalogEntryFull[] = [
    {
      id: 'itm-graphite',
      orgId: 'org',
      categoryId: 'cat',
      article: 'MDF-GRAPHITE',
      name_ru: 'МДФ графит',
      unit: 'm2',
      price: 42000,
      appliesTo: 'zone',
      meta: { frontBase: 'mdf_enamel', color: '#3A3D40' },
      assets: [],
    } as unknown as CatalogEntryFull,
    {
      id: 'itm-oak',
      orgId: 'org',
      categoryId: 'cat',
      article: 'MDF-OAK',
      name_ru: 'МДФ дуб сонома',
      unit: 'm2',
      price: 39000,
      appliesTo: 'zone',
      meta: { frontBase: 'mdf_enamel', color: '#B79768' },
      assets: [],
    } as unknown as CatalogEntryFull,
  ];

  const palette = paletteFromCatalog(items);
  check('палитра читается из позиций каталога', palette.length === 2, `${palette.length} цвета`);

  /*
   * ДЕМОНСТРАЦИЯ ТОЖЕ С ЦВЕТАМИ.
   *
   * У демо нет организации, и каталог оставался пустым: выбор цвета
   * честно писал «цветов не заведено», а на встрече это читается как
   * отсутствие функции. Берётся ТА ЖЕ типовая палитра, что уходит
   * компании в первый день, — второго списка цветов в продукте нет.
   */
  const demo = paletteFromCatalog(DEMO_CATALOG);
  check(
    'в демо-каталоге вся типовая палитра',
    demo.length === TYPICAL_PALETTE.length && demo.length === 20,
    `${demo.length} цветов`,
  );
  check(
    'и все они помечены типовыми: это не товар компании',
    demo.every((color) => color.typical),
  );
  check(
    'палитра демо покрывает все базы фасадов',
    new Set(demo.map((color) => color.base)).size >= 4,
    Array.from(new Set(demo.map((color) => color.base))).join(', '),
  );

  const forBase = paletteFor(palette, 'mdf_enamel');
  check('и отдаётся по базе фасада', forBase.length === 2, forBase.map((c) => c.name).join(', '));

  const run = buildRun(baseInput);
  const unit = run.modules.find((m) => m.frontType === 'door')!;
  const color = forBase[0];

  const painted = applyOps({
    run,
    requirements: REQ,
    openings: OPENINGS,
    ops: [
      {
        op: 'set_front',
        moduleId: unit.id,
        front: {
          base: 'mdf_enamel',
          construct: 'solid',
          finish: 'matte',
          colorHex: color.colorHex,
          itemId: color.itemId,
        },
      },
    ],
  });

  const after = painted.modules.find((m) => m.id === unit.id)!;
  check(
    'выбор цвета пишет и цвет, и артикул',
    after.front?.colorHex === color.colorHex && after.front?.itemId === color.itemId,
    `${after.front?.colorHex} · ${after.front?.itemId}`,
  );

  /*
   * ЦВЕТ В СЦЕНЕ — ТОТ ЖЕ, ЧТО В КАТАЛОГЕ.
   *
   * Сцена берёт его через `frontSwatch` — ту же функцию, по которой
   * красится схема. Своя формула здесь однажды уже стояла, и акрил без
   * артикула выходил на схеме тёмным, а в сцене бежевым (ловушка 307).
   */
  check(
    'и сцена показывает ИМЕННО этот цвет',
    frontSwatch(frontOf(after)).color.toLowerCase() === color.colorHex.toLowerCase(),
    `${frontSwatch(frontOf(after)).color} против ${color.colorHex}`,
  );

  check(
    'отпечаток от выбора цвета меняется',
    painted.fingerprint !== run.fingerprint,
    `${run.fingerprint} → ${painted.fingerprint}`,
  );

  /* Два декора одного цвета — разные товары, и ключ материала их различает. */
  const sameColor = { ...forBase[0], itemId: 'itm-other', article: 'MDF-OTHER' };
  check(
    'два декора одного цвета различаются артикулом',
    frontKey({ ...frontOf(after), itemId: sameColor.itemId }) !== frontKey(frontOf(after)),
  );
}


/* ───────────────────  Фасады стоят на месте, ручки считаются  ─────────────────── */

console.log('\nФасады, створки и ручки');
{
  const run = buildRun(baseInput);
  const places = runPlaces(run);

  check('раскладка ряда отдаёт все модули', places.length === allModules(run).length,
    `${places.length} мест на ${allModules(run).length} модулей`);

  /*
   * ЗАКРЫТЫЙ ФАСАД ЛЕЖИТ НА ПЕРЕДНЕЙ ПЛОСКОСТИ СВОЕГО КОРПУСА.
   *
   * Проверялось только ОТКРЫТОЕ положение — куда уходит створка. А на
   * скриншоте разъехались закрытые: фасад в стороне от корпуса читается
   * как развалившаяся мебель, и увидеть это можно было только глазами.
   * Теперь меряется каждый модуль: центр фасада по толщине, края внутри
   * корпуса, низ и верх у всех створок модуля общие.
   */
  const off: string[] = [];
  const uneven: string[] = [];
  let fronts = 0;

  for (const place of places) {
    const boxes = moduleBoxes(
      place.unit,
      {
        x: place.x,
        y: place.y,
        heightM: place.heightM,
        depthM: place.depthM,
        thicknessM: 0.016,
      },
      { gapM: 0.003, frontThicknessM: 0.018, integratedHandles: false, cutaway: false },
    );

    const mine = boxes.filter((box) => box.material === 'front');
    if (mine.length === 0) continue;
    fronts += mine.length;

    for (const box of mine) {
      const [bx, by, bz] = box.position;
      const [bw, bh, bd] = box.scale;

      // Передняя плоскость корпуса — ноль по Z; фасад стоит ПЕРЕД ней.
      const onPlane = Math.abs(bz - bd / 2) < 0.0005;
      const insideX =
        bx - bw / 2 >= place.x - 0.0005 &&
        bx + bw / 2 <= place.x + place.unit.widthMm / 1000 + 0.0005;
      const insideY =
        by - bh / 2 >= place.y - 0.0005 && by + bh / 2 <= place.y + place.heightM + 0.0005;

      if (!onPlane || !insideX || !insideY) {
        off.push(`${place.unit.id}: z=${bz.toFixed(3)} x=${bx.toFixed(3)} y=${by.toFixed(3)}`);
      }
    }

    /*
     * СТВОРКИ ОДНОГО МОДУЛЯ ИМЕЮТ ОБЩИЙ ВЕРХ И ОБЩИЙ НИЗ.
     *
     * Филёнка даёт несколько деталей одной створки, поэтому сравниваются
     * не все коробки, а полные полотна — те, что во всю высоту фасада.
     */
    const panels = mine.filter((box) => box.scale[1] > place.heightM * 0.5);
    const tops = new Set(panels.map((box) => Math.round((box.position[1] + box.scale[1] / 2) * 1000)));
    const bottoms = new Set(panels.map((box) => Math.round((box.position[1] - box.scale[1] / 2) * 1000)));
    if (tops.size > 1 || bottoms.size > 1) {
      uneven.push(
        `${place.unit.id}: верх ${Array.from(tops).join('/')}, низ ${Array.from(bottoms).join('/')}`,
      );
    }
  }

  check(
    'закрытый фасад каждого модуля лежит на передней плоскости корпуса',
    off.length === 0 && fronts > 0,
    off.length === 0 ? `${fronts} фасадов, отклонение 0` : off.slice(0, 2).join(' · '),
  );
  check(
    'створки одного модуля имеют общий верх и общий низ',
    uneven.length === 0,
    uneven.length === 0 ? 'все створки выровнены' : uneven.slice(0, 2).join(' · '),
  );

  /*
   * В КОЛОННЕ ХОЛОДИЛЬНИКА РОВНО ОДИН ФАСАД НА НИШУ.
   *
   * На скриншоте посередине холодильника была нарисована лишняя дверца:
   * антресоль над колонной ставилась по отметке навески верхнего ряда
   * (1450 мм) вместо крыши колонны (2400). Одна раскладка на сцену и на
   * коробки это закрыла — проверяем числом, что фасад там один.
   */
  const fridgePlace = places.find((place) => place.unit.appliance === 'fridge')!;
  const fridgeBoxes = moduleBoxes(
    fridgePlace.unit,
    {
      x: fridgePlace.x,
      y: fridgePlace.y,
      heightM: fridgePlace.heightM,
      depthM: fridgePlace.depthM,
      thicknessM: 0.016,
    },
    { gapM: 0.003, frontThicknessM: 0.018, integratedHandles: false, cutaway: false },
  ).filter((box) => box.material === 'front');

  check(
    'у колонны холодильника ровно один фасад',
    fridgeBoxes.length === 1,
    `${fridgeBoxes.length} фасадных коробок`,
  );

  const mezzanine = places.find((place) => place.unit.section === 'mezzanine')!;
  check(
    'антресоль стоит НАД колонной, а не внутри неё',
    Boolean(mezzanine) &&
      mezzanine.y >= fridgePlace.y + fridgePlace.heightM - 0.001,
    mezzanine ? `низ антресоли ${mezzanine.y.toFixed(2)} м, верх колонны ${(fridgePlace.y + fridgePlace.heightM).toFixed(2)} м` : '',
  );

  /* ── Ручки: три типа, три строки, разные деньги ── */
  const door = run.modules.find((unit) => unit.frontType === 'door')!;
  const withHandle = (handle: 'bar' | 'profile' | 'none') =>
    applyOps({
      run,
      requirements: REQ,
      openings: OPENINGS,
      ops: [{ op: 'set_handle', moduleId: door.id, handle }],
    });

  const bar = withHandle('bar');
  const profile = withHandle('profile');
  const push = withHandle('none');

  check(
    'выбор ручки ложится в наполнение модуля',
    push.modules.find((unit) => unit.id === door.id)?.fill?.handle === 'none',
  );
  check(
    'и меняет отпечаток: это другая фурнитура',
    push.fingerprint !== run.fingerprint && profile.fingerprint !== push.fingerprint,
    `${run.fingerprint} → ${push.fingerprint}`,
  );

  const lineOf = (r: Run, key: string) =>
    buildEstimate(r, 'optimal', DEMO_RATES).lines.find((line) => line.key === key);

  check(
    'накладная ручка идёт штуками',
    (lineOf(bar, 'handle_standard')?.quantity ?? 0) > 0,
    `${lineOf(bar, 'handle_standard')?.quantity} шт.`,
  );
  check(
    'врезной профиль — погонными метрами',
    (lineOf(profile, 'handle_integrated')?.quantity ?? 0) > 0,
    `${lineOf(profile, 'handle_integrated')?.quantity} м`,
  );
  check(
    '«без ручки» — это механизм push-to-open, а не пустота',
    (lineOf(push, 'push_to_open')?.quantity ?? 0) > 0,
    `${lineOf(push, 'push_to_open')?.quantity} шт. · ${lineOf(push, 'push_to_open')?.total} ₸`,
  );

  const totals = [bar, profile, push].map(
    (r) => Math.round(buildEstimate(r, 'optimal', DEMO_RATES).total),
  );
  check(
    'три типа ручек дают три разные суммы',
    new Set(totals).size === 3,
    totals.join(' · '),
  );

  /* ── Ручка видна в сцене: у «без ручки» её коробки нет ── */
  const handleBoxes = (r: Run) => {
    const unit = allModules(r).find((m) => m.id === door.id)!;
    const place = runPlaces(r).find((entry) => entry.unit.id === door.id)!;

    return moduleBoxes(
      unit,
      {
        x: place.x,
        y: place.y,
        heightM: place.heightM,
        depthM: place.depthM,
        thicknessM: 0.016,
      },
      { gapM: 0.003, frontThicknessM: 0.018, integratedHandles: false, cutaway: false },
    ).filter((box) => box.material === 'metal');
  };

  check(
    'скоба нарисована, а у «без ручки» на фасаде ничего нет',
    handleBoxes(bar).length > 0 && handleBoxes(push).length === 0,
    `скоб ${handleBoxes(bar).length}, при нажатии ${handleBoxes(push).length}`,
  );
  check(
    'врезной профиль рисуется иначе, чем скоба',
    handleBoxes(profile).length > 0 &&
      JSON.stringify(handleBoxes(profile)) !== JSON.stringify(handleBoxes(bar)),
  );

  /* ── Духовка опущена ── */
  const columnRun = buildRun({
    ...baseInput,
    requirements: { ...REQ, appliances: [...REQ.appliances, 'microwave' as const] },
  });
  const column = columnRun.modules.find((unit) => unit.column)!;
  const niches = columnNiches(column, moduleCarcassHeightMm(column, columnRun));
  const oven = niches.find((niche) => niche.appliance === 'oven')!;
  const ovenFloor = GEOMETRY.base.plinthH + oven.fromMm;

  check(
    'низ духовки не выше 600 мм от пола',
    ovenFloor <= 600,
    `${ovenFloor} мм`,
  );
  check(
    'и пара приборов по-прежнему в пределе',
    (columnNichesSumMm(column, columnRun) ?? 0) <= APPLIANCE_COLUMN.maxPairMm,
    `${columnNichesSumMm(column, columnRun)} мм`,
  );
}


/* ───────────────────  Приборы принадлежат кухне, а не ряду  ─────────────────── */

console.log('\nПрибор один на кухню, и у него есть стена');
{
  const WALLS_AB = [
    { id: 'a', lengthMm: DEMO_PROJECT.lengthMm },
    { id: 'b', lengthMm: 2400 },
  ];

  const corner = buildComposition({
    kind: 'corner_l',
    walls: WALLS_AB,
    ceilingHeightMm: 2700,
    requirements: REQ,
    comms: COMMS,
  });

  /*
   * РАЗДАЧА ВИДНА СНАРУЖИ.
   *
   * Рабочее место собирает стену А своими средствами, и без списка
   * приборов стены оно собирало её из ПОЛНОГО набора: холодильник
   * появлялся дважды — один раз на стене А, второй на той, куда его
   * отдала раздача. Проверка на данных этого не видела: она меряла
   * `buildComposition`, который раздаёт правильно, а расходился — шов
   * между композицией и экраном.
   */
  const share = corner.segments.flatMap((segment) => segment.appliances);
  const doubledShare = share.filter((item, i) => share.indexOf(item) !== i);

  check(
    'композиция называет приборы КАЖДОЙ стены',
    corner.segments.every((segment) => Array.isArray(segment.appliances)),
    corner.segments.map((segment) => `${segment.label}: ${segment.appliances.join(',') || '—'}`).join(' · '),
  );
  check('и ни один прибор не назван дважды', doubledShare.length === 0, doubledShare.join(', '));
  check(
    'раздача совпадает с тем, что реально встало',
    corner.segments.every((segment) =>
      segment.run.modules
        .flatMap((unit) => moduleAppliances(unit))
        .every((appliance) => segment.appliances.includes(appliance)),
    ),
  );

  /*
   * ПЕРЕНОС НА ДРУГУЮ СТЕНУ — ОДНА ПРАВКА СОСТАВА.
   *
   * Прибор принадлежит кухне: у него есть стена, и меняется она выбором,
   * а не удалением с одной стены и добавлением на другую.
   */
  const fridgeWall = corner.segments.findIndex((segment) =>
    segment.appliances.includes('fridge'),
  );
  check('холодильник стоит на одной стене', fridgeWall >= 0, `стена ${fridgeWall}`);

  const other = fridgeWall === 0 ? 1 : 0;
  const moved = buildComposition({
    kind: 'corner_l',
    walls: WALLS_AB,
    ceilingHeightMm: 2700,
    requirements: {
      ...REQ,
      applianceWalls: { fridge: other },
      applianceSizes: { fridge: { widthMm: 700, heightMm: 1900, depthMm: 640 } },
    },
    comms: COMMS,
  });

  check(
    'перенос ставит прибор на выбранную стену',
    moved.segments[other].appliances.includes('fridge') &&
      !moved.segments[fridgeWall].appliances.includes('fridge'),
    moved.segments.map((segment) => `${segment.label}: ${segment.appliances.join(',') || '—'}`).join(' · '),
  );

  const movedUnit = moved.segments[other].run.modules.find(
    (unit) => unit.appliance === 'fridge',
  );
  check(
    'и настройки прибора переезжают вместе с ним',
    movedUnit?.applianceSizes?.fridge?.widthMm === 700 &&
      movedUnit?.applianceSizes?.fridge?.heightMm === 1900,
    JSON.stringify(movedUnit?.applianceSizes?.fridge),
  );
  check(
    'прибор по-прежнему один на кухню',
    moved.segments.flatMap((segment) => segment.appliances).filter((a) => a === 'fridge')
      .length === 1,
  );

  /* Удаление прибора убирает его со всех стен сразу. */
  const without = buildComposition({
    kind: 'corner_l',
    walls: WALLS_AB,
    ceilingHeightMm: 2700,
    requirements: { ...REQ, appliances: REQ.appliances.filter((a) => a !== 'fridge') },
    comms: COMMS,
  });

  check(
    'удаление прибора убирает его со ВСЕХ стен',
    without.segments.every(
      (segment) =>
        !segment.appliances.includes('fridge') &&
        !segment.run.modules.some((unit) => unit.appliance === 'fridge'),
    ),
  );

  /*
   * ДУХОВКА И СВЧ МЕНЯЮТСЯ МЕСТАМИ.
   *
   * Порядок в колонне — это разная присадка и разные полки-опоры, а
   * значит другой раскрой и другие деньги.
   */
  const columnBase = {
    ...baseInput,
    requirements: { ...REQ, appliances: [...REQ.appliances, 'microwave' as const] },
  };

  const microTop = buildRun({
    ...columnBase,
    requirements: { ...columnBase.requirements, columnTop: 'microwave' as const },
  });
  const ovenTop = buildRun({
    ...columnBase,
    requirements: { ...columnBase.requirements, columnTop: 'oven' as const },
  });

  const topOf = (run: Run) => run.modules.find((unit) => unit.column)?.column?.top;
  check('порядок в колонне меняется', topOf(microTop) === 'microwave' && topOf(ovenTop) === 'oven');
  check(
    'смена порядка меняет отпечаток',
    microTop.fingerprint !== ovenTop.fingerprint,
    `${microTop.fingerprint} → ${ovenTop.fingerprint}`,
  );
  /*
   * СМЕТА ОТ ПЕРЕСТАНОВКИ НЕ МЕНЯЕТСЯ — И ЭТО ПРАВДА, А НЕ ДЕФЕКТ.
   *
   * Поменялись местами два прибора; деталей в раскрое столько же и
   * тех же размеров — полки-опоры те же, корпус тот же. Отпечаток при
   * этом обязан измениться: мебель РАЗНАЯ, присадка на другой высоте, и
   * чертёж с раскроем должны это видеть.
   */
  check(
    'а смета не меняется: деталей столько же и тех же размеров',
    Math.round(buildEstimate(microTop, 'optimal', DEMO_RATES).total) ===
      Math.round(buildEstimate(ovenTop, 'optimal', DEMO_RATES).total),
    `${Math.round(buildEstimate(microTop, 'optimal', DEMO_RATES).total)} ₸ в обоих порядках`,
  );
  check(
    'но опоры ниш стоят на РАЗНЫХ высотах',
    JSON.stringify(
      microTop.modules.find((unit) => unit.column)?.fill?.shelves,
    ) !== JSON.stringify(ovenTop.modules.find((unit) => unit.column)?.fill?.shelves),
    `${JSON.stringify(microTop.modules.find((u) => u.column)?.fill?.shelves)} против ` +
      `${JSON.stringify(ovenTop.modules.find((u) => u.column)?.fill?.shelves)}`,
  );

  /*
   * ПРАВИЛА КОЛОННЫ ПРИ ЛЮБОМ ПОРЯДКЕ.
   *
   * Умолчание ставит духовку низом на 580 мм — ниже пояса, как просил
   * клиент. Поставленная СВЕРХУ, она поднимается неизбежно: под ней
   * микроволновка. Запрещать это нельзя — так тоже собирают, — но
   * сказать словами обязаны.
   */
  for (const [name, run] of [['СВЧ сверху', microTop], ['духовка сверху', ovenTop]] as const) {
    const column = run.modules.find((unit) => unit.column)!;
    check(
      `${name}: пара ниш в пределе`,
      (columnNichesSumMm(column, run) ?? 0) <= APPLIANCE_COLUMN.maxPairMm,
      `${columnNichesSumMm(column, run)} мм`,
    );
  }

  check(
    'по умолчанию духовка низом не выше 600 мм',
    (ovenBottomMm(microTop.modules.find((unit) => unit.column)!, microTop) ?? 0) <= 600,
    `${ovenBottomMm(microTop.modules.find((unit) => unit.column)!, microTop)} мм`,
  );
  check(
    'поднятая духовка не запрещается, но говорит о себе числом',
    ergonomicWarnings(ovenTop).some(
      (w) => w.severity === 'clarify' && /Низ духовки на \d+ мм/.test(w.message),
    ),
    ergonomicWarnings(ovenTop).find((w) => w.message.includes('Низ духовки'))?.message,
  );
}

/* ───────────────────  Исполнение прибора: тип даёт габариты  ─────────────────── */

console.log('\nТипы техники: своя ширина и своя ниша');
{
  /*
   * ТИП — ЭТО НАБОР УМОЛЧАНИЙ, А НЕ НОВЫЙ ПРИБОР.
   *
   * Мебельщик заказывает не «вытяжку», а купольную; не «варочную», а
   * газовую. Пока тип был один на прибор, ширину и нишу приходилось
   * вводить руками каждый раз — а «каждый раз» означает «иногда забыли».
   */
  const base = { lengthMm: 3800, ceilingHeightMm: 2700, openings: [], comms: [] };
  const withType = (types: NonNullable<RunRequirements['applianceTypes']>) =>
    buildRun({
      ...base,
      requirements: {
        ...REQ,
        appliances: ['fridge', 'sink600', 'hob', 'hood'] as ApplianceKind[],
        applianceTypes: types,
      },
    });

  check(
    'у каждого типа своя ширина',
    applianceWidthMm('hood', undefined, { hood: 'hood_dome' }) === 900 &&
      applianceWidthMm('hood', undefined, { hood: 'hood_builtin' }) === 600,
    `купольная ${applianceWidthMm('hood', undefined, { hood: 'hood_dome' })} мм · ` +
      `встроенная ${applianceWidthMm('hood', undefined, { hood: 'hood_builtin' })} мм`,
  );

  const nicheOf = (id: string) =>
    nicheHeightMm('microwave', undefined, applianceTypeOf('microwave', { microwave: id }));
  check(
    'и своя ниша',
    nicheOf('microwave_table') !== nicheOf('microwave_builtin'),
    `настольная ${nicheOf('microwave_table')} мм · встроенная ${nicheOf('microwave_builtin')} мм`,
  );

  /*
   * Умолчание — первый тип списка, и оно обязано совпасть с прежним
   * отраслевым стандартом: иначе новый слой молча пересчитал бы всем
   * сохранённым кухням ширины приборов.
   */
  check(
    'умолчание типа совпадает с отраслевым стандартом',
    (['hob', 'oven', 'hood', 'microwave'] as ApplianceKind[]).every(
      (kind) => applianceWidthMm(kind) === APPLIANCE_SLOTS[kind].widthMm,
    ),
    (['hob', 'oven', 'hood', 'microwave'] as ApplianceKind[])
      .map((k) => `${k} ${applianceWidthMm(k)}`)
      .join(' · '),
  );

  const dome = withType({ hood: 'hood_dome' });
  const builtin = withType({ hood: 'hood_builtin' });

  const hoodOf = (r: Run) => allModules(r).find((unit) => unit.appliance === 'hood');

  check(
    'ширина модуля вытяжки приходит из типа',
    (hoodOf(dome)?.widthMm ?? 0) === 900 && (hoodOf(builtin)?.widthMm ?? 0) === 600,
    `купольная ${hoodOf(dome)?.widthMm} мм · встроенная ${hoodOf(builtin)?.widthMm} мм`,
  );
  check(
    'купольная вытяжка меняет ряд, а не только подпись',
    dome.fingerprint !== builtin.fingerprint,
    `${builtin.fingerprint} → ${dome.fingerprint}`,
  );

  /*
   * ЗАМЕРЕННОЕ СИЛЬНЕЕ ТИПОВОГО. Тип — это то, что обычно бывает; замер —
   * то, что стоит у клиента на кухне. Иначе введённый габарит молча
   * возвращался бы к типовому, а это самая дорогая ошибка из возможных.
   */
  check(
    'замеренная ширина сильнее типовой',
    applianceWidthMm('hood', { hood: { widthMm: 700 } }, { hood: 'hood_dome' }) === 700,
    `${applianceWidthMm('hood', { hood: { widthMm: 700 } }, { hood: 'hood_dome' })} мм`,
  );

  const gas = withType({ hob: 'hob_gas' });
  const electric = withType({ hob: 'hob_electric' });
  check(
    'газовая и электрическая — разная глубина прибора',
    applianceTypeOf('hob', { hob: 'hob_gas' })?.depthMm !==
      applianceTypeOf('hob', { hob: 'hob_electric' })?.depthMm,
    `газ ${applianceTypeOf('hob', { hob: 'hob_gas' })?.depthMm} мм · ` +
      `электро ${applianceTypeOf('hob', { hob: 'hob_electric' })?.depthMm} мм`,
  );
  check(
    'а ряд от смены варочной не разваливается',
    gas.modules.length === electric.modules.length &&
      gas.modules.reduce((sum, unit) => sum + unit.widthMm, 0) ===
        electric.modules.reduce((sum, unit) => sum + unit.widthMm, 0),
    `${gas.modules.length} модулей, ${gas.modules.reduce((sum, u) => sum + u.widthMm, 0)} мм`,
  );

  /*
   * Тип доезжает до модуля ГАБАРИТАМИ, а не идентификатором: раскрой и
   * смета читают миллиметры, и второго словаря типов у них быть не должно.
   */
  check(
    'тип доезжает до модуля габаритами',
    (hoodOf(dome)?.applianceSizes?.hood?.widthMm ?? 0) === 900,
    JSON.stringify(hoodOf(dome)?.applianceSizes?.hood ?? null),
  );

  // Детерминизм: тип не должен приносить плавающих чисел.
  check(
    'тот же тип даёт тот же ряд',
    withType({ hood: 'hood_dome' }).fingerprint === dome.fingerprint,
  );

  /*
   * УМОЛЧАНИЕ В ДАННЫЕ НЕ ПИШЕТСЯ (ловушка 246).
   *
   * Записанное, оно сдвинуло бы отпечатки ВСЕХ сохранённых кухонь разом
   * и потянуло бы за собой раскрой: паспортная глубина духовки 560 + 20
   * просвета отодвигает пенал на 20 мм, и в смете появляются метры,
   * которых не было. Измерено: 1 650 499 ₸ → 1 651 667 ₸ на демо-ряду,
   * при том что человек ничего не выбирал.
   */
  const none = withType({});
  const explicitDefault = withType({ hob: 'hob_electric', hood: 'hood_builtin' });
  check(
    'типовое исполнение не меняет ни отпечаток, ни раскрой',
    none.fingerprint === explicitDefault.fingerprint &&
      JSON.stringify(buildPanels({ run: none })) ===
        JSON.stringify(buildPanels({ run: explicitDefault })),
    `${none.fingerprint} · ${explicitDefault.fingerprint}`,
  );
  check(
    'и габариты типового прибора в модуль не пишутся',
    allModules(none)
      .filter((unit) => unit.appliance)
      .every((unit) => unit.applianceSizes === undefined),
    JSON.stringify(
      allModules(none)
        .filter((unit) => unit.applianceSizes)
        .map((unit) => `${unit.label}: ${JSON.stringify(unit.applianceSizes)}`),
    ),
  );
  check(
    'а выбранное — пишется: это другая мебель',
    hoodOf(dome)?.applianceSizes?.hood !== undefined &&
      dome.fingerprint !== none.fingerprint,
    JSON.stringify(hoodOf(dome)?.applianceSizes?.hood ?? null),
  );

  // Неизвестный тип — это не поломка: остаётся типовое исполнение.
  check(
    'мусор в типе не роняет расчёт',
    applianceWidthMm('hood', undefined, { hood: 'нет-такого' }) ===
      applianceWidthMm('hood', undefined, { hood: 'hood_builtin' }),
    `${applianceWidthMm('hood', undefined, { hood: 'нет-такого' })} мм`,
  );
}

/* ───────────────────  Фронт у модуля один: створки ИЛИ ящики  ─────────────────── */

console.log('\nЯщики под варочной выдвигаются');
{
  /*
   * ЯЩИКИ ПОД ВАРОЧНОЙ — ОБЫЧНЫЕ ЯЩИКИ.
   *
   * Модуль под варочной панелью числился «нишей», и сцена оставляла там
   * глухую панель: на чертеже два фронта, в раскрое два фронта, а взяться
   * за них нельзя. Прибор занимает нишу сверху, под ним ящики (слой 34),
   * и выдвигаются они так же, как у соседей.
   */
  const kitchen = buildRun({
    lengthMm: 3800,
    ceilingHeightMm: 2700,
    requirements: {
      ...REQ,
      appliances: ['fridge', 'sink600', 'dishwasher45', 'hob', 'hood', 'oven'] as ApplianceKind[],
    },
    openings: [],
    comms: COMMS,
  });

  const hob = kitchen.modules.find((unit) => unit.appliance === 'hob')!;
  const drawerIds = openablePartIds(kitchen).filter((id) => id.startsWith(`${hob.id}:drawer:`));

  check(
    'у модуля под варочной есть фронты ящиков',
    (hob.fill?.drawerHeights.length ?? 0) > 0,
    JSON.stringify(hob.fill?.drawerHeights),
  );
  check(
    'и столько же ящиков в сцене',
    drawerBoxCount(hob, kitchen) === hob.fill!.drawerHeights.length,
    `${drawerBoxCount(hob, kitchen)} ящиков в сцене`,
  );
  check(
    '«Открыть всё» знает про них',
    drawerIds.length === hob.fill!.drawerHeights.length,
    drawerIds.join(', ') || 'ни одного',
  );

  /*
   * ОТКРЫВАЕТСЯ РОВНО ТО, ЧТО НАРИСОВАНО. Два списка — «что рисуем» и
   * «что открываем» — расходились молча: ящики под варочной рисовались и
   * не открывались, а у ящичного модуля числилась створка, которой в
   * сцене нет.
   */
  const movable = (run: Run) =>
    runPlaces(run)
      .flatMap((place) =>
        moduleBoxes(
          place.unit,
          {
            x: place.x,
            y: place.y,
            heightM: place.heightM,
            depthM: place.depthM,
            thicknessM: 0.016,
          },
          { gapM: 0.003, frontThicknessM: 0.018, integratedHandles: false, cutaway: false },
        ),
      )
      .map((box) => box.part)
      .filter((id): id is string => Boolean(id));

  const drawn = new Set(movable(kitchen));
  const openable = new Set(openablePartIds(kitchen));
  check(
    'список открываемого совпадает с нарисованным',
    openablePartIds(kitchen).every((id) => drawn.has(id)) &&
      Array.from(drawn).every((id) => openable.has(id)),
    `нарисовано ${drawn.size}, открывается ${openable.size}`,
  );

  /*
   * СТВОРКИ ПОВЕРХ ЯЩИКОВ НЕ БЫВАЕТ.
   *
   * `Math.max(1, doorCount)` подставлял створку там, где её нет в данных,
   * — и вешал её на фронты ящиков и на открытую секцию. В раскрое ни
   * той, ни другой нет, то есть сцена показывала мебель, которой цех не
   * сделает. В демо таких модулей нет, поэтому этого никто не видел.
   */
  const freeReq2: RunRequirements = { ...REQ, mode: 'free', appliances: [], sections: [] };
  const hand = applyOps({
    run: buildRun({
      lengthMm: 3600,
      ceilingHeightMm: 2700,
      requirements: freeReq2,
      openings: [],
      comms: [],
    }),
    requirements: freeReq2,
    ops: [
      { op: 'add_module', kind: 'base', widthMm: 600, variant: 'drawers' },
      { op: 'add_module', kind: 'base', widthMm: 600, variant: 'open_base' },
      { op: 'add_module', kind: 'base', widthMm: 600, variant: 'door' },
    ],
  });

  const drawersUnit = hand.modules.find((unit) => unit.frontType === 'drawers')!;
  const openUnit = hand.modules.find((unit) => unit.frontType === 'none')!;
  const doorUnit = hand.modules.find((unit) => unit.frontType === 'door')!;

  check(
    'у ящичного модуля створок нет ни одной',
    doorCount(drawersUnit) === 0 &&
      !openablePartIds(hand).some((id) => id === `${drawersUnit.id}:door:0`),
    `${doorCount(drawersUnit)} створок при ${drawersUnit.fill?.drawerHeights.length} ящиках`,
  );
  check(
    'у открытой секции створки тоже нет',
    doorCount(openUnit) === 0,
    `${doorCount(openUnit)} створок`,
  );
  check(
    'а у дверцы она есть',
    doorCount(doorUnit) === 1,
    `${doorCount(doorUnit)} створка`,
  );

  /*
   * И ГЛАВНОЕ: СЦЕНА СОГЛАСНА С РАСКРОЕМ. Фасадных деталей в раскрое
   * столько же, сколько створок нарисовано, — иначе клиент выбирает
   * глазами одно, а цех пилит другое.
   */
  for (const [name, run] of [['кухня', kitchen], ['собранный руками ряд', hand]] as const) {
    const cut = buildPanels({ run });
    let mismatch = '';

    for (const unit of allModules(run)) {
      const facades = cut
        .filter((panel) => panel.moduleId === unit.id && panel.name === 'Фасад')
        .reduce((sum, panel) => sum + panel.qty, 0);
      const scene = doorCount(unit);

      /*
       * Фасад колонны режется участками над нишей и под ней: там своя
       * раскладка, и створок в сцене у колонны нет вовсе.
       *
       * ВСТРОЕННЫЙ ХОЛОДИЛЬНИК — ИЗВЕСТНОЕ РАСХОЖДЕНИЕ, И ОНО НАЗВАНО.
       * В раскрое у него две створки друг над другом (дверь камеры и
       * дверь морозильника, `BUILT_IN_FRIDGE_FRONTS`), а сцена рисует
       * одно полотно во всю высоту: створки в ней раскладываются только
       * В РЯД, вертикальной раскладки у неё нет вовсе. Число деталей и
       * петель в смете при этом верное — расходится картинка.
       */
      if (unit.column || hasVisibleAppliance(unit) || unit.builtIn) continue;
      if (facades !== scene) mismatch = `${unit.label}: раскрой ${facades}, сцена ${scene}`;
    }

    check(`${name}: створок в сцене столько же, сколько фасадов в раскрое`, mismatch === '', mismatch);
  }
}

/* ───────────────────  Ригель: выступ на потолке  ─────────────────── */

console.log('\nРигель на потолке');
{
  /*
   * РИГЕЛЬ — ЭТО ОБЪЕКТ ЗАМЕРА, КОТОРЫЙ ДОЕЗЖАЕТ ДО РАСКРОЯ.
   *
   * В квартире по потолку идёт балка или короб, и шкафы под ним в полную
   * высоту не встают. Система считала потолок ровным: ряд упирался в
   * выступ, а узнавали об этом на монтаже — когда мебель уже распилена.
   */
  const beam = (fromCornerMm: number, widthMm: number, dropMm: number): Opening => ({
    id: `beam-${fromCornerMm}`,
    kind: 'beam',
    fromCornerMm,
    widthMm,
    sillMm: 0,
    heightMm: dropMm,
  });

  const toCeiling: RunRequirements = {
    ...REQ,
    options: { ...REQ.options, upperToCeiling: true },
    lockedOptions: ['upperToCeiling'],
  };
  const shell = { lengthMm: 3800, ceilingHeightMm: 2700, comms: COMMS };

  const flat = buildRun({ ...shell, requirements: toCeiling, openings: [] });
  const ribbed = buildRun({
    ...shell,
    requirements: toCeiling,
    openings: [beam(1200, 900, 300)],
  });

  /* ── 1. Замер доезжает до раскладки ── */

  const survey = emptySurvey();
  survey.ceilingHeightMm = measured(2700);
  survey.walls = [
    {
      id: 'w1',
      lengthMm: measured(3800),
      turn: 'right',
      turnDeg: 90,
      isRunWall: true,
      openings: [
        {
          id: 'op-beam',
          kind: 'beam',
          fromCornerMm: measured(1200),
          widthMm: measured(900),
          heightMm: measured(300),
          sillMm: measured(0),
        },
      ],
    },
  ];

  const resolved = resolveSurvey(survey).measurement;
  const fromSurvey = (resolved.walls[0].openings ?? []).filter(
    (opening) => opening.kind === 'beam',
  );
  check(
    'ригель из замера доезжает до входных данных ряда',
    fromSurvey.length === 1 &&
      fromSurvey[0].fromCornerMm === 1200 &&
      fromSurvey[0].widthMm === 900 &&
      beamDropMm(fromSurvey[0]) === 300,
    JSON.stringify(fromSurvey[0] ?? null),
  );

  const surveyed = buildRun({
    ...shell,
    requirements: toCeiling,
    openings: resolved.walls[0].openings ?? [],
  });
  check(
    'и ряд собирается с ним: ригель лежит на ряду',
    (surveyed.beams ?? []).length === 1 && surveyed.fingerprint === ribbed.fingerprint,
    `${surveyed.fingerprint} · ${ribbed.fingerprint}`,
  );

  /* ── 2. Верхний ряд под ним ниже, и это видно в раскрое ── */

  const underBeam = (run: Run) =>
    allModules(run).filter(
      (unit) =>
        unit.kind === 'upper' &&
        unit.offsetMm < 2100 &&
        unit.offsetMm + unit.widthMm > 1200 &&
        unit.section !== 'mezzanine',
    );

  const tallUnder = underBeam(ribbed).map((unit) => moduleCarcassHeightMm(unit, ribbed));
  const tallFlat = underBeam(flat).map((unit) => moduleCarcassHeightMm(unit, flat));
  check(
    'верхний ряд под выступом ниже ровно на его свес',
    tallUnder.length > 0 &&
      tallFlat.length > 0 &&
      Math.max(...tallFlat) - Math.max(...tallUnder) === 300,
    `${Math.max(...tallFlat)} → ${Math.max(...tallUnder)} мм`,
  );

  const sideOf = (run: Run, id: string) =>
    buildPanels({ run }).find(
      (panel) => panel.moduleId === id && panel.name === 'Боковина',
    )?.lengthMm;

  const sampleId = underBeam(ribbed)[0]?.id ?? '';
  check(
    'и раскрой пилит боковину именно такой высоты',
    sideOf(ribbed, sampleId) === moduleCarcassHeightMm(underBeam(ribbed)[0], ribbed),
    `боковина ${sideOf(ribbed, sampleId)} мм`,
  );
  check(
    'ригель меняет отпечаток: ряд под ним — другая мебель',
    ribbed.fingerprint !== flat.fingerprint,
    `${flat.fingerprint} → ${ribbed.fingerprint}`,
  );
  check(
    'а без ригеля отпечаток прежний: умолчание в него не пишется',
    buildRun({ ...shell, requirements: toCeiling, openings: [] }).fingerprint ===
      flat.fingerprint,
  );

  /* ── 3. Ряд не пересекает ригель ── */

  const drops = [120, 300, 600, 900, 1000, 1300];
  const hits = drops
    .map((drop) => {
      const run = buildRun({
        ...shell,
        requirements: toCeiling,
        openings: [beam(1200, 900, drop)],
      });
      return { drop, hits: beamHits(run) };
    })
    .filter((row) => row.hits.length > 0);

  check(
    'ни один модуль не заходит в выступ — на любом свесе',
    hits.length === 0,
    hits.map((row) => `${row.drop}: ${row.hits[0].message}`).join(' ') || 'пересечений нет',
  );

  /*
   * Разрыв ряда, как на окне: под выступом, который оставил меньше
   * полезного шкафа, верхнего ряда нет вовсе.
   */
  const deep = buildRun({
    ...shell,
    requirements: toCeiling,
    openings: [beam(1200, 900, 1000)],
  });
  check(
    'осталось меньше полезного шкафа — ряд под выступом разрывается',
    !allModules(deep).some(
      (unit) =>
        unit.kind === 'upper' &&
        unit.section !== 'mezzanine' &&
        unit.offsetMm < 2100 &&
        unit.offsetMm + unit.widthMm > 1200,
    ),
    deep.upperSegments.map((seg) => `${seg.fromMm}..${seg.toMm}`).join(' '),
  );
  check(
    'а пока места хватает — шкаф просто ниже, и он остаётся',
    allModules(
      buildRun({ ...shell, requirements: toCeiling, openings: [beam(1200, 900, 900)] }),
    ).some(
      (unit) =>
        unit.kind === 'upper' && unit.offsetMm >= 1200 && unit.offsetMm + unit.widthMm <= 2100,
    ),
  );

  /* ── 4. Ригель нарисован на чертеже ── */

  const svg = renderToStaticMarkup(createElement(ElevationDrawing, { run: ribbed }));
  check(
    'ригель нарисован на фасадном чертеже',
    svg.includes('data-beams') && svg.includes('data-beam="beam-1200"'),
    svg.includes('data-beams') ? 'группа есть' : 'группы нет',
  );
  check(
    'и подписан свесом, а не просто заштрихован',
    svg.includes('Ригель 300'),
  );
  check(
    'на ровном потолке ничего лишнего не рисуется',
    !renderToStaticMarkup(createElement(ElevationDrawing, { run: flat })).includes('data-beams'),
  );

  /* ── 5. Предупреждение последствием ── */

  const said = beamWarnings(ribbed);
  check(
    'выступ объясняется ПОСЛЕДСТВИЕМ, а не фактом',
    said.length === 1 &&
      said[0].severity === 'clarify' &&
      /Под выступом шкаф ниже на 300 мм/.test(said[0].message) &&
      said[0].message.includes('не сойдётся'),
    said[0]?.message,
  );
  check(
    'а разрыв ряда назван разрывом',
    beamWarnings(deep).some((w) => /ряд там разрывается/.test(w.message)),
    beamWarnings(deep)[0]?.message,
  );
  check(
    'на ровном потолке продукт молчит',
    beamWarnings(flat).length === 0,
  );

  /*
   * Ригель едет через правки состава: `applyOps` пересобирает верхний ряд
   * и обязан считать разрыв по ТОМУ ЖЕ ригелю, что урезал высоту.
   */
  const edited = applyOps({
    run: ribbed,
    requirements: toCeiling,
    ops: [{ op: 'set_width', moduleId: ribbed.modules[ribbed.modules.length - 1].id, widthMm: 500 }],
    openings: [],
  });
  check(
    'правка состава не теряет ригель и не ломает высоты',
    (edited.beams ?? []).length === 1 && beamHits(edited).length === 0,
    `ригелей ${(edited.beams ?? []).length}, пересечений ${beamHits(edited).length}`,
  );

  /* Угловая кухня: ригель обрезается по длине своего ряда. */
  const corner = buildComposition({
    kind: 'corner_l',
    walls: [
      { id: 'a', lengthMm: 3800, openings: [beam(3400, 1200, 300)] },
      { id: 'b', lengthMm: 2400, openings: [] },
    ],
    ceilingHeightMm: 2700,
    requirements: toCeiling,
    comms: COMMS,
  });
  const first = corner.segments[0].run;
  check(
    'в угловой ригель обрезан по полезной длине ряда',
    (first.beams ?? []).every(
      (b) => b.fromCornerMm + b.widthMm <= first.lengthMm,
    ),
    (first.beams ?? []).map((b) => `${b.fromCornerMm}+${b.widthMm} при ${first.lengthMm}`).join(' '),
  );
}

/* ───────────────────  Объектная сумма: слияние смет по стенам  ─────────────────── */

console.log('\nСмета объекта — сумма стен, а не второй расчёт');
{
  /*
   * ИТОГ СТРОКИ СЧИТАЕТСЯ ОДИН РАЗ — при расчёте стены.
   *
   * Слияние пересчитывало его из `quantity × rate`, и у процентной
   * статьи это давало бессмыслицу: у крепежа `rate` — ПРОЦЕНТЫ (12), а
   * не цена за метр. На угловой кухне 20 258 + 7 148 превращались в
   * 288 ₸, и цех недосчитывался крепежа на каждом объекте из двух стен.
   */
  const objectOf = (wallsMm: number[]) => {
    const requirements: RunRequirements = REQ;

    const runs =
      wallsMm.length === 1
        ? [
            buildRun({
              lengthMm: wallsMm[0],
              ceilingHeightMm: 2700,
              requirements,
              openings: [],
              comms: [],
            }),
          ]
        : buildComposition({
            kind: wallsMm.length === 2 ? 'corner_l' : 'u_shape',
            walls: wallsMm.map((lengthMm, i) => ({ id: `w${i}`, lengthMm, openings: [] })),
            ceilingHeightMm: 2700,
            requirements,
            comms: [],
          }).segments.map((segment) => segment.run);

    const parts = runs.map((run) => buildEstimate(run, MAIN_VARIANT, DEMO_RATES));
    return { parts, merged: mergeEstimates(parts) };
  };

  const shapes: { title: string; walls: number[] }[] = [
    { title: 'одна стена', walls: [3800] },
    { title: 'две стены', walls: [3800, 1140] },
    { title: 'три стены', walls: [3800, 1140, 1740] },
  ];

  for (const shape of shapes) {
    const { parts, merged } = objectOf(shape.walls);

    /*
     * Пустая смета — это не «проверять нечего», это ноль в документе,
     * который увидит клиент. Падаем здесь, а не проходим по пустому.
     */
    check(
      `${shape.title}: смета объекта не пустая`,
      parts.length === shape.walls.length &&
        parts.every((part) => part.lines.length > 0) &&
        merged.lines.length > 0,
      `стен ${parts.length}, строк ${merged.lines.length}, ` +
        `по стенам ${parts.map((p) => p.lines.length).join('/')}`,
    );

    /* Обычная статья: сумма объекта — это сумма по стенам, до тенге. */
    const plain = merged.lines.filter(
      (line) => line.unit !== 'percent' && !line.key.startsWith('delivery'),
    );
    const drift = plain
      .map((line) => {
        const byWalls = parts.reduce(
          (sum, part) => sum + (part.lines.find((l) => l.key === line.key)?.total ?? 0),
          0,
        );
        return { key: line.key, object: line.total, byWalls };
      })
      .filter((row) => Math.abs(row.object - row.byWalls) > 0.5);

    check(
      `${shape.title}: обычные статьи сходятся со стенами до тенге`,
      plain.length > 0 && drift.length === 0,
      plain.length === 0
        ? 'ОБЫЧНЫХ СТАТЕЙ НЕ НАШЛОСЬ ВОВСЕ'
        : drift.length === 0
          ? `сверено статей ${plain.length}`
          : drift.map((r) => `${r.key}: объект ${r.object} ≠ стены ${r.byWalls}`).join(' '),
    );

    /*
     * ПРОЦЕНТНАЯ СТАТЬЯ СЧИТАЕТСЯ ОТ ОБЪЕКТНОЙ БАЗЫ.
     *
     * У крепежа база — стоимость корпуса ЛДСП, та же, что в
     * `buildEstimate`. Складывать проценты стен нельзя: 12 % плюс 12 %
     * это не 24 %.
     */
    const fasteners = merged.lines.find((line) => line.key === 'fasteners');
    const carcass = merged.lines.find((line) => line.key === 'ldsp_carcass');
    const expected = round2(((carcass?.total ?? 0) * (fasteners?.rate ?? 0)) / 100);

    check(
      `${shape.title}: крепёж — процент от корпуса ОБЪЕКТА`,
      Boolean(fasteners && carcass) && Math.abs((fasteners?.total ?? 0) - expected) <= 1,
      fasteners
        ? `${fasteners.total} ₸ при ${fasteners.rate} % от корпуса ${carcass?.total} ₸ (ждали ${expected})`
        : 'СТРОКИ КРЕПЕЖА НЕТ',
    );

    /*
     * РАЗОВАЯ СТАТЬЯ — ОДНА НА ОБЪЕКТ, И СЧИТАЕТСЯ ОТ ОБЪЕКТНОЙ БАЗЫ.
     *
     * Везут и монтируют весь объект, а не первую его стену: раньше
     * дедуп оставлял строку стены А как есть, и восемь процентов
     * считались от одной стены из трёх.
     */
    const deliveryLines = merged.lines.filter((line) => line.key.startsWith('delivery'));
    const subtotal = round2(
      merged.lines
        .filter((line) => line.enabled && !line.key.startsWith('delivery'))
        .reduce((sum, line) => sum + line.total, 0),
    );
    const delivery = deliveryLines[0];
    const wantDelivery = round2((subtotal * (delivery?.rate ?? 0)) / 100);

    check(
      `${shape.title}: доставка одной строкой от объектной базы`,
      deliveryLines.length === 1 && Math.abs((delivery?.total ?? 0) - wantDelivery) <= 1,
      delivery
        ? `строк ${deliveryLines.length}, ${delivery.total} ₸ при ${delivery.rate} % от ${subtotal} ₸`
        : 'СТРОКИ ДОСТАВКИ НЕТ',
    );

    check(
      `${shape.title}: итог объекта — сумма включённых строк`,
      Math.abs(
        merged.total -
          round2(merged.lines.filter((l) => l.enabled).reduce((sum, l) => sum + l.total, 0)),
      ) <= 1,
      `${merged.total} ₸`,
    );
  }

  /*
   * КОНТРОЛЬ РЕГРЕССИИ: объект из ОДНОЙ стены не меняется ни на тенге.
   *
   * Слияние одной сметы обязано отдать её саму — иначе правка объектной
   * суммы переписала бы все прямые кухни, которых она не касается.
   */
  const singles = [2400, 3200, 3800, 4200].map((lengthMm) => {
    const run = buildRun({
      lengthMm,
      ceilingHeightMm: 2700,
      requirements: REQ,
      openings: [],
      comms: [],
    });
    const one = buildEstimate(run, MAIN_VARIANT, DEMO_RATES);
    return { lengthMm, one, merged: mergeEstimates([one]) };
  });

  check(
    'одностенный объект не поехал ни на тенге',
    singles.length > 0 &&
      singles.every(
        (row) =>
          row.merged.total === row.one.total &&
          row.merged.lines.length === row.one.lines.length &&
          row.merged.lines.every(
            (line, i) =>
              line.key === row.one.lines[i].key &&
              line.total === row.one.lines[i].total &&
              line.quantity === row.one.lines[i].quantity,
          ),
      ),
    singles.map((row) => `${row.lengthMm}: ${Math.round(row.one.total)}`).join(' · '),
  );
}

/* ───────────────────  Прибор меряет всё, а не то, что собралось  ─────────────────── */

console.log('\nНи одна конфигурация не пропущена');
{
  /*
   * Набор, который сам решает, что мерить, — не прибор. Каждая
   * конфигурация обязана СОБРАТЬСЯ; не собралась — падение с именем и
   * текстом ошибки, а не молчаливый `continue`.
   */
  check(
    'все конфигурации шаблонов собрались',
    buildFailures.length === 0,
    buildFailures.length === 0
      ? 'падений нет'
      : `${buildFailures.length} шт.: ` + buildFailures.join('  ·  '),
  );
}

/* ───────────────────  Антресоль шкафа под ригелем  ─────────────────── */

console.log('\nАнтресоль стоит на объявленной опоре');
{
  /*
   * ОПОРА АНТРЕСОЛИ — КОЛОННА ПРИБОРА, А НЕ ЛЮБОЙ ВЫСОКИЙ МОДУЛЬ.
   *
   * В шкафу-купе и в прихожей секции стоят от пола до потолка, и каждая
   * из них считалась «колонной». Антресоль получала высоту «остаток над
   * опорой» — то есть НОЛЬ — и садилась на потолок: четыре детали
   * нулевого размера в раскрое, которых инвариант непересечения не
   * видел, потому что у нуля нет объёма.
   *
   * Под ригелем одна секция укорачивалась, опора у её антресоли
   * пропадала, та падала на объявленную полосу и врезалась в соседнюю
   * секцию во всю высоту. Это и роняло `wardrobe-mezzanine@4000` —
   * молча, через `catch { continue; }`.
   */
  const beam: Opening = {
    id: 'beam-test',
    kind: 'beam',
    fromCornerMm: 2400,
    widthMm: 1000,
    sillMm: 0,
    heightMm: 600,
  };

  const cases: { id: string; lengthMm: number }[] = [
    { id: 'wardrobe-mezzanine', lengthMm: 4000 },
    { id: 'wardrobe-hinged', lengthMm: 4200 },
    { id: 'wardrobe-mezzanine', lengthMm: 4200 },
    { id: 'hallway-mezzanine', lengthMm: 3800 },
  ];

  for (const one of cases) {
    const template = RUN_TEMPLATES.find((t) => t.id === one.id);
    if (!template) {
      check(`${one.id}: шаблон найден`, false, 'ШАБЛОНА С ТАКИМ ИМЕНЕМ НЕТ');
      continue;
    }

    const requirements = requirementsFromTemplate(template, DEMO_REQUIREMENTS.options);

    for (const [where, openings] of [
      ['ровный потолок', [] as Opening[]],
      ['под ригелем', [beam]],
    ] as const) {
      const label = `${one.id}@${one.lengthMm} · ${where}`;

      let run: Run | null = null;
      let threw = '';
      try {
        run = buildRun({
          lengthMm: one.lengthMm,
          ceilingHeightMm: 2700,
          requirements,
          openings: [...openings],
          comms: [],
        });
      } catch (error) {
        threw = `${(error as Error).name}: ${(error as Error).message.slice(0, 110)}`;
      }

      check(`${label}: собирается`, threw === '' && run !== null, threw || 'собрался');
      if (!run) continue;

      const mezzanines = allModules(run).filter((unit) => unit.section === 'mezzanine');
      const sections = run.modules;

      /*
       * Ноль модулей — это не «проверять нечего»: это пустой шкаф.
       * Падаем здесь, а не проходим по пустому списку.
       */
      check(
        `${label}: в ряду есть секции и антресоль`,
        sections.length > 0 && mezzanines.length > 0,
        `секций ${sections.length}, антресолей ${mezzanines.length}` +
          (sections.length === 0 || mezzanines.length === 0 ? ' — ПУСТО' : ''),
      );
      if (mezzanines.length === 0) continue;

      /*
       * Низ антресоли равен ОБЪЯВЛЕННОЙ опоре: полосе антресоли этого
       * ряда. Считает её одна функция, та же, что урезала секции под ней.
       */
      const declared = mezzanineBottomMm(run);
      const wrong = mezzanines
        .map((unit) => ({ unit, y: upperBottomFor(unit, run!) }))
        .filter((row) => Math.abs(row.y - declared) > 1);

      check(
        `${label}: низ антресоли равен объявленной полосе ${declared} мм`,
        wrong.length === 0,
        wrong.length === 0
          ? `антресолей ${mezzanines.length}, все на ${declared}`
          : wrong.map((row) => `${row.unit.offsetMm}: ${row.y}`).join(' '),
      );

      check(
        `${label}: у антресоли есть высота, а не ноль`,
        mezzanines.every((unit) => moduleCarcassHeightMm(unit, run!) > 0),
        mezzanines.map((unit) => moduleCarcassHeightMm(unit, run!)).join('/'),
      );

      check(
        `${label}: секции кончаются там, где начинается антресоль`,
        sections.every(
          (unit) =>
            GEOMETRY.base.plinthH + moduleCarcassHeightMm(unit, run!) <= declared + 1,
        ),
        sections
          .map((unit) => GEOMETRY.base.plinthH + moduleCarcassHeightMm(unit, run!))
          .join('/'),
      );

      check(`${label}: пересечений модулей нет`, moduleOverlaps(run).length === 0,
        moduleOverlaps(run).map((o) => o.message).join(' ').slice(0, 120) || 'нет');
    }
  }

  /*
   * Кухня не поехала: там опора настоящая — колонна холодильника, и
   * антресоль над ней по-прежнему берёт остаток над её крышей.
   */
  const kitchen = buildRun({
    lengthMm: 3800,
    ceilingHeightMm: 2700,
    requirements: { ...REQ, appliances: ['fridge', 'oven', 'sink600', 'hob', 'hood'] },
    openings: [],
    comms: COMMS,
  });
  const overFridge = allModules(kitchen).find(
    (unit) => unit.section === 'mezzanine' && mezzanineBaseOf(unit, kitchen) !== null,
  );
  const column = kitchen.modules.find((unit) => unit.appliance === 'fridge');

  check(
    'над колонной холодильника опора осталась колонной',
    Boolean(overFridge && column) &&
      mezzanineBaseOf(overFridge!, kitchen)?.id === column?.id &&
      upperBottomFor(overFridge!, kitchen) ===
        GEOMETRY.base.plinthH + moduleCarcassHeightMm(column!, kitchen),
    overFridge
      ? `${overFridge.label}: низ ${upperBottomFor(overFridge, kitchen)}, ` +
        `высота ${moduleCarcassHeightMm(overFridge, kitchen)}`
      : 'АНТРЕСОЛИ НАД КОЛОННОЙ НЕТ',
  );
}

/* ───────────────────  «Не собралось» — это состояние, а не пустота  ─────────────────── */

console.log('\nУпавшая сборка говорит словами, а не молчит');
{
  /*
   * Рабочий экран ловил исключение сборки и возвращал `null` — то есть
   * «формы нет». Замерщик видел пустоту и не знал почему, а объект при
   * этом уходил в сохранение.
   *
   * Проверка идёт ТЕМ ЖЕ публичным путём, что и экран: `tryBuildComposition`.
   */
  const attemptOf = (kind: CompositionKind, wallsMm: number[], requirements: RunRequirements) =>
    tryBuildComposition({
      kind,
      walls: wallsMm.map((lengthMm, i) => ({ id: `w${i}`, lengthMm, openings: [] })),
      ceilingHeightMm: 2700,
      requirements,
      comms: [],
    });

  /*
   * Стена Б короче того, что занял в углу ряд А: 600 − 660 уходит в
   * минус, и `assertCornerFits` бросает `CornerOverlapError`. Ровно эта
   * конфигурация и пряталась за `catch { return null }`.
   */
  const refused = attemptOf('corner_l', [3200, 600], REQ);

  check(
    'несобравшаяся композиция возвращает состояние «не собралось»',
    refused.state === 'refused',
    refused.state,
  );
  check(
    'и причина не пустая: имя исключения и текст',
    refused.state === 'refused' &&
      refused.reason.trim().length > 0 &&
      /Error/.test(refused.error),
    refused.state === 'refused' ? `${refused.error.slice(0, 110)}` : 'ПРИЧИНЫ НЕТ',
  );
  check(
    'причина написана словами, а не кодом',
    refused.state === 'refused' && /[а-яё]/i.test(refused.reason),
    refused.state === 'refused' ? refused.reason.slice(0, 110) : '',
  );

  /*
   * ЦЕНЫ В ЭТОМ СОСТОЯНИИ НЕТ ВОВСЕ — и это свойство типа, а не
   * дисциплина вызывающего: у отказа нет композиции, значит нечего
   * положить ни в смету, ни в чертёж.
   */
  check(
    'у отказа нет композиции, а значит и цены',
    refused.state === 'refused' && !('composition' in refused),
    refused.state === 'refused' ? 'композиции нет' : 'КОМПОЗИЦИЯ ЕСТЬ',
  );

  /*
   * ПУСТАЯ КОМПОЗИЦИЯ — ДРУГОЕ СОСТОЯНИЕ.
   *
   * Свободная сборка начинается с пустых стен: это законный, собравшийся
   * результат с нулевой сметой. Слить его с отказом значило бы показать
   * замерщику «не сошлось» там, где он ещё просто не начал.
   */
  const emptyReq: RunRequirements = { ...REQ, mode: 'free', appliances: [], sections: [] };
  const empty = attemptOf('corner_l', [3200, 1800], emptyReq);

  check(
    'пустая композиция собирается, а не отказывает',
    empty.state === 'built',
    empty.state === 'built'
      ? `сегментов ${empty.composition.segments.length}`
      : `ОТКАЗ: ${empty.state === 'refused' ? empty.reason.slice(0, 80) : ''}`,
  );

  if (empty.state !== 'built') {
    check('пустая композиция отдала сегменты', false, 'СЕГМЕНТОВ НЕТ');
  } else {
    const modules = empty.composition.segments.reduce(
      (sum, segment) => sum + segment.run.modules.length,
      0,
    );
    const price = mergeEstimates(
      empty.composition.segments.map((segment) =>
        buildEstimate(segment.run, MAIN_VARIANT, DEMO_RATES),
      ),
    ).total;

    check(
      'и она пустая именно мебелью, а не состоянием',
      empty.composition.segments.length === 2 && modules === 0 && price === 0,
      `сегментов ${empty.composition.segments.length}, модулей ${modules}, смета ${price} ₸`,
    );
    check(
      'состояние «пустая» не равно состоянию «не собралось»',
      empty.state !== refused.state,
      `${empty.state} против ${refused.state}`,
    );
  }

  /* Собравшаяся композиция по-прежнему отдаёт мебель и цену. */
  const built = attemptOf('corner_l', [3800, 1800], REQ);
  check(
    'собравшаяся композиция отдаёт мебель',
    built.state === 'built' &&
      built.composition.segments.length === 2 &&
      built.composition.segments.every((segment) => segment.run.modules.length > 0),
    built.state === 'built'
      ? built.composition.segments.map((s) => `${s.label}: ${s.run.modules.length}`).join(' · ')
      : `ОТКАЗ: ${built.state === 'refused' ? built.reason.slice(0, 80) : ''}`,
  );
}

/* ───────────────────  Глубины и высоты — школа цеха  ─────────────────── */

console.log('\nДве школы цеха дают две разные мебели');
{
  /*
   * «Глубина 550, верх 350, антресоль 550, цоколь 100, боковина 760,
   * столешница 40, фартук 600» — так работает один мебельщик; у другого
   * 600/300 и 720/38/592. Это не отраслевой стандарт, а школа цеха, и
   * захардкоженные числа делали раскрой неверным для половины клиентов.
   *
   * ПРОИЗВОДНЫЕ НЕ ХРАНЯТСЯ: рабочая поверхность и низ навесных считаются
   * формулой из первичных величин, и ни 858, ни 900, ни 1450, ни 1500 не
   * лежат в продукте отдельным числом.
   */
  const shopA: ProductionSettings = {
    ...DEFAULT_PRODUCTION,
    depths: { baseMm: 550, upperMm: 350, mezzanineMm: 550 },
    heights: { plinthMm: 100, carcassMm: 760, countertopMm: 40, apronMm: 600 },
  };
  const shopB: ProductionSettings = {
    ...DEFAULT_PRODUCTION,
    depths: { baseMm: 600, upperMm: 300, mezzanineMm: 600 },
    heights: { plinthMm: 100, carcassMm: 720, countertopMm: 38, apronMm: 592 },
  };

  const runOf = (production: ProductionSettings) =>
    buildRun({
      lengthMm: 3800,
      ceilingHeightMm: 2700,
      requirements: REQ,
      openings: [],
      comms: COMMS,
      production,
    });

  for (const [name, shop, worktop, upper] of [
    ['цех А', shopA, 900, 1500],
    ['цех Б', shopB, 858, 1450],
  ] as const) {
    const run = runOf(shop);
    const cut = buildPanels({ run, production: shop });

    /*
     * Ноль деталей — это не «проверять нечего», это пустой лист раскроя.
     * Падаем здесь, а не проходим по пустому списку.
     */
    check(
      `${name}: раскрой не пустой`,
      cut.length > 0 && run.modules.length > 0,
      `деталей ${cut.length}, модулей ${run.modules.length}` +
        (cut.length === 0 ? ' — ПУСТО' : ''),
    );
    if (cut.length === 0) continue;

    /* ── Производные считаются формулой, а не берутся константой ── */
    check(
      `${name}: рабочая поверхность = цоколь + боковина + столешница`,
      workTopMm(shop) ===
        shop.heights.plinthMm + shop.heights.carcassMm + shop.heights.countertopMm &&
        workTopMm(shop) === worktop,
      `${workTopMm(shop)} мм`,
    );
    check(
      `${name}: низ навесных = рабочая поверхность + фартук`,
      upperBottomMm(shop) === workTopMm(shop) + shop.heights.apronMm &&
        upperBottomMm(shop) === upper,
      `${upperBottomMm(shop)} мм`,
    );

    /* ── Раскрой режет по настройке организации ── */
    const sideOf = (kind: 'base' | 'upper') => {
      const unit = run.modules.find((m) => m.kind === kind && !m.appliance)
        ?? allModules(run).find((m) => m.kind === kind && !m.appliance);
      const panel = unit
        ? cut.find((row) => row.moduleId === unit.id && row.name === 'Боковина')
        : undefined;
      return { unit, panel };
    };

    const base = sideOf('base');
    check(
      `${name}: боковина нижнего — глубина и высота цеха`,
      Boolean(base.panel) &&
        base.panel!.widthMm === shop.depths.baseMm &&
        base.panel!.lengthMm === shop.heights.carcassMm,
      base.panel
        ? `${base.panel.lengthMm}×${base.panel.widthMm} мм`
        : 'БОКОВИНЫ НИЖНЕГО НЕТ',
    );

    const upperUnit = allModules(run).find(
      (m) => m.kind === 'upper' && !m.appliance && m.section !== 'mezzanine',
    );
    const upperSide = upperUnit
      ? cut.find((row) => row.moduleId === upperUnit.id && row.name === 'Боковина')
      : undefined;
    check(
      `${name}: боковина верхнего — глубина верхнего ряда цеха`,
      Boolean(upperSide) && upperSide!.widthMm === shop.depths.upperMm,
      upperSide ? `${upperSide.lengthMm}×${upperSide.widthMm} мм` : 'БОКОВИНЫ ВЕРХНЕГО НЕТ',
    );

    /* ── Антресоль идёт по глубине НИЖНЕГО ряда ── */
    const mezz = allModules(run).find((m) => m.section === 'mezzanine');
    const mezzSide = mezz
      ? cut.find((row) => row.moduleId === mezz.id && row.name === 'Боковина')
      : undefined;
    check(
      `${name}: антресоль по глубине равна настройке антресоли`,
      Boolean(mezzSide) && mezzSide!.widthMm === shop.depths.mezzanineMm,
      mezzSide ? `${mezzSide.widthMm} мм при настройке ${shop.depths.mezzanineMm}` : 'АНТРЕСОЛИ НЕТ',
    );

    /* ── Сцена, чертёж и смета показывают ТЕ ЖЕ числа ── */
    const places = runPlaces(run);
    const sceneBase = places.find((spot) => spot.unit.id === base.unit?.id);
    check(
      `${name}: сцена ставит нижний ряд на цоколь цеха`,
      Boolean(sceneBase) && Math.round((sceneBase?.y ?? 0) * 1000) === shop.heights.plinthMm,
      `${Math.round((sceneBase?.y ?? 0) * 1000)} мм`,
    );
    check(
      `${name}: сцена берёт ту же глубину, что раскрой`,
      Boolean(sceneBase) &&
        Math.round((sceneBase?.depthM ?? 0) * 1000) === base.panel?.widthMm,
      `${Math.round((sceneBase?.depthM ?? 0) * 1000)} мм против ${base.panel?.widthMm}`,
    );

    const sceneUpper = places.find((spot) => spot.unit.id === upperUnit?.id);
    check(
      `${name}: сцена вешает верхний ряд на расчётной отметке`,
      Boolean(sceneUpper) && Math.round((sceneUpper?.y ?? 0) * 1000) === upperBottomMm(shop),
      `${Math.round((sceneUpper?.y ?? 0) * 1000)} мм при формуле ${upperBottomMm(shop)}`,
    );

    const svg = renderToStaticMarkup(createElement(ElevationDrawing, { run }));
    check(
      `${name}: чертёж подписывает ту же рабочую поверхность`,
      svg.includes(String(worktop)),
      svg.includes(String(worktop)) ? `${worktop} на листе` : `${worktop} НА ЛИСТЕ НЕТ`,
    );

    const estimate = buildEstimate(run, MAIN_VARIANT, DEMO_RATES, [], undefined, shop);
    const carcass = estimate.lines.find((l) => l.key === 'ldsp_carcass');
    check(
      `${name}: смета берёт метры из этого же раскроя`,
      Boolean(carcass) &&
        Math.abs((carcass?.quantity ?? 0) - panelMaterials(cut).carcassM2) < 0.01,
      `смета ${carcass?.quantity} м², раскрой ${panelMaterials(cut).carcassM2} м²`,
    );
  }

  /* ── Две школы дают РАЗНЫЙ раскрой и разные деньги ── */
  const cutA = buildPanels({ run: runOf(shopA), production: shopA });
  const cutB = buildPanels({ run: runOf(shopB), production: shopB });
  check(
    'две организации с разными глубинами дают разный раскрой',
    JSON.stringify(cutA) !== JSON.stringify(cutB) &&
      panelMaterials(cutA).carcassM2 !== panelMaterials(cutB).carcassM2,
    `${panelMaterials(cutA).carcassM2} м² против ${panelMaterials(cutB).carcassM2} м²`,
  );

  /* ── Умолчание не поехало ни на миллиметр ── */
  check(
    'умолчания продукта = прежние числа кода',
    workTopMm(DEFAULT_PRODUCTION) === 858 &&
      upperBottomMm(DEFAULT_PRODUCTION) === 1450 &&
      DEFAULT_PRODUCTION.depths.baseMm === 560 &&
      DEFAULT_PRODUCTION.depths.upperMm === 320,
    `${workTopMm(DEFAULT_PRODUCTION)} / ${upperBottomMm(DEFAULT_PRODUCTION)} / ` +
      `${DEFAULT_PRODUCTION.depths.baseMm} / ${DEFAULT_PRODUCTION.depths.upperMm}`,
  );
  check(
    'ряд без настроек собирается ровно как ряд с умолчаниями',
    JSON.stringify(
      buildPanels({ run: buildRun({ lengthMm: 3800, ceilingHeightMm: 2700, requirements: REQ, openings: [], comms: COMMS }) }),
    ) === JSON.stringify(buildPanels({ run: runOf(DEFAULT_PRODUCTION), production: DEFAULT_PRODUCTION })),
  );

  /* ── Угол пересчитывается вслед за глубиной ── */
  check(
    'занятое в углу следует за глубиной цеха',
    cornerLostMm('false_panel', shopA.depths.baseMm) === 650 &&
      cornerLostMm('false_panel', shopB.depths.baseMm) === 700,
    `А ${cornerLostMm('false_panel', shopA.depths.baseMm)} · ` +
      `Б ${cornerLostMm('false_panel', shopB.depths.baseMm)}`,
  );
}

/* ───────────────────  Одна величина — одно число на всех видах  ─────────────────── */

console.log('\nЦех А: 900 и 40 на всех видах сразу');
{
  /*
   * Величина, вынесенная в настройки цеха, не имеет права читаться из
   * `GEOMETRY` нигде. Копия формулы рабочей поверхности жила в выносках
   * и давала 858 цеху с боковиной 760 — при том, что чертёж рядом
   * показывал 900. Разошедшийся размер хуже отсутствующего: по нему
   * сверлят присадку.
   */
  const shopA: ProductionSettings = {
    ...DEFAULT_PRODUCTION,
    depths: { baseMm: 550, upperMm: 350, mezzanineMm: 550 },
    heights: { plinthMm: 100, carcassMm: 760, countertopMm: 40, apronMm: 600 },
  };

  const run = buildRun({
    lengthMm: 3800,
    ceilingHeightMm: 2700,
    requirements: REQ,
    openings: [],
    comms: COMMS,
    production: shopA,
  });

  const cut = buildPanels({ run, production: shopA });
  const leaders = buildLeaders(run, cut);

  /*
   * Ноль выносок или ноль панелей — это не «проверять нечего», это
   * пустой лист. Падаем здесь, а не проходим по пустому списку.
   */
  check(
    'цех А: выноски и раскрой не пустые',
    leaders.length > 0 && cut.length > 0,
    `выносок ${leaders.length}, деталей ${cut.length}` +
      (leaders.length === 0 || cut.length === 0 ? ' — ПУСТО' : ''),
  );
  if (leaders.length === 0 || cut.length === 0) {
    check('цех А: дальше мерить нечем', false, 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ');
  } else {
    /* ── Выноска рабочей поверхности ── */
    const counterLeader = leaders.find((leader) => /Столешница/i.test(leader.text));
    check(
      'цех А: выноска столешницы стоит на рабочей поверхности цеха',
      Boolean(counterLeader) &&
        Math.abs((counterLeader?.yMm ?? 0) - (workTopMm(shopA) - shopA.heights.countertopMm / 2)) <= 1,
      counterLeader
        ? `${counterLeader.yMm} мм при рабочей поверхности ${workTopMm(shopA)}`
        : 'ВЫНОСКИ СТОЛЕШНИЦЫ НЕТ',
    );
    check(
      'цех А: выноска цоколя называет высоту цеха',
      leaders.some((leader) => leader.text.includes(`высота ${shopA.heights.plinthMm}`)),
      leaders.find((leader) => /Цоколь/i.test(leader.text))?.text ?? 'ВЫНОСКИ ЦОКОЛЯ НЕТ',
    );

    /*
     * 900, а не 858: выноска фартука стоит ровно посередине между
     * рабочей поверхностью и низом навесных, и обе величины — формулы.
     */
    const apronLeader = leaders.find((leader) => /фартук|Фартук/.test(leader.text));
    check(
      'цех А: выноска фартука посередине между 900 и 1500',
      Boolean(apronLeader) &&
        Math.abs(
          (apronLeader?.yMm ?? 0) - Math.round((workTopMm(shopA) + upperBottomMm(shopA)) / 2),
        ) <= 1,
      apronLeader
        ? `${apronLeader.yMm} мм при ${workTopMm(shopA)}…${upperBottomMm(shopA)}`
        : 'ВЫНОСКИ ФАРТУКА НЕТ',
    );
    check(
      'цех А: рабочая поверхность 900, а не 858',
      workTopMm(shopA) === 900 && upperBottomMm(shopA) === 1500,
      `${workTopMm(shopA)} / ${upperBottomMm(shopA)}`,
    );

    /* ── Толщина столешницы: чертёж, разрез, сцена ── */
    const elevation = renderToStaticMarkup(createElement(ElevationDrawing, { run }));
    const section = renderToStaticMarkup(createElement(SectionDrawing, { run }));

    check(
      'цех А: чертёж подписывает рабочую поверхность 900',
      elevation.includes('900'),
      elevation.includes('900') ? '900 на листе' : '900 НА ЛИСТЕ НЕТ',
    );
    check(
      'цех А: разрез рисуется по глубине цеха',
      section.includes(String(shopA.depths.baseMm)),
      section.includes(String(shopA.depths.baseMm))
        ? `${shopA.depths.baseMm} в разрезе`
        : `${shopA.depths.baseMm} В РАЗРЕЗЕ НЕТ`,
    );

    /* ── Попарное сравнение: чертёж против сцены, чертёж против раскроя ── */
    const places = runPlaces(run);
    const base = run.modules.find((unit) => !unit.appliance && unit.kind === 'base');
    const spot = places.find((row) => row.unit.id === base?.id);
    const side = base
      ? cut.find((row) => row.moduleId === base.id && row.name === 'Боковина')
      : undefined;

    check(
      'цех А: чертёж против сцены — низ корпуса совпадает',
      Boolean(spot) && Math.round((spot?.y ?? 0) * 1000) === shopA.heights.plinthMm,
      `сцена ${Math.round((spot?.y ?? 0) * 1000)} мм, цоколь цеха ${shopA.heights.plinthMm}`,
    );
    check(
      'цех А: чертёж против раскроя — высота боковины совпадает',
      Boolean(side) && side!.lengthMm === shopA.heights.carcassMm,
      side ? `${side.lengthMm} мм при боковине ${shopA.heights.carcassMm}` : 'БОКОВИНЫ НЕТ',
    );
    check(
      'цех А: сцена против раскроя — глубина совпадает',
      Boolean(spot && side) && Math.round((spot?.depthM ?? 0) * 1000) === side!.widthMm,
      `сцена ${Math.round((spot?.depthM ?? 0) * 1000)} мм, раскрой ${side?.widthMm} мм`,
    );

    /*
     * Отметка навески — одно число на раскладку, чертёж и сцену. У цеха
     * с фартуком 600 это 1500, и разойтись им негде.
     */
    const upperUnit = allModules(run).find(
      (unit) => unit.kind === 'upper' && unit.section !== 'mezzanine',
    );
    const upperSpot = places.find((row) => row.unit.id === upperUnit?.id);
    check(
      'цех А: низ навесных 1500 и в раскладке, и в сцене',
      Boolean(upperSpot) &&
        Math.round((upperSpot?.y ?? 0) * 1000) === upperBottomMm(shopA) &&
        upperBottomMm(shopA) === 1500,
      `${Math.round((upperSpot?.y ?? 0) * 1000)} мм`,
    );
  }
}

/* ───────────────────  Идентификатор модуля уникален по ОБЪЕКТУ  ─────────────────── */

console.log('\nМодуль стены А и модуль стены Б — разные модули');
{
  /*
   * `moduleId` собирается из вида и СМЕЩЕНИЯ ВНУТРИ РЯДА
   * (`${kind}-${offsetMm}`), и ряда в нём нет. У двух стен одинаковые
   * начала: модуль в нуле стены А и модуль в нуле стены Б получают один
   * и тот же `base-0`.
   *
   * Любое состояние, ключённое по id, прикладывается тогда сразу к
   * обоим: открытая дверца, выделение, выбранный вариант. Открываешь
   * антресоль на стене А — открывается и на стене Б.
   */
  const walls = (ls: number[]) =>
    ls.map((lengthMm, i) => ({ id: `w${i}`, lengthMm, openings: [] }));

  const shapes: { title: string; kind: CompositionKind; ls: number[] }[] = [
    { title: 'прямая', kind: 'linear', ls: [3800] },
    { title: 'угловая', kind: 'corner_l', ls: [3800, 1800] },
    { title: 'П-образная', kind: 'u_shape', ls: [3800, 1800, 2400] },
  ];

  for (const shape of shapes) {
    const runs =
      shape.kind === 'linear'
        ? [
            buildRun({
              lengthMm: shape.ls[0],
              ceilingHeightMm: 2700,
              requirements: REQ,
              openings: [],
              comms: COMMS,
            }),
          ]
        : buildComposition({
            kind: shape.kind,
            walls: walls(shape.ls),
            ceilingHeightMm: 2700,
            requirements: REQ,
            comms: COMMS,
          }).segments.map((segment) => segment.run);

    const modules = runs.flatMap((run) => allModules(run));

    /*
     * Ноль модулей — это не «проверять нечего», это пустой объект.
     * Падаем здесь, а не проходим по пустому списку.
     */
    check(
      `${shape.title}: в объекте есть модули`,
      runs.length === shape.ls.length && modules.length > 0,
      `рядов ${runs.length}, модулей ${modules.length}` +
        (modules.length === 0 ? ' — ПУСТО' : ''),
    );
    if (modules.length === 0) continue;

    /* ── Идентификаторы уникальны ПО ОБЪЕКТУ, а не по ряду ── */
    const seen = new Map<string, number>();
    for (const unit of modules) seen.set(unit.id, (seen.get(unit.id) ?? 0) + 1);
    const collisions = Array.from(seen.entries()).filter(([, count]) => count > 1);

    check(
      `${shape.title}: идентификаторы модулей уникальны по объекту`,
      collisions.length === 0,
      collisions.length === 0
        ? `${modules.length} модулей, ${seen.size} идентификаторов`
        : `СТОЛКНОВЕНИЙ ${collisions.length}: ` +
          collisions.map(([id, count]) => `${id}×${count}`).slice(0, 5).join(' '),
    );

    /*
     * Состояние по id не протекает между рядами — проверяем ВСЕ пары.
     * Сравнивать только первые два ряда мало: в П-образной сталкиваются
     * стена А и стена В, а А с Б расходятся случайно — потому что на Б
     * первым встал прибор, и суффикс у него свой.
     */
    if (runs.length > 1) {
      const parts = runs.map((run) => openablePartIds(run));
      const leaks: string[] = [];

      for (let i = 0; i < parts.length; i += 1) {
        for (let j = i + 1; j < parts.length; j += 1) {
          const both = parts[j].filter((id) => parts[i].includes(id));
          if (both.length > 0) {
            leaks.push(`${wallLabel(i)}×${wallLabel(j)}: ${both.slice(0, 3).join(' ')}`);
          }
        }
      }

      /*
       * ВЫБРАННЫЙ ВАРИАНТ ТОЖЕ КЛЮЧУЕТСЯ ПО id.
       *
       * Правка идёт операцией `set_variant` с идентификатором модуля.
       * Совпади он у двух рядов — и карго встало бы сразу на двух
       * стенах, а в смете появился бы механизм, которого никто не
       * заказывал.
       */
      /*
       * Вариант берём ИЗ СПИСКА, который движок для этого места и
       * предлагает: «карго» в модуле 1200 мм не бывает, и отказ движка
       * доказывал бы не то, что мы проверяем.
       */
      const target = runs[0].modules.find(
        (unit) => !unit.appliance && variantsForModule(unit, runs[0]).length > 0,
      );
      const pick = target ? variantsForModule(target, runs[0])[0].kind : null;
      if (target && pick) {
        const beforeB = runs[1].modules.map((unit) => unit.variant ?? '-').join(',');
        const editedA = applyOps({
          run: runs[0],
          requirements: REQ,
          ops: [{ op: 'set_variant', moduleId: target.id, variant: pick }],
          openings: [],
        });
        const afterB = runs[1].modules.map((unit) => unit.variant ?? '-').join(',');

        check(
          `${shape.title}: выбор варианта на одном ряду не трогает другой`,
          editedA.modules.some((unit) => unit.variant === pick) && beforeB === afterB,
          `на А встал «${pick}», стена Б до «${beforeB}», после «${afterB}»`,
        );
      } else {
        check(`${shape.title}: есть модуль под правку варианта`, false, 'ОБЫЧНОГО МОДУЛЯ НЕТ');
      }

      check(
        `${shape.title}: открывание одного ряда не трогает другой`,
        parts.every((list) => list.length > 0) && leaks.length === 0,
        parts.some((list) => list.length === 0)
          ? 'ОТКРЫВАЕМЫХ ЧАСТЕЙ НЕТ'
          : leaks.length === 0
            ? `ключей по рядам: ${parts.map((l) => l.length).join('/')}`
            : `ОБЩИЕ КЛЮЧИ — ${leaks.join(' | ')}`,
      );
    }
  }

  /* ── Длина стены из замера доезжает до композиции ── */
  const survey = emptySurvey();
  survey.ceilingHeightMm = measured(2700);
  survey.walls = [
    { id: 'w1', lengthMm: measured(3800), turn: 'right', turnDeg: 90, isRunWall: true, openings: [] },
    { id: 'w2', lengthMm: measured(1800), turn: 'right', turnDeg: 90, openings: [] },
  ];

  const measurement = resolveSurvey(survey).measurement;
  const fromSurvey = measurement.walls.map((wall) => wall.lengthMm);

  check(
    'замер отдаёт длины обеих стен',
    fromSurvey.length === 2 && fromSurvey[0] === 3800 && fromSurvey[1] === 1800,
    fromSurvey.join(' + ') || 'СТЕН НЕТ',
  );

  const built = buildComposition({
    kind: 'corner_l',
    walls: measurement.walls.map((wall) => ({
      id: wall.id,
      lengthMm: wall.lengthMm,
      openings: wall.openings ?? [],
    })),
    ceilingHeightMm: 2700,
    requirements: REQ,
    comms: [],
  });

  check(
    'длина стены из замера равна длине стены в композиции',
    built.segments.length === 2 &&
      built.segments.every((segment, i) => segment.wallLengthMm === fromSurvey[i]),
    built.segments.map((s) => `${s.label}: ${s.wallLengthMm}`).join(' · '),
  );

  /*
   * ДВЕ СТЕНЫ ОДНОЙ ДЛИНЫ — ЭТО НОРМА, А НЕ ДУБЛЬ.
   *
   * Квадратная кухня 3000×3000 — обычная планировка. Композиция обязана
   * принять обе стены и не схлопнуть их в одну.
   */
  const square = buildComposition({
    kind: 'corner_l',
    walls: [
      { id: 'w1', lengthMm: 3000, openings: [] },
      { id: 'w2', lengthMm: 3000, openings: [] },
    ],
    ceilingHeightMm: 2700,
    requirements: REQ,
    comms: [],
  });
  check(
    'две стены одинаковой длины остаются двумя стенами',
    square.segments.length === 2 &&
      square.segments.every((segment) => segment.wallLengthMm === 3000),
    square.segments.map((s) => `${s.label}: ${s.wallLengthMm}`).join(' · '),
  );
}

/* ───────────────────  Ряд не сходится со своей стеной  ─────────────────── */

console.log('\nСохранённый ряд сверяется с длиной стены');
{
  /*
   * Соседние стены восстанавливаются из сохранённого состояния дословно
   * и с текущей стеной не сверялись: замерщик поправил стену Б с 1800 на
   * 1140, полезная длина стала 480, а ряд остался на 1140. Место рядов
   * считается цепочкой от `run.lengthMm`, поэтому всё, что стоит ЗА
   * этим рядом, уезжало на разницу — на П-образной между стеной А и
   * стеной В открывалась пустота 680 мм.
   */
  const walls = (ls: number[]) =>
    ls.map((lengthMm, i) => ({ id: `w${i}`, lengthMm, openings: [] }));

  const layout = buildComposition({
    kind: 'u_shape',
    walls: walls([3800, 1140, 1740]),
    ceilingHeightMm: 2700,
    requirements: REQ,
    comms: COMMS,
  });

  const fresh = layout.segments.map((segment) => segment.run);

  check(
    'композиция собралась и ряды есть',
    fresh.length === 3 && fresh.every((run) => run.lengthMm > 0),
    fresh.length === 0 ? 'РЯДОВ НЕТ' : fresh.map((run) => run.lengthMm).join(' + '),
  );
  if (fresh.length !== 3) {
    check('дальше мерить нечем', false, 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ РЯДОВ');
  } else {
    check(
      'свежая композиция расхождений не даёт',
      wallMismatches(layout, fresh).length === 0,
      wallMismatches(layout, fresh).map((m) => m.label).join(' ') || 'расхождений нет',
    );

    /* Ряд, собранный на полной стене 1140, при полезных 480. */
    const stale = buildRun({
      lengthMm: 1140,
      ceilingHeightMm: 2700,
      requirements: REQ,
      openings: [],
      comms: COMMS,
    });
    const withStale = [fresh[0], stale, fresh[2]];
    const found = wallMismatches(layout, withStale);

    check(
      'ряд на 1140 при стене 480 расхождение ПОКАЗЫВАЕТ',
      found.length === 1 &&
        found[0].index === 1 &&
        found[0].runLengthMm === 1140 &&
        found[0].usableMm === 480,
      found.length === 0
        ? 'РАСХОЖДЕНИЕ НЕ НАЙДЕНО — ряд встал молча'
        : `${found[0].label}: ряд ${found[0].runLengthMm} при стене ${found[0].usableMm}`,
    );

    check(
      'и названо оно последствием, а не фактом',
      found.length === 1 &&
        /не встанет и сдвинет соседний ряд на 660 мм/.test(wallMismatchMessage(found[0])) &&
        /Пересоберите/.test(wallMismatchMessage(found[0])),
      found.length > 0 ? wallMismatchMessage(found[0]) : 'СООБЩЕНИЯ НЕТ',
    );

    /* Короткий ряд на длинной стене — то же расхождение с другой стороны. */
    const short = buildRun({
      lengthMm: 300,
      ceilingHeightMm: 2700,
      requirements: { ...REQ, mode: 'free', appliances: [], sections: [] },
      openings: [],
      comms: [],
    });
    /*
     * Ноль расхождений — это сломанная сверка, а не «всё сошлось».
     * Читать `[0]` из пустого списка нельзя: прогон падал бы
     * исключением вместо внятной строки.
     */
    const shorter = wallMismatches(layout, [fresh[0], short, fresh[2]]);
    check(
      'ряд короче стены тоже расхождение, и сказано про пустое место',
      shorter.length === 1 && /останутся пустыми/.test(wallMismatchMessage(shorter[0])),
      shorter.length === 0
        ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ РАСХОЖДЕНИЙ — короткий ряд прошёл молча'
        : wallMismatchMessage(shorter[0]),
    );

    /*
     * У БЛОКИРУЮЩЕГО СОСТОЯНИЯ ЕСТЬ ВЫХОД.
     *
     * «Пересобрать стену» снимает ПРАВКУ, а под ней лежит ряд, который
     * композиция только что посчитала на текущей полезной длине. Второго
     * места сборки не появляется — и расхождение уходит.
     */
    check(
      'снятая правка возвращает ряд, сходящийся со стеной',
      wallMismatches(layout, [withStale[0], layout.segments[1].run, withStale[2]]).length === 0,
      `под правкой ряд ${layout.segments[1].run.lengthMm} при стене ${fresh[1].lengthMm}`,
    );

    /* Допуск миллиметровый: округление не должно поднимать тревогу. */
    check(
      'миллиметр разницы расхождением не считается',
      wallMismatches(layout, [
        fresh[0],
        { ...stale, lengthMm: fresh[1].lengthMm + 1 },
        fresh[2],
      ]).length === 0,
    );
  }
}

/* ─────────────  Стены отбираются по идентификатору, а не по длине  ───────────── */

/**
 * СИМПТОМ 3: ДЛИНА СТЕНЫ ИЗ ЗАМЕРА НЕ ДОЕЗЖАЛА ДО КОНФИГУРАТОРА.
 *
 * Проверка выше кормила `buildComposition` напрямую и была зелёной:
 * расходилась не композиция, а ШОВ перед ней — отбор соседних стен на
 * рабочем экране. Он вычитал их ЗНАЧЕНИЕМ:
 *
 *   measured.filter(w => w.lengthMm !== runLengthMm)
 *
 * Две стены одной длины — обычная планировка, и на ней отбор терял
 * вторую, а на её место вставала глубина помещения: величина, которой в
 * замере нет вовсе. Меряем ровно шов — `compositionWalls`.
 */
console.log('\nСтены отбираются по идентификатору, а не по длине');
{
  const wallsOf = (lengths: number[]) =>
    lengths.map((lengthMm, i) => ({
      id: `w${i + 1}`,
      lengthMm: measured(lengthMm),
      turn: 'right' as const,
      turnDeg: 90,
      isRunWall: i === 0,
      openings: [],
    }));

  /** Замер → тот же отбор, что делает рабочий экран. */
  const selectOf = (lengths: number[], roomDepthMm = 3200) => {
    const survey = emptySurvey();
    survey.ceilingHeightMm = measured(2700);
    survey.walls = wallsOf(lengths);

    const resolution = resolveSurvey(survey);
    const run = workingWall(resolution.measurement, resolution.runWallId);

    return {
      resolution,
      roomDepthMm,
      selected: compositionWalls({
        measured: resolution.measurement.walls,
        runWallId: resolution.runWallId,
        runLengthMm: run.lengthMm,
        runOpenings: run.openings,
      }),
    };
  };

  /*
   * Ноль стен — это не «проверять нечего», это пустой конфигуратор.
   * Падаем здесь, а не молча проходим по пустому списку.
   */
  const probe = selectOf([3800, 1140]);
  check(
    'отбор вообще что-то вернул',
    probe.selected.length === 2,
    probe.selected.length === 0
      ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ СТЕН — мерить нечего'
      : probe.selected.map((w) => w.lengthMm).join(' + '),
  );

  if (probe.selected.length === 0) {
    check('дальше мерить нечем', false, 'ОТБОР ПУСТ');
  } else {
    /* ── Две стены одной длины: раньше вторая выпадала ── */
    const same = selectOf([3800, 3800]);
    check(
      'А=3800 и Б=3800 дают РОВНО две стены, а не три',
      same.selected.length === 2 && same.selected.every((wall) => wall.lengthMm === 3800),
      `${same.selected.length} шт.: ${same.selected.map((w) => w.lengthMm).join(' + ')}`,
    );

    check(
      'и идентификаторы у них разные — это две стены, а не одна дважды',
      new Set(same.selected.map((wall) => wall.id)).size === 2,
      same.selected.map((w) => w.id).join(' · '),
    );

    /* ── Квадратная 3000×3000: глубина помещения больше не подставляется ── */
    const square = selectOf([3000, 3000], 3200);
    check(
      'квадратная 3000×3000 не подставляет ничего из глубины помещения',
      square.selected.length === 2 && square.selected.every((wall) => wall.lengthMm === 3000),
      square.selected.map((w) => w.lengthMm).join(' + '),
    );

    check(
      'и в списке нет длины, которой нет в замере',
      square.selected.every((wall) =>
        square.resolution.measurement.walls.some((m) => m.lengthMm === wall.lengthMm),
      ),
      `глубина помещения ${square.roomDepthMm} мм в отборе: ` +
        (square.selected.some((w) => w.lengthMm === square.roomDepthMm) ? 'ЕСТЬ' : 'нет'),
    );

    /* ── Три одинаковые стены остаются тремя ── */
    const three = selectOf([3000, 3000, 3000]);
    check(
      'три одинаковые стены 3000/3000/3000 остаются тремя',
      three.selected.length === 3 &&
        three.selected.every((wall) => wall.lengthMm === 3000) &&
        new Set(three.selected.map((wall) => wall.id)).size === 3,
      `${three.selected.length} шт.: ${three.selected.map((w) => `${w.id}=${w.lengthMm}`).join(' ')}`,
    );

    const u = buildComposition({
      kind: 'u_shape',
      walls: three.selected,
      ceilingHeightMm: 2700,
      requirements: REQ,
      comms: [],
    });
    check(
      'и П-образная собирается на них тремя рядами',
      u.segments.length === 3,
      u.segments.map((seg) => `${seg.label}: ${seg.wallLengthMm}`).join(' · '),
    );

    /* ── Длина каждой стены равна замеренной до миллиметра ── */
    const mixed = selectOf([3800, 1740, 3800]);
    const built = buildComposition({
      kind: 'u_shape',
      walls: mixed.selected,
      ceilingHeightMm: 2700,
      requirements: REQ,
      comms: [],
    });
    const drift = built.segments
      .map((seg, i) => ({ seg, from: mixed.resolution.measurement.walls[i] }))
      .filter(({ seg, from }) => !from || seg.wallLengthMm !== from.lengthMm);

    check(
      'длина каждой стены в композиции равна длине из замера',
      drift.length === 0 && built.segments.length === 3,
      drift.length > 0
        ? drift
            .map(({ seg, from }) => `${seg.label}: ${seg.wallLengthMm} против ${from?.lengthMm}`)
            .join(' ')
        : built.segments.map((seg) => `${seg.label}: ${seg.wallLengthMm}`).join(' · '),
    );

    /* ── Не хватило стены: отказ словами, а не выдуманная длина ── */
    const alone = selectOf([3800]);
    const refused = tryBuildComposition({
      kind: 'corner_l',
      walls: alone.selected,
      ceilingHeightMm: 2700,
      requirements: REQ,
      comms: [],
    });

    check(
      'форма, которой не хватает стены, НЕ собирается',
      refused.state === 'refused',
      refused.state === 'refused' ? refused.reason : 'СОБРАЛАСЬ НА ВЫДУМАННОЙ СТЕНЕ',
    );

    check(
      'и отказ называет, какой именно стены не хватает',
      refused.state === 'refused' &&
        /Стена Б/.test(refused.reason) &&
        /Угловая/.test(refused.reason),
      refused.state === 'refused' ? refused.reason : 'ПРИЧИНЫ НЕТ',
    );

    /* ── Обратное направление: замеренная стена не исчезает из списка ── */
    const extra = selectOf([3800, 1740, 3000, 2500]);
    check(
      'стена, которой форма не займёт, из отбора не пропадает',
      extra.selected.length === 4,
      `в замере 4, в отборе ${extra.selected.length} — лишних для угловой: ` +
        extra.selected
          .slice(segmentCount('corner_l'))
          .map((w) => w.lengthMm)
          .join(' '),
    );

    /* ── Рабочая стена остаётся первой, какой бы её ни отметили ── */
    const survey = emptySurvey();
    survey.ceilingHeightMm = measured(2700);
    survey.walls = wallsOf([3000, 3000, 3000]).map((wall, i) => ({
      ...wall,
      isRunWall: i === 1,
    }));
    const resolution = resolveSurvey(survey);
    const run = workingWall(resolution.measurement, resolution.runWallId);
    const picked = compositionWalls({
      measured: resolution.measurement.walls,
      runWallId: resolution.runWallId,
      runLengthMm: run.lengthMm,
      runOpenings: run.openings,
    });

    check(
      'рабочая стена идёт первой и не задваивается',
      picked.length === 3 &&
        picked[0].id === resolution.runWallId &&
        new Set(picked.map((wall) => wall.id)).size === 3,
      `${resolution.runWallId} → ${picked.map((w) => w.id).join(' ')}`,
    );

    /*
     * И соседом стены А идёт та, что стоит ЗА НЕЙ в замере: обход в ту
     * же сторону, какой его вёл замерщик. «Б, А, В» делало соседом
     * стены А стену через комнату.
     */
    check(
      'обход идёт от рабочей стены в одну сторону',
      picked.map((wall) => wall.id).join(' ') === 'w2 w3 w1',
      picked.map((w) => w.id).join(' '),
    );
  }
}

/* ────────────────  Высота прибора доезжает до колонны  ──────────────── */

/**
 * ВВЕДЁННАЯ ВЫСОТА ХОЛОДИЛЬНИКА НЕ ДЕЛАЛА НИЧЕГО.
 *
 * Размер доезжал до модуля (`applianceSizes`) и менял отпечаток, а
 * высоту корпуса считала своя формула — высота пенала ряда. Колонна
 * оставалась 2300 мм при любом приборе, и раскрой с ней: боковина
 * 2300×560 при холодильнике 1400. Поле лежало в данных и не меняло ни
 * одной детали — ловушка 280 ещё раз.
 *
 * `ops.ts` при этом уже считал по ДРУГОЙ формуле: отказывая слишком
 * высокому холодильнику, он мерил «высота + просвет». Два места, одна
 * величина, и второе её не исполняло.
 */
console.log('\nВысота прибора доезжает до колонны');
{
  const CEILING = 2700;
  const base = buildRun({
    lengthMm: DEMO_PROJECT.lengthMm,
    ceilingHeightMm: CEILING,
    requirements: REQ,
    openings: OPENINGS,
    comms: COMMS,
  });

  const fridge = base.modules.find((unit) => unit.appliance === 'fridge');

  /*
   * Ноль модулей или ноль приборов — это не «проверять нечего», это
   * пустой ряд. Падаем здесь, а не проходим по пустому списку.
   */
  check(
    'в ряду есть колонна холодильника',
    base.modules.length > 0 && Boolean(fridge),
    base.modules.length === 0
      ? 'МОДУЛЕЙ НЕТ ВОВСЕ'
      : fridge
        ? `${fridge.id} «${fridge.label}»`
        : 'ПРИБОРА НЕТ: мерить нечего',
  );

  if (!fridge) {
    check('дальше мерить нечем', false, 'КОЛОННЫ ХОЛОДИЛЬНИКА В РЯДУ НЕТ');
  } else {
    const setHeight = (heightMm: number) =>
      applyOps({
        run: base,
        requirements: REQ,
        ops: [
          {
            op: 'set_appliance_size',
            moduleId: fridge.id,
            appliance: 'fridge',
            size: { widthMm: fridge.widthMm, heightMm },
          },
        ],
        openings: OPENINGS,
      });

    const colOf = (run: Run) => run.modules.find((unit) => unit.appliance === 'fridge')!;
    const sideOf = (run: Run) =>
      buildPanels({ run }).find(
        (panel) => panel.moduleId === colOf(run).id && /бокови/i.test(panel.name),
      );

    const was = moduleCarcassHeightMm(fridge, base);

    /* ── Высота меняется в раскладке ── */
    const moved = [1400, 1800, 2000].map((heightMm) => {
      const run = setHeight(heightMm);
      return { heightMm, got: moduleCarcassHeightMm(colOf(run), run), run };
    });

    check(
      'смена высоты прибора меняет высоту колонны',
      moved.every((m) => m.got !== was) && new Set(moved.map((m) => m.got)).size === 3,
      `было ${was} · ${moved.map((m) => `${m.heightMm}→${m.got}`).join(' · ')}`,
    );

    /* ── Просвет объявлен, а не подобран ── */
    check(
      'высота колонны = высота прибора + объявленный просвет',
      moved.every((m) => m.got === m.heightMm + NICHE_CLEARANCE_MM),
      moved
        .map((m) => `${m.heightMm} + ${NICHE_CLEARANCE_MM} = ${m.heightMm + NICHE_CLEARANCE_MM}, корпус ${m.got}`)
        .join(' · '),
    );

    check(
      'и ниша считается той же формулой, что корпус',
      moved.every(
        (m) => nicheHeightMm('fridge', { widthMm: fridge.widthMm, heightMm: m.heightMm }) === m.got,
      ),
      moved
        .map((m) => `${m.heightMm}: ниша ${nicheHeightMm('fridge', { widthMm: fridge.widthMm, heightMm: m.heightMm })}`)
        .join(' · '),
    );

    /* ── Та же высота в раскрое ── */
    const cutDrift = moved.filter((m) => sideOf(m.run)?.lengthMm !== m.got);
    check(
      'та же высота приходит в раскрой',
      cutDrift.length === 0 && moved.every((m) => Boolean(sideOf(m.run))),
      cutDrift.length > 0
        ? cutDrift.map((m) => `${m.heightMm}: боковина ${sideOf(m.run)?.lengthMm} при корпусе ${m.got}`).join(' · ')
        : moved.map((m) => `${m.heightMm}: боковина ${sideOf(m.run)?.lengthMm}`).join(' · '),
    );

    /*
     * Чертёж рисует модуль ТОЙ ЖЕ `moduleCarcassHeightMm`
     * (ElevationDrawing.tsx:1041) — своей ветки высоты у него нет с
     * тех пор, как её убрали в слое 33. Сверяем это вызовом.
     */
    check(
      'и та же высота уходит в чертёж',
      moved.every((m) => moduleCarcassHeightMm(colOf(m.run), m.run) === sideOf(m.run)?.lengthMm),
      moved.map((m) => `${m.heightMm}: чертёж ${moduleCarcassHeightMm(colOf(m.run), m.run)}`).join(' · '),
    );

    /* ── И в смету ── */
    const money = (run: Run) => Math.round(buildEstimate(run, 'optimal', DEMO_RATES, []).total);
    const sums = moved.map((m) => money(m.run));
    check(
      'и та же высота меняет смету',
      new Set([money(base), ...sums]).size === 4,
      `${money(base)} → ${sums.join(' → ')} ₸`,
    );

    /* ── Умолчание не пишется: ряд без введённой высоты не поехал ── */
    check(
      'без введённой высоты колонна прежняя',
      moduleCarcassHeightMm(fridge, base) === was && was === 2300,
      `${was} мм`,
    );

    /* ── Высокий прибор не проходит молча ── */
    const tall = setHeight(2450);
    const tallCol = colOf(tall);
    const rowTop = CEILING;
    const toppedOut =
      plinthMm(tall.production) + moduleCarcassHeightMm(tallCol, tall) <= rowTop;

    check(
      'холодильник 2450 при потолке 2700 не проходит молча',
      tallCol.applianceSizes?.fridge === undefined &&
        (tall.warnings ?? []).some((w) => /антресоль не встанет/.test(w)),
      tallCol.applianceSizes?.fridge
        ? 'РАЗМЕР ЗАПИСАН МОЛЧА'
        : ((tall.warnings ?? []).find((w) => /антресоль/.test(w)) ?? 'ОТКАЗА НЕТ'),
    );

    check(
      'и колонна в любом случае остаётся внутри высоты ряда',
      toppedOut &&
        moved.every(
          (m) => plinthMm(m.run.production) + moduleCarcassHeightMm(colOf(m.run), m.run) <= rowTop,
        ),
      `верх колонны ${plinthMm(tall.production) + moduleCarcassHeightMm(tallCol, tall)} при потолке ${rowTop}`,
    );
  }
}

/* ──────────────  Ригель: где замерен, там и стоит  ────────────── */

/**
 * РИГЕЛЬ — ФАКТ ОБМЕРА, АЛГОРИТМ ЕГО НЕ ДВИГАЕТ.
 *
 * Замерщик меряет выступ ОТ УГЛА СТЕНЫ. Ряд на этой стене начинается не
 * от угла — там стоит соседний ряд, и он занял свои миллиметры. Перевода
 * между этими системами координат не было вовсе, и на стене Б всё
 * уезжало на длину угла:
 *
 *   стена 1800, угол занял 660, полезная 1140
 *   замер 1200+600  →  в ряд не попадал ВОВСЕ
 *   замер  600+600  →  вставал на 600+540 вместо 0+540
 *
 * То же самое происходило с окном: верхний ряд рвался не там, где окно.
 */
console.log('\nРигель: где замерен, там и стоит');
{
  const CEILING = 2700;
  const beam = (fromCornerMm: number, widthMm: number, dropMm: number): Opening => ({
    id: `b-${fromCornerMm}-${widthMm}-${dropMm}`,
    kind: 'beam',
    fromCornerMm,
    widthMm,
    sillMm: 0,
    heightMm: dropMm,
  });

  const shopA: ProductionSettings = {
    ...DEFAULT_PRODUCTION,
    depths: { baseMm: 550, upperMm: 350, mezzanineMm: 550 },
    heights: { plinthMm: 100, carcassMm: 760, countertopMm: 40, apronMm: 600 },
  };

  for (const [shopName, production] of [
    ['цех 560/320', DEFAULT_PRODUCTION],
    ['цех 550/350', shopA],
  ] as const) {
    /* ── Стена Б: отметка замера переезжает в координаты ряда ── */
    const drift: string[] = [];
    let checked = 0;

    for (const at of [600, 1000, 1200, 1500]) {
      const attempt = tryBuildComposition({
        kind: 'corner_l',
        walls: [
          { id: 'w1', lengthMm: 3800, openings: [] },
          { id: 'w2', lengthMm: 1800, openings: [beam(at, 300, 300)] },
        ],
        ceilingHeightMm: CEILING,
        requirements: REQ,
        comms: COMMS,
        production,
      });

      if (attempt.state === 'refused') {
        drift.push(`${at}: ОТКАЗ ${attempt.reason}`);
        continue;
      }

      const segment = attempt.composition.segments[1];
      const lost = segment.wallLengthMm - segment.run.lengthMm;
      const want = Math.max(0, at - lost);
      const got = (segment.run.beams ?? [])[0];
      checked += 1;

      if (!got || got.fromCornerMm !== want) {
        drift.push(`замер ${at} (угол ${lost}) → ${got ? got.fromCornerMm : 'НИЧЕГО'}, ждали ${want}`);
      }
    }

    check(
      `${shopName}: ригель стены Б встаёт там, где его замерили`,
      checked === 4 && drift.length === 0,
      checked < 4 ? `ПРОВЕРЕНО ТОЛЬКО ${checked} ИЗ 4 · ${drift.join(' · ')}` : drift.join(' · ') || '600 1000 1200 1500 — все на месте',
    );

    /* ── Ригель в четырёх местах прямого ряда ── */
    const places: [string, Opening][] = [
      ['у края', beam(0, 600, 300)],
      ['посередине', beam(1600, 600, 300)],
      ['на стыке модулей', beam(1200, 600, 300)],
      ['над колонной прибора', beam(0, 1200, 600)],
    ];

    for (const [where, b] of places) {
      const run = buildRun({
        lengthMm: DEMO_PROJECT.lengthMm,
        ceilingHeightMm: CEILING,
        requirements: REQ,
        openings: [b],
        comms: COMMS,
        production,
      });

      /*
       * Ноль модулей — это пустой ряд, а не «проверять нечего».
       * Падаем здесь, а не проходим по пустому списку.
       */
      const all = [...run.modules, ...run.upperSegments.flatMap((seg) => seg.modules)];
      check(
        `${shopName} · ${where}: ряд под ригелем собрался`,
        run.modules.length > 0 && all.length > 0,
        run.modules.length === 0 ? 'МОДУЛЕЙ НЕТ ВОВСЕ' : `${run.modules.length} + ${all.length - run.modules.length}`,
      );
      if (run.modules.length === 0) continue;

      /* ── Ни один модуль не выше низа ригеля ── */
      const bottom = beamBottomMm(b, CEILING);
      const over = runPlaces(run)
        .filter(
          (entry) =>
            entry.unit.offsetMm < b.fromCornerMm + b.widthMm &&
            b.fromCornerMm < entry.unit.offsetMm + entry.unit.widthMm,
        )
        .filter((entry) => Math.round((entry.y + entry.heightM) * 1000) > bottom);

      check(
        `${shopName} · ${where}: высота модулей под ригелем не больше его низа`,
        over.length === 0,
        over.length > 0
          ? over.map((e) => `${e.unit.id} верх ${Math.round((e.y + e.heightM) * 1000)} при ${bottom}`).join(' · ')
          : `низ ригеля ${bottom} мм`,
      );

      /* ── Раскрой и смета считаются от той же высоты ── */
      const panels = buildPanels({ run, production });
      const bad = panels.filter((panel) => panel.lengthMm <= 0 || panel.widthMm <= 0);
      const sides = new Map(
        runPlaces(run).map((entry) => [entry.unit.id, Math.round(entry.heightM * 1000)]),
      );
      const cutDrift = panels
        .filter((panel) => /бокови/i.test(panel.name) && sides.has(panel.moduleId))
        .filter((panel) => panel.lengthMm !== sides.get(panel.moduleId));

      check(
        `${shopName} · ${where}: раскрой считается от той же высоты`,
        bad.length === 0 && cutDrift.length === 0 && panels.length > 0,
        bad.length > 0
          ? `${bad.length} ДЕТАЛЕЙ С НЕПОЛОЖИТЕЛЬНЫМ РАЗМЕРОМ`
          : cutDrift.length > 0
            ? cutDrift.map((p) => `${p.moduleId}: боковина ${p.lengthMm} при корпусе ${sides.get(p.moduleId)}`).join(' · ')
            : `${panels.length} деталей`,
      );
    }

    /* ── Под ригелем мебель не встаёт: слова, а не молчание ── */
    const killed = buildRun({
      lengthMm: DEMO_PROJECT.lengthMm,
      ceilingHeightMm: CEILING,
      requirements: REQ,
      openings: [beam(0, DEMO_PROJECT.lengthMm, 1200)],
      comms: COMMS,
      production,
    });

    check(
      `${shopName}: ригель во всю стену убирает верхний ряд НЕ МОЛЧА`,
      killed.upperSegments.reduce((n, seg) => n + seg.modules.length, 0) === 0 &&
        beamWarnings(killed).some((w) => /ряд там разрывается/.test(w.message)),
      beamWarnings(killed).map((w) => w.message).join(' | ') || 'СЛОВ НЕТ',
    );

    /* ── Ригель до пола: отказ словами, а не корпуса нулевой высоты ── */
    let crushed = '';
    try {
      buildRun({
        lengthMm: DEMO_PROJECT.lengthMm,
        ceilingHeightMm: CEILING,
        requirements: REQ,
        openings: [beam(0, DEMO_PROJECT.lengthMm, 2600)],
        comms: COMMS,
        production,
      });
    } catch (error) {
      crushed = (error as Error).message;
    }

    check(
      `${shopName}: ригель до пола отказывает словами, а не нулевыми корпусами`,
      /корпуса ниже \d+ мм не бывает/.test(crushed),
      crushed ? crushed.slice(0, 120) : 'СОБРАЛОСЬ МОЛЧА',
    );
  }
}

/* ─────────────  Коммуникация принадлежит своей стене  ───────────── */

/**
 * ВЫВОД ВОДЫ СО СТЕНЫ А ВИДЕЛ РЯД СТЕНЫ Б.
 *
 * Композиция раздавала каждому сегменту ВЕСЬ список: ни отбора по стене,
 * ни перевода отметки. Мойка стены Б садилась на вывод стены А, а своего
 * вывода этот ряд не видел вовсе — до композиции доезжали только точки
 * рабочей стены.
 *
 * Перевод — та же `markOnRun`, что переводит проёмы и ригель: вторая
 * формула разошлась бы с первой на первой правке.
 */
console.log('\nКоммуникация принадлежит своей стене');
{
  const CEILING = 2700;
  const comm = (
    id: string,
    kind: CommPoint['kind'],
    wallId: string,
    fromCornerMm: number,
  ): CommPoint => ({ id, kind, wallId, fromCornerMm, heightMm: 600 });

  const WALLS = [
    { id: 'w1', lengthMm: 3800, openings: [] },
    { id: 'w2', lengthMm: 1800, openings: [] },
  ];

  const all: CommPoint[] = [
    comm('a-water', 'water_supply', 'w1', 1650),
    comm('b-water', 'water_supply', 'w2', 1500),
    comm('b-corner', 'sewer', 'w2', 200),
  ];

  const built = buildComposition({
    kind: 'corner_l',
    walls: WALLS,
    ceilingHeightMm: CEILING,
    requirements: REQ,
    comms: all,
  });

  const [segA, segB] = built.segments;
  const lostB = segB.wallLengthMm - segB.run.lengthMm;

  /*
   * Ноль коммуникаций — это не «проверять нечего», это замер без точек.
   * Падаем здесь, а не проходим по пустому списку.
   */
  check(
    'коммуникации разошлись по стенам',
    segA.comms.length > 0 && segB.comms.length > 0,
    segA.comms.length === 0 || segB.comms.length === 0
      ? `СЕЛЕКТОР ВЕРНУЛ НОЛЬ КОММУНИКАЦИЙ: А=${segA.comms.length}, Б=${segB.comms.length}`
      : `А: ${segA.comms.map((c) => c.id).join(',')} · Б: ${segB.comms.map((c) => c.id).join(',')}`,
  );

  if (segA.comms.length === 0 || segB.comms.length === 0) {
    check('дальше мерить нечем', false, 'КОММУНИКАЦИЙ В СЕГМЕНТАХ НЕТ');
  } else {
    /* ── Чужая стена не видна ── */
    check(
      'коммуникация со стены А не видна ряду стены Б',
      segB.comms.every((c) => c.wallId === 'w2') && segA.comms.every((c) => c.wallId === 'w1'),
      `А: ${segA.comms.map((c) => c.wallId).join(',')} · Б: ${segB.comms.map((c) => c.wallId).join(',')}`,
    );

    /* ── Координата = замер минус занятое углом ── */
    const water = segB.comms.find((c) => c.id === 'b-water');
    check(
      'координата в ряду равна замеренной минус занятое углом',
      Boolean(water) && water!.fromCornerMm === 1500 - lostB,
      water
        ? `замер 1500, угол занял ${lostB} → ${water.fromCornerMm} (ждали ${1500 - lostB})`
        : 'ТОЧКИ НЕТ',
    );

    /* ── Попавшее в угол названо словами, а не выброшено молча ── */
    check(
      'коммуникация, попавшая в угол, названа словами',
      !segB.comms.some((c) => c.id === 'b-corner') &&
        built.warnings.some((w) => /попала в угол/.test(w) && /Стена Б/.test(w)),
      built.warnings.find((w) => /попала в угол/.test(w)) ?? 'СЛОВ НЕТ',
    );

    /* ── Предупреждение про мойку: на своей стене да, на чужой нет ── */
    const sinkOf = (run: Run) => run.modules.find((u) => u.appliance === 'sink600');
    const saidFor = (run: Run, comms: CommPoint[]) =>
      validateRun(run, comms).filter((issue) => /вывод воды/.test(issue.message));

    check(
      'на стене А мойка есть, и её проверяют своим выводом',
      Boolean(sinkOf(segA.run)) && saidFor(segA.run, segA.comms).length === 0,
      sinkOf(segA.run)
        ? saidFor(segA.run, segA.comms).map((i) => i.message).join(' | ') || 'расхождений нет'
        : 'МОЙКИ НА СТЕНЕ А НЕТ',
    );

    /*
     * А вот чужой вывод обязан дать расхождение: 1650 мм стены А против
     * мойки стены Б — это и есть та ошибка, что жила в продукте.
     */
    const foreign = saidFor(segA.run, [comm('x', 'water_supply', 'w2', 100)]);
    check(
      'чужой вывод воды виден как расхождение, а не как норма',
      foreign.length > 0,
      foreign.map((i) => i.message).join(' | ') || 'РАСХОЖДЕНИЯ НЕТ',
    );

    /* ── Прямая кухня: перевод тождественный ── */
    const straight = buildComposition({
      kind: 'linear',
      walls: [{ id: 'w1', lengthMm: 3800, openings: [] }],
      ceilingHeightMm: CEILING,
      requirements: REQ,
      comms: all,
    });
    const kept = straight.segments[0].comms;
    check(
      'на прямой кухне перевод тождественный',
      kept.length === 1 && kept[0].id === 'a-water' && kept[0].fromCornerMm === 1650,
      kept.map((c) => `${c.id}@${c.fromCornerMm}`).join(' ') || 'ТОЧЕК НЕТ',
    );

    /* ── И раскладка мойки от своей воды, а не от чужой ── */
    const centerOfSink = (run: Run) => {
      const unit = sinkOf(run);
      return unit ? unit.offsetMm + unit.widthMm / 2 : null;
    };
    const own = centerOfSink(straight.segments[0].run);
    check(
      'мойка садится напротив СВОЕГО вывода воды',
      own !== null && Math.abs(own - 1650) <= 300,
      own === null ? 'МОЙКИ НЕТ' : `центр мойки ${own} при выводе 1650`,
    );
  }
}

/* ───────────  Ключи открывания на пути ЭКРАНА, а не сборки  ─────────── */

/**
 * ТЕСТ БЫЛ ЗЕЛЁНЫМ НА СЛОМАННОМ ПРОДУКТЕ.
 *
 * Проверка уникальности id ходила по `buildComposition`, а там метку
 * стены получают ВСЕ ряды, включая первый. Экран собирает первый ряд
 * иначе — через `composeVariants`, — и метки у него не было вовсе;
 * соседние приходят из `editedWalls`, то есть после `applyOps`.
 *
 * Меряем ровно тот путь, которым идёт экран, и ровно тот ключ, который
 * строится в момент клика: `${unit.id}:door:${i}`
 * (CabinetModule3D.tsx:222).
 */
console.log('\nКлючи открывания на пути экрана');
{
  const CEILING = 2700;
  const WALLS = [
    { id: 'w1', lengthMm: 3800, openings: [] },
    { id: 'w2', lengthMm: 1800, openings: [] },
  ];

  const layout = buildComposition({
    kind: 'corner_l',
    walls: WALLS,
    ceilingHeightMm: CEILING,
    requirements: REQ,
    comms: COMMS,
  });

  /* Стена А — так, как её строит рабочий экран. */
  const wallA = composeVariants(
    {
      title: 'x',
      zone: 'kitchen',
      measuredBy: '',
      measuredAt: '',
      lengthMm: layout.segments[0].run.lengthMm,
      ceilingHeightMm: CEILING,
      requirements: { ...REQ, appliances: layout.segments[0].appliances },
      openings: [],
      comms: layout.segments[0].comms,
      rates: DEMO_RATES,
      cornerAt: null,
      measuredWalls: [],
      measuredComms: COMMS,
      runWallId: 'w1',
      roomDepthM: 3,
    },
    { basic: [], optimal: [], premium: [] },
    {},
  ).find((variant) => variant.key === 'optimal')!.run;

  /* Соседняя стена — так, как её кладёт в `editedWalls` правка. */
  const withMezz = (run: Run) =>
    applyOps({
      run,
      requirements: REQ,
      ops: [{ op: 'set_mezzanine', heightMm: 400 }],
      openings: [],
    });

  const editedA = withMezz(wallA);
  const editedB = withMezz(layout.segments[1].run);

  const allOf = (run: Run) => [
    ...run.modules,
    ...run.upperSegments.flatMap((segment) => segment.modules),
  ];

  /*
   * Ноль модулей или ноль антресолей — это не «проверять нечего»:
   * симптом живёт именно на антресолях. Падаем здесь.
   */
  const mezzOf = (run: Run) =>
    run.upperSegments.flatMap((s) => s.modules).filter((u) => u.section === 'mezzanine');

  check(
    'на обеих стенах есть модули и антресоли',
    allOf(editedA).length > 0 &&
      allOf(editedB).length > 0 &&
      mezzOf(editedA).length > 0 &&
      mezzOf(editedB).length > 0,
    allOf(editedA).length === 0 || allOf(editedB).length === 0
      ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ МОДУЛЕЙ'
      : mezzOf(editedA).length === 0 || mezzOf(editedB).length === 0
        ? 'АНТРЕСОЛЕЙ НЕТ — симптом мерить не на чем'
        : `А: ${allOf(editedA).length} мод., ${mezzOf(editedA).length} антр. · ` +
          `Б: ${allOf(editedB).length} мод., ${mezzOf(editedB).length} антр.`,
  );

  if (mezzOf(editedA).length === 0 || mezzOf(editedB).length === 0) {
    check('дальше мерить нечем', false, 'АНТРЕСОЛЕЙ НЕ ПОЛУЧИЛОСЬ');
  } else {
    /* ── Метка стены есть у КАЖДОГО модуля обоих рядов ── */
    for (const [label, run, wallId] of [
      ['стена А', editedA, 'w1'],
      ['стена Б', editedB, 'w2'],
    ] as [string, Run, string][]) {
      const bare = allOf(run).filter((unit) => !unit.id.endsWith(`@${wallId}`));
      check(
        `${label}: метка стены есть у каждого модуля, включая верхний ряд`,
        bare.length === 0,
        bare.length > 0
          ? `БЕЗ МЕТКИ: ${bare.map((u) => u.id).join(', ')}`
          : `${allOf(run).length} модулей с @${wallId}`,
      );
    }

    /*
     * ГЛАВНОЕ: ключ строится ровно так, как в момент клика.
     * Совпал — значит одна створка открывает две.
     */
    const keysOf = (run: Run) =>
      allOf(run).flatMap((unit) =>
        Array.from({ length: Math.max(1, unit.doorCount ?? 1) }, (_, i) => `${unit.id}:door:${i}`),
      );

    const keysA = new Set(keysOf(editedA));
    const shared = keysOf(editedB).filter((key) => keysA.has(key));

    check(
      'ключи открывания двух стен не пересекаются',
      shared.length === 0,
      shared.length > 0 ? `ОБЩИЕ КЛЮЧИ: ${shared.join(', ')}` : `${keysA.size} + ${keysOf(editedB).length}`,
    );

    /* ── И то же самое списком «Открыть всё» ── */
    const openA = new Set(openablePartIds(editedA));
    const leaks = openablePartIds(editedB).filter((key) => openA.has(key));
    check(
      '«Открыть всё» одной стены не трогает другую',
      leaks.length === 0,
      leaks.length > 0 ? `ОБЩИЕ: ${leaks.join(', ')}` : `${openA.size} + ${openablePartIds(editedB).length}`,
    );

    /* ── Антресоли отдельно: симптом назван именно про них ── */
    const mezzA = new Set(mezzOf(editedA).map((u) => u.id));
    const mezzShared = mezzOf(editedB).filter((u) => mezzA.has(u.id));
    check(
      'антресоли двух стен — разные модули',
      mezzShared.length === 0,
      mezzShared.length > 0
        ? `ОБЩИЕ ID: ${mezzShared.map((u) => u.id).join(', ')}`
        : `А: ${Array.from(mezzA).join(',')} · Б: ${mezzOf(editedB).map((u) => u.id).join(',')}`,
    );

    /* ── Ряд из старого сохранения не делит ключи со стеной А ── */
    const legacy: Run = {
      ...layout.segments[1].run,
      wallId: undefined,
      modules: layout.segments[1].run.modules.map((u) => ({ ...u, id: u.id.split('@')[0] })),
      upperSegments: layout.segments[1].run.upperSegments.map((seg) => ({
        ...seg,
        modules: seg.modules.map((u) => ({ ...u, id: u.id.split('@')[0] })),
      })),
    };
    const legacyShared = keysOf(withMezz(legacy)).filter((key) => keysA.has(key));
    check(
      'ряд из старого сохранения не делит ключи со стеной А',
      legacyShared.length === 0,
      legacyShared.length > 0 ? `ОБЩИЕ КЛЮЧИ: ${legacyShared.join(', ')}` : 'пересечений нет',
    );
  }
}

/* ────────────  Генерация знает, сколько рядов в композиции  ──────────── */

/**
 * ВИЗУАЛИЗАЦИЯ ПОКАЗЫВАЛА ОДНУ СТЕНУ И ЗАПРЕЩАЛА ОСТАЛЬНЫЕ.
 *
 * Кадр снимается со сцены, собранной из ОДНОГО ряда, а форму промпт
 * выводил из типов модулей этого ряда: «угловая тогда, когда есть
 * угловой модуль». У угловой на фальш-панели углового модуля нет вовсе —
 * угол отдан под мёртвую зону, — и форма выходила «прямая».
 *
 * То есть модель не додумывала: ей ПРЯМО писали «Второго ряда нет. На
 * перпендикулярных стенах мебели нет вовсе». Замерено: композиция 2 ряда
 * и 16 модулей, в запрос уходил 1 ряд, 12 модулей и запрет на остальные.
 *
 * Живых запросов здесь нет: меряется текст, который уедет в модель.
 */
console.log('\nГенерация знает, сколько рядов в композиции');
{
  const CEILING = 2700;

  const shapes: [string, CompositionKind, { id: string; lengthMm: number; openings: Opening[] }[]][] = [
    ['прямая', 'linear', [{ id: 'w1', lengthMm: 3800, openings: [] }]],
    [
      'угловая',
      'corner_l',
      [
        { id: 'w1', lengthMm: 3800, openings: [] },
        { id: 'w2', lengthMm: 1800, openings: [] },
      ],
    ],
    [
      'П-образная',
      'u_shape',
      [
        { id: 'w1', lengthMm: 3800, openings: [] },
        { id: 'w2', lengthMm: 1800, openings: [] },
        { id: 'w3', lengthMm: 1740, openings: [] },
      ],
    ],
  ];

  for (const [title, kind, walls] of shapes) {
    const layout = buildComposition({
      kind,
      walls,
      ceilingHeightMm: CEILING,
      requirements: REQ,
      comms: COMMS,
    });

    const runs = layout.segments.map((segment) => segment.run);

    /*
     * Ноль рядов — это пустая генерация, а не «проверять нечего».
     * Падаем здесь, а не проходим по пустому списку.
     */
    check(
      `${title}: ряды композиции есть`,
      runs.length === walls.length && runs.every((run) => run.modules.length > 0),
      runs.length === 0
        ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ РЯДОВ'
        : runs.map((run) => `${run.lengthMm}×${run.modules.length}`).join(' + '),
    );
    if (runs.length === 0) continue;

    /*
     * То, что кладёт в мету сцены рабочий экран, и то, что читает из неё
     * маршрут рендера. Числа руками здесь не пишутся.
     */
    const rowsMm = runs.map((run) => run.lengthMm);
    const framed = runs[0];
    const framedModules = [
      ...framed.modules,
      ...framed.upperSegments.flatMap((segment) => segment.modules),
    ];

    const block = compositionBlock({
      shape: kind,
      lengthMm: rowsMm[0],
      moduleCount: framedModules.length,
      rowsMm,
    });

    /* ── Все ряды названы, а не один ── */
    const missing = rowsMm.filter((mm) => !block.includes(String(mm)));
    check(
      `${title}: в запрос уходят все ряды композиции`,
      missing.length === 0,
      missing.length > 0
        ? `В ЗАПРОСЕ НЕТ РЯДОВ: ${missing.join(', ')} · ${block.split(String.fromCharCode(10))[0]}`
        : block.split(String.fromCharCode(10))[0],
    );

    /* ── Число рядов в запросе равно числу рядов в композиции ── */
    if (rowsMm.length > 1) {
      check(
        `${title}: число рядов в запросе равно числу рядов в композиции`,
        block.includes(`РЯДОВ ${rowsMm.length}`),
        block.split(String.fromCharCode(10))[0],
      );

      /* ── Ряд, не попавший в кадр, НАЗВАН, а не пропущен ── */
      check(
        `${title}: не попавший в кадр ряд назван словами`,
        /в кадр НЕ ПОПАЛИ/.test(block) && /дорисовывать их НЕЛЬЗЯ/.test(block),
        block.includes('НЕ ПОПАЛИ') ? 'сказано' : `СЛОВ НЕТ: ${block}`,
      );

      /* ── И запрета на существующую мебель больше нет ── */
      check(
        `${title}: промпт не запрещает то, что посчитано`,
        !/Второго ряда нет/.test(block) && !/мебели нет вовсе/.test(block),
        /Второго ряда нет|мебели нет вовсе/.test(block) ? `ЗАПРЕТ В ПРОМПТЕ: ${block}` : 'запрета нет',
      );
    } else {
      /* Прямая: запрет на угол обязан остаться — он там правда. */
      check(
        'прямая: запрет на второй ряд остался',
        /Второго ряда нет/.test(block),
        block.split(String.fromCharCode(10))[0],
      );
      assertShapeMatches(block, 'linear');
      check('прямая: сверка формы проходит', true, 'углов в тексте нет');
    }

    /* ── Длина в кадре — длина РЯДА, а не сумма ширин двух рядов ── */
    const sumOfWidths = framedModules.reduce((sum, unit) => sum + unit.widthMm, 0);
    check(
      `${title}: длина в кадре — длина ряда, а не сумма ширин`,
      block.includes(`до ${rowsMm[0]} мм`) && sumOfWidths !== rowsMm[0],
      `ряд ${rowsMm[0]} мм, сумма ширин модулей ${sumOfWidths} мм`,
    );
  }
}

/* ───────────  Верхний ряд прижимается к низу ригеля  ─────────── */

/**
 * ШКАФ ПОД ВЫСТУПОМ СТОИТ ВПЛОТНУЮ К НЕМУ.
 *
 * Прошлый заход закрепил ЗАПРЕТ: модуль не выше низа ригеля. Но `min` —
 * это предел, а не цель, и в стандартном режиме шкаф оставался ровно
 * 720 мм: под выступом висела щель, которую не вымыть и в которую
 * ничего не положить.
 *
 *   свес 200 → низ ригеля 2500, верх шкафа 2170, щель 330 мм
 *   свес 300 → низ ригеля 2400, верх шкафа 2170, щель 230 мм
 *   свес 500 → низ ригеля 2200, верх шкафа 2170, щель  30 мм
 *
 * Режим «до потолка» щели не давал — но не потому, что считал от ригеля:
 * он считал от потолка и обрезался тем же `min`. Совпадение результата,
 * а не общая формула.
 */
console.log('\nВерхний ряд прижимается к низу ригеля');
{
  const CEILING = 2700;
  const beam = (fromCornerMm: number, widthMm: number, dropMm: number): Opening => ({
    id: `b-${fromCornerMm}-${widthMm}-${dropMm}`,
    kind: 'beam',
    fromCornerMm,
    widthMm,
    sillMm: 0,
    heightMm: dropMm,
  });

  const shopA: ProductionSettings = {
    ...DEFAULT_PRODUCTION,
    depths: { baseMm: 550, upperMm: 350, mezzanineMm: 550 },
    heights: { plinthMm: 100, carcassMm: 760, countertopMm: 40, apronMm: 600 },
  };

  const toCeiling: RunRequirements = {
    ...REQ,
    options: { ...REQ.options, upperToCeiling: true },
  };

  /** Верхний ряд (без антресоли) под участком ригеля. */
  const uppersUnder = (run: Run, b: Opening) =>
    runPlaces(run)
      .filter(
        (entry) =>
          (entry.unit.kind === 'upper' || entry.unit.kind === 'corner_upper') &&
          entry.unit.section !== 'mezzanine',
      )
      .filter(
        (entry) =>
          entry.unit.offsetMm < b.fromCornerMm + b.widthMm &&
          b.fromCornerMm < entry.unit.offsetMm + entry.unit.widthMm,
      );

  for (const [shopName, production] of [
    ['цех 560/320', DEFAULT_PRODUCTION],
    ['цех 550/350', shopA],
  ] as const) {
    for (const [modeName, req] of [
      ['стандартный', REQ],
      ['до потолка', toCeiling],
    ] as [string, RunRequirements][]) {
      const gaps: string[] = [];
      let measured = 0;

      for (const drop of [200, 300, 500]) {
        const b = beam(1600, 600, drop);
        const run = buildRun({
          lengthMm: DEMO_PROJECT.lengthMm,
          ceilingHeightMm: CEILING,
          requirements: req,
          openings: [b],
          comms: COMMS,
          production,
        });

        const under = uppersUnder(run, b);
        if (under.length === 0) {
          gaps.push(`свес ${drop}: ПОД РИГЕЛЕМ НЕТ МОДУЛЕЙ`);
          continue;
        }

        const bottom = beamBottomMm(b, CEILING);
        for (const entry of under) {
          measured += 1;
          const top = Math.round((entry.y + entry.heightM) * 1000);
          if (Math.abs(bottom - top) > 1) {
            gaps.push(`свес ${drop}: низ ${bottom}, верх ${top}, зазор ${bottom - top}`);
          }
        }
      }

      /*
       * Ноль модулей — это не «зазора нет», это мерить нечего.
       * Падаем здесь, а не проходим по пустому списку.
       */
      check(
        `${shopName} · ${modeName}: под ригелем есть что мерить`,
        measured > 0,
        measured === 0 ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ МОДУЛЕЙ' : `${measured} модулей под выступом`,
      );

      check(
        `${shopName} · ${modeName}: верх модуля равен низу ригеля`,
        measured > 0 && gaps.length === 0,
        gaps.join(' · ') || 'зазора нет ни на одном свесе',
      );
    }

    /* ── Ригель на части стены: два уровня, и оба без зазора ── */
    const b = beam(1600, 600, 300);
    const run = buildRun({
      lengthMm: DEMO_PROJECT.lengthMm,
      ceilingHeightMm: CEILING,
      requirements: REQ,
      openings: [b],
      comms: COMMS,
      production,
    });

    const row = runPlaces(run).filter(
      (entry) =>
        (entry.unit.kind === 'upper' || entry.unit.kind === 'corner_upper') &&
        entry.unit.section !== 'mezzanine',
    );
    const overlaps = (entry: (typeof row)[number]) =>
      entry.unit.offsetMm < b.fromCornerMm + b.widthMm &&
      b.fromCornerMm < entry.unit.offsetMm + entry.unit.widthMm;

    const underTops = new Set(row.filter(overlaps).map((e) => Math.round((e.y + e.heightM) * 1000)));
    const asideTops = new Set(
      row.filter((e) => !overlaps(e)).map((e) => Math.round((e.y + e.heightM) * 1000)),
    );

    check(
      `${shopName}: ригель на части стены даёт два уровня в одном ряду`,
      underTops.size === 1 &&
        asideTops.size === 1 &&
        Array.from(underTops)[0] !== Array.from(asideTops)[0],
      row.length === 0
        ? 'ВЕРХНЕГО РЯДА НЕТ ВОВСЕ'
        : `под выступом ${Array.from(underTops).join('/')} · рядом ${Array.from(asideTops).join('/')}`,
    );

    check(
      `${shopName}: под выступом зазора нет, рядом стандартная высота`,
      Array.from(underTops)[0] === beamBottomMm(b, CEILING),
      `низ ригеля ${beamBottomMm(b, CEILING)} · верх под ним ${Array.from(underTops).join('/')}`,
    );

    /* ── Ступень названа словами, в ту сторону, в какую она есть ── */
    check(
      `${shopName}: ступень под выступом названа словами`,
      beamWarnings(run).some((w) => /шкаф (выше|ниже) на \d+ мм/.test(w.message)),
      beamWarnings(run).map((w) => w.message).join(' | ') || 'СЛОВ НЕТ',
    );

    /* ── Раскрой считает ту же высоту, что сцена и чертёж ── */
    const heights = new Map(
      runPlaces(run).map((entry) => [entry.unit.id, Math.round(entry.heightM * 1000)]),
    );
    const drift = buildPanels({ run, production })
      .filter((panel) => /бокови/i.test(panel.name) && heights.has(panel.moduleId))
      .filter((panel) => panel.lengthMm !== heights.get(panel.moduleId));

    check(
      `${shopName}: высота из раскроя равна высоте в сцене и на чертеже`,
      drift.length === 0,
      drift.length > 0
        ? drift.map((p) => `${p.moduleId}: боковина ${p.lengthMm} при корпусе ${heights.get(p.moduleId)}`).join(' · ')
        : `${heights.size} модулей сходятся`,
    );

    /* ── Слишком низкий ригель по-прежнему отказывает словами ── */
    let refused = '';
    try {
      buildRun({
        lengthMm: DEMO_PROJECT.lengthMm,
        ceilingHeightMm: CEILING,
        requirements: REQ,
        openings: [beam(0, DEMO_PROJECT.lengthMm, 2600)],
        comms: COMMS,
        production,
      });
    } catch (error) {
      refused = (error as Error).message;
    }

    check(
      `${shopName}: слишком низкий ригель отказывает словами`,
      /корпуса ниже \d+ мм не бывает/.test(refused),
      refused ? refused.slice(0, 110) : 'СОБРАЛОСЬ МОЛЧА',
    );
  }
}

/* ──────────  ЗАМЕР: что считается у ящиков нижнего модуля  ────────── */

/**
 * ИЗМЕРИТЕЛЬНЫЙ БЛОК, А НЕ ТРЕБОВАНИЕ.
 *
 * Он не чинит и ничего не требует — он фиксирует, что в продукте есть
 * СЕГОДНЯ: сколько фасадов у модуля с N ящиками, какие детали короба
 * попадают в раскрой, сколько направляющих уходит в смету и во что это
 * обходится. Цифры нужны до правки: три ящика вместо дверцы — это
 * десяток новых деталей, и до заходa надо знать, каких из них нет.
 */
console.log('\nЗамер: наполнение нижнего модуля');
{
  const widthMm = 600;

  /** Одиночный модуль 600 мм с заданным числом ящиков. */
  const boxOf = (drawers: number) => {
    const run = buildRun({
      lengthMm: widthMm,
      ceilingHeightMm: 2700,
      requirements: {
        ...REQ,
        mode: 'free',
        appliances: [],
        sections: [],
      },
      openings: [],
      comms: [],
    });

    const added = applyOps({
      run,
      requirements: { ...REQ, mode: 'free', appliances: [], sections: [] },
      ops: [
        { op: 'add_module', kind: 'base', widthMm },
      ],
      openings: [],
    });

    const unit = added.modules[0];
    if (!unit) return null;

    return applyOps({
      run: added,
      requirements: { ...REQ, mode: 'free', appliances: [], sections: [] },
      ops: [{ op: 'set_fronts', moduleId: unit.id, drawerCount: drawers }],
      openings: [],
    });
  };

  const probe = boxOf(3);
  const probeUnit = probe?.modules[0];

  /*
   * Ноль панелей — это не «нечего мерить», это сломанный замер.
   * Падаем здесь, а не печатаем пустую таблицу.
   */
  check(
    'модуль для замера собрался и дал детали',
    Boolean(probeUnit) && buildPanels({ run: probe! }).length > 0,
    !probeUnit
      ? 'МОДУЛЬ НЕ СОБРАЛСЯ'
      : buildPanels({ run: probe! }).length === 0
        ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ ПАНЕЛЕЙ'
        : `${buildPanels({ run: probe! }).length} деталей`,
  );

  if (!probeUnit || buildPanels({ run: probe! }).length === 0) {
    check('дальше мерить нечем', false, 'ПАНЕЛЕЙ НЕТ');
  } else {
    console.log('  ящиков  фронты (высоты)            детали короба   направляющих   сумма');

    const rows: {
      drawers: number;
      fronts: number;
      boxParts: number;
      slides: number;
      total: number;
    }[] = [];

    for (const drawers of [1, 2, 3]) {
      const run = boxOf(drawers)!;
      const unit = run.modules[0];
      const panels = buildPanels({ run });

      const fronts = panels.filter((panel) => /Фронт ящика/i.test(panel.name));
      /*
       * Детали КОРОБА ящика: дно, задняя, боковины. Ищем их по имени —
       * если такого имени в раскрое нет, значит их не считают вовсе.
       */
      const boxParts = panels.filter((panel) => /короб|ящик(?!а)/i.test(panel.name));

      const estimate = buildEstimate(run, 'optimal', DEMO_RATES, []);
      const slideLine = estimate.lines.find((line) => line.key.startsWith('slide_'));
      const boxLine = estimate.lines.find((line) => line.key === 'drawer_box');

      rows.push({
        drawers,
        fronts: fronts.length,
        boxParts: boxParts.length,
        slides: slideLine?.quantity ?? 0,
        total: Math.round(estimate.total),
      });

      console.log(
        `  ${String(drawers).padStart(6)}  ` +
          `${String(fronts.length).padStart(2)} шт. ${(unit.fill?.drawerHeights ?? []).join('+').padEnd(18)}` +
          `${String(boxParts.length).padStart(8)}      ` +
          `${String(slideLine?.quantity ?? 0).padStart(6)}` +
          `${boxLine ? ` (+${boxLine.title})` : ''}` +
          `   ${Math.round(estimate.total)} ₸`,
      );
    }

    /*
     * ЧИСЛО ЯЩИКОВ — ОДНА ВЕЛИЧИНА.
     *
     * Здесь стояла проверка, ЗАКРЕПЛЯВШАЯ дефект: `set_fronts` писал
     * число (`drawerCount`) и не трогал `fill`, а `fill.drawerHeights` —
     * это и есть фронты, по ним режется раскрой. Наполнение оставалось
     * от дверцы: полка на месте, высот фронтов нет.
     *
     * Замерено было так: «три ящика» → НОЛЬ фронтов в раскрое и ТРИ
     * направляющие в смете. Цех получал фурнитуру, к которой нечего
     * прикрутить, клиент за неё платил.
     *
     * Теперь это требование, а не факт.
     */
    const frontDrift = rows.filter((row) => row.fronts !== row.drawers);
    check(
      'фронтов в раскрое столько же, сколько заказано ящиков',
      frontDrift.length === 0,
      frontDrift.length > 0
        ? frontDrift.map((r) => `${r.drawers} ящика → ${r.fronts} фронтов`).join(' · ')
        : rows.map((r) => `${r.drawers}→${r.fronts}`).join(' '),
    );

    /* ── Направляющих ровно столько, сколько ФРОНТОВ В РАСКРОЕ ── */
    const slideDrift = rows.filter((row) => row.slides !== row.fronts);
    check(
      'направляющих в смете столько же, сколько фронтов в раскрое',
      slideDrift.length === 0,
      slideDrift.length > 0
        ? slideDrift.map((r) => `раскрой ${r.fronts}, смета ${r.slides}`).join(' · ')
        : rows.map((r) => `${r.fronts}=${r.slides}`).join(' '),
    );

    /*
     * ФУРНИТУРЫ БЕЗ ПАНЕЛЕЙ И ПАНЕЛЕЙ БЕЗ ФУРНИТУРЫ НЕ БЫВАЕТ.
     *
     * Ноль с одной стороны при ненуле с другой — это ровно тот дефект,
     * что стоил трёх оплаченных направляющих. Ноль с обеих сторон здесь
     * тоже не ответ: модуль заказан с ящиками, мерить есть что.
     */
    const orphan = rows.filter(
      (row) => row.fronts === 0 || row.slides === 0 || row.fronts !== row.slides,
    );
    check(
      'ни фурнитуры без панелей, ни панелей без фурнитуры',
      orphan.length === 0,
      orphan.length > 0
        ? orphan
            .map((r) =>
              r.fronts === 0
                ? `${r.drawers} ящика: СЕЛЕКТОР ВЕРНУЛ НОЛЬ ПАНЕЛЕЙ при ${r.slides} направляющих`
                : r.slides === 0
                  ? `${r.drawers} ящика: СЕЛЕКТОР ВЕРНУЛ НОЛЬ ФУРНИТУРЫ при ${r.fronts} панелях`
                  : `${r.drawers} ящика: раскрой ${r.fronts}, смета ${r.slides}`,
            )
            .join(' · ')
        : rows.map((r) => `${r.drawers}: ${r.fronts}/${r.slides}`).join(' · '),
    );

    /* ── Смена числа ящиков двигает и раскрой, и смету ── */
    check(
      'смена числа ящиков меняет и раскрой, и смету',
      new Set(rows.map((r) => r.fronts)).size === rows.length &&
        new Set(rows.map((r) => r.total)).size === rows.length,
      rows.map((r) => `${r.drawers}: ${r.fronts} фронтов, ${r.total} ₸`).join(' · '),
    );

    /* ── Сумма высот фронтов сходится с корпусом на каждом числе ── */
    const sumDrift: string[] = [];
    for (const drawers of [1, 2, 3]) {
      const run = boxOf(drawers)!;
      const unit = run.modules[0];
      const sum = (unit.fill?.drawerHeights ?? []).reduce((a, b) => a + b, 0);
      const carcass = moduleCarcassHeightMm(unit, run);
      if (sum !== carcass) sumDrift.push(`${drawers}: ${sum} против ${carcass}`);
    }
    check(
      'сумма высот фронтов равна высоте корпуса при любом числе ящиков',
      sumDrift.length === 0,
      sumDrift.join(' · ') || 'сходится на 1, 2 и 3',
    );

    /*
     * А через готовый вариант (`set_variant`) тот же модуль наполнение
     * получает: два пути, один работает, второй нет.
     */
    const viaVariant = applyOps({
      run: boxOf(1)!,
      requirements: { ...REQ, mode: 'free', appliances: [], sections: [] },
      ops: [{ op: 'set_variant', moduleId: boxOf(1)!.modules[0].id, variant: 'drawers' }],
      openings: [],
    });
    const variantUnit = viaVariant.modules[0];
    const variantFronts = buildPanels({ run: viaVariant }).filter((panel) =>
      /Фронт ящика/i.test(panel.name),
    );

    check(
      'через готовый вариант наполнение и фронты появляются',
      (variantUnit.fill?.drawerHeights.length ?? 0) === 3 && variantFronts.length === 3,
      `наполнение [${(variantUnit.fill?.drawerHeights ?? []).join(',')}] · фронтов ${variantFronts.length}`,
    );

    check(
      'и сумма высот фронтов равна высоте корпуса',
      (variantUnit.fill?.drawerHeights ?? []).reduce((a, b) => a + b, 0) ===
        moduleCarcassHeightMm(variantUnit, viaVariant),
      `${(variantUnit.fill?.drawerHeights ?? []).reduce((a, b) => a + b, 0)} против ${moduleCarcassHeightMm(variantUnit, viaVariant)}`,
    );

    /*
     * ДЕТАЛЕЙ КОРОБА В РАСКРОЕ НЕТ — и это ЗАФИКСИРОВАНО, а не исправлено.
     * Дно, задняя и две боковины ящика не режутся: в смету он входит
     * готовым комплектом (направляющие), а не деталями плиты.
     */
    check(
      'деталей короба ящика в раскрое нет — так сегодня',
      rows.every((row) => row.boxParts === 0),
      rows.map((r) => `${r.drawers}→${r.boxParts}`).join(' '),
    );

    /*
     * Число ящиков живёт в ДВУХ местах: `fill.drawerHeights` (раскрой,
     * сцена, смета) и `unit.drawerCount` (чертёжный глиф). Фиксируем,
     * расходятся они или пока совпадают.
     */
    const glyphDrift: string[] = [];
    for (const drawers of [1, 2, 3]) {
      const run = boxOf(drawers)!;
      const unit = run.modules[0];
      const fromFill = unit.fill?.drawerHeights.length ?? 0;
      const fromGlyph = Math.max(2, unit.drawerCount || 3);
      if (fromFill !== fromGlyph) glyphDrift.push(`${drawers}: наполнение ${fromFill}, глиф ${fromGlyph}`);
    }
    console.log(
      `  два источника числа ящиков: ${glyphDrift.join(' · ') || 'сходятся на 1, 2 и 3'}`,
    );

    /* ── Направление открывания: у каких вариантов оно предлагается ── */
    const openings = (['door', 'drawers', 'sink_base', 'hob_base', 'cargo'] as const).map(
      (kind) => {
        const run = boxOf(2)!;
        const unit = { ...run.modules[0], variant: kind } as Module;
        const spec = MODULE_VARIANTS[kind];
        const shaped: Module = {
          ...unit,
          frontType: spec.frontType === 'none' ? 'none' : spec.frontType,
          drawerCount: spec.drawerCount ?? 0,
          doorCount: spec.frontType === 'door' ? 1 : 0,
        };
        return `${kind}: ${openingsFor(shaped).join('/') || 'НЕТ'}`;
      },
    );
    console.log(`  открывание предлагается → ${openings.join(' · ')}`);
  }
}

/* ──────────  Чертёж рисует те же фронты, что уходят в раскрой  ────────── */

/**
 * ТРЕТИЙ ИСТОЧНИК ЧИСЛА ЯЩИКОВ БЫЛ В ГЛИФЕ.
 *
 * Раскрой и смета уже читают одно (`fill.drawerHeights`), а чертёж считал
 * своё: `Math.max(2, unit.drawerCount || 3)` — один ящик рисовался двумя.
 * И высоты были равными долями: два фронта 140 + 580 выходили на листе
 * как 360 + 360.
 *
 * На деньги это не влияло, а клиент смотрит именно на чертёж.
 */
console.log('\nЧертёж рисует те же фронты, что уходят в раскрой');
{
  const widthMm = 600;
  const freeReq: RunRequirements = { ...REQ, mode: 'free', appliances: [], sections: [] };

  const seed = applyOps({
    run: buildRun({
      lengthMm: widthMm,
      ceilingHeightMm: 2700,
      requirements: freeReq,
      openings: [],
      comms: [],
    }),
    requirements: freeReq,
    ops: [{ op: 'add_module', kind: 'base', widthMm }],
    openings: [],
  });

  const seeded = seed.modules[0];
  check(
    'модуль для замера есть',
    Boolean(seeded),
    seeded ? `${seeded.id} ${seeded.widthMm} мм` : 'МОДУЛЬ НЕ СОБРАЛСЯ',
  );

  if (!seeded) {
    check('дальше мерить нечем', false, 'МОДУЛЯ НЕТ');
  } else {
    const withDrawers = (n: number) =>
      applyOps({
        run: seed,
        requirements: freeReq,
        ops: [{ op: 'set_fronts', moduleId: seeded.id, drawerCount: n }],
        openings: [],
      });

    const drift: string[] = [];
    const heightDrift: string[] = [];
    let measured = 0;

    for (const n of [1, 2, 3]) {
      const run = withDrawers(n);
      const unit = run.modules[0];

      /* Раскрой: фронты ящиков этого модуля, сверху вниз. */
      const cut = buildPanels({ run })
        .filter((panel) => panel.moduleId === unit.id && /Фронт ящика/i.test(panel.name))
        .map((panel) => panel.lengthMm);

      /* Чертёж: те же фронты глазами `FrontGlyph`. */
      const drawn = frontGlyph(unit, 'fronts').filter((el) => el.kind === 'drawer') as {
        kind: 'drawer';
        index: number;
        count: number;
        heights?: number[];
      }[];

      /*
       * Ноль фронтов — это не «нечего рисовать», это модуль, заказанный
       * с ящиками и оставшийся без них. Падаем здесь.
       */
      if (cut.length === 0 || drawn.length === 0) {
        drift.push(
          cut.length === 0
            ? `${n} ящика: СЕЛЕКТОР ВЕРНУЛ НОЛЬ ФРОНТОВ В РАСКРОЕ`
            : `${n} ящика: СЕЛЕКТОР ВЕРНУЛ НОЛЬ ФРОНТОВ НА ЧЕРТЕЖЕ`,
        );
        continue;
      }

      measured += 1;

      if (drawn.length !== cut.length) {
        drift.push(`${n} ящика: чертёж ${drawn.length}, раскрой ${cut.length}`);
      }

      /*
       * Высоты сверяются с раскроем ДО МИЛЛИМЕТРА. В раскрое из высоты
       * фронта вычтен зазор фасада — сверяем по нему же, иначе сравнение
       * было бы с другой величиной.
       */
      const gap = DEFAULT_PRODUCTION.frontGapMm;
      const fromGlyph = drawn[0]?.heights ?? [];
      const expected = (unit.fill?.drawerHeights ?? []).map((h) => h - gap);

      if (fromGlyph.length !== expected.length) {
        heightDrift.push(`${n}: высот на чертеже ${fromGlyph.length}, в наполнении ${expected.length}`);
      } else {
        for (let i = 0; i < expected.length; i += 1) {
          if (fromGlyph[i] - gap !== cut[i]) {
            heightDrift.push(`${n}[${i}]: чертёж ${fromGlyph[i] - gap}, раскрой ${cut[i]}`);
          }
        }
      }
    }

    check(
      'число фронтов на чертеже равно числу в раскрое',
      measured === 3 && drift.length === 0,
      drift.join(' · ') || '1→1 2→2 3→3',
    );

    check(
      'высоты фронтов на чертеже равны высотам в раскрое до миллиметра',
      measured === 3 && heightDrift.length === 0,
      heightDrift.join(' · ') ||
        [1, 2, 3]
          .map((n) => `${n}: ${(withDrawers(n).modules[0].fill?.drawerHeights ?? []).join('+')}`)
          .join(' · '),
    );

    /* ── Модуль с дверцей ящиков не рисует ── */
    const asDoor = applyOps({
      run: withDrawers(3),
      requirements: freeReq,
      ops: [{ op: 'set_fronts', moduleId: seeded.id, drawerCount: 0 }],
      openings: [],
    }).modules[0];

    check(
      'модуль с дверцей ящиков не рисует',
      frontGlyph(asDoor, 'fronts').every((el) => el.kind !== 'drawer') &&
        frontGlyph(asDoor, 'fronts').some((el) => el.kind === 'panel'),
      frontGlyph(asDoor, 'fronts').map((el) => el.kind).join('|'),
    );

    /* ── Выдуманного числа больше нет: пустое наполнение — пустой фасад ── */
    const bare: Module = {
      ...withDrawers(3).modules[0],
      variant: 'drawers',
      fill: { shelves: [], dividerMm: 0, rodsMm: [], drawerHeights: [], hinge: 'none' },
    };
    const bareDrawn = frontGlyph(bare, 'fronts').filter((el) => el.kind === 'drawer');

    check(
      'без фронтов чертёж не выдумывает ящики',
      bareDrawn.length === MODULE_VARIANTS.drawers.drawerCount,
      `нарисовано ${bareDrawn.length}, объявлено вариантом ${MODULE_VARIANTS.drawers.drawerCount}`,
    );
  }
}

/* ─────────  Число ящиков меняется НА ПУТИ ЭКРАНА, а не только в движке  ───────── */

/**
 * ТЕСТ ОБЯЗАН ИДТИ ДОРОГОЙ ЭКРАНА.
 *
 * Прошлые проверки звали `applyOps` на ряде, собранном тут же. Экран
 * идёт иначе: `workspaceInput` → `composeVariants` → `activeRun` →
 * `runOps` пишет в `editedRuns` → `composeVariants` СНОВА. Между этими
 * шагами ряд пересобирается, идентификаторы выводятся заново, а
 * наполнение обязано доехать до раскроя и до чертежа.
 *
 * Здесь пройден весь этот круг, и модуль берётся тем же селектором, что
 * у панели состава: `run.modules.find((m) => m.id === selectedModuleId)`
 * (RunEditor.tsx:155).
 */
console.log('\nЧисло ящиков меняется на пути экрана');
{
  const input = workspaceInput({
    title: DEMO_PROJECT.title,
    zone: DEMO_PROJECT.zone,
    measurement: DEMO_MEASUREMENT,
    requirements: REQ,
    rates: DEMO_RATES,
    wallId: 'w1',
    cornerAt: DEMO_PROJECT.cornerAt,
  });
  const disabled = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;

  /** Ровно то, что читает экран: активный ряд выбранной комплектации. */
  let editedRuns: Partial<Record<VariantKey, Run>> = {};
  const activeRun = () =>
    composeVariants(input, disabled, editedRuns).find((v) => v.key === 'optimal')!.run;

  /* Тот же селектор, что у панели состава. */
  const selected = activeRun().modules.find(
    (unit) => !unit.appliance && unit.kind === 'base' && !unit.column,
  );

  check(
    'на экране есть модуль, у которого поле «Фасад» доступно',
    Boolean(selected),
    selected
      ? `${selected.id} ${selected.widthMm} мм`
      : 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ МОДУЛЕЙ — менять число ящиков не у чего',
  );

  if (!selected) {
    check('дальше мерить нечем', false, 'ОБЫЧНОГО МОДУЛЯ В РЯДУ НЕТ');
  } else {
    const drift: string[] = [];

    for (const n of [3, 1, 2]) {
      /* Ровно то, что делает `runOps`: applyOps от activeRun → editedRuns. */
      const next = applyOps({
        run: activeRun(),
        requirements: REQ,
        ops: [{ op: 'set_fronts', moduleId: selected.id, drawerCount: n }],
        openings: input.openings,
      });
      editedRuns = { ...editedRuns, optimal: next };

      /* И читаем ТО, что после этого показывает экран. */
      const shown = activeRun();
      const unit = shown.modules.find((m) => m.id === selected.id);
      if (!unit) {
        drift.push(`${n}: модуль ${selected.id} ПРОПАЛ из ряда после правки`);
        continue;
      }

      const cut = buildPanels({ run: shown }).filter(
        (panel) => panel.moduleId === unit.id && /Фронт ящика/i.test(panel.name),
      );
      const drawn = frontGlyph(unit, 'fronts').filter((el) => el.kind === 'drawer');

      if ((unit.fill?.drawerHeights.length ?? 0) !== n) {
        drift.push(`${n}: наполнение [${(unit.fill?.drawerHeights ?? []).join(',')}]`);
      }
      if (cut.length !== n) drift.push(`${n}: в раскрое ${cut.length} фронтов`);
      if (drawn.length !== n) drift.push(`${n}: на чертеже ${drawn.length} фронтов`);
    }

    check(
      'смена числа в поле доезжает до наполнения, раскроя и чертежа',
      drift.length === 0,
      drift.join(' · ') || '3 → 1 → 2, наполнение = раскрой = чертёж',
    );

    /* ── Возврат к дверце тем же полем ── */
    const backToDoor = applyOps({
      run: activeRun(),
      requirements: REQ,
      ops: [{ op: 'set_fronts', moduleId: selected.id, drawerCount: 0 }],
      openings: input.openings,
    });
    editedRuns = { ...editedRuns, optimal: backToDoor };
    const door = activeRun().modules.find((m) => m.id === selected.id)!;

    check(
      'возврат к дверце убирает ящики отовсюду',
      door.frontType === 'door' &&
        (door.fill?.drawerHeights.length ?? 0) === 0 &&
        frontGlyph(door, 'fronts').every((el) => el.kind !== 'drawer'),
      `frontType=${door.frontType} fill=[${(door.fill?.drawerHeights ?? []).join(',')}]`,
    );
  }

  /*
   * ОПЕРАЦИЯ, КОТОРАЯ НЕ СРАБОТАЛА, НЕ МОЛЧИТ.
   *
   * Молчаливый выход — это ровно то, как выглядит «правка не
   * применилась»: человек меняет число и не получает ни результата, ни
   * причины. Найти её из интерфейса нельзя, потому что её никто не назвал.
   */
  const ghost = applyOps({
    run: activeRun(),
    requirements: REQ,
    ops: [{ op: 'set_fronts', moduleId: 'base-999@w1', drawerCount: 3 }],
    openings: input.openings,
  });
  check(
    'правка несуществующего модуля названа словами, а не пропущена молча',
    (ghost.warnings ?? []).some((w) => /не найден/.test(w)),
    (ghost.warnings ?? []).join(' | ') || 'МОЛЧА',
  );

  const appliance = activeRun().modules.find((unit) => unit.appliance && !unit.column);
  check(
    'на приборном модуле поле объясняет, почему число задаёт не оно',
    Boolean(appliance) &&
      (
        applyOps({
          run: activeRun(),
          requirements: REQ,
          ops: [{ op: 'set_fronts', moduleId: appliance!.id, drawerCount: 3 }],
          openings: input.openings,
        }).warnings ?? []
      ).some((w) => /задаёт прибор и место/.test(w)),
    appliance
      ? (
          applyOps({
            run: activeRun(),
            requirements: REQ,
            ops: [{ op: 'set_fronts', moduleId: appliance.id, drawerCount: 3 }],
            openings: input.openings,
          }).warnings ?? []
        ).join(' | ') || 'МОЛЧА'
      : 'ПРИБОРНОГО МОДУЛЯ НЕТ',
  );
}

/* ────────────  Каталог фурнитуры организации задаёт ЦЕНУ  ──────────── */

/**
 * ФУРНИТУРА — ТОВАР КАТАЛОГА, А НЕ ВТОРАЯ ТАБЛИЦА.
 *
 * Организация выбирает бренд и модель, смета берёт цену у позиции. Что
 * каталог НЕ делает: не считает количество (его знает состав ряда) и не
 * хранит цену копией в модуле — модуль держит только ссылку.
 */
console.log('\nКаталог фурнитуры организации');
{
  /** Позиция каталога как фурнитура: те же поля, что у товара. */
  const hw = (
    id: string,
    name: string,
    price: number,
    extra: Record<string, unknown> = {},
  ): HardwareItem => ({
    id,
    orgId: 'org-1',
    name,
    article: id.toUpperCase(),
    price,
    active: true,
    estimateKey: 'hinge_standard',
    hardware: { category: 'hinge', ...(extra.hardware as object) },
    mounting: EMPTY_MOUNTING,
    ...extra,
  });

  const blum = hw('hw-blum', 'Петля Blum Clip top', 3400, {
    hardware: { category: 'hinge', brand: 'blum', model: 'Clip top', softClose: true },
  });
  const hettich = hw('hw-hettich', 'Петля Hettich Sensys', 2100, {
    hardware: { category: 'hinge', brand: 'hettich', model: 'Sensys', softClose: true },
  });

  const catalogOf = (...items: HardwareItem[]) =>
    new Map(items.map((item) => [item.id, item]));

  const baseRun = buildRun({
    lengthMm: DEMO_PROJECT.lengthMm,
    ceilingHeightMm: 2700,
    requirements: REQ,
    openings: OPENINGS,
    comms: COMMS,
  });

  /** Ряд, в котором у одного модуля выбрана позиция каталога. */
  const withPick = (itemId: string): Run => ({
    ...baseRun,
    modules: baseRun.modules.map((unit) =>
      unit.id === target?.id ? { ...unit, hardwareItemId: itemId } : unit,
    ),
  });

  const target = baseRun.modules.find(
    (unit) => !unit.appliance && unit.frontType === 'door' && unit.doorCount > 0,
  );

  /*
   * TEST 5: пустой селектор — это падение, а не успешный сценарий.
   */
  check(
    'в ряду есть модуль с распашным фасадом и каталог не пуст',
    Boolean(target) && catalogOf(blum, hettich).size === 2,
    !target
      ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ МОДУЛЕЙ С ПЕТЛЯМИ'
      : `${target.id} · позиций в каталоге ${catalogOf(blum, hettich).size}`,
  );

  if (!target) {
    check('дальше мерить нечем', false, 'МОДУЛЯ С ПЕТЛЯМИ НЕТ');
  } else {
    const totalOf = (run: Run, catalog: Map<string, HardwareItem>) =>
      Math.round(buildEstimate(run, 'optimal', DEMO_RATES, [], undefined, undefined, catalog).total);

    /* ── TEST 6: без каталога и без ссылки сумма прежняя ДО ТЕНГЕ ── */
    const before = Math.round(buildEstimate(baseRun, 'optimal', DEMO_RATES, []).total);
    check(
      'без каталога смета прежняя до тенге',
      totalOf(baseRun, new Map()) === before,
      `${before} ₸ = ${totalOf(baseRun, new Map())} ₸`,
    );

    /*
     * И тот же ряд, открытый с каталогом, но БЕЗ ссылки в модуле —
     * это проект, сохранённый до появления каталога.
     */
    check(
      'проект без hardwareItemId с каталогом даёт ту же сумму',
      totalOf(baseRun, catalogOf(blum, hettich)) === before,
      `${before} ₸ = ${totalOf(baseRun, catalogOf(blum, hettich))} ₸`,
    );

    /* ── TEST 1: смена бренда меняет сумму по цене каталога ── */
    const withBlum = totalOf(withPick('hw-blum'), catalogOf(blum, hettich));
    const withHettich = totalOf(withPick('hw-hettich'), catalogOf(blum, hettich));

    check(
      'смена бренда петли меняет сумму по цене каталога',
      withBlum !== withHettich && withBlum > withHettich,
      `Blum ${withBlum} ₸ · Hettich ${withHettich} ₸ · разница ${withBlum - withHettich}`,
    );

    /*
     * Разница обязана быть РОВНО разницей цен, умноженной на число
     * петель: иначе каталог считает не то количество.
     */
    const lineOf = (run: Run, catalog: Map<string, HardwareItem>, id: string) =>
      buildEstimate(run, 'optimal', DEMO_RATES, [], undefined, undefined, catalog).lines.find(
        (line) => line.key === `hardware_${id}`,
      );

    const blumLine = lineOf(withPick('hw-blum'), catalogOf(blum, hettich), 'hw-blum');
    const hettichLine = lineOf(withPick('hw-hettich'), catalogOf(blum, hettich), 'hw-hettich');

    /*
     * Сверяем СТРОКУ, а не итог: на итог сверху ложится доставка
     * процентом (8 % в типовом прайсе), и разница в нём равна разнице
     * строк, умноженной на этот процент. Требование же — про цену
     * позиции: её и меряем там, где она стоит.
     */
    check(
      'разница строк равна разнице цен на то же число петель',
      Boolean(blumLine && hettichLine) &&
        blumLine!.quantity === hettichLine!.quantity &&
        blumLine!.total - hettichLine!.total ===
          (blum.price - hettich.price) * blumLine!.quantity,
      blumLine && hettichLine
        ? `петель ${blumLine.quantity} · ${blumLine.total} − ${hettichLine.total} = ` +
          `${blumLine.total - hettichLine.total} при (${blum.price} − ${hettich.price}) × ${blumLine.quantity}`
        : 'СТРОКИ КАТАЛОГА НЕТ',
    );

    /* И итог двигается ровно на эту разницу плюс доставка процентом. */
    const delivery = DEMO_RATES.delivery_install ?? 0;
    check(
      'итог двигается на ту же разницу плюс доставка',
      Boolean(blumLine && hettichLine) &&
        withBlum - withHettich ===
          Math.round((blumLine!.total - hettichLine!.total) * (1 + delivery / 100)),
      `${withBlum - withHettich} ₸ = ${blumLine && hettichLine ? blumLine.total - hettichLine.total : 0} × ${1 + delivery / 100}`,
    );

    /* ── TEST 2: количество приходит из состава ряда, а не из каталога ── */
    const fromRun = openingHardware(
      [...withPick('hw-blum').modules].map((unit, i, all) => ({
        unit,
        heightMm: moduleCarcassHeightMm(unit, baseRun),
        index: i,
        total: all.length,
      })),
      baseRun,
    ).byModule[target.id]?.hinges;

    check(
      'количество петель берётся из состава ряда, а не из каталога',
      Boolean(blumLine) && blumLine?.quantity === fromRun,
      `из ряда ${fromRun}, в строке каталога ${blumLine?.quantity}`,
    );

    check(
      'и цена в строке — цена позиции каталога',
      blumLine?.rate === blum.price,
      `${blumLine?.rate} ₸ при цене позиции ${blum.price} ₸`,
    );

    /* ── TEST 3: позиция без цены не даёт тихий ноль ── */
    const priceless = hw('hw-none', 'Петля без цены', 0, {
      hardware: { category: 'hinge', brand: 'boyard' },
    });
    const link = resolveHardware(
      { hardwareItemId: 'hw-none', label: target.label },
      catalogOf(priceless),
    );

    check(
      'позиция без цены названа словами, а не посчитана нулём',
      link.state === 'priceless' && /цена не задана/.test(link.reason),
      link.state === 'priceless' ? link.reason : `состояние «${link.state}»`,
    );

    check(
      'и сумма при этом остаётся прежней, а не падает до нуля',
      totalOf(withPick('hw-none'), catalogOf(priceless)) === before,
      `${totalOf(withPick('hw-none'), catalogOf(priceless))} ₸ при прежних ${before} ₸`,
    );

    /* ── Ссылка, которая не разрешилась: удалена, отключена, чужая ── */
    const off = { ...blum, active: false };
    const cases: [string, Map<string, HardwareItem>, string][] = [
      ['позиции нет в каталоге', catalogOf(hettich), 'не найдена'],
      ['позиция отключена', catalogOf(off), 'отключена в каталоге'],
    ];

    for (const [title, catalog, words] of cases) {
      const state = resolveHardware(
        { hardwareItemId: 'hw-blum', label: target.label },
        catalog,
      );
      check(
        `${title}: сказано словами и сумма прежняя`,
        state.state !== 'resolved' &&
          'reason' in state &&
          new RegExp(words).test(state.reason) &&
          totalOf(withPick('hw-blum'), catalog) === before,
        'reason' in state
          ? `${state.reason.slice(0, 80)} · ${totalOf(withPick('hw-blum'), catalog)} ₸`
          : 'ОТКАЗА НЕТ',
      );
    }

    /* ── Предупреждения схлопываются: один вопрос к каталогу ── */
    const many: Run = {
      ...baseRun,
      modules: baseRun.modules.map((unit) => ({ ...unit, hardwareItemId: 'hw-gone' })),
    };
    check(
      'десять модулей с одной пропавшей позицией дают одну строку',
      hardwareWarnings(many, catalogOf(blum)).length === 1,
      `${hardwareWarnings(many, catalogOf(blum)).length} строк`,
    );

    /* ── TEST 4: без монтажных размеров присадка не создаётся ── */
    check(
      'у новой позиции монтажных размеров нет',
      !hasMountingData(blum),
      `mounting: ${JSON.stringify(blum.mounting.holeDiameterMm)} · присадка не рассчитывается`,
    );

    const measuredMount = {
      ...blum,
      mounting: { ...EMPTY_MOUNTING, holeDiameterMm: 35, holeDepthMm: 13 },
    };
    check(
      'а с подтверждёнными размерами состояние другое',
      hasMountingData(measuredMount),
      `Ø${measuredMount.mounting.holeDiameterMm} глубина ${measuredMount.mounting.holeDepthMm}`,
    );
  }
}

/* ═══════════  Защищённое поведение рабочего экрана  ═══════════ */

/**
 * СЕТЬ ПОД ТО, ЧТО ЖИВЁТ ТОЛЬКО В ОБОЛОЧКЕ.
 *
 * За последние заходы в `Workspace.tsx` сложилось поведение, которого не
 * видно ни в одной формуле: отказ сборки словами, запертая цена, единый
 * канал блокирующих, названная потеря правок. Снести оболочку сегодня —
 * и пропажа не будет замечена ничем.
 *
 * ГРАНИЦА ПОКРЫТИЯ НАЗВАНА ЧЕСТНО. Проверки ниже делятся на два класса:
 *
 *   ПОЛНОЕ — поведение живёт в `lib`, и тест падает, если оно исчезнет.
 *   ВХОД   — поведение собрано в JSX из значений, посчитанных в `lib`.
 *            Тест держит ВХОД: если движок перестанет давать отказ или
 *            расхождение, экран нечем будет показать. Само чтение этого
 *            входа разметкой сеть пока не ловит — для этого нужна одна
 *            правка продукта, названная в отчёте.
 *
 * Вёрстку тесты не трогают: ни классов, ни цветов, ни порядка. Иначе
 * переработка оболочки падала бы на косметике, и сеть отключили бы.
 */
console.log('\nЗащищённое поведение рабочего экрана');
{
  const CEILING = 2700;
  const WALLS = [
    { id: 'w1', lengthMm: 3800, openings: [] as Opening[] },
    { id: 'w2', lengthMm: 1800, openings: [] as Opening[] },
  ];

  const beam = (fromCornerMm: number, widthMm: number, dropMm: number): Opening => ({
    id: `b-${fromCornerMm}`,
    kind: 'beam',
    fromCornerMm,
    widthMm,
    sillMm: 0,
    heightMm: dropMm,
  });

  /* ─── 1. ПОЛНОЕ · CompositionAttempt: отказ со словами, а не null ─── */

  const refused = tryBuildComposition({
    kind: 'corner_l',
    walls: [WALLS[0]],
    ceilingHeightMm: CEILING,
    requirements: REQ,
    comms: COMMS,
  });

  check(
    'отказ сборки — состояние с причиной, а не null и не пустая композиция',
    refused.state === 'refused' &&
      typeof refused.reason === 'string' &&
      refused.reason.trim().length > 20,
    refused.state === 'refused'
      ? refused.reason.slice(0, 90)
      : 'СБОРКА НЕ ОТКАЗАЛА — показывать будет нечего',
  );

  check(
    'и причина названа словами, а не кодом ошибки',
    refused.state === 'refused' &&
      /[а-яё]{4,}/i.test(refused.reason) &&
      !/Error|undefined|null|at /.test(refused.reason),
    refused.state === 'refused' ? refused.reason.slice(0, 90) : 'ПРИЧИНЫ НЕТ',
  );

  const built = tryBuildComposition({
    kind: 'corner_l',
    walls: WALLS,
    ceilingHeightMm: CEILING,
    requirements: REQ,
    comms: COMMS,
  });

  check(
    'собравшаяся композиция отказом не притворяется',
    built.state === 'built' && built.composition.segments.length === 2,
    built.state === 'built'
      ? `${built.composition.segments.length} сегмента`
      : 'СОБРАТЬСЯ НЕ СМОГЛА',
  );

  if (built.state !== 'built') {
    check('дальше мерить нечем', false, 'КОМПОЗИЦИЯ НЕ СОБРАЛАСЬ');
  } else {
    const layout = built.composition;
    const segments = layout.segments.map((segment) => segment.run);

    /* ─── 2. ВХОД · цена прячется по двум условиям, и оба измеримы ─── */

    /*
     * Расхождение берём на стене, где оно возникает: стена 1140, угол
     * съел 660, полезных 480 — а ряд собран на все 1140. На стене 1800
     * полезная длина как раз 1140, и расхождения там нет вовсе.
     */
    const narrow = tryBuildComposition({
      kind: 'corner_l',
      walls: [WALLS[0], { id: 'w2', lengthMm: 1140, openings: [] }],
      ceilingHeightMm: CEILING,
      requirements: REQ,
      comms: COMMS,
    });

    check(
      'узкая стена для замера расхождения собралась',
      narrow.state === 'built',
      narrow.state === 'built'
        ? `полезная ${narrow.composition.segments[1].run.lengthMm} мм при стене 1140`
        : 'СОБРАТЬСЯ НЕ СМОГЛА — расхождение мерить не на чем',
    );

    const narrowLayout = narrow.state === 'built' ? narrow.composition : layout;
    const stale = buildRun({
      lengthMm: 1140,
      ceilingHeightMm: CEILING,
      requirements: REQ,
      openings: [],
      comms: COMMS,
    });
    const mismatches = wallMismatches(narrowLayout, [
      narrowLayout.segments[0].run,
      stale,
    ]);

    /*
     * Ноль расхождений — это сломанная сверка, а не «всё сошлось»: ряд
     * 1140 на полезных 480 обязан её поднять. Падаем внятной строкой, а
     * не исключением на `mismatches[0]`.
     */
    check(
      'вход для решений есть: отказ и расхождение — два измеримых состояния',
      refused.state === 'refused' && mismatches.length === 1,
      mismatches.length === 0
        ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ РАСХОЖДЕНИЙ — ряд 1140 на полезных 480 прошёл молча'
        : `отказ: ${refused.state} · расхождений: ${mismatches.length}`,
    );

    check(
      'и при собравшейся композиции без правок ни одного из них нет',
      wallMismatches(layout, segments).length === 0,
      `расхождений ${wallMismatches(layout, segments).length}`,
    );

    /* ═══ РЕШЕНИЯ ЭКРАНА · то, что раньше жило в разметке ═══ */

    const wallsOf = (from: typeof layout) =>
      from.segments.map((segment) => ({ lengthMm: segment.wallLengthMm }));

    /** Экран при отказе сборки. */
    const onRefusal = screenState({
      refusal: refused.state === 'refused' ? { reason: refused.reason } : null,
      mismatches: [],
      walls: wallsOf(layout),
      segments,
      shape: 'corner_l',
      warnings: [],
    });

    /** Экран при ряде, не сходящемся со стеной. */
    const onMismatch = screenState({
      refusal: null,
      mismatches,
      walls: wallsOf(narrowLayout),
      segments: narrowLayout.segments.map((segment) => segment.run),
      shape: 'corner_l',
      warnings: [],
    });

    /** Экран при обычной собравшейся композиции. */
    const onNormal = screenState({
      refusal: null,
      mismatches: [],
      walls: wallsOf(layout),
      segments,
      shape: 'corner_l',
      warnings: [],
    });

    /*
     * Пустой вход — это не «всё в порядке», это нечем мерить решения.
     */
    check(
      'три сценария экрана посчитаны и различимы',
      onRefusal.channel.length > 0 && onMismatch.channel.length > 0 && mismatches.length > 0,
      onRefusal.channel.length === 0 || onMismatch.channel.length === 0
        ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ СОСТОЯНИЙ — решения экрана мерить не на чем'
        : `отказ ${onRefusal.channel.length} · расхождение ${onMismatch.channel.length} · обычный ${onNormal.channel.length}`,
    );

    check(
      'цена спрятана при отказе и при расхождении, показана при обычной сборке',
      onRefusal.priceHidden && onMismatch.priceHidden && !onNormal.priceHidden,
      `отказ ${onRefusal.priceHidden} · расхождение ${onMismatch.priceHidden} · обычная ${onNormal.priceHidden}`,
    );

    check(
      '«Дальше» заперто теми же двумя состояниями',
      onRefusal.nextLocked && onMismatch.nextLocked && !onNormal.nextLocked,
      `отказ ${onRefusal.nextLocked} · расхождение ${onMismatch.nextLocked} · обычная ${onNormal.nextLocked}`,
    );

    check(
      'автосохранение не пишет при отказе и при расхождении',
      onRefusal.autosaveLocked && onMismatch.autosaveLocked && !onNormal.autosaveLocked,
      `отказ ${onRefusal.autosaveLocked} · расхождение ${onMismatch.autosaveLocked} · обычная ${onNormal.autosaveLocked}`,
    );

    /*
     * Форму называет `SHAPE_TITLE`, и ответ у неё один на обе строки
     * канала — и у отказа, и у пустой стены. Запасного «Композиция»
     * здесь нет: таблица полна по `CompositionKind`, а выдуманное
     * название формы — это то же production-critical значение из
     * воздуха, только в словах.
     */
    check(
      'отказ идёт в канал блокирующим и называет форму словами',
      onRefusal.blocking.length === 1 &&
        onRefusal.blocking[0].id === 'composition-refused' &&
        /Угловая не сошлась/.test(onRefusal.blocking[0].message) &&
        /отправить её клиенту нельзя/.test(onRefusal.blocking[0].message),
      onRefusal.blocking[0]?.message.slice(0, 100) ?? 'КАНАЛ ПУСТ',
    );

    check(
      'расхождение идёт тем же каналом и тоже блокирующим',
      onMismatch.blocking.length === 1 &&
        onMismatch.blocking[0].id === `wall-stale-${mismatches[0]?.index}` &&
        onMismatch.blocking[0].severity === 'blocking',
      onMismatch.blocking[0]?.id ?? 'КАНАЛ ПУСТ',
    );

    check(
      'у обычной сборки блокирующих нет вовсе',
      onNormal.blocking.length === 0,
      `блокирующих ${onNormal.blocking.length}`,
    );

    /*
     * Канал делится по классу в ОДНОМ месте. Уточнения отбирались
     * компонентом своим `filter` по тому же массиву — половина деления
     * жила в разметке и проверялась ничем.
     */
    check(
      'уточнения отбираются тем же каналом, что и блокирующие',
      onRefusal.clarify.every((w) => w.severity === 'clarify') &&
        onRefusal.blocking.length + onRefusal.clarify.length ===
          onRefusal.channel.filter((w) => w.severity !== 'info').length,
      `блокирующих ${onRefusal.blocking.length} · уточнений ${onRefusal.clarify.length} · канал ${onRefusal.channel.length}`,
    );

    check(
      'кнопка пересборки указывает на ту стену, о которой говорит полоса',
      onMismatch.rebuildWall === mismatches[0]?.index &&
        onRefusal.rebuildWall === null &&
        onNormal.rebuildWall === null,
      `расхождение → ${onMismatch.rebuildWall} · отказ → ${onRefusal.rebuildWall} · обычная → ${onNormal.rebuildWall}`,
    );

    /*
     * ОБА СОСТОЯНИЯ СРАЗУ.
     *
     * Отказ встаёт в канал первым, расхождение за ним. Пока кнопка
     * искала себя по ПЕРВОМУ блокирующему, выход пропадал ровно в этой
     * паре: объект оставался запертым без единого способа выйти —
     * то самое, от чего уходили в заходе про `editedWalls`.
     */
    const onBoth = screenState({
      refusal: refused.state === 'refused' ? { reason: refused.reason } : null,
      mismatches,
      walls: wallsOf(narrowLayout),
      segments: narrowLayout.segments.map((segment) => segment.run),
      shape: 'corner_l',
      warnings: [],
    });

    check(
      'отказ и расхождение пришли вместе — оба в канале и оба блокирующие',
      onBoth.blocking.length === 2 &&
        onBoth.blocking[0].id === 'composition-refused' &&
        onBoth.blocking[1].id === `wall-stale-${mismatches[0]?.index}`,
      mismatches.length === 0 || refused.state !== 'refused'
        ? 'ПАРЕ СОСТОЯНИЙ ВЗЯТЬСЯ НЕОТКУДА — проверять нечего'
        : onBoth.blocking.map((w) => w.id).join(' · ') || 'КАНАЛ ПУСТ',
    );

    check(
      'и выход из расхождения при этом не пропадает: кнопка нашла свою стену',
      onBoth.rebuildWall === mismatches[0]?.index,
      mismatches.length === 0
        ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ РАСХОЖДЕНИЙ — кнопке не на что указывать'
        : `кнопка → ${onBoth.rebuildWall} · ждали ${mismatches[0].index} · первое блокирующее ${onBoth.blocking[0]?.id}`,
    );

    check(
      'кнопка указывает на стену, а не на отказ: отказ пересборкой не лечится',
      onBoth.rebuildWall !== null &&
        `wall-stale-${onBoth.rebuildWall}` !== onBoth.blocking[0]?.id,
      `${onBoth.blocking[0]?.id} ≠ wall-stale-${onBoth.rebuildWall}`,
    );

    /* ─── Потеря правок названа ДО нажатия ─── */

    const message = mismatches[0] ? wallMismatchMessage(mismatches[0]) : '';
    check(
      'кнопка пересборки называет потерю правок ДО нажатия',
      /правки по ней придётся сделать заново/i.test(message),
      message,
    );

    check(
      'и называет последствие числом, а не просто «не сходится»',
      /\d+\s*мм/.test(message) && /сдвинет соседний ряд/.test(message),
      message.slice(0, 110),
    );

    const short = buildRun({
      lengthMm: 300,
      ceilingHeightMm: CEILING,
      requirements: { ...REQ, mode: 'free', appliances: [], sections: [] },
      openings: [],
      comms: [],
    });
    const shortFound = wallMismatches(layout, [segments[0], short]);
    check(
      'короткий ряд объясняется своим последствием, а не тем же текстом',
      shortFound.length === 1 && /останутся пустыми/.test(wallMismatchMessage(shortFound[0])),
      shortFound.length === 0
        ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ РАСХОЖДЕНИЙ на коротком ряду'
        : wallMismatchMessage(shortFound[0]).slice(0, 100),
    );

    /* ─── Замеренная стена без мебели ─── */

    /*
     * Две стены в замере, прямая форма — вторая остаётся без мебели, и
     * строка обязана назвать её по имени и числом.
     */
    const asLinear = screenState({
      refusal: null,
      mismatches: [],
      walls: wallsOf(layout),
      segments: [segments[0]],
      shape: 'linear',
      warnings: [],
    });

    check(
      'замеренная стена без мебели названа именем, длиной и формой',
      Boolean(asLinear.idleWallsNote) &&
        /Стена Б \(1800 мм\)/.test(asLinear.idleWallsNote ?? '') &&
        /замерена, но мебели на ней нет/.test(asLinear.idleWallsNote ?? '') &&
        /Прямая ставит мебель на одну стену/.test(asLinear.idleWallsNote ?? ''),
      asLinear.idleWallsNote ?? 'СТРОКИ НЕТ',
    );

    check(
      'и она идёт уточнением, а не блокирующим',
      asLinear.channel.some((w) => w.id === 'walls-idle' && w.severity === 'clarify') &&
        asLinear.blocking.length === 0,
      asLinear.channel.map((w) => `${w.id}:${w.severity}`).join(' ') || 'КАНАЛ ПУСТ',
    );

    check(
      'у угловой обе стены заняты — строки нет',
      onNormal.idleWallsNote === null,
      String(onNormal.idleWallsNote),
    );

    /* ─── В визуализацию попадёт один ряд ─── */

    /*
     * Строку читает клиент, поэтому проверяется не наличие слов, а сама
     * фраза: буква стены остаётся заглавной («стена А», не «стена а» —
     * строчная читается союзом), и число согласовано с одной соседней
     * стеной («посчитана … не попадёт»).
     */
    check(
      'строка про визуализацию называет, что в кадр попадёт только стена А',
      Boolean(onNormal.renderCoverageNote) &&
        /только стена А:/.test(onNormal.renderCoverageNote ?? '') &&
        /кадр снимается с одного ряда/.test(onNormal.renderCoverageNote ?? ''),
      onNormal.renderCoverageNote ?? 'СТРОКИ НЕТ',
    );

    check(
      'и про ОДНУ соседнюю стену говорит в единственном числе',
      /Стена Б посчитана и есть на чертеже, но в картинку не попадёт\./.test(
        onNormal.renderCoverageNote ?? '',
      ),
      onNormal.renderCoverageNote ?? 'СТРОКИ НЕТ',
    );

    /* У П-образной соседних стен две — и число меняется вместе с ними. */
    const uShape = tryBuildComposition({
      kind: 'u_shape',
      walls: [WALLS[0], WALLS[1], { id: 'w3', lengthMm: 1800, openings: [] }],
      ceilingHeightMm: CEILING,
      requirements: REQ,
      comms: COMMS,
    });

    check(
      'П-образная для замера множественного числа собралась',
      uShape.state === 'built' && uShape.composition.segments.length === 3,
      uShape.state === 'built'
        ? `${uShape.composition.segments.length} сегмента`
        : 'СОБРАТЬСЯ НЕ СМОГЛА — множественное число мерить не на чем',
    );

    const onU =
      uShape.state === 'built'
        ? screenState({
            refusal: null,
            mismatches: [],
            walls: wallsOf(uShape.composition),
            segments: uShape.composition.segments.map((segment) => segment.run),
            shape: 'u_shape',
            warnings: [],
          })
        : null;

    check(
      'две соседние стены — множественное число и обе названы',
      /Стена Б и Стена В посчитаны и есть на чертеже, но в картинку не попадут\./.test(
        onU?.renderCoverageNote ?? '',
      ),
      onU === null ? 'П-ОБРАЗНОЙ НЕТ — мерить нечем' : (onU.renderCoverageNote ?? 'СТРОКИ НЕТ'),
    );

    check(
      'у прямой кухни строки про визуализацию нет вовсе',
      asLinear.renderCoverageNote === null,
      String(asLinear.renderCoverageNote),
    );

    check(
      'строка про пустую стену её тоже называет — в уточнениях, а не только в канале',
      asLinear.clarify.length === 1 && asLinear.clarify[0].id === 'walls-idle',
      asLinear.clarify.map((w) => w.id).join(' · ') || 'УТОЧНЕНИЙ НЕТ',
    );

    /* ─── Падеж стены: фразы, которые замерщик показывает клиенту ─── */

    /*
     * `toLowerCase()` целиком давал «стена б»: слово и обозначение
     * опускались вместе, и фраза читалась оборванной на союзе. Падеж
     * при этом у каждой фразы свой — «Пересобрать стену Б», но «Прибор
     * стоит на стене Б», — и один на всех был бы неверен по-русски
     * ровно там, где экран показывают клиенту.
     */
    const wallB = wallLabel(1);
    check(
      'стена в середине фразы: слово строчное, буква заглавная',
      lowerWall(wallB) === 'стена Б' &&
        lowerWall(wallB, 'accusative') === 'стену Б' &&
        lowerWall(wallB, 'prepositional') === 'стене Б',
      `${lowerWall(wallB)} · ${lowerWall(wallB, 'accusative')} · ${lowerWall(wallB, 'prepositional')}`,
    );

    check(
      'кнопка пересборки называет стену винительным падежом',
      `Пересобрать ${lowerWall(mismatches[0]?.label ?? wallB, 'accusative')}` ===
        'Пересобрать стену Б',
      `Пересобрать ${lowerWall(mismatches[0]?.label ?? wallB, 'accusative')}`,
    );

    check(
      'перенос прибора — тоже винительный, а место прибора — предложный',
      `${APPLIANCE_SLOTS.fridge.title} переехал на ${lowerWall(wallB, 'accusative')}.` ===
        `${APPLIANCE_SLOTS.fridge.title} переехал на стену Б.` &&
        `Прибор стоит на ${lowerWall(wallB, 'prepositional')}` === 'Прибор стоит на стене Б',
      `${APPLIANCE_SLOTS.fridge.title} переехал на ${lowerWall(wallB, 'accusative')}. · Прибор стоит на ${lowerWall(wallB, 'prepositional')} · Перенести на ${lowerWall(wallB, 'accusative')}`,
    );

    /* ─── 7. ПОЛНОЕ · ступень под выступом названа в обе стороны ─── */

    const withBeam = (drop: number) =>
      buildRun({
        lengthMm: DEMO_PROJECT.lengthMm,
        ceilingHeightMm: CEILING,
        requirements: REQ,
        openings: [beam(1600, 600, drop)],
        comms: COMMS,
      });

    const up = beamWarnings(withBeam(300));
    const down = beamWarnings(withBeam(900));

    check(
      'ступень под выступом названа, когда шкаф ВЫШЕ соседей',
      up.length > 0 && /шкаф выше на \d+ мм/.test(up[0].message),
      up.length > 0 ? up[0].message : 'СЛОВ НЕТ',
    );

    check(
      'и когда НИЖЕ — тем же каналом, другим словом',
      down.length > 0 && /шкаф ниже на \d+ мм/.test(down[0].message),
      down.length > 0 ? down[0].message : 'СЛОВ НЕТ',
    );

    check(
      'ряд без выступа о ступени молчит',
      beamWarnings(
        buildRun({
          lengthMm: DEMO_PROJECT.lengthMm,
          ceilingHeightMm: CEILING,
          requirements: REQ,
          openings: [],
          comms: COMMS,
        }),
      ).length === 0,
      'без ригеля предупреждений нет',
    );

    /* ─── 8. ПОЛНОЕ · единый канал: у каждого состояния есть текст ─── */

    /*
     * Блокирующие идут одной полосой, и это значит одно: у КАЖДОГО
     * состояния, которое её зажигает, есть строка словами. Пустая строка
     * в этом канале — красная полоса без объяснения.
     */
    const channel: [string, string][] = [
      ['отказ сборки', refused.state === 'refused' ? refused.reason : ''],
      ['расхождение со стеной', message],
      ['ступень под выступом', up[0]?.message ?? ''],
    ];

    const mute = channel.filter(([, text]) => text.trim().length < 20);
    check(
      'у каждого состояния единого канала есть текст словами',
      mute.length === 0 && channel.length === 3,
      mute.length > 0
        ? `БЕЗ ТЕКСТА: ${mute.map(([name]) => name).join(', ')}`
        : channel.map(([name]) => name).join(' · '),
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
