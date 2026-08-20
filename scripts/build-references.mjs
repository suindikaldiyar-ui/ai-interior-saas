/**
 * Обходит public/references/{category}/{name}.{jpg,jpeg,png,webp}
 * и генерирует lib/references.generated.ts.
 *
 * Запускается в prebuild и вручную: npm run refs
 * Папка может быть пустой — тогда список пустой и рендер идёт по текстовому
 * описанию материалов из стиля.
 */

import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCES_DIR = join(ROOT, 'public', 'references');
const OUT_FILE = join(ROOT, 'lib', 'references.generated.ts');

const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/** Понятные названия категорий. Незнакомая папка попадёт в список как есть. */
const CATEGORY_LABELS = {
  floor: 'Пол',
  wall: 'Стены',
  furniture: 'Мебель',
  textile: 'Текстиль',
  decor: 'Декор',
};

function listDir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** «oak-herringbone» → «Oak herringbone» */
function humanize(name) {
  const words = name.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const references = [];

for (const category of listDir(REFERENCES_DIR).sort()) {
  const categoryDir = join(REFERENCES_DIR, category);
  if (!isDirectory(categoryDir)) continue;

  for (const file of listDir(categoryDir).sort()) {
    const ext = extname(file).toLowerCase();
    if (!ALLOWED.has(ext)) continue;

    const name = basename(file, ext);
    references.push({
      id: `${category}/${name}`,
      category,
      categoryLabel: CATEGORY_LABELS[category] ?? humanize(category),
      name: humanize(name),
      /** Публичный путь — файл лежит в public и отдаётся статикой. */
      url: `/references/${category}/${file}`,
    });
  }
}

const banner = `// СГЕНЕРИРОВАНО scripts/build-references.mjs — не редактировать вручную.
// Пересобрать: npm run refs
`;

const body = `${banner}
export type GeneratedReference = {
  id: string;
  category: string;
  categoryLabel: string;
  name: string;
  url: string;
};

export const GENERATED_REFERENCES: GeneratedReference[] = ${JSON.stringify(references, null, 2)};
`;

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, body, 'utf8');

console.log(
  `references: ${references.length} файл(ов) в ${new Set(references.map((r) => r.category)).size} категории(ях) → lib/references.generated.ts`,
);
