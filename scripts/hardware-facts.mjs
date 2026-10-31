// Свод фактов фурнитуры производителей (HARDWARE-01).
//
// Вход — записи, сверенные по изображениям страниц каталогов в
// MANUFACTURER_CATALOGS и CATALOG_STAGING/HARDWARE_2026_10_30 (Blum, Hettich,
// Häfele, BOYARD, DTC и др.): CATALOG_STAGING/02_HARDWARE/**/HW01_*_evidence.json;
// вторым проходом — базы номенклатуры библиотек БАЗИС
// (HW01_*_library.json, их пишет scripts/hardware-library-facts.mjs): артикул,
// уже выписанный из каталога, библиотека только дополняет сведениями о 3D.
// Выход — data/catalog/hardware.json: запись изделия на каждый артикул.
//
// Что делает свод и чего не делает:
//   - размеры для подбора кладутся под каноническими именами движка
//     (lib/millwork/hardwareCatalog.ts, FIT_KEYS) — ТОЛЬКО по явной таблице
//     соответствий ниже, по производителю и группе; остальное — словами
//     «как напечатано» (printed), движок их не читает;
//   - единица продажи — только если источник её называет («50 шт.», «пара»,
//     «Комплект: 2 x …»); «1/10 компл.» не расшифрован — единицы нет;
//   - неизвестная группа или запись без артикула — падение с причиной, а
//     не молчаливый пропуск;
//   - артикул дважды — вторая запись не берётся, и это в отчёте свода.
//
// node scripts/hardware-facts.mjs  — пишет файл и печатает свод по группам.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const STAGING = path.join(ROOT, 'CATALOG_STAGING', '02_HARDWARE');
const OUT = path.join(ROOT, 'data', 'catalog', 'hardware.json');
const CHECKED_AT = '2026-10-21';

const CATEGORY = {
  slides: 'slide',
  hinges: 'hinge',
  lifts: 'lift',
  drawer_systems: 'drawer_system',
  carcass: 'carcass',
  sliding: 'sliding',
  wardrobe: 'wardrobe',
  kitchen: 'kitchen',
  handles: 'handle',
};

const BRAND = {
  Blum: 'blum',
  Hettich: 'hettich',
  'Häfele': 'hafele',
  Hafele: 'hafele',
  BOYARD: 'boyard',
  DTC: 'dtc',
  Firmax: 'firmax',
  FIRMAX: 'firmax',
  Alphalux: 'alphalux',
  ALPHALUX: 'alphalux',
  Unihopper: 'unihopper',
  UNIHOPPER: 'unihopper',
  'МФ-Комплект': 'mf',
};

/**
 * Производитель в артикуле — как в lib/millwork/hardwareCatalog.ts (manufacturerSlug);
 * совпадение по каждой записи сверяет verify-hardware A2.
 */
const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ә: 'a', ғ: 'g', қ: 'q', ң: 'n', ө: 'o', ұ: 'u',
  ү: 'u', һ: 'h', і: 'i',
};
function slug(name) {
  return (
    name
      .toLowerCase()
      .replace(/[а-яёәғқңөұүһі]/g, (letter) => CYRILLIC[letter] ?? '')
      .normalize('NFD')
      .replace(new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g'), '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '') || 'MFR'
  );
}
const articleKey = (manufacturer, article) => `MFR-${slug(manufacturer)}-${article.replace(/\s+/g, '')}`;

/* ── Подвид: канонический набор, по которому место модуля узнаёт позицию ── */
function canonicalSub(category, raw, item) {
  const s = String(raw ?? '');
  /* Тип петли напечатан словом в варианте (Häfele Metalla: «внешняя (накладная)»). */
  const printedKind = `${item?.variant ?? ''} ${item?.officialName ?? ''}`.toLowerCase();
  if (category === 'hinge') {
    /* Прокладка под планку — принадлежность: на место планки она не встаёт. */
    if (/spacer/.test(s)) return 'hinge_accessory';
    if (/mounting_plate/.test(s)) return 'mounting_plate';
    if (/opening_limiter|soft_close_addon|cover|limiter/.test(s)) return 'hinge_accessory';
    if (/blind_corner|false_panel|corner_90|angled|lift_hinge|lift_middle/.test(s)) return 'special';
    if (/half_overlay/.test(s)) return 'half_overlay';
    if (/inset/.test(s)) return 'inset';
    if (/overlay/.test(s)) return 'overlay';
    if (/concealed_hinge/.test(s)) {
      if (/полунакладн/.test(printedKind)) return 'half_overlay';
      if (/вкладн/.test(printedKind)) return 'inset';
      if (/накладн/.test(printedKind)) return 'overlay';
    }
    return 'special';
  }
  if (category === 'slide') {
    /* Стабилизатор, упор, регулятор, фиксатор — принадлежности направляющей, а не направляющая. */
    if (/stabilizer|depth_stop|adjuster|locking_device/.test(s)) return 'runner_accessory';
    if (/undermount|underfloor|concealed|hidden|movento|tandem/.test(s)) return 'undermount';
    if (/side_mount|ball_bearing|over_extension|heavy_duty/.test(s)) return 'side_mount';
    /* Роликовые (BOYARD DS / MB) — своя конструкция: под шариковую боковую короб не считается. */
    if (/roller/.test(s)) return 'roller';
    if (/groove/.test(s)) return 'groove_mount';
    if (/double_wall|drawer_system/.test(s)) return 'system_runner';
    return 'other';
  }
  if (category === 'lift') {
    if (/front_fixing|cover_caps|arm_set|opening_limiter|cabinet_fixing|cross_stabilizer|holder|adapter|power_pack|push_to_open/.test(s)) {
      return 'lift_accessory';
    }
    return s || 'lift_mechanism';
  }
  if (category === 'kitchen') {
    if (s === 'dish_dryer') return 'dish_dryer';
    if (s === 'corner_mechanism') return 'corner_unit';
    if (s === 'pullout_waste_bin') return 'waste';
    if (s === 'bottle_pullout') return 'bottle';
    if (s === 'two_tier_pullout' || s === 'multifunction_pullout') return 'cargo';
    if (s === 'tall_pullout_larder') return 'tall_cargo';
    return s || undefined;
  }
  if (category === 'wardrobe') {
    if (s === 'pantograph') return 'pantograph';
    if (s === 'trouser_rack' || s === 'trouser_laundry_pullout') return 'trouser_rack';
    if (s === 'pullout_shoe_rack' || s === 'shoe_drawer') return 'shoe_rack';
    if (s === 'tie_rack' || s === 'tie_belt_rack' || s === 'belt_rack' || s === 'scarf_rack') return 'tie_rack';
    if (s === 'pullout_basket' || s === 'laundry_pullout') return 'basket';
    if (s === 'inner_drawer' || s === 'pullout_rod') return s;
    return s || undefined;
  }
  return s || undefined;
}

