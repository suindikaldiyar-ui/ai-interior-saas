/**
 * ЭТАП 4 В БРАУЗЕРЕ — НАСТОЯЩАЯ ОРГАНИЗАЦИЯ И ВИДЕОКАРТА (части 1, 2, 4 и решения владельца).
 *
 * Запуск (после `npm run build`): `PART=<часть> node scripts/check-kitchen-stage4.mjs`
 *   PART=storage — новый проект (кладовка 560), холодильник 1770: кладовка 820 → высота 600 → глубина 400, отказ 2000
 *                  словами до нажатия, «Убрать» — в сцене нет, «Восстановить» — та же 600 × 400, запись и перезагрузка.
 *   PART=hood    — Г 3600 + 2800: «Перенести на стену Б» у варочной — вытяжка в сцене над ней на стене Б.
 *   PART=column  — колонна «духовка + СВЧ» на цоколе цеха 150: фасады в деталировке 444 и 824, духовка — модель на
 *                  полке-опоре, «Открыть всё»; духовка в пенале — модель, дверь нажатием 90° и обратно.
 *   PART=tablet  — 1024 × 768 касанием: глубина кладовки, прокрутки по ширине нет, кнопки от 36 px.
 *
 * Ожидания — `kitchen-stage4-browser-fixture.ts` тем же путём экрана. Каждая часть — своя временная организация:
 * заводится служебным ключом и удаляется, уборка проверяется чтением. Снимки — `.capture-check/stage4`.
 */
import { execSync, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_STAGE4 ?? 3325);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/stage4';
const PARTS = (process.env.PART ?? 'storage').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['storage', 'hood', 'column', 'tablet', 'bosch'];
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
      execSync('npx tsx --tsconfig tsconfig.scripts.json scripts/kitchen-stage4-browser-fixture.ts', {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  }
  const fx = fixtures[key];
  if (!fx) throw new Stop(`нет объекта «${key}» в kitchen-stage4-browser-fixture`);
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
/** Нарисованное против движка: модуль, модели, место панели, низ шкафа, вырез, дверь. */
const sameDrawn = (got, expect) =>
  Array.isArray(got) &&
  got.length === expect.length &&
  got.every((g, i) => {
    const e = expect[i];
    return (
      g.moduleId === e.moduleId &&
      g.hob === e.hob &&
      g.oven === e.oven &&
      near(g.hobAt.xMm, e.hobAt.xMm, 0.01) &&
      near(g.hobAt.yMm, e.hobAt.yMm, 0.01) &&
      near(g.hobAt.zMm, e.hobAt.zMm, 0.01) &&
      g.ovenBottomMm === e.ovenBottomMm &&
      JSON.stringify(g.cutout) === JSON.stringify(e.cutout) &&
      g.doorId === e.doorId
    );
  });
const drawnWords = (list) =>
  (list ?? []).map((d) => `${d.moduleId}: ${d.hob ?? 'типовая'}${d.oven ? ` + ${d.oven}` : ''} @${Math.round(d.hobAt.xMm)}/${Math.round(d.hobAt.zMm)} низ ${d.ovenBottomMm ?? '—'}`).join(' | ') || 'ПУСТО';

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
    const email = `stage4-${stamp}@example.test`;
    const password = `Pw-${stamp}-stage4!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    made.users.push(data.user.id);
    const { data: org, error: orgError } = await service.from('orgs').insert({ slug: `stage4-${stamp}`, name: `Проверка этапа 4 ${label}` }).select('id').single();
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
          address: `Этап 4 ${label}: ${fx.title}`,
          zone: fx.zone,
          measurements: fx.measurement,
          millwork: {
            survey: fx.survey,
            /* Собранный объект: готовое решение выбрано (STAGE 01A), состав — сохранённые требования, как у движка. */
            templateId: 'linear-standard',
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

/** «Под варочной», затем модели панели и шкафа — кнопками блока «Духовой шкаф» и выбора модели. */
async function pickPair(page, hob, oven, { touch = false } = {}) {
  await ensureTool(page, 'furniture');
  await press(page, '[data-oven-place] [data-oven-under-hob="yes"]', '«Духовой шкаф: под варочной»', { touch });
  await press(page, `[data-appliance-models="hob"] [data-appliance-model="${hob}"]`, `модель варочной ${hob}`, { touch });
  await press(page, `[data-appliance-models="oven"] [data-appliance-model="${oven}"]`, `модель духового шкафа ${oven}`, { touch });
}

/** Нажать (или коснуться) дверь шкафа там, где она нарисована, и дождаться, что она встала. */
async function pressDoor(page, id, { touch = false } = {}) {
  const list = await doors(page);
  const door = (list ?? []).find((d) => d.id === id);
  if (!door) return { ok: false, words: `двери ${id} в сцене нет (${JSON.stringify(list)})` };
  if (touch) await page.touchscreen.tap(door.x, door.y);
  else await page.mouse.click(door.x, door.y);
  await sleep(300);
  await settle(page);
  const after = (await doors(page))?.find((d) => d.id === id);
  return { ok: true, angle: after?.angleDeg ?? null, at: [Math.round(door.x), Math.round(door.y)] };
}

/* ─────────────────────────  этап 4  ───────────────────────── */

/* Функции браузера — для `waitFor`; обёртки с `page` — для разового чтения. */
const STORAGE_READ = () => {
  const el = document.querySelector('[data-storage-editor]');
  if (!el) return null;
  const n = (k) => (el.getAttribute(k) === '' || el.getAttribute(k) === null ? null : Number(el.getAttribute(k)));
  return {
    id: el.getAttribute('data-storage-id'),
    column: el.getAttribute('data-storage-column'),
    h: n('data-storage-height'),
    d: n('data-storage-depth'),
    bottom: n('data-storage-bottom'),
    gap: n('data-storage-gap'),
    removed: el.getAttribute('data-storage-removed') === '1',
    refusal: el.querySelector('[data-storage-refusal]')?.textContent ?? '',
  };
};
const DRAWN_IDS = () => (window.__mwCadModules ? window.__mwCadModules().ids : null);
const DRAWN_MODELS = () => Object.values(window.__mwApplianceModels ?? {}).flat();
const drawnIds = (page) => page.evaluate(DRAWN_IDS);

async function selectObject(page, moduleId, { touch = false } = {}) {
  await ensureTool(page, 'select');
  await waitFor(page, () => document.querySelectorAll('[data-studio-objects] [data-object-module]').length, (n) => n > 0, 30_000);
  await press(page, `[data-object-module="${moduleId}"]`, `модуль ${moduleId} в списке объектов`, { touch });
}

async function setStorageField(page, key, value, { touch = false } = {}) {
  const input = page.locator(`[data-storage-editor] [data-storage-field="${key}"]`);
  must(`поле «${key}» кладовки`, (await input.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-storage-field="${key}"]`);
  if (touch) await input.first().tap();
  await input.first().fill(String(value));
  await sleep(300);
}

