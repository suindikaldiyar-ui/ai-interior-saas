#!/usr/bin/env node
/**
 * KIRA: ПУБЛИЧНЫЙ КАТАЛОГ МДФ-ФАСАДОВ → ЛОКАЛЬНЫЙ СНИМОК ДЛЯ ИССЛЕДОВАНИЯ.
 *
 * Читает публичные страницы категорий kira-group.kz так, как их читает
 * человек в браузере: одна страница за раз, пауза между страницами, данные
 * товаров — из тех же ответов магазина Tilda, которые страница грузит сама
 * (`getproductslist`). Ни авторизации, ни капчи, ни обхода ограничений:
 * сайт ответил блоком (410) — прогон останавливается и говорит об этом.
 *
 * Куда кладёт — только вне git (`CATALOG_STAGING/`, он в .gitignore):
 *   CATALOG_STAGING/01_MDF_FACADES/KIRA/_crawl/<дата>/<категория>.json
 *       сырые ответы магазина по категории, как пришли;
 *   CATALOG_STAGING/01_MDF_FACADES/KIRA/<NN_КАТЕГОРИЯ>/<АРТИКУЛ>/
 *       images/front_reference.<ext>, source/source.txt, product.json
 *       (`IMAGES=1`): фото — ЛОКАЛЬНЫЙ референс для сравнения формы,
 *       права не подтверждены, в продукт и в git не идёт.
 *
 * Запуск: node scripts/kira-crawl.mjs            — категории (без фото)
 *         IMAGES=1 node scripts/kira-crawl.mjs   — и фото референсов
 *         ONLY=prostfrez,rify node scripts/kira-crawl.mjs
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = 'CATALOG_STAGING/01_MDF_FACADES/KIRA';
const SITE = 'https://kira-group.kz';

/**
 * ШЕСТЬ КАТЕГОРИЙ МДФ-КАТАЛОГА — решение владельца: страница сайта → папка
 * staging. «Сложная фрезеровка» (slozhfrez), «Радиусные фасады» (radius) и
 * «Карнизы и пилястры» (karniz) из объёма исключены: их страницы не
 * читаются и модели из них не заводятся.
 */
export const KIRA_CATEGORIES = [
  { page: 'prostfrez', folder: '01_SIMPLE_MILLING', title: 'Простая фрезеровка' },
  { page: 'viborka', folder: '02_CUTOUT', title: 'Выборка' },
  { page: 'rify', folder: '03_RIBBED', title: 'Рифы' },
  { page: 'moldingi', folder: '04_MOLDINGS', title: 'Молдинги' },
  { page: 'vitrina', folder: '05_GLASS_FACADES', title: 'Витрины' },
  { page: 'integra', folder: '08_INTEGRATED_HANDLES', title: 'Интегрированные ручки' },
];

const PAGE_PAUSE_MS = Number(process.env.PAGE_PAUSE_MS ?? 30000);
const CLICK_PAUSE_MS = 5000;
const IMAGE_PAUSE_MS = 2500;
const today = new Date().toISOString().slice(0, 10);
const crawlDir = join(ROOT, '_crawl', today);

