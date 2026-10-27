/**
 * MEASUREMENT 2.0 В БРАУЗЕРЕ — ФОРМА КОМНАТЫ, ПОВОРОТЫ, ОТРАЖЕНИЕ, ПРЕЖНИЙ ЗАМЕР.
 *
 * Запуск (после `npm run build`): `PART=<часть> node scripts/check-measurement-v2.mjs`
 *   PART=tiles   — Studio, Г 2360 + 2540: «Замер» → плитки └ ┘ ┌ ┐, длины А и Б, «Показать, что получится» →
 *                  предпросмотр → «Применить»: план повёрнут как плитка, стена А — левая у угла, сторона
 *                  кухни на плане и в 3D одна, каждый модуль от угла на плане = в 3D; снимки плана и 3D.
 *   PART=mirror  — та же кухня: «Отразить комнату» → предпросмотр (стены под мебелью наоборот, итог) →
 *                  «Применить»: сторона на плане и в 3D одна, модули на местах; «Отменить» и «Вернуть»;
 *                  перезагрузка — в базе замер 2.0 с поворотом налево и «ряд здесь» на стене 2.
 *   PART=u       — П 2800 + 3200 + 1800: «Отразить» → П в зеркале; плитка ⊓ — тот же ряд, план повёрнут.
 *   PART=turns   — вся комната 3600 × 2800: «Обойти в другую сторону» и «Начать обход со стены 3» — та же
 *                  кухня; поворот стены налево, «+ стена после» и «удалить» — предпросмотр с потерями, отмена.
 *   PART=legacy  — прежний замер Г 2360 налево 2540 (как объект заказчика): расхождение названо, план и 3D
 *                  разной стороны; «Перестроить по замеру…» → предпросмотр → «Применить»: сторона одна, модуль
 *                  в тех же мм от угла, итог тот же; перезагрузка — замер 2.0 в базе, правка на стене 1.
 *   PART=wizard  — мастер (шаг «Замер» → «Стены»): та же панель формы; «+ Стена» — новый идентификатор,
 *                  «×» — что пропадёт, до нажатия.
 *   PART=tablet  — 1024 × 768 касанием: плитки и предпросмотр досягаемы, прокрутки по ширине нет.
 *   PART=placement — свободная сборка Г: модуль стены Б — «от левого угла стены» числом (1 мм), «прижать» к
 *                  соседу, на плане и в 3D там же; перенос на стену А с предпросмотром, на занятое место — отказ
 *                  с мм; в базе — модуль на стене А, со стены Б снят.
 *   PART=k1|k2|k3 — эталонные кухни владельца (`measurement-v2-kitchens.ts`): коллекции RAL Design и EGGER
 *                  загружаются в организацию, кухня открывается в Studio — каждый модуль движка в сцене на том же
 *                  месте и отметках, фасады пачками по материалу, деталировка антресолей числом движка, после
 *                  перезагрузки та же мебель; у k3 — «В линию с кладовкой над колонной» кнопкой блока «Антресоль».
 *   PART=gap     — зазор до потолка: «Настройки цеха» 30 мм без галочки → верх «до потолка» 2670 и «не подтверждено
 *                  цехом» у ряда; галочка — пометки нет, верх тот же.
 *   PART=fridge  — свободная П: холодильник со стены А на стену Б (предпросмотр, база, 3D фасадом в комнату),
 *                  модуль стены В числом и вплотную к углу Б–В.
 *
 * Сверка — по нарисованному: план (`[data-plan-wall]`, `[data-plan-module]` — миллиметры листа) и сцена
 * (`__mwCadRoom().lines`, `__mwCadModules().boxes` — экземпляры пачек в мире), и по базе (служебным
 * ключом). Каждая часть — своя временная организация: заводится служебным ключом и удаляется, уборка
 * проверяется чтением. Снимки — `.capture-check/measurement-v2`.
 */
