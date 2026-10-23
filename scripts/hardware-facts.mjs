// Свод фактов фурнитуры производителей (HARDWARE-01).
//
// Вход — записи, сверенные по изображениям страниц каталогов в
// MANUFACTURER_CATALOGS (Blum, Hettich, Häfele): CATALOG_STAGING/02_HARDWARE/**/HW01_*_evidence.json.
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

const BRAND = { Blum: 'blum', Hettich: 'hettich', 'Häfele': 'hafele', Hafele: 'hafele' };

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

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Единица продажи — только названная источником. */
function saleUnitOf(category, packaging) {
  const p = String(packaging ?? '');
  if (!p) return undefined;
  if (/пара/i.test(p)) return 'pair';
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
    else if (/^HW01_.*_evidence\.json$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(STAGING).sort();
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
    if (seen.has(key)) {
      const kept = items[keptAt.get(key)];
      const same = JSON.stringify(Object.values(it.dimensionsMm ?? {}).sort()) === JSON.stringify(Object.values(firstRaw.get(key)?.dimensionsMm ?? {}).sort());
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
    const dimMap = { ...(DIM_MAP[family] ?? {}), ...(sub ? (DIM_MAP[`${family}/${sub}`] ?? {}) : {}) };
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
    const ktFormula = (Array.isArray(it.formulas) ? it.formulas : [])
      .map((f) => /Необходимое пространство \(глубина\):\s*NL\s*\+\s*(\d+(?:[.,]\d+)?)/.exec(String(f)))
      .find(Boolean);
    const ktAdd = ktFormula ? Number(ktFormula[1].replace(',', '.')) : null;
    if (ktAdd !== null && finite(dims.nominalLength) && !finite(dims.minCabinetDepth)) dims.minCabinetDepth = dims.nominalLength + ktAdd;
    const sale = saleUnitOf(category, it.packaging);
    /* Пустой список не пишется — как у разбора записи: иначе повтор своей выгрузки читался бы обновлением. */
    const printed = printedOf(it.dimensionsMm, it.ranges);
    if (ktAdd !== null && finite(dims.minCabinetDepth)) {
      printed.push({ label: 'Глубина корпуса по формуле паспорта (NL + ' + ktAdd + ')', value: String(dims.minCabinetDepth) });
    }
    const hardware = {
      category,
      ...(BRAND[manufacturer] ? { brand: BRAND[manufacturer] } : {}),
      manufacturer,
      manufacturerArticle: article,
      ...(it.officialName ? { officialName: it.officialName } : {}),
      ...(sub ? { subcategory: sub } : {}),
      ...(it.series ? { series: it.series } : {}),
      ...(it.variant ? { variant: [it.subcategory, it.variant].filter(Boolean).join(' · ') } : it.subcategory ? { variant: it.subcategory } : {}),
      ...(Object.keys(dims).length ? { dimensionsMm: dims } : {}),
      ...(Object.keys(ranges).length ? { ranges } : {}),
      ...(printed.length ? { printed } : {}),
      ...(Array.isArray(it.formulas) && it.formulas.length ? { formulas: it.formulas } : {}),
      ...(finite(it.loadCapacityKg) ? { loadCapacityKg: it.loadCapacityKg } : {}),
      ...(it.material ? { material: it.material } : {}),
      ...(it.finish ? { finish: it.finish } : {}),
      ...(it.movementType ? { movementType: it.movementType } : {}),
      ...(finite(it.motion?.openingAngleDeg) ? { openingAngleDeg: it.motion.openingAngleDeg } : {}),
      ...(finite(it.motion?.strokeMm) ? { strokeMm: it.motion.strokeMm } : {}),
      ...(it.packaging ? { packaging: it.packaging } : {}),
      ...(sale ? { saleUnit: sale } : {}),
      ...(it.compatibleWith ? { compatibleWith: it.compatibleWith } : {}),
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
      source: {
        file: it.source?.file,
        ...(finite(it.source?.pdfPage) ? { pdfPage: it.source.pdfPage } : {}),
        ...(it.source?.printedPage !== undefined && it.source?.printedPage !== null ? { printedPage: String(it.source.printedPage) } : {}),
        checkedAt: it.source?.checkedAt ?? CHECKED_AT,
      },
      rightsStatus: 'NOT_VERIFIED',
      engineeringStatus: it.engineeringStatus ?? 'MISSING_DATA',
      visualStatus: 'VISUAL_APPROXIMATION',
      ...(Array.isArray(it.missing) && it.missing.length ? { missing: it.missing } : {}),
      ...(it.notes ? { notes: it.notes } : {}),
    };
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
];
const notFound = [
  'BOYARD, GTV, DTC: каталогов в MANUFACTURER_CATALOGS нет — ни одного артикула этих марок.',
  'CAD Blum — только во входе на портал (MISSING_CAD).',
  'CAD Hettich публичен, но скачивание — согласие с условиями производителя (использовать только для продажи Hettich, без правок): решение владельца, не скачано.',
  'CAD BOYARD (11 архивов БАЗИС/К3/3ds Max) лежит локально в CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD — права не подтверждены, в продукт не идёт.',
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
console.log(`файлов ${files.length} · записей ${items.length} · повторов ${duplicates.length}`);
for (const [k, r] of Array.from(table.entries()).sort()) {
  console.log(`${k.padEnd(28)} ${String(r.total).padStart(4)}  VERIFIED ${r.VERIFIED}  PARTIAL ${r.PARTIAL}  CONFLICT ${r.CONFLICT}  прочее ${r.other}  единица продажи ${r.sale}`);
}
for (const d of duplicates) console.log(`  повтор: ${d}`);
console.log(`→ ${path.relative(ROOT, OUT)}`);
