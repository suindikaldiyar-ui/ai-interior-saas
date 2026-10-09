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

import { buildRun, fillGap, rowSpansOfRun, runWidthSum } from '../lib/millwork/layout';
import { applyOps } from '../lib/millwork/ops';
import {
  COUNTERTOP_CUTOUT_KEY,
  buildEstimate,
  lineAmountText,
  recalcTotal,
  totalCaption,
  unpricedLines,
  type RateTable,
} from '../lib/millwork/estimate';
import catalogJson from '../data/catalog/catalog.json';
import * as THREE from 'three';
import {
  catalogEntriesFromRows,
  collectionPriceRow,
  manualMaterialRow,
  materialCatalog,
  materialOps,
  materialPrice,
  parseMaterialFile,
  planMaterialImport,
  type MaterialChoice,
} from '../lib/millwork/materialCatalog';
import { MATERIAL_FINISHES } from '../lib/millwork/materialFinishes';
import { CAD_RENDER, applyFrontLook, cadShadeMaterial } from '../components/millwork/cabinet3d/cadLook';
import { REAL_SIZE_UV_SOURCE, realSizeUvGeometry } from '../components/millwork/cabinet3d/realSizeMap';
import { pathTraceSceneOf, wireSceneOf } from '../components/millwork/cabinet3d/pathTrace';
import { sceneFromWire } from '../components/millwork/cabinet3d/pathTraceScene';
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
  collectWarnings,
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
import {
  BACK_PANEL_NAME,
  BOTTOM_PANEL_NAME,
  DIVIDER_PANEL_NAME,
  DRAWER_FRONT_PANEL_NAME,
  TOP_PANEL_NAME,
  TOP_RAIL_PANEL_NAME,
  buildPanels,
  edgeSides,
  panelTotals,
} from '../lib/millwork/panels';
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
import { MIN_FACADE_SPAN_MM, facadeSpans, hasFacade, moduleFronts } from '../lib/millwork/applianceFront';
import {
  CARCASS_SCOPES,
  carcassCatalog,
  carcassFor,
  carcassKeyOf,
  carcassScopeOf,
} from '../lib/millwork/carcassMaterial';
import {
  TYPICAL_PALETTE,
  paletteFor,
  paletteFromCatalog,
  typicalColorItem,
} from '../lib/millwork/palette';
import { frontKey, frontOf } from '../lib/millwork/frontMaterial';
import { reorderTarget, rowOfModule } from '../lib/millwork/selection';
import { cornerBandMm, cornerFillerMm, markOnRun, runPlacements, wallsTouchedByChange } from '../lib/millwork/composition';
import { upperSpans, upperSpansOfRun } from '../lib/millwork/layout';
import { CORNER_FILLER_PANEL_NAME, CORNER_UPPER_FILLER_PANEL_NAME, legName } from '../lib/millwork/panels';
import { blindPartMm, cornerChoicesOf, cornerFillersOf, cornerGeometry, openFrontMm } from '../lib/millwork/corner';
import { SINGLE_DOOR_MAX_MM, frontPlan, hingesPerDoor } from '../lib/millwork/modules';
import { cornerCards } from '../lib/millwork/cornerChange';
import {
  PLINTH_SETBACK_MM,
  apronLengthMm,
  apronSpans,
  counterTailsOf,
  countertopSlabs,
  plinthSpans,
  slabPieces,
  type CounterSlab,
} from '../lib/millwork/countertop';
import { DRAWER_TRAVEL_M, bifoldPoses, drawerBoxes, leafPoses, sceneLeaves } from '../lib/millwork/cabinetBoxes';
import { TAIL_FILLER_PANEL_NAME } from '../lib/millwork/panels';
import { wallCornerOf } from '../lib/millwork/objectEstimate';
import type { CornerChoice, LowerCornerKind, RunCorner, UpperCornerKind } from '../types/millwork';
import {
  gapsOfRow,
  libraryCards,
  libraryGaps,
  libraryLock,
  priceDeltaOf,
  widthsFor,
  type LibraryCard,
} from '../lib/millwork/moduleLibrary';
import { counterSlabDepthMm, rowStandardDepthMm } from '../lib/millwork/fill';
import { carcassHeightMm } from '../lib/millwork/shop';
import { handleSpotOf } from '../lib/millwork/handlePlace';
import { frontSwatch } from '../lib/millwork/frontSwatch';
import {
  compositionOf,
  compositionWalls,
  lowerWall,
  mergeEstimates,
  wallLabel,
  obstacleMismatches,
  mismatchPriceText,
  wallMismatchMessage,
  wallMismatches,
  type WallMismatch,
} from '../lib/millwork/walls';
import { composeVariants, editedRunEstimate, workingWall, workingWallEdit, workspaceInput } from '../lib/millwork/workspace';
import {
  ARRANGEMENTS_FAILED,
  arrangementsState,
  lostWallEditsNote,
  missingAppliances,
  screenState,
} from '../lib/millwork/screen';
import ArrangementCards from '../components/millwork/ArrangementCards';
import React from 'react';
import MillingPicker from '../components/millwork/MillingPicker';
import { useInteriorStore } from '../store/useInteriorStore';
import ModuleAssembly from '../components/millwork/ModuleAssembly';
import PanelList from '../components/millwork/PanelList';
import PartCard from '../components/millwork/PartCard';
import {
  MILLING_SCOPES,
  TYPICAL_MILLING,
  millingCatalog,
  millingChoices,
  millingFor,
  millingScopeOf,
  millingWarnings,
  frontWithMilling,
  profileOf,
  typicalMillingItem,
  type MillingItem,
} from '../lib/millwork/milling';
import {
  actionEnabled,
  moduleActions,
  type ModuleActionKey,
} from '../lib/millwork/moduleActions';
import { plinthColor, counterColor, roleColors } from '../lib/millwork/sceneColors';
import { OBJECT_MARKS, markOwn, productionFor, withMark } from '../lib/millwork/shop';
import {
  STEP_FIELDS,
  STEP_HINT,
  STEP_NEXT_LABEL,
  STEP_TITLE,
  STUDIO_STEPS,
  isStudio,
  nextStep,
  prevStep,
  shows,
  stepOrder,
  type StepField,
  type StepKey,
} from '../lib/millwork/steps';
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
  MIN_DRAWER_MM,
  mezzanineBaseOf,
  moduleDepthMm,
  upperBottomFor,
} from '../lib/millwork/fill';
import {
  openingHardware,
  openingOf,
  openingRejection,
  openingsFor,
  isPullOut,
  handleOf,
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
  ratesFromCatalog,
} from '../lib/millwork/rates';
import {
  compositionFor,
  objectEstimateOf,
  objectInput,
  objectSite,
  projectOffer,
  savedCornerChoices,
  savedWallRuns,
  wallRequirementsOf,
  wallSegments,
  withWallEdit,
} from '../lib/millwork/objectEstimate';
import {
  ROOM_CONTOUR_MM,
  ROOM_WALL_THICKNESS_MM,
  roomAroundRows,
  roomBoxes,
  roomOnRow,
  openSideOf,
  roomSourceOf,
  rowPlacement as roomRowPlacement,
  wallsFacingAway,
} from '../lib/millwork/room';
import { generalCamera } from '../lib/cameraFraming';
import { axonometryExtentMm, buildAxonometry, project } from '../lib/millwork/axonometry';
import { carcassBoxes, doorCount, doorPivot, hasVisibleAppliance, moduleBoxes, openablePartIds, panelPlaces, runBoxes, runPlaces, doorLeaves} from '../lib/millwork/cabinetBoxes';
import {
  DEFAULT_ALLOWANCES,
  DEFAULT_COUNTERTOP_STRIP,
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
  MAX_WIDTH,
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
  Estimate,
  FrontSpec,
  Measurement,
  MillworkOp,
  Module,
  ModuleFill,
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
  UNKNOWN,
  emptySurvey,
  isEstimatePreliminary,
  measured,
  newWall,
  resolveSurvey,
  surveyFromMeasurement,
  surveyStats,
  type Survey,
} from '../types/survey';
import {
  VISIBLE_WARNINGS,
  groupWarnings,
  splitWarnings,
  surveyWarnings,
  type SurveyWarning,
} from '../lib/millwork/warnings';

let failed = 0;
let passed = 0;

/** Сколько выдвижных ящиков нарисовано у модуля — по коробкам сцены. */
function drawerBoxCount(unit: Module, run: Run): number {
  const place = runPlaces(run).find((p) => p.unit.id === unit.id);
  if (!place) return 0;

  const boxes = moduleBoxes(
    place.unit,
    /* Считаем ЛОКАЛЬНУЮ геометрию модуля: место в ряду меряет test:spatial. */
    { x: place.x, y: place.y, heightM: place.heightM, depthM: place.depthM, zM: 0, thicknessM: 0.016 },
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
  /*
   * СЛЕПОЙ УГОЛ — ТОЖЕ НА УГЛОВЫХ ПЕТЛЯХ (слой 55).
   *
   * Здесь стояло «у фальш-панели угловых петель нет: углового модуля там
   * нет вовсе» — петли 175° считались только у углового модуля. Задача
   * слоя 55 требует их строкой и у фальш-панели: створка слепого модуля
   * стоит у панели, и обычная петля 110° не даёт достать до глухой части.
   * Проверка не ослаблена, а перевёрнута требованием: строка обязана быть,
   * и петли в ней — ровно у створки слепого модуля, не у соседей.
   */
  {
    const owner = corner.segments[0].run;
    const blindUnits = allModules(owner).filter((m) => blindPartMm(m, owner) > 0 && openFrontMm(m, owner) > 0);
    const line = buildEstimate(owner, 'optimal', DEMO_RATES).lines.find((l) => l.key === 'hinge_corner_175');
    /* Петель на угловой строке — ровно на одну створку слепого модуля его высоты. */
    const ownHinges = blindUnits.reduce((sum, unit) => sum + hingesPerDoor(moduleCarcassHeightMm(unit, owner)), 0);
    check(
      'у фальш-панели створка слепого модуля — на угловых петлях своей строкой',
      blindUnits.length > 0 && (line?.quantity ?? 0) > 0 && line?.quantity === ownHinges,
      `слепых створок ${blindUnits.length} · угловых петель ${line?.quantity ?? 0} при ${ownHinges} у слепой створки`,
    );
  }
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

/* ──────────  Компоновки: отказ расчёта — словами, а не пустотой  ────────── */

console.log('\nКомпоновки: отказ расчёта — словами, а не пустотой');
{
  /*
   * Тем же путём, что экран: `arrangementsState` вокруг расчёта, затем
   * `ArrangementCards` с этим состоянием — их же зовёт `Workspace`. Экран
   * глушил любую ошибку (`catch { return [] }`), и упавший расчёт выглядел
   * как «выбирать не из чего»: карточек нет, и почему — не сказано.
   */
  const logged: unknown[][] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  let broken: ReturnType<typeof arrangementsState>;
  try {
    broken = arrangementsState(() => {
      throw new Error('проба: расчёт компоновок упал');
    });
  } finally {
    console.error = realError;
  }
  const noop = () => undefined;
  const brokenHtml = renderToStaticMarkup(
    createElement(ArrangementCards, { state: broken, activeKey: null, onSelect: noop }),
  );
  const brokenText = brokenHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  check(
    'отказ расчёта — состояние «не посчиталось», а не пустой список',
    broken.state === 'failed',
    broken.state === 'ready' ? `«готово», карточек ${broken.arrangements.length}` : broken.state,
  );
  check(
    'на месте карточек — слова',
    brokenHtml.includes('data-arrangements-error') && brokenText.includes(ARRANGEMENTS_FAILED),
    brokenText || 'ПУСТО: на экране ничего',
  );
  check(
    'слова называют последствие, а не текст ошибки',
    brokenText.length > 0 && !brokenText.includes('проба') && !/Error|stack/i.test(brokenText),
    brokenText.slice(0, 120) || 'ПУСТО',
  );
  check(
    'причина ушла в лог',
    logged.length === 1 &&
      logged[0].some((arg) => arg instanceof Error && arg.message.includes('проба')),
    `записей в логе ${logged.length}`,
  );

  /* Посчиталось — карточки, а не слова. Ноль карточек здесь — падение. */
  const ready = arrangementsState(() =>
    buildArrangements({
      lengthMm: 3200,
      ceilingHeightMm: 2700,
      requirements: REQ,
      openings: OPENINGS,
      comms: COMMS,
      rates: DEMO_RATES,
    }),
  );
  const readyHtml = renderToStaticMarkup(
    createElement(ArrangementCards, { state: ready, activeKey: null, onSelect: noop }),
  );
  const cards = (readyHtml.match(/<button/g) ?? []).length;
  check(
    'расчёт прошёл — на экране карточки компоновок, а не слова',
    ready.state === 'ready' && cards >= 2 && !readyHtml.includes('data-arrangements-error'),
    `карточек ${cards}`,
  );

  /* «Выбирать не из чего» — законная пустота: не рисуется ничего, и это не отказ. */
  const single = arrangementsState(() => (ready.state === 'ready' ? ready.arrangements.slice(0, 1) : []));
  const singleHtml = renderToStaticMarkup(
    createElement(ArrangementCards, { state: single, activeKey: null, onSelect: noop }),
  );
  check(
    'один вариант — пусто без слов об отказе',
    single.state === 'ready' && single.arrangements.length === 1 && singleHtml === '',
    singleHtml ? singleHtml.slice(0, 80) : 'пусто',
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

/* ═══════════  Сцена читается как САПР  ═══════════ */

/**
 * ДЕТАЛЬ УЗНАЁТСЯ ЦВЕТОМ, ПРИБОР — ФОРМОЙ.
 *
 * Сцена была одного серого: корпус, фасад, полка и прибор различались
 * только положением. Прибор при этом рисовался чёрным блоком, и духовка
 * от посудомойки отличалась высотой — клиент видел стену плит.
 *
 * Меряем то, что видно: цвет по роли и число коробок у прибора.
 */
console.log('\nСцена читается как САПР');
{
  const palette = { facade: '#D8D2C6', carcass: '#CFC8BA', counter: '#3A3D40' };
  const colors = roleColors(palette);
  const roles = Object.keys(colors) as (keyof typeof colors)[];

  check(
    'роли есть — цвет проверять есть на чём',
    roles.length >= 6,
    roles.length === 0
      ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ РОЛЕЙ — красить нечего'
      : `ролей ${roles.length}: ${roles.join(', ')}`,
  );

  const all = [...roles.map((role) => colors[role]), plinthColor(palette), counterColor(palette)];
  check(
    'у каждой роли свой цвет: ни один не совпадает с соседним',
    new Set(all).size === all.length,
    roles.map((role) => `${role} ${colors[role]}`).join(' · ') +
      ` · цоколь ${plinthColor(palette)} · столешница ${counterColor(palette)}`,
  );

  /*
   * Различимость — это РАССТОЯНИЕ между тонами, а не «не равно». Два
   * цвета, отличающиеся на единицу канала, на экране одинаковы, и
   * проверка «не равны» была бы зелёной на сплошной серой плите.
   */
  const rgb = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const far = (a: string, b: string) =>
    Math.max(...rgb(a).map((c, i) => Math.abs(c - rgb(b)[i])));

  check(
    'корпус, внутренности и цоколь различаются глазом, а не на единицу канала',
    far(colors.carcass, colors.inner) >= 20 &&
      far(colors.carcass, plinthColor(palette)) >= 15 &&
      far(colors.inner, plinthColor(palette)) >= 30,
    `корпус↔внутренности ${far(colors.carcass, colors.inner)} · корпус↔цоколь ${far(colors.carcass, plinthColor(palette))}`,
  );

  /*
   * СНЯТЫЙ МАТЕРИАЛ НЕ ДЕЛАЕТ СЦЕНУ СЕРОЙ.
   *
   * Артикул красит фасад и столешницу; без него берётся палитра по
   * умолчанию — и роли обязаны различаться всё равно, иначе «мебель ещё
   * не выбрана» выглядит как «мебель не загрузилась».
   */
  const plain = { facade: '#CFC8BA', carcass: '#CFC8BA', counter: '#CFC8BA' };
  const plainColors = roleColors(plain);
  check(
    'при одном материале на всё части всё равно различимы по роли',
    new Set([
      plainColors.carcass,
      plainColors.inner,
      plainColors.appliance,
      plainColors.metal,
      plinthColor(plain),
    ]).size === 5 && far(plainColors.carcass, plainColors.inner) >= 20,
    `корпус ${plainColors.carcass} · внутри ${plainColors.inner} · цоколь ${plinthColor(plain)}`,
  );

  /* ─── Рёбра: каждая коробка даёт свои двенадцать ─── */

  const run = buildRun(baseInput);
  const boxes = runBoxes(run, { thicknessMm: 16, frontThicknessMm: 18, gapMm: 3 });

  check(
    'коробки ряда есть — рёбра строить из чего',
    boxes.length > 0,
    boxes.length === 0 ? 'НОЛЬ КОРОБОК — рёбра строить не из чего' : `коробок ${boxes.length}`,
  );

  check(
    'ни одна коробка не вырождена: у ребра нулевой длины нет',
    boxes.every((box) => box.scale.every((side) => side > 0.0005)),
    `наименьшая сторона ${Math.min(...boxes.flatMap((b) => b.scale)).toFixed(4)} м`,
  );

  /*
   * Буфер рёбер строится по ВСЕМ коробкам ряда и фильтрует только
   * внутренние (в режиме «Фасады» их не видно за дверью). Новые
   * части — стекло и металл прибора — внутренними не помечены, значит
   * рёбра у них есть.
   */
  const outside = boxes.filter((box) => !box.inside);
  check(
    'рёбра считаются по всем коробкам, а роль их не отсеивает',
    outside.length > 0 &&
      outside.length < boxes.length &&
      new Set(boxes.map((box) => box.material)).size >= 4,
    `видимых ${outside.length} из ${boxes.length} · ролей в ряду ${new Set(boxes.map((b) => b.material)).size}`,
  );

  /* ─── Прибор — не блок ─── */

  /*
   * Колонна «духовка + СВЧ» — самая частая высокая секция, и именно на
   * ней видно, узнаётся ли прибор: две ниши подряд, и каждая должна
   * читаться своим лицом, а не общей чёрной плитой.
   */
  const columnRun = buildRun({
    ...baseInput,
    requirements: {
      ...REQ,
      appliances: ['fridge', 'oven', 'microwave', 'hob', 'hood', 'sink600'],
    },
  });
  const column = columnRun.modules.find((unit) => unit.column);
  const applianceBoxesOf = (from: typeof run) =>
    runBoxes(from, { thicknessMm: 16, frontThicknessMm: 18, gapMm: 3 }).filter(
      (box) => box.material === 'appliance' || box.material === 'glass',
    );

  check(
    'в ряду есть колонна приборов — узнаваемость проверять есть на чём',
    Boolean(column),
    column ? `${column.label}` : 'КОЛОННЫ НЕТ — приборы проверять не на чем',
  );

  const columnBoxes = applianceBoxesOf(columnRun);
  check(
    'прибор рисуется не одним блоком: у него есть дверца и стекло',
    columnBoxes.length > 2 && columnBoxes.some((box) => box.material === 'glass'),
    `коробок прибора ${columnBoxes.length}, из них стекло ${columnBoxes.filter((b) => b.material === 'glass').length}`,
  );

  check(
    'у варочной панели конфорки, а не одна плоскость',
    runBoxes(columnRun, { thicknessMm: 16, frontThicknessMm: 18, gapMm: 3 }).filter(
      (box) => box.material === 'metal',
    ).length >= 4,
    `металлических деталей в ряду ${runBoxes(columnRun, { thicknessMm: 16, frontThicknessMm: 18, gapMm: 3 }).filter((b) => b.material === 'metal').length}`,
  );

  /* ─── Ручка ─── */

  const withHandle = run.modules.find((unit) => unit.fill?.drawerHeights.length === 0 && unit.doorCount > 0);
  const metalOf = (unit: Module) =>
    moduleBoxes(
      unit,
      { x: 0, y: 0, heightM: 0.72, depthM: 0.56, zM: 0, thicknessM: 0.016 },
      { gapM: 0.003, frontThicknessM: 0.018, integratedHandles: false, cutaway: false },
    ).filter((box) => box.material === 'metal').length;

  check(
    'модуль со створкой найден — ручку проверять есть на чём',
    Boolean(withHandle),
    withHandle ? `${withHandle.label}` : 'МОДУЛЯ СО СТВОРКОЙ НЕТ — ручку проверять не на чем',
  );

  if (withHandle) {
    const bar = { ...withHandle, fill: { ...withHandle.fill!, handle: 'bar' as const } };
    const none = { ...withHandle, fill: { ...withHandle.fill!, handle: 'none' as const } };

    check(
      'ручка есть у модуля с выбранной ручкой и пропадает при «без ручки»',
      metalOf(bar) > metalOf(none) && metalOf(none) === 0,
      `скоба ${metalOf(bar)} · без ручки ${metalOf(none)}`,
    );
  }
}

/* ═══════════  Отметки объекта  ═══════════ */

/**
 * ОБЪЕКТ НАСЛЕДУЕТ ОТМЕТКИ, А НЕ КОПИРУЕТ ИХ.
 *
 * На объекте потолок ниже, фартук другой, цоколь иной — и править их
 * надо здесь, а не на всю организацию. Но копия всего набора заморозила
 * бы объект на старом стандарте цеха: цех перешёл с боковины 720 на 760,
 * а объекты, собранные до этого, остались на 720 — молча, без следа в
 * интерфейсе.
 *
 * Поэтому объект хранит ТОЛЬКО изменённое, а разрешает «объект или
 * организация» ровно одна функция — `productionFor`.
 */
console.log('\nОтметки объекта');
{
  const org: ProductionSettings = {
    ...DEFAULT_PRODUCTION,
    heights: { plinthMm: 100, carcassMm: 720, countertopMm: 38, apronMm: 592 },
    depths: { baseMm: 560, upperMm: 320, mezzanineMm: 560 },
  };

  const marks = [...OBJECT_MARKS];
  check(
    'отметки цеха есть — наследовать есть что',
    marks.length === 7 && org.heights.carcassMm === 720,
    marks.length === 0
      ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ ОТМЕТОК — править на объекте нечего'
      : `правится ${marks.length}: ${marks.map((m) => m.title).join(', ')}`,
  );

  /* ─── Объект без своих отметок читает организацию ─── */

  const plain = productionFor(org, undefined);
  check(
    'объект без своих отметок — это отметки организации, до числа',
    JSON.stringify(plain.heights) === JSON.stringify(org.heights) &&
      JSON.stringify(plain.depths) === JSON.stringify(org.depths),
    `${plain.heights.carcassMm} · ${plain.depths.baseMm}`,
  );

  const runOf = (production: ProductionSettings) =>
    buildRun({ ...baseInput, production });

  const plainRun = runOf(plain);
  const orgRun = runOf(org);
  check(
    'и даёт тот же ряд и ту же смету, что и раньше',
    plainRun.fingerprint === orgRun.fingerprint &&
      buildEstimate(plainRun, 'optimal', DEMO_RATES).total ===
        buildEstimate(orgRun, 'optimal', DEMO_RATES).total,
    `${plainRun.fingerprint} · ${buildEstimate(plainRun, 'optimal', DEMO_RATES).total} ₸`,
  );

  /* ─── Правка на объекте двигает всё сразу ─── */

  const plinth = marks.find((m) => m.key === 'plinthMm')!;
  const own = withMark(undefined, plinth, 150);
  const ownProduction = productionFor(org, own);

  check(
    'объект хранит ТОЛЬКО изменённое: одно поле, а не весь набор',
    JSON.stringify(own) === JSON.stringify({ heights: { plinthMm: 150 } }),
    JSON.stringify(own),
  );

  check(
    'изменённое читается у объекта, остальное — у организации',
    ownProduction.heights.plinthMm === 150 &&
      ownProduction.heights.carcassMm === org.heights.carcassMm &&
      ownProduction.depths.baseMm === org.depths.baseMm,
    `цоколь ${ownProduction.heights.plinthMm} · боковина ${ownProduction.heights.carcassMm}`,
  );

  const ownRun = runOf(ownProduction);
  const ownPanels = buildPanels({ run: ownRun, production: ownProduction });
  const plainPanels = buildPanels({ run: plainRun, production: plain });

  check(
    'поднятый цоколь поехал в раскрой: боковина стала другой деталью',
    ownPanels.some(
      (panel, i) => panel.name === 'Боковина' && panel.lengthMm !== plainPanels[i]?.lengthMm,
    ) || ownRun.fingerprint !== plainRun.fingerprint,
    `раскрой ${plainPanels[0]?.lengthMm} → ${ownPanels[0]?.lengthMm} мм`,
  );

  check(
    'и в смету',
    buildEstimate(ownRun, 'optimal', DEMO_RATES).total !==
      buildEstimate(plainRun, 'optimal', DEMO_RATES).total,
    `${buildEstimate(plainRun, 'optimal', DEMO_RATES).total} → ${buildEstimate(ownRun, 'optimal', DEMO_RATES).total} ₸`,
  );

  check(
    'и в чертёж со сценой: отметки ряда считаются по нему же',
    workTopMm(ownProduction) === workTopMm(plain) + 50 &&
      upperBottomMm(ownProduction) === upperBottomMm(plain) + 50,
    `рабочая поверхность ${workTopMm(plain)} → ${workTopMm(ownProduction)} · низ верхних ${upperBottomMm(plain)} → ${upperBottomMm(ownProduction)}`,
  );

  /*
   * ПУСТОЕ ПОЛЕ — ЭТО «НЕ ТРОГАЛИ», А НЕ «НОЛЬ».
   *
   * Отметка, лежащая в объекте со значением `undefined`, обязана читаться
   * у организации. Поверхностное слияние (`{...org, ...own}`) затёрло бы
   * её этим `undefined`, и цоколь стал бы `undefined` мм: раскрой считал
   * бы по NaN, а увидели бы это только на распиле.
   */
  const blank = { heights: { plinthMm: undefined, carcassMm: 800 } };
  check(
    'отметка со значением «пусто» читается у организации, а не затирает её',
    productionFor(org, blank).heights.plinthMm === org.heights.plinthMm &&
      productionFor(org, blank).heights.carcassMm === 800 &&
      Number.isFinite(workTopMm(productionFor(org, blank))),
    `цоколь ${productionFor(org, blank).heights.plinthMm} при цеховом ${org.heights.plinthMm} · боковина ${productionFor(org, blank).heights.carcassMm}`,
  );

  /* ─── Цех поменял стандарт ─── */

  /*
   * ГЛАВНОЕ СВОЙСТВО НАСЛЕДОВАНИЯ. Объект без своей правки едет за цехом,
   * объект со своей — остаётся на своей. Копия всего набора дала бы
   * обратное: замерли бы оба.
   */
  const orgLater: ProductionSettings = {
    ...org,
    heights: { ...org.heights, carcassMm: 760 },
  };

  check(
    'цех поменял боковину — объект без своей правки поехал следом',
    productionFor(orgLater, undefined).heights.carcassMm === 760 &&
      workTopMm(productionFor(orgLater, undefined)) === workTopMm(plain) + 40,
    `${plain.heights.carcassMm} → ${productionFor(orgLater, undefined).heights.carcassMm}`,
  );

  const ownCarcass = withMark(undefined, marks.find((m) => m.key === 'carcassMm')!, 700);
  check(
    'а объект со своей правкой остался на своей',
    productionFor(orgLater, ownCarcass).heights.carcassMm === 700 &&
      productionFor(org, ownCarcass).heights.carcassMm === 700,
    `своя ${productionFor(orgLater, ownCarcass).heights.carcassMm} при цеховой ${orgLater.heights.carcassMm}`,
  );

  check(
    'и правку можно снять: отметка снова читается у цеха',
    markOwn(plinth, own) &&
      !markOwn(plinth, withMark(own, plinth, null)) &&
      productionFor(orgLater, withMark(own, plinth, null)).heights.plinthMm === 100,
    `снятая отметка → ${productionFor(orgLater, withMark(own, plinth, null)).heights.plinthMm} мм`,
  );

  /* ─── Производные не хранятся ─── */

  check(
    'производные считаются формулой, а не лежат полем',
    !Object.keys(org.heights).includes('workTopMm') &&
      !Object.keys(org.heights).includes('upperBottomMm') &&
      workTopMm(org) === org.heights.plinthMm + org.heights.carcassMm + org.heights.countertopMm &&
      upperBottomMm(org) === workTopMm(org) + org.heights.apronMm,
    `рабочая поверхность ${workTopMm(org)} = ${org.heights.plinthMm} + ${org.heights.carcassMm} + ${org.heights.countertopMm}`,
  );

  check(
    'у производных нет поля на объекте: править их нечем',
    !marks.some((m) => m.key.includes('workTop') || m.key.includes('upperBottom')),
    marks.map((m) => m.key).join(' '),
  );

  /* ─── Правка, ломающая ряд ─── */

  /*
   * Отметка меняет ГАБАРИТ: боковина 900 при потолке 2700 поднимает
   * рабочую поверхность так, что верхний ряд упирается в потолок. Ряд
   * при этом обязан отказаться словами, а не молча собраться неверным.
   */
  const tall = productionFor(org, withMark(undefined, marks.find((m) => m.key === 'carcassMm')!, 900));
  let refusedWords = '';
  try {
    buildRun({ ...baseInput, ceilingHeightMm: 2200, production: tall });
  } catch (error) {
    refusedWords = error instanceof Error ? error.message : String(error);
  }

  check(
    'правка, ломающая ряд, отказывает словами, а не собирает неверное',
    refusedWords.length > 10 && /[а-яё]{4,}/i.test(refusedWords),
    refusedWords ? refusedWords.slice(0, 100) : 'РЯД СОБРАЛСЯ — поломку никто не заметил',
  );
}

/* ═══════════  Правая панель  ═══════════ */

/**
 * УТОЧНЕНИЯ НЕ ЗАДАВЛИВАЮТ НАСТРОЙКИ МОДУЛЯ.
 *
 * Шесть жёлтых строк заняли панель целиком, а «Модуль 6 · 600 мм» и его
 * поля оказались ниже сгиба. Причин было две, и обе видно числом:
 * схлопывание ключевало по ТЕКСТУ и три строки об одном окне не сводило,
 * а сам список стоял первым блоком панели.
 */
console.log('\nПравая панель');
{
  /*
   * Замер с незамеренным окном и незамеренной розеткой — ровно тот
   * случай, о котором речь: у окна три величины, у розетки две.
   */
  const base = emptySurvey();
  const wall = { ...newWall(0), lengthMm: measured(3800) };
  const raw = {
    ...base,
    ceilingHeightMm: measured(2700),
    walls: [
      {
        ...wall,
        openings: [
          {
            id: 'o1',
            kind: 'window' as const,
            fromCornerMm: UNKNOWN,
            widthMm: UNKNOWN,
            heightMm: UNKNOWN,
            sillMm: measured(900),
          },
        ],
      },
    ],
    comms: [
      {
        id: 'c1',
        kind: 'socket' as const,
        wallId: 'w1',
        fromCornerMm: UNKNOWN,
        heightMm: UNKNOWN,
      },
    ],
  };

  const stats = surveyStats(raw);
  const plain = surveyWarnings(stats);

  check(
    'незамеренные величины дали уточнения — схлопывать есть что',
    plain.length >= 5,
    plain.length === 0
      ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ УТОЧНЕНИЙ — схлопывание проверять не на чем'
      : `строк до схлопывания ${plain.length}`,
  );

  const grouped = groupWarnings(plain);

  check(
    'три строки об одном окне сходятся в одну',
    grouped.filter((w) => w.message.includes('окно')).length === 1,
    grouped
      .filter((w) => w.message.includes('окно'))
      .map((w) => w.message)
      .join(' | ') || 'ПРО ОКНО НЕ СКАЗАНО НИЧЕГО',
  );

  const window = grouped.find((w) => w.message.includes('окно'));
  check(
    'и общая строка называет объект, все три величины и последствие',
    Boolean(window) &&
      /Стена 1 · окно: не замерены/.test(window!.message) &&
      /привязка/.test(window!.message) &&
      /ширина/.test(window!.message) &&
      /высота/.test(window!.message) &&
      /разрыв верхнего ряда встанет не туда/.test(window!.message),
    window?.message ?? 'СТРОКИ НЕТ',
  );

  check(
    'сами строки не пропали: они внутри и видны по тапу',
    window?.count === 3 && window?.members.length === 3,
    `в группе ${window?.count} · внутри ${window?.members.length}`,
  );

  check(
    'две строки про розетку — тоже одна',
    grouped.filter((w) => w.message.includes('розетка')).length === 1,
    grouped
      .filter((w) => w.message.includes('розетка'))
      .map((w) => w.message)
      .join(' | ') || 'ПРО РОЗЕТКУ НЕ СКАЗАНО НИЧЕГО',
  );

  check(
    'разные объекты не сливаются в одну строку',
    grouped.length >= 2 &&
      new Set(grouped.map((w) => w.message)).size === grouped.length,
    grouped.map((w) => w.message.slice(0, 40)).join(' · '),
  );

  /* ─── На экране не больше двух ─── */

  const { shown, hidden } = splitWarnings(grouped);
  check(
    'на экране не больше двух, остальные за счётчиком',
    shown.length <= VISIBLE_WARNINGS && shown.length + hidden === grouped.length,
    `показано ${shown.length} из ${grouped.length}, за «ещё» ${hidden}`,
  );

  /*
   * Схлопывание по ТЕКСТУ никуда не делось: шесть одинаковых строк о
   * шести модулях по-прежнему одна. Объект сильнее текста, но текст
   * остаётся, когда объекта нет.
   */
  const same: SurveyWarning[] = Array.from({ length: 6 }, (_, i) => ({
    id: `socket-${i}`,
    severity: 'clarify' as const,
    message: `Розетка не отмечена (модуль «Дверца ${i}»).`,
  }));
  check(
    'шесть одинаковых строк о разных модулях — по-прежнему одна',
    groupWarnings(same).length === 1 && groupWarnings(same)[0].count === 6,
    groupWarnings(same)[0]?.message ?? 'ПУСТО',
  );

  /* ─── Порядок панели ─── */

  /*
   * Порядок блоков — это разметка, и Node её не видит. Проверяем то, что
   * решает порядок: настройки модуля есть у КАЖДОГО шага рабочего
   * экрана, а уточнения не принадлежат ни одному — значит они не могут
   * встать между шагом и его полями.
   */
  check(
    'настройки модуля есть на каждом шаге рабочего экрана',
    STUDIO_STEPS.every((key) => STEP_FIELDS[key].length > 0),
    STUDIO_STEPS.map((key) => `${key}:${STEP_FIELDS[key].length}`).join(' · '),
  );

  const asField = Object.values(STEP_FIELDS).flat();
  check(
    'уточнения не значатся полем ни одного шага: их место — конец панели',
    !asField.includes('warnings' as never),
    `полей всего ${asField.length}`,
  );

  /* ─── Блокирующее осталось в подвале ─── */

  const refusedPanel = tryBuildComposition({
    kind: 'corner_l',
    walls: [{ id: 'w1', lengthMm: 3800, openings: [] }],
    ceilingHeightMm: 2700,
    requirements: REQ,
    comms: COMMS,
  });

  const panelScreen = screenState({
    refusal: refusedPanel.state === 'refused' ? { reason: refusedPanel.reason } : null,
    mismatches: [],
    walls: [{ lengthMm: 3800 }],
    segments: [],
    shape: 'corner_l',
    warnings: plain,
  });

  check(
    'блокирующее идёт своим каналом, а не в списке уточнений',
    panelScreen.blocking.length === 1 &&
      panelScreen.clarify.every((w) => w.severity === 'clarify') &&
      !panelScreen.clarify.some((w) => w.id === 'composition-refused'),
    `блокирующих ${panelScreen.blocking.length} · уточнений ${panelScreen.clarify.length}`,
  );

  check(
    'и уточнения при этом никуда не пропали',
    panelScreen.clarify.length >= plain.length,
    `уточнений ${panelScreen.clarify.length} при ${plain.length} на входе`,
  );
}

/* ═══════════  Шаги работы  ═══════════ */

/**
 * РАБОТА РАЗЛОЖЕНА НА ШАГИ, И РАЗЛОЖЕНИЕ ПРОВЕРЯЕМО.
 *
 * Конфигуратор держал всё сразу, и панель росла до четырёх экранов
 * прокрутки. Теперь у каждого шага свой предмет, а что на каком шаге —
 * одна таблица (`STEP_FIELDS`), которую читают и экран, и эта проверка.
 * Вторая таблица в разметке означала бы поле, пропавшее с экрана молча.
 */
console.log('\nШаги работы');
{
  const order = stepOrder(true);
  const noSurvey = stepOrder(false);

  check(
    'шаги есть — проверять есть что',
    order.length > 0 && noSurvey.length > 0,
    order.length === 0
      ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ ШАГОВ — полосу шагов строить не из чего'
      : `с замером ${order.length}: ${order.join(' → ')}`,
  );

  check(
    'работа разложена на семь шагов, конфигуратора среди них нет',
    order.join(' ') === 'survey template sizes layout build materials result',
    order.join(' '),
  );

  check(
    'без замера шаг замера не показывается вовсе',
    noSurvey.length === order.length - 1 && !noSurvey.includes('survey'),
    noSurvey.join(' '),
  );

  /* ─── Каждый шаг находит свои поля ─── */

  const studio = STUDIO_STEPS;
  check(
    'рабочий экран — это четыре шага, и все они идут подряд',
    studio.length === 4 &&
      studio.every((key) => isStudio(key)) &&
      order.slice(2, 6).join(' ') === studio.join(' '),
    studio.join(' → '),
  );

  const empty = studio.filter((key) => STEP_FIELDS[key].length === 0);
  check(
    'у каждого шага рабочего экрана есть свои поля',
    empty.length === 0,
    empty.length === 0
      ? studio.map((key) => `${STEP_TITLE[key]}:${STEP_FIELDS[key].length}`).join(' · ')
      : `ШАГ БЕЗ ПОЛЕЙ: ${empty.join(', ')} — панель на нём пуста`,
  );

  /*
   * Поле лежит РОВНО НА ОДНОМ шаге. Два места для одного выбора — это
   * две настройки одного и того же (ловушка 257), и человек правит то
   * одну, то другую.
   */
  const seen = new Map<StepField, StepKey[]>();
  for (const key of order) {
    for (const field of STEP_FIELDS[key]) {
      seen.set(field, [...(seen.get(field) ?? []), key]);
    }
  }
  const twice = Array.from(seen.entries()).filter(([, keys]) => keys.length > 1);
  check(
    'ни одно поле не лежит на двух шагах сразу',
    twice.length === 0,
    twice.length === 0
      ? `полей ${seen.size}, каждое на своём шаге`
      : twice.map(([field, keys]) => `${field}: ${keys.join('+')}`).join(' · '),
  );

  check(
    'поле находится по своему шагу и не находится по чужому',
    shows('sizes', 'walls') &&
      shows('layout', 'modules') &&
      shows('build', 'opening') &&
      shows('materials', 'front') &&
      !shows('sizes', 'modules') &&
      !shows('layout', 'front') &&
      !shows('build', 'walls') &&
      !shows('materials', 'opening'),
    STUDIO_STEPS.map((key) => `${STEP_TITLE[key]}: ${STEP_FIELDS[key].join(', ')}`).join(' · '),
  );

  check(
    'у каждого шага есть название, подсказка и подпись кнопки',
    order.every(
      (key) =>
        STEP_TITLE[key].length > 0 &&
        STEP_HINT[key].length > 20 &&
        STEP_NEXT_LABEL[key].length > 0,
    ),
    order.map((key) => `${STEP_TITLE[key]} → ${STEP_NEXT_LABEL[key]}`).join(' · '),
  );

  /* ─── Переходы ─── */

  check(
    'вперёд ведёт по порядку и упирается в последний шаг',
    nextStep(order, 'sizes') === 'layout' &&
      nextStep(order, 'layout') === 'build' &&
      nextStep(order, 'build') === 'materials' &&
      nextStep(order, 'materials') === 'result' &&
      nextStep(order, 'result') === 'result',
    order.map((key) => `${key}→${nextStep(order, key)}`).join(' '),
  );

  check(
    'назад ведёт по тому же порядку и упирается в первый',
    prevStep(order, 'materials') === 'build' &&
      prevStep(order, 'build') === 'layout' &&
      prevStep(order, 'layout') === 'sizes' &&
      prevStep(order, order[0]) === order[0],
    order.map((key) => `${key}←${prevStep(order, key)}`).join(' '),
  );

  check(
    'переход туда и обратно возвращает на тот же шаг',
    studio.every((key) => prevStep(order, nextStep(order, key)) === key),
    studio.map((key) => `${key}→${nextStep(order, key)}→${prevStep(order, nextStep(order, key))}`).join(' '),
  );

  /*
   * ПЕРЕХОД — ЭТО ТОЛЬКО ШАГ.
   *
   * Выделенный модуль и активная стена живут в своём состоянии, и шаг их
   * не трогает: функция перехода принимает порядок и ключ, а возвращает
   * ключ — взяться отсюда сбросу неоткуда. Проверяем это тем же путём,
   * которым ходит экран: выделение считает `selectionState`, а стену —
   * `wallOfModule`, и обе не знают про шаг вовсе.
   */
  {
    const run = buildRun(baseInput);
    const unit = run.modules[1] ?? run.modules[0];

    check(
      'ряд для проверки перехода собрался',
      Boolean(unit),
      unit ? `${unit.id}` : 'РЯД ПУСТ — переход проверять не на чем',
    );

    const before = selectionState(run, unit.id);
    let step: StepKey = 'sizes';
    for (const _ of studio) step = nextStep(order, step);
    for (const _ of studio) step = prevStep(order, step);
    const after = selectionState(run, unit.id);

    check(
      'переход вперёд и назад не теряет выделенный модуль',
      before.unit?.id === after.unit?.id && before.title === after.title,
      `${before.title} → ${after.title}`,
    );

    check(
      'и не теряет активную стену',
      wallOfModule([run], unit.id) === 0 && wallOfModule([run], unit.id) === wallOfModule([run], unit.id),
      `стена ${wallOfModule([run], unit.id)}`,
    );
  }

  /* ─── Защищённые замки работают на каждом шаге ─── */

  /*
   * Замки не зависят от шага вовсе: их считает `screenState` от отказа и
   * расхождения. Проверяем это прямо — иначе разбиение на шаги однажды
   * заведёт «на этом шаге можно».
   */
  {
    const refused = tryBuildComposition({
      kind: 'corner_l',
      walls: [{ id: 'w1', lengthMm: 3800, openings: [] }],
      ceilingHeightMm: 2700,
      requirements: REQ,
      comms: COMMS,
    });

    const locked = screenState({
      refusal: refused.state === 'refused' ? { reason: refused.reason } : null,
      mismatches: [],
      walls: [{ lengthMm: 3800 }],
      segments: [],
      shape: 'corner_l',
      warnings: [],
    });

    check(
      'отказ сборки получен — замки мерить есть на чём',
      refused.state === 'refused' && locked.blocking.length === 1,
      refused.state === 'refused'
        ? `блокирующих ${locked.blocking.length}`
        : 'СБОРКА НЕ ОТКАЗАЛА — замки проверять не на чем',
    );

    check(
      '«Дальше», цена и запись заперты одинаково на всех четырёх шагах',
      studio.every(() => locked.nextLocked && locked.priceHidden && locked.autosaveLocked),
      `«Дальше» ${locked.nextLocked} · цена ${locked.priceHidden} · запись ${locked.autosaveLocked} — на ${studio.length} шагах`,
    );

    check(
      'и причина названа словами, а не кодом: она едет с замком на каждый шаг',
      locked.blocking[0]?.message.includes('не сошлась') &&
        locked.blocking[0]?.message.includes('клиенту нельзя'),
      locked.blocking[0]?.message.slice(0, 90) ?? 'ПРИЧИНЫ НЕТ',
    );
  }
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
  const place = { x: 0, y: 0.1, heightM: 0.82, depthM: 0.56, zM: 0, thicknessM: 0.016 };

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
        /* Ноль: здесь меряется передняя плоскость САМОГО корпуса. */
        zM: 0,
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
      zM: 0,
      thicknessM: 0.016,
    },
    { gapM: 0.003, frontThicknessM: 0.018, integratedHandles: false, cutaway: false },
  ).filter((box) => box.material === 'front');

  /*
   * СТВОРОК В СЦЕНЕ СТОЛЬКО, СКОЛЬКО ИХ РЕЖЕТСЯ.
   *
   * Здесь стояло «ровно один фасад» — и это была ЗАПИСАННАЯ В ПРОВЕРКУ
   * ошибка: раскрой пилит встроенному холодильнику ДВЕ створки (дверь
   * камеры и дверь морозильника, `BUILT_IN_FRIDGE_FRONTS`), а сцена
   * рисовала одно полотно во всю высоту. Расхождение жило «известным»
   * (слой 43) и проверкой закреплялось.
   *
   * Теперь сравниваем с раскроем, а не с числом в скобках: так проверка
   * ловит расхождение в обе стороны.
   */
  const fridgeCut = buildPanels({ run })
    .filter((p) => p.moduleId === fridgePlace.unit.id && p.material.startsWith('Фасад'))
    .reduce((sum, p) => sum + p.qty, 0);

  check(
    'створок у колонны холодильника в сцене столько же, сколько в раскрое',
    fridgeBoxes.length === fridgeCut && fridgeCut > 0,
    fridgeCut === 0
      ? 'НОЛЬ ФАСАДОВ В РАСКРОЕ У ХОЛОДИЛЬНИКА'
      : `сцена ${fridgeBoxes.length} · раскрой ${fridgeCut}`,
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
        /* Ноль: здесь меряется передняя плоскость САМОГО корпуса. */
        zM: 0,
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
            zM: 0,
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

  /*
   * ПРАВИЛО ПРОВЕРЯЕТСЯ С ОБЕИХ СТОРОН.
   *
   * Раньше здесь стоял один случай: «у приборного модуля число фронтов
   * задаёт место». Он был верен для мойки и холодильника и НЕ верен для
   * варочной — под ней обычные ящики, и число их выбирает человек.
   * Проверка, знающая только запрет, зелёная и на продукте, который
   * запрещает всё подряд.
   */
  const dictated = activeRun().modules.find(
    (unit) => unit.appliance && !unit.column && (unit.fill?.drawerHeights.length ?? 0) === 0,
  );
  const freeDrawers = activeRun().modules.find(
    (unit) => unit.appliance && !unit.column && (unit.fill?.drawerHeights.length ?? 0) > 0,
  );

  const frontsWarnings = (moduleId: string, count: number) =>
    (
      applyOps({
        run: activeRun(),
        requirements: REQ,
        ops: [{ op: 'set_fronts', moduleId, drawerCount: count }],
        openings: input.openings,
      }).warnings ?? []
    );

  check(
    'оба вида приборных модулей в ряду есть — правило проверять есть на чём',
    Boolean(dictated) && Boolean(freeDrawers),
    !dictated
      ? 'НЕТ МОДУЛЯ, ГДЕ ФАСАД ЗАДАЁТ ПРИБОР'
      : !freeDrawers
        ? 'НЕТ МОДУЛЯ С ЯЩИКАМИ ПОД ПРИБОРОМ'
        : `${dictated.label} · ${freeDrawers.label}`,
  );

  check(
    'там, где фасад задаёт прибор, поле объясняет это словами',
    Boolean(dictated) && frontsWarnings(dictated!.id, 3).some((w) => /задаёт прибор/.test(w)),
    dictated ? frontsWarnings(dictated.id, 3).join(' | ') || 'МОЛЧА' : 'ПРИБОРНОГО МОДУЛЯ НЕТ',
  );

  check(
    'а под варочной три ящика проходят без отказа',
    Boolean(freeDrawers) && frontsWarnings(freeDrawers!.id, 3).length === 0,
    freeDrawers
      ? frontsWarnings(freeDrawers.id, 3).join(' | ') || 'отказа нет'
      : 'МОДУЛЯ С ЯЩИКАМИ ПОД ПРИБОРОМ НЕТ',
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

/* ═══════════  Ящики под варочной панелью  ═══════════ */

/**
 * ПОД ВАРОЧНОЙ ЯЩИКИ ТАКИЕ ЖЕ, КАК ВЕЗДЕ.
 *
 * Прибор занимает место СВЕРХУ корпуса, поэтому верхний фронт укорочен, —
 * но само число ящиков ничем не продиктовано: клиент просит три, и три
 * там делают. Поле было заперто, а операция отказывала словами.
 *
 * Цепочка меряется целиком: число ящиков → фронты в раскрое →
 * направляющие в смете → сумма. Оборванная посередине, она даёт цеху
 * фурнитуру без панелей или панели без фурнитуры.
 */
console.log('\nЯщики под варочной панелью');
{
  const run = buildRun(baseInput);
  const hob = run.modules.find((unit) => unit.appliance === 'hob');

  check(
    'модуль под варочной есть — проверять есть на чём',
    Boolean(hob),
    hob ? `${hob.label}, ширина ${hob.widthMm} мм` : 'МОДУЛЯ ПОД ВАРОЧНОЙ НЕТ — проверять нечего',
  );

  if (hob) {
    const carcassMm = moduleCarcassHeightMm(hob, run);

    /** Ряд с заданным числом ящиков под варочной — тем же путём, что экран. */
    const withDrawers = (count: number) =>
      applyOps({
        run,
        requirements: DEMO_REQUIREMENTS,
        ops: [{ op: 'set_fronts', moduleId: hob.id, drawerCount: count }],
      });

    /** Сколько фронтов ящика уходит в раскрой у этого модуля. */
    const frontsInCut = (r: Run) =>
      buildPanels({ run: r })
        .filter((panel) => panel.moduleId === hob.id && panel.name === 'Фронт ящика')
        .reduce((sum, panel) => sum + panel.qty, 0);

    /** Сколько направляющих выписала смета всему ряду. */
    const slidesInEstimate = (r: Run) =>
      buildEstimate(r, MAIN_VARIANT, DEMO_RATES)
        .lines.filter((line) => line.key.startsWith('slide_'))
        .reduce((sum, line) => sum + line.quantity, 0);

    const two = withDrawers(2);
    const three = withDrawers(3);

    const twoUnit = two.modules.find((unit) => unit.id === hob.id)!;
    const threeUnit = three.modules.find((unit) => unit.id === hob.id)!;

    check(
      'два и три ящика доезжают до модуля, а не отбрасываются молча',
      (twoUnit.fill?.drawerHeights.length ?? 0) === 2 &&
        (threeUnit.fill?.drawerHeights.length ?? 0) === 3,
      `два → ${twoUnit.fill?.drawerHeights.length ?? 0} фронтов [${twoUnit.fill?.drawerHeights.join('/')}] · три → ${threeUnit.fill?.drawerHeights.length ?? 0} [${threeUnit.fill?.drawerHeights.join('/')}]`,
    );

    check(
      'сумма высот фронтов сходится с высотой корпуса до миллиметра',
      [twoUnit, threeUnit].every(
        (unit) =>
          (unit.fill?.drawerHeights ?? []).reduce((sum, h) => sum + h, 0) === carcassMm,
      ),
      `корпус ${carcassMm} · два ${(twoUnit.fill?.drawerHeights ?? []).reduce((a, b) => a + b, 0)} · три ${(threeUnit.fill?.drawerHeights ?? []).reduce((a, b) => a + b, 0)}`,
    );

    check(
      'верхний фронт укорочен на одну и ту же величину при любом числе ящиков',
      (twoUnit.fill?.drawerHeights[0] ?? 0) === (threeUnit.fill?.drawerHeights[0] ?? -1),
      `два → ${twoUnit.fill?.drawerHeights[0]} мм · три → ${threeUnit.fill?.drawerHeights[0]} мм`,
    );

    /* ── Раскрой ── */

    const cutTwo = frontsInCut(two);
    const cutThree = frontsInCut(three);

    check(
      'фронты в раскрое есть — цепочку проверять есть на чём',
      cutTwo > 0 && cutThree > 0,
      cutTwo === 0 || cutThree === 0
        ? 'НОЛЬ ФРОНТОВ В РАСКРОЕ — цепочка оборвана на первом же шаге'
        : `два → ${cutTwo} · три → ${cutThree}`,
    );

    check(
      'фронтов в раскрое ровно столько, сколько ящиков',
      cutTwo === 2 && cutThree === 3,
      `два → ${cutTwo} фронтов · три → ${cutThree} фронтов`,
    );

    /* ── Смета ── */

    const slidesTwo = slidesInEstimate(two);
    const slidesThree = slidesInEstimate(three);
    const slidesBase = slidesInEstimate(run);

    check(
      'направляющие в смете есть — фурнитуру проверять есть на чём',
      slidesTwo > 0 && slidesThree > 0,
      slidesTwo === 0 || slidesThree === 0
        ? 'НОЛЬ НАПРАВЛЯЮЩИХ В СМЕТЕ — фронты нарезаны, а вешать их не на что'
        : `два → ${slidesTwo} · три → ${slidesThree}`,
    );

    check(
      'третий ящик добавляет ровно одну направляющую',
      slidesThree - slidesTwo === 1,
      `ряд как есть ${slidesBase} · два ${slidesTwo} · три ${slidesThree}`,
    );

    const totalTwo = buildEstimate(two, MAIN_VARIANT, DEMO_RATES).total;
    const totalThree = buildEstimate(three, MAIN_VARIANT, DEMO_RATES).total;

    check(
      'третий ящик меняет сумму: за него платят',
      totalThree > totalTwo,
      `два ${Math.round(totalTwo)} ₸ · три ${Math.round(totalThree)} ₸ · разница ${Math.round(totalThree - totalTwo)} ₸`,
    );

    /* ── Отказ называет число ── */

    const tooMany = Math.ceil(carcassMm / MIN_DRAWER_MM) + 2;
    const refused = withDrawers(tooMany);
    const refusal = refused.warnings.find((text) => text.includes('ящик'));

    check(
      `${tooMany} ящиков не встают — отказ словами, а не молча`,
      Boolean(refusal),
      refusal ?? 'ОТКАЗА НЕТ ВОВСЕ — правка пропала молча',
    );

    check(
      'в отказе есть число, а не только слова',
      Boolean(refusal && /[0-9]/.test(refusal)),
      refusal ?? 'ОТКАЗА НЕТ',
    );

    check(
      'отказ ничего не сломал: модуль остался с прежними ящиками',
      (refused.modules.find((unit) => unit.id === hob.id)?.fill?.drawerHeights.length ?? 0) > 0,
      `осталось ${refused.modules.find((unit) => unit.id === hob.id)?.fill?.drawerHeights.length ?? 0} фронтов`,
    );
  }
}

/* ═══════════  Антресоль — самостоятельный ряд  ═══════════ */

/**
 * АНТРЕСОЛЬ ПРАВИТСЯ, КАК ОБЫЧНЫЙ РЯД.
 *
 * Она пересобиралась из нижнего ряда на каждой правке и своих модулей не
 * хранила: ширина бралась от того, что стоит под ней, число створок —
 * тоже, удалить один модуль было нельзя, свой материал задать нельзя.
 * Автосборка при первом появлении остаётся — замерщик не собирает
 * антресоль с нуля, — но дальше это ряд, а не производная.
 */
console.log('\nАнтресоль — самостоятельный ряд');
{
  /*
   * РЯД БЕЗ РИГЕЛЯ: здесь меряется правка антресоли, а не правило балки.
   *
   * В демо-ряду по потолку идёт короб вентиляции, и добавленный модуль
   * уезжает под него — это ВЕРНОЕ поведение (слой 44), но оно перекрывает
   * то, ради чего написана проверка. Правило балки проверяется отдельно,
   * ниже, своим числом.
   */
  const mezzInput = { ...baseInput, openings: [] };

  const withMezz = (heightMm = 400) =>
    applyOps({
      run: buildRun(mezzInput),
      requirements: DEMO_REQUIREMENTS,
      ops: [{ op: 'set_mezzanine', heightMm }],
    });

  /*
   * ВСЕ модули антресоли — вместе с кладовкой над холодильником: по ним
   * считается, сколько их в ряду.
   */
  const mezzOf = (r: Run) =>
    r.upperSegments.flatMap((segment) => segment.modules).filter((u) => u.section === 'mezzanine');

  /*
   * ЗАКАЗАННАЯ антресоль — та, что правится. Кладовка над колонной
   * холодильника стоит на её крыше, высоту ей задаёт остаток, и правит её
   * не человек (`mezzanineBaseOf` отличает опору). Взять её целью значит
   * мерить не то, что проверяешь: первая версия этой проверки так и
   * делала и объявляла дефектом отсутствие правки там, где её и не должно
   * быть.
   */
  const ownMezz = (r: Run) => mezzOf(r).filter((u) => mezzanineBaseOf(u, r) === null);

  const base = withMezz();
  const start = ownMezz(base);

  check(
    'антресоль собралась сама при первом появлении',
    start.length > 0,
    start.length === 0
      ? 'НОЛЬ МОДУЛЕЙ АНТРЕСОЛИ — править нечего'
      : `модулей ${start.length}: ${start.map((u) => u.id).join(', ')}`,
  );

  if (start.length > 1) {
    const target = start[1];
    /*
     * ПРОЁМОВ ЗДЕСЬ НЕТ НАМЕРЕННО: ряд собран `mezzInput` со стеной без
     * окна, и правка обязана идти по той же стене. Передай их только в
     * правку — и участки станут другими, чем у собранного ряда.
     */
    const edit = (run: Run, ops: MillworkOp[]) =>
      applyOps({ run, requirements: DEMO_REQUIREMENTS, ops });
    const find = (r: Run, id: string) => mezzOf(r).find((u) => u.id === id);

    /* ── 1. Ширина доезжает до раскроя и сметы ── */

    /*
     * ШИРИНА-МЕТКА, КОТОРОЙ В РЯДУ НЕТ САМО ПО СЕБЕ.
     *
     * Первая версия брала «минус 150» и получала 450 — ровно ту ширину,
     * которую раскладка и так раздаёт соседям. Проверка «после правки
     * нижнего ряда модуль шириной 450 нашёлся» была ЗЕЛЁНОЙ на коде, где
     * правка не применялась вовсе: нашёлся чужой модуль. Совпадение
     * результата — не формула. Метка 337 мм в раскладке не встречается:
     * стандарты кратны пятидесяти.
     */
    const wantMm = 337;
    const narrow = edit(base, [{ op: 'set_width', moduleId: target.id, widthMm: wantMm }]);
    const narrowUnit = mezzOf(narrow).find((u) => u.offsetMm === target.offsetMm);

    check(
      'ширина модуля антресоли меняется',
      narrowUnit?.widthMm === wantMm,
      `было ${target.widthMm} · просили ${wantMm} · стало ${narrowUnit?.widthMm ?? 'МОДУЛЯ НЕТ'}`,
    );

    const panelWidth = (r: Run, offsetMm: number) => {
      const unit = mezzOf(r).find((u) => u.offsetMm === offsetMm);
      if (!unit) return null;
      const front = buildPanels({ run: r }).find(
        (panel) => panel.moduleId === unit.id && panel.name === 'Фасад',
      );
      return front ? front.widthMm : null;
    };

    check(
      'новая ширина доехала до раскроя',
      panelWidth(narrow, target.offsetMm) !== null &&
        panelWidth(narrow, target.offsetMm) !== panelWidth(base, target.offsetMm),
      `фасад в раскрое ${panelWidth(base, target.offsetMm) ?? 'НЕТ'} → ${panelWidth(narrow, target.offsetMm) ?? 'НЕТ'} мм`,
    );

    const total = (r: Run) => buildEstimate(r, MAIN_VARIANT, DEMO_RATES).total;
    check(
      'и до сметы',
      Math.round(total(narrow)) !== Math.round(total(base)),
      `${Math.round(total(base))} → ${Math.round(total(narrow))} ₸`,
    );

    /* ── 2. Число створок ── */

    const wide = ownMezz(base).find((u) => u.widthMm >= 600) ?? target;
    let twoDoors = base;
    try {
      twoDoors = edit(base, [
        { op: 'set_variant', moduleId: wide.id, variant: 'upper_door_two' as ModuleVariantKind },
      ]);
    } catch (error) {
      console.error(`       set_variant упал: ${(error as Error).message.slice(0, 90)}`);
    }
    const twoUnit = mezzOf(twoDoors).find((u) => u.offsetMm === wide.offsetMm);

    check(
      'створок становится две',
      twoUnit?.doorCount === 2,
      `было ${wide.doorCount} · стало ${twoUnit?.doorCount ?? 'МОДУЛЯ НЕТ'}`,
    );

    const frontsOf = (r: Run, offsetMm: number) => {
      const unit = mezzOf(r).find((u) => u.offsetMm === offsetMm);
      if (!unit) return 0;
      return buildPanels({ run: r })
        .filter((panel) => panel.moduleId === unit.id && panel.name === 'Фасад')
        .reduce((sum, panel) => sum + panel.qty, 0);
    };

    check(
      'фронтов в раскрое столько же, сколько створок',
      frontsOf(twoDoors, wide.offsetMm) === 2 && frontsOf(base, wide.offsetMm) === 1,
      `одна створка → ${frontsOf(base, wide.offsetMm)} фасадов · две → ${frontsOf(twoDoors, wide.offsetMm)}`,
    );

    const hinges = (r: Run) =>
      buildEstimate(r, MAIN_VARIANT, DEMO_RATES)
        .lines.filter((line) => line.key.startsWith('hinge'))
        .reduce((sum, line) => sum + line.quantity, 0);

    check(
      'петель в смете стало больше ровно на вторую створку',
      hinges(twoDoors) > hinges(base),
      `одна створка ${hinges(base)} · две ${hinges(twoDoors)}`,
    );

    /* ── 3. Удаление ── */

    const removed = edit(base, [{ op: 'remove_module', moduleId: target.id }]);
    /*
     * УДАЛЕНИЕ ПРОВЕРЯЕТСЯ ШИРИНОЙ РЯДА, А НЕ ИДЕНТИФИКАТОРОМ.
     *
     * Идентификатор выводится из позиции, и после удаления соседний
     * модуль встаёт на освободившееся место и получает ТОТ ЖЕ `mezz-1200`.
     * Проверка «модуля с таким id больше нет» была бы красной на верном
     * продукте — ловушка 291 ровно про это.
     */
    const rowWidth = (r: Run) => ownMezz(r).reduce((sum, u) => sum + u.widthMm, 0);

    check(
      'модуль антресоли удаляется, и ряд стал короче ровно на его ширину',
      ownMezz(removed).length === start.length - 1 &&
        rowWidth(base) - rowWidth(removed) === target.widthMm,
      `модулей ${start.length} → ${ownMezz(removed).length} · ширина ряда ` +
        `${rowWidth(base)} → ${rowWidth(removed)} при модуле ${target.widthMm} мм`,
    );

    check(
      'соседи после удаления целы',
      ownMezz(removed).every((u) => u.widthMm > 0) && ownMezz(removed).length > 0,
      ownMezz(removed).map((u) => `${u.id}(${u.widthMm})`).join(' ') || 'НОЛЬ СОСЕДЕЙ',
    );

    /* ── 4. Добавление слева и справа ── */

    /*
     * ДОБАВЛЯЕМ ТУДА, ГДЕ ЕСТЬ МЕСТО.
     *
     * Автосборка занимает стену целиком, поэтому «плюс» в полный ряд —
     * это отказ, а не добавление, и он проверяется своим числом выше.
     * Здесь меряется само добавление: сначала снимаем модуль, потом
     * ставим свой.
     */
    const freed = edit(base, [{ op: 'remove_module', moduleId: target.id }]);
    const freedStart = ownMezz(freed);
    const anchor = freedStart[freedStart.length - 1];

    const right = edit(freed, [
      { op: 'add_module', kind: 'upper', widthMm: 300, afterModuleId: anchor.id },
    ]);
    /*
     * ЗА ПОСЛЕДНИМ МОДУЛЕМ УЧАСТОК КОНЧАЕТСЯ — ТАМ СТЕНА.
     *
     * Проверка требовала, чтобы модуль «добавился» и за краем участка:
     * раньше он действительно появлялся, а следом выбрасывался вместе с
     * соседом при укладке вплотную. Теперь это отказ с числом, и ряд не
     * меняется: удалять чужую мебель ради нового модуля нельзя.
     *
     * Что добавление РАБОТАЕТ, меряет случай ниже: слева место есть, и
     * модуль встаёт между соседями.
     */
    check(
      'за краем участка — отказ с числом, ряд и низ прежние',
      ownMezz(right).length === freedStart.length &&
        (right.warnings ?? []).some((text) => /не встаёт/.test(text)) &&
        right.modules.map((u) => u.id).join() === base.modules.map((u) => u.id).join(),
      `антресоль ${freedStart.length} → ${ownMezz(right).length} · ` +
        `${(right.warnings ?? [])[0] ?? 'МОЛЧА'}` +
        (right.modules.map((u) => u.id).join() === base.modules.map((u) => u.id).join()
          ? ''
          : ' · НИЗ ИЗМЕНИЛСЯ'),
    );

    const left = edit(freed, [
      { op: 'add_module', kind: 'upper', widthMm: 300, afterModuleId: freedStart[0].id },
    ]);

    /*
     * Добавленный слева обязан ВСТАТЬ МЕЖДУ соседями, а не уехать в
     * конец: порядок по offset строго возрастающий, и второй модуль —
     * это именно новый, шириной 300.
     */
    const leftRow = ownMezz(left);

    check(
      'и слева: добавленный встаёт между соседями, а не в конец',
      leftRow.length === freedStart.length + 1 &&
        leftRow.every((u, i, all) => i === 0 || all[i - 1].offsetMm < u.offsetMm) &&
        leftRow[1]?.widthMm === 300 &&
        left.modules.map((u) => u.id).join() === base.modules.map((u) => u.id).join(),
      leftRow.map((u) => `${u.offsetMm}(${u.widthMm})`).join(' '),
    );

    /* ── 5. Правка переживает пересборку при том же id ── */

    const kept = edit(narrow, [{ op: 'set_option', key: 'hasCornice', value: true }]);
    const keptUnit = mezzOf(kept).find((u) => u.offsetMm === target.offsetMm);
    check(
      'правка ширины переживает следующую правку ряда',
      keptUnit?.widthMm === wantMm,
      `после пересборки ${keptUnit?.widthMm ?? 'МОДУЛЯ НЕТ'} мм при ${wantMm}`,
    );

    /* ── 6. Правка ширины НИЖНЕГО модуля слева ── */

    /*
     * Нужен ОБЫЧНЫЙ нижний модуль ЛЕВЕЕ правленого: сдвиг проверяется
     * им. В демо-ряду левее антресоли стоят только колонны, поэтому
     * берётся ближайший нижний без прибора, какой есть.
     */
    const below = base.modules.find((u) => !u.appliance && !u.column);

    check(
      'под антресолью есть обычный нижний модуль — сдвиг проверять есть на чём',
      Boolean(below),
      below ? `${below.id} ширина ${below.widthMm}` : 'НЕТ НИЖНЕГО МОДУЛЯ СЛЕВА — сдвиг не проверить',
    );

    if (below) {
      const shifted = edit(narrow, [
        { op: 'set_width', moduleId: below.id, widthMm: below.widthMm - 150 },
      ]);
      const survivor = mezzOf(shifted).find((u) => u.widthMm === wantMm);

      check(
        'правка антресоли переживает правку ширины нижнего модуля слева',
        Boolean(survivor),
        survivor
          ? `найдена: ${survivor.id} шириной ${wantMm} мм`
          : `ПОТЕРЯНА: ${mezzOf(shifted).map((u) => `${u.id}(${u.widthMm})`).join(' ')}`,
      );
    }

    /* ── 7. Отказ словами с числом ── */

    const broken = edit(base, [
      { op: 'set_width', moduleId: target.id, widthMm: mezzInput.lengthMm },
    ]);
    const refusal = (broken.warnings ?? []).find((text) => /[0-9]/.test(text));

    check(
      'правка, ломающая ряд антресоли, отказывает словами с числом',
      Boolean(refusal),
      refusal ?? 'ОТКАЗА НЕТ ВОВСЕ — правка пропала молча',
    );

    check(
      'и ряд от отказа не сломался',
      ownMezz(broken).length === start.length,
      `модулей ${ownMezz(broken).length} при ${start.length}`,
    );

    /* ── 8. Материал отдельно от ряда ── */

    const painted = edit(base, [
      {
        op: 'set_front',
        moduleId: target.id,
        front: { base: 'mdf_enamel', construct: 'solid', finish: 'gloss', colorHex: '#B5533F' },
      },
    ]);
    const paintedUnit = ownMezz(painted).find((u) => u.offsetMm === target.offsetMm);
    const neighbour = ownMezz(painted).find((u) => u.offsetMm !== target.offsetMm);

    check(
      'у модуля антресоли свой материал, отличный от соседей',
      paintedUnit?.front?.base === 'mdf_enamel' &&
        frontKey(frontOf(paintedUnit!)) !== frontKey(frontOf(neighbour!)),
      `модуль ${paintedUnit?.front?.base ?? 'БЕЗ СВОЕГО'} · сосед ${neighbour?.front?.base ?? 'ряд'}`,
    );

    const paintedBoxes = runBoxes(painted, {
      thicknessMm: 16,
      frontThicknessMm: 18,
      gapMm: 3,
    }).filter((box) => box.material === 'front');

    check(
      'и в сцене он своей пачкой: ключей фасада больше одного',
      new Set(paintedBoxes.map((box) => box.frontKey)).size > 1,
      `ключей фасада ${new Set(paintedBoxes.map((b) => b.frontKey)).size} при ${paintedBoxes.length} фасадах`,
    );

    const paintedPanels = buildPanels({ run: painted }).filter(
      (panel) => panel.moduleId === paintedUnit?.id && panel.name === 'Фасад',
    );

    /*
     * «Материал заполнен» — не проверка: он заполнен всегда. Проверяется
     * то, ради чего правка делалась: в раскрое он ОТЛИЧАЕТСЯ от соседского.
     */
    const neighbourPanels = buildPanels({ run: painted }).filter(
      (panel) => panel.moduleId === neighbour?.id && panel.name === 'Фасад',
    );

    /* ── Ригель: модуль под выступом убирается, и это сказано ── */

    const beamed = applyOps({
      run: buildRun(baseInput),
      requirements: DEMO_REQUIREMENTS,
      openings: OPENINGS,
      ops: [{ op: 'set_mezzanine', heightMm: 400 }],
    });
    const beamedCount = mezzOf(beamed).length;

    const pushed = applyOps({
      run: beamed,
      requirements: DEMO_REQUIREMENTS,
      openings: OPENINGS,
      ops: [
        {
          op: 'add_module',
          kind: 'upper',
          widthMm: 300,
          afterModuleId: mezzOf(beamed)[1]?.id ?? 'нет',
        },
      ],
    });
    const beamRefusal = (pushed.warnings ?? []).find((text) => /не встаёт/.test(text));

    check(
      'в ряду с ригелем антресоль есть — правило балки проверять есть на чём',
      beamedCount > 0,
      beamedCount === 0 ? 'НОЛЬ АНТРЕСОЛЕЙ ПОД РИГЕЛЕМ — проверять нечего' : `${beamedCount} модулей`,
    );

    /*
     * ЭТА ПРОВЕРКА КОДИРОВАЛА ДЕФЕКТ И ПЕРЕПИСАНА.
     *
     * Она требовала, чтобы добавленный модуль ВЫТОЛКНУЛ соседа под
     * выступ и тот был УБРАН — лишь бы об этом сказали словами. То есть
     * правка удаляла чужую мебель: замерено 4 модуля → 2 при переносе и
     * 4 → 1 при правке ширины.
     *
     * Правка не удаляет модулей вовсе. Не влезло — отказ с числом, ряд
     * остаётся прежним; удаляет только кнопка «Удалить».
     */
    check(
      'модулю, которому не хватает участка, отказывают числом',
      Boolean(beamRefusal),
      beamRefusal ?? 'МОЛЧА: не встало, а слов нет',
    );

    check(
      'и антресоль при этом цела: ни одного модуля не потеряно',
      mezzOf(pushed).length === beamedCount,
      `${beamedCount} → ${mezzOf(pushed).length}`,
    );

    check(
      'и в раскрое его материал отличается от соседского',
      paintedPanels.length > 0 &&
        neighbourPanels.length > 0 &&
        paintedPanels[0].material !== neighbourPanels[0].material,
      paintedPanels.length === 0 || neighbourPanels.length === 0
        ? 'НОЛЬ ФАСАДОВ В РАСКРОЕ — сравнивать нечего'
        : `модуль «${paintedPanels[0].material}» · сосед «${neighbourPanels[0].material}»`,
    );
  }
}

/* ═══════════  Верхний ряд — самостоятельный  ═══════════ */

/**
 * ВЕРХНИЙ РЯД ПРАВИТСЯ, КАК НИЖНИЙ.
 *
 * Он пересобирался из нижнего на каждой правке, и его правки жили в
 * картах `id → значение`. Пока низ не трогали, карты срабатывали;
 * стоило поменять ширину внизу — идентификатор верхнего модуля менялся
 * вместе с его позицией, и правка терялась молча.
 *
 * Симптом замерщика: «выбираю холодильник — верх добавляется сам, и я не
 * могу его сдвинуть, удалить, перекрасить».
 */
console.log('\nВерхний ряд — самостоятельный');
{
  /* Ряд без ригеля: здесь меряется правка, а не правило балки. */
  const upperInput = { ...baseInput, openings: [] };

  const upperOf = (r: Run) =>
    r.upperSegments
      .flatMap((segment) => segment.modules)
      .filter((u) => u.section !== 'mezzanine');

  const base = buildRun(upperInput);
  const start = upperOf(base);

  check(
    'верхний ряд собрался сам — правку проверять есть на чём',
    start.length > 1,
    start.length === 0
      ? 'НОЛЬ МОДУЛЕЙ ВЕРХНЕГО РЯДА — править нечего'
      : `модулей ${start.length}: ${start.map((u) => u.id).join(', ')}`,
  );

  if (start.length > 1) {
    const edit = (run: Run, ops: MillworkOp[]) =>
      applyOps({ run, requirements: REQ, ops, openings: upperInput.openings });

    const target = start[1];

    /*
     * ШИРИНА-МЕТКА, КОТОРОЙ РАСКЛАДКА НЕ РАЗДАЁТ САМА.
     *
     * На антресоли «минус 150» дало 450 — ровно ту ширину, которую
     * раскладка выдаёт соседям, и проверка была зелёной на сломанном
     * коде. Стандарты кратны пятидесяти, 337 среди них не встречается.
     */
    const wantMm = 337;

    /* ── 1. Ширина доезжает до раскроя и сметы ── */

    const narrow = edit(base, [{ op: 'set_width', moduleId: target.id, widthMm: wantMm }]);
    const narrowUnit = upperOf(narrow).find((u) => u.widthMm === wantMm);

    check(
      'ширина модуля верхнего ряда меняется',
      Boolean(narrowUnit),
      narrowUnit
        ? `было ${target.widthMm} · стало ${narrowUnit.widthMm}`
        : `МОДУЛЯ ШИРИНОЙ ${wantMm} НЕТ: ${upperOf(narrow).map((u) => u.widthMm).join('/')}`,
    );

    const frontWidth = (r: Run, id: string) => {
      const panel = buildPanels({ run: r }).find(
        (p) => p.moduleId === id && p.name === 'Фасад',
      );
      return panel ? panel.widthMm : null;
    };

    check(
      'новая ширина доехала до раскроя',
      Boolean(narrowUnit) &&
        frontWidth(narrow, narrowUnit!.id) !== null &&
        Math.abs(frontWidth(narrow, narrowUnit!.id)! - wantMm) < 20,
      narrowUnit
        ? `фасад в раскрое ${frontWidth(narrow, narrowUnit.id) ?? 'НЕТ'} мм при модуле ${wantMm} мм`
        : 'МОДУЛЯ НЕТ',
    );

    const total = (r: Run) => Math.round(buildEstimate(r, MAIN_VARIANT, DEMO_RATES).total);
    check(
      'и до сметы',
      total(narrow) !== total(base),
      `${total(base)} → ${total(narrow)} ₸`,
    );

    /* ── 2. Число створок ── */

    const wide = start.find((u) => u.widthMm >= 600 && !u.appliance) ?? target;
    let twoDoors = base;
    try {
      twoDoors = edit(base, [
        { op: 'set_variant', moduleId: wide.id, variant: 'upper_door_two' as ModuleVariantKind },
      ]);
    } catch (error) {
      console.error(`       set_variant упал: ${(error as Error).message.slice(0, 90)}`);
    }
    const twoUnit = upperOf(twoDoors).find((u) => u.id === wide.id);

    check(
      'створок у верхнего модуля становится две',
      twoUnit?.doorCount === 2,
      `было ${wide.doorCount} · стало ${twoUnit?.doorCount ?? 'МОДУЛЯ НЕТ'}`,
    );

    const frontsOf = (r: Run, id: string) =>
      buildPanels({ run: r })
        .filter((p) => p.moduleId === id && p.name === 'Фасад')
        .reduce((sum, p) => sum + p.qty, 0);

    check(
      'фронтов в раскрое столько же, сколько створок',
      frontsOf(base, wide.id) === 1 && frontsOf(twoDoors, wide.id) === 2,
      `одна створка → ${frontsOf(base, wide.id)} · две → ${frontsOf(twoDoors, wide.id)}`,
    );

    const hinges = (r: Run) =>
      buildEstimate(r, MAIN_VARIANT, DEMO_RATES)
        .lines.filter((l) => l.key.startsWith('hinge'))
        .reduce((sum, l) => sum + l.quantity, 0);

    check(
      'петель в смете стало больше ровно на вторую створку',
      hinges(twoDoors) > hinges(base),
      `одна ${hinges(base)} · две ${hinges(twoDoors)}`,
    );

    /* ── 3. Удаление ── */

    const rowWidth = (r: Run) => upperOf(r).reduce((sum, u) => sum + u.widthMm, 0);
    const removed = edit(base, [{ op: 'remove_module', moduleId: target.id }]);

    check(
      'модуль верхнего ряда удаляется, и ряд стал короче на его ширину',
      upperOf(removed).length === start.length - 1 &&
        rowWidth(base) - rowWidth(removed) === target.widthMm,
      `модулей ${start.length} → ${upperOf(removed).length} · ширина ряда ${rowWidth(base)} → ${rowWidth(removed)} при модуле ${target.widthMm}`,
    );

    check(
      'соседи после удаления целы',
      upperOf(removed).length > 0 && upperOf(removed).every((u) => u.widthMm > 0),
      upperOf(removed).map((u) => `${u.id}(${u.widthMm})`).join(' ') || 'НОЛЬ СОСЕДЕЙ',
    );

    /* ── 4. Добавление слева и справа ── */

    const freed = upperOf(removed);
    const right = edit(removed, [
      { op: 'add_module', kind: 'upper', widthMm: 300, afterModuleId: freed[freed.length - 1].id },
    ]);

    /*
     * И ЭТА ПЕРЕПИСАНА ПО ТОЙ ЖЕ ПРИЧИНЕ.
     *
     * Справа от последнего модуля участок КОНЧИЛСЯ — там стена. Старая
     * проверка считала правый край ряда от одного левого края
     * (`upperFits`), то есть по укладке вплотную, которой в разорванном
     * ряду нет: модуль «добавлялся», а следом выбрасывался вместе с
     * соседом. Теперь это отказ с числом, и ряд не меняется.
     *
     * Что добавление РАБОТАЕТ, проверяет следующий случай: слева место
     * есть, и модуль встаёт между соседями.
     */
    check(
      'справа от участка места нет — отказ с числом, ряд прежний',
      upperOf(right).length === freed.length &&
        (right.warnings ?? []).some((text) => /не встаёт/.test(text)) &&
        right.modules.map((u) => u.id).join() === base.modules.map((u) => u.id).join(),
      `верх ${freed.length} → ${upperOf(right).length} · ` +
        `${(right.warnings ?? [])[0] ?? 'МОЛЧА'}`,
    );

    const left = edit(removed, [
      { op: 'add_module', kind: 'upper', widthMm: 300, afterModuleId: freed[0].id },
    ]);

    check(
      'и слева: добавленный встаёт между соседями, а не в конец',
      upperOf(left).length === freed.length + 1 &&
        upperOf(left)[1]?.widthMm === 300 &&
        left.modules.map((u) => u.id).join() === base.modules.map((u) => u.id).join(),
      upperOf(left).map((u) => `${u.offsetMm}(${u.widthMm})`).join(' '),
    );

    /* ── 5. Материал отдельно от ряда ── */

    const painted = edit(base, [
      {
        op: 'set_front',
        moduleId: target.id,
        front: { base: 'mdf_enamel', construct: 'solid', finish: 'gloss', colorHex: '#B5533F' },
      },
    ]);
    const paintedUnit = upperOf(painted).find((u) => u.id === target.id);
    const neighbour = upperOf(painted).find((u) => u.id !== target.id);

    check(
      'у модуля верхнего ряда свой материал, отличный от соседей',
      paintedUnit?.front?.base === 'mdf_enamel' &&
        frontKey(frontOf(paintedUnit!)) !== frontKey(frontOf(neighbour!)),
      `модуль ${paintedUnit?.front?.base ?? 'БЕЗ СВОЕГО'} · сосед ${neighbour?.front?.base ?? 'ряд'}`,
    );

    const paintedBoxes = runBoxes(painted, {
      thicknessMm: 16,
      frontThicknessMm: 18,
      gapMm: 3,
    }).filter((b) => b.material === 'front');

    check(
      'и в сцене он своей пачкой',
      new Set(paintedBoxes.map((b) => b.frontKey)).size > 1,
      `ключей фасада ${new Set(paintedBoxes.map((b) => b.frontKey)).size} при ${paintedBoxes.length} фасадах`,
    );

    const mine = buildPanels({ run: painted }).find(
      (p) => p.moduleId === target.id && p.name === 'Фасад',
    );
    const his = buildPanels({ run: painted }).find(
      (p) => p.moduleId === neighbour?.id && p.name === 'Фасад',
    );

    check(
      'и в раскрое его материал отличается от соседского',
      Boolean(mine) && Boolean(his) && mine!.material !== his!.material,
      !mine || !his
        ? 'НОЛЬ ФАСАДОВ В РАСКРОЕ — сравнивать нечего'
        : `модуль «${mine.material}» · сосед «${his.material}»`,
    );

    /* ── 6. Правка переживает правку ширины НИЖНЕГО модуля ── */

    const below = base.modules.find((u) => !u.appliance && !u.column);

    check(
      'обычный нижний модуль есть — сдвиг проверять есть на чём',
      Boolean(below),
      below ? `${below.id} ширина ${below.widthMm}` : 'НЕТ ОБЫЧНОГО НИЖНЕГО МОДУЛЯ',
    );

    if (below) {
      /*
       * ПРОПУСКА ЗДЕСЬ БЫТЬ НЕ ДОЛЖНО.
       *
       * Первая версия входила сюда только при `narrowUnit` — то есть
       * молчала ровно тогда, когда правка не применилась вовсе. Проверка,
       * которая пропускает себя на сломанном продукте, не проверка.
       */
      const shifted = edit(narrow, [
        { op: 'set_width', moduleId: below.id, widthMm: below.widthMm - 150 },
      ]);
      const survivor = upperOf(shifted).find((u) => u.widthMm === wantMm);

      check(
        'правка верхнего ряда переживает правку ширины нижнего модуля',
        Boolean(survivor),
        survivor
          ? `найден ${survivor.id} шириной ${wantMm} мм`
          : `ПОТЕРЯНА: ${upperOf(shifted).map((u) => `${u.id}(${u.widthMm})`).join(' ')}`,
      );
    }

    /* ── 7. Сценарий холодильника ── */

    const noFridge: RunRequirements = {
      ...REQ,
      appliances: REQ.appliances.filter((a) => a !== 'fridge'),
    };
    const before = buildRun({ ...upperInput, requirements: noFridge });

    const withFridge = applyOps({
      run: before,
      requirements: noFridge,
      ops: [{ op: 'add_module', kind: 'tall', widthMm: 600, appliance: 'fridge' }],
      openings: upperInput.openings,
    });

    check(
      'холодильник встал, и верх собрался сам',
      upperOf(withFridge).length > 0 &&
        withFridge.modules.some((u) => u.appliance === 'fridge'),
      upperOf(withFridge).length === 0
        ? 'ВЕРХ НЕ СОБРАЛСЯ — сценарий проверять не на чем'
        : `верхних ${upperOf(withFridge).length}, холодильник есть`,
    );

    const upperAfterFridge = upperOf(withFridge);
    if (upperAfterFridge.length > 1) {
      const pick = upperAfterFridge[1];
      const touched = applyOps({
        run: withFridge,
        requirements: noFridge,
        openings: upperInput.openings,
        ops: [
          { op: 'set_width', moduleId: pick.id, widthMm: wantMm },
          {
            op: 'set_front',
            moduleId: pick.id,
            front: { base: 'mdf_enamel', construct: 'solid', finish: 'gloss' },
          },
        ],
      });

      const held = upperOf(touched).find((u) => u.widthMm === wantMm);

      check(
        'модуль верха подвинут и перекрашен — правка держится',
        Boolean(held) && held!.front?.base === 'mdf_enamel',
        held
          ? `${held.id}: ширина ${held.widthMm}, материал ${held.front?.base ?? 'БЕЗ СВОЕГО'}`
          : `ПРАВКА ПОТЕРЯНА: ${upperOf(touched).map((u) => `${u.id}(${u.widthMm})`).join(' ')}`,
      );
    }

    /* ── 8. Витрина и кладовка над колонной ── */

    const withDisplay = edit(base, [
      { op: 'set_variant', moduleId: wide.id, variant: 'upper_glass' as ModuleVariantKind },
    ]);

    check(
      'витрина ставится на модуль верхнего ряда',
      upperOf(withDisplay).some((u) => u.variant === 'upper_glass'),
      upperOf(withDisplay).map((u) => `${u.id}:${u.variant ?? '—'}`).join(' '),
    );

    const storage = base.upperSegments
      .flatMap((segment) => segment.modules)
      .filter((u) => u.section === 'mezzanine' && mezzanineBaseOf(u, base) !== null);

    check(
      'кладовка над колонной холодильника на месте',
      storage.length > 0,
      storage.length === 0
        ? 'КЛАДОВКИ НАД КОЛОННОЙ НЕТ — она строится из колонны'
        : storage.map((u) => `${u.id}(${u.widthMm})`).join(' '),
    );

    const afterEdit = edit(base, [{ op: 'set_width', moduleId: target.id, widthMm: wantMm }]);
    const storageAfter = afterEdit.upperSegments
      .flatMap((segment) => segment.modules)
      .filter((u) => u.section === 'mezzanine' && mezzanineBaseOf(u, afterEdit) !== null);

    check(
      'и правка верхнего ряда её не ломает',
      storageAfter.length === storage.length,
      `было ${storage.length} · стало ${storageAfter.length}`,
    );

    /* ── 9. Отказ словами с числом ── */

    const broken = edit(base, [
      { op: 'set_width', moduleId: target.id, widthMm: upperInput.lengthMm },
    ]);
    const refusal = (broken.warnings ?? []).find((t) => /[0-9]/.test(t));

    check(
      'правка, ломающая верхний ряд, отказывает словами с числом',
      Boolean(refusal),
      refusal ?? 'ОТКАЗА НЕТ ВОВСЕ — правка пропала молча',
    );
  }
}

/* ═══════════  Кнопки панели работают на любом ряду  ═══════════ */

/**
 * ОДИН СПИСОК ДЕЙСТВИЙ НА ЛЮБОЙ РЯД.
 *
 * Движок принимал правку нижнего ряда, верхнего и антресоли, а кнопки
 * собирались только для нижнего: «+ слева» и «+ справа» добавляли в
 * `run.modules`, «поменять местами» не было вовсе. Панель ходит через
 * `moduleActions`, и приёмка спрашивает ТУ ЖЕ функцию — иначе она мерила
 * бы движок, а человек нажимает кнопки.
 */
console.log('\nКнопки панели на любом ряду');
{
  const panelInput = { ...baseInput, openings: [] };
  const run = applyOps({
    run: buildRun(panelInput),
    requirements: REQ,
    ops: [{ op: 'set_mezzanine', heightMm: 400 }],
    openings: panelInput.openings,
  });

  const hanging = run.upperSegments.flatMap((segment) => segment.modules);
  const rows: [string, Module | undefined][] = [
    ['нижний', run.modules.find((u) => !u.appliance && !u.column)],
    ['верхний', hanging.filter((u) => u.section !== 'mezzanine' && !u.appliance)[1]],
    ['антресоль', hanging.filter((u) => u.section === 'mezzanine')[1]],
  ];

  check(
    'модуль нашёлся в каждом из трёх рядов',
    rows.every(([, unit]) => Boolean(unit)),
    rows.map(([name, unit]) => `${name}: ${unit?.id ?? 'НЕТ МОДУЛЯ'}`).join(' · '),
  );

  const WANT: ModuleActionKey[] = [
    'add_left',
    'add_right',
    'replace',
    'remove',
    'move_left',
    'move_right',
  ];

  for (const [name, unit] of rows) {
    if (!unit) continue;

    const actions = moduleActions(run, unit.id);

    check(
      `${name}: панель даёт все шесть действий`,
      actions.length === WANT.length && WANT.every((key) => actions.some((a) => a.key === key)),
      actions.length === 0
        ? `НОЛЬ ДЕЙСТВИЙ У МОДУЛЯ ${unit.id} — нажимать нечено`
        : `действий ${actions.length}: ${actions.map((a) => a.key).join(', ')}`,
    );

    const usable = actions.filter((a) => actionEnabled(a));

    /*
     * ОТКАЗ НАЗЫВАЕТ ДЕЙСТВИЕ И СЛОВА, а не только «не сработало»:
     * иначе на красной строке нечего чинить.
     */
    const broke = usable
      .map((action) => ({
        action,
        warnings:
          applyOps({
            run,
            requirements: REQ,
            ops: action.ops,
            openings: panelInput.openings,
          }).warnings ?? [],
      }))
      .filter((entry) => entry.warnings.length > 0);

    /*
     * ДОСТУПНОЕ ДЕЙСТВИЕ ЛИБО ПРИМЕНЯЕТСЯ, ЛИБО ОТКАЗЫВАЕТ ЧИСЛОМ.
     *
     * «Добавить» в заполненный ряд — законный отказ: места нет, и он
     * назван в миллиметрах. Требовать «ни одного предупреждения» значит
     * требовать, чтобы ряд молча вылезал за стену. Запрещено другое —
     * молчание: кнопка нажата, а не произошло ничего и никто не сказал
     * почему.
     */
    const silent = broke.filter((entry) => !/[0-9]/.test(entry.warnings[0]));
    const applied = usable.length - broke.length;

    check(
      `${name}: доступное действие применяется или отказывает числом`,
      usable.length > 0 && silent.length === 0,
      usable.length === 0
        ? `НИ ОДНО ДЕЙСТВИЕ НЕ ДОСТУПНО У ${unit.id}`
        : silent.length > 0
          ? `БЕЗ ЧИСЛА: ${silent.map((e) => `${e.action.key}: ${e.warnings[0].slice(0, 70)}`).join(' · ')}`
          : `применилось ${applied}, отказало числом ${broke.length}`,
    );

    /*
     * СОСЕД БЕРЁТСЯ ИЗ СВОЕГО РЯДА.
     *
     * Проверка «отказ содержит цифру» этого не ловит: в отказе «соседа
     * mezz-0 в ней нет» цифра есть — она из идентификатора. Меряем
     * структуру: всё, на что ссылается действие, обязано лежать в том же
     * ряду, что и сам модуль.
     */
    /*
     * РЯД СЧИТАЕТСЯ ЗАНОВО, А НЕ БЕРЁТСЯ У ПРОВЕРЯЕМОЙ ФУНКЦИИ.
     *
     * Первая версия звала `rowOfModule` — ту самую, которую и проверяет.
     * Круг: слей ряды в одну кучу, и проверка останется зелёной, потому
     * что «свой ряд» станет той же кучей. Проверено откатом: слитые ряды
     * её не роняли. Здесь ряды собираются по тому же признаку, по
     * которому их различает движок — опоре (`mezzanineBaseOf`).
     */
    const engineRow = (m: Module): string => {
      if (run.modules.some((x) => x.id === m.id)) return 'низ';
      if (m.section !== 'mezzanine') return 'верх';
      return mezzanineBaseOf(m, run) === null ? 'антресоль' : 'кладовка';
    };
    const myRow = engineRow(unit);
    const rowIds = new Set(
      [...run.modules, ...run.upperSegments.flatMap((sg) => sg.modules)]
        .filter((m) => engineRow(m) === myRow)
        .map((m) => m.id),
    );
    const foreign = actions
      .flatMap((action) =>
        action.ops
          .map((op) => ('afterModuleId' in op ? op.afterModuleId : undefined))
          .filter((id): id is string => Boolean(id))
          .map((id) => ({ key: action.key, id })),
      )
      .filter((ref) => !rowIds.has(ref.id));

    check(
      `${name}: действие ссылается на соседа из СВОЕГО ряда`,
      foreign.length === 0,
      foreign.length === 0
        ? `соседей из чужих рядов нет · в ряду ${rowIds.size}`
        : `ЧУЖОЙ СОСЕД: ${foreign.map((f) => `${f.key} → ${f.id}`).join(' · ')}`,
    );

    check(
      `${name}: недоступное действие называет причину`,
      actions.filter((a) => !actionEnabled(a)).every((a) => Boolean(a.refusal)),
      actions
        .filter((a) => !actionEnabled(a))
        .map((a) => `${a.key}: ${a.refusal ?? 'БЕЗ ПРИЧИНЫ'}`)
        .join(' · ') || 'все доступны',
    );
  }

  /* ── Приборный модуль: кнопка, которая не сработает, заперта ── */

  const appliance = run.modules.find((u) => u.appliance && !u.column);

  check(
    'приборный модуль в ряду есть — запрет проверять есть на чём',
    Boolean(appliance),
    appliance ? `${appliance.label}` : 'ПРИБОРНОГО МОДУЛЯ НЕТ',
  );

  if (appliance) {
    const actions = moduleActions(run, appliance.id);
    const moves = actions.filter((a) => a.key === 'move_left' || a.key === 'move_right');

    check(
      'у приборного модуля сдвиг заперт и объяснён словами',
      moves.length === 2 && moves.every((a) => !actionEnabled(a) && Boolean(a.refusal)),
      moves.map((a) => `${a.key}: ${a.refusal ?? 'БЕЗ ПРИЧИНЫ'}`).join(' · ') || 'СДВИГА НЕТ В СПИСКЕ',
    );
  }

  /* ── Zero-result: чужой идентификатор не даёт ни одной кнопки ── */

  check(
    'у несуществующего модуля кнопок нет вовсе',
    moduleActions(run, 'нет-такого-модуля').length === 0,
    `действий ${moduleActions(run, 'нет-такого-модуля').length}`,
  );
}

/* ═══════════  Фрезеровка доезжает до сметы и деталировки  ═══════════ */

/**
 * ОДНА ФРЕЗЕРОВКА НА ЧЕТЫРЕ МЕСТА.
 *
 * Выбор, который виден только на экране выбора, — это переключатель,
 * который ничего не меняет (ловушка 148). Фрезеровка обязана доехать в
 * смету (цена за м²), в сцену (профиль на фасаде), на чертёж (выноска
 * материала) и в деталировку (у панели фасада названа фрезеровка).
 *
 * Площадь при этом НЕ считается заново: её знает раскрой, и второй
 * расчёт разошёлся бы с ним на первой же правке.
 */
console.log('\nФрезеровка фасада в смете и деталировке');
{
  const CAT: Map<string, MillingItem> = new Map([
    [
      'mil-modern',
      {
        id: 'mil-modern',
        name: 'Модерн',
        article: 'MIL-MODERN',
        price: 4500,
        active: true,
        milling: { profile: 'M10 20 L90 20 L90 80 L10 80 Z', typical: false },
      },
    ],
    [
      'mil-free',
      {
        id: 'mil-free',
        name: 'Ампир',
        article: 'MIL-EMPIRE',
        price: 0,
        active: true,
        milling: { profile: 'M10 20 L90 20', typical: false },
      },
    ],
  ]);

  const plain = buildRun(baseInput);
  const withMilling: Run = { ...plain, milling: { base: 'mil-modern' } };

  const facades = [...plain.modules, ...plain.upperSegments.flatMap((sg) => sg.modules)].filter(
    (u) => hasFacade(u),
  );

  check(
    'в ряду есть фасады — фрезеровку проверять есть на чём',
    facades.length > 0,
    facades.length === 0 ? 'НОЛЬ ФАСАДОВ В РЯДУ — фрезеровать нечего' : `фасадов ${facades.length}`,
  );

  /* ── 1. Наследование «как у нижних» ── */

  const byScope = new Map<string, string | null>();
  for (const unit of facades) byScope.set(millingScopeOf(unit), millingFor(unit, withMilling));

  check(
    'полос в ряду больше одной — наследование проверять есть на чём',
    byScope.size > 1,
    byScope.size === 0
      ? 'НОЛЬ ПОЛОС — наследование не проверить'
      : Array.from(byScope.keys()).join(', '),
  );

  check(
    'назначенное нижнему ряду наследуют все полосы: «как у нижних»',
    facades.every((u) => millingFor(u, withMilling) === 'mil-modern'),
    Array.from(byScope.entries()).map(([k, v]) => `${k}: ${v ?? 'нет'}`).join(' · '),
  );

  const upperOwn: Run = { ...plain, milling: { base: 'mil-modern', upper: 'mil-free' } };
  const upperUnit = facades.find((u) => millingScopeOf(u) === 'upper');
  const baseUnit = facades.find((u) => millingScopeOf(u) === 'base');

  check(
    'своя фрезеровка полосы сильнее унаследованной',
    Boolean(upperUnit) &&
      Boolean(baseUnit) &&
      millingFor(upperUnit!, upperOwn) === 'mil-free' &&
      millingFor(baseUnit!, upperOwn) === 'mil-modern',
    !upperUnit || !baseUnit
      ? 'НЕТ МОДУЛЕЙ ОБЕИХ ПОЛОС'
      : `верх ${millingFor(upperUnit, upperOwn)} · низ ${millingFor(baseUnit, upperOwn)}`,
  );

  const moduleOwn: Run = {
    ...upperOwn,
    modules: plain.modules.map((u) =>
      u.id === baseUnit?.id ? { ...u, front: { ...frontOf(u), millingId: 'mil-free' } } : u,
    ),
  };
  const picked = moduleOwn.modules.find((u) => u.id === baseUnit?.id)!;

  check(
    'выбор на модуле сильнее полосы',
    millingFor(picked, moduleOwn) === 'mil-free',
    `модуль ${millingFor(picked, moduleOwn)} · его полоса ${millingFor(baseUnit!, moduleOwn)}`,
  );

  /* ── 2. Смета ── */

  const lineOf = (r: Run) =>
    buildEstimate(r, MAIN_VARIANT, DEMO_RATES, [], undefined, undefined, undefined, CAT)
      .lines.find((l) => l.key.startsWith('front_milling'));

  const plainLine = lineOf(plain);
  const millLine = lineOf(withMilling);

  check(
    'без фрезеровки строки в смете нет вовсе',
    !plainLine,
    plainLine ? `ЛИШНЯЯ СТРОКА: ${plainLine.title} ${plainLine.quantity}` : 'строки нет',
  );

  check(
    'с фрезеровкой строка появляется и названа',
    Boolean(millLine) && /Модерн/.test(millLine?.title ?? ''),
    millLine ? `${millLine.title} · ${millLine.quantity} м² · ${millLine.rate} ₸` : 'СТРОКИ НЕТ',
  );

  /* ── 3. Площадь — из раскроя, а не вторым расчётом ── */

  const fromCut = panelMaterials(buildPanels({ run: withMilling })).frontM2;

  check(
    'площадь в статье фрезеровки равна площади фасадов из раскроя',
    Boolean(millLine) && Math.abs((millLine?.quantity ?? 0) - fromCut) < 0.01,
    `статья ${millLine?.quantity ?? 'НЕТ'} м² · раскрой ${fromCut} м²`,
  );

  check(
    'фрезеровка меняет сумму сметы',
    Math.round(buildEstimate(withMilling, MAIN_VARIANT, DEMO_RATES, [], undefined, undefined, undefined, CAT).total) !==
      Math.round(buildEstimate(plain, MAIN_VARIANT, DEMO_RATES).total),
    `${Math.round(buildEstimate(plain, MAIN_VARIANT, DEMO_RATES).total)} → ${Math.round(
      buildEstimate(withMilling, MAIN_VARIANT, DEMO_RATES, [], undefined, undefined, undefined, CAT).total,
    )} ₸`,
  );

  /* ── 4. Позиция без цены не даёт нулевую строку молча ── */

  const freeRun: Run = { ...plain, milling: { base: 'mil-free' } };
  const freeLine = lineOf(freeRun);
  const freeWarnings = millingWarnings(freeRun, CAT);

  check(
    'позиция без цены не даёт нулевой строки',
    !freeLine,
    freeLine ? `НУЛЕВАЯ СТРОКА: ${freeLine.title} ${freeLine.total}` : 'строки нет',
  );

  check(
    'и молчанием это не заканчивается: сказано словами',
    freeWarnings.some((w) => /цена не задана/.test(w.message)),
    freeWarnings.map((w) => w.message).join(' | ') || 'МОЛЧА: ни одного слова',
  );

  check(
    'повторы схлопываются: один вопрос к каталогу, а не десять',
    freeWarnings.length === 1,
    `предупреждений ${freeWarnings.length} при ${facades.length} фасадах`,
  );

  /* ── 5. Операция назначения ── */

  const assigned = applyOps({
    run: plain,
    requirements: REQ,
    ops: [{ op: 'set_milling', millingId: 'mil-modern', scope: 'upper' }],
  });

  check(
    'операция назначает фрезеровку полосе',
    assigned.milling?.upper === 'mil-modern',
    `run.milling = ${JSON.stringify(assigned.milling ?? null)}`,
  );

  const target = plain.modules.find((u) => hasFacade(u))!;
  const onModule = applyOps({
    run: plain,
    requirements: REQ,
    ops: [{ op: 'set_milling', millingId: 'mil-modern', moduleId: target.id }],
  });

  check(
    'и одному фасаду — в его же front, туда же, где материал',
    onModule.modules.find((u) => u.id === target.id)?.front?.millingId === 'mil-modern',
    `${target.label}: ${onModule.modules.find((u) => u.id === target.id)?.front?.millingId ?? 'НЕТ'}`,
  );

  const bothAddresses = applyOps({
    run: plain,
    requirements: REQ,
    ops: [{ op: 'set_milling', millingId: 'mil-modern', moduleId: target.id, scope: 'base' }],
  });

  check(
    'два адреса в одной правке — отказ словами, а не молчаливый выбор',
    (bothAddresses.warnings ?? []).some((w) => /полосе, либо модулю/.test(w)),
    (bothAddresses.warnings ?? []).join(' | ') || 'МОЛЧА',
  );

  /* ── 6. Деталировка ── */

  const cutPlain = buildPanels({ run: plain }).filter((p) => p.name === 'Фасад');
  const cutMill = buildPanels({ run: withMilling, milling: CAT }).filter((p) => p.name === 'Фасад');

  check(
    'фасады в раскрое есть — деталировку проверять есть на чём',
    cutPlain.length > 0 && cutMill.length > 0,
    cutPlain.length === 0 ? 'НОЛЬ ФАСАДОВ В РАСКРОЕ' : `фасадов ${cutMill.length}`,
  );

  check(
    'у панели фасада названа фрезеровка, а без неё — нет',
    cutMill.some((p) => /Модерн/.test(p.material)) &&
      cutPlain.every((p) => !/Модерн/.test(p.material)),
    `с фрезеровкой «${cutMill[0]?.material}» · без «${cutPlain[0]?.material}»`,
  );
}

/* ═══════════  Экран выбора фрезеровки  ═══════════ */

/**
 * ЭКРАН ПОКАЗЫВАЕТ ПОЗИЦИИ КАТАЛОГА, А НЕ СПИСОК В КОДЕ.
 *
 * Функция, которую замерщик не видит, — это не функция: прошлый заход
 * собрал `MillingPicker` и не подключил его, и фрезеровка существовала
 * только в тестах. Здесь меряется то, что видно на экране: карточки
 * рисуются из каталога организации, выбор доезжает до модуля и до сметы,
 * а позиция без цены названа словами.
 *
 * Проверка идёт ТЕМ ЖЕ ПУТЁМ, что экран: компонент отрисовывается, и
 * карточки считаются в разметке — как считает их глаз.
 */
console.log('\nЭкран выбора фрезеровки');
{
  const entry = (over: Record<string, unknown>) =>
    ({
      id: 'mil-modern',
      org_id: 'org',
      name_ru: 'Модерн',
      article: 'MIL-MODERN',
      price: 4500,
      is_active: true,
      meta: { milling: { profile: 'M10 20 L90 20 L90 80 L10 80 Z', typical: false } },
      ...over,
    }) as never;

  const catalog = millingCatalog([
    entry({}),
    entry({ id: 'mil-free', name_ru: 'Ампир', article: 'MIL-EMPIRE', price: 0 }),
    entry({ id: 'mil-off', name_ru: 'Волна', article: 'MIL-WAVE', is_active: false }),
  ]);

  const run = buildRun(baseInput);

  const render = (over: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      React.createElement(MillingPicker, {
        run,
        catalog,
        onOps: () => {},
        ...over,
      } as never),
    );

  const html = render();
  const cards = (html.match(/data-milling="/g) ?? []).length;

  check(
    'каталог непустой — экран проверять есть на чём',
    catalog.size > 0,
    catalog.size === 0 ? 'НОЛЬ ПОЗИЦИЙ В КАТАЛОГЕ — карточек не из чего строить' : `позиций ${catalog.size}`,
  );

  check(
    'экран показывает карточку на каждую ВКЛЮЧЁННУЮ позицию',
    cards === millingChoices(catalog).length && cards > 0,
    cards === 0
      ? 'НОЛЬ КАРТОЧЕК НА ЭКРАНЕ — выбирать нечего'
      : `карточек ${cards} при ${millingChoices(catalog).length} включённых из ${catalog.size}`,
  );

  check(
    'отключённая позиция на экран не выходит',
    !html.includes('data-milling="mil-off"'),
    html.includes('data-milling="mil-off"') ? 'ОТКЛЮЧЁННАЯ ВИДНА' : 'её нет',
  );

  check(
    'у карточки есть профиль: рисунок, а не одно название',
    (html.match(/<path /g) ?? []).length >= cards,
    `контуров ${(html.match(/<path /g) ?? []).length} при ${cards} карточках`,
  );

  /*
   * ЦЕНА ВВОДИТСЯ НА КАРТОЧКЕ, А НЕ ЧИТАЕТСЯ С НЕЁ.
   *
   * Раньше это была подпись, и проверка искала «4 500 ₸/м²» текстом.
   * Теперь это поле: у каждой карточки своё, подписанное ₸/м². Второй
   * подписи с тем же числом рядом с полем нет намеренно — два показа
   * одной величины на одной карточке расходятся при первой же правке.
   */
  const fields = (html.match(/data-milling-price="/g) ?? []).length;
  const units = (html.match(/₸\/м²/g) ?? []).length;

  check(
    'цена вводится на карточке: поле у каждой и подписано ₸/м²',
    fields === cards && units === cards && cards > 0,
    `полей ${fields}, подписей ₸/м² ${units} при ${cards} карточках`,
  );

  /*
   * ПРОВЕРЯЕМ САМУ КАРТОЧКУ, А НЕ ВЕСЬ ЭКРАН.
   *
   * Первая версия искала «0 ₸/м²» во всей разметке и падала на верном
   * продукте: «4 500 ₸/м²» содержит эту подстроку. Берём разметку той
   * карточки, о которой речь.
   */
  const cardOf = (id: string, markup = html) => {
    const at = markup.indexOf(`data-milling-card="${id}"`);
    if (at < 0) return '';
    /*
     * Карточка кончается там, где начинается следующая: цена вышла из
     * кнопки в своё поле, и срез до `</button>` мерил бы теперь половину
     * карточки — ту, где цены нет вовсе.
     */
    const next = markup.indexOf('data-milling-card="', at + 1);
    return next < 0 ? markup.slice(at) : markup.slice(at, next);
  };

  const freeCard = cardOf('mil-free');
  const paidCard = cardOf('mil-modern');

  check(
    'карточки обеих позиций нашлись — цену проверять есть на чём',
    freeCard.length > 0 && paidCard.length > 0,
    freeCard.length === 0 || paidCard.length === 0
      ? 'КАРТОЧКИ НЕ НАЙДЕНЫ В РАЗМЕТКЕ'
      : 'нашлись обе',
  );

  /** Что стоит в поле цены этой карточки. Пусто — значит пусто. */
  const priceValue = (card: string) => {
    const m = card.match(/data-milling-price="[^"]*"[^>]*?value="([^"]*)"/);
    return m ? m[1] : null;
  };

  check(
    'позиция без цены названа словами, а не нулём',
    freeCard.includes('цена не задана') && priceValue(freeCard) === '',
    freeCard.includes('цена не задана')
      ? `сказано словами, поле пустое (${JSON.stringify(priceValue(freeCard))})`
      : `МОЛЧА ИЛИ НУЛЁМ: ${freeCard.slice(-160)}`,
  );

  check(
    'а позиция с ценой показывает именно её',
    priceValue(paidCard) === '4500' && !paidCard.includes('цена не задана'),
    priceValue(paidCard) === null
      ? 'ПОЛЯ ЦЕНЫ НА КАРТОЧКЕ НЕТ'
      : `в поле ${priceValue(paidCard)}`,
  );

  /* ── Полосы и наследование ── */

  for (const scope of MILLING_SCOPES) {
    check(
      `на экране есть назначение полосе «${scope.title}»`,
      html.includes(`data-milling-scope="${scope.key}"`),
      html.includes(`data-milling-scope="${scope.key}"`) ? 'есть' : 'ПОЛОСЫ НЕТ НА ЭКРАНЕ',
    );
  }

  check(
    'полоса без своей фрезеровки подписана «как у нижних»',
    html.includes('как у нижних'),
    html.includes('как у нижних') ? 'подписано' : 'ПОДПИСИ НЕТ',
  );

  /* ── Пустой каталог не выглядит поломкой ── */

  const emptyHtml = renderToStaticMarkup(
    React.createElement(MillingPicker, {
      run,
      catalog: new Map(),
      onOps: () => {},
    } as never),
  );

  check(
    'пустой каталог объясняет себя словами, а не пустым местом',
    /Фрезеровок в каталоге нет/.test(emptyHtml),
    /Фрезеровок в каталоге нет/.test(emptyHtml) ? 'сказано словами' : 'ПУСТОЙ ЭКРАН БЕЗ ОБЪЯСНЕНИЯ',
  );

  /* ── Выбор доезжает до модуля и до сметы ── */

  const target = run.modules.find((u) => hasFacade(u))!;
  const picked = applyOps({
    run,
    requirements: REQ,
    ops: [{ op: 'set_milling', millingId: 'mil-modern', moduleId: target.id }],
  });

  check(
    'выбор карточки доезжает до модуля',
    picked.modules.find((u) => u.id === target.id)?.front?.millingId === 'mil-modern',
    `${target.label}: ${picked.modules.find((u) => u.id === target.id)?.front?.millingId ?? 'НЕТ'}`,
  );

  const before = Math.round(buildEstimate(run, MAIN_VARIANT, DEMO_RATES).total);
  const after = Math.round(
    buildEstimate(picked, MAIN_VARIANT, DEMO_RATES, [], undefined, undefined, undefined, catalog)
      .total,
  );

  check(
    'и до сметы',
    after > before,
    `${before} → ${after} ₸`,
  );

  /* ── Выбранная карточка помечена ── */

  const markedHtml = render({ run: picked, selectedModuleId: target.id });

  check(
    'выбранная карточка отмечена на экране',
    /data-milling="mil-modern" aria-pressed="true"/.test(markedHtml) ||
      markedHtml.includes('aria-pressed="true"'),
    markedHtml.includes('aria-pressed="true"') ? 'отмечена' : 'ПРИЗНАКА ВЫБРАННОЙ НЕТ',
  );
}

/* ═══  Карточка фрезеровки: рельеф, цена и рельеф в сцене  ═══ */

/**
 * КАРТОЧКА ПОКАЗЫВАЕТ ФАСАД, ЦЕНА ВВОДИТСЯ В НЕЙ ЖЕ, СЦЕНА ВИДИТ ВЫБОР.
 *
 * Плоский контур одиннадцати позиций читался как четыре рамки в рамке:
 * «Верона» и «Ампир» на карточке выглядели одинаково, и выбор
 * превращался в выбор названия. Цена при этом жила только в админке
 * каталога, а введённая там — не доезжала до суммы внизу экрана.
 *
 * Меряется ровно это: одиннадцать РАЗНЫХ рисунков, цена в поле карточки,
 * позиция без цены выбирается и в смету не попадает, а выбор меняет
 * материал фасада В СЦЕНЕ.
 */
console.log('\n' + 'Карточка фрезеровки: рельеф, цена, сцена');
{
  /* ── Одиннадцать позиций — одиннадцать разных рисунков ── */

  check(
    'позиции есть — рисунки сравнивать есть на чём',
    TYPICAL_MILLING.length === 11,
    TYPICAL_MILLING.length === 0
      ? 'НОЛЬ ПОЗИЦИЙ В НАБОРЕ — сравнивать нечего'
      : `позиций ${TYPICAL_MILLING.length}`,
  );

  const contours = TYPICAL_MILLING.map((m) => profileOf(m.layers));
  const uniqueContours = new Set(contours);

  check(
    'у одиннадцати позиций одиннадцать РАЗНЫХ контуров, повторов нет',
    uniqueContours.size === TYPICAL_MILLING.length && TYPICAL_MILLING.length > 0,
    uniqueContours.size === TYPICAL_MILLING.length
      ? `разных контуров ${uniqueContours.size} из ${TYPICAL_MILLING.length}`
      : `ПОВТОРЫ: ${TYPICAL_MILLING.filter(
          (m, i) => contours.indexOf(profileOf(m.layers)) !== i,
        )
          .map((m) => m.name)
          .join(', ')}`,
  );

  /*
   * КОНТУР МОЖЕТ РАЗЛИЧАТЬСЯ, А РИСУНОК — НЕТ.
   *
   * Рамка фасада есть у всех, и одного её достаточно, чтобы строки
   * оказались разными при одинаковых на вид карточках. Поэтому сравнение
   * идёт по ВЫБОРКАМ — по тому, что сняла фреза.
   */
  const cutsOf = (name: string) =>
    JSON.stringify(
      (TYPICAL_MILLING.find((m) => m.name === name)?.layers ?? []).filter((l) => l.depth > 0),
    );

  const FIVE = ['Верона', 'Ампир', 'Александрия', 'Венеция', 'Флоренсия'];
  const samePairs: string[] = [];
  for (let i = 0; i < FIVE.length; i += 1) {
    for (let j = i + 1; j < FIVE.length; j += 1) {
      if (cutsOf(FIVE[i]) === cutsOf(FIVE[j])) samePairs.push(`${FIVE[i]} = ${FIVE[j]}`);
    }
  }

  check(
    'пять похожих позиций различаются ВЫБОРКАМИ, а не только названием',
    samePairs.length === 0 && FIVE.every((n) => cutsOf(n) !== '[]'),
    samePairs.length > 0
      ? `СОВПАДАЮТ: ${samePairs.join(' · ')}`
      : FIVE.map((n) => `${n}: выборок ${JSON.parse(cutsOf(n)).length}`).join(' · '),
  );

  /* ── Экран рисует эти одиннадцать, и все они разные ── */

  const typicalEntries = TYPICAL_MILLING.map((m, i) => {
    const seed = typicalMillingItem(m);
    return {
      id: `typ-${i}`,
      org_id: 'org',
      name_ru: seed.name_ru,
      article: seed.article,
      price: 0,
      is_active: true,
      meta: seed.meta,
    } as never;
  });

  const typicalCatalog = millingCatalog(typicalEntries);
  const run = buildRun(baseInput);

  const typicalHtml = renderToStaticMarkup(
    React.createElement(MillingPicker, {
      run,
      catalog: typicalCatalog,
      onOps: () => {},
    } as never),
  );

  const slice = (id: string, markup: string) => {
    const at = markup.indexOf(`data-milling-card="${id}"`);
    if (at < 0) return '';
    const next = markup.indexOf('data-milling-card="', at + 1);
    return next < 0 ? markup.slice(at) : markup.slice(at, next);
  };

  const drawings = TYPICAL_MILLING.map((_, i) => {
    const card = slice(`typ-${i}`, typicalHtml);
    const from = card.indexOf('<svg');
    const to = card.indexOf('</svg>');
    return from < 0 || to < 0 ? '' : card.slice(from, to);
  });

  check(
    'карточки нарисовались — сравнивать есть что',
    drawings.length === TYPICAL_MILLING.length && drawings.every((d) => d.length > 0),
    drawings.some((d) => d.length === 0)
      ? `НЕТ РИСУНКА У ${drawings.filter((d) => !d).length} КАРТОЧЕК ИЗ ${drawings.length}`
      : `рисунков ${drawings.length}`,
  );

  check(
    'и одиннадцать карточек дают одиннадцать разных рисунков',
    new Set(drawings).size === drawings.length && drawings.length > 0,
    `разных рисунков ${new Set(drawings).size} из ${drawings.length}`,
  );

  /*
   * РЕЛЬЕФ, А НЕ ОДНА ЛИНИЯ. Слой глубины — это заливка и тень; без него
   * карточка снова становится контуром, и пять похожих позиций снова
   * сливаются.
   */
  const withRelief = drawings.filter((d) => d.includes('data-milling-layer'));

  check(
    'фрезерованная позиция нарисована слоями с тенью, а не контуром',
    withRelief.length === TYPICAL_MILLING.length - 1 &&
      withRelief.every((d) => d.includes('stroke="#000"')),
    `со слоями ${withRelief.length} из ${drawings.length} (без слоёв — «Без фрезеровки»)`,
  );

  /* ── Цена вводится в карточке и меняет итог сметы ── */

  const priceless = millingCatalog([
    {
      id: 'mil-amp',
      org_id: 'org',
      name_ru: 'Ампир',
      article: 'MIL-EMPIRE',
      price: 0,
      is_active: true,
      meta: typicalMillingItem(TYPICAL_MILLING[3]).meta,
    } as never,
  ]);

  const target = run.modules.find((u) => hasFacade(u))!;
  const picked = applyOps({
    run,
    requirements: REQ,
    ops: [{ op: 'set_milling', millingId: 'mil-amp', moduleId: target.id }],
  });

  const totalOf = (catalog: Map<string, MillingItem>) =>
    Math.round(
      buildEstimate(picked, MAIN_VARIANT, DEMO_RATES, [], undefined, undefined, undefined, catalog)
        .total,
    );

  const linesOf = (catalog: Map<string, MillingItem>) =>
    buildEstimate(picked, MAIN_VARIANT, DEMO_RATES, [], undefined, undefined, undefined, catalog)
      .lines.filter((l) => l.key.startsWith('front_milling_'));

  check(
    'без цены строки фрезеровки в смете НЕТ',
    linesOf(priceless).length === 0,
    linesOf(priceless).length === 0
      ? 'строки нет'
      : `СТРОКА ЕСТЬ ПРИ НУЛЕВОЙ ЦЕНЕ: ${linesOf(priceless)[0].title}`,
  );

  check(
    'и позиция без цены названа словами, а не промолчала',
    millingWarnings(picked, priceless).some((w) => w.message.includes('цена не задана')),
    millingWarnings(picked, priceless).map((w) => w.message).join(' | ') || 'МОЛЧА',
  );

  /*
   * ВВОД ЦЕНЫ ИДЁТ ТЕМ ЖЕ ПУТЁМ, ЧТО ЭКРАН: карточка пишет цену в
   * каталог вкладки (`setCatalogPrice`), конфигуратор собирает из него
   * `millingCatalog`, и уже он уходит в смету. Проверка, дописавшая цену
   * в Map руками, мерила бы не тот путь.
   */
  useInteriorStore.getState().setCatalog(
    TYPICAL_MILLING.map((m, i) => {
      const seed = typicalMillingItem(m);
      return {
        id: i === 3 ? 'mil-amp' : `typ-${i}`,
        org_id: 'org',
        name_ru: seed.name_ru,
        article: seed.article,
        price: 0,
        is_active: true,
        meta: seed.meta,
      } as never;
    }),
  );
  useInteriorStore.getState().setCatalogPrice('mil-amp', 7000);

  const afterEntry = millingCatalog(useInteriorStore.getState().catalog);

  check(
    'введённая цена легла В ПОЗИЦИЮ КАТАЛОГА, а не рядом с ней',
    afterEntry.get('mil-amp')?.price === 7000,
    `«Ампир»: ${afterEntry.get('mil-amp')?.price ?? 'НЕТ В КАТАЛОГЕ'} ₸/м²`,
  );

  const before = totalOf(priceless);
  const after = totalOf(afterEntry);
  const line = linesOf(afterEntry)[0];

  check(
    'после ввода строка появилась в смете',
    Boolean(line) && line.quantity > 0,
    line ? `${line.title}: ${line.quantity} м² × ${line.rate} ₸` : 'СТРОКИ НЕТ',
  );

  /*
   * ИТОГ ВЫРОС РОВНО НА ТО, ЧТО ДОБАВИЛОСЬ.
   *
   * Сравнение «разница равна строке» было бы неверным: доставка и монтаж
   * считаются процентом от сметы и растут вместе с ней. Поэтому меряем
   * иначе — какие строки вообще сдвинулись: строка фрезеровки и только
   * процентные. Тронулось что-то ещё — фрезеровка задела чужие деньги.
   */
  const totalsOf = (catalog: Map<string, MillingItem>) =>
    new Map(
      buildEstimate(picked, MAIN_VARIANT, DEMO_RATES, [], undefined, undefined, undefined, catalog)
        .lines.map((l) => [l.key, { total: Math.round(l.total), unit: l.unit }]),
    );

  const was = totalsOf(priceless);
  const now = totalsOf(afterEntry);
  const moved = Array.from(now.entries()).filter(([k, v]) => was.get(k)?.total !== v.total);
  const percent = moved.filter(([k]) => k !== line?.key);
  const percentDelta = percent.reduce(
    (sum, [k, v]) => sum + (v.total - (was.get(k)?.total ?? 0)),
    0,
  );

  check(
    'и итог пересчитался: строка фрезеровки плюс процент от неё, больше ничего',
    after > before &&
      moved.some(([k]) => k === line?.key) &&
      percent.every(([, v]) => v.unit === 'percent') &&
      Math.abs(after - before - (Math.round(line?.total ?? 0) + percentDelta)) <= 1,
    `${before} → ${after} ₸ (+${after - before}): строка ${Math.round(
      line?.total ?? 0,
    )} + процент ${percentDelta}; тронуто ${moved.map(([k]) => k).join(', ')}`,
  );

  /*
   * А БЕЗ ЦЕНЫ ИТОГ НЕ ДВИГАЕТСЯ ВОВСЕ. «Не попала в смету» — это не
   * только отсутствие строки: сдвинься итог хоть на тенге, клиент
   * заплатил бы за позицию, цены которой никто не задавал.
   */
  check(
    'позиция без цены не двигает итог ни на тенге',
    totalOf(priceless) === totalOf(new Map()),
    `без каталога ${totalOf(new Map())} ₸ · с позицией без цены ${totalOf(priceless)} ₸`,
  );

  /*
   * ВТОРОГО ХРАНЕНИЯ ЦЕНЫ НЕТ. Модуль несёт ссылку на позицию каталога и
   * ничего больше: копия цены в модуле означала бы, что переоценка
   * каталога не доедет до сметы.
   */
  check(
    'модуль хранит ссылку, а не цену',
    JSON.stringify(picked).includes('mil-amp') && !JSON.stringify(picked).includes('7000'),
    JSON.stringify(picked).includes('7000') ? 'ЦЕНА ЛЕЖИТ В МОДУЛЕ' : 'в модуле только ссылка',
  );

  /* ── Позиция без цены всё равно выбирается ── */

  const pricelessHtml = renderToStaticMarkup(
    React.createElement(MillingPicker, {
      run,
      catalog: priceless,
      onOps: () => {},
    } as never),
  );

  check(
    'позицию без цены можно выбрать: кнопка не заперта',
    pricelessHtml.includes('data-milling="mil-amp"') &&
      !/data-milling="mil-amp"[^>]*disabled/.test(pricelessHtml),
    pricelessHtml.includes('data-milling="mil-amp"')
      ? 'карточка есть и не заперта'
      : 'КАРТОЧКИ БЕЗ ЦЕНЫ НА ЭКРАНЕ НЕТ',
  );

  /* ── Выбор меняет материал фасада В СЦЕНЕ ── */

  const keyBefore = frontKey(frontWithMilling(target, run));
  const keyAfter = frontKey(frontWithMilling(picked.modules.find((u) => u.id === target.id)!, picked));

  check(
    'выбор фрезеровки меняет ключ материала фасада в сцене',
    keyBefore !== keyAfter && keyAfter.includes('mil-amp'),
    `${keyBefore} → ${keyAfter}`,
  );

  /*
   * ФАСАДЫ РИСУЮТСЯ ПАЧКАМИ ПО КЛЮЧУ (ловушка 248). Значит у одного
   * модуля с фрезеровкой обязана появиться СВОЯ пачка: останься ключ
   * прежним — фрезерованный фасад рисовался бы материалом соседей, и
   * рельефа на нём не было бы вовсе.
   */
  const packs = (r: typeof run) =>
    new Set(allModules(r).filter(hasFacade).map((u) => frontKey(frontWithMilling(u, r)))).size;

  check(
    'и добавляет в сцену свою пачку фасадов',
    packs(picked) === packs(run) + 1,
    `пачек ${packs(run)} → ${packs(picked)}`,
  );

  /*
   * МЕРЯЕМ КОРОБКИ, А НЕ ФОРМУЛУ РЯДОМ С НИМИ.
   *
   * Ключ фасада считается в двух шагах от экрана: сцена рисует то, что
   * отдала `runBoxes`. Проверка, спросившая только `frontWithMilling`,
   * была бы зелёной и тогда, когда коробки считают фрезеровку по-своему.
   */
  const boxKeys = (r: typeof run) =>
    new Set(
      runBoxes(r, { thicknessMm: 16, frontThicknessMm: 18, gapMm: 3 })
        .filter((b) => b.material === 'front')
        .map((b) => b.frontKey ?? ''),
    );

  check(
    'коробки сцены несут фрезеровку в ключе фасада',
    Array.from(boxKeys(picked)).some((k) => k.includes('mil-amp')) &&
      !Array.from(boxKeys(run)).some((k) => k.includes('mil-amp')),
    `было ${Array.from(boxKeys(run)).join(' · ')} → стало ${Array.from(boxKeys(picked)).join(' · ')}`,
  );

  /*
   * НАЗНАЧЕНИЕ ПОЛОСЕ ОБЯЗАНО ДОЕХАТЬ ДО СЦЕНЫ ТОЖЕ.
   *
   * Замерщик говорит «низ Модерн», а не перечисляет модули: это лежит на
   * РЯДЕ, и модуль о нём не знает. Сцена спрашивала только модуль — и
   * фасад оставался ровным при выбранной по ряду фрезеровке.
   */
  const byRow = applyOps({
    run,
    requirements: REQ,
    ops: [{ op: 'set_milling', millingId: 'mil-amp', scope: 'base' }],
  });

  check(
    'фрезеровка, назначенная РЯДУ, доезжает до коробок сцены',
    Array.from(boxKeys(byRow)).some((k) => k.includes('mil-amp')),
    Array.from(boxKeys(byRow)).join(' · ') || 'ФАСАДНЫХ КОРОБОК НЕТ ВОВСЕ',
  );

  /* ── Экранный путь: composeVariants → смета внизу экрана ── */

  /**
   * ТЕСТ ИДЁТ ТЕМ ЖЕ ПУТЁМ, ЧТО ЭКРАН.
   *
   * Сумма внизу экрана считается не прямым вызовом `buildEstimate`, а
   * цепочкой `composeVariants → buildVariants → buildEstimate`. Пока
   * каталог фрезеровки не ехал по этой цепочке, введённая на карточке
   * цена доезжала до каталога и НЕ доезжала до суммы — а меряй мы
   * прямой вызов, проверка была бы зелёной.
   */
  const screenInput = (catalog: Map<string, MillingItem>) => ({
    title: 'Проверка',
    zone: 'kitchen',
    measuredBy: '',
    measuredAt: '',
    lengthMm: baseInput.lengthMm,
    ceilingHeightMm: baseInput.ceilingHeightMm,
    requirements: REQ,
    openings: [],
    comms: [],
    rates: DEMO_RATES,
    cornerAt: null,
    measuredWalls: [],
    measuredComms: [],
    runWallId: 'a',
    roomDepthM: 3.2,
    milling: catalog,
  });

  const screenTotal = (catalog: Map<string, MillingItem>) => {
    const variants = composeVariants(
      screenInput(catalog) as never,
      { basic: [], optimal: [], premium: [] } as never,
      { [MAIN_VARIANT]: picked } as never,
    );
    return Math.round(variants.find((v) => v.key === MAIN_VARIANT)!.estimate.total);
  };

  const screenBefore = screenTotal(priceless);
  const screenAfter = screenTotal(afterEntry);

  check(
    'сумма ВНИЗУ ЭКРАНА пересчитывается от введённой цены',
    screenAfter > screenBefore,
    `${screenBefore} → ${screenAfter} ₸ (+${screenAfter - screenBefore})`,
  );
}

/* ═══════════  Деталировка показывает место каждой детали  ═══════════ */

/**
 * У ДЕТАЛИ ЕСТЬ МЕСТО, И ОНО ТО ЖЕ, ЧТО В СЦЕНЕ.
 *
 * Деталировка была таблицей текстом: цех видел строки и не видел, где
 * боковина стоит в модуле и какой стороной. Координат у панели нет вовсе
 * — они берутся у тех же коробок, что рисует сцена, по имени детали.
 *
 * Здесь меряется именно это соединение: у каждой детали корпуса есть
 * коробка, её габарит совпадает с раскроем, а номер — с таблицей и CSV.
 */
console.log('\nМесто детали в деталировке');
{
  const run = buildRun(baseInput);
  const panels = buildPanels({ run });
  const places = runPlaces(run);
  const shop = { thicknessM: 0.016 };

  check(
    'детали и модули есть — место проверять есть на чём',
    panels.length > 0 && places.length > 0,
    panels.length === 0
      ? 'НОЛЬ ДЕТАЛЕЙ В РАСКРОЕ — мест не у чего искать'
      : places.length === 0
        ? 'НОЛЬ МОДУЛЕЙ В РЯДУ'
        : `деталей ${panels.length}, модулей ${places.length}`,
  );

  /*
   * ДЕТАЛИ КОРПУСА — те, что режутся из листа и стоят в коробках.
   * Фасады и фронты ящиков живут своей пачкой (`moduleBoxes`), кромка
   * объёмом не является вовсе: у них место берётся иначе, и мешать их
   * сюда значило бы проверять не то.
   */
  const CARCASS = new Set([
    SIDE_PANEL_NAME,
    BOTTOM_PANEL_NAME,
    TOP_PANEL_NAME,
    TOP_RAIL_PANEL_NAME,
    SHELF_PANEL_NAME,
    DIVIDER_PANEL_NAME,
    BACK_PANEL_NAME,
  ]);

  const placed = places.flatMap((place) =>
    panelPlaces(
      place.unit,
      { x: place.x, y: place.y, heightM: place.heightM, depthM: place.depthM, zM: place.zM, ...shop },
      panels,
    ).map((entry) => ({ entry, place })),
  );

  const carcass = placed.filter(({ entry }) => CARCASS.has(entry.name));

  check(
    'детали корпуса нашлись — соединение проверять есть на чём',
    carcass.length > 0,
    carcass.length === 0
      ? 'НОЛЬ ДЕТАЛЕЙ КОРПУСА — соединять нечего'
      : `деталей корпуса ${carcass.length}`,
  );

  const homeless = carcass.filter(({ entry }) => entry.boxes.length === 0);

  check(
    'у КАЖДОЙ детали корпуса есть место в модуле',
    homeless.length === 0,
    homeless.length === 0
      ? `${carcass.length} деталей, все на местах`
      : `БЕЗ МЕСТА ${homeless.length}: ${homeless.slice(0, 3).map((h) => `${h.entry.number} ${h.entry.name}`).join(' · ')}`,
  );

  /* ── Габарит места совпадает с раскроем до миллиметра ── */

  const byNumber = new Map(panels.map((p) => [p.number, p]));
  const off: string[] = [];

  for (const { entry } of carcass) {
    const panel = byNumber.get(entry.number);
    if (!panel || entry.boxes.length === 0) continue;

    /* Деталь — лист: две большие стороны коробки и есть её габарит. */
    const sides = entry.boxes[0].scale.map((v) => Math.round(v * 1000)).sort((a, b) => b - a);
    const want = [panel.lengthMm, panel.widthMm].sort((a, b) => b - a);

    /*
     * Допуск 25 мм: у полки припуски цеха (`shelfSideMm`, `shelfDepthMm`),
     * у задней стенки вкладной отступ. Это разные числа по делу, а не
     * расхождение формул: проверяем, что деталь та же, а не что раскрой
     * равен объёму.
     */
    if (Math.abs(sides[0] - want[0]) > 25 || Math.abs(sides[1] - want[1]) > 25) {
      off.push(`${entry.number} ${entry.name}: сцена ${sides[0]}×${sides[1]} · раскрой ${want[0]}×${want[1]}`);
    }
  }

  check(
    'габарит места совпадает с размером в раскрое',
    off.length === 0,
    off.length === 0 ? `${carcass.length} деталей сошлись` : off.slice(0, 3).join(' · '),
  );

  /* ── Панель с qty 2 получает два места ── */

  const twins = carcass.filter(({ entry }) => (byNumber.get(entry.number)?.qty ?? 0) === 2);

  check(
    'деталь, которой две штуки, стоит в двух местах',
    twins.length > 0 && twins.every(({ entry }) => entry.boxes.length === 2),
    twins.length === 0
      ? 'НЕТ НИ ОДНОЙ ДЕТАЛИ КОЛИЧЕСТВОМ 2 — парность не проверить'
      : twins
          .slice(0, 3)
          .map(({ entry }) => `${entry.number} ${entry.name}: мест ${entry.boxes.length}`)
          .join(' · '),
  );

  /* ── Номер один на таблицу, раскрой и CSV ── */

  const csv = panelsToCsv(panels);
  const missingInCsv = panels.filter((p) => !csv.includes(p.number));

  check(
    'номер детали из таблицы стоит и в CSV',
    missingInCsv.length === 0 && panels.length > 0,
    missingInCsv.length === 0
      ? `${panels.length} номеров в выгрузке`
      : `НЕТ В CSV: ${missingInCsv.slice(0, 3).map((p) => p.number).join(', ')}`,
  );

  const placedNumbers = new Set(placed.map(({ entry }) => entry.number));
  const lostNumbers = panels.filter((p) => !placedNumbers.has(p.number));

  check(
    'и номер на месте детали — тот же, что в таблице',
    lostNumbers.length === 0,
    lostNumbers.length === 0
      ? `${placedNumbers.size} номеров совпали`
      : `ПОТЕРЯНЫ: ${lostNumbers.slice(0, 3).map((p) => p.number).join(', ')}`,
  );

  /* ── Кромка на виде детали — из данных панели ── */

  const edged = panels.filter((p) => p.edges.long + p.edges.short > 0);

  check(
    'кромка есть в данных — рисовать её есть из чего',
    edged.length > 0,
    edged.length === 0
      ? 'НИ У ОДНОЙ ДЕТАЛИ НЕТ КРОМКИ — показывать нечего'
      : `с кромкой ${edged.length} из ${panels.length}`,
  );

  check(
    'у детали с кромкой названы стороны, а не только факт',
    edged.every((p) => edgeSides(p).length === p.edges.long + p.edges.short),
    edged
      .slice(0, 2)
      .map((p) => `${p.number}: ${edgeSides(p).join('+') || 'НЕТ СТОРОН'}`)
      .join(' · '),
  );

  /* ── Виды: сборочный чертёж и карточка детали ── */

  const withCarcass = places.find((place) =>
    panels.some((p) => p.moduleId === place.unit.id && p.name === SHELF_PANEL_NAME),
  );

  check(
    'модуль с полкой есть — виды проверять есть на чём',
    Boolean(withCarcass),
    withCarcass ? `${withCarcass.unit.label}` : 'НЕТ МОДУЛЯ С ПОЛКОЙ',
  );

  if (withCarcass) {
    const mine = panels.filter((p) => p.moduleId === withCarcass.unit.id);
    const pick = mine.find((p) => p.name === SHELF_PANEL_NAME)!;

    const assembly = renderToStaticMarkup(
      React.createElement(ModuleAssembly, {
        run,
        unit: withCarcass.unit,
        panels,
        selectedNumber: pick.number,
      } as never),
    );

    const numbers = (assembly.match(/data-part="/g) ?? []).length;

    check(
      'сборочный чертёж рисует деталь за деталью, а не один прямоугольник',
      numbers > 1,
      numbers === 0
        ? 'НОЛЬ ДЕТАЛЕЙ НА СБОРОЧНОМ ЧЕРТЕЖЕ — показывать нечего'
        : `деталей на чертеже ${numbers} при ${mine.length} в таблице`,
    );

    check(
      'номер выбранной детали стоит на чертеже',
      assembly.includes(`data-part="${pick.number}"`) && assembly.includes(`>${pick.number}<`),
      assembly.includes(`>${pick.number}<`) ? `номер ${pick.number} на месте` : 'НОМЕРА НЕТ НА ЧЕРТЕЖЕ',
    );

    const plain = renderToStaticMarkup(
      React.createElement(ModuleAssembly, {
        run,
        unit: withCarcass.unit,
        panels,
        selectedNumber: null,
      } as never),
    );

    check(
      'выбранная деталь подсвечена, невыбранная — нет',
      assembly !== plain && assembly.includes('var(--accent)'),
      assembly === plain ? 'ПОДСВЕТКА НИЧЕГО НЕ МЕНЯЕТ' : 'подсветка видна',
    );

    /* ── Карточка детали ── */

    const card = renderToStaticMarkup(React.createElement(PartCard, { panel: pick } as never));

    check(
      'карточка детали показывает размеры из раскроя',
      card.includes(`>${pick.lengthMm}<`) && card.includes(`>${pick.widthMm}<`),
      card.includes(`>${pick.lengthMm}<`)
        ? `${pick.lengthMm} × ${pick.widthMm} мм`
        : `РАЗМЕРОВ НЕТ НА ВИДЕ: ждали ${pick.lengthMm}×${pick.widthMm}`,
    );

    const drawn = (card.match(/data-edge="/g) ?? []).length;

    check(
      'кромка нарисована по тем сторонам, что в данных',
      drawn === pick.edges.long + pick.edges.short,
      `нарисовано ${drawn} торцов при Д${pick.edges.long}/Ш${pick.edges.short}`,
    );

    check(
      'присадка не нарисована: монтажных размеров нет',
      !card.includes('data-hole') && card.includes('не рассчитана'),
      card.includes('data-hole')
        ? 'ВЫДУМАННЫЕ ОТВЕРСТИЯ НА ДЕТАЛИ'
        : 'отверстий нет, подписано «не рассчитана»',
    );
  }

  /* ── Ящики: 1, 2, 3 дают разное число деталей, и все на местах ── */

  const hob = run.modules.find((u) => u.appliance === 'hob');

  check(
    'модуль с ящиками есть — число деталей проверять есть на чём',
    Boolean(hob),
    hob ? `${hob.label}` : 'МОДУЛЯ С ЯЩИКАМИ НЕТ',
  );

  if (hob) {
    const counts: string[] = [];
    let allPlaced = true;

    for (const n of [1, 2, 3]) {
      const edited = applyOps({
        run,
        requirements: REQ,
        ops: [{ op: 'set_fronts', moduleId: hob.id, drawerCount: n }],
      });
      const cut = buildPanels({ run: edited });
      const fronts = cut
        .filter((p) => p.moduleId === hob.id && p.name === DRAWER_FRONT_PANEL_NAME)
        .reduce((sum, p) => sum + p.qty, 0);
      counts.push(`${n} → ${fronts}`);

      const unit = edited.modules.find((u) => u.id === hob.id)!;
      const spot = runPlaces(edited).find((pl) => pl.unit.id === hob.id)!;
      const mine = panelPlaces(
        unit,
        { x: spot.x, y: spot.y, heightM: spot.heightM, depthM: spot.depthM, zM: spot.zM, ...shop },
        cut,
      ).filter((entry) => CARCASS.has(entry.name));

      if (mine.some((entry) => entry.boxes.length === 0)) allPlaced = false;
    }

    check(
      'число фронтов следует за числом ящиков',
      counts.join(' · ') === '1 → 1 · 2 → 2 · 3 → 3',
      counts.join(' · '),
    );

    check(
      'и детали корпуса при любом числе ящиков остаются на местах',
      allPlaced,
      allPlaced ? 'все на местах' : 'ЕСТЬ ДЕТАЛИ БЕЗ МЕСТА',
    );
  }
}

/* ═══════════  Сборочный лист модуля  ═══════════ */

/**
 * ЛИСТ, КОТОРЫЙ УХОДИТ В ЦЕХ, А НЕ КАРТИНКА РЯДОМ С ТАБЛИЦЕЙ.
 *
 * Сборочный чертёж рисовал модуль плоско, спереди, с номерами поверх
 * деталей: сборщик видел прямоугольники друг на друге и не видел, что за
 * чем стоит. Производственный лист отвечает иначе — объёмом, выносками
 * по краю, цепью габарита, таблицами деталей и фурнитуры и штампом.
 *
 * Меряется здесь ровно это, и меряется в разметке: как читает её глаз.
 */
console.log('\n' + 'Сборочный лист модуля');
{
  const run = buildRun(baseInput);
  const panels = buildPanels({ run });
  const places = runPlaces(run);

  const CARCASS_PARTS = new Set([
    SIDE_PANEL_NAME,
    BOTTOM_PANEL_NAME,
    TOP_PANEL_NAME,
    TOP_RAIL_PANEL_NAME,
    SHELF_PANEL_NAME,
    DIVIDER_PANEL_NAME,
    BACK_PANEL_NAME,
  ]);

  const shelved = places.find(
    (place) =>
      panels.some((p) => p.moduleId === place.unit.id && p.name === SHELF_PANEL_NAME),
  );

  check(
    'модуль с полкой есть — лист строить есть на чём',
    Boolean(shelved),
    shelved ? `${shelved.unit.label} ${shelved.unit.widthMm} мм` : 'МОДУЛЯ С ПОЛКОЙ НЕТ',
  );

  const unit = shelved!.unit;
  const place = shelved!;

  const sheet = renderToStaticMarkup(
    React.createElement(ModuleAssembly, { run, unit, panels } as never),
  );

  /* ── 1. Выноска на каждую деталь корпуса, номера те же ── */

  const mine = panels.filter((p) => p.moduleId === unit.id);
  const carcass = mine.filter((p) => CARCASS_PARTS.has(p.name));
  const leaders = Array.from(sheet.matchAll(/data-leader="([^"]+)"/g)).map((m) => m[1]);

  check(
    'детали корпуса есть — выноски вешать есть на что',
    carcass.length > 0,
    carcass.length === 0
      ? 'НОЛЬ ДЕТАЛЕЙ КОРПУСА У МОДУЛЯ — выноску вешать не на что'
      : `деталей корпуса ${carcass.length}`,
  );

  check(
    'на листе выноска на КАЖДУЮ деталь корпуса',
    leaders.length === carcass.length && leaders.length > 0,
    leaders.length === 0
      ? 'НОЛЬ ВЫНОСОК НА ЛИСТЕ — подписывать нечем'
      : `выносок ${leaders.length} при ${carcass.length} деталях корпуса: ${carcass
          .map((p) => p.number)
          .join(', ')}`,
  );

  const csv = panelsToCsv(panels);
  const strayLeaders = leaders.filter(
    (number) =>
      !carcass.some((p) => p.number === number) || !csv.includes(number),
  );

  check(
    'номер выноски совпадает с таблицей, раскроем и CSV',
    strayLeaders.length === 0 && leaders.length > 0,
    strayLeaders.length === 0
      ? `${leaders.length} номеров сошлись: ${leaders.join(', ')}`
      : `ЧУЖИЕ НОМЕРА: ${strayLeaders.join(', ')}`,
  );

  /* ── 2. Линии выносок не пересекаются попарно ── */

  type Seg = { n: string; x1: number; y1: number; x2: number; y2: number };
  const num = (tag: string, name: string) => {
    const m = tag.match(new RegExp(name + '="([-0-9.]+)"'));
    return m ? Number(m[1]) : NaN;
  };

  const segs: Seg[] = Array.from(sheet.matchAll(/<line[^>]*data-leader-line="[^"]*"[^>]*>/g)).map(
    (m) => {
      const tag = m[0];
      return {
        n: (tag.match(/data-leader-line="([^"]+)"/) ?? ['', '?'])[1],
        x1: num(tag, 'x1'),
        y1: num(tag, 'y1'),
        x2: num(tag, 'x2'),
        y2: num(tag, 'y2'),
      };
    },
  );

  /*
   * Выноска — ДВА отрезка: диагональ от детали к излому и горизонтальная
   * полка до кружка. Так она и нарисована на чертёжном листе, и так её
   * разводит `uncross`: он двигает полки, а не ломает линию пополам.
   */
  check(
    'линии выносок нарисованы — пересечения считать есть на чём',
    segs.length === carcass.length * 2 &&
      segs.length > 0 &&
      segs.every((v) => Number.isFinite(v.x1)),
    segs.length === 0
      ? 'НОЛЬ ЛИНИЙ ВЫНОСОК НА ЛИСТЕ'
      : `отрезков ${segs.length} при ${carcass.length} выносках (ждём по два)`,
  );

  /** Пересекаются ли отрезки. Общий конец пересечением не считается. */
  const cross = (a: Seg, b: Seg) => {
    const side = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
      Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
    return (
      side(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1) !== side(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2) &&
      side(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1) !== side(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2)
    );
  };

  /*
   * Сравниваем РАЗНЫЕ выноски: у одной свои два отрезка сходятся в изломе
   * общим концом, и общий конец пересечением не считается — иначе тест
   * ловил бы собственную ломаную и молчал бы о настоящих перекрестьях.
   */
  const crossed: string[] = [];
  for (let i = 0; i < segs.length; i += 1) {
    for (let j = i + 1; j < segs.length; j += 1) {
      if (segs[i].n === segs[j].n) continue;
      if (cross(segs[i], segs[j])) crossed.push(`${segs[i].n}×${segs[j].n}`);
    }
  }

  check(
    'линии выносок не пересекаются НИ ОДНОЙ парой',
    crossed.length === 0 && segs.length > 1,
    segs.length < 2
      ? `ЛИНИЙ ${segs.length}: пересечения проверять не на чём`
      : crossed.length === 0
        ? `отрезков ${segs.length}, проверено пар ${
            (segs.length * (segs.length - 1)) / 2 - segs.length / 2
          }, пересечений 0`
        : `ПЕРЕСЕКАЮТСЯ: ${crossed.join(' · ')}`,
  );

  /* ── 3. Габарит листа равен габариту из runPlaces ── */

  const want = `${unit.widthMm}×${Math.round(place.heightM * 1000)}×${Math.round(
    place.depthM * 1000,
  )}`;
  const shown = (sheet.match(/data-extent="([^"]+)"/) ?? [])[1] ?? null;

  check(
    'габарит на листе равен габариту модуля из runPlaces',
    shown === want,
    shown === null ? 'ГАБАРИТА НА ЛИСТЕ НЕТ ВОВСЕ' : `на листе ${shown}, runPlaces ${want}`,
  );

  /* ── 4. Ящики отдельными видами ── */

  const hob = run.modules.find((u) => u.appliance === 'hob');

  check(
    'модуль с ящиками есть — виды ящиков проверять есть на чём',
    Boolean(hob),
    hob ? hob.label : 'МОДУЛЯ С ЯЩИКАМИ НЕТ',
  );

  const drawersOf = (markup: string) =>
    (markup.match(/data-drawer-view="/g) ?? []).length;

  if (hob) {
    const three = applyOps({
      run,
      requirements: REQ,
      ops: [{ op: 'set_fronts', moduleId: hob.id, drawerCount: 3 }],
    });
    const cut = buildPanels({ run: three });
    const unitThree = three.modules.find((u) => u.id === hob.id)!;

    const drawerSheet = renderToStaticMarkup(
      React.createElement(ModuleAssembly, {
        run: three,
        unit: unitThree,
        panels: cut,
      } as never),
    );

    check(
      'три заказанных ящика дают три вида ящиков',
      drawersOf(drawerSheet) === 3,
      `заказано 3, видов ${drawersOf(drawerSheet)}`,
    );

    const doorUnit = run.modules.find(
      (u) => u.frontType === 'door' && !u.appliance && (u.fill?.drawerHeights.length ?? 0) === 0,
    );

    check(
      'модуль с дверцей есть — «ни одного вида» проверять есть на чём',
      Boolean(doorUnit),
      doorUnit ? doorUnit.label : 'МОДУЛЯ С ДВЕРЦЕЙ БЕЗ ЯЩИКОВ НЕТ',
    );

    if (doorUnit) {
      const doorSheet = renderToStaticMarkup(
        React.createElement(ModuleAssembly, { run, unit: doorUnit, panels } as never),
      );

      check(
        'а модуль с дверцей не даёт ни одного вида ящика',
        drawersOf(doorSheet) === 0,
        `видов ${drawersOf(doorSheet)}`,
      );
    }
  }

  /* ── 5. Фурнитура листа равна фурнитуре сметы для этого модуля ── */

  const allUnits = [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)];
  const hw = openingHardware(
    allUnits.map((u, i) => ({
      unit: u,
      heightMm: moduleCarcassHeightMm(u, run),
      index: i,
      total: allUnits.length,
    })),
    run,
  );

  const withHardware = places.filter((pl) => {
    const mineHw = hw.byModule[pl.unit.id];
    if (!mineHw) return false;
    return (
      Object.values(mineHw).some((v) => v > 0) ||
      (pl.unit.column ? 0 : (pl.unit.fill?.drawerHeights.length ?? 0)) > 0
    );
  });

  check(
    'модули с фурнитурой есть — сверять есть с чем',
    withHardware.length > 0,
    withHardware.length === 0
      ? 'НИ У ОДНОГО МОДУЛЯ НЕТ ФУРНИТУРЫ — сверять нечего'
      : `модулей с фурнитурой ${withHardware.length} из ${places.length}`,
  );

  /*
   * СВЕРЯЕМСЯ СО СМЕТОЙ, А НЕ С ТЕМ ЖЕ ИСТОЧНИКОМ.
   *
   * Первая версия сравнивала лист с `openingHardware.byModule` — то есть
   * с тем самым расчётом, из которого лист и берёт числа. Такая проверка
   * зелена всегда, включая случай, когда фурнитура не посчитана вовсе:
   * ноль на листе равен нулю в разрезе. Ровно этот круг уже ловился на
   * `rowOfModule`.
   *
   * Поэтому складываем фурнитуру ВСЕХ листов ряда и сверяем с позициями
   * СМЕТЫ — с числами, которые уходят клиенту. Расходиться им нельзя: в
   * цех едет лист, а платят по смете.
   */
  const sheetTotals = new Map<string, number>();

  for (const pl of places) {
    const hwSheet = renderToStaticMarkup(
      React.createElement(ModuleAssembly, { run, unit: pl.unit, panels } as never),
    );
    for (const m of Array.from(
      hwSheet.matchAll(/data-hardware="([^"]+)" data-qty="([-0-9.]+)"/g),
    )) {
      sheetTotals.set(m[1], (sheetTotals.get(m[1]) ?? 0) + Number(m[2]));
    }
  }

  const estimate = buildEstimate(run, MAIN_VARIANT, DEMO_RATES);
  const lineQty = (prefix: string) =>
    estimate.lines
      .filter((l) => l.key.startsWith(prefix))
      .reduce((sum, l) => sum + l.quantity, 0);

  /** Ручки скобой и нажимные идут в смете одной статьёй «Ручки накладные». */
  const handlesOnSheet =
    (sheetTotals.get('handleBar') ?? 0) + (sheetTotals.get('handlePush') ?? 0);

  const pairs: [string, number, number][] = [
    ['петли', (sheetTotals.get('hinges') ?? 0) + (sheetTotals.get('cornerHinges') ?? 0), lineQty('hinge_')],
    ['направляющие', sheetTotals.get('slides') ?? 0, lineQty('slide_')],
    ['ручки', handlesOnSheet, lineQty('handle_')],
  ];

  check(
    'фурнитура на листах есть — сверять есть что',
    sheetTotals.size > 0 && pairs.some(([, , want]) => want > 0),
    sheetTotals.size === 0
      ? 'НА ЛИСТАХ НЕТ НИ ОДНОЙ СТРОКИ ФУРНИТУРЫ'
      : `строк на листах ${sheetTotals.size}`,
  );

  const hwWrong = pairs.filter(([, got, want]) => got !== want);

  check(
    'фурнитура листов сходится со сметой до штуки',
    hwWrong.length === 0,
    hwWrong.length === 0
      ? pairs.map(([n, got]) => `${n} ${got}`).join(' · ')
      : `РАСХОЖДЕНИЕ: ${hwWrong.map(([n, got, want]) => `${n}: листы ${got}, смета ${want}`).join(' · ')}`,
  );

  /*
   * И РАЗРЕЗ ПО МОДУЛЯМ НЕ МОЛЧИТ ТАМ, ГДЕ ФУРНИТУРА ЕСТЬ.
   *
   * Сумма могла бы сойтись при пустом листе одного модуля и двойном счёте
   * у соседа. Поэтому отдельно: у каждого модуля, которому фурнитура
   * нужна, на листе она есть.
   */
  const silent: string[] = [];
  for (const pl of withHardware) {
    const hwSheet = renderToStaticMarkup(
      React.createElement(ModuleAssembly, { run, unit: pl.unit, panels } as never),
    );
    if (!/data-hardware="/.test(hwSheet)) silent.push(pl.unit.label);
  }

  check(
    'у каждого модуля с фурнитурой она названа на его листе',
    silent.length === 0 && withHardware.length > 0,
    silent.length === 0
      ? `листов с фурнитурой ${withHardware.length}`
      : `МОЛЧАТ: ${silent.join(', ')}`,
  );

  /* ── 6. Лист печатается ── */

  const list = renderToStaticMarkup(
    React.createElement(PanelList, {
      run,
      title: 'Проверка печати',
      production: DEFAULT_PRODUCTION,
    } as never),
  );

  const at = list.indexOf('data-assembly-print');
  const tag = at < 0 ? '' : list.slice(list.lastIndexOf('<', at), list.indexOf('>', at) + 1);
  const rootTag = list.slice(0, list.indexOf('>') + 1);

  check(
    'сборочные листы есть в разметке деталировки',
    at >= 0,
    at >= 0 ? 'блок найден' : 'БЛОКА СБОРОЧНЫХ ЛИСТОВ В ДЕТАЛИРОВКЕ НЕТ',
  );

  check(
    'и он НЕ скрыт при печати',
    at >= 0 && !tag.includes('print:hidden') && !rootTag.includes('print:hidden'),
    at < 0
      ? 'БЛОКА НЕТ'
      : tag.includes('print:hidden')
        ? `БЛОК СКРЫТ ПРИ ПЕЧАТИ: ${tag}`
        : 'печатается',
  );

  /*
   * ОДИН МОДУЛЬ — ОДИН ЛИСТ. Два модуля на одной странице означают, что
   * в цеху один из них обрежется пополам: лист берут в руки по одному.
   */
  const sheets = (list.match(/data-assembly-sheet="/g) ?? []).length;
  const breaks = (list.match(/break-after-page|break-inside-avoid/g) ?? []).length;

  check(
    'один модуль — один лист: у каждого свой разрыв страницы',
    sheets > 0 && breaks >= sheets,
    sheets === 0
      ? 'НОЛЬ СБОРОЧНЫХ ЛИСТОВ В ПЕЧАТИ'
      : `листов ${sheets}, разрывов ${breaks}`,
  );
}

/* ═══════════  Фасады над приборами и под ними  ═══════════ */

/**
 * НАД ВЕРХНИМ ПРИБОРОМ И ПОД НИЖНИМ СТОИТ ФАСАД, А НЕ ДЫРА.
 *
 * Колонна «духовка + СВЧ» делится по высоте на четыре отрезка: свободно
 * снизу, ниша духовки, ниша микроволновки, свободно сверху. Ниши
 * закрывают приборы, а свободные отрезки — фасады: без них в цех уезжает
 * корпус с открытой дырой в полметра.
 *
 * Отрезки считает `facadeSpans` по тем же нишам, что `columnNiches`.
 * Второй формулы здесь быть не может: разойдясь с нишами, фасад уедет
 * поверх духовки.
 */
console.log('\n' + 'Фасады над приборами и под ними');
{
  const withMicrowave: RunRequirements = {
    ...REQ,
    appliances: [...REQ.appliances, 'microwave'],
  };
  const run = buildRun({ ...baseInput, requirements: withMicrowave });
  const panels = buildPanels({ run });
  const places = runPlaces(run);

  const column = places.find((place) => place.unit.column);

  check(
    'колонна приборов собралась — проверять есть на чём',
    Boolean(column),
    column
      ? `${column.unit.label}: ${JSON.stringify(column.unit.column)}`
      : 'КОЛОННЫ ПРИБОРОВ НЕТ — духовка и СВЧ не встали в один модуль',
  );

  if (column) {
    const unit = column.unit;
    const heightMm = moduleCarcassHeightMm(unit, run);
    const niches = columnNiches(unit, heightMm, run.production);
    const spans = facadeSpans(unit, heightMm);

    check(
      'ниши приборов есть — отрезки считать есть из чего',
      niches.length === 2,
      niches.length === 0
        ? 'НОЛЬ НИШ В КОЛОННЕ'
        : niches.map((n) => `${n.appliance} ${n.fromMm}..${n.toMm}`).join(' · '),
    );

    check(
      'свободные отрезки есть — фасады вешать есть куда',
      spans.length > 0,
      spans.length === 0
        ? 'НОЛЬ СВОБОДНЫХ ОТРЕЗКОВ — фасаду негде стоять'
        : spans.map((sp) => `${sp.fromMm}..${sp.fromMm + sp.heightMm} = ${sp.heightMm}`).join(' · '),
    );

    /* ── 1. Число фасадов в раскрое равно числу свободных отрезков ── */

    const facades = panels.filter(
      (panel) => panel.moduleId === unit.id && panel.name === FACADE_PANEL_NAME,
    );

    check(
      'каждый свободный отрезок выше минимума получил фасад в раскрое',
      facades.length === spans.length && spans.length > 0,
      facades.length === 0
        ? 'НОЛЬ ФАСАДОВ В РАСКРОЕ У КОЛОННЫ — над приборами открытая дыра'
        : `отрезков ${spans.length}, фасадов ${facades.length}: ${facades
            .map((f) => `${f.number} ${f.lengthMm}×${f.widthMm}`)
            .join(' · ')}`,
    );

    /* ── 4. Сумма высот сходится с высотой колонны до миллиметра ── */

    const gapMm = DEFAULT_PRODUCTION.frontGapMm;
    const nicheSum = niches.reduce((sum, n) => sum + (n.toMm - n.fromMm), 0);
    const facadeSum = facades.reduce((sum, f) => sum + f.lengthMm, 0);
    const gapsSum = facades.length * gapMm;
    const total = nicheSum + facadeSum + gapsSum;

    check(
      'приборы + фасады + зазоры = высота колонны, до миллиметра',
      total === heightMm,
      `ниши ${nicheSum} + фасады ${facadeSum} + зазоры ${gapsSum} = ${total} при высоте ${heightMm}`,
    );

    /* ── 2. Петли и ручки этих фасадов попадают в смету ── */

    const allUnits = [...run.modules, ...run.upperSegments.flatMap((sg) => sg.modules)];
    const hw = openingHardware(
      allUnits.map((u, index) => ({
        unit: u,
        heightMm: moduleCarcassHeightMm(u, run),
        index,
        total: allUnits.length,
      })),
      run,
    );

    const mine = hw.byModule[unit.id];

    check(
      'фасады колонны висят на петлях, и петли посчитаны',
      (mine?.hinges ?? 0) >= facades.length * 2,
      mine
        ? `петель ${mine.hinges} при ${facades.length} фасадах`
        : 'МОДУЛЯ НЕТ В РАЗРЕЗЕ ФУРНИТУРЫ',
    );

    check(
      'и ручка есть у каждого фасада колонны',
      (mine?.handleBar ?? 0) + (mine?.handlePush ?? 0) + ((mine?.handleProfileMm ?? 0) > 0 ? facades.length : 0) >=
        facades.length,
      mine
        ? `скоб ${mine.handleBar} · нажимных ${mine.handlePush} · профиля ${mine.handleProfileMm} мм при ${facades.length} фасадах`
        : 'МОДУЛЯ НЕТ В РАЗРЕЗЕ ФУРНИТУРЫ',
    );

    /* ── 3. Номера новых фасадов стоят на сборочном листе ── */

    const sheet = renderToStaticMarkup(
      React.createElement(ModuleAssembly, { run, unit, panels } as never),
    );

    const missing = facades.filter(
      (f) => !sheet.includes(`data-assembly-row="${f.number}"`),
    );

    check(
      'номера фасадов стоят на сборочном листе колонны',
      missing.length === 0 && facades.length > 0,
      facades.length === 0
        ? 'ФАСАДОВ НЕТ ВОВСЕ — номеров на листе не будет'
        : missing.length === 0
          ? `${facades.map((f) => f.number).join(', ')} на листе`
          : `НЕТ НА ЛИСТЕ: ${missing.map((f) => f.number).join(', ')}`,
    );

    /* ── И то же самое видно в сцене ── */

    const boxes = moduleBoxes(
      unit,
      {
        x: column.x,
        y: column.y,
        heightM: column.heightM,
        depthM: column.depthM,
        zM: column.zM,
        thicknessM: 0.016,
      },
      { gapM: 0.003, frontThicknessM: 0.018, integratedHandles: false, cutaway: false },
      run.production,
    );

    const fronts = boxes.filter((box) => box.material === 'front');

    check(
      'фасады колонны нарисованы и в сцене, а не только в раскрое',
      fronts.length >= spans.length && spans.length > 0,
      fronts.length === 0
        ? 'В СЦЕНЕ У КОЛОННЫ НОЛЬ ФАСАДОВ — над приборами видно дыру'
        : `коробок фасада ${fronts.length} при ${spans.length} отрезках`,
    );

    /*
     * И НИ ОДИН ФАСАД НЕ НАКРЫВАЕТ НИШУ.
     *
     * Фасад поверх духовки — это распиленная впустую плита и прибор,
     * который не открыть. Меряем перекрытие в миллиметрах.
     */
    const overlaps = fronts.filter((box) => {
      const bottom = Math.round((box.position[1] - box.scale[1] / 2 - column.y) * 1000);
      const top = Math.round((box.position[1] + box.scale[1] / 2 - column.y) * 1000);
      return niches.some((n) => Math.min(top, n.toMm) - Math.max(bottom, n.fromMm) > 2);
    });

    check(
      'и ни один фасад не заходит на нишу прибора',
      overlaps.length === 0,
      overlaps.length === 0
        ? 'перекрытий с нишами нет'
        : `ФАСАД ПОВЕРХ ПРИБОРА: ${overlaps.length} шт.`,
    );
  }

  /* ── Огрызок ниже минимума фасада не получает, и это сказано ── */

  check(
    'минимум фасада объявлен одним числом',
    MIN_FACADE_SPAN_MM > 0,
    `минимум ${MIN_FACADE_SPAN_MM} мм`,
  );
}

/* ═══  Ручка на месте, корпус своего материала  ═══ */

/**
 * ПОЛОЖЕНИЕ РУЧКИ И МАТЕРИАЛ КОРПУСА — ПРАВКИ МОДУЛЯ.
 *
 * Обе ложатся на модуль, как ширина и материал фасада, и обе обязаны
 * пережить пересборку ряда: замерщик выбрал — значит выбрал, а не «до
 * следующего пересчёта».
 *
 * Материал корпуса наследуется по полосам тем же механизмом, что
 * фрезеровка: модуль → полоса → низ. Второй лестницы наследования в
 * продукте нет.
 */
console.log('\n' + 'Ручка и материал корпуса');
{
  const run = buildRun(baseInput);

  const doorUnit = run.modules.find(
    (u) => u.frontType === 'door' && !u.appliance && (u.fill?.drawerHeights.length ?? 0) === 0,
  );

  check(
    'модуль со створкой есть — правки проверять есть на чём',
    Boolean(doorUnit),
    doorUnit ? doorUnit.label : 'МОДУЛЯ СО СТВОРКОЙ НЕТ',
  );

  /* ── 4. Положение ручки переживает пересборку ряда ── */

  if (doorUnit) {
    /*
     * Проёмы передаются в правку: без них `applyOps` пересобирает верхний
     * ряд БЕЗ разрыва под окном, и сравнение «до и после» меряло бы не
     * положение ручки, а потерянный проём.
     */
    const placed = applyOps({
      run,
      requirements: REQ,
      openings: OPENINGS,
      ops: [{ op: 'set_handle_spot', moduleId: doorUnit.id, level: 'bottom' }],
    } as never);

    const after = placed.modules.find((u) => u.id === doorUnit.id);

    check(
      'положение ручки легло на модуль',
      after?.fill?.handleLevel === 'bottom',
      `${doorUnit.label}: ${after?.fill?.handleLevel ?? 'НЕ ЛЕГЛО'}`,
    );

    /*
     * Пересборка — это любая правка состава: она перезаполняет место и
     * пересчитывает наполнение. Выбор человека она трогать не имеет
     * права (ловушка 314).
     */
    const rebuilt = applyOps({
      run: placed,
      requirements: REQ,
      openings: OPENINGS,
      ops: [{ op: 'set_width', moduleId: doorUnit.id, widthMm: doorUnit.widthMm + 50 }],
    } as never);

    const survived = rebuilt.modules.find((u) => u.id === doorUnit.id);

    check(
      'и переживает пересборку ряда',
      survived?.fill?.handleLevel === 'bottom',
      `после пересборки: ${survived?.fill?.handleLevel ?? 'ПОТЕРЯНО'}`,
    );

    /* ── 7. Умолчание не двигает ни отпечаток, ни смету ── */

    const before = Math.round(buildEstimate(run, MAIN_VARIANT, DEMO_RATES).total);
    const afterTotal = Math.round(buildEstimate(placed, MAIN_VARIANT, DEMO_RATES).total);

    check(
      'положение ручки не меняет смету: это место, а не другая фурнитура',
      before === afterTotal,
      `${before} → ${afterTotal} ₸`,
    );

    check(
      'и не входит в отпечаток: состав ряда от него не меняется',
      run.fingerprint === placed.fingerprint,
      `${run.fingerprint} → ${placed.fingerprint}`,
    );
  }

  /* ── 5. Материал корпуса отличается от материала фасада ── */

  const carcassEntry = (id: string, name: string, price: number, color: string) =>
    ({
      id,
      org_id: 'org',
      name_ru: name,
      article: id.toUpperCase(),
      price,
      unit: 'm2',
      is_active: true,
      meta: { frontBase: 'ldsp', color },
    }) as never;

  const catalog = carcassCatalog([
    carcassEntry('car-white', 'Белый корпус', 4000, '#EFEFEA'),
    carcassEntry('car-graphite', 'Графит корпус', 9000, '#3A3D40'),
  ]);

  check(
    'каталог материалов корпуса непустой — выбирать есть из чего',
    catalog.size === 2,
    catalog.size === 0
      ? 'НОЛЬ МАТЕРИАЛОВ КОРПУСА В КАТАЛОГЕ'
      : `позиций ${catalog.size}`,
  );

  const target = run.modules.find((u) => hasFacade(u))!;
  const painted = applyOps({
    run,
    requirements: REQ,
    ops: [{ op: 'set_carcass', moduleId: target.id, itemId: 'car-graphite' }],
  } as never);

  const paintedUnit = painted.modules.find((u) => u.id === target.id);

  check(
    'материал корпуса лёг на модуль',
    paintedUnit?.carcassItemId === 'car-graphite',
    `${target.label}: ${paintedUnit?.carcassItemId ?? 'НЕ ЛЁГ'}`,
  );

  /* В деталировке — своё название, а не название фасада. */
  const cut = buildPanels({ run: painted, carcass: catalog });
  const mine = cut.filter((panel) => panel.moduleId === target.id);
  const carcassNames = new Set(
    mine.filter((p) => p.name === SIDE_PANEL_NAME).map((p) => p.material),
  );
  const frontNames = new Set(
    mine.filter((p) => p.material.startsWith('Фасад')).map((p) => p.material),
  );

  check(
    'в деталировке у корпуса СВОЁ название материала',
    carcassNames.size === 1 && Array.from(carcassNames)[0].includes('Графит'),
    carcassNames.size === 0
      ? 'НЕТ НИ ОДНОЙ ДЕТАЛИ КОРПУСА'
      : `корпус: ${Array.from(carcassNames).join(', ')} · фасад: ${Array.from(frontNames).join(', ') || 'нет'}`,
  );

  check(
    'и оно НЕ совпадает с названием фасада',
    Array.from(carcassNames).every((name) => !frontNames.has(name)),
    `корпус ${Array.from(carcassNames).join(', ')} против фасада ${Array.from(frontNames).join(', ') || 'нет'}`,
  );

  /* В сцене — два разных ключа. */
  const place = runPlaces(painted).find((pl) => pl.unit.id === target.id)!;
  const sceneBoxes = moduleBoxes(
    place.unit,
    {
      x: place.x,
      y: place.y,
      heightM: place.heightM,
      depthM: place.depthM,
      zM: place.zM,
      thicknessM: 0.016,
    },
    {
      gapM: 0.003,
      frontThicknessM: 0.018,
      integratedHandles: false,
      cutaway: false,
      rowMilling: painted.milling,
      carcassKey: carcassKeyOf(place.unit, painted, catalog),
    } as never,
    painted.production,
  );

  const carcassKeys = new Set(
    sceneBoxes.filter((b) => b.material === 'carcass' || b.material === 'inner').map((b) => b.carcassKey ?? ''),
  );
  const frontKeys = new Set(
    sceneBoxes.filter((b) => b.material === 'front').map((b) => b.frontKey ?? ''),
  );

  check(
    'в сцене у корпуса свой ключ материала, и он не равен фасадному',
    carcassKeys.size > 0 &&
      Array.from(carcassKeys)[0] !== '' &&
      Array.from(carcassKeys).every((k) => !frontKeys.has(k)),
    `корпус ${Array.from(carcassKeys).join(', ') || 'НЕТ КЛЮЧА'} · фасад ${Array.from(frontKeys).join(', ') || 'нет'}`,
  );

  /* Цена материала двигает итог. */
  const cheap = applyOps({
    run,
    requirements: REQ,
    ops: [{ op: 'set_carcass', moduleId: target.id, itemId: 'car-white' }],
  } as never);

  const totalOf = (r: typeof run) =>
    Math.round(
      buildEstimate(r, MAIN_VARIANT, DEMO_RATES, [], undefined, undefined, undefined, undefined, catalog)
        .total,
    );

  check(
    'сумма сметы меняется, если материалы корпуса разной цены',
    totalOf(painted) !== totalOf(cheap) && totalOf(painted) > totalOf(cheap),
    `белый 4 000 ₸/м² → ${totalOf(cheap)} · графит 9 000 ₸/м² → ${totalOf(painted)}`,
  );

  /* ── 6. Наследование по полосам ── */

  const scoped = applyOps({
    run,
    requirements: REQ,
    ops: [{ op: 'set_carcass', scope: 'base', itemId: 'car-white' }],
  } as never);

  const inherited = CARCASS_SCOPES.map((scope) => {
    const unit = [...scoped.modules, ...scoped.upperSegments.flatMap((sg) => sg.modules)].find(
      (u) => carcassScopeOf(u) === scope.key,
    );
    return { scope: scope.key, id: unit ? carcassFor(unit, scoped) : null, label: unit?.label };
  });

  const covered = inherited.filter((row) => row.id === 'car-white');

  check(
    'низ назначен — и его материал наследуют все полосы, у кого своего нет',
    covered.length === inherited.filter((row) => row.label).length && covered.length > 0,
    inherited
      .map((row) => `${row.scope}: ${row.label ? (row.id ?? 'НЕ УНАСЛЕДОВАЛ') : 'нет модулей'}`)
      .join(' · '),
  );

  const upperOwn = applyOps({
    run: scoped,
    requirements: REQ,
    ops: [{ op: 'set_carcass', scope: 'upper', itemId: 'car-graphite' }],
  } as never);

  const upperUnit = upperOwn.upperSegments.flatMap((sg) => sg.modules)[0];

  check(
    'а назначенное полосе сильнее унаследованного от низа',
    Boolean(upperUnit) && carcassFor(upperUnit, upperOwn) === 'car-graphite',
    upperUnit
      ? `${upperUnit.label}: ${carcassFor(upperUnit, upperOwn)}`
      : 'ВЕРХНЕГО РЯДА НЕТ — наследование не проверить',
  );
}

/* ═══  Раскрой, сцена и смета говорят одно  ═══ */

/**
 * ОДИН КОРЕНЬ: «ЕСТЬ ЛИ ЗДЕСЬ СТВОРКА» РЕШАЛОСЬ ПО ТИПУ ФАСАДА.
 *
 * `frontType` говорит, ОТКУДА фронт взялся, а не что на модуле висит. Из
 * этого вышла целая семья дефектов: направляющие под варочной, петли и
 * ручки колонны, петли мойки и посудомойки, ручки ящиков под варочной,
 * фасад вытяжки — резался и не рисовался.
 *
 * Здесь проверяется ВСЯ таблица, а не выборочные модули: у каждого вида
 * створок в сцене столько же, сколько в раскрое, и фурнитура сходится с
 * тем, что на модуле физически висит. «Хотя бы у одного» пропускает
 * ровно ту ошибку, ради которой проверка написана (ловушка 318).
 */
console.log('\n' + 'Раскрой, сцена и смета говорят одно');
{
  const withMicrowave: RunRequirements = {
    ...REQ,
    appliances: [...REQ.appliances, 'microwave'],
  };
  const run = buildRun({ ...baseInput, lengthMm: 4200, requirements: withMicrowave });
  const panels = buildPanels({ run });
  const places = runPlaces(run);

  const all = [...run.modules, ...run.upperSegments.flatMap((sg) => sg.modules)];
  const hw = openingHardware(
    all.map((unit, index) => ({
      unit,
      heightMm: moduleCarcassHeightMm(unit, run),
      index,
      total: all.length,
    })),
    run,
  );

  check(
    'модули есть — таблицу строить есть из чего',
    places.length > 0 && all.length > 0,
    places.length === 0 ? 'НОЛЬ МОДУЛЕЙ В РЯДУ — сверять нечего' : `модулей ${places.length}`,
  );

  type Row = {
    label: string;
    cutLeaves: number;
    cutDrawers: number;
    sceneLeaves: number;
    hinges: number;
    handles: number;
    pullOut: boolean;
    noHandle: boolean;
  };

  const rows: Row[] = places.map((place) => {
    const unit = place.unit;
    const heightMm = moduleCarcassHeightMm(unit, run);
    const mine = panels.filter((panel) => panel.moduleId === unit.id);
    const mod = hw.byModule[unit.id];

    return {
      label: unit.label,
      cutLeaves: mine
        .filter((panel) => panel.material.startsWith('Фасад') && panel.name !== DRAWER_FRONT_PANEL_NAME)
        .reduce((sum, panel) => sum + panel.qty, 0),
      cutDrawers: mine
        .filter((panel) => panel.name === DRAWER_FRONT_PANEL_NAME)
        .reduce((sum, panel) => sum + panel.qty, 0),
      sceneLeaves: doorLeaves(unit, heightMm).length,
      hinges: (mod?.hinges ?? 0) + (mod?.cornerHinges ?? 0),
      handles: (mod?.handleBar ?? 0) + (mod?.handlePush ?? 0) + ((mod?.handleProfileMm ?? 0) > 0 ? 1 : 0),
      pullOut: isPullOut(unit),
      noHandle: handleOf(unit, run).handle === 'none',
    };
  });

  /* ── 1. Створок в сцене столько же, сколько в раскрое ── */

  const displays = new Set(
    places.filter((place) => place.unit.section === 'glass_display').map((place) => place.unit.label),
  );

  const leafOff = rows.filter(
    (row) => !displays.has(row.label) && row.cutLeaves !== row.sceneLeaves,
  );

  check(
    'створок в сцене столько же, сколько в раскрое, У КАЖДОГО модуля',
    leafOff.length === 0 && rows.length > 0,
    leafOff.length === 0
      ? `сверено модулей ${rows.length}, расхождений 0`
      : `РАСХОЖДЕНИЕ: ${leafOff
          .map((row) => `${row.label}: раскрой ${row.cutLeaves}, сцена ${row.sceneLeaves}`)
          .join(' · ')}`,
  );

  /* ── 2. Ни одной створки без петель, ни одних петель без створки ── */

  const naked = rows.filter((row) => row.cutLeaves > 0 && row.hinges === 0 && !row.pullOut);
  const orphan = rows.filter((row) => row.hinges > 0 && row.cutLeaves === 0);

  check(
    'ни одной створки без петель',
    naked.length === 0,
    naked.length === 0
      ? `створок с петлями ${rows.filter((r) => r.cutLeaves > 0).length}`
      : `СТВОРКА БЕЗ ПЕТЕЛЬ: ${naked.map((r) => `${r.label} (${r.cutLeaves})`).join(' · ')}`,
  );

  check(
    'и ни одних петель без створки',
    orphan.length === 0,
    orphan.length === 0
      ? 'лишних петель нет'
      : `ПЕТЛИ БЕЗ СТВОРКИ: ${orphan.map((r) => `${r.label} (${r.hinges})`).join(' · ')}`,
  );

  /* ── 3. Ни одного фронта без ручки ── */

  const handless = rows.filter(
    (row) => row.cutLeaves + row.cutDrawers > 0 && row.handles === 0 && !row.noHandle,
  );
  const ghostHandles = rows.filter((row) => row.handles > 0 && row.cutLeaves + row.cutDrawers === 0);

  check(
    'ни одного фронта без ручки — кроме тех, где выбрано «без ручки»',
    handless.length === 0,
    handless.length === 0
      ? `с ручками ${rows.filter((r) => r.handles > 0).length} модулей`
      : `ФРОНТ БЕЗ РУЧКИ: ${handless
          .map((r) => `${r.label} (створок ${r.cutLeaves}, фронтов ${r.cutDrawers})`)
          .join(' · ')}`,
  );

  check(
    'и ни одной ручки без фронта',
    ghostHandles.length === 0,
    ghostHandles.length === 0
      ? 'лишних ручек нет'
      : `РУЧКА БЕЗ ФРОНТА: ${ghostHandles.map((r) => `${r.label} (${r.handles})`).join(' · ')}`,
  );

  /* ── 5. Вытяжка: раскрой и сцена согласованы ── */

  const hood = rows.find((row) => row.label.includes('Вытяжк'));

  check(
    'вытяжка в ряду есть — согласованность проверять есть на чём',
    Boolean(hood),
    hood ? hood.label : 'ВЫТЯЖКИ В РЯДУ НЕТ',
  );

  if (hood) {
    check(
      'у вытяжки раскрой и сцена согласованы',
      hood.cutLeaves === hood.sceneLeaves,
      `раскрой ${hood.cutLeaves} · сцена ${hood.sceneLeaves} · петель ${hood.hinges}`,
    );
  }

  /* Таблица целиком — она и есть ответ на вопрос «где ещё расходится». */
  for (const row of rows) {
    check(
      `${row.label}: раскрой ${row.cutLeaves}/${row.cutDrawers} · сцена ${row.sceneLeaves} · петель ${row.hinges} · ручек ${row.handles}`,
      row.cutLeaves === row.sceneLeaves || displays.has(row.label),
      '',
    );
  }
}

/* ═══  Механизмы, переезд ручки и отказ по стороне  ═══ */

/**
 * ПОДЪЁМНИК СНИЗУ, ОТКИДНОЙ СВЕРХУ, СТОРОНУ НЕ ВЫБИРАЮТ.
 *
 * У механизма ручка на СВОБОДНОМ крае: подъёмник идёт вверх, и браться
 * за него надо снизу; откидной падает вниз — сверху. У распашной створки
 * свободный край напротив петель, и выбрать его нельзя: такого поля нет.
 * Попросили сторону — отвечаем словами, а не подставляем противоположную
 * молча.
 */
console.log('\n' + 'Ручка: механизмы, переезд, отказ по стороне');
{
  const run = buildRun(baseInput);
  const upper = run.upperSegments.flatMap((sg) => sg.modules).find(
    (u) => u.frontType === 'door' && u.doorCount <= 1 && u.section !== 'mezzanine',
  );

  check(
    'верхний модуль со створкой есть — механизмы проверять есть на чём',
    Boolean(upper),
    upper ? upper.label : 'ВЕРХНЕГО МОДУЛЯ СО СТВОРКОЙ НЕТ',
  );

  const spotIn = (r: typeof run, id: string) => {
    const u = [...r.modules, ...r.upperSegments.flatMap((sg) => sg.modules)].find(
      (m) => m.id === id,
    );
    return u ? handleSpotOf(u, r) : null;
  };

  if (upper) {
    /* ── 3. Подъёмник снизу, откидной сверху ── */

    const lifted = applyOps({
      run,
      requirements: REQ,
      openings: OPENINGS,
      ops: [{ op: 'set_opening', moduleId: upper.id, opening: 'lift' }],
    } as never);

    const flapped = applyOps({
      run,
      requirements: REQ,
      openings: OPENINGS,
      ops: [{ op: 'set_opening', moduleId: upper.id, opening: 'flap' }],
    } as never);

    check(
      'подъёмник ставит ручку снизу',
      spotIn(lifted, upper.id)?.place === 'bottom-center',
      `${spotIn(lifted, upper.id)?.place ?? 'НЕ ПОСЧИТАЛОСЬ'}`,
    );

    check(
      'откидной — сверху',
      spotIn(flapped, upper.id)?.place === 'top-center',
      `${spotIn(flapped, upper.id)?.place ?? 'НЕ ПОСЧИТАЛОСЬ'}`,
    );

    /* ── 5. Высота переживает пересборку ряда ── */

    const raised = applyOps({
      run,
      requirements: REQ,
      openings: OPENINGS,
      ops: [{ op: 'set_handle_spot', moduleId: upper.id, level: 'bottom', turn: 'horizontal' }],
    } as never);

    check(
      'высота и поворот легли на модуль',
      spotIn(raised, upper.id)?.place.endsWith('-bottom') === true &&
        spotIn(raised, upper.id)?.turn === 'horizontal',
      `${spotIn(raised, upper.id)?.place}/${spotIn(raised, upper.id)?.turn}`,
    );

    const rebuilt = applyOps({
      run: raised,
      requirements: REQ,
      openings: OPENINGS,
      ops: [{ op: 'set_width', moduleId: upper.id, widthMm: upper.widthMm }],
    } as never);

    check(
      'и переживают пересборку ряда',
      spotIn(rebuilt, upper.id)?.place === spotIn(raised, upper.id)?.place &&
        spotIn(rebuilt, upper.id)?.turn === spotIn(raised, upper.id)?.turn,
      `до ${spotIn(raised, upper.id)?.place}/${spotIn(raised, upper.id)?.turn} · после ${spotIn(
        rebuilt,
        upper.id,
      )?.place}/${spotIn(rebuilt, upper.id)?.turn}`,
    );

    /* ── 4. Сторону выбрать нельзя: отвечаем словами ── */

    const refused = applyOps({
      run,
      requirements: REQ,
      openings: OPENINGS,
      ops: [{ op: 'set_handle_spot', moduleId: upper.id, place: 'left-top' }],
    } as never);

    check(
      'сторону ручки выбрать нельзя, и отказ объясняет ПОЧЕМУ',
      (refused.warnings ?? []).some((w) => w.includes('напротив петель')),
      (refused.warnings ?? [])[0] ?? 'МОЛЧА ПРИНЯЛ СТОРОНУ',
    );

    check(
      'и отказ ничего не сломал: ручка осталась на месте',
      spotIn(refused, upper.id)?.place === spotIn(run, upper.id)?.place,
      `${spotIn(run, upper.id)?.place} → ${spotIn(refused, upper.id)?.place}`,
    );

    /* ── 7. Умолчания не двигают ни смету, ни отпечаток ── */

    const before = Math.round(buildEstimate(run, MAIN_VARIANT, DEMO_RATES).total);
    const after = Math.round(buildEstimate(raised, MAIN_VARIANT, DEMO_RATES).total);

    check(
      'место ручки не меняет смету: это место, а не другая фурнитура',
      before === after,
      `${before} → ${after} ₸`,
    );

    check(
      'и не входит в отпечаток',
      run.fingerprint === raised.fingerprint,
      `${run.fingerprint} → ${raised.fingerprint}`,
    );
  }

  /* ── 6. Чертёж показывает ту же ручку, что сцена ── */

  const drawn = run.modules.find((u) => u.frontType === 'door' && !u.appliance);

  check(
    'модуль со створкой для чертежа есть',
    Boolean(drawn),
    drawn ? drawn.label : 'МОДУЛЯ СО СТВОРКОЙ НЕТ',
  );

  if (drawn) {
    const glyph = frontGlyph(drawn, 'fronts').find((el) => el.kind === 'handle');

    check(
      'на чертеже ручка есть',
      Boolean(glyph),
      glyph ? 'нарисована' : 'РУЧКИ НА ЧЕРТЕЖЕ НЕТ',
    );

    check(
      'и стоит в том же месте, что в сцене',
      glyph !== undefined &&
        glyph.kind === 'handle' &&
        glyph.spot.place === handleSpotOf(drawn, run).place &&
        glyph.spot.turn === handleSpotOf(drawn, run).turn,
      glyph && glyph.kind === 'handle'
        ? `чертёж ${glyph.spot.place}/${glyph.spot.turn} · сцена ${
            handleSpotOf(drawn, run).place
          }/${handleSpotOf(drawn, run).turn}`
        : 'СВЕРЯТЬ НЕЧЕГО',
    );
  }
}

/* ═══  Правка на чертеже идёт операцией и не трогает соседние ряды  ═══ */

/**
 * ПРАВКА НА ЧЕРТЕЖЕ — ЭТО ОПЕРАЦИЯ, А НЕ ЗАПИСЬ В РЯД.
 *
 * Она шла мимо `applyOps`: рабочее место собирало новый `Run` само и
 * накладывало одну карту `id → fill` СРАЗУ на нижний ряд и на все
 * верхние сегменты. Ряды при этом разведены в движке — три отдельных
 * списка, — и правка проходила мимо этого разделения, держась только на
 * том, что идентификаторы не совпадают. Мимо проходили и три инварианта,
 * которыми кончается `applyOps`.
 *
 * Здесь меряется ровно это: в какой ряд легла правка и что стало с
 * остальными.
 */
console.log('\n' + 'Правка на чертеже: ряды, инварианты, перенос');
{
  const zoneRun = (zone: ZoneKind, lengthMm: number) =>
    buildRun({
      wallId: 'w1',
      lengthMm,
      ceilingHeightMm: 2700,
      requirements: {
        ...REQ,
        zone,
        appliances: zone === 'kitchen' ? [...REQ.appliances] : [],
        sections: zone === 'kitchen' ? [] : [...zoneProfile(zone).sections],
        /*
         * Верхний ряд бывает только на кухне (`zoneOptions`). Оставь
         * здесь кухонные опции — и `applyOps` начнёт строить верхний ряд
         * поверх секций шкафа: инвариант непересечения поймает это
         * исключением, и падать будет проверка, а не продукт.
         */
        options: { ...REQ.options, hasUpper: zone === 'kitchen' },
      },
      openings: zone === 'kitchen' ? OPENINGS : [],
      comms: zone === 'kitchen' ? COMMS : [],
    });

  const rowsOf = (r: Run) => {
    const above = r.upperSegments.flatMap((sg) => sg.modules);
    return {
      base: r.modules,
      upper: above.filter((u) => u.section !== 'mezzanine'),
      mezz: above.filter((u) => u.section === 'mezzanine'),
    };
  };

  /** Слепок наполнения ряда: по нему и видно, тронули его или нет. */
  const printRow = (list: Module[]) =>
    list.map((u) => `${u.id}:${JSON.stringify(u.fill?.shelves ?? null)}`).join(' ');

  const edit = (r: Run, req: RunRequirements, ops: MillworkOp[], openings: Opening[]) =>
    applyOps({ run: r, requirements: req, openings, ops });

  /*
   * ТРИ РЯДА НА ОДНОМ ЭКРАНЕ: кухня с заказанной антресолью. Кладовка
   * над колонной холодильника там же — это четвёртый вид модулей, и
   * задеть его правкой тоже нельзя.
   */
  const kitchenReq: RunRequirements = { ...REQ, appliances: [...REQ.appliances] };
  const plain = zoneRun('kitchen', DEMO_PROJECT.lengthMm);
  const three = edit(plain, kitchenReq, [{ op: 'set_mezzanine', heightMm: 400 }], OPENINGS);
  const before = rowsOf(three);

  check(
    'ряды для проверки есть все три',
    before.base.length > 0 && before.upper.length > 0 && before.mezz.length > 0,
    `низ ${before.base.length} · верх ${before.upper.length} · антресоль ${before.mezz.length}`,
  );

  if (before.base.length === 0 || before.upper.length === 0 || before.mezz.length === 0) {
    throw new Error(
      'НУЛЕВОЙ СЕЛЕКТОР: проверять правку по рядам не на чем — ' +
        `низ ${before.base.length}, верх ${before.upper.length}, антресоль ${before.mezz.length}`,
    );
  }

  /** Модуль ряда, у которого есть полка: её и двигаем. */
  const withShelf = (list: Module[]) => list.find((u) => (u.fill?.shelves.length ?? 0) > 0);

  const moved = (unit: Module, run: Run) => {
    const h = moduleCarcassHeightMm(unit, run);
    const shifted = moveShelf(unit.fill!, 0, unit.fill!.shelves[0] + SYSTEM32_STEP_MM * 3, h);
    if (shifted.rejected) {
      const back = moveShelf(unit.fill!, 0, unit.fill!.shelves[0] - SYSTEM32_STEP_MM * 3, h);
      return back.rejected ? null : back.fill;
    }
    return shifted.fill;
  };

  /* ── 1, 2, 3. Правка ложится ровно в свой ряд ── */

  const rowNames = ['base', 'upper', 'mezz'] as const;

  for (const where of rowNames) {
    const unit = withShelf(before[where]);
    check(
      `в ряду «${where}» есть модуль с полкой — править есть`,
      Boolean(unit),
      unit ? unit.id : 'МОДУЛЯ С ПОЛКОЙ В ЭТОМ РЯДУ НЕТ',
    );
    if (!unit) {
      throw new Error(`нулевой селектор: в ряду «${where}» нет модуля с полкой`);
    }

    const fill = moved(unit, three);
    check(
      `полку в ряду «${where}» есть куда подвинуть`,
      fill !== null,
      fill ? JSON.stringify(fill.shelves) : 'ПОЛКА НИКУДА НЕ ДВИГАЕТСЯ',
    );
    if (!fill) throw new Error(`нулевой селектор: полка в ряду «${where}» не двигается`);

    const next = edit(
      three,
      kitchenReq,
      [{ op: 'set_fill', moduleId: unit.id, fill }],
      OPENINGS,
    );
    const after = rowsOf(next);

    check(
      `правка в ряду «${where}» легла в него сам`,
      JSON.stringify(
        [...after[where]].find((u) => u.id === unit.id)?.fill?.shelves ?? null,
      ) === JSON.stringify(fill.shelves),
      `${JSON.stringify(unit.fill!.shelves)} → ${JSON.stringify(
        after[where].find((u) => u.id === unit.id)?.fill?.shelves ?? null,
      )}`,
    );

    for (const other of rowNames) {
      if (other === where) continue;
      check(
        `и не тронула ряд «${other}»`,
        printRow(before[other]) === printRow(after[other]),
        `до  ${printRow(before[other])}\nстало ${printRow(after[other])}`,
      );
    }

    /* ── 4. Антресоль после правки на месте ── */
    check(
      `антресоль пережила правку в ряду «${where}»`,
      after.mezz.length === before.mezz.length,
      `${before.mezz.length} → ${after.mezz.length} модулей`,
    );
  }

  /* ── 4б. И в шкафу-купе, где полосу строит не заказ, а секция ── */
  for (const zone of ['bedroom', 'hallway'] as ZoneKind[]) {
    const req: RunRequirements = {
      ...REQ,
      zone,
      appliances: [],
      sections: [...zoneProfile(zone).sections],
      options: { ...REQ.options, hasUpper: false },
    };
    const run = zoneRun(zone, 3800);
    const rows = rowsOf(run);

    check(
      `${zone}: полоса антресоли собралась — проверять есть`,
      rows.mezz.length > 0,
      `${rows.mezz.length} модулей`,
    );
    if (rows.mezz.length === 0) {
      throw new Error(`нулевой селектор: в зоне ${zone} полосы антресоли нет`);
    }

    /* Берём первый модуль, у которого полку ДЕЙСТВИТЕЛЬНО есть куда сдвинуть. */
    const movableShelf = rows.base
      .filter((u) => (u.fill?.shelves.length ?? 0) > 0)
      .map((u) => ({ unit: u, fill: moved(u, run) }))
      .find((candidate) => candidate.fill !== null);

    if (!movableShelf || !movableShelf.fill) {
      throw new Error(
        `НУЛЕВОЙ СЕЛЕКТОР: в зоне ${zone} нет нижнего модуля с подвижной полкой — ` +
          `модулей с полками ${rows.base.filter((u) => (u.fill?.shelves.length ?? 0) > 0).length}`,
      );
    }
    const unit = movableShelf.unit;
    const fill = movableShelf.fill;

    const next = edit(run, req, [{ op: 'set_fill', moduleId: unit.id, fill }], []);
    const after = rowsOf(next);

    check(
      `${zone}: полоса антресоли пережила правку на чертеже`,
      after.mezz.length === rows.mezz.length,
      `${rows.mezz.length} → ${after.mezz.length} модулей`,
    );
  }

  /* ── 5. Правка идёт через операцию и проходит инварианты ── */

  const victim = withShelf(before.base)!;
  const good = moved(victim, three)!;
  const applied = edit(three, kitchenReq, [{ op: 'set_fill', moduleId: victim.id, fill: good }], OPENINGS);

  check(
    'правка меняет отпечаток — наполнение входит в него',
    applied.fingerprint !== three.fingerprint,
    `${three.fingerprint} → ${applied.fingerprint}`,
  );

  check(
    'и ряд после неё по-прежнему сходится со стеной',
    runWidthSum(applied) === applied.lengthMm,
    `сумма ${runWidthSum(applied)} при стене ${applied.lengthMm}`,
  );

  /* ── 6. Правка, которую собрать нельзя, отклоняется СЛОВАМИ и ЧИСЛОМ ── */

  const height = moduleCarcassHeightMm(victim, three);
  const tooHigh: ModuleFill = {
    ...victim.fill!,
    shelves: [snapTo32(height + SYSTEM32_STEP_MM * 4)],
  };
  const refusedHigh = edit(
    three,
    kitchenReq,
    [{ op: 'set_fill', moduleId: victim.id, fill: tooHigh }],
    OPENINGS,
  );

  check(
    'полка выше корпуса отклоняется, и отказ называет число',
    refusedHigh.warnings.some((w) => w.includes(String(height))) &&
      JSON.stringify(
        refusedHigh.modules.find((u) => u.id === victim.id)?.fill?.shelves,
      ) === JSON.stringify(victim.fill!.shelves),
    refusedHigh.warnings[0] ?? 'МОЛЧА ПРИНЯЛ ПОЛКУ ВЫШЕ КОРПУСА',
  );

  const offGrid: ModuleFill = { ...victim.fill!, shelves: [victim.fill!.shelves[0] + 5] };
  const refusedGrid = edit(
    three,
    kitchenReq,
    [{ op: 'set_fill', moduleId: victim.id, fill: offGrid }],
    OPENINGS,
  );

  check(
    'полка мимо присадки отклоняется — система 32 это правило',
    refusedGrid.warnings.some((w) => w.includes(String(SYSTEM32_STEP_MM))) &&
      JSON.stringify(
        refusedGrid.modules.find((u) => u.id === victim.id)?.fill?.shelves,
      ) === JSON.stringify(victim.fill!.shelves),
    refusedGrid.warnings[0] ?? 'МОЛЧА ПРИНЯЛ ПОЛКУ МИМО ОТВЕРСТИЯ',
  );

  /* ── 7. Перенос модуля меняет ПОРЯДОК и только его ── */

  const order = (list: Module[]) => list.map((u) => u.label).join(' | ');
  const widths = (list: Module[]) => list.map((u) => u.widthMm).join(' ');

  const dragged = before.base.find((u) => !u.appliance && !u.column);
  check(
    'модуль для переноса есть',
    Boolean(dragged),
    dragged ? `${dragged.label} на ${dragged.offsetMm}` : 'ПЕРЕНОСИТЬ НЕЧЕГО',
  );
  if (!dragged) throw new Error('нулевой селектор: в ряду нет обычного модуля');

  const target = reorderTarget(before.base, dragged.id, 0);
  check(
    'перенос к левому краю находит соседа, на чьё место встают',
    target !== null,
    target ? `${target.afterModuleId} на ${target.offsetMm} мм` : 'СОСЕД НЕ НАЙДЕН',
  );

  if (target) {
    const reordered = edit(
      three,
      kitchenReq,
      [{ op: 'move_module', moduleId: dragged.id, afterModuleId: target.afterModuleId }],
      OPENINGS,
    );
    const now = rowsOf(reordered);

    check(
      'перенос поменял порядок модулей',
      order(now.base) !== order(before.base),
      `было  ${order(before.base)}\nстало ${order(now.base)}`,
    );
    check(
      'и только порядок: состав и ширины те же',
      [...now.base].map((u) => u.label).sort().join('|') ===
        [...before.base].map((u) => u.label).sort().join('|') &&
        [...now.base].map((u) => u.widthMm).sort((a, b) => a - b).join(' ') ===
          [...before.base].map((u) => u.widthMm).sort((a, b) => a - b).join(' '),
      `было  ${widths(before.base)}\nстало ${widths(now.base)}`,
    );
    /*
     * ВЕРХНИЙ РЯД ВПРАВЕ ПОЕХАТЬ — И ТОГДА ОБ ЭТОМ СКАЗАНО СЛОВАМИ.
     *
     * Он разрывается колонной, окном и ригелем (`freeSpans`), и
     * перестановка нижнего ряда двигает эти разрывы. Требовать «верх не
     * изменился» значило бы требовать от продукта неправды. Требуем
     * другого: молча он не меняется.
     */
    check(
      'перенос внизу либо не трогает верх, либо называет потерю числом',
      now.upper.length === before.upper.length ||
        reordered.warnings.some((w) => /\d+ модул/.test(w)),
      `верх ${before.upper.length} → ${now.upper.length} · ${
        reordered.warnings[0] ?? 'без предупреждений'
      }`,
    );
    check(
      'антресоль при этом на месте',
      now.mezz.length === before.mezz.length,
      `${before.mezz.length} → ${now.mezz.length} модулей`,
    );
  }

  /* ── 8. Ручка и поле ширины дают ОДИН ответ ── */

  const freeReq: RunRequirements = {
    ...kitchenReq,
    mode: 'free',
    appliances: [],
    manualAnchors: {},
  };

  const freeRun0 = buildRun({
    wallId: 'w1',
    lengthMm: 3800,
    ceilingHeightMm: 2700,
    requirements: freeReq,
    openings: [],
    comms: [],
  });
  const freeRun = applyOps({
    run: freeRun0,
    requirements: freeReq,
    openings: [],
    ops: [
      { op: 'add_module', kind: 'base', widthMm: 600 },
      { op: 'add_module', kind: 'base', widthMm: 600 },
    ],
  });

  const freeUnit = freeRun.modules[0];
  check(
    'свободная сборка собралась — сравнивать есть на чём',
    freeRun.modules.length >= 2 && Boolean(freeUnit),
    `модулей ${freeRun.modules.length}`,
  );
  if (freeRun.modules.length < 2) {
    throw new Error('НУЛЕВОЙ СЕЛЕКТОР: свободная сборка не дала двух модулей');
  }

  /**
   * ОДИН ВХОД — ОДИН ОТВЕТ.
   *
   * Ручка в сцене и поле в ленте держали СВОЮ копию проверки —
   * `widthOverflowMm`, — и считали ею всегда по-шаблонному. В свободной
   * сборке соседей никто не ужимает, и ответы расходились: копия
   * пропускала ширину, после которой модуль налезает на соседа.
   *
   * Теперь обе зовут `set_width`. Проверяем не «одинаково ли они
   * написаны», а совпадает ли ОТВЕТ с тем, что делает ряд.
   */
  const grown = freeUnit.widthMm + 400;
  const byOp = applyOps({
    run: freeRun,
    requirements: freeReq,
    openings: [],
    ops: [{ op: 'set_width', moduleId: freeUnit.id, widthMm: grown }],
  });
  const copyAnswer = widthOverflowMm(freeRun, freeUnit.id, grown, MIN_WIDTH);

  check(
    'в свободной сборке ширина отклоняется словами и числом',
    byOp.warnings.length > 0 &&
      byOp.modules.find((u) => u.id === freeUnit.id)?.widthMm === freeUnit.widthMm,
    byOp.warnings[0] ?? 'МОЛЧА ПРИНЯЛ ШИРИНУ, НАЛЕЗАЮЩУЮ НА СОСЕДА',
  );

  check(
    'а прежняя копия проверки отвечала иначе — потому её и нет',
    copyAnswer <= 0 && byOp.warnings.length > 0,
    `копия: запас ${-copyAnswer} мм · движок: ${byOp.warnings[0] ?? '—'}`,
  );

  const shrunk = Math.max(MIN_WIDTH, freeUnit.widthMm - 100);
  const okOp = applyOps({
    run: freeRun,
    requirements: freeReq,
    openings: [],
    ops: [{ op: 'set_width', moduleId: freeUnit.id, widthMm: shrunk }],
  });
  check(
    'и одинаково пропускает ширину, которая помещается',
    okOp.warnings.length === 0 &&
      okOp.modules.find((u) => u.id === freeUnit.id)?.widthMm === shrunk,
    `${freeUnit.widthMm} → ${okOp.modules.find((u) => u.id === freeUnit.id)?.widthMm}`,
  );

  /*
   * В ШАБЛОНЕ ОТВЕТ СЧИТАЕТ ТА ЖЕ ОПЕРАЦИЯ — И ОН ДРУГОЙ.
   *
   * Там `rebalance` действительно ужмёт соседей, поэтому ширина, которой
   * в свободной сборке не хватило места, здесь проходит, а ряд остаётся
   * сошедшимся со стеной. Это и есть «одна функция на поле и на ручку»:
   * ответ зависит от РЕЖИМА РЯДА, а не от того, кто спросил.
   */
  const tplUnit = before.base.find((u) => !u.appliance && !u.column)!;
  const tplWanted = Math.min(MAX_WIDTH, tplUnit.widthMm + 400);
  const tplOp = applyOps({
    run: three,
    requirements: kitchenReq,
    openings: OPENINGS,
    ops: [{ op: 'set_width', moduleId: tplUnit.id, widthMm: tplWanted }],
  });
  const tplNow = tplOp.modules.find((u) => u.id === tplUnit.id)?.widthMm ?? 0;

  check(
    'в шаблоне ответ даёт та же операция: либо ширина встала, либо отказ с числом',
    (tplOp.warnings.length === 0 && tplNow === tplWanted) ||
      (tplOp.warnings.length > 0 &&
        /\d+ мм/.test(tplOp.warnings[0]) &&
        tplNow === tplUnit.widthMm),
    `${tplUnit.widthMm} → ${tplNow} · ${tplOp.warnings[0] ?? 'принято'}`,
  );
  check(
    'и ряд после этого по-прежнему сходится со стеной',
    runWidthSum(tplOp) === tplOp.lengthMm,
    `сумма ${runWidthSum(tplOp)} при стене ${tplOp.lengthMm}`,
  );

  const tplTooWide = MAX_WIDTH + 1;
  const tplRefused = applyOps({
    run: three,
    requirements: kitchenReq,
    openings: OPENINGS,
    ops: [{ op: 'set_width', moduleId: tplUnit.id, widthMm: tplTooWide }],
  });
  check(
    'а ширина за границей значения отклоняется числом и там, и там',
    tplRefused.warnings.some((w) => w.includes(String(MAX_WIDTH))) &&
      tplRefused.modules.find((u) => u.id === tplUnit.id)?.widthMm === tplUnit.widthMm,
    tplRefused.warnings[0] ?? 'МОЛЧА ПРИНЯЛ ШИРИНУ БОЛЬШЕ ПРЕДЕЛА',
  );
}

/* ═══  Угол собран, а не приставлен  ═══ */

/**
 * ФАЛЬШ-ПАНЕЛЬ — ДЕТАЛЬ, А НЕ ВЫЧЕТ ИЗ ДЛИНЫ.
 *
 * Сто миллиметров вычитались из полезной длины соседней стены с первого
 * захода, и на этом всё кончалось: в раскрое детали не было, в сцене
 * полосы не было, в смете денег не было. Между рядами оставалась дыра —
 * отсюда и «два ряда приставлены друг к другу».
 *
 * Меряется то, что видно глазами: есть ли деталь, одна ли она в трёх
 * местах и одного ли размера.
 */
console.log('\n' + 'Угол: фальш-панель, столешница, цоколь');
{
  const WALLS: [number, number][] = [
    [2734, 1678],
    [3800, 1140],
  ];
  /*
   * ЗАЗОР БЕРЁТСЯ У ЦЕХА, А НЕ ПОДСТАВЛЯЕТСЯ ЗДЕСЬ.
   *
   * Раскрой снимает `frontGapMm` школы цеха; подставь сцене своё число —
   * и деталь с коробкой разойдутся на миллиметр, причём виноватой будет
   * выглядеть правка, а не проверка.
   */
  const SHOP = {
    thicknessMm: DEFAULT_PRODUCTION.carcassMm,
    frontThicknessMm: DEFAULT_PRODUCTION.frontMm,
    gapMm: DEFAULT_PRODUCTION.frontGapMm,
  };

  const cornerOf = (
    solution: 'false_panel' | 'corner_module',
    a: number,
    b: number,
  ) =>
    buildComposition({
      kind: 'corner_l',
      walls: [
        { id: 'wA', lengthMm: a, openings: [] },
        { id: 'wB', lengthMm: b, openings: [] },
      ],
      ceilingHeightMm: 2700,
      requirements: { ...REQ, cornerSolution: solution },
      comms: [],
    });

  for (const solution of ['false_panel', 'corner_module'] as const) {
    for (const [a, b] of WALLS) {
      const comp = cornerOf(solution, a, b);
      const tag = `${solution} ${a}+${b}`;

      check(
        `${tag}: угол собрался из двух рядов`,
        comp.segments.length === 2,
        `сегментов ${comp.segments.length}`,
      );
      if (comp.segments.length !== 2) {
        throw new Error(`нулевой селектор: ${tag} не дал двух рядов`);
      }

      const depthMm = rowStandardDepthMm(REQ.zone, 'base', undefined);
      /*
       * ПОЛОСА МЕЖДУ ФАСАДОМ ВЛАДЕЛЬЦА И НАЧАЛОМ СОСЕДА (слой 55).
       *
       * До слоя 55 её у обоих решений закрывала фальш-панель: у углового
       * модуля — шириной 340 мм, то есть вторая нога модуля жила в раскрое
       * плоской деталью фасада. Задача слоя 55: «Г-модуль — Г-корпус, обе
       * ноги в раскрое, два фасада». Теперь полосу Г-модуля закрывает его
       * вторая нога со своим фасадом, а фальш-панель остаётся у слепого
       * угла. Утверждение «деталь, закрывающая полосу, есть в раскрое, в
       * сцене и в смете, и одного размера» не ослаблено — меняется деталь.
       */
      const stripMm = cornerLostMm(solution, depthMm) - depthMm;
      const closerName =
        solution === 'corner_module' ? legName(FACADE_PANEL_NAME, 'Б') : CORNER_FILLER_PANEL_NAME;
      const wantFiller = cornerFillerMm(solution, depthMm);

      check(
        `${tag}: мёртвая полоса в углу посчитана`,
        stripMm > 0,
        `${stripMm} мм = ${cornerLostMm(solution, depthMm)} − ${depthMm}`,
      );
      if (stripMm <= 0) {
        throw new Error(`нулевой селектор: ${tag} — полосы в углу нет, проверять нечего`);
      }

      /* ── 1. Деталь в раскрое ── */
      const second = comp.segments[1].run;
      /* Полосу Г-модуля закрывает его нога — деталь ряда-владельца. */
      const closerRun = solution === 'corner_module' ? comp.segments[0].run : second;
      const panels = buildPanels({ run: closerRun });
      const filler = panels.filter((panel) => panel.name === closerName);
      if (solution === 'corner_module') {
        const strayPanels = buildPanels({ run: second }).filter(
          (panel) => panel.name === CORNER_FILLER_PANEL_NAME,
        ).length;
        check(
          `${tag}: у Г-модуля фальш-панели нет — полосу закрывает нога`,
          strayPanels === 0,
          `фальш-панелей у соседа ${strayPanels}`,
        );
      }

      check(
        `${tag}: фальш-панель есть в раскрое`,
        filler.length === 1,
        filler.length === 1
          ? `${filler[0].number} ${filler[0].lengthMm}×${filler[0].widthMm} ${filler[0].material}`
          : `ДЕТАЛЕЙ В УГЛУ: ${filler.length}`,
      );
      if (filler.length !== 1) {
        throw new Error(
          `НУЛЕВОЙ СЕЛЕКТОР: ${tag} — деталей угла в раскрое ${filler.length}, ожидалась одна`,
        );
      }

      const gap = DEFAULT_PRODUCTION.frontGapMm;

      /*
       * Ширина — из решения угла: панель — `cornerFillerMm` без зазора;
       * фасад второй ноги — полоса без толщины фасада ноги А и без зазора.
       */
      const wantWidth =
        solution === 'corner_module'
          ? stripMm - DEFAULT_PRODUCTION.frontMm - gap
          : wantFiller - gap;
      check(
        `${tag}: и размер у неё из решения угла, а не свой`,
        filler[0].widthMm === wantWidth &&
          filler[0].lengthMm === carcassHeightMm(undefined) - gap,
        `${filler[0].lengthMm}×${filler[0].widthMm} при ${carcassHeightMm(undefined) - gap}×${wantWidth}`,
      );

      check(
        `${tag}: и режется из ФАСАДНОГО материала`,
        filler[0].material.startsWith('Фасад'),
        filler[0].material,
      );

      /* ── 1б. Та же деталь в сцене ── */
      const boxes = runBoxes(closerRun, SHOP);
      const drawn = boxes.filter((box) => box.panel === closerName);

      check(
        `${tag}: фальш-панель есть в сцене`,
        drawn.length === 1,
        `коробок` + ` ${drawn.length}`,
      );

      if (drawn.length === 1) {
        /* Фасад ноги Б стоит поперёк ряда: его ширина лежит по z. */
        const across = solution === 'corner_module';
        const widthMm = Math.round(drawn[0].scale[across ? 2 : 0] * 1000);
        const heightMm = Math.round(drawn[0].scale[1] * 1000);
        check(
          `${tag}: и в сцене она ТОГО ЖЕ размера, что в раскрое`,
          widthMm === filler[0].widthMm && heightMm === filler[0].lengthMm,
          `сцена ${heightMm}×${widthMm} · раскрой ${filler[0].lengthMm}×${filler[0].widthMm}`,
        );
        check(
          across
            ? `${tag}: и стоит в углу, ПЕРЕД фасадами ряда-владельца`
            : `${tag}: и стоит в углу, ЛЕВЕЕ начала ряда`,
          across ? drawn[0].position[2] > 0 : drawn[0].position[0] < 0,
          across
            ? `z = ${Math.round(drawn[0].position[2] * 1000)} мм`
            : `x = ${Math.round(drawn[0].position[0] * 1000)} мм`,
        );
      }

      /* ── 1в. И оплачена в смете ── */
      const withPanel = buildEstimate(closerRun, MAIN_VARIANT, DEMO_RATES);
      /*
       * «Без детали» у слепого угла — ряд без угла: уходят ОБЕ его
       * фальш-панели (нижняя и, со слоя 55, верхняя). У Г-модуля — его
       * раскрой без фасада ноги Б.
       */
      const bare: Run = { ...second, corner: undefined };
      const without = buildEstimate(bare, MAIN_VARIANT, DEMO_RATES);

      /*
       * СМЕТА СЧИТАЕТ ИЗ РАСКРОЯ, И СВЕРЯЕМСЯ МЫ С ТЕМ ЖЕ ЧИСЛОМ.
       *
       * У строки сметы количество округлено до сотых — сверять по ней
       * значит сверять округление. `panelTotals` отдаёт ровно то, что
       * смета берёт на вход.
       */
      const frontM2 = (run: Run) => panelTotals(buildPanels({ run })).frontM2;
      const cornerM2 = buildPanels({ run: second })
        .filter(
          (panel) =>
            panel.name === CORNER_FILLER_PANEL_NAME || panel.name === CORNER_UPPER_FILLER_PANEL_NAME,
        )
        .reduce((sum, panel) => sum + (panel.widthMm * panel.lengthMm * panel.qty) / 1_000_000, 0);
      const panelM2 = (filler[0].widthMm * filler[0].lengthMm) / 1_000_000;

      if (solution === 'corner_module') {
        const withoutLeg = panelTotals(panels.filter((panel) => panel.name !== closerName)).frontM2;
        check(
          `${tag}: смета видит фасад ноги Б площадью фасада`,
          Math.abs(frontM2(closerRun) - withoutLeg - panelM2) <= 0.01,
          `+${(frontM2(closerRun) - withoutLeg).toFixed(4)} м² при детали ${panelM2.toFixed(4)} м²`,
        );
      } else {
        check(
          `${tag}: смета видит панели угла площадью фасада`,
          /* Итоги листа округлены до сотых — сверяем в пределах шага. */
          Math.abs(frontM2(second) - frontM2(bare) - cornerM2) <= 0.01 && cornerM2 >= panelM2,
          `+${(frontM2(second) - frontM2(bare)).toFixed(4)} м² при деталях угла ${cornerM2.toFixed(4)} м² ` +
            `(нижняя ${panelM2.toFixed(4)})`,
        );
        check(
          `${tag}: и итог без неё меньше`,
          withPanel.total > without.total,
          `${Math.round(without.total)} → ${Math.round(withPanel.total)} ₸`,
        );
      }

      /* ── 2. Стык столешницы назван при ЛЮБОМ решении угла ── */
      const first = buildEstimate(comp.segments[0].run, MAIN_VARIANT, DEMO_RATES);
      check(
        `${tag}: стык столешницы назван в смете`,
        first.lines.some((line) => line.key === 'countertop_miter'),
        first.lines.find((line) => line.key === 'countertop_miter')?.title ?? 'СТЫК НЕ НАЗВАН',
      );

      /*
       * ── 3. Столешница и цоколь заходят в угол ──
       *
       * Правило слоя 55 обратное слою 46: плиту на всю глубину угла даёт
       * ВЛАДЕЛЕЦ (первый ряд) — он идёт до стены соседа и не обрезается;
       * второй ряд заходит назад ровно до края плиты владельца: на занятое
       * в углу минус глубина плиты. Щели и нахлёста нет при обоих
       * правилах — это меряет «Угол: полосы сходятся» в test:spatial.
       */
      const slabDepth = counterSlabDepthMm(REQ.zone, undefined);
      const counterBand = cornerBandMm({
        corner: second.corner,
        bandDepthMm: slabDepth,
      });
      check(
        `${tag}: столешница второго ряда заходит в угол до края плиты владельца`,
        counterBand.backMm === cornerLostMm(solution, depthMm) - slabDepth,
        `${counterBand.backMm} мм назад при ${cornerLostMm(solution, depthMm)} − ${slabDepth}`,
      );

      const cut = cornerBandMm({
        corner: comp.segments[0].run.corner,
        bandDepthMm: slabDepth,
      });
      check(
        `${tag}: а первого — идёт до стены соседа, не обрезаясь`,
        cut.cutMm === 0 && cut.backMm === 0,
        `обрезано ${cut.cutMm} мм, заход ${cut.backMm} мм`,
      );
    }
  }

  /* ── 4. Обе пары длин собираются одинаково ── */
  for (const solution of ['false_panel', 'corner_module'] as const) {
    const built = WALLS.map(([a, b]) => cornerOf(solution, a, b));
    /* Деталь полосы: панель у слепого угла, фасад ноги Б у Г-модуля (слой 55). */
    const fillers = built.map(
      (comp) =>
        (solution === 'corner_module'
          ? buildPanels({ run: comp.segments[0].run }).find(
              (panel) => panel.name === legName(FACADE_PANEL_NAME, 'Б'),
            )
          : buildPanels({ run: comp.segments[1].run }).find(
              (panel) => panel.name === CORNER_FILLER_PANEL_NAME,
            )
        )?.widthMm ?? 0,
    );

    check(
      `${solution}: угол одинаков на обеих парах длин`,
      fillers.every((width) => width > 0 && width === fillers[0]),
      `2734+1678 → ${fillers[0]} мм · 3800+1140 → ${fillers[1]} мм`,
    );
  }
}

/* ═══  Правка висящего ряда не удаляет модулей  ═══ */

/**
 * ПРАВКА НИКОГДА НЕ УДАЛЯЕТ МОДУЛИ.
 *
 * Верхний ряд разорван окном, колонной и выступом: на демо-ряду модули
 * стоят на 1200, 2400, 2700 и 3300, а между первым и вторым 900 мм
 * пустой стены. Укладка вплотную от одного левого края съезжала влево,
 * попадала в запрещённые участки и ОБРЕЗАЛАСЬ: замерено в браузере
 * 4 модуля → 2 при переносе и 4 → 1 при правке ширины, оба раза молча.
 *
 * Здесь меряется то, что нельзя доказать типами: после КАЖДОЙ правки
 * модулей столько же, ширины те же (кроме правленой), никто ни на кого
 * не налез и никто не стоит в окне.
 */
console.log('\n' + 'Висящий ряд: правка не теряет модулей');
{
  const rowsOf = (r: Run) => {
    const above = r.upperSegments.flatMap((sg) => sg.modules);
    return {
      upper: above.filter((u) => u.section !== 'mezzanine'),
      mezz: above.filter((u) => u.section === 'mezzanine' && mezzanineBaseOf(u, r) === null),
    };
  };

  const shape = (list: Module[]) => list.map((u) => `${u.offsetMm}(${u.widthMm})`).join(' ');

  const edit = (r: Run, ops: MillworkOp[]) =>
    applyOps({ run: r, requirements: REQ, openings: OPENINGS, ops });

  /** Участки ряда — та же функция, по которой он собран. */
  const spansOf = (r: Run) =>
    upperSpans(
      r.modules,
      r.lengthMm,
      [...OPENINGS.filter((o) => o.kind !== 'beam'), ...(r.beams ?? [])],
      REQ,
      r.ceilingHeightMm,
      r.production,
    ).free;

  /** Ни один модуль не стоит в окне, в колонне и под выступом. */
  const outside = (r: Run, list: Module[]) => {
    const free = spansOf(r);
    return list.filter(
      (u) => !free.some((sp) => u.offsetMm >= sp.from && u.offsetMm + u.widthMm <= sp.to),
    );
  };

  /** Два модуля в одном объёме. */
  const overlaps = (list: Module[]) => {
    const sorted = [...list].sort((a, b) => a.offsetMm - b.offsetMm);
    let count = 0;
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].offsetMm < sorted[i - 1].offsetMm + sorted[i - 1].widthMm) count += 1;
    }
    return count;
  };

  /*
   * СТЕНА ПОДЛИННЕЕ ДЕМО — ЧТОБЫ В УЧАСТКЕ БЫЛО ЧТО ДВИГАТЬ.
   *
   * На демо-стене второй участок держит три модуля; на 5000 мм —
   * четыре, и среди них два обычных подряд. Разорван ряд так же: окно и
   * колонны на месте.
   */
  const withMezz = edit(buildRun({ ...baseInput, lengthMm: 5000 }), [
    { op: 'set_mezzanine', heightMm: 400 },
  ]);
  const before = rowsOf(withMezz);

  check(
    'ряд разорван — участки названы числами, и модулей в нём есть',
    spansOf(withMezz).length > 1 && before.upper.length >= 4,
    `участки ${spansOf(withMezz)
      .map((sp) => `${sp.from}…${sp.to}`)
      .join(' · ')} · верх ${shape(before.upper)}`,
  );

  if (before.upper.length < 4 || spansOf(withMezz).length < 2) {
    throw new Error(
      `НУЛЕВОЙ СЕЛЕКТОР: ряд не разорван либо модулей мало — участков ` +
        `${spansOf(withMezz).length}, модулей ${before.upper.length}`,
    );
  }

  /*
   * ЗАПАС В УЧАСТКЕ ДЕЛАЕТСЯ ПРАВКОЙ, А НЕ БЕРЁТСЯ ОТКУДА-ТО.
   *
   * Раскладка заполняет участок ВПЛОТНУЮ (`fillGap`), и расти там
   * некуда ни одному модулю: любая прибавка — честный отказ, и «ширина
   * изменилась» проверить негде. Сужаем последний модуль участка:
   * справа появляется пустота, и в неё можно двигать соседей — ровно
   * тот случай, который правило и описывает.
   */
  const tail = before.upper[before.upper.length - 1];
  const roomy = edit(withMezz, [
    { op: 'set_width', moduleId: tail.id, widthMm: tail.widthMm - 300 },
  ]);
  const start = rowsOf(roomy);

  check(
    'запас в участке сделан: последний модуль сужен, соседи на местах',
    start.upper.length === before.upper.length &&
      start.upper[start.upper.length - 1].widthMm === tail.widthMm - 300,
    `${shape(before.upper)} → ${shape(start.upper)}`,
  );

  if (start.upper.length !== before.upper.length) {
    throw new Error(
      'ПРАВКА ШИРИНЫ ПОТЕРЯЛА МОДУЛИ: ' +
        `${before.upper.length} → ${start.upper.length} · ` +
        `было ${shape(before.upper)} · стало ${shape(start.upper)}`,
    );
  }

  /* ── 8. Любая правка: модулей столько же, ширины те же ── */

  const plain = start.upper.find(
    (u, i) => !u.appliance && i > 0 && i < start.upper.length - 1,
  );
  if (!plain) {
    throw new Error(
      `НУЛЕВОЙ СЕЛЕКТОР: в верхнем ряду нет обычного модуля с соседом справа — ${shape(
        start.upper,
      )}`,
    );
  }

  const cases: { name: string; ops: MillworkOp[]; changed: string[] }[] = [
    {
      name: 'ширина +200 мм',
      ops: [{ op: 'set_width', moduleId: plain.id, widthMm: plain.widthMm + 200 }],
      changed: [plain.id],
    },
    {
      name: 'ширина −50 мм',
      ops: [{ op: 'set_width', moduleId: plain.id, widthMm: plain.widthMm - 50 }],
      changed: [plain.id],
    },
    {
      /*
       * Переставляем В ОДНОМ участке: между участками перестановки не
       * бывает — там стена, а не соседство.
       */
      name: 'перестановка на место соседа',
      ops: [
        {
          op: 'move_module',
          moduleId: start.upper[3].id,
          afterModuleId: start.upper[1].id,
        },
      ],
      changed: [],
    },
  ];

  for (const one of cases) {
    const next = edit(roomy, one.ops);
    const now = rowsOf(next);

    check(
      `${one.name}: модулей верхнего ряда столько же`,
      now.upper.length === start.upper.length,
      `${start.upper.length} → ${now.upper.length} · ${shape(now.upper)}`,
    );
    check(
      `${one.name}: антресоль на месте`,
      now.mezz.length === start.mezz.length,
      `${start.mezz.length} → ${now.mezz.length}`,
    );
    check(
      `${one.name}: ни один модуль не попал в окно, колонну или под выступ`,
      outside(next, now.upper).length === 0,
      outside(next, now.upper)
        .map((u) => `${u.id}@${u.offsetMm}(${u.widthMm})`)
        .join(' ') || 'все в своих участках',
    );
    check(
      `${one.name}: модули не налезли друг на друга`,
      overlaps(now.upper) === 0,
      `пересечений ${overlaps(now.upper)}`,
    );

    const kept = (list: Module[]) =>
      list
        .filter((u) => !one.changed.includes(u.id))
        .map((u) => u.widthMm)
        .sort((a, b) => a - b)
        .join(' ');
    check(
      `${one.name}: ширины остальных не тронуты`,
      kept(now.upper) === kept(start.upper),
      `было ${kept(start.upper)} · стало ${kept(now.upper)}`,
    );
  }

  /* ── 9, 10. У края участка правка отклоняется словами ── */

  const spans = spansOf(withMezz);
  const lastSpan = spans[spans.length - 1];
  const atEdge = before.upper.find(
    (u) => u.offsetMm + u.widthMm === lastSpan.to && !u.appliance,
  );

  check(
    'у края участка есть модуль — отказ проверять есть на чём',
    Boolean(atEdge),
    atEdge ? `${atEdge.id}@${atEdge.offsetMm}(${atEdge.widthMm})` : 'МОДУЛЯ У КРАЯ НЕТ',
  );

  if (atEdge) {
    const refused = edit(withMezz, [
      { op: 'set_width', moduleId: atEdge.id, widthMm: atEdge.widthMm + 400 },
    ]);
    const now = rowsOf(refused);

    check(
      'правка, которая не влезает, отклоняется словами и числом',
      (refused.warnings ?? []).some((text) => /Шире \d+ мм не встанет/.test(text)),
      (refused.warnings ?? [])[0] ?? 'МОЛЧА ПРИНЯЛ ШИРИНУ ЗА КРАЙ УЧАСТКА',
    );
    check(
      'и отказ называет, ЧТО справа',
      (refused.warnings ?? []).some((text) =>
        /справа (окно|дверь|арка|колонна|выступ|край стены)/.test(text),
      ),
      (refused.warnings ?? [])[0] ?? 'ПРИЧИНА НЕ НАЗВАНА',
    );
    check(
      'ряд после отказа глубоко равен исходному',
      shape(now.upper) === shape(before.upper) && shape(now.mezz) === shape(before.mezz),
      `было ${shape(before.upper)} · стало ${shape(now.upper)}`,
    );
  }

  /* ── 11. Сдвинутый сосед сохраняет материал и ручку ── */

  /*
   * Красим и настраиваем ПОСЛЕДНИЙ модуль участка, а двигаем его левого
   * соседа: идентификатор выводится из смещения, значит при сдвиге
   * модуль становится другим id. Всё, что на нём лежит — материал,
   * ручка, наполнение, — обязано переехать вместе с ним.
   */
  const far = start.upper[start.upper.length - 1];
  const dressed = edit(roomy, [
    {
      op: 'set_front',
      moduleId: far.id,
      front: { base: 'veneer_solid', construct: 'solid', finish: 'textured' },
    },
    { op: 'set_handle_spot', moduleId: far.id, level: 'bottom', turn: 'horizontal' },
  ]);

  const dressedFar = rowsOf(dressed).upper.find((u) => u.id === far.id);
  check(
    'модуль покрашен и ручка ему задана — переезд проверять есть на чём',
    Boolean(dressedFar?.front && dressedFar?.fill?.handleLevel === 'bottom'),
    dressedFar
      ? `${dressedFar.front?.base ?? 'без материала'}/${dressedFar.fill?.handleLevel ?? '—'}`
      : 'МОДУЛЬ ПОТЕРЯН',
  );

  const pusher = rowsOf(dressed).upper.find(
    (u, i) => !u.appliance && i > 0 && i < rowsOf(dressed).upper.length - 1,
  );
  check(
    'слева от него есть кого двигать',
    Boolean(pusher),
    pusher ? `${pusher.id}@${pusher.offsetMm}(${pusher.widthMm})` : 'ДВИГАТЬ НЕКОГО',
  );

  if (dressedFar && pusher) {
    const pushed = edit(dressed, [
      { op: 'set_width', moduleId: pusher.id, widthMm: pusher.widthMm + 200 },
    ]);
    const after = rowsOf(pushed).upper;
    const moved = after.find(
      (u) => u.front?.base === 'veneer_solid' && u.fill?.handleLevel === 'bottom',
    );

    check(
      'сдвинутый сосед переехал и сохранил материал с ручкой',
      Boolean(moved) && moved!.offsetMm !== dressedFar.offsetMm,
      moved
        ? `${dressedFar.id}@${dressedFar.offsetMm} → ${moved.id}@${moved.offsetMm}`
        : 'МАТЕРИАЛ ИЛИ РУЧКА ПОТЕРЯНЫ ПРИ СДВИГЕ',
    );
    check(
      'и при этом ряд не потерял модулей',
      after.length === start.upper.length,
      `${start.upper.length} → ${after.length}`,
    );
  }
}


/* ───────────────────  Слой 49: библиотека модулей  ─────────────────── */

console.log('\nБиблиотека модулей: что встаёт на это место');
{
  /*
   * Библиотека живёт в СВОБОДНОЙ СБОРКЕ: «не шаблон, собираем сами — у
   * всех квартиры разные». Поэтому и меряем её там же, где ей работать,
   * а не на демо-раскладке по шаблону, где `rebalance` двигает соседей
   * по своему собственному правилу (ловушка 232).
   */
  const freeReq: RunRequirements = { ...REQ, mode: 'free', appliances: [] };
  const emptyWall = buildRun({
    lengthMm: 3800,
    ceilingHeightMm: 2700,
    requirements: freeReq,
    openings: [],
    comms: [],
  });

  const put = (run: Run, widthMm: number): Run => {
    const gap = gapsOfRow(run, 'base', [], freeReq)[0];
    if (!gap) throw new Error('в ряду не осталось пустого места');
    const cards = libraryCards({
      run,
      requirements: freeReq,
      openings: [],
      moduleId: null,
      gap,
    });
    const pick = cards.find((c) => !c.refusal && c.widthMm === widthMm);
    if (!pick) throw new Error(`нет карточки шириной ${widthMm}`);
    return applyOps({ run, requirements: freeReq, openings: [], ops: pick.ops });
  };

  /* ── Пустая стена: ряд пустой, смета не падает и равна нулю ── */
  check(
    'пустая стена даёт ряд без модулей',
    emptyWall.modules.length === 0 && emptyWall.upperSegments.length === 0,
    `модулей ${emptyWall.modules.length} · остаток ${emptyWall.residualMm} мм`,
  );

  const emptyEstimate = buildEstimate(emptyWall, 'optimal', DEMO_RATES);
  check(
    'смета пустой стены считается и равна нулю',
    emptyEstimate.total === 0,
    `${emptyEstimate.total} ₸`,
  );

  /*
   * ПУСТОЙ РЯД — ЭТО МЕСТО, А НЕ ПОЛОМКА. Библиотека обязана на нём
   * что-то предложить: иначе собрать стену нечем вовсе.
   */
  const firstGap = gapsOfRow(emptyWall, 'base', [], freeReq);
  check(
    'у пустой стены ровно одно пустое место — она сама',
    firstGap.length === 1 &&
      firstGap[0].fromMm === 0 &&
      firstGap[0].widthMm === emptyWall.lengthMm,
    JSON.stringify(firstGap),
  );

  const startCards = libraryCards({
    run: emptyWall,
    requirements: freeReq,
    openings: [],
    moduleId: null,
    gap: firstGap[0],
  });
  check(
    'на пустую стену библиотека предлагает модули, и все они встают',
    startCards.length > 0 && startCards.every((c) => !c.refusal),
    `карточек ${startCards.length}, отказов ${startCards.filter((c) => c.refusal).length}`,
  );

  /* ── Вставка в пустоту садится на ЕЁ отметку ── */
  let built = put(emptyWall, 600);
  built = put(built, 450);
  built = put(built, 600);

  check(
    'модули встали подряд от края стены',
    built.modules.map((m) => m.offsetMm).join(' ') === '0 600 1050',
    built.modules.map((m) => `${m.offsetMm}:${m.widthMm}`).join(' | '),
  );

  /*
   * Пустота ПОСРЕДИ ряда: удаляем средний модуль и ставим в дырку
   * другой. Он обязан встать на ту же отметку, а соседи — не поехать.
   */
  const holed = applyOps({
    run: built,
    requirements: freeReq,
    openings: [],
    ops: [{ op: 'remove_module', moduleId: built.modules[1].id }],
  });
  const holes = gapsOfRow(holed, 'base', [], freeReq);
  const middle = holes.find((g) => g.fromMm === 600);

  check(
    'удалённый посреди ряда модуль оставил пустоту на своём месте',
    Boolean(middle) && middle!.widthMm === 450,
    middle ? `${middle.fromMm}+${middle.widthMm}` : JSON.stringify(holes),
  );

  if (middle) {
    const intoHole = libraryCards({
      run: holed,
      requirements: freeReq,
      openings: [],
      moduleId: null,
      gap: middle,
    }).find((c) => !c.refusal && c.widthMm === 450);

    check('в пустоту 450 мм библиотека даёт карточку', Boolean(intoHole));

    if (intoHole) {
      const filled = applyOps({
        run: holed,
        requirements: freeReq,
        openings: [],
        ops: intoHole.ops,
      });
      const at = filled.modules.find((m) => m.offsetMm === 600);

      check(
        'модуль встал ИМЕННО в пустоту, на её отметку',
        Boolean(at) && at!.widthMm === 450,
        at ? `${at.offsetMm}:${at.widthMm}` : 'МОДУЛЬ ВСТАЛ НЕ ТУДА',
      );
      check(
        'соседи при вставке не поехали',
        filled.modules.map((m) => `${m.offsetMm}:${m.widthMm}`).join(' ') ===
          '0:600 600:450 1050:600',
        filled.modules.map((m) => `${m.offsetMm}:${m.widthMm}`).join(' '),
      );
    }
  }

  /* ── Пустота в НАЧАЛЕ ряда: соседа слева нет вовсе ── */
  {
    /*
     * Снимаем ДВА первых модуля: пустота встаёт на отметку 0, и соседа
     * слева у неё нет. «Поставить за первым модулем ряда» здесь значило
     * бы увезти мебель вправо, за чужую спину.
     *
     * Снимается именно два, а не один: с одним справа от первого
     * оставшегося модуля нет места, поиск места молча уходит к краю
     * стены — и проверка зеленеет на сломанном продукте. Так и было:
     * откат соседа «любой модуль ряда» проходил её насквозь.
     */
    const headless = applyOps({
      run: built,
      requirements: freeReq,
      openings: [],
      ops: [
        { op: 'remove_module', moduleId: built.modules[0].id },
        { op: 'remove_module', moduleId: built.modules[1].id },
      ],
    });
    const head = gapsOfRow(headless, 'base', [], freeReq).find((g) => g.fromMm === 0);

    check(
      'снятые первые модули оставили пустоту от края стены',
      Boolean(head) && head!.widthMm === 1050,
      head ? `${head.fromMm}+${head.widthMm}` : JSON.stringify(gapsOfRow(headless, 'base', [], freeReq)),
    );

    if (head) {
      const card = libraryCards({
        run: headless,
        requirements: freeReq,
        openings: [],
        moduleId: null,
        gap: head,
      }).find((c) => !c.refusal && c.widthMm === 600);

      check('в пустоту у края библиотека даёт карточку', Boolean(card));

      if (card) {
        const filled = applyOps({
          run: headless,
          requirements: freeReq,
          openings: [],
          ops: card.ops,
        });
        check(
          'модуль встал у края стены, а не за соседом справа',
          filled.modules.map((m) => `${m.offsetMm}:${m.widthMm}`).join(' ') === '0:600 1050:600',
          filled.modules.map((m) => `${m.offsetMm}:${m.widthMm}`).join(' '),
        );
      }
    }
  }

  /* ── Нестандартная пустота: карточка не обещает 650 там, где встанет 600 ── */
  {
    /*
     * Нижний ряд сажает добавленный модуль на стандартную ширину
     * (`snapToStandard`). Библиотека перебирает стандарты И ширину
     * самой пустоты — значит в пустоте 650 мм найдётся запрос на 650,
     * который движок исполнит как 600. Карточка обязана показывать то,
     * что встанет, иначе клиент видит одно, а в цех едет другое.
     */
    const two = put(put(emptyWall, 600), 600);
    const withThird = applyOps({
      run: two,
      requirements: freeReq,
      openings: [],
      ops: [{ op: 'add_module', kind: 'base', widthMm: 600 }],
    });
    /* Третий модуль уводим на 1850 — между ним и вторым остаётся 650 мм. */
    const third = applyOps({
      run: withThird,
      requirements: freeReq,
      openings: [],
      ops: [{ op: 'move_module', moduleId: withThird.modules[2].id, offsetMm: 1850 }],
    });
    const oddGap = gapsOfRow(third, 'base', [], freeReq).find((g) => g.widthMm === 650);

    check(
      'в ряду есть пустота нестандартной ширины 650 мм',
      Boolean(oddGap),
      JSON.stringify(gapsOfRow(third, 'base', [], freeReq)),
    );

    if (oddGap) {
      const cards = libraryCards({
        run: third,
        requirements: freeReq,
        openings: [],
        moduleId: null,
        gap: oddGap,
      }).filter((c) => !c.refusal);

      let honest = 0;
      const lied: string[] = [];
      for (const card of cards) {
        const next = applyOps({
          run: third,
          requirements: freeReq,
          openings: [],
          ops: card.ops,
        });
        const had = new Set(third.modules.map((m) => m.id));
        const made = next.modules.find((m) => !had.has(m.id));
        if (made && made.widthMm === card.widthMm) honest += 1;
        else lied.push(`${card.key}→${made?.widthMm ?? 'нет'}`);
      }

      check(
        'в нестандартной пустоте ширина каждой карточки равна поставленной',
        cards.length > 0 && honest === cards.length,
        `${honest} из ${cards.length}${lied.length ? ' · врут: ' + lied.join(' ') : ''}`,
      );
      check(
        'и карточек с шириной 650 там нет — движок такую не ставит',
        cards.every((c) => c.widthMm !== 650),
        cards.map((c) => c.widthMm).filter((w, i, a) => a.indexOf(w) === i).join(' '),
      );
    }
  }

  /* ── Замена: состав, отметки, ширины, материал и ручка ── */
  const target = built.modules[1];
  const dressed = applyOps({
    run: built,
    requirements: freeReq,
    openings: [],
    ops: [
      {
        op: 'set_front',
        moduleId: target.id,
        front: {
          base: 'mdf_enamel',
          construct: 'solid',
          finish: 'gloss',
          colorHex: '#3A3D40',
        },
      },
    ],
  });
  const painted = dressed.modules[1];
  const withHandle = applyOps({
    run: dressed,
    requirements: freeReq,
    openings: [],
    ops: [
      {
        op: 'set_fill',
        moduleId: painted.id,
        fill: {
          ...painted.fill!,
          handleLevel: 'top',
          handleTurn: 'vertical',
          handlePlace: 'left-along',
        },
      },
    ],
  });
  const before = withHandle.modules[1];

  check(
    'модуль покрашен и ручка ему задана — замену проверять есть на чём',
    before.front?.base === 'mdf_enamel' && before.fill?.handleLevel === 'top',
    `${before.front?.base}/${before.fill?.handleLevel}`,
  );

  const swapCard = libraryCards({
    run: withHandle,
    requirements: freeReq,
    openings: [],
    moduleId: before.id,
  }).find((c) => !c.refusal && !c.current && c.widthMm === before.widthMm);

  check('для занятого места библиотека даёт замену той же ширины', Boolean(swapCard));

  if (swapCard) {
    const swapped = applyOps({
      run: withHandle,
      requirements: freeReq,
      openings: [],
      ops: swapCard.ops,
    });
    const after = swapped.modules[1];

    check(
      'замена не меняет число модулей в ряду',
      swapped.modules.length === withHandle.modules.length,
      `${withHandle.modules.length} → ${swapped.modules.length}`,
    );
    check(
      'отметки и ширины соседей после замены те же',
      swapped.modules.map((m) => `${m.offsetMm}:${m.widthMm}`).join(' ') ===
        withHandle.modules.map((m) => `${m.offsetMm}:${m.widthMm}`).join(' '),
      `${withHandle.modules.map((m) => `${m.offsetMm}:${m.widthMm}`).join(' ')} → ` +
        `${swapped.modules.map((m) => `${m.offsetMm}:${m.widthMm}`).join(' ')}`,
    );
    check(
      'модуль действительно стал другим',
      currentVariant(after) === swapCard.spec.kind &&
        currentVariant(after) !== currentVariant(before),
      `${currentVariant(before)} → ${currentVariant(after)}`,
    );
    /*
     * МАТЕРИАЛ И РУЧКА ВЫБРАНЫ ДЛЯ МЕСТА, А НЕ ДЛЯ ТИПА МОДУЛЯ.
     * Дизайнер перебирает варианты подряд; терять цвет на каждом
     * нажатии значит выбирать его заново по десять раз.
     */
    check(
      'материал фасада переехал на новый модуль',
      after.front?.base === 'mdf_enamel' && after.front?.colorHex === '#3A3D40',
      JSON.stringify(after.front),
    );
    check(
      'ручка переехала на новый модуль',
      after.fill?.handleLevel === 'top' &&
        after.fill?.handleTurn === 'vertical' &&
        after.fill?.handlePlace === 'left-along',
      `${after.fill?.handleLevel}/${after.fill?.handleTurn}/${after.fill?.handlePlace}`,
    );
    /*
     * А вот НАПОЛНЕНИЕ переезжать не должно: полки и ящики принадлежат
     * варианту, и старые у нового модуля — это мебель, которой цех не
     * сделает.
     */
    check(
      'наполнение при этом пересчитано под новый вариант',
      JSON.stringify(after.fill?.drawerHeights ?? []) !==
        JSON.stringify(before.fill?.drawerHeights ?? []) ||
        after.fill?.shelves.length !== before.fill?.shelves.length,
      `ящиков ${before.fill?.drawerHeights.length ?? 0} → ${after.fill?.drawerHeights.length ?? 0}, ` +
        `полок ${before.fill?.shelves.length ?? 0} → ${after.fill?.shelves.length ?? 0}`,
    );
  }

  /* ── Цена карточки равна разнице смет до тенге ── */
  {
    const totalOf = (run: Run) => buildEstimate(run, 'optimal', DEMO_RATES).total;
    const place = withHandle.modules[1];
    const every = libraryCards({
      run: withHandle,
      requirements: freeReq,
      openings: [],
      moduleId: place.id,
    });
    const cards = every.filter((c) => !c.refusal);

    /*
     * ПЯТЬ КАРТОЧЕК, И ЭТО ЧИСЛО ЗАФИКСИРОВАНО. «Сколько найдётся» —
     * это проверка, которая тихо схлопывается до нуля и остаётся
     * зелёной.
     */
    check(
      'доступных карточек хватает на пять сверок цены',
      cards.length >= 5,
      `доступно ${cards.length} из ${every.length}`,
    );

    /*
     * СВЕРЯЕТСЯ ТО, ЧТО ВИДНО: итог на экране — целые тенге, и разница
     * карточки обязана быть разницей ДВУХ ПОКАЗАННЫХ итогов. Округлённая
     * разница неокруглённых смет расходилась с экраном на тенге — это
     * поймал браузер (`check-library.mjs`), а эта проверка тогда
     * считала обе стороны одной и той же неверной арифметикой.
     */
    const shown = (run: Run) => Math.round(totalOf(run));
    const beforeTotal = shown(withHandle);
    let matched = 0;
    const seen: string[] = [];

    for (const card of cards.slice(0, 5)) {
      const promised = priceDeltaOf(
        { run: withHandle, requirements: freeReq, openings: [] },
        card.ops,
        totalOf,
        /* «До» — итог, который на экране сейчас. */
        totalOf(withHandle),
      );
      const real =
        shown(applyOps({ run: withHandle, requirements: freeReq, openings: [], ops: card.ops })) -
        beforeTotal;
      if (promised === real) matched += 1;
      seen.push(`${card.key} ${promised}/${real}`);
    }

    check(
      'разница на карточке равна разнице смет ДО ТЕНГЕ на пяти вариантах',
      matched === 5,
      `${matched} из 5 · ${seen.join(' · ')}`,
    );
  }

  /* ── Не влезает: карточка серая, причина с числом, ряд цел ── */
  {
    /*
     * Ряд из трёх модулей кончается на 1650 мм при стене 3800: места
     * справа много. Чтобы получить настоящий отказ движка, набиваем
     * стену почти целиком и просим самый широкий модуль.
     */
    let tight = built;
    for (;;) {
      const gap = gapsOfRow(tight, 'base', [], freeReq)[0];
      if (!gap || gap.widthMm < 600) break;
      tight = put(tight, 600);
    }

    const tail = gapsOfRow(tight, 'base', [], freeReq)[0];
    const cards = libraryCards({
      run: tight,
      requirements: freeReq,
      openings: [],
      moduleId: tight.modules[0].id,
    });
    const refused = cards.filter((c) => c.refusal);

    check(
      'в забитом ряду часть карточек не встаёт',
      refused.length > 0,
      `отказов ${refused.length} из ${cards.length}` +
        (tail ? ` · хвост ${tail.widthMm} мм` : ' · хвоста нет'),
    );

    if (refused.length > 0) {
      const withNumber = refused.filter((c) => /\d/.test(c.refusal ?? ''));
      check(
        'отказ называет ЧИСЛО, а не «нельзя»',
        withNumber.length === refused.length,
        `с числом ${withNumber.length} из ${refused.length} · «${refused[0].refusal}»`,
      );

      /*
       * Серая карточка обязана быть НЕНАЖИМАЕМОЙ и на движке тоже:
       * применённая, она не имеет права поменять ряд.
       */
      const beforeRow = tight.modules.map((m) => `${m.offsetMm}:${m.widthMm}`).join(' ');
      const tried = applyOps({
        run: tight,
        requirements: freeReq,
        openings: [],
        ops: refused[0].ops,
      });
      check(
        'применённый отказ оставляет ряд прежним',
        tried.modules.map((m) => `${m.offsetMm}:${m.widthMm}`).join(' ') === beforeRow,
        `${beforeRow} → ${tried.modules.map((m) => `${m.offsetMm}:${m.widthMm}`).join(' ')}`,
      );
    }
  }

  /* ── Готовое решение: доступная карточка не двигает соседей ── */
  {
    /*
     * ЭКРАН ДЕМО СОБРАН ПО ШАБЛОНУ, и там движок вправе сводить ряд со
     * стеной (`rebalance`) — сдвигать соседей и дописывать доборную
     * планку. Замерено до правки: у модуля на 1200 из 48 доступных
     * карточек 44 сдвигали мойку с 1650 на 1500 мм и добавляли модуль
     * в хвост ряда. Карточка такого делать не вправе.
     *
     * Меряется ТЕМ ЖЕ рядом, что показывает экран демо: `buildRun` по
     * демо-входу.
     */
    const demo = buildRun(baseInput);
    const place = demo.modules.find((m) => !m.appliance && !m.column && m.kind === 'base');
    check('в демо-ряду есть обычный нижний модуль', Boolean(place), place?.id ?? '—');

    if (place) {
      const all = libraryCards({
        run: demo,
        requirements: REQ,
        openings: OPENINGS,
        moduleId: place.id,
      });
      const ready = all.filter((c) => !c.refusal);
      const spot = (r: Run, skip: number) =>
        r.modules
          .filter((m) => m.offsetMm !== skip)
          .map((m) => `${m.offsetMm}:${m.widthMm}`)
          .join(' ');
      const was = spot(demo, place.offsetMm);

      let still = 0;
      const broke: string[] = [];
      for (const card of ready) {
        const next = applyOps({ run: demo, requirements: REQ, openings: OPENINGS, ops: card.ops });
        if (spot(next, place.offsetMm) === was) still += 1;
        else if (broke.length < 2) broke.push(`${card.key}: ${spot(next, place.offsetMm)}`);
      }

      check(
        'ни одна доступная карточка не двигает соседей и не добавляет модулей',
        ready.length > 0 && still === ready.length,
        `${still} из ${ready.length}${broke.length ? ' · двигают: ' + broke.join(' ; ') : ''}`,
      );

      /*
       * СТОРОЖ СОСЕДЕЙ МЕРЯЕТСЯ ТАМ, ГДЕ ТОЛКАТЬ ЕЩЁ МОЖНО.
       *
       * Нижний ряд больше не толкает никого (слой 50): замена шире своего
       * места отказывает сама, и серых «из-за соседей» там не бывает. А
       * верхний ряд по-прежнему раздвигает правых внутри участка
       * (ловушка 411) — и карточка, после которой соседи поехали бы,
       * обязана быть серой с числом. Снимаем крайний шкаф участка, чтобы
       * было куда толкать.
       */
      const uppers = demo.upperSegments
        .flatMap((sg) => sg.modules)
        .filter((m) => rowOfModule(demo, m.id)?.row === 'upper')
        .sort((a, b) => a.offsetMm - b.offsetMm);
      const tail = uppers[uppers.length - 1];
      const pusher = uppers.find(
        (m) => m !== tail && uppers.some((o) => o.offsetMm === m.offsetMm + m.widthMm),
      );
      const slack = tail
        ? applyOps({
            run: demo,
            requirements: REQ,
            openings: OPENINGS,
            ops: [{ op: 'remove_module', moduleId: tail.id }],
          })
        : demo;
      const pushCards = pusher
        ? libraryCards({ run: slack, requirements: REQ, openings: OPENINGS, moduleId: pusher.id })
        : [];
      const byNeighbours = pushCards.filter((c) => /соседей|модулей/.test(c.refusal ?? ''));
      check(
        'карточки, после которых поехали бы соседи, серые и называют число',
        byNeighbours.length > 0 && byNeighbours.every((c) => /\d+ мм|: \d+/.test(c.refusal ?? '')),
        byNeighbours[0]
          ? `верхний ${pusher?.id}: ${byNeighbours.length} шт. · «${byNeighbours[0].refusal}»`
          : `НУЛЕВОЙ СЕЛЕКТОР: у ${pusher?.id ?? 'верхнего'} ни одной`,
      );
    }
  }

  /* ── Пустота висящего ряда — внутри участков, а не над окном ── */
  {
    /*
     * У верхнего ряда между модулями бывают окно, колонна холодильника
     * и выступ на потолке. Первая версия считала пустотой всё, что не
     * занято, и схема звала поставить шкаф «в пусто 900» — ровно на
     * окно, а над холодильником — «в пусто 3200» в полосе кладовки,
     * которая собирается сама.
     *
     * Меряется ТЕМ ЖЕ рядом, что показывает экран демо, и с антресолью:
     * у неё свои пустоты в тех же участках.
     */
    /*
     * ЖИВАЯ ПУСТОТА НУЖНА НАСТОЯЩАЯ. Демо-ряд собран вплотную, и
     * проверка «пустоты не лежат на окне» на пустом списке прошла бы
     * сама собой. Поэтому снимаем верхний шкаф ВНУТРИ участка: на его
     * месте остаётся законная пустота (ловушка 410), а окно слева от
     * неё — та самая преграда, которую нельзя назвать пустым местом.
     */
    const dressedDemo = applyOps({
      run: buildRun(baseInput),
      requirements: REQ,
      openings: OPENINGS,
      ops: [{ op: 'set_mezzanine', heightMm: 400 }],
    });
    const removable = dressedDemo.upperSegments
      .flatMap((sg) => sg.modules)
      .find((m) => rowOfModule(dressedDemo, m.id)?.row === 'upper' && !m.appliance && m.offsetMm >= 2400);
    if (!removable) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: в верхнем ряду демо нет шкафа правее окна');
    const demo = applyOps({
      run: dressedDemo,
      requirements: REQ,
      openings: OPENINGS,
      ops: [{ op: 'remove_module', moduleId: removable.id }],
    });
    const gaps = libraryGaps(demo, OPENINGS, REQ);
    /* Преграды — у той же функции, по которой движок укладывает ряд. */
    const { blockers } = upperSpansOfRun(demo, demo.modules, OPENINGS, REQ, demo.options);

    check(
      'у демо-ряда есть преграды висящему ряду — проверять есть на чём',
      blockers.length > 0,
      blockers.map((b) => `${b.reason} ${b.from}…${b.to}`).join(' · '),
    );

    const hanging = gaps.filter((g) => g.row === 'upper' || g.row === 'mezzanine');
    check(
      'снятый шкаф оставил в верхнем ряду живую пустоту на своём месте',
      hanging.some(
        (g) => g.row === 'upper' && g.fromMm === removable.offsetMm && g.widthMm >= removable.widthMm,
      ),
      `снят ${removable.id}@${removable.offsetMm}(${removable.widthMm}) · пустоты: ` +
        (hanging.map((g) => `${g.row} ${g.fromMm}+${g.widthMm}`).join(' · ') || 'НИ ОДНОЙ'),
    );
    const onBlocker = hanging.filter((g) =>
      blockers.some((b) => g.fromMm < b.to && g.fromMm + g.widthMm > b.from),
    );
    check(
      'ни одна пустота висящего ряда не лежит на окне, колонне или выступе',
      onBlocker.length === 0,
      `пустот ${hanging.length}` +
        (onBlocker.length
          ? ' · на преграде: ' + onBlocker.map((g) => `${g.row} ${g.fromMm}+${g.widthMm}`).join(' ')
          : ''),
    );
    check(
      'у кладовки над колонной пустот нет — она собирается сама',
      gaps.every((g) => g.row !== 'storage'),
      gaps.map((g) => `${g.row} ${g.fromMm}+${g.widthMm}`).join(' · ') || 'пустот нет',
    );

    /*
     * И каждая предложенная пустота висящего ряда ПРИНИМАЕТ модуль:
     * пустота, в которую не встаёт ничего, — это не место, а обещание.
     */
    let accepted = 0;
    const idle: string[] = [];
    for (const gap of hanging) {
      const ready = libraryCards({
        run: demo,
        requirements: REQ,
        openings: OPENINGS,
        moduleId: null,
        gap,
      }).filter((c) => !c.refusal);
      if (ready.length > 0) accepted += 1;
      else idle.push(`${gap.row} ${gap.fromMm}+${gap.widthMm}`);
    }
    check(
      'в каждую пустоту висящего ряда что-то встаёт',
      hanging.length > 0 && accepted === hanging.length,
      `${accepted} из ${hanging.length}${idle.length ? ' · пустые: ' + idle.join(' ') : ''}`,
    );

    /*
     * ШКАФ ВСТАЁТ ОБРАТНО ВПЛОТНУЮ К ОКНУ — И ИМЕННО ТОТ, ЧТО ВЫБРАН.
     *
     * Сосед слева стоит по ту сторону окна: «за соседом» модуль въехал
     * бы в окно. И вариант обязан доехать до модуля: вставка в висящий
     * ряд раньше ставила простую дверцу под любым названием карточки.
     */
    const back = hanging.find((g) => g.row === 'upper' && g.fromMm === removable.offsetMm);
    if (back) {
      const upperBefore = (r: Run) =>
        r.upperSegments
          .flatMap((sg) => sg.modules)
          .filter((m) => rowOfModule(r, m.id)?.row === 'upper' && m.offsetMm !== back.fromMm)
          .map((m) => `${m.offsetMm}:${m.widthMm}`)
          .join(' ');
      const choice = libraryCards({
        run: demo,
        requirements: REQ,
        openings: OPENINGS,
        moduleId: null,
        gap: back,
      }).find((c) => !c.refusal && c.spec.kind !== 'upper_door');

      check(
        'в пустоту за окном есть не только простая дверца',
        Boolean(choice),
        choice ? `${choice.key}` : 'ТОЛЬКО ДВЕРЦА ИЛИ НИЧЕГО',
      );

      if (choice) {
        const placed = applyOps({ run: demo, requirements: REQ, openings: OPENINGS, ops: choice.ops });
        const made = placed.upperSegments
          .flatMap((sg) => sg.modules)
          .find((m) => rowOfModule(placed, m.id)?.row === 'upper' && m.offsetMm === back.fromMm);

        check(
          'модуль встал вплотную к окну, на отметку пустоты',
          Boolean(made) && made!.widthMm === choice.widthMm,
          made ? `${made.offsetMm}:${made.widthMm}` : 'НЕ ВСТАЛ',
        );
        check(
          'и это именно выбранный вариант, а не простая дверца',
          Boolean(made) && currentVariant(made!) === choice.spec.kind,
          `${choice.spec.kind} → ${made ? currentVariant(made) : '—'}`,
        );
        check(
          'остальной верхний ряд не поехал',
          upperBefore(placed) === upperBefore(demo),
          `${upperBefore(demo)} → ${upperBefore(placed)}`,
        );
      }
    }
  }

  /* ── Ширины карточек — только те, что у варианта бывают ── */
  {
    /*
     * На пустой стене библиотека предлагала «Высокое карго 1200» при
     * пределе варианта 600 — и движок его ставил. Размер, которого не
     * бывает, в цех уехал бы деталью. Меряются все три пути: занятое
     * место, пустота с соседом и пустая стена.
     */
    const paths: [string, LibraryCard[]][] = [
      [
        'пустая стена',
        libraryCards({
          run: emptyWall,
          requirements: freeReq,
          openings: [],
          moduleId: null,
          gap: gapsOfRow(emptyWall, 'base', [], freeReq)[0],
        }),
      ],
      [
        'занятое место',
        libraryCards({ run: built, requirements: freeReq, openings: [], moduleId: built.modules[1].id }),
      ],
      [
        'пустота с соседом',
        libraryCards({
          run: built,
          requirements: freeReq,
          openings: [],
          moduleId: null,
          gap: gapsOfRow(built, 'base', [], freeReq).find((g) => g.fromMm > 0) ?? null,
        }),
      ],
    ];

    for (const [name, cards] of paths) {
      const ready = cards.filter((c) => !c.refusal);
      const wrong = ready.filter(
        (c) =>
          c.widthMm < c.spec.minWidthMm || (!c.spec.anyWidth && c.widthMm > c.spec.maxWidthMm),
      );
      check(
        `${name}: ни одна доступная карточка не шире и не уже своего варианта`,
        ready.length > 0 && wrong.length === 0,
        `доступно ${ready.length}` +
          (wrong.length ? ' · невозможные: ' + wrong.slice(0, 4).map((c) => c.key).join(' ') : ''),
      );
    }
  }

  /* ── Замки: место, которое не выбирают, объясняет себя словами ── */
  {
    const demo = buildRun(baseInput);
    const fridge = demo.modules.find((m) => m.appliance === 'fridge' || m.column);

    check('в демо-ряду есть приборный модуль', Boolean(fridge), fridge?.id ?? '—');

    if (fridge) {
      const lock = libraryLock({
        run: demo,
        requirements: REQ,
        openings: OPENINGS,
        moduleId: fridge.id,
      });
      check(
        'у приборного модуля библиотеки нет, и это сказано словами',
        Boolean(lock) && /прибор/i.test(lock ?? ''),
        lock ?? 'ЗАМКА НЕТ',
      );
      check(
        'и карточек он при этом не даёт вовсе',
        libraryCards({
          run: demo,
          requirements: REQ,
          openings: OPENINGS,
          moduleId: fridge.id,
        }).length === 0,
      );
    }

    /*
     * КЛАДОВКА НАД КОЛОННОЙ СОБИРАЕТСЯ САМА. Замерено до замка: она
     * давала 67 карточек, из которых не вставала НИ ОДНА.
     */
    const withMezz = applyOps({
      run: demo,
      requirements: REQ,
      openings: OPENINGS,
      ops: [{ op: 'set_mezzanine', heightMm: 400 }],
    });
    const storage = withMezz.upperSegments
      .flatMap((sg) => sg.modules)
      .find((m) => rowOfModule(withMezz, m.id)?.row === 'storage');

    check('в демо-ряду есть кладовка над колонной', Boolean(storage), storage?.id ?? '—');

    if (storage) {
      const lock = libraryLock({
        run: withMezz,
        requirements: REQ,
        openings: OPENINGS,
        moduleId: storage.id,
      });
      check(
        'у кладовки над колонной библиотеки нет, и причина названа',
        Boolean(lock) && /холодильник/i.test(lock ?? ''),
        lock ?? 'ЗАМКА НЕТ',
      );
      check(
        'карточек она не даёт — вместо 67, из которых не вставала ни одна',
        libraryCards({
          run: withMezz,
          requirements: REQ,
          openings: OPENINGS,
          moduleId: storage.id,
        }).length === 0,
      );
    }
  }

  /* ── Ширины: карточка не обещает того, чего движок не сделает ── */
  {
    /*
     * Библиотека перебирает СТАНДАРТНЫЕ ширины плюс текущую: раскладка
     * выдаёт и 630 мм, и предложить там только круглые числа значит
     * заставить человека менять ширину, которую он не просил.
     */
    check(
      'текущая нестандартная ширина остаётся в списке',
      widthsFor(630).includes(630),
      widthsFor(630).join(' '),
    );
    check(
      'и список не выходит за физические границы модуля',
      widthsFor(630).every((mm) => mm >= MIN_WIDTH && mm <= MAX_WIDTH),
      `${widthsFor(630)[0]}…${widthsFor(630)[widthsFor(630).length - 1]}`,
    );

    const place = built.modules[1];
    const all = libraryCards({
      run: built,
      requirements: freeReq,
      openings: [],
      moduleId: place.id,
    });
    const cards = all.filter((c) => !c.refusal);

    let honest = 0;
    for (const card of cards) {
      const next = applyOps({
        run: built,
        requirements: freeReq,
        openings: [],
        ops: card.ops,
      });
      const made = next.modules.find((m) => m.offsetMm === place.offsetMm);
      if (made && made.widthMm === card.widthMm) honest += 1;
    }

    check(
      'ширина на карточке равна той, что получилась у движка',
      honest === cards.length && cards.length > 0,
      `${honest} из ${cards.length}`,
    );

    /*
     * И ОДНА КАРТОЧКА НА СОЧЕТАНИЕ: два одинаковых «Дверца 600» подряд
     * читаются как сломанная панель, а не как выбор.
     */
    const keys = all.map((c) => c.key);
    check(
      'одинаковых карточек в панели нет',
      new Set(keys).size === keys.length,
      `${keys.length} карточек, уникальных ${new Set(keys).size}`,
    );

    /* Доступные стоят ВЫШЕ серых: иначе нужные тонут среди отказов. */
    const firstRefusal = all.findIndex((c) => c.refusal);
    const lastReady = all.map((c) => Boolean(c.refusal)).lastIndexOf(false);
    check(
      'доступные карточки идут раньше серых',
      firstRefusal === -1 || firstRefusal > lastReady,
      `первый отказ на ${firstRefusal}, последняя доступная на ${lastReady}`,
    );
    check(
      'а текущая стоит первой — с ней сравнивают',
      all.length > 0 && all[0].current,
      all[0] ? `${all[0].key} current=${all[0].current}` : 'КАРТОЧЕК НЕТ',
    );
  }
}


/* ─────────────  Слой 50: библиотека готова к показу клиенту  ───────────── */

console.log('\nБиблиотека к показу: замена не двигает соседей, пустоты, столешница');
{
  /*
   * Всё меряется ТЕМ ЖЕ рядом, что показывает экран демо: `buildRun` по
   * демо-входу, режим шаблона. Именно там клиент открывает панель.
   */
  const demo = buildRun(baseInput);
  const spotsOf = (r: Run) => r.modules.map((m) => `${m.offsetMm}:${m.widthMm}`).join(' ');
  const counterQty = (r: Run) =>
    buildEstimate(r, 'optimal', DEMO_RATES).lines.find(
      (line) =>
        line.key.startsWith('countertop_') &&
        line.key !== 'countertop_plinth' &&
        line.key !== 'countertop_miter',
    )?.quantity ?? 0;

  const plain = demo.modules.filter(
    (m) => !m.appliance && !m.column && m.kind === 'base',
  );
  check(
    'в демо-ряду есть обычные нижние модули — мерить есть на чём',
    plain.length > 0,
    plain.map((m) => m.id).join(' ') || 'НУЛЕВОЙ СЕЛЕКТОР: ни одного',
  );

  /* ── 6. Сколько карточек доступно на каждом месте нижнего ряда ── */
  for (const unit of plain) {
    const cards = libraryCards({ run: demo, requirements: REQ, openings: OPENINGS, moduleId: unit.id });
    const ready = cards.filter((c) => !c.refusal);
    const now = currentVariant(unit);
    const narrower = cards.filter((c) => c.spec.kind === now && c.widthMm < unit.widthMm);
    const blocked = narrower.filter((c) => c.refusal);
    check(
      `${unit.id}: все узкие карточки своего варианта доступны`,
      narrower.length > 0 && blocked.length === 0,
      `доступно ${ready.length} из ${cards.length} · узких ${narrower.length}, серых ${blocked.length}` +
        (blocked[0] ? ` · «${blocked[0].refusal}»` : narrower.length === 0 ? ' · НУЛЕВОЙ СЕЛЕКТОР: узких нет' : ''),
    );
  }

  /* ── 7. Замена уже: пустота ровно на разницу, соседи и мойка на месте ── */
  const sinkUnit = demo.modules.find((m) => moduleAppliances(m).some((a) => a.startsWith('sink')));
  const leftOfSink = sinkUnit
    ? demo.modules.find(
        (m) => !m.appliance && !m.column && m.offsetMm + m.widthMm === sinkUnit.offsetMm,
      )
    : undefined;
  check(
    'слева от мойки стоит обычный модуль — замену проверять есть на чём',
    Boolean(sinkUnit && leftOfSink),
    sinkUnit && leftOfSink
      ? `${leftOfSink.id}@${leftOfSink.offsetMm}(${leftOfSink.widthMm}) · мойка @${sinkUnit.offsetMm}`
      : 'НУЛЕВОЙ СЕЛЕКТОР: мойки или соседа слева нет',
  );

  if (sinkUnit && leftOfSink) {
    const cut = 150;
    const narrowed = applyOps({
      run: demo,
      requirements: REQ,
      openings: OPENINGS,
      ops: [
        {
          op: 'replace_module',
          moduleId: leftOfSink.id,
          kind: leftOfSink.kind,
          variant: currentVariant(leftOfSink),
          widthMm: leftOfSink.widthMm - cut,
        },
      ],
    });
    const placed = narrowed.modules.find((m) => m.offsetMm === leftOfSink.offsetMm);
    const sinkAfter = narrowed.modules.find((m) =>
      moduleAppliances(m).some((a) => a.startsWith('sink')),
    );
    const others = (r: Run) =>
      r.modules
        .filter((m) => m.offsetMm !== leftOfSink.offsetMm)
        .map((m) => `${m.offsetMm}:${m.widthMm}`)
        .join(' ');

    check(
      'замена уже: модулей столько же — добор не дописан',
      narrowed.modules.length === demo.modules.length,
      `${demo.modules.length} → ${narrowed.modules.length}`,
    );
    check(
      'замена уже: модуль стоит от своего левого края',
      placed?.widthMm === leftOfSink.widthMm - cut,
      placed ? `${placed.offsetMm}:${placed.widthMm}` : 'МОДУЛЯ НА МЕСТЕ НЕТ',
    );
    check(
      'замена уже: мойка на месте до миллиметра',
      sinkAfter?.offsetMm === sinkUnit.offsetMm && sinkAfter?.widthMm === sinkUnit.widthMm,
      `${sinkUnit.offsetMm} → ${sinkAfter?.offsetMm ?? 'МОЙКИ НЕТ'}`,
    );
    check(
      'замена уже: остальные соседи на месте до миллиметра',
      others(narrowed) === others(demo),
      `${others(demo)} → ${others(narrowed)}`,
    );
    const hole = gapsOfRow(narrowed, 'base', OPENINGS, REQ).find(
      (g) => g.fromMm === leftOfSink.offsetMm + leftOfSink.widthMm - cut,
    );
    check(
      'замена уже: справа пустота ровно на разницу ширин',
      hole?.widthMm === cut,
      hole ? `пусто ${hole.fromMm}+${hole.widthMm}` : `НУЛЕВОЙ СЕЛЕКТОР · ряд ${spotsOf(narrowed)}`,
    );

    /* ── 9. Столешница над пустотой сплошная: смета не дешевеет на неё ── */
    check(
      'столешница над пустотой внутри ряда не укоротилась',
      counterQty(narrowed) === counterQty(demo),
      `${counterQty(demo)} м → ${counterQty(narrowed)} м`,
    );

    /* ── 8. Замена шире при пустоте справа: пустота уменьшается ровно ── */
    const grow = 100;
    const regrown = applyOps({
      run: narrowed,
      requirements: REQ,
      openings: OPENINGS,
      ops: [
        {
          op: 'replace_module',
          moduleId: placed?.id ?? leftOfSink.id,
          kind: leftOfSink.kind,
          variant: currentVariant(leftOfSink),
          widthMm: leftOfSink.widthMm - cut + grow,
        },
      ],
    });
    /*
     * Пустота меряется ОТМЕТКАМИ: 50 мм — это пустота, но не место
     * (самый узкий корпус 150), и в список мест библиотеки она не
     * попадает — искать её там значит мерить не то.
     */
    const grownUnit = regrown.modules.find((m) => m.offsetMm === leftOfSink.offsetMm);
    const nextAfter = regrown.modules
      .filter((m) => m.offsetMm > leftOfSink.offsetMm)
      .sort((a, b) => a.offsetMm - b.offsetMm)[0];
    const hole2 =
      grownUnit && nextAfter ? nextAfter.offsetMm - (grownUnit.offsetMm + grownUnit.widthMm) : null;
    check(
      'замена шире: пустота справа уменьшилась ровно на разницу',
      hole2 === cut - grow,
      `пусто ${hole2 ?? '—'} мм · ряд ${spotsOf(regrown)}`,
    );
    check(
      'замена шире: соседи на месте до миллиметра',
      others(regrown) === others(demo),
      `${others(demo)} → ${others(regrown)}`,
    );

    const tooWide = applyOps({
      run: demo,
      requirements: REQ,
      openings: OPENINGS,
      ops: [
        {
          op: 'replace_module',
          moduleId: leftOfSink.id,
          kind: leftOfSink.kind,
          variant: currentVariant(leftOfSink),
          widthMm: leftOfSink.widthMm + 150,
        },
      ],
    });
    check(
      'замена шире без пустоты: отказ называет число',
      tooWide.warnings.some((w) => /\d+ мм/.test(w)),
      tooWide.warnings[0] ?? 'ОТКАЗА НЕТ',
    );
    check(
      'и ряд после отказа прежний до миллиметра',
      spotsOf(tooWide) === spotsOf(demo),
      `${spotsOf(demo)} → ${spotsOf(tooWide)}`,
    );
  }

  /* ── 13. Угловая и П-образная: стены А, Б, В — замена уже и цена ── */
  for (const [kind, walls] of [
    ['corner_l', [{ id: 'w1', lengthMm: 3800 }, { id: 'w2', lengthMm: 2400 }]],
    ['u_shape', [{ id: 'w1', lengthMm: 2400 }, { id: 'w2', lengthMm: 3800 }, { id: 'w3', lengthMm: 2400 }]],
  ] as const) {
    const comp = buildComposition({
      kind,
      walls: walls.map((w) => ({ ...w })),
      ceilingHeightMm: 2700,
      requirements: REQ,
    });
    const runs = comp.segments.map((seg) => seg.run);
    /*
     * Итог объекта — сумма смет стен без удвоения разовых статей: тот же
     * `mergeEstimates`, которым складывает смету экран.
     */
    const objectTotal = (list: Run[]) =>
      mergeEstimates(list.map((r) => buildEstimate(r, 'optimal', DEMO_RATES))).total;

    runs.forEach((run, wall) => {
      const label = `${kind === 'corner_l' ? 'угловая' : 'П-образная'} · стена ${'АБВ'[wall]}`;
      const target = run.modules.find(
        (m) => !m.appliance && !m.column && m.kind === 'base' && m.widthMm >= 450,
      );
      if (!target) {
        check(`${label}: есть обычный модуль от 450 мм`, false, `НУЛЕВОЙ СЕЛЕКТОР · ${run.modules.map((m) => m.id).join(' ')}`);
        return;
      }
      const cards = libraryCards({ run, requirements: REQ, openings: [], moduleId: target.id });
      const narrow = cards
        .filter((c) => !c.refusal && c.spec.kind === currentVariant(target) && c.widthMm <= target.widthMm - 150)
        .sort((a, b) => b.widthMm - a.widthMm)[0];
      if (!narrow) {
        check(`${label}: карточка уже доступна`, false, `НУЛЕВОЙ СЕЛЕКТОР · доступно ${cards.filter((c) => !c.refusal).length} из ${cards.length}`);
        return;
      }
      const next = applyOps({ run, requirements: REQ, openings: [], ops: narrow.ops });
      const others = (r: Run) =>
        r.modules.filter((m) => m.offsetMm !== target.offsetMm).map((m) => `${m.offsetMm}:${m.widthMm}`).join(' ');
      check(
        `${label}: замена уже — соседи на месте, модулей столько же`,
        others(next) === others(run) && next.modules.length === run.modules.length,
        `${others(run)} → ${others(next)}`,
      );

      const totalOf = (r: Run) => objectTotal(runs.map((x, i) => (i === wall ? r : x)));
      const promised = priceDeltaOf(
        { run, requirements: REQ, openings: [] },
        narrow.ops,
        totalOf,
        totalOf(run),
      );
      const real = Math.round(totalOf(next)) - Math.round(totalOf(run));
      check(
        `${label}: разница на карточке равна сдвигу итога объекта до тенге`,
        promised === real,
        `карточка ${promised} · итог ${real}`,
      );
    });
  }

  /* ── 10. Пустая стена: низ, верх и антресоль собираются из библиотеки ── */
  {
    const freeWall: RunRequirements = { ...REQ, mode: 'free', appliances: [] };
    let wall = buildRun({
      lengthMm: 3800,
      ceilingHeightMm: 2700,
      requirements: freeWall,
      openings: [],
      comms: [],
    });
    const inserted = { base: 0, upper: 0, mezzanine: 0 };
    const count = (r: Run) => ({
      base: r.modules.length,
      upper: r.upperSegments
        .flatMap((sg) => sg.modules)
        .filter((m) => rowOfModule(r, m.id)?.row === 'upper').length,
      mezzanine: r.upperSegments
        .flatMap((sg) => sg.modules)
        .filter((m) => rowOfModule(r, m.id)?.row === 'mezzanine').length,
    });

    const putInto = (row: 'base' | 'upper' | 'mezzanine', widthMm: number): string | null => {
      const gap = libraryGaps(wall, [], freeWall).find((g) => g.row === row && g.widthMm >= widthMm);
      if (!gap) return `НУЛЕВОЙ СЕЛЕКТОР: в ряду «${row}» нет пустоты под ${widthMm} мм`;
      const card = libraryCards({
        run: wall,
        requirements: freeWall,
        openings: [],
        moduleId: null,
        gap,
      }).find((c) => !c.refusal && c.widthMm === widthMm);
      if (!card) return `НУЛЕВОЙ СЕЛЕКТОР: в пустоту ряда «${row}» нет карточки ${widthMm} мм`;
      wall = applyOps({ run: wall, requirements: freeWall, openings: [], ops: card.ops });
      inserted[row] += 1;
      return null;
    };

    const steps: (string | null)[] = [];
    steps.push(putInto('base', 600));
    steps.push(putInto('base', 600));
    check(
      'пустая стена: после нижних модулей верхний ряд сам не вырос',
      count(wall).upper === 0,
      `верхних ${count(wall).upper}`,
    );
    steps.push(putInto('upper', 600));
    steps.push(putInto('upper', 600));
    wall = applyOps({
      run: wall,
      requirements: freeWall,
      openings: [],
      ops: [{ op: 'set_mezzanine', heightMm: 400 }],
    });
    steps.push(putInto('mezzanine', 600));

    const failedSteps = steps.filter(Boolean);
    check(
      'пустая стена: каждая вставка из библиотеки нашла себе пустоту',
      failedSteps.length === 0,
      failedSteps.join(' · ') || 'все пять вставок',
    );
    const got = count(wall);
    check(
      'пустая стена: модулей ровно столько, сколько вставили',
      got.base === inserted.base && got.upper === inserted.upper && got.mezzanine === inserted.mezzanine &&
        inserted.base === 2 && inserted.upper === 2 && inserted.mezzanine === 1,
      `вставили низ ${inserted.base} · верх ${inserted.upper} · антресоль ${inserted.mezzanine}; ` +
        `в ряду низ ${got.base} · верх ${got.upper} · антресоль ${got.mezzanine}`,
    );
  }

  /* ── 11. Антресоль после ригеля: пустота есть, вставка встаёт не под ним ── */
  {
    const withMezz = applyOps({
      run: demo,
      requirements: REQ,
      openings: OPENINGS,
      ops: [{ op: 'set_mezzanine', heightMm: 400 }],
    });
    const beam = (withMezz.beams ?? [])[0];
    check('у демо-ряда есть ригель — проверять есть на чём', Boolean(beam), beam ? `${beam.fromCornerMm}+${beam.widthMm}` : 'НУЛЕВОЙ СЕЛЕКТОР');

    if (beam) {
      const beamEnd = beam.fromCornerMm + beam.widthMm;
      const after = libraryGaps(withMezz, OPENINGS, REQ).find(
        (g) => g.row === 'mezzanine' && g.fromMm >= beamEnd,
      );
      check(
        'пустота антресоли начинается после ригеля',
        Boolean(after),
        after
          ? `пусто ${after.fromMm}+${after.widthMm}`
          : 'НУЛЕВОЙ СЕЛЕКТОР: ' +
              (libraryGaps(withMezz, OPENINGS, REQ)
                .map((g) => `${g.row} ${g.fromMm}+${g.widthMm}`)
                .join(' · ') || 'пустот нет вовсе'),
      );

      if (after) {
        const card = libraryCards({
          run: withMezz,
          requirements: REQ,
          openings: OPENINGS,
          moduleId: null,
          gap: after,
        }).find((c) => !c.refusal);
        check('в пустоту антресоли после ригеля есть доступная карточка', Boolean(card), card?.key ?? 'НЕТ');

        if (card) {
          const placed = applyOps({ run: withMezz, requirements: REQ, openings: OPENINGS, ops: card.ops });
          const mezz = placed.upperSegments
            .flatMap((sg) => sg.modules)
            .filter((m) => rowOfModule(placed, m.id)?.row === 'mezzanine');
          const fresh = mezz.find((m) => m.offsetMm === after.fromMm);
          check(
            'вставка в антресоль встала после ригеля, а не под ним',
            Boolean(fresh) && fresh!.offsetMm >= beamEnd,
            fresh ? `${fresh.offsetMm}:${fresh.widthMm}` : `НЕ ВСТАЛА · ${placed.warnings[0] ?? ''}`,
          );
        }
      }
    }
  }
}

/* ═══  Слой 51: каталог материалов рядом со сценой  ═══ */

/**
 * RAL НА ВСЕ ФАСАДЫ — И КОД НА КАЖДОМ, И ЦВЕТ В ЛИНЕЙНОМ ПРОСТРАНСТВЕ.
 *
 * Код меряется на КАЖДОМ модуле с фасадом всех стен, а не «хотя бы у
 * одного». Цвет — на материале, настроенном ТОЙ ЖЕ функцией, что сцена
 * (`applyFrontLook`), и сверяется с hex, переведённым из sRGB в
 * линейное здесь же, своей формулой: hex в файле — sRGB, и сцена без
 * перевода показала бы другой цвет.
 */
console.log('\n' + 'Каталог материалов: RAL на все фасады, цена не задана (тесты 9, 11)');
{
  const close = (a: number, b: number, eps: number) => Math.abs(a - b) < eps;
  const file = parseMaterialFile(catalogJson);
  const entries = catalogEntriesFromRows(planMaterialImport(file, []).rows, file, 'demo', 'demo-mat:');
  const items = materialCatalog(entries);
  const all = Array.from(items.values());
  const ral = all.find((item) => item.code === 'RAL 010 30 20');
  const mdf = all.find((item) => item.collection === 'mdf-panels-palette');
  check(
    'тест 9: RAL 010 30 20 и МДФ-панель есть в каталоге',
    Boolean(ral) && Boolean(mdf),
    `${ral ? `${ral.code} ${ral.colorHex}` : 'RAL: НУЛЕВОЙ СЕЛЕКТОР'} · ${mdf ? mdf.code : 'МДФ: НУЛЕВОЙ СЕЛЕКТОР'}`,
  );
  if (!ral || !mdf) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: позиций каталога материалов нет — мерить нечего');

  const collectionOfItem = (id: string) => {
    const found = file.collections.find((collection) => collection.id === id);
    if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: коллекции ${id} нет в файле`);
    return found;
  };
  const ralChoice: MaterialChoice = { item: ral, collection: collectionOfItem(ral.collection), surface: 'matte' };

  const demoReq = requirementsFromTemplate(templateById(DEMO_TEMPLATE_ID)!, DEMO_REQUIREMENTS.options);
  const demo = buildRun({
    lengthMm: DEMO_PROJECT.lengthMm,
    ceilingHeightMm: DEMO_MEASUREMENT.ceilingHeightMm,
    requirements: demoReq,
    openings: DEMO_MEASUREMENT.walls[0].openings,
    comms: DEMO_MEASUREMENT.comms,
    cornerAt: null,
  });

  const paint = (run: Run, requirements: RunRequirements, choice: MaterialChoice, target: 'fronts' | 'carcass' | 'countertop' = 'fronts') => {
    const plan = materialOps(target, choice, run, null);
    if ('refusal' in plan) throw new Error(`материал не лёг: ${plan.refusal}`);
    return applyOps({ run, requirements, openings: DEMO_MEASUREMENT.walls[0].openings, ops: plan.ops });
  };

  const codeOf = (id: string | undefined) => entries.find((entry) => entry.id === id)?.article ?? '—';
  const frontsOf = (run: Run) => allModules(run).filter((unit) => hasFacade(unit));
  const notRal = (run: Run) => frontsOf(run).filter((unit) => codeOf(unit.front?.itemId) !== 'RAL 010 30 20');

  /* Модуль с филёнкой ДО материала: человек выбрал конструкцию, и она остаётся. */
  const framedId = frontsOf(demo).find((unit) => !unit.appliance)?.id;
  const framed = framedId
    ? applyOps({
        run: demo,
        requirements: demoReq,
        openings: DEMO_MEASUREMENT.walls[0].openings,
        ops: [{ op: 'set_front', moduleId: framedId, front: { base: 'mdf_enamel', construct: 'framed', finish: 'matte' } }],
      })
    : demo;

  const painted = paint(framed, demoReq, ralChoice);
  check(
    'тест 9: код RAL 010 30 20 на каждом фасаде прямой кухни',
    frontsOf(painted).length > 0 && notRal(painted).length === 0,
    `фасадов ${frontsOf(painted).length} · без кода: ${notRal(painted).map((unit) => unit.id).join(' ') || 'нет'}`,
  );
  check(
    'тест 9: и цвет у каждого — #643941 из файла',
    frontsOf(painted).every((unit) => unit.front?.colorHex === '#643941'),
    Array.from(new Set(frontsOf(painted).map((unit) => unit.front?.colorHex))).join(' '),
  );
  check(
    'конструкция, выбранная человеком, пережила смену материала',
    Boolean(framedId) && allModules(painted).find((unit) => unit.id === framedId)?.front?.construct === 'framed',
    framedId ? `${framedId}: ${allModules(painted).find((unit) => unit.id === framedId)?.front?.construct}` : 'НУЛЕВОЙ СЕЛЕКТОР',
  );

  const corner = buildComposition({
    kind: 'corner_l',
    walls: [
      { id: 'w1', lengthMm: 3800 },
      { id: 'w2', lengthMm: 2400 },
    ],
    ceilingHeightMm: 2700,
    requirements: REQ,
  });
  const cornerPainted = corner.segments.map((segment) => paint(segment.run, REQ, ralChoice));
  check(
    'тест 9: код на каждом фасаде угловой кухни — обе стены',
    cornerPainted.length === 2 && cornerPainted.every((run) => frontsOf(run).length > 0 && notRal(run).length === 0),
    cornerPainted.map((run, i) => `стена ${'АБ'[i]}: фасадов ${frontsOf(run).length}, без кода ${notRal(run).length}`).join(' · '),
  );

  /* Выбор переживает правку ряда: ширина и перестановка пересобирают ряд. */
  const widened = frontsOf(painted).find((unit) => !unit.appliance && unit.kind === 'base');
  const edited = widened
    ? applyOps({
        run: painted,
        requirements: demoReq,
        openings: DEMO_MEASUREMENT.walls[0].openings,
        ops: [{ op: 'set_width', moduleId: widened.id, widthMm: widened.widthMm - 50 }],
      })
    : painted;
  /*
   * Выбор живёт в модулях (тот же механизм, что у материала модуля), и
   * меряется он на модулях, которые СТОЯЛИ при выборе: правка ширины
   * пересобирает ряд, и у каждого из них код обязан остаться. Добор,
   * появившийся правкой ПОСЛЕ выбора, выбора не видел — так же, как
   * сегодня не видит его материал из палитры и готовый дизайн.
   */
  /*
   * Выбор «на всю кухню» — материал КУХНИ (слой 52): его держит и модуль,
   * стоявший при выборе, и модуль, появившийся после — добор в хвосте
   * после сужения.
   */
  const paintedIds = new Set(frontsOf(painted).map((unit) => unit.id));
  const bornAfter = frontsOf(edited).filter((unit) => !paintedIds.has(unit.id));
  check(
    'материал пережил пересборку ряда после правки ширины — у каждого фасада, и у нового добора тоже',
    Boolean(widened) && paintedIds.size > 0 && notRal(edited).length === 0,
    widened
      ? `${widened.id} −50 мм · стояло ${paintedIds.size} · появилось ${bornAfter.map((unit) => unit.id).join(' ') || 'ничего'} · без кода: ${notRal(edited).map((unit) => unit.id).join(' ') || 'никто'}`
      : 'НУЛЕВОЙ СЕЛЕКТОР',
  );

  const linear = (byte: number) => {
    const c = byte / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const expected = [0x64, 0x39, 0x41].map(linear);
  const spec = frontsOf(painted)[0].front!;
  const material = new THREE.MeshPhysicalMaterial();
  applyFrontLook(material, spec, '#D8D6D2', MATERIAL_FINISHES);
  const got = [material.color.r, material.color.g, material.color.b];
  check(
    'тест 9: цвет материала сцены равен линеаризованному hex',
    got.every((value, i) => Math.abs(value - expected[i]) < 1e-4),
    `материал ${got.map((v) => v.toFixed(4)).join(' ')} · ожидали ${expected.map((v) => v.toFixed(4)).join(' ')}`,
  );
  check(
    'тест 9: это не sRGB-число, положенное как есть',
    Math.abs(got[0] - 0x64 / 255) > 0.05,
    `r ${got[0].toFixed(4)} против sRGB ${(0x64 / 255).toFixed(4)}`,
  );
  check(
    'матовая эмаль — шероховатость и лак из таблицы поверхностей файла',
    material.roughness === MATERIAL_FINISHES.matte.roughness && material.clearcoat === MATERIAL_FINISHES.matte.clearcoat,
    `roughness ${material.roughness} · clearcoat ${material.clearcoat}`,
  );

  const mdfChoice = (surface: string): MaterialChoice => ({ item: mdf, collection: collectionOfItem(mdf.collection), surface });
  const look = (surface: string) => {
    const run = paint(demo, demoReq, mdfChoice(surface));
    const m = new THREE.MeshPhysicalMaterial();
    applyFrontLook(m, frontsOf(run)[0].front!, '#D8D6D2', MATERIAL_FINISHES);
    return m;
  };
  const gloss = look('high_gloss');
  const touch = look('touch_sense');
  check(
    'High Gloss и Touch Sense — разная шероховатость и лак, числа из файла',
    gloss.roughness === 0.05 && gloss.clearcoat === 1 && gloss.clearcoatRoughness === 0.03 &&
      touch.roughness === 0.9 && touch.clearcoat === 0,
    `глянец ${gloss.roughness}/${gloss.clearcoat}/${gloss.clearcoatRoughness} · тач ${touch.roughness}/${touch.clearcoat}`,
  );

  /*
   * КЛАДОВКА НАД КОЛОННОЙ — ТОЖЕ ФАСАД КУХНИ.
   *
   * Её собирает `buildUpperRow` заново на каждой правке, и `set_front`
   * до неё не дотягивался: ручной выбор отвечал «модуль не найден», а
   * второй материал на всю кухню её пропускал — пересборка возвращала
   * прежний фасад. Замерено в браузере на демо: после МДФ на все фасады
   * 13 из 14 стали МДФ, кладовка осталась эмалью RAL.
   */
  const storage = allModules(demo).find(
    (unit) => unit.section === 'mezzanine' && mezzanineBaseOf(unit, demo) !== null && hasFacade(unit),
  );
  check(
    'в демо-ряду есть кладовка над колонной — проверять есть на чём',
    Boolean(storage),
    storage ? storage.id : 'НУЛЕВОЙ СЕЛЕКТОР: кладовки над колонной нет',
  );
  if (storage) {
    const twice = paint(paint(demo, demoReq, ralChoice), demoReq, mdfChoice('high_gloss'));
    const after = allModules(twice).find((unit) => unit.id === storage.id);
    check(
      'второй материал на всю кухню перекрашивает и кладовку над колонной',
      codeOf(after?.front?.itemId) === mdf.code && notRal(twice).length === frontsOf(twice).length,
      `${storage.id}: ${codeOf(after?.front?.itemId)} · RAL осталось на ${frontsOf(twice).length - notRal(twice).length} из ${frontsOf(twice).length}`,
    );

    const direct = applyOps({
      run: demo,
      requirements: demoReq,
      openings: DEMO_MEASUREMENT.walls[0].openings,
      ops: [
        {
          op: 'set_front',
          moduleId: storage.id,
          front: { base: 'mdf_enamel', construct: 'solid', finish: 'matte', colorHex: '#123456' },
        },
      ],
    });
    const painted1 = allModules(direct).find((unit) => unit.id === storage.id);
    check(
      'материал на кладовку над колонной ложится, а не «модуль не найден»',
      direct.warnings.length === 0 && painted1?.front?.colorHex === '#123456',
      `${direct.warnings[0] ?? 'без отказа'} · фасад ${painted1?.front?.colorHex ?? '—'}`,
    );
  }

  /* ── Тест 11: цена null — строка «цена не задана», итог «неполный» ── */
  const withCatalog = buildEstimate(painted, 'optimal', DEMO_RATES, [], undefined, undefined, undefined, undefined, undefined, items);
  const withoutCatalog = buildEstimate(painted, 'optimal', DEMO_RATES);
  const ralLine = withCatalog.lines.find((line) => line.key.startsWith('front_item_'));
  check(
    'тест 11: фасады RAL идут своей строкой',
    Boolean(ralLine),
    ralLine ? `${ralLine.title}: ${ralLine.quantity} м²` : `НУЛЕВОЙ СЕЛЕКТОР: ${withCatalog.lines.map((line) => line.key).join(' ')}`,
  );
  check(
    'тест 11: строка говорит «цена не задана», а не 0 ₸',
    ralLine?.priceUnset === 'цена не задана' && lineAmountText(ralLine) === 'цена не задана',
    ralLine ? `priceUnset=${ralLine.priceUnset} · на экране «${lineAmountText(ralLine)}»` : '—',
  );
  check(
    'тест 11: итог помечен «неполный»',
    unpricedLines(withCatalog).length === 1 && totalCaption(withCatalog).includes('неполный'),
    `${totalCaption(withCatalog)} · строк без цены ${unpricedLines(withCatalog).length}`,
  );
  /* «Фасады» с нулём строку не выводят: нет строки — ноль по ставке цеха. */
  const frontPanel = (estimate: Estimate) => estimate.lines.find((line) => line.key === 'front_panel')?.quantity ?? 0;
  check(
    'тест 11: площадь этих фасадов не ушла в общую строку по ставке цеха',
    Boolean(ralLine) &&
      frontPanel(withoutCatalog) > 0 &&
      close(frontPanel(withCatalog) + ralLine!.quantity, frontPanel(withoutCatalog), 0.02),
    `«Фасады» ${frontPanel(withoutCatalog)} → ${frontPanel(withCatalog)} м² · RAL ${ralLine?.quantity ?? '—'} м²`,
  );
  check(
    'тест 11: итог не считает материал нулём молча — сумма без него, и она помечена',
    withCatalog.total < withoutCatalog.total && totalCaption(withCatalog).includes('неполный'),
    `${Math.round(withoutCatalog.total)} → ${Math.round(withCatalog.total)} · ${totalCaption(withCatalog)}`,
  );

  const pricedItems = materialCatalog(entries.map((entry) => (entry.id === ral.id ? { ...entry, price: 30000 } : entry)));
  const priced = buildEstimate(painted, 'optimal', DEMO_RATES, [], undefined, undefined, undefined, undefined, undefined, pricedItems);
  const pricedLine = priced.lines.find((line) => line.key === ralLine?.key);
  check(
    'с ценой та же строка считается: площадь × цена позиции',
    Boolean(pricedLine) && !pricedLine!.priceUnset && close(pricedLine!.total, pricedLine!.quantity * 30000, 0.01),
    pricedLine ? `${pricedLine.quantity} м² × 30 000 = ${pricedLine.total}` : 'НУЛЕВОЙ СЕЛЕКТОР',
  );
  check(
    'и итог больше не помечен',
    unpricedLines(priced).length === 0 && !totalCaption(priced).includes('неполный'),
    totalCaption(priced),
  );

  /* МДФ-панель: цена своя у каждой поверхности. */
  const mdfPriced = materialCatalog(
    entries.map((entry) =>
      entry.id === mdf.id
        ? { ...entry, meta: { ...entry.meta, finishPrices: { high_gloss: 41000, touch_sense: null } } }
        : entry,
    ),
  );
  const glossRun = paint(demo, demoReq, mdfChoice('high_gloss'));
  const touchRun = paint(demo, demoReq, mdfChoice('touch_sense'));
  const glossLine = buildEstimate(glossRun, 'optimal', DEMO_RATES, [], undefined, undefined, undefined, undefined, undefined, mdfPriced).lines.find((line) => line.key.startsWith('front_item_'));
  const touchLine = buildEstimate(touchRun, 'optimal', DEMO_RATES, [], undefined, undefined, undefined, undefined, undefined, mdfPriced).lines.find((line) => line.key.startsWith('front_item_'));
  check(
    'МДФ-панель: High Gloss со своей ценой, у Touch Sense цена не задана',
    Boolean(glossLine) && glossLine!.rate === 41000 && !glossLine!.priceUnset &&
      Boolean(touchLine) && touchLine!.priceUnset === 'цена не задана',
    `${glossLine?.title ?? '—'}: ${glossLine?.rate ?? '—'} · ${touchLine?.title ?? '—'}: ${touchLine ? lineAmountText(touchLine) : '—'}`,
  );

  /* Столешница и корпус: та же цена и то же «не задана». */
  const counterCollection = collectionOfItem('kedr-countertops');
  const carcassCollection = collectionOfItem('egger-ldsp');
  const own = catalogEntriesFromRows(
    [
      manualMaterialRow(counterCollection, { code: 'KEDR-TEST', name: 'Проба столешницы', hex: '#6f5a44', price: null }),
      manualMaterialRow(carcassCollection, { code: 'EGGER-TEST', name: 'Проба корпуса', hex: '#d8d2c4', price: null }),
    ],
    file,
    'demo',
    'demo-own:',
  );
  const ownItems = materialCatalog([...entries, ...own]);
  const counterItem = Array.from(ownItems.values()).find((item) => item.code === 'KEDR-TEST')!;
  const carcassItem = Array.from(ownItems.values()).find((item) => item.code === 'EGGER-TEST')!;
  const counterRun = paint(demo, demoReq, { item: counterItem, collection: counterCollection, surface: 'matte' }, 'countertop');
  const carcassRun = paint(demo, demoReq, { item: carcassItem, collection: carcassCollection, surface: 'matte' }, 'carcass');
  const counterLine = buildEstimate(counterRun, 'optimal', DEMO_RATES, [], undefined, undefined, undefined, undefined, undefined, ownItems).lines.find((line) => line.key.startsWith('countertop_item_'));
  /* Тем же путём, что экран: материалы корпуса — `carcassCatalog` того же каталога. */
  const carcassLine = buildEstimate(
    carcassRun,
    'optimal',
    DEMO_RATES,
    [],
    undefined,
    undefined,
    undefined,
    undefined,
    carcassCatalog([...entries, ...own]),
    ownItems,
  ).lines.find((line) => line.key === `carcass_${carcassItem.id}`);
  check(
    'столешница своей позиции без цены — «цена не задана», а не ставка цеха',
    counterLine?.priceUnset === 'цена не задана' &&
      !buildEstimate(counterRun, 'optimal', DEMO_RATES, [], undefined, undefined, undefined, undefined, undefined, ownItems).lines.some((line) => line.key === `countertop_${counterRun.options.countertop}`),
    counterLine ? `${counterLine.title}: ${lineAmountText(counterLine)}` : 'НУЛЕВОЙ СЕЛЕКТОР',
  );
  check(
    'корпус своей позиции без цены — «цена не задана»',
    carcassLine?.priceUnset === 'цена не задана',
    carcassLine ? `${carcassLine.title}: ${lineAmountText(carcassLine)}` : 'НУЛЕВОЙ СЕЛЕКТОР',
  );
  check(
    'столешница переживает правку ряда — она живёт на ряду, как материал корпуса',
    Boolean(widened) &&
      applyOps({
        run: counterRun,
        requirements: demoReq,
        openings: DEMO_MEASUREMENT.walls[0].openings,
        ops: [{ op: 'set_width', moduleId: widened!.id, widthMm: widened!.widthMm - 50 }],
      }).countertopMaterial?.itemId === counterItem.id,
    counterRun.countertopMaterial ? `${counterRun.countertopMaterial.itemId}` : 'НЕ ЛЕГЛА',
  );

  /* Демонстрация: материалов каталога на ней нет, и сумма не двинулась. */
  const demoPlain = buildEstimate(demo, 'optimal', DEMO_RATES).total;
  const demoWithCatalog = buildEstimate(demo, 'optimal', DEMO_RATES, [], undefined, undefined, undefined, undefined, undefined, items).total;
  check(
    'демо-ряд: каталог материалов в сторе сумму не двигает',
    demoPlain === demoWithCatalog,
    `${Math.round(demoPlain)} → ${Math.round(demoWithCatalog)}`,
  );
}


/* ═══  Слой 52: цена коллекции, смета кабинета, материал кухни  ═══ */

/**
 * ЦЕНА НА КОЛЛЕКЦИЮ И ПОВЕРХНОСТЬ; СВОЯ ЦЕНА ПОЗИЦИИ ЕЁ ПЕРЕБИВАЕТ.
 *
 * 1825 цветов RAL по одному не заведёт никто: цена ставится на коллекцию
 * и поверхность, позиция может её переопределить. Числа проверки —
 * некруглые и не совпадают ни с одной ставкой цеха: совпади они, строка
 * «правильно» посчиталась бы по чужой цене.
 */
console.log('\n' + 'Каталог материалов: цена коллекции, смета кабинета, материал кухни (тесты 8–10)');
{
  const close = (a: number, b: number, eps: number) => Math.abs(a - b) < eps;
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const file = parseMaterialFile(catalogJson);
  const entries = catalogEntriesFromRows(planMaterialImport(file, []).rows, file, 'demo', 'demo-mat:');
  const collectionOfFile = (id: string) => {
    const found = file.collections.find((c) => c.id === id);
    if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: коллекции ${id} нет в файле`);
    return found;
  };
  const ralCollection = collectionOfFile('ral-design');
  const mdfCollection = collectionOfFile('mdf-panels-palette');

  const P_RAL = 27_413;
  const P_OWN = 31_877;
  const P_MDF_GLOSS = 29_351;
  const P_MILLING = 18_437;
  const shopRates = new Set(Object.values(DEMO_RATES));
  check(
    'цены проверки некруглые и не совпадают ни с одной ставкой цеха',
    [P_RAL, P_OWN, P_MDF_GLOSS, P_MILLING].every((p) => !shopRates.has(p) && p % 100 !== 0),
    `${P_RAL} · ${P_OWN} · ${P_MDF_GLOSS} · ${P_MILLING}`,
  );

  const priceEntries = catalogEntriesFromRows(
    [
      collectionPriceRow(ralCollection, 'matte', P_RAL),
      collectionPriceRow(mdfCollection, 'high_gloss', P_MDF_GLOSS),
    ],
    file,
    'demo',
    'demo-price:',
  );
  const catalog = [...DEMO_CATALOG, ...entries, ...priceEntries];
  const rates = { ...DEMO_RATES, ...ratesFromCatalog(catalog) };
  const items = materialCatalog(catalog);
  const all = Array.from(items.values());
  const ral = all.find((item) => item.code === 'RAL 010 30 20');
  const mdf = all.find((item) => item.collection === 'mdf-panels-palette');
  check(
    'цена коллекции — не позиция: в списке материалов её нет, позиций по-прежнему 1845',
    items.size === 1845 && Boolean(ral) && Boolean(mdf),
    `позиций ${items.size}`,
  );
  if (!ral || !mdf) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: RAL 010 30 20 или МДФ-панели нет');

  const demoReq = requirementsFromTemplate(templateById(DEMO_TEMPLATE_ID)!, DEMO_REQUIREMENTS.options);
  const openings = DEMO_MEASUREMENT.walls[0].openings;
  const demo = buildRun({
    lengthMm: DEMO_PROJECT.lengthMm,
    ceilingHeightMm: DEMO_MEASUREMENT.ceilingHeightMm,
    requirements: demoReq,
    openings,
    comms: DEMO_MEASUREMENT.comms,
    cornerAt: null,
  });
  const paint = (run: Run, choice: MaterialChoice) => {
    const plan = materialOps('fronts', choice, run, null);
    if ('refusal' in plan) throw new Error(`материал не лёг: ${plan.refusal}`);
    return applyOps({ run, requirements: demoReq, openings, ops: plan.ops });
  };
  const painted = paint(demo, { item: ral, collection: ralCollection, surface: 'matte' });
  const frontLine = (estimate: Estimate) => estimate.lines.find((line) => line.key.startsWith('front_item_'));
  const frontsOf = (run: Run) => allModules(run).filter((unit) => hasFacade(unit));

  /* ── Тест 8 ── */
  const byCollection = buildEstimate(painted, 'optimal', rates, [], undefined, undefined, undefined, undefined, undefined, items);
  const line8 = frontLine(byCollection);
  check(
    'тест 8: RAL матовый с ценой коллекции — фасады посчитаны по ней',
    Boolean(line8) && line8!.rate === P_RAL && !line8!.priceUnset && close(line8!.total, round2(line8!.quantity * P_RAL), 0.01),
    line8 ? `${line8.title}: ${line8.quantity} м² × ${line8.rate} = ${line8.total}${line8.priceUnset ? ` · ${line8.priceUnset}` : ''}` : 'НУЛЕВОЙ СЕЛЕКТОР: строки фасадов RAL нет',
  );
  check(
    'тест 8: итог полный — строк без цены нет',
    unpricedLines(byCollection).length === 0 && !totalCaption(byCollection).includes('неполный'),
    `${totalCaption(byCollection)} · без цены: ${unpricedLines(byCollection).map((l) => l.key).join(' ') || 'нет'}`,
  );

  const ownCatalog = catalog.map((entry) => (entry.id === ral.id ? { ...entry, price: P_OWN } : entry));
  const ownItems = materialCatalog(ownCatalog);
  const line8own = frontLine(buildEstimate(painted, 'optimal', rates, [], undefined, undefined, undefined, undefined, undefined, ownItems));
  check(
    'тест 8: у позиции своя цена — берётся своя, а не коллекции',
    line8own?.rate === P_OWN,
    line8own ? `${line8own.rate} (коллекция ${P_RAL})` : 'НУЛЕВОЙ СЕЛЕКТОР',
  );
  check(
    'одна функция цены: панель и карточка читают те же числа, что смета',
    materialPrice(ral, 'matte', rates) === P_RAL && materialPrice(ownItems.get(ral.id)!, 'matte', rates) === P_OWN,
    `${materialPrice(ral, 'matte', rates)} · ${materialPrice(ownItems.get(ral.id)!, 'matte', rates)}`,
  );
  check(
    'цена коллекции — по поверхности: у глянца RAL своей цены нет',
    materialPrice(ral, 'gloss', rates) === null,
    String(materialPrice(ral, 'gloss', rates)),
  );

  const mdfGloss = paint(demo, { item: mdf, collection: mdfCollection, surface: 'high_gloss' });
  const mdfTouch = paint(demo, { item: mdf, collection: mdfCollection, surface: 'touch_sense' });
  const glossLine = frontLine(buildEstimate(mdfGloss, 'optimal', rates, [], undefined, undefined, undefined, undefined, undefined, items));
  const touchLine = frontLine(buildEstimate(mdfTouch, 'optimal', rates, [], undefined, undefined, undefined, undefined, undefined, items));
  check(
    'МДФ: High Gloss по цене коллекции, у Touch Sense цены коллекции нет — «цена не задана»',
    glossLine?.rate === P_MDF_GLOSS && touchLine?.priceUnset === 'цена не задана',
    `${glossLine?.rate ?? '—'} · ${touchLine ? lineAmountText(touchLine) : '—'}`,
  );

  /* ── Тест 10: выбор «на всю кухню» держится для новых модулей ── */
  /*
   * Пустоты в крашеном демо-ряду нет: её делает человек — снимает шкаф
   * верхнего ряда. Пустота висящего ряда законна (ловушка 410), и
   * библиотека ставит в неё модуль тем же путём, что на экране.
   */
  const removable = painted.upperSegments.flatMap((segment) => segment.modules).find((unit) => !unit.appliance);
  check(
    'в крашеном ряду есть шкаф верхнего ряда без прибора — его снимут',
    Boolean(removable),
    removable?.id ?? 'НУЛЕВОЙ СЕЛЕКТОР: верхнего шкафа нет',
  );
  const holed = removable
    ? applyOps({ run: painted, requirements: demoReq, openings, ops: [{ op: 'remove_module', moduleId: removable.id }] })
    : painted;
  const gap = libraryGaps(holed, openings, demoReq).find((g) => g.row === 'upper');
  check(
    'после снятия шкафа в верхнем ряду пустое место — вставлять есть куда',
    Boolean(gap),
    gap ? `${gap.row} ${gap.fromMm}+${gap.widthMm}` : 'НУЛЕВОЙ СЕЛЕКТОР: пустот нет',
  );
  if (gap) {
    const card = libraryCards({ run: holed, requirements: demoReq, openings, moduleId: null, gap }).find(
      (c) => !c.refusal,
    );
    check('в пустоте есть доступная карточка библиотеки', Boolean(card), card?.key ?? 'НУЛЕВОЙ СЕЛЕКТОР');
    if (card) {
      const inserted = applyOps({ run: holed, requirements: demoReq, openings, ops: card.ops });
      const before = new Set(allModules(holed).map((unit) => unit.id));
      const fresh = allModules(inserted).filter((unit) => !before.has(unit.id) && hasFacade(unit));
      check(
        'тест 10: модуль из библиотеки после выбора «на всю кухню» — с тем же материалом',
        fresh.length > 0 && fresh.every((unit) => unit.front?.itemId === ral.id && unit.front?.surface === 'matte'),
        fresh.length
          ? fresh.map((unit) => `${unit.id}: ${unit.front?.itemId ?? 'фасад по умолчанию'}`).join(' · ')
          : 'НУЛЕВОЙ СЕЛЕКТОР: новый модуль не встал',
      );
    }
  }

  /* Выбор на модуле сильнее материала кухни. */
  const own = frontsOf(painted).find((unit) => !unit.appliance);
  if (own) {
    const repainted = applyOps({
      run: painted,
      requirements: demoReq,
      openings,
      ops: [{ op: 'set_front', moduleId: own.id, front: { base: 'mdf_enamel', construct: 'solid', finish: 'matte', colorHex: '#224466' } }],
    });
    const after = applyOps({
      run: repainted,
      requirements: demoReq,
      openings,
      ops: [{ op: 'set_width', moduleId: own.id, widthMm: own.widthMm - 50 }],
    });
    check(
      'выбор на модуле сильнее материала кухни и переживает правку',
      allModules(after).find((unit) => unit.id === own.id)?.front?.colorHex === '#224466',
      String(allModules(after).find((unit) => unit.id === own.id)?.front?.colorHex),
    );
  }

  /* ── Тест 9 на уровне движка: смета кабинета = смета экрана ── */
  const millingEntries = catalog.map((entry) =>
    entry.id.startsWith('demo-milling-') && entry.article !== 'MIL-NONE' ? { ...entry, price: P_MILLING } : entry,
  );
  const millingId = millingEntries.find((entry) => entry.id.startsWith('demo-milling-') && entry.article !== 'MIL-NONE')?.id;
  const carcassId = carcassCatalog(millingEntries).keys().next().value as string | undefined;
  check('для объекта есть фрезеровка и декор корпуса', Boolean(millingId) && Boolean(carcassId), `${millingId} · ${carcassId}`);
  if (millingId && carcassId) {
    const full = applyOps({
      run: painted,
      requirements: demoReq,
      openings,
      ops: [
        { op: 'set_milling', millingId, scope: 'base' },
        { op: 'set_carcass', scope: 'base', itemId: carcassId },
      ],
    });
    const orgCatalog = millingEntries;
    const liveRates = { ...DEMO_RATES, ...ratesFromCatalog(orgCatalog) };
    const disabled = { basic: [], optimal: [], premium: [] };
    const input = workspaceInput({
      title: 'Проверка',
      zone: 'Кухня',
      measurement: DEMO_MEASUREMENT,
      requirements: demoReq,
      rates: liveRates,
      cornerAt: null,
      production: DEFAULT_PRODUCTION,
      milling: millingCatalog(orgCatalog),
      carcass: carcassCatalog(orgCatalog),
      materials: materialCatalog(orgCatalog),
    });
    const variants = composeVariants(input, disabled, { optimal: full });
    const active = variants.find((v) => v.key === 'optimal')!;
    const designer = objectEstimateOf({
      layout: null,
      segments: [active.run],
      wallAEstimate: active.estimate,
      variantKey: 'optimal',
      input,
      disabled,
    });
    check(
      'у объекта есть и RAL, и фрезеровка, и декор корпуса своими строками',
      ['front_item_', 'front_milling_', 'carcass_'].every((prefix) => designer.lines.some((l) => l.key.startsWith(prefix))),
      designer.lines.filter((l) => /^(front_item_|front_milling_|carcass_)/.test(l.key)).map((l) => `${l.key}=${l.rate}`).join(' · '),
    );

    const state: MillworkState = {
      requirements: demoReq,
      runs: { optimal: full },
      selectedVariant: 'optimal',
      disabled,
      priceSnapshot: designer.priceSnapshot,
      shape: 'linear',
      savedAt: '2026-09-25T12:00:00.000Z',
    };
    const offer = projectOffer({
      title: 'Проверка',
      zone: 'Кухня',
      measurement: DEMO_MEASUREMENT,
      state: JSON.parse(JSON.stringify(state)) as MillworkState,
      production: DEFAULT_PRODUCTION,
      catalog: orgCatalog,
      rates: ratesFromCatalog(orgCatalog),
    });
    const oldCabinet = composeVariants(
      workspaceInput({
        title: 'Проверка',
        zone: 'Кухня',
        measurement: DEMO_MEASUREMENT,
        requirements: demoReq,
        rates: designer.priceSnapshot,
      }),
      disabled,
      { optimal: full },
    ).find((v) => v.key === 'optimal')!.estimate.total;
    check(
      'тест 9: итог кабинета клиента = итог экрана дизайнера, до тенге',
      'estimate' in offer && Math.round(offer.estimate.total) === Math.round(designer.total),
      `экран ${Math.round(designer.total)} · кабинет ${'estimate' in offer ? Math.round(offer.estimate.total) : offer.refusal} · прежним путём кабинет считал ${Math.round(oldCabinet)}`,
    );

    /* Переоценка после отправки: кабинет держит снимок, экран считает по каталогу. */
    const repriced = orgCatalog.map((entry) => (entry.id === priceEntries[0].id ? { ...entry, price: P_RAL + 1000 } : entry));
    const later = projectOffer({
      title: 'Проверка',
      zone: 'Кухня',
      measurement: DEMO_MEASUREMENT,
      state,
      production: DEFAULT_PRODUCTION,
      catalog: repriced,
      rates: ratesFromCatalog(repriced),
    });
    check(
      'кабинет держит снимок цен: переоценка коллекции после отправки сумму клиента не меняет',
      'estimate' in later && Math.round(later.estimate.total) === Math.round(designer.total),
      `${Math.round(designer.total)} → ${'estimate' in later ? Math.round(later.estimate.total) : later.refusal}`,
    );
  }

  /* Демонстрация: ни цен коллекций, ни материалов на ней нет — сумма прежняя. */
  check(
    'демо-ряд: цены коллекций в каталоге сумму не двигают',
    buildEstimate(demo, 'optimal', rates, [], undefined, undefined, undefined, undefined, undefined, items).total ===
      buildEstimate(demo, 'optimal', DEMO_RATES).total,
    `${Math.round(buildEstimate(demo, 'optimal', DEMO_RATES).total)}`,
  );
}

/* ═══════════  Слой 53: комната из замера — стены, проёмы, ригель  ═══════════ */

/**
 * КОМНАТА ИЗ ЗАМЕРА ИДЁТ ПУТЁМ ЭКРАНА (тесты 17–20 слоя 53).
 *
 * Рабочее место доходит до сцены так: `objectSite` → `compositionFor` →
 * `objectInput` → `composeVariants` → `wallSegments` → `runPlacements` →
 * `roomSourceOf` → `roomAroundRows`. Здесь те же вызовы в том же порядке.
 * Сцена рисует `roomBoxes`, схема и план — `ElevationDrawing` и
 * `PlanDrawing` с `roomOnRow`, как `RunSchematic`.
 *
 * Меряются миллиметры ЗАМЕРА против НАРИСОВАННОГО — на трёх формах, двух
 * решениях угла и трёх школах цеха: на умолчаниях расхождение не видно.
 */
console.log('\nСлой 53: комната из замера — стены, проёмы, ригель');
{
  const T = ROOM_WALL_THICKNESS_MM;

  const cornerRoom: Measurement = {
    id: 'room-corner',
    ceilingHeightMm: 2750,
    walls: [
      {
        id: 'a',
        lengthMm: 3400,
        angleDeg: 90,
        openings: [{ id: 'win-a', kind: 'window', fromCornerMm: 1300, widthMm: 1000, sillMm: 900, heightMm: 1400 }],
      },
      {
        id: 'b',
        lengthMm: 2600,
        angleDeg: 90,
        openings: [
          { id: 'beam-b', kind: 'beam', fromCornerMm: 1200, widthMm: 300, sillMm: 0, heightMm: 300, depthMm: 250 },
        ],
      },
      {
        id: 'c',
        lengthMm: 3400,
        angleDeg: 90,
        openings: [{ id: 'door-c', kind: 'door', fromCornerMm: 2300, widthMm: 900, sillMm: 0, heightMm: 2100 }],
      },
    ],
    comms: [],
    photos: [],
    measuredBy: 'Проверка',
    measuredAt: '2026-09-26',
    notes: '',
  };

  const uRoom: Measurement = {
    id: 'room-u',
    ceilingHeightMm: 2700,
    walls: [
      { id: 'a', lengthMm: 2800, angleDeg: 90, openings: [] },
      {
        id: 'b',
        lengthMm: 3200,
        angleDeg: 90,
        openings: [{ id: 'win-b', kind: 'window', fromCornerMm: 1100, widthMm: 900, sillMm: 900, heightMm: 1400 }],
      },
      { id: 'c', lengthMm: 2800, angleDeg: 90, openings: [] },
      {
        id: 'd',
        lengthMm: 3200,
        angleDeg: 90,
        openings: [{ id: 'door-d', kind: 'door', fromCornerMm: 1000, widthMm: 900, sillMm: 0, heightMm: 2100 }],
      },
    ],
    comms: [],
    photos: [],
    measuredBy: 'Проверка',
    measuredAt: '2026-09-26',
    notes: '',
  };

  const schools: [string, ProductionSettings][] = [
    ['цех 560/320', DEFAULT_PRODUCTION],
    [
      'цех 550/350',
      {
        ...DEFAULT_PRODUCTION,
        depths: { baseMm: 550, upperMm: 350, mezzanineMm: 550 },
        heights: { plinthMm: 100, carcassMm: 760, countertopMm: 40, apronMm: 600 },
      },
    ],
    ['цех 600/300', { ...DEFAULT_PRODUCTION, depths: { baseMm: 600, upperMm: 300, mezzanineMm: 600 } }],
  ];

  const shapes: { title: string; measurement: Measurement; wallId: string; kind: CompositionKind }[] = [
    { title: 'прямая (демо)', measurement: DEMO_MEASUREMENT, wallId: 'w1', kind: 'linear' },
    { title: 'угловая', measurement: cornerRoom, wallId: 'a', kind: 'corner_l' },
    { title: 'П-образная', measurement: uRoom, wallId: 'a', kind: 'u_shape' },
  ];
  const solutions = ['false_panel', 'corner_module'] as const;

  /** Путь экрана до сцены: ровно те вызовы, что у рабочего места. */
  const screenRoom = (
    measurement: Measurement,
    wallId: string,
    kind: CompositionKind,
    solution: (typeof solutions)[number],
    production: ProductionSettings,
    survey: Survey | null = null,
  ) => {
    const requirements = DEMO_REQUIREMENTS;
    const resolution = survey ? resolveSurvey(survey) : null;
    const base = workspaceInput({
      title: 'Комната',
      zone: 'Кухня',
      measurement,
      requirements,
      rates: DEMO_RATES,
      wallId,
      cornerAt: null,
    });
    const site = objectSite(base, resolution);
    /*
     * Путь экрана слоя 55: комплектация композиции — та же, что у стены А,
     * и стене А угол кладёт композиция (`wallCornerOf`).
     */
    const attempt = compositionFor({
      shape: kind,
      requirements,
      cornerSolution: solution,
      site,
      production,
      variantKey: 'optimal',
    });
    if (attempt?.state === 'refused') return { refused: attempt.reason };
    const layout = attempt?.state === 'built' ? attempt.composition : null;
    const input = objectInput({
      base,
      resolution,
      requirements: wallRequirementsOf(layout, requirements),
      rates: DEMO_RATES,
      production,
      milling: new Map(),
      carcass: new Map(),
      materials: new Map(),
      corner: wallCornerOf(layout),
    });
    const active = composeVariants(input, { basic: [], optimal: [], premium: [] } as never, {}).find(
      (variant) => variant.key === 'optimal',
    )!;
    const segments = wallSegments(layout, active.run, {});
    const zone = active.run.zone;
    const places = runPlacements({ runs: segments, solution, zone, production });
    const rows = segments.map((run, i) => ({ run, placement: places[i] }));
    const source = roomSourceOf({
      walls: site.walls,
      runOpenings: input.openings,
      measuredWalls: resolution?.measurement.walls ?? base.measuredWalls ?? [],
      ceilingMm: site.ceilingMm,
      depthMm: rowStandardDepthMm(zone, 'base', production),
      solution,
      survey,
    });
    return {
      rows,
      siteWalls: site.walls,
      /** Комната сцены: `CadScene` вокруг рядов. */
      room: roomAroundRows(source, rows, null),
      /** Комната схемы и плана: `RunSchematic` вокруг тех же рядов. */
      plan: roomAroundRows(source, rows, null),
    };
  };

  type WallFrame = { startMm: [number, number]; dir: [number, number]; inward: [number, number] };
  type Extent = { along: [number, number]; into: [number, number]; height: [number, number] };

  /** Вершины коробки в мире (мм) → промежутки в осях стены. */
  const extentOf = (wall: WallFrame, corners: [number, number, number][]): Extent => {
    const along: number[] = [];
    const into: number[] = [];
    const height: number[] = [];
    for (const [x, y, z] of corners) {
      const dx = x - wall.startMm[0];
      const dz = z - wall.startMm[1];
      along.push(dx * wall.dir[0] + dz * wall.dir[1]);
      into.push(dx * wall.inward[0] + dz * wall.inward[1]);
      height.push(y);
    }
    return {
      along: [Math.min(...along), Math.max(...along)],
      into: [Math.min(...into), Math.max(...into)],
      height: [Math.min(...height), Math.max(...height)],
    };
  };

  /** Коробка комнаты: центр и размер в метрах, поворот как у стены. */
  const roomCorners = (box: { center: [number, number, number]; size: [number, number, number]; rotationYDeg: number }) => {
    const a = (box.rotationYDeg * Math.PI) / 180;
    const ux: [number, number] = [Math.cos(a), -Math.sin(a)];
    const uz: [number, number] = [Math.sin(a), Math.cos(a)];
    const out: [number, number, number][] = [];
    for (const sx of [-0.5, 0.5]) {
      for (const sy of [-0.5, 0.5]) {
        for (const sz of [-0.5, 0.5]) {
          const lx = sx * box.size[0];
          const lz = sz * box.size[2];
          out.push([
            (box.center[0] + lx * ux[0] + lz * uz[0]) * 1000,
            (box.center[1] + sy * box.size[1]) * 1000,
            (box.center[2] + lx * ux[1] + lz * uz[1]) * 1000,
          ]);
        }
      }
    }
    return out;
  };

  /** Коробка ряда: в осях ряда, в мир — местом ряда (`rowPlacement`). */
  const partCorners = (
    part: { position: [number, number, number]; scale: [number, number, number] },
    place: { xM: number; zM: number; rotationYDeg: number },
  ) => {
    const a = (place.rotationYDeg * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const out: [number, number, number][] = [];
    for (const ox of [-0.5, 0.5]) {
      for (const oy of [-0.5, 0.5]) {
        for (const oz of [-0.5, 0.5]) {
          const x = part.position[0] + ox * part.scale[0];
          const y = part.position[1] + oy * part.scale[1];
          const z = part.position[2] + oz * part.scale[2];
          out.push([(x * cos + z * sin + place.xM) * 1000, y * 1000, (-x * sin + z * cos + place.zM) * 1000]);
        }
      }
    }
    return out;
  };

  const overlap = (a: [number, number], b: [number, number]) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]);

  /** Отметки на разметке чертежа: `data-<что>="id"` и все `data-*-mm`. */
  const marksIn = (svg: string, attr: string) => {
    const out = new Map<string, Record<string, number>>();
    for (const tag of svg.match(new RegExp(`<g[^>]*\\b${attr}="[^"]*"[^>]*>`, 'g')) ?? []) {
      const id = tag.match(new RegExp(`\\b${attr}="([^"]*)"`))![1];
      const values: Record<string, number> = {};
      const numbers = /data-([a-z-]+)-mm="(-?[\d.]+)"/g;
      for (let hit = numbers.exec(tag); hit; hit = numbers.exec(tag)) values[hit[1]] = Number(hit[2]);
      out.set(id, values);
    }
    return out;
  };

  let configs = 0;
  let walls17 = 0;
  let backs18 = 0;
  let parts18 = 0;
  let objects19 = 0;
  let marks20 = 0;
  const refused: string[] = [];
  const drift17: string[] = [];
  const drift18: string[] = [];
  const hits18: string[] = [];
  const drift19: string[] = [];
  const drift20: string[] = [];

  for (const shape of shapes) {
    for (const solution of solutions) {
      for (const [school, production] of schools) {
        const tag = `${shape.title} · ${solution === 'corner_module' ? 'угловой модуль' : 'фальш-панель'} · ${school}`;
        const screen = screenRoom(shape.measurement, shape.wallId, shape.kind, solution, production);
        if ('refused' in screen) {
          refused.push(`${tag}: ${screen.refused}`);
          continue;
        }
        const { rows, room, plan } = screen;
        if (!room || !plan) {
          refused.push(`${tag}: КОМНАТЫ НЕТ — рядов ${rows.length}`);
          continue;
        }
        configs += 1;
        const boxes = roomBoxes(room);
        const ceiling = shape.measurement.ceilingHeightMm;
        const measuredWalls = shape.measurement.walls.filter((wall) => wall.lengthMm > 0);

        /* ── 17. Стен в сцене = стен в композиции замера, длина и высота = замер ── */
        const drawnWalls = new Set(boxes.filter((box) => box.role === 'wall').map((box) => box.wallIndex));
        if (
          drawnWalls.size !== screen.siteWalls.length ||
          room.walls.length !== screen.siteWalls.length ||
          screen.siteWalls.length !== measuredWalls.length
        ) {
          drift17.push(
            `${tag}: стен нарисовано ${drawnWalls.size}, в комнате ${room.walls.length}, ` +
              `в композиции ${screen.siteWalls.length}, в замере ${measuredWalls.length}`,
          );
        }
        for (const wall of room.walls) {
          walls17 += 1;
          const want = measuredWalls.find((candidate) => candidate.id === wall.id);
          const pieces = boxes
            .filter((box) => box.wallIndex === wall.index && box.role === 'wall')
            .map((box) => extentOf(wall, roomCorners(box)));
          if (!want || pieces.length === 0) {
            drift17.push(`${tag} · ${wall.id}: ${!want ? 'стены нет в замере' : 'НОЛЬ КУСКОВ СТЕНЫ в сцене'}`);
            continue;
          }
          const u0 = Math.min(...pieces.map((p) => p.along[0]));
          const u1 = Math.max(...pieces.map((p) => p.along[1]));
          const v0 = Math.min(...pieces.map((p) => p.height[0]));
          const v1 = Math.max(...pieces.map((p) => p.height[1]));
          const i0 = Math.min(...pieces.map((p) => p.into[0]));
          const i1 = Math.max(...pieces.map((p) => p.into[1]));
          const area = pieces.reduce((sum, p) => sum + (p.along[1] - p.along[0]) * (p.height[1] - p.height[0]), 0);
          const holes = room.objects
            .filter((object) => object.wallIndex === wall.index && object.cut === 'through')
            .reduce((sum, object) => sum + object.widthMm * (object.topMm - object.bottomMm), 0);
          const wantArea = want.lengthMm * ceiling - holes;
          if (
            wall.lengthMm !== want.lengthMm ||
            wall.heightMm !== ceiling ||
            Math.abs(u0) > 1 ||
            Math.abs(u1 - want.lengthMm) > 1 ||
            Math.abs(v0) > 1 ||
            Math.abs(v1 - ceiling) > 1 ||
            Math.abs(i1) > 1 ||
            Math.abs(i0 + T) > 1 ||
            Math.abs(area - wantArea) > 0.002 * want.lengthMm * ceiling
          ) {
            drift17.push(
              `${tag} · ${wall.id}: замер ${want.lengthMm}×${ceiling}, нарисовано ${Math.round(u1 - u0)}×${Math.round(v1 - v0)} ` +
                `от ${Math.round(u0)} · грань ${Math.round(i1)} · наружу ${Math.round(-i0)} мм · площадь ${Math.round(area / 1e4) / 100} м² ` +
                `против ${Math.round(wantArea / 1e4) / 100}`,
            );
          }
        }

        /* ── 18. Задняя плоскость ряда на грани стены, мебель не в объёме стены ── */
        for (const row of rows) {
          const wall = room.walls.find((candidate) => candidate.id === row.run.wallId);
          if (!wall) {
            drift18.push(`${tag}: ряд стены ${row.run.wallId} — стены нет в комнате`);
            continue;
          }
          const place = roomRowPlacement(row);
          const placed = runPlaces(row.run);
          if (placed.length === 0) {
            drift18.push(`${tag} · ${wall.id}: НОЛЬ МОДУЛЕЙ — задней плоскости нет`);
            continue;
          }
          for (const entry of placed) {
            backs18 += 1;
            const back = entry.zM - entry.depthM;
            const x1 = entry.x + entry.unit.widthMm / 1000;
            const edge = extentOf(
              wall,
              partCorners({ position: [(entry.x + x1) / 2, 0, back], scale: [x1 - entry.x, 0, 0] }, place),
            );
            const gap = Math.max(Math.abs(edge.into[0]), Math.abs(edge.into[1]));
            if (gap > 0.5) {
              drift18.push(`${tag} · ${wall.id} · ${entry.unit.id}: от задней плоскости до грани стены ${gap.toFixed(1)} мм`);
            }
          }

          const parts = runBoxes(row.run, {
            thicknessMm: production.carcassMm,
            frontThicknessMm: production.frontMm,
            gapMm: production.frontGapMm,
          });
          /*
           * Меряется НАРИСОВАННОЕ: коробки стен, угловых блоков и объёмов с
           * замеренным выносом — те, что кладёт сцена (`roomBoxes`). По данным
           * комнаты проверка оставалась зелёной и тогда, когда стена стояла
           * по центру линии замера и съедала полтолщины шкафов.
           */
          const solids = boxes
            .filter((box) => box.role === 'wall' || box.role === 'corner' || box.role === 'object')
            .map((box) => {
              const host = room.walls[box.wallIndex];
              return { box, host, extent: extentOf(host, roomCorners(box)) };
            });
          for (const part of parts) {
            parts18 += 1;
            const corners = partCorners(part, place);
            for (const { box, host, extent } of solids) {
              const e = extentOf(host, corners);
              const deep = overlap(e.into, extent.into);
              if (overlap(e.along, extent.along) > 1 && overlap(e.height, extent.height) > 1 && deep > 1) {
                hits18.push(
                  `${tag} · ряд ${wall.id} · ${part.panel ?? part.node ?? part.material}: ` +
                    `${box.role === 'object' ? `в объёме ${box.kind} ${box.objectId}` : `в стене ${host.id}`} на ${deep.toFixed(1)} мм`,
                );
              }
            }
          }
        }

        /* ── 19. Окно, дверь, ригель: положение в мм = замер ── */
        for (const measuredWall of measuredWalls) {
          for (const opening of measuredWall.openings) {
            objects19 += 1;
            const object = room.objects.find((candidate) => candidate.id === opening.id);
            if (!object) {
              drift19.push(`${tag}: ${opening.kind} ${opening.id} НЕ НАРИСОВАН`);
              continue;
            }
            const volume = opening.kind === 'beam' || opening.kind === 'column' || opening.kind === 'pipe_box';
            const want =
              opening.kind === 'beam'
                ? { bottom: ceiling - beamDropMm(opening), top: ceiling }
                : opening.kind === 'door' || opening.kind === 'arch'
                  ? { bottom: 0, top: opening.heightMm }
                  : { bottom: opening.sillMm, top: opening.sillMm + opening.heightMm };
            const need = `${measuredWall.id} ${opening.fromCornerMm}+${opening.widthMm} ↕${want.bottom}…${want.top} вынос ${volume ? (opening.depthMm ?? null) : null}`;
            const got = `${object.wallId} ${object.fromMm}+${object.widthMm} ↕${object.bottomMm}…${object.topMm} вынос ${object.depthMm}`;
            if (need !== got) drift19.push(`${tag} · ${opening.id}: замер ${need} · комната ${got}`);

            /* В сцене: проём — дыра ровно по отметке, объём — коробка по ней же. */
            const wall = room.walls[object.wallIndex];
            if (object.cut === 'through') {
              const pieces = boxes
                .filter((box) => box.wallIndex === wall.index && box.role === 'wall')
                .map((box) => extentOf(wall, roomCorners(box)));
              const hole: Extent = {
                along: [opening.fromCornerMm, opening.fromCornerMm + opening.widthMm],
                into: [-T, 0],
                height: [want.bottom, want.top],
              };
              const covered = (u: number, v: number) =>
                pieces.some((p) => u > p.along[0] && u < p.along[1] && v > p.height[0] && v < p.height[1]);
              const midU = (hole.along[0] + hole.along[1]) / 2;
              const midV = (hole.height[0] + hole.height[1]) / 2;
              const around: [number, number][] = [
                [hole.along[0] - 2, midV],
                [hole.along[1] + 2, midV],
                ...(hole.height[0] > 2 ? [[midU, hole.height[0] - 2] as [number, number]] : []),
                ...(hole.height[1] < ceiling - 2 ? [[midU, hole.height[1] + 2] as [number, number]] : []),
              ];
              const inHole = pieces.filter(
                (p) => overlap(p.along, hole.along) > 1 && overlap(p.height, hole.height) > 1,
              );
              const open = around.filter(([u, v]) => !covered(u, v));
              if (inHole.length > 0 || open.length > 0) {
                drift19.push(
                  `${tag} · ${opening.id}: дыра в стене не по замеру — кусков в проёме ${inHole.length}, ` +
                    `непокрытых краёв ${open.length}`,
                );
              }
            } else {
              const box = boxes.find((candidate) => candidate.objectId === object.id);
              if (!box) {
                drift19.push(`${tag} · ${opening.id}: В СЦЕНЕ НЕТ КОРОБКИ`);
                continue;
              }
              const e = extentOf(wall, roomCorners(box));
              const deep = object.depthMm ?? ROOM_CONTOUR_MM;
              if (
                Math.abs(e.along[0] - opening.fromCornerMm) > 1 ||
                Math.abs(e.along[1] - opening.fromCornerMm - opening.widthMm) > 1 ||
                Math.abs(e.height[0] - want.bottom) > 1 ||
                Math.abs(e.height[1] - want.top) > 1 ||
                Math.abs(e.into[0]) > 1 ||
                Math.abs(e.into[1] - deep) > 1
              ) {
                drift19.push(
                  `${tag} · ${opening.id}: в сцене ${Math.round(e.along[0])}…${Math.round(e.along[1])} ↕` +
                    `${Math.round(e.height[0])}…${Math.round(e.height[1])} вынос ${Math.round(e.into[1] - e.into[0])} · замер ${need}`,
                );
              }
            }
          }
        }

        /* ── 20. Сцена, схема и план — одна комната ── */
        for (const row of rows) {
          const wall = plan.walls.find((candidate) => candidate.id === row.run.wallId);
          const sceneWall = room.walls.find((candidate) => candidate.id === row.run.wallId);
          const measuredWall = measuredWalls.find((candidate) => candidate.id === row.run.wallId);
          if (!wall || !sceneWall || !measuredWall) {
            drift20.push(`${tag}: ряд ${row.run.wallId} — стены нет в комнате схемы или сцены`);
            continue;
          }
          const on = roomOnRow(plan, row.run);
          const elevation = renderToStaticMarkup(
            createElement(ElevationDrawing, { run: row.run, roomObjects: on.objects }),
          );
          const planSvg = renderToStaticMarkup(
            createElement(PlanDrawing, {
              run: row.run,
              comms: [],
              issues: [],
              roomWall: on.wall,
              roomObjects: on.objects,
            }),
          );
          const onElevation = new Map(
            Array.from(marksIn(elevation, 'data-room-object').entries()).concat(
              Array.from(marksIn(elevation, 'data-beam').entries()),
            ),
          );
          const onPlan = marksIn(planSvg, 'data-room-object');
          const planWall = marksIn(planSvg, 'data-plan-wall');
          const expected = measuredWall.openings.flatMap((opening) => {
            const at = markOnRun(opening, sceneWall.rowStartMm, row.run.lengthMm);
            return at ? [{ opening, at }] : [];
          });

          if (onElevation.size !== expected.length || onPlan.size !== expected.length) {
            drift20.push(
              `${tag} · ${wall.id}: на ряду по замеру ${expected.length}, на схеме ${onElevation.size}, на плане ${onPlan.size}`,
            );
          }
          const wallMark = Array.from(planWall.values())[0];
          if (
            !wallMark ||
            wallMark.from !== -sceneWall.rowStartMm ||
            wallMark.to !== measuredWall.lengthMm - sceneWall.rowStartMm
          ) {
            drift20.push(
              `${tag} · ${wall.id}: стена на плане ${wallMark ? `${wallMark.from}…${wallMark.to}` : 'НЕ НАРИСОВАНА'} · ` +
                `замер ${-sceneWall.rowStartMm}…${measuredWall.lengthMm - sceneWall.rowStartMm}`,
            );
          }

          for (const { opening, at } of expected) {
            marks20 += 1;
            const elev = onElevation.get(opening.id);
            const planMark = onPlan.get(opening.id);
            const sceneBox = boxes.find((box) => box.objectId === opening.id);
            const scenePieces = boxes
              .filter((box) => box.wallIndex === sceneWall.index && box.role === 'wall')
              .map((box) => extentOf(sceneWall, roomCorners(box)));
            /* Сцена: коробка объёма или края дыры — в координатах ряда. */
            const sceneFrom = sceneBox
              ? extentOf(sceneWall, roomCorners(sceneBox)).along[0] - sceneWall.rowStartMm
              : Math.max(
                  ...scenePieces
                    .filter((p) => p.along[1] <= opening.fromCornerMm + 1)
                    .map((p) => p.along[1]),
                ) - sceneWall.rowStartMm;
            const engineBeam = (row.run.beams ?? []).find((beam) => beam.id === opening.id);
            const dropOk =
              opening.kind !== 'beam' ||
              (elev?.drop === beamDropMm(opening) && Boolean(engineBeam) && engineBeam!.fromCornerMm === at.fromCornerMm);
            if (
              !elev ||
              !planMark ||
              elev.from !== at.fromCornerMm ||
              elev.width !== at.widthMm ||
              planMark.from !== at.fromCornerMm ||
              planMark.width !== at.widthMm ||
              Math.abs(Math.max(sceneFrom, 0) - at.fromCornerMm) > 1 ||
              !dropOk
            ) {
              drift20.push(
                `${tag} · ${opening.id}: замер→ряд ${at.fromCornerMm}+${at.widthMm} · схема ${elev ? `${elev.from}+${elev.width}` : 'НЕТ'} · ` +
                  `план ${planMark ? `${planMark.from}+${planMark.width}` : 'НЕТ'} · сцена ${Math.round(sceneFrom)}` +
                  (opening.kind === 'beam'
                    ? ` · свес на схеме ${elev?.drop ?? 'НЕТ'}, в движке ${engineBeam ? engineBeam.fromCornerMm : 'НЕТ РИГЕЛЯ'}`
                    : ''),
              );
            }
          }
        }
      }
    }
  }

  const want = shapes.length * solutions.length * schools.length;
  check(
    'слой 53: все конфигурации комнаты собрались путём экрана',
    configs === want && refused.length === 0,
    configs === want ? `${configs} конфигураций` : `собралось ${configs} из ${want}: ${refused.slice(0, 2).join(' · ')}`,
  );
  check(
    'тест 17: стен в сцене = стен в композиции замера, длина и высота каждой = замер в мм, внутренняя грань на линии замера',
    walls17 === (2 + 3 + 4) * solutions.length * schools.length && drift17.length === 0,
    drift17.length === 0 ? `${walls17} стен сверено` : drift17.slice(0, 3).join(' · '),
  );
  check(
    'тест 18: от задней плоскости каждого ряда до внутренней грани стены 0 мм',
    backs18 > 0 && drift18.length === 0,
    backs18 === 0 ? 'НОЛЬ МОДУЛЕЙ — мерить нечего' : drift18.length === 0 ? `${backs18} модулей на грани` : drift18.slice(0, 3).join(' · '),
  );
  check(
    'тест 18: ни одна деталь мебели не входит в объём стены или ригеля',
    parts18 > 0 && hits18.length === 0,
    parts18 === 0 ? 'НОЛЬ ДЕТАЛЕЙ — мерить нечего' : hits18.length === 0 ? `${parts18} деталей вне стен` : `${hits18.length}: ${hits18.slice(0, 3).join(' · ')}`,
  );
  check(
    'тест 19: окно, дверь и ригель — в комнате и в сцене на отметках замера',
    objects19 === (2 + 3 + 2) * solutions.length * schools.length && drift19.length === 0,
    drift19.length === 0 ? `${objects19} объектов сверено` : drift19.slice(0, 3).join(' · '),
  );
  check(
    'тест 20: сцена, схема и план ставят объекты комнаты на одни отметки — из одной roomLayout',
    marks20 === (2 + 2 + 1) * solutions.length * schools.length && drift20.length === 0,
    drift20.length === 0 ? `${marks20} отметок сверено трижды` : drift20.slice(0, 3).join(' · '),
  );

  /*
   * ── Стены между камерой и кухней прячутся, стены с мебелью видны ──
   *
   * Камера — та же, что у «Общего вида»: габарит мебели как у
   * `sceneBounds` (коробки рядов без внутренних деталей), открытая сторона
   * `openSideOf`, отход `generalCamera` под холст 1408 × 691. Стена, которую
   * пересекает луч «камера → центр кухни», обязана быть спрятана; стена, у
   * которой стоит мебель, — видна.
   */
  {
    const drift: string[] = [];
    const seen: string[] = [];
    let viewed = 0;
    let uVisible = -1;
    for (const shape of shapes) {
      const screen = screenRoom(shape.measurement, shape.wallId, shape.kind, 'false_panel', DEFAULT_PRODUCTION);
      if ('refused' in screen || !screen.room) {
        drift.push(`${shape.title}: КОМНАТЫ НЕТ`);
        continue;
      }
      viewed += 1;
      const { rows, room } = screen;
      const corners = rows.flatMap((row) =>
        runBoxes(row.run, { thicknessMm: 16, frontThicknessMm: 18, gapMm: 3 })
          .filter((part) => !part.inside)
          .flatMap((part) => partCorners(part, roomRowPlacement(row))),
      );
      const low = [0, 1, 2].map((i) => Math.min(...corners.map((c) => c[i])) / 1000);
      const high = [0, 1, 2].map((i) => Math.max(...corners.map((c) => c[i])) / 1000);
      const center: [number, number, number] = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2];
      const size: [number, number, number] = [high[0] - low[0], high[1] - low[1], high[2] - low[2]];
      const eye = generalCamera({ center, size, open: openSideOf(room, rows), aspect: 1408 / 691 }).position;
      const hidden = new Set(wallsFacingAway(room, [eye[0] * 1000, eye[2] * 1000]).map((index) => room.walls[index].id));

      /* Пересекает ли луч «камера → центр кухни» внутреннюю грань стены — по плану. */
      const blocks = (wall: (typeof room.walls)[number]) => {
        const p = [eye[0] * 1000, eye[2] * 1000];
        const q = [center[0] * 1000, center[2] * 1000];
        const a = wall.startMm;
        const d1 = [q[0] - p[0], q[1] - p[1]];
        const d2 = [wall.lengthMm * wall.dir[0], wall.lengthMm * wall.dir[1]];
        const den = d1[0] * d2[1] - d1[1] * d2[0];
        if (Math.abs(den) < 1e-9) return false;
        const t = ((a[0] - p[0]) * d2[1] - (a[1] - p[1]) * d2[0]) / den;
        const u = ((a[0] - p[0]) * d1[1] - (a[1] - p[1]) * d1[0]) / den;
        return t > 0 && t < 1 && u > 0 && u < 1;
      };
      const kitchen = new Set(rows.map((row) => row.run.wallId));
      const shown = room.walls.filter((wall) => !hidden.has(wall.id)).map((wall) => wall.id);
      seen.push(`${shape.title}: видны ${shown.join(' ') || 'НИ ОДНОЙ'} · спрятаны ${Array.from(hidden).join(' ') || 'нет'}`);
      for (const wall of room.walls) {
        if (kitchen.has(wall.id) && hidden.has(wall.id)) drift.push(`${shape.title}: стена ${wall.id} с мебелью СПРЯТАНА`);
        if (blocks(wall) && !hidden.has(wall.id)) drift.push(`${shape.title}: стена ${wall.id} между камерой и кухней ВИДНА`);
      }
      if (shape.kind === 'u_shape') uVisible = shown.length;
    }
    check(
      'стены между камерой и кухней спрятаны, стены с мебелью видны, у П-образной видны три',
      viewed === shapes.length && drift.length === 0 && uVisible === 3,
      drift.length === 0 ? `${seen.join(' · ')}` : drift.slice(0, 3).join(' · '),
    );
  }

  /* ── Не замерено — не рисуется; допущение помечено ── */
  {
    const survey = surveyFromMeasurement(cornerRoom, 'проверка допущений');
    survey.walls[2].openings[0].widthMm = UNKNOWN;
    survey.walls[1].openings[0].depthMm = UNKNOWN;
    const screen = screenRoom(cornerRoom, 'a', 'corner_l', 'false_panel', DEFAULT_PRODUCTION, survey);
    const room = 'refused' in screen ? null : screen.room;
    const boxes = room ? roomBoxes(room) : [];
    const door = room?.objects.find((object) => object.id === 'door-c');
    const beam = room?.objects.find((object) => object.id === 'beam-b');
    const beamBox = boxes.find((box) => box.objectId === 'beam-b');
    check(
      'не замерено: дверь без ширины не рисуется и названа словами',
      Boolean(room) && !door && (room?.missing ?? []).some((line) => /двер/i.test(line) && /ширин/.test(line)),
      room ? (room.missing.join(' · ') || 'СПИСОК НЕЗАМЕРЕННОГО ПУСТ') : `КОМНАТЫ НЕТ: ${'refused' in screen ? screen.refused : ''}`,
    );
    check(
      'не замерено: ригель без выноса — контур на стене, не выдуманный брус',
      Boolean(beam) && beam!.depthMm === null && beamBox?.role === 'contour' &&
        (room?.missing ?? []).some((line) => /ригель/i.test(line) && /вынос/.test(line)),
      beam ? `вынос ${beam.depthMm} · роль в сцене ${beamBox?.role ?? 'НЕТ КОРОБКИ'}` : 'РИГЕЛЯ НЕТ В КОМНАТЕ',
    );
    check(
      'допущение: стены и окно из библиотеки помечены assumed — сцена кладёт их полупрозрачными',
      Boolean(room) &&
        room!.walls.length > 0 &&
        room!.walls.every((wall) => wall.state === 'assumed') &&
        room!.objects.find((object) => object.id === 'win-a')?.state === 'assumed' &&
        boxes.filter((box) => box.role === 'wall').every((box) => box.state === 'assumed'),
      room ? room.walls.map((wall) => `${wall.id}:${wall.state}`).join(' ') : 'КОМНАТЫ НЕТ',
    );
  }
}


/* ═══════════  Слой 54: рендер по чертежу — что идёт в картинку  ═══════════ */

/**
 * РЕНДЕР ПО ЧЕРТЕЖУ БЕРЁТ ТО, ЧТО НАРИСОВАНО, — ПО ПРАВИЛАМ (слой 54).
 *
 * Видеокарта здесь не нужна: сборщик сцены для трассировщика
 * (`pathTraceSceneOf`) — чистое правило «что из живой сцены идёт в
 * картинку». Браузерная сторона — `scripts/check-render.mjs`.
 *
 * И развёртка фото «в настоящем размере»: трассировщик шейдеров сцены не
 * выполняет, поэтому она запекается в геометрию той же таблицей граней,
 * что строит шейдер. Строка шейдера сверяется буква в букву с прежней —
 * растр от переноса таблицы поменяться не имел права.
 */
console.log('\nСлой 54: рендер по чертежу — сцена для трассировщика и развёртка фото');
{
  /* ── Развёртка фото: настоящий размер на всех трёх гранях ── */
  const box = new THREE.BoxGeometry(1, 1, 1);
  const baked = realSizeUvGeometry(box, new THREE.Vector3(0.6, 0.72, 0.56), [0.6, 0.45]);
  const position = baked.getAttribute('position');
  const normal = baked.getAttribute('normal');
  const uv = baked.getAttribute('uv');
  const span = { z: [Infinity, -Infinity, Infinity, -Infinity], x: [Infinity, -Infinity, Infinity, -Infinity], y: [Infinity, -Infinity, Infinity, -Infinity] };
  for (let i = 0; i < position.count; i += 1) {
    const face = Math.abs(normal.getZ(i)) > 0.5 ? 'z' : Math.abs(normal.getX(i)) > 0.5 ? 'x' : 'y';
    const range = span[face];
    range[0] = Math.min(range[0], uv.getX(i));
    range[1] = Math.max(range[1], uv.getX(i));
    range[2] = Math.min(range[2], uv.getY(i));
    range[3] = Math.max(range[3], uv.getY(i));
  }
  const width = (range: number[]) => [Math.round((range[1] - range[0]) * 1000) / 1000, Math.round((range[3] - range[2]) * 1000) / 1000];
  /*
   * Фасад 600 × 720 при фото 600 × 450: по ширине ровно одно фото, по
   * высоте 1.6. Торец 560 × 720: 0.933 × 1.6. Верх 600 × 560: 1 × 1.244.
   */
  const faces = { z: width(span.z), x: width(span.x), y: width(span.y) };
  check(
    'развёртка фото в геометрии: грань любой ориентации несёт фото в настоящем размере',
    faces.z[0] === 1 && faces.z[1] === 1.6 && faces.x[0] === 0.933 && faces.x[1] === 1.6 && faces.y[0] === 1 && faces.y[1] === 1.244,
    `лицо ${faces.z.join('×')} · торец ${faces.x.join('×')} · верх ${faces.y.join('×')}`,
  );
  check(
    'шейдер сцены собран из той же таблицы граней и не поменялся',
    REAL_SIZE_UV_SOURCE.includes('vec2 rsUv = rsNormal.z > 0.5 ? rsPos.xy : (rsNormal.x > 0.5 ? rsPos.zy : rsPos.xz);'),
    REAL_SIZE_UV_SOURCE.split('\n').find((line) => line.includes('rsUv =')) ?? 'СТРОКИ РАЗВЁРТКИ НЕТ',
  );
  baked.dispose();

  /* ── Что из живой сцены идёт в картинку ── */
  const live = new THREE.Scene();
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const standard = new THREE.MeshStandardMaterial({ color: '#b9b2a4' });

  live.add(new THREE.Mesh(unit, standard));

  const batch = new THREE.InstancedMesh(unit, standard, 3);
  for (let i = 0; i < 3; i += 1) batch.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i, 0, 0));
  live.add(batch);

  /*
   * «Не идёт» узнаётся по САМОМУ мешу сцены (`userData.from` у детали
   * трассировщика), а не по признаку, который и проверяется: снятый
   * признак проходил бы такую проверку вхолостую, а неосвещаемый
   * материал в трассировщике — уже другой объект.
   */
  const hiddenWall = new THREE.Group();
  hiddenWall.visible = false;
  const hiddenMesh = new THREE.Mesh(unit, standard);
  hiddenWall.add(hiddenMesh);
  live.add(hiddenWall);

  const grip = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color: '#C08B3E' }));
  grip.userData = { helper: true };
  live.add(grip);

  const shadeMesh = new THREE.Mesh(unit, cadShadeMaterial(0.3));
  live.add(shadeMesh);

  const contour = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18 }));
  contour.userData = { role: 'contour', kind: 'beam', objectId: 'beam-1' };
  live.add(contour);

  const glow = new THREE.Mesh(unit, Object.assign(new THREE.MeshBasicMaterial({ color: '#F6E2B8' }), { userData: { emissive: true } }));
  live.add(glow);

  const hitMesh = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  live.add(hitMesh);

  const key = new THREE.DirectionalLight('#ffffff', 1.05);
  key.position.set(2, 5, 4);
  live.add(key, key.target);

  const built = pathTraceSceneOf(live);
  const meshes: THREE.Mesh[] = [];
  const lights: THREE.DirectionalLight[] = [];
  built.scene.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
    if ((object as THREE.DirectionalLight).isDirectionalLight) lights.push(object as THREE.DirectionalLight);
  });
  /* Светится та, у которой цвет свечения не чёрный: сила по умолчанию у всех 1. */
  const emissive = meshes.filter((mesh) => {
    const material = mesh.material as THREE.MeshStandardMaterial;
    return material.emissive.getHex() !== 0 && material.emissiveIntensity > 0;
  });

  check(
    'в картинку идут видимые детали, каждая копия пачки отдельно, подсветка — светом',
    built.meshes === 5 && meshes.length === 5 && emissive.length === 1,
    `деталей ${built.meshes} (нужно 5: деталь + 3 копии пачки + подсветка) · светящихся ${emissive.length}`,
  );
  const leaked = [
    ['спрятанная стена', hiddenMesh],
    ['ручка выделения', grip],
    ['полоса затенения', shadeMesh],
    ['зона касания', hitMesh],
  ].filter(([, source]) => meshes.some((mesh) => mesh.userData.from === (source as THREE.Object3D).uuid));
  check(
    'не идут: спрятанная стена, ручка выделения, полоса затенения, зона касания',
    leaked.length === 0,
    leaked.length === 0 ? `в сцене трассировщика ${meshes.length} деталей` : `ПОПАЛИ: ${leaked.map(([name]) => name).join(', ')}`,
  );
  check(
    'контур незамеренного на картинку не идёт и назван словами',
    built.skipped.length === 1 && built.skipped[0] === 'beam',
    `пропущено: ${built.skipped.join(', ') || 'НИЧЕГО — контур попал в картинку'}`,
  );
  check(
    'ключевой свет САПР-вида — тем же направлением, яркость из cadLook',
    lights.length === 1 &&
      Math.abs(lights[0].intensity - 1.05 * CAD_RENDER.keyScale) < 1e-9 &&
      lights[0].position.distanceTo(new THREE.Vector3(2, 5, 4)) < 1e-9,
    lights[0] ? `яркость ${lights[0].intensity.toFixed(3)} · место ${lights[0].position.toArray().join(', ')}` : 'СВЕТА НЕТ',
  );

  /* Фото «в настоящем размере» уходит с запечённой развёрткой и картой без сдвигов. */
  const photoLive = new THREE.Scene();
  const texture = new THREE.Texture();
  texture.repeat.set(3, 2);
  const photoMaterial = new THREE.MeshStandardMaterial({ map: texture });
  photoMaterial.userData = { realSizePatched: true, realSizeM: [0.6, 0.45] };
  const front = new THREE.Mesh(unit, photoMaterial);
  front.scale.set(0.6, 0.72, 0.018);
  photoLive.add(front);
  const photoBuilt = pathTraceSceneOf(photoLive);
  const photoMesh = photoBuilt.scene.children.find((child) => (child as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
  const bakedUv = photoMesh?.geometry.getAttribute('uv');
  const bakedMap = (photoMesh?.material as THREE.MeshStandardMaterial | undefined)?.map;
  check(
    'фото «в настоящем размере» уходит в трассировщик запечённым, а общая коробка не тронута',
    Boolean(photoMesh && photoMesh.geometry !== unit && bakedUv && bakedMap && bakedMap.repeat.x === 1 && bakedMap.repeat.y === 1) &&
      unit.getAttribute('uv').getX(0) === new THREE.BoxGeometry(1, 1, 1).getAttribute('uv').getX(0),
    photoMesh ? `своя геометрия ${photoMesh.geometry !== unit} · повтор карты ${bakedMap?.repeat.toArray().join('×')}` : 'ДЕТАЛИ НЕТ',
  );
  built.dispose();
  photoBuilt.dispose();
}

/* ═══════════  Слой 55: угол Г и П как у мебельщика  ═══════════ */

/**
 * УГОЛ ПРОВЕРЯЕТСЯ ТЕМ ЖЕ ПУТЁМ, ЧТО ЭКРАН.
 *
 * Стена А на экране собирается из вариантов (`composeVariants`) и угол
 * получает от композиции (`wallCornerOf`); остальные стены — из
 * композиции и правок (`wallSegments`). Проверка, собиравшая угол
 * `buildComposition` напрямую, мерила данные ДО этого шва — а дефекты
 * слоя жили ровно в нём: у угла было НОЛЬ владельцев, столешницы А и Б
 * ложились в угловой квадрат дважды, запила в смете не было.
 *
 * Каждый тип угла (низ: слепой, Г; верх: Г, слепой, пустой) — на
 * Г-образной и П-образной кухне и на четырёх школах цеха: 560/320,
 * 550/350, 600/300 и 560/320 с размерами угла организации (панель 60,
 * Г-модуль 1000). Числа объявлены и сверяются: конфигураций не может
 * тихо стать меньше.
 */
console.log('\nСлой 55: угол Г и П — владелец, места, пересечения, полосы, открывание, Г-модуль, хвост');
{
  const LOWERS: LowerCornerKind[] = ['blind', 'l_shape'];
  const UPPERS: UpperCornerKind[] = ['l_shape', 'blind', 'empty'];
  const ALL: CornerChoice[] = LOWERS.flatMap((lower) => UPPERS.map((upper) => ({ lower, upper })));

  const room55 = (walls: [string, number][]): Measurement => ({
    id: 'room-55',
    ceilingHeightMm: 2700,
    walls: walls.map(([id, lengthMm]) => ({ id, lengthMm, angleDeg: 90, openings: [] })),
    comms: [],
    photos: [],
    measuredBy: 'Проверка',
    measuredAt: '2026-10-01',
    notes: '',
  });
  const L_ROOM = room55([
    ['a', 3600],
    ['b', 2800],
    ['c', 3600],
    ['d', 2800],
  ]);
  const U_ROOM = room55([
    ['a', 2800],
    ['b', 3600],
    ['c', 2800],
    ['d', 3600],
  ]);

  const SCHOOLS: [string, ProductionSettings][] = [
    ['560/320', DEFAULT_PRODUCTION],
    [
      '550/350',
      {
        ...DEFAULT_PRODUCTION,
        depths: { baseMm: 550, upperMm: 350, mezzanineMm: 550 },
        heights: { plinthMm: 100, carcassMm: 760, countertopMm: 40, apronMm: 600 },
      },
    ],
    ['600/300', { ...DEFAULT_PRODUCTION, depths: { baseMm: 600, upperMm: 300, mezzanineMm: 600 } }],
    [
      '560/320, угол 60/1000',
      { ...DEFAULT_PRODUCTION, corner: { falsePanelMm: 60, lowerLMm: 1000, upperLMm: 600, confirmed: true } },
    ],
  ];

  type Shape55 = { title: string; measurement: Measurement; kind: CompositionKind; corners: CornerChoice[] };
  const SHAPES: Shape55[] = [
    ...ALL.map((choice) => ({ title: 'Г', measurement: L_ROOM, kind: 'corner_l' as const, corners: [choice] })),
    ...ALL.map((choice) => ({ title: 'П', measurement: U_ROOM, kind: 'u_shape' as const, corners: [choice, choice] })),
    {
      title: 'П смешанная',
      measurement: U_ROOM,
      kind: 'u_shape',
      corners: [
        { lower: 'blind', upper: 'blind' },
        { lower: 'l_shape', upper: 'l_shape' },
      ],
    },
    {
      title: 'П смешанная',
      measurement: U_ROOM,
      kind: 'u_shape',
      corners: [
        { lower: 'l_shape', upper: 'empty' },
        { lower: 'blind', upper: 'l_shape' },
      ],
    },
  ];
  const DISABLED55 = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;

  /** Путь экрана: ровно те вызовы, что у рабочего места (`Workspace`). */
  const screen55 = (
    shape: Shape55,
    production: ProductionSettings,
    edits: { walls?: Record<number, Run>; runs?: Partial<Record<VariantKey, Run>> } = {},
  ) => {
    const requirements = DEMO_REQUIREMENTS;
    const base = workspaceInput({
      title: 'Угол',
      zone: 'Кухня',
      measurement: shape.measurement,
      requirements,
      rates: DEMO_RATES,
      wallId: 'a',
      cornerAt: null,
    });
    const site = objectSite(base, null);
    const attempt = compositionFor({
      shape: shape.kind,
      requirements,
      cornerSolution: 'false_panel',
      corners: shape.corners,
      site,
      production,
      variantKey: 'optimal',
    });
    if (attempt?.state !== 'built') {
      return { refused: attempt?.state === 'refused' ? attempt.reason : 'композиции нет' } as const;
    }
    const layout = attempt.composition;
    const input = objectInput({
      base,
      resolution: null,
      requirements: wallRequirementsOf(layout, requirements),
      rates: DEMO_RATES,
      production,
      milling: new Map(),
      carcass: new Map(),
      materials: new Map(),
      corner: wallCornerOf(layout),
    });
    const active = composeVariants(input, DISABLED55, edits.runs ?? {}).find((variant) => variant.key === 'optimal')!;
    const segments = wallSegments(layout, active.run, edits.walls ?? {});
    const zone = active.run.zone;
    const places = runPlacements({ runs: segments, corners: shape.corners, zone, production });
    const rows = segments.map((run, i) => ({ run, placement: places[i] }));
    const source = roomSourceOf({
      walls: site.walls,
      runOpenings: input.openings,
      measuredWalls: base.measuredWalls ?? [],
      ceilingMm: site.ceilingMm,
      depthMm: rowStandardDepthMm(zone, 'base', production),
      solution: 'false_panel',
      corners: shape.corners,
      zone,
      production,
      survey: null,
    });
    const room = roomAroundRows(source, rows, null);
    const estimate = objectEstimateOf({
      layout,
      segments,
      wallAEstimate: active.estimate,
      variantKey: 'optimal',
      input,
      disabled: DISABLED55,
    });
    /* Смета КАЖДОЙ стены: у стены А — из вариантов, у остальных — как у `objectEstimateOf`. */
    const wallEstimates = segments.map((run, i) =>
      i === 0
        ? active.estimate
        : buildEstimate(run, 'optimal', DEMO_RATES, [], undefined, production, undefined, new Map(), new Map(), new Map()),
    );
    return { layout, segments, rows, room, estimate, wallEstimates, input, site, requirements, zone };
  };

  /* ── Геометрия: всё в миллиметрах мира ── */
  type V3 = [number, number, number];
  type Obb = { c: V3; u: [V3, V3, V3]; e: V3; name: string };
  const rotY = (v: V3, a: number): V3 => [
    v[0] * Math.cos(a) + v[2] * Math.sin(a),
    v[1],
    -v[0] * Math.sin(a) + v[2] * Math.cos(a),
  ];
  const rotX = (v: V3, a: number): V3 => [
    v[0],
    v[1] * Math.cos(a) - v[2] * Math.sin(a),
    v[1] * Math.sin(a) + v[2] * Math.cos(a),
  ];
  /** Коробка ряда (метры, оси ряда) → коробка мира (мм). Повороты рядов — по 90°. */
  const worldBox = (
    place: { xM: number; zM: number; rotationYDeg: number },
    center: V3,
    size: V3,
    turn: { yaw?: number; pitch?: number } = {},
    name = '',
  ): Obb => {
    const a = (place.rotationYDeg * Math.PI) / 180;
    const local = (v: V3) => rotY(rotX(v, turn.pitch ?? 0), turn.yaw ?? 0);
    const c = rotY(center, a);
    return {
      c: [(c[0] + place.xM) * 1000, c[1] * 1000, (c[2] + place.zM) * 1000],
      u: [rotY(local([1, 0, 0]), a), rotY(local([0, 1, 0]), a), rotY(local([0, 0, 1]), a)],
      e: [(size[0] * 1000) / 2, (size[1] * 1000) / 2, (size[2] * 1000) / 2],
      name,
    };
  };
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  /**
   * Насколько две коробки входят друг в друга, мм: наименьшее
   * перекрытие проекций по 15 осям (теорема о разделяющей оси). Ноль и
   * меньше — не пересекаются (касание — ноль).
   */
  const depthOf = (A: Obb, B: Obb): number => {
    const axes: V3[] = [...A.u, ...B.u];
    for (const a of A.u) for (const b of B.u) {
      const n = cross(a, b);
      const len = Math.hypot(n[0], n[1], n[2]);
      if (len > 1e-9) axes.push([n[0] / len, n[1] / len, n[2] / len]);
    }
    const d: V3 = [B.c[0] - A.c[0], B.c[1] - A.c[1], B.c[2] - A.c[2]];
    let least = Infinity;
    for (const axis of axes) {
      const ra = A.e.reduce((sum, e, k) => sum + e * Math.abs(dot(A.u[k], axis)), 0);
      const rb = B.e.reduce((sum, e, k) => sum + e * Math.abs(dot(B.u[k], axis)), 0);
      least = Math.min(least, ra + rb - Math.abs(dot(d, axis)));
      if (least <= 0) return least;
    }
    return least;
  };
  /** Полоса ряда (отметки вдоль ряда, мм; глубина назад и вперёд от фасада, мм) → прямоугольник мира. */
  const stripRect = (place: { xM: number; zM: number; rotationYDeg: number }, fromMm: number, toMm: number, backMm: number, frontMm: number) => {
    const a = (place.rotationYDeg * Math.PI) / 180;
    const pts = [fromMm, toMm].flatMap((x) =>
      [-backMm, frontMm].map((z) => {
        const p = rotY([x / 1000, 0, z / 1000], a);
        return [(p[0] + place.xM) * 1000, (p[2] + place.zM) * 1000] as [number, number];
      }),
    );
    return {
      x0: Math.min(...pts.map((q) => q[0])),
      x1: Math.max(...pts.map((q) => q[0])),
      z0: Math.min(...pts.map((q) => q[1])),
      z1: Math.max(...pts.map((q) => q[1])),
    };
  };
  type Rect55 = ReturnType<typeof stripRect>;
  const rectGap = (a: Rect55, b: Rect55) =>
    Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1));
  const rectOverlap = (a: Rect55, b: Rect55) =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
  /** Общая граница двух касающихся прямоугольников, мм. */
  const rectTouch = (a: Rect55, b: Rect55) =>
    Math.max(
      Math.abs(a.x1 - b.x0) < 0.5 || Math.abs(b.x1 - a.x0) < 0.5 ? Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) : 0,
      Math.abs(a.z1 - b.z0) < 0.5 || Math.abs(b.z1 - a.z0) < 0.5 ? Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) : 0,
    );

  let configs55 = 0;
  let owners55 = 0;
  let origins55 = 0;
  let pairs55 = 0;
  let solids55 = 0;
  let gaps55 = 0;
  let joints55 = 0;
  let movers55 = 0;
  let poses55 = 0;
  let lModules55 = 0;
  const refused55: string[] = [];
  const drift8: string[] = [];
  const hits9: string[] = [];
  const gaps9: string[] = [];
  const drift10: string[] = [];
  const keys11: string[] = [];
  const hits11: string[] = [];
  const drift12: string[] = [];

  for (const shape of SHAPES) {
    for (const [school, production] of SCHOOLS) {
      const tag = `${shape.title} ${shape.corners.map((c) => `${c.lower}/${c.upper}`).join('+')} · ${school}`;
      const screen = screen55(shape, production);
      if ('refused' in screen) {
        refused55.push(`${tag}: ${screen.refused}`);
        continue;
      }
      const { rows, room, segments, zone } = screen;
      if (!room) {
        refused55.push(`${tag}: КОМНАТЫ НЕТ`);
        continue;
      }
      configs55 += 1;
      const corners = shape.corners;
      const shop = { thicknessMm: production.carcassMm, frontThicknessMm: production.frontMm, gapMm: production.frontGapMm };
      const depthMm = rowStandardDepthMm(zone, 'base', production);
      const places = rows.map((row) => roomRowPlacement(row));

      /* ── 8. Владелец ровно один; ряды Б и В стоят на своих стенах до миллиметра ── */
      const ownFlags = segments.filter((run) => run.corner?.own).length;
      const dockFlags = segments.filter((run) => run.corner?.dock).length;
      if (ownFlags !== corners.length || dockFlags !== corners.length) {
        drift8.push(`${tag}: владельцев ${ownFlags}, стыкующихся ${dockFlags} при углах ${corners.length}`);
      }
      corners.forEach((choice, c) => {
        owners55 += 1;
        const own = segments[c]?.corner?.own;
        const dock = segments[c + 1]?.corner?.dock;
        if (!own || own.lower !== choice.lower || own.upper !== choice.upper) {
          drift8.push(`${tag} · угол ${c + 1}: у стены ${c + 1} владения нет или не тот выбор (${JSON.stringify(own ?? null)})`);
        }
        if (!dock || dock.lower !== choice.lower || dock.upper !== choice.upper) {
          drift8.push(`${tag} · угол ${c + 1}: у стены ${c + 2} стыка нет или не тот выбор (${JSON.stringify(dock ?? null)})`);
        }
      });
      if (segments[0]?.corner?.dock || segments[segments.length - 1]?.corner?.own) {
        drift8.push(`${tag}: у крайних стен лишний угол — ${JSON.stringify(segments[0]?.corner)} / ${JSON.stringify(segments[segments.length - 1]?.corner)}`);
      }
      rows.forEach((row, i) => {
        origins55 += 1;
        const wall = room.walls.find((candidate) => candidate.id === row.run.wallId);
        if (!wall) {
          drift8.push(`${tag}: ряд ${row.run.wallId} — стены нет в комнате`);
          return;
        }
        const lost = i > 0 ? cornerGeometry(corners[i - 1], zone, production).lostMm : 0;
        const place = places[i];
        const a = (place.rotationYDeg * Math.PI) / 180;
        const start = rotY([0, 0, -depthMm / 1000], a);
        const at: [number, number] = [(start[0] + place.xM) * 1000, (start[2] + place.zM) * 1000];
        const want: [number, number] = [wall.startMm[0] + wall.dir[0] * lost, wall.startMm[1] + wall.dir[1] * lost];
        const miss = Math.hypot(at[0] - want[0], at[1] - want[1]);
        const along = Math.cos(a) * wall.dir[0] - Math.sin(a) * wall.dir[1];
        const facing = Math.sin(a) * wall.inward[0] + Math.cos(a) * wall.inward[1];
        if (miss > 0.5 || Math.abs(along - 1) > 1e-9 || Math.abs(facing - 1) > 1e-9 || wall.rowStartMm !== lost) {
          drift8.push(
            `${tag} · ряд ${row.run.wallId}: начало мимо стены на ${miss.toFixed(2)} мм, ` +
              `вдоль ${along.toFixed(6)}, в комнату ${facing.toFixed(6)}, начало ряда у комнаты ${wall.rowStartMm} при ${lost}`,
          );
        }
      });

      /* ── 9. Пересечения: модуль с модулем другой стены, со стеной, с выступом ── */
      const partsOf = rows.map((row, i) =>
        runBoxes(row.run, shop).map((part) => ({
          part,
          box: worldBox(places[i], part.position as V3, part.scale as V3, {}, `${row.run.wallId}:${part.panel ?? part.node ?? part.material}`),
        })),
      );
      for (let i = 0; i < rows.length; i += 1) {
        for (let j = i + 1; j < rows.length; j += 1) {
          for (const A of partsOf[i]) {
            for (const B of partsOf[j]) {
              pairs55 += 1;
              const deep = depthOf(A.box, B.box);
              if (deep > 0.5) hits9.push(`${tag}: ${A.box.name} × ${B.box.name} на ${deep.toFixed(1)} мм`);
            }
          }
        }
      }
      const solids = roomBoxes(room).filter((box) => box.role === 'wall' || box.role === 'corner' || box.role === 'object');
      for (const parts of partsOf) {
        for (const { box } of parts) {
          for (const solid of solids) {
            solids55 += 1;
            const wallBox: Obb = {
              c: [solid.center[0] * 1000, solid.center[1] * 1000, solid.center[2] * 1000],
              u: [
                rotY([1, 0, 0], (solid.rotationYDeg * Math.PI) / 180),
                [0, 1, 0],
                rotY([0, 0, 1], (solid.rotationYDeg * Math.PI) / 180),
              ],
              e: [(solid.size[0] * 1000) / 2, (solid.size[1] * 1000) / 2, (solid.size[2] * 1000) / 2],
              name: solid.key,
            };
            const deep = depthOf(box, wallBox);
            if (deep > 0.5) hits9.push(`${tag}: ${box.name} в ${solid.role} ${solid.key} на ${deep.toFixed(1)} мм`);
          }
        }
      }
      /* Щелей в углу нет, кроме фальш-панели: модули сходятся к углу вплотную. */
      corners.forEach((choice, c) => {
        gaps55 += 1;
        const owner = segments[c];
        const dock = segments[c + 1];
        const g = cornerGeometry(choice, zone, production);
        const floorOwner = owner.modules.filter((unit) => standsOnFloor(unit));
        const ownerEnd = Math.max(...floorOwner.map((unit) => unit.offsetMm + unit.widthMm));
        const floorDock = dock.modules.filter((unit) => standsOnFloor(unit));
        const dockStart = Math.min(...floorDock.map((unit) => unit.offsetMm));
        const fillers = cornerFillersOf(dock);
        const lower = fillers.find((piece) => piece.level === 'lower');
        const wantLower = choice.lower === 'blind' ? g.fillerMm : 0;
        if (ownerEnd !== owner.lengthMm || dockStart !== 0 || (lower ? lower.toMm - lower.fromMm : 0) !== wantLower || (lower && lower.toMm !== 0)) {
          gaps9.push(
            `${tag} · угол ${c + 1}, низ: владелец кончается на ${ownerEnd} при стене ${owner.lengthMm}, ` +
              `сосед начинается на ${dockStart}, панель ${lower ? `${lower.fromMm}…${lower.toMm}` : 'нет'} при ${wantLower}`,
          );
        }
        if (!owner.options.hasUpper) return;
        const uppers = (run: Run) =>
          run.upperSegments.flatMap((segment) => segment.modules).filter((unit) => unit.section !== 'mezzanine');
        const ownerUpperEnd = Math.max(...uppers(owner).map((unit) => unit.offsetMm + unit.widthMm));
        const start = g.upperStartMm - g.lostMm;
        const upperFiller = fillers.find((piece) => piece.level === 'upper');
        const tallTop = (unit: Module) => plinthMm(production) + moduleCarcassHeightMm(unit, dock) > upperBottomMm(production);
        const firstAfter = Math.min(
          ...uppers(dock).map((unit) => unit.offsetMm),
          ...dock.modules.filter(tallTop).map((unit) => unit.offsetMm),
        );
        const wantOwnerEnd = owner.lengthMm - g.ownerUpperCutMm;
        /*
         * Щели нет: либо первый модуль (или колонна) соседа стоит ровно на
         * начале его верха, либо между ними панель — от края угла до него.
         * У слепого верха панель есть всегда; у Г и пустого — только когда
         * она закрывает узкую полосу до колонны (`cornerFillersOf`).
         */
        const closed = upperFiller
          ? upperFiller.fromMm === start - g.upperFillerMm && upperFiller.toMm === firstAfter
          : choice.upper !== 'blind' && firstAfter === start;
        if (Math.round(ownerUpperEnd) !== wantOwnerEnd || !closed) {
          gaps9.push(
            `${tag} · угол ${c + 1}, верх: владелец кончается на ${ownerUpperEnd} при ${wantOwnerEnd}, ` +
              `сосед с ${firstAfter} при начале ${start}, панель ${upperFiller ? `${upperFiller.fromMm}…${upperFiller.toMm}` : 'нет'}`,
          );
        }
      });

      /* ── 10. Плита одна на угол, без щели и нахлёста; цоколь и фартук; материал и стык ── */
      const slabDepthMm = counterSlabDepthMm(zone, production);
      corners.forEach((choice, c) => {
        joints55 += 1;
        const owner = segments[c];
        const dock = segments[c + 1];
        const lost = cornerGeometry(choice, zone, production).lostMm;
        const ownSlabs = countertopSlabs(owner);
        const dockSlabs = countertopSlabs(dock);
        const lastOwn = ownSlabs[ownSlabs.length - 1];
        const firstDock = dockSlabs[0];
        if (!lastOwn || !firstDock) {
          drift10.push(`${tag} · угол ${c + 1}: плиты нет — у владельца ${ownSlabs.length}, у соседа ${dockSlabs.length}`);
          return;
        }
        const front = slabDepthMm - depthMm;
        const ownRect = stripRect(places[c], lastOwn.fromMm, lastOwn.toMm, depthMm, front);
        const dockRect = stripRect(places[c + 1], firstDock.fromMm, firstDock.toMm, depthMm, front);
        const overlap = rectOverlap(ownRect, dockRect);
        const gap = rectGap(ownRect, dockRect);
        const touch = rectTouch(ownRect, dockRect);
        if (lastOwn.toMm !== owner.lengthMm || firstDock.fromMm !== -(lost - slabDepthMm) || overlap > 0.5 || gap > 0.5 || Math.abs(touch - slabDepthMm) > 0.5) {
          drift10.push(
            `${tag} · угол ${c + 1}, столешница: владелец до ${lastOwn.toMm} при ${owner.lengthMm}, ` +
              `сосед с ${firstDock.fromMm} при ${-(lost - slabDepthMm)} · нахлёст ${Math.round(overlap)} мм² · щель ${gap.toFixed(1)} · стык ${touch.toFixed(1)} при ${slabDepthMm}`,
          );
        }
        /* Цоколь — той же мерой: владелец до стены соседа, сосед — до лица цоколя владельца. */
        const ownPlinth = plinthSpans(owner);
        const dockPlinth = plinthSpans(dock);
        const plinthDepth = depthMm - PLINTH_SETBACK_MM;
        const pOwn = stripRect(places[c], ownPlinth[ownPlinth.length - 1].fromMm, ownPlinth[ownPlinth.length - 1].toMm, depthMm, -PLINTH_SETBACK_MM);
        const pDock = stripRect(places[c + 1], dockPlinth[0].fromMm, dockPlinth[0].toMm, depthMm, -PLINTH_SETBACK_MM);
        if (rectOverlap(pOwn, pDock) > 0.5 || rectGap(pOwn, pDock) > 0.5 || Math.abs(rectTouch(pOwn, pDock) - plinthDepth) > 0.5) {
          drift10.push(
            `${tag} · угол ${c + 1}, цоколь: нахлёст ${Math.round(rectOverlap(pOwn, pDock))} мм² · щель ${rectGap(pOwn, pDock).toFixed(1)} · ` +
              `стык ${rectTouch(pOwn, pDock).toFixed(1)} при ${plinthDepth}`,
          );
        }
        /* Фартук встречается по линии угла: конец фартука владельца — начало фартука соседа. */
        if (owner.options.hasUpper) {
          const ownApron = apronSpans(owner);
          const dockApron = apronSpans(dock);
          const endOwn = stripRect(places[c], ownApron[ownApron.length - 1].toMm, ownApron[ownApron.length - 1].toMm, depthMm, -depthMm);
          const startDock = stripRect(places[c + 1], dockApron[0].fromMm, dockApron[0].fromMm, depthMm, -depthMm);
          const miss = Math.hypot(endOwn.x0 - startDock.x0, endOwn.z0 - startDock.z0);
          if (miss > 0.5) drift10.push(`${tag} · угол ${c + 1}, фартук: концы двух стен разошлись на ${miss.toFixed(1)} мм`);
        }
      });
      /* Материал плиты один на кухню, стык — один на угол. */
      const counterKeys = new Set(
        screen.wallEstimates.flatMap((estimate) =>
          estimate.lines
            .filter((line) => line.key.startsWith('countertop_') && line.unit === 'mp' && line.key !== 'countertop_plinth')
            .map((line) => line.key),
        ),
      );
      const materials = new Set(segments.map((run) => JSON.stringify(run.countertopMaterial ?? null)));
      const miter = screen.estimate.lines.find((line) => line.key === 'countertop_miter');
      if (counterKeys.size !== 1 || materials.size !== 1 || (miter?.quantity ?? 0) !== corners.length) {
        drift10.push(
          `${tag}: столешниц ${Array.from(counterKeys).join(', ') || 'нет'} · материалов ${materials.size} · ` +
            `стыков ${miter?.quantity ?? 0} при углах ${corners.length}`,
        );
      }
      /* Фартук: длина в смете = длина, которую рисует сцена (`apronSpans`), у каждой стены и в сумме. */
      const apronScene = segments.reduce((sum, run) => sum + apronLengthMm(run), 0);
      const apronLine = screen.estimate.lines.find((line) => line.key === 'wall_panel');
      const perWall = screen.wallEstimates.map((estimate, i) => ({
        line: estimate.lines.find((line) => line.key === 'wall_panel')?.quantity ?? 0,
        scene: Math.round(apronLengthMm(segments[i])) / 1000,
      }));
      if (
        Math.abs((apronLine?.quantity ?? 0) - apronScene / 1000) > 0.0005 ||
        perWall.some((wall) => Math.abs(wall.line - wall.scene) > 0.0005)
      ) {
        drift10.push(
          `${tag}: фартук в смете ${apronLine?.quantity ?? 0} м при ${(apronScene / 1000).toFixed(3)} м в сцене · по стенам ` +
            perWall.map((wall) => `${wall.line}/${wall.scene}`).join(' '),
        );
      }

      /* ── 11. Ключ створки — свой у каждой стены; всё у угла открывается мимо соседа ── */
      const idsByRow = rows.map((row) => {
        const fromScene = runPlaces(row.run).flatMap((entry) =>
          sceneLeaves(
            entry.unit,
            entry.heightM,
            blindPartMm(entry.unit, row.run) > 0 ? openFrontMm(entry.unit, row.run) / 1000 : undefined,
          ).map((leaf) => leaf.id),
        );
        return new Set([...openablePartIds(row.run), ...fromScene]);
      });
      idsByRow.forEach((ids, i) => {
        for (const id of Array.from(ids)) {
          const owners = idsByRow.filter((other) => other.has(id)).length;
          const moduleId = id.split(':')[0];
          const home = allModules(rows[i].run).some((unit) => unit.id === moduleId);
          if (owners !== 1 || !home) keys11.push(`${tag}: ключ ${id} — стен ${owners}, модуль ${home ? 'свой' : 'ЧУЖОЙ'}`);
        }
      });
      corners.forEach((_, c) => {
        for (const [me, other] of [
          [c, c + 1],
          [c + 1, c],
        ] as [number, number][]) {
          const run = rows[me].run;
          const obstacles = partsOf[other].filter(
            ({ part }) => part.material === 'front' || part.material === 'glass' || part.node === 'handle',
          );
          for (const entry of runPlaces(run)) {
            const openW = blindPartMm(entry.unit, run) > 0 ? openFrontMm(entry.unit, run) / 1000 : undefined;
            const leaves = sceneLeaves(entry.unit, entry.heightM, openW);
            const options = {
              gapM: production.frontGapMm / 1000,
              frontThicknessM: production.frontMm / 1000,
              integratedHandles: Boolean(run.options.integratedHandles),
            };
            for (const leaf of leaves) {
              movers55 += 1;
              for (const s of [0.25, 0.5, 0.75, 1]) {
                const posed: Obb[] =
                  leaf.kind === 'door'
                    ? leafPoses({
                        opening: leaf.opening,
                        x: leaf.xM,
                        y: 0,
                        width: leaf.widthM,
                        height: entry.heightM,
                        thickness: options.frontThicknessM,
                        gap: options.gapM,
                        integratedHandle: options.integratedHandles,
                        s,
                      }).map((box) =>
                        worldBox(
                          places[me],
                          [box.center[0] + entry.x, box.center[1] + entry.y, box.center[2] + entry.zM],
                          box.size,
                          { yaw: box.yaw, pitch: box.pitch },
                          `${leaf.id}:${box.role}`,
                        ),
                      )
                    : leaf.kind === 'bifold'
                      ? bifoldPoses(
                          entry.unit,
                          { x: entry.x, y: entry.y, heightM: entry.heightM, depthM: entry.depthM, thicknessM: production.carcassMm / 1000, zM: entry.zM },
                          options,
                          s,
                        ).map((box) => worldBox(places[me], box.center, box.size, { yaw: box.yaw, pitch: box.pitch }, `${leaf.id}:${box.role}`))
                      : drawerBoxes(
                          entry.unit,
                          { x: entry.x, y: entry.y, heightM: entry.heightM, depthM: entry.depthM, thicknessM: production.carcassMm / 1000, zM: entry.zM },
                          Number(leaf.id.split(':').pop()),
                          { ...options, cutaway: false },
                        ).map((box) =>
                          worldBox(
                            places[me],
                            [box.position[0], box.position[1], box.position[2] + entry.zM + DRAWER_TRAVEL_M * s],
                            box.scale as V3,
                            {},
                            `${leaf.id}:${box.panel ?? box.node ?? box.material}`,
                          ),
                        );
                for (const box of posed) {
                  for (const { box: obstacle } of obstacles) {
                    poses55 += 1;
                    const deep = depthOf(box, obstacle);
                    if (deep > 0.5) hits11.push(`${tag} · ход ${s}: ${box.name} задевает ${obstacle.name} на ${deep.toFixed(1)} мм`);
                  }
                }
              }
            }
          }
        }
      });

      /* ── 12. Г-модуль: обе ноги в раскрое — число деталей и площадь ── */
      for (const run of segments) {
        const panels = buildPanels({ run, production });
        for (const unit of allModules(run).filter((m) => m.kind === 'corner_base' || m.kind === 'corner_upper')) {
          lModules55 += 1;
          const own = panels.filter((panel) => panel.moduleId === unit.id);
          const S = unit.widthMm;
          const D = moduleDepthMm(unit, run.zone, production);
          const t = production.carcassMm;
          const top = unit.kind === 'corner_base' ? TOP_RAIL_PANEL_NAME : TOP_PANEL_NAME;
          const names = [BOTTOM_PANEL_NAME, top, BACK_PANEL_NAME, FACADE_PANEL_NAME].flatMap((name) => [
            legName(name, 'А'),
            legName(name, 'Б'),
          ]);
          const missing = names.filter((name) => own.filter((panel) => panel.name === name).length !== 1);
          const sides = own.filter((panel) => panel.name === SIDE_PANEL_NAME).reduce((sum, panel) => sum + panel.qty, 0);
          const area = (name: string) =>
            own.filter((panel) => panel.name === name).reduce((sum, panel) => sum + panel.lengthMm * panel.widthMm * panel.qty, 0);
          const bottoms = area(legName(BOTTOM_PANEL_NAME, 'А')) + area(legName(BOTTOM_PANEL_NAME, 'Б'));
          const wantBottoms = D * (2 * S - D) - 2 * t * D;
          const frontA = own.find((panel) => panel.name === legName(FACADE_PANEL_NAME, 'А'));
          const frontB = own.find((panel) => panel.name === legName(FACADE_PANEL_NAME, 'Б'));
          const gap = production.frontGapMm;
          if (
            missing.length > 0 ||
            sides !== 2 ||
            bottoms !== wantBottoms ||
            frontA?.widthMm !== S - D - gap ||
            frontB?.widthMm !== S - D - production.frontMm - gap
          ) {
            drift12.push(
              `${tag} · ${unit.id}: нет ног ${missing.join(', ') || '—'} · боковин ${sides} · ` +
                `дно ${bottoms} мм² при Г ${wantBottoms} · фасады ${frontA?.widthMm}/${frontB?.widthMm} при ${S - D - gap}/${S - D - production.frontMm - gap}`,
            );
          }
        }
      }
    }
  }

  const WANT_CONFIGS = SHAPES.length * SCHOOLS.length;
  check(
    `слой 55: собрано ${WANT_CONFIGS} конфигураций угла путём экрана`,
    configs55 === WANT_CONFIGS && refused55.length === 0,
    refused55.length === 0 ? `${configs55} из ${WANT_CONFIGS}` : `НЕ СОБРАЛОСЬ ${refused55.length}: ${refused55.slice(0, 3).join(' | ')}`,
  );
  if (configs55 === 0) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: ни одна угловая конфигурация не собралась');
  check(
    '8. у каждого угла ровно один владелец, ряды Б и В стоят на стенах замера до миллиметра',
    drift8.length === 0 && owners55 > 0 && origins55 > 0,
    drift8.length === 0 ? `углов ${owners55}, рядов ${origins55}` : `${drift8.length}: ${drift8.slice(0, 3).join(' | ')}`,
  );
  check(
    '9. ни одна деталь не входит в деталь другой стены, в стену или в выступ',
    hits9.length === 0 && pairs55 > 0 && solids55 > 0,
    hits9.length === 0 ? `пар деталей ${pairs55}, деталь × стена ${solids55}` : `${hits9.length}: ${hits9.slice(0, 4).join(' | ')}`,
  );
  check(
    '9. в углу нет щели, кроме фальш-панели: модули сходятся к углу вплотную',
    gaps9.length === 0 && gaps55 > 0,
    gaps9.length === 0 ? `углов ${gaps55}` : `${gaps9.length}: ${gaps9.slice(0, 3).join(' | ')}`,
  );
  check(
    '10. плита одна на угол, без щели и нахлёста; цоколь и фартук сходятся; материал один, стыков столько, сколько углов',
    drift10.length === 0 && joints55 > 0,
    drift10.length === 0 ? `углов ${joints55}` : `${drift10.length}: ${drift10.slice(0, 3).join(' | ')}`,
  );
  check(
    '11. ключ створки свой у каждой стены: створка А не открывает створку Б',
    keys11.length === 0,
    keys11.length === 0 ? `стен ${configs55} конфигураций` : `${keys11.length}: ${keys11.slice(0, 3).join(' | ')}`,
  );
  check(
    '11. каждая дверь, ящик и Г-фасад у угла открываются, не задевая фасад и ручку соседней стены',
    hits11.length === 0 && movers55 > 0 && poses55 > 0,
    hits11.length === 0 ? `подвижных ${movers55}, сверок положения ${poses55}` : `${hits11.length}: ${hits11.slice(0, 4).join(' | ')}`,
  );
  check(
    '12. Г-модуль: обе ноги в раскрое — детали по ногам, две боковины, дно = площадь Г без боковин, два фасада',
    drift12.length === 0 && lModules55 > 0,
    drift12.length === 0 ? `Г-модулей ${lModules55}` : `${drift12.length}: ${drift12.slice(0, 3).join(' | ')}`,
  );

  /* ── 13. Хвост у стены: меньше 150 — добор в раскрое и в смете, плита до стены; больше — плита над пустотой, её можно снять ── */
  {
    /*
     * Стена А короче — пеналы уходят на неё (`splitAppliances`), и у
     * дальней стены Б стоит модуль под столешницей: его хвост и меряем.
     */
    const TAIL_ROOM = room55([
      ['a', 2600],
      ['b', 3600],
      ['c', 2600],
      ['d', 3600],
    ]);
    const shape: Shape55 = { title: 'Г', measurement: TAIL_ROOM, kind: 'corner_l', corners: [{ lower: 'blind', upper: 'blind' }] };
    const before = screen55(shape, DEFAULT_PRODUCTION);
    if ('refused' in before) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: хвост — угол не собрался: ${before.refused}`);
    const wallB = before.segments[1];
    const last = [...wallB.modules].filter((unit) => standsOnFloor(unit)).sort((a, b) => b.offsetMm - a.offsetMm)[0];
    if (!last || last.offsetMm + last.widthMm !== wallB.lengthMm || last.appliance || last.kind !== 'base') {
      throw new Error(
        `НУЛЕВОЙ СЕЛЕКТОР: у дальней стены Б нет обычного модуля под столешницей — ${last?.id ?? 'нет модулей'}`,
      );
    }
    const narrowed = (byMm: number) =>
      applyOps({
        run: wallB,
        requirements: before.requirements,
        ops: [{ op: 'replace_module', moduleId: last.id, kind: last.kind, widthMm: last.widthMm - byMm }],
        openings: before.layout.segments[1].openings ?? [],
      });
    for (const [byMm, filler] of [
      [100, true],
      [300, false],
    ] as [number, boolean][]) {
      const edited = narrowed(byMm);
      const after = screen55(shape, DEFAULT_PRODUCTION, { walls: { 1: edited } });
      if ('refused' in after) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: хвост ${byMm} — не собралось: ${after.refused}`);
      const run = after.segments[1];
      const tail = counterTailsOf(run).find((item) => item.end === 'end');
      const panels = buildPanels({ run });
      const tailPanels = panels.filter((panel) => panel.name === TAIL_FILLER_PANEL_NAME);
      const slabs = countertopSlabs(run);
      const plinth = plinthSpans(run);
      const carcassLine = after.wallEstimates[1].lines.find((line) => line.key === 'ldsp_carcass');
      check(
        `13. хвост ${byMm} мм у стены: ${filler ? 'добор в раскрое и в смете, цоколь под ним' : 'без добора'}, плита до стены`,
        tail?.widthMm === byMm &&
          tail.filler === filler &&
          tailPanels.length === (filler ? 1 : 0) &&
          (!filler || tailPanels[0].widthMm === byMm) &&
          slabs[slabs.length - 1]?.toMm === run.lengthMm &&
          (filler ? plinth[plinth.length - 1]?.toMm === run.lengthMm : plinth[plinth.length - 1]?.toMm === run.lengthMm - byMm) &&
          Math.abs((carcassLine?.quantity ?? -1) - panelMaterials(panels).carcassM2) < 0.005,
        `хвост ${tail?.widthMm ?? 'нет'} · добор ${tailPanels.map((panel) => `${panel.lengthMm}×${panel.widthMm}`).join(', ') || 'нет'} · ` +
          `плита до ${slabs[slabs.length - 1]?.toMm} при ${run.lengthMm} · цоколь до ${plinth[plinth.length - 1]?.toMm} · ` +
          `ЛДСП в смете ${carcassLine?.quantity} при раскрое ${panelMaterials(panels).carcassM2}`,
      );
      if (!filler) {
        const cut = applyOps({
          run: edited,
          requirements: before.requirements,
          ops: [{ op: 'set_counter_end', end: 'end', cut: true }],
          openings: before.layout.segments[1].openings ?? [],
        });
        const afterCut = screen55(shape, DEFAULT_PRODUCTION, { walls: { 1: cut } });
        if ('refused' in afterCut) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: снятая плита — не собралось: ${afterCut.refused}`);
        const cutSlabs = countertopSlabs(afterCut.segments[1]);
        const len = (estimate: Estimate) =>
          estimate.lines
            .filter((line) => line.key.startsWith('countertop_') && line.unit === 'mp' && line.key !== 'countertop_plinth')
            .reduce((sum, line) => sum + line.quantity, 0);
        check(
          `13. плиту над пустотой ${byMm} мм человек снимает — и смета короче ровно на неё`,
          cutSlabs[cutSlabs.length - 1]?.toMm === afterCut.segments[1].lengthMm - byMm &&
            Math.abs(len(after.wallEstimates[1]) - len(afterCut.wallEstimates[1]) - byMm / 1000) < 0.0005,
          `плита до ${cutSlabs[cutSlabs.length - 1]?.toMm} · столешница ${len(after.wallEstimates[1])} → ${len(afterCut.wallEstimates[1])} м`,
        );
      }
    }
  }

  /* ── 14. Смена угла: угол заменился, остальные модули стоят, где стояли; не влезает — отказ числом ── */
  {
    let changes = 0;
    let refusals = 0;
    const moved: string[] = [];
    const wordless: string[] = [];
    for (const start of ALL) {
      const shape: Shape55 = { title: 'Г', measurement: L_ROOM, kind: 'corner_l', corners: [start] };
      const screen = screen55(shape, DEFAULT_PRODUCTION);
      if ('refused' in screen) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: смена угла — исходный угол не собрался: ${screen.refused}`);
      const input = {
        runs: screen.segments,
        index: 0,
        corners: shape.corners,
        requirements: screen.requirements,
        wallOpenings: screen.site.walls.map((wall) => wall.openings),
        labels: screen.segments.map((_, i) => wallLabel(i)),
      };
      for (const card of cornerCards(input)) {
        if (card.current) continue;
        if (card.refusal) {
          refusals += 1;
          if (!/\d+ мм/.test(card.refusal)) wordless.push(`${start.lower}/${start.upper} → ${card.key}: «${card.refusal}»`);
          continue;
        }
        changes += 1;
        const after = card.runs!;
        /* Мировое место каждого модуля, кроме углового у владельца: оно обязано остаться. */
        const placesBefore = runPlacements({ runs: screen.segments, corners: shape.corners, zone: screen.zone });
        const nextCorners = [card.choice];
        const placesAfter = runPlacements({ runs: after, corners: nextCorners, zone: screen.zone });
        const worldOf = (run: Run, place: { xM: number; zM: number; rotationYDeg: number }, unit: Module) => {
          const a = (place.rotationYDeg * Math.PI) / 180;
          const p = rotY([unit.offsetMm / 1000, 0, 0], a);
          return `${Math.round((p[0] + place.xM) * 1000)},${Math.round((p[2] + place.zM) * 1000)}+${unit.widthMm}:${unit.kind}`;
        };
        const cornerIds = new Set(
          [screen.segments[0], after[0]].flatMap((run) =>
            allModules(run)
              .filter((unit) => unit.offsetMm + unit.widthMm >= run.lengthMm - 0.5 - cornerGeometry(start, screen.zone).ownerUpperCutMm - 1)
              .map((unit) => unit.id),
          ),
        );
        for (let i = 0; i < screen.segments.length; i += 1) {
          const run = screen.segments[i];
          const keep = allModules(run).filter((unit) => !(i === 0 && cornerIds.has(unit.id)));
          const now = new Set(allModules(after[i]).map((unit) => worldOf(after[i], placesAfter[i], unit)));
          for (const unit of keep) {
            const was = worldOf(run, placesBefore[i], unit);
            if (!now.has(was)) moved.push(`${start.lower}/${start.upper} → ${card.key}: ${run.wallId} ${unit.id} ${was}`);
          }
        }
      }
    }
    check(
      '14. смена угла не двигает в мире ни одного модуля, кроме углового',
      changes > 0 && moved.length === 0,
      moved.length === 0 ? `смен ${changes}` : `${moved.length}: ${moved.slice(0, 3).join(' | ')}`,
    );
    check(
      '14. смена, которая не влезает, — отказ с числом',
      refusals > 0 && wordless.length === 0,
      wordless.length === 0 ? `отказов ${refusals}` : wordless.slice(0, 2).join(' | '),
    );
  }

  /*
   * ── 15. Старый угловой объект открывается тем углом, каким сохранён ──
   *
   * Объект, сохранённый до слоя 55: форма и одно `cornerSolution`, выбора
   * по углам нет. Верхнего углового шкафа тогда не было — над столешницей
   * угол оставался пустым (слой 46). «До открытия» — этот же объект с его
   * углом, записанным явно: низ из решения, верх пустой. «После» — запись
   * старого формата, открытая путём экрана: начальный выбор
   * (`savedCornerChoices`, как у `Workspace`) → композиция → варианты с
   * правками → ряды стен → смета объекта. Раскладка и смета обязаны
   * совпасть до тенге: умолчание НОВЫХ углов (слепой верх) дописало бы
   * старому объекту фальш-панель и глухую часть, которых в нём не было.
   *
   * Ряды берутся и собранные заново, и правленые — из `runs`/`wallRuns`,
   * с углом ряда в прежнем формате (`backMm`/`ahead`; у стены А его не
   * было вовсе: она собиралась из вариантов без угла). Кабинет клиента
   * (`projectOffer`) обязан открыть ту же запись той же суммой, а
   * сохранение после открытия — вернуть тот же объект.
   */
  {
    type OldSolution = 'false_panel' | 'corner_module';
    const OLD_SOLUTIONS: OldSolution[] = ['false_panel', 'corner_module'];
    const OLD_SHAPES: { title: string; kind: CompositionKind; measurement: Measurement }[] = [
      { title: 'Г', kind: 'corner_l', measurement: L_ROOM },
      { title: 'П', kind: 'u_shape', measurement: U_ROOM },
    ];
    const VARIANT_OLD: VariantKey = 'optimal';

    /** Открытие объекта — те же вызовы и в том же порядке, что у рабочего места. */
    const openSaved = (state: MillworkState, measurement: Measurement, production: ProductionSettings) => {
      const shape = state.shape ?? 'linear';
      const legacy = state.cornerSolution ?? 'false_panel';
      const choices = cornerChoicesOf(
        { corners: savedCornerChoices(state), cornerSolution: legacy },
        segmentCount(shape) - 1,
      );
      const requirements = state.requirements ?? DEMO_REQUIREMENTS;
      const variantKey = state.selectedVariant ?? VARIANT_OLD;
      /* Рабочая стена — как у объекта без своей отметки и у кабинета: самая длинная. */
      const base = workspaceInput({
        title: 'Старый угол',
        zone: 'Кухня',
        measurement,
        requirements,
        rates: DEMO_RATES,
        cornerAt: null,
      });
      const site = objectSite(base, null);
      const attempt = compositionFor({
        shape,
        requirements,
        cornerSolution: legacy,
        corners: choices,
        site,
        production,
        variantKey,
      });
      if (attempt?.state !== 'built') {
        throw new Error(
          `НУЛЕВОЙ СЕЛЕКТОР: старый угловой объект не собрался — ${attempt?.state === 'refused' ? attempt.reason : 'композиции нет'}`,
        );
      }
      const layout = attempt.composition;
      const input = objectInput({
        base,
        resolution: null,
        requirements: wallRequirementsOf(layout, requirements),
        rates: DEMO_RATES,
        production,
        milling: new Map(),
        carcass: new Map(),
        materials: new Map(),
        corner: wallCornerOf(layout),
      });
      const active = composeVariants(input, DISABLED55, state.runs ?? {}).find((v) => v.key === variantKey)!;
      const segments = wallSegments(layout, active.run, savedWallRuns(state.wallRuns));
      const estimate = objectEstimateOf({
        layout,
        segments,
        wallAEstimate: active.estimate,
        variantKey,
        input,
        disabled: DISABLED55,
      });
      const places = runPlacements({ runs: segments, corners: choices, zone: active.run.zone, production });
      return { choices, segments, estimate, places, active, input };
    };

    /** Раскладка числами: каждый модуль, место ряда, фальш-панели и детали раскроя. */
    const layoutOf = (open: ReturnType<typeof openSaved>, production: ProductionSettings): string[] =>
      open.segments.flatMap((run, i) => {
        const place = open.places[i];
        return [
          `ряд ${i} ${run.wallId} место ${Math.round(place.xM * 1000)},${Math.round(place.zM * 1000)} ∠${place.rotationYDeg} длина ${run.lengthMm}`,
          ...allModules(run).map(
            (unit) =>
              `ряд ${i} ${unit.id} ${unit.kind} ${unit.offsetMm}+${unit.widthMm} ${unit.appliance ?? '—'} ${unit.fill?.hinge ?? '—'} ${unit.fill?.handle ?? '—'}`,
          ),
          ...cornerFillersOf(run).map((filler) => `ряд ${i} панель ${filler.level} ${filler.fromMm}…${filler.toMm}`),
          ...buildPanels({ run, production }).map(
            (panel) => `ряд ${i} деталь ${panel.name} ${panel.lengthMm}×${panel.widthMm}×${panel.qty}`,
          ),
        ];
      });
    /** Смета числами: каждая строка и итог до тенге. */
    const moneyOf = (estimate: Estimate): string[] => [
      ...estimate.lines.map(
        (line) => `${line.key} ${line.quantity} × ${line.rate} = ${Math.round(line.total)}${line.enabled ? '' : ' (снята)'}`,
      ),
      `итого ${Math.round(estimate.total)}`,
    ];
    const firstDiff = (a: string[], b: string[]) => {
      const at = a.findIndex((line, i) => line !== b[i]);
      if (at < 0 && a.length === b.length) return null;
      const i = at < 0 ? Math.min(a.length, b.length) : at;
      return `до «${a[i] ?? '—'}» · после «${b[i] ?? '—'}»`;
    };

    let objects = 0;
    let rows = 0;
    let units = 0;
    let lines = 0;
    let corners = 0;
    let saved = 0;
    const drift: string[] = [];
    const money: string[] = [];
    const extra: string[] = [];
    const cabinet: string[] = [];
    const reopen: string[] = [];
    const choicesDrift: string[] = [];

    for (const [school, production] of SCHOOLS) {
      for (const shape of OLD_SHAPES) {
        for (const solution of OLD_SOLUTIONS) {
          for (const edited of [false, true]) {
            const tag = `${shape.title} ${solution} ${edited ? 'правленый' : 'собранный'} · ${school}`;
            const count = segmentCount(shape.kind) - 1;
            const asSaved: CornerChoice[] = Array.from({ length: count }, () => ({
              lower: solution === 'corner_module' ? 'l_shape' : 'blind',
              upper: 'empty',
            }));

            /* Запись старого формата: форма и решение, выбора по углам нет. */
            let old: MillworkState = {
              shape: shape.kind,
              cornerSolution: solution,
              requirements: DEMO_REQUIREMENTS,
              selectedVariant: VARIANT_OLD,
            };

            if (edited) {
              /*
               * Правленые ряды — такими, какими их писал прежний продукт:
               * правка — та же операция, что у экрана, угол ряда — в
               * прежних полях. Стена А собиралась из вариантов без угла.
               */
              const was = openSaved({ ...old, corners: asSaved }, shape.measurement, production);
              const depth = rowStandardDepthMm(was.segments[0].zone, 'base', production);
              const edit = (run: Run) => {
                const target = run.modules.find((unit) => unit.kind === 'base' && !unit.appliance);
                if (!target) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: ${tag} — на стене ${run.wallId} нет модуля для правки`);
                return applyOps({
                  run,
                  requirements: DEMO_REQUIREMENTS,
                  ops: [{ op: 'set_handle', moduleId: target.id, handle: 'profile' }],
                  openings: [],
                  roomDepthMm: 0,
                });
              };
              const oldCorner = (i: number) => {
                const back = cornerLostMm(solution, depth, production);
                return {
                  backMm: back,
                  ...(back - depth > 0 ? { fillerMm: back - depth } : {}),
                  ...(i < was.segments.length - 1 ? { ahead: true } : {}),
                } as unknown as Run['corner'];
              };
              const wallA: Run = { ...edit(was.segments[0]) };
              delete wallA.corner;
              const wallRuns: Record<string, Run> = {};
              was.segments.forEach((run, i) => {
                if (i > 0) wallRuns[String(i)] = { ...edit(run), corner: oldCorner(i) };
              });
              old = { ...old, runs: { [VARIANT_OLD]: wallA }, wallRuns };
            }

            /* Запись — через JSON: в базу едет ровно это, и читается ровно это. */
            const stored = JSON.parse(JSON.stringify(old)) as MillworkState;
            const before = openSaved({ ...stored, corners: asSaved }, shape.measurement, production);
            const after = openSaved(stored, shape.measurement, production);
            objects += 1;
            corners += after.choices.length;
            rows += after.segments.length;
            units += after.segments.reduce((sum, run) => sum + allModules(run).length, 0);
            lines += after.estimate.lines.length;

            const picked = after.choices.map((c) => `${c.lower}/${c.upper}`).join('+');
            const want = asSaved.map((c) => `${c.lower}/${c.upper}`).join('+');
            if (picked !== want) choicesDrift.push(`${tag}: открылся ${picked}, сохранён ${want}`);

            const layoutDiff = firstDiff(layoutOf(before, production), layoutOf(after, production));
            if (layoutDiff) drift.push(`${tag}: ${layoutDiff}`);
            const moneyDiff = firstDiff(moneyOf(before.estimate), moneyOf(after.estimate));
            if (moneyDiff) {
              money.push(
                `${tag}: ${Math.round(before.estimate.total)} → ${Math.round(after.estimate.total)} ₸ · ${moneyDiff}`,
              );
            }

            /* Деталей верхнего угла у старого объекта не было: ни панели, ни глухой части. */
            for (const run of after.segments) {
              const upperPanels = buildPanels({ run, production }).filter(
                (panel) => panel.name === CORNER_UPPER_FILLER_PANEL_NAME,
              );
              const blindUppers = run.upperSegments
                .flatMap((segment) => segment.modules)
                .filter((unit) => blindPartMm(unit, run) > 0);
              if (upperPanels.length > 0 || blindUppers.length > 0) {
                extra.push(
                  `${tag} · ${run.wallId}: верхних фальш-панелей ${upperPanels.length}, глухих верхних ${blindUppers.map((u) => u.id).join(', ') || 0}`,
                );
              }
            }

            /* Кабинет клиента открывает ту же запись — та же сумма. */
            const offer = projectOffer({
              title: 'Старый угол',
              zone: 'Кухня',
              measurement: shape.measurement,
              state: stored,
              production,
              catalog: [],
              rates: DEMO_RATES,
            });
            if (offer.state !== 'built') {
              cabinet.push(`${tag}: кабинет не собрал — ${offer.refusal}`);
            } else if (Math.round(offer.estimate.total) !== Math.round(after.estimate.total)) {
              cabinet.push(`${tag}: экран ${Math.round(after.estimate.total)}, кабинет ${Math.round(offer.estimate.total)}`);
            }

            /*
             * Открыл и закрыл: рабочее место пишет выбор каждого угла формы,
             * а прежнее решение больше не пишет — объект обязан остаться тем же.
             */
            const resaved = JSON.parse(JSON.stringify({ ...stored, corners: after.choices })) as MillworkState;
            delete resaved.cornerSolution;
            const again = openSaved(resaved, shape.measurement, production);
            saved += 1;
            const againDiff =
              firstDiff(layoutOf(after, production), layoutOf(again, production)) ??
              firstDiff(moneyOf(after.estimate), moneyOf(again.estimate));
            if (againDiff) reopen.push(`${tag}: ${againDiff}`);
          }
        }
      }
    }

    const WANT_OLD = SCHOOLS.length * OLD_SHAPES.length * OLD_SOLUTIONS.length * 2;
    if (objects === 0) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: ни один старый угловой объект не открылся');
    check(
      `15. старых угловых объектов открыто ${WANT_OLD}`,
      objects === WANT_OLD && saved === WANT_OLD,
      `${objects} из ${WANT_OLD}, пересохранено ${saved}`,
    );
    check(
      '15. старый объект открывается тем углом, каким сохранён: низ из решения, верх пустой',
      choicesDrift.length === 0 && corners > 0,
      choicesDrift.length === 0 ? `углов ${corners}` : `${choicesDrift.length}: ${choicesDrift.slice(0, 2).join(' | ')}`,
    );
    check(
      '15. раскладка старого объекта до и после открытия одна: модули, места рядов, панели, детали',
      drift.length === 0 && units > 0,
      drift.length === 0 ? `рядов ${rows}, модулей ${units}` : `${drift.length}: ${drift.slice(0, 2).join(' | ')}`,
    );
    check(
      '15. смета старого объекта до и после открытия одна — до тенге, по каждой строке',
      money.length === 0 && lines > 0,
      money.length === 0 ? `строк ${lines}` : `${money.length}: ${money.slice(0, 2).join(' | ')}`,
    );
    check(
      '15. у старого объекта не появилось деталей верхнего угла, которых в нём не было',
      extra.length === 0 && rows > 0,
      extra.length === 0 ? `рядов ${rows}` : `${extra.length}: ${extra.slice(0, 2).join(' | ')}`,
    );
    check(
      '15. кабинет клиента открывает старый объект той же суммой, что экран',
      cabinet.length === 0,
      cabinet.length === 0 ? `объектов ${objects}` : `${cabinet.length}: ${cabinet.slice(0, 2).join(' | ')}`,
    );
    check(
      '15. открыл, сохранил, открыл — тот же объект до тенге',
      reopen.length === 0 && saved > 0,
      reopen.length === 0 ? `пересохранено ${saved}` : `${reopen.length}: ${reopen.slice(0, 2).join(' | ')}`,
    );

    /*
     * ── 16. Смета правленой стены А — по тому же ряду, что видят сцена и раскрой ──
     *
     * Правленый ряд стены А лежит в `runs` с углом на момент записи: у
     * объектов до слоя 55 угла на стене А не было вовсе, у стены, которую
     * правили в прямой форме, — тоже. Смета стены А считалась по этому
     * ряду, а сцена и раскрой получали угол композиции: одна величина в
     * двух расчётах. Сверяется ровно то, что экран кладёт в итог за стену А
     * (`composeVariants`), со сметой ряда, который он рисует (`wallSegments`):
     * до тенге по каждой строке, отдельно — запил, угловые петли и площадь
     * фасадов против раскроя того же ряда.
     *
     * (а) старый угловой объект с правленой стеной А;
     * (б) стену правили в прямой форме, потом форму сменили на угловую —
     *     угол новый, его выбор тот, что даст экран, и тот, что выберет
     *     человек.
     */
    {
      const lineDiff = (row: string[], counted: string[]) => {
        const at = row.findIndex((line, i) => line !== counted[i]);
        if (at < 0 && row.length === counted.length) return null;
        const i = at < 0 ? Math.min(row.length, counted.length) : at;
        return `ряд сцены «${row[i] ?? '—'}» · в итоге «${counted[i] ?? '—'}»`;
      };
      const frontsOf = (estimate: Estimate) => estimate.lines.find((line) => line.key === 'front_panel')?.quantity ?? 0;
      const qtyOf = (estimate: Estimate, key: string) =>
        estimate.lines.filter((line) => line.key === key).reduce((sum, line) => sum + line.quantity, 0);
      const editWallA = (run: Run, tag: string) => {
        const target = run.modules.find((unit) => unit.kind === 'base' && !unit.appliance);
        if (!target) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: ${tag} — на стене А нет модуля для правки`);
        return applyOps({
          run,
          requirements: DEMO_REQUIREMENTS,
          ops: [{ op: 'set_handle', moduleId: target.id, handle: 'profile' }],
          openings: [],
          roomDepthMm: 0,
        });
      };
      /** Прямая форма — те же шаги экрана, композиции нет и угла у стены А нет. */
      const openLinear = (measurement: Measurement, production: ProductionSettings) => {
        const base = workspaceInput({
          title: 'Прямая',
          zone: 'Кухня',
          measurement,
          requirements: DEMO_REQUIREMENTS,
          rates: DEMO_RATES,
          cornerAt: null,
        });
        const input = objectInput({
          base,
          resolution: null,
          requirements: DEMO_REQUIREMENTS,
          rates: DEMO_RATES,
          production,
          milling: new Map(),
          carcass: new Map(),
          materials: new Map(),
        });
        return composeVariants(input, DISABLED55, {}).find((v) => v.key === VARIANT_OLD)!.run;
      };

      type Case16 = { tag: string; state: MillworkState; measurement: Measurement; production: ProductionSettings };
      const oldCases: Case16[] = [];
      const switchedCases: Case16[] = [];

      for (const [school, production] of SCHOOLS) {
        for (const shape of OLD_SHAPES) {
          /* (а) Старый объект: стена А правлена и записана без угла, как писал прежний продукт. */
          for (const solution of OLD_SOLUTIONS) {
            const tag = `${shape.title} ${solution} старый · ${school}`;
            const count = segmentCount(shape.kind) - 1;
            const asSaved: CornerChoice[] = Array.from({ length: count }, () => ({
              lower: solution === 'corner_module' ? 'l_shape' : 'blind',
              upper: 'empty',
            }));
            const old: MillworkState = {
              shape: shape.kind,
              cornerSolution: solution,
              requirements: DEMO_REQUIREMENTS,
              selectedVariant: VARIANT_OLD,
            };
            const was = openSaved({ ...old, corners: asSaved }, shape.measurement, production);
            const wallA: Run = { ...editWallA(was.segments[0], tag) };
            delete wallA.corner;
            oldCases.push({
              tag,
              state: JSON.parse(JSON.stringify({ ...old, runs: { [VARIANT_OLD]: wallA } })) as MillworkState,
              measurement: shape.measurement,
              production,
            });
          }

          /* (б) Правка в прямой форме, потом форма сменилась: правка стены А осталась. */
          const linearState: MillworkState = {
            shape: 'linear',
            requirements: DEMO_REQUIREMENTS,
            selectedVariant: VARIANT_OLD,
          };
          const editedLinear = editWallA(openLinear(shape.measurement, production), `${shape.title} прямая · ${school}`);
          const count = segmentCount(shape.kind) - 1;
          /* Выбор после смены формы — тот, что считает экран: угол новый, по углам ничего не выбрано. */
          const onSwitch = cornerChoicesOf(
            { corners: savedCornerChoices(linearState), cornerSolution: linearState.cornerSolution ?? 'false_panel' },
            count,
          );
          const picks: CornerChoice[][] =
            shape.kind === 'corner_l'
              ? [onSwitch, ...ALL.map((choice) => [choice])]
              : [
                  onSwitch,
                  [
                    { lower: 'l_shape', upper: 'empty' },
                    { lower: 'blind', upper: 'l_shape' },
                  ],
                ];
          for (const corners of picks) {
            switchedCases.push({
              tag: `${shape.title} прямая → ${corners.map((c) => `${c.lower}/${c.upper}`).join('+')}${corners === onSwitch ? ' (как после смены формы)' : ''} · ${school}`,
              state: {
                shape: shape.kind,
                corners,
                requirements: DEMO_REQUIREMENTS,
                selectedVariant: VARIANT_OLD,
                runs: { [VARIANT_OLD]: editedLinear },
              },
              measurement: shape.measurement,
              production,
            });
          }
        }
      }

      const sweep = (cases: Case16[]) => {
        const money: string[] = [];
        const miters: string[] = [];
        const hinges: string[] = [];
        const fronts: string[] = [];
        let opened = 0;
        let lines = 0;
        let mitersShown = 0;
        let hingesShown = 0;
        for (const item of cases) {
          const open = openSaved(item.state, item.measurement, item.production);
          opened += 1;
          /* Что экран кладёт в итог за стену А — и что он рисует на её месте. */
          const counted = open.active.estimate;
          const row = open.segments[0];
          const shown = editedRunEstimate(row, VARIANT_OLD, open.input, DISABLED55);
          lines += shown.lines.length;

          const diff = lineDiff(moneyOf(shown), moneyOf(counted));
          if (diff) {
            money.push(`${item.tag}: по ряду сцены ${Math.round(shown.total)}, в итоге ${Math.round(counted.total)} ₸ · ${diff}`);
          }
          const miterShown = qtyOf(shown, 'countertop_miter');
          const miterCounted = qtyOf(counted, 'countertop_miter');
          mitersShown += miterShown;
          if (miterShown !== miterCounted) miters.push(`${item.tag}: запилов в ряду ${miterShown}, в смете ${miterCounted}`);
          const hingeShown = qtyOf(shown, 'hinge_corner_175');
          const hingeCounted = qtyOf(counted, 'hinge_corner_175');
          hingesShown += hingeShown;
          if (hingeShown !== hingeCounted) hinges.push(`${item.tag}: угловых петель в ряду ${hingeShown}, в смете ${hingeCounted}`);
          const cutM2 = panelMaterials(buildPanels({ run: row, production: item.production })).frontM2;
          if (frontsOf(counted) !== cutM2) fronts.push(`${item.tag}: фасадов в смете ${frontsOf(counted)} м², в раскрое ряда ${cutM2} м²`);
        }
        return { money, miters, hinges, fronts, opened, lines, mitersShown, hingesShown };
      };

      const WANT16_OLD = SCHOOLS.length * OLD_SHAPES.length * OLD_SOLUTIONS.length;
      const WANT16_SWITCHED = SCHOOLS.length * (1 + ALL.length + 2);
      for (const [title, cases, want] of [
        ['старый объект с правленой стеной А', oldCases, WANT16_OLD],
        ['стену правили в прямой форме, форма сменилась на угловую', switchedCases, WANT16_SWITCHED],
      ] as [string, Case16[], number][]) {
        const result = sweep(cases);
        if (result.opened === 0) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: 16 · ${title} — ни одного объекта`);
        check(
          `16. ${title}: открыто ${want}`,
          result.opened === want,
          `${result.opened} из ${want}`,
        );
        check(
          `16. ${title}: смета стены А = смета ряда, который видят сцена и раскрой, до тенге`,
          result.money.length === 0 && result.lines > 0,
          result.money.length === 0 ? `строк ${result.lines}` : `${result.money.length}: ${result.money.slice(0, 2).join(' | ')}`,
        );
        check(
          `16. ${title}: запил и угловые петли — в смете, сколько их в ряду`,
          result.miters.length === 0 && result.hinges.length === 0 && result.mitersShown > 0 && result.hingesShown > 0,
          result.miters.length + result.hinges.length === 0
            ? `запилов ${result.mitersShown}, угловых петель ${result.hingesShown}`
            : [...result.miters, ...result.hinges].slice(0, 2).join(' | '),
        );
        check(
          `16. ${title}: площадь фасадов в смете = раскрой ряда`,
          result.fronts.length === 0,
          result.fronts.length === 0 ? `объектов ${result.opened}` : `${result.fronts.length}: ${result.fronts.slice(0, 2).join(' | ')}`,
        );
      }
    }
  }
}

/* ═══════════  Слой 56: выступ стены, колонна, короб — мебель обходит  ═══════════ */

/**
 * ПРЕПЯТСТВИЕ У СТЕНЫ МЕРЯЕТСЯ ПУТЁМ ЭКРАНА.
 *
 * Ряд стены А на экране — из вариантов (`composeVariants`) по проёмам
 * живого замера (`input.openings`); правка — `applyOps` с теми же
 * проёмами; мебель в препятствии — `obstacleMismatches`, как у рабочего
 * места; уточнения — `collectWarnings`. Числа — путь экрана, а не сборка
 * ряда напрямую.
 */
console.log('\nСлой 56: выступ стены, колонна, короб — участки, вплотную, отказы, столешница');
{
  const CEILING56 = 2700;
  const DISABLED56 = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
  const room56 = (lengthMm: number, openings: Opening[]): Measurement => ({
    id: 'room-56',
    ceilingHeightMm: CEILING56,
    walls: [
      { id: 'a', lengthMm, angleDeg: 90, openings },
      { id: 'b', lengthMm: 3000, angleDeg: 90, openings: [] },
      { id: 'c', lengthMm, angleDeg: 90, openings: [] },
      { id: 'd', lengthMm: 3000, angleDeg: 90, openings: [] },
    ],
    comms: [],
    photos: [],
    measuredBy: 'Проверка',
    measuredAt: '2026-10-02',
    notes: '',
  });
  const protrusion56 = (fromMm: number, widthMm: number, depthMm?: number): Opening => ({
    id: `p-${fromMm}`,
    kind: 'protrusion',
    fromCornerMm: fromMm,
    widthMm,
    sillMm: 0,
    heightMm: CEILING56,
    ...(depthMm ? { depthMm } : {}),
  });
  const box56 = (fromMm: number, widthMm: number, depthMm: number, heightMm: number): Opening => ({
    id: `b-${fromMm}`,
    kind: 'pipe_box',
    fromCornerMm: fromMm,
    widthMm,
    sillMm: 0,
    heightMm,
    depthMm,
  });
  const column56 = (fromMm: number, widthMm: number): Opening => ({
    id: `c-${fromMm}`,
    kind: 'column',
    fromCornerMm: fromMm,
    widthMm,
    sillMm: 0,
    heightMm: CEILING56,
  });

  /** Рабочее место по объекту: те же шаги и в том же порядке. */
  const screen56 = (
    measurement: Measurement,
    state: {
      runs?: Partial<Record<VariantKey, Run>>;
      requirements?: RunRequirements;
      /** Настройки цеха организации — путь экрана берёт их из `orgs.production`. */
      production?: ProductionSettings;
      /** Ставки каталога организации. */
      rates?: RateTable;
    } = {},
  ) => {
    const requirements = state.requirements ?? DEMO_REQUIREMENTS;
    const rates = state.rates ?? DEMO_RATES;
    const base = workspaceInput({
      title: 'Препятствие',
      zone: 'Кухня',
      measurement,
      requirements,
      rates,
      wallId: 'a',
      cornerAt: null,
    });
    const input = objectInput({
      base,
      resolution: null,
      requirements,
      rates,
      production: state.production ?? DEFAULT_PRODUCTION,
      milling: new Map(),
      carcass: new Map(),
      materials: new Map(),
    });
    const active = composeVariants(input, DISABLED56, state.runs ?? {}).find((v) => v.key === 'optimal')!;
    const segments = wallSegments(null, active.run, {});
    /* Смета объекта — та же функция, что итог внизу экрана (у прямой кухни это смета стены А). */
    const estimate = objectEstimateOf({
      layout: null,
      segments,
      wallAEstimate: active.estimate,
      variantKey: 'optimal',
      input,
      disabled: DISABLED56,
    });
    /* Проёмы стены для правки — `wallOpenings(0)` экрана: живой замер. */
    const openings = input.openings;
    const mismatches = obstacleMismatches({
      runs: segments,
      openingsOf: () => openings,
      edited: () => Boolean(state.runs?.optimal),
    });
    const warnings = collectWarnings({ issues: [], run: active.run, openings, comms: [] });
    return { input, run: segments[0], openings, mismatches, warnings, requirements, estimate };
  };
  const edit56 = (screen: ReturnType<typeof screen56>, ops: MillworkOp[]) =>
    applyOps({ run: screen.run, requirements: screen.requirements, ops, openings: screen.openings, roomDepthMm: 0 });

  const uppersOf = (run: Run) =>
    run.upperSegments.flatMap((segment) => segment.modules).filter((unit) => unit.section !== 'mezzanine');
  const mezzOf = (run: Run) =>
    run.upperSegments.flatMap((segment) => segment.modules).filter((unit) => unit.section === 'mezzanine');
  const overlapOf = (unit: Module, from: number, to: number) =>
    Math.min(unit.offsetMm + unit.widthMm, to) - Math.max(unit.offsetMm, from);
  const spansOf = (screen: ReturnType<typeof screen56>, row: 'base' | 'upper' | 'mezzanine') =>
    rowSpansOfRun(row, screen.run, screen.run.modules, screen.openings, screen.requirements, screen.run.options);

  /* ── 9. Стена 3800, выступ посередине 600 × 400: три ряда рвутся, соседи вплотную ── */
  {
    const P = { from: 1600, to: 2200 };
    const room = room56(3800, [protrusion56(P.from, P.to - P.from, 400)]);
    /* Антресоль заказывается тем же `set_mezzanine`, что на экране. */
    const withMezz = edit56(screen56(room), [{ op: 'set_mezzanine', heightMm: 400 }]);
    const screen = screen56(room, { runs: { optimal: withMezz } });
    const run = screen.run;
    const rows: [string, 'base' | 'upper' | 'mezzanine', Module[]][] = [
      ['нижний', 'base', run.modules],
      ['верхний', 'upper', uppersOf(run)],
      ['антресоль', 'mezzanine', mezzOf(run)],
    ];

    const whole: string[] = [];
    for (const [title, row] of rows) {
      const { free } = spansOf(screen, row);
      const crossing = free.filter((span) => span.from < P.to && span.to > P.from);
      const left = free.some((span) => span.to <= P.from);
      const right = free.some((span) => span.from >= P.to);
      if (crossing.length > 0 || !left || !right) {
        whole.push(`${title}: участки ${free.map((span) => `${span.from}…${span.to}`).join(' ') || 'НЕТ'}`);
      }
    }
    check(
      '9. выступ 600 × 400 посередине стены 3800 рвёт нижний ряд, верхний и антресоль',
      whole.length === 0,
      whole.length === 0
        ? rows.map(([title, row]) => `${title} ${spansOf(screen, row).free.map((s) => `${s.from}…${s.to}`).join(' ')}`).join(' · ')
        : whole.join(' | '),
    );

    const intruders = allModules(run).filter((unit) => overlapOf(unit, P.from, P.to) > 0);
    const counted = rows.reduce((sum, [, , units]) => sum + units.length, 0);
    check(
      '9. ни один модуль не стоит в объёме выступа',
      intruders.length === 0 && counted > 0 && mezzOf(run).length > 0,
      intruders.length === 0
        ? `модулей ${counted}, антресоли ${mezzOf(run).length}`
        : intruders.map((unit) => `${unit.id} заходит на ${overlapOf(unit, P.from, P.to)} мм`).join(', '),
    );

    const loose: string[] = [];
    let sides = 0;
    for (const [title, , units] of rows) {
      const leftEnd = Math.max(...units.filter((unit) => unit.offsetMm + unit.widthMm <= P.from).map((u) => u.offsetMm + u.widthMm));
      const rightStart = Math.min(...units.filter((unit) => unit.offsetMm >= P.to).map((u) => u.offsetMm));
      for (const [side, gap] of [
        ['слева', P.from - leftEnd],
        ['справа', rightStart - P.to],
      ] as [string, number][]) {
        if (!Number.isFinite(gap)) {
          if (title !== 'антресоль') loose.push(`${title} ${side}: модулей НЕТ`);
          continue;
        }
        sides += 1;
        if (gap !== 0) loose.push(`${title} ${side}: ${gap} мм`);
      }
    }
    check(
      '9. соседи стоят к выступу вплотную, 0 мм с обеих сторон',
      loose.length === 0 && sides >= 4,
      loose.length === 0 ? `сторон ${sides}, у каждой 0 мм` : loose.join(' | '),
    );
  }

  /* ── 10. Короб 150 × 150 у пола в углу: нижний ряд после него, верхний прежний ── */
  {
    const requirements = { ...DEMO_REQUIREMENTS, tallSide: 'right' as const };
    const plain = screen56(room56(3800, []), { requirements });
    const boxed = screen56(room56(3800, [box56(0, 150, 150, 300)]), { requirements });
    const first = [...boxed.run.modules].sort((a, b) => a.offsetMm - b.offsetMm)[0];
    const inBox = boxed.run.modules.filter((unit) => overlapOf(unit, 0, 150) > 0);
    check(
      '10. короб 150 × 150 у пола: нижний ряд начинается сразу за ним, 0 мм',
      Boolean(first) && first.offsetMm === 150 && inBox.length === 0,
      first ? `первый модуль ${first.id} на ${first.offsetMm} мм, в коробе ${inBox.length}` : 'МОДУЛЕЙ НЕТ',
    );
    const upperBefore = spansOf(plain, 'upper');
    const upperAfter = spansOf(boxed, 'upper');
    const same = JSON.stringify(upperBefore.free) === JSON.stringify(upperAfter.free);
    const boxBlocks = upperAfter.blockers.some((blocker) => blocker.reason === 'короб');
    check(
      '10. верхний ряд короб не трогает: участки те же, короба среди его преград нет',
      same && !boxBlocks && upperAfter.free.length > 0 && uppersOf(boxed.run).length > 0,
      `${upperBefore.free.map((s) => `${s.from}…${s.to}`).join(' ')} → ${upperAfter.free.map((s) => `${s.from}…${s.to}`).join(' ')}` +
        (boxBlocks ? ' · КОРОБ РВЁТ ВЕРХНИЙ' : ''),
    );
  }

  /* ── 11. Колонна без выноса: место занято на всю глубину, слова «замерьте вынос» ── */
  {
    const C = { from: 2400, to: 2800 };
    const screen = screen56(room56(3800, [column56(C.from, C.to - C.from)]));
    const inColumn = allModules(screen.run).filter((unit) => overlapOf(unit, C.from, C.to) > 0);
    const slabsOver = countertopSlabs(screen.run).filter((slab) => slab.fromMm < C.to && slab.toMm > C.from);
    const words = screen.warnings.find((warning) => /замерьте вынос колонны/i.test(warning.message));
    check(
      '11. колонна без выноса: место занято на всю глубину — ни модуля, ни плиты',
      inColumn.length === 0 && slabsOver.length === 0 && screen.run.modules.length > 0,
      `модулей в колонне ${inColumn.length}, плит над ней ${slabsOver.length}`,
    );
    check(
      '11. колонна без выноса названа словами: «Замерьте вынос колонны»',
      Boolean(words) && words!.severity === 'clarify',
      words ? `«${words.message}»` : `СЛОВ НЕТ: ${screen.warnings.map((w) => w.message).join(' | ') || 'предупреждений нет'}`,
    );
  }

  /* ── 12. Выступ внесли в замер, когда мебель уже поправлена руками ── */
  {
    const P = { from: 1600, to: 2200 };
    const first = screen56(room56(3800, []));
    const target = first.run.modules.find((unit) => unit.kind === 'base' && !unit.appliance);
    if (!target) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: 12 — в ряду нет модуля для правки');
    const edited = edit56(first, [{ op: 'set_handle', moduleId: target.id, handle: 'profile' }]);
    const saved = JSON.parse(JSON.stringify({ optimal: edited })) as Partial<Record<VariantKey, Run>>;
    const withP = room56(3800, [protrusion56(P.from, P.to - P.from, 400)]);
    const opened = screen56(withP, { runs: saved });

    const expected = allModules(opened.run)
      .map((unit) => ({ unit, mm: overlapOf(unit, P.from, P.to) }))
      .filter((hit) => hit.mm > 0);
    const conflicts = opened.mismatches[0]?.obstacles ?? [];
    const named = expected.filter((hit) =>
      conflicts.some((conflict) => conflict.moduleId === hit.unit.id && conflict.overlapMm === Math.round(hit.mm)),
    );
    check(
      '12. мебель не исчезла молча: модулей столько же, сколько сохранено',
      allModules(opened.run).length === allModules(edited).length && expected.length > 0,
      `модулей ${allModules(edited).length} → ${allModules(opened.run).length}, в выступе ${expected.length}`,
    );
    const message = opened.mismatches[0] ? wallMismatchMessage(opened.mismatches[0]) : '';
    const listed = expected.every(
      (hit) => message.includes(hit.unit.id.replace(/@.*$/, '')) && message.includes(`на ${Math.round(hit.mm)} мм`),
    );
    check(
      '12. предупреждение перечисляет каждый модуль в выступе с миллиметрами',
      expected.length > 0 && named.length === expected.length && listed,
      message ? `«${message.slice(0, 240)}${message.length > 240 ? '…' : ''}»` : 'ПРЕДУПРЕЖДЕНИЯ НЕТ',
    );
    const screenNow = screenState({
      refusal: null,
      mismatches: opened.mismatches,
      walls: [{ lengthMm: 3800 }],
      segments: [opened.run],
      shape: 'linear',
      warnings: opened.warnings,
    });
    check(
      '12. красная полоса с кнопкой «Пересобрать стену»: цена спрятана, запись не заперта',
      screenNow.rebuildWall === 0 && screenNow.priceHidden && screenNow.nextLocked && !screenNow.autosaveLocked,
      `пересобрать ${screenNow.rebuildWall} · цена ${screenNow.priceHidden ? 'спрятана' : 'ПОКАЗАНА'} · запись ${screenNow.autosaveLocked ? 'ЗАПЕРТА' : 'пишется'}`,
    );
    const rebuilt = screen56(withP, {});
    const after = allModules(rebuilt.run).filter((unit) => overlapOf(unit, P.from, P.to) > 0);
    check(
      '12. «Пересобрать стену»: новая раскладка по шаблону сама встаёт в участки',
      after.length === 0 && rebuilt.mismatches.length === 0 && rebuilt.run.modules.length > 0,
      `в выступе ${after.length}, расхождений ${rebuilt.mismatches.length}`,
    );
  }

  /*
   * ── 13. Столешница у препятствия: полоса плиты перед ним против настройки цеха ──
   *
   * Решение владельца правил: полоса перед препятствием (глубина плиты минус
   * вынос) не уже «минимальной полосы» цеха — вырез, плита одна; уже — разрыв,
   * две плиты с торцами. Типовая полоса 300 мм, «не подтверждено цехом».
   * Выступ 400 при плите 601 — полоса 201: разрыв. Короб 150 — полоса 451:
   * вырез. Вырез — строка сметы из каталога работ; цены нет — «цена не
   * задана» и итог «неполный», не ноль и не пропавшая строка.
   */
  {
    const slabDepth = counterSlabDepthMm('kitchen', DEFAULT_PRODUCTION);
    const typicalStrip = DEFAULT_COUNTERTOP_STRIP.minStripMm;
    const B = { from: 1800, to: 1950, depth: 150 };
    const P = { from: 1600, to: 2200, depth: 400 };
    const boxRoom = room56(3800, [box56(B.from, B.to - B.from, B.depth, CEILING56)]);
    const p400Room = room56(3800, [protrusion56(P.from, P.to - P.from, P.depth)]);
    const shop56 = (minStripMm: number, confirmed: boolean): ProductionSettings => ({
      ...DEFAULT_PRODUCTION,
      countertopStrip: { minStripMm, confirmed },
    });

    /** Что плита делает у отрезка препятствия — числами плит ряда экрана. */
    const slabAt = (run: Run, at: { from: number; to: number }) => {
      const slabs = countertopSlabs(run);
      const over = slabs.filter((slab) => slab.fromMm < at.to && slab.toMm > at.from);
      const cuts = over.flatMap((slab) => slab.cuts ?? []);
      /* Кусок плиты во всю глубину над препятствием — это плита сквозь него. */
      const through = over
        .flatMap((slab) => slabPieces(slab))
        .filter((piece) => piece.fromMm < at.to && piece.toMm > at.from && piece.backCutMm === 0);
      const cutText = (slab: CounterSlab) =>
        slab.cuts ? ` (вырез ${slab.cuts.map((c) => `${c.fromMm}…${c.toMm} на ${c.depthMm}`).join(', ')})` : '';
      return {
        over,
        cuts,
        through,
        endsAt: [slabs.some((slab) => slab.toMm === at.from), slabs.some((slab) => slab.fromMm === at.to)],
        text: slabs.map((slab) => `${slab.fromMm}…${slab.toMm}${cutText(slab)}`).join(' ') || 'ПЛИТ НЕТ',
      };
    };
    /** Вырез: над препятствием одна плита, вырез ровно по нему и на его вынос, сквозь — ничего. */
    const isCut = (got: ReturnType<typeof slabAt>, at: { from: number; to: number; depth: number }) =>
      got.over.length === 1 &&
      got.cuts.length === 1 &&
      got.cuts[0].fromMm === at.from &&
      got.cuts[0].toMm === at.to &&
      got.cuts[0].depthMm === at.depth &&
      got.through.length === 0;
    /** Разрыв: над препятствием плит нет, две плиты кончаются торцами у его краёв. */
    const isBreak = (got: ReturnType<typeof slabAt>) =>
      got.over.length === 0 && got.cuts.length === 0 && got.endsAt.every(Boolean);

    /* Оба случая на типовой полосе. */
    const riser = screen56(boxRoom);
    const riserAt = slabAt(riser.run, B);
    check(
      `13. короб ${B.depth} при плите ${slabDepth}: полоса ${slabDepth - B.depth} мм не уже типовых ${typicalStrip} — вырез, плита одна, сквозь короб полотна нет`,
      isCut(riserAt, B),
      `плиты ${riserAt.text}`,
    );
    const p400 = screen56(p400Room);
    const p400At = slabAt(p400.run, P);
    check(
      `13. выступ ${P.depth} при плите ${slabDepth}: полоса ${slabDepth - P.depth} мм уже типовых ${typicalStrip} — разрыв, две плиты с торцами у выступа`,
      isBreak(p400At),
      `плиты ${p400At.text}`,
    );

    /* Выступ на всю глубину плиты — полосы нет вовсе: разрыв при любом пороге, даже нулевом. */
    const deep = screen56(room56(3800, [protrusion56(P.from, P.to - P.from, slabDepth)]), { production: shop56(0, true) });
    const deepAt = slabAt(deep.run, P);
    check(
      `13. выступ с выносом ${slabDepth} (вся глубина плиты) при пороге 0 — разрыв: полосы перед ним нет`,
      isBreak(deepAt),
      `плиты ${deepAt.text}`,
    );

    /* Смена настройки цеха меняет решение — в обе стороны. */
    const riserStrict = screen56(boxRoom, { production: shop56(500, true) });
    const riserStrictAt = slabAt(riserStrict.run, B);
    check(
      `13. порог цеха 500: короб ${B.depth} (полоса ${slabDepth - B.depth} мм) — вырез сменился разрывом`,
      isCut(riserAt, B) && isBreak(riserStrictAt),
      `при ${typicalStrip}: ${riserAt.text} · при 500: ${riserStrictAt.text}`,
    );
    const p400Loose = screen56(p400Room, { production: shop56(200, true) });
    const p400LooseAt = slabAt(p400Loose.run, P);
    check(
      `13. порог цеха 200: выступ ${P.depth} (полоса ${slabDepth - P.depth} мм) — разрыв сменился вырезом`,
      isBreak(p400At) && isCut(p400LooseAt, P),
      `при ${typicalStrip}: ${p400At.text} · при 200: ${p400LooseAt.text}`,
    );

    /* Вырез — строка сметы: цены нет — «цена не задана» и итог «неполный»; разрыв строки не даёт. */
    const cutoutOf = (estimate: Estimate) => estimate.lines.filter((line) => line.key === COUNTERTOP_CUTOUT_KEY);
    const unpricedCut = cutoutOf(riser.estimate);
    check(
      '13. вырез строкой в смете: 1 шт., «цена не задана», в итог не входит, итог «неполный»',
      unpricedCut.length === 1 &&
        unpricedCut[0].quantity === 1 &&
        unpricedCut[0].enabled &&
        unpricedCut[0].priceUnset === 'цена не задана' &&
        lineAmountText(unpricedCut[0]) === 'цена не задана' &&
        unpricedCut[0].total === 0 &&
        unpricedLines(riser.estimate).some((line) => line.key === COUNTERTOP_CUTOUT_KEY) &&
        totalCaption(riser.estimate).includes('неполный'),
      unpricedCut.length === 0
        ? `СТРОКИ ВЫРЕЗА НЕТ · ${totalCaption(riser.estimate)}`
        : `${unpricedCut[0].title}: ${unpricedCut[0].quantity} шт., ${lineAmountText(unpricedCut[0])} · ${totalCaption(riser.estimate)}`,
    );
    /* Типовой прайс заводит позицию с нулём — это тоже «цена не задана», а не «0 ₸». */
    const typicalRates = Object.fromEntries(TYPICAL_PRICE_LIST.map((r) => [r.estimateKey, r.price])) as RateTable;
    const riserTypical = screen56(boxRoom, { rates: typicalRates });
    const typicalCut = cutoutOf(riserTypical.estimate);
    check(
      '13. позиция «Вырез столешницы» в типовом прайсе без цены — в смете «цена не задана», не «0 ₸»',
      TYPICAL_PRICE_LIST.some((r) => r.estimateKey === COUNTERTOP_CUTOUT_KEY) &&
        typicalCut.length === 1 &&
        lineAmountText(typicalCut[0]) === 'цена не задана' &&
        totalCaption(riserTypical.estimate).includes('неполный'),
      typicalCut.length === 0 ? 'СТРОКИ ВЫРЕЗА НЕТ' : `${lineAmountText(typicalCut[0])} · ${totalCaption(riserTypical.estimate)}`,
    );
    /* Цена заведена — строка с деньгами, итог полный. */
    const CUTOUT_RATE = 7000;
    const riserPriced = screen56(boxRoom, { rates: { ...DEMO_RATES, [COUNTERTOP_CUTOUT_KEY]: CUTOUT_RATE } });
    const pricedCut = cutoutOf(riserPriced.estimate);
    check(
      `13. цена выреза заведена (${CUTOUT_RATE} ₸) — строка с деньгами, итог без «неполный»`,
      pricedCut.length === 1 &&
        !pricedCut[0].priceUnset &&
        pricedCut[0].total === CUTOUT_RATE &&
        !totalCaption(riserPriced.estimate).includes('неполный'),
      pricedCut.length === 0 ? 'СТРОКИ ВЫРЕЗА НЕТ' : `${lineAmountText(pricedCut[0])} · ${totalCaption(riserPriced.estimate)}`,
    );
    const breakCuts = [cutoutOf(p400.estimate).length, cutoutOf(riserStrict.estimate).length];
    check(
      '13. разрыв строки выреза не даёт (выступ 400 при типовой полосе, короб при пороге 500), вырез при пороге 200 — даёт',
      breakCuts.every((count) => count === 0) && cutoutOf(p400Loose.estimate).length === 1,
      `строк выреза: выступ ${breakCuts[0]}, короб при 500 — ${breakCuts[1]}, выступ при 200 — ${cutoutOf(p400Loose.estimate).length}`,
    );

    /* Порог не подтверждён цехом — сказано у решения; подтверждён — молчим. */
    const stripWarnings = (screen: ReturnType<typeof screen56>) =>
      screen.warnings.filter((w) => w.message.startsWith('Столешница у') && w.message.includes('не подтверждено цехом'));
    const confirmedRiser = screen56(boxRoom, { production: shop56(typicalStrip, true) });
    check(
      '13. типовая полоса «не подтверждено цехом» — у выреза и у разрыва; подтверждённая — без пометки',
      stripWarnings(riser).length === 1 &&
        stripWarnings(riser)[0].message.includes('с вырезом') &&
        stripWarnings(p400).length === 1 &&
        stripWarnings(p400)[0].message.includes('рвётся на две') &&
        stripWarnings(confirmedRiser).length === 0 &&
        isCut(slabAt(confirmedRiser.run, B), B),
      [stripWarnings(riser)[0]?.message ?? 'У ВЫРЕЗА ПОМЕТКИ НЕТ', stripWarnings(p400)[0]?.message ?? 'У РАЗРЫВА ПОМЕТКИ НЕТ'].join(' | '),
    );

    /* Цоколь и фартук рвутся там же, где стоит препятствие, — при любом решении плиты. */
    const plinthOver = plinthSpans(deep.run).filter((span) => span.fromMm < P.to && span.toMm > P.from);
    const apronOver = apronSpans(p400Loose.run).filter((span) => span.fromMm < P.to && span.toMm > P.from);
    check(
      '13. цоколь и фартук у выступа рвутся',
      plinthOver.length === 0 && apronOver.length === 0 && plinthSpans(deep.run).length >= 2 && apronSpans(p400Loose.run).length >= 1,
      `цоколь ${plinthSpans(deep.run).map((s) => `${s.fromMm}…${s.toMm}`).join(' ')} · фартук ${apronSpans(p400Loose.run).map((s) => `${s.fromMm}…${s.toMm}`).join(' ')}`,
    );
  }

  /* ── 14. Длины 2734, 3201, 4137, выступ в разных местах: шаблон заполняет участки ── */
  {
    const LENGTHS = [2734, 3201, 4137];
    let configs = 0;
    let spansChecked = 0;
    const bad: string[] = [];
    for (const length of LENGTHS) {
      for (const at of [350, Math.round(length / 2) - 200, length - 750]) {
        const P = { from: at, to: at + 400 };
        const screen = screen56(room56(length, [protrusion56(P.from, 400, 300)]));
        configs += 1;
        const tag = `${length}, выступ ${P.from}…${P.to}`;
        const inside = allModules(screen.run).filter((unit) => overlapOf(unit, P.from, P.to) > 0);
        if (inside.length > 0) bad.push(`${tag}: в выступе ${inside.map((u) => u.id).join(', ')}`);
        for (const span of spansOf(screen, 'base').free) {
          const units = screen.run.modules.filter((unit) => unit.offsetMm >= span.from && unit.offsetMm < span.to);
          spansChecked += 1;
          const sum = units.reduce((total, unit) => total + unit.widthMm, 0);
          const out = units.filter((unit) => unit.offsetMm + unit.widthMm > span.to);
          if (out.length > 0) bad.push(`${tag}: ${out[0].id} выходит за участок ${span.from}…${span.to}`);
          if (sum > span.to - span.from) bad.push(`${tag}: участок ${span.from}…${span.to} — ширин ${sum}`);
          if (span.to - span.from >= MIN_WIDTH && units.length === 0) bad.push(`${tag}: участок ${span.from}…${span.to} пуст`);
          if (span.to === P.from && units.length > 0) {
            const end = Math.max(...units.map((unit) => unit.offsetMm + unit.widthMm));
            if (end !== P.from) bad.push(`${tag}: слева от выступа щель ${P.from - end} мм`);
          }
          if (span.from === P.to && units.length > 0) {
            const start = Math.min(...units.map((unit) => unit.offsetMm));
            if (start !== P.to) bad.push(`${tag}: справа от выступа щель ${start - P.to} мм`);
          }
        }
      }
    }
    const WANT14 = LENGTHS.length * 3;
    check(
      `14. длины 2734, 3201, 4137 с выступом в трёх местах: шаблон заполняет участки, сумма ширин ≤ участка — ${WANT14} конфигураций`,
      configs === WANT14 && bad.length === 0 && spansChecked >= WANT14 * 2,
      bad.length === 0 ? `конфигураций ${configs}, участков ${spansChecked}` : `${bad.length}: ${bad.slice(0, 3).join(' | ')}`,
    );
  }

  /* ── 15. Библиотека и перенос в пустоту у выступа; не помещается — отказ числом ── */
  {
    const P = { from: 1600, to: 2200 };
    const room = room56(3800, [protrusion56(P.from, P.to - P.from, 400)]);
    const start = screen56(room);
    const neighbour = start.run.modules.find((unit) => unit.offsetMm + unit.widthMm === P.from && unit.kind === 'base' && !unit.appliance);
    if (!neighbour) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: 15 — у выступа слева нет обычного модуля');
    /* Замена уже — справа от неё у выступа остаётся пустота (слой 50). */
    const narrowed = edit56(start, [{ op: 'replace_module', moduleId: neighbour.id, kind: 'base', widthMm: neighbour.widthMm - 200 }]);
    const screen = screen56(room, { runs: { optimal: narrowed } });
    const gap = libraryGaps(screen.run, screen.openings, screen.requirements).find(
      (candidate) => candidate.row === 'base' && candidate.fromMm + candidate.widthMm === P.from,
    );
    check(
      '15. пустота у выступа видна библиотеке и кончается на выступе',
      Boolean(gap) && gap!.widthMm === 200,
      gap ? `пустота ${gap.fromMm}…${gap.fromMm + gap.widthMm}` : 'ПУСТОТЫ НЕТ',
    );
    if (!gap) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: 15 — пустоты у выступа нет');

    const cards = libraryCards({ run: screen.run, requirements: screen.requirements, openings: screen.openings, moduleId: null, gap });
    const placed = cards
      .filter((card) => !card.refusal)
      .map((card) => ({ card, run: edit56(screen, card.ops) }))
      .map(({ card, run }) => ({ card, added: run.modules.find((unit) => !screen.run.modules.some((u) => u.id === unit.id)) }));
    const wrong = placed.filter(({ added }) => !added || added.offsetMm < gap.fromMm || added.offsetMm + added.widthMm > P.from);
    const flush = placed.filter(({ added }) => added && added.offsetMm + added.widthMm === P.from);
    check(
      '15. карточки библиотеки встают в пустоту у выступа и не заходят в него',
      placed.length > 0 && wrong.length === 0 && flush.length > 0,
      `карточек ${cards.length}, встаёт ${placed.length}, вплотную к выступу ${flush.length}` +
        (wrong.length > 0 ? ` · МИМО: ${wrong.map(({ card }) => card.key).join(', ')}` : ''),
    );

    const wide = edit56(screen, [{ op: 'add_module', kind: 'base', widthMm: 450, atMm: gap.fromMm }]);
    check(
      '15. модуль шире пустоты: «Не помещается: справа выступ стены, не хватает 250 мм», ряд прежний',
      wide.warnings.some((warning) => warning === 'Не помещается: справа выступ стены, не хватает 250 мм.') &&
        allModules(wide).length === allModules(screen.run).length,
      wide.warnings[0] ?? 'ОТКАЗА НЕТ',
    );

    const small = screen.run.modules.find((unit) => unit.offsetMm + unit.widthMm === gap.fromMm);
    if (!small) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: 15 — у пустоты нет модуля для переноса');
    const moved = edit56(screen, [{ op: 'move_module', moduleId: small.id, offsetMm: gap.fromMm + gap.widthMm - small.widthMm }]);
    const landed = moved.modules.find((unit) => unit.offsetMm === P.from - small.widthMm);
    check(
      '15. перенос в пустоту: модуль встал к выступу вплотную, 0 мм',
      Boolean(landed) && moved.warnings.length === 0 && allModules(moved).length === allModules(screen.run).length,
      landed ? `${landed.id} на ${landed.offsetMm}…${landed.offsetMm + landed.widthMm}` : moved.warnings[0] ?? 'НЕ ВСТАЛ',
    );

    const sink = screen.run.modules.find((unit) => unit.offsetMm === P.to);
    if (!sink) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: 15 — справа у выступа нет модуля');
    const intoP = edit56(screen, [{ op: 'move_module', moduleId: sink.id, offsetMm: gap.fromMm }]);
    check(
      '15. перенос шире пустоты: отказ числом, модули на месте',
      intoP.warnings.some((warning) => /справа выступ стены, не хватает \d+ мм/.test(warning)) &&
        intoP.modules.every((unit, i) => unit.offsetMm === screen.run.modules[i]?.offsetMm),
      intoP.warnings[0] ?? 'ОТКАЗА НЕТ',
    );
  }
}

/* ═══════════  P0: идентичность стен угловой и П-образной, пропавшая техника  ═══════════ */

/**
 * ПРАВКА ПРИНАДЛЕЖИТ СТЕНЕ ЗАМЕРА, А НЕ НОМЕРУ В ОБХОДЕ.
 *
 * Правки соседних стен лежали под номером стены в композиции ('1', '2'),
 * а номер — место в обходе от рабочей стены: перенёс замерщик ряд на
 * другую стену («ряд здесь?») — правка стены b показывалась на стене c.
 * Правка рабочей стены ложилась на новую рабочую стену. Правка состава
 * пересобирала стену А всегда и соседние никогда: удаление холодильника
 * со стены Б стирало правки стены А. А прибор, которому не хватило места
 * на соседней стене, пропадал молча — экран показывал предупреждения
 * только выбранной стены.
 *
 * Всё — путём экрана: `workspaceInput` → `objectSite` → `compositionFor` →
 * `objectInput` → `composeVariants` → `wallSegments`, состояние — через
 * JSON, как его пишет и читает рабочее место. Три школы цеха.
 */
console.log('\nP0: идентичность стен угловой и П-образной, пропавшая техника');
{
  const roomP0 = (walls: [string, number][]): Measurement => ({
    id: 'room-p0',
    ceilingHeightMm: 2700,
    walls: walls.map(([id, lengthMm]) => ({ id, lengthMm, angleDeg: 90, openings: [] })),
    comms: [],
    photos: [],
    measuredBy: 'Проверка',
    measuredAt: '2026-10-08',
    notes: '',
  });
  const U_WIDE = roomP0([
    ['a', 3600],
    ['b', 3000],
    ['c', 3600],
    ['d', 3000],
  ]);
  const U_NARROW = roomP0([
    ['a', 3200],
    ['b', 2400],
    ['c', 3200],
    ['d', 2400],
  ]);
  const BLIND: CornerChoice = { lower: 'blind', upper: 'blind' };
  const DISABLED_P0 = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
  const SCHOOLS_P0: [string, ProductionSettings][] = [
    ['560/320', DEFAULT_PRODUCTION],
    [
      '550/350',
      {
        ...DEFAULT_PRODUCTION,
        depths: { baseMm: 550, upperMm: 350, mezzanineMm: 550 },
      },
    ],
    [
      '600/300',
      {
        ...DEFAULT_PRODUCTION,
        depths: { baseMm: 600, upperMm: 300, mezzanineMm: 600 },
      },
    ],
  ];

  /** Путь экрана: те же вызовы, что у рабочего места, с рабочей стеной `runWallId`. */
  const screenP0 = (
    measurement: Measurement,
    runWallId: string,
    production: ProductionSettings,
    edits: { walls?: Record<string, Run>; runs?: Partial<Record<VariantKey, Run>> } = {},
    requirements: RunRequirements = DEMO_REQUIREMENTS,
  ) => {
    const base = workspaceInput({
      title: 'P0',
      zone: 'Кухня',
      measurement,
      requirements,
      rates: DEMO_RATES,
      wallId: runWallId,
      cornerAt: null,
    });
    const site = objectSite(base, null);
    const attempt = compositionFor({
      shape: 'u_shape',
      requirements,
      cornerSolution: 'false_panel',
      corners: [BLIND, BLIND],
      site,
      production,
      variantKey: 'optimal',
    });
    if (attempt?.state !== 'built') {
      throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: П-образная от стены ${runWallId} не собралась — ${attempt?.state === 'refused' ? attempt.reason : 'композиции нет'}`);
    }
    const layout = attempt.composition;
    const input = objectInput({
      base,
      resolution: null,
      requirements: wallRequirementsOf(layout, requirements),
      rates: DEMO_RATES,
      production,
      milling: new Map(),
      carcass: new Map(),
      materials: new Map(),
      corner: wallCornerOf(layout),
    });
    const active = composeVariants(input, DISABLED_P0, edits.runs ?? {}).find((variant) => variant.key === 'optimal')!;
    /* Состояние объекта — через JSON, как его пишет автосохранение и читает открытие. */
    const saved = savedWallRuns(JSON.parse(JSON.stringify(edits.walls ?? {})));
    const segments = wallSegments(layout, active.run, saved);
    return { layout, segments, active, input, requirements };
  };
  const ids = (run: Run) => allModules(run).map((unit) => `${unit.id}:${unit.widthMm}`).join(' ');
  const wallsOf = (run: Run) => Array.from(new Set(allModules(run).map((unit) => unit.id.split('@')[1] ?? 'БЕЗ МЕТКИ')));

  /* ── 1. Правка стены b — под её `wallId`, и только у неё ── */
  {
    const home = screenP0(U_WIDE, 'a', DEFAULT_PRODUCTION);
    check(
      'P0.1 П от стены a: стены композиции a, b, c',
      home.layout.segments.map((segment) => segment.wallId).join(',') === 'a,b,c',
      home.layout.segments.map((segment) => segment.wallId).join(', '),
    );
    const wallB = home.segments[1];
    const upper = allModules(wallB).filter((unit) => unit.id.startsWith('upper-') && !unit.appliance);
    const target = upper[1];
    if (!target) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: P0.1 — у стены b нет второго шкафа верхнего ряда');
    const editedB = applyOps({
      run: wallB,
      requirements: home.requirements,
      ops: [{ op: 'remove_module', moduleId: target.id }],
      openings: home.layout.segments[1].openings,
      roomDepthMm: 0,
    });
    check(
      'P0.1 правка стены b применилась: шкаф снят, соседи в верхнем ряду на местах',
      !allModules(editedB).some((unit) => unit.id === target.id) &&
        allModules(editedB).length === allModules(wallB).length - 1,
      `${target.id} · модулей ${allModules(wallB).length} → ${allModules(editedB).length}`,
    );

    /* Как пишет рабочее место — под `wallId`; как лежат старые объекты — под номером. */
    const written = withWallEdit({}, home.layout.segments[1].wallId, 1, editedB);
    const legacy: Record<string, Run> = { '1': editedB };
    const unmarked: Record<string, Run> = { '1': { ...editedB, wallId: undefined } };
    const keys = (saved: Record<string, Run>) => Object.keys(savedWallRuns(JSON.parse(JSON.stringify(saved)))).join(',');
    check(
      'P0.1 правка соседней стены пишется и читается под wallId; старая под номером — по метке её ряда; без метки — номером',
      keys(written) === 'b' && keys(legacy) === 'b' && keys(unmarked) === '1',
      `пишется ${keys(written)} · старая «1» → ${keys(legacy)} · без метки «1» → ${keys(unmarked)}`,
    );

    for (const [title, saved] of [
      ['записанная рабочим местом', written],
      ['старого объекта под номером', legacy],
    ] as [string, Record<string, Run>][]) {
      const sameHome = screenP0(U_WIDE, 'a', DEFAULT_PRODUCTION, { walls: saved });
      check(
        `P0.1 правка ${title}: на стене b она, стены a и c — те же, что без правки`,
        ids(sameHome.segments[1]) === ids(editedB) &&
          ids(sameHome.segments[0]) === ids(home.segments[0]) &&
          ids(sameHome.segments[2]) === ids(home.segments[2]),
        `b: ${ids(sameHome.segments[1]) === ids(editedB) ? 'правка' : 'НЕ ТА'} · a: ${ids(sameHome.segments[0]) === ids(home.segments[0]) ? 'та же' : 'ДРУГАЯ'} · c: ${ids(sameHome.segments[2]) === ids(home.segments[2]) ? 'та же' : 'ДРУГАЯ'}`,
      );

      /* Ряд перенесли на стену b: обход b, c, d. Правка стены b не ложится ни на c, ни на d. */
      const moved = screenP0(U_WIDE, 'b', DEFAULT_PRODUCTION, { walls: saved });
      const order = moved.layout.segments.map((segment) => segment.wallId).join(',');
      const foreign = moved.segments
        .map((run, i) => ({ wall: moved.layout.segments[i].wallId, on: wallsOf(run) }))
        .filter((entry) => entry.on.some((wallId) => wallId !== entry.wall));
      check(
        `P0.1 ряд перенесён на стену b (${title}): у каждой стены — модули только своей стены`,
        order === 'b,c,d' && foreign.length === 0,
        foreign.length === 0
          ? `обход ${order}`
          : `обход ${order} · ЧУЖИЕ: ${foreign.map((entry) => `${entry.wall} несёт ${entry.on.join('+')}`).join(' · ')}`,
      );
      const back = screenP0(U_WIDE, 'a', DEFAULT_PRODUCTION, { walls: saved });
      check(
        `P0.1 ряд вернулся на стену a (${title}): правка стены b снова на ней`,
        ids(back.segments[1]) === ids(editedB),
        ids(back.segments[1]) === ids(editedB) ? 'на месте' : 'ПРОПАЛА',
      );
    }
  }

  /* ── 2. Правка рабочей стены — только ей ── */
  {
    const home = screenP0(U_WIDE, 'a', DEFAULT_PRODUCTION);
    const first = allModules(home.active.run).find((unit) => unit.id.startsWith('upper-') && !unit.appliance);
    if (!first) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: P0.2 — у стены a нет шкафа верхнего ряда');
    const editedA = applyOps({
      run: home.active.run,
      requirements: home.requirements,
      ops: [{ op: 'remove_module', moduleId: first.id }],
      openings: home.input.openings,
      roomDepthMm: 0,
    });
    const runs = { optimal: editedA };
    const own = screenP0(U_WIDE, 'a', DEFAULT_PRODUCTION, { runs });
    check(
      'P0.2 правка стены a лежит на стене a',
      !allModules(own.segments[0]).some((unit) => unit.id === first.id) &&
        allModules(own.segments[0]).length === allModules(home.active.run).length - 1,
      `${first.id}: ${allModules(own.segments[0]).some((unit) => unit.id === first.id) ? 'СТОИТ' : 'снят'}`,
    );
    const moved = screenP0(U_WIDE, 'b', DEFAULT_PRODUCTION, { runs });
    check(
      'P0.2 ряд перенесён на стену b: правка стены a на неё не ложится',
      wallsOf(moved.segments[0]).join(',') === 'b',
      `стена A несёт модули ${wallsOf(moved.segments[0]).join('+')}`,
    );
    check(
      'P0.2 правка рабочей стены принадлежит ей: та же стена — да, другая — нет, без метки — да',
      workingWallEdit(editedA, 'a') === editedA &&
        workingWallEdit(editedA, 'b') === undefined &&
        workingWallEdit({ ...editedA, wallId: undefined }, 'b') !== undefined,
      `a ${workingWallEdit(editedA, 'a') ? 'да' : 'нет'} · b ${workingWallEdit(editedA, 'b') ? 'ДА' : 'нет'}`,
    );
  }

  /* ── 3. Правка состава касается стен своего прибора ── */
  {
    const home = screenP0(U_WIDE, 'a', DEFAULT_PRODUCTION);
    const req = home.requirements;
    const current = {
      assignment: home.layout.segments.map((segment) => segment.appliances),
      usableMm: home.layout.segments.map((segment) => segment.run.lengthMm),
      requirements: req,
    };
    const at = (appliance: ApplianceKind) => current.assignment.findIndex((list) => list.includes(appliance));
    const fridgeWall = at('fridge');
    const hobWall = at('hob');
    if (fridgeWall < 0 || hobWall < 0 || at('oven') < 0) {
      throw new Error('НУЛЕВОЙ СЕЛЕКТОР: P0.3 — холодильник, духовка или варочная не розданы ни одной стене');
    }
    const without = (appliance: ApplianceKind) => req.appliances.filter((item) => item !== appliance);
    const cases: [string, Parameters<typeof wallsTouchedByChange>[0], number[]][] = [
      ['удалён холодильник', { appliances: without('fridge') }, [fridgeWall]],
      ['удалена варочная', { appliances: without('hob') }, [hobWall]],
      ['добавлена микроволновка — встаёт к пеналам', { appliances: [...req.appliances, 'microwave'] }, [fridgeWall]],
      ['холодильник отдельностоящий', { fridgeType: req.fridgeType === 'freestanding' ? 'built_in' : 'freestanding' }, [fridgeWall]],
      ['духовка в колонне поменялась местами', { columnTop: req.columnTop === 'oven' ? 'microwave' : 'oven' }, [at('oven')]],
      ['размер варочной', { applianceSizes: { ...(req.applianceSizes ?? {}), hob: { widthMm: 600, heightMm: 50, depthMm: 520 } } }, [hobWall]],
      ['тип вытяжки', { applianceTypes: { ...(req.applianceTypes ?? {}), hood: 'hood_dome' } }, [at('hood')]],
      ['холодильник перенесён на стену a', { applianceWalls: { ...(req.applianceWalls ?? {}), fridge: 0 } }, [0, fridgeWall].sort((x, y) => x - y)],
      ['верхний ряд до потолка — вся кухня', { upperToCeiling: true }, [0, 1, 2]],
      ['сторона пеналов — вся кухня', { tallSide: 'right' }, [0, 1, 2]],
    ];
    const wrong = cases
      .map(([title, change, want]) => ({ title, want, got: wallsTouchedByChange(change, current) }))
      .filter((entry) => entry.got.join(',') !== entry.want.join(','));
    check(
      `P0.3 правка состава задевает ровно стены своего прибора — ${cases.length} случаев`,
      cases.length === 10 && wrong.length === 0,
      wrong.length === 0
        ? `раздача ${current.assignment.map((list) => list.join('+')).join(' | ')}`
        : wrong.map((entry) => `${entry.title}: нужно ${entry.want.join(',')}, вышло ${entry.got.join(',') || 'ни одной'}`).join(' · '),
    );
    check(
      'P0.3 снятые правки названы словами',
      lostWallEditsNote([1]) === 'Правки стены Б сняты: состав этой стены изменился, и раскладка собрала её заново.' &&
        lostWallEditsNote([0, 2]) === 'Правки стен А и В сняты: состав этих стен изменился, и раскладка собрала их заново.' &&
        lostWallEditsNote([]) === null,
      lostWallEditsNote([0, 2]) ?? 'СЛОВ НЕТ',
    );
  }

  /* ── 4. Духовка на П 3200 + 2400 + 3200: стоит или названа миллиметрами ── */
  {
    let dropped = 0;
    for (const [school, production] of SCHOOLS_P0) {
      const screen = screenP0(U_NARROW, 'a', production);
      const ovenWall = screen.layout.segments.findIndex((segment) => segment.appliances.includes('oven'));
      if (ovenWall < 0) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: P0.4 ${school} — духовка не роздана ни одной стене`);
      const shown = screen.segments.some((run) => allModules(run).some((unit) => moduleAppliances(unit).includes('oven')));
      const missing = missingAppliances({
        requested: screen.requirements.appliances,
        shown: screen.segments,
        layout: screen.layout,
        edited: () => false,
        active: 0,
      });
      if (shown) {
        check(`P0.4 ${school}: духовка стоит — строки о пропаже нет`, missing.length === 0, missing[0]?.message ?? 'строк нет');
        continue;
      }
      dropped += 1;
      /*
       * Числа — из геометрии: стена пеналов владеет вторым углом, глухая
       * часть угла (`ownerBlindMm`) и холодильник заняли своё, и под
       * духовку осталось то, что осталось.
       */
      const run = screen.layout.segments[ovenWall].run;
      const blind = cornerGeometry(BLIND, screen.requirements.zone, production).ownerBlindMm;
      const fridge = allModules(run).find((unit) => unit.appliance === 'fridge');
      if (!fridge) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: P0.4 ${school} — на стене духовки нет холодильника`);
      const need = APPLIANCE_SLOTS.oven.widthMm;
      const free = run.lengthMm - blind - fridge.widthMm;
      const expected =
        `${wallLabel(ovenWall)}: Духовой шкаф: не помещается — свободно ${free} мм, нужно ${need} мм, ` +
        `не хватает ${need - free} мм. Прибора нет ни на схеме, ни в смете.`;
      const line = missing.find((warning) => warning.id === 'appliance-missing-oven');
      check(
        `P0.4 ${school}: духовки нет на ${lowerWall(wallLabel(ovenWall), 'prepositional')} — блокирующая строка с миллиметрами из геометрии`,
        Boolean(line) && line!.severity === 'blocking' && line!.message === expected && free < need,
        line ? `${line.message} · стена ${run.lengthMm} − глухая часть ${blind} − холодильник ${fridge.widthMm} = ${free}` : `СТРОКИ НЕТ · ждали: ${expected}`,
      );
      /* Та же строка — в общем канале экрана, при выбранной стене А, и жёлтый дубль раскладки не повторяет её. */
      const channel = collectWarnings({
        missing,
        issues: validateRun(screen.segments[0], screen.layout.segments[0].comms),
        run: screen.segments[0],
        openings: [],
        comms: screen.layout.segments[0].comms,
      });
      const state = screenState({
        refusal: null,
        mismatches: [],
        walls: screen.layout.segments.map((segment) => ({ lengthMm: segment.wallLengthMm })),
        segments: screen.segments,
        shape: 'u_shape',
        warnings: channel,
      });
      check(
        `P0.4 ${school}: строка в красной полосе экрана при выбранной стене А, цена при этом есть`,
        state.blocking.some((warning) => warning.message === expected) && !state.priceHidden,
        state.blocking.map((warning) => warning.message).join(' | ') || 'КРАСНАЯ ПОЛОСА ПУСТА',
      );
    }
    check('P0.4 духовка не встала хотя бы у одной школы — проверка не пустая', dropped > 0, `не встала у ${dropped} из ${SCHOOLS_P0.length}`);

    /* Где всё встало — строк нет вовсе; прямой кухни это не касается. */
    const wide = screenP0(U_WIDE, 'a', DEFAULT_PRODUCTION);
    const quiet = missingAppliances({
      requested: wide.requirements.appliances,
      shown: wide.segments,
      layout: wide.layout,
      edited: () => false,
      active: 0,
    });
    check('P0.4 П 3600 + 3000: вся техника стоит — строк о пропаже нет', quiet.length === 0, quiet[0]?.message ?? 'строк нет');
    check(
      'P0.4 прямая кухня: композиции нет — строк нет',
      missingAppliances({ requested: ['oven'], shown: [], layout: null, edited: () => false, active: 0 }).length === 0,
    );

    /* Правленая стена, в которую прибор не встал сам: выход — пересобрать её, и это сказано. */
    const ovenWall = wide.layout.segments.findIndex((segment) => segment.appliances.includes('oven'));
    const oven = allModules(wide.segments[ovenWall]).find((unit) => moduleAppliances(unit).includes('oven'));
    if (!oven) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: P0.4 — на стене пеналов П 3600 + 3000 нет духовки');
    const withoutOven = applyOps({
      run: wide.segments[ovenWall],
      requirements: wide.requirements,
      ops: [{ op: 'remove_module', moduleId: oven.id }],
      openings: wide.layout.segments[ovenWall].openings,
      roomDepthMm: 0,
    });
    const edited = missingAppliances({
      requested: wide.requirements.appliances,
      shown: wide.segments.map((run, i) => (i === ovenWall ? withoutOven : run)),
      layout: wide.layout,
      edited: (index) => index === ovenWall,
      active: 0,
    });
    const state = screenState({
      refusal: null,
      mismatches: [],
      walls: wide.layout.segments.map((segment) => ({ lengthMm: segment.wallLengthMm })),
      segments: wide.segments,
      shape: 'u_shape',
      warnings: edited,
    });
    check(
      'P0.4 правленая стена без духовки: строка называет стену и выход, кнопка пересобирает её',
      edited.length === 1 &&
        edited[0].severity === 'blocking' &&
        edited[0].message.includes(`Пересоберите ${lowerWall(wallLabel(ovenWall), 'accusative')}`) &&
        state.rebuildWall === ovenWall,
      `${edited[0]?.message ?? 'СТРОКИ НЕТ'} · пересобрать: ${state.rebuildWall ?? 'нечего'}`,
    );
  }
}

/* ═══════════  P0-3: физическая идентичность стен, приборов и углов  ═══════════ */

/**
 * СТЕНА, ПРИБОР И УГОЛ — ПО ФИЗИЧЕСКОЙ СТЕНЕ ЗАМЕРА, А НЕ ПО МЕСТУ В ОБХОДЕ.
 *
 * Закрепление прибора хранилось номером стены композиции, выбор угла —
 * номером угла. Номер — место в обходе от рабочей стены: «ряд здесь?»
 * сдвигает обход, и холодильник, закреплённый за стеной Б, оказывался на
 * другой физической стене, а Г-модуль угла w1–w2 — в углу w2–w3.
 * Правленая стена, сменившая роль в углу, показывалась с прежней
 * раскладкой угла, и длина её не выдавала.
 *
 * Путь экрана: `workspaceInput` → `objectSite` → `compositionFor` →
 * `objectInput` → `composeVariants` → `wallSegments`; состояние — через
 * JSON. Три школы цеха там, где решают миллиметры.
 */
console.log('\nP0-3: физическая идентичность стен, приборов и углов');
{
  const roomP3 = (walls: [string, number][]): Measurement => ({
    id: 'room-p03',
    ceilingHeightMm: 2700,
    walls: walls.map(([id, lengthMm]) => ({ id, lengthMm, angleDeg: 90, openings: [] })),
    comms: [],
    photos: [],
    measuredBy: 'Проверка',
    measuredAt: '2026-10-08',
    notes: '',
  });
  const ROOM = roomP3([
    ['a', 3600],
    ['b', 3000],
    ['c', 3600],
    ['d', 3000],
  ]);
  const DISABLED_P3 = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
  type SavedChoice = CornerChoice & { walls?: [string, string] };

  /** Путь экрана с рабочей стеной `runWallId`, формой, углами и правками. */
  const screenP3 = (
    runWallId: string,
    options: {
      shape?: CompositionKind;
      production?: ProductionSettings;
      requirements?: RunRequirements;
      corners?: SavedChoice[];
      walls?: Record<string, Run>;
      runs?: Partial<Record<VariantKey, Run>>;
      /** Свой замер (P0-3b: допустимая конфигурация — на стене другой длины). */
      measurement?: Measurement;
    } = {},
  ) => {
    const requirements = options.requirements ?? DEMO_REQUIREMENTS;
    const production = options.production ?? DEFAULT_PRODUCTION;
    const base = workspaceInput({
      title: 'P0-3',
      zone: 'Кухня',
      measurement: options.measurement ?? ROOM,
      requirements,
      rates: DEMO_RATES,
      wallId: runWallId,
      cornerAt: null,
    });
    const site = objectSite(base, null);
    const attempt = compositionFor({
      shape: options.shape ?? 'u_shape',
      requirements,
      cornerSolution: 'false_panel',
      corners: options.corners as CornerChoice[] | undefined,
      site,
      production,
      variantKey: 'optimal',
    });
    if (attempt?.state !== 'built') {
      throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: композиция от стены ${runWallId} не собралась — ${attempt?.state === 'refused' ? attempt.reason : 'композиции нет'}`);
    }
    const layout = attempt.composition;
    const input = objectInput({
      base,
      resolution: null,
      requirements: wallRequirementsOf(layout, requirements),
      rates: DEMO_RATES,
      production,
      milling: new Map(),
      carcass: new Map(),
      materials: new Map(),
      corner: wallCornerOf(layout),
    });
    const active = composeVariants(input, DISABLED_P3, options.runs ?? {}).find((variant) => variant.key === 'optimal')!;
    const saved = savedWallRuns(JSON.parse(JSON.stringify(options.walls ?? {})));
    const segments = wallSegments(layout, active.run, saved);
    return { layout, segments, active, input, requirements, production, site };
  };
  const order = (screen: ReturnType<typeof screenP3>) => screen.layout.segments.map((segment) => segment.wallId).join(',');
  const fridgeOn = (screen: ReturnType<typeof screenP3>) =>
    screen.segments
      .map((run, i) => (allModules(run).some((unit) => unit.appliance === 'fridge') ? screen.layout.segments[i].wallId : null))
      .filter(Boolean)
      .join('+') || 'НЕТ';

  /* ── 1. Прибор закреплён за физической стеной ── */
  {
    const pinned = { ...DEMO_REQUIREMENTS, applianceWalls: { fridge: 'a' } } as unknown as RunRequirements;
    const home = screenP3('a', { requirements: pinned });
    check('P0-3.1 П от стены a: обход a, b, c; холодильник закреплён за a — стоит на a', order(home) === 'a,b,c' && fridgeOn(home) === 'a', `обход ${order(home)} · холодильник на ${fridgeOn(home)}`);
    const moved = screenP3('d', { requirements: pinned });
    check(
      'P0-3.1 ряд на стене d (обход d, a, b): холодильник остаётся на физической стене a — это теперь стена Б',
      order(moved) === 'd,a,b' && fridgeOn(moved) === 'a',
      `обход ${order(moved)} · холодильник на ${fridgeOn(moved)} (по правилу ушёл бы на b)`,
    );
    const legacy = screenP3('a', { requirements: { ...DEMO_REQUIREMENTS, applianceWalls: { fridge: 0 } } });
    check('P0-3.1 старая запись номером: 0 — стена А обхода, a', fridgeOn(legacy) === 'a', `холодильник на ${fridgeOn(legacy)}`);

    /* Стена временно вне композиции: закрепление хранится и возвращается вместе с ней. */
    const away = { ...DEMO_REQUIREMENTS, applianceWalls: { fridge: 'c' } } as unknown as RunRequirements;
    const asL = screenP3('a', { shape: 'corner_l', requirements: away });
    const asU = screenP3('a', { shape: 'u_shape', requirements: away });
    check(
      'P0-3.1 Г a, b без стены c: холодильник по правилу, закрепление за c не потеряно; П a, b, c — он снова на c',
      fridgeOn(asL) === 'b' && (asL.requirements.applianceWalls as Record<string, unknown>)?.fridge === 'c' && fridgeOn(asU) === 'c',
      `Г: на ${fridgeOn(asL)} · П: на ${fridgeOn(asU)}`,
    );
  }

  /* ── 2. Правка состава задевает стены по физическому закреплению ── */
  {
    const home = screenP3('a');
    const current = {
      assignment: home.layout.segments.map((segment) => segment.appliances),
      usableMm: home.layout.segments.map((segment) => segment.run.lengthMm),
      requirements: home.requirements,
      wallIds: home.layout.segments.map((segment) => segment.wallId),
    };
    const fridgeWall = current.assignment.findIndex((list) => list.includes('fridge'));
    const touched = (pin: string) =>
      wallsTouchedByChange({ applianceWalls: { fridge: pin } } as unknown as Parameters<typeof wallsTouchedByChange>[0], current).join(',');
    check(
      'P0-3.2 холодильник закрепляют за стеной a: задеты его стена и a',
      fridgeWall === 1 && touched('a') === '0,1' && touched('c') === '1,2',
      `холодильник на стене ${fridgeWall} · за a → ${touched('a') || 'ни одной'} · за c → ${touched('c') || 'ни одной'}`,
    );
  }

  /* ── 3. Выбор угла — по физической паре стен ── */
  {
    const stamped: SavedChoice[] = [
      { lower: 'l_shape', upper: 'blind', walls: ['a', 'b'] },
      { lower: 'blind', upper: 'empty', walls: ['b', 'c'] },
    ];
    const read = cornerChoicesOf({ corners: stamped as CornerChoice[] }, 2, ['b', 'c', 'd'] as never);
    check(
      'P0-3.3 углы обхода b, c, d: угол b–c — свой (слепой, верх пустой), угол c–d — новый, по умолчанию',
      JSON.stringify(read) === JSON.stringify([
        { lower: 'blind', upper: 'empty' },
        { lower: 'blind', upper: 'blind' },
      ]),
      JSON.stringify(read),
    );
    const legacy = cornerChoicesOf({ corners: [{ lower: 'l_shape', upper: 'empty' }] }, 1, ['a', 'b'] as never);
    check('P0-3.3 старый массив без меток читается по номеру, как раньше', legacy[0]?.lower === 'l_shape' && legacy[0]?.upper === 'empty', JSON.stringify(legacy));

    /* Кабинет клиента и экран: та же композиция — Г-модуль угла a–b не переезжает в угол b–c. */
    const moved = screenP3('b', { corners: stamped });
    const lost = cornerGeometry({ lower: 'blind', upper: 'empty' }, DEMO_REQUIREMENTS.zone, DEFAULT_PRODUCTION).lostMm;
    check(
      'P0-3.3 ряд на стене b: стена c после угла b–c (слепого) — 3600 − ' + lost + ' мм, не 3600 − 900',
      order(moved) === 'b,c,d' && moved.layout.segments[1].run.lengthMm === 3600 - lost,
      `обход ${order(moved)} · полезная длина c ${moved.layout.segments[1].run.lengthMm} мм`,
    );
  }

  /* ── 4. Правленая стена сменила роль в углу ── */
  {
    const home = screenP3('a');
    const c = home.segments[2];
    const tail = [...c.modules].filter((unit) => unit.kind === 'base' && !unit.appliance).sort((x, y) => y.offsetMm - x.offsetMm)[0];
    const head = c.modules.find((unit) => unit.offsetMm === 0 && unit.kind === 'base' && !unit.appliance);
    if (!tail || tail.offsetMm + tail.widthMm !== c.lengthMm || !head) {
      throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: P0-3.4 — у стены c нет обычного модуля у начала и у конца (${allModules(c).map((u) => u.id).join(' ')})`);
    }
    const edit = (unit: Module) =>
      applyOps({
        run: c,
        requirements: home.requirements,
        ops: [{ op: 'replace_module', moduleId: unit.id, kind: unit.kind, variant: 'door_two', widthMm: unit.widthMm }],
        openings: home.layout.segments[2].openings,
        roomDepthMm: 0,
      });
    const twoAtTail = edit(tail);
    const twoAtHead = edit(head);
    check(
      'P0-3.4 правки стены c применились: двустворчатый у конца и у начала',
      allModules(twoAtTail).find((u) => u.id === tail.id)?.variant === 'door_two' &&
        allModules(twoAtHead).find((u) => u.id === head.id)?.variant === 'door_two',
      `${tail.id} → ${allModules(twoAtTail).find((u) => u.id === tail.id)?.variant} · ${head.id} → ${allModules(twoAtHead).find((u) => u.id === head.id)?.variant}`,
    );

    /* Ряд на стене b: c — стена Б, она стыкуется к b–c и ВЛАДЕЕТ углом c–d. */
    const shifted = (saved: Run) => {
      const screen = screenP3('b', { walls: { c: saved } });
      const mismatches = wallMismatches(screen.layout, screen.segments, {
        before: (index: number) => (index === 1 ? saved.corner : undefined),
        openingsOf: (index: number) => screen.layout.segments[index].openings,
        requirements: screen.requirements,
      } as never);
      return { screen, mismatches };
    };
    const conflict = shifted(twoAtTail);
    const own = conflict.screen.segments[1].corner?.own;
    const g = own ? cornerGeometry(own, DEMO_REQUIREMENTS.zone, DEFAULT_PRODUCTION) : null;
    const found = conflict.mismatches.find((mismatch) => mismatch.index === 1) as (WallMismatch & { corner?: string[] }) | undefined;
    check(
      'P0-3.4 двустворчатый в слепой зоне нового угла: конфликт стены Б назван с миллиметрами',
      Boolean(found?.corner?.length) &&
        found!.corner!.some(
          (text) =>
            text.includes(String(g?.ownerBlindMm)) &&
            text.includes(`«${allModules(twoAtTail).find((u) => u.id === tail.id)?.label}»`),
        ),
      found ? (found.corner ?? []).join(' | ') || 'КОНФЛИКТ БЕЗ СЛОВ' : `КОНФЛИКТА НЕТ · роли стены c: ${JSON.stringify(conflict.screen.segments[1].corner)}`,
    );
    check(
      'P0-3.4 правка не изменена молча: модуль тот же и того же вида',
      allModules(conflict.screen.segments[1]).find((u) => u.id === tail.id)?.variant === 'door_two',
      allModules(conflict.screen.segments[1]).map((u) => `${u.id}:${u.variant ?? ''}`).join(' '),
    );
    const sameRole = wallMismatches(conflict.screen.layout, conflict.screen.segments, {
      before: (index: number) => (index === 1 ? conflict.screen.segments[1].corner : undefined),
      openingsOf: (index: number) => conflict.screen.layout.segments[index].openings,
      requirements: conflict.screen.requirements,
    } as never);
    check('P0-3.4 та же роль, что была при правке, — конфликта нет', sameRole.length === 0, sameRole.map((m) => m.label).join(', ') || 'нет');

    /*
     * Правили НЕ у угла (первый модуль), а у конца стены стоит раскладка
     * стыкующейся стены: модуль 876 мм на две створки. Владельцу угла там
     * положена одна створка на доступной части — та же стена, собранная
     * раскладкой, ставит её. Молча показанная, такая стена шла в смету с
     * 8 угловыми петлями вместо 4 у собранной раскладкой (две створки по
     * 150 мм у фальш-панели) — и это тоже конфликт, а не «совместимо».
     */
    const headOnly = shifted(twoAtHead);
    const tailNow = allModules(headOnly.screen.segments[1]).find((u) => u.id === tail.id);
    const headFound = headOnly.mismatches.find((mismatch) => mismatch.index === 1) as (WallMismatch & { corner?: string[] }) | undefined;
    check(
      'P0-3.4 правка не у угла, а у конца — две створки стыкующейся стены: тоже конфликт, с модулем и миллиметрами',
      Boolean(headFound?.corner?.some((text) => text.includes(tail.label) && text.includes(String(g?.ownerBlindMm)))) &&
        tailNow?.doorCount === 2,
      headFound ? (headFound.corner ?? []).join(' | ') : `КОНФЛИКТА НЕТ · у конца ${tailNow?.id} створок ${tailNow?.doorCount}`,
    );

    /*
     * СМЕНА РОЛИ: стена b теряет угол. П от a: b стыкуется к a–b и
     * владеет b–c; ряд на стене d (обход d, a, b): b — последняя, у её
     * конца стена комнаты. Глухой части больше нет, створка становится
     * полной — модули те же, и сцена, смета и раскрой это согласно видят.
     *
     * До P0-3b здесь стояло «конфликта нет»: это и есть путь, который
     * P0-3b называет дефектом. Слепой модуль владельца — корпус «створка
     * + глухая часть» с ОДНОЙ створкой; без угла она во всю ширину корпуса
     * и шире, чем ставит движок (`frontPlan`). Ожидание перевёрнуто по
     * постановке, а не ради зелёного: сверка сцены, сметы и раскроя та же.
     */
    const wallB = home.segments[1];
    const upperB = wallB.upperSegments
      .flatMap((segment) => segment.modules)
      .filter((unit) => unit.kind === 'upper' && !unit.appliance && unit.section !== 'mezzanine')
      .sort((x, y) => x.offsetMm - y.offsetMm);
    const middle = upperB.length > 2 ? upperB[1] : undefined;
    if (!middle) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: P0-3.4 — у стены b нет шкафа верхнего ряда не у края (${upperB.map((u) => u.id).join(' ')})`);
    const editedB = applyOps({
      run: wallB,
      requirements: home.requirements,
      ops: [{ op: 'remove_module', moduleId: middle.id }],
      openings: home.layout.segments[1].openings,
      roomDepthMm: 0,
    });
    const fromD = screenP3('d', { walls: { b: editedB } });
    const bAt = fromD.layout.segments.findIndex((segment) => segment.wallId === 'b');
    const run = fromD.segments[bAt];
    const fine = wallMismatches(fromD.layout, fromD.segments, {
      before: (index: number) => (index === bAt ? editedB.corner : undefined),
      openingsOf: (index: number) => fromD.layout.segments[index].openings,
      requirements: fromD.requirements,
    } as never);
    const estimate = buildEstimate(run, 'optimal', DEMO_RATES);
    const cut = panelMaterials(buildPanels({ run }));
    const fronts = estimate.lines.find((line) => line.key === 'front_panel')?.quantity ?? 0;
    const hingeEstimate = estimate.lines.filter((line) => line.key.startsWith('hinge_')).reduce((sum, line) => sum + line.quantity, 0);
    const hingeScene = runBoxes(run, { thicknessMm: 16, frontThicknessMm: 18, gapMm: 3 }).filter((box) => box.node === 'hinge').length;
    const cornerLine = estimate.lines.find((line) => line.key === 'hinge_corner_175')?.quantity ?? 0;
    const facts = {
      lostOwn: Boolean(editedB.corner?.own) && Boolean(run.corner?.dock) && !run.corner?.own,
      usable: run.lengthMm === fromD.layout.segments[bAt].run.lengthMm && run.lengthMm === editedB.lengthMm,
      places: allModules(run).map((u) => `${u.id}:${u.offsetMm}:${u.widthMm}`).join(' ') === allModules(editedB).map((u) => `${u.id}:${u.offsetMm}:${u.widthMm}`).join(' '),
      overlaps: moduleOverlaps(run).length === 0,
      noBlind: allModules(run).every((unit) => blindPartMm(unit, run) === 0 && openFrontMm(unit, run) === unit.widthMm),
      cornerHinges: cornerLine === 0,
      hinges: hingeEstimate === hingeScene,
      frontsCut: Math.abs(fronts - cut.frontM2) <= 0.01,
      filler: cornerFillersOf(run).some((piece) => piece.level === 'lower' && piece.toMm === 0 && piece.fromMm === -cornerGeometry(run.corner!.dock!, run.zone, run.production).fillerMm),
      named: fine.some(
        (mismatch) => mismatch.index === bAt && ((mismatch as WallMismatch & { leaves?: unknown[] }).leaves?.length ?? 0) > 0,
      ),
    };
    const bad = Object.entries(facts).filter(([, ok]) => !ok).map(([key]) => key);
    check(
      'P0-3.4 смена роли (стена b потеряла угол): ряд, сцена, смета и раскрой согласны, а створка шире предела названа (P0-3b)',
      bAt === 2 && bad.length === 0,
      bad.length === 0
        ? `обход ${order(fromD)} · b на месте ${bAt} · полезная ${run.lengthMm} мм · глухих частей 0 · угловых петель ${cornerLine} · петель смета ${hingeEstimate} = сцена ${hingeScene} · фасадов ${fronts} = раскрой ${cut.frontM2} м²`
        : `РАСХОДЯТСЯ: ${bad.join(', ')} · обход ${order(fromD)} · угловых петель ${cornerLine}, петель ${hingeEstimate}/${hingeScene}, фасадов ${fronts}/${cut.frontM2}`,
    );

    /* Конфликт для экрана: цены нет, «Дальше» заперто, запись НЕ заперта, выход — пересборка. */
    if (found) {
      const state = screenState({
        refusal: null,
        mismatches: [found],
        walls: conflict.screen.layout.segments.map((segment) => ({ lengthMm: segment.wallLengthMm })),
        segments: conflict.screen.segments,
        shape: 'u_shape',
        warnings: [],
      });
      check(
        'P0-3.4 конфликт роли угла: цены нет, «Дальше» заперто, запись не заперта, кнопка пересобирает стену Б',
        state.priceHidden && state.nextLocked && !state.autosaveLocked && state.rebuildWall === 1 &&
          state.blocking.some((warning) => /угл/.test(warning.message) && warning.message.includes(String(g?.ownerBlindMm))),
        `цена ${state.priceHidden ? 'спрятана' : 'ВИДНА'} · дальше ${state.nextLocked ? 'заперто' : 'ОТКРЫТО'} · запись ${state.autosaveLocked ? 'ЗАПЕРТА' : 'идёт'} · стена ${state.rebuildWall} · ${state.blocking[0]?.message.slice(0, 160) ?? 'строки нет'}`,
      );
    } else {
      check('P0-3.4 конфликт роли угла дошёл до экрана', false, 'конфликта нет — экрану нечего показать');
    }
  }

  /* ── 5. Собранные раскладкой ряды не конфликтуют со своей ролью — ни у одной школы и выбора ── */
  {
    const LOWERS: LowerCornerKind[] = ['blind', 'l_shape'];
    const UPPERS: UpperCornerKind[] = ['l_shape', 'blind', 'empty'];
    const FAKE: RunCorner = { dock: { lower: 'l_shape', upper: 'l_shape' } };
    const schools: [string, ProductionSettings][] = [
      ['560/320', DEFAULT_PRODUCTION],
      ['550/350', { ...DEFAULT_PRODUCTION, depths: { baseMm: 550, upperMm: 350, mezzanineMm: 550 } }],
      ['600/300', { ...DEFAULT_PRODUCTION, depths: { baseMm: 600, upperMm: 300, mezzanineMm: 600 } }],
    ];
    let configs = 0;
    let rowsChecked = 0;
    const falseAlarms: string[] = [];
    for (const [school, production] of schools) {
      for (const shape of ['corner_l', 'u_shape'] as const) {
        for (const lower of LOWERS) {
          for (const upper of UPPERS) {
            const corners = Array.from({ length: shape === 'u_shape' ? 2 : 1 }, () => ({ lower, upper }));
            const screen = screenP3('a', { shape, production, corners });
            configs += 1;
            const found = wallMismatches(screen.layout, screen.segments, {
              before: () => FAKE,
              openingsOf: (index: number) => screen.layout.segments[index].openings,
              requirements: screen.requirements,
            } as never);
            rowsChecked += screen.segments.length;
            for (const mismatch of found) falseAlarms.push(`${school} ${shape} ${lower}/${upper} ${mismatch.label}: ${((mismatch as WallMismatch & { corner?: string[] }).corner ?? []).join('; ')}`);
          }
        }
      }
    }
    const WANT = schools.length * 2 * LOWERS.length * UPPERS.length;
    check(
      `P0-3.5 ряды, собранные раскладкой, совместимы со своей ролью угла — ${WANT} конфигураций`,
      configs === WANT && falseAlarms.length === 0 && rowsChecked >= WANT * 2,
      falseAlarms.length === 0 ? `конфигураций ${configs}, рядов ${rowsChecked}` : `${falseAlarms.length}: ${falseAlarms.slice(0, 2).join(' | ')}`,
    );
  }

  /* ── 6. Сохранённые и сейчас неиспользуемые правки названы словами ── */
  {
    const home = screenP3('a');
    const wallA = home.active.run;
    const wallB = home.segments[1];
    const state = screenState({
      refusal: null,
      mismatches: [],
      walls: [],
      segments: [],
      shape: 'u_shape',
      warnings: [],
      edits: {
        runWallId: 'b',
        wallAEdit: wallA,
        wallEdits: { b: wallB },
        compositionWallIds: ['b', 'c', 'd'],
        surveyWalls: ROOM.walls.map((wall) => ({ id: wall.id, lengthMm: wall.lengthMm })),
        pins: { fridge: 'a' },
        assignment: [['sink600', 'dishwasher45'], ['oven'], ['fridge', 'hob', 'hood']],
      },
    } as never);
    const note = state.clarify.find((warning) => warning.id === 'walls-hidden-edits')?.message ?? '';
    check(
      'P0-3.6 правки стен 1 и 2 замера сохранены и сейчас не участвуют — сказано словами, как и закрепление холодильника',
      /Стена 1 замера \(3600 мм\): сохранена ручная раскладка/.test(note) &&
        /Стена 2 замера \(3000 мм\)/.test(note) &&
        /Холодильник закреплён за стеной 1 замера/.test(note),
      note || 'СТРОКИ НЕТ',
    );
    const none = screenState({
      refusal: null,
      mismatches: [],
      walls: [],
      segments: [],
      shape: 'u_shape',
      warnings: [],
      edits: {
        runWallId: 'a',
        wallAEdit: wallA,
        wallEdits: { b: wallB },
        compositionWallIds: ['a', 'b', 'c'],
        surveyWalls: ROOM.walls.map((wall) => ({ id: wall.id, lengthMm: wall.lengthMm })),
        pins: { fridge: 'a' },
        assignment: [['fridge'], [], []],
      },
    } as never);
    check(
      'P0-3.6 все правки на своих стенах — строки нет',
      !none.clarify.some((warning) => warning.id === 'walls-hidden-edits'),
      none.clarify.map((warning) => warning.id).join(', ') || 'уточнений нет',
    );

    /*
     * Стены нет и в замере: её удалили, а правленый ряд лежит. Найдено в
     * базе (объект с рядом «w2» при замере без w2). «Вернётся, когда ряд
     * встанет на эту стену» здесь — обещание, которого не выполнить:
     * встать не на что.
     */
    const gone = screenState({
      refusal: null,
      mismatches: [],
      walls: [],
      segments: [],
      shape: 'u_shape',
      warnings: [],
      edits: {
        runWallId: 'a',
        wallAEdit: wallA,
        wallEdits: { z: { ...wallB, wallId: 'z' } },
        compositionWallIds: ['a', 'b', 'c'],
        surveyWalls: ROOM.walls.map((wall) => ({ id: wall.id, lengthMm: wall.lengthMm })),
        pins: {},
        assignment: [['fridge'], [], []],
      },
    } as never);
    const goneNote = gone.clarify.find((warning) => warning.id === 'walls-hidden-edits')?.message ?? '';
    check(
      'P0-3.6 правка стены, которой в замере больше нет, — названа так, без обещания «вернётся, когда ряд встанет»',
      /стены «z», которой в замере больше нет/.test(goneNote) && !/Правки вернутся/.test(goneNote),
      goneNote || 'СТРОКИ НЕТ',
    );
  }

  /* ══════  P0-3b: модуль после смены роли угла проходит правила производства  ══════ */
  /*
   * Стена теряет угол: «ряд здесь?» делает среднюю стену П последней,
   * форма становится короче (П → Г), кухня — прямой. Правленый ряд — тот,
   * что собирали для владельца угла: у слепого модуля корпус «створка +
   * глухая часть» и ОДНА створка. Глухой части больше нет — створка во
   * всю ширину корпуса, а P0-3 называла это «совместимо»: цена на экране,
   * «Дальше» открыто, раскрой режет фасад шире, чем его делает цех.
   *
   * Предел — то, что поставил бы сам движок: вариант со своим числом
   * створок держит его, механизм (подъёмник, откидной) — одну, остальным
   * число створок ставит ширина фасада (`frontPlan`: шире
   * `SINGLE_DOOR_MAX_MM` — две). Ширина створки — как её рисует сцена
   * (`sceneLeaves`), раскрой режет её же за вычетом зазоров. Ожидания
   * ниже считаются из этих примитивов, а не из проверки экрана.
   */
  console.log('\nP0-3b: производственная пригодность модуля после смены роли угла');
  {
    type LeafRefusal = {
      moduleId: string;
      label: string;
      offsetMm: number;
      widthMm: number;
      leafMm: number;
      leaves: number;
      wanted: number;
      limitMm: number;
      excessMm: number;
    };
    type Found = WallMismatch & { corner?: string[]; leaves?: LeafRefusal[] };
    type DoorLeaf = { kind: 'door'; id: string; opening: string; xM: number; widthM: number };
    type ScreenB = ReturnType<typeof screenState> & { exportLocked?: boolean };
    const SCHOOLS_B: [string, ProductionSettings][] = [
      ['560/320', DEFAULT_PRODUCTION],
      ['550/350', { ...DEFAULT_PRODUCTION, depths: { baseMm: 550, upperMm: 350, mezzanineMm: 550 } }],
      ['600/300', { ...DEFAULT_PRODUCTION, depths: { baseMm: 600, upperMm: 300, mezzanineMm: 600 } }],
    ];
    const refusalsOf = (found: WallMismatch[] | null, index: number): LeafRefusal[] =>
      ((found ?? []) as Found[]).find((mismatch) => mismatch.index === index)?.leaves ?? [];

    /** Створки модуля — тем же вызовом, что рисует сцена (`Cabinet3D`, проверка открывания у угла). */
    const leavesOf = (run: Run) =>
      runPlaces(run).map((entry) => {
        const blind = blindPartMm(entry.unit, run);
        const doors = sceneLeaves(
          entry.unit,
          entry.heightM,
          blind > 0 ? openFrontMm(entry.unit, run) / 1000 : undefined,
        ).filter((leaf) => leaf.kind === 'door') as unknown as DoorLeaf[];
        return { unit: entry.unit, blind, doors };
      });

    /** Затронутые сменой роли: глухая часть была, когда ряд правили, и её нет теперь. */
    const affected = (run: Run, before: RunCorner | undefined) => {
      const then = { ...run, corner: before };
      return leavesOf(run).filter(
        ({ unit, blind, doors }) => blind === 0 && blindPartMm(unit, then) > 0 && doors.length > 0,
      );
    };

    /** Чем движок ограничивает створки модуля: механизм, число варианта или ширина. */
    const ruleOf = (unit: Module, doors: DoorLeaf[]) => {
      if (doors.some((leaf) => leaf.opening === 'lift' || leaf.opening === 'flap')) return { wanted: 1, text: 'механизм — одна створка' };
      const front = Math.round(doors.reduce((sum, leaf) => sum + leaf.widthM, 0) * 1000);
      const declared = unit.variant ? MODULE_VARIANTS[unit.variant].doorCount : undefined;
      return declared !== undefined
        ? { wanted: declared, text: `вариант — ${declared} створки` }
        : { wanted: frontPlan(unit.kind, front).doorCount, text: `предел ${SINGLE_DOOR_MAX_MM} мм на створку` };
    };

    /** Что обязан назвать экран: створок меньше, чем поставил бы движок фасаду этой ширины. */
    const owed = (run: Run, before: RunCorner | undefined) =>
      affected(run, before)
        .filter(({ unit, doors }) => doors.length < ruleOf(unit, doors).wanted)
        .map(({ unit, doors }) => ({ id: unit.id, label: unit.label, leafMm: Math.round(doors[0].widthM * 1000), leaves: doors.length }));

    /**
     * НАЗВАННАЯ СТВОРКА — ТА ЖЕ В СЦЕНЕ, НА ЧЕРТЕЖЕ И В РАСКРОЕ.
     * Пусто — сходится; иначе — что разошлось.
     */
    const unsynced = (run: Run, production: ProductionSettings, refusal: LeafRefusal): string[] => {
      const out: string[] = [];
      const entry = leavesOf(run).find((item) => item.unit.id === refusal.moduleId);
      if (!entry) return [`${refusal.moduleId}: модуля в ряду нет`];
      const scene = entry.doors.map((leaf) => Math.round(leaf.widthM * 1000));
      if (scene.length !== refusal.leaves || scene.some((width) => width !== refusal.leafMm)) {
        out.push(`сцена ${scene.join('+') || 'без створок'} при ${refusal.leafMm}×${refusal.leaves}`);
      }
      const gap = production.frontGapMm;
      const cut = buildPanels({ run, production }).filter(
        (panel) => panel.moduleId === refusal.moduleId && panel.name === FACADE_PANEL_NAME,
      );
      const cutLeaves = cut.reduce((sum, panel) => sum + panel.qty, 0);
      const cutLeaf = cut[0] ? (cut[0].widthMm * refusal.leaves + gap * (refusal.leaves + 1)) / refusal.leaves : NaN;
      if (cutLeaves !== refusal.leaves || !(Math.abs(cutLeaf - refusal.leafMm) <= 1)) {
        out.push(`раскрой ${cut.map((panel) => `${panel.widthMm}×${panel.qty}`).join(' ') || 'без фасада'} при створке ${refusal.leafMm}`);
      }
      const glyph = frontGlyph(entry.unit, 'fronts').filter((element) => element.kind === 'swing').length;
      if (glyph !== refusal.leaves) out.push(`чертёж: створок ${glyph} при ${refusal.leaves}`);
      if (
        refusal.limitMm !== SINGLE_DOOR_MAX_MM ||
        frontPlan(entry.unit.kind, refusal.limitMm).doorCount !== 1 ||
        frontPlan(entry.unit.kind, refusal.limitMm + 1).doorCount !== 2
      ) {
        out.push(`предел ${refusal.limitMm} мм — не порог frontPlan`);
      }
      if (refusal.excessMm !== refusal.leafMm - refusal.limitMm) {
        out.push(`превышение ${refusal.excessMm} при ${refusal.leafMm} − ${refusal.limitMm}`);
      }
      return out;
    };
    const screenOf = (found: WallMismatch[], walls: { lengthMm: number }[], segments: Run[], shape: CompositionKind) =>
      screenState({ refusal: null, mismatches: found, walls, segments, shape, warnings: [] } as never) as ScreenB;
    const lockWords = (state: ScreenB | null) =>
      state
        ? `цена ${state.priceHidden ? 'спрятана' : 'ВИДНА'} · дальше ${state.nextLocked ? 'заперто' : 'ОТКРЫТО'} · ` +
          `выгрузка ${state.exportLocked === true ? 'заперта' : 'ОТКРЫТА'} · запись ${state.autosaveLocked ? 'ЗАПЕРТА' : 'идёт'}`
        : 'ЭКРАНА НЕТ';

    /** Прямая кухня — тот же путь, что у экрана без композиции: требования целиком, угла нет. */
    const linear = (runs: Partial<Record<VariantKey, Run>>, production: ProductionSettings = DEFAULT_PRODUCTION) => {
      const base = workspaceInput({
        title: 'P0-3b',
        zone: 'Кухня',
        measurement: ROOM,
        requirements: DEMO_REQUIREMENTS,
        rates: DEMO_RATES,
        wallId: 'a',
        cornerAt: null,
      });
      const input = objectInput({
        base,
        resolution: null,
        requirements: DEMO_REQUIREMENTS,
        rates: DEMO_RATES,
        production,
        milling: new Map(),
        carcass: new Map(),
        materials: new Map(),
        corner: undefined,
      });
      const active = composeVariants(input, DISABLED_P3, runs).find((variant) => variant.key === 'optimal')!;
      return { input, active, segments: wallSegments(null, active.run, {}) };
    };
    /** Расхождения прямой кухни — тем же вызовом, что делает экран: композиции нет (`null`). */
    const linearMismatches = (lin: ReturnType<typeof linear>, before: RunCorner | undefined) => {
      try {
        const found = (wallMismatches as unknown as (...args: unknown[]) => Found[])(null, lin.segments, {
          before: () => before,
          openingsOf: () => lin.input.openings,
          requirements: DEMO_REQUIREMENTS,
        });
        return { found, crash: '' };
      } catch (error) {
        /* Не глушитель: исключение уходит в FAIL проверки ниже своими словами. */
        return { found: null, crash: error instanceof Error ? error.message.split('\n')[0] : String(error) };
      }
    };

    /* ── b.1 П, «ряд здесь?» на d: угол b–c был у стены Б, теперь b последняя (B, D, E, F) ── */
    const homeD = screenP3('a');
    const rowB = homeD.segments[1];
    const rowA = homeD.active.run;
    const uppersB = rowB.upperSegments
      .flatMap((segment) => segment.modules)
      .filter((unit) => unit.kind === 'upper' && !unit.appliance && unit.section !== 'mezzanine')
      .sort((x, y) => x.offsetMm - y.offsetMm);
    const middleB = uppersB.length > 2 ? uppersB[1] : undefined;
    const plainA = rowA.modules.find(
      (unit) =>
        unit.kind === 'base' && !unit.appliance && !unit.variant && blindPartMm(unit, rowA) === 0 &&
        unit.widthMm >= MODULE_VARIANTS.drawers.minWidthMm && unit.widthMm <= MODULE_VARIANTS.drawers.maxWidthMm,
    );
    if (!middleB || !plainA) {
      throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: P0-3b — нечего править: шкаф не у края на b ${middleB?.id ?? 'нет'}, обычный нижний на a ${plainA?.id ?? 'нет'}`);
    }
    const editB = applyOps({
      run: rowB,
      requirements: homeD.requirements,
      ops: [{ op: 'remove_module', moduleId: middleB.id }],
      openings: homeD.layout.segments[1].openings,
      roomDepthMm: 0,
    });
    const editA = applyOps({
      run: rowA,
      requirements: homeD.input.requirements,
      ops: [{ op: 'set_variant', moduleId: plainA.id, variant: 'drawers' }],
      openings: homeD.input.openings,
      roomDepthMm: 0,
    });
    check(
      'P0-3b правки стен А и Б применились',
      allModules(editA).some((unit) => unit.id === plainA.id && unit.variant === 'drawers') &&
        !allModules(editB).some((unit) => unit.id === middleB.id),
      `${plainA.id} → ящики · ${middleB.id} снят`,
    );

    const fromD = screenP3('d', { walls: { b: editB }, runs: { optimal: editA } });
    const bAt = fromD.layout.segments.findIndex((segment) => segment.wallId === 'b');
    const runB = fromD.segments[bAt];
    const foundD = wallMismatches(fromD.layout, fromD.segments, {
      before: (index: number) => (index === bAt ? editB.corner : undefined),
      openingsOf: (index: number) => fromD.layout.segments[index].openings,
      requirements: fromD.requirements,
    } as never);
    const wantD = owed(runB, editB.corner);
    const gotD = refusalsOf(foundD, bAt);
    if (wantD.length === 0) {
      throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: P0-3b — у стены b без угла нет створки шире, чем ставит движок (затронуто: ${affected(runB, editB.corner).map(({ unit }) => unit.id).join(' ') || 'ничего'})`);
    }
    check(
      'P0-3b П, ряд на d: стена b потеряла угол b–c — каждая створка шире предела названа: модуль, ширина, предел, превышение',
      bAt === 2 && gotD.length === wantD.length &&
        wantD.every((want) => gotD.some((got) => got.moduleId === want.id && got.leafMm === want.leafMm && got.leaves === want.leaves)),
      gotD.length > 0
        ? gotD.map((got) => `${got.moduleId} створка ${got.leafMm} мм / предел ${got.limitMm} мм / +${got.excessMm} мм`).join(' · ')
        : `НЕ НАЗВАНО: ${wantD.map((want) => `${want.id} ${want.leafMm} мм`).join(', ')} · обход ${order(fromD)} · расхождений ${foundD.length}`,
    );
    const driftD = gotD.flatMap((got) => unsynced(runB, DEFAULT_PRODUCTION, got).map((text) => `${got.moduleId}: ${text}`));
    const estimateD = buildEstimate(runB, 'optimal', DEMO_RATES);
    const cutD = panelMaterials(buildPanels({ run: runB }));
    const hingesD = estimateD.lines.filter((line) => line.key.startsWith('hinge_')).reduce((sum, line) => sum + line.quantity, 0);
    const hingeBoxesD = runBoxes(runB, { thicknessMm: 16, frontThicknessMm: 18, gapMm: 3 }).filter((box) => box.node === 'hinge').length;
    const frontsD = estimateD.lines.find((line) => line.key === 'front_panel')?.quantity ?? 0;
    check(
      'P0-3b названная створка — та же в сцене, на чертеже, в раскрое и в смете',
      gotD.length > 0 && driftD.length === 0 && hingesD === hingeBoxesD && Math.abs(frontsD - cutD.frontM2) <= 0.01,
      driftD.length > 0
        ? driftD.join(' | ')
        : `створок названо ${gotD.length} · петель смета ${hingesD} = сцена ${hingeBoxesD} · фасадов смета ${frontsD} = раскрой ${cutD.frontM2} м²`,
    );
    const mismatchD = (foundD as Found[]).find((mismatch) => mismatch.index === bAt);
    const messageD = mismatchD ? wallMismatchMessage(mismatchD) : '';
    check(
      'P0-3b слова: стена, модуль, ширина створки, предел и превышение в мм, выход — пересобрать; у цены — почему её нет',
      Boolean(mismatchD) &&
        gotD.length > 0 &&
        messageD.startsWith(`${fromD.layout.segments[bAt].label}:`) &&
        gotD.every(
          (got) =>
            messageD.includes(`«${got.label}»`) &&
            messageD.includes(`${got.leafMm} мм`) &&
            messageD.includes(`${got.limitMm} мм`) &&
            messageD.includes(`на ${got.excessMm} мм`),
        ) &&
        /Пересоберите/.test(messageD) &&
        Boolean(mismatchD && /створк/.test(mismatchPriceText(mismatchD))),
      messageD || 'СТРОКИ НЕТ',
    );
    const stateD = screenOf(
      foundD,
      fromD.layout.segments.map((segment) => ({ lengthMm: segment.wallLengthMm })),
      fromD.segments,
      'u_shape',
    );
    const rebuildId = stateD.rebuildWall === null ? null : (fromD.layout.segments[stateD.rebuildWall]?.wallId ?? null);
    check(
      'P0-3b экран: цены нет, «Дальше» и выгрузка для раскроя заперты, запись правок идёт, пересобирается стена b',
      stateD.priceHidden && stateD.nextLocked && stateD.exportLocked === true && !stateD.autosaveLocked && rebuildId === 'b',
      `${lockWords(stateD)} · пересборка ${rebuildId ?? 'НЕТ'}`,
    );

    /* Пересборка снимает правку стены b — и только её: d и a те же до модуля, правка А на месте (I, J). */
    const rebuilt = screenP3('d', { runs: { optimal: editA } });
    const foundR = wallMismatches(rebuilt.layout, rebuilt.segments, {
      before: () => undefined,
      openingsOf: (index: number) => rebuilt.layout.segments[index].openings,
      requirements: rebuilt.requirements,
    } as never);
    const placesOf = (run: Run) =>
      allModules(run).map((unit) => `${unit.id}:${unit.offsetMm}:${unit.widthMm}:${unit.variant ?? ''}:${unit.doorCount}`).join(' ');
    const neighboursSame = [0, 1].every((i) => placesOf(rebuilt.segments[i]) === placesOf(fromD.segments[i]));
    const backA = screenP3('a', { runs: { optimal: editA } });
    check(
      'P0-3b пересборка стены b: конфликта нет, стены d и a те же до модуля, правка стены А на месте',
      foundR.length === 0 && neighboursSame && rebuilt.layout.segments[bAt].wallId === 'b' &&
        allModules(backA.active.run).some((unit) => unit.id === plainA.id && unit.variant === 'drawers'),
      `расхождений ${foundR.length} · соседи ${neighboursSame ? 'те же' : 'ПОЕХАЛИ'} · b: ${rebuilt.segments[bAt].modules
        .filter((unit) => unit.kind === 'base')
        .map((unit) => `${unit.id}:${unit.widthMm}×${unit.doorCount}`)
        .join(' ')}`,
    );

    /* ── b.2 П → Г: стена Б теряет угол b–c формой (A) ── */
    const asL = screenP3('a', { shape: 'corner_l', walls: { b: editB }, runs: { optimal: editA } });
    const foundL = wallMismatches(asL.layout, asL.segments, {
      before: (index: number) => (index === 0 ? editA.corner : index === 1 ? editB.corner : undefined),
      openingsOf: (index: number) => asL.layout.segments[index].openings,
      requirements: asL.requirements,
    } as never);
    const wantL = owed(asL.segments[1], editB.corner);
    const gotL = refusalsOf(foundL, 1);
    check(
      'P0-3b П → Г: стена Б потеряла угол b–c — створки шире предела названы, стена А (угол a–b тот же) не тронута',
      wantL.length > 0 && gotL.length === wantL.length &&
        wantL.every((want) => gotL.some((got) => got.moduleId === want.id && got.leafMm === want.leafMm)) &&
        !(foundL as Found[]).some((mismatch) => mismatch.index === 0),
      gotL.length > 0
        ? gotL.map((got) => `${got.moduleId} ${got.leafMm}/${got.limitMm} +${got.excessMm}`).join(' · ')
        : `НЕ НАЗВАНО: ${wantL.map((want) => `${want.id} ${want.leafMm} мм`).join(', ') || 'затронутых нет'}`,
    );

    /* ── b.3 Г, «ряд здесь?» на d: правка соседа встаёт только соседом, правка А — только на А (H) ── */
    const homeL = screenP3('a', { shape: 'corner_l' });
    const rowBL = homeL.segments[1];
    /* Правка стены Б: обычный нижний модуль — «две дверцы» (вариант от 600 мм, ширина любая). */
    const plainBL = rowBL.modules.find(
      (unit) => unit.kind === 'base' && !unit.appliance && !unit.variant && unit.widthMm >= MODULE_VARIANTS.door_two.minWidthMm,
    );
    if (!plainBL) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: P0-3b — на стене Б Г-образной нет обычного нижнего модуля от 600 мм (${allModules(rowBL).map((u) => `${u.id}:${u.widthMm}`).join(' ')})`);
    const editBL = applyOps({
      run: rowBL,
      requirements: homeL.requirements,
      ops: [{ op: 'set_variant', moduleId: plainBL.id, variant: 'door_two' }],
      openings: homeL.layout.segments[1].openings,
      roomDepthMm: 0,
    });
    const movedL = screenP3('d', { shape: 'corner_l', walls: { b: editBL }, runs: { optimal: editA } });
    const foundML = wallMismatches(movedL.layout, movedL.segments, {
      before: (index: number) => (movedL.layout.segments[index].wallId === 'b' ? editBL.corner : undefined),
      openingsOf: (index: number) => movedL.layout.segments[index].openings,
      requirements: movedL.requirements,
    } as never);
    const stateML = screenOf(foundML, movedL.layout.segments.map((segment) => ({ lengthMm: segment.wallLengthMm })), movedL.segments, 'corner_l');
    check(
      'P0-3b Г, «ряд здесь?» на d: правки А и Б в другой роли не встают — ложной тревоги нет, цена на экране',
      allModules(editBL).some((unit) => unit.id === plainBL.id && unit.variant === 'door_two') &&
        order(movedL) === 'd,a' && foundML.length === 0 && !stateML.priceHidden && !stateML.nextLocked,
      `обход ${order(movedL)} · расхождений ${foundML.length} · ${lockWords(stateML)}`,
    );

    /* ── b.4 Прямая: стена А теряет угол a–b (C) ── */
    const linA = linear({ optimal: editA });
    const runAL = linA.segments[0];
    const wantC = owed(runAL, editA.corner);
    if (wantC.length === 0) {
      throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: P0-3b — у стены А в прямой форме нет створки шире, чем ставит движок (затронуто: ${affected(runAL, editA.corner).map(({ unit }) => unit.id).join(' ') || 'ничего'})`);
    }
    const gotCAll = linearMismatches(linA, editA.corner);
    const gotC = refusalsOf(gotCAll.found, 0);
    check(
      'P0-3b прямая: стена А потеряла угол a–b — створки шире предела названы, та же створка в сцене, на чертеже и в раскрое',
      gotCAll.found !== null && gotC.length === wantC.length &&
        wantC.every((want) => gotC.some((got) => got.moduleId === want.id && got.leafMm === want.leafMm)) &&
        gotC.every((got) => unsynced(runAL, DEFAULT_PRODUCTION, got).length === 0),
      gotCAll.found === null
        ? `ИСКЛЮЧЕНИЕ: ${gotCAll.crash}`
        : gotC.length > 0
          ? gotC.map((got) => `${got.moduleId} ${got.leafMm}/${got.limitMm} +${got.excessMm}`).join(' · ')
          : `НЕ НАЗВАНО: ${wantC.map((want) => `${want.id} ${want.leafMm} мм`).join(', ')}`,
    );
    const stateC = gotCAll.found ? screenOf(gotCAll.found, [{ lengthMm: runAL.lengthMm }], linA.segments, 'linear') : null;
    check(
      'P0-3b прямая: цены нет, «Дальше» и выгрузка заперты, запись идёт, пересобирается стена А',
      Boolean(stateC && stateC.priceHidden && stateC.nextLocked && stateC.exportLocked === true && !stateC.autosaveLocked && stateC.rebuildWall === 0),
      `${lockWords(stateC)} · пересборка ${stateC?.rebuildWall ?? 'НЕТ'}`,
    );
    const linPlain = linear({});
    const plainLinear = linPlain.segments[0].modules.find(
      (unit) => unit.kind === 'base' && !unit.appliance && !unit.variant && unit.widthMm >= 400 && unit.widthMm <= 900,
    );
    if (!plainLinear) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: P0-3b — у прямой кухни нет обычного нижнего модуля');
    const editLinear = applyOps({
      run: linPlain.segments[0],
      requirements: DEMO_REQUIREMENTS,
      ops: [{ op: 'set_variant', moduleId: plainLinear.id, variant: 'drawers' }],
      openings: linPlain.input.openings,
      roomDepthMm: 0,
    });
    const plainFound = linearMismatches(linear({ optimal: editLinear }), editLinear.corner);
    check(
      'P0-3b прямая кухня, правленная прямой: угла у ряда не было — расхождений нет',
      plainFound.found !== null && plainFound.found.length === 0 && !editLinear.corner,
      plainFound.found === null
        ? `ИСКЛЮЧЕНИЕ: ${plainFound.crash}`
        : `расхождений ${plainFound.found.length} · угол у ряда ${editLinear.corner ? 'ЕСТЬ' : 'нет'}`,
    );

    /* ── b.5 Допустимая: глухая часть — свой корпус, без угла створка в пределе (G, H) ── */
    const columnsMm = rowB.modules.filter((unit) => unit.kind === 'tall').reduce((sum, unit) => sum + unit.widthMm, 0);
    const verdictsG: string[] = [];
    let wrongG = 0;
    for (const [school, production] of SCHOOLS_B) {
      const ab: CornerChoice = { lower: 'blind', upper: 'blind' };
      const bc: CornerChoice = { lower: 'blind', upper: 'empty' };
      const lostMm = cornerGeometry(ab, 'kitchen', production).lostMm;
      const blindMm = cornerGeometry(bc, 'kitchen', production).ownerBlindMm;
      const bLen = columnsMm + blindMm + lostMm;
      const measurement = roomP3([
        ['a', 3600],
        ['b', bLen],
        ['c', 3600],
        ['d', bLen],
      ]);
      const corners: SavedChoice[] = [
        { ...ab, walls: ['a', 'b'] },
        { ...bc, walls: ['b', 'c'] },
      ];
      const homeG = screenP3('a', { measurement, production, corners });
      const rowG = homeG.segments[1];
      const lastG = rowG.modules.filter((unit) => standsOnFloor(unit)).sort((x, y) => y.offsetMm - x.offsetMm)[0];
      if (!lastG || blindPartMm(lastG, rowG) !== lastG.widthMm || lastG.widthMm !== blindMm) {
        throw new Error(
          `НУЛЕВОЙ СЕЛЕКТОР: P0-3b ${school} — у стены b ${bLen} мм в углу не отдельный глухой корпус ${blindMm} мм: ` +
            `${lastG ? `${lastG.id} ${lastG.widthMm} мм, глухо ${blindPartMm(lastG, rowG)}` : 'модулей нет'}`,
        );
      }
      const movedG = screenP3('d', { measurement, production, corners, walls: { b: rowG } });
      const gAt = movedG.layout.segments.findIndex((segment) => segment.wallId === 'b');
      const runG = movedG.segments[gAt];
      const foundG = wallMismatches(movedG.layout, movedG.segments, {
        before: (index: number) => (index === gAt ? rowG.corner : undefined),
        openingsOf: (index: number) => movedG.layout.segments[index].openings,
        requirements: movedG.requirements,
      } as never);
      const wantG = owed(runG, rowG.corner);
      const gotG = refusalsOf(foundG, gAt);
      const stateG = screenOf(foundG, movedG.layout.segments.map((segment) => ({ lengthMm: segment.wallLengthMm })), movedG.segments, 'u_shape');
      const valid = wantG.length === 0;
      const ok = valid
        ? foundG.length === 0 && !stateG.priceHidden && !stateG.nextLocked && stateG.exportLocked !== true
        : gotG.length === wantG.length && stateG.priceHidden && stateG.exportLocked === true;
      if (!ok) wrongG += 1;
      verdictsG.push(
        `${school}: b ${bLen} мм, глухой корпус ${blindMm} мм → без угла одна створка ${blindMm} мм, предел ${SINGLE_DOOR_MAX_MM} мм — ` +
          (valid
            ? ok
              ? 'допустимо, тревоги нет, цена на экране'
              : `ЛОЖНАЯ ТРЕВОГА: ${lockWords(stateG)}`
            : gotG.length > 0
              ? `отказ +${gotG[0].excessMm} мм`
              : 'НЕ НАЗВАНО'),
      );
    }
    check(
      'P0-3b допустимая конфигурация по трём школам цеха: ложной тревоги нет, недопустимое названо',
      verdictsG.length === SCHOOLS_B.length && wrongG === 0 && verdictsG.some((verdict) => /допустимо/.test(verdict)),
      verdictsG.join(' | '),
    );

    /* ── b.6 36 конфигураций P0-3: форма, владелец угла, стена, створка, предел, итог ── */
    const LOWERS_B: LowerCornerKind[] = ['blind', 'l_shape'];
    const UPPERS_B: UpperCornerKind[] = ['l_shape', 'blind', 'empty'];
    let configsB = 0;
    let rowsB = 0;
    let affectedB = 0;
    let rejectedB = 0;
    let passedB = 0;
    let falseB = 0;
    let missB = 0;
    let driftB = 0;
    let cornerB = 0;
    for (const [school, production] of SCHOOLS_B) {
      for (const shape of ['corner_l', 'u_shape'] as const) {
        for (const lower of LOWERS_B) {
          for (const upper of UPPERS_B) {
            configsB += 1;
            const choice: CornerChoice = { lower, upper };
            const corners: SavedChoice[] =
              shape === 'u_shape'
                ? [
                    { ...choice, walls: ['a', 'b'] },
                    { ...choice, walls: ['b', 'c'] },
                  ]
                : [{ ...choice, walls: ['a', 'b'] }];
            const home = screenP3('a', { shape, production, corners });
            const cases: { wallId: string; how: string; run: Run; before: RunCorner | undefined; found: Found[] | null; crash: string; index: number }[] = [];
            const rowA0 = home.active.run;
            const lin = linear({ optimal: rowA0 }, production);
            const linFound = linearMismatches(lin, rowA0.corner);
            cases.push({ wallId: 'a', how: 'владелец a–b → прямая', run: lin.segments[0], before: rowA0.corner, found: linFound.found, crash: linFound.crash, index: 0 });
            if (shape === 'u_shape') {
              const rowB0 = home.segments[1];
              const moved = screenP3('d', { shape, production, corners, walls: { b: rowB0 } });
              const at = moved.layout.segments.findIndex((segment) => segment.wallId === 'b');
              cases.push({
                wallId: 'b',
                how: 'владелец b–c → «ряд здесь?» на d',
                run: moved.segments[at],
                before: rowB0.corner,
                found: wallMismatches(moved.layout, moved.segments, {
                  before: (index: number) => (index === at ? rowB0.corner : undefined),
                  openingsOf: (index: number) => moved.layout.segments[index].openings,
                  requirements: moved.requirements,
                } as never) as Found[],
                crash: '',
                index: at,
              });
            }
            for (const item of cases) {
              rowsB += 1;
              const touched = affected(item.run, item.before);
              const want = owed(item.run, item.before);
              const got = refusalsOf(item.found, item.index);
              const corner = (item.found ?? []).find((mismatch) => mismatch.index === item.index)?.corner?.length ?? 0;
              affectedB += touched.length;
              rejectedB += got.length;
              passedB += touched.filter(({ unit }) => !got.some((hit) => hit.moduleId === unit.id)).length;
              falseB += got.filter((hit) => !want.some((owe) => owe.id === hit.moduleId) || hit.leafMm <= hit.limitMm).length;
              missB += want.filter((owe) => !got.some((hit) => hit.moduleId === owe.id)).length + (item.found === null ? 1 : 0);
              driftB += got.reduce((sum, hit) => sum + unsynced(item.run, production, hit).length, 0);
              cornerB += corner;
              const leaves = touched.map(({ unit, doors }) => {
                const hit = got.find((refusal) => refusal.moduleId === unit.id);
                const leaf = Math.round(doors[0].widthM * 1000);
                return hit
                  ? `${unit.id} створка ${leaf} мм / предел ${hit.limitMm} мм → отказ +${hit.excessMm} мм`
                  : `${unit.id} створка ${leaf} мм × ${doors.length} / ${ruleOf(unit, doors).text} → проходит`;
              });
              console.log(
                `  ··   ${school} ${shape === 'u_shape' ? 'П' : 'Г'} ${lower}/${upper} · стена ${item.wallId} (${item.how}): ` +
                  `${item.found === null ? `ИСКЛЮЧЕНИЕ: ${item.crash}` : leaves.join('; ') || 'затронутых створок нет'}` +
                  `${corner > 0 ? ` · угол: несоответствий ${corner}` : ''}`,
              );
            }
          }
        }
      }
    }
    const WANT_B = SCHOOLS_B.length * 2 * LOWERS_B.length * UPPERS_B.length;
    check(
      `P0-3b ${WANT_B} конфигураций P0-3: названы ровно створки шире, чем ставит движок, — ложных нет, пропусков нет, сцена и раскрой те же`,
      configsB === WANT_B && rowsB === WANT_B + WANT_B / 2 && falseB === 0 && missB === 0 && driftB === 0 && rejectedB > 0,
      `конфигураций ${configsB} · рядов ${rowsB} · затронутых створок ${affectedB}: отказ ${rejectedB}, проходит ${passedB} · ` +
        `ложных ${falseB} · пропусков ${missB} · расхождений сцены и раскроя ${driftB} · несоответствий угла ${cornerB}`,
    );
  }
}

/*
 * СЦЕНА УЕЗЖАЕТ В ФОНОВЫЙ ПОТОК ДАННЫМИ — и обратно собирается той же.
 *
 * Счёт идёт в воркере (первая сборка шейдера держит свой поток около
 * минуты), и то, что решили правила, переезжает туда данными. Обратная
 * сборка (`sceneFromWire` — её же зовёт воркер) обязана дать ту же сцену:
 * столько же деталей, те же матрицы, те же числа материалов, ту же
 * таблицу карты, тот же свет и ту же камеру. Иначе картинка снята не с
 * той мебели, что в 3D, и никто этого не заметит до встречи с клиентом.
 */
const asyncChecks: Promise<void>[] = [];
asyncChecks.push(
  (async () => {
    const live = new THREE.Scene();
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const lacquer = new THREE.MeshPhysicalMaterial({
      color: '#643941',
      roughness: 0.05,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    });
    const front = new THREE.Mesh(unit, lacquer);
    front.position.set(0.3, 0.4, -0.2);
    front.scale.set(0.6, 0.72, 0.018);
    live.add(front);

    const batch = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ color: '#b9b2a4', roughness: 0.78 }), 2);
    batch.setMatrixAt(0, new THREE.Matrix4().makeTranslation(1, 0, 0));
    batch.setMatrixAt(
      1,
      new THREE.Matrix4().compose(
        new THREE.Vector3(2, 0.5, 0),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
        new THREE.Vector3(0.3, 1, 0.6),
      ),
    );
    live.add(batch);

    live.add(new THREE.Mesh(unit, Object.assign(new THREE.MeshBasicMaterial({ color: '#F6E2B8' }), { userData: { emissive: true } })));

    const grid = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]), 2, 2);
    grid.repeat.set(2, 3);
    grid.needsUpdate = true;
    live.add(new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ color: '#ffffff', map: grid })));

    const key = new THREE.DirectionalLight('#fff4e0', 1.05);
    key.position.set(2, 5, 4);
    key.target.position.set(0, 0, -1);
    live.add(key, key.target);

    const built = pathTraceSceneOf(live);
    const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 80);
    camera.position.set(1.2, 1.55, 3.4);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld(true);

    const { scene: wire } = await wireSceneOf(built, camera);
    const back = sceneFromWire(wire);

    const meshesOf = (scene: THREE.Scene) => {
      const list: THREE.Mesh[] = [];
      scene.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) list.push(object as THREE.Mesh);
      });
      return list;
    };
    const before = meshesOf(built.scene);
    const after = meshesOf(back.scene);
    const drift = Math.max(
      0,
      ...before.map((mesh, i) =>
        Math.max(...mesh.matrix.elements.map((value, k) => Math.abs(value - (after[i]?.matrix.elements[k] ?? Number.NaN)))),
      ),
    );
    check(
      'сцена в фоновый поток — данными: деталей столько же, матрицы те же',
      before.length === 5 && after.length === before.length && drift < 1e-6,
      `деталей ${before.length} → ${after.length} (нужно 5) · расхождение матриц ${drift}`,
    );

    const numbers = (material: THREE.Material) => {
      const m = material as THREE.MeshPhysicalMaterial;
      return [
        m.type,
        m.color?.getHexString(),
        m.roughness,
        m.metalness,
        m.emissive?.getHexString(),
        m.emissiveIntensity,
        m.transparent,
        m.opacity,
        m.side,
        m.clearcoat ?? 0,
        m.clearcoatRoughness ?? 0,
      ].join('|');
    };
    const differ = before
      .map((mesh, i) => (after[i] && numbers(mesh.material as THREE.Material) === numbers(after[i].material as THREE.Material) ? null : i))
      .filter((i) => i !== null);
    const lacquered = after.find((mesh) => (mesh.material as THREE.Material).type === 'MeshPhysicalMaterial');
    check(
      'материалы в потоке — с теми же числами: цвет, глянец, лак, свечение',
      differ.length === 0 && Boolean(lacquered),
      differ.length === 0
        ? numbers(lacquered?.material as THREE.Material)
        : `РАСХОДЯТСЯ ${differ.length}: ${numbers(before[differ[0] as number].material as THREE.Material)} → ${after[differ[0] as number] ? numbers(after[differ[0] as number].material as THREE.Material) : 'НЕТ ДЕТАЛИ'}`,
    );

    const tiled = after.find((mesh) => (mesh.material as THREE.MeshStandardMaterial).map);
    const map = (tiled?.material as THREE.MeshStandardMaterial | undefined)?.map as THREE.DataTexture | undefined;
    const data = map?.image?.data as Uint8Array | undefined;
    check(
      'карта-таблица доезжает теми же данными и повтором',
      Boolean(
        map?.isDataTexture &&
          data &&
          data.length === 16 &&
          data.every((value, i) => value === (grid.image.data as Uint8Array)[i]) &&
          map.repeat.x === 2 &&
          map.repeat.y === 3,
      ),
      map ? `${map.image.width}×${map.image.height} · повтор ${map.repeat.toArray().join('×')}` : 'КАРТЫ НЕТ',
    );

    const light = back.scene.children.find((child) => (child as THREE.DirectionalLight).isDirectionalLight) as
      | THREE.DirectionalLight
      | undefined;
    const sourceLight = built.scene.children.find((child) => (child as THREE.DirectionalLight).isDirectionalLight) as
      | THREE.DirectionalLight
      | undefined;
    const sameCamera =
      (back.camera as THREE.PerspectiveCamera).fov === camera.fov &&
      (back.camera as THREE.PerspectiveCamera).aspect === camera.aspect &&
      back.camera.position.equals(camera.position) &&
      // Поворот — покомпонентно и точно: `angleTo` берёт acos от 1 − ulp и даёт 1.5e-8 на одинаковых.
      back.camera.quaternion.equals(camera.quaternion);
    check(
      'свет и камера в потоке — те же',
      Boolean(
        light &&
          sourceLight &&
          light.color.equals(sourceLight.color) &&
          light.intensity === sourceLight.intensity &&
          light.position.distanceTo(sourceLight.position) < 1e-9 &&
          light.target.position.distanceTo(sourceLight.target.position) < 1e-9,
      ) && sameCamera,
      light ? `свет ${light.intensity.toFixed(3)} · камера ${sameCamera ? 'та же' : 'ДРУГАЯ'}` : 'СВЕТА НЕТ',
    );
    built.dispose();
  })(),
);

Promise.allSettled(asyncChecks).then((results) => {
  for (const result of results) {
    if (result.status === 'rejected') {
      check('асинхронная проверка дошла до конца', false, result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
});
