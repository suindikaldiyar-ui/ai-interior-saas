import { OBJECT_MARKS, productionFor, withMark } from '../lib/millwork/shop';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '../types/catalog';
import {
  TYPICAL_MILLING,
  millingCatalog,
  millingChoices,
  millingLink,
  millingOf,
  profileOf,
  typicalMillingItem,
} from '../lib/millwork/milling';
import { fetchCatalog, patchCatalogItem } from '../lib/catalog';
import catalogJson from '../data/catalog/catalog.json';
import {
  catalogEntriesFromRows,
  collectionOf,
  importPreview,
  isBoardItem,
  materialCatalog,
  materialDefs,
  materialItemOf,
  materialOps,
  materialTabs,
  parseMaterialFile,
  planMaterialImport,
  searchMaterials,
  whiteLdspOf,
} from '../lib/millwork/materialCatalog';
import { mapReviewRecords, type ReviewRecord } from '../lib/millwork/supplierReview';
import { MATERIAL_FINISHES } from '../lib/millwork/materialFinishes';
import { buildRun } from '../lib/millwork/layout';
import { applyOps } from '../lib/millwork/ops';
import { buildEstimate, totalCaption, unpricedLines } from '../lib/millwork/estimate';
import { buildPanels } from '../lib/millwork/panels';
import { DEFAULT_REQUIREMENTS } from '../lib/millwork/workspace';
import { DEMO_RATES } from '../lib/millwork/demo';
import { existsSync, readFileSync } from 'node:fs';
import type { MillworkOp } from '../types/millwork';
import { paletteFromCatalog } from '../lib/millwork/palette';
import { carcassCatalog } from '../lib/millwork/carcassMaterial';
import { REFERENCE_SCALE, REFERENCE_TEXTURES } from '../lib/millwork/referenceTextures.generated';
import { referenceKeyOf, referenceUrl, withReferences } from '../lib/millwork/referenceTextures';
import { WOOD_TILE_MM, isWoodDecor, woodPatternUrl } from '../lib/millwork/woodPattern';
import { DEMO_CATALOG } from '../lib/millwork/demo';
/**
 * Приёмка фазы 3 — та её часть, что проверяется без живого Supabase:
 * разбор выгрузок из 1С, расчёт спецификации, правила «фото → комната».
 *
 * Запуск: npm run test:catalog
 * RLS и мультиарендность проверяются отдельно: npm run test:rls (нужны ключи).
 */

import { decodeCsvBuffer, normalizeUnit, parseCatalogCsv, parseCsv } from '../lib/csv';
import {
  hardwareByCategory,
  hardwareCatalog,
  hasMountingData,
} from '../lib/millwork/hardware';
import { buildSpec, quantityFor, specTotal, surfaceArea } from '../lib/catalog';
import { roomFromAnalysis } from '../lib/roomFromAnalysis';
import {
  REQUIRED_RATE_KEYS,
  TYPICAL_CATEGORIES,
  TYPICAL_PRICE_LIST,
  orphanTypicalRates,
} from '../lib/millwork/rates';
import { needsConfirmation } from '../types/roomAnalysis';
import { targetsFor, targetLabel, type CatalogEntryFull } from '../types/catalog';
import { DEFAULT_ROOM, type RoomConfig } from '../types/interior';
import type { RoomAnalysis } from '../types/roomAnalysis';

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

const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

/* ─────────────────────────  CSV из 1С  ───────────────────────── */

console.log('\nВыгрузка из 1С');
{
  // UTF-8 с BOM, разделитель ';', кириллица, цена с пробелом и запятой.
  const csv =
    'article;name;category_key;price;unit\r\n' +
    'PRK-2214;Паркет дуб «Натуральный»;flooring;12 500,50;м2\r\n' +
    'KER-8801;Керамогранит под мрамор;wall-tile;9 800;м²\r\n' +
    'KUH-ГРАФИТ-3;Кухня «Графит», 3 м;kitchen;1 250 000;компл\r\n';

  const utf8WithBom = new Uint8Array([
    0xef,
    0xbb,
    0xbf,
    ...Array.from(new TextEncoder().encode(csv)),
  ]);

  const decoded = decodeCsvBuffer(utf8WithBom);
  check('BOM снят, кириллица цела', decoded.includes('Паркет дуб «Натуральный»'));
  check('BOM не утёк в первую ячейку', decoded.startsWith('article'), decoded.slice(0, 12));

  const parsed = parseCatalogCsv(decoded);
  check('разобрано три строки', parsed.rows.length === 3, `строк: ${parsed.rows.length}`);
  check(
    'точка с запятой распознана как разделитель',
    parsed.rows[0]?.article === 'PRK-2214',
    parsed.rows[0]?.article ?? '—',
  );
  check(
    'цена «12 500,50» разобрана',
    near(parsed.rows[0]?.price ?? 0, 12500.5),
    String(parsed.rows[0]?.price),
  );
  check(
    'кириллица в артикуле не потерялась',
    parsed.rows[2]?.article === 'KUH-ГРАФИТ-3',
    parsed.rows[2]?.article ?? '—',
  );
  check('«м2» → m2', normalizeUnit('м2') === 'm2');
  check('«м²» → m2', normalizeUnit('м²') === 'm2');
  check('«компл» → set', normalizeUnit('компл') === 'set');

  // Тот же файл в windows-1251 — 1С выгружает так по умолчанию.
  const cp1251 = new Uint8Array(
    Array.from('article;name;category_key;price;unit\nPRK-1;Паркет дуб;flooring;100;м2\n').map(
      (ch) => {
        const code = ch.charCodeAt(0);
        if (code < 128) return code;
        // А..Я → 0xC0.., а..я → 0xE0..
        if (code >= 0x410 && code <= 0x44f) return code - 0x410 + 0xc0;
        if (code === 0x451) return 0xb8;
        return 0x3f;
      },
    ),
  );
  const decoded1251 = decodeCsvBuffer(cp1251);
  check(
    'windows-1251 распознана без BOM',
    decoded1251.includes('Паркет дуб'),
    decoded1251.split('\n')[1] ?? '',
  );

  const quoted = parseCsv('a;b\n"строка; с разделителем";2\n');
  check(
    'разделитель внутри кавычек не разрывает поле',
    quoted[1]?.[0] === 'строка; с разделителем',
    quoted[1]?.[0] ?? '—',
  );

  const noHeaders = parseCatalogCsv('foo;bar\n1;2\n');
  check(
    'файл без нужных колонок отвергается с объяснением',
    noHeaders.rows.length === 0 && noHeaders.errors.length > 0,
    noHeaders.errors[0] ?? '',
  );
}

/* ─────────────────────────  Универсальность каталога  ───────────────────────── */

console.log('\nУниверсальная модель');
{
  check('floor даёт одну цель', targetsFor('floor').join() === 'floor');
  check('wall даёт четыре стены', targetsFor('wall').length === 4);
  check(
    'object и opening не привязаны к поверхностям',
    targetsFor('object').length === 0 && targetsFor('opening').length === 0,
  );
  check('подпись стены человекочитаема', targetLabel('wall:north').includes('north'));
  // Три поверхности кухни названы по-человечески, прочие зоны — как есть.
  check(
    'подпись зоны человекочитаема',
    targetLabel('zone:kitchen') === 'Фасады кухни' &&
      targetLabel('zone:countertop') === 'Столешница' &&
      targetLabel('zone:bedroom') === 'Зона: bedroom',
  );
}

/* ─────────────────────────  Спецификация  ───────────────────────── */

console.log('\nСпецификация');
{
  const room: RoomConfig = { ...DEFAULT_ROOM }; // 6 × 5 × 2.9, окно 2.4×1.5 на north

  const entry = (
    id: string,
    appliesTo: 'floor' | 'wall' | 'object',
    unit: 'm2' | 'piece',
    price: number,
  ): CatalogEntryFull =>
    ({
      id,
      org_id: 'org',
      category_id: `cat-${appliesTo}`,
      article: id.toUpperCase(),
      name_ru: id,
      name_kk: '',
      description: '',
      price,
      unit,
      dimensions: {},
      tiling: {},
      meta: {},
      is_active: true,
      category: {
        id: `cat-${appliesTo}`,
        org_id: 'org',
        key: appliesTo,
        name_ru: appliesTo,
        name_kk: '',
        applies_to: appliesTo,
        unit,
        sort_order: 0,
        is_active: true,
      },
      assets: [],
    }) satisfies CatalogEntryFull;

  const floor = entry('parquet', 'floor', 'm2', 12000);
  const wall = entry('tile', 'wall', 'm2', 9000);
  const sofa = entry('sofa', 'object', 'piece', 450000);

  check(
    'площадь пола = ширина × глубина',
    near(quantityFor('floor', floor, room), 30),
    `${quantityFor('floor', floor, room)} м²`,
  );

  // Стена north: 6 × 2.9 = 17.4, минус окно 2.4 × 1.5 = 3.6 → 13.8
  check(
    'из площади стены вычитается окно',
    near(quantityFor('wall:north', wall, room), 13.8),
    `${quantityFor('wall:north', wall, room)} м²`,
  );
  check(
    'стена без окна считается целиком',
    near(quantityFor('wall:west', wall, room), 5 * 2.9),
    `${quantityFor('wall:west', wall, room)} м²`,
  );
  check('штучный товар — всегда 1', quantityFor('zone:living', sofa, room) === 1);

  const spec = buildSpec(
    { floor: 'parquet', 'wall:north': 'tile', 'zone:living': 'sofa' },
    [floor, wall, sofa],
    room,
  );
  check('в спецификацию попали все три позиции', spec.length === 3);
  check(
    'сумма считается по количеству',
    near(specTotal(spec), 30 * 12000 + 13.8 * 9000 + 450000, 1),
    `${specTotal(spec)} ₸`,
  );

  const missing = buildSpec({ floor: 'нет-такого' }, [floor], room);
  check('удалённый из каталога товар не ломает спецификацию', missing.length === 0);

  check(
    'площадь пола больше площади стены — по ней и приоритет референсов',
    surfaceArea('floor', room) > surfaceArea('wall:north', room),
    `${surfaceArea('floor', room)} против ${surfaceArea('wall:north', room)}`,
  );
}

/* ─────────────────────────  Фото → комната  ───────────────────────── */

