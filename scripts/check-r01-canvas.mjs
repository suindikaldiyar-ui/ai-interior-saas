/**
 * R01.1 — ПОЯВЛЯЕТСЯ ЛИ 3D-ХОЛСТ STUDIO, ПУТЁМ ЭКРАНА, ПОВТОРНО.
 *
 * Запуск: RUNS=5 FROM=1 node scripts/check-r01-canvas.mjs   (нужен build)
 *
 * В R01 один прогон из пяти не увидел 3D-холст после нажатия «3D» (K5),
 * причина не установлена. Здесь тот же путь, что у R01 до K5, повторяется
 * RUNS раз — каждый раз в НОВОМ браузере и на новом объекте спальни:
 * шкаф «Полки» 1000 × 2400 × 600, «Разделить вертикально», слева 4 полки,
 * справа 0, схема «Каркас», затем «3D» и цикл «Фасад → 3D → Фасад → 3D».
 *
 * По каждому нажатию «3D» пишется шкала времени (опрос каждые 100 мс):
 * какой вид нажат в нижней строке, во что превратилась схема
 * (`data-schematic-view`), заглушка загрузки сцены, холст — число и
 * размеры, контейнер, кадры WebGL (`__mwCadFrames`), сколько модулей и
 * деталей отсеков нарисовано. Плюс ошибки страницы, ошибки консоли,
 * упавшие запросы и ответы ≥ 400, потеря контекста WebGL.
 *
 * ГОТОВО — это холст с ненулевым размером, хотя бы один отрисованный кадр
 * и пять деталей отсеков (4 полки + перегородка) в нарисованной сцене.
 * Не готово за 60 с — FAIL, снимок и трейс Playwright в `.capture-check/r01-1/`.
 *
 * Организация, пользователь и объекты заводятся служебным ключом и
 * удаляются в конце; уборка проверяется чтением. Инструмент диагностики,
 * в `verify` не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = 3255;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/r01-1';
const RUNS = Number(process.env.RUNS ?? 5);
const FROM = Number(process.env.FROM ?? 1);
const READY_MS = 60_000;
/** `runs` — повторные прогоны пути R01; `faults` — отказы нарочно (F1–F3). */
const MODE = process.env.MODE ?? 'runs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, { encoding: 'utf8' });
    for (const line of out.split(/\r?\n/)) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== '0') execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    }
  } catch {
    /* никто не слушает */
  }
}

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
};

function loadEnv() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const WALLS = [3000, 2800, 3000, 2800];
const known = (value) => ({ state: 'measured', value });
const fixture = (stamp) => ({
  survey: {
    ceilingHeightMm: known(2500),
    walls: WALLS.map((lengthMm, i) => ({ id: `w${i + 1}`, lengthMm: known(lengthMm), turn: 'right', turnDeg: 90, openings: [], isRunWall: i === 0 })),
    comms: [],
    photos: [],
    clientNotes: '',
    steps: { ceiling: 'done', walls: 'done', openings: 'todo', comms: 'todo', photos: 'todo' },
    measuredBy: 'проверка R01.1',
    measuredAt: '2026-10-15',
  },
  measurement: {
    id: `m-${stamp}`,
    ceilingHeightMm: 2500,
    walls: WALLS.map((lengthMm, i) => ({ id: `w${i + 1}`, lengthMm, angleDeg: 90, openings: [] })),
    comms: [],
    photos: [],
    measuredBy: 'проверка R01.1',
    measuredAt: '2026-10-15',
    notes: '',
  },
});

/* ─────────────────────────  чтение экрана  ───────────────────────── */

const READ_SAVE = `(() => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null)()`;
const READ_ROW = `(() => {
  const root = document.querySelector('[data-studio-viewport] [data-schematic]');
  if (!root) return null;
  const scope = root.querySelector('[data-wall-block][aria-current="true"]') || root;
  return [...scope.querySelectorAll('[data-module-id]')].map((g) => ({
    id: g.getAttribute('data-module-id'),
    offset: Number(g.getAttribute('data-module-offset')),
    width: Number(g.getAttribute('data-module-width')),
  })).sort((a, b) => a.offset - b.offset);
})()`;
const READ_FILL = `(() => {
  const root = document.querySelector('[data-fill-editor]');
  if (!root) return null;
  return {
    module: root.getAttribute('data-fill-editor'),
    split: root.getAttribute('data-fill-split'),
    chips: [...root.querySelectorAll('[data-bay-chip]')].map((n) => ({
      id: n.getAttribute('data-bay-chip'),
      shelves: Number(n.getAttribute('data-bay-shelves')),
    })),
  };
})()`;

