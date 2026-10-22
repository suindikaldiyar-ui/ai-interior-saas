/**
 * ФОТО ФУРНИТУРЫ И НАГРУЗКА КАТАЛОГА В БРАУЗЕРЕ (HARDWARE-PHOTO-PERF-01).
 *
 * Запуск (после `npm run build`): `node scripts/check-hardware-media.mjs`
 *   PART=perf  — замер нагрузки на организации с рабочим каталогом (типовой
 *     прайс, материалы с RAL, KIRA, 1199 позиций фурнитуры): байты и запросы
 *     каталога, куча JS, узлы DOM, длинные задачи, открытие «Фурнитуры»,
 *     список места, быстрая прокрутка, кадры сцены при прокрутке и в покое,
 *     то же с замедлением процессора ×4. LABEL=before|after — имя файла
 *     с числами: .capture-check/hardware-media/perf-<LABEL>.json.
 *   PART=trace — диагностика: запросы каталога при открытии Studio — когда
 *     и из какого места кода (стек инициатора).
 *   PART=profile — диагностика: профиль процессора на прокрутке списка
 *     места при ×4, собственное время по функциям.
 *   PART=slot  — смена места модуля при ×4: первое нажатие через 1.5 с после
 *     готовности панели (как в PERF) и 10 смен в покое; время до кадра со
 *     списком, длинные задачи окна, профиль процессора обоих отрезков.
 *   PART=read  — лёгкое чтение настоящим PostgREST: запись изделия = поля
 *     полной строки, ставки те же, паспорт — строка целиком (помощник
 *     `scripts/hardware-light-read.ts`).
 *   PART=media — 1440 × 900: «Фото фурнитуры» в каталоге — счётчики, поиск
 *     по артикулу, нет фото словами, права (файл без подтверждения не
 *     принимается ни экраном, ни сервером), своё фото и второй ракурс, фото
 *     серии, ссылка без файла, пакет (точное — привязано, неоднозначное и
 *     ненайденное — нет), права сняты — файл удалён, «Снять привязку» —
 *     позиция цела; Studio — производитель BOYARD, «Häfele · Гардероб · N»,
 *     «Есть реальное фото», чужих картинок нет, 404 словами, карточка
 *     805.11.354 (фото, 3D-превью, чертёж), 71B3550 и её планка отдельно,
 *     9 114 276 на ящиках — поставить, сохранить, перезагрузить; паспорт
 *     установленной дочитан (присадка не «не дочитано»).
 *   PART=scroll — 60 позиций с фото: быстрая прокрутка — картинок по
 *     ходу не грузится, строк в DOM мало, чужих картинок нет, куча не растёт
 *     от круга к кругу, холст и сцена те же, кадров сцены 0.
 *   PART=scrolltrace — диагностика: трасса Chrome, A/B — тот же узор прокрутки над строками без фото и с фото; собственное
 *     время событий главного потока — всего и внутри длинных задач.
 *   PART=scrollfirst — диагностика: профиль процессора первой прокрутки после
 *     открытия панели и её повтора.
 *   PART=tablet — 1024 × 768 с касанием: каталог, фильтр, карточка в экране,
 *     установка касанием.
 *   PART=economy — «Экономичный режим»: плотность 1, без теней и окружения
 *     (числа рендерера), холст тот же, картинки библиотеки по нажатию,
 *     режим помнит устройство после перезагрузки.
 * Временная организация заводится служебным ключом и удаляется вместе с
 * файлами Storage; уборка проверяется чтением. Изображения проверки —
 * тестовые таблицы с надписью «ТЕСТ», собранные здесь же, а не фото
 * изделий. Рендер по чертежу (path tracing) не запускается.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_HWM ?? 3293);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/hardware-media';
const LABEL = process.env.LABEL ?? 'run';
const PARTS = (process.env.PART ?? 'perf').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['perf', 'trace', 'profile', 'slot', 'read', 'media', 'scroll', 'scrolltrace', 'scrollfirst', 'tablet', 'economy'];
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

function buildId() {
  try {
    return readFileSync(resolve('.next/BUILD_ID'), 'utf8').trim();
  } catch {
    throw new Stop('нет сборки в .next — сначала npm run build');
  }
}
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

let fixtures = null;
function fixture(key) {
  if (!fixtures) {
    fixtures = JSON.parse(execSync('npx tsx scripts/hardware-fixture.ts', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  }
  const fx = fixtures[key];
  if (!fx) throw new Stop(`нет объекта «${key}» в hardware-fixture`);
  return fx;
}
const FACTS = JSON.parse(readFileSync('data/catalog/hardware.json', 'utf8')).items;
const FACT_COUNT = FACTS.length;
/** Правила короба цеха — те же, что у check-hardware: по ним считается короб и присадка направляющей. */
const DRAWER_BOX = { sideMm: 16, bottomMm: 4, bottomMaterial: 'hdf', bottomMount: 'groove', bottomGrooveMm: 6, gapBelowMm: 10, gapAboveMm: 30, runnerAxisMm: 40, edge: '0.4', confirmed: true };
/** Группы каталога, как у `HARDWARE_GROUPS`: «Гардероб» — wardrobe и filling. */
const WARDROBE = new Set(['wardrobe', 'filling']);

/**
 * ТЕСТОВОЕ ИЗОБРАЖЕНИЕ — таблица с надписью «ТЕСТ», а не фото изделия:
 * проверяется механика (привязка, права, миниатюра, 404), а не картинка.
 */
const testImage = (label, color = '#3a6ea5', w = 900, h = 600) =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${color}"/>` +
        `<rect x="40" y="40" width="${w - 80}" height="${h - 80}" fill="none" stroke="#ffffff" stroke-width="6"/>` +
        `<text x="50%" y="52%" font-size="56" text-anchor="middle" fill="#ffffff" font-family="Arial">TEST ${label}</text></svg>`,
    ),
  )
    .png()
    .toBuffer();

/* ─────────────────────────  экран  ───────────────────────── */

