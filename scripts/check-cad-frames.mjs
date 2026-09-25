/**
 * СКОЛЬКО КАДРОВ РИСУЕТ ВИДИМАЯ СЦЕНА — ЧИСЛОМ, А НЕ «БЫСТРО».
 *
 * Запуск: node scripts/check-cad-frames.mjs   (нужен build)
 *
 * Сцену однажды убрали из интерфейса за тормоза, и вернулась она под
 * жёсткое требование: ноль кадров в покое и перерисовки только на
 * действия. Проверять это словами нельзя — «быстро» не измерение,
 * поэтому здесь минута НАСТОЯЩЕЙ работы: ракурсы, открывание, клики по
 * мебели, перебор материалов и вращение свободного вида.
 *
 * Счётчик берётся у видимой сцены (`__mwCadFrames`): общий затирает
 * скрытая сцена для clay-кадра, она регистрирует свой последней.
 *
 * В приёмку не входит: минута прогона на каждый `npm run verify` — это
 * минута на каждый прогон. Ноль в покое проверяет `test:demo`.
 */
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';

const PORT = 3141;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${PORT}`, { encoding: 'utf8' });
  for (const pid of new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter((p) => /^\d+$/.test(p) && p !== '0'))) {
    execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
  }
} catch {}

const server = spawn('npx.cmd', ['next', 'start', '-p', String(PORT)], {
  cwd: 'C:/projects/ai-interior-saas', stdio: 'ignore', shell: true,
  env: { ...process.env, SITE_PASSWORD: '' },
});

let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok   ${name}${detail ? `  ${detail}` : ''}`);
  else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? `  ${detail}` : ''}`);
  }
};

const until = async (fn, ms = 90_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await sleep(300); }
  return false;
};

let browser;
try {
  await until(async () => { try { return (await fetch(BASE)).ok; } catch { return false; } });
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await until(async () => (await page.getByRole('button', { name: /Раскладка/ }).count()) > 0);
  await page.getByRole('button', { name: /Раскладка/ }).first().click();
  await sleep(2500);
  await page.locator('[data-schematic-tab="scene"]').click();
  await sleep(3500);

  const frames = () => page.evaluate(() => (window.__mwCadFrames ? window.__mwCadFrames() : -1));
  const box = await page.evaluate(() => {
    const c = document.querySelector('[data-scene] canvas');
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });

  /* Покой: сцену никто не трогает. */
  const idle0 = await frames();
  await sleep(10_000);
  const idle1 = await frames();
  console.log(`покой: ${idle1 - idle0} кадров за 10 с`);
  check('в покое сцена не рисует ни кадра', idle0 >= 0 && idle1 - idle0 === 0, `${idle1 - idle0} за 10 с`);

  /* Минута работы: ракурсы, открывание, клики, материалы, вращение. */
  const start = Date.now();
  const from = await frames();
  let actions = 0;
  const angles = ['elevation', 'left', 'right', 'plan', 'iso'];

  while (Date.now() - start < 60_000) {
    for (const a of angles) {
      if (Date.now() - start >= 60_000) break;
      await page.locator(`[data-angle="${a}"]`).click(); actions++;
      await sleep(600);
    }
    if (Date.now() - start >= 60_000) break;
    await page.locator('[data-open-all]').click(); actions++;
    await sleep(1200);
    await page.locator('[data-close-all]').click(); actions++;
    await sleep(1200);

    await page.mouse.click(box.x + box.w * 0.4, box.y + box.h * 0.55); actions++;
    await sleep(500);
    /*
     * Образцы материала живут на шаге «Материалы» (работа разложена на
     * четыре шага), и на «Раскладке» их не видно. Перебор материалов —
     * самая частая трата кадров, поэтому идём туда и возвращаемся.
     */
    await page.getByRole('button', { name: /Материалы/ }).first().click(); actions++;
    await sleep(500);
    const sw = page.locator('[data-swatch]:visible');
    const n = await sw.count();
    if (n > 1) { await sw.nth(actions % n).click(); actions++; await sleep(900); }
    await page.getByRole('button', { name: /Раскладка/ }).first().click(); actions++;
    await sleep(500);

    /* Вращение свободного ракурса — самая частая трата кадров. */
    await page.locator('[data-angle="iso"]').click(); actions++;
    await page.mouse.move(box.x + box.w * 0.5, box.y + box.h * 0.5);
    await page.mouse.down();
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(box.x + box.w * (0.5 + i * 0.02), box.y + box.h * 0.5);
      await sleep(40);
    }
    await page.mouse.up(); actions++;
    await sleep(800);
  }

  const to = await frames();
  console.log(`минута работы: ${to - from} кадров, ${actions} действий`);

  /*
   * ПОКОЙ С ОТКРЫТОЙ БИБЛИОТЕКОЙ И НАРИСОВАННЫМИ КАРТИНКАМИ.
   *
   * Картинки карточек рисует СВОЙ отрисовщик, вне цикла сцены, а цены
   * считаются пересчётом сметы. Ни то ни другое не имеет права крутить
   * видимую сцену: панель открыта рядом с ней, и каждый лишний кадр —
   * это батарея планшета на встрече.
   */
  await page.locator('[data-schematic-tab="front"]').click();
  await sleep(1500);
  const picked = await page.evaluate(() => {
    const g = [...document.querySelectorAll('[data-module-id]')].find((n) =>
      /^base-\d+$/.test((n.getAttribute('data-module-id') || '').split('@')[0]),
    );
    g?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return g ? g.getAttribute('data-module-id') : null;
  });
  if (!picked) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: на схеме нет обычного модуля нижнего ряда');
  await until(async () => (await page.locator('[data-library="1"] [data-card] img').count()) > 0, 30_000);

  await page.locator('[data-schematic-tab="scene"]').click();
  await sleep(2500);
  const toggle = page.locator('[data-panel-toggle]');
  if ((await toggle.count()) > 0 && /Показать/.test(await toggle.first().innerText())) {
    await toggle.first().click();
    await sleep(1500);
  }

  const pictures = await page.locator('[data-library="1"] [data-card] img').count();
  const panelVisible = await page.locator('[data-library="1"]').isVisible();
  check(
    'библиотека открыта рядом со сценой и картинки нарисованы',
    panelVisible && pictures > 0,
    `модуль ${picked} · картинок ${pictures} · панель ${panelVisible ? 'видна' : 'НЕ ВИДНА'}`,
  );

  /* Дорисовка видимых карточек — это работа; покой начинается после. */
  await sleep(3000);
  const rest0 = await frames();
  await sleep(10_000);
  const rest1 = await frames();
  console.log(`покой с библиотекой: ${rest1 - rest0} кадров за 10 с`);
  check(
    'с открытой библиотекой и картинками сцена в покое не рисует ни кадра',
    rest0 >= 0 && rest1 - rest0 === 0,
    `${rest1 - rest0} за 10 с`,
  );

  /*
   * ПОКОЙ С ОТКРЫТОЙ ПАНЕЛЬЮ МАТЕРИАЛОВ (слой 51).
   *
   * 1825 цветов RAL в панели — это DOM, а не сцена: список рисует только
   * видимые строки, и ни прокрутка, ни поиск не имеют права крутить
   * кадры мебели рядом. Меряется после прокрутки списка — покой
   * начинается, когда работа кончилась.
   */
  await page.getByRole('button', { name: /Материалы/ }).first().click();
  await sleep(1500);
  await page.locator('[data-schematic-tab="scene"]').click();
  await sleep(1500);
  const panelToggle = page.locator('[data-panel-toggle]');
  if ((await panelToggle.count()) > 0 && /Показать/.test(await panelToggle.first().innerText())) {
    await panelToggle.first().click();
    await sleep(1500);
  }
  const materialsOpen = await until(
    () =>
      page.evaluate(() => {
        const panel = document.querySelector('[data-materials-panel]');
        return Boolean(panel && panel.offsetParent !== null && panel.getAttribute('data-loaded') === '1');
      }),
    45_000,
  );
  check(
    'панель «Материалы» открыта рядом со сценой и каталог загружен',
    materialsOpen,
    materialsOpen ? '' : 'НУЛЕВОЙ СЕЛЕКТОР: [data-materials-panel] не видна или не загружена',
  );
  if (materialsOpen) {
    await page.locator('[data-material-tab="mdf_paint"]').click();
    await sleep(800);
    const readRows = () =>
      page.evaluate(() => {
        const items = [...document.querySelectorAll('[data-material-item]')];
        return { count: items.length, first: items[0]?.getAttribute('data-material-item') ?? null };
      });
    const top = await readRows();
    await page.evaluate(() => {
      const list = document.querySelector('[data-material-list]');
      if (list) list.scrollTop = 20_000;
    });
    /* Список перерисовывается по событию прокрутки — меряем после него. */
    await sleep(800);
    const deep = await readRows();
    console.log(`строк RAL в DOM: вверху ${top.count} (с ${top.first}), после прокрутки ${deep.count} (с ${deep.first})`);
    check(
      'список RAL рисует только видимые строки, а не 1825 — и после прокрутки тоже',
      top.count > 0 && top.count < 120 && deep.count > 0 && deep.count < 120 && deep.first !== top.first,
      `вверху ${top.count} с ${top.first} · после прокрутки ${deep.count} с ${deep.first}`,
    );
    await sleep(3000);
    const open0 = await frames();
    await sleep(10_000);
    const open1 = await frames();
    console.log(`покой с панелью материалов: ${open1 - open0} кадров за 10 с`);
    check(
      'с открытой панелью материалов сцена в покое не рисует ни кадра',
      open0 >= 0 && open1 - open0 === 0,
      `${open1 - open0} за 10 с`,
    );
  }

  const scene = await page.evaluate(() => (window.__mwScene ? window.__mwScene() : null));
  console.log(`объекты: вызовов ${scene.calls}, мешей ${scene.scene.meshes}, треугольников ${scene.triangles}`);
} catch (error) {
  failed += 1;
  console.log(`  FAIL ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser?.close();
  server.kill();
  try { execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' }); } catch {}
}

console.log(`ПАДЕНИЙ: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
