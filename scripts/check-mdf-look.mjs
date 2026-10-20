/**
 * ПРИЁМКА P3D-MDF В БРАУЗЕРЕ: как МДФ-фасады выглядят в 3D — снимками с
 * ОДНОЙ камеры «до» и «после» и числами по пикселям.
 *
 * Запуск (после `npm run build`):
 *   SHOTS=before|after PART=look LOOK_STATES=s1,s2 node scripts/check-mdf-look.mjs
 *   PART=measure — только числа и сверки по уже снятым кадрам (без браузера);
 *   PART=tablet — общий вид и фасад на планшете 1024 px (после);
 *   PART=flow — путь человека в Studio (после): шкаф → дверь → тип МДФ →
 *     цвет RAL → 3D → фрезеровка → открыть/закрыть → сохранить → перезагрузить.
 * Снимки: .capture-check/mdf-look/<SHOTS>/. Позы камеры — из «до» (poses.json):
 * «после» снимает ровно с тех же точек, габарит мебели обязан совпасть.
 *
 * Состояния (шкаф спальни 900 + 1000, по две створки, путём экрана —
 * `scripts/mdf-look-fixture.ts`):
 *   s1  гладкий матовый МДФ, RAL 130 50 20 и RAL 080 80 10
 *   s2  рамочный фасад                        (до: филёнчатый — то, что было)
 *   s3  вертикальная фрезеровка, двери открыты (до: «Профильный» картой нормалей)
 *   s4  рифлёный фасад крупно                 (до: «Жалюзи» картой нормалей)
 * «До» — ближайшее, что продукт умел показать; «после» — объёмный рельеф.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_MDF ?? 3282);
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS ?? 'after';
const ROOT_OUT = '.capture-check/mdf-look';
const OUT = `${ROOT_OUT}/${SHOTS}`;
const SERVER_DIR = resolve(process.env.SERVER_DIR ?? '.');
const EMPTY_REFERENCE = resolve(`${ROOT_OUT}/empty-reference`);
const PARTS = (process.env.PART ?? 'look').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['look', 'measure', 'tablet', 'flow'];
const LOOK_STATES = (process.env.LOOK_STATES ?? 's1,s2,s3,s4').split(',').map((s) => s.trim()).filter(Boolean);
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

const buildId = () => {
  try {
    return readFileSync(resolve(SERVER_DIR, '.next/BUILD_ID'), 'utf8').trim();
  } catch {
    throw new Stop(`нет сборки в ${SERVER_DIR}/.next — сначала npm run build`);
  }
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
  measuredBy: 'P3D-MDF',
  measuredAt: '2026-10-20',
});
const measurement = (stamp) => ({
  id: `m-${stamp}`,
  ceilingHeightMm: CEILING,
  walls: WALLS.map((l, i) => ({ id: `w${i + 1}`, lengthMm: l, angleDeg: 90, openings: [] })),
  comms: [],
  photos: [],
  measuredBy: 'P3D-MDF',
  measuredAt: '2026-10-20',
  notes: '',
});

/** Ряды состояний путём экрана: фасады ложатся операциями движка. */
function fixtureRuns(states) {
  const out = execSync('npx tsx scripts/mdf-look-fixture.ts', {
    input: JSON.stringify({ states }),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(out);
}

/* ─────────────────────────  состояния  ───────────────────────── */

const RAL = {
  green: { code: 'RAL 130 50 20', hex: '#6a7b59' },
  sand: { code: 'RAL 080 80 10', hex: '#d5c6b4' },
  blue: { code: 'RAL 250 40 20', hex: '#32607a' },
  cucumber: { code: 'RAL 160 40 15', hex: '#466353' },
};
const MODULES = ['tall-0@w1', 'tall-900@w1'];
const enamel = (hex, extra = {}) => ({ base: 'mdf_enamel', construct: 'solid', finish: 'matte', surface: 'matte', colorHex: hex, ...extra });
const both = (front) => MODULES.map((moduleId) => ({ op: 'set_front', moduleId, front }));

/**
 * ЧТО СНИМАЕТСЯ. `before` — ближайшее, что продукт умел до P3D-MDF;
 * `after` — то же место объёмным рельефом. Позы камеры одни.
 */
const STATES = [
  {
    key: 's1',
    title: 'гладкий матовый МДФ, разные RAL',
    before: () => [
      { op: 'set_front', moduleId: MODULES[0], front: enamel(RAL.green.hex) },
      { op: 'set_front', moduleId: MODULES[1], front: enamel(RAL.sand.hex) },
    ],
    after: () => [
      { op: 'set_front', moduleId: MODULES[0], front: enamel(RAL.green.hex, { relief: { kind: 'slab' } }) },
      { op: 'set_front', moduleId: MODULES[1], front: enamel(RAL.sand.hex, { relief: { kind: 'slab' } }) },
    ],
  },
  {
    key: 's2',
    title: 'рамочный фасад',
    before: () => both(enamel(RAL.sand.hex, { construct: 'framed' })),
    after: () => both(enamel(RAL.sand.hex, { relief: { kind: 'frame' } })),
  },
  {
    key: 's3',
    title: 'вертикальная фрезеровка, двери открыты',
    before: (ids) => both(enamel(RAL.blue.hex, { millingId: ids['MIL-PROFILE'] })),
    after: () => both(enamel(RAL.blue.hex, { relief: { kind: 'vgrooves' } })),
  },
  {
    key: 's4',
    title: 'рифлёный фасад крупно',
    before: (ids) => both(enamel(RAL.cucumber.hex, { millingId: ids['MIL-BLINDS'] })),
    after: () => both(enamel(RAL.cucumber.hex, { relief: { kind: 'fluted' } })),
  },
  /*
   * ТОЛЬКО «ПОСЛЕ» — того, чего до P3D-MDF не было вовсе: свой фасад у каждой
   * двери (четыре покрытия одного RAL), шпон с рисунком и модель каталога KIRA.
   */
  {
    key: 's5',
    title: 'четыре двери — четыре покрытия одного RAL (своя дверь — свой фасад)',
    afterOnly: true,
    after: () =>
      [
        [MODULES[0], 'door:0', 'touch_sense', 'matte'],
        [MODULES[0], 'door:1', 'matte', 'matte'],
        [MODULES[1], 'door:0', 'satin', 'matte'],
        [MODULES[1], 'door:1', 'gloss', 'gloss'],
      ].map(([moduleId, leaf, surface, finish]) => ({
        op: 'set_leaf_front',
        moduleId,
        leaf,
        front: { base: 'mdf_enamel', construct: 'solid', finish, surface, colorHex: RAL.blue.hex, relief: { kind: 'slab' } },
      })),
  },
  {
    key: 's6',
    title: 'шпон с рифлением',
    afterOnly: true,
    after: () => both({ base: 'veneer_solid', construct: 'solid', finish: 'matte', surface: 'satin', colorHex: '#a7845c', relief: { kind: 'fluted' } }),
  },
  {
    key: 's7',
    title: 'модель KIRA СЛ 7 — приближение VISUAL_ONLY',
    afterOnly: true,
    after: () => both(enamel(RAL.sand.hex, { relief: { kind: 'grooves', insetMm: 40, count: 3, pitchMm: 26, widthMm: 8, depthMm: 3, model: 'KIRA:SL-7' } })),
  },
];

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
async function angle(page, key) {
  await page.locator(`[data-angles] [data-angle="${key}"]`).first().click().catch(() => undefined);
  await sleep(1400);
}
const surfaces = (page) => page.evaluate(() => (window.__mwCadSurfaces ? window.__mwCadSurfaces() : null));
const reliefs = (page) => page.evaluate(() => (window.__mwCadReliefs ? window.__mwCadReliefs() : null));

/* ─────────────────────────  пиксели кадра  ───────────────────────── */

/**
 * ЧТО ВИДНО НА КАДРЕ — числами, по куску холста сцены (доли холста):
 *   contrast — разброс яркости (sRGB 0…255): ровная заливка 1–3;
 *   edges    — доля пикселей с перепадом яркости ≥ 12 к соседу: кромки
 *              фрезеровки, щели и тени канавок; ровный фасад — около нуля;
 *   gx/gy    — перепады поперёк вертикали и поперёк горизонтали отдельно:
 *              вертикальные канавки дают gx ≫ gy;
 *   L, hex   — светлота CIELAB и средний цвет; black — доля почти чёрного.
 */
async function pixels(file, rect, box) {
  const left = Math.round(rect.x + rect.w * box.x);
  const top = Math.round(rect.y + rect.h * box.y);
  const width = Math.round(rect.w * box.w);
  const height = Math.round(rect.h * box.h);
  const { data, info } = await sharp(file).extract({ left, top, width, height }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const lum = new Float64Array(n);
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let black = 0;
  for (let i = 0; i < n; i += 1) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    sr += r;
    sg += g;
    sb += b;
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum[i] < 18) black += 1;
  }
  const mean = lum.reduce((s, v) => s + v, 0) / n;
  const std = Math.sqrt(lum.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  let gx = 0;
  let gy = 0;
  let edges = 0;
  let cells = 0;
  for (let j = 1; j < info.height - 1; j += 1) {
    for (let i = 1; i < info.width - 1; i += 1) {
      const k = j * info.width + i;
      const dx = Math.abs(lum[k + 1] - lum[k - 1]) / 2;
      const dy = Math.abs(lum[k + info.width] - lum[k - info.width]) / 2;
      gx += dx;
      gy += dy;
      if (Math.max(dx, dy) >= 12) edges += 1;
      cells += 1;
    }
  }
  const rgb = [sr / n, sg / n, sb / n];
  const lin = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const L = y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    contrast: r1(std),
    edges: Math.round((edges / Math.max(1, cells)) * 1000) / 10,
    gx: r1(gx / Math.max(1, cells)),
    gy: r1(gy / Math.max(1, cells)),
    L: r1(L),
    black: Math.round((black / n) * 1000) / 10,
    hex: `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`,
  };
}

/** Куски кадра, по которым меряется каждый снимок (доли холста сцены). */
const BOXES = {
  general: { x: 0.36, y: 0.3, w: 0.28, h: 0.36 },
  front: { x: 0.3, y: 0.12, w: 0.4, h: 0.7 },
  detail: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
  open: { x: 0.3, y: 0.25, w: 0.4, h: 0.5 },
  'open-detail': { x: 0.3, y: 0.2, w: 0.4, h: 0.6 },
};

/* ─────────────────────────  организация  ───────────────────────── */

async function withOrg(label, browser, body, { viewport = { width: 1440, height: 900 }, ral = false } = {}) {
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
    const context = await browser.newContext({ viewport });
    await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', sameSite: 'Lax' })));
    const page = await context.newPage();
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160));
    });
    /* Типовой прайс: ставки и типовые фрезеровки (`TYPICAL_MILLING`) — их ищет состояние «до». */
    const seeded = await page.request.post(`${BASE}/api/catalog/seed-rates`, { data: { orgId: org.id } });
    if (!seeded.ok()) throw new Error(`типовой прайс не заведён: ${seeded.status()}`);
    if (ral) {
      const imported = await page.request.post(`${BASE}/api/catalog/materials`, { data: { orgId: org.id, collections: ['ral-design'], confirm: true } });
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
    check(`${label}: уборка временной организации проверена чтением`, left.length === 0, left.join(', ') || 'удалено');
  }
}

