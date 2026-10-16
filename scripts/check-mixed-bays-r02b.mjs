/**
 * R02B — СМЕШАННЫЙ ОТСЕК ШКАФА ПУТЁМ ЭКРАНА: ящики снизу, перегородка,
 * полки или штанга сверху, антресоль — в ОДНОМ отсеке.
 *
 * Запуск: node scripts/check-mixed-bays-r02b.mjs   (нужен build)
 *
 * Объект — как у «Новый объект → Спальня»: зона «Спальня», замер
 * 3000 × 2800 × 3000 × 2800, потолок 2500; организация, пользователь и
 * объект заводятся служебным ключом и удаляются в конце (проверено чтением).
 *
 *   E1  Studio спальни: шкаф «Полки» 1000 × 2400 × 600.
 *   E2  «Разделить вертикально»: слева 4 полки, справа блок из 3 ящиков 450 мм.
 *   E3  отсек 2 → «Разделить горизонтально»: зоны z1 ящики / z2 пусто, в 3D одна
 *       перегородка 476 × 16 × 580 на 466 мм от дна корпуса.
 *   E4  верхняя зона: 2 полки, полка 1 → 1250 (встала на 1248, сказано); ящики на месте.
 *   E5  лист «Каркас» и деталировка: перегородка и полки зоны с ИД, те же мм.
 *   E6  3D: открыть ящик 1, ящик 2, закрыть 1 — 2 открыт; перегородка стоит;
 *       ракурс «Слева».
 *   E7  верхняя зона → «Штанга»: потеря полок названа ДО, «Отмена» ничего не
 *       пишет; подтверждение — штанга на 2284, ящики прежние. «Удалить
 *       перегородку» между ящиками и штангой — потеря названа, «Отмена».
 *   E8  «Добавить антресоль»: зона z3 1884…2384, штанга опустилась до 1768.
 *   E9  отсек 1 → 600: перегородки, штанга и фасады отсека 2 по 352 мм.
 *   E10 перегородка под блоком 450 на 400 мм — отказ с миллиметрами, зоны прежние.
 *   E11 смета: оценка — ящики, штанга и держатели словами; деталировка без короба.
 *   E12 запись в базу, перезагрузка, открытие без записи; разрез в мастере.
 *   E13 1180 × 820, планшет 1024 × 768 касанием, 390 × 844.
 *   E14 «Заменить» у шкафа с зонами: потеря зон названа, «Отмена» — шкаф прежний.
 *
 * Нулевой селектор — FAIL со словами. Снимки — `.capture-check/r02b/`.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = 3257;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/r02b';
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
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}${detail ? `  ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? `  ${detail}` : ''}`);
  }
};

/** Дальше идти бессмысленно: следующее держится на этом. Падение — с причиной. */
class Stop extends Error {}
const must = (name, ok, detail) => {
  check(name, ok, ok ? '' : detail);
  if (!ok) throw new Stop(`${name}: ${detail}`);
};

function loadEnv() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const WALLS = [3000, 2800, 3000, 2800];
const CEILING = 2500;

function fixtureRoom(stamp) {
  const known = (value) => ({ state: 'measured', value });
  return {
    survey: {
      ceilingHeightMm: known(CEILING),
      walls: WALLS.map((lengthMm, i) => ({
        id: `w${i + 1}`,
        lengthMm: known(lengthMm),
        turn: 'right',
        turnDeg: 90,
        openings: [],
        isRunWall: i === 0,
      })),
      comms: [],
      photos: [],
      clientNotes: '',
      steps: { ceiling: 'done', walls: 'done', openings: 'todo', comms: 'todo', photos: 'todo' },
      measuredBy: 'проверка R02B',
      measuredAt: '2026-10-16',
    },
    measurement: {
      id: `m-${stamp}`,
      ceilingHeightMm: CEILING,
      walls: WALLS.map((lengthMm, i) => ({ id: `w${i + 1}`, lengthMm, angleDeg: 90, openings: [] })),
      comms: [],
      photos: [],
      measuredBy: 'проверка R02B',
      measuredAt: '2026-10-16',
      notes: '',
    },
  };
}

/* ─────────────────────────  чтение экрана  ───────────────────────── */

const READ_SAVE = `(() => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null)()`;

const READ_ROW = `(() => {
  const root = document.querySelector('[data-studio-viewport] [data-schematic]');
  if (!root) return null;
  const scope = root.querySelector('[data-wall-block][aria-current="true"]') || root;
  return [...scope.querySelectorAll('[data-module-id]')]
    .map((g) => ({
      id: g.getAttribute('data-module-id'),
      offset: Number(g.getAttribute('data-module-offset')),
      width: Number(g.getAttribute('data-module-width')),
    }))
    .sort((a, b) => a.offset - b.offset);
})()`;

/** Панель «Внутреннее наполнение»: отсеки, отказ, подсказка про систему 32. */
const READ_FILL = `(() => {
  const root = document.querySelector('[data-fill-editor]');
  if (!root) return null;
  return {
    module: root.getAttribute('data-fill-editor'),
    split: root.getAttribute('data-fill-split'),
    chips: [...root.querySelectorAll('[data-bay-chip]')].map((n) => ({
      id: n.getAttribute('data-bay-chip'),
      width: Number(n.getAttribute('data-bay-width')),
      shelves: Number(n.getAttribute('data-bay-shelves')),
      drawers: Number(n.getAttribute('data-bay-drawers')),
      on: n.getAttribute('aria-pressed') === 'true',
    })),
    refusal: root.querySelector('[data-fill-refusal]')?.textContent ?? null,
    snap: root.querySelector('[data-fill-snap]')?.textContent ?? null,
    problems: [...root.querySelectorAll('[data-fill-problem]')].map((n) => n.textContent),
  };
})()`;

/** Горизонтальные зоны выбранного отсека (R02B), сверху вниз. */
const READ_ZONES = `(() => {
  const root = document.querySelector('[data-fill-editor] [data-zones-editor]');
  if (!root) return null;
  const rod = root.querySelector('[data-zone-rod]');
  return {
    bay: root.getAttribute('data-zones-editor'),
    count: Number(root.getAttribute('data-zones')),
    current: root.getAttribute('data-zone-current'),
    zones: [...root.querySelectorAll('[data-bay-zone]')].map((n) => ({
      id: n.getAttribute('data-bay-zone'),
      kind: n.getAttribute('data-zone-kind'),
      from: Number(n.getAttribute('data-zone-from-mm')),
      to: Number(n.getAttribute('data-zone-to-mm')),
      mezz: n.getAttribute('data-zone-mezzanine') === '1',
    })),
    dividers: [...root.querySelectorAll('[data-zone-divider-row]')].map((n) => n.getAttribute('data-zone-divider-row')),
    shelves: [...root.querySelectorAll('[data-zone-shelf-row]')].map((n) => ({ id: n.getAttribute('data-zone-shelf-row'), at: Number(n.getAttribute('data-shelf-at')) })),
    rod: rod ? { id: rod.getAttribute('data-zone-rod'), at: Number(rod.getAttribute('data-rod-at-mm')) } : null,
    rodNote: root.querySelector('[data-zone-rod-note]')?.textContent ?? null,
    removeNote: root.querySelector('[data-zone-remove-note]')?.textContent ?? null,
    mezzNote: root.querySelector('[data-zone-mezz-note]')?.textContent ?? null,
    blocked: root.querySelector('[data-zone-blocked]')?.textContent ?? null,
  };
})()`;
const zonesWords = (z) =>
  z && z.zones.length ? z.zones.map((x) => `${x.id}:${x.kind}${x.mezz ? '*' : ''} ${x.from}…${x.to}`).join(' · ') : 'ЗОН НЕТ';

/** Блок ящиков в панели. */
const READ_STACK = `(() => {
  const root = document.querySelector('[data-fill-editor] [data-drawer-stack]');
  if (!root) return null;
  return {
    id: root.getAttribute('data-drawer-stack'),
    count: Number(root.getAttribute('data-drawer-count')),
    zone: root.getAttribute('data-drawer-zone'),
    drawers: [...root.querySelectorAll('[data-drawer-row]')].map((n) => ({
      id: n.getAttribute('data-drawer-row'),
      front: n.getAttribute('data-drawer-front'),
    })),
  };
})()`;

