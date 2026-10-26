/**
 * P1 В БРАУЗЕРЕ — СТЕКЛЯННЫЕ ВИТРИНЫ НА НАСТОЯЩЕЙ ОРГАНИЗАЦИИ И ВИДЕОКАРТЕ (ТЗ ALDIK STUDIO P1, § 11).
 *
 * Запуск (после `npm run build`): `PART=<часть> node scripts/check-p1-vitrines.mjs`
 *   PART=upper        — демо-кухня: «Выбор» → верхний шкаф 3300 → блок «Витрина» → «Сделать витриной»: в сцене
 *                       рамка (4 планки профиля) и стекло; бронзовое стекло, чёрный профиль, лента по бокам; петли
 *                       слева и справа — дверь открывается своей кромкой, рамка и стекло едут с ней; «Интерьер»:
 *                       снимки закрыто/открыто, виды стекла, покрытия профиля, лента вкл/выкл; запись и перезагрузка.
 *   PART=construction — тот же шкаф: каркас из профиля (боковины стекло 6 мм), затем цельностеклянная 8 мм —
 *                       стекло и профиль в сцене числом движка; «Деталировка» и «Карта раскроя» — стекло и покупные
 *                       изделия отдельным списком, выпуск заперт словами витрины; снимки в «Интерьере».
 *   PART=counter      — стена без окна: витрина на столешнице — низ на рабочей поверхности, верх ряда, затем до
 *                       потолка полем высоты; снимок.
 *   PART=sweep        — шкаф у пенала духовки: петли у пенала — блокирующее словами, цены нет; петли справа — снято.
 *   PART=rooms        — гостиная: тот же блок, та же правка; стекло в рамке в сцене; снимок.
 *   PART=tablet       — 1024 × 768 касанием: блок «Витрина» досягаем, «Сделать витриной» и вид стекла; прокрутки
 *                       по ширине нет.
 *
 * Сверка — по нарисованному (`__mwCadVitrine`, `__mwCadLeaves`, `__mwOpenIds`) и по базе (служебным ключом);
 * ожидания — `p1-vitrines-fixture.ts` тем же путём экрана. Каждая часть — своя временная организация: заводится
 * служебным ключом и удаляется, уборка проверяется чтением. Снимки — `.capture-check/p1-vitrines`.
 */