console.log('\nФото и замер');
{
  const analysis: RoomAnalysis = {
    shape: 'rectangular',
    estimatedRatio: { width: 1.5, depth: 1 },
    ceilingHint: 'standard',
    windows: [{ wall: 'north', relativeOffset: 0.5, relativeWidth: 0.4, sillHint: 0.3 }],
    doors: [],
    features: [],
    visibleWalls: ['north', 'west'],
    cameraHint: { wall: 'south', note: '' },
    confidence: 0.9,
    needsMeasurement: [],
    warnings: [],
  };

  // Один размер с замера — второй достраивается по пропорции с фото.
  const one = roomFromAnalysis(analysis, { width: 6 }, DEFAULT_ROOM);
  check(
    'глубина выведена из пропорции, когда дана только ширина',
    near(one.room.width, 6) && near(one.room.depth, 4),
    `${one.room.width} × ${one.room.depth}`,
  );
  check(
    'выведенный размер помечен как допущение',
    one.assumptions.some((a) => a.includes('Глубина')),
  );

  // Оба размера с замера — пропорция с фото не используется.
  const both = roomFromAnalysis(analysis, { width: 5.2, depth: 4.4, height: 3 }, DEFAULT_ROOM);
  check(
    'замер главнее пропорции с фото',
    near(both.room.width, 5.2) && near(both.room.depth, 4.4) && near(both.room.height, 3),
    `${both.room.width} × ${both.room.depth} × ${both.room.height}`,
  );
  check('при полном замере допущений нет', both.assumptions.length === 0);

  const win = both.room.windows[0];
  check('окно перенесено на нужную стену', win?.wall === 'north');
  check(
    'окно по центру стены даёт нулевое смещение',
    near(win?.offset ?? 99, 0),
    `offset=${win?.offset}`,
  );
  check(
    'ширина окна = доля от длины стены',
    near(win?.width ?? 0, 5.2 * 0.4, 0.05),
    `${win?.width} м`,
  );
  check(
    'окно не выходит за стену',
    (win?.offset ?? 0) + (win?.width ?? 0) / 2 <= both.room.width / 2 + 0.001,
  );

  // Правило честности: неуверенный анализ требует подтверждения.
  check(
    'confidence 0.4 требует ручного подтверждения',
    needsConfirmation({ ...analysis, confidence: 0.4 }),
  );
  check(
    'непрямоугольная планировка требует подтверждения',
    needsConfirmation({ ...analysis, shape: 'l_shaped' }),
  );
  check(
    'предупреждение требует подтверждения',
    needsConfirmation({ ...analysis, warnings: ['сильное искажение'] }),
  );
  check('чистый уверенный анализ проходит молча', !needsConfirmation(analysis));
}

/* ─────────────────────────  Типовой прайс  ───────────────────────── */

console.log('\nТиповой прайс');
{
  /*
   * Товар в каталоге не существует без категории: `category_id` объявлен
   * NOT NULL. Прайс однажды уехал вперёд списка категорий — четыре зоны
   * (шкаф-купе, прихожая, ТВ-зона, санузел) появились в позициях, но не
   * в категориях, — и загрузка на пустом каталоге падала целиком.
   */
  const orphans = orphanTypicalRates();
  check(
    'у каждой позиции прайса есть своя категория',
    orphans.length === 0,
    orphans.map((r) => `${r.article}→${r.categoryKey}`).slice(0, 5).join(', '),
  );

  const keys = TYPICAL_CATEGORIES.map((c) => c.key);
  check('ключи категорий не повторяются', new Set(keys).size === keys.length);

  /*
   * Все типовые категории — `object`: это статьи сметы, а не поверхности.
   * Пометь их `zone`, и двери-купе со штангой полезут в шаг «Материалы»
   * как товары на выбор клиенту.
   */
  check(
    'типовые категории не притворяются поверхностями',
    TYPICAL_CATEGORIES.every((c) => c.appliesTo === 'object'),
  );

  const units = new Set(['m2', 'piece', 'running_meter', 'set']);
  check(
    'единицы измерения из перечисления базы',
    TYPICAL_CATEGORIES.every((c) => units.has(c.unit)) &&
      TYPICAL_PRICE_LIST.every((r) => units.has(r.unit)),
  );

  const articles = TYPICAL_PRICE_LIST.map((r) => r.article);
  check('артикулы прайса уникальны', new Set(articles).size === articles.length);

  const estimateKeys = TYPICAL_PRICE_LIST.map((r) => r.estimateKey);
  check(
    'ключи статей сметы уникальны',
    new Set(estimateKeys).size === estimateKeys.length,
    'иначе одна ставка перетрёт другую',
  );

  check(
    'обязательные статьи сметы в прайсе есть',
    REQUIRED_RATE_KEYS.every((key) => estimateKeys.includes(key)),
    REQUIRED_RATE_KEYS.filter((key) => !estimateKeys.includes(key)).join(', '),
  );
}

/* ───────────  Фурнитура — позиции того же каталога  ─────────── */

/**
 * ВТОРОЙ ТАБЛИЦЫ ПОД ФУРНИТУРУ НЕТ.
 *
 * Петли и направляющие лежат в `catalog_items` рядом с фасадами: одна
 * таблица плюс поля `meta` (ловушка 19). Здесь проверяется чтение этих
 * полей — что позиция распознаётся как фурнитура, что цена берётся у
 * товара, и что монтажные размеры у новой позиции ПУСТЫ.
 */
console.log('\nФурнитура в каталоге организации');
{
  const entry = (id: string, meta: Record<string, unknown>, price = 3400, active = true) =>
    ({
      id,
      org_id: 'org-1',
      category_id: 'cat-hw',
      article: id.toUpperCase(),
      name_ru: 'Петля Blum Clip top',
      name_kk: '',
      description: '',
      price,
      unit: 'piece',
      dimensions: {},
      tiling: {},
      meta,
      is_active: active,
      category: { id: 'cat-hw', org_id: 'org-1', key: 'hardware', name_ru: 'Фурнитура', name_kk: '', applies_to: 'object', unit: 'piece', sort: 0 },
      assets: [],
    }) as unknown as CatalogEntryFull;

  const items = [
    entry('hw-blum', {
      estimateKey: 'hinge_standard',
      hardware: { category: 'hinge', brand: 'blum', model: 'Clip top', softClose: true },
    }),
    entry('hw-slide', {
      estimateKey: 'slide_standard',
      hardware: { category: 'slide', brand: 'hettich', slideKind: 'tandem' },
    }, 14000),
    /* Обычный товар без описания фурнитуры: фурнитурой он не считается. */
    entry('front-ldsp', { estimateKey: 'front_panel' }, 26000),
  ];

  const catalog = hardwareCatalog(items);

  /*
   * Пустой каталог — это не «фурнитуры нет», это ненайденные позиции.
   * Падаем здесь, а не проходим по пустой карте.
   */
  check(
    'фурнитура читается из позиций каталога',
    catalog.size === 2,
    catalog.size === 0
      ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ ПОЗИЦИЙ ФУРНИТУРЫ'
      : `${catalog.size} из ${items.length} позиций`,
  );

  check(
    'товар без описания фурнитурой не считается',
    !catalog.has('front-ldsp'),
    catalog.has('front-ldsp') ? 'ФАСАД ПОПАЛ В ФУРНИТУРУ' : 'фасад остался фасадом',
  );

  const blum = catalog.get('hw-blum');
  check(
    'бренд, модель и доводчик читаются как поля, а не как часть ключа',
    blum?.hardware.brand === 'blum' &&
      blum?.hardware.model === 'Clip top' &&
      blum?.hardware.softClose === true,
    `${blum?.hardware.brand} · ${blum?.hardware.model} · доводчик ${blum?.hardware.softClose}`,
  );

  check(
    'цена берётся у товара, второго места хранения нет',
    blum?.price === 3400,
    `${blum?.price} ₸`,
  );

  check(
    'направляющие различаются типом',
    catalog.get('hw-slide')?.hardware.slideKind === 'tandem',
    String(catalog.get('hw-slide')?.hardware.slideKind),
  );

  /* ── Монтажные размеры у новой позиции ПУСТЫ ── */
  check(
    'у новой позиции монтажных размеров нет — присадка не рассчитывается',
    blum ? !hasMountingData(blum) : false,
    blum
      ? `Ø${blum.mounting.holeDiameterMm} глубина ${blum.mounting.holeDepthMm} шаг ${blum.mounting.pitchMm}`
      : 'ПОЗИЦИИ НЕТ',
  );

  const withMount = hardwareCatalog([
    entry('hw-measured', {
      estimateKey: 'hinge_standard',
      hardware: {
        category: 'hinge',
        brand: 'blum',
        mounting: { holeDiameterMm: 35, holeDepthMm: 13 },
      },
    }),
  ]).get('hw-measured');

  check(
    'подтверждённые размеры читаются, неподтверждённые остаются null',
    withMount?.mounting.holeDiameterMm === 35 &&
      withMount?.mounting.holeDepthMm === 13 &&
      withMount?.mounting.pitchMm === null &&
      withMount?.mounting.edgeOffsetMm === null,
    `Ø${withMount?.mounting.holeDiameterMm} · глубина ${withMount?.mounting.holeDepthMm} · ` +
      `шаг ${withMount?.mounting.pitchMm} · отступ ${withMount?.mounting.edgeOffsetMm}`,
  );

  check(
    'мусор вместо размера не становится нулём',
    hardwareCatalog([
      entry('hw-junk', {
        estimateKey: 'hinge_standard',
        hardware: { category: 'hinge', mounting: { holeDiameterMm: 'тридцать пять' } },
      }),
    ]).get('hw-junk')?.mounting.holeDiameterMm === null,
    'строка вместо числа → null, а не 0',
  );

  /* ── Отключённая позиция не попадает в выбор ── */
  const withOff = hardwareCatalog([
    entry('hw-off', { estimateKey: 'hinge_standard', hardware: { category: 'hinge' } }, 900, false),
    items[0],
  ]);
  check(
    'отключённая позиция в выбор не предлагается',
    hardwareByCategory(withOff, 'hinge').length === 1 &&
      hardwareByCategory(withOff, 'hinge')[0].id === 'hw-blum',
    hardwareByCategory(withOff, 'hinge').map((i) => i.id).join(' ') || 'пусто',
  );
}

/* ═══════════  Отметки объекта наследуются от организации  ═══════════ */

/**
 * НАСТРОЙКА ОРГАНИЗАЦИИ — ИСТОЧНИК, ОБЪЕКТ — ТОЛЬКО ПРАВКИ.
 *
 * Здесь это проверяется со стороны каталога: `ProductionSettings` живёт
 * в `orgs.production`, и объект обязан её ЧИТАТЬ, а не копировать. Копия
 * заморозила бы объект на старом стандарте цеха молча — раскрой поехал
 * бы не тогда, когда человек что-то решил.
 */
console.log('\nОтметки объекта');
{
  const org: ProductionSettings = {
    ...DEFAULT_PRODUCTION,
    heights: { plinthMm: 100, carcassMm: 720, countertopMm: 38, apronMm: 592 },
    depths: { baseMm: 560, upperMm: 320, mezzanineMm: 560 },
  };

  check(
    'у организации есть отметки — наследовать есть что',
    org.heights.carcassMm > 0 && org.depths.baseMm > 0,
    org.heights.carcassMm === 0
      ? 'У ОРГАНИЗАЦИИ НЕТ ОТМЕТОК — наследовать нечего'
      : `боковина ${org.heights.carcassMm} · глубина ${org.depths.baseMm}`,
  );

  check(
    'объект без правок — это отметки организации до числа',
    JSON.stringify(productionFor(org, undefined)) === JSON.stringify(org),
    `${productionFor(org, undefined).heights.carcassMm} мм`,
  );

  const marks = [...OBJECT_MARKS];
  const own = withMark(undefined, marks.find((m) => m.key === 'baseMm')!, 600);
  check(
    'объект хранит только изменённое поле, а не весь набор',
    JSON.stringify(own) === JSON.stringify({ depths: { baseMm: 600 } }),
    JSON.stringify(own),
  );

  const later: ProductionSettings = {
    ...org,
    heights: { ...org.heights, carcassMm: 760 },
    depths: { ...org.depths, upperMm: 350 },
  };

  check(
    'цех поменял своё — объект поехал следом там, где не правил',
    productionFor(later, own).heights.carcassMm === 760 &&
      productionFor(later, own).depths.upperMm === 350,
    `боковина ${productionFor(later, own).heights.carcassMm} · верх ${productionFor(later, own).depths.upperMm}`,
  );

  check(
    'а там, где правил, остался на своём',
    productionFor(later, own).depths.baseMm === 600,
    `глубина нижнего ${productionFor(later, own).depths.baseMm} при цеховой ${later.depths.baseMm}`,
  );

  check(
    'припуски, толщины и кромка остаются школой цеха: объект их не правит',
    JSON.stringify(productionFor(later, own).allowances) === JSON.stringify(later.allowances) &&
      productionFor(later, own).carcassMm === later.carcassMm &&
      productionFor(later, own).visibleEdgeMm === later.visibleEdgeMm,
    marks.map((m) => `${m.group}.${m.key}`).join(' '),
  );
}

