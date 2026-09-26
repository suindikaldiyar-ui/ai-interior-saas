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
 * `SCENE_ONLY=1` — только этот блок, без снимков остальных экранов.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { chromium } from 'playwright';
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

  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
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
console.log(`  ПАДЕНИЙ «Общего вида»: ${failures.length}`);
process.exit(failures.length === 0 ? 0 : 1);