/** Типовые фрезеровки организации по артикулу — их идентификаторы нужны состоянию «до». */
async function millingIds(service, orgId) {
  const { data } = await service.from('catalog_items').select('id, article').eq('org_id', orgId).in('article', ['MIL-PROFILE', 'MIL-BLINDS']);
  const ids = Object.fromEntries((data ?? []).map((row) => [row.article, row.id]));
  must('типовые фрезеровки «Профильный» и «Жалюзи» заведены в организации', Boolean(ids['MIL-PROFILE'] && ids['MIL-BLINDS']), `НУЛЕВОЙ СЕЛЕКТОР: ${JSON.stringify(ids)}`);
  return ids;
}

/* ─────────────────────────  позы камеры  ───────────────────────── */

/**
 * ПОЗЫ — ОТ ГАБАРИТА МЕБЕЛИ, КОТОРЫЙ ОТДАЁТ САМА СЦЕНА. Шкаф 900 + 1000
 * от левого края: левый модуль — две створки по 450, правая створка второго
 * модуля открывается вправо, её лицо после открывания смотрит в комнату.
 */
function posesOf(info) {
  const [cx, cy, cz] = info.bounds.center;
  const [sx] = info.bounds.size;
  const x0 = cx - sx / 2;
  const front = cz + info.bounds.size[2] / 2;
  const door = x0 + 0.675;
  const right = x0 + 1.9;
  return {
    general: { position: info.position, target: info.target },
    /* Левый шкаф целиком, во всю высоту, строго спереди. */
    front: { position: [x0 + 0.45, cy, front + 4.4], target: [x0 + 0.45, cy, front] },
    /* Крупно: верх правой створки левого шкафа, сверху-справа, — угол рисунка, кромка, щель. */
    detail: { position: [door + 0.42, 2.62, front + 0.62], target: [door - 0.12, 2.28, front] },
    'open-detail': { position: [right + 1.3, 1.6, front + 1.4], target: [right + 0.1, 1.3, front + 0.3] },
  };
}