/* ═══════════  Фрезеровка фасада — позиция каталога  ═══════════ */

/**
 * ФРЕЗЕРОВКА ЖИВЁТ В `catalog_items`, А НЕ В КОДЕ.
 *
 * Отдельной таблицы под неё нет (ловушка 19): это товар с ценой за м², и
 * отличает его `meta.milling.profile` — контур профиля. Товар без
 * профиля фрезеровкой не считается вовсе: он остаётся ставкой сметы.
 */
console.log('\nФрезеровка фасада — позиция каталога');
{
  const entry = (over: Record<string, unknown>) =>
    ({
      id: 'mil-1',
      org_id: 'org',
      name_ru: 'Модерн',
      article: 'MIL-MODERN',
      price: 4500,
      is_active: true,
      meta: { milling: { profile: 'M10 20 L90 20', typical: false } },
      ...over,
    }) as never;

  check(
    'позиция с профилем читается фрезеровкой',
    millingOf(entry({})) !== null,
    millingOf(entry({}))
      ? `${millingOf(entry({}))!.name} · ${millingOf(entry({}))!.price} ₸/м²`
      : 'НЕ ПРОЧИТАЛАСЬ',
  );

  check(
    'товар без профиля фрезеровкой не считается',
    millingOf(entry({ meta: {} })) === null,
    millingOf(entry({ meta: {} })) === null ? 'не фрезеровка' : 'ПРОЧИТАЛСЯ КАК ФРЕЗЕРОВКА',
  );

  check(
    'отключённая позиция читается, но помечена отключённой',
    millingOf(entry({ is_active: false }))?.active === false,
    `active = ${millingOf(entry({ is_active: false }))?.active}`,
  );

  const catalog = millingCatalog([entry({}), entry({ id: 'mil-2', is_active: false })]);

  check(
    'каталог собрался — выбирать есть из чего',
    catalog.size === 2,
    catalog.size === 0 ? 'НОЛЬ ПОЗИЦИЙ ФРЕЗЕРОВКИ — выбирать не из чего' : `позиций ${catalog.size}`,
  );

  check(
    'выбор показывает только включённые',
    millingChoices(catalog).length === 1,
    `из ${catalog.size} включённых ${millingChoices(catalog).length}`,
  );

  /* ── Стартовый набор ── */

  check(
    'стартовый набор — одиннадцать позиций, включая «без фрезеровки»',
    TYPICAL_MILLING.length === 11 &&
      TYPICAL_MILLING.some((m) => m.name === 'Без фрезеровки') &&
      TYPICAL_MILLING.some((m) => m.name === 'Александрия'),
    `${TYPICAL_MILLING.length}: ${TYPICAL_MILLING.map((m) => m.name).join(', ')}`,
  );

  check(
    'у каждой стартовой позиции есть профиль',
    TYPICAL_MILLING.every((m) => profileOf(m.layers).trim().length > 0),
    TYPICAL_MILLING.filter((m) => !profileOf(m.layers).trim()).map((m) => m.name).join(', ') ||
      'профиль есть у всех',
  );

  check(
    'ЦЕН В СТАРТОВОМ НАБОРЕ НЕТ: они у каждого цеха свои',
    TYPICAL_MILLING.every((m) => typicalMillingItem(m).price === 0),
    TYPICAL_MILLING.map((m) => typicalMillingItem(m).price).filter((v) => v !== 0).join('/') ||
      'все нулевые, цену задаёт компания',
  );

  check(
    'стартовая позиция помечена типовой — это ориентир, а не прайс компании',
    TYPICAL_MILLING.every((m) => typicalMillingItem(m).meta.milling.typical === true),
    'все помечены',
  );
}

/* ── Цена фрезеровки: одно место хранения ── */

/**
 * ЦЕНА ЛЕЖИТ В ПОЗИЦИИ КАТАЛОГА, И БОЛЬШЕ НИГДЕ.
 *
 * Её вводят в двух местах — в админке каталога и на карточке фрезеровки
 * в конфигураторе, — и оба обязаны писать в ОДНУ строку `catalog_items`.
 * Второе хранение означало бы, что переоценка каталога не доедет до
 * сметы, а подписанный документ разойдётся с прайсом компании.
 */
async function millingPriceChecks() {
  const item = (price: number) =>
    ({
      id: 'mil-1',
      org_id: 'org',
      name_ru: 'Ампир',
      article: 'MIL-EMPIRE',
      price,
      is_active: true,
      meta: typicalMillingItem(TYPICAL_MILLING[3]).meta,
    }) as never;

  check(
    'цена читается ИЗ ПОЗИЦИИ каталога',
    millingOf(item(7000))?.price === 7000,
    `прочитано ${millingOf(item(7000))?.price ?? 'НИЧЕГО'} ₸/м²`,
  );

  /*
   * В `meta` цены нет вовсе. Лежи она там — получилось бы два числа на
   * одну величину, и правка одного молча оставляла бы второе прежним.
   */
  const meta = JSON.stringify(typicalMillingItem(TYPICAL_MILLING[3]).meta);

  check(
    'в meta позиции цены нет: второго места хранения не заведено',
    !meta.includes('price') && !meta.includes('7000'),
    meta.includes('price') ? `ЦЕНА В META: ${meta}` : 'в meta только профиль и слои',
  );

  /* ── Запись идёт тем же путём, что цены остального каталога ── */

  const calls: { table: string; patch: unknown; id: unknown }[] = [];
  const fake = {
    from(table: string) {
      return {
        update(patch: unknown) {
          return {
            eq(_column: string, id: unknown) {
              calls.push({ table, patch, id });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  } as never;

  const saveError = await patchCatalogItem(fake, 'mil-1', { price: 7000 });

  check(
    'цена уходит в catalog_items той же правкой, что и остальной прайс',
    calls.length === 1 &&
      calls[0].table === 'catalog_items' &&
      JSON.stringify(calls[0].patch) === '{"price":7000}' &&
      calls[0].id === 'mil-1' &&
      saveError === null,
    calls.length === 0
      ? 'ЗАПИСИ НЕ БЫЛО ВОВСЕ'
      : `${calls[0].table}.update(${JSON.stringify(calls[0].patch)}) где id = ${calls[0].id}`,
  );

  const broke = await patchCatalogItem(
    { from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: { message: 'нет прав' } }) }) }) } as never,
    'mil-1',
    { price: 7000 },
  );

  check(
    'несохранившаяся цена называется словами, а не теряется молча',
    broke === 'нет прав',
    broke === null ? 'ОШИБКА ПРОГЛОЧЕНА' : `сказано: ${broke}`,
  );

  /* ── Без цены позиция выбирается, но помечена ── */

  const catalog = millingCatalog([item(0)]);
  const unit = { id: 'm1', label: 'Дверца', widthMm: 600, front: { millingId: 'mil-1' } } as never;
  const link = millingLink(unit, { milling: {} } as never, catalog);

  check(
    'позиция без цены остаётся в выборе — её можно выбрать',
    millingChoices(catalog).length === 1,
    `в выборе ${millingChoices(catalog).length} из ${catalog.size}`,
  );

  check(
    'но названа словами: «цена не задана», а не нулём',
    link.state === 'priceless' && link.reason.includes('цена не задана'),
    link.state === 'priceless' ? link.reason : `СОСТОЯНИЕ ${link.state}`,
  );

  check(
    'а с ценой та же позиция считается настоящей',
    millingLink(unit, { milling: {} } as never, millingCatalog([item(7000)])).state === 'resolved',
    millingLink(unit, { milling: {} } as never, millingCatalog([item(7000)])).state,
  );
}


/* ─────────────────  Слой 51: каталог материалов из catalog.json  ───────────────── */

/**
 * ЗАГРУЗКА ИДЁТ В СУЩЕСТВУЮЩИЙ КАТАЛОГ, И ПОВТОРНАЯ — БЕЗ ДУБЛЕЙ.
 *
 * Меряется ровно то, что уйдёт в `catalog_items`: строки плана загрузки.
 * Ключ дубля — коллекция + код. Повторная загрузка того же файла в
 * каталог, где он уже лежит, не добавляет НИ ОДНОЙ строки.
 */
console.log('\nКаталог материалов: загрузка catalog.json (тест 8)');
{
  const file = parseMaterialFile(catalogJson);
  const first = planMaterialImport(file, []);
  const of = (id: string) => first.rows.filter((row) => row.collectionId === id);
  const mdf = of('mdf-panels-palette');
  const ral = of('ral-design');

  check('тест 8: МДФ-панелей загружено 20', mdf.length === 20, `${mdf.length}`);
  check(
    'тест 8: у каждой МДФ-панели две поверхности — High Gloss и Touch Sense, у каждой своя цена',
    mdf.length === 20 &&
      mdf.every(
        (row) =>
          JSON.stringify(row.meta.finishes) === '["high_gloss","touch_sense"]' &&
          Object.keys((row.meta.finishPrices ?? {}) as Record<string, unknown>).sort().join(',') ===
            'high_gloss,touch_sense',
      ),
    mdf
      .slice(0, 2)
      .map((row) => `${row.article}: ${JSON.stringify(row.meta.finishes)} ${JSON.stringify(row.meta.finishPrices)}`)
      .join(' · ') || 'НУЛЕВОЙ СЕЛЕКТОР',
  );
  check('тест 8: цветов RAL загружено 1825', ral.length === 1825, `${ral.length}`);

  const articles = first.rows.map((row) => row.article);
  check(
    'тест 8: коды уникальны на весь каталог',
    articles.length === 1845 && new Set(articles).size === articles.length,
    `${articles.length} строк · уникальных ${new Set(articles).size}`,
  );

  const counts = Object.entries(first.byCollection)
    .map(([id, n]) => `${id} ${n.added}/${n.inFile}`)
    .join(' · ');
  check(
    /*
     * P3: EGGER и GRANDEX в файле больше не пустые — это справочные карточки
     * пакета проверки (136 и 90). Без явного списка они НЕ грузятся: в счёте
     * они есть числом («в файле 136, загружено 0»), а не пропуском.
     */
    'тест 8: счёт по коллекциям назван числом; коллекции на проверке (EGGER 136, GRANDEX 90) без явного списка — 0 загружено, а не пропуск',
    Object.keys(first.byCollection).length === file.collections.length &&
      first.byCollection['egger-ldsp']?.inFile === 136 &&
      first.byCollection['egger-ldsp']?.added === 0 &&
      first.byCollection['grandex-acrylic']?.inFile === 90 &&
      first.byCollection['grandex-acrylic']?.added === 0,
    counts || 'НУЛЕВОЙ СЕЛЕКТОР',
  );

  const loaded = catalogEntriesFromRows(first.rows, file, 'demo', 'demo-mat:');
  check(
    'тест 8: каждая строка легла в категорию своей коллекции',
    loaded.length === 1845 && loaded.every((entry) => collectionOf(entry) !== null),
    `${loaded.length} позиций`,
  );

  const again = planMaterialImport(
    file,
    loaded.map((entry) => ({ article: entry.article, collection: collectionOf(entry) })),
  );
  check(
    'тест 8: повторная загрузка — дублей 0',
    again.rows.length === 0 && again.skipped === 1845 && again.conflicts.length === 0,
    `добавлено ${again.rows.length} · пропущено ${again.skipped} · конфликтов ${again.conflicts.length}`,
  );

  /*
   * Код, который уже занят ДРУГОЙ коллекцией, не грузится молча поверх и
   * не пропадает молча: артикул в каталоге организации один, и конфликт
   * назван словами.
   */
  const clash = planMaterialImport(file, [{ article: 'RAL 010 30 20', collection: 'veneer' }]);
  check(
    'чужой код не перезаписывается и не пропадает молча — конфликт назван',
    clash.rows.length === 1844 && clash.conflicts.length === 1 && clash.conflicts[0].includes('RAL 010 30 20'),
    clash.conflicts[0] ?? `конфликтов ${clash.conflicts.length}`,
  );

  /*
   * 1825 ЦВЕТОВ НЕ ПРОЛИВАЮТСЯ В СТАРЫЕ ВЫБОРЫ.
   *
   * Палитра фасада и материал корпуса рисуют кнопку на КАЖДЫЙ цвет без
   * прокрутки по требованию. RAL в них — это 1825 кнопок в одном списке
   * и зависший планшет. Позиции коллекций живут в своей панели.
   */
  const paletteBefore = paletteFromCatalog(DEMO_CATALOG).length;
  const paletteAfter = paletteFromCatalog([...DEMO_CATALOG, ...loaded]).length;
  check(
    'каталог материалов не проливается в старую палитру фасада',
    paletteAfter === paletteBefore,
    `${paletteBefore} → ${paletteAfter}`,
  );
  const carcassBefore = carcassCatalog(DEMO_CATALOG).size;
  const carcassAfter = carcassCatalog([...DEMO_CATALOG, ...loaded]).size;
  check(
    'RAL и МДФ-панели — не материал корпуса: их роль фасад',
    carcassAfter === carcassBefore,
    `${carcassBefore} → ${carcassAfter}`,
  );

  const hits = searchMaterials(loaded, 'RAL 010 30 20');
  check(
    'поиск по коду «RAL 010 30 20» — ровно одна позиция',
    hits.length === 1 && hits[0].article === 'RAL 010 30 20',
    hits.map((entry) => entry.article).join(' · ') || 'НУЛЕВОЙ СЕЛЕКТОР',
  );
  check(
    'поиск по названию и без учёта регистра',
    searchMaterials(loaded, 'pinkish brown').some((entry) => entry.article === 'RAL 010 30 20') &&
      searchMaterials(loaded, 'ral 010 30 20').length === 1,
    `${searchMaterials(loaded, 'pinkish brown').length} по названию`,
  );
}

