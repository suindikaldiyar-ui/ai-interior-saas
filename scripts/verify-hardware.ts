/**
 * ПРИЁМКА ФУРНИТУРЫ ПРОИЗВОДИТЕЛЕЙ (HARDWARE-01). `npm run test:hardware`.
 *
 * Путь экрана: замер демо → `objectInput` (с каталогом фурнитуры) →
 * `composeVariants` → правка `applyOps` с тем же каталогом → правленый ряд
 * снова через `composeVariants` → детали `buildPanels` / `objectPanels`,
 * карта `cuttingPlan`, смета, сцена `runBoxes`, присадка `moduleDrilling`.
 * Каталог — строки, которые лягут в каталог организации из фактов
 * (`data/catalog/hardware.json` → `hardwareCatalogRow`), без правки руками.
 *
 * Числа ниже не подобраны под код: размеры короба выводятся из паспорта
 * (KA 4532: NL, монтажная ширина 12,7) и правил цеха фикстуры (боковина 16,
 * дно ХДФ 4 в паз 6, зазоры 10 и 30, ось направляющей 40) — расчёт
 * расписан у каждой проверки.
 */

import { DEFAULT_PRODUCTION, TYPICAL_CUTTING, type CatalogEntryFull, type CuttingSettings, type HardwareItem, type ProductionSettings } from '../types/catalog';
import type { Measurement, MillworkOp, Module, ModuleFill, Run, RunRequirements, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput, panelWallsOf, wallSegments } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { allModules } from '../lib/millwork/layout';
import { hardwareCatalog } from '../lib/millwork/hardware';
import {
  HARDWARE_FACTS,
  csvHardwareRows,
  hardwareCatalogRow,
  manufacturerArticleKey,
  planHardwareImport,
  uploadedFacts,
  type HardwareFact,
} from '../lib/millwork/hardwareCatalog';
import { fittingSlotsOf, fittingVerdict, slidingAccepts, slidingVerdict, slotAccepts } from '../lib/millwork/fittings';
import { buildPanels, objectPanels, type ObjectPanel } from '../lib/millwork/panels';
import { boxedDrawerCount, cuttingPlan, drawerCount } from '../lib/millwork/cutting';
import { drawerDrafts, moduleDrawerKits } from '../lib/millwork/drawerKit';
import { drawerReleaseBlock } from '../lib/millwork/bays';
import { buildEstimate, totalCaption, unpricedLines } from '../lib/millwork/estimate';
import { kupeLeaves, runBoxes, runPlaces, sceneLeaves, sceneSlides } from '../lib/millwork/cabinetBoxes';
import { moduleDrilling, panelDrilling } from '../lib/millwork/drilling';
import { configurationFingerprint } from '../lib/millwork/fingerprint';
import { DRILLING_UNREAD } from '../lib/millwork/drilling';
import { HARDWARE_LIGHT_FIELDS } from '../lib/catalog';
import { lightReferences } from '../lib/millwork/hardware';
import { hasDrawing, listPhoto, manufacturerPhotoLink, matchMediaFiles, mediaCoverage, mediaEntries, mediaViews, model3dStatusOf } from '../lib/millwork/hardwareMedia';
import type { CatalogAsset } from '../types/catalog';
import type { FittingSlot } from '../types/millwork';
import { handleChecks } from './verify-handles';
import { mechanismChecks } from './verify-mechanisms';
import { applianceChecks } from './verify-appliances';
import { drillingChecks } from './verify-drilling';
import { hinge3dChecks } from './verify-hinges3d';
import { runnerModelOf } from '../lib/millwork/runnerModel';
import { drillingPlan } from '../lib/millwork/drillingPlan';
import { drawerBoxPlan } from '../lib/millwork/drawerBox';
import { NO_SERIES, analogKeyOf, analogsOf, favoriteArticles, pushRecent, recentArticles, seriesOf, sizeMatches, toggleFavorite } from '../lib/millwork/hardwareAnalogs';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
}

/* ─────────────────────────  каталог из фактов  ───────────────────────── */

/** Строки каталога организации — тем же `hardwareCatalogRow`, что импорт; цена — 0, если не задана. */
function rowsOf(facts: HardwareFact[], patch: Record<string, { price?: number; saleUnit?: 'pair' | 'piece' | 'set' }> = {}): CatalogEntryFull[] {
  return facts.map((fact) => {
    const row = hardwareCatalogRow(fact);
    const own = patch[fact.article] ?? {};
    const hardware = own.saleUnit ? { ...fact.hardware, saleUnit: own.saleUnit } : fact.hardware;
    return {
      id: `hw:${fact.article}`,
      org_id: 'org-hw',
      category_id: 'cat-hardware',
      article: row.article,
      name_ru: row.name_ru,
      name_kk: row.name_kk,
      description: '',
      price: own.price ?? row.price,
      unit: row.unit,
      dimensions: {},
      tiling: {},
      meta: { hardware } as unknown as CatalogEntryFull['meta'],
      is_active: true,
      assets: [],
    } as unknown as CatalogEntryFull;
  });
}

const CATALOG = hardwareCatalog(rowsOf(HARDWARE_FACTS));
function item(article: string, catalog: Map<string, HardwareItem> = CATALOG): HardwareItem {
  const found = catalog.get(`hw:${article}`);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: позиции ${article} в фактах нет`);
  return found;
}

/* ─────────────────────────  кухня путём экрана  ───────────────────────── */

const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;

/** Правила короба цеха фикстуры — подтверждены цехом (кроме проверки без подтверждения). */
const RULES = {
  sideMm: 16,
  bottomMm: 4,
  bottomMaterial: 'hdf' as const,
  bottomMount: 'groove' as const,
  bottomGrooveMm: 6,
  gapBelowMm: 10,
  gapAboveMm: 30,
  runnerAxisMm: 40,
  edge: '0.4' as const,
  confirmed: true,
};
const SHOP: ProductionSettings = { ...DEFAULT_PRODUCTION, drawerBox: RULES };
/** Раскрой цеха подтверждён: в карте остаются только причины про ящики и листы. */
const CUT_SETTINGS: CuttingSettings = { ...TYPICAL_CUTTING, confirmed: true };

/** `null` — каталога фурнитуры нет вовсе: `undefined` взял бы значение по умолчанию, и проверка «без каталога» шла бы с каталогом. */
function kitchen(production: ProductionSettings = DEFAULT_PRODUCTION, hardware: Map<string, HardwareItem> | null = CATALOG) {
  const requirements = DEMO_REQUIREMENTS;
  const base = workspaceInput({ title: 'HW-01', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({
    base,
    resolution: null,
    requirements,
    rates: DEMO_RATES,
    production,
    milling: new Map(),
    carcass: new Map(),
    materials: new Map(),
    ...(hardware ? { hardware } : {}),
  });
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, DISABLED, edited).find((variant) => variant.key === 'optimal')!;
  const ops = (list: MillworkOp[], catalog: Map<string, HardwareItem> | null = hardware) => {
    const next = applyOps({ run: shown().run, requirements, ops: list, openings: input.openings, ...(catalog ? { hardware: catalog } : {}) });
    edited = { optimal: next };
    return { next, shown: shown() };
  };
  return { input, shown, ops, production };
}

/** Ящиков в модуле под варочной — по фронтам наполнения. */
function drawersOnHobOf(run: Run): number {
  return moduleOf(run, 'base-2700-hob@w1').fill?.drawerHeights.length ?? 0;
}

function moduleOf(run: Run, id: string): Module {
  const unit = allModules(run).find((m) => m.id === id);
  if (!unit) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${id} в ряду нет`);
  return unit;
}

const HOB = 'base-2700-hob@w1';
const DOOR = 'base-1200@w1';
const UPPER = 'upper-1200@w1';

/* ═════════════════════════  A. Факты производителей  ═════════════════════════ */

console.log('\nHW.A: факты производителей — артикул, страница, статус');
{
  const by = (manufacturer: string) => HARDWARE_FACTS.filter((fact) => fact.hardware.manufacturer === manufacturer).length;
  /*
   * HW-01 (2026-10-31): к трём маркам слоя 60 добавились BOYARD (каталоги 2024 и 11 библиотек БАЗИС), DTC
   * (AXERA, Pivot Star, Stylish, Top Stay, 10 листовок PURE-PRO, библиотека ТБМ), Firmax, Alphalux (ТБМ),
   * Unihopper (COKA) и МФ-Комплект (Var3e). Прежние три — те же до записи.
   */
  check(
    'A1 записей в фактах: Hettich 290, Blum 318, Häfele 591 (прежние), BOYARD 2762, DTC 892, Firmax 226, Alphalux 166, Unihopper 11, МФ-Комплект 8, всего 5264 — число не уменьшается молча',
    by('Hettich') === 290 && by('Blum') === 318 && by('Häfele') === 591 &&
      by('BOYARD') === 2762 && by('DTC') === 892 && by('Firmax') === 226 && by('Alphalux') === 166 && by('Unihopper') === 11 && by('МФ-Комплект') === 8 &&
      HARDWARE_FACTS.length === 5264,
    `Hettich ${by('Hettich')} · Blum ${by('Blum')} · Häfele ${by('Häfele')} · BOYARD ${by('BOYARD')} · DTC ${by('DTC')} · Firmax ${by('Firmax')} · Alphalux ${by('Alphalux')} · Unihopper ${by('Unihopper')} · МФ-Комплект ${by('МФ-Комплект')} · всего ${HARDWARE_FACTS.length}`,
  );
  const articles = HARDWARE_FACTS.map((fact) => fact.article);
  const broken = HARDWARE_FACTS.filter(
    (fact) =>
      !fact.article.startsWith('MFR-') ||
      !fact.hardware.source?.file ||
      !fact.hardware.source?.checkedAt ||
      /* Страница — у каталога; у базы номенклатуры библиотеки БАЗИС — запись внутри архива (`entry`). */
      (fact.hardware.source?.pdfPage === undefined && fact.hardware.source?.printedPage === undefined && !fact.hardware.source?.entry) ||
      !fact.hardware.engineeringStatus ||
      fact.hardware.rightsStatus !== 'NOT_VERIFIED' ||
      fact.hardware.visualStatus !== 'VISUAL_APPROXIMATION' ||
      /* Ключ генератора фактов и ключ загрузки — одна формула: иначе повтор своей выгрузки ляжет дублем. */
      fact.article !== manufacturerArticleKey(fact.hardware.manufacturer ?? '', fact.hardware.manufacturerArticle ?? ''),
  );
  check(
    'A2 у каждой записи артикул MFR-, файл и страница источника (у библиотеки БАЗИС — запись в архиве), дата сверки, статус; права не подтверждены; 3D — приближение',
    broken.length === 0 && new Set(articles).size === articles.length && rowsOf(HARDWARE_FACTS).every((row) => row.price === 0),
    `сломанных ${broken.length}${broken[0] ? ` (${broken[0].article})` : ''} · повторов ${articles.length - new Set(articles).size}`,
  );

  /* KA 4532 Silent System, HET печ. 1252 / PDF 1258: NL 300…700, KT = NL + 4, 12,7 мм, рейка 46, боковина корпуса ≥ 16. */
  const ka: [string, number][] = [
    ['9114271', 300], ['9114273', 350], ['9114274', 400], ['9114275', 450], ['9114276', 500],
    ['9114277', 550], ['9114278', 600], ['9114279', 650], ['9114280', 700],
  ];
  const kaWrong = ka.filter(([a, nl]) => {
    const d = item(`MFR-HETTICH-${a}`).hardware.dimensionsMm ?? {};
    return d.nominalLength !== nl || d.minCabinetDepth !== nl + 4 || d.sideClearance !== 12.7 || d.railHeight !== 46 || d.minCabinetSide !== 16;
  });
  check(
    'A3 KA 4532: девять артикулов, NL = 300…700, KT = NL + 4, монтажная ширина 12,7, рейка 46, боковина корпуса от 16 — как в таблице паспорта',
    kaWrong.length === 0 && !CATALOG.has('hw:MFR-HETTICH-9114272') && ka.every(([a]) => item(`MFR-HETTICH-${a}`).hardware.saleUnit === undefined),
    kaWrong.length ? `не совпало: ${kaWrong.map(([a]) => a).join(', ')}` : '9 из 9; 9 114 272 в источнике нет; «компл.» не расшифрован — единицы продажи нет',
  );

  const clip = item('MFR-BLUM-71B3550').hardware;
  check(
    'A4 Blum CLIP top 71B3550: TB 3–7, наложение по планкам MD 0/3/6/9 — 14–18, 11–15, 8–12, 5–9; чашка Ø35, глубина 13',
    JSON.stringify(clip.ranges) ===
      JSON.stringify({ boringDistance: [3, 7], overlayMd0: [14, 18], overlayMd3: [11, 15], overlayMd6: [8, 12], overlayMd9: [5, 9] }) &&
      clip.drilling?.some((d) => d.part === 'door' && d.diameterMm === 35 && d.depthMm === 13) === true,
    JSON.stringify(clip.ranges),
  );
  check(
    'A5 ответные планки Blum: 175H3100 — MD 0, 175H3130 — MD 3',
    item('MFR-BLUM-175H3100').hardware.dimensionsMm?.plateHeight === 0 && item('MFR-BLUM-175H3130').hardware.dimensionsMm?.plateHeight === 3,
    `${item('MFR-BLUM-175H3100').hardware.dimensionsMm?.plateHeight} / ${item('MFR-BLUM-175H3130').hardware.dimensionsMm?.plateHeight}`,
  );
  const hk = item('MFR-BLUM-22K2310').hardware;
  check(
    'A6 AVENTOS HK top 22K2310: LF 420–1610, KH 205–600, корпус до 1800, продаётся комплектом (2 силовых механизма)',
    JSON.stringify(hk.ranges?.powerFactor) === '[420,1610]' &&
      JSON.stringify(hk.ranges?.cabinetHeight) === '[205,600]' &&
      hk.dimensionsMm?.maxCabinetWidth === 1800 &&
      hk.saleUnit === 'set',
    JSON.stringify({ ranges: hk.ranges, dims: hk.dimensionsMm, sale: hk.saleUnit }),
  );

  /* MOVENTO 760H, Blum печ. 413 / pdf.js 417: «Необходимое пространство (глубина): NL + 3», боковина ящика max 16. */
  const movento = item('MFR-BLUM-760H5000S').hardware;
  check(
    'A7 Blum MOVENTO 760H5000S: скрытого монтажа, NL 500, глубина корпуса 503 по формуле паспорта NL + 3, боковина ящика до 16',
    movento.subcategory === 'undermount' &&
      movento.dimensionsMm?.nominalLength === 500 &&
      movento.dimensionsMm?.minCabinetDepth === 503 &&
      movento.dimensionsMm?.maxDrawerSide === 16 &&
      (movento.printed ?? []).some((p) => p.label.includes('NL + 3') && p.value === '503'),
    JSON.stringify({ sub: movento.subcategory, dims: movento.dimensionsMm }),
  );
  /* Häfele 422.25.507, KOMPAKT с. 64: «длина 500 мм», зазор 12,7 на чертеже; высота шины не читается — её нет. */
  const ball = item('MFR-HAFELE-422.25.507').hardware;
  check(
    'A8 Häfele 422.25.507: шариковая боковая, NL 500, монтажная ширина 12,7; высоты шины нет — не выдумана',
    ball.subcategory === 'side_mount' && ball.dimensionsMm?.nominalLength === 500 && ball.dimensionsMm?.sideClearance === 12.7 && ball.dimensionsMm?.railHeight === undefined,
    JSON.stringify({ sub: ball.subcategory, dims: ball.dimensionsMm }),
  );
  /* Metalla 510 SM 105°, KOMPAKT с. 44: тип — словом в варианте; таблицы наложения по планкам 2 / 4 / 6 при E 3…6. */
  const metalla = ['329.14.100', '329.14.101', '329.14.102'].map((a) => item(`MFR-HAFELE-${a}`).hardware);
  check(
    'A9 Häfele Metalla 510: накладная / полунакладная / вкладная по напечатанному варианту; FA при планке 2 мм у накладной 16–19, E 3–6',
    metalla.map((h) => h.subcategory).join() === 'overlay,half_overlay,inset' &&
      JSON.stringify(metalla[0].ranges?.overlayMd2) === '[16,19]' &&
      JSON.stringify(metalla[0].ranges?.overlayMd6) === '[12,15]' &&
      JSON.stringify(metalla[0].ranges?.boringDistance) === '[3,6]',
    metalla.map((h) => `${h.manufacturerArticle} ${h.subcategory} ${JSON.stringify(h.ranges)}`).join(' | '),
  );
  /* Free Fold / Free Flap / Free Space: «высота корпуса» в заголовке и «высота фасада» в колонке — спор источника, числа не сводятся. */
  const hafeleLifts = HARDWARE_FACTS.filter((f) => f.hardware.manufacturer === 'Häfele' && f.hardware.category === 'lift');
  const heightOfConflict = hafeleLifts.filter((f) => f.hardware.engineeringStatus === 'CONFLICT' && (f.hardware.ranges?.cabinetHeight || f.hardware.ranges?.frontHeight));
  const sized = hafeleLifts.filter((f) => f.hardware.ranges?.frontHeight);
  check(
    'A10 подъёмники Häfele: спорные высоты (CONFLICT) не сведены в подбор — ни одной; высота фасада сведена только у записей без спора',
    hafeleLifts.length === 125 && heightOfConflict.length === 0 && sized.length > 0 && sized.every((f) => f.hardware.engineeringStatus !== 'CONFLICT'),
    `подъёмников ${hafeleLifts.length} · спорных со сведённой высотой ${heightOfConflict.length} · с высотой фасада ${sized.length}`,
  );
  /* Повтор артикула: те же размеры — одна запись; другие размеры — спор источника словами. */
  const rail = item('MFR-HAFELE-400.52.954').hardware;
  const sink = item('MFR-HAFELE-545.48.262').hardware;
  const trouser = item('MFR-HAFELE-805.60.705').hardware;
  check(
    'A11 артикул напечатан дважды: шина 400.52.954 (те же размеры) — PARTIAL; 545.48.262 и 805.60.705 (другие изделия) — CONFLICT со словами',
    rail.engineeringStatus === 'PARTIAL' &&
      sink.engineeringStatus === 'CONFLICT' &&
      trouser.engineeringStatus === 'CONFLICT' &&
      /545\.48\.262/.test(sink.notes ?? '') &&
      /805\.60\.705/.test(trouser.notes ?? ''),
    `${rail.engineeringStatus} · ${sink.engineeringStatus} · ${trouser.engineeringStatus}`,
  );
}

