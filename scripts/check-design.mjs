/**
 * Снимки всех экранов в двух темах и на двух ширинах.
 *
 * Инструмент глазной проверки, в приёмку не входит: редизайн нельзя принять
 * по описанию, его принимают по картинке. Кладёт в `.capture-check/design`
 * по файлу на экран и печатает, где текст мельче 13 px, где цели меньше
 * 44 px и где строка уезжает за правый край.
 *
 * «ОБЩИЙ ВИД» — С ЧИСЛОМ, А НЕ ТОЛЬКО КАРТИНКОЙ (слой 53).
 *
 * Прямая и угловая кухня на 1440 и 1920 px: габарит кухни проецируется
 * камерой сцены (`__mwCadFit`) и обязан занять не меньше 70 % ширины ИЛИ
 * высоты холста, целиком оставаясь в кадре. Меньше — скрипт ПАДАЕТ:
 * «кухня мелкая» было жалобой клиента, и мерить её глазами уже пробовали.
 * Там же меряется холст: он обязан начинаться сразу под полосой кнопок
 * сцены, а между ними не стоять ничего (схемы соседней стены).
 *
 * КОМНАТА НА ЭКРАНЕ: стен столько, сколько в замере демонстрации, и
 * каждая нарисована его длиной и высотой; ни одна деталь мебели не входит
 * в нарисованную стену или ригель (`__mwCadRoom`).
 *
 * ПЕРВАЯ ЗАГРУЗКА `/demo` И `/project/[id]` БЕЗ three.js (тест 23): чанки
 * первой загрузки из манифеста сборки не имеют права содержать движок
 * сцены — он приезжает по требованию, вместе с 3D.
 *
 * ВЫСТУП СТЕНЫ (слой 56): настоящий объект со стеной 3800 и выступом
 * 600 × 400 посередине (заводится служебным ключом и удаляется). Снимки
 * схемы, плана и сцены; числами — выступ на схеме и на плане из
 * `roomLayout`, ни одного модуля в нём, соседи вплотную с обеих сторон
 * (0 мм), столешница на схеме рвётся на две с торцами у выступа (полоса
 * 201 мм уже типовых 300 мм цеха), объём выступа в сцене и ни одной детали
 * в нём (`__mwCadRoom`).
 *
 * `SCENE_ONLY=1` — только эти блоки, без снимков остальных экранов.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import sharp from 'sharp';

const PORT = 3204;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/design';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, {
      encoding: 'utf8',
    });
    for (const line of out.split(/\r?\n/)) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== '0') execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    }
  } catch {
    /* никто не слушает */
  }
}

const photo = await sharp({
  create: { width: 1200, height: 800, channels: 3, background: '#8d8377' },
})
  .composite([
    {
      input: Buffer.from(
        `<svg width="1200" height="800"><rect width="1200" height="800" fill="#8d8377"/>` +
          `<rect x="90" y="140" width="280" height="430" fill="#d9d3c6"/>` +
          `<text x="70" y="740" font-size="56" fill="#2b2620">ФОТО ПОМЕЩЕНИЯ</text></svg>`,
      ),
      top: 0,
      left: 0,
    },
  ])
  .jpeg()
  .toBuffer();

freePort(PORT);
// Чистим папку: снимок экрана, который перестал существовать, читается как
// свежий и врёт про состояние продукта.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
  // Дверь на время приёмки снята: иначе проверка упрётся в /gate.
  env: { ...process.env, SITE_PASSWORD: '' },
});

/** Что на экране нарушает шкалу и цели касания. */
async function audit(page, name) {
  return page.evaluate((screen) => {
    const small = [];
    const tiny = [];
    // Чертёж и замерный лист — документы, их плотность мерить не надо.
    const inDoc = (el) => el.closest('.mw-sheet, [data-doc]') !== null;

    for (const el of document.querySelectorAll('body *')) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const css = getComputedStyle(el);
      if (css.visibility === 'hidden' || css.display === 'none') continue;

      const hasText = [...el.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
      );
      if (hasText && !inDoc(el) && parseFloat(css.fontSize) < 13) {
        small.push(`${el.tagName.toLowerCase()} ${parseFloat(css.fontSize)}px «${el.textContent.trim().slice(0, 28)}»`);
      }

      const tappable =
        el.tagName === 'BUTTON' ||
        el.tagName === 'A' ||
        el.tagName === 'SELECT' ||
        el.tagName === 'INPUT';
      if (tappable && !inDoc(el) && (box.height < 44 || box.width < 44)) {
        const label = (el.getAttribute('aria-label') || el.textContent || el.type || '').trim();
        if (label) tiny.push(`${Math.round(box.width)}×${Math.round(box.height)} «${label.slice(0, 24)}»`);
      }
    }

    return {
      screen,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      small: [...new Set(small)].slice(0, 5),
      tiny: [...new Set(tiny)].slice(0, 5),
    };
  }, name);
}

