/**
 * STAGE 01B — CAD-ОБОЛОЧКА STUDIO И ЗАМЕР НА ПЛАНЕ, ПУТЁМ ЭКРАНА.
 *
 * Запуск: node scripts/check-studio-cad-stage1b.mjs   (нужен build)
 *
 * Объект заводится служебным ключом — организация, пользователь, объект с
 * замером 3600 × 2800 × 3600 × 2800 без готового решения — и удаляется в
 * конце. Настоящий заказ клиента не трогается.
 *
 *   C1  Studio — CAD-оболочка: верхняя панель, рельс инструментов, панель
 *       инструмента, рабочая область, инспектор, нижняя строка видов. Ни
 *       полосы шагов мастера, ни вкладок 01A. План комнаты с первой
 *       отрисовки до первой записи ни разу не пропадает.
 *   C2  «Мебель»: в пустоту стены две «Дверцы 600» — base-0@w1 и
 *       base-600@w1; сцена фасадом.
 *   C3  «Замер»: в рабочей области ПЛАН КОМНАТЫ из замера — четыре стены
 *       w1…w4 с длинами, а не фасад шкафов; мебель стены w1 на плане.
 *   C4  Нажатие мышью на стену w1 — стена выделена, в инспекторе w1,
 *       3600 мм, «замерено».
 *   C5  Длина 3600 → 3700 в инспекторе: план и размер — 3700, остальные
 *       стены те же, зазор контура назван на плане (100 мм); ряд стены
 *       идёт за ней — в «Мебели» пустота 1200…3700, модули на месте.
 *   C6  Опасное укорочение до 1000: отказ «доступно 1000 мм, требуется
 *       1200 мм, не хватает 200 мм» с модулем, длина и мебель прежние.
 *       Поле длины: 50 и 3700.5 мм — слова у поля, в замер не идут.
 *   C7  Запись: в базе survey w1 = 3700 «замерено», ИД стен w1…w4, ряд
 *       свободной сборки прежний; простое открытие сохранённого объекта
 *       не пишет ничего; перезагрузка — те же длины и модули.
 *   C8  «Замер» ⇄ «Мебель» не меняет ни ряд, ни итог, ни запись в базе.
 *   C9  3D той же мебели; мастер /project/<id> при простом открытии
 *       ничего не пишет и показывает тот же ряд.
 *   C10 1440 и 1180: без горизонтального вылета.
 *   C11 1180: «Приблизить» и «Вписать»; конец стены w1 мышью к 3600 —
 *       привязка к параллельной стене 3, контур сошёлся, в базе 3600.
 *   C12 Планшет: 1180 и 1024 — рабочая область не уже 600 px, 834 в
 *       портрете — не уже 400; панель инструмента и инспектор одной
 *       колонкой справа; стена выбирается мышью. Ошибок страницы нет.
 *
 * Ноль найденных стен, модулей или элементов оболочки — FAIL со словами.
 * Снимки S1…S10 — в `.capture-check/studio-01b/`. Инструмент глазной
 * проверки, в `verify` не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = 3253;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/studio-01b';
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

function loadEnv() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const WALLS = [3600, 2800, 3600, 2800];

/** Замер объекта: формат `Survey` и формат `Measurement` — стены по кругу. */
function fixtureRoom(stamp) {
  const known = (value) => ({ state: 'measured', value });
  return {
    survey: {
      ceilingHeightMm: known(2700),
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
      measuredBy: 'проверка Studio 01B',
      measuredAt: '2026-10-10',
    },
    measurement: {
      id: `m-${stamp}`,
      ceilingHeightMm: 2700,
      walls: WALLS.map((lengthMm, i) => ({ id: `w${i + 1}`, lengthMm, angleDeg: 90, openings: [] })),
      comms: [],
      photos: [],
      measuredBy: 'проверка Studio 01B',
      measuredAt: '2026-10-10',
      notes: '',
    },
  };
}

/* ─────────────────────────  чтение экрана  ───────────────────────── */

/** Оболочка Studio: что из неё есть на странице. */
const READ_SHELL = `(() => {
  const root = document.querySelector('[data-studio-root]');
  const tools = [...document.querySelectorAll('[data-studio-rail] [data-studio-tool]')].map((n) => ({
    key: n.getAttribute('data-studio-tool'),
    on: n.getAttribute('aria-pressed') === 'true',
  }));
  const views = [...document.querySelectorAll('[data-studio-bottombar] [data-studio-view]')].map((n) => ({
    key: n.getAttribute('data-studio-view'),
    on: n.getAttribute('aria-pressed') === 'true',
  }));
  const viewport = document.querySelector('[data-studio-viewport]');
  return {
    root: Boolean(root),
    shell: root?.getAttribute('data-studio-shell') ?? null,
    topbar: Boolean(document.querySelector('[data-studio-topbar]')),
    rail: Boolean(document.querySelector('[data-studio-rail]')),
    context: document.querySelector('[data-studio-context]')?.getAttribute('data-studio-context') ?? null,
    viewport: viewport ? viewport.getAttribute('data-view') : null,
    inspector: Boolean(document.querySelector('[data-studio-inspector]')),
    bottombar: Boolean(document.querySelector('[data-studio-bottombar]')),
    tools,
    views,
    oldTabs: document.querySelectorAll('[data-studio-tab]').length,
    wizardSteps: document.querySelectorAll('nav[aria-label="Шаги работы"]').length,
    surveyPanelMain: Boolean(viewport?.querySelector('[data-survey-step]')),
  };
})()`;