async function waitFor(page, fn, test, ms = 20_000, arg = undefined) {
  const until = Date.now() + ms;
  let value = await page.evaluate(fn, arg);
  while (!test(value) && Date.now() < until) {
    await sleep(100);
    value = await page.evaluate(fn, arg);
  }
  return value;
}
async function tool(page, key) {
  const b = page.locator(`[data-studio-rail] [data-studio-tool="${key}"]`);
  if ((await b.count()) === 0) return false;
  await b.first().click({ timeout: 15_000 });
  await sleep(300);
  return true;
}
async function view(page, key) {
  const b = page.locator(`[data-studio-bottombar] [data-studio-view="${key}"]`);
  if ((await b.count()) === 0) return false;
  await b.first().click({ timeout: 15_000 });
  await sleep(400);
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
  while (Date.now() - t0 < 90_000 && s.root && s.state !== 'ready' && s.state !== 'failed') {
    await sleep(100);
    s = await read();
  }
  return { ...s, ms: Date.now() - t0 };
}
async function openStudio(page, projectId) {
  await page.goto(`${BASE}/project/${projectId}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('[data-studio-root]', { timeout: 120_000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-studio-rail] [data-studio-tool]');
    return Boolean(el && Object.keys(el).some((k) => k.startsWith('__reactProps')));
  }, undefined, { timeout: 120_000 });
  await sleep(800);
}
async function open3d(page, label) {
  await tool(page, 'furniture');
  must(`${label}: вид «3D»`, await view(page, '3d'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-view="3d"]');
  const s = await sceneSettled(page);
  must(`${label}: 3D готова`, s.state === 'ready', `${s.state} за ${s.ms} мс`);
  await sleep(1200);
}
/** «Фурнитура» без модуля: каталог листается по группам. */
async function hardwareBrowse(page, label) {
  must(`${label}: инструмент «Фурнитура»`, await tool(page, 'hardware'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="hardware"]');
  const items = await waitFor(page, () => Number(document.querySelector('[data-hw-panel]')?.getAttribute('data-hw-items') ?? 0), (n) => n >= 1, 60_000);
  must(`${label}: панель видит каталог организации`, items >= FACT_COUNT, `позиций ${items} при ${FACT_COUNT} в фактах`);
}
const count = (page) => page.evaluate(() => Number(document.querySelector('[data-hw-count]')?.getAttribute('data-hw-count') ?? NaN));
const saved = (page) => waitFor(page, () => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null, (v) => v === 'saved', 30_000);

/** Строки списка с картинками: чья картинка в чьей строке. */
const rowPhotos = (page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-hw-item-id]')).map((row) => {
      const img = row.querySelector('img[data-hw-photo-of]');
      return {
        id: row.getAttribute('data-hw-item-id'),
        state: row.querySelector('[data-hw-photo]')?.getAttribute('data-hw-photo') ?? null,
        of: img?.getAttribute('data-hw-photo-of') ?? null,
        src: img?.getAttribute('src') ?? null,
        broken: img ? img.complete && img.naturalWidth === 0 && img.getAttribute('src') !== '' : false,
      };
    }),
  );
/**
 * ПРОКРУТКА СПИСКА — одним циклом внутри страницы. Локатор Playwright на
 * каждом шаге (поиск по документу и проверка видимости) сам занимал главный
 * поток: в профиле при ×4 `checkVisibility` 2093 мс и `query` 1126 мс —
 * это мерило бы приёмку, а не продукт, и тем дороже, чем больше DOM.
 * Строки считаются по `[data-hw-item]` — он есть в обеих сборках; чужие
 * картинки — по `data-hw-item-id` (только у новой).
 */
const scrollList = (page, { steps, factor, dirs = [1], waitMs, inspect = false }) =>
  page.evaluate(
    async ({ steps, factor, dirs, waitMs, inspect }) => {
      const el = document.querySelector('[data-hw-list]');
      if (!el) return null;
      let maxRows = 0;
      let foreign = 0;
      for (const dir of dirs) {
        for (let i = 0; i < steps; i += 1) {
          el.scrollTop += dir * el.clientHeight * factor;
          await new Promise((r) => setTimeout(r, waitMs));
          const rows = el.querySelectorAll('[data-hw-item]');
          maxRows = Math.max(maxRows, rows.length);
          if (!inspect) continue;
          for (const row of rows) {
            const img = row.querySelector('img[data-hw-photo-of]');
            if (!img) continue;
            const id = row.getAttribute('data-hw-item-id');
            if (img.getAttribute('data-hw-photo-of') !== id || !String(img.getAttribute('src')).includes(`/hardware/${id}/`)) foreign += 1;
          }
        }
      }
      return { maxRows, foreign };
    },
    { steps, factor, dirs, waitMs, inspect },
  );

/**
 * СЦЕНА МОЛЧИТ `quietMs` ПОДРЯД — счётчик кадров видимой сцены не растёт;
 * ждём не дольше `limitMs`. Счётчика нет — `frames: null`, и это провал, а
 * не «кадров 0».
 */
async function sceneQuiet(page, quietMs, limitMs) {
  const read = () => page.evaluate(() => (window.__mwCadFrames ? window.__mwCadFrames() : null));
  const first = await read();
  if (first === null) return { ok: false, frames: null };
  const t0 = Date.now();
  let last = first;
  let since = Date.now();
  while (Date.now() - t0 < limitMs) {
    if (Date.now() - since >= quietMs) return { ok: true, frames: last - first };
    await sleep(200);
    const n = await read();
    if (n !== last) {
      last = n;
      since = Date.now();
    }
  }
  return { ok: false, frames: last - first };
}

/** Чужая картинка — картинка строки, чей адрес или пометка не этой позиции. */
const foreign = (rows) => rows.filter((r) => r.of !== null && (r.of !== r.id || !String(r.src).includes(`/hardware/${r.id}/`)));

async function metrics(cdp) {
  const { metrics: list } = await cdp.send('Performance.getMetrics');
  const get = (name) => list.find((m) => m.name === name)?.value ?? null;
  return {
    heapMb: Math.round(((get('JSHeapUsedSize') ?? 0) / 1048576) * 10) / 10,
    nodes: get('Nodes'),
    listeners: get('JSEventListeners'),
    scriptS: Math.round((get('ScriptDuration') ?? 0) * 100) / 100,
    layoutS: Math.round((get('LayoutDuration') ?? 0) * 100) / 100,
  };
}

/** Длинные задачи главного потока — наблюдатель ставится до первой строки страницы. */
const LONG_TASKS = () => {
  window.__hwLong = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__hwLong.push({ at: Math.round(e.startTime), ms: Math.round(e.duration) });
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    window.__hwLong = null;
  }
};
const longSince = async (page, from) =>
  page.evaluate((t) => {
    const list = (window.__hwLong ?? []).filter((e) => e.at >= t);
    return { count: list.length, totalMs: list.reduce((s, e) => s + e.ms, 0), maxMs: list.reduce((m, e) => Math.max(m, e.ms), 0) };
  }, from);
const now = (page) => page.evaluate(() => Math.round(performance.now()));

/* ─────────────────────────  организация  ───────────────────────── */

async function withOrg(label, browser, body, { viewport, projects = [], touch = false, setup = null, production = null, scale = 1 }) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const made = { users: [], orgs: [], projects: [] };
  try {
    const email = `hwm-${stamp}@example.test`;
    const password = `Pw-${stamp}-hwm!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    made.users.push(data.user.id);
    const { data: org, error: orgError } = await service.from('orgs').insert({ slug: `hwm-${stamp}`, name: `Проверка фото фурнитуры ${label}`, ...(production ? { production } : {}) }).select('id').single();
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
    const context = await browser.newContext({ viewport, deviceScaleFactor: scale, ...(touch ? { hasTouch: true, isMobile: false } : {}) });
    await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', sameSite: 'Lax' })));
    await context.addInitScript(LONG_TASKS);
    const page = await context.newPage();
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
    });
    /* Рабочий каталог организации: прайс, материалы (RAL), KIRA, фурнитура. */
    const post = async (path, data, what) => {
      const res = await page.request.post(`${BASE}${path}`, { data, timeout: 180_000 });
      if (!res.ok()) throw new Error(`${what} не загрузились: ${res.status()} · ${(await res.text()).slice(0, 160)}`);
      return res.json().catch(() => ({}));
    };
    await post('/api/catalog/seed-rates', { orgId: org.id }, 'типовой прайс');
    await post('/api/catalog/materials', { orgId: org.id }, 'материалы');
    await post('/api/catalog/kira', { orgId: org.id, confirm: true }, 'модели KIRA');
    const hw = await post('/api/catalog/hardware', { orgId: org.id, confirm: true }, 'фурнитура');
    if (hw.added !== FACT_COUNT) throw new Error(`фурнитура: добавлено ${hw.added} из ${FACT_COUNT}`);
    if (setup) await setup({ service, org });
    const { count: rows } = await service.from('catalog_items').select('id', { count: 'exact', head: true }).eq('org_id', org.id);
    const ids = {};
    for (const p of projects) {
      const { data: project, error: projectError } = await service
        .from('projects')
        .insert({
          org_id: org.id,
          client_name: 'Проверка',
          status: 'in_progress',
          address: `Фото фурнитуры ${label} · ${p.key}`,
          zone: p.zone,
          measurements: p.fx.measurement,
          millwork: { survey: p.fx.survey, requirements: p.fx.requirements, runs: { optimal: p.fx.run }, selectedVariant: 'optimal' },
        })
        .select('id')
        .single();
      if (projectError) throw new Error(`insert project: ${projectError.message}`);
      made.projects.push(project.id);
      ids[p.key] = project.id;
    }
    await body({ service, org, page, context, errors, consoleErrors, ids, rows });
  } finally {
    /*
     * УБОРКА — С ОШИБКАМИ, А НЕ МОЛЧА. Запрос, оборванный по времени на
     * стороне проверки, сервер дописывает сам: импорт фурнитуры однажды не
     * уложился в 180 с, и уборка прошла, пока он ещё писал, — организация с
     * 3208 позициями осталась в базе, а чтение с ошибкой засчитало её как
     * «удалена». Поэтому ошибка удаления называется, уборка повторяется,
     * пока чтение не скажет «пусто», а непрочитанное — это остаток.
     */
    const failures = [];
    const step = async (what, request) => {
      const { error } = await request;
      if (error) failures.push(`${what}: ${error.message}`);
    };
    const leftOf = async (id) => {
      const out = [];
      const org = await service.from('orgs').select('id').eq('id', id);
      if (org.error) out.push(`организация ${id}: не прочиталось — ${org.error.message}`);
      else if (org.data.length) out.push(`организация ${id}`);
      const items = await service.from('catalog_items').select('id').eq('org_id', id).limit(1);
      if (items.error) out.push(`позиции ${id}: не прочиталось — ${items.error.message}`);
      else if (items.data.length) out.push(`позиции ${id}`);
      const files = await storageFiles(service, `${id}/hardware`);
      if (files.length) out.push(`файлов Storage ${files.length}`);
      return out;
    };
    for (const id of made.projects) await step(`объект ${id}`, service.from('projects').delete().eq('id', id));
    for (const id of made.orgs) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        if (attempt > 0) await sleep(10_000);
        /* Файлы Storage организации — по строкам файлов и по папке «hardware»: оборванная загрузка строки не оставляет. */
        const { data: assetRows, error: assetError } = await service.from('catalog_assets').select('storage_path').eq('org_id', id);
        if (assetError) failures.push(`файлы организации: не прочиталось — ${assetError.message}`);
        const paths = new Set((assetRows ?? []).map((r) => r.storage_path));
        for (const p of await storageFiles(service, `${id}/hardware`)) paths.add(p);
        const list = Array.from(paths);
        for (let i = 0; i < list.length; i += 100) await step('файлы Storage', service.storage.from('catalog').remove(list.slice(i, i + 100)));
        await step('позиции', service.from('catalog_items').delete().eq('org_id', id));
        await step('категории', service.from('catalog_categories').delete().eq('org_id', id));
        await step('организация', service.from('orgs').delete().eq('id', id));
        if ((await leftOf(id)).length === 0) break;
      }
    }
    for (const id of made.users) await step(`пользователь ${id}`, service.auth.admin.deleteUser(id));
    const left = [];
    for (const id of made.orgs) left.push(...(await leftOf(id)));
    for (const id of made.projects) {
      const project = await service.from('projects').select('id').eq('id', id);
      if (project.error) left.push(`объект ${id}: не прочиталось — ${project.error.message}`);
      else if (project.data.length) left.push(`объект ${id}`);
    }
    check(
      `${label}: уборка временной организации и её файлов проверена чтением`,
      left.length === 0,
      [...left, ...failures.map((f) => `по дороге: ${f}`)].join(', ') || 'удалено',
    );
  }
}

/** Файлы Storage под папкой — на два уровня (папка позиции → файлы). */
async function storageFiles(service, folder) {
  const out = [];
  const { data: top } = await service.storage.from('catalog').list(folder, { limit: 1000 });
  for (const entry of top ?? []) {
    if (entry.id) {
      out.push(`${folder}/${entry.name}`);
      continue;
    }
    const { data: inner } = await service.storage.from('catalog').list(`${folder}/${entry.name}`, { limit: 1000 });
    for (const file of inner ?? []) if (file.id) out.push(`${folder}/${entry.name}/${file.name}`);
  }
  return out;
}

/** Позиция организации по артикулу каталога. */
async function itemByArticle(service, orgId, article) {
  const { data } = await service.from('catalog_items').select('id, article, price, meta, catalog_assets(id, kind, role, storage_path)').eq('org_id', orgId).eq('article', article).maybeSingle();
  if (!data) throw new Stop(`НУЛЕВОЙ СЕЛЕКТОР: позиции ${article} в каталоге организации нет`);
  return data;
}

/* ═════════════════════════  PERF  ═════════════════════════ */

function netMeter(cdp) {
  const responses = new Map();
  /* Начало запроса картинки фурнитуры — по часам стены; попадание в кэш браузера — не запрос в сеть. */
  let starts = new Map();
  cdp.on('Network.responseReceived', (e) => {
    responses.set(e.requestId, { url: e.response.url, type: e.type });
    const start = starts.get(e.requestId);
    if (start && e.response.fromDiskCache) start.cached = true;
  });
  cdp.on('Network.requestWillBeSent', (e) => {
    if (e.type === 'Image' && e.request.url.includes('/hardware/')) starts.set(e.requestId, { at: e.wallTime * 1000, url: e.request.url, cached: false });
  });
  cdp.on('Network.requestServedFromCache', (e) => {
    const start = starts.get(e.requestId);
    if (start) start.cached = true;
  });
  /* Предзапрос CORS (OPTIONS к другому домену) — не чтение каталога: считается отдельно. */
  let bytes = { catalog: 0, catalogRequests: 0, images: 0, imageRequests: 0, script: 0, total: 0, requests: 0, imageUrls: [], kinds: {} };
  const kindOf = (url) => {
    const u = decodeURIComponent(url);
    if (/id=in\./.test(u)) return 'паспорт по id';
    if (/article=not\.like/.test(u)) return 'компания';
    if (/article=like/.test(u)) return 'производители';
    return 'целиком';
  };
  cdp.on('Network.loadingFinished', (e) => {
    const r = responses.get(e.requestId);
    if (!r) return;
    bytes.total += e.encodedDataLength;
    bytes.requests += 1;
    if (r.url.includes('/rest/v1/catalog_items') && r.type === 'Preflight') {
      bytes.kinds['предзапрос CORS'] = (bytes.kinds['предзапрос CORS'] ?? 0) + 1;
    } else if (r.url.includes('/rest/v1/catalog_items')) {
      bytes.catalog += e.encodedDataLength;
      bytes.catalogRequests += 1;
      const kind = kindOf(r.url);
      bytes.kinds[kind] = (bytes.kinds[kind] ?? 0) + 1;
    } else if (r.type === 'Image') {
      bytes.images += e.encodedDataLength;
      bytes.imageRequests += 1;
      bytes.imageUrls.push(r.url);
    } else if (r.type === 'Script') bytes.script += e.encodedDataLength;
  });
  return {
    reset: () => {
      bytes = { catalog: 0, catalogRequests: 0, images: 0, imageRequests: 0, script: 0, total: 0, requests: 0, imageUrls: [], kinds: {} };
      starts = new Map();
    },
    catalogKinds: () => ({ ...bytes.kinds }),
    /** Запросы картинок в сеть (без попаданий в кэш): время начала по часам стены и адрес. */
    imageStarts: () => Array.from(starts.values()).filter((s) => !s.cached),
    urls: () => bytes.imageUrls.slice(),
    snapshot: () => ({
      catalogKb: Math.round(bytes.catalog / 1024),
      catalogRequests: bytes.catalogRequests,
      imageKb: Math.round(bytes.images / 1024),
      imageRequests: bytes.imageRequests,
      scriptKb: Math.round(bytes.script / 1024),
      totalKb: Math.round(bytes.total / 1024),
      requests: bytes.requests,
    }),
  };
}


