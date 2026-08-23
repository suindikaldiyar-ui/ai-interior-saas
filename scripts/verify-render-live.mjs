/**
 * Живая проверка фотореалистичного рендера.
 *
 * Запуск: npm run test:render   (нужны build и GEMINI_API_KEY в .env.local)
 *
 * Это единственная проверка, которая тратит настоящие запросы к модели,
 * поэтому она не входит в npm run verify. Она отвечает на вопрос, который
 * нельзя закрыть типами: доходит ли захваченный кадр до image-модели и
 * возвращается ли из неё картинка.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, '.capture-check');
const PORT = 3133;
const BASE = `http://localhost:${PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await sleep(500);
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

// Ключ читаем только чтобы понять, есть ли смысл запускать проверку.
const envPath = join(ROOT, '.env.local');
const hasKey =
  existsSync(envPath) &&
  /^\s*GEMINI_API_KEY\s*=\s*\S+/m.test(readFileSync(envPath, 'utf8'));

if (!hasKey && !process.env.GEMINI_API_KEY) {
  console.log('\nПропущено: GEMINI_API_KEY не задан. Живой рендер НЕ проверен.\n');
  process.exit(0);
}

const server = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['next', 'start', '-p', String(PORT)],
  { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' },
);

let browser;

try {
  mkdirSync(OUT_DIR, { recursive: true });

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

  browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // Студия переехала в (legacy): корень ведёт в список объектов.
  await page.goto(`${BASE}/studio`, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 30_000 });
  await sleep(2500);

  // Собираем сцену, которую не стыдно отправить модели.
  await page.getByRole('button', { name: 'Объекты', exact: true }).click();
  for (const label of ['Ковёр', 'Диван', 'Журнальный стол', 'ТВ-тумба', 'Растение']) {
    await page.getByRole('button', { name: label, exact: true }).first().click();
    await sleep(300);
  }
  await page.keyboard.press('Escape');

  await page
    .getByRole('button', { name: /Визуализация/ })
    .first()
    .click({ noWaitAfter: true });

  const aside = () =>
    page.evaluate(() => document.querySelector('aside')?.innerText ?? '');

  // Сначала дожидаемся, что карточки вообще появились: захват занимает
  // пару секунд, и без этого «всё готово» срабатывало бы на пустом списке.
  const started = await until(async () => {
    const t = await aside();
    return t.includes('кадр ') || t.includes('···') || t.includes('В очереди');
  }, 60_000);
  check('захват прошёл и варианты поставлены в очередь', started);

  const settled = await until(async () => {
    const t = await aside();
    return started && !t.includes('···') && !t.includes('В очереди');
  }, 240_000);

  check('все шесть вариантов ответили', settled);

  await sleep(1000);

  /*
   * Результат забираем из самой страницы, а не из перехвата ответов:
   * тело запроса клиент уже прочитал, и второй раз оно недоступно.
   * Заодно это проверяет, что картинка реально дошла до интерфейса.
   */
  const collected = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    if (!aside) return { images: [], errors: [] };
    const images = Array.from(aside.querySelectorAll('img'))
      .map((img) => img.getAttribute('src') ?? '')
      .filter((src) => src.startsWith('data:image'));
    const errors = Array.from(aside.querySelectorAll('span'))
      .map((el) => el.textContent ?? '')
      .filter((t) => t.length > 20 && /ошиб|Ошиб|не вернула|перегруж|Сеть|GEMINI/.test(t));
    return { images, errors };
  });

  const withImage = collected.images.map((image, i) => ({ image, styleId: `variant-${i + 1}`, durationMs: 0 }));
  const withError = collected.errors.map((error, i) => ({ error, styleId: `variant-${i + 1}` }));

  check(
    'модель вернула хотя бы одно изображение',
    withImage.length > 0,
    `картинок: ${withImage.length}, ошибок: ${withError.length}`,
  );

  if (withError.length > 0) {
    console.log('  --   ошибки вариантов:');
    for (const r of withError.slice(0, 6)) {
      console.log(`       ${r.styleId}: ${String(r.error).slice(0, 140)}`);
    }
  }

  for (const result of withImage) {
    const match = /^data:([^;,]+);base64,(.+)$/s.exec(result.image);
    if (!match) continue;
    const buffer = Buffer.from(match[2], 'base64');
    const ext = match[1].includes('png') ? 'png' : 'jpg';
    writeFileSync(join(OUT_DIR, `render-${result.styleId}.${ext}`), buffer);
    console.log(
      `  --   ${result.styleId}: ${Math.round(buffer.length / 1024)} КБ, ${match[1]}, ${result.durationMs} мс`,
    );
  }

  if (withImage.length > 0) {
    const sizes = withImage.map((r) => r.image.length);
    check(
      'изображения непустые',
      sizes.every((s) => s > 10_000),
      `минимальный размер base64: ${Math.min(...sizes)}`,
    );
  }

  console.log(`\nКартинки сохранены в ${OUT_DIR}`);
} catch (err) {
  failed++;
  console.error('\nОшибка проверки:', err);
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