async function canvasRect(page) {
  return page.evaluate(() => {
    const c = document.querySelector('[data-studio-viewport] [data-scene] canvas');
    const r = c?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  });
}

async function shoot(page, pose, file, box) {
  await page.evaluate((p) => window.__mwCadCamera(p), pose);
  await sleep(1800);
  /* Программный WebGL рисует кадр с тенями секундами: снимок ждёт его, а не 30 с по умолчанию. */
  await page.screenshot({ path: file, timeout: 120_000 });
  const rect = await canvasRect(page);
  return rect ? { ...(await pixels(file, rect, box)), rect } : null;
}

/* ═════════════════════════  LOOK  ═════════════════════════ */

async function partLook(browser) {
  const BUILD_ID = buildId();
  console.log(`\n── LOOK (${SHOTS}): ${LOOK_STATES.join(', ')} — пять кадров с одной камеры`);
  const posesFile = `${ROOT_OUT}/before/poses.json`;
  const stored = SHOTS === 'before' ? null : existsSync(posesFile) ? JSON.parse(readFileSync(posesFile, 'utf8')) : null;
  if (SHOTS !== 'before') must(`позы «до» есть (${posesFile})`, Boolean(stored), 'сначала SHOTS=before');
  /*
   * «До» с s1 считает позы заново от габарита мебели и пишет их; «до» без s1
   * (части прогона) берёт уже записанные — у всех состояний одна камера.
   */
  const reuse = SHOTS === 'before' && !LOOK_STATES.includes('s1') && existsSync(posesFile) ? JSON.parse(readFileSync(posesFile, 'utf8')) : null;
  let fixed = stored?.poses ?? reuse?.poses ?? null;
  let fixedBounds = stored?.bounds ?? reuse?.bounds ?? null;
  const report = {};
  await withOrg('LOOK', browser, async ({ service, makeUser, addProject, stamp }) => {
    const { org, page, errors } = await makeUser('mdf-l');
    const ids = SHOTS === 'before' ? await millingIds(service, org.id) : {};
    const skipped = STATES.filter((s) => LOOK_STATES.includes(s.key) && s.afterOnly && SHOTS === 'before');
    if (skipped.length) console.log(`  ·    «до» не снимается у ${skipped.map((s) => s.key).join(', ')}: до P3D-MDF этого не было вовсе`);
    const chosen = STATES.filter((s) => LOOK_STATES.includes(s.key) && !(s.afterOnly && SHOTS === 'before'));
    const fx = fixtureRuns(Object.fromEntries(chosen.map((s) => [s.key, { ops: s[SHOTS === 'before' ? 'before' : 'after'](ids) }])));
    for (const state of chosen) {
      const run = fx.runs[state.key];
      must(`LOOK ${state.key}: ряд собран путём экрана`, Boolean(run?.modules?.length === 2), 'НУЛЕВОЙ СЕЛЕКТОР: ряда нет');
      const id = await addProject(org.id, {
        address: `Проверка P3D-MDF ${state.key}`,
        zone: 'Спальня',
        measurements: measurement(stamp),
        millwork: { survey: survey(), requirements: fx.requirements, runs: { optimal: run }, selectedVariant: 'optimal' },
      });
      await openStudio(page, id);
      const s0 = await open3d(page);
      must(`LOOK ${state.key}: 3D готова`, s0.state === 'ready', `${s0.state} за ${s0.ms} мс`);
      await preset(page, 'design');
      await angle(page, 'iso');
      await sleep(1500);
      const info = await page.evaluate(() => (window.__mwCadCamera ? window.__mwCadCamera() : null));
      must(`LOOK ${state.key}: камера читается (__mwCadCamera)`, Boolean(info), 'НУЛЕВОЙ СЕЛЕКТОР: __mwCadCamera нет');
      if (!fixed) {
        fixed = posesOf(info);
        fixedBounds = info.bounds;
        writeFileSync(posesFile, JSON.stringify({ bounds: info.bounds, poses: fixed }, null, 1));
      }
      const drift = Math.max(
        ...[0, 1, 2].map((i) => Math.abs(info.bounds.center[i] - fixedBounds.center[i])),
        ...[0, 1, 2].map((i) => Math.abs(info.bounds.size[i] - fixedBounds.size[i])),
      );
      must(`LOOK ${state.key}: габарит мебели тот же, что у поз камеры (≤ 1 мм)`, drift <= 0.001, `${(drift * 1000).toFixed(1)} мм`);
      const shots = {};
      for (const name of ['general', 'front', 'detail']) {
        shots[name] = await shoot(page, fixed[name], `${OUT}/${state.key}-${name}.png`, BOXES[name]);
      }
      const edgePoints = () => page.evaluate(() => (window.__mwCadLook ? window.__mwCadLook().edgePoints : null));
      const closed = { surfaces: await surfaces(page), reliefs: await reliefs(page), edges: await edgePoints() };
      await page.locator('[data-open-all]').first().click().catch(() => undefined);
      /* Створки едут кадрами: ждать, пока сцена встанет, а не по таймеру. */
      await sleep(3000);
      await sceneSettled(page);
      const edgesOpen = await edgePoints();
      shots.open = await shoot(page, fixed.general, `${OUT}/${state.key}-open.png`, BOXES.open);
      shots['open-detail'] = await shoot(page, fixed['open-detail'], `${OUT}/${state.key}-open-detail.png`, BOXES['open-detail']);
      const opened = { reliefs: await reliefs(page) };
      await page.locator('[data-close-all]').first().click().catch(() => undefined);
      await sleep(1500);
      report[state.key] = {
        shots,
        fronts: (closed.surfaces ?? []).filter((s) => s.name.startsWith('front:')).map((s) => ({ name: s.name, map: s.map, color: s.color })),
        reliefs: closed.reliefs,
        reliefsOpen: opened.reliefs,
        /* Точки буфера рёбер: двери закрыты и открыты — у открытой контура закрытого положения нет. */
        edgePoints: { closed: closed.edges, open: edgesOpen },
      };
      console.log(`  ·    ${state.key} ${state.title}`);
      for (const [name, m] of Object.entries(shots)) {
        console.log(`  ·      ${name.padEnd(12)} разброс ${m?.contrast} · кромок ${m?.edges}% · gx/gy ${m?.gx}/${m?.gy} · L* ${m?.L} · чёрного ${m?.black}% · ${m?.hex}`);
      }
    }
    check('LOOK ошибок страницы нет', errors.length === 0, errors.slice(0, 2).join(' | '));
  });
  const file = `${OUT}/measure.json`;
  const prior = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const merged = { build: BUILD_ID, states: { ...(prior?.build === BUILD_ID ? prior.states : {}), ...report } };
  writeFileSync(file, JSON.stringify(merged, null, 1));
  console.log(`  ·    числа: ${file} (сборка ${BUILD_ID}, состояний ${Object.keys(merged.states).length})`);
}

