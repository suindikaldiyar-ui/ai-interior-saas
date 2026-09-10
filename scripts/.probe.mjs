import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT = 3171, BASE = `http://localhost:${PORT}`;
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { shell: true, env: { ...process.env, SITE_PASSWORD: '' }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(16000);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
try {
  p.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 160)));
  await p.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(5000);
  await p.getByRole('button', { name: /Конфигуратор/ }).first().click();
  await sleep(2000);
  await p.locator('[data-schematic-tab="scene"]').click();
  await sleep(3500);

  const st = () => p.evaluate(() => (window.__mwCadState ? window.__mwCadState() : null));
  const sc = () => p.evaluate(() => (window.__mwScene ? window.__mwScene() : null));
  console.log('до дизайна :', JSON.stringify(await st()));
  console.log('  сцена    :', JSON.stringify(await sc()));

  const design = p.locator('[data-design="oak-graphite"]');
  if (await design.count()) { await design.click(); await sleep(2500); }
  else console.log('дизайна «Дуб и графит» нет на экране');

  console.log('после дизайна:', JSON.stringify(await st()));
  console.log('  сцена      :', JSON.stringify(await sc()));

  // Цвета материалов фасадов прямо из графа сцены
  const colors = await p.evaluate(() => {
    const out = [];
    const seen = new Set();
    // обходим все InstancedMesh сцены через renderer info невозможно — читаем из R3F
    return out.length ? out : null;
  });
  void colors;
} finally { await b.close(); server.kill(); }