/**
 * Один срез состояния 3D — всё, что нужно, чтобы по шкале времени сказать,
 * где цепочка «нажали 3D → холст → кадр» остановилась.
 */
const PROBE = `(() => {
  const viewport = document.querySelector('[data-studio-viewport]');
  const pressed = document.querySelector('[data-studio-bottombar] [data-studio-view][aria-pressed="true"]');
  const schematic = viewport?.querySelector('[data-schematic]');
  const scene = viewport?.querySelector('[data-scene]');
  const canvases = viewport ? [...viewport.querySelectorAll('canvas')] : [];
  const canvas = canvases[0] ?? null;
  const box = (n) => (n ? (({ width, height }) => [Math.round(width), Math.round(height)])(n.getBoundingClientRect()) : null);
  let frames = null, drawn = null, parts = null;
  try { frames = window.__mwCadFrames ? window.__mwCadFrames() : null; } catch (e) { frames = 'ERR ' + e.message; }
  try { drawn = window.__mwCadModules ? window.__mwCadModules().drawn : null; } catch (e) { drawn = 'ERR ' + e.message; }
  try { parts = window.__mwCadBays ? window.__mwCadBays().parts.length : null; } catch (e) { parts = 'ERR ' + e.message; }
  return {
    sceneState: scene?.getAttribute('data-scene-state') ?? null,
    failure: scene?.querySelector('[data-scene-failure-text]')?.textContent ?? null,
    root: Boolean(document.querySelector('[data-studio-root]')),
    pressed: pressed?.getAttribute('data-studio-view') ?? null,
    viewAttr: viewport?.getAttribute('data-view') ?? null,
    schematicView: schematic?.getAttribute('data-schematic-view') ?? null,
    scene: Boolean(scene),
    placeholder: Boolean(scene?.querySelector('.animate-pulse')),
    canvases: canvases.length,
    canvasesInPage: document.querySelectorAll('canvas').length,
    canvas: box(canvas),
    canvasAttr: canvas ? [canvas.width, canvas.height] : null,
    container: box(scene),
    frames,
    drawn,
    parts,
    lost: window.__r011ContextLost ?? 0,
    glFail: window.__r011GlFail ?? 0,
  };
})()`;

/** Холст готов: ненулевой размер, кадр отрисован, 5 деталей отсеков в сцене. */
const isReady = (s) =>
  s.sceneState === 'ready' &&
  s.canvases > 0 &&
  s.canvas &&
  s.canvas[0] > 0 &&
  s.canvas[1] > 0 &&
  typeof s.frames === 'number' &&
  s.frames > 0 &&
  s.parts === 5;

const stateWords = (s) =>
  s
    ? `состояние ${s.sceneState ?? "—"}${s.failure ? ` «${s.failure}»` : ""} · студия ${s.root ? "жива" : "УПАЛА"} · нажат ${s.pressed} · схема ${s.schematicView ?? '—'} · [data-scene] ${s.scene} · заглушка ${s.placeholder} · ` +
      `холстов ${s.canvases} (на странице ${s.canvasesInPage}) · холст ${s.canvas?.join('×') ?? '—'} · ` +
      `контейнер ${s.container?.join('×') ?? '—'} · кадров ${s.frames ?? '—'} · модулей ${s.drawn ?? '—'} · ` +
      `деталей ${s.parts ?? '—'} · потерь контекста ${s.lost} · отказов getContext ${s.glFail}`
    : 'нет среза';

async function waitFor(page, script, test, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  let value = await page.evaluate(script);
  while (!test(value) && Date.now() < until) {
    await sleep(200);
    value = await page.evaluate(script);
  }
  return value;
}

async function clickIn(page, selector) {
  const node = page.locator(selector);
  if ((await node.count()) === 0) return false;
  await node.first().click({ timeout: 15_000 });
  await sleep(300);
  return true;
}

async function pointModule(page, id) {
  const box = await page.evaluate((moduleId) => {
    const root = document.querySelector('[data-studio-viewport] [data-schematic]');
    const scope = root?.querySelector('[data-wall-block][aria-current="true"]') || root;
    const g = [...(scope?.querySelectorAll('[data-module-id]') ?? [])].find((n) => n.getAttribute('data-module-id') === moduleId);
    if (!g) return null;
    const r = g.getBoundingClientRect();
    return { x: r.left + r.width * 0.75, y: r.top + r.height * 0.5 };
  }, id);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  await sleep(400);
  return true;
}