const problems = [];
/** Падения «Общего вида»: доля кухни в кадре и место холста. */
const failures = [];
const sceneLog = [];

/*
 * ПЕРВАЯ ЗАГРУЗКА БЕЗ three.js — ПО МАНИФЕСТУ СБОРКИ.
 *
 * Строки движка, которые переживают сжатие: имена типов геометрии и
 * отрисовщика лежат в three.js строками. Нашлись в чанке первой
 * загрузки — значит статический импорт снова тянет сцену.
 */
{
  const manifestPath = '.next/app-build-manifest.json';
  if (!existsSync(manifestPath)) {
    failures.push('НЕТ СБОРКИ: .next/app-build-manifest.json не найден — сначала npm run build');
  } else {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const page of ['/demo/page', '/(millwork)/project/[id]/page']) {
      const files = manifest.pages[page] ?? [];
      if (files.length === 0) {
        failures.push(`первая загрузка ${page}: НУЛЕВОЙ СЕЛЕКТОР — страницы нет в манифесте`);
        continue;
      }
      let bytes = 0;
      const engine = [];
      for (const file of files) {
        const text = readFileSync(`.next/${file}`, 'utf8');
        bytes += text.length;
        if (/WebGLRenderer|BufferGeometry/.test(text)) engine.push(`${file} (${Math.round(text.length / 1024)} кБ)`);
      }
      sceneLog.push(`первая загрузка ${page}: ${files.length} чанков, ${Math.round(bytes / 1024)} кБ без сжатия, three.js ${engine.length ? engine.join(', ') : 'нет'}`);
      if (engine.length > 0) failures.push(`первая загрузка ${page} тянет three.js: ${engine.join(', ')}`);
    }
  }
}

/** Замер демонстрации (lib/millwork/demo.ts, DEMO_MEASUREMENT): стены и потолок. */
const DEMO_WALLS = [
  ['w1', 3800],
  ['w2', 1800],
];
const DEMO_CEILING_MM = 2700;

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const a = await audit(page, name);
  if (a.overflow > 0 || a.small.length || a.tiny.length) problems.push(a);
}

async function run(browser, { width, height, theme }) {
  const page = await browser.newPage({ viewport: { width, height } });
  const tag = `${theme}-${width}`;

  // Тему знает сервер: она приходит кукой, а не из localStorage.
  await page.context().addCookies([
    { name: 'mw-theme', value: theme, url: BASE },
  ]);

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await sleep(400);
  await shot(page, `login-${tag}`);

  await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
  await sleep(400);
  await shot(page, `projects-${tag}`);

  // Замер: демонстрация открывается с уже готовым замером, поэтому экран
  // замерщика снимаем на его собственном маршруте.
  await page.goto(`${BASE}/measure`, { waitUntil: 'networkidle' });
  await sleep(600);
  await shot(page, `measure-${tag}`);

  /*
   * Готовность — по экрану, а не по «сеть затихла»: сцена берёт HDRI-пресет
   * drei с raw.githubusercontent.com (`RoomCanvas.tsx`, слой 21), и при
   * медленном GitHub запрос висит минутами — `networkidle` не наступает.
   */
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.locator('nav[aria-label="Шаги работы"] button').first().waitFor({ timeout: 120_000 });
  await sleep(900);

  /*
     * ШАГИ НАЗЫВАЮТСЯ ТАК, КАК НА ЭКРАНЕ.
     *
     * Здесь стояли «Шаблон · Состав · Материалы» — это имена до слоя 31,
     * когда состав и материалы были отдельными шагами. Кнопок с такими
     * именами на экране нет, `btn.count()` возвращал ноль, и снимки
     * молча не делались: инструмент глазной проверки годами не показывал
     * рабочий экран, где живёт сцена.
     */
  for (const [label, step] of [
    ['survey', 'Замер'],
    ['template', 'Решение'],
    ['sizes', 'Размеры'],
    ['layout', 'Раскладка'],
    ['build', 'Конструкция'],
    ['materials', 'Материалы'],
  ]) {
    const btn = page.getByRole('button', { name: new RegExp(step) }).first();
    if (await btn.count()) {
      await btn.click();
      await sleep(600);
      await shot(page, `${label}-${tag}`);
    }
  }

  // Фото помещения нужно, чтобы «до и после» было чем заполнить.
  const file = page.locator('input[type=file][accept="image/*"]').first();
  if (await file.count()) {
    await file.setInputFiles({ name: 'room.jpg', mimeType: 'image/jpeg', buffer: photo });
    await sleep(1200);
  }

  await page.getByRole('button', { name: /Результат/ }).first().click();
  await sleep(800);
  await shot(page, `result-${tag}`);

  // Чертёж на том же шаге, ниже сравнения.
  const sheetTab = page.getByRole('button', { name: 'Чертёж', exact: true });
  if (await sheetTab.count()) {
    await sheetTab.click();
    await sleep(700);
    await shot(page, `drawing-${tag}`);
  }

  await page.close();
}

