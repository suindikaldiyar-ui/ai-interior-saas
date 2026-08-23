/**
 * Снимки всех экранов в двух темах и на двух ширинах.
 *
 * Инструмент глазной проверки, в приёмку не входит: редизайн нельзя принять
 * по описанию, его принимают по картинке. Кладёт в `.capture-check/design`
 * по файлу на экран и печатает, где текст мельче 13 px, где цели меньше
 * 44 px и где строка уезжает за правый край.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
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

  for (const [label, step] of [
    ['survey', 'Замер'],
    ['template', 'Шаблон'],
    ['compose', 'Состав'],
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

  for (const theme of ['dark', 'light']) {
    await run(browser, { width: 1440, height: 900, theme });
    await run(browser, { width: 390, height: 844, theme });
  }

  await browser.close();

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
} finally {
  server.kill();
  freePort(PORT);
}
process.exit(0);