/* ── Канонические размеры: явная таблица «как напечатано» → имя движка ── */
const DIM_MAP = {
  /* Системы ящиков Blum (HW-04): NL и высота царги — как напечатаны в строке заказа. */
  'Blum/drawer_system': { NL: 'nominalLength', 'Высота царги': 'sideHeight' },
  'Hettich/slide': {
    NL: 'nominalLength',
    KTmin: 'minCabinetDepth',
    mountingWidth: 'sideClearance',
    railHeight: 'railHeight',
    drawerSideMin: 'minDrawerSide',
    cabinetSideMin: 'minCabinetSide',
  },
  'Hettich/hinge': { 'Диаметр чашки': 'cupDiameter', 'Дистанция D': 'plateHeight' },
  'Blum/hinge': { Подъем: 'plateHeight' },
  'Blum/slide': {
    NL: 'nominalLength',
    'Боковина ящика max 16*': 'maxDrawerSide',
    'Боковина ящика 11–16 (min)': 'minDrawerSide',
    'Боковина ящика 11–16 (max)': 'maxDrawerSide',
  },
  'Hafele/slide': {
    длина: 'nominalLength',
    'длина (в описании, после 16/)': 'nominalLength',
    'зазор (на чертеже)': 'sideClearance',
    'монтаж к боковой стенке: зазор': 'sideClearance',
    'боковина ящика: ≤': 'maxDrawerSide',
  },
  'Hafele/hinge': { 'высота монтажной планки': 'plateHeight' },
  'Hafele/handle': {
    'Размер A (длина)': 'length',
    Длина: 'length',
    'Размер C (межосевое)': 'holeSpacing',
    'Размер C (межосевое крайних)': 'holeSpacing',
    'межосевое отверстий': 'holeSpacing',
  },
  /*
   * ФОРМА РУЧКИ (HANDLE-REAL) — только для картинки сцены, подбор её не читает.
   * Подписи — подвида: «высота» у скобы и кнопки — вылет от фасада, а у ручки
   * для кромок — высота пластины; общей таблицей их не развести.
   */
  'Hafele/handle/bar_handle': {
    'Размер B (высота)': 'projection',
    диаметр: 'diameter',
    'на чертеже: высота': 'projection',
    'на чертеже: диаметр': 'diameter',
  },
  'Hafele/handle/knob': {
    'Размер A (диаметр)': 'diameter',
    'Размер B (высота)': 'projection',
    диаметр: 'diameter',
    высота: 'projection',
  },
  'Hafele/handle/flush_handle': {
    'Размер A (диаметр фланца)': 'flangeDiameter',
    'Размер B (диаметр корпуса)': 'bodyDiameter',
    'Размер C (глубина корпуса)': 'bodyDepth',
    '3 (на чертеже, фланец)': 'flangeThickness',
    'диаметр фланца': 'flangeDiameter',
    'диаметр корпуса': 'bodyDiameter',
    'глубина корпуса': 'bodyDepth',
    'толщина фланца': 'flangeThickness',
  },
  /*
   * Ручка для кромок — по чертежам стр. 276–277: «ширина» — длина вдоль кромки
   * (28 и 80 мм у малых), B — глубина профиля в плане (у 126.14 подписана
   * «высотой», на чертеже это вид сверху), у волнистой у краёв 20 мм;
   * 16 и 19 — стенка по тылу фасада, 11 и 27 — губа по лицу.
   */
  'Hafele/handle/edge_handle': {
    ширина: 'length',
    'Размер B (ширина профиля)': 'edgeDepth',
    'Размер B (высота)': 'edgeDepth',
    '20 (на чертеже)': 'edgeDepthEnd',
    'профиль: 19 (на чертеже)': 'backLeg',
    '16 (на чертеже)': 'backLeg',
    высота: 'backLeg',
    'профиль: 11 (на чертеже)': 'lipHeight',
    '27 (на чертеже)': 'lipHeight',
    вылет: 'edgeReach',
    '19.8 (на чертеже, вылет)': 'edgeReach',
    толщина: 'sheetThickness',
  },
  'Hafele/kitchen': { 'Ширина корпуса': 'cabinetWidth' },
  'Hafele/wardrobe': {
    'Номинальная длина': 'nominalLength',
    'Глубина механизма в свету': 'minInnerDepth',
    'длина (в описании)': 'length',
    длина: 'length',
  },
  /* Габарит механизма — только для картинки сцены (VISUAL_APPROXIMATION), подбор его не читает. */
  'Hafele/lift': { 'высота механизма (на чертеже)': 'mechanismHeight', 'глубина механизма (на чертеже)': 'mechanismDepth' },
  'Blum/lift': {
    'min LH (внутренняя высота корпуса)': 'minInnerHeight',
    'LH мин.': 'minInnerHeight',
    'LT мин. (внутренняя глубина корпуса)': 'minInnerDepth',
    'LT мин.': 'minInnerDepth',
    '187 (глубина механизма)': 'mechanismDepth',
  },
};
/*
 * НОВЫЕ МАРКИ HW-01 (BOYARD, DTC) — только однозначные подписи свидетельств.
 * «D» у ручек BOYARD (не сказано, что это) и «глубина чашки» DTC (глубина
 * самой чашки, а не сверления) не сводятся: остаются словами в `printed`.
 */
