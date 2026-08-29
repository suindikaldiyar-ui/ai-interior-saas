/**
 * Снимки новых экранов слоя 5 для глазной проверки.
 * Не входит в приёмку: это инструмент, а не тест.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 3151;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/accounts';

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
  // Дверь на время приёмки снята: иначе проверка упрётся в /gate.
  env: { ...process.env, SITE_PASSWORD: '' },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; i < 45; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      /* ещё поднимается */
    }
    await sleep(1000);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  for (const [name, path] of [
    ['login', '/login'],
    ['measure', '/measure'],
    ['projects', '/projects'],
    ['team', '/admin/team'],
    ['catalog', '/admin/catalog'],
  ]) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await sleep(600);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log(`  ${name.padEnd(9)} ${res?.status()}  ${page.url().replace(BASE, '')}`);
  }

  if (errors.length) console.log('  ошибки страниц:', errors);
  await browser.close();
} finally {
  server.kill();
  freePort(PORT);
}
process.exit(0);
