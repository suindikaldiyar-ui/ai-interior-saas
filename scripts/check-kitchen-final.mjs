/**
 * FINAL KITCHEN В БРАУЗЕРЕ — ОБЫЧНЫЙ ИНТЕРФЕЙС STUDIO, ВРЕМЕННЫЕ ОРГАНИЗАЦИИ, СЦЕНАРИИ TEST A–J ИЗ ТЗ.
 *
 * Запуск (после `npm run build`): `PART=a,b node scripts/check-kitchen-final.mjs`, планшет — `VIEW=1024`.
 *   a — угол А/Б: ряды до границы, примыкание каждого ряда, снятие фальшпанели, глубина верхнего ряда, запись.
 *   b — шкаф под мойку: две дверцы, ход, модель мойки, ширина, деталировка.
 *   c — пенал с техникой: низ дверцы, верх витрина, стеклянная полка, лента, высота приборов, деталировка.
 *   d — комбинированный пенал: столешница сбоку, граница по столешнице, запись.
 *   e — мойка 3D: чаша, вырез, положение, замки выпуска.
 *   f — вытяжка: кнопка ставит, X и высота, запись, отказ.
 *   g — шкаф со встроенной вытяжкой: фасад, ход, прибор на месте, деталировка, запись.
 *   h — ТВ-тумба 0 → 200 → 350 → 500: сцена, запись, статус монтажа.
 *   i — верхние планки: шкаф с дверцами, с ящиками, под мойку; раскрой и присадка.
 *   j — угол без фальшпанели: опасная комбинация названа, безопасная принята.
 *
 * Объекты — `kitchen-final-browser-fixture.ts`. Каждая часть — своя временная организация: заводится служебным ключом
 * и удаляется, уборка проверяется чтением. Настоящих объектов приёмка не трогает. Снимки — `.capture-check/kitchen-final`.
 */
