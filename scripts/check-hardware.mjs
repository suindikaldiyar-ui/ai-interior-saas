/**
 * ФУРНИТУРА ПРОИЗВОДИТЕЛЕЙ В БРАУЗЕРЕ (HARDWARE-01) — на настоящей организации.
 *
 * Запуск (после `npm run build`): `node scripts/check-hardware.mjs`
 *   PART=import  — 1440 × 900: /admin/catalog → «Фурнитура производителей» →
 *     «что ляжет» по группам A–I и производителям → «Загрузить» → в базе
 *     столько позиций, сколько в фактах, все с ценой 0 («цена не задана»);
 *     повтор — «Всё уже в каталоге»; своя пачка CSV — строки и отказы словами.
 *   PART=kitchen — 1440 × 900, Studio кухни: петли и планка на дверце 450
 *     (чашки едут с полотном), направляющие KA на трёх ящиках (короб в
 *     деталировке, в карте раскроя и в 3D, присадка на карточке детали),
 *     подъёмник HS на верхнем шкафу (корпуса и рычаги), сушилка в шкафу над
 *     мойкой; сохранить → база → перезагрузить → позиции на местах.
 *   PART=wardrobe — 1440 × 900, Studio шкафа-купе: пантограф в отсеке b1
 *     (едет вниз и вперёд), выдвижная штанга в b2 (вперёд), система купе
 *     ряда (полотна едут вбок).
 *   PART=cargo   — 1440 × 900: карго 200 (фасад выдвигается с корзинами).
 *   PART=corner  — 1440 × 900: угловая кухня — петля на модуле стены Б.
 *   PART=tablet  — 1024 × 768 с касанием: панель «Фурнитура» в экране,
 *     прокрутки по ширине нет, список виртуальный, установка касанием.
 * Каждая часть — своя временная организация, заводится служебным ключом и
 * удаляется; уборка проверяется чтением. Снимки: .capture-check/hardware.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_HW ?? 3291);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/hardware';
const PARTS = (process.env.PART ?? 'import,kitchen,wardrobe,cargo,corner,tablet').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['import', 'kitchen', 'wardrobe', 'cargo', 'corner', 'tablet'];
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
  await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
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
  must(`${label}: панель «Фурнитура» видит каталог организации`, items >= FACT_COUNT, `позиций ${items} при ${FACT_COUNT} в фактах`);
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
  await waitFor(page, (key) => (window.__mwMoving ? window.__mwMoving(key) : null), (v) => Boolean(v) && test(v), ms, id);
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
    if (importHardware) {
      const res = await page.request.post(`${BASE}/api/catalog/hardware`, { data: { orgId: org.id, confirm: true }, timeout: 120_000 });
      const body = await res.json().catch(() => ({}));
      if (!res.ok() || body.added !== FACT_COUNT) throw new Error(`фурнитура не загрузилась: ${res.status()} · ${JSON.stringify(body).slice(0, 200)}`);
    }
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

async function partKitchen(browser) {
  console.log('\n── KITCHEN (1440 × 900): петли · ящики KA → короб → деталировка → карта раскроя · подъёмник · сушилка · сохранить → перезагрузить');
  const fx = fixture('kitchen');
  await withOrg(
    'KITCHEN',
    browser,
    async ({ service, page, errors, consoleErrors, ids }) => {
      await openStudio(page, ids.kitchen);
      await open3d(page, 'KITCHEN');
      await saved(page);
      const metal0 = await settledMetal(page);
      must('KITCHEN металл читается со сцены', typeof metal0 === 'number' && metal0 > 0, `__mwCadMetal: ${metal0}`);

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
      check('KITCHEN.A2 дверца открыта: чашки петель (2) едут с полотном — нарисованы в группе створки', Boolean(door) && door.names['rider:hinge'] === 2, JSON.stringify(door));
      await closeAll(page);

      /* B. Три ящика base-3300 на KA 4532 NL 500. */
      await hardwareFor(page, 'KITCHEN', 'base-3300@w1');
      const slide = await installVia(page, 'KITCHEN', 'slide', 'MFR-HETTICH-9114276', '9114276');
      check('KITCHEN.B направляющая KA 4532 NL 500 на трёх ящиках поставлена — не отказ', slide.installed && slide.cardVerdict !== 'refused', `${slide.cardVerdict}`);
      const drawer = await openAll(page, 'base-3300@w1:drawer:0', (v) => v.shift[2] >= 299);
      await closeUp(page, 'base-3300@w1:drawer:0', [-0.7, 0.8, 0.9]);
      await page.screenshot({ path: `${OUT}/kitchen-2-drawer-runners.png`, timeout: 120_000 });
      check(
        'KITCHEN.B2 ящик выехал на 300 мм с деталями короба раскроя и ходовой половиной направляющей',
        Boolean(drawer) && drawer.shift[2] === 300 && (drawer.names['panel:Боковина ящика'] ?? 0) === 2 && (drawer.names['mech:runner'] ?? 0) === 2,
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

      /* E. Подъёмник HS top на верхнем шкафу. */
      await openStudio(page, ids.kitchen);
      await open3d(page, 'KITCHEN');
      /* Металл до подъёмника — когда каталог дочитан: иначе в разницу войдут направляющие ящиков. */
      await hardwareFor(page, 'KITCHEN', 'upper-1200@w1');
      const metal1 = await settledMetal(page);
      const lift = await installVia(page, 'KITCHEN', 'lift', 'MFR-BLUM-22S2800', '22S2800');
      const metal2 = await waitFor(page, () => (window.__mwCadMetal ? window.__mwCadMetal() : null), (n) => n === metal1 + 4, 30_000);
      check('KITCHEN.E подъёмник HS top поставлен: в сцене +4 металлических узла (2 корпуса у боковин, 2 рычага)', lift.installed && metal2 === metal1 + 4, `металл ${metal1} → ${metal2}`);
      const up = await openAll(page, 'upper-1200@w1:door:0', (v) => Math.abs(v.rotationDeg[0]) >= 60);
      await closeUp(page, 'upper-1200@w1:door:0', [-0.6, -0.3, 1.2]);
      await page.screenshot({ path: `${OUT}/kitchen-4-lift.png`, timeout: 120_000 });
      check('KITCHEN.E2 фасад поднят: рычаги (2) едут с ним', Boolean(up) && up.names['rider:lift'] === 2, JSON.stringify(up));
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
      const metalClosed = await settledMetal(page);

      /* J. Сохранить → база → перезагрузить. */
      await saved(page);
      const row = (await service.from('projects').select('millwork').eq('id', ids.kitchen).single()).data;
      const all = [...(row?.millwork?.runs?.optimal?.modules ?? []), ...(row?.millwork?.runs?.optimal?.upperSegments ?? []).flatMap((s) => s.modules)];
      const stored = all.flatMap((m) => (m.fittings ?? []).map((f) => `${m.id}:${f.slot}`)).sort();
      const want = ['base-1200@w1:hinge', 'base-1200@w1:hinge_plate', 'base-3300@w1:slide', 'upper-1200@w1:lift', 'upper-1650@w1:dryer'].sort();
      check('KITCHEN.J в базе у модулей позиции на местах: петля, планка, направляющая, подъёмник, сушилка', JSON.stringify(stored) === JSON.stringify(want), stored.join(', ') || 'НИЧЕГО');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
      await sleep(1500);
      await open3d(page, 'KITCHEN');
      await hardwareFor(page, 'KITCHEN', 'base-1200@w1');
      const metal5 = await settledMetal(page);
      const afterReload = await page.evaluate(() => document.querySelector('[data-hw-slot="hinge"]')?.getAttribute('data-hw-installed') ?? null);
      check('KITCHEN.J2 после перезагрузки: петля на месте, механизмов в сцене столько же, сколько до неё (всё закрыто)', afterReload === 'MFR-BLUM-71B3550' && metal5 === metalClosed, `петля ${afterReload} · металл ${metalClosed} → ${metal5}`);
      check('KITCHEN ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
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
      if (part === 'kitchen') await partKitchen(browser);
      if (part === 'wardrobe') await partWardrobe(browser);
      if (part === 'cargo') await partCargo(browser);
      if (part === 'corner') await partCorner(browser);
      if (part === 'tablet') await partTablet(browser);
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