/* ═════════════════════════  B. Импорт в каталог организации  ═════════════════════════ */

console.log('\nHW.B: импорт — что ляжет, повтор без дублей, своё компании цело');
{
  const empty = planHardwareImport([]);
  check('B1 пустой каталог: ляжет каждая запись, конфликтов нет', empty.insert.length === HARDWARE_FACTS.length && empty.conflicts.length === 0, `${empty.insert.length} из ${HARDWARE_FACTS.length}`);
  const existing = empty.insert.map((row, i) => ({ id: `r${i}`, article: row.article, meta: row.meta as unknown as Record<string, unknown> }));
  const again = planHardwareImport(existing);
  check('B2 повтор того же файла: 0 новых, 0 обновлений, все «без изменений»', again.insert.length === 0 && again.update.length === 0 && again.unchanged.length === HARDWARE_FACTS.length, `новых ${again.insert.length} · обновлений ${again.update.length} · без изменений ${again.unchanged.length}`);

  /* Компания указала единицу продажи у KA 500; факт поменялся — единица остаётся, цены и названия в плане нет вовсе. */
  const kaArticle = 'MFR-HETTICH-9114276';
  const kaFact = HARDWARE_FACTS.find((fact) => fact.article === kaArticle)!;
  const withSale = existing.map((row) =>
    row.article === kaArticle ? { ...row, meta: { ...row.meta, hardware: { ...(row.meta.hardware as object), saleUnit: 'pair', notes: 'старое' } } } : row,
  );
  const plan3 = planHardwareImport(withSale);
  const upd = plan3.update.find((row) => row.article === kaArticle);
  check(
    'B3 своя единица продажи компании переживает импорт; цена и название в обновление не входят',
    Boolean(upd) && (upd!.meta.hardware as { saleUnit?: string }).saleUnit === 'pair' && !('price' in upd!) && !('name_ru' in upd!) && plan3.update.length === 1,
    upd ? `обновлений ${plan3.update.length}, saleUnit ${(upd.meta.hardware as { saleUnit?: string }).saleUnit}` : 'ОБНОВЛЕНИЯ НЕТ',
  );
  const occupied = planHardwareImport([{ id: 'x', article: kaArticle, meta: { estimateKey: 'slide_standard' } }], [kaFact]);
  const doubled = planHardwareImport(
    [
      { id: 'a', article: kaArticle, meta: {} },
      { id: 'b', article: kaArticle, meta: {} },
    ],
    [kaFact],
  );
  check(
    'B4 артикул занят чужой позицией или задвоен — конфликт словами, строка не трогается',
    occupied.conflicts[0]?.why.includes('не из каталога производителя') === true && doubled.conflicts[0]?.why.includes('2 позиции') === true && occupied.update.length === 0,
    `${occupied.conflicts[0]?.why ?? 'НЕТ'} · ${doubled.conflicts[0]?.why ?? 'НЕТ'}`,
  );
  const csv = [
    'manufacturer;article;name;category;subcategory;series;saleUnit;packaging;engineeringStatus;sourceFile;pdfPage;printedPage;checkedAt;dimensions;ranges;missing',
    'Компания;K-1;Направляющая своя 450;slide;side_mount;Своя;pair;пара;;прайс;;;2026-10-21;nominalLength=450, sideClearance=13;;',
    'Компания;K-2;Петля своя;hinge;overlay;Своя;piece;шт;;;;;;;doorThickness=16..22;',
    'Компания;K-3;Неизвестное;lamp;;;;;;;;;;;;',
    'Компания;;Без артикула;hinge;;;;;;;;;;;;',
  ].join('\n');
  const upload = uploadedFacts(csvHardwareRows(csv));
  const k1 = upload.facts.find((fact) => fact.article === 'MFR-KOMPANIYA-K-1');
  check(
    'B5 своя пачка CSV: 2 строки приняты с размерами, «lamp» и строка без артикула отклонены словами',
    upload.facts.length === 2 &&
      upload.errors.length === 2 &&
      k1?.hardware.dimensionsMm?.nominalLength === 450 &&
      k1?.hardware.saleUnit === 'pair' &&
      upload.errors.some((e) => e.why.includes('lamp')) &&
      upload.errors.some((e) => e.why.includes('артикула')),
    `принято ${upload.facts.length} (${upload.facts.map((f) => f.article).join(', ')}) · отклонено: ${upload.errors.map((e) => `${e.article}: ${e.why}`).join(' | ')}`,
  );

  /* Выгрузка фактов как есть (`{ article, name, hardware }`) — та же пачка: повтор не даёт ни новых, ни обновлений. */
  const sample = HARDWARE_FACTS;
  const reread = uploadedFacts(JSON.parse(JSON.stringify(sample)));
  const loaded = sample.map((fact, i) => ({ id: `row-${i}`, article: fact.article, meta: hardwareCatalogRow(fact).meta as Record<string, unknown> }));
  const replay = planHardwareImport(loaded, reread.facts);
  check(
    'B6 JSON в форме фактов читается обратно: те же артикулы, повтор — 0 новых и 0 обновлений',
    sample.length === HARDWARE_FACTS.length &&
      reread.errors.length === 0 &&
      reread.facts.map((f) => f.article).join() === sample.map((f) => f.article).join() &&
      replay.insert.length === 0 &&
      replay.update.length === 0 &&
      replay.unchanged.length === sample.length,
    `записей ${sample.length} · принято ${reread.facts.length} · новых ${replay.insert.length} · обновлений ${replay.update.length} · без изменений ${replay.unchanged.length}${reread.errors[0] ? ` · ${reread.errors[0].why}` : ''}`,
  );
  const k1Source = k1?.hardware.source;
  const k2 = upload.facts.find((fact) => fact.article === 'MFR-KOMPANIYA-K-2');
  check(
    'B7 дата сверки — из файла; не указана — «не указано», а не сегодняшняя',
    k1Source?.checkedAt === '2026-10-21' && k2 !== undefined && k2.hardware.source === undefined,
    `K-1 ${k1Source?.checkedAt ?? 'НЕТ'} · K-2 источник ${k2?.hardware.source ? JSON.stringify(k2.hardware.source) : 'не указан'}`,
  );
  const dated = uploadedFacts(
    csvHardwareRows(['manufacturer;article;name;category;sourceFile;pdfPage', 'Компания;K-9;Опора;carcass;прайс.pdf;3'].join('\n')),
  );
  const both = uploadedFacts(
    csvHardwareRows(['manufacturer;article;name;category', 'Боярд;K-1;Петля;hinge', 'Компания;K-1;Петля;hinge', 'Häfele;K-1;Петля;hinge'].join('\n')),
  );
  check(
    'B8 источник без даты — «не указано»; производители кириллицей не сливаются: «Боярд» и «Компания» с артикулом K-1 — разные строки',
    dated.facts[0]?.hardware.source?.checkedAt === 'не указано' &&
      both.facts.map((f) => f.article).join() === 'MFR-BOYARD-K-1,MFR-KOMPANIYA-K-1,MFR-HAFELE-K-1',
    `${dated.facts[0]?.hardware.source?.checkedAt ?? 'НЕТ'} · ${both.facts.map((f) => f.article).join(', ')}`,
  );
}

/* ═════════════════════════  C. Места и совместимость  ═════════════════════════ */

console.log('\nHW.C: места модуля и проверка совместимости по паспорту');
{
  const k = kitchen();
  const run = k.shown().run;
  const slots = (id: string) => fittingSlotsOf(moduleOf(run, id), run, DEFAULT_PRODUCTION).map((s) => `${s.slot}:${s.quantity}`).join(',');
  check(
    'C1 места: под варочной — направляющие 2 пары, ручки 2, опоры 4; дверца 450 — петли 2, планки 2, ручка 1, опоры 4; у вытяжки мест нет',
    slots(HOB) === 'slide:2,handle:2,leg:4' && slots(DOOR) === 'hinge:2,hinge_plate:2,handle:1,leg:4' && slots('upper-2700-hood@w1') === '',
    `${slots(HOB)} | ${slots(DOOR)} | вытяжка «${slots('upper-2700-hood@w1')}»`,
  );
  /* Полезная глубина = 560 − припуск цеха 20 = 540. */
  const v500 = fittingVerdict({ unit: moduleOf(run, HOB), run, slot: 'slide', item: item('MFR-HETTICH-9114276'), production: DEFAULT_PRODUCTION, catalog: CATALOG });
  const v550 = fittingVerdict({ unit: moduleOf(run, HOB), run, slot: 'slide', item: item('MFR-HETTICH-9114277'), production: DEFAULT_PRODUCTION, catalog: CATALOG });
  check(
    'C2 KA 4532 NL 500 в корпусе 560 (полезно 540): NL 500 ≤ 540, KT 504 ≤ 540 — встаёт; правил короба нет — «не проверено»',
    v500.state === 'unverified' && v500.checks.filter((c) => c.state === 'fail').length === 0 && v500.checks.some((c) => c.words.includes('правил короба цеха нет')),
    v500.summary,
  );
  check(
    'C3 KA 4532 NL 550: нужно 550 мм, есть 540 — отказ «не хватает 10 мм»',
    v550.state === 'refused' && v550.summary.includes('не хватает 10 мм'),
    v550.summary,
  );
  const before = JSON.stringify(run.modules);
  const refused = k.ops([{ op: 'set_fitting', moduleId: HOB, slot: 'slide', itemId: item('MFR-HETTICH-9114277').id }]);
  check(
    'C4 «Установить» NL 550 — операция отказывает словами, ряд прежний',
    refused.next.warnings.some((w) => w.includes('не хватает 10 мм')) && JSON.stringify(refused.next.modules) === before,
    refused.next.warnings[0] ?? 'ОТКАЗА НЕТ',
  );
  const noCatalog = kitchen(DEFAULT_PRODUCTION, null).ops([{ op: 'set_fitting', moduleId: HOB, slot: 'slide', itemId: item('MFR-HETTICH-9114276').id }]);
  check('C5 без каталога фурнитуры позиция не ставится: «проверить нечем»', noCatalog.next.warnings.some((w) => w.includes('проверить нечем')), noCatalog.next.warnings[0] ?? 'ОТКАЗА НЕТ');

  /* Наложение FA = корпус 16 − зазор 4 = 12: MD 3 (11–15) и MD 6 (8–12) дают его, MD 0 (14–18) — нет. */
  const hinge = item('MFR-BLUM-71B3550');
  const onDoor = (r: Run) => fittingVerdict({ unit: moduleOf(r, DOOR), run: r, slot: 'hinge', item: hinge, production: DEFAULT_PRODUCTION, catalog: CATALOG });
  const vNoPlate = onDoor(run);
  const withMd3 = kitchen();
  withMd3.ops([{ op: 'set_fitting', moduleId: DOOR, slot: 'hinge_plate', itemId: item('MFR-BLUM-175H3130').id }]);
  const vMd3 = onDoor(withMd3.shown().run);
  const withMd0 = kitchen();
  withMd0.ops([{ op: 'set_fitting', moduleId: DOOR, slot: 'hinge_plate', itemId: item('MFR-BLUM-175H3100').id }]);
  const vMd0 = onDoor(withMd0.shown().run);
  check(
    'C6 CLIP top на накладной дверце, FA 12: без планки «подойдёт MD 3, 6»; планка MD 3 — TB = 12 − 11 + 3 = 4 мм; планка MD 0 — отказ',
    vNoPlate.state === 'unverified' &&
      vNoPlate.checks.some((c) => c.words.includes('подойдёт MD 3, 6')) &&
      vMd3.checks.some((c) => c.state === 'ok' && c.words.includes('TB = 4 мм')) &&
      vMd0.state === 'refused' &&
      vMd0.summary.includes('MD 0'),
    `${vNoPlate.checks.find((c) => c.label === 'наложение')?.words} | ${vMd3.checks.find((c) => c.label === 'наложение')?.words} | ${vMd0.summary}`,
  );
  const inset = HARDWARE_FACTS.find((fact) => fact.hardware.manufacturer === 'Blum' && fact.hardware.subcategory === 'inset');
  if (!inset) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: вкладной петли Blum в фактах нет');
  const vInset = fittingVerdict({ unit: moduleOf(run, DOOR), run, slot: 'hinge', item: item(inset.article), production: DEFAULT_PRODUCTION, catalog: CATALOG });
  check('C7 вкладная петля на накладную дверцу — отказ словами', vInset.state === 'refused' && vInset.summary.includes('вкладная петля'), `${inset.hardware.manufacturerArticle}: ${vInset.summary}`);

  /* Верхний шкаф 300 × 720 с подъёмником. */
  const lift = kitchen();
  lift.ops([{ op: 'set_opening', moduleId: UPPER, opening: 'lift' }]);
  const liftRun = lift.shown().run;
  const onUpper = (article: string) =>
    fittingVerdict({ unit: moduleOf(liftRun, UPPER), run: liftRun, slot: 'lift', item: item(article), production: DEFAULT_PRODUCTION, catalog: CATALOG });
  const hkTop = onUpper('MFR-BLUM-22K2310');
  const hsTop = onUpper('MFR-BLUM-22S2800');
  const hfTop = onUpper('MFR-BLUM-22F2500');
  check(
    'C8 подъёмник на шкафу 720: HK top (KH 205–600) — отказ «больше на 120 мм»; HS top (KH 650–800) — встаёт, вес фасада не проверен; HF — отказ: фасад из двух частей',
    hkTop.state === 'refused' && hkTop.summary.includes('больше на 120') && hsTop.state === 'unverified' && hfTop.state === 'refused' && hfTop.summary.includes('двух частей'),
    `${hkTop.summary} | ${hsTop.summary} | ${hfTop.summary}`,
  );
  /*
   * СКЛАДНОЙ FREE FOLD — ТОТ ЖЕ ОТКАЗ, ЧТО У HF (ЭТАП 2). Проверка искала буквы
   * «hf» в подвиде и пропускала складной Häfele (`bifold_lift`): он ставился на
   * цельный фасад как поворотный подъёмник. Путь экрана — `set_fitting`.
   */
  /* Именно Häfele, как сказано в строке: складные DTC (ST) пришли в факты позже — их отказ ниже, отдельным числом. */
  const freeFold = HARDWARE_FACTS.find((f) => f.hardware.manufacturer === 'Häfele' && f.hardware.subcategory === 'bifold_lift');
  if (!freeFold) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: складного FREE FOLD Häfele в фактах нет');
  const vFold = onUpper(freeFold.article);
  /*
   * Любой складной любого производителя на цельный фасад — тот же отказ. Сводка
   * называет первую несошедшуюся проверку (у DTC ST01 — высоту фасада), поэтому
   * «двух частей» ищется среди проверок, а не в сводке.
   */
  const allFolds = HARDWARE_FACTS.filter((f) => f.hardware.subcategory === 'bifold_lift');
  const foldsLet = allFolds.filter((f) => {
    const v = onUpper(f.article);
    return !(v.state === 'refused' && v.checks.some((c) => c.state === 'fail' && c.words.includes('двух частей')));
  });
  const foldTried = lift.ops([{ op: 'set_fitting', moduleId: UPPER, slot: 'lift', itemId: item(freeFold.article).id }]);
  const foldKept = moduleOf(foldTried.shown.run, UPPER).fittings?.some((f) => f.slot === 'lift') ?? false;
  check(
    'C8б складной FREE FOLD Häfele на цельный фасад — отказ «фасад из двух частей», и путём экрана позиция не встаёт; HS top — «ход не построен» словами',
    vFold.state === 'refused' &&
      vFold.summary.includes('двух частей') &&
      !foldKept &&
      foldTried.next.warnings.some((w) => w.includes('двух частей')) &&
      allFolds.length > 1 &&
      foldsLet.length === 0 &&
      hsTop.checks.some((c) => c.label === 'ход' && c.state === 'unknown' && c.words.includes('не построен')),
    `${freeFold.hardware.manufacturerArticle}: ${vFold.summary} · на модуле ${foldKept ? 'ВСТАЛ' : 'нет'} · ${foldTried.next.warnings.join(' | ')} · складных всего ${allFolds.length}, не отказано ${foldsLet.length}${foldsLet.length ? ': ' + foldsLet.map((f) => f.hardware.manufacturerArticle).join(', ') : ''}`,
  );
  const wrongSlot = fittingVerdict({ unit: moduleOf(run, DOOR), run, slot: 'hinge', item: item('MFR-HETTICH-9114276'), production: DEFAULT_PRODUCTION, catalog: CATALOG });
  const accessory = HARDWARE_FACTS.find((fact) => fact.hardware.subcategory === 'lift_accessory');
  check(
    'C9 направляющая на место петель и принадлежность подъёмника на место механизма — отказ: «ставится на другое место»',
    wrongSlot.state === 'refused' && wrongSlot.summary.includes('другое место') && Boolean(accessory) &&
      onUpper(accessory!.article).state === 'refused',
    `${wrongSlot.summary} | ${accessory ? onUpper(accessory.article).summary : 'принадлежностей нет'}`,
  );

  /* Принадлежность — не изделие места: стабилизатор не направляющая, прокладка не планка, шина не система купе. */
  const runnerAccessories = HARDWARE_FACTS.filter((f) => f.hardware.category === 'slide' && f.hardware.subcategory === 'runner_accessory');
  const spacers = HARDWARE_FACTS.filter((f) => f.hardware.category === 'hinge' && /spacer/.test(f.hardware.variant ?? ''));
  const railFact = HARDWARE_FACTS.find((f) => f.hardware.subcategory === 'sliding_rail');
  const kitFact = HARDWARE_FACTS.find((f) => slidingAccepts(f));
  if (!railFact || !kitFact || runnerAccessories.length === 0 || spacers.length === 0) {
    throw new Error('НУЛЕВОЙ СЕЛЕКТОР: нет принадлежностей направляющих, прокладок планок, шины или комплекта купе');
  }
  const kupe = { ...run, doorSystem: 'sliding' as const };
  const vRail = slidingVerdict(kupe, item(railFact.article), DEFAULT_PRODUCTION);
  const vKit = slidingVerdict(kupe, item(kitFact.article), DEFAULT_PRODUCTION);
  check(
    'C10 принадлежности на место изделия не встают: стабилизаторы и упоры (12) — не направляющая, прокладки (4) — не планка, шина — не система купе',
    runnerAccessories.length === 12 &&
      runnerAccessories.every((f) => !slotAccepts('slide', f)) &&
      spacers.length === 4 &&
      spacers.every((f) => !slotAccepts('hinge_plate', f) && !slotAccepts('hinge', f)) &&
      vRail.state === 'refused' &&
      vRail.summary.includes('часть системы') &&
      vKit.state !== 'refused',
    `принадлежностей ${runnerAccessories.length} · прокладок ${spacers.length} · ${vRail.summary} | ${kitFact.hardware.manufacturerArticle}: ${vKit.summary}`,
  );
  /* Metalla на накладной дверце: FA 12 даёт планка 6 мм (12–15), вкладная — отказ. */
  const vMetalla = fittingVerdict({ unit: moduleOf(run, DOOR), run, slot: 'hinge', item: item('MFR-HAFELE-329.14.100'), production: DEFAULT_PRODUCTION, catalog: CATALOG });
  const vMetallaInset = fittingVerdict({ unit: moduleOf(run, DOOR), run, slot: 'hinge', item: item('MFR-HAFELE-329.14.102'), production: DEFAULT_PRODUCTION, catalog: CATALOG });
  check(
    'C11 Häfele Metalla 510 на накладной дверце, FA 12: без планки «подойдёт MD 6»; вкладная 329.14.102 — отказ словами',
    vMetalla.state === 'unverified' && vMetalla.checks.some((c) => c.words.includes('подойдёт MD 6')) && vMetallaInset.state === 'refused' && vMetallaInset.summary.includes('вкладная'),
    `${vMetalla.checks.find((c) => c.label === 'наложение')?.words} | ${vMetallaInset.summary}`,
  );
}