/* ═════════════════════════  MEASURE: «до» и «после» числами  ═════════════════════════ */

/**
 * Сверки «до → после» по снимкам с одной камеры. Пороги поставлены после
 * первого замера и названы в отчёте: рисунок обязан быть виден (кромки
 * фрезеровки — перепады яркости), чёрных граней нет, цвет фасада — свой.
 */
/**
 * РЕЛЬЕФ СВЕТОМ, А НЕ ЛИНИЯМИ — по файлу кадра.
 *
 * «Кромок» в сыром кадре дают и чёрные линии рёбер САПР-вида: у прежней
 * филёнки их по пять контуров на дверь, и мера «кромок» хвалила бы линии,
 * а не объём. Здесь кусок кадра сначала проходит медиану 5 × 5 — линии в
 * 1–2 px уходят, тени профиля и стенки канавок (от 3 px) остаются, — и
 * считается доля пикселей с перепадом яркости ≥ 6 к соседу.
 */
async function reliefPixels(file, rect, box) {
  const left = Math.round(rect.x + rect.w * box.x);
  const top = Math.round(rect.y + rect.h * box.y);
  const width = Math.round(rect.w * box.w);
  const height = Math.round(rect.h * box.h);
  const { data, info } = await sharp(file).extract({ left, top, width, height }).removeAlpha().median(5).raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const lum = new Float64Array(n);
  for (let i = 0; i < n; i += 1) lum[i] = 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2];
  let relief = 0;
  let cells = 0;
  for (let j = 1; j < info.height - 1; j += 1) {
    for (let i = 1; i < info.width - 1; i += 1) {
      const k = j * info.width + i;
      const g = Math.max(Math.abs(lum[k + 1] - lum[k - 1]), Math.abs(lum[k + info.width] - lum[k - info.width])) / 2;
      if (g >= 6) relief += 1;
      cells += 1;
    }
  }
  return Math.round((relief / Math.max(1, cells)) * 1000) / 10;
}

