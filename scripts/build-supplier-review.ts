/**
 * EGGER И GRANDEX ИЗ ПАКЕТА ПРОВЕРКИ → КОЛЛЕКЦИИ `data/catalog/catalog.json` (P3).
 *
 * Запуск: npx tsx --tsconfig tsconfig.scripts.json scripts/build-supplier-review.ts [папка пакета]
 * По умолчанию пакет — CATALOG_STAGING/99_IMPORT_QUEUE/EGGER_GRANDEX.
 *
 * Что делает:
 *   • читает `data/COMBINED_EGGER_GRANDEX_REVIEW.json` (список; считается
 *     длина массива, а не «один объект»: прежний установщик насчитывал 1);
 *   • сопоставляет карточки коллекциям тем же `mapReviewRecords`, что
 *     проверяет `test:catalog`;
 *   • цвет позиции — среднее по кропу образца (sharp), и это помечено:
 *     цвет на детали — приближение к печатному образцу, а не плита;
 *   • вписывает позиции в коллекции `egger-ldsp` и `grandex-acrylic` и две
 *     новые рядом (`egger-perfectsense`, `egger-worktops`) — ТОЧЕЧНО: остальной
 *     файл (МДФ, 1825 RAL, шпон, КЕДР) не переформатируется и не меняется.
 *
 * Чего НЕ делает: не пишет в базу, не копирует картинки в public, не
 * трогает исходники брошюр. Повторный запуск даёт тот же файл байт в байт.
 */
import sharp from 'sharp';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapReviewRecords, type ReviewRecord } from '../lib/millwork/supplierReview';
import { parseMaterialFile } from '../lib/millwork/materialCatalog';

const PACK = process.argv[2] ?? 'CATALOG_STAGING/99_IMPORT_QUEUE/EGGER_GRANDEX';
const CATALOG = 'data/catalog/catalog.json';
/** Дата проверки пакета: из README пакета, а не «сегодня» — повторный запуск обязан дать тот же файл. */
const CHECKED_AT = '2026-10-17';

function fail(message: string): never {
  throw new Error(message);
}

/** Границы объекта JSON, начинающегося на `start` (`{`), с учётом строк. */
function objectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return fail('объект не закрыт');
}

/** Текст коллекции по id: начало `{` и конец. */
function collectionSpan(text: string, id: string): { from: number; to: number } | null {
  const at = text.indexOf(`"id": "${id}"`);
  if (at < 0) return null;
  const from = text.lastIndexOf('{', at);
  return { from, to: objectEnd(text, from) };
}

/** JSON с отступом файла (1 пробел) и сдвигом под уровень коллекций (2 пробела). */
function asBlock(value: unknown, indent: number): string {
  const pad = ' '.repeat(indent);
  return JSON.stringify(value, null, 1)
    .split('\n')
    .map((line, i) => (i === 0 ? line : pad + line))
    .join('\n');
}