/** План комнаты в рабочей области: стены, размеры, мебель. */
const READ_PLAN = `(() => {
  const plan = document.querySelector('[data-studio-viewport] [data-room-plan]');
  if (!plan) return null;
  const walls = [...plan.querySelectorAll('[data-plan-wall]')].map((g) => ({
    id: g.getAttribute('data-plan-wall'),
    length: Number(g.getAttribute('data-length')),
    state: g.getAttribute('data-state'),
    selected: g.getAttribute('data-selected') === 'true',
    dim: plan.querySelector('[data-plan-dim="' + g.getAttribute('data-plan-wall') + '"]')?.textContent?.trim() ?? null,
  }));
  return {
    kind: plan.getAttribute('data-plan-kind'),
    walls,
    modules: [...plan.querySelectorAll('[data-plan-module]')].map((n) => n.getAttribute('data-plan-module')),
    gap: plan.querySelector('[data-plan-gap]')?.getAttribute('data-plan-gap') ?? null,
    facade: Boolean(document.querySelector('[data-studio-viewport] [data-schematic]')),
  };
})()`;

/** Инспектор стены. */
const READ_WALL = `(() => {
  const n = document.querySelector('[data-studio-inspector] [data-wall-inspector]');
  if (!n) return null;
  return {
    id: n.getAttribute('data-wall-inspector'),
    length: Number(n.getAttribute('data-wall-length')),
    state: n.getAttribute('data-wall-state'),
    refusal: n.querySelector('[data-wall-refusal]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
  };
})()`;

/** Модули активной стены на схеме фасада — числами цеха. */
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

/** Пустоты активной стены на схеме фасада. */
const READ_GAPS = `(() => {
  const root = document.querySelector('[data-studio-viewport] [data-schematic]');
  if (!root) return null;
  const scope = root.querySelector('[data-wall-block][aria-current="true"]') || root;
  return [...scope.querySelectorAll('[data-gap-from]')].map((n) => ({
    from: Number(n.getAttribute('data-gap-from')),
    width: Number(n.getAttribute('data-gap-width')),
    row: n.getAttribute('data-gap-row'),
  }));
})()`;

const READ_TOTAL = `(() => {
  const n = document.querySelector('[data-estimate-total]');
  return n ? Number(n.getAttribute('data-estimate-total')) : null;
})()`;

const READ_SAVE = `(() => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null)()`;

/** Раскладка оболочки: вылет страницы и прямоугольники рабочей области и панелей. */
const READ_LAYOUT = `(() => {
  const box = (selector) => {
    const node = document.querySelector(selector);
    if (!node || getComputedStyle(node).display === 'none') return null;
    const r = node.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  };
  return {
    over: document.documentElement.scrollWidth - window.innerWidth,
    viewport: box('[data-studio-viewport]'),
    context: box('[data-studio-context]'),
    inspector: box('[data-studio-inspector]'),
    walls: document.querySelectorAll('[data-studio-viewport] [data-plan-wall]').length,
  };
})()`;

const boxWords = (b) => (b ? `${b.left}+${b.width}×${b.height}@${b.top}` : 'НЕТ');

/**
 * Планшет: рабочая область не уже `minViewport`, панель инструмента и
 * инспектор — одной колонкой справа от неё, план со стенами, без вылета.
 */
function tabletOk(layout, minViewport) {
  return (
    layout.over <= 0 &&
    (layout.viewport?.width ?? 0) >= minViewport &&
    Boolean(layout.context) &&
    Boolean(layout.inspector) &&
    layout.context.left === layout.inspector.left &&
    layout.context.left > layout.viewport.left &&
    layout.context.top < layout.inspector.top &&
    layout.walls === 4
  );
}
const layoutWords = (layout) =>
  `лишних ${layout.over} px · рабочая ${boxWords(layout.viewport)} · панель ${boxWords(layout.context)} · ` +
  `инспектор ${boxWords(layout.inspector)} · стен ${layout.walls}`;

async function waitFor(page, script, test, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  let value = await page.evaluate(script);
  while (!test(value) && Date.now() < until) {
    await sleep(250);
    value = await page.evaluate(script);
  }
  return value;
}

const rowWords = (row) => (row && row.length ? row.map((m) => `${m.id}@${m.offset}+${m.width}`).join(' ') : 'модулей нет');
const wallWords = (plan) =>
  plan && plan.walls.length ? plan.walls.map((w) => `${w.id}:${w.length}${w.state === 'measured' ? '' : `(${w.state})`}`).join(' ') : 'стен нет';

/** Инструмент рельса. */
async function tool(page, key) {
  const button = page.locator(`[data-studio-rail] [data-studio-tool="${key}"]`);
  if ((await button.count()) === 0) return false;
  await button.first().click({ timeout: 15_000 });
  await sleep(400);
  return true;
}

/** Вид рабочей области в нижней строке. */
async function view(page, key) {
  const button = page.locator(`[data-studio-bottombar] [data-studio-view="${key}"]`);
  if ((await button.count()) === 0) return false;
  await button.first().click({ timeout: 15_000 });
  await sleep(400);
  return true;
}

/** Нажать на пустоту активной стены фасада. */
async function clickGap(page, fromMm, row = 'base') {
  return page.evaluate(
    ([from, r]) => {
      const root = document.querySelector('[data-studio-viewport] [data-schematic]');
      const scope = root?.querySelector('[data-wall-block][aria-current="true"]') || root;
      const target = scope?.querySelector(`[data-gap-from="${from}"][data-gap-row="${r}"]`);
      target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return Boolean(target);
    },
    [fromMm, row],
  );
}

