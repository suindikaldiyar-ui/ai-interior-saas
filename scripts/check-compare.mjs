/**
 * Прогон блока «до и после»: шторка тянется указателем на планшете и на 390 px.
 * Инструмент для глазной проверки, в приёмку не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import sharp from 'sharp';

const PORT = 3197;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/compare';

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

freePort(PORT);
mkdirSync('.capture-check', { recursive: true });

const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
  // Дверь на время приёмки снята: иначе проверка упрётся в /gate.
  env: { ...process.env, SITE_PASSWORD: '' },
});

/** Кадр «фотографии»: полосы, чтобы шторку было видно глазом. */
const photo = await sharp({
  create: { width: 1200, height: 800, channels: 3, background: '#6b7280' },
})
  .composite([
    {
      input: Buffer.from(
        `<svg width="1200" height="800"><rect width="1200" height="800" fill="#6b7280"/>` +
          `<rect x="80" y="120" width="260" height="420" fill="#cbd5e1"/>` +
          `<text x="60" y="740" font-size="64" fill="#111">ФОТО</text></svg>`,
      ),
      top: 0,
      left: 0,
    },
  ])
  .jpeg()
  .toBuffer();

async function openResult(page) {
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await sleep(700);

  // Фото помещения — на шаге материалов.
  await page.getByRole('button', { name: /Материалы/ }).click();
  await sleep(500);
  await page
    .locator('input[type=file][accept="image/*"]')
    .first()
    .setInputFiles({ name: 'room.jpg', mimeType: 'image/jpeg', buffer: photo });
  await sleep(1200);

  await page.getByRole('button', { name: /Результат/ }).click();
  await sleep(700);
  await page.getByRole('button', { name: 'Рендер', exact: true }).click();
  await sleep(900);
}

try {
  for (let i = 0; i < 60; i++) {
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

  /* ── Планшет ── */
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 160)));

  await openResult(page);

  const slider = page.getByRole('slider', { name: 'Сравнение до и после' });
  console.log('  шторка на месте:', (await slider.count()) === 1 ? 'да' : 'НЕТ');
  console.log(
    '  правая половина без рендера подписана:',
    (await page.getByText('Рендера ещё нет').count()) === 1 ? 'да' : 'НЕТ',
  );
  const sceneBox = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return { x: Math.round(r.x), w: Math.round(r.width) };
  });
  console.log(
    '  техническая сцена:',
    !sceneBox
      ? 'не смонтирована'
      : sceneBox.x + sceneBox.w < 0
        ? 'за экраном (кадр снимать есть чем)'
        : `НА ЭКРАНЕ на x=${sceneBox.x}`,
  );
  await page.screenshot({ path: `${OUT}-tablet.png` });

  // Тянем шторку указателем.
  await slider.scrollIntoViewIfNeeded();
  await sleep(200);
  const box = await slider.boundingBox();
  const before = Number(await slider.getAttribute('aria-valuenow'));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 220, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await sleep(600);
  const after = Number(await slider.getAttribute('aria-valuenow'));
  console.log(`  шторка тянется: ${before}% → ${after}%`);
  await page.screenshot({ path: `${OUT}-dragged.png` });
  await page.close();

  /* ── Телефон 390 px, палец ── */
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await openResult(phone);

  const phoneSlider = phone.getByRole('slider', { name: 'Сравнение до и после' });
  await phoneSlider.scrollIntoViewIfNeeded();
  await sleep(200);
  const phoneBox = await phoneSlider.boundingBox();
  const phoneBefore = Number(await phoneSlider.getAttribute('aria-valuenow'));

  // Настоящее касание, а не мышь.
  await phone.touchscreen.tap(phoneBox.x - 80, phoneBox.y + phoneBox.height / 2);
  await sleep(600);
  const phoneAfter = Number(await phoneSlider.getAttribute('aria-valuenow'));
  console.log(`  390 px, палец: ${phoneBefore}% → ${phoneAfter}%`);

  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  console.log('  390 px, горизонтальный вылет:', overflow, 'px');
  await phone.screenshot({ path: `${OUT}-390.png` });
  await phone.close();

  await browser.close();
} finally {
  server.kill();
  freePort(PORT);
}
process.exit(0);
