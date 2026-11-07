/** Studio в режиме мобильного Chrome (Android): пробы и приёмка — см. `PART`. */
import { execSync, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_ANDROID ?? 3329);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/android';
const PARTS = (process.env.PART ?? 'zones').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['zones', 'flow', 'guard'];
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
const near = (a, b, tol) => Math.abs(a - b) <= tol;

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
      execSync('npx tsx --tsconfig tsconfig.scripts.json scripts/android-room-fixture.ts', {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  }
  const fx = fixtures[key];
  if (!fx) throw new Stop(`нет объекта «${key}» в android-room-fixture`);
  return fx;
}

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
async function openStudio(page, projectId) {
  await page.goto(`${BASE}/project/${projectId}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
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
async function view3d(page) {
  await view(page, '3d');
  const t0 = Date.now();
  let state = null;
  while (Date.now() - t0 < 120_000) {
    state = await page.evaluate(() => document.querySelector('[data-studio-viewport] [data-scene]')?.getAttribute('data-scene-state') ?? null);
    if (state === 'ready' || state === 'failed') break;
    await sleep(150);
  }
  must('3D готова', state === 'ready', `состояние ${state ?? 'НЕТ'} за ${Date.now() - t0} мс`);
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
async function press(page, selector, label, { touch = false } = {}) {
  const el = page.locator(selector);
  must(label, (await el.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: ${selector}`);
  await el.first().scrollIntoViewIfNeeded().catch(() => undefined);
  if (touch) await el.first().tap({ timeout: 15_000 });
  else await el.first().click({ timeout: 15_000 });
  await sleep(450);
}
/** Нарисованная техника всех рядов сцены — окошко `ApplianceModels3D` (по ряду), одним списком. */
const drawn = (page) =>
  page.evaluate(() => Object.values(window.__mwApplianceModels ?? {}).flat().sort((a, b) => (a.moduleId < b.moduleId ? -1 : 1)));
const doors = (page) => page.evaluate(() => (window.__mwApplianceDoors ? window.__mwApplianceDoors() : null));
const lines = (page) => page.evaluate(() => (window.__mwEstimateLines ? window.__mwEstimateLines() : []));
const moving = (page) => page.evaluate(() => (window.__mwMovingCount ? window.__mwMovingCount() : -1));
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
async function saved(page, ms = 30_000) {
  const state = await waitFor(page, () => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null, (v) => v === 'saved', ms);
  return state === 'saved';
}
const READ_STATUS = () => ({
  status: document.querySelector('[data-studio-status]')?.getAttribute('data-studio-status') ?? null,
  hidden: document.querySelectorAll('[data-price-hidden]').length,
  strip: document.querySelector('[data-studio-blocking]')?.innerText ?? '',
});
/* ─────────────────────────  организация  ───────────────────────── */

const limitedFetch = (input, init = {}) => fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) });

