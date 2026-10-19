/**
 * ПРИЁМКА P3D-TEX В БРАУЗЕРЕ: образцы декоров EGGER и GRANDEX на карточке и в 3D.
 *
 * Запуск (после `npm run build`):  FIXTURE=<ряд спальни json> node scripts/check-reference-textures.mjs
 * По частям — PART=egger|grandex|admin. Снимки — в .capture-check/reference-textures/<SHOTS>/
 * (SHOTS=before|after, по умолчанию after). Каждая часть — своя временная
 * организация; уборка проверяется чтением.
 *
 * «ДО» снимается той же приёмкой на сборке ДО правки: SERVER_DIR=<рабочая копия
 * прежнего коммита со своей сборкой>. Там проверки обязаны падать — это и есть
 * доказательство, что они меряют дефект, а не своё присутствие.
 *
 *   egger   Каталог → EGGER на фасады → в 3D на фасадах ДЕМОНСТРАЦИОННЫЙ
 *           рисунок дерева в цвет декора (P3D-LDSP: образец брошюры на плиту не
 *           кладётся — права не подтверждены), карточка с этим рисунком, без
 *           картинки брошюры и со словами «не текстура» → другой декор на
 *           фасады → корпус, полки, перегородки и антресоль — каждый своим:
 *           дерево рисунком своего цвета, однотон ровным цветом → сохранить →
 *           перезагрузить → те же карты; смета — строки полок и перегородок.
 *   grandex Кухня: GRANDEX на столешницу → карта камня на плитах → сохранить →
 *           перезагрузить → та же карта.
 *   admin   /admin/catalog: у позиции EGGER в ячейке картинка образца, а не рамка.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_TEX ?? 3277);
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS ?? 'after';
const OUT = `.capture-check/reference-textures/${SHOTS}`;
const SERVER_DIR = resolve(process.env.SERVER_DIR ?? '.');
const PARTS = (process.env.PART ?? 'egger,grandex,admin').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['egger', 'grandex', 'admin'];
const REVIEW = ['egger-ldsp', 'egger-perfectsense', 'egger-worktops', 'grandex-acrylic'];
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

/**
 * Что ОБЯЗАНО лечь — из таблицы образцов в репозитории (а не из ответа экрана).
 * Ключ — `meta.provenance.preview`; размер в мм — принятый.
 */
