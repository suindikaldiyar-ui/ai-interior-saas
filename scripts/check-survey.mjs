/**
 * Прогон режима замерщика в браузере: планшет альбомный, одна рука.
 * Инструмент для глазной проверки, в приёмку не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 3181;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/survey';

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
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
  // Дверь на время приёмки снята: иначе проверка упрётся в /gate.
  env: { ...process.env, SITE_PASSWORD: '' },
});

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
  // Планшет альбомный — основной сценарий замерщика.
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));

  await page.goto(`${BASE}/measure`, { waitUntil: 'networkidle' });

  await page.getByPlaceholder('ЖК Апельсин, кв. 42').fill('ЖК Апельсин, кв. 42');
  await page.getByPlaceholder('Ержан').fill('Ержан');
  await page.getByRole('button', { name: 'К замеру' }).click();
  await sleep(800);

  const started = Date.now();

  // Высота потолка → Enter → следующий шаг.
  await page.getByLabel('Высота потолка').fill('2700');
  await page.getByLabel('Высота потолка').press('Enter');
  await page.getByRole('button', { name: 'Стены по кругу' }).click();
  await sleep(300);

  // Четыре стены по кругу.
  const lengths = ['3200', '2400', '3200', '2400'];
  for (let i = 0; i < lengths.length; i++) {
    if (i > 0) await page.getByRole('button', { name: '+ Стена' }).click();
    const fields = page.getByLabel('Длина');
    await fields.nth(i).fill(lengths[i]);
    await fields.nth(i).press('Enter');
    await sleep(150);
  }

  await page.screenshot({ path: `${OUT}-walls.png`, fullPage: false });

  // Окно на стене ряда.
  await page.getByRole('button', { name: 'Проёмы' }).click();
  await sleep(500);
  await page.screenshot({ path: `${OUT}-step-openings.png` });
  console.log(
    '  кнопок «+ Проём»:',
    await page.getByRole('button', { name: '+ Проём' }).count(),
    '· текст шага:',
    (await page.locator('[data-survey-step]').first().innerText().catch(() => '—')).slice(0, 80),
  );
  await page.getByRole('button', { name: '+ Проём' }).click();
  await sleep(400);
  await page.getByLabel('От левого угла').fill('1200');
  await page.getByLabel('Ширина').fill('1000');
  await page.getByLabel('Высота').fill('1400');
  await sleep(300);
  const seconds = Math.round((Date.now() - started) / 1000);

  await page.screenshot({ path: `${OUT}-openings.png`, fullPage: false });
  console.log(`  высота, четыре стены и окно: ${seconds} с`);

  const warnings = await page.evaluate(() =>
    Array.from(document.querySelectorAll('ul li > button'))
      .map((b) => (b.textContent ?? '').trim())
      .filter((t) => t.length > 20),
  );
  console.log(`  предупреждений на экране: ${warnings.length}`);
  warnings.slice(0, 4).forEach((w) => console.log(`    · ${w.slice(0, 90)}`));

  // Итог замера.
  await page.getByRole('button', { name: 'Замер завершён' }).click();
  await sleep(1200);
  await page.screenshot({ path: `${OUT}-sheet.png`, fullPage: true });
  console.log(
    `  замерный лист: ${(await page.getByText('Замерный лист').count()) > 0 ? 'открыт' : 'НЕ ОТКРЫЛСЯ'}`,
  );

  // Печать: замерный лист обязан лечь на A4 с местом под подписи.
  await page.emulateMedia({ media: 'print' });
  await sleep(400);
  await page.screenshot({ path: `${OUT}-print.png`, fullPage: true });
  const printText = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log(`  печать: ${printText.includes('Замерный лист') ? 'лист на странице' : 'ЛИСТА НЕТ'}`);
  console.log(
    `  подписи: ${printText.includes('Замерщик') && printText.includes('Клиент · подпись, дата') ? 'два поля' : 'НЕТ'}`,
  );
  await page.emulateMedia({ media: 'screen' });

  await browser.close();
} finally {
  server.kill();
  freePort(PORT);
}
process.exit(0);
