/**
 * РУЧКИ В БРАУЗЕРЕ (HANDLE-REAL) — на настоящей организации и настоящей видеокарте.
 *
 * Запуск (после `npm run build`): `PART=<часть> node scripts/check-handles.mjs`
 *   PART=perf  — замер нагрузки одним сценарием на любой сборке (до и после):
 *     Studio кухни → 3D → вызовы отрисовки и треугольники кадра (счётчик
 *     поверх WebGL, без хуков сцены), кадры при вращении камеры, куча JS,
 *     длинные задачи; смена типа ручки («Без ручки» → «Скоба»), установка
 *     ручки из каталога, «Открыть всё» — время от нажатия до кадра. Те же
 *     действия при CPU ×4. Числа — в `.capture-check/handles/perf-<сборка>-<n>.json`.
 *   PART=flow  — 1440 × 900: скоба 115.52.630 на модуль, кнопка 134.88.610 на
 *     одну створку, ручка для кромок 126.14.612 и «Профиль» — в одной сцене;
 *     «Без ручки» на ящиках; «Открыть всё» — ручки едут с полотном; покрытие
 *     другой позицией (151.38.100 → 151.38.102); сохранение, база, перезагрузка.
 *     Сверка по НАРИСОВАННОМУ (`__mwHandles`: форма, габарит сетки, место в
 *     мире, материал), снимки крупным планом до и после.
 *   PART=tablet — 1024 × 768 с касанием: выбор створки и установка касанием.
 * Каждая часть — своя временная организация: заводится служебным ключом,
 * фурнитура производителей загружается тем же маршрутом, что в админке, и
 * всё удаляется; уборка проверяется чтением.
 */
import { execSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_HR ?? 3293);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/handles';
const PARTS = (process.env.PART ?? 'perf').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['perf', 'flow', 'tablet'];
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

/* ─────────────────────────  объекты: путём экрана  ───────────────────────── */

let fixtures = null;
function fixture(key) {
  if (!fixtures) {
    fixtures = JSON.parse(execSync('npx tsx scripts/handles-fixture.ts', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  }
  const fx = fixtures[key];
  if (!fx) throw new Stop(`нет объекта «${key}» в handles-fixture`);
  return fx;
}
const FACTS = JSON.parse(readFileSync('data/catalog/hardware.json', 'utf8'));
const FACT_COUNT = FACTS.items.length;
const articleOf = (manufacturerArticle) => {
  const fact = FACTS.items.find((it) => it.hardware.manufacturerArticle === manufacturerArticle);
  if (!fact) throw new Stop(`НУЛЕВОЙ СЕЛЕКТОР: артикула ${manufacturerArticle} нет в фактах`);
  return fact.article;
};

/* ─────────────────────────  счётчик кадров поверх WebGL  ───────────────────────── */

/**
 * Вызовы отрисовки и треугольники считаются обёрткой над `drawElements`,
 * `drawArrays` и их экземплярными вариантами — до загрузки страницы, без
 * хуков сцены: так один и тот же сценарий меряет и прежнюю сборку, и новую.
 * Кадр — тик `requestAnimationFrame`, в котором что-то нарисовано.
 */
const PROBE = `(() => {
  if (window.__hrProbe) return;
  const st = { calls: 0, tris: 0 };
  window.__hrProbe = st;
  const TRI = 4;
  const wrap = (proto) => {
    if (!proto || proto.__hrWrapped) return;
    proto.__hrWrapped = true;
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
  window.__hrFrames = frames;
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
  window.__hrLong = long;
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
  await b.first().click({ timeout: 15_000 });
  await sleep(400);
  return true;
}
async function view(page, key) {
  const b = page.locator(`[data-studio-bottombar] [data-studio-view="${key}"]`);
  if ((await b.count()) === 0) return false;
  await b.first().click({ timeout: 15_000 });
  await sleep(600);
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
async function quiet(page, ms = 120_000) {
  return waitFor(
    page,
    () => ({
      open: window.__mwOpenParts ? window.__mwOpenParts() : -1,
      moving: window.__mwMovingCount ? window.__mwMovingCount() : -1,
    }),
    (v) => v.open === 0 && v.moving === 0,
    ms,
  );
}
/** Модуль выбран через список объектов: тот же выбор, что нажатием в сцене. */
async function selectModule(page, label, moduleId) {
  if (!(await page.locator('[data-studio-objects]').first().isVisible().catch(() => false))) {
    must(`${label}: инструмент «Выбор»`, await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="select"]');
  }
  const row = page.locator(`[data-object-module="${moduleId}"]`);
  must(`${label}: модуль ${moduleId} в списке объектов`, (await row.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-object-module="${moduleId}"]`);
  await row.first().click();
  await sleep(500);
}

/* ─────────────────────────  организация  ───────────────────────── */

