/**
 * ФАРТУК · EGGER SPLASHBACK → КОЛЛЕКЦИЯ `data/catalog/catalog.json` (ЭТАП 4, часть C).
 *
 * Запуск: npx tsx --tsconfig tsconfig.scripts.json scripts/build-egger-splashbacks.ts
 *
 * Факты — из документов EGGER в CATALOG_STAGING/03_MATERIALS/EGGER/SPLASHBACKS (вне git):
 *   • техлист «EGGER Splashbacks», ред. 02 от 15.01.2024 (TD_EGGER_UK_Splashback_Panels_en_UK.pdf):
 *     модель 90, основа — ДСП Eurospan, ламинат с двух сторон, номинальная толщина 9 мм;
 *   • инструкция по обработке, ред. 01 от 14.12.2023 (PI_EGGER_Splashback_Panels.pdf):
 *     ламинат на ДСП номинальной толщиной 9 мм; вплотную к стене и корпусам не ставят — зазор под силикон;
 *   • страница EGGER UK «Kitchen Upstands & Splashbacks» (splashbacks_upstands_GB.html):
 *     «EGGER Worktops are all available with matching splashbacks», формат 4100 × 640 × 8 мм.
 * Расхождение 8 / 9 мм не сводится выбором: оно пишется в позицию, толщина детали — по техлисту,
 * и до подтверждения по артикулу выпуск фартука в цех заперт (`apronFindings`).
 *
 * Позиции — по декорам столешниц EGGER того же файла (тот же декор и структура): отдельного
 * артикула у фартука в документах нет, код позиции — НАШ ключ каталога из кода декора EGGER.
 * Цен нет; образец — тот же REFERENCE_ONLY кроп брошюры, права не подтверждены; наличие в
 * Казахстане не подтверждено. Повторный запуск даёт тот же файл байт в байт.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseMaterialFile } from '../lib/millwork/materialCatalog';

const CATALOG = 'data/catalog/catalog.json';

function fail(message: string): never {
  throw new Error(message);
}

/** Конец объекта/массива JSON с позиции `start`, с учётом строк. */
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

function collectionSpan(text: string, id: string): { from: number; to: number } | null {
  const marker = `"id": "${id}"`;
  const at = text.indexOf(marker);
  if (at < 0) return null;
  const from = text.lastIndexOf('{', at);
  return { from, to: objectEnd(text, from) };
}

const asBlock = (value: unknown, indent: number) => JSON.stringify(value, null, 1).split('\n').join(`\n${' '.repeat(indent)}`);

type WorktopItem = { code: string; name: string; hex: string | null; price: null; provenance: Record<string, unknown> };

let text = readFileSync(CATALOG, 'utf8');
const file = JSON.parse(text) as { collections: { id: string; items: WorktopItem[] }[] };
const worktops = file.collections.find((c) => c.id === 'egger-worktops') ?? fail('в каталоге нет коллекции egger-worktops');

const SOURCES = [
  { doc: 'TD_EGGER_UK_Splashback_Panels_en_UK.pdf', title: 'Technical data sheet EGGER Splashbacks, rev. 02, 15.01.2024', fact: 'модель 90; ДСП Eurospan, ламинат с двух сторон; номинальная толщина 9 мм' },
  { doc: 'PI_EGGER_Splashback_Panels.pdf', title: 'Processing instructions EGGER Splashbacks, rev. 01, 14.12.2023', fact: 'номинальная толщина 9 мм; вплотную к стене и корпусам не ставят — зазор под силикон' },
  { doc: 'splashbacks_upstands_GB.html', title: 'EGGER UK — Kitchen Upstands & Splashbacks', fact: 'все столешницы EGGER — с фартуком в том же декоре; 4100 × 640 × 8 мм' },
];

const items = worktops.items.map((item) => {
  const p = item.provenance;
  const decor = String(p.manufacturerDecorCode ?? '');
  const surface = String(p.surfaceCode ?? '');
  if (!decor) fail(`у ${item.code} нет кода декора EGGER`);
  return {
    code: `EGGER-SB-${decor}-${surface}`,
    name: item.name,
    hex: item.hex,
    price: null,
    provenance: {
      brand: 'EGGER',
      product: 'EGGER Splashback',
      manufacturerDecorCode: decor,
      surfaceCode: surface,
      productClass: 'egger_splashback',
      manufacturerArticle: null,
      articleNote: 'отдельного артикула у фартука в документах нет — позиция по коду декора столешницы EGGER',
      formatMm: { length: 4100, width: 640 },
      thicknessMm: 9,
      thicknessConflict: 'страница EGGER UK: 4100 × 640 × 8 мм; техлист ред. 02 (15.01.2024): номинальная толщина 9 мм — уточнить по артикулу',
      decorMatch: 'EGGER UK: все столешницы EGGER — с фартуком в том же декоре; наличие в Казахстане не подтверждено',
      sources: SOURCES,
      preview: p.preview ?? null,
      previewStatus: p.previewStatus ?? null,
      textureStatus: p.textureStatus ?? null,
      rightsStatus: 'NOT_VERIFIED',
      priceStatus: 'UNPRICED',
      eligibleUse: ['backsplash'],
      colorSource: p.colorSource ?? null,
      fromWorktop: item.code,
      checkedAt: '2026-10-30',
    },
  };
});

const definition = {
  id: 'egger-splashbacks',
  category: 'apron',
  label: 'Фартук · EGGER Splashback',
  roles: ['backsplash'],
  finishes: ['wood_texture', 'matte'],
  priceUnit: 'sheet',
  status: 'review',
  review: true,
  source: {
    type: 'manufacturer_documents',
    pdf: 'TD_EGGER_UK_Splashback_Panels_en_UK.pdf',
    note:
      'Фартук EGGER Splashback: ДСП с ламинатом с двух сторон, формат 4100 × 640, номинальная толщина 9 мм по техлисту (страница UK — 8 мм, расхождение названо). ' +
      'Декор — как у столешницы EGGER того же кода. Цен нет, наличие в Казахстане не подтверждено; образец — REFERENCE_ONLY, права не подтверждены.',
  },
  items,
};

const block = asBlock(definition, 2);
const existing = collectionSpan(text, 'egger-splashbacks');
if (existing) {
  text = text.slice(0, existing.from) + block + text.slice(existing.to);
} else {
  const after = collectionSpan(text, 'egger-worktops') ?? fail('нет места после egger-worktops');
  text = `${text.slice(0, after.to)},\n  ${block}${text.slice(after.to)}`;
}

const parsed = parseMaterialFile(JSON.parse(text));
writeFileSync(CATALOG, text);
const count = parsed.collections.find((c) => c.id === 'egger-splashbacks')?.items.length ?? 0;
console.log(`Фартук · EGGER Splashback: ${count} позиций из ${worktops.items.length} столешниц EGGER.`);
