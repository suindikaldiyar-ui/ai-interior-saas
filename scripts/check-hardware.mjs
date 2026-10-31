/**
 * ФУРНИТУРА ПРОИЗВОДИТЕЛЕЙ В БРАУЗЕРЕ (HARDWARE-01) — на настоящей организации.
 *
 * Запуск (после `npm run build`): `node scripts/check-hardware.mjs`
 *   PART=import  — 1440 × 900: /admin/catalog → «Фурнитура производителей» →
 *     «что ляжет» по группам A–I и производителям → «Загрузить» → в базе
 *     столько позиций, сколько в фактах, все с ценой 0 («цена не задана»);
 *     повтор — «Всё уже в каталоге»; своя пачка CSV — строки и отказы словами.
 *   PART=kitchen — 1440 × 900, Studio кухни: петли и планка на дверце 450
 *     (чашки едут с полотном); сохранить → база → перезагрузить.
 *   PART=kitchen-drawers — направляющие KA на трёх ящиках (короб в
 *     деталировке, в карте раскроя и в 3D, присадка на карточке детали);
 *     сохранить → база → перезагрузить.
 *   PART=kitchen-lift — подъёмник HS на верхнем шкафу (корпуса и рычаги),
 *     сушилка в шкафу над мойкой; сохранить → база → перезагрузить.
 *     Три кухонные части — по своей организации, каждая в пределах вызова.
 *   PART=wardrobe — 1440 × 900, Studio шкафа-купе: пантограф в отсеке b1
 *     (едет вниз и вперёд), выдвижная штанга в b2 (вперёд), система купе
 *     ряда (полотна едут вбок).
 *   PART=cargo   — 1440 × 900: карго 200 (фасад выдвигается с корзинами).
 *   PART=corner  — 1440 × 900: угловая кухня — петля на модуле стены Б.
 *   PART=tablet  — 1024 × 768 с касанием: панель «Фурнитура» в экране,
 *     прокрутки по ширине нет, список виртуальный, установка касанием.
 *   PART=catalog2 — 1440 × 900 (HW-02): кнопки новых производителей
 *     числами фактов, серии BOYARD, отбор по размеру, замена KA 500 на
 *     аналог через карточку, избранное и недавние после перезагрузки.
 *   PART=drawers — 1440 × 900 (HW-04): TANDEMBOX antaro путём «Производитель →
 *     Серия → NL → Артикул»: место царг появляется с ходовой, царги другой NL —
 *     отказ, ход по модели, царги металлом, дно и задняя стенка = движку,
 *     выпуск заперт словами, смета, запись → перезагрузка.
 *   PART=drilling — 1440 × 900 (HW-08, HW-09): CLIP top + планка →
 *     «Документы» → «Присадка»: числа чашек и планки = приёмке движка,
 *     выпуск заперт словами, «Экспорт для БАЗИС» — ZIP без присадки.
 * Каждая часть — своя временная организация, заводится служебным ключом и
 * удаляется; уборка проверяется чтением. Снимки: .capture-check/hardware.
 */
import { execSync, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_HW ?? 3291);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/hardware';
const PARTS = (process.env.PART ?? 'import,kitchen,kitchen-drawers,kitchen-lift,wardrobe,cargo,corner,tablet').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['import', 'kitchen', 'kitchen-drawers', 'kitchen-lift', 'wardrobe', 'cargo', 'corner', 'tablet', 'catalog2', 'drilling', 'drawers'];
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

/* ─────────────────────────  объекты: путём экрана  ───────────────────────── */

