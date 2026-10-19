/**
 * ПРИЁМКА P3D-LDSP В БРАУЗЕРЕ: как ЛДСП выглядит в 3D — числами и снимками
 * с ОДНОЙ камеры «до» и «после».
 *
 * Запуск (после `npm run build`):
 *   FIXTURE=<ряд спальни json> node scripts/check-ldsp-look.mjs
 * PART=look|flow — по частям; LOOK_STATES=h1113-w1000,h1180,w1000 — какие
 * состояния снимает look (по одному-два, чтобы прогон укладывался в 600 с:
 * снимки и числа копятся в measure.json той же сборки, сверки LDSP.1–4 идут,
 * когда в нём есть все три); SHOTS=before|after — папка снимков
 * (.capture-check/ldsp-look/<SHOTS>/); SERVER_DIR=<сборка> — чья сборка.
 *
 * ПРОД ИМИТИРУЕТСЯ всегда: папка образцов из брошюр подменена ПУСТОЙ
 * (`REFERENCE_TEXTURE_DIR`), как на Vercel, где их нет (права не
 * подтверждены, в git их нет). Что видно здесь — видно и на проде.
 *
 *   look  три состояния (фасады H1113 + корпус W1000 · всё H1180 · всё W1000),
 *         у каждого пять кадров с одной камеры: общий вид, фасад крупно,
 *         корпус крупно, открытые двери, нутро крупно. По пикселям кадра
 *         меряется: есть ли рисунок (разброс яркости и направленность
 *         волокна), белое ли белое, нет ли чёрных пятен.
 *   flow  выбор H1113 на фасады и W1000 на корпус в панели → сохранить →
 *         перезагрузить → тот же рисунок; карточка честно говорит, что в 3D
 *         демонстрационный рисунок, а не текстура EGGER.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_LDSP ?? 3281);
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS ?? 'after';
const OUT = `.capture-check/ldsp-look/${SHOTS}`;
const SERVER_DIR = resolve(process.env.SERVER_DIR ?? '.');
const EMPTY_REFERENCE = resolve('.capture-check/ldsp-look/empty-reference');
const PARTS = (process.env.PART ?? 'look,flow').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['look', 'flow'];
const LOOK_STATES = (process.env.LOOK_STATES ?? 'h1113-w1000,h1180,w1000').split(',').map((s) => s.trim()).filter(Boolean);
const BUILD_ID = (() => {
  try {
    return readFileSync(resolve(SERVER_DIR, '.next/BUILD_ID'), 'utf8').trim();
  } catch {
    throw new Error(`нет сборки в ${SERVER_DIR}/.next — сначала npm run build`);
  }
})();
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
  measuredBy: 'P3D-LDSP',
  measuredAt: '2026-10-19',
});
const measurement = (stamp) => ({
  id: `m-${stamp}`,
  ceilingHeightMm: CEILING,
  walls: WALLS.map((l, i) => ({ id: `w${i + 1}`, lengthMm: l, angleDeg: 90, openings: [] })),
  comms: [],
  photos: [],
  measuredBy: 'P3D-LDSP',
  measuredAt: '2026-10-19',
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

/** Позиция панели по артикулу: цель, вкладка ЛДСП, EGGER, поиск, нажатие. */
async function applyItem(page, target, article) {
  const open = await page.locator('[data-materials-panel]').first().isVisible().catch(() => false);
  if (!open && !(await tool(page, 'materials'))) return 'НУЛЕВОЙ СЕЛЕКТОР: инструмента «Материалы» нет';
  await page.waitForSelector('[data-materials-panel][data-loaded="1"]', { timeout: 30_000 }).catch(() => undefined);
  await page.locator('[data-material-target]').first().waitFor({ state: 'attached', timeout: 30_000 }).catch(() => undefined);
  const targetButton = page.locator(`[data-material-target="${target}"]`);
  if ((await targetButton.count()) === 0) return `НУЛЕВОЙ СЕЛЕКТОР: цели «${target}» в панели нет`;
  await targetButton.first().click();
  await page.locator('[data-material-tab="ldsp"]').first().click().catch(() => undefined);
  await page.locator('[data-material-brand="EGGER"]').first().click().catch(() => undefined);
  await page.locator('[data-material-search]').first().fill(article);
  await sleep(600);
  const row = page.locator(`[data-material-item="${article}"]`);
  await row.first().waitFor({ state: 'attached', timeout: 20_000 }).catch(() => undefined);
  if ((await row.count()) === 0) return `НУЛЕВОЙ СЕЛЕКТОР: позиции ${article} в списке нет`;
  await row.first().click();
  await sleep(1500);
  const notice = await page.locator('[data-material-notice]').first().textContent().catch(() => null);
  return notice && /не идёт|нет|не найден/.test(notice) ? `отказ: ${notice}` : null;
}