async function coldOpen(page, cdp, projectId, net, label) {
  net.reset();
  const nav0 = Date.now();
  await page.goto(`${BASE}/project/${projectId}/room`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForSelector('[data-studio-root]', { timeout: 180_000 });
  const studioMs = Date.now() - nav0;
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-studio-rail] [data-studio-tool]');
    return Boolean(el && Object.keys(el).some((k) => k.startsWith('__reactProps')));
  }, undefined, { timeout: 180_000 });
  const hydratedMs = Date.now() - nav0;
  await tool(page, 'furniture');
  must(`${label} вид «3D»`, await view(page, '3d'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-view="3d"]');
  const scene = await sceneSettled(page);
  must(`${label} 3D готова`, scene.state === 'ready', `${scene.state} за ${scene.ms} мс`);
  const sceneMs = Date.now() - nav0;
  /* Человек сразу идёт в «Фурнитуру»: модуль → инструмент → панель видит каталог. */
  must(`${label} инструмент «Выбор»`, await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="select"]');
  await page.locator('[data-object-module="base-3300@w1"]').first().click();
  await sleep(200);
  const click0 = Date.now();
  must(`${label} инструмент «Фурнитура»`, await tool(page, 'hardware'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="hardware"]');
  const items = await waitFor(page, () => Number(document.querySelector('[data-hw-panel]')?.getAttribute('data-hw-items') ?? 0), (n) => n >= 1, 180_000);
  const panelReadyMs = Date.now() - nav0;
  const panelWaitMs = Date.now() - click0;
  must(`${label} панель видит каталог`, items >= FACT_COUNT, `позиций ${items}`);
  /* Всё, что успело прийти после готовности панели (сцена, превью), — в счёт до покоя. */
  await sleep(1500);
  const s0 = Date.now();
  await page.locator('[data-hw-slot="slide"]').first().click();
  const rowsInDom = await waitFor(page, () => document.querySelectorAll('[data-hw-item]').length, (n) => n > 0, 60_000);
  const slotMs = Date.now() - s0;
  return {
    studioMs,
    hydratedMs,
    sceneMs,
    panelReadyMs,
    panelWaitMs,
    slotMs,
    candidates: await count(page),
    rowsInDom,
    /* Длинные задачи от перехода до места с открытым списком — вся работа главного потока за это время. */
    long: await longSince(page, 0),
    ...net.snapshot(),
    catalogQueries: net.catalogKinds(),
    ...(await metrics(cdp)),
  };
}

async function partPerf(browser) {
  console.log(`\n── PERF (${LABEL}): рабочий каталог организации — от перехода до «Фурнитуры» со списком места, прокрутка, покой, повтор, CPU ×4`);
  const fx = fixture('kitchen');
  await withOrg(
    'PERF',
    browser,
    async ({ page, context, errors, ids, rows }) => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      await cdp.send('Network.enable');
      const net = netMeter(cdp);
      const result = { label: LABEL, build: buildId(), catalogRows: rows, facts: FACT_COUNT };

      /* 1. Холодное открытие: от перехода до панели со списком места. */
      result.open = await coldOpen(page, cdp, ids.kitchen, net, 'PERF');
      await page.screenshot({ path: `${OUT}/perf-${LABEL}-panel.png`, timeout: 120_000 });

      /* 2. Быстрая прокрутка списка: вниз и вверх по 30 шагов. */
      const t2 = await now(page);
      const framesScroll0 = await page.evaluate(() => (window.__mwCadFrames ? window.__mwCadFrames() : null));
      const fast = await scrollList(page, { steps: 30, factor: 0.9, dirs: [1, -1], waitMs: 40 });
      must('PERF список места прокручивается', fast !== null, 'НУЛЕВОЙ СЕЛЕКТОР: [data-hw-list]');
      const maxRows = fast.maxRows;
      await sleep(500);
      const framesScroll1 = await page.evaluate(() => (window.__mwCadFrames ? window.__mwCadFrames() : null));
      result.scroll = { long: await longSince(page, t2), maxRowsInDom: maxRows, sceneFrames: framesScroll1 - framesScroll0 };

      /* 3. Покой с открытой панелью: 5 с. */
      const idle0 = await page.evaluate(() => (window.__mwCadFrames ? window.__mwCadFrames() : null));
      const t3 = await now(page);
      await sleep(5000);
      const idle1 = await page.evaluate(() => (window.__mwCadFrames ? window.__mwCadFrames() : null));
      result.idle = { sceneFrames5s: idle1 - idle0, long: await longSince(page, t3) };

      /* 4. Повторное открытие панели: закрыть «Фурнитуру», открыть снова — каталог уже в сторе. */
      await tool(page, 'select');
      net.reset();
      const r0 = Date.now();
      await tool(page, 'hardware');
      await waitFor(page, () => Number(document.querySelector('[data-hw-panel]')?.getAttribute('data-hw-items') ?? 0), (n) => n >= 1, 60_000);
      result.reopen = { ms: Date.now() - r0, ...net.snapshot() };

      /* 5. Слабый ноутбук: процессор ×4 — то же холодное открытие. */
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      result.slow = { cpu: 4, ...(await coldOpen(page, cdp, ids.kitchen, net, 'PERF ×4')) };
      const tss = await now(page);
      await scrollList(page, { steps: 20, factor: 0.9, waitMs: 40 });
      result.slow.scrollLong = await longSince(page, tss);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

      result.errors = errors.length;
      mkdirSync(OUT, { recursive: true });
      writeFileSync(`${OUT}/perf-${LABEL}.json`, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
      check(`PERF числа записаны: ${OUT}/perf-${LABEL}.json`, true);
      check('PERF ошибок страницы нет', errors.length === 0, errors.slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 }, projects: [{ key: 'kitchen', zone: 'Кухня', fx }] },
  );
}

/* ═════════════════════════  TRACE  ═════════════════════════ */

/**
 * ОТКУДА ЗАПРОСЫ КАТАЛОГА — время от перехода и место в коде (стек
 * инициатора CDP: чанк, строка, столбец). Диагностика: число чтений
 * каталога при открытии Studio меряется, а не угадывается.
 */
async function partTrace(browser) {
  console.log('\n── TRACE: запросы каталога при открытии Studio — когда и из какого места кода');
  const fx = fixture('kitchen');
  await withOrg(
    'TRACE',
    browser,
    async ({ page, context, ids }) => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      const t0 = { wall: 0 };
      const sent = [];
      cdp.on('Network.requestWillBeSent', (e) => {
        if (!e.request.url.includes('/rest/v1/catalog_items')) return;
        const frames = [];
        for (let s = e.initiator?.stack; s && frames.length < 6; s = s.parent) {
          for (const f of s.callFrames ?? []) {
            if (frames.length >= 6) break;
            frames.push(`${f.functionName || '?'}@${f.url.split('/').pop()}:${f.lineNumber}:${f.columnNumber}`);
          }
        }
        const url = decodeURIComponent(e.request.url);
        sent.push({
          atMs: Math.round(e.wallTime * 1000 - t0.wall),
          method: e.request.method,
          type: e.type,
          kind: /id=in\./.test(url) ? 'паспорт по id' : /article=not\.like/.test(url) ? 'компания' : /article=like/.test(url) ? 'производители' : 'целиком',
          range: e.request.headers?.Range ?? e.request.headers?.range ?? null,
          frames,
        });
      });
      const marks = {};
      t0.wall = Date.now();
      await page.goto(`${BASE}/project/${ids.kitchen}/room`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
      await page.waitForSelector('[data-studio-root]', { timeout: 180_000 });
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-studio-rail] [data-studio-tool]');
        return Boolean(el && Object.keys(el).some((k) => k.startsWith('__reactProps')));
      }, undefined, { timeout: 180_000 });
      marks.hydrated = Date.now() - t0.wall;
      await tool(page, 'furniture');
      marks.furniture = Date.now() - t0.wall;
      await view(page, '3d');
      await sceneSettled(page);
      marks.scene = Date.now() - t0.wall;
      await tool(page, 'select');
      marks.select = Date.now() - t0.wall;
      await page.locator('[data-object-module="base-3300@w1"]').first().click();
      await tool(page, 'hardware');
      marks.hardware = Date.now() - t0.wall;
      await waitFor(page, () => Number(document.querySelector('[data-hw-panel]')?.getAttribute('data-hw-items') ?? 0), (n) => n >= FACT_COUNT, 180_000);
      marks.panel = Date.now() - t0.wall;
      await sleep(3000);
      const result = { build: buildId(), marks, requests: sent };
      writeFileSync(`${OUT}/trace-${LABEL}.json`, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
      check(`TRACE запросы каталога записаны: ${sent.length}`, sent.length > 0, 'ни одного запроса каталога — замер не дошёл');
    },
    { viewport: { width: 1440, height: 900 }, projects: [{ key: 'kitchen', zone: 'Кухня', fx }] },
  );
}

/* ═════════════════════════  PROFILE  ═════════════════════════ */

/**
 * ГДЕ ВРЕМЯ НА ПРОКРУТКЕ СПИСКА — профиль процессора CDP при замедлении ×4:
 * панель с местом «направляющие», 20 шагов прокрутки по 0.9 экрана. Сводка
 * собственного времени по функциям (чанк:строка) и доля React — чтобы
 * причину называть числом, а не догадкой.
 */
async function partProfile(browser) {
  console.log('\n── PROFILE: профиль процессора на прокрутке списка места при ×4');
  const fx = fixture('kitchen');
  await withOrg(
    'PROFILE',
    browser,
    async ({ page, context, ids }) => {
      const cdp = await context.newCDPSession(page);
      await openStudio(page, ids.kitchen);
      await open3d(page, 'PROFILE');
      must('PROFILE инструмент «Выбор»', await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР');
      await page.locator('[data-object-module="base-3300@w1"]').first().click();
      await sleep(300);
      await tool(page, 'hardware');
      await waitFor(page, () => Number(document.querySelector('[data-hw-panel]')?.getAttribute('data-hw-items') ?? 0), (n) => n >= FACT_COUNT, 180_000);
      await page.locator('[data-hw-slot="slide"]').first().click();
      await waitFor(page, () => document.querySelectorAll('[data-hw-item]').length, (n) => n > 0, 60_000);
      await sleep(2000);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const t0 = await now(page);
      await cdp.send('Profiler.start');
      await scrollList(page, { steps: 20, factor: 0.9, waitMs: 40 });
      const { profile } = await cdp.send('Profiler.stop');
      const long = await longSince(page, t0);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const { busyMs, top } = profileTop(profile, 25);
      const result = { build: buildId(), busyMs, long, top };
      writeFileSync(`${OUT}/profile-${LABEL}.json`, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
      check(`PROFILE профиль записан: занято ${busyMs} мс`, profile.samples.length > 0, 'выборок нет');
    },
    { viewport: { width: 1440, height: 900 }, projects: [{ key: 'kitchen', zone: 'Кухня', fx }] },
  );
}

/** Собственное время по функциям профиля CDP: число выборок узла × средний шаг; простой и «программа» — не работа. */
function profileTop(profile, limit) {
  const dt = profile.timeDeltas.reduce((s, d) => s + d, 0) / Math.max(1, profile.timeDeltas.length) / 1000;
  const hits = new Map();
  for (const id of profile.samples) hits.set(id, (hits.get(id) ?? 0) + 1);
  const byFn = new Map();
  let total = 0;
  for (const node of profile.nodes) {
    const n = hits.get(node.id) ?? 0;
    if (!n) continue;
    const f = node.callFrame;
    const key = `${f.functionName || '(анонимная)'} @${(f.url || f.codeType || '').split('/').pop()}:${f.lineNumber}:${f.columnNumber}`;
    byFn.set(key, (byFn.get(key) ?? 0) + n * dt);
    if (!['(idle)', '(program)'].includes(f.functionName)) total += n * dt;
  }
  const top = Array.from(byFn.entries())
    .filter(([key]) => !key.startsWith('(idle)') && !key.startsWith('(program)'))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, ms]) => ({ fn: key, ms: Math.round(ms) }));
  return { busyMs: Math.round(total), top };
}

/* ═════════════════════════  SLOT  ═════════════════════════ */

/**
 * НАЖАТИЕ МЕСТА — ОДНИМ ЗАМЕРОМ ВНУТРИ СТРАНИЦЫ: от нажатия до первого кадра
 * после него (обработчик и отрисовка React идут в той же задаче, что
 * нажатие) и длинные задачи окна после него — то, что доделывается следом.
 * Замер в обеих сборках одинаков: `[data-hw-slot]` с `aria-pressed` и
 * строки `[data-hw-item]` есть и там, и там.
 */
const switchSlot = (page, slot, windowMs) =>
  page.evaluate(
    async ({ slot, windowMs }) => {
      const button = document.querySelector(`[data-hw-slot="${slot}"]`);
      if (!button) return null;
      const long = [];
      const observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) long.push([e.startTime, e.duration]);
      });
      observer.observe({ type: 'longtask' });
      const t0 = performance.now();
      button.click();
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      const frameMs = performance.now() - t0;
      await new Promise((r) => setTimeout(r, windowMs));
      observer.disconnect();
      /* Задача нажатия началась раньше t0 — в счёт идёт только её часть после нажатия. */
      const mine = long.filter(([s, d]) => s + d > t0);
      return {
        frameMs: Math.round(frameMs),
        busyMs: Math.round(mine.reduce((sum, [s, d]) => sum + d - Math.max(0, t0 - s), 0)),
        doneMs: Math.round(Math.max(frameMs, ...mine.map(([s, d]) => s + d - t0))),
        pressed: button.getAttribute('aria-pressed') === 'true',
        rows: document.querySelectorAll('[data-hw-item]').length,
      };
    },
    { slot, windowMs },
  );

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length === 0 ? null : s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * СМЕНА МЕСТА ПРИ ×4. В холодном открытии список места мерился одним
 * нажатием через 1.5 с после готовности панели — с разбросом 110…2929 мс
 * в одной и той же сборке: в эти секунды дорабатывает остальное. Здесь
 * первое нажатие идёт так же, затем — 10 смен места в покое, и у обоих
 * отрезков свой профиль процессора: чем занят поток, называется функцией.
 */