/** Карточка библиотеки по варианту и ширине — доступная. */
async function pickCard(page, variant, width) {
  const cards = await waitFor(
    page,
    `(() => {
      const panel = document.querySelector('[data-library="1"]');
      if (!panel) return null;
      return [...panel.querySelectorAll('[data-card]')].map((n) => ({
        key: n.getAttribute('data-card'),
        variant: n.getAttribute('data-variant'),
        width: Number(n.getAttribute('data-width')),
        refused: n.getAttribute('data-refused') === '1',
        reason: n.getAttribute('title'),
      }));
    })()`,
    (list) => Array.isArray(list) && list.length > 0,
  );
  if (!cards) return { error: 'НУЛЕВОЙ СЕЛЕКТОР: панель библиотеки не открылась' };
  const card = cards.find((c) => c.variant === variant && c.width === width && !c.refused);
  if (!card) return { error: `НУЛЕВОЙ СЕЛЕКТОР: карточки «${variant} ${width}» нет среди ${cards.length}` };
  await page.evaluate((key) => {
    const n = document.querySelector(`[data-library="1"] [data-card="${key}"]`);
    n?.scrollIntoView({ block: 'center' });
    n?.click();
  }, card.key);
  return { card };
}

/** Нажать мышью на середину стены плана — настоящим указателем. */
async function clickWall(page, wallId) {
  const box = await page.evaluate((id) => {
    const hit = document.querySelector(`[data-studio-viewport] [data-plan-wall="${id}"] [data-plan-hit]`);
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, wallId);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  await sleep(300);
  return true;
}

/** Ввести длину стены в инспекторе. */
async function typeWallLength(page, mm) {
  const input = page.locator('[data-studio-inspector] [data-wall-length-input]').first();
  if ((await input.count()) === 0) return false;
  await input.fill(String(mm));
  await input.press('Enter');
  await sleep(600);
  return true;
}

/** Дождаться «Сохранено» после правки. */
async function saved(page) {
  return waitFor(page, READ_SAVE, (v) => v === 'saved', 30_000);
}

/** Что именно поменялось в состоянии объекта — пути полей, не больше 12. */
function diffPaths(a, b, path = '', out = []) {
  if (out.length >= 12 || JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) diffPaths(a[key], b[key], path ? `${path}.${key}` : key, out);
    return out;
  }
  out.push(`${path || '(корень)'}: ${String(JSON.stringify(a)).slice(0, 80)} → ${String(JSON.stringify(b)).slice(0, 80)}`);
  return out;
}

/** Какие состояния показал индикатор записи за `ms` — по порядку, без повторов подряд. */
async function watchSave(page, ms) {
  const states = [];
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const state = await page.evaluate(READ_SAVE).catch(() => null);
    if (state && states[states.length - 1] !== state) states.push(state);
    await sleep(100);
  }
  return states;
}

/* ─────────────────────────  сценарий  ───────────────────────── */

