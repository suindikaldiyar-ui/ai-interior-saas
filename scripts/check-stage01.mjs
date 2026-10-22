/**
 * STAGE 01 В БРАУЗЕРЕ — размеры правленого ряда и антресоль над шкафом путём Studio.
 *
 * Запуск (после `npm run build`): `node scripts/check-stage01.mjs`
 *   PART=kitchen — 1440 × 900, ПРАВЛЕНЫЙ ряд кухни: ширина модуля полем
 *     инспектора (450 → 400; хвост у стены — доборная планка); «Глубина
 *     нижнего» 450 → поле, план (нарисованный многоугольник), инспектор,
 *     деталировка, карта раскроя, смета; «Боковина» 760 → высота в
 *     инспекторе и на фасаде, фронты ящиков подогнаны словами; сцена 3D;
 *     база; перезагрузка; «Боковина» 500 при своей раскладке ящиков — отказ
 *     словами, поле снова показывает 760.
 *   PART=bedroom — 1440 × 900, шкаф спальни по шаблону: «Добавить антресоль»
 *     → полоса над шкафом на плане, фасаде и в сцене; поля отметок — только
 *     свои; «Глубина антресоли» 400 при шкафе 600; слишком высокая — отказ
 *     словами; база; перезагрузка; «Убрать» — шкаф прежней высоты.
 *   PART=tablet  — 1024 × 768 с касанием: блок антресоли в экране, прокрутки
 *     по ширине нет, касание ставит полосу; в зале кнопки нет вовсе.
 *   PART=rooms   — 1440 × 900, две комнаты одной организации: эмаль RAL на
 *     «Фасады всей комнаты» спальни ложится на спальню; кухня в базе — байт в
 *     байт и с прежним временем записи; после перезагрузки материал на месте.
 * Ожидания — `scripts/stage01-fixture.ts` (тот же путь экрана в Node) и
 * абсолютные числа задачи. Каждая часть — своя временная организация,
 * заводится служебным ключом и удаляется; уборка проверяется чтением.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_S01 ?? 3293);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/stage01';
const PARTS = (process.env.PART ?? 'kitchen,bedroom,tablet').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['kitchen', 'bedroom', 'tablet', 'rooms'];
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

/* ─────────────────────────  объекты и ожидания: путём экрана  ───────────────────────── */