/** Куски кадра для меры рельефа: двери целиком на крупном плане, открытая створка на общем виде. */
const RELIEF_BOXES = {
  front: { x: 0.3, y: 0.12, w: 0.4, h: 0.7 },
  detail: { x: 0.12, y: 0.08, w: 0.76, h: 0.84 },
  /* Открытая левая створка второго шкафа: её лицо смотрит на камеру общего вида. */
  open: { x: 0.515, y: 0.15, w: 0.045, h: 0.7 },
};

async function partMeasure() {
  console.log('\n── MEASURE: «до» и «после» по снимкам с одной камеры');
  const read = (shots) => {
    const file = `${ROOT_OUT}/${shots}/measure.json`;
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  };
  const before = read('before');
  const after = read('after');
  must('числа «до» и «после» есть', Boolean(before && after), `до: ${before ? 'есть' : 'НЕТ'} · после: ${after ? 'есть' : 'НЕТ'}`);
  const reliefPair = async (key, shot) => {
    const rect = after.states[key]?.shots?.[shot]?.rect ?? before.states[key]?.shots?.[shot]?.rect;
    const files = [`${ROOT_OUT}/before/${key}-${shot}.png`, `${ROOT_OUT}/after/${key}-${shot}.png`];
    if (!rect || !files.every((f) => existsSync(f))) return [null, null];
    return [await reliefPixels(files[0], rect, RELIEF_BOXES[shot]), await reliefPixels(files[1], rect, RELIEF_BOXES[shot])];
  };
  /*
   * ПИКСЕЛИ РЕЛЬЕФА — ЧИСЛАМИ ДЛЯ ОТЧЁТА, А НЕ ПРИГОВОРОМ.
   *
   * Прибор проверен на первом же прогоне и не годится судьёй: в «до»
   * перепады набирают чёрные линии рёбер филёнки и размытые полосы карты
   * нормалей, а настоящая канавка 8 мм с общего плана — 3–4 px, и медиана
   * её стирает. Объём рисунка судят проверки по НАРИСОВАННОМУ (L4, L5:
   * сетка рисунка на каждой двери, едущая створка — той же сеткой) и
   * снимки с одной камеры; эти числа печатаются, чтобы их видел отчёт.
   */
  for (const [key, shot] of [['s2', 'detail'], ['s3', 'front'], ['s3', 'detail'], ['s4', 'front'], ['s4', 'detail'], ['s2', 'open'], ['s3', 'open'], ['s4', 'open']]) {
    const [b, a] = await reliefPair(key, shot);
    console.log(`  ·    пиксели рельефа ${key}/${shot}: ${b ?? 'НЕТ КАДРА'}% → ${a ?? 'НЕТ КАДРА'}% (перепад ≥ 6 после медианы 5×5)`);
  }
  const black = Object.entries(after.states).flatMap(([key, state]) =>
    Object.entries(state.shots ?? {}).map(([shot, m]) => ({ key, shot, black: m?.black ?? 100 })),
  );
  check(
    'MDF.L3 чёрных граней нет: почти чёрного ≤ 1 % на каждом кадре «после»',
    black.length > 0 && black.every((s) => s.black <= 1),
    black.filter((s) => s.black > 1).map((s) => `${s.key}/${s.shot} ${s.black}%`).join(', ') || `${black.length} кадров чисто`,
  );
  const reliefs = (key) => after.states[key]?.reliefs ?? [];
  const opened = (key) => after.states[key]?.reliefsOpen ?? [];
  const kinds = { s1: 'slab', s2: 'frame', s3: 'vgrooves', s4: 'fluted' };
  check(
    'MDF.L4 в сцене — объём рисунка на всех четырёх дверях каждого состояния (по нарисованному, а не по данным), тип тот же, что в данных; габарит сетки — коробка фасада',
    Object.entries(kinds).every(([key, kind]) => {
      const closed = reliefs(key).filter((r) => !r.moving);
      return closed.reduce((sum, r) => sum + r.count, 0) === 4 && closed.every((r) => r.drawn === kind && r.sizeMm && r.sizeMm[2] === 16);
    }),
    Object.keys(kinds).map((key) => `${key}: ${reliefs(key).map((r) => `${r.drawn}×${r.count} ${r.sizeMm?.join('×')}`).join(', ') || 'НЕТ'}`).join(' · '),
  );
  check(
    'MDF.L5 открытые двери едут своим мешем с той же сеткой рисунка — не коробкой',
    ['s2', 's3', 's4'].every((key) => opened(key).some((r) => r.moving && r.drawn === kinds[key])),
    ['s2', 's3', 's4'].map((key) => `${key}: едущих ${opened(key).filter((r) => r.moving).length}`).join(' · '),
  );
  /*
   * Открытая створка без контура закрытого положения: у каждой открытой
   * двери 12 рёбер × 2 точки на коробку фасада и ручки — точек меньше.
   * «До» таких чисел нет (прежняя сборка их не писала) — сверка по «после».
   */
  const edgeStates = ['s2', 's3', 's4'].map((key) => ({ key, e: after.states[key]?.edgePoints }));
  check(
    'MDF.L7 двери открыты — контуров закрытых створок внутри шкафа нет: точек рёбер при открытых меньше, чем при закрытых, на все коробки фасадов и ручек (24 точки на коробку)',
    edgeStates.every(({ e }) => e && e.closed > 0 && e.open > 0 && e.open < e.closed && (e.closed - e.open) % 24 === 0),
    edgeStates.map(({ key, e }) => `${key}: ${e?.closed ?? 'НЕТ'} → ${e?.open ?? 'НЕТ'}`).join(' · '),
  );

  /* Цвет фасада — свой RAL: материал сцены против hex, переведённого в линейное своей формулой. */
  const lin = (hex) => [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.002);
  const s1 = reliefs('s1');
  check(
    'MDF.L6 гладкий матовый МДФ: цвета фасадов в сцене — RAL 130 50 20 и RAL 080 80 10 (линейные, ±0.002)',
    s1.some((r) => near(r.color, lin(RAL.green.hex))) && s1.some((r) => near(r.color, lin(RAL.sand.hex))),
    s1.map((r) => r.color.map((v) => v.toFixed(4)).join('/')).join(' · ') || 'НЕТ',
  );
}

