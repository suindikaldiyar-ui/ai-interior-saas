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
 *   PART=open, twin — открытие без списка производителей; реестр 3D петлёй-тестом.
 *   PART=tandembox — 1440 × 900 × 2: реконструкция TANDEMBOX antaro по чертежу
 *     Blum «Импортом CAD-фурнитуры» (материалы как в файле) → путь панели → модель
 *     на ящиках, ход, металл со своей картой окружения, снимки крупным планом.
 *   PART=clip — то же для петли CLIP top BLUMOTION 71B3550 с планкой 175H3130:
 *     чашка едет со створкой, плечо и планка стоят.
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
const KNOWN = ['import', 'kitchen', 'kitchen-drawers', 'kitchen-lift', 'wardrobe', 'cargo', 'corner', 'tablet', 'catalog2', 'drilling', 'drawers', 'open', 'twin', 'tandembox', 'clip', 'aventos', 'real', 'import-ui', 'fronts', 'fronts-tablet', 'ceiling', 'ceiling-tablet', 'inner'];
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
  const items = await waitFor(page, () => { const p = document.querySelector('[data-hw-panel]'); const s = p?.getAttribute('data-hw-list'); return s === 'ready' || s === 'demo' ? Number(p.getAttribute('data-hw-items') ?? 0) : s === 'error' ? -1 : 0; }, (n) => n !== 0, 60_000);
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
  const insert = (chunk) => service.from('catalog_items').insert(chunk.map((row) => ({ org_id: orgId, category_id: category.id, ...row, is_active: true }))).select('id');
  /*
   * Две пачки разом, а не четыре: на медленном канале четыре запроса по 400
   * строк обрывались «fetch failed» на одной и той же пачке. Оборванная пачка
   * повторяется ОДИН раз частями по 100 — с записью в журнал; не вышло —
   * падение. Пропусков нет: число строк сверяется в конце.
   */
  for (let i = 0; i < chunks.length; i += 2) {
    const group = chunks.slice(i, i + 2);
    const results = await Promise.all(group.map(insert));
    for (const [k, result] of results.entries()) {
      if (!result.error) {
        added += result.data?.length ?? 0;
        continue;
      }
      if (!/fetch failed/i.test(result.error.message)) throw new Error(`засев фурнитуры: записано ${added} из ${rows.length}, дальше: ${result.error.message}`);
      console.log(`  ·    засев: пачка ${i + k + 1} оборвалась («${result.error.message}») — повтор частями по 100`);
      const chunk = group[k];
      for (let at = 0; at < chunk.length; at += 100) {
        const again = await insert(chunk.slice(at, at + 100));
        if (again.error) throw new Error(`засев фурнитуры: записано ${added} из ${rows.length}, повтор не прошёл: ${again.error.message}`);
        added += again.data?.length ?? 0;
      }
    }
  }
  const { count, error: countError } = await service.from('catalog_items').select('id', { count: 'exact', head: true }).eq('org_id', orgId).like('article', 'MFR-%');
  if (countError || count !== FACT_COUNT) throw new Error(`после засева позиций ${count} при ${FACT_COUNT} в фактах${countError ? `: ${countError.message}` : ''}`);
  console.log(`  ·    каталог фурнитуры засеян: ${added} строк за ${Math.round((Date.now() - startedAt) / 1000)} с`);
}

