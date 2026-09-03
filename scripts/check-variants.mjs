/**
 * Лента превью вариантов — вживую.
 *
 * Проверяется то, чего не докажут типы:
 *  1. клик по модулю на чертеже открывает ленту карточек;
 *  2. карточек 5–10, и каждая — настоящий мини-чертёж, а не иконка;
 *  3. под каждой стоит разница в цене;
 *  4. выбор перестраивает чертёж НА МЕСТЕ: лента не закрывается,
 *     выделение остаётся;
 *  5. от касания до перерисованного чертежа — меньше 100 мс.
 *
 * Инструмент глазной проверки, в `verify` не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 3223;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/variants';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, {
      encoding: 'utf8',
    });
    for (const line of out.split(/\r?\n/)) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== '0')
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    }
  } catch {
    /* никто не слушает */
  }
}

freePort(PORT);
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
  env: { ...process.env, SITE_PASSWORD: '' },
});

let failures = 0;
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? '  ok  ' : '  ПЛОХО'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures += 1;
};

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(BASE);
      if (res.ok || res.status < 500) break;
    } catch {
      await sleep(1000);
    }
  }

  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(3500);
  await page.getByRole('button', { name: /Результат/ }).first().click({ timeout: 90_000 });
  await sleep(1500);

  /* ── 1. Клик по модулю открывает ленту ── */
  const before = await page.locator('[data-variant-strip]').count();
  ok('без выбранного модуля ленты нет', before === 0, `лент: ${before}`);

  /*
   * Кликаем по модулям чертежа, пока не найдём место с настоящим выбором:
   * у широкого модуля выбор может сводиться к одной дверце, и тогда ленты
   * нет — ровно так и задумано.
   */
  // Только модули большого чертежа: в галерее решений те же группы, но
  // они ничего не выделяют.
  const modules = page.locator('[data-view="elevation"] [data-glyph]');
  const count = await modules.count();
  let opened = 0;

  for (let i = 0; i < Math.min(count, 14); i += 1) {
    await modules.nth(i).click({ force: true });
    await sleep(350);
    opened = await page.locator('[data-variant]').count();
    if (opened >= 3) break;
  }

  ok('клик по модулю открывает ленту вариантов', opened >= 3, `карточек: ${opened}`);
  ok('карточек не больше десяти', opened <= 10, `карточек: ${opened}`);

  /* ── 2. Карточка — мини-чертёж, а не иконка ── */
  const cards = await page.evaluate(() => {
    const list = [...document.querySelectorAll('[data-variant]')];
    return list.map((el) => ({
      kind: el.getAttribute('data-variant'),
      svg: el.querySelectorAll('svg').length,
      glyph: el.querySelectorAll('[data-glyph]').length,
      shapes: el.querySelectorAll('svg *').length,
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    }));
  });

  ok(
    'каждая карточка — настоящий мини-чертёж',
    cards.length > 0 && cards.every((c) => c.svg === 1 && c.glyph === 1 && c.shapes > 2),
    cards.map((c) => `${c.kind}:${c.shapes}`).join(' · '),
  );
  ok(
    'карточки различаются рисунком, а не только подписью',
    new Set(cards.map((c) => c.shapes)).size > 1 || cards.length < 2,
  );
  ok(
    'под каждой карточкой цена или отметка «сейчас»',
    cards.every((c) => /₸|сейчас|та же цена/.test(c.text)),
    cards.map((c) => c.text).slice(0, 3).join(' | '),
  );

  await page.screenshot({ path: `${OUT}/strip.png` });

  /* ── 3. Выбор перестраивает чертёж на месте и укладывается в 100 мс ── */
  const target = cards.find((c) => !/сейчас/.test(c.text));
  if (!target) {
    ok('есть что выбрать, кроме текущего', false);
  } else {
    const timing = await page.evaluate(async (kind) => {
      const button = document.querySelector(`[data-variant="${kind}"]`);
      if (!button) return null;

      const sheet = document.querySelector('[data-view="elevation"] svg');
      const before = sheet?.innerHTML.length ?? 0;

      const started = performance.now();
      button.click();

      // Ждём кадр, в котором чертёж уже перерисован.
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const after = document.querySelector('[data-view="elevation"] svg')?.innerHTML.length ?? 0;

      return { ms: performance.now() - started, changed: after !== before };
    }, target.kind);

    if (!timing) {
      ok('выбор варианта срабатывает', false);
    } else {
      ok('чертёж перестраивается после выбора', timing.changed, `${Math.round(timing.ms)} мс`);
      ok(
        'от касания до перерисовки меньше 100 мс',
        timing.ms < 100,
        `${timing.ms.toFixed(1)} мс`,
      );
    }

    await sleep(400);
    const stripAfter = await page.locator('[data-variant]').count();
    ok('лента не закрывается после выбора', stripAfter >= 3, `карточек: ${stripAfter}`);

    const activeAfter = await page.evaluate(
      (kind) =>
        document.querySelector(`[data-variant="${kind}"]`)?.getAttribute('aria-pressed') === 'true',
      target.kind,
    );
    ok('выбранная карточка подсвечена', activeAfter);

    await page.screenshot({ path: `${OUT}/picked.png` });
  }

  await browser.close();
  console.log(failures === 0 ? '\nвсё сходится' : `\nпровалов: ${failures}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    server.kill();
    freePort(PORT);
  });
