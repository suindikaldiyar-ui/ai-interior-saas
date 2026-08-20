/**
 * Разбор выгрузок из 1С.
 *
 * Три вещи, на которых ломается наивный парсер:
 *  - BOM в начале файла;
 *  - точка с запятой как разделитель (русская локаль Excel);
 *  - кодировка windows-1251 — 1С выгружает так по умолчанию.
 */

const BOM_UTF8 = [0xef, 0xbb, 0xbf];

/** Декодирует буфер, определяя кодировку. */
export function decodeCsvBuffer(buffer: Uint8Array): string {
  const hasBom =
    buffer.length >= 3 &&
    BOM_UTF8.every((byte, i) => buffer[i] === byte);

  const body = hasBom ? buffer.subarray(3) : buffer;

  if (hasBom) {
    return new TextDecoder('utf-8').decode(body);
  }

  // Строгий UTF-8: если файл на самом деле в 1251, декодер бросит исключение.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    try {
      return new TextDecoder('windows-1251').decode(body);
    } catch {
      return new TextDecoder('utf-8').decode(body);
    }
  }
}

/** Разделитель определяем по первой строке: у 1С это ';'. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts: Record<string, number> = {
    ';': 0,
    ',': 0,
    '\t': 0,
  };
  let inQuotes = false;
  for (const char of firstLine) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && char in counts) counts[char] += 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : ';';
}

/** RFC 4180 с поправкой на произвольный разделитель. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const sep = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === sep) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** «1 234,56 ₸» → 1234.56. Русский формат числа с запятой и пробелами. */
export function parseNumber(raw: string): number {
  const cleaned = raw
    .replace(/\s| /g, '')
    .replace(/[^\d,.-]/g, '')
    .replace(',', '.');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

export type CsvCatalogRow = {
  article: string;
  name: string;
  category_key: string;
  price: number;
  unit: string;
};

export type CsvParseResult = {
  rows: CsvCatalogRow[];
  errors: string[];
  headers: string[];
};

/** Синонимы заголовков — компании называют колонки по-разному. */
const HEADER_ALIASES: Record<keyof CsvCatalogRow, string[]> = {
  article: ['article', 'артикул', 'код', 'sku'],
  name: ['name', 'название', 'наименование', 'товар'],
  category_key: ['category_key', 'категория', 'category', 'группа'],
  price: ['price', 'цена', 'стоимость'],
  unit: ['unit', 'единица', 'ед', 'ед.изм', 'единица измерения'],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/["']/g, '').replace(/\s+/g, ' ');
}

export function parseCatalogCsv(text: string): CsvParseResult {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { rows: [], errors: ['Файл пуст.'], headers: [] };
  }

  const headers = table[0].map(normalizeHeader);
  const index: Partial<Record<keyof CsvCatalogRow, number>> = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [
    keyof CsvCatalogRow,
    string[],
  ][]) {
    const at = headers.findIndex((h) => aliases.includes(h));
    if (at >= 0) index[field] = at;
  }

  const errors: string[] = [];
  for (const required of ['article', 'name', 'category_key'] as const) {
    if (index[required] === undefined) {
      errors.push(
        `Не найдена колонка «${required}». Ожидались варианты: ${HEADER_ALIASES[required].join(', ')}.`,
      );
    }
  }
  if (errors.length > 0) return { rows: [], errors, headers };

  const rows: CsvCatalogRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < table.length; i++) {
    const line = table[i];
    const cell = (field: keyof CsvCatalogRow) => {
      const at = index[field];
      return at === undefined ? '' : (line[at] ?? '').trim();
    };

    const article = cell('article');
    const name = cell('name');
    const categoryKey = cell('category_key');

    if (!article || !name || !categoryKey) {
      errors.push(`Строка ${i + 1}: пропущена — нет артикула, названия или категории.`);
      continue;
    }
    if (seen.has(article)) {
      errors.push(`Строка ${i + 1}: артикул «${article}» повторяется, взята первая.`);
      continue;
    }
    seen.add(article);

    rows.push({
      article,
      name,
      category_key: categoryKey,
      price: parseNumber(cell('price')),
      unit: cell('unit'),
    });
  }

  return { rows, errors, headers };
}

/** Единицу из 1С приводим к нашему перечислению. */
export function normalizeUnit(raw: string): 'm2' | 'piece' | 'running_meter' | 'set' {
  const value = raw.trim().toLowerCase().replace(/\./g, '');
  if (['м2', 'м²', 'm2', 'кв м', 'кв.м', 'квм'].includes(value)) return 'm2';
  if (['пм', 'пог м', 'погм', 'running_meter', 'мп'].includes(value)) return 'running_meter';
  if (['компл', 'комплект', 'set', 'наб'].includes(value)) return 'set';
  return 'piece';
}