async function partSlot(browser) {
  console.log(`\n── SLOT (${LABEL}): смена места модуля при ×4 — первое нажатие и 10 смен в покое`);
  const fx = fixture('kitchen');
  await withOrg(
    'SLOT',
    browser,
    async ({ page, context, errors, ids }) => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await openStudio(page, ids.kitchen);
      await open3d(page, 'SLOT');
      must('SLOT инструмент «Выбор»', await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="select"]');
      await page.locator('[data-object-module="base-3300@w1"]').first().click();
      await sleep(200);
      must('SLOT инструмент «Фурнитура»', await tool(page, 'hardware'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="hardware"]');
      const items = await waitFor(page, () => Number(document.querySelector('[data-hw-panel]')?.getAttribute('data-hw-items') ?? 0), (n) => n >= 1, 180_000);
      must('SLOT панель видит каталог', items >= FACT_COUNT, `позиций ${items}`);
      const places = await page.evaluate(() => Array.from(new Set(Array.from(document.querySelectorAll('[data-hw-slot]')).map((b) => b.getAttribute('data-hw-slot')))));
      const other = places.find((p) => p !== 'slide');
      must('SLOT у модуля места «направляющие» и ещё одно', places.includes('slide') && Boolean(other), `места ${JSON.stringify(places)}`);

      /* 1. Как в холодном открытии: 1.5 с после готовности панели. */
      await sleep(1500);
      await cdp.send('Profiler.start');
      const first = await switchSlot(page, 'slide', 3000);
      const firstProfile = profileTop((await cdp.send('Profiler.stop')).profile, 12);
      must('SLOT первое нажатие: место выбрано, список на экране', Boolean(first?.pressed && first.rows > 0), JSON.stringify(first));

      /* 2. В покое: 10 смен места по очереди. */
      await sleep(3000);
      const runs = [];
      await cdp.send('Profiler.start');
      for (let i = 0; i < 10; i += 1) runs.push(await switchSlot(page, i % 2 ? 'slide' : other, 1500));
      const steadyProfile = profileTop((await cdp.send('Profiler.stop')).profile, 12);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      check(
        'SLOT 10 смен места: каждое нажатие выбрало место, список на экране',
        runs.length === 10 && runs.every((r) => r?.pressed && r.rows > 0),
        JSON.stringify(runs.filter((r) => !(r?.pressed && r.rows > 0))),
      );
      const steady = {
        frameMs: median(runs.map((r) => r.frameMs)),
        busyMs: median(runs.map((r) => r.busyMs)),
        doneMs: median(runs.map((r) => r.doneMs)),
        frameRange: [Math.min(...runs.map((r) => r.frameMs)), Math.max(...runs.map((r) => r.frameMs))],
      };
      const result = { label: LABEL, build: buildId(), cpu: 4, places: ['slide', other], first, firstProfile, steady, runs, steadyProfile, errors: errors.length };
      mkdirSync(OUT, { recursive: true });
      writeFileSync(`${OUT}/slot-${LABEL}.json`, JSON.stringify(result, null, 2));
      console.log(JSON.stringify({ first, firstBusy: firstProfile.busyMs, firstTop: firstProfile.top.slice(0, 8), steady, steadyBusy: steadyProfile.busyMs, steadyTop: steadyProfile.top.slice(0, 8) }, null, 2));
      check(`SLOT числа записаны: ${OUT}/slot-${LABEL}.json`, true);
      check('SLOT ошибок страницы нет', errors.length === 0, errors.slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 }, projects: [{ key: 'kitchen', zone: 'Кухня', fx }] },
  );
}

/* ═════════════════════════  READ  ═════════════════════════ */

