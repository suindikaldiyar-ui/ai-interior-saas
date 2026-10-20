/**
 * ПРИЁМКА КАТАЛОГА KIRA В БРАУЗЕРЕ (слой 58) — на настоящей организации.
 *
 * Запуск (после `npm run build`): `node scripts/check-kira.mjs`
 *   PART=import — импорт моделей в каталог: «Модели KIRA» в /admin/catalog →
 *     таблица «что ляжет» по категориям → «Загрузить»; повтор маршрутом —
 *     ни строки; чужая организация в наш каталог не пишет (RLS).
 *   PART=flow — планшет 1024 × 768: шкаф → дверь 2 → «МДФ фасады» → KIRA:
 *     категории, поиск, фильтр, виртуальный список и картинки по мере
 *     прокрутки, увеличенный вид → «Применить» ИР 1 → цвет RAL → 3D: рисунок
 *     модели на одной двери, скобы на ней нет, корпус тот же → открыть и
 *     закрыть → сохранить → перезагрузить; рама витрины на глухой шкаф —
 *     отказ словами; ошибок страницы и консоли нет.
 * Временная организация заводится служебным ключом и удаляется; уборка
 * проверяется чтением. Фото производителя в проверке не участвуют.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_KIRA ?? 3284);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/kira-browser';
const PARTS = (process.env.PART ?? 'import,flow').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['import', 'flow'];
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

/* ─────────────────────────  замер и ряд  ───────────────────────── */

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
  measuredBy: 'KIRA',
  measuredAt: '2026-10-20',
});
const measurement = (stamp) => ({
  id: `m-${stamp}`,
  ceilingHeightMm: CEILING,
  walls: WALLS.map((l, i) => ({ id: `w${i + 1}`, lengthMm: l, angleDeg: 90, openings: [] })),
  comms: [],
  photos: [],
  measuredBy: 'KIRA',
  measuredAt: '2026-10-20',
  notes: '',
});
/** Шкаф спальни 900 + 1000 по две створки — тот же ряд путём экрана, что у приёмки P3D-MDF. */
function fixtureRun() {
  const out = execSync('npx tsx scripts/mdf-look-fixture.ts', {
    input: JSON.stringify({ states: { s0: { ops: [] } } }),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(out);
}
const RAL = { code: 'RAL 160 40 15', hex: '#466353' };
const EXPECTED = { prostfrez: 12, viborka: 28, rify: 15, moldingi: 1, vitrina: 5, integra: 7 };

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
      return { state: scene?.getAttribute('data-scene-state') ?? null, root: Boolean(document.querySelector('[data-studio-root]')) };
    });
  let s = await read();
  while (Date.now() - t0 < 60_000 && s.root && s.state !== 'ready' && s.state !== 'failed') {
    await sleep(150);
    s = await read();
  }
  return { ...s, ms: Date.now() - t0 };
}
const saved = (page) => waitFor(page, () => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null, (v) => v === 'saved', 30_000);
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
const reliefs = (page) => page.evaluate(() => (window.__mwCadReliefs ? window.__mwCadReliefs() : null));
const metal = (page) => page.evaluate(() => (window.__mwCadMetal ? window.__mwCadMetal() : null));
const surfaces = (page) => page.evaluate(() => (window.__mwCadSurfaces ? window.__mwCadSurfaces() : null));
const closedReliefs = (list) => (list ?? []).filter((r) => !r.moving);
const lin = (hex) =>
  [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

/* ─────────────────────────  организация  ───────────────────────── */

async function withOrgs(label, browser, body, { viewport = { width: 1024, height: 768 } } = {}) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const made = { users: [], orgs: [], projects: [] };
  const makeUser = async (tag, { ral = false } = {}) => {
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
    const context = await browser.newContext({ viewport });
    await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', sameSite: 'Lax' })));
    const page = await context.newPage();
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
    });
    /* Запросы каталога KIRA — в журнал: статус, время и отказы сети. */
    page.on('requestfailed', (r) => {
      if (r.url().includes('/api/')) console.log(`    сеть: ${r.method()} ${r.url().replace(BASE, '')} — ОТКАЗ ${r.failure()?.errorText ?? ''}`);
    });
    page.on('requestfinished', async (r) => {
      if (!r.url().includes('/api/catalog/kira')) return;
      const response = await r.response().catch(() => null);
      console.log(`    сеть: ${r.method()} ${r.url().replace(BASE, '')} — ${response?.status() ?? '?'} за ${Math.round(r.timing().responseEnd)} мс`);
    });
    const seeded = await page.request.post(`${BASE}/api/catalog/seed-rates`, { data: { orgId: org.id } });
    if (!seeded.ok()) throw new Error(`типовой прайс не заведён: ${seeded.status()}`);
    if (ral) {
      const imported = await page.request.post(`${BASE}/api/catalog/materials`, { data: { orgId: org.id, collections: ['ral-design'], confirm: true }, timeout: 120_000 });
      if (!imported.ok()) throw new Error(`RAL не загружен: ${imported.status()}`);
    }
    return { org, page, errors, consoleErrors };
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
    for (const id of made.orgs) {
      if (((await service.from('orgs').select('id').eq('id', id)).data ?? []).length) left.push(`организация ${id}`);
      if (((await service.from('catalog_items').select('id').eq('org_id', id)).data ?? []).length) left.push(`позиции ${id}`);
    }
    check(`${label}: уборка временных организаций проверена чтением`, left.length === 0, left.join(', ') || 'удалено');
  }
}