/* ═════════════════════════  D. Ящики: направляющая + короб цеха  ═════════════════════════ */

console.log('\nHW.D: ящики — направляющая из каталога, короб по правилам цеха, раскрой, карта, 3D, присадка');
{
  const words = (rows: { name: string; lengthMm: number; widthMm: number; thicknessMm: number; qty: number }[]) =>
    rows.map((p) => `${p.name} ${p.lengthMm}×${p.widthMm}×${p.thicknessMm}·${p.qty}`).join(' | ');
  const boxNames = new Set(['Боковина ящика', 'Торец ящика', 'Дно ящика']);

  /* Без правил цеха: короба нет нигде, карта заперта по ящикам — как в CUT-01. */
  const plain = kitchen();
  plain.ops([{ op: 'set_fitting', moduleId: HOB, slot: 'slide', itemId: item('MFR-HETTICH-9114276').id }]);
  const plainParts = objectPanels({ walls: panelWallsOf(null, wallSegments(null, plain.shown().run, {}), plain.input.runWallId), hardware: CATALOG });
  const plainPlan = cuttingPlan({ parts: plainParts, settings: CUT_SETTINGS, fingerprint: 'x' });
  check(
    'D1 без правил короба цеха: в раскрое ни одной детали короба, карта «Ящиков 2: короба в раскрое нет»',
    plainParts.every((p) => !boxNames.has(p.name)) && plainPlan.drawers === 2 && plainPlan.release.reasons.some((r) => r.startsWith('Ящиков 2:')),
    `${plainPlan.drawers} · ${plainPlan.release.reasons.find((r) => r.startsWith('Ящиков')) ?? 'ПРИЧИНЫ НЕТ'}`,
  );

  /* Правила цеха + KA 500. Зоны: верхний фронт 140 → 580…704 (планки 16), нижний 580 → 16…580.
   * Высота короба = зона − 10 − 30: 84 и 524. Ширина = 568 − 2 × 12,7 = 542,6; торцы 542,6 − 32 = 510,6.
   * Дно в паз 6: (510,6 + 12) × (500 − 32 + 12) = 522,6 × 480, ХДФ 4. */
  const k = kitchen(SHOP);
  const fitted = k.ops([{ op: 'set_fitting', moduleId: HOB, slot: 'slide', itemId: item('MFR-HETTICH-9114276').id }]);
  const run = fitted.shown.run;
  const boxes = buildPanels({ run, production: SHOP, hardware: CATALOG }).filter((p) => p.moduleId === HOB && boxNames.has(p.name));
  check(
    'D2 короба двух ящиков в раскрое: боковины 500×84 и 500×524, торцы 510.6, дно ХДФ 522.6×480 в паз',
    words(boxes) ===
      'Боковина ящика 500×84×16·2 | Торец ящика 510.6×84×16·2 | Дно ящика 522.6×480×4·2 | Боковина ящика 500×524×16·2 | Торец ящика 510.6×524×16·2',
    words(boxes) || 'КОРОБОВ НЕТ',
  );
  const ids = boxes.flatMap((p) => p.partIds ?? []);
  check(
    'D3 у каждой детали короба свой ИД ящика: боковин 4, торцов 4, днищ 2, без повторов',
    ids.length === 10 && new Set(ids).size === 10 && ids.filter((id) => id.includes(':box:side:')).length === 4 && ids.filter((id) => id.endsWith(':box:bottom')).length === 2,
    ids.join(' '),
  );
  const parts = objectPanels({ walls: panelWallsOf(null, wallSegments(null, run, {}), k.input.runWallId), production: SHOP, hardware: CATALOG });
  const plan = cuttingPlan({ parts, settings: CUT_SETTINGS, fingerprint: 'x' });
  check(
    'D4 карта раскроя: фронтов ящиков 2, коробов 2 — причины «Ящиков …» нет',
    drawerCount(parts) === 2 && boxedDrawerCount(parts) === 2 && plan.drawers === 0 && !plan.release.reasons.some((r) => r.startsWith('Ящиков')),
    `фронтов ${drawerCount(parts)} · коробов ${boxedDrawerCount(parts)} · ${plan.release.reasons.find((r) => r.startsWith('Ящиков')) ?? 'причины нет'}`,
  );
  const unconfirmed: ProductionSettings = { ...DEFAULT_PRODUCTION, drawerBox: { ...RULES, confirmed: false } };
  const drafts = drawerDrafts([{ ...run, production: unconfirmed }], CATALOG, unconfirmed);
  const planU = cuttingPlan({
    parts,
    settings: CUT_SETTINGS,
    fingerprint: 'x',
    drawerBoxUnconfirmed: drafts.unconfirmed,
  });
  check(
    'D5 правила короба не подтверждены цехом: коробов 2 рассчитаны, выпуск заперт словами',
    drafts.boxes === 2 && drafts.unconfirmed === 2 && planU.release.reasons.some((r) => r.includes('не подтверждённым цехом')),
    `${JSON.stringify(drafts)} · ${planU.release.reasons.find((r) => r.includes('цехом')) ?? 'ПРИЧИНЫ НЕТ'}`,
  );
  const mounts = (['inset', 'under'] as const).map((bottomMount) => {
    const shop = { ...DEFAULT_PRODUCTION, drawerBox: { ...RULES, bottomMount, bottomGrooveMm: 0 } };
    return words(buildPanels({ run, production: shop, hardware: CATALOG }).filter((p) => p.moduleId === HOB && boxNames.has(p.name)));
  });
  check(
    'D6 дно вкладное заподлицо — 510.6×468; накладное снизу — 542.6×500, стенки ниже на толщину дна (80 и 520)',
    mounts[0].includes('Дно ящика 510.6×468×4·2') && mounts[1].includes('Дно ящика 542.6×500×4·2') && mounts[1].includes('Боковина ящика 500×80×16·2') && mounts[1].includes('Торец ящика 510.6×520×16·2'),
    `${mounts[0]} || ${mounts[1]}`,
  );

  /* Сцена — те же детали: ИД коробок сцены = ИД деталей раскроя; направляющая — 4 куска на ящик. */
  const scene = runBoxes({ ...run, production: SHOP }, { thicknessMm: 16, frontThicknessMm: 16, gapMm: 4, hardware: CATALOG });
  const sceneIds = scene.filter((b) => b.partId?.includes(':box:')).map((b) => b.partId!).sort();
  const runners = scene.filter((b) => b.node === 'runner');
  check(
    /* HW-04: у KA 4532 полное выдвижение — три секции на сторону (корпусная, средняя, ходовая), было две. */
    'D7 3D: коробки короба несут ИД деталей раскроя (10 = 10); направляющих 12 кусков (три секции на сторону): 4 ходовых и 4 средних едут с ящиком (средние — на половину хода), 4 на корпусе стоят',
    JSON.stringify(sceneIds) === JSON.stringify([...ids].sort()) &&
      runners.length === 12 &&
      runners.filter((b) => b.part?.startsWith(`${HOB}:drawer:`) && b.slideShare === undefined).length === 4 &&
      runners.filter((b) => b.part?.startsWith(`${HOB}:drawer:`) && b.slideShare === 0.5).length === 4 &&
      runners.filter((b) => !b.part).length === 4,
    `ИД сцены ${sceneIds.length} · направляющих ${runners.length} (ходовых ${runners.filter((b) => b.part).length})`,
  );

  /* Присадка: цепочка 37 / 128 / 96 / 64 → 37, 165, 261, 325 от передней кромки; по высоте — зона + 10 + 40: 630 и 66. */
  const drilling = moduleDrilling(moduleOf(run, HOB), { ...run, production: SHOP }, SHOP, CATALOG).filter((d) => d.slot === 'slide');
  const cab = drilling.flatMap((d) => d.holes.filter((h) => h.panel === 'Боковина'));
  check(
    'D8 присадка направляющих: на боковине корпуса 37/165/261/325 на высотах 630 и 66; диаметр под винт не напечатан — DRILLING_NOT_VERIFIED',
    drilling.length === 2 &&
      drilling.every((d) => d.status === 'DRILLING_NOT_VERIFIED' && d.missing.some((m) => m.includes('диаметр отверстия на корпусе не напечатан'))) &&
      JSON.stringify(Array.from(new Set(cab.map((h) => h.fromFrontMm)))) === '[37,165,261,325]' &&
      JSON.stringify(Array.from(new Set(cab.map((h) => h.heightMm))).sort((a, b) => (a ?? 0) - (b ?? 0))) === '[66,630]',
    drilling.map((d) => `${d.title}: ${d.status}`).join(' | '),
  );
  /* Карточка детали: строки присадки — той же moduleDrilling, по имени детали раскроя. */
  const allDrilling = moduleDrilling(moduleOf(run, HOB), { ...run, production: SHOP }, SHOP, CATALOG);
  const sideCard = panelDrilling(allDrilling, 'Боковина');
  const boxCard = panelDrilling(allDrilling, 'Боковина ящика');
  const bottomCard = panelDrilling(allDrilling, 'Дно ящика');
  check(
    'D11 карточка детали: у боковины корпуса и у боковины ящика по строке на ящик (2), DRILLING_NOT_VERIFIED, места по паспорту и чего нет; у дна ящика — ни одной',
    sideCard.length === 2 &&
      boxCard.length === 2 &&
      bottomCard.length === 0 &&
      [...sideCard, ...boxCard].every((line) => line.status === 'DRILLING_NOT_VERIFIED' && line.missing.length > 0) &&
      sideCard.every((line) => line.known.includes('от передней кромки 37 / 165 / 261 / 325 мм')) &&
      sideCard[0].known.includes('по высоте 630 мм') &&
      sideCard[1].known.includes('по высоте 66 мм'),
    sideCard.map((line) => `${line.title}: ${line.known}`).join(' | '),
  );

  /* Смета: короб — детали раскроя; общие «Направляющие» −2; строка позиции — «цена не задана» (единица «компл.» не расшифрована). */
  const est0 = kitchen(SHOP).shown().estimate;
  const est1 = fitted.shown.estimate;
  const line = (e: typeof est0, key: string) => e.lines.find((l) => l.key === key);
  const fitLine = est1.lines.find((l) => l.key.startsWith('fitting_slide_'));
  check(
    'D9 смета: «Направляющие» 2 → нет, строка KA 500 — 2, «цена не задана»; ЛДСП 16.14 → 17.37, ХДФ 5.8 → 6.3, кромка 71.92 → 75.97 (ЭТАП 4: +1.10 — торцы опор духового шкафа в пенале); итог «неполный»',
    line(est0, 'slide_soft_close')?.quantity === 2 &&
      !line(est1, 'slide_soft_close') &&
      fitLine?.quantity === 2 &&
      Boolean(fitLine?.priceUnset?.includes('1/10 компл.')) &&
      line(est0, 'ldsp_carcass')?.quantity === 16.14 &&
      line(est1, 'ldsp_carcass')?.quantity === 17.37 &&
      line(est1, 'hdf_back')?.quantity === 6.3 &&
      line(est0, 'pvc_edge')?.quantity === 71.92 &&
      line(est1, 'pvc_edge')?.quantity === 75.97 &&
      unpricedLines(est1).length > 0 &&
      totalCaption(est1).includes('неполный'),
    `${fitLine ? `${fitLine.title} ${fitLine.quantity} · ${fitLine.priceUnset}` : 'СТРОКИ НЕТ'} · ЛДСП ${line(est0, 'ldsp_carcass')?.quantity} → ${line(est1, 'ldsp_carcass')?.quantity} · ХДФ ${line(est1, 'hdf_back')?.quantity} · кромка ${line(est0, 'pvc_edge')?.quantity} → ${line(est1, 'pvc_edge')?.quantity} · итог ${Math.round(est1.total)} «${totalCaption(est1)}»`,
  );

  /* Ящики стали дверцей: позиция на модуле остаётся, последствие названо. */
  const door = kitchen(SHOP);
  door.ops([{ op: 'set_variant', moduleId: 'base-3300@w1', variant: 'drawers' }]);
  const doorRun = door.ops([{ op: 'set_fitting', moduleId: 'base-3300@w1', slot: 'slide', itemId: item('MFR-HETTICH-9114276').id }]);
  const back = door.ops([{ op: 'set_variant', moduleId: 'base-3300@w1', variant: 'door' }]);
  check(
    'D10 модуль с направляющими сменили на дверцу: позиция осталась на модуле, сказано «после правки не встаёт»',
    doorRun.next.warnings.length === 0 &&
      moduleOf(back.next, 'base-3300@w1').fittings?.some((f) => f.slot === 'slide') === true &&
      back.next.warnings.some((w) => w.includes('после правки не встаёт')),
    back.next.warnings.find((w) => w.includes('после правки')) ?? `ПРЕДУПРЕЖДЕНИЯ НЕТ: ${back.next.warnings.join(' | ')}`,
  );
}

/* ═════════════════════════  E. Ящики отсеков (шкаф)  ═════════════════════════ */

