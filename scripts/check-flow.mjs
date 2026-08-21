/**
 * Прогон нового потока в браузере: планшет, телефон и ширина 390 px.
 * Инструмент для глазной проверки, в приёмку не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 3195;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/flow';

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

  /* ── Планшет: демонстрация ── */
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 160)));

  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await sleep(800);
  await page.screenshot({ path: `${OUT}-compose.png` });

  const stepButtons = await page
    .locator('nav[aria-label="Шаги работы"] button')
    .allInnerTexts();
  console.log('  шаги:', stepButtons.map((t) => t.replace(/\s+/g, ' ').trim()).join(' · '));

  // Смета — строкой, открывается тапом.
  const totalRow = page.getByRole('button', { name: /подробнее/ });
  console.log('  строка итога:', (await totalRow.count()) === 1 ? 'есть' : 'НЕТ');
  await totalRow.click();
  await sleep(400);
  const openRows = await page.locator('input[type="checkbox"]').count();
  console.log('  смета открыта, строк:', openRows);
  await page.screenshot({ path: `${OUT}-estimate.png` });
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await sleep(300);
  console.log('  после закрытия строк:', await page.locator('input[type="checkbox"]').count());

  // Шаблоны.
  await page.getByRole('button', { name: /Шаблон/ }).click();
  await sleep(500);
  await page.screenshot({ path: `${OUT}-templates.png` });
  const cards = await page.locator('button[aria-pressed]').count();
  console.log('  карточек на шаге шаблона:', cards);

  // Результат.
  await page.getByRole('button', { name: /Результат/ }).click();
  await sleep(900);
  await page.screenshot({ path: `${OUT}-result.png` });
  console.log(
    '  на результате видов:',
    await page.getByRole('button', { name: /^(Чертёж|План|3D|Рендер)$/ }).count(),
  );

  const warnings = await page.evaluate(() =>
    Array.from(document.querySelectorAll('main ul li > button')).length,
  );
  console.log('  предупреждений на экране:', warnings);
  await page.close();

  /* ── Телефон 390 px ── */
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await sleep(800);
  await phone.screenshot({ path: `${OUT}-390.png`, fullPage: false });

  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  console.log('  390 px, горизонтальный вылет:', overflow, 'px');

  const small = await phone.evaluate(() =>
    Array.from(document.querySelectorAll('button, a[href]'))
      .filter((el) => el.getBoundingClientRect().height > 0)
      .filter((el) => el.getBoundingClientRect().height < 44)
      .map((el) => (el.textContent ?? '').trim().slice(0, 24))
      .filter((t) => t.length > 0)
      .slice(0, 6),
  );
  console.log('  цели меньше 44 px:', small.length ? small.join(' | ') : 'нет');
  await phone.close();

  await browser.close();
} finally {
  server.kill();
  freePort(PORT);
}
process.exit(0);