const kiraRows = async (service, orgId) =>
  ((await service.from('catalog_items').select('id, article, price, name_ru, meta').eq('org_id', orgId).like('article', 'KIRA-%')).data ?? []);

/* ═════════════════════════  IMPORT  ═════════════════════════ */

async function partImport(browser) {
  console.log('\n── IMPORT: «Модели KIRA» в /admin/catalog → что ляжет → «Загрузить»; повтор; чужая организация');
  await withOrgs('IMPORT', browser, async ({ service, makeUser }) => {
    const { org, page, errors, consoleErrors } = await makeUser('kira-i');
    await page.goto(`${BASE}/admin/catalog`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const button = page.locator('[data-admin-kira]');
    await button.first().waitFor({ timeout: 60_000 }).catch(() => undefined);
    must('IMPORT кнопка «Модели KIRA» в каталоге', (await button.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-admin-kira]');
    /* Кнопка из серверной разметки жмётся только ожившей: ждём гидратацию (React вешает обработчики на корень). */
    await page.waitForFunction(() => Boolean(document.querySelector('[data-admin-kira]') && Object.keys(document.querySelector('[data-admin-kira]')).some((k) => k.startsWith('__reactProps'))), undefined, { timeout: 60_000 }).catch(() => undefined);
    await button.first().click();
    await page.waitForSelector('[data-admin-kira-plan]', { timeout: 60_000 }).catch(() => undefined);
    const importNotice = await page.evaluate(() => Array.from(document.querySelectorAll('span')).map((s) => s.textContent ?? '').find((t) => /KIRA|ляжет/.test(t)) ?? null);
    if (importNotice) console.log(`    на экране: «${importNotice.slice(0, 160)}»`);
    const plan = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-admin-kira-row]')).map((tr) => ({
        key: tr.getAttribute('data-admin-kira-row'),
        cells: Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? ''),
      })),
    );
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/import-plan.png`, timeout: 120_000 });
    const found = Object.fromEntries(plan.map((row) => [row.key, Number(row.cells[1])]));
    const inserts = plan.reduce((s, row) => s + Number(row.cells[2]), 0);
    check(
      'IMPORT.1 «что ляжет» до записи: по категориям сайта 12 / 28 / 15 / 1 / 5 / 7 и СЛ 9 вне их; новых 69 (в каждой строке новых столько же, сколько найдено), обновлять нечего; в каталоге до нажатия «Загрузить» ни одной модели',
      Object.entries(EXPECTED).every(([key, n]) => found[key] === n) &&
        found.other === 1 &&
        plan.every((row) => row.cells[1] === row.cells[2] && row.cells[3] === '0') &&
        inserts === 69 &&
        (await kiraRows(service, org.id)).length === 0,
      plan.map((row) => `${row.key}: ${row.cells.slice(1).join('/')}`).join(' · ') || 'НУЛЕВОЙ СЕЛЕКТОР: [data-admin-kira-row]',
    );
    await page.locator('[data-admin-kira-confirm]').first().click();
    const rows = await (async () => {
      const until = Date.now() + 60_000;
      let list = await kiraRows(service, org.id);
      while (list.length < 69 && Date.now() < until) {
        await sleep(500);
        list = await kiraRows(service, org.id);
      }
      return list;
    })();
    const relief = rows.filter((row) => row.meta?.milling?.relief).length;
    const cardOnly = rows.filter((row) => !row.meta?.milling && row.meta?.provenance?.preview === '3D_PREVIEW_NOT_AVAILABLE').length;
    check(
      'IMPORT.2 «Загрузить»: в каталоге организации 69 моделей, артикулы без повторов; с рисунком 65, только карточка 4; цены нет ни у одной; происхождение — KIRA, VISUAL_ONLY, права NOT_VERIFIED; картинки производителя в строках нет',
      rows.length === 69 &&
        new Set(rows.map((row) => row.article)).size === 69 &&
        relief === 65 &&
        cardOnly === 4 &&
        rows.every((row) => Number(row.price) === 0) &&
        rows.every((row) => row.meta?.provenance?.manufacturer === 'KIRA' && row.meta.provenance.visualStatus === 'VISUAL_ONLY' && row.meta.provenance.rightsStatus === 'NOT_VERIFIED') &&
        !JSON.stringify(rows).includes('data:image'),
      `строк ${rows.length} · с рисунком ${relief} · только карточка ${cardOnly}`,
    );

    /* Компания назначила цену и переименовала позицию — повтор их не трогает. */
    const rib = rows.find((row) => row.article === 'KIRA-RIF-2');
    must('IMPORT позиция KIRA-RIF-2 в каталоге', Boolean(rib), 'НУЛЕВОЙ СЕЛЕКТОР: KIRA-RIF-2');
    await service.from('catalog_items').update({ price: 31000, name_ru: 'РИФ 2 — наш', meta: { ...rib.meta, note: 'своё' } }).eq('id', rib.id);
    const again = await page.request.post(`${BASE}/api/catalog/kira`, { data: { orgId: org.id, dryRun: true } });
    const againBody = await again.json();
    const write = await page.request.post(`${BASE}/api/catalog/kira`, { data: { orgId: org.id, confirm: true } });
    const writeBody = await write.json();
    const after = await kiraRows(service, org.id);
    const ribAfter = after.find((row) => row.article === 'KIRA-RIF-2');
    const unconfirmed = await page.request.post(`${BASE}/api/catalog/kira`, { data: { orgId: org.id } });
    check(
      'IMPORT.3 повтор ничего не добавляет и не переписывает: новых 0, без изменений 69; цена, название и своё поле компании у позиции те же; запись без показа «что ляжет» отклонена словами',
      again.ok() &&
        againBody.insert === 0 &&
        againBody.unchanged === 69 &&
        write.ok() &&
        writeBody.added === 0 &&
        writeBody.updated === 0 &&
        after.length === 69 &&
        Number(ribAfter?.price) === 31000 &&
        ribAfter?.name_ru === 'РИФ 2 — наш' &&
        ribAfter?.meta?.note === 'своё' &&
        unconfirmed.status() === 409,
      `повтор: новых ${againBody.insert}, без изменений ${againBody.unchanged}; запись: добавлено ${writeBody.added}, обновлено ${writeBody.updated} · цена ${ribAfter?.price} «${ribAfter?.name_ru}» · без показа: ${unconfirmed.status()}`,
    );

    /* Чужая организация: тот же маршрут с нашим orgId. */
    const stranger = await makeUser('kira-x');
    const foreign = await stranger.page.request.post(`${BASE}/api/catalog/kira`, { data: { orgId: org.id, confirm: true } });
    const foreignBody = await foreign.json().catch(() => ({}));
    const ours = await kiraRows(service, org.id);
    const theirs = await kiraRows(service, stranger.org.id);
    check(
      'IMPORT.4 чужая организация в наш каталог не пишет: запрос с нашим orgId отклонён словами (403, «каталог другой организации»), у нас по-прежнему 69 позиций с нашей ценой, у неё — ни одной',
      foreign.status() === 403 && /другой организации/.test(String(foreignBody.error ?? '')) && ours.length === 69 && Number(ours.find((row) => row.article === 'KIRA-RIF-2')?.price) === 31000 && theirs.length === 0,
      `ответ ${foreign.status()}: ${String(foreignBody.error ?? '').slice(0, 120)} · у нас ${ours.length} · у чужой ${theirs.length}`,
    );
    check('IMPORT ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 2).join(' | '));
  });
}

/* ═════════════════════════  FLOW (планшет)  ═════════════════════════ */

async function partFlow(browser) {
  console.log('\n── FLOW (1024 × 768): шкаф → дверь 2 → «МДФ фасады» → KIRA → ИР 1 → RAL → 3D → открыть/закрыть → сохранить → перезагрузить');
  await withOrgs('FLOW', browser, async ({ service, makeUser, addProject, stamp }) => {
    const { org, page, errors, consoleErrors } = await makeUser('kira-f', { ral: true });
    const imported = await page.request.post(`${BASE}/api/catalog/kira`, { data: { orgId: org.id, confirm: true }, timeout: 120_000 });
    must('FLOW модели KIRA заведены в каталог', imported.ok(), `импорт: ${imported.status()}`);
    const fx = fixtureRun();
    const id = await addProject(org.id, {
      address: 'Проверка KIRA',
      zone: 'Спальня',
      measurements: measurement(stamp),
      millwork: { survey: survey(), requirements: fx.requirements, runs: { optimal: fx.runs.s0 }, selectedVariant: 'optimal' },
    });
    await openStudio(page, id);
    const s0 = await open3d(page);
    must('FLOW 3D готова', s0.state === 'ready', `${s0.state} за ${s0.ms} мс`);
    await saved(page);
    const metalBefore = await metal(page);
    const surfacesBefore = await surfaces(page);
    must('FLOW металл на фасадах читается со сцены', typeof metalBefore === 'number' && metalBefore > 0, `__mwCadMetal: ${metalBefore}`);

    /* Шкаф и дверь 2. */
    must('FLOW инструмент «Выбор»', await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="select"]');
    const cabinet = page.locator('[data-object-module="tall-0@w1"]');
    must('FLOW шкаф в списке объектов', (await cabinet.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-object-module="tall-0@w1"]');
    await cabinet.first().click();
    await sleep(500);
    must('FLOW инструмент «Материалы»', await tool(page, 'materials'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="materials"]');
    await page.waitForSelector('[data-materials-panel][data-loaded="1"]', { timeout: 60_000 }).catch(() => undefined);
    await page.locator('[data-material-target="leaf"]').first().click();
    await sleep(400);
    await page.locator('[data-material-leaf="door:1"]').first().click();
    await sleep(400);
    await page.locator('[data-material-tab="mdf_facade"]').first().click();
    await sleep(400);
    const opener = page.locator('[data-kira-open]');
    must('FLOW раздел «Каталог KIRA» во вкладке «МДФ фасады»', (await opener.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-kira-open]');
    await opener.first().click();
    await page.waitForSelector('[data-kira-catalog]', { timeout: 60_000 }).catch(() => undefined);
    await sleep(1500);

    /* Категории, виртуальный список, картинки по мере прокрутки. */
    const catalogInfo = await page.evaluate(() => {
      const root = document.querySelector('[data-kira-catalog]');
      const chips = Array.from(document.querySelectorAll('[data-kira-category]')).map((b) => ({ key: b.getAttribute('data-kira-category'), text: b.textContent ?? '' }));
      return {
        total: Number(root?.getAttribute('data-kira-total')),
        imported: Number(root?.getAttribute('data-kira-imported')),
        chips,
        cards: document.querySelectorAll('[data-kira-card]').length,
        drawn: document.querySelectorAll('[data-kira-preview][data-drawn="1"]').length,
        types: document.querySelectorAll('[data-kira-type]').length,
      };
    });
    const chipCount = (key) => Number((catalogInfo.chips.find((c) => c.key === key)?.text ?? '').split('·').pop());
    await page.screenshot({ path: `${OUT}/flow-kira-panel.png`, timeout: 120_000 });
    const list = page.locator('[data-kira-list]');
    await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event('scroll'));
    });
    await sleep(2500);
    const scrolled = await page.evaluate(() => ({
      cards: Array.from(document.querySelectorAll('[data-kira-card]')).map((b) => b.getAttribute('data-kira-card')),
      drawn: document.querySelectorAll('[data-kira-preview][data-drawn="1"]').length,
    }));
    check(
      'FLOW.1 каталог KIRA: 69 моделей, все в каталоге организации; шесть категорий с числами 12 / 28 / 15 / 1 / 5 / 7; фильтр по типу рисунка; в DOM меньше трети карточек (список виртуальный), картинки рисуются у видимых, после прокрутки к концу — карточки и картинки конца списка',
      catalogInfo.total === 69 &&
        catalogInfo.imported === 69 &&
        Object.entries(EXPECTED).every(([key, n]) => chipCount(key) === n) &&
        catalogInfo.types >= 9 &&
        catalogInfo.cards > 0 &&
        catalogInfo.cards < 23 &&
        catalogInfo.drawn > 0 &&
        catalogInfo.drawn <= catalogInfo.cards &&
        scrolled.cards.length < 23 &&
        scrolled.cards.includes('KIRA-SL-9') &&
        scrolled.drawn > 0,
      `всего ${catalogInfo.total}, в каталоге ${catalogInfo.imported} · ${catalogInfo.chips.map((c) => c.text.trim()).join(' | ')} · в DOM ${catalogInfo.cards} карточек, нарисовано ${catalogInfo.drawn} · после прокрутки ${scrolled.cards.length}, последняя ${scrolled.cards.at(-1)}, нарисовано ${scrolled.drawn}`,
    );

    /* Поиск и фильтры. */
    await page.locator('[data-kira-category="integra"]').first().click();
    await sleep(500);
    const integra = await page.evaluate(() => Number(document.querySelector('[data-kira-catalog]')?.getAttribute('data-kira-shown')));
    await page.locator('[data-kira-category="all"]').first().click();
    await page.locator('[data-kira-type="vitrine"]').first().click();
    await sleep(500);
    const vitrines = await page.evaluate(() => Number(document.querySelector('[data-kira-catalog]')?.getAttribute('data-kira-shown')));
    await page.locator('[data-kira-type="all"]').first().click();
    await page.locator('[data-kira-search]').first().fill('KIRA-IR-1');
    await sleep(800);
    const searched = await page.evaluate(() => Array.from(document.querySelectorAll('[data-kira-card]')).map((b) => `${b.getAttribute('data-kira-card')}:${b.getAttribute('data-kira-state')}`));
    check(
      'FLOW.2 категория «Интегрированные ручки» — 7, тип «Витрина» — 5, поиск «KIRA-IR-1» — одна карточка, готовая к применению',
      integra === 7 && vitrines === 5 && searched.join(',') === 'KIRA-IR-1:ready',
      `ручки ${integra} · витрины ${vitrines} · поиск: ${searched.join(', ') || 'НИЧЕГО'}`,
    );

    /* Увеличенный вид → «Применить». */
    await page.locator('[data-kira-card="KIRA-IR-1"]').first().click();
    await page.waitForSelector('[data-kira-zoom="KIRA-IR-1"]', { timeout: 20_000 }).catch(() => undefined);
    await waitFor(page, () => document.querySelector('[data-kira-zoom] [data-kira-preview][data-drawn="1"]') !== null, (v) => v === true, 20_000);
    const zoom = await page.evaluate(() => {
      const root = document.querySelector('[data-kira-zoom]');
      return {
        preview: Boolean(root?.querySelector('[data-kira-preview][data-drawn="1"]')),
        source: root?.querySelector('[data-kira-source]')?.getAttribute('href') ?? null,
        grip: Boolean(root?.querySelector('[data-kira-hint="grip"]')),
        photos: root ? root.querySelectorAll('img').length : -1,
        apply: root?.querySelector('[data-kira-apply]') ? !(root.querySelector('[data-kira-apply]')).disabled : false,
      };
    });
    await page.screenshot({ path: `${OUT}/flow-kira-zoom.png`, timeout: 120_000 });
    check(
      'FLOW.3 увеличенный вид: наша картинка рисунка нарисована, фото производителя нет ни одного, ссылка на карточку модели на kira-group.kz, сказано до нажатия, что накладной ручки на двери не будет; «Применить» доступна',
      zoom.preview && zoom.photos === 0 && /^https:\/\/kira-group\.kz\//.test(zoom.source ?? '') && zoom.grip && zoom.apply,
      JSON.stringify(zoom),
    );
    await page.locator('[data-kira-apply]').first().click();
    await sleep(1500);
    const notice = await page.locator('[data-mdf-notice]').first().textContent().catch(() => null);

    /* Цвет RAL — во вкладке «Эмаль RAL» той же цели. */
    await page.locator('[data-material-tab="mdf_paint"]').first().click();
    await page.locator('[data-material-search]').first().fill(RAL.code);
    await sleep(800);
    const ralRow = page.locator('[data-material-item]').first();
    must('FLOW RAL найден в каталоге', (await ralRow.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-material-item] после поиска');
    await ralRow.click();
    await sleep(1500);

    /* 3D: рисунок модели на одной двери, цвет, скобы на ней нет, корпус тот же. */
    await tool(page, 'furniture');
    await view(page, '3d');
    await sceneSettled(page);
    await sleep(1500);
    const one = closedReliefs(await reliefs(page));
    const metalAfter = await metal(page);
    const surfacesAfter = await surfaces(page);
    const color = lin(RAL.hex);
    const carcass = (list) => (list ?? []).filter((s) => s.name.startsWith('carcass:') || s.name.startsWith('inner:')).map((s) => `${s.name}|${s.count}|${s.color.map((v) => v.toFixed(4)).join('/')}`).join(';');
    await page.screenshot({ path: `${OUT}/flow-3d.png`, timeout: 120_000 });
    check(
      'FLOW.4 в 3D рисунок модели KIRA:IR-1 ровно на одной двери, цвет RAL 160 40 15; накладных ручек в сцене на одну меньше (ручка фрезерована в фасаде); корпус тот же; при применении сказано, что дверь стала МДФ в эмали',
      one.reduce((sum, r) => sum + r.count, 0) === 1 &&
        one[0].drawn === 'design' &&
        one[0].model === 'KIRA:IR-1' &&
        one[0].color.every((v, i) => Math.abs(v - color[i]) < 0.002) &&
        metalAfter === metalBefore - 1 &&
        carcass(surfacesBefore) === carcass(surfacesAfter) &&
        /МДФ в эмали/.test(notice ?? ''),
      `рисунков ${one.map((r) => `${r.model ?? r.drawn}×${r.count}`).join(', ') || 'НЕТ'} · металл ${metalBefore} → ${metalAfter} · корпус ${carcass(surfacesBefore) === carcass(surfacesAfter) ? 'тот же' : 'ИЗМЕНИЛСЯ'} · «${(notice ?? 'НЕТ').slice(0, 80)}»`,
    );

    /* Открыть и закрыть — ждётся факт, а не таймер. */
    const readReliefs = () => (window.__mwCadReliefs ? window.__mwCadReliefs() : null);
    await page.locator('[data-open-all]').first().click();
    const opened = (await waitFor(page, readReliefs, (list) => Array.isArray(list) && list.some((r) => r.moving && r.model === 'KIRA:IR-1'), 90_000)) ?? [];
    await sceneSettled(page);
    await page.screenshot({ path: `${OUT}/flow-open.png`, timeout: 120_000 });
    await page.locator('[data-close-all]').first().click();
    const closed =
      (await waitFor(page, readReliefs, (list) => Array.isArray(list) && !list.some((r) => r.moving) && list.reduce((s, r) => s + r.count, 0) === 1, 120_000)) ?? [];
    check(
      'FLOW.5 дверь открывается с рисунком модели (едет своим мешем KIRA:IR-1) и закрывается обратно в пачку',
      opened.some((r) => r.moving && r.model === 'KIRA:IR-1') && closedReliefs(closed).reduce((s, r) => s + r.count, 0) === 1 && !closed.some((r) => r.moving),
      `открыто: ${opened.map((r) => `${r.moving ? 'едет' : 'стоит'} ${r.model ?? r.drawn}`).join(', ')} · закрыто: ${closed.map((r) => `${r.moving ? 'едет' : 'стоит'} ${r.model ?? r.drawn}`).join(', ')}`,
    );

    /* Сохранить, прочитать базу, перезагрузить. */
    await saved(page);
    await sleep(2500);
    const { data: row } = await service.from('projects').select('millwork').eq('id', id).single();
    const stored = Object.values(row?.millwork?.runs ?? {}).map((run) => run?.modules?.find((m) => m.id === 'tall-0@w1')).find((m) => m?.leafFronts);
    const leaf = stored?.leafFronts?.['door:1'];
    const ir1 = (await kiraRows(service, org.id)).find((r) => r.article === 'KIRA-IR-1');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
    await sleep(1500);
    await open3d(page);
    const reloaded = closedReliefs(
      await waitFor(page, readReliefs, (list) => Array.isArray(list) && closedReliefs(list).reduce((s, r) => s + r.count, 0) === 1, 60_000),
    );
    const metalReloaded = await metal(page);
    await page.screenshot({ path: `${OUT}/flow-after-reload.png`, timeout: 120_000 });
    check(
      'FLOW.6 сохранено в модель объекта (фасад двери 2: рисунок модели KIRA:IR-1, ссылка на позицию каталога организации, RAL 160 40 15; у двери 1 своего фасада нет) и после перезагрузки в сцене тот же рисунок на одной двери, накладных ручек столько же, сколько до перезагрузки',
      leaf?.relief?.kind === 'design' &&
        leaf.relief.model === 'KIRA:IR-1' &&
        leaf.millingId === ir1?.id &&
        leaf.colorHex === RAL.hex &&
        !stored.leafFronts['door:0'] &&
        reloaded.reduce((s, r) => s + r.count, 0) === 1 &&
        reloaded[0].model === 'KIRA:IR-1' &&
        metalReloaded === metalAfter,
      `в базе: ${JSON.stringify(leaf ? { model: leaf.relief?.model, millingId: leaf.millingId === ir1?.id ? 'позиция KIRA-IR-1' : leaf.millingId, color: leaf.colorHex } : null)} · после перезагрузки: ${reloaded.map((r) => `${r.model ?? r.drawn}×${r.count}`).join(', ') || 'НЕТ'} · металл ${metalReloaded}`,
    );

    /* Рама витрины на глухой шкаф — отказ словами; планшет без горизонтальной прокрутки. */
    await tool(page, 'select');
    await page.locator('[data-object-module="tall-0@w1"]').first().click();
    await sleep(400);
    await tool(page, 'materials');
    await page.waitForSelector('[data-materials-panel][data-loaded="1"]', { timeout: 60_000 }).catch(() => undefined);
    await page.locator('[data-material-target="leaf"]').first().click();
    await page.locator('[data-material-leaf="door:0"]').first().click();
    await page.locator('[data-material-tab="mdf_facade"]').first().click();
    await page.locator('[data-kira-open]').first().click();
    await page.waitForSelector('[data-kira-catalog]', { timeout: 60_000 }).catch(() => undefined);
    await page.locator('[data-kira-search]').first().fill('KIRA-V2');
    await sleep(600);
    await page.locator('[data-kira-card="KIRA-V2"]').first().click();
    await page.waitForSelector('[data-kira-zoom="KIRA-V2"]', { timeout: 20_000 }).catch(() => undefined);
    const vitrineHint = await page.locator('[data-kira-hint="vitrine"]').count();
    await page.locator('[data-kira-apply]').first().click();
    await sleep(1200);
    const refusal = await page.locator('[data-mdf-notice]').first().textContent().catch(() => null);
    const layout = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-kira-card], [data-kira-category], [data-kira-search]')).map((b) => b.getBoundingClientRect());
      return {
        scroll: document.documentElement.scrollWidth,
        width: window.innerWidth,
        inside: cards.length > 0 && cards.every((r) => r.left >= 0 && r.right <= window.innerWidth),
      };
    });
    await page.screenshot({ path: `${OUT}/flow-vitrine-refusal.png`, timeout: 120_000 });
    check(
      'FLOW.7 рама витрины В2 на глухую дверь: до нажатия сказано «только на шкаф-витрину», после — отказ словами (под стекло); на 1024 px карточки, категории и поиск в экране, горизонтальной прокрутки нет',
      vitrineHint === 1 && /под стекло/.test(refusal ?? '') && layout.inside && layout.scroll <= layout.width,
      `подсказка ${vitrineHint} · «${(refusal ?? 'НЕТ').slice(0, 100)}» · ширина ${layout.scroll}/${layout.width}, в экране ${layout.inside}`,
    );
    check('FLOW ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
  });
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
      if (part === 'import') await partImport(browser);
      if (part === 'flow') await partFlow(browser);
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
