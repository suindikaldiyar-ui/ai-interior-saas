/**
 * Приёмка фазы 3 — та её часть, что проверяется без живого Supabase:
 * разбор выгрузок из 1С, расчёт спецификации, правила «фото → комната».
 *
 * Запуск: npm run test:catalog
 * RLS и мультиарендность проверяются отдельно: npm run test:rls (нужны ключи).
 */

import { decodeCsvBuffer, normalizeUnit, parseCatalogCsv, parseCsv } from '../lib/csv';
import { buildSpec, quantityFor, specTotal, surfaceArea } from '../lib/catalog';
import { roomFromAnalysis } from '../lib/roomFromAnalysis';
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

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