async function partRead(browser) {
  console.log('\n── READ: лёгкое чтение каталога настоящим PostgREST — те же значения, те же ставки, паспорт целиком');
  await withOrg(
    'READ',
    browser,
    async ({ org, rows }) => {
      const out = execSync(`npx tsx scripts/hardware-light-read.ts ${org.id}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
      const r = JSON.parse(out.trim().split(/\r?\n/).pop());
      check(
        'READ1 строк столько же: позиций производителей 1199, все с пометкой «light»; позиции компании — те же строки целиком',
        r.rows.full === rows && r.rows.light === rows && r.rows.makers === FACT_COUNT && r.rows.lightMarked === FACT_COUNT && r.ownDiffCount === 0,
        `${JSON.stringify(r.rows)} · у компании разошлось ${r.ownDiffCount} ${r.ownDiff.join(', ')}`,
      );
      check(
        'READ2 PostgREST отдал пути meta->hardware ровно значениями строки: запись изделия = поля полной строки, изображения, файлы, цена и название те же',
        r.mismatchedCount === 0,
        r.mismatchedCount ? r.mismatched.join(' | ') : `1199 из 1199`,
      );
      check('READ3 ставки сметы при лёгком и полном чтении одни и те же', r.ratesEqual && r.rates > 0, `ставок ${r.rates}`);
      check('READ4 паспорт позиции (fetchCatalogDetails) — строка целиком, без пометки «light»', r.detailsOk === true);
      check('READ5 лёгкое чтение меньше полного', r.kb.light < r.kb.full, `${r.kb.full} → ${r.kb.light} кБ JSON · ${r.ms.full} → ${r.ms.light} мс`);
      writeFileSync(`${OUT}/read.json`, JSON.stringify(r, null, 2));
    },
    { viewport: { width: 1280, height: 800 } },
  );
}

/* ═════════════════════════  MEDIA  ═════════════════════════ */

const OWN_TWIN = { article: 'OWN-805-TWIN', manufacturerArticle: '805 11 354' };

async function partMedia(browser) {
  console.log('\n── MEDIA (1440 × 900): фото фурнитуры в каталоге и в Studio — привязка по артикулу, права, пакет, 404, карточка, установка');
  const fx = fixture('kitchen');
  await withOrg(
    'MEDIA',
    browser,
    async ({ service, org, page, errors, consoleErrors, ids }) => {
      const hafele = await itemByArticle(service, org.id, 'MFR-HAFELE-805.11.354');
      const blum = await itemByArticle(service, org.id, 'MFR-BLUM-71B3550');
      const hettich = await itemByArticle(service, org.id, 'MFR-HETTICH-9114276');
      const twin = await itemByArticle(service, org.id, OWN_TWIN.article);
      const pngA = await testImage('805.11.354 A', '#3a6ea5');
      const pngB = await testImage('805.11.354 B', '#6a3aa5');
      const pngC = await testImage('71B3550 серия', '#2f7d4b');
      const pngD = await testImage('9 114 276', '#9a5b1e');

      /* ── Каталог: «Фото фурнитуры» ── */
      await page.goto(`${BASE}/admin/catalog`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForSelector('[data-admin-hardware-media]', { timeout: 120_000 });
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-admin-hardware-media]');
        return Boolean(el && Object.keys(el).some((k) => k.startsWith('__reactProps')));
      }, undefined, { timeout: 60_000 });
      await page.locator('[data-admin-hardware-media]').click();
      await page.waitForSelector('[data-admin-media-coverage]', { timeout: 30_000 });
      const coverage = () =>
        page.evaluate(() =>
          Object.fromEntries(
            Array.from(document.querySelectorAll('[data-admin-media-row]')).map((row) => [
              row.getAttribute('data-admin-media-row'),
              ['total', 'exact', 'series', 'none', 'rights'].map((k) => Number(row.getAttribute(`data-${k}`) ?? NaN)),
            ]),
          ),
        );
      const c0 = await coverage();
      check(
        'MEDIA1 счётчики: Blum 318, Hettich 290, Häfele 591 — точных 0, серии 0, «нет фото» = всего; BOYARD 0 позиций',
        JSON.stringify(c0.Blum) === JSON.stringify([318, 0, 0, 318, 0]) &&
          JSON.stringify(c0.Hettich) === JSON.stringify([290, 0, 0, 290, 0]) &&
          JSON.stringify(c0['Häfele']) === JSON.stringify([591, 0, 0, 591, 0]) &&
          JSON.stringify(c0.BOYARD) === JSON.stringify([0, 0, 0, 0, 0]),
        JSON.stringify(c0),
      );

      const pick = async (query, article) => {
        await page.locator('[data-admin-media-search]').fill(query);
        await sleep(300);
        const row = page.locator(`[data-admin-media-item="${article}"]`);
        must(`MEDIA позиция ${article} находится по «${query}»`, (await row.count()) > 0, `НУЛЕВОЙ СЕЛЕКТОР: [data-admin-media-item="${article}"]`);
        await row.first().click();
        await page.waitForSelector(`[data-admin-media-picked="${article}"]`, { timeout: 10_000 });
      };
      await pick('805.11.354', 'MFR-HAFELE-805.11.354');
      const found805 = await page.evaluate(() => Number(document.querySelector('[data-admin-media-found]')?.getAttribute('data-admin-media-found') ?? -1));
      check(
        'MEDIA2 поиск по артикулу: «805.11.354» находит позицию Häfele и свою позицию с тем же артикулом без точек; у 805.11.354 — «Фото изделия пока отсутствует»',
        found805 === 2 && (await page.locator('[data-admin-media-empty]').count()) === 1,
        `найдено ${found805}`,
      );

      /* Права: экран не отправляет файл без подтверждения, сервер отказывает словами. */
      const sendDisabled = await page.locator('[data-admin-media-send]').isDisabled();
      const denied = await page.request.post(`${BASE}/api/catalog/hardware/media`, {
        multipart: { itemId: hafele.id, kind: 'EXACT_PRODUCT', rights: 'NOT_VERIFIED', rightsNote: 'не знаем', file: { name: '805.11.354.png', mimeType: 'image/png', buffer: pngA } },
      });
      const deniedWords = (await denied.json().catch(() => ({}))).error ?? '';
      const afterDenied = await itemByArticle(service, org.id, 'MFR-HAFELE-805.11.354');
      check(
        'MEDIA3 файл без подтверждённых прав: кнопка закрыта; сервер — 400 словами; ни строки файла, ни записи в позиции',
        sendDisabled && denied.status() === 400 && /не загружается/.test(deniedWords) && (afterDenied.catalog_assets ?? []).length === 0 && !afterDenied.meta?.media,
        `кнопка ${sendDisabled ? 'закрыта' : 'ОТКРЫТА'} · ${denied.status()} «${deniedWords.slice(0, 90)}»`,
      );

      /* Своё фото: точное, затем второй ракурс. */
      const upload = async (name, buffer, kind, caption) => {
        await page.locator('[data-admin-media-file]').setInputFiles({ name, mimeType: 'image/png', buffer });
        await page.locator('[data-admin-media-kind]').selectOption(kind);
        const box = page.locator('[data-admin-media-rights-ok]');
        if (!(await box.isChecked())) await box.check();
        await page.locator('[data-admin-media-note]').fill('тестовое изображение проверки — своё');
        if (caption) await page.locator('input[placeholder^="Ракурс"]').fill(caption);
        await page.locator('[data-admin-media-send]').click();
        return waitFor(page, () => document.querySelector('[data-admin-media-words]')?.textContent ?? '', (t) => /привязано|Не загрузилось/.test(t), 60_000);
      };
      const w1 = await upload('805.11.354.png', pngA, 'EXACT_PRODUCT', 'спереди');
      const w2 = await upload('805.11.354_2.png', pngB, 'EXACT_PRODUCT', 'сбоку');
      const h1 = await itemByArticle(service, org.id, 'MFR-HAFELE-805.11.354');
      const roles = (h1.catalog_assets ?? []).map((a) => `${a.role}:${a.kind}`).sort();
      const inFolder = (h1.catalog_assets ?? []).every((a) => a.storage_path.startsWith(`${org.id}/hardware/${hafele.id}/`));
      const stored = await storageFiles(service, `${org.id}/hardware`);
      check(
        'MEDIA4 своё фото и второй ракурс: строки файлов hw-1 и hw-2 (оригинал и миниатюра) в папке позиции, в Storage 4 файла, первое — главное',
        /привязано/.test(w1) &&
          /привязано/.test(w2) &&
          JSON.stringify(roles) === JSON.stringify(['hw-1:photo', 'hw-1:swatch', 'hw-2:photo', 'hw-2:swatch']) &&
          inFolder &&
          stored.length === 4 &&
          h1.meta?.media?.length === 2 &&
          h1.meta.media[0].primary === true &&
          h1.meta.media.every((m) => m.rights === 'VERIFIED' && m.rightsNote),
        `${w1} · ${w2} · ${roles.join(', ')} · Storage ${stored.length}`,
      );
      const thumbs = await sharp(Buffer.from(await (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/catalog/${(h1.catalog_assets ?? []).find((a) => a.role === 'hw-1' && a.kind === 'swatch').storage_path}`)).arrayBuffer())).metadata();
      check(
        'MEDIA5 миниатюра без обрезки: 900 × 600 → 320 × 213 (пропорции те же), WebP',
        thumbs.width === 320 && thumbs.height === 213 && thumbs.format === 'webp',
        `${thumbs.width} × ${thumbs.height} ${thumbs.format}`,
      );

      /* Фото серии у петли и ссылка без файла у направляющей. */
      await pick('71B3550', 'MFR-BLUM-71B3550');
      const w3 = await upload('71B3550-series.png', pngC, 'SERIES_REFERENCE', '');
      await pick('9 114 276', 'MFR-HETTICH-9114276');
      await page.locator('[data-admin-media-link-url]').fill('https://example.test/hettich/9114276');
      await page.locator('[data-admin-media-link-send]').click();
      await waitFor(page, () => document.querySelectorAll('[data-admin-media-entry]').length, (n) => n === 1, 20_000);
      const c1 = await coverage();
      check(
        'MEDIA6 счётчики сдвинулись ровно на свои строки: Häfele точных 1, Blum серии 1, Hettich «права не проверены» 1 (ссылка — не фото)',
        /привязано/.test(w3) &&
          JSON.stringify(c1['Häfele']) === JSON.stringify([591, 1, 0, 590, 0]) &&
          JSON.stringify(c1.Blum) === JSON.stringify([318, 0, 1, 317, 0]) &&
          JSON.stringify(c1.Hettich) === JSON.stringify([290, 0, 0, 290, 1]),
        JSON.stringify({ Häfele: c1['Häfele'], Blum: c1.Blum, Hettich: c1.Hettich }),
      );

      /* Пакет: точное — привязка, неоднозначное и ненайденное — нет. */
      await page.locator('[data-admin-media-batch-files]').setInputFiles([
        { name: '9 114 276.png', mimeType: 'image/png', buffer: pngD },
        { name: '805.11.354_3.png', mimeType: 'image/png', buffer: pngA },
        { name: '805.11.35.png', mimeType: 'image/png', buffer: pngA },
      ]);
      const plan = await page.evaluate(() => {
        const p = document.querySelector('[data-admin-media-batch-plan]');
        return {
          matched: Number(p?.getAttribute('data-matched') ?? -1),
          ambiguous: Number(p?.getAttribute('data-ambiguous') ?? -1),
          unmatched: Number(p?.getAttribute('data-unmatched') ?? -1),
          states: Object.fromEntries(Array.from(document.querySelectorAll('[data-admin-media-batch-file]')).map((li) => [li.getAttribute('data-admin-media-batch-file'), li.getAttribute('data-state')])),
          locked: document.querySelector('[data-admin-media-batch-send]')?.hasAttribute('disabled') ?? null,
        };
      });
      await page.locator('[data-admin-media-batch-rights-ok]').check();
      await page.locator('[data-admin-media-batch-note]').fill('тестовые изображения проверки — свои');
      await page.locator('[data-admin-media-batch-send]').click();
      const progress = await waitFor(
        page,
        () => {
          const p = document.querySelector('[data-admin-media-batch-progress]');
          return p ? { done: Number(p.getAttribute('data-done')), failed: Number(p.getAttribute('data-failed')) } : null;
        },
        (v) => v && v.done === 1,
        60_000,
      );
      const het = await itemByArticle(service, org.id, 'MFR-HETTICH-9114276');
      const twinAfter = await itemByArticle(service, org.id, OWN_TWIN.article);
      const hafAfter = await itemByArticle(service, org.id, 'MFR-HAFELE-805.11.354');
      check(
        'MEDIA7 пакет: «9 114 276» — привязан к Hettich; «805.11.354_3» — неоднозначно (Häfele и своя позиция), не загружен; «805.11.35» — не найдено; без подтверждения прав кнопка закрыта',
        plan.matched === 1 &&
          plan.ambiguous === 1 &&
          plan.unmatched === 1 &&
          plan.states['805.11.354_3.png'] === 'ambiguous' &&
          plan.locked === true &&
          progress?.failed === 0 &&
          (het.catalog_assets ?? []).length === 2 &&
          (twinAfter.catalog_assets ?? []).length === 0 &&
          (hafAfter.catalog_assets ?? []).length === 4,
        `${JSON.stringify(plan.states)} · ${JSON.stringify(progress)} · Hettich файлов ${(het.catalog_assets ?? []).length} · своя ${(twinAfter.catalog_assets ?? []).length} · Häfele ${(hafAfter.catalog_assets ?? []).length}`,
      );

      /* Права сняты с второго ракурса — файл уходит; «Снять привязку» у фото серии — позиция цела. */
      await pick('805.11.354', 'MFR-HAFELE-805.11.354');
      await page.locator('[data-admin-media-rights="hw-2"]').selectOption('NOT_VERIFIED');
      await waitFor(page, () => document.querySelectorAll('[data-admin-media-entry]').length, (n) => n === 1, 20_000);
      const hafDown = await itemByArticle(service, org.id, 'MFR-HAFELE-805.11.354');
      const filesDown = await storageFiles(service, `${org.id}/hardware/${hafele.id}`.replace(/\/[^/]+$/, ''));
      await pick('71B3550', 'MFR-BLUM-71B3550');
      await page.locator('[data-admin-media-remove="hw-1"]').click();
      await waitFor(page, () => document.querySelectorAll('[data-admin-media-empty]').length, (n) => n === 1, 20_000);
      const blumAfter = await itemByArticle(service, org.id, 'MFR-BLUM-71B3550');
      check(
        'MEDIA8 права сняты с ракурса без ссылки — файл удалён из Storage и строк, запись ушла; «Снять привязку» — у позиции 0 файлов, сама позиция и цена на месте',
        (hafDown.catalog_assets ?? []).map((a) => a.role).sort().join() === 'hw-1,hw-1' &&
          hafDown.meta.media.length === 1 &&
          filesDown.filter((p) => p.includes(`/${hafele.id}/hw-2`)).length === 0 &&
          (blumAfter.catalog_assets ?? []).length === 0 &&
          !blumAfter.meta?.media &&
          blumAfter.price === blum.price,
        `Häfele ${(hafDown.catalog_assets ?? []).map((a) => a.role).join()} · Blum файлов ${(blumAfter.catalog_assets ?? []).length}`,
      );
      await page.screenshot({ path: `${OUT}/media-admin.png`, fullPage: false, timeout: 120_000 });

      /*
       * 404: строка миниатюры 9 114 276 указывает на файл, которого в Storage
       * нет. Не удаление показанного файла: админка уже загрузила его, и на год
       * (`cacheControl`) он лежит в кэше браузера — Studio взяла бы его оттуда.
       */
      const hetThumb = (het.catalog_assets ?? []).find((a) => a.kind === 'swatch');
      const missingPath = hetThumb.storage_path.replace(/hw-1-thumb-\d+\.webp$/, 'hw-1-thumb-missing.webp');
      const { error: pathError } = await service.from('catalog_assets').update({ storage_path: missingPath }).eq('id', hetThumb.id);
      must('MEDIA строка миниатюры указывает на файл, которого нет', !pathError && missingPath !== hetThumb.storage_path, pathError?.message ?? 'путь не поменялся');

      /* ── Studio ── */
      await openStudio(page, ids.kitchen);
      await open3d(page, 'MEDIA');
      await page.evaluate(() => {
        const canvas = document.querySelector('[data-studio-viewport] canvas');
        if (canvas) canvas.__hwMark = 'тот же';
      });
      await hardwareBrowse(page, 'MEDIA');
      await page.locator('[data-hw-brand="BOYARD"]').click();
      await sleep(300);
      const boyard = { count: await count(page), words: await page.evaluate(() => document.querySelector('[data-hw-count]')?.textContent ?? '') };
      await page.locator('[data-hw-brand="Häfele"]').click();
      await page.locator('[data-hw-group="wardrobe"]').click();
      await sleep(300);
      const scope = await page.evaluate(() => ({ text: document.querySelector('[data-hw-count]')?.textContent ?? '', scope: document.querySelector('[data-hw-count]')?.getAttribute('data-hw-scope') ?? '' }));
      const wardrobeHafele = FACTS.filter((f) => f.hardware.manufacturer === 'Häfele' && WARDROBE.has(f.hardware.category)).length;
      check(
        `MEDIA9 фильтры: BOYARD — 0 позиций и сказано, что каталога нет; «Häfele · Гардероб» — ${wardrobeHafele} позиций, как в фактах`,
        boyard.count === 0 && /каталога этого производителя в организации нет/.test(boyard.words) && scope.scope === 'Häfele · Гардероб' && (await count(page)) === wardrobeHafele && scope.text.includes(`${wardrobeHafele} позици`),
        `BOYARD «${boyard.words}» · «${scope.text}»`,
      );

      await page.locator('[data-hw-brand="all"]').click();
      await page.locator('[data-hw-group="all"]').click();
      await page.locator('[data-hw-filter="photo"]').click();
      await sleep(400);
      const withPhoto = await count(page);
      await waitFor(page, () => Array.from(document.querySelectorAll('[data-hw-photo]')).map((n) => n.getAttribute('data-hw-photo')), (s) => s.length >= 2 && s.every((v) => v === 'ready' || v === 'error'), 20_000);
      const rows1 = await rowPhotos(page);
      const r805 = rows1.find((r) => r.id === hafele.id);
      const r9114 = rows1.find((r) => r.id === hettich.id);
      check(
        'MEDIA10 «Есть реальное фото»: 2 позиции (805.11.354 и 9 114 276); у 805.11.354 картинка своя; чужих картинок в строках 0',
        withPhoto === 2 && r805?.state === 'ready' && r805.of === hafele.id && foreign(rows1).length === 0,
        `позиций ${withPhoto} · ${JSON.stringify(rows1.map((r) => [r.id === hafele.id ? '805' : r.id === hettich.id ? '9114' : r.id, r.state]))}`,
      );
      check(
        'MEDIA11 404: миниатюры нет в Storage — «фото не загрузилось» словами, битой картинки на экране нет',
        r9114?.state === 'error' && rows1.every((r) => !r.broken) && (await page.locator(`[data-hw-item-id="${hettich.id}"]`).innerText()).includes('фото не загрузилось'),
        JSON.stringify(r9114),
      );
      await page.screenshot({ path: `${OUT}/media-list.png`, timeout: 120_000 });

      /* Карточка 805.11.354: фото товара, 3D-превью, чертёж. */
      await page.locator(`[data-hw-item-id="${hafele.id}"]`).click();
      await page.waitForSelector('[data-hw-card="MFR-HAFELE-805.11.354"]', { timeout: 10_000 });
      await waitFor(page, () => document.querySelector('[data-hw-card]')?.getAttribute('data-hw-detail'), (v) => v === 'ready' || v === 'error', 20_000);
      const card805 = await page.evaluate(() => {
        const card = document.querySelector('[data-hw-card]');
        const img = card?.querySelector('[data-hw-detail-photo]');
        return {
          detail: card?.getAttribute('data-hw-detail'),
          src: img?.getAttribute('src') ?? null,
          label: card?.querySelector('[data-hw-photo-label]')?.getAttribute('data-hw-photo-label') ?? null,
          labelText: card?.querySelector('[data-hw-photo-label]')?.textContent ?? '',
          angles: card?.querySelector('[data-hw-angles]') ? Number(card.querySelector('[data-hw-angles]').getAttribute('data-hw-angles')) : 0,
          article: card?.querySelector('[data-hw-detail-article]')?.textContent ?? '',
          source: card?.querySelector('[data-hw-source]')?.textContent ?? '',
        };
      });
      await page.screenshot({ path: `${OUT}/media-card-805.11.354.png`, timeout: 120_000 });
      await page.locator('[data-hw-tab="model3d"]').click();
      await sleep(300);
      const model805 = await page.evaluate(() => ({ status: document.querySelector('[data-hw-model3d]')?.getAttribute('data-hw-model3d'), text: document.querySelector('[data-hw-model3d-label]')?.textContent ?? '' }));
      await page.locator('[data-hw-tab="drawing"]').click();
      await sleep(300);
      const drawing805 = await page.locator('[data-hw-no-drawing]').count();
      check(
        'MEDIA12 карточка 805.11.354: паспорт дочитан; ФОТО ТОВАРА — оригинал своей позиции («Фото товара», ракурс один после снятия прав); 3D-ПРЕВЬЮ — «Условная 3D-модель»; ЧЕРТЁЖ — «чертежа нет»; артикул и источник',
        card805.detail === 'ready' &&
          String(card805.src).includes(`/hardware/${hafele.id}/hw-1-photo`) &&
          card805.label === 'EXACT_PRODUCT' &&
          card805.labelText.startsWith('Фото товара') &&
          card805.angles === 0 &&
          card805.article === '805.11.354' &&
          /КОМПАКТ 2025/.test(card805.source) &&
          model805.status === 'VISUAL_APPROXIMATION' &&
          model805.text.startsWith('Условная 3D-модель') &&
          drawing805 === 1,
        JSON.stringify({ ...card805, model805, drawing805 }),
      );
      await page.locator('[data-hw-detail-close]').click();

      /* 71B3550 без фото (привязку сняли) и её планка — отдельной позицией со своим статусом 3D. */
      await page.locator('[data-hw-filter="photo"]').click();
      await page.locator('[data-hw-search]').fill('71B3550');
      await sleep(300);
      await page.locator('[data-hw-item="MFR-BLUM-71B3550"]').first().click();
      await page.waitForSelector('[data-hw-card="MFR-BLUM-71B3550"]', { timeout: 10_000 });
      const card71 = await page.evaluate(() => ({ none: document.querySelector('[data-hw-no-photo]')?.textContent ?? '', visual: document.querySelector('[data-hw-visual]')?.getAttribute('data-hw-visual') }));
      await page.locator('[data-hw-detail-close]').click();
      await page.locator('[data-hw-search]').fill('173L6100');
      await sleep(300);
      await page.locator('[data-hw-item="MFR-BLUM-173L6100"]').first().click();
      await page.waitForSelector('[data-hw-card="MFR-BLUM-173L6100"]', { timeout: 10_000 });
      await page.locator('[data-hw-tab="model3d"]').click();
      await sleep(300);
      const plate = await page.evaluate(() => ({ status: document.querySelector('[data-hw-model3d]')?.getAttribute('data-hw-model3d'), none: document.querySelector('[data-hw-no-photo]') ? 1 : 0, title: document.querySelector('#hw-detail-title')?.textContent ?? '' }));
      await page.locator('[data-hw-detail-close]').click();
      check(
        'MEDIA13 71B3550: «Фото изделия пока отсутствует», 3D — условная петля; ответная планка 173L6100 — отдельная карточка: своё название, 3D нет',
        card71.none.includes('Фото изделия пока отсутствует') && card71.visual === 'VISUAL_APPROXIMATION' && plate.status === 'NO_3D' && /планк/i.test(plate.title),
        JSON.stringify({ card71, plate }),
      );

      /* 9 114 276 на ящиках: поставить, сохранить, перезагрузить; паспорт установленной дочитан. */
      must('MEDIA инструмент «Выбор»', await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="select"]');
      await page.locator('[data-object-module="base-3300@w1"]').first().click();
      await sleep(400);
      await tool(page, 'hardware');
      await page.locator('[data-hw-slot="slide"]').first().click();
      await page.locator('[data-hw-search]').fill('9114276');
      await sleep(400);
      await page.locator('[data-hw-item="MFR-HETTICH-9114276"]').first().click();
      await page.waitForSelector('[data-hw-card="MFR-HETTICH-9114276"]', { timeout: 10_000 });
      const card9 = await page.evaluate(() => ({
        photo: document.querySelector('[data-hw-detail-photo]')?.getAttribute('src') ?? null,
        verdict: document.querySelector('[data-hw-card-verdict]')?.getAttribute('data-hw-card-verdict') ?? null,
      }));
      await page.locator('[data-hw-tab="model3d"]').click();
      const preview = await waitFor(page, () => document.querySelector('[data-hw-preview]')?.getAttribute('data-hw-preview') ?? null, (v) => v === 'ready' || v === 'none', 30_000);
      await page.screenshot({ path: `${OUT}/media-card-9114276-3d.png`, timeout: 120_000 });
      await page.locator('[data-hw-install]').click();
      const installed = await waitFor(page, () => document.querySelector('[data-hw-slot="slide"]')?.getAttribute('data-hw-installed') ?? null, (v) => v === 'MFR-HETTICH-9114276', 20_000);
      /* Поставлено — карточка уходит сама: к следующему месту не нужно её закрывать. */
      const cardClosed = await waitFor(page, () => document.querySelector('[data-hw-card]') === null, (v) => v === true, 10_000);
      const save = await saved(page);
      await openStudio(page, ids.kitchen);
      must('MEDIA инструмент «Выбор» после перезагрузки', await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР');
      await page.locator('[data-object-module="base-3300@w1"]').first().click();
      await sleep(400);
      await tool(page, 'hardware');
      const reloaded = await waitFor(page, () => document.querySelector('[data-hw-slot="slide"]')?.getAttribute('data-hw-installed') ?? null, (v) => v === 'MFR-HETTICH-9114276', 30_000);
      check(
        'MEDIA14 9 114 276: в карточке своё фото (без миниатюры — оригинал), совместимость с ящиками, 3D-превью нарисовано; «Установить» — на месте, карточка ушла сама, сохранено и после перезагрузки на месте',
        String(card9.photo).includes(`/hardware/${hettich.id}/`) && card9.verdict && card9.verdict !== 'refused' && preview === 'ready' && installed === 'MFR-HETTICH-9114276' && cardClosed === true && save === 'saved' && reloaded === 'MFR-HETTICH-9114276',
        JSON.stringify({ ...card9, preview, installed, cardClosed, save, reloaded }),
      );

      /* Паспорт установленной позиции дочитан рабочим местом: присадка детали — не «не дочитано». */
      await tool(page, 'documents');
      await page.locator('[data-studio-doc="panels"]').first().click();
      await page.waitForSelector('[data-panel-row]', { timeout: 30_000 });
      const sidePart = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-panel-row][data-module-id="base-3300@w1"]'))
          .map((r) => ({ part: r.getAttribute('data-part-id'), text: r.textContent ?? '' }))
          .find((r) => r.text.includes('Боковина') && !r.text.includes('ящика')),
      );
      must('MEDIA боковина base-3300 в деталировке', Boolean(sidePart), 'НУЛЕВОЙ СЕЛЕКТОР: [data-panel-row] боковины base-3300@w1');
      await page.locator(`[data-panel-row][data-part-id="${sidePart.part}"]`).first().click();
      const drill = await waitFor(
        page,
        () => document.querySelector('[data-part-drilling-lines]')?.textContent ?? '',
        (t) => t.length > 0 && !t.includes('ещё не дочитан'),
        30_000,
      );
      check(
        'MEDIA15 рабочее место дочитало паспорт установленной направляющей: в карточке боковины цепочка 37 / 165 / 261 / 325, а не «паспорт ещё не дочитан»',
        drill.includes('37 / 165 / 261 / 325') && !drill.includes('ещё не дочитан'),
        drill.slice(0, 200),
      );

      const canvasSame = await page.evaluate(() => document.querySelectorAll('canvas').length);
      check('MEDIA16 ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.filter((e) => !/Failed to load resource/.test(e)).length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | ') + ` · холстов ${canvasSame}`);
    },
    {
      viewport: { width: 1440, height: 900 },
      production: { drawerBox: DRAWER_BOX },
      projects: [{ key: 'kitchen', zone: 'Кухня', fx }],
      setup: async ({ service, org }) => {
        /* Своя позиция компании с тем же артикулом без точек — для «неоднозначно» в пакете. */
        const { data: cat } = await service.from('catalog_categories').select('id').eq('org_id', org.id).eq('key', 'hardware').maybeSingle();
        if (!cat) throw new Error('нет категории фурнитуры');
        const { error } = await service.from('catalog_items').insert({
          org_id: org.id,
          category_id: cat.id,
          article: OWN_TWIN.article,
          name_ru: 'Своя позиция с тем же артикулом',
          name_kk: '',
          price: 0,
          unit: 'piece',
          meta: { hardware: { category: 'wardrobe', manufacturer: 'Компания', manufacturerArticle: OWN_TWIN.manufacturerArticle } },
        });
        if (error) throw new Error(`своя позиция: ${error.message}`);
      },
    },
  );
}