Object.assign(DIM_MAP, {
  'BOYARD/hinge': { 'd отверстия (Ø чашки)': 'cupDiameter', 'Глубина сверления': 'cupDepth', 'H (высота планки)': 'plateHeight' },
  'BOYARD/slide': {
    NL: 'nominalLength',
    'NL (номинальная длина направляющей)': 'nominalLength',
    'NL (по коду и по «Для размеров: 450 / 500» схемы присадки)': 'nominalLength',
    'монтажный зазор 12,7 (±0,2)': 'sideClearance',
  },
  'BOYARD/drawer_system': { 'NL (монтажная длина = длина направляющих с боковой стенкой)': 'nominalLength' },
  'BOYARD/kitchen': { 'A — ширина кухонного шкафа': 'cabinetWidth' },
  'BOYARD/handle': { L: 'length', N: 'holeSpacing', 'N по коду артикула': 'holeSpacing' },
  'BOYARD/handle/bar_handle': { H: 'projection' },
  'BOYARD/handle/rail_handle': { H: 'projection' },
  'BOYARD/handle/knob': { L: 'diameter', H: 'projection' },
  'DTC/hinge': { 'Диаметр чашки петли': 'cupDiameter', 'Высота планки H': 'plateHeight' },
  'DTC/kitchen': { 'Ширина корпуса': 'cabinetWidth', 'KB (ширина корпуса)': 'cabinetWidth' },
  'DTC/lift': {
    'Min200 (внутренняя высота шкафа)': 'minInnerHeight',
    'Min240 (внутренняя глубина шкафа)': 'minInnerDepth',
    'min280 (внутренняя глубина корпуса)': 'minInnerDepth',
    'min285 (Internal Cabinet Depth)': 'minInnerDepth',
  },
  'DTC/wardrobe': { 'NL (направляющая)': 'nominalLength', 'внутренняя глубина короба min': 'minInnerDepth' },
});

/*
 * ПОДПИСИ БИБЛИОТЕК БАЗИС (scripts/hardware-library-facts.mjs) — число из
 * текста названия позиции; подпись говорит это сама. Сводятся только те,
 * по которым подбор проверяет посадку.
 */
const LIBRARY_DIM_MAP = {
  'NL (по названию)': 'nominalLength',
  'Подъём планки H (по названию)': 'plateHeight',
  'Ширина корпуса («в базу», по названию)': 'cabinetWidth',
  'Длина (по названию)': 'length',
};