/* ═════════════════════════  STORAGE  ═════════════════════════ */

async function partStorage(browser) {
  console.log('\n── STORAGE (1440 × 900): кладовка над холодильником — высота, глубина, убрать и вернуть, запись');
  await withOrg(
    'STORAGE',
    browser,
    async ({ page, errors, project, service }) => {
      const fx = fixture('storage');
      const E = fx.expect;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      await selectObject(page, E.start.id);
      const s0 = await waitFor(page, STORAGE_READ, (v) => v !== null, 20_000);
      check(
        'STOR.1 новый проект: кладовка над холодильником 1770 — 820 мм, глубина 560 (исходная проекта), низ 1880 — числа движка; в сцене она есть',
        s0 && s0.h === E.start.h && s0.d === E.start.d && s0.bottom === E.start.bottom && (await drawnIds(page))?.includes(E.start.id),
        JSON.stringify(s0),
      );
      await shot(page, 'storage-0-start.png');

      await setStorageField(page, 'height', 600);
      await press(page, '[data-storage-action="set"]', '«Применить» высоту 600');
      const s1 = await waitFor(page, STORAGE_READ, (v) => v?.h === 600, 20_000);
      check('STOR.2 высота 600: низ тот же 1880, верх 2480, до потолка 220 — числа движка', s1?.h === E.h600.h && s1?.bottom === E.h600.bottom && s1?.gap === 220, JSON.stringify(s1));
      await shot(page, 'storage-1-h600.png');

      await setStorageField(page, 'depth', 400);
      await press(page, '[data-storage-action="set"]', '«Применить» глубину 400');
      const s2 = await waitFor(page, STORAGE_READ, (v) => v?.d === 400, 20_000);
      check('STOR.3 глубина 400: высота 600 та же — глубина не трогает высоту', s2?.d === E.d400.d && s2?.h === E.d400.h, JSON.stringify(s2));
      const st3 = await page.evaluate(READ_STATUS);
      check('STOR.10 у кладовки 400 рядом с пеналом 560 — заходов на ходу нет, цена показана (сосед меряется только против кладовки)', st3.hidden === 0 && !/на ходу/.test(st3.strip), JSON.stringify(st3).slice(0, 300));
      const statusText = await page.evaluate(() => document.querySelector('[data-studio-status]')?.textContent ?? '');
      check(
        'STOR.11 (A1) геометрия цела, заперт только выпуск — статус «Требуется подтверждение производства», а не «ошибки конструкции»; цена показана',
        st3.status === 'production' && statusText.startsWith('Требуется подтверждение производства') && !/ошибки конструкции/.test(statusText) && st3.hidden === 0,
        `${st3.status} · ${statusText.slice(0, 200)}`,
      );
      await shot(page, 'storage-2-d400.png');

      await setStorageField(page, 'height', 2000);
      const refused = await waitFor(page, STORAGE_READ, (v) => (v?.refusal ?? '').length > 0, 10_000);
      const disabled = await page.locator('[data-storage-action="set"]').first().isDisabled();
      check('STOR.4 высота 2000 — отказ движка до нажатия словами («не встаёт … не хватает»), кнопка неактивна', /не встаёт/.test(refused?.refusal ?? '') && /не хватает/.test(refused?.refusal ?? '') && disabled, refused?.refusal ?? 'ОТКАЗА НЕТ');
      await setStorageField(page, 'height', 600);

      await press(page, '[data-storage-action="remove"]', '«Убрать кладовку»');
      await sleep(800);
      await selectObject(page, E.fridgeId);
      const gone = await waitFor(page, STORAGE_READ, (v) => v?.removed === true, 20_000);
      const idsGone = await drawnIds(page);
      check('STOR.5 «Убрать кладовку»: в сцене её нет, блок у холодильника — «убрана», холодильник на месте', gone?.removed === true && !idsGone?.includes(E.start.id) && idsGone?.includes(E.fridgeId), `${JSON.stringify(gone)} · в сцене ${idsGone?.includes(E.start.id) ? 'ЕСТЬ' : 'нет'}`);
      await shot(page, 'storage-3-removed.png');

      await press(page, '[data-storage-action="restore"]', '«Восстановить кладовку»');
      await waitFor(page, DRAWN_IDS, (ids) => Boolean(ids?.includes(E.start.id)), 20_000);
      await selectObject(page, E.start.id);
      const back = await waitFor(page, STORAGE_READ, (v) => v?.h === 600 && v?.d === 400, 20_000);
      check('STOR.6 «Восстановить»: та же кладовка 600 × 400 — своя высота и глубина вернулись', back?.h === E.back.h && back?.d === E.back.d && !back?.removed, JSON.stringify(back));

      const okSaved = await saved(page);
      const mw = await millworkOf(service, id);
      const cols = JSON.stringify(mw ?? {}).match(/"storageOver":\{[^}]*\}/g) ?? [];
      check('STOR.7 записано: на колонне холодильника storageOver {высота 600, глубина 400}, без «убрана»', okSaved && cols.some((c) => c.includes('"heightMm":600') && c.includes('"depthMm":400') && !c.includes('removed')), cols.join(' | ') || 'В БАЗЕ НЕТ');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
      await view3d(page);
      await selectObject(page, E.start.id);
      const again = await waitFor(page, STORAGE_READ, (v) => v !== null, 20_000);
      check('STOR.8 после перезагрузки — та же кладовка 600 × 400, низ 1880', again?.h === 600 && again?.d === 400 && again?.bottom === 1880, JSON.stringify(again));
      check('STOR.9 ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  HOOD  ═════════════════════════ */

async function partHood(browser) {
  console.log('\n── HOOD (1440 × 900): Г 3600 + 2800 — варочную переносят на стену Б, вытяжка идёт за ней');
  await withOrg(
    'HOOD',
    browser,
    async ({ page, errors, project, service }) => {
      const fx = fixture('hood');
      const E = fx.expect;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      const ids0 = await drawnIds(page);
      check('HOOD.1 до переноса: варочная и вытяжка на стене А (числа движка)', ids0?.includes(E.before.hob[0].id) && ids0?.includes(E.before.hood[0].id), `${E.before.hob[0].id}, ${E.before.hood[0].id} · в сцене ${ids0?.length ?? 'НЕТ'}`);
      await selectObject(page, E.before.hob[0].id);
      await press(page, '[data-appliance-move] [data-move-appliance="1"]', '«Перенести на стену Б»');
      const ids1 = await waitFor(page, DRAWN_IDS, (ids) => Boolean(ids?.includes(E.after.hob[0].id)), 30_000);
      check(
        'HOOD.2 после переноса варочной: варочная на стене Б 940…1540 и вытяжка над ней 940…1540; на стене А вытяжки нет',
        ids1?.includes(E.after.hob[0].id) && ids1?.includes(E.after.hood[0].id) && !ids1?.includes(E.before.hood[0].id),
        `в сцене: ${(ids1 ?? []).filter((x) => /hob|hood/.test(x)).join(', ')}`,
      );
      const status = await page.evaluate(READ_STATUS);
      check('HOOD.3 блокирующих нет, цена показана; статус — «требуется подтверждение производства» (замки выпуска), а не ошибка конструкции', status.hidden === 0 && !/Вытяжка закреплена/.test(status.strip) && status.status === 'production', JSON.stringify(status).slice(0, 300));
      await shot(page, 'hood-1-after-move.png');
      await saved(page);
      const mw = await millworkOf(service, id);
      const walls = mw?.requirements?.applianceWalls ?? {};
      check('HOOD.4 записано: варочная закреплена за стеной Б, вытяжка не закреплена (идёт за варочной)', walls.hob === 'w2' && walls.hood === undefined, JSON.stringify(walls));
      check('HOOD.5 ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  COLUMN  ═════════════════════════ */

async function partColumn(browser) {
  console.log('\n── COLUMN (1440 × 900): колонна «духовка + СВЧ» на цоколе цеха 150 и духовка в пенале — фасады, модель, дверь');
  const fx = fixture('column');
  await withOrg(
    'COLUMN',
    browser,
    async ({ page, errors, project }) => {
      const E = fx.expect;
      const id = await project(fx);
      await openStudio(page, id);
      await ensureTool(page, 'documents');
      await press(page, '[data-studio-doc="panels"]', '«Деталировка»');
      await waitFor(page, () => document.querySelectorAll('[data-studio-panels] [data-panel-row]').length, (n) => n > 0, 30_000);
      const fronts = await page.evaluate(
        (mid) =>
          Array.from(document.querySelectorAll(`[data-studio-panels] tr[data-module-id="${mid}"]`))
            .filter((tr) => tr.querySelectorAll('td')[1]?.textContent?.trim() === 'Фасад')
            .map((tr) => tr.getAttribute('data-part-size'))
            .sort(),
        E.columnId,
      );
      check('COL.1 цоколь цеха 150: фасады колонны в деталировке 444 и 824 мм (а не 476 и 792 по цоколю 100) — числа движка', JSON.stringify(fronts) === JSON.stringify(E.fronts), `${JSON.stringify(fronts)} ожидалось ${JSON.stringify(E.fronts)}`);
      await shot(page, 'column-1-panels-plinth150.png');
      await view3d(page);
      const models = await waitFor(page, DRAWN_MODELS, (list) => Array.isArray(list) && list.some((d) => d.tall), 30_000);
      const tall = (models ?? []).find((d) => d.tall && d.moduleId === E.columnId);
      check('COL.2 в колонне духовой шкаф — модель на верху полки-опоры (низ 606 = 150 + 448 + 8), а не серая коробка', tall?.ovenBottomMm === E.ovenBottomMm, JSON.stringify(tall ?? models));
      await press(page, '[data-open-all]', '«Открыть всё»');
      await settle(page);
      const opened = (await doors(page))?.find((d) => d.id === E.doorId);
      check('COL.3 «Открыть всё» — дверь духового шкафа колонны откинута на 90°', opened?.angleDeg !== undefined && Math.abs(Math.abs(opened.angleDeg) - 90) < 1, JSON.stringify(opened));
      await shot(page, 'column-2-open.png');
      await press(page, '[data-close-all]', '«Закрыть всё»');
      await settle(page);
      check('COL.4 ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 }, production: fx.production },
  );
  await withOrg(
    'PENCIL',
    browser,
    async ({ page, errors, project }) => {
      const fxp = fixture('pencil');
      const E = fxp.expect;
      const id = await project(fxp);
      await openStudio(page, id);
      await view3d(page);
      const models = await waitFor(page, DRAWN_MODELS, (list) => Array.isArray(list) && list.some((d) => d.tall), 30_000);
      const tall = (models ?? []).find((d) => d.tall && d.moduleId === E.moduleId);
      check('PEN.1 духовка в пенале — модель на полке-опоре: низ 940, ниша 832…1440 — числа движка', tall?.ovenBottomMm === E.ovenBottomMm && JSON.stringify(tall?.niche) === JSON.stringify(E.niche), JSON.stringify(tall ?? models));
      const pressed = await pressDoor(page, E.doorId);
      check('PEN.2 нажатие на дверь духового шкафа в пенале — откинута на 90°', pressed.ok && Math.abs(Math.abs(pressed.angle ?? 0) - 90) < 1, JSON.stringify(pressed));
      await shot(page, 'pencil-1-open.png');
      const back = await pressDoor(page, E.doorId);
      check('PEN.3 повторное нажатие — закрыта', back.ok && Math.abs(back.angle ?? 99) < 1, JSON.stringify(back));
      check('PEN.4 ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  TABLET  ═════════════════════════ */

async function partTablet(browser) {
  console.log('\n── TABLET (1024 × 768, касание): кладовка — глубина касанием, прокрутки по ширине нет');
  await withOrg(
    'TABLET',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('storage');
      const E = fx.expect;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      await selectObject(page, E.start.id, { touch: true });
      await waitFor(page, STORAGE_READ, (v) => v !== null, 20_000);
      await setStorageField(page, 'depth', 400, { touch: true });
      await press(page, '[data-storage-action="set"]', '«Применить» касанием', { touch: true });
      const s = await waitFor(page, STORAGE_READ, (v) => v?.d === 400, 20_000);
      check('TAB.1 глубина кладовки 400 касанием — встала', s?.d === 400, JSON.stringify(s));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check('TAB.2 прокрутки по ширине нет', overflow <= 0, `вылет ${overflow} px`);
      const small = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-storage-editor] button'))
          .map((b) => Math.round(b.getBoundingClientRect().height))
          .filter((h) => h > 0 && h < 36),
      );
      check('TAB.3 кнопки блока кладовки не ниже 36 px', small.length === 0, JSON.stringify(small));
      await shot(page, 'tablet-storage.png');
      check('TAB.4 ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1024, height: 768 }, touch: true },
  );
}

/* ═════════════════════════  запуск  ═════════════════════════ */

/* ═════════════════════════  BOSCH (ЭТАП 4, части B и C)  ═════════════════════════ */

/** Модели и двери этапа 4 в сцене: что нарисовано и как стоит каждая подвижная деталь. */
const DRAWN_S4 = () => Object.values(window.__mwApplianceModels ?? {}).flat().filter((m) => m.kind);
const DOORS = () => (window.__mwApplianceDoors ? window.__mwApplianceDoors() : null);
const APRON = () => (window.__mwCadSurfaces ? window.__mwCadSurfaces().filter((s) => s.name.startsWith('apron:')).map((s) => s.color) : null);
const nearColor = (a, b, eps = 0.003) => Array.isArray(a) && a.length === 3 && a.every((v, i) => Math.abs(v - b[i]) <= eps);

async function pickApron(page, tab, brand, article) {
  const open = await page.locator('[data-materials-panel]').first().isVisible().catch(() => false);
  if (!open) await ensureTool(page, 'materials');
  await page.waitForSelector('[data-materials-panel][data-loaded="1"]', { timeout: 60_000 });
  await press(page, '[data-material-target="apron"]', 'цель «Фартук всех стен»');
  await page.locator(`[data-material-tab="${tab}"]`).first().click();
  await page.locator(`[data-material-brand="${brand}"]`).first().click().catch(() => undefined);
  await page.locator('[data-material-search]').first().fill(article);
  await sleep(700);
  const row = page.locator(`[data-material-item="${article}"]`);
  await row.first().waitFor({ state: 'attached', timeout: 20_000 });
  await row.first().click();
  await sleep(1500);
}

async function partBosch(browser) {
  console.log('\n── BOSCH (1440 × 900): СВЧ, холодильник, посудомойка, вытяжка Bosch; отдельностоящий кнопкой; фартуки EGGER и GRANDEX');
  await withOrg(
    'BOSCH',
    browser,
    async ({ page, errors, project, service, orgId }) => {
      const fx = fixture('bosch');
      const E = fx.expect;
      const id = await project(fx);
      const imported = await page.request.post(`${BASE}/api/catalog/materials`, { data: { orgId, collections: E.apronCollections, confirm: true }, timeout: 180_000 });
      check('BOSCH.0 коллекции на проверке (с фартуками EGGER Splashback) загружены в каталог временной организации', imported.ok(), `${imported.status()} · ${E.apronCollections.join(', ')}`);
      await openStudio(page, id);
      await view3d(page);
      const drawn = await waitFor(page, DRAWN_S4, (list) => Array.isArray(list) && list.length === E.models.length, 30_000);
      const sameModels = (got, want) =>
        Array.isArray(got) && got.length === want.length && want.every((w) => got.some((g) => g.moduleId === w.moduleId && g.model === w.model && g.kind === w.kind && g.bottomMm === w.bottomMm && g.zMm === w.zMm));
      check(
        'BOSCH.1 в сцене модели Bosch на местах движка: СВЧ BFL524MB2 на полке ниши колонны, KIN86AF3M8 на дне колонны, SPV4HMX14Q за фасадом, DFT63CA60Q под шкафом',
        sameModels(drawn, E.models),
        `${JSON.stringify(drawn)} · движок ${JSON.stringify(E.models)}`,
      );
      const st = await page.evaluate(READ_STATUS);
      check(
        'BOSCH.2 BFL524MB2 в колонне — «Есть ошибки конструкции»: просвет 400 мм при 380…382 словами движка, цены нет',
        st.status === 'blocked' && st.hidden > 0 && E.blocking.length > 0 && st.strip.includes('просвет ниши между опорами 400 мм'),
        `${st.status} · ${st.strip.slice(0, 260)}`,
      );
      await shot(page, 'bosch-0-closed.png');

      await press(page, '[data-open-all]', '«Открыть всё»');
      const opened = await waitFor(
        page,
        DOORS,
        (list) => Array.isArray(list) && E.models.flatMap((m) => m.movers).every((mid) => list.some((d) => d.id === mid && (Math.abs(d.angleDeg) > 85 || d.slideMm > 100))),
        20_000,
      );
      const of = (suffix) => (opened ?? []).find((d) => d.id.endsWith(suffix));
      check(
        'BOSCH.3 «Открыть всё»: дверь СВЧ на 90°, корзины посудомойки выехали за открытым фасадом, экран вытяжки выдвинут',
        Math.abs(Math.abs(of(':microwave:door')?.angleDeg ?? 0) - 90) < 1 && (of(':dishwasher:baskets')?.slideMm ?? 0) > 300 && (of(':hood:screen')?.slideMm ?? 0) >= 149,
        JSON.stringify(opened),
      );
      await shot(page, 'bosch-1-open-microwave-dishwasher.png');
      await press(page, '[data-close-all]', '«Закрыть всё»');
      /* Ход выдвижного — сдвиг группы; у двери на оси группа стоит на оси (сдвиг — место оси), меряется угол. */
      const shut = (list) =>
        Array.isArray(list) && list.length > 0 && list.every((d) => Math.abs(d.angleDeg) < 1 && (!/:(baskets|screen)$/.test(d.id) || d.slideMm < 2));
      const closed = await waitFor(page, DOORS, shut, 20_000);
      check('BOSCH.4 «Закрыть всё» — двери на 0°, корзины и экран на месте', shut(closed), JSON.stringify(closed));

      /* Отдельностоящий холодильник — кнопкой модели в составе. */
      await ensureTool(page, 'furniture');
      await press(page, '[data-appliance-models="fridge"] [data-appliance-model="KGN39LB30U"]', 'холодильник KGN39LB30U');
      const freeDrawn = await waitFor(page, DRAWN_S4, (list) => Array.isArray(list) && list.some((m) => m.model === 'KGN39LB30U'), 30_000);
      check(
        'BOSCH.5 кнопка «Bosch KGN39LB30U»: отдельностоящий на полу, на 120 мм перед рядом — как в движке',
        sameModels(freeDrawn, E.freeModels),
        `${JSON.stringify(freeDrawn)} · движок ${JSON.stringify(E.freeModels)}`,
      );
      await press(page, '[data-open-all]', '«Открыть всё»');
      const fridgeOpen = await waitFor(page, DOORS, (list) => Array.isArray(list) && list.filter((d) => /:fridge:door:/.test(d.id) && Math.abs(Math.abs(d.angleDeg) - 90) < 1).length === 2, 20_000);
      check('BOSCH.6 двери KGN39LB30U открываются на 90° (обе)', Array.isArray(fridgeOpen), JSON.stringify(fridgeOpen));
      await shot(page, 'bosch-2-open-fridge.png');
      await press(page, '[data-close-all]', '«Закрыть всё»');

      const okSaved = await saved(page);
      const mw = await millworkOf(service, id);
      const models = mw?.requirements?.applianceModels ?? null;
      check('BOSCH.7 записано: модели кухни в составе объекта, холодильник — KGN39LB30U', okSaved && models?.fridge === 'KGN39LB30U' && models?.microwave === 'BFL524MB2', JSON.stringify(models));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
      await view3d(page);
      const again = await waitFor(page, DRAWN_S4, (list) => Array.isArray(list) && list.length === E.freeModels.length, 30_000);
      check('BOSCH.8 после перезагрузки — те же модели на тех же местах', sameModels(again, E.freeModels), JSON.stringify(again));

      /* Фартуки: EGGER Splashback, затем GRANDEX — цвет сцены = цвет позиции (sRGB → линейный). */
      await pickApron(page, 'apron', 'EGGER', E.apronEgger.code);
      const egger = await waitFor(page, APRON, (list) => Array.isArray(list) && list.length > 0 && list.every((c) => nearColor(c, E.apronEgger.linear)), 20_000);
      check(`BOSCH.9 фартук EGGER ${E.apronEgger.code} — в сцене его цвет ${E.apronEgger.hex}`, Array.isArray(egger), JSON.stringify(egger));
      /* Уточнений на экране не больше двух — остальное под «ещё N»: раскрываем, как человек. */
      const more = page.getByRole('button', { name: /^ещё \d+$/ });
      if ((await more.count()) > 0) await more.first().click();
      await sleep(400);
      const apronWords = await page.evaluate(() =>
        Array.from(document.querySelectorAll('li')).map((li) => li.innerText).find((t) => t.includes('толщина панели не подтверждена')) ?? null,
      );
      check(
        'BOSCH.10 фартук EGGER: толщина 8 / 9 мм по документам EGGER не сведена — уточнение словами в списке экрана (выпуск заперт)',
        Boolean(apronWords) && /9 мм/.test(apronWords) && /8 мм/.test(apronWords),
        apronWords?.slice(0, 300) ?? 'СЛОВ НЕТ',
      );
      await shot(page, 'bosch-3-apron-egger.png');
      await pickApron(page, 'countertop', 'GRANDEX', E.apronGrandex.code);
      const grandex = await waitFor(page, APRON, (list) => Array.isArray(list) && list.length > 0 && list.every((c) => nearColor(c, E.apronGrandex.linear)), 20_000);
      check(`BOSCH.11 фартук GRANDEX ${E.apronGrandex.code} — в сцене его цвет ${E.apronGrandex.hex}`, Array.isArray(grandex), JSON.stringify(grandex));
      await shot(page, 'bosch-4-apron-grandex.png');
      const okSaved2 = await saved(page);
      const mw2 = await millworkOf(service, id);
      check('BOSCH.12 записано: фартук ряда — позиция GRANDEX', okSaved2 && JSON.stringify(mw2 ?? {}).includes('"apronMaterial"'), (JSON.stringify(mw2 ?? {}).match(/"apronMaterial":\{[^}]*\}/) ?? ['В БАЗЕ НЕТ'])[0]);
      check('BOSCH.13 ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

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
          if (part === 'storage') await partStorage(browser);
          if (part === 'hood') await partHood(browser);
          if (part === 'column') await partColumn(browser);
          if (part === 'tablet') await partTablet(browser);
          if (part === 'bosch') await partBosch(browser);
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
