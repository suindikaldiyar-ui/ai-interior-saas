/**
 * ПРИЁМКА P3D-CAT-01 В БРАУЗЕРЕ: лишняя полоса, слои 3D, антресоль над шкафом,
 * EGGER и GRANDEX в каталоге и в Studio.
 *
 * Запуск (после `npm run build`):  node scripts/check-one-pass-3d-catalog.mjs
 * По частям — PART=p0|p1|p2|p3|life (каждая на своей временной организации,
 * уборка проверяется чтением). Часть p0 копирует объект владельца ТОЛЬКО
 * ЧТЕНИЕМ (CLONE_FROM=<id>) во временную организацию; без CLONE_FROM — падение.
 * Приспособление ряда — FIXTURE=<json> (ряд спальни, собранный `applyOps`).
 *
 * Снимки — в .capture-check/one-pass-3d-catalog/after/.
 *
 *   p0   объект владельца: полосы ниши нет, ничего не входит в корпус
 *        (`__mwCadStray`), ключи модулей уникальны, створка антресоли
 *        открывается одна; снимки тем же путём и ракурсом, что «до».
 *   p1   «Вид»: Дизайн / Каркас / Наполнение / Фасады / Фурнитура и слои по
 *        одному; число нарисованных коробок слоя; рентген не протекает в
 *        «Дизайн»; правка вида не пишет объект; 1440, 1180, 1024 касанием, 390.
 *   p2   антресоль над шкафом: отказ в мм до нажатия, постановка, свои
 *        створки (открывание не задевает шкаф), схема — два корпуса, раскрой —
 *        две позиции, сохранить → открыть: ключ и габарит те же.
 *   p3   пакет EGGER/GRANDEX: показ «что ляжет», запись, повторный показ — 0
 *        новых; чужая организация не пишет; фильтр производителя; EGGER на
 *        корпус левого шкафа и другой декор на его фасад — цвет в 3D; GRANDEX
 *        в спальне — отказ словами, на кухне — столешница, «цена не задана»;
 *        админка находит EGGER по коду; сохранить → открыть.
 *   life холст без WebGL: состояние «failed» словами, страница жива.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = 3259;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/one-pass-3d-catalog/after';
const PARTS = (process.env.PART ?? 'p0,p1,p2,p3,life').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['p0', 'p1', 'p2', 'p3', 'life'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Тон роли «корпус» в САПР-виде — цвет декора, притемнённый на 8 % в sRGB
 * (`darkenHex(hex, 0.08)` в lib/millwork/sceneColors.ts, его зовёт
 * `useCarcassMaterials`). Те же три строки, чтобы сверить экран с позицией.
 */
const carcassTone = (hex) =>
  `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.92).toString(16).padStart(2, '0')).join('')}`;

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

const WALLS = [3000, 2800, 3000, 2800];
const CEILING = 2600;
const known = (value) => ({ state: 'measured', value });
const survey = () => ({
  ceilingHeightMm: known(CEILING),
  walls: WALLS.map((l, i) => ({ id: `w${i + 1}`, lengthMm: known(l), turn: 'right', turnDeg: 90, openings: [], isRunWall: i === 0 })),
  comms: [],
  photos: [],
  clientNotes: '',
  steps: { ceiling: 'done', walls: 'done', openings: 'todo', comms: 'todo', photos: 'todo' },
  measuredBy: 'P3D',
  measuredAt: '2026-10-17',
});
const measurement = (stamp) => ({
  id: `m-${stamp}`,
  ceilingHeightMm: CEILING,
  walls: WALLS.map((l, i) => ({ id: `w${i + 1}`, lengthMm: l, angleDeg: 90, openings: [] })),
  comms: [],
  photos: [],
  measuredBy: 'P3D',
  measuredAt: '2026-10-17',
  notes: '',
});

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
async function tool(page, key) {
  const b = page.locator(`[data-studio-rail] [data-studio-tool="${key}"]`);
  if ((await b.count()) === 0) return false;
  await b.first().click({ timeout: 15_000 });
  await sleep(400);
  return true;
}
async function view(page, key) {
  const b = page.locator(`[data-studio-bottombar] [data-studio-view="${key}"]`);
  if ((await b.count()) === 0) return false;
  await b.first().click({ timeout: 15_000 });
  await sleep(600);
  return true;
}
async function sceneSettled(page) {
  const t0 = Date.now();
  const read = () =>
    page.evaluate(() => {
      const scene = document.querySelector('[data-studio-viewport] [data-scene]');
      const c = scene?.querySelector('canvas');
      const r = c?.getBoundingClientRect();
      return {
        state: scene?.getAttribute('data-scene-state') ?? null,
        failure: scene?.querySelector('[data-scene-failure-text]')?.textContent ?? null,
        root: Boolean(document.querySelector('[data-studio-root]')),
        canvas: r ? [Math.round(r.width), Math.round(r.height)] : null,
      };
    });
  let s = await read();
  while (Date.now() - t0 < 60_000 && s.root && s.state !== 'ready' && s.state !== 'failed') {
    await sleep(150);
    s = await read();
  }
  return { ...s, ms: Date.now() - t0 };
}
const sceneWords = (s) => `за ${s.ms} мс: ${s.state ?? 'НЕТ'}${s.failure ? ` «${s.failure}»` : ''} · холст ${s.canvas?.join('×') ?? 'НЕТ'}`;
const saveState = (page) => page.evaluate(() => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null);
const saved = (page) => waitFor(page, () => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null, (v) => v === 'saved', 30_000);
const look = (page) => page.evaluate(() => (window.__mwCadLook ? window.__mwCadLook() : null));
const layersNow = (page) => page.evaluate(() => (window.__mwCadLayers ? window.__mwCadLayers() : null));
const stray = (page) => page.evaluate(() => (window.__mwCadStray ? window.__mwCadStray() : null));
const schematicIds = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-studio-viewport] [data-schematic] [data-module-id]')].map((g) => g.getAttribute('data-module-id')),
  );
