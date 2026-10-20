#!/usr/bin/env node
/**
 * KIRA: СНИМОК ОБХОДА → `data/catalog/kira.json` (ТОЛЬКО ФАКТЫ).
 *
 * Берёт сырые ответы магазина, которые снял `scripts/kira-crawl.mjs`
 * (CATALOG_STAGING/01_MDF_FACADES/KIRA/_crawl/<дата>/), и пишет в репозиторий
 * то, что напечатано на сайте производителя: название модели, uid товара,
 * адрес страницы, категории, характеристики, число фото. Ни фото, ни
 * описаний от себя: фото остаются в CATALOG_STAGING (вне git), а рисунок
 * модели (VISUAL_ONLY) живёт отдельно — `lib/millwork/kiraDesigns.ts`.
 *
 * Код модели — адрес товара у производителя без uid («sl-3» → «SL-3»): SKU
 * на страницах нет. Два товара с одним адресом (у KIRA два разных «ОВ 76»)
 * различаются uid магазина — код получает его в хвосте, оба, без
 * выбора «главного».
 *
 * Запуск: node scripts/kira-facts.mjs [дата снимка, по умолчанию последняя]
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CRAWL = 'CATALOG_STAGING/01_MDF_FACADES/KIRA/_crawl';
const OUT = 'data/catalog/kira.json';

/** Категории в объёме — решение владельца; три исключены и не читаются. */
const SCOPE = [
  { key: 'prostfrez', uid: '754136430742', title: 'Простая фрезеровка' },
  { key: 'viborka', uid: '726283299594', title: 'Выборка' },
  { key: 'rify', uid: '462246863824', title: 'Рифы' },
  { key: 'moldingi', uid: '668131222814', title: 'Молдинги' },
  { key: 'vitrina', uid: '575130862944', title: 'Витрины' },
  { key: 'integra', uid: '929515092312', title: 'Интегрированные ручки' },
];
const EXCLUDED = [
  { key: 'slozhfrez', title: 'Сложная фрезеровка' },
  { key: 'radius', title: 'Радиусные фасады' },
  { key: 'karniz', title: 'Карнизы и пилястры' },
];

if (!existsSync(CRAWL)) {
  console.error(`Снимка обхода нет: ${CRAWL}. Сначала node scripts/kira-crawl.mjs`);
  process.exit(2);
}
const dates = readdirSync(CRAWL).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
const date = process.argv[2] ?? dates[dates.length - 1];
if (!date || !existsSync(join(CRAWL, date))) {
  console.error(`Снимка за ${date ?? '—'} нет. Есть: ${dates.join(', ') || 'ни одного'}`);
  process.exit(2);
}

const byUid = new Map();
const categories = [];
for (const category of SCOPE) {
  const file = join(CRAWL, date, `${category.key}.json`);
  if (!existsSync(file)) {
    console.error(`Категория «${category.title}» не снята: нет ${file}`);
    process.exit(3);
  }
  const snapshot = JSON.parse(readFileSync(file, 'utf8'));
  const products = snapshot.responses.flatMap((r) => r.body?.products ?? []);
  const total = snapshot.responses.find((r) => typeof r.body?.total === 'number')?.body.total ?? null;
  if (total !== null && total !== products.length) {
    console.error(`«${category.title}»: магазин говорит ${total}, снято ${products.length} — снимок неполный.`);
    process.exit(4);
  }
  categories.push({
    key: category.key,
    uid: category.uid,
    title: category.title,
    url: `https://kira-group.kz/${category.key}`,
    listed: products.length,
  });
  for (const product of products) {
    const uid = String(product.uid);
    const known = byUid.get(uid);
    if (known) {
      known.categories.push(category.key);
      continue;
    }
    const gallery = typeof product.gallery === 'string' ? JSON.parse(product.gallery) : product.gallery ?? [];
    const slug = String(product.url ?? '').split('/').pop() ?? '';
    byUid.set(uid, {
      uid,
      title: String(product.title ?? '').trim(),
      slug: slug.replace(/^\d+-/, ''),
      url: String(product.url ?? ''),
      categories: [category.key],
      sku: product.sku ? String(product.sku) : null,
      description: product.descr ? String(product.descr).trim() : null,
      characteristics: Array.isArray(product.characteristics)
        ? product.characteristics.map((c) => ({ title: String(c.title ?? ''), value: String(c.value ?? '') }))
        : [],
      images: Array.isArray(gallery) ? gallery.filter((g) => g && g.img).length : 0,
    });
  }
}

/* Код — адрес без uid; совпал у двух товаров — у обоих хвост uid. */
const models = [...byUid.values()];
const slugCount = new Map();
for (const m of models) slugCount.set(m.slug, (slugCount.get(m.slug) ?? 0) + 1);
for (const m of models) {
  const base = m.slug.toUpperCase();
  m.code = slugCount.get(m.slug) > 1 ? `${base}-${m.uid}` : base;
  if (slugCount.get(m.slug) > 1) m.duplicateTitle = true;
  delete m.slug;
}
models.sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));

const codes = new Set(models.map((m) => m.code));
if (codes.size !== models.length) {
  console.error('Коды моделей повторяются — снимок не разобран.');
  process.exit(5);
}

const out = {
  manufacturer: 'KIRA',
  site: 'https://kira-group.kz',
  checkedAt: date,
  method:
    'Публичные страницы категорий в браузере, по одной, с паузой; данные товаров — ответы магазина Tilda, которые страница грузит сама. Фото — локально в CATALOG_STAGING (права не подтверждены).',
  categories,
  excluded: EXCLUDED,
  models: models.map(({ code, title, uid, url, categories: cats, sku, description, characteristics, images, duplicateTitle }) => ({
    code,
    title,
    uid,
    url,
    categories: cats,
    sku,
    description,
    characteristics,
    images,
    ...(duplicateTitle ? { duplicateTitle: true } : {}),
  })),
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`${OUT}: моделей ${models.length}; по категориям ${categories.map((c) => `${c.key} ${c.listed}`).join(', ')}`);
