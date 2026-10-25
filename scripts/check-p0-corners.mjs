/**
 * P0 В БРАУЗЕРЕ — НАСТОЯЩАЯ ОРГАНИЗАЦИЯ, НАСТОЯЩАЯ ВИДЕОКАРТА (ТЗ ALDIK STUDIO 2026-10-25, § 1, проверки 2–3, 13, 23).
 *
 * Запуск (после `npm run build`): `PART=<часть> node scripts/check-p0-corners.mjs`
 *   PART=owners — Г 3800 + 2400: панель угла, переключатель «Низ: Стена Б идёт в угол» — до нажатия сказано,
 *                 что изменится; после — в сцене ровно модули движка для нового владельца, итог сдвинулся ровно
 *                 на число с карточки; снимки 3D до и после, закрытой и «Открыть всё».
 *   PART=pair   — Г 3800 + 2400 с Г-модулями: «Верх: две дверцы на своих петлях» (видео) — до нажатия заходы
 *                 дверца в дверцу словами; после — у верхнего Г-модуля две створки (door:0, door:1), блокирующее со
 *                 словами, ряды на экране; дверца Б открывается одна, дверца А — только вместе с Б (по очереди),
 *                 «Открыть всё» / «Закрыть всё»; снимки закрыто / Б открыта / обе открыты.
 *   PART=video  — та же пара как на видео: «Без ручки» в инспекторе и петля каталога Blum 71B3550 (110°) через
 *                 «Фурнитура» → «Петли» → «Установить» (факты производителей — импортом в каталог организации):
 *                 заходов дверца в дверцу нет, обе открыты; снимок с камеры у угла снизу — открыто и закрыто.
 *   PART=reopen — прямая 3800, с объектом сохранена другая сумма (проверка 23): разница на экране числом, правка
 *                 сохраняется, а сумма объекта в базе — нет, пока её не приняли; «Принять» — в базе сумма экрана.
 *
 * Сверка — по нарисованному (`__mwCadModules`, `__mwCadLeaves`, `__mwOpenIds`, `[data-estimate-total]`) и по
 * базе (служебным ключом); ожидания — `p0-corners-fixture.ts` тем же путём экрана. Каждая часть — своя временная
 * организация: заводится служебным ключом и удаляется, уборка проверяется чтением.
 */
