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
  materialDefs,
  materialTabs,
  parseMaterialFile,
  planMaterialImport,
  searchMaterials,
} from '../lib/millwork/materialCatalog';
import { paletteFromCatalog } from '../lib/millwork/palette';
import { carcassCatalog } from '../lib/millwork/carcassMaterial';
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
    'тест 8: счёт по коллекциям назван числом, пустые — нулём, а не пропуском',
    Object.keys(first.byCollection).length === file.collections.length &&
      first.byCollection['egger-ldsp']?.inFile === 0 &&
      first.byCollection['grandex-acrylic']?.inFile === 0,
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
  .then(() => {
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
});