async function selectModule(page, id) {
  await tool(page, 'select');
  const b = page.locator(`[data-object-module="${id}"]`);
  if ((await b.count()) === 0) return false;
  await b.first().click();
  await sleep(500);
  await tool(page, 'furniture');
  return true;
}
async function clickPart(page, id) {
  const point = await page.evaluate((partId) => (window.__mwPartPoint ? window.__mwPartPoint(partId) : null), id);
  if (!point) return false;
  await page.mouse.click(point.x, point.y);
  await sleep(1200);
  return true;
}
async function preset(page, key) {
  const select = page.locator('[data-studio-viewport] [data-scene-preset-select]');
  if ((await select.count()) === 0) return false;
  await select.first().selectOption(key);
  await sleep(900);
  return true;
}
async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

/* ─────────────────────────  организация  ───────────────────────── */

async function withOrg(label, browser, body, contextOptions = { viewport: { width: 1440, height: 900 } }) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const made = { users: [], orgs: [], projects: [] };
  const makeUser = async (tag) => {
    const email = `${tag}-${stamp}@example.test`;
    const password = `Pw-${stamp}-${tag}!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    made.users.push(data.user.id);
    const { data: org, error: orgError } = await service.from('orgs').insert({ slug: `${tag}-${stamp}`, name: `Проверка ${label} ${tag}` }).select('id, name').single();
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
    const context = await browser.newContext(contextOptions);
    await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', sameSite: 'Lax' })));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    const seeded = await page.request.post(`${BASE}/api/catalog/seed-rates`, { data: { orgId: org.id } });
    if (!seeded.ok()) throw new Error(`типовой прайс не заведён: ${seeded.status()}`);
    return { org, page, context, errors };
  };
  const addProject = async (orgId, fields) => {
    const { data, error } = await service.from('projects').insert({ org_id: orgId, client_name: 'Проверка', status: 'in_progress', ...fields }).select('id').single();
    if (error) throw new Error(`insert project: ${error.message}`);
    made.projects.push(data.id);
    return data.id;
  };
  try {
    await body({ service, makeUser, addProject, stamp });
  } finally {
    for (const id of made.projects) await service.from('projects').delete().eq('id', id);
    for (const id of made.orgs) {
      await service.from('catalog_items').delete().eq('org_id', id);
      await service.from('catalog_categories').delete().eq('org_id', id);
      await service.from('orgs').delete().eq('id', id);
    }
    for (const id of made.users) await service.auth.admin.deleteUser(id);
    const left = [];
    for (const id of made.projects) if (((await service.from('projects').select('id').eq('id', id)).data ?? []).length) left.push(`объект ${id}`);
    for (const id of made.orgs) {
      if (((await service.from('orgs').select('id').eq('id', id)).data ?? []).length) left.push(`организация ${id}`);
      if (((await service.from('catalog_items').select('id').eq('org_id', id)).data ?? []).length) left.push(`позиции ${id}`);
    }
    check(`${label}: уборка временной организации проверена чтением`, left.length === 0, left.join(', ') || 'удалено');
  }
}

const fixture = () => {
  const path = process.env.FIXTURE;
  if (!path || !existsSync(path)) throw new Stop(`нет приспособления ряда: FIXTURE=${path ?? '—'}`);
  return JSON.parse(readFileSync(path, 'utf8'));
};

async function openStudio(page, projectId) {
  await page.goto(`${BASE}/project/${projectId}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
  await sleep(1500);
}
async function open3d(page) {
  await tool(page, 'furniture');
  await view(page, '3d');
  const s = await sceneSettled(page);
  await sleep(1200);
  return s;
}

/* ═════════════════════════  P0  ═════════════════════════ */

