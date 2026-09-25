/**
 * КАТАЛОГ МАТЕРИАЛОВ РЯДОМ СО СЦЕНОЙ — В БРАУЗЕРЕ, ТЕМ ЖЕ ПУТЁМ, ЧТО ЭКРАН.
 *
 * Запуск: node scripts/check-materials.mjs   (нужен build)
 *
 * `test:millwork` и `test:catalog` меряют движок: загрузку файла, коды,
 * вкладки, строку «цена не задана». Но цвет, который видит клиент,
 * получается в шве — панель → операция → ряд → материал сцены, — и
 * проверить его можно только на материале, который действительно висит
 * в сцене.
 *
 * Сценарии:
 *   13. демо: панель рядом со сценой, поиск «RAL 010 30 20» — ровно одна
 *       позиция; нажали — у КАЖДОЙ пачки фасадов цвет материала равен
 *       hex, переведённому в линейное пространство здесь же своей
 *       формулой; смета говорит «цена не задана», итог «неполный»;
 *       High Gloss ↔ Touch Sense меняют шероховатость и лак; снимки
 *       до и после;
 *   12. настоящая организация: своя позиция в коллекцию EGGER с фото и
 *       настоящим размером — сохраняется в каталог и Storage, ложится на
 *       фасады, переживает перезагрузку страницы. Организация, объект,
 *       файлы и пользователь заводятся служебным ключом и удаляются.
 *
 * Любое расхождение — FAIL и ненулевой код выхода. Ноль найденного —
 * FAIL с внятной строкой, а не молчаливый пропуск.
 *
 * Инструмент глазной проверки, в `verify` не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = 3226;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/materials';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* .env.local читаем сами: next start его прочтёт, а этот процесс — нет. */
try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^['"]|['"]$/g, '');
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
} catch {
  /* файла нет — ниже это названо словами */
}

function freePort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, {
      encoding: 'utf8',
    });
    for (const line of out.split(/\r?\n/)) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== '0') {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      }
    }
  } catch {
    /* никто не слушает */
  }
}

freePort(PORT);
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
  env: { ...process.env, SITE_PASSWORD: '' },
});

let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok   ${name}${detail ? `  ${detail}` : ''}`);
  else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? `  ${detail}` : ''}`);
  }
};

/** sRGB → линейное: своя формула, а не та, что в продукте. */
const linear = (hex) =>
  [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));

/** Материалы фасадов, которые висят в видимой сцене. */
const READ_FRONTS = `(() => (window.__mwCadFronts ? window.__mwCadFronts() : null))()`;

/** Панель материалов — что на ней нарисовано. */
const READ_PANEL = `(() => {
  const panel = document.querySelector('[data-materials-panel]');
  if (!panel) return null;
  const visible = panel.offsetParent !== null;
  return {
    visible,
    loaded: panel.getAttribute('data-loaded') === '1',
    target: panel.getAttribute('data-target'),
    tab: panel.getAttribute('data-tab'),
    matches: Number(panel.getAttribute('data-match-count')),
    tabs: [...panel.querySelectorAll('[data-material-tab]')].map((n) => ({
      key: n.getAttribute('data-material-tab'),
      disabled: n.disabled,
      reason: n.getAttribute('title'),
    })),
    rows: [...panel.querySelectorAll('[data-material-item]')].map((n) => ({
      code: n.getAttribute('data-material-item'),
      id: n.getAttribute('data-item-id'),
      applied: n.getAttribute('aria-pressed') === 'true',
      photo: n.getAttribute('data-photo') === '1',
    })),
    surfaces: [...panel.querySelectorAll('[data-material-surface]')].map((n) => ({
      key: n.getAttribute('data-material-surface'),
      on: n.getAttribute('aria-pressed') === 'true',
    })),
    notice: panel.querySelector('[data-material-notice]')?.textContent ?? null,
  };
})()`;

const READ_ESTIMATE = `(() => {
  const total = document.querySelector('[data-estimate-total]');
  const lines = window.__mwEstimateLines ? window.__mwEstimateLines() : null;
  return {
    total: total ? Number(total.getAttribute('data-estimate-total')) : null,
    incomplete: total ? total.getAttribute('data-estimate-incomplete') === '1' : null,
    caption: document.querySelector('[data-estimate-caption]')?.textContent ?? null,
    lines,
  };
})()`;

async function waitFor(page, script, test, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  let value = await page.evaluate(script);
  while (!test(value) && Date.now() < until) {
    await sleep(300);
    value = await page.evaluate(script);
  }
  return value;
}