const RANGE_MAP = {
  'Hettich/hinge': {
    'Толщина двери, мм': 'doorThickness',
    'Расстояние до чашки C (PDF 53), мм': 'boringDistance',
    'Расстояние до чашки C (PDF 63), мм': 'boringDistance',
    'Расстояние до чашки C в таблицах PDF 28, мм': 'boringDistance',
    'Расстояние до чашки C в таблицах PDF 49, мм': 'boringDistance',
  },
  'Hettich/carcass': { 'Диапазон регулировки, мм': 'legHeight' },
  'Hettich/lift': { 'Толщина двери / рамы, мм': 'doorThickness' },
  'Hettich/sliding': { 'Ширина двери TB, мм': 'doorWidth', 'Высота двери TH, мм': 'doorHeight' },
  'Blum/slide': { drawerSideThicknessMm: 'drawerSide', 'drawerSideThicknessMm (max 16*)': 'drawerSide' },
  'Hafele/slide': { 'толщина боковины': 'drawerSide' },
  'Hafele/hinge': {
    'расстояние до чашки E, мм': 'boringDistance',
    'наложение при планке 2 мм (E 3…6)': 'overlayMd2',
    'наложение при планке 2 мм (E 3…4)': 'overlayMd2',
    'наложение при планке 4 мм (E 3…6)': 'overlayMd4',
    'наложение при планке 6 мм (E 3…6)': 'overlayMd6',
  },
  'Hafele/kitchen': { 'Ширина корпуса': 'cabinetWidth' },
  'Hafele/wardrobe': {
    'ширина корпуса в свету': 'cabinetInnerWidth',
    'ширина корпуса в свету A': 'cabinetInnerWidth',
    'толщина боковины (на чертеже 16–19)': 'carcassSide',
  },
  'Hafele/sliding': { 'толщина двери': 'doorThickness', 'толщина дверей': 'doorThickness' },
  /* Высоты Free Flap / Free Fold / Free Space не сводятся: в источнике «высота корпуса» и «высота фасада» спорят (CONFLICT). */
  'Hafele/lift': { 'высота фасада (с. 49), мм': 'frontHeight' },
  'Blum/hinge': {
    'TB (расстояние от чашки)': 'boringDistance',
    'FA при MD 0': 'overlayMd0',
    'FA при MD 3': 'overlayMd3',
    'FA при MD 6': 'overlayMd6',
    'FA при MD 9': 'overlayMd9',
  },
  'Blum/lift': {
    cabinetHeightKHmm: 'cabinetHeight',
    powerFactorLF: 'powerFactor',
    sideThicknessSWDmm: 'carcassSide',
    cabinetWidthKBmm: 'cabinetOuterWidth',
  },
};

Object.assign(RANGE_MAP, {
  'BOYARD/hinge': { 'наложение D при H=0': 'overlayMd0', 'наложение D при H=2': 'overlayMd2', 'наложение D при H=4': 'overlayMd4' },
  'BOYARD/slide': { 'толщина плиты (боковины ящика), мм — обзор стр. 174': 'drawerSide' },
  'DTC/hinge': { 'Диапазон толщины двери': 'doorThickness', 'Диапазон толщин фасада': 'doorThickness' },
  'DTC/lift': {
    'индекс мощности LF (KH мм x вес двери кг)': 'powerFactor',
    'толщина двери, мм': 'doorThickness',
    'высота фасада, мм': 'frontHeight',
    'высота фасада KH, мм': 'frontHeight',
    'высота фасада (KH), мм': 'frontHeight',
    'высота корпуса KH, мм': 'cabinetHeight',
    'высота шкафа KH, мм': 'cabinetHeight',
  },
});

/*
 * TB ПЕТЛИ BOYARD: таблица даёт K + ½d (от кромки фасада до ЦЕНТРА чашки) и d —
 * TB (до края чашки) = (K + ½d) − d / 2. Арифметика двух напечатанных чисел,
 * а не допущение; в `printed` остаётся и исходная подпись, и вывод.
 */
const BOYARD_K = 'K+½d (от кромки фасада до центра чашки)';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Единица продажи — только названная источником. */
function saleUnitOf(category, packaging) {
  /* «от 1000 шт. с индивид. логотипом» — минимальный тираж, а не единица продажи (HW-04). */
  const p = String(packaging ?? '').replace(/от\s+\d+\s*шт\.?/gi, '');
  if (!p.trim()) return undefined;
  if (/пара/i.test(p)) return 'pair';
  /* «1 x царги, левая/правая» — комплект на ящик: левая и правая одной позицией. */
  if (/(^|\s)1\s*[xх×]\s*[^;|]*лев\S*\s*\/\s*прав/i.test(p)) return 'pair';
  if (/Состав комплекта:\s*2\s+направляющ/i.test(p)) return 'pair';
  if (/Комплект:\s*2\s*x/i.test(p)) return category === 'slide' ? 'pair' : 'set';
  if (/(^|\s)\d+\s*шт/i.test(p)) return 'piece';
  return undefined;
}

function printedOf(dims, ranges) {
  const out = [];
  for (const [label, value] of Object.entries(dims ?? {})) {
    out.push({ label, value: finite(value) ? String(value) : '—' });
  }
  for (const [label, value] of Object.entries(ranges ?? {})) {
    if (!Array.isArray(value)) continue;
    const [a, b] = value;
    out.push({ label, value: `${finite(a) ? a : '—'}…${finite(b) ? b : '—'}` });
  }
  return out;
}

/** «32 между отверстиями; 37 от кромки» → { spacing: 32, fromEdge: 37 }. Не напечатано обоих — null. */
/** Текст поля — как его читает разбор записи (`text` в lib/millwork/hardware.ts): без краевых пробелов, пустое не пишется. */
const clean = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

function plateHolesOfText(value) {
  const text = String(value ?? '');
  const spacing = /(\d+(?:[.,]\d+)?)\s*между\s+отверсти/.exec(text) ?? /межосев\S*\s+расстояни\S*\s+(\d+(?:[.,]\d+)?)/.exec(text);
  const edge = /(\d+(?:[.,]\d+)?)\s*от\s+(?:передней\s+)?кромки/.exec(text) ?? /LR\s+(\d+(?:[.,]\d+)?)\s+от\s+передней/.exec(text);
  if (!spacing || !edge) return null;
  return { spacing: Number(spacing[1].replace(',', '.')), fromEdge: Number(edge[1].replace(',', '.')) };
}

