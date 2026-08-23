/**
 * Живой прогон рендера конфигуратора: три комплектации кухни 3200 мм.
 *
 * ТРАТИТ настоящие запросы к image-модели. Складывает в .capture-check/live/
 * кадр захвата, clay, чертёж и три картинки — чтобы глазами сверить раскладку.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 3171;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/live';

function freePort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, {
      encoding: 'utf8',
    });
    for (const line of out.split(/\r?\n/)) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== '0') {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      }
    }
  } catch {
    /* никто не слушает */
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function saveDataUrl(name, dataUrl) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(String(dataUrl).trim());
  if (!match) return 0;
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  const ext = match[1].includes('png') ? 'png' : 'jpg';
  writeFileSync(`${OUT}/${name}.${ext}`, buffer);
  return Math.round(buffer.length / 1024);
}

freePort(PORT);
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
});

try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      /* поднимается */
    }
    await sleep(1000);
  }

  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));

  const results = [];
  let capturesSaved = false;

  page.on('response', async (res) => {
    if (!res.url().includes('/api/ai/render')) return;
    const request = res.request();
    const body = request.postDataJSON();

    if (!capturesSaved) {
      capturesSaved = true;
      console.log(`  кадр beauty ${saveDataUrl('00-beauty', body.beauty)} КБ`);
      console.log(`  кадр clay   ${saveDataUrl('00-clay', body.clay)} КБ`);
      console.log(
        `  ROOM_PHOTO в запросе: ${body.roomPhoto ? `${Math.round(body.roomPhoto.length / 1024)} КБ` : 'НЕТ'}`,
      );
      const modules = body.items?.[0]?.meta?.runModules ?? [];
      console.log(
        `  модулей в кадре: ${modules.length} — ` +
          modules.map((m) => `${m.widthMm}${m.appliance ? `:${m.appliance}` : ''}`).join(' '),
      );
    }

    let data = {};
    try {
      data = await res.json();
    } catch {
      /* тело уже прочитано */
    }

    const kb = data.image ? saveDataUrl(`${results.length + 1}-${body.styleId}`, data.image) : 0;
    results.push({ styleId: body.styleId, kb, error: data.error, ms: data.durationMs });
    console.log(
      `  ${body.styleId.padEnd(15)} ${kb ? `${kb} КБ` : `ОШИБКА: ${data.error}`} · ${Math.round((data.durationMs ?? 0) / 1000)} с`,
    );
  });

  await fetch(`${BASE}/demo`).catch(() => undefined);
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(2500);

  /*
   * Фотография помещения — основа кадра. Прикладываем её тем же путём,
   * что и замерщик: на шаге «Материалы».
   */
  const PHOTO = process.env.ROOM_PHOTO;
  if (PHOTO) {
    await page.getByRole('button', { name: /Материалы/ }).first().click();
    await sleep(1500);
    await page
      .locator('input[type=file][accept="image/*"]')
      .first()
      .setInputFiles(PHOTO, { timeout: 60_000 });
    await page.waitForFunction(
      () => Boolean(document.querySelector('img[alt="Помещение клиента"]')),
      { timeout: 30000 },
    );
    const angle = process.env.ROOM_ANGLE;
    if (angle) await page.getByRole('button', { name: angle, exact: true }).click();
    console.log(`  фото приложено: ${PHOTO}${angle ? ` · ракурс «${angle}»` : ''}`);
    await sleep(500);
  }

  await page.getByRole('button', { name: /Результат/ }).first().click();
  await sleep(1000);

  // Чертёж — эталон для сверки раскладки.
  await page.getByRole('button', { name: 'Чертёж', exact: true }).click();
  await sleep(700);
  const sheet = page.locator('svg').first();
  await sheet.screenshot({ path: `${OUT}/00-elevation.png` });

  await page.getByRole('button', { name: 'Рендер', exact: true }).click();
  await sleep(2000);

  await page.getByRole('button', { name: /Отрисовать три комплектации/ }).click();

  for (let i = 0; i < 180 && results.length < 3; i++) await sleep(1000);

  await sleep(1000);
  await page.screenshot({ path: `${OUT}/00-panel.png`, fullPage: true });

  console.log(`\nготово: ${results.filter((r) => r.kb).length} из 3`);
  await browser.close();
} finally {
  server.kill();
  freePort(PORT);
}
process.exit(0);