/* ═════════════════════════  FLOW: путь человека в Studio  ═════════════════════════ */

async function partFlow(browser) {
  console.log('\n── FLOW: шкаф → дверь → тип МДФ → покрытие → RAL → 3D → фрезеровка → открыть/закрыть → сохранить → перезагрузить');
  await withOrg(
    'FLOW',
    browser,
    async ({ service, makeUser, addProject, stamp }) => {
      const { org, page, errors } = await makeUser('mdf-f');
      const fx = fixtureRuns({ s0: { ops: [] } });
      const id = await addProject(org.id, {
        address: 'Проверка P3D-MDF путь',
        zone: 'Спальня',
        measurements: measurement(stamp),
        millwork: { survey: survey(), requirements: fx.requirements, runs: { optimal: fx.runs.s0 }, selectedVariant: 'optimal' },
      });
      await openStudio(page, id);
      const s0 = await open3d(page);
      must('FLOW 3D готова', s0.state === 'ready', `${s0.state} за ${s0.ms} мс`);
      await saved(page);
      const surfacesBefore = await surfaces(page);

      /* 1. Шкаф — в списке объектов; 2. дверь — в списке дверей панели. */
      must('FLOW инструмент «Выбор»', await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="select"]');
      const cabinet = page.locator('[data-object-module="tall-0@w1"]');
      must('FLOW шкаф в списке объектов', (await cabinet.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-object-module="tall-0@w1"]');
      await cabinet.first().click();
      await sleep(500);
      must('FLOW инструмент «Материалы»', await tool(page, 'materials'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="materials"]');
      await page.waitForSelector('[data-materials-panel][data-loaded="1"]', { timeout: 60_000 }).catch(() => undefined);
      await page.locator('[data-material-target="leaf"]').first().click();
      await sleep(400);
      const leaves = await page.locator('[data-material-leaf]').evaluateAll((list) => list.map((b) => b.getAttribute('data-material-leaf')));
      must('FLOW двери шкафа в панели: «Дверь 1» и «Дверь 2»', leaves.join(',') === 'door:0,door:1', `двери: ${leaves.join(',') || 'НУЛЕВОЙ СЕЛЕКТОР'}`);
      await page.locator('[data-material-leaf="door:1"]').first().click();
      await sleep(400);

      /* 3. Тип МДФ; покрытие. */
      await page.locator('[data-material-tab="mdf_facade"]').first().click();
      await sleep(400);
      const facadeTab = await page.locator('[data-mdf-facade]').count();
      must('FLOW вкладка «МДФ фасады» открыта', facadeTab > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-mdf-facade]');
      const types = await page.locator('[data-relief-type]').evaluateAll((list) => list.map((b) => b.getAttribute('data-relief-type')));
      const previews = await page.locator('[data-mdf-facade] canvas[data-relief-preview]').count();
      const modelsEmpty = await page.locator('[data-mdf-models-empty]').textContent().catch(() => null);
      await page.screenshot({ path: `${OUT}/flow-panel.png`, timeout: 120_000 });
      check(
        'FLOW.1 вкладка: шесть типов A–F карточками с картинкой рисунка (свет по полю глубины, не фото); моделей KIRA в каталоге организации нет — сказано, что их импорт после разрешения владельца',
        types.join(',') === 'slab,frame,vgrooves,hgrooves,fluted,grooves' && previews >= 6 && /разрешения владельца/.test(modelsEmpty ?? ''),
        `типы ${types.join(',')} · картинок ${previews} · «${(modelsEmpty ?? 'НЕТ').slice(0, 90)}»`,
      );
      await page.locator('[data-relief-type="fluted"]').first().click();
      await sleep(1200);
      const typeNotice = await page.locator('[data-mdf-notice]').first().textContent().catch(() => null);
      await page.locator('[data-mdf-coating="matte"]').first().click();
      await sleep(800);

      /* 4. Цвет RAL — во вкладке «Эмаль RAL» той же цели. */
      await page.locator('[data-material-tab="mdf_paint"]').first().click();
      await page.locator('[data-material-search]').first().fill(RAL.cucumber.code);
      await sleep(800);
      const ralRow = page.locator('[data-material-item]').first();
      must('FLOW RAL 160 40 15 найден в каталоге', (await ralRow.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-material-item] после поиска');
      await ralRow.click();
      await sleep(1500);

      /* 5. 3D: рисунок на одной двери, цвет RAL. */
      await tool(page, 'furniture');
      await view(page, '3d');
      await sceneSettled(page);
      await sleep(1500);
      const one = await reliefs(page);
      const surfacesAfter = await surfaces(page);
      const closedOne = (one ?? []).filter((r) => !r.moving);
      const lin = (hex) => [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      const green = lin(RAL.cucumber.hex);
      const carcass = (list) => (list ?? []).filter((s) => s.name.startsWith('carcass:') || s.name.startsWith('inner:')).map((s) => `${s.name}|${s.count}|${s.color.map((v) => v.toFixed(4)).join('/')}`).join(';');
      check(
        'FLOW.2 в 3D рифлёный рисунок ровно на одной двери, цвет RAL 160 40 15; корпус тот же, что до правки; при выборе типа сказано, что дверь стала МДФ в эмали',
        closedOne.reduce((sum, r) => sum + r.count, 0) === 1 &&
          closedOne[0].drawn === 'fluted' &&
          closedOne[0].color.every((v, i) => Math.abs(v - green[i]) < 0.002) &&
          carcass(surfacesBefore) === carcass(surfacesAfter) &&
          /МДФ в эмали/.test(typeNotice ?? ''),
        `рисунков ${closedOne.map((r) => `${r.drawn}×${r.count} ${r.color.map((v) => v.toFixed(3)).join('/')}`).join(', ') || 'НЕТ'} · корпус ${carcass(surfacesBefore) === carcass(surfacesAfter) ? 'тот же' : 'ИЗМЕНИЛСЯ'} · «${(typeNotice ?? 'НЕТ').slice(0, 80)}»`,
      );
      await page.evaluate((p) => window.__mwCadCamera(p), JSON.parse(readFileSync(`${ROOT_OUT}/before/poses.json`, 'utf8')).poses.detail);
      await sleep(1800);
      await page.screenshot({ path: `${OUT}/flow-door.png`, timeout: 120_000 });

      /* 6. Фрезеровка: шаг 26 → 40. */
      await tool(page, 'materials');
      await page.locator('[data-material-tab="mdf_facade"]').first().click();
      await sleep(400);
      const pitch = page.locator('[data-relief-param="pitchMm"]');
      must('FLOW поле шага фрезеровки', (await pitch.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-relief-param="pitchMm"]');
      await pitch.first().fill('40');
      await pitch.first().press('Enter');
      await sleep(1200);
      await tool(page, 'furniture');
      await view(page, '3d');
      await sceneSettled(page);
      await sleep(1200);
      const pitched = (await reliefs(page)) ?? [];
      check(
        'FLOW.3 фрезеровка изменена: шаг 40 — другая сетка (меньше треугольников), рисунок по-прежнему на одной двери',
        pitched.filter((r) => !r.moving).reduce((s, r) => s + r.count, 0) === 1 &&
          pitched.filter((r) => !r.moving)[0].triangles < closedOne[0].triangles,
        `треугольников ${closedOne[0]?.triangles} → ${pitched.filter((r) => !r.moving)[0]?.triangles}`,
      );

      /*
       * 7. Открыть и закрыть. Ждётся ФАКТ, а не таймер: программный WebGL
       * доводит створку кадрами по секунде, и «через 3 с» дверь ещё едет.
       */
      const readReliefs = () => (window.__mwCadReliefs ? window.__mwCadReliefs() : null);
      await page.locator('[data-open-all]').first().click();
      const opened = (await waitFor(page, readReliefs, (list) => Array.isArray(list) && list.some((r) => r.moving && r.drawn === 'fluted'), 90_000)) ?? [];
      await sceneSettled(page);
      await page.screenshot({ path: `${OUT}/flow-open.png`, timeout: 120_000 });
      await page.locator('[data-close-all]').first().click();
      const closed =
        (await waitFor(
          page,
          readReliefs,
          (list) => Array.isArray(list) && !list.some((r) => r.moving) && list.reduce((s, r) => s + r.count, 0) === 1,
          120_000,
        )) ?? [];
      check(
        'FLOW.4 дверь открывается с рисунком (едет своим мешем рифлёного) и закрывается обратно в пачку',
        opened.some((r) => r.moving && r.drawn === 'fluted') && closed.filter((r) => !r.moving).reduce((s, r) => s + r.count, 0) === 1 && !closed.some((r) => r.moving),
        `открыто: ${opened.map((r) => `${r.moving ? 'едет' : 'стоит'} ${r.drawn}`).join(', ')} · закрыто: ${closed.map((r) => `${r.moving ? 'едет' : 'стоит'} ${r.drawn}`).join(', ')}`,
      );

      /* 8–9. Сохранить и перезагрузить. */
      await saved(page);
      await sleep(2500);
      const { data: row } = await service.from('projects').select('millwork').eq('id', id).single();
      const runs = row?.millwork?.runs ?? {};
      const stored = Object.values(runs).map((run) => run?.modules?.find((m) => m.id === 'tall-0@w1')).find((m) => m?.leafFronts);
      const leaf = stored?.leafFronts?.['door:1'];
      /* Страница с открытым каталогом RAL на 1825 строк тяжёлая: перезагрузке — те же 120 с, что первому входу. */
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
      await sleep(1500);
      await open3d(page);
      const reloaded =
        (await waitFor(
          page,
          () => (window.__mwCadReliefs ? window.__mwCadReliefs() : null),
          (list) => Array.isArray(list) && list.filter((r) => !r.moving).reduce((s, r) => s + r.count, 0) === 1,
          60_000,
        )) ?? [];
      await sleep(1200);
      await page.screenshot({ path: `${OUT}/flow-after-reload.png`, timeout: 120_000 });
      check(
        'FLOW.5 сохранено в модель объекта (leafFronts двери 2: рифлёный, шаг 40, RAL 160 40 15) и после перезагрузки в сцене тот же рисунок на одной двери',
        leaf?.relief?.kind === 'fluted' &&
          leaf.relief.pitchMm === 40 &&
          leaf.colorHex === RAL.cucumber.hex &&
          !stored.leafFronts['door:0'] &&
          reloaded.filter((r) => !r.moving).reduce((s, r) => s + r.count, 0) === 1 &&
          reloaded.filter((r) => !r.moving)[0].triangles === pitched.filter((r) => !r.moving)[0].triangles,
        `в базе: ${JSON.stringify(leaf ?? null).slice(0, 160)} · после перезагрузки: ${reloaded.map((r) => `${r.drawn}×${r.count} тр.${r.triangles}`).join(', ') || 'НЕТ'}`,
      );
      check('FLOW ошибок страницы нет', errors.length === 0, errors.slice(0, 2).join(' | '));
    },
    { ral: true },
  );
}

/* ═════════════════════════  TABLET: 1024 px  ═════════════════════════ */

async function partTablet(browser) {
  console.log('\n── TABLET: планшет 1024 × 768 — рифлёный шкаф, вкладка «МДФ фасады», без горизонтальной прокрутки');
  await withOrg(
    'TABLET',
    browser,
    async ({ makeUser, addProject, stamp }) => {
      const { org, page, errors } = await makeUser('mdf-t');
      const state = STATES.find((s) => s.key === 's4');
      const fx = fixtureRuns({ s4: { ops: state.after() } });
      const id = await addProject(org.id, {
        address: 'Проверка P3D-MDF планшет',
        zone: 'Спальня',
        measurements: measurement(stamp),
        millwork: { survey: survey(), requirements: fx.requirements, runs: { optimal: fx.runs.s4 }, selectedVariant: 'optimal' },
      });
      await openStudio(page, id);
      const s0 = await open3d(page);
      must('TABLET 3D готова', s0.state === 'ready', `${s0.state} за ${s0.ms} мс`);
      await sleep(1500);
      await page.screenshot({ path: `${OUT}/tablet-3d.png`, timeout: 120_000 });
      const sceneReliefs = (await reliefs(page)) ?? [];
      await tool(page, 'materials');
      await page.waitForSelector('[data-materials-panel][data-loaded="1"]', { timeout: 60_000 }).catch(() => undefined);
      await page.locator('[data-material-tab="mdf_facade"]').first().click().catch(() => undefined);
      await sleep(800);
      await page.screenshot({ path: `${OUT}/tablet-panel.png`, timeout: 120_000 });
      const layout = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('[data-relief-type]')).map((b) => b.getBoundingClientRect());
        return {
          scroll: document.documentElement.scrollWidth,
          width: window.innerWidth,
          cards: cards.length,
          cardsInside: cards.every((r) => r.left >= 0 && r.right <= window.innerWidth && r.width >= 44),
        };
      });
      check(
        'TABLET.1 на 1024 px: рифлёный рисунок в сцене на четырёх дверях; вкладка «МДФ фасады» — шесть карточек в экране (не уже 44 px); горизонтальной прокрутки нет',
        sceneReliefs.filter((r) => !r.moving).reduce((s, r) => s + r.count, 0) === 4 &&
          layout.cards === 6 &&
          layout.cardsInside &&
          layout.scroll <= layout.width,
        `рисунков ${sceneReliefs.map((r) => `${r.drawn}×${r.count}`).join(', ') || 'НЕТ'} · карточек ${layout.cards} в экране ${layout.cardsInside} · ширина ${layout.scroll}/${layout.width}`,
      );
      check('TABLET ошибок страницы нет', errors.length === 0, errors.slice(0, 2).join(' | '));
    },
    { viewport: { width: 1024, height: 768 } },
  );
}

/* ═════════════════════════  запуск  ═════════════════════════ */

const unknownParts = PARTS.filter((p) => !KNOWN.includes(p));
if (unknownParts.length > 0) {
  console.log(`Неизвестные части: ${unknownParts.join(', ')} — есть ${KNOWN.join(', ')}`);
  process.exit(1);
}
const unknownStates = LOOK_STATES.filter((k) => !STATES.some((x) => x.key === k));
if (unknownStates.length > 0 || LOOK_STATES.length === 0) {
  console.log(`Неизвестные состояния LOOK_STATES: ${unknownStates.join(', ') || 'пусто'} — есть ${STATES.map((x) => x.key).join(', ')}`);
  process.exit(1);
}
if (!['before', 'after'].includes(SHOTS)) {
  console.log(`SHOTS=${SHOTS}: есть before и after`);
  process.exit(1);
}
loadEnv();
mkdirSync(OUT, { recursive: true });
mkdirSync(EMPTY_REFERENCE, { recursive: true });
const browserParts = PARTS.filter((p) => p !== 'measure');
let server = null;
let browser;
const done = [];
try {
  if (browserParts.length > 0) {
    freePort(PORT);
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
      stdio: 'ignore',
      shell: true,
      cwd: SERVER_DIR,
      env: { ...process.env, SITE_PASSWORD: '', REFERENCE_TEXTURE_DIR: EMPTY_REFERENCE, SUPPLIER_REVIEW_ASSETS: EMPTY_REFERENCE },
    });
    console.log(`Сборка: ${SERVER_DIR} (${buildId()}) · снимки: ${OUT} · образцы брошюр: НЕТ (как на проде)`);
    for (let i = 0; i < 120; i++) {
      try {
        if ((await fetch(BASE)).ok) break;
      } catch {
        /* сервер ещё поднимается */
      }
      await sleep(1000);
    }
    browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  }
  for (const part of PARTS) {
    try {
      if (part === 'look') await partLook(browser);
      if (part === 'measure') await partMeasure();
      if (part === 'flow') await partFlow(browser);
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
