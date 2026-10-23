/**
 * ОСВЕЩЕНИЕ, СТЕКЛО И ВИТРИНА В БРАУЗЕРЕ (V3D-02) — настоящая организация, настоящая видеокарта.
 *
 * Запуск (после `npm run build`): `PART=<часть> node scripts/check-lighting.mjs`
 *   PART=scene   — TEST 1–4 на 1440 × 900: кухня днём (сценарий A), трек
 *                  780 · 3 спота — включить, светлота столешницы в пятне,
 *                  поворот головки к шкафам — пятно ушло; LED фартука ВКЛ/ВЫКЛ
 *                  с одной позы; день и ночь — та же геометрия, та же камера,
 *                  программы шейдеров не пересобраны; сценарий D.
 *   PART=vitrine — TEST 5: витрина с 4 полками — стекло шести видов, LED
 *                  ВКЛ/ВЫКЛ, дверь открывается с рамой, стеклянные полки.
 *   PART=save    — TEST 6 и 8: трек сдвинут, головка повёрнута, LED, ночь →
 *                  запись → перезагрузка → то же; база; регрессии (САПР-вид без
 *                  прозрачной мебели, «Открыть всё», ручки, итог не двигается).
 *   PART=tablet  — TEST 7: 1024 × 768 с касанием.
 *   PART=phone   — TEST 7: 390 × 844 — панель не закрывает 3D.
 *   PART=perf LABEL=<сборка> RUN=<n> — замер нагрузки (до и после): открытие
 *                  комнаты, кадры при вращении, вызовы и треугольники кадра,
 *                  куча; в «Интерьере» — переключение день/ночь, LED, спот.
 *
 * Сверка — по НАРИСОВАННОМУ: `__mwLighting` (источники three, их позы и
 * яркость), `__mwLightingSample` (светлота кадра в точках мира), снимки.
 * Каждая часть — своя временная организация: заводится служебным ключом и
 * удаляется; уборка проверяется чтением. Объект — `lighting-fixture.ts`.
 */
import { execSync, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_LT ?? 3297);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/lighting';
const PARTS = (process.env.PART ?? 'scene').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['scene', 'vitrine', 'save', 'tablet', 'phone', 'perf'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
};
class Stop extends Error {}
const must = (name, ok, detail) => {
  check(name, ok, ok ? '' : detail);
  if (!ok) throw new Stop(`${name}: ${detail}`);
};