function referenceTable() {
  const text = readFileSync('lib/millwork/referenceTextures.generated.ts', 'utf8');
  const out = new Map();
  for (const m of text.matchAll(/^ {2}"([^"]+)": (\{.*\}),$/gm)) out.set(m[1], JSON.parse(m[2]));
  return out;
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
  measuredBy: 'P3D-TEX',
  measuredAt: '2026-10-18',
});
const measurement = (stamp) => ({
  id: `m-${stamp}`,
  ceilingHeightMm: CEILING,
  walls: WALLS.map((l, i) => ({ id: `w${i + 1}`, lengthMm: l, angleDeg: 90, openings: [] })),
  comms: [],
  photos: [],
  measuredBy: 'P3D-TEX',
  measuredAt: '2026-10-18',
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
async function selectModule(page, id) {
  await tool(page, 'select');
  const b = page.locator(`[data-object-module="${id}"]`);
  if ((await b.count()) === 0) return false;
  await b.first().click();
  await sleep(500);
  await tool(page, 'furniture');
  return true;
}

/**
 * ПОВЕРХНОСТИ СЦЕНЫ С КАРТОЙ — то, что висит в 3D.
 * В сборке без `__mwCadSurfaces` (до правки) сцена текстур не знала вовсе:
 * отвечаем тем, что можно прочитать там, — фасады (`__mwCadFronts`).
 */
const surfaces = (page) =>
  page.evaluate(() => {
    if (window.__mwCadSurfaces) return { hook: 'surfaces', list: window.__mwCadSurfaces() };
    if (window.__mwCadFronts) {
      return {
        hook: 'fronts-only',
        list: window.__mwCadFronts().map((f) => ({ name: `front:${f.key}`, count: f.count, map: f.map ? 'есть, адрес не виден' : null, wrap: null, realSizeM: f.realSizeM })),
      };
    }
    return { hook: 'none', list: [] };
  });
const mapsOf = (read, prefix) => read.list.filter((s) => s.name.startsWith(prefix) && s.count > 0);
/** Демонстрационный рисунок дерева (P3D-LDSP) в цвет образца декора: адрес рисунка несёт его цвет. */
const demoIn = (map, ref) => typeof map === 'string' && map.startsWith('procedural:wood?') && map.includes(`hex=${ref.hex.slice(1)}`);
/** Плитка демонстрационного рисунка — 800 × 1600 мм, повтор прямой. */
const demoSize = (real) => Array.isArray(real) && Math.abs(real[0] - 0.8) < 1e-6 && Math.abs(real[1] - 1.6) < 1e-6;
const keyIn = (map, key) => Boolean(map) && decodeURIComponent(map).includes(`file=${key}`);
const sizeFits = (real, ref) => Array.isArray(real) && Math.abs(real[0] - ref.mm[0] / 1000) < 1e-6 && Math.abs(real[1] - ref.mm[1] / 1000) < 1e-6;
const words = (read, prefix) =>
  mapsOf(read, prefix)
    .map((s) => `${s.name.slice(0, 40)} → ${s.map ? decodeURIComponent(s.map).split('file=')[1] ?? s.map : 'ЦВЕТ БЕЗ КАРТЫ'}${s.wrap ? ` (${s.wrap})` : ''}`)
    .slice(0, 4)
    .join(' | ') || `НЕТ МЕШЕЙ «${prefix}» (${read.hook})`;

/** Позиция панели по артикулу: цель, вкладка, производитель, поиск, нажатие. */
async function applyItem(page, target, brand, article) {
  const tab = brand === 'GRANDEX' || /^EGGER-WT-/.test(article) ? 'countertop' : 'ldsp';
  /* Повторное нажатие на открытый инструмент его закрывает — жмём, только если панели нет. */
  const open = await page.locator('[data-materials-panel]').first().isVisible().catch(() => false);
  if (!open && !(await tool(page, 'materials'))) return 'НУЛЕВОЙ СЕЛЕКТОР: инструмента «Материалы» нет';
  await page.waitForSelector('[data-materials-panel][data-loaded="1"]', { timeout: 30_000 }).catch(() => undefined);
  const targetButton = page.locator(`[data-material-target="${target}"]`);
  /* Цели рисуются, когда приехало описание коллекций (запросом) — ждём их, а не первый кадр. */
  await page.locator('[data-material-target]').first().waitFor({ state: 'attached', timeout: 30_000 }).catch(() => undefined);
  if ((await targetButton.count()) === 0) {
    await shot(page, `zz-no-target-${target}`);
    return `НУЛЕВОЙ СЕЛЕКТОР: цели «${target}» в панели нет`;
  }
  await targetButton.first().click();
  await page.locator(`[data-material-tab="${tab}"]`).first().click().catch(() => undefined);
  await page.locator(`[data-material-brand="${brand}"]`).first().click().catch(() => undefined);
  await page.locator('[data-material-search]').first().fill(article);
  await sleep(600);
  const row = page.locator(`[data-material-item="${article}"]`);
  /* Каталог организации приезжает после экрана (`CatalogLoader`) — ждём строку, а не первый кадр. */
  await row.first().waitFor({ state: 'attached', timeout: 20_000 }).catch(() => undefined);
  if ((await row.count()) === 0) {
    await shot(page, `zz-missing-${target}-${article}`);
    const seen = await page.evaluate(() => ({
      rows: [...document.querySelectorAll('[data-material-item]')].slice(0, 5).map((n) => n.getAttribute('data-material-item')),
      empty: document.querySelector('[data-material-empty]')?.textContent ?? null,
      tabs: [...document.querySelectorAll('[data-material-tab]')].map((n) => `${n.getAttribute('data-material-tab')}${n.getAttribute('aria-pressed') === 'true' ? '*' : ''}`).join(','),
      search: document.querySelector('[data-material-search]')?.value ?? null,
    }));
    return `НУЛЕВОЙ СЕЛЕКТОР: позиции ${article} в списке нет (в списке: ${seen.rows.join(', ') || 'пусто'} · «${seen.empty ?? '—'}» · вкладки ${seen.tabs} · поиск «${seen.search}»)`;
  }
  await row.first().click();
  await sleep(1500);
  const notice = await page.locator('[data-material-notice]').first().textContent().catch(() => null);
  return notice && /не идёт|нет|не найден/.test(notice) ? `отказ: ${notice}` : null;
}

/** Что показывает карточка позиции: картинка образца, производитель, статус. */
const cardOf = (page) =>
  page.evaluate(() => {
    const card = document.querySelector('[data-material-card]');
    const img = card?.querySelector('[data-review-image]');
    return card
      ? {
          image: img ? { loaded: img.complete && img.naturalWidth > 0, w: img.naturalWidth, h: img.naturalHeight, src: img.getAttribute('src') } : null,
          maker: card.querySelector('[data-material-maker]')?.textContent ?? null,
          status: card.querySelector('[data-review-status]')?.textContent ?? '',
          origin: card.querySelector('[data-reference-origin]')?.textContent ?? null,
          colorOrigin: card.querySelector('[data-color-origin]')?.textContent ?? null,
          demo: card.querySelector('[data-demo-wood]')?.getAttribute('data-demo-wood') ?? null,
          text: card.textContent ?? '',
        }
      : null;
  });

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
    /* Каталоги поставщиков — тем же маршрутом, что кнопка «Загрузить» на панели. */
    const imported = await page.request.post(`${BASE}/api/catalog/materials`, { data: { orgId: org.id, collections: REVIEW, confirm: true } });
    if (!imported.ok()) throw new Error(`EGGER/GRANDEX не загружены: ${imported.status()} ${await imported.text()}`);
    return { org, page, context, errors };
  };
  const addProject = async (orgId, fields) => {
    const { data, error } = await service.from('projects').insert({ org_id: orgId, client_name: 'Проверка', status: 'in_progress', ...fields }).select('id').single();
    if (error) throw new Error(`insert project: ${error.message}`);
    made.projects.push(data.id);
    return data.id;
  };
  const itemId = async (orgId, article) => (await service.from('catalog_items').select('id').eq('org_id', orgId).eq('article', article).single()).data?.id ?? null;
  try {
    await body({ service, makeUser, addProject, itemId, stamp });
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

/* ═════════════════════════  EGGER  ═════════════════════════ */

const FRONT_1 = { article: 'EGGER-H1113-ST10', key: 'EGGER/H1113_ST10_p81.webp' };
const FRONT_2 = { article: 'EGGER-H1180-ST37', key: 'EGGER/H1180_ST37_p80.webp' };
const BODY = { article: 'EGGER-W1000-ST9', key: 'EGGER/W1000_ST9_p78.webp' };
const SHELVES = { article: 'EGGER-H1145-ST10', key: 'EGGER/H1145_ST10_p81.webp' };
const PARTS_DECOR = { article: 'EGGER-U999-ST7', key: 'EGGER/U999_ST7_p79.webp' };
const ANTRESOL = { article: 'EGGER-H3309-ST28', key: 'EGGER/H3309_ST28_p80.webp' };

async function partEgger(browser) {
  console.log('\n── EGGER: каталог → фасады → 3D → другой фасад → корпус, полки, перегородки, антресоль → сохранить → перезагрузить');
  const fx = fixture();
  const table = referenceTable();
  await withOrg('EGGER', browser, async ({ service, makeUser, addProject, itemId, stamp }) => {
    const { org, page, errors } = await makeUser('tex-e');
    /*
     * Ключ образца у позиции — тот, что лежит в её строке базы: так экран его и
     * находит. Если у импортированной позиции preview другой (слитые повторы),
     * сверяемся с её строкой, а не с выдуманным ключом.
     */
    const keyOf = async (article) => {
      const { data } = await service.from('catalog_items').select('meta').eq('org_id', org.id).eq('article', article).single();
      return data?.meta?.provenance?.preview ?? null;
    };
    for (const pick of [FRONT_1, FRONT_2, BODY, SHELVES, PARTS_DECOR, ANTRESOL]) {
      const key = await keyOf(pick.article);
      must(`EGGER позиция ${pick.article} загружена, у неё образец в таблице`, Boolean(key && table.get(key)), `preview ${key ?? 'НЕТ'} · в таблице ${key && table.get(key) ? 'есть' : 'НЕТ'}`);
      pick.key = key;
    }
    const id = await addProject(org.id, {
      address: 'Проверка P3D-TEX спальня',
      zone: 'Спальня',
      measurements: measurement(stamp),
      millwork: { survey: survey(), requirements: fx.requirements, runs: { optimal: fx.run }, selectedVariant: 'optimal' },
    });
    await openStudio(page, id);
    const s0 = await open3d(page);
    must('EGGER 3D готова', s0.state === 'ready', `${s0.state} за ${s0.ms} мс`);
    await saved(page);
    await preset(page, 'design');
    await shot(page, '01-bedroom-3d-default');

    /* 1. Каталог → EGGER на фасады. */
    const r1 = await applyItem(page, 'fronts', 'EGGER', FRONT_1.article);
    must(`EGGER ${FRONT_1.article} лёг на фасады`, r1 === null, r1 ?? '');
    await waitFor(page, () => document.querySelector('[data-material-card] [data-demo-wood]')?.getAttribute('data-demo-wood') ?? null, (v) => v === 'ready' || v === 'failed', 20_000);
    const card = await cardOf(page);
    const listThumb = await page.evaluate((article) => {
      const row = document.querySelector(`[data-material-item="${article}"]`);
      const swatch = row?.querySelector('[data-demo-wood]');
      return {
        demo: row?.getAttribute('data-demo') ?? null,
        swatch: swatch?.getAttribute('data-demo-wood') ?? null,
        background: swatch ? getComputedStyle(swatch).backgroundImage : null,
        reference: row?.getAttribute('data-reference') ?? null,
      };
    }, FRONT_1.article);
    await page.locator('[data-material-card]').first().scrollIntoViewIfNeeded().catch(() => undefined);
    await shot(page, '02-egger-card');
    /*
     * P3D-LDSP: было «картинка образца брошюры загрузилась». Права на
     * изображения EGGER не подтверждены — у плиты образец брошюры не
     * показывается нигде; карточка несёт демонстрационный рисунок в цвет
     * декора и прямо говорит, что это не текстура EGGER. Откуда цвет —
     * названо (страница и подпись брошюры).
     */
    check(
      'TEX-E.1 карточка: образец — демонстрационный рисунок дерева (посчитан), картинки брошюры нет; производитель EGGER; «не текстура» и откуда цвет названы',
      card?.demo === 'ready' &&
        !card?.image &&
        card?.maker === 'EGGER' &&
        /демонстрационн/.test(card?.status ?? '') &&
        /не текстура/.test(card?.status ?? '') &&
        /стр\. \d+/.test(card?.colorOrigin ?? ''),
      card ? `рисунок ${card.demo ?? 'НЕТ'} · брошюра ${card.image ? 'ПОКАЗАНА' : 'нет'} · производитель ${card.maker ?? 'НЕ НАЗВАН'} · цвет: ${card.colorOrigin ?? 'НЕ НАЗВАН'} · «${card.status.slice(0, 120)}»` : 'НУЛЕВОЙ СЕЛЕКТОР: карточки нет',
    );
    check(
      'TEX-E.2 строка списка: значок — тот же демонстрационный рисунок (картинка посчитана), брошюры в строке нет',
      listThumb.demo === '1' && listThumb.swatch === 'ready' && /url\(/.test(listThumb.background ?? '') && listThumb.reference === '',
      `рисунок ${listThumb.demo}/${listThumb.swatch} · ${(listThumb.background ?? 'НЕТ').slice(0, 60)} · брошюра «${listThumb.reference ?? '—'}»`,
    );

    await tool(page, 'furniture');
    await view(page, '3d');
    await sceneSettled(page);
    await preset(page, 'design');
    await sleep(1500);
    const ref1 = table.get(FRONT_1.key);
    const fronts1 = await waitFor(page, () => (window.__mwCadSurfaces ? window.__mwCadSurfaces() : null), (v) => Array.isArray(v) && v.some((s) => s.name.startsWith('front:') && typeof s.map === 'string' && s.map.includes(`hex=${ref1.hex.slice(1)}`)), 30_000).then(() => surfaces(page));
    await shot(page, '03-egger-fronts-3d');
    const withMap1 = mapsOf(fronts1, 'front:').filter((s) => demoIn(s.map, ref1));
    check(
      `TEX-E.3 3D: фасады ${FRONT_1.article} несут демонстрационный рисунок в цвет декора (${ref1.hex}), плитка 800 × 1600 мм, прямой повтор; образца брошюры на деталях нет`,
      withMap1.length > 0 &&
        withMap1.every((s) => s.wrap === 'repeat' && demoSize(s.realSizeM)) &&
        !mapsOf(fronts1, 'front:').some((s) => typeof s.map === 'string' && s.map.includes('/preview?')),
      words(fronts1, 'front:'),
    );

    /* 2. Изменение фасада. */
    const r2 = await applyItem(page, 'fronts', 'EGGER', FRONT_2.article);
    must(`EGGER ${FRONT_2.article} лёг на фасады`, r2 === null, r2 ?? '');
    await tool(page, 'furniture');
    await view(page, '3d');
    await sceneSettled(page);
    await sleep(1500);
    const ref2 = table.get(FRONT_2.key);
    const fronts2 = await waitFor(page, () => (window.__mwCadSurfaces ? window.__mwCadSurfaces() : null), (v) => Array.isArray(v) && v.some((s) => s.name.startsWith('front:') && typeof s.map === 'string' && s.map.includes(`hex=${ref2.hex.slice(1)}`)), 30_000).then(() => surfaces(page));
    await shot(page, '04-egger-fronts-changed-3d');
    const withMap2 = mapsOf(fronts2, 'front:').filter((s) => demoIn(s.map, ref2));
    check(
      `TEX-E.4 смена фасада: в 3D теперь рисунок в цвет ${FRONT_2.article} (${ref2.hex}), рисунка ${FRONT_1.article} на фасадах нет`,
      withMap2.length > 0 && !mapsOf(fronts2, 'front:').some((s) => demoIn(s.map, ref1)) && withMap2.every((s) => demoSize(s.realSizeM)),
      words(fronts2, 'front:'),
    );

    /* 3. Корпус, полки, перегородки — независимо. */
    for (const [target, pick] of [['carcass', BODY], ['shelves', SHELVES], ['partitions', PARTS_DECOR]]) {
      const said = await applyItem(page, target, 'EGGER', pick.article);
      check(`TEX-E.5 цель «${target}»: ${pick.article} лёг`, said === null, said ?? '');
    }
    const bodyId = await itemId(org.id, BODY.article);
    const shelvesId = await itemId(org.id, SHELVES.article);
    const partsId = await itemId(org.id, PARTS_DECOR.article);
    await tool(page, 'furniture');
    await view(page, '3d');
    await sceneSettled(page);
    /* Корпус виден в «Дизайне», полки и перегородки — в «Наполнении» (там корпус снят слоем). */
    await preset(page, 'design');
    await sleep(1200);
    const outside = await surfaces(page);
    await preset(page, 'fill');
    await sleep(1500);
    const inside = await surfaces(page);
    await shot(page, '05-carcass-shelves-partitions-3d');
    const meshOf = (read, prefix, id) => read.list.filter((s) => s.name === `${prefix}carcass/${id}` && s.count > 0);
    const shelfMesh = meshOf(inside, 'inner:', shelvesId);
    const partMesh = meshOf(inside, 'inner:', partsId);
    const bodyMesh = meshOf(outside, 'carcass:', bodyId);
    const shelvesRef = table.get(SHELVES.key);
    check(
      'TEX-E.6 3D: корпус, полки и перегородки — каждый своей пачкой и своим: корпус W1000 и перегородки U999 (однотон) — ровный цвет без картинки, полки H1145 (дерево) — рисунок в свой цвет',
      bodyMesh.length > 0 &&
        shelfMesh.length > 0 &&
        partMesh.length > 0 &&
        bodyMesh.every((s) => s.map === null) &&
        shelfMesh.every((s) => demoIn(s.map, shelvesRef)) &&
        partMesh.every((s) => s.map === null),
      `корпус ${bodyMesh.map((s) => s.map ?? 'цвет').join(',') || 'НЕТ'} · полки ${shelfMesh.length ? shelfMesh.map((s) => (demoIn(s.map, shelvesRef) ? 'рисунок H1145' : s.map ?? 'цвет')).join(',') : 'НЕТ'} · перегородки ${partMesh.length ? partMesh.map((s) => s.map ?? 'цвет').join(',') : 'НЕТ'} · ${inside.hook}`,
    );

    /* 4. Антресоль над шкафом и её материал. */
    must('EGGER шкаф tall-0@w1 выбран', await selectModule(page, 'tall-0@w1'), 'НУЛЕВОЙ СЕЛЕКТОР: tall-0@w1');
    const editor = page.locator('[data-overhead-editor]');
    must('EGGER карточка «Над шкафом»', (await editor.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: карточки нет');
    await page.locator('[data-overhead-field="base"]').first().fill('2000');
    await page.locator('[data-overhead-field="height"]').first().fill('400');
    await sleep(500);
    await page.locator('[data-overhead-action="add"]').first().click();
    await sleep(1500);
    const said = await applyItem(page, 'antresol', 'EGGER', ANTRESOL.article);
    check(`TEX-E.7 цель «Антресоль»: ${ANTRESOL.article} лёг`, said === null, said ?? '');
    const antresolId = await itemId(org.id, ANTRESOL.article);
    await tool(page, 'furniture');
    await view(page, '3d');
    await sceneSettled(page);
    await preset(page, 'design');
    await sleep(1500);
    const antresolRef = table.get(ANTRESOL.key);
    const withAntresol = await waitFor(page, () => (window.__mwCadSurfaces ? window.__mwCadSurfaces() : null), (v) => Array.isArray(v) && v.some((s) => s.name === `carcass:carcass/${antresolId}` && typeof s.map === 'string'), 30_000).then(() => surfaces(page));
    await shot(page, '06-antresol-3d');
    const antresolMesh = withAntresol.list.filter((s) => s.name === `carcass:carcass/${antresolId}` && s.count > 0);
    check(
      `TEX-E.8 3D: корпус антресоли — рисунок в цвет ${ANTRESOL.article} (${antresolRef.hex}), отдельной пачкой от корпуса шкафа W1000 (ровный цвет)`,
      antresolMesh.length > 0 && antresolMesh.every((s) => demoIn(s.map, antresolRef)) && withAntresol.list.some((s) => s.name === `carcass:carcass/${bodyId}` && s.map === null),
      words(withAntresol, 'carcass:'),
    );

    /* 5. Сохранение: ссылки на позиции, а не копии. */
    await saved(page);
    const { data: row } = await service.from('projects').select('millwork').eq('id', id).single();
    const run = row?.millwork?.runs?.optimal;
    const all = [...(run?.modules ?? []), ...(run?.upperSegments ?? []).flatMap((sg) => sg.modules)];
    const front2Id = await itemId(org.id, FRONT_2.article);
    const over = all.find((m) => m.overhead);
    check(
      'TEX-E.9 в объекте ссылки на позиции: фасады — H1180, корпус ряда — W1000, полки и перегородки — свои, корпус антресоли — H3309',
      all.filter((m) => m.front?.itemId === front2Id).length > 0 &&
        run?.carcass?.base === bodyId &&
        run?.carcass?.shelves === shelvesId &&
        run?.carcass?.partitions === partsId &&
        over?.carcassItemId === antresolId,
      `фасадов H1180 ${all.filter((m) => m.front?.itemId === front2Id).length} · корпус ${run?.carcass?.base === bodyId ? 'W1000' : run?.carcass?.base ?? '—'} · полки ${run?.carcass?.shelves ? 'свои' : 'НЕТ'} · перегородки ${run?.carcass?.partitions ? 'свои' : 'НЕТ'} · антресоль ${over ? (over.carcassItemId === antresolId ? 'H3309' : over.carcassItemId ?? '—') : 'НЕТ АНТРЕСОЛИ'}`,
    );

    /* 6. Перезагрузка — те же образцы. */
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
    await sleep(1500);
    await open3d(page);
    await preset(page, 'design');
    await sleep(2000);
    /*
     * После перезагрузки рисунки считает один фоновый поток по очереди: ждём
     * ИМЕННО рисунок H1180 на фасадах и H3309 на антресоли — «какая-нибудь
     * карта на фасаде» выполнялась фасадом антресоли раньше фасадов шкафа.
     */
    const after = await waitFor(page, () => (window.__mwCadSurfaces ? window.__mwCadSurfaces() : null), (v) => Array.isArray(v) && v.some((s) => s.name.startsWith('front:') && demoIn(s.map, ref2)) && v.some((s) => s.name === `carcass:carcass/${antresolId}` && demoIn(s.map, antresolRef)), 30_000).then(() => surfaces(page));
    await shot(page, '07-after-reload-3d');
    const sameFronts = mapsOf(after, 'front:').filter((s) => demoIn(s.map, ref2));
    check(
      'TEX-E.10 после перезагрузки: фасады — тот же рисунок в цвет H1180, корпус W1000 — ровный цвет, корпус антресоли — рисунок в цвет H3309',
      sameFronts.length > 0 &&
        after.list.some((s) => s.name === `carcass:carcass/${bodyId}` && s.map === null) &&
        after.list.some((s) => s.name === `carcass:carcass/${antresolId}` && demoIn(s.map, antresolRef)),
      `${words(after, 'front:')} · ${words(after, 'carcass:')}`,
    );

    /* 7. Смета: полки и перегородки — своими строками, без цены — словами. */
    await page.locator('[data-studio-open="estimate"]').first().click().catch(() => undefined);
    await sleep(1500);
    const body = await page.evaluate(() => document.body.innerText);
    await shot(page, '08-estimate');
    /* Плиту называет позиция: её название, а без подтверждённого — артикул (как в раскрое). */
    const plate = async (article) => {
      const { data } = await service.from('catalog_items').select('name_ru').eq('org_id', org.id).eq('article', article).single();
      return data?.name_ru?.trim() || article;
    };
    const shelfPlate = await plate(SHELVES.article);
    const partPlate = await plate(PARTS_DECOR.article);
    check(
      `TEX-E.11 смета: строки «Полки «${shelfPlate}»» и «Перегородки «${partPlate}»», цена не задана, итог неполный`,
      body.includes(`Полки «${shelfPlate}»`) && body.includes(`Перегородки «${partPlate}»`) && /неполн/.test(body),
      (body.match(/[^\n]*(Полки|Перегородки) «[^\n]*/g) ?? ['СТРОК НЕТ']).slice(0, 2).join(' | ').slice(0, 200),
    );
    check('EGGER ошибок страницы нет', errors.length === 0, errors.slice(0, 2).join(' | '));
  });
}

/* ═════════════════════════  GRANDEX  ═════════════════════════ */

/* M-705A — тот камень, что владелец уже положил на свою кухню (объект 9f33785c), и рисунок у него виден. */
const STONE = { article: 'GRANDEX-M-705A', key: 'GRANDEX/M-705A.webp' };

/*
 * СВОИ ПОЗИЦИИ С ФОТО — ДЛЯ ПРОВЕРКИ ЦВЕТА БЕЗ ЗАГРУЖЕННОЙ ФОТОГРАФИИ.
 * Адрес фото абсолютный (`catalogUrl` отдаёт его как есть) и перехватывается
 * страницей: «есть» отвечает настоящим PNG 4×4, «нет» — 404.
 */
const PHOTO_HOST = 'https://ldsp-test.invalid';
const PHOTO_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWOYlW0PRwzEcQAUghRBIp/1UgAAAABJRU5ErkJggg==', 'base64');
const OWN_OK = { article: 'TEST-COUNTER-PHOTO-OK', hex: '#8a6f5a', path: `${PHOTO_HOST}/ok.png` };
const OWN_MISSING = { article: 'TEST-COUNTER-PHOTO-404', hex: '#3b5f7a', path: `${PHOTO_HOST}/missing.png` };

async function partGrandex(browser) {
  console.log('\n── GRANDEX: кухня → столешница из каталога → 3D → сохранить → перезагрузить; цвет без фото');
  const table = referenceTable();
  await withOrg('GRANDEX', browser, async ({ service, makeUser, addProject, itemId, stamp }) => {
    const { org, page, errors } = await makeUser('tex-g');
    /*
     * Картинки брошюры с неподтверждёнными правами не запрашиваются вовсе —
     * ни карточкой, ни списком, ни сценой: считается каждый запрос к выдаче
     * образцов за всю часть.
     */
    const previewRequests = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/catalog/materials/preview')) previewRequests.push(request.url());
    });
    await page.route(`${PHOTO_HOST}/**`, (route) =>
      route.request().url().endsWith('/ok.png')
        ? route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PHOTO_PNG })
        : route.fulfill({ status: 404, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: 'нет файла' }),
    );
    /* Свои позиции коллекции GRANDEX с фото — строки той же формы, что у загруженной позиции. */
    const { data: template } = await service.from('catalog_items').select('*').eq('org_id', org.id).eq('article', STONE.article).single();
    must('GRANDEX образец строки для своих позиций найден', Boolean(template), `НУЛЕВОЙ СЕЛЕКТОР: ${STONE.article} в каталоге организации`);
    for (const own of [OWN_OK, OWN_MISSING]) {
      const { id: _id, created_at: _c, updated_at: _u, ...row } = template;
      void _id;
      void _c;
      void _u;
      const { provenance: _p, ...meta } = row.meta ?? {};
      void _p;
      const { data: made, error } = await service
        .from('catalog_items')
        .insert({ ...row, article: own.article, name_ru: `Проверка фото ${own.article}`, name_kk: `Проверка фото ${own.article}`, tiling: { moduleSize: [0.6, 0.6] }, meta: { ...meta, color: own.hex } })
        .select('id')
        .single();
      must(`GRANDEX своя позиция ${own.article} заведена`, !error && Boolean(made), error?.message ?? 'нет строки');
      const { error: assetError } = await service.from('catalog_assets').insert({ item_id: made.id, org_id: org.id, kind: 'texture', role: 'main', storage_path: own.path, sort_order: 0 });
      must(`GRANDEX фото своей позиции ${own.article} записано`, !assetError, assetError?.message ?? '');
    }
    const id = await addProject(org.id, {
      address: 'Проверка P3D-TEX кухня',
      zone: 'Кухня',
      measurements: measurement(stamp),
      millwork: { survey: survey(), templateId: 'linear-standard' },
    });
    await openStudio(page, id);
    const s0 = await open3d(page);
    must('GRANDEX 3D готова', s0.state === 'ready', `${s0.state} за ${s0.ms} мс`);
    await saved(page);
    await shot(page, '11-kitchen-3d-default');
    const said = await applyItem(page, 'countertop', 'GRANDEX', STONE.article);
    must(`GRANDEX ${STONE.article} лёг на столешницу`, said === null, said ?? '');
    const card = await cardOf(page);
    await page.locator('[data-material-card]').first().scrollIntoViewIfNeeded().catch(() => undefined);
    await shot(page, '12-grandex-card');
    /*
     * Было (P3D-TEX): «картинка камня загрузилась, REFERENCE_ONLY». Права на
     * изображения не подтверждены (NOT_VERIFIED): картинки нет, у карточки —
     * цвет самого образца и откуда он, словами.
     */
    const swatch = await page.evaluate(() => getComputedStyle(document.querySelector('[data-material-card] [data-review-color]') ?? document.body).backgroundColor);
    check(
      'TEX-G.1 карточка GRANDEX: картинки брошюры нет — плашка цвета образца; производитель GRANDEX; «права не подтверждены» и откуда цвет названы',
      Boolean(card) && !card.image && card.maker === 'GRANDEX' && /не подтверждены/.test(card.status ?? '') && /ровный цвет/.test(card.status ?? '') && /стр\.|кроп/.test(card.colorOrigin ?? '') && swatch !== 'rgba(0, 0, 0, 0)',
      card ? `картинка ${card.image ? 'ПОКАЗАНА' : 'нет'} · плашка ${swatch} · ${card.maker ?? 'НЕ НАЗВАН'} · цвет: ${card.colorOrigin ?? 'НЕ НАЗВАН'} · «${card.status.slice(0, 100)}»` : 'НУЛЕВОЙ СЕЛЕКТОР',
    );
    await tool(page, 'furniture');
    await view(page, '3d');
    await sceneSettled(page);
    await sleep(1500);
    const read = await surfaces(page);
    const counterLook = await page.evaluate(() => (window.__mwCadLook ? window.__mwCadLook().counterColors : null));
    await shot(page, '13-grandex-countertop-3d');
    /* Сверху — плита во весь кадр: рисунок камня виден, а не скользящим взглядом. */
    await page.locator('[data-angles] [data-angle="plan"]').first().click().catch(() => undefined);
    await sleep(1500);
    await shot(page, '13b-grandex-countertop-top');
    await page.locator('[data-angles] [data-angle-home]').first().click().catch(() => undefined);
    await sleep(800);
    const ref = table.get(STONE.key);
    const counters = mapsOf(read, 'counter:');
    check(
      `TEX-G.2 3D: плиты столешницы ${STONE.article} — ровный цвет самого образца (${ref.hex}), картинки нет; запросов к образцам брошюры с начала части — 0`,
      counters.length > 0 && counters.every((s) => s.map === null) && Array.isArray(counterLook) && counterLook.includes(ref.hex) && previewRequests.length === 0,
      `${words(read, 'counter:')} · цвет плит ${(counterLook ?? []).join(',') || 'НЕТ'} · запросов к образцам ${previewRequests.length}`,
    );
    await saved(page);
    const stoneId = await itemId(org.id, STONE.article);
    const { data: row } = await service.from('projects').select('millwork').eq('id', id).single();
    const runs = Object.values(row?.millwork?.runs ?? {});
    check('TEX-G.3 в объекте столешница — ссылка на позицию GRANDEX', runs.some((r) => r?.countertopMaterial?.itemId === stoneId), JSON.stringify(runs.map((r) => r?.countertopMaterial ?? null)).slice(0, 160));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
    await sleep(1500);
    await open3d(page);
    await sleep(2000);
    /* Сразу после перезагрузки карты ещё нет и у сломанной сборки: даём фото время приехать. */
    await sleep(3000);
    const again = await surfaces(page);
    const againLook = await page.evaluate(() => (window.__mwCadLook ? window.__mwCadLook().counterColors : null));
    await shot(page, '14-grandex-after-reload-3d');
    check(
      'TEX-G.4 после перезагрузки на столешнице тот же цвет камня, картинки нет; запросов к образцам брошюры за часть — 0',
      mapsOf(again, 'counter:').length > 0 && mapsOf(again, 'counter:').every((s) => s.map === null) && Array.isArray(againLook) && againLook.includes(ref.hex) && previewRequests.length === 0,
      `${words(again, 'counter:')} · цвет плит ${(againLook ?? []).join(',') || 'НЕТ'} · запросов к образцам ${previewRequests.length}`,
    );

    /*
     * ЦВЕТ БЕЗ ЗАГРУЖЕННОЙ ФОТОГРАФИИ (материалы, финал). Своя позиция с фото
     * ложится фото; следующая, чьё фото не отдалось (404), обязана лечь СВОИМ
     * цветом — а не прежним фото под белым множителем.
     */
    const okSaid = await applyItem(page, 'countertop', 'GRANDEX', OWN_OK.article);
    must(`GRANDEX ${OWN_OK.article} лёг на столешницу`, okSaid === null, okSaid ?? '');
    await tool(page, 'furniture');
    await view(page, '3d');
    await sceneSettled(page);
    const withPhoto = await waitFor(page, () => (window.__mwCadSurfaces ? window.__mwCadSurfaces() : null), (v) => Array.isArray(v) && v.some((s) => s.name.startsWith('counter:') && typeof s.map === 'string' && s.map.includes('/ok.png')), 20_000).then(() => surfaces(page));
    const missingSaid = await applyItem(page, 'countertop', 'GRANDEX', OWN_MISSING.article);
    must(`GRANDEX ${OWN_MISSING.article} лёг на столешницу`, missingSaid === null, missingSaid ?? '');
    await tool(page, 'furniture');
    await view(page, '3d');
    await sceneSettled(page);
    await sleep(2500);
    const without = await surfaces(page);
    const withoutLook = await page.evaluate(() => (window.__mwCadLook ? window.__mwCadLook().counterColors : null));
    await shot(page, '15-counter-photo-missing-3d');
    check(
      `TEX-G.5 цвет без загруженной фотографии: своя позиция с фото легла фото, следующая с фото 404 — своим цветом (${OWN_MISSING.hex}), прежнего фото на плите нет`,
      mapsOf(withPhoto, 'counter:').some((s) => typeof s.map === 'string' && s.map.includes('/ok.png')) &&
        mapsOf(without, 'counter:').length > 0 &&
        mapsOf(without, 'counter:').every((s) => s.map === null) &&
        Array.isArray(withoutLook) &&
        withoutLook.includes(OWN_MISSING.hex),
      `с фото: ${words(withPhoto, 'counter:')} · без фото: ${words(without, 'counter:')} · цвет плит ${(withoutLook ?? []).join(',') || 'НЕТ'}`,
    );
    check('GRANDEX ошибок страницы нет', errors.length === 0, errors.slice(0, 2).join(' | '));
  });
}

/* ═════════════════════════  админка  ═════════════════════════ */

async function partAdmin(browser) {
  console.log('\n── /admin/catalog: картинка образца у позиций EGGER и GRANDEX');
  await withOrg('ADMIN', browser, async ({ makeUser }) => {
    const { page, errors } = await makeUser('tex-a');
    await page.goto(`${BASE}/admin/catalog`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-admin-search]', { timeout: 60_000 });
    const seen = {};
    for (const article of ['EGGER-H1113-ST10', STONE.article]) {
      await page.locator('[data-admin-search]').first().fill(article);
      await sleep(1200);
      seen[article] = await waitFor(
        page,
        () => {
          const img = document.querySelector('[data-admin-reference]');
          return img ? { loaded: img.complete && img.naturalWidth > 0, w: img.naturalWidth, status: document.querySelector('[data-admin-reference-status]')?.textContent ?? null } : null;
        },
        (v) => Boolean(v?.loaded),
        10_000,
      );
      await shot(page, `21-admin-${article}`);
    }
    check(
      'TEX-A.1 /admin/catalog: у EGGER и GRANDEX в ячейке картинка образца (загружена), рядом «REFERENCE_ONLY»',
      Object.values(seen).every((v) => v?.loaded && /REFERENCE_ONLY/.test(v.status ?? '')),
      Object.entries(seen).map(([a, v]) => `${a}: ${v ? `${v.w}px ${v.loaded ? 'загружена' : 'НЕТ'} · ${v.status ?? 'без пометки'}` : 'НЕТ КАРТИНКИ'}`).join(' | '),
    );

    /* Не публикация: без входа образца нет; с входом — образец с пометкой; чужой ключ — словами. */
    const url = `${BASE}/api/catalog/materials/preview?file=${encodeURIComponent('EGGER/H1113_ST10_p81.webp')}`;
    const anon = await fetch(url);
    const own = await page.request.get(url);
    const stranger = await page.request.get(`${BASE}/api/catalog/materials/preview?file=${encodeURIComponent('EGGER/NOPE_p1.webp')}`);
    check(
      'TEX-A.2 образец не опубликован: без входа 401; вошедшему — webp с пометкой REFERENCE_ONLY и private-кэшем; ключа нет в таблице — 404 словами',
      anon.status === 401 &&
        own.status() === 200 &&
        own.headers()['content-type'] === 'image/webp' &&
        /REFERENCE_ONLY/.test(own.headers()['x-material-preview'] ?? '') &&
        /private/.test(own.headers()['cache-control'] ?? '') &&
        stranger.status() === 404 &&
        /нет образца/.test((await stranger.json().catch(() => ({})))?.error ?? ''),
      `без входа ${anon.status} · вошедшему ${own.status()} ${own.headers()['content-type']} «${own.headers()['x-material-preview'] ?? '—'}» ${own.headers()['cache-control'] ?? ''} · чужой ключ ${stranger.status()}`,
    );
    check('ADMIN ошибок страницы нет', errors.length === 0, errors.slice(0, 2).join(' | '));
  });
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
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: true,
  cwd: SERVER_DIR,
  env: {
    ...process.env,
    SITE_PASSWORD: '',
    /* Папки образцов и пакета — с этой машины; у сборки «до» свой каталог, путь абсолютный. */
    REFERENCE_TEXTURE_DIR: resolve('CATALOG_STAGING/99_IMPORT_QUEUE/EGGER_GRANDEX_REFERENCE'),
    SUPPLIER_REVIEW_ASSETS: resolve('CATALOG_STAGING/99_IMPORT_QUEUE/EGGER_GRANDEX/assets'),
  },
});
let browser;
const done = [];
console.log(`Сборка: ${SERVER_DIR} · снимки: ${OUT}`);
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
      if (part === 'egger') await partEgger(browser);
      if (part === 'grandex') await partGrandex(browser);
      if (part === 'admin') await partAdmin(browser);
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