/* ─────────────  «Общий вид»: доля кухни в кадре  ───────────── */

const FILL_MIN = 0.7;

/** Габарит кухни в кадре и место холста — числами со страницы. */
const READ_FRAME = `(() => {
  const fit = window.__mwCadFit ? window.__mwCadFit() : null;
  const canvas = document.querySelector('[data-scene] canvas');
  const toolbar = document.querySelector('[data-schematic] [data-toolbar]');
  const neighbour = document.querySelector('[data-schematic] [data-neighbour]');
  const footer = document.querySelector('[data-workspace-footer]');
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width === 0 && r.height === 0 ? null : { x: r.x, y: r.y, w: r.width, h: r.height };
  };
  return {
    fit,
    canvas: rect(canvas),
    toolbar: rect(toolbar),
    neighbour: rect(neighbour),
    footer: rect(footer),
    window: { w: window.innerWidth, h: window.innerHeight },
  };
})()`;

async function readFrame(page) {
  const frame = await page.evaluate(READ_FRAME);
  const box = frame.fit?.box;
  if (!box) return { ...frame, fillW: 0, fillH: 0, inside: false };
  const [minX, maxX, minY, maxY] = box;
  return {
    ...frame,
    fillW: (Math.min(1, maxX) - Math.max(-1, minX)) / 2,
    fillH: (Math.min(1, maxY) - Math.max(-1, minY)) / 2,
    inside: minX >= -1.001 && maxX <= 1.001 && minY >= -1.001 && maxY <= 1.001,
  };
}

async function openGeneralView(page) {
  await page.getByRole('button', { name: /Раскладка/ }).first().click({ timeout: 90_000 });
  await sleep(1500);
  await page.locator('[data-schematic-tab="scene"]').click();
  await sleep(3000);
  const toggle = page.locator('[data-panel-toggle]');
  if ((await toggle.count()) > 0 && /Скрыть/.test(await toggle.first().innerText())) {
    await toggle.first().click();
    await sleep(1500);
  }
  await page.locator('[data-angle="iso"]').click();
  await sleep(3500);
}