/* ═════════════════════════  SCROLL  ═════════════════════════ */

/**
 * 60 позиций Häfele с файлами — прямо в Storage и строки, как их кладёт
 * маршрут фото. Берутся ПЕРВЫЕ ПО ПОРЯДКУ СПИСКА (название, русская
 * сортировка — как сортирует панель): первые 60 по артикулу рассыпаны по
 * 591 строке, и остановка прокрутки приходилась на строки без фото —
 * проверка «видимые грузятся сами» стояла на пустом месте.
 */
async function seedPhotos(service, org, n = 60) {
  const { data: all } = await service.from('catalog_items').select('id, article, name_ru, meta').eq('org_id', org.id).like('article', 'MFR-HAFELE-%');
  const rows = (all ?? []).sort((a, b) => a.name_ru.localeCompare(b.name_ru, 'ru')).slice(0, n);
  const day = new Date().toISOString().slice(0, 10);
  for (const [i, row] of rows.entries()) {
    const png = await testImage(`${i + 1}`, i % 2 ? '#3a6ea5' : '#6a8a3a', 600, 400);
    const thumb = await sharp(png).resize(320, 320, { fit: 'inside' }).webp({ quality: 80 }).toBuffer();
    const base = `${org.id}/hardware/${row.id}`;
    const stamp = Date.now();
    await service.storage.from('catalog').upload(`${base}/hw-1-photo-${stamp}.jpg`, await sharp(png).jpeg().toBuffer(), { contentType: 'image/jpeg', upsert: false });
    await service.storage.from('catalog').upload(`${base}/hw-1-thumb-${stamp}.webp`, thumb, { contentType: 'image/webp', upsert: false });
    await service.from('catalog_assets').insert([
      { item_id: row.id, org_id: org.id, kind: 'photo', role: 'hw-1', storage_path: `${base}/hw-1-photo-${stamp}.jpg`, sort_order: 0 },
      { item_id: row.id, org_id: org.id, kind: 'swatch', role: 'hw-1', storage_path: `${base}/hw-1-thumb-${stamp}.webp`, sort_order: 1 },
    ]);
    await service
      .from('catalog_items')
      .update({ meta: { ...row.meta, media: [{ role: 'hw-1', kind: 'EXACT_PRODUCT', rights: 'VERIFIED', rightsNote: 'тестовое изображение проверки', checkedAt: day, primary: true }] } })
      .eq('id', row.id);
  }
  return rows.length;
}

