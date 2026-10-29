/**
 * ТВ-ЗОНА (STAGE B) В БРАУЗЕРЕ — НАСТОЯЩАЯ ОРГАНИЗАЦИЯ И ВИДЕОКАРТА.
 *
 * Запуск (после `npm run build`): `PART=<часть> node scripts/check-tvzone.mjs`
 *   PART=A      — гостиная, готовая ТВ-зона A на стене 3800: тумба и телевизор в сцене числом движка, без
 *                 пересечений; смета на экране; стена 3800 → 2400 → 3800 полем длины — решение пересобирается;
 *                 «Мебель» → блок «ТВ-зона»: «65″», «← 50», «+ Рейки» — телевизор, рейки и телевизор на панели
 *                 числом движка; низ тумбы 500 — отказ словами движка; демо-картинка на экране; запись, база,
 *                 перезагрузка; снимки.
 *   PART=B      — B: торцы по дуге (детали по контуру числом движка), ЧПУ и подвесной крепёж в смете; дверца
 *                 тумбы открывается одна нажатием по мебели; снимки.
 *   PART=C      — C: рейки и телевизор на панели, две витрины; смета (рейки без цены, полки, профиль, лента);
 *                 «Каркас» снимает панель, «Дизайн» возвращает; дверца витрины открывается одна; без отладки
 *                 «Рентгена» нет, с `?debug=1` — есть; C на стене 2200 — отказ словами, цены нет; снимки.
 *   PART=light  — «Интерьер» C: лента за панелью по контуру — 4 полосы; ночью стена над панелью и полка витрины
 *                 светлее с лентой, чем без неё; запись и перезагрузка; B: лента под тумбой — пол под ней
 *                 светлее; снимки днём и ночью.
 *   PART=plan   — план Studio, фасад и деталировка C: телевизор, панель и модули на своих отметках, рейки
 *                 строками раскроя; снимки полного плана и фасада.
 *   PART=tablet — 1024 × 768 касанием: блок «ТВ-зона» досягаем, «75″», прокрутки по ширине нет; снимок.
 *   PART=perf   — планшет (1024 × 768 × 2, касание, процессор ×4): гостиная по прежнему шаблону и ТВ-зона C —
 *                 открытие, 3D, вызовы и треугольники кадра, вращение, куча, «Интерьер», ночь, лента за панелью;
 *                 числа — `.capture-check/tvzone/perf-<сборка>-<прогон>.json` (`RUN=n`).
 *
 * Сверка — по нарисованному (`__mwCadTvZone`, `__mwCadModules`, `__mwCadRadius`, `__mwOpenIds`,
 * `__mwEstimateLines`, `__mwLighting`, `__mwLightingSample`) и по базе (служебным ключом); ожидания —
 * `tvzone-browser-fixture.ts` тем же путём экрана. Каждая часть — своя временная организация: заводится
 * служебным ключом и удаляется, уборка проверяется чтением. Снимки — `.capture-check/tvzone`.
 */
