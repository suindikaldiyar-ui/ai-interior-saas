/**
 * Сколько раз перерисовывается блок сравнения за три секунды движения мыши.
 * Инструмент замера, в приёмку не входит: считает `window.__baRenders`,
 * который BeforeAfter увеличивает на каждом рендере во время проверки.
 */
import { execSync, spawn } from 'node:child_process';
import { chromium } from 'playwright';
import sharp from 'sharp';

const PORT = 3201;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
  // Дверь на время приёмки снята: иначе проверка упрётся в /gate.
  env: { ...process.env, SITE_PASSWORD: '' },
});

const photo = await sharp({
  create: { width: 900, height: 600, channels: 3, background: '#6b7280' },
})
  .jpeg()
  .toBuffer();

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
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });

  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await sleep(700);
  await page.getByRole('button', { name: /Материалы/ }).click();
  await sleep(400);
  await page
    .locator('input[type=file][accept="image/*"]')
    .first()
    .setInputFiles({ name: 'room.jpg', mimeType: 'image/jpeg', buffer: photo });
  await sleep(1000);
  await page.getByRole('button', { name: /Результат/ }).click();
  await sleep(500);
  await page.getByRole('button', { name: 'Рендер', exact: true }).click();
  await sleep(900);

  const slider = page.getByRole('slider', { name: 'Сравнение до и после' });
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();

  // Скрытый канвас: ловит ли он указатель вообще.
  const canvasState = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return 'канваса нет';

    const chain = [];
    let node = canvas;
    for (let i = 0; i < 4 && node; i++) {
      chain.push({
        tag: node.tagName,
        cls: (node.className || '').toString().slice(0, 70),
        pe: getComputedStyle(node).pointerEvents,
      });
      node = node.parentElement;
    }
    return { x: Math.round(canvas.getBoundingClientRect().x), chain };
  });
  console.log('  скрытый канвас:', JSON.stringify(canvasState));

  /* ── Три секунды движения мыши БЕЗ нажатия ── */
  await page.evaluate(() => {
    window.__baCount = true;
    window.__baRenders = 0;
  });

  const hoverEnd = Date.now() + 3000;
  let moves = 0;
  while (Date.now() < hoverEnd) {
    for (let x = box.x - 200; x < box.x + 200; x += 40) {
      await page.mouse.move(x, box.y + box.height / 2);
      moves++;
      if (Date.now() > hoverEnd) break;
    }
  }
  const hoverRenders = await page.evaluate(() => window.__baRenders);
  console.log(
    `  движение мыши без нажатия (${moves} движений за 3 с): ${hoverRenders} рендеров BeforeAfter`,
  );

  /* ── Три секунды перетаскивания шторки ── */
  await page.evaluate(() => {
    window.__baCount = true;
    window.__baRenders = 0;
  });

  // Кадры страницы во время перетаскивания: если их ~60/с, тормозит не React.
  await page.evaluate(() => {
    window.__frames = 0;
    const tick = () => {
      window.__frames += 1;
      window.__frameLoop = requestAnimationFrame(tick);
    };
    window.__frameLoop = requestAnimationFrame(tick);
  });

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const dragEnd = Date.now() + 3000;
  let drags = 0;
  while (Date.now() < dragEnd) {
    for (let x = box.x - 200; x < box.x + 200; x += 20) {
      await page.mouse.move(x, box.y + box.height / 2);
      drags++;
      if (Date.now() > dragEnd) break;
    }
  }
  await page.mouse.up();
  await sleep(200);
  const dragRenders = await page.evaluate(() => window.__baRenders);
  const fps = await page.evaluate(() => {
    cancelAnimationFrame(window.__frameLoop);
    return Math.round(window.__frames / 3);
  });
  console.log(`  кадров в секунду во время перетаскивания: ${fps}`);
  console.log(
    `  перетаскивание шторки (${drags} движений за 3 с): ${dragRenders} рендеров BeforeAfter`,
  );

  await browser.close();
} finally {
  server.kill();
  freePort(PORT);
}
process.exit(0);