/**
 * ЧЕМ ЗАНЯТЫ ДЛИННЫЕ ЗАДАЧИ ПРОКРУТКИ — трасса Chrome, A/B в одном прогоне:
 * один и тот же узор прокрутки (4 раза по 6 шагов вниз и вверх, шаг —
 * полтора экрана) над строками БЕЗ фото (A, с 300-й строки) и над 60
 * строками С фото (B, с начала списка). Собственное время событий главного
 * потока страницы — всего и внутри длинных задач (> 50 мс), кадры, площадь
 * отрисовки (`Paint`, прямоугольник отсечения): дороже ли каждый кадр с фото
 * или кадров больше, и что именно перерисовывается. Диагностика.
 */
async function partScrollTrace(browser) {
  console.log('\n── SCROLLTRACE: трасса быстрой прокрутки — A без фото и B с фото, тот же узор');
  const fx = fixture('kitchen');
  await withOrg(
    'SCROLLTRACE',
    browser,
    async ({ page, context, ids }) => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      const net = netMeter(cdp);
      await openStudio(page, ids.kitchen);
      await open3d(page, 'SCROLLTRACE');
      await hardwareBrowse(page, 'SCROLLTRACE');
      await page.locator('[data-hw-brand="Häfele"]').click();
      await sleep(1500);
      let events = [];
      cdp.on('Tracing.dataCollected', (e) => events.push(...e.value));
      const viewportArea = 1440 * 900;

      const traceWindow = async (key, startRow) => {
        await page.locator('[data-hw-list]').first().evaluate((el, top) => {
          el.scrollTop = top;
        }, startRow * 76);
        await sleep(1500);
        events = [];
        const complete = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
        await cdp.send('Tracing.start', {
          transferMode: 'ReportEvents',
          traceConfig: {
            recordMode: 'recordAsMuchAsPossible',
            includedCategories: ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'loading', 'v8', 'disabled-by-default-v8.gc'],
          },
        });
        net.reset();
        for (let round = 0; round < 4; round += 1) {
          const pass = await scrollList(page, { steps: 6, factor: 1.5, dirs: [1, -1], waitMs: 16 });
          must(`SCROLLTRACE ${key}: список прокручивается`, pass !== null, 'НУЛЕВОЙ СЕЛЕКТОР: [data-hw-list]');
        }
        const images = net.snapshot().imageRequests;
        await cdp.send('Tracing.end');
        await complete;

        /* Главный поток страницы: процесс кадра с адресом Studio → его CrRendererMain. */
        const started = events.find((e) => e.name === 'TracingStartedInBrowser');
        const frame = (started?.args?.data?.frames ?? []).find((f) => String(f.url).includes('/room'));
        const pid = frame?.processId;
        const tid = events.find((e) => e.ph === 'M' && e.name === 'thread_name' && e.pid === pid && e.args?.name === 'CrRendererMain')?.tid;
        must(`SCROLLTRACE ${key}: главный поток страницы найден в трассе`, pid !== undefined && tid !== undefined, `pid ${pid} tid ${tid}`);
        const main = events
          .filter((e) => e.pid === pid && e.tid === tid && e.ph === 'X' && typeof e.dur === 'number')
          .sort((a, b) => a.ts - b.ts || b.dur - a.dur);
        /* Собственное время: длительность минус прямые вложенные; корень — RunTask. */
        const stack = [];
        const nodes = [];
        for (const e of main) {
          while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= e.ts) nodes.push(stack.pop());
          const node = { ...e, child: 0, root: stack.length ? stack[0] : null };
          if (stack.length) stack[stack.length - 1].child += e.dur;
          stack.push(node);
        }
        nodes.push(...stack);
        const all = new Map();
        const inLong = new Map();
        const long = [];
        let busy = 0;
        for (const n of nodes) {
          const self = Math.max(0, n.dur - n.child) / 1000;
          const name = n.name === 'FunctionCall' || n.name === 'EvaluateScript' || n.name.startsWith('V8.') ? `сценарий: ${n.name}` : n.name;
          if (name !== 'RunTask') all.set(name, (all.get(name) ?? 0) + self);
          const root = n.root ?? n;
          if (root.name === 'RunTask' && root.dur > 50_000 && name !== 'RunTask') inLong.set(name, (inLong.get(name) ?? 0) + self);
          if (n.name === 'RunTask' && !n.root) {
            busy += n.dur / 1000;
            if (n.dur > 50_000) long.push(n.dur / 1000);
          }
        }
        const paints = main.filter((e) => e.name === 'Paint');
        const areaOf = (e) => {
          const q = e.args?.data?.clip;
          if (!Array.isArray(q) || q.length < 8) return 0;
          const xs = [q[0], q[2], q[4], q[6]];
          const ys = [q[1], q[3], q[5], q[7]];
          return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
        };
        const areas = paints.map(areaOf);
        const top = (map) =>
          Array.from(map.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 14)
            .map(([name, ms]) => `${name} ${Math.round(ms)}`);
        return {
          key,
          steps: 48,
          images,
          busyMs: Math.round(busy),
          long: { count: long.length, totalMs: Math.round(long.reduce((s, d) => s + d, 0)), maxMs: Math.round(Math.max(0, ...long)) },
          frames: main.filter((e) => e.name === 'Commit').length,
          paints: paints.length,
          paintAreaMpx: Math.round(areas.reduce((s, a) => s + a, 0) / 1e5) / 10,
          paintsOverHalfViewport: areas.filter((a) => a >= viewportArea / 2).length,
          inLong: top(inLong),
          all: top(all),
        };
      };

      /* Повторы и порядок: первый показ строк против повторного, своё место против очереди. */
      const runs = [];
      for (const [key, row] of [
        ['A1 без фото, с 300-й', 300],
        ['B1 с фото, с начала', 0],
        ['A2 без фото, с 300-й снова', 300],
        ['C без фото, со 150-й — впервые', 150],
        ['B2 с фото снова', 0],
      ]) {
        runs.push(await traceWindow(key, row));
      }
      const result = { build: buildId(), runs };
      writeFileSync(`${OUT}/scrolltrace-${LABEL}.json`, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
      check('SCROLLTRACE трассы разобраны', runs.every((r) => r.frames > 0), runs.map((r) => `${r.key}: кадров ${r.frames}`).join(' · '));
    },
    {
      viewport: { width: 1440, height: 900 },
      projects: [{ key: 'kitchen', zone: 'Кухня', fx }],
      setup: async ({ service, org }) => {
        await seedPhotos(service, org, 60);
      },
    },
  );
}

/**
 * ПЕРВАЯ ПРОКРУТКА ПОСЛЕ ОТКРЫТИЯ ПАНЕЛИ — профиль процессора: тот же узор
 * (4 раза по 6 шагов вниз и вверх, полтора экрана) с 300-й строки дважды —
 * первый раз и повтор. Трасса показала, что дорого только первое окно; здесь
 * называется, ЧЕМ оно занято в сценарии. Диагностика.
 */
async function partScrollFirst(browser) {
  console.log('\n── SCROLLFIRST: профиль первой прокрутки после открытия панели и её повтора');
  const fx = fixture('kitchen');
  await withOrg(
    'SCROLLFIRST',
    browser,
    async ({ page, context, ids }) => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await openStudio(page, ids.kitchen);
      await open3d(page, 'SCROLLFIRST');
      await hardwareBrowse(page, 'SCROLLFIRST');
      await page.locator('[data-hw-brand="Häfele"]').click();
      await sleep(1500);
      const out = [];
      for (const key of ['первая', 'повтор']) {
        await page.locator('[data-hw-list]').first().evaluate((el) => {
          el.scrollTop = 300 * 76;
        });
        await sleep(1500);
        const t0 = await now(page);
        await cdp.send('Profiler.start');
        for (let round = 0; round < 4; round += 1) {
          const pass = await scrollList(page, { steps: 6, factor: 1.5, dirs: [1, -1], waitMs: 16 });
          must(`SCROLLFIRST ${key}: список прокручивается`, pass !== null, 'НУЛЕВОЙ СЕЛЕКТОР: [data-hw-list]');
        }
        const { profile } = await cdp.send('Profiler.stop');
        const long = await longSince(page, t0);
        out.push({ key, long, ...profileTop(profile, 20) });
      }
      const result = { build: buildId(), runs: out };
      writeFileSync(`${OUT}/scrollfirst-${LABEL}.json`, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
      check('SCROLLFIRST профили записаны', out.length === 2 && out.every((r) => r.top.length > 0), 'выборок нет');
    },
    { viewport: { width: 1440, height: 900 }, projects: [{ key: 'kitchen', zone: 'Кухня', fx }] },
  );
}

async function partScroll(browser) {
  console.log('\n── SCROLL: 60 позиций с фото — быстрая прокрутка, ленивые миниатюры, чужих картинок нет, память, сцена та же');
  const fx = fixture('kitchen');
  let seeded = 0;
  await withOrg(
    'SCROLL',
    browser,
    async ({ page, context, errors, ids }) => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      await cdp.send('Network.enable');
      const net = netMeter(cdp);
      await openStudio(page, ids.kitchen);
      await open3d(page, 'SCROLL');
      await page.evaluate(() => {
        const canvas = document.querySelector('[data-studio-viewport] canvas');
        if (canvas) canvas.__hwMark = 'тот же';
      });
      await hardwareBrowse(page, 'SCROLL');
      await page.locator('[data-hw-brand="Häfele"]').click();
      await sleep(500);
      const total = await count(page);
      const listPx = await page.locator('[data-hw-list]').first().evaluate((el) => el.clientHeight);

      /*
       * Сцена притихла до замера: кадры, которые она дорисовывает после «3D
       * готова» (догрузка, доводка камеры), — не прокрутка списка.
       */
      const quiet = await sceneQuiet(page, 1500, 20_000);
      must('SCROLL сцена притихла до прокрутки: 1.5 с без кадров', quiet.ok, quiet.frames === null ? 'НУЛЕВОЙ СЕЛЕКТОР: счётчика кадров сцены нет' : `кадры не прекращаются: ${quiet.frames} за 20 с`);

      /*
       * Быстрая прокрутка: 3 круга вниз-вверх по 25 шагов без пауз; после каждого
       * круга — куча. Окна, пока список двигался, — по часам проверки: запрос
       * картинки, начатый в таком окне, — строка, пролетевшая мимо. Между
       * кругами список стоит (сборка мусора, куча), и видимые строки там грузят
       * свои картинки законно.
       */
      const frames0 = await page.evaluate(() => (window.__mwCadFrames ? window.__mwCadFrames() : null));
      const heaps = [];
      const moving = [];
      let maxRows = 0;
      let foreignSeen = 0;
      net.reset();
      const t0 = await now(page);
      for (let round = 0; round < 3; round += 1) {
        const w0 = Date.now();
        const pass = await scrollList(page, { steps: 25, factor: 1.5, dirs: [1, -1], waitMs: 16, inspect: true });
        moving.push([w0, Date.now()]);
        must('SCROLL список прокручивается', pass !== null, 'НУЛЕВОЙ СЕЛЕКТОР: [data-hw-list]');
        maxRows = Math.max(maxRows, pass.maxRows);
        foreignSeen += pass.foreign;
        await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined);
        heaps.push((await metrics(cdp)).heapMb);
      }
      const fastImages = net.snapshot().imageRequests;
      /* 50 мс на начало круга: запрос, начатый у строк, стоявших до первого шага, — ещё покой. */
      const startedMoving = net.imageStarts().filter((s) => moving.some(([a, b]) => s.at > a + 50 && s.at < b));
      const fastLong = await longSince(page, t0);
      const frames1 = await page.evaluate(() => (window.__mwCadFrames ? window.__mwCadFrames() : null));

      /*
       * Остановились посреди строк с фото (30-я строка по 76 px): видимые грузят
       * свои миниатюры сами — запросы в сеть есть, в ожидании и загрузке не
       * остаётся ни одной. Не наверху — верхние строки загрузились ещё до
       * прокрутки, и там «грузятся сами» прошло бы из запомненных адресов.
       */
      net.reset();
      await page.locator('[data-hw-list]').first().evaluate((el) => {
        el.scrollTop = 30 * 76;
      });
      await waitFor(
        page,
        () => Array.from(document.querySelectorAll('[data-hw-photo]')).map((n) => n.getAttribute('data-hw-photo')),
        (s) => s.length > 0 && s.every((v) => v !== 'wait' && v !== 'load'),
        20_000,
      );
      const restRows = await rowPhotos(page);
      const restImages = net.imageStarts().length;
      const restStates = restRows.reduce((acc, r) => ({ ...acc, [r.state ?? 'нет']: (acc[r.state ?? 'нет'] ?? 0) + 1 }), {});
      const canvas = await page.evaluate(() => ({ count: document.querySelectorAll('canvas').length, same: document.querySelector('[data-studio-viewport] canvas')?.__hwMark === 'тот же' }));
      const result = { seeded, total, listPx, maxRows, foreignSeen, fastImages, startedMoving: startedMoving.length, restImages, restStates, heaps, fastLong, sceneFrames: frames1 - frames0, canvas };
      writeFileSync(`${OUT}/scroll.json`, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result));
      check('SCROLL1 позиций с фото засеяно 60, производитель Häfele — 591 позиция в списке', seeded === 60 && total === 591, `${seeded} · ${total}`);
      check(
        'SCROLL2 быстрая прокрутка (150 шагов по полтора экрана): строк в DOM не больше видимых + запас, чужих картинок в строках 0',
        maxRows <= Math.ceil(listPx / 76) + 13 && foreignSeen === 0,
        `строк до ${maxRows} при окне ${listPx} px · чужих ${foreignSeen}`,
      );
      check(
        'SCROLL3 миниатюры — когда список стоит: запросов картинок, начатых во время быстрой прокрутки, 0; на остановке видимые строки грузят свои сами (запросы в сеть есть, в ожидании и загрузке — ни одной, ошибок нет), чужих 0',
        startedMoving.length === 0 &&
          restImages >= 1 &&
          restRows.filter((r) => r.state === 'ready').length >= 3 &&
          restRows.every((r) => r.state !== 'wait' && r.state !== 'load' && r.state !== 'error') &&
          foreign(restRows).length === 0,
        `начато во время прокрутки ${startedMoving.length} (всего за прокрутку с паузами ${fastImages}) · на остановке запросов ${restImages}, строки ${JSON.stringify(restStates)}`,
      );
      check(
        'SCROLL4 память не растёт от круга к кругу (после сборки мусора разница меньше 8 МБ); длинных задач больше 200 мс нет',
        heaps[2] - heaps[0] < 8 && fastLong.maxMs < 200,
        `куча ${heaps.join(' → ')} МБ · длинных ${fastLong.count}, наибольшая ${fastLong.maxMs} мс`,
      );
      check(
        'SCROLL5 3D не пересоздаётся и не рисует: холст один и тот же, кадров сцены за прокрутку 0',
        canvas.same && result.sceneFrames === 0,
        `холстов ${canvas.count} · тот же ${canvas.same} · кадров ${result.sceneFrames}`,
      );
      check('SCROLL6 ошибок страницы нет', errors.length === 0, errors.slice(0, 3).join(' | '));
    },
    {
      viewport: { width: 1440, height: 900 },
      projects: [{ key: 'kitchen', zone: 'Кухня', fx }],
      setup: async ({ service, org }) => {
        seeded = await seedPhotos(service, org, 60);
      },
    },
  );
}

