/**
 * РЕНДЕР БЕЗ ИИ — PATH TRACING В БРАУЗЕРЕ (слой 54).
 *
 * Запуск: node scripts/check-render.mjs   (нужен build)
 *
 * Картинка = то, что режет цех: та же сцена, что САПР-вид (`CadScene`),
 * те же материалы и стены комнаты, только свет считается честно. Здесь
 * меряется не «красиво», а то, что можно проверить числом:
 *
 *   · кнопка «Рендер» есть над сценой и на шаге «Результат»;
 *   · прогресс растёт, рендер доходит до N проходов и отдаёт PNG ровно
 *     того размера, что выбран, и эта картинка не пустая (разброс яркости);
 *   · «Остановить» останавливает — проходов меньше N, и они больше не растут;
 *     посреди сборки шейдера — экран отпускается сразу, контекст уходит
 *     вместе с фоновым потоком, и страница не получает ни одного исключения;
 *   · интерфейс не замерзает: самый длинный разрыв главного потока за
 *     рендер — не больше секунды (таймер страницы раз в 50 мс);
 *   · готовая картинка открывается поверх сцены и закрывается;
 *   · кнопки рендера над сценой не закрывают мебель — ни прямоугольник
 *     мебели на экране, ни центр одной двери или ящика не под ними; на
 *     компьютере, планшете лёжа и стоя и телефоне, до рендера, во время
 *     и после (меряется нарисованное: `__mwCadFit` и `elementFromPoint`);
 *   · после рендера сцена в покое не рисует ни кадра, трассировщик не
 *     крутится и отпустил большие буферы; его поток и собранная программа
 *     живут, пока живёт страница, — второй рендер не собирает шейдер заново;
 *   · код рендера не едет в первую загрузку `/demo` (манифест сборки);
 *   · на настоящем объекте PNG сохранился в Storage, и кабинет клиента
 *     его показывает (организация заводится служебным ключом и удаляется).
 *
 * Видеокарта: по умолчанию настоящая (ANGLE D3D11); `SWIFTSHADER=1` —
 * программный растеризатор, он в десятки раз медленнее.
 * `PASSES` — сколько проходов просить в проверке функции (по умолчанию 16).
 * `PART=timing` — замер времени: компьютер 1920×1080 и мобильная эмуляция
 * планшета, каждый в СВОЁМ браузере — первая сборка шейдера входит в
 * цену первого рендера, и мерить её на прогретом браузере значит соврать;
 * `TIMING_PASSES` проходов (по умолчанию 256). `PART=stop` — остановка
 * посреди холодной сборки шейдера (в своём свежем браузере). `PART=demo` (демо и
 * раскладки кнопок), `PART=layout` (только раскладки) и `PART=project` —
 * по одной части; без `PART` — всё, кроме времени.
 */
import { chromium, devices } from 'playwright';
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import sharp from 'sharp';

const PORT = 3162;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/render';
const PASSES = Number(process.env.PASSES ?? 16);
const TIMING_PASSES = Number(process.env.TIMING_PASSES ?? 256);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* .env.local — ключи Supabase для сценария с настоящим объектом. */
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok   ${name}${detail ? `  ${detail}` : ''}`);
  else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? `  ${detail}` : ''}`);
  }
};

const until = async (fn, ms = 90_000, step = 300) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(step);
  }
  return false;
};

function freePort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, { encoding: 'utf8' });
    for (const pid of new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter((p) => /^\d+$/.test(p) && p !== '0'))) {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    }
  } catch {
    /* порт свободен */
  }
}

/* ─────────────  Первая загрузка /demo: ни three.js, ни трассировщика  ───────────── */