async function withOrg(label, browser, body, { contextOptions, production = null }) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: limitedFetch },
  });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const made = { users: [], orgs: [], projects: [] };
  try {
    const email = `android-${stamp}@example.test`;
    const password = `Pw-${stamp}-android!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    made.users.push(data.user.id);
    const { data: org, error: orgError } = await service.from('orgs').insert({ slug: `android-${stamp}`, name: `Проверка Android ${label}` }).select('id').single();
    if (orgError) throw new Error(`insert org: ${orgError.message}`);
    made.orgs.push(org.id);
    const { error: memberError } = await service.from('org_members').insert({ org_id: org.id, user_id: data.user.id, role: 'owner' });
    if (memberError) throw new Error(`insert member: ${memberError.message}`);
    /* Школа цеха временной организации (цоколь 150 и т. п.) — как её заводит «Настройки цеха». */
    if (production) {
      const { error: prodError } = await service.from('orgs').update({ production }).eq('id', org.id);
      if (prodError) throw new Error(`update production: ${prodError.message}`);
    }
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
    const context = await browser.newContext(contextOptions);
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
          address: `Кухня ${label}: ${fx.title}`,
          zone: fx.zone,
          measurements: fx.measurement,
          millwork: {
            survey: fx.survey,
            /* Своя сборка без решения; у ТВ-зоны — её решение. */
            ...(fx.templateId ? { templateId: fx.templateId } : {}), ...(fx.runs ? { runs: fx.runs } : {}),
            requirements: fx.requirements,
            selectedVariant: 'optimal',
            shape: fx.shape,
            ...(fx.corners.length > 0 ? { corners: fx.corners } : {}),
          },
        })
        .select('id')
        .single();
      if (projectError) throw new Error(`insert project: ${projectError.message}`);
      made.projects.push(row.id);
      return row.id;
    };
    await body({ page, errors, project, service, orgId: org.id });
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

/* ─────────────────────────  профили устройств  ───────────────────────── */

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROFILES = {
  'android-1280': { viewport: { width: 1280, height: 752 }, screen: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, userAgent: ANDROID_UA },
  'android-800': { viewport: { width: 800, height: 1232 }, screen: { width: 800, height: 1280 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, userAgent: ANDROID_UA },
  desktop: { viewport: { width: 1440, height: 900 } },
};
const CHOSEN = (process.env.PROFILE ?? 'android-1280,desktop').split(',');

async function openRoom(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const t0 = Date.now();
  let calm = 0;
  while (Date.now() - t0 < 60_000) {
    const state = await page.evaluate(() => ({
      root: Boolean(document.querySelector('[data-studio-root]')),
      crash: /Application error|client-side exception/.test(document.body?.innerText ?? ''),
      bound: document.querySelectorAll('[data-block-fault]').length,
    }));
    if (state.crash) return { ...state, ms: Date.now() - t0 };
    calm = state.root ? calm + 1 : 0;
    if (calm >= 8) return { ...state, ms: Date.now() - t0 };
    await sleep(500);
  }
  return { root: false, crash: false, bound: 0, ms: 60_000 };
}

/** Копии настоящих объектов — только чтение строк и запись в ВРЕМЕННУЮ организацию. */
async function copiesOf(service, orgId, ids) {
  const out = [];
  for (const id of ids) {
    const { data } = await service.from('projects').select('zone, measurements, millwork').eq('id', id).single();
    if (!data) continue;
    const { data: row, error } = await service.from('projects').insert({ org_id: orgId, client_name: 'Проверка', status: 'in_progress', address: `Копия ${id.slice(0, 8)}`, zone: data.zone, measurements: data.measurements, millwork: data.millwork }).select('id').single();
    if (error) throw new Error(`копия: ${error.message}`);
    out.push({ key: `копия ${id.slice(0, 8)} (${data.zone})`, id: row.id });
  }
  return out;
}

async function partZones(browser) {
  const { objects } = fixture('objects') ? { objects: fixture('objects') } : { objects: [] };
  for (const name of CHOSEN) {
    console.log(`\n── ${name}`);
    await withOrg(name, browser, async ({ page, errors, project, service, orgId }) => {
      const faults = [];
      page.on('pageerror', (e) => faults.push(`${e.name}: ${e.message.slice(0, 170)}`));
      const list = [];
      for (const fx of objects) list.push({ key: fx.key, id: await project(fx) });
      const real = (process.env.REAL ?? '').split(',').filter(Boolean);
      const copies = await copiesOf(service, orgId, real);
      for (const item of [...list, ...copies]) {
        faults.length = 0;
        const room = await openRoom(page, `${BASE}/project/${item.id}/room`);
        check(`${name} · ${item.key}: Studio открылась, белого экрана нет`, room.root && !room.crash, `${JSON.stringify(room)} · ${faults[0] ?? ''}`);
      }
      void errors;
      /* Уборка копий: `project()` их не знает. */
      for (const copy of copies) await service.from('projects').delete().eq('id', copy.id);
    }, { contextOptions: PROFILES[name] });
  }
}

/* ─────────────────────────  путь человека  ───────────────────────── */

const modulesNow = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-studio-objects] [data-object-module]')].map((el) => ({ id: el.getAttribute('data-object-module'), text: el.textContent ?? '' })));
const noWhiteScreen = async (page) => {
  const crash = await page.evaluate(() => /Application error|client-side exception/.test(document.body?.innerText ?? ''));
  const height = await page.evaluate(() => (document.body?.innerText ?? '').trim().length);
  return !crash && height > 50;
};

async function partFlow(browser) {
  const { objects } = { objects: fixture('objects') };
  for (const name of CHOSEN) {
    const touch = Boolean(PROFILES[name].hasTouch);
    console.log(`\n── ${name}: список, Studio, 2D и 3D, размер, запись, повторное открытие`);
    await withOrg(name, browser, async ({ page, errors, project, service }) => {
      const bedroom = objects.find((fx) => fx.key === 'bedroom');
      const id = await project(bedroom);
      await page.goto(`${BASE}/projects`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForFunction((word) => (document.body?.innerText ?? '').includes(word), 'Проверка', { timeout: 30_000 });
      check(`${name} 1 список проектов открылся, объект в нём`, await noWhiteScreen(page), '');

      const room = await openRoom(page, `${BASE}/project/${id}/room`);
      check(`${name} 2 Studio открылась на существующем объекте`, room.root && !room.crash, JSON.stringify(room));
      await openStudio(page, id);
      await view(page, 'plan');
      check(`${name} 3 план`, await noWhiteScreen(page), '');
      await view(page, 'facade');
      const marks = await waitFor(page, () => document.querySelectorAll('[data-studio-viewport] [data-module-id]').length, (n) => n > 0, 20_000);
      check(`${name} 3 фасад: модули на чертеже`, marks > 0, `${marks}`);
      await view3d(page);
      check(`${name} 4 3D готова`, await noWhiteScreen(page), '');
      await shot(page, `flow-${name}-3d.png`);

      await ensureTool(page, 'select');
      await waitFor(page, () => document.querySelectorAll('[data-studio-objects] [data-object-module]').length, (n) => n > 0, 30_000);
      const units = await modulesNow(page);
      const unit = units[0];
      await press(page, `[data-object-module="${unit.id}"]`, `модуль ${unit.text}`, { touch });
      const field = page.locator('[data-module-size-field="width"]');
      must(`${name} поле ширины`, (await field.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-module-size-field="width"]');
      const was = Number(await field.first().inputValue());
      const target = was - 50;
      await field.first().scrollIntoViewIfNeeded().catch(() => undefined);
      await field.first().fill(String(target));
      await sleep(400);
      await press(page, '[data-module-size-apply="width"]', `${name} ширина ${target}`, { touch });
      await sleep(800);
      const changed = (await modulesNow(page)).map((m) => m.text).join(' | ');
      check(`${name} 5 размер шкафа изменён: ${was} → ${target}`, new RegExp(`\\+${target}`).test(changed), changed);
      must(`${name} 6 записано`, await saved(page), 'нет «Сохранено»');
      const stored = JSON.stringify(await millworkOf(service, id));
      check(`${name} 6 сохранение: новая ширина в базе`, stored.includes(`"widthMm":${target}`), '');

      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      await openStudio(page, id);
      await ensureTool(page, 'select');
      await waitFor(page, () => document.querySelectorAll('[data-studio-objects] [data-object-module]').length, (n) => n > 0, 30_000);
      const reopened = (await modulesNow(page)).map((m) => m.text).join(' | ');
      check(`${name} 7 повторное открытие: тот же размер, белого экрана нет`, new RegExp(`\\+${target}`).test(reopened) && (await noWhiteScreen(page)), reopened);
      check(`${name} 8 ошибок страницы нет`, errors.length === 0, errors.join(' | '));
    }, { contextOptions: PROFILES[name] });
  }
}

/* ─────────────────────────  защита  ───────────────────────── */

async function partGuard(browser) {
  const { objects } = { objects: fixture('objects') };
  for (const name of CHOSEN) {
    console.log(`\n── ${name}: упавший блок не роняет редактор`);
    await withOrg(name, browser, async ({ page, project, service, orgId }) => {
      const id = await project(objects.find((fx) => fx.key === 'kitchen'));
      await page.addInitScript(() => {
        window.__mwBreakBlock = 'Место на стене';
      });
      const room = await openRoom(page, `${BASE}/project/${id}/room`);
      const fault = await page.evaluate(() => document.querySelector('[data-block-fault]')?.textContent ?? '');
      check(`${name} блок упал, Studio жива, причина словами`, room.root && !room.crash && /Место на стене/.test(fault) && /проба границы/.test(fault), `${JSON.stringify(room)} · ${fault.slice(0, 140)}`);
      await openStudio(page, id);
      await view3d(page);
      check(`${name} редактор работает: 3D открылась рядом с упавшим блоком`, await noWhiteScreen(page), '');
      await page.evaluate(() => {
        window.__mwBreakBlock = undefined;
      });
      await press(page, '[data-block-retry]', 'открыть блок снова');
      const back = await waitFor(page, () => Boolean(document.querySelector('[data-row-fit]')), Boolean, 10_000);
      check(`${name} блок открылся снова`, back === true, String(back));

      /* Объект, испорченный целиком: вместо белого экрана — слова и выход. Настоящие объекты не трогаются: строка временной организации. */
      const { data: bad, error } = await service.from('projects').insert({ org_id: orgId, client_name: 'Проверка', status: 'in_progress', address: 'Испорченный', zone: 'Кухня', measurements: { walls: 'испорчено' }, millwork: { requirements: { options: null }, survey: { walls: 'испорчено' } } }).select('id').single();
      if (error) throw new Error(error.message);
      try {
        await page.addInitScript(() => undefined);
        await page.goto(`${BASE}/project/${bad.id}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await sleep(3500);
        const screen = await page.evaluate(() => ({ error: document.querySelector('[data-project-error]')?.textContent ?? '', crash: /Application error|client-side exception/.test(document.body?.innerText ?? ''), root: Boolean(document.querySelector('[data-studio-root]')), text: (document.body?.innerText ?? '').slice(0, 120) }));
        check(`${name} испорченный объект: слова и кнопки, а не белый экран`, !screen.crash && (screen.error.length > 0 || screen.root), JSON.stringify(screen).slice(0, 220));
      } finally {
        await service.from('projects').delete().eq('id', bad.id);
      }
    }, { contextOptions: PROFILES[name] });
  }
}

const PART_RUN = { zones: partZones, flow: partFlow, guard: partGuard };

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
    const browser = await chromium.launch({ args: (process.env.GPU === 'off' ? ['--disable-gpu', '--disable-webgl', '--disable-webgl2', '--disable-software-rasterizer'] : ['--use-angle=d3d11', '--enable-gpu']) });
    try {
      for (const part of PARTS) {
        const started = Date.now();
        try {
          await PART_RUN[part](browser);
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