import { execSync, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_TVZONE ?? 3321);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/tvzone';
const PARTS = (process.env.PART ?? 'A').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['A', 'B', 'C', 'light', 'plan', 'tablet', 'perf'];
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
    /* порт свободен */
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
    fixtures = JSON.parse(
      execSync('npx tsx --tsconfig tsconfig.scripts.json scripts/tvzone-browser-fixture.ts', {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  }
  const fx = fixtures[key];
  if (!fx) throw new Stop(`нет объекта «${key}» в tvzone-browser-fixture`);
  return fx;
}

/* ─────────────────────────  счётчик кадров поверх WebGL (только PART=perf)  ───────────────────────── */

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
async function openStudio(page, projectId, query = '') {
  await page.goto(`${BASE}/project/${projectId}/room${query}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-studio-rail] [data-studio-tool]');
    return Boolean(el && Object.keys(el).some((k) => k.startsWith('__reactProps')));
  }, undefined, { timeout: 60_000 });
}
async function view(page, key) {
  const b = page.locator(`[data-studio-bottombar] [data-studio-view="${key}"]`);
  must(`вид «${key}» в нижней панели`, (await b.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-studio-view="${key}"]`);
  await b.first().click({ timeout: 15_000 });
  await sleep(400);
}
async function sceneReady(page) {
  const t0 = Date.now();
  let state = null;
  while (Date.now() - t0 < 120_000) {
    state = await page.evaluate(() => document.querySelector('[data-studio-viewport] [data-scene]')?.getAttribute('data-scene-state') ?? null);
    if (state === 'ready' || state === 'failed') break;
    await sleep(150);
  }
  return { state, ms: Date.now() - t0 };
}
async function view3d(page) {
  await view(page, '3d');
  const s = await sceneReady(page);
  must('3D готова', s.state === 'ready', `состояние ${s.state ?? 'НЕТ'} за ${s.ms} мс`);
  await waitFor(page, () => (window.__mwCadTvZone ? 1 : 0), (n) => n === 1, 30_000);
}
/** Инструмент рейки — только если он ещё не открыт: повторное нажатие сворачивает его панель. */
async function ensureTool(page, key) {
  const b = page.locator(`[data-studio-rail] [data-studio-tool="${key}"]`);
  must(`инструмент «${key}» в рейке`, (await b.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="${key}"]`);
  if ((await b.first().getAttribute('aria-pressed')) !== 'true') {
    await b.first().click({ timeout: 15_000 });
    await sleep(500);
  }
}
async function click(page, selector, label) {
  const el = page.locator(selector);
  must(label, (await el.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: ${selector}`);
  await el.first().scrollIntoViewIfNeeded().catch(() => undefined);
  await el.first().click({ timeout: 15_000 });
  await sleep(450);
}
async function tap(page, selector, label) {
  const el = page.locator(selector);
  must(label, (await el.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: ${selector}`);
  await el.first().scrollIntoViewIfNeeded().catch(() => undefined);
  await el.first().tap({ timeout: 15_000 });
  await sleep(450);
}
const tvProbe = (page) => page.evaluate(() => (window.__mwCadTvZone ? window.__mwCadTvZone() : null));
const tvState = (page, test, ms = 20_000) => waitFor(page, () => (window.__mwCadTvZone ? window.__mwCadTvZone() : null), (v) => Boolean(v) && test(v), ms);
const cadModules = (page) => page.evaluate(() => (window.__mwCadModules ? window.__mwCadModules() : null));
const decorCount = (p) => (p?.decor ?? []).reduce((sum, d) => sum + d.count, 0) + (p?.rounded ?? []).length;
const decorBox = (p) => {
  const boxes = [...(p?.decor ?? []), ...(p?.rounded ?? [])].map((d) => d.boundsMm).filter(Boolean);
  if (boxes.length === 0) return null;
  return [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b[k]))).concat([3, 4, 5].map((k) => Math.max(...boxes.map((b) => b[k]))));
};
const boxNear = (a, b, tol = 2) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const fmt = (box) => (box ? `[${box.join(', ')}]` : 'нет');
/** Габарит в мире против модулей сцены (`__mwCadModules().boxes`: пол x/z, высота y): входы глубже 0,5 мм. */
const crossings = (box, modules) =>
  !box
    ? []
    : Object.entries(modules?.boxes ?? {})
        .filter(([, b]) => {
          const ox = Math.min(box[3], b.max[0]) - Math.max(box[0], b.min[0]);
          const oy = Math.min(box[4], b.y[1]) - Math.max(box[1], b.y[0]);
          const oz = Math.min(box[5], b.max[1]) - Math.max(box[2], b.min[1]);
          return ox > 0.5 && oy > 0.5 && oz > 0.5;
        })
        .map(([id]) => id);
const sameIds = (a, b) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());
const lineQty = (list, key) => Math.round(list.filter((line) => line.key === key).reduce((sum, line) => sum + line.quantity, 0) * 1000) / 1000;
const estimateLines = (page, test = () => true, ms = 20_000) => waitFor(page, () => window.__mwEstimateLines?.() ?? [], (v) => v.length > 0 && test(v), ms);
const moving = (page) => page.evaluate(() => (window.__mwMovingCount ? window.__mwMovingCount() : -1));
const openIds = (page) => page.evaluate(() => (window.__mwOpenIds ? window.__mwOpenIds() : null));
async function settle(page, ms = 60_000) {
  const t0 = Date.now();
  let calm = 0;
  while (Date.now() - t0 < ms) {
    calm = (await moving(page)) === 0 ? calm + 1 : 0;
    if (calm >= 3) return true;
    await sleep(200);
  }
  return false;
}
async function shot(page, name) {
  await sleep(700);
  await page.screenshot({ path: `${OUT}/${name}`, timeout: 120_000 });
}
/** Поставить позу и дождаться, что сцена стоит на ней (перелёт не перебил). */
async function cameraTo(page, pose) {
  for (let i = 0; i < 12; i += 1) {
    const at = await page.evaluate((p) => window.__mwCadCamera(p), { position: pose.position, target: pose.target });
    await sleep(500);
    const back = await page.evaluate(() => window.__mwCadCamera());
    if (at && back && Math.hypot(...back.position.map((v, k) => v - pose.position[k])) < 1e-3) return true;
  }
  return false;
}
/**
 * Камера перед точкой мира (мм): на `distanceM` в комнату и на `liftM` выше неё, взгляд — в точку. Точка — внутри
 * габарита мебели: сцена держит цель на мебели и иначе сдвигает позу (`keepOnFurniture`); сцена не принимает и
 * позу ниже цели.
 */
const facing = (pointMm, distanceM, liftM) => ({
  position: [pointMm[0] / 1000, pointMm[1] / 1000 + liftM, pointMm[2] / 1000 + distanceM],
  target: [pointMm[0] / 1000, pointMm[1] / 1000, pointMm[2] / 1000],
});
async function saved(page, ms = 30_000) {
  const state = await waitFor(page, () => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null, (v) => v === 'saved', ms);
  return state === 'saved';
}
/** Длина стены полем инспектора стены — тем же путём, что у замерщика в Studio. */
async function setWallLength(page, wallId, lengthMm) {
  await ensureTool(page, 'select');
  await click(page, `[data-object-wall="${wallId}"]`, `стена ${wallId} в списке «Выбор»`);
  const input = page.locator(`[data-wall-inspector="${wallId}"] [data-wall-length-input]`);
  must(`поле длины стены ${wallId}`, (await input.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-wall-inspector="${wallId}"] [data-wall-length-input]`);
  await input.first().fill(String(lengthMm));
  await input.first().press('Enter');
  const got = await waitFor(page, (id) => document.querySelector(`[data-wall-inspector="${id}"]`)?.getAttribute('data-wall-length') ?? null, (v) => v === String(lengthMm), 20_000, wallId);
  const refusal = await page.evaluate(() => document.querySelector('[data-wall-refusal]')?.textContent ?? null);
  must(`длина стены ${wallId} — ${lengthMm} мм`, got === String(lengthMm), `в инспекторе ${got} · отказ ${refusal ?? 'нет'}`);
}
/** Открыть одну деталь нажатием по мебели (зона касания — `__mwCadPartPoint`). */
async function openByClick(page, id) {
  const at = await page.evaluate((target) => (window.__mwCadPartPoint ? window.__mwCadPartPoint(target) : null), id);
  must(`точка нажатия детали ${id}`, Boolean(at), `НУЛЕВОЙ СЕЛЕКТОР: part:${id} в сцене нет`);
  await page.mouse.click(at.x, at.y);
  await sleep(300);
  await settle(page);
  return openIds(page);
}

/* ─────────────────────────  организация  ───────────────────────── */

const limitedFetch = (input, init = {}) => fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) });