/* ═════════════════════════  TABLET  ═════════════════════════ */

async function partTablet(browser) {
  console.log('\n── TABLET (1024 × 768, касание): каталог, фильтр, карточка в экране, установка касанием');
  const fx = fixture('kitchen');
  await withOrg(
    'TABLET',
    browser,
    async ({ page, ids, errors }) => {
      await openStudio(page, ids.kitchen);
      must('TABLET инструмент «Выбор»', await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР');
      await page.locator('[data-object-module="base-1200@w1"]').first().tap();
      await sleep(400);
      must('TABLET инструмент «Фурнитура»', await tool(page, 'hardware'), 'НУЛЕВОЙ СЕЛЕКТОР');
      await waitFor(page, () => Number(document.querySelector('[data-hw-panel]')?.getAttribute('data-hw-items') ?? 0), (n) => n >= FACT_COUNT, 60_000);
      await page.locator('[data-hw-slot="hinge"]').first().tap();
      await page.locator('[data-hw-brand="Blum"]').tap();
      await sleep(300);
      const layout = await page.evaluate(() => {
        const list = document.querySelector('[data-hw-list]')?.getBoundingClientRect();
        const row = document.querySelector('[data-hw-item]')?.getBoundingClientRect();
        return {
          listW: list ? Math.round(list.width) : 0,
          listH: list ? Math.round(list.height) : 0,
          rowH: row ? Math.round(row.height) : 0,
          scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      await page.locator('[data-hw-search]').fill('71B3550');
      await sleep(300);
      await page.locator('[data-hw-item="MFR-BLUM-71B3550"]').first().tap();
      await page.waitForSelector('[data-hw-card="MFR-BLUM-71B3550"]', { timeout: 10_000 });
      const dialog = await page.evaluate(() => {
        const box = document.querySelector('[data-hw-card]')?.getBoundingClientRect();
        const install = document.querySelector('[data-hw-install]')?.getBoundingClientRect();
        return {
          inside: box ? box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && box.bottom <= window.innerHeight : false,
          w: box ? Math.round(box.width) : 0,
          installH: install ? Math.round(install.height) : 0,
          scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      await page.screenshot({ path: `${OUT}/tablet-card.png`, timeout: 120_000 });
      await page.locator('[data-hw-install]').first().tap();
      const installed = await waitFor(page, () => document.querySelector('[data-hw-slot="hinge"]')?.getAttribute('data-hw-installed') ?? null, (v) => v === 'MFR-BLUM-71B3550', 20_000);
      check(
        'TABLET1 список в панели: строки 76 px, без прокрутки страницы по ширине',
        layout.rowH === 76 && layout.listW > 200 && layout.listH >= 228 && layout.scrollX <= 0,
        JSON.stringify(layout),
      );
      check(
        'TABLET2 карточка целиком в экране планшета, кнопка «Установить» не ниже 36 px, прокрутки по ширине нет; касание ставит петлю',
        dialog.inside && dialog.installH >= 36 && dialog.scrollX <= 0 && installed === 'MFR-BLUM-71B3550',
        JSON.stringify({ ...dialog, installed }),
      );
      check('TABLET3 ошибок страницы нет', errors.length === 0, errors.slice(0, 3).join(' | '));
    },
    { viewport: { width: 1024, height: 768 }, touch: true, projects: [{ key: 'kitchen', zone: 'Кухня', fx }] },
  );
}

/* ═════════════════════════  ECONOMY  ═════════════════════════ */

async function partEconomy(browser) {
  console.log('\n── ECONOMY: «Экономичный режим» — плотность 1, без теней и окружения, холст тот же, картинки библиотеки по нажатию, режим помнит устройство');
  const fx = fixture('kitchen');
  await withOrg(
    'ECONOMY',
    browser,
    async ({ page, ids, errors }) => {
      await openStudio(page, ids.kitchen);
      await open3d(page, 'ECONOMY');
      const look = () => page.evaluate(() => (window.__mwCadEconomy ? window.__mwCadEconomy() : null));
      await page.evaluate(() => {
        const canvas = document.querySelector('[data-studio-viewport] canvas');
        if (canvas) canvas.__hwMark = 'тот же';
      });
      const before = await look();
      const layers = page.locator('[data-scene-layers-toggle]');
      must('ECONOMY кнопка «Слои»', (await layers.count()) > 0, 'НУЛЕВОЙ СЕЛЕКТОР: [data-scene-layers-toggle]');
      await layers.first().click();
      await page.locator('[data-scene-economy]').click();
      const on = await waitFor(page, () => (window.__mwCadEconomy ? window.__mwCadEconomy() : null), (v) => v && v.economy === true && v.dpr === 1, 10_000);
      const sameCanvas = await page.evaluate(() => document.querySelector('[data-studio-viewport] canvas')?.__hwMark === 'тот же');
      /* Экран 2× (deviceScaleFactor 2): без режима плотность — потолок сцены 1.75, в режиме — 1. На экране 1× разницы не видно вовсе. */
      check(
        'ECONOMY1 до (экран 2×): плотность пикселей 1.75, тени и окружение есть; экономичный режим: плотность 1, теней нет, карты окружения нет — холст тот же, сцена не пересоздана',
        before?.economy === false && before.dpr === 1.75 && before.shadows === true && before.environment === true && on?.dpr === 1 && on.shadows === false && on.environment === false && sameCanvas,
        JSON.stringify({ before, on, sameCanvas }),
      );

      /* Картинки библиотеки — по нажатию. */
      must('ECONOMY инструмент «Выбор»', await tool(page, 'select'), 'НУЛЕВОЙ СЕЛЕКТОР');
      await page.locator('[data-object-module="base-1200@w1"]').first().click();
      await sleep(400);
      await tool(page, 'furniture');
      await page.waitForSelector('[data-library="1"] [data-card]', { timeout: 30_000 });
      await sleep(1500);
      const gated = await page.evaluate(() => ({ words: Boolean(document.querySelector('[data-library-economy]')), imgs: document.querySelectorAll('[data-library="1"] [data-card] img').length }));
      await page.locator('[data-library-draw-thumbs]').click();
      const drawn = await waitFor(page, () => document.querySelectorAll('[data-library="1"] [data-card] img').length, (n) => n > 0, 30_000);
      check(
        'ECONOMY2 библиотека в экономичном режиме: картинок 0 и сказано словами; «Нарисовать картинки» — картинки есть',
        gated.words && gated.imgs === 0 && drawn > 0,
        `${JSON.stringify(gated)} · после нажатия ${drawn}`,
      );

      /* Настройка устройства: после перезагрузки режим тот же. */
      await openStudio(page, ids.kitchen);
      await open3d(page, 'ECONOMY перезагрузка');
      const after = await waitFor(page, () => (window.__mwCadEconomy ? window.__mwCadEconomy() : null), (v) => v && v.economy === true, 10_000);
      await page.locator('[data-scene-layers-toggle]').first().click();
      await page.locator('[data-scene-economy]').click();
      const off = await waitFor(page, () => (window.__mwCadEconomy ? window.__mwCadEconomy() : null), (v) => v && v.economy === false, 10_000);
      check(
        'ECONOMY3 режим помнит устройство: после перезагрузки включён (плотность 1); выключен — плотность 1.75, тени и окружение вернулись',
        after?.economy === true && after.dpr === 1 && after.shadows === false && off?.dpr === 1.75 && off.shadows === true && off.environment === true,
        JSON.stringify({ after, off }),
      );
      check('ECONOMY4 ошибок страницы нет', errors.length === 0, errors.slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 }, scale: 2, projects: [{ key: 'kitchen', zone: 'Кухня', fx }] },
  );
}

/* ═════════════════════════  запуск  ═════════════════════════ */

const unknownParts = PARTS.filter((p) => !KNOWN.includes(p));
if (unknownParts.length > 0 || PARTS.length === 0) {
  console.log(`Неизвестные части: ${unknownParts.join(', ') || 'пусто'} — есть ${KNOWN.join(', ')}`);
  process.exit(1);
}
loadEnv();
mkdirSync(OUT, { recursive: true });
let server = null;
let browser;
const done = [];
try {
  freePort(PORT);
  server = spawn('npx', ['next', 'start', '-p', String(PORT)], { stdio: 'ignore', shell: true, env: { ...process.env, SITE_PASSWORD: '' } });
  console.log(`Сборка ${buildId()} · снимки и числа: ${OUT}`);
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      /* сервер ещё поднимается */
    }
    await sleep(1000);
  }
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
  for (const part of PARTS) {
    try {
      if (part === 'perf') await partPerf(browser);
      else if (part === 'trace') await partTrace(browser);
      else if (part === 'profile') await partProfile(browser);
      else if (part === 'slot') await partSlot(browser);
      else if (part === 'read') await partRead(browser);
      else if (part === 'media') await partMedia(browser);
      else if (part === 'scroll') await partScroll(browser);
      else if (part === 'scrolltrace') await partScrollTrace(browser);
      else if (part === 'scrollfirst') await partScrollFirst(browser);
      else if (part === 'tablet') await partTablet(browser);
      else if (part === 'economy') await partEconomy(browser);
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
