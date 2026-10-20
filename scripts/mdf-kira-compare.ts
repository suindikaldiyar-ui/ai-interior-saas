/**
 * МОДЕЛИ KIRA: ПРИБЛИЖЕНИЕ РЯДОМ С ФОТО ПРОИЗВОДИТЕЛЯ — ТОЛЬКО ЛОКАЛЬНО (P3D-MDF).
 *
 * Слева — фото модели из CATALOG_STAGING (REFERENCE_ONLY, права не
 * подтверждены), справа — наш рисунок-приближение (`reliefShade`, тот же
 * расчёт глубины, что строит сетку в сцене). Лист кладётся в
 * `.capture-check/mdf-look/kira-compare.png` — папка вне git: фото
 * производителя не публикуется и в продукт не попадает.
 *
 * Запуск: npx tsx scripts/mdf-kira-compare.ts
 */
import { existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { KIRA_MODELS } from '../lib/millwork/kira';
import { reliefShade } from '../lib/millwork/facadeRelief';

const OUT = '.capture-check/mdf-look';
const CELL_H = 420;
const GAP = 16;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const tiles: { input: Buffer; left: number; top: number }[] = [];
  let x = GAP;
  let y = GAP;
  let rowH = 0;
  const pageW = 2 * 6 * 150;
  let missing = 0;
  for (const model of KIRA_MODELS) {
    const path = `CATALOG_STAGING/99_IMPORT_QUEUE/KIRA/KIRA_${model.article}.png`;
    if (!existsSync(path)) {
      missing += 1;
      console.log(`  ${model.article}: фото нет (${path}) — сравнение без него`);
      continue;
    }
    const meta = await sharp(path).metadata();
    const aspect = (meta.width ?? 2) / (meta.height ?? 3);
    const w = Math.round(CELL_H * aspect);
    const photo = await sharp(path).resize({ height: CELL_H }).png().toBuffer();
    /* Фасад той же пропорции, что на фото: 400 мм шириной. */
    const leaf = { widthMm: 400, heightMm: Math.round(400 / aspect), thicknessMm: 16 };
    const px = reliefShade(model.relief, leaf, w, CELL_H, '#c9cbcf');
    const ours = await sharp(Buffer.from(px), { raw: { width: w, height: CELL_H, channels: 4 } }).png().toBuffer();
    if (x + 2 * w + GAP > pageW) {
      x = GAP;
      y += rowH + GAP + 24;
      rowH = 0;
    }
    tiles.push({ input: photo, left: x, top: y });
    tiles.push({ input: ours, left: x + w + 4, top: y });
    const label = Buffer.from(
      `<svg width="${2 * w + 4}" height="22"><text x="2" y="16" font-size="15" font-family="Arial" fill="#222">${model.article}: фото REFERENCE_ONLY | приближение ${model.relief.kind}</text></svg>`,
    );
    tiles.push({ input: await sharp(label).png().toBuffer(), left: x, top: y + CELL_H + 2 });
    x += 2 * w + 4 + GAP;
    rowH = Math.max(rowH, CELL_H);
  }
  const height = y + rowH + GAP + 30;
  await sharp({ create: { width: pageW, height, channels: 4, background: '#f4f4f2' } })
    .composite(tiles)
    .png()
    .toFile(`${OUT}/kira-compare.png`);
  console.log(`Лист сравнения: ${OUT}/kira-compare.png · моделей ${KIRA_MODELS.length - missing} из ${KIRA_MODELS.length} · ЛОКАЛЬНО, не публикуется`);
}

void main();