/** Поверхности ЛДСП в сцене: фасады, корпус, нутро — с чем нарисованы. */
const surfaces = (page) => page.evaluate(() => (window.__mwCadSurfaces ? window.__mwCadSurfaces() : null));
const describe = (list, prefix) =>
  (list ?? [])
    .filter((s) => s.name.startsWith(prefix) && s.count > 0)
    .map((s) => `${s.name.slice(0, 34)} → ${s.map ? String(s.map).split('file=').pop().slice(0, 48) : 'цвет без карты'}`)
    .slice(0, 3)
    .join(' | ') || `нет «${prefix}»`;

/* ─────────────────────────  пиксели кадра  ───────────────────────── */

/**
 * ЧТО ВИДНО НА КАДРЕ — числами. Кусок холста сцены вокруг центра кадра:
 *   contrast  — разброс яркости (sRGB 0…255): ровная заливка даёт 1–3,
 *               рисунок дерева — десятки;
 *   grain     — во сколько раз яркость меняется поперёк вертикали сильнее,
 *               чем вдоль: вертикальное волокно даёт > 1.3, заливка ~1;
 *   L         — светлота CIELAB средней точки: белое ЛДСП обязано быть > 85;
 *   black     — доля почти чёрных пикселей (яркость < 18).
 */
async function pixels(page, file, box = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 }) {
  const rect = await page.evaluate(() => {
    const c = document.querySelector('[data-studio-viewport] [data-scene] canvas');
    const r = c?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  });
  if (!rect) return null;
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
  for (let j = 1; j < info.height - 1; j += 1) {
    for (let i = 1; i < info.width - 1; i += 1) {
      const k = j * info.width + i;
      gx += Math.abs(lum[k + 1] - lum[k - 1]);
      gy += Math.abs(lum[k + info.width] - lum[k - info.width]);
    }
  }
  const rgb = [sr / n, sg / n, sb / n];
  const lin = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const L = y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
  return {
    contrast: Math.round(std * 10) / 10,
    grain: Math.round((gx / Math.max(1, gy)) * 100) / 100,
    L: Math.round(L * 10) / 10,
    black: Math.round((black / n) * 1000) / 10,
    hex: `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`,
  };
}

/* ─────────────────────────  организация  ───────────────────────── */

async function withOrg(label, browser, body) {
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', sameSite: 'Lax' })));
    const page = await context.newPage();
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160));
    });
    const seeded = await page.request.post(`${BASE}/api/catalog/seed-rates`, { data: { orgId: org.id } });
    if (!seeded.ok()) throw new Error(`типовой прайс не заведён: ${seeded.status()}`);
    const imported = await page.request.post(`${BASE}/api/catalog/materials`, { data: { orgId: org.id, collections: REVIEW, confirm: true } });
    if (!imported.ok()) throw new Error(`EGGER не загружен: ${imported.status()}`);
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

const fixture = () => {
  const path = process.env.FIXTURE;
  if (!path || !existsSync(path)) throw new Stop(`нет приспособления ряда: FIXTURE=${path ?? '—'}`);
  return JSON.parse(readFileSync(path, 'utf8'));
};

