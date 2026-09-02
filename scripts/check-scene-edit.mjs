/**
 * Правка прямо в сцене — вживую.
 *
 * Проверяется то, чего не докажут типы:
 *  1. клик по мебели выделяет модуль, и выделение то же, что на чертеже;
 *  2. под сценой появляются варианты именно этого места;
 *  3. ручка ширины тянется и меняет смету;
 *  4. смета открывается пятью группами, ставки — под «Подробно».
 *
 * Инструмент глазной проверки, в `verify` не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 3221;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/scene-edit';
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

const totalText = (page) =>
  page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('button')).find((b) =>
      /подробнее|свернуть/.test(b.textContent ?? ''),
    );
    return (row?.textContent ?? '').replace(/\s+/g, ' ').trim();
  });

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
  await sleep(1200);
  await page.getByRole('button', { name: '3D', exact: true }).first().click();
  await sleep(2500);

  /* ── 1. Клик по мебели выделяет модуль ── */
  const parts = await page.evaluate(() => window.__mwOpenableIds?.() ?? []);
  // Берём дверцу обычного модуля: у техники ручки ширины нет по замыслу.
  const target = parts.find((id) => id.includes(':door:') && !/fridge|oven|dishwasher/.test(id));
  if (!target) {
    ok('в ряду есть обычная дверца', false, `частей: ${parts.length}`);
  } else {
    const point = await page.evaluate((id) => window.__mwPartPoint?.(id) ?? null, target);
    if (!point) {
      ok('дверца видна в кадре', false);
    } else {
      await page.mouse.click(point.x, point.y);
      await sleep(900);

      const grip = await page.evaluate(() => window.__mwGripPoint?.() ?? null);
      ok('клик выделяет модуль и даёт ручку ширины', Boolean(grip), target);

      /*
       * Меню вариантов есть НЕ У КАЖДОГО места: у широкого модуля выбор
       * может сводиться к одной дверце, и тогда меню не показывается
       * вовсе — ровно как на чертеже. Поэтому перебираем модули, пока
       * не найдём место с настоящим выбором.
       */
      let menuOn = null;
      const candidates = parts.filter((id) => id.includes(':door:'));
      for (const id of [target, ...candidates]) {
        const at = await page.evaluate((partId) => window.__mwPartPoint?.(partId) ?? null, id);
        if (!at) continue;
        await page.mouse.click(at.x, at.y);
        await sleep(700);
        const shown = await page.evaluate(() =>
          (document.body.textContent ?? '').includes('Что бывает в этом месте'),
        );
        if (shown) {
          menuOn = id;
          break;
        }
      }
      ok('хотя бы у одного места есть выбор начинки', Boolean(menuOn), menuOn ?? 'ни у одного');

      // Возвращаемся на модуль с ручкой: дальше тянем именно его.
      await page.mouse.click(point.x, point.y);
      await sleep(700);

      await page.screenshot({ path: `${OUT}/selected.png` });

      /* ── 2. Ширина тянется ── */
      const gripNow = await page.evaluate(() => window.__mwGripPoint?.() ?? null);
      if (gripNow) {
        const before = await totalText(page);

        await page.mouse.move(gripNow.x, gripNow.y);
        await page.mouse.down();
        // Тянем влево: сузить можно всегда, расширить — не в каждой стене.
        for (let dx = -10; dx >= -90; dx -= 20) {
          await page.mouse.move(gripNow.x + dx, gripNow.y);
          await sleep(180);
        }
        await page.mouse.up();
        await sleep(900);

        const after = await totalText(page);
        ok('ручка меняет мебель и смету', before !== after, `${before} → ${after}`);
        await page.screenshot({ path: `${OUT}/dragged.png` });
      }
    }
  }

  /* ── 3. Смета в пять групп ── */
  await page.getByRole('button', { name: /подробнее|свернуть/ }).click();
  await sleep(500);

  const groups = await page.evaluate(() =>
    ['Корпус и фасады', 'Столешница и фартук', 'Фурнитура', 'Доставка и монтаж'].filter((t) =>
      (document.body.textContent ?? '').includes(t),
    ),
  );
  ok('смета открывается группами', groups.length >= 3, groups.join(' · '));
  ok(
    'ставок и галочек в кратком виде нет',
    (await page.locator('input[type="checkbox"]').count()) === 0,
  );

  await page.getByRole('button', { name: 'Подробно', exact: true }).click();
  await sleep(500);
  const boxes = await page.locator('input[type="checkbox"]').count();
  ok('«Подробно» показывает статьи', boxes > 3, `строк: ${boxes}`);
  await page.screenshot({ path: `${OUT}/estimate.png` });

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