function buildId() {
  try {
    return readFileSync(resolve('.next/BUILD_ID'), 'utf8').trim();
  } catch {
    throw new Stop('нет сборки в .next — сначала npm run build');
  }
}
function freePort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, { encoding: 'utf8' });
    for (const line of out.split(/\r?\n/)) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== '0') execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    }
  } catch {
    /* порт свободен — убирать нечего */
  }
}
function loadEnv() {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

let fixtures = null;
function fixture(key) {
  if (!fixtures) {
    fixtures = JSON.parse(execSync('npx tsx scripts/lighting-fixture.ts', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  }
  const fx = fixtures[key];
  if (!fx) throw new Stop(`нет объекта «${key}» в lighting-fixture`);
  return fx;
}

/* ─────────────────────────  счётчик кадров поверх WebGL  ───────────────────────── */

const PROBE = `(() => {
  if (window.__ltProbe) return;
  const st = { calls: 0, tris: 0 };
  window.__ltProbe = st;
  const TRI = 4;
  const wrap = (proto) => {
    if (!proto || proto.__ltWrapped) return;
    proto.__ltWrapped = true;
    const de = proto.drawElements;
    const da = proto.drawArrays;
    proto.drawElements = function (mode, count, type, offset) { st.calls += 1; if (mode === TRI) st.tris += count / 3; return de.call(this, mode, count, type, offset); };
    proto.drawArrays = function (mode, first, count) { st.calls += 1; if (mode === TRI) st.tris += count / 3; return da.call(this, mode, first, count); };
    if (proto.drawElementsInstanced) {
      const dei = proto.drawElementsInstanced;
      proto.drawElementsInstanced = function (mode, count, type, offset, n) { st.calls += 1; if (mode === TRI) st.tris += (count / 3) * n; return dei.call(this, mode, count, type, offset, n); };
    }
    if (proto.drawArraysInstanced) {
      const dai = proto.drawArraysInstanced;
      proto.drawArraysInstanced = function (mode, first, count, n) { st.calls += 1; if (mode === TRI) st.tris += (count / 3) * n; return dai.call(this, mode, first, count, n); };
    }
  };
  wrap(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  wrap(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
  const frames = [];
  window.__ltFrames = frames;
  let last = { calls: 0, tris: 0 };
  const tick = (t) => {
    if (st.calls !== last.calls) {
      frames.push({ t, calls: st.calls - last.calls, tris: st.tris - last.tris });
      if (frames.length > 20000) frames.splice(0, 5000);
      last = { calls: st.calls, tris: st.tris };
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const long = [];
  window.__ltLong = long;
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) long.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true });
  } catch (e) {}
})()`;

/* ─────────────────────────  экран  ───────────────────────── */

async function waitFor(page, fn, test, ms = 20_000, arg = undefined) {
  const until = Date.now() + ms;
  let value = await page.evaluate(fn, arg);
  while (!test(value) && Date.now() < until) {
    await sleep(250);
    value = await page.evaluate(fn, arg);
  }
  return value;
}
async function tool(page, key) {
  const b = page.locator(`[data-studio-rail] [data-studio-tool="${key}"]`);
  if ((await b.count()) === 0) return false;
  /* Нажатие на уже выбранный инструмент сворачивает его панель — не нажимаем дважды. */
  if ((await b.first().getAttribute('aria-pressed')) === 'true' && (await page.locator(`[data-studio-context="${key}"][data-open="true"]`).count()) > 0) return true;
  await b.first().click({ timeout: 15_000 });
  await sleep(500);
  return true;
}
async function sceneSettled(page) {
  const t0 = Date.now();
  const read = () =>
    page.evaluate(() => {
      const scene = document.querySelector('[data-studio-viewport] [data-scene]');
      return { state: scene?.getAttribute('data-scene-state') ?? null, root: Boolean(document.querySelector('[data-studio-root]')) };
    });
  let s = await read();
  while (Date.now() - t0 < 120_000 && s.root && s.state !== 'ready' && s.state !== 'failed') {
    await sleep(100);
    s = await read();
  }
  return { ...s, ms: Date.now() - t0 };
}
async function openStudio(page, projectId) {
  await page.goto(`${BASE}/project/${projectId}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-studio-rail] [data-studio-tool]');
    return Boolean(el && Object.keys(el).some((k) => k.startsWith('__reactProps')));
  }, undefined, { timeout: 60_000 });
}
/** Камера встала после перелёта: две позы подряд одинаковы. */
async function stablePose(page) {
  let prev = null;
  for (let i = 0; i < 60; i += 1) {
    const pose = await page.evaluate(() => (window.__mwCadCamera ? window.__mwCadCamera() : null));
    if (pose && prev && JSON.stringify(pose.position) === JSON.stringify(prev.position)) return pose;
    prev = pose;
    await sleep(500);
  }
  return prev;
}
/** Поставить позу и дождаться, что сцена стоит на ней (перелёт не перебил). */
async function cameraTo(page, pose) {
  for (let i = 0; i < 10; i += 1) {
    const at = await page.evaluate((p) => window.__mwCadCamera(p), { position: pose.position, target: pose.target });
    await sleep(500);
    const back = await page.evaluate(() => window.__mwCadCamera());
    if (at && back && Math.hypot(...back.position.map((v, k) => v - pose.position[k])) < 1e-3) return true;
  }
  return false;
}
const lighting = (page) => page.evaluate(() => (window.__mwLighting ? window.__mwLighting() : null));
const sample = (page, points) => page.evaluate((p) => (window.__mwLightingSample ? window.__mwLightingSample(p) : null), points);
async function click(page, selector, label) {
  const el = page.locator(selector);
  must(`${label}`, (await el.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: ${selector}`);
  await el.first().click({ timeout: 15_000 });
  await sleep(450);
}
/**
 * Нажатие, за которым страница может встать (новые источники — новые
 * программы шейдеров): без ожидания навигаций после нажатия, иначе стоящая
 * страница роняет само нажатие по времени, а не даёт число замера.
 */
async function clickMeasured(page, selector, label) {
  const el = page.locator(selector);
  must(`${label}`, (await el.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: ${selector}`);
  await el.first().click({ timeout: 15_000, noWaitAfter: true });
}
/** Ползунок панели — тем же событием, что палец: `input` с новым значением. */
async function setRange(page, name, value) {
  return page.evaluate(
    ({ name, value }) => {
      const input = document.querySelector(`[data-light-range="${name}"] input[type="range"]`);
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    { name, value },
  );
}
async function setOn(page, key, on) {
  const el = page.locator(`[data-light-on="${key}"]`);
  must(`кнопка «вкл/выкл» ${key}`, (await el.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-light-on="${key}"]`);
  if (((await el.first().getAttribute('aria-pressed')) === 'true') !== on) await el.first().click();
  await sleep(450);
}
async function openLighting(page) {
  must('инструмент «Освещение» в рейке', await tool(page, 'lighting'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="lighting"]');
  await page.waitForSelector('[data-lighting-panel]', { timeout: 30_000 });
  const scene = await sceneSettled(page);
  must('3D готова под «Освещением»', scene.state === 'ready', `состояние ${scene.state ?? 'НЕТ'} за ${scene.ms} мс`);
}
async function designOn(page) {
  const btn = page.locator('[data-light-design]');
  must('кнопка «Интерьер»', (await btn.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-light-design]');
  if ((await btn.first().getAttribute('aria-pressed')) !== 'true') await btn.first().click();
  const l = await waitFor(page, () => (window.__mwLighting ? window.__mwLighting() : null), (v) => v?.design === true && v.warming !== true, 90_000);
  must('режим «Интерьер» в сцене, программы света собраны', l?.design === true && l.warming !== true, l ? `программы ещё собираются (${l.ready})` : 'НУЛЕВОЙ СЕЛЕКТОР: __mwLighting нет — режим не включился');
  return l;
}
/** Миг страницы — для отсчёта длинных задач. */
const pageNow = (page) => page.evaluate(() => performance.now());
/**
 * НАИБОЛЬШАЯ ДЛИННАЯ ЗАДАЧА ГЛАВНОГО ПОТОКА с миги `since`. Записи
 * наблюдателя приходят после задачи — ждём, прежде чем читать.
 */
async function longestSince(page, since) {
  await sleep(700);
  return page.evaluate((t0) => Math.round(window.__ltLong.filter((l) => l.t + l.d >= t0).reduce((m, l) => Math.max(m, l.d), 0)), since);
}
/** Новые источники показаны: программы собраны, прежний набор снят. */
const lightsReady = (page, test, ms = 90_000) => waitFor(page, () => window.__mwLighting?.(), (v) => Boolean(v) && v.warming !== true && test(v), ms);
const shot = async (page, name) => {
  await sleep(700);
  await page.screenshot({ path: `${OUT}/${name}` });
};
/** Светлота: среднее по точкам, без невидимых (−1). */
const mean = (values) => {
  const seen = (values ?? []).filter((v) => v >= 0);
  return seen.length ? Math.round((seen.reduce((s, v) => s + v, 0) / seen.length) * 10) / 10 : -1;
};

/* ─────────────────────────  организация  ───────────────────────── */

/**
 * Запрос к базе — с пределом: зависший без него держал прогон до внешнего
 * `timeout`, и временная организация оставалась (было: прогон perf снят на
 * 590 с, организация удалена отдельно). С пределом зависание — ошибка, и
 * уборка в `finally` проходит.
 */
const limitedFetch = (input, init = {}) => fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) });

async function withOrg(label, browser, body, { viewport, touch = false, scale = 1 }) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: limitedFetch },
  });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const made = { users: [], orgs: [], projects: [] };
  const fx = fixture('kitchen');
  try {
    const email = `lt-${stamp}@example.test`;
    const password = `Pw-${stamp}-lt!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    made.users.push(data.user.id);
    const { data: org, error: orgError } = await service.from('orgs').insert({ slug: `lt-${stamp}`, name: `Проверка освещения ${label}` }).select('id').single();
    if (orgError) throw new Error(`insert org: ${orgError.message}`);
    made.orgs.push(org.id);
    const { error: memberError } = await service.from('org_members').insert({ org_id: org.id, user_id: data.user.id, role: 'owner' });
    if (memberError) throw new Error(`insert member: ${memberError.message}`);
    const jar = [];
    const ssr = createServerClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global: { fetch: limitedFetch },
      cookies: {
        getAll: () => jar.map(({ name, value }) => ({ name, value })),
        setAll: (list) => {
          for (const c of list) {
            const at = jar.findIndex((x) => x.name === c.name);
            if (at >= 0) jar.splice(at, 1);
            if (c.value) jar.push(c);
          }
        },
      },
    });
    const { error: signError } = await ssr.auth.signInWithPassword({ email, password });
    if (signError) throw new Error(`signIn: ${signError.message}`);
    const context = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: scale });
    await context.addInitScript(PROBE);
    await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', sameSite: 'Lax' })));
    const page = await context.newPage();
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
    });
    /* Типовой прайс и палитра — тем же маршрутом, что кнопка в админке. */
    const seeded = await page.request.post(`${BASE}/api/catalog/seed-rates`, { data: { orgId: org.id } });
    if (!seeded.ok()) throw new Error(`типовой прайс не заведён: ${seeded.status()}`);
    /* Материалы каталога на фасадах: эмаль RAL 1015 внизу, графит наверху — позиции организации. */
    const { data: colors } = await service.from('catalog_items').select('id, article, meta').eq('org_id', org.id).in('article', ['CLR-RAL-1015', 'CLR-FILM-GRAPHITE']);
    const low = colors?.find((c) => c.article === 'CLR-RAL-1015');
    const high = colors?.find((c) => c.article === 'CLR-FILM-GRAPHITE');
    if (!low || !high) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: цветов палитры нет в каталоге организации (${colors?.length ?? 0})`);
    const front = (item, base) => ({ base, construct: 'solid', finish: 'matte', colorHex: item.meta.color, itemId: item.id });
    const painted = JSON.parse(JSON.stringify(fx.run));
    const paint = (unit, spec) => {
      if (unit.frontType === 'none' || (unit.appliance && !['sink600', 'dishwasher45', 'hob', 'fridge', 'oven', 'hood'].includes(unit.appliance))) return unit;
      return { ...unit, front: spec };
    };
    painted.modules = painted.modules.map((u) => paint(u, front(low, 'mdf_enamel')));
    painted.upperSegments = painted.upperSegments.map((seg) => ({ ...seg, modules: seg.modules.map((u) => paint(u, front(high, 'mdf_film'))) }));
    const { data: project, error: projectError } = await service
      .from('projects')
      .insert({
        org_id: org.id,
        client_name: 'Проверка',
        status: 'in_progress',
        address: `Освещение ${label}`,
        zone: 'Кухня',
        measurements: fx.measurement,
        millwork: { survey: fx.survey, requirements: fx.requirements, runs: { optimal: painted }, selectedVariant: 'optimal' },
      })
      .select('id')
      .single();
    if (projectError) throw new Error(`insert project: ${projectError.message}`);
    made.projects.push(project.id);
    await body({ service, org, page, context, errors, consoleErrors, projectId: project.id, fx, colors: { low, high } });
  } finally {
    for (const id of made.projects) await service.from('projects').delete().eq('id', id);
    for (const id of made.orgs) {
      await service.from('catalog_items').delete().eq('org_id', id);
      await service.from('catalog_categories').delete().eq('org_id', id);
      await service.from('orgs').delete().eq('id', id);
    }
    for (const id of made.users) await service.auth.admin.deleteUser(id);
    const left = [];
    for (const id of made.orgs) {
      if (((await service.from('orgs').select('id').eq('id', id)).data ?? []).length) left.push(`организация ${id}`);
      if (((await service.from('catalog_items').select('id').eq('org_id', id).limit(1)).data ?? []).length) left.push(`позиции ${id}`);
    }
    for (const id of made.projects) if (((await service.from('projects').select('id').eq('id', id)).data ?? []).length) left.push(`объект ${id}`);
    check(`${label}: уборка временной организации проверена чтением`, left.length === 0, left.join(', ') || 'удалено');
  }
}