async function withOrg(label, browser, body, { viewport, touch = false, projects = [], importHardware = true, production = null, scale = 1 }) {
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
    const context = await browser.newContext({ viewport, hasTouch: touch, acceptDownloads: true, deviceScaleFactor: scale });
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
      /*
       * Загрузка идёт частями (ТЗ 2026-11-02), и конец её говорит экран (`data-admin-hardware-result`), а не
       * таймер приёмки: прежние 120 с опроса базы пустая организация (5264 вставки) перерастала — 4800 из 5264.
       */
      const startedAt = Date.now();
      await page.locator('[data-admin-hardware-confirm]').first().click();
      const result = await waitFor(page, () => document.querySelector('[data-admin-hardware-result]')?.getAttribute('data-admin-hardware-result') ?? null, (v) => v === 'done' || v === 'error', 600_000);
      const words = await page.evaluate(() => document.querySelector('[data-admin-hardware-result]')?.textContent ?? '');
      const after = await countMfr(service, org.id);
      const { data: priced } = await service.from('catalog_items').select('id').eq('org_id', org.id).like('article', 'MFR-%').gt('price', 0).limit(1);
      check(
        'IMPORT.2 «Загрузить» — экран сказал «готово»; в каталоге организации ровно столько позиций, сколько в фактах; цены нет ни у одной («цена не задана»)',
        result === 'done' && before === 0 && after === FACT_COUNT && (priced ?? []).length === 0,
        `${result} за ${Math.round((Date.now() - startedAt) / 1000)} с · «${words.replace(/\s+/g, ' ').slice(0, 160)}» · до ${before} · после ${after} из ${FACT_COUNT} · с ценой ${(priced ?? []).length}`,
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
      /* Звенья петель на открытой дверце модуля в 1200 мм от начала ряда: до правки осей они тянулись на эти 1,2 м через комнату. */
      const links = await page.evaluate(() => (window.__mwHingeLinks ? window.__mwHingeLinks() : null));
      /* Дверца с 71B3550: её звенья отдельно — у соседних створок без петли каталога звенья условные. */
      const doorLinks = await page.evaluate(() => (window.__mwHingeLinks ? window.__mwHingeLinks('base-1200@w1:door:0') : null));
      check(
        'KITCHEN.A3 звенья петель открытых створок короче 0,1 м, аномалий сцены нет; у дверцы с 71B3550 — четырёхзвенник: 2 петли × 2 звена той же длины, что в закрытой позе; у створок без петли каталога звеньев на ходу нет (кинематика не подтверждена — растягивающихся звеньев нет)',
        Boolean(links) && links.count > 0 && links.maxM <= 0.1 && links.anomalies === 0 && Boolean(doorLinks) && doorLinks.count === 4 && doorLinks.driftM < 1e-6 &&
          /* Створки без петли каталога (кинематика не подтверждена) на ходу звеньев не рисуют — все звенья кадра у дверцы с 71B3550. */
          links.count === doorLinks.count,
        `${JSON.stringify(links).slice(0, 200)} · дверца: ${JSON.stringify(doorLinks)}`,
      );
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
          drawer.middleShift[2] === 250 &&
          /* Ходовая и средняя секции — С-профилем (ТЗ 2026-10-31, § 8). */
          (drawer.sections?.['runner-channel'] ?? 0) === 4,
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
      void metal1;
      const lift = await installVia(page, 'KITCHEN', 'lift', 'MFR-BLUM-22S2800', '22S2800');
      /* HS top — механизмом (решение владельца 2026-11-01, п. 4): у каждой боковины модель, а не коробки-заглушки. */
      const hsDoor = 'upper-1200@w1:door:0';
      const hsAll = () => page.evaluate((door) => (window.__mwAventos ? window.__mwAventos().filter((m) => m.door === door) : []), hsDoor);
      const hs0 = await waitFor(page, (door) => (window.__mwAventos ? window.__mwAventos().filter((m) => m.door === door) : []), (v) => v.length === 2, 30_000, hsDoor);
      check('KITCHEN.E подъёмник HS top поставлен: механизм у обеих боковин (модель HS top), в закрытом звенья — своей длины', lift.installed && hs0.length === 2 && hs0.every((m) => m.family === 'HS top' && m.u === 0), JSON.stringify(hs0.map((m) => ({ side: m.side, family: m.family, u: m.u, links: m.links.map((l) => l.lengthMm?.toFixed(2)) }))));
      const up = await openAll(page, hsDoor, (v) => Math.abs(v.rotationDeg[0]) >= 60);
      const hs1 = await hsAll();
      await closeUp(page, hsDoor, [-0.6, -0.3, 1.2]);
      await page.screenshot({ path: `${OUT}/kitchen-4-lift.png`, timeout: 120_000 });
      const hsEnds = hs1.flatMap((m) => m.links.map((l, i) => (l.to && m.onFront[i] ? Math.hypot(l.to[1] - m.onFront[i][1], l.to[2] - m.onFront[i][2]) * 1000 : Infinity)));
      check(
        'KITCHEN.E2 фасад поднят по механизму HS top (поворот 72,7°): у обеих боковин концы звеньев на осях крепления фасада (± 0,5 мм), звенья своей длины',
        Boolean(up) && Math.abs(Math.abs(up.rotationDeg[0]) - 72.7) < 0.5 && hs1.length === 2 && hs1.every((m) => Math.abs(m.u - 1) < 1e-6) && hsEnds.every((d) => d <= 0.5) && hs1.every((m) => m.links.every((l) => Math.abs(l.lengthMm - l.designMm) <= 0.05)),
        `поворот ${up?.rotationDeg?.[0]?.toFixed(1)}° · концы звеньев от осей фасада ${hsEnds.map((d) => d.toFixed(2)).join(' / ')} мм`,
      );
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

/* ═════════════════════════  AVENTOS (решение владельца 2026-11-01, п. 4)  ═════════════════════════ */

/**
 * ПОДЪЁМНИК AVENTOS МЕХАНИЗМОМ: HK top на антресоли 350, HL top на антресоли 400 под потолком 3100.
 * Путь: «Фурнитура» → «Подъёмник» → артикул → «Установить». Поза читается зондом `__mwAventos` из
 * мировых матриц: звенья своей длины, конец звена — на оси крепления фасада, а ось эта меряется через
 * группу полотна `InteractiveDoor` (две разные ветки кода: фасад и рычаг). Ход: 0, половина, весь.
 */
async function aventosCase(ctx, key, expect, shots) {
  const { page, service, ids } = ctx;
  const L = `AV-${expect.family.replace(' top', '')}`;
  await openStudio(page, ids[key]);
  await open3d(page, L);
  await saved(page);
  await hardwareFor(page, L, expect.module);
  const inst = await installVia(page, L, 'lift', expect.article, expect.article.replace('MFR-BLUM-', ''));
  const all = (door) => (window.__mwAventos ? window.__mwAventos().filter((m) => m.door === door) : []);
  const state = () => page.evaluate(all, expect.door);
  const wait = (test, ms = 60_000) => waitFor(page, all, (v) => v.length === 2 && test(v), ms, expect.door);
  /* Концы звеньев — на осях крепления, прочитанных через полотно фасада (y, z мира), мм. */
  const ends = (list) =>
    list.flatMap((m) => {
      const pairs = expect.family === 'HK top' ? [[m.links[1].to, m.onFront[0]]] : m.links.map((l, i) => [l.to, m.onFront[i]]);
      return pairs.map(([a, b]) => (a && b ? Math.hypot(a[1] - b[1], a[2] - b[2]) * 1000 : Infinity));
    });
  const rigid = (list) => list.every((m) => m.links.length === expect.linksMm.length && m.links.every((l, i) => Math.abs(l.lengthMm - expect.linksMm[i]) <= 0.05));
  const shot = async (name, offset) => {
    const st = await state();
    const left = st.find((m) => m.side === 'left') ?? st[0];
    const target = left.links[0].from;
    await page.evaluate((pose) => (window.__mwCadCamera ? window.__mwCadCamera(pose) : null), { position: [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]], target });
    await sleep(2500);
    await page.screenshot({ path: `${OUT}/${name}`, timeout: 120_000 });
  };
  const s0 = await wait((v) => v.every((m) => m.u === 0));
  check(
    `${L}.1 ${expect.article} поставлен путём панели: у обеих боковин механизм ${expect.family}${expect.armSet ? ` (рычаги ${expect.armSet} — по высоте корпуса)` : ''}, звенья ${expect.linksMm.map((v) => v.toFixed(2)).join(' / ')} мм, металл со своей картой окружения`,
    inst.installed && s0.length === 2 && s0.every((m) => m.key === expect.key && m.ownEnv) && rigid(s0) && new Set(s0.map((m) => m.side)).size === 2,
    `${inst.cardVerdict} · ${JSON.stringify(s0.map((m) => ({ side: m.side, key: m.key, links: m.links.map((l) => l.lengthMm?.toFixed(2)) })))}`,
  );
  await shot(`${shots}-0-closed.png`, [-0.55, 0.12, 0.85]);
  const preset = page.locator('[data-scene-preset-select]');
  const usual = (await preset.count()) > 0 ? await preset.first().inputValue() : null;
  if (usual !== null) {
    await preset.first().selectOption('hardware');
    await sleep(1500);
    await shot(`${shots}-1-closed-hardware.png`, [-0.4, 0.05, 0.6]);
    await preset.first().selectOption(usual);
    await sleep(1000);
  }
  /* Половина хода: угол показа — половина угла фасада (у HL — 45° из 90° хода рычага). */
  const half = expect.openDeg > 0 ? expect.openDeg / 2 : 45;
  await page.evaluate(([id, deg]) => window.__mwSetOpenDegree?.(id, deg), [expect.door, half]);
  await page.locator('[data-open-all]').first().click();
  const sHalf = await wait((v) => v.every((m) => Math.abs(m.u - 0.5) < 0.003), 120_000);
  await quiet(page).catch(() => null);
  await shot(`${shots}-2-half.png`, [-0.75, 0.2, 1.1]);
  await page.evaluate((id) => window.__mwSetOpenDegree?.(id, null), expect.door);
  const sOpen = await wait((v) => v.every((m) => Math.abs(m.u - 1) < 1e-6), 120_000);
  await sleep(1200);
  await shot(`${shots}-3-open.png`, [-0.8, 0.25, 1.2]);
  await shot(`${shots}-4-open-closeup.png`, [-0.35, 0.08, 0.5]);
  const eHalf = ends(sHalf);
  const eOpen = ends(sOpen);
  check(
    `${L}.2 на половине хода и в конце: звенья своей длины (± 0,05 мм), концы звеньев на осях крепления фасада (± 0,5 мм) у обеих боковин; угол фасада — ${expect.openDeg}° в конце`,
    rigid(sHalf) && rigid(sOpen) && eHalf.every((d) => d <= 0.5) && eOpen.every((d) => d <= 0.5) && sOpen.every((m) => Math.abs(m.theta - expect.openDeg) < 0.01),
    `половина: концы ${eHalf.map((d) => d.toFixed(2)).join(' / ')} мм, угол ${sHalf[0]?.theta?.toFixed(1)}° · конец: концы ${eOpen.map((d) => d.toFixed(2)).join(' / ')} мм, угол ${sOpen[0]?.theta?.toFixed(1)}°`,
  );
  await closeAll(page);
  const sBack = await wait((v) => v.every((m) => m.u === 0));
  check(`${L}.3 «Закрыть всё» — механизм в закрытом (ход 0), звенья своей длины`, rigid(sBack), JSON.stringify(sBack.map((m) => m.u)));
  /* Запись → база → перезагрузка: позиция на месте, механизм снова у обеих боковин. */
  await saved(page);
  const row = (await service.from('projects').select('millwork').eq('id', ids[key]).single()).data;
  const stored = [...(row?.millwork?.runs?.optimal?.upperSegments ?? []).flatMap((sg) => sg.modules)].find((m) => m.id === expect.module)?.fittings ?? [];
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
  await sleep(1500);
  await open3d(page, L);
  await hardwareFor(page, L, expect.module);
  const sReload = await wait(() => true, 90_000);
  check(
    `${L}.4 в базе позиция на месте «lift» у ${expect.module}; после перезагрузки механизм снова у обеих боковин`,
    stored.some((f) => f.slot === 'lift') && sReload.length === 2 && rigid(sReload),
    `в базе: ${stored.map((f) => f.slot).join(', ') || 'НИЧЕГО'} · механизмов ${sReload.length}`,
  );
}

async function partAventos(browser) {
  console.log('\n── AVENTOS (1440 × 900): HK top на антресоли 350, HL top на антресоли 400 (потолок 3100) — механизмом, путём панели');
  const hk = fixture('aventosHk');
  const hl = fixture('aventosHl');
  await withOrg(
    'AVENTOS',
    browser,
    async (ctx) => {
      await aventosCase(ctx, 'avHk', fixture('aventosHkExpect'), 'aventos-hk');
      await aventosCase(ctx, 'avHl', fixture('aventosHlExpect'), 'aventos-hl');
      check('AVENTOS ошибок страницы и консоли нет', ctx.errors.length === 0 && ctx.consoleErrors.length === 0, [...ctx.errors, ...ctx.consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 }, projects: [{ key: 'avHk', zone: 'Кухня', fx: hk }, { key: 'avHl', zone: 'Кухня', fx: hl }] },
  );
}

/* ═════════════════════════  REAL: как у настоящей организации (ТЗ 2026-11-02)  ═════════════════════════ */

/**
 * КАТАЛОГ КАК У НАСТОЯЩЕЙ ОРГАНИЗАЦИИ: те же артикулы и те же записи изделия (`meta.hardware`), что лежат у
 * «shymkent mebel» (импорт 21.10.2026, 1199 позиций) — чтение оттуда служебным ключом, только чтение. Цены не
 * копируются (0 — «цена не задана»); строка и категория — как у засева. Правил короба и моделей нет.
 */
const REAL_ORG_SLUG = 'org-c7ade9f2';
async function seedLikeRealOrg(service, orgId) {
  const { data: realOrg, error: realError } = await service.from('orgs').select('id').eq('slug', REAL_ORG_SLUG).single();
  if (realError || !realOrg) throw new Stop(`организации ${REAL_ORG_SLUG} нет: ${realError?.message ?? 'пусто'}`);
  const real = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from('catalog_items').select('article, hw:meta->hardware').eq('org_id', realOrg.id).like('article', 'MFR-%').order('article').range(from, from + 999);
    if (error) throw new Error(`каталог ${REAL_ORG_SLUG}: ${error.message}`);
    for (const row of data ?? []) real.set(row.article, row.hw);
    if (!data || data.length < 1000) break;
  }
  const rows = hardwareImportRows().filter((row) => real.has(row.article)).map((row) => ({ ...row, price: 0, meta: { ...row.meta, hardware: real.get(row.article) } }));
  const { data: category, error } = await service.from('catalog_categories').select('id').eq('org_id', orgId).eq('key', 'hardware').single();
  if (error || !category) throw new Error(`категории «Фурнитура» нет после типового прайса: ${error?.message ?? 'пусто'}`);
  for (let at = 0; at < rows.length; at += 300) {
    const { error: insertError } = await service.from('catalog_items').insert(rows.slice(at, at + 300).map((row) => ({ org_id: orgId, category_id: category.id, ...row, is_active: true })));
    if (insertError) throw new Error(`засев как у ${REAL_ORG_SLUG}: ${insertError.message}`);
  }
  return { real: real.size, seeded: rows.length };
}

/** Панель «Фурнитура» видит каталог организации (любое число позиций — у настоящей их 1199, а не 5264). */
async function hardwarePanelFor(page, label, moduleId) {
  if (!(await page.locator('[data-studio-objects]').first().isVisible().catch(() => false))) {
    must(`${label}: инструмент «Выбор»`, await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="select"]');
  }
  const row = page.locator(`[data-object-module="${moduleId}"]`);
  must(`${label}: модуль ${moduleId} в списке объектов`, (await row.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-object-module="${moduleId}"]`);
  await row.first().click();
  await sleep(500);
  must(`${label}: инструмент «Фурнитура»`, await tool(page, 'hardware'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="hardware"]');
  const items = await waitFor(page, () => { const p = document.querySelector('[data-hw-panel]'); const s = p?.getAttribute('data-hw-list'); return s === 'ready' ? Number(p.getAttribute('data-hw-items') ?? 0) : s === 'error' ? -1 : 0; }, (n) => n !== 0, 90_000);
  must(`${label}: панель «Фурнитура» прочитала каталог организации`, items > 0, `позиций ${items}`);
  return items;
}
const kitState = (page) =>
  page.evaluate(() => {
    const box = document.querySelector('[data-hw-kit]');
    if (!box) return null;
    return {
      state: box.getAttribute('data-hw-kit'),
      steps: Array.from(box.querySelectorAll('[data-hw-kit-step]')).map((el) => ({ key: el.getAttribute('data-hw-kit-step'), ok: el.getAttribute('data-hw-kit-ok') === 'yes', words: (el.textContent ?? '').replace(/\s+/g, ' ').slice(0, 260) })),
      sides: Array.from(box.querySelectorAll('[data-hw-kit-side]')).map((el) => el.getAttribute('data-hw-kit-side')),
      links: Array.from(box.querySelectorAll('[data-hw-kit-link]')).map((el) => `${el.getAttribute('data-hw-kit-link')}:${el.getAttribute('href')}`),
    };
  });

async function partReal(browser) {
  console.log('\n── REAL (1440 × 900 → 1024 × 768): каталог как у настоящей организации → TANDEMBOX не собирается → шаги комплекта → модели в 3D');
  const fx = fixture('kitchen');
  await withOrg(
    'REAL',
    browser,
    async ({ service, org, page, errors, consoleErrors, ids }) => {
      const seeded = await seedLikeRealOrg(service, org.id);
      check(`REAL.0 каталог временной организации — как у ${REAL_ORG_SLUG}: те же артикулы и записи изделия (без цен)`, seeded.seeded === seeded.real && seeded.real > 1000, `у настоящей ${seeded.real} · засеяно ${seeded.seeded}`);
      const MOD = 'base-3300@w1';
      const RUNNER = 'MFR-BLUM-576.4501M';
      const SIDES = 'MFR-BLUM-378M4502SA';

      /* 1. Симптом: ходовая ставится, а системы ящика нет — и шаги названы. */
      await openStudio(page, ids.kitchen);
      await open3d(page, 'REAL');
      await saved(page);
      const panelItems = await hardwarePanelFor(page, 'REAL', MOD);
      const r1 = await installVia(page, 'REAL', 'slide', RUNNER, '576.4501M');
      const kit1 = await waitFor(page, () => document.querySelector('[data-hw-kit]')?.getAttribute('data-hw-kit') ?? null, Boolean, 20_000).then(() => kitState(page));
      await saved(page);
      const twins1 = await page.evaluate(() => (window.__mwTwinCenters ? window.__mwTwinCenters().length : -1));
      await page.screenshot({ path: `${OUT}/real-1-kit-stale.png`, timeout: 120_000 });
      check(
        'REAL.1 как у владельца: панель видит 1199 позиций, ходовая 576.4501M ставится, модели в сцене нет; комплект называет четыре шага — сведения производителя (нет NL), царги, короб ящика цеха, 3D-модель — со ссылками',
        r1.installed && panelItems === seeded.seeded && kit1?.state === 'todo' && kit1.steps.length === 4 && kit1.steps.every((st) => !st.ok) && /нет NL/.test(kit1.steps[0].words) && twins1 === 0 &&
          kit1.links.includes('facts:/admin/catalog') && kit1.links.includes('rules:/admin/production#drawer-box') && kit1.links.includes('model:/admin/catalog/cad'),
        `${panelItems} позиций · моделей в сцене ${twins1} · ${kit1?.steps.map((st) => `${st.key} ${st.ok ? 'ok' : '✗'}`).join(' · ')} · ${kit1?.links.join(', ')}`,
      );

      /* 2. Сведения производителя — «Каталог» → «Фурнитура производителей» → «Загрузить». */
      await page.goto(`${BASE}/admin/catalog`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.locator('[data-admin-hardware]').first().waitFor({ timeout: 60_000 });
      await page.locator('[data-admin-hardware]').first().click();
      await page.waitForSelector('[data-admin-hardware-plan="facts"]', { timeout: 120_000 });
      const confirmText = (await page.locator('[data-admin-hardware-confirm]').first().textContent()) ?? '';
      await page.screenshot({ path: `${OUT}/real-2-facts-plan.png`, timeout: 120_000 });
      await page.locator('[data-admin-hardware-confirm]').first().click();
      const fresh = await (async () => {
        const until = Date.now() + 480_000;
        for (;;) {
          const { data } = await service.from('catalog_items').select('hw:meta->hardware').eq('org_id', org.id).eq('article', RUNNER).single();
          const nl = data?.hw?.dimensionsMm?.nominalLength ?? null;
          const n = await countMfr(service, org.id);
          if ((nl === 450 && n === FACT_COUNT) || Date.now() > until) return { nl, n };
          await sleep(3000);
        }
      })();
      check('REAL.2 «Загрузить» обновил сведения производителя: у 576.4501M появилась NL 450; позиций — сколько в своде фактов', fresh.nl === 450 && fresh.n === FACT_COUNT, `«${confirmText.trim()}» · NL ${fresh.nl} · позиций ${fresh.n} из ${FACT_COUNT}`);

      /* 3. Короб ящика цеха — «Настройки цеха». Числа — приёмки (как у части drawers), не умолчание продукта. */
      await page.goto(`${BASE}/admin/production#drawer-box`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForSelector('[data-drawer-box-field="sideMm"]', { timeout: 60_000 });
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-drawer-box-field="sideMm"]');
        return Boolean(el && Object.keys(el).some((k) => k.startsWith('__reactProps')));
      }, undefined, { timeout: 60_000 });
      for (const [key, value] of Object.entries({ sideMm: '16', bottomMm: '4', bottomGrooveMm: '6', gapBelowMm: '10', gapAboveMm: '30', runnerAxisMm: '40' })) {
        if (key === 'bottomGrooveMm') {
          await page.selectOption('[data-drawer-box-field="bottomMaterial"]', 'hdf');
          await page.selectOption('[data-drawer-box-field="bottomMount"]', 'groove');
        }
        await page.fill(`[data-drawer-box-field="${key}"]`, value);
      }
      await page.selectOption('[data-drawer-box-field="edge"]', '0.4');
      await page.locator('[data-drawer-box-confirmed]').check();
      await page.getByRole('button', { name: 'Сохранить', exact: true }).click({ timeout: 15_000 });
      await waitFor(page, () => document.body.textContent?.includes('Сохранено.') ?? false, Boolean, 30_000);
      const { data: orgRow } = await service.from('orgs').select('production').eq('id', org.id).single();
      check('REAL.3 «Короб ящика» сохранён в настройках цеха (подтверждено цехом)', orgRow?.production?.drawerBox?.sideMm === 16 && orgRow.production.drawerBox.confirmed === true, JSON.stringify(orgRow?.production?.drawerBox ?? null));

      /* 4. Готовые модели ALDIK — «Импорт CAD-фурнитуры». */
      await page.goto(`${BASE}/admin/catalog/cad`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForSelector('[data-ready-twins="ready"]', { timeout: 120_000 });
      const plan = await page.evaluate(() => Array.from(document.querySelectorAll('[data-ready-twin]')).map((el) => ({ article: el.getAttribute('data-ready-twin'), state: el.getAttribute('data-ready-state'), words: (el.textContent ?? '').replace(/\s+/g, ' ').slice(0, 200) })));
      await page.screenshot({ path: `${OUT}/real-4-ready-plan.png`, timeout: 120_000 });
      await page.locator('[data-ready-install]').first().click();
      const done = await waitFor(page, () => document.querySelector('[data-ready-done]')?.getAttribute('data-ready-done') ?? null, Boolean, 180_000);
      const { data: twinRows } = await service.from('catalog_items').select('id, article, meta').eq('org_id', org.id).in('article', [RUNNER, SIDES, 'MFR-BLUM-71B3550']);
      const filesN = [];
      for (const row of twinRows ?? []) {
        const { data: files } = await service.storage.from('catalog').list(`${org.id}/hardware-cad/${row.id}`);
        filesN.push((files ?? []).length);
      }
      check(
        'REAL.4 «Готовые модели ALDIK»: до записи — 3 к установке (царга, ходовая, петля CLIP top); «Поставить» — у трёх позиций `meta.twin` (визуальная реконструкция по чертежу, права подтверждены), файлы в Storage папок позиций',
        plan.length === 3 && plan.every((r) => r.state === 'install') && done === '3' && (twinRows ?? []).length === 3 && (twinRows ?? []).every((r) => r.meta?.twin?.status === 'VISUAL_RECONSTRUCTION' && r.meta.twin.source.rights === 'VERIFIED') && filesN.every((n) => n === 1),
        `${plan.map((r) => `${r.article}: ${r.state}`).join(' · ')} · записано ${done} · файлов ${filesN.join('/')}`,
      );

      /* 5. Studio: царги — кнопкой комплекта; модель в 3D; ход. */
      await openStudio(page, ids.kitchen);
      await open3d(page, 'REAL');
      await hardwarePanelFor(page, 'REAL', MOD);
      await page.locator('[data-hw-slot="slide"]').first().click();
      await waitFor(page, () => document.querySelector('[data-hw-kit]') !== null, Boolean, 30_000);
      const kit2 = await kitState(page);
      const sideButton = page.locator(`[data-hw-kit-side="${SIDES}"]`);
      must('REAL: кнопка царг 378M4502SA в комплекте', (await sideButton.count()) > 0, `кнопки: ${kit2?.sides.join(', ')}`);
      await sideButton.first().click();
      const kit3 = await waitFor(page, () => document.querySelector('[data-hw-kit]')?.getAttribute('data-hw-kit') ?? null, (v) => v === 'ready', 30_000).then(() => kitState(page));
      await saved(page);
      await quiet(page);
      const closed = await waitFor(
        page,
        () => (window.__mwTwinCenters ? window.__mwTwinCenters() : null),
        (v) => Boolean(v) && v.filter((m) => m.role === 'fixed').length >= 4 && v.filter((m) => m.role === 'moving').length >= 2,
        90_000,
      );
      const drawersN = fixture('drawersExpect').drawers;
      /* Модели реестра в кадре — только у этого модуля; неподвижные профили ходовой — на корпусе (ключ «cabinet|…»), как у TBX.B. */
      const fixedN = closed?.filter((m) => m.role === 'fixed').length ?? 0;
      const movingN = closed?.filter((m) => m.role === 'moving').length ?? 0;
      const middleN = closed?.filter((m) => m.role === 'middle').length ?? 0;
      await page.screenshot({ path: `${OUT}/real-5-kit-ready.png`, timeout: 120_000 });
      check(
        `REAL.5 после шагов: царги той же NL — кнопкой комплекта (кнопок ${kit2?.sides.length}), все четыре шага выполнены; в сцене модели реестра на ${drawersN} ящиках — царги, каретки, корпусные профили`,
        kit2?.steps[0].ok === true && kit3?.state === 'ready' && fixedN === 4 * drawersN && movingN === 2 * drawersN && middleN === 4 * drawersN,
        `${kit3?.steps.map((st) => `${st.key} ${st.ok ? 'ok' : '✗'}`).join(' · ')} · неподвижных ${fixedN}, едущих ${movingN}, кареток ${middleN}`,
      );
      const top = `${MOD}:drawer:0`;
      const want = fixture('drawersExpect');
      await openAll(page, top, (v) => v.shift[2] >= want.travelMm - 1);
      const after = await page.evaluate(() => (window.__mwTwinCenters ? window.__mwTwinCenters() : null));
      /* Едущие и каретки — у верхнего ящика; неподвижные профили — на корпусе (ключ «cabinet|…»): все. */
      const travel = (role) =>
        (after ?? []).filter((m) => m.role === role && (role === 'fixed' || m.key.startsWith(top))).map((m) => {
          const b = closed.find((c) => c.key === m.key);
          return b ? Math.round(Math.hypot(m.center[0] - b.center[0], m.center[1] - b.center[1], m.center[2] - b.center[2]) * 10000) / 10 : NaN;
        });
      const sideL = (after ?? []).find((m) => m.key === `${top}|L|moving|side-profile`);
      if (sideL) {
        await page.evaluate((pose) => (window.__mwCadCamera ? window.__mwCadCamera(pose) : null), { position: [sideL.center[0] - 0.4, sideL.center[1] + 0.6, sideL.center[2] + 0.7], target: sideL.center });
        await sleep(2500);
      }
      await page.screenshot({ path: `${OUT}/real-6-drawer-open.png`, timeout: 120_000 });
      const mv = travel('moving');
      const md = travel('middle');
      const fx0 = travel('fixed');
      check(
        `REAL.6 «Открыть всё»: царги верхнего ящика едут на ${want.travelMm} мм (ход по коробу), каретки — на половину, корпусные профили стоят`,
        mv.length === 2 && mv.every((d) => Math.abs(d - want.travelMm) <= 1) && md.length > 0 && md.every((d) => Math.abs(d - want.travelMm / 2) <= 1) && fx0.length > 0 && fx0.every((d) => d <= 0.5),
        `царги ${mv.join('/')} мм · каретки ${md.join('/')} мм · профили ${fx0.join('/')} мм`,
      );
      await closeAll(page);

      /* 6. CLIP top на дверце и HS top на верхнем шкафу — у той же организации. */
      await hardwarePanelFor(page, 'REAL', 'base-1200@w1');
      /* Меши модели реестра по ролям (`__mwTwins`, как у TWIN.C): у петли — плечо на корпусе, чашка на полотне. */
      const twinsBefore = await page.evaluate(() => (window.__mwTwins ? window.__mwTwins() : {}));
      const hinge = await installVia(page, 'REAL', 'hinge', 'MFR-BLUM-71B3550', '71B3550');
      const twinsAfter = await waitFor(
        page,
        () => (window.__mwTwins ? window.__mwTwins() : {}),
        (v) => (v['twin:fixed'] ?? 0) >= (twinsBefore['twin:fixed'] ?? 0) + 2 && (v['twin:moving'] ?? 0) >= (twinsBefore['twin:moving'] ?? 0) + 2,
        60_000,
      );
      const hingeTwins = { length: (twinsAfter['twin:fixed'] ?? 0) - (twinsBefore['twin:fixed'] ?? 0) + (twinsAfter['twin:moving'] ?? 0) - (twinsBefore['twin:moving'] ?? 0) };
      await hardwarePanelFor(page, 'REAL', 'upper-1200@w1');
      const lift = await installVia(page, 'REAL', 'lift', 'MFR-BLUM-22S2800', '22S2800');
      const hs = await waitFor(page, () => (window.__mwAventos ? window.__mwAventos().filter((m) => m.door === 'upper-1200@w1:door:0') : []), (v) => v.length === 2, 60_000);
      check(
        'REAL.7 той же организации: петля CLIP top 71B3550 — модель реестра на петлях дверцы (плечи на корпусе, чашки на полотне: мешей прибавилось у обеих ролей); подъёмник HS top 22S2800 — механизм у обеих боковин',
        hinge.installed && (twinsAfter['twin:fixed'] ?? 0) >= (twinsBefore['twin:fixed'] ?? 0) + 2 && (twinsAfter['twin:moving'] ?? 0) >= (twinsBefore['twin:moving'] ?? 0) + 2 && lift.installed && hs.length === 2 && hs.every((m) => m.family === 'HS top'),
        `мешей модели петли ${hingeTwins.length} · механизмов HS ${hs.length}`,
      );

      /* 7. Перезагрузка: всё на месте. */
      await saved(page);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
      await sleep(1500);
      await open3d(page, 'REAL');
      await hardwarePanelFor(page, 'REAL', MOD);
      const reloaded = await waitFor(page, () => (window.__mwTwinCenters ? window.__mwTwinCenters().length : 0), (n) => n > 0, 90_000);
      const hsReload = await waitFor(page, () => (window.__mwAventos ? window.__mwAventos().length : 0), (n) => n === 2, 60_000);
      const { data: row } = await service.from('projects').select('millwork').eq('id', ids.kitchen).single();
      const mods = [...(row?.millwork?.runs?.optimal?.modules ?? []), ...(row?.millwork?.runs?.optimal?.upperSegments ?? []).flatMap((sg) => sg.modules)];
      const stored = mods.flatMap((m) => (m.fittings ?? []).map((f) => `${m.id}:${f.slot}`)).sort();
      check(
        'REAL.8 запись и перезагрузка: в базе ходовая, царги, петля и подъёмник на местах; после перезагрузки модели реестра и механизм HS снова в сцене',
        ['base-3300@w1:slide', 'base-3300@w1:drawer_side', 'base-1200@w1:hinge', 'upper-1200@w1:lift'].every((k) => stored.includes(k)) && reloaded > 0 && hsReload === 2,
        `${stored.join(', ')} · мешей моделей ${reloaded} · HS ${hsReload}`,
      );

      /* 8. Планшет 1024 × 768: комплект и сцена без горизонтальной прокрутки. */
      await page.setViewportSize({ width: 1024, height: 768 });
      await sleep(1500);
      await page.locator('[data-hw-slot="slide"]').first().click().catch(() => undefined);
      await sleep(800);
      const tablet = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        kit: document.querySelector('[data-hw-kit]')?.getAttribute('data-hw-kit') ?? null,
        canvas: (() => { const c = document.querySelector('[data-studio-viewport] canvas'); const r = c?.getBoundingClientRect(); return r ? Math.round(r.width) : 0; })(),
      }));
      await page.screenshot({ path: `${OUT}/real-8-tablet.png`, timeout: 120_000 });
      check('REAL.9 планшет 1024 × 768: прокрутки по ширине нет, комплект «готов», сцена на экране', tablet.scroll <= 1 && tablet.kit === 'ready' && tablet.canvas > 300, JSON.stringify(tablet));
      check('REAL ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 }, importHardware: false, projects: [{ key: 'kitchen', zone: 'Кухня', fx }] },
  );
}