let fixtures = null;
function fixture(key) {
  if (!fixtures) {
    fixtures = JSON.parse(execSync('npx tsx scripts/hardware-fixture.ts', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  }
  const fx = fixtures[key];
  if (!fx) throw new Stop(`нет объекта «${key}» в hardware-fixture`);
  return fx;
}
const FACTS = JSON.parse(readFileSync('data/catalog/hardware.json', 'utf8'));
const FACT_COUNT = FACTS.items.length;
const byManufacturer = FACTS.items.reduce((m, it) => ({ ...m, [it.hardware.manufacturer]: (m[it.hardware.manufacturer] ?? 0) + 1 }), {});
const DRAWER_BOX = { sideMm: 16, bottomMm: 4, bottomMaterial: 'hdf', bottomMount: 'groove', bottomGrooveMm: 6, gapBelowMm: 10, gapAboveMm: 30, runnerAxisMm: 40, edge: '0.4', confirmed: true };

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
  while (Date.now() - t0 < 90_000 && s.root && s.state !== 'ready' && s.state !== 'failed') {
    await sleep(150);
    s = await read();
  }
  return { ...s, ms: Date.now() - t0 };
}
/** Сцена 3D на экране и готова: металл, ход и снимки читаются с неё. */
async function open3d(page, label) {
  await tool(page, 'furniture');
  must(`${label}: вид «3D»`, await view(page, '3d'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-bottombar] [data-studio-view="3d"]');
  const s = await sceneSettled(page);
  must(`${label}: 3D готова`, s.state === 'ready', `${s.state} за ${s.ms} мс`);
  await sleep(1200);
}
const saved = (page) => waitFor(page, () => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null, (v) => v === 'saved', 30_000);
async function openStudio(page, projectId) {
  await page.goto(`${BASE}/project/${projectId}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  /* Studio не открылась — что на экране вместо неё: адрес, снимок и текст страницы, а не только «таймаут». */
  const opened = await page.waitForSelector('[data-studio-root]', { timeout: 60_000 }).then(() => true, () => false);
  if (!opened) {
    await page.screenshot({ path: `${OUT}/studio-not-opened.png`, timeout: 30_000 }).catch((e) => console.log(`  снимок не снят: ${e.message}`));
    const said = await page.evaluate(() => (document.body?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 300));
    throw new Stop(`Studio не открылась за 60 с: ${page.url()} · на экране: «${said}» · снимок ${OUT}/studio-not-opened.png`);
  }
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-studio-rail] [data-studio-tool]');
    return Boolean(el && Object.keys(el).some((k) => k.startsWith('__reactProps')));
  }, undefined, { timeout: 60_000 });
  await sleep(800);
}
const metal = (page) => page.evaluate(() => (window.__mwCadMetal ? window.__mwCadMetal() : null));
/** Металл в покое: створки закрылись и доехали — два одинаковых чтения подряд (до 60 с). */
async function settledMetal(page) {
  await quiet(page);
  let prev = await metal(page);
  for (let i = 0; i < 40; i += 1) {
    await sleep(1500);
    const next = await metal(page);
    if (next === prev && typeof next === 'number') return next;
    prev = next;
  }
  return prev;
}
const moving = (page, id) => page.evaluate((key) => (window.__mwMoving ? window.__mwMoving(key) : null), id);

/** Модуль выбран — инструмент «Фурнитура», панель с каталогом организации. */
async function hardwareFor(page, label, moduleId) {
  /* Список объектов уже открыт — повторное нажатие «Выбора» его закрыло бы. */
  if (!(await page.locator('[data-studio-objects]').first().isVisible().catch(() => false))) {
    must(`${label}: инструмент «Выбор»`, await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="select"]');
  }
  if (moduleId) {
    const row = page.locator(`[data-object-module="${moduleId}"]`);
    must(`${label}: модуль ${moduleId} в списке объектов`, (await row.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-object-module="${moduleId}"]`);
    await row.first().click();
    await sleep(500);
  }
  must(`${label}: инструмент «Фурнитура»`, await tool(page, 'hardware'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="hardware"]');
  const items = await waitFor(page, () => Number(document.querySelector('[data-hw-panel]')?.getAttribute('data-hw-items') ?? 0), (n) => n >= 1, 60_000);
  /* Не доехал — что панель говорит словами (ошибка чтения каталога называется там же). */
  const said = items >= FACT_COUNT ? '' : await page.evaluate(() => (document.querySelector('[data-hw-panel]')?.textContent ?? 'ПАНЕЛИ НЕТ').replace(/\s+/g, ' ').slice(0, 240));
  must(`${label}: панель «Фурнитура» видит каталог организации`, items >= FACT_COUNT, `позиций ${items} при ${FACT_COUNT} в фактах · панель: «${said}»`);
}

/** Место → поиск → строка → «Установить»; место называет поставленный артикул. */
async function installVia(page, label, slot, article, query) {
  const slotButton = page.locator(`[data-hw-slot="${slot}"]`);
  must(`${label}: место «${slot}»`, (await slotButton.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-hw-slot="${slot}"] · места: ${await page.evaluate(() => Array.from(document.querySelectorAll('[data-hw-slot]')).map((b) => b.getAttribute('data-hw-slot')).join(', '))}`);
  if ((await slotButton.first().getAttribute('aria-pressed')) !== 'true') await slotButton.first().click();
  await page.locator('[data-hw-search]').first().fill(query);
  await sleep(400);
  const row = page.locator(`[data-hw-item="${article}"]`);
  must(`${label}: ${article} в списке места`, (await row.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-hw-item="${article}"] по запросу «${query}»`);
  const rowVerdict = await row.first().getAttribute('data-hw-item-verdict');
  await row.first().click();
  await sleep(300);
  const cardVerdict = await page.evaluate(() => document.querySelector('[data-hw-card-verdict]')?.getAttribute('data-hw-card-verdict') ?? null);
  const button = page.locator('[data-hw-install]');
  must(`${label}: кнопка «Установить» у ${article}`, (await button.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-hw-install]');
  await button.first().click();
  const installed = await waitFor(page, (key) => document.querySelector(`[data-hw-slot="${key}"]`)?.getAttribute('data-hw-installed') ?? null, (v) => v === article, 20_000, slot);
  const notice = await page.evaluate(() => document.querySelector('[data-hw-notice]')?.textContent ?? '');
  return { rowVerdict, cardVerdict, installed: installed === article, notice };
}

/** Открыть всё — ждётся факт сдвига/поворота детали, а не таймер. */
async function openAll(page, id, test, ms = 120_000) {
  await page.locator('[data-open-all]').first().click();
  /* Ход не дошёл за время — падение с тем, что прочитано, а не молчаливое «последнее значение». */
  const reached = await waitFor(page, (key) => (window.__mwMoving ? window.__mwMoving(key) : null), (v) => Boolean(v) && test(v), ms, id);
  must(`«Открыть всё»: ${id} дошла до открытой позы`, Boolean(reached) && test(reached), `за ${Math.round(ms / 1000)} с прочитано: ${JSON.stringify(reached)}`);
  /* Читается доехавшее: ход меряется, когда в сцене ничего не едет. */
  await waitFor(page, () => (window.__mwMovingCount ? window.__mwMovingCount() : -1), (n) => n === 0, ms);
  return moving(page, id);
}
/** Камера ближе к детали — только для снимка: проверки меряют числа, а не картинку. */
async function closeUp(page, id, offset = [-0.9, 0.55, 1.2]) {
  const at = await moving(page, id);
  if (!at?.world) return false;
  const [x, y, z] = at.world;
  await page.evaluate(
    (pose) => (window.__mwCadCamera ? window.__mwCadCamera(pose) : null),
    { position: [x + offset[0], y + offset[1], z + offset[2]], target: [x, y, z] },
  );
  await sleep(2500);
  return true;
}
async function quiet(page, ms = 120_000) {
  return waitFor(
    page,
    () => ({
      open: window.__mwOpenParts ? window.__mwOpenParts() : -1,
      moving: window.__mwMovingCount ? window.__mwMovingCount() : -1,
    }),
    (v) => v.open === 0 && v.moving === 0,
    ms,
  );
}
async function closeAll(page) {
  const b = page.locator('[data-close-all]');
  if ((await b.count()) > 0 && !(await b.first().isDisabled())) await b.first().click();
  const q = await quiet(page);
  if (q.open !== 0 || q.moving !== 0) throw new Stop(`сцена не закрылась: открыто ${q.open}, едет ${q.moving}`);
  await sleep(1500);
}

/* ─────────────────────────  организация  ───────────────────────── */

/*
 * ЗАСЕВ КАТАЛОГА ФУРНИТУРЫ (PART 7): строки, которые маршрут импорта вставил
 * бы в пустой каталог (`scripts/hardware-import-rows.ts` →
 * `planHardwareImport`), разобраны ОДИН раз на процесс и пишутся служебным
 * ключом пачками. Импорт через API — 27 запросов по 200 строк подряд — на
 * каждой части съедал до двух минут и не всегда укладывался. Импорт путём
 * экрана проверяет часть `import`.
 */
let importRows = null;
function hardwareImportRows() {
  if (!importRows) {
    const out = JSON.parse(execSync('npx tsx scripts/hardware-import-rows.ts', { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
    if (out.count !== FACT_COUNT || out.rows.length !== FACT_COUNT) throw new Stop(`строк засева ${out.rows.length} при ${FACT_COUNT} в фактах`);
    importRows = out.rows;
  }
  return importRows;
}
async function seedHardware(service, orgId) {
  const startedAt = Date.now();
  const rows = hardwareImportRows();
  const { data: category, error } = await service.from('catalog_categories').select('id').eq('org_id', orgId).eq('key', 'hardware').single();
  if (error || !category) throw new Error(`категории «Фурнитура» нет после типового прайса: ${error?.message ?? 'пусто'}`);
  const CHUNK = 400;
  const chunks = [];
  for (let at = 0; at < rows.length; at += CHUNK) chunks.push(rows.slice(at, at + CHUNK));
  let added = 0;
  for (let i = 0; i < chunks.length; i += 4) {
    const results = await Promise.all(
      chunks.slice(i, i + 4).map((chunk) =>
        service.from('catalog_items').insert(chunk.map((row) => ({ org_id: orgId, category_id: category.id, ...row, is_active: true }))).select('id'),
      ),
    );
    for (const result of results) {
      if (result.error) throw new Error(`засев фурнитуры: записано ${added} из ${rows.length}, дальше: ${result.error.message}`);
      added += result.data?.length ?? 0;
    }
  }
  const { count, error: countError } = await service.from('catalog_items').select('id', { count: 'exact', head: true }).eq('org_id', orgId).like('article', 'MFR-%');
  if (countError || count !== FACT_COUNT) throw new Error(`после засева позиций ${count} при ${FACT_COUNT} в фактах${countError ? `: ${countError.message}` : ''}`);
  console.log(`  ·    каталог фурнитуры засеян: ${added} строк за ${Math.round((Date.now() - startedAt) / 1000)} с`);
}

async function withOrg(label, browser, body, { viewport, touch = false, projects = [], importHardware = true, production = null }) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const made = { users: [], orgs: [], projects: [] };
  try {
    const email = `hw-${stamp}@example.test`;
    const password = `Pw-${stamp}-hw!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    made.users.push(data.user.id);
    const { data: org, error: orgError } = await service
      .from('orgs')
      .insert({ slug: `hw-${stamp}`, name: `Проверка фурнитуры ${label}`, ...(production ? { production } : {}) })
      .select('id')
      .single();
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
    const context = await browser.newContext({ viewport, hasTouch: touch, acceptDownloads: true });
    await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', sameSite: 'Lax' })));
    const page = await context.newPage();
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
    });
    const seeded = await page.request.post(`${BASE}/api/catalog/seed-rates`, { data: { orgId: org.id } });
    if (!seeded.ok()) throw new Error(`типовой прайс не заведён: ${seeded.status()}`);
    if (importHardware) await seedHardware(service, org.id);
    const ids = {};
    for (const p of projects) {
      const { data: project, error: projectError } = await service
        .from('projects')
        .insert({
          org_id: org.id,
          client_name: 'Проверка',
          status: 'in_progress',
          address: `Фурнитура ${label} · ${p.key}`,
          zone: p.zone,
          measurements: p.fx.measurement,
          millwork: p.millwork ?? { survey: p.fx.survey, requirements: p.fx.requirements, runs: { optimal: p.fx.run }, selectedVariant: 'optimal' },
        })
        .select('id')
        .single();
      if (projectError) throw new Error(`insert project: ${projectError.message}`);
      made.projects.push(project.id);
      ids[p.key] = project.id;
    }
    await body({ service, org, page, errors, consoleErrors, ids, context });
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

async function countMfr(service, orgId) {
  const { count, error } = await service.from('catalog_items').select('id', { count: 'exact', head: true }).eq('org_id', orgId).like('article', 'MFR-%');
  if (error) throw new Error(`чтение каталога: ${error.message}`);
  return count ?? 0;
}

/* ═════════════════════════  IMPORT  ═════════════════════════ */

async function partImport(browser) {
  console.log('\n── IMPORT (1440 × 900): /admin/catalog → «Фурнитура производителей» → что ляжет → Загрузить → повтор → своя пачка CSV');
  await withOrg(
    'IMPORT',
    browser,
    async ({ service, org, page, errors, consoleErrors }) => {
      await page.goto(`${BASE}/admin/catalog`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      const button = page.locator('[data-admin-hardware]');
      await button.first().waitFor({ timeout: 60_000 });
      await button.first().click();
      await page.waitForSelector('[data-admin-hardware-plan="facts"]', { timeout: 90_000 });
      const plan = await page.evaluate(() => ({
        groups: Array.from(document.querySelectorAll('[data-admin-hardware-group]')).map((tr) => ({ key: tr.getAttribute('data-admin-hardware-group'), found: Number(tr.getAttribute('data-found')) })),
        manufacturers: Array.from(document.querySelectorAll('[data-admin-hardware-manufacturer]')).map((tr) => ({ name: tr.getAttribute('data-admin-hardware-manufacturer'), found: Number(tr.getAttribute('data-found')) })),
        sources: Number(document.querySelector('[data-admin-hardware-sources]')?.getAttribute('data-admin-hardware-sources') ?? 0),
        confirm: document.querySelector('[data-admin-hardware-confirm]')?.textContent ?? '',
      }));
      mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: `${OUT}/import-1-plan.png`, timeout: 120_000 });
      const sum = plan.groups.reduce((s, g) => s + g.found, 0);
      const manufacturersOk = Object.entries(byManufacturer).every(([name, n]) => plan.manufacturers.find((m) => m.name === name)?.found === n);
      check(
        'IMPORT.1 «что ляжет»: девять групп A–I, сумма по группам и по производителям = фактам; источники названы',
        plan.groups.length === 9 && sum === FACT_COUNT && manufacturersOk && plan.sources >= 3 && plan.confirm.includes('Загрузить'),
        `групп ${plan.groups.length} · ${plan.groups.map((g) => `${g.key} ${g.found}`).join(', ')} · сумма ${sum}/${FACT_COUNT} · ${plan.manufacturers.map((m) => `${m.name} ${m.found}`).join(', ')} · источников ${plan.sources}`,
      );
      const before = await countMfr(service, org.id);
      await page.locator('[data-admin-hardware-confirm]').first().click();
      const after = await (async () => {
        const until = Date.now() + 120_000;
        let n = await countMfr(service, org.id);
        while (n < FACT_COUNT && Date.now() < until) {
          await sleep(1000);
          n = await countMfr(service, org.id);
        }
        return n;
      })();
      const { data: priced } = await service.from('catalog_items').select('id').eq('org_id', org.id).like('article', 'MFR-%').gt('price', 0).limit(1);
      check(
        'IMPORT.2 «Загрузить» — в каталоге организации ровно столько позиций, сколько в фактах; цены нет ни у одной («цена не задана»)',
        before === 0 && after === FACT_COUNT && (priced ?? []).length === 0,
        `до ${before} · после ${after} из ${FACT_COUNT} · с ценой ${(priced ?? []).length}`,
      );
      await sleep(1500);
      await page.locator('[data-admin-hardware]').first().click();
      await page.waitForSelector('[data-admin-hardware-plan="facts"]', { timeout: 90_000 });
      const repeat = await page.evaluate(() => ({ text: document.querySelector('[data-admin-hardware-confirm]')?.textContent ?? '', disabled: (document.querySelector('[data-admin-hardware-confirm]'))?.disabled ?? null }));
      check('IMPORT.3 повтор — «Всё уже в каталоге», кнопка закрыта; дублей нет', repeat.text.includes('Всё уже в каталоге') && repeat.disabled === true && (await countMfr(service, org.id)) === FACT_COUNT, `«${repeat.text}» · ${repeat.disabled ? 'закрыта' : 'ОТКРЫТА'}`);
      await page.getByRole('button', { name: 'Отмена' }).first().click().catch(() => undefined);

      /* Своя пачка CSV: две строки и одна чужая категория. */
      const csv = [
        'manufacturer;article;name;category;subcategory;saleUnit;sourceFile;pdfPage;checkedAt;dimensions;ranges',
        'Компания;HW-K1;Направляющая своя 450;slide;side_mount;pair;прайс.pdf;3;2026-10-21;nominalLength=450, sideClearance=13;',
        'Компания;HW-K2;Петля своя;hinge;overlay;piece;прайс.pdf;4;2026-10-21;;doorThickness=16..22',
        'Компания;HW-K3;Лампа;lamp;;;;;;;',
      ].join('\n');
      const file = `${OUT}/own-hardware.csv`;
      writeFileSync(file, csv, 'utf8');
      await page.locator('[data-admin-hardware-file]').setInputFiles(file);
      await page.waitForSelector('[data-admin-hardware-plan="upload"]', { timeout: 90_000 });
      const upload = await page.evaluate(() => ({
        errors: Number(document.querySelector('[data-admin-hardware-errors]')?.getAttribute('data-admin-hardware-errors') ?? 0),
        errorText: document.querySelector('[data-admin-hardware-errors]')?.textContent ?? '',
        confirm: document.querySelector('[data-admin-hardware-confirm]')?.textContent ?? '',
      }));
      await page.screenshot({ path: `${OUT}/import-2-own-csv.png`, timeout: 120_000 });
      await page.locator('[data-admin-hardware-confirm]').first().click();
      const own = await (async () => {
        const until = Date.now() + 60_000;
        let rows = [];
        while (rows.length < 2 && Date.now() < until) {
          await sleep(1000);
          rows = (await service.from('catalog_items').select('article').eq('org_id', org.id).like('article', 'MFR-KOMPANIYA-%')).data ?? [];
        }
        return rows.map((r) => r.article).sort();
      })();
      check(
        'IMPORT.4 своя пачка CSV: «lamp» отклонена словами; две строки легли с ключом производитель + артикул',
        upload.errors === 1 && upload.errorText.includes('lamp') && JSON.stringify(own) === JSON.stringify(['MFR-KOMPANIYA-HW-K1', 'MFR-KOMPANIYA-HW-K2']),
        `отказов ${upload.errors} («${upload.errorText.slice(0, 80)}») · легли ${own.join(', ') || 'НИЧЕГО'}`,
      );
      check('IMPORT ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 }, importHardware: false },
  );
}

/* ═════════════════════════  KITCHEN  ═════════════════════════ */

/*
 * KITCHEN — ТРИ НЕЗАВИСИМЫЕ ЧАСТИ (PART 7): одна часть шла 12 мин 39 с и не
 * укладывалась в предел вызова. Каждая часть — своя временная организация,
 * свой объект кухни и своя проверка «записал → база → перезагрузил» по тем
 * позициям, что она поставила; вместе они покрывают прежний KITCHEN.J
 * (петля, планка, направляющая, подъёмник, сушилка). Проверки — прежние.
 */
async function kitchenOpen(page, ids) {
  await openStudio(page, ids.kitchen);
  await open3d(page, 'KITCHEN');
  await saved(page);
  const metal0 = await settledMetal(page);
  must('KITCHEN металл читается со сцены', typeof metal0 === 'number' && metal0 > 0, `__mwCadMetal: ${metal0}`);
}

/** Сохранить → база → перезагрузить: позиции части на местах, механизмов в сцене столько же (всё закрыто). */
async function kitchenReopen({ page, service, ids, errors, consoleErrors }, label, want, probe) {
  /* «До» — тоже когда каталог дочитан: без него механизмы позиций не нарисованы, и разница — каталог, а не запись. */
  await hardwareFor(page, 'KITCHEN', probe.module);
  await closeAll(page);
  const metalClosed = await settledMetal(page);
  await saved(page);
  const row = (await service.from('projects').select('millwork').eq('id', ids.kitchen).single()).data;
  const all = [...(row?.millwork?.runs?.optimal?.modules ?? []), ...(row?.millwork?.runs?.optimal?.upperSegments ?? []).flatMap((s) => s.modules)];
  const stored = all.flatMap((m) => (m.fittings ?? []).map((f) => `${m.id}:${f.slot}`)).sort();
  check(`${label} в базе у модулей позиции на местах: ${want.join(', ')}`, JSON.stringify(stored) === JSON.stringify([...want].sort()), stored.join(', ') || 'НИЧЕГО');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
  await sleep(1500);
  await open3d(page, 'KITCHEN');
  await hardwareFor(page, 'KITCHEN', probe.module);
  const metalAfter = await settledMetal(page);
  const installed = await page.evaluate((slot) => document.querySelector(`[data-hw-slot="${slot}"]`)?.getAttribute('data-hw-installed') ?? null, probe.slot);
  check(
    `${label}2 после перезагрузки: ${probe.article} на месте «${probe.slot}» у ${probe.module}, механизмов в сцене столько же, сколько до неё (всё закрыто)`,
    installed === probe.article && metalAfter === metalClosed,
    `${probe.slot}: ${installed} · металл ${metalClosed} → ${metalAfter}`,
  );
  check(`${label.split('.')[0]} ошибок страницы и консоли нет`, errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
}

const KITCHEN_ORG = (fx) => ({
  viewport: { width: 1440, height: 900 },
  production: { drawerBox: DRAWER_BOX },
  projects: [{ key: 'kitchen', zone: 'Кухня', fx }],
});

async function partKitchen(browser) {
  console.log('\n── KITCHEN (1440 × 900): петли и планка на дверце 450 → чашки едут с полотном → сохранить → перезагрузить');
  const fx = fixture('kitchen');
  await withOrg(
    'KITCHEN',
    browser,
    async (ctx) => {
      const { page, ids } = ctx;
      await kitchenOpen(page, ids);

      /* A. Петли на дверце 450 + планка. */
      await hardwareFor(page, 'KITCHEN', 'base-1200@w1');
      await page.screenshot({ path: `${OUT}/kitchen-0-catalog.png`, timeout: 120_000 });
      const hinge = await installVia(page, 'KITCHEN', 'hinge', 'MFR-BLUM-71B3550', '71B3550');
      const plate = await installVia(page, 'KITCHEN', 'hinge_plate', 'MFR-BLUM-175H3130', '175H3130');
      const hingeVerdict = await page.evaluate(() => document.querySelector('[data-hw-slot="hinge"]')?.getAttribute('data-hw-verdict') ?? null);
      check('KITCHEN.A петля Blum 71B3550 и планка 175H3130 на дверце 450 поставлены; петля с планкой MD 3 — не отказ', hinge.installed && plate.installed && hingeVerdict !== 'refused', `петля ${hinge.installed ? 'стоит' : 'НЕТ'} (${hingeVerdict}) · планка ${plate.installed ? 'стоит' : 'НЕТ'}`);
      const door = await openAll(page, 'base-1200@w1:door:0', (v) => Math.abs(v.rotationDeg[1]) >= 80);
      await closeUp(page, 'base-1200@w1:door:0');
      await page.screenshot({ path: `${OUT}/kitchen-1-hinges.png`, timeout: 120_000 });
      check('KITCHEN.A2 дверца открыта (поворот ≥ 80°): чашки петель (2) едут с полотном — нарисованы в группе створки', Boolean(door) && Math.abs(door.rotationDeg[1]) >= 80 && door.names['rider:hinge'] === 2, JSON.stringify(door));
      await closeAll(page);


      await kitchenReopen(ctx, 'KITCHEN.J', ['base-1200@w1:hinge', 'base-1200@w1:hinge_plate'], { module: 'base-1200@w1', slot: 'hinge', article: 'MFR-BLUM-71B3550' });
    },
    KITCHEN_ORG(fx),
  );
}

async function partKitchenDrawers(browser) {
  console.log('\n── KITCHEN-DRAWERS (1440 × 900): направляющие KA на трёх ящиках → короб → деталировка → присадка на карточке → карта раскроя → сохранить → перезагрузить');
  const fx = fixture('kitchen');
  await withOrg(
    'KITCHEN',
    browser,
    async (ctx) => {
      const { page, ids } = ctx;
      await kitchenOpen(page, ids);

      /* B. Три ящика base-3300 на KA 4532 NL 500. */
      await hardwareFor(page, 'KITCHEN', 'base-3300@w1');
      const slide = await installVia(page, 'KITCHEN', 'slide', 'MFR-HETTICH-9114276', '9114276');
      check('KITCHEN.B направляющая KA 4532 NL 500 на трёх ящиках поставлена — не отказ', slide.installed && slide.cardVerdict !== 'refused', `${slide.cardVerdict}`);
      /*
       * HW-04: KA 4532 — полное выдвижение (класс механизма), ход не напечатан —
       * ящик выходит на NL 500 (было условно 300); у направляющей три секции:
       * ходовая едет с ящиком, средняя — на половину хода.
       */
      const drawer = await openAll(page, 'base-3300@w1:drawer:0', (v) => v.shift[2] >= 499);
      await closeUp(page, 'base-3300@w1:drawer:0', [-0.7, 0.8, 0.9]);
      await page.screenshot({ path: `${OUT}/kitchen-2-drawer-runners.png`, timeout: 120_000 });
      check(
        'KITCHEN.B2 ящик выехал на NL 500 мм (полное выдвижение) с деталями короба раскроя; ходовая секция едет с ящиком, средняя — на 250 мм',
        Boolean(drawer) &&
          drawer.shift[2] === 500 &&
          (drawer.names['panel:Боковина ящика'] ?? 0) === 2 &&
          (drawer.names['mech:runner'] ?? 0) === 2 &&
          (drawer.names['mech:runner-middle'] ?? 0) === 2 &&
          Array.isArray(drawer.middleShift) &&
          drawer.middleShift[2] === 250,
        JSON.stringify(drawer),
      );
      await closeAll(page);

      /* Деталировка: короб ящиков — строками; карточка детали — присадка словами. */
      must('KITCHEN инструмент «Документы»', await tool(page, 'documents'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="documents"]');
      await page.locator('[data-studio-doc="panels"]').first().click();
      await page.waitForSelector('[data-panel-row]', { timeout: 30_000 });
      const boxRows = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-panel-row][data-module-id="base-3300@w1"]'))
          .map((tr) => ({ text: tr.textContent ?? '', qty: Number(tr.getAttribute('data-part-qty') ?? 0), part: tr.getAttribute('data-part-id') }))
          .filter((r) => /Боковина ящика|Торец ящика|Дно ящика/.test(r.text)),
      );
      const qtyOf = (name) => boxRows.filter((r) => r.text.includes(name)).reduce((s, r) => s + r.qty, 0);
      check(
        'KITCHEN.B3 деталировка: у трёх ящиков боковин 6, торцов 6, днищ 3 — короб по комплекту в раскрое',
        qtyOf('Боковина ящика') === 6 && qtyOf('Торец ящика') === 6 && qtyOf('Дно ящика') === 3,
        `боковин ${qtyOf('Боковина ящика')} · торцов ${qtyOf('Торец ящика')} · днищ ${qtyOf('Дно ящика')}`,
      );
      const sideRow = boxRows.find((r) => r.text.includes('Боковина ящика'));
      must('KITCHEN строка «Боковина ящика» в деталировке', Boolean(sideRow), 'НУЛЕВОЙ СЕЛЕКТОР: строки короба нет');
      const readDrill = () =>
        page.evaluate(() => ({
          status: document.querySelector('[data-part-drilling]')?.getAttribute('data-part-drilling') ?? null,
          lines: Number(document.querySelector('[data-part-drilling-lines]')?.getAttribute('data-part-drilling-lines') ?? 0),
          text: document.querySelector('[data-part-drilling-lines]')?.textContent ?? '',
        }));
      await page.locator(`[data-panel-row][data-part-id="${sideRow.part}"]`).first().click();
      await sleep(500);
      const drill = await readDrill();
      const carcassRow = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-panel-row][data-module-id="base-3300@w1"]'))
          .map((tr) => ({ text: tr.textContent ?? '', part: tr.getAttribute('data-part-id') }))
          .find((r) => /Боковина(?! ящика)/.test(r.text))?.part ?? null,
      );
      must('KITCHEN строка «Боковина» корпуса base-3300', Boolean(carcassRow), 'НУЛЕВОЙ СЕЛЕКТОР: боковины корпуса нет');
      await page.locator(`[data-panel-row][data-part-id="${carcassRow}"]`).first().click();
      await sleep(500);
      const drillSide = await readDrill();
      await page.locator('[data-part-card]').first().scrollIntoViewIfNeeded().catch(() => undefined);
      await sleep(300);
      await page.screenshot({ path: `${OUT}/kitchen-3a-part-card-drilling.png`, timeout: 120_000 });
      check(
        'KITCHEN.B4 карточки детали — присадка DRILLING_NOT_VERIFIED по каждому ящику (3): боковина ящика — 37 / 381 (паспорт «37 / 344»), боковина корпуса — 37 / 165 / 261 / 325 («37 / 128 / 96 / 64»); «диаметр не напечатан»',
        drill.lines === 3 &&
          /DRILLING_NOT_VERIFIED/.test(drill.status ?? '') &&
          drill.text.includes('37 / 381') &&
          drillSide.lines === 3 &&
          drillSide.text.includes('37 / 165 / 261 / 325') &&
          drill.text.includes('не напечатан') &&
          drillSide.text.includes('не напечатан'),
        `ящик: ${drill.status} · строк ${drill.lines} · «${drill.text.slice(0, 90)}» | корпус: строк ${drillSide.lines} · «${drillSide.text.slice(0, 90)}»`,
      );
      const toMap = page.locator('[data-open-cutting]');
      must('KITCHEN в деталировке кнопка «Карта раскроя →»', (await toMap.count()) === 1, `НУЛЕВОЙ СЕЛЕКТОР: [data-open-cutting] ×${await toMap.count()}`);
      await toMap.first().click();
      await page.waitForSelector('[data-cutting-map]', { timeout: 60_000 });
      await sleep(800);
      const map = await waitFor(page, () => (window.__mwCutting ? window.__mwCutting() : null), (s) => Boolean(s), 30_000);
      await page.screenshot({ path: `${OUT}/kitchen-3-cutting-drawer-box.png`, timeout: 120_000 });
      const boxIds = new Set(boxRows.map((r) => r.part));
      const boxParts = (map?.parts ?? []).filter((p) => boxIds.has(p.partId));
      const drawerReason = (map?.release.reasons ?? []).find((r) => /^Ящиков/.test(r)) ?? '';
      check(
        'KITCHEN.B5 карта раскроя: короба трёх ящиков в карте (15 деталей); без короба остались только 2 ящика под варочной (направляющая не выбрана) — «Ящиков 2», а не 5',
        Boolean(map) && boxParts.reduce((s, p) => s + p.qty, 0) === 15 && drawerReason.startsWith('Ящиков 2:'),
        `деталей короба ${boxParts.reduce((s, p) => s + p.qty, 0)} · «${drawerReason.slice(0, 90) || 'ПРИЧИНЫ НЕТ'}»`,
      );

      await openStudio(page, ids.kitchen);
      await open3d(page, 'KITCHEN');
      await kitchenReopen(ctx, 'KITCHEN.JD', ['base-3300@w1:slide'], { module: 'base-3300@w1', slot: 'slide', article: 'MFR-HETTICH-9114276' });
    },
    KITCHEN_ORG(fx),
  );
}

async function partKitchenLift(browser) {
  console.log('\n── KITCHEN-LIFT (1440 × 900): подъёмник HS на верхнем шкафу (корпуса и рычаги) · сушилка над мойкой → сохранить → перезагрузить');
  const fx = fixture('kitchen');
  await withOrg(
    'KITCHEN',
    browser,
    async (ctx) => {
      const { page, ids } = ctx;
      await kitchenOpen(page, ids);

      /* E. Подъёмник HS top на верхнем шкафу. */
      /* Металл до подъёмника — когда каталог дочитан и сцена тиха: иначе в разницу войдут чужие узлы. */
      await hardwareFor(page, 'KITCHEN', 'upper-1200@w1');
      const metal1 = await settledMetal(page);
      const lift = await installVia(page, 'KITCHEN', 'lift', 'MFR-BLUM-22S2800', '22S2800');
      const metal2 = await waitFor(page, () => (window.__mwCadMetal ? window.__mwCadMetal() : null), (n) => n === metal1 + 4, 30_000);
      check('KITCHEN.E подъёмник HS top поставлен: в сцене +4 металлических узла (2 корпуса у боковин, 2 рычага)', lift.installed && metal2 === metal1 + 4, `металл ${metal1} → ${metal2}`);
      const up = await openAll(page, 'upper-1200@w1:door:0', (v) => Math.abs(v.rotationDeg[0]) >= 60);
      await closeUp(page, 'upper-1200@w1:door:0', [-0.6, -0.3, 1.2]);
      await page.screenshot({ path: `${OUT}/kitchen-4-lift.png`, timeout: 120_000 });
      check('KITCHEN.E2 фасад поднят (поворот ≥ 60°): рычаги (2) едут с ним', Boolean(up) && Math.abs(up.rotationDeg[0]) >= 60 && up.names['rider:lift'] === 2, JSON.stringify(up));
      await closeAll(page);

      /* G. Сушилка в шкафу над мойкой. */
      const metal3 = await settledMetal(page);
      await hardwareFor(page, 'KITCHEN', 'upper-1650@w1');
      const dryer = await installVia(page, 'KITCHEN', 'dryer', 'MFR-HAFELE-544.07.206', '544.07.206');
      const metal4 = await waitFor(page, () => (window.__mwCadMetal ? window.__mwCadMetal() : null), (n) => n === metal3 + 18, 30_000);
      check('KITCHEN.G сушилка 544.07.206 поставлена: решётки в сцене (+18 узлов: 2 поддона, 16 прутков)', dryer.installed && metal4 === metal3 + 18, `металл ${metal3} → ${metal4}`);
      await openAll(page, 'upper-1650@w1:door:0', (v) => Math.abs(v.rotationDeg[1]) >= 80);
      await closeUp(page, 'upper-1650@w1:door:0', [0.3, -0.2, 1.3]);
      await page.screenshot({ path: `${OUT}/kitchen-5-dryer.png`, timeout: 120_000 });
      await closeAll(page);

      await kitchenReopen(ctx, 'KITCHEN.JL', ['upper-1200@w1:lift', 'upper-1650@w1:dryer'], { module: 'upper-1200@w1', slot: 'lift', article: 'MFR-BLUM-22S2800' });
    },
    KITCHEN_ORG(fx),
  );
}

/* ═════════════════════════  DRAWERS (HW-04)  ═════════════════════════ */

/** Кнопка-переключатель: нажать, только если ещё не нажата (второе нажатие снимает выбор). */
async function press(page, selector, label) {
  const b = page.locator(selector);
  must(`${label}: кнопка ${selector}`, (await b.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: ${selector}`);
  if ((await b.first().getAttribute('aria-pressed')) !== 'true') await b.first().click();
  await sleep(300);
}

/** Производитель → Серия → Длина NL → Артикул → «Установить» — путь МЕБЕЛЬ → ФУРНИТУРА → НАПРАВЛЯЮЩИЕ. */
async function installByPath(page, label, slot, { brand, series, nl, article }) {
  await press(page, `[data-hw-slot="${slot}"]`, `${label} место «${slot}»`);
  await page.locator('[data-hw-search]').first().fill('');
  await press(page, `[data-hw-brand="${brand}"]`, label);
  await press(page, `[data-hw-series="${series}"]`, label);
  const nlChips = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hw-nl]')).map((b) => Number(b.getAttribute('data-hw-nl'))));
  await press(page, `[data-hw-nl="${nl}"]`, label);
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hw-item]')).map((r) => r.getAttribute('data-hw-item')));
  const row = page.locator(`[data-hw-item="${article}"]`);
  must(`${label}: ${article} в списке «${brand} → ${series} → NL ${nl}»`, (await row.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-hw-item="${article}"] · в списке: ${rows.slice(0, 8).join(', ')}`);
  await row.first().click();
  await sleep(300);
  const cardVerdict = await page.evaluate(() => document.querySelector('[data-hw-card-verdict]')?.getAttribute('data-hw-card-verdict') ?? null);
  const button = page.locator('[data-hw-install]');
  must(`${label}: кнопка «Установить» у ${article}`, (await button.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-hw-install]');
  await button.first().click();
  const installed = await waitFor(page, (key) => document.querySelector(`[data-hw-slot="${key}"]`)?.getAttribute('data-hw-installed') ?? null, (v) => v === article, 20_000, slot);
  return { nlChips, rows, cardVerdict, installed: installed === article };
}

async function partDrawers(browser) {
  console.log('\n── DRAWERS (1440 × 900, HW-04): TANDEMBOX antaro — Производитель → Серия → NL → Артикул; ход, царги металлом, дно и задняя стенка в раскрое, смета, запись → перезагрузка');
  const fx = fixture('kitchen');
  const want = fixture('drawersExpect');
  await withOrg(
    'DRAWERS',
    browser,
    async ({ service, page, errors, consoleErrors, ids }) => {
      await openStudio(page, ids.kitchen);
      await open3d(page, 'DRAWERS');
      await saved(page);
      await hardwareFor(page, 'DRAWERS', want.module);
      const sidesBefore = await page.locator('[data-hw-slot="drawer_side"]').count();
      const runner = await installByPath(page, 'DRAWERS', 'slide', { brand: 'Blum', series: 'TANDEMBOX antaro', nl: 450, article: want.runner });
      const sidesAfter = await waitFor(page, () => document.querySelectorAll('[data-hw-slot="drawer_side"]').length, (n) => n > 0, 20_000);
      check(
        'DRAWERS.A ходовая TANDEMBOX antaro 576.4501M поставлена путём Blum → TANDEMBOX antaro → NL 450; места «Царги системы ящика» до неё нет, после — есть',
        runner.installed && runner.cardVerdict !== 'refused' && runner.nlChips.includes(450) && sidesBefore === 0 && sidesAfter > 0,
        `ходовая ${runner.installed ? 'стоит' : 'НЕТ'} (${runner.cardVerdict}) · NL кнопками ${runner.nlChips.join('/')} · мест царг ${sidesBefore} → ${sidesAfter}`,
      );
      /* Царги другой NL к ходовой 450 — отказ на строке списка, до нажатия. */
      await press(page, '[data-hw-slot="drawer_side"]', 'DRAWERS место царг');
      await press(page, '[data-hw-brand="Blum"]', 'DRAWERS');
      await press(page, '[data-hw-series="TANDEMBOX antaro"]', 'DRAWERS');
      await press(page, '[data-hw-nl="500"]', 'DRAWERS');
      const wrong = await page.evaluate(() => document.querySelector('[data-hw-item="MFR-BLUM-378M5002SA"]')?.getAttribute('data-hw-item-verdict') ?? null);
      check('DRAWERS.A2 царги 378M5002SA (NL 500) к ходовой NL 450 — отказ на строке списка до установки', wrong === 'refused', `вердикт строки: ${wrong ?? 'СТРОКИ НЕТ'}`);
      const sides = await installByPath(page, 'DRAWERS', 'drawer_side', { brand: 'Blum', series: 'TANDEMBOX antaro', nl: 450, article: want.sides });
      check('DRAWERS.A3 царги 378M4502SA поставлены тем же путём', sides.installed && sides.cardVerdict !== 'refused', `${sides.installed ? 'стоят' : 'НЕТ'} (${sides.cardVerdict})`);

      /* 3D: ход — по модели позиции (в паспорте не назван — условно, словами), царги — металлом, ходовые секции — по числу секций модели. */
      const drawer = await openAll(page, `${want.module}:drawer:0`, (v) => v.shift[2] >= want.travelMm - 1);
      await closeUp(page, `${want.module}:drawer:0`, [-0.7, 0.8, 0.9]);
      await page.screenshot({ path: `${OUT}/drawers-1-tandembox-open.png`, timeout: 120_000 });
      check(
        `DRAWERS.B ящик выехал на ${want.travelMm} мм (${want.travelWords}); едут: царги металлом 2 + ходовые секции 2 (секций у модели ${want.members}, средней нет), дно и задняя стенка раскроя; боковин ЛДСП нет`,
        Boolean(drawer) &&
          drawer.shift[2] === want.travelMm &&
          (drawer.names['mech:runner'] ?? 0) === 4 &&
          (drawer.names['mech:runner-middle'] ?? 0) === (want.members === 3 ? 2 : 0) &&
          (drawer.names['panel:Дно ящика'] ?? 0) === 1 &&
          (drawer.names['panel:Торец ящика'] ?? 0) === 1 &&
          (drawer.names['panel:Боковина ящика'] ?? 0) === 0,
        JSON.stringify(drawer),
      );
      await closeAll(page);

      /* Деталировка: дно и задняя стенка по формулам паспорта, боковин из плиты нет. */
      must('DRAWERS инструмент «Документы»', await tool(page, 'documents'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="documents"]');
      await page.locator('[data-studio-doc="panels"]').first().click();
      await page.waitForSelector('[data-panel-row]', { timeout: 30_000 });
      const boxRows = await page.evaluate(
        (id) =>
          Array.from(document.querySelectorAll(`[data-panel-row][data-module-id="${id}"]`))
            .map((tr) => ({ name: tr.children[1]?.textContent ?? '', size: tr.getAttribute('data-part-size') ?? '', qty: Number(tr.getAttribute('data-part-qty') ?? 0), part: tr.getAttribute('data-part-id') }))
            .filter((r) => /^(Дно|Торец|Боковина) ящика$/.test(r.name.trim())),
        want.module,
      );
      const flat = (name) =>
        boxRows
          .filter((r) => r.name.trim() === name)
          .flatMap((r) => Array.from({ length: r.qty }, () => r.size.split('x').slice(0, 2).join('x')))
          .sort();
      await page.screenshot({ path: `${OUT}/drawers-2-detailing.png`, timeout: 120_000 });
      check(
        `DRAWERS.C деталировка = движок: дно ${want.bottoms[0]} ×${want.bottoms.length} (LW − 75 × NL − 24), задняя стенка ${want.backs[0]} ×${want.backs.length} (LW − 87 × 84); боковин ящика из плиты 0`,
        JSON.stringify(flat('Дно ящика')) === JSON.stringify(want.bottoms) &&
          JSON.stringify(flat('Торец ящика')) === JSON.stringify(want.backs) &&
          flat('Боковина ящика').length === want.ldspSides,
        `дно ${flat('Дно ящика').join(', ')} · задняя ${flat('Торец ящика').join(', ')} · боковин ${flat('Боковина ящика').length}`,
      );
      const toMap = page.locator('[data-open-cutting]');
      must('DRAWERS в деталировке кнопка «Карта раскроя →»', (await toMap.count()) === 1, `НУЛЕВОЙ СЕЛЕКТОР: [data-open-cutting] ×${await toMap.count()}`);
      await toMap.first().click();
      await page.waitForSelector('[data-cutting-map]', { timeout: 60_000 });
      const map = await waitFor(page, () => (window.__mwCutting ? window.__mwCutting() : null), (s) => Boolean(s), 30_000);
      const reasons = map?.release.reasons ?? [];
      const boxIds = new Set(boxRows.map((r) => r.part));
      const onSheets = (map?.parts ?? []).filter((p) => boxIds.has(p.partId)).reduce((s, p) => s + p.qty, 0);
      check(
        'DRAWERS.D карта раскроя: дно и задняя стенка трёх ящиков на листах (6 деталей); выпуск заперт словами системы ящика',
        Boolean(map) && onSheets === want.bottoms.length + want.backs.length && want.releaseWords.length > 0 && reasons.some((r) => r.includes('система ящика')),
        `на листах ${onSheets} · причин ${reasons.length}: «${(reasons.find((r) => r.includes('система ящика')) ?? 'СЛОВ СИСТЕМЫ НЕТ').slice(0, 110)}»`,
      );

      /* Смета экрана: строка ходовой и строка царг — по комплекту на ящик, цены нет — «цена не задана». */
      const lines = await waitFor(
        page,
        () => (window.__mwEstimateLines ? window.__mwEstimateLines() : []),
        (l) => l.some((x) => x.key.startsWith('fitting_drawer_side_') && !x.key.endsWith('_missing')),
        30_000,
      );
      const sideLine = lines.find((x) => x.key.startsWith('fitting_drawer_side_') && !x.key.endsWith('_missing'));
      const slideLine = lines.find((x) => x.key.startsWith('fitting_slide_') && !x.key.endsWith('_missing'));
      check(
        `DRAWERS.E смета экрана: ходовая и царги — своими строками по ${want.drawers} (комплект на ящик), «цена не задана»`,
        sideLine?.quantity === want.drawers && slideLine?.quantity === want.drawers && Boolean(sideLine?.priceUnset) && Boolean(slideLine?.priceUnset),
        `царги ${sideLine ? `${sideLine.quantity} ${sideLine.unit} · ${sideLine.priceUnset}` : 'НЕТ'} · ходовая ${slideLine ? `${slideLine.quantity} ${slideLine.unit}` : 'НЕТ'}`,
      );

      /* Присадка — тот же план, что движок (TB5): отверстий системы нет, у фронта и задней стенки — напечатанное словами, выпуск заперт. */
      await openStudio(page, ids.kitchen);
      must('DRAWERS инструмент «Документы» (присадка)', await tool(page, 'documents'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="documents"]');
      const drillRow = page.locator('[data-studio-doc="drilling"]');
      must('DRAWERS строка «Присадка» в документах', (await drillRow.count()) === 1, `НУЛЕВОЙ СЕЛЕКТОР: [data-studio-doc="drilling"] ×${await drillRow.count()}`);
      await drillRow.first().click();
      await page.waitForSelector('[data-drilling-map]', { timeout: 60_000 });
      /*
       * План — когда каталог фурнитуры доехал до экрана (у модуля есть детали
       * короба ящика) и паспорта поставленных позиций дочитаны: до этого план
       * честно без коробов или с «паспорт ещё не дочитан».
       */
      const drill = await waitFor(
        page,
        () => window.__mwDrilling ?? null,
        (v) =>
          Boolean(v) &&
          v.parts.some((p) => p.moduleId === want.module && p.name === 'Дно ящика') &&
          !v.parts.some((p) => p.moduleId === want.module && p.pending.some((x) => x.why.some((w) => w.includes('не дочитан')))),
        90_000,
      );
      must('DRAWERS окошко присадки', Boolean(drill), 'нет window.__mwDrilling');
      const mine = drill.parts.filter((p) => p.moduleId === want.module);
      const fronts = mine.filter((p) => p.role === 'drawer_front');
      const backs = mine.filter((p) => (p.leaf ?? '').endsWith(':box:wall:2'));
      const carcassSides = mine.filter((p) => p.role === 'side_left' || p.role === 'side_right');
      await page.screenshot({ path: `${OUT}/drawers-3-drilling.png`, timeout: 120_000 });
      check(
        'DRAWERS.G «Присадка»: отверстий направляющей системы 0; у боковин корпуса — «высота ходовой системы ящика … не образмерена»; у каждого из 3 фронтов — крепление фасада INSERTA (Ø 10) словами; у каждой задней стенки — держатель словами; выпуск заперт',
        mine.every((p) => p.ops.every((o) => o.role !== 'runner_cabinet' && o.role !== 'runner_drawer')) &&
          carcassSides.length === 2 &&
          carcassSides.every((p) => p.pending.some((x) => x.why.some((w) => w.includes('ходовой системы ящика')))) &&
          fronts.length === want.drawers &&
          fronts.every((p) => p.pending.some((x) => x.what.includes('INSERTA') && x.why.some((w) => w.includes('Ø 10')))) &&
          backs.length === want.drawers &&
          backs.every((p) => p.pending.some((x) => x.what.includes('держатель задней стенки'))) &&
          drill.release.open === false,
        `фронтов ${fronts.length} (INSERTA ${fronts.filter((p) => p.pending.some((x) => x.what.includes('INSERTA'))).length}) · задних ${backs.length} · боковин ${carcassSides.length} · выпуск ${drill.release.open ? 'ОТКРЫТ' : 'заперт'} · детали: ${mine.map((p) => `${p.name}=${p.leaf}[${p.pending.map((x) => x.what.slice(0, 24)).join('/')}]`).join('; ').slice(0, 900)}`,
      );

      /* Запись → база → перезагрузка: обе позиции на местах. */
      await openStudio(page, ids.kitchen);
      await saved(page);
      const row = (await service.from('projects').select('millwork').eq('id', ids.kitchen).single()).data;
      const unit = (row?.millwork?.runs?.optimal?.modules ?? []).find((m) => m.id === want.module);
      const stored = (unit?.fittings ?? []).map((f) => f.slot).sort();
      check('DRAWERS.F в базе у ящиков: ходовая на месте направляющей и царги на месте царг', JSON.stringify(stored) === JSON.stringify(['drawer_side', 'slide']), stored.join(', ') || 'НИЧЕГО');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
      await sleep(1500);
      await open3d(page, 'DRAWERS');
      await hardwareFor(page, 'DRAWERS', want.module);
      const back = await page.evaluate(() => ({
        slide: document.querySelector('[data-hw-slot="slide"]')?.getAttribute('data-hw-installed') ?? null,
        sides: document.querySelector('[data-hw-slot="drawer_side"]')?.getAttribute('data-hw-installed') ?? null,
      }));
      const again = await openAll(page, `${want.module}:drawer:0`, (v) => v.shift[2] >= want.travelMm - 1);
      check(
        'DRAWERS.F2 после перезагрузки: ходовая и царги на местах, ящик выезжает на тот же ход с теми же деталями',
        back.slide === want.runner && back.sides === want.sides && again?.shift[2] === want.travelMm && (again?.names['mech:runner'] ?? 0) === 4,
        `${back.slide} · ${back.sides} · ход ${again?.shift[2]}`,
      );
      await closeAll(page);
      check('DRAWERS ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    {
      viewport: { width: 1440, height: 900 },
      production: { drawerBox: DRAWER_BOX },
      projects: [{ key: 'kitchen', zone: 'Кухня', fx }],
    },
  );
}

/* ═════════════════════════  WARDROBE  ═════════════════════════ */

async function partWardrobe(browser) {
  console.log('\n── WARDROBE (1440 × 900): пантограф b1 · выдвижная штанга b2 · система купе ряда');
  const fx = fixture('wardrobe');
  await withOrg(
    'WARDROBE',
    browser,
    async ({ page, errors, consoleErrors, ids }) => {
      await openStudio(page, ids.wardrobe);
      await open3d(page, 'WARDROBE');
      await saved(page);
      await hardwareFor(page, 'WARDROBE', 'tall-900@w1');
      const pg = await installVia(page, 'WARDROBE', 'pantograph@b1', 'MFR-HAFELE-805.20.625', '805.20.625');
      const po = await installVia(page, 'WARDROBE', 'wardrobe_pullout@b2', 'MFR-HAFELE-807.61.774', '807.61.774');
      const lowered = await openAll(page, 'tall-900@w1:b1:pantograph', (v) => v.shift[1] <= -599);
      const pulled = await moving(page, 'tall-900@w1:b2:pullout');
      await closeUp(page, 'tall-900@w1:b1:pantograph', [-0.5, 0.2, 1.8]);
      await page.screenshot({ path: `${OUT}/wardrobe-1-pantograph.png`, timeout: 120_000 });
      await closeAll(page);
      const kupe = await installVia(page, 'WARDROBE', 'sliding', 'MFR-HAFELE-400.51.121', '400.51.121');
      check('WARDROBE.C/D/I пантограф b1, выдвижная штанга b2 и система купе поставлены — не отказ', pg.installed && po.installed && kupe.installed && [pg, po, kupe].every((x) => x.cardVerdict !== 'refused'), [pg, po, kupe].map((x) => x.cardVerdict).join(', '));
      const leaf = await openAll(page, 'tall-0@w1:kupe:0', (v) => v.shift[0] >= 949);
      check('WARDROBE.C пантограф опустился на 600 и вышел на 350 мм; штанга с тягами (3) едет', Boolean(lowered) && lowered.shift[1] === -600 && lowered.shift[2] === 350 && lowered.names['mech:pantograph'] === 3, JSON.stringify(lowered));
      check('WARDROBE.D выдвижная штанга вышла на 369 мм (0,9 длины 410 по паспорту)', Boolean(pulled) && pulled.shift[2] === 369 && pulled.names['mech:pullout'] === 1, JSON.stringify(pulled));
      check('WARDROBE.I полотно купе 1 уехало вбок на 950 мм (шаг 1000 минус нахлёст 50)', Boolean(leaf) && leaf.shift[0] === 950 && (leaf.names['panel:Дверь-купе'] ?? 0) === 1, JSON.stringify(leaf));
      await page.screenshot({ path: `${OUT}/wardrobe-2-kupe.png`, timeout: 120_000 });
      await closeAll(page);
      check('WARDROBE ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 }, projects: [{ key: 'wardrobe', zone: 'Спальня', fx }] },
  );
}

/* ═════════════════════════  CARGO  ═════════════════════════ */

async function partCargo(browser) {
  console.log('\n── CARGO (1440 × 900): карго 200 — фасад выдвигается с корзинами');
  const fx = fixture('cargo');
  await withOrg(
    'CARGO',
    browser,
    async ({ page, errors, consoleErrors, ids }) => {
      await openStudio(page, ids.cargo);
      await open3d(page, 'CARGO');
      await saved(page);
      await hardwareFor(page, 'CARGO', 'base-0@w1');
      const cargo = await installVia(page, 'CARGO', 'cargo', 'MFR-HAFELE-547.10.481L', '547.10.481');
      check('CARGO.F 547.10.481L на карго 200 поставлена; источник спорит — «не проверено», а не «встаёт»', cargo.installed && cargo.cardVerdict === 'unverified', `${cargo.cardVerdict}`);
      const out = await openAll(page, 'base-0@w1:door:0', (v) => v.shift[2] >= 299);
      await closeUp(page, 'base-0@w1:door:0', [-0.7, 0.7, 1.0]);
      await page.screenshot({ path: `${OUT}/cargo-1-open.png`, timeout: 120_000 });
      check('CARGO.F2 фасад карго выдвинулся на 300 мм, не повернулся; корзины (6 коробок) едут с ним', Boolean(out) && out.shift[2] === 300 && out.rotationDeg[1] === 0 && out.names['mech:basket'] === 6, JSON.stringify(out));
      await closeAll(page);
      check('CARGO ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 }, projects: [{ key: 'cargo', zone: 'Кухня', fx }] },
  );
}

/* ═════════════════════════  CORNER  ═════════════════════════ */

async function partCorner(browser) {
  console.log('\n── CORNER (1440 × 900): угловая кухня — петля на модуле стены Б');
  const fx = fixture('kitchen');
  await withOrg(
    'CORNER',
    browser,
    async ({ service, page, errors, consoleErrors, ids }) => {
      await openStudio(page, ids.corner);
      await open3d(page, 'CORNER');
      await saved(page);
      must('CORNER инструмент «Выбор»', await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="select"]');
      let wallB = await page.evaluate(() => Array.from(document.querySelectorAll('[data-object-module]')).map((n) => n.getAttribute('data-object-module')).filter((id) => id && id.endsWith('@w2')));
      if (wallB.length === 0) {
        /* Стена Б — в списке объектов «Выбора»: модули показаны у выбранной стены. */
        const wallButton = page.locator('[data-object-wall="w2"]');
        if ((await wallButton.count()) > 0) {
          await wallButton.first().click();
          await sleep(800);
        }
        wallB = await page.evaluate(() => Array.from(document.querySelectorAll('[data-object-module]')).map((n) => n.getAttribute('data-object-module')).filter((id) => id && id.endsWith('@w2')));
      }
      const seen = await page.evaluate(() => ({
        modules: Array.from(document.querySelectorAll('[data-object-module]')).map((n) => n.getAttribute('data-object-module')),
        walls: Array.from(document.querySelectorAll('[data-wall], [data-wall-id], [data-wall-tab], [data-object-wall]')).map((n) => `${n.tagName}:${['data-wall', 'data-wall-id', 'data-wall-tab', 'data-object-wall'].map((k) => n.getAttribute(k)).filter(Boolean).join('/')}:${(n.textContent ?? '').trim().slice(0, 20)}`),
        shape: Array.from(document.querySelectorAll('[data-shape-kind]')).map((n) => `${n.getAttribute('data-shape-kind')}:${n.getAttribute('aria-pressed')}`),
      }));
      await page.screenshot({ path: `${OUT}/corner-0-open.png`, timeout: 120_000 });
      must('CORNER модули стены Б в списке объектов', wallB.length > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-object-module$="@w2"] · модули: ${seen.modules.join(', ')} · стены: ${seen.walls.slice(0, 8).join(' | ')} · форма: ${seen.shape.join(', ')}`);
      const target = wallB.find((id) => /^base-/.test(id ?? '') && !/sink|hob|dishwasher|corner/.test(id ?? '')) ?? null;
      must('CORNER на стене Б есть обычный нижний модуль', Boolean(target), `модули стены Б: ${wallB.join(', ')}`);
      await hardwareFor(page, 'CORNER', target);
      const slots = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hw-slot]')).map((b) => b.getAttribute('data-hw-slot')));
      must('CORNER у модуля стены Б есть место петель', slots.includes('hinge'), `места: ${slots.join(', ')}`);
      const hinge = await installVia(page, 'CORNER', 'hinge', 'MFR-BLUM-71B3550', '71B3550');
      await saved(page);
      await page.screenshot({ path: `${OUT}/corner-1-wall-b-hinge.png`, timeout: 120_000 });
      check('CORNER.H петля на модуле стены Б угловой кухни поставлена', hinge.installed, `${target} · ${hinge.cardVerdict}`);
      const row = (await service.from('projects').select('millwork').eq('id', ids.corner).single()).data;
      const walls = row?.millwork?.wallRuns ?? {};
      const holders = Object.entries(walls)
        .filter(([, run]) => [...(run.modules ?? []), ...(run.upperSegments ?? []).flatMap((sg) => sg.modules)].some((m) => m.id === target && (m.fittings ?? []).some((f) => f.slot === 'hinge')))
        .map(([key]) => key);
      const onA = [...(row?.millwork?.runs?.optimal?.modules ?? [])].some((m) => (m.fittings ?? []).length > 0);
      check('CORNER.H2 петля записана в ряд стены Б (wallRuns), стена А без позиций', holders.length === 1 && !onA, `ряды с петлёй: ${holders.join(', ') || 'НИ ОДНОГО'} · на стене А ${onA ? 'ЕСТЬ' : 'нет'}`);
      check('CORNER ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    {
      viewport: { width: 1440, height: 900 },
      projects: [
        {
          key: 'corner',
          zone: 'Кухня',
          fx,
          /* Новая угловая кухня: шаблон есть, рядов в сохранении нет — обе стены собирает экран (без шаблона Studio открыла бы пустую стену). */
          millwork: { survey: fx.survey, requirements: fx.requirements, shape: 'corner_l', templateId: 'linear-column', selectedVariant: 'optimal' },
        },
      ],
    },
  );
}

/* ═════════════════════════  TABLET  ═════════════════════════ */

async function partTablet(browser) {
  console.log('\n── TABLET (1024 × 768, касание): панель «Фурнитура» в экране, список виртуальный, установка касанием');
  const fx = fixture('kitchen');
  await withOrg(
    'TABLET',
    browser,
    async ({ page, errors, consoleErrors, ids }) => {
      await openStudio(page, ids.kitchen);
      await saved(page);
      await hardwareFor(page, 'TABLET', 'base-1200@w1');
      await page.locator('[data-hw-slot="hinge"]').first().tap();
      await sleep(600);
      const layout = await page.evaluate(() => {
        const panel = document.querySelector('[data-hw-panel]')?.getBoundingClientRect();
        const count = Number(document.querySelector('[data-hw-count]')?.getAttribute('data-hw-count') ?? NaN);
        return {
          pageScroll: document.scrollingElement.scrollWidth - window.innerWidth,
          inside: Boolean(panel && panel.left >= -1 && panel.right <= window.innerWidth + 1),
          rows: document.querySelectorAll('[data-hw-item]').length,
          count,
        };
      });
      await page.screenshot({ path: `${OUT}/tablet-1-panel.png`, timeout: 120_000 });
      check(
        'TABLET.1 1024 px: панель в экране, прокрутки по ширине нет; в DOM строк не больше 20 при сотнях позиций места',
        layout.pageScroll <= 0 && layout.inside && layout.rows > 0 && layout.rows <= 20 && layout.count > 100,
        `прокрутка ${layout.pageScroll} · панель ${layout.inside ? 'в экране' : 'ЗА КРАЕМ'} · строк в DOM ${layout.rows} из ${layout.count}`,
      );
      await page.locator('[data-hw-search]').first().fill('71B3550');
      await sleep(400);
      await page.locator('[data-hw-item="MFR-BLUM-71B3550"]').first().tap();
      await sleep(300);
      await page.locator('[data-hw-install]').first().tap();
      const installed = await waitFor(page, () => document.querySelector('[data-hw-slot="hinge"]')?.getAttribute('data-hw-installed') ?? null, (v) => v === 'MFR-BLUM-71B3550', 20_000);
      await page.screenshot({ path: `${OUT}/tablet-2-installed.png`, timeout: 120_000 });
      check('TABLET.2 установка касанием: место называет артикул', installed === 'MFR-BLUM-71B3550', `${installed}`);
      check('TABLET ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width: 1024, height: 768 }, touch: true, projects: [{ key: 'kitchen', zone: 'Кухня', fx }] },
  );
}

/* ═════════════════════════  CATALOG2 (HW-02)  ═════════════════════════ */

/** Серия как её считает панель (`seriesOf`): напечатанная, иначе «без серии». */
const seriesOfFact = (it) => (it.hardware.series ?? '').trim() || 'без серии';

async function partCatalog2(browser) {
  console.log('\n── CATALOG2 (1440 × 900): производитель → серия → артикул, размер, замена производителя, избранное и недавние');
  const fx = fixture('kitchen');
  await withOrg(
    'CATALOG2',
    browser,
    async ({ page, errors, consoleErrors, ids }) => {
      await openStudio(page, ids.kitchen);
      await hardwareFor(page, 'CATALOG2', 'base-3300@w1');
      /* Без места — весь каталог: числа на кнопках новых производителей = фактам. */
      const brands = await page.evaluate(() =>
        Object.fromEntries(Array.from(document.querySelectorAll('[data-hw-brand]')).map((b) => [b.getAttribute('data-hw-brand'), Number(b.getAttribute('data-hw-brand-count'))])),
      );
      const NEW = ['DTC', 'Firmax', 'Alphalux', 'Unihopper', 'МФ-Комплект', 'BOYARD'];
      check(
        'CAT.1 кнопки производителей: DTC, Firmax, Alphalux, Unihopper, МФ-Комплект и BOYARD — числами фактов',
        NEW.every((m) => brands[m] === byManufacturer[m]),
        NEW.map((m) => `${m} ${brands[m]}/${byManufacturer[m]}`).join(' · '),
      );
      await page.locator('[data-hw-brand="BOYARD"]').first().click();
      await sleep(400);
      const boyardSeries = new Map();
      for (const it of FACTS.items.filter((x) => x.hardware.manufacturer === 'BOYARD')) boyardSeries.set(seriesOfFact(it), (boyardSeries.get(seriesOfFact(it)) ?? 0) + 1);
      const top = Array.from(boyardSeries.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))[0];
      const seriesList = Number((await page.locator('[data-hw-series-list]').first().getAttribute('data-hw-series-list').catch(() => '0')) ?? 0);
      const chip = page.locator(`[data-hw-series="${top[0]}"]`);
      must('CAT.2 серии BOYARD кнопками', (await chip.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-hw-series="${top[0]}"]`);
      await chip.first().click();
      await sleep(400);
      const count = Number(await page.locator('[data-hw-count]').first().getAttribute('data-hw-count'));
      await page.screenshot({ path: `${OUT}/catalog2-1-series.png`, timeout: 120_000 });
      check(
        `CAT.2 серий у BOYARD ${boyardSeries.size} (как в фактах); «${top[0]}» — ${top[1]} позиций в списке`,
        seriesList === boyardSeries.size && count === top[1],
        `серий на экране ${seriesList} · в списке ${count}`,
      );
      await page.locator('[data-hw-brand="all"]').first().click();
      await sleep(300);

      /* Место «Направляющие» и отбор по размеру 500: каждая видимая строка — с 500 среди размеров или в пределах. */
      await page.locator('[data-hw-slot="slide"]').first().click();
      await page.locator('[data-hw-size]').first().fill('500');
      await sleep(500);
      const sized = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hw-item]')).map((b) => b.getAttribute('data-hw-item')));
      const factBy = new Map(FACTS.items.map((it) => [it.article, it]));
      const fits500 = (it) =>
        Object.values(it.hardware.dimensionsMm ?? {}).some((v) => Math.abs(v - 500) < 0.05) || Object.values(it.hardware.ranges ?? {}).some(([a, b]) => 500 >= a && 500 <= b);
      check(
        'CAT.3 размер 500 мм у места «Направляющие»: каждая строка списка — с 500 среди размеров для подбора или в пределах паспорта',
        sized.length > 0 && sized.every((a) => factBy.get(a) && fits500(factBy.get(a))),
        `строк на экране ${sized.length}${sized.find((a) => !fits500(factBy.get(a) ?? { hardware: {} })) ? ` · не по размеру: ${sized.find((a) => !fits500(factBy.get(a) ?? { hardware: {} }))}` : ''}`,
      );
      await page.locator('[data-hw-size]').first().fill('');

      /* Замена производителя: KA 500 → карточка → аналог → его карточка → «Установить». */
      const ka = await installVia(page, 'CATALOG2', 'slide', 'MFR-HETTICH-9114276', '9114276');
      must('CAT.4 KA 500 на месте', ka.installed, `${JSON.stringify(ka)}`);
      await page.locator('[data-hw-search]').first().fill('9114276');
      await sleep(400);
      await page.locator('[data-hw-item="MFR-HETTICH-9114276"]').first().click();
      const analogs = Number(await waitFor(page, () => document.querySelector('[data-hw-analogs]')?.getAttribute('data-hw-analogs') ?? '0', (v) => v !== '0', 10_000));
      const firstAnalog = await page.locator('[data-hw-analog]').first().getAttribute('data-hw-analog');
      const analogVerdict = await page.locator('[data-hw-analog]').first().getAttribute('data-hw-analog-verdict');
      await page.screenshot({ path: `${OUT}/catalog2-2-analogs.png`, timeout: 120_000 });
      await page.locator('[data-hw-favorite]').first().click();
      const fav = await page.locator('[data-hw-favorite]').first().getAttribute('data-hw-favorite');
      await page.locator('[data-hw-analog]').first().click();
      const card = await waitFor(page, () => document.querySelector('[data-hw-card]')?.getAttribute('data-hw-card') ?? null, (v) => v !== 'MFR-HETTICH-9114276', 10_000);
      await page.locator('[data-hw-install]').first().click();
      const swapped = await waitFor(page, () => document.querySelector('[data-hw-slot="slide"]')?.getAttribute('data-hw-installed') ?? null, (v) => v === card, 20_000);
      check(
        'CAT.4 карточка KA 500: аналогов 14 (как в движке, HK1), первый открывается своей карточкой и ставится той же «Установить» — на месте его артикул',
        analogs === 14 && firstAnalog === card && analogVerdict !== 'refused' && swapped === card,
        `аналогов ${analogs} · первый ${firstAnalog} (${analogVerdict}) · карточка ${card} · на месте ${swapped}`,
      );
      check('CAT.5 «В избранное» в карточке', fav === 'on', `${fav}`);
      await saved(page);

      /* Избранное и недавние — устройство: после перезагрузки на месте. */
      await openStudio(page, ids.kitchen);
      await hardwareFor(page, 'CATALOG2', 'base-3300@w1');
      const favCount = await page.locator('[data-hw-list-mode="favorites"]').first().textContent();
      await page.locator('[data-hw-list-mode="favorites"]').first().click();
      await sleep(400);
      const favRows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hw-item]')).map((b) => b.getAttribute('data-hw-item')));
      await page.locator('[data-hw-list-mode="recent"]').first().click();
      await sleep(400);
      const recentRows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hw-item]')).map((b) => b.getAttribute('data-hw-item')));
      const slideNow = await page.evaluate(() => document.querySelector('[data-hw-slot="slide"]')?.getAttribute('data-hw-installed') ?? null);
      await page.screenshot({ path: `${OUT}/catalog2-3-recent.png`, timeout: 120_000 });
      check(
        'CAT.5 после перезагрузки: в избранном KA 500; в недавних первым — аналог, потом KA 500; на месте — аналог',
        /1/.test(favCount ?? '') &&
          JSON.stringify(favRows) === JSON.stringify(['MFR-HETTICH-9114276']) &&
          recentRows[0] === card &&
          recentRows.includes('MFR-HETTICH-9114276') &&
          slideNow === card,
        `избранное «${favCount}» ${favRows.join(',')} · недавние ${recentRows.slice(0, 3).join(',')} · на месте ${slideNow}`,
      );
      check('CATALOG2 ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 }, projects: [{ key: 'kitchen', zone: 'Кухня', fx }] },
  );
}

/* ═════════════════════════  DRILLING (HW-08, HW-09)  ═════════════════════════ */

/** Записи ZIP (метод «хранение»): имена из центрального каталога. */
function zipNames(bytes) {
  const buf = Buffer.from(bytes);
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) return null;
  const n = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < n; i += 1) {
    if (buf.readUInt32LE(at) !== 0x02014b50) return null;
    const len = buf.readUInt16LE(at + 28);
    const extra = buf.readUInt16LE(at + 30);
    const comment = buf.readUInt16LE(at + 32);
    names.push(buf.subarray(at + 46, at + 46 + len).toString('utf8'));
    at += 46 + len + extra + comment;
  }
  return names;
}

/** Правила присадки цеха — те же, что у приёмки движка (verify-drilling). */
const DRILL_RULES = {
  hingeEdgeMm: 100,
  hingeCount: [
    { upToMm: 900, hinges: 2 },
    { upToMm: 1600, hinges: 3 },
  ],
  plateOnCupAxis: true,
  handleHoleMm: 5,
  handlePlaceConfirmed: true,
  shelfSupport: { frontMm: 37, backMm: 37 },
  confirmat: { faceDiameterMm: 7, edgeDiameterMm: 5, edgeDepthMm: 50, fromFrontMm: 50, fromBackMm: 50 },
  minRemainMm: 3,
  confirmed: true,
};

async function partDrilling(browser) {
  console.log('\n── DRILLING (1440 × 900): CLIP top + планка → «Присадка»: чашки и планка числами движка, выпуск, «Экспорт для БАЗИС»');
  const fx = fixture('kitchen');
  await withOrg(
    'DRILLING',
    browser,
    async ({ page, errors, consoleErrors, ids }) => {
      await openStudio(page, ids.kitchen);
      await hardwareFor(page, 'DRILLING', 'base-1200@w1');
      const hinge = await installVia(page, 'DRILLING', 'hinge', 'MFR-BLUM-71B3550', '71B3550');
      const plate = await installVia(page, 'DRILLING', 'hinge_plate', 'MFR-BLUM-173L8130', '173L8130');
      must('DRILLING петля и планка на местах', hinge.installed && plate.installed, `${JSON.stringify({ hinge, plate })}`);
      await saved(page);
      must('DRILLING инструмент «Документы»', await tool(page, 'documents'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="documents"]');
      const row = page.locator('[data-studio-doc="drilling"]');
      must('DRILLING строка «Присадка» в документах', (await row.count()) === 1, `НУЛЕВОЙ СЕЛЕКТОР: [data-studio-doc="drilling"] ×${await row.count()}`);
      await row.first().click();
      await page.waitForSelector('[data-drilling-map]', { timeout: 60_000 });
      const probe = await waitFor(page, () => window.__mwDrilling ?? null, (v) => Boolean(v), 30_000);
      must('DRILLING окошко присадки', Boolean(probe), 'нет window.__mwDrilling');
      const door = probe.parts.find((p) => p.moduleId === 'base-1200@w1' && p.role === 'door' && p.leaf === 'door:0');
      const side = probe.parts.find((p) => p.moduleId === 'base-1200@w1' && p.role === 'side_left');
      const cups = (door?.ops ?? []).filter((o) => o.role === 'hinge_cup');
      const plates = (side?.ops ?? []).filter((o) => o.role === 'hinge_plate');
      await page.screenshot({ path: `${OUT}/drilling-1-map.png`, timeout: 120_000 });
      check(
        'DRILL.1 чашки CLIP top на дверце 716 × 442 — X 100 и 616, Y 21,5, Ø35 × 13, пласть B; планка — 4 отверстия Ø5 на 37 от кромки (числа приёмки движка DR2–DR3)',
        door?.lengthMm === 716 &&
          JSON.stringify(cups.map((o) => o.xMm)) === JSON.stringify([100, 616]) &&
          cups.every((o) => o.yMm === 21.5 && o.diameterMm === 35 && o.depthMm === 13 && o.face === 'B') &&
          JSON.stringify(plates.map((o) => o.xMm).sort((a, b) => a - b)) === JSON.stringify([86, 118, 602, 634]) &&
          plates.every((o) => o.yMm === 37 && o.diameterMm === 5),
        `дверца ${door?.lengthMm}×${door?.widthMm} · чашки ${cups.map((o) => `${o.xMm}/${o.yMm}`).join(', ')} · планка ${plates.map((o) => o.xMm).join(', ')}`,
      );
      const release = await page.locator('[data-drilling-map]').first().getAttribute('data-release');
      const csvDisabled = await page.locator('[data-drill-export="csv"]').first().isDisabled();
      check(
        'DRILL.2 выпуск заперт причинами словами (не всё рассчитано) — CSV и DXF закрыты, PDF подписан «черновика»',
        release === 'locked' && csvDisabled && probe.release.reasons.length > 0 && /черновика/.test((await page.locator('[data-drill-export="pdf"]').first().textContent()) ?? ''),
        `${release} · ${probe.release.reasons.slice(0, 2).join(' | ')}`,
      );
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.locator('[data-drill-export="bazis"]').first().click()]);
      const file = `${OUT}/bazis-package.zip`;
      await download.saveAs(file);
      const names = zipNames(readFileSync(file)) ?? [];
      const manifest = await page.evaluate(() => window.__mwBazis ?? null);
      const notice = (await page.locator('[data-drill-notice]').first().textContent()) ?? '';
      await page.screenshot({ path: `${OUT}/drilling-2-bazis.png`, timeout: 120_000 });
      check(
        'DRILL.3 «Экспорт для БАЗИС»: ZIP с nomenclature.xml, parts.csv, hardware.csv, model.obj, manifest.json и README.txt; присадки в нём нет (выпуск заперт); ни .b3d, ни .cfrn; на экране «Экспорт создан; проверка в БАЗИС ожидается»',
        ['nomenclature.xml', 'parts.csv', 'hardware.csv', 'model.obj', 'manifest.json', 'README.txt'].every((n) => names.includes(n)) &&
          !names.some((n) => n.startsWith('drilling') || n.startsWith('dxf/') || /\.(b3d|f3d|fr3d|cfrn)$/i.test(n)) &&
          manifest?.drilling?.issued === false &&
          manifest?.bazisCheck === 'Экспорт создан; проверка в БАЗИС ожидается' &&
          notice.includes('Экспорт создан; проверка в БАЗИС ожидается'),
        `${names.join(', ')} · «${notice.slice(0, 90)}»`,
      );
      check('DRILLING ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 }, projects: [{ key: 'kitchen', zone: 'Кухня', fx }], production: { drawerBox: DRAWER_BOX, drilling: DRILL_RULES } },
  );
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
  /* Журнал сервера — в файл: причину «каталог не прочитался» сервер пишет туда (ловушка 470), а не на экран. */
  const serverLog = createWriteStream(`${OUT}/server-${PARTS.join('-')}.log`);
  server = spawn('npx', ['next', 'start', '-p', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'], shell: true, env: { ...process.env, SITE_PASSWORD: '' } });
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);
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
    const startedAt = Date.now();
    try {
      if (part === 'import') await partImport(browser);
      if (part === 'kitchen') await partKitchen(browser);
      if (part === 'kitchen-drawers') await partKitchenDrawers(browser);
      if (part === 'kitchen-lift') await partKitchenLift(browser);
      if (part === 'wardrobe') await partWardrobe(browser);
      if (part === 'cargo') await partCargo(browser);
      if (part === 'corner') await partCorner(browser);
      if (part === 'tablet') await partTablet(browser);
      if (part === 'catalog2') await partCatalog2(browser);
      if (part === 'drilling') await partDrilling(browser);
      if (part === 'drawers') await partDrawers(browser);
      done.push(part);
      console.log(`  ·    ${part}: ${Math.round((Date.now() - startedAt) / 1000)} с`);
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