async function partP0(browser) {
  console.log('\n── P0. Объект владельца (копия): полосы посередине шкафа нет, ключи модулей уникальны');
  const from = process.env.CLONE_FROM;
  must('P0 объект для копии назван (CLONE_FROM)', Boolean(from), 'НЕ ПРОВЕРЕНО: нет CLONE_FROM — объект владельца не назван');
  await withOrg('P0', browser, async ({ service, makeUser, addProject }) => {
    const { data: source } = await service.from('projects').select('zone, measurements, millwork').eq('id', from).single();
    must('P0 объект владельца прочитан (только чтение)', Boolean(source), 'НУЛЕВОЙ СЕЛЕКТОР: объект не прочитан');
    const { org, page, errors } = await makeUser('p0');
    const id = await addProject(org.id, { address: 'Копия P0', zone: source.zone, measurements: source.measurements, millwork: source.millwork });
    await openStudio(page, id);
    const s = await open3d(page);
    must('P0 3D готова', s.state === 'ready', sceneWords(s));
    await shot(page, 'p0-owner-clone-design');
    const strays = await stray(page);
    const layers = await layersNow(page);
    check(
      'P0.1 в объекте владельца ни один меш ряда (цоколь, плиты, ниша) не входит в корпус модуля; полос ниши 0',
      Array.isArray(strays) && strays.length === 0 && layers?.niches === 0,
      strays === null ? 'НЕТ __mwCadStray' : `входит ${strays.length}: ${strays.slice(0, 3).map((x) => `${x.name}×${x.moduleId} ${x.depthMm} мм`).join(' | ') || '—'} · ниш ${layers?.niches}`,
    );
    await page.locator('[data-studio-viewport] [data-scene-mode]').first().click();
    await sleep(1500);
    await shot(page, 'p0-owner-clone-xray');
    const strayXray = await stray(page);
    check('P0.2 и в рентгене (прозрачный корпус) лишней полосы нет', Array.isArray(strayXray) && strayXray.length === 0, `входит ${strayXray?.length}`);
    await page.locator('[data-studio-viewport] [data-scene-mode]').first().click();
    await sleep(800);
    await view(page, 'facade');
    await sleep(800);
    const ids = await schematicIds(page);
    check('P0.3 ключи модулей на схеме уникальны (у владельца было два `upper-0@w1`)', ids.length > 0 && new Set(ids).size === ids.length, ids.join(' · '));
    await open3d(page);
    const mezzDoor = await page.evaluate(() => (window.__mwOpenableIds ? window.__mwOpenableIds() : []).filter((x) => /^(upper|mezz)-/.test(x)));
    if (mezzDoor.length > 0) {
      await clickPart(page, mezzDoor[mezzDoor.length - 1]);
      const open = await page.evaluate(() => (window.__mwOpenIds ? window.__mwOpenIds() : []));
      check('P0.4 нажатие на створку антресоли открывает ровно одну створку', open.length === 1, `открыто: ${open.join(', ') || '—'} из ${mezzDoor.join(', ')}`);
      await shot(page, 'p0-owner-clone-mezz-open');
    } else {
      check('P0.4 у копии есть створки антресоли', false, 'НУЛЕВОЙ СЕЛЕКТОР: створок антресоли нет');
    }
    check('P0 ошибок страницы нет', errors.length === 0, errors.slice(0, 2).join(' | '));
    const { data: original } = await service.from('projects').select('millwork').eq('id', from).single();
    check('P0 объект владельца не тронут: сохранённое состояние то же', JSON.stringify(original?.millwork) === JSON.stringify(source.millwork), 'сравнение до и после');
  });
}

/* ═════════════════════════  P1  ═════════════════════════ */