const only = (process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const unknown = only.filter((name) => !KIRA_CATEGORIES.some((c) => c.page === name));
if (unknown.length > 0) {
  console.error(`Неизвестные категории: ${unknown.join(', ')}. Есть: ${KIRA_CATEGORIES.map((c) => c.page).join(', ')}`);
  process.exit(2);
}
const categories = only.length > 0 ? KIRA_CATEGORIES.filter((c) => only.includes(c.page)) : KIRA_CATEGORIES;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Blocked extends Error {}

/** Одна категория: страница, ответы магазина, «загрузить ещё» до конца. */
async function crawlCategory(page, category) {
  const responses = [];
  const onResponse = async (response) => {
    const url = response.url();
    if (!/getproductslist/i.test(url)) return;
    try {
      const body = await response.json();
      responses.push({ url, status: response.status(), body });
    } catch (error) {
      responses.push({ url, status: response.status(), error: String(error) });
    }
  };
  page.on('response', onResponse);
  try {
    const main = await page.goto(`${SITE}/${category.page}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const status = main?.status() ?? 0;
    if (status === 410 || status === 403 || status === 429) {
      throw new Blocked(`${category.page}: сайт ответил ${status} — запросы заблокированы, прогон остановлен.`);
    }
    /* Ждём первый ответ магазина: страница грузит товары сама. */
    const started = Date.now();
    while (responses.length === 0 && Date.now() - started < 45000) await sleep(500);
    if (responses.length === 0) throw new Error(`${category.page}: магазин не ответил за 45 с — товаров на странице нет или блок не загрузился.`);

    /* «Загрузить ещё» — пока кнопка есть и приносит новые ответы. */
    for (let round = 0; round < 40; round += 1) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(1500);
      const more = page.locator('.js-store-load-more-btn, .t-store__load-more-btn, .t-catalog__load-more-btn, [class*="load-more"] button, button:has-text("Загрузить ещё"), button:has-text("Загрузить еще"), a:has-text("Загрузить ещё"), a:has-text("Загрузить еще")').first();
      if (!(await more.count()) || !(await more.isVisible())) break;
      const before = responses.length;
      await more.click();
      const clicked = Date.now();
      while (responses.length === before && Date.now() - clicked < 20000) await sleep(500);
      if (responses.length === before) break;
      await sleep(CLICK_PAUSE_MS);
    }
    return responses;
  } finally {
    page.off('response', onResponse);
  }
}

/** Товары из ответов магазина: один объект на uid. */
function productsOf(responses) {
  const byUid = new Map();
  for (const response of responses) {
    for (const product of response.body?.products ?? []) {
      const uid = String(product.uid ?? product.id ?? '');
      if (uid) byUid.set(uid, product);
    }
  }
  return [...byUid.values()];
}

function galleryOf(product) {
  let gallery = product.gallery;
  if (typeof gallery === 'string') {
    try {
      gallery = JSON.parse(gallery);
    } catch (error) {
      console.log(`  галерея ${product.title ?? product.uid} не читается: ${error.message}`);
      return [];
    }
  }
  return Array.isArray(gallery) ? gallery.map((g) => g && g.img).filter(Boolean) : [];
}

/** Папка модели: название, как напечатано у товара, и uid магазина — у «ОВ 76» их два. */
function folderName(product) {
  const raw = String(product.sku || product.title || product.uid).trim();
  return `${raw.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ')} [${product.uid}]`;
}

async function saveImages(products, category) {
  let saved = 0;
  for (const product of products) {
    const urls = galleryOf(product);
    const dir = join(ROOT, category.folder, folderName(product));
    mkdirSync(join(dir, 'images'), { recursive: true });
    mkdirSync(join(dir, 'source'), { recursive: true });
    const files = urls.map((url, k) => {
      const ext = (extname(new URL(url).pathname) || '.jpg').toLowerCase();
      return k === 0 ? `front_reference${ext}` : `reference_${k + 1}${ext}`;
    });
    writeFileSync(
      join(dir, 'source', 'source.txt'),
      [
        `manufacturer: KIRA`,
        `title: ${product.title ?? ''}`,
        `sku: ${product.sku || '— (на странице нет)'}`,
        `store uid: ${product.uid}`,
        `url: ${product.url ?? ''}`,
        `category page: ${SITE}/${category.page} (${category.title})`,
        ...urls.map((url, k) => `image ${k + 1}: ${url} → images/${files[k]}`),
        `checked_at: ${today}`,
        `rights: NOT_VERIFIED — локальный референс для сравнения формы, не публиковать`,
      ].join('\n') + '\n',
    );
    /* Карточка по шаблону CATALOG_STAGING/product_template.json: только то, что напечатано. */
    writeFileSync(
      join(dir, 'product.json'),
      JSON.stringify(
        {
          brand: 'KIRA',
          manufacturer_article: null,
          official_title: product.title ?? null,
          category: 'mdf_facade',
          subcategory: category.title,
          variant_color_code: null,
          finish: null,
          dimensions_mm: null,
          model3d_file: null,
          reference_photos: files.map((f) => `images/${f}`),
          engineering_status: 'MISSING_DATA',
          visual_status: 'REFERENCE_ONLY',
          source: { url: product.url ?? null, pdf: null, pdf_page: null, checked_at: today },
          characteristics: product.characteristics ?? [],
          notes: 'Артикула (SKU) на странице нет: модель названа производителем как в official_title. Размеры, глубина и профиль фрезы не опубликованы.',
        },
        null,
        2,
      ) + '\n',
    );
    for (const [k, url] of urls.entries()) {
      const file = join(dir, 'images', files[k]);
      if (existsSync(file)) {
        saved += 1;
        continue;
      }
      const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (research; one image at a time)' } });
      if (!response.ok) {
        console.log(`  фото ${folderName(product)} №${k + 1}: ${response.status} — пропущено`);
        continue;
      }
      writeFileSync(file, Buffer.from(await response.arrayBuffer()));
      saved += 1;
      await sleep(IMAGE_PAUSE_MS);
    }
  }
  return saved;
}

async function main() {
  mkdirSync(crawlDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ locale: 'ru-RU', viewport: { width: 1366, height: 900 } });
  const summary = [];
  try {
    for (let k = 0; k < categories.length; k += 1) {
      const category = categories[k];
      const file = join(crawlDir, `${category.page}.json`);
      let responses;
      if (existsSync(file)) {
        responses = JSON.parse(readFileSync(file, 'utf8')).responses;
        console.log(`${category.page}: уже снят сегодня — ${file}`);
      } else {
        if (k > 0) await sleep(PAGE_PAUSE_MS);
        responses = await crawlCategory(page, category);
        writeFileSync(file, JSON.stringify({ category, fetchedAt: new Date().toISOString(), responses }, null, 1));
      }
      const products = productsOf(responses);
      const total = responses.find((r) => typeof r.body?.total === 'number')?.body.total ?? null;
      console.log(`${category.page}: ответов ${responses.length}, товаров ${products.length}${total === null ? '' : ` (магазин говорит ${total})`}`);
      let images = 0;
      if (process.env.IMAGES === '1') images = await saveImages(products, category);
      summary.push({ page: category.page, products: products.length, total, images });
    }
  } catch (error) {
    console.error(error instanceof Blocked ? `БЛОК: ${error.message}` : error);
    process.exitCode = error instanceof Blocked ? 3 : 1;
  } finally {
    await browser.close();
  }
  writeFileSync(join(crawlDir, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary));
}

main();
