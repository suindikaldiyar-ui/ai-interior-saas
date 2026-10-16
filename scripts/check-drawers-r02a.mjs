/**
 * R02A — БЛОК ЯЩИКОВ В ОТСЕКЕ ШКАФА, ПУТЁМ ЭКРАНА.
 *
 * Запуск: node scripts/check-drawers-r02a.mjs   (нужен build)
 *
 * Объект — как у «Новый объект → Спальня»: зона «Спальня», замер
 * 3000 × 2800 × 3000 × 2800, потолок 2500; организация, пользователь и
 * объект заводятся служебным ключом и удаляются в конце (проверено чтением).
 *
 *   K1–K3 путь R01: шкаф «Полки» 1000 × 2400 × 600, «Разделить вертикально»,
 *         слева 4 полки, справа 0.
 *   D1 отсек 2 → «Добавить блок ящиков»: 3 ящика в нижней зоне 600 мм,
 *      статус «черновик» с тем, чего не хватает.
 *   D2 схема «Каркас»: фасады ящиков в мм — те же, что в движке.
 *   D3 3D: сцена «ready»; фасады в нарисованной сцене; пересечений нет;
 *      «Открыть» у ящика 2 — выехал только он; ракурс «Слева»; «Закрыть»;
 *      ящик 3 — мышью по нему в сцене: выехал и выбран в инспекторе.
 *   D4 высота блока 450, отсек 1 → 600: фасады 344; 7 ящиков — отказ с числом.
 *   D4b библиотека «Мебели»: замена шкафа называет потерю отсеков, полок и
 *       ящиков ДО нажатия; «стоит сейчас» не снимает ничего.
 *   D5 деталировка: в раскрое только фронты ящиков, короба нет; выгрузка
 *      заперта словами; ИД фасадов раскроя = ИД в 3D.
 *   D6 база: `fill.bays[1].drawers`; перезагрузка — тот же блок; простое
 *      открытие ничего не пишет (savedAt прежний).
 *   D6b (R02A.1) после перезагрузки зона 450: лист «Каркас», 3D и смета — одни
 *       миллиметры; рядом с итогом «в т. ч. оценка 61 500 ₸».
 *   D6c (R02A.1) мастер → «Результат»: боковой разрез по отсеку 2 — блок,
 *       фасады, габарит, корпус шкафа.
 *   D7 планшет 1024: касанием отсек и «Открыть» — выехал только ящик 1.
 *   D8 (R02A.1) «Заменить», «Секция», карточка библиотеки: потеря названа ДО,
 *       «Отмена» не меняет ничего (savedAt прежний); подтверждение снимает
 *       отсеки — экран, база и перезагрузка.
 *
 * Нулевой селектор — FAIL со словами. Снимки — `.capture-check/r02a/`.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = 3256;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/r02a';
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
      measuredBy: 'проверка R02A',
      measuredAt: '2026-10-15',
    },
    measurement: {
      id: `m-${stamp}`,
      ceilingHeightMm: CEILING,
      walls: WALLS.map((lengthMm, i) => ({ id: `w${i + 1}`, lengthMm, angleDeg: 90, openings: [] })),
      comms: [],
      photos: [],
      measuredBy: 'проверка R02A',
      measuredAt: '2026-10-15',
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
      variant: g.getAttribute('data-module-variant'),
      bottom: Number(g.getAttribute('data-bottom-mm')),
      top: Number(g.getAttribute('data-top-mm')),
    }))
    .sort((a, b) => a.offset - b.offset);
})()`;

/** Панель «Внутреннее наполнение» в инспекторе. */
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
      on: n.getAttribute('aria-pressed') === 'true',
    })),
    shelves: [...root.querySelectorAll('[data-shelf-row]')].map((n) => ({
      id: n.getAttribute('data-shelf-row'),
      at: Number(n.getAttribute('data-shelf-at')),
      size: n.querySelector('[data-bay-shelf-size]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
    })),
    refusal: root.querySelector('[data-fill-refusal]')?.textContent ?? null,
    snap: root.querySelector('[data-fill-snap]')?.textContent ?? null,
    problems: [...root.querySelectorAll('[data-fill-problem]')].map((n) => n.textContent),
    blocked: root.querySelector('[data-fill-blocked]')?.textContent ?? null,
    drilling: root.querySelector('[data-fill-drilling]')?.textContent ?? null,
    partitionNote: root.querySelector('[data-partition-note]')?.textContent ?? null,
  };
})()`;

/** Отсеки на схеме: перегородки, полки, подсветка — в миллиметрах модуля. */
const READ_SHEET = `(() => {
  const root = document.querySelector('[data-studio-viewport] [data-schematic]');
  if (!root) return null;
  return [...root.querySelectorAll('[data-bays]')].map((g) => ({
    module: g.getAttribute('data-bays'),
    partitions: [...g.querySelectorAll('[data-partition]')].map((n) => ({
      id: n.getAttribute('data-partition'),
      from: Number(n.getAttribute('data-from-mm')),
      to: Number(n.getAttribute('data-to-mm')),
    })),
    shelves: [...g.querySelectorAll('[data-bay-shelf]')].map((n) => ({
      bay: n.getAttribute('data-bay-shelf'),
      id: n.getAttribute('data-part-id'),
      from: Number(n.getAttribute('data-from-mm')),
      to: Number(n.getAttribute('data-to-mm')),
      at: Number(n.getAttribute('data-at-mm')),
    })),
    selected: g.querySelector('[data-bay-selected]')?.getAttribute('data-bay-selected') ?? null,
  }));
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

/**
 * 3D ГОТОВА ПО СОСТОЯНИЮ СЦЕНЫ (R01.1): `ready` — холст с размером и
 * отрисованным кадром, `failed` — отказ со словами. Ждём, пока сцена не
 * скажет одно из двух (сама она называет отказом 20 с без кадра), или пока
 * не исчезнет Studio — падение тоже ответ, и его видно сразу.
 */
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
        center: r ? { x: r.left + r.width * 0.5, y: r.top + r.height * 0.55 } : null,
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

/** Нажать настоящим указателем на середину модуля на схеме (мышь или касание). */
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

/** Кнопка панели наполнения по действию — настоящим указателем. */
async function fillAction(page, action, kind = 'fill') {
  const button = page.locator(`[data-fill-editor] [data-${kind}-action="${action}"]`);
  if ((await button.count()) === 0) return false;
  await button.first().click({ timeout: 10_000 });
  await sleep(400);
  return true;
}

async function chip(page, bayId, touch = false) {
  const button = page.locator(`[data-fill-editor] [data-bay-chip="${bayId}"]`);
  if ((await button.count()) === 0) return false;
  if (touch) await button.first().tap({ timeout: 10_000 });
  else await button.first().click({ timeout: 10_000 });
  await sleep(300);
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

const chipWords = (fill) =>
  fill && fill.chips.length ? fill.chips.map((c) => `${c.id}:${c.width}/${c.shelves}${c.on ? '*' : ''}`).join(' ') : 'отсеков нет';

/** Детали отсеков модуля из НАРИСОВАННОЙ сцены. */
async function scene3d(page, moduleId) {
  return page.evaluate((id) => {
    const probe = window.__mwCadBays;
    if (!probe) return null;
    const all = probe();
    return { ...all, parts: all.parts.filter((p) => p.partId.startsWith(`${id}:`)) };
  }, moduleId);
}

/** Пересечение двух коробок по трём осям, мм; контакт — не пересечение. */
function penetration(a, b) {
  let min = Infinity;
  for (let k = 0; k < 3; k++) {
    const lo = Math.max(a.center[k] - a.size[k] / 2, b.center[k] - b.size[k] / 2);
    const hi = Math.min(a.center[k] + a.size[k] / 2, b.center[k] + b.size[k] / 2);
    min = Math.min(min, hi - lo);
  }
  return min;
}


/* ─────────────  R02A: блок ящиков в панели, на листе и в сцене  ───────────── */

/** Блок ящиков выбранного отсека в панели «Внутреннее наполнение». */
const READ_STACK = `(() => {
  const root = document.querySelector('[data-fill-editor] [data-drawer-stack]');
  if (!root) return null;
  return {
    id: root.getAttribute('data-drawer-stack'),
    bay: root.getAttribute('data-drawer-bay'),
    count: Number(root.getAttribute('data-drawer-count')),
    zone: root.getAttribute('data-drawer-zone'),
    status: root.querySelector('[data-drawer-status]')?.getAttribute('data-drawer-status') ?? null,
    missing: [...root.querySelectorAll('[data-drawer-missing] li')].map((n) => n.textContent.trim()),
    drawers: [...root.querySelectorAll('[data-drawer-row]')].map((n) => ({
      id: n.getAttribute('data-drawer-row'),
      slot: Number(n.getAttribute('data-drawer-slot')),
      front: n.getAttribute('data-drawer-front'),
    })),
  };
})()`;

/** Фасады ящиков на схеме «Каркас», мм от левого-нижнего угла корпуса. */
const READ_SHEET_DRAWERS = `(() => [...document.querySelectorAll('[data-studio-viewport] [data-schematic] rect[data-bay-drawer]')].map((n) => ({
  id: n.getAttribute('data-bay-drawer'),
  from: Number(n.getAttribute('data-from-mm')),
  to: Number(n.getAttribute('data-to-mm')),
  yFrom: Number(n.getAttribute('data-y-from-mm')),
  yTo: Number(n.getAttribute('data-y-to-mm')),
})))()`;

/** Насколько выехал каждый ящик в НАРИСОВАННОЙ сцене, мм. */
const READ_SLIDES = (ids) => `(() => {
  const slide = window.__mwPartSlide;
  if (!slide) return null;
  const out = {};
  for (const id of ${JSON.stringify(ids)}) out[id] = slide(id);
  return out;
})()`;

/** Счётчик кадров видимой сцены (слой 36); `null` — сцены нет. */
const framesOf = (page) => page.evaluate(() => window.__mwCadFrames?.() ?? null);
const frameDelta = (before, after) => (before !== null && after !== null ? after - before : '—');

/** «Открыть / Закрыть» у ящика в инспекторе — настоящим указателем. */
async function toggleDrawer(page, id) {
  const button = page.locator(`[data-fill-editor] [data-drawer-toggle="${id}"]`);
  if ((await button.count()) === 0) return false;
  await button.first().click({ timeout: 10_000 });
  await sleep(300);
  return true;
}

/* ─────────────────────────  сценарий  ───────────────────────── */

async function scenario(browser) {
  loadEnv();
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !ANON || !SERVICE || /your-project|example/.test(URL)) {
    check('R01: ключи Supabase есть', false, 'НЕ ПРОВЕРЕНО — нет ключей Supabase в .env.local');
    return;
  }
  const service = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = Date.now();
  const email = `r02a-${stamp}@example.test`;
  const password = `Pw-${stamp}-r02a!`;
  const made = { user: null, org: null, project: null };
  mkdirSync(OUT, { recursive: true });
  try {
    const { data: created, error: userError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (userError) throw new Error(`createUser: ${userError.message}`);
    made.user = created.user.id;
    const { data: org, error: orgError } = await service
      .from('orgs')
      .insert({ slug: `r02a-${stamp}`, name: `Проверка R02A ${stamp}` })
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

    /* Тот же объект, что заводит «Новый объект → Спальня» (`/measure`). */
    const room = fixtureRoom(stamp);
    const { data: project, error: projectError } = await service
      .from('projects')
      .insert({
        org_id: org.id,
        address: 'Проверка R02A',
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

    /* ── K1. Шкаф 1000 × 2400 × 600 ── */
    console.log('\n── K1. Studio спальни: шкаф «Полки» 1000 мм');
    await page.goto(`${BASE}/project/${project.id}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 }).catch(() => undefined);
    await saved(page);
    must('K1 инструмент «Мебель»', await tool(page, 'furniture'), 'НУЛЕВОЙ СЕЛЕКТОР: инструмента «Мебель» нет');
    must('K1 вид «Фасад»', await view(page, 'facade'), 'НУЛЕВОЙ СЕЛЕКТОР: вида «Фасад» нет');
    await page.waitForSelector('[data-studio-viewport] [data-schematic]', { timeout: 30_000 }).catch(() => undefined);
    /*
     * Спальня собирается секциями и в Studio: на стене сразу четыре
     * модуля, пустот нет. Шкаф «Полки» находится так же, как его находит
     * человек, — по подписи в инспекторе: у пеналов на схеме один вариант.
     */
    let row = await waitFor(page, READ_ROW, (r) => Array.isArray(r) && r.length > 0, 20_000);
    must('K1 модули спальни на фасаде', Array.isArray(row) && row.length > 0, 'НУЛЕВОЙ СЕЛЕКТОР: модулей на фасаде нет');
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
    must('K1 шкаф «Полки» на стене спальни', Boolean(placed), `НУЛЕВОЙ СЕЛЕКТОР: «Полки» не нашлись · ${seen.join(' | ')}`);
    const cabinetId = placed.id;
    /* Справа снимаются модули — место под ширину 1000, как в приёмке движка. */
    for (const unit of row.filter((m) => m.offset > placed.offset).reverse()) {
      await pointModule(page, unit.id);
      const remove = page.locator('[data-module-action="remove"]').first();
      must(`K1 «Удалить» у ${unit.id}`, (await remove.count()) > 0 && (await remove.isEnabled()), `НУЛЕВОЙ СЕЛЕКТОР: кнопки «Удалить» у ${unit.id} нет`);
      await remove.click();
      await sleep(600);
    }
    row = await waitFor(page, READ_ROW, (r) => Array.isArray(r) && !r.some((m) => m.offset > placed.offset), 10_000);
    must('K1 шкаф выбран мышью', await pointModule(page, cabinetId), `НУЛЕВОЙ СЕЛЕКТОР: модуля ${cabinetId} на схеме нет`);
    const width = page.locator('label:has-text("Ширина, мм") input').first();
    must('K1 поле «Ширина, мм»', (await width.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: поля «Ширина, мм» нет');
    await width.fill('1000');
    await width.press('Enter');
    await sleep(800);
    row = await waitFor(page, READ_ROW, (r) => Array.isArray(r) && r.find((m) => m.id === cabinetId)?.width === 1000, 15_000);
    const inspector = await page.evaluate(() => {
      const n = document.querySelector('[data-inspector-module]');
      return n
        ? {
            id: n.getAttribute('data-inspector-module'),
            width: Number(n.getAttribute('data-inspector-width')),
            height: Number(n.getAttribute('data-inspector-height')),
            depth: Number(n.getAttribute('data-inspector-depth')),
          }
        : null;
    });
    must(
      'K1 шкаф 1000 × 2400 × 600 — по инспектору (те же `runPlaces`, что ставят его в 3D)',
      inspector && inspector.width === 1000 && inspector.height === 2400 && inspector.depth === 600,
      inspector ? `${inspector.id} ${inspector.width} × ${inspector.height} × ${inspector.depth}` : 'НУЛЕВОЙ СЕЛЕКТОР: инспектор модуля пуст',
    );

    /* ── K2. Разделить вертикально ── */
    console.log('\n── K2. «Внутреннее наполнение» → «Разделить вертикально»');
    let fill = await page.evaluate(READ_FILL);
    must('K2 панель «Внутреннее наполнение» у выбранного шкафа', fill?.module === cabinetId, fill ? `панель у ${fill.module}` : 'НУЛЕВОЙ СЕЛЕКТОР: панели «Внутреннее наполнение» нет');
    check('K2 присадка названа словами, отверстий нет', Boolean(fill.drilling && /не рассчитана/.test(fill.drilling)), fill.drilling ?? 'строки о присадке нет');
    must('K2 кнопка «Разделить вертикально»', await fillAction(page, 'split'), `НУЛЕВОЙ СЕЛЕКТОР: кнопки нет · ${fill.blocked ?? ''}`);
    fill = await waitFor(page, READ_FILL, (f) => f?.split === 'yes', 10_000);
    must(
      'K2 два отсека по 476 мм (1000 − 2 × 16 − 16 = 952), выбран первый',
      fill?.chips.length === 2 && fill.chips[0].width === 476 && fill.chips[1].width === 476 && fill.chips[0].on,
      `${chipWords(fill)}${fill?.refusal ? ` · отказ: ${fill.refusal}` : ''}`,
    );

    /* ── K3. Слева 4, справа 0 ── */
    console.log('\n── K3. «Количество полок»: слева 4, справа 0');
    await typeInto(page, '[data-bay-count-input]', 4);
    await chip(page, 'b2');
    await typeInto(page, '[data-bay-count-input]', 0);
    await chip(page, 'b1');
    fill = await waitFor(page, READ_FILL, (f) => f?.chips[0]?.shelves === 4 && f?.chips[1]?.shelves === 0, 10_000);
    check(
      'K3 в отсеке 1 четыре полки 474 × 580 × 16 на 480 · 960 · 1440 · 1920, в отсеке 2 ни одной',
      fill?.chips[0]?.shelves === 4 &&
        fill.chips[1]?.shelves === 0 &&
        fill.shelves.map((s) => s.at).join(',') === '480,960,1440,1920' &&
        fill.shelves.every((s) => s.size === '474 × 580 × 16'),
      `${chipWords(fill)} · ${fill?.shelves.map((s) => `${s.at}:${s.size}`).join(' ') ?? ''}`,
    );
    await saved(page);

    /* ── D1. Блок ящиков в отсеке 2 ── */
    console.log('\n── D1. Отсек 2 → «Добавить блок ящиков»: 3 ящика в нижней зоне 600 мм');
    must('D1 чип отсека 2', await chip(page, 'b2'), 'НУЛЕВОЙ СЕЛЕКТОР: чипа отсека 2 нет');
    must('D1 кнопка «Добавить блок ящиков»', await fillAction(page, 'add', 'drawer'), 'НУЛЕВОЙ СЕЛЕКТОР: кнопки «Добавить блок ящиков» нет');
    let stack = await waitFor(page, READ_STACK, (s) => s?.drawers?.length === 3, 10_000);
    must(
      'D1 в отсеке 2 блок из 3 ящиков, зона 0 + 600 мм; фасады 468 × 196 · 196 · 192 × 16',
      stack?.count === 3 &&
        stack.zone === '0+600' &&
        stack.drawers.map((d) => d.front).join(' ') === '468x196x16 468x196x16 468x192x16',
      stack ? `${stack.count} ящ. · зона ${stack.zone} · ${stack.drawers.map((d) => d.front).join(' ')}` : 'НУЛЕВОЙ СЕЛЕКТОР: блока ящиков в панели нет',
    );
    check(
      'D1 статус — черновик, и названо, чего не хватает: направляющая и правила короба цеха',
      stack.status === 'draft' && stack.missing.some((m) => /направляющ/i.test(m)) && stack.missing.some((m) => /короб/i.test(m)),
      `${stack.status} · ${stack.missing.join(' | ')}`,
    );
    check('D1 у отсека 1 по-прежнему 4 полки', (await page.evaluate(READ_FILL))?.chips[0]?.shelves === 4, chipWords(await page.evaluate(READ_FILL)));
    await saved(page);

    /* ── D2. Лист «Каркас»: фасады ящиков ── */
    console.log('\n── D2. Схема «Каркас»: фасады ящиков из той же геометрии');
    const mode2 = page.locator('[data-studio-viewport] [data-schematic-mode]');
    if ((await mode2.count()) > 0 && (await mode2.first().getAttribute('data-schematic-mode')) !== 'frame') await mode2.first().click();
    await sleep(400);
    const sheetDrawers = await page.evaluate(READ_SHEET_DRAWERS);
    check(
      'D2 на листе 3 фасада ящиков отсека 2: x 512…980, y 20…216 · 220…416 · 420…612; ИД фасадов',
      sheetDrawers.length === 3 &&
        sheetDrawers.every((d) => d.from === 512 && d.to === 980) &&
        sheetDrawers.map((d) => `${d.yFrom}…${d.yTo}`).sort().join(' · ') === '20…216 · 220…416 · 420…612',
      sheetDrawers.map((d) => `${d.id} ${d.from}…${d.to}/${d.yFrom}…${d.yTo}`).join(' | ') || 'НУЛЕВОЙ СЕЛЕКТОР: фасадов ящиков на листе нет',
    );
    await page.screenshot({ path: `${OUT}/D2-1440-front-sheet.png` });

    /* ── D3. 3D: закрыто, открыть один, закрыть ── */
    console.log('\n── D3. 3D: ящики закрыты, открывается ровно один');
    must('D3 вид «3D»', await view(page, '3d'), 'НУЛЕВОЙ СЕЛЕКТОР: вида «3D» нет');
    const settled = await sceneSettled(page);
    if (!sceneOk(settled)) await page.screenshot({ path: `${OUT}/FAIL-D3-scene.png` });
    must('D3 сцена готова: data-scene-state «ready», холст с размером', sceneOk(settled), `${sceneWords(settled)} · ошибки страницы: ${pageErrors.slice(0, 2).join(' | ') || 'нет'}`);
    const frameBtn = page.locator('[data-studio-viewport] [data-scene-mode]');
    if ((await frameBtn.count()) > 0 && (await frameBtn.first().getAttribute('data-scene-mode')) === 'frame') await frameBtn.first().click();
    await sleep(800);
    const cad = await scene3d(page, cabinetId);
    const cadFronts = (cad?.parts ?? []).filter((p) => /:b2:drawer:\d+:front$/.test(p.partId));
    check(
      'D3 в нарисованной сцене 3 фасада ящиков 468 × (196 · 196 · 192) × 16 на x 1412…1880 (модуль с 900)',
      cadFronts.length === 3 &&
        cadFronts.every((p) => p.size[0] === 468 && p.size[2] === 16 && p.center[0] - p.size[0] / 2 === placed.offset + 512) &&
        cadFronts.map((p) => p.size[1]).sort().join(',') === '192,196,196',
      cadFronts.map((p) => `${p.partId.split(':').slice(-3).join(':')} ${p.size.join('×')} x${p.center[0] - p.size[0] / 2}`).join(' | ') ||
        'НУЛЕВОЙ СЕЛЕКТОР: фасадов ящиков в сцене нет',
    );
    const pairs = [];
    const all = cad?.parts ?? [];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const depth = penetration(all[i], all[j]);
        if (depth > 0.5) pairs.push(`${all[i].partId} × ${all[j].partId}: ${depth} мм`);
      }
    check('D3 нарисованные полки, перегородка и фасады ящиков не пересекаются', pairs.length === 0, pairs.slice(0, 3).join(' | ') || `деталей ${all.length}, пересечений 0`);
    await page.screenshot({ path: `${OUT}/D3-1440-3d-closed.png` });
    const drawerIds = stack.drawers.map((d) => d.id);
    /*
     * Ход идёт кадрами (18 % остатка за кадр): до 290 из 300 мм — около 17
     * кадров, а headless рисует 1–2 кадра в секунду (ловушка 97). Ждём до
     * 60 с и пишем, СКОЛЬКО кадров прошло: ящик, стоящий при идущих кадрах, —
     * дефект, и проверка это различает. Условие то же, что было.
     */
    const openFrames = await framesOf(page);
    const openStart = Date.now();
    must('D3 кнопка «Открыть» у ящика 2', await toggleDrawer(page, drawerIds[1]), 'НУЛЕВОЙ СЕЛЕКТОР: кнопки «Открыть» у ящика 2 нет');
    let slides = await waitFor(page, READ_SLIDES(drawerIds), (s) => s?.[drawerIds[1]] >= 290, 60_000);
    const openTook = `${Date.now() - openStart} мс, кадров ${frameDelta(openFrames, await framesOf(page))}`;
    check(
      'D3 выехал только ящик 2 (на 300 мм, наглядно), ящики 1 и 3 на месте; открытых ключей — один',
      slides?.[drawerIds[1]] >= 290 && slides?.[drawerIds[0]] === 0 && slides?.[drawerIds[2]] === 0 &&
        JSON.stringify(await page.evaluate(() => window.__mwOpenIds?.() ?? null)) === JSON.stringify([drawerIds[1]]),
      `сдвиг ${JSON.stringify(slides)} · открыто ${JSON.stringify(await page.evaluate(() => window.__mwOpenIds?.() ?? null))} · ${openTook}`,
    );
    await page.screenshot({ path: `${OUT}/D3-1440-3d-open.png` });
    const side = page.locator('[data-studio-viewport] [data-angle="left"]');
    if ((await side.count()) > 0) {
      await side.first().click();
      await sleep(1500);
      await page.screenshot({ path: `${OUT}/D3-1440-3d-side.png` });
      await page.locator('[data-studio-viewport] [data-angle="iso"]').first().click().catch(() => undefined);
      await sleep(1000);
    } else check('D3 ракурс «Слева»', false, 'НУЛЕВОЙ СЕЛЕКТОР: кнопки ракурса нет');
    /*
     * Ход идёт кадрами (18 % остатка за кадр, стоп в пределах 0,5 мм): закрыть
     * 292 мм — около 32 кадров, а headless рисует 1–2 кадра в секунду
     * (ловушка 97). Поэтому пишется, СКОЛЬКО кадров прошло, — ящик, стоящий
     * при идущих кадрах, это дефект, и проверка это различает.
     */
    const framesBefore = await page.evaluate(() => window.__mwCadFrames?.() ?? null);
    const closeStart = Date.now();
    await toggleDrawer(page, drawerIds[1]);
    slides = await waitFor(page, READ_SLIDES(drawerIds), (s) => s?.[drawerIds[1]] === 0, 60_000);
    const framesAfter = await page.evaluate(() => window.__mwCadFrames?.() ?? null);
    check(
      'D3 «Закрыть» — ящик 2 вернулся до 0, открытых нет',
      slides?.[drawerIds[1]] === 0 && (await page.evaluate(() => window.__mwOpenIds?.().length ?? -1)) === 0,
      `${JSON.stringify(slides)} · ${Date.now() - closeStart} мс, кадров ${framesBefore !== null && framesAfter !== null ? framesAfter - framesBefore : '—'}`,
    );
    /* Ящик 3 — нажатием мышью по нему в сцене: открывается и выбирается в инспекторе. */
    const point = await page.evaluate((id) => window.__mwPartPoint?.(id) ?? null, drawerIds[2]);
    let mouseTook = '';
    if (point) {
      /* __mwPartPoint отдаёт координаты страницы: отступ холста уже учтён. */
      const mouseFrames = await framesOf(page);
      const mouseStart = Date.now();
      await page.mouse.click(point.x, point.y);
      slides = await waitFor(page, READ_SLIDES(drawerIds), (s) => s?.[drawerIds[2]] >= 290, 60_000);
      mouseTook = ` · ${Date.now() - mouseStart} мс, кадров ${frameDelta(mouseFrames, await framesOf(page))}`;
    }
    const selectedNow = await page.evaluate(() => document.querySelector('[data-drawer-selected]')?.getAttribute('data-drawer-selected') ?? null);
    check(
      'D3 мышью по ящику 3 в сцене: он выехал и выбран в инспекторе (параметры этого ящика)',
      Boolean(point) && slides?.[drawerIds[2]] >= 290 && selectedNow === drawerIds[2],
      point ? `сдвиг ${slides?.[drawerIds[2]]} · выбран ${selectedNow ?? 'никто'}${mouseTook}` : 'НУЛЕВОЙ СЕЛЕКТОР: __mwPartPoint не нашёл ящик 3',
    );
    if (point) await toggleDrawer(page, drawerIds[2]);
    await sleep(800);

    /* ── D4. Высота блока 450 и ширина отсека ── */
    console.log('\n── D4. Высота блока 450 мм, отсек 1 → 600 мм');
    await view(page, 'facade');
    await typeInto(page, '[data-drawer-height-input]', 450);
    stack = await waitFor(page, READ_STACK, (s) => s?.zone === '0+450', 8_000);
    check(
      'D4 зона 450: три ящика по 150, фасады 468 × 146 · 146 · 142',
      stack?.zone === '0+450' && stack.drawers.map((d) => d.front).join(' ') === '468x146x16 468x146x16 468x142x16',
      stack ? `зона ${stack.zone} · ${stack.drawers.map((d) => d.front).join(' ')}` : 'НЕТ',
    );
    await chip(page, 'b1');
    await page.locator('[data-fill-editor] [data-bay-width-input]').first().fill('600');
    await fillAction(page, 'set-width');
    await chip(page, 'b2');
    stack = await waitFor(page, READ_STACK, (s) => s?.drawers?.[0]?.front?.startsWith('344x'), 8_000);
    check(
      'D4 отсек 1 600 → отсек 2 352: фасады ящиков 344 мм, полки отсека 1 — 598',
      stack?.drawers.every((d) => d.front.startsWith('344x')) && (await page.evaluate(READ_FILL))?.chips[0]?.width === 600,
      stack ? stack.drawers.map((d) => d.front).join(' ') : 'НЕТ',
    );
    const refused = await typeInto(page, '[data-drawer-count-input]', 7);
    const refusal = await waitFor(page, READ_FILL, (f) => Boolean(f?.refusal), 5_000);
    stack = await page.evaluate(READ_STACK);
    check(
      'D4 7 ящиков в 450 мм — отказ «доступно … требуется 96 мм», ящиков по-прежнему 3',
      refused && /требуется 96/.test(refusal?.refusal ?? '') && stack?.count === 3,
      `${refusal?.refusal ?? 'отказа нет'} · ящиков ${stack?.count}`,
    );
    await page.screenshot({ path: `${OUT}/D4-1440-inspector.png` });
    await saved(page);

    /* ── D4b. Библиотека: замена называет потерю ДО нажатия, «стоит сейчас» ничего не снимает ── */
    console.log('\n── D4b. Библиотека «Мебели»: замена шкафа называет потерю отсеков и ящиков до нажатия');
    const library = await page.evaluate(() => {
      const root = document.querySelector('[data-library="1"]');
      if (!root) return null;
      const cards = [...root.querySelectorAll('[data-card]')];
      const open = cards.filter((c) => c.getAttribute('data-refused') === '0' && c.getAttribute('aria-pressed') !== 'true');
      return {
        loss: root.querySelector('[data-library-loss]')?.textContent?.trim() ?? null,
        total: cards.length,
        replacing: open.length,
        marked: open.filter((c) => c.getAttribute('data-loss') === '1' && c.querySelector('[data-card-loss]')).length,
        current: cards.filter((c) => c.getAttribute('aria-pressed') === 'true').length,
      };
    });
    check(
      'D4b строка «Замена: Отсеки снимутся …» называет полки (4) и ящики (3); каждая доступная карточка замены помечена',
      Boolean(library?.loss && /полки \(4\)/.test(library.loss) && /ящики \(3\)/.test(library.loss)) &&
        library.replacing > 0 &&
        library.marked === library.replacing,
      library
        ? `«${library.loss ?? 'СТРОКИ НЕТ'}» · помечено ${library.marked} из ${library.replacing} доступных (${library.total} всего)`
        : 'НУЛЕВОЙ СЕЛЕКТОР: библиотеки модулей на экране нет',
    );
    await page.locator('[data-library="1"]').first().scrollIntoViewIfNeeded().catch(() => undefined);
    await page.screenshot({ path: `${OUT}/D4b-1440-library-loss.png` });
    const currentCard = page.locator('[data-library="1"] [data-card][aria-pressed="true"]').first();
    const hasCurrent = (await currentCard.count()) > 0;
    if (hasCurrent) {
      await currentCard.click();
      await sleep(1000);
    }
    stack = await page.evaluate(READ_STACK);
    const fillAfterCurrent = await page.evaluate(READ_FILL);
    check(
      'D4b нажатие на «стоит сейчас» не снимает ни отсеков, ни ящиков',
      hasCurrent && stack?.count === 3 && fillAfterCurrent?.chips.length === 2,
      hasCurrent
        ? `отсеков ${fillAfterCurrent?.chips.length ?? 0} · ящиков ${stack?.count ?? 0}`
        : 'НУЛЕВОЙ СЕЛЕКТОР: карточки «стоит сейчас» в библиотеке нет',
    );
    await chip(page, 'b2');

    /* ── D5. Деталировка и замок выпуска ── */
    console.log('\n── D5. Деталировка: фасады ящиков в раскрое, короба нет, выпуск заперт словами');
    await page.locator('[data-studio-open="panels"]').first().click();
    const panels = (await waitFor(page, READ_PANELS, (list) => Array.isArray(list) && list.length > 0, 20_000)).filter((p) => p.module === cabinetId);
    const fronts = panels.filter((p) => p.bay === 'b2');
    check(
      'D5 в раскрое отсека 2 только фронты ящиков: 146 × 344 × 16 · 2 и 142 × 344 × 16 · 1; ни боковин, ни дна ящика',
      fronts.map((p) => `${p.name} ${p.size}·${p.qty}`).join(' | ') === 'Фронт ящика 146x344x16·2 | Фронт ящика 142x344x16·1' &&
        !panels.some((p) => /ящика/.test(p.name) && !/Фронт/.test(p.name)),
      panels.map((p) => `${p.name}[${p.bay ?? '—'}] ${p.size}·${p.qty}`).join(' | ') || 'НУЛЕВОЙ СЕЛЕКТОР',
    );
    const lock = await page.evaluate(() => ({
      text: document.querySelector('[data-export-lock]')?.textContent ?? null,
      disabled: document.querySelector('[data-export-cut]')?.hasAttribute('disabled') ?? null,
    }));
    check(
      'D5 выгрузка для раскроя заперта словами: ящики отсеков — черновик, короб не рассчитан',
      Boolean(lock.text && /ящики отсеков/.test(lock.text) && /черновик/.test(lock.text)) && lock.disabled === true,
      `${lock.text ?? 'замка нет'} · кнопка ${lock.disabled ? 'заперта' : 'ОТКРЫТА'}`,
    );
    const ids3d = (await scene3d(page, cabinetId))?.parts.map((p) => p.partId) ?? null;
    check(
      'D5 ИД фасадов в раскрое = ИД в 3D',
      fronts.flatMap((p) => p.parts).sort().join() === cadFronts.map((p) => p.partId).sort().join(),
      `раскрой ${fronts.flatMap((p) => p.parts).length} · 3D ${cadFronts.length}${ids3d ? '' : ' (сцены сейчас нет — сверка по снятым ИД)'}`,
    );
    await page.screenshot({ path: `${OUT}/D5-1440-panels-preflight.png` });

    /* ── D6. Запись, перезагрузка, открытие без записи ── */
    console.log('\n── D6. Запись в базу, перезагрузка, открытие без записи');
    await saved(page);
    const { data: stored } = await service.from('projects').select('millwork').eq('id', project.id).single();
    const unitStored = Object.values(stored?.millwork?.runs ?? {}).flatMap((run) => run?.modules ?? []).find((m) => m.id === cabinetId);
    const storedStack = unitStored?.fill?.bays?.[1]?.drawers;
    const stackWords = (s) => (s ? `${s.id}|${s.fromMm}|${s.heightMm}|${s.drawers?.mode}|${s.drawers?.count}|${s.front}|${s.slideItemId}` : 'НЕТ');
    check(
      'D6 в базе `fill.bays[1].drawers`: d1, низ 0, высота 450, 3 поровну, вкладной, направляющая не выбрана; b1 600 / 4 полки',
      stackWords(storedStack) === 'd1|0|450|even|3|inset|null' && unitStored?.fill?.bays?.[0]?.widthMm === 600 && unitStored?.fill?.bays?.[0]?.shelves?.count === 4,
      `${stackWords(storedStack)} · b1 ${unitStored?.fill?.bays?.[0]?.widthMm ?? '—'}`,
    );
    const savedAtBefore = stored?.millwork?.savedAt ?? null;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 }).catch(() => undefined);
    await saved(page);
    await tool(page, 'furniture');
    await view(page, 'facade');
    await page.waitForSelector('[data-studio-viewport] [data-schematic]', { timeout: 30_000 }).catch(() => undefined);
    await pointModule(page, cabinetId);
    await chip(page, 'b2');
    stack = await waitFor(page, READ_STACK, (s) => s?.count === 3, 10_000);
    check(
      'D6 после перезагрузки: блок 3 ящика, зона 0+450, фасады 344 × 146 · 146 · 142',
      stack?.zone === '0+450' && stack.drawers.map((d) => d.front).join(' ') === '344x146x16 344x146x16 344x142x16',
      stack ? `${stack.zone} · ${stack.drawers.map((d) => d.front).join(' ')}` : 'НУЛЕВОЙ СЕЛЕКТОР',
    );

    /* ── D6b. Зона 450 после перезагрузки: лист, 3D и смета — одни миллиметры ── */
    console.log('\n── D6b. Зона 450 после перезагрузки: лист «Каркас», 3D и смета');
    const mode6 = page.locator('[data-studio-viewport] [data-schematic-mode]');
    if ((await mode6.count()) > 0 && (await mode6.first().getAttribute('data-schematic-mode')) !== 'frame') await mode6.first().click();
    await sleep(400);
    const sheet450 = await page.evaluate(READ_SHEET_DRAWERS);
    const sheet450Words = sheet450
      .slice()
      .sort((a, b) => a.yFrom - b.yFrom)
      .map((d) => `${d.from}…${d.to}/${d.yFrom}…${d.yTo}`)
      .join(' · ');
    check(
      'D6b лист «Каркас» после перезагрузки: фасады x 636…980, y 20…166 · 170…316 · 320…462 (зона 16…466 от дна корпуса)',
      sheet450Words === '636…980/20…166 · 636…980/170…316 · 636…980/320…462',
      sheet450Words || 'НУЛЕВОЙ СЕЛЕКТОР: фасадов ящиков на листе нет',
    );
    await page.screenshot({ path: `${OUT}/D6b-1440-front-sheet-450.png` });
    await view(page, '3d');
    const reSettled = await sceneSettled(page);
    check('D6 3D после перезагрузки готова', sceneOk(reSettled), sceneWords(reSettled));
    const frameBtn6 = page.locator('[data-studio-viewport] [data-scene-mode]');
    if ((await frameBtn6.count()) > 0 && (await frameBtn6.first().getAttribute('data-scene-mode')) === 'frame') await frameBtn6.first().click();
    await sleep(800);
    await page.screenshot({ path: `${OUT}/D6-1440-3d-after-reload.png` });
    const cad450 = ((await scene3d(page, cabinetId))?.parts ?? [])
      .filter((p) => /:b2:drawer:\d+:front$/.test(p.partId))
      .sort((a, b) => a.center[1] - b.center[1]);
    const sheetSorted = sheet450.slice().sort((a, b) => a.yFrom - b.yFrom);
    /* Сцена меряет от пола, лист — от дна корпуса: разница одна на все фасады — низ корпуса. */
    const lifts = cad450.map((p, i) => Math.round(p.center[1] - p.size[1] / 2) - (sheetSorted[i]?.yFrom ?? NaN));
    check(
      'D6b 3D после перезагрузки: фасады 344 × 146 · 146 · 142 × 16 на x 1536…1880; по высоте — те же 20 · 170 · 320 от дна корпуса, что на листе',
      cad450.length === 3 &&
        cad450.map((p) => `${p.size[0]}×${p.size[1]}×${p.size[2]}`).join(' ') === '344×146×16 344×146×16 344×142×16' &&
        cad450.every((p) => p.center[0] - p.size[0] / 2 === placed.offset + 636) &&
        lifts.every((l) => l === lifts[0] && Number.isFinite(l)),
      cad450.length
        ? `${cad450.map((p) => `${p.size.join('×')} x${p.center[0] - p.size[0] / 2} y${Math.round(p.center[1] - p.size[1] / 2)}`).join(' | ')} · низ корпуса ${lifts.join('/')}`
        : 'НУЛЕВОЙ СЕЛЕКТОР: фасадов ящиков в сцене нет',
    );
    const est6 = await page.evaluate(() => ({
      total: document.querySelector('[data-estimate-total]')?.getAttribute('data-estimate-total') ?? null,
      estimated: document.querySelector('[data-estimate-estimated]')?.getAttribute('data-estimate-estimated') ?? null,
    }));
    check(
      'D6b смета: рядом с итогом «в т. ч. оценка 61 500 ₸» — направляющие 3 × 6 500 и ящики 3 × 14 000 не выданы за подтверждённую цену',
      est6.estimated === '61500' && est6.total !== null,
      `итог ${est6.total ?? 'НЕТ'} · оценка ${est6.estimated ?? 'НЕТ'}`,
    );
    const estBar = page.locator('button[aria-expanded]:has([data-estimate-total])').first();
    if ((await estBar.count()) > 0) {
      await estBar.click();
      await sleep(500);
      const note = await page.evaluate(() => document.querySelector('[data-estimate-estimated-note]')?.textContent?.trim() ?? null);
      check(
        'D6b открытая смета называет оценку словами: направляющая не выбрана, короб не рассчитан',
        Boolean(note && /не выбрана/.test(note) && /короб не рассчитан/.test(note)),
        note ?? 'НУЛЕВОЙ СЕЛЕКТОР: строки об оценке нет',
      );
      await page.screenshot({ path: `${OUT}/D6b-1440-estimate.png` });
      await page.keyboard.press('Escape');
      await sleep(300);
    } else check('D6b открыть смету', false, 'НУЛЕВОЙ СЕЛЕКТОР: строки итога нет');
    await sleep(3500);
    const { data: reopened } = await service.from('projects').select('millwork').eq('id', project.id).single();
    check(
      'D6 простое открытие и переключение видов ничего не пишет: savedAt прежний',
      savedAtBefore !== null && reopened?.millwork?.savedAt === savedAtBefore,
      `${savedAtBefore} → ${reopened?.millwork?.savedAt}`,
    );

    /* ── D6c. Мастер → «Результат»: боковой разрез по отсеку с ящиками ── */
    console.log('\n── D6c. Мастер → «Результат»: боковой разрез — блок, фасады, габарит, отсек');
    await page.goto(`${BASE}/project/${project.id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const resultStep = page.getByRole('button', { name: /Результат/ }).first();
    must('D6c шаг «Результат» в мастере', (await resultStep.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: кнопки шага «Результат» нет');
    await resultStep.click({ timeout: 90_000 });
    await page.waitForSelector('[data-view="elevation"] [data-module-id]', { timeout: 60_000 }).catch(() => undefined);
    const sheetBox = await page.evaluate((id) => {
      const g = [...document.querySelectorAll('[data-view="elevation"] [data-module-id]')].find((n) => n.getAttribute('data-module-id') === id);
      if (!g) return null;
      g.scrollIntoView({ block: 'center' });
      const r = g.getBoundingClientRect();
      return { x: r.left + r.width * 0.75, y: r.top + r.height * 0.5 };
    }, cabinetId);
    must('D6c шкаф на фасаде листа', Boolean(sheetBox), `НУЛЕВОЙ СЕЛЕКТОР: модуля ${cabinetId} на листе нет`);
    await sleep(400);
    const sheetBox2 = await page.evaluate((id) => {
      const g = [...document.querySelectorAll('[data-view="elevation"] [data-module-id]')].find((n) => n.getAttribute('data-module-id') === id);
      const r = g?.getBoundingClientRect();
      return r ? { x: r.left + r.width * 0.75, y: r.top + r.height * 0.5 } : null;
    }, cabinetId);
    await page.mouse.click(sheetBox2.x, sheetBox2.y);
    const READ_SECTION = `(() => {
      const root = document.querySelector('[data-view="section-inside"]');
      if (!root) return null;
      const stack = root.querySelector('[data-section-drawer-stack]');
      const a = (n, k) => n?.getAttribute(k) ?? null;
      return {
        bay: root.querySelector('[data-section-bay]')?.getAttribute('data-section-bay') ?? null,
        stack: stack ? \`\${a(stack, 'data-from-mm')}…\${a(stack, 'data-to-mm')}\` : null,
        module: (() => { const m = root.querySelector('[data-section-module]'); return m ? \`\${a(m, 'data-bottom-mm')}…\${a(m, 'data-top-mm')}/\${a(m, 'data-depth-mm')}\` : null; })(),
        fronts: [...root.querySelectorAll('[data-section-drawer-front]')].map((n) => ({
          id: a(n, 'data-section-drawer-front'),
          words: \`\${a(n, 'data-y-from-mm')}…\${a(n, 'data-y-to-mm')}/\${a(n, 'data-depth-from-mm')}…\${a(n, 'data-depth-to-mm')}\`,
        })),
        envelopes: [...root.querySelectorAll('[data-section-drawer-envelope]')].map((n) => \`\${a(n, 'data-depth-from-mm')}…\${a(n, 'data-depth-to-mm')}=\${a(n, 'data-depth-mm')}\`),
      };
    })()`;
    const section = await waitFor(page, READ_SECTION, (s) => (s?.fronts?.length ?? 0) === 3, 20_000);
    const sectionFronts = (section?.fronts ?? []).map((f) => f.words).sort().join(' · ');
    check(
      'D6c разрез по отсеку 2: блок 16…466, фасады 20…166 · 170…316 · 320…462 на глубине 584…600, габарит 20…584 = 564 мм; корпус шкафа контуром; ИД фасадов = ИД раскроя',
      section?.bay === 'b2' &&
        section.stack === '16…466' &&
        sectionFronts === '170…316/584…600 · 20…166/584…600 · 320…462/584…600' &&
        section.envelopes.length === 3 &&
        section.envelopes.every((e) => e === '20…584=564') &&
        Boolean(section.module && section.module.endsWith('/600')) &&
        section.fronts.map((f) => f.id).sort().join() === drawerIds.map((id) => `${id}:front`).sort().join(),
      section
        ? `отсек ${section.bay} · блок ${section.stack} · корпус ${section.module} · фасады ${sectionFronts} · габарит ${section.envelopes.join(', ')}`
        : 'НУЛЕВОЙ СЕЛЕКТОР: вида «разрез с наполнением» на листе нет',
    );
    const sectionView = page.locator('[data-view="section-inside"]').first();
    if ((await sectionView.count()) > 0) {
      await sectionView.scrollIntoViewIfNeeded().catch(() => undefined);
      await sleep(300);
      await sectionView.screenshot({ path: `${OUT}/D6c-1440-section.png` });
    }
    check('ошибок страницы нет (1440)', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || 'ноль');
    await context.close();

    /* ── D7. Планшет 1024: касание ── */
    console.log('\n── D7. Планшет 1024: касанием выбрать шкаф, отсек, открыть ящик');
    const tablet = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: false });
    await tablet.addCookies(cookies);
    const tab = await tablet.newPage();
    const tabErrors = [];
    tab.on('pageerror', (e) => tabErrors.push(e.message.slice(0, 200)));
    await tab.goto(`${BASE}/project/${project.id}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await tab.waitForSelector('[data-studio-root]', { timeout: 60_000 }).catch(() => undefined);
    await saved(tab);
    await tool(tab, 'furniture');
    await view(tab, 'facade');
    await tab.waitForSelector('[data-studio-viewport] [data-schematic]', { timeout: 30_000 }).catch(() => undefined);
    await pointModule(tab, cabinetId, true);
    await chip(tab, 'b2', true);
    const tabStack = await waitFor(tab, READ_STACK, (s) => s?.count === 3, 10_000);
    check('D7 касанием выбран отсек 2 — блок из 3 ящиков в панели', tabStack?.count === 3, tabStack ? `${tabStack.count} ящ.` : 'НУЛЕВОЙ СЕЛЕКТОР');
    await view(tab, '3d');
    const tabSettled = await sceneSettled(tab);
    check('D7 1024: сцена готова', sceneOk(tabSettled), sceneWords(tabSettled));
    const tapToggle = tab.locator(`[data-fill-editor] [data-drawer-toggle="${drawerIds[0]}"]`);
    const tapFrames = await framesOf(tab);
    const tapStart = Date.now();
    if ((await tapToggle.count()) > 0) await tapToggle.first().tap();
    const tabSlides = await waitFor(tab, READ_SLIDES(drawerIds), (s) => s?.[drawerIds[0]] >= 290, 60_000);
    check(
      'D7 касанием «Открыть» у ящика 1 — выехал только он',
      tabSlides?.[drawerIds[0]] >= 290 && tabSlides?.[drawerIds[1]] === 0 && tabSlides?.[drawerIds[2]] === 0,
      `${JSON.stringify(tabSlides)} · ${Date.now() - tapStart} мс, кадров ${frameDelta(tapFrames, await framesOf(tab))}`,
    );
    const overflow = await tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('D7 1024: без горизонтального вылета', overflow <= 0, `вылет ${overflow} px`);
    await tab.screenshot({ path: `${OUT}/D7-1024-3d-open.png` });
    await view(tab, 'facade');
    const tabMode = tab.locator('[data-studio-viewport] [data-schematic-mode]');
    if ((await tabMode.count()) > 0 && (await tabMode.first().getAttribute('data-schematic-mode')) !== 'frame') await tabMode.first().tap();
    await sleep(500);
    await tab.screenshot({ path: `${OUT}/D7-1024-front-sheet.png` });
    check('ошибок страницы нет (1024)', tabErrors.length === 0, tabErrors.slice(0, 2).join(' | ') || 'ноль');
    await tablet.close();

    /* ── D8. Разрушительные правки: потеря названа ДО, «Отмена» не меняет ничего, подтверждение — снимает ── */
    console.log('\n── D8. «Заменить», «Секция», карточка библиотеки у шкафа с отсеками: подтверждение');
    const ctx8 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx8.addCookies(cookies);
    const p8 = await ctx8.newPage();
    const errors8 = [];
    p8.on('pageerror', (e) => errors8.push(e.message.slice(0, 200)));
    await p8.goto(`${BASE}/project/${project.id}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await p8.waitForSelector('[data-studio-root]', { timeout: 60_000 }).catch(() => undefined);
    await saved(p8);
    await tool(p8, 'furniture');
    await view(p8, 'facade');
    await p8.waitForSelector('[data-studio-viewport] [data-schematic]', { timeout: 30_000 }).catch(() => undefined);
    await pointModule(p8, cabinetId);
    await sleep(3500);
    const savedAt8 = (await service.from('projects').select('millwork').eq('id', project.id).single()).data?.millwork?.savedAt ?? null;
    const READ_LOSS = `(() => {
      const d = document.querySelector('[data-bay-loss-dialog]');
      return d ? (d.querySelector('[data-bay-loss-text]')?.textContent?.trim() ?? '') : null;
    })()`;
    const intact = async () => {
      await chip(p8, 'b2');
      const f = await p8.evaluate(READ_FILL);
      const s = await p8.evaluate(READ_STACK);
      return { bays: f?.chips?.length ?? 0, drawers: s?.count ?? 0, shelves: f?.chips?.[0]?.shelves ?? null };
    };
    const tryCancel = async (name, act, shot) => {
      const acted = await act();
      if (!acted) {
        check(`D8 ${name}: потеря названа до правки, «Отмена» — шкаф прежний`, false, `НУЛЕВОЙ СЕЛЕКТОР: ${name} на экране нет`);
        return;
      }
      const text = await waitFor(p8, READ_LOSS, (v) => v !== null, 8_000);
      if (shot) await p8.screenshot({ path: `${OUT}/${shot}` });
      const cancel = p8.locator('[data-bay-loss-dialog] [data-bay-loss-action="cancel"]');
      if ((await cancel.count()) > 0) await cancel.first().click();
      await sleep(500);
      const gone = (await p8.evaluate(READ_LOSS)) === null;
      const now = await intact();
      check(
        `D8 ${name}: потеря названа до правки (полки (4), ящики (3)), «Отмена» — шкаф прежний`,
        Boolean(text && /полки \(4\)/.test(text) && /ящики \(3\)/.test(text)) && gone && now.bays === 2 && now.drawers === 3 && now.shelves === 4,
        `«${text ?? 'ОКНА НЕТ'}» · после отмены: отсеков ${now.bays}, ящиков ${now.drawers}, полок отсека 1 ${now.shelves}`,
      );
    };
    await tryCancel(
      '«Заменить» в инспекторе',
      async () => {
        const b = p8.locator('[data-module-action="replace"]').first();
        if ((await b.count()) === 0) return false;
        await b.click();
        return true;
      },
      'D8-1440-dialog-replace.png',
    );
    await tryCancel('«Секция» → «штанга»', async () => {
      const s = p8.locator('label:has-text("Секция") select').first();
      if ((await s.count()) === 0) return false;
      const values = await s.evaluate((n) => [...n.options].map((o) => o.value));
      const target = values.find((v) => v && v !== 'shelves');
      if (!target) return false;
      await s.selectOption(target);
      return true;
    });
    await tryCancel('карточка библиотеки', async () => {
      const c = p8.locator('[data-library="1"] [data-card][data-refused="0"][aria-pressed="false"]').first();
      if ((await c.count()) === 0) return false;
      /*
       * Нажатие на уже выбранный инструмент сворачивает его панель
       * (`chooseTool`): на свежей странице «Мебель» уже выбрана, и панель с
       * библиотекой закрылась. Человек открыл бы её снова — так и здесь.
       */
      if (!(await c.isVisible())) {
        await tool(p8, 'furniture');
        await sleep(400);
      }
      await c.scrollIntoViewIfNeeded().catch(() => undefined);
      await c.click();
      return true;
    });
    await sleep(3500);
    const savedAt8b = (await service.from('projects').select('millwork').eq('id', project.id).single()).data?.millwork?.savedAt ?? null;
    check('D8 три отмены ничего не записали: savedAt прежний', savedAt8 !== null && savedAt8b === savedAt8, `${savedAt8} → ${savedAt8b}`);

    /* Подтверждение: «Заменить» → «Снять отсеки и применить» — отсеков нет, запись и перезагрузка это держат. */
    await p8.locator('[data-module-action="replace"]').first().click();
    await waitFor(p8, READ_LOSS, (v) => v !== null, 8_000);
    await p8.locator('[data-bay-loss-dialog] [data-bay-loss-action="confirm"]').first().click();
    await sleep(800);
    const after8 = await p8.evaluate(READ_FILL);
    await saved(p8);
    await sleep(500);
    const db8 = (await service.from('projects').select('millwork').eq('id', project.id).single()).data;
    const unit8 = Object.values(db8?.millwork?.runs ?? {}).flatMap((run) => run?.modules ?? []).find((m) => m.offsetMm === placed.offset);
    await p8.reload({ waitUntil: 'domcontentloaded' });
    await p8.waitForSelector('[data-studio-root]', { timeout: 60_000 }).catch(() => undefined);
    await saved(p8);
    await tool(p8, 'furniture');
    await view(p8, 'facade');
    await p8.waitForSelector('[data-studio-viewport] [data-schematic]', { timeout: 30_000 }).catch(() => undefined);
    await pointModule(p8, unit8?.id ?? cabinetId);
    const reloaded8 = await p8.evaluate(READ_FILL);
    check(
      'D8 подтверждение снимает отсеки: на экране, в базе и после перезагрузки отсеков нет, модуль на месте',
      (after8?.chips?.length ?? 0) === 0 &&
        Boolean(unit8) &&
        !unit8.fill?.bays &&
        (reloaded8?.chips?.length ?? -1) === 0 &&
        reloaded8?.module === unit8.id,
      `экран: отсеков ${after8?.chips?.length ?? '—'} · база: ${unit8 ? `${unit8.id}, отсеков ${unit8.fill?.bays?.length ?? 0}` : 'МОДУЛЯ НЕТ'} · после перезагрузки: ${reloaded8?.module ?? '—'}, отсеков ${reloaded8?.chips?.length ?? '—'}`,
    );
    check('ошибок страницы нет (D8)', errors8.length === 0, errors8.slice(0, 2).join(' | ') || 'ноль');
    await ctx8.close();
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
  } finally {
    /*
     * Уборка проверяется ЧТЕНИЕМ: supabase-js не бросает на ошибке запроса,
     * и несостоявшееся удаление оставило бы в базе чужую организацию молча.
     */
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
