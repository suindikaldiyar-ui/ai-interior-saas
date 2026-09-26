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
 *
 * Слой 53: после вращения и остановки — ноль кадров, и карта теней от
 * движения камеры не пересчитывается; правка модуля — ровно один
 * пересчёт (`__mwCadShadows`).
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
   * ТЕСТ 22 СЛОЯ 53: ВРАЩЕНИЕ И ПРАВКА — КАДРЫ И КАРТА ТЕНЕЙ.
   *
   * Тени и скрытие стен не имеют права жить в цикле кадров: после
   * вращения и остановки сцена обязана замолчать, а карта теней —
   * не пересчитываться от движения камеры вовсе. Правка модуля — это
   * ровно один пересчёт карты: второй означал бы, что сцена пересобирает
   * тень на чём-то, кроме изменения мебели.
   */
  const shadows = () => page.evaluate(() => (window.__mwCadShadows ? window.__mwCadShadows() : -1));
  const readTotal = () =>
    page.evaluate(() => {
      const n = document.querySelector('[data-estimate-total]');
      return n ? Number(n.getAttribute('data-estimate-total')) : null;
    });
  /** Сцена замолчала: счётчик кадров не менялся 2.5 с подряд. */
  const settle = async () => {
    let last = await frames();
    let still = Date.now();
    const end = Date.now() + 30_000;
    while (Date.now() < end) {
      await sleep(500);
      const now = await frames();
      if (now !== last) {
        last = now;
        still = Date.now();
      } else if (Date.now() - still >= 2500) return true;
    }
    return false;
  };

  await page.locator('[data-angle="iso"]').click();
  await settle();
  const view = await page.evaluate(() => {
    const c = document.querySelector('[data-scene] canvas');
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const rot0 = { f: await frames(), s: await shadows() };
  await page.mouse.move(view.x + view.w * 0.5, view.y + view.h * 0.45);
  await page.mouse.down();
  for (let i = 0; i < 14; i++) {
    await page.mouse.move(view.x + view.w * (0.5 + i * 0.015), view.y + view.h * (0.45 + i * 0.004));
    await sleep(40);
  }
  await page.mouse.up();
  const rotSettled = await settle();
  const rot1 = { f: await frames(), s: await shadows() };
  await sleep(10_000);
  const rot2 = await frames();
  console.log(
    `вращение: кадров ${rot1.f - rot0.f}, пересчётов тени ${rot1.s - rot0.s}; после остановки ${rot2 - rot1.f} кадров за 10 с`,
  );
  check(
    'тест 22: вращение рисует кадры, а карту теней не пересчитывает',
    rot0.s >= 0 && rot1.f > rot0.f && rot1.s - rot0.s === 0,
    rot0.s < 0 ? 'НЕТ ПРОБНИКА __mwCadShadows' : `кадров ${rot1.f - rot0.f} · пересчётов ${rot1.s - rot0.s}`,
  );
  check(
    'тест 22: после вращения и остановки — 0 кадров в покое',
    rotSettled && rot2 - rot1.f === 0,
    rotSettled ? `${rot2 - rot1.f} за 10 с` : 'СЦЕНА НЕ ЗАМОЛЧАЛА за 30 с после вращения',
  );

  const card = await page.evaluate(() => {
    const n = [...document.querySelectorAll('[data-library="1"] [data-card]')].find(
      (c) =>
        !c.disabled &&
        c.getAttribute('aria-pressed') !== 'true' &&
        c.getAttribute('data-refused') !== '1' &&
        /[1-9]/.test(c.getAttribute('data-delta') ?? ''),
    );
    return n ? { key: n.getAttribute('data-card'), delta: n.getAttribute('data-delta') } : null;
  });
  if (!card) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: в библиотеке нет доступной карточки с разницей в цене — править нечем');
  await settle();
  const total0 = await readTotal();
  const edit0 = { f: await frames(), s: await shadows() };
  await page.evaluate((key) => document.querySelector(`[data-card="${key}"]`)?.click(), card.key);
  const changed = await until(async () => (await readTotal()) !== total0, 20_000);
  const editSettled = await settle();
  const edit1 = { f: await frames(), s: await shadows() };
  await sleep(10_000);
  const edit2 = await frames();
  console.log(
    `правка «${card.key}» (${card.delta}): итог ${total0} → ${await readTotal()}, кадров ${edit1.f - edit0.f}, ` +
      `пересчётов тени ${edit1.s - edit0.s}; после ${edit2 - edit1.f} кадров за 10 с`,
  );
  check(
    'тест 22: правка модуля дошла до сметы и до сцены',
    changed && edit1.f > edit0.f,
    changed ? `кадров ${edit1.f - edit0.f}` : `ИТОГ НЕ СДВИНУЛСЯ: ${total0}`,
  );
  check(
    'тест 22: после правки модуля карта теней пересчитана один раз, не больше',
    edit1.s - edit0.s === 1,
    `${edit1.s - edit0.s} раз`,
  );
  check(
    'тест 22: после правки — снова 0 кадров в покое',
    editSettled && edit2 - edit1.f === 0,
    editSettled ? `${edit2 - edit1.f} за 10 с` : 'СЦЕНА НЕ ЗАМОЛЧАЛА за 30 с после правки',
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
