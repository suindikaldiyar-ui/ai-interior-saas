/**
 * Угол на экране: снимок сцены 1440×900 на угловой кухне.
 *
 * Инструмент глазной проверки, в `verify` не входит. Числа про угол
 * меряет приёмка; здесь видно то, что числами не доказать: выглядит ли
 * угол собранным или двумя приставленными рядами.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 3221;
const BASE = `http://localhost:${PORT}`;
const TAG = process.env.TAG ?? 'before';
const OUT = `.capture-check/corner`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, { encoding: 'utf8' });
    for (const line of out.split(/\r?\n/)) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== '0') execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    }
  } catch { /* никто не слушает */ }
}

freePort(PORT);
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
  env: { ...process.env, SITE_PASSWORD: '' },
});

try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch { /* поднимается */ }
    await sleep(1000);
  }

  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log('  [ошибка страницы]', e.message.slice(0, 160)));

  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(3500);
  await page.getByRole('button', { name: /Раскладка/ }).first().click({ timeout: 90_000 });
  await sleep(900);

  for (const solution of ['Фальш-панель', 'Угловой модуль']) {
    /* Форма: угловая. Ищем по признаку, а не по подписи: подпись меняют. */
    const shaped = await page.evaluate(() => {
      const btn = document.querySelector('[data-shape-kind="corner_l"]');
      if (!btn) return 'кнопки формы нет';
      btn.click();
      return 'нажато';
    });
    console.log(`  форма «угловая»: ${shaped}`);
    await sleep(2000);

    const key = solution === 'Фальш-панель' ? 'false_panel' : 'corner_module';
    const pick = await page.evaluate((k) => {
      const btn = document.querySelector(`[data-corner-solution="${k}"]`);
      if (!btn) return 'нет кнопки решения';
      btn.click();
      return 'нажато';
    }, key);
    console.log(`  решение «${solution}»: ${pick}`);
    await sleep(2000);

    await page.getByRole('button', { name: '3D', exact: true }).click({ force: true, timeout: 60_000 });
    await page.waitForSelector('canvas', { timeout: 60_000 });
    await sleep(3500);

    /* Общий вид: угол виден целиком. */
    const iso = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /Общий вид|Свободный/.test((b.textContent ?? '').trim()),
      );
      if (btn) btn.click();
      return Boolean(btn);
    });
    console.log(`  ракурс «общий вид»: ${iso ? 'включён' : 'кнопки нет'}`);
    await sleep(2500);

    const slug = solution === 'Фальш-панель' ? 'panel' : 'module';
    const canvas = await page.$('canvas');
    if (canvas) await canvas.screenshot({ path: `${OUT}/${TAG}-${slug}-scene.png` });
    await page.screenshot({ path: `${OUT}/${TAG}-${slug}-full.png` });

    const state = await page.evaluate(() =>
      typeof window.__mwCadState === 'function' ? window.__mwCadState() : null,
    );
    console.log(`  ${slug}: ${JSON.stringify(state)?.slice(0, 220)}`);
  }

  await browser.close();
  console.log(`  снимки: ${OUT} (${TAG})`);
} finally {
  server.kill();
  freePort(PORT);
}