async function measureGeneral(page, name) {
  const frame = await readFrame(page);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const fill = Math.max(frame.fillW, frame.fillH);
  const canvas = frame.canvas;
  const below = canvas && frame.toolbar ? Math.round(canvas.y - (frame.toolbar.y + frame.toolbar.h)) : null;
  const line =
    `${name}: кухня ${Math.round(frame.fillW * 100)} % ширины · ${Math.round(frame.fillH * 100)} % высоты холста` +
    `${frame.inside ? '' : ' · ВЫЛЕЗАЕТ ЗА КАДР'}` +
    ` · холст ${canvas ? `${Math.round(canvas.w)}×${Math.round(canvas.h)} с y=${Math.round(canvas.y)}` : 'НЕТ'}` +
    ` · окно ${frame.window.w}×${frame.window.h}` +
    `${frame.neighbour ? ` · между кнопками и сценой схема ${Math.round(frame.neighbour.h)} px` : ''}` +
    ` · камера ${frame.fit?.type ?? '—'}`;
  sceneLog.push(line);
  if (!frame.fit) failures.push(`${name}: НУЛЕВОЙ СЕЛЕКТОР — __mwCadFit нет, сцены нет`);
  else if (!frame.inside || fill < FILL_MIN) {
    failures.push(
      `${name}: кухня занимает ${Math.round(fill * 100)} % холста (нужно не меньше ${FILL_MIN * 100} %)` +
        `${frame.inside ? '' : ', и вылезает за кадр'}`,
    );
  }
  if (frame.neighbour) failures.push(`${name}: между кнопками и сценой стоит схема соседней стены`);
  void below;

  /* Комната: стены по нарисованному против замера, мебель вне стен. */
  const room = await page.evaluate(() => (window.__mwCadRoom ? window.__mwCadRoom() : null));
  if (!room) {
    failures.push(`${name}: НУЛЕВОЙ СЕЛЕКТОР — __mwCadRoom нет, комнаты нет`);
    return;
  }
  const drawn = room.wallDrawn.map((w) => `${w.id} ${w.lengthMm}×${w.heightMm}`).join(', ');
  const want = DEMO_WALLS.map(([id, length]) => `${id} ${length}×${DEMO_CEILING_MM}`).join(', ');
  sceneLog.push(
    `${name}: стен ${room.walls} (${drawn}) · пол ${room.floors} · пересечений мебели со стенами ${room.intersects} · ` +
      `в ригеле ${room.beamHits}`,
  );
  if (room.walls !== DEMO_WALLS.length || drawn !== want) {
    failures.push(`${name}: стены в сцене ${room.walls} (${drawn}) — по замеру ${DEMO_WALLS.length} (${want})`);
  }
  if (room.floors !== 1) failures.push(`${name}: полов в сцене ${room.floors}, нужен один — по контуру комнаты`);
  if (room.intersects !== 0 || room.beamHits !== 0) {
    failures.push(`${name}: мебель входит в стену (${room.intersects}) или в ригель (${room.beamHits})`);
  }
}

async function generalViews(browser) {
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', (e) => sceneLog.push(`  [ошибка страницы ${width}] ${e.message.slice(0, 140)}`));
    await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await sleep(3500);

    await openGeneralView(page);
    await measureGeneral(page, `general-straight-${width}`);

    /* Угловая: форма выбирается на шаге «Размеры», в панели. */
    await page.getByRole('button', { name: /^Размеры/ }).first().click();
    await sleep(1500);
    const toggle = page.locator('[data-panel-toggle]');
    if ((await toggle.count()) > 0 && /Показать/.test(await toggle.first().innerText())) {
      await toggle.first().click();
      await sleep(1200);
    }
    const corner = page.locator('[data-shape-kind="corner_l"]');
    if ((await corner.count()) === 0) {
      failures.push(`${width}: НУЛЕВОЙ СЕЛЕКТОР — кнопки угловой формы нет`);
      await page.close();
      continue;
    }
    await corner.click();
    await sleep(3000);
    await openGeneralView(page);
    await measureGeneral(page, `general-corner-${width}`);
    await page.close();
  }
}

/* ─────────────  Выступ стены: кухня по обе стороны (слой 56)  ───────────── */

/**
 * Выступ стены на настоящем объекте: стена 3800, выступ посередине 600 × 400
 * (проверка 9 приёмки). У демонстрации живого замера нет — шаг «Замер» есть
 * только у объекта, — поэтому объект заводится служебным ключом, как в
 * `check-render.mjs`, и удаляется после прогона.
 */
const PROTRUSION = { fromMm: 1600, widthMm: 600, depthMm: 400 };