function nameOf(item, category, dims) {
  const parts = [item.manufacturer, item.series || '', ''];
  if (category === 'slide' && finite(dims.nominalLength)) parts[2] = `NL ${dims.nominalLength}`;
  else parts[2] = item.officialName && !String(item.series ?? '').includes(item.officialName) ? item.officialName : '';
  const name = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return `${name.length > 100 ? `${name.slice(0, 99)}…` : name} · ${item.manufacturerArticle}`;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/^HW01_.*_(evidence|library)\.json$/.test(entry.name)) out.push(full);
  }
  return out;
}

/* Сначала каталоги производителей, потом библиотеки: повтор артикула из библиотеки — дополнение, а не спор. */
const all = walk(STAGING).sort();
const files = [...all.filter((f) => f.endsWith('_evidence.json')), ...all.filter((f) => f.endsWith('_library.json'))];
let libraryOnly = 0;
let libraryMerged = 0;
const items = [];
const seen = new Map();
/* Первая запись артикула: сырьё для сравнения повтора и место в своде. */
const firstRaw = new Map();
const keptAt = new Map();
const duplicates = [];
const errors = [];

for (const file of files) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${path.relative(ROOT, file)}: JSON не читается — ${error.message}`);
    continue;
  }
  const list = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : null;
  if (!list) {
    errors.push(`${path.relative(ROOT, file)}: нет списка записей`);
    continue;
  }
  for (const it of list) {
    const where = `${path.relative(ROOT, file)} · ${it?.manufacturerArticle ?? '—'}`;
    const manufacturer = String(it?.manufacturer ?? '').trim();
    const article = String(it?.manufacturerArticle ?? '').trim();
    const category = CATEGORY[it?.category];
    if (!manufacturer || !article) {
      errors.push(`${where}: нет производителя или артикула`);
      continue;
    }
    if (!category) {
      errors.push(`${where}: группа «${it?.category}» не сведена в таблице CATEGORY`);
      continue;
    }
    const key = articleKey(manufacturer, article);
    const fromLibrary = file.endsWith('_library.json');
    if (fromLibrary && seen.has(key)) {
      /* Артикул выписан из каталога — библиотека добавляет только то, что у неё есть 3D (формат БАЗИС, права не подтверждены). */
      const kept = items[keptAt.get(key)];
      if (kept && it.library) {
        const ref = { format: 'BAZIS', file: it.library.zip, rightsStatus: 'NOT_VERIFIED', files: it.library.cadFiles };
        kept.hardware.cad = [...(kept.hardware.cad ?? []).filter((c) => c.file !== ref.file), ref];
      }
      libraryMerged += 1;
      continue;
    }
    if (seen.has(key)) {
      const kept = items[keptAt.get(key)];
      /* Размеры есть только у одной записи — это недостающее, а не спор источника. */
      const dimsA = Object.values(it.dimensionsMm ?? {});
      const dimsB = Object.values(firstRaw.get(key)?.dimensionsMm ?? {});
      const same = dimsA.length === 0 || dimsB.length === 0 || JSON.stringify(dimsA.sort()) === JSON.stringify(dimsB.sort());
      if (kept && !same) {
        kept.hardware.engineeringStatus = 'CONFLICT';
        const note = `Артикул ${article} напечатан и у «${it.officialName ?? '—'}» (${where}) с другими размерами — какое изделие под ним, не угадываем.`;
        kept.hardware.notes = kept.hardware.notes ? `${kept.hardware.notes} ${note}` : note;
      }
      duplicates.push(`${key}: вторая запись (${where}) не взята — первая из ${seen.get(key)}${same ? ' (те же размеры)' : ' — размеры другие: первая помечена CONFLICT'}`);
      continue;
    }
    seen.set(key, path.relative(ROOT, file));
    firstRaw.set(key, it);

    const family = `${manufacturer === 'Häfele' ? 'Hafele' : manufacturer}/${category}`;
    const sub = canonicalSub(category, it.subcategory, it);
    /* Подписи подвида дополняют подписи семейства: «высота» скобы и ручки для кромок — разные величины. */
    const dimMap = { ...LIBRARY_DIM_MAP, ...(DIM_MAP[family] ?? {}), ...(sub ? (DIM_MAP[`${family}/${sub}`] ?? {}) : {}) };
    const rangeMap = RANGE_MAP[family] ?? {};
    const dims = {};
    const ranges = {};
    for (const [label, value] of Object.entries(it.dimensionsMm ?? {})) {
      const canon = dimMap[label];
      if (canon && finite(value)) dims[canon] = value;
    }
    for (const [label, value] of Object.entries(it.ranges ?? {})) {
      const canon = rangeMap[label];
      if (!canon || !Array.isArray(value)) continue;
      const [a, b] = value;
      if (canon === 'drawerSide') {
        if (finite(a)) dims.minDrawerSide = a;
        if (finite(b)) dims.maxDrawerSide = b;
        continue;
      }
      if (finite(a) && finite(b) && a <= b) ranges[canon] = [a, b];
      else if (!finite(a) && finite(b) && canon === 'cabinetOuterWidth') dims.maxCabinetWidth = b;
    }
    if (family === 'BOYARD/hinge' && Array.isArray(it.ranges?.[BOYARD_K]) && finite(dims.cupDiameter)) {
      const [a, b] = it.ranges[BOYARD_K];
      if (finite(a) && finite(b)) ranges.boringDistance = [Math.round((a - dims.cupDiameter / 2) * 10) / 10, Math.round((b - dims.cupDiameter / 2) * 10) / 10];
    }
    /*
     * ПЕТЛЯ И ПЛАНКА (HW-03): напечатанные числа присадки — ещё и под
     * каноническими именами. Сцена читает лёгкую запись (без присадки и
     * заметок), присадка — паспорт; одно число под одним именем даёт обеим
     * одно место чашки и одну планку. Разбор строки расстояний — только здесь.
     */
    const specs = Array.isArray(it.drilling) ? it.drilling : [];
    const cupSpec = specs.find((d) => d.part === 'door' && /чашк/i.test(String(d.what ?? ''))) ?? specs.find((d) => d.part === 'door');
    if (category === 'hinge' && cupSpec) {
      if (finite(cupSpec.diameterMm) && !finite(dims.cupDiameter)) dims.cupDiameter = cupSpec.diameterMm;
      if (finite(cupSpec.depthMm) && !finite(dims.cupDepth)) dims.cupDepth = cupSpec.depthMm;
    }
    const flb = category === 'hinge' ? /FLB\s+(\d+(?:[.,]\d+)?)/.exec(String(it.notes ?? '')) : null;
    if (flb) dims.flangeWidth = Number(flb[1].replace(',', '.'));
    const plateHoles = category === 'hinge' ? plateHolesOfText(specs.find((d) => d.part === 'cabinet_side')?.positionsMm) : null;
    if (plateHoles) {
      dims.plateHoleSpacing = plateHoles.spacing;
      dims.plateHoleFromEdge = plateHoles.fromEdge;
    }
    /*
     * КОРОБ СКРЫТОГО МОНТАЖА (HW-04): формулы паспорта — под каноническими
     * именами. «SKW = LW – 42» — внутренняя ширина ящика на 42 мм меньше
     * внутренней ширины корпуса; «SKL = NL – 10» — длина ящика. Только как
     * напечатано; нет формулы — имени нет, и короб не считается.
     */
    const formulaText = (Array.isArray(it.formulas) ? it.formulas : []).join(' | ');
    const skw = /SKW\s*=\s*LW\s*[–-]\s*(\d+(?:[.,]\d+)?)/.exec(formulaText);
    if (skw && category === 'slide') dims.drawerInnerDeduct = Number(skw[1].replace(',', '.'));
    const skl = /SKL\s*=\s*NL\s*[–-]\s*(\d+(?:[.,]\d+)?)/.exec(formulaText);
    if (skl && category === 'slide') dims.drawerLengthDeduct = Number(skl[1].replace(',', '.'));
    /*
     * СИСТЕМА ЯЩИКА (HW-04): раскрой дна и задней стенки по формулам паспорта
     * («Дно A — ширина LW – 75 мм; длина NL – 24 мм (задняя стенка из ДСП)»,
     * «задняя стенка из ДСП B — 84 мм x (LW – 87 мм)»). Только как напечатано.
     */
    if (category === 'drawer_system') {
      const bw = /[Дд]но[^|]*?(?:ширина\s*)?LW\s*[–-]\s*(\d+(?:[.,]\d+)?)/.exec(formulaText);
      const bl = /длина\s*NL\s*[–-]\s*(\d+(?:[.,]\d+)?)\s*мм\s*\(задняя стенка из ДСП\)/.exec(formulaText);
      const back = /задн\S*\s+стенк\S*\s+из\s+ДСП\s+B\s*[—-]\s*(\d+(?:[.,]\d+)?)\s*мм\s*x\s*\(LW\s*[–-]\s*(\d+(?:[.,]\d+)?)/.exec(formulaText);
      if (bw) dims.bottomWidthDeduct = Number(bw[1].replace(',', '.'));
      if (bl) dims.bottomLengthDeduct = Number(bl[1].replace(',', '.'));
      if (back) {
        dims.backHeight = Number(back[1].replace(',', '.'));
        dims.backWidthDeduct = Number(back[2].replace(',', '.'));
      }
    }
    const ktFormula = (Array.isArray(it.formulas) ? it.formulas : [])
      .map((f) => /Необходимое пространство \(глубина\):\s*NL\s*\+\s*(\d+(?:[.,]\d+)?)/.exec(String(f)))
      .find(Boolean);
    const ktAdd = ktFormula ? Number(ktFormula[1].replace(',', '.')) : null;
    if (ktAdd !== null && finite(dims.nominalLength) && !finite(dims.minCabinetDepth)) dims.minCabinetDepth = dims.nominalLength + ktAdd;
    const sale = saleUnitOf(category, it.packaging);
    /* Пустой список не пишется — как у разбора записи: иначе повтор своей выгрузки читался бы обновлением. */
    const printed = printedOf(it.dimensionsMm, it.ranges);
    if (ranges.boringDistance && family === 'BOYARD/hinge') {
      printed.push({ label: 'TB = (K + ½d) − d/2 (по таблице)', value: `${ranges.boringDistance[0]}…${ranges.boringDistance[1]}` });
    }
    if (ktAdd !== null && finite(dims.minCabinetDepth)) {
      printed.push({ label: 'Глубина корпуса по формуле паспорта (NL + ' + ktAdd + ')', value: String(dims.minCabinetDepth) });
    }
    const hardware = {
      category,
      ...(BRAND[manufacturer] ? { brand: BRAND[manufacturer] } : {}),
      manufacturer,
      manufacturerArticle: article,
      ...(clean(it.officialName) ? { officialName: clean(it.officialName) } : {}),
      ...(sub ? { subcategory: sub } : {}),
      ...(clean(it.series) ? { series: clean(it.series) } : {}),
      ...(it.variant ? { variant: [it.subcategory, it.variant].filter(Boolean).join(' · ') } : it.subcategory ? { variant: it.subcategory } : {}),
      ...(Object.keys(dims).length ? { dimensionsMm: dims } : {}),
      ...(Object.keys(ranges).length ? { ranges } : {}),
      ...(printed.length ? { printed } : {}),
      ...(Array.isArray(it.formulas) && it.formulas.length ? { formulas: it.formulas } : {}),
      ...(finite(it.loadCapacityKg) ? { loadCapacityKg: it.loadCapacityKg } : {}),
      ...(clean(it.material) ? { material: clean(it.material) } : {}),
      ...(clean(it.finish) ? { finish: clean(it.finish) } : {}),
      ...(clean(it.movementType) ? { movementType: clean(it.movementType) } : {}),
      ...(finite(it.motion?.openingAngleDeg) ? { openingAngleDeg: it.motion.openingAngleDeg } : {}),
      ...(finite(it.motion?.strokeMm) ? { strokeMm: it.motion.strokeMm } : {}),
      ...(clean(it.packaging) ? { packaging: clean(it.packaging) } : {}),
      ...(sale ? { saleUnit: sale } : {}),
      ...(clean(it.compatibleWith) ? { compatibleWith: clean(it.compatibleWith) } : {}),
      ...(Array.isArray(it.drilling) && it.drilling.length
        ? {
            drilling: it.drilling.map((d) => ({
              part: d.part,
              what: d.what,
              diameterMm: finite(d.diameterMm) ? d.diameterMm : null,
              depthMm: finite(d.depthMm) ? d.depthMm : null,
              positionsMm: d.positionsMm ?? null,
              datum: d.datum ?? null,
            })),
          }
        : {}),
      ...(it.library
        ? { cad: [{ format: 'BAZIS', file: it.library.zip, rightsStatus: 'NOT_VERIFIED', files: it.library.cadFiles }] }
        : {}),
      source: {
        /* Библиотека: файл — архив, запись — база номенклатуры внутри него. */
        file: it.library ? it.library.zip : it.source?.file,
        ...(it.library ? { entry: String(it.source?.file ?? '').split('!').slice(1).join('!') } : {}),
        ...(finite(it.source?.pdfPage) ? { pdfPage: it.source.pdfPage } : {}),
        ...(it.source?.printedPage !== undefined && it.source?.printedPage !== null ? { printedPage: String(it.source.printedPage) } : {}),
        checkedAt: it.source?.checkedAt ?? CHECKED_AT,
      },
      rightsStatus: 'NOT_VERIFIED',
      engineeringStatus: it.engineeringStatus ?? 'MISSING_DATA',
      visualStatus: 'VISUAL_APPROXIMATION',
      ...(Array.isArray(it.missing) && it.missing.length ? { missing: it.missing } : {}),
      ...(clean(it.notes) ? { notes: clean(it.notes) } : {}),
    };
    if (fromLibrary) libraryOnly += 1;
    keptAt.set(key, items.length);
    items.push({ article: key, ...(hardware.brand ? { brand: hardware.brand } : {}), name: nameOf(it, category, dims), hardware });
  }
}

if (errors.length > 0) {
  console.error(`СВОД НЕ СОБРАН: ${errors.length} ошибок`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

items.sort((a, b) => a.article.localeCompare(b.article));

const sources = [
  {
    key: 'BLUM',
    manufacturer: 'Blum',
    file: 'MANUFACTURER_CATALOGS/BLUM/raw/Каталог и техническое руководство 2024-2025 ru.pdf',
    pages: 758,
    pageRule: 'печатная = индекс pdf.js − 4',
  },
  {
    key: 'HET',
    manufacturer: 'Hettich',
    file: 'MANUFACTURER_CATALOGS/HETTICH/raw/TA_KSP_ROW_2018_ru_RU.pdf',
    pages: 2122,
    pageRule: 'печатная = индекс PDF − 6',
  },
  {
    key: 'HK',
    manufacturer: 'Häfele',
    file: 'MANUFACTURER_CATALOGS/HAFELE/raw/КОМПАКТ 2025 (optimized).pdf',
    pages: 176,
    pageRule: 'печатная = индекс PDF; текста нет — читалось изображением',
  },
  { key: 'HK-BIG', manufacturer: 'Häfele', file: 'MANUFACTURER_CATALOGS/HAFELE/raw/Большой каталог HAFELE. Мебельная фурнитура. Дизайн.pdf', pages: 687, pageRule: 'ручки (слой 63) — номер страницы как в записи' },
  { key: 'BOYARD-F', manufacturer: 'BOYARD', file: 'MANUFACTURER_CATALOGS/BOYARD/raw/Каталог функциональной фурнитуры BOYARD 2024.pdf', pages: 352, pageRule: 'печатная = индекс PDF; оглавление каталога занижено на 2' },
  { key: 'BOYARD-D', manufacturer: 'BOYARD', file: 'MANUFACTURER_CATALOGS/BOYARD/raw/Каталог лицевой фурнитуры BOYARD 2024.pdf', pages: 300, pageRule: 'печатная = индекс PDF' },
  { key: 'DTC-AXERA', manufacturer: 'DTC', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/AXERA_RU.pdf', pages: 35, pageRule: 'страница PDF — разворот: печатные 2n−3 и 2n−2' },
  { key: 'DTC-AXERA-X', manufacturer: 'DTC', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/AXERA_X_RU.pdf', pages: 43, pageRule: 'страница PDF — разворот: печатные 2n−3 и 2n−2' },
  { key: 'DTC-PIVOT', manufacturer: 'DTC', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/Pivot_Star.pdf', pages: 16, pageRule: 'печатная = индекс PDF + 12' },
  { key: 'DTC-STYLISH', manufacturer: 'DTC', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/Stylish.pdf', pages: 18, pageRule: 'печатная = индекс PDF + 28 (стр. 1–11) и + 30 (стр. 12–18)' },
  { key: 'DTC-TOPSTAY', manufacturer: 'DTC', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/Top_Stay.pdf', pages: 20, pageRule: 'печатная = индекс PDF + 129 (стр. 1–8), + 130 (стр. 11–20); стр. 9–10 без номера' },
  { key: 'DTC-LEAFLETS', manufacturer: 'DTC', file: 'CATALOG_STAGING/HARDWARE_2026_10_30 (10 листовок PURE-PRO: HQ, LK, LQ, LY)', pages: null, pageRule: 'листовки по 1–4 страницы, печатных номеров нет' },
  { key: 'LIB-TBM', manufacturer: 'DTC, Firmax, Alphalux', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/TBM_11_25.zip', pages: null, pageRule: 'база номенклатуры БАЗИС (XML) — страниц нет' },
  { key: 'LIB-COKA', manufacturer: 'Unihopper', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/Гардеробные системы COKA.zip', pages: null, pageRule: 'база номенклатуры БАЗИС (XML) — страниц нет' },
  { key: 'LIB-MF', manufacturer: 'МФ-Комплект', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/MF Посудосушители Var3e.zip', pages: null, pageRule: 'база номенклатуры БАЗИС (XML) — страниц нет' },
  { key: 'LIB-BOYARD', manufacturer: 'BOYARD', file: 'CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads (11 архивов БАЗИС)', pages: null, pageRule: 'базы номенклатуры архивов (XML) — страниц нет' },
];
const notFound = [
  'GTV: каталога нет — ни одного артикула этой марки.',
  'Firmax, Alphalux, Unihopper, МФ-Комплект: PDF-каталогов нет — артикулы только из баз номенклатуры библиотек БАЗИС (без чертежей, статус не выше PARTIAL).',
  'CAD Blum — только во входе на портал (MISSING_CAD).',
  'CAD Hettich публичен, но скачивание — согласие с условиями производителя (использовать только для продажи Hettich, без правок): решение владельца, не скачано.',
  'CAD BOYARD (11 архивов БАЗИС/3ds Max) и библиотеки ТБМ, COKA, MF Var3e (формат БАЗИС .f3d/.fr3d/.b3d, двоичный) лежат локально — права не подтверждены, в продукт не идут; у записей отмечено наличием (`cad`).',
  'Häfele: сайт отвечает 403 / TLS — CAD и паспорта не проверены.',
];

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({ checkedAt: CHECKED_AT, sources, notFound, items }, null, 1)}\n`);