/** Шаг «Материалы», вид 3D и открытая правая панель. */
async function openMaterials(page) {
  await page.getByRole('button', { name: /Материалы/ }).first().click({ timeout: 90_000 });
  await sleep(1200);
  await page.evaluate(() => document.querySelector('[data-schematic-tab="scene"]')?.click());
  await sleep(2500);
  const toggle = page.locator('[data-panel-toggle]');
  if ((await toggle.count()) > 0 && /Показать/.test(await toggle.first().innerText())) {
    await toggle.first().click();
    await sleep(1500);
  }
  return waitFor(page, READ_PANEL, (p) => p && p.visible && p.loaded, 45_000);
}

async function search(page, text) {
  const box = page.locator('[data-materials-panel] [data-material-search]');
  await box.fill('');
  await box.fill(text);
  await sleep(600);
}

/** Пачки фасадов, у которых цвет НЕ равен ожидаемому. */
const offColor = (fronts, hex) => {
  const want = linear(hex);
  return fronts.filter((f) => !f.color.every((v, i) => Math.abs(v - want[i]) < 1e-3));
};

/* ─────────────────────────────  13. Демо  ───────────────────────────── */

async function demoScenario(browser) {
  console.log('\n  ── демо: поиск, цвет в сцене, поверхность, смета (тест 13)');
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log('  [ошибка страницы]', e.message.slice(0, 160)));

  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(3500);

  const panel = await openMaterials(page);
  check(
    'панель «Материалы» открыта рядом со сценой и каталог загружен',
    Boolean(panel?.visible && panel.loaded),
    panel ? `видна ${panel.visible} · загружена ${panel.loaded}` : 'НУЛЕВОЙ СЕЛЕКТОР: [data-materials-panel] нет на экране',
  );
  if (!panel?.visible) {
    await page.screenshot({ path: `${OUT}/demo-no-panel.png` });
    await page.close();
    return;
  }

  const before = await waitFor(page, READ_FRONTS, (f) => Array.isArray(f) && f.length > 0, 20_000);
  check(
    'в сцене есть фасады — мерить есть на чём',
    Array.isArray(before) && before.length > 0,
    Array.isArray(before) ? `пачек фасадов ${before.length}` : 'НУЛЕВОЙ СЕЛЕКТОР: __mwCadFronts нет',
  );
  await page.screenshot({ path: `${OUT}/demo-before.png` });

  await page.locator('[data-material-target="fronts"]').click();
  await page.locator('[data-material-tab="mdf_paint"]').click();
  await sleep(400);
  await search(page, 'RAL 010 30 20');
  const found = await waitFor(page, READ_PANEL, (p) => p && p.rows.length > 0, 10_000);
  check(
    'тест 13: поиск «RAL 010 30 20» — ровно один результат',
    found?.matches === 1 && found.rows.length === 1 && found.rows[0].code === 'RAL 010 30 20',
    found ? `совпадений ${found.matches} · строк ${found.rows.length}: ${found.rows.map((r) => r.code).join(' · ')}` : 'НУЛЕВОЙ СЕЛЕКТОР',
  );
  if (!found?.rows.length) {
    await page.close();
    return;
  }

  const itemId = found.rows[0].id;
  await page.locator('[data-materials-panel] [data-material-item]').first().click();
  const after = await waitFor(
    page,
    READ_FRONTS,
    (f) => Array.isArray(f) && f.length > 0 && offColor(f, '#643941').length === 0,
    15_000,
  );
  const wrong = Array.isArray(after) ? offColor(after, '#643941') : [];
  check(
    'тест 13: нажали — у КАЖДОЙ пачки фасадов цвет материала = линеаризованный #643941',
    Array.isArray(after) && after.length > 0 && wrong.length === 0,
    Array.isArray(after)
      ? `пачек ${after.length} · не того цвета ${wrong.length}` +
          (wrong[0] ? ` · например ${wrong[0].key}: ${wrong[0].color.map((v) => v.toFixed(4)).join(' ')}` : '') +
          ` · ожидали ${linear('#643941').map((v) => v.toFixed(4)).join(' ')}`
      : 'НУЛЕВОЙ СЕЛЕКТОР',
  );
  check(
    'тест 9 в браузере: код RAL 010 30 20 на каждом фасаде — у каждой пачки артикул позиции',
    Array.isArray(after) && after.length > 0 && after.every((f) => f.key.includes(itemId)),
    Array.isArray(after) ? after.map((f) => `${f.count}×${f.key.includes(itemId) ? 'RAL' : f.key}`).join(' · ') : '—',
  );

  const estimate = await waitFor(page, READ_ESTIMATE, (e) => e.incomplete === true, 10_000);
  const unpriced = (estimate.lines ?? []).filter((line) => line.priceUnset);
  check(
    'тест 11 на экране: у RAL строка «цена не задана», итог помечен «неполный»',
    estimate.incomplete === true && unpriced.some((line) => line.priceUnset === 'цена не задана'),
    `неполный ${estimate.incomplete} · подпись «${estimate.caption ?? '—'}» · без цены: ${unpriced.map((line) => line.key).join(' ') || 'нет'}`,
  );
  await page.screenshot({ path: `${OUT}/demo-after-ral.png` });

  /* Поверхность МДФ-панели: Touch Sense ↔ High Gloss. */
  await page.locator('[data-material-tab="mdf_panel"]').click();
  await search(page, 'Белый премиум');
  const mdf = await waitFor(page, READ_PANEL, (p) => p && p.rows.length > 0, 10_000);
  check(
    'МДФ-панель «Белый премиум» находится поиском по названию',
    mdf?.rows.length === 1,
    mdf ? `строк ${mdf.rows.length}` : 'НУЛЕВОЙ СЕЛЕКТОР',
  );
  if (mdf?.rows.length) {
    await page.locator('[data-materials-panel] [data-material-item]').first().click();
    await sleep(800);
    const surfaces = await waitFor(page, READ_PANEL, (p) => p && p.surfaces.length === 2, 10_000);
    check(
      'у МДФ-панели переключатель ровно из двух поверхностей: High Gloss и Touch Sense',
      surfaces?.surfaces.map((s) => s.key).join(',') === 'high_gloss,touch_sense',
      surfaces ? surfaces.surfaces.map((s) => s.key).join(',') : 'НУЛЕВОЙ СЕЛЕКТОР',
    );

    const roughAt = async (surface) => {
      await page.locator(`[data-material-surface="${surface}"]`).click();
      const fronts = await waitFor(
        page,
        READ_FRONTS,
        (f) => Array.isArray(f) && f.length > 0 && f.every((x) => x.key.includes(surface)),
        10_000,
      );
      return fronts;
    };
    const touch = await roughAt('touch_sense');
    await page.screenshot({ path: `${OUT}/demo-touch-sense.png` });
    const gloss = await roughAt('high_gloss');
    await page.screenshot({ path: `${OUT}/demo-high-gloss.png` });
    const r = (list) => (Array.isArray(list) ? Array.from(new Set(list.map((f) => `${f.roughness}/${f.clearcoat}`))).join(' ') : '—');
    check(
      'тест 13: Touch Sense → High Gloss меняет шероховатость (0.9 → 0.05) и лак (0 → 1)',
      Array.isArray(touch) && Array.isArray(gloss) &&
        touch.every((f) => f.roughness === 0.9 && f.clearcoat === 0) &&
        gloss.every((f) => f.roughness === 0.05 && f.clearcoat === 1),
      `Touch Sense ${r(touch)} · High Gloss ${r(gloss)}`,
    );
  }

  await page.close();
}