import { execSync, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_M2 ?? 3317);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/measurement-v2';
const PARTS = (process.env.PART ?? 'tiles').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['tiles', 'mirror', 'u', 'turns', 'legacy', 'wizard', 'tablet', 'placement', 'k1', 'k2', 'k3', 'gap', 'fridge'];
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
      execSync('npx tsx --tsconfig tsconfig.scripts.json scripts/measurement-v2-browser-fixture.ts', {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  }
  const fx = fixtures[key];
  if (!fx) throw new Stop(`нет объекта «${key}» в measurement-v2-browser-fixture`);
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
async function ensureTool(page, key) {
  const b = page.locator(`[data-studio-rail] [data-studio-tool="${key}"]`);
  must(`инструмент «${key}» в рейке`, (await b.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="${key}"]`);
  if ((await b.first().getAttribute('aria-pressed')) !== 'true') {
    await b.first().click({ timeout: 15_000 });
    await sleep(500);
  }
}
async function view(page, key) {
  const b = page.locator(`[data-studio-bottombar] [data-studio-view="${key}"]`);
  must(`вид «${key}» в нижней панели`, (await b.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-studio-view="${key}"]`);
  await b.first().click({ timeout: 15_000 });
  if (key === '3d') {
    const t0 = Date.now();
    let state = null;
    while (Date.now() - t0 < 120_000) {
      state = await page.evaluate(() => document.querySelector('[data-studio-viewport] [data-scene]')?.getAttribute('data-scene-state') ?? null);
      if (state === 'ready' || state === 'failed') break;
      await sleep(150);
    }
    must('3D готова', state === 'ready', `состояние сцены ${state}`);
    await waitFor(page, () => Boolean(window.__mwCadRoom && window.__mwCadModules), Boolean, 30_000);
    await sleep(800);
  } else {
    await page.waitForSelector('[data-studio-viewport] [data-room-plan]', { timeout: 30_000 });
    await sleep(400);
  }
}
async function click(page, selector, label) {
  const el = page.locator(selector);
  must(label, (await el.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: ${selector}`);
  await el.first().scrollIntoViewIfNeeded().catch(() => undefined);
  await el.first().click({ timeout: 15_000 });
  await sleep(450);
}
async function shot(page, name) {
  await sleep(600);
  await page.screenshot({ path: `${OUT}/${name}`, timeout: 120_000 });
}
const total = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-studio-bottombar] [data-estimate-total]');
    return el ? Number(el.getAttribute('data-estimate-total')) : null;
  });
const chainOf = (page) => page.evaluate(() => document.querySelector('[data-room-chain]')?.getAttribute('data-room-chain') ?? null);

/** План как нарисован: внутренние грани стен и полосы модулей — миллиметры листа (уже повёрнутые). */
const planGeometry = (page) =>
  page.evaluate(() => {
    /* План рабочей области — не план предпросмотра в панели. */
    const svg = document.querySelector('[data-studio-viewport] [data-room-plan]');
    if (!svg) return null;
    const walls = {};
    for (const g of svg.querySelectorAll('[data-plan-wall]')) {
      const line = g.querySelector('line:not([data-plan-hit])');
      if (!line) continue;
      walls[g.getAttribute('data-plan-wall')] = {
        a: { x: Number(line.getAttribute('x1')), y: Number(line.getAttribute('y1')) },
        b: { x: Number(line.getAttribute('x2')), y: Number(line.getAttribute('y2')) },
        name: svg.querySelector(`[data-plan-wall-name="${g.getAttribute('data-plan-wall')}"]`)?.textContent ?? null,
      };
    }
    const modules = {};
    for (const p of svg.querySelectorAll('polygon[data-plan-module]')) {
      modules[p.getAttribute('data-plan-module')] = p
        .getAttribute('points')
        .trim()
        .split(/\s+/)
        .map((pair) => {
          const [x, y] = pair.split(',').map(Number);
          return { x, y };
        });
    }
    return { walls, modules };
  });

/** Сцена как нарисована: внутренние грани стен комнаты и габариты модулей на полу, мм (x, z). */
const sceneGeometry = (page) =>
  page.evaluate(() => {
    const room = window.__mwCadRoom?.();
    const modules = window.__mwCadModules?.();
    if (!room || !modules) return null;
    const walls = {};
    for (const line of room.lines ?? []) {
      walls[line.id] = {
        a: { x: line.start[0], y: line.start[1] },
        b: { x: line.start[0] + line.dir[0] * line.lengthMm, y: line.start[1] + line.dir[1] * line.lengthMm },
      };
    }
    return { walls, boxes: modules.boxes ?? {}, intersects: room.intersects };
  });

const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) < 2;
/** Угол двух стен и их дальние концы. */
function cornerOf(walls, idA, idB) {
  const A = walls[idA];
  const B = walls[idB];
  if (!A || !B) return null;
  for (const pa of [A.a, A.b]) {
    for (const pb of [B.a, B.b]) {
      if (near(pa, pb)) return { corner: pa, far: near(A.a, pa) ? A.b : A.a, farB: near(B.a, pb) ? B.b : B.a };
    }
  }
  return null;
}
const sign = (c) => {
  const ux = c.corner.x - c.far.x;
  const uy = c.corner.y - c.far.y;
  const vx = c.farB.x - c.corner.x;
  const vy = c.farB.y - c.corner.y;
  return ux * vy - uy * vx > 0 ? 1 : -1;
};
function along(corner, far, p) {
  const len = Math.hypot(far.x - corner.x, far.y - corner.y);
  return ((p.x - corner.x) * (far.x - corner.x) + (p.y - corner.y) * (far.y - corner.y)) / len;
}
/**
 * МОДУЛИ ОТ УГЛА: НА ПЛАНЕ И В 3D — те же мм. У каждого модуля стен угла отрезок вдоль его стены от угла:
 * на плане — по полосе `RoomPlan`, в 3D — по габариту экземпляров пачек. Сторона — один знак угла.
 */
function compare(plan, scene, idA, idB) {
  const pc = cornerOf(plan.walls, idA, idB);
  const wc = cornerOf(scene.walls, idA, idB);
  if (!pc || !wc) return { ok: false, words: `угла ${idA}–${idB} нет: план ${Boolean(pc)}, 3D ${Boolean(wc)}`, checked: 0, planSign: 0, sceneSign: 0 };
  const bad = [];
  let checked = 0;
  for (const [id, poly] of Object.entries(plan.modules)) {
    const box = scene.boxes[id];
    if (!box) continue;
    const onA = id.endsWith(`@${idA}`);
    const onB = id.endsWith(`@${idB}`);
    if (!onA && !onB) continue;
    const pFar = onA ? pc.far : pc.farB;
    const wFar = onA ? wc.far : wc.farB;
    const tp = [along(pc.corner, pFar, poly[0]), along(pc.corner, pFar, poly[1])].sort((a, b) => a - b);
    const corners = [
      { x: box.min[0], y: box.min[1] },
      { x: box.max[0], y: box.min[1] },
      { x: box.min[0], y: box.max[1] },
      { x: box.max[0], y: box.max[1] },
    ].map((p) => along(wc.corner, wFar, p));
    const tw = [Math.min(...corners), Math.max(...corners)];
    checked += 1;
    /* Ручки и фасад выступают в глубину, а не вдоль стены: 3 мм — зазор фасада и округление листа. */
    if (Math.abs(tp[0] - tw[0]) > 3 || Math.abs(tp[1] - tw[1]) > 3) bad.push(`${id}: план ${Math.round(tp[0])}…${Math.round(tp[1])}, 3D ${Math.round(tw[0])}…${Math.round(tw[1])}`);
  }
  const planSign = sign(pc);
  const sceneSign = sign(wc);
  if (checked === 0 && process.env.M2_DEBUG) {
    console.log('    план:', Object.keys(plan.modules).slice(0, 6).join(', '), '· 3D:', Object.keys(scene.boxes).slice(0, 6).join(', '));
  }
  return {
    ok: bad.length === 0 && checked > 0 && planSign === sceneSign,
    words: `модулей ${checked}, сторона план ${planSign > 0 ? '+' : '−'} 3D ${sceneSign > 0 ? '+' : '−'}${bad.length ? ` · НЕ ТАК ${bad.length}: ${bad.slice(0, 3).join('; ')}` : ''}`,
    checked,
    planSign,
    sceneSign,
  };
}

/** Плитка Г на экране: по углу и дальним концам (ось Y вниз) — как символ плитки. */
const ARMS = {
  '└': (c, a, b) => a.x > c.x + 1 && Math.abs(a.y - c.y) < 2 && b.y < c.y - 1 && Math.abs(b.x - c.x) < 2,
  '┘': (c, a, b) => a.y < c.y - 1 && Math.abs(a.x - c.x) < 2 && b.x < c.x - 1 && Math.abs(b.y - c.y) < 2,
  '┌': (c, a, b) => a.y > c.y + 1 && Math.abs(a.x - c.x) < 2 && b.x > c.x + 1 && Math.abs(b.y - c.y) < 2,
  '┐': (c, a, b) => a.x < c.x - 1 && Math.abs(a.y - c.y) < 2 && b.y > c.y + 1 && Math.abs(b.x - c.x) < 2,
};
const L_ROTATION = { '└': 180, '┘': 90, '┌': 270, '┐': 0 };

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
    const email = `m2-${stamp}@example.test`;
    const password = `Pw-${stamp}-m2!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    made.users.push(data.user.id);
    const { data: org, error: orgError } = await service.from('orgs').insert({ slug: `m2-${stamp}`, name: `Проверка Measurement 2.0 ${label}` }).select('id').single();
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
          address: `Measurement 2.0 ${label}: ${fx.title}`,
          zone: fx.zone,
          measurements: fx.measurement,
          millwork: {
            survey: fx.survey,
            templateId: fx.templateId,
            requirements: fx.requirements,
            selectedVariant: 'optimal',
            shape: fx.shape,
            ...(fx.corners ? { corners: fx.corners } : {}),
            ...(fx.runs ? { runs: fx.runs } : {}),
            ...(fx.wallRuns ? { wallRuns: fx.wallRuns } : {}),
            ...(fx.production ? { production: fx.production } : {}),
          },
        })
        .select('id')
        .single();
      if (projectError) throw new Error(`insert project: ${projectError.message}`);
      made.projects.push(row.id);
      return row.id;
    };
    await body({ page, errors, project, service, orgId: org.id });
    check(`${label}: ошибок страницы нет`, errors.length === 0, errors.slice(0, 3).join(' | '));
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

/** Сохранённый объект из базы, служебным ключом — дождаться записи автосохранения. */
async function savedMillwork(service, projectId, test, ms = 30_000) {
  const until = Date.now() + ms;
  let value = null;
  while (Date.now() < until) {
    const { data } = await service.from('projects').select('millwork').eq('id', projectId).single();
    value = data?.millwork ?? null;
    if (value && test(value)) return value;
    await sleep(700);
  }
  return value;
}

/** Предпросмотр → «Применить», с проверкой, что он показан. */
async function applyPreview(page, label) {
  await page.waitForSelector('[data-room-preview]', { timeout: 20_000 });
  const lines = await page.evaluate(() => Array.from(document.querySelectorAll('[data-room-preview-lines] li')).map((li) => li.textContent?.trim() ?? ''));
  await click(page, '[data-room-apply]', `${label}: «Применить»`);
  await waitFor(page, () => !document.querySelector('[data-room-preview]'), Boolean, 20_000);
  await sleep(900);
  return lines;
}

/* ═════════════════════════  TILES  ═════════════════════════ */

async function partTiles(browser) {
  console.log('\n── TILES (1440 × 900): Г 2360 + 2540 в четырёх положениях — план, предпросмотр, 3D');
  const fx = fixture('L');
  await withOrg('tiles', browser, async ({ page, project }) => {
    const id = await project(fx);
    await openStudio(page, id);
    await ensureTool(page, 'measure');
    await view(page, 'plan');
    await page.waitForSelector('[data-studio-context="measure"] [data-room-shape]', { timeout: 30_000 }).catch(() => undefined);
    must('панель формы комнаты в «Замере»', (await page.locator('[data-studio-context="measure"] [data-room-shape]').count()) === 1, 'НУЛЕВОЙ СЕЛЕКТОР: [data-room-shape]');
    check('стены под мебелью до правки — 1, 2 (А, Б)', (await chainOf(page)) === fx.expect.chain, `цепочка ${await chainOf(page)}`);
    const totals = [];
    for (const glyph of ['└', '┘', '┌', '┐']) {
      const rotation = L_ROTATION[glyph];
      await click(page, `[data-room-tile="L${rotation}"]`, `плитка Г ${glyph}`);
      const prefilled = await page.evaluate(() => ({
        a: document.querySelector('[data-room-length="А"]')?.value ?? null,
        b: document.querySelector('[data-room-length="Б"]')?.value ?? null,
      }));
      check(`Г ${glyph}: поля «Стена А» и «Стена Б» с длинами замера`, prefilled.a === '2360' && prefilled.b === '2540', JSON.stringify(prefilled));
      await click(page, '[data-room-tile-preview]', `Г ${glyph}: «Показать, что получится»`);
      const lines = await applyPreview(page, `Г ${glyph}`);
      await view(page, 'plan');
      const plan = await planGeometry(page);
      const c = plan ? cornerOf(plan.walls, 'w1', 'w2') : null;
      const looks = c ? ARMS[glyph](c.corner, c.far, c.farB) : false;
      check(
        `Г ${glyph}: план повёрнут как плитка, стена А — «Стена А» у угла, Б — «Стена Б»; стены под мебелью 1, 2`,
        looks && plan.walls.w1?.name === 'Стена А' && plan.walls.w2?.name === 'Стена Б' && (await chainOf(page)) === 'w1,w2',
        `угол ${c ? `${Math.round(c.corner.x)},${Math.round(c.corner.y)}` : 'нет'} · имена ${plan?.walls.w1?.name}/${plan?.walls.w2?.name} · предпросмотр: ${lines.slice(0, 2).join(' | ')}`,
      );
      await shot(page, `tile-${rotation}-plan.png`);
      await view(page, '3d');
      const scene = await sceneGeometry(page);
      const result = compare(plan, scene, 'w1', 'w2');
      check(`Г ${glyph}: 3D — та же кухня: сторона одна, модули от угла на плане = в 3D, в стены мебель не входит`, result.ok && scene.intersects === 0, `${result.words} · пересечений со стенами ${scene.intersects}`);
      await shot(page, `tile-${rotation}-3d.png`);
      totals.push(await total(page));
      await view(page, 'plan');
    }
    check('четыре положения Г — одна кухня: итог тот же', new Set(totals).size === 1 && totals[0] > 0, totals.join(' · '));
  }, { viewport: { width: 1440, height: 900 } });
}

/* ═════════════════════════  MIRROR  ═════════════════════════ */

async function partMirror(browser) {
  console.log('\n── MIRROR (1440 × 900): «Отразить комнату» — предпросмотр, сторона, отмена, запись');
  const fx = fixture('L');
  await withOrg('mirror', browser, async ({ page, project, service }) => {
    const id = await project(fx);
    await openStudio(page, id);
    await ensureTool(page, 'measure');
    await view(page, 'plan');
    const before = await total(page);
    await shot(page, 'mirror-before-plan.png');
    await click(page, '[data-room-action="mirror"]', '«Отразить комнату»');
    const lines = await applyPreview(page, 'отражение');
    check(
      'предпросмотр отражения: стены под мебелью названы до и после, итог до → после',
      lines.some((line) => /Стены под мебелью: стена 1 \(А\) → стена 2 \(Б\) станут стена 2 \(А\) → стена 1 \(Б\)/.test(line)) && lines.some((line) => /^Итог:/.test(line)),
      lines.join(' | '),
    );
    await view(page, 'plan');
    check('после отражения стены под мебелью — 2, 1 (А — стена 2)', (await chainOf(page)) === 'w2,w1', `цепочка ${await chainOf(page)}`);
    const plan = await planGeometry(page);
    await shot(page, 'mirror-after-plan.png');
    await view(page, '3d');
    const scene = await sceneGeometry(page);
    const result = compare(plan, scene, 'w2', 'w1');
    check('после отражения: сторона кухни на плане и в 3D одна, модули от угла те же мм', result.ok, result.words);
    await shot(page, 'mirror-after-3d.png');
    const after = await total(page);
    check('итог после отражения — число на экране (готовое решение пересобрано по отражённой комнате)', after > 0, `${before} → ${after}`);
    await ensureTool(page, 'measure');
    await click(page, '[data-room-undo]', '«Отменить: Отразить комнату»');
    await view(page, 'plan');
    check('«Отменить» — стены под мебелью снова 1, 2, итог прежний', (await chainOf(page)) === 'w1,w2' && (await total(page)) === before, `цепочка ${await chainOf(page)}, итог ${await total(page)}`);
    await click(page, '[data-room-redo]', '«Вернуть: Отразить комнату»');
    check('«Вернуть» — снова 2, 1', (await chainOf(page)) === 'w2,w1', `цепочка ${await chainOf(page)}`);
    const saved = await savedMillwork(service, id, (m) => m.survey?.version === 2 && m.survey?.walls?.[0]?.turn === 'left');
    check(
      'в базе: замер 2.0, поворот после стены 1 — налево, «ряд здесь» на стене 2',
      saved?.survey?.version === 2 && saved?.survey?.walls?.[0]?.turn === 'left' && saved?.survey?.walls?.find((w) => w.isRunWall)?.id === 'w2',
      JSON.stringify(saved?.survey?.walls?.map((w) => [w.id, w.turn, w.isRunWall]) ?? null),
    );
    await openStudio(page, id);
    await ensureTool(page, 'measure');
    await view(page, 'plan');
    check('после перезагрузки — та же кухня (2, 1) и тот же итог', (await chainOf(page)) === 'w2,w1' && (await total(page)) === after, `цепочка ${await chainOf(page)}, итог ${await total(page)}`);
  }, { viewport: { width: 1440, height: 900 } });
}

/* ═════════════════════════  U  ═════════════════════════ */

async function partU(browser) {
  console.log('\n── U (1440 × 900): П и её зеркало, плитка ⊓');
  const fx = fixture('U');
  await withOrg('u', browser, async ({ page, project }) => {
    const id = await project(fx);
    await openStudio(page, id);
    await ensureTool(page, 'measure');
    await view(page, 'plan');
    check('П: стены под мебелью 1, 2, 3', (await chainOf(page)) === 'w1,w2,w3', `цепочка ${await chainOf(page)}`);
    let plan = await planGeometry(page);
    await shot(page, 'u-plan.png');
    await view(page, '3d');
    let scene = await sceneGeometry(page);
    const ab = compare(plan, scene, 'w1', 'w2');
    const bc = compare(plan, scene, 'w2', 'w3');
    check('П ⊐: у обоих углов сторона на плане и в 3D одна, модули от угла те же', ab.ok && bc.ok, `${ab.words} | ${bc.words}`);
    await shot(page, 'u-3d.png');
    await ensureTool(page, 'measure');
    await view(page, 'plan');
    await click(page, '[data-room-action="mirror"]', '«Отразить комнату»');
    await applyPreview(page, 'отражение П');
    check('П в зеркале: стены под мебелью 3, 2, 1', (await chainOf(page)) === 'w3,w2,w1', `цепочка ${await chainOf(page)}`);
    plan = await planGeometry(page);
    await shot(page, 'u-mirror-plan.png');
    await view(page, '3d');
    scene = await sceneGeometry(page);
    const cb = compare(plan, scene, 'w3', 'w2');
    const ba = compare(plan, scene, 'w2', 'w1');
    /* Зеркало — тот же обход «стена 1 → стена 2» поворачивает в другую сторону. */
    const was12 = ab.planSign;
    const now12 = sign(cornerOf(plan.walls, 'w1', 'w2'));
    check(
      'П ⊏: у обоих углов сторона на плане и в 3D одна; обход «стена 1 → 2» поворачивает в другую сторону, чем до отражения',
      cb.ok && ba.ok && now12 === -was12,
      `${cb.words} | ${ba.words} · знак угла 1–2: ${was12} → ${now12}`,
    );
    await shot(page, 'u-mirror-3d.png');
    await ensureTool(page, 'measure');
    await view(page, 'plan');
    await click(page, '[data-room-undo]', '«Отменить» отражение П');
    await click(page, '[data-room-tile="U270"]', 'плитка П ⊓');
    await click(page, '[data-room-tile-preview]', 'П ⊓: «Показать, что получится»');
    await applyPreview(page, 'П ⊓');
    await view(page, 'plan');
    plan = await planGeometry(page);
    const c12 = cornerOf(plan.walls, 'w1', 'w2');
    const c23 = cornerOf(plan.walls, 'w2', 'w3');
    /* ⊓: стена Б наверху, стены А и В уходят вниз. */
    const looks = c12 && c23 && Math.abs(c12.corner.y - c23.corner.y) < 2 && c12.far.y > c12.corner.y + 1 && c23.farB.y > c23.corner.y + 1;
    check('П ⊓: план повёрнут (Б наверху, А и В вниз), стены под мебелью прежние', Boolean(looks) && (await chainOf(page)) === 'w1,w2,w3', `цепочка ${await chainOf(page)}`);
    await shot(page, 'u-tile-270-plan.png');
  }, { viewport: { width: 1440, height: 900 } });
}

/* ═════════════════════════  TURNS  ═════════════════════════ */

async function partTurns(browser) {
  console.log('\n── TURNS (1440 × 900): обход в другую сторону, начало обхода, поворот, стена — предпросмотр');
  const fx = fixture('perimeter');
  await withOrg('turns', browser, async ({ page, project }) => {
    const id = await project(fx);
    await openStudio(page, id);
    await ensureTool(page, 'measure');
    await view(page, 'plan');
    const before = await total(page);
    const chain = await chainOf(page);
    await click(page, '[data-room-action="reverse"]', '«Обойти в другую сторону»');
    await applyPreview(page, 'обход наоборот');
    const walk = await page.evaluate(() => document.querySelector('[data-room-walk]')?.getAttribute('data-room-walk'));
    check('обход в другую сторону — та же кухня на тех же стенах, итог тот же', (await chainOf(page)) === chain && (await total(page)) === before, `цепочка ${chain} → ${await chainOf(page)}, итог ${before} → ${await total(page)}, обход по часовой ${walk}`);
    await click(page, '[data-room-start="w3"]', '«Начать обход со стены …»');
    await applyPreview(page, 'начало обхода');
    check('начало обхода с другой стены — та же кухня, итог тот же', (await chainOf(page)) === chain && (await total(page)) === before, `цепочка ${await chainOf(page)}, итог ${await total(page)}`);
    /* После «обойти наоборот» поворот стены 1 уже налево: жмём другой — тот, что не нажат. */
    const turnTo = (await page.locator('[data-room-turn="w1:left"]').getAttribute('aria-pressed')) === 'true' ? 'right' : 'left';
    await click(page, `[data-room-turn="w1:${turnTo}"]`, `поворот после стены 1 — ${turnTo === 'left' ? 'налево' : 'направо'}`);
    await page.waitForSelector('[data-room-preview]', { timeout: 20_000 });
    const lines = await page.evaluate(() => Array.from(document.querySelectorAll('[data-room-preview-lines] li')).map((li) => li.textContent?.trim() ?? ''));
    check('смена поворота — предпросмотр говорит, что получится (итог или отказ словами)', lines.length >= 1 && lines.some((line) => /Итог:/.test(line)), lines.join(' | '));
    await click(page, '[data-room-cancel]', '«Отмена»');
    check('отмена — замер прежний', (await chainOf(page)) === chain && (await total(page)) === before, `цепочка ${await chainOf(page)}`);
    await click(page, '[data-room-remove="w4"]', '«удалить» стену 4');
    await page.waitForSelector('[data-room-preview]', { timeout: 20_000 });
    await shot(page, 'turns-remove-preview.png');
    await click(page, '[data-room-cancel]', '«Отмена» удаления');
    await click(page, '[data-room-add-after="w2"]', '«+ стена после» стены 2');
    await page.waitForSelector('[data-room-preview]', { timeout: 20_000 });
    await click(page, '[data-room-cancel]', '«Отмена» новой стены');
    check('после отмен — те же стены и итог', (await chainOf(page)) === chain && (await total(page)) === before, `итог ${await total(page)}`);
  }, { viewport: { width: 1440, height: 900 } });
}

/* ═════════════════════════  LEGACY  ═════════════════════════ */

async function partLegacy(browser) {
  console.log('\n── LEGACY (1440 × 900): прежний замер налево — назван, перестроен по замеру с предпросмотром');
  const fx = fixture('legacy');
  const moduleId = fixture('legacyModule');
  await withOrg('legacy', browser, async ({ page, project, service }) => {
    const id = await project(fx);
    await openStudio(page, id);
    await ensureTool(page, 'measure');
    await view(page, 'plan');
    await page.waitForSelector('[data-room-legacy]', { timeout: 30_000 }).catch(() => undefined);
    const named = (await page.locator('[data-room-legacy="mirrored"]').count()) === 1;
    check('расхождение названо: «Мебель стоит зеркально к замеру»', named, named ? '' : 'НУЛЕВОЙ СЕЛЕКТОР: [data-room-legacy]');
    let plan = await planGeometry(page);
    await shot(page, 'legacy-before-plan.png');
    await view(page, '3d');
    let scene = await sceneGeometry(page);
    const pc = cornerOf(plan.walls, 'w1', 'w2');
    const wc = cornerOf(scene.walls, 'w1', 'w2');
    check('до перестройки: план и 3D разной стороны (так и было)', Boolean(pc && wc) && sign(pc) !== sign(wc), `план ${pc ? sign(pc) : '—'} 3D ${wc ? sign(wc) : '—'}`);
    const box = scene.boxes[moduleId];
    const fromCorner = (b, c, far) =>
      [
        { x: b.min[0], y: b.min[1] },
        { x: b.max[0], y: b.max[1] },
      ]
        .map((p) => Math.round(along(c.corner, far, p)))
        .sort((x, y) => x - y);
    const was = box && wc ? fromCorner(box, wc, wc.far) : null;
    await shot(page, 'legacy-before-3d.png');
    const before = await total(page);
    await ensureTool(page, 'measure');
    await view(page, 'plan');
    await click(page, '[data-room-convert]', '«Перестроить по замеру…»');
    const lines = await applyPreview(page, 'перестройка');
    check('предпросмотр перестройки: стены под мебелью и правка названы', lines.some((l) => /Стены под мебелью/.test(l)) && lines.some((l) => /Правленых рядов: 1/.test(l)), lines.join(' | '));
    const gone = (await page.locator('[data-room-legacy]').count()) === 0;
    check('расхождения больше нет', gone, gone ? '' : 'полоса осталась');
    plan = await planGeometry(page);
    await shot(page, 'legacy-after-plan.png');
    await view(page, '3d');
    scene = await sceneGeometry(page);
    const pc2 = cornerOf(plan.walls, 'w2', 'w1');
    const wc2 = cornerOf(scene.walls, 'w2', 'w1');
    const now = scene.boxes[moduleId] && wc2 ? fromCorner(scene.boxes[moduleId], wc2, wc2.farB) : null;
    check(
      'после: сторона на плане и в 3D одна, модуль на стене 1 в тех же мм от угла, итог тот же',
      Boolean(pc2 && wc2) && sign(pc2) === sign(wc2) && JSON.stringify(now) === JSON.stringify(was) && (await total(page)) === before,
      `сторона план ${pc2 ? sign(pc2) : '—'} 3D ${wc2 ? sign(wc2) : '—'} · модуль от угла ${JSON.stringify(was)} → ${JSON.stringify(now)} · итог ${before} → ${await total(page)}`,
    );
    await shot(page, 'legacy-after-3d.png');
    const saved = await savedMillwork(service, id, (m) => m.survey?.version === 2);
    check(
      'в базе: замер 2.0, правка на стене 1 (стена Б), у стены А правки нет',
      saved?.survey?.version === 2 && Boolean(saved?.wallRuns?.w1) && !saved?.runs?.optimal,
      JSON.stringify({ version: saved?.survey?.version, wallRuns: Object.keys(saved?.wallRuns ?? {}), runs: Object.keys(saved?.runs ?? {}) }),
    );
  }, { viewport: { width: 1440, height: 900 } });
}

/* ═════════════════════════  WIZARD  ═════════════════════════ */

async function partWizard(browser) {
  console.log('\n── WIZARD (1440 × 900): шаг «Замер» → «Стены»: форма комнаты, новая стена, удаление');
  const fx = fixture('L');
  await withOrg('wizard', browser, async ({ page, project }) => {
    const id = await project(fx);
    await page.goto(`${BASE}/project/${id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('[data-survey-step]', { timeout: 60_000 });
    await sleep(800);
    /* Объект без «Замер завершён» открывается на замере; шаг «Стены по кругу» — своей кнопкой. */
    const wallsStep = page.locator('button', { hasText: 'Стены по кругу' });
    must('шаг «Стены по кругу» в замере мастера', (await wallsStep.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: кнопка «Стены по кругу»');
    await wallsStep.first().click();
    await page.waitForSelector('[data-survey-step="walls"]', { timeout: 30_000 });
    /* Панель формы грузится по требованию (не в первой загрузке мастера). */
    await page.waitForSelector('[data-survey-step="walls"] [data-room-shape]', { timeout: 30_000 }).catch(() => undefined);
    must('панель формы комнаты над стенами мастера', (await page.locator('[data-survey-step="walls"] [data-room-shape]').count()) === 1, 'НУЛЕВОЙ СЕЛЕКТОР: [data-room-shape] в шаге «Стены»');
    await shot(page, 'wizard-walls.png');
    await click(page, '[data-survey-step="walls"] button:has-text("+ Стена")', '«+ Стена»');
    const ids = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-survey-step="walls"] .mw-label')).map((el) => el.textContent?.trim()),
    );
    check('«+ Стена» — третья стена', ids.filter((t) => /^Стена \d+$/.test(t ?? '')).length === 3, ids.join(', '));
    await click(page, '[data-survey-step="walls"] [aria-label="Удалить стену 1"]', '«×» у стены 1');
    const words = await page.evaluate(() => document.querySelector('[data-survey-remove]')?.textContent ?? null);
    check('удаление показывает, что пропадёт, до нажатия', Boolean(words && /Удалить стену 1\?/.test(words)), words ?? 'нет');
    await shot(page, 'wizard-remove.png');
  }, { viewport: { width: 1440, height: 900 } });
}

/* ═════════════════════════  TABLET  ═════════════════════════ */

async function partTablet(browser) {
  console.log('\n── TABLET (1024 × 768, касание): плитки и предпросмотр');
  const fx = fixture('L');
  await withOrg('tablet', browser, async ({ page, project }) => {
    const id = await project(fx);
    await openStudio(page, id);
    await ensureTool(page, 'measure');
    await view(page, 'plan');
    const tile = page.locator('[data-room-tile="L90"]');
    must('плитка Г ┘ на планшете', (await tile.count()) === 1, 'НУЛЕВОЙ СЕЛЕКТОР: [data-room-tile="L90"]');
    await tile.scrollIntoViewIfNeeded();
    await tile.tap();
    await sleep(400);
    const preview = page.locator('[data-room-tile-preview]');
    await preview.scrollIntoViewIfNeeded();
    await preview.tap();
    await page.waitForSelector('[data-room-preview]', { timeout: 20_000 });
    const apply = page.locator('[data-room-apply]');
    await apply.scrollIntoViewIfNeeded();
    const box = await apply.boundingBox();
    check('«Применить» на планшете — кнопка не меньше 36 px', Boolean(box && box.height >= 36), JSON.stringify(box));
    await apply.tap();
    await sleep(900);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('прокрутки по ширине нет', scroll <= 1, `${scroll} px`);
    await shot(page, 'tablet.png');
  }, { viewport: { width: 1024, height: 768 }, touch: true });
}

/* ═════════════════════════  ЭТАЛОННЫЕ КУХНИ  ═════════════════════════ */

/** Позиции каталога организации по артикулу — после загрузки тех же коллекций, что у кухонь. */
async function materialIds(page, service, orgId) {
  const imported = await page.request.post(`${BASE}/api/catalog/materials`, {
    data: { orgId, collections: fixture('materialCollections'), confirm: true },
    timeout: 180_000,
  });
  must('коллекции RAL Design и EGGER загружены в организацию', imported.ok(), `${imported.status()} ${(await imported.text()).slice(0, 200)}`);
  const articles = fixture('materialArticles');
  const { data, error } = await service.from('catalog_items').select('id, article').eq('org_id', orgId).in('article', articles);
  must('позиции кухонь — в каталоге организации', !error && (data ?? []).length === articles.length, error?.message ?? `найдено ${(data ?? []).length} из ${articles.length}`);
  return Object.fromEntries(data.map((row) => [row.article, row.id]));
}
/** Метки `@MAT:<артикул>` → идентификаторы позиций организации. */
function withIds(value, ids) {
  const prefix = fixture('materialPrefix');
  let text = JSON.stringify(value);
  for (const [article, id] of Object.entries(ids)) text = text.split(JSON.stringify(`${prefix}${article}`)).join(JSON.stringify(id));
  must('у кухни не осталось меток позиций', !text.includes(prefix), text.match(/@MAT:[^"]+/)?.[0] ?? '');
  return JSON.parse(text);
}
const sceneModules = (page) => page.evaluate(() => window.__mwCadModules?.()?.boxes ?? null);
/** Каждый модуль движка — в сцене на том же месте пола и на тех же отметках; лишних нет. */
function modulesMatch(expect, boxes) {
  const want = Object.keys(expect).sort();
  const got = Object.keys(boxes ?? {}).sort();
  const bad = [];
  for (const id of want) {
    const b = boxes?.[id];
    const e = expect[id];
    if (!b) {
      bad.push(`${id}: нет в сцене`);
      continue;
    }
    const d = Math.max(...[0, 1].flatMap((k) => [Math.abs(b.min[k] - e.min[k]), Math.abs(b.max[k] - e.max[k])]));
    if (d > 1 || b.y?.[0] !== e.y[0] || b.y?.[1] !== e.y[1]) bad.push(`${id}: сцена ${b.min}…${b.max} y ${b.y}, движок ${e.min}…${e.max} y ${e.y}`);
  }
  const extra = got.filter((id) => !expect[id]);
  return {
    ok: want.length > 0 && bad.length === 0 && extra.length === 0,
    words: `модулей в сцене ${got.length} при ${want.length} у движка${extra.length ? ` · лишние: ${extra.slice(0, 3).join(', ')}` : ''}${bad.length ? ` · НЕ ТАК ${bad.length}: ${bad.slice(0, 3).join('; ')}` : ''}`,
  };
}
/** Линейный цвет материала three → sRGB `#rrggbb`. */
const toHex = (lin) =>
  `#${lin
    .map((c) => {
      const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, s)) * 255).toString(16).padStart(2, '0');
    })
    .join('')}`;
const nearHex = (a, b) => [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 3);
/** Закрытые фасады по материалу: однотон — по цвету пачки, древесный декор — пачки с картой рисунка. */
function frontsMatch(expect, packs, woodArticle) {
  const prefix = fixture('materialPrefix');
  const want = {};
  let wantWood = 0;
  for (const f of Object.values(expect)) {
    if (f.itemId === `${prefix}${woodArticle}`) wantWood += f.count;
    else want[f.hex] = (want[f.hex] ?? 0) + f.count;
  }
  const got = {};
  let gotWood = 0;
  const strange = [];
  for (const pack of packs ?? []) {
    if (pack.map) {
      gotWood += pack.count;
      continue;
    }
    const hex = toHex(pack.color);
    const key = Object.keys(want).find((h) => nearHex(h, hex));
    if (!key) strange.push(`${hex} × ${pack.count}`);
    else got[key] = (got[key] ?? 0) + pack.count;
  }
  const ok = strange.length === 0 && gotWood === wantWood && Object.keys(want).every((h) => got[h] === want[h]);
  return {
    ok,
    words:
      Object.keys(want).map((h) => `${h} ${got[h] ?? 0} из ${want[h]}`).join(', ') +
      (wantWood || gotWood ? ` · древесный декор ${gotWood} из ${wantWood}` : '') +
      (strange.length ? ` · чужие цвета: ${strange.slice(0, 3).join(', ')}` : ''),
  };
}
/** Строки деталировки антресолей: боковины и фальш-панели угла — по движку. */
function panelsMatch(expect, rows) {
  const bad = [];
  for (const e of expect) {
    const found = rows.filter((r) => r.name === e.name && (e.name === 'Боковина' ? r.moduleId === e.moduleId : r.wall === e.wall));
    if (!found.some((r) => r.size === e.size && r.qty === e.qty)) bad.push(`${e.moduleId} «${e.name}» ${e.size} × ${e.qty}: на экране ${found.map((r) => `${r.size} × ${r.qty}`).join(', ') || 'нет'}`);
  }
  return { ok: expect.length > 0 && bad.length === 0, words: `строк антресолей ${expect.length}${bad.length ? ` · НЕ ТАК ${bad.length}: ${bad.slice(0, 3).join('; ')}` : ''}` };
}

async function partKitchen(browser, key) {
  const all = fixture('kitchens');
  const fx = all[key];
  must(`кухня ${key} в фикстуре`, Boolean(fx), `НУЛЕВОЙ СЕЛЕКТОР: kitchens.${key}`);
  console.log(`\n── ${key.toUpperCase()} (1440 × 900): ${fx.title} — ${fx.photo}`);
  await withOrg(key, browser, async ({ page, project, service, orgId }) => {
    const ids = await materialIds(page, service, orgId);
    /* Метки позиций — только в записи объекта; ожидания фикстуры остаются с метками и сверяются через `named`. */
    const real = withIds({ ...fx.state, title: fx.title, zone: fx.zone, measurement: fx.measurement }, ids);
    const projectId = await project(real);
    await openStudio(page, projectId);
    await view(page, '3d');
    const first = fx.before ?? fx.expect;
    let boxes = await waitFor(page, () => window.__mwCadModules?.()?.boxes ?? null, (b) => modulesMatch(first.modules, b).ok, 30_000);
    let result = modulesMatch(first.modules, boxes);
    check(`${key}: в сцене каждый модуль движка — на том же месте пола и на тех же отметках${fx.alignWall ? ' (антресоль пока своей высоты)' : fx.ownerCard ? ' (антресоль пока ведёт стена А)' : ''}`, result.ok, result.words);
    const room = await page.evaluate(() => window.__mwCadRoom?.()?.intersects ?? null);
    check(`${key}: мебель не входит в стены комнаты`, room === 0, `пересечений ${room}`);
    /* Рисунок дерева считается в фоне (`woodPixels`): пачка получает карту не сразу — ждём, а не читаем первый кадр. */
    const fronts = await waitFor(page, () => window.__mwCadFronts?.() ?? null, (list) => frontsMatch(first.fronts, list, 'EGGER-H1145-ST10').ok, 30_000);
    const colors = frontsMatch(first.fronts, fronts, 'EGGER-H1145-ST10');
    check(`${key}: фасады в сцене — материалы кухни по движку (закрытые, пачками)`, colors.ok, colors.words);
    /*
     * Смета — когда доехал каталог организации. Фасады кухни — позиции RAL и
     * EGGER без цены: пока каталог читается (у организации ~2000 строк), экран
     * считает их общей строкой по ставке цеха. Первое прочтение пишется как
     * есть — это не проверка, а замер того, что видно до каталога.
     */
    const prefix = fixture('materialPrefix');
    const back = Object.entries(ids).map(([article, id]) => [id, `${prefix}${article}`]);
    const named = (k) => back.reduce((text, [id, label]) => text.split(id).join(label), k);
    const priceRead = () =>
      page.evaluate(() => ({
        status: document.querySelector('[data-studio-status]')?.getAttribute('data-studio-status') ?? null,
        reason: (document.querySelector('[data-studio-status]')?.textContent ?? '').trim(),
        total: Number(document.querySelector('[data-studio-bottombar] [data-estimate-total]')?.getAttribute('data-estimate-total') ?? NaN),
        unpriced: window.__mwEstimateLines ? window.__mwEstimateLines().filter((l) => l.priceUnset).map((l) => l.key) : null,
      }));
    const early = await priceRead();
    const t0 = Date.now();
    const want = [...first.unpriced].sort().join('|');
    let read = early;
    const until = Date.now() + 60_000;
    while ((read.unpriced ?? []).map(named).sort().join('|') !== want && Date.now() < until) {
      await sleep(500);
      read = await priceRead();
    }
    const got = (read.unpriced ?? []).map(named).sort();
    console.log(`   первое прочтение: «${early.status}», итог ${early.total}, без цены ${(early.unpriced ?? []).length} · каталог в смете через ${Date.now() - t0} мс: «${read.status}», итог ${read.total}`);
    check(
      `${key}: смета — с каталогом организации: фасады позиций без цены своими строками «цена не задана» (как у движка), итог ${first.total} ₸ — неполный, статус «Черновик» со словами о строках без цены`,
      got.join('|') === want && read.total === first.total && read.status === 'draft' && /без цены/.test(read.reason),
      `экран: без цены ${got.join(', ') || 'нет'} · итог ${read.total} · «${read.status}» ${read.reason.slice(0, 120)} · движок: ${want || 'нет'}, ${first.total}`,
    );
    await shot(page, `${key}-3d.png`);

    if (fx.ownerCard) {
      /* Кухня 2: «Соединить в углу» → «Антресоль: Стена Б идёт в угол» — карточкой панели угла. */
      await ensureTool(page, 'furniture');
      await click(page, '[data-corner-index="0"]', '«Соединить в углу»: Стена А — Стена Б');
      await page.waitForSelector('[data-corner-panel]', { timeout: 20_000 });
      const title = await page.evaluate(() => (document.querySelector('[data-corner-panel] h3')?.textContent ?? '').trim());
      check(`${key}: панель угла — «Соединить в углу: Стена А — Стена Б»`, /^Соединить в углу: Стена А — Стена Б/.test(title), title);
      const sel = `[data-corner-owner="${fx.ownerCard.key}"]`;
      const option = await waitFor(
        page,
        (s) => {
          const n = document.querySelector(s);
          return n
            ? {
                delta: n.getAttribute('data-delta'),
                refused: n.getAttribute('data-refused'),
                changes: [...n.querySelectorAll('[data-corner-owner-change]')].map((c) => (c.textContent ?? '').trim()),
                opening: n.querySelector('[data-corner-opening]')?.getAttribute('data-corner-opening') ?? null,
                openingWords: n.querySelector('[data-corner-opening]')?.textContent ?? null,
              }
            : null;
        },
        (v) => Boolean(v) && v.delta !== '',
        60_000,
        sel,
      );
      check(
        `${key}: карточка «Антресоль: Стена Б идёт в угол» до нажатия — что изменится (мм от угла) и открывание у угла, теми же словами, что у движка`,
        Boolean(option) && option.refused === '0' && JSON.stringify(option.changes) === JSON.stringify(fx.ownerCard.changes) && option.opening === 'ok',
        `экран: ${JSON.stringify(option?.changes ?? null)} · «${option?.openingWords ?? 'ОТКРЫВАНИЕ НЕ СКАЗАНО'}» · движок: ${JSON.stringify(fx.ownerCard.changes)}`,
      );
      await page.locator(sel).first().scrollIntoViewIfNeeded().catch(() => undefined);
      await shot(page, `${key}-join-card.png`);
      const total0 = await total(page);
      await page.locator(sel).first().click({ timeout: 15_000 });
      boxes = await waitFor(page, () => window.__mwCadModules?.()?.boxes ?? null, (b) => modulesMatch(fx.expect.modules, b).ok, 60_000);
      result = modulesMatch(fx.expect.modules, boxes);
      const delta = Number(option?.delta ?? NaN);
      const total1 = delta === 0 ? await total(page) : await waitFor(page, () => {
        const n = document.querySelector('[data-studio-bottombar] [data-estimate-total]');
        return n ? Number(n.getAttribute('data-estimate-total')) : null;
      }, (v) => v !== null && v !== total0, 30_000);
      check(
        `${key}: после нажатия антресоль ведёт стена Б — в сцене модули движка на своих местах и отметках, низ и верх не пересобраны; итог сдвинулся ровно на число с карточки и равен итогу движка`,
        result.ok && total0 !== null && total1 !== null && total1 - total0 === delta && total1 === fx.expect.total,
        `${result.words} · итог ${total0} → ${total1} при карточке ${option?.delta} · движок ${fx.expect.total}`,
      );
      const saved = await savedMillwork(service, projectId, (m) => (m.corners ?? []).some((c) => c.owners?.mezzanine === 'next'));
      check(
        `${key}: в базе — угол антресоли ведёт стена Б, антресоль на обеих стенах (правки стен не сняты)`,
        (saved?.corners ?? []).some((c) => c.owners?.mezzanine === 'next') && Boolean(saved?.runs?.optimal?.mezzanine) && Boolean(saved?.wallRuns?.w2?.mezzanine),
        JSON.stringify({ corners: saved?.corners ?? null, a: saved?.runs?.optimal?.mezzanine ?? null, b: saved?.wallRuns?.w2?.mezzanine ?? null }),
      );
      await shot(page, `${key}-owner-b-3d.png`);
    }

    if (fx.alignWall) {
      /* Кухня 3: «В линию с кладовкой над колонной» — кнопкой блока «Антресоль». */
      await ensureTool(page, 'furniture');
      const align = page.locator('[data-studio-context="furniture"] [data-mezzanine-align]');
      await align.first().waitFor({ timeout: 20_000 }).catch(() => undefined);
      must(`${key}: кнопка «В линию с кладовкой над колонной» в блоке «Антресоль»`, (await align.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-mezzanine-align]');
      check(`${key}: до нажатия режим выключен`, (await align.first().getAttribute('aria-pressed')) === 'false', await align.first().getAttribute('aria-pressed'));
      await align.first().scrollIntoViewIfNeeded().catch(() => undefined);
      await align.first().click({ timeout: 15_000 });
      boxes = await waitFor(page, () => window.__mwCadModules?.()?.boxes ?? null, (b) => modulesMatch(fx.expect.modules, b).ok, 30_000);
      result = modulesMatch(fx.expect.modules, boxes);
      const words = await page.evaluate(() => document.querySelector('[data-mezzanine-aligned]')?.textContent ?? null);
      const after = await waitFor(page, () => Number(document.querySelector('[data-studio-bottombar] [data-estimate-total]')?.getAttribute('data-estimate-total') ?? NaN), (v) => v === fx.expect.total, 15_000);
      check(
        `${key}: после «В линию…» антресоль на отметках кладовки над холодильником, верхний ряд до её низа — числом движка; слова блока называют отметки; итог — итог движка`,
        result.ok && Boolean(words && /2400…2700/.test(words)) && after === fx.expect.total,
        `${result.words} · «${words ?? 'СЛОВ НЕТ'}» · итог ${first.total} → ${after} при движке ${fx.expect.total}`,
      );
      const saved = await savedMillwork(service, projectId, (m) => Boolean(m.runs?.optimal?.mezzanine?.alignTall));
      check(`${key}: в базе — антресоль «в линию» (alignTall)`, Boolean(saved?.runs?.optimal?.mezzanine?.alignTall), JSON.stringify(saved?.runs?.optimal?.mezzanine ?? null));
      await view(page, '3d');
      await shot(page, `${key}-aligned-3d.png`);
    }

    await view(page, 'plan');
    await shot(page, `${key}-plan.png`);

    /* Деталировка: боковины антресолей и кладовок, фальш-панели угла антресоли — числом движка. */
    await ensureTool(page, 'documents');
    await click(page, '[data-studio-doc="panels"]', '«Деталировка»');
    const rows = await waitFor(
      page,
      () =>
        [...document.querySelectorAll('[data-panel-row]')].map((tr) => ({
          moduleId: tr.getAttribute('data-module-id'),
          wall: tr.getAttribute('data-wall-id'),
          name: (tr.children[1]?.textContent ?? '').trim(),
          size: tr.getAttribute('data-part-size'),
          qty: Number(tr.getAttribute('data-part-qty')),
        })),
      (list) => list.length > 0,
      30_000,
    );
    const panels = panelsMatch(fx.expect.panels, rows);
    check(`${key}: деталировка антресолей — те же детали и размеры, что у движка (= сцена, M2.30)`, panels.ok, panels.words);
    const mezzRow = page.locator(`[data-panel-row][data-module-id="${fx.expect.mezz[0]}"]`);
    if ((await mezzRow.count()) > 0) await mezzRow.first().scrollIntoViewIfNeeded().catch(() => undefined);
    await shot(page, `${key}-panels.png`);

    /* Запись и открытие: та же мебель (приёмка 25). */
    await sleep(2500);
    await openStudio(page, projectId);
    await view(page, '3d');
    boxes = await waitFor(page, () => window.__mwCadModules?.()?.boxes ?? null, (b) => modulesMatch(fx.expect.modules, b).ok, 30_000);
    result = modulesMatch(fx.expect.modules, boxes);
    check(`${key}: после перезагрузки — та же мебель на тех же местах и отметках`, result.ok, result.words);
  }, { viewport: { width: 1440, height: 900 } });
}

/* ═════════════════════════  GAP  ═════════════════════════ */

async function partGap(browser) {
  console.log('\n── GAP (1440 × 900): зазор до потолка — «Настройки цеха» → верх мебели «до потолка», «не подтверждено цехом»');
  const fx = fixture('gap');
  await withOrg('gap', browser, async ({ page, project, service, orgId }) => {
    const id = await project(fx);
    await openStudio(page, id);
    await view(page, '3d');
    const flat = await waitFor(page, () => Math.max(...Object.values(window.__mwCadModules?.()?.boxes ?? {}).map((b) => b.y?.[1] ?? -1)), (v) => v > 0, 30_000);
    check('без настройки цеха верх «до потолка» — 2700 при потолке 2700 (ноль, как было)', flat === fx.tops.flat, `верх ${flat}`);

    const admin = async () => {
      await page.goto(`${BASE}/admin/production`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForSelector('[data-ceiling-gap-mm]', { timeout: 60_000 });
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-ceiling-gap-mm]');
        return Boolean(el && Object.keys(el).some((k) => k.startsWith('__reactProps')));
      }, undefined, { timeout: 60_000 });
    };
    const save = async (label) => {
      await page.getByRole('button', { name: 'Сохранить', exact: true }).click({ timeout: 15_000 });
      const notice = await waitFor(page, () => document.body.textContent?.includes('Сохранено.') ?? false, Boolean, 30_000);
      must(`${label}: «Сохранено»`, notice, 'ответа «Сохранено.» нет');
    };
    const stored = async () => {
      const { data } = await service.from('orgs').select('production').eq('id', orgId).single();
      return data?.production?.ceilingGap ?? null;
    };

    await admin();
    await page.fill('[data-ceiling-gap-mm]', '30');
    const unconfirmed = await page.evaluate(() => document.querySelector('[data-ceiling-gap]')?.textContent ?? '');
    check('«Настройки цеха»: зазор 30 мм без галочки — «Не подтверждено цехом» на экране', /Не подтверждено цехом/.test(unconfirmed), unconfirmed.slice(0, 200));
    await shot(page, 'gap-admin.png');
    await save('зазор 30');
    const gap1 = await stored();
    check('в базе у цеха: зазор 30 мм, не подтверждён', gap1?.gapMm === 30 && gap1?.confirmed === false, JSON.stringify(gap1));

    await openStudio(page, id);
    await view(page, '3d');
    const gapped = await waitFor(page, () => Math.max(...Object.values(window.__mwCadModules?.()?.boxes ?? {}).map((b) => b.y?.[1] ?? -1)), (v) => v > 0 && v !== flat, 30_000);
    check('после настройки: верх всей мебели «до потолка» — 2670 (потолок 2700 минус зазор 30), как у движка', gapped === fx.tops.gapped, `верх ${gapped} при движке ${fx.tops.gapped}`);
    await ensureTool(page, 'furniture');
    const note = await waitFor(page, () => document.querySelector('[data-studio-context="furniture"] [data-ceiling-gap-note]')?.textContent ?? null, Boolean, 20_000);
    check('у ряда «до потолка» сказано: зазор 30 мм — не подтверждено цехом', Boolean(note && /30 мм/.test(note) && /не подтверждено цехом/.test(note)), note ?? 'СЛОВ НЕТ');
    await shot(page, 'gap-studio.png');

    await admin();
    await page.check('[data-ceiling-gap-confirmed]');
    await save('галочка цеха');
    const gap2 = await stored();
    check('в базе: зазор 30 мм подтверждён цехом', gap2?.gapMm === 30 && gap2?.confirmed === true, JSON.stringify(gap2));
    await openStudio(page, id);
    await view(page, '3d');
    const still = await waitFor(page, () => Math.max(...Object.values(window.__mwCadModules?.()?.boxes ?? {}).map((b) => b.y?.[1] ?? -1)), (v) => v > 0, 30_000);
    await ensureTool(page, 'furniture');
    await sleep(800);
    const noteAfter = await page.locator('[data-studio-context="furniture"] [data-ceiling-gap-note]').count();
    check('после галочки цеха — верх тот же 2670, пометки «не подтверждено цехом» нет', still === fx.tops.gapped && noteAfter === 0, `верх ${still} · пометок ${noteAfter}`);
  }, { viewport: { width: 1440, height: 900 } });
}

/* ═════════════════════════  FRIDGE  ═════════════════════════ */

async function partFridge(browser) {
  console.log('\n── FRIDGE (1440 × 900): свободная П — холодильник со стены А на Б, модуль стены В числом и вплотную к углу');
  const fx = fixture('freeU');
  const ids = fixture('freeUModules');
  await withOrg('fridge', browser, async ({ page, project, service }) => {
    const id = await project(fx);
    await openStudio(page, id);
    await view(page, 'plan');

    /*
     * Холодильник: стена А → стена Б. Сначала отметка в глухой части угла Б–В:
     * предпросмотр обязан сказать до нажатия то, что экран скажет после, —
     * «цены не будет» и почему (слова экрана, `wallMismatchMessage`). Потом
     * отметка без захода — итог до и после числом движка, и запись.
     */
    const tr = fixture('freeUTransfer');
    const previewOf = () =>
      page.evaluate(() => ({
        total: document.querySelector('[data-placement-transfer-result] li')?.textContent ?? null,
        blocked: [...document.querySelectorAll('[data-placement-transfer-blocked]')].map((li) => (li.textContent ?? '').trim()),
        refused: document.querySelector('[data-placement-transfer-refusal]')?.textContent ?? null,
        apply: Boolean(document.querySelector('[data-placement-transfer-apply]')),
      }));
    /* «Итог: 1 043 549 ₸ → …» — числа до и после (пробелы групп у `toLocaleString` неразрывные). */
    const sums = (text) => (text ?? '').split('→').map((part) => (/\d/.test(part) ? Number(part.replace(/\D/g, '')) : null));
    await selectOn(page, 'w1', ids.fridge);
    await click(page, '[data-placement-wall="1"]', 'перенос: «Стена Б»');
    await page.fill('[data-placement-target-from]', String(ids.starts.w2 + tr.blocked.atOnRow));
    await click(page, '[data-placement-transfer-preview]', 'перенос холодильника в глухую часть угла: «Показать, что получится»');
    const blockedView = await previewOf();
    const wantBlocked = tr.blocked.blocked.map((words) => `После переноса цены не будет: ${words}`);
    check(
      `перенос холодильника на ${ids.starts.w2 + tr.blocked.atOnRow} мм стены Б (глухая часть угла Б–В): до нажатия — «цены не будет» и почему, словами экрана (= движок)`,
      !blockedView.refused && JSON.stringify(blockedView.blocked) === JSON.stringify(wantBlocked) && /цены не будет/.test(blockedView.total ?? '') && sums(blockedView.total)[0] === tr.before,
      `экран: ${blockedView.total} · ${blockedView.blocked.join(' | ').slice(0, 300) || 'ЗАПРЕТА НЕ СКАЗАНО'} · движок: ${wantBlocked.join(' | ').slice(0, 200)}`,
    );
    await shot(page, 'fridge-b-blocked-preview.png');
    const target = ids.starts.w2 + tr.ok.atOnRow;
    await page.fill('[data-placement-target-from]', String(target));
    await click(page, '[data-placement-transfer-preview]', 'перенос холодильника: «Показать, что получится»');
    const okView = await previewOf();
    must('предпросмотр переноса холодильника — без отказа', !okView.refused, okView.refused ?? '');
    const [sumBefore, sumAfter] = sums(okView.total);
    check(
      `перенос на ${target} мм стены Б: запрета нет, итог до → после — числами движка`,
      okView.blocked.length === 0 && okView.apply && sumBefore === tr.before && sumAfter === tr.ok.total,
      `экран: ${okView.total} · запрет: ${okView.blocked.join(' | ') || 'нет'} · движок: ${tr.before} → ${tr.ok.total}`,
    );
    await click(page, '[data-placement-transfer-apply]', 'перенос холодильника: «Применить»');
    let now = await inspector(page);
    const status = await page.evaluate(() => document.querySelector('[data-studio-status]')?.getAttribute('data-studio-status') ?? null);
    check(
      `холодильник на стене Б, ${target} мм от её левого угла (${tr.ok.atOnRow} мм ряда), выбран там же; экран без блокирующих ошибок`,
      now?.wall === 'w2' && now?.offset === tr.ok.atOnRow && status !== null && status !== 'blocked',
      `${JSON.stringify(now)} · статус ${status}`,
    );
    let plan = await planGeometry(page);
    await shot(page, 'fridge-b-plan.png');
    await view(page, '3d');
    let scene = await sceneGeometry(page);
    const ab = compare(plan, scene, 'w1', 'w2');
    const bc = compare(plan, scene, 'w2', 'w3');
    check('холодильник на стене Б: на плане и в 3D там же от угла, фасадом в комнату (сторона одна у обоих углов)', ab.ok && bc.ok && Boolean(now?.id && scene.boxes[now.id]), `угол А–Б: ${ab.words} · угол Б–В: ${bc.words}`);
    check('мебель не входит в стены комнаты', scene.intersects === 0, `пересечений ${scene.intersects}`);
    await shot(page, 'fridge-b-3d.png');
    const saved = await savedMillwork(service, id, (m) => (m.wallRuns?.w2?.modules ?? []).some((u) => u.appliance === 'fridge'));
    check(
      `в базе: холодильник на стене Б (${tr.ok.atOnRow} мм ряда), со стены А снят`,
      (saved?.wallRuns?.w2?.modules ?? []).some((u) => u.appliance === 'fridge' && u.offsetMm === tr.ok.atOnRow) && !(saved?.runs?.optimal?.modules ?? []).some((u) => u.appliance === 'fridge'),
      `А: ${(saved?.runs?.optimal?.modules ?? []).map((u) => u.id).join(', ') || 'пусто'} · Б: ${(saved?.wallRuns?.w2?.modules ?? []).map((u) => `${u.id}:${u.offsetMm}`).join(', ')}`,
    );

    /* Стена В: отметка числом и вплотную к углу Б–В. */
    await view(page, 'plan');
    await selectOn(page, 'w3', ids.c);
    const from0 = await page.evaluate((m) => document.querySelector(`[data-placement-from="${m}"]`)?.value ?? null, ids.c);
    check(`модуль стены В — от левого угла стены (ряд с угла ${ids.starts.w3} + 300)`, from0 === String(ids.starts.w3 + 300), `поле ${from0}`);
    await page.fill(`[data-placement-from="${ids.c}"]`, String(ids.starts.w3 + 357));
    await click(page, '[data-placement-set]', 'стена В: «Поставить»');
    now = await inspector(page);
    check(`стена В: «от левого угла» ${ids.starts.w3 + 357} — модуль на 357 мм ряда`, now?.wall === 'w3' && now?.offset === 357, JSON.stringify(now));
    plan = await planGeometry(page);
    await view(page, '3d');
    scene = await sceneGeometry(page);
    const bc2 = compare(plan, scene, 'w2', 'w3');
    check('стена В: модуль на плане и в 3D там же от угла Б–В, сторона одна', bc2.ok, bc2.words);
    await view(page, 'plan');
    await selectOn(page, 'w3', now?.id ?? ids.c);
    await click(page, '[data-placement-snap="left"]', 'стена В: «Прижать к началу ряда» — к углу');
    now = await inspector(page);
    check('стена В: вплотную к углу — модуль с начала ряда (0), сразу за занятым углом', now?.wall === 'w3' && now?.offset === 0, JSON.stringify(now));
    plan = await planGeometry(page);
    await shot(page, 'wallc-plan.png');
    await view(page, '3d');
    scene = await sceneGeometry(page);
    const bc3 = compare(plan, scene, 'w2', 'w3');
    check('у угла: модуль стены В на плане и в 3D там же, мебель не входит в стены', bc3.ok && scene.intersects === 0, `${bc3.words} · пересечений ${scene.intersects}`);
    await shot(page, 'wallc-3d.png');
  }, { viewport: { width: 1440, height: 900 } });
}

/* ═════════════════════════  PLACEMENT  ═════════════════════════ */

async function selectOn(page, wallId, moduleId) {
  await ensureTool(page, 'select');
  await click(page, `[data-object-wall="${wallId}"]`, `стена ${wallId} в списке объектов`);
  const row = page.locator(`[data-object-module="${moduleId}"]`);
  must(`модуль ${moduleId} в списке стены ${wallId}`, (await row.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-object-module="${moduleId}"]`);
  await row.first().click();
  await page.waitForSelector(`[data-module-placement="${moduleId}"]`, { timeout: 30_000 });
  await sleep(400);
}
const inspector = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-inspector-module]');
    return el ? { id: el.getAttribute('data-inspector-module'), wall: el.getAttribute('data-inspector-wall'), offset: Number(el.getAttribute('data-inspector-offset')) } : null;
  });

async function partPlacement(browser) {
  console.log('\n── PLACEMENT (1440 × 900): свободная сборка — отметка числом, «прижать», перенос на другую стену');
  const fx = fixture('freeL');
  const ids = fixture('freeModules');
  await withOrg('placement', browser, async ({ page, project, service }) => {
    const id = await project(fx);
    await openStudio(page, id);
    await view(page, 'plan');
    const moving = ids.b[0];
    await selectOn(page, 'w2', moving);
    const from0 = await page.evaluate((m) => document.querySelector(`[data-placement-from="${m}"]`)?.value ?? null, moving);
    check('отметка модуля стены Б — от левого угла стены (ряд с угла 660 + 300)', from0 === String(ids.bStart + 300), `поле ${from0}`);
    await page.fill(`[data-placement-from="${moving}"]`, String(ids.bStart + 353));
    await click(page, '[data-placement-set]', '«Поставить»');
    let now = await inspector(page);
    check('«от левого угла» 1013 — модуль на 353 мм ряда (точно, не шагом 50)', now?.offset === 353 && now?.wall === 'w2', JSON.stringify(now));
    const plan = await planGeometry(page);
    await view(page, '3d');
    const scene = await sceneGeometry(page);
    const result = compare(plan, scene, 'w1', 'w2');
    check('после отметки: модуль на плане и в 3D там же от угла, сторона одна', result.ok, result.words);
    await view(page, 'plan');
    await selectOn(page, 'w2', now?.id ?? moving);
    const gaps = await page.evaluate(() => document.querySelector('[data-placement-gaps]')?.getAttribute('data-placement-gaps') ?? null);
    await click(page, '[data-placement-snap="right"]', '«Прижать» вправо — к соседу');
    now = await inspector(page);
    check('«прижать» к соседу справа (400 на 1200): модуль на 600 мм ряда, вплотную', now?.offset === 600, `было пусто слева/справа ${gaps} · ${JSON.stringify(now)}`);
    await shot(page, 'placement-snap-plan.png');
    const before = await total(page);
    /* На занятое место стены А — отказ с мм. */
    await click(page, '[data-placement-wall="0"]', 'перенос: «Стена А»');
    await page.fill('[data-placement-target-from]', '300');
    await click(page, '[data-placement-transfer-preview]', 'перенос: «Показать, что получится»');
    const refusal = await page.evaluate(() => document.querySelector('[data-placement-transfer-refusal]')?.textContent ?? null);
    check('перенос на занятое место стены А — отказ словами с мм, ничего не записано', Boolean(refusal && /мм/.test(refusal)) && (await total(page)) === before, refusal ?? 'отказа нет');
    await page.fill('[data-placement-target-from]', '1000');
    await click(page, '[data-placement-transfer-preview]', 'перенос на 1000: «Показать, что получится»');
    const lines = await page.evaluate(() => document.querySelector('[data-placement-transfer-result]')?.textContent ?? null);
    const blockedLines = await page.evaluate(() => [...document.querySelectorAll('[data-placement-transfer-blocked]')].map((li) => (li.textContent ?? '').trim()));
    await click(page, '[data-placement-transfer-apply]', 'перенос: «Применить»');
    now = await inspector(page);
    const status = await page.evaluate(() => document.querySelector('[data-studio-status]')?.getAttribute('data-studio-status') ?? null);
    check(
      'перенос: модуль на стене А на 1000 мм от её левого угла, выбран там же; предпросмотр запрета не называл — и экран без блокирующих ошибок',
      now?.wall === 'w1' && now?.offset === 1000 && blockedLines.length === 0 && status !== null && status !== 'blocked',
      `${JSON.stringify(now)} · статус ${status} · запрет: ${blockedLines.join(' | ') || 'нет'} · ${lines?.slice(0, 160)}`,
    );
    await view(page, '3d');
    const scene2 = await sceneGeometry(page);
    const box = now?.id ? scene2.boxes[now.id] : null;
    check('в 3D модуль на стене А (фасадом в комнату — сторона одна с планом)', Boolean(box), box ? JSON.stringify(box) : 'нет');
    await shot(page, 'placement-transfer-3d.png');
    await view(page, 'plan');
    await shot(page, 'placement-transfer-plan.png');
    const saved = await savedMillwork(service, id, (m) => (m.runs?.optimal?.modules ?? []).some((u) => u.offsetMm === 1000));
    const onA = (saved?.runs?.optimal?.modules ?? []).map((u) => `${u.id}:${u.offsetMm}`);
    const onB = (saved?.wallRuns?.w2?.modules ?? []).map((u) => `${u.id}:${u.offsetMm}`);
    check('в базе: модуль на стене А на 1000, со стены Б снят', onA.some((t) => t.endsWith(':1000')) && onB.length === 1, `А ${onA.join(', ')} · Б ${onB.join(', ')}`);
  }, { viewport: { width: 1440, height: 900 } });
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
          if (part === 'tiles') await partTiles(browser);
          if (part === 'mirror') await partMirror(browser);
          if (part === 'u') await partU(browser);
          if (part === 'turns') await partTurns(browser);
          if (part === 'legacy') await partLegacy(browser);
          if (part === 'wizard') await partWizard(browser);
          if (part === 'tablet') await partTablet(browser);
          if (part === 'placement') await partPlacement(browser);
          if (part === 'k1' || part === 'k2' || part === 'k3') await partKitchen(browser, part);
          if (part === 'gap') await partGap(browser);
          if (part === 'fridge') await partFridge(browser);
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