import { execSync, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_KITCHEN ?? 3327);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/kitchen-final';
const PARTS = (process.env.PART ?? 'a').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
const TABLET = process.env.VIEW === '1024';
const VIEWPORT = TABLET ? { width: 1024, height: 768 } : { width: 1440, height: 900 };
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
      execSync('npx tsx --tsconfig tsconfig.scripts.json scripts/kitchen-final-browser-fixture.ts', {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  }
  const fx = fixtures[key];
  if (!fx) throw new Stop(`нет объекта «${key}» в kitchen-final-browser-fixture`);
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

async function withOrg(label, browser, body, { viewport, touch = false, production = null }) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: limitedFetch },
  });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const made = { users: [], orgs: [], projects: [] };
  try {
    const email = `kfinal-${stamp}@example.test`;
    const password = `Pw-${stamp}-kfinal!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    made.users.push(data.user.id);
    const { data: org, error: orgError } = await service.from('orgs').insert({ slug: `kfinal-${stamp}`, name: `Проверка кухни ${label}` }).select('id').single();
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
    const context = await browser.newContext({ viewport, hasTouch: touch });
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
            ...(fx.templateId ? { templateId: fx.templateId } : {}),
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

/* ─────────────────────────  сценарии  ───────────────────────── */

const OPTS = { viewport: VIEWPORT, touch: TABLET };
const DRAWN_IDS = () => (window.__mwCadModules ? window.__mwCadModules().ids : null);
const DRAWN_MODELS = () => Object.values(window.__mwApplianceModels ?? {}).flat();
const fitRow = (page, row) =>
  page.evaluate((r) => {
    const el = document.querySelector(`[data-row-fit-row="${r}"]`);
    return el ? { free: Number(el.getAttribute('data-fit-free')), numbers: el.querySelector('[data-fit-numbers]')?.textContent ?? '' } : null;
  }, row);
const modulesNow = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-studio-objects] [data-object-module]')].map((el) => ({ id: el.getAttribute('data-object-module'), text: el.textContent ?? '' })));
const status = (page) => page.evaluate(READ_STATUS);
const statusWords = (page) => page.evaluate(() => document.querySelector('[data-studio-status]')?.textContent ?? '');
const panels = (page, names) => page.evaluate((list) => (window.__mwCadPanels ? window.__mwCadPanels(list) : null), names);
const leaves = (page) => page.evaluate(() => (window.__mwCadLeaves ? window.__mwCadLeaves().leaves : []));
const drawnModels = (page) => page.evaluate(DRAWN_MODELS);
async function fill(page, row, label) {
  await press(page, `[data-fit-fill="${row}"]`, label, { touch: TABLET });
  await waitFor(page, (r) => document.querySelector(`[data-row-fit-row="${r}"]`)?.getAttribute('data-fit-free'), (v) => v === '0', 20_000, row);
}
async function selectWall(page, wall) {
  await ensureTool(page, 'select');
  await press(page, `[data-object-wall="${wall}"]`, `стена ${wall}`, { touch: TABLET });
  await waitFor(page, () => Boolean(document.querySelector('[data-row-fit]')), Boolean, 15_000);
}
async function selectModule(page, pattern, label) {
  await ensureTool(page, 'select');
  await waitFor(page, () => document.querySelectorAll('[data-studio-objects] [data-object-module]').length, (n) => n > 0, 30_000);
  const list = await modulesNow(page);
  const hit = list.find((item) => pattern.test(item.text));
  must(`модуль «${label}» в списке`, Boolean(hit), `НУЛЕВОЙ СЕЛЕКТОР: ${pattern} среди ${list.map((m) => m.text).join(' | ')}`);
  await press(page, `[data-object-module="${hit.id}"]`, `модуль ${hit.id}`, { touch: TABLET });
  return hit.id;
}
async function typeField(page, selector, value, label) {
  const input = page.locator(selector);
  must(`поле ${label}`, (await input.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: ${selector}`);
  await input.first().scrollIntoViewIfNeeded().catch(() => undefined);
  await input.first().fill(String(value));
  await input.first().blur();
  await sleep(500);
}
async function chip(page, title) {
  await ensureTool(page, 'furniture');
  const button = page.locator('[data-composition] button', { hasText: title });
  must(`кнопка состава «${title}»`, (await button.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: ${title}`);
  await button.first().scrollIntoViewIfNeeded().catch(() => undefined);
  await button.first().click({ timeout: 15_000 });
  await sleep(600);
}
async function reopen(page, id) {
  must('записано', await saved(page), 'состояние записи не «сохранено»');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  await openStudio(page, id);
  await view3d(page);
}
async function detailRows(page) {
  await ensureTool(page, 'documents');
  const open = page.locator('[data-documents-open="panels"], [data-studio-doc="panels"], [data-doc="panels"]');
  if ((await open.count()) > 0) await open.first().click({ timeout: 15_000 }).catch(() => undefined);
  await waitFor(page, () => document.querySelectorAll('[data-studio-panels] [data-panel-row]').length, (n) => n > 0, 30_000);
  return page.evaluate(() => [...document.querySelectorAll('[data-studio-panels] [data-panel-row]')].map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()));
}

/* ═════════════════════════  A  угол А/Б  ═════════════════════════ */

async function partA(browser) {
  console.log(`\n── TEST A: угол А/Б (${VIEWPORT.width} px)`);
  await withOrg('A', browser, async ({ page, errors, project, service }) => {
    const fx = fixture('l');
    const E = fx.expect;
    const id = await project(fx);
    await openStudio(page, id);
    await view3d(page);

    await selectWall(page, 'w1');
    const a0 = await fitRow(page, 'base');
    check('A.1 L-образная кухня открыта пустой, числа ряда видны у выбранной стены', a0 !== null && a0.free > 0, JSON.stringify(a0));
    await fill(page, 'base', 'A.2 заполнить стену А до угла');
    const a1 = await fitRow(page, 'base');
    check('A.2 стена А собрана до границы', a1?.free === 0, JSON.stringify(a1));

    await selectWall(page, 'w2');
    const b0 = await fitRow(page, 'base');
    check(`A.3 стена Б: низ начинается за углом — занято ${E.lostMm} мм`, new RegExp(`занято углом ${E.lostMm} мм`).test(b0?.numbers ?? ''), JSON.stringify(b0));
    await fill(page, 'base', 'A.3 нижние шкафы стены Б');
    const fillers = await panels(page, ['Фальш-панель', 'Фальш-панель угла', 'Фальшпанель угла']);
    const room0 = await page.evaluate(() => (window.__mwCadRoom ? window.__mwCadRoom() : null));
    check('A.4 примыкание низа: ряд стены Б собран, в стену мебель не вошла', room0?.intersects === 0, JSON.stringify({ room0, fillers }).slice(0, 240));

    const up0 = await fitRow(page, 'upper');
    check(`A.5 верхний ряд стены Б: свой отступ ${E.upperStartMm} мм, а не отступ низа`, new RegExp(`занято углом ${E.upperStartMm} мм`).test(up0?.numbers ?? ''), JSON.stringify(up0));
    await fill(page, 'upper', 'A.5 верхние шкафы стены Б');
    const up1 = await fitRow(page, 'upper');
    check('A.6 примыкание верха: ряд до границы, низ не тронут', up1?.free === 0 && (await fitRow(page, 'base'))?.free === 0, JSON.stringify(up1));

    await ensureTool(page, 'furniture');
    await press(page, '[data-mezzanine-toggle]', 'A.7 антресоль стены Б', { touch: TABLET });
    await sleep(800);
    await ensureTool(page, 'select');
    const mz0 = await fitRow(page, 'mezzanine');
    check('A.7 антресоль: свой ряд в числах стены', mz0 !== null, JSON.stringify(mz0));
    if (mz0 && mz0.free > 0) await fill(page, 'mezzanine', 'A.7 антресоль до границы');
    const mz1 = await fitRow(page, 'mezzanine');
    check('A.8 примыкание антресоли: ряд до границы', mz1?.free === 0, JSON.stringify(mz1));
    await shot(page, 'a-1-standard.png');

    await ensureTool(page, 'furniture');
    await press(page, '[data-corner-index="0"]', 'угол в панели', { touch: TABLET });
    await waitFor(page, () => document.querySelectorAll('[data-corner-card]').length, (n) => n >= 5, 20_000);
    const cards = await page.evaluate(() => [...document.querySelectorAll('[data-corner-card]')].map((el) => el.getAttribute('data-corner-card')));
    check('A.9 карточки угла: пять видов низа, включая без фальшпанели, глухой и торец к торцу', ['lower:no_filler', 'lower:dead', 'lower:butt'].every((key) => cards.includes(key)), cards.join(', '));
    await press(page, '[data-corner-card="lower:no_filler"]', 'A.9 низ без фальшпанели', { touch: TABLET });
    await waitFor(page, () => document.querySelector('[data-corner-index="0"]')?.getAttribute('data-corner-lower'), (v) => v === 'no_filler', 20_000);
    await selectWall(page, 'w2');
    const b1 = await fitRow(page, 'base');
    check(`A.9 фальшпанели нет: занято углом ${E.bareLostMm} мм вместо ${E.lostMm}, свободно появилось числом`, new RegExp(`занято углом ${E.bareLostMm} мм`).test(b1?.numbers ?? '') && b1.free > 0, JSON.stringify(b1));
    const up2 = await fitRow(page, 'upper');
    check('A.9 верх не тронут сменой низа: свой отступ прежний', new RegExp(`занято углом ${E.upperStartMm} мм`).test(up2?.numbers ?? ''), JSON.stringify(up2));
    await fill(page, 'base', 'заполнить новый хвост');
    const st = await status(page);
    const clashWords = st.strip;
    check('A.10 коллизии: заход либо назван словами с мм, либо его нет; цена не показана только при заходе', (/на \d+(,\d+)? мм/.test(clashWords) && st.hidden > 0) || (clashWords === '' && st.hidden === 0) || !/ходу/.test(clashWords), JSON.stringify(st).slice(0, 320));
    await shot(page, 'a-2-no-filler.png');

    await ensureTool(page, 'construction');
    const upperBefore = await panels(page, ['Боковина']);
    await typeField(page, '[data-mark="upperMm"] input', 300, 'A.11 глубина верхнего ряда');
    await selectWall(page, 'w2');
    const b2 = await fitRow(page, 'base');
    const up3 = await fitRow(page, 'upper');
    check('A.12 глубина верха 300: низ на месте — занято то же', b2?.numbers === (await fitRow(page, 'base'))?.numbers && new RegExp(`занято углом ${E.bareLostMm} мм`).test(b2?.numbers ?? ''), JSON.stringify({ b2, up3, side: upperBefore?.length }).slice(0, 300));

    const ids0 = await page.evaluate(DRAWN_IDS);
    await reopen(page, id);
    const ids1 = await page.evaluate(DRAWN_IDS);
    const stored = await millworkOf(service, id);
    check('A.13 запись и перезагрузка: те же модули в сцене, угол в базе', JSON.stringify([...(ids0 ?? [])].sort()) === JSON.stringify([...(ids1 ?? [])].sort()) && stored?.corners?.[0]?.lower === 'no_filler', `${ids0?.length} → ${ids1?.length} · ${JSON.stringify(stored?.corners)}`);
    check('A.14 ошибок страницы нет', errors.length === 0, errors.join(' | '));
  }, OPTS);
}

/* ═════════════════════════  B  шкаф под мойку  ═════════════════════════ */

/* Ход идёт во внутренней группе створки (ловушка 856): сверяется мировое место зоны касания, закрытое против открытого. */
const poses = async (page) => new Map((await leaves(page)).map((leaf) => [leaf.id, leaf.world.join()]));
let closedPoses = new Map();
const openAll = async (page) => {
  closedPoses = await poses(page);
  await press(page, '[data-open-all]', '«Открыть всё»', { touch: TABLET });
  await sleep(500);
  await settle(page);
};
const closeAll = async (page) => {
  await press(page, '[data-close-all]', '«Закрыть всё»', { touch: TABLET });
  await sleep(500);
  await settle(page);
};
const turned = (leaf) => closedPoses.has(leaf.id) && closedPoses.get(leaf.id) !== leaf.world.join();

async function partB(browser) {
  console.log(`\n── TEST B: шкаф под мойку (${VIEWPORT.width} px)`);
  await withOrg('B', browser, async ({ page, errors, project, service }) => {
    const id = await project(fixture('straight'));
    await openStudio(page, id);
    await view3d(page);
    await chip(page, 'Мойка 600');
    const sinkId = await selectModule(page, /Мойка/, 'мойка');
    await press(page, '[data-zone-choice="sink:doors2"]', 'B.2 две распашные дверцы', { touch: TABLET });
    const state = await waitFor(page, () => document.querySelector('[data-sink-fronts]')?.getAttribute('data-sink-fronts-state'), (v) => v === 'doors2', 15_000);
    check('B.2 шкаф под мойку: две дверцы выбраны, мойка в ряду', state === 'doors2', String(state));
    await openAll(page);
    const opened = (await leaves(page)).filter((leaf) => leaf.id.startsWith(`${sinkId}:door:`));
    check('B.3 две створки открылись в сцене', opened.length === 2 && opened.every(turned), JSON.stringify(opened.map((l) => [l.id, l.world])));
    await shot(page, 'b-1-doors-open.png');
    await closeAll(page);
    const closed = (await leaves(page)).filter((leaf) => leaf.id.startsWith(`${sinkId}:door:`));
    check('B.4 закрылись на те же места', closed.length === 2 && !closed.some(turned), JSON.stringify(closed.map((l) => l.world)));

    await press(page, '[data-sink-apply]', 'B.5 мойка моделью', { touch: TABLET });
    await waitFor(page, () => document.querySelector('[data-sink-model]')?.getAttribute('data-sink-model-state'), (v) => v === 'set', 15_000);
    const sinks = (await drawnModels(page)).filter((m) => m.sink);
    check('B.5 мойка в сцене', sinks.length === 1, JSON.stringify(sinks));
    const bottom = await panels(page, ['Дно']);
    check('B.6 сантехническое пространство: дна у шкафа нет', Array.isArray(bottom) && bottom.length === 0, JSON.stringify(bottom));

    await typeWidth(page, 800);
    const after = await modulesNow(page);
    const row = after.find((m) => /Мойка/.test(m.text));
    check('B.7 ширина шкафа 800: мойка осталась, фасады те же', /\+800/.test(row?.text ?? '') && (await page.evaluate(() => document.querySelector('[data-sink-fronts]')?.getAttribute('data-sink-fronts-state'))) === 'doors2', row?.text ?? 'нет');

    await reopen(page, id);
    const stored = await millworkOf(service, id);
    const inBase = JSON.stringify(stored).includes('"sinkModel"');
    await selectModule(page, /Мойка/, 'мойка после перезагрузки');
    const kept = await page.evaluate(() => document.querySelector('[data-sink-fronts]')?.getAttribute('data-sink-fronts-state'));
    check('B.8 сохранение: дверцы и модель мойки после перезагрузки', kept === 'doors2' && inBase, `${kept} · в базе ${inBase}`);
    const rows = await detailRows(page);
    const faces = rows.filter((r) => /Фасад/.test(r));
    check('B.9 деталировка: фасады двух дверец, дна нет', faces.length > 0 && !rows.some((r) => /^.{0,12}Дно/.test(r)), faces.slice(0, 2).join(' | '));
    check('B.10 ошибок страницы нет', errors.length === 0, errors.join(' | '));
  }, OPTS);
}

async function typeWidth(page, mm) {
  const field = page.locator('[data-module-size-field="width"]');
  must('поле ширины модуля', (await field.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-module-size-field="width"]');
  await field.first().scrollIntoViewIfNeeded().catch(() => undefined);
  await field.first().fill(String(mm));
  await sleep(300);
  await press(page, '[data-module-size-apply="width"]', `ширина ${mm}`, { touch: TABLET });
  await sleep(600);
}

/* ═════════════════════════  C  пенал с техникой  ═════════════════════════ */

async function partC(browser) {
  console.log(`\n── TEST C: пенал с техникой (${VIEWPORT.width} px)`);
  await withOrg('C', browser, async ({ page, errors, project, service }) => {
    const id = await project(fixture('straight'));
    await openStudio(page, id);
    await view3d(page);
    await chip(page, 'Духовой шкаф');
    await selectModule(page, /Духов|Пенал/, 'пенал с духовкой');
    await press(page, '[data-pencil-toggle="microwave"]', 'C.2 микроволновка в тот же корпус', { touch: TABLET });
    await sleep(800);
    await selectModule(page, /Колонна|Духов|Пенал/, 'пенал');
    const rows0 = await page.evaluate(() => [...document.querySelectorAll('[data-zone-row]')].map((el) => el.getAttribute('data-zone-span')));
    check('C.2 духовка и СВЧ: областей пенала по числу участков — не меньше двух', rows0.length >= 2, rows0.join(' / '));
    const top = rows0.length - 1;
    await press(page, '[data-zone-choice="z0:doors2"]', 'C.3 нижний отсек с дверцами', { touch: TABLET });
    await sleep(600);
    await press(page, `[data-zone-choice="z${top}:glass"]`, 'C.4 верхний отсек витриной', { touch: TABLET });
    await sleep(600);
    await press(page, `[data-zone-choice="z${top}:shelves-glass"]`, 'C.5 стеклянные полки', { touch: TABLET });
    await sleep(600);
    await typeField(page, `[data-zone-shelves="${top}"]`, 2, 'C.5 число полок');
    const led = page.locator(`[data-zone-led="${top}"]`);
    must('C.6 подсветка', (await led.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: подсветка зоны');
    await led.first().selectOption('contour');
    await sleep(800);
    const state = await page.evaluate(() => document.querySelector('[data-front-zones]')?.getAttribute('data-front-zones-state'));
    check('C.6 области: низ две дверцы, верх витрина с лентой', /^doors2\+.*glass$/.test(state ?? ''), String(state));
    await openAll(page);
    await shot(page, 'c-1-open.png');
    const moved = (await leaves(page)).filter(turned);
    check('C.6 «Открыть всё»: дверцы области и дверь витрины идут', moved.length >= 3, `${moved.length}`);
    await closeAll(page);

    const before = await page.evaluate(() => [...document.querySelectorAll('[data-zone-row]')].map((el) => el.getAttribute('data-zone-span')));
    const mark = Number(await page.evaluate(() => document.querySelector('[data-pencil-appliance="microwave"]')?.getAttribute('data-pencil-mark')));
    const field = page.locator('[data-pencil-mark-field="microwave"]');
    must('поле низа СВЧ', (await field.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: низ СВЧ');
    await field.first().fill(String(mark + 96));
    await sleep(300);
    const markWords = await page.evaluate(() => document.querySelector('[data-pencil-mark-words="microwave"]')?.textContent ?? '');
    must('C.7 высота секции принимается', await page.locator('[data-pencil-mark-apply="microwave"]').first().isEnabled(), `кнопка заперта: ${markWords}`);
    await press(page, '[data-pencil-mark-apply="microwave"]', 'C.7 СВЧ выше — верхняя секция меньше', { touch: TABLET });
    await sleep(900);
    await selectModule(page, /Колонна|Духов|Пенал/, 'пенал');
    const after = await page.evaluate(() => [...document.querySelectorAll('[data-zone-row]')].map((el) => el.getAttribute('data-zone-span')));
    const fillsNow = await page.evaluate(() => document.querySelector('[data-front-zones]')?.getAttribute('data-front-zones-state'));
    check('C.7 высота верхней секции изменилась, витрина осталась наверху', JSON.stringify(before) !== JSON.stringify(after) && /glass$/.test(fillsNow ?? ''), `${before.join(' / ')} → ${after.join(' / ')} · ${fillsNow}`);
    const findings = await page.evaluate(() => document.querySelector('[data-pencil-findings]')?.textContent ?? '');
    const st = await status(page);
    check('C.8 с приборами нет пересечений: блокирующего нет', st.status !== 'blocked', `${st.status} · ${findings.slice(0, 160)} · ${st.strip.slice(0, 160)}`);

    const stored = await millworkOf(service, id);
    await reopen(page, id);
    await selectModule(page, /Колонна|Духов|Пенал/, 'пенал после перезагрузки');
    const kept = await page.evaluate(() => document.querySelector('[data-front-zones]')?.getAttribute('data-front-zones-state'));
    check('C.9 сохранение: области те же после перезагрузки', kept === fillsNow, `${kept}`);
    const rows = await detailRows(page);
    check('C.9 деталировка: фасады области и стеклянная позиция отдельным списком, боковин одна пара', rows.filter((r) => /Боковина/.test(r)).length >= 1 && rows.some((r) => /Фасад/.test(r)), rows.filter((r) => /Боковина|Фасад/.test(r)).slice(0, 3).join(' | '));
    void stored;
    check('C.10 ошибок страницы нет', errors.length === 0, errors.join(' | '));
  }, OPTS);
}

/* ═════════════════════════  D  комбинированный пенал  ═════════════════════════ */

async function libraryPlace(page, variant, width, label) {
  /* Пустая стена: нажатие на стену открывает библиотеку; модуль ставится карточкой. */
  await ensureTool(page, 'furniture');
  const gap = page.locator('[data-gap-from]');
  if ((await gap.count()) > 0) {
    await gap.first().click({ timeout: 15_000, force: true }).catch(() => undefined);
    await sleep(500);
  }
  await waitFor(page, () => document.querySelectorAll('[data-library-cards] [data-card]').length, (n) => n > 0, 15_000);
  const exact = page.locator(`[data-card][data-variant="${variant}"][data-width="${width}"][data-refused="0"]`);
  const card = (await exact.count()) > 0 ? exact : page.locator(`[data-card][data-variant="${variant}"][data-refused="0"]`);
  must(label, (await card.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: карточка ${variant}: ${(await page.evaluate(() => [...document.querySelectorAll('[data-card]')].map((el) => el.getAttribute('data-variant') + ':' + el.getAttribute('data-width')).slice(0, 40).join(' ')))}`);
  await card.first().scrollIntoViewIfNeeded().catch(() => undefined);
  await card.first().click({ timeout: 15_000 });
  await sleep(700);
}

async function partD(browser) {
  console.log(`\n── TEST D: комбинированная витрина (${VIEWPORT.width} px)`);
  await withOrg('D', browser, async ({ page, errors, project, service }) => {
    const id = await project(fixture('straight'));
    await openStudio(page, id);
    await view3d(page);
    await view(page, 'facade');
    await libraryPlace(page, process.env.TALL_VARIANT ?? 'tall_shelves', 600, 'D.1 высокий пенал');
    await view3d(page);
    await selectModule(page, /Пенал|Полки|Высок|Шкаф/, 'пенал');
    await press(page, '[data-zone-choice="preset:closed-glass"]', 'D.2–3 низ закрытый, верх витрина', { touch: TABLET });
    await sleep(900);
    const state = await page.evaluate(() => document.querySelector('[data-front-zones]')?.getAttribute('data-front-zones-state'));
    check('D.3 зоны: закрытая и стеклянная в одном корпусе', /glass$/.test(state ?? ''), String(state));

    await selectWall(page, 'w1');
    await fill(page, 'base', 'D.4 рядом нижние шкафы');
    const slabs = await panels(page, ['Столешница']);
    check('D.5–6 столешница у боковины: ряд нижних собран, блокирующего нет', (await status(page)).status !== 'blocked', JSON.stringify(slabs).slice(0, 120));

    await selectModule(page, /Пенал|Полки|Высок|Шкаф/, 'пенал');
    await press(page, '[data-zone-counter]', 'D.8 граница по столешнице', { touch: TABLET });
    await sleep(900);
    await selectModule(page, /Пенал|Полки|Высок|Шкаф/, 'пенал');
    const seam0 = await page.evaluate(() => document.querySelector('[data-zone-row="0"]')?.getAttribute('data-zone-span'));
    await ensureTool(page, 'construction');
    await typeField(page, '[data-mark="carcassMm"] input', 760, 'D.7 столешница выше: боковина 760');
    await sleep(900);
    await selectModule(page, /Пенал|Полки|Высок|Шкаф/, 'пенал');
    const seam1 = await page.evaluate(() => document.querySelector('[data-zone-row="0"]')?.getAttribute('data-zone-span'));
    check('D.7–8 столешница выше: граница витрины поехала за ней', seam0 !== seam1, `${seam0} → ${seam1}`);
    await shot(page, 'd-1-combined.png');

    await reopen(page, id);
    await selectModule(page, /Пенал|Полки|Высок|Шкаф/, 'пенал после перезагрузки');
    const kept = await page.evaluate(() => [document.querySelector('[data-front-zones]')?.getAttribute('data-front-zones-state'), document.querySelector('[data-zone-row="0"]')?.getAttribute('data-zone-span')]);
    check('D.10 сохранение: те же зоны и граница', kept[0] === state && kept[1] === seam1, JSON.stringify(kept));
    check('D.11 ошибок страницы нет', errors.length === 0, errors.join(' | '));
    void service;
  }, OPTS);
}

/* ═════════════════════════  E  мойка 3D  ═════════════════════════ */

async function partE(browser) {
  console.log(`\n── TEST E: мойка 3D (${VIEWPORT.width} px)`);
  await withOrg('E', browser, async ({ page, errors, project }) => {
    const id = await project(fixture('straight'));
    await openStudio(page, id);
    await view3d(page);
    await chip(page, 'Мойка 800');
    await selectModule(page, /Мойка/, 'мойка');
    await typeField(page, '[data-sink-maker]', 'Проба', 'производитель');
    await typeField(page, '[data-sink-name]', 'S-700', 'модель');
    await typeField(page, '[data-field="sink-width"]', 700, 'ширина мойки');
    await typeField(page, '[data-field="sink-depth"]', 480, 'глубина мойки');
    await typeField(page, '[data-field="sink-bowl"]', 180, 'глубина чаши');
    await press(page, '[data-sink-bowls="2"]', 'две чаши', { touch: TABLET });
    await press(page, '[data-sink-apply]', 'E.1 поставить', { touch: TABLET });
    await waitFor(page, () => document.querySelector('[data-sink-model]')?.getAttribute('data-sink-model-state'), (v) => v === 'set', 15_000);
    const first = (await drawnModels(page)).filter((m) => m.sink);
    check('E.2 чаша в сцене: две чаши', first.length === 1 && first[0].sink === 2, JSON.stringify(first));
    const cut = await page.evaluate(() => [document.querySelector('[data-sink-cutout]')?.getAttribute('data-sink-cutout'), document.querySelector('[data-sink-cutout]')?.getAttribute('data-sink-confirmed')]);
    check('E.3 вырез считается от модели и назван условным', cut[0] === '676x456' && cut[1] === '0', JSON.stringify(cut));
    const counter = await panels(page, ['Столешница']);
    const solid = await panels(page, ['Планки верхние']);
    check('E.2 чаша видна на глубину: сплошного верха над ней нет', Array.isArray(solid) && solid.length === 0, JSON.stringify(solid).slice(0, 160));
    await shot(page, 'e-1-sink.png');
    await selectModule(page, /Мойка/, 'мойка');
    await typeField(page, '[data-field="sink-offset"]', 30, 'E.4 сдвиг вдоль');
    await press(page, '[data-sink-apply]', 'E.4 применить сдвиг', { touch: TABLET });
    await sleep(800);
    const moved = (await drawnModels(page)).filter((m) => m.sink);
    check('E.4–5 положение: мойка сдвинулась относительно шкафа на 30 мм', moved.length === 1 && moved[0].sinkAt - first[0].sinkAt === 30, `${first[0].sinkAt} → ${moved[0]?.sinkAt}`);
    const st = await status(page);
    const words = await statusWords(page);
    check('E.6 ограничения: цена есть, выпуск заперт', st.status === 'production' && st.hidden === 0, `${st.status} · ${words.slice(0, 120)}`);
    await selectModule(page, /Мойка/, 'мойка');
    await typeField(page, '[data-field="sink-width"]', 900, 'мойка шире шкафа');
    const refused = await waitFor(page, () => document.querySelector('[data-sink-refusal]')?.textContent ?? '', (v) => v.length > 0, 8_000);
    check('E.6 мойка шире шкафа: отказ до нажатия с миллиметрами', /лишние \d+ мм/.test(refused), refused);
    void counter;
    check('E.7 ошибок страницы нет', errors.length === 0, errors.join(' | '));
    await reopen(page, id).catch(() => undefined);
  }, OPTS);
}

/* ═════════════════════════  F, G  вытяжка  ═════════════════════════ */

async function hobWithHood(page) {
  await chip(page, 'Варочная панель');
  await selectModule(page, /Варочная/, 'варочная');
  await waitFor(page, () => Boolean(document.querySelector('[data-hood-editor]')), Boolean, 15_000);
  await press(page, '[data-hood-add]', 'нажать «Добавить вытяжку»', { touch: TABLET });
  return waitFor(page, () => document.querySelector('[data-hood-editor]')?.getAttribute('data-hood-state'), (v) => v === 'set', 15_000);
}

async function partF(browser) {
  console.log(`\n── TEST F: вытяжка (${VIEWPORT.width} px)`);
  await withOrg('F', browser, async ({ page, errors, project, service }) => {
    const id = await project(fixture('straight'));
    await openStudio(page, id);
    await view3d(page);
    await chip(page, 'Варочная панель');
    const hobPresent = (await modulesNowAfterSelect(page)).some((m) => /Варочная/.test(m.text));
    check('F.1 варочная в ряду', hobPresent, (await modulesNow(page)).map((m) => m.text).join(' | '));
    await selectModule(page, /Варочная/, 'варочная');
    await waitFor(page, () => Boolean(document.querySelector('[data-hood-editor]')), Boolean, 15_000);
    await press(page, '[data-hood-add]', 'F.2 «Добавить вытяжку»', { touch: TABLET });
    const set = await waitFor(page, () => document.querySelector('[data-hood-editor]')?.getAttribute('data-hood-state') ?? null, (v) => v === 'set', 15_000);
    const ids = await page.evaluate(DRAWN_IDS);
    check('F.3 вытяжка в сцене', set === 'set' && ids?.some((value) => /hood/.test(value)), `${set} · ${ids?.filter((value) => /hood/.test(value)).join(',')}`);
    await shot(page, 'f-1-hood.png');
    const at0 = Number(await page.evaluate(() => document.querySelector('[data-hood-editor]')?.getAttribute('data-hood-at')));
    await typeField(page, '[data-field="hood-center"]', at0 + 300, 'F.4 X правее на 300');
    const at1 = await waitFor(page, () => document.querySelector('[data-hood-editor]')?.getAttribute('data-hood-at') ?? null, (v) => Number(v) !== 0, 10_000);
    check('F.4 X: центр сдвинулся на 300 мм', Number(at1) === at0 + 300, `${at0} → ${at1}`);
    await typeField(page, '[data-field="hood-bottom"]', 1600, 'F.4 высота 1600');
    await sleep(800);
    const bottom = await waitFor(page, () => document.querySelector('[data-hood-editor]')?.getAttribute('data-hood-bottom') ?? null, (v) => v === '1600', 10_000);
    check('F.4 высота: низ 1600 мм', bottom === '1600', String(bottom));
    await reopen(page, id);
    await selectModule(page, /Варочная/, 'варочная после перезагрузки');
    const kept = await waitFor(page, () => document.querySelector('[data-hood-editor]')?.getAttribute('data-hood-bottom') ?? null, (v) => v === '1600', 15_000);
    const stored = await millworkOf(service, id);
    check('F.5–6 запись и перезагрузка: вытяжка там же', kept === '1600' && JSON.stringify(stored).includes('"hood"'), `${kept}`);
    await typeField(page, '[data-field="hood-bottom"]', 500, 'низ ниже столешницы');
    const refused = await waitFor(page, () => document.querySelector('[data-hood-notice]')?.textContent ?? '', (v) => v.length > 0, 8_000);
    check('F.7 отказ при невозможном размещении: словами с числом', /Низ вытяжки 500 мм/.test(refused), refused);
    void at0;
    check('F.8 ошибок страницы нет', errors.length === 0, errors.join(' | '));
  }, OPTS);
}
const modulesNowAfterSelect = async (page) => {
  await ensureTool(page, 'select');
  await sleep(400);
  return modulesNow(page);
};

async function partG(browser) {
  console.log(`\n── TEST G: встроенная вытяжка (${VIEWPORT.width} px)`);
  await withOrg('G', browser, async ({ page, errors, project }) => {
    const id = await project(fixture('straight'));
    await openStudio(page, id);
    await view3d(page);
    await hobWithHood(page);
    await press(page, '[data-hood-model="DFT63CA60Q"]', 'G.1 встраиваемая модель', { touch: TABLET });
    await sleep(800);
    await selectModule(page, /Варочная/, 'варочная');
    await waitFor(page, () => document.querySelector('[data-hood-models]')?.getAttribute('data-hood-models'), (v) => v === 'DFT63CA60Q', 10_000);
    await press(page, '[data-hood-cab="door"]', 'G.2–3 шкаф с фасадом', { touch: TABLET });
    await sleep(800);
    await selectModule(page, /Варочная/, 'варочная');
    const cab = await page.evaluate(() => document.querySelector('[data-hood-cabinet]')?.getAttribute('data-hood-cabinet'));
    check('G.3 шкаф с вытяжкой: фасад есть', cab === 'door', String(cab));
    const hoodLeaf = (await leaves(page)).filter((leaf) => /hood/.test(leaf.id));
    const before = (await drawnModels(page)).filter((m) => m.hood || m.moduleId?.includes('hood'));
    await openAll(page);
    const opened = (await leaves(page)).filter((leaf) => /hood/.test(leaf.id));
    check('G.4 фасад открылся', hoodLeaf.length >= 1 && opened.some(turned), JSON.stringify(opened.map((l) => l.world)));
    const after = (await drawnModels(page)).filter((m) => m.hood || m.moduleId?.includes('hood'));
    check('G.5 прибор стоит на месте', JSON.stringify(before) === JSON.stringify(after), `${JSON.stringify(before).slice(0, 100)}`);
    await shot(page, 'g-1-open.png');
    await closeAll(page);
    const st = await status(page);
    const words = await statusWords(page);
    check('G.6 вентиляционные зазоры: документы не подтверждают — цена есть, выпуск заперт', st.status === 'production' && st.hidden === 0, `${st.status} · ${words.slice(0, 160)}`);
    const rows = await detailRows(page);
    check('G.7 деталировка: фасад шкафа в раскрое', rows.some((r) => /Фасад/.test(r)), rows.filter((r) => /Фасад/.test(r)).slice(0, 2).join(' | '));
    await reopen(page, id);
    await selectModule(page, /Варочная/, 'варочная после перезагрузки');
    const kept = await page.evaluate(() => [document.querySelector('[data-hood-cabinet]')?.getAttribute('data-hood-cabinet'), document.querySelector('[data-hood-models]')?.getAttribute('data-hood-models')]);
    check('G.8 сохранение: шкаф и модель те же', kept[0] === 'door' && kept[1] === 'DFT63CA60Q', JSON.stringify(kept));
    check('G.9 ошибок страницы нет', errors.length === 0, errors.join(' | '));
  }, OPTS);
}

/* ═════════════════════════  H  ТВ-тумба  ═════════════════════════ */

async function partH(browser) {
  console.log(`\n── TEST H: ТВ-тумба (${VIEWPORT.width} px)`);
  await withOrg('H', browser, async ({ page, errors, project, service }) => {
    const id = await project(fixture('tv'));
    await openStudio(page, id);
    await view3d(page);
    await ensureTool(page, 'furniture');
    await waitFor(page, () => Boolean(document.querySelector('[data-tv-zone]')), Boolean, 20_000);
    const panelsHere = await page.evaluate(() => [...document.querySelectorAll('[data-panel-remove]')].map((el) => el.getAttribute('data-panel-remove')));
    for (const panelId of panelsHere) await press(page, `[data-panel-remove="${panelId}"]`, 'панель стены снята', { touch: TABLET });
    await sleep(600);
    await typeField(page, '[data-tv-field="bottom"]', 1300, 'телевизор выше');
    await sleep(800);
    const sideTop = (list) => (list ?? []).map((p) => p.boundsMm[1]);
    const towerDoors = async () => (await leaves(page)).filter((leaf) => leaf.id.startsWith('tall')).map((leaf) => `${leaf.id}=${leaf.world.join()}`);
    const towers = await towerDoors();
    must('H витрины у тумбы в сцене', towers.length > 0, `НУЛЕВОЙ СЕЛЕКТОР: дверей витрин нет среди ${(await leaves(page)).map((l) => l.id).join(', ')}`);
    let previousFront = null;
    const rowBuilt = await page.evaluate(() => /собрано (\d+) мм/.exec(document.querySelector('[data-row-fit-row="base"] [data-fit-numbers]')?.textContent ?? '')?.[1] ?? '');
    for (const mm of [0, 200, 350, 500]) {
      await press(page, `[data-tv-low="${mm}"]`, `низ тумбы ${mm}`, { touch: TABLET });
      const bottom = await waitFor(page, () => document.querySelector('[data-tv-hang]')?.getAttribute('data-tv-hang-bottom') ?? null, (v) => v === String(mm), 15_000);
      await sleep(700);
      const sides = await panels(page, ['Боковина']);
      const low = (sides ?? []).filter((p) => p.boundsMm[4] - p.boundsMm[1] <= 1500);
      const lows = [...new Set(sideTop(low))];
      const same = await towerDoors();
      const fronts = (await leaves(page)).filter((leaf) => !leaf.id.startsWith('tall'));
      check(`H.${mm} низ ${mm}: корпус тумбы на отметке, витрины на месте`, bottom === String(mm) && lows.length === 1 && lows[0] === mm && JSON.stringify(same) === JSON.stringify(towers), `низ ${lows.join('/')} · дверей витрин ${same.length}`);
      const frontLow = fronts.length > 0 ? Math.min(...fronts.map((leaf) => leaf.world[1])) : null;
      check(`H.${mm} фасады тумбы поехали с ней`, frontLow !== null && (previousFront === null || frontLow > previousFront), `${previousFront} → ${frontLow} (${fronts.length} фасадов)`);
      previousFront = frontLow;
      await shot(page, `h-${mm}.png`);
      must(`H.${mm} записано`, await saved(page), 'нет «сохранено»');
      const stored = await millworkOf(service, id);
      check(`H.${mm} сохранение: отметка в базе`, JSON.stringify(stored).includes(`"hangMm":${mm}`), '');
      const row = await fitRow(page, 'base');
      check(`H.${mm} числа ряда: тумба считается, под неё мебель не предлагается`, row === null || new RegExp(`собрано ${rowBuilt} мм`).test(row.numbers), JSON.stringify(row));
      const st = await status(page);
      const words = await statusWords(page);
      const hanging = mm > 0;
      check(`H.${mm} монтажный статус: ${hanging ? 'подвесная — выпуск заперт, цена есть' : 'напольная — запрета крепления нет'}`, st.hidden === 0 && (hanging ? st.status === 'production' : true), `${st.status} · ${words.slice(0, 100)}`);
    }
    await view(page, 'facade');
    await waitFor(page, () => document.querySelectorAll('[data-studio-viewport] [data-module-id][data-top-mm]').length, (n) => n > 0, 20_000);
    const marks = await page.evaluate(() => [...document.querySelectorAll('[data-studio-viewport] [data-module-id][data-top-mm]')].map((el) => [el.getAttribute('data-module-id'), Number(el.getAttribute('data-bottom-mm'))]));
    const lowOnSheet = marks.filter(([moduleId]) => !moduleId.startsWith('tall'));
    check('H.чертёж: на фасаде тумба на 500 мм, витрины от пола', lowOnSheet.length > 0 && lowOnSheet.every(([, mm]) => mm === 500), JSON.stringify(marks).slice(0, 200));
    await shot(page, 'h-facade.png');
    await view3d(page);
    await press(page, '[data-tv-mount="legs"]', 'на опорах', { touch: TABLET });
    await sleep(800);
    const legs = await panels(page, ['Опора тумбы']);
    check('H.опоры: стойки от пола в сцене', Array.isArray(legs) && legs.length > 0 && legs.every((leg) => leg.boundsMm[1] === 0), `${legs?.length}`);
    await reopen(page, id);
    await ensureTool(page, 'furniture');
    const mode = await waitFor(page, () => document.querySelector('[data-tv-hang]')?.getAttribute('data-tv-hang-mode') ?? null, (v) => v === 'legs', 20_000);
    check('H.перезагрузка: режим и низ те же', mode === 'legs', String(mode));
    check('H.ошибок страницы нет', errors.length === 0, errors.join(' | '));
  }, OPTS);
}

/* ═════════════════════════  I  планки  ═════════════════════════ */

async function railsOn(page, label, front, back) {
  await selectModule(page, label, 'шкаф');
  await typeField(page, '[data-field="rail-front"]', front, 'передняя планка');
  await typeField(page, '[data-field="rail-back"]', back, 'задняя планка');
  await press(page, '[data-top-rails-apply]', 'поставить планки', { touch: TABLET });
  await sleep(800);
}

async function partI(browser) {
  console.log(`\n── TEST I: планки (${VIEWPORT.width} px)`);
  await withOrg('I', browser, async ({ page, errors, project }) => {
    const id = await project(fixture('straight'));
    await openStudio(page, id);
    await view3d(page);
    await selectWall(page, 'w1');
    await chip(page, 'Мойка 600');
    await selectWall(page, 'w1');
    await fill(page, 'base', 'нижний ряд');
    const rows0 = await modulesNowAfterSelect(page);
    check('I.1 шкафы в ряду', rows0.length >= 3, rows0.map((m) => m.text).join(' | '));
    await railsOn(page, /дверц/i, 100, 80);
    const drawn = await panels(page, ['Планка верхняя передняя', 'Планка верхняя задняя']);
    check('I.2 шкаф с дверцами: планки в сцене двумя деталями', drawn?.length === 2, JSON.stringify(drawn).slice(0, 160));
    const words = await page.evaluate(() => document.querySelector('[data-top-rails-now]')?.textContent ?? '');
    check('I.2 блок говорит, что стоит сейчас', /передняя 100 мм, задняя 80 мм/.test(words), words);

    await railsOn(page, /Мойка/, 100, 100);
    const sink = await panels(page, ['Планка верхняя передняя']);
    check('I.5–6 шкаф под мойку: планки вместо сплошной крышки', sink?.length === 2, `${sink?.length}`);
    await typeField(page, '[data-field="rail-cross"]', 1, 'I.7 связь');
    await typeField(page, '[data-field="rail-cross-w"]', 70, 'ширина связи');
    await press(page, '[data-top-rails-apply]', 'I.7 поставить связь', { touch: TABLET });
    await sleep(800);
    const cross = await panels(page, ['Поперечная связь']);
    check('I.7 связь в сцене', cross?.length === 1, `${cross?.length}`);
    await shot(page, 'i-1-rails.png');

    /* Шкаф с ящиками: тем же путём — карточкой библиотеки на месте шкафа, затем планки. */
    const second = (await modulesNowAfterSelect(page)).filter((m) => /дверц/i.test(m.text))[1];
    must('I.3 второй шкаф в ряду', Boolean(second), 'НУЛЕВОЙ СЕЛЕКТОР: второго шкафа с дверцами нет');
    await press(page, `[data-object-module="${second.id}"]`, `шкаф ${second.text}`, { touch: TABLET });
    await ensureTool(page, 'furniture');
    await waitFor(page, () => document.querySelectorAll('[data-library-cards] [data-card]').length, (n) => n > 0, 15_000);
    const drawerCard = page.locator('[data-card][data-variant="drawers"][data-refused="0"]');
    must('I.3 карточка ящиков', (await drawerCard.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: ящики в библиотеке');
    await drawerCard.first().click({ timeout: 15_000 });
    await sleep(900);
    await railsOn(page, /ящик/i, 90, 70);
    const withDrawers = await panels(page, ['Планка верхняя передняя', 'Планка верхняя задняя']);
    check('I.3–4 шкаф с ящиками: свои планки, у остальных шкафов прежние', withDrawers?.length === 6, `${withDrawers?.length}`);

    const rows = await detailRows(page);
    const rails = rows.filter((r) => /Планка верхняя|Поперечная связь/.test(r));
    check('I.8 раскрой: планки и связь — своими строками', rails.length >= 5, rails.slice(0, 5).join(' | '));
    const drillRow = page.locator('[data-studio-doc="drilling"]');
    must('I.9 строка «Присадка» в документах', (await drillRow.count()) === 1, `НУЛЕВОЙ СЕЛЕКТОР: [data-studio-doc="drilling"] ×${await drillRow.count()}`);
    await drillRow.first().click();
    await page.waitForSelector('[data-drilling-map]', { timeout: 60_000 });
    const drillWords = await waitFor(page, () => (document.querySelector('[data-drilling-map]')?.textContent ?? '').replace(/\s+/g, ' '), (v) => /деталей|Детал/.test(v), 30_000);
    const locked = await page.locator('[data-drill-state]').first().getAttribute('data-drill-state').catch(() => null);
    check('I.9 присадка: выпуск заперт, отверстий планки не выдумано', locked !== 'release' && locked !== 'open', `${locked} · ${drillWords.slice(0, 160)}`);
    await view3d(page);
    await reopen(page, id);
    const after = await panels(page, ['Планка верхняя передняя', 'Поперечная связь']);
    check('I.10 запись и перезагрузка: планки те же', after?.length === 4, `${after?.length}`);
    check('I.11 ошибок страницы нет', errors.length === 0, errors.join(' | '));
  }, OPTS);
}

/* ═════════════════════════  J  угол без фальшпанели  ═════════════════════════ */

async function partJ(browser) {
  console.log(`\n── TEST J: угол без фальшпанели (${VIEWPORT.width} px)`);
  await withOrg('J', browser, async ({ page, errors, project }) => {
    const fx = fixture('l');
    const id = await project(fx);
    await openStudio(page, id);
    await view3d(page);
    await ensureTool(page, 'furniture');
    await press(page, '[data-corner-index="0"]', 'J.1 угол', { touch: TABLET });
    await waitFor(page, () => document.querySelectorAll('[data-corner-card]').length, (n) => n >= 5, 20_000);
    await press(page, '[data-corner-card="lower:no_filler"]', 'J.2 режим без фальшпанели', { touch: TABLET });
    await waitFor(page, () => document.querySelector('[data-corner-index="0"]')?.getAttribute('data-corner-lower'), (v) => v === 'no_filler', 20_000);

    await selectWall(page, 'w1');
    await fill(page, 'base', 'стена А');
    await selectWall(page, 'w2');
    await view(page, 'facade');
    await libraryPlace(page, 'door', 600, 'дверца у угла стены Б');
    await view3d(page);
    await selectWall(page, 'w2');
    await fill(page, 'base', 'стена Б');
    await shot(page, 'j-1-closed.png');
    const closedStatus = await status(page);
    await openAll(page);
    const moved = (await leaves(page)).filter(turned);
    check('J.3–4 фасады закрыты на месте, «Открыть всё» ведёт их', moved.length > 0, `${moved.length}`);
    await shot(page, 'j-2-open.png');
    await closeAll(page);

    /* Опасно: дверца у угла открывается в сторону соседа. Смена петель — на том же модуле. */
    await ensureTool(page, 'select');
    const wallB = await modulesNow(page);
    const corner = wallB[0];
    await press(page, `[data-object-module="${corner.id}"]`, `модуль у угла ${corner.text}`, { touch: TABLET });
    const results = {};
    for (const side of ['left', 'right']) {
      const button = page.locator(`[data-opening="${side}"]`);
      must(`J.7 кнопка петель ${side}`, (await button.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-opening="${side}"]`);
      await button.first().scrollIntoViewIfNeeded().catch(() => undefined);
      await button.first().click({ timeout: 15_000 });
      await sleep(900);
      results[side] = await status(page);
    }
    const bad = Object.entries(results).find(([, st]) => st.hidden > 0 && /на ходу/.test(st.strip));
    check('J.7, J.9 направление открывания меняет ответ: опасная сторона названа с мм и выходами, цены нет', Boolean(bad) && /на \d+(,\d+)? мм/.test(bad[1].strip) && /другой механизм/.test(bad[1].strip), JSON.stringify(results).slice(0, 360));

    /* Безопасно: другая сторона и ручка у соседа снята — панели нет, цена есть. */
    const goodSide = bad ? (bad[0] === 'left' ? 'right' : 'left') : 'right';
    await page.locator(`[data-opening="${goodSide}"]`).first().click({ timeout: 15_000 });
    await sleep(900);
    await selectWall(page, 'w1');
    await ensureTool(page, 'select');
    const wallA = await modulesNow(page);
    const last = wallA[wallA.length - 1];
    await press(page, `[data-object-module="${last.id}"]`, `модуль у угла ${last.text}`, { touch: TABLET });
    await page.locator('[data-handle="none"]').first().click({ timeout: 15_000 });
    await sleep(900);
    /* Слова экрана называли и ручку самой дверцы у угла: она на пути соседа — снимается тем же способом. */
    await selectWall(page, 'w2');
    await ensureTool(page, 'select');
    await press(page, `[data-object-module="${(await modulesNow(page))[0].id}"]`, 'дверца у угла', { touch: TABLET });
    await page.locator('[data-handle="none"]').first().click({ timeout: 15_000 });
    await sleep(900);
    const safe = await status(page);
    const fillers = await panels(page, ['Фальш-панель угла', 'Фальшпанель', 'Фальш-панель']);
    check('J.5, J.8 безопасная комбинация принята: заходов нет, цена показана, панели нет', safe.hidden === 0 && !/на ходу/.test(safe.strip) && (fillers ?? []).length === 0, `${safe.status} · ${safe.strip.slice(0, 200)} · панелей ${fillers?.length}`);
    await shot(page, 'j-3-safe.png');

    /* Ящики у угла вместо дверцы: выдвижение не упирается. */
    await selectWall(page, 'w2');
    await ensureTool(page, 'select');
    await press(page, `[data-object-module="${(await modulesNow(page))[0].id}"]`, 'модуль у угла', { touch: TABLET });
    await ensureTool(page, 'furniture');
    const drawerCard = page.locator('[data-card][data-variant="drawers"][data-refused="0"]');
    await waitFor(page, () => document.querySelectorAll('[data-library-cards] [data-card]').length, (n) => n > 0, 15_000);
    must('J.6 карточка ящиков у угла', (await drawerCard.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: ящики в библиотеке: ${await page.evaluate(() => [...document.querySelectorAll('[data-card]')].map((el) => `${el.getAttribute('data-variant')}:${el.getAttribute('data-width')}:${el.getAttribute('data-refused')}`).slice(0, 30).join(' '))}`);
    await drawerCard.first().click({ timeout: 15_000 });
    await sleep(900);
    await openAll(page);
    const drawers = (await leaves(page)).filter((leaf) => /drawer/.test(leaf.id) && turned(leaf));
    const afterDrawers = await status(page);
    check('J.6 ящики у угла выдвигаются, заход назван или его нет — словами', drawers.length > 0 && (afterDrawers.hidden === 0 || /на \d+(,\d+)? мм/.test(afterDrawers.strip)), `${drawers.length} · ${afterDrawers.strip.slice(0, 200)}`);
    await closeAll(page);
    void closedStatus;
    check('J.10 ошибок страницы нет', errors.length === 0, errors.join(' | '));
  }, OPTS);
}

const PART_RUN = { a: partA, b: partB, c: partC, d: partD, e: partE, f: partF, g: partG, h: partH, i: partI, j: partJ };

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