/**
 * ВКЛАДКА ПОКАЗЫВАЕТ ТОЛЬКО ТО, ЧТО ИДЁТ НА ЦЕЛЬ.
 *
 * Роли коллекции — из файла: столешница не идёт на корпус, эмаль по RAL
 * не идёт на столешницу. Недоступная вкладка называет причину словами.
 */
console.log('\nКаталог материалов: вкладки по цели (тест 10)');
{
  const defs = materialDefs(parseMaterialFile(catalogJson));
  const carcass = materialTabs(defs.collections, 'carcass');
  const countertopTab = carcass.find((tab) => tab.key === 'countertop');

  check(
    'тест 10: цель «корпус» — вкладка «Столешницы» недоступна',
    Boolean(countertopTab) && countertopTab!.available === false,
    countertopTab
      ? `${countertopTab.title}: ${countertopTab.reason}`
      : 'НУЛЕВОЙ СЕЛЕКТОР: вкладки «Столешницы» нет',
  );
  check(
    'тест 10: и причина названа словами',
    Boolean(countertopTab?.reason && /корпус/.test(countertopTab.reason)),
    countertopTab?.reason ?? '—',
  );
  check(
    'тест 10: у корпуса доступна только ЛДСП — это единственная коллекция с ролью «корпус»',
    carcass.filter((tab) => tab.available).map((tab) => tab.key).join(',') === 'ldsp',
    carcass.map((tab) => `${tab.key}:${tab.available ? 'да' : 'нет'}`).join(' · '),
  );

  const fronts = materialTabs(defs.collections, 'fronts');
  check(
    'у фасадов доступны ЛДСП, МДФ, эмаль и шпон, а столешниц нет',
    fronts.filter((tab) => tab.available).map((tab) => tab.key).join(',') ===
      'ldsp,mdf_panel,mdf_paint,veneer',
    fronts.map((tab) => `${tab.key}:${tab.available ? 'да' : 'нет'}`).join(' · '),
  );

  const counter = materialTabs(defs.collections, 'countertop');
  check(
    'у столешницы доступна только вкладка «Столешницы»',
    counter.filter((tab) => tab.available).map((tab) => tab.key).join(',') === 'countertop',
    counter.map((tab) => `${tab.key}:${tab.available ? 'да' : 'нет'}`).join(' · '),
  );

  const module = materialTabs(defs.collections, 'module');
  check(
    'выбранный модуль — это его фасад: вкладки те же, что у фасадов',
    module.map((tab) => tab.available).join() === fronts.map((tab) => tab.available).join(),
  );
}


/**
 * ОШИБКА ЧТЕНИЯ КАТАЛОГА — СЛОВАМИ, А НЕ ПУСТЫМ СПИСКОМ (тест 11, слой 52).
 *
 * Пустой каталог без слов перед клиентом хуже падения: смета говорит
 * «заполните цены», панель — «ждёт импорта», и никто не знает, что каталог
 * просто не прочитался. Заглушка клиента Supabase отвечает ошибкой так же,
 * как отвечает PostgREST, — и чтение обязано её назвать.
 */
function stubClient(pages: { data: unknown[] | null; error: { message: string } | null }[]) {
  let call = 0;
  const chain: Record<string, unknown> = {};
  for (const name of ['from', 'select', 'eq', 'order']) chain[name] = () => chain;
  chain.range = () => Promise.resolve(pages[Math.min(call++, pages.length - 1)]);
  return chain;
}

function rawRow(i: number) {
  return {
    id: `id-${i}`,
    org_id: 'org',
    category_id: 'cat',
    article: `A-${String(i).padStart(5, '0')}`,
    name_ru: `Позиция ${i}`,
    name_kk: '',
    description: '',
    price: 0,
    unit: 'm2',
    dimensions: {},
    tiling: {},
    meta: {},
    is_active: true,
    catalog_categories: {
      id: 'cat',
      org_id: 'org',
      key: 'collection:ral-design',
      name_ru: 'Эмаль · RAL Design',
      name_kk: '',
      applies_to: 'object',
      unit: 'm2',
      sort_order: 0,
      is_active: true,
    },
    catalog_assets: [],
  };
}

async function catalogReadChecks() {
  console.log('\nКаталог: ошибка чтения называется словами (тест 11)');

  const read = (await fetchCatalog(
    stubClient([{ data: null, error: { message: 'permission denied for table catalog_items' } }]) as never,
    'org',
  )) as unknown;
  const failed = read as { entries?: unknown; error?: unknown };
  check(
    'тест 11: ошибка чтения — не пустой список, а слова',
    !Array.isArray(read) && failed.entries === null && typeof failed.error === 'string' && /Каталог/.test(failed.error),
    Array.isArray(read)
      ? `ВЕРНУЛСЯ ПУСТОЙ СПИСОК БЕЗ СЛОВ: ${read.length} позиций`
      : `ошибка: «${String(failed.error)}»`,
  );
  check(
    'тест 11: причина для экрана — словами, без кода ошибки базы',
    typeof failed.error === 'string' && !/permission denied/.test(failed.error),
    String(failed.error),
  );

  /* Каталог длиннее 1000 строк читается целиком — страницами. */
  const first = Array.from({ length: 1000 }, (_, i) => rawRow(i));
  const second = Array.from({ length: 845 }, (_, i) => rawRow(1000 + i));
  const paged = (await fetchCatalog(
    stubClient([
      { data: first, error: null },
      { data: second, error: null },
    ]) as never,
    'org',
  )) as unknown as { entries?: unknown[] };
  check(
    'каталог 1845 позиций читается целиком, страницами по 1000',
    Array.isArray(paged.entries) && paged.entries.length === 1845,
    Array.isArray(paged.entries) ? `${paged.entries.length} позиций` : 'НЕ СПИСОК',
  );

  await lightReadChecks();
}

/**
 * ЛЁГКОЕ ЧТЕНИЕ КАТАЛОГА (HARDWARE-PHOTO-PERF-01).
 *
 * Заглушка отвечает по фильтру артикула, как PostgREST: позиции компании
 * (`not like MFR-%`) — строкой целиком, позиции производителей (`like
 * MFR-%`) — колонками путей `meta->hardware->…`, без паспорта. Проверяется
 * сборка: запись изделия из прочитанных полей, `detail: 'light'`, изображения
 * (`meta.media`) и ключ сметы на месте, служебных колонок в позиции нет;
 * полное чтение — прежнее. Что так отвечает НАСТОЯЩИЙ PostgREST, меряет
 * браузер (`check-hardware-media`, PART=perf и media).
 */
