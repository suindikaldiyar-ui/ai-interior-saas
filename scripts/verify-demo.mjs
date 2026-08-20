/**
 * Приёмка демонстрации: пять шагов из сценария продажи.
 *
 * Запуск: npm run test:demo   (нужен build)
 *
 * Демонстрация — это и есть продукт в сжатом виде, поэтому она проверяется
 * целиком, а не «страница открылась».
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3137;
const BASE = `http://localhost:${PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await sleep(250);
  }
  return false;
}

let failed = 0;
let passed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}${detail ? `  ${detail}` : ''}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? `  ${detail}` : ''}`);
  }
}

const server = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['next', 'start', '-p', String(PORT)],
  { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' },
);

let browser;

try {
  const up = await until(async () => {
    try {
      return (await fetch(BASE)).ok;
    } catch {
      return false;
    }
  }, 90_000);
  if (!up) {
    console.error('Сервер не поднялся. Соберите проект: npm run build');
    process.exit(1);
  }

  browser = await chromium.launch();
  // Планшет альбомный — основной сценарий.
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  page.on('pageerror', (e) => {
    failed++;
    console.error('  [pageerror]', e.message.slice(0, 200));
  });

  /* ── 1. Открыть /demo — готовый проект с тремя ценами ── */

  const response = await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  check('/demo открывается без входа', response?.status() === 200, `статус ${response?.status()}`);

  const money = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .map((b) => b.textContent ?? '')
        .filter((t) => t.includes('₸'))
        .map((t) => Number((t.match(/[\d\s ]+(?=\s*₸)/)?.[0] ?? '0').replace(/\D/g, '')))
        .filter((n) => n > 0),
    );

  const prices = await money();
  check('во вкладках вариантов стоят три цены', prices.length === 3, prices.join(' / '));
  check(
    'цены растут от базового к премиуму',
    prices[0] < prices[1] && prices[1] < prices[2],
  );

  const totalText = () =>
    page.evaluate(() => {
      const aside = document.querySelector('aside');
      return aside ? (aside.innerText.match(/([\d\s ]+)\s*₸\s*$/m)?.[1] ?? '') : '';
    });

  check('чертёж отрисован', (await page.locator('svg').count()) > 0);
  check('лента модулей на месте', (await page.getByText('Состав ряда').count()) === 1);

  /* ── 2. Переключить вариант — чертёж и смета изменились ── */

  const beforeSwitch = await totalText();
  await page.getByRole('button', { name: /ПРЕМИУМ|Премиум/ }).first().click();
  await sleep(500);
  const afterSwitch = await totalText();
  check(
    'переключение варианта меняет смету',
    beforeSwitch !== afterSwitch,
    `${beforeSwitch.trim()} → ${afterSwitch.trim()}`,
  );

  /* ── 3. Снять галочку — итог пересчитался ── */

  const boxes = page.locator('aside input[type="checkbox"]');
  const boxCount = await boxes.count();
  check('в смете есть отключаемые строки', boxCount > 3, `строк: ${boxCount}`);

  const beforeToggle = await totalText();
  await boxes.nth(2).uncheck();
  await sleep(400);
  const afterToggle = await totalText();
  check(
    'снятая галочка уменьшает итог при клиенте',
    beforeToggle !== afterToggle,
    `${beforeToggle.trim()} → ${afterToggle.trim()}`,
  );

  /* ── 4. Убрать модуль руками — цепочка перестроилась ── */

  const chainSum = () =>
    page.evaluate(() => {
      const texts = Array.from(document.querySelectorAll('svg text'))
        .map((t) => Number(t.textContent))
        .filter((n) => Number.isFinite(n) && n > 100 && n < 2000);
      return texts.reduce((s, n) => s + n, 0);
    });

  /*
   * Число модулей и сумма после удаления НЕ меняются: место перезаполняется,
   * и ряд по-прежнему сходится с длиной стены. Меняется состав — именно его
   * и проверяем, иначе тест ловил бы не то.
   */
  const ribbon = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('button[draggable="true"]')).map(
        (b) => (b.textContent ?? '').trim(),
      ),
    );

  const before = await ribbon();
  check('модули ленты кликабельны', before.length > 3, `модулей: ${before.length}`);

  await page.locator('button[draggable="true"]').first().click();
  await sleep(300);
  const removeButton = page.getByRole('button', { name: 'Удалить', exact: true });
  check('панель модуля открывается по клику', (await removeButton.count()) > 0);

  const sumBefore = await chainSum();
  await removeButton.first().click();
  await sleep(600);
  const after = await ribbon();
  const sumAfter = await chainSum();

  check(
    'удаление модуля меняет состав ряда',
    JSON.stringify(before) !== JSON.stringify(after),
    `${before[0]?.replace(/\s+/g, ' ')} → ${after[0]?.replace(/\s+/g, ' ')}`,
  );
  check(
    'место перезаполнено: цепочка по-прежнему сходится',
    sumAfter === sumBefore,
    `сумма ${sumBefore} → ${sumAfter}`,
  );

  /* ── 5. Размерная цепочка сходится с длиной ряда ── */

  const totalDim = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll('svg text'))
      .map((t) => Number(t.textContent))
      .filter((n) => Number.isFinite(n));
    return Math.max(...texts);
  });
  check(
    'общий размер ряда подписан на чертеже',
    totalDim >= 3200,
    `максимальный размер на чертеже: ${totalDim}`,
  );

  /* ── План и печать ── */

  await page.getByRole('button', { name: 'План', exact: true }).click();
  await sleep(400);
  check('вкладка «План» рисует план', (await page.locator('svg').count()) > 0);
  check(
    'на плане подписаны коммуникации',
    (await page.getByText('проход', { exact: false }).count()) > 0,
  );

  check(
    'кнопка печати на месте',
    (await page.getByRole('button', { name: /Печать чертежа/ }).count()) === 1,
  );
} catch (err) {
  failed++;
  console.error('\nОшибка проверки:', err);
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