/* ═════════════════════════  LOOK: три состояния, пять кадров  ═════════════════════════ */

const STATES = [
  { key: 'h1113-w1000', title: 'фасады EGGER H1113 ST10, корпус W1000', fronts: 'EGGER-H1113-ST10', carcass: 'EGGER-W1000-ST9', wood: true, frontHex: 'aa8763', carcassHex: null },
  { key: 'h1180', title: 'всё EGGER H1180 ST37', fronts: 'EGGER-H1180-ST37', carcass: 'EGGER-H1180-ST37', wood: true, frontHex: 'b89771', carcassHex: 'b89771' },
  { key: 'w1000', title: 'всё белое ЛДСП W1000 ST9', fronts: 'EGGER-W1000-ST9', carcass: 'EGGER-W1000-ST9', wood: false, frontHex: null, carcassHex: null },
];

/** Рисунок на пачке: адрес демонстрационного рисунка с цветом декора, или `null` — без карты. */
const mapsOn = (list, prefix) => (list ?? []).filter((s) => s.name.startsWith(prefix) && s.count > 0).map((s) => s.map);
const demoOf = (hex) => (map) => typeof map === 'string' && map.startsWith('procedural:wood?') && map.includes(`hex=${hex}`);
/** Ждать, пока на пачке встанет нужное: рисунок считает фоновый поток, плитка 2048² — секунды. */
const surfacesWhen = (page, test, ms = 30_000) =>
  waitFor(page, () => (window.__mwCadSurfaces ? window.__mwCadSurfaces() : null), (list) => Array.isArray(list) && test(list), ms);

/**
 * КАДРЫ С ОДНОЙ КАМЕРЫ. Позы считаются от габарита мебели, который отдаёт
 * сама сцена, — у «до» и «после» он один (геометрия не менялась).
 */
function poses(info) {
  const [cx, , cz] = info.bounds.center;
  const [sx, sy, sz] = info.bounds.size;
  const front = cz + sz / 2;
  /* Середина левой створки первого шкафа (900 мм, две створки): в кадре одна дверь, без щели и ручек. */
  const leftDoorX = cx - sx / 2 + 0.2;
  const right = cx + sx / 2;
  return {
    general: { position: info.position, target: info.target },
    front: { position: [leftDoorX + 0.05, 1.3, front + 0.8], target: [leftDoorX, 1.3, front] },
    carcass: { position: [right + 0.75, 1.25, cz + 0.6], target: [right, 1.05, cz + 0.05] },
    inside: { position: [leftDoorX + 0.6, Math.min(1.5, sy * 0.6), front + 1.05], target: [leftDoorX + 0.6, Math.min(1.3, sy * 0.5), cz] },
  };
}

