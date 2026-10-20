/**
 * МОДЕЛИ KIRA: ПРИБЛИЖЕНИЕ РЯДОМ С ФОТО ПРОИЗВОДИТЕЛЯ — ТОЛЬКО ЛОКАЛЬНО.
 *
 * Слева — фото модели из CATALOG_STAGING (REFERENCE_ONLY, права не
 * подтверждены), справа — наш рисунок (`reliefShade`, тот же расчёт глубины,
 * что строит сетку в сцене); у модели без 3D — серое поле с причиной. Лист на
 * категорию сайта кладётся в `.capture-check/kira-compare/` — папка вне git:
 * фото производителя не публикуется и в продукт не попадает.
 *
 * Фото ищется по uid товара в папках обхода (`scripts/kira-crawl.mjs`,
 * `IMAGES=1`): `CATALOG_STAGING/01_MDF_FACADES/KIRA/<категория>/<название> [<uid>]/images/front_reference.*`;
 * у СЛ 9 (вне шести категорий) — прежнее место P3D-MDF.
 *
 * Запуск: npx tsx scripts/mdf-kira-compare.ts [ключ категории…]
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { KIRA_CATALOG, KIRA_CATEGORIES, type KiraEntry } from '../lib/millwork/kiraCatalog';
import { reliefShade } from '../lib/millwork/facadeRelief';

const OUT = '.capture-check/kira-compare';
const ROOT = 'CATALOG_STAGING/01_MDF_FACADES/KIRA';
const CELL_H = 360;
const GAP = 16;
const PAGE_W = 2400;

/** Фото модели по uid товара; нет — `null` (сравнение без него, и это сказано). */
function photoOf(entry: KiraEntry): string | null {
  if (!entry.uid) {
    const legacy = `CATALOG_STAGING/99_IMPORT_QUEUE/KIRA/KIRA_${entry.code}.png`;
    return existsSync(legacy) ? legacy : null;
  }
  if (!existsSync(ROOT)) return null;
  for (const folder of readdirSync(ROOT).filter((name) => /^\d\d_/.test(name))) {
    const model = readdirSync(join(ROOT, folder)).find((name) => name.endsWith(`[${entry.uid}]`));
    if (!model) continue;
    const images = join(ROOT, folder, model, 'images');
    const file = existsSync(images) ? readdirSync(images).find((name) => name.startsWith('front')) : undefined;
    if (file) return join(images, file);
  }
  return null;
}

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function sheet(key: string, title: string, entries: KiraEntry[]): Promise<{ shown: number; missing: string[] }> {
  const tiles: { input: Buffer; left: number; top: number }[] = [];
  const missing: string[] = [];
  let x = GAP;
  let y = GAP;
  let rowH = 0;
  for (const entry of entries) {
    const path = photoOf(entry);
    if (!path) missing.push(entry.code);
    const meta = path ? await sharp(path).metadata() : { width: 2, height: 3 };
    const aspect = (meta.width ?? 2) / (meta.height ?? 3);
    const w = Math.round(CELL_H * aspect);
    const photo = path
      ? await sharp(path).resize({ height: CELL_H, width: w, fit: 'fill' }).png().toBuffer()
      : await sharp({ create: { width: w, height: CELL_H, channels: 4, background: '#e2e2e0' } }).png().toBuffer();
    /* Фасад той же пропорции, что на фото: 400 мм шириной. */
    const leaf = { widthMm: 400, heightMm: Math.round(400 / aspect), thicknessMm: 18 };
    const ours = entry.relief
      ? await sharp(Buffer.from(reliefShade(entry.relief, leaf, w, CELL_H, '#cfcac0')), { raw: { width: w, height: CELL_H, channels: 4 } })
          .png()
          .toBuffer()
      : await sharp({ create: { width: w, height: CELL_H, channels: 4, background: '#eeeeee' } }).png().toBuffer();
    if (x + 2 * w + GAP > PAGE_W) {
      x = GAP;
      y += rowH + GAP + 24;
      rowH = 0;
    }
    tiles.push({ input: photo, left: x, top: y });
    tiles.push({ input: ours, left: x + w + 4, top: y });
    const note = entry.relief ? '' : ' · 3D нет';
    const label = Buffer.from(
      `<svg width="${2 * w + 4}" height="22" xmlns="http://www.w3.org/2000/svg"><text x="2" y="16" font-size="14" font-family="Arial" fill="#222">${esc(`${entry.code} — ${entry.name}${note}${path ? '' : ' · фото нет'}`)}</text></svg>`,
    );
    tiles.push({ input: await sharp(label).png().toBuffer(), left: x, top: y + CELL_H + 2 });
    x += 2 * w + 4 + GAP;
    rowH = Math.max(rowH, CELL_H);
  }
  const head = Buffer.from(
    `<svg width="${PAGE_W}" height="22" xmlns="http://www.w3.org/2000/svg"><text x="${GAP}" y="16" font-size="15" font-family="Arial" fill="#000">${esc(`${title}: фото производителя (REFERENCE_ONLY, только локально) | наш рисунок VISUAL_ONLY`)}</text></svg>`,
  );
  const height = y + rowH + GAP + 30;
  await sharp({ create: { width: PAGE_W, height: height + 26, channels: 4, background: '#f4f4f2' } })
    .composite([{ input: await sharp(head).png().toBuffer(), left: 0, top: 0 }, ...tiles.map((t) => ({ ...t, top: t.top + 26 }))])
    .png()
    .toFile(`${OUT}/${key}.png`);
  return { shown: entries.length, missing };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const asked = process.argv.slice(2);
  const groups = [
    ...KIRA_CATEGORIES.map((c) => ({ key: c.key as string, title: c.title, entries: KIRA_CATALOG.filter((e) => (e.categories as string[]).includes(c.key)) })),
    { key: 'other', title: 'Вне шести категорий', entries: KIRA_CATALOG.filter((e) => e.categories.length === 0) },
  ].filter((group) => asked.length === 0 || asked.includes(group.key));
  for (const group of groups) {
    const { shown, missing } = await sheet(group.key, group.title, group.entries);
    console.log(`${OUT}/${group.key}.png · ${group.title}: ${shown}${missing.length ? ` · без фото: ${missing.join(', ')}` : ''}`);
  }
  console.log('ЛОКАЛЬНО: фото производителя не публикуется и в продукт не попадает.');
}

void main();