/* ──────────────────────  12. Настоящая организация  ────────────────────── */

async function orgScenario(browser) {
  console.log('\n  ── организация: своя позиция с фото переживает перезагрузку (тест 12)');
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !ANON || !SERVICE || /your-project|example/.test(URL)) {
    check('тест 12: Supabase доступен для проверки своей позиции', false, 'НЕ ПРОВЕРЕНО: нет ключей в .env.local');
    return;
  }

  const service = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = Date.now();
  const email = `materials-${stamp}@example.test`;
  const password = `Pw-${stamp}-materials!`;
  const made = { user: null, org: null };

  try {
    const { data: created, error: userError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userError) throw new Error(`createUser: ${userError.message}`);
    made.user = created.user.id;

    const { data: org, error: orgError } = await service
      .from('orgs')
      .insert({ slug: `materials-${stamp}`, name: `Проверка материалов ${stamp}` })
      .select('id')
      .single();
    if (orgError) throw new Error(`insert org: ${orgError.message}`);
    made.org = org.id;

    const { error: memberError } = await service
      .from('org_members')
      .insert({ org_id: org.id, user_id: created.user.id, role: 'owner' });
    if (memberError) throw new Error(`insert member: ${memberError.message}`);

    /* Куки ставит сама библиотека: формат сессии не подделывается. */
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
    check('тест 12: вход настоящим пользователем', jar.length > 0, `кук ${jar.length}`);

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies(
      jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' })),
    );
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('  [ошибка страницы]', e.message.slice(0, 160)));

    /* Типовой прайс — тот же путь, что кнопка в админке: без ставок смета не считается. */
    const seeded = await page.request.post(`${BASE}/api/catalog/seed-rates`, { data: { orgId: org.id } });
    check('типовой прайс заведён организации', seeded.ok(), `${seeded.status()}`);

    const { data: project, error: projectError } = await service
      .from('projects')
      .insert({
        org_id: org.id,
        address: 'Проверка материалов',
        zone: 'Кухня',
        client_name: 'Проверка',
        measurements: {
          id: `m-${stamp}`,
          ceilingHeightMm: 2700,
          walls: [{ id: 'a', lengthMm: 3800, angleDeg: 90, openings: [] }],
          comms: [],
          photos: [],
          measuredBy: 'проверка',
          measuredAt: new Date().toISOString(),
          notes: '',
        },
        millwork: { templateId: 'linear-column' },
        status: 'in_progress',
      })
      .select('id')
      .single();
    if (projectError) throw new Error(`insert project: ${projectError.message}`);

    await page.goto(`${BASE}/project/${project.id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await sleep(3500);
    const panel = await openMaterials(page);
    check(
      'тест 12: панель материалов открыта на объекте организации',
      Boolean(panel?.visible && panel.loaded),
      panel ? `видна ${panel.visible} · загружена ${panel.loaded}` : 'НУЛЕВОЙ СЕЛЕКТОР: [data-materials-panel] нет на экране',
    );
    if (!panel?.visible) {
      await page.screenshot({ path: `${OUT}/org-no-panel.png` });
      await context.close();
      return;
    }

    /* Фото: мелкое — предупреждение, настоящее — без него. */
    const stripes = (w, h) =>
      sharp(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
            Array.from({ length: 16 }, (_, i) => `<rect x="${(i * w) / 16}" y="0" width="${w / 32}" height="${h}" fill="${i % 2 ? '#8a5a2b' : '#c9a36b'}"/>`).join('') +
            `</svg>`,
        ),
      )
        .flatten({ background: '#b88a55' })
        .jpeg({ quality: 90 })
        .toBuffer();
    const small = await stripes(400, 300);
    const big = await stripes(1600, 1200);

    await page.locator('[data-material-target="fronts"]').click();
    await page.locator('[data-material-add]').click();
    const form = page.locator('[data-material-add-form]');
    await form.locator('[data-add-collection]').selectOption('egger-ldsp');
    const code = `EGGER-TEST-${stamp}`;
    await form.locator('[data-add-code]').fill(code);
    await form.locator('[data-add-name]').fill('Дуб проверочный');
    await form.locator('[data-add-photo]').setInputFiles({ name: 'small.jpg', mimeType: 'image/jpeg', buffer: small });
    const warned = await waitFor(page, `(() => document.querySelector('[data-photo-warning]')?.textContent ?? null)()`, (t) => Boolean(t), 8000);
    check(
      'фото 400×300 px — в карточке предупреждение про квадраты на столешнице',
      Boolean(warned && /1000/.test(warned)),
      warned ?? 'НУЛЕВОЙ СЕЛЕКТОР: предупреждения нет',
    );
    await form.locator('[data-add-photo]').setInputFiles({ name: 'oak.jpg', mimeType: 'image/jpeg', buffer: big });
    const cleared = await waitFor(page, `(() => document.querySelector('[data-photo-warning]')?.textContent ?? null)()`, (t) => !t, 8000);
    check('фото 1600×1200 px — предупреждения нет', !cleared, cleared ?? 'нет');
    await form.locator('[data-add-width]').fill('600');
    await form.locator('[data-add-height]').fill('450');
    await page.screenshot({ path: `${OUT}/org-add-form.png` });
    await form.locator('[data-add-save]').click();

    await page.locator('[data-material-tab="ldsp"]').click();
    await search(page, code);
    const added = await waitFor(page, READ_PANEL, (p) => p && p.rows.length === 1 && p.rows[0].photo, 30_000);
    const addError = await page.evaluate(() => document.querySelector('[data-add-error]')?.textContent ?? null);
    check(
      'тест 12: своя позиция сохранена в коллекцию EGGER вместе с фото',
      added?.rows.length === 1 && added.rows[0].code === code && added.rows[0].photo,
      added ? `строк ${added.rows.length} · фото ${added.rows[0]?.photo}${addError ? ` · ${addError}` : ''}` : `НУЛЕВОЙ СЕЛЕКТОР${addError ? `: ${addError}` : ''}`,
    );
    if (!added?.rows.length) {
      await page.screenshot({ path: `${OUT}/org-not-added.png` });
      await context.close();
      return;
    }

    const itemId = added.rows[0].id;
    await page.locator('[data-materials-panel] [data-material-item]').first().click();
    const applied = await waitFor(
      page,
      READ_FRONTS,
      (f) => Array.isArray(f) && f.length > 0 && f.every((x) => x.key.includes(itemId) && x.map),
      30_000,
    );
    const sized = Array.isArray(applied) ? Array.from(new Set(applied.map((f) => JSON.stringify(f.realSizeM)))) : [];
    check(
      'тест 12: позиция легла на все фасады — с фото, а не цветом',
      Array.isArray(applied) && applied.length > 0 && applied.every((f) => f.key.includes(itemId) && f.map),
      Array.isArray(applied) ? applied.map((f) => `${f.count}×${f.map ? 'фото' : 'цвет'}`).join(' · ') : 'НУЛЕВОЙ СЕЛЕКТОР',
    );
    check(
      'фото лежит в настоящем размере: 600 × 450 мм на каждом фасаде',
      sized.length === 1 && sized[0] === JSON.stringify([0.6, 0.45]),
      sized.join(' ') || '—',
    );
    await page.screenshot({ path: `${OUT}/org-applied.png` });

    const saved = await waitFor(
      page,
      `(() => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null)()`,
      (s) => s === 'saved',
      30_000,
    );
    check('объект сохранился', saved === 'saved', saved ?? 'НУЛЕВОЙ СЕЛЕКТОР: индикатора сохранения нет');

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
    await sleep(3500);
    const again = await openMaterials(page);
    check('после перезагрузки панель снова открыта', Boolean(again?.visible), again ? '' : 'НУЛЕВОЙ СЕЛЕКТОР');
    await page.locator('[data-material-target="fronts"]').click();
    await page.locator('[data-material-tab="ldsp"]').click();
    await search(page, code);
    const still = await waitFor(page, READ_PANEL, (p) => p && p.rows.length === 1, 30_000);
    check(
      'тест 12: после перезагрузки позиция в каталоге и отмечена применённой',
      still?.rows.length === 1 && still.rows[0].id === itemId && still.rows[0].applied && still.rows[0].photo,
      still ? `строк ${still.rows.length} · применена ${still.rows[0]?.applied} · фото ${still.rows[0]?.photo}` : 'НУЛЕВОЙ СЕЛЕКТОР',
    );
    const reloaded = await waitFor(
      page,
      READ_FRONTS,
      (f) => Array.isArray(f) && f.length > 0 && f.every((x) => x.key.includes(itemId) && x.map),
      30_000,
    );
    check(
      'тест 12: после перезагрузки фасады в сцене — та же позиция с фото',
      Array.isArray(reloaded) && reloaded.length > 0 && reloaded.every((f) => f.key.includes(itemId) && f.map),
      Array.isArray(reloaded) ? reloaded.map((f) => `${f.count}×${f.key.includes(itemId) ? 'своя' : f.key}${f.map ? '+фото' : ''}`).join(' · ') : 'НУЛЕВОЙ СЕЛЕКТОР',
    );
    await page.screenshot({ path: `${OUT}/org-after-reload.png` });
    await context.close();
  } finally {
    /* Уборка: организация каскадом уносит категории, позиции и объект. */
    if (made.org) {
      const { data: files } = await service.storage.from('catalog').list(made.org, { limit: 100 });
      for (const folder of files ?? []) {
        const { data: inner } = await service.storage.from('catalog').list(`${made.org}/${folder.name}`, { limit: 100 });
        for (const item of inner ?? []) {
          const { data: leaves } = await service.storage
            .from('catalog')
            .list(`${made.org}/${folder.name}/${item.name}`, { limit: 100 });
          const paths = (leaves ?? []).map((leaf) => `${made.org}/${folder.name}/${item.name}/${leaf.name}`);
          if (paths.length) await service.storage.from('catalog').remove(paths);
        }
      }
      const { error } = await service.from('orgs').delete().eq('id', made.org);
      if (error) console.log(`  [уборка] организация ${made.org} не удалилась: ${error.message}`);
    }
    if (made.user) {
      const { error } = await service.auth.admin.deleteUser(made.user);
      if (error) console.log(`  [уборка] пользователь ${made.user} не удалился: ${error.message}`);
    }
  }
}

let browser;
try {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      /* поднимается */
    }
    await sleep(1000);
  }

  browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });

  await demoScenario(browser);
  await orgScenario(browser);
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
}

console.log(`\nснимки: ${join(process.cwd(), OUT)}`);
console.log(`ПАДЕНИЙ: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