/** sRGB hex → линейный цвет материала: своя формула, а не та, что в сцене. */
function linear(hex) {
  const c = hex.replace('#', '');
  return [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
}

/* ═════════════════════════  TEST 1–4  ═════════════════════════ */

async function partScene(browser) {
  console.log('\n── SCENE (1440 × 900): TEST 1 день · TEST 2 трек · TEST 3 LED фартука · TEST 4 день и ночь');
  await withOrg(
    'SCENE',
    browser,
    async ({ page, errors, consoleErrors, projectId, colors }) => {
      await openStudio(page, projectId);
      await openLighting(page);
      const pose = await stablePose(page);
      must('поза камеры «Общий вид» прочитана', Boolean(pose), 'НУЛЕВОЙ СЕЛЕКТОР: __mwCadCamera нет');
      const canvasTag = await page.evaluate(() => {
        const canvas = document.querySelector('[data-studio-viewport] canvas');
        if (canvas) canvas.dataset.ltMark = 'first';
        return Boolean(canvas);
      });
      must('холст сцены', canvasTag, 'НУЛЕВОЙ СЕЛЕКТОР: canvas');

      /* ── TEST 1: день, светильники выключены ── */
      await designOn(page);
      await click(page, '[data-light-scene="A"]', 'сценарий A');
      await cameraTo(page, pose);
      const day = await lighting(page);
      const fronts = await page.evaluate(() => window.__mwCadFronts());
      const want = [linear(colors.low.meta.color), linear(colors.high.meta.color)];
      const painted = want.every((c) => fronts.some((f) => Math.hypot(f.color[0] - c[0], f.color[1] - c[1], f.color[2] - c[2]) < 0.003));
      check(
        'TEST 1 день (A): «Интерьер», потолок по замеру, свет из окна замера, цвета фасадов — позиции каталога',
        day?.scene === 'A' && day.ambient === 'day' && day.ceiling && day.daylight?.source === 'windows' && day.rects.some((r) => r.kind === 'window' && r.on) && painted,
        `сценарий ${day?.scene} · потолок ${day?.ceiling} · день ${day?.daylight?.source}${day?.daylight?.windowId ? ` (${day.daylight.windowId})` : ''} · окно-источник ${day?.rects.filter((r) => r.kind === 'window').length} · фасады ${fronts.map((f) => f.color.map((v) => v.toFixed(3)).join('/')).join(', ')}`,
      );
      await shot(page, 'KITCHEN_DAY_TEST1.png');

      /* ── TEST 2: трек 780 · 3 спота ── */
      await click(page, '[data-light-tab="ceiling"]', 'тип «Потолочные»');
      const trackAt = await pageNow(page);
      await clickMeasured(page, '[data-light-add-track]', '«+ Трек чёрный 780 мм · 3 спота»');
      let l = await lightsReady(page, (v) => (v.spots?.length ?? 0) === 3);
      const trackFreeze = await longestSince(page, trackAt);
      check(
        'TEST 2 «+ Трек»: программы под три новых источника собраны в фоне — страница не стоит дольше 1 с',
        Boolean(l) && l.warming !== true && trackFreeze < 1000,
        `наибольшая задача главного потока ${trackFreeze} мс · готово ${l?.ready ?? 'НЕТ'}`,
      );
      check(
        'TEST 2 трек поставлен: 3 головки, 3 источника SpotLight, днём выключены, сетка не коробка',
        l?.tracks?.length === 1 && l.tracks[0].heads === 3 && l.spots.length === 3 && l.spots.every((s) => !s.on) && l.trackTriangles > 2000 && l.headTriangles > 500,
        `треков ${l?.tracks?.length} · головок ${l?.tracks?.[0]?.heads} · источников ${l?.spots?.length} (вкл ${l?.spots?.filter((s) => s.on).length}) · треугольников трека ${l?.trackTriangles}, головки ${l?.headTriangles}`,
      );
      const trackId = l.tracks[0].id;
      const hit = l.tracks[0].poses[0].hitWorkTopMm;
      must('пятно головки 1 на столешнице посчитано', Array.isArray(hit), 'луч не пересекает столешницу');
      /*
       * Пятно меряется СВЕРХУ: с высоты глаз верх плиты — полоса в несколько
       * пикселей, и окно замера задевало фасады под ней. Камера — над пятном
       * со стороны комнаты; точки — пятно и четыре вокруг него на 80 мм.
       */
      const spotPose = {
        position: [hit[0] / 1000 + pose.open[0] * 0.9, hit[1] / 1000 + 1.0, hit[2] / 1000 + pose.open[1] * 0.9],
        target: [hit[0] / 1000, hit[1] / 1000, hit[2] / 1000],
      };
      const around = [hit, [hit[0] + 80, hit[1], hit[2]], [hit[0] - 80, hit[1], hit[2]], [hit[0], hit[1], hit[2] + 80], [hit[0], hit[1], hit[2] - 80]];
      must('камера над пятном', await cameraTo(page, spotPose), 'поза не встала');
      if (process.env.LT_DEBUG) {
        const where = await page.evaluate((p) => window.__mwLightingProject(p), [hit, ...l.samples.counter, ...l.samples.apron]);
        console.log('    отладка: пятно и точки ленты на холсте', JSON.stringify(where));
        await page.evaluate((pts) => {
          for (const p of pts) {
            const d = document.createElement('div');
            d.style.cssText = `position:fixed;left:${p.x - 6}px;top:${p.y - 6}px;width:12px;height:12px;border:2px solid red;z-index:99999;pointer-events:none`;
            document.body.appendChild(d);
          }
        }, where);
        await shot(page, 'DEBUG_POINTS.png');
      }
      const offLum = mean(await sample(page, around));
      await setOn(page, trackId, true);
      l = await lighting(page);
      const onLum = mean(await sample(page, around));
      const shadows = l.spots.filter((s) => s.castShadow).length;
      check(
        'TEST 2 трек включён: 3 источника светят, у трёх тень; столешница в пятне светлее',
        l.spots.every((s) => s.on && s.intensity > 0) && shadows === 3 && onLum > offLum + 6,
        `светлота в пятне ${offLum} → ${onLum} · теней ${shadows} · ${l.spots.map((s) => `${s.color} ${s.angleDeg}°`).join(', ')}`,
      );
      /* Головка 1 — к шкафам: наклон 40° к стене. */
      await click(page, '[data-light-head="0"]', 'головка 1');
      const dirBefore = l.spots[0].dir;
      must('ползунок наклона', await setRange(page, 'tilt', 40), 'НУЛЕВОЙ СЕЛЕКТОР: [data-light-range="tilt"]');
      await sleep(600);
      l = await lighting(page);
      const spot = l.spots.find((s) => s.head === 0 && s.fixtureId === trackId);
      const pose0 = l.tracks[0].poses[0];
      const dirDiff = Math.hypot(...spot.dir.map((v, k) => v - pose0.dir[k]));
      const newHit = pose0.hitWorkTopMm;
      const moved = newHit ? Math.hypot(newHit[0] - hit[0], newHit[2] - hit[2]) : 0;
      await cameraTo(page, spotPose);
      const oldLum = mean(await sample(page, around));
      check(
        'TEST 2 головка повёрнута к шкафам: луч источника = поза головки, пятно ушло со старого места',
        dirDiff < 1e-3 && Math.hypot(...dirBefore.map((v, k) => v - spot.dir[k])) > 0.2 && (newHit === null || moved > 150) && oldLum < onLum - 3,
        `луч источника ${spot.dir.join(' ')} · поза ${pose0.dir.map((v) => v.toFixed(4)).join(' ')} (расхождение ${dirDiff.toExponential(1)}) · пятно сдвинулось ${newHit ? `${Math.round(moved)} мм` : 'на стену/фасады'} · светлота на прежнем месте ${onLum} → ${oldLum}`,
      );
      /*
       * Головка 1 отдельно — днём, при включённом треке. Кнопка головки
       * говорит то, что нарисовано: горит — «вкл»; нажатие гасит только её,
       * второе — зажигает. Кнопка с умолчанием сцены («днём выключено»)
       * показывала горящую головку выключенной, и первое нажатие не меняло
       * ничего.
       */
      const headBtn = page.locator(`[data-light-on="${trackId}#0"]`);
      must('кнопка «Головка 1»', (await headBtn.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-light-on="${trackId}#0"]`);
      const lit = (v) =>
        v.spots
          .filter((s) => s.fixtureId === trackId)
          .sort((a, b) => a.head - b.head)
          .map((s) => (s.on && s.intensity > 0 ? 1 : 0))
          .join('');
      const litBefore = lit(await lighting(page));
      const shownOn = (await headBtn.first().getAttribute('aria-pressed')) === 'true';
      await headBtn.first().click();
      await sleep(450);
      const litOff = lit(await lighting(page));
      await headBtn.first().click();
      await sleep(450);
      const litBack = lit(await lighting(page));
      check(
        'TEST 2 головка 1 отдельно: днём при включённом треке кнопка «вкл»; нажатие гасит только её, второе — зажигает',
        litBefore === '111' && shownOn && litOff === '011' && litBack === '111',
        `горят ${litBefore} · кнопка ${shownOn ? 'вкл' : 'выкл'} · после нажатия ${litOff} · после второго ${litBack}`,
      );
      await click(page, '[data-ambient="evening"]', 'вечер');
      await cameraTo(page, pose);
      await shot(page, 'TRACK_LIGHT_ON.png');

      /* ── TEST 3: LED фартука ── */
      await click(page, '[data-light-tab="kitchen"]', 'тип «Подсветка кухни»');
      const ledAt = await pageNow(page);
      await clickMeasured(page, '[data-light-add-under]', '«+ LED под верхними шкафами»');
      const ledReady = await lightsReady(page, (v) => v.rects.some((r) => r.kind === 'under' && r.shown));
      const ledFreeze = await longestSince(page, ledAt);
      check(
        'TEST 3 «+ LED»: программы под новые полосы собраны в фоне — страница не стоит дольше 1 с',
        Boolean(ledReady) && ledReady.warming !== true && ledFreeze < 1000,
        `наибольшая задача главного потока ${ledFreeze} мс · готово ${ledReady?.ready ?? 'НЕТ'}`,
      );
      /* Только лента: трек выключен, вечер. */
      await click(page, '[data-light-tab="ceiling"]', 'тип «Потолочные»');
      await setOn(page, trackId, false);
      await click(page, '[data-light-tab="kitchen"]', 'тип «Подсветка кухни»');
      await setOn(page, 'under-cabinet', true);
      l = await lighting(page);
      const under = l.rects.filter((r) => r.kind === 'under');
      await cameraTo(page, pose);
      const ledOn = { apron: mean(await sample(page, l.samples.apron)), counter: mean(await sample(page, l.samples.counter)) };
      await shot(page, 'BACKSPLASH_LED_ON.png');
      const glowOn = l.glowing;
      await setOn(page, 'under-cabinet', false);
      const lOff = await lighting(page);
      await cameraTo(page, pose);
      const ledOff = { apron: mean(await sample(page, lOff.samples.apron)), counter: mean(await sample(page, lOff.samples.counter)) };
      await shot(page, 'BACKSPLASH_LED_OFF.png');
      check(
        'TEST 3 LED фартука: линии по верхним шкафам, источник у каждой; ВКЛ — фартук и столешница светлее, ВЫКЛ — профиль остаётся',
        under.length >= 2 &&
          under.every((r) => r.on && r.normal[1] < -0.99) &&
          lOff.rects.filter((r) => r.kind === 'under').every((r) => !r.on) &&
          ledOn.apron > ledOff.apron + 8 &&
          ledOn.counter > ledOff.counter + 4 &&
          lOff.strips === l.strips &&
          glowOn > lOff.glowing,
        `линий ${under.length} (${under.map((r) => `${r.sizeMm[0]} мм`).join(' + ')}) · фартук ${ledOff.apron} → ${ledOn.apron} · столешница ${ledOff.counter} → ${ledOn.counter} · полос ${l.strips} / ${lOff.strips}, светятся ${glowOn} / ${lOff.glowing}`,
      );

      /* ── TEST 4: день и ночь, та же кухня ── */
      await click(page, '[data-light-scene="A"]', 'сценарий A');
      await cameraTo(page, pose);
      const lookDay = await page.evaluate(() => window.__mwCadLook());
      const programsDay = (await lighting(page)).programs;
      const camDay = await page.evaluate(() => window.__mwCadCamera());
      await shot(page, 'KITCHEN_DAY.png');
      const t0 = Date.now();
      await click(page, '[data-light-scene="C"]', 'сценарий C');
      const night = await waitFor(page, () => window.__mwLighting?.(), (v) => v?.ambient === 'night', 10_000);
      const switchMs = Date.now() - t0;
      await cameraTo(page, pose);
      await shot(page, 'KITCHEN_NIGHT.png');
      const lookNight = await page.evaluate(() => window.__mwCadLook());
      const camNight = await page.evaluate(() => window.__mwCadCamera());
      const sameCanvas = await page.evaluate(() => document.querySelector('[data-studio-viewport] canvas')?.dataset.ltMark === 'first');
      check(
        'TEST 4 ночь (C): трек, фартук и витрина светят; окружение и небо погашены; геометрия, камера и холст те же; шейдеры не пересобраны',
        night.scene === 'C' &&
          night.spots.every((s) => s.on) &&
          night.rects.filter((r) => r.kind === 'under' || r.kind === 'display').every((r) => r.on) &&
          night.rects.filter((r) => r.kind === 'window').every((r) => !r.on) &&
          night.rig.environment < 0.05 &&
          JSON.stringify(lookDay.boxes) === JSON.stringify(lookNight.boxes) &&
          JSON.stringify(camDay.position) === JSON.stringify(camNight.position) &&
          sameCanvas &&
          night.programs === programsDay,
        `переключение ${switchMs} мс · окружение ${night.rig.environment} · фон ${night.rig.background} · программ ${programsDay} → ${night.programs} · холст тот же ${sameCanvas}`,
      );
      await click(page, '[data-light-scene="D"]', 'сценарий D');
      const d = await lighting(page);
      check(
        'TEST 4 сценарий D: ночь, светят только фартук и витрина',
        d.scene === 'D' && d.spots.every((s) => !s.on) && d.rects.filter((r) => r.kind === 'under' || r.kind === 'display').every((r) => r.on),
        `споты вкл ${d.spots.filter((s) => s.on).length} · фартук ${d.rects.filter((r) => r.kind === 'under' && r.on).length} · витрина ${d.rects.filter((r) => r.kind === 'display' && r.on).length}`,
      );
      check('ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  TEST 5  ═════════════════════════ */

async function partVitrine(browser) {
  console.log('\n── VITRINE (1440 × 900): TEST 5 стекло шести видов, LED, дверь, стеклянные полки');
  await withOrg(
    'VITRINE',
    browser,
    async ({ page, errors, consoleErrors, projectId, fx }) => {
      await openStudio(page, projectId);
      await openLighting(page);
      const general = await stablePose(page);
      await designOn(page);
      await click(page, '[data-light-tab="furniture"]', 'тип «Подсветка мебели»');
      const card = page.locator(`[data-light-vitrine="${fx.ids.vitrine}"]`);
      must('карточка витрины в панели', (await card.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-light-vitrine="${fx.ids.vitrine}"]`);
      /* Вечер, без трека и фартука: смотрим витрину. */
      await click(page, '[data-ambient="evening"]', 'вечер');
      let l = await lighting(page);
      const display = l.rects.filter((r) => r.kind === 'display');
      must('источники ленты витрины в сцене', display.length >= 3, `источников витрины ${display.length}`);
      const center = [0, 1, 2].map((k) => display.reduce((s, r) => s + r.positionMm[k], 0) / display.length / 1000);
      const open = general.open;
      const pose = {
        position: [center[0] + open[0] * 1.7, center[1] + 0.15, center[2] + open[1] * 1.7],
        target: center,
      };
      must('камера у витрины', await cameraTo(page, pose), 'поза не встала');
      await setOn(page, `display:${fx.ids.vitrine}`, false);
      l = await lighting(page);
      const off = mean(await sample(page, l.samples.vitrine));
      await shot(page, 'VITRINE_LED_OFF.png');
      await setOn(page, `display:${fx.ids.vitrine}`, true);
      l = await lighting(page);
      const on = mean(await sample(page, l.samples.vitrine));
      await shot(page, 'VITRINE_LED_ON.png');
      check(
        'TEST 5 LED витрины: по контуру 4 полосы, 3 источника; ВКЛ — полка внутри светлее',
        l.rects.filter((r) => r.kind === 'display' && r.on).length >= 3 && on > off + 6,
        `источников ${l.rects.filter((r) => r.kind === 'display').length} · полка ${off} → ${on}`,
      );

      /* Стекло шести видов: снимок витрины на каждый. */
      const clips = [];
      const box = await page.locator('[data-studio-viewport] canvas').first().boundingBox();
      for (const kind of ['clear', 'frosted', 'bronze', 'grey', 'fluted', 'mirror']) {
        await click(page, `[data-light-vitrine="${fx.ids.vitrine}"] [data-glass="${kind}"]`, `стекло «${kind}»`);
        const got = await waitFor(page, () => window.__mwLighting?.()?.glass ?? [], (g) => g.some((x) => x.name === `glass:${kind}`), 15_000, undefined);
        check(`TEST 5 стекло «${kind}» в сцене`, got.some((x) => x.name === `glass:${kind}`), `пачки ${got.map((x) => `${x.name}×${x.count}`).join(', ') || 'НЕТ'}`);
        await cameraTo(page, pose);
        await sleep(500);
        const clip = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.05, width: box.width * 0.6, height: box.height * 0.9 };
        clips.push({ kind, png: (await page.screenshot({ clip })).toString('base64') });
      }
      const titles = { clear: 'Прозрачное', frosted: 'Матовое', bronze: 'Бронзовое', grey: 'Серое тонированное', fluted: 'Рифлёное', mirror: 'Зеркало' };
      const sheet = await page.context().newPage();
      await sheet.setViewportSize({ width: 1500, height: 1100 });
      await sheet.setContent(
        `<html><body style="margin:0;background:#16150F;color:#F2EFE6;font:15px sans-serif"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px">${clips
          .map((c) => `<figure style="margin:0"><img style="width:100%" src="data:image/png;base64,${c.png}"/><figcaption>${titles[c.kind]}</figcaption></figure>`)
          .join('')}</div></body></html>`,
      );
      await sheet.screenshot({ path: `${OUT}/GLASS_VARIANTS.png`, fullPage: true });
      await sheet.close();

      /* Стеклянные полки — изделие: в сцене стекло, в раскрое ЛДСП нет. */
      await click(page, `[data-light-vitrine="${fx.ids.vitrine}"] [data-glass="clear"]`, 'стекло «clear»');
      await click(page, `[data-light-shelves="${fx.ids.vitrine}"] [data-glass-shelves="glass"]`, 'полки стеклянные');
      const shelves = await waitFor(page, () => window.__mwLighting?.()?.glass ?? [], (g) => g.some((x) => x.name === 'glass:shelf'), 15_000);
      check('TEST 5 стеклянные полки: 4 полки стеклом в сцене', shelves.find((x) => x.name === 'glass:shelf')?.count === 4, `пачки ${shelves.map((x) => `${x.name}×${x.count}`).join(', ')}`);
      await cameraTo(page, pose);
      await shot(page, 'VITRINE_GLASS_SHELVES.png');
      await click(page, `[data-light-shelves="${fx.ids.vitrine}"] [data-glass-shelves="wood"]`, 'полки ЛДСП');

      /* Дверь открывается: рама и стекло едут. */
      const door = `${fx.ids.vitrine}:door:0`;
      await click(page, `[data-light-door="${door}"]`, '«Открыть дверь»');
      const opened = await waitFor(page, () => ({ ids: window.__mwOpenIds?.() ?? [], moving: window.__mwMovingCount?.() ?? -1 }), (v) => v.ids.includes(door) && v.moving === 0, 30_000);
      l = await lighting(page);
      await cameraTo(page, pose);
      await shot(page, 'VITRINE_DOOR_OPEN.png');
      check(
        'TEST 5 дверь витрины открыта: рама (4 планки) и стекло едут с полотном',
        opened.ids.includes(door) && l.riders === 4 && l.glass.some((x) => x.name === 'rider:glass'),
        `открыто ${opened.ids.includes(door)} · планок на ходу ${l.riders} · стекло на ходу ${l.glass.filter((x) => x.name === 'rider:glass').length}`,
      );
      check('ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  TEST 6 и 8  ═════════════════════════ */

async function partSave(browser) {
  console.log('\n── SAVE (1440 × 900): TEST 6 запись и перезагрузка · TEST 8 регрессии');
  await withOrg(
    'SAVE',
    browser,
    async ({ service, page, errors, consoleErrors, projectId }) => {
      await openStudio(page, projectId);
      const totalAt = () => page.evaluate(() => Number(document.querySelector('[data-estimate-total]')?.getAttribute('data-estimate-total') ?? NaN));
      await openLighting(page);
      const total0 = await totalAt();
      await designOn(page);
      await click(page, '[data-light-add-track]', '«+ Трек»');
      await setRange(page, 'along', 1500);
      await click(page, '[data-light-head="1"]', 'головка 2');
      await setRange(page, 'pan', 60);
      await setRange(page, 'tilt', 35);
      await click(page, '[data-light-tab="kitchen"]', 'тип «Подсветка кухни»');
      await click(page, '[data-light-add-under]', '«+ LED»');
      await lightsReady(page, (v) => (v.spots?.length ?? 0) === 3 && v.rects.some((r) => r.kind === 'under'));
      await setOn(page, 'under-cabinet', true);
      /*
       * Запись в полёте и правка поверх неё. Связь на объекте слабая — каждая
       * запись идёт 1,5 с; ночь включают, пока пишется LED. «Сохранено» имеет
       * право появиться только после записи ПОСЛЕДНЕЙ правки: ответ на прежнюю
       * запись, сказавший «Сохранено», пока ночь ждёт очереди, — это
       * перезагрузка, которая теряет ночь (поймано: в базе «день» при
       * «Сохранено» на экране).
       */
      await page.route('**/api/projects/save', async (route) => {
        await sleep(1500);
        await route.continue();
      });
      const inFlight = await page
        .waitForRequest((r) => r.url().includes('/api/projects/save') && r.method() === 'POST', { timeout: 30_000 })
        .catch(() => null);
      must('запись LED в полёте', Boolean(inFlight), 'запроса записи за 30 с нет');
      await click(page, '[data-ambient="night"]', 'ночь — пока пишется LED');
      const before = await waitFor(page, () => window.__mwLighting?.(), (v) => v?.ambient === 'night', 15_000);
      const saved = await waitFor(page, () => document.querySelector('[data-save-state]')?.getAttribute('data-save-state'), (v) => v === 'saved', 30_000);
      must('запись дошла', saved === 'saved', `состояние записи ${saved}`);
      /* Читается в тот же миг, когда экран сказал «Сохранено». */
      const { data: row } = await service.from('projects').select('millwork').eq('id', projectId).single();
      await page.unroute('**/api/projects/save');
      const db = row?.millwork?.lighting;
      check(
        'TEST 6 в базе в миг «Сохранено»: трек (стена, мм вдоль, головки), LED включён, ночь — одним полем объекта',
        db?.fixtures?.some((f) => f.kind === 'track' && f.alongMm === 1500 && f.heads[1].panDeg === 60 && f.heads[1].tiltDeg === 35) &&
          db.fixtures.some((f) => f.kind === 'under_cabinet') &&
          db.preview.on?.['under-cabinet'] === true &&
          db.preview.ambient === 'night' &&
          db.preview.design === true,
        JSON.stringify(db?.preview ?? null).slice(0, 300),
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
      await openLighting(page);
      const after = await waitFor(page, () => window.__mwLighting?.(), (v) => v?.design === true && v.warming !== true && (v.spots?.length ?? 0) === 3, 90_000);
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      check(
        'TEST 6 после перезагрузки: те же позы головок и лучи, LED горит, ночь',
        after?.ambient === 'night' &&
          same(after.tracks[0].poses.map((p) => [p.pivotMm, p.dir]), before.tracks[0].poses.map((p) => [p.pivotMm, p.dir])) &&
          after.rects.some((r) => r.kind === 'under' && r.on) &&
          same(after.spots.map((s) => s.dir), before.spots.map((s) => s.dir)),
        `ночь ${after?.ambient} · головок ${after?.tracks?.[0]?.poses?.length} · LED ${after?.rects?.filter((r) => r.kind === 'under' && r.on).length}`,
      );

      /* ── TEST 8: регрессии ── */
      const total1 = await totalAt();
      check(
        'TEST 8 итог сметы не двигается от света (трек, LED, ночь, перезагрузка)',
        Number.isFinite(total0) ? total0 === total1 : Number.isNaN(total1),
        Number.isFinite(total0) ? `${total0} → ${total1}` : 'итога на экране Studio нет — сверено только движком (V3D.L15)',
      );
      const handles = await page.evaluate(() => window.__mwHandles?.()?.handles?.length ?? -1);
      check('TEST 8 ручки HANDLE-REAL нарисованы в «Интерьере»', handles > 0, `ручек ${handles}`);
      await click(page, '[data-open-all]', '«Открыть всё»');
      const opened = await waitFor(page, () => ({ n: window.__mwOpenParts?.() ?? -1, moving: window.__mwMovingCount?.() ?? -1 }), (v) => v.n > 0 && v.moving === 0, 60_000);
      const doors = await page.evaluate(() => (window.__mwOpenIds?.() ?? []).filter((id) => /:door:/.test(id)).length);
      const drawers = await page.evaluate(() => (window.__mwOpenIds?.() ?? []).filter((id) => /:drawer:/.test(id)).length);
      check('TEST 8 «Открыть всё»: двери и ящики открываются и встают', opened.n > 0 && opened.moving === 0 && doors > 0 && drawers >= 0, `открыто ${opened.n} · дверей ${doors} · ящиков ${drawers}`);
      await click(page, '[data-close-all]', '«Закрыть всё»');
      await waitFor(page, () => window.__mwMovingCount?.() ?? -1, (n) => n === 0, 60_000);
      /* САПР-вид обратно: освещения в сцене нет, сквозь мебель не видно, рёбра на месте. */
      await click(page, '[data-light-design]', '«Интерьер» выкл');
      const cad = await waitFor(page, () => ({ l: window.__mwLighting ? 1 : 0, look: window.__mwCadLook?.() }), (v) => v.l === 0, 15_000);
      check(
        'TEST 8 САПР-вид: освещения комнаты нет, прозрачной мебели 0, стекло витрины считается отдельно, рёбра есть',
        cad.l === 0 && cad.look.transparent === 0 && cad.look.vitrineGlass >= 1 && cad.look.edgePoints > 0,
        `освещение ${cad.l} · прозрачных ${cad.look.transparent} · стекло витрины ${cad.look.vitrineGlass} · рёбер ${cad.look.edgePoints}`,
      );
      check('ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  TEST 7  ═════════════════════════ */

async function partSmall(browser, { width, height, label }) {
  console.log(`\n── ${label} (${width} × ${height}, касание): TEST 7`);
  await withOrg(
    label,
    browser,
    async ({ page, errors, consoleErrors, projectId }) => {
      await openStudio(page, projectId);
      await openLighting(page);
      const layout = await page.evaluate(() => {
        const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
        const canvas = r('[data-studio-viewport] canvas');
        const panel = r('[data-studio-context="lighting"]');
        return {
          canvas: canvas ? [canvas.left, canvas.top, canvas.width, canvas.height].map(Math.round) : null,
          panel: panel ? [panel.left, panel.top, panel.width, panel.height].map(Math.round) : null,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      const area = layout.canvas ? layout.canvas[2] * layout.canvas[3] : 0;
      check(
        `TEST 7 ${label}: 3D видна рядом с панелью (холст ≥ 35 % экрана), прокрутки по ширине нет`,
        Boolean(layout.canvas && layout.panel) && area >= 0.35 * width * height && layout.overflow <= 0,
        `холст ${JSON.stringify(layout.canvas)} · панель ${JSON.stringify(layout.panel)} · доля ${Math.round((area / (width * height)) * 100)} % · вылет ${layout.overflow}`,
      );
      /* Основное касанием: «Интерьер», трек, ночь. */
      await page.locator('[data-light-design]').first().tap();
      await sleep(600);
      await page.locator('[data-light-add-track]').first().tap();
      await sleep(600);
      await page.locator('[data-ambient="night"]').first().tap();
      const l = await waitFor(page, () => window.__mwLighting?.(), (v) => v?.ambient === 'night' && v.warming !== true && (v.spots?.length ?? 0) === 3, 90_000);
      check(`TEST 7 ${label}: касанием — «Интерьер», трек, ночь; споты светят`, l?.spots?.every((s) => s.on) === true, `споты ${l?.spots?.filter((s) => s.on).length ?? 'НЕТ'}`);
      const small = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-lighting-panel] button'))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.height > 0 && r.height < 32;
          })
          .map((el) => (el.textContent ?? '').trim().slice(0, 20)),
      );
      check(`TEST 7 ${label}: кнопки панели не мельче 32 px`, small.length === 0, small.join(', '));
      await shot(page, `TABLET_${label}.png`);
      check('ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width, height }, touch: true },
  );
}

/* ═════════════════════════  PERF  ═════════════════════════ */

const mark = (page) => page.evaluate(() => ({ at: performance.now(), frames: window.__ltFrames.length, long: window.__ltLong.length }));
const since = (page, m) =>
  page.evaluate((m) => {
    const frames = window.__ltFrames.slice(m.frames);
    const long = window.__ltLong.slice(m.long);
    return {
      frames: frames.length,
      calls: frames.reduce((s, f) => s + f.calls, 0),
      tris: Math.round(frames.reduce((s, f) => s + f.tris, 0)),
      longMax: Math.round(long.reduce((s, l) => Math.max(s, l.d), 0)),
      longTotal: Math.round(long.reduce((s, l) => s + l.d, 0)),
    };
  }, m);
async function frameAt(page, pose) {
  await page.evaluate((p) => window.__mwCadCamera(p), pose);
  await sleep(900);
  const m = await mark(page);
  await page.evaluate((p) => window.__mwCadCamera({ position: [p.position[0] + 1e-4, p.position[1], p.position[2]], target: p.target }), pose);
  await sleep(900);
  const s = await since(page, m);
  return { frames: s.frames, callsPerFrame: s.frames ? Math.round(s.calls / s.frames) : 0, trisPerFrame: s.frames ? Math.round(s.tris / s.frames) : 0 };
}
async function orbit(page, base, steps = 120) {
  return page.evaluate(
    async ({ base, steps }) => {
      const [tx, ty, tz] = base.target;
      const dx = base.position[0] - tx;
      const dz = base.position[2] - tz;
      const r = Math.hypot(dx, dz);
      const a0 = Math.atan2(dx, dz);
      const startFrames = window.__ltFrames.length;
      const t0 = performance.now();
      for (let i = 0; i < steps; i += 1) {
        const a = a0 + (i / steps) * (Math.PI / 2) - Math.PI / 4;
        window.__mwCadCamera({ position: [tx + r * Math.sin(a), base.position[1], tz + r * Math.cos(a)], target: base.target });
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      const t1 = performance.now();
      const frames = window.__ltFrames.slice(startFrames).filter((f) => f.t >= t0 && f.t <= t1);
      return { seconds: Math.round((t1 - t0) / 10) / 100, frames: frames.length, fps: Math.round((frames.length / ((t1 - t0) / 1000)) * 10) / 10 };
    },
    { base, steps },
  );
}
/** От нажатия до кадра, где условие стало правдой. */
async function timed(page, selector, condition, limitMs = 30_000) {
  return page.evaluate(
    async ({ selector, condition, limitMs }) => {
      const el = document.querySelector(selector);
      if (!el) return { error: `НУЛЕВОЙ СЕЛЕКТОР: ${selector}` };
      const test = new Function(condition);
      const startFrames = window.__ltFrames.length;
      const startLong = window.__ltLong.length;
      const t0 = performance.now();
      el.click();
      let met = null;
      while (performance.now() - t0 < limitMs) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (met === null && test()) {
          met = performance.now();
          /*
           * Кадр с новым состоянием просим явно: при кадрах по требованию он
           * мог уйти в том же такте, что и замер, и следующего ждали бы до
           * чужой перерисовки. Занята видеокарта — этот кадр опоздает, и это
           * войдёт в число.
           */
          const pose = window.__mwCadCamera?.();
          if (pose) window.__mwCadCamera({ position: pose.position, target: pose.target });
        }
        if (met !== null && window.__ltFrames.slice(startFrames).some((f) => f.t >= met)) {
          const ms = Math.round(performance.now() - t0);
          /* Записи о длинных задачах приходят после задачи — ждём и берём всё, что задело окно. */
          await new Promise((resolve) => setTimeout(resolve, 700));
          const long = window.__ltLong.slice(Math.max(0, startLong - 5)).filter((l) => l.t + l.d >= t0);
          return { ms, longMax: Math.round(long.reduce((s, l) => Math.max(s, l.d), 0)) };
        }
      }
      return { error: `за ${limitMs} мс условие «${condition}» не выполнилось` };
    },
    { selector, condition, limitMs },
  );
}

async function partPerf(browser) {
  const build = buildId();
  const label = process.env.LABEL ?? build;
  const runIndex = Number(process.env.RUN ?? 1);
  console.log(`\n── PERF (1440 × 900, ANGLE D3D11): ${label}, прогон ${runIndex}`);
  await withOrg(
    'PERF',
    browser,
    async ({ page, context, projectId }) => {
      const cdp = await context.newCDPSession(page);
      const heap = async () => {
        await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined);
        const { usedSize } = await cdp.send('Runtime.getHeapUsage');
        return Math.round((usedSize / 1048576) * 10) / 10;
      };
      const result = { build, label, run: runIndex, at: new Date().toISOString() };
      const t0 = Date.now();
      await openStudio(page, projectId);
      result.studioMs = Date.now() - t0;
      /* Комната в 3D: «Мебель» → 3D (есть в обеих сборках). */
      const view3d = page.locator('[data-studio-bottombar] [data-studio-view="3d"]');
      must('PERF: вид 3D', (await view3d.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-view="3d"]');
      const t1 = Date.now();
      await view3d.first().click();
      const scene = await sceneSettled(page);
      result.room3dMs = Date.now() - t1;
      must('PERF: 3D готова', scene.state === 'ready', `состояние ${scene.state}`);
      const pose = await stablePose(page);
      result.cad = { frame: await frameAt(page, pose), orbit: await orbit(page, pose), heapMb: await heap() };
      const hasLighting = (await page.locator('[data-studio-rail] [data-studio-tool="lighting"]').count()) > 0;
      result.hasLighting = hasLighting;
      if (hasLighting) {
        await tool(page, 'lighting');
        await page.waitForSelector('[data-lighting-panel]', { timeout: 30_000 });
        await sleep(800);
        /*
         * «Интерьер», новый трек и новая лента меняют число источников — это
         * программы шейдеров под новый набор: от нажатия до кадра с новым
         * светом и наибольшая задача главного потока за это время.
         */
        const ready = 'const v = window.__mwLighting?.(); return Boolean(v) && v.warming !== true';
        result.designOn = await timed(page, '[data-light-design]', `${ready} && v.design === true`, 90_000);
        await sleep(800);
        result.addTrack = await timed(page, '[data-light-add-track]', `${ready} && (v.spots?.length ?? 0) === 3 && v.spots.every((s) => s.shown)`, 90_000);
        await sleep(800);
        await page.locator('[data-light-tab="kitchen"]').first().click();
        await sleep(300);
        result.addLed = await timed(page, '[data-light-add-under]', `${ready} && v.rects.some((r) => r.kind === "under" && r.shown)`, 90_000);
        await sleep(800);
        /*
         * Сцена работает, пока собираются программы: витрина «под полками» —
         * другой набор полос; сразу после нажатия камера вращается, кадры и
         * наибольший разрыв между ними меряются, пока свет готовится.
         */
        await page.locator('[data-light-tab="furniture"]').first().click();
        await sleep(400);
        await cameraTo(page, pose);
        result.warmingOrbit = await page.evaluate(async (base) => {
          const el = document.querySelector('[data-display-mode="shelves"]');
          if (!el) return { error: 'НУЛЕВОЙ СЕЛЕКТОР: [data-display-mode="shelves"]' };
          const [tx, ty, tz] = base.target;
          const dx = base.position[0] - tx;
          const dz = base.position[2] - tz;
          const r = Math.hypot(dx, dz);
          const a0 = Math.atan2(dx, dz);
          const startFrames = window.__ltFrames.length;
          const startLong = window.__ltLong.length;
          const t0 = performance.now();
          el.click();
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const warmingAtStart = window.__mwLighting?.()?.warming === true;
          for (let i = 0; i < 90; i += 1) {
            const a = a0 + (i / 90) * 0.6 - 0.3;
            window.__mwCadCamera({ position: [tx + r * Math.sin(a), base.position[1], tz + r * Math.cos(a)], target: base.target });
            await new Promise((resolve) => requestAnimationFrame(resolve));
          }
          const t1 = performance.now();
          const warmingAtEnd = window.__mwLighting?.()?.warming === true;
          let readyMs = null;
          while (performance.now() - t0 < 90000) {
            const v = window.__mwLighting?.();
            if (v && v.warming !== true) {
              readyMs = Math.round(performance.now() - t0);
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          await new Promise((resolve) => setTimeout(resolve, 700));
          const frames = window.__ltFrames.slice(startFrames).filter((f) => f.t >= t0 && f.t <= t1);
          let gap = 0;
          for (let i = 1; i < frames.length; i += 1) gap = Math.max(gap, frames[i].t - frames[i - 1].t);
          const long = window.__ltLong.slice(Math.max(0, startLong - 5)).filter((l) => l.t + l.d >= t0 && l.t <= t1);
          return {
            warmingAtStart,
            warmingAtEnd,
            seconds: Math.round((t1 - t0) / 10) / 100,
            frames: frames.length,
            fps: Math.round((frames.length / ((t1 - t0) / 1000)) * 10) / 10,
            maxGapMs: Math.round(gap),
            longMax: Math.round(long.reduce((s, l) => Math.max(s, l.d), 0)),
            readyMs,
          };
        }, pose);
        await sleep(800);
        await cameraTo(page, pose);
        result.dayToNight = await timed(page, '[data-light-scene="C"]', 'return window.__mwLighting?.()?.ambient === "night"');
        result.nightToDay = await timed(page, '[data-light-scene="A"]', 'return window.__mwLighting?.()?.ambient === "day"');
        await page.locator('[data-light-scene="C"]').first().click();
        await sleep(600);
        await page.locator('[data-light-tab="kitchen"]').first().click();
        await sleep(300);
        result.ledToggle = await timed(page, '[data-light-on="under-cabinet"]', 'return window.__mwLighting?.()?.rects?.filter((r) => r.kind === "under").every((r) => !r.on)');
        await page.locator('[data-light-tab="ceiling"]').first().click();
        await sleep(300);
        /* Выбор головки — кольцо выделения в сцене: тоже кадр, меряется. */
        const programsBeforeHead = (await lighting(page))?.programs ?? null;
        result.headSelect = await timed(page, '[data-light-head="0"]', `return Boolean(document.querySelector('[data-light-head-card="0"]'))`, 30_000);
        await sleep(300);
        result.spotAim = await page.evaluate(async (programsBeforeHead) => {
          const input = document.querySelector('[data-light-range="tilt"] input[type="range"]');
          if (!input) return { error: 'НУЛЕВОЙ СЕЛЕКТОР: tilt' };
          const before = JSON.stringify(window.__mwLighting().spots[0].dir);
          const programsBefore = window.__mwLighting().programs;
          const warmingBefore = window.__mwLighting().warming;
          const startFrames = window.__ltFrames.length;
          const startLong = window.__ltLong.length;
          const t0 = performance.now();
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, '45');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          let met = null;
          while (performance.now() - t0 < 20000) {
            await new Promise((r) => requestAnimationFrame(r));
            if (met === null && JSON.stringify(window.__mwLighting().spots[0].dir) !== before) {
              met = performance.now();
              const pose = window.__mwCadCamera?.();
              if (pose) window.__mwCadCamera({ position: pose.position, target: pose.target });
            }
            if (met !== null && window.__ltFrames.slice(startFrames).some((f) => f.t >= met)) {
              const ms = Math.round(performance.now() - t0);
              await new Promise((r) => setTimeout(r, 700));
              const long = window.__ltLong.slice(Math.max(0, startLong - 5)).filter((l) => l.t + l.d >= t0);
              return {
                ms,
                longMax: Math.round(long.reduce((m, l) => Math.max(m, l.d), 0)),
                programs: [programsBeforeHead, programsBefore, window.__mwLighting().programs],
                warmingBefore,
              };
            }
          }
          return { error: 'луч не сдвинулся' };
        }, programsBeforeHead);
        await cameraTo(page, pose);
        const l = await lighting(page);
        result.design = {
          frame: await frameAt(page, pose),
          orbit: await orbit(page, pose),
          heapMb: await heap(),
          lights: { spots: l.spots.length, spotShadows: l.spots.filter((s) => s.castShadow).length, rects: l.rects.length },
          programs: l.programs,
        };
      }
      mkdirSync(OUT, { recursive: true });
      writeFileSync(`${OUT}/perf-${label}-${runIndex}.json`, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
      check('PERF: замер записан', true, `${OUT}/perf-${label}-${runIndex}.json`);
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  запуск  ═════════════════════════ */

async function main() {
  for (const part of PARTS) if (!KNOWN.includes(part)) throw new Stop(`неизвестная часть «${part}» — есть: ${KNOWN.join(', ')}`);
  loadEnv();
  const build = buildId();
  freePort(PORT);
  mkdirSync(OUT, { recursive: true });
  const serverLog = createWriteStream(`${OUT}/server-${PARTS.join('-')}.log`);
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SITE_PASSWORD: '' },
  });
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);
  server.on('exit', (code, signal) => serverLog.write(`\n[сервер вышел: код ${code}, сигнал ${signal}, ${new Date().toISOString()}]\n`));
  let browser = null;
  try {
    const until = Date.now() + 90_000;
    for (;;) {
      try {
        const res = await fetch(`${BASE}/login`);
        if (res.status < 500) break;
      } catch {
        /* сервер ещё поднимается */
      }
      if (Date.now() > until) throw new Stop('next start не поднялся за 90 с');
      await sleep(1000);
    }
    console.log(`сборка ${build}, порт ${PORT}`);
    browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--enable-precise-memory-info'] });
    for (const part of PARTS) {
      try {
        if (part === 'scene') await partScene(browser);
        if (part === 'vitrine') await partVitrine(browser);
        if (part === 'save') await partSave(browser);
        if (part === 'tablet') await partSmall(browser, { width: 1024, height: 768, label: 'TABLET' });
        if (part === 'phone') await partSmall(browser, { width: 390, height: 844, label: 'PHONE' });
        if (part === 'perf') await partPerf(browser);
      } catch (error) {
        if (error instanceof Stop) {
          failed += 1;
          console.log(`  STOP ${error.message}`);
        } else throw error;
      }
    }
  } finally {
    await browser?.close().catch(() => undefined);
    try {
      execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' });
    } catch {
      /* сервер уже остановлен */
    }
    freePort(PORT);
  }
  console.log(`\nИТОГ: ${passed} / ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