async function partLook(browser) {
  console.log('\n── LOOK: три состояния ЛДСП, пять кадров с одной камеры, прод (без образцов брошюр)');
  const fx = fixture();
  const report = {};
  /*
   * ПОЗЫ — ОДНИ НА ВСЕ СОСТОЯНИЯ И НА «ДО» И «ПОСЛЕ». У второго состояния
   * «Общий вид» уже нажат, и камера осталась бы там, где её оставил прошлый
   * кадр (так «общий вид» H1180 вышел крупным планом щели). Общий вид —
   * поза ПЕРВОГО состояния; «после» берёт позы из папки «до» (poses.json),
   * и габарит мебели обязан совпасть: геометрия не менялась.
   */
  const beforeFile = SHOTS !== 'before' ? '.capture-check/ldsp-look/before/poses.json' : `${OUT}/poses.json`;
  const before = existsSync(beforeFile) ? JSON.parse(readFileSync(beforeFile, 'utf8')) : null;
  let fixed = before ? before.poses : null;
  let fixedBounds = before ? before.bounds : null;
  console.log(`  ·    позы камеры: ${before ? `из ${beforeFile}` : 'от первого состояния этого прогона'}`);
  await withOrg('LOOK', browser, async ({ makeUser, addProject, stamp }) => {
    const { org, page, errors, consoleErrors } = await makeUser('ldsp-l');
    const id = await addProject(org.id, {
      address: 'Проверка P3D-LDSP спальня',
      zone: 'Спальня',
      measurements: measurement(stamp),
      millwork: { survey: survey(), requirements: fx.requirements, runs: { optimal: fx.run }, selectedVariant: 'optimal' },
    });
    await openStudio(page, id);
    const s0 = await open3d(page);
    must('LOOK 3D готова', s0.state === 'ready', `${s0.state} за ${s0.ms} мс`);
    await saved(page);

    for (const state of STATES.filter((x) => LOOK_STATES.includes(x.key))) {
      for (const [target, article] of [['fronts', state.fronts], ['carcass', state.carcass]]) {
        const said = await applyItem(page, target, article);
        must(`LOOK ${state.key}: «${target}» ← ${article}`, said === null, said ?? '');
      }
      await saved(page);
      await tool(page, 'furniture');
      await view(page, '3d');
      await sceneSettled(page);
      await preset(page, 'design');
      await angle(page, 'iso');
      /* Рисунок дерева — данными потока: снимать, когда он встал на фасады и корпус. */
      const surfacesReady = (list) =>
        Array.isArray(list) &&
        (state.frontHex ? mapsOn(list, 'front:').some(demoOf(state.frontHex)) : mapsOn(list, 'front:').every((m) => m === null)) &&
        (state.carcassHex ? mapsOn(list, 'carcass:').some(demoOf(state.carcassHex)) : mapsOn(list, 'carcass:').every((m) => m === null));
      const ready = await surfacesWhen(page, surfacesReady);
      /* Ожидание отдаёт последнее прочитанное и по таймауту — условие проверяется заново. */
      check(
        `LOOK ${state.key}: поверхности готовы — фасады и корпус тем, чем должны (рисунок или ровный цвет)`,
        surfacesReady(ready),
        Array.isArray(ready) ? `за 30 с: ${describe(ready, 'front:')} · ${describe(ready, 'carcass:')}` : 'НУЛЕВОЙ СЕЛЕКТОР: __mwCadSurfaces нет',
      );
      await sleep(600);
      const info = await page.evaluate(() => (window.__mwCadCamera ? window.__mwCadCamera() : null));
      must(`LOOK ${state.key}: камера читается (__mwCadCamera)`, Boolean(info), 'НУЛЕВОЙ СЕЛЕКТОР: __mwCadCamera нет — общий вид без орбиты?');
      const light = await page.evaluate(() => (window.__mwCadLight ? window.__mwCadLight() : null));
      console.log(`  ·    свет: ${light ? JSON.stringify(light) : 'нет __mwCadLight (сборка до P3D-LDSP)'} · открытая сторона ${JSON.stringify(info.open)}`);
      if (!fixed) {
        fixed = poses(info);
        fixedBounds = info.bounds;
        writeFileSync(`${OUT}/poses.json`, JSON.stringify({ bounds: info.bounds, poses: fixed }, null, 1));
      }
      const drift = Math.max(
        ...[0, 1, 2].map((i) => Math.abs(info.bounds.center[i] - fixedBounds.center[i])),
        ...[0, 1, 2].map((i) => Math.abs(info.bounds.size[i] - fixedBounds.size[i])),
      );
      must(`LOOK ${state.key}: габарит мебели тот же, что у поз камеры (расхождение ≤ 1 мм)`, drift <= 0.001, `${(drift * 1000).toFixed(1)} мм`);
      const pose = fixed;
      const shotsOf = {};
      for (const [name, at] of [['general', pose.general], ['front', pose.front], ['carcass', pose.carcass]]) {
        await page.evaluate((p) => window.__mwCadCamera(p), at);
        await sleep(1800);
        const file = `${OUT}/${state.key}-${name}.png`;
        await page.screenshot({ path: file });
        shotsOf[name] = await pixels(page, file, name === 'general' ? { x: 0.35, y: 0.3, w: 0.3, h: 0.4 } : { x: 0.3, y: 0.25, w: 0.4, h: 0.5 });
      }
      /* Чем нарисовано — пока двери закрыты: открытая створка едет своим мешем. */
      const list = await surfaces(page);
      await page.locator('[data-open-all]').first().click().catch(() => undefined);
      await sleep(2500);
      for (const [name, at] of [['open', pose.general], ['inside', pose.inside]]) {
        await page.evaluate((p) => window.__mwCadCamera(p), at);
        await sleep(1800);
        const file = `${OUT}/${state.key}-${name}.png`;
        await page.screenshot({ path: file });
        shotsOf[name] = await pixels(page, file, { x: 0.3, y: 0.25, w: 0.4, h: 0.5 });
      }
      await page.locator('[data-close-all]').first().click().catch(() => undefined);
      await sleep(1500);
      report[state.key] = {
        shots: shotsOf,
        fronts: describe(list, 'front:'),
        carcass: describe(list, 'carcass:'),
        inner: describe(list, 'inner:'),
        maps: { front: mapsOn(list, 'front:'), carcass: mapsOn(list, 'carcass:'), inner: mapsOn(list, 'inner:') },
      };
      console.log(`  ·    ${state.title}: фасады ${report[state.key].fronts} · корпус ${report[state.key].carcass}`);
      for (const [name, m] of Object.entries(shotsOf)) {
        console.log(`  ·      ${name.padEnd(8)} контраст ${m?.contrast} · волокно ${m?.grain} · L* ${m?.L} · чёрного ${m?.black}% · ${m?.hex}`);
      }
    }

    /*
     * ЧИСЛА КОПЯТСЯ ПО СБОРКЕ. Части прогона снимают по одному-два состояния;
     * сверки между состояниями идут, когда в measure.json ЭТОЙ сборки есть
     * все три. Чужая сборка в файле не смешивается — файл начинается заново.
     */
    const file = `${OUT}/measure.json`;
    const stored = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    const merged = { build: BUILD_ID, states: { ...(stored?.build === BUILD_ID ? stored.states : {}), ...report } };
    writeFileSync(file, JSON.stringify(merged, null, 1));
    const missing = STATES.map((x) => x.key).filter((k) => !merged.states[k]);
    check('LOOK ошибок страницы нет', errors.length === 0, errors.slice(0, 2).join(' | '));
    const textureErrors = consoleErrors.filter((e) => /не загрузил|не посчитан|упал/.test(e));
    check('LOOK в консоли нет ошибок загрузки текстур (на проде образцов нет — и это не шум)', textureErrors.length === 0, `${textureErrors.length}: ${textureErrors.slice(0, 2).join(' | ')}`);
    if (missing.length > 0) {
      console.log(`  ·    LDSP.1–4 ОТЛОЖЕНЫ: в ${file} (сборка ${BUILD_ID}) нет состояний ${missing.join(', ')} — снимите их LOOK_STATES=${missing.join(',')}`);
      return;
    }
    const h1113 = merged.states['h1113-w1000'];
    const h1180 = merged.states.h1180;
    const white = merged.states.w1000;
    check(
      'LDSP.1 древесный рисунок ВИДЕН на фасаде крупно: H1113 и H1180 — разброс яркости ≥ 8, волокно вертикальное (≥ 1.25); у белого W1000 рисунка нет (разброс < 6)',
      h1113.shots.front.contrast >= 8 && h1113.shots.front.grain >= 1.25 && h1180.shots.front.contrast >= 8 && h1180.shots.front.grain >= 1.25 && white.shots.front.contrast < 6,
      `H1113 ${h1113.shots.front.contrast}/${h1113.shots.front.grain} · H1180 ${h1180.shots.front.contrast}/${h1180.shots.front.grain} · W1000 ${white.shots.front.contrast}/${white.shots.front.grain}`,
    );
    check(
      'LDSP.2 корпус крупно (боковина H1180): рисунок виден и волокно вдоль высоты',
      h1180.shots.carcass.contrast >= 8 && h1180.shots.carcass.grain >= 1.25,
      `H1180 боковина ${h1180.shots.carcass.contrast}/${h1180.shots.carcass.grain}`,
    );
    check(
      'LDSP.3 белое ЛДСП W1000 белое, а не серое: L* фасада крупно ≥ 85',
      white.shots.front.L >= 85,
      `L* ${white.shots.front.L} (${white.shots.front.hex})`,
    );
    /*
     * НЕЗАВИСИМО НА ФАСАДАХ И КОРПУСЕ: у каждой поверхности своё — фасады H1113
     * рисунком в цвет H1113 при белом корпусе без рисунка; всё H1180 — рисунок
     * в цвет H1180 и там, и там; белое W1000 — без карты нигде.
     */
    const all = (list, test) => Array.isArray(list) && list.length > 0 && list.every(test);
    check(
      'LDSP.5 поверхности независимы и честны: H1113 + W1000 — фасады рисунком H1113, корпус ровным W1000; H1180 — рисунком H1180 и фасады, и корпус; W1000 — без карты нигде',
      all(h1113.maps?.front, demoOf('aa8763')) &&
        all(h1113.maps?.carcass, (m) => m === null) &&
        all(h1180.maps?.front, demoOf('b89771')) &&
        all(h1180.maps?.carcass, demoOf('b89771')) &&
        all(white.maps?.front, (m) => m === null) &&
        all(white.maps?.carcass, (m) => m === null),
      `H1113: ${h1113.fronts} · ${h1113.carcass} | H1180: ${h1180.fronts} · ${h1180.carcass} | W1000: ${white.fronts} · ${white.carcass}`,
    );
    check(
      'LDSP.4 открытые двери: нутро не чёрное — почти чёрных пикселей ≤ 3 % во всех трёх состояниях',
      [h1113, h1180, white].every((r) => r.shots.inside.black <= 3),
      [h1113, h1180, white].map((r) => `${r.shots.inside.black}%`).join(' · '),
    );
  });
}