async function withOrg(label, browser, body, { viewport, touch = false, projects = [] }) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const made = { users: [], orgs: [], projects: [] };
  try {
    const email = `hr-${stamp}@example.test`;
    const password = `Pw-${stamp}-hr!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    made.users.push(data.user.id);
    const { data: org, error: orgError } = await service.from('orgs').insert({ slug: `hr-${stamp}`, name: `Проверка ручек ${label}` }).select('id').single();
    if (orgError) throw new Error(`insert org: ${orgError.message}`);
    made.orgs.push(org.id);
    const { error: memberError } = await service.from('org_members').insert({ org_id: org.id, user_id: data.user.id, role: 'owner' });
    if (memberError) throw new Error(`insert member: ${memberError.message}`);
    const jar = [];
    const ssr = createServerClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
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
    const context = await browser.newContext({ viewport, hasTouch: touch });
    await context.addInitScript(PROBE);
    await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', sameSite: 'Lax' })));
    const page = await context.newPage();
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
    });
    const seeded = await page.request.post(`${BASE}/api/catalog/seed-rates`, { data: { orgId: org.id } });
    if (!seeded.ok()) throw new Error(`типовой прайс не заведён: ${seeded.status()}`);
    const res = await page.request.post(`${BASE}/api/catalog/hardware`, { data: { orgId: org.id, confirm: true }, timeout: 180_000 });
    const loaded = await res.json().catch(() => ({}));
    if (!res.ok() || loaded.added !== FACT_COUNT) throw new Error(`фурнитура не загрузилась: ${res.status()} · ${JSON.stringify(loaded).slice(0, 200)}`);
    const ids = {};
    for (const p of projects) {
      const { data: project, error: projectError } = await service
        .from('projects')
        .insert({
          org_id: org.id,
          client_name: 'Проверка',
          status: 'in_progress',
          address: `Ручки ${label} · ${p.key}`,
          zone: p.zone,
          measurements: p.fx.measurement,
          millwork: { survey: p.fx.survey, requirements: p.fx.requirements, runs: { optimal: p.fx.run }, selectedVariant: 'optimal' },
        })
        .select('id')
        .single();
      if (projectError) throw new Error(`insert project: ${projectError.message}`);
      made.projects.push(project.id);
      ids[p.key] = project.id;
    }
    await body({ service, org, page, context, errors, consoleErrors, ids });
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

/* ═════════════════════════  PERF  ═════════════════════════ */

/** Кадры и длинные задачи с отметки: что нарисовано и сколько главный поток стоял. */
const mark = (page) =>
  page.evaluate(() => ({ at: performance.now(), frames: window.__hrFrames.length, long: window.__hrLong.length }));
const since = (page, m) =>
  page.evaluate((m) => {
    const frames = window.__hrFrames.slice(m.frames);
    const long = window.__hrLong.slice(m.long);
    return {
      frames: frames.length,
      calls: frames.reduce((s, f) => s + f.calls, 0),
      tris: Math.round(frames.reduce((s, f) => s + f.tris, 0)),
      longCount: long.length,
      longTotal: Math.round(long.reduce((s, l) => s + l.d, 0)),
      longMax: Math.round(long.reduce((s, l) => Math.max(s, l.d), 0)),
    };
  }, m);

/** Один кадр с места: камера на ту же позу — сцена рисует кадр, счётчик меряет его. */
async function frameAt(page, pose) {
  await page.evaluate((p) => window.__mwCadCamera(p), pose);
  await sleep(900);
  const m = await mark(page);
  await page.evaluate((p) => window.__mwCadCamera({ position: [p.position[0] + 1e-4, p.position[1], p.position[2]], target: p.target }), pose);
  await sleep(900);
  const s = await since(page, m);
  return { frames: s.frames, callsPerFrame: s.frames ? Math.round(s.calls / s.frames) : 0, trisPerFrame: s.frames ? Math.round(s.tris / s.frames) : 0 };
}

/** Вращение: поза на каждый тик кадра — сколько кадров сцена успела нарисовать. */
async function orbit(page, base, steps = 150) {
  return page.evaluate(
    async ({ base, steps }) => {
      const [tx, ty, tz] = base.target;
      const dx = base.position[0] - tx;
      const dz = base.position[2] - tz;
      const r = Math.hypot(dx, dz);
      const a0 = Math.atan2(dx, dz);
      const startFrames = window.__hrFrames.length;
      const startLong = window.__hrLong.length;
      const t0 = performance.now();
      for (let i = 0; i < steps; i += 1) {
        const a = a0 + (i / steps) * (Math.PI / 2) - Math.PI / 4;
        window.__mwCadCamera({ position: [tx + r * Math.sin(a), base.position[1], tz + r * Math.cos(a)], target: base.target });
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      const t1 = performance.now();
      const frames = window.__hrFrames.slice(startFrames).filter((f) => f.t >= t0 && f.t <= t1);
      const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t).sort((a, b) => a - b);
      const long = window.__hrLong.slice(startLong);
      return {
        seconds: Math.round((t1 - t0) / 10) / 100,
        frames: frames.length,
        fps: Math.round((frames.length / ((t1 - t0) / 1000)) * 10) / 10,
        gapMedianMs: gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)] * 10) / 10 : null,
        gapP95Ms: gaps.length ? Math.round(gaps[Math.floor(gaps.length * 0.95)] * 10) / 10 : null,
        longMax: Math.round(long.reduce((s, l) => Math.max(s, l.d), 0)),
      };
    },
    { base, steps },
  );
}

/** От нажатия до кадра, на котором условие стало правдой: нажатие и опрос — в самой странице. */
async function timed(page, selector, condition, arg = null, limitMs = 60_000) {
  return page.evaluate(
    async ({ selector, condition, arg, limitMs }) => {
      const el = document.querySelector(selector);
      if (!el) return { error: `НУЛЕВОЙ СЕЛЕКТОР: ${selector}` };
      const test = new Function('arg', condition);
      const startFrames = window.__hrFrames.length;
      const startLong = window.__hrLong.length;
      const t0 = performance.now();
      el.click();
      let met = null;
      while (performance.now() - t0 < limitMs) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (met === null && test(arg)) met = performance.now();
        /* Условие выполнено и после него нарисован кадр — изменение на экране. */
        if (met !== null && window.__hrFrames.slice(startFrames).some((f) => f.t >= met)) {
          const long = window.__hrLong.slice(startLong);
          return {
            ms: Math.round(performance.now() - t0),
            longTotal: Math.round(long.reduce((s, l) => s + l.d, 0)),
            longMax: Math.round(long.reduce((s, l) => Math.max(s, l.d), 0)),
          };
        }
      }
      return { error: `за ${limitMs} мс условие «${condition}» не выполнилось` };
    },
    { selector, condition, arg, limitMs },
  );
}

async function heapMb(cdp) {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined);
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return Math.round((usedSize / 1048576) * 10) / 10;
}

/** Действия с ручками — одни и те же на любой сборке и при любом замедлении. */
async function handleActions(page, fx, label) {
  const out = {};
  const double = fx.ids.double;
  await selectModule(page, label, double);
  const none = '[data-opening-picker] [data-handle="none"]';
  const bar = '[data-opening-picker] [data-handle="bar"]';
  must(`${label}: кнопки ручки в инспекторе`, (await page.locator(none).count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: ${none}`);
  const metal0 = await page.evaluate(() => window.__mwCadMetal());
  out.kindNone = await timed(page, none, 'return window.__mwCadMetal() < arg', metal0);
  must(`${label}: «Без ручки» — металла меньше`, !out.kindNone.error, out.kindNone.error ?? '');
  await sleep(1200);
  out.kindBar = await timed(page, bar, 'return window.__mwCadMetal() === arg', metal0);
  must(`${label}: «Скоба» — металл вернулся`, !out.kindBar.error, out.kindBar.error ?? '');
  await sleep(1200);

  /* Ручка из каталога: место «Ручки» выбранного модуля → поиск → карточка → «Установить». */
  must(`${label}: инструмент «Фурнитура»`, await tool(page, 'hardware'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="hardware"]');
  const items = await waitFor(page, () => Number(document.querySelector('[data-hw-panel]')?.getAttribute('data-hw-items') ?? 0), (n) => n >= 1, 60_000);
  must(`${label}: панель видит каталог`, items >= FACT_COUNT, `позиций ${items} из ${FACT_COUNT}`);
  const slot = page.locator('[data-hw-slot="handle"]');
  must(`${label}: место «Ручки»`, (await slot.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-hw-slot="handle"] · места: ${await page.evaluate(() => Array.from(document.querySelectorAll('[data-hw-slot]')).map((b) => b.getAttribute('data-hw-slot')).join(', '))}`);
  if ((await slot.first().getAttribute('aria-pressed')) !== 'true') await slot.first().click();
  for (const [key, manufacturerArticle] of [
    ['installBar', '115.52.630'],
    ['installKnob', '134.88.610'],
  ]) {
    const article = articleOf(manufacturerArticle);
    await page.locator('[data-hw-search]').first().fill(manufacturerArticle);
    await sleep(500);
    const row = page.locator(`[data-hw-item="${article}"]`);
    must(`${label}: ${manufacturerArticle} в списке`, (await row.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-hw-item="${article}"]`);
    await row.first().click();
    await sleep(600);
    out[key] = await timed(page, '[data-hw-install]', 'return document.querySelector(\'[data-hw-slot="handle"]\')?.getAttribute("data-hw-installed") === arg', article);
    must(`${label}: ${manufacturerArticle} установлен`, !out[key].error, out[key].error ?? '');
    await sleep(1500);
  }

  /* «Открыть всё»: от нажатия до первого кадра движения и до остановки. */
  const before = await mark(page);
  out.openStart = await timed(page, '[data-open-all]', 'return (window.__mwMovingCount ? window.__mwMovingCount() : 0) > 0');
  must(`${label}: «Открыть всё» поехало`, !out.openStart.error, out.openStart.error ?? '');
  const t0 = Date.now();
  await waitFor(page, () => (window.__mwMovingCount ? window.__mwMovingCount() : -1), (n) => n === 0, 60_000);
  out.openSettleMs = Date.now() - t0;
  const anim = await since(page, before);
  out.openFrames = anim.frames;
  out.openLongMax = anim.longMax;
  const close = page.locator('[data-close-all]');
  if ((await close.count()) > 0 && !(await close.first().isDisabled())) await close.first().click();
  await quiet(page);
  await sleep(1200);
  return out;
}

