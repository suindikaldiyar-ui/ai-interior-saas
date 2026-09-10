/**
 * СКОЛЬКО КАДРОВ РИСУЕТ ВИДИМАЯ СЦЕНА — ЧИСЛОМ, А НЕ «БЫСТРО».
 *
 * Запуск: node scripts/check-cad-frames.mjs   (нужен build)
 *
 * Сцену однажды убрали из интерфейса за тормоза, и вернулась она под
 * жёсткое требование: ноль кадров в покое и перерисовки только на
 * действия. Проверять это словами нельзя — «быстро» не измерение,
 * поэтому здесь минута НАСТОЯЩЕЙ работы: ракурсы, открывание, клики по
 * мебели, перебор материалов и вращение свободного вида.
 *
 * Счётчик берётся у видимой сцены (`__mwCadFrames`): общий затирает
 * скрытая сцена для clay-кадра, она регистрирует свой последней.
 *
 * В приёмку не входит: минута прогона на каждый `npm run verify` — это
 * минута на каждый прогон. Ноль в покое проверяет `test:demo`.
 */
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';

const PORT = 3141;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${PORT}`, { encoding: 'utf8' });
  for (const pid of new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter((p) => /^\d+$/.test(p) && p !== '0'))) {
    execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
  }
} catch {}

const server = spawn('npx.cmd', ['next', 'start', '-p', String(PORT)], {
  cwd: 'C:/projects/ai-interior-saas', stdio: 'ignore', shell: true,
  env: { ...process.env, SITE_PASSWORD: '' },
});

const until = async (fn, ms = 90_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await sleep(300); }
  return false;
};

let browser;
try {
  await until(async () => { try { return (await fetch(BASE)).ok; } catch { return false; } });
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await until(async () => (await page.getByRole('button', { name: /Конфигуратор/ }).count()) > 0);
  await page.getByRole('button', { name: /Конфигуратор/ }).first().click();
  await sleep(2500);
  await page.locator('[data-schematic-tab="scene"]').click();
  await sleep(3500);

  const frames = () => page.evaluate(() => (window.__mwCadFrames ? window.__mwCadFrames() : -1));
  const box = await page.evaluate(() => {
    const c = document.querySelector('[data-scene] canvas');
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });

  /* Покой: сцену никто не трогает. */
  const idle0 = await frames();
  await sleep(10_000);
  const idle1 = await frames();
  console.log(`покой: ${idle1 - idle0} кадров за 10 с`);

  /* Минута работы: ракурсы, открывание, клики, материалы, вращение. */
  const start = Date.now();
  const from = await frames();
  let actions = 0;
  const angles = ['elevation', 'left', 'right', 'plan', 'free'];

  while (Date.now() - start < 60_000) {
    for (const a of angles) {
      if (Date.now() - start >= 60_000) break;
      await page.locator(`[data-angle="${a}"]`).click(); actions++;
      await sleep(600);
    }
    if (Date.now() - start >= 60_000) break;
    await page.locator('[data-open-all]').click(); actions++;
    await sleep(1200);
    await page.locator('[data-close-all]').click(); actions++;
    await sleep(1200);

    await page.mouse.click(box.x + box.w * 0.4, box.y + box.h * 0.55); actions++;
    await sleep(500);
    const sw = page.locator('[data-swatch]');
    const n = await sw.count();
    if (n > 1) { await sw.nth(actions % n).click(); actions++; await sleep(900); }

    /* Вращение свободного ракурса — самая частая трата кадров. */
    await page.locator('[data-angle="free"]').click(); actions++;
    await page.mouse.move(box.x + box.w * 0.5, box.y + box.h * 0.5);
    await page.mouse.down();
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(box.x + box.w * (0.5 + i * 0.02), box.y + box.h * 0.5);
      await sleep(40);
    }
    await page.mouse.up(); actions++;
    await sleep(800);
  }

  const to = await frames();
  console.log(`минута работы: ${to - from} кадров, ${actions} действий`);

  const scene = await page.evaluate(() => (window.__mwScene ? window.__mwScene() : null));
  console.log(`объекты: вызовов ${scene.calls}, мешей ${scene.scene.meshes}, треугольников ${scene.triangles}`);
} finally {
  await browser?.close();
  server.kill();
  try { execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' }); } catch {}
}