import { execSync, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_P0 ?? 3313);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/p0-corners';
const PARTS = (process.env.PART ?? 'owners').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['owners', 'pair', 'video', 'reopen'];
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
      execSync('npx tsx --tsconfig tsconfig.scripts.json scripts/p0-corners-fixture.ts', {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  }
  const fx = fixtures[key];
  if (!fx) throw new Stop(`нет объекта «${key}» в p0-corners-fixture`);
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
  await waitFor(page, () => (window.__mwCadLeaves ? window.__mwCadLeaves().leaves.length : -1), (n) => n > 0, 30_000);
}
async function viewPlan(page) {
  const b = page.locator('[data-studio-bottombar] [data-studio-view="plan"]');
  must('вид «План» в нижней панели', (await b.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-view="plan"]');
  await b.first().click({ timeout: 15_000 });
  await sleep(1500);
}
const modulesDrawn = (page) => page.evaluate(() => (window.__mwCadModules ? window.__mwCadModules().ids : null));
const leaves = (page) => page.evaluate(() => window.__mwCadLeaves());
const openIds = (page) => page.evaluate(() => (window.__mwOpenIds ? window.__mwOpenIds() : null));
const moving = (page) => page.evaluate(() => (window.__mwMovingCount ? window.__mwMovingCount() : -1));
const total = (page) =>
  page.evaluate(() => {
    const n = document.querySelector('[data-estimate-total]');
    return n ? Number(n.getAttribute('data-estimate-total')) : null;
  });
const READ_STATUS = () => ({
  status: document.querySelector('[data-studio-status]')?.getAttribute('data-studio-status') ?? null,
  hidden: document.querySelectorAll('[data-price-hidden]').length,
  strip: document.querySelector('[data-studio-blocking]')?.innerText ?? '',
});
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
async function click(page, selector, label) {
  const el = page.locator(selector);
  must(label, (await el.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: ${selector}`);
  await el.first().click({ timeout: 15_000 });
  await sleep(400);
}
async function shot(page, name) {
  await sleep(600);
  await page.screenshot({ path: `${OUT}/${name}`, timeout: 120_000 });
}
/** Панель «Мебель» и кнопка угла: угол выбран — карточки угла в панели библиотеки. */
async function openCorner(page, index) {
  const tool = page.locator('[data-studio-rail] [data-studio-tool="furniture"]');
  must('инструмент «Мебель» в рейке', (await tool.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="furniture"]');
  const furnitureOpen = () => page.evaluate(() => document.querySelector('[data-studio-context="furniture"]')?.getAttribute('data-open') === 'true');
  if (!(await furnitureOpen())) await tool.first().click();
  must('панель «Мебель» открыта', await furnitureOpen(), 'панель инструмента «Мебель» не открылась');
  await click(page, `[data-corner-index="${index}"]`, `кнопка угла ${index + 1}`);
  await page.waitForSelector('[data-corner-panel]', { timeout: 20_000 });
}
/** Переключатель панели угла: ключ, цена, слова до нажатия. */
const READ_OPTION = (selector) =>
  [...document.querySelectorAll(selector)].map((n) => ({
    key: n.getAttribute(selector.includes('door') ? 'data-corner-door' : 'data-corner-owner'),
    current: n.getAttribute('aria-pressed') === 'true',
    refused: n.getAttribute('data-refused') === '1',
    delta: n.getAttribute('data-delta'),
    changes: [...n.querySelectorAll(selector.includes('door') ? '[data-corner-door-change]' : '[data-corner-owner-change]')].map((c) => c.textContent ?? ''),
  }));
/** Крупный план угла: колесом к середине двух дверец, до упора зума сцены. */
async function zoomTo(page, ids) {
  const points = (await Promise.all(ids.map((partId) => page.evaluate((target) => window.__mwCadPartPoint(target), partId)))).filter(Boolean);
  must('точки дверец для крупного плана', points.length === ids.length, `точек ${points.length} из ${ids.length}`);
  const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  await page.mouse.move(x, y);
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.wheel(0, -400);
    await sleep(150);
  }
  await settle(page);
  await sleep(800);
}
/** Снимок участка вокруг дверец пары — то, что сравнивается с кадрами видео. */
async function cornerShot(page, name, ids) {
  await sleep(600);
  const points = (await Promise.all(ids.map((partId) => page.evaluate((target) => window.__mwCadPartPoint(target), partId)))).filter(Boolean);
  if (points.length === 0) return;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.max(0, Math.min(...xs) - 260);
  const y = Math.max(0, Math.min(...ys) - 260);
  const viewport = page.viewportSize();
  const width = Math.min(viewport.width - x, Math.max(...xs) - Math.min(...xs) + 520);
  const height = Math.min(viewport.height - y, Math.max(...ys) - Math.min(...ys) + 520);
  await page.screenshot({ path: `${OUT}/${name}`, clip: { x, y, width, height }, timeout: 120_000 });
}
/** Деталь по экранной точке её зоны касания — мышью, как человек. */
async function press(page, partId) {
  const at = await page.evaluate((target) => window.__mwCadPartPoint(target), partId);
  must(`точка детали ${partId}`, Boolean(at), `НУЛЕВОЙ СЕЛЕКТОР: part:${partId}`);
  await page.mouse.click(at.x, at.y);
  await sleep(300);
  await settle(page);
}

/* ─────────────────────────  организация  ───────────────────────── */

const limitedFetch = (input, init = {}) => fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) });

async function withOrg(label, browser, body, { viewport, importHardware = false }) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: limitedFetch },
  });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const made = { users: [], orgs: [], projects: [] };
  try {
    const email = `p0-${stamp}@example.test`;
    const password = `Pw-${stamp}-p0!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    made.users.push(data.user.id);
    const { data: org, error: orgError } = await service.from('orgs').insert({ slug: `p0-${stamp}`, name: `Проверка P0 ${label}` }).select('id').single();
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
    const context = await browser.newContext({ viewport });
    await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', sameSite: 'Lax' })));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    const seeded = await page.request.post(`${BASE}/api/catalog/seed-rates`, { data: { orgId: org.id } });
    if (!seeded.ok()) throw new Error(`типовой прайс не заведён: ${seeded.status()}`);
    if (importHardware) {
      /* Факты производителей — в каталог организации тем же импортом, что у человека (`/admin/catalog`). */
      const res = await page.request.post(`${BASE}/api/catalog/hardware`, { data: { orgId: org.id, confirm: true }, timeout: 120_000 });
      const imported = await res.json().catch(() => ({}));
      if (!res.ok() || !(imported.added > 0)) throw new Error(`фурнитура не загрузилась: ${res.status()} · ${JSON.stringify(imported).slice(0, 200)}`);
    }
    const project = async (fx, extra = {}) => {
      const { data: row, error: projectError } = await service
        .from('projects')
        .insert({
          org_id: org.id,
          client_name: 'Проверка',
          status: 'in_progress',
          address: `P0 ${label}: ${fx.title}`,
          zone: 'Кухня',
          measurements: fx.measurement,
          millwork: {
            survey: fx.survey,
            templateId: 'linear-standard',
            requirements: fx.requirements,
            selectedVariant: 'optimal',
            shape: fx.shape,
            ...(fx.corners.length > 0 ? { corners: fx.corners } : {}),
          },
          ...extra,
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

const idsOf = (fx) => fx.rows.flatMap((row) => row.modules.map((m) => m.id)).sort();

/* ═════════════════════════  OWNERS  ═════════════════════════ */

async function partOwners(browser) {
  console.log('\n── OWNERS (1440 × 900): Г 3800 + 2400 — кто ведёт низ в угол, переключателем');
  await withOrg(
    'OWNERS',
    browser,
    async ({ page, errors, project }) => {
      const before = fixture('g');
      const after = fixture('g-lower-next');
      const id = await project(before);
      await openStudio(page, id);
      await view3d(page);
      const drawn0 = await modulesDrawn(page);
      check('в сцене ровно модули движка (ведёт стена А)', JSON.stringify(drawn0) === JSON.stringify(idsOf(before)), `нарисовано ${drawn0?.length ?? 'НЕТ'} из ${idsOf(before).length}`);
      await shot(page, 'owners-a-3d.png');
      await click(page, '[data-open-all]', '«Открыть всё»');
      await settle(page, 90_000);
      await shot(page, 'owners-a-3d-open-all.png');
      await click(page, '[data-close-all]', '«Закрыть всё»');
      await settle(page, 90_000);

      await openCorner(page, 0);
      const owners = await waitFor(page, READ_OPTION, (list) => list.some((o) => o.key === 'owner:lower:next' && o.delta !== ''), 60_000, '[data-corner-owner]');
      const flip = owners.find((o) => o.key === 'owner:lower:next');
      must('переключатель «Низ: Стена Б идёт в угол» есть и посчитан', Boolean(flip && !flip.refused && flip.delta !== ''), JSON.stringify(owners.map((o) => [o.key, o.delta, o.refused])));
      check(
        'до нажатия сказано, что изменится в рядах: длины рядов и модули с мм',
        flip.changes.some((line) => /ряд \d+ → \d+ мм/.test(line)) && flip.changes.some((line) => / → /.test(line) && /мм/.test(line)),
        flip.changes.join(' | ').slice(0, 300) || 'СЛОВ НЕТ',
      );
      const total0 = await total(page);
      await page.locator('[data-corner-owner="owner:lower:next"]').first().click({ timeout: 15_000 });
      const drawn1 = await waitFor(page, () => (window.__mwCadModules ? window.__mwCadModules().ids : null), (ids) => JSON.stringify(ids) === JSON.stringify(idsOf(after)), 60_000);
      check('после нажатия в сцене ровно модули движка нового владельца (ведёт стена Б)', JSON.stringify(drawn1) === JSON.stringify(idsOf(after)), `нарисовано ${drawn1?.length ?? 'НЕТ'} из ${idsOf(after).length}`);
      const total1 = await waitFor(page, () => {
        const n = document.querySelector('[data-estimate-total]');
        return n ? Number(n.getAttribute('data-estimate-total')) : null;
      }, (v) => v !== null && v !== total0, 30_000);
      check('итог на экране сдвинулся ровно на число с карточки', total0 !== null && total1 !== null && total1 - total0 === Number(flip.delta), `${total0} → ${total1}: ${total1 - total0} при карточке ${flip.delta}`);
      const now = await page.evaluate(() => (document.querySelector('[data-corner-panel] p')?.textContent ?? '').trim());
      check('панель угла говорит, кто ведёт низ', /Низ ведёт в угол стена Б/.test(now), now.slice(0, 160));
      await shot(page, 'owners-b-3d.png');
      await click(page, '[data-open-all]', '«Открыть всё» после смены');
      await settle(page, 90_000);
      await shot(page, 'owners-b-3d-open-all.png');
      await click(page, '[data-close-all]', '«Закрыть всё» после смены');
      await settle(page, 90_000);
      await viewPlan(page);
      await shot(page, 'owners-b-plan.png');
      check('OWNERS: ошибок страницы нет', errors.length === 0, errors.slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  PAIR  ═════════════════════════ */

async function partPair(browser) {
  console.log('\n── PAIR (1440 × 900): верхний Г-шкаф с видео — две дверцы на своих петлях');
  await withOrg(
    'PAIR',
    browser,
    async ({ page, errors, project }) => {
      const before = fixture('g-lmod');
      const after = fixture('g-pair');
      const upper = after.rows.flatMap((row) => row.modules).find((m) => m.kind === 'corner_upper');
      must('у движка верхний Г-модуль с двумя дверцами', Boolean(upper) && upper.leaves.length === 2, JSON.stringify(upper?.leaves ?? null));
      const [idA, idB] = [`${upper.id}:door:0`, `${upper.id}:door:1`];
      const id = await project(before);
      await openStudio(page, id);
      await view3d(page);
      await openCorner(page, 0);
      const doors = await waitFor(page, READ_OPTION, (list) => list.length === 2 && list.every((o) => o.current || o.delta !== ''), 60_000, '[data-corner-door]');
      const pair = doors.find((o) => o.key === 'doors:pair');
      check(
        'дверцы верхнего Г-шкафа — два варианта; «книжка» стоит сейчас; у пары до нажатия — заходы дверца в дверцу словами',
        doors.length === 2 && doors.find((o) => o.key === 'doors:bifold')?.current === true && pair && pair.changes.length === 2 && pair.changes.every((line) => line.startsWith('после смены цены не будет:')),
        `${doors.map((o) => `${o.key}${o.current ? '*' : ''} ${o.delta}`).join(', ')} · ${(pair?.changes ?? []).map((line) => line.slice(0, 80)).join(' | ')}`,
      );
      await page.locator('[data-corner-door="doors:pair"]').first().click({ timeout: 15_000 });
      const drawn = await waitFor(
        page,
        () => (window.__mwCadLeaves ? window.__mwCadLeaves().leaves.map((leaf) => leaf.id) : []),
        (list) => list.includes(idB),
        60_000,
      );
      check('после нажатия у верхнего Г-модуля две створки в сцене — door:0 и door:1', drawn.includes(idA) && drawn.includes(idB), `створок ${drawn.filter((leafId) => leafId.startsWith(upper.id)).join(', ') || 'НЕТ'}`);
      const state = await waitFor(page, READ_STATUS, (v) => v.status === 'blocked', 30_000);
      check(
        'по умолчанию (условные скобы, петли до 90°): цены нет, причина словами — очередь дверец, ручка у угла, угол раскрытия',
        state.status === 'blocked' && state.hidden > 0 && /открываются по очереди|открывается второй/.test(state.strip) && /\d+(,\d)? мм/.test(state.strip),
        state.strip.slice(0, 300) || 'ПОЛОСЫ НЕТ',
      );
      const drawnModules = await modulesDrawn(page);
      check('ряды на экране — мебель не спрятана', JSON.stringify(drawnModules) === JSON.stringify(idsOf(after)), `нарисовано ${drawnModules?.length ?? 'НЕТ'} из ${idsOf(after).length}`);
      await shot(page, 'pair-closed.png');
      await zoomTo(page, [idA, idB]);
      await cornerShot(page, 'pair-closed-corner.png', [idA, idB]);

      /* Дверца Б — одна; дверца А — только вместе с Б. */
      const closed = await leaves(page);
      await press(page, idB);
      const onlyB = await openIds(page);
      check('нажатие на дверцу Б открывает только её', JSON.stringify(onlyB) === JSON.stringify([idB]), `открыто ${JSON.stringify(onlyB)}`);
      const bOpen = await leaves(page);
      check('дверца Б едет своим мешем', (bOpen.bifold[idB] ?? []).length > 0, `мешей Б ${(bOpen.bifold[idB] ?? []).length}`);
      await shot(page, 'pair-b-open.png');
      await cornerShot(page, 'pair-b-open-corner.png', [idA, idB]);
      await press(page, idA);
      const both = await openIds(page);
      const bothOpen = await leaves(page);
      check('нажатие на дверцу А при открытой Б открывает и её — обе открыты', both?.includes(idA) && both?.includes(idB), `открыто ${JSON.stringify(both)}`);
      check('дверца А двинулась', JSON.stringify(bothOpen.bifold[idA] ?? []) !== JSON.stringify(bOpen.bifold[idA] ?? []), `меши А ${JSON.stringify((bothOpen.bifold[idA] ?? []).slice(0, 1))}`);
      await shot(page, 'pair-both-open.png');
      await cornerShot(page, 'pair-both-open-corner.png', [idA, idB]);
      await click(page, '[data-close-all]', '«Закрыть всё»');
      await settle(page, 90_000);
      const shut = await openIds(page);
      check('«Закрыть всё» закрывает обе', Array.isArray(shut) && shut.length === 0, `открыто ${JSON.stringify(shut)}`);
      /* Дверца А первой: без Б ей не открыться — открываются обе, сначала Б. */
      await press(page, idA);
      const aFirst = await openIds(page);
      check('нажатие на дверцу А при закрытой Б открывает обе (сначала Б)', aFirst?.includes(idA) && aFirst?.includes(idB), `открыто ${JSON.stringify(aFirst)}`);
      await click(page, '[data-close-all]', '«Закрыть всё»');
      await settle(page, 90_000);
      await click(page, '[data-open-all]', '«Открыть всё»');
      await settle(page, 90_000);
      await shot(page, 'pair-open-all.png');
      await cornerShot(page, 'pair-open-all-corner.png', [idA, idB]);
      await click(page, '[data-close-all]', '«Закрыть всё»');
      await settle(page, 90_000);

      /* «Без ручки», как на видео: заход в ручку у угла уходит, очередь дверец и угол петель остаются названными. */
      await press(page, idB);
      await click(page, '[data-handle="none"]', '«Без ручки» у верхнего Г-шкафа');
      const noHandle = await waitFor(page, READ_STATUS, (v) => !v.strip.includes('ручку дверцы'), 30_000);
      check(
        '«Без ручки»: заход в ручку у угла ушёл; осталась очередь дверец и угол раскрытия петель — словами, без чужих советов',
        !noHandle.strip.includes('ручку дверцы') && /открывается второй/.test(noHandle.strip) && !noHandle.strip.includes('закрепите пенал'),
        noHandle.strip.slice(0, 300),
      );
      await click(page, '[data-close-all]', '«Закрыть всё»');
      await settle(page, 90_000);
      void closed;
      check('PAIR: ошибок страницы нет', errors.length === 0, errors.slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  VIDEO  ═════════════════════════ */

async function tool(page, name) {
  const b = page.locator(`[data-studio-rail] [data-studio-tool="${name}"]`);
  if ((await b.count()) === 0) return false;
  await b.first().click();
  await sleep(500);
  return true;
}

async function partVideo(browser) {
  console.log('\n── VIDEO (1440 × 900): верхний Г-шкаф как на видео — «Без ручки», петля каталога 110°, обе дверцы открыты');
  await withOrg(
    'VIDEO',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('g-pair');
      const upper = fx.rows.flatMap((row) => row.modules).find((m) => m.kind === 'corner_upper');
      must('у движка верхний Г-модуль с двумя дверцами', Boolean(upper) && upper.leaves.length === 2, JSON.stringify(upper?.leaves ?? null));
      const [idA, idB] = [`${upper.id}:door:0`, `${upper.id}:door:1`];
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);

      /* Модуль — списком объектов, как в приёмке фурнитуры; «Без ручки» — в инспекторе. */
      if (!(await page.locator('[data-studio-objects]').first().isVisible().catch(() => false))) {
        must('инструмент «Выбор»', await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="select"]');
      }
      const row = page.locator(`[data-object-module="${upper.id}"]`);
      must(`модуль ${upper.id} в списке объектов`, (await row.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-object-module="${upper.id}"]`);
      await row.first().click();
      await sleep(600);
      await click(page, '[data-handle="none"]', '«Без ручки» у верхнего Г-шкафа');
      await sleep(1500);

      /* Петля каталога 110° (Blum 71B3550) — «Фурнитура» → место «Петли» → «Установить». */
      must('инструмент «Фурнитура»', await tool(page, 'hardware'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="hardware"]');
      await waitFor(page, () => Number(document.querySelector('[data-hw-panel]')?.getAttribute('data-hw-items') ?? 0), (n) => n >= 1, 60_000);
      const slot = page.locator('[data-hw-slot="hinge"]');
      must(
        'место «Петли» у верхнего Г-шкафа',
        (await slot.count()) > 0,
        `НУЛЕВОЙ СЕЛЕКТОР: [data-hw-slot="hinge"] · места: ${await page.evaluate(() => Array.from(document.querySelectorAll('[data-hw-slot]')).map((b) => b.getAttribute('data-hw-slot')).join(', '))}`,
      );
      if ((await slot.first().getAttribute('aria-pressed')) !== 'true') await slot.first().click();
      await page.locator('[data-hw-search]').first().fill('71B3550');
      await sleep(400);
      const item = page.locator('[data-hw-item="MFR-BLUM-71B3550"]');
      must('петля Blum 71B3550 (110°) в списке места', (await item.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-hw-item="MFR-BLUM-71B3550"]');
      await item.first().click();
      await sleep(300);
      await click(page, '[data-hw-install]', '«Установить»');
      const installed = await waitFor(page, () => document.querySelector('[data-hw-slot="hinge"]')?.getAttribute('data-hw-installed') ?? null, (v) => v === 'MFR-BLUM-71B3550', 20_000);
      check('петля 110° стоит на месте «Петли» углового шкафа', installed === 'MFR-BLUM-71B3550', `стоит ${installed ?? 'НЕТ'}`);
      const state = await waitFor(page, READ_STATUS, (v) => !v.strip.includes('углового шкафа'), 30_000);
      check(
        '«Без ручки» и петля 110°: заходов дверца в дверцу нет — ни ручки у угла, ни очереди дверец',
        !state.strip.includes('углового шкафа'),
        state.strip.slice(0, 300) || 'блокирующих нет',
      );
      console.log(`    статус ${state.status}: ${state.strip.slice(0, 400) || 'блокирующих нет'}`);

      /* Открыта только пара — Б, затем А (как на видео); камера у угла, снизу; тот же кадр закрытым. */
      must('инструмент «Выбор»', await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="select"]');
      await press(page, idB);
      await press(page, idA);
      const both = await openIds(page);
      check(
        'открыта ровно пара: дверца Б, затем А',
        JSON.stringify([...(both ?? [])].sort()) === JSON.stringify([idA, idB].sort()),
        `открыто ${JSON.stringify(both)}`,
      );
      const all = await leaves(page);
      const a = all.leaves.find((leaf) => leaf.id === idA);
      const b = all.leaves.find((leaf) => leaf.id === idB);
      must('зоны касания дверец пары в сцене', Boolean(a && b), 'НУЛЕВОЙ СЕЛЕКТОР: part:door:0 / part:door:1');
      const target = [0, 1, 2].map((k) => (a.world[k] + b.world[k]) / 2000);
      /* Камера — по биссектрисе угла: сумма нормалей стен А и Б в комнату (`runPlacements` фикстуры), ниже шкафа. */
      const normal = (row) => {
        const r = (row.placement.rotationYDeg * Math.PI) / 180;
        return [Math.sin(r), Math.cos(r)];
      };
      const [nA, nB] = [normal(fx.rows[0]), normal(fx.rows[1])];
      const bx = nA[0] + nB[0];
      const bz = nA[1] + nB[1];
      const len = Math.hypot(bx, bz) || 1;
      const pose = { position: [target[0] + (bx / len) * 1.7, target[1] - 0.8, target[2] + (bz / len) * 1.7], target };
      await page.evaluate((p) => window.__mwCadCamera(p), pose);
      await sleep(2500);
      await shot(page, 'video-both-open.png');
      await click(page, '[data-close-all]', '«Закрыть всё»');
      await settle(page, 90_000);
      await page.evaluate((p) => window.__mwCadCamera(p), pose);
      await sleep(2000);
      await shot(page, 'video-closed.png');
      check('VIDEO: ошибок страницы нет', errors.length === 0, errors.slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 }, importHardware: true },
  );
}

/* ═════════════════════════  REOPEN  ═════════════════════════ */

async function partReopen(browser) {
  console.log('\n── REOPEN (1440 × 900): сумма, сохранённая с объектом, не меняется молча (проверка 23)');
  await withOrg(
    'REOPEN',
    browser,
    async ({ page, errors, project, service }) => {
      const fx = fixture('straight');
      const AGREED = 1_000_000;
      const id = await project(fx, { total: AGREED });
      await openStudio(page, id);
      const drift = await waitFor(page, () => {
        const n = document.querySelector('[data-total-drift]');
        return n ? Number(n.getAttribute('data-total-drift')) : null;
      }, (v) => v !== null, 60_000);
      const shown = await total(page);
      check('разница с сохранённой суммой — на экране числом', drift !== null && shown !== null && drift === shown - AGREED, `экран ${shown} · сохранено ${AGREED} · разница ${drift}`);
      const text = await page.evaluate(() => document.querySelector('[data-total-drift]')?.textContent ?? '');
      check('слова: обе суммы и что новая не запишется без согласия', text.includes('не запишется') && text.includes('сохранена') && /\d/.test(text), text.slice(0, 220));
      await shot(page, 'reopen-drift.png');

      /* Правка состава (панель «Мебель» → «Техника» → микроволновка) — сохраняется; сумма объекта в базе — нет. */
      const tool = page.locator('[data-studio-rail] [data-studio-tool="furniture"]');
      must('инструмент «Мебель» в рейке', (await tool.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="furniture"]');
      const furnitureOpen = () => page.evaluate(() => document.querySelector('[data-studio-context="furniture"]')?.getAttribute('data-open') === 'true');
      if (!(await furnitureOpen())) await tool.first().click();
      const added = await waitFor(
        page,
        () => {
          const chip = [...document.querySelectorAll('[data-composition] button[aria-pressed="false"]')].find((b) => (b.textContent ?? '').trim() === 'Микроволновка');
          if (!chip) return null;
          chip.click();
          return 'Микроволновка';
        },
        (v) => v !== null,
        20_000,
      );
      must('правка состава: микроволновка в кухню', Boolean(added), 'НУЛЕВОЙ СЕЛЕКТОР: [data-composition] «Микроволновка» не нажата');
      const saved = await waitFor(page, () => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null, (v) => v === 'saved', 60_000);
      const row1 = (await service.from('projects').select('total, millwork').eq('id', id).single()).data;
      check(
        'правка записана, а сумма объекта в базе — прежняя, пока разницу не приняли',
        saved === 'saved' && Number(row1.total) === AGREED && Boolean(row1.millwork?.savedAt),
        `запись ${saved} · в базе ${row1.total} · состояние записано ${row1.millwork?.savedAt ?? 'НЕТ'}`,
      );
      await click(page, '[data-total-accept]', '«Принять новую сумму»');
      const afterAccept = await waitFor(
        page,
        () => ({ state: document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null, drift: document.querySelectorAll('[data-total-drift]').length }),
        (v) => v.state === 'saved' && v.drift === 0,
        60_000,
      );
      const shownNow = await total(page);
      const row2 = (await service.from('projects').select('total').eq('id', id).single()).data;
      check('после «Принять» — в базе сумма экрана, разницы на экране нет', afterAccept.drift === 0 && Math.round(Number(row2.total)) === shownNow, `в базе ${row2.total} · экран ${shownNow}`);
      check('REOPEN: ошибок страницы нет', errors.length === 0, errors.slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  прогон  ═════════════════════════ */

async function main() {
  for (const part of PARTS) if (!KNOWN.includes(part)) throw new Stop(`неизвестная часть «${part}»: ${KNOWN.join(', ')}`);
  loadEnv();
  mkdirSync(OUT, { recursive: true });
  const build = buildId();
  freePort(PORT);
  const log = createWriteStream(`${OUT}/server-${PARTS.join('-')}.log`);
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { shell: true, env: { ...process.env, SITE_PASSWORD: '' } });
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  try {
    const t0 = Date.now();
    for (;;) {
      try {
        if ((await fetch(`${BASE}/login`)).ok) break;
      } catch {
        /* сервер ещё встаёт */
      }
      if (Date.now() - t0 > 90_000) throw new Stop('сервер не поднялся за 90 с');
      await sleep(500);
    }
    console.log(`сборка ${build}, порт ${PORT}`);
    const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu'] });
    try {
      for (const part of PARTS) {
        const started = Date.now();
        try {
          if (part === 'owners') await partOwners(browser);
          if (part === 'pair') await partPair(browser);
          if (part === 'video') await partVideo(browser);
          if (part === 'reopen') await partReopen(browser);
          check(`часть ${part} дошла до конца`, true, `${Math.round((Date.now() - started) / 1000)} с`);
        } catch (error) {
          check(`часть ${part} дошла до конца`, false, error instanceof Error ? error.message.slice(0, 300) : String(error));
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    freePort(PORT);
  }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