/** Зоны отсеков на схеме «Каркас»: перегородки, штанги, полки отсека 2 — мм модуля. */
const READ_SHEET_ZONES = `(() => {
  const root = document.querySelector('[data-studio-viewport] [data-schematic]');
  if (!root) return null;
  const a = (n, k) => n.getAttribute(k);
  return {
    dividers: [...root.querySelectorAll('rect[data-bay-divider]')].map((n) => ({
      id: a(n, 'data-bay-divider'), from: Number(a(n, 'data-from-mm')), to: Number(a(n, 'data-to-mm')),
      yFrom: Number(a(n, 'data-y-from-mm')), yTo: Number(a(n, 'data-y-to-mm')),
    })),
    rods: [...root.querySelectorAll('[data-bay-rod]')].map((n) => ({
      id: a(n, 'data-bay-rod'), at: Number(a(n, 'data-at-mm')), from: Number(a(n, 'data-from-mm')), to: Number(a(n, 'data-to-mm')),
    })),
    shelves: [...root.querySelectorAll('line[data-bay-shelf="b2"]')].map((n) => ({ id: a(n, 'data-part-id'), at: Number(a(n, 'data-at-mm')) })),
    drawers: [...root.querySelectorAll('rect[data-bay-drawer]')].map((n) => \`\${a(n, 'data-from-mm')}…\${a(n, 'data-to-mm')}/\${a(n, 'data-y-from-mm')}…\${a(n, 'data-y-to-mm')}\`).sort(),
    selectedZone: root.querySelector('[data-bay-zone-selected]')?.getAttribute('data-bay-zone-selected') ?? null,
  };
})()`;

/** Деталировка: строки модуля. */
const READ_PANELS = `(() => [...document.querySelectorAll('tr[data-panel-row]')].map((n) => ({
  module: n.getAttribute('data-module-id'),
  name: n.children[1]?.textContent?.trim() ?? '',
  size: n.getAttribute('data-part-size'),
  qty: Number(n.getAttribute('data-part-qty')),
  bay: n.getAttribute('data-bay-id'),
  parts: (n.getAttribute('data-part-ids') || '').split(' ').filter(Boolean),
})))()`;

const READ_LOSS = `(() => {
  const d = document.querySelector('[data-bay-loss-dialog]');
  return d ? (d.querySelector('[data-bay-loss-text]')?.textContent?.trim() ?? '') : null;
})()`;

/** Насколько выехал каждый ящик в НАРИСОВАННОЙ сцене, мм. */
const READ_SLIDES = (ids) => `(() => {
  const slide = window.__mwPartSlide;
  if (!slide) return null;
  const out = {};
  for (const id of ${JSON.stringify(ids)}) out[id] = slide(id);
  return out;
})()`;

async function waitFor(page, script, test, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  let value = await page.evaluate(script);
  while (!test(value) && Date.now() < until) {
    await sleep(250);
    value = await page.evaluate(script);
  }
  return value;
}

async function tool(page, key) {
  const button = page.locator(`[data-studio-rail] [data-studio-tool="${key}"]`);
  if ((await button.count()) === 0) return false;
  await button.first().click({ timeout: 15_000 });
  await sleep(400);
  return true;
}

async function view(page, key) {
  const button = page.locator(`[data-studio-bottombar] [data-studio-view="${key}"]`);
  if ((await button.count()) === 0) return false;
  await button.first().click({ timeout: 15_000 });
  await sleep(500);
  return true;
}

/** 3D готова по состоянию сцены (R01.1): «ready» — холст с размером и кадром; «failed» — отказ словами. */
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
const sceneOk = (s) => s.state === 'ready' && Boolean(s.canvas && s.canvas[0] > 0 && s.canvas[1] > 0);
const sceneWords = (s) =>
  `за ${s.ms} мс: состояние ${s.state ?? 'НЕТ'}${s.failure ? ` «${s.failure}»` : ''} · Studio ${s.root ? 'жива' : 'УПАЛА'} · холст ${s.canvas?.join('×') ?? 'НЕТ'}`;

async function saved(page) {
  return waitFor(page, READ_SAVE, (v) => v === 'saved', 30_000);
}

/** Нажать настоящим указателем на модуль на схеме (мышь или касание). */
async function pointModule(page, id, touch = false) {
  const box = await page.evaluate((moduleId) => {
    const root = document.querySelector('[data-studio-viewport] [data-schematic]');
    const scope = root?.querySelector('[data-wall-block][aria-current="true"]') || root;
    const g = [...(scope?.querySelectorAll('[data-module-id]') ?? [])].find((n) => n.getAttribute('data-module-id') === moduleId);
    if (!g) return null;
    const r = g.getBoundingClientRect();
    return { x: r.left + r.width * 0.75, y: r.top + r.height * 0.5 };
  }, id);
  if (!box) return false;
  if (touch) await page.touchscreen.tap(box.x, box.y);
  else await page.mouse.click(box.x, box.y);
  await sleep(400);
  return true;
}

/** Кнопка панели наполнения по признаку — настоящим указателем (касанием на планшете). */
async function press(page, selector, touch = false) {
  const button = page.locator(`[data-fill-editor] ${selector}`);
  if ((await button.count()) === 0) return false;
  await button.first().scrollIntoViewIfNeeded().catch(() => undefined);
  if (touch) await button.first().tap({ timeout: 10_000 });
  else await button.first().click({ timeout: 10_000 });
  await sleep(450);
  return true;
}

async function typeInto(page, selector, value) {
  const input = page.locator(`[data-fill-editor] ${selector}`).first();
  if ((await input.count()) === 0) return false;
  await input.fill(String(value));
  await input.press('Enter');
  await sleep(600);
  return true;
}

/** Детали отсеков модуля из НАРИСОВАННОЙ сцены, мм ряда. */
async function scene3d(page, moduleId) {
  return page.evaluate((id) => {
    const probe = window.__mwCadBays;
    if (!probe) return null;
    const all = probe();
    return { ...all, parts: all.parts.filter((p) => p.partId.startsWith(`${id}:`)) };
  }, moduleId);
}

/** Пересечение двух коробок по трём осям, мм; касание — не пересечение. */
function penetration(a, b) {
  let min = Infinity;
  for (let k = 0; k < 3; k++) {
    const lo = Math.max(a.center[k] - a.size[k] / 2, b.center[k] - b.size[k] / 2);
    const hi = Math.min(a.center[k] + a.size[k] / 2, b.center[k] + b.size[k] / 2);
    min = Math.min(min, hi - lo);
  }
  return min;
}

const framesOf = (page) => page.evaluate(() => window.__mwCadFrames?.() ?? null);

async function toggleDrawer(page, id, touch = false) {
  return press(page, `[data-drawer-toggle="${id}"]`, touch);
}

/** Схема в режиме «Каркас»: наполнение видно, фасады нет. */
async function frameMode(page) {
  const mode = page.locator('[data-studio-viewport] [data-schematic-mode]');
  if ((await mode.count()) > 0 && (await mode.first().getAttribute('data-schematic-mode')) !== 'frame') await mode.first().click();
  await sleep(400);
}

/* ─────────────────────────  сценарий  ───────────────────────── */