async function partP1(browser) {
  console.log('\n── P1. Вид 3D: предустановки и слои — состояние вида, объект не пишется');
  const fx = fixture();
  await withOrg('P1', browser, async ({ service, makeUser, addProject, stamp }) => {
    const { org, page, errors } = await makeUser('p1');
    const id = await addProject(org.id, {
      address: 'Проверка P1',
      zone: 'Спальня',
      measurements: measurement(stamp),
      millwork: { survey: survey(), requirements: fx.requirements, runs: { optimal: fx.run }, selectedVariant: 'optimal' },
    });
    /* Журнал записей объекта с открытия: кто писал — открытие или вид. */
    const opened = Date.now();
    const saveLog = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/projects/save')) saveLog.push(Date.now() - opened);
    });
    await openStudio(page, id);
    const s = await open3d(page);
    must('P1 3D готова', s.state === 'ready', sceneWords(s));
    await saved(page);
    /* Тишина 6 с: отложенная запись открытия (если она есть) приходит до замера, а не в него. */
    for (let quiet = 0; quiet < 40; quiet += 1) {
      const last = saveLog.length ? saveLog[saveLog.length - 1] : -1e9;
      if (Date.now() - opened - last > 6000) break;
      await sleep(500);
    }
    await saved(page);
    const millworkOf = async () => {
      const m = (await service.from('projects').select('millwork').eq('id', id).single()).data?.millwork ?? {};
      const { savedAt: _at, ...rest } = m;
      return JSON.stringify(rest);
    };
    const contentBefore = await millworkOf();
    const openingSaves = saveLog.length;
    const savedAt = async () => (await service.from('projects').select('millwork').eq('id', id).single()).data?.millwork?.savedAt ?? null;
    const before = await savedAt();
    const windowFrom = Date.now() - opened;

    const design = await layersNow(page);
    must('P1 есть __mwCadLayers и «Вид»', Boolean(design) && (await page.locator('[data-scene-preset-select]').count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: нет переключателя «Вид»');
    const designLook = await look(page);
    check(
      'P1.1 «Дизайн» по умолчанию: все слои, прозрачной мебели 0, рентген выключен',
      design.preset === 'design' && design.cutaway === false && designLook?.transparent === 0 && Object.values(design.layers).every(Boolean),
      `вид ${design.preset} · прозрачных ${designLook?.transparent} · коробок ${JSON.stringify(design.total)}`,
    );
    await shot(page, 'p1-design-closed');
    await page.locator('[data-open-all]').first().click();
    await sleep(2500);
    await shot(page, 'p1-design-open');
    const openIds = await page.evaluate(() => (window.__mwOpenIds ? window.__mwOpenIds() : []));
    check('P1.2 «Открыть всё» в «Дизайне»: створки и ящики открыты, внутри настоящее наполнение', openIds.length > 0, `открыто ${openIds.length}`);
    await page.locator('[data-close-all]').first().click();
    await sleep(1500);

    const counts = {};
    for (const key of ['frame', 'fill', 'fronts', 'hardware', 'design']) {
      must(`P1 предустановка ${key}`, await preset(page, key), 'НУЛЕВОЙ СЕЛЕКТОР: нет списка «Вид»');
      const l = await layersNow(page);
      counts[key] = l;
      await shot(page, `p1-preset-${key}`);
    }
    const shownOf = (l, layer) => l?.shown?.[layer] ?? 0;
    check(
      'P1.3 «Каркас»: корпус и перегородки есть, фасадов, полок, ящиков и фурнитуры в кадре 0; непрозрачно',
      counts.frame.preset === 'frame' && shownOf(counts.frame, 'carcass') > 0 && shownOf(counts.frame, 'fronts') === 0 && shownOf(counts.frame, 'shelves') === 0 && counts.frame.cutaway === false,
      JSON.stringify(counts.frame.shown),
    );
    check(
      'P1.4 «Наполнение»: корпуса и фасадов 0, полки, перегородки, ящики и штанга есть — экземпляров в кадре меньше, чем в «Дизайне»',
      shownOf(counts.fill, 'carcass') === 0 && shownOf(counts.fill, 'fronts') === 0 && shownOf(counts.fill, 'shelves') > 0 && shownOf(counts.fill, 'drawers') > 0 && counts.fill.instances < counts.design.instances,
      `${JSON.stringify(counts.fill.shown)} · экземпляров ${counts.fill.instances} при ${counts.design.instances}`,
    );
    check(
      'P1.5 «Фасады» — только фасады и их фурнитура; «Фурнитура» — только узлы',
      shownOf(counts.fronts, 'fronts') > 0 && shownOf(counts.fronts, 'carcass') === 0 && shownOf(counts.hardware, 'hardware') > 0 && shownOf(counts.hardware, 'fronts') === 0,
      `фасады ${JSON.stringify(counts.fronts.shown)} · фурнитура ${JSON.stringify(counts.hardware.shown)}`,
    );

    /* «Наполнение», полки выключены, ящики включены; потом корпус вернуть при снятых фасадах. */
    await preset(page, 'fill');
    await page.locator('[data-scene-layers-toggle]').first().click();
    await sleep(300);
    await page.locator('[data-scene-layer="shelves"]').first().click();
    await sleep(800);
    const noShelves = await layersNow(page);
    await shot(page, 'p1-fill-no-shelves');
    check(
      'P1.6 «Наполнение» без полок: полок 0, ящики на месте, набор назван «свой»',
      noShelves.preset === null && shownOf(noShelves, 'shelves') === 0 && shownOf(noShelves, 'drawers') > 0,
      JSON.stringify(noShelves.shown),
    );
    await page.locator('[data-scene-layer="carcass"]').first().click();
    await sleep(800);
    const carcassBack = await layersNow(page);
    await shot(page, 'p1-carcass-without-fronts');
    check('P1.7 корпус вернули, фасады сняты: корпус есть, фасадов 0', shownOf(carcassBack, 'carcass') > 0 && shownOf(carcassBack, 'fronts') === 0, JSON.stringify(carcassBack.shown));

    /* Рентген включили — и «Дизайн» его снимает. */
    await page.locator('[data-studio-viewport] [data-scene-mode]').first().click();
    await sleep(1200);
    const xray = await look(page);
    await shot(page, 'p1-xray-debug');
    await preset(page, 'design');
    await sleep(1200);
    const back = await look(page);
    const backLayers = await layersNow(page);
    check(
      'P1.8 рентген — отдельный отладочный вид (прозрачный корпус); выбор «Дизайн» снимает его: прозрачных снова 0',
      (xray?.transparent ?? 0) > 0 && back?.transparent === 0 && backLayers.cutaway === false && backLayers.preset === 'design',
      `рентген: прозрачных ${xray?.transparent} → «Дизайн»: ${back?.transparent}`,
    );
    await sleep(2500);
    const after = await savedAt();
    const saves = saveLog.filter((t) => t >= windowFrom).length;
    const contentAfter = await millworkOf();
    check(
      'P1.9 смена вида и слоёв объект не пишет: запросов сохранения за переключения 0, отметка записи и содержимое прежние',
      saves === 0 && after === before && contentAfter === contentBefore,
      `за переключения запросов ${saves} · ${before} → ${after} · содержимое ${contentAfter === contentBefore ? 'то же' : 'ДРУГОЕ'} · записей при открытии ${openingSaves} (мс от открытия: ${saveLog.slice(0, openingSaves).join(', ') || '—'})`,
    );

    for (const size of [
      { w: 1180, h: 820, touch: false },
      { w: 1024, h: 768, touch: true },
      { w: 390, h: 844, touch: true },
    ]) {
      const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, hasTouch: size.touch, isMobile: size.w < 500 });
      await ctx.addCookies(await page.context().cookies());
      const p = await ctx.newPage();
      await openStudio(p, id);
      const st = await open3d(p);
      const sel = p.locator('[data-studio-viewport] [data-scene-preset-select]');
      const box = (await sel.count()) > 0 ? await sel.first().boundingBox() : null;
      if (box && box.x + box.width > size.w) await sel.first().scrollIntoViewIfNeeded().catch(() => undefined);
      const box2 = (await sel.count()) > 0 ? await sel.first().boundingBox() : null;
      let switched = false;
      if (box2) {
        await sel.first().selectOption('fill');
        await sleep(900);
        switched = (await layersNow(p))?.preset === 'fill';
      }
      await p.screenshot({ path: `${OUT}/p1-${size.w}${size.touch ? '-touch' : ''}.png` });
      const pageWidth = await p.evaluate(() => document.documentElement.scrollWidth);
      check(
        `P1.10 ${size.w}×${size.h}${size.touch ? ' касанием' : ''}: 3D готова, «Вид» виден целиком и переключает, страница без сдвига вбок`,
        st.state === 'ready' && Boolean(box2) && box2.x >= 0 && box2.x + box2.width <= size.w + 1 && box2.height >= 40 && switched && pageWidth <= size.w + 1,
        `${sceneWords(st)} · «Вид» ${box2 ? `${Math.round(box2.x)}+${Math.round(box2.width)}×${Math.round(box2.height)}` : 'НЕТ'} · переключил ${switched} · ширина страницы ${pageWidth}`,
      );
      await ctx.close();
    }
    check('P1 ошибок страницы нет', errors.length === 0, errors.slice(0, 2).join(' | '));
  });
}