let fixtures = null;
function fixture(key) {
  if (!fixtures) {
    fixtures = JSON.parse(execSync('npx tsx --tsconfig tsconfig.scripts.json scripts/stage01-fixture.ts', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  }
  const fx = fixtures[key];
  if (!fx) throw new Stop(`нет объекта «${key}» в stage01-fixture`);
  return fx;
}
const byId = (places) => Object.fromEntries(places.map((p) => [p.id, p]));
/** Где нарисованное разошлось с ожиданием: «id: поле нарисовано ≠ ждали». */
function drift(drawn, expected, field) {
  const out = [];
  for (const [id, want] of Object.entries(expected)) {
    const got = drawn[id];
    if (!got) out.push(`${id}: НЕТ на экране`);
    else if (got[field] !== want) out.push(`${id}: ${got[field]} ≠ ${want}`);
  }
  for (const id of Object.keys(drawn)) if (!(id in expected)) out.push(`${id}: лишний`);
  return out;
}

/** Фасад экрана против развёртки того же ряда, отрисованной в Node: низ и верх каждого модуля. */
function facadeDrift(drawn, places) {
  return [
    ...drift(drawn, Object.fromEntries(places.map((p) => [p.id, p.facadeBottomMm])), 'bottomMm'),
    ...drift(drawn, Object.fromEntries(places.map((p) => [p.id, p.facadeTopMm])), 'topMm'),
  ];
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
/**
 * ИНСТРУМЕНТ ОТКРЫТ — И ЕГО ПАНЕЛЬ НА ЭКРАНЕ. Повторное нажатие на активный
 * инструмент сворачивает панель (`chooseTool`), поэтому сначала смотрим, что
 * уже открыто; признак панели обязан появиться — иначе нулевой селектор.
 */
async function ensureTool(page, key, probe) {
  const visible = () => page.locator(probe).first().isVisible().catch(() => false);
  const button = page.locator(`[data-studio-rail] [data-studio-tool="${key}"]`);
  must(`инструмент «${key}» на рельсе`, (await button.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="${key}"]`);
  const active = (await button.first().getAttribute('aria-pressed')) === 'true';
  if (!(active && (await visible()))) {
    await button.first().click({ timeout: 15_000 });
    await sleep(400);
  }
  const open = await waitFor(page, (sel) => {
    const el = document.querySelector(sel);
    return Boolean(el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
  }, (v) => v === true, 10_000, probe);
  must(`панель инструмента «${key}» открыта`, open, `НУЛЕВОЙ СЕЛЕКТОР: ${probe}`);
}
const FURNITURE = ['furniture', '[data-composition]'];
const CONSTRUCTION = ['construction', '[data-shop-sizes]'];
const SELECT = ['select', '[data-studio-objects]'];
const DOCUMENTS = ['documents', '[data-studio-documents]'];
const MATERIALS = ['materials', '[data-materials-panel]'];
/** Панель материалов загрузила коллекции — или сказала словами, почему нет. */
async function materialsLoaded(page) {
  await ensureTool(page, ...MATERIALS);
  const state = await waitFor(
    page,
    () => {
      const panel = document.querySelector('[data-materials-panel]');
      const error = document.querySelector('[data-materials-panel] [data-catalog-error], [data-materials-panel] [data-material-error]');
      return error ? `ошибка: ${error.textContent}` : panel?.getAttribute('data-loaded') ?? null;
    },
    (v) => v === '1' || (typeof v === 'string' && v.startsWith('ошибка')),
    60_000,
  );
  must('панель материалов загрузила коллекции', state === '1', `${state}`);
}

async function view(page, key) {
  const b = page.locator(`[data-studio-bottombar] [data-studio-view="${key}"]`);
  if ((await b.count()) === 0) return false;
  await b.first().click({ timeout: 15_000 });
  await sleep(600);
  return true;
}
async function openStudio(page, projectId) {
  await page.goto(`${BASE}/project/${projectId}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-studio-rail] [data-studio-tool]');
    return Boolean(el && Object.keys(el).some((k) => k.startsWith('__reactProps')));
  }, undefined, { timeout: 60_000 });
  await sleep(800);
}

/**
 * ПЛАН КОМНАТЫ — НАРИСОВАННОЕ: многоугольник модуля в мм листа. Ширина —
 * сторона вдоль стены, глубина — сторона от стены. Атрибута глубины у плана
 * нет, и он не нужен: меряется рисунок, а не то, что о нём сказано.
 */
async function planShapes(page) {
  must('вид «План»', await view(page, 'plan'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-view="plan"]');
  await waitFor(page, () => document.querySelectorAll('[data-studio-viewport] [data-plan-module]').length, (n) => n > 0, 20_000);
  return page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('[data-studio-viewport] [data-plan-module]')) {
      const id = el.getAttribute('data-plan-module');
      const pts = (el.getAttribute('points') ?? '').trim().split(/\s+/).map((p) => p.split(',').map(Number));
      const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      out[id] = pts.length === 4 ? { widthMm: Math.round(d(pts[0], pts[1])), depthMm: Math.round(d(pts[0], pts[3])) } : { bad: pts.length };
    }
    return out;
  });
}
/** Модули на плане появились (или ушли) — ждём факт, а не таймер. */
async function planHas(page, ids, present) {
  must('вид «План»', await view(page, 'plan'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-view="plan"]');
  return waitFor(
    page,
    (arg) => arg.ids.every((id) => Boolean(document.querySelector(`[data-studio-viewport] [data-plan-module="${id}"]`)) === arg.present),
    (v) => v === true,
    20_000,
    { ids, present },
  );
}
/** ФАСАД — отметки, по которым модуль нарисован на развёртке. */
async function facadeMarks(page) {
  must('вид «Фасад»', await view(page, 'facade'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-view="facade"]');
  await waitFor(page, () => document.querySelectorAll('[data-studio-viewport] [data-module-id][data-top-mm]').length, (n) => n > 0, 20_000);
  return page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('[data-studio-viewport] [data-module-id][data-top-mm]')) {
      const bottom = Number(el.getAttribute('data-bottom-mm'));
      const top = Number(el.getAttribute('data-top-mm'));
      out[el.getAttribute('data-module-id')] = {
        bottomMm: bottom,
        topMm: top,
        heightMm: top - bottom,
        offsetMm: Number(el.getAttribute('data-module-offset')),
        widthMm: Number(el.getAttribute('data-module-width')),
      };
    }
    return out;
  });
}
/** Сцена 3D готова — модули, нарисованные хотя бы одной коробкой, и пересечения со стенами. */
async function scene3d(page, label) {
  must(`${label}: вид «3D»`, await view(page, '3d'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-view="3d"]');
  const t0 = Date.now();
  let state = null;
  while (Date.now() - t0 < 90_000) {
    state = await page.evaluate(() => document.querySelector('[data-studio-viewport] [data-scene]')?.getAttribute('data-scene-state') ?? null);
    if (state === 'ready' || state === 'failed') break;
    await sleep(200);
  }
  must(`${label}: 3D готова`, state === 'ready', `${state} за ${Date.now() - t0} мс`);
  await sleep(800);
  return page.evaluate(() => ({
    ids: window.__mwCadModules ? window.__mwCadModules().ids : null,
    intersects: window.__mwCadRoom ? window.__mwCadRoom().intersects : null,
  }));
}
/** Инспектор выбранного модуля: выбор — строкой списка объектов, как человек. */
async function inspect(page, moduleId) {
  await ensureTool(page, ...SELECT);
  const row = page.locator(`[data-object-module="${moduleId}"]`);
  must(`модуль ${moduleId} в списке объектов`, (await row.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-object-module="${moduleId}"]`);
  await row.first().click();
  return waitFor(
    page,
    (id) => {
      const el = document.querySelector(`[data-inspector-module="${id}"]`);
      return el ? { depthMm: Number(el.getAttribute('data-inspector-depth')), heightMm: Number(el.getAttribute('data-inspector-height')) } : null;
    },
    (v) => v !== null,
    15_000,
    moduleId,
  );
}
/** Поле отметки: ввести, Enter, дождаться, что поле показывает введённое (или что не показывает). */
async function setMark(page, key, value) {
  await ensureTool(page, ...CONSTRUCTION);
  const input = page.locator(`[data-shop-sizes] [data-mark="${key}"] input`);
  must(`поле отметки ${key}`, (await input.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-mark="${key}"] input`);
  await input.first().fill(String(value));
  await input.first().press('Enter');
  const shown = await waitFor(page, (k) => Number(document.querySelector(`[data-shop-sizes] [data-mark="${k}"] input`)?.getAttribute('data-mark-shown') ?? NaN), (v) => v === value, 15_000, key);
  const notice = await page.evaluate(() => document.querySelector('[data-marks-notice]')?.textContent ?? '');
  return { shown, notice };
}
/**
 * ОТМЕТКА, КОТОРУЮ ДВИЖОК ОТКЛОНЯЕТ: поле обязано вернуться к числу, по
 * которому стоит мебель. Ждём новое пояснение под полями, а не таймер.
 */
async function tryMark(page, key, value) {
  await ensureTool(page, ...CONSTRUCTION);
  const input = page.locator(`[data-shop-sizes] [data-mark="${key}"] input`);
  must(`поле отметки ${key}`, (await input.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-mark="${key}"] input`);
  const before = await page.evaluate(() => document.querySelector('[data-marks-notice]')?.textContent ?? '');
  await input.first().fill(String(value));
  await input.first().press('Enter');
  const notice = await waitFor(
    page,
    (prev) => {
      const text = document.querySelector('[data-marks-notice]')?.textContent ?? '';
      return text !== prev ? text : null;
    },
    (t) => t !== null,
    15_000,
    before,
  );
  const state = await page.evaluate((k) => {
    const el = document.querySelector(`[data-shop-sizes] [data-mark="${k}"] input`);
    return { shown: Number(el?.getAttribute('data-mark-shown') ?? NaN), value: el ? el.value : null };
  }, key);
  return { notice: notice ?? '', ...state };
}
const markKeys = (page) =>
  page.evaluate(() => Array.from(document.querySelectorAll('[data-shop-sizes] [data-mark]')).map((el) => el.getAttribute('data-mark')));
const markShown = (page, key) =>
  page.evaluate((k) => Number(document.querySelector(`[data-shop-sizes] [data-mark="${k}"] input`)?.getAttribute('data-mark-shown') ?? NaN), key);
/** Деталировка: детали модуля по имени — «длина x ширина x толщина» и ИД строк. */
async function partsOnSheet(page, moduleId, name = 'Боковина') {
  await ensureTool(page, ...DOCUMENTS);
  await page.locator('[data-studio-doc="panels"]').first().click();
  await waitFor(page, () => document.querySelectorAll('[data-studio-panels] [data-panel-row]').length, (n) => n > 0, 30_000);
  return page.evaluate(
    (arg) => {
      const rows = Array.from(document.querySelectorAll(`[data-studio-panels] tr[data-module-id="${arg.id}"]`));
      return rows
        .filter((tr) => tr.querySelectorAll('td')[1]?.textContent?.trim() === arg.name)
        .map((tr) => ({ size: tr.getAttribute('data-part-size'), partId: tr.getAttribute('data-part-id') }));
    },
    { id: moduleId, name },
  );
}
/** Карта раскроя: та же деталь по ИД — размер, который уедет в цех. */
async function cutPart(page, partId) {
  await page.locator('[data-studio-doc="cutting"]').first().click();
  const parts = await waitFor(page, () => (window.__mwCutting ? window.__mwCutting().parts : null), (v) => Array.isArray(v) && v.length > 0, 60_000);
  const part = (parts ?? []).find((p) => p.partId === partId);
  return part ? `${part.lengthMm}x${part.widthMm}x${part.thicknessMm}` : null;
}
const carcassArea = (page) =>
  page.evaluate(() => {
    const line = window.__mwEstimateLines ? window.__mwEstimateLines().find((l) => l.key === 'ldsp_carcass') : null;
    return line ? line.quantity : null;
  });
/** Состояние объекта в базе — пока не станет тем, чего ждали (автосохранение идёт паузой). */
async function savedState(service, id, test, ms = 45_000) {
  const until = Date.now() + ms;
  let millwork = null;
  while (Date.now() < until) {
    const { data, error } = await service.from('projects').select('millwork').eq('id', id).single();
    if (error) throw new Stop(`объект ${id} не прочитался: ${error.message}`);
    millwork = data.millwork;
    if (test(millwork)) return millwork;
    await sleep(1000);
  }
  return millwork;
}
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/* ─────────────────────────  организация  ───────────────────────── */

async function withOrg(label, browser, body, { viewport, touch = false, projects = [], materials = false }) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const made = { users: [], orgs: [], projects: [] };
  try {
    const email = `s01-${stamp}@example.test`;
    const password = `Pw-${stamp}-s01!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    made.users.push(data.user.id);
    const { data: org, error: orgError } = await service.from('orgs').insert({ slug: `s01-${stamp}`, name: `Проверка STAGE 01 ${label}` }).select('id').single();
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
    const context = await browser.newContext({ viewport, ...(touch ? { hasTouch: true, isMobile: false } : {}) });
    await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', sameSite: 'Lax' })));
    const page = await context.newPage();
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
    });
    const seeded = await page.request.post(`${BASE}/api/catalog/seed-rates`, { data: { orgId: org.id }, timeout: 120_000 });
    if (!seeded.ok()) throw new Error(`типовой прайс не заведён: ${seeded.status()}`);
    if (materials) {
      /* Коллекции каталога материалов (RAL и др.) — в каталог организации, как кнопкой «Загрузить». */
      const res = await page.request.post(`${BASE}/api/catalog/materials`, { data: { orgId: org.id }, timeout: 180_000 });
      if (!res.ok()) throw new Error(`материалы не загрузились: ${res.status()} · ${(await res.text()).slice(0, 160)}`);
    }
    const ids = {};
    for (const p of projects) {
      const { data: project, error: projectError } = await service
        .from('projects')
        .insert({
          org_id: org.id,
          client_name: 'Проверка',
          status: 'in_progress',
          address: `STAGE 01 ${label} · ${p.key}`,
          zone: p.fx.zoneTitle,
          measurements: p.fx.measurement,
          millwork: p.millwork,
        })
        .select('id')
        .single();
      if (projectError) throw new Error(`insert project: ${projectError.message}`);
      made.projects.push(project.id);
      ids[p.key] = project.id;
    }
    await body({ service, org, page, errors, consoleErrors, ids });
  } finally {
    /* Уборка — с ошибками, а не молча (ловушка 612): ошибка удаления названа, остаток прочитан. */
    const failures = [];
    const step = async (what, request) => {
      const { error } = await request;
      if (error) failures.push(`${what}: ${error.message}`);
    };
    for (const id of made.projects) await step(`объект ${id}`, service.from('projects').delete().eq('id', id));
    for (const id of made.orgs) {
      await step(`позиции ${id}`, service.from('catalog_items').delete().eq('org_id', id));
      await step(`категории ${id}`, service.from('catalog_categories').delete().eq('org_id', id));
      await step(`организация ${id}`, service.from('orgs').delete().eq('id', id));
    }
    for (const id of made.users) {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) failures.push(`пользователь ${id}: ${error.message}`);
    }
    const left = [];
    for (const id of made.orgs) {
      const org = await service.from('orgs').select('id').eq('id', id);
      if (org.error) left.push(`организация ${id}: не прочиталось — ${org.error.message}`);
      else if (org.data.length) left.push(`организация ${id}`);
      const items = await service.from('catalog_items').select('id').eq('org_id', id).limit(1);
      if (items.error) left.push(`позиции ${id}: не прочиталось — ${items.error.message}`);
      else if (items.data.length) left.push(`позиции ${id}`);
    }
    for (const id of made.projects) {
      const row = await service.from('projects').select('id').eq('id', id);
      if (row.error) left.push(`объект ${id}: не прочиталось — ${row.error.message}`);
      else if (row.data.length) left.push(`объект ${id}`);
    }
    check(`${label}: уборка временной организации проверена чтением`, left.length === 0 && failures.length === 0, [...failures, ...left].join(', ') || 'удалено');
  }
}