console.log('\nHW.E: ящики отсеков — направляющая блока, короб, смета, выпуск');
{
  const R_REQ: RunRequirements = { ...DEMO_REQUIREMENTS, zone: 'bedroom', mode: 'free', appliances: [], sections: [] };
  const wardrobe = (production: ProductionSettings) => {
    const measurement: Measurement = {
      id: 'hw-e',
      ceilingHeightMm: 2500,
      walls: [{ id: 'w1', lengthMm: 3000, angleDeg: 90, openings: [] }],
      comms: [],
      photos: [],
      measuredBy: 'HW-01',
      measuredAt: '2026-10-21',
      notes: '',
    };
    const input = workspaceInput({ title: 'HW-E', zone: 'Спальня', measurement, requirements: R_REQ, rates: DEMO_RATES, wallId: 'w1', cornerAt: null, production, hardware: CATALOG });
    let edited: Partial<Record<VariantKey, Run>> = {};
    const shown = () => composeVariants(input, DISABLED, edited).find((v) => v.key === 'optimal')!;
    const ops = (list: MillworkOp[]) => {
      const next = applyOps({ run: shown().run, requirements: R_REQ, ops: list, openings: input.openings, hardware: CATALOG });
      edited = { optimal: next };
      return next;
    };
    const start = shown().run;
    const cabinet = start.modules.find((m) => m.section === 'shelves');
    if (!cabinet) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: в ряду спальни нет шкафа «Полки»');
    ops(start.modules.filter((m) => m.offsetMm > cabinet.offsetMm).map((m) => ({ op: 'remove_module' as const, moduleId: m.id })));
    ops([{ op: 'set_width', moduleId: cabinet.id, widthMm: 1000 }]);
    const unit = shown().run.modules.find((m) => m.id === cabinet.id)!;
    const stack = { id: 'd1', fromMm: 0, heightMm: 600, drawers: { mode: 'even', count: 3 }, front: 'inset', slideItemId: item('MFR-HETTICH-9114276').id };
    const fill = {
      ...unit.fill!,
      shelves: [],
      dividerMm: 0,
      rodsMm: [],
      drawerHeights: [],
      bays: [
        { id: 'b1', widthMm: 476, shelves: { mode: 'even', count: 4 } },
        { id: 'b2', shelves: { mode: 'even', count: 0 }, drawers: stack },
      ],
    } as unknown as ModuleFill;
    const next = ops([{ op: 'set_fill', moduleId: cabinet.id, fill }]);
    return { run: shown().run, next, id: cabinet.id, estimate: shown().estimate };
  };
  const w = wardrobe(SHOP);
  const bayBoxes = buildPanels({ run: w.run, production: SHOP, hardware: CATALOG }).filter((p) => p.moduleId === w.id && p.bayId === 'b2' && p.name.includes('ящика'));
  /* Отсек b2 в свету 476 (1000 − 2×16 − 476 − 16): ширина короба 476 − 25,4 = 450,6, торцы 450,6 − 2×16 = 418,6, дно в паз 418,6 + 2×6 = 430,6; длина дна 500 − 2×16 + 2×6 = 480; зоны по 200 → короб 160. */
  const bayWords = bayBoxes.map((p) => `${p.name} ${p.lengthMm}×${p.widthMm}·${p.qty}`).join(' | ');
  check(
    'E1 три ящика отсека b2 на KA 500: боковины 500×160·6, торцы 418.6×160·6, днища 430.6×480·3 — по отсеку',
    w.next.warnings.length === 0 && bayWords.includes('Боковина ящика 500×160·6') && bayWords.includes('Торец ящика 418.6×160·6') && bayWords.includes('Дно ящика 430.6×480·3'),
    bayWords || `КОРОБОВ НЕТ · ${w.next.warnings.join(' | ')}`,
  );
  const est = w.estimate;
  check(
    'E2 смета отсеков: оценки «Ящики отсеков в сборе» нет (короб в раскрое), строка направляющей — 3, «цена не задана»',
    !est.lines.some((l) => l.key === 'bay_drawer_box') &&
      est.lines.some((l) => l.key === `hardware_${item('MFR-HETTICH-9114276').id}_slides` && l.quantity === 3 && Boolean(l.priceUnset)),
    est.lines.filter((l) => /drawer|slide/.test(l.key)).map((l) => `${l.key} ${l.quantity}${l.priceUnset ? ' (цена не задана)' : ''}`).join(' | '),
  );
  check(
    'E3 выпуск: правила подтверждены — замка ящиков отсеков нет; правила не подтверждены — заперт словами; без каталога — как раньше черновик',
    drawerReleaseBlock([w.run], { hardware: CATALOG, production: SHOP }) === null &&
      (drawerReleaseBlock([w.run], { hardware: CATALOG, production: { ...SHOP, drawerBox: { ...RULES, confirmed: false } } }) ?? '').includes('не подтверждены') &&
      (drawerReleaseBlock([w.run]) ?? '').includes('черновик'),
    `${drawerReleaseBlock([w.run], { hardware: CATALOG, production: SHOP }) ?? 'null'}`,
  );
  const kits = moduleDrawerKits(moduleOf(w.run, w.id), w.run, SHOP, CATALOG);
  check('E4 комплект ящика отсека — фасад вкладной: KT паспорта (для накладного) не применяется, короб есть у всех 3', kits.length === 3 && kits.every((kit) => kit.state === 'box' && !kit.place.overlay), kits.map((kit) => kit.state).join(','));
}

/* ═════════════════════════  F. Смета позиций и цена  ═════════════════════════ */

console.log('\nHW.F: смета — строка позиции, вычет из общей, «цена не задана», не ноль');
{
  const k = kitchen();
  const before = k.shown().estimate;
  const hingeLine = (e: typeof before) => e.lines.find((l) => l.key.startsWith('hinge_') && l.key !== 'hinge_corner_175');
  const after = k.ops([{ op: 'set_fitting', moduleId: DOOR, slot: 'hinge', itemId: item('MFR-BLUM-71B3550').id }]).shown.estimate;
  const own = after.lines.find((l) => l.key.startsWith('fitting_hinge_'));
  const plates = after.lines.find((l) => l.key === 'fitting_hinge_plate_missing');
  check(
    'F1 петля Blum на дверце 450: общие петли −2, своя строка 2 шт., ответные планки «не выбраны» — 2 шт. без цены',
    (hingeLine(before)?.quantity ?? 0) - (hingeLine(after)?.quantity ?? 0) === 2 && own?.quantity === 2 && plates?.quantity === 2 && Boolean(plates?.priceUnset),
    `${hingeLine(before)?.quantity} → ${hingeLine(after)?.quantity} · ${own?.title} ${own?.quantity} · ${plates?.title} ${plates?.quantity}`,
  );
  /* Hettich 9 073 605 «50 шт.» — единица продажи штука; цена компании 1 500 ₸. */
  const priced = hardwareCatalog(rowsOf(HARDWARE_FACTS, { 'MFR-HETTICH-9073605': { price: 1500 } }));
  const kp = kitchen(DEFAULT_PRODUCTION, priced);
  const paid = kp.ops([{ op: 'set_fitting', moduleId: DOOR, slot: 'hinge', itemId: item('MFR-HETTICH-9073605', priced).id }]).shown.estimate;
  const paidLine = paid.lines.find((l) => l.key.startsWith('fitting_hinge_') && !l.key.endsWith('_missing'));
  check(
    'F2 цена компании задана (1 500 ₸ за штуку): строка 2 × 1 500 = 3 000 ₸',
    paidLine?.quantity === 2 && paidLine.rate === 1500 && paidLine.total === 3000 && !paidLine.priceUnset,
    paidLine ? `${paidLine.quantity} × ${paidLine.rate} = ${paidLine.total}` : 'СТРОКИ НЕТ',
  );
  const zero = after.lines.find((l) => l.key.startsWith('fitting_hinge_') && !l.key.endsWith('_missing'));
  check(
    'F3 цены нет — «цена не задана», не 0 ₸: строка в «неполных», итог «неполный»',
    Boolean(zero?.priceUnset) && zero?.total === 0 && unpricedLines(after).some((l) => l.key === zero?.key) && totalCaption(after).includes('неполный'),
    `${zero?.priceUnset ?? 'ЦЕНА ЕСТЬ'} · «${totalCaption(after)}»`,
  );
}

/* ═════════════════════════  G. Отпечаток, купе, без фурнитуры — прежнее  ═════════════════════════ */

console.log('\nHW.G: отпечаток, система купе, ряды без фурнитуры не едут');
{
  const plainInput = kitchen(DEFAULT_PRODUCTION, null).shown();
  const withCatalog = kitchen(SHOP).shown();
  check(
    'G1 каталог и правила короба без установленной фурнитуры: итог и отпечаток прежние (1 910 297 ₸, 50239c81)',
    /*
     * Демо 1 901 192 → 1 910 297 ₸ и 7a46ede4 → 50239c81 (ЭТАП 4): полка
     * кладовки над холодильником по её высоте (смета та же) и полки-опоры
     * духового шкафа в пенале (+9 105 ₸: полки 0.61 м², кромка 1.10 м, распил).
     */
    Math.round(plainInput.estimate.total) === 1910297 && Math.round(withCatalog.estimate.total) === 1910297 && plainInput.run.fingerprint === '50239c81' && withCatalog.run.fingerprint === '50239c81',
    `${Math.round(plainInput.estimate.total)} / ${Math.round(withCatalog.estimate.total)} · ${plainInput.run.fingerprint} / ${withCatalog.run.fingerprint}`,
  );
  const k = kitchen();
  const on = k.ops([{ op: 'set_fitting', moduleId: HOB, slot: 'slide', itemId: item('MFR-HETTICH-9114276').id }]).next;
  const off = k.ops([{ op: 'set_fitting', moduleId: HOB, slot: 'slide', itemId: null }]).next;
  check(
    'G2 позиция на месте меняет отпечаток; снятая — отпечаток прежний, поля fittings нет',
    on.fingerprint !== '50239c81' && off.fingerprint === '50239c81' && moduleOf(off, HOB).fittings === undefined && configurationFingerprint(off.modules) === configurationFingerprint(plainInput.run.modules),
    `${on.fingerprint} → ${off.fingerprint}`,
  );
  const sliding = HARDWARE_FACTS.find((fact) => slidingAccepts(fact));
  if (!sliding) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: системы купе в фактах нет');
  const kitchenVerdict = slidingVerdict(withCatalog.run, item(sliding.article), DEFAULT_PRODUCTION);
  const wardrobeRun = { ...withCatalog.run, doorSystem: 'sliding' as const };
  const wardrobeVerdict = slidingVerdict(wardrobeRun, item(sliding.article), DEFAULT_PRODUCTION);
  check(
    'G3 система купе: на кухне с распашными — отказ; на ряду купе — «не проверено»: толщина и вес полотна в продукте не заданы',
    kitchenVerdict.state === 'refused' && kitchenVerdict.summary.includes('распашные') && wardrobeVerdict.state !== 'fits' && wardrobeVerdict.checks.some((c) => c.words.includes('вес полотна')),
    `${kitchenVerdict.summary} | ${wardrobeVerdict.summary}`,
  );
}

/* ═════════════════════════  H. 3D и движение механизмов  ═════════════════════════ */

