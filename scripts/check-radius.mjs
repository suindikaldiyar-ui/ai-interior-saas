/**
 * OVAL & RADIUS, ЭТАП A, В БРАУЗЕРЕ — НАСТОЯЩАЯ ОРГАНИЗАЦИЯ И ВИДЕОКАРТА.
 *
 * Запуск (после `npm run build`): `PART=<часть> node scripts/check-radius.mjs`
 *   PART=cabinet — свободная сборка 600 · 600 · 400 (у 400 — эмаль): «Выбор» → модуль 400 → блок «Форма ·
 *                  радиус» → «Скруглить торец справа»: торец R400 гнутой дверцей; в сцене детали по контуру и
 *                  гнутая дверца числом движка, плита и цоколь по дуге; строки сметы радиуса без цены; DEMO ONLY
 *                  словами; «Открыть всё» — гнутая дверца едет; запись и перезагрузка; снимки.
 *   PART=island  — тот же ряд: «Мебель» → «+ Остров» → «Овал»: модули, торцы и плита острова числом движка;
 *                  смета «Столешница острова»; план Studio — остров контуром; проход 900 — уточнение словами;
 *                  запись и перезагрузка; снимки 3D и плана.
 *   PART=tv      — гостиная по шаблону зоны: крайний подвесной модуль — торец R400 открытыми полками, блок
 *                  ящиков — отказ словами под кнопкой; снимок.
 *   PART=facade  — та же сборка, эмаль у среднего и крайнего модуля: «Фасад дугой» у среднего — гнутые
 *                  створки числом движка и «Открыть всё»; торец справа рейками — реек, деталей по контуру и
 *                  подложки в смете столько, сколько у движка; «Каркас» снимает створки и рейки, «Дизайн»
 *                  возвращает; снимки.
 *   PART=tablet  — 1024 × 768 касанием: «+ Остров» и «Капсула», блок «Форма · радиус» досягаем, прокрутки по
 *                  ширине нет; снимок.
 *
 * Сверка — по нарисованному (`__mwCadRadius`, `__mwOpenIds`, `__mwEstimateLines`) и по базе (служебным ключом);
 * ожидания — `radius-browser-fixture.ts` тем же путём экрана. Каждая часть — своя временная организация:
 * заводится служебным ключом и удаляется, уборка проверяется чтением. Снимки — `.capture-check/radius`.
 */