async function lightReadChecks() {
  console.log('\nКаталог: лёгкое чтение позиций производителей (HARDWARE-PHOTO-PERF-01)');
  const calls: { select: string; filters: string[] }[] = [];
  const mfrLight = {
    ...rawRow(1),
    meta: undefined,
    article: 'MFR-HETTICH-9114276',
    meta_estimateKey: null,
    meta_media: [{ kind: 'EXACT_PRODUCT', rights: 'NOT_VERIFIED', sourceUrl: 'https://example.test/9114276', checkedAt: '2026-10-21' }],
    hw_category: 'slide',
    hw_manufacturer: 'Hettich',
    hw_manufacturerArticle: '9 114 276',
    hw_subcategory: 'side_mount',
    hw_dimensionsMm: { nominalLength: 500, sideClearance: 12.7 },
    hw_ranges: null,
    hw_source: { file: 'TA.pdf', printedPage: '1252', checkedAt: '2026-10-21' },
    hw_engineeringStatus: 'VERIFIED',
    hw_saleUnit: null,
  };
  delete (mfrLight as Record<string, unknown>).meta;
  const own = { ...rawRow(2), article: 'A-OWN', meta: { estimateKey: 'front_panel', hardware: { category: 'hinge', notes: 'своя позиция — целиком' } } };
  const client = () => {
    const make = () => {
      const call = { select: '', filters: [] as string[] };
      const chain: Record<string, unknown> = {};
      chain.select = (columns: string) => {
        call.select = columns;
        return chain;
      };
      for (const name of ['eq', 'order']) chain[name] = () => chain;
      chain.not = (column: string, op: string, value: string) => {
        call.filters.push(`${column} not ${op} ${value}`);
        return chain;
      };
      chain.like = (column: string, value: string) => {
        call.filters.push(`${column} like ${value}`);
        return chain;
      };
      chain.range = () => {
        calls.push(call);
        const makers = call.filters.some((f) => f.includes('like MFR-%') && !f.includes('not'));
        return Promise.resolve({ data: makers ? [mfrLight] : [own], error: null });
      };
      return chain;
    };
    return { from: () => make() };
  };
  const read = (await fetchCatalog(client() as never, 'org', { hardware: 'light' })) as { entries: CatalogEntryFull[] | null; error: string | null };
  const entries = read.entries ?? [];
  const maker = entries.find((e) => e.article === 'MFR-HETTICH-9114276');
  const mine = entries.find((e) => e.article === 'A-OWN');
  const hardware = (maker?.meta?.hardware ?? {}) as Record<string, unknown>;
  check(
    'LR1 лёгкое чтение — два запроса: позиции компании целиком (not like MFR-%), позиции производителей — путями meta->hardware без паспорта',
    calls.length === 2 &&
      calls[0].filters.join() === 'article not like MFR-%' &&
      /\bmeta\b/.test(calls[0].select) &&
      calls[1].filters.join() === 'article like MFR-%' &&
      !/(^|[\s,])meta([\s,]|$)/.test(calls[1].select) &&
      calls[1].select.includes('hw_category:meta->hardware->category') &&
      calls[1].select.includes('meta_media:meta->media') &&
      !/printed|drilling|formulas|notes|missing/.test(calls[1].select),
    calls.map((c) => c.filters.join(' ')).join(' | '),
  );
  check(
    'LR2 позиция производителя: detail «light», запись изделия из прочитанных полей (пустые не пишутся), изображения и источник на месте, служебных колонок нет',
    read.error === null &&
      maker?.detail === 'light' &&
      hardware.category === 'slide' &&
      hardware.manufacturerArticle === '9 114 276' &&
      JSON.stringify(hardware.dimensionsMm) === JSON.stringify({ nominalLength: 500, sideClearance: 12.7 }) &&
      !('ranges' in hardware) &&
      !('saleUnit' in hardware) &&
      !('estimateKey' in (maker?.meta ?? {})) &&
      Array.isArray(maker?.meta?.media) &&
      Object.keys(maker ?? {}).every((key) => !key.startsWith('hw_') && !key.startsWith('meta_')),
    JSON.stringify({ detail: maker?.detail, hardware, keys: Object.keys(maker ?? {}).filter((k) => k.startsWith('hw_') || k.startsWith('meta_')) }),
  );
  check(
    'LR3 позиция компании — строкой целиком, без пометки: её паспорт приходит сразу',
    mine?.detail === undefined && (mine?.meta?.hardware as Record<string, unknown> | undefined)?.notes === 'своя позиция — целиком' && mine?.meta?.estimateKey === 'front_panel',
    JSON.stringify(mine?.meta ?? null),
  );
  calls.length = 0;
  const full = (await fetchCatalog(client() as never, 'org')) as { entries: CatalogEntryFull[] | null };
  check(
    'LR4 полное чтение — прежнее: один запрос без фильтра артикула, пометки «light» нет ни у одной позиции',
    calls.length === 1 && calls[0].filters.length === 0 && (full.entries ?? []).every((e) => e.detail === undefined),
    `${calls.length} запрос(а) · фильтры ${calls[0]?.filters.join() || 'нет'}`,
  );

  /*
   * СТРАНИЦЫ РАЗОМ: первая приносит число строк, остальные идут
   * одновременно. Заглушка держит каждую страницу на один такт и считает,
   * сколько их в полёте сразу; число строк не сошлось — ошибка словами.
   */
  const counted = (total: number, served: number) => {
    let inFlight = 0;
    let peak = 0;
    const asked: string[] = [];
    const make = () => {
      let wantsCount = false;
      const chain: Record<string, unknown> = {};
      chain.select = (_columns: string, options?: { count?: string }) => {
        wantsCount = options?.count === 'exact';
        return chain;
      };
      for (const name of ['eq', 'order', 'not', 'like']) chain[name] = () => chain;
      chain.range = (from: number, to: number) => {
        asked.push(`${from}-${to}${wantsCount ? ' +число' : ''}`);
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        const size = Math.max(0, Math.min(to + 1, served) - from);
        return new Promise((done) =>
          setTimeout(() => {
            inFlight -= 1;
            done({ data: Array.from({ length: size }, (_, i) => rawRow(from + i)), error: null, count: wantsCount ? total : null });
          }, 5),
        );
      };
      return chain;
    };
    return { client: { from: () => make() }, peak: () => peak, asked };
  };
  const whole = counted(2400, 2400);
  const parallel = (await fetchCatalog(whole.client as never, 'org')) as { entries: CatalogEntryFull[] | null };
  check(
    'LR5 каталог 2400 строк: первая страница с числом строк, остальные две — одновременно; прочитано всё',
    (parallel.entries ?? []).length === 2400 && whole.peak() === 2 && whole.asked.join() === '0-999 +число,1000-1999,2000-2999',
    `${(parallel.entries ?? []).length} строк · в полёте сразу ${whole.peak()} · ${whole.asked.join(', ')}`,
  );
  const shrunk = counted(2400, 2300);
  const lost = (await fetchCatalog(shrunk.client as never, 'org')) as { entries: unknown; error: string | null };
  check(
    'LR6 база назвала 2400 строк, пришло 2300 (каталог менялся во время чтения) — не урезанный каталог, а слова',
    lost.entries === null && typeof lost.error === 'string' && /Каталог/.test(lost.error),
    String(lost.error),
  );
}


/* ═══════════  P3: EGGER и GRANDEX — карточки пакета проверки в существующем каталоге  ═══════════ */
/*
 * Пакет `CATALOG_STAGING/99_IMPORT_QUEUE/EGGER_GRANDEX` — 397 справочных
 * карточек (EGGER 307, GRANDEX 90), а не товары: без цен, с образцами из PDF,
 * права не подтверждены. Они ложатся позициями ТЕХ ЖЕ коллекций файла и
 * оттуда — в `catalog_items` организации тем же `planMaterialImport`.
 */