/* ═════════════════════════  KITCHEN  ═════════════════════════ */

async function partKitchen(browser) {
  console.log('\n── KITCHEN (1440 × 900): правленый ряд — «Глубина нижнего» 450 и «Боковина» 760 доезжают до мебели');
  const fx = fixture('kitchen');
  const ex = fx.expect;
  const depthOf = (places) => Object.fromEntries(places.map((p) => [p.id, p.depthMm]));
  await withOrg(
    'KITCHEN',
    browser,
    async ({ service, page, errors, consoleErrors, ids }) => {
      await openStudio(page, ids.kitchen);

      /* K0 — ширина полем инспектора: модуль и соседи — как у движка, хвост у стены — планка. */
      const pick = (places, field) => Object.fromEntries(places.map((p) => [p.id, p[field]]));
      const facade0 = await facadeMarks(page);
      check(
        'K0 до правки: места и ширины модулей на фасаде — как у ряда в Node',
        drift(facade0, pick(ex.initial, 'offsetMm'), 'offsetMm').length === 0 && drift(facade0, pick(ex.initial, 'widthMm'), 'widthMm').length === 0,
        [...drift(facade0, pick(ex.initial, 'offsetMm'), 'offsetMm'), ...drift(facade0, pick(ex.initial, 'widthMm'), 'widthMm')].slice(0, 4).join(' | '),
      );
      await inspect(page, ex.target);
      /* Подпись поля — своим span'ом: в той же метке лежат подсказки, и точное имя не совпало бы. */
      const widthField = page.locator('label:has(> span:text-is("Ширина, мм")) > input[type="number"]');
      must('поле «Ширина, мм» в инспекторе', (await widthField.count()) === 1, `НУЛЕВОЙ СЕЛЕКТОР: поле «Ширина, мм» — найдено ${await widthField.count()}`);
      must(`в поле ширина модуля ${ex.width.from}`, Number(await widthField.inputValue()) === ex.width.from, `${await widthField.inputValue()}`);
      await widthField.fill(String(ex.width.to));
      await widthField.press('Enter');
      /* Ждём факт на фасаде (он на экране с первого чтения), а не таймер. */
      await waitFor(
        page,
        (id) => Number(document.querySelector(`[data-studio-viewport] [data-module-id="${id}"][data-module-width]`)?.getAttribute('data-module-width') ?? NaN),
        (v) => v === ex.width.to,
        15_000,
        ex.target,
      );
      const facadeW = await facadeMarks(page);
      const tail = ex.before.find((p) => p.offsetMm + p.widthMm === Math.max(...ex.before.filter((q) => q.kind !== 'upper' && q.kind !== 'corner_upper').map((q) => q.offsetMm + q.widthMm)) && p.kind === 'filler');
      check(
        `K0 ширина ${ex.width.from} → ${ex.width.to}: соседи справа подтянулись, хвост у стены — доборная планка ${tail ? tail.widthMm : '—'} мм; места и ширины — как у движка`,
        facadeW[ex.target]?.widthMm === ex.width.to &&
          Boolean(tail) &&
          drift(facadeW, pick(ex.before, 'offsetMm'), 'offsetMm').length === 0 &&
          drift(facadeW, pick(ex.before, 'widthMm'), 'widthMm').length === 0,
        `${ex.target} ${facadeW[ex.target]?.widthMm} · ${[...drift(facadeW, pick(ex.before, 'offsetMm'), 'offsetMm'), ...drift(facadeW, pick(ex.before, 'widthMm'), 'widthMm')].slice(0, 4).join(' | ')}`,
      );
      const planW = await planShapes(page);
      check(
        'K0 план: нарисованные ширины модулей — те же',
        drift(planW, pick(ex.before, 'widthMm'), 'widthMm').length === 0,
        drift(planW, pick(ex.before, 'widthMm'), 'widthMm').slice(0, 4).join(' | '),
      );
      const bottoms = await partsOnSheet(page, ex.target, 'Дно');
      check(
        `K0 деталировка: дно ${ex.target} ${ex.bottoms.width[0]} (было ${ex.bottoms.initial[0]})`,
        same(bottoms.map((b) => b.size).sort(), ex.bottoms.width),
        bottoms.map((b) => b.size).join(', ') || 'дна нет',
      );

      /* K1 — до отметок: план, поле, смета. */
      const planBefore = await planShapes(page);
      const before = drift(planBefore, depthOf(ex.before), 'depthMm');
      check(
        'K1 до отметки: глубины на плане — как у ряда в Node (обычные нижние 560)',
        before.length === 0 && ex.plainIds.every((id) => planBefore[id]?.depthMm === 560),
        before.slice(0, 4).join(' | ') || ex.plainIds.map((id) => `${id} ${planBefore[id]?.depthMm}`).join(', '),
      );
      await ensureTool(page, ...CONSTRUCTION);
      const keys = await markKeys(page);
      check('K1 поля отметок кухни — все семь', same(keys, ex.marks), same(keys, ex.marks) ? keys.join(', ') : `${keys.join(', ')} ≠ ${ex.marks.join(', ')}`);
      const areaBefore = await carcassArea(page);
      check('K1 ЛДСП корпуса в смете экрана = кабинет клиента (projectOffer)', areaBefore !== null && Math.abs(areaBefore - ex.ldsp.before) < 0.005, `экран ${areaBefore} · кабинет ${ex.ldsp.before} м²`);

      /* K2 — «Глубина нижнего» 450. */
      const depth = await setMark(page, 'baseMm', 450);
      check('K2 поле «Глубина нижнего» показывает 450, отметка применена', depth.shown === 450 && !/не применена/.test(depth.notice), `поле ${depth.shown} · «${depth.notice}»`);

      /* K3 — план: нарисованная глубина. */
      const planDepth = await planShapes(page);
      const after = drift(planDepth, depthOf(ex.depth), 'depthMm');
      check(
        'K3 план после отметки: глубины — как у ряда в Node; обычные нижние 450 (было 560)',
        after.length === 0 && ex.plainIds.every((id) => planDepth[id]?.depthMm === 450),
        after.slice(0, 4).join(' | ') || ex.plainIds.map((id) => `${id} ${planDepth[id]?.depthMm}`).join(', '),
      );

      /* K4 — инспектор правленого модуля. */
      const insDepth = await inspect(page, ex.target);
      check(`K4 инспектор ${ex.target}: глубина 450`, insDepth?.depthMm === 450, `${insDepth?.depthMm}`);

      /* K5–K6 — деталировка и карта раскроя: боковина того же модуля. */
      const sides = await partsOnSheet(page, ex.target);
      check(
        `K5 деталировка ${ex.target}: боковина ${ex.sides.depth[0]} (было ${ex.sides.before[0]})`,
        same(sides.map((s) => s.size).sort(), ex.sides.depth),
        sides.map((s) => s.size).join(', ') || 'боковин нет',
      );
      const cut = sides[0] ? await cutPart(page, sides[0].partId) : null;
      check(`K6 карта раскроя: та же боковина ${ex.sides.depth[0]}`, cut === ex.sides.depth[0], `${cut ?? 'детали нет'}`);
      const areaDepth = await carcassArea(page);
      check(
        `K7 смета: ЛДСП корпуса ${ex.ldsp.before} → ${ex.ldsp.depth} м² — как у кабинета клиента`,
        areaDepth !== null && Math.abs(areaDepth - ex.ldsp.depth) < 0.005 && areaDepth < areaBefore,
        `${areaBefore} → ${areaDepth}`,
      );

      /* K8 — «Боковина» 760: высота корпуса, фронты ящиков подогнаны словами. */
      const height = await setMark(page, 'carcassMm', 760);
      check(
        `K8 «Боковина» 760 применена; фронты ящиков подогнаны у ${ex.refitted} мод. — сказано словами`,
        height.shown === 760 && height.notice.includes(`подогнаны под новую высоту у ${ex.refitted} мод.`),
        `поле ${height.shown} · «${height.notice}»`,
      );
      const facade = await facadeMarks(page);
      const heights = facadeDrift(facade, ex.both);
      const workTop = ex.both.find((p) => p.id === ex.target).facadeTopMm;
      check(
        `K8 фасад: низ и верх каждого модуля — как на развёртке того же ряда в Node (рабочая поверхность ${workTop} = 100 + 760 + столешница)`,
        heights.length === 0 && ex.plainIds.every((id) => facade[id]?.topMm === workTop),
        heights.slice(0, 4).join(' | ') || ex.plainIds.map((id) => `${id} ${facade[id]?.bottomMm}…${facade[id]?.topMm}`).join(', '),
      );
      const insBoth = await inspect(page, ex.target);
      check(`K8 инспектор ${ex.target}: 760 × глубина 450`, insBoth?.heightMm === 760 && insBoth?.depthMm === 450, `${insBoth?.heightMm} × ${insBoth?.depthMm}`);
      const sidesBoth = await partsOnSheet(page, ex.target);
      check(`K8 деталировка: боковина ${ex.sides.both[0]}`, same(sidesBoth.map((s) => s.size).sort(), ex.sides.both), sidesBoth.map((s) => s.size).join(', '));
      const areaBoth = await carcassArea(page);
      check(`K8 смета: ЛДСП корпуса ${ex.ldsp.both} м²`, areaBoth !== null && Math.abs(areaBoth - ex.ldsp.both) < 0.005, `${areaBoth}`);

      /* K9 — сцена 3D. */
      const cad = await scene3d(page, 'K9');
      const wanted = ex.both.map((p) => p.id);
      const missing = wanted.filter((id) => !(cad.ids ?? []).includes(id));
      check('K9 сцена: нарисованы все модули ряда, пересечений со стенами 0', cad.ids !== null && missing.length === 0 && cad.intersects === 0, `нет ${missing.join(', ') || '—'} · пересечений ${cad.intersects}`);
      await page.screenshot({ path: `${OUT}/kitchen-3d.png`, timeout: 120_000 });

      /* K10 — база и перезагрузка. */
      const stored = await savedState(service, ids.kitchen, (m) => same(m?.production, ex.own.both));
      const storedTarget = (stored?.runs?.optimal?.modules ?? []).find((u) => u.id === ex.target);
      check(
        `K10 в базе — свои отметки объекта (глубина 450, боковина 760) и правленая ширина ${ex.width.to}`,
        same(stored?.production, ex.own.both) && storedTarget?.widthMm === ex.width.to,
        `${JSON.stringify(stored?.production ?? null)} · ${ex.target} ${storedTarget?.widthMm}`,
      );
      await openStudio(page, ids.kitchen);
      const planReload = await planShapes(page);
      const reload = drift(planReload, depthOf(ex.both), 'depthMm');
      const insReload = await inspect(page, ex.target);
      await ensureTool(page, ...CONSTRUCTION);
      const shownReload = [await markShown(page, 'baseMm'), await markShown(page, 'carcassMm')];
      check(
        'K10 после перезагрузки: поля 450 и 760, план и инспектор — те же',
        reload.length === 0 && insReload?.depthMm === 450 && insReload?.heightMm === 760 && same(shownReload, [450, 760]),
        `${reload.slice(0, 3).join(' | ')} · инспектор ${insReload?.heightMm} × ${insReload?.depthMm} · поля ${shownReload.join(', ')}`,
      );

      /* K11 — отметка, на которой своя раскладка ящиков не встаёт: не применена, поле — прежнее число. */
      const refused = await tryMark(page, 'carcassMm', ex.carcassTry);
      const insRefused = await inspect(page, ex.target);
      check(
        `K11 «Боковина» ${ex.carcassTry} — своей раскладке ящиков не хватает: не применена, потеря названа словами, поле снова 760, корпус 760`,
        refused.shown === 760 &&
          refused.value === '760' &&
          /не применена/.test(refused.notice) &&
          refused.notice.includes(ex.carcassLoss) &&
          insRefused?.heightMm === 760,
        `поле ${refused.value} (показано ${refused.shown}) · корпус ${insRefused?.heightMm} · «${refused.notice.slice(0, 220)}»`,
      );
      check('KITCHEN ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    {
      viewport: { width: 1440, height: 900 },
      projects: [{ key: 'kitchen', fx, millwork: { survey: fx.survey, requirements: fx.requirements, runs: { optimal: fx.run }, selectedVariant: 'optimal' } }],
    },
  );
}

/* ═════════════════════════  BEDROOM  ═════════════════════════ */

const bedroomMillwork = (fx) => ({ survey: fx.survey, requirements: fx.requirements, templateId: fx.templateId, selectedVariant: 'optimal' });

async function mezzToggle(page) {
  await ensureTool(page, ...FURNITURE);
  const toggle = page.locator('[data-mezzanine] [data-mezzanine-toggle]');
  must('кнопка антресоли', (await toggle.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-mezzanine] [data-mezzanine-toggle]');
  return toggle.first();
}

async function partBedroom(browser) {
  console.log('\n── BEDROOM (1440 × 900): антресоль над шкафом — полоса, своя глубина, отказ словами, без скрытого состояния');
  const fx = fixture('bedroom');
  const ex = fx.expect;
  const pick = (places, field) => Object.fromEntries(places.map((p) => [p.id, p[field]]));
  await withOrg(
    'BEDROOM',
    browser,
    async ({ service, page, errors, consoleErrors, ids }) => {
      await openStudio(page, ids.bedroom);

      /* B1 — до: полосы нет, кнопка «Добавить». */
      const plan0 = await planShapes(page);
      const facade0 = await facadeMarks(page);
      const toggle0 = await mezzToggle(page);
      const pressed0 = await toggle0.getAttribute('aria-pressed');
      check(
        'B1 до: антресоли нет ни на плане, ни на фасаде; кнопка «Добавить»; шкаф по высоте как в Node',
        pressed0 === 'false' && ex.mezzIds.every((id) => !(id in plan0) && !(id in facade0)) && facadeDrift(facade0, ex.initial).length === 0,
        `aria-pressed ${pressed0} · фасад ${facadeDrift(facade0, ex.initial).slice(0, 3).join(' | ')}`,
      );
      await ensureTool(page, ...CONSTRUCTION);
      const keys = await markKeys(page);
      const shown = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await markShown(page, k)])));
      check(
        `B2 поля отметок спальни — только свои (${ex.marks.join(', ')}); «Глубина нижнего» = глубина шкафа ${ex.shown.baseMm}`,
        same(keys, ex.marks) && same(shown, ex.shown),
        `${keys.join(', ')} · ${JSON.stringify(shown)}`,
      );

      /* B3 — «Добавить»: полоса над шкафом. */
      await (await mezzToggle(page)).click();
      await planHas(page, ex.mezzIds, true);
      const plan1 = await planShapes(page);
      const facade1 = await facadeMarks(page);
      const bandBottom1 = Math.min(...ex.mezzIds.map((id) => facade1[id]?.bottomMm ?? Infinity));
      const through1 = Object.entries(facade1).filter(([id, m]) => !ex.mezzIds.includes(id) && m.topMm > bandBottom1);
      check(
        `B3 «Добавить»: полоса ${ex.mezzIds.length} мод. над шкафом — низ ${ex.withMezz.find((p) => p.id === ex.mezzIds[0]).bottomMm}, шкаф ниже на высоту антресоли; план и фасад — как у ряда в Node`,
        facadeDrift(facade1, ex.withMezz).length === 0 && drift(plan1, pick(ex.withMezz, 'depthMm'), 'depthMm').length === 0,
        [...facadeDrift(facade1, ex.withMezz), ...drift(plan1, pick(ex.withMezz, 'depthMm'), 'depthMm')].slice(0, 4).join(' | '),
      );
      check(
        `B3 на фасаде шкаф кончается там, где начинается полоса (${bandBottom1} мм): сквозь антресоль не идёт ничего`,
        Number.isFinite(bandBottom1) && through1.length === 0,
        through1.map(([id, m]) => `${id} ${m.bottomMm}…${m.topMm}`).join(', ') || `низ полосы ${bandBottom1}`,
      );
      const toggle1 = await mezzToggle(page);
      const height1 = await page.locator('[data-mezzanine] [data-mezzanine-height]').first().inputValue().catch(() => null);
      check(`B3 кнопка «Убрать», высота антресоли в поле ${ex.mezzHeightMm}`, (await toggle1.getAttribute('aria-pressed')) === 'true' && Number(height1) === ex.mezzHeightMm, `${await toggle1.textContent()} · ${height1}`);

      /* B4 — «Глубина антресоли» 400: полоса мельче, шкаф прежний. */
      const mark = await setMark(page, 'mezzanineMm', 400);
      check('B4 поле «Глубина антресоли» 400 применено', mark.shown === 400 && !/не применена/.test(mark.notice), `${mark.shown} · «${mark.notice}»`);
      const plan2 = await planShapes(page);
      const facade2 = await facadeMarks(page);
      const wardrobe = ex.mezz400.filter((p) => !ex.mezzIds.includes(p.id));
      check(
        'B4 план: антресоль 400, шкаф 600; фасад: высоты шкафа не сдвинулись',
        ex.mezzIds.every((id) => plan2[id]?.depthMm === 400) &&
          wardrobe.every((p) => plan2[p.id]?.depthMm === 600) &&
          facadeDrift(facade2, ex.mezz400).length === 0 &&
          wardrobe.every((p) => facade2[p.id]?.topMm === facade1[p.id]?.topMm && facade2[p.id]?.bottomMm === facade1[p.id]?.bottomMm),
        `${ex.mezzIds.map((id) => `${id} ${plan2[id]?.depthMm}`).join(', ')} · ${wardrobe.map((p) => `${p.id} ${plan2[p.id]?.depthMm} ${facade1[p.id]?.topMm}→${facade2[p.id]?.topMm}`).join(', ')} · ${facadeDrift(facade2, ex.mezz400).slice(0, 3).join(' | ')}`,
      );
      const insMezz = await inspect(page, ex.mezzIds[0]);
      const insWardrobe = await inspect(page, wardrobe[0].id);
      check(
        `B4 инспектор: антресоль ${ex.mezzIds[0]} глубина 400; шкаф ${wardrobe[0].id} 600 × ${wardrobe[0].heightMm}`,
        insMezz?.depthMm === 400 && insWardrobe?.depthMm === 600 && insWardrobe?.heightMm === wardrobe[0].heightMm,
        `${insMezz?.depthMm} · ${insWardrobe?.depthMm} × ${insWardrobe?.heightMm}`,
      );

      /* B5 — слишком высокая антресоль: отказ словами, ряд прежний. */
      await mezzToggle(page);
      const input = page.locator('[data-mezzanine] [data-mezzanine-height]').first();
      await input.fill(String(ex.tooHighMm));
      await input.press('Enter');
      const refusal = await waitFor(page, () => Array.from(document.querySelectorAll('[data-scene-notice]')).map((el) => el.textContent ?? '').join(' '), (t) => t.length > 0, 15_000);
      const heightField = await page.locator('[data-mezzanine] [data-mezzanine-height]').first().inputValue().catch(() => null);
      const facade3 = await facadeMarks(page);
      check(
        `B5 антресоль ${ex.tooHighMm} мм — отказ словами движка, полоса и шкаф прежние, а поле снова показывает ${ex.mezzHeightMm}`,
        refusal.includes(ex.tooHighWords) && facadeDrift(facade3, ex.mezz400).length === 0 && Number(heightField) === ex.mezzHeightMm,
        `«${refusal.slice(0, 160)}» · поле ${heightField} · ${facadeDrift(facade3, ex.mezz400).slice(0, 3).join(' | ')}`,
      );

      /* B6 — сцена. */
      const cad = await scene3d(page, 'B6');
      const missing = ex.mezz400.map((p) => p.id).filter((id) => !(cad.ids ?? []).includes(id));
      check('B6 сцена: полоса антресоли и шкаф нарисованы, пересечений со стенами 0', cad.ids !== null && missing.length === 0 && cad.intersects === 0, `нет ${missing.join(', ') || '—'} · пересечений ${cad.intersects}`);
      await page.screenshot({ path: `${OUT}/bedroom-3d.png`, timeout: 120_000 });

      /* B7 — база и перезагрузка. */
      const stored = await savedState(service, ids.bedroom, (m) => same(m?.production, ex.own) && Boolean(m?.runs?.optimal));
      const storedMezz = (stored?.runs?.optimal?.upperSegments ?? []).flatMap((s) => s.modules).filter((u) => u.section === 'mezzanine').map((u) => u.id);
      check(
        `B7 в базе: своя отметка «Глубина антресоли» 400 и полоса ${ex.mezzIds.length} мод. в правленом ряду`,
        same(stored?.production, ex.own) && same(storedMezz.sort(), [...ex.mezzIds].sort()),
        `${JSON.stringify(stored?.production ?? null)} · ${storedMezz.join(', ') || 'полосы нет'}`,
      );
      await openStudio(page, ids.bedroom);
      const plan4 = await planShapes(page);
      const toggle4 = await mezzToggle(page);
      check(
        'B7 после перезагрузки: антресоль 400 на плане, шкаф 600, кнопка «Убрать»',
        ex.mezzIds.every((id) => plan4[id]?.depthMm === 400) && wardrobe.every((p) => plan4[p.id]?.depthMm === 600) && (await toggle4.getAttribute('aria-pressed')) === 'true',
        `${ex.mezzIds.map((id) => `${id} ${plan4[id]?.depthMm}`).join(', ')}`,
      );

      /* B8 — «Убрать»: полоса уходит целиком, шкаф прежней высоты (скрытого состояния нет). */
      await toggle4.click();
      await planHas(page, ex.mezzIds, false);
      const facade5 = await facadeMarks(page);
      check(
        'B8 «Убрать»: антресоли нет на фасаде, шкаф снова во всю высоту — как до неё',
        ex.mezzIds.every((id) => !(id in facade5)) && facadeDrift(facade5, ex.removed).length === 0,
        facadeDrift(facade5, ex.removed).slice(0, 4).join(' | '),
      );
      check('BEDROOM ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 }, projects: [{ key: 'bedroom', fx, millwork: bedroomMillwork(fx) }] },
  );
}