function firstLoad() {
  const manifestPath = '.next/app-build-manifest.json';
  if (!existsSync(manifestPath)) {
    check('первая загрузка /demo: сборка есть', false, 'НЕТ СБОРКИ: .next/app-build-manifest.json — сначала npm run build');
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const files = manifest.pages['/demo/page'] ?? [];
  if (files.length === 0) {
    check('первая загрузка /demo: страница есть в манифесте', false, 'НУЛЕВОЙ СЕЛЕКТОР: /demo/page нет в манифесте');
    return;
  }
  let bytes = 0;
  const engine = [];
  for (const file of files) {
    const text = readFileSync(`.next/${file}`, 'utf8');
    bytes += text.length;
    /*
     * Строки, которые переживают сжатие: имена типов three.js и имена
     * функций в шейдерах трассировщика — шейдер лежит в бандле строкой.
     */
    if (/WebGLRenderer|BufferGeometry|WebGLPathTracer|PathTracingSceneGenerator|equirectDirectionToUv/.test(text)) {
      engine.push(`${file} (${Math.round(text.length / 1024)} кБ)`);
    }
  }
  console.log(`  первая загрузка /demo: ${files.length} чанков, ${Math.round(bytes / 1024)} кБ без сжатия`);
  check(
    'код рендера и three.js не едут в первую загрузку /demo',
    engine.length === 0,
    engine.length === 0 ? `${Math.round(bytes / 1024)} кБ без сжатия` : `в первой загрузке: ${engine.join(', ')}`,
  );
}

/* ─────────────  Шаги экрана  ───────────── */

async function openScene(page) {
  await until(async () => (await page.getByRole('button', { name: /Раскладка/ }).count()) > 0, 60_000);
  await page.getByRole('button', { name: /Раскладка/ }).first().click();
  await sleep(2000);
  await page.locator('[data-schematic-tab="scene"]').click();
  await until(() => page.evaluate(() => typeof window.__mwCadFrames === 'function'), 60_000);
  await sleep(2500);
}

const readPanel = (page, scope) =>
  page.evaluate((scope) => {
    const root = document.querySelector(`${scope} [data-pathtrace]`);
    if (!root) return null;
    const img = root.querySelector('img[data-pathtrace-image]');
    return {
      state: root.getAttribute('data-state'),
      samples: Number(root.getAttribute('data-samples') ?? 'NaN'),
      passes: Number(root.getAttribute('data-passes') ?? 'NaN'),
      size: root.getAttribute('data-size'),
      saved: root.getAttribute('data-saved'),
      message: root.querySelector('[data-pathtrace-message]')?.textContent ?? '',
      image: img ? { src: img.getAttribute('src'), w: img.naturalWidth, h: img.naturalHeight, done: img.complete } : null,
    };
  }, scope);

/** Разброс яркости картинки на экране: пустая или залитая — ноль. */
const imageStats = (page, scope) =>
  page.evaluate(async (scope) => {
    const img = document.querySelector(`${scope} img[data-pathtrace-image]`);
    if (!img) return null;
    if (!img.complete) await new Promise((r) => img.addEventListener('load', r, { once: true }));
    const w = 320;
    const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    let sum2 = 0;
    const n = w * h;
    for (let i = 0; i < data.length; i += 4) {
      const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += y;
      sum2 += y * y;
    }
    const mean = sum / n;
    return { mean: Math.round(mean), std: Math.round(Math.sqrt(Math.max(0, sum2 / n - mean * mean)) * 10) / 10 };
  }, scope);

/**
 * Над сценой число проходов и размер — за кнопкой ⚙: строка кнопок не
 * имеет права закрывать мебель. На «Результате» они на виду.
 */
async function openSettings(page, scope) {
  const settings = page.locator(`${scope} [data-pathtrace-settings]`);
  if ((await page.locator(`${scope} [data-pathtrace-passes]`).count()) === 0 && (await settings.count()) > 0) {
    await settings.first().click();
  }
}

/** Выбрать число проходов и дождаться, что панель его приняла. */
async function choosePasses(page, scope, passes) {
  await openSettings(page, scope);
  const select = page.locator(`${scope} [data-pathtrace-passes]`);
  if ((await select.count()) === 0) return false;
  const values = await select.evaluate((node) => [...node.options].map((o) => o.value));
  if (!values.includes(String(passes))) return false;
  await select.selectOption(String(passes));
  return until(async () => (await readPanel(page, scope))?.passes === passes, 5000, 100);
}

/**
 * ИНТЕРФЕЙС НЕ ЗАМЕРЗАЕТ — ЧИСЛОМ, И ДВУМЯ ПРИБОРАМИ (слой 54).
 *
 * Таймер страницы каждые 50 мс отмечает, сколько прошло с прошлого раза:
 * это главный поток. Пока счёт шёл на нём, первая сборка шейдера держала
 * его 57–64 с, и «Остановить» не нажималась вовсе.
 *
 * Кадры — второй прибор, и без него замерзание прячется: закрытый
 * посреди сборки поток трассировщика остановил кадры страницы на ~38 с
 * при живом JS (ответ 2–6 мс) — экран стоял, а таймер был зелёный.
 *
 * Порог — секунда: дольше человек видит зависание.
 */
const FREEZE_LIMIT_MS = 1000;

async function watchMainThread(page) {
  await page.evaluate(() => {
    const start = performance.now();
    const gap = {
      timer: 0,
      frame: 0,
      lastTimer: start,
      lastFrame: start,
      on: true,
      /* Когда случился самый длинный разрыв и в каком состоянии была панель: «сколько» без «когда» не чинится. */
      timerAt: 0,
      timerState: '',
    };
    window.__mwGap = gap;
    window.__mwGapTimer = setInterval(() => {
      const now = performance.now();
      if (now - gap.lastTimer > gap.timer) {
        gap.timer = now - gap.lastTimer;
        gap.timerAt = gap.lastTimer - start;
        gap.timerState = document.querySelector('[data-pathtrace]')?.getAttribute('data-state') ?? '';
      }
      gap.lastTimer = now;
    }, 50);
    const frame = (now) => {
      if (!gap.on) return;
      gap.frame = Math.max(gap.frame, now - gap.lastFrame);
      gap.lastFrame = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  return () =>
    page.evaluate(() => {
      const gap = window.__mwGap;
      gap.on = false;
      clearInterval(window.__mwGapTimer);
      const now = performance.now();
      return {
        timer: Math.round(Math.max(gap.timer, now - gap.lastTimer)),
        frame: Math.round(Math.max(gap.frame, now - gap.lastFrame)),
        timerAt: Math.round(gap.timerAt / 100) / 10,
        timerState: gap.timerState,
      };
    });
}

function freezeCheck(label, gap) {
  const ok = gap.timer <= FREEZE_LIMIT_MS && gap.frame <= FREEZE_LIMIT_MS;
  check(
    `${label}: интерфейс не замерзал`,
    ok,
    `самый длинный разрыв: главного потока ${gap.timer} мс, кадров ${gap.frame} мс (предел ${FREEZE_LIMIT_MS})` +
      (ok ? '' : ` · начался на ${gap.timerAt} с, после него состояние «${gap.timerState}»`),
  );
}

/**
 * Рендер от нажатия до «готово»: прогресс обязан расти, а не прыгать
 * из нуля в конец — иначе интерфейс стоял замёрзшим.
 *
 * `viewer` — над сценой готовая картинка открывается поверх сцены и
 * закрывается кнопкой: без этого шага следующий «Рендер» лежал бы под ней.
 * `onBusy` — замер посреди счёта (один раз, на первом проходе).
 */
async function runRender(page, scope, label, passes, limitMs, { viewer = false, onBusy = null } = {}) {
  const start = page.locator(`${scope} [data-pathtrace-start]`);
  if ((await start.count()) === 0) {
    check(`${label}: кнопка «Рендер» есть`, false, `НУЛЕВОЙ СЕЛЕКТОР: ${scope} [data-pathtrace-start] нет на экране`);
    return null;
  }
  check(`${label}: кнопка «Рендер» есть`, true);
  const chosen = await choosePasses(page, scope, passes);
  check(`${label}: число проходов выбирается`, chosen, chosen ? `${passes}` : `НЕТ ВЫБОРА ${passes} В [data-pathtrace-passes]`);
  if (!chosen) return null;

  const frames0 = await page.evaluate(() => (window.__mwCadFrames ? window.__mwCadFrames() : -1));
  const readGap = await watchMainThread(page);
  const t0 = Date.now();
  await start.first().click();
  const seen = [];
  let busyMeasured = false;
  let compileFrom = 0;
  let compileMs = 0;
  const finished = await until(
    async () => {
      const panel = await readPanel(page, scope);
      if (panel && Number.isFinite(panel.samples) && seen[seen.length - 1] !== panel.samples) seen.push(panel.samples);
      if (panel?.state === 'compiling' && !compileFrom) compileFrom = Date.now();
      if (panel?.state !== 'compiling' && compileFrom && !compileMs) compileMs = Date.now() - compileFrom;
      if (onBusy && !busyMeasured && panel?.state === 'rendering' && panel.samples >= 1) {
        busyMeasured = true;
        await onBusy();
      }
      return panel?.state === 'done' || panel?.state === 'error';
    },
    limitMs,
    150,
  );
  const ms = Date.now() - t0;
  const gap = await readGap();
  freezeCheck(label, gap);
  const panel = await readPanel(page, scope);
  const growing = seen.filter((s) => s > 0 && s < passes).length;
  console.log(`  ${label}: ${panel?.state ?? 'нет панели'} за ${(ms / 1000).toFixed(1)} с, проходов ${panel?.samples} из ${passes}, размер ${panel?.size}, отметки прогресса ${seen.slice(0, 8).join(' ')}${seen.length > 8 ? ' …' : ''}`);
  check(
    `${label}: прогресс растёт по ходу, а не прыгает в конец`,
    growing >= 2,
    `промежуточных отметок ${growing}: ${seen.slice(0, 10).join(' ')}`,
  );
  check(
    `${label}: рендер дошёл до ${passes} проходов`,
    finished && panel?.state === 'done' && panel.samples >= passes,
    finished ? `${panel?.state} · ${panel?.samples} · ${panel?.message}` : `НЕ ЗАКОНЧИЛСЯ за ${limitMs / 1000} с`,
  );
  const [w, h] = (panel?.size ?? '0x0').split('x').map(Number);
  check(
    `${label}: PNG на экране того размера, что выбран`,
    Boolean(panel?.image && panel.image.w === w && panel.image.h === h && w > 0),
    panel?.image ? `картинка ${panel.image.w}×${panel.image.h} · выбрано ${panel.size}` : 'НЕТ img[data-pathtrace-image]',
  );
  const stats = await imageStats(page, scope);
  check(
    `${label}: картинка не пустая`,
    Boolean(stats && stats.std > 6 && stats.mean > 8 && stats.mean < 247),
    stats ? `яркость ${stats.mean}, разброс ${stats.std}` : 'КАРТИНКИ НЕТ',
  );
  if (onBusy) {
    check(`${label}: замер посреди счёта сделан`, busyMeasured, busyMeasured ? '' : 'СЧЁТ НЕ ЗАСТАН: состояния rendering не было');
  }
  if (viewer) await viewerShows(page, scope, label, 'картинка');
  return { ms, panel, frames0, gap, compileMs };
}

/**
 * Итог рендера над сценой — поверх сцены, и закрывается. Меряется
 * нарисованное: просмотр открыт, картинка в нём видна не нулём, после
 * «Закрыть» просмотра нет, а сцена снова под пальцем.
 */
async function viewerShows(page, scope, label, what) {
  const open = await until(
    () =>
      page.evaluate((scope) => {
        const box = document.querySelector(`${scope} [data-pathtrace-viewer]`)?.getBoundingClientRect();
        return Boolean(box && box.width > 0 && box.height > 0);
      }, scope),
    5000,
    100,
  );
  const shown = await page.evaluate((scope) => {
    const viewer = document.querySelector(`${scope} [data-pathtrace-viewer]`);
    if (!viewer) return null;
    const box = viewer.getBoundingClientRect();
    const img = viewer.querySelector('img[data-pathtrace-image]')?.getBoundingClientRect();
    return {
      box: `${Math.round(box.width)}×${Math.round(box.height)}`,
      image: img ? `${Math.round(img.width)}×${Math.round(img.height)}` : null,
      imageOk: Boolean(img && img.width > 0 && img.height > 0),
      message: viewer.querySelector('[data-pathtrace-message]')?.textContent ?? '',
    };
  }, scope);
  const ok = what === 'картинка' ? open && shown?.imageOk : open && /Остановлено/.test(shown?.message ?? '');
  check(
    `${label}: ${what === 'картинка' ? 'картинка открылась поверх сцены' : 'итог остановки назван словами поверх сцены'}`,
    Boolean(ok),
    !shown
      ? `НУЛЕВОЙ СЕЛЕКТОР: ${scope} [data-pathtrace-viewer] нет`
      : `просмотр ${shown.box} · картинка ${shown.image ?? 'НЕТ'} · ${shown.message.slice(0, 90)}`,
  );
  const close = page.locator(`${scope} [data-pathtrace-viewer-close]`);
  if ((await close.count()) === 0) {
    check(`${label}: просмотр закрывается`, false, 'НЕТ [data-pathtrace-viewer-close]');
    return;
  }
  await close.first().click();
  const closed = await until(
    () =>
      page.evaluate((scope) => {
        const box = document.querySelector(`${scope} [data-pathtrace-viewer]`)?.getBoundingClientRect();
        return !box || box.width === 0 || box.height === 0;
      }, scope),
    5000,
    100,
  );
  check(`${label}: просмотр закрывается`, closed, closed ? '' : 'ПРОСМОТР ОСТАЛСЯ НА СЦЕНЕ');
}

/**
 * КНОПКИ РЕНДЕРА НАД СЦЕНОЙ НЕ ЗАКРЫВАЮТ МЕБЕЛЬ (слой 54).
 *
 * На 390 px панель рендера легла на гарнитур целиком: все 11 дверей и
 * ящиков демо оказались под ней, тап по холодильнику запускал рендер.
 * Меряется нарисованное: всё, что стоит под `[data-scene-render]`, против
 * проекции габарита мебели (`__mwCadFit`) и центра каждой открываемой
 * детали (`elementFromPoint`). Детали вне экрана — не проверка, а ноль:
 * такой замер падает.
 */
async function chipClear(page, label) {
  const m = await page.evaluate(() => {
    const root = document.querySelector('[data-scene-render]');
    const canvas = document.querySelector('[data-schematic] canvas');
    const fit = window.__mwCadFit?.();
    if (!root || !canvas || !fit?.box) {
      return { missing: !root ? '[data-scene-render] нет' : !canvas ? 'холста сцены нет' : '__mwCadFit нет' };
    }
    const boxes = [root, ...root.querySelectorAll('*')]
      .map((el) => el.getBoundingClientRect())
      .filter((b) => b.width > 0 && b.height > 0);
    if (boxes.length === 0) return { missing: 'кнопок рендера на экране нет' };
    const chip = {
      left: Math.min(...boxes.map((b) => b.left)),
      top: Math.min(...boxes.map((b) => b.top)),
      right: Math.max(...boxes.map((b) => b.right)),
      bottom: Math.max(...boxes.map((b) => b.bottom)),
    };
    const c = canvas.getBoundingClientRect();
    const [x0, x1, y0, y1] = fit.box;
    const kitchen = {
      left: c.left + ((x0 + 1) / 2) * c.width,
      right: c.left + ((x1 + 1) / 2) * c.width,
      top: c.top + ((1 - y1) / 2) * c.height,
      bottom: c.top + ((1 - y0) / 2) * c.height,
    };
    const dx = Math.min(chip.right, kitchen.right) - Math.max(chip.left, kitchen.left);
    const dy = Math.min(chip.bottom, kitchen.bottom) - Math.max(chip.top, kitchen.top);
    const ids = window.__mwOpenableIds?.() ?? [];
    const covered = [];
    let onScreen = 0;
    for (const id of ids) {
      const p = window.__mwPartPoint?.(id);
      if (!p || p.x < 0 || p.y < 0 || p.x >= innerWidth || p.y >= innerHeight) continue;
      onScreen += 1;
      if (document.elementFromPoint(p.x, p.y)?.closest('[data-scene-render]')) covered.push(id);
    }
    const r = (b) => [b.left, b.top, b.right, b.bottom].map(Math.round).join(',');
    return {
      chip: r(chip),
      kitchen: r(kitchen),
      overlap: dx > 0 && dy > 0 ? `${Math.round(dx)}×${Math.round(dy)}` : null,
      parts: ids.length,
      onScreen,
      covered,
    };
  });
  if (m.missing) {
    check(`${label}: кнопки рендера не заходят на мебель`, false, `НУЛЕВОЙ СЕЛЕКТОР: ${m.missing}`);
    return;
  }
  check(
    `${label}: кнопки рендера не заходят на мебель`,
    m.overlap === null,
    `кнопки ${m.chip} · мебель ${m.kitchen}${m.overlap ? ` · ЗАХОДЯТ на ${m.overlap} px` : ''}`,
  );
  check(
    `${label}: ни одна дверь и ни один ящик не под кнопками`,
    m.parts > 0 && m.onScreen === m.parts && m.covered.length === 0,
    m.parts === 0
      ? 'НУЛЕВОЙ СЕЛЕКТОР: открываемых деталей нет'
      : m.onScreen < m.parts
        ? `НЕ ЗАМЕРЕНО: на экране ${m.onScreen} из ${m.parts} деталей`
        : `деталей ${m.parts} · под кнопками ${m.covered.length}${m.covered.length ? `: ${m.covered.join(', ')}` : ''}`,
  );
}

async function restIsQuiet(page, label) {
  await sleep(3000);
  const f0 = await page.evaluate(() => (window.__mwCadFrames ? window.__mwCadFrames() : -1));
  await sleep(10_000);
  const f1 = await page.evaluate(() => (window.__mwCadFrames ? window.__mwCadFrames() : -1));
  const pt = await page.evaluate(() => (window.__mwPathTrace ? window.__mwPathTrace() : null));
  check(
    `${label}: после рендера сцена в покое не рисует ни кадра`,
    f0 >= 0 && f1 - f0 === 0,
    f0 < 0 ? 'НЕТ __mwCadFrames' : `${f1 - f0} за 10 с`,
  );
  /*
   * Поток рендера живёт, пока живёт страница: уничтоженный вскоре после
   * сборки шейдера контекст останавливал кадры страницы на 38–43 с. Мерка
   * — не «контекст отдан», а «счёт не идёт и большие буферы отпущены»;
   * контекст один на страницу и держит собранную программу.
   */
  check(
    `${label}: трассировщик не крутится и отпустил большие буферы`,
    Boolean(pt) && pt.running === 0 && pt.buffers === 'released' && pt.alive <= 1,
    pt
      ? `идёт ${pt.running} · буферы ${pt.buffers} · контекстов ${pt.alive} (держит собранную программу) · создано ${pt.created}`
      : 'НЕТ __mwPathTrace',
  );
}

async function stopWorks(page, scope, label, { viewer = false } = {}) {
  const start = page.locator(`${scope} [data-pathtrace-start]`);
  if ((await start.count()) === 0) {
    check(`${label}: «Остановить»`, false, 'НЕТ КНОПКИ «Рендер»');
    return;
  }
  await openSettings(page, scope);
  await choosePasses(page, scope, Math.max(...(await page.locator(`${scope} [data-pathtrace-passes]`).evaluate((n) => [...n.options].map((o) => Number(o.value))))));
  await start.first().click();
  /*
   * Предусловие, а не мерка: жмём «Остановить», когда счёт пошёл. Сборка
   * шейдера на D3D11 — 100–185 с в первый раз и обычно 10–30 с потом, но
   * бывала и дольше 80 с; меньший срок ронял проверку, так и не нажав
   * «Остановить».
   */
  const running = await until(async () => {
    const p = await readPanel(page, scope);
    return p?.state === 'rendering' && p.samples >= 1;
  }, 240_000, 100);
  const stop = page.locator(`${scope} [data-pathtrace-stop]`);
  if (!running || (await stop.count()) === 0) {
    check(`${label}: «Остановить» есть во время рендера`, false, running ? 'НЕТ [data-pathtrace-stop]' : 'РЕНДЕР НЕ ПОШЁЛ');
    return;
  }
  await stop.first().click();
  const stopped = await until(async () => (await readPanel(page, scope))?.state === 'stopped', 10_000, 100);
  const a = await readPanel(page, scope);
  await sleep(2500);
  const b = await readPanel(page, scope);
  check(
    `${label}: «Остановить» останавливает`,
    stopped && a.samples < a.passes && b.samples === a.samples,
    `${a?.state} · проходов ${a?.samples} из ${a?.passes}, через 2.5 с ${b?.samples}`,
  );
  if (viewer) await viewerShows(page, scope, label, 'остановка');
}

/**
 * «ОСТАНОВИТЬ» ПОСРЕДИ СБОРКИ ШЕЙДЕРА (слой 54).
 *
 * Пока счёт шёл на главном потоке, остановка посреди сборки была
 * невозможна или опасна: в холодной сборке «Остановить» не нажималась
 * (главный поток стоял), а освобождение материала посреди сборки роняло
 * таймер `compileAsync` из three исключением — три «reading 'isReady'».
 * Теперь счёт в фоновом потоке: экран обязан отпуститься сразу, контекст
 * уйти вместе с потоком, а страница — не получить ни одного исключения.
 */
async function stopWhileCompiling(page, scope, label, errors, { viewer = false } = {}) {
  const start = page.locator(`${scope} [data-pathtrace-start]`);
  if ((await start.count()) === 0) {
    check(`${label}: «Остановить» посреди сборки шейдера`, false, 'НЕТ КНОПКИ «Рендер»');
    return;
  }
  const before = errors.length;
  const readGap = await watchMainThread(page);
  await start.first().click();
  const compiling = await until(async () => (await readPanel(page, scope))?.state === 'compiling', 120_000, 50);
  const stop = page.locator(`${scope} [data-pathtrace-stop]`);
  if (!compiling || (await stop.count()) === 0) {
    check(
      `${label}: сборку шейдера застали`,
      false,
      compiling ? 'НЕТ [data-pathtrace-stop]' : 'СБОРКИ НЕ ЗАСТАЛИ: состояния compiling не было 120 с',
    );
    return;
  }
  /*
   * Жмём сразу, как сборка пошла: из кэша она бывает короче секунды, и
   * пауза перед нажатием промахивалась мимо неё. Промах — не зелёный, а
   * «СБОРКА КОНЧИЛАСЬ ДО НАЖАТИЯ».
   */
  await sleep(Number(process.env.STOP_AFTER_MS ?? 0));
  const stateBefore = (await readPanel(page, scope))?.state;
  const pressedAt = Date.now();
  await stop.first().click();
  const stopped = await until(async () => (await readPanel(page, scope))?.state === 'stopped', 10_000, 100);
  const stoppedIn = Date.now() - pressedAt;
  const now = await page.evaluate(() => (window.__mwPathTrace ? window.__mwPathTrace() : null));
  check(
    `${label}: остановка посреди сборки отпускает экран сразу`,
    stateBefore === 'compiling' && stopped && now?.running === 0 && stoppedIn <= FREEZE_LIMIT_MS,
    stateBefore !== 'compiling'
      ? `СБОРКА КОНЧИЛАСЬ ДО НАЖАТИЯ: состояние ${stateBefore}`
      : `${(await readPanel(page, scope))?.state} за ${stoppedIn} мс · идёт ${now?.running}`,
  );
  const freed = await until(
    async () => (await page.evaluate(() => (window.__mwPathTrace ? window.__mwPathTrace().buffers : null))) === 'released',
    300_000,
    500,
  );
  /*
   * Окно замера — от «Рендер» до отданного контекста и ещё три секунды:
   * застой кадров начинается не на нажатии, а когда поток уходит.
   */
  await sleep(3000);
  freezeCheck(`${label}, сборка, остановка и уход потока`, await readGap());
  const after = await page.evaluate(() => (window.__mwPathTrace ? window.__mwPathTrace() : null));
  const fresh = errors.slice(before);
  check(
    `${label}: поток свободен и отпустил буферы, страница без исключений`,
    freed && fresh.length === 0,
    `буферы ${after?.buffers} · контекстов ${after?.alive} · исключений ${fresh.length}` +
      (fresh.length ? `: ${fresh[0].slice(0, 90)}` : ''),
  );
  if (viewer) await viewerShows(page, scope, label, 'остановка');
}

/* ─────────────  Сценарий: демо, над сценой и на «Результате»  ───────────── */

/** Исключения страницы копятся, а не только печатаются: их число — мерка. */
function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.log('  [ошибка страницы]', e.message.slice(0, 160));
  });
  return errors;
}

async function demoScenario(browser) {
  console.log('\n  ── демо: рендер над сценой и на шаге «Результат»');
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = collectErrors(page);
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await openScene(page);
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl ? (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'нет WebGL2';
  });
  console.log(`  видеокарта: ${renderer}`);

  const scene = '[data-scene-render]';
  const where = 'компьютер 1440×900';
  await chipClear(page, `${where}, до рендера`);
  const done = await runRender(page, scene, 'над сценой', PASSES, 600_000, {
    viewer: true,
    onBusy: () => chipClear(page, `${where}, во время рендера`),
  });
  await chipClear(page, `${where}, после рендера`);
  if (done?.panel?.image) {
    mkdirSync(OUT, { recursive: true });
    const b64 = await page.evaluate(async () => {
      const img = document.querySelector('[data-scene-render] img[data-pathtrace-image]');
      const blob = await (await fetch(img.src)).blob();
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    });
    writeFileSync(`${OUT}/demo-scene.png`, Buffer.from(b64, 'base64'));
    console.log(`  снимок: ${OUT}/demo-scene.png`);
  }
  await restIsQuiet(page, 'над сценой');
  await stopWorks(page, scene, 'над сценой', { viewer: true });
  /*
   * Остановка посреди сборки шейдера здесь не проверяется: поток и
   * собранная программа живут, пока живёт страница, и после первого
   * рендера сборки на этой странице больше нет. Она — в части `stop`, в
   * свежем браузере, где сборка холодная.
   */
  await restIsQuiet(page, 'после остановки');

  /* Шаг «Результат»: та же сцена, смонтированная на время рендера. */
  await page.getByRole('button', { name: /Результат/ }).first().click();
  await sleep(2500);
  const result = '[data-result-render]';
  const second = await runRender(page, result, '«Результат»', PASSES, 600_000);
  /*
   * Поток и собранная программа живут, пока живёт страница: второй рендер
   * не ждёт сборки шейдера (первая на D3D11 — минута и больше).
   */
  check(
    '«Результат»: второй рендер на странице не собирает шейдер заново',
    Boolean(second) && second.compileMs <= 2000,
    second ? `сборка ${second.compileMs} мс · весь рендер ${(second.ms / 1000).toFixed(1)} с` : 'РЕНДЕРА НЕТ',
  );
  const sheet = await page.evaluate(() => {
    const img = document.querySelector('img[data-sheet-pathtrace]');
    return img ? { w: img.naturalWidth, h: img.naturalHeight } : null;
  });
  check(
    '«Результат»: картинка стоит и на печатном листе',
    Boolean(sheet && sheet.w > 0),
    sheet ? `${sheet.w}×${sheet.h}` : 'НЕТ img[data-sheet-pathtrace] на листе',
  );
  const pt = await page.evaluate(() => (window.__mwPathTrace ? window.__mwPathTrace() : null));
  check(
    '«Результат»: сцена для рендера размонтирована, буферы отпущены',
    Boolean(pt) && pt.running === 0 && pt.buffers === 'released' && pt.stages === 0,
    pt ? `идёт ${pt.running} · буферы ${pt.buffers} · сцен рендера ${pt.stages} · контекстов ${pt.alive}` : 'НЕТ __mwPathTrace',
  );
  check(
    'демо: за весь прогон страница без исключений',
    errors.length === 0,
    errors.length ? `исключений ${errors.length}: ${errors[0].slice(0, 90)}` : '0',
  );
  await page.close();
}

