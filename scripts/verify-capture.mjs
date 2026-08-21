/**
 * Приёмка фазы 2: захват кадра в настоящем браузере с WebGL.
 *
 * Запуск: npm run test:capture   (нужен собранный проект: npm run build)
 *
 * Проверяет то, что нельзя проверить типами:
 *  - в кадре нет ни одного служебного элемента (гизмо, каркас выделения, сетка);
 *  - clay-проход отдаёт серую геометрию без цвета;
 *  - размер вьюпорта и пропорции камеры восстановились после захвата;
 *  - вес JPEG-кадра меньше 800 КБ;
 *  - один сломанный вариант не мешает остальным дойти до done;
 *  - без ключа все шесть карточек показывают ошибку, интерфейс жив.
 *
 * Кадры держим в самой странице (window.__frames) и там же сравниваем:
 * гонять мегабайтные dataURL через CDP туда-обратно ненадёжно.
 */

import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, '.capture-check');
const PORT = 3123;
const BASE = `http://localhost:${PORT}`;
/** HERO=1 — снять кадр ракурсом по умолчанию и сохранить его для глазной проверки. */
const HERO_ONLY = Boolean(process.env.HERO);
const CAPTURE_W = 1536;
const CAPTURE_H = 1024;
/** Ровно половина от размера захвата: оба кадра ужимаются одинаково. */
const DIFF_W = CAPTURE_W / 2;
const DIFF_H = CAPTURE_H / 2;

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await sleep(250);
  }
  return false;
}

/** 1×1 PNG — достаточно, чтобы карточка перешла в состояние done. */
const STUB_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Хелперы, живущие внутри страницы: хранение кадров, сравнение, анализ. */
const PAGE_HELPERS = () => {
  window.__frames = {};

  window.__load = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image decode failed'));
      img.src = src;
    });

  window.__pixels = async (key, w, h) => {
    const img = await window.__load(window.__frames[key]);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h).data, natural: [img.width, img.height] };
  };

  /** Сдвигает прошлый кадр в key_prev и снимает новый: так видно, устоялась ли сцена. */
  window.__snap = (key) => {
    window.__frames[`${key}_prev`] = window.__frames[key];
    return window.__grab(key);
  };

  window.__grab = (key) => {
    window.__frames[key] = document.querySelector('canvas').toDataURL('image/png');
    return window.__frames[key].length;
  };

  window.__put = (key, dataUrl) => {
    window.__frames[key] = dataUrl;
    return dataUrl.length;
  };

  window.__diff = async (ka, kb, w, h) => {
    const a = await window.__pixels(ka, w, h);
    const b = await window.__pixels(kb, w, h);
    let sum = 0;
    let changed = 0;
    const total = w * h;
    for (let i = 0; i < a.data.length; i += 4) {
      const d =
        (Math.abs(a.data[i] - b.data[i]) +
          Math.abs(a.data[i + 1] - b.data[i + 1]) +
          Math.abs(a.data[i + 2] - b.data[i + 2])) /
        3;
      sum += d;
      if (d > 18) changed++;
    }
    return { mean: sum / total, changedRatio: changed / total, natural: a.natural };
  };

  window.__saturation = async (key) => {
    const img = await window.__load(window.__frames[key]);
    const cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
    let saturated = 0;
    for (let i = 0; i < data.length; i += 4) {
      const max = Math.max(data[i], data[i + 1], data[i + 2]);
      const min = Math.min(data[i], data[i + 1], data[i + 2]);
      if (max > 40 && (max - min) / max > 0.22) saturated++;
    }
    return {
      width: img.width,
      height: img.height,
      saturatedRatio: saturated / (data.length / 4),
    };
  };
};

/*
 * Оставшийся с прошлого прогона сервер отдаёт СТАРУЮ сборку: страница
 * открывается, чанки 404, React не оживает — и проверка «переключение
 * варианта меняет смету» падает на совершенно исправном коде.
 * Поэтому порт освобождается до старта, а не после.
 */
function freePort(port) {
  try {
    const out =
      process.platform === 'win32'
        ? execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, {
            encoding: 'utf8',
          })
        : execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' });

    const pids = new Set(
      out
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/).pop())
        .filter((pid) => pid && /^\d+$/.test(pid) && pid !== '0'),
    );

    for (const pid of pids) {
      execSync(
        process.platform === 'win32' ? `taskkill /PID ${pid} /F` : `kill -9 ${pid}`,
        { stdio: 'ignore' },
      );
      console.log(`  ··   освободил порт ${port}: остановлен процесс ${pid}`);
    }
  } catch {
    /* никто не слушает — это норма */
  }
}