import { execSync, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_RADIUS ?? 3319);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/radius';
const PARTS = (process.env.PART ?? 'cabinet').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['cabinet', 'island', 'tv', 'facade', 'tablet'];
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
      execSync('npx tsx --tsconfig tsconfig.scripts.json scripts/radius-browser-fixture.ts', {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  }
  const fx = fixtures[key];
  if (!fx) throw new Stop(`нет объекта «${key}» в radius-browser-fixture`);
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
  await waitFor(page, () => (window.__mwCadRadius ? 1 : 0), (n) => n === 1, 30_000);
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
async function selectModule(page, moduleId) {
  await ensureTool(page, 'select');
  const row = page.locator(`[data-object-module="${moduleId}"]`);
  must(`модуль ${moduleId} в списке объектов`, (await row.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-object-module="${moduleId}"]`);
  await row.first().click();
  await page.waitForSelector(`[data-radius-editor][data-radius-id="${moduleId}"]`, { timeout: 20_000 });
  await sleep(300);
}
const radiusProbe = (page) => page.evaluate(() => (window.__mwCadRadius ? window.__mwCadRadius() : null));
const shapedCount = (probe) => (probe?.shaped ?? []).reduce((sum, batch) => sum + batch.parts, 0);
const plateSize = (plate) => (plate?.boundsMm ? { x: plate.boundsMm[3] - plate.boundsMm[0], z: plate.boundsMm[5] - plate.boundsMm[2] } : null);
/** Плита в мире: длина и глубина по горизонтали — порядок осей зависит от поворота ряда. */
const plateMatches = (plate, expect, tol = 2) => {
  const size = plateSize(plate);
  if (!size) return false;
  const [a, b] = [size.x, size.z].sort((p, q) => q - p);
  const [c, d] = [expect.lengthMm, expect.depthMm].sort((p, q) => q - p);
  return near(a, c, tol) && near(b, d, tol);
};
const lines = (page) => page.evaluate(() => (window.__mwEstimateLines ? window.__mwEstimateLines() : []));
const lineQty = (list, key) => Math.round(list.filter((line) => line.key === key).reduce((sum, line) => sum + line.quantity, 0) * 1000) / 1000;
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

/* ─────────────────────────  организация  ───────────────────────── */

const limitedFetch = (input, init = {}) => fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) });

async function withOrg(label, browser, body, { viewport, touch = false }) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: limitedFetch },
  });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const made = { users: [], orgs: [], projects: [] };
  try {
    const email = `radius-${stamp}@example.test`;
    const password = `Pw-${stamp}-radius!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    made.users.push(data.user.id);
    const { data: org, error: orgError } = await service.from('orgs').insert({ slug: `radius-${stamp}`, name: `Проверка радиуса ${label}` }).select('id').single();
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
          address: `Радиус ${label}: ${fx.title}`,
          zone: fx.zone,
          measurements: fx.measurement,
          millwork: {
            survey: fx.survey,
            ...(fx.templateId ? { templateId: fx.templateId } : {}),
            requirements: fx.requirements,
            selectedVariant: 'optimal',
            shape: fx.shape,
            ...(fx.runs ? { runs: fx.runs } : {}),
          },
        })
        .select('id')
        .single();
      if (projectError) throw new Error(`insert project: ${projectError.message}`);
      made.projects.push(row.id);
      return row.id;
    };
    await body({ page, errors, project, service });
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
const savedModule = (millwork, moduleId) => {
  for (const run of Object.values(millwork?.runs ?? {})) {
    for (const unit of [...(run.modules ?? []), ...(run.upperSegments ?? []).flatMap((s) => s.modules ?? [])]) if (unit.id === moduleId) return unit;
  }
  return null;
};

/* ═════════════════════════  CABINET  ═════════════════════════ */