/* ═════════════════════════  TABLET  ═════════════════════════ */

async function partTablet(browser) {
  console.log('\n── TABLET (1024 × 768, касание): блок антресоли в экране, касание ставит полосу; в зале кнопки нет');
  const bedroom = fixture('bedroom');
  const living = fixture('living');
  await withOrg(
    'TABLET',
    browser,
    async ({ page, errors, consoleErrors, ids }) => {
      await openStudio(page, ids.bedroom);
      const toggle = await mezzToggle(page);
      await toggle.scrollIntoViewIfNeeded();
      const layout = await page.evaluate(() => {
        const block = document.querySelector('[data-mezzanine]')?.getBoundingClientRect();
        const button = document.querySelector('[data-mezzanine-toggle]')?.getBoundingClientRect();
        return {
          pageScroll: document.scrollingElement.scrollWidth - window.innerWidth,
          inside: Boolean(block && block.left >= -1 && block.right <= window.innerWidth + 1),
          buttonH: button ? Math.round(button.height) : 0,
        };
      });
      await toggle.tap();
      await planHas(page, bedroom.expect.mezzIds, true);
      const plan = await planShapes(page);
      await page.screenshot({ path: `${OUT}/tablet-bedroom.png`, timeout: 120_000 });
      check(
        'T1 1024 px: блок антресоли в экране, прокрутки по ширине нет, кнопка не ниже 36 px; касание ставит полосу',
        layout.pageScroll <= 0 && layout.inside && layout.buttonH >= 36 && bedroom.expect.mezzIds.every((id) => id in plan),
        `прокрутка ${layout.pageScroll} · блок ${layout.inside ? 'в экране' : 'ЗА КРАЕМ'} · кнопка ${layout.buttonH} px · полоса ${bedroom.expect.mezzIds.filter((id) => id in plan).length}/${bedroom.expect.mezzIds.length}`,
      );

      await openStudio(page, ids.living);
      /* Панель состава открыта: иначе «кнопки нет» доказывало бы только, что нет панели. */
      await ensureTool(page, ...FURNITURE);
      const toggles = await page.locator('[data-composition] [data-mezzanine-toggle]').count();
      await ensureTool(page, ...CONSTRUCTION);
      const keys = await markKeys(page);
      const planLiving = await planShapes(page);
      check(
        `T2 зал: антресоли в составе нет — кнопки нет; поля отметок — ${living.expect.marks.join(', ')}; модулей на плане ${living.expect.modules}`,
        toggles === 0 && same(keys, living.expect.marks) && Object.keys(planLiving).length === living.expect.modules,
        `кнопок ${toggles} · поля ${keys.join(', ')} · модулей ${Object.keys(planLiving).length}`,
      );
      check('TABLET ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    {
      viewport: { width: 1024, height: 768 },
      touch: true,
      projects: [
        { key: 'bedroom', fx: bedroom, millwork: bedroomMillwork(bedroom) },
        { key: 'living', fx: living, millwork: { survey: living.survey, requirements: living.requirements, templateId: living.templateId, selectedVariant: 'optimal' } },
      ],
    },
  );
}

/* ═════════════════════════  ROOMS  ═════════════════════════ */

async function partRooms(browser) {
  console.log('\n── ROOMS (1440 × 900): материал спальни — на её стены; кухня не тронута; после перезагрузки на месте');
  const kitchen = fixture('kitchen');
  const bedroom = fixture('bedroomHinged');
  await withOrg(
    'ROOMS',
    browser,
    async ({ service, page, errors, consoleErrors, ids }) => {
      const row = async (id) => {
        const { data, error } = await service.from('projects').select('millwork, updated_at').eq('id', id).single();
        if (error) throw new Stop(`объект ${id} не прочитался: ${error.message}`);
        return data;
      };
      const frontsOf = (millwork) =>
        Object.values(millwork?.runs ?? {})
          .flatMap((run) => [...(run?.modules ?? []), ...(run?.upperSegments ?? []).flatMap((s) => s.modules ?? [])])
          .map((u) => u.front)
          .filter(Boolean);
      const kitchen0 = await row(ids.kitchen);

      /* R1 — спальня: цель называет комнату. */
      await openStudio(page, ids.bedroom);
      await materialsLoaded(page);
      const target = page.locator('[data-materials-panel] [data-material-target="fronts"]');
      must('цель «фасады» в панели материалов', (await target.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-material-target="fronts"]');
      const title = ((await target.first().textContent()) ?? '').trim();
      check('R1 в спальне цель называет её комнату — «Фасады всей комнаты», а не «…всей кухни»', title === 'Фасады всей комнаты', `«${title}»`);

      /* R2 — эмаль RAL 010 30 20 на все фасады спальни. */
      await target.first().click();
      await page.locator('[data-materials-panel] [data-material-tab="mdf_paint"]').first().click();
      await page.locator('[data-materials-panel] [data-material-search]').first().fill('RAL 010 30 20');
      const item = page.locator('[data-materials-panel] [data-material-item="RAL 010 30 20"]');
      await waitFor(page, () => document.querySelectorAll('[data-materials-panel] [data-material-item="RAL 010 30 20"]').length, (n) => n === 1, 30_000);
      must('позиция RAL 010 30 20 в каталоге организации', (await item.count()) === 1, 'НУЛЕВОЙ СЕЛЕКТОР: [data-material-item="RAL 010 30 20"]');
      const itemId = await item.first().getAttribute('data-item-id');
      await item.first().click();
      const until = Date.now() + 45_000;
      let bedroom1 = await row(ids.bedroom);
      while (Date.now() < until && !frontsOf(bedroom1.millwork).some((f) => f.itemId === itemId)) {
        await sleep(1000);
        bedroom1 = await row(ids.bedroom);
      }
      const painted = frontsOf(bedroom1.millwork).filter((f) => f.itemId === itemId && f.base === 'mdf_enamel');
      check(
        `R2 эмаль RAL 010 30 20 легла на фасады спальни и записана в её объект (${painted.length} мод. из ${bedroom.expect.fronts} с фасадом)`,
        painted.length === bedroom.expect.fronts,
        `${painted.length} · позиция ${itemId}`,
      );

      /* R3 — кухня в базе не тронута: тот же состав и то же время записи. */
      const kitchen1 = await row(ids.kitchen);
      check(
        'R3 кухня той же организации в базе — байт в байт и с прежним временем записи',
        JSON.stringify(kitchen1.millwork) === JSON.stringify(kitchen0.millwork) && kitchen1.updated_at === kitchen0.updated_at,
        `время ${kitchen0.updated_at} → ${kitchen1.updated_at} · ${frontsOf(kitchen1.millwork).filter((f) => f.itemId === itemId).length} фасадов с RAL`,
      );

      /* R4 — спальня после перезагрузки: материал на месте, в сцене. */
      await openStudio(page, ids.bedroom);
      const cad = await scene3d(page, 'R4');
      const keys = await page.evaluate(() => (window.__mwCadState ? window.__mwCadState().fronts : null));
      check(
        'R4 спальня после перезагрузки: фасады в сцене — эмаль с той же позицией',
        Array.isArray(keys) && keys.some((k) => k.startsWith('mdf_enamel/') && k.includes(itemId)) && cad.intersects === 0,
        `${(keys ?? []).join(' · ')}`,
      );

      /* R5 — кухня: своё не сменилось, и цель называет кухню. */
      await openStudio(page, ids.kitchen);
      const cadK = await scene3d(page, 'R5');
      const keysK = await page.evaluate(() => (window.__mwCadState ? window.__mwCadState().fronts : null));
      await materialsLoaded(page);
      const titleK = ((await page.locator('[data-materials-panel] [data-material-target="fronts"]').first().textContent()) ?? '').trim();
      check(
        'R5 кухня: в сцене ни одного фасада с позицией спальни; цель — «Фасады всей кухни»',
        Array.isArray(keysK) && keysK.length > 0 && !keysK.some((k) => k.includes(itemId)) && titleK === 'Фасады всей кухни' && cadK.intersects === 0,
        `${(keysK ?? []).join(' · ')} · «${titleK}»`,
      );
      check('ROOMS ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    {
      viewport: { width: 1440, height: 900 },
      materials: true,
      projects: [
        { key: 'kitchen', fx: kitchen, millwork: { survey: kitchen.survey, requirements: kitchen.requirements, runs: { optimal: kitchen.run }, selectedVariant: 'optimal' } },
        { key: 'bedroom', fx: bedroom, millwork: { survey: bedroom.survey, requirements: bedroom.requirements, templateId: bedroom.templateId, selectedVariant: 'optimal' } },
      ],
    },
  );
}

/* ═════════════════════════  запуск  ═════════════════════════ */

const unknownParts = PARTS.filter((p) => !KNOWN.includes(p));
if (unknownParts.length > 0 || PARTS.length === 0) {
  console.log(`Неизвестные части: ${unknownParts.join(', ') || 'пусто'} — есть ${KNOWN.join(', ')}`);
  process.exit(1);
}
loadEnv();
mkdirSync(OUT, { recursive: true });
let server = null;
let browser;
const done = [];
try {
  freePort(PORT);
  server = spawn('npx', ['next', 'start', '-p', String(PORT)], { stdio: 'ignore', shell: true, env: { ...process.env, SITE_PASSWORD: '' } });
  console.log(`Сборка ${buildId()} · снимки: ${OUT}`);
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      /* сервер ещё поднимается */
    }
    await sleep(1000);
  }
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  for (const part of PARTS) {
    try {
      if (part === 'kitchen') await partKitchen(browser);
      if (part === 'bedroom') await partBedroom(browser);
      if (part === 'tablet') await partTablet(browser);
      if (part === 'rooms') await partRooms(browser);
      done.push(part);
    } catch (error) {
      check(`${part}: дошла до конца`, false, error instanceof Error ? error.message : String(error));
    }
  }
} finally {
  await browser?.close();
  if (server) {
    server.kill();
    try {
      execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' });
    } catch {
      /* сервер уже остановлен */
    }
    freePort(PORT);
  }
}
check(`части дошли до конца: ${done.join(', ') || '—'} из ${PARTS.join(', ')}`, done.length === PARTS.length);
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
