/**
 * ТЕХНИКА ПРОИЗВОДИТЕЛЯ В БРАУЗЕРЕ (ЭТАП 3) — НАСТОЯЩАЯ ОРГАНИЗАЦИЯ И ВИДЕОКАРТА.
 *
 * Запуск (после `npm run build`): `PART=<часть> node scripts/check-appliances.mjs`
 *   PART=kitchen — прямая 3800, демо-состав: в сцене типовая варочная на столешнице; «Мебель» → «Духовой шкаф:
 *                  под варочной» → PUE611BB5E и HBG272EB3: в сцене модели числами движка (место панели, вырез, низ
 *                  шкафа, дверь), смета — строки моделей без цены и вырез, ничего не заперто; «Открыть всё» и нажатие
 *                  на дверь — дверь на 90° и обратно; слой «Техника» прячет приборы; запись и перезагрузка; газ
 *                  PGH6B5K90R — блокирующее словами (вытяжка ниже 650 мм), цены нет; снимки.
 *   PART=u       — П 3800 + 1500 + 1740 с той же парой: дверь шкафа стены В на ходу заходит в мебель стены А —
 *                  блокирующее словами движка, цены нет; снимок открытой двери.
 *   PART=tablet  — 1024 × 768 касанием: «Под варочной» и модели, дверь открывается касанием, прокрутки по ширине нет.
 *
 * Сверка — по нарисованному (`__mwApplianceModels`, `__mwApplianceDoors`, `__mwEstimateLines`) и по базе (служебным
 * ключом); ожидания — `appliances-browser-fixture.ts` тем же путём экрана. Каждая часть — своя временная
 * организация: заводится служебным ключом и удаляется, уборка проверяется чтением. Снимки — `.capture-check/appliances`.
 */