console.log('\nHW.H: 3D и движение — механизм по позиции на месте (VISUAL_APPROXIMATION), ход считает движок');
{
  const sceneOf = (r: Run) => runBoxes(r, { thicknessMm: 16, frontThicknessMm: 16, gapMm: 4, hardware: CATALOG });
  const within = (r: Run, id: string, boxes: { position: [number, number, number]; scale: [number, number, number] }[]) => {
    const place = runPlaces(r).find((entry) => entry.unit.id === id);
    if (!place) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${id} нет в раскладке`);
    const x0 = place.x - 1e-6;
    const x1 = place.x + place.unit.widthMm / 1000 + 1e-6;
    return boxes.every((b) => b.position[0] - b.scale[0] / 2 >= x0 && b.position[0] + b.scale[0] / 2 <= x1);
  };

  /* Петли: чашки на ключе полотна — открылась створка, они едут с ней (сцена рисует их с полотном). */
  const hk = kitchen();
  hk.ops([{ op: 'set_fitting', moduleId: DOOR, slot: 'hinge', itemId: item('MFR-BLUM-71B3550').id }]);
  const r1 = hk.shown().run;
  const cups = sceneOf(r1).filter((b) => b.node === 'hinge' && b.part?.startsWith(`${DOOR}:door:`));
  const hingeSlot = fittingSlotsOf(moduleOf(r1, DOOR), r1, DEFAULT_PRODUCTION).find((slot) => slot.slot === 'hinge');
  check(
    'H1 петли: чашек на дверце 450 столько же, сколько петель на месте (2), каждая на ключе полотна — едет с ним',
    hingeSlot?.quantity === 2 && cups.length === 2,
    `мест под петли ${hingeSlot?.quantity ?? 'НЕТ'} · чашек на полотне ${cups.length}`,
  );

  /* Подъёмник: без позиции механизма в сцене нет; с позицией — корпуса у боковин и рычаги на ключе фасада. */
  const lk = kitchen();
  lk.ops([{ op: 'set_opening', moduleId: UPPER, opening: 'lift' }]);
  const liftBefore = sceneOf(lk.shown().run).filter((b) => b.node === 'lift').length;
  const liftOn = lk.ops([{ op: 'set_fitting', moduleId: UPPER, slot: 'lift', itemId: item('MFR-BLUM-22S2800').id }]);
  const liftBoxes = sceneOf(liftOn.shown.run).filter((b) => b.node === 'lift');
  const housings = liftBoxes.filter((b) => !b.part);
  const arms = liftBoxes.filter((b) => b.part === `${UPPER}:door:0`);
  /* Правка нижнего ряда пересобирает верхний: позиция на месте обязана пережить пересборку. */
  const liftKept = lk.ops([{ op: 'set_handle', moduleId: DOOR, handle: 'profile' } as unknown as MillworkOp]);
  const keptFitting = moduleOf(liftKept.shown.run, UPPER).fittings?.find((f) => f.slot === 'lift')?.itemId;
  check(
    'H2 подъёмник: без позиции — 0 коробок механизма; HS top 22S2800 на месте — 2 корпуса у боковин (стоят) и 2 рычага на ключе фасада (едут), все в габарите модуля; правка нижнего ряда позицию не теряет',
    liftBefore === 0 &&
      liftOn.next.warnings.length === 0 &&
      housings.length === 2 &&
      arms.length === 2 &&
      within(liftOn.shown.run, UPPER, liftBoxes) &&
      keptFitting === item('MFR-BLUM-22S2800').id,
    `до ${liftBefore} · корпусов ${housings.length} · рычагов ${arms.length} · после правки низа ${keptFitting ?? 'ПОЗИЦИИ НЕТ'} · ${liftOn.next.warnings.join(' | ')}`,
  );

  /* Карго: фасад не открывается, а выдвигается; корзины на ключе фасада. Своя кухня — свободная сборка с одним модулем. */
  const FREE: RunRequirements = { ...DEMO_REQUIREMENTS, mode: 'free', appliances: [] };
  const freeInput = workspaceInput({ title: 'HW-H', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements: FREE, rates: DEMO_RATES, cornerAt: null, hardware: CATALOG });
  let freeEdited: Partial<Record<VariantKey, Run>> = {};
  const freeShown = () => composeVariants(freeInput, DISABLED, freeEdited).find((v) => v.key === 'optimal')!.run;
  const freeOps = (list: MillworkOp[]) => {
    const next = applyOps({ run: freeShown(), requirements: FREE, ops: list, openings: freeInput.openings, hardware: CATALOG });
    freeEdited = { optimal: next };
    return next;
  };
  freeOps([{ op: 'add_module', kind: 'base', widthMm: 200, variant: 'cargo' }]);
  const cargoUnit = freeShown().modules.find((m) => m.variant === 'cargo');
  if (!cargoUnit) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: карго 200 не встало в свободную сборку');
  const tallOnBase = fittingVerdict({ unit: cargoUnit, run: freeShown(), slot: 'cargo', item: item('MFR-HAFELE-548.91.462'), production: DEFAULT_PRODUCTION, catalog: CATALOG });
  /* 547.10.481L: «264 мм для корпуса 200» — источник спорит сам с собой: ширина сошлась, но «встаёт» не говорим. */
  const conflictVerdict = fittingVerdict({ unit: cargoUnit, run: freeShown(), slot: 'cargo', item: item('MFR-HAFELE-547.10.481L'), production: DEFAULT_PRODUCTION, catalog: CATALOG });
  const cargoOn = freeOps([{ op: 'set_fitting', moduleId: cargoUnit.id, slot: 'cargo', itemId: item('MFR-HAFELE-547.10.481L').id }]);
  const cargoRun = freeShown();
  const cargoPlace = runPlaces(cargoRun).find((entry) => entry.unit.id === cargoUnit.id)!;
  const cargoLeaves = sceneLeaves(cargoPlace.unit, cargoPlace.heightM);
  const cargoBoxes = sceneOf(cargoRun).filter((b) => b.part === `${cargoUnit.id}:door:0`);
  const baskets = cargoBoxes.filter((b) => b.node === 'basket');
  check(
    'H3 карго 200: высокое карго на нижний модуль — отказ словами; 547.10.481L (источник спорит — «не проверено») ставится; фасад выдвигается (pullout), 2 корзины × 3 коробки едут с фасадом, петель нет',
    tallOnBase.state === 'refused' &&
      tallOnBase.summary.includes('высокое карго') &&
      conflictVerdict.state === 'unverified' &&
      conflictVerdict.checks.some((c) => c.label === 'источник' && c.words.includes('противоречат')) &&
      cargoOn.warnings.length === 0 &&
      cargoLeaves.length === 1 &&
      cargoLeaves[0].kind === 'pullout' &&
      baskets.length === 6 &&
      cargoBoxes.some((b) => b.material === 'front') &&
      !sceneOf(cargoRun).some((b) => b.node === 'hinge' && b.part?.startsWith(cargoUnit.id)),
    `${tallOnBase.summary} · створок ${cargoLeaves.map((l) => l.kind).join(',')} · корзин ${baskets.length} · ${cargoOn.warnings.join(' | ')}`,
  );

  /*
   * Сушилка: в шкафу над мойкой, неподвижна. В демо над мойкой окно — верхнего
   * шкафа там нет; та же стена без окна, тот же путь экрана.
   */
  const noWindow = { ...DEMO_MEASUREMENT, walls: DEMO_MEASUREMENT.walls.map((wall) => ({ ...wall, openings: [] })) };
  const dInput = workspaceInput({ title: 'HW-H', zone: 'Кухня', measurement: noWindow, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null, hardware: CATALOG });
  let dEdited: Partial<Record<VariantKey, Run>> = {};
  const dShown = () => composeVariants(dInput, DISABLED, dEdited).find((v) => v.key === 'optimal')!.run;
  const dOps = (list: MillworkOp[]) => {
    const next = applyOps({ run: dShown(), requirements: DEMO_REQUIREMENTS, ops: list, openings: dInput.openings, hardware: CATALOG });
    dEdited = { optimal: next };
    return { next, shown: { run: dShown() } };
  };
  const dRun = dShown();
  const sink = dRun.modules.find((m) => m.appliance?.startsWith('sink'));
  if (!sink) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: мойки в ряду нет');
  const mid = sink.offsetMm + sink.widthMm / 2;
  const over = dRun.upperSegments.flatMap((sg) => sg.modules).find((u) => u.offsetMm <= mid && u.offsetMm + u.widthMm >= mid && u.section !== 'mezzanine');
  if (!over) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: над мойкой нет верхнего шкафа');
  const dryVariant = dOps([{ op: 'set_variant', moduleId: over.id, variant: 'upper_dryer' }]);
  const dryOn = dOps([{ op: 'set_fitting', moduleId: over.id, slot: 'dryer', itemId: item('MFR-HAFELE-544.07.206').id }]);
  const racks = sceneOf(dryOn.shown.run).filter((b) => b.node === 'dryer');
  const plainDoor = dRun.modules.find((m) => !m.appliance && m.frontType === 'door');
  if (!plainDoor) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: в ряду нет нижней дверцы для правки');
  const dryKept = dOps([{ op: 'set_handle', moduleId: plainDoor.id, handle: 'profile' } as unknown as MillworkOp]);
  check(
    'H4 сушилка 544.07.206 в шкафу над мойкой: две решётки — 2 поддона и 16 прутков, неподвижны, в габарите шкафа; правка нижнего ряда позицию не теряет',
    dryVariant.next.warnings.length === 0 &&
      dryOn.next.warnings.length === 0 &&
      racks.length === 18 &&
      racks.every((b) => !b.part) &&
      within(dryOn.shown.run, over.id, racks) &&
      moduleOf(dryKept.shown.run, over.id).fittings?.some((f) => f.slot === 'dryer') === true,
    `${over.id} ${over.widthMm} · коробок ${racks.length} · ${[...dryVariant.next.warnings, ...dryOn.next.warnings].join(' | ')}`,
  );

  /* Пантограф и купе: шкаф спальни 1000, отсек b1 со штангой (476 в свету), система купе ряда. */
  const W_REQ: RunRequirements = { ...DEMO_REQUIREMENTS, zone: 'bedroom', mode: 'free', appliances: [], sections: [] };
  const measurement: Measurement = {
    id: 'hw-h',
    ceilingHeightMm: 2500,
    walls: [{ id: 'w1', lengthMm: 3000, angleDeg: 90, openings: [] }],
    comms: [],
    photos: [],
    measuredBy: 'HW-01',
    measuredAt: '2026-10-21',
    notes: '',
  };
  const wInput = workspaceInput({ title: 'HW-H', zone: 'Спальня', measurement, requirements: W_REQ, rates: DEMO_RATES, wallId: 'w1', cornerAt: null, production: SHOP, hardware: CATALOG });
  let wEdited: Partial<Record<VariantKey, Run>> = {};
  const wShown = () => composeVariants(wInput, DISABLED, wEdited).find((v) => v.key === 'optimal')!;
  const wOps = (list: MillworkOp[]) => {
    const next = applyOps({ run: wShown().run, requirements: W_REQ, ops: list, openings: wInput.openings, hardware: CATALOG });
    wEdited = { optimal: next };
    return next;
  };
  const start = wShown().run;
  const cabinet = start.modules.find((m) => m.section === 'shelves');
  if (!cabinet) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: в ряду спальни нет шкафа «Полки»');
  wOps(start.modules.filter((m) => m.offsetMm > cabinet.offsetMm).map((m) => ({ op: 'remove_module' as const, moduleId: m.id })));
  wOps([{ op: 'set_width', moduleId: cabinet.id, widthMm: 1000 }]);
  const unit = wShown().run.modules.find((m) => m.id === cabinet.id)!;
  const fill = {
    ...unit.fill!,
    shelves: [],
    dividerMm: 0,
    rodsMm: [],
    drawerHeights: [],
    bays: [
      { id: 'b1', widthMm: 476, shelves: { mode: 'even', count: 0 }, zones: [{ id: 'z1', rod: { belowTopMm: 60 } }] },
      { id: 'b2', shelves: { mode: 'even', count: 4 } },
    ],
  } as unknown as ModuleFill;
  const fillOn = wOps([{ op: 'set_fill', moduleId: cabinet.id, fill }]);
  const rodsBefore = sceneOf(wShown().run).filter((b) => b.node === 'rod' && b.bayId === 'b1').length;
  const rodLineBefore = wShown().estimate.lines.find((l) => l.key === 'bay_rod')?.quantity ?? 0;
  const pgOn = wOps([{ op: 'set_fitting', moduleId: cabinet.id, slot: 'pantograph', bayId: 'b1', itemId: item('MFR-HAFELE-805.20.625').id }]);
  const pgRun = wShown().run;
  const pgBoxes = sceneOf(pgRun).filter((b) => b.node === 'pantograph' && b.bayId === 'b1');
  const pgMoving = pgBoxes.filter((b) => b.part === `${cabinet.id}:b1:pantograph`);
  const pgSlide = sceneSlides(pgRun, CATALOG).find((slide) => slide.id === `${cabinet.id}:b1:pantograph`);
  const pgEstimate = wShown().estimate;
  check(
    'H5 пантограф 805.20.625 в отсеке b1 (476 в свету при паспорте 440–610): штанга отсека в сцене и в смете уступает ему место; штанга с тягами (3) едет вниз и вперёд, кронштейны (2) стоят; строка позиции 1 шт. «цена не задана»',
    fillOn.warnings.length === 0 &&
      pgOn.warnings.length === 0 &&
      rodsBefore === 1 &&
      rodLineBefore > 0 &&
      sceneOf(pgRun).filter((b) => b.node === 'rod' && b.bayId === 'b1').length === 0 &&
      !pgEstimate.lines.some((l) => l.key === 'bay_rod') &&
      pgMoving.length === 3 &&
      pgBoxes.length - pgMoving.length === 2 &&
      pgSlide !== undefined &&
      pgSlide.vectorM[1] < 0 &&
      pgSlide.vectorM[2] > 0 &&
      pgEstimate.lines.some((l) => l.key === `fitting_pantograph_${item('MFR-HAFELE-805.20.625').id}` && l.quantity === 1 && Boolean(l.priceUnset)),
    `штанг b1 до ${rodsBefore} · строка штанг до ${rodLineBefore} · подвижных ${pgMoving.length} · стоят ${pgBoxes.length - pgMoving.length} · ход ${JSON.stringify(pgSlide?.vectorM ?? null)} · ${[...fillOn.warnings, ...pgOn.warnings].join(' | ')}`,
  );

  /* Выдвижная штанга 807.61.774 (длина 410 по паспорту) в пустом отсеке b2: едет вперёд на 0,9 длины, направляющая стоит. */
  const poOn = wOps([{ op: 'set_fitting', moduleId: cabinet.id, slot: 'wardrobe_pullout', bayId: 'b2', itemId: item('MFR-HAFELE-807.61.774').id }]);
  const poRun = wShown().run;
  const poBoxes = sceneOf(poRun).filter((b) => b.node === 'pullout' && b.bayId === 'b2');
  const poMoving = poBoxes.filter((b) => b.part === `${cabinet.id}:b2:pullout`);
  const poSlide = sceneSlides(poRun, CATALOG).find((slide) => slide.id === `${cabinet.id}:b2:pullout`);
  check(
    'H7 выдвижная штанга 807.61.774 в отсеке b2: штанга длиной 410 по паспорту едет вперёд на 369 мм, направляющая под крышей стоит',
    poOn.warnings.length === 0 &&
      poMoving.length === 1 &&
      poBoxes.length === 2 &&
      Math.abs(poMoving[0].scale[2] - 0.41) < 1e-9 &&
      poSlide !== undefined &&
      JSON.stringify(poSlide.vectorM) === JSON.stringify([0, 0, 0.369]),
    `коробок ${poBoxes.length} (едет ${poMoving.length}) · длина ${poMoving[0]?.scale[2]} · ход ${JSON.stringify(poSlide?.vectorM ?? null)} · ${poOn.warnings.join(' | ')}`,
  );

  const kit = HARDWARE_FACTS.find((fact) => slidingAccepts(fact));
  if (!kit) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: комплекта купе в фактах нет');
  const kupeBefore = sceneOf(wShown().run).filter((b) => b.panel === 'Дверь-купе').length;
  const kupeOn = wOps([{ op: 'set_sliding_system', itemId: item(kit.article).id }]);
  const kRun = wShown().run;
  const leaves = kupeLeaves(kRun, CATALOG);
  const doorBoxes = sceneOf(kRun).filter((b) => b.panel === 'Дверь-купе');
  const tracks = sceneOf(kRun).filter((b) => b.node === 'track');
  const L = kRun.lengthMm;
  const doorsWanted = wShown().estimate.lines.find((l) => l.key === 'sliding_system')?.quantity;
  const insideAfter = leaves.every((leaf) => leaf.x0Mm + leaf.slideMm >= -0.5 && leaf.x1Mm + leaf.slideMm <= L + 0.5);
  check(
    'H6 купе: без системы полотен в сцене нет; комплект на ряду — полотен столько же, сколько комплектов в смете (3 на 3000), шин 2; каждое полотно едет вбок и остаётся в длине ряда',
    kRun.doorSystem === 'sliding' &&
      kupeBefore === 0 &&
      kupeOn.warnings.length === 0 &&
      leaves.length === 3 &&
      doorsWanted === 3 &&
      doorBoxes.length === 3 &&
      tracks.length === 2 &&
      insideAfter &&
      sceneSlides(kRun, CATALOG).filter((slide) => slide.id.includes(':kupe:')).length === 3,
    `ряд ${kRun.doorSystem} · до ${kupeBefore} · полотен ${leaves.length} (смета ${doorsWanted ?? 'НЕТ'}) · шин ${tracks.length} · в длине ${insideAfter} · ${kupeOn.warnings.join(' | ')}`,
  );
}


/* ═════════════  I. Изображения, статус 3D, пакет файлов, лёгкое чтение (HARDWARE-PHOTO-PERF-01)  ═════════════ */

console.log('\nHW.I: изображения позиции, статус 3D, пакет файлов, лёгкое чтение каталога');
{
  const day = '2026-10-21';
  /* Адрес файла в фикстуре — уже адрес: `catalogUrl` отдаёт его как есть, Supabase тесту не нужен. */
  const at = (path: string) => `https://storage.test/catalog/${path}`;
  const asset = (role: string, kind: 'photo' | 'swatch', path: string) =>
    ({ id: `${role}-${kind}`, item_id: 'x', kind, role, storage_path: at(path), sort_order: 0 }) as CatalogAsset;

  const parsed = mediaEntries([
    { role: 'hw-1', kind: 'EXACT_PRODUCT', rights: 'VERIFIED', rightsNote: 'своя съёмка', checkedAt: day, primary: true },
    /* Права не проверены: роль файла отбрасывается, остаётся ссылка. */
    { role: 'hw-2', kind: 'SERIES_REFERENCE', rights: 'NOT_VERIFIED', sourceUrl: 'https://example.test/series', checkedAt: day },
    /* Ни файла (права ограничены), ни ссылки — изображения нет. */
    { role: 'hw-3', kind: 'EXACT_PRODUCT', rights: 'RESTRICTED', checkedAt: day },
    { role: 'hw-4', kind: 'PHOTO', rights: 'VERIFIED', checkedAt: day },
    { role: 'hw-5', kind: 'EXACT_PRODUCT', rights: 'VERIFIED' },
    { kind: 'EXACT_PRODUCT', rights: 'NOT_VERIFIED', sourceUrl: 'http://example.test/plain', checkedAt: day },
    { kind: 'TECHNICAL_DRAWING', rights: 'NOT_VERIFIED', sourceUrl: 'https://example.test/drawing', checkedAt: day },
    'мусор',
    null,
  ]);
  check(
    'I1 разбор meta.media: без вида, прав или даты — нет записи; у непроверенных прав роль файла снимается; http и пустая запись не читаются',
    parsed.length === 3 &&
      parsed[0].role === 'hw-1' &&
      parsed[0].primary === true &&
      parsed[1].role === undefined &&
      parsed[1].sourceUrl === 'https://example.test/series' &&
      parsed[2].kind === 'TECHNICAL_DRAWING',
    JSON.stringify(parsed.map((m) => [m.kind, m.rights, m.role ?? '-', m.sourceUrl ?? '-'])),
  );

  const withFiles = {
    meta: {
      media: [
        { role: 'hw-2', kind: 'SERIES_REFERENCE', rights: 'VERIFIED', rightsNote: 'своя съёмка', checkedAt: day },
        { role: 'hw-1', kind: 'EXACT_PRODUCT', rights: 'VERIFIED', rightsNote: 'своя съёмка', checkedAt: day, primary: true },
        /* Запись есть, строк файла нет: файл не найден — не показывается. */
        { role: 'hw-9', kind: 'EXACT_PRODUCT', rights: 'VERIFIED', rightsNote: 'своя съёмка', checkedAt: day },
        { kind: 'EXACT_PRODUCT', rights: 'NOT_VERIFIED', sourceUrl: 'https://example.test/maker', checkedAt: day },
        { kind: 'TECHNICAL_DRAWING', rights: 'NOT_VERIFIED', sourceUrl: 'https://example.test/drawing', checkedAt: day },
      ],
    },
    assets: [
      asset('hw-1', 'photo', 'org/hardware/x/hw-1-photo.jpg'),
      asset('hw-1', 'swatch', 'org/hardware/x/hw-1-thumb.webp'),
      asset('hw-2', 'photo', 'org/hardware/x/hw-2-photo.jpg'),
      /* Файл другой позиции с той же ролью не подхватывается: роль ищется в строках ЭТОЙ позиции. */
    ],
  } as unknown as CatalogEntryFull;
  const views = mediaViews(withFiles);
  const first = listPhoto(views);
  check(
    'I2 изображения позиции: главное первым, файл — по роли из строк этой позиции, миниатюра без своей строки — оригинал; запись без файла и ссылка — не фото',
    views.length === 5 &&
      first?.role === 'hw-1' &&
      first.url === at('org/hardware/x/hw-1-photo.jpg') &&
      first.thumbUrl === at('org/hardware/x/hw-1-thumb.webp') &&
      views.find((v) => v.role === 'hw-2')?.thumbUrl === at('org/hardware/x/hw-2-photo.jpg') &&
      views.find((v) => v.role === 'hw-9')?.url === null &&
      manufacturerPhotoLink(views)?.sourceUrl === 'https://example.test/maker' &&
      hasDrawing(views) &&
      listPhoto(mediaViews({ meta: { media: [{ role: 'hw-9', kind: 'EXACT_PRODUCT', rights: 'VERIFIED', checkedAt: day }] }, assets: [] } as unknown as CatalogEntryFull)) === null,
    views.map((v) => `${v.kind}:${v.role ?? 'ссылка'}:${v.url ? 'файл' : 'нет'}`).join(' · '),
  );

  /* Пакет: только точное совпадение артикула. */
  const matchItems = HARDWARE_FACTS.map((fact) => ({
    id: `hw:${fact.article}`,
    article: fact.article,
    manufacturer: fact.hardware.manufacturer,
    manufacturerArticle: fact.hardware.manufacturerArticle,
  }));
  const files = ['805.11.354.jpg', '9 114 276.png', 'MFR-HETTICH-9114276.webp', '71B3550_2.jpg', '805.11.35.jpg', '71B355.jpg', 'Hettich KA 4532.jpg'];
  const plan = matchMediaFiles(files, matchItems);
  const state = (file: string) => plan.find((m) => m.file === file);
  check(
    'I3 пакет файлов: артикул как напечатан, без пробелов и ключом строки — привязка; «_2» — второй ракурс; обрезанный артикул и название серии — «не найдено»',
    state('805.11.354.jpg')?.itemId === 'hw:MFR-HAFELE-805.11.354' &&
      state('9 114 276.png')?.itemId === 'hw:MFR-HETTICH-9114276' &&
      state('MFR-HETTICH-9114276.webp')?.itemId === 'hw:MFR-HETTICH-9114276' &&
      state('71B3550_2.jpg')?.itemId === 'hw:MFR-BLUM-71B3550' &&
      state('71B3550_2.jpg')?.angle === 2 &&
      state('805.11.35.jpg')?.state === 'unmatched' &&
      state('71B355.jpg')?.state === 'unmatched' &&
      state('Hettich KA 4532.jpg')?.state === 'unmatched',
    plan.map((m) => `${m.file}→${m.state}${m.itemId ? `:${m.itemId}` : ''}`).join(' · '),
  );
  const twin = matchMediaFiles(['805.11.354.jpg'], [...matchItems, { id: 'own', article: 'OWN-1', manufacturer: 'Компания', manufacturerArticle: '805 11 354' }]);
  check(
    'I4 один артикул у двух позиций — НЕ выбирается: «неоднозначно» и список кандидатов словами',
    twin[0].state === 'ambiguous' && twin[0].itemId === null && twin[0].candidates.length === 2,
    `${twin[0].state} · ${twin[0].candidates.join(', ')}`,
  );
  /* Два прочтения одного имени: целиком «805113543» — своя позиция, «805.11.354» + ракурс 3 — Häfele. */
  const twoReadings = matchMediaFiles(['805.11.354_3.jpg'], [...matchItems, { id: 'own3', article: 'OWN-3', manufacturer: 'Компания', manufacturerArticle: '805.11.3543' }]);
  check(
    'I4b имя читается и артикулом целиком, и «артикул_ракурс» — у обоих прочтений по позиции: НЕ выбирается, оба кандидата словами',
    twoReadings[0].state === 'ambiguous' && twoReadings[0].itemId === null && twoReadings[0].candidates.length === 2,
    `${twoReadings[0].state}${twoReadings[0].itemId ? `:${twoReadings[0].itemId}` : ''} · ${twoReadings[0].candidates.join(', ')}`,
  );

  /* Статус 3D — выводится по тем же местам, что рисует сцена. */
  const status = (article: string) => model3dStatusOf(item(article));
  /*
   * HW-01 добавил в факты BOYARD, DTC, Firmax, Alphalux, Unihopper и
   * МФ-Комплект. Прежние числа — у прежних трёх производителей, и они не
   * сдвинулись ни на позицию; у новых — свои, объявленные ниже.
   */
  const OLD_MAKERS = new Set(['Blum', 'Hettich', 'Häfele']);
  const oldItems = Array.from(CATALOG.values()).filter((it) => OLD_MAKERS.has(it.hardware.manufacturer ?? ''));
  const statuses = oldItems.map((it) => model3dStatusOf(it));
  const approx = statuses.filter((s) => s === 'VISUAL_APPROXIMATION').length;
  const none = statuses.filter((s) => s === 'NO_3D').length;
  const NEW_3D: Record<string, Partial<Record<string, number>>> = {
    BOYARD: { VISUAL_APPROXIMATION: 335, NO_3D: 1051, MEASURED_RECONSTRUCTION: 263, VISUAL_RECONSTRUCTION: 1113 },
    DTC: { VISUAL_APPROXIMATION: 327, NO_3D: 565 },
    Firmax: { VISUAL_APPROXIMATION: 127, NO_3D: 99 },
    Alphalux: { VISUAL_APPROXIMATION: 35, NO_3D: 131 },
    Unihopper: { VISUAL_APPROXIMATION: 11 },
    'МФ-Комплект': { VISUAL_APPROXIMATION: 7, NO_3D: 1 },
  };
  const newTally: Record<string, Record<string, number>> = {};
  for (const it of Array.from(CATALOG.values())) {
    const maker = it.hardware.manufacturer ?? '—';
    if (OLD_MAKERS.has(maker)) continue;
    const s = model3dStatusOf(it);
    (newTally[maker] ??= {})[s] = (newTally[maker]?.[s] ?? 0) + 1;
  }
  const newDiffer = Object.keys({ ...NEW_3D, ...newTally }).filter((m) => JSON.stringify(Object.entries(NEW_3D[m] ?? {}).sort()) !== JSON.stringify(Object.entries(newTally[m] ?? {}).sort()));
  const allStatuses = Array.from(CATALOG.values()).map((it) => model3dStatusOf(it));
  /*
   * HANDLE-REAL: у ручек своя модель — по размерам паспорта (MEASURED) или по
   * чертежу с недостающими размерами (VISUAL_RECONSTRUCTION). До слоя ручки
   * сцена не рисовала вовсе — у всех 63 было «3D нет»; теперь 38 из них с
   * моделью, и только ручки. Числа зафиксированы: тихо уменьшиться не могут.
   */
  const measured = statuses.filter((s) => s === 'MEASURED_RECONSTRUCTION').length;
  const reconstructed = statuses.filter((s) => s === 'VISUAL_RECONSTRUCTION').length;
  const modelOutsideHandles = Array.from(CATALOG.values()).filter(
    (it) => (model3dStatusOf(it) === 'MEASURED_RECONSTRUCTION' || model3dStatusOf(it) === 'VISUAL_RECONSTRUCTION') && it.hardware.category !== 'handle',
  );
  check(
    'I5 статус 3D: пантограф 805.11.354, петля 71B3550 и направляющая 9 114 276 — условная модель; планка 173L6100 — 3D нет; CAD — ни у одной позиции (архивы БАЗИС — права не подтверждены); у Blum, Hettich и Häfele условных 619, без 3D 542, ручек по размерам паспорта 13 и по чертежу 25 — и только ручки; у новых производителей — объявленные числа',
    status('MFR-HAFELE-805.11.354') === 'VISUAL_APPROXIMATION' &&
      status('MFR-BLUM-71B3550') === 'VISUAL_APPROXIMATION' &&
      status('MFR-HETTICH-9114276') === 'VISUAL_APPROXIMATION' &&
      status('MFR-BLUM-173L6100') === 'NO_3D' &&
      approx === 619 &&
      none === 542 &&
      measured === 13 &&
      reconstructed === 25 &&
      approx + none + measured + reconstructed === oldItems.length &&
      oldItems.length === 1199 &&
      newDiffer.length === 0 &&
      allStatuses.length === CATALOG.size &&
      modelOutsideHandles.length === 0 &&
      allStatuses.every((s) => s !== 'OFFICIAL_CAD'),
    `прежние: условная ${approx} · нет ${none} · по размерам ${measured} · по чертежу ${reconstructed} · из ${oldItems.length} · новые: ${JSON.stringify(newTally)}${newDiffer.length ? ` · РАСХОДЯТСЯ ${newDiffer.join(', ')}` : ''} · всего ${CATALOG.size}${modelOutsideHandles.length ? ` · не ручки: ${modelOutsideHandles.length}` : ''}`,
  );

  /* Покрытие фото: на фактах — ноль фото; привязанные файлы и ссылки меняют ровно свои строки. */
  const rows = rowsOf(HARDWARE_FACTS);
  const makerOf = (entry: CatalogEntryFull) => (entry.meta?.hardware as { manufacturer?: string } | undefined)?.manufacturer ?? null;
  const bare = mediaCoverage(rows, makerOf);
  const zeroPhotos = ['Blum', 'Hettich', 'Häfele'].every((m) => bare[m] && bare[m].exact === 0 && bare[m].series === 0 && bare[m].none === bare[m].total && bare[m].rightsNotVerified === 0);
  const bound = rows.map((row) => {
    if (row.article === 'MFR-HAFELE-805.11.354') {
      return { ...row, meta: { ...row.meta, media: [{ role: 'hw-1', kind: 'EXACT_PRODUCT', rights: 'VERIFIED', rightsNote: 'своя съёмка', checkedAt: day }] }, assets: [asset('hw-1', 'photo', 'a.jpg'), asset('hw-1', 'swatch', 'a.webp')] };
    }
    if (row.article === 'MFR-BLUM-71B3550') {
      return { ...row, meta: { ...row.meta, media: [{ role: 'hw-1', kind: 'SERIES_REFERENCE', rights: 'VERIFIED', rightsNote: 'своя съёмка', checkedAt: day }] }, assets: [asset('hw-1', 'photo', 'b.jpg')] };
    }
    if (row.article === 'MFR-HETTICH-9114276') {
      return { ...row, meta: { ...row.meta, media: [{ kind: 'EXACT_PRODUCT', rights: 'NOT_VERIFIED', sourceUrl: 'https://example.test/9114276', checkedAt: day }] } };
    }
    return row;
  }) as CatalogEntryFull[];
  const cov = mediaCoverage(bound, makerOf);
  check(
    'I6 покрытие фото: Blum 318, Hettich 290, Häfele 591 — точных и серии 0, «нет фото» = всего; точное фото, фото серии и ссылка без файла меняют ровно свои строки',
    zeroPhotos &&
      bare.Blum.total === 318 &&
      bare.Hettich.total === 290 &&
      bare['Häfele'].total === 591 &&
      cov['Häfele'].exact === 1 &&
      cov['Häfele'].none === 590 &&
      cov.Blum.series === 1 &&
      cov.Blum.exact === 0 &&
      cov.Blum.none === 317 &&
      cov.Hettich.rightsNotVerified === 1 &&
      cov.Hettich.none === 290,
    JSON.stringify(cov),
  );

  /*
   * ЛЁГКОЕ ЧТЕНИЕ НЕ МЕНЯЕТ НИ ОДНОГО ЧИСЛА. Строки — те же, что отдаёт
   * `fetchCatalog(…, { hardware: 'light' })`: запись изделия — только поля
   * `HARDWARE_LIGHT_FIELDS`, пометка `detail`. Подбор каждой позиции на
   * каждое место, смета и сцена кухни с установленной фурнитурой —
   * одинаковы при лёгком и полном каталоге; присадка говорит «не дочитано».
   */
  const lightRows = rows.map((row) => {
    const full = (row.meta?.hardware ?? {}) as Record<string, unknown>;
    const light: Record<string, unknown> = {};
    for (const key of HARDWARE_LIGHT_FIELDS) if (full[key] !== undefined) light[key] = full[key];
    return { ...row, meta: { hardware: light }, detail: 'light' as const };
  }) as CatalogEntryFull[];
  const LIGHT = hardwareCatalog(lightRows);
  const SLOTS: FittingSlot[] = ['hinge', 'hinge_plate', 'slide', 'lift', 'handle', 'pantograph', 'wardrobe_pullout', 'cargo', 'dryer', 'corner_unit', 'waste', 'shelf_support', 'leg'];
  const acceptDiff = Array.from(CATALOG.values()).filter((it) => {
    const lite = LIGHT.get(it.id);
    return !lite || SLOTS.some((slot) => slotAccepts(slot, it) !== slotAccepts(slot, lite)) || slidingAccepts(it) !== slidingAccepts(lite) || model3dStatusOf(it) !== model3dStatusOf(lite);
  });
  const k = kitchen(SHOP);
  const run0 = k.shown().run;
  let verdicts = 0;
  const verdictDiff: string[] = [];
  for (const id of [HOB, DOOR, UPPER]) {
    const unit = moduleOf(run0, id);
    for (const place of fittingSlotsOf(unit, run0, SHOP)) {
      for (const it of Array.from(CATALOG.values())) {
        if (!slotAccepts(place.slot, it)) continue;
        verdicts += 1;
        const a = fittingVerdict({ unit, run: run0, slot: place.slot, item: it, bayId: place.bayId, production: SHOP, catalog: CATALOG });
        const b = fittingVerdict({ unit, run: run0, slot: place.slot, item: LIGHT.get(it.id)!, bayId: place.bayId, production: SHOP, catalog: LIGHT });
        if (JSON.stringify(a) !== JSON.stringify(b)) verdictDiff.push(`${id}/${place.slot}/${it.article}`);
      }
    }
  }
  check(
    'I7 лёгкое чтение: у всех 5264 позиций те же места и тот же статус 3D; проверка совместимости на местах трёх модулей кухни — та же до слова',
    CATALOG.size === 5264 &&
      acceptDiff.length === 0 && verdictDiff.length === 0 && verdicts > 500,
    `позиций с разницей ${acceptDiff.length} · проверок ${verdicts}, разошлось ${verdictDiff.length}${verdictDiff[0] ? ` (${verdictDiff[0]})` : ''}`,
  );

  const fit = (catalog: Map<string, HardwareItem>) => {
    const kk = kitchen(SHOP, catalog);
    kk.ops([{ op: 'set_fitting', moduleId: HOB, slot: 'slide', itemId: 'hw:MFR-HETTICH-9114276' }], catalog);
    kk.ops([{ op: 'set_fitting', moduleId: DOOR, slot: 'hinge', itemId: 'hw:MFR-BLUM-71B3550' }], catalog);
    const last = kk.ops([{ op: 'set_fitting', moduleId: DOOR, slot: 'hinge_plate', itemId: 'hw:MFR-BLUM-175H3130' }], catalog);
    return last.shown;
  };
  const fullShown = fit(CATALOG);
  const lightShown = fit(LIGHT);
  const lines = (shown: typeof fullShown) => JSON.stringify(shown.estimate.lines.map((l) => [l.key, l.quantity, l.total]));
  const scene = (run: Run, catalog: Map<string, HardwareItem>) =>
    JSON.stringify(runBoxes({ ...run, production: SHOP }, { thicknessMm: 16, frontThicknessMm: 16, gapMm: 4, hardware: catalog, production: SHOP }));
  check(
    'I8 смета и сцена кухни с направляющей KA 500, петлёй CLIP top и планкой — те же при лёгком и полном каталоге: итог, строки, коробки сцены',
    fullShown.estimate.total === lightShown.estimate.total &&
      lines(fullShown) === lines(lightShown) &&
      scene(fullShown.run, CATALOG) === scene(lightShown.run, LIGHT) &&
      fullShown.run.fingerprint === lightShown.run.fingerprint && configurationFingerprint(allModules(fullShown.run)) === configurationFingerprint(allModules(lightShown.run)),
    `итог ${fullShown.estimate.total} / ${lightShown.estimate.total} · строк ${fullShown.estimate.lines.length} / ${lightShown.estimate.lines.length}`,
  );

  const lightDrill = moduleDrilling(moduleOf(lightShown.run, HOB), { ...lightShown.run, production: SHOP }, SHOP, LIGHT).filter((d) => d.slot === 'slide');
  const fullDrill = moduleDrilling(moduleOf(fullShown.run, HOB), { ...fullShown.run, production: SHOP }, SHOP, CATALOG).filter((d) => d.slot === 'slide');
  const lightHinge = moduleDrilling(moduleOf(lightShown.run, DOOR), { ...lightShown.run, production: SHOP }, SHOP, LIGHT).filter((d) => d.slot === 'hinge');
  check(
    'I9 присадка позиции без паспорта: «паспорт не дочитан», отверстий 0 — а не «в паспорте нет»; дочитанный паспорт даёт прежние отверстия',
    lightDrill.length === 2 &&
      lightDrill.every((d) => d.holes.length === 0 && d.status === 'DRILLING_NOT_VERIFIED' && JSON.stringify(d.missing) === JSON.stringify([DRILLING_UNREAD])) &&
      lightHinge.length === 1 &&
      JSON.stringify(lightHinge[0].missing) === JSON.stringify([DRILLING_UNREAD]) &&
      fullDrill.length === 2 &&
      fullDrill.every((d) => d.holes.length > 0) &&
      [...lightDrill, ...lightHinge].every((d) => d.missing.every((m) => !m.includes('в паспорте нет'))),
    `${lightDrill.map((d) => d.missing.join(';')).join(' | ')} · полный: отверстий ${fullDrill.reduce((s, d) => s + d.holes.length, 0)}`,
  );

  const refs = lightReferences([lightShown.run], lightRows);
  check(
    'I10 какие позиции без паспорта установлены: ровно направляющая, петля и планка кухни; каталог без лёгких строк — пусто',
    JSON.stringify(refs) === JSON.stringify(['hw:MFR-BLUM-175H3130', 'hw:MFR-BLUM-71B3550', 'hw:MFR-HETTICH-9114276']) &&
      lightReferences([lightShown.run], rows).length === 0,
    refs.join(', '),
  );

  const same = rowsOf(HARDWARE_FACTS.slice(0, 5));
  check(
    'I11 разбор фурнитуры — один на массив каталога: тот же массив — та же карта, новый массив — новая',
    hardwareCatalog(same) === hardwareCatalog(same) && hardwareCatalog(same) !== hardwareCatalog([...same]),
  );

  /* Импорт производителя не стирает изображения компании: они в `meta.media`, рядом с `meta.hardware`. */
  const fact = HARDWARE_FACTS.find((f) => f.article === 'MFR-HAFELE-805.11.354')!;
  const media = [{ kind: 'EXACT_PRODUCT', rights: 'NOT_VERIFIED', sourceUrl: 'https://example.test/805', checkedAt: day }];
  const kept = planHardwareImport([{ id: 'row-1', article: fact.article, meta: { hardware: fact.hardware, media } }], [fact]);
  const changed = planHardwareImport([{ id: 'row-1', article: fact.article, meta: { hardware: { ...fact.hardware, notes: 'прежняя запись' }, media } }], [fact]);
  check(
    'I12 повтор импорта фактов: позиция с изображениями компании — «без изменений»; обновление записи изделия изображения сохраняет',
    kept.unchanged.length === 1 && kept.update.length === 0 && changed.update.length === 1 && JSON.stringify(changed.update[0].meta.media) === JSON.stringify(media),
    `без изменений ${kept.unchanged.length} · обновлений ${changed.update.length}`,
  );
}

/* ═════════════════════════  HW-02: серия, размер, замена производителя, избранное  ═════════════════════════ */

console.log('\nHW-02: каталог — производитель → серия → артикул, размер, аналог другого производителя, избранное и недавние');
{
  const all = Array.from(CATALOG.values());
  const ka = item('MFR-HETTICH-9114276');
  const kaAnalogs = analogsOf(ka, all, 1000);
  const rank = (s: string | undefined) => (s === 'VERIFIED' ? 0 : s === 'PARTIAL' ? 1 : s === 'CONFLICT' ? 3 : 2);
  check(
    'HK1 аналоги KA 4532 NL 500 (Hettich): 14 позиций других производителей той же группы и подвида с NL 500 — подтверждённые первыми',
    kaAnalogs.length === 14 &&
      kaAnalogs.every(
        ({ item: o }) =>
          o.hardware.manufacturer !== 'Hettich' &&
          o.hardware.category === ka.hardware.category &&
          o.hardware.subcategory === ka.hardware.subcategory &&
          o.hardware.dimensionsMm?.nominalLength === 500,
      ) &&
      kaAnalogs.every(({ item: o }, i) => i === 0 || rank(kaAnalogs[i - 1].item.hardware.engineeringStatus) <= rank(o.hardware.engineeringStatus)) &&
      kaAnalogs.every(({ by }) => by === 'NL 500'),
    `${kaAnalogs.length}: ${kaAnalogs.slice(0, 4).map(({ item: o }) => `${o.hardware.manufacturer} ${o.hardware.manufacturerArticle}`).join(', ')}…`,
  );
  const plateAnalogs = analogsOf(item('MFR-BLUM-175H3130'), all, 1000);
  const liftKey = analogKeyOf(item('MFR-BLUM-22S2800'));
  check(
    'HK2 планка 175H3130 (MD 3): аналоги — 3 планки Hettich с MD 3; подъёмник 22S2800 — ключа нет, аналогов 0 (по похожему названию не предлагается)',
    plateAnalogs.length === 3 &&
      plateAnalogs.every(({ item: o }) => o.hardware.manufacturer === 'Hettich' && o.hardware.dimensionsMm?.plateHeight === 3) &&
      liftKey === null &&
      analogsOf(item('MFR-BLUM-22S2800'), all).length === 0,
    `${plateAnalogs.map(({ item: o }) => o.hardware.manufacturerArticle).join(', ')} · ключ подъёмника ${JSON.stringify(liftKey)}`,
  );

  /* Замена производителя — та же операция и тот же вердикт, что у любой позиции (путь экрана). */
  const kk = kitchen(SHOP);
  kk.ops([{ op: 'set_fitting', moduleId: HOB, slot: 'slide', itemId: 'hw:MFR-HETTICH-9114276' }]);
  const runBefore = kk.shown().run;
  const hob = moduleOf(runBefore, HOB);
  const judged = kaAnalogs.map(({ item: o }) => ({ o, v: fittingVerdict({ unit: hob, run: runBefore, slot: 'slide', item: o, production: SHOP, catalog: CATALOG }) }));
  const letIn = judged.filter(({ v }) => v.state !== 'refused');
  /*
   * Отказ — обязательно настоящий: у KA 500 все 14 аналогов на этом модуле
   * встают, поэтому «не подходящий» берётся направляющей другого
   * производителя длиннее корпуса — её проверка обязана отказать.
   */
  const longer = all
    .filter((o) => o.hardware.category === 'slide' && o.hardware.manufacturer !== 'Hettich' && (o.hardware.dimensionsMm?.nominalLength ?? 0) >= 600)
    .map((o) => ({ o, v: fittingVerdict({ unit: hob, run: runBefore, slot: 'slide', item: o, production: SHOP, catalog: CATALOG }) }));
  const shut = [...judged, ...longer].filter(({ v }) => v.state === 'refused');
  if (shut.length === 0) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: направляющей, которой проверка отказывает на модуле под варочной, нет');
  const swapTo = letIn[0]?.o ?? null;
  const swapped = swapTo ? kk.ops([{ op: 'set_fitting', moduleId: HOB, slot: 'slide', itemId: swapTo.id }]) : null;
  const swappedSlide = swapped ? moduleOf(swapped.shown.run, HOB).fittings?.find((f) => f.slot === 'slide')?.itemId : null;
  const tryShut = shut[0] ? kk.ops([{ op: 'set_fitting', moduleId: HOB, slot: 'slide', itemId: shut[0].o.id }]) : null;
  const afterShut = tryShut ? moduleOf(tryShut.shown.run, HOB).fittings?.find((f) => f.slot === 'slide')?.itemId : null;
  check(
    'HK3 замена Hettich → аналог: подходящий ставится той же операцией (`set_fitting`) и стоит на месте; не подходящий не встаёт — на месте прежний, причина словами',
    swapTo !== null &&
      swappedSlide === swapTo.id &&
      afterShut === swapTo.id &&
      tryShut!.next.warnings.some((w) => w.includes(shut[0].o.name)),
    `встаёт или не проверено ${letIn.length}, отказ ${shut.length} · поставлен ${swapTo?.hardware.manufacturerArticle ?? '—'} → на месте ${swappedSlide ?? '—'}${shut[0] ? ` · отказ ${shut[0].o.hardware.manufacturerArticle}: ${shut[0].v.summary}` : ''}`,
  );

  const SERIES_WANT: Record<string, number> = { Alphalux: 5, Blum: 27, BOYARD: 654, DTC: 35, Firmax: 29, Häfele: 26, Hettich: 25, 'МФ-Комплект': 2, Unihopper: 1 };
  const seriesBy = new Map<string, Map<string, number>>();
  for (const it of all) {
    const maker = it.hardware.manufacturer ?? '—';
    const m = seriesBy.get(maker) ?? new Map<string, number>();
    m.set(seriesOf(it), (m.get(seriesOf(it)) ?? 0) + 1);
    seriesBy.set(maker, m);
  }
  const seriesGot = Object.fromEntries(Array.from(seriesBy.entries()).map(([maker, m]) => [maker, m.size]));
  const seriesSumOk = Array.from(seriesBy.entries()).every(
    ([maker, m]) => Array.from(m.values()).reduce((s, n) => s + n, 0) === all.filter((it) => it.hardware.manufacturer === maker).length,
  );
  const noSeriesHonest = all.every((it) => (seriesOf(it) === NO_SERIES) === !it.hardware.series?.trim());
  check(
    'HK4 серии по производителям — числами свода; сумма по сериям = позиций производителя; «без серии» — только где серия не напечатана',
    JSON.stringify(Object.entries(seriesGot).sort()) === JSON.stringify(Object.entries(SERIES_WANT).sort()) && seriesSumOk && noSeriesHonest,
    JSON.stringify(seriesGot),
  );

  const st = item('MFR-DTC-ST01AL');
  check(
    'HK5 отбор по размеру: KA NL 500 — 500 да, 501 нет; DTC ST01AL (фасад 480…529) — 500 да, 530 нет; пустое поле — без отбора',
    sizeMatches(ka, 500) && !sizeMatches(ka, 501) && sizeMatches(st, 500) && !sizeMatches(st, 530) && sizeMatches(ka, 0) && sizeMatches(ka, Number.NaN),
  );

  /* Избранное и недавние: хранилища нет — так и сказано (`available: false`), а не молча пусто. */
  const noStorage = favoriteArticles();
  const memory = new Map<string, string>();
  let failWrites = false;
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (failWrites) throw new Error('quota');
        memory.set(k, v);
      },
    },
  };
  const f1 = toggleFavorite('MFR-A', []);
  const f2 = toggleFavorite('MFR-B', f1.list);
  const f3 = toggleFavorite('MFR-A', f2.list);
  const reread = favoriteArticles();
  /* Повтор из середины списка (C), а не тот, что и так уходит за предел, — иначе повтор не проверяется. */
  let r = recentArticles();
  for (const a of ['A', 'B', 'C', 'D', 'E', 'F', 'C']) r = pushRecent(a, r.list);
  const deduped = r.list.slice();
  for (const a of ['G', 'H', 'I', 'J', 'K', 'L', 'M', 'B']) r = pushRecent(a, r.list);
  memory.set('mw.hw.recent', '{испорчено');
  const broken = recentArticles();
  failWrites = true;
  const unsaved = toggleFavorite('MFR-C', reread.list);
  delete (globalThis as unknown as { window?: unknown }).window;
  check(
    'HK6 избранное и недавние: без хранилища — «недоступно», а не пусто молча; переключение и порядок; недавние без повторов и не больше 12; испорченная запись и отказ записи — «недоступно», список живёт',
    noStorage.available === false &&
      JSON.stringify(f2.list) === JSON.stringify(['MFR-B', 'MFR-A']) &&
      JSON.stringify(f3.list) === JSON.stringify(['MFR-B']) &&
      reread.available && JSON.stringify(reread.list) === JSON.stringify(['MFR-B']) &&
      JSON.stringify(deduped) === JSON.stringify(['C', 'F', 'E', 'D', 'B', 'A']) &&
      r.list.length === 12 && r.list[0] === 'B' && new Set(r.list).size === 12 && !r.list.includes('A') &&
      broken.available === false &&
      unsaved.available === false && JSON.stringify(unsaved.list) === JSON.stringify(['MFR-C', 'MFR-B']),
    `без хранилища ${noStorage.available} · избранное ${f3.list.join(',')} · повтор ${deduped.join(',')} · недавние ${r.list.join(',')} · испорчено ${broken.available} · запись ${unsaved.available}`,
  );
}