async function typeInto(page, selector, value) {
  const input = page.locator(`[data-fill-editor] ${selector}`).first();
  if ((await input.count()) === 0) return false;
  await input.fill(String(value));
  await input.press('Enter');
  await sleep(500);
  return true;
}

/**
 * Нажать «3D» и мерить до готовности. Возвращает шкалу времени: срез при
 * каждом изменении, время до готовности или последний срез при отказе.
 */
async function open3d(page, label) {
  const t0 = Date.now();
  const clicked = await clickIn(page, '[data-studio-bottombar] [data-studio-view="3d"]');
  const timeline = [];
  let last = null;
  let ready = false;
  while (Date.now() - t0 < READY_MS) {
    const s = await page.evaluate(PROBE).catch((e) => ({ error: String(e) }));
    const key = JSON.stringify({ ...s, frames: typeof s.frames === 'number' ? Math.min(s.frames, 1) : s.frames });
    if (key !== last) {
      timeline.push({ ms: Date.now() - t0, ...s });
      last = key;
    }
    if (!s.error && isReady(s)) {
      ready = true;
      break;
    }
    await sleep(100);
  }
  return { label, clicked, ready, ms: Date.now() - t0, timeline, final: timeline[timeline.length - 1] };
}

async function toFacade(page) {
  await clickIn(page, '[data-studio-bottombar] [data-studio-view="facade"]');
  await waitFor(page, `document.querySelector('[data-studio-viewport] [data-schematic]')?.getAttribute('data-schematic-view') ?? null`, (v) => v === 'front', 10_000);
}

/* ─────────────────────────  один прогон  ───────────────────────── */