import { execSync, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_P1 ?? 3315);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/p1-vitrines';
const PARTS = (process.env.PART ?? 'upper').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['upper', 'construction', 'counter', 'sweep', 'rooms', 'tablet'];
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
      execSync('npx tsx --tsconfig tsconfig.scripts.json scripts/p1-vitrines-fixture.ts', {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  }
  const fx = fixtures[key];
  if (!fx) throw new Stop(`нет объекта «${key}» в p1-vitrines-fixture`);
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
async function view3d(page) {
  const b = page.locator('[data-studio-bottombar] [data-studio-view="3d"]');
  must('вид «3D» в нижней панели', (await b.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-view="3d"]');
  await b.first().click({ timeout: 15_000 });
  const t0 = Date.now();
  let state = null;
  while (Date.now() - t0 < 120_000) {
    state = await page.evaluate(() => document.querySelector('[data-studio-viewport] [data-scene]')?.getAttribute('data-scene-state') ?? null);
    if (state === 'ready' || state === 'failed') break;
    await sleep(150);
  }
  must('3D готова', state === 'ready', `состояние ${state ?? 'НЕТ'} за ${Date.now() - t0} мс`);
  await waitFor(page, () => (window.__mwCadVitrine ? 1 : 0), (n) => n === 1, 30_000);
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
async function selectModule(page, moduleId) {
  await ensureTool(page, 'select');
  const row = page.locator(`[data-object-module="${moduleId}"]`);
  must(`модуль ${moduleId} в списке объектов`, (await row.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-object-module="${moduleId}"]`);
  await row.first().click();
  await page.waitForSelector(`[data-vitrine-editor][data-vitrine-id="${moduleId}"]`, { timeout: 20_000 });
  await sleep(300);
}
async function click(page, selector, label) {
  const el = page.locator(selector);
  must(label, (await el.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: ${selector}`);
  await el.first().scrollIntoViewIfNeeded().catch(() => undefined);
  await el.first().click({ timeout: 15_000 });
  await sleep(450);
}
const vitrineProbe = (page) => page.evaluate(() => (window.__mwCadVitrine ? window.__mwCadVitrine() : null));
const packCount = (probe, name) => (probe?.packs ?? []).filter((p) => p.name === name).reduce((s, p) => s + p.count, 0);
/** Пачки витрины в сцене совпали с ожиданием движка: стекло по виду, профиль по покрытию. */
const packsMatch = (probe, expect) =>
  Object.entries(expect.glass).every(([kind, n]) => packCount(probe, `glass:${kind}`) === n) &&
  Object.entries(expect.profile).every(([finish, n]) => packCount(probe, `profile:${finish}`) === n) &&
  (probe?.packs ?? []).filter((p) => p.name.startsWith('glass:') && p.name !== 'glass:shelf').reduce((s, p) => s + p.count, 0) ===
    Object.values(expect.glass).reduce((s, n) => s + n, 0) &&
  (probe?.packs ?? []).filter((p) => p.name.startsWith('profile:')).reduce((s, p) => s + p.count, 0) === Object.values(expect.profile).reduce((s, n) => s + n, 0);
const packsWords = (probe) => (probe?.packs ?? []).map((p) => `${p.name}×${p.count}`).join(', ') || 'нет';
/**
 * ПАЧКА СТОИТ НА ВИТРИНЕ: центр габарита её экземпляров в мире — у центра двери (±30 мм по X и Y). Счёт
 * экземпляров этого не говорит: пачка, пересозданная без матриц, рисует их все в начале координат.
 */
async function packAtDoor(page, probe, name, door) {
  const pack = (probe?.packs ?? []).find((p) => p.name === name);
  const leaves = await page.evaluate(() => window.__mwCadLeaves?.() ?? null);
  const at = leaves?.leaves.find((l) => l.id === door)?.world ?? null;
  if (!pack?.boundsMm || !at) return { ok: false, words: `пачка ${name}: ${pack ? 'без габарита' : 'НЕТ'} · дверь ${at ? at.join(',') : 'НЕТ'}` };
  const b = pack.boundsMm;
  const center = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2];
  const ok = Math.abs(center[0] - at[0]) <= 30 && Math.abs(center[1] - at[1]) <= 30;
  return { ok, words: `${name}: центр ${center.map((v) => Math.round(v)).join(',')} при двери ${at[0]},${at[1]} мм` };
}
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
/** Камера на дверь витрины: зона касания двери — в мире, мм (`__mwCadLeaves`); ряд прямой, лицом к +z. */
async function lookAtDoor(page, door, distance = 1.5, drop = 0) {
  const leaf = await waitFor(page, () => window.__mwCadLeaves?.(), (v) => Boolean(v?.leaves?.length), 20_000);
  const at = leaf?.leaves.find((l) => l.id === door);
  must(`дверь ${door} в сцене`, Boolean(at), `НУЛЕВОЙ СЕЛЕКТОР: part:${door}`);
  /* `drop` — цель ниже центра двери, м: у витрины на столешнице в кадре должны быть плита и нижний ряд. */
  const target = at.world.map((v, k) => v / 1000 - (k === 1 ? drop : 0));
  const ok = await cameraTo(page, { position: [target[0] - 0.45 * distance, target[1] + 0.1, target[2] + distance], target });
  must('камера у витрины', ok, 'поза не встала');
  await settle(page);
}
async function designOn(page) {
  await ensureTool(page, 'lighting');
  await page.waitForSelector('[data-lighting-panel]', { timeout: 30_000 });
  const btn = page.locator('[data-light-design]');
  must('кнопка «Интерьер»', (await btn.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-light-design]');
  if ((await btn.first().getAttribute('aria-pressed')) !== 'true') await btn.first().click();
  const l = await waitFor(page, () => (window.__mwLighting ? window.__mwLighting() : null), (v) => v?.design === true && v.warming !== true, 120_000);
  must('режим «Интерьер», программы света собраны', l?.design === true && l.warming !== true, l ? `программы ещё собираются (${l.ready})` : 'режим не включился');
}
const doorState = (page, door) =>
  page.evaluate((id) => {
    const leaf = window.__mwCadLeaves?.().leaves.find((l) => l.id === id) ?? null;
    return { open: (window.__mwOpenIds?.() ?? []).includes(id), rotation: leaf?.rotationDeg ?? null, riders: leaf?.riders ?? 0, body: leaf?.body ?? 0 };
  }, door);
/** Сетка снимков на отдельной странице — один лист вместо шести файлов. */
async function sheet(page, name, clips) {
  const sheetPage = await page.context().newPage();
  await sheetPage.setViewportSize({ width: 1500, height: 1100 });
  await sheetPage.setContent(
    `<html><body style="margin:0;background:#16150F;color:#F2EFE6;font:15px sans-serif"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px">${clips
      .map((c) => `<figure style="margin:0"><img style="width:100%" src="data:image/png;base64,${c.png}"/><figcaption>${c.title}</figcaption></figure>`)
      .join('')}</div></body></html>`,
  );
  await sheetPage.screenshot({ path: `${OUT}/${name}`, fullPage: true });
  await sheetPage.close();
}
async function clipOf(page) {
  const box = await page.locator('[data-studio-viewport] canvas').first().boundingBox();
  await sleep(600);
  return (await page.screenshot({ clip: { x: box.x + box.width * 0.15, y: box.y + box.height * 0.05, width: box.width * 0.7, height: box.height * 0.9 } })).toString('base64');
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
    const email = `p1-${stamp}@example.test`;
    const password = `Pw-${stamp}-p1!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    made.users.push(data.user.id);
    const { data: org, error: orgError } = await service.from('orgs').insert({ slug: `p1-${stamp}`, name: `Проверка P1 ${label}` }).select('id').single();
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
          address: `P1 ${label}: ${fx.title}`,
          zone: fx.zone,
          measurements: fx.measurement,
          millwork: {
            survey: fx.survey,
            templateId: fx.templateId ?? 'linear-standard',
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

/** Модуль в сохранённом объекте — из базы, служебным ключом. */
async function savedModule(service, projectId, moduleId) {
  const { data } = await service.from('projects').select('millwork').eq('id', projectId).single();
  const runs = data?.millwork?.runs ?? {};
  for (const run of Object.values(runs)) {
    for (const unit of [...(run.modules ?? []), ...(run.upperSegments ?? []).flatMap((s) => s.modules ?? [])]) {
      if (unit.id === moduleId) return unit;
    }
  }
  return null;
}

/* ═════════════════════════  UPPER  ═════════════════════════ */

async function partUpper(browser) {
  console.log('\n── UPPER (1440 × 900): верхний шкаф — стекло в алюминиевой рамке, стекло и профиль, лента, петли, ход, запись');
  await withOrg(
    'UPPER',
    browser,
    async ({ page, errors, project, service }) => {
      const fx = fixture('kitchen');
      const UPPER = fx.ids.upper;
      const door = `${UPPER}:door:0`;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      const before = await vitrineProbe(page);
      check('UPPER.0 до витрины стекла и профиля витрины в сцене нет', packsMatch(before, fx.expect.before), packsWords(before));

      await selectModule(page, UPPER);
      await click(page, `[data-vitrine-editor][data-vitrine-id="${UPPER}"] [data-vitrine-action="make"]`, '«Сделать витриной»');
      await page.waitForSelector(`[data-vitrine-editor][data-vitrine-construction-now="carcass"]`, { timeout: 20_000 });
      let probe = await waitFor(page, () => window.__mwCadVitrine?.(), (v) => Boolean(v) && (v.packs ?? []).some((p) => p.name.startsWith('profile:')), 20_000);
      check(
        'UPPER.1 «Сделать витриной»: в сцене рамка из 4 планок профиля и стекло — столько, сколько посчитал движок тем же путём экрана; блок называет конструкцию',
        packsMatch(probe, fx.expect.A),
        `сцена: ${packsWords(probe)} · движок: ${JSON.stringify(fx.expect.A)}`,
      );
      const marks = await page.evaluate(() => {
        const n = document.querySelector('[data-vitrine-marks]');
        return n ? { bottom: Number(n.getAttribute('data-vitrine-bottom')), top: Number(n.getAttribute('data-vitrine-top')) } : null;
      });
      check('UPPER.2 отметки витрины в блоке: низ 1450 и верх ряда', marks?.bottom === 1450 && marks.top > marks.bottom, JSON.stringify(marks));

      await click(page, '[data-vitrine-glass="bronze"]', 'стекло «Бронзовое»');
      probe = await waitFor(page, () => window.__mwCadVitrine?.(), (v) => (v?.packs ?? []).some((p) => p.name === 'glass:bronze'), 15_000);
      await click(page, '[data-vitrine-profile="black"]', 'профиль «Чёрный»');
      probe = await waitFor(page, () => window.__mwCadVitrine?.(), (v) => (v?.packs ?? []).some((p) => p.name === 'profile:black'), 15_000);
      check(
        'UPPER.3 бронзовое стекло и чёрный профиль: стекло двери в пачке «glass:bronze», 4 планки в пачке «profile:black», прежних пачек нет',
        packCount(probe, 'glass:bronze') === 1 && packCount(probe, 'glass:clear') === 0 && packCount(probe, 'profile:black') === 4 && packCount(probe, 'profile:silver') === 0,
        packsWords(probe),
      );
      await click(page, '[data-vitrine-led="sides"]', 'лента «По бокам»');
      probe = await waitFor(page, () => window.__mwCadVitrine?.(), (v) => (v?.led ?? 0) >= 2, 15_000);
      check('UPPER.4 лента «По бокам»: две светящиеся полосы в сцене', probe?.led === 2, `полос ${probe?.led ?? 'НЕТ'}`);

      /* Петли слева и справа: дверь открывается от своей кромки, рамка и стекло едут с ней. */
      const opening = page.locator('[data-opening-picker] [data-opening="left"]');
      must('кнопка «Петли слева» в «Открывании»', (await opening.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-opening-picker] [data-opening="left"]');
      const side = async (value) => {
        await click(page, `[data-opening-picker] [data-opening="${value}"]`, `«Петли ${value === 'left' ? 'слева' : 'справа'}»`);
        await settle(page);
        await click(page, '[data-vitrine-action="open"]', '«Открыть двери»');
        await waitFor(page, (d) => (window.__mwOpenIds?.() ?? []).includes(d), (v) => v === true, 15_000, door);
        await settle(page);
        const state = await doorState(page, door);
        const riders = await vitrineProbe(page);
        await click(page, '[data-vitrine-action="close"]', '«Закрыть двери»');
        await settle(page);
        return { state, riders };
      };
      const left = await side('left');
      const right = await side('right');
      check(
        'UPPER.5 петли слева / справа: открытая дверь повёрнута в свою сторону (−90° и +90°), с ней едут 4 планки рамки и стекло; закрылась — обратно в пачке',
        left.state.open &&
          right.state.open &&
          left.state.rotation?.[1] === -90 &&
          right.state.rotation?.[1] === 90 &&
          left.riders?.riderFrames === 4 &&
          left.riders?.riderGlass === 1 &&
          right.riders?.riderFrames === 4,
        `слева ${JSON.stringify(left.state.rotation)} · рамка ${left.riders?.riderFrames}, стекло ${left.riders?.riderGlass} · справа ${JSON.stringify(right.state.rotation)} · рамка ${right.riders?.riderFrames}`,
      );

      /* «Интерьер»: снимки витрины закрытой и открытой, виды стекла, покрытия профиля, лента. */
      await designOn(page);
      await click(page, '[data-ambient="evening"]', 'вечер');
      await ensureTool(page, 'select');
      await selectModule(page, UPPER);
      await lookAtDoor(page, door);
      await shot(page, 'UPPER_DESIGN_CLOSED.png');
      await click(page, '[data-vitrine-action="open"]', '«Открыть двери»');
      await settle(page);
      await lookAtDoor(page, door);
      await shot(page, 'UPPER_DESIGN_OPEN.png');
      await click(page, '[data-vitrine-action="close"]', '«Закрыть двери»');
      await settle(page);

      const glassTitles = { clear: 'Прозрачное', extra_clear: 'Осветлённое', grey: 'Серое тонированное', bronze: 'Бронзовое', frosted: 'Матовое', fluted: 'Рифлёное' };
      const glassClips = [];
      const glassSeen = [];
      for (const kind of Object.keys(glassTitles)) {
        await click(page, `[data-vitrine-glass="${kind}"]`, `стекло «${glassTitles[kind]}»`);
        const got = await waitFor(page, () => window.__mwCadVitrine?.(), (v) => (v?.packs ?? []).some((p) => p.name === `glass:${kind}`), 15_000);
        glassSeen.push(packCount(got, `glass:${kind}`) === 1 ? kind : `НЕТ:${kind}`);
        await lookAtDoor(page, door);
        glassClips.push({ title: glassTitles[kind], png: await clipOf(page) });
      }
      await sheet(page, 'UPPER_GLASS_KINDS.png', glassClips);
      check('UPPER.6 шесть видов стекла: каждый — своей пачкой в сцене «Интерьера»', glassSeen.every((k) => !k.startsWith('НЕТ')), glassSeen.join(', '));

      const profileTitles = { silver: 'Серебро', black: 'Чёрный', champagne: 'Шампань', bronze: 'Бронза', gold: 'Золото' };
      const profileClips = [];
      const profileSeen = [];
      await click(page, '[data-vitrine-glass="clear"]', 'стекло «Прозрачное»');
      for (const finish of Object.keys(profileTitles)) {
        await click(page, `[data-vitrine-profile="${finish}"]`, `профиль «${profileTitles[finish]}»`);
        const got = await waitFor(page, () => window.__mwCadVitrine?.(), (v) => (v?.packs ?? []).some((p) => p.name === `profile:${finish}`), 15_000);
        const pack = (got?.packs ?? []).find((p) => p.name === `profile:${finish}`);
        profileSeen.push(pack && pack.count === 4 && pack.metalness >= 0.5 ? finish : `НЕТ:${finish}`);
        await lookAtDoor(page, door, 1.25);
        profileClips.push({ title: profileTitles[finish], png: await clipOf(page) });
      }
      await sheet(page, 'UPPER_PROFILE_FINISHES.png', profileClips);
      check('UPPER.7 пять покрытий профиля: 4 планки своей пачкой, металл (metalness ≥ 0.5)', profileSeen.every((k) => !k.startsWith('НЕТ')), profileSeen.join(', '));

      await click(page, '[data-vitrine-led="off"]', 'лента «Выключена»');
      await lookAtDoor(page, door);
      await shot(page, 'UPPER_LED_OFF.png');
      const ledOff = await vitrineProbe(page);
      await click(page, '[data-vitrine-led="sides"]', 'лента «По бокам»');
      await lookAtDoor(page, door);
      await shot(page, 'UPPER_LED_SIDES.png');
      const ledOn = await vitrineProbe(page);
      check(
        'UPPER.8 «Интерьер», вечер: лента выкл → по бокам — полос ленты витрины 0 → 2, обе горят',
        ledOff?.diffusers === 0 && ledOn?.diffusers === 2 && ledOn.lit === 2,
        `${ledOff?.diffusers} → ${ledOn?.diffusers} (горят ${ledOn?.lit})`,
      );

      /* Запись и перезагрузка: витрина, вид стекла и покрытие — в базе и снова в сцене. */
      const saved = await waitFor(page, () => document.querySelector('[data-save-state]')?.getAttribute('data-save-state'), (v) => v === 'saved', 60_000);
      const row = await savedModule(service, id, UPPER);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
      await view3d(page);
      /* Объект открывается в том же режиме сцены, в котором записан («Интерьер»): лента — диффузорами света комнаты. */
      const reopened = await waitFor(page, () => window.__mwCadVitrine?.(), (v) => (v?.packs ?? []).some((p) => p.name === 'profile:gold') && (v.led + v.diffusers) === 2, 60_000);
      check(
        'UPPER.9 запись → перезагрузка: в базе витрина (покрытие золото, лента по бокам) и вид стекла прозрачное; в сцене после перезагрузки — те же пачки и полосы',
        saved === 'saved' &&
          row?.vitrine?.construction === 'carcass' &&
          row.vitrine.profile === 'gold' &&
          row.vitrine.led === 'sides' &&
          row.glass === undefined &&
          packCount(reopened, 'profile:gold') === 4 &&
          packCount(reopened, 'glass:clear') === 1 &&
          (reopened?.led ?? 0) + (reopened?.diffusers ?? 0) === 2,
        `запись ${saved} · в базе ${JSON.stringify(row?.vitrine ?? null)} стекло ${row?.glass ?? 'прозрачное'} · сцена ${packsWords(reopened)}, полос ${(reopened?.led ?? 0) + (reopened?.diffusers ?? 0)}`,
      );
      check('UPPER ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  CONSTRUCTION  ═════════════════════════ */

async function partConstruction(browser) {
  console.log('\n── CONSTRUCTION (1440 × 900): каркас из профиля и цельностеклянная — сцена, деталировка, карта раскроя');
  await withOrg(
    'CONSTRUCTION',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('kitchen');
      const UPPER = fx.ids.upper;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      await selectModule(page, UPPER);
      await click(page, '[data-vitrine-action="make"]', '«Сделать витриной»');
      await page.waitForSelector('[data-vitrine-construction-now="carcass"]', { timeout: 20_000 });

      await click(page, '[data-vitrine-construction="frame"]', 'конструкция «Алюминиевый каркас»');
      await page.waitForSelector('[data-vitrine-construction-now="frame"]', { timeout: 20_000 });
      await click(page, '[data-vitrine-thickness="6"]', 'стекло 6 мм');
      let probe = await waitFor(page, () => window.__mwCadVitrine?.(), (v) => (v?.packs ?? []).filter((p) => p.name.startsWith('profile:')).reduce((s, p) => s + p.count, 0) === 16, 20_000);
      const words = await page.evaluate(() => document.querySelector('[data-vitrine-production]')?.textContent ?? '');
      const placedCad = await packAtDoor(page, probe, 'profile:silver', `${UPPER}:door:0`);
      check(
        'CONS.1 каркас из профиля, стекло 6 мм: стекло двери, двух боковин и задней стенки и 16 планок профиля — числом движка и на месте витрины; выпуск назван словами (каркас не подтверждён цехом)',
        packsMatch(probe, fx.expect.B) && placedCad.ok && /каркас из алюминиевого профиля/.test(words),
        `сцена: ${packsWords(probe)} · ${placedCad.words} · движок: ${JSON.stringify(fx.expect.B)} · «${words.slice(0, 120)}»`,
      );
      await designOn(page);
      await click(page, '[data-ambient="evening"]', 'вечер');
      await ensureTool(page, 'select');
      await selectModule(page, UPPER);
      await lookAtDoor(page, `${UPPER}:door:0`, 1.7);
      const inDesign = await vitrineProbe(page);
      const placedDesign = await packAtDoor(page, inDesign, 'profile:silver', `${UPPER}:door:0`);
      const glassDesign = await packAtDoor(page, inDesign, 'glass:clear', `${UPPER}:door:0`);
      check(
        'CONS.1б «Интерьер» (материалы сменились на металл и физическое стекло): пачки профиля и стекла стоят на витрине, а не в начале координат',
        placedDesign.ok && glassDesign.ok && packsMatch(inDesign, fx.expect.B),
        `${placedDesign.words} · ${glassDesign.words} · ${packsWords(inDesign)}`,
      );
      await shot(page, 'CONS_FRAME_DESIGN.png');

      await click(page, '[data-vitrine-construction="glass"]', 'конструкция «Цельностеклянная»');
      await page.waitForSelector('[data-vitrine-construction-now="glass"]', { timeout: 20_000 });
      await click(page, '[data-vitrine-thickness="8"]', 'стекло 8 мм');
      probe = await waitFor(page, () => window.__mwCadVitrine?.(), (v) => (v?.packs ?? []).filter((p) => p.name.startsWith('glass:') && p.name !== 'glass:shelf').reduce((s, p) => s + p.count, 0) === 6, 20_000);
      check(
        'CONS.2 цельностеклянная 8 мм: стекло двери, боковин, крыши, дна и задней стенки, профиля нет — числом движка',
        packsMatch(probe, fx.expect.C),
        `сцена: ${packsWords(probe)} · движок: ${JSON.stringify(fx.expect.C)}`,
      );
      await lookAtDoor(page, `${UPPER}:door:0`, 1.7);
      await shot(page, 'CONS_GLASS_DESIGN.png');

      /* Деталировка и карта раскроя — стекло и покупные изделия отдельным списком. */
      await ensureTool(page, 'documents');
      await click(page, '[data-studio-doc="panels"]', '«Деталировка»');
      const panelRows = await waitFor(page, () => document.querySelectorAll('[data-panel-outside-row]').length, (n) => n > 0, 30_000);
      await page.locator('[data-panel-outside]').first().scrollIntoViewIfNeeded().catch(() => undefined);
      await shot(page, 'CONS_PANELS_OUTSIDE.png');
      await click(page, '[data-studio-doc="cutting"]', '«Карта раскроя»');
      /* Причины выпуска свёрнуты до двух — раскрываем все, как человек кнопкой «И ещё N». */
      await page.waitForSelector('[data-cutting-map]', { timeout: 30_000 });
      const more = page.locator('[data-cut-notes] button');
      if ((await more.count()) > 0 && /И ещё/.test((await more.first().textContent()) ?? '')) {
        await more.first().click();
        await sleep(300);
      }
      const cut = await waitFor(
        page,
        () => {
          const map = document.querySelector('[data-cutting-map]');
          return map
            ? {
                rows: document.querySelectorAll('[data-cut-outside-row]').length,
                release: map.getAttribute('data-release'),
                reasons: [...document.querySelectorAll('[data-release-reason="blocking"]')].map((n) => n.textContent ?? ''),
              }
            : null;
        },
        (v) => Boolean(v) && v.rows > 0,
        30_000,
      );
      await page.locator('[data-cut-outside]').first().scrollIntoViewIfNeeded().catch(() => undefined);
      await shot(page, 'CONS_CUTTING_OUTSIDE.png');
      check(
        'CONS.3 «Деталировка» и «Карта раскроя»: стекло и покупные изделия витрины — отдельным списком, строк столько же, сколько в списке движка; выпуск в цех заперт, причина — словами витрины',
        panelRows === fx.expect.outsideC &&
          cut?.rows === fx.expect.outsideC &&
          cut.release === 'locked' &&
          (cut.reasons ?? []).some((r) => /Витрина «/.test(r) && /цельностеклянная/.test(r)),
        `деталировка ${panelRows}, карта ${cut?.rows} при ${fx.expect.outsideC} · выпуск ${cut?.release} · «${(cut?.reasons ?? []).find((r) => /Витрина/.test(r))?.slice(0, 140) ?? 'ПРИЧИНЫ ВИТРИНЫ НЕТ'}»`,
      );
      check('CONSTRUCTION ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  COUNTER  ═════════════════════════ */

async function partCounter(browser) {
  console.log('\n── COUNTER (1440 × 900): витрина на столешнице — до верха ряда, затем до потолка');
  await withOrg(
    'COUNTER',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('open');
      const target = fx.ids.counter;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      await selectModule(page, target);
      await click(page, '[data-vitrine-action="make"]', '«Сделать витриной»');
      await page.waitForSelector('[data-vitrine-construction-now="carcass"]', { timeout: 20_000 });
      await click(page, '[data-vitrine-counter="counter"]', '«На столешнице»');
      const marksOf = () =>
        page.evaluate(() => {
          const n = document.querySelector('[data-vitrine-marks]');
          return n ? { bottom: Number(n.getAttribute('data-vitrine-bottom')), top: Number(n.getAttribute('data-vitrine-top')) } : null;
        });
      const onCounter = await waitFor(page, () => {
        const n = document.querySelector('[data-vitrine-marks]');
        return n ? Number(n.getAttribute('data-vitrine-bottom')) : null;
      }, (v) => v === fx.expect.bottomMm, 20_000);
      const m1 = await marksOf();
      check(
        'COUNTER.1 «На столешнице»: низ витрины — рабочая поверхность, верх — верх ряда (как у движка)',
        onCounter === fx.expect.workTopMm && m1?.top === fx.expect.topMm,
        `низ ${m1?.bottom} (рабочая поверхность ${fx.expect.workTopMm}), верх ${m1?.top} (движок ${fx.expect.topMm})`,
      );
      await designOn(page);
      await ensureTool(page, 'select');
      await selectModule(page, target);
      await lookAtDoor(page, `${target}:door:0`, 2.6, 0.45);
      await shot(page, 'COUNTER_DESIGN.png');
      const field = page.locator('[data-vitrine-field="height"]');
      must('поле высоты витрины', (await field.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-vitrine-field="height"]');
      await field.first().fill(String(fx.expect.ceilingMm - fx.expect.workTopMm));
      await field.first().blur();
      const toCeiling = await waitFor(page, () => {
        const n = document.querySelector('[data-vitrine-marks]');
        return n ? Number(n.getAttribute('data-vitrine-top')) : null;
      }, (v) => v === fx.expect.ceilingMm, 20_000);
      await lookAtDoor(page, `${target}:door:0`, 2.9, 0.6);
      await shot(page, 'COUNTER_TO_CEILING.png');
      check('COUNTER.2 высота «до потолка» полем: верх витрины — потолок', toCeiling === fx.expect.ceilingMm, `верх ${toCeiling} при потолке ${fx.expect.ceilingMm}`);
      check('COUNTER ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  SWEEP  ═════════════════════════ */

async function partSweep(browser) {
  console.log('\n── SWEEP (1440 × 900): витрина у пенала духовки — ход двери вдоль ряда');
  await withOrg(
    'SWEEP',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('kitchen');
      const NEXT = fx.ids.next;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      await selectModule(page, NEXT);
      await click(page, '[data-vitrine-action="make"]', '«Сделать витриной»');
      await page.waitForSelector('[data-vitrine-construction-now="carcass"]', { timeout: 20_000 });
      await click(page, '[data-opening-picker] [data-opening="left"]', '«Петли слева» — у пенала');
      const read = () =>
        page.evaluate(() => ({
          strip: document.querySelector('[data-studio-blocking]')?.textContent ?? '',
          hidden: document.querySelectorAll('[data-price-hidden]').length,
        }));
      const blocked = await waitFor(page, () => document.querySelector('[data-studio-blocking]')?.textContent ?? '', (t) => /витрины/.test(t), 20_000);
      const left = await read();
      await shot(page, 'SWEEP_BLOCKING.png');
      await click(page, '[data-opening-picker] [data-opening="right"]', '«Петли справа»');
      await waitFor(page, () => document.querySelector('[data-studio-blocking]')?.textContent ?? '', (t) => !/витрины/.test(t), 20_000);
      const right = await read();
      check(
        'SWEEP.1 петли у пенала: блокирующее словами (дверь витрины заходит в корпус духового шкафа на 16 мм), цены нет; петли справа — блокирующего и запрета цены нет',
        /дверь 1 витрины/.test(blocked) && /16 мм/.test(blocked) && left.hidden > 0 && !/витрины/.test(right.strip) && right.hidden === 0,
        `слева: «${left.strip.slice(0, 160)}» · цены нет ${left.hidden} · справа: «${right.strip.slice(0, 80)}» · цены нет ${right.hidden}`,
      );
      check('SWEEP ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  ROOMS  ═════════════════════════ */

async function partRooms(browser) {
  console.log('\n── ROOMS (1440 × 900): гостиная — тот же блок «Витрина»');
  await withOrg(
    'ROOMS',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('living');
      const target = fx.ids.target;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      await selectModule(page, target);
      await click(page, '[data-vitrine-action="make"]', '«Сделать витриной»');
      await page.waitForSelector('[data-vitrine-construction-now="carcass"]', { timeout: 20_000 });
      const probe = await waitFor(page, () => window.__mwCadVitrine?.(), (v) => (v?.packs ?? []).some((p) => p.name.startsWith('profile:')), 20_000);
      check(
        `ROOMS.1 гостиная (${fx.templateId}): витрина тем же блоком — стекло и рамки двери числом движка`,
        packsMatch(probe, fx.expect.after),
        `сцена: ${packsWords(probe)} · движок: ${JSON.stringify(fx.expect.after)}`,
      );
      await designOn(page);
      await ensureTool(page, 'select');
      await selectModule(page, target);
      await lookAtDoor(page, `${target}:door:0`, 1.9);
      await shot(page, 'ROOMS_LIVING_DESIGN.png');
      check('ROOMS ошибок страницы нет', errors.length === 0, errors.join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  TABLET  ═════════════════════════ */

async function partTablet(browser) {
  console.log('\n── TABLET (1024 × 768, касание): блок «Витрина» досягаем');
  await withOrg(
    'TABLET',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('kitchen');
      const UPPER = fx.ids.upper;
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      await ensureTool(page, 'select');
      const row = page.locator(`[data-object-module="${UPPER}"]`);
      must(`модуль ${UPPER} в списке объектов`, (await row.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-object-module="${UPPER}"]`);
      await row.first().tap();
      await page.waitForSelector(`[data-vitrine-editor][data-vitrine-id="${UPPER}"]`, { timeout: 20_000 });
      const make = page.locator('[data-vitrine-action="make"]');
      await make.first().scrollIntoViewIfNeeded();
      await make.first().tap();
      await page.waitForSelector('[data-vitrine-construction-now="carcass"]', { timeout: 20_000 });
      const glass = page.locator('[data-vitrine-glass="grey"]');
      await glass.first().scrollIntoViewIfNeeded();
      await glass.first().tap();
      const probe = await waitFor(page, () => window.__mwCadVitrine?.(), (v) => (v?.packs ?? []).some((p) => p.name === 'glass:grey'), 15_000);
      const layout = await page.evaluate(() => ({
        scroll: document.scrollingElement.scrollWidth - window.innerWidth,
        buttons: [...document.querySelectorAll('[data-vitrine-editor] button')].map((b) => b.getBoundingClientRect().height),
      }));
      await shot(page, 'TABLET_VITRINE.png');
      check(
        'TABLET.1 1024 × 768 касанием: «Сделать витриной» и «Серое тонированное» — в сцене стекло grey; прокрутки по ширине нет; кнопки блока не ниже 28 px',
        packCount(probe, 'glass:grey') === 1 && layout.scroll <= 0 && layout.buttons.every((h) => h >= 28),
        `сцена ${packsWords(probe)} · прокрутка ${layout.scroll} px · кнопок ${layout.buttons.length}, наименьшая ${Math.min(...layout.buttons).toFixed(0)} px`,
      );
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
          if (part === 'upper') await partUpper(browser);
          if (part === 'construction') await partConstruction(browser);
          if (part === 'counter') await partCounter(browser);
          if (part === 'sweep') await partSweep(browser);
          if (part === 'rooms') await partRooms(browser);
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