/* ─────────────  Сценарий: остановка посреди первой сборки шейдера  ───────────── */

/**
 * В свежем браузере сборка шейдера холодная и длится минуты: остановка
 * гарантированно попадает в неё. Следом — полный рендер: после остановки
 * посреди сборки он обязан идти как прежде, и экран при этом не замерзать.
 */
async function stopScenario(browser) {
  console.log('\n  ── остановка посреди холодной сборки шейдера и рендер после неё');
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = collectErrors(page);
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await openScene(page);
  const scene = '[data-scene-render]';
  await stopWhileCompiling(page, scene, 'холодная сборка', errors, { viewer: true });
  await runRender(page, scene, 'рендер после остановки', PASSES, 600_000, { viewer: true });
  check(
    'остановки: страница без исключений',
    errors.length === 0,
    errors.length ? `исключений ${errors.length}: ${errors[0].slice(0, 90)}` : '0',
  );
  await page.close();
}

/* ─────────────  Сценарий: кнопки над сценой на планшете и телефоне  ───────────── */

/**
 * Свободное место на сцене зависит от экрана: на широком кухня вписана
 * по высоте и справа от неё полоса, на телефоне — по ширине, и свободен
 * только верх. Поэтому раскладка кнопок проверяется на каждом: палец
 * планшета и телефона — это `hasTouch`, от него и размер 1280×720.
 */
