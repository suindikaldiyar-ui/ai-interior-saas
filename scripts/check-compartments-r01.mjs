/**
 * R01 — НЕЗАВИСИМЫЕ ОТСЕКИ ШКАФА, ПУТЁМ ЭКРАНА.
 *
 * Запуск: node scripts/check-compartments-r01.mjs   (нужен build)
 *
 * Объект заводится служебным ключом так же, как его заводит «Новый объект →
 * Спальня» (`/measure`: зона «Спальня», требования по умолчанию с зоной
 * `bedroom`), — организация, пользователь, объект с замером
 * 3000 × 2800 × 3000 × 2800, потолок 2500, — и удаляется в конце; уборка
 * проверяется чтением.
 *
 *   K1  Studio спальни: «Мебель», пустая стена; карточка «Полки» в пустоту,
 *       ширина 1000 полем «Ширина, мм» — шкаф 1000 × 2400 × 600.
 *   K2  Выбор шкафа мышью → «Внутреннее наполнение» → «Разделить
 *       вертикально»: два отсека 476 и 476 мм, перегородка одна.
 *   K3  «Количество полок»: слева 4, справа 0.
 *   K4  Схема «Каркас»: 4 полки только в отсеке 1, от 17 до 491 мм;
 *       перегородка 492…508 мм; полки сквозь перегородку не идут; выбранный
 *       отсек подсвечен.
 *   K5  3D: поворот камеры мышью, «Каркас»; НАРИСОВАННЫЕ полки и
 *       перегородка (`__mwCadBays`) — те же размеры и места, что в раскрое;
 *       пересечений 0; ИД деталей не повторяются; рамка отсека в 3D.
 *   K6  Деталировка: «Полка» отсека b1 474 × 580 × 16 · 4, перегородка
 *       2368 × 580 × 16 · 1 — один раз; ИД деталей те же, что в 3D.
 *   K7  Добавить полку, высота полки 290 → 288 (система 32, сказано),
 *       удалить полку, распределить — 480 · 960 · 1440 · 1920.
 *   K8  Ширина секции 600: полки 598, перегородка 616…632, правый 352;
 *       корпус 1000. Ширина 900 — отказ «доступно … не хватает …», прежнее.
 *   K9  Запись: в базе `fill.bays` b1 600 / 4 полки, b2 / 0, полок на всю
 *       ширину нет. Перезагрузка — те же отсеки на схеме, в 3D и в панели.
 *   K10 Планшет 1024: касанием выбирается шкаф и отсек, подсветка едет.
 *
 * Ноль найденных отсеков, полок или элементов панели — FAIL со словами.
 * Снимки — в `.capture-check/r01/`. Инструмент приёмки, в `verify` не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = 3254;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/r01';
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
      measuredBy: 'проверка R01',
      measuredAt: '2026-10-15',
    },
    measurement: {
      id: `m-${stamp}`,
      ceilingHeightMm: CEILING,
      walls: WALLS.map((lengthMm, i) => ({ id: `w${i + 1}`, lengthMm, angleDeg: 90, openings: [] })),
      comms: [],
      photos: [],
      measuredBy: 'проверка R01',
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
async function fillAction(page, action) {
  const button = page.locator(`[data-fill-editor] [data-fill-action="${action}"]`);
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
  const email = `r01-${stamp}@example.test`;
  const password = `Pw-${stamp}-r01!`;
  const made = { user: null, org: null, project: null };
  mkdirSync(OUT, { recursive: true });
  try {
    const { data: created, error: userError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (userError) throw new Error(`createUser: ${userError.message}`);
    made.user = created.user.id;
    const { data: org, error: orgError } = await service
      .from('orgs')
      .insert({ slug: `r01-${stamp}`, name: `Проверка R01 ${stamp}` })
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
        address: 'Проверка R01',
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

    /* ── K4. Схема «Каркас» ── */
    console.log('\n── K4. Схема: «Каркас» — отсеки, перегородка, полки');
    const modeButton = page.locator('[data-studio-viewport] [data-schematic-mode]');
    must('K4 переключатель «Фасады / Каркас» на схеме Studio', (await modeButton.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: переключателя на схеме нет');
    if ((await modeButton.first().getAttribute('data-schematic-mode')) !== 'frame') await modeButton.first().click();
    await sleep(500);
    const sheet = (await waitFor(page, READ_SHEET, (s) => Array.isArray(s) && s.length > 0, 10_000))?.find((s) => s.module === cabinetId);
    must('K4 отсеки шкафа на схеме', Boolean(sheet), 'НУЛЕВОЙ СЕЛЕКТОР: на схеме нет ни одного [data-bays]');
    const sheetB1 = sheet.shelves.filter((s) => s.bay === 'b1');
    const partition = sheet.partitions[0];
    check(
      'K4 перегородка одна, 492…508 мм; полок 4, все в отсеке 1, от 17 до 491 мм',
      sheet.partitions.length === 1 &&
        partition.from === 492 &&
        partition.to === 508 &&
        sheet.shelves.length === 4 &&
        sheetB1.length === 4 &&
        sheetB1.every((s) => s.from === 17 && s.to === 491),
      `перегородки ${sheet.partitions.map((p) => `${p.from}…${p.to}`).join(' ') || 'нет'} · полки ${sheet.shelves.map((s) => `${s.bay}:${s.from}…${s.to}@${s.at}`).join(' ')}`,
    );
    check(
      'K4 ни одна полка не заходит в перегородку',
      sheet.shelves.every((s) => s.to <= partition.from || s.from >= partition.to),
      'полки кончаются у перегородки',
    );
    check('K4 выбранный отсек подсвечен на схеме', sheet.selected === 'b1', `подсвечен ${sheet.selected ?? 'никто'}`);
    await page.screenshot({ path: `${OUT}/R1-1440-schematic-frame.png` });

    /* ── K5. 3D ── */
    console.log('\n── K5. 3D: поворот, «Каркас», нарисованные детали');
    must('K5 вид «3D»', await view(page, '3d'), 'НУЛЕВОЙ СЕЛЕКТОР: вида «3D» нет');
    const sceneStart = Date.now();
    await page.waitForSelector('[data-studio-viewport] canvas', { timeout: 90_000 }).catch(() => undefined);
    await page.waitForFunction(() => typeof window.__mwCadBays === 'function' && typeof window.__mwCadState === 'function', null, { timeout: 60_000 }).catch(() => undefined);
    const sceneMs = Date.now() - sceneStart;
    const cameraBefore = await page.evaluate(() => window.__mwCadState?.().camera ?? null);
    const canvas = await page.evaluate(() => {
      const c = document.querySelector('[data-studio-viewport] canvas');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.55 };
    });
    if (!canvas) {
      const state = await page.evaluate(() => {
        const viewport = document.querySelector('[data-studio-viewport]');
        return {
          view: viewport?.getAttribute('data-view') ?? null,
          scene: Boolean(viewport?.querySelector('[data-scene]')),
          text: viewport?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? null,
        };
      });
      await page.screenshot({ path: `${OUT}/FAIL-K5-no-canvas.png` });
      must(
        'K5 холст сцены',
        false,
        `НУЛЕВОЙ СЕЛЕКТОР: canvas в рабочей области нет за ${sceneMs} мс · вид ${state.view} · [data-scene] ${state.scene} · ` +
          `текст «${state.text}» · ошибки страницы: ${pageErrors.slice(0, 2).join(' | ') || 'нет'}`,
      );
    }
    check('K5 холст сцены', true, `${sceneMs} мс до готовности`);
    await page.mouse.move(canvas.x, canvas.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(canvas.x + i * 12, canvas.y - i * 3);
    await page.mouse.up();
    await sleep(1500);
    const cameraAfter = await page.evaluate(() => window.__mwCadState?.().camera ?? null);
    check(
      'K5 камера повернулась мышью',
      Array.isArray(cameraBefore) && Array.isArray(cameraAfter) && cameraBefore.join() !== cameraAfter.join(),
      `${cameraBefore?.join(',') ?? 'нет'} → ${cameraAfter?.join(',') ?? 'нет'}`,
    );
    const sceneMode = page.locator('[data-studio-viewport] [data-scene-mode]');
    if ((await sceneMode.count()) > 0 && (await sceneMode.first().getAttribute('data-scene-mode')) !== 'frame') await sceneMode.first().click();
    await sleep(1200);
    const cad = await scene3d(page, cabinetId);
    must('K5 детали отсеков в нарисованной сцене', Boolean(cad && cad.parts.length > 0), cad ? 'деталей отсеков 0' : 'НУЛЕВОЙ СЕЛЕКТОР: __mwCadBays нет');
    const cadShelves = cad.parts.filter((p) => p.partId.includes(':b1:shelf:'));
    const cadPartition = cad.parts.filter((p) => p.partId.includes(':partition:'));
    const right = cad.parts.filter((p) => p.partId.includes(':b2:'));
    check(
      'K5 в 3D 4 полки отсека 1 474 × 16 × 580, перегородка 16 × 2368 × 580, в отсеке 2 ничего',
      cadShelves.length === 4 &&
        cadShelves.every((p) => p.size[0] === 474 && p.size[1] === 16 && p.size[2] === 580) &&
        cadPartition.length === 1 &&
        cadPartition[0].size.join() === '16,2368,580' &&
        right.length === 0,
      `полки ${cadShelves.map((p) => p.size.join('×')).join(' ')} · перегородка ${cadPartition.map((p) => p.size.join('×')).join(' ')} · отсек 2 ${right.length}`,
    );
    const placeX = cadShelves.map((p) => `${p.center[0] - p.size[0] / 2}…${p.center[0] + p.size[0] / 2}`);
    const partX = cadPartition.map((p) => `${p.center[0] - p.size[0] / 2}…${p.center[0] + p.size[0] / 2}`);
    check(
      'K5 в 3D полки на 17…491 мм от края шкафа, перегородка на 492…508 — то же, что на схеме',
      placeX.every((x) => x === `${placed.offset + 17}…${placed.offset + 491}`) && partX.join() === `${placed.offset + 492}…${placed.offset + 508}`,
      `полки ${[...new Set(placeX)].join(' ')} · перегородка ${partX.join(' ')}`,
    );
    const pairs = [];
    for (let i = 0; i < cad.parts.length; i++)
      for (let j = i + 1; j < cad.parts.length; j++) {
        const depth = penetration(cad.parts[i], cad.parts[j]);
        if (depth > 0.5) pairs.push(`${cad.parts[i].partId} × ${cad.parts[j].partId} на ${depth} мм`);
      }
    check('K5 пересечений нарисованных деталей отсеков 0 (контакт — не пересечение)', pairs.length === 0, pairs.slice(0, 3).join(' | ') || `пар ${(cad.parts.length * (cad.parts.length - 1)) / 2}, пересечений 0`);
    const ids = cad.parts.map((p) => p.partId);
    const numbers = cad.parts.flatMap((p) => [...p.center, ...p.size]);
    check(
      'K5 ИД деталей не повторяются, чисел NaN и отрицательных габаритов нет',
      new Set(ids).size === ids.length && numbers.every(Number.isFinite) && cad.parts.every((p) => p.size.every((v) => v > 0)),
      `деталей ${ids.length}, уникальных ${new Set(ids).size}`,
    );
    check(
      'K5 выбранный отсек обведён в 3D: b1 шириной 476 и высотой 2368',
      cad.highlight?.moduleId === cabinetId && cad.highlight.bayId === 'b1' && cad.highlight.size[0] === 476 && cad.highlight.size[1] === 2368,
      cad.highlight ? `${cad.highlight.bayId} ${cad.highlight.size.join('×')}` : 'рамки нет',
    );
    await page.screenshot({ path: `${OUT}/R2-1440-3d-frame.png` });

    /* ── K6. Деталировка ── */
    console.log('\n── K6. Деталировка');
    const panelsButton = page.locator('[data-studio-open="panels"]');
    must('K6 кнопка «Деталировка»', (await panelsButton.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: кнопки «Деталировка» нет');
    await panelsButton.first().click();
    const panels = (await waitFor(page, READ_PANELS, (list) => Array.isArray(list) && list.length > 0, 20_000)).filter((p) => p.module === cabinetId);
    const shelfRows = panels.filter((p) => p.bay === 'b1');
    const partitionRows = panels.filter((p) => /Перегородка/.test(p.name));
    check(
      'K6 в раскрое полка отсека b1 474 × 580 × 16 · 4 — одной строкой; перегородка 2368 × 580 × 16 · 1 — один раз',
      shelfRows.length === 1 &&
        shelfRows[0].size === '474x580x16' &&
        shelfRows[0].qty === 4 &&
        partitionRows.length === 1 &&
        partitionRows[0].size === '2368x580x16' &&
        partitionRows[0].qty === 1,
      panels.map((p) => `${p.name}[${p.bay ?? '—'}] ${p.size}·${p.qty}`).join(' | ') || 'НУЛЕВОЙ СЕЛЕКТОР: строк модуля в деталировке нет',
    );
    const panelIds = panels.flatMap((p) => p.parts).sort();
    check(
      'K6 ИД деталей раскроя = ИД нарисованных в 3D',
      panelIds.length > 0 && panelIds.join() === [...ids].sort().join(),
      `раскрой ${panelIds.length}, 3D ${ids.length}`,
    );
    await page.screenshot({ path: `${OUT}/R3-1440-panels.png` });
    await view(page, 'facade');

    /* ── K7. Операции полок ── */
    console.log('\n── K7. Добавить, высота, удалить, распределить');
    await waitFor(page, READ_FILL, (f) => f?.module === cabinetId, 5_000);
    if (!(await page.evaluate(READ_FILL))) await pointModule(page, cabinetId);
    await chip(page, 'b1');
    await fillAction(page, 'add-shelf');
    fill = await waitFor(page, READ_FILL, (f) => f?.chips[0]?.shelves === 5, 8_000);
    check('K7 «Добавить полку»: 4 → 5', fill?.chips[0]?.shelves === 5, chipWords(fill));
    await typeInto(page, '[data-shelf-row]:first-child [data-shelf-height-input]', 290);
    fill = await waitFor(page, READ_FILL, (f) => f?.shelves[0]?.at === 288, 8_000);
    check(
      'K7 «Высота полки» 290 → 288 по системе 32, и это сказано; прочие на месте',
      fill?.shelves[0]?.at === 288 && Boolean(fill.snap && /288/.test(fill.snap)) && fill.shelves.length === 5,
      `${fill?.shelves.map((s) => s.at).join(' · ')} · ${fill?.snap ?? 'слов о шаге нет'}`,
    );
    const removeFirst = page.locator('[data-fill-editor] [data-shelf-row]').first().locator('[data-fill-action="remove-shelf"]');
    if ((await removeFirst.count()) > 0) await removeFirst.click();
    await sleep(400);
    fill = await waitFor(page, READ_FILL, (f) => f?.chips[0]?.shelves === 4, 8_000);
    check('K7 «Удалить полку»: 5 → 4, полка на 288 ушла', fill?.chips[0]?.shelves === 4 && !fill.shelves.some((s) => s.at === 288), fill?.shelves.map((s) => s.at).join(' · '));
    await fillAction(page, 'distribute');
    fill = await waitFor(page, READ_FILL, (f) => f?.shelves.map((s) => s.at).join(',') === '480,960,1440,1920', 8_000);
    check('K7 «Распределить полки» — 480 · 960 · 1440 · 1920', fill?.shelves.map((s) => s.at).join(',') === '480,960,1440,1920', fill?.shelves.map((s) => s.at).join(' · '));
    check('K7 «Убрать перегородку» называет потерю ДО нажатия', Boolean(fill?.partitionNote && /станут одним/.test(fill.partitionNote)), fill?.partitionNote ?? 'слов нет');

    /* ── K8. Ширина секции ── */
    console.log('\n── K8. Ширина секции: 600 и отказ на 900');
    await page.locator('[data-fill-editor] [data-bay-width-input]').first().fill('600');
    await fillAction(page, 'set-width');
    fill = await waitFor(page, READ_FILL, (f) => f?.chips[0]?.width === 600, 8_000);
    const sheet600 = (await page.evaluate(READ_SHEET))?.find((s) => s.module === cabinetId);
    row = await page.evaluate(READ_ROW);
    check(
      'K8 отсек 1 600 мм, отсек 2 352 мм; полки 598 на 17…615, перегородка 616…632; корпус 1000',
      fill?.chips[0]?.width === 600 &&
        fill.chips[1]?.width === 352 &&
        fill.shelves.every((s) => s.size === '598 × 580 × 16') &&
        sheet600?.partitions[0]?.from === 616 &&
        sheet600.partitions[0].to === 632 &&
        sheet600.shelves.every((s) => s.from === 17 && s.to === 615) &&
        row?.find((m) => m.id === cabinetId)?.width === 1000,
      `${chipWords(fill)} · перегородка ${sheet600?.partitions.map((p) => `${p.from}…${p.to}`).join(' ')} · полки ${[...new Set(sheet600?.shelves.map((s) => `${s.from}…${s.to}`))].join(' ')} · корпус ${row?.find((m) => m.id === cabinetId)?.width}`,
    );
    await page.locator('[data-fill-editor] [data-bay-width-input]').first().fill('900');
    await fillAction(page, 'set-width');
    fill = await waitFor(page, READ_FILL, (f) => Boolean(f?.refusal), 8_000);
    check(
      'K8 ширина 900 — отказ с числом, отсеки прежние',
      Boolean(fill?.refusal && /доступно/.test(fill.refusal) && /не хватает/.test(fill.refusal)) && fill.chips[0].width === 600 && fill.chips[1].width === 352,
      `${fill?.refusal ?? 'отказа нет'} · ${chipWords(fill)}`,
    );
    await page.screenshot({ path: `${OUT}/R4-1440-width600.png` });
    await saved(page);

    /* ── K9. Запись и перезагрузка ── */
    console.log('\n── K9. Запись в базу и перезагрузка');
    const { data: stored } = await service.from('projects').select('millwork').eq('id', project.id).single();
    const storedUnits = Object.values(stored?.millwork?.runs ?? {}).flatMap((run) => run?.modules ?? []);
    const storedUnit = storedUnits.find((m) => m.id === cabinetId);
    const bays = storedUnit?.fill?.bays;
    /* jsonb переставляет ключи: сравнивается значение поля за полем, а не строка. */
    const bayWords = (list) =>
      Array.isArray(list)
        ? list.map((b) => `${b.id}|${b.widthMm ?? '*'}|${b.shelves?.mode}|${b.shelves?.count ?? (b.shelves?.at ?? []).join('.')}|${Object.keys(b).sort().join(',')}`).join(' ')
        : String(list);
    check(
      'K9 в базе `fill.bays`: b1 600 / 4 равномерно, b2 остаток / 0; полок на всю ширину и старой перегородки нет',
      bayWords(bays) === 'b1|600|even|4|id,shelves,widthMm b2|*|even|0|id,shelves' &&
        storedUnit.fill.shelves.length === 0 &&
        storedUnit.fill.dividerMm === 0,
      storedUnit ? JSON.stringify(storedUnit.fill?.bays ?? null) : `НУЛЕВОЙ СЕЛЕКТОР: модуля ${cabinetId} в millwork.runs нет`,
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 }).catch(() => undefined);
    await saved(page);
    await tool(page, 'furniture');
    await view(page, 'facade');
    await page.waitForSelector('[data-studio-viewport] [data-schematic]', { timeout: 30_000 }).catch(() => undefined);
    await pointModule(page, cabinetId);
    fill = await waitFor(page, READ_FILL, (f) => f?.module === cabinetId, 10_000);
    /* «Фасады / Каркас» — состояние вида, после перезагрузки снова «Фасады»: включаем, как человек. */
    const reMode = page.locator('[data-studio-viewport] [data-schematic-mode]');
    if ((await reMode.count()) > 0 && (await reMode.first().getAttribute('data-schematic-mode')) !== 'frame') await reMode.first().click();
    await sleep(500);
    const reSheet = (await page.evaluate(READ_SHEET))?.find((s) => s.module === cabinetId);
    check(
      'K9 после перезагрузки: панель — b1 600 / 4, b2 352 / 0; схема — перегородка 616…632 и 4 полки отсека 1',
      fill?.chips.length === 2 &&
        fill.chips[0].width === 600 &&
        fill.chips[0].shelves === 4 &&
        fill.chips[1].width === 352 &&
        fill.chips[1].shelves === 0 &&
        reSheet?.partitions[0]?.from === 616 &&
        reSheet.shelves.filter((s) => s.bay === 'b1').length === 4,
      `${chipWords(fill)} · схема ${reSheet ? `${reSheet.partitions.map((p) => `${p.from}…${p.to}`).join(' ')} · полок ${reSheet.shelves.length}` : 'НУЛЕВОЙ СЕЛЕКТОР: отсеков на схеме нет'}`,
    );
    await view(page, '3d');
    await page.waitForFunction(() => typeof window.__mwCadBays === 'function', null, { timeout: 60_000 }).catch(() => undefined);
    await sleep(1000);
    const reCad = await scene3d(page, cabinetId);
    const reCadShelves = reCad?.parts.filter((p) => p.partId.includes(':b1:shelf:')) ?? [];
    check(
      'K9 после перезагрузки в 3D: 4 полки 598 и перегородка на 616…632',
      reCadShelves.length === 4 &&
        reCadShelves.every((p) => p.size[0] === 598) &&
        reCad.parts.some((p) => p.partId.includes(':partition:') && p.center[0] - p.size[0] / 2 === placed.offset + 616),
      reCad ? `полки ${reCadShelves.map((p) => p.size[0]).join(',')} · деталей ${reCad.parts.length}` : 'НУЛЕВОЙ СЕЛЕКТОР: __mwCadBays нет',
    );
    await page.screenshot({ path: `${OUT}/R5-1440-3d-after-reload.png` });
    check('ошибок страницы нет (1440)', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || 'ноль');
    await context.close();

    /* ── K10. Планшет 1024 ── */
    console.log('\n── K10. Планшет 1024: касание');
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
    const tapped = await pointModule(tab, cabinetId, true);
    let tabFill = await waitFor(tab, READ_FILL, (f) => f?.module === cabinetId, 10_000);
    check('K10 касанием выбран шкаф — панель наполнения его', tapped && tabFill?.module === cabinetId, tabFill ? `панель у ${tabFill.module}` : 'НУЛЕВОЙ СЕЛЕКТОР: панели нет');
    await chip(tab, 'b2', true);
    tabFill = await waitFor(tab, READ_FILL, (f) => f?.chips[1]?.on === true, 5_000);
    const tabMode = tab.locator('[data-studio-viewport] [data-schematic-mode]');
    if ((await tabMode.count()) > 0 && (await tabMode.first().getAttribute('data-schematic-mode')) !== 'frame') await tabMode.first().tap();
    await sleep(500);
    const tabSheet = (await tab.evaluate(READ_SHEET))?.find((s) => s.module === cabinetId);
    check('K10 касанием выбран отсек 2 — подсвечен на схеме', tabFill?.chips[1]?.on === true && tabSheet?.selected === 'b2', `панель ${chipWords(tabFill)} · схема ${tabSheet?.selected ?? 'никто'}`);
    const overflow = await tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('K10 1024: без горизонтального вылета', overflow <= 0, `вылет ${overflow} px`);
    await tab.screenshot({ path: `${OUT}/R6-1024-schematic-frame.png` });
    await view(tab, '3d');
    await tab.waitForFunction(() => typeof window.__mwCadBays === 'function', null, { timeout: 60_000 }).catch(() => undefined);
    await sleep(1200);
    const tabCad = await scene3d(tab, cabinetId);
    check('K10 1024: в 3D обведён отсек 2', tabCad?.highlight?.bayId === 'b2', tabCad?.highlight ? `${tabCad.highlight.bayId} ${tabCad.highlight.size.join('×')}` : 'рамки нет');
    await tab.screenshot({ path: `${OUT}/R7-1024-3d.png` });
    check('ошибок страницы нет (1024)', tabErrors.length === 0, tabErrors.slice(0, 2).join(' | ') || 'ноль');
    await tablet.close();
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