async function withOrg(label, browser, body, { viewport, touch = false, scale = 1, probe = false }) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: limitedFetch },
  });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const made = { users: [], orgs: [], projects: [] };
  try {
    const email = `tvzone-${stamp}@example.test`;
    const password = `Pw-${stamp}-tvzone!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    made.users.push(data.user.id);
    const { data: org, error: orgError } = await service.from('orgs').insert({ slug: `tvzone-${stamp}`, name: `Проверка ТВ-зоны ${label}` }).select('id').single();
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
    if (probe) await context.addInitScript(PROBE);
    await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', sameSite: 'Lax' })));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    const seeded = await page.request.post(`${BASE}/api/catalog/seed-rates`, { data: { orgId: org.id } });
    if (!seeded.ok()) throw new Error(`типовой прайс не заведён: ${seeded.status()}`);
    const project = async (fx) => {
      const { data: row, error: projectError } = await service
        .from('projects')
        .insert({
          org_id: org.id,
          client_name: 'Проверка',
          status: 'in_progress',
          address: `ТВ-зона ${label}: ${fx.title}`,
          zone: fx.zone,
          measurements: fx.measurement,
          millwork: {
            survey: fx.survey,
            ...(fx.templateId ? { templateId: fx.templateId } : {}),
            requirements: fx.requirements,
            selectedVariant: 'optimal',
            shape: fx.shape,
          },
        })
        .select('id')
        .single();
      if (projectError) throw new Error(`insert project: ${projectError.message}`);
      made.projects.push(row.id);
      return row.id;
    };
    await body({ page, context, errors, project, service });
    await context.close();
  } finally {
    for (const id of made.projects) await service.from('projects').delete().eq('id', id);
    for (const id of made.orgs) {
      await service.from('catalog_items').delete().eq('org_id', id);
      await service.from('catalog_categories').delete().eq('org_id', id);
      await service.from('org_members').delete().eq('org_id', id);
      await service.from('orgs').delete().eq('id', id);
    }
    for (const id of made.users) await service.auth.admin.deleteUser(id);
    const left = [];
    for (const id of made.orgs) {
      if (((await service.from('orgs').select('id').eq('id', id)).data ?? []).length) left.push(`организация ${id}`);
      if (((await service.from('catalog_items').select('id').eq('org_id', id).limit(1)).data ?? []).length) left.push(`позиции ${id}`);
    }
    for (const id of made.projects) if (((await service.from('projects').select('id').eq('id', id)).data ?? []).length) left.push(`объект ${id}`);
    for (const id of made.users) {
      const { data: user } = await service.auth.admin.getUserById(id);
      if (user?.user) left.push(`пользователь ${id}`);
    }
    check(`${label}: уборка временной организации проверена чтением`, left.length === 0, left.join(', ') || 'удалено');
  }
}

const millworkOf = async (service, projectId) => (await service.from('projects').select('millwork').eq('id', projectId).single()).data?.millwork ?? null;
const savedRun = (millwork) => Object.values(millwork?.runs ?? {})[0] ?? null;

/** Телевизор и мебель в сцене против движка: габарит телевизора с кронштейном, модули, панели, пересечения. */
async function sceneAgainst(page, exp, tvWorld, decorWorld, test = () => true) {
  const probe = await tvState(page, (v) => v.tvs.length === 1 && test(v));
  const mods = await cadModules(page);
  const tv = probe?.tvs?.[0] ?? null;
  const decor = decorBox(probe);
  return {
    probe,
    tv,
    mods,
    ok:
      Boolean(tv) &&
      boxNear(tv.boundsMm, tvWorld) &&
      ['tv-body', 'tv-screen', 'tv-mount'].every((name) => tv.parts.includes(name)) &&
      decorCount(probe) === exp.decorParts &&
      (decorWorld ? boxNear(decor, decorWorld) : decor === null) &&
      crossings(tv.boundsMm, mods).length === 0 &&
      crossings(decor, mods).length === 0,
    detail: `ТВ ${tv?.diagonalIn ?? '—'}″ ${fmt(tv?.boundsMm)} (движок ${fmt(tvWorld)}) · деталей панелей ${decorCount(probe)} (движок ${exp.decorParts}) · панели ${fmt(decor)} (движок ${fmt(decorWorld)}) · входов: ТВ ${crossings(tv?.boundsMm, mods).join(', ') || '0'}, панели ${crossings(decor, mods).join(', ') || '0'}`,
  };
}

/* ═════════════════════════  A  ═════════════════════════ */

async function partA(browser) {
  console.log('\n── A (1440 × 900): ТВ-зона A на стене 3800 — сцена, смета, длина стены, блок «ТВ-зона», запись');
  await withOrg(
    'A',
    browser,
    async ({ page, errors, project, service }) => {
      const fx = fixture('A');
      const exp = fx.expect;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      let s = await sceneAgainst(page, exp, exp.tvWorld, exp.decorWorld);
      check(
        'A.1 сцена: тумба из трёх подвесных модулей и телевизор над ней — габарит телевизора с кронштейном до стены тот же, что у движка (`tvBoxMm`), экран выключен, корпус, экран и кронштейн своими сетками; мебель — модули движка; телевизор ни во что не входит',
        s.ok && s.tv.diagonalIn === exp.tv.diagonalIn && s.tv.screen === 'off' && !s.tv.lit && s.mods?.drawn === exp.modules && sameIds(s.mods?.ids, exp.moduleIds),
        `${s.detail} · модулей ${s.mods?.drawn} (движок ${exp.modules}) · экран ${s.tv?.screen}`,
      );
      const list = await estimateLines(page, (v) => v.some((line) => line.key === 'cable_channel'));
      check(
        'A.2 смета на экране: кабель-канал от низа телевизора до верха тумбы, ящики в сборе по фронтам, подвесной крепёж на каждый модуль — количества движка; телевизора заказчика и его кронштейна в смете нет',
        ['cable_channel', 'drawer_box', 'hanging_bracket'].every((key) => lineQty(list, key) === exp.lines[key]) && !list.some((line) => line.key.startsWith('appliance_tv')),
        ['cable_channel', 'drawer_box', 'hanging_bracket'].map((key) => `${key} ${lineQty(list, key)} (движок ${exp.lines[key]})`).join(' · ') +
          ` · строк телевизора ${list.filter((line) => line.key.startsWith('appliance_tv')).length}`,
      );
      await settle(page);
      await shot(page, 'a-day.png');

      /* ── длина стены: 3800 → 2400 → 3800 ── */
      await setWallLength(page, 'w1', fx.resize.lengthMm);
      s = await sceneAgainst(page, exp, fx.resize.tvWorld, null, (v) => v.tvs[0]?.diagonalIn === fx.resize.tv.diagonalIn);
      check(
        `A.3 стена 3800 → ${fx.resize.lengthMm} полем длины: готовое решение пересобралось под новую длину — модули и телевизор ${fx.resize.tv.diagonalIn}″ числом движка, без пересечений`,
        s.ok && sameIds(s.mods?.ids, fx.resize.modules.map((m) => m.id)),
        `${s.detail.replace(/деталей панелей.*?· /, '')} · модули ${(s.mods?.ids ?? []).join(', ')} (движок ${fx.resize.modules.map((m) => m.id).join(', ')})`,
      );
      await settle(page);
      await shot(page, 'a-2400.png');
      await setWallLength(page, 'w1', 3800);
      s = await sceneAgainst(page, exp, exp.tvWorld, exp.decorWorld, (v) => v.tvs[0]?.diagonalIn === exp.tv.diagonalIn);
      check('A.3б обратно 3800 — тот же ряд и телевизор, что до правки длины', s.ok && sameIds(s.mods?.ids, exp.moduleIds), s.detail);

      /* ── блок «ТВ-зона» ── */
      await ensureTool(page, 'furniture');
      await page.waitForSelector(`[data-tv-zone][data-tv-now="${exp.tv.diagonalIn}"]`, { timeout: 20_000 });
      await click(page, `[data-tv-diagonal="${fx.edit.tv65.diagonalIn}"]`, `«${fx.edit.tv65.diagonalIn}″»`);
      await page.waitForSelector(`[data-tv-zone][data-tv-now="${fx.edit.tv65.diagonalIn}"]`, { timeout: 20_000 });
      s = await sceneAgainst(page, exp, fx.edit.tv65World, null, (v) => v.tvs[0]?.diagonalIn === fx.edit.tv65.diagonalIn);
      check(`A.4 «${fx.edit.tv65.diagonalIn}″»: телевизор той же точкой центра и низа — габарит движка, без пересечений`, s.ok, s.detail);
      await click(page, '[data-tv-nudge="left"]', '«← 50»');
      s = await sceneAgainst(page, exp, fx.edit.nudgedWorld, null, (v) => boxNear(v.tvs[0]?.boundsMm, fx.edit.nudgedWorld));
      const place = await page.evaluate(() => document.querySelector('[data-tv-place]')?.textContent ?? '');
      check(
        `A.5 «← 50»: центр ${fx.edit.nudged.centerMm} мм — в сцене габарит движка, в блоке те же отметки словами`,
        s.ok && place.includes(`${fx.edit.nudgedRect.x0}…${fx.edit.nudgedRect.x1} мм по ряду`),
        `${s.detail} · «${place}»`,
      );
      await click(page, '[data-panel-add="slats"]', '«+ Рейки»');
      await page.waitForSelector('[data-tv-zone][data-tv-panels="1"]', { timeout: 20_000 });
      s = await sceneAgainst(
        page,
        { ...exp, decorParts: fx.edit.decorParts },
        fx.edit.tvOnPanelWorld,
        fx.edit.decorWorld,
        (v) => decorCount(v) === fx.edit.decorParts && boxNear(v.tvs[0]?.boundsMm, fx.edit.tvOnPanelWorld),
      );
      const slatWords = await page.evaluate(() => document.querySelector('[data-panel-slat-count]')?.textContent ?? '');
      const panelList = await estimateLines(page, (v) => v.some((line) => line.key === 'decor_panel_slats'));
      check(
        `A.6 «+ Рейки»: панель ${fx.edit.panel.widthMm} × ${fx.edit.panel.heightMm} за телевизором — реек в сцене ${fx.edit.slats} (движок), габарит деталей движка; телевизор встал на панель — от стены ${fx.edit.tvOnPanel.z0}…${fx.edit.tvOnPanel.z1} мм; в смете «Панели стены: Рейки» ${fx.edit.decorSlatsM2} м² «цена не задана»`,
        s.ok &&
          slatWords.includes(`Реек ${fx.edit.slats}.`) &&
          lineQty(panelList, 'decor_panel_slats') === fx.edit.decorSlatsM2 &&
          panelList.some((line) => line.key === 'decor_panel_slats' && line.priceUnset),
        `${s.detail} · «${slatWords}» · рейки ${lineQty(panelList, 'decor_panel_slats')} м² (движок ${fx.edit.decorSlatsM2}) ${panelList.find((line) => line.key === 'decor_panel_slats')?.priceUnset ? 'без цены' : 'С ЦЕНОЙ'}`,
      );

      /* ── низ тумбы 500: верх тумбы уходит в телевизор — отказ словами движка, ряд прежний ── */
      const hang = page.locator('[data-tv-field="hang"]');
      must('поле «Низ от пола» подвесной тумбы', (await hang.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-tv-field="hang"]');
      await hang.first().fill('500');
      await hang.first().press('Enter');
      const refusal = await waitFor(page, () => document.querySelector('[data-tv-refusal]')?.textContent ?? null, (v) => Boolean(v), 15_000);
      const afterHang = await cadModules(page);
      const field = await page.evaluate(() => document.querySelector('[data-tv-field="hang"]')?.value ?? null);
      check(
        'A.7 «Низ от пола» тумбы 500: правка не применена — под блоком слова движка (телевизор заходит в тумбу, мм), тумба на прежней отметке, поле снова показывает число ряда',
        refusal === fx.edit.hangRefusal && fx.edit.hangIds.every((unit) => afterHang?.boxes?.[unit]?.y?.[0] === 300) && field === '300',
        `«${refusal}» (движок «${fx.edit.hangRefusal}») · низ модулей ${fx.edit.hangIds.map((unit) => afterHang?.boxes?.[unit]?.y?.[0]).join(', ')} · поле ${field}`,
      );

      /* ── экран телевизора — вид, а не изделие ── */
      await click(page, '[data-tv-screen="demo"]', '«Демо-картинка»');
      const lit = await tvState(page, (v) => v.tvs[0]?.screen === 'demo');
      check('A.8 «Демо-картинка»: экран телевизора светится картинкой (своя текстура экрана, без источника света)', lit?.tvs?.[0]?.lit === true, `экран ${lit?.tvs?.[0]?.screen} · светится ${lit?.tvs?.[0]?.lit}`);
      await view(page, '3d');
      await settle(page);
      await shot(page, 'a-edited.png');

      must('A: запись дошла', await saved(page), 'состояние записи не «Сохранено»');
      const stored = savedRun(await millworkOf(service, id));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await openStudio(page, id);
      await view3d(page);
      s = await sceneAgainst(page, { ...exp, decorParts: fx.edit.decorParts }, fx.edit.tvOnPanelWorld, fx.edit.decorWorld, (v) => decorCount(v) === fx.edit.decorParts);
      check(
        `A.9 запись и перезагрузка: в базе телевизор ${fx.edit.nudged.diagonalIn}″ с центром ${fx.edit.nudged.centerMm} и панель реек, отпечаток ряда — движка; после перезагрузки в сцене те же телевизор и рейки, экран выключен (экран — вид, с объектом не пишется)`,
        stored?.tv?.diagonalIn === fx.edit.nudged.diagonalIn &&
          stored?.tv?.centerMm === fx.edit.nudged.centerMm &&
          stored?.wallPanels?.length === 1 &&
          stored.wallPanels[0].kind === 'slats' &&
          stored?.fingerprint === fx.edit.fingerprint &&
          s.ok &&
          s.tv.screen === 'off',
        `в базе ТВ ${JSON.stringify(stored?.tv ?? null)} · панелей ${stored?.wallPanels?.length ?? 0} · отпечаток ${stored?.fingerprint} (движок ${fx.edit.fingerprint}) · ${s.detail} · экран ${s.tv?.screen}`,
      );
      check('A: ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  B  ═════════════════════════ */

async function partB(browser) {
  console.log('\n── B (1440 × 900): ТВ-зона B — торцы по дуге, смета, дверца тумбы');
  await withOrg(
    'B',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('B');
      const exp = fx.expect;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      const s = await sceneAgainst(page, exp, exp.tvWorld, exp.decorWorld);
      const radius = await waitFor(page, () => window.__mwCadRadius?.(), (v) => (v?.shaped ?? []).length > 0, 20_000);
      const shaped = (radius?.shaped ?? []).reduce((sum, batch) => sum + batch.parts, 0);
      check(
        'B.1 сцена: подвесная тумба со скруглёнными торцами (детали по контуру — числом движка) и телевизор над ней — габарит движка, без пересечений',
        s.ok && s.mods?.drawn === exp.modules && sameIds(s.mods?.ids, exp.moduleIds) && shaped === exp.shaped,
        `${s.detail} · модулей ${s.mods?.drawn} (движок ${exp.modules}) · по контуру ${shaped} (движок ${exp.shaped})`,
      );
      const list = await estimateLines(page, (v) => v.some((line) => line.key === 'radius_cnc'));
      check(
        'B.2 смета на экране: ЧПУ по дуге торцов «цена не задана», подвесной крепёж на каждый модуль, кабель-канал — количества движка',
        ['radius_cnc', 'hanging_bracket', 'cable_channel', 'drawer_box'].every((key) => lineQty(list, key) === exp.lines[key]) &&
          list.some((line) => line.key === 'radius_cnc' && line.priceUnset),
        ['radius_cnc', 'hanging_bracket', 'cable_channel', 'drawer_box'].map((key) => `${key} ${lineQty(list, key)} (движок ${exp.lines[key]})`).join(' · '),
      );
      await settle(page);
      await shot(page, 'b-day.png');
      const opened = await openByClick(page, fx.door);
      check(`B.3 нажатие по дверце тумбы: открыта одна — ${fx.door}`, Array.isArray(opened) && opened.length === 1 && opened[0] === fx.door, JSON.stringify(opened));
      await shot(page, 'b-door-open.png');
      const closed = await openByClick(page, fx.door);
      check('B.3б то же нажатие закрывает её', Array.isArray(closed) && closed.length === 0, JSON.stringify(closed));
      check('B: ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  C  ═════════════════════════ */

async function partC(browser) {
  console.log('\n── C (1440 × 900): ТВ-зона C — рейки, телевизор на панели, витрины, слои, «Рентген» только с отладкой, короткая стена');
  await withOrg(
    'C',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('C');
      const exp = fx.expect;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      const s = await sceneAgainst(page, exp, exp.tvWorld, exp.decorWorld);
      check(
        `C.1 сцена: две витрины, тумба, стена из реек (${exp.slats} реек — числом движка, габарит деталей движка) и телевизор на панели — от стены ${exp.tvBox.z0}…${exp.tvBox.z1} мм; пересечений нет`,
        s.ok && s.mods?.drawn === exp.modules && sameIds(s.mods?.ids, exp.moduleIds),
        `${s.detail} · модулей ${s.mods?.drawn} (движок ${exp.modules})`,
      );
      const list = await estimateLines(page, (v) => v.some((line) => line.key === 'decor_panel_slats'));
      const keys = ['decor_panel_slats', 'glass_shelf', 'led_display', 'vitrine_frame_profile', 'cable_channel', 'drawer_box'];
      check(
        'C.2 смета на экране: «Панели стены: Рейки» площадью деталей и «цена не задана», стеклянные полки, лента и профиль витрин, кабель-канал — количества движка',
        keys.every((key) => lineQty(list, key) === exp.lines[key]) && list.some((line) => line.key === 'decor_panel_slats' && line.priceUnset),
        keys.map((key) => `${key} ${lineQty(list, key)} (движок ${exp.lines[key]})`).join(' · '),
      );
      await settle(page);
      await shot(page, 'c-day.png');

      /* ── слои: «Каркас» снимает панель (она — слой «Фасады»), «Дизайн» возвращает ── */
      const preset = page.locator('[data-studio-viewport] [data-scene-preset-select]');
      must('список «Вид»', (await preset.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-scene-preset-select]');
      await preset.first().selectOption('frame');
      const frame = await tvState(page, (v) => decorCount(v) === 0, 15_000);
      await preset.first().selectOption('design');
      const design = await tvState(page, (v) => decorCount(v) === exp.decorParts, 15_000);
      check(
        'C.3 «Каркас»: деталей панели в сцене нет (панель — облицовка, слой «Фасады»); «Дизайн»: снова все рейки',
        decorCount(frame) === 0 && decorCount(design) === exp.decorParts,
        `«Каркас» ${decorCount(frame)} · «Дизайн» ${decorCount(design)} (движок ${exp.decorParts})`,
      );
      await settle(page);

      /* ── дверца витрины ── */
      const general = await page.evaluate(() => window.__mwCadCamera());
      const opened = await openByClick(page, fx.door);
      check(`C.4 нажатие по дверце витрины: открыта одна — ${fx.door}`, Array.isArray(opened) && opened.length === 1 && opened[0] === fx.door, JSON.stringify(opened));
      await shot(page, 'c-vitrine-open-general.png');
      /* Стеклянная дверца с общего вида почти не видна — снимок крупным планом, справа от витрины. */
      const close = facing(fx.vitrineCenter, 2.9, 0.5);
      close.position[0] += 1.1;
      await cameraTo(page, close);
      await settle(page);
      await shot(page, 'c-vitrine-open.png');
      if (general) await cameraTo(page, general);
      const closed = await openByClick(page, fx.door);
      check('C.4б то же нажатие закрывает её', Array.isArray(closed) && closed.length === 0, JSON.stringify(closed));

      /* ── «Рентген» — только в отладке ── */
      const plain = await page.evaluate(() => document.querySelectorAll('[data-scene-mode]').length);
      await openStudio(page, id, '?debug=1');
      await view3d(page);
      const debugged = await page.evaluate(() => document.querySelectorAll('[data-scene-mode]').length);
      check('C.5 «Рентген»: без отладки кнопки нет; с `?debug=1` — есть', plain === 0 && debugged > 0, `без отладки ${plain} · с отладкой ${debugged}`);

      /* ── C на стене 2200: отказ словами, цены нет ── */
      const short = fixture('Cshort');
      const shortId = await project(short);
      await openStudio(page, shortId);
      const blocked = await waitFor(
        page,
        () => ({
          blocking: document.querySelector('[data-studio-blocking]')?.textContent ?? '',
          status: document.querySelector('[data-studio-status]')?.getAttribute('data-studio-status') ?? null,
          price: document.querySelector('[data-price-hidden]')?.textContent ?? null,
        }),
        (v) => v.status === 'blocked' && Boolean(v.price),
        30_000,
      );
      check(
        'C.6 C на стене 2200: блокирующее словами раскладки («нужно от 2300 мм… не хватает 100 мм»), состояние «Есть блокирующие ошибки», на месте суммы — «Цены нет: готовая ТВ-зона…»; страница не падает',
        blocked.blocking.includes(short.expect.refusal) && blocked.status === 'blocked' && blocked.price === 'Цены нет: готовая ТВ-зона не собралась на этой стене.',
        `«${blocked.blocking.slice(0, 200)}» · ${blocked.status} · «${blocked.price}»`,
      );
      await shot(page, 'c-short-refused.png');
      check('C: ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  LIGHT  ═════════════════════════ */

const lighting = (page) => page.evaluate(() => (window.__mwLighting ? window.__mwLighting() : null));
const sample = (page, points) => page.evaluate((p) => (window.__mwLightingSample ? window.__mwLightingSample(p) : null), points);
const lightsReady = (page, test, ms = 90_000) => waitFor(page, () => window.__mwLighting?.(), (v) => Boolean(v) && v.warming !== true && test(v), ms);
const mean = (values) => (values && values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10 : null);
async function openLighting(page) {
  await ensureTool(page, 'lighting');
  await page.waitForSelector('[data-lighting-panel]', { timeout: 30_000 });
  await sleep(400);
}
async function designOn(page) {
  const btn = page.locator('[data-light-design]');
  must('кнопка «Интерьер»', (await btn.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-light-design]');
  if ((await btn.first().getAttribute('aria-pressed')) !== 'true') await btn.first().click();
  const l = await lightsReady(page, (v) => v.design === true);
  must('режим «Интерьер» в сцене, программы света собраны', l?.design === true, l ? `программы ещё собираются (${l.ready})` : 'НУЛЕВОЙ СЕЛЕКТОР: __mwLighting нет');
}
/** Точка видна камере: первое попадание луча — на её расстоянии, а не ближе. */
const visible = async (page, point) => {
  const at = await page.evaluate((p) => (window.__mwLightingProject ? window.__mwLightingProject([p]) : null), point);
  const hit = at?.[0];
  return { ok: Boolean(hit?.first) && Math.abs(hit.first.distanceM - hit.toPointM) < 0.03, hit };
};

async function partLight(browser) {
  console.log('\n── LIGHT (1440 × 900): «Интерьер» — лента за панелью, витрины, лента под тумбой; день и ночь');
  await withOrg(
    'LIGHT',
    browser,
    async ({ page, errors, project, service }) => {
      const fx = fixture('C');
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      await openLighting(page);
      await designOn(page);
      await click(page, '[data-light-tab="furniture"]', 'вкладка «Подсветка мебели»');
      await click(page, `[data-light-panel="${fx.halo.panelId}"] [data-light-add-panel="contour"]`, '«подсветка по контуру» панели');
      const key = `panel-led:${fx.halo.wallId ?? '-'}:${fx.halo.panelId}`;
      let l = await lightsReady(page, (v) => v.rects.filter((r) => r.kind === 'panel' && r.shown).length === 4);
      const panelRects = (l?.rects ?? []).filter((r) => r.kind === 'panel');
      const directions = panelRects.map((r) => r.normal.map((v) => Math.round(v)).join(',')).sort().join(' ');
      check(
        'L.1 «подсветка по контуру» панели реек: четыре полосы ленты своими источниками у краёв панели — свет от краёв наружу (вверх, вниз, влево, вправо); днём выключены, как все светильники сценария A «День»',
        panelRects.length === 4 &&
          panelRects.every((r) => r.shown && !r.on && r.source === key) &&
          directions === '-1,0,0 0,-1,0 0,1,0 1,0,0' &&
          l?.ambient === 'day',
        `${panelRects.map((r) => `${r.on ? 'вкл' : 'выкл'} ${r.normal.join(',')}`).join(' · ') || 'полос нет'} · ${l?.ambient}`,
      );
      await view(page, '3d');
      await settle(page);
      await shot(page, 'c-interior-day.png');

      await click(page, '[data-ambient="night"]', 'ночь');
      l = await lightsReady(page, (v) => v.ambient === 'night');
      check(
        'L.1б ночь: все четыре полосы ленты за панелью включились — своего выключателя у них нет, ночью светит всё',
        (l?.rects ?? []).filter((r) => r.kind === 'panel' && r.shown && r.on).length === 4,
        (l?.rects ?? []).filter((r) => r.kind === 'panel').map((r) => (r.on ? 'вкл' : 'выкл')).join(' · '),
      );
      await view(page, '3d');
      await settle(page);
      const general = await page.evaluate(() => window.__mwCadCamera());

      /* Витрины: лента включена по умолчанию; полка светлее с ней (общий вид). */
      const vitrineKey = `display:${fx.door.split(':')[0]}`;
      l = await lighting(page);
      const shelfPoints = l?.samples?.vitrine ?? [];
      must('L: точки полок витрин', shelfPoints.length === 2, `точек ${shelfPoints.length}`);
      const vitrinePoint = [shelfPoints[0]];
      const vitrineOn = mean(await sample(page, vitrinePoint));
      const pressed = await page.evaluate((k) => document.querySelector(`[data-light-on="${k}"]`)?.getAttribute('aria-pressed') ?? null, vitrineKey);
      await click(page, `[data-light-on="${vitrineKey}"]`, 'лента витрины: выкл');
      await lightsReady(page, (v) => v.rects.filter((r) => r.kind === 'display' && r.source === vitrineKey).every((r) => !r.on));
      const vitrineOff = mean(await sample(page, vitrinePoint));
      await click(page, `[data-light-on="${vitrineKey}"]`, 'лента витрины: вкл');
      await lightsReady(page, (v) => v.rects.filter((r) => r.kind === 'display' && r.source === vitrineKey).every((r) => r.on));
      check(
        'L.3 ночь: полка витрины со своей лентой светлее, чем без неё',
        pressed === 'true' && vitrineOn !== null && vitrineOff !== null && vitrineOn >= 0 && vitrineOff >= 0 && vitrineOn - vitrineOff >= 5,
        `лента была ${pressed === 'true' ? 'вкл' : 'выкл'} · полка с лентой ${vitrineOn} · без ${vitrineOff}`,
      );

      /* Стена над панелью — камерой перед ней (поза от точки фикстуры). */
      /* Цель — верх панели (внутри габарита мебели), камера выше неё; точка замера — над панелью, в кадре. */
      must('L: камера перед стеной над панелью', await cameraTo(page, facing(fx.halo.target, 3.0, 0.35)), 'поза не встала');
      const seen = await visible(page, fx.halo.above);
      must('L: точка стены над панелью видна камере', seen.ok, JSON.stringify(seen.hit));
      const haloOn = mean(await sample(page, [fx.halo.above]));
      await click(page, `[data-light-on="${key}"]`, 'лента панели: выкл');
      await lightsReady(page, (v) => v.rects.filter((r) => r.kind === 'panel').every((r) => !r.on));
      const haloOff = mean(await sample(page, [fx.halo.above]));
      await click(page, `[data-light-on="${key}"]`, 'лента панели: вкл');
      await lightsReady(page, (v) => v.rects.filter((r) => r.kind === 'panel').every((r) => r.on));
      const haloBack = mean(await sample(page, [fx.halo.above]));
      check(
        'L.2 ночь: стена над панелью с лентой светлее, чем без неё (выключили — потемнела, включили — снова светлая)',
        haloOn !== null && haloOff !== null && haloOn >= 0 && haloOff >= 0 && haloOn - haloOff >= 5 && Math.abs(haloBack - haloOn) <= 3,
        `светлота с лентой ${haloOn} · без ${haloOff} · снова ${haloBack}`,
      );
      if (general) await cameraTo(page, general);

      /* Ночной снимок: лента панели и витрин, на экране телевизора — демо-картинка. */
      await ensureTool(page, 'furniture');
      await click(page, '[data-tv-screen="demo"]', '«Демо-картинка»');
      await view(page, '3d');
      await settle(page);
      await shot(page, 'c-night-led.png');

      must('L: запись дошла', await saved(page), 'состояние записи не «Сохранено»');
      const stored = await millworkOf(service, id);
      const fixture1 = (stored?.lighting?.fixtures ?? []).find((f) => f.kind === 'panel_led');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await openStudio(page, id);
      await view3d(page);
      await openLighting(page);
      l = await lightsReady(page, (v) => v.rects.filter((r) => r.kind === 'panel' && r.shown).length === 4, 120_000);
      check(
        'L.4 запись и перезагрузка: в базе лента панели (по контуру, ключ панели и стены); после перезагрузки в сцене снова четыре полосы, ночь',
        fixture1?.panelId === fx.halo.panelId && fixture1?.mode === 'contour' && (l?.rects ?? []).filter((r) => r.kind === 'panel' && r.on).length === 4 && l?.ambient === 'night',
        `в базе ${JSON.stringify(fixture1 ?? null)} · полос ${(l?.rects ?? []).filter((r) => r.kind === 'panel').length} · ${l?.ambient}`,
      );

      /* ── B: лента под подвесной тумбой ── */
      const fb = fixture('B');
      const idB = await project(fb);
      await openStudio(page, idB);
      await view3d(page);
      await ensureTool(page, 'select');
      await click(page, `[data-object-module="${fb.under.moduleId}"]`, `модуль ${fb.under.moduleId} в списке объектов`);
      await openLighting(page);
      await designOn(page);
      await click(page, '[data-light-tab="furniture"]', 'вкладка «Подсветка мебели»');
      await click(page, '[data-light-add-module="under"]', '«под тумбой»');
      const underKey = `module-led:${fb.under.moduleId}`;
      l = await lightsReady(page, (v) => v.rects.some((r) => r.source === underKey && r.shown));
      const under = (l?.rects ?? []).filter((r) => r.source === underKey);
      await click(page, '[data-ambient="night"]', 'ночь');
      l = await lightsReady(page, (v) => v.ambient === 'night');
      const underNight = (l?.rects ?? []).filter((r) => r.source === underKey);
      check(
        'L.5 «под тумбой»: одна полоса ленты под дном подвесного модуля, свет вниз, своим источником; днём выключена (сценарий A), ночью светит',
        under.length === 1 && !under[0].on && under[0].normal[1] < -0.99 && underNight.length === 1 && underNight[0].on,
        under.map((r) => `${r.kind} днём ${r.on ? 'вкл' : 'выкл'} нормаль ${r.normal.join(',')} у ${r.positionMm.join(',')}`).join(' · ') +
          ` · ночью ${underNight.map((r) => (r.on ? 'вкл' : 'выкл')).join(',') || 'полосы нет'}`,
      );
      await view(page, '3d');
      await settle(page);
      const generalB = await page.evaluate(() => window.__mwCadCamera());
      const floorPose = facing(fb.under.target, 2.6, 0.85);
      must('L: камера перед полом под тумбой', await cameraTo(page, floorPose), 'поза не встала');
      const floorSeen = await visible(page, fb.under.floor);
      must('L: пол под тумбой виден камере', floorSeen.ok, JSON.stringify(floorSeen.hit));
      const floorOn = mean(await sample(page, [fb.under.floor]));
      await openLighting(page);
      await click(page, '[data-light-tab="furniture"]', 'вкладка «Подсветка мебели»');
      await click(page, `[data-light-on="${underKey}"]`, 'лента под тумбой: выкл');
      await lightsReady(page, (v) => v.rects.filter((r) => r.source === underKey).every((r) => !r.on));
      await view(page, '3d');
      await cameraTo(page, floorPose);
      const floorOff = mean(await sample(page, [fb.under.floor]));
      await openLighting(page);
      await click(page, `[data-light-on="${underKey}"]`, 'лента под тумбой: вкл');
      await lightsReady(page, (v) => v.rects.filter((r) => r.source === underKey).every((r) => r.on));
      check('L.6 ночь: пол под тумбой с лентой светлее, чем без неё', floorOn !== null && floorOff !== null && floorOn >= 0 && floorOff >= 0 && floorOn - floorOff >= 5, `пол с лентой ${floorOn} · без ${floorOff}`);
      await view(page, '3d');
      if (generalB) await cameraTo(page, generalB);
      await settle(page);
      await shot(page, 'b-night-under.png');
      check('LIGHT: ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  PLAN  ═════════════════════════ */

async function partPlan(browser) {
  console.log('\n── PLAN (1440 × 900): план Studio, фасад и деталировка C');
  await withOrg(
    'PLAN',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('C');
      const exp = fx.expect;
      const panel = exp.panels[0];
      const id = await project(fx);
      await openStudio(page, id);
      await view(page, 'plan');
      await page.waitForSelector('[data-studio-viewport] [data-plan-kind="room"] [data-plan-tv]', { timeout: 30_000 });
      const plan = await page.evaluate(() => {
        const root = document.querySelector('[data-studio-viewport] [data-plan-kind="room"]');
        const tv = root?.querySelector('[data-plan-tv]');
        const panels = Array.from(root?.querySelectorAll('[data-plan-panel]') ?? []).map((el) => ({
          id: el.getAttribute('data-plan-panel'),
          from: Number(el.getAttribute('data-from-mm')),
          width: Number(el.getAttribute('data-width-mm')),
          front: Number(el.getAttribute('data-front-mm')),
        }));
        return {
          tv: tv
            ? {
                diagonal: Number(tv.getAttribute('data-plan-tv')),
                from: Number(tv.getAttribute('data-from-mm')),
                to: Number(tv.getAttribute('data-to-mm')),
                back: Number(tv.getAttribute('data-back-mm')),
                front: Number(tv.getAttribute('data-front-mm')),
              }
            : null,
          panels,
          modules: root?.querySelectorAll('[data-plan-module]').length ?? 0,
        };
      });
      check(
        `PLAN.1 план Studio: телевизор ${exp.tv.diagonalIn}″ на отметках ряда ${exp.tvBox.x0}…${exp.tvBox.x1} мм и ${exp.tvBox.z0}…${exp.tvBox.z1} мм от стены (на панели), панель реек ${panel.fromMm}…${panel.fromMm + panel.widthMm} мм толщиной ${panel.thicknessMm}, модулей ${exp.modules} — числа движка`,
        plan.tv?.diagonal === exp.tv.diagonalIn &&
          plan.tv.from === exp.tvBox.x0 &&
          plan.tv.to === exp.tvBox.x1 &&
          plan.tv.back === exp.tvBox.z0 &&
          plan.tv.front === exp.tvBox.z1 &&
          plan.panels.length === 1 &&
          plan.panels[0].from === panel.fromMm &&
          plan.panels[0].width === panel.widthMm &&
          plan.panels[0].front === panel.thicknessMm &&
          plan.modules === exp.modules,
        JSON.stringify(plan),
      );
      const fit = page.locator('[data-studio-fit]');
      if ((await fit.count()) > 0) await fit.first().click();
      await shot(page, 'c-plan.png');

      await view(page, 'facade');
      await page.waitForSelector('[data-studio-viewport] [data-tv]', { timeout: 30_000 });
      const facade = await page.evaluate(() => {
        const root = document.querySelector('[data-studio-viewport]');
        const tv = root?.querySelector('[data-tv]');
        return {
          tv: tv ? ['data-from-mm', 'data-width-mm', 'data-bottom-mm', 'data-top-mm'].map((a) => Number(tv.getAttribute(a))) : null,
          slats: root?.querySelectorAll('[data-panel-part="slat"]').length ?? 0,
          panel: root?.querySelector('[data-wall-panel]')?.getAttribute('data-kind') ?? null,
        };
      });
      check(
        `PLAN.2 фасад: телевизор ${exp.tvRect.x0}…${exp.tvRect.x1} × ${exp.tvRect.y0}…${exp.tvRect.y1} мм, рейки — каждая (${exp.slats})`,
        JSON.stringify(facade.tv) === JSON.stringify([exp.tvRect.x0, exp.tvRect.x1 - exp.tvRect.x0, exp.tvRect.y0, exp.tvRect.y1]) && facade.slats === exp.slats && facade.panel === 'slats',
        JSON.stringify(facade),
      );
      await shot(page, 'c-facade.png');

      /* Деталировка — кнопкой в шапке Studio (в нижней полосе её нет). */
      await click(page, '[data-studio-open="panels"]', '«Деталировка» в шапке');
      await page.waitForSelector('[data-studio-panels] [data-panel-row]', { timeout: 30_000 });
      const rows = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-studio-panels] [data-panel-row]')).map((el) => ({
          module: el.getAttribute('data-module-id'),
          qty: Number(el.getAttribute('data-part-qty')),
          number: el.getAttribute('data-panel-row'),
        })),
      );
      const panelRows = rows.filter((row) => (row.module ?? '').endsWith(`:panel:${panel.id}`));
      check(
        `PLAN.3 деталировка: рейки панели — строками раскроя (номера «П1.»), деталей ${exp.slats} — столько, сколько в сцене и на фасаде`,
        panelRows.length > 0 && panelRows.reduce((sum, row) => sum + row.qty, 0) === exp.slats && panelRows.every((row) => (row.number ?? '').startsWith('П1.')),
        `строк ${panelRows.length} · деталей ${panelRows.reduce((sum, row) => sum + row.qty, 0)} · номера ${panelRows.map((row) => row.number).join(', ')}`,
      );
      await shot(page, 'c-panels.png');
      check('PLAN: ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  TABLET  ═════════════════════════ */

async function partTablet(browser) {
  console.log('\n── TABLET (1024 × 768, касание): блок «ТВ-зона» досягаем');
  await withOrg(
    'TABLET',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('A');
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      await ensureTool(page, 'furniture');
      await page.waitForSelector(`[data-tv-zone][data-tv-now="${fx.expect.tv.diagonalIn}"]`, { timeout: 20_000 });
      await tap(page, '[data-tv-diagonal="75"]', '«75″» касанием');
      await page.waitForSelector('[data-tv-zone][data-tv-now="75"]', { timeout: 20_000 });
      const probe = await tvState(page, (v) => v.tvs[0]?.diagonalIn === 75);
      const layout = await page.evaluate(() => ({
        scroll: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
        buttons: Array.from(document.querySelectorAll('[data-tv-zone] button')).map((b) => b.getBoundingClientRect().height).filter((h) => h > 0),
      }));
      check(
        'TABLET.1 1024 × 768 касанием: «75″» — телевизор в сцене 75″; кнопки блока «ТВ-зона» не ниже 28 px; прокрутки по ширине нет',
        probe?.tvs?.[0]?.diagonalIn === 75 && layout.scroll <= 0 && layout.buttons.length > 0 && layout.buttons.every((h) => h >= 28),
        `ТВ ${probe?.tvs?.[0]?.diagonalIn}″ · прокрутка ${layout.scroll} px · кнопок ${layout.buttons.length}, наименьшая ${Math.min(...layout.buttons).toFixed(0)} px`,
      );
      await view(page, '3d');
      await settle(page);
      await shot(page, 'tablet.png');
      check('TABLET: ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1024, height: 768 }, touch: true },
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
      const [tx, , tz] = base.target;
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
/** От нажатия до кадра, где условие стало правдой, и наибольшая длинная задача за это время. */
async function timed(page, selector, condition, limitMs = 90_000) {
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
          const pose = window.__mwCadCamera?.();
          if (pose) window.__mwCadCamera({ position: pose.position, target: pose.target });
        }
        if (met !== null && window.__ltFrames.slice(startFrames).some((f) => f.t >= met)) {
          const ms = Math.round(performance.now() - t0);
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
  const runIndex = Number(process.env.RUN ?? 1);
  console.log(`\n── PERF (планшет 1024 × 768 × 2, касание, процессор ×4): сборка ${build}, прогон ${runIndex}`);
  const result = { build, run: runIndex, at: new Date().toISOString(), objects: {} };
  await withOrg(
    'PERF',
    browser,
    async ({ page, context, project }) => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const heap = async () => {
        await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined);
        const { usedSize } = await cdp.send('Runtime.getHeapUsage');
        return Math.round((usedSize / 1048576) * 10) / 10;
      };
      for (const key of ['living', 'C']) {
        const fx = fixture(key);
        const id = await project(fx);
        const r = {};
        const t0 = Date.now();
        await openStudio(page, id);
        r.studioMs = Date.now() - t0;
        await view(page, '3d');
        const scene = await sceneReady(page);
        r.room3dMs = scene.ms;
        must(`PERF ${key}: 3D готова`, scene.state === 'ready', `состояние ${scene.state}`);
        const pose = await stablePose(page);
        r.cad = { frame: await frameAt(page, pose), orbit: await orbit(page, pose), heapMb: await heap() };
        await openLighting(page);
        const ready = 'const v = window.__mwLighting?.(); return Boolean(v) && v.warming !== true';
        r.designOn = await timed(page, '[data-light-design]', `${ready} && v.design === true`);
        await sleep(800);
        r.night = await timed(page, '[data-ambient="night"]', 'return window.__mwLighting?.()?.ambient === "night"');
        await sleep(800);
        if (key === 'C') {
          await page.locator('[data-light-tab="furniture"]').first().click();
          await sleep(400);
          r.addPanelLed = await timed(page, '[data-light-add-panel="contour"]', `${ready} && v.rects.filter((r) => r.kind === "panel" && r.shown).length === 4`);
          await sleep(800);
        }
        await view(page, '3d');
        await sleep(600);
        r.interior = { frame: await frameAt(page, pose), orbit: await orbit(page, pose), heapMb: await heap() };
        result.objects[key] = r;
        console.log(`  ${key}: ${JSON.stringify(r)}`);
      }
    },
    { viewport: { width: 1024, height: 768 }, touch: true, scale: 2, probe: true },
  );
  writeFileSync(`${OUT}/perf-${build}-${runIndex}.json`, JSON.stringify(result, null, 2));
  check('PERF: замер записан', Object.keys(result.objects).length === 2, `${OUT}/perf-${build}-${runIndex}.json`);
}

/* ═════════════════════════  запуск  ═════════════════════════ */

async function main() {
  const unknown = PARTS.filter((p) => !KNOWN.includes(p));
  if (unknown.length > 0) throw new Stop(`неизвестная часть: ${unknown.join(', ')} — есть ${KNOWN.join(', ')}`);
  loadEnv();
  mkdirSync(OUT, { recursive: true });
  const id = buildId();
  console.log(`сборка ${id} · части ${PARTS.join(', ')}`);
  freePort(PORT);
  const log = createWriteStream(`${OUT}/server-${PARTS.join('-')}.log`);
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { shell: true, env: { ...process.env, SITE_PASSWORD: '' } });
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  try {
    const until = Date.now() + 90_000;
    for (;;) {
      try {
        const res = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(5_000) });
        if (res.status < 500) break;
      } catch {
        /* сервер ещё поднимается */
      }
      if (Date.now() > until) throw new Stop('сервер не поднялся за 90 с');
      await sleep(1000);
    }
    const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu'] });
    try {
      for (const part of PARTS) {
        const started = Date.now();
        try {
          if (part === 'A') await partA(browser);
          if (part === 'B') await partB(browser);
          if (part === 'C') await partC(browser);
          if (part === 'light') await partLight(browser);
          if (part === 'plan') await partPlan(browser);
          if (part === 'tablet') await partTablet(browser);
          if (part === 'perf') await partPerf(browser);
          check(`часть ${part} дошла до конца`, true, `${Math.round((Date.now() - started) / 1000)} с`);
        } catch (error) {
          check(`часть ${part} дошла до конца`, false, error instanceof Error ? error.message.slice(0, 300) : String(error));
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
    freePort(PORT);
  }
}

main()
  .catch((error) => {
    failed += 1;
    console.log(`  FAIL прогон прерван: ${error instanceof Stop ? error.message : error.stack ?? error}`);
  })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed === 0 ? 0 : 1);
  });