async function scenario(browser) {
  loadEnv();
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !ANON || !SERVICE || /your-project|example/.test(URL)) {
    check('R02B: ключи Supabase есть', false, 'НЕ ПРОВЕРЕНО — нет ключей Supabase в .env.local');
    return;
  }
  const service = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = Date.now();
  const email = `r02b-${stamp}@example.test`;
  const password = `Pw-${stamp}-r02b!`;
  const made = { user: null, org: null, project: null };
  mkdirSync(OUT, { recursive: true });
  const savedAtOf = async () =>
    (await service.from('projects').select('millwork').eq('id', made.project).single()).data?.millwork?.savedAt ?? null;
  try {
    const { data: created, error: userError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (userError) throw new Error(`createUser: ${userError.message}`);
    made.user = created.user.id;
    const { data: org, error: orgError } = await service
      .from('orgs')
      .insert({ slug: `r02b-${stamp}`, name: `Проверка R02B ${stamp}` })
      .select('id')
      .single();
    if (orgError) throw new Error(`insert org: ${orgError.message}`);
    made.org = org.id;
    const { error: memberError } = await service.from('org_members').insert({ org_id: org.id, user_id: created.user.id, role: 'owner' });
    if (memberError) throw new Error(`insert member: ${memberError.message}`);

    const jar = [];
    const ssr = createServerClient(URL, ANON, {
      cookies: {
        getAll: () => jar.map(({ name, value }) => ({ name, value })),
        setAll: (list) => {
          for (const cookie of list) {
            const at = jar.findIndex((c) => c.name === cookie.name);
            if (at >= 0) jar.splice(at, 1);
            if (cookie.value) jar.push(cookie);
          }
        },
      },
    });
    const { error: signError } = await ssr.auth.signInWithPassword({ email, password });
    if (signError) throw new Error(`signIn: ${signError.message}`);
    const cookies = jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' }));
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies(cookies);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 200)));
    const seeded = await page.request.post(`${BASE}/api/catalog/seed-rates`, { data: { orgId: org.id } });
    if (!seeded.ok()) throw new Error(`типовой прайс не заведён: ${seeded.status()}`);

    const room = fixtureRoom(stamp);
    const { data: project, error: projectError } = await service
      .from('projects')
      .insert({
        org_id: org.id,
        address: 'Проверка R02B',
        zone: 'Спальня',
        client_name: 'Проверка',
        measurements: room.measurement,
        millwork: {
          survey: room.survey,
          requirements: {
            appliances: ['fridge', 'oven', 'sink600', 'dishwasher45', 'hob', 'hood'],
            tallSide: 'left',
            options: {
              hasUpper: true,
              upperToCeiling: false,
              hardwareClass: 'standard',
              countertop: 'ldsp',
              hasCornice: false,
              integratedHandles: false,
            },
            zone: 'bedroom',
          },
        },
        status: 'in_progress',
      })
      .select('id')
      .single();
    if (projectError) throw new Error(`insert project: ${projectError.message}`);
    made.project = project.id;

    /* ── E1. Шкаф 1000 × 2400 × 600 ── */
    console.log('\n── E1. Studio спальни: шкаф «Полки» 1000 × 2400 × 600');
    await page.goto(`${BASE}/project/${project.id}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 }).catch(() => undefined);
    await saved(page);
    must('E1 инструмент «Мебель»', await tool(page, 'furniture'), 'НУЛЕВОЙ СЕЛЕКТОР: инструмента «Мебель» нет');
    must('E1 вид «Фасад»', await view(page, 'facade'), 'НУЛЕВОЙ СЕЛЕКТОР: вида «Фасад» нет');
    await page.waitForSelector('[data-studio-viewport] [data-schematic]', { timeout: 30_000 }).catch(() => undefined);
    let row = await waitFor(page, READ_ROW, (r) => Array.isArray(r) && r.length > 0, 20_000);
    must('E1 модули спальни на фасаде', Array.isArray(row) && row.length > 0, 'НУЛЕВОЙ СЕЛЕКТОР: модулей на фасаде нет');
    const labelOf = () =>
      page.evaluate(() => document.querySelector('[data-inspector-module] dd')?.textContent?.replace(/\s+/g, ' ').trim() ?? null);
    let placed = null;
    const seen = [];
    for (const unit of row) {
      await pointModule(page, unit.id);
      const label = await labelOf();
      seen.push(`${unit.id}: ${label ?? '—'}`);
      if (label && /^Полки(\s|$)/.test(label)) {
        placed = unit;
        break;
      }
    }
    must('E1 шкаф «Полки» на стене спальни', Boolean(placed), `НУЛЕВОЙ СЕЛЕКТОР: «Полки» не нашлись · ${seen.join(' | ')}`);
    const cabinetId = placed.id;
    for (const unit of row.filter((m) => m.offset > placed.offset).reverse()) {
      await pointModule(page, unit.id);
      const remove = page.locator('[data-module-action="remove"]').first();
      must(`E1 «Удалить» у ${unit.id}`, (await remove.count()) > 0 && (await remove.isEnabled()), `НУЛЕВОЙ СЕЛЕКТОР: кнопки «Удалить» у ${unit.id} нет`);
      await remove.click();
      await sleep(600);
    }
    row = await waitFor(page, READ_ROW, (r) => Array.isArray(r) && !r.some((m) => m.offset > placed.offset), 10_000);
    must('E1 шкаф выбран мышью', await pointModule(page, cabinetId), `НУЛЕВОЙ СЕЛЕКТОР: модуля ${cabinetId} на схеме нет`);
    const width = page.locator('label:has-text("Ширина, мм") input').first();
    must('E1 поле «Ширина, мм»', (await width.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: поля «Ширина, мм» нет');
    await width.fill('1000');
    await width.press('Enter');
    await sleep(800);
    row = await waitFor(page, READ_ROW, (r) => Array.isArray(r) && r.find((m) => m.id === cabinetId)?.width === 1000, 15_000);
    const inspector = await page.evaluate(() => {
      const n = document.querySelector('[data-inspector-module]');
      return n
        ? {
            width: Number(n.getAttribute('data-inspector-width')),
            height: Number(n.getAttribute('data-inspector-height')),
            depth: Number(n.getAttribute('data-inspector-depth')),
          }
        : null;
    });
    must(
      'E1 шкаф 1000 × 2400 × 600 по инспектору',
      inspector && inspector.width === 1000 && inspector.height === 2400 && inspector.depth === 600,
      inspector ? `${inspector.width} × ${inspector.height} × ${inspector.depth}` : 'НУЛЕВОЙ СЕЛЕКТОР: инспектор модуля пуст',
    );

    /* ── E2. Два отсека: слева 4 полки, справа блок из 3 ящиков 450 мм ── */
    console.log('\n── E2. «Разделить вертикально»: слева 4 полки, справа 3 ящика в блоке 450 мм');
    must('E2 «Разделить вертикально»', await press(page, '[data-fill-action="split"]'), 'НУЛЕВОЙ СЕЛЕКТОР: кнопки «Разделить вертикально» нет');
    let fill = await waitFor(page, READ_FILL, (f) => f?.split === 'yes', 10_000);
    must('E2 два отсека по 476 мм', fill?.chips.length === 2 && fill.chips.every((c) => c.width === 476), JSON.stringify(fill?.chips ?? null));
    await typeInto(page, '[data-bay-count-input]', 4);
    await press(page, '[data-bay-chip="b2"]');
    await typeInto(page, '[data-bay-count-input]', 0);
    must('E2 «Добавить блок ящиков» в отсеке 2', await press(page, '[data-drawer-action="add"]'), 'НУЛЕВОЙ СЕЛЕКТОР: кнопки «Добавить блок ящиков» нет');
    await waitFor(page, READ_STACK, (s) => s?.count === 3, 10_000);
    await typeInto(page, '[data-drawer-height-input]', 450);
    let stack = await waitFor(page, READ_STACK, (s) => s?.zone === '0+450', 10_000);
    fill = await page.evaluate(READ_FILL);
    must(
      'E2 отсек 1 — 4 полки, отсек 2 — 3 ящика в блоке 0 + 450: фасады 468 × 146 · 146 · 142',
      fill?.chips[0]?.shelves === 4 && stack?.zone === '0+450' && stack.drawers.map((d) => d.front).join(' ') === '468x146x16 468x146x16 468x142x16',
      `${JSON.stringify(fill?.chips ?? null)} · ${stack ? `${stack.zone} ${stack.drawers.map((d) => d.front).join(' ')}` : 'БЛОКА НЕТ'}`,
    );
    const drawerIds = stack.drawers.map((d) => d.id);
    const frontsBefore = stack.drawers.map((d) => d.front).join(' ');
    await saved(page);
    await page.screenshot({ path: `${OUT}/E2-studio-1440.png` });

    /* ── E3. Разделить отсек 2 горизонтально ── */
    console.log('\n── E3. Отсек 2 → «Разделить горизонтально»: перегородка над блоком ящиков');
    must('E3 «Разделить горизонтально»', await press(page, '[data-zones-editor] [data-zone-action="split"]'), 'НУЛЕВОЙ СЕЛЕКТОР: кнопки «Разделить горизонтально» нет');
    let zones = await waitFor(page, READ_ZONES, (z) => z?.count === 2, 10_000);
    const dividerZ2 = `${cabinetId}:b2:z2:divider`;
    must(
      'E3 зоны сверху вниз: z2 пусто 482…2384, z1 ящики 16…466; перегородка z2; выбрана новая верхняя зона',
      zonesWords(zones) === 'z2:empty 482…2384 · z1:drawers 16…466' && zones.dividers.join() === dividerZ2 && zones.current === 'z2',
      `${zonesWords(zones)} · перегородки ${zones?.dividers.join(', ') ?? 'НЕТ'} · выбрана ${zones?.current ?? '—'} · ${(await page.evaluate(READ_FILL))?.refusal ?? ''}`,
    );
    must('E3 вид «3D»', await view(page, '3d'), 'НУЛЕВОЙ СЕЛЕКТОР: вида «3D» нет');
    const settled = await sceneSettled(page);
    if (!sceneOk(settled)) await page.screenshot({ path: `${OUT}/FAIL-E3-scene.png` });
    must('E3 сцена готова: data-scene-state «ready», холст с размером', sceneOk(settled), `${sceneWords(settled)} · ошибки страницы: ${pageErrors.slice(0, 2).join(' | ') || 'нет'}`);
    const sceneMode = page.locator('[data-studio-viewport] [data-scene-mode]');
    if ((await sceneMode.count()) > 0 && (await sceneMode.first().getAttribute('data-scene-mode')) === 'frame') await sceneMode.first().click();
    await sleep(800);
    let cad = await scene3d(page, cabinetId);
    const cadFront1 = (cad?.parts ?? []).find((p) => p.partId === `${drawerIds[0]}:front`);
    /* Сцена меряет от пола, движок — от низа корпуса: низ корпуса = низ фасада ящика 1 − 20 (зазор 4 над дном 16). */
    const bottomOf = (front) => (front ? Math.round(front.center[1] - front.size[1] / 2) - 20 : NaN);
    const moduleBottom = bottomOf(cadFront1);
    const cadDividers = (cad?.parts ?? []).filter((p) => p.partId.endsWith(':divider'));
    const d3 = cadDividers[0];
    check(
      'E3 в нарисованной сцене ОДНА перегородка 476 × 16 × 580: x 508…984 модуля, низ 466 мм от дна корпуса; ИД = ИД панели',
      cadDividers.length === 1 &&
        d3.partId === dividerZ2 &&
        d3.size[0] === 476 &&
        d3.size[1] === 16 &&
        d3.size[2] === 580 &&
        Math.round(d3.center[0] - d3.size[0] / 2) === placed.offset + 508 &&
        Math.round(d3.center[1] - d3.size[1] / 2) - moduleBottom === 466,
      cadDividers.length
        ? cadDividers.map((p) => `${p.partId.split(':').slice(-2).join(':')} ${p.size.join('×')} x${Math.round(p.center[0] - p.size[0] / 2) - placed.offset} y${Math.round(p.center[1] - p.size[1] / 2) - moduleBottom}`).join(' | ')
        : 'НУЛЕВОЙ СЕЛЕКТОР: перегородки в сцене нет',
    );
    const pairsOf = (parts) => {
      const hits = [];
      for (let i = 0; i < parts.length; i++)
        for (let j = i + 1; j < parts.length; j++) {
          const depth = penetration(parts[i], parts[j]);
          if (depth > 0.5) hits.push(`${parts[i].partId} × ${parts[j].partId}: ${depth} мм`);
        }
      return hits;
    };
    let hits = pairsOf(cad?.parts ?? []);
    check('E3 нарисованные полки, перегородки и фасады ящиков не пересекаются', hits.length === 0, hits.slice(0, 3).join(' | ') || `деталей ${(cad?.parts ?? []).length}, пересечений 0`);
    await page.screenshot({ path: `${OUT}/E3-divider-3d.png` });

    /* ── E4. Верхняя зона: 2 полки, полка 1 → 1250 ── */
    console.log('\n── E4. Верхняя зона: 2 полки, полка 1 на 1250 → система 32');
    await view(page, 'facade');
    await typeInto(page, '[data-zone-shelf-count-input]', 2);
    zones = await waitFor(page, READ_ZONES, (z) => z?.shelves?.length === 2, 10_000);
    check(
      'E4 две полки зоны z2 на 1120 · 1760 (поровну в 482…2384, система 32), ИД зоны',
      zones?.shelves.map((s) => s.at).join(',') === '1120,1760' && zones.shelves.every((s, i) => s.id === `${cabinetId}:b2:z2:shelf:${i + 1}`),
      zones ? zones.shelves.map((s) => `${s.id.split(':').slice(-3).join(':')}@${s.at}`).join(' ') : 'НУЛЕВОЙ СЕЛЕКТОР',
    );
    await typeInto(page, '[data-zone-shelf-input]', 1250);
    zones = await waitFor(page, READ_ZONES, (z) => z?.shelves?.[0]?.at === 1248, 10_000);
    fill = await page.evaluate(READ_FILL);
    check(
      'E4 полка 1 → 1250 встала на 1248 — и это сказано словами; полка 2 на 1760',
      zones?.shelves.map((s) => s.at).join(',') === '1248,1760' && /1248/.test(fill?.snap ?? '') && /1250/.test(fill?.snap ?? ''),
      `${zones?.shelves.map((s) => s.at).join(',') ?? 'НЕТ'} · «${fill?.snap ?? 'ПОДСКАЗКИ НЕТ'}»`,
    );
    await press(page, '[data-zone-select="z1"]');
    stack = await waitFor(page, READ_STACK, (s) => s?.count === 3, 10_000);
    check('E4 ящики не сдвинулись: блок 0 + 450, фасады прежние', stack?.zone === '0+450' && stack.drawers.map((d) => d.front).join(' ') === frontsBefore, stack ? `${stack.zone} ${stack.drawers.map((d) => d.front).join(' ')}` : 'НЕТ');
    await press(page, '[data-zone-select="z2"]');
    await saved(page);

    /* ── E5. Лист «Каркас» и деталировка ── */
    console.log('\n── E5. Лист «Каркас» и деталировка: одна геометрия');
    await frameMode(page);
    let sheet = await page.evaluate(READ_SHEET_ZONES);
    check(
      'E5 на листе перегородка z2 466…482 на x 508…984, полки зоны 1248 · 1760 с ИД, выбранная зона подсвечена',
      sheet?.dividers.length === 1 &&
        sheet.dividers[0].id === dividerZ2 &&
        `${sheet.dividers[0].from}…${sheet.dividers[0].to}/${sheet.dividers[0].yFrom}…${sheet.dividers[0].yTo}` === '508…984/466…482' &&
        sheet.shelves.map((s) => s.at).join(',') === '1248,1760' &&
        sheet.shelves.every((s) => s.id.includes(':b2:z2:shelf:')) &&
        sheet.selectedZone === 'b2:z2',
      sheet
        ? `перегородки ${sheet.dividers.map((d) => `${d.from}…${d.to}/${d.yFrom}…${d.yTo}`).join(' ') || 'НЕТ'} · полки ${sheet.shelves.map((s) => s.at).join(',')} · выбрана ${sheet.selectedZone ?? '—'}`
        : 'НУЛЕВОЙ СЕЛЕКТОР: схемы нет',
    );
    await page.screenshot({ path: `${OUT}/E4-upper-shelves-front.png` });
    await page.locator('[data-studio-open="panels"]').first().click();
    let panels = (await waitFor(page, READ_PANELS, (list) => Array.isArray(list) && list.length > 0, 20_000)).filter((p) => p.module === cabinetId);
    const words = (list) => list.map((p) => `${p.name}[${p.bay ?? '—'}] ${p.size}·${p.qty}`).join(' | ');
    const hd = panels.filter((p) => p.name === 'Перегородка горизонтальная');
    const shelfB2 = panels.filter((p) => p.name === 'Полка' && p.bay === 'b2');
    check(
      'E5 деталировка: «Перегородка горизонтальная» 476 × 580 × 16 · 1 с ИД перегородки; полки отсека 2 — 474 × 580 × 16 · 2 с ИД зоны; полкой перегородка не считается',
      hd.length === 1 &&
        hd[0].size === '476x580x16' &&
        hd[0].qty === 1 &&
        hd[0].parts.join() === dividerZ2 &&
        shelfB2.length === 1 &&
        shelfB2[0].qty === 2 &&
        shelfB2[0].parts.every((id) => id.includes(':b2:z2:shelf:')),
      words(panels) || 'НУЛЕВОЙ СЕЛЕКТОР: деталировки модуля нет',
    );
    await page.keyboard.press('Escape');
    await sleep(500);

    /* ── E6. 3D: ящики независимо, перегородка стоит ── */
    console.log('\n── E6. 3D: ящик 1, ящик 2, закрыть 1; перегородка неподвижна; ракурс');
    await page.goto(`${BASE}/project/${project.id}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 }).catch(() => undefined);
    await saved(page);
    await tool(page, 'furniture');
    await view(page, 'facade');
    await page.waitForSelector('[data-studio-viewport] [data-schematic]', { timeout: 30_000 }).catch(() => undefined);
    await pointModule(page, cabinetId);
    await press(page, '[data-bay-chip="b2"]');
    await press(page, '[data-zone-select="z1"]');
    await view(page, '3d');
    const settled6 = await sceneSettled(page);
    must('E6 сцена готова', sceneOk(settled6), sceneWords(settled6));
    await sleep(800);
    const dividerAt = async () => (await scene3d(page, cabinetId))?.parts.find((p) => p.partId === dividerZ2) ?? null;
    const div0 = await dividerAt();
    const f6 = await framesOf(page);
    const t6 = Date.now();
    must('E6 «Открыть» ящик 1', await toggleDrawer(page, drawerIds[0]), 'НУЛЕВОЙ СЕЛЕКТОР: кнопки «Открыть» у ящика 1 нет');
    await waitFor(page, READ_SLIDES(drawerIds), (s) => s?.[drawerIds[0]] >= 290, 60_000);
    await toggleDrawer(page, drawerIds[1]);
    await waitFor(page, READ_SLIDES(drawerIds), (s) => s?.[drawerIds[1]] >= 290, 60_000);
    await toggleDrawer(page, drawerIds[0]);
    let slides = await waitFor(page, READ_SLIDES(drawerIds), (s) => s?.[drawerIds[0]] === 0, 60_000);
    const f6b = await framesOf(page);
    const div1 = await dividerAt();
    check(
      'E6 открыт ящик 1, затем 2, закрыт 1 — открыт только ящик 2 (300 мм наглядно), ящики 1 и 3 на месте; перегородка не сдвинулась',
      slides?.[drawerIds[1]] >= 290 &&
        slides?.[drawerIds[0]] === 0 &&
        slides?.[drawerIds[2]] === 0 &&
        Boolean(div0) &&
        JSON.stringify(div0) === JSON.stringify(div1),
      `сдвиг ${JSON.stringify(slides)} · перегородка ${div0 ? div0.center.join(',') : 'НЕТ'} → ${div1 ? div1.center.join(',') : 'НЕТ'} · ${Date.now() - t6} мс, кадров ${f6 !== null && f6b !== null ? f6b - f6 : '—'}`,
    );
    await page.screenshot({ path: `${OUT}/E6-open-drawer.png` });
    const side = page.locator('[data-studio-viewport] [data-angle="left"]');
    if ((await side.count()) > 0) {
      await side.first().click();
      await sleep(1500);
      await page.screenshot({ path: `${OUT}/E6-open-drawer-side.png` });
      const div2 = await dividerAt();
      slides = await page.evaluate(READ_SLIDES(drawerIds));
      check(
        'E6 ракурс «Слева»: ящик 2 по-прежнему открыт, перегородка на месте',
        slides?.[drawerIds[1]] >= 290 && JSON.stringify(div2) === JSON.stringify(div0),
        `сдвиг ${JSON.stringify(slides)} · перегородка ${div2?.center.join(',') ?? 'НЕТ'}`,
      );
      await page.locator('[data-studio-viewport] [data-angle="iso"]').first().click().catch(() => undefined);
      await sleep(800);
    } else check('E6 ракурс «Слева»', false, 'НУЛЕВОЙ СЕЛЕКТОР: кнопки ракурса нет');
    await toggleDrawer(page, drawerIds[1]);
    await waitFor(page, READ_SLIDES(drawerIds), (s) => s?.[drawerIds[1]] === 0, 60_000);

    /* ── E7. Штанга вместо полок — с подтверждением ── */
    console.log('\n── E7. Верхняя зона → «Штанга»: потеря названа до, «Отмена», подтверждение');
    await view(page, 'facade');
    await press(page, '[data-zone-select="z2"]');
    await saved(page);
    await sleep(3500);
    const savedAt7 = await savedAtOf();
    must('E7 кнопка «Штанга» у зоны', await press(page, '[data-zone-fn="rod"]'), 'НУЛЕВОЙ СЕЛЕКТОР: кнопки «Штанга» нет');
    let loss = await waitFor(page, READ_LOSS, (v) => v !== null, 8_000);
    await page.screenshot({ path: `${OUT}/E7-loss-dialog.png` });
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-bay-loss-action') ?? null);
    await page.keyboard.press('Escape');
    await sleep(500);
    zones = await page.evaluate(READ_ZONES);
    await sleep(3500);
    check(
      'E7 до подтверждения названо: полки (2) снимутся; фокус на «Отмене»; Esc — зона прежняя (2 полки), savedAt прежний',
      Boolean(loss && /полки \(2\)/.test(loss)) &&
        focused === 'cancel' &&
        (await page.evaluate(READ_LOSS)) === null &&
        zones?.zones.find((z) => z.id === 'z2')?.kind === 'shelves' &&
        zones.shelves.length === 2 &&
        (await savedAtOf()) === savedAt7,
      `«${loss ?? 'ОКНА НЕТ'}» · фокус ${focused ?? '—'} · после Esc ${zonesWords(zones)}, полок ${zones?.shelves.length ?? '—'}`,
    );
    await press(page, '[data-zone-fn="rod"]');
    await waitFor(page, READ_LOSS, (v) => v !== null, 8_000);
    await page.locator('[data-bay-loss-dialog] [data-bay-loss-action="confirm"]').first().click();
    zones = await waitFor(page, READ_ZONES, (z) => z?.rod !== null && z?.rod !== undefined, 10_000);
    fill = await page.evaluate(READ_FILL);
    check(
      'E7 подтверждено: в z2 штанга на 2284 (100 мм ниже верха зоны), полок нет; отсек 1 — по-прежнему 4 полки; штанга названа условной',
      zonesWords(zones) === 'z2:rod 482…2384 · z1:drawers 16…466' &&
        zones.rod?.at === 2284 &&
        zones.shelves.length === 0 &&
        fill?.chips[0]?.shelves === 4 &&
        /условный референс/.test(zones.rodNote ?? '') &&
        /не проверен/.test(zones.rodNote ?? ''),
      `${zonesWords(zones)} · штанга ${zones?.rod?.at ?? 'НЕТ'} · «${(zones?.rodNote ?? '').slice(0, 90)}»`,
    );
    await press(page, '[data-zone-select="z1"]');
    stack = await waitFor(page, READ_STACK, (s) => s?.count === 3, 10_000);
    check('E7 ящики прежние', stack?.zone === '0+450' && stack.drawers.map((d) => d.front).join(' ') === frontsBefore, stack ? stack.drawers.map((d) => d.front).join(' ') : 'НЕТ');
    await press(page, '[data-zone-select="z2"]');
    await saved(page);
    await sleep(3500);
    const savedAt7b = await savedAtOf();
    await press(page, '[data-zone-action="remove-divider"]');
    loss = await waitFor(page, READ_LOSS, (v) => v !== null, 8_000);
    await page.locator('[data-bay-loss-dialog] [data-bay-loss-action="cancel"]').first().click();
    await sleep(500);
    zones = await page.evaluate(READ_ZONES);
    await sleep(3500);
    check(
      'E7 «Удалить перегородку» между ящиками и штангой: до подтверждения названо, что снимется штанга; «Отмена» — зоны прежние, savedAt прежний',
      Boolean(loss && /штанга/.test(loss) && /ящики \(3\)/.test(loss)) && zones?.count === 2 && (await savedAtOf()) === savedAt7b,
      `«${loss ?? 'ОКНА НЕТ'}» · ${zonesWords(zones)}`,
    );

    /* ── E8. Антресоль ── */
    console.log('\n── E8. «Добавить антресоль»: верх отсека, штанга опускается с перегородкой');
    zones = await page.evaluate(READ_ZONES);
    const mezzNote = zones?.mezzNote ?? '';
    must('E8 «Добавить антресоль»', await press(page, '[data-zones-editor] [data-zone-action="mezzanine"]'), 'НУЛЕВОЙ СЕЛЕКТОР: кнопки «Добавить антресоль» нет');
    zones = await waitFor(page, READ_ZONES, (z) => z?.count === 3, 10_000);
    await press(page, '[data-zone-select="z2"]');
    const zones8 = await waitFor(page, READ_ZONES, (z) => Boolean(z?.rod), 10_000);
    /* После перезагрузки в E6 схема снова «Фасады» — наполнение видно только в «Каркасе». */
    await frameMode(page);
    sheet = await page.evaluate(READ_SHEET_ZONES);
    check(
      'E8 антресоль z3 1884…2384 (500 мм); слова до нажатия называли «2284 → 1768»; штанга 1768; на листе перегородки 466…482 и 1868…1884',
      zonesWords(zones) === 'z3:empty* 1884…2384 · z2:rod 482…1868 · z1:drawers 16…466' &&
        /2284 → 1768/.test(mezzNote) &&
        zones8?.rod?.at === 1768 &&
        sheet?.dividers.map((d) => `${d.yFrom}…${d.yTo}`).sort().join(' · ') === '1868…1884 · 466…482' &&
        sheet.rods.length === 1 &&
        sheet.rods[0].at === 1768,
      `${zonesWords(zones)} · «${mezzNote.slice(0, 120)}» · штанга ${zones8?.rod?.at ?? 'НЕТ'} · лист ${sheet?.dividers.map((d) => `${d.yFrom}…${d.yTo}`).join(', ') ?? 'НЕТ'}`,
    );
    await page.screenshot({ path: `${OUT}/E8-mezzanine-front.png` });

    /* ── E9. Ширина отсека 1 → 600 ── */
    console.log('\n── E9. Отсек 1 → 600 мм: отсек 2 — 352, его перегородки, штанга и фасады');
    await press(page, '[data-bay-chip="b1"]');
    await page.locator('[data-fill-editor] [data-bay-width-input]').first().fill('600');
    await press(page, '[data-fill-action="set-width"]');
    await press(page, '[data-bay-chip="b2"]');
    await frameMode(page);
    sheet = await waitFor(page, READ_SHEET_ZONES, (s) => s?.dividers?.[0]?.from === 632, 10_000);
    fill = await page.evaluate(READ_FILL);
    check(
      'E9 перегородки и штанга отсека 2 на x 632…984 (352 мм), фасады ящиков 636…980; отсек 1 — 600 и 4 полки',
      sheet?.dividers.length === 2 &&
        sheet.dividers.every((d) => d.from === 632 && d.to === 984) &&
        sheet.rods.every((r) => r.from === 632 && r.to === 984) &&
        sheet.drawers.every((d) => d.startsWith('636…980/')) &&
        fill?.chips[0]?.width === 600 &&
        fill.chips[0].shelves === 4 &&
        fill.chips[1]?.width === 352,
      `${sheet?.dividers.map((d) => `${d.from}…${d.to}`).join(', ') ?? 'НЕТ'} · штанга ${sheet?.rods.map((r) => `${r.from}…${r.to}`).join(', ') ?? 'НЕТ'} · фасады ${sheet?.drawers.join(' ') ?? 'НЕТ'} · ${JSON.stringify(fill?.chips ?? null)}`,
    );

    /* ── E10. Недопустимая высота перегородки ── */
    console.log('\n── E10. Перегородка под блоком 450 мм на 400 — отказ с миллиметрами');
    await press(page, '[data-zone-select="z2"]');
    const before10 = zonesWords(await page.evaluate(READ_ZONES));
    await typeInto(page, '[data-zone-divider-input]', 400);
    fill = await waitFor(page, READ_FILL, (f) => Boolean(f?.refusal), 6_000);
    zones = await page.evaluate(READ_ZONES);
    check(
      'E10 отказ «доступно 384 мм, требуется 450 мм, не хватает 66 мм», зоны прежние',
      /доступно 384 мм/.test(fill?.refusal ?? '') && /не хватает 66 мм/.test(fill?.refusal ?? '') && zonesWords(zones) === before10,
      `«${fill?.refusal ?? 'ОТКАЗА НЕТ'}» · ${zonesWords(zones)}`,
    );
    await saved(page);

    /* ── E11. Смета и деталировка ── */
    console.log('\n── E11. Смета: оценка отдельно; деталировка без короба; выпуск заперт');
    const est = await page.evaluate(() => ({
      total: document.querySelector('[data-estimate-total]')?.getAttribute('data-estimate-total') ?? null,
      estimated: document.querySelector('[data-estimate-estimated]')?.getAttribute('data-estimate-estimated') ?? null,
    }));
    check(
      'E11 рядом с итогом оценка 65 475 ₸: ящики 3 × 6 500 + 3 × 14 000, штанга 0.35 мп × 4 500, держатели 2 × 1 200',
      est.estimated === '65475' && est.total !== null,
      `итог ${est.total ?? 'НЕТ'} · оценка ${est.estimated ?? 'НЕТ'}`,
    );
    const estBar = page.locator('button[aria-expanded]:has([data-estimate-total])').first();
    if ((await estBar.count()) > 0) {
      await estBar.click();
      await sleep(500);
      const note = await page.evaluate(() => document.querySelector('[data-estimate-estimated-note]')?.textContent?.trim() ?? null);
      check(
        'E11 открытая смета называет оценку словами: направляющая не выбрана, короб не рассчитан, штанга и держатели не выбраны',
        Boolean(note && /направляющая не выбрана/.test(note) && /короб не рассчитан/.test(note) && /штанга не выбрана/.test(note) && /держатели не выбраны/.test(note)),
        note ?? 'НУЛЕВОЙ СЕЛЕКТОР: строки об оценке нет',
      );
      await page.screenshot({ path: `${OUT}/E11-estimate.png` });
      await page.keyboard.press('Escape');
      await sleep(300);
    } else check('E11 открыть смету', false, 'НУЛЕВОЙ СЕЛЕКТОР: строки итога нет');
    await page.locator('[data-studio-open="panels"]').first().click();
    panels = (await waitFor(page, READ_PANELS, (list) => Array.isArray(list) && list.length > 0, 20_000)).filter((p) => p.module === cabinetId);
    const b2rows = panels.filter((p) => p.bay === 'b2');
    const lock = await page.evaluate(() => ({
      text: document.querySelector('[data-export-lock]')?.textContent ?? null,
      disabled: document.querySelector('[data-export-cut]')?.hasAttribute('disabled') ?? null,
    }));
    check(
      'E11 деталировка отсека 2: перегородки 352 × 580 × 16 · 2 и фронты 146 × 344 · 2, 142 × 344 · 1 — короба нет; выгрузка заперта словами',
      words(b2rows) === 'Перегородка горизонтальная[b2] 352x580x16·2 | Фронт ящика[b2] 146x344x16·2 | Фронт ящика[b2] 142x344x16·1' &&
        !panels.some((p) => /ящика/.test(p.name) && !/Фронт/.test(p.name)) &&
        Boolean(lock.text && /ящики отсеков/.test(lock.text)) &&
        lock.disabled === true,
      `${words(b2rows) || 'НЕТ'} · замок «${(lock.text ?? 'НЕТ').slice(0, 80)}» ${lock.disabled ? 'заперт' : 'ОТКРЫТ'}`,
    );
    await page.screenshot({ path: `${OUT}/E11-panels.png` });
    await page.keyboard.press('Escape');
    await sleep(300);

    /* ── E12. Запись, перезагрузка, открытие без записи; разрез ── */
    console.log('\n── E12. База, перезагрузка, открытие без записи; разрез в мастере');
    await saved(page);
    await sleep(500);
    const { data: stored } = await service.from('projects').select('millwork').eq('id', project.id).single();
    const unitStored = Object.values(stored?.millwork?.runs ?? {}).flatMap((run) => run?.modules ?? []).find((m) => m.id === cabinetId);
    const storedZones = unitStored?.fill?.bays?.[1]?.zones ?? null;
    const zoneJson = (zs) =>
      (zs ?? [])
        .map((z) => `${z.id}|${z.heightMm ?? '*'}|${z.drawers ? `${z.drawers.id}:${z.drawers.fromMm}+${z.drawers.heightMm}` : ''}|${z.rod ? `rod${z.rod.belowTopMm}` : ''}|${z.shelves ? 'shelves' : ''}|${z.mezzanine ? 'mz' : ''}`)
        .join(' · ');
    check(
      'E12 в базе `fill.bays[1].zones`: z1 450 с блоком d1 0+450, z2 1386 со штангой 100 ниже верха, z3 — антресоль; полок отсека поверх зон нет; b1 600',
      zoneJson(storedZones) === 'z1|450|d1:0+450||| · z2|1386||rod100|| · z3|*||||mz' &&
        (unitStored?.fill?.bays?.[1]?.shelves?.at?.length ?? -1) === 0 &&
        !unitStored?.fill?.bays?.[1]?.drawers &&
        unitStored?.fill?.bays?.[0]?.widthMm === 600,
      `${zoneJson(storedZones) || 'ЗОН НЕТ'} · b1 ${unitStored?.fill?.bays?.[0]?.widthMm ?? '—'}`,
    );
    const savedAt12 = stored?.millwork?.savedAt ?? null;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 }).catch(() => undefined);
    await saved(page);
    await tool(page, 'furniture');
    await view(page, 'facade');
    await page.waitForSelector('[data-studio-viewport] [data-schematic]', { timeout: 30_000 }).catch(() => undefined);
    await pointModule(page, cabinetId);
    await press(page, '[data-bay-chip="b2"]');
    await press(page, '[data-zone-select="z2"]');
    zones = await waitFor(page, READ_ZONES, (z) => z?.count === 3 && Boolean(z.rod), 10_000);
    await press(page, '[data-zone-select="z1"]');
    stack = await waitFor(page, READ_STACK, (s) => s?.count === 3, 10_000);
    check(
      'E12 после перезагрузки: те же зоны и ИД перегородок, штанга 1768, ящики 344 × 146 · 146 · 142',
      zonesWords(zones) === 'z3:empty* 1884…2384 · z2:rod 482…1868 · z1:drawers 16…466' &&
        zones.dividers.join() === `${cabinetId}:b2:z3:divider,${cabinetId}:b2:z2:divider` &&
        zones.rod?.at === 1768 &&
        stack?.drawers.map((d) => d.front).join(' ') === '344x146x16 344x146x16 344x142x16',
      `${zonesWords(zones)} · ${zones?.dividers.join(', ') ?? ''} · штанга ${zones?.rod?.at ?? 'НЕТ'} · ${stack?.drawers.map((d) => d.front).join(' ') ?? 'НЕТ'}`,
    );
    await view(page, '3d');
    const settled12 = await sceneSettled(page);
    check('E12 3D после перезагрузки готова', sceneOk(settled12), sceneWords(settled12));
    await sleep(800);
    cad = await scene3d(page, cabinetId);
    const rod3d = (cad?.parts ?? []).filter((p) => p.partId.endsWith(':rod'));
    const div3d = (cad?.parts ?? []).filter((p) => p.partId.endsWith(':divider'));
    const bottom12 = bottomOf((cad?.parts ?? []).find((p) => p.partId === `${drawerIds[0]}:front`));
    hits = pairsOf(cad?.parts ?? []);
    check(
      'E12 3D: 2 перегородки 352 × 16 × 580 на 466 и 1868, штанга 352 мм с осью 1768 — тем же ИД; пересечений 0',
      div3d.length === 2 &&
        div3d.every((p) => p.size.join('×') === '352×16×580') &&
        div3d.map((p) => Math.round(p.center[1] - p.size[1] / 2) - bottom12).sort((a, b) => a - b).join(',') === '466,1868' &&
        rod3d.length === 1 &&
        rod3d[0].partId === `${cabinetId}:b2:z2:rod` &&
        rod3d[0].size[0] === 352 &&
        Math.round(rod3d[0].center[1]) - bottom12 === 1768 &&
        hits.length === 0,
      `перегородки ${div3d.map((p) => `${p.size.join('×')}@${Math.round(p.center[1] - p.size[1] / 2) - bottom12}`).join(', ') || 'НЕТ'} · штанга ${rod3d.map((p) => `${p.size.join('×')}@${Math.round(p.center[1]) - bottom12}`).join(', ') || 'НЕТ'} · пересечений ${hits.length}${hits.length ? `: ${hits.slice(0, 2).join('; ')}` : ''}`,
    );
    await page.screenshot({ path: `${OUT}/E12-reload.png` });
    await sleep(3500);
    check('E12 открытие и переключение видов ничего не пишет: savedAt прежний', savedAt12 !== null && (await savedAtOf()) === savedAt12, `${savedAt12} → ${await savedAtOf()}`);

    /* Разрез — на листе мастера, как в R02A.1 (D6c). */
    await page.goto(`${BASE}/project/${project.id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const resultStep = page.getByRole('button', { name: /Результат/ }).first();
    must('E12 шаг «Результат» в мастере', (await resultStep.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: кнопки шага «Результат» нет');
    await resultStep.click({ timeout: 90_000 });
    await page.waitForSelector('[data-view="elevation"] [data-module-id]', { timeout: 60_000 }).catch(() => undefined);
    const sheetPoint = await page.evaluate((id) => {
      const g = [...document.querySelectorAll('[data-view="elevation"] [data-module-id]')].find((n) => n.getAttribute('data-module-id') === id);
      if (!g) return null;
      g.scrollIntoView({ block: 'center' });
      return true;
    }, cabinetId);
    must('E12 шкаф на фасаде листа', Boolean(sheetPoint), `НУЛЕВОЙ СЕЛЕКТОР: модуля ${cabinetId} на листе нет`);
    await sleep(400);
    const box12 = await page.evaluate((id) => {
      const g = [...document.querySelectorAll('[data-view="elevation"] [data-module-id]')].find((n) => n.getAttribute('data-module-id') === id);
      const r = g?.getBoundingClientRect();
      return r ? { x: r.left + r.width * 0.75, y: r.top + r.height * 0.5 } : null;
    }, cabinetId);
    await page.mouse.click(box12.x, box12.y);
    const READ_SECTION = `(() => {
      const root = document.querySelector('[data-view="section-inside"]');
      if (!root) return null;
      const a = (n, k) => n?.getAttribute(k) ?? null;
      return {
        bay: root.querySelector('[data-section-bay]')?.getAttribute('data-section-bay') ?? null,
        dividers: [...root.querySelectorAll('[data-section-divider]')].map((n) => \`\${a(n, 'data-y-from-mm')}…\${a(n, 'data-y-to-mm')}\`).sort(),
        rods: [...root.querySelectorAll('[data-section-rod]')].map((n) => Number(a(n, 'data-at-mm'))),
        zones: [...root.querySelectorAll('[data-section-zone]')].map((n) => \`\${a(n, 'data-section-zone')}:\${a(n, 'data-from-mm')}…\${a(n, 'data-to-mm')}\`),
        fronts: root.querySelectorAll('[data-section-drawer-front]').length,
      };
    })()`;
    const section = await waitFor(page, READ_SECTION, (s) => (s?.dividers?.length ?? 0) === 2, 20_000);
    check(
      'E12 боковой разрез по отсеку 2: перегородки 466…482 и 1868…1884, штанга 1768, три зоны, три фасада ящиков',
      section?.bay === 'b2' &&
        section.dividers.join(' · ') === '1868…1884 · 466…482' &&
        section.rods.join() === '1768' &&
        section.zones.join(' ') === 'z1:16…466 z2:482…1868 z3:1884…2384' &&
        section.fronts === 3,
      section ? JSON.stringify(section) : 'НУЛЕВОЙ СЕЛЕКТОР: вида «разрез с наполнением» на листе нет',
    );
    const sectionView = page.locator('[data-view="section-inside"]').first();
    if ((await sectionView.count()) > 0) {
      await sectionView.scrollIntoViewIfNeeded().catch(() => undefined);
      await sleep(300);
      await sectionView.screenshot({ path: `${OUT}/E5-section.png` });
    }
    check('ошибок страницы нет (1440)', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || 'ноль');
    await context.close();

    /* ── E13. 1180, планшет 1024 касанием, 390 ── */
    console.log('\n── E13. 1180 × 820, планшет 1024 × 768 касанием, 390 × 844');
    for (const [w, h, touch, shot] of [
      [1180, 820, false, 'E13-1180.png'],
      [1024, 768, true, 'E13-tablet.png'],
      [390, 844, true, 'E13-mobile.png'],
    ]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: w < 500 });
      await ctx.addCookies(cookies);
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
      await p.goto(`${BASE}/project/${project.id}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await p.waitForSelector('[data-studio-root]', { timeout: 60_000 }).catch(() => undefined);
      await saved(p);
      await tool(p, 'furniture');
      await view(p, 'facade');
      await p.waitForSelector('[data-studio-viewport] [data-schematic]', { timeout: 30_000 }).catch(() => undefined);
      const tapped = await pointModule(p, cabinetId, touch);
      const chipOk = await press(p, '[data-bay-chip="b2"]', touch);
      const zoneOk = await press(p, '[data-zone-select="z1"]', touch);
      const z = await waitFor(p, READ_ZONES, (v) => v?.current === 'z1', 8_000);
      const targets = await p.evaluate(() =>
        [...document.querySelectorAll('[data-fill-editor] [data-zone-select], [data-fill-editor] [data-zone-fn], [data-fill-editor] [data-zone-action]')].map((n) => {
          const r = n.getBoundingClientRect();
          return Math.round(Math.min(r.width, r.height));
        }),
      );
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      let opened = 'не проверялось';
      if (w === 1024) {
        await view(p, '3d');
        const s = await sceneSettled(p);
        if (sceneOk(s)) {
          await toggleDrawer(p, drawerIds[0], true);
          const sl = await waitFor(p, READ_SLIDES(drawerIds), (v) => v?.[drawerIds[0]] >= 290, 60_000);
          opened = sl?.[drawerIds[0]] >= 290 && sl?.[drawerIds[1]] === 0 && sl?.[drawerIds[2]] === 0 ? 'ящик 1 выехал один' : `НЕ ТАК: ${JSON.stringify(sl)}`;
        } else opened = `сцена не готова: ${sceneWords(s)}`;
      }
      await p.screenshot({ path: `${OUT}/${shot}` });
      check(
        `E13 ${w} × ${h}${touch ? ' касанием' : ''}: шкаф, отсек 2 и зона z1 выбираются; кнопки зон не меньше 32 px; без горизонтального вылета${w === 1024 ? '; в 3D касанием выехал только ящик 1' : ''}`,
        tapped && chipOk && zoneOk && z?.current === 'z1' && targets.length > 0 && Math.min(...targets) >= 32 && overflow <= 0 && (w !== 1024 || opened === 'ящик 1 выехал один') && errs.length === 0,
        `шкаф ${tapped ? 'да' : 'НЕТ'} · отсек ${chipOk ? 'да' : 'НЕТ'} · зона ${z?.current ?? 'НЕТ'} · кнопок ${targets.length}, меньшая ${targets.length ? Math.min(...targets) : '—'} px · вылет ${overflow} px · ${opened} · ошибок ${errs.length}`,
      );
      await ctx.close();
    }

    /* ── E14. «Заменить» у шкафа с зонами ── */
    console.log('\n── E14. «Заменить» у шкафа с зонами: потеря названа, «Отмена»');
    const ctx14 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx14.addCookies(cookies);
    const p14 = await ctx14.newPage();
    const errors14 = [];
    p14.on('pageerror', (e) => errors14.push(e.message.slice(0, 200)));
    await p14.goto(`${BASE}/project/${project.id}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await p14.waitForSelector('[data-studio-root]', { timeout: 60_000 }).catch(() => undefined);
    await saved(p14);
    await tool(p14, 'furniture');
    await view(p14, 'facade');
    await p14.waitForSelector('[data-studio-viewport] [data-schematic]', { timeout: 30_000 }).catch(() => undefined);
    await pointModule(p14, cabinetId);
    await sleep(3500);
    const savedAt14 = await savedAtOf();
    const replace = p14.locator('[data-module-action="replace"]').first();
    let text14 = null;
    if ((await replace.count()) > 0) {
      await replace.click();
      text14 = await waitFor(p14, READ_LOSS, (v) => v !== null, 8_000);
      await p14.screenshot({ path: `${OUT}/E14-replace-dialog.png` });
      await p14.locator('[data-bay-loss-dialog] [data-bay-loss-action="cancel"]').first().click();
      await sleep(600);
    }
    await press(p14, '[data-bay-chip="b2"]');
    const z14 = await p14.evaluate(READ_ZONES);
    await sleep(3500);
    check(
      'E14 «Заменить»: до правки названы ящики (3), горизонтальные перегородки (2), штанга, антресоль; «Отмена» — зоны прежние, savedAt прежний',
      Boolean(text14 && /ящики \(3\)/.test(text14) && /горизонтальные перегородки \(2\)/.test(text14) && /штанга/.test(text14) && /антресоль/.test(text14)) &&
        z14?.count === 3 &&
        (await savedAtOf()) === savedAt14,
      `«${text14 ?? 'ОКНА НЕТ'}» · зон ${z14?.count ?? '—'}`,
    );
    check('ошибок страницы нет (E14)', errors14.length === 0, errors14.slice(0, 2).join(' | ') || 'ноль');
    await ctx14.close();
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
  } finally {
    /* Уборка проверяется ЧТЕНИЕМ: supabase-js не бросает на ошибке запроса. */
    const left = [];
    const remove = async (what, run) => {
      try {
        const { error } = await run();
        if (error) left.push(`${what}: ${error.message}`);
      } catch (error) {
        left.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    if (made.project) await remove('объект', () => service.from('projects').delete().eq('id', made.project));
    if (made.org) await remove('организация', () => service.from('orgs').delete().eq('id', made.org));
    if (made.user) await remove('пользователь', () => service.auth.admin.deleteUser(made.user));
    if (made.project) {
      const { data } = await service.from('projects').select('id').eq('id', made.project);
      if ((data ?? []).length > 0) left.push('объект остался в базе');
    }
    if (made.org) {
      const { data } = await service.from('orgs').select('id').eq('id', made.org);
      if ((data ?? []).length > 0) left.push('организация осталась в базе');
    }
    check('временные объект, организация и пользователь удалены (проверено чтением)', left.length === 0, left.join(' | ') || 'удалено');
  }
}

/* ─────────────────────────  запуск  ───────────────────────── */

freePort(PORT);
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
  env: { ...process.env, SITE_PASSWORD: '' },
});

let browser;
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
  browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });
  await scenario(browser);
} catch (error) {
  failed += 1;
  console.log(`  FAIL ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser?.close();
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