freePort(PORT);

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
  });
  if (!up) {
    console.error('Сервер не поднялся. Соберите проект: npm run build');
    process.exit(1);
  }

  browser = await chromium.launch({
    args: [
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => {
    failed++;
    console.error('  [pageerror]', e.message.slice(0, 300));
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 30_000 });
  await sleep(2500);
  await page.evaluate(PAGE_HELPERS);

  const asideText = () =>
    page.evaluate(() => document.querySelector('aside')?.innerText ?? '');
  const grab = (key) => page.evaluate((k) => window.__grab(k), key);

  /*
   * Кадр после изменения сцены снимаем НЕ по таймеру, а дождавшись, пока он
   * действительно перестанет совпадать с предыдущим. На загруженной машине
   * софтверный WebGL рисует кадр дольше секунды, и фиксированная пауза
   * снимала старое содержимое буфера: эталоны выходили побайтово равными,
   * и падала проверка, к самому захвату отношения не имеющая.
   */
  const grabChanged = async (key, fromKey, timeout = 20_000) => {
    let len = await grab(key);
    await until(async () => {
      len = await page.evaluate((k) => window.__snap(k), key);
      /*
       * Мало дождаться, что кадр отличается от прошлого: сцена дорисовывается
       * по частям, и на полпути разница выходит меньше настоящей. Ждём, пока
       * два подряд снимка совпадут — значит, рисовать больше нечего.
       */
      return page.evaluate(
        ({ a, b }) => window.__frames[a] !== window.__frames[b] &&
          window.__frames[a] === window.__frames[`${a}_prev`],
        { a: key, b: fromKey },
      );
    }, timeout);
    return len;
  };
  const diff = (ka, kb) =>
    page.evaluate(
      ({ a, b, w, h }) => window.__diff(a, b, w, h),
      { a: ka, b: kb, w: DIFF_W, h: DIFF_H },
    );

  /* ── Сцена ── */

  await page.getByRole('button', { name: 'Объекты', exact: true }).click();
  for (const label of ['Ковёр', 'Диван', 'Журнальный стол']) {
    await page.getByRole('button', { name: label, exact: true }).first().click();
    await sleep(350);
  }

  const canvasBox = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight };
  });

  // Подгоняем вьюпорт ровно под 1536 × 1024 — размер захвата. Тогда режим
  // «Текущий вид» снимает кадр той же камерой И в том же разрешении: между
  // живым кадром и захватом не остаётся ни перекадрирования, ни пересэмплинга,
  // и вся разница — это ровно служебные элементы.
  const measure = () =>
    page.evaluate(() => {
      const c = document.querySelector('canvas');
      return { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight };
    });

  const targetCssW = Math.round(canvasBox.cssH * (CAPTURE_W / CAPTURE_H));
  await page.setViewportSize({
    width: 1440 + (targetCssW - canvasBox.cssW),
    height: 900,
  });

  // Ждём, пока вьюпорт реально перестроится: фиксированной паузы мало —
  // высота шапки зависит от того, перенеслись ли кнопки на вторую строку.
  let box = canvasBox;
  await until(async () => {
    box = await measure();
    return Math.abs(box.cssW / box.cssH - CAPTURE_W / CAPTURE_H) < 0.02;
  }, 15_000);
  check(
    'вьюпорт приведён к 3:2 — тому же кадрированию, что и у захвата',
    Math.abs(box.cssW / box.cssH - CAPTURE_W / CAPTURE_H) < 0.02,
    `${box.cssW}×${box.cssH} = ${(box.cssW / box.cssH).toFixed(3)}`,
  );

  // Режим съёмки «Текущий вид».
  await page.getByRole('button', { name: 'Варианты', exact: true }).click();
  if (!HERO_ONLY) await page.getByRole('button', { name: /Текущий вид/ }).click();
  await sleep(400);
  await page.getByRole('button', { name: 'Объекты', exact: true }).click();
  await sleep(400);

  /* ── Эталонные кадры ── */

  // Чистая сцена: ничего не выделено, сетка выключена.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Сетка', exact: true }).click();
  await sleep(1000);
  const cleanLen = await grab('clean');

  // Хелперы включены: выделенный ковёр + сетка.
  await page.getByRole('button', { name: 'Сетка', exact: true }).click();
  await page.locator('aside').getByText('Ковёр', { exact: true }).first().click();
  await sleep(600);
  const helpersLen = await grabChanged('helpers', 'clean');

  check('эталонные кадры сняты и различаются', cleanLen !== helpersLen, `${cleanLen} vs ${helpersLen}`);

  const gridOn = await page
    .getByRole('button', { name: 'Сетка', exact: true })
    .evaluate((el) => el.className.includes('select'));
  check('сетка включена перед захватом', gridOn === true);

  const helpersVsClean = await diff('helpers', 'clean');
  check(
    'контроль: хелперы дают заметную разницу кадров',
    helpersVsClean.changedRatio > 0.005,
    `изменённых пикселей ${(helpersVsClean.changedRatio * 100).toFixed(2)}%, среднее отклонение ${helpersVsClean.mean.toFixed(2)}`,
  );

  /* ── Перехват запросов рендера ── */

  const captured = { beauty: null, clay: null };
  const seenStyles = [];

  await page.route('**/api/ai/render', async (route) => {
    const body = route.request().postDataJSON();
    seenStyles.push(body.styleId);
    if (!captured.beauty) {
      captured.beauty = body.beauty;
      captured.clay = body.clay;
    }
    // Один вариант ломаем намеренно: остальные обязаны дойти до done.
    if (body.styleId === 'loft') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          styleId: body.styleId,
          error: 'Намеренная ошибка для проверки',
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ styleId: body.styleId, image: STUB_PNG, durationMs: 1234 }),
    });
  });

  await page
    .getByRole('button', { name: /Визуализация/ })
    .first()
    .click({ noWaitAfter: true });

  check(
    'шесть параллельных вызовов роута, по одному на вариант',
    await until(() => seenStyles.length === 6, 90_000),
    `вызовов: ${seenStyles.length}`,
  );

  await until(async () => !(await asideText()).includes('···'), 60_000);
  await sleep(800);

  /*
   * Кадр после захвата: хелперы обязаны вернуться. Ждём, пока картинка
   * действительно совпадёт с дозахватной, а не снимаем по таймеру —
   * на медленной машине сцена дорисовывается уже после ответа роутов.
   */
  await grab('after');
  await until(async () => {
    await grab('after');
    const back = await diff('after', 'helpers');
    return back.changedRatio < helpersVsClean.changedRatio * 0.4;
  }, 15_000);

  /* ── Кадры ── */

  check('кадры ушли в запрос', Boolean(captured.beauty && captured.clay));

  const sizeKb = (d) => Math.round((d.slice(d.indexOf(',') + 1).length * 0.75) / 1024);
  const beautyKb = sizeKb(captured.beauty);
  const clayKb = sizeKb(captured.clay);

  check('beauty — JPEG', captured.beauty.startsWith('data:image/jpeg'));
  check('clay — JPEG', captured.clay.startsWith('data:image/jpeg'));
  check('вес beauty-кадра < 800 КБ', beautyKb < 800, `${beautyKb} КБ`);
  check('вес clay-кадра < 800 КБ', clayKb < 800, `${clayKb} КБ`);

  writeFileSync(join(OUT_DIR, 'beauty.jpg'), Buffer.from(captured.beauty.split(',')[1], 'base64'));
  writeFileSync(join(OUT_DIR, 'clay.jpg'), Buffer.from(captured.clay.split(',')[1], 'base64'));

  // Кладём снятые кадры в страницу одним куском и дальше работаем там.
  await page.evaluate(
    ({ beauty, clay }) => {
      window.__put('capture', beauty);
      window.__put('clay', clay);
    },
    { beauty: captured.beauty, clay: captured.clay },
  );

  const beautyInfo = await page.evaluate(() => window.__saturation('capture'));
  const clayInfo = await page.evaluate(() => window.__saturation('clay'));

  check(
    'кадр снят в 1536 × 1024',
    beautyInfo.width === 1536 && beautyInfo.height === 1024,
    `${beautyInfo.width}×${beautyInfo.height}`,
  );

  // Захват — JPEG другого разрешения, поэтому у любого сравнения с живым кадром
  // есть общий шум пересэмплинга. Сравниваем захват сразу с обоими эталонами:
  // шум в обеих парах одинаковый и взаимно сокращается, остаётся только вклад
  // хелперов. Если бы гизмо, каркас или сетка просочились в кадр, захват был бы
  // ближе к «helpers», а не к «clean».
  if (HERO_ONLY) {
    // В режиме HERO камера захвата другая, эталоны с ней несопоставимы —
    // сравнение кадров тут ничего не доказывает, поэтому его не проводим.
    console.log('  --   сравнение кадров пропущено: режим HERO снимает другой камерой');
  } else {
    const captureVsClean = await diff('capture', 'clean');
    const captureVsHelpers = await diff('capture', 'helpers');

    check(
      'в кадре нет служебных элементов: захват ближе к чистой сцене, чем к сцене с хелперами',
      captureVsClean.changedRatio < captureVsHelpers.changedRatio,
      `до чистой сцены ${(captureVsClean.changedRatio * 100).toFixed(2)}%, ` +
        `до сцены с хелперами ${(captureVsHelpers.changedRatio * 100).toFixed(2)}% ` +
        `(сами хелперы дают ${(helpersVsClean.changedRatio * 100).toFixed(2)}%)`,
    );
  }

  check(
    'clay-проход обесцвечен',
    clayInfo.saturatedRatio < 0.02,
    `насыщенных ${(clayInfo.saturatedRatio * 100).toFixed(2)}% против ${(beautyInfo.saturatedRatio * 100).toFixed(2)}% в beauty`,
  );
  check(
    'beauty заметно цветнее clay',
    beautyInfo.saturatedRatio > clayInfo.saturatedRatio * 3,
  );

  /* ── Вьюпорт вернулся в исходное состояние ── */

  const after = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight };
  });

  check(
    'размер буфера вьюпорта восстановлен',
    after.w === box.w && after.h === box.h,
    `было ${box.w}×${box.h}, стало ${after.w}×${after.h}`,
  );
  check(
    'CSS-размер канваса не поехал',
    after.cssW === box.cssW && after.cssH === box.cssH,
    `${after.cssW}×${after.cssH}`,
  );

  const restored = await diff('after', 'helpers');
  check(
    'после захвата сцена выглядит как до него: хелперы вернулись',
    restored.changedRatio < helpersVsClean.changedRatio * 0.4,
    `отличие от кадра до захвата ${(restored.changedRatio * 100).toFixed(2)}%`,
  );

  const gridBackOn = await page
    .getByRole('button', { name: 'Сетка', exact: true })
    .evaluate((el) => el.className.includes('select'));
  check('сетка вернулась после захвата', gridBackOn === true);

  /* ── Судьба вариантов ── */

  const settledText = await asideText();
  const doneCount = (settledText.match(/1\.2 с/g) ?? []).length;
  check(
    'пять вариантов дошли до done, сломанный им не помешал',
    doneCount === 5,
    `готовых карточек: ${doneCount}`,
  );
  check(
    'сломанный вариант показан карточкой с ошибкой',
    settledText.includes('Намеренная ошибка для проверки'),
  );

  /* ── Без ключа: все шесть карточек с ошибкой, интерфейс жив ── */

  /*
   * Настоящий роут без заглушек. Что именно вернётся, зависит от окружения:
   * без GEMINI_API_KEY — шесть карточек с ошибкой ключа, с ключом — шесть
   * ответов модели. Проверяем инвариант, который обязан держаться в обоих
   * случаях: все шесть вариантов доходят до конца, ни один не зависает,
   * интерфейс остаётся живым.
   */
  await page.unroute('**/api/ai/render');
  await page
    .getByRole('button', { name: /Визуализация/ })
    .first()
    .click({ noWaitAfter: true });

  const settled = await until(async () => {
    const t = await asideText();
    return !t.includes('···') && !t.includes('В очереди');
  }, 180_000);
  await sleep(600);

  const realText = await asideText();
  const keyErrors = (realText.match(/GEMINI_API_KEY не задан/g) ?? []).length;
  const hasKey = keyErrors === 0;

  check(
    'все шесть вариантов настоящего роута дошли до конца, ни один не завис',
    settled,
    hasKey ? 'ключ Gemini задан — ответы от модели' : `карточек с ошибкой ключа: ${keyErrors}`,
  );

  if (!hasKey) {
    check(
      'без ключа ошибку показывают ровно шесть карточек',
      keyErrors === 6,
      `карточек: ${keyErrors}`,
    );
  }
  /*
   * Кнопка в шапке во время работы называется «Генерация N/6», а после —
   * «Визуализация». Живым интерфейс считается в обоих состояниях: важно,
   * что вьюпорт на месте и шапка отвечает, а не конкретная надпись.
   */
  const canvasCount = await page.locator('canvas').count();
  const headerButton = await page
    .getByRole('button', { name: /Визуализация|Генерация/ })
    .count();
  check(
    'интерфейс не упал: вьюпорт и шапка на месте',
    canvasCount === 1 && headerButton >= 1,
    `канвасов: ${canvasCount}, кнопка съёмки: ${headerButton}`,
  );

  console.log(`\nСнимки для глазной проверки: ${OUT_DIR}`);
} catch (err) {
  failed++;
  console.error('\nОшибка проверки:', err);
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