async function layoutScenario(browser) {
  console.log('\n  ── кнопки рендера над сценой: планшет лёжа и стоя, телефон');
  /*
   * Страницы закрываются все вместе в конце, а не каждая следом за своим
   * рендером: закрытая вскоре после холодной сборки шейдера страница
   * уносит с собой поток рендера, и его контекст, уничтоженный, пока
   * драйвер ещё доделывает программу, задерживал кадры уже соседней
   * страницы (замерено: «Раскладка» не дождалась кадров 30 с).
   */
  const opened = [];
  for (const [name, options] of [
    ['планшет 1180×820', { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true }],
    ['планшет стоя 834×1194', { viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true }],
    ['телефон 390×844', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
  ]) {
    const context = await browser.newContext(options);
    opened.push(context);
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('  [ошибка страницы]', e.message.slice(0, 160)));
    await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await openScene(page);
    /* Сцена на телефоне ниже полосы кнопок: детали мерить там, где они на экране. */
    await page.locator('[data-schematic] canvas').first().scrollIntoViewIfNeeded();
    await sleep(800);
    await chipClear(page, `${name}, до рендера`);
    await runRender(page, '[data-scene-render]', name, PASSES, 600_000, {
      viewer: true,
      onBusy: () => chipClear(page, `${name}, во время рендера`),
    });
    await chipClear(page, `${name}, после рендера`);
  }
  for (const context of opened) await context.close();
}