console.log('\nP3: EGGER и GRANDEX — сопоставление, показ импорта, повтор без дублей, совместимость, «цена не задана»');
{
  const file = parseMaterialFile(catalogJson);
  const REVIEW = ['egger-ldsp', 'egger-perfectsense', 'egger-worktops', 'grandex-acrylic'];
  const rec = (over: Partial<ReviewRecord>): ReviewRecord => ({
    id: 'EGGER:W1000:ST9:P76',
    brand: 'EGGER',
    code: 'W1000',
    finish: 'ST9',
    name: 'Premium White',
    name_verified: true,
    group: 'Decorative boards • White & Uni',
    category: 'furniture_board',
    preview: 'assets/EGGER/W1000_ST9_p76.webp',
    source: 'BR+EDC26+Collection+Brochure+EAST+EN.pdf',
    page: 76,
    preview_status: 'PDF_PRINT_SWATCH_REFERENCE_ONLY',
    price_status: 'UNPRICED',
    pbr_status: 'NOT_PBR',
    rights: 'NOT_VERIFIED',
    ...over,
  });

  /* Одна карточка и несколько: список читается списком, а не «одним объектом». */
  const one = mapReviewRecords([rec({})], () => '#f4f2ec', '2026-10-17');
  const many = mapReviewRecords(
    [
      rec({}),
      rec({ id: 'EGGER:W1000:ST9:P77', page: 77 }),
      rec({ id: 'EGGER:W1000:ST9:WT', category: 'worktop', group: 'Worktops (postforming)' }),
      rec({ id: 'EGGER:W1100:PG', code: 'W1100', finish: 'PG', group: 'PerfectSense Lacquered Boards' }),
      rec({ id: 'EGGER:EDGE', category: 'other', group: 'Laminates/edging' }),
      rec({ id: 'GRANDEX:A-410', brand: 'GRANDEX', code: 'A-410', finish: '12mm standard (verify by SKU)', category: 'worktop', group: 'ADVENTURE', name_verified: false, name: 'Атауы' }),
      rec({ id: 'EGGER:NOCODE', code: '' }),
    ],
    () => null,
    '2026-10-17',
  );
  const codes = (m: typeof many) => Object.entries(m.items).map(([c, list]) => `${c}:${list.map((i) => i.code).join('+')}`).join(' · ');
  check(
    'P3.C1 одна карточка — одна позиция; семь — плита, столешница EGGER, PerfectSense, GRANDEX разными позициями, повтор страницы слит, кромка и карточка без кода названы',
    Object.values(one.items).flat().length === 1 &&
      many.items['egger-ldsp']?.map((i) => i.code).join() === 'EGGER-W1000-ST9' &&
      many.items['egger-ldsp']?.[0].provenance.pages.join() === '76,77' &&
      many.items['egger-worktops']?.map((i) => i.code).join() === 'EGGER-WT-W1000-ST9' &&
      many.items['egger-perfectsense']?.map((i) => i.code).join() === 'EGGER-W1100-PG' &&
      many.items['grandex-acrylic']?.map((i) => i.code).join() === 'GRANDEX-A-410' &&
      many.items['grandex-acrylic']?.[0].name === '' &&
      many.duplicates.length === 1 &&
      many.ineligible.map((x) => x.id).join() === 'EGGER:EDGE' &&
      many.incomplete.map((x) => x.id).join() === 'EGGER:NOCODE',
    `${codes(many)} · слито ${many.duplicates.length} · без детали ${many.ineligible.length} · неполных ${many.incomplete.length}`,
  );

  /* Файл в репозитории: сводка пакета сходится с позициями до карточки. */
  const pack = file.reviewPacks[0];
  const inCollections = REVIEW.map((id) => file.collections.find((c) => c.id === id)?.items.length ?? -1);
  const total = inCollections.reduce((s, n) => s + n, 0);
  check(
    'P3.C2 файл: 397 карточек (EGGER 307, GRANDEX 90) = 136 + 29 + 82 + 90 позиций + 3 слитых повтора + 57 без детали + 0 неполных',
    Boolean(pack) &&
      pack.records === 397 &&
      pack.brands.EGGER === 307 &&
      pack.brands.GRANDEX === 90 &&
      inCollections.join() === '136,29,82,90' &&
      total + pack.duplicate + pack.ineligible + pack.incomplete === pack.records &&
      pack.duplicate === 3 &&
      pack.ineligible === 57 &&
      pack.incomplete === 0,
    pack ? `${pack.records} = ${inCollections.join(' + ')} + ${pack.duplicate} + ${pack.ineligible} + ${pack.incomplete}` : 'НУЛЕВОЙ СЕЛЕКТОР: reviewPacks нет',
  );

  const reviewItems = REVIEW.flatMap((id) => file.collections.find((c) => c.id === id)?.items ?? []);
  const keyOf = (item: (typeof reviewItems)[number]) => {
    const p = item.provenance as Record<string, unknown>;
    return `${p.brand}|${p.manufacturerDecorCode}|${p.surfaceCode}|${p.productClass}`;
  };
  const required = ['brand', 'manufacturerDecorCode', 'surfaceCode', 'productClass', 'imageSource', 'sourcePdf', 'pages', 'checkedAt', 'nameVerified', 'previewStatus', 'textureStatus', 'rightsStatus', 'priceStatus', 'eligibleUse'];
  const badProvenance = reviewItems.filter((item) => !item.provenance || required.some((key) => !(key in (item.provenance as object))));
  const allArticles = file.collections.flatMap((c) => c.items.map((i) => i.code));
  check(
    'P3.C3 у каждой из 337 позиций провенанс полный; цены нет ни у одной; права NOT_VERIFIED, образец PDF, не PBR; ключ «производитель+код+поверхность+класс» и артикул уникальны на весь файл',
    reviewItems.length === 337 &&
      badProvenance.length === 0 &&
      reviewItems.every((item) => item.price === null && item.prices === null) &&
      reviewItems.every((item) => {
        const p = item.provenance as Record<string, unknown>;
        return p.rightsStatus === 'NOT_VERIFIED' && p.previewStatus === 'PDF_PRINT_SWATCH_REFERENCE_ONLY' && p.textureStatus === 'NOT_PBR' && p.priceStatus === 'UNPRICED';
      }) &&
      new Set(reviewItems.map(keyOf)).size === 337 &&
      new Set(allArticles).size === allArticles.length &&
      reviewItems.every((item) => /^#[0-9a-f]{6}$/.test(item.hex ?? '')),
    `позиций ${reviewItems.length} · без провенанса ${badProvenance.length} · ключей ${new Set(reviewItems.map(keyOf)).size} · артикулов ${allArticles.length}/${new Set(allArticles).size}`,
  );

  /* Сверка с самим пакетом — если он на этой машине (он вне репозитория). */
  const packPath = 'CATALOG_STAGING/99_IMPORT_QUEUE/EGGER_GRANDEX/data/COMBINED_EGGER_GRANDEX_REVIEW.json';
  if (existsSync(packPath)) {
    const records = JSON.parse(readFileSync(packPath, 'utf8')) as ReviewRecord[];
    const fresh = mapReviewRecords(records, () => null, '2026-10-17');
    const sameCodes = REVIEW.every(
      (id) =>
        (fresh.items[id] ?? []).map((i) => i.code).join() ===
        (file.collections.find((c) => c.id === id)?.items ?? []).map((i) => i.code).join(),
    );
    check(
      'P3.C4 пакет на этой машине: список из 397 карточек, его сопоставление даёт ровно те позиции, что лежат в файле',
      Array.isArray(records) && records.length === 397 && sameCodes,
      `карточек ${Array.isArray(records) ? records.length : 'НЕ СПИСОК'} · позиции ${sameCodes ? 'совпадают' : 'РАСХОДЯТСЯ'}`,
    );
  } else {
    console.log(`  —    P3.C4 НЕ ПРОВЕРЕНО: пакета ${packPath} на этой машине нет (он вне репозитория); в счёт не идёт`);
  }

  /* Загрузка по умолчанию коллекции на проверке не трогает; явный список — показ, запись, повтор. */
  const byDefault = planMaterialImport(file, []);
  const reviewRows = byDefault.rows.filter((row) => REVIEW.includes(row.collectionId));
  const first = importPreview(file, [], REVIEW);
  const plan = planMaterialImport(file, [], { collections: REVIEW });
  const loaded = catalogEntriesFromRows(plan.rows, file, 'org-a', 'a:');
  const existingA = loaded.map((entry) => ({ article: entry.article, collection: collectionOf(entry) }));
  const second = importPreview(file, existingA, REVIEW);
  const again = importPreview(file, existingA, REVIEW);
  check(
    'P3.C5 показ импорта: без списка EGGER/GRANDEX не грузятся вовсе; со списком — новых 337, без цены 337, слито 3, без детали 57, неполных 0; после записи повторный показ дважды — новых 0, уже есть 337',
    reviewRows.length === 0 &&
      byDefault.rows.length === 1845 &&
      first.fresh === 337 &&
      first.exists === 0 &&
      first.conflict === 0 &&
      first.unpriced === 337 &&
      first.duplicate === 3 &&
      first.ineligible === 57 &&
      first.incomplete === 0 &&
      first.nameUnverified > 0 &&
      plan.rows.length === 337 &&
      second.fresh === 0 &&
      second.exists === 337 &&
      again.fresh === 0 &&
      again.exists === 337,
    `по умолчанию ${byDefault.rows.length} (из них EGGER/GRANDEX ${reviewRows.length}) · показ: новых ${first.fresh}, есть ${first.exists}, без цены ${first.unpriced}, слито ${first.duplicate}, без детали ${first.ineligible}, без названия ${first.nameUnverified} · повтор ${second.fresh}/${second.exists}, ещё раз ${again.fresh}/${again.exists}`,
  );

  /* Две организации: артикулы одной не делают позиции другой «уже загруженными». */
  const orgB = importPreview(file, [], REVIEW);
  const ownB = [{ article: 'EGGER-W1000-ST9', collection: null }];
  const clash = importPreview(file, ownB, REVIEW);
  check(
    'P3.C6 организации раздельны: каталог А на показ Б не влияет (новых 337); свой товар Б с тем же артикулом — конфликт словами, не перезапись',
    orgB.fresh === 337 && clash.fresh === 336 && clash.conflict === 1 && /как свой товар компании/.test(clash.conflicts[0] ?? ''),
    `Б: новых ${orgB.fresh} · со своим «EGGER-W1000-ST9»: новых ${clash.fresh}, конфликт ${clash.conflict} — ${clash.conflicts[0] ?? '—'}`,
  );

  /* Физика изделия: EGGER-плита — корпус и фасад; PerfectSense — фасад; столешницы — только столешница. */
  const items = materialCatalog(loaded);
  const byCode = (code: string) => Array.from(items.values()).find((item) => item.code === code);
  const choice = (code: string, collectionId: string) => {
    const item = byCode(code);
    const collection = file.collections.find((c) => c.id === collectionId)!;
    if (!item) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: позиции ${code} нет в каталоге`);
    return { item, collection, surface: collection.finishes[0] };
  };
  const board = choice(file.collections.find((c) => c.id === 'egger-ldsp')!.items[0].code, 'egger-ldsp');
  const lacq = choice(file.collections.find((c) => c.id === 'egger-perfectsense')!.items[0].code, 'egger-perfectsense');
  const eggerTop = choice(file.collections.find((c) => c.id === 'egger-worktops')!.items[0].code, 'egger-worktops');
  const grandex = choice('GRANDEX-A-410', 'grandex-acrylic');
  const bedroom = buildRun({
    lengthMm: 2000,
    ceilingHeightMm: 2500,
    requirements: { ...DEFAULT_REQUIREMENTS, zone: 'bedroom', doorSystem: 'hinged', appliances: [], sections: ['shelves', 'hanging_long'] },
    openings: [],
    comms: [],
  });
  const kitchen = buildRun({ lengthMm: 3800, ceilingHeightMm: 2700, requirements: DEFAULT_REQUIREMENTS, openings: [], comms: [] });
  const verdict = (target: Parameters<typeof materialOps>[0], c: typeof board, run: typeof bedroom) => {
    const plan = materialOps(target, c, run, run.modules[0]?.id ?? null, MATERIAL_FINISHES);
    return 'refusal' in plan ? `нет: ${plan.refusal}` : `да: ${plan.ops.map((op) => op.op).join(',')}`;
  };
  const table = {
    boardCarcass: verdict('carcass', board, bedroom),
    boardModuleCarcass: verdict('module-carcass', board, bedroom),
    boardFront: verdict('module', board, bedroom),
    boardTop: verdict('countertop', board, kitchen),
    lacqCarcass: verdict('carcass', lacq, bedroom),
    lacqFront: verdict('module', lacq, bedroom),
    eggerTopCarcass: verdict('carcass', eggerTop, bedroom),
    grandexCarcass: verdict('carcass', grandex, bedroom),
    grandexFront: verdict('fronts', grandex, bedroom),
    grandexBedroom: verdict('countertop', grandex, bedroom),
    grandexKitchen: verdict('countertop', grandex, kitchen),
  };
  check(
    'P3.C7 совместимость по изделию: плита EGGER — корпус ряда, корпус модуля и фасад; PerfectSense — только фасад; столешницы EGGER и GRANDEX — только столешница, в спальне её нет',
    table.boardCarcass.startsWith('да: set_carcass') &&
      table.boardModuleCarcass === 'да: set_carcass' &&
      table.boardFront.startsWith('да: set_front') &&
      table.boardTop.startsWith('нет') &&
      table.lacqCarcass.startsWith('нет') &&
      table.lacqFront.startsWith('да: set_front') &&
      table.eggerTopCarcass.startsWith('нет') &&
      table.grandexCarcass.startsWith('нет') &&
      table.grandexFront.startsWith('нет') &&
      /столешницы нет/.test(table.grandexBedroom) &&
      table.grandexKitchen === 'да: set_countertop',
    Object.entries(table).map(([k, v]) => `${k} ${v.slice(0, 60)}`).join(' | '),
  );

  /* Цены нет — строка «цена не задана», итог «неполный»; геометрия раскроя не едет. */
  const carcassItems = carcassCatalog(loaded);
  const withTop = applyOps({ run: kitchen, requirements: DEFAULT_REQUIREMENTS, ops: (materialOps('countertop', grandex, kitchen, null, MATERIAL_FINISHES) as { ops: MillworkOp[] }).ops, openings: [] });
  const estimate = buildEstimate(withTop, 'optimal', DEMO_RATES, [], undefined, undefined, undefined, undefined, carcassItems, items);
  const topLine = unpricedLines(estimate).find((line) => /столешниц/i.test(line.title));
  const planBoard = materialOps('module-carcass', board, bedroom, bedroom.modules[0].id, MATERIAL_FINISHES) as { ops: MillworkOp[] };
  const planFront = materialOps('module', lacq, bedroom, bedroom.modules[0].id, MATERIAL_FINISHES) as { ops: MillworkOp[] };
  const dressed = applyOps({ run: bedroom, requirements: { ...DEFAULT_REQUIREMENTS, zone: 'bedroom', doorSystem: 'hinged', appliances: [], sections: ['shelves', 'hanging_long'] }, ops: [...planBoard.ops, ...planFront.ops], openings: [] });
  const dims = (run: typeof bedroom) => buildPanels({ run }).map((p) => `${p.moduleId}:${p.name}:${p.lengthMm}x${p.widthMm}x${p.thicknessMm}x${p.qty}`).join('|');
  const bedEstimate = buildEstimate(dressed, 'optimal', DEMO_RATES, [], undefined, undefined, undefined, undefined, carcassItems, items);
  check(
    'P3.C8 GRANDEX на столешнице кухни без цены: строка «цена не задана», итог «неполный»; EGGER на корпус левого шкафа и PerfectSense на его фасад — размеры деталей раскроя те же до миллиметра, соседний шкаф не тронут',
    Boolean(topLine) &&
      /неполный/.test(totalCaption(estimate)) &&
      dressed.warnings.length === 0 &&
      dressed.modules[0].carcassItemId === board.item.id &&
      dressed.modules[0].front?.itemId === lacq.item.id &&
      dressed.modules.slice(1).every((m) => !m.carcassItemId && !m.front?.itemId) &&
      dims(dressed) === dims(bedroom) &&
      /неполный/.test(totalCaption(bedEstimate)),
    `${topLine ? `${topLine.title}: ${topLine.priceUnset}` : 'СТРОКИ НЕТ'} · ${totalCaption(estimate)} · спальня: ${totalCaption(bedEstimate)} · ${dressed.warnings.join(' | ') || 'отказов нет'}`,
  );
}

/* ═══════════  P3D-TEX: образцы декоров из брошюр — точно по артикулу, на карточке и на детали  ═══════════ */
/*
 * Образец — картинка из PDF производителя, сопоставленная с позицией по
 * коду и структуре ДОСЛОВНО (`scripts/build-reference-textures.ts`). Здесь
 * проверяется то, что лежит в репозитории и идёт путём экрана:
 * `fetchCatalog` → `withReferences` → `materialItemOf` / `carcassItemOf`.
 * Файлы образцов вне git — их не трогаем; таблица и путь до детали — здесь.
 */
async function referenceTextureChecks() {
  console.log('\nP3D-TEX: образцы EGGER и GRANDEX — точно по артикулу, размер принят, путь экрана до карточки и 3D');
  const file = parseMaterialFile(catalogJson);
  const REVIEW = ['egger-ldsp', 'egger-perfectsense', 'egger-worktops', 'grandex-acrylic'];
  const reviewItems = REVIEW.flatMap((id) => (file.collections.find((c) => c.id === id)?.items ?? []).map((item) => ({ item, collection: id })));
  const table = Object.entries(REFERENCE_TEXTURES);
  const bySource: Record<string, number> = {};
  for (const [, r] of table) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  const files = new Set(table.map(([, r]) => r.file));
  const keyOfItem = (item: (typeof reviewItems)[number]['item']) => referenceKeyOf({ provenance: item.provenance });
  const missing = reviewItems.filter(({ item }) => {
    const key = keyOfItem(item);
    return !key || !REFERENCE_TEXTURES[key];
  });
  check(
    'TX1 таблица образцов: 340 (EDC26 76 · брошюра столешниц 174 · GRANDEX 90), файлов 337; у каждой из 337 позиций каталога образец по ключу provenance.preview',
    table.length === 340 &&
      bySource.edc26 === 76 &&
      bySource.worktops === 174 &&
      bySource['grandex-pack'] === 90 &&
      files.size === 337 &&
      reviewItems.length === 337 &&
      missing.length === 0,
    `образцов ${table.length} · ${JSON.stringify(bySource)} · файлов ${files.size} · позиций ${reviewItems.length} · без образца ${missing.length}${missing.length ? `: ${missing.slice(0, 3).map(({ item }) => item.code).join(', ')}` : ''}`,
  );

  /*
   * ТОЧНО ПО АРТИКУЛУ: подпись под образцом в брошюре — тот же код и та же
   * структура, что у позиции. Подпись «W1001 PG / ST9» подходит и «PG».
   * Ключ таблицы несёт код записи пакета — и он тот же, что в подписи.
   */
  const alnum = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const fits = (caption: string | null, code: string, finish: string) => {
    if (!caption) return false;
    const [head, ...rest] = caption.split(' ');
    const tail = rest.join(' ');
    return head === code && (alnum(tail) === alnum(finish) || tail.split('/').some((part) => alnum(part) === alnum(finish)));
  };
  const wrong: string[] = [];
  for (const { item } of reviewItems) {
    const p = item.provenance as Record<string, string>;
    const sample = REFERENCE_TEXTURES[keyOfItem(item) ?? ''];
    if (!sample) continue;
    if (p.brand === 'GRANDEX') {
      if (sample.source !== 'grandex-pack' || !sample.file.startsWith(`GRANDEX/${p.manufacturerDecorCode}.`)) wrong.push(`${item.code} → ${sample.file}`);
    } else if (!fits(sample.caption, p.manufacturerDecorCode, p.surfaceCode)) {
      wrong.push(`${item.code} → «${sample.caption}»`);
    }
  }
  const keyCode = table.filter(([key, r]) => r.caption && key.split('/')[1].split('_')[0] !== r.caption.split(' ')[0]);
  check(
    'TX2 каждый образец — того же артикула: код и структура подписи в брошюре = код и поверхность позиции (337 из 337); код ключа = код подписи (250 из 250 EGGER)',
    wrong.length === 0 && keyCode.length === 0 && table.filter(([, r]) => r.caption).length === 250,
    wrong.length || keyCode.length
      ? `не тот: ${[...wrong, ...keyCode.map(([k, r]) => `${k} ↔ ${r.caption}`)].slice(0, 4).join(' | ')}`
      : 'все сходятся',
  );

  /*
   * МАСШТАБ ПРИНЯТ, И ОДИН: EGGER — печать 1:10 при 150 dpi брошюры (1.6–1.8
   * мм на пиксель у обеих брошюр), GRANDEX — длинная сторона 600 мм.
   * Волокно — по правилу цеха: плита вдоль v, столешница вдоль u.
   */
  const perPx = table.filter(([, r]) => r.source !== 'grandex-pack').flatMap(([, r]) => [r.mm[0] / r.px[0], r.mm[1] / r.px[1]]);
  const grandexLong = table.filter(([, r]) => r.source === 'grandex-pack').map(([, r]) => Math.max(...r.mm));
  const classOf = new Map(reviewItems.map(({ item }) => [keyOfItem(item), (item.provenance as Record<string, string>).productClass]));
  /*
   * Волокно ДЕРЕВА (декоры H…) обязано лечь по правилу цеха. Камень и уни
   * (F…, U…, W…, GRANDEX) лежат так, как их печатает производитель: прожилка
   * мрамора идёт как угодно, а «направление» крошки — шум оценки.
   */
  const wood = table.filter(([key, r]) => /^EGGER\/H/.test(key) && classOf.has(key) && r.grain !== 'none');
  const badGrain = wood.filter(([key, r]) => {
    const cls = classOf.get(key);
    const worktop = cls === 'egger_worktop' || cls === 'solid_surface_worktop';
    return r.grain !== (worktop ? 'horizontal' : 'vertical');
  });
  check(
    'TX3 размер ПРИНЯТ и назван (basis assumed): EGGER 1.6–1.8 мм/пикс, GRANDEX — 600 мм по длинной стороне; волокно дерева у плиты вдоль v, у столешницы вдоль u',
    REFERENCE_SCALE.basis === 'assumed' &&
      perPx.every((v) => v >= 1.6 && v <= 1.8) &&
      grandexLong.length === 90 &&
      grandexLong.every((v) => v === REFERENCE_SCALE.grandexLongMm) &&
      wood.length > 0 &&
      badGrain.length === 0,
    `мм/пикс ${Math.min(...perPx).toFixed(2)}…${Math.max(...perPx).toFixed(2)} · GRANDEX ${Math.min(...grandexLong)}…${Math.max(...grandexLong)} мм · дерево с явным волокном ${wood.length}, поперёк правила ${badGrain.length}`,
  );

  /* Путь экрана без базы: строки импорта → позиции → образцы → позиция для сметы и сцены. */
  const plan = planMaterialImport(file, [], { collections: REVIEW });
  const others = planMaterialImport(file, []).rows.slice(0, 60);
  const loaded = [...catalogEntriesFromRows(plan.rows, file, 'org-t', 't:'), ...catalogEntriesFromRows(others, file, 'org-t', 'u:')];
  const bare = materialCatalog(loaded);
  const dressed = withReferences(loaded, REFERENCE_TEXTURES);
  const items = materialCatalog(dressed);
  const reviewIds = loaded.filter((e) => referenceKeyOf(e.meta)).map((e) => e.id);
  /*
   * P3D-LDSP: ОБРАЗЕЦ БРОШЮРЫ ЛОЖИТСЯ НА ДЕТАЛЬ ТОЛЬКО У СТОЛЕШНИЦ.
   *
   * Было (P3D-TEX): все 337 позиций получали образец брошюры на деталь.
   * Права на изображения EGGER не подтверждены, и владелец велел брать
   * только изображения с правом публикации и применения: плита (вкладка
   * «ЛДСП» — ЛДСП 136 и PerfectSense 29) образца не получает. Плита-дерево —
   * демонстрационный рисунок в цвет образца (адрес рисунка, плитка
   * 800 × 1600 мм, прямой повтор), однотон и камень — ровный цвет образца.
   * Столешницы — прежним путём (кухня в P3D-LDSP не трогается). Цвет у всех
   * 337 — средний цвет образца, как и был.
   */
  const kinds = { worktop: 0, wood: 0, plain: 0 };
  const badPhoto = reviewIds.filter((id) => {
    const item = items.get(id);
    const entry = dressed.find((e) => e.id === id)!;
    const key = referenceKeyOf(entry.meta)!;
    const r = REFERENCE_TEXTURES[key];
    if (!item || item.colorHex !== r.hex) return true;
    /*
     * Материалы, финал: столешница — тоже без образца брошюры, пока права не
     * подтверждены (NOT_VERIFIED у всех 337): ровный цвет самого образца.
     * Было (P3D-LDSP): образец на деталь, зеркально — и GRANDEX A-401 на
     * кухне выходил белым множителем под картинкой, которой на проде нет.
     */
    if (!isBoardItem(item)) {
      kinds.worktop += 1;
      return item.photo !== null;
    }
    if (isWoodDecor(item.review?.decorCode)) {
      kinds.wood += 1;
      const demo = item.photo?.procedural;
      return (
        !demo ||
        demo.hex !== r.hex ||
        item.photo!.url !== woodPatternUrl(demo) ||
        !item.photo!.url.startsWith('procedural:wood?') ||
        item.photo!.mirror !== false ||
        item.photo!.sizeM[0] !== WOOD_TILE_MM[0] / 1000 ||
        item.photo!.sizeM[1] !== WOOD_TILE_MM[1] / 1000
      );
    }
    kinds.plain += 1;
    return item.photo !== null;
  });
  const othersSame = loaded
    .filter((e) => !referenceKeyOf(e.meta))
    .every((e) => JSON.stringify(bare.get(e.id)) === JSON.stringify(items.get(e.id)));
  const bareWithPhoto = reviewIds.filter((id) => bare.get(id)?.photo).length;
  const h1113 = Array.from(items.values()).find((i) => i.code === 'EGGER-H1113-ST10');
  check(
    'TX4 путь экрана: права на картинки не подтверждены — образца брошюры нет ни на одной детали: столешницы 172 (EGGER 82, GRANDEX 90) и плита однотон и камень 84 — ровный цвет без картинки; плита-дерево 81 — демонстрационный рисунок в цвет образца (800 × 1600 мм, прямой повтор); цвет у всех 337 — средний цвет образца; без таблицы фото ни у одной; МДФ и RAL не тронуты',
    reviewIds.length === 337 &&
      kinds.worktop === 172 &&
      kinds.wood === 81 &&
      kinds.plain === 84 &&
      badPhoto.length === 0 &&
      bareWithPhoto === 0 &&
      othersSame &&
      h1113?.colorHex === '#aa8763' &&
      h1113.photo?.procedural?.hex === '#aa8763',
    `позиций ${reviewIds.length} · столешниц ${kinds.worktop} · дерево ${kinds.wood} · однотон/камень ${kinds.plain} · не так ${badPhoto.length} · без таблицы с фото ${bareWithPhoto} · прочие ${othersSame ? 'те же' : 'ИЗМЕНИЛИСЬ'} · H1113 ST10 ${h1113?.colorHex} → ${h1113?.photo?.url.slice(0, 40) ?? 'БЕЗ РИСУНКА'}`,
  );

  /*
   * ПРАВА РЕШАЮТ, А НЕ ОКРУЖЕНИЕ: та же позиция с подтверждёнными правами
   * (`rightsStatus: 'VERIFIED'`) получает образец брошюры на деталь —
   * столешница зеркально и в принятом размере. Плита — нет и с правами:
   * кроп брошюры 0.6 пикс/мм на плиту не идёт (P3D-LDSP), у дерева рисунок.
   */
  const verify = (id: string) => {
    const entry = dressed.find((e) => e.id === id)!;
    const provenance = (entry.meta?.provenance ?? {}) as Record<string, unknown>;
    return materialItemOf({ ...entry, meta: { ...entry.meta, provenance: { ...provenance, rightsStatus: 'VERIFIED' } } });
  };
  const worktopId = reviewIds.find((id) => items.get(id)?.code === 'GRANDEX-A-401');
  const boardId = reviewIds.find((id) => items.get(id)?.code === 'EGGER-W1000-ST9');
  const worktopKey = worktopId ? referenceKeyOf(dressed.find((e) => e.id === worktopId)!.meta) : null;
  const verifiedWorktop = worktopId ? verify(worktopId) : null;
  const verifiedBoard = boardId ? verify(boardId) : null;
  check(
    'TX9 картинка брошюры — только с подтверждёнными правами: GRANDEX-A-401 с VERIFIED получает образец (зеркально, принятый размер), без — ровный цвет #d6cdc5; плита W1000 и с VERIFIED без картинки',
    Boolean(worktopId && boardId && worktopKey) &&
      items.get(worktopId!)?.photo === null &&
      items.get(worktopId!)?.colorHex === '#d6cdc5' &&
      verifiedWorktop?.photo?.url === referenceUrl(worktopKey!) &&
      verifiedWorktop?.photo?.mirror === true &&
      verifiedBoard?.photo === null,
    worktopId && boardId
      ? `A-401: ${items.get(worktopId)?.photo ? 'С КАРТИНКОЙ' : 'цвет'} ${items.get(worktopId)?.colorHex} · с VERIFIED: ${verifiedWorktop?.photo?.url ?? 'БЕЗ КАРТИНКИ'} · W1000 с VERIFIED: ${verifiedBoard?.photo ? 'С КАРТИНКОЙ' : 'цвет'}`
      : `НУЛЕВОЙ СЕЛЕКТОР: A-401 ${Boolean(worktopId)} · W1000 ${Boolean(boardId)}`,
  );

  /*
   * БЕЛОЕ ЛДСП ДЛЯ СРАВНЕНИЯ — позиция каталога, а не цвет из кода: W1000
   * с поверхностью ST9. Нет W1000 в каталоге — сравнения нет (null), белый
   * не придумывается.
   */
  const white = whiteLdspOf(items.values());
  const withoutWhite = whiteLdspOf(Array.from(items.values()).filter((i) => i.review?.decorCode !== 'W1000'));
  check(
    'TX8 белое ЛДСП для сравнения в 3D — позиция каталога EGGER-W1000-ST9 (#fcfcf3); без W1000 в каталоге сравнения нет',
    white?.code === 'EGGER-W1000-ST9' && white.colorHex === '#fcfcf3' && white.photo === null && withoutWhite === null,
    `${white?.code ?? 'НЕТ'} ${white?.colorHex ?? ''} · без W1000 → ${withoutWhite?.code ?? 'нет'}`,
  );

  const carcass = carcassCatalog(dressed);
  const eggerBoards = dressed.filter((e) => e.category.key === 'collection:egger-ldsp');
  const carcassWrong = eggerBoards.filter((e) => carcass.get(e.id)?.colorHex !== e.reference?.hex);
  check(
    'TX5 корпус: 136 плит EGGER красят корпус цветом самого образца (тем же, что карточка), а не цветом кропа со страницей',
    eggerBoards.length === 136 && carcassWrong.length === 0,
    `плит ${eggerBoards.length} · цвет не тот ${carcassWrong.length}`,
  );

  /* Одна дверь чтения: `fetchCatalog` отдаёт позиции уже с образцами. */
  const sample = dressed.find((e) => e.reference && e.article === 'EGGER-H1113-ST10');
  const plain = dressed.find((e) => !e.reference);
  if (!sample || !plain) {
    check('TX6 позиции для чтения найдены', false, `НУЛЕВОЙ СЕЛЕКТОР: EGGER ${Boolean(sample)} · обычная ${Boolean(plain)}`);
    return;
  }
  const raw = (entry: typeof sample) => {
    const { category, assets, reference, ...row } = entry;
    void reference;
    return { ...row, catalog_categories: category, catalog_assets: assets };
  };
  const read = (await fetchCatalog(stubClient([{ data: [raw(sample), raw(plain)], error: null }]) as never, 'org-t')) as {
    entries: typeof dressed | null;
  };
  const readSample = read.entries?.find((e) => e.id === sample.id);
  const readPlain = read.entries?.find((e) => e.id === plain.id);
  check(
    'TX6 fetchCatalog (экран, админка, перечитывание, кабинет) отдаёт позицию EGGER уже с образцом, обычную — без; в meta строки образец не попадает',
    readSample?.reference?.file === sample.reference?.file && readPlain?.reference === undefined && !('reference' in (readSample?.meta ?? {})),
    `EGGER: ${readSample?.reference?.file ?? 'НЕТ ОБРАЗЦА'} · обычная: ${readPlain ? (readPlain.reference ? 'С ОБРАЗЦОМ' : 'без образца') : 'НУЛЕВОЙ СЕЛЕКТОР'}`,
  );

  /* Одна величина — один расчёт: цвет в файле каталога = цвет образца. */
  const hexDiff = reviewItems.filter(({ item }) => item.hex !== REFERENCE_TEXTURES[keyOfItem(item) ?? '']?.hex);
  check(
    'TX7 цвет позиций EGGER/GRANDEX в data/catalog/catalog.json = средний цвет самого образца (337 из 337)',
    hexDiff.length === 0,
    hexDiff.length ? `расходятся ${hexDiff.length}: ${hexDiff.slice(0, 3).map(({ item }) => `${item.code} ${item.hex}`).join(', ')}` : 'сходятся',
  );
}

/* ─────────────  Слой 58: модели KIRA в каталог организации — повторяемый импорт  ───────────── */
/*
 * План импорта — чистая функция (`planKiraImport`): его зовёт маршрут
 * `/api/catalog/kira` и до записи, и при записи. Здесь он меряется на
 * строках, какими их отдала бы база: новый каталог, повтор, правки компании,
 * устаревшее происхождение, чужой артикул, задвоенный артикул.
 */
import { KIRA_CATALOG as KIRA_ALL, planKiraImport, type KiraExistingRow } from '../lib/millwork/kiraCatalog';
{
  console.log('\nМодели KIRA: импорт в каталог организации');
  const EXPECTED: Record<string, [number, number, number]> = {
    /* найдено, с 3D, только карточка */
    prostfrez: [12, 12, 0],
    viborka: [28, 24, 4],
    rify: [15, 15, 0],
    moldingi: [1, 1, 0],
    vitrina: [5, 5, 0],
    integra: [7, 7, 0],
    other: [1, 1, 0],
  };
  const fresh = planKiraImport([]);
  const byCategoryOk = Object.entries(EXPECTED).every(([key, [found, relief, cardOnly]]) => {
    const n = fresh.byCategory[key as keyof typeof fresh.byCategory];
    return n.found === found && n.insert === found && n.relief === relief && n.cardOnly === cardOnly && n.update === 0 && n.unchanged === 0;
  });
  check(
    'KI1 пустой каталог: ложится 69 моделей одной строкой каждая (артикулы без повторов), по категориям сайта 12 / 28 / 15 / 1 / 5 / 7 и СЛ 9 вне их; с 3D 65, только карточка 4 (выборка); цена у всех ноль — «цена не задана»; обновлять и конфликтовать нечему',
    fresh.insert.length === 69 &&
      new Set(fresh.insert.map((row) => row.article)).size === 69 &&
      fresh.update.length === 0 &&
      fresh.unchanged.length === 0 &&
      fresh.conflicts.length === 0 &&
      byCategoryOk &&
      fresh.insert.every((row) => row.price === 0 && row.article.startsWith('KIRA-')),
    Object.entries(fresh.byCategory)
      .map(([key, n]) => `${key} ${n.found}: 3D ${n.relief}, карточка ${n.cardOnly}`)
      .join(' · '),
  );

  /* Что записала бы база: те же строки, с id и JSON-кругом. */
  const written: KiraExistingRow[] = fresh.insert.map((row, i) => ({
    id: `row-${i}`,
    article: row.article,
    meta: JSON.parse(JSON.stringify(row.meta)) as Record<string, unknown>,
  }));
  const again = planKiraImport(written);
  check(
    'KI2 повторный импорт не добавляет ни строки и ничего не переписывает: 69 без изменений',
    again.insert.length === 0 && again.update.length === 0 && again.unchanged.length === 69 && again.conflicts.length === 0,
    `новых ${again.insert.length}, обновить ${again.update.length}, без изменений ${again.unchanged.length}, конфликтов ${again.conflicts.length}`,
  );

  /* Компания дописала в позицию своё; у другой позиции устарело происхождение. */
  const own = written.map((row) =>
    row.article === 'KIRA-RIF-2'
      ? { ...row, meta: { ...row.meta, note: 'наш поставщик', finishPrices: { matte: 31000 } } }
      : row.article === 'KIRA-OV-77'
        ? { ...row, meta: { ...row.meta, note: 'своё', provenance: { ...(row.meta!.provenance as Record<string, unknown>), source: 'https://kira-group.kz/old' } } }
        : row,
  );
  const refresh = planKiraImport(own);
  const ov77 = refresh.update.find((row) => row.article === 'KIRA-OV-77');
  const ov77Source = (ov77?.meta.provenance as { source?: string } | undefined)?.source;
  check(
    'KI3 своё у компании остаётся: позиция с её полями — без изменений; у позиции с устаревшим происхождением обновляются только происхождение и рисунок, её поле остаётся; в обновлении нет ни цены, ни названия',
    refresh.insert.length === 0 &&
      refresh.unchanged.includes('KIRA-RIF-2') &&
      refresh.update.length === 1 &&
      Boolean(ov77) &&
      ov77!.meta.note === 'своё' &&
      ov77Source === KIRA_ALL.find((e) => e.code === 'OV-77')!.source &&
      Object.keys(ov77!).sort().join(',') === 'article,id,meta',
    `обновить ${refresh.update.map((row) => row.article).join(', ') || 'НИЧЕГО'} · поле компании «${String(ov77?.meta.note ?? 'ПОТЕРЯНО')}» · источник ${ov77Source ?? '—'}`,
  );

  /* Артикул занят чужой позицией; артикул задвоен; своя посторонняя позиция KIRA-…. */
  const foreign = [
    ...written.filter((row) => row.article !== 'KIRA-V2'),
    { id: 'foreign', article: 'KIRA-V2', meta: { color: '#ffffff' } },
    { id: 'dup', article: 'KIRA-SL-3', meta: written.find((row) => row.article === 'KIRA-SL-3')!.meta },
    { id: 'custom', article: 'KIRA-OLD-1', meta: { note: 'снятая с производства модель компании' } },
  ];
  const guarded = planKiraImport(foreign);
  check(
    'KI4 чужое не трогается: артикул, занятый позицией не из каталога KIRA, и задвоенный артикул — конфликт словами, строки не обновляются; позиция, которой в каталоге нет (KIRA-OLD-1), не удаляется и не упоминается; остальные 67 без изменений',
    guarded.conflicts.map((c) => c.article).sort().join(',') === 'KIRA-SL-3,KIRA-V2' &&
      guarded.conflicts.every((c) => c.why.length > 20) &&
      guarded.insert.length === 0 &&
      guarded.update.length === 0 &&
      guarded.unchanged.length === 67 &&
      !JSON.stringify(guarded).includes('KIRA-OLD-1'),
    guarded.conflicts.map((c) => `${c.article}: ${c.why}`).join(' | '),
  );
}

/*
 * ХВОСТ ЖДЁТ АСИНХРОННЫЕ ПРОВЕРКИ.
 *
 * Запись цены в каталог — запрос, и ответ у него приходит промисом.
 * Напечатай итог раньше — и проверка записи не попала бы в счёт:
 * проверка, которая не считается, это не проверка.
 */
void millingPriceChecks()
  .then(() => catalogReadChecks())
  .then(() => referenceTextureChecks())
  .then(() => {
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
});