async function scenario(browser) {
  loadEnv();
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !ANON || !SERVICE || /your-project|example/.test(URL)) {
    check('Studio 01B: ключи Supabase есть', false, 'НЕ ПРОВЕРЕНО — нет ключей Supabase в .env.local');
    return;
  }
  const service = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = Date.now();
  const email = `studio-${stamp}@example.test`;
  const password = `Pw-${stamp}-studio!`;
  const made = { user: null, org: null, project: null };
  mkdirSync(OUT, { recursive: true });
  try {
    const { data: created, error: userError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (userError) throw new Error(`createUser: ${userError.message}`);
    made.user = created.user.id;
    const { data: org, error: orgError } = await service
      .from('orgs')
      .insert({ slug: `studio-${stamp}`, name: `Проверка Studio 01B ${stamp}` })
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies(
      jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' })),
    );
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
        address: 'Проверка Studio 01B',
        zone: 'Кухня',
        client_name: 'Проверка',
        measurements: room.measurement,
        millwork: {
          survey: room.survey,
          requirements: {
            zone: 'kitchen',
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
          },
        },
        status: 'in_progress',
      })
      .select('id')
      .single();
    if (projectError) throw new Error(`insert project: ${projectError.message}`);
    made.project = project.id;

    /* ── C1. CAD-оболочка ── */
    console.log('\n── C1. Studio — CAD-оболочка');
    const response = await page.goto(`${BASE}/project/${project.id}/room`, { waitUntil: 'commit', timeout: 120_000 });
    /*
     * План с первой отрисовки до первой записи — каждые 20 мс. Объект без
     * сохранённого состояния пишется сразу после открытия, и это обновление
     * однажды уже стирало план на 2,5 с: граница загрузки по требованию
     * уходила на клиентскую отрисовку, пока грузился её чанк.
     */
    const firstPaint = [];
    let reachedSaved = false;
    const paintUntil = Date.now() + 30_000;
    while (Date.now() < paintUntil) {
      const frame = await page
        .evaluate(() => ({
          walls: document.querySelectorAll('[data-studio-viewport] [data-room-plan] [data-plan-wall]').length,
          save: document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null,
        }))
        .catch(() => null);
      if (frame) {
        /* Кадр пишется при смене числа стен; запись меряется отдельно — она меняется не вместе со стенами. */
        if (firstPaint.length === 0 || firstPaint[firstPaint.length - 1].walls !== frame.walls) firstPaint.push(frame);
        if (frame.save === 'saved') {
          reachedSaved = true;
          break;
        }
      }
      await sleep(20);
    }
    const firstPlan = firstPaint.findIndex((f) => f.walls > 0);
    const blankAfterPlan = firstPlan >= 0 && firstPaint.slice(firstPlan).some((f) => f.walls === 0);
    check(
      'C1 план комнаты на месте с первой отрисовки до первой записи — пустого кадра нет',
      firstPlan >= 0 && !blankAfterPlan && reachedSaved,
      `стен по кадрам: ${firstPaint.map((f) => `${f.walls}${f.save ? `/${f.save}` : ''}`).join(' → ') || 'НУЛЕВОЙ СЕЛЕКТОР: плана не было'} · ` +
        `первая запись ${reachedSaved ? 'saved' : 'НЕ ДОШЛА за 30 с'}`,
    );
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 }).catch(() => undefined);
    await page.waitForSelector('[data-save-state]', { timeout: 30_000 }).catch(() => undefined);
    const shell = await page.evaluate(READ_SHELL);
    const toolKeys = shell.tools.map((t) => t.key);
    const viewKeys = shell.views.map((v) => v.key);
    check(
      'C1 оболочка: верхняя панель, рельс, панель инструмента, рабочая область, инспектор, нижняя строка',
      response?.status() === 200 &&
        shell.root &&
        shell.shell === 'cad' &&
        shell.topbar &&
        shell.rail &&
        shell.context !== null &&
        shell.viewport !== null &&
        shell.inspector &&
        shell.bottombar,
      `HTTP ${response?.status()} · оболочка ${shell.shell ?? 'НЕТ'} · верх ${shell.topbar} · рельс ${shell.rail} · ` +
        `панель ${shell.context ?? 'НЕТ'} · вид ${shell.viewport ?? 'НЕТ'} · инспектор ${shell.inspector} · низ ${shell.bottombar}`,
    );
    check(
      'C1 инструменты рельса и виды нижней строки — все на месте; вкладок 01A и полосы шагов мастера нет',
      ['select', 'measure', 'furniture', 'construction', 'materials', 'documents'].every((k) => toolKeys.includes(k)) &&
        ['plan', 'facade', '3d'].every((k) => viewKeys.includes(k)) &&
        shell.oldTabs === 0 &&
        shell.wizardSteps === 0,
      `инструменты ${toolKeys.join(', ') || 'НУЛЕВОЙ СЕЛЕКТОР'} · виды ${viewKeys.join(', ') || 'НУЛЕВОЙ СЕЛЕКТОР'} · ` +
        `вкладок 01A ${shell.oldTabs} · полос мастера ${shell.wizardSteps}`,
    );
    await page.screenshot({ path: `${OUT}/S1-shell-1440.png` });

    /* ── C2. Мебель: две дверцы ── */
    console.log('\n── C2. «Мебель»: две «Дверцы 600» без готового решения');
    const furnitureTool = await tool(page, 'furniture');
    if (!(await view(page, 'facade'))) check('C2 вид «Фасад» есть', false, 'НУЛЕВОЙ СЕЛЕКТОР: кнопки вида «Фасад» нет');
    await page.waitForSelector('[data-studio-viewport] [data-schematic]', { timeout: 30_000 }).catch(() => undefined);
    let row = await page.evaluate(READ_ROW);
    for (const from of [0, 600]) {
      const clicked = await clickGap(page, from);
      if (!clicked) {
        check(`C2 пустота ${from} на фасаде`, false, `НУЛЕВОЙ СЕЛЕКТОР: пустоты ${from} нет · ${rowWords(row)}`);
        continue;
      }
      const picked = await pickCard(page, 'door', 600);
      if (picked.error) check(`C2 карточка «Дверца 600» в пустоте ${from}`, false, picked.error);
      row = await waitFor(page, READ_ROW, (r) => Array.isArray(r) && r.some((m) => m.offset === from), 20_000);
    }
    check(
      'C2 на стене w1 две «Дверцы 600» — base-0@w1 и base-600@w1',
      furnitureTool && rowWords(row) === 'base-0@w1@0+600 base-600@w1@600+600',
      furnitureTool ? rowWords(row) : 'НУЛЕВОЙ СЕЛЕКТОР: инструмента «Мебель» нет',
    );
    await saved(page);

    /* ── C3. Замер: план комнаты ── */
    console.log('\n── C3. «Замер»: план комнаты из замера');
    const measureTool = await tool(page, 'measure');
    const plan = await waitFor(page, READ_PLAN, (p) => p !== null && p.walls.length > 0, 20_000);
    check(
      'C3 «Замер» показывает план комнаты, а не фасад шкафов',
      measureTool && plan?.kind === 'room' && plan.facade === false,
      !measureTool
        ? 'НУЛЕВОЙ СЕЛЕКТОР: инструмента «Замер» нет'
        : plan
          ? `план ${plan.kind} · фасад в рабочей области ${plan.facade}`
          : 'НУЛЕВОЙ СЕЛЕКТОР: плана комнаты в рабочей области нет',
    );
    check(
      'C3 на плане четыре стены замера с длинами и мебель стены w1; контур сходится',
      plan?.walls.length === 4 &&
        wallWords(plan) === 'w1:3600 w2:2800 w3:3600 w4:2800' &&
        plan.walls.every((w) => w.dim === String(w.length)) &&
        plan.modules.includes('base-0@w1') &&
        plan.modules.includes('base-600@w1') &&
        plan.gap === null,
      `${wallWords(plan)} · размеры ${plan ? plan.walls.map((w) => w.dim).join(' ') : '—'} · мебель ${plan?.modules.join(' ') || 'НЕТ'} · ` +
        `зазор контура ${plan?.gap ?? 'нет'}`,
    );
    await page.screenshot({ path: `${OUT}/S2-measure-plan.png` });

    /* ── C4. Выбор стены мышью ── */
    console.log('\n── C4. Нажатие на стену w1');
    const wallClicked = await clickWall(page, 'w1');
    const picked = await waitFor(page, READ_WALL, (w) => w !== null, 10_000);
    const planAfterPick = await page.evaluate(READ_PLAN);
    check(
      'C4 стена w1 выделена; в инспекторе w1, 3600 мм, «замерено»',
      wallClicked &&
        picked?.id === 'w1' &&
        picked.length === 3600 &&
        picked.state === 'measured' &&
        Boolean(planAfterPick?.walls.find((w) => w.id === 'w1')?.selected),
      !wallClicked
        ? 'НУЛЕВОЙ СЕЛЕКТОР: области нажатия стены w1 нет'
        : picked
          ? `инспектор ${picked.id} ${picked.length} ${picked.state} · выделена ${planAfterPick?.walls.filter((w) => w.selected).map((w) => w.id).join(',') || 'НИЧЕГО'}`
          : 'НУЛЕВОЙ СЕЛЕКТОР: инспектора стены нет',
    );
    await page.screenshot({ path: `${OUT}/S3-wall-selected.png` });

    /* ── C5. Длина 3600 → 3700 ── */
    console.log('\n── C5. Длина стены 3600 → 3700');
    const totalBefore = await page.evaluate(READ_TOTAL);
    const typed = await typeWallLength(page, 3700);
    const longer = await waitFor(page, READ_PLAN, (p) => p?.walls.find((w) => w.id === 'w1')?.length === 3700, 10_000);
    const wallLonger = await page.evaluate(READ_WALL);
    check(
      'C5 план и размерная линия — 3700; инспектор — 3700 «замерено»; остальные стены те же; зазор контура 100 мм назван',
      typed &&
        wallWords(longer) === 'w1:3700 w2:2800 w3:3600 w4:2800' &&
        longer.walls.find((w) => w.id === 'w1')?.dim === '3700' &&
        longer.gap === '100' &&
        wallLonger?.length === 3700 &&
        wallLonger.state === 'measured' &&
        !wallLonger.refusal,
      typed
        ? `${wallWords(longer)} · размер w1 ${longer?.walls.find((w) => w.id === 'w1')?.dim ?? 'НЕТ'} · зазор ${longer?.gap ?? 'НЕ НАЗВАН'} · ` +
            `инспектор ${wallLonger?.length} ${wallLonger?.state}` +
            (wallLonger?.refusal ? ` · ОТКАЗ «${wallLonger.refusal}»` : '')
        : 'НУЛЕВОЙ СЕЛЕКТОР: поля длины стены в инспекторе нет',
    );
    await page.screenshot({ path: `${OUT}/S4-wall-length-3700.png` });
    await saved(page);
    await tool(page, 'furniture');
    await view(page, 'facade');
    await page.waitForSelector('[data-studio-viewport] [data-schematic]', { timeout: 30_000 }).catch(() => undefined);
    const rowLonger = await waitFor(page, READ_ROW, (r) => Array.isArray(r) && r.length === 2, 15_000);
    const gapsLonger = await page.evaluate(READ_GAPS);
    const totalLonger = await page.evaluate(READ_TOTAL);
    check(
      'C5 ряд идёт за стеной: модули на местах, справа пустота 1200…3700, итог прежний',
      rowWords(rowLonger) === 'base-0@w1@0+600 base-600@w1@600+600' &&
        Boolean(gapsLonger?.some((g) => g.row === 'base' && g.from === 1200 && g.width === 2500)) &&
        totalLonger === totalBefore,
      `${rowWords(rowLonger)} · пустоты ${(gapsLonger ?? []).filter((g) => g.row === 'base').map((g) => `${g.from}+${g.width}`).join(' ') || 'НЕТ'} · итог ${totalBefore} → ${totalLonger}`,
    );

    /* ── C6. Опасное укорочение ── */
    console.log('\n── C6. Укорочение до 1000 — мебель занимает 0…1200');
    await tool(page, 'measure');
    await waitFor(page, READ_PLAN, (p) => p !== null, 10_000);
    await clickWall(page, 'w1');
    await waitFor(page, READ_WALL, (w) => w?.id === 'w1', 10_000);
    await typeWallLength(page, 1000);
    const refused = await waitFor(page, READ_WALL, (w) => Boolean(w?.refusal), 10_000);
    const planRefused = await page.evaluate(READ_PLAN);
    check(
      'C6 отказ числами: доступно 1000 мм, требуется 1200 мм, не хватает 200 мм — с модулем; длина прежняя',
      Boolean(
        refused?.refusal?.includes('доступно 1000 мм') &&
          refused.refusal.includes('требуется 1200 мм') &&
          refused.refusal.includes('не хватает 200 мм') &&
          refused.refusal.includes('base-600@w1'),
      ) &&
        refused.length === 3700 &&
        planRefused?.walls.find((w) => w.id === 'w1')?.length === 3700,
      refused?.refusal ? `«${refused.refusal}» · длина ${refused.length} · план ${wallWords(planRefused)}` : 'НУЛЕВОЙ СЕЛЕКТОР: отказа нет',
    );

    /* Поле длины само не пускает в замер число вне 200…20000 и дробное — словами у поля. */
    const typedBad = [];
    for (const [raw, words] of [
      ['50', 'от 200 до 20000 мм'],
      ['3700.5', 'целое число'],
    ]) {
      const input = page.locator('[data-studio-inspector] [data-wall-length-input]').first();
      if ((await input.count()) === 0) {
        typedBad.push({ raw, ok: false, words: 'НУЛЕВОЙ СЕЛЕКТОР: поля длины нет' });
        continue;
      }
      await input.fill(raw);
      await input.press('Enter');
      await sleep(400);
      const after = await page.evaluate(() => ({
        note: document.querySelector('[data-studio-inspector] [data-wall-input-note]')?.textContent?.trim() ?? null,
        length: Number(document.querySelector('[data-studio-inspector] [data-wall-inspector]')?.getAttribute('data-wall-length')),
        plan: Number(document.querySelector('[data-studio-viewport] [data-plan-wall="w1"]')?.getAttribute('data-length')),
        field: document.querySelector('[data-studio-inspector] [data-wall-length-input]')?.value ?? null,
      }));
      typedBad.push({
        raw,
        ok: Boolean(after.note?.includes(words)) && after.length === 3700 && after.plan === 3700 && after.field === '3700',
        words: `${after.note ?? 'НЕТ СЛОВ'} · инспектор ${after.length} · план ${after.plan} · поле ${after.field}`,
      });
    }
    check(
      'C6 поле длины: 50 и 3700.5 мм — слова у поля, длина, план и поле прежние (3700)',
      typedBad.length === 2 && typedBad.every((item) => item.ok),
      typedBad.map((item) => `${item.raw}: ${item.words}`).join(' | '),
    );

    await tool(page, 'furniture');
    await view(page, 'facade');
    await page.waitForSelector('[data-studio-viewport] [data-schematic]', { timeout: 30_000 }).catch(() => undefined);
    const rowRefused = await waitFor(page, READ_ROW, (r) => Array.isArray(r) && r.length > 0, 15_000);
    check(
      'C6 мебель не удалена и не сдвинута',
      rowWords(rowRefused) === 'base-0@w1@0+600 base-600@w1@600+600',
      rowWords(rowRefused),
    );

    /* ── C7. Запись и перезагрузка ── */
    console.log('\n── C7. Запись и перезагрузка');
    const savedState = await saved(page);
    const { data: stored } = await service.from('projects').select('millwork').eq('id', project.id).single();
    const storedWalls = (stored?.millwork?.survey?.walls ?? []).map((w) => `${w.id}:${w.lengthMm?.value ?? '?'}:${w.lengthMm?.state ?? '?'}`).join(' ');
    const storedRun = (stored?.millwork?.runs?.optimal?.modules ?? []).map((m) => `${m.id}@${m.offsetMm}+${m.widthMm}`).join(' ');
    check(
      'C7 в базе: survey w1 = 3700 «замерено», ИД стен w1…w4, ряд свободной сборки прежний',
      savedState === 'saved' &&
        storedWalls === 'w1:3700:measured w2:2800:measured w3:3600:measured w4:2800:measured' &&
        stored?.millwork?.requirements?.mode === 'free' &&
        storedRun === 'base-0@w1@0+600 base-600@w1@600+600',
      `запись ${savedState ?? 'НЕТ'} · стены ${storedWalls || 'НЕТ'} · режим ${stored?.millwork?.requirements?.mode ?? 'НЕТ'} · ряд ${storedRun || 'НЕТ'}`,
    );
    /*
     * Простое открытие сохранённого объекта не пишет ничего. Новый объект
     * (C1) пишется сразу — это контроль того, что запись здесь видна: тот
     * же индикатор и тот же `savedAt` там поменялись.
     */
    const openBefore = stored?.millwork ? JSON.stringify(stored.millwork) : null;
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 }).catch(() => undefined);
    const openStates = await watchSave(page, 6000);
    const { data: reopened } = await service.from('projects').select('millwork').eq('id', project.id).single();
    check(
      'C7 простое открытие сохранённого объекта ничего не пишет: состояние в базе то же до символа, «Сохраняем…» не было',
      openBefore !== null && JSON.stringify(reopened?.millwork) === openBefore && !openStates.includes('saving'),
      `${openBefore === null ? 'НУЛЕВОЙ СЕЛЕКТОР: состояния объекта в базе нет' : JSON.stringify(reopened?.millwork) === openBefore ? 'состояние то же' : `СОСТОЯНИЕ ИЗМЕНИЛОСЬ: ${diffPaths(stored.millwork, reopened?.millwork).join(' | ')}`} · ` +
        `savedAt ${stored?.millwork?.savedAt === reopened?.millwork?.savedAt ? 'прежний' : 'ИЗМЕНИЛСЯ'} · индикатор за 6 с: ${openStates.join(' → ') || 'НЕТ'}`,
    );
    await tool(page, 'measure');
    const planReload = await waitFor(page, READ_PLAN, (p) => p !== null && p.walls.length > 0, 20_000);
    await clickWall(page, 'w1');
    const wallReload = await waitFor(page, READ_WALL, (w) => w?.id === 'w1', 10_000);
    check(
      'C7 перезагрузка: план w1 3700, остальные стены те же, зазор 100 мм, инспектор w1 3700 «замерено»',
      wallWords(planReload) === 'w1:3700 w2:2800 w3:3600 w4:2800' &&
        planReload?.gap === '100' &&
        wallReload?.length === 3700 &&
        wallReload.state === 'measured',
      `${wallWords(planReload)} · зазор ${planReload?.gap ?? 'НЕ НАЗВАН'} · ` +
        `инспектор ${wallReload ? `${wallReload.id} ${wallReload.length} ${wallReload.state}` : 'НЕТ'}`,
    );
    await page.screenshot({ path: `${OUT}/S5-after-reload.png` });

    /* ── C8. Замер ⇄ Мебель не меняет проект ── */
    console.log('\n── C8. «Замер» ⇄ «Мебель» — без записи и без пересборки');
    const { data: beforeSwitch } = await service.from('projects').select('millwork').eq('id', project.id).single();
    await tool(page, 'furniture');
    await view(page, 'facade');
    await page.waitForSelector('[data-studio-viewport] [data-schematic]', { timeout: 30_000 }).catch(() => undefined);
    const rowA = await waitFor(page, READ_ROW, (r) => Array.isArray(r) && r.length > 0, 15_000);
    const totalA = await page.evaluate(READ_TOTAL);
    await tool(page, 'measure');
    await waitFor(page, READ_PLAN, (p) => p !== null, 10_000);
    await tool(page, 'furniture');
    await view(page, 'facade');
    const rowB = await waitFor(page, READ_ROW, (r) => Array.isArray(r) && r.length > 0, 15_000);
    const totalB = await page.evaluate(READ_TOTAL);
    await sleep(3000);
    const saveAfterSwitch = await page.evaluate(READ_SAVE);
    const { data: afterSwitch } = await service.from('projects').select('millwork').eq('id', project.id).single();
    check(
      'C8 ряд, итог и запись в базе те же; новой записи не было',
      rowWords(rowA) === 'base-0@w1@0+600 base-600@w1@600+600' &&
        rowWords(rowB) === rowWords(rowA) &&
        totalA !== null &&
        totalB === totalA &&
        saveAfterSwitch !== 'saving' &&
        beforeSwitch?.millwork?.savedAt === afterSwitch?.millwork?.savedAt,
      `${rowWords(rowA)} → ${rowWords(rowB)} · итог ${totalA} → ${totalB} · сохранение ${saveAfterSwitch} · ` +
        `savedAt ${beforeSwitch?.millwork?.savedAt === afterSwitch?.millwork?.savedAt ? 'прежний' : 'ИЗМЕНИЛСЯ'}`,
    );
    await page.screenshot({ path: `${OUT}/S6-furniture.png` });

    /* ── C9. 3D и мастер ── */
    console.log('\n── C9. 3D той же мебели и мастер');
    await view(page, '3d');
    const drawn = await waitFor(
      page,
      `(() => (window.__mwCadModules ? window.__mwCadModules() : null))()`,
      (v) => v !== null && v.drawn > 0,
      60_000,
    );
    check(
      'C9 3D: нарисованы base-0@w1 и base-600@w1',
      Boolean(drawn?.ids?.includes('base-0@w1') && drawn.ids.includes('base-600@w1')),
      drawn ? `нарисовано ${drawn.drawn}: ${drawn.ids.join(' ')}` : 'НУЛЕВОЙ СЕЛЕКТОР: 3D не нарисовала модулей',
    );
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/S7-3d.png` });
    /*
     * Мастер при ПРОСТОМ открытии — без нажатий — не пишет ничего. Переход
     * с шага «Замер» сегодня переписывает объект тем же содержимым (поле с
     * автофокусом отдаёт значение на потере фокуса) — дефект мастера до
     * 01B, назван в отчёте; эта проверка меряет то, что требует задача.
     */
    const { data: beforeWizard } = await service.from('projects').select('millwork').eq('id', project.id).single();
    await page.goto(`${BASE}/project/${project.id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const wizardStates = await watchSave(page, 6000);
    const { data: afterWizard } = await service.from('projects').select('millwork').eq('id', project.id).single();
    check(
      'C9 мастер при простом открытии ничего не пишет: состояние в базе то же',
      Boolean(beforeWizard?.millwork) &&
        JSON.stringify(afterWizard?.millwork) === JSON.stringify(beforeWizard.millwork) &&
        !wizardStates.includes('saving'),
      `${beforeWizard?.millwork ? (JSON.stringify(afterWizard?.millwork) === JSON.stringify(beforeWizard.millwork) ? 'состояние то же' : `СОСТОЯНИЕ ИЗМЕНИЛОСЬ: ${diffPaths(beforeWizard.millwork, afterWizard?.millwork).join(' | ')}`) : 'НУЛЕВОЙ СЕЛЕКТОР: состояния нет'} · ` +
        `индикатор за 6 с: ${wizardStates.join(' → ') || 'НЕТ'}`,
    );
    await page.locator('nav[aria-label="Шаги работы"] button[aria-label="Раскладка"]').click({ timeout: 60_000 }).catch(() => undefined);
    const wizardRow = await waitFor(
      page,
      `(() => {
        const root = document.querySelector('[data-schematic]');
        if (!root) return null;
        const scope = root.querySelector('[data-wall-block][aria-current="true"]') || root;
        return [...scope.querySelectorAll('[data-module-id]')].map((g) => ({
          id: g.getAttribute('data-module-id'),
          offset: Number(g.getAttribute('data-module-offset')),
          width: Number(g.getAttribute('data-module-width')),
        })).sort((a, b) => a.offset - b.offset);
      })()`,
      (r) => Array.isArray(r) && r.length === 2,
      30_000,
    );
    check('C9 мастер /project/<id> открывает тот же ряд', rowWords(wizardRow) === 'base-0@w1@0+600 base-600@w1@600+600', rowWords(wizardRow));

    /* ── C10. Ширина экрана и ошибки ── */
    console.log('\n── C10. 1440 и 1180 — без вылета');
    await page.goto(`${BASE}/project/${project.id}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 }).catch(() => undefined);
    await tool(page, 'measure');
    await waitFor(page, READ_PLAN, (p) => p !== null, 15_000);
    const over1440 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.setViewportSize({ width: 1180, height: 820 });
    await sleep(1200);
    const over1180 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const shell1180 = await page.evaluate(READ_SHELL);
    check(
      'C10 1440 и 1180: страница не шире экрана, оболочка на месте',
      over1440 <= 0 && over1180 <= 0 && shell1180.rail && shell1180.viewport !== null && shell1180.bottombar,
      `лишних 1440: ${over1440} px · 1180: ${over1180} px · вид ${shell1180.viewport ?? 'НЕТ'}`,
    );
    const layout1180 = await page.evaluate(READ_LAYOUT);
    check(
      'C10 1180 (планшет в альбоме): рабочая область не уже 600 px, панель и инспектор одной колонкой справа',
      tabletOk(layout1180, 600),
      layoutWords(layout1180),
    );
    await page.screenshot({ path: `${OUT}/S8-tablet-1180.png` });

    /* ── C11. Планшет 1180: масштаб и конец стены мышью ── */
    console.log('\n── C11. 1180: масштаб, «Вписать», конец стены w1 мышью');
    const READ_ZOOM = `(() => document.querySelector('[data-studio-bottombar] [data-studio-zoom]')?.textContent?.trim() ?? null)()`;
    const zoomStart = await page.evaluate(READ_ZOOM);
    const zoomInButton = page.locator('[data-studio-bottombar] button[aria-label="Приблизить"]');
    const fitButton = page.locator('[data-studio-bottombar] [data-studio-fit]');
    let zoomIn = null;
    let zoomFit = null;
    if ((await zoomInButton.count()) > 0 && (await fitButton.count()) > 0) {
      await zoomInButton.first().click();
      zoomIn = await waitFor(page, READ_ZOOM, (v) => v !== zoomStart, 5000);
      await fitButton.first().click();
      zoomFit = await waitFor(page, READ_ZOOM, (v) => v === '100%', 5000);
    }
    check(
      'C11 масштаб: «Приблизить» — крупнее, «Вписать» — снова 100 %',
      zoomStart === '100%' && Number.parseInt(zoomIn ?? '0', 10) > 100 && zoomFit === '100%',
      zoomIn === null ? 'НУЛЕВОЙ СЕЛЕКТОР: кнопок масштаба нет' : `${zoomStart} → ${zoomIn} → ${zoomFit}`,
    );

    await clickWall(page, 'w1');
    await waitFor(page, READ_WALL, (w) => w?.id === 'w1', 10_000);
    const grip = await page.evaluate(() => {
      const plan = document.querySelector('[data-studio-viewport] [data-room-plan]');
      const handle = plan?.querySelector('[data-plan-handle="w1"] rect');
      if (!plan || !handle) return null;
      const r = handle.getBoundingClientRect();
      const box = plan.getBoundingClientRect();
      const vb = plan.viewBox.baseVal;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, mmPerPx: Math.max(vb.width / box.width, vb.height / box.height) };
    });
    let liveLabel = null;
    if (grip) {
      /* Стена w1 идёт по экрану слева направо: конец тянется влево на 100 мм — к длине параллельной стены 3. */
      const dx = -100 / grip.mmPerPx;
      await page.mouse.move(grip.x, grip.y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) {
        await page.mouse.move(grip.x + (dx * i) / 8, grip.y);
        await sleep(40);
      }
      liveLabel = await page.evaluate(() => document.querySelector('[data-studio-viewport] [data-plan-drag]')?.textContent?.trim() ?? null);
      await page.mouse.up();
    }
    const dragged = await waitFor(page, READ_PLAN, (p) => p?.walls.find((w) => w.id === 'w1')?.length === 3600, 10_000);
    const draggedWall = await page.evaluate(READ_WALL);
    check(
      'C11 конец стены w1 тянется мышью: подпись по ходу «3600 мм · как стена 3», длина 3600 «замерено», контур сошёлся',
      Boolean(grip) &&
        Boolean(liveLabel?.startsWith('3600 мм')) &&
        Boolean(liveLabel?.includes('стена 3')) &&
        wallWords(dragged) === 'w1:3600 w2:2800 w3:3600 w4:2800' &&
        dragged.gap === null &&
        draggedWall?.length === 3600 &&
        draggedWall.state === 'measured',
      grip
        ? `по ходу «${liveLabel ?? 'ПОДПИСИ НЕТ'}» · ${wallWords(dragged)} · зазор ${dragged?.gap ?? 'нет'} · инспектор ${draggedWall?.length} ${draggedWall?.state}`
        : 'НУЛЕВОЙ СЕЛЕКТОР: ручки конца стены w1 нет',
    );
    const dragSaved = await saved(page);
    const { data: afterDrag } = await service.from('projects').select('millwork').eq('id', project.id).single();
    const dragWalls = (afterDrag?.millwork?.survey?.walls ?? []).map((w) => `${w.id}:${w.lengthMm?.value ?? '?'}:${w.lengthMm?.state ?? '?'}`).join(' ');
    const dragRun = (afterDrag?.millwork?.runs?.optimal?.modules ?? []).map((m) => `${m.id}@${m.offsetMm}+${m.widthMm}`).join(' ');
    check(
      'C11 в базе после жеста: w1 3600 «замерено», ИД стен те же, мебель на своих отметках',
      dragSaved === 'saved' &&
        dragWalls === 'w1:3600:measured w2:2800:measured w3:3600:measured w4:2800:measured' &&
        dragRun === 'base-0@w1@0+600 base-600@w1@600+600',
      `запись ${dragSaved ?? 'НЕТ'} · стены ${dragWalls || 'НЕТ'} · ряд ${dragRun || 'НЕТ'}`,
    );

    /* ── C12. Планшет 1024 и в портрете ── */
    console.log('\n── C12. Планшет: 1024 × 768 и 834 × 1112');
    await page.setViewportSize({ width: 1024, height: 768 });
    await sleep(1200);
    const layout1024 = await page.evaluate(READ_LAYOUT);
    check(
      'C12 1024 px: рабочая область не уже 600 px, панель и инспектор одной колонкой справа, план со стенами, без вылета',
      tabletOk(layout1024, 600),
      layoutWords(layout1024),
    );
    await page.screenshot({ path: `${OUT}/S10-tablet-1024.png` });
    await page.setViewportSize({ width: 834, height: 1112 });
    await sleep(1200);
    const portrait = await page.evaluate(READ_LAYOUT);
    check(
      'C12 834 px (портрет): рабочая область не уже 400 px, панель и инспектор одной колонкой справа, план со стенами, без вылета',
      tabletOk(portrait, 400),
      layoutWords(portrait),
    );
    await clickWall(page, 'w2');
    const portraitWall = await waitFor(page, READ_WALL, (w) => w?.id === 'w2', 10_000);
    check(
      'C12 834 px: стена w2 выбирается мышью, в инспекторе w2 2800',
      portraitWall?.id === 'w2' && portraitWall.length === 2800,
      portraitWall ? `${portraitWall.id} ${portraitWall.length} ${portraitWall.state}` : 'НУЛЕВОЙ СЕЛЕКТОР: инспектора стены нет',
    );
    await page.screenshot({ path: `${OUT}/S9-tablet-834.png` });
    check('ошибок страницы нет', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || 'ноль');
    await context.close();
  } finally {
    /*
     * Уборка проверяется: supabase-js не бросает на ошибке запроса, и
     * несостоявшееся удаление оставило бы в базе чужую организацию молча.
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
    check('временные объект, организация и пользователь удалены', left.length === 0, left.join(' | ') || 'удалено');
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