async function partPerf(browser) {
  const build = buildId();
  const runIndex = Number(process.env.RUN ?? 1);
  console.log(`\n── PERF (1440 × 900, ANGLE D3D11): сборка ${build}, прогон ${runIndex}`);
  const fx = fixture('handles');
  await withOrg(
    'PERF',
    browser,
    async ({ page, context, ids, errors, consoleErrors }) => {
      const cdp = await context.newCDPSession(page);
      const result = { build, run: runIndex, at: new Date().toISOString() };
      const t0 = Date.now();
      await openStudio(page, ids.kitchen);
      result.studioMs = Date.now() - t0;
      must('PERF: инструмент «Мебель»', await tool(page, 'furniture'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="furniture"]');
      must('PERF: вид «3D»', await view(page, '3d'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-view="3d"]');
      const s = await sceneSettled(page);
      must('PERF: 3D готова', s.state === 'ready', `${s.state} за ${s.ms} мс`);
      result.sceneReadyMs = Date.now() - t0;
      await sleep(3000);

      const idle = await mark(page);
      await sleep(5000);
      result.idle = await since(page, idle);

      const pose = await page.evaluate(() => window.__mwCadCamera());
      must('PERF: поза камеры читается', Boolean(pose?.position && pose?.target), JSON.stringify(pose).slice(0, 120));
      const front = { position: pose.position, target: pose.target };
      result.frame = await frameAt(page, front);
      result.orbit = await orbit(page, front);
      result.heapMb = await heapMb(cdp);

      result.actions = await handleActions(page, fx, 'PERF');
      result.heapAfterMb = await heapMb(cdp);
      result.frameAfter = await frameAt(page, front);

      /* То же при CPU ×4 — документированный профиль «обычного ноутбука». */
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      result.orbitX4 = await orbit(page, front, 90);
      await tool(page, 'select');
      result.actionsX4 = await handleActions(page, fx, 'PERF ×4');
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

      result.errors = errors.slice(0, 5);
      result.consoleErrors = consoleErrors.slice(0, 5);
      mkdirSync(OUT, { recursive: true });
      const file = `${OUT}/perf-${build}-${runIndex}.json`;
      writeFileSync(file, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
      check('PERF: замер записан', true, file);
      check('PERF: ошибок страницы нет', errors.length === 0, errors.slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 }, projects: [{ key: 'kitchen', zone: 'Кухня', fx }] },
  );
}

/* ═════════════════════════  FLOW  ═════════════════════════ */

const saved = (page) => waitFor(page, () => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null, (v) => v === 'saved', 30_000);
const drawn = (page) => page.evaluate(() => (window.__mwHandles ? window.__mwHandles() : null));
const closedOf = (now, part) => now.handles.filter((h) => !h.moving && h.part === part);
const movingOf = (now, part) => now.handles.filter((h) => h.moving && h.part === part);
const sorted = (size) => [...(size ?? [])].map((v) => Math.round(v * 10) / 10).sort((a, b) => a - b);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function open3d(page, label) {
  must(`${label}: инструмент «Мебель»`, await tool(page, 'furniture'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="furniture"]');
  must(`${label}: вид «3D»`, await view(page, '3d'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-view="3d"]');
  const s = await sceneSettled(page);
  must(`${label}: 3D готова`, s.state === 'ready', `${s.state} за ${s.ms} мс`);
  await sleep(1500);
}
/** Модуль выбран — инструмент «Фурнитура», место «Ручки». */
async function handleSlotOf(page, label, moduleId) {
  await selectModule(page, label, moduleId);
  must(`${label}: инструмент «Фурнитура»`, await tool(page, 'hardware'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="hardware"]');
  const items = await waitFor(page, () => Number(document.querySelector('[data-hw-panel]')?.getAttribute('data-hw-items') ?? 0), (n) => n >= 1, 60_000);
  must(`${label}: панель видит каталог`, items >= FACT_COUNT, `позиций ${items} из ${FACT_COUNT}`);
  const slot = page.locator('[data-hw-slot="handle"]');
  must(
    `${label}: место «Ручки» у ${moduleId}`,
    (await slot.count()) > 0,
    `НУЛЕВОЙ СЕЛЕКТОР: [data-hw-slot="handle"] · места: ${await page.evaluate(() => Array.from(document.querySelectorAll('[data-hw-slot]')).map((b) => b.getAttribute('data-hw-slot')).join(', '))}`,
  );
  if ((await slot.first().getAttribute('aria-pressed')) !== 'true') await slot.first().click();
  await sleep(400);
}
/** Поиск → строка → карточка (остаётся открытой). */
async function openCard(page, label, manufacturerArticle, query = manufacturerArticle) {
  const article = articleOf(manufacturerArticle);
  await page.locator('[data-hw-search]').first().fill(query);
  await sleep(500);
  const row = page.locator(`[data-hw-item="${article}"]`);
  must(`${label}: ${manufacturerArticle} в списке места`, (await row.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-hw-item="${article}"]`);
  await row.first().click();
  await page.waitForSelector(`[data-hw-card="${article}"]`, { timeout: 20_000 });
  return article;
}
/** «Установить» в открытой карточке — и ждём, пока место назовёт позицию. */
async function installOpen(page, label, article, leaf = null) {
  const button = page.locator('[data-hw-install]');
  must(
    `${label}: кнопка «Установить»`,
    (await button.count()) > 0 && !(await button.first().isDisabled()),
    `НУЛЕВОЙ СЕЛЕКТОР или кнопка серая: ${await page.evaluate(() => document.querySelector('[data-hw-card-verdict]')?.textContent?.slice(0, 160) ?? '')}`,
  );
  await button.first().click();
  const got = leaf
    ? await waitFor(page, (l) => document.querySelector(`[data-hw-leaf-installed="${l}"]`)?.getAttribute('data-hw-leaf-article') ?? null, (v) => v === article, 20_000, leaf)
    : await waitFor(page, () => document.querySelector('[data-hw-slot="handle"]')?.getAttribute('data-hw-installed') ?? null, (v) => v === article, 20_000);
  must(`${label}: ${article} ${leaf ? `на ${leaf}` : 'на модуле'}`, got === article, `место называет «${got}»`);
  await sleep(1500);
}
/**
 * Камера в позу — и проверка, что поза применилась: после открытия 3D
 * камера ещё долетает к «Общему виду», и поза, поставленная в полёте,
 * перебивается им (снимок «до» вышел стеной вместо фасадов).
 */
async function cameraTo(page, pose) {
  for (let i = 0; i < 4; i += 1) {
    await page.evaluate((p) => window.__mwCadCamera(p), pose);
    await sleep(1500);
    const now = await page.evaluate(() => window.__mwCadCamera());
    if (now?.position && Math.hypot(...now.position.map((v, k) => v - pose.position[k])) < 0.005) return true;
  }
  return false;
}
/** Камера на ручки деталей — только для снимка: проверки меряют числа. */
async function aimAt(page, now, parts, offset = [0.28, 0.18, 0.62]) {
  const list = parts.flatMap((part) => closedOf(now, part));
  if (list.length === 0) return false;
  const c = [0, 1, 2].map((i) => list.reduce((s, h) => s + h.worldMm[i], 0) / list.length / 1000);
  const ok = await cameraTo(page, { position: [c[0] + offset[0], c[1] + offset[1], c[2] + offset[2]], target: c });
  await sleep(1000);
  return ok;
}
async function idsOf(service, orgId, manufacturerArticles) {
  const articles = manufacturerArticles.map(articleOf);
  const { data, error } = await service.from('catalog_items').select('id, article').eq('org_id', orgId).in('article', articles);
  if (error) throw new Stop(`позиции не прочитались: ${error.message}`);
  const out = {};
  for (const m of manufacturerArticles) {
    const row = (data ?? []).find((r) => r.article === articleOf(m));
    if (!row) throw new Stop(`НУЛЕВОЙ СЕЛЕКТОР: позиции ${m} в каталоге организации нет`);
    out[m] = row.id;
  }
  return out;
}

async function partFlow(browser) {
  console.log('\n── FLOW (1440 × 900): скоба, кнопка, кромочная и «Профиль» в одной сцене · створка отдельно · «Без ручки» · ход · покрытие · сохранение');
  const fx = fixture('handles');
  const { double, left, drawers, right, upper } = fx.ids;
  await withOrg(
    'FLOW',
    browser,
    async ({ service, org, page, errors, consoleErrors, ids }) => {
      mkdirSync(OUT, { recursive: true });
      const id = await idsOf(service, org.id, ['115.52.630', '134.88.610', '126.14.612', '151.38.100', '151.38.102']);
      await openStudio(page, ids.kitchen);
      await open3d(page, 'FLOW');
      await saved(page);

      /* F1. Ручки без позиции — условные скобы, по одной на деталь. */
      const h0 = await drawn(page);
      must('FLOW: ручки читаются со сцены', Boolean(h0?.handles), 'НУЛЕВОЙ СЕЛЕКТОР: window.__mwHandles');
      const closed0 = h0.handles.filter((h) => !h.moving);
      check(
        'FLOW.1 до выбора: 8 ручек на 8 деталях, все условные скобы (VISUAL_APPROXIMATION, без позиции)',
        closed0.length === 8 &&
          new Set(closed0.map((h) => h.part)).size === 8 &&
          closed0.every((h) => h.shape === 'bar' && h.status === 'VISUAL_APPROXIMATION' && h.itemId === null),
        `${closed0.length}: ${closed0.map((h) => `${(h.part ?? '').split(':').slice(1).join(':')} ${h.shape}/${h.status}`).join(', ')}`,
      );
      /* Камера долетела: две одинаковые позы подряд. */
      await waitFor(
        page,
        async () => {
          const a = window.__mwCadCamera();
          await new Promise((r) => setTimeout(r, 400));
          const b = window.__mwCadCamera();
          return Math.hypot(...a.position.map((v, k) => v - b.position[k]));
        },
        (d) => d < 1e-4,
        20_000,
      );
      const home = await page.evaluate(() => window.__mwCadCamera());
      must('FLOW: камера встала на крупный план «до»', await aimAt(page, h0, [`${double}:door:0`, `${double}:door:1`]), 'поза не применилась');
      await page.screenshot({ path: `${OUT}/closeup-1-before.png`, timeout: 120_000 });
      await cameraTo(page, { position: home.position, target: home.target });

      /* F2. Скоба 115.52.630 — на модуль: обе створки. */
      await handleSlotOf(page, 'FLOW', double);
      const targets = await page.evaluate(() => ({
        n: Number(document.querySelector('[data-hw-leaf-targets]')?.getAttribute('data-hw-leaf-targets') ?? 0),
        whole: document.querySelector('[data-hw-leaf=""]')?.getAttribute('aria-pressed') ?? null,
      }));
      check('FLOW.2a у двух створок выбор «Ручка для»: весь модуль, дверь 1, дверь 2 — сейчас весь модуль', targets.n === 2 && targets.whole === 'true', JSON.stringify(targets));
      const barArticle = await openCard(page, 'FLOW', '115.52.630');
      const status = await page.evaluate(() => ({
        visual: document.querySelector('[data-hw-visual]')?.getAttribute('data-hw-visual') ?? null,
        words: document.querySelector('[data-hw-model-words]')?.textContent?.slice(0, 120) ?? null,
      }));
      await installOpen(page, 'FLOW', barArticle);
      const h1 = await drawn(page);
      const bar0 = closedOf(h1, `${double}:door:0`)[0];
      const bar1 = closedOf(h1, `${double}:door:1`)[0];
      check(
        'FLOW.2 скоба на модуль: обе створки — модель 115.52.630 по размерам паспорта (MEASURED_RECONSTRUCTION), сетка 174 × 14 × 45 мм; карточка говорит то же',
        [bar0, bar1].every((h) => h && h.shape === 'bar' && h.status === 'MEASURED_RECONSTRUCTION' && h.itemId === id['115.52.630'] && same(sorted(h.sizeMm), [14, 45, 174])) &&
          status.visual === 'MEASURED_RECONSTRUCTION' &&
          /скоба A 174/.test(status.words ?? ''),
        `${[bar0, bar1].map((h) => (h ? `${h.shape} ${h.status} ${sorted(h.sizeMm).join('×')}` : 'нет')).join(' | ')} · карточка ${status.visual}: ${status.words}`,
      );

      /* F3. Кнопка 134.88.610 — только на дверь 2; 3D-превью карточки. */
      await page.locator('[data-hw-leaf="door:1"]').first().click();
      await sleep(400);
      const knobArticle = await openCard(page, 'FLOW', '134.88.610');
      await page.locator('[data-hw-tab="model3d"]').first().click();
      const preview = await waitFor(page, () => document.querySelector('[data-hw-preview]')?.getAttribute('data-hw-preview') ?? null, (v) => v === 'ready' || v === 'none', 30_000);
      await page.locator(`[data-hw-card="${knobArticle}"]`).first().screenshot({ path: `${OUT}/card-knob-3d.png`, timeout: 120_000 });
      const label3d = await page.evaluate(() => document.querySelector('[data-hw-model3d-label]')?.textContent ?? '');
      check('FLOW.3a карточка кнопки: 3D-превью нарисовано крупным планом, подписано «Модель по размерам паспорта»', preview === 'ready' && /по размерам паспорта/.test(label3d), `${preview} · ${label3d.slice(0, 100)}`);
      await installOpen(page, 'FLOW', knobArticle, 'door:1');
      const h2 = await drawn(page);
      const d0 = closedOf(h2, `${double}:door:0`)[0];
      const d1 = closedOf(h2, `${double}:door:1`)[0];
      check(
        'FLOW.3 кнопка только на дверь 2: дверь 1 — скоба 115.52.630, дверь 2 — кнопка 134.88.610 Ø28 × 28; ключи моделей разные',
        d0?.itemId === id['115.52.630'] && d0.shape === 'bar' && d1?.itemId === id['134.88.610'] && d1.shape === 'knob' && same(sorted(d1.sizeMm), [28, 28, 28]) && d0.key !== d1.key,
        `дверь 1 ${d0?.shape} · дверь 2 ${d1?.shape} ${sorted(d1?.sizeMm).join('×')}`,
      );
      must('FLOW: камера встала на крупный план «после»', await aimAt(page, h2, [`${double}:door:0`, `${double}:door:1`]), 'поза не применилась');
      await page.screenshot({ path: `${OUT}/closeup-2-after.png`, timeout: 120_000 });
      await cameraTo(page, { position: home.position, target: home.target });

      /* F4. Ручка для кромок на правую дверцу; «Профиль» — на левую. */
      await handleSlotOf(page, 'FLOW', right);
      const edgeArticle = await openCard(page, 'FLOW', '126.14.612');
      await installOpen(page, 'FLOW', edgeArticle);
      await selectModule(page, 'FLOW', left);
      const profile = '[data-opening-picker] [data-handle="profile"]';
      must('FLOW: кнопка «Профиль»', (await page.locator(profile).count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: ${profile}`);
      await page.locator(profile).first().click();
      await sleep(1500);
      const h3 = await drawn(page);
      const edge = closedOf(h3, `${right}:door:0`)[0];
      const strip = closedOf(h3, `${left}:door:0`)[0];
      const kinds = new Set(h3.handles.filter((h) => !h.moving).map((h) => h.shape));
      check(
        'FLOW.4 в одной сцене скоба, кнопка, ручка для кромок 126.14.612 (по чертежу, длина 300) и «Профиль» во всю ширину (условный)',
        edge?.itemId === id['126.14.612'] &&
          edge.shape === 'edge' &&
          edge.status === 'VISUAL_RECONSTRUCTION' &&
          Math.max(...edge.sizeMm) === 300 &&
          strip?.shape === 'strip' &&
          strip.status === 'VISUAL_APPROXIMATION' &&
          ['bar', 'knob', 'edge', 'strip'].every((k) => kinds.has(k)),
        `формы ${Array.from(kinds).join(', ')} · кромочная ${edge ? `${edge.status} ${sorted(edge.sizeMm).join('×')}` : 'нет'} · профиль ${strip ? `${strip.status} ${sorted(strip.sizeMm).join('×')}` : 'нет'}`,
      );
      await page.screenshot({ path: `${OUT}/scene-four-kinds.png`, timeout: 120_000 });
      /*
       * Ручка для кромок и «Профиль» — на верхней кромке под свесом столешницы:
       * снимок чуть выше кромки (ниже цели камера сцены не опускается).
       */
      const edgeShot = await aimAt(page, h3, [`${right}:door:0`], [-0.22, 0.08, 0.64]);
      await page.screenshot({ path: `${OUT}/closeup-3-edge.png`, timeout: 120_000 });
      const profileShot = await aimAt(page, h3, [`${left}:door:0`], [0.22, 0.08, 0.64]);
      await page.screenshot({ path: `${OUT}/closeup-4-profile.png`, timeout: 120_000 });
      check('FLOW.4b крупные планы ручки для кромок и «Профиля» сняты с той позы, что поставлена', edgeShot && profileShot, `кромочная ${edgeShot} · профиль ${profileShot}`);
      await cameraTo(page, { position: home.position, target: home.target });

      /* F5. «Без ручки» на ящиках — ручек на фронтах нет. */
      await selectModule(page, 'FLOW', drawers);
      await page.locator('[data-opening-picker] [data-handle="none"]').first().click();
      await sleep(1500);
      const h4 = await drawn(page);
      check(
        'FLOW.5 «Без ручки» на ящиках: на трёх фронтах ручек 0, у остальных пяти деталей — прежние',
        h4.handles.filter((h) => (h.part ?? '').startsWith(`${drawers}:`)).length === 0 && h4.handles.filter((h) => !h.moving).length === 5,
        `всего ${h4.handles.length}`,
      );

      /* F6. «Открыть всё» — ручки едут с полотном той же моделью, дублей на месте закрытых нет. */
      await page.locator('[data-open-all]').first().click();
      await waitFor(page, () => (window.__mwOpenParts ? window.__mwOpenParts() : 0), (n) => n > 0, 30_000);
      await waitFor(page, () => (window.__mwMovingCount ? window.__mwMovingCount() : -1), (n) => n === 0, 120_000);
      await sleep(800);
      const h5 = await drawn(page);
      const parts = [`${double}:door:0`, `${double}:door:1`, `${right}:door:0`, `${left}:door:0`, `${upper}:door:0`];
      const rode = parts.map((part) => {
        const before = closedOf(h4, part)[0];
        const now = movingOf(h5, part)[0];
        const shift = before && now ? Math.hypot(...[0, 1, 2].map((i) => now.worldMm[i] - before.worldMm[i])) : null;
        return {
          part,
          ok: Boolean(before && now && now.key === before.key && same(sorted(now.sizeMm), sorted(before.sizeMm)) && shift > 50 && closedOf(h5, part).length === 0),
          shift,
        };
      });
      await page.screenshot({ path: `${OUT}/open-all.png`, timeout: 120_000 });
      check(
        'FLOW.6 «Открыть всё»: у пяти створок ручка едет с полотном той же моделью (сдвиг больше 50 мм), закрытой копии на месте нет; у ящиков «Без ручки» ручки нет и на ходу',
        rode.every((r) => r.ok) && h5.handles.filter((h) => (h.part ?? '').startsWith(`${drawers}:`)).length === 0,
        rode.map((r) => `${r.part.split(':').slice(-2).join(':')} ${r.ok ? `${Math.round(r.shift)} мм` : 'НЕТ'}`).join(', '),
      );
      const close = page.locator('[data-close-all]');
      if ((await close.count()) > 0 && !(await close.first().isDisabled())) await close.first().click();
      await quiet(page);
      await sleep(1500);

      /* F7. Покрытие — другой позицией той же модели: бронза → чёрный матовый. */
      await handleSlotOf(page, 'FLOW', upper);
      const bronze = await openCard(page, 'FLOW', '151.38.100');
      const chips = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-hw-finish]')).map((b) => ({ finish: b.getAttribute('data-hw-finish'), article: b.getAttribute('data-hw-finish-article'), on: b.getAttribute('aria-pressed') })),
      );
      const black = page.locator('[data-hw-finish="black_matte"]');
      must('FLOW: покрытие «чёрный матовый» у той же модели', (await black.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-hw-finish="black_matte"] · ${JSON.stringify(chips)}`);
      await black.first().click();
      const blackArticle = articleOf('151.38.102');
      await page.waitForSelector(`[data-hw-card="${blackArticle}"]`, { timeout: 20_000 });
      await installOpen(page, 'FLOW', blackArticle);
      const h6 = await drawn(page);
      const flush = closedOf(h6, `${upper}:door:0`)[0];
      check(
        'FLOW.7 врезная 151.38.100 (бронза) → «чёрный матовый» той же модели — 151.38.102; в сцене материал handle:black_matte, тёмный; дно — своей пачкой',
        chips.some((c) => c.finish === 'bronze_pvd' && c.on === 'true') &&
          bronze === articleOf('151.38.100') &&
          flush?.itemId === id['151.38.102'] &&
          flush.shape === 'flush' &&
          flush.material.name === 'handle:black_matte:body' &&
          flush.material.color.every((v) => v < 0.05) &&
          flush.accent === 'cavity',
        `${JSON.stringify(chips)} · ${flush ? `${flush.material.name} [${flush.material.color.map((v) => v.toFixed(3)).join(', ')}]` : 'нет'}`,
      );

      /* F8. Сохранение → база → перезагрузка: те же ручки на тех же деталях. */
      await sleep(2500);
      await saved(page);
      const row = (await service.from('projects').select('millwork').eq('id', ids.kitchen).single()).data;
      const all = [...(row?.millwork?.runs?.optimal?.modules ?? []), ...(row?.millwork?.runs?.optimal?.upperSegments ?? []).flatMap((s) => s.modules)];
      const stored = all
        .flatMap((m) => (m.fittings ?? []).filter((f) => f.slot === 'handle').map((f) => `${m.id}${f.leaf ? `#${f.leaf}` : ''}=${f.itemId}`))
        .sort();
      const want = [`${double}=${id['115.52.630']}`, `${double}#door:1=${id['134.88.610']}`, `${right}=${id['126.14.612']}`, `${upper}=${id['151.38.102']}`].sort();
      check('FLOW.8 в базе: скоба на модуле, кнопка на двери 2, кромочная и врезная — на своих модулях', same(stored, want), stored.join(', ') || 'НИЧЕГО');
      const signature = (now) => now.handles.filter((h) => !h.moving).map((h) => `${h.part}=${h.key}|${h.itemId}|${h.material.name}`).sort();
      const before = signature(h6);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
      await sleep(1500);
      await open3d(page, 'FLOW');
      const h7 = await drawn(page);
      const after = signature(h7);
      check(
        'FLOW.9 после перезагрузки ручки те же: модель, позиция и покрытие на каждой детали',
        same(before, after) && after.length === 5,
        `${before.length} → ${after.length}${same(before, after) ? '' : ` · ${after.filter((x) => !before.includes(x)).join(' | ')}`}`,
      );
      check('FLOW ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 }, projects: [{ key: 'kitchen', zone: 'Кухня', fx }] },
  );
}

/* ═════════════════════════  TABLET  ═════════════════════════ */

async function partTablet(browser) {
  console.log('\n── TABLET (1024 × 768, касание): выбор створки и установка касанием');
  const fx = fixture('handles');
  const { double } = fx.ids;
  await withOrg(
    'TABLET',
    browser,
    async ({ service, org, page, errors, consoleErrors, ids }) => {
      mkdirSync(OUT, { recursive: true });
      const id = await idsOf(service, org.id, ['134.88.610']);
      await openStudio(page, ids.kitchen);
      await open3d(page, 'TABLET');
      await handleSlotOf(page, 'TABLET', double);
      const layout = await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll('[data-hw-leaf]')).map((b) => b.getBoundingClientRect());
        return {
          chips: chips.length,
          minHeight: Math.round(Math.min(...chips.map((r) => r.height))),
          inside: chips.every((r) => r.left >= -1 && r.right <= window.innerWidth + 1),
          pageScroll: document.scrollingElement.scrollWidth - window.innerWidth,
        };
      });
      check(
        'TABLET.1 выбор створки в экране: три кнопки не ниже 36 px, прокрутки по ширине нет',
        layout.chips === 3 && layout.minHeight >= 36 && layout.inside && layout.pageScroll <= 0,
        JSON.stringify(layout),
      );
      await page.locator('[data-hw-leaf="door:0"]').first().tap();
      await sleep(400);
      const article = articleOf('134.88.610');
      await page.locator('[data-hw-search]').first().fill('134.88.610');
      await sleep(500);
      await page.locator(`[data-hw-item="${article}"]`).first().tap();
      await page.waitForSelector(`[data-hw-card="${article}"]`, { timeout: 20_000 });
      const cardRect = await page.evaluate((a) => {
        const r = document.querySelector(`[data-hw-card="${a}"]`)?.getBoundingClientRect();
        return r ? { left: Math.round(r.left), right: Math.round(r.right), width: window.innerWidth } : null;
      }, article);
      await page.screenshot({ path: `${OUT}/tablet-1-card.png`, timeout: 120_000 });
      await page.locator('[data-hw-install]').first().tap();
      const got = await waitFor(page, () => document.querySelector('[data-hw-leaf-installed="door:0"]')?.getAttribute('data-hw-leaf-article') ?? null, (v) => v === article, 20_000);
      await sleep(1500);
      const now = await drawn(page);
      const d0 = closedOf(now, `${double}:door:0`)[0];
      const d1 = closedOf(now, `${double}:door:1`)[0];
      await page.screenshot({ path: `${OUT}/tablet-2-installed.png`, timeout: 120_000 });
      check(
        'TABLET.2 касанием: кнопка на дверь 1 — в сцене кнопка, у двери 2 условная скоба; карточка в экране',
        got === article &&
          d0?.shape === 'knob' &&
          d0.itemId === id['134.88.610'] &&
          d1?.shape === 'bar' &&
          d1.itemId === null &&
          Boolean(cardRect && cardRect.left >= 0 && cardRect.right <= cardRect.width),
        `${got} · дверь 1 ${d0?.shape} · дверь 2 ${d1?.shape} · карточка ${JSON.stringify(cardRect)}`,
      );
      check('TABLET ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width: 1024, height: 768 }, touch: true, projects: [{ key: 'kitchen', zone: 'Кухня', fx }] },
  );
}

/* ═════════════════════════  запуск  ═════════════════════════ */

async function main() {
  for (const part of PARTS) if (!KNOWN.includes(part)) throw new Stop(`неизвестная часть «${part}» — есть: ${KNOWN.join(', ')}`);
  loadEnv();
  const build = buildId();
  freePort(PORT);
  /*
   * Вывод сервера — в файл: сервер дважды переставал отвечать между
   * сохранением и перезагрузкой, и без его журнала причина не видна.
   */
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
        if (part === 'perf') await partPerf(browser);
        if (part === 'flow') await partFlow(browser);
        if (part === 'tablet') await partTablet(browser);
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