/* ═════════════════════════  FLOW: выбор → сохранить → перезагрузить  ═════════════════════════ */

async function partFlow(browser) {
  console.log('\n── FLOW: H1113 на фасады, W1000 на корпус → сохранить → перезагрузить; карточка говорит правду');
  const fx = fixture();
  await withOrg('FLOW', browser, async ({ service, makeUser, addProject, stamp }) => {
    const { org, page, errors } = await makeUser('ldsp-f');
    const id = await addProject(org.id, {
      address: 'Проверка P3D-LDSP поток',
      zone: 'Спальня',
      measurements: measurement(stamp),
      millwork: { survey: survey(), requirements: fx.requirements, runs: { optimal: fx.run }, selectedVariant: 'optimal' },
    });
    await openStudio(page, id);
    await open3d(page);
    await saved(page);
    must('FLOW фасады ← H1113', (await applyItem(page, 'fronts', 'EGGER-H1113-ST10')) === null, 'не лёг');
    /* Образец карточки — демонстрационный рисунок, посчитанный потоком; картинки брошюры нет. */
    await waitFor(page, () => document.querySelector('[data-material-card] [data-demo-wood]')?.getAttribute('data-demo-wood') ?? null, (v) => v === 'ready' || v === 'failed', 20_000);
    const card = await page.evaluate(() => {
      const node = document.querySelector('[data-material-card]');
      return {
        text: node?.textContent ?? '',
        demo: node?.querySelector('[data-demo-wood]')?.getAttribute('data-demo-wood') ?? null,
        brochure: Boolean(node?.querySelector('[data-review-image]')),
        listDemo: document.querySelector('[data-material-item="EGGER-H1113-ST10"]')?.getAttribute('data-demo') ?? null,
        listReference: document.querySelector('[data-material-item="EGGER-H1113-ST10"]')?.getAttribute('data-reference') ?? null,
      };
    });
    await page.locator('[data-material-card]').first().scrollIntoViewIfNeeded().catch(() => undefined);
    await page.screenshot({ path: `${OUT}/flow-card.png` });
    check(
      'FLOW.1 карточка и строка списка: образец — демонстрационный рисунок (посчитан), картинки брошюры нет; рисунок не выдан за текстуру EGGER; артикул и код декора названы отдельно',
      /демонстрационн/i.test(card.text) &&
        /не текстура/i.test(card.text) &&
        /EGGER-H1113-ST10/.test(card.text) &&
        /H1113 · поверхность ST10/.test(card.text) &&
        card.demo === 'ready' &&
        !card.brochure &&
        card.listDemo === '1' &&
        card.listReference === '',
      `образец ${card.demo ?? 'НЕТ'} · брошюра ${card.brochure ? 'ЕСТЬ' : 'нет'} · строка: рисунок ${card.listDemo} брошюра «${card.listReference}» · ${card.text.slice(0, 200)}`,
    );
    must('FLOW корпус ← W1000', (await applyItem(page, 'carcass', 'EGGER-W1000-ST9')) === null, 'не лёг');
    await saved(page);

    /*
     * СРАВНЕНИЕ С БЕЛЫМ ЛДСП — В КАРТОЧКЕ ФАСАДА, СЦЕНА РЯДОМ. Только вид:
     * в объекте и в смете декор прежний. Снимки «дерево» и «белое» — с одной
     * камеры (общий вид позой из poses.json, если она есть).
     */
    await page.locator('[data-material-target="fronts"]').first().click();
    await sleep(800);
    const fronts = (list) => (list ?? []).filter((s) => s.name.startsWith('front:') && s.count > 0);
    const wood = await surfacesWhen(page, (list) => mapsOn(list, 'front:').some(demoOf('aa8763')));
    const posesFile = existsSync(`${OUT}/poses.json`) ? `${OUT}/poses.json` : '.capture-check/ldsp-look/before/poses.json';
    const general = existsSync(posesFile) ? JSON.parse(readFileSync(posesFile, 'utf8')).poses.general : null;
    if (general) await page.evaluate((p) => window.__mwCadCamera?.(p), general);
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/compare-wood.png` });
    /*
     * Меряется ПОЛОТНО ОДНОЙ ДВЕРИ (общий вид позой из poses.json): в кусок
     * с ручками и щелями попадает тёмная ручка на белом, и разброс у белого
     * выходит больше, чем у дерева, — мерился бы не рисунок, а ручка.
     */
    const DOOR_BOX = { x: 0.26, y: 0.13, w: 0.09, h: 0.3 };
    const woodPixels = await pixels(page, `${OUT}/compare-wood.png`, DOOR_BOX);
    const { data: rowBefore } = await service.from('projects').select('millwork').eq('id', id).single();
    const compare = page.locator('[data-compare-white]');
    must('FLOW кнопка «Сравнить в 3D с белым» в карточке фасада', (await compare.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-compare-white]');
    await compare.first().click();
    const white = await surfacesWhen(page, (list) => fronts(list).every((s) => s.map === null));
    await sleep(1500);
    const note = await page.locator('[data-compare-white-note]').first().isVisible().catch(() => false);
    await page.screenshot({ path: `${OUT}/compare-white.png` });
    const whitePixels = await pixels(page, `${OUT}/compare-white.png`, DOOR_BOX);
    await sleep(2500);
    const { data: rowDuring } = await service.from('projects').select('millwork').eq('id', id).single();
    await compare.first().click();
    const back = await surfacesWhen(page, (list) => mapsOn(list, 'front:').some(demoOf('aa8763')));
    check(
      'FLOW.3 сравнение с белым ЛДСП: фасады дерева показаны белым W1000 без рисунка, на сцене сказано «только вид»; второе нажатие возвращает тот же рисунок',
      mapsOn(wood, 'front:').some(demoOf('aa8763')) && fronts(white).length > 0 && fronts(white).every((s) => s.map === null) && note && mapsOn(back, 'front:').some(demoOf('aa8763')) &&
        JSON.stringify(fronts(back).map((s) => s.map)) === JSON.stringify(fronts(wood).map((s) => s.map)),
      `дерево: ${describe(wood, 'front:')} · белое: ${describe(white, 'front:')} · надпись ${note ? 'есть' : 'НЕТ'} · снова: ${describe(back, 'front:')}`,
    );
    check(
      'FLOW.4 сравнение — только вид: объект в базе тот же до буквы, пока белое на экране',
      JSON.stringify(rowBefore?.millwork) === JSON.stringify(rowDuring?.millwork),
      JSON.stringify(rowBefore?.millwork) === JSON.stringify(rowDuring?.millwork) ? 'тот же' : 'ОБЪЕКТ ИЗМЕНИЛСЯ',
    );
    check(
      'FLOW.5 разница видна на снимках с одной камеры, на полотне одной двери с общего вида: у дерева есть рисунок (разброс ≥ 3 — в 30 раз выше ровной заливки), белое ровное (разброс < 1.5) и светлее минимум на 15 L*',
      (woodPixels?.contrast ?? 0) >= 3 && (whitePixels?.contrast ?? 99) < 1.5 && (whitePixels?.L ?? 0) > (woodPixels?.L ?? 0) + 15,
      `дерево: разброс ${woodPixels?.contrast} L* ${woodPixels?.L} ${woodPixels?.hex} · белое: разброс ${whitePixels?.contrast} L* ${whitePixels?.L} ${whitePixels?.hex}`,
    );

    await tool(page, 'furniture');
    await view(page, '3d');
    await sceneSettled(page);
    await sleep(1200);
    const before = await surfacesWhen(page, (list) => mapsOn(list, 'front:').some(demoOf('aa8763')));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
    await sleep(1500);
    await open3d(page);
    const after = await surfacesWhen(page, (list) => mapsOn(list, 'front:').some(demoOf('aa8763')));
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/flow-after-reload.png` });
    const { data: row } = await service.from('projects').select('millwork').eq('id', id).single();
    const { data: item } = await service.from('catalog_items').select('id').eq('org_id', org.id).eq('article', 'EGGER-H1113-ST10').single();
    const run = row?.millwork?.runs?.optimal;
    check(
      'FLOW.2 сохранено ссылкой на позицию; после перезагрузки на фасадах тот же рисунок (та же карта)',
      (run?.modules ?? []).some((m) => m.front?.itemId === item?.id) &&
        fronts(before).some((s) => s.map) &&
        JSON.stringify(fronts(before).map((s) => s.map)) === JSON.stringify(fronts(after).map((s) => s.map)),
      `до: ${describe(before, 'front:')} · после: ${describe(after, 'front:')}`,
    );
    check('FLOW ошибок страницы нет', errors.length === 0, errors.slice(0, 2).join(' | '));
  });
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
loadEnv();
mkdirSync(OUT, { recursive: true });
mkdirSync(EMPTY_REFERENCE, { recursive: true });
freePort(PORT);
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: true,
  cwd: SERVER_DIR,
  env: { ...process.env, SITE_PASSWORD: '', REFERENCE_TEXTURE_DIR: EMPTY_REFERENCE, SUPPLIER_REVIEW_ASSETS: EMPTY_REFERENCE },
});
let browser;
const done = [];
console.log(`Сборка: ${SERVER_DIR} (${BUILD_ID}) · снимки: ${OUT} · состояния: ${LOOK_STATES.join(', ')} · образцы брошюр: НЕТ (как на проде)`);
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
      if (part === 'look') await partLook(browser);
      if (part === 'flow') await partFlow(browser);
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
