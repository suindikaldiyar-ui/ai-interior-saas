/**
 * Проверка связки «конфигуратор → захват → рендер» без обращения к модели:
 * роут перехватывается, ответ подделывается. Тратить настоящие запросы,
 * чтобы убедиться, что кадр вообще снялся, незачем.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 3161;
const BASE = `http://localhost:${PORT}`;

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

freePort(PORT);
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
});

try {
  for (let i = 0; i < 45; i++) {
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

  const calls = [];
  await page.route('**/api/ai/render', async (route) => {
    const body = route.request().postDataJSON();

    // Кадр кладём на диск: раскладку кадра проверяют глазами, а не числами.
    if (calls.length === 0) {
      mkdirSync('.capture-check', { recursive: true });
      for (const [name, url] of [['beauty', body.beauty], ['clay', body.clay]]) {
        const m = /^data:[^;,]+;base64,([\s\S]+)$/.exec(String(url).trim());
        if (m) writeFileSync(`.capture-check/millwork-${name}.jpg`, Buffer.from(m[1], 'base64'));
      }
    }
    calls.push({
      styleId: body.styleId,
      beauty: (body.beauty ?? '').slice(0, 30),
      beautyKb: Math.round((body.beauty ?? '').length / 1024),
      clayKb: Math.round((body.clay ?? '').length / 1024),
      items: body.items?.length ?? 0,
      modules: body.items?.[0]?.meta?.runModules?.length ?? 0,
      notes: body.customNotes,
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ image: 'data:image/jpeg;base64,/9j/4AAQ', durationMs: 10 }),
    });
  });

  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await sleep(700);

  // Результат: сравнение вверху, 3D — один из трёх видов ниже.
  await page.getByRole('button', { name: /Результат/ }).click();
  await sleep(600);

  await page.getByRole('button', { name: '3D', exact: true }).click();
  await sleep(3500);
  await page.screenshot({ path: '.capture-check/millwork-3d.png' });

  await page.getByRole('button', { name: /Отрисовать кухню/ }).click();

  // Комплектация одна — и запрос к роуту ровно один.
  for (let i = 0; i < 40 && calls.length < 1; i++) await sleep(1000);

  console.log(`\nзапросов: ${calls.length}`);
  for (const c of calls) {
    console.log(
      `  ${c.styleId.padEnd(15)} beauty ${String(c.beautyKb).padStart(4)} КБ · clay ${String(c.clayKb).padStart(4)} КБ · ` +
        `объектов ${c.items}, модулей ${c.modules}\n      ${c.beauty}…\n      ${c.notes}`,
    );
  }

  await sleep(1500);
  const done = await page.locator('figure img').count();
  console.log(`\nкарточек с картинкой: ${done}`);

  await browser.close();
} finally {
  server.kill();
  freePort(PORT);
}
process.exit(0);