async function partCabinet(browser) {
  console.log('\n── CABINET (1440 × 900): радиусный кухонный шкаф — торец R400 гнутой дверцей, сцена, смета, запись');
  await withOrg(
    'CABINET',
    browser,
    async ({ page, errors, project, service }) => {
      const fx = fixture('free');
      const END = fx.ids.end;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      let probe = await radiusProbe(page);
      check('CAB.0 до радиуса деталей по контуру в сцене нет', shapedCount(probe) === fx.expect.shapedBefore, `в сцене ${shapedCount(probe)}, движок ${fx.expect.shapedBefore}`);

      await selectModule(page, END);
      await click(page, `[data-radius-editor][data-radius-id="${END}"] [data-radius-action="right"]`, '«Скруглить торец справа»');
      await page.waitForSelector(`[data-radius-editor][data-radius-now="right:${fx.expect.radius.radiusMm}:${fx.expect.radius.cover}"]`, { timeout: 20_000 });
      probe = await waitFor(page, () => window.__mwCadRadius?.(), (v) => (v?.shaped ?? []).length > 0, 20_000);
      const counter = (probe?.plates ?? []).find((plate) => plate.name.startsWith('counter:'));
      const plinth = (probe?.plates ?? []).find((plate) => plate.name.startsWith('plinth:'));
      check(
        'CAB.1 «Скруглить торец справа»: торец R400 гнутой дверцей — в сцене деталей по контуру и гнутых столько, сколько посчитал движок тем же путём экрана; плита по контуру — длина и глубина как у движка; цоколь торца — по дуге',
        shapedCount(probe) === fx.expect.shapedAfter && plateMatches(counter, fx.expect.plates[0]) && Boolean(plinth),
        `в сцене ${shapedCount(probe)} (движок ${fx.expect.shapedAfter}) · плита ${JSON.stringify(plateSize(counter))} (движок ${JSON.stringify(fx.expect.plates[0])}) · цоколь по дуге ${plinth ? 'есть' : 'НЕТ'}`,
      );
      const words = await page.evaluate(() => ({
        demo: document.querySelector('[data-radius-demo]')?.getAttribute('data-radius-demo') ?? null,
        text: document.querySelector('[data-radius-demo]')?.textContent ?? '',
        door: document.querySelector('[data-radius-door]')?.textContent ?? '',
      }));
      check(
        'CAB.2 блок «Форма · радиус»: гнутая дверца числами (радиус, угол, развёртка) и DEMO ONLY словами — способ ЧПУ и гибки цех не подтвердил',
        words.demo === 'demo' && /DEMO ONLY/.test(words.text) && /R 400…416/.test(words.door),
        `${words.door} · ${words.text.slice(0, 160)}`,
      );
      const list = await waitFor(page, () => window.__mwEstimateLines?.() ?? [], (v) => v.some((line) => line.key === 'radius_cnc'), 20_000);
      check(
        'CAB.3 смета на экране: гнутые фасады, ЧПУ по дуге и рез плиты по дуге — те же количества, что у движка, и «цена не задана»',
        Object.entries(fx.expect.lines).every(([key, q]) => lineQty(list, key) === q && list.some((line) => line.key === key && line.priceUnset)),
        Object.keys(fx.expect.lines).map((key) => `${key} ${lineQty(list, key)} (движок ${fx.expect.lines[key]}) ${list.find((l) => l.key === key)?.priceUnset ? 'без цены' : 'С ЦЕНОЙ'}`).join(' · '),
      );

      /* Камера у скруглённого торца: ряд 3800 по центру сцены, торец на 1200…1600 мм — в мире x −0.70…−0.30 м. */
      await cameraTo(page, { position: [0.9, 1.35, 1.9], target: [-0.45, 0.55, -0.25] });
      await settle(page);
      await shot(page, 'cabinet-closed.png');
      await click(page, '[data-open-all]', '«Открыть всё»');
      const opened = await waitFor(page, (d) => (window.__mwOpenIds?.() ?? []).includes(d), (v) => v === true, 15_000, `${END}:door:0`);
      await settle(page);
      probe = await radiusProbe(page);
      check('CAB.4 «Открыть всё»: гнутая дверца торца открыта и едет своей деталью (`bent:`)', opened === true && (probe?.bent ?? []).some((b) => b.name === `bent:${END}:door:0`), `открыта ${opened} · едут ${(probe?.bent ?? []).map((b) => b.name).join(', ') || 'нет'}`);
      await shot(page, 'cabinet-open.png');
      await click(page, '[data-close-all]', '«Закрыть всё»');
      await settle(page);
      /* Закрытая дверца возвращается в пачку ряда: открытых нет, деталей по контуру снова столько, сколько у движка. */
      const closedCab = await waitFor(page, () => ({ open: (window.__mwOpenIds?.() ?? []).length, probe: window.__mwCadRadius?.() }), (v) => v.open === 0 && (v.probe?.bent ?? []).length === 0, 15_000);
      check(
        'CAB.4б «Закрыть всё»: гнутая дверца закрылась и вернулась в пачку ряда — открытых деталей нет, своим мешем ничего не едет, деталей по контуру в пачке столько, сколько у движка',
        closedCab.open === 0 && (closedCab.probe?.bent ?? []).length === 0 && shapedCount(closedCab.probe) === fx.expect.shapedAfter,
        `открыто ${closedCab.open} · едут ${(closedCab.probe?.bent ?? []).map((b) => b.name).join(', ') || 'нет'} · в пачке ${shapedCount(closedCab.probe)} (движок ${fx.expect.shapedAfter})`,
      );

      /* Угол столешницы у свободного начала ряда: поле в блоке «Форма · радиус» крайнего модуля. */
      const FIRST = fx.ids.first;
      await selectModule(page, FIRST);
      const field = page.locator(`[data-radius-editor][data-radius-id="${FIRST}"] [data-radius-field="counter-corner"]`);
      must('поле «Угол столешницы над торцом»', (await field.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-radius-field="counter-corner"]');
      await field.first().fill('100');
      await field.first().press('Tab');
      await page.waitForSelector('[data-radius-block="counter-corner"][data-counter-corner-now="100"]', { timeout: 20_000 });
      const expectCut = Math.round((fx.expect.lines.radius_countertop_cut + (100 * Math.PI) / 2 / 1000) * 1000) / 1000;
      const cutList = await waitFor(page, () => window.__mwEstimateLines?.() ?? [], (v) => Math.abs(lineQty(v, 'radius_countertop_cut') - fx.expect.lines.radius_countertop_cut) > 0.01, 20_000);
      check(
        'CAB.6 угол столешницы у свободного начала ряда R100: рез по дуге в смете на экране вырос ровно на четверть окружности R100 (π·100/2 мм), блок называет угол',
        near(lineQty(cutList, 'radius_countertop_cut'), expectCut, 0.002),
        `рез по дуге ${lineQty(cutList, 'radius_countertop_cut')} (ожидание ${expectCut})`,
      );
      await cameraTo(page, { position: [-2.6, 1.6, 1.6], target: [-1.6, 0.85, -0.2] });
      await settle(page);
      await shot(page, 'countertop-corner.png');

      must('CAB запись дошла', await saved(page), 'состояние записи не «Сохранено»');
      const stored = await millworkOf(service, id);
      const unit = savedModule(stored, END);
      const storedCorner = Object.values(stored?.runs ?? {})[0]?.counterCorners ?? null;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await openStudio(page, id);
      await view3d(page);
      const after = await radiusProbe(page);
      check(
        'CAB.5 запись и перезагрузка: в базе у модуля форма R400 гнутой дверцей и угол столешницы у начала ряда R100; после перезагрузки в сцене те же детали по контуру',
        unit?.radius?.place === 'right' && unit.radius.radiusMm === 400 && unit.radius.cover === 'door' && storedCorner?.start === 100 && shapedCount(after) === fx.expect.shapedAfter,
        `в базе ${JSON.stringify(unit?.radius ?? null)}, угол ${JSON.stringify(storedCorner)} · в сцене ${shapedCount(after)}`,
      );
      check('CAB ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  ISLAND  ═════════════════════════ */

async function partIsland(browser) {
  console.log('\n── ISLAND (1440 × 900): «+ Остров» → «Овал»: торцы, плита, смета, план, проход, запись');
  await withOrg(
    'ISLAND',
    browser,
    async ({ page, errors, project, service }) => {
      const fx = fixture('free');
      const exp = fx.expect.island;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      await ensureTool(page, 'furniture');
      await click(page, '[data-island-add]', '«+ Остров»');
      await page.waitForSelector('[data-island-editor][data-island-now^="rect:2400"]', { timeout: 20_000 });
      await click(page, '[data-island-shape="oval"]', '«Овал»');
      await page.waitForSelector('[data-island-editor][data-island-now^="oval:"]', { timeout: 20_000 });
      const probe = await waitFor(page, () => window.__mwCadRadius?.(), (v) => (v?.islands ?? []).length === 1 && (v?.shaped ?? []).length > 0, 20_000);
      const top = (probe?.plates ?? []).find((plate) => plate.name === 'counter:island');
      const place = probe?.islands?.[0]?.placement ?? null;
      check(
        'ISL.1 «+ Остров» → «Овал»: в сцене остров рядом с рядом стены А, модулей и деталей по контуру — как у движка; плита острова овалом — длина и глубина как у движка; место и поворот острова — как у движка',
        probe?.islands?.[0]?.modules.length === exp.modules &&
          shapedCount(probe) === exp.shaped &&
          plateMatches(top, exp.plates[0]) &&
          Boolean(place) && near(place.xM, exp.placement.xM, 1e-6) && near(place.zM, exp.placement.zM, 1e-6) && place.rotationYDeg === exp.placement.rotationYDeg,
        `модулей ${probe?.islands?.[0]?.modules.length} (движок ${exp.modules}) · по контуру ${shapedCount(probe)} (движок ${exp.shaped}) · плита ${JSON.stringify(plateSize(top))} (движок ${JSON.stringify(exp.plates[0])}) · место ${JSON.stringify(place)} (движок ${JSON.stringify(exp.placement)})`,
      );
      const facts = await page.evaluate(() => document.querySelector('[data-island-shape-facts]')?.textContent ?? '');
      check(
        'ISL.2 блок «Остров» называет форму числами: торцы R280, боковые дуги овала R5196 с касанием, выход бока 150 мм',
        /R280/.test(facts) && new RegExp(`R${exp.oval.r2}`).test(facts) && /касание/.test(facts),
        facts.slice(0, 220),
      );
      const list = await waitFor(page, () => window.__mwEstimateLines?.() ?? [], (v) => v.some((line) => line.key === 'countertop_island'), 20_000);
      check(
        'ISL.3 смета объекта на экране: «Столешница острова» тем же метражом, что у движка, без цены',
        lineQty(list, 'countertop_island') === exp.countertopIsland && list.some((line) => line.key === 'countertop_island' && line.priceUnset),
        `countertop_island ${lineQty(list, 'countertop_island')} (движок ${exp.countertopIsland})`,
      );
      await cameraTo(page, { position: [3.2, 2.6, 4.4], target: [0.4, 0.6, 1.1] });
      await settle(page);
      await shot(page, 'island-oval-3d.png');
      await view(page, 'plan');
      await page.waitForSelector('[data-plan-island]', { timeout: 20_000 });
      const plan = await page.evaluate(() => ({
        island: document.querySelectorAll('[data-plan-island]').length,
        ends: Array.from(document.querySelectorAll('[data-plan-radius]')).filter((n) => /@island$/.test(n.getAttribute('data-plan-module') ?? '')).length,
        top: document.querySelector('[data-plan-island-top]')?.getAttribute('data-plan-island-top') ?? null,
      }));
      check('ISL.4 план Studio: остров контуром — два полукруглых торца и плита контуром', plan.island === 1 && plan.ends === 2 && plan.top === 'outline', JSON.stringify(plan));
      await shot(page, 'island-oval-plan.png');
      await view3d(page);

      const gap = page.locator('[data-island-field="gap"]');
      must('поле прохода острова', (await gap.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-island-field="gap"]');
      await gap.first().fill('900');
      await gap.first().press('Tab');
      const issue = await waitFor(page, () => document.querySelector('[data-island-issue^="island-aisle"]')?.textContent ?? '', (v) => /900 мм/.test(v), 15_000);
      check('ISL.5 проход 900: уточнение словами с числом и последствием', /900 мм, меньше 1200 мм/.test(issue) && /не разойтись вдвоём/.test(issue), issue);

      must('ISL запись дошла', await saved(page), 'состояние записи не «Сохранено»');
      const stored = await millworkOf(service, id);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await openStudio(page, id);
      await view3d(page);
      const again = await radiusProbe(page);
      check(
        'ISL.6 запись и перезагрузка: в базе остров целым рядом (овал, проход 900); после перезагрузки в сцене тот же остров',
        stored?.island?.island?.top === 'oval' && stored.island.island.gapMm === 900 && again?.islands?.[0]?.modules.length === exp.modules && shapedCount(again) === exp.shaped,
        `в базе ${JSON.stringify(stored?.island?.island ?? null)} · в сцене модулей ${again?.islands?.[0]?.modules.length}, по контуру ${shapedCount(again)}`,
      );
      check('ISL ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  TV  ═════════════════════════ */

async function partTv(browser) {
  console.log('\n── TV (1440 × 900): гостиная — скруглённый торец подвесного модуля, отказ у ящиков');
  await withOrg(
    'TV',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('living');
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      const [left, right] = fx.expect.ends;
      const results = [];
      for (const end of [left, right]) {
        await selectModule(page, end.id);
        if (end.spec) {
          await click(page, `[data-radius-editor][data-radius-id="${end.id}"] [data-radius-action="${end.side}"]`, `«Скруглить торец ${end.side === 'left' ? 'слева' : 'справа'}»`);
          const now = await waitFor(page, () => document.querySelector('[data-radius-editor]')?.getAttribute('data-radius-now') ?? '', (v) => v !== '', 15_000);
          results.push({ end, ok: now === `${end.spec.place}:${end.spec.radiusMm}:${end.spec.cover}`, words: now });
        } else {
          const blocked = await page.evaluate((side) => document.querySelector(`[data-radius-blocked="${side}"]`)?.textContent ?? '', end.side);
          const disabled = await page.evaluate((side) => document.querySelector(`[data-radius-action="${side}"]`)?.hasAttribute('disabled') ?? false, end.side);
          results.push({ end, ok: blocked === end.refusal && disabled, words: blocked });
        }
      }
      const probe = await waitFor(page, () => window.__mwCadRadius?.(), (v) => (v?.shaped ?? []).length > 0, 20_000);
      check(
        'TV.1 гостиная: крайний подвесной модуль — торец R400 открытыми полками (то, что предложил движок); блок ящиков у другого края — кнопка выключена и под ней отказ словами движка; в сцене детали по контуру числом движка',
        results.every((r) => r.ok) && shapedCount(probe) === fx.expect.shapedAfter,
        results.map((r) => `${r.end.label}: ${r.words}`).join(' | ') + ` · по контуру ${shapedCount(probe)} (движок ${fx.expect.shapedAfter})`,
      );
      await shot(page, 'tv-zone.png');
      check('TV ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  FACADE  ═════════════════════════ */

async function partFacade(browser) {
  console.log('\n── FACADE (1440 × 900): фасад дугой у среднего модуля, рейки по дуге торца, «Каркас» и «Дизайн»');
  await withOrg(
    'FACADE',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('facade');
      const { mid: MID, end: END } = fx.ids;
      const { arc, slats } = fx.expect;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      let probe = await radiusProbe(page);
      must('FACADE до радиуса деталей по контуру в сцене нет', shapedCount(probe) === 0, `в сцене ${shapedCount(probe)}`);

      await selectModule(page, MID);
      await click(page, `[data-radius-editor][data-radius-id="${MID}"] [data-radius-action="front"]`, '«Фасад дугой»');
      await page.waitForSelector(`[data-radius-editor][data-radius-now="front:${arc.radius.radiusMm}:${arc.radius.cover}"]`, { timeout: 20_000 });
      probe = await waitFor(page, () => window.__mwCadRadius?.(), (v) => (v?.shaped ?? []).length > 0, 20_000);
      const doors = await page.evaluate(() => Array.from(document.querySelectorAll('[data-radius-door]')).map((n) => n.textContent ?? ''));
      let list = await waitFor(page, () => window.__mwEstimateLines?.() ?? [], (v) => v.some((line) => line.key === 'radius_bent_front'), 20_000);
      check(
        'FAC.1 «Фасад дугой» у среднего модуля: выпуклая дуга гнутыми створками (то, что предложил движок) — в сцене деталей по контуру и гнутых столько, сколько у движка; в блоке столько гнутых дверец, сколько створок у движка; в смете гнутые фасады той же площадью и «цена не задана»',
        shapedCount(probe) === arc.shaped &&
          doors.length === arc.leaves &&
          lineQty(list, 'radius_bent_front') === arc.bentFront &&
          list.some((line) => line.key === 'radius_bent_front' && line.priceUnset),
        `в сцене ${shapedCount(probe)} (движок ${arc.shaped}) · дверец в блоке ${doors.length} (движок ${arc.leaves}) · гнутые фасады ${lineQty(list, 'radius_bent_front')} м² (движок ${arc.bentFront}) · ${doors.join(' | ').slice(0, 200)}`,
      );
      /* Ряд 3800 по центру сцены: средний модуль на 600…1200 мм — в мире x −1.3…−0.7 м, торец 1200…1600 — −0.7…−0.3. */
      await cameraTo(page, { position: [0.5, 1.4, 2.3], target: [-0.85, 0.5, -0.2] });
      await settle(page);
      await shot(page, 'facade-arc.png');
      await click(page, '[data-open-all]', '«Открыть всё»');
      const leafIds = Array.from({ length: arc.leaves }, (_, i) => `${MID}:door:${i}`);
      const opened = await waitFor(page, (ids) => ids.every((d) => (window.__mwOpenIds?.() ?? []).includes(d)), (v) => v === true, 15_000, leafIds);
      await settle(page);
      probe = await radiusProbe(page);
      const riding = (probe?.bent ?? []).map((b) => b.name);
      check(
        'FAC.2 «Открыть всё»: каждая гнутая створка фасада дугой открыта и едет своей деталью (`bent:`)',
        opened === true && leafIds.every((leaf) => riding.includes(`bent:${leaf}`)),
        `открыты ${opened} · едут ${riding.join(', ') || 'нет'}`,
      );
      await shot(page, 'facade-arc-open.png');
      await click(page, '[data-close-all]', '«Закрыть всё»');
      await settle(page);
      const closedArc = await waitFor(page, () => ({ open: (window.__mwOpenIds?.() ?? []).length, probe: window.__mwCadRadius?.() }), (v) => v.open === 0 && (v.probe?.bent ?? []).length === 0, 15_000);
      check(
        'FAC.2б «Закрыть всё»: обе гнутые створки закрылись и вернулись в пачку ряда — открытых нет, своим мешем ничего не едет, деталей по контуру столько, сколько у движка',
        closedArc.open === 0 && (closedArc.probe?.bent ?? []).length === 0 && shapedCount(closedArc.probe) === arc.shaped,
        `открыто ${closedArc.open} · едут ${(closedArc.probe?.bent ?? []).map((b) => b.name).join(', ') || 'нет'} · в пачке ${shapedCount(closedArc.probe)} (движок ${arc.shaped})`,
      );

      await selectModule(page, END);
      await click(page, `[data-radius-editor][data-radius-id="${END}"] [data-radius-action="right"]`, '«Скруглить торец справа»');
      await page.waitForSelector(`[data-radius-editor][data-radius-now="right:${slats.offer.radiusMm}:${slats.offer.cover}"]`, { timeout: 20_000 });
      /* Сначала торец дверцей (сцена уже не та, что с одним фасадом дугой), потом рейки — иначе ожидание поймало бы промежуточное. */
      const withDoor = shapedCount(await waitFor(page, () => window.__mwCadRadius?.(), (v) => shapedCount(v) !== arc.shaped, 20_000));
      await click(page, `[data-radius-editor][data-radius-id="${END}"] [data-radius-cover="slats"]`, '«Рейки»');
      await page.waitForSelector(`[data-radius-editor][data-radius-now="right:${slats.radius.radiusMm}:slats"]`, { timeout: 20_000 });
      probe = await waitFor(page, () => window.__mwCadRadius?.(), (v) => shapedCount(v) !== withDoor, 20_000);
      const counted = await page.evaluate(() => document.querySelector('[data-radius-slats]')?.getAttribute('data-radius-slats') ?? null);
      list = await waitFor(page, () => window.__mwEstimateLines?.() ?? [], (v) => v.some((line) => line.key === 'radius_bent_panel'), 20_000);
      check(
        'FAC.3 декоративная панель — рейки по дуге торца: в блоке реек столько, сколько у движка; в сцене деталей по контуру — как у движка; в смете «Подложка реек гнутая» той же площадью и «цена не задана»',
        Number(counted) === slats.count &&
          shapedCount(probe) === slats.shaped &&
          lineQty(list, 'radius_bent_panel') === slats.bentPanel &&
          list.some((line) => line.key === 'radius_bent_panel' && line.priceUnset),
        `реек в блоке ${counted} (движок ${slats.count}) · в сцене ${shapedCount(probe)} (движок ${slats.shaped}) · подложка ${lineQty(list, 'radius_bent_panel')} м² (движок ${slats.bentPanel})`,
      );
      await cameraTo(page, { position: [0.8, 1.25, 1.7], target: [-0.5, 0.5, -0.2] });
      await settle(page);
      await shot(page, 'slats-panel.png');

      const preset = page.locator('[data-studio-viewport] [data-scene-preset-select]');
      must('список «Вид»', (await preset.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-scene-preset-select]');
      await preset.first().selectOption('frame');
      probe = await waitFor(page, () => window.__mwCadRadius?.(), (v) => shapedCount(v) !== slats.shaped, 15_000);
      const inFrame = await page.evaluate(() => document.querySelector('[data-scene-layers-group]')?.getAttribute('data-scene-preset-current') ?? null);
      check(
        'FAC.4 «Каркас»: гнутые створки и рейки сняты, дно, крыша и подложка по контуру на месте — в сцене деталей по контуру столько, сколько движок покажет при слоях «Каркаса» (`boxShown`)',
        inFrame === 'frame' && shapedCount(probe) === slats.frame,
        `вид ${inFrame} · в сцене ${shapedCount(probe)} (движок ${slats.frame})`,
      );
      await settle(page);
      await shot(page, 'frame-radius.png');
      await preset.first().selectOption('design');
      probe = await waitFor(page, () => window.__mwCadRadius?.(), (v) => shapedCount(v) !== slats.frame, 15_000);
      const inDesign = await page.evaluate(() => document.querySelector('[data-scene-layers-group]')?.getAttribute('data-scene-preset-current') ?? null);
      check(
        'FAC.5 «Дизайн»: створки и рейки вернулись — деталей по контуру столько, сколько движок покажет при всех слоях',
        inDesign === 'design' && shapedCount(probe) === slats.design,
        `вид ${inDesign} · в сцене ${shapedCount(probe)} (движок ${slats.design})`,
      );
      check('FAC ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  TABLET  ═════════════════════════ */

async function partTablet(browser) {
  console.log('\n── TABLET (1024 × 768, касание): остров и форма модуля досягаемы');
  await withOrg(
    'TABLET',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('free');
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      await ensureTool(page, 'furniture');
      const add = page.locator('[data-island-add]');
      must('«+ Остров» на планшете', (await add.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-island-add]');
      await add.first().scrollIntoViewIfNeeded();
      await add.first().tap();
      await page.waitForSelector('[data-island-editor][data-island-now^="rect:"]', { timeout: 20_000 });
      const capsule = page.locator('[data-island-shape="capsule"]');
      await capsule.first().scrollIntoViewIfNeeded();
      await capsule.first().tap();
      await page.waitForSelector('[data-island-editor][data-island-now^="capsule:"]', { timeout: 20_000 });
      const probe = await waitFor(page, () => window.__mwCadRadius?.(), (v) => (v?.islands ?? []).length === 1, 20_000);
      /*
       * С острова — назад к стене списком «Выбор» (так же нажимают на стену на плане): рабочим обязан стать
       * ряд стены, и в списке — её модули, а не модули острова.
       */
      await ensureTool(page, 'select');
      await click(page, '[data-object-wall="w1"]', 'стена 1 в списке «Выбор»');
      const listed = await waitFor(
        page,
        (id) => ({
          wall: Boolean(document.querySelector(`[data-object-module="${id}"]`)),
          island: document.querySelectorAll('[data-object-module$="@island"]').length,
        }),
        (v) => v.wall,
        10_000,
        fx.ids.end,
      );
      check(
        'TABLET.0 с острова — стена 1 в списке «Выбор»: рабочим стал ряд стены 1, в списке её модули, модулей острова нет',
        listed.wall && listed.island === 0,
        `модуль стены ${fx.ids.end} в списке: ${listed.wall ? 'да' : 'НЕТ'} · модулей острова в списке ${listed.island}`,
      );
      await selectModule(page, fx.ids.end);
      const layout = await page.evaluate(() => ({
        scroll: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
        buttons: Array.from(document.querySelectorAll('[data-radius-editor] button')).map((b) => b.getBoundingClientRect().height).filter((h) => h > 0),
      }));
      check(
        'TABLET.1 1024 × 768 касанием: «+ Остров» и «Капсула» — остров в сцене; блок «Форма · радиус» выбранного модуля досягаем, кнопки не ниже 28 px; прокрутки по ширине нет',
        probe?.islands?.[0]?.modules.length === 6 && layout.scroll <= 0 && layout.buttons.length > 0 && layout.buttons.every((h) => h >= 28),
        `модулей острова ${probe?.islands?.[0]?.modules.length} · прокрутка ${layout.scroll} px · кнопок ${layout.buttons.length}, наименьшая ${Math.min(...layout.buttons).toFixed(0)} px`,
      );
      await shot(page, 'tablet.png');
      check('TABLET ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1024, height: 768 }, touch: true },
  );
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
          if (part === 'cabinet') await partCabinet(browser);
          if (part === 'island') await partIsland(browser);
          if (part === 'tv') await partTv(browser);
          if (part === 'facade') await partFacade(browser);
          if (part === 'tablet') await partTablet(browser);
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
