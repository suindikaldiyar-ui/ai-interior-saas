/**
 * Сколько миллисекунд заблокирован главный поток, пока рисуются три
 * комплектации, и сколько занимает каждая.
 *
 * Ответ модели подменяется заглушкой того же веса, что настоящая картинка:
 * мерить надо СВОЙ конвейер — захват кадра, разбор ответа, показ картинок, —
 * а не время работы Gemini. Инструмент замера, в приёмку не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { chromium } from 'playwright';
import sharp from 'sharp';

const PORT = 3206;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, {
      encoding: 'utf8',
    });
    for (const line of out.split(/\r?\n/)) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== '0') execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    }
  } catch {
    /* никто не слушает */
  }
}

/** Картинка того же порядка, что возвращает image-модель: 1536×1024 JPEG. */
const stub = await sharp({
  create: { width: 1536, height: 1024, channels: 3, background: '#b09a76' },
})
  .jpeg({ quality: 90 })
  .toBuffer();
const STUB = `data:image/jpeg;base64,${stub.toString('base64')}`;

const photo = await sharp({
  create: { width: 1200, height: 800, channels: 3, background: '#8d8377' },
})
  .jpeg()
  .toBuffer();

freePort(PORT);
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
});

try {
  for (let i = 0; i < 90; i++) {
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
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });

  // Из чего складывается блокировка: кодирование кадра в JPEG считаем отдельно.
  await page.addInitScript(() => {
    window.__encode = [];
    const orig = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const t = performance.now();
      const out = orig.apply(this, args);
      window.__encode.push({
        ms: Math.round(performance.now() - t),
        size: `${this.width}×${this.height}`,
      });
      return out;
    };
  });

  const calls = [];
  await page.route('**/api/ai/render', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    calls.push({ styleId: body.styleId, at: Date.now() });
    // Модель отвечает секунды — держим ту же форму ожидания.
    await sleep(1500);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ styleId: body.styleId, image: STUB, durationMs: 1500 }),
    });
  });

  // Прогреваем маршрут: первый ответ сервера после старта приходит долго,
  // и навигация упирается в свой таймаут раньше, чем страница появится.
  await fetch(`${BASE}/demo`).catch(() => undefined);
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(2500);

  await page.getByRole('button', { name: /Материалы/ }).first().click();
  await sleep(1500);
  await page
    .locator('input[type=file][accept="image/*"]')
    .first()
    .setInputFiles(
      { name: 'room.jpg', mimeType: 'image/jpeg', buffer: photo },
      { timeout: 60_000 },
    );
  await sleep(1200);

  await page.getByRole('button', { name: /Результат/ }).first().click();
  await sleep(700);
  await sleep(300);

  // Длинные задачи главного потока — то, из-за чего интерфейс «залипает».
  await page.evaluate(() => {
    window.__long = [];
    window.__obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        window.__long.push({
          start: Math.round(e.startTime),
          ms: Math.round(e.duration),
        });
    });
    window.__obs.observe({ entryTypes: ['longtask'] });
  });

  const startedAt = Date.now();
  await page.getByRole('button', { name: /Отрисовать/ }).first().click({ noWaitAfter: true });

  // Ждём картинку комплектации.
  for (let i = 0; i < 120; i++) {
    const done = await page.locator('figure img').count();
    if (done >= 1) break;
    await sleep(500);
  }
  const totalMs = Date.now() - startedAt;

  const long = await page.evaluate(() => {
    window.__obs.disconnect();
    return window.__long;
  });
  const encode = await page.evaluate(() => window.__encode);
  const firstCallMs = calls.length ? calls[0].at - startedAt : 0;
  const lastCallMs = calls.length ? calls[calls.length - 1].at - startedAt : 0;

  // Отзывчивость во время работы: успевает ли страница рисовать кадры.
  const fps = await page.evaluate(async () => {
    let frames = 0;
    const tick = () => {
      frames += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await new Promise((r) => setTimeout(r, 2000));
    return Math.round(frames / 2);
  });

  const shown = await page.locator('figure img').count();
  console.log(`  запросов к роуту: ${calls.length} (по одному на комплектацию)`);
  console.log(`  картинок показано: ${shown}`);
  console.log(`  весь прогон: ${(totalMs / 1000).toFixed(1)} с (из них 1.5 с — заглушка модели)`);
  console.log(`  первый запрос ушёл через: ${firstCallMs} мс после нажатия`);
  console.log(`  последний запрос ушёл через: ${lastCallMs} мс после нажатия`);
  console.log(
    `  длинные задачи главного потока: ${
      long.length === 0 ? 'нет' : long.map((l) => `${l.ms} мс`).join(', ')
    }`,
  );
  console.log(`  самая длинная: ${long.length ? Math.max(...long.map((l) => l.ms)) : 0} мс`);
  console.log(
    `  кодирование кадров в JPEG: ${
      encode.length === 0 ? 'нет' : encode.map((e) => `${e.size} — ${e.ms} мс`).join(', ')
    }`,
  );
  console.log(`  кадров в секунду после отрисовки: ${fps}`);

  await browser.close();
} finally {
  server.kill();
  freePort(PORT);
}
process.exit(0);
