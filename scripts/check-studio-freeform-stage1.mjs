/**
 * STAGE 01A — СВОБОДНОЕ ПРОЕКТИРОВАНИЕ В STUDIO, ПУТЁМ ЭКРАНА.
 *
 * Запуск: node scripts/check-studio-freeform-stage1.mjs   (нужен build)
 *
 * Объект заводится служебным ключом — организация, пользователь, объект с
 * замером 3600 × 2800 × 3600 × 2800 и без выбранного готового решения — и
 * удаляется в конце. Настоящий заказ клиента не трогается.
 *
 *   S1  /project/<id>/room — Studio: шапка с названием объекта и состоянием
 *       сохранения, вкладки, мастера шагов нет; стена w1 3600 мм из замера,
 *       ряд пустой, решение не выбирали, состояние «Черновик».
 *   S2  пустое место стены на схеме → библиотека → «Дверца 600» → модуль на
 *       отметке 0, 600 мм; на схеме и в 3D один и тот же ИД.
 *   S3  выбор кликом на схеме → инспектор: ИД, стена w1, отметка 0, ширина
 *       600, высота и глубина корпуса; выбор кликом в 3D (после выбора
 *       пустоты) → тот же ИД.
 *   S4  ширина 600 → 750 полем инспектора: модуль тот же и там же; в 3D две
 *       створки; в деталировке у модуля два фасада, деталей с NaN, нулём и
 *       минусом нет; итог сметы изменился; инспектор — две створки.
 *   S5  второй модуль вплотную; ширина первого 1000 → отказ «доступно 750 мм,
 *       требуется 1000 мм, не хватает 250 мм», ряд прежний.
 *   S6  «Сохранено»; в базе — свободная сборка и тот же ряд; перезагрузка —
 *       те же ИД, отметки, ширины, створки и итог; соседних стен нет;
 *       мастер /project/<id> открывает тот же ряд.
 *   S7  покой: в 3D за 5 с не нарисовано ни кадра; снимки 1440 и планшет.
 *
 * Ноль найденных элементов — FAIL со словами. Снимки — в
 * `.capture-check/studio-01a/`. Инструмент глазной проверки, в `verify`
 * не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = 3251;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/studio-01a';
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

/** Замер объекта: формат `Survey` и формат `Measurement` — стены по кругу. */
function fixtureRoom(stamp) {
  const lengths = [3600, 2800, 3600, 2800];
  const known = (value) => ({ state: 'measured', value });
  return {
    survey: {
      ceilingHeightMm: known(2700),
      walls: lengths.map((lengthMm, i) => ({
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
      measuredBy: 'проверка Studio',
      measuredAt: '2026-10-09',
    },
    measurement: {
      id: `m-${stamp}`,
      ceilingHeightMm: 2700,
      walls: lengths.map((lengthMm, i) => ({ id: `w${i + 1}`, lengthMm, angleDeg: 90, openings: [] })),
      comms: [],
      photos: [],
      measuredBy: 'проверка Studio',
      measuredAt: '2026-10-09',
      notes: '',
    },
  };
}

/* ─────────────────────────  чтение экрана  ───────────────────────── */

/** Модули АКТИВНОЙ стены на схеме — числами цеха, а не пикселями. */
const READ_ROW = `(() => {
  const root = document.querySelector('[data-schematic]');
  if (!root) return null;
  const scope = root.querySelector('[data-wall-block][aria-current="true"]') || root;
  return [...scope.querySelectorAll('[data-module-id]')]
    .map((g) => ({
      id: g.getAttribute('data-module-id'),
      offset: Number(g.getAttribute('data-module-offset')),
      width: Number(g.getAttribute('data-module-width')),
      variant: g.getAttribute('data-module-variant'),
    }))
    .sort((a, b) => a.offset - b.offset);
})()`;

/** Пустоты активной стены на схеме. */
const READ_GAPS = `(() => {
  const root = document.querySelector('[data-schematic]');
  if (!root) return null;
  const scope = root.querySelector('[data-wall-block][aria-current="true"]') || root;
  return [...scope.querySelectorAll('[data-gap-from]')].map((n) => ({
    from: Number(n.getAttribute('data-gap-from')),
    width: Number(n.getAttribute('data-gap-width')),
    row: n.getAttribute('data-gap-row'),
  }));
})()`;

/** Инспектор Studio: что выбрано и его числа. */
const READ_INSPECTOR = `(() => {
  const wall = document.querySelector('[data-studio-wall]');
  const unit = document.querySelector('[data-inspector-module]');
  const gap = document.querySelector('[data-inspector-gap]');
  const num = (n, k) => (n && n.getAttribute(k) !== null ? Number(n.getAttribute(k)) : null);
  return {
    wall: wall
      ? {
          id: wall.getAttribute('data-studio-wall'),
          length: num(wall, 'data-wall-length'),
          run: num(wall, 'data-run-length'),
          state: wall.getAttribute('data-wall-state'),
          text: wall.textContent.replace(/\\s+/g, ' ').trim(),
        }
      : null,
    module: unit
      ? {
          id: unit.getAttribute('data-inspector-module'),
          wall: unit.getAttribute('data-inspector-wall'),
          offset: num(unit, 'data-inspector-offset'),
          width: num(unit, 'data-inspector-width'),
          height: num(unit, 'data-inspector-height'),
          depth: num(unit, 'data-inspector-depth'),
          leaves: num(unit, 'data-inspector-leaves'),
          drawers: num(unit, 'data-inspector-drawers'),
          text: unit.textContent.replace(/\\s+/g, ' ').trim(),
        }
      : null,
    gap: gap ? { from: num(gap, 'data-inspector-gap'), width: num(gap, 'data-gap-width') } : null,
  };
})()`;

/** Итог сметы на экране — числом, как его видит человек. */
const READ_TOTAL = `(() => {
  const n = document.querySelector('[data-estimate-total]');
  return n ? Number(n.getAttribute('data-estimate-total')) : null;
})()`;

/** Состояние Studio внизу экрана. */
const READ_STATUS = `(() => {
  const n = document.querySelector('[data-studio-status]');
  return n ? { key: n.getAttribute('data-studio-status'), text: n.textContent.replace(/\\s+/g, ' ').trim() } : null;
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

const rowWords = (row) => (row && row.length ? row.map((m) => `${m.id}@${m.offset}+${m.width}`).join(' ') : 'модулей нет');

/** Нажать на пустоту активной стены. */
async function clickGap(page, fromMm, row = 'base') {
  return page.evaluate(
    ([from, r]) => {
      const root = document.querySelector('[data-schematic]');
      const scope = root?.querySelector('[data-wall-block][aria-current="true"]') || root;
      const target = scope?.querySelector(`[data-gap-from="${from}"][data-gap-row="${r}"]`);
      target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return Boolean(target);
    },
    [fromMm, row],
  );
}

/** Нажать на модуль активной стены на схеме. */
async function clickModule(page, id) {
  return page.evaluate((moduleId) => {
    const root = document.querySelector('[data-schematic]');
    const scope = root?.querySelector('[data-wall-block][aria-current="true"]') || root;
    const target = [...(scope?.querySelectorAll('[data-module-id]') ?? [])].find(
      (n) => n.getAttribute('data-module-id') === moduleId,
    );
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return Boolean(target);
  }, id);
}

/** Карточка библиотеки по варианту и ширине — доступная, с ценой. */
async function pickCard(page, variant, width) {
  const panel = await waitFor(
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
    (cards) => Array.isArray(cards) && cards.length > 0,
  );
  if (!panel) return { error: 'НУЛЕВОЙ СЕЛЕКТОР: панель библиотеки не открылась' };
  const card = panel.find((c) => c.variant === variant && c.width === width && !c.refused);
  if (!card) {
    const grey = panel.filter((c) => c.variant === variant && c.width === width);
    return {
      error:
        `НУЛЕВОЙ СЕЛЕКТОР: карточки «${variant} ${width}» нет среди ${panel.length}` +
        (grey[0] ? ` · серая: «${grey[0].reason}»` : ''),
    };
  }
  await page.evaluate((key) => {
    const n = document.querySelector(`[data-library="1"] [data-card="${key}"]`);
    n?.scrollIntoView({ block: 'center' });
    n?.click();
  }, card.key);
  return { card };
}

/** Вкладка Studio. */
async function studioTab(page, key) {
  const tab = page.locator(`[data-studio-tab="${key}"]`);
  if ((await tab.count()) === 0) return false;
  await tab.first().click({ timeout: 15_000 });
  await sleep(400);
  return true;
}

/** Вид сцены: 3D, схема или план. */
async function schematicView(page, key) {
  const tab = page.locator(`[data-schematic-tab="${key}"]`);
  if ((await tab.count()) === 0) return false;
  await tab.first().click({ timeout: 15_000 });
  return true;
}

/** 3D готова: нарисованы модули ряда. */
async function cadModules(page, timeoutMs = 60_000) {
  return waitFor(
    page,
    `(() => (window.__mwCadModules ? window.__mwCadModules() : null))()`,
    (v) => v !== null && v.drawn > 0,
    timeoutMs,
  );
}

/** Ввести ширину в поле инспектора. */
async function typeWidth(page, width) {
  const input = page.locator('[data-studio-panel] label:has-text("Ширина, мм") input').first();
  if ((await input.count()) === 0) return false;
  /* Ширину прибора не правят: поле заперто — это ответ, а не повод ждать 30 с. */
  if (!(await input.isEnabled())) return false;
  await input.fill(String(width));
  await input.press('Enter');
  await sleep(600);
  return true;
}

/** Деталировка Studio: детали модуля и все размеры. */
const READ_PARTS = `(() => {
  const rows = [...document.querySelectorAll('[data-panel-row]')];
  return rows.map((n) => ({
    module: n.getAttribute('data-module-id'),
    wall: n.getAttribute('data-wall-id'),
    part: n.getAttribute('data-part-id'),
    size: n.getAttribute('data-part-size'),
    qty: Number(n.getAttribute('data-part-qty')),
    name: (n.children[1]?.textContent ?? '').trim(),
  }));
})()`;

/* ─────────────────────────  сценарий  ───────────────────────── */

async function scenario(browser) {
  loadEnv();
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !ANON || !SERVICE || /your-project|example/.test(URL)) {
    check('Studio: ключи Supabase есть', false, 'НЕ ПРОВЕРЕНО — нет ключей Supabase в .env.local');
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
      .insert({ slug: `studio-${stamp}`, name: `Проверка Studio ${stamp}` })
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
        address: 'Проверка Studio 01A',
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

    /* ── S1. Studio открывается из существующего объекта ── */
    console.log('\n── S1. /project/<id>/room — Studio без мастера шагов');
    const response = await page.goto(`${BASE}/project/${project.id}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const status = response?.status() ?? 0;
    const opened = await page
      .waitForSelector('[data-studio-root]', { timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    check(
      'S1 Studio открылась по адресу объекта',
      status === 200 && opened,
      opened ? `HTTP ${status}` : `НУЛЕВОЙ СЕЛЕКТОР: экрана Studio нет — /project/${project.id}/room ответил HTTP ${status}`,
    );
    if (!opened) {
      await page.screenshot({ path: `${OUT}/S1-no-studio.png` });
      await context.close();
      return;
    }
    await page.waitForSelector('[data-schematic]', { timeout: 60_000 }).catch(() => undefined);
    /*
     * Состояние сохранения ставит эффект после гидратации: в серверном HTML
     * его ещё нет. Ждём его появления, а не читаем разметку до оживления.
     */
    await page.waitForSelector('[data-save-state]', { timeout: 20_000 }).catch(() => undefined);
    const header = await page.evaluate(() => ({
      title: document.querySelector('[data-studio-title]')?.textContent?.trim() ?? null,
      save: document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null,
      tabs: [...document.querySelectorAll('[data-studio-tab]')].map((n) => n.getAttribute('data-studio-tab')),
      wizardSteps: document.querySelectorAll('nav[aria-label="Шаги работы"]').length,
      wizardLink: document.querySelector('[data-studio-wizard]')?.getAttribute('href') ?? null,
    }));
    check(
      'S1 шапка: название объекта, состояние сохранения, вкладки; полосы шагов мастера нет',
      Boolean(header.title?.includes('Проверка Studio 01A')) &&
        header.save !== null &&
        ['survey', 'sizes', 'layout', 'build', 'materials', 'panels'].every((key) => header.tabs.includes(key)) &&
        header.wizardSteps === 0 &&
        header.wizardLink === `/project/${project.id}`,
      `«${header.title ?? 'НЕТ НАЗВАНИЯ'}» · сохранение ${header.save ?? 'НЕТ'} · вкладки ${header.tabs.join(', ') || 'НЕТ'} · ` +
        `полос мастера ${header.wizardSteps} · мастер ${header.wizardLink ?? 'ссылки нет'}`,
    );
    const start = await page.evaluate(READ_INSPECTOR);
    const startRow = await page.evaluate(READ_ROW);
    const startGaps = await page.evaluate(READ_GAPS);
    const startStatus = await page.evaluate(READ_STATUS);
    check(
      'S1 стена из замера: w1, 3600 мм, замерено; ряд пустой, пустота во всю стену, состояние «Черновик»',
      start.wall?.id === 'w1' &&
        start.wall.length === 3600 &&
        start.wall.state === 'measured' &&
        Array.isArray(startRow) &&
        startRow.length === 0 &&
        Boolean(startGaps?.some((g) => g.row === 'base' && g.from === 0 && g.width === 3600)) &&
        startStatus?.key === 'draft',
      `стена ${start.wall ? `${start.wall.id} ${start.wall.length} ${start.wall.state}` : 'НУЛЕВОЙ СЕЛЕКТОР: строки стены нет'} · ` +
        `ряд ${startRow === null ? 'НУЛЕВОЙ СЕЛЕКТОР: схемы нет' : rowWords(startRow)} · ` +
        `пустоты ${(startGaps ?? []).map((g) => `${g.row}:${g.from}+${g.width}`).join(' ') || 'НЕТ'} · ` +
        `состояние ${startStatus ? `${startStatus.key}: ${startStatus.text}` : 'НЕТ'}`,
    );
    await page.screenshot({ path: `${OUT}/S1-studio-1440.png` });

    /* Вкладка «Замер» — тот же замер объекта, без обязательного прохода. */
    const surveyTab = await studioTab(page, 'survey');
    const surveyStep = surveyTab
      ? await page
          .waitForSelector('[data-survey-step]', { timeout: 15_000 })
          .then((n) => n.getAttribute('data-survey-step'))
          .catch(() => null)
      : null;
    check(
      'S1 вкладка «Замер» открывает замер объекта; обратно — «Дизайн»',
      Boolean(surveyStep) && (await studioTab(page, 'layout')),
      surveyTab ? (surveyStep ? `шаг замера «${surveyStep}»` : 'НУЛЕВОЙ СЕЛЕКТОР: панели замера нет') : 'НУЛЕВОЙ СЕЛЕКТОР: вкладки «Замер» нет',
    );
    await page.waitForSelector('[data-schematic]', { timeout: 30_000 }).catch(() => undefined);

    /* ── S2. Модуль без готового решения ── */
    console.log('\n── S2. Пустое место → библиотека → «Дверца 600»');
    const gapClicked = await clickGap(page, 0, 'base');
    const gapInspector = await waitFor(page, READ_INSPECTOR, (v) => v.gap !== null, 10_000);
    check(
      'S2 пустота выбрана: инспектор показывает место стены',
      gapClicked && gapInspector.gap?.from === 0 && gapInspector.gap.width === 3600,
      gapClicked ? (gapInspector.gap ? `пусто ${gapInspector.gap.from}+${gapInspector.gap.width}` : 'НУЛЕВОЙ СЕЛЕКТОР: инспектор пустоты не показал') : 'НУЛЕВОЙ СЕЛЕКТОР: пустоты 0 на схеме нет',
    );
    const totalEmpty = await page.evaluate(READ_TOTAL);
    const picked = await pickCard(page, 'door', 600);
    if (picked.error) check('S2 карточка «Дверца 600» доступна', false, picked.error);
    const placed = await waitFor(page, READ_ROW, (row) => Array.isArray(row) && row.length === 1, 20_000);
    const first = placed?.[0] ?? null;
    check(
      'S2 модуль встал в пустоту: отметка 0, ширина 600',
      Boolean(first) && first.offset === 0 && first.width === 600,
      first ? rowWords(placed) : `НУЛЕВОЙ СЕЛЕКТОР: на схеме модулей нет · ${rowWords(placed)}`,
    );
    if (!first) {
      await page.screenshot({ path: `${OUT}/S2-no-module.png` });
      await context.close();
      return;
    }
    const id = first.id;

    /* ── S3. Выбор в 2D и в 3D — один ИД ── */
    console.log('\n── S3. Выбор на схеме и в 3D');
    await clickModule(page, id);
    const sel2d = await waitFor(page, READ_INSPECTOR, (v) => v.module?.id === id, 10_000);
    check(
      'S3 схема: инспектор — тот же ИД, стена w1, отметка 0, ширина 600, высота и глубина корпуса',
      sel2d.module?.id === id &&
        sel2d.module.wall === 'w1' &&
        sel2d.module.offset === 0 &&
        sel2d.module.width === 600 &&
        (sel2d.module.height ?? 0) > 0 &&
        (sel2d.module.depth ?? 0) > 0 &&
        sel2d.module.leaves === 1,
      sel2d.module
        ? `${sel2d.module.id} · стена ${sel2d.module.wall} · ${sel2d.module.offset}+${sel2d.module.width} · ` +
            `${sel2d.module.height}×${sel2d.module.depth} · створок ${sel2d.module.leaves}`
        : 'НУЛЕВОЙ СЕЛЕКТОР: инспектор модуля пуст',
    );
    /* Снять выбор модуля — выбрать пустоту справа, — чтобы нажатие в 3D выбрало заново. */
    await clickGap(page, 600, 'base');
    await waitFor(page, READ_INSPECTOR, (v) => v.module === null, 5_000);
    await schematicView(page, 'scene');
    const drawn = await cadModules(page);
    check(
      'S3 3D: модуль нарисован тем же ИД',
      Boolean(drawn?.ids?.includes(id)),
      drawn ? `нарисовано ${drawn.drawn}: ${drawn.ids.join(' ')}` : 'НУЛЕВОЙ СЕЛЕКТОР: 3D не нарисовала ни одного модуля',
    );
    const doorPoint = await waitFor(
      page,
      `(() => (window.__mwPartPoint ? window.__mwPartPoint(${JSON.stringify(`${id}:door:0`)}) : null))()`,
      (p) => p !== null,
      20_000,
    );
    if (doorPoint) {
      await page.mouse.click(doorPoint.x, doorPoint.y);
    }
    const sel3d = await waitFor(page, READ_INSPECTOR, (v) => v.module?.id === id, 10_000);
    check(
      'S3 3D: нажатие на створку выбирает модуль — в инспекторе тот же ИД',
      Boolean(doorPoint) && sel3d.module?.id === id,
      doorPoint ? `инспектор ${sel3d.module?.id ?? 'ПУСТ'}` : `НУЛЕВОЙ СЕЛЕКТОР: створки ${id}:door:0 в 3D нет`,
    );
    await page.screenshot({ path: `${OUT}/S3-3d-selected.png` });

    /* ── S4. Ширина 600 → 750 ── */
    console.log('\n── S4. Ширина 600 → 750 полем инспектора');
    const totalBefore = await page.evaluate(READ_TOTAL);
    const typed = await typeWidth(page, 750);
    const after3d = await waitFor(page, READ_INSPECTOR, (v) => v.module?.width === 750, 10_000);
    const leafPrefix = `${id}:door:`;
    const openable = await waitFor(
      page,
      `(() => (window.__mwOpenableIds ? window.__mwOpenableIds() : null))()`,
      (ids) => Array.isArray(ids) && ids.filter((p) => p.startsWith(leafPrefix)).length === 2,
      15_000,
    );
    const leaves3d = (openable ?? []).filter((p) => p.startsWith(leafPrefix));
    check(
      'S4 поле ширины есть, инспектор: 750 мм, тот же ИД, та же отметка, две створки',
      typed && after3d.module?.id === id && after3d.module.offset === 0 && after3d.module.width === 750 && after3d.module.leaves === 2,
      typed
        ? after3d.module
          ? `${after3d.module.id} · ${after3d.module.offset}+${after3d.module.width} · створок ${after3d.module.leaves}`
          : 'НУЛЕВОЙ СЕЛЕКТОР: инспектор модуля пуст'
        : 'НУЛЕВОЙ СЕЛЕКТОР: поля «Ширина, мм» в панели Studio нет',
    );
    check(
      'S4 3D: у модуля две створки',
      leaves3d.length === 2,
      leaves3d.length > 0 ? leaves3d.join(' ') : 'НУЛЕВОЙ СЕЛЕКТОР: створок модуля в 3D нет',
    );
    await page.screenshot({ path: `${OUT}/S4-inspector-750.png` });
    /*
     * ПОКОЙ НАЧИНАЕТСЯ, КОГДА ПРАВКА ЗАКОНЧИЛАСЬ ЦЕЛИКОМ: створка
     * дорисована и автосохранение записало её («Сохранено»). Перерендер
     * экрана рисует сцене один кадр — замерено: «Сохраняем… → Сохранено»
     * +1, смета открыта +1, закрыта +1, наведение 0. Это отклик на
     * действие, а не покой; окно, начатое раньше записи, мерило его.
     */
    await waitFor(
      page,
      `(() => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null)()`,
      (v) => v === 'saved',
      30_000,
    );
    await sleep(1000);
    const framesBefore = await page.evaluate(() => (window.__mwCadFrames ? window.__mwCadFrames() : null));
    await sleep(5000);
    const framesAfter = await page.evaluate(() => (window.__mwCadFrames ? window.__mwCadFrames() : null));
    check(
      'S7 покой: 3D за 5 с не нарисовала ни кадра',
      framesBefore !== null && framesAfter !== null && framesAfter - framesBefore === 0,
      framesBefore === null ? 'НУЛЕВОЙ СЕЛЕКТОР: счётчика кадров сцены нет' : `кадров ${framesAfter - framesBefore}`,
    );
    await schematicView(page, 'front');
    const row750 = await waitFor(page, READ_ROW, (row) => Array.isArray(row) && row.length === 1, 10_000);
    const totalAfter = await page.evaluate(READ_TOTAL);
    check(
      'S4 схема: тот же ИД на отметке 0 шириной 750; итог сметы изменился',
      row750?.length === 1 && row750[0].id === id && row750[0].offset === 0 && row750[0].width === 750 &&
        totalBefore !== null && totalAfter !== null && totalAfter !== totalBefore && totalAfter > 0,
      `${rowWords(row750)} · итог ${totalEmpty ?? '—'} → ${totalBefore ?? 'НЕТ'} → ${totalAfter ?? 'НЕТ'}`,
    );
    await studioTab(page, 'panels');
    const parts = await waitFor(page, READ_PARTS, (rows) => rows.length > 0, 15_000);
    const own = parts.filter((p) => p.module === id);
    const fronts = own.filter((p) => p.name === 'Фасад');
    const frontQty = fronts.reduce((sum, p) => sum + p.qty, 0);
    const bad = parts.filter((p) => {
      const nums = (p.size ?? '').split(/[×x]/).map(Number);
      return nums.length < 2 || nums.some((n) => !Number.isFinite(n) || n <= 0) || !(p.qty > 0);
    });
    check(
      'S4 деталировка: у модуля два фасада, все детали — стены w1, размеров с NaN, нулём и минусом нет',
      own.length > 0 && frontQty === 2 && parts.every((p) => p.wall === 'w1') && bad.length === 0,
      parts.length === 0
        ? 'НУЛЕВОЙ СЕЛЕКТОР: деталей на вкладке «Деталировка» нет'
        : `деталей ${parts.length}, модуля ${own.length} · фасадов ${frontQty}: ${fronts.map((p) => `${p.size}×${p.qty}`).join(' ') || 'НЕТ'} · ` +
            `стены ${[...new Set(parts.map((p) => p.wall))].join(',')} · плохих ${bad.length}${bad[0] ? ` (${bad[0].size})` : ''}`,
    );
    await page.screenshot({ path: `${OUT}/S4-panels.png` });

    /* ── S5. Недопустимая ширина — отказ числами ── */
    console.log('\n── S5. Сосед вплотную, ширина 1000 — отказ числами');
    await studioTab(page, 'layout');
    await page.waitForSelector('[data-schematic]', { timeout: 30_000 }).catch(() => undefined);
    await clickGap(page, 750, 'base');
    const second = await pickCard(page, 'door', 600);
    if (second.error) check('S5 вторая карточка «Дверца 600» доступна', false, second.error);
    const pair = await waitFor(page, READ_ROW, (row) => Array.isArray(row) && row.length === 2, 20_000);
    await clickModule(page, id);
    await waitFor(page, READ_INSPECTOR, (v) => v.module?.id === id, 10_000);
    await typeWidth(page, 1000);
    const notice = await page
      .waitForSelector('[data-scene-notice]', { timeout: 10_000 })
      .then((n) => n.textContent())
      .catch(() => null);
    const pairAfter = await page.evaluate(READ_ROW);
    check(
      'S5 1000 мм рядом с соседом: отказ «доступно 750 мм, требуется 1000 мм, не хватает 250 мм», ряд прежний',
      rowWords(pair) === `${id}@0+750 ${pair?.[1]?.id}@750+600` &&
        rowWords(pairAfter) === rowWords(pair) &&
        Boolean(notice?.includes('доступно 750 мм') && notice.includes('требуется 1000 мм') && notice.includes('не хватает 250 мм')),
      `ряд ${rowWords(pair)} → ${rowWords(pairAfter)} · ${notice ? `«${notice.trim()}»` : 'НУЛЕВОЙ СЕЛЕКТОР: строки отказа нет'}`,
    );
    const statusNow = await page.evaluate(READ_STATUS);
    check(
      'S5 отказ не делает проект ошибочным: состояние не «блокирующие ошибки»',
      Boolean(statusNow) && statusNow.key !== 'blocked',
      statusNow ? `${statusNow.key}: ${statusNow.text}` : 'НУЛЕВОЙ СЕЛЕКТОР: строки состояния нет',
    );

    /* ── S6. Сохранение и повторное открытие ── */
    console.log('\n── S6. Сохранено → в базе → перезагрузка → мастер');
    const before = await page.evaluate(READ_ROW);
    const totalSaved = await page.evaluate(READ_TOTAL);
    const saved = await waitFor(
      page,
      `(() => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null)()`,
      (v) => v === 'saved',
      30_000,
    );
    const { data: stored } = await service.from('projects').select('millwork').eq('id', project.id).single();
    const storedRun = stored?.millwork?.runs?.optimal ?? null;
    const storedRow = (storedRun?.modules ?? []).map((m) => `${m.id}@${m.offsetMm}+${m.widthMm}/${m.doorCount}`).join(' ');
    check(
      'S6 автосохранение: «Сохранено», в базе свободная сборка и тот же ряд, решения нет, соседних стен нет',
      saved === 'saved' &&
        stored?.millwork?.requirements?.mode === 'free' &&
        !stored?.millwork?.templateId &&
        storedRow === `${id}@0+750/2 ${before?.[1]?.id}@750+600/1` &&
        Object.keys(stored?.millwork?.wallRuns ?? {}).length === 0,
      `состояние ${saved ?? 'НЕТ'} · режим ${stored?.millwork?.requirements?.mode ?? 'НЕТ'} · решение ${stored?.millwork?.templateId ?? 'нет'} · ` +
        `в базе ${storedRow || 'РЯДА НЕТ'} · соседних стен ${Object.keys(stored?.millwork?.wallRuns ?? {}).length}`,
    );
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('[data-studio-root]', { timeout: 60_000 }).catch(() => undefined);
    await page.waitForSelector('[data-schematic]', { timeout: 60_000 }).catch(() => undefined);
    const reopened = await waitFor(page, READ_ROW, (row) => Array.isArray(row) && row.length === 2, 30_000);
    await clickModule(page, id);
    const reInspector = await waitFor(page, READ_INSPECTOR, (v) => v.module?.id === id, 10_000);
    const totalReopened = await waitFor(page, READ_TOTAL, (v) => v !== null, 10_000);
    check(
      'S6 перезагрузка: те же ИД, отметки и ширины; инспектор — стена w1, 750 мм, две створки; итог тот же',
      rowWords(reopened) === rowWords(before) &&
        reInspector.module?.wall === 'w1' &&
        reInspector.module.width === 750 &&
        reInspector.module.leaves === 2 &&
        totalReopened === totalSaved,
      `${rowWords(before)} → ${rowWords(reopened)} · инспектор ${reInspector.module ? `${reInspector.module.id} ${reInspector.module.wall} ${reInspector.module.width} створок ${reInspector.module.leaves}` : 'ПУСТ'} · ` +
        `итог ${totalSaved} → ${totalReopened}`,
    );
    await page.screenshot({ path: `${OUT}/S6-after-reload.png` });
    if (await schematicView(page, 'plan')) {
      await sleep(800);
      await page.screenshot({ path: `${OUT}/S6-plan.png` });
      await schematicView(page, 'front');
    }

    await page.goto(`${BASE}/project/${project.id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const layoutStep = page.locator('nav[aria-label="Шаги работы"] button[aria-label="Раскладка"]');
    await layoutStep.click({ timeout: 60_000 }).catch(() => undefined);
    const wizardRow = await waitFor(page, READ_ROW, (row) => Array.isArray(row) && row.length === 2, 30_000);
    check(
      'S6 мастер /project/<id> открывает тот же ряд',
      rowWords(wizardRow) === rowWords(before),
      `${rowWords(wizardRow)}`,
    );

    /* ── S7. Планшет ── */
    await page.goto(`${BASE}/project/${project.id}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.waitForSelector('[data-schematic]', { timeout: 60_000 }).catch(() => undefined);
    await sleep(1500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('S7 планшет 1180: страница не шире экрана', overflow <= 0, `лишних ${overflow} px`);
    await page.screenshot({ path: `${OUT}/S7-tablet-1180.png` });

    check('ошибок страницы нет', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || 'ноль');
    await context.close();
  } finally {
    if (made.project) await service.from('projects').delete().eq('id', made.project);
    if (made.org) await service.from('orgs').delete().eq('id', made.org);
    if (made.user) await service.auth.admin.deleteUser(made.user);
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