/* ═════════════════════════  HW-04: направляющая как механизм — секции и ход по модели  ═════════════════════════ */

console.log('\nHW-04: направляющая — секции по виду выдвижения, ход по модели, одна функция на сцену и ход у угла');
{
  const ka = runnerModelOf(item('MFR-HETTICH-9114276'));
  const tandem = runnerModelOf(item('MFR-BLUM-560H2500B'));
  const hafele = runnerModelOf(item('MFR-HAFELE-420.78.040'));
  const partial = runnerModelOf(item('MFR-BOYARD-DB1711Zn/250'));
  const none = runnerModelOf(null);
  check(
    'RN1 модель направляющей из записи: KA 4532 NL 500 — боковая, полное выдвижение, 3 секции, ход 500 по виду выдвижения (словами); TANDEM 560H NL 250 — скрытого монтажа, 3 секции, 250; Häfele 420.78.040 — ход 298 по паспорту; BOYARD DB1711 NL 250 частичного — 2 секции, ход условный 250 (не длиннее NL); без позиции — условные 300',
    ka.mount === 'side' && ka.extension === 'full' && ka.members === 3 && ka.travelMm === 500 && ka.travelBasis === 'extension' && ka.words.includes('полное выдвижение') &&
      tandem.mount === 'under' && tandem.members === 3 && tandem.travelMm === 250 &&
      hafele.travelBasis === 'passport' && hafele.travelMm === 298 &&
      partial.members === 2 && partial.travelBasis === 'conditional' && partial.travelMm === 250 && partial.words.includes('не больше NL 250') &&
      none.travelMm === 300 && none.travelBasis === 'conditional',
    [ka, tandem, hafele, partial, none].map((m) => `${m.mount}/${m.extension}/${m.members}/${m.travelMm}/${m.travelBasis}`).join(' · '),
  );

  /* Путь экрана: направляющая на модуле под варочной → короб по комплекту → коробки сцены. */
  const kitOf = (article: string) => {
    const kk = kitchen(SHOP);
    kk.ops([{ op: 'set_fitting', moduleId: HOB, slot: 'slide', itemId: item(article).id }]);
    const run = kk.shown().run;
    const boxes = runBoxes({ ...run, production: SHOP }, { thicknessMm: 16, frontThicknessMm: 16, gapMm: 4, hardware: CATALOG, production: SHOP });
    const runners = boxes.filter((b) => b.node === 'runner' && (b.part?.startsWith(`${HOB}:drawer:0`) || (!b.part && Math.abs(b.position[1] - boxes.find((x) => x.part === `${HOB}:drawer:0` && x.node === 'runner')!.position[1]) < 1e-9)));
    return { runners, kits: moduleDrawerKits(moduleOf(run, HOB), run, SHOP, CATALOG) };
  };
  const full = kitOf('MFR-HETTICH-9114276');
  const fullKit = full.kits.find((k) => k.state === 'box');
  const pieces = fullKit && fullKit.state === 'box' ? fullKit.plan.pieces.filter((p) => p.member) : [];
  const middles = full.runners.filter((b) => b.slideShare === 0.5);
  const fixed = full.runners.filter((b) => !b.part);
  check(
    'RN2 KA 4532 (полное выдвижение) на ящике под варочной: у направляющей каждой стороны три секции — корпусная стоит, средняя едет на половину хода, ходовая с ящиком; ширина секции — треть монтажной ширины 12,7 мм',
    pieces.length === 6 &&
      pieces.filter((p) => p.member === 'middle').length === 2 &&
      pieces.every((p) => Math.abs(p.x1 - p.x0 - 12.7 / 3) < 1e-6) &&
      middles.length === 2 &&
      middles.every((b) => b.part === `${HOB}:drawer:0`) &&
      fixed.length === 2,
    `секций плана ${pieces.length} (${pieces.map((p) => p.member).join(',')}) · в сцене: средних ${middles.length}, корпусных ${fixed.length}`,
  );

  /* Частичное выдвижение — две секции; подходящая позиция частичного, встающая на модуль. */
  /*
   * ЧАСТИЧНОЕ ВЫДВИЖЕНИЕ. У направляющих частичного выдвижения в фактах нет
   * монтажной ширины ни одной: короб по ним не считается, и на модуле это
   * сказано словами (комплект — черновик). План с двумя секциями — тот же
   * `drawerBoxPlan`, что режет короб, по профилю с двумя секциями.
   */
  const partialSide = Array.from(CATALOG.values()).filter((it) => it.hardware.category === 'slide' && runnerModelOf(it).extension === 'partial');
  const withWidth = partialSide.filter((it) => typeof it.hardware.dimensionsMm?.sideClearance === 'number');
  const sample = partialSide.find((it) => it.hardware.subcategory === 'side_mount' && (it.hardware.dimensionsMm?.nominalLength ?? 0) <= 500);
  if (!sample) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: боковой направляющей частичного выдвижения до NL 500 в фактах нет');
  const sampleKit = kitOf(sample.article).kits[0];
  const twoPlan = drawerBoxPlan(450, 140, {
    slideLengthMm: 450,
    sideClearanceMm: 12.7,
    boxSideMm: 16,
    boxBottomMm: 4,
    boxHeightGapMm: 40,
    provenance: { slide: 'проверка', box: 'проверка' },
    runnerMembers: 2,
  });
  const twoRails = twoPlan.pieces.filter((p) => p.member);
  check(
    'RN3 частичное выдвижение: монтажной ширины нет ни у одной позиции — короб не считается, причина у ящика словами; план с двумя секциями — корпусная и ходовая, средней нет',
    partialSide.length > 0 &&
      withWidth.length === 0 &&
      sampleKit?.state === 'draft' &&
      sampleKit.missing.some((w) => /зазор|ширин/i.test(w)) &&
      twoRails.length === 4 &&
      twoRails.every((p) => p.member !== 'middle'),
    `частичного ${partialSide.length}, с монтажной шириной ${withWidth.length} · ${sample.hardware.manufacturerArticle}: ${sampleKit?.state === 'draft' ? sampleKit.missing[0] : sampleKit?.state} · секций плана ${twoRails.length}`,
  );

  /*
   * СКРЫТЫЙ МОНТАЖ (HW-04): TANDEM 560H NL 500 — короб по формулам паспорта
   * «SKW = LW − 42», «SKL = NL − 10». Размеры считаются, выпуск заперт словами:
   * утопление дна, вырез задней стенки и присадка защёлок не образмерены.
   */
  const um = kitOf('MFR-BLUM-560H5000B');
  const umKit = um.kits.find((k) => k.state === 'box');
  if (!umKit || umKit.state !== 'box') throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: короба под TANDEM 560H NL 500 нет: ${um.kits.map((k) => (k.state === 'draft' ? k.missing.join('; ') : k.state)).join(' | ')}`);
  const umRails = umKit.plan.pieces.filter((p) => p.member);
  const umBottom = umKit.plan.bottomFromMm;
  const umParts = umKit.plan.parts;
  const umDrafts = (() => {
    const kk = kitchen(SHOP);
    kk.ops([{ op: 'set_fitting', moduleId: HOB, slot: 'slide', itemId: item('MFR-BLUM-560H5000B').id }]);
    return drawerDrafts([kk.shown().run], CATALOG, SHOP);
  })();
  check(
    'UM1 TANDEM 560H NL 500 под дном: внутренняя ширина ящика = проём − 42 (SKW), длина = 500 − 10 = 490 (SKL); направляющая — три секции под каждой боковиной во всю NL; выпуск заперт словами (утопление дна, вырез задней стенки, присадка защёлок)',
    Math.abs(umKit.plan.innerWidthMm - (umKit.place.openingWidthMm - 42)) < 0.05 &&
      umKit.plan.lengthMm === 490 &&
      umRails.length === 6 &&
      umRails.every((p) => p.y1 <= umBottom + 1e-9 && p.z0 === -500 && p.approximate === true) &&
      umKit.profile.confirmed === false &&
      umDrafts.reasons.some((r) => r.includes('утопление дна') && r.includes('присадка защёлок')),
    `проём ${umKit.place.openingWidthMm} · SKW ${umKit.plan.innerWidthMm} · SKL ${umKit.plan.lengthMm} · секций ${umRails.length} · причин ${umDrafts.reasons.length}`,
  );
  const side = umParts.find((p) => p.name === 'Боковина ящика');
  const wall = umParts.find((p) => p.name === 'Торец ящика');
  check(
    'UM2 детали короба скрытого монтажа — в раскрой по формулам: боковины длиной SKL 490, торцы между боковинами шириной SKW',
    side?.lengthMm === 490 && side.qty === 2 && wall !== undefined && Math.abs(wall.lengthMm - umKit.plan.innerWidthMm) < 0.05,
    `боковина ${side?.lengthMm}×${side?.widthMm} ×${side?.qty} · торец ${wall?.lengthMm}`,
  );
  /* Присадка скрытого монтажа — тем же планом: высоты на корпусе нет (ось короба к направляющей под дном не относится), задний крючок — словами. */
  const umk = kitchen(SHOP);
  umk.ops([{ op: 'set_fitting', moduleId: HOB, slot: 'slide', itemId: item('MFR-BLUM-560H5000B').id }]);
  const umPlan = drillingPlan({ walls: panelWallsOf(null, wallSegments(null, umk.shown().run, {}), umk.input.runWallId), production: SHOP, hardware: CATALOG });
  const umDrill = umPlan.parts.filter((p) => p.moduleId === HOB);
  const umSidePending = umDrill.filter((p) => p.role === 'side_left' || p.role === 'side_right').flatMap((p) => p.pending.filter((x) => x.what.startsWith('направляющая на корпусе')));
  const umBacks = umDrill.filter((p) => p.leaf?.endsWith(':box:wall:2'));
  check(
    'UM4 присадка TANDEM 560H тем же планом: у боковин корпуса — «высота направляющей скрытого монтажа не образмерена» (правило оси короба цеха к ней не применяется); у задней стенки каждого ящика — отверстие Ø6 под задний крючок словами; отверстий направляющих 0',
    umSidePending.length > 0 &&
      umSidePending.every((x) => x.why.some((w) => w.includes('скрытого монтажа')) && !x.why.some((w) => w.includes('правило короба цеха'))) &&
      umBacks.length > 0 &&
      umBacks.every((p) => p.pending.some((x) => x.what.includes('задний крючок') && x.why.some((w) => w.includes('Ø 6')))) &&
      umDrill.every((p) => p.ops.every((o) => o.role !== 'runner_cabinet' && o.role !== 'runner_drawer')),
    `причин у боковин ${umSidePending.length}: «${umSidePending[0]?.why.find((w) => w.includes('высота')) ?? 'НЕТ'}» · задних ${umBacks.length}, с крючком ${umBacks.filter((p) => p.pending.some((x) => x.what.includes('задний крючок'))).length}`,
  );

  /* BOYARD скрытого монтажа: SKW напечатана, SKL — нет. Короб не считается, и это сказано. */
  const boyardUnder = Array.from(CATALOG.values()).find(
    (it) => it.hardware.manufacturer === 'BOYARD' && it.hardware.subcategory === 'undermount' && it.hardware.dimensionsMm?.drawerInnerDeduct !== undefined && it.hardware.dimensionsMm?.drawerLengthDeduct === undefined && (it.hardware.dimensionsMm?.nominalLength ?? 0) <= 500,
  );
  if (!boyardUnder) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: BOYARD скрытого монтажа с SKW и без SKL до NL 500 в фактах нет');
  const byKit = kitOf(boyardUnder.article).kits[0];
  check(
    'UM3 BOYARD скрытого монтажа: SKW напечатана, SKL — нет: короб не считается, у ящика словами «формулы длины ящика (SKL = NL − …) в паспорте нет»',
    byKit?.state === 'draft' && byKit.missing.some((w) => w.includes('SKL = NL')),
    `${boyardUnder.hardware.manufacturerArticle}: ${byKit?.state === 'draft' ? byKit.missing.join('; ').slice(0, 160) : byKit?.state}`,
  );

  /*
   * СИСТЕМА ЯЩИКА (HW-04): TANDEMBOX antaro — ходовая 576.4501M NL 450 на месте
   * направляющей, царги 378M4502SA (M, 83,6) на появившемся месте царг. Режутся
   * дно (LW − 75) × (NL − 24) и задняя стенка (LW − 87) × 84 — по паспорту.
   */
  const tb = kitchen(SHOP);
  tb.ops([{ op: 'set_fitting', moduleId: HOB, slot: 'slide', itemId: item('MFR-BLUM-576.4501M').id }]);
  const tbRun0 = tb.shown().run;
  const tbPlaces = fittingSlotsOf(moduleOf(tbRun0, HOB), tbRun0, SHOP, CATALOG).map((p) => p.slot);
  const tbDraft = moduleDrawerKits(moduleOf(tbRun0, HOB), tbRun0, SHOP, CATALOG)[0];
  const wrongNl = fittingVerdict({ unit: moduleOf(tbRun0, HOB), run: tbRun0, slot: 'drawer_side', item: item('MFR-BLUM-378M5002SA'), production: SHOP, catalog: CATALOG });
  tb.ops([{ op: 'set_fitting', moduleId: HOB, slot: 'drawer_side', itemId: item('MFR-BLUM-378M4502SA').id }]);
  const tbRun = tb.shown().run;
  const tbKit = moduleDrawerKits(moduleOf(tbRun, HOB), tbRun, SHOP, CATALOG)[0];
  if (!tbKit || tbKit.state !== 'box') throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: короба TANDEMBOX нет: ${tbKit ? (tbKit as { missing?: string[] }).missing?.join('; ') : 'ящика нет'}`);
  const LW = tbKit.place.openingWidthMm;
  const tbBottom = tbKit.plan.parts.find((p) => p.name === 'Дно ящика');
  const tbBack = tbKit.plan.parts.find((p) => p.name === 'Торец ящика');
  check(
    'TB1 TANDEMBOX antaro NL 450: с ходовой на месте направляющей у ящика появляется место «Царги системы ящика»; без царг — короб словами «царги не выбраны»; царги NL 500 к ходовой NL 450 — отказ «нужна та же NL»',
    tbPlaces.includes('drawer_side') &&
      tbDraft?.state === 'draft' &&
      tbDraft.missing.some((w) => w.includes('царги не выбраны')) &&
      wrongNl.state === 'refused' &&
      wrongNl.checks.some((c) => c.state === 'fail' && c.words.includes('нужна та же NL')),
    `места ${tbPlaces.join(',')} · без царг: ${tbDraft && tbDraft.state === 'draft' ? tbDraft.missing[0] : 'короб'} · NL 500: ${wrongNl.summary}`,
  );
  const tbPanels = buildPanels({ run: tbRun, production: SHOP, hardware: CATALOG }).filter((p) => p.moduleId === HOB);
  const tbScene = runBoxes({ ...tbRun, production: SHOP }, { thicknessMm: 16, frontThicknessMm: 16, gapMm: 4, hardware: CATALOG, production: SHOP });
  const tbMetalSides = tbScene.filter((b) => b.part === `${HOB}:drawer:0` && b.material === 'metal' && b.node === 'runner' && Math.abs(b.scale[1] * 1000 - Math.min(83.6, (tbKit.place.zoneToMm - tbKit.place.zoneFromMm) - (SHOP.drawerBox?.gapBelowMm ?? 0))) < 0.1);
  check(
    'TB2 короб TANDEMBOX по паспорту: дно (LW − 75) × (450 − 24 = 426), задняя стенка (LW − 87) × 84 — в раскрое; боковин из ЛДСП нет (царги покупные металлические, в сцене металлом); выпуск заперт словами системы',
    Math.abs((tbBottom?.lengthMm ?? 0) - (LW - 75)) < 0.05 &&
      tbBottom?.widthMm === 426 &&
      Math.abs((tbBack?.lengthMm ?? 0) - (LW - 87)) < 0.05 &&
      tbBack?.widthMm === 84 &&
      !tbKit.plan.parts.some((p) => p.name === 'Боковина ящика') &&
      !tbPanels.some((p) => p.name === 'Боковина ящика') &&
      tbMetalSides.length === 2 &&
      tbKit.profile.confirmed === false &&
      drawerDrafts([tbRun], CATALOG, SHOP).reasons.some((r) => r.includes('система ящика') && r.includes('крепления фасада')),
    `LW ${LW} · дно ${tbBottom?.lengthMm}×${tbBottom?.widthMm} · задняя ${tbBack?.lengthMm}×${tbBack?.widthMm} · царг металлом ${tbMetalSides.length}`,
  );
  /* ИД деталей системы в сцене = ИД деталей раскроя: выбранная в деталировке задняя стенка находится в 3D. */
  const tbSceneIds = tbScene.filter((b) => b.partId && b.partId.startsWith(`${HOB}:drawer:`)).map((b) => b.partId!).sort();
  const tbPanelIds = tbPanels.filter((p) => p.name === 'Дно ящика' || p.name === 'Торец ящика').flatMap((p) => p.partIds ?? []).sort();
  check(
    'TB2б ИД дна и задней стенки системы в сцене = ИД деталей раскроя (задняя — `wall:2`, как у короба цеха); у каждого ящика по одной',
    tbSceneIds.length === 2 * drawersOnHobOf(tbRun) && JSON.stringify(tbSceneIds) === JSON.stringify(tbPanelIds) && tbPanelIds.filter((id) => id.endsWith(':box:wall:2')).length === drawersOnHobOf(tbRun),
    `сцена ${tbSceneIds.join(' ')} | раскрой ${tbPanelIds.join(' ')}`,
  );
  const tbLine = tb.shown().estimate.lines.find((l) => l.key === 'fitting_drawer_side_hw:MFR-BLUM-378M4502SA');
  const drawersOnHob = moduleOf(tbRun, HOB).fill?.drawerHeights.length ?? 0;
  check(
    /* Единица продажи — «1 x царги, левая/правая»: комплект (пара) на ящик; «от 1000 шт.» — тираж логотипа, не штуки. */
    'TB3 смета: царги — своей строкой позиции, комплект на ящик (столько же, сколько ящиков); цены нет — «цена не задана»',
    tbLine !== undefined && tbLine.quantity === drawersOnHob && drawersOnHob > 0 && Boolean(tbLine.priceUnset),
    `${tbLine ? `${tbLine.title}: ${tbLine.quantity} ${tbLine.unit} · ${tbLine.priceUnset ?? 'цена есть'}` : 'строки НЕТ'} · ящиков ${drawersOnHob}`,
  );
  /* Карта раскроя — тем же счётом, что экран (`CuttingMap`): число коробов и их слова из `drawerDrafts`. */
  const tbDrafts = drawerDrafts([tbRun], CATALOG, SHOP);
  const tbObject = objectPanels({ walls: panelWallsOf(null, wallSegments(null, tbRun, {}), tb.input.runWallId), production: SHOP, hardware: CATALOG });
  const tbMap = cuttingPlan({ parts: tbObject, settings: CUT_SETTINGS, fingerprint: 'x', drawerBoxUnconfirmed: tbDrafts.unconfirmed, drawerBoxWhy: tbDrafts.unconfirmedWhy });
  const tbReason = tbMap.release.reasons.find((r) => r.startsWith('Короба ящиков')) ?? '';
  check(
    'TB4 карта раскроя: короба TANDEMBOX рассчитаны и разложены, выпуск заперт словами системы ящика — что не образмерено (царга, держатели задней стенки, крепление фасада), а не общей фразой',
    tbDrafts.boxes === drawersOnHob &&
      tbDrafts.unconfirmed === drawersOnHob &&
      tbReason.includes('система ящика') &&
      tbReason.includes('крепления фасада') &&
      !tbMap.release.ok,
    `коробов ${tbDrafts.boxes}, не подтверждено ${tbDrafts.unconfirmed} · «${tbReason.slice(-150) || 'ПРИЧИНЫ НЕТ'}»`,
  );
  /*
   * Присадка системы — тем же планом, что экран «Присадка» (`drillingPlan`):
   * ни одно отверстие системы не ставится (нет ни Ø, ни полной привязки), а
   * у каждой детали названо, что напечатано и чего не хватает.
   */
  const tbPlan = drillingPlan({ walls: panelWallsOf(null, wallSegments(null, tbRun, {}), tb.input.runWallId), production: SHOP, hardware: CATALOG });
  const hobParts = tbPlan.parts.filter((p) => p.moduleId === HOB);
  const hobSides = hobParts.filter((p) => p.role === 'side_left' || p.role === 'side_right');
  const hobFronts = hobParts.filter((p) => p.role === 'drawer_front');
  const hobBacks = hobParts.filter((p) => p.leaf?.includes(':box:wall:'));
  const sidePending = hobSides.flatMap((p) => p.pending.filter((x) => x.what.startsWith('направляющая на корпусе')));
  check(
    'TB5 присадка TANDEMBOX тем же планом: у боковин корпуса «не рассчитано» с причиной системы (высота ходовой не образмерена, а не «правило короба цеха не задано»); у каждого фронта — крепление фасада INSERTA (Ø 10, места «32 / min 47.5») словами; у каждой задней стенки — держатель словами; отверстий направляющих 0; выпуск заперт',
    hobSides.length === 2 &&
      sidePending.length === 2 * drawersOnHob &&
      sidePending.every((x) => x.why.some((w) => w.includes('ходовой системы ящика')) && !x.why.some((w) => w.includes('правило короба цеха'))) &&
      hobFronts.length === drawersOnHob &&
      hobFronts.every((p) => p.pending.some((x) => x.what.includes('INSERTA') && x.why.some((w) => w.includes('Ø 10') && w.includes('32 / min 47.5')))) &&
      hobBacks.length === drawersOnHob &&
      hobBacks.every((p) => p.pending.some((x) => x.what.includes('держатель задней стенки'))) &&
      hobParts.every((p) => p.ops.every((o) => o.role !== 'runner_cabinet' && o.role !== 'runner_drawer')) &&
      !tbPlan.release.open,
    `боковин ${hobSides.length}, причин ${sidePending.length}: «${sidePending[0]?.why.find((w) => w.includes('высота')) ?? 'НЕТ'}» · фронтов ${hobFronts.length} (INSERTA у ${hobFronts.filter((p) => p.pending.some((x) => x.what.includes('INSERTA'))).length}) · задних ${hobBacks.length} (держатель у ${hobBacks.filter((p) => p.pending.some((x) => x.what.includes('держатель'))).length})`,
  );

  /* Ход не одинаковый у всех моделей и нигде не длиннее самой направляющей. */
  const allSlides = Array.from(CATALOG.values()).filter((it) => it.hardware.category === 'slide' || /runner/.test(it.hardware.subcategory ?? ''));
  const travels = allSlides.map((it) => ({ it, m: runnerModelOf(it) }));
  const longer = travels.filter(({ it, m }) => m.travelBasis !== 'passport' && typeof it.hardware.dimensionsMm?.nominalLength === 'number' && m.travelMm > it.hardware.dimensionsMm.nominalLength + 1e-9);
  const byBasis = { passport: travels.filter((t) => t.m.travelBasis === 'passport').length, extension: travels.filter((t) => t.m.travelBasis === 'extension').length, conditional: travels.filter((t) => t.m.travelBasis === 'conditional').length };
  check(
    'RN4 ход по модели, а не один на всех: у направляющих каталога больше 30 разных ходов; кроме паспортного, ход не длиннее NL; у каждой — слова, откуда ход',
    new Set(travels.map((t) => t.m.travelMm)).size > 30 && longer.length === 0 && travels.every((t) => t.m.words.length > 0) && byBasis.passport === 15,
    `направляющих ${travels.length} · разных ходов ${new Set(travels.map((t) => t.m.travelMm)).size} · по паспорту ${byBasis.passport}, по виду выдвижения ${byBasis.extension}, условно ${byBasis.conditional}${longer.length ? ` · длиннее NL: ${longer.slice(0, 3).map((t) => t.it.article).join(', ')}` : ''}`,
  );
}

/* ═════════════════════════  HANDLE-REAL: ручки своей формой  ═════════════════════════ */

console.log('\nHANDLE-REAL: ручки своей формой — модель по паспорту, деталь, сцена, смета, раскрой');
handleChecks(check);

/* ═════════════════════════  ЭТАП 2: классы механизмов  ═════════════════════════ */

console.log('\nЭТАП 2: классы механизмов из записи производителя');
mechanismChecks(check);

/* ═════════════════════════  ЭТАП 3: варочная Bosch и духовой шкаф под ней  ═════════════════════════ */

console.log('\nЭТАП 3: техника производителя — варочная и духовой шкаф под ней, монтаж по инструкции, ход двери');
applianceChecks(check);

/* ═════════════════════════  HW-08: движок присадки  ═════════════════════════ */

drillingChecks(check);

/* ═════════════════════════  HW-03: петля в 3D  ═════════════════════════ */

hinge3dChecks(check);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