import { execSync, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_APPLIANCES ?? 3323);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/appliances';
const PARTS = (process.env.PART ?? 'kitchen').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['kitchen', 'u', 'tablet'];
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
      execSync('npx tsx --tsconfig tsconfig.scripts.json scripts/appliances-browser-fixture.ts', {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  }
  const fx = fixtures[key];
  if (!fx) throw new Stop(`нет объекта «${key}» в appliances-browser-fixture`);
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

async function withOrg(label, browser, body, { viewport, touch = false }) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: limitedFetch },
  });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const made = { users: [], orgs: [], projects: [] };
  try {
    const email = `appliances-${stamp}@example.test`;
    const password = `Pw-${stamp}-appliances!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    made.users.push(data.user.id);
    const { data: org, error: orgError } = await service.from('orgs').insert({ slug: `appliances-${stamp}`, name: `Проверка техники ${label}` }).select('id').single();
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
          address: `Техника ${label}: ${fx.title}`,
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

/* ═════════════════════════  KITCHEN  ═════════════════════════ */

async function partKitchen(browser) {
  console.log('\n── KITCHEN (1440 × 900): варочная Bosch и духовой шкаф под ней — сцена, смета, дверь, слой, запись, газ');
  await withOrg(
    'KITCHEN',
    browser,
    async ({ page, errors, project, service }) => {
      const fx = fixture('kitchen');
      const E = fx.expect;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);

      let got = await waitFor(page, () => Object.values(window.__mwApplianceModels ?? {}).flat().length, (n) => n > 0, 30_000);
      got = await drawn(page);
      check(
        'KIT.1 как открыли: типовая варочная нарисована моделью на столешнице — место панели как у движка, шкафа под ней нет',
        sameDrawn(got, E.plain),
        `сцена ${drawnWords(got)} · движок ${drawnWords(E.plain)}`,
      );

      await pickPair(page, 'PUE611BB5E', 'HBG272EB3');
      got = await waitFor(page, () => Object.values(window.__mwApplianceModels ?? {}).flat(), (list) => list.some((d) => d.hob === 'PUE611BB5E' && d.oven === 'HBG272EB3'), 30_000);
      got = await drawn(page);
      check(
        'KIT.2 «Под варочной» + PUE611BB5E + HBG272EB3: в сцене модели в модуле движка, панель в вырезе 560 × 490 (место — как у движка), шкаф на 220 мм от пола, у шкафа своя дверь',
        sameDrawn(got, E.main),
        `сцена ${drawnWords(got)} · движок ${drawnWords(E.main)}`,
      );

      const est = await waitFor(page, () => (window.__mwEstimateLines ? window.__mwEstimateLines() : []), (list) => list.some((l) => l.key === 'hob_cutout'), 30_000);
      const keyed = (key) => est.find((l) => l.key === key);
      check(
        'KIT.3 смета экрана: строки моделей — «цена не задана» (розница карточки — справкой), вырез под панель; типовых строк варочной и духовки нет',
        Boolean(keyed('appliance_hob_PUE611BB5E')?.priceUnset) &&
          Boolean(keyed('appliance_oven_HBG272EB3')?.priceUnset) &&
          Boolean(keyed('hob_cutout')) &&
          !keyed('appliance_hob') &&
          !keyed('appliance_oven') &&
          E.mainKeys.includes('hob_cutout'),
        est.filter((l) => /appliance|hob_cutout/.test(l.key)).map((l) => `${l.key}${l.priceUnset ? ' (без цены)' : ` ${l.total}`}`).join(' | '),
      );
      const st = await page.evaluate(READ_STATUS);
      check(
        'KIT.4 главная пара встаёт по инструкциям: на экране ничего не заперто — цена есть, блокирующих строк про технику нет',
        E.mainFindings.length === 0 && st.status !== 'blocked' && st.hidden === 0 && !/Bosch|Духовой шкаф/.test(st.strip),
        `статус ${st.status} · «Цены нет» ${st.hidden} · полоса «${st.strip.slice(0, 160)}»`,
      );

      const doorId = E.main[0].doorId;
      const closed = (await doors(page)) ?? [];
      check('KIT.5 дверь шкафа в сцене одна, закрыта', closed.length === 1 && closed[0].id === doorId && closed[0].angleDeg === 0, JSON.stringify(closed));
      check('KIT.5б камера у шкафа', await cameraTo(page, E.camera), JSON.stringify(E.camera));
      await shot(page, 'kitchen-closed.png');
      await press(page, '[data-open-all]', '«Открыть всё»');
      await settle(page);
      const opened = (await doors(page)) ?? [];
      check('KIT.6 «Открыть всё» открывает и дверь шкафа: 90°, полотно горизонтально', opened.find((d) => d.id === doorId)?.angleDeg === 90, JSON.stringify(opened));
      await shot(page, 'kitchen-open.png');
      await press(page, '[data-close-all]', '«Закрыть всё»');
      await settle(page);
      check('KIT.6б «Закрыть всё» — дверь закрыта', (await doors(page))?.find((d) => d.id === doorId)?.angleDeg === 0, JSON.stringify(await doors(page)));

      const byClick = await pressDoor(page, doorId);
      check('KIT.7 нажатие на дверь шкафа открывает её (90°)', byClick.ok && byClick.angle === 90, byClick.ok ? `угол ${byClick.angle} · точка ${byClick.at}` : byClick.words);
      const back = await pressDoor(page, doorId);
      check('KIT.7б второе нажатие закрывает (0°)', back.ok && back.angle === 0, back.ok ? `угол ${back.angle} · точка ${back.at}` : back.words);

      await press(page, '[data-scene-layers-toggle]', '«Слои»');
      const layer = page.locator('[data-scene-layer="appliances"]');
      must('кнопка слоя «Техника»', (await layer.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-scene-layer="appliances"]');
      const count = Number(await layer.first().getAttribute('data-layer-count'));
      await layer.first().click();
      await sleep(600);
      const hiddenDoors = (await doors(page)) ?? [];
      await layer.first().click();
      await sleep(600);
      const shownDoors = (await doors(page)) ?? [];
      check(
        'KIT.8 слой «Техника»: на кнопке столько, сколько у экрана (коробки лиц приборов и модели); выключен — приборов в сцене нет, включён — снова на месте',
        count === E.layerCount && hiddenDoors.length === 0 && shownDoors.length === 1,
        `на кнопке ${count} (движок ${E.layerCount}) · дверей при выключенном ${hiddenDoors.length}, при включённом ${shownDoors.length}`,
      );

      const wrote = await saved(page);
      check('KIT.9 запись: «Сохранено»', wrote, wrote ? '' : 'состояние записи не «saved» за 30 с');
      const mw = await millworkOf(service, id);
      check(
        'KIT.9б в базе выбор кухни: модели PUE611BB5E и HBG272EB3, духовой шкаф под варочной',
        mw?.requirements?.applianceModels?.hob === 'PUE611BB5E' && mw?.requirements?.applianceModels?.oven === 'HBG272EB3' && mw?.requirements?.ovenUnderHob === true,
        JSON.stringify({ models: mw?.requirements?.applianceModels ?? null, under: mw?.requirements?.ovenUnderHob ?? null }),
      );
      await openStudio(page, id);
      await view3d(page);
      got = await waitFor(page, () => Object.values(window.__mwApplianceModels ?? {}).flat(), (list) => list.length > 0, 30_000);
      got = await drawn(page);
      check('KIT.10 после перезагрузки — те же модели на тех же местах', sameDrawn(got, E.main), `сцена ${drawnWords(got)}`);

      await ensureTool(page, 'furniture');
      await press(page, '[data-appliance-models="hob"] [data-appliance-model="PGH6B5K90R"]', 'модель варочной PGH6B5K90R');
      got = await waitFor(page, () => Object.values(window.__mwApplianceModels ?? {}).flat(), (list) => list.some((d) => d.hob === 'PGH6B5K90R'), 30_000);
      got = await drawn(page);
      const gas = await waitFor(page, READ_STATUS, (s) => s.status === 'blocked', 20_000);
      check(
        'KIT.11 газ PGH6B5K90R над шкафом: в сцене газовая модель на месте движка; вытяжка демо в 592 мм — блокирующее словами движка, цены нет',
        sameDrawn(got, E.gas) &&
          gas.status === 'blocked' &&
          gas.hidden > 0 &&
          E.gasFindings.length === 1 &&
          gas.strip.includes('вытяжка в 592 мм') &&
          gas.strip.includes('1508'),
        `сцена ${drawnWords(got)} · статус ${gas.status} · «Цены нет» ${gas.hidden} · «${gas.strip.slice(0, 220)}»`,
      );
      await cameraTo(page, E.camera);
      await shot(page, 'kitchen-gas.png');
      check('KITCHEN ошибок страницы нет', errors.length === 0, errors.slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  U  ═════════════════════════ */

async function partU(browser) {
  console.log('\n── U (1440 × 900): П 3800 + 1500 + 1740 — дверь шкафа стены В на ходу в мебель стены А');
  await withOrg(
    'U',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('u');
      const E = fx.expect;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      const got = await waitFor(page, () => Object.values(window.__mwApplianceModels ?? {}).flat(), (list) => list.length > 0, 30_000);
      check('U.1 в сцене модели на стене В — как у движка', sameDrawn([...got].sort((a, b) => (a.moduleId < b.moduleId ? -1 : 1)), E.drawn), `сцена ${drawnWords(got)} · движок ${drawnWords(E.drawn)}`);
      const st = await waitFor(page, READ_STATUS, (s) => s.status === 'blocked', 20_000);
      const words = E.findings[0].words;
      check(
        'U.2 блокирующее словами движка: шкаф не открыть, дверь откидывается на 518,5 мм и заходит в фасад «2 дверцы» стены А; цены нет',
        E.cornerClashes.length === 0 && st.status === 'blocked' && st.hidden > 0 && st.strip.includes(words),
        `статус ${st.status} · «Цены нет» ${st.hidden} · полоса «${st.strip.slice(0, 260)}»`,
      );
      await press(page, '[data-open-all]', '«Открыть всё»');
      await settle(page);
      const opened = (await doors(page)) ?? [];
      check('U.3 «Открыть всё» — дверь шкафа на 90° (видно, во что она упирается)', opened.length === 1 && opened[0].angleDeg === 90, JSON.stringify(opened));
      await shot(page, 'u-door-open.png');
      check('U ошибок страницы нет', errors.length === 0, errors.slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  TABLET  ═════════════════════════ */

async function partTablet(browser) {
  console.log('\n── TABLET (1024 × 768, касание): выбор пары и дверь шкафа касанием');
  await withOrg(
    'TABLET',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('kitchen');
      const E = fx.expect;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      await pickPair(page, 'PUE611BB5E', 'HBG272EB3', { touch: true });
      let got = await waitFor(page, () => Object.values(window.__mwApplianceModels ?? {}).flat(), (list) => list.some((d) => d.oven === 'HBG272EB3'), 30_000);
      got = await drawn(page);
      check('TAB.1 касанием: «Под варочной» и обе модели — в сцене модели на месте движка', sameDrawn(got, E.main), `сцена ${drawnWords(got)}`);
      const sizes = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-appliance-model], [data-oven-under-hob]')).map((el) => Math.round(el.getBoundingClientRect().height)),
      );
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check('TAB.2 кнопки выбора от 36 px, прокрутки по ширине нет', sizes.length > 0 && Math.min(...sizes) >= 36 && scroll <= 0, `кнопок ${sizes.length}, наименьшая ${Math.min(...sizes)} px · лишняя ширина ${scroll} px`);
      check('TAB.3 камера у шкафа', await cameraTo(page, E.camera), JSON.stringify(E.camera));
      const byTap = await pressDoor(page, E.main[0].doorId, { touch: true });
      check('TAB.4 касание двери шкафа открывает её (90°)', byTap.ok && byTap.angle === 90, byTap.ok ? `угол ${byTap.angle} · точка ${byTap.at}` : byTap.words);
      await shot(page, 'tablet.png');
      check('TABLET ошибок страницы нет', errors.length === 0, errors.slice(0, 3).join(' | '));
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
          if (part === 'kitchen') await partKitchen(browser);
          if (part === 'u') await partU(browser);
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