/* ── Свод: производитель × группа × статус ── */
const table = new Map();
for (const item of items) {
  const k = `${item.hardware.manufacturer} / ${item.hardware.category}`;
  const row = table.get(k) ?? { total: 0, VERIFIED: 0, PARTIAL: 0, CONFLICT: 0, other: 0, sale: 0 };
  row.total += 1;
  const s = item.hardware.engineeringStatus;
  if (s === 'VERIFIED' || s === 'PARTIAL' || s === 'CONFLICT') row[s] += 1;
  else row.other += 1;
  if (item.hardware.saleUnit) row.sale += 1;
  table.set(k, row);
}
console.log(`файлов ${files.length} · записей ${items.length} · повторов ${duplicates.length} · из библиотек БАЗИС: своих ${libraryOnly}, дополнили каталог ${libraryMerged}`);
for (const [k, r] of Array.from(table.entries()).sort()) {
  console.log(`${k.padEnd(28)} ${String(r.total).padStart(4)}  VERIFIED ${r.VERIFIED}  PARTIAL ${r.PARTIAL}  CONFLICT ${r.CONFLICT}  прочее ${r.other}  единица продажи ${r.sale}`);
}
for (const d of duplicates) console.log(`  повтор: ${d}`);
console.log(`→ ${path.relative(ROOT, OUT)}`);