/* ═════════════════════════  IMPORT-UI: кнопка импорта видна человеку (ТЗ 2026-11-02, срочно)  ═════════════════════════ */

/**
 * Кнопка — так, как её видит человек: в пределах окна, и в её центре — она сама (`elementFromPoint`),
 * нажатие — мышью по координатам. `locator.click()` прокручивает программно даже контейнер без прокрутки
 * и нажимает то, до чего человек не дотянется: так прошёл REAL.2 при невидимой кнопке.
 */
async function humanReach(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const inView = r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
    const hit = inView ? document.elementFromPoint(cx, cy) : null;
    return { found: true, inView, onTop: Boolean(hit && (hit === el || el.contains(hit))), x: Math.round(cx), y: Math.round(cy), top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight, text: (el.textContent ?? '').trim() };
  }, selector);
}

async function partImportUi(browser) {
  for (const vp of [{ label: 'IMPORT-UI-1024', viewport: { width: 1024, height: 768 }, touch: true }, { label: 'IMPORT-UI-1440', viewport: { width: 1440, height: 900 }, touch: false }]) {
    console.log(`\n── ${vp.label}: каталог как у настоящей организации → «Фурнитура производителей» → кнопка видна → загрузка частями → итог`);
    await withOrg(
      vp.label,
      browser,
      async ({ service, org, page, errors, consoleErrors }) => {
        const seeded = await seedLikeRealOrg(service, org.id);
        /* Своё у компании: цена и название у двух позиций — импорт не трогает. */
        const own = { 'MFR-BLUM-576.4501M': { price: 12345, name_ru: 'Ходовая TANDEMBOX (наша цена)' }, 'MFR-BLUM-71B3550': { price: 2100, name_ru: 'Петля CLIP top (наша)' } };
        for (const [article, patch] of Object.entries(own)) await service.from('catalog_items').update(patch).eq('org_id', org.id).eq('article', article);
        await page.goto(`${BASE}/admin/catalog`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await page.locator('[data-admin-hardware]').first().waitFor({ timeout: 60_000 });
        await page.locator('[data-admin-hardware]').first().click();
        await page.waitForSelector('[data-admin-hardware-plan="facts"]', { timeout: 120_000 });
        const reach = await humanReach(page, '[data-admin-hardware-confirm]');
        await page.screenshot({ path: `${OUT}/${vp.label.toLowerCase()}-1-plan.png`, timeout: 120_000 });
        check(
          `${vp.label}.1 «Фурнитура производителей» (каталог как у настоящей организации, ${seeded.seeded} позиций): кнопка «Загрузить» на экране и не закрыта ничем — до неё дотягивается человек, а не только программа`,
          reach.found && reach.inView && reach.onTop && /Загрузить/.test(reach.text),
          JSON.stringify(reach),
        );
        if (!(reach.found && reach.inView && reach.onTop)) return;
        const startedAt = Date.now();
        await page.mouse.click(reach.x, reach.y);
        const result = await waitFor(page, () => document.querySelector('[data-admin-hardware-result]')?.getAttribute('data-admin-hardware-result') ?? null, (v) => v === 'done' || v === 'error', 900_000);
        const progressSeen = await page.evaluate(() => document.querySelector('[data-admin-hardware-result]')?.textContent ?? '');
        await page.screenshot({ path: `${OUT}/${vp.label.toLowerCase()}-2-result.png`, timeout: 120_000 });
        const n = await countMfr(service, org.id);
        const { data: rows } = await service.from('catalog_items').select('article, price, name_ru, hw:meta->hardware').eq('org_id', org.id).in('article', Object.keys(own));
        const kept = (rows ?? []).every((r) => r.price === own[r.article].price && r.name_ru === own[r.article].name_ru);
        const nl = (rows ?? []).find((r) => r.article === 'MFR-BLUM-576.4501M')?.hw?.dimensionsMm?.nominalLength ?? null;
        check(
          `${vp.label}.2 загрузка частями до конца: итог «готово» со счётом; позиций — сколько в своде (${FACT_COUNT}); у 576.4501M появилась NL 450; цена и название компании у двух позиций не тронуты; ничего не удалено`,
          result === 'done' && n === FACT_COUNT && nl === 450 && kept,
          `${result} за ${Math.round((Date.now() - startedAt) / 1000)} с · «${progressSeen.replace(/\s+/g, ' ').slice(0, 220)}» · позиций ${n} · NL ${nl} · своё ${kept ? 'цело' : 'ИЗМЕНЕНО'}`,
        );
        /* Повтор — «Всё уже в каталоге», кнопка закрыта. */
        await page.locator('[data-admin-hardware]').first().click();
        await page.waitForSelector('[data-admin-hardware-plan="facts"]', { timeout: 120_000 });
        const again = await humanReach(page, '[data-admin-hardware-confirm]');
        check(`${vp.label}.3 повтор: «Всё уже в каталоге» на экране, дублей нет`, again.inView && /Всё уже в каталоге/.test(again.text) && (await countMfr(service, org.id)) === FACT_COUNT, JSON.stringify(again));
        check(`${vp.label} ошибок страницы и консоли нет`, errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
      },
      { viewport: vp.viewport, touch: vp.touch, importHardware: false, projects: [] },
    );
  }
}

/* ═════════════════════════  INNER: внутренний ящик TANDEMBOX за верхним фасадом (2026-11-02)  ═════════════════════════ */

const slideOf = (page, id) => page.evaluate((k) => (window.__mwPartSlide ? window.__mwPartSlide(k) : null), id);
/** Нажатие по детали в сцене — мышью по точке зоны касания на экране (`local` — точка в осях зоны). */
async function pressPart(page, id, label, local) {
  const pt = await page.evaluate(([k, l]) => (window.__mwCadPartPoint ? window.__mwCadPartPoint(k, l ?? undefined) : null), [id, local ?? null]);
  must(`${label}: точка ${id} на экране`, Boolean(pt), `НУЛЕВОЙ СЕЛЕКТОР: part:${id}`);
  await page.mouse.click(pt.x, pt.y);
}
/** Ход двух ящиков каждый кадр, пока условие не выполнено: [наружный, внутренний] в мм. */
const sampleSlides = (page, outer, inner, ms) =>
  page.evaluate(
    ([o, i, limit]) =>
      new Promise((resolve) => {
        /* Замер кончается, когда ход НАЧАЛСЯ и затих (ничего не едет 400 мс), — а не по таймеру от нажатия. */
        const out = [];
        const t0 = performance.now();
        let started = false;
        let quietSince = null;
        const tick = () => {
          const a = window.__mwPartSlide ? window.__mwPartSlide(o) : null;
          const b = window.__mwPartSlide ? window.__mwPartSlide(i) : null;
          out.push([a, b]);
          const moving = window.__mwMovingCount ? window.__mwMovingCount() : 0;
          if (moving > 0 || (out.length > 1 && (a !== out[0][0] || b !== out[0][1]))) started = true;
          const now = performance.now();
          quietSince = moving === 0 ? (quietSince ?? now) : null;
          if ((started && quietSince !== null && now - quietSince > 400) || now - t0 > limit) resolve(out);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    [outer, inner, ms],
  );

async function partInner(browser) {
  const L = 'INNER';
  console.log(`\n── ${L} (1440 × 900): «ЖК ТУМАР» — два одинаковых наружных фасада, за верхним внутренний ящик 120 мм; TANDEMBOX 576.4501M + 378M4502SA NL 450 с 3D-моделями ALDIK`);
  const fx = fixture('kitchen');
  const want = fixture('drawersExpect');
  const widthMm = fx.run.modules.find((m) => m.id === want.module)?.widthMm;
  must(`${L}: модуль ${want.module} в объекте`, Number.isFinite(widthMm), `НУЛЕВОЙ СЕЛЕКТОР: ${want.module}`);
  const panelMm = widthMm - 2 * 16 - 132;
  const outerId = `${want.module}:drawer:0`;
  const innerId = `${want.module}:idrawer:0:0`;
  await withOrg(
    L,
    browser,
    async ({ service, page, errors, consoleErrors, ids }) => {
      /* 3D-модели установлены, как у владельца: «Готовые модели ALDIK» (царга 378M4502SA, ходовая 576.4501M). */
      await page.goto(`${BASE}/admin/catalog/cad`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForSelector('[data-ready-twins="ready"]', { timeout: 120_000 });
      await page.locator('[data-ready-install]').first().click();
      const twinsDone = await waitFor(page, () => document.querySelector('[data-ready-done]')?.getAttribute('data-ready-done') ?? null, Boolean, 180_000);
      must(`${L}: готовые модели ALDIK поставлены`, Boolean(twinsDone), String(twinsDone));

      await openStudio(page, ids.kitchen);
      await open3d(page, L);
      await saved(page);
      await hardwareFor(page, L, want.module);
      const runner = await installByPath(page, L, 'slide', { brand: 'Blum', series: 'TANDEMBOX antaro', nl: 450, article: want.runner });
      await waitFor(page, () => document.querySelectorAll('[data-hw-slot="drawer_side"]').length, (n) => n > 0, 20_000);
      const sides = await installByPath(page, L, 'drawer_side', { brand: 'Blum', series: 'TANDEMBOX antaro', nl: 450, article: want.sides });
      must(`${L}: TANDEMBOX путём «Фурнитуры»`, runner.installed && sides.installed, JSON.stringify({ runner: runner.installed, sides: sides.installed }));
      await selectModule(page, want.module);

      /* Два одинаковых наружных фасада: рядов 2 и «Равномерно». */
      let st = await frontsState(page);
      for (let i = 0; i < 6 && st.rows > 2; i += 1) {
        await humanPress(page, '[data-drawer-fronts-less]', 'рядов меньше', false);
        st = await frontsState(page);
      }
      for (let i = 0; i < 6 && st.rows < 2; i += 1) {
        await humanPress(page, '[data-drawer-fronts-more]', 'рядов больше', false);
        st = await frontsState(page);
      }
      await humanPress(page, '[data-drawer-fronts-even]', 'Равномерно', false);
      st = await waitFor(page, () => document.querySelector('[data-drawer-fronts]') !== null, Boolean, 10_000).then(() => frontsState(page));
      check(
        `${L}.1 два одинаковых наружных фасада: рядов 2, места ${st.slots.join(' / ')} мм, детали ${st.fronts.map((f) => f.h).join(' / ')} мм, оба ящика — короба системы`,
        st.rows === 2 && st.slots[0] === st.slots[1] && st.fronts[0]?.h === st.fronts[1]?.h && st.fronts.every((f) => f.ready === '1'),
        JSON.stringify(st),
      );

      /* Внутренний ящик 120 мм за верхним фасадом. */
      await humanPress(page, '[data-front-inners="0"]', 'внутренний ящик за верхним фасадом', false);
      await page.locator('[data-front-inners="0"]').first().fill('120');
      await page.locator('[data-front-inners="0"]').first().press('Enter');
      const innerRow = await waitFor(page, () => document.querySelector('[data-front-inner="idrawer:0:0"]')?.textContent ?? null, (v) => /Z31L1036A/.test(v ?? '') || /черновик/.test(v ?? ''), 30_000);
      await saved(page);
      check(
        `${L}.2 внутренний ящик 120 мм за верхним: короб системы, передняя панель Z31L1036A ${panelMm} мм (LW − 132), держатели ZIF.71M0, ручка ZIF.80M5; «место 120 мм при min 106», удобного доступа сверху нет (136) — словами; не черновик`,
        new RegExp(`Z31L1036A ${panelMm} мм \\(LW − 132\\)`).test(innerRow ?? '') &&
          /ZIF\.71M0/.test(innerRow ?? '') &&
          /ZIF\.80M5/.test(innerRow ?? '') &&
          /место 120 мм при min 106/.test(innerRow ?? '') &&
          /удобного доступа сверху нет/.test(innerRow ?? '') &&
          !/черновик/.test(innerRow ?? ''),
        `«${(innerRow ?? '').replace(/\s+/g, ' ').slice(0, 400)}»`,
      );

      /* Смета экрана: передняя часть внутреннего — три строки по 1; направляющих и царг — по 3. */
      const lines = await waitFor(
        page,
        () => (window.__mwEstimateLines ? window.__mwEstimateLines() : null),
        (l) => Array.isArray(l) && l.filter((x) => x.key.startsWith('inner_front_')).length === 3,
        60_000,
      );
      const inner3 = (lines ?? []).filter((x) => x.key.startsWith('inner_front_'));
      const slideLine = (lines ?? []).find((x) => x.key.startsWith('fitting_slide_') && !x.key.endsWith('_missing'));
      const sideLine = (lines ?? []).find((x) => x.key.startsWith('fitting_drawer_side_') && !x.key.endsWith('_missing'));
      check(
        `${L}.3 смета экрана: передняя панель, держатели, ручка внутреннего ящика — по 1, «цена не задана»; направляющие 576.4501M и царги 378M4502SA — по 3 комплекта`,
        inner3.length === 3 && inner3.every((x) => x.quantity === 1 && Boolean(x.priceUnset)) && slideLine?.quantity === 3 && sideLine?.quantity === 3,
        JSON.stringify({ inner: inner3.map((x) => [x.key.slice(0, 24), x.quantity]), slides: slideLine?.quantity, sides: sideLine?.quantity }),
      );

      /* 3D: модели реестра стоят и на внутреннем ящике. */
      await open3d(page, L);
      const twins = await waitFor(page, () => (window.__mwTwinCenters ? window.__mwTwinCenters() : []), (v) => v.some((t) => t.key.includes('idrawer:0:0')), 60_000);
      const innerTwins = twins.filter((t) => t.key.includes('idrawer:0:0'));
      check(
        `${L}.4 3D-модели ALDIK (царга и ходовая) — и у внутреннего ящика: мешей ${innerTwins.length}`,
        innerTwins.length > 0,
        innerTwins.slice(0, 4).map((t) => `${t.key}:${t.role}`).join(' · '),
      );

      /* Нажатие на верх наружного фасада (за ним внутренний) — открывает наружный; внутренний остаётся. */
      await page.locator('[data-angle="iso"]').first().click();
      await sleep(2500);
      await pressPart(page, outerId, 'верх наружного фасада', [0, 0.42, 0.5]);
      const s1 = await sampleSlides(page, outerId, innerId, 30_000);
      const end1 = s1[s1.length - 1];
      await page.screenshot({ path: `${OUT}/inner-1-outer-open.png`, timeout: 120_000 });
      check(
        `${L}.5 нажатие на верх наружного фасада, за которым внутренний: открылся наружный (${end1?.[0]} мм), внутренний остался на месте (${end1?.[1]} мм) — до внутреннего за закрытым фасадом не дотянуться`,
        end1?.[0] > 400 && end1?.[1] === 0 && s1.every(([, b]) => b === 0),
        `кадров ${s1.length}`,
      );

      /* Сверху — нажатие на внутренний: выдвигается отдельно, наружный стоит. */
      await page.locator('[data-angle="plan"]').first().click();
      await sleep(2500);
      await pressPart(page, innerId, 'внутренний ящик сверху', [0, 0.49, -0.45]);
      const s2 = await sampleSlides(page, outerId, innerId, 30_000);
      const end2 = s2[s2.length - 1];
      await page.locator('[data-angle="iso"]').first().click();
      await sleep(2500);
      await page.screenshot({ path: `${OUT}/inner-2-both-open.png`, timeout: 120_000 });
      check(
        `${L}.6 нажатие на внутренний (сверху, как рукой): выдвинулся отдельно до ${end2?.[1]} мм, наружный стоит (${end2?.[0]} мм); на ходу внутренний не дальше наружного`,
        end2?.[1] > 400 && Math.abs(end2[0] - end1[0]) <= 1 && s2.every(([a, b]) => b <= a + 0.5),
        `кадров ${s2.length}`,
      );

      /* Закрытие наружного: внутренний закрывается с ним и ни на кадр не выходит за тыл его фасада. */
      await pressPart(page, outerId, 'наружный фасад', [0, 0, 0.5]);
      const s3 = await sampleSlides(page, outerId, innerId, 30_000);
      const end3 = s3[s3.length - 1];
      const worst3 = Math.max(...s3.map(([a, b]) => (b ?? 0) - (a ?? 0)));
      check(
        `${L}.7 закрытие наружного: закрылись оба (${end3?.[0]} / ${end3?.[1]} мм), внутренний на ходу ни на кадр не дальше наружного (наибольшее превышение ${worst3} мм за ${s3.length} кадров)`,
        end3?.[0] === 0 && end3?.[1] === 0 && worst3 <= 0.5 && s3.length > 5,
        `первые: ${JSON.stringify(s3.slice(0, 4))}`,
      );

      /* «Открыть всё»: сначала наружный до конца, потом внутренний. */
      await page.locator('[data-open-all]').first().click();
      const s4 = await sampleSlides(page, outerId, innerId, 40_000);
      const end4 = s4[s4.length - 1];
      const early = s4.filter(([a, b]) => (b ?? 0) > 0 && (a ?? 0) < end1[0] - 1);
      check(
        `${L}.8 «Открыть всё»: внутренний начинает ход, только когда наружный открыт до конца (кадров с внутренним на ходу при неоткрытом наружном — ${early.length}); в конце оба открыты (${end4?.[0]} / ${end4?.[1]} мм)`,
        early.length === 0 && end4?.[0] > 400 && end4?.[1] > 400,
        `кадров ${s4.length}`,
      );
      await closeAll(page);
      await saved(page);

      /* Запись → база → перезагрузка. */
      const row = (await service.from('projects').select('millwork').eq('id', ids.kitchen).single()).data;
      const unitDb = [...(row?.millwork?.runs?.optimal?.modules ?? [])].find((m) => m.id === want.module);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
      await sleep(1500);
      await selectModule(page, want.module);
      const rowReload = await waitFor(page, () => document.querySelector('[data-front-inner="idrawer:0:0"]')?.textContent ?? null, (v) => /Z31L1036A/.test(v ?? ''), 60_000);
      check(
        `${L}.9 в базе — два равных места и внутренний 120 мм за верхним (${JSON.stringify(unitDb?.fill?.drawerInners ?? null)}); после перезагрузки строка внутреннего — та же передняя часть`,
        JSON.stringify(unitDb?.fill?.drawerInners ?? null) === JSON.stringify([{ cell: 0, heightsMm: [120] }]) &&
          (unitDb?.fill?.drawerHeights ?? []).length === 2 &&
          unitDb.fill.drawerHeights[0] === unitDb.fill.drawerHeights[1] &&
          /Z31L1036A/.test(rowReload ?? ''),
        `места ${JSON.stringify(unitDb?.fill?.drawerHeights)}`,
      );
      check(`${L} ошибок страницы и консоли нет`, errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 }, projects: [{ key: 'kitchen', zone: 'Кухня', fx }], production: { drawerBox: DRAWER_BOX } },
  );
}

/* ═════════════════════════  CEILING: антресоль до потолка — фальшпанель и подбор подъёмника (ТЗ 2026-11-02, B)  ═════════════════════════ */

const ceilingState = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-ceiling-lift]');
    if (!root) return null;
    return {
      stack: root.getAttribute('data-ceiling-stack'),
      filler: root.getAttribute('data-top-filler'),
      notice: root.querySelector('[data-ceiling-notice]')?.textContent ?? null,
      list: root.querySelector('[data-lift-pick]')?.getAttribute('data-lift-list') ?? null,
      choices: [...root.querySelectorAll('[data-lift-choice]')].map((c) => ({ article: c.getAttribute('data-lift-choice'), state: c.getAttribute('data-lift-state'), text: (c.textContent ?? '').replace(/\s+/g, ' ') })),
    };
  });
const stackOf = (s) => `${s.ceilingMm}|${s.topMm}|${s.fillerMm}|${s.gapMm}|${s.aboveMm}`;
const avOf = (page, door) => page.evaluate((d) => (window.__mwAventos ? window.__mwAventos().filter((m) => m.door === d) : []), door);
const fillerDrawn = (page) => page.evaluate(() => (window.__mwCadTopFiller ? window.__mwCadTopFiller() : null));

async function partCeiling(browser, tablet) {
  const L = tablet ? 'CEIL-TAB' : 'CEIL';
  console.log(`\n── ${L} (${tablet ? '1024 × 768 касанием' : '1440 × 900'}): антресоль до потолка — фальшпанель 100, отказ 600, «Подобрать подъёмник», ограничитель HK top, ход в 3D, запись → перезагрузка`);
  const fx = fixture('ceiling');
  const want = fixture('ceilingExpect');
  await withOrg(
    L,
    browser,
    async ({ service, page, errors, consoleErrors, ids }) => {
      await openStudio(page, ids.ceiling);
      await open3d(page, L);
      await saved(page);
      if (!(await page.locator('[data-studio-objects]').first().isVisible().catch(() => false))) {
        must(`${L}: инструмент «Выбор»`, await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="select"]');
      }
      const row = page.locator(`[data-object-module="${want.module}"]`);
      must(`${L}: модуль ${want.module} в списке объектов`, (await row.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-object-module="${want.module}"]`);
      await row.first().click();
      await page.waitForSelector('[data-ceiling-lift]', { timeout: 30_000 });
      const c0 = await ceilingState(page);
      check(
        `${L}.1 блок «Антресоль до потолка» у ${want.module}: высоты словами — потолок, корпус, планка, зазор, место над корпусом = движку (${stackOf(want.stack0)})`,
        c0?.stack === stackOf(want.stack0) && c0?.filler === '',
        JSON.stringify(c0?.stack),
      );

      /* Фальшпанель 100: корпус ниже на её высоту; в 3D — планка по участкам движка, низ на верхе корпуса. */
      await humanPress(page, '[data-top-filler-example="100"]', 'фальшпанель 100', tablet);
      const c1 = await waitFor(page, () => document.querySelector('[data-ceiling-lift]')?.getAttribute('data-top-filler') ?? null, (v) => v === '100x0', 30_000);
      const blocks = await page.evaluate(() => document.querySelectorAll('[data-ceiling-lift]').length);
      check(`${L}.2а после «100» блок «Антресоль до потолка» на экране один (прежний не застывает рядом)`, blocks === 1, `блоков ${blocks}`);
      await saved(page);
      const s1 = await ceilingState(page);
      const drawn = await waitFor(page, () => (window.__mwCadTopFiller ? window.__mwCadTopFiller() : null), (v) => Array.isArray(v) && v.length > 0, 30_000);
      const spans = (drawn ?? []).map((d) => [d.boundsMm[0], d.boundsMm[3]]).sort((a, b) => a[0] - b[0]);
      const xs = (drawn ?? []).map((d) => d.boundsMm[3] - d.boundsMm[0]);
      check(
        `${L}.2 «100» — планка 100 мм: высоты = движку (${stackOf(want.stack1)}); в сцене ${want.spans.length} куска планки длиной ${want.spans.map(([a, b]) => b - a).join(' / ')} мм, низ на ${want.stack1.topMm} мм, высота 100`,
        c1 === '100x0' &&
          s1?.stack === stackOf(want.stack1) &&
          (drawn ?? []).length === want.spans.length &&
          xs.sort((a, b) => a - b).join(',') === want.spans.map(([a, b]) => b - a).sort((a, b) => a - b).join(',') &&
          (drawn ?? []).every((d) => Math.abs(d.boundsMm[1] - want.stack1.topMm) <= 1 && Math.abs(d.boundsMm[4] - d.boundsMm[1] - 100) <= 1),
        `${s1?.stack} · сцена ${JSON.stringify(drawn)} · участки движка ${JSON.stringify(want.spans)}`,
      );
      void spans;
      await page.screenshot({ path: `${OUT}/${L.toLowerCase()}-1-filler.png`, timeout: 120_000 });

      /* Отказ числом: планка 600 — антресоли не хватает места; планка прежняя. */
      if (!tablet) {
        await humanPress(page, '[data-top-filler-height]', 'поле высоты планки', tablet);
        const input = page.locator('[data-top-filler-height]').first();
        await input.fill('600');
        await input.press('Enter');
        await sleep(1200);
        const s2 = await ceilingState(page);
        check(
          `${L}.3 планка 600 — отказ движка словами с мм («лишние … мм»), планка прежняя 100`,
          /лишние \d+ мм/.test(s2?.notice ?? '') && s2?.filler === '100x0',
          `«${s2?.notice ?? '—'}» · ${s2?.filler}`,
        );
      }

      /* «Подобрать подъёмник»: список производителей дочитывается по нажатию; HK top — «при изменении конструкции». */
      await humanPress(page, '[data-lift-pick]', 'Подобрать подъёмник', tablet);
      const picked = await waitFor(page, () => document.querySelectorAll('[data-lift-choice]').length, (n) => n > 0, 120_000);
      const s3 = await ceilingState(page);
      const hk = s3?.choices.find((c) => c.article === want.article);
      const hs = s3?.choices.find((c) => c.article === 'MFR-BLUM-22S2200');
      check(
        `${L}.4 «Подобрать подъёмник» (каталог дочитан по нажатию): позиций с моделью ${want.choices} = движку; ${want.article.replace('MFR-BLUM-', '')} — «подходит при изменении конструкции» (${want.changes.join(', ')}); HS top — «${want.hsState}» словами с мм`,
        picked === want.choices &&
          hk?.state === want.state &&
          new RegExp(`ограничитель угла открывания ${want.limiterDeg}°`).test(hk?.text ?? '') &&
          hs?.state === want.hsState &&
          /не хватает \d+ мм/.test(hs?.text ?? ''),
        `позиций ${picked} · HK: ${hk?.state} «${(hk?.text ?? '').slice(0, 220)}» · HS: ${hs?.state}`,
      );

      /* Изменение — только по нажатию: ограничитель и установка одним действием движка. */
      await humanPress(page, `[data-lift-choice="${want.article}"] [data-lift-change="limiter"]`, 'ограничитель угла', tablet);
      const av0 = await waitFor(page, (d) => (window.__mwAventos ? window.__mwAventos().filter((m) => m.door === d).length : 0), (n) => n === 2, 60_000, want.door);
      await saved(page);
      must(`${L}: механизм HK top в сцене после «Применить и установить»`, av0 === 2, `механизмов ${av0}`);
      await page.locator('[data-open-all]').first().scrollIntoViewIfNeeded().catch(() => null);
      await humanPress(page, '[data-open-all]', 'Открыть всё', tablet);
      const uEnd = want.limiterDeg / want.openDeg;
      const open = await waitFor(page, (d) => (window.__mwAventos ? window.__mwAventos().filter((m) => m.door === d) : []), (v) => v.length === 2 && v.every((m) => Math.abs(m.u - uEnd) < 1e-4), 120_000, want.door);
      await page.screenshot({ path: `${OUT}/${L.toLowerCase()}-2-open.png`, timeout: 120_000 });
      check(
        `${L}.5 «Открыть всё»: фасад HK top останавливается на ограничителе ${want.limiterDeg}° (паспорт ${want.openDeg}°) у обеих боковин — ход ${uEnd.toFixed(3)} хода механизма`,
        open.length === 2 && open.every((m) => Math.abs(m.theta - want.limiterDeg) < 0.05 && Math.abs(m.u - uEnd) < 1e-4),
        JSON.stringify(open.map((m) => ({ side: m.side, u: m.u?.toFixed(4), theta: m.theta?.toFixed(2) }))),
      );
      await closeAll(page);
      await saved(page);
      const row0 = (await service.from('projects').select('millwork').eq('id', ids.ceiling).single()).data;
      const runDb = row0?.millwork?.runs?.optimal;
      const mezzDb = (runDb?.upperSegments ?? []).flatMap((sg) => sg.modules).find((m) => m.id === want.module);
      const liftDb = (mezzDb?.fittings ?? []).find((f) => f.slot === 'lift');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
      await sleep(1500);
      await open3d(page, L);
      if (!(await page.locator('[data-studio-objects]').first().isVisible().catch(() => false))) await tool(page, 'select');
      await page.locator(`[data-object-module="${want.module}"]`).first().click();
      await page.waitForSelector('[data-ceiling-lift]', { timeout: 30_000 });
      const s4 = await ceilingState(page);
      const avReload = await waitFor(page, (d) => (window.__mwAventos ? window.__mwAventos().filter((m) => m.door === d).length : 0), (n) => n === 2, 90_000, want.door);
      const drawnReload = await fillerDrawn(page);
      check(
        `${L}.6 запись → база → перезагрузка: в базе планка ${runDb?.topFiller?.heightMm} мм и подъёмник с ограничителем ${liftDb?.openDeg}°; после перезагрузки — те же высоты, планка в сцене, механизм у обеих боковин`,
        runDb?.topFiller?.heightMm === 100 &&
          liftDb?.openDeg === want.limiterDeg &&
          s4?.filler === '100x0' &&
          s4?.stack === stackOf(want.stack1) &&
          avReload === 2 &&
          (drawnReload ?? []).length === want.spans.length,
        `база: ${JSON.stringify(runDb?.topFiller)} · ${JSON.stringify(liftDb)} · экран ${s4?.stack} · механизмов ${avReload} · кусков планки ${(drawnReload ?? []).length}`,
      );
      if (tablet) {
        const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
        check(`${L}.7 планшет: прокрутки по ширине нет`, wide <= 0, `лишние ${wide} px`);
      }
      check(`${L} ошибок страницы и консоли нет`, errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: tablet ? { width: 1024, height: 768 } : { width: 1440, height: 900 }, touch: tablet, projects: [{ key: 'ceiling', zone: 'Кухня', fx }] },
  );
}

/* ═════════════════════════  FRONTS: редактор «Фасады ящиков» (ТЗ 2026-11-02, A2–A4)  ═════════════════════════ */

const frontsState = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-drawer-fronts]');
    if (!root) return null;
    return {
      total: Number(root.getAttribute('data-drawer-fronts-total')),
      gap: Number(root.getAttribute('data-drawer-fronts-gap')),
      rows: Number(root.getAttribute('data-drawer-fronts-rows')),
      count: Number(root.getAttribute('data-drawer-fronts-count')),
      split: root.getAttribute('data-drawer-split') ?? '',
      slots: [...root.querySelectorAll('[data-drawer-row]')].map((r) => Number(r.getAttribute('data-row-slot'))),
      locks: [...root.querySelectorAll('[data-drawer-row]')].map((r) => r.getAttribute('data-row-locked')).join(''),
      fronts: [...root.querySelectorAll('[data-drawer-front]')].map((f) => ({ h: Number(f.getAttribute('data-front-height')), w: Number(f.getAttribute('data-front-width')), ready: f.getAttribute('data-front-ready') })),
      notice: root.querySelector('[data-drawer-fronts-notice]')?.textContent ?? null,
    };
  });
/** Нажатие так, как его делает человек: элемент прокручен в окно панели, в его центре — он сам. */
async function humanPress(page, selector, label, touch) {
  const b = page.locator(selector).first();
  must(`${label}: ${selector}`, (await b.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: ${selector}`);
  await b.scrollIntoViewIfNeeded();
  const reach = await humanReach(page, selector);
  must(`${label}: ${selector} на экране и не закрыт`, reach.inView && reach.onTop, JSON.stringify(reach));
  if (touch) await page.touchscreen.tap(reach.x, reach.y);
  else await page.mouse.click(reach.x, reach.y);
  await sleep(700);
}
async function typeRow(page, row, value, touch) {
  const sel = `[data-drawer-fronts] [data-row-input="${row}"]`;
  await humanPress(page, sel, `поле ряда ${row + 1}`, touch);
  const input = page.locator(sel).first();
  await input.fill(String(value));
  await input.press('Enter');
  await sleep(900);
}
async function selectModule(page, moduleId) {
  if (!(await page.locator('[data-studio-objects]').first().isVisible().catch(() => false))) {
    must('инструмент «Выбор»', await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="select"]');
  }
  const row = page.locator(`[data-object-module="${moduleId}"]`);
  must(`модуль ${moduleId} в списке объектов`, (await row.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-object-module="${moduleId}"]`);
  await row.first().click();
  await sleep(600);
  await page.waitForSelector('[data-drawer-fronts]', { timeout: 30_000 });
}

async function partFronts(browser, tablet) {
  const L = tablet ? 'FRONTS-TAB' : 'FRONTS';
  console.log(`\n── ${L} (${tablet ? '1024 × 768 касанием' : '1440 × 900'}): «Фасады ящиков» — высоты числом, закрепление, равномерно, пропорционально, отказ с мм, ряды, деление на столбцы, 3D, запись → перезагрузка`);
  const fx = fixture('kitchen');
  const want = fixture('drawersExpect');
  await withOrg(
    L,
    browser,
    async ({ service, page, errors, consoleErrors, ids }) => {
      await openStudio(page, ids.kitchen);
      await saved(page);
      await selectModule(page, want.module);
      const s0 = await frontsState(page);
      const g = s0?.gap ?? NaN;
      check(
        `${L}.1 модуль «Ящики» ${want.module}: блок «Фасады ящиков» — ${s0?.rows} ряда, сумма мест = корпус ${s0?.total} мм, деталь = место − зазор ${g} мм`,
        Boolean(s0) && s0.rows >= 2 && s0.slots.reduce((a, b) => a + b, 0) === s0.total && s0.fronts.every((f, i) => f.h === s0.slots[i] - g),
        JSON.stringify(s0),
      );
      const H = s0.total;
      /* «Остаток автоматически»: верхний 140, затем средний 250 — верхний закреплён и стоит. */
      await typeRow(page, 0, 140, tablet);
      const s1 = await waitFor(page, () => document.querySelector('[data-drawer-row="0"]')?.getAttribute('data-row-slot'), (v) => v === String(140 + g), 20_000);
      await typeRow(page, 1, 250, tablet);
      const s2 = await waitFor(page, () => document.querySelector('[data-drawer-row="1"]')?.getAttribute('data-row-slot'), (v) => v === String(250 + g), 20_000);
      const st2 = await frontsState(page);
      check(
        `${L}.2 верхний фасад 140, затем средний 250 — верхний закреплён и не сдвинулся, остаток — нижнему; сумма мест = корпус`,
        s1 === String(140 + g) && s2 === String(250 + g) && st2.fronts[0].h === 140 && st2.fronts[1].h === 250 && st2.locks.startsWith('11') && st2.slots.reduce((a, b) => a + b, 0) === H,
        JSON.stringify(st2),
      );
      /* Отказ с миллиметрами: фасад 50 мм. */
      await typeRow(page, 2, 50, tablet);
      const st3 = await frontsState(page);
      check(`${L}.3 фасад 50 мм — отказ движка словами с миллиметрами, места прежние`, /не хватает \d+ мм/.test(st3.notice ?? '') && st3.slots.join('/') === st2.slots.join('/'), `«${st3.notice}» · ${st3.slots.join('/')}`);
      /* Равномерно и пропорционально. */
      await humanPress(page, '[data-drawer-fronts-even]', 'Равномерно', tablet);
      const st4 = await waitFor(page, () => document.querySelector('[data-drawer-row="0"]')?.getAttribute('data-row-locked'), (v) => v === '0', 20_000).then(() => frontsState(page));
      const each = Math.floor(H / st4.rows);
      await humanPress(page, '[data-drawer-fronts-shares]', 'доли', tablet);
      await page.locator('[data-drawer-fronts-shares]').first().fill(st4.rows === 3 ? '1:2:2' : Array.from({ length: st4.rows }, () => '1').join(':'));
      await humanPress(page, '[data-drawer-fronts-proportional]', 'Пропорционально', tablet);
      const st5 = await waitFor(page, () => document.querySelector('[data-drawer-row="0"]')?.getAttribute('data-row-slot'), (v) => v === String(Math.floor(H / 5)), 20_000).then(() => frontsState(page));
      check(
        `${L}.4 «Равномерно» — места по ${each} мм, закреплений нет; «Пропорционально» 1 : 2 : 2 — ${Math.floor(H / 5)} / ${Math.floor((2 * H) / 5)} / остаток`,
        st4.slots.slice(0, -1).every((s) => s === each) && st4.locks === '000' && st5.slots[0] === Math.floor(H / 5) && st5.slots[1] === Math.floor((2 * H) / 5) && st5.slots.reduce((a, b) => a + b, 0) === H,
        `${st4.slots.join('/')} · ${st5.slots.join('/')}`,
      );
      let tandembox = null;
      if (!tablet) {
        /* TANDEMBOX путём «Фурнитуры»; минимум системы — отказ словами «царга 83,6». */
        await hardwareFor(page, L, want.module);
        const runner = await installByPath(page, L, 'slide', { brand: 'Blum', series: 'TANDEMBOX antaro', nl: 450, article: want.runner });
        await waitFor(page, () => document.querySelectorAll('[data-hw-slot="drawer_side"]').length, (n) => n > 0, 20_000);
        const sides = await installByPath(page, L, 'drawer_side', { brand: 'Blum', series: 'TANDEMBOX antaro', nl: 450, article: want.sides });
        await selectModule(page, want.module);
        const ready = await waitFor(page, () => [...document.querySelectorAll('[data-drawer-front]')].every((f) => f.getAttribute('data-front-ready') === '1'), (v) => v === true, 30_000);
        await typeRow(page, 0, 100, false);
        const st6 = await frontsState(page);
        tandembox = { runner: runner.installed, sides: sides.installed, ready, notice: st6.notice };
        check(
          `${L}.5 TANDEMBOX 576.4501M + 378M4502SA: ящики за фасадами — коробы системы; верхний фасад 100 мм — отказ словами «царга 83,6 мм» с миллиметрами`,
          runner.installed && sides.installed && ready === true && /царга 83,6/.test(st6.notice ?? '') && /не хватает \d+ мм/.test(st6.notice ?? ''),
          JSON.stringify(tandembox),
        );
      }
      /* Ряды: + один ряд; деление верхнего ряда на два столбца (левый 200). */
      await humanPress(page, '[data-drawer-fronts-more]', 'больше рядов', tablet);
      const rows7 = await waitFor(page, () => document.querySelector('[data-drawer-fronts]')?.getAttribute('data-drawer-fronts-rows'), (v) => v === String(st5.rows + 1), 20_000);
      await humanPress(page, '[data-drawer-split-left]', 'левый столбец', tablet);
      await page.locator('[data-drawer-split-left]').first().fill('200');
      await page.locator('[data-drawer-split-rows]').first().scrollIntoViewIfNeeded();
      await page.locator('[data-drawer-split-rows]').first().selectOption('1');
      const split = await waitFor(page, () => document.querySelector('[data-drawer-fronts]')?.getAttribute('data-drawer-split'), (v) => v === '200x1', 20_000);
      const st8 = await frontsState(page);
      const W = st8.fronts[st8.fronts.length - 1].w + g;
      check(
        `${L}.6 рядов ${st5.rows} → ${st5.rows + 1}; верхний ряд на два столбца (левый 200 мм): фасадов ${st5.rows + 2}, верхние ${200 - g} и ${W - 200 - g} мм, ниже — на всю ширину`,
        rows7 === String(st5.rows + 1) && split === '200x1' && st8.count === st5.rows + 2 && st8.fronts[0].w === 200 - g && st8.fronts[1].w === W - 200 - g && st8.fronts.slice(2).every((f) => f.w === W - g),
        JSON.stringify(st8),
      );
      /* A6: внутренний ящик за нижним фасадом (зона 100) и органайзер в ящике 3 — визуальный прототип словами. */
      const lastCell = st8.count - 1;
      await humanPress(page, `[data-front-inners="${lastCell}"]`, 'зоны внутренних ящиков', tablet);
      await page.locator(`[data-front-inners="${lastCell}"]`).first().fill('100');
      await page.locator(`[data-front-inners="${lastCell}"]`).first().press('Enter');
      const innerRow = await waitFor(page, (leaf) => document.querySelector(`[data-front-inner="${leaf}"]`)?.textContent ?? null, (v) => Boolean(v), 20_000, `idrawer:${lastCell}:0`);
      await page.locator('[data-front-insert="2"]').first().scrollIntoViewIfNeeded();
      await page.locator('[data-front-insert="2"]').first().selectOption('organizer');
      const insertWords = await waitFor(page, () => document.querySelector('[data-front-insert-words="2"]')?.textContent ?? null, (v) => Boolean(v), 20_000);
      check(
        `${L}.6b внутренний ящик за нижним фасадом (зона 100 мм) и органайзер в ящике 3 — в редакторе со словами: открывается с наружным, органайзер — визуальный прототип`,
        /зона 100 мм/.test(innerRow ?? '') && /открывается, когда открыт фасад/.test(innerRow ?? '') && /визуальный прототип/.test(insertWords ?? ''),
        `«${innerRow}» · «${insertWords}»`,
      );
      /* 3D: «Открыть всё» — каждый ящик своим ключом выезжает, «Закрыть всё». */
      await open3d(page, L);
      const ids5 = [...Array.from({ length: st8.count }, (_, i) => `${want.module}:drawer:${i}`), `${want.module}:idrawer:${lastCell}:0`];
      await openAll(page, ids5[0], (v) => v.shift[2] > 50);
      const moved = [];
      for (const id of ids5) moved.push(await moving(page, id));
      await page.screenshot({ path: `${OUT}/${L.toLowerCase()}-open.png`, timeout: 120_000 });
      const organizer = await moving(page, `${want.module}:drawer:2`);
      check(
        `${L}.7 3D: «Открыть всё» — все ${st8.count} ящиков (два в верхнем ряду) и внутренний выехали каждый своим ключом; органайзер едет с ящиком 3`,
        moved.every((m) => m && m.shift[2] > 50) && (organizer?.names?.['mech:insert'] ?? 0) > 0,
        `${moved.map((m, i) => `${i}: ${m ? Math.round(m.shift[2]) : 'НЕТ'}`).join(' · ')} · органайзер: ${JSON.stringify(organizer?.names ?? null)}`,
      );
      await closeAll(page);
      if (!tablet) {
        /* Деталировка: перегородка и перемычка — строками раскроя. */
        must(`${L} инструмент «Документы»`, await tool(page, 'documents'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="documents"]');
        await page.locator('[data-studio-doc="panels"]').first().click();
        await page.waitForSelector('[data-panel-row]', { timeout: 30_000 });
        const text = await page.evaluate(() => [...document.querySelectorAll('[data-panel-row]')].map((r) => r.textContent ?? '').join('\n'));
        check(
          `${L}.8 деталировка: перегородка вертикальная и горизонтальная (перемычка ${W - 32} мм) и фасады ${200 - g} / ${W - 200 - g} мм — строками раскроя`,
          /Перегородка вертикальная/.test(text) && /Перегородка горизонтальная/.test(text) && text.includes(String(W - 32)) && text.includes(String(200 - g)) && text.includes(String(W - 200 - g)),
          text.split('\n').filter((l) => /Перегородка|Фронт ящика/.test(l)).slice(0, 6).join(' | '),
        );
      }
      /* Запись → база → перезагрузка. */
      await saved(page);
      const row = (await service.from('projects').select('millwork').eq('id', ids.kitchen).single()).data;
      const all = [...(row?.millwork?.runs?.optimal?.modules ?? []), ...(row?.millwork?.runs?.optimal?.upperSegments ?? []).flatMap((s) => s.modules)];
      const unit = all.find((m) => m.id === want.module);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
      await sleep(1500);
      await selectModule(page, want.module);
      const st9 = await frontsState(page);
      check(
        `${L}.9 в базе у модуля места ${st8.slots.join('/')}, деление 200 × 1, внутренний ящик и органайзер; после перезагрузки редактор показывает то же`,
        JSON.stringify(unit?.fill?.drawerHeights) === JSON.stringify(st8.slots) &&
          JSON.stringify(unit?.fill?.drawerInners) === JSON.stringify([{ cell: lastCell, heightsMm: [100] }]) &&
          unit?.fill?.drawerInserts?.['drawer:2']?.kind === 'organizer' &&
          (await page.locator(`[data-front-inner="idrawer:${lastCell}:0"]`).count()) > 0 &&
          unit?.fill?.drawerSplit?.leftMm === 200 &&
          unit?.fill?.drawerSplit?.rows === 1 &&
          st9.slots.join('/') === st8.slots.join('/') &&
          st9.split === '200x1' &&
          st9.count === st8.count,
        `база ${JSON.stringify(unit?.fill?.drawerHeights)} ${JSON.stringify(unit?.fill?.drawerSplit)} · экран ${st9.slots.join('/')} ${st9.split}`,
      );
      if (tablet) {
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        check(`${L}.10 1024 × 768: прокрутки по ширине нет`, wide <= 0, `лишние ${wide} px`);
      }
      await page.screenshot({ path: `${OUT}/${L.toLowerCase()}-editor.png`, timeout: 120_000 });
      check(`${L} ошибок страницы и консоли нет`, errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    {
      viewport: tablet ? { width: 1024, height: 768 } : { width: 1440, height: 900 },
      touch: tablet,
      importHardware: !tablet,
      production: { drawerBox: DRAWER_BOX },
      projects: [{ key: 'kitchen', zone: 'Кухня', fx }],
    },
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
        `DRAWERS.B ящик выехал на ${want.travelMm} мм (${want.travelWords}); едут: царги металлом 2 + секции направляющей 2 (секций у модели ${want.members}: средних на половину хода ${want.members === 3 ? 2 : 0}), дно и задняя стенка раскроя; боковин ЛДСП нет`,
        Boolean(drawer) &&
          drawer.shift[2] === want.travelMm &&
          (drawer.names['mech:runner'] ?? 0) === 4 &&
          (drawer.names['mech:runner-middle'] ?? 0) === (want.members === 3 ? 2 : 0) &&
          (drawer.names['panel:Дно ящика'] ?? 0) === 1 &&
          (drawer.names['panel:Торец ящика'] ?? 0) === 1 &&
          (drawer.names['panel:Боковина ящика'] ?? 0) === 0 &&
          /* Царги и ходовые — сечением профиля, а не бруском (ТЗ 2026-10-31, § 5, 8). */
          (drawer.sections?.['drawer-side'] ?? 0) === 2 &&
          /* Ходовая и средняя секции — С-профилем: при трёх секциях (полное выдвижение) их 4, как у KA (KITCHEN.B2). */
          (drawer.sections?.['runner-channel'] ?? 0) === (want.members === 3 ? 4 : 2) &&
          (want.members !== 3 || (Array.isArray(drawer.middleShift) && Math.abs(drawer.middleShift[2] - want.travelMm / 2) <= 1)),
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

/* ═════════════════════════  OPEN (P0, ТЗ 2026-10-31 § 21)  ═════════════════════════ */

/**
 * Открытие объекта с каталогом 5264 позиций: время до Studio и до 3D, объём
 * чтения каталога браузером, поставленная петля в сцене без списка
 * производителей, список — только по открытию «Фурнитуры». Три открытия:
 * первое (холодное) и два повторных.
 */
async function partOpen(browser) {
  console.log('\n── OPEN (1440 × 900, P0): объект открывается без списка производителей; поставленная петля в сцене; список — по требованию панели');
  const fx = fixture('kitchen');
  await withOrg(
    'OPEN',
    browser,
    async ({ service, org, page, errors, consoleErrors, ids }) => {
      /* Петля 71B3550 на дверце 450 — до открытия объекта, как у сохранённого заказа. */
      const { data: hingeRow, error: hingeError } = await service.from('catalog_items').select('id').eq('org_id', org.id).eq('article', 'MFR-BLUM-71B3550').single();
      if (hingeError || !hingeRow) throw new Stop(`позиции MFR-BLUM-71B3550 в каталоге организации нет: ${hingeError?.message ?? 'пусто'}`);
      const { data: row } = await service.from('projects').select('millwork').eq('id', ids.kitchen).single();
      const millwork = row.millwork;
      const run = millwork.runs.optimal;
      const door = run.modules.find((m) => m.id === 'base-1200@w1');
      must('OPEN модуль base-1200@w1 в ряду объекта', Boolean(door), 'НУЛЕВОЙ СЕЛЕКТОР: base-1200@w1');
      door.fittings = [{ slot: 'hinge', itemId: hingeRow.id }];
      const { error: upError } = await service.from('projects').update({ millwork }).eq('id', ids.kitchen);
      if (upError) throw new Stop(`объект не обновился: ${upError.message}`);

      /* Сколько каталога читает браузер: ответы catalog_items, байты тела и запросы списка производителей. */
      const traffic = { bytes: 0, requests: 0, mfrList: 0 };
      page.on('response', async (response) => {
        const url = response.url();
        if (!url.includes('/rest/v1/catalog_items')) return;
        traffic.requests += 1;
        /* Список производителей — «MFR-…» без отбора по статье сметы; запрос позиций со ставкой — не список. */
        const plain = decodeURIComponent(url);
        if (plain.includes('article=like.MFR-') && !plain.includes('meta->>estimateKey=not.is.null')) traffic.mfrList += 1;
        try {
          traffic.bytes += (await response.body()).length;
        } catch {
          /* тело ответа недоступно (перенаправление) — в объём не входит, запрос посчитан */
        }
      });
      const opens = [];
      for (let i = 0; i < 3; i += 1) {
        traffic.bytes = 0;
        traffic.requests = 0;
        traffic.mfrList = 0;
        const t0 = Date.now();
        if (i === 0) await openStudio(page, ids.kitchen);
        else {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
          await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
        }
        const studioMs = Date.now() - t0;
        await open3d(page, 'OPEN');
        const readyMs = Date.now() - t0;
        /* Поставленная петля — в сцене без панели: позиция объекта дочитана по идентификатору. */
        const metalNow = await settledMetal(page);
        opens.push({ studioMs, readyMs, bytes: traffic.bytes, requests: traffic.requests, mfrList: traffic.mfrList, metal: metalNow });
        console.log(`  ·    открытие ${i + 1}: Studio ${studioMs} мс · 3D ${readyMs} мс · каталог браузером ${Math.round(traffic.bytes / 1024)} кБ в ${traffic.requests} запросах · запросов списка производителей ${traffic.mfrList}`);
      }
      const doorOpen = await openAll(page, 'base-1200@w1:door:0', (v) => Math.abs(v.rotationDeg[1]) >= 80);
      const links = await page.evaluate(() => (window.__mwHingeLinks ? window.__mwHingeLinks() : null));
      await closeUp(page, 'base-1200@w1:door:0');
      await page.screenshot({ path: `${OUT}/open-1-hinge-without-list.png`, timeout: 120_000 });
      check(
        'OPEN.A объект открывается без списка производителей: запросов списка «MFR-…» 0 при каждом из трёх открытий, каталог браузером — меньше 1 МБ',
        opens.every((o) => o.mfrList === 0 && o.bytes < 1024 * 1024),
        opens.map((o) => `${Math.round(o.bytes / 1024)} кБ / ${o.mfrList}`).join(' · '),
      );
      check(
        'OPEN.B поставленная петля 71B3550 — в сцене без открытия «Фурнитуры»: чашки едут с дверцей, звенья короче 0,1 м, аномалий сцены нет (предохранитель ничего не спрятал)',
        Boolean(doorOpen) && doorOpen.names['rider:hinge'] === 2 && Boolean(links) && links.count > 0 && links.maxM <= 0.1 && links.anomalies === 0,
        `${JSON.stringify(doorOpen?.names)} · звенья ${JSON.stringify(links)}`,
      );
      await closeAll(page);

      /* Панель «Фурнитура» — список производителей по требованию, со словами о загрузке. */
      const t1 = Date.now();
      must('OPEN инструмент «Выбор»', await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="select"]');
      must('OPEN инструмент «Фурнитура»', await tool(page, 'hardware'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="hardware"]');
      const sawProgress = await waitFor(page, () => document.querySelector('[data-hw-panel]')?.getAttribute('data-hw-list') ?? null, (s) => s === 'loading' || s === 'ready' || s === 'error', 30_000);
      const state = await waitFor(page, () => document.querySelector('[data-hw-panel]')?.getAttribute('data-hw-list') ?? null, (s) => s === 'ready' || s === 'error', 180_000);
      const listMs = Date.now() - t1;
      const items = await page.evaluate(() => Number(document.querySelector('[data-hw-panel]')?.getAttribute('data-hw-items') ?? 0));
      console.log(`  ·    список производителей: ${state} за ${listMs} мс · ${Math.round(traffic.bytes / 1024)} кБ · позиций в панели ${items}`);
      check(
        'OPEN.C «Фурнитура» читает список производителей по требованию: все 5264 позиции в панели; пока читается — состояние «загружается»',
        sawProgress !== null && state === 'ready' && items >= FACT_COUNT && traffic.mfrList > 0,
        `состояние ${state} · позиций ${items} при ${FACT_COUNT} · запросов списка ${traffic.mfrList}`,
      );
      check('OPEN ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    {
      viewport: { width: 1440, height: 900 },
      production: { drawerBox: DRAWER_BOX },
      projects: [{ key: 'kitchen', zone: 'Кухня', fx }],
    },
  );
}

/* ═════════════════════════  TANDEMBOX — модель реестра (ТЗ 2026-11-01, приоритет № 1)  ═════════════════════════ */

/**
 * «Импорт CAD-фурнитуры» → реестр → TANDEMBOX antaro в Studio. Файлы — визуальная
 * реконструкция по чертежу Blum (`scripts/twin-tandembox-asset.ts`, каталог
 * 2024-2025, pdf 301), НЕ CAD производителя, и так и записаны. Проверяется путь:
 * импорт двух файлов (царга 378M4502SA, ходовая 576.4501M) тем же экраном,
 * установка позиций путём панели «Фурнитура», модели на местах движка, ход —
 * едущие части с ящиком на ход модели направляющей, корпусные стоят; снимки
 * крупным планом; снятие моделей — файлы удалены (чтением).
 */
async function importCad(page, service, org, { label, article, query, file, roles, license, note, finish = null }) {
  await page.goto(`${BASE}/admin/catalog/cad`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('[data-cad-import]', { timeout: 60_000 });
  await page.locator('[data-cad-item-search]').fill(query);
  await page.waitForSelector(`[data-cad-item="${article}"]`, { timeout: 30_000 });
  await page.locator(`[data-cad-item="${article}"]`).click();
  await page.locator('[data-cad-file]').setInputFiles(file);
  await page.waitForSelector('[data-cad-preview="ready"]', { timeout: 60_000 });
  const bounds = await page.getAttribute('[data-cad-bounds]', 'data-cad-bounds');
  const fit = await page.getAttribute('[data-cad-check]', 'data-cad-check');
  const fitWords = (await page.locator('[data-cad-check]').first().textContent()) ?? '';
  await page.locator('[data-cad-anchor]').selectOption('custom');
  for (const [node, role] of Object.entries(roles)) {
    const select = page.locator(`[data-cad-role="${node}"]`);
    must(`${label}: роль узла «${node}» в импорте`, (await select.count()) === 1, `НУЛЕВОЙ СЕЛЕКТОР: [data-cad-role="${node}"]`);
    await select.selectOption(role);
  }
  await page.locator('[data-cad-source-kind]').selectOption('drawing_reconstruction');
  await page.locator('[data-cad-license]').fill(license);
  await page.locator('[data-cad-rights]').selectOption('VERIFIED');
  await page.locator('[data-cad-rights-note]').fill(note);
  await page.locator('[data-cad-visual]').check();
  /* «Как в файле» — покраска, цинк и пластик реконструкции, а не одно покрытие на всё. */
  if (finish) await page.locator('[data-cad-finish]').selectOption(finish);
  const anchorMm = await page.getAttribute('[data-cad-anchor-mm]', 'data-cad-anchor-mm');
  await page.screenshot({ path: `${OUT}/import-${article}.png`, timeout: 120_000 });
  await page.locator('[data-cad-save]').click();
  const sha = await waitFor(page, () => document.querySelector('[data-cad-notice]')?.getAttribute('data-cad-saved') ?? null, (v) => Boolean(v), 60_000);
  const { data: row } = await service.from('catalog_items').select('id, meta').eq('org_id', org.id).eq('article', article).single();
  const { data: files } = await service.storage.from('catalog').list(`${org.id}/hardware-cad/${row.id}`);
  return { bounds, fit, fitWords, anchorMm, sha, twin: row?.meta?.twin, itemId: row?.id, files: (files ?? []).map((f) => f.name) };
}

async function partTandembox(browser) {
  console.log('\n── TANDEMBOX (1440 × 900): «Импорт CAD-фурнитуры» царги и ходовой → установка путём панели → модель в Studio, ход, крупный план');
  const fx = fixture('kitchen');
  const want = fixture('drawersExpect');
  const dir = resolve('.capture-check/hardware/tandembox');
  const made = JSON.parse(execSync(`npx tsx --tsconfig tsconfig.scripts.json scripts/twin-tandembox-asset.ts "${dir}"`, { encoding: 'utf8' }));
  await withOrg(
    'TANDEMBOX',
    browser,
    async ({ service, org, page, errors, consoleErrors, ids }) => {
      const removeIds = [];
      try {
        const license = 'собственная реконструкция ALDIK Studio по чертежу Blum (каталог 2024-2025, pdf 301 / печ. 297), не CAD производителя';
        const note = 'геометрия построена ALDIK Studio: напечатаны 95,5 / 37,5 / 83,6 и позиции саморезов; форма профиля снята с чертежа масштабом';
        const side = await importCad(page, service, org, {
          label: 'TANDEMBOX царга',
          article: want.sides,
          query: '378M4502SA',
          file: made.side.path,
          roles: { 'side-profile': 'moving' },
          finish: 'file',
          license,
          note,
        });
        removeIds.push(side.itemId);
        const runnerFile = await importCad(page, service, org, {
          label: 'TANDEMBOX ходовая',
          article: want.runner,
          query: '576.4501M',
          file: made.runner.path,
          /* Каретка с роликами — между корпусным профилем и профилем царги (сечение pdf 301): половина хода. */
          roles: { 'cabinet-member': 'fixed', 'mount-screws': 'fixed', carriage: 'middle', rollers: 'middle' },
          finish: 'file',
          license,
          note,
        });
        removeIds.push(runnerFile.itemId);
        check(
          `TBX.A импорт: габарит царги ${made.side.size.join('×')} мм и ходовой ${made.runner.size.join('×')} мм = файлам, проверка против изделия (NL 450) — да; в реестре — «визуальная реконструкция», источник — по чертежу, точка 0,0,0 (кромка и низ дна), роли узлов и материалы — как в файле; файлы — в Storage папки позиции`,
          side.bounds === made.side.size.join('x') &&
            runnerFile.bounds === made.runner.size.join('x') &&
            side.fit === 'ok' &&
            runnerFile.fit === 'ok' &&
            side.anchorMm === '0.0,0.0,0.0' &&
            [side, runnerFile].every((r) => r.twin?.status === 'VISUAL_RECONSTRUCTION' && r.twin?.source?.kind === 'drawing_reconstruction' && r.twin?.finish === undefined && r.files.includes(`${r.sha}.glb`)) &&
            runnerFile.twin.parts.filter((p) => p.role === 'fixed').length === 2 &&
            runnerFile.twin.parts.filter((p) => p.role === 'middle').length === 2 &&
            runnerFile.twin.parts.filter((p) => p.role === 'moving').length === 0,
          `царга ${side.bounds} (${side.fitWords.slice(0, 60)}) · ходовая ${runnerFile.bounds} · ${side.twin?.status} · файлов ${side.files.length} + ${runnerFile.files.length}`,
        );

        /* Пользователь выбирает изделие путём панели — и видит модель реестра. */
        await openStudio(page, ids.kitchen);
        await open3d(page, 'TANDEMBOX');
        await hardwareFor(page, 'TANDEMBOX', want.module);
        const runner = await installByPath(page, 'TANDEMBOX', 'slide', { brand: 'Blum', series: 'TANDEMBOX antaro', nl: 450, article: want.runner });
        await waitFor(page, () => document.querySelectorAll('[data-hw-slot="drawer_side"]').length, (n) => n > 0, 20_000);
        const sides = await installByPath(page, 'TANDEMBOX', 'drawer_side', { brand: 'Blum', series: 'TANDEMBOX antaro', nl: 450, article: want.sides });
        must('TANDEMBOX ходовая и царги поставлены путём панели', runner.installed && sides.installed, JSON.stringify({ runner: runner.installed, sides: sides.installed }));
        await saved(page);
        await quiet(page);
        const closed = await waitFor(
          page,
          () => (window.__mwTwinCenters ? window.__mwTwinCenters() : null),
          (v) => Boolean(v) && v.filter((m) => m.role === 'fixed').length >= 4 && v.filter((m) => m.role === 'moving').length >= 2 && v.filter((m) => m.role === 'middle').length >= 4,
          60_000,
        );
        const fixedN = closed?.filter((m) => m.role === 'fixed').length ?? 0;
        const movingN = closed?.filter((m) => m.role === 'moving').length ?? 0;
        const middleN = closed?.filter((m) => m.role === 'middle').length ?? 0;
        check(
          `TBX.B модели реестра в сцене на ${want.drawers} ящиках: у каждого — 2 царги (едут с ящиком), 2 каретки с роликами (половина хода) и 2 корпусных профиля с саморезами (стоят) — по сечению Blum pdf 301; придуманной ходовой нет, брусков на их месте нет`,
          fixedN === 4 * want.drawers && movingN === 2 * want.drawers && middleN === 4 * want.drawers && want.members === 3,
          `неподвижных мешей ${fixedN} (ждём ${4 * want.drawers}) · едущих ${movingN} (ждём ${2 * want.drawers}) · кареток ${middleN} (ждём ${4 * want.drawers}) · секций у модели ${want.members}`,
        );
        const metals = (closed ?? []).filter((m) => m.metal > 0);
        check(
          'TBX.F металл модели (покрытие импорта и цинк файла) — со своей картой окружения, как ручки: без неё царга рисовалась почти чёрной',
          metals.length > 0 && metals.every((m) => m.ownEnv),
          `металлических мешей ${metals.length} · со своей картой ${metals.filter((m) => m.ownEnv).length}`,
        );
        /* Крупный план: цель камеры — в центре холста; вырезка вокруг неё при плотности 2×. Ближе 1 м камера не подходит (предел сцены). */
        const key = (part, side, role, node) => closed.find((m) => m.key === `${part}|${side}|${role}|${node}`);
        const top = `${want.module}:drawer:0`;
        const sideL = key(top, 'L', 'moving', 'side-profile');
        must('TANDEMBOX царга верхнего ящика в окошке', Boolean(sideL), `ключи: ${closed.map((m) => m.key).slice(0, 4).join(' · ')}`);
        const shot = async (name, target, offset, size) => {
          await page.evaluate((pose) => (window.__mwCadCamera ? window.__mwCadCamera(pose) : null), { position: [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]], target });
          await sleep(2500);
          const box = await page.locator('[data-studio-viewport] canvas').first().boundingBox();
          const clip = { x: box.x + box.width / 2 - size[0] / 2, y: box.y + box.height / 2 - size[1] / 2, width: size[0], height: size[1] };
          await page.screenshot({ path: `${OUT}/${name}`, clip, timeout: 120_000 });
        };
        const sideFront = [sideL.center[0], sideL.center[1], sideL.center[2] + 0.225];
        await shot('tandembox-0-module-closed.png', [sideFront[0] + 0.25, sideFront[1] - 0.15, sideFront[2]], [-0.45, 0.35, 0.9], [760, 520]);
        /* Торец царг без фасадов: сечение, которое рисует чертёж Blum. */
        await page.locator('[data-scene-layers-toggle]').first().click();
        await page.locator('[data-scene-layer="fronts"]').first().click();
        await sleep(1500);
        await shot('tandembox-1-section-end.png', sideFront, [0.0, 0.02, 1.0], [300, 260]);
        await page.locator('[data-scene-layer="fronts"]').first().click();
        await page.locator('[data-scene-layers-toggle]').first().click();
        const opened = await openAll(page, `${want.module}:drawer:0`, (v) => v.shift[2] >= want.travelMm - 1);
        const after = await page.evaluate(() => (window.__mwTwinCenters ? window.__mwTwinCenters() : null));
        const moved = (role) =>
          (after ?? []).filter((m) => m.role === role).map((m) => {
            const before = closed.find((c) => c.key === m.key);
            return before ? Math.hypot(m.center[0] - before.center[0], m.center[1] - before.center[1], m.center[2] - before.center[2]) : NaN;
          });
        const fixedMoves = moved('fixed');
        const movingMoves = moved('moving');
        const middleMoves = moved('middle');
        /* Открытый ящик сверху: царги во всю длину, дно и задняя стенка раскроя. */
        const sideOpen = (after ?? []).find((m) => m.key === `${top}|L|moving|side-profile`);
        const sideOpenR = (after ?? []).find((m) => m.key === `${top}|R|moving|side-profile`);
        if (sideOpen && sideOpenR) {
          const mid = [(sideOpen.center[0] + sideOpenR.center[0]) / 2, sideOpen.center[1], sideOpen.center[2]];
          await shot('tandembox-2-open-top.png', mid, [-0.35, 0.8, 0.55], [760, 520]);
          /* Ходовая изнутри ящика: корпусная секция с саморезами и ходовая под царгой. */
          await page.locator('[data-scene-layers-toggle]').first().click();
          await page.locator('[data-scene-layer="fronts"]').first().click();
          await sleep(1500);
          await shot('tandembox-3-runner-inside.png', [sideOpen.center[0] - 0.01, sideOpen.center[1] - 0.04, sideOpen.center[2] + 0.15], [0.55, 0.25, 0.8], [520, 380]);
          await page.locator('[data-scene-layer="fronts"]').first().click();
          await page.locator('[data-scene-layers-toggle]').first().click();
          /* Направляющая открытого ящика крупным планом — в виде «Фурнитура» (корпус и фасады не закрывают): корпусный профиль, каретка на половине хода, царга. */
          const carriage = (after ?? []).find((m) => m.key === `${top}|L|middle|carriage`);
          const preset = page.locator('[data-scene-preset-select]');
          if (carriage && (await preset.count()) > 0) {
            const usual = await preset.first().inputValue();
            await preset.first().selectOption('hardware');
            await sleep(1500);
            await shot('tandembox-4-runner-open-hardware.png', carriage.center, [0.32, 0.18, 0.5], [620, 420]);
            await shot('tandembox-5-side-open-hardware.png', sideOpen.center, [0.5, 0.12, 0.35], [620, 420]);
            await preset.first().selectOption(usual);
            await sleep(1000);
          }
        }
        check(
          `TBX.C ход по определению Blum (полное выдвижение, потеря 0 — pdf 728, 731): «Открыть всё» — царги едут с ящиком на ${want.travelMm} мм (± 1), каретки с роликами — на половину (${want.travelMm / 2} ± 1), корпусные профили и саморезы стоят (сдвиг 0)`,
          Boolean(opened) &&
            fixedMoves.length === fixedN &&
            fixedMoves.every((d) => d < 1e-6) &&
            movingMoves.length === movingN &&
            movingMoves.every((d) => Math.abs(d * 1000 - want.travelMm) <= 1) &&
            middleMoves.length === middleN &&
            middleMoves.every((d) => Math.abs(d * 1000 - want.travelMm / 2) <= 1),
          `царг ${movingMoves.length}: ${[...new Set(movingMoves.map((d) => (d * 1000).toFixed(1)))].join(', ')} мм · кареток ${middleMoves.length}: ${[...new Set(middleMoves.map((d) => (d * 1000).toFixed(1)))].join(', ')} мм · стоящих ${fixedMoves.length}: ${[...new Set(fixedMoves.map((d) => (d * 1000).toFixed(1)))].join(', ')} мм · ${want.travelWords.slice(0, 90)}`,
        );
        await closeAll(page);
        const anomalies = await page.evaluate(() => (window.__mwSceneAnomalies ?? []).length);
        check('TBX.D аномалий сцены нет (модели загрузились, габарит — изделия)', anomalies === 0, `аномалий ${anomalies}`);
      } finally {
        for (const itemId of removeIds.filter(Boolean)) {
          const res = await page.request.post(`${BASE}/api/catalog/hardware/twin`, { data: { action: 'remove', itemId }, timeout: 120_000 });
          const { data: left } = await service.storage.from('catalog').list(`${org.id}/hardware-cad/${itemId}`);
          check(`TBX.E «Снять модель» ${itemId.slice(0, 8)}: файлов 0`, res.ok() && (left ?? []).length === 0, `ответ ${res.status()} · файлов ${(left ?? []).length}`);
        }
      }
      check('TANDEMBOX ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    {
      viewport: { width: 1440, height: 900 },
      scale: 2,
      production: { drawerBox: DRAWER_BOX },
      projects: [{ key: 'kitchen', zone: 'Кухня', fx }],
    },
  );
}

/* ═════════════════════════  CLIP — петля 71B3550 моделью реестра (ТЗ 2026-11-01, п. 5)  ═════════════════════════ */

/**
 * «Импорт CAD-фурнитуры» → реестр → петля Blum CLIP top BLUMOTION 71B3550 с планкой
 * 175H3130 в Studio. Файл — визуальная реконструкция по чертежам Blum
 * (`scripts/twin-hinge-asset.ts`: каталог 2024-2025, pdf 81, 154, 724), НЕ CAD
 * производителя, и так и записан; материалы — как в файле. Путь: импорт экраном,
 * петля и планка путём панели «Фурнитура», модель на осях чашек движка, чашка
 * едет со створкой, плечо и планка стоят; снимки крупным планом; снятие — файлы
 * удалены (чтением).
 */
async function partClip(browser) {
  console.log('\n── CLIP (1440 × 900): «Импорт CAD-фурнитуры» петли 71B3550 → петля и планка путём панели → модель в Studio, ход, крупный план');
  const fx = fixture('kitchen');
  const dir = resolve('.capture-check/hardware/hinge');
  const made = JSON.parse(execSync(`npx tsx --tsconfig tsconfig.scripts.json scripts/twin-hinge-asset.ts "${dir}"`, { encoding: 'utf8' }));
  const MODULE = 'base-1200@w1';
  await withOrg(
    'CLIP',
    browser,
    async ({ service, org, page, errors, consoleErrors, ids }) => {
      let itemId = null;
      try {
        const roles = Object.fromEntries([...made.roles.moving.map((n) => [n, 'moving']), ...made.roles.fixed.map((n) => [n, 'fixed'])]);
        const imp = await importCad(page, service, org, {
          label: 'CLIP петля',
          article: 'MFR-BLUM-71B3550',
          query: '71B3550',
          file: made.hinge.path,
          roles,
          finish: 'file',
          license: 'собственная реконструкция ALDIK Studio по чертежам Blum (каталог 2024-2025, pdf 81 / печ. 77, pdf 154 / печ. 150, pdf 724 / печ. 720), не CAD производителя',
          note: 'геометрия построена ALDIK Studio: напечатаны чашка, фланец, высота и длина плеча, планка и её отверстия; форма плеча и щёк шарнира снята с чертежа; оси звеньев — четырёхзвенник, подобранный под угол 110° и вхождение 12 мм',
        });
        itemId = imp.itemId;
        check(
          `CLIP.A импорт: габарит ${made.hinge.size.join('×')} мм = файлу, против изделия — да; в реестре — «визуальная реконструкция» по чертежу, точка 0,0,0 (ось чашки), материалы файла (покрытие не навязано), узлов ${made.hinge.nodes.length}: едут ${made.roles.moving.length}, стоят ${made.roles.fixed.length}; файл в Storage папки позиции`,
          imp.bounds === made.hinge.size.join('x') &&
            imp.fit === 'ok' &&
            imp.anchorMm === '0.0,0.0,0.0' &&
            imp.twin?.status === 'VISUAL_RECONSTRUCTION' &&
            imp.twin?.source?.kind === 'drawing_reconstruction' &&
            imp.twin?.finish === undefined &&
            imp.twin?.parts?.length === made.hinge.nodes.length &&
            imp.twin.parts.filter((p) => p.role === 'moving').length === made.roles.moving.length &&
            imp.files.includes(`${imp.sha}.glb`),
          `габарит ${imp.bounds} (${imp.fitWords.slice(0, 60)}) · ${imp.twin?.status} · покрытие ${imp.twin?.finish ?? 'как в файле'} · узлов ${imp.twin?.parts?.length} · файлов ${imp.files.length}`,
        );

        /* Пользователь выбирает петлю и планку путём панели — и видит модель реестра. */
        await openStudio(page, ids.kitchen);
        await open3d(page, 'CLIP');
        await hardwareFor(page, 'CLIP', MODULE);
        const hinge = await installVia(page, 'CLIP', 'hinge', 'MFR-BLUM-71B3550', '71B3550');
        const plate = await installVia(page, 'CLIP', 'hinge_plate', 'MFR-BLUM-175H3130', '175H3130');
        must('CLIP петля и планка поставлены путём панели', hinge.installed && plate.installed, JSON.stringify({ hinge: hinge.installed, plate: plate.installed }));
        await saved(page);
        await quiet(page);
        const per = made.roles.moving.length;
        const closed = await waitFor(
          page,
          () => (window.__mwTwinCenters ? window.__mwTwinCenters() : null),
          (v) => Boolean(v) && v.filter((m) => m.role === 'moving').length >= 2 * per && v.filter((m) => m.role === 'fixed').length >= 2 * made.roles.fixed.length,
          60_000,
        );
        const movingN = closed?.filter((m) => m.role === 'moving').length ?? 0;
        const fixedN = closed?.filter((m) => m.role === 'fixed').length ?? 0;
        const metals = (closed ?? []).filter((m) => m.metal > 0);
        check(
          `CLIP.B модели реестра на двух петлях дверцы: чашка, фланец, саморезы и щёки с осями чашки (${per} узла) — на полотне, плечо, нос плеча с осями, демпфер, планка и её саморезы (${made.roles.fixed.length}) — на боковине; металл — со своей картой окружения`,
          movingN === 2 * per && fixedN === 2 * made.roles.fixed.length && metals.length > 0 && metals.every((m) => m.ownEnv),
          `едущих мешей ${movingN} (ждём ${2 * per}) · стоящих ${fixedN} (ждём ${2 * made.roles.fixed.length}) · металл ${metals.length}, со своей картой ${metals.filter((m) => m.ownEnv).length}`,
        );
        /*
         * Крупный план. Без полотна чашка видна только в виде «Фурнитура» (`boxShown`: фурнитура на фасаде без фасада
         * висела бы в воздухе) — петля снимается там целиком, закрытой и открытой, и открытой с фасадами. Камера — по
         * центрам частей нижней петли: цель между чашкой и планкой, со стороны середины шкафа, на 0,6 м (ближе сцена
         * камеру не подпускает).
         */
        const lowest = (list, node) => list.filter((m) => m.node === node).sort((a, b) => a.center[1] - b.center[1])[0];
        const cupC = lowest(closed, 'cup');
        const plateC = lowest(closed, 'mounting-plate');
        const arm = lowest(closed, 'arm');
        must('CLIP чашка, плечо и планка нижней петли в окошке', Boolean(cupC && plateC && arm), `узлы: ${[...new Set(closed.map((m) => m.node))].join(', ')}`);
        const inward = Math.sign(cupC.center[0] - plateC.center[0]) || 1;
        const mid = (a, b) => a.center.map((v, k) => (v + b.center[k]) / 2);
        const shot = async (name, target, offset, size) => {
          await page.evaluate((pose) => (window.__mwCadCamera ? window.__mwCadCamera(pose) : null), { position: [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]], target });
          await sleep(2500);
          const box = await page.locator('[data-studio-viewport] canvas').first().boundingBox();
          const clip = { x: box.x + box.width / 2 - size[0] / 2, y: box.y + box.height / 2 - size[1] / 2, width: size[0], height: size[1] };
          await page.screenshot({ path: `${OUT}/${name}`, clip, timeout: 120_000 });
        };
        const preset = page.locator('[data-scene-preset-select]');
        must('CLIP список «Вид»', (await preset.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-scene-preset-select]');
        const usual = await preset.first().inputValue();
        await preset.first().selectOption('hardware');
        await sleep(1500);
        await shot('clip-1-closed-hardware.png', mid(cupC, plateC), [inward * 0.36, 0.22, -0.43], [460, 340]);
        /* Плечо с планкой и саморезами изнутри шкафа — крепление к боковине. */
        await shot('clip-0-plate-hardware.png', plateC.center, [inward * 0.5, 0.18, -0.35], [460, 340]);
        const DOOR = `${MODULE}:door:0`;
        const rotOf = () => page.evaluate((id) => (window.__mwMoving ? window.__mwMoving(id) : null), DOOR);
        /*
         * Ход четырёхзвенником (решение владельца 2026-11-01, п. 2): дверца встаёт на 45° и 90° (угол сцены
         * `openDegrees`) и на полный паспортный 110°. На каждом угле — звенья той же длины, что в закрытой позе.
         */
        const stops = [];
        for (const deg of [45, 90, null]) {
          await page.evaluate(([id, d]) => window.__mwSetOpenDegree?.(id, d), [DOOR, deg]);
          const want = deg ?? 110;
          if (stops.length === 0) await openAll(page, DOOR, (v) => Math.abs(Math.abs(v.rotationDeg[1]) - want) <= 0.5);
          const at = await waitFor(page, () => (window.__mwMoving ? window.__mwMoving('base-1200@w1:door:0') : null), (v) => Boolean(v) && Math.abs(Math.abs(v.rotationDeg[1]) - want) <= 0.5, 30_000);
          await sleep(800);
          /* Звенья ЭТОЙ дверцы: «Открыть всё» открывает и соседние створки, у которых петли каталога нет (звенья условные). */
          const links = await page.evaluate((id) => (window.__mwHingeLinks ? window.__mwHingeLinks(id) : null), DOOR);
          const centers = await page.evaluate(() => (window.__mwTwinCenters ? window.__mwTwinCenters() : null));
          stops.push({ want, rot: at ? Math.abs(at.rotationDeg[1]) : NaN, links, centers });
          const cupNow = lowest(centers ?? [], 'cup');
          await shot(`clip-${deg ?? 110}-hardware.png`, mid(cupNow ?? cupC, plateC), [inward * 0.42, 0.2, 0.4], [460, 340]);
          if (deg === null) {
            /* Сверху — как план на чертеже Blum (pdf 81): плечо на боковине, звенья, фасад на полном открывании. */
            await shot('clip-top-110-hardware.png', mid(cupNow ?? cupC, plateC), [0.02, 0.62, 0.06], [460, 340]);
          }
        }
        const opened = await rotOf();
        const after = stops[stops.length - 1].centers;
        /* Чашка уходит с полотном, плечо стоит: сравниваются центры той же части (узел) у той же петли — ближайший до хода. */
        const shift = (role) =>
          (after ?? []).filter((m) => m.role === role).map((m) => {
            const same = closed.filter((c) => c.node === m.node && c.role === role);
            return Math.min(...same.map((c) => Math.hypot(m.center[0] - c.center[0], m.center[1] - c.center[1], m.center[2] - c.center[2])));
          });
        const fixedMoves = shift('fixed');
        const movingMoves = shift('moving');
        const cupO = lowest(after ?? [], 'cup');
        await preset.first().selectOption(usual);
        await sleep(1500);
        /* Камера ближе к своей боковине: дальше по ширине стоит открытое полотно соседней створки. */
        await shot('clip-3-open-fronts.png', mid(cupO ?? cupC, plateC), [inward * 0.2, 0.3, 0.48], [520, 380]);
        check(
          'CLIP.C ход: «Открыть всё» — дверца на паспортные 110° (± 0,5), чашки с фланцами, саморезами и осями ушли с полотном (≥ 10 мм), плечи, нос плеча, демпферы и планки стоят (сдвиг 0)',
          Boolean(opened) &&
            Math.abs(Math.abs(opened.rotationDeg[1]) - 110) <= 0.5 &&
            fixedMoves.length === fixedN &&
            fixedMoves.every((d) => d < 1e-6) &&
            movingMoves.length === movingN &&
            movingMoves.every((d) => d * 1000 >= 10),
          `поворот ${opened?.rotationDeg?.[1]}° · едущих ${movingMoves.length}: ${movingMoves.map((d) => (d * 1000).toFixed(0)).join('/')} мм · стоящих ${fixedMoves.length}: ${[...new Set(fixedMoves.map((d) => (d * 1000).toFixed(1)))].join(', ')} мм`,
        );
        check(
          'CLIP.F шарнирная кинематика: на 45°, 90° и 110° у обеих петель по 2 звена от оси плеча к оси чашки, каждое — той же длины, что в закрытой позе (± 0,001 мм): чашка и плечо не расходятся',
          stops.length === 3 &&
            stops.every((st) => Math.abs(st.rot - st.want) <= 0.5 && st.links && st.links.count === 4 && st.links.driftM < 1e-6 && st.links.anomalies === 0),
          stops.map((st) => `${st.want}°: поворот ${st.rot.toFixed(1)}°, звеньев ${st.links?.count}, длины ${st.links?.lengthsMm?.join('/')} мм, отклонение ${((st.links?.driftM ?? NaN) * 1000).toFixed(4)} мм`).join(' · '),
        );
        await closeAll(page);
        const anomalies = await page.evaluate(() => (window.__mwSceneAnomalies ?? []).length);
        check('CLIP.D аномалий сцены нет (модель загрузилась, габарит — петли)', anomalies === 0, `аномалий ${anomalies}`);
      } finally {
        if (itemId) {
          const res = await page.request.post(`${BASE}/api/catalog/hardware/twin`, { data: { action: 'remove', itemId }, timeout: 120_000 });
          const { data: left } = await service.storage.from('catalog').list(`${org.id}/hardware-cad/${itemId}`);
          check('CLIP.E «Снять модель»: файлов 0', res.ok() && (left ?? []).length === 0, `ответ ${res.status()} · файлов ${(left ?? []).length}`);
        }
      }
      check('CLIP ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    {
      viewport: { width: 1440, height: 900 },
      scale: 2,
      production: { drawerBox: DRAWER_BOX },
      projects: [{ key: 'kitchen', zone: 'Кухня', fx }],
    },
  );
}

/* ═════════════════════════  TWIN (P1, ТЗ 2026-10-31 § 3–4)  ═════════════════════════ */

/**
 * «Импорт CAD-фурнитуры» → реестр → сцена. Файл — тестовая реконструкция
 * петли 71B3550 (`scripts/twin-test-asset.ts`, НЕ CAD производителя), статус —
 * визуальная реконструкция, источник — собственная. Проверяется путь:
 * разбор, габарит в мм, отказ при неверных единицах, монтажная точка, роли,
 * запись (`meta.twin` + файл в Storage), модель в сцене на оси чашки,
 * чашка едет с дверцей, снятие модели — файлы удалены (чтением).
 */
async function partTwin(browser) {
  console.log('\n── TWIN (1440 × 900, P1): «Импорт CAD-фурнитуры» → реестр 3D → петля в сцене → снятие');
  const fx = fixture('kitchen');
  const asset = resolve('.capture-check/hardware/twin-hinge-71B3550.glb');
  const made = JSON.parse(execSync(`npx tsx --tsconfig tsconfig.scripts.json scripts/twin-test-asset.ts "${asset}"`, { encoding: 'utf8' }));
  await withOrg(
    'TWIN',
    browser,
    async ({ service, org, page, errors, consoleErrors, ids }) => {
      const { data: hingeRow } = await service.from('catalog_items').select('id').eq('org_id', org.id).eq('article', 'MFR-BLUM-71B3550').single();
      must('TWIN позиция MFR-BLUM-71B3550 в каталоге организации', Boolean(hingeRow), 'НУЛЕВОЙ СЕЛЕКТОР: MFR-BLUM-71B3550');
      try {
        await page.goto(`${BASE}/admin/catalog/cad`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await page.waitForSelector('[data-cad-import]', { timeout: 60_000 });
        await page.locator('[data-cad-item-search]').fill('71B3550');
        await page.waitForSelector('[data-cad-item="MFR-BLUM-71B3550"]', { timeout: 30_000 });
        await page.locator('[data-cad-item="MFR-BLUM-71B3550"]').click();
        await page.locator('[data-cad-file]').setInputFiles(asset);
        await page.waitForSelector('[data-cad-preview="ready"]', { timeout: 60_000 });
        const bounds = await page.getAttribute('[data-cad-bounds]', 'data-cad-bounds');
        const okCheck = await page.getAttribute('[data-cad-check]', 'data-cad-check');
        /* Неверные единицы: тот же файл «в метрах» — габарит в 1000 раз больше, записать нельзя. */
        await page.locator('[data-cad-units]').selectOption('m');
        const refused = await waitFor(page, () => document.querySelector('[data-cad-check]')?.getAttribute('data-cad-check') ?? null, (v) => v === 'refused', 10_000);
        const saveDisabledWhenWrong = await page.locator('[data-cad-save]').isDisabled();
        await page.locator('[data-cad-units]').selectOption('mm');
        check(
          `TWIN.A разбор GLB: габарит после нормализации ${made.size.join('×')} мм = файлу; против изделия — да; тот же файл «в метрах» — отказ словами и запись заперта`,
          bounds === made.size.join('x') && okCheck === 'ok' && refused === 'refused' && saveDisabledWhenWrong,
          `габарит ${bounds} · проверка ${okCheck} → в метрах ${refused} (кнопка ${saveDisabledWhenWrong ? 'заперта' : 'ОТКРЫТА'})`,
        );
        await page.locator('[data-cad-anchor]').selectOption('custom');
        await page.locator('[data-cad-role="cup"]').selectOption('moving');
        await page.locator('[data-cad-source-kind]').selectOption('drawing_reconstruction');
        await page.locator('[data-cad-license]').fill('собственная реконструкция ALDIK Studio (тестовый файл приёмки, не CAD производителя)');
        await page.locator('[data-cad-rights]').selectOption('VERIFIED');
        await page.locator('[data-cad-rights-note]').fill('геометрия построена ALDIK Studio по паспорту 71B3550');
        await page.locator('[data-cad-visual]').check();
        const anchorMm = await page.getAttribute('[data-cad-anchor-mm]', 'data-cad-anchor-mm');
        await page.screenshot({ path: `${OUT}/twin-1-import.png`, timeout: 120_000 });
        await page.locator('[data-cad-save]').click();
        const savedSha = await waitFor(page, () => document.querySelector('[data-cad-notice]')?.getAttribute('data-cad-saved') ?? null, (v) => Boolean(v), 60_000);
        const notice = await page.evaluate(() => document.querySelector('[data-cad-notice]')?.textContent ?? '');
        const { data: row } = await service.from('catalog_items').select('meta').eq('id', hingeRow.id).single();
        const twin = row?.meta?.twin;
        const folder = `${org.id}/hardware-cad/${hingeRow.id}`;
        const { data: files } = await service.storage.from('catalog').list(folder);
        check(
          'TWIN.B запись: в `meta.twin` — статус «визуальная реконструкция», источник собственный, монтажная точка 0,0,0 (ось чашки), чашка едет, плечо стоит; `meta.hardware` цел; файл GLB — в Storage папки позиции с тем же sha256',
          Boolean(savedSha) &&
            twin?.status === 'VISUAL_RECONSTRUCTION' &&
            twin?.source?.kind === 'drawing_reconstruction' &&
            anchorMm === '0.0,0.0,0.0' &&
            twin?.parts?.some((p) => p.node === 'cup' && p.role === 'moving') &&
            twin?.parts?.some((p) => p.node === 'arm' && p.role === 'fixed') &&
            Boolean(row?.meta?.hardware?.manufacturer) &&
            (files ?? []).some((f) => f.name === `${savedSha}.glb`),
          `${notice.slice(0, 120)} · файлов ${(files ?? []).length}`,
        );

        /* Сцена: петля на дверце 450 — модель реестра на оси чашки. */
        const { data: proj } = await service.from('projects').select('millwork').eq('id', ids.kitchen).single();
        const millwork = proj.millwork;
        const door = millwork.runs.optimal.modules.find((m) => m.id === 'base-1200@w1');
        door.fittings = [{ slot: 'hinge', itemId: hingeRow.id }];
        await service.from('projects').update({ millwork }).eq('id', ids.kitchen);
        await openStudio(page, ids.kitchen);
        await open3d(page, 'TWIN');
        const closed = await waitFor(page, () => (window.__mwTwins ? window.__mwTwins() : null), (v) => Boolean(v) && (v['twin:fixed'] ?? 0) >= 2 && (v['twin:moving'] ?? 0) >= 2, 60_000);
        const opened = await openAll(page, 'base-1200@w1:door:0', (v) => Math.abs(v.rotationDeg[1]) >= 80);
        await closeUp(page, 'base-1200@w1:door:0', [-0.35, 0.25, 0.45]);
        await page.screenshot({ path: `${OUT}/twin-2-hinge-in-scene.png`, timeout: 120_000 });
        const anomalies = await page.evaluate(() => (window.__mwSceneAnomalies ?? []).length);
        check(
          'TWIN.C сцена: у двух петель дверцы — модель реестра (плечи на корпусе, чашки на полотне); дверца открыта — чашки модели едут с ней; аномалий сцены нет',
          Boolean(closed) && (opened?.names['twin:moving'] ?? 0) >= 2 && Math.abs(opened?.rotationDeg[1] ?? 0) >= 80 && anomalies === 0,
          `закрыто ${JSON.stringify(closed)} · открыто ${JSON.stringify(opened?.names)} · аномалий ${anomalies}`,
        );
        await closeAll(page);
      } finally {
        /* Снять модель тем же маршрутом, что экран; файлы — проверка чтением. */
        const res = await page.request.post(`${BASE}/api/catalog/hardware/twin`, { data: { action: 'remove', itemId: hingeRow.id } });
        const { data: left } = await service.storage.from('catalog').list(`${org.id}/hardware-cad/${hingeRow.id}`);
        const { data: after } = await service.from('catalog_items').select('meta').eq('id', hingeRow.id).single();
        check('TWIN.D «Снять модель»: файлов в Storage 0, `meta.twin` снят, позиция каталога на месте', res.ok() && (left ?? []).length === 0 && !after?.meta?.twin && Boolean(after?.meta?.hardware), `ответ ${res.status()} · файлов ${(left ?? []).length}`);
      }
      check('TWIN ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
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
      /*
       * ПАНТОГРАФ — МЕХАНИЗМ (решение владельца 2026-11-01, п. 3): корпуса на боковинах, тяги, штанга, ручка.
       * Поза читается зондом `__mwPantographs` из мировых матриц сцены: концы тяг — на торцах штанги, тяги
       * обеих сторон — один угол; 45° — `__mwSetOpenDegree`; остановка на ходу — нажатием на штангу.
       */
      const PG = 'tall-900@w1:b1:pantograph';
      const pgState = () => page.evaluate((id) => (window.__mwPantographs ? window.__mwPantographs().find((p) => p.id === id) ?? null : null), PG);
      const pgWait = (test, ms = 60_000) => waitFor(page, (id) => (window.__mwPantographs ? window.__mwPantographs().find((p) => p.id === id) ?? null : null), (v) => Boolean(v) && test(v), ms, PG);
      /* Шарниры не расходятся: конец тяги каждой стороны — на торце штанги (по высоте и глубине), мм. */
      const joins = (st) => st.sides.map((sd, i) => Math.hypot(sd.tip[1] - st.railEnds[i][1], sd.tip[2] - st.railEnds[i][2]) * 1000);
      const sync = (st) => Math.abs(st.sides[0].rotationX - st.sides[1].rotationX);
      const pg0 = await pgWait((v) => v.s === 0);
      const preset = page.locator('[data-scene-preset-select]');
      const usualPreset = (await preset.count()) > 0 ? await preset.first().inputValue() : null;
      const pgShot = async (name, offset) => {
        const st = await pgState();
        const c = st.railEnds[0].map((v, k) => (v + st.railEnds[1][k]) / 2);
        const target = [c[0], (c[1] + st.sides[0].pivot[1]) / 2, (c[2] + st.sides[0].pivot[2]) / 2];
        await page.evaluate((pose) => (window.__mwCadCamera ? window.__mwCadCamera(pose) : null), { position: [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]], target });
        await sleep(2500);
        await page.screenshot({ path: `${OUT}/${name}`, timeout: 120_000 });
      };
      await pgShot('wardrobe-pg-0-closed-cabinet.png', [-1.1, 0.4, 2.0]);
      if (usualPreset !== null) {
        await preset.first().selectOption('hardware');
        await sleep(1500);
        await pgShot('wardrobe-pg-1-raised-hardware.png', [-0.9, 0.2, 1.4]);
        await preset.first().selectOption(usualPreset);
        await sleep(1000);
      }
      await page.evaluate((id) => window.__mwSetOpenDegree?.(id, 45), PG);
      await page.locator('[data-open-all]').first().click();
      const pgMid = await pgWait((v) => Math.abs(v.s - 0.5) < 0.005);
      await quiet(page);
      const pulled = await moving(page, 'tall-900@w1:b2:pullout');
      await pgShot('wardrobe-pg-2-45deg.png', [-1.0, 0.25, 1.9]);
      await page.evaluate((id) => window.__mwSetOpenDegree?.(id, null), PG);
      const pgLow = await pgWait((v) => v.s === 1);
      await quiet(page);
      await pgShot('wardrobe-pg-3-lowered.png', [-1.0, 0.25, 1.9]);
      await pgShot('wardrobe-pg-4-lowered-closeup.png', [-0.55, 0.15, 0.75]);
      const drop = (pg0.railEnds[0][1] - pgLow.railEnds[0][1]) * 1000;
      const ahead = (pgLow.railEnds[0][2] - pg0.railEnds[0][2]) * 1000;
      /* Остановка на ходу: камера на механизм, закрыть — и нажать на штангу, пока она поднимается. */
      await pgShot('wardrobe-pg-5-before-stop.png', [-1.0, 0.25, 1.9]);
      await page.locator('[data-close-all]').first().click();
      await pgWait((v) => v.s < 0.75 && v.s > 0.3, 20_000);
      const pt = await page.evaluate((id) => (window.__mwCadPartPoint ? window.__mwCadPartPoint(id) : null), PG);
      if (pt) await page.mouse.click(pt.x, pt.y);
      await quiet(page);
      await sleep(800);
      const pgStop = await pgState();
      await closeAll(page);
      const kupe = await installVia(page, 'WARDROBE', 'sliding', 'MFR-HAFELE-400.51.121', '400.51.121');
      check('WARDROBE.C/D/I пантограф b1, выдвижная штанга b2 и система купе поставлены — не отказ', pg.installed && po.installed && kupe.installed && [pg, po, kupe].every((x) => x.cardVerdict !== 'refused'), [pg, po, kupe].map((x) => x.cardVerdict).join(', '));
      const leaf = await openAll(page, 'tall-0@w1:kupe:0', (v) => v.shift[0] >= 949);
      check(
        'WARDROBE.C пантограф Häfele 805.20.625 — механизм: на 0, 45° и 90° концы тяг на торцах штанги (± 0,5 мм), тяги левой и правой стороны — один угол; штанга опустилась на 800 мм (30 → 830 под крышей, pdf 125) и вышла вперёд; исполнение «белый» — свои материалы, металл со своей картой окружения',
        Boolean(pg0 && pgMid && pgLow) &&
          [pg0, pgMid, pgLow].every((st) => joins(st).every((d) => d <= 0.5) && sync(st) < 1e-9) &&
          Math.abs(pgMid.armDeg - 45) < 0.5 &&
          Math.abs(pgLow.armDeg - 90) < 0.01 &&
          Math.abs(drop - 800) < 1 &&
          ahead > 600 &&
          pgLow.body === 'white' &&
          pgLow.ownEnv === true &&
          pg0.clash === null,
        `закрыт: стыки ${joins(pg0).map((d) => d.toFixed(2)).join('/')} мм · 45°: угол ${pgMid?.armDeg.toFixed(1)}°, стыки ${joins(pgMid).map((d) => d.toFixed(2)).join('/')} · опущен: угол ${pgLow?.armDeg.toFixed(1)}°, стыки ${joins(pgLow).map((d) => d.toFixed(2)).join('/')} · ход вниз ${drop.toFixed(1)} мм, вперёд ${ahead.toFixed(1)} мм · ${pgLow?.materials?.join(', ')}`,
      );
      check(
        'WARDROBE.C2 нажатие на штангу на ходу останавливает механизм в промежуточном положении (стоит, тяги — один угол, стыки целы)',
        Boolean(pgStop) && pgStop.s > 0.05 && pgStop.s < 0.95 && joins(pgStop).every((d) => d <= 0.5) && sync(pgStop) < 1e-9,
        `точка нажатия ${JSON.stringify(pt)} · встал на ${pgStop ? (pgStop.s * 100).toFixed(0) : '—'}% хода (${pgStop?.armDeg?.toFixed(1)}°)`,
      );
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

      /* ── ПРИСАДКА 3D (§ 11): «Показать в 3D» у дверцы → отверстия плана в сцене ── */
      const planOps = probe.parts.reduce((s, p) => s + p.ops.length, 0);
      const doorOps = door?.ops.length ?? 0;
      must('DRILLING дверца base-1200@w1 в плане присадки', Boolean(door), 'НУЛЕВОЙ СЕЛЕКТОР: дверца door:0 в __mwDrilling');
      await page.locator(`[data-drill-part="${door.partId}"]`).first().click();
      const show = page.locator(`[data-drill-show3d="${door.partId}"]`);
      must('DRILLING кнопка «Показать в 3D» у дверцы', (await show.count()) === 1, `НУЛЕВОЙ СЕЛЕКТОР: [data-drill-show3d="${door.partId}"]`);
      await show.first().click();
      const s3d = await sceneSettled(page);
      must('DRILLING 3D после «Показать в 3D»', s3d.state === 'ready', `${s3d.state} за ${s3d.ms} мс`);
      const drawn = await waitFor(page, () => (window.__mwDrill3d ? window.__mwDrill3d() : null), (v) => Boolean(v) && v.total > 0 && Boolean(v.outline), 60_000);
      const cam = await waitFor(
        page,
        (c) => {
          const pose = window.__mwCadCamera ? window.__mwCadCamera() : null;
          return pose && c ? Math.hypot(pose.target[0] - c[0], pose.target[1] - c[1], pose.target[2] - c[2]) : null;
        },
        (d) => typeof d === 'number' && d < 0.01,
        20_000,
        drawn?.outline ?? null,
      );
      const pose = await page.evaluate(() => (window.__mwCadCamera ? window.__mwCadCamera() : null));
      const summaryText = `${(await page.locator('[data-drill-summary="ready"]').first().textContent().catch(() => '')) ?? ''} | ${(await page.locator('[data-drill-summary="ready"]').first().getAttribute('title').catch(() => '')) ?? ''}`;
      await page.screenshot({ path: `${OUT}/drilling-3-scene-door.png`, timeout: 120_000 });
      check(
        `DRILL.4 «Показать в 3D»: в сцене отверстий ровно столько, сколько операций в плане экрана «Присадка» (${planOps}), скрытых нет; подсвечена дверца (её ${doorOps} — ярко, остальные приглушены), камера смотрит в центр её контура; на кнопке «Присадка · ${planOps}», в подсказке — «Отверстий ${planOps}» и сколько деталей не рассчитано`,
        drawn?.total === planOps && drawn.hidden === 0 && drawn.focus === door.partId && drawn.dimmed === planOps - doorOps && typeof cam === 'number' && cam < 0.01 && summaryText.includes(`Присадка · ${planOps}`) && summaryText.includes(`Отверстий ${planOps}`),
        `в сцене ${drawn?.total} (${JSON.stringify(drawn?.byRole)}) · скрыто ${drawn?.hidden} · приглушено ${drawn?.dimmed} · до цели камеры ${typeof cam === 'number' ? (cam * 1000).toFixed(1) : cam} мм (цель ${pose?.target?.map((v) => v.toFixed(3)).join(', ')}, камера ${pose?.position?.map((v) => v.toFixed(3)).join(', ')}, контур ${drawn?.outline?.map((v) => v.toFixed(3)).join(', ')}) · «${summaryText.slice(0, 80)}»`,
      );
      /* Камера подлетает к детали, а не только целится в неё: расстояние — меньше 1,5 м; поза читается сразу и через 2 с. */
      const near = (pz) => (pz && drawn?.outline ? Math.hypot(pz.position[0] - drawn.outline[0], pz.position[1] - drawn.outline[1], pz.position[2] - drawn.outline[2]) : null);
      const focusAgain = await page.evaluate((id) => (window.__mwFocusPart ? window.__mwFocusPart(`drill:${id}`) : null), door.partId);
      const poseNow = await page.evaluate(() => (window.__mwCadCamera ? window.__mwCadCamera() : null));
      await sleep(2000);
      const poseLater = await page.evaluate(() => (window.__mwCadCamera ? window.__mwCadCamera() : null));
      check(
        'DRILL.4в камера у детали: после «Показать в 3D» она не дальше 1,5 м от контура дверцы и остаётся там (через 2 с)',
        near(pose) !== null && near(pose) < 1.5 && near(poseLater) < 1.5,
        `после кнопки ${near(pose)?.toFixed(2)} м (предел приближения ${pose?.minDistance?.toFixed(2)} м) · повторный фокус ${focusAgain} → сразу ${near(poseNow)?.toFixed(2)} м, через 2 с ${near(poseLater)?.toFixed(2)} м`,
      );
      check(
        'DRILL.4б крепления: конфирмат на каждое сквозное отверстие боковины — столько стержней, сколько пар «пласть + торец» в плане; подсвечена дверца — сквозь материал ни одного (дверцу конфирматы не стягивают)',
        typeof drawn?.confirmats === 'number' && drawn.confirmats > 0 && drawn.confirmats === (drawn.byRole.confirmat_face ?? -1) && drawn.confirmatsXray === 0,
        `конфирматов ${drawn?.confirmats} · сквозных ${drawn?.byRole?.confirmat_face} · сквозь материал ${drawn?.confirmatsXray}`,
      );
      /* Створка открыта — чашки едут с ней: та же поза, что у полотна сцены. */
      const leaf = 'base-1200@w1:door:0';
      const opened = await openAll(page, leaf, (v) => Math.abs(v.rotationDeg[1]) >= 80);
      const rode = await waitFor(page, (key) => (window.__mwDrill3d ? window.__mwDrill3d().carried[key] ?? null : null), (v) => Boolean(v) && v.turnedDeg > 80, 20_000, leaf);
      await page.screenshot({ path: `${OUT}/drilling-4-scene-door-open.png`, timeout: 120_000 });
      check(
        'DRILL.5 отверстия дверцы едут с ней: открыта — пачка дверцы повёрнута на угол полотна (± 0,5°) и видна; закрыта — на месте (сдвиг 0)',
        Boolean(rode) && rode.visible && Math.abs(rode.turnedDeg - Math.abs(opened?.rotationDeg[1] ?? 0)) < 0.5,
        `полотно ${opened?.rotationDeg[1]?.toFixed?.(1)}° · пачка ${rode?.turnedDeg?.toFixed(1)}°, видна ${rode?.visible}`,
      );
      await closeAll(page);
      const back = await waitFor(page, (key) => (window.__mwDrill3d ? window.__mwDrill3d().carried[key] ?? null : null), (v) => Boolean(v) && v.turnedDeg < 0.05 && v.movedM < 1e-4, 20_000, leaf);
      check('DRILL.5б дверца закрыта — её отверстия на закрытом месте', Boolean(back) && back.visible, JSON.stringify(back));
      /* Подсветили левую боковину того же модуля — её конфирматы видны сквозь материал, столько, сколько сквозных у неё в плане. */
      const sideOwn = (side?.ops ?? []).filter((o) => o.role === 'confirmat_face').length;
      /* «Документы» ещё открыты (вид сменился на 3D, инструмент — нет): нажатие на активный инструмент свернуло бы панель. */
      if (!(await page.locator('[data-studio-doc="drilling"]').first().isVisible().catch(() => false))) {
        must('DRILLING инструмент «Документы» (второй раз)', await tool(page, 'documents'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="documents"]');
      }
      await page.locator('[data-studio-doc="drilling"]').first().click();
      await page.waitForSelector(`[data-drill-part="${side.partId}"]`, { timeout: 60_000 });
      await page.locator(`[data-drill-part="${side.partId}"]`).first().click();
      await page.locator(`[data-drill-show3d="${side.partId}"]`).first().click();
      const sideDrawn = await waitFor(page, () => (window.__mwDrill3d ? window.__mwDrill3d() : null), (v) => Boolean(v) && v.focus === side.partId && v.confirmatsXray > 0, 60_000);
      await sleep(2500);
      const sidePose = await page.evaluate(() => (window.__mwCadCamera ? window.__mwCadCamera() : null));
      const sideNear = sidePose && sideDrawn?.outline ? Math.hypot(sidePose.position[0] - sideDrawn.outline[0], sidePose.position[1] - sideDrawn.outline[1], sidePose.position[2] - sideDrawn.outline[2]) : null;
      await page.screenshot({ path: `${OUT}/drilling-5-scene-side.png`, timeout: 120_000 });
      check(
        `DRILL.5в подсвечена левая боковина base-1200@w1 — сквозь материал её конфирматы: ${sideOwn} (сквозных у неё в плане экрана), остальные с глубиной; камера у боковины (не дальше 1,5 м)`,
        sideDrawn?.focus === side.partId && sideOwn > 0 && sideDrawn.confirmatsXray === sideOwn && sideDrawn.confirmats === drawn?.confirmats && typeof sideNear === 'number' && sideNear < 1.5,
        `подсвечена ${sideDrawn?.focus} · сквозь материал ${sideDrawn?.confirmatsXray} при ${sideOwn} в плане · всего ${sideDrawn?.confirmats} · камера в ${sideNear?.toFixed(2)} м от боковины`,
      );
      /* «Интерьер» — присадки нет вовсе, кнопка недоступна и говорит почему; выключили — вернулась. */
      must('DRILLING инструмент «Освещение»', await tool(page, 'lighting'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="lighting"]');
      await page.locator('[data-light-design]').first().click();
      await waitFor(page, () => (window.__mwLighting ? window.__mwLighting() : null), (v) => v?.design === true && v.warming !== true, 90_000);
      const inDesign = await waitFor(page, () => (window.__mwDrill3d ? window.__mwDrill3d().total : 0), (n) => n === 0, 20_000);
      const toggle = page.locator('[data-drill-toggle]').first();
      const toggleDisabled = await toggle.isDisabled();
      const toggleTitle = (await toggle.getAttribute('title')) ?? '';
      await page.locator('[data-light-design]').first().click();
      await waitFor(page, () => (window.__mwLighting ? window.__mwLighting() : null), (v) => v?.design === false, 60_000);
      const after = await waitFor(page, () => (window.__mwDrill3d ? window.__mwDrill3d().total : 0), (n) => n === planOps, 30_000);
      check(
        'DRILL.6 «Интерьер»: отверстий в сцене 0, кнопка «Присадка» недоступна и называет причину; «Интерьер» выключили — отверстия плана вернулись',
        inDesign === 0 && toggleDisabled && /В «Интерьере» присадки нет/.test(toggleTitle) && after === planOps,
        `в «Интерьере» ${inDesign} · кнопка ${toggleDisabled ? 'недоступна' : 'ДОСТУПНА'} «${toggleTitle.slice(0, 50)}» · после ${after}`,
      );
      await toggle.click();
      const off = await waitFor(page, () => (window.__mwDrill3d ? window.__mwDrill3d().total : 0), (n) => n === 0, 20_000);
      check('DRILL.7 «Присадка» выключена — в сцене отверстий нет', off === 0, `отверстий ${off}`);
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
      if (part === 'open') await partOpen(browser);
      if (part === 'twin') await partTwin(browser);
      if (part === 'tandembox') await partTandembox(browser);
      if (part === 'clip') await partClip(browser);
      if (part === 'aventos') await partAventos(browser);
      if (part === 'real') await partReal(browser);
      if (part === 'import-ui') await partImportUi(browser);
      if (part === 'fronts') await partFronts(browser, false);
      if (part === 'fronts-tablet') await partFronts(browser, true);
      if (part === 'ceiling') await partCeiling(browser, false);
      if (part === 'ceiling-tablet') await partCeiling(browser, true);
      if (part === 'inner') await partInner(browser);
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