async function protrusionViews(browser) {
  /* .env.local — ключи Supabase для объекта, как у проверок рендера и материалов. */
  if (existsSync('.env.local')) {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
  }
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !ANON || !SERVICE || /your-project|example/.test(URL)) {
    failures.push('выступ: НЕ ПРОВЕРЕНО — нет ключей Supabase в .env.local');
    return;
  }
  const service = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = Date.now();
  const email = `design-${stamp}@example.test`;
  const password = `Pw-${stamp}-design!`;
  const made = { user: null, org: null, project: null };

  try {
    const { data: created, error: userError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (userError) throw new Error(`createUser: ${userError.message}`);
    made.user = created.user.id;
    const { data: org, error: orgError } = await service
      .from('orgs')
      .insert({ slug: `design-${stamp}`, name: `Проверка выступа ${stamp}` })
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
    page.on('pageerror', (e) => sceneLog.push(`[ошибка страницы, выступ] ${e.message.slice(0, 140)}`));
    const seeded = await page.request.post(`${BASE}/api/catalog/seed-rates`, { data: { orgId: org.id } });
    if (!seeded.ok()) throw new Error(`типовой прайс не заведён: ${seeded.status()}`);

    const { data: project, error: projectError } = await service
      .from('projects')
      .insert({
        org_id: org.id,
        address: 'Проверка выступа',
        zone: 'Кухня',
        client_name: 'Проверка',
        measurements: {
          id: `m-${stamp}`,
          ceilingHeightMm: 2700,
          walls: [
            {
              id: 'a',
              lengthMm: 3800,
              angleDeg: 90,
              openings: [
                {
                  id: 'protrusion-1',
                  kind: 'protrusion',
                  fromCornerMm: PROTRUSION.fromMm,
                  widthMm: PROTRUSION.widthMm,
                  sillMm: 0,
                  heightMm: 2700,
                  depthMm: PROTRUSION.depthMm,
                },
              ],
            },
            { id: 'b', lengthMm: 3000, angleDeg: 90, openings: [] },
          ],
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
    made.project = project.id;

    await page.goto(`${BASE}/project/${project.id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await sleep(4000);

    const P = { from: PROTRUSION.fromMm, to: PROTRUSION.fromMm + PROTRUSION.widthMm };
    await page.getByRole('button', { name: /Раскладка/ }).first().click({ timeout: 90_000 });
    await sleep(2000);

    /* Схема: выступ из `roomLayout`, модули вокруг — признаками листа. */
    await page.locator('[data-schematic-tab="front"]').click();
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/protrusion-front-1440.png` });
    const front = await page.evaluate(() => ({
      objects: [...document.querySelectorAll('[data-schematic] [data-room-object][data-kind="protrusion"]')].map((el) => ({
        from: Number(el.getAttribute('data-from-mm')),
        width: Number(el.getAttribute('data-width-mm')),
      })),
      modules: [...document.querySelectorAll('[data-schematic] [data-module-id]')].map((el) => ({
        id: el.getAttribute('data-module-id'),
        offset: Number(el.getAttribute('data-module-offset')),
        width: Number(el.getAttribute('data-module-width')),
      })),
      counter: [...document.querySelectorAll('[data-schematic] [data-counter-piece]')].map((el) => ({
        from: Number(el.getAttribute('data-from-mm')),
        to: Number(el.getAttribute('data-to-mm')),
      })),
    }));
    const inside = front.modules.filter((m) => m.offset < P.to && m.offset + m.width > P.from);
    const leftFlush = front.modules.some((m) => m.offset + m.width === P.from);
    const rightFlush = front.modules.some((m) => m.offset === P.to);
    sceneLog.push(
      `выступ на схеме: ${front.objects.map((o) => `${o.from}…${o.from + o.width}`).join(', ') || 'НЕТ'} · модулей ${front.modules.length}, ` +
        `в выступе ${inside.length} · слева вплотную ${leftFlush ? 'да' : 'НЕТ'} · справа вплотную ${rightFlush ? 'да' : 'НЕТ'}`,
    );
    if (front.objects.length !== 1 || front.objects[0].from !== P.from || front.objects[0].width !== PROTRUSION.widthMm) {
      failures.push(`выступ: на схеме ${front.objects.length} выступов, нужен один ${P.from}…${P.to}`);
    }
    if (front.modules.length === 0) failures.push('выступ: НУЛЕВОЙ СЕЛЕКТОР — модулей на схеме нет');
    if (inside.length > 0) failures.push(`выступ: на схеме в выступе ${inside.map((m) => m.id).join(', ')}`);
    if (!leftFlush || !rightFlush) failures.push('выступ: кухня не стоит к выступу вплотную с обеих сторон');

    /*
     * Столешница у выступа 400 при плите 601: полоса перед ним 201 мм — уже
     * типовых 300 мм цеха, значит разрыв: две плиты с торцами у краёв
     * выступа, сквозь него ни одной (проверка 13 приёмки, путь экрана).
     */
    const counterThrough = front.counter.filter((c) => c.from < P.to && c.to > P.from);
    const counterEnds = [front.counter.some((c) => c.to === P.from), front.counter.some((c) => c.from === P.to)];
    sceneLog.push(
      `столешница на схеме: ${front.counter.map((c) => `${c.from}…${c.to}`).join(' ') || 'НЕТ'} · ` +
        `сквозь выступ ${counterThrough.length} · торцы у выступа ${counterEnds.every(Boolean) ? 'да' : 'НЕТ'}`,
    );
    if (front.counter.length === 0) failures.push('выступ: НУЛЕВОЙ СЕЛЕКТОР — столешницы на схеме нет');
    if (counterThrough.length > 0) failures.push(`выступ: столешница на схеме идёт сквозь выступ (${counterThrough.length})`);
    if (!counterEnds.every(Boolean)) failures.push('выступ 400 при плите 601: столешница не рвётся на две с торцами у выступа');

    await page.locator('[data-schematic-tab="plan"]').click();
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/protrusion-plan-1440.png` });
    const onPlan = await page.locator('[data-schematic] [data-room-object][data-kind="protrusion"]').count();
    sceneLog.push(`выступ на плане: ${onPlan}`);
    if (onPlan !== 1) failures.push(`выступ: на плане ${onPlan} выступов, нужен один`);

    /* Сцена: объём выступа нарисован, ни одна деталь мебели в него не входит. */
    await openGeneralView(page);
    await page.screenshot({ path: `${OUT}/protrusion-scene-1440.png` });
    const room = await page.evaluate(() => (window.__mwCadRoom ? window.__mwCadRoom() : null));
    if (!room) {
      failures.push('выступ: НУЛЕВОЙ СЕЛЕКТОР — __mwCadRoom нет, сцены нет');
    } else {
      const drawn = room.objects.filter((object) => object.kind === 'protrusion');
      sceneLog.push(`выступ в сцене: объёмов ${drawn.length} · пересечений мебели с комнатой ${room.intersects}`);
      if (drawn.length !== 1) failures.push(`выступ: в сцене ${drawn.length} объёмов выступа, нужен один`);
      if (room.intersects !== 0) failures.push(`выступ: мебель входит в стену или в объём (${room.intersects})`);
    }
    await context.close();
  } finally {
    if (made.project) await service.from('projects').delete().eq('id', made.project);
    if (made.org) await service.from('orgs').delete().eq('id', made.org);
    if (made.user) await service.auth.admin.deleteUser(made.user);
  }
}

try {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      /* поднимается */
    }
    await sleep(1000);
  }

  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });

  if (process.env.SCENE_ONLY !== '1') {
    for (const theme of ['dark', 'light']) {
      await run(browser, { width: 1440, height: 900, theme });
      await run(browser, { width: 390, height: 844, theme });
    }
  }

  await generalViews(browser);
  /* Сбой блока выступа — падение со словами, а не потерянный журнал остальных снимков. */
  try {
    await protrusionViews(browser);
  } catch (error) {
    failures.push(`выступ: ${error instanceof Error ? error.message.split(/\r?\n/)[0] : String(error)}`);
  }

  await browser.close();

  for (const line of sceneLog) console.log(`  ${line}`);
  for (const failure of failures) console.log(`  FAIL ${failure}`);

  if (problems.length === 0) {
    console.log('  шкала, цели касания и ширина: замечаний нет');
  } else {
    for (const p of problems) {
      console.log(`  ${p.screen}: вылет ${p.overflow} px`);
      if (p.small.length) console.log('    мельче 13 px:', p.small.join(' · '));
      if (p.tiny.length) console.log('    цель меньше 44 px:', p.tiny.join(' · '));
    }
  }
  console.log(`  снимки: ${OUT}`);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  console.log(`  FAIL ${failures[failures.length - 1]}`);
} finally {
  server.kill();
  freePort(PORT);
}
console.log(`  ПАДЕНИЙ «Общего вида» и выступа: ${failures.length}`);
process.exit(failures.length === 0 ? 0 : 1);