async function oneRun(n, ctx) {
  const { service, org, cookies } = ctx;
  const stamp = `${Date.now()}-${n}`;
  const room = fixture(stamp);
  const { data: project, error } = await service
    .from('projects')
    .insert({
      org_id: org,
      address: `Проверка R01.1 · прогон ${n}`,
      zone: 'Спальня',
      client_name: 'Проверка',
      measurements: room.measurement,
      millwork: {
        survey: room.survey,
        requirements: {
          appliances: ['fridge', 'oven', 'sink600', 'dishwasher45', 'hob', 'hood'],
          tallSide: 'left',
          options: { hasUpper: true, upperToCeiling: false, hardwareClass: 'standard', countertop: 'ldsp', hasCornice: false, integratedHandles: false },
          zone: 'bedroom',
        },
      },
      status: 'in_progress',
    })
    .select('id')
    .single();
  if (error) throw new Error(`insert project: ${error.message}`);
  ctx.projects.push(project.id);

  /* Холодный старт: новый браузер на каждый прогон. */
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies(cookies);
  await context.tracing.start({ screenshots: true, snapshots: true });
  /* Отказ контекста и его потеря — счётчиками в окне, до загрузки страницы. */
  await context.addInitScript(() => {
    window.__r011ContextLost = 0;
    window.__r011GlFail = 0;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      /* Режим отказов (F2): браузер «не даёт» WebGL новым холстам. */
      if (window.__r011NoGl && /webgl/.test(String(type)) && !this.__r011Had) {
        window.__r011GlFail += 1;
        return null;
      }
      const result = original.call(this, type, ...rest);
      if (result && /webgl/.test(String(type))) this.__r011Had = true;
      if (/webgl/.test(String(type))) {
        if (!result) window.__r011GlFail += 1;
        if (!this.__r011Watched) {
          this.__r011Watched = true;
          this.addEventListener('webglcontextlost', () => {
            window.__r011ContextLost += 1;
          });
        }
      }
      return result;
    };
  });
  const page = await context.newPage();
  const events = [];
  const tNav = Date.now();
  const at = () => Date.now() - tNav;
  page.on('pageerror', (e) => events.push(`${at()} мс pageerror: ${e.message.slice(0, 220)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || /webgl|three|context/i.test(m.text())) events.push(`${at()} мс console.${m.type()}: ${m.text().slice(0, 220)}`);
  });
  page.on('requestfailed', (r) => events.push(`${at()} мс requestfailed: ${r.url().slice(-90)} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => {
    if (r.status() >= 400) events.push(`${at()} мс HTTP ${r.status()}: ${r.url().slice(-90)}`);
  });
  const chunks = [];
  page.on('response', (r) => {
    if (r.url().includes('/_next/static/chunks/')) chunks.push({ ms: at(), url: r.url().split('/').pop(), status: r.status() });
  });

  const marks = {};
  let outcome = { ok: false, why: '' };
  const opens = [];
  try {
    await page.goto(`${BASE}/project/${project.id}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
    marks.studio = at();
    await waitFor(page, READ_SAVE, (v) => v === 'saved', 30_000);
    marks.saved = at();

    /* Путь R01 до K5. */
    await clickIn(page, '[data-studio-rail] [data-studio-tool="furniture"]');
    await clickIn(page, '[data-studio-bottombar] [data-studio-view="facade"]');
    await page.waitForSelector('[data-studio-viewport] [data-schematic]', { timeout: 30_000 });
    let row = await waitFor(page, READ_ROW, (r) => Array.isArray(r) && r.length > 0);
    let shelves = null;
    for (const unit of row ?? []) {
      await pointModule(page, unit.id);
      const label = await page.evaluate(() => document.querySelector('[data-inspector-module] dd')?.textContent?.replace(/\s+/g, ' ').trim() ?? null);
      if (label && /^Полки(\s|$)/.test(label)) {
        shelves = unit;
        break;
      }
    }
    if (!shelves) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: шкафа «Полки» нет · ${JSON.stringify(row)}`);
    for (const unit of row.filter((m) => m.offset > shelves.offset).reverse()) {
      await pointModule(page, unit.id);
      if (!(await clickIn(page, '[data-module-action="remove"]'))) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: «Удалить» у ${unit.id}`);
    }
    await pointModule(page, shelves.id);
    const width = page.locator('label:has-text("Ширина, мм") input').first();
    await width.fill('1000');
    await width.press('Enter');
    row = await waitFor(page, READ_ROW, (r) => r?.find((m) => m.id === shelves.id)?.width === 1000, 15_000);
    if (!(await clickIn(page, '[data-fill-editor] [data-fill-action="split"]'))) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: «Разделить вертикально»');
    await waitFor(page, READ_FILL, (f) => f?.split === 'yes', 10_000);
    await typeInto(page, '[data-bay-count-input]', 4);
    await clickIn(page, '[data-fill-editor] [data-bay-chip="b2"]');
    await typeInto(page, '[data-bay-count-input]', 0);
    await clickIn(page, '[data-fill-editor] [data-bay-chip="b1"]');
    const fill = await waitFor(page, READ_FILL, (f) => f?.chips[0]?.shelves === 4 && f?.chips[1]?.shelves === 0, 10_000);
    if (!(fill?.chips[0]?.shelves === 4 && fill.chips[1]?.shelves === 0)) throw new Error(`отсеки не собрались: ${JSON.stringify(fill)}`);
    await waitFor(page, READ_SAVE, (v) => v === 'saved', 30_000);
    const mode = page.locator('[data-studio-viewport] [data-schematic-mode]');
    if ((await mode.count()) > 0 && (await mode.first().getAttribute('data-schematic-mode')) !== 'frame') await mode.first().click();
    await sleep(300);
    marks.setup = at();
    /* Запись объекта ДО переключений видов — целиком, с отметкой записи. */
    const before = (await ctx.service.from('projects').select('millwork').eq('id', project.id).single()).data?.millwork ?? null;

    /* K5 и цикл: 3D → Фасад → 3D → Фасад → 3D. */
    opens.push(await open3d(page, '3D'));
    for (const label of ['3D после «Фасада» №1', '3D после «Фасада» №2']) {
      await toFacade(page);
      opens.push(await open3d(page, label));
    }
    /* Переключение видов ничего не пишет: ждём дольше паузы автосохранения (2 с) и сверяем. */
    await sleep(3500);
    const after = (await ctx.service.from('projects').select('millwork').eq('id', project.id).single()).data?.millwork ?? null;
    const unchanged = before !== null && JSON.stringify(before) === JSON.stringify(after);
    marks.dbUnchanged = unchanged;
    const bad = opens.filter((o) => !o.ready);
    const why = [
      ...bad.map((o) => `${o.label}: не готово за ${o.ms} мс`),
      ...(unchanged ? [] : [`запись объекта изменилась от переключения видов (savedAt ${before?.savedAt ?? '—'} → ${after?.savedAt ?? '—'})`]),
    ];
    outcome = why.length === 0 ? { ok: true, why: '' } : { ok: false, why: why.join('; ') };
  } catch (error) {
    outcome = { ok: false, why: error instanceof Error ? error.message : String(error) };
  }

  const tag = `run-${String(n).padStart(2, '0')}`;
  if (!outcome.ok) {
    await page.screenshot({ path: `${OUT}/${tag}-FAIL.png` }).catch(() => undefined);
    await context.tracing.stop({ path: `${OUT}/${tag}-trace.zip` }).catch(() => undefined);
  } else {
    await context.tracing.stop().catch(() => undefined);
  }
  const record = { run: n, marks, opens, events, chunksAfterSetup: chunks.filter((c) => c.ms >= (marks.setup ?? Infinity)), outcome };
  writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(record, null, 2));
  await browser.close();

  const line = opens.map((o) => `${o.label} ${o.ready ? `${o.ms} мс` : `НЕТ (${o.ms} мс)`}`).join(' · ');
  check(
    `прогон ${n}: холст готов на каждом «3D» (состояние ready, холст > 0, кадр > 0, 5 деталей), запись не меняется`,
    outcome.ok,
    outcome.ok
      ? `студия ${marks.studio} мс · путь R01 до ${marks.setup} мс · ${line} · запись без изменений`
      : `${outcome.why} · ${line || 'до «3D» не дошли'} · последний срез: ${stateWords(opens.find((o) => !o.ready)?.final)} · события: ${events.slice(0, 4).join(' | ') || 'нет'}`,
  );
  if (!outcome.ok) {
    for (const o of opens.filter((x) => !x.ready)) {
      console.log(`      шкала «${o.label}»:`);
      for (const s of o.timeline) console.log(`        ${s.ms} мс · ${s.error ?? stateWords(s)}`);
    }
  }
  return { n, ok: outcome.ok, opens };
}

/* ─────────────────────────  отказы нарочно  ───────────────────────── */

/**
 * MODE=faults: что видит человек, когда 3D действительно не может.
 *
 *   F1  чанки 3D не приходят с сервера;
 *   F2  браузер не даёт WebGL новому холсту;
 *   F3  видеокарта сбрасывает живую сцену (потеря контекста).
 *
 * В каждом случае Studio обязана остаться живой, у сцены — состояние
 * `failed`, причина словами и «Повторить»; после устранения причины
 * «Повторить» даёт готовую сцену.
 */
async function faults(ctx) {
  const { service, org, cookies } = ctx;
  const stamp = `${Date.now()}-faults`;
  const room = fixture(stamp);
  const { data: project, error } = await service
    .from('projects')
    .insert({
      org_id: org,
      address: 'Проверка R01.1 · отказы',
      zone: 'Спальня',
      client_name: 'Проверка',
      measurements: room.measurement,
      millwork: {
        survey: room.survey,
        requirements: {
          appliances: ['fridge', 'oven', 'sink600', 'dishwasher45', 'hob', 'hood'],
          tallSide: 'left',
          options: { hasUpper: true, upperToCeiling: false, hardwareClass: 'standard', countertop: 'ldsp', hasCornice: false, integratedHandles: false },
          zone: 'bedroom',
        },
      },
      status: 'in_progress',
    })
    .select('id')
    .single();
  if (error) throw new Error(`insert project: ${error.message}`);
  ctx.projects.push(project.id);

  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies(cookies);
  await context.addInitScript(() => {
    window.__r011ContextLost = 0;
    window.__r011GlFail = 0;
    window.__r011NoGl = false;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (window.__r011NoGl && /webgl/.test(String(type)) && !this.__r011Had) {
        window.__r011GlFail += 1;
        return null;
      }
      const result = original.call(this, type, ...rest);
      if (result && /webgl/.test(String(type))) this.__r011Had = true;
      return result;
    };
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 200)));
  /* Что упало и какой чанк не пришёл — чтобы падение Studio имело имя. */
  const trail = [];
  page.on('console', (m) => {
    if (m.type() === 'error') trail.push(`console.error: ${m.text().replace(/\s+/g, ' ').slice(0, 200)}`);
  });
  page.on('requestfailed', (r) => trail.push(`requestfailed: ${r.url().split('/').pop()}`));
  const showTrail = (label) => {
    if (trail.length === 0) return;
    console.log(`      ${label}: ${trail.length} записей`);
    for (const line of trail.splice(0)) console.log(`        ${line}`);
  };

  /** Ждём отказа или готовности сцены; падение Studio — тоже ответ. */
  const settle = async (want, ms = 30_000) => {
    const until = Date.now() + ms;
    let s = await page.evaluate(PROBE).catch((e) => ({ error: String(e) }));
    while (Date.now() < until) {
      if (!s.error && !s.root) break;
      if (!s.error && (want === 'ready' ? isReadyLoose(s) : s.sceneState === 'failed')) break;
      await sleep(200);
      s = await page.evaluate(PROBE).catch((e) => ({ error: String(e) }));
    }
    return s;
  };
  const isReadyLoose = (s) => s.sceneState === 'ready' && s.canvases > 0 && s.canvas?.[0] > 0 && s.canvas?.[1] > 0 && typeof s.frames === 'number' && s.frames > 0;
  const retry = async () => {
    const button = page.locator('[data-studio-viewport] [data-scene-retry]');
    if ((await button.count()) === 0) return false;
    await button.first().click();
    return true;
  };
  const facadeAlive = async () => {
    await toFacade(page);
    return page.evaluate(() => Boolean(document.querySelector('[data-studio-viewport] [data-schematic] [data-module-id]')));
  };

  try {
    await page.goto(`${BASE}/project/${project.id}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
    await waitFor(page, READ_SAVE, (v) => v === 'saved', 30_000);
    await clickIn(page, '[data-studio-rail] [data-studio-tool="furniture"]');
    await clickIn(page, '[data-studio-bottombar] [data-studio-view="facade"]');
    await page.waitForSelector('[data-studio-viewport] [data-schematic]', { timeout: 30_000 });

    /* ── F1: чанки 3D не приходят ── */
    console.log('\n── F1. Чанки 3D не приходят с сервера');
    const block = (route) => route.abort('failed');
    await page.route('**/_next/static/chunks/**', block);
    await clickIn(page, '[data-studio-bottombar] [data-studio-view="3d"]');
    let s = await settle('failed');
    check(
      'F1 Studio жива, у сцены «failed», причина словами и «Повторить»',
      !s.error && s.root && s.sceneState === 'failed' && /не загрузилась/.test(s.failure ?? '') && (await page.locator('[data-scene-retry]').count()) > 0,
      stateWords(s),
    );
    if (!s.root) await page.screenshot({ path: `${OUT}/F1-FAIL.png` }).catch(() => undefined);
    const plaqueFailure = await page.evaluate(() => document.querySelector('[data-pathtrace-failure]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null);
    check(
      'F1 плашка «Рендер» не пришла — отказ назван на её месте, с «Повторить»',
      Boolean(plaqueFailure && /не загрузился/.test(plaqueFailure)) && (await page.locator('[data-pathtrace-retry]').count()) > 0,
      plaqueFailure ?? 'слов на месте плашки нет',
    );
    await page.screenshot({ path: `${OUT}/F1-failed-1440.png` }).catch(() => undefined);
    showTrail('F1 след');
    await page.unroute('**/_next/static/chunks/**', block);
    const retried1 = s.root ? await retry() : false;
    s = await settle('ready');
    check('F1 после восстановления сети «Повторить» даёт готовую сцену', retried1 && isReadyLoose(s), stateWords(s));
    const plaqueRetry = page.locator('[data-pathtrace-retry]');
    if ((await plaqueRetry.count()) > 0) await plaqueRetry.first().click();
    const plaque = await waitFor(page, `Boolean(document.querySelector('[data-scene-render]'))`, (v) => v === true, 15_000);
    check('F1 «Повторить» у плашки возвращает «Рендер»', plaque === true, plaque ? 'плашка на месте' : 'плашки нет');
    check('F1 фасад после отказа на месте', s.root ? await facadeAlive() : false, '');

    /* ── F2: браузер не даёт WebGL ── */
    console.log('\n── F2. Браузер не даёт WebGL');
    await page.evaluate(() => {
      window.__r011NoGl = true;
    });
    await clickIn(page, '[data-studio-bottombar] [data-studio-view="3d"]');
    s = await settle('failed');
    check(
      'F2 Studio жива, у сцены «failed», причина про WebGL словами и «Повторить»',
      !s.error && s.root && s.sceneState === 'failed' && /WebGL/.test(s.failure ?? '') && (await page.locator('[data-scene-retry]').count()) > 0,
      stateWords(s),
    );
    if (!s.root) await page.screenshot({ path: `${OUT}/F2-FAIL.png` }).catch(() => undefined);
    /* Отказ на планшете: слова и «Повторить» видны и на 1024. */
    await page.setViewportSize({ width: 1024, height: 768 });
    await sleep(400);
    await page.screenshot({ path: `${OUT}/F2-failed-1024.png` }).catch(() => undefined);
    const retryBox = await page.locator('[data-scene-retry]').first().boundingBox().catch(() => null);
    check('F2 на 1024 «Повторить» на экране', Boolean(retryBox && retryBox.x >= 0 && retryBox.x + retryBox.width <= 1024 && retryBox.y + retryBox.height <= 768), retryBox ? `${Math.round(retryBox.x)},${Math.round(retryBox.y)} ${Math.round(retryBox.width)}×${Math.round(retryBox.height)}` : 'кнопки нет');
    await page.setViewportSize({ width: 1440, height: 900 });
    await sleep(400);
    await page.evaluate(() => {
      window.__r011NoGl = false;
    });
    const retried2 = s.root ? await retry() : false;
    s = await settle('ready');
    check('F2 WebGL снова есть — «Повторить» даёт готовую сцену', retried2 && isReadyLoose(s), stateWords(s));

    /* ── F3: потеря контекста на живой сцене ── */
    console.log('\n── F3. Видеокарта сбрасывает живую сцену');
    const lostCalled = await page.evaluate(() => {
      const canvas = document.querySelector('[data-studio-viewport] [data-scene] canvas');
      const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
      const ext = gl?.getExtension('WEBGL_lose_context');
      if (!ext) return false;
      ext.loseContext();
      return true;
    });
    s = await settle('failed');
    check(
      'F3 потеря контекста — «failed», причина словами и «Повторить»; Studio жива',
      lostCalled && !s.error && s.root && s.sceneState === 'failed' && /сбросила/.test(s.failure ?? '') && (await page.locator('[data-scene-retry]').count()) > 0,
      `${lostCalled ? '' : 'контекст сбросить не удалось · '}${stateWords(s)}`,
    );
    await page.screenshot({ path: `${OUT}/F3-failed-1440.png` }).catch(() => undefined);
    const retried3 = s.root ? await retry() : false;
    s = await settle('ready');
    check('F3 «Повторить» — новая сцена готова', retried3 && isReadyLoose(s), stateWords(s));
    /* ── F4: первый кадр позже 20 с — это ожидание, а не отказ ── */
    console.log('\n── F4. Первый кадр приходит через 25 с');
    await toFacade(page);
    /* Контейнер сцены без размера: холст 0×0, первого кадра нет, пока размер не вернут. */
    await page.addStyleTag({ content: '[data-scene] { height: 0 !important; min-height: 0 !important; }' });
    await clickIn(page, '[data-studio-bottombar] [data-studio-view="3d"]');
    await sleep(25_000);
    const slow = await page.evaluate(PROBE);
    const slowWords = await page.evaluate(() => document.querySelector('[data-scene-slow]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null);
    check(
      'F4 через 25 с без кадра холст на месте, сцена «loading», а не «failed»; ожидание названо словами, с «Повторить»',
      slow.root && slow.canvases > 0 && slow.sceneState === 'loading' && Boolean(slowWords && /дольше обычного/.test(slowWords)),
      `${stateWords(slow)} · слова: ${slowWords ?? 'нет'}`,
    );
    await page.evaluate(() => {
      for (const style of document.querySelectorAll('style')) if (style.textContent?.includes('[data-scene] { height: 0')) style.remove();
    });
    s = await settle('ready');
    const slowGone = await page.evaluate(() => !document.querySelector('[data-scene-slow]'));
    check('F4 размер вернулся — сцена сама стала готовой, без «Повторить»; слова ожидания ушли', isReadyLoose(s) && slowGone, stateWords(s));

    /* Падение Next до `pageerror` не доходит: жива ли Studio, видно по её корню. */
    const aliveAtEnd = await page.evaluate(() => Boolean(document.querySelector('[data-studio-root]'))).catch(() => false);
    check(
      'F Studio жива в конце, необработанных ошибок страницы нет',
      aliveAtEnd && pageErrors.length === 0,
      `${aliveAtEnd ? 'Studio жива' : 'Studio УПАЛА'} · ошибок страницы ${pageErrors.length}${pageErrors.length ? `: ${pageErrors.slice(0, 2).join(' | ')}` : ''}`,
    );
  } catch (error) {
    check('F сценарий отказов дошёл до конца', false, error instanceof Error ? error.message : String(error));
  } finally {
    await browser.close();
  }
}

/* ─────────────────────────  запуск  ───────────────────────── */

async function main() {
  loadEnv();
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !ANON || !SERVICE || /your-project|example/.test(URL)) {
    check('R01.1: ключи Supabase есть', false, 'НЕ ПРОВЕРЕНО — нет ключей Supabase в .env.local');
    return;
  }
  mkdirSync(OUT, { recursive: true });
  const service = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = Date.now();
  const email = `r011-${stamp}@example.test`;
  const password = `Pw-${stamp}-r011!`;
  const made = { user: null, org: null };
  const ctx = { service, org: null, cookies: [], projects: [] };
  const results = [];
  try {
    const { data: created, error: userError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (userError) throw new Error(`createUser: ${userError.message}`);
    made.user = created.user.id;
    const { data: org, error: orgError } = await service.from('orgs').insert({ slug: `r011-${stamp}`, name: `Проверка R01.1 ${stamp}` }).select('id').single();
    if (orgError) throw new Error(`insert org: ${orgError.message}`);
    made.org = org.id;
    ctx.org = org.id;
    const { error: memberError } = await service.from('org_members').insert({ org_id: org.id, user_id: created.user.id, role: 'owner' });
    if (memberError) throw new Error(`insert member: ${memberError.message}`);
    const jar = [];
    const ssr = createServerClient(URL, ANON, {
      cookies: {
        getAll: () => jar.map(({ name, value }) => ({ name, value })),
        setAll: (list) => {
          for (const cookie of list) {
            const i = jar.findIndex((c) => c.name === cookie.name);
            if (i >= 0) jar.splice(i, 1);
            if (cookie.value) jar.push(cookie);
          }
        },
      },
    });
    const { error: signError } = await ssr.auth.signInWithPassword({ email, password });
    if (signError) throw new Error(`signIn: ${signError.message}`);
    ctx.cookies = jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' }));
    const seed = await fetch(`${BASE}/api/catalog/seed-rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: ctx.cookies.map((c) => `${c.name}=${c.value}`).join('; ') },
      body: JSON.stringify({ orgId: org.id }),
    });
    if (!seed.ok) throw new Error(`типовой прайс не заведён: ${seed.status}`);

    if (MODE === 'faults') await faults(ctx);
    else
      for (let n = FROM; n < FROM + RUNS; n++) {
        console.log(`\n── прогон ${n}`);
        results.push(await oneRun(n, ctx));
      }
  } finally {
    const left = [];
    const remove = async (what, run) => {
      try {
        const { error } = await run();
        if (error) left.push(`${what}: ${error.message}`);
      } catch (error) {
        left.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    for (const id of ctx.projects) await remove(`объект ${id}`, () => service.from('projects').delete().eq('id', id));
    if (made.org) await remove('организация', () => service.from('orgs').delete().eq('id', made.org));
    if (made.user) await remove('пользователь', () => service.auth.admin.deleteUser(made.user));
    if (ctx.projects.length > 0) {
      const { data } = await service.from('projects').select('id').in('id', ctx.projects);
      if ((data ?? []).length > 0) left.push(`объектов осталось ${(data ?? []).length}`);
    }
    if (made.org) {
      const { data } = await service.from('orgs').select('id').eq('id', made.org);
      if ((data ?? []).length > 0) left.push('организация осталась');
    }
    check('временные объекты, организация и пользователь удалены (проверено чтением)', left.length === 0, left.join(' | ') || `удалено, объектов ${ctx.projects.length}`);
  }

  if (MODE === 'faults') return;
  /* Сводка: сколько нажатий «3D», сколько готово, время. */
  const all = results.flatMap((r) => r.opens);
  const times = all.filter((o) => o.ready).map((o) => o.ms).sort((a, b) => a - b);
  const pct = (p) => (times.length ? times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))] : '—');
  console.log(
    `\n  сводка: прогонов ${results.length}, успешных ${results.filter((r) => r.ok).length}; ` +
      `нажатий «3D» ${all.length}, готово ${times.length}; ` +
      `до готовности мин ${times[0] ?? '—'} · медиана ${pct(50)} · p90 ${pct(90)} · макс ${times[times.length - 1] ?? '—'} мс`,
  );
  check(`прогонов столько, сколько заказано (${RUNS})`, results.length === RUNS, `${results.length} из ${RUNS}`);
}

freePort(PORT);
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
  env: { ...process.env, SITE_PASSWORD: '' },
});
try {
  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    try {
      up = (await fetch(BASE)).ok;
    } catch {
      /* поднимается */
    }
    if (!up) await sleep(1000);
  }
  if (!up) throw new Error(`сервер на ${BASE} не поднялся за 120 с`);
  await main();
} catch (error) {
  failed += 1;
  console.log(`  FAIL ${error instanceof Error ? error.message : String(error)}`);
} finally {
  server.kill();
  try {
    execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' });
  } catch {
    /* уже остановлен */
  }
  freePort(PORT);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
