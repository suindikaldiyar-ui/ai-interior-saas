/**
 * УГОЛ И ЧИСТОТА 3D В БРАУЗЕРЕ (ADVANCED CAD · STAGE A) — настоящая организация, настоящая видеокарта.
 *
 * Запуск (после `npm run build`): `PART=<часть> node scripts/check-corner-quality.mjs`
 *   PART=walls   — 1440 × 900, композиции директивы путём экрана (прямая 3800,
 *                  Г 3800 + 1140, П 3800 + 2400 + 1740, П 3600 + 2800 + 3600 с
 *                  Г-модулями): в сцене те модули и те подвижные детали, что
 *                  посчитал движок; у встроенного холодильника две двери,
 *                  ходят обе; дверь стены А открывается одна — ни одна деталь
 *                  другой стены не двинулась; то же с дверью стены Б; «Открыть
 *                  всё» двигает каждую деталь списка; снимки.
 *   PART=look    — Г 3800 + 1140: рентген → «Интерьер» снимает рентген, мебель
 *                  непрозрачна, кнопка «Рентген» недоступна и говорит почему;
 *                  слои по одному; слой «Фасады» выключен — ящики выезжают
 *                  коробом; вид «Фурнитура» — створки ходят, ручка и петли едут
 *                  с ними, невидимые полотна не ловят указатель; снимки.
 *   PART=refusal — П 3800 + 1140 + 1740: композиция не собирается — причина
 *                  словами с миллиметрами, цены нет, статус «Есть блокирующие».
 *   PART=clearance — фальш-панели по ходу на настоящих школах цеха (`orgs.production`
 *                  временной организации): П 3800 + 2400 + 1740 на 600/300 (панель
 *                  стены Б у слепого модуля 12 мм) и П смешанная на «угол 60/1000»
 *                  (панель стены В 64 мм вместо 60) — модули и створки движка, «Открыть
 *                  всё», слова у угла, цена есть; П 3600 + 2800 + 3600 со слепыми углами —
 *                  заход, который панелью не снять: статус «Есть блокирующие», цены нет,
 *                  причина словами; снимки закрытой и открытой кухни.
 *
 * Сверка — по НАРИСОВАННОМУ: `__mwCadLeaves` (подвижные детали всех стен: место,
 * поза группы, ловит ли указатель, что едет в группе хода), `__mwCadModules`, `__mwCadLayers`,
 * `__mwCadLook`; ожидания — `corner-quality-fixture.ts` тем же путём экрана.
 * Каждая часть — своя временная организация: заводится служебным ключом и
 * удаляется; уборка проверяется чтением.
 */
import { execSync, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_CQ ?? 3311);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/corner-quality';
const PARTS = (process.env.PART ?? 'walls').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['walls', 'look', 'refusal', 'clearance'];
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