async function hexOfFile(file: string): Promise<string | null> {
  if (!existsSync(file)) return null;
  const stats = await sharp(file).stats();
  const [r, g, b] = stats.channels.slice(0, 3).map((channel) => Math.round(channel.mean));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

async function main() {
  const reviewPath = join(PACK, 'data', 'COMBINED_EGGER_GRANDEX_REVIEW.json');
  if (!existsSync(reviewPath)) fail(`Пакета проверки нет: ${reviewPath}. База и каталог не трогались.`);
  const raw = JSON.parse(readFileSync(reviewPath, 'utf8')) as unknown;
  if (!Array.isArray(raw)) fail(`${reviewPath}: ожидался СПИСОК карточек, пришёл ${typeof raw}`);
  const records = raw as ReviewRecord[];

  /* Цвет кропа — заранее, чтобы сопоставление осталось чистой функцией. */
  const hexById = new Map<string, string | null>();
  for (const record of records) {
    hexById.set(record.id, await hexOfFile(join(PACK, record.preview)));
  }
  const mapping = mapReviewRecords(records, (record) => hexById.get(record.id) ?? null, CHECKED_AT);

  const brands: Record<string, number> = {};
  for (const record of records) brands[record.brand] = (brands[record.brand] ?? 0) + 1;
  const nameUnverified = Object.values(mapping.items)
    .flat()
    .filter((item) => !item.provenance.nameVerified).length;

  let text = readFileSync(CATALOG, 'utf8');

  const reviewNote =
    'Справочные карточки поставщика: кроп печатного образца из PDF (только для карточки выбора), ' +
    'не PBR и не текстура плиты; права на изображения не подтверждены; цен нет. На детали — средний цвет образца.';

  const definitions: Record<string, Record<string, unknown>> = {
    'egger-ldsp': {
      id: 'egger-ldsp',
      category: 'ldsp',
      label: 'ЛДСП · EGGER',
      roles: ['carcass', 'front'],
      finishes: ['wood_texture', 'matte'],
      priceUnit: 'sheet',
      status: 'review',
      review: true,
      source: {
        type: 'supplier_brochure',
        pdf: 'BR+EDC26+Collection+Brochure+EAST+EN.pdf',
        pages: '76–83',
        url: 'https://www.egger.com/en/furniture-interior-design/decorative-collection/planning-and-visualisation',
        note: `Декоративные плиты EGGER (White & Uni, Wood, Feelwood). ${reviewNote} Полные данные декоров — myEGGER.`,
      },
    },
    'egger-perfectsense': {
      id: 'egger-perfectsense',
      category: 'ldsp',
      label: 'PerfectSense · EGGER (лакированные плиты)',
      roles: ['front'],
      finishes: ['gloss', 'matte'],
      priceUnit: 'sheet',
      status: 'review',
      review: true,
      source: {
        type: 'supplier_brochure',
        pdf: 'BR+EDC26+Collection+Brochure+EAST+EN.pdf',
        pages: '76–83',
        note: `Лакированные плиты PerfectSense — фасады. ${reviewNote}`,
      },
    },
    'egger-worktops': {
      id: 'egger-worktops',
      category: 'countertop',
      label: 'Столешница · EGGER',
      roles: ['countertop'],
      finishes: ['wood_texture', 'matte'],
      priceUnit: 'running_m',
      status: 'review',
      review: true,
      source: {
        type: 'supplier_brochure',
        pdf: 'BR+EDC26+Collection+Brochure+EAST+EN.pdf',
        pages: '76–83',
        note: `Столешницы EGGER (кромочные, постформинг). ${reviewNote} Толщина и профиль — по артикулу, не по брошюре.`,
      },
    },
    'grandex-acrylic': {
      id: 'grandex-acrylic',
      category: 'countertop',
      label: 'Столешница · Grandex (акриловый камень)',
      roles: ['countertop', 'backsplash'],
      finishes: ['matte', 'satin'],
      priceUnit: 'running_m',
      status: 'review',
      review: true,
      source: {
        type: 'supplier_catalog',
        pdf: 'katalog-grandex-KZ-mob-2025.pdf',
        url: 'https://interstone.su/stones/akrilovyy-kamen/grandex/colors/',
        note: `Акриловый камень Grandex 12 мм — столешницы и фартук, не ЛДСП и не полки. ${reviewNote}`,
      },
    },
  };

  /* Существующие коллекции — заменить на месте; новых нет — встать сразу за EGGER. */
  for (const id of ['egger-ldsp', 'grandex-acrylic']) {
    const span = collectionSpan(text, id) ?? fail(`В ${CATALOG} нет коллекции ${id} — некуда класть.`);
    const block = asBlock({ ...definitions[id], items: mapping.items[id] ?? [] }, 2);
    text = text.slice(0, span.from) + block + text.slice(span.to);
  }
  for (const id of ['egger-worktops', 'egger-perfectsense']) {
    const block = asBlock({ ...definitions[id], items: mapping.items[id] ?? [] }, 2);
    const existing = collectionSpan(text, id);
    if (existing) {
      text = text.slice(0, existing.from) + block + text.slice(existing.to);
    } else {
      const after = collectionSpan(text, 'egger-ldsp')!;
      text = `${text.slice(0, after.to)},\n  ${block}${text.slice(after.to)}`;
    }
  }

  /* Сводка пакета — для показа «что ляжет»: слитое, недопустимое, неполное. */
  const pack = {
    id: 'egger-grandex-2026-10',
    label: 'EGGER 26+ (брошюра, стр. 76–83) и GRANDEX 2025 — пакет проверки',
    source: 'CATALOG_STAGING/99_IMPORT_QUEUE/EGGER_GRANDEX/data/COMBINED_EGGER_GRANDEX_REVIEW.json',
    records: records.length,
    brands,
    collections: ['egger-ldsp', 'egger-perfectsense', 'egger-worktops', 'grandex-acrylic'],
    duplicate: mapping.duplicates.reduce((sum, entry) => sum + entry.merged.length, 0),
    ineligible: mapping.ineligible.length,
    incomplete: mapping.incomplete.length,
    nameUnverified,
    note:
      'Карточки, а не товары: цен нет, права на образцы не подтверждены, образцы — кропы PDF, не PBR. ' +
      `Не загружено: ${mapping.ineligible.length} — кромка, ламинат и компакт (в Studio нет такой детали); ` +
      `слито повторов: ${mapping.duplicates.reduce((sum, entry) => sum + entry.merged.length, 0)}.`,
  };
  const packText = asBlock([pack], 1);
  const packAt = text.indexOf('"reviewPacks": [');
  if (packAt >= 0) {
    const end = objectEnd(text, text.indexOf('[', packAt));
    text = `${text.slice(0, packAt)}"reviewPacks": ${packText}${text.slice(end)}`;
  } else {
    const at = text.indexOf('"collections": [');
    if (at < 0) fail(`В ${CATALOG} нет списка collections`);
    text = `${text.slice(0, at)}"reviewPacks": ${packText},\n ${text.slice(at)}`;
  }

  /* Файл обязан читаться тем же разбором, что у сервера. */
  const parsed = parseMaterialFile(JSON.parse(text));
  writeFileSync(CATALOG, text);

  const counts = Object.fromEntries(parsed.collections.map((c) => [c.id, c.items.length]));
  console.log(
    `Пакет: ${records.length} карточек (${Object.entries(brands).map(([b, n]) => `${b} ${n}`).join(', ')}).\n` +
      `В коллекции: ${['egger-ldsp', 'egger-perfectsense', 'egger-worktops', 'grandex-acrylic'].map((id) => `${id} ${counts[id]}`).join(' · ')}\n` +
      `Слито повторов: ${pack.duplicate} · не встаёт в Studio: ${pack.ineligible} · неполных: ${pack.incomplete} · название не подтверждено: ${nameUnverified}\n` +
      `Цвет из кропа: ${Array.from(hexById.values()).filter(Boolean).length} из ${records.length}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