/* ═════════════════════════  P2  ═════════════════════════ */

async function partP2(browser) {
  console.log('\n── P2. Антресоль над шкафом: свой корпус, отказ в мм до нажатия, две позиции');
  const fx = fixture();
  await withOrg('P2', browser, async ({ service, makeUser, addProject, stamp }) => {
    const { org, page, errors } = await makeUser('p2');
    const id = await addProject(org.id, {
      address: 'Проверка P2',
      zone: 'Спальня',
      measurements: measurement(stamp),
      millwork: { survey: survey(), requirements: fx.requirements, runs: { optimal: fx.run }, selectedVariant: 'optimal' },
    });
    await openStudio(page, id);
    await open3d(page);
    await saved(page);
    must('P2 шкаф tall-0@w1 выбран', await selectModule(page, 'tall-0@w1'), 'НУЛЕВОЙ СЕЛЕКТОР: в списке объектов нет tall-0@w1');
    const editor = page.locator('[data-overhead-editor]');
    must('P2 карточка «Над шкафом: отдельный верхний корпус»', (await editor.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: карточки нет');
    const inner = await page.locator('[data-fill-editor]').textContent().catch(() => '');
    check('P2.1 внутренняя зона и корпус над шкафом названы по-разному', (await editor.first().textContent()).includes('Над шкафом') && !/Добавить антресоль/.test(inner ?? ''), '');
    const field = (key) => page.locator(`[data-overhead-field="${key}"]`).first();
    await field('height').fill('400');
    await field('base').fill('2500');
    await sleep(500);
    const refusal1 = await page.locator('[data-overhead-refusal]').first().textContent().catch(() => null);
    const disabled1 = await page.locator('[data-overhead-action="add"]').first().isDisabled();
    await shot(page, 'p2-refusal-to-ceiling');
    check(
      'P2.2 шкаф до потолка: до нажатия — «до потолка над шкафом 0 мм … не хватает 400 мм», кнопка закрыта',
      Boolean(refusal1) && /до потолка над шкафом 0 мм/.test(refusal1) && /не хватает 400 мм/.test(refusal1) && disabled1,
      refusal1 ?? 'НЕТ СЛОВ',
    );
    await field('base').fill('2000');
    await field('height').fill('700');
    await sleep(500);
    const refusal2 = await page.locator('[data-overhead-refusal]').first().textContent().catch(() => null);
    check('P2.3 шкаф 2000 + антресоль 700 при потолке 2600: «до потолка над шкафом 500 мм — не хватает 200 мм»', Boolean(refusal2) && /500 мм/.test(refusal2) && /не хватает 200 мм/.test(refusal2), refusal2 ?? 'НЕТ СЛОВ');
    await field('height').fill('400');
    await sleep(500);
    const ok = await page.locator('[data-overhead-ok]').first().textContent().catch(() => '');
    check('P2.4 400 × шкаф 2000: до нажатия названо «шкаф опустится 2500 → 2000» и верх антресоли', /2500 → 2000/.test(ok ?? '') && /2500 мм от пола/.test(ok ?? ''), ok ?? '');
    await page.locator('[data-overhead-action="add"]').first().click();
    await sleep(1500);
    await saved(page);
    const lay = await layersNow(page);
    const ids = await page.evaluate(() => (window.__mwOpenableIds ? window.__mwOpenableIds() : []));
    const overDoors = ids.filter((x) => x.startsWith('over-0@w1:'));
    check('P2.5 антресоль встала: в сцене свои створки over-0@w1, коробок корпуса больше', overDoors.length > 0, `створки ${overDoors.join(', ') || 'НЕТ'} · коробок ${JSON.stringify(lay?.total)}`);
    await shot(page, 'p2-overhead-added');
    const strays = await stray(page);
    check('P2.6 ничего не входит в корпуса: антресоль стоит на крыше шкафа', Array.isArray(strays) && strays.length === 0, `входит ${strays?.length}`);

    /*
     * Открыть створку антресоли при выдвинутом ящике — без перекрёстных
     * срабатываний. Ящики отсека стоят ЗА створкой шкафа: сначала створка,
     * потом ящик, потом створка антресоли — три нажатия, три детали.
     */
    const drawer = ids.find((x) => x.startsWith('tall-900@w1:') && x.includes(':drawer:'));
    const cover = ids.filter((x) => x.startsWith('tall-900@w1:door:')).pop();
    must('P2.7 у шкафа рядом есть створка и ящик', Boolean(drawer && cover), `створка ${cover ?? 'НЕТ'} · ящик ${drawer ?? 'НЕТ'}`);
    await clickPart(page, cover);
    await clickPart(page, drawer);
    await clickPart(page, overDoors[0]);
    const open = await page.evaluate(() => (window.__mwOpenIds ? window.__mwOpenIds() : []));
    await shot(page, 'p2-overhead-door-open-drawer-out');
    check(
      'P2.7 три нажатия — три детали: створка шкафа, его ящик и створка антресоли; створки шкафа под антресолью закрыты',
      open.length === 3 && open.includes(cover) && open.includes(drawer) && open.includes(overDoors[0]) && !open.some((x) => x.startsWith('tall-0@w1:')),
      `открыто: ${open.join(', ')}`,
    );
    await page.locator('[data-close-all]').first().click();
    await sleep(800);

    /* Чертёж: два корпуса; раскрой — две позиции. */
    await view(page, 'facade');
    await sleep(800);
    const sch = await schematicIds(page);
    await shot(page, 'p2-schematic-two-units');
    check('P2.8 на схеме два корпуса: шкаф tall-0@w1 и антресоль over-0@w1', sch.includes('tall-0@w1') && sch.includes('over-0@w1'), sch.join(' · '));
    await page.locator('[data-studio-open="panels"]').first().click();
    await sleep(1500);
    const panelText = await page.locator('[data-studio-panels]').first().textContent().catch(() => '');
    await shot(page, 'p2-panels');
    check('P2.9 в деталировке — детали антресоли отдельной позицией', /Антресоль над шкафом/.test(panelText ?? ''), (panelText ?? '').slice(0, 160));

    /* Сохранить → открыть. */
    const { data: row } = await service.from('projects').select('millwork').eq('id', id).single();
    const savedRun = row?.millwork?.runs?.optimal;
    const savedOver = savedRun?.upperSegments?.flatMap((s) => s.modules).find((m) => m.overhead);
    check(
      'P2.10 записано в объект: антресоль over-0@w1 400 мм, глубина своя; шкаф 2000',
      savedOver?.id === 'over-0@w1' && savedOver?.heightMm === 400 && savedRun.modules.find((m) => m.id === 'tall-0@w1')?.heightMm === 2000,
      `${savedOver?.id} h${savedOver?.heightMm} d${savedOver?.overhead?.depthMm}`,
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
    await sleep(1500);
    await open3d(page);
    const idsAfter = await page.evaluate(() => (window.__mwOpenableIds ? window.__mwOpenableIds() : []));
    await shot(page, 'p2-after-reload');
    check('P2.11 после перезагрузки антресоль на месте с тем же ключом', idsAfter.some((x) => x.startsWith('over-0@w1:')), `створок антресоли ${idsAfter.filter((x) => x.startsWith('over-0@w1:')).length}`);
    check('P2 ошибок страницы нет', errors.length === 0, errors.slice(0, 2).join(' | '));
  });
}

/* ═════════════════════════  P3  ═════════════════════════ */

async function partP3(browser) {
  console.log('\n── P3. EGGER и GRANDEX: показ импорта, запись, повтор, Studio, 3D, смета, админка');
  const fx = fixture();
  await withOrg('P3', browser, async ({ service, makeUser, addProject, stamp }) => {
    const a = await makeUser('p3a');
    const b = await makeUser('p3b');
    const page = a.page;
    const bedroom = await addProject(a.org.id, {
      address: 'Проверка P3 спальня',
      zone: 'Спальня',
      measurements: measurement(stamp),
      millwork: { survey: survey(), requirements: fx.requirements, runs: { optimal: fx.run }, selectedVariant: 'optimal' },
    });
    await openStudio(page, bedroom);
    await open3d(page);
    await saved(page);
    must('P3 инструмент «Материалы»', await tool(page, 'materials'), 'НУЛЕВОЙ СЕЛЕКТОР: инструмента «Материалы» нет');
    await page.waitForSelector('[data-materials-panel][data-loaded="1"]', { timeout: 30_000 });
    const countA = async () => (await service.from('catalog_items').select('id', { count: 'exact', head: true }).eq('org_id', a.org.id)).count;
    const before = await countA();
    must('P3 блок «Каталоги поставщиков на проверке»', (await page.locator('[data-review-import]').count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: блока нет');
    await page.locator('[data-review-preview]').first().click();
    await page.waitForSelector('[data-review-preview-result]', { timeout: 30_000 });
    const num = async (sel) => Number((await page.locator(sel).first().textContent()) ?? 'NaN');
    const first = { fresh: await num('[data-preview-fresh]'), exists: await num('[data-preview-exists]'), unpriced: await num('[data-preview-unpriced]'), conflict: await num('[data-preview-conflict]') };
    await shot(page, 'p3-import-preview');
    check(
      'P3.1 показ до записи: новых 337, уже есть 0, без цены 337, конфликтов 0 — и в каталог ничего не записано',
      first.fresh === 337 && first.exists === 0 && first.unpriced === 337 && first.conflict === 0 && (await countA()) === before,
      `${JSON.stringify(first)} · строк в каталоге ${before} → ${await countA()}`,
    );

    /* Чужая организация: записать в каталог А нельзя. */
    const foreign = await b.page.request.post(`${BASE}/api/catalog/materials`, { data: { orgId: a.org.id, collections: ['egger-ldsp'], confirm: true } });
    const afterForeign = await countA();
    check('P3.2 сотрудник организации Б в каталог А не пишет: ответ — ошибка, строк в А не прибавилось', !foreign.ok() && afterForeign === before, `ответ ${foreign.status()} · строк ${before} → ${afterForeign}`);
    const unconfirmed = await page.request.post(`${BASE}/api/catalog/materials`, { data: { orgId: a.org.id, collections: ['egger-ldsp'] } });
    check('P3.3 запись коллекции на проверке без подтверждения — отказ словами', unconfirmed.status() === 409 && (await countA()) === before, `ответ ${unconfirmed.status()}`);

    await page.locator('[data-review-import-confirm]').first().click();
    await waitFor(page, () => document.querySelector('[data-material-notice]')?.textContent ?? '', (t) => /Загружено/.test(t), 60_000);
    const afterImport = await countA();
    await page.locator('[data-review-preview]').first().click();
    await page.waitForSelector('[data-review-preview-result]', { timeout: 30_000 });
    const second = { fresh: await num('[data-preview-fresh]'), exists: await num('[data-preview-exists]') };
    await page.locator('[data-review-preview-result] button:has-text("Отмена")').first().click();
    const bPreview = await b.page.request.post(`${BASE}/api/catalog/materials`, { data: { orgId: b.org.id, collections: ['egger-ldsp', 'egger-perfectsense', 'egger-worktops', 'grandex-acrylic'], dryRun: true } });
    const bFresh = (await bPreview.json())?.preview?.fresh;
    check(
      'P3.4 записано 337; повторный показ — новых 0, уже есть 337; у организации Б свой каталог — у неё 337 новых',
      afterImport - before === 337 && second.fresh === 0 && second.exists === 337 && bFresh === 337,
      `строк ${before} → ${afterImport} · повтор: новых ${second.fresh}, есть ${second.exists} · Б новых ${bFresh}`,
    );

    /* Фильтр производителя и поиск. */
    await page.locator('[data-material-target="module-carcass"]').first().click();
    await page.locator('[data-material-brand="EGGER"]').first().click();
    await page.locator('[data-material-tab="ldsp"]').first().click().catch(() => undefined);
    await sleep(500);
    const brands = await page.evaluate(() => [...document.querySelectorAll('[data-material-item]')].map((n) => n.getAttribute('data-brand')));
    check('P3.5 фильтр EGGER: в списке только EGGER', brands.length > 0 && brands.every((x) => x === 'EGGER'), `${brands.length} строк · ${[...new Set(brands)].join(',')}`);
    await shot(page, 'p3-egger-filter');

    /* EGGER на корпус левого шкафа, другой декор — на его фасад. */
    must('P3 выбран левый шкаф', await selectModule(page, 'tall-0@w1'), 'НУЛЕВОЙ СЕЛЕКТОР: tall-0@w1');
    await tool(page, 'materials');
    await page.locator('[data-material-target="module-carcass"]').first().click();
    await page.locator('[data-material-brand="EGGER"]').first().click();
    await page.locator('[data-material-search]').first().fill('EGGER-W');
    await sleep(500);
    const carcassItem = await page.locator('[data-material-item][data-brand="EGGER"]').first().getAttribute('data-material-item');
    await page.locator('[data-material-item][data-brand="EGGER"]').first().click();
    await sleep(1200);
    await page.locator('[data-material-target="module"]').first().click();
    await page.locator('[data-material-search]').first().fill('EGGER-H');
    await sleep(500);
    const frontItem = await page.locator('[data-material-item][data-brand="EGGER"]').first().getAttribute('data-material-item');
    await page.locator('[data-material-item][data-brand="EGGER"]').first().click();
    await sleep(1200);
    await shot(page, 'p3-egger-card');
    await saved(page);
    const hexOf = async (article) => (await service.from('catalog_items').select('id, meta').eq('org_id', a.org.id).eq('article', article).single()).data;
    const carcassRow = await hexOf(carcassItem);
    const frontRow = await hexOf(frontItem);
    await tool(page, 'furniture');
    await view(page, '3d');
    await sceneSettled(page);
    await preset(page, 'design');
    await sleep(1200);
    const l3 = await look(page);
    await shot(page, 'p3-egger-design-3d');
    check(
      `P3.6 «Дизайн»: корпус левого шкафа — ${carcassItem} (${carcassRow?.meta?.color}, на экране тоном корпуса ${carcassRow ? carcassTone(carcassRow.meta.color) : "—"}), фасад — ${frontItem} (${frontRow?.meta?.color}); цвет — с экрана`,
      Boolean(carcassRow && frontRow) && carcassItem !== frontItem && l3?.carcassColors?.includes(carcassTone(carcassRow.meta.color)) && l3?.frontColors?.includes(frontRow.meta.color),
      `корпус ${l3?.carcassColors?.join(',')} · фасады ${l3?.frontColors?.join(',')}`,
    );
    const { data: savedRow } = await service.from('projects').select('millwork').eq('id', bedroom).single();
    const left = savedRow?.millwork?.runs?.optimal?.modules?.find((m) => m.id === 'tall-0@w1');
    const right = savedRow?.millwork?.runs?.optimal?.modules?.find((m) => m.id === 'tall-900@w1');
    check(
      'P3.7 в объекте ссылки на позиции, а не копии: корпус и фасад левого шкафа — id позиций каталога; правый шкаф не тронут',
      left?.carcassItemId === carcassRow?.id && left?.front?.itemId === frontRow?.id && !right?.carcassItemId && !right?.front?.itemId,
      `левый ${left?.carcassItemId}/${left?.front?.itemId} · правый ${right?.carcassItemId ?? '—'}/${right?.front?.itemId ?? '—'}`,
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
    await sleep(1500);
    await open3d(page);
    await sleep(1500);
    const l4 = await look(page);
    await shot(page, 'p3-egger-after-reload');
    check('P3.8 после перезагрузки те же цвета корпуса и фасада', l4?.carcassColors?.includes(carcassTone(carcassRow?.meta?.color ?? "#000000")) && l4?.frontColors?.includes(frontRow?.meta?.color), `${l4?.carcassColors} · ${l4?.frontColors}`);

    /* GRANDEX в спальне — отказ словами. */
    await tool(page, 'materials');
    await page.waitForSelector('[data-materials-panel][data-loaded="1"]', { timeout: 30_000 });
    await page.locator('[data-material-target="countertop"]').first().click();
    await page.locator('[data-material-brand="GRANDEX"]').first().click();
    await page.locator('[data-material-search]').first().fill('');
    await sleep(500);
    await page.locator('[data-material-item][data-brand="GRANDEX"]').first().click();
    await sleep(800);
    const bedNotice = await page.locator('[data-material-notice]').first().textContent().catch(() => '');
    await shot(page, 'p3-grandex-bedroom-refusal');
    check('P3.9 GRANDEX в спальне: «столешницы нет — класть её некуда», к полкам и корпусу не цепляется', /столешницы нет/.test(bedNotice ?? ''), bedNotice ?? '');

    /* Кухня той же организации: GRANDEX на столешницу, смета без цены. */
    const kitchen = await addProject(a.org.id, {
      address: 'Проверка P3 кухня',
      zone: 'Кухня',
      measurements: measurement(stamp + 1),
      millwork: { survey: survey(), templateId: 'linear-standard' },
    });
    await openStudio(page, kitchen);
    await open3d(page);
    await saved(page);
    await tool(page, 'materials');
    await page.waitForSelector('[data-materials-panel][data-loaded="1"]', { timeout: 30_000 });
    await page.locator('[data-material-target="countertop"]').first().click();
    await page.locator('[data-material-brand="GRANDEX"]').first().click();
    await sleep(400);
    const topItem = await page.locator('[data-material-item][data-brand="GRANDEX"]').first().getAttribute('data-material-item');
    await page.locator('[data-material-item][data-brand="GRANDEX"]').first().click();
    await sleep(1500);
    await shot(page, 'p3-grandex-kitchen-card');
    const topRow = await hexOf(topItem);
    await tool(page, 'furniture');
    await view(page, '3d');
    await sceneSettled(page);
    await sleep(1200);
    const l5 = await look(page);
    await shot(page, 'p3-grandex-kitchen-3d');
    check(`P3.10 кухня: столешница — ${topItem} (${topRow?.meta?.color}), цвет плиты с экрана`, l5?.counterColors?.includes(topRow?.meta?.color), `плиты ${l5?.counterColors?.join(',')}`);
    await page.locator('[data-studio-open="estimate"]').first().click().catch(() => undefined);
    await sleep(1200);
    const body = await page.evaluate(() => document.body.innerText);
    await shot(page, 'p3-grandex-estimate');
    check('P3.11 смета: строка столешницы «цена не задана», итог «неполный»', /цена не задана/.test(body) && /неполн/.test(body), (body.match(/[^\n]*цена не задана[^\n]*/) ?? ['—'])[0].slice(0, 160));

    /* Админка: EGGER по коду. */
    await page.goto(`${BASE}/admin/catalog`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-admin-search]', { timeout: 60_000 });
    await page.locator('[data-admin-search]').first().fill(carcassItem);
    await sleep(800);
    const found = await page.locator('[data-admin-found]').first().textContent().catch(() => '');
    await shot(page, 'p3-admin-search');
    check(`P3.12 /admin/catalog находит ${carcassItem} поиском по коду`, /Найдено по всем категориям: [1-9]/.test(found ?? ''), found ?? '');
    check('P3 ошибок страницы нет', a.errors.length === 0, a.errors.slice(0, 2).join(' | '));
  });
}

/* ═════════════════════════  жизненный цикл  ═════════════════════════ */

async function partLife() {
  console.log('\n── LIFE. Холст без WebGL: «failed» словами, Studio жива');
  const fx = fixture();
  const noGl = await chromium.launch({ args: ['--disable-3d-apis', '--disable-webgl', '--disable-webgl2'] });
  try {
    await withOrg('LIFE', noGl, async ({ makeUser, addProject, stamp }) => {
      const { org, page, errors } = await makeUser('life');
      const id = await addProject(org.id, {
        address: 'Проверка LIFE',
        zone: 'Спальня',
        measurements: measurement(stamp),
        millwork: { survey: survey(), requirements: fx.requirements, runs: { optimal: fx.run }, selectedVariant: 'optimal' },
      });
      await openStudio(page, id);
      const s = await open3d(page);
      await shot(page, 'life-no-webgl');
      check(
        'LIFE.1 без WebGL: состояние «failed», причина словами, Studio жива',
        s.state === 'failed' && Boolean(s.failure) && s.root && errors.length === 0,
        `${sceneWords(s)}${errors.length ? ` · ошибки страницы: ${errors.slice(0, 3).join(' | ')}` : ''}`,
      );
    });
  } finally {
    await noGl.close();
  }
}

/* ═════════════════════════  запуск  ═════════════════════════ */

const unknownParts = PARTS.filter((p) => !KNOWN.includes(p));
if (unknownParts.length > 0) {
  console.log(`Неизвестные части: ${unknownParts.join(', ')} — есть ${KNOWN.join(', ')}`);
  process.exit(1);
}
loadEnv();
mkdirSync(OUT, { recursive: true });
freePort(PORT);
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { stdio: 'ignore', shell: true, env: { ...process.env, SITE_PASSWORD: '' } });
let browser;
const done = [];
try {
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
      if (part === 'p0') await partP0(browser);
      if (part === 'p1') await partP1(browser);
      if (part === 'p2') await partP2(browser);
      if (part === 'p3') await partP3(browser);
      if (part === 'life') await partLife();
      done.push(part);
    } catch (error) {
      check(`${part}: дошла до конца`, false, error instanceof Error ? error.message : String(error));
    }
  }
} finally {
  await browser?.close();
  server.kill();
  try {
    execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' });
  } catch {
    /* сервер уже остановлен */
  }
  freePort(PORT);
}
check(`части дошли до конца: ${done.join(', ') || '—'} из ${PARTS.join(', ')}`, done.length === PARTS.length);
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