let fixtures = null;
function fixture(key) {
  if (!fixtures) {
    fixtures = JSON.parse(
      execSync('npx tsx --tsconfig tsconfig.scripts.json scripts/corner-quality-fixture.ts', {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  }
  const fx = fixtures[key];
  if (!fx) throw new Stop(`нет объекта «${key}» в corner-quality-fixture`);
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
async function openStudio(page, projectId, query = '') {
  await page.goto(`${BASE}/project/${projectId}/room${query}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
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
const leaves = (page) => page.evaluate(() => window.__mwCadLeaves());
const openIds = (page) => page.evaluate(() => (window.__mwOpenIds ? window.__mwOpenIds() : null));
const moving = (page) => page.evaluate(() => (window.__mwMovingCount ? window.__mwMovingCount() : -1));
/** Ход кончился: ничего не едет два замера подряд. */
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
/** Поза детали — что сравнивать до и после: место центра и поза группы, которая её везёт. */
const poseKey = (leaf) => JSON.stringify([leaf.world, leaf.shift, leaf.rotationDeg]);
const moved = (before, after) => poseKey(before) !== poseKey(after);

/**
 * ДЕТАЛЬ ЗАДАННОЙ СТЕНЫ НАЖАТИЕМ ПО МЕБЕЛИ: точка детали на экране, нажатие мышью. Если над ней в кадре другая
 * деталь (перекрыта), откроется не она — тогда пробуется следующая из списка, и это сказано.
 */
async function openOne(page, candidates) {
  const tried = [];
  for (const id of candidates) {
    const at = await page.evaluate((target) => window.__mwCadPartPoint(target), id);
    if (!at) {
      tried.push(`${id}: точки нет`);
      continue;
    }
    const before = await leaves(page);
    await page.mouse.click(at.x, at.y);
    await sleep(300);
    await settle(page);
    const ids = await openIds(page);
    if (ids?.length === 1 && ids[0] === id) return { id, before, after: await leaves(page), tried };
    const why = await page.evaluate(() => ({
      layers: window.__mwCadLayers ? window.__mwCadLayers().preset : null,
      tool: document.querySelector('[data-studio-rail] [data-studio-tool][aria-pressed="true"]')?.getAttribute('data-studio-tool') ?? null,
      leaves: window.__mwCadLeaves ? window.__mwCadLeaves().leaves.length : null,
    }));
    tried.push(`${id}: открылось ${JSON.stringify(ids)} (слои ${why.layers}, инструмент ${why.tool}, деталей ${why.leaves})`);
    /* Закрыть то, что открылось, — и к следующей. */
    for (const other of ids ?? []) {
      const p = await page.evaluate((target) => window.__mwCadPartPoint(target), other);
      if (p) await page.mouse.click(p.x, p.y);
      await settle(page);
    }
  }
  return { id: null, tried };
}

/* ─────────────────────────  организация  ───────────────────────── */

const limitedFetch = (input, init = {}) => fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) });

async function withOrg(label, browser, body, { viewport, production }) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: limitedFetch },
  });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const made = { users: [], orgs: [], projects: [] };
  try {
    const email = `cq-${stamp}@example.test`;
    const password = `Pw-${stamp}-cq!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    made.users.push(data.user.id);
    /* Школа цеха — в настройках организации, как у настоящей компании (`/admin/production`). */
    const { data: org, error: orgError } = await service
      .from('orgs')
      .insert({ slug: `cq-${stamp}`, name: `Проверка угла ${label}`, ...(production ? { production } : {}) })
      .select('id')
      .single();
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
    /* Объект — замер и состав; ряды экран собирает сам (готовое решение), углы — выбор по углам. */
    const project = async (fx) => {
      const { data: row, error: projectError } = await service
        .from('projects')
        .insert({
          org_id: org.id,
          client_name: 'Проверка',
          status: 'in_progress',
          address: `Угол ${label}: ${fx.title}`,
          zone: 'Кухня',
          measurements: fx.measurement,
          millwork: {
            survey: fx.survey,
            /*
             * Собранный объект: готовое решение выбрано. Studio открывает объект, на котором ничего не собрано,
             * свободной сборкой — пустой стеной (STAGE 01A); состав — сохранённые требования, как у движка.
             */
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
    await body({ page, errors, project });
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

/* ═════════════════════════  WALLS  ═════════════════════════ */

async function partWalls(browser) {
  console.log('\n── WALLS (1440 × 900): композиции директивы — модули, створки, отдельность стен, «Открыть всё»');
  await withOrg(
    'WALLS',
    browser,
    async ({ page, errors, project }) => {
      for (const key of ['straight', 'l', 'u', 'u-lshape']) {
        const fx = fixture(key);
        const tag = fx.title;
        const id = await project(fx);
        await openStudio(page, id);
        await view3d(page);

        /* ── Сцена рисует то, что посчитал движок: модули и подвижные детали всех стен ── */
        const wantModules = fx.rows.flatMap((row) => row.modules.map((m) => m.id)).sort();
        const drawnModules = await page.evaluate(() => (window.__mwCadModules ? window.__mwCadModules().ids : null));
        check(
          `${tag}: в сцене ровно модули движка — по всем стенам`,
          JSON.stringify(drawnModules) === JSON.stringify(wantModules),
          `нарисовано ${drawnModules?.length ?? 'НЕТ'} из ${wantModules.length}${drawnModules ? ` · лишних ${drawnModules.filter((m) => !wantModules.includes(m)).slice(0, 3).join(', ') || 0} · нет ${wantModules.filter((m) => !drawnModules.includes(m)).slice(0, 3).join(', ') || 0}` : ''}`,
        );
        const wantLeaves = fx.rows.flatMap((row) => row.modules.flatMap((m) => m.leaves.map((leaf) => leaf.id))).sort();
        const closed = await leaves(page);
        const drawnLeaves = closed.leaves.map((leaf) => leaf.id).filter((leafId) => !/:b\d+(?::z\d+)?:drawer:\d+$/.test(leafId) && !/:(pantograph|pullout)$/.test(leafId));
        check(
          `${tag}: подвижных деталей в сцене — ровно список движка (${wantLeaves.length})`,
          JSON.stringify(drawnLeaves.sort()) === JSON.stringify(wantLeaves),
          `в сцене ${drawnLeaves.length} · лишних ${drawnLeaves.filter((l) => !wantLeaves.includes(l)).slice(0, 3).join(', ') || 0} · нет ${wantLeaves.filter((l) => !drawnLeaves.includes(l)).slice(0, 3).join(', ') || 0}`,
        );

        /* ── Холодильник: две двери — каждая своё полотно, нижняя ниже верхней ── */
        const fridge = fx.rows.flatMap((row) => row.modules).find((m) => m.appliance === 'fridge' && m.builtIn);
        if (fridge) {
          const doors = closed.leaves.filter((leaf) => leaf.id.startsWith(`${fridge.id}:door:`));
          const low = doors.find((leaf) => leaf.id.endsWith(':door:0'));
          const high = doors.find((leaf) => leaf.id.endsWith(':door:1'));
          check(
            `${tag}: встроенный холодильник — две двери, нижняя под верхней (лишних полотен в колонне нет)`,
            doors.length === 2 && Boolean(low && high) && high.world[1] - low.world[1] > 600,
            `дверей ${doors.length} · центры ${doors.map((d) => `${d.id.split(':').slice(-2).join(':')} y=${d.world[1]}`).join(', ')}`,
          );
        }

        /* ── Дверь стены А открывается одна: ни одна деталь другой стены (и своей) не двинулась ── */
        const doorsOf = (wall) =>
          fx.rows[wall].modules
            .filter((m) => m.kind === 'base' || m.kind === 'upper' || m.kind === 'tall')
            .flatMap((m) => m.leaves.filter((leaf) => leaf.kind === 'door').map((leaf) => leaf.id));
        for (const wall of fx.rows.map((_, i) => i).slice(0, 2)) {
          const candidates = doorsOf(wall);
          if (candidates.length === 0) {
            check(`${tag}: у стены ${'АБВ'[wall]} распашных створок нет — открывать нечего (слепая зона угла)`, wall > 0, 'на стене А створок нет');
            continue;
          }
          const one = await openOne(page, candidates);
          must(`${tag}: створка стены ${'АБВ'[wall]} нашлась нажатием по мебели`, Boolean(one.id), one.tried.join(' | '));
          const byId = new Map(one.before.leaves.map((leaf) => [leaf.id, leaf]));
          const changed = one.after.leaves.filter((leaf) => byId.has(leaf.id) && moved(byId.get(leaf.id), leaf)).map((leaf) => leaf.id);
          const self = one.after.leaves.find((leaf) => leaf.id === one.id);
          check(
            `${tag}: открыта одна створка стены ${'АБВ'[wall]} (${one.id.split('@')[0]}) — двинулась только она, другие стены на месте`,
            changed.length === 1 && changed[0] === one.id && Math.abs(self.rotationDeg[0]) + Math.abs(self.rotationDeg[1]) >= 80,
            `двинулось ${changed.length}: ${changed.slice(0, 4).join(', ')} · поворот ${JSON.stringify(self?.rotationDeg)}${one.tried.length ? ` · перекрытые: ${one.tried.join(' | ')}` : ''}`,
          );
          /* Закрыть тем же нажатием. */
          const at = await page.evaluate((target) => window.__mwCadPartPoint(target), one.id);
          await page.mouse.click(at.x, at.y);
          await settle(page);
          const back = await openIds(page);
          check(`${tag}: та же створка закрывается нажатием`, Array.isArray(back) && back.length === 0, JSON.stringify(back));
        }

        /* ── Снимки приёмки: на Г выдвинуты ящики варочной, на П открыт Г-модуль первого угла — нажатием по мебели ── */
        const showcase =
          key === 'l'
            ? { name: 'l-drawers-open.png', ids: fx.rows[0].modules.find((m) => m.appliance === 'hob')?.leaves.filter((leaf) => leaf.kind === 'drawer').map((leaf) => leaf.id) ?? [] }
            : key === 'u-lshape'
              ? { name: 'u-lshape-corner-open.png', ids: fx.rows[0].modules.filter((m) => m.kind === 'corner_base').flatMap((m) => m.leaves.map((leaf) => leaf.id)) }
              : null;
        if (showcase) {
          must(`${tag}: для снимка есть что открыть`, showcase.ids.length > 0, 'НУЛЕВОЙ СЕЛЕКТОР: ни ящиков варочной, ни Г-модуля');
          for (const partId of showcase.ids) {
            const at = await page.evaluate((target) => window.__mwCadPartPoint(target), partId);
            must(`${tag}: точка детали ${partId.split('@')[0]}`, Boolean(at), `НУЛЕВОЙ СЕЛЕКТОР: part:${partId}`);
            await page.mouse.click(at.x, at.y);
            await settle(page);
          }
          const shown = (await openIds(page)) ?? [];
          check(
            `${tag}: открыто ровно нажатое (${showcase.ids.length})`,
            shown.length === showcase.ids.length && showcase.ids.every((partId) => shown.includes(partId)),
            JSON.stringify(shown),
          );
          await shot(page, showcase.name);
          if (shown.length > 0) {
            await click(page, '[data-close-all]', `${tag}: «Закрыть всё» после снимка`);
            await settle(page, 90_000);
          }
        }

        /* ── «Открыть всё»: каждая деталь списка движка двинулась; «Закрыть всё» — все на месте ── */
        await click(page, '[data-open-all]', `${tag}: «Открыть всё»`);
        await settle(page, 90_000);
        const opened = await leaves(page);
        const before = new Map(closed.leaves.map((leaf) => [leaf.id, leaf]));
        const still = wantLeaves.filter((leafId) => {
          const now = opened.leaves.find((leaf) => leaf.id === leafId);
          if (leafId.includes(':door:') && fx.rows.some((row) => row.modules.some((m) => leafId.startsWith(`${m.id}:`) && (m.kind === 'corner_base' || m.kind === 'corner_upper')))) {
            return !(opened.bifold[leafId]?.length > 0);
          }
          return !now || !moved(before.get(leafId), now);
        });
        const ids = await openIds(page);
        check(
          `${tag}: «Открыть всё» — двинулась каждая деталь списка (${wantLeaves.length}), открыто столько же`,
          still.length === 0 && (ids?.length ?? 0) >= wantLeaves.length,
          `не двинулись ${still.length}: ${still.slice(0, 4).join(', ')} · открыто ${ids?.length ?? 'НЕТ'}`,
        );
        await shot(page, `${key}-open-all.png`);
        await click(page, '[data-close-all]', `${tag}: «Закрыть всё»`);
        await settle(page, 90_000);
        const shut = await leaves(page);
        const off = shut.leaves.filter((leaf) => before.has(leaf.id) && moved(before.get(leaf.id), leaf)).map((leaf) => leaf.id);
        check(`${tag}: «Закрыть всё» — все детали на прежних местах`, off.length === 0 && ((await openIds(page))?.length ?? -1) === 0, off.slice(0, 4).join(', ') || 'на месте');
        await shot(page, `${key}-closed.png`);
      }
      check('WALLS: ошибок страницы нет', errors.length === 0, errors.slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  LOOK  ═════════════════════════ */

async function partLook(browser) {
  console.log('\n── LOOK (1440 × 900): «Интерьер» и рентген, слои и открывание');
  await withOrg(
    'LOOK',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('l');
      const id = await project(fx);
      await openStudio(page, id);
      await view3d(page);
      const layersOf = () => page.evaluate(() => window.__mwCadLayers());
      const look = () => page.evaluate(() => window.__mwCadLook());

      /*
       * ── Рентген — отладочный вид (STAGE B: только в отладке) ──
       * Без `?debug=1` кнопки нет; дальше часть идёт прежними проверками в Studio с отладкой.
       */
      const plainXray = await page.locator('[data-scene-mode]').count();
      check('без отладки кнопки «Рентген» нет', plainXray === 0, `кнопок ${plainXray}`);
      await openStudio(page, id, '?debug=1');
      await view3d(page);
      await click(page, '[data-scene-mode]', 'кнопка «Рентген»');
      const xray = await waitFor(page, () => window.__mwCadLayers(), (v) => v.cutaway === true, 10_000);
      const xrayLook = await look();
      check('рентген включён: корпус просвечивает', xray.cutaway === true && xrayLook.transparent > 0, `рентген ${xray.cutaway} · прозрачных ${xrayLook.transparent}`);
      await shot(page, 'l-xray.png');

      /* ── «Интерьер» снимает рентген: сплошные фасады, ни одного прозрачного материала мебели ── */
      const rail = page.locator('[data-studio-rail] [data-studio-tool="lighting"]');
      must('инструмент «Освещение» в рейке', (await rail.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="lighting"]');
      await rail.first().click();
      await page.waitForSelector('[data-lighting-panel]', { timeout: 30_000 });

      /*
       * «Слои» раскрыты при открытой панели «Освещение» (1440 px): ни одна кнопка полосы над сценой не ложится на
       * «На весь экран» — раньше раскрытая группа выходила шире полосы и накрывала её (снимок l-hardware-open.png).
       */
      if ((await page.locator('[data-scene-layer]').count()) === 0) await click(page, '[data-scene-layers-toggle]', 'кнопка «Слои»');
      const cover = await page.evaluate(() => {
        const full = document.querySelector('[data-fullscreen-toggle]')?.getBoundingClientRect();
        const items = [...document.querySelectorAll('[data-toolbar] button, [data-toolbar] select')]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0);
        const hit = full ? items.filter((r) => r.left < full.right - 0.5 && r.right > full.left + 0.5 && r.top < full.bottom - 0.5 && r.bottom > full.top + 0.5) : [];
        return { full: Boolean(full), items: items.length, layers: document.querySelectorAll('[data-scene-layer]').length, hit: hit.length };
      });
      check(
        '«Слои» раскрыты при открытой «Освещении»: ни одна кнопка полосы не ложится на «На весь экран»',
        cover.full && cover.items > 0 && cover.layers > 0 && cover.hit === 0,
        JSON.stringify(cover),
      );
      await shot(page, 'l-layers-lighting.png');
      await click(page, '[data-scene-layers-toggle]', 'кнопка «Слои» (свернуть)');

      await click(page, '[data-light-design]', 'кнопка «Интерьер»');
      await waitFor(page, () => (window.__mwLighting ? window.__mwLighting() : null), (v) => v?.design === true && v.warming !== true, 90_000);
      const design = await layersOf();
      const designLook = await look();
      const button = page.locator('[data-scene-mode]').first();
      const disabled = await button.isDisabled();
      const title = (await button.getAttribute('title')) ?? '';
      check(
        '«Интерьер» снимает рентген: в сцене рентгена нет, прозрачных материалов мебели 0, кнопка «Рентген» недоступна и говорит почему',
        design.cutaway === false && design.xray === false && designLook.transparent === 0 && disabled && /В «Интерьере» рентгена нет/.test(title),
        `рентген ${design.cutaway}/${design.xray} · прозрачных ${designLook.transparent} · кнопка ${disabled ? 'недоступна' : 'ДОСТУПНА'} · «${title.slice(0, 60)}»`,
      );
      await shot(page, 'l-interior.png');
      await click(page, '[data-light-design]', 'кнопка «Интерьер» (выкл.)');
      await sleep(800);
      const after = await layersOf();
      check('после «Интерьера» рентген не возвращается сам', after.cutaway === false && after.xray === false, `рентген ${after.cutaway}/${after.xray}`);

      /* ── Слои по одному: выключенный слой убирает свои коробки, остальные на месте ── */
      const base = await layersOf();
      const order = ['carcass', 'partitions', 'shelves', 'drawers', 'fronts', 'hardware'];
      const toggle = async (layer) => {
        const b = page.locator(`[data-scene-layer="${layer}"]`);
        if ((await b.count()) === 0) {
          const open = page.locator('[data-scene-layers-toggle]');
          if ((await open.count()) > 0) await open.first().click();
          await sleep(300);
        }
        must(`переключатель слоя «${layer}»`, (await b.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-scene-layer="${layer}"]`);
        await b.first().click();
        await sleep(500);
      };
      for (const layer of order) {
        if (!base.layers[layer]) continue;
        if ((base.total[layer] ?? 0) === 0) {
          /* Слоя в ряду нет — кнопка недоступна и говорит это (P1), переключать нечего. */
          const b = page.locator(`[data-scene-layer="${layer}"]`).first();
          check(`слой «${layer}»: в ряду коробок нет — кнопка недоступна`, (await b.count()) > 0 && (await b.isDisabled()), `кнопок ${await b.count()}`);
          continue;
        }
        await toggle(layer);
        const offState = await layersOf();
        /*
         * Прочие слои — те же. Одно исключение — правило P1: фурнитура НА фасаде (ручки, чашки петель) без фасада висела
         * бы в воздухе и уходит вместе с ним; фурнитура в корпусе (штанги, направляющие, механизмы) остаётся.
         */
        const others = order
          .filter((l) => l !== layer)
          .every((l) =>
            layer === 'fronts' && l === 'hardware'
              ? (offState.shown[l] ?? 0) < (base.shown[l] ?? 0)
              : (offState.shown[l] ?? 0) === (base.shown[l] ?? 0),
          );
        check(
          `слой «${layer}» выключается один: его коробок в кадре 0, у остальных слоёв столько же`,
          offState.layers[layer] === false && (offState.shown[layer] ?? 0) === 0 && others,
          `${layer}: ${base.shown[layer] ?? 0} → ${offState.shown[layer] ?? 0} · прочие ${others ? 'те же' : 'ИЗМЕНИЛИСЬ'}`,
        );
        await toggle(layer);
      }

      /*
       * ── Фасады выключены: «Открыть всё» выдвигает короба ящиков ──
       * У створки без фасада в кадре не остаётся ничего: ручка и чашки петель стоят на фасаде и уходят с ним (P1).
       * Такая створка в сцену не ставится — нажимать нечего. Невидимое полотно меряется ниже, в виде «Фурнитура».
       */
      await toggle('fronts');
      const hidden = await leaves(page);
      const doorIds = fx.rows.flatMap((row) => row.modules.flatMap((m) => m.leaves.filter((leaf) => leaf.kind === 'door').map((leaf) => leaf.id)));
      const drawerIds = fx.rows.flatMap((row) => row.modules.flatMap((m) => m.leaves.filter((leaf) => leaf.kind === 'drawer').map((leaf) => leaf.id)));
      await click(page, '[data-open-all]', '«Открыть всё» без фасадов');
      await settle(page, 90_000);
      const out = await leaves(page);
      const slid = drawerIds.filter((leafId) => {
        const a = hidden.leaves.find((leaf) => leaf.id === leafId);
        const b = out.leaves.find((leaf) => leaf.id === leafId);
        return a && b && b.shift && a.shift && b.shift[2] - a.shift[2] >= 250 && b.body > 0;
      });
      check(
        'без слоя «Фасады» «Открыть всё» выдвигает ящики: короба выехали на ход ящика и нарисованы',
        drawerIds.length > 0 && slid.length === drawerIds.length,
        `ящиков ${drawerIds.length} · выехали ${slid.length}`,
      );
      await shot(page, 'l-no-fronts-open.png');
      await click(page, '[data-close-all]', '«Закрыть всё»');
      await settle(page, 90_000);

      /*
       * ── Вид «Фурнитура»: ручки и петли видны, полотна нет ──
       * Створка в сцене — её ручка и петли ходят с ней, — но пустое место, где было бы полотно, дверь не открывает:
       * у зоны касания невидимого полотна обработчиков нет. Ноль «ловят» над пустой сценой не мерил бы ничего,
       * поэтому сначала все створки списка обязаны быть в сцене.
       */
      const preset = page.locator('[data-scene-preset-select]');
      must('список «Вид»', (await preset.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-scene-preset-select]');
      await preset.first().selectOption('hardware');
      await sleep(800);
      const bare = await leaves(page);
      const bareFound = doorIds.filter((leafId) => bare.leaves.some((leaf) => leaf.id === leafId));
      const bareCatching = bare.leaves.filter((leaf) => doorIds.includes(leaf.id) && leaf.clickable).map((leaf) => leaf.id);
      check(
        'вид «Фурнитура»: створки в сцене, а их невидимые полотна не ловят указатель',
        doorIds.length > 0 && bareFound.length === doorIds.length && bareCatching.length === 0,
        `створок ${doorIds.length} · в сцене ${bareFound.length} · ловят ${bareCatching.length}: ${bareCatching.slice(0, 3).join(', ')}`,
      );
      await click(page, '[data-open-all]', '«Открыть всё» в виде «Фурнитура»');
      await settle(page, 90_000);
      const swung = await leaves(page);
      const notRiding = doorIds.filter((leafId) => {
        const a = bare.leaves.find((leaf) => leaf.id === leafId);
        const b = swung.leaves.find((leaf) => leaf.id === leafId);
        return !a || !b || !moved(a, b) || b.riders === 0 || b.body > 0;
      });
      check(
        'вид «Фурнитура»: «Открыть всё» — каждая створка ходит, ручка и петли едут с ней, полотна в кадре нет',
        doorIds.length > 0 && notRiding.length === 0,
        `створок ${doorIds.length} · не так ${notRiding.length}: ${notRiding
          .slice(0, 3)
          .map((leafId) => {
            const b = swung.leaves.find((leaf) => leaf.id === leafId);
            return b ? `${leafId} (седоков ${b.riders}, полотна ${b.body})` : `${leafId} (нет в сцене)`;
          })
          .join(', ')}`,
      );
      await shot(page, 'l-hardware-open.png');
      await click(page, '[data-close-all]', '«Закрыть всё»');
      await settle(page, 90_000);
      await preset.first().selectOption('design');
      await sleep(800);
      const back = await leaves(page);
      const catchingBack = back.leaves.filter((leaf) => doorIds.includes(leaf.id) && leaf.clickable).length;
      check('вид «Дизайн» вернул фасады — створки снова ловят указатель', catchingBack === doorIds.length, `ловят ${catchingBack} из ${doorIds.length}`);

      /* 390 px: полоса над сценой — одна строка, которая прокручивается, а не три ряда поверх мебели. */
      await page.setViewportSize({ width: 390, height: 844 });
      await sleep(800);
      if ((await page.locator('[data-scene-layer]').count()) === 0 && (await page.locator('[data-scene-layers-toggle]').count()) > 0) {
        await page.locator('[data-scene-layers-toggle]').first().click();
        await sleep(400);
      }
      const narrow = await page.evaluate(() => {
        const bar = document.querySelector('[data-toolbar]');
        if (!bar) return null;
        const tops = [...bar.querySelectorAll('button, select')]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => Math.round(r.top));
        return { rows: new Set(tops).size, spread: tops.length ? Math.max(...tops) - Math.min(...tops) : -1, scrolls: bar.scrollWidth > bar.clientWidth, page: document.documentElement.scrollWidth <= window.innerWidth + 1 };
      });
      check(
        '390 px: полоса над сценой — одна строка с прокруткой, страница по ширине не прокручивается',
        Boolean(narrow) && narrow.spread <= 4 && narrow.page,
        JSON.stringify(narrow),
      );
      await shot(page, 'l-toolbar-390.png');
      await page.setViewportSize({ width: 1440, height: 900 });
      check('LOOK: ошибок страницы нет', errors.length === 0, errors.slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  REFUSAL  ═════════════════════════ */

async function partRefusal(browser) {
  console.log('\n── REFUSAL (1440 × 900): П 3800 + 1140 + 1740 — физически не собирается');
  await withOrg(
    'REFUSAL',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('u-directive');
      const id = await project(fx);
      await openStudio(page, id);
      await page.waitForSelector('[data-studio-status]', { timeout: 60_000 });
      const status = await page.locator('[data-studio-status]').first().getAttribute('data-studio-status');
      const price = await page.locator('[data-price-hidden]').count();
      const strip = (await page.locator('[data-studio-blocking]').count()) > 0 ? await page.locator('[data-studio-blocking]').first().innerText() : '';
      check(
        'П 3800 + 1140 + 1740: статус «Есть блокирующие ошибки», цены нет',
        status === 'blocked' && price > 0,
        `статус ${status} · «Цены нет» ${price}`,
      );
      check(
        'причина в красной полосе — словами и с миллиметрами: стены А и В в 1140 мм, нужно 1152 мм, фасады вошли бы на 12 мм',
        strip.includes('1140 мм') && strip.includes('1152 мм') && strip.includes('12 мм') && !/Error|undefined/.test(strip),
        strip.slice(0, 260) || 'ПОЛОСЫ НЕТ',
      );
      check(
        'замер не подменён: сказано, какой нужна стена Б (не короче 2352 мм), можно ли мельче шкафами и что делать',
        strip.includes('не короче 2352 мм') && strip.includes('Мельче шкафами не выйти') && strip.includes('Что можно:'),
        strip.slice(0, 400) || 'ПОЛОСЫ НЕТ',
      );
      await shot(page, 'u-directive-refusal.png');
      check('REFUSAL: ошибок страницы нет', errors.length === 0, errors.slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  CLEARANCE  ═════════════════════════ */

const READ_STATUS = () => ({
  status: document.querySelector('[data-studio-status]')?.getAttribute('data-studio-status') ?? null,
  hidden: document.querySelectorAll('[data-price-hidden]').length,
  strip: document.querySelector('[data-studio-blocking]')?.innerText ?? '',
});

async function partClearance(browser) {
  console.log('\n── CLEARANCE (1440 × 900): фальш-панели по ходу на школах цеха и заход, который панелью не снять');
  const schools = [
    ['u-600', '600/300', { depths: { baseMm: 600, upperMm: 300, mezzanineMm: 600 } }, 1, '12 мм'],
    ['u-mixed60', 'угол 60/1000', { corner: { falsePanelMm: 60, lowerLMm: 1000, upperLMm: 600, confirmed: true } }, 1, '64 мм'],
  ];
  for (const [key, school, production, corner, width] of schools) {
    await withOrg(
      `CLEARANCE ${school}`,
      browser,
      async ({ page, errors, project }) => {
        const fx = fixture(key);
        const tag = fx.title;
        const why = fx.clearance[corner]?.why ?? [];
        must(`${tag}: у движка панель по ходу у угла ${corner + 1}`, why.some((line) => line.includes(width)), `слов у угла: ${why.join(' | ') || 'НЕТ'}`);
        const id = await project(fx);
        await openStudio(page, id);
        await view3d(page);
        const state = await page.evaluate(READ_STATUS);
        check(`${tag}: собрана — блокирующих нет, цена есть`, state.status !== 'blocked' && state.hidden === 0, `статус ${state.status} · «Цены нет» ${state.hidden} · ${state.strip.slice(0, 160)}`);

        const wantModules = fx.rows.flatMap((row) => row.modules.map((m) => m.id)).sort();
        const drawnModules = await page.evaluate(() => (window.__mwCadModules ? window.__mwCadModules().ids : null));
        check(
          `${tag}: в сцене ровно модули движка (ряд за панелью по ходу)`,
          JSON.stringify(drawnModules) === JSON.stringify(wantModules),
          `нарисовано ${drawnModules?.length ?? 'НЕТ'} из ${wantModules.length}${drawnModules ? ` · лишних ${drawnModules.filter((m) => !wantModules.includes(m)).slice(0, 3).join(', ') || 0} · нет ${wantModules.filter((m) => !drawnModules.includes(m)).slice(0, 3).join(', ') || 0}` : ''}`,
        );
        const wantLeaves = fx.rows.flatMap((row) => row.modules.flatMap((m) => m.leaves.map((leaf) => leaf.id))).sort();
        const closed = await leaves(page);
        const drawnLeaves = closed.leaves.map((leaf) => leaf.id).filter((leafId) => !/:b\d+(?::z\d+)?:drawer:\d+$/.test(leafId) && !/:(pantograph|pullout)$/.test(leafId));
        check(
          `${tag}: подвижных деталей в сцене — ровно список движка (${wantLeaves.length})`,
          JSON.stringify(drawnLeaves.sort()) === JSON.stringify(wantLeaves),
          `в сцене ${drawnLeaves.length} · лишних ${drawnLeaves.filter((l) => !wantLeaves.includes(l)).slice(0, 3).join(', ') || 0} · нет ${wantLeaves.filter((l) => !drawnLeaves.includes(l)).slice(0, 3).join(', ') || 0}`,
        );
        await shot(page, `${key}-closed.png`);

        /*
         * Слова у угла: угол выбран его кнопкой в панели «Мебель» — там же карточки угла говорят, почему панель
         * шире. Нажатием на угловой модуль владельца угол выбирается не на каждой композиции: у П 3800 + 2400 + 1740
         * на школе 600/300 нижний слепой модуль стены Б глухой целиком (600 + 16 + 12 = 628 — вся его ширина,
         * створки нет), а створку верхнего на «Общем виде» закрывает колонна холодильника стены В (снимок
         * u-600-closed.png). Путь «нажал угловой модуль — открылся угол» меряет `check-corner.mjs`.
         */
        const tool = page.locator('[data-studio-rail] [data-studio-tool="furniture"]');
        must('инструмент «Мебель» в рейке', (await tool.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="furniture"]');
        const furnitureOpen = () =>
          page.evaluate(() => document.querySelector('[data-studio-context="furniture"]')?.getAttribute('data-open') === 'true');
        /* Нажатие на уже выбранный инструмент сворачивает его панель — нажимаем, только если она закрыта. */
        if (!(await furnitureOpen())) await tool.first().click();
        must('панель «Мебель» открыта', await furnitureOpen(), 'панель инструмента «Мебель» не открылась');
        const cornerButton = page.locator(`[data-corner-index="${corner}"]`);
        must(`${tag}: кнопка угла ${corner + 1}`, (await cornerButton.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-corner-index="${corner}"]`);
        await cornerButton.first().click();
        const words = await waitFor(
          page,
          () => document.querySelector('[data-corner-clearance]')?.innerText ?? '',
          (text) => text.length > 0,
          20_000,
        );
        check(
          `${tag}: у угла сказано, почему панель шире настройки цеха — ${width}, что задевало и на сколько, из чего посчитано`,
          words.includes(width) && words.includes('без этого') && words.includes('посчитано так') && !/undefined|NaN/.test(words),
          words.slice(0, 300) || 'СЛОВ НЕТ',
        );
        const openAfter = await openIds(page);
        check(
          `${tag}: кнопка угла не открыла ни одной детали`,
          Array.isArray(openAfter) && openAfter.length === 0,
          openAfter === null ? 'НУЛЕВОЙ СЕЛЕКТОР: window.__mwOpenIds' : `открыто ${openAfter.join(', ') || 0}`,
        );

        /* «Открыть всё»: каждая деталь двинулась — снимок открытой кухни; «Закрыть всё» — на местах. */
        await click(page, '[data-open-all]', `${tag}: «Открыть всё»`);
        await settle(page, 90_000);
        const opened = await leaves(page);
        const before = new Map(closed.leaves.map((leaf) => [leaf.id, leaf]));
        const still = wantLeaves.filter((leafId) => {
          const now = opened.leaves.find((leaf) => leaf.id === leafId);
          if (leafId.includes(':door:') && fx.rows.some((row) => row.modules.some((m) => leafId.startsWith(`${m.id}:`) && (m.kind === 'corner_base' || m.kind === 'corner_upper')))) {
            return !(opened.bifold[leafId]?.length > 0);
          }
          return !now || !moved(before.get(leafId), now);
        });
        check(`${tag}: «Открыть всё» — двинулась каждая деталь списка (${wantLeaves.length})`, still.length === 0, `не двинулись ${still.length}: ${still.slice(0, 4).join(', ')}`);
        await shot(page, `${key}-open-all.png`);
        await click(page, '[data-close-all]', `${tag}: «Закрыть всё»`);
        await settle(page, 90_000);
        check(`CLEARANCE ${school}: ошибок страницы нет`, errors.length === 0, errors.slice(0, 3).join(' | '));
      },
      { viewport: { width: 1440, height: 900 }, production },
    );
  }

  await withOrg(
    'CLEARANCE заход без панели',
    browser,
    async ({ page, errors, project }) => {
      const fx = fixture('u-tall');
      must('П 3600 + 2800 + 3600: у движка заход, который панелью не снять', fx.cornerClashes.length > 0, 'ЗАХОДОВ НЕТ — проверять нечего');
      const id = await project(fx);
      await openStudio(page, id);
      await page.waitForSelector('[data-studio-status]', { timeout: 60_000 });
      const state = await waitFor(page, READ_STATUS, (v) => v.status === 'blocked', 30_000);
      check(
        `${fx.title}: статус «Есть блокирующие ошибки», цены нет`,
        state.status === 'blocked' && state.hidden > 0,
        `статус ${state.status} · «Цены нет» ${state.hidden}`,
      );
      check(
        `${fx.title}: в красной полосе — что во что заходит и на сколько, почему панелью не снять и что делать`,
        state.strip.includes('на ходу заходит') && state.strip.includes('шире 100 мм') && state.strip.includes('выберите в этом углу другое решение') && !/Error|undefined|NaN/.test(state.strip),
        state.strip.slice(0, 320) || 'ПОЛОСЫ НЕТ',
      );
      await view3d(page);
      const drawn = await page.evaluate(() => (window.__mwCadModules ? window.__mwCadModules().ids.length : 0));
      const want = fx.rows.reduce((sum, row) => sum + row.modules.length, 0);
      check(`${fx.title}: ряды на экране — их правят руками, мебель не спрятана`, drawn === want && want > 0, `нарисовано ${drawn} из ${want}`);
      await click(page, '[data-open-all]', `${fx.title}: «Открыть всё»`);
      await settle(page, 90_000);
      await shot(page, 'u-tall-blocked-open-all.png');
      await click(page, '[data-close-all]', `${fx.title}: «Закрыть всё»`);
      await settle(page, 90_000);
      await shot(page, 'u-tall-blocked.png');
      check('CLEARANCE заход без панели: ошибок страницы нет', errors.length === 0, errors.slice(0, 3).join(' | '));
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
          if (part === 'walls') await partWalls(browser);
          if (part === 'look') await partLook(browser);
          if (part === 'refusal') await partRefusal(browser);
          if (part === 'clearance') await partClearance(browser);
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