/* ─────────────  Сценарий: настоящий объект — Storage и кабинет клиента  ───────────── */

async function projectScenario(browser) {
  console.log('\n  ── объект: PNG сохраняется с объектом, кабинет клиента его показывает (тест 7)');
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !ANON || !SERVICE || /your-project|example/.test(URL)) {
    check('тест 7: Supabase доступен', false, 'НЕ ПРОВЕРЕНО: нет ключей в .env.local');
    return;
  }
  const service = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = Date.now();
  const email = `render-${stamp}@example.test`;
  const password = `Pw-${stamp}-render!`;
  const made = { user: null, org: null, project: null };

  try {
    const { data: created, error: userError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (userError) throw new Error(`createUser: ${userError.message}`);
    made.user = created.user.id;
    const { data: org, error: orgError } = await service
      .from('orgs')
      .insert({ slug: `render-${stamp}`, name: `Проверка рендера ${stamp}` })
      .select('id')
      .single();
    if (orgError) throw new Error(`insert org: ${orgError.message}`);
    made.org = org.id;
    const { error: memberError } = await service.from('org_members').insert({ org_id: org.id, user_id: created.user.id, role: 'owner' });
    if (memberError) throw new Error(`insert member: ${memberError.message}`);

    const jar = [];
    const ssr = createServerClient(URL, ANON, {
      cookies: {
        getAll: () => jar.map(({ name, value }) => ({ name, value })),
        setAll: (list) => {
          for (const cookie of list) {
            const at = jar.findIndex((c) => c.name === cookie.name);
            if (at >= 0) jar.splice(at, 1);
            if (cookie.value) jar.push(cookie);
          }
        },
      },
    });
    const { error: signError } = await ssr.auth.signInWithPassword({ email, password });
    if (signError) throw new Error(`signIn: ${signError.message}`);

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies(
      jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' })),
    );
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('  [ошибка страницы]', e.message.slice(0, 160)));
    const seeded = await page.request.post(`${BASE}/api/catalog/seed-rates`, { data: { orgId: org.id } });
    check('типовой прайс заведён организации', seeded.ok(), `${seeded.status()}`);

    const { data: project, error: projectError } = await service
      .from('projects')
      .insert({
        org_id: org.id,
        address: 'Проверка рендера',
        zone: 'Кухня',
        client_name: 'Проверка',
        measurements: {
          id: `m-${stamp}`,
          ceilingHeightMm: 2700,
          walls: [
            {
              id: 'a',
              lengthMm: 3800,
              angleDeg: 90,
              openings: [{ id: 'win', kind: 'window', fromCornerMm: 1500, widthMm: 900, sillMm: 850, heightMm: 1400 }],
            },
            { id: 'b', lengthMm: 2400, angleDeg: 90, openings: [] },
          ],
          comms: [],
          photos: [],
          measuredBy: 'проверка',
          measuredAt: new Date().toISOString(),
          notes: '',
        },
        millwork: { templateId: 'linear-column' },
        status: 'in_progress',
      })
      .select('id, share_token')
      .single();
    if (projectError) throw new Error(`insert project: ${projectError.message}`);
    made.project = project.id;

    /*
     * Фото помещения: без него сравнения «до и после» в кабинете нет, и
     * проверка «рендер по чертежу туда не попал» прошла бы над пустотой.
     */
    const photo = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#9a948a' } }).jpeg().toBuffer();
    const photoPath = `${org.id}/${project.id}/photo-check.jpg`;
    const { error: photoError } = await service.storage.from('projects').upload(photoPath, photo, { contentType: 'image/jpeg' });
    if (photoError) throw new Error(`upload photo: ${photoError.message}`);
    const { error: photoRowError } = await service.from('projects').update({ source_photo_path: photoPath }).eq('id', project.id);
    if (photoRowError) throw new Error(`set photo: ${photoRowError.message}`);

    await page.goto(`${BASE}/project/${project.id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await openScene(page);
    const scene = '[data-scene-render]';
    const done = await runRender(page, scene, 'объект', PASSES, 600_000, { viewer: true });
    const saved = await until(async () => (await readPanel(page, scene))?.saved === '1', 60_000, 250);
    const panel = await readPanel(page, scene);
    check('тест 7: PNG сохранён с объектом', saved, saved ? '' : `НЕ СОХРАНИЛОСЬ: ${panel?.message}`);

    const { data: rows } = await service
      .from('renders')
      .select('id, style_id, image_path, duration_ms')
      .eq('project_id', project.id);
    const row = (rows ?? []).find((r) => r.style_id === 'pathtrace');
    let file = null;
    if (row) {
      const { data: blob } = await service.storage.from('projects').download(row.image_path);
      file = blob ? Buffer.from(await blob.arrayBuffer()) : null;
    }
    const meta = file ? await sharp(file).metadata() : null;
    const stats = file ? await sharp(file).stats() : null;
    const std = stats ? stats.channels.slice(0, 3).reduce((s, c) => s + c.stdev, 0) / 3 : 0;
    const [w, h] = (done?.panel?.size ?? '0x0').split('x').map(Number);
    check(
      'тест 7: в Storage лежит PNG выбранного размера, и он не пустой',
      Boolean(row && meta && meta.format === 'png' && meta.width === w && meta.height === h && std > 6),
      row
        ? `${row.image_path} · ${meta?.format} ${meta?.width}×${meta?.height} · разброс ${std.toFixed(1)} · ${row.duration_ms} мс`
        : `НЕТ СТРОКИ renders со style_id pathtrace: строк ${(rows ?? []).length}`,
    );

    /* Второй рендер заменяет первый: копить картинки нельзя (ловушка 152). */
    await runRender(page, scene, 'объект, повторно', PASSES, 600_000, { viewer: true });
    await until(async () => (await readPanel(page, scene))?.saved === '1', 60_000, 250);
    const { data: again } = await service.from('renders').select('id, image_path').eq('project_id', project.id).eq('style_id', 'pathtrace');
    const { data: listed } = await service.storage.from('projects').list(`${org.id}/${project.id}`);
    const files = (listed ?? []).filter((f) => f.name.startsWith('pathtrace-'));
    check(
      'повторный рендер заменяет прежний: строка одна и файл один',
      (again ?? []).length === 1 && files.length === 1,
      `строк ${(again ?? []).length} · файлов ${files.length}`,
    );

    /* Кабинет клиента показывает ту же картинку. */
    const offer = await context.newPage();
    await offer.goto(`${BASE}/p/${project.share_token}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const shown = await until(
      () =>
        offer.evaluate(() => {
          const img = document.querySelector('img[data-client-pathtrace]');
          return Boolean(img && img.complete && img.naturalWidth > 0);
        }),
      60_000,
    );
    const client = await offer.evaluate(() => {
      const img = document.querySelector('img[data-client-pathtrace]');
      return img ? { src: img.getAttribute('src'), w: img.naturalWidth, h: img.naturalHeight } : null;
    });
    check(
      'тест 7: кабинет клиента показывает рендер',
      shown && Boolean(client?.src?.includes((again ?? [])[0]?.image_path ?? '∅')),
      client ? `${client.w}×${client.h} · ${client.src?.split('/').slice(-1)[0]}` : 'НЕТ img[data-client-pathtrace] в кабинете',
    );
    const compare = await offer.evaluate(() => {
      const block = document.querySelector('[data-before-after]');
      const after = block?.querySelector('img[data-before-after-render]');
      return { block: Boolean(block), after: after?.getAttribute('src') ?? null };
    });
    check(
      'рендер по чертежу не подменяет фото в сравнении «до и после»',
      compare.block && !/pathtrace-/.test(compare.after ?? ''),
      !compare.block
        ? 'НУЛЕВОЙ СЕЛЕКТОР: сравнения [data-before-after] в кабинете нет — проверять не на чем'
        : `справа в сравнении: ${compare.after ? compare.after.split('/').slice(-1)[0] : 'пусто — рендера по фото нет'}`,
    );

    /* Перезагрузка объекта: сохранённая картинка возвращается на «Результат». */
    await page.goto(`${BASE}/project/${project.id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await until(async () => (await page.getByRole('button', { name: /Результат/ }).count()) > 0, 60_000);
    await page.getByRole('button', { name: /Результат/ }).first().click();
    const back = await until(
      () =>
        page.evaluate(() => {
          const img = document.querySelector('[data-result-render] img[data-pathtrace-image]');
          return Boolean(img && img.complete && img.naturalWidth > 0 && /pathtrace-/.test(img.getAttribute('src') ?? ''));
        }),
      60_000,
    );
    check('после перезагрузки объект показывает сохранённый рендер на «Результате»', back);
    await context.close();
  } catch (error) {
    check('тест 7: сценарий объекта прошёл', false, error instanceof Error ? error.message : String(error));
  } finally {
    if (made.project && made.org) {
      const { data: listed } = await service.storage.from('projects').list(`${made.org}/${made.project}`);
      const paths = (listed ?? []).map((f) => `${made.org}/${made.project}/${f.name}`);
      if (paths.length) await service.storage.from('projects').remove(paths);
      await service.from('projects').delete().eq('id', made.project);
    }
    if (made.org) await service.from('orgs').delete().eq('id', made.org);
    if (made.user) await service.auth.admin.deleteUser(made.user);
  }
}

/* ─────────────  Время рендера: компьютер и мобильная эмуляция  ───────────── */

async function timing(launch) {
  console.log(`\n  ── время рендера демо, ${TIMING_PASSES} проходов, каждый в своём браузере`);
  /* `TIMING_DEVICE=desktop|tablet` — по одному: два рендера по 256 проходов не влезают в один вызов. */
  const only = process.env.TIMING_DEVICE;
  if (only && only !== 'desktop' && only !== 'tablet') {
    check('TIMING_DEVICE известен', false, `НЕИЗВЕСТНЫЙ TIMING_DEVICE=${only}: desktop, tablet`);
    return;
  }
  for (const [name, options, key] of [
    ['компьютер 1440×900', { viewport: { width: 1440, height: 900 } }, 'desktop'],
    ['планшет (эмуляция iPad Pro 11)', devices['iPad Pro 11 landscape'] ?? devices['iPad Pro 11'], 'tablet'],
  ]) {
    if (only && key !== only) continue;
    const own = await launch();
    const context = await own.newContext(options);
    const page = await context.newPage();
    await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await openScene(page);
    /* Сборка шейдера — отдельным числом: это цена первого рендера. */
    const compile = { from: 0, to: 0 };
    const watch = setInterval(async () => {
      const state = await page
        .evaluate(() => document.querySelector('[data-scene-render] [data-pathtrace]')?.getAttribute('data-state'))
        .catch(() => null);
      if (state === 'compiling' && !compile.from) compile.from = Date.now();
      if (state === 'rendering' && compile.from && !compile.to) compile.to = Date.now();
    }, 200);
    const got = await runRender(page, '[data-scene-render]', name, TIMING_PASSES, 900_000, { viewer: true });
    clearInterval(watch);
    const compileS = compile.from && compile.to ? ((compile.to - compile.from) / 1000).toFixed(1) : '—';
    console.log(
      `  ВРЕМЯ ${name}: всего ${got ? (got.ms / 1000).toFixed(1) : '—'} с, из них сборка шейдера ${compileS} с · ` +
        `${got?.panel?.size} · ${got?.panel?.message}`,
    );
    await own.close();
  }
}

/* ─────────────  Прогон  ───────────── */

freePort(PORT);
firstLoad();
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: true,
  env: { ...process.env, SITE_PASSWORD: '' },
});
let browser;
try {
  await until(async () => {
    try {
      return (await fetch(BASE)).ok;
    } catch {
      return false;
    }
  }, 120_000, 1000);
  const launch = () =>
    chromium.launch({
      args:
        process.env.SWIFTSHADER === '1'
          ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
          : ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'],
    });
  if (process.env.PART === 'timing') {
    await timing(launch);
  } else {
    browser = await launch();
    const part = process.env.PART ?? 'all';
    /* Опечатка в PART не должна давать «ПАДЕНИЙ: 0» над непрогнанным. */
    if (!['all', 'demo', 'layout', 'stop', 'project'].includes(part)) {
      check('PART известен', false, `НЕИЗВЕСТНЫЙ PART=${part}: all, demo, layout, stop, project, timing`);
    }
    /* Холодная сборка — только в свежем браузере: прогретый держит программу в кэше. */
    if (part === 'all' || part === 'stop') {
      const fresh = await launch();
      try {
        await stopScenario(fresh);
      } finally {
        await fresh.close();
      }
    }
    if (part === 'all' || part === 'demo') await demoScenario(browser);
    if (part === 'all' || part === 'demo' || part === 'layout') await layoutScenario(browser);
    if (part === 'all' || part === 'project') await projectScenario(browser);
  }
} catch (error) {
  check('прогон дошёл до конца', false, error instanceof Error ? error.message : String(error));
} finally {
  await browser?.close();
  server.kill();
  freePort(PORT);
}
console.log(`ПАДЕНИЙ: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
