/**
 * Что именно перекрашивается при движении мыши.
 *
 * Считает не рендеры React, а работу браузера: пересчёт стилей, раскладку,
 * отрисовку и композит — по трассе devtools.timeline. Для каждой отрисовки
 * достаёт узел и площадь, поэтому виновника видно поимённо.
 *
 * Запуск: node scripts/check-paint.mjs   (нужен build)
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import sharp from 'sharp';

const PORT = 3203;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/paint';
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

/** Трасса за время работы `action`, разобранная по типам событий. */
async function trace(page, action) {
  const client = await page.context().newCDPSession(page);
  await client.send('DOM.enable');
  await client.send('Performance.enable');
  const before = await client.send('Performance.getMetrics');

  const chunks = [];
  client.on('Tracing.dataCollected', ({ value }) => chunks.push(...value));

  await client.send('Tracing.start', {
    categories:
      'devtools.timeline,disabled-by-default-devtools.timeline,' +
      'disabled-by-default-devtools.timeline.invalidationTracking',
    transferMode: 'ReportEvents',
  });

  await action();

  const done = new Promise((resolve) => client.once('Tracing.tracingComplete', resolve));
  await client.send('Tracing.end');
  await done;

  const after = await client.send('Performance.getMetrics');
  const pick = (list, name) => list.metrics.find((m) => m.name === name)?.value ?? 0;
  const cpuMs = Math.round((pick(after, 'TaskDuration') - pick(before, 'TaskDuration')) * 1000);
  const recalc = pick(after, 'RecalcStyleCount') - pick(before, 'RecalcStyleCount');

  const counts = {
    ВСЕГО_СОБЫТИЙ: chunks.length,
    РАБОТА_ПОТОКА_МС: cpuMs,
    ПЕРЕСЧЁТ_СТИЛЕЙ: recalc,
  };
  const paints = [];
  /* Кто именно велел перерисовать: узел и причина инвалидации. */
  const reasons = new Map();

  for (const event of chunks) {
    if (
      event.name !== 'PaintInvalidationTracking' &&
      event.name !== 'StyleInvalidatorInvalidationTracking' &&
      event.name !== 'LayoutInvalidationTracking'
    ) {
      continue;
    }
    const d = event.args?.data ?? {};
    const key = [
      event.name.replace('Tracking', ''),
      d.nodeName ?? d.nodeId ?? '?',
      d.reason ?? d.invalidatedSelectorId ?? d.extraData ?? '',
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 110);
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }

  for (const event of chunks) {
    const name = event.name;
    if (
      ![
        'UpdateLayoutTree',
        'Layout',
        'Paint',
        'PaintImage',
        'CompositeLayers',
        'UpdateLayerTree',
      ].includes(name)
    ) {
      continue;
    }
    counts[name] = (counts[name] ?? 0) + 1;

    if (name === 'Paint' && event.args?.data) {
      paints.push({
        nodeId: event.args.data.nodeId,
        clip: event.args.data.clip,
      });
    }
  }

  // Узлы отрисовки — поимённо: именно их и видно как «мигание».
  const byNode = new Map();
  for (const paint of paints) {
    if (!paint.nodeId) continue;
    const entry = byNode.get(paint.nodeId) ?? { count: 0, area: 0 };
    entry.count += 1;
    if (Array.isArray(paint.clip) && paint.clip.length >= 6) {
      const w = Math.abs(paint.clip[2] - paint.clip[0]);
      const h = Math.abs(paint.clip[5] - paint.clip[1]);
      entry.area = Math.max(entry.area, Math.round(w * h));
    }
    byNode.set(paint.nodeId, entry);
  }

  const described = [];
  for (const [nodeId, entry] of [...byNode.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)) {
    let label = `узел ${nodeId}`;
    try {
      const { node } = await client.send('DOM.describeNode', { backendNodeId: nodeId });
      const attrs = node.attributes ?? [];
      const cls = attrs[attrs.indexOf('class') + 1] ?? '';
      label = `${node.nodeName.toLowerCase()}${cls ? `.${cls.split(' ').slice(0, 3).join('.')}` : ''}`;
    } catch {
      /* узел уже мог исчезнуть */
    }
    described.push(`${label} — ${entry.count} отрисовок, до ${entry.area} px²`);
  }

  // Распределение площадей: одна большая отрисовка при загрузке — это норма,
  // а вот поток крупных при движении мыши — это и есть мерцание.
  const areas = paints
    .map((p) => {
      const c = p.clip;
      if (!Array.isArray(c) || c.length < 6) return 0;
      return Math.round(Math.abs(c[2] - c[0]) * Math.abs(c[5] - c[1]));
    })
    .filter((a) => a > 0)
    .sort((a, b) => b - a);

  counts.ОТРИСОВКИ_ПЛОЩАДЬ = areas.length
    ? `максимум ${areas[0]} px², медиана ${areas[Math.floor(areas.length / 2)]} px², крупнее 100000 px²: ${areas.filter((a) => a > 100000).length}`
    : 'нет';

  const topReasons = [...reasons.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, n]) => `${n}× ${key}`);

  await client.detach();
  return { counts, described, topReasons };
}

/** Три секунды движения мыши поперёк экрана. */
async function moveMouse(page, y, seconds = 3) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    for (let x = 120; x < 1100; x += 40) {
      await page.mouse.move(x, y);
      if (Date.now() > end) break;
    }
  }
}

/** Куда попадает указатель на этой высоте — чтобы не гадать, что под ним. */
async function whatIsAt(page, y) {
  return page.evaluate((yy) => {
    const seen = new Set();
    for (let x = 120; x < 1100; x += 40) {
      const el = document.elementFromPoint(x, yy);
      if (!el) continue;
      const tag = el.tagName.toLowerCase();
      const cls = (el.className || '').toString().split(' ').slice(0, 2).join('.');
      seen.add(cls ? `${tag}.${cls}` : tag);
    }
    return Array.from(seen).slice(0, 5).join(' | ');
  }, y);
}

async function paintFlash(page, file) {
  const client = await page.context().newCDPSession(page);
  await client.send('DOM.enable');
  await client.send('Overlay.enable');
  await client.send('Overlay.setShowPaintRects', { result: true });
  await page.mouse.move(300, 400);
  await page.mouse.move(700, 420);
  await sleep(150);
  await page.screenshot({ path: file });
  await client.send('Overlay.setShowPaintRects', { result: false });
  await client.detach();
}

/** Подозреваемые из вопроса: backdrop-filter, тени, transition на раскладке. */
async function audit(page) {
  return page.evaluate(() => {
    const heavy = { backdrop: [], shadow: [], layoutTransition: [], bigHover: [] };

    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const id = `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`;

      if (cs.backdropFilter && cs.backdropFilter !== 'none') {
        heavy.backdrop.push(`${id} — ${cs.backdropFilter}`);
      }

      const blur = Number((cs.boxShadow.match(/(\d+)px/g) ?? ['0px'])[2]?.replace('px', '') ?? 0);
      if (cs.boxShadow !== 'none' && blur >= 12 && box.width * box.height > 120000) {
        heavy.shadow.push(`${id} — ${cs.boxShadow.slice(0, 60)} на ${Math.round(box.width)}×${Math.round(box.height)}`);
      }

      const props = cs.transitionProperty;
      if (/width|height|top|left|margin|padding|all/.test(props) && props !== 'none') {
        heavy.layoutTransition.push(`${id} — transition: ${props}`);
      }
    }

    // :hover на крупных контейнерах — из самих правил таблицы стилей.
    for (const sheet of Array.from(document.styleSheets)) {
      let rules = [];
      try {
        rules = Array.from(sheet.cssRules ?? []);
      } catch {
        continue;
      }
      for (const rule of rules) {
        const selector = rule.selectorText;
        if (!selector || !selector.includes(':hover')) continue;
        for (const el of Array.from(document.querySelectorAll(selector.replace(/:hover/g, '')))) {
          const box = el.getBoundingClientRect();
          if (box.width * box.height > 200000) {
            heavy.bigHover.push(
              `${selector.slice(0, 50)} → ${Math.round(box.width)}×${Math.round(box.height)}`,
            );
          }
        }
      }
    }

    const uniq = (list) => Array.from(new Set(list)).slice(0, 6);
    return {
      backdrop: uniq(heavy.backdrop),
      shadow: uniq(heavy.shadow),
      layoutTransition: uniq(heavy.layoutTransition),
      bigHover: uniq(heavy.bigHover),
    };
  });
}

freePort(PORT);
mkdirSync('.capture-check', { recursive: true });

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

const label = process.env.LABEL ?? 'до';

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

  /* ── 1. /login: ни канваса, ни шторки ── */
  const login = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  await login.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await sleep(500);
  for (const y of [400, 560]) {
    const under = await whatIsAt(login, y);
    const t = await trace(login, () => moveMouse(login, y));
    console.log('');
    console.log(`/login, y=${y} (${label}):`, JSON.stringify(t.counts));
    console.log('    под курсором:', under);
    t.described.forEach((d) => console.log('   ', d));
    t.topReasons.forEach((r) => console.log('    причина:', r));
  }

  await paintFlash(login, `${OUT}-login-${label}.png`);
  await login.close();

  /* ── 2. /demo, шаг «Состав» ── */
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await sleep(800);

  const withTransition = await page.addStyleTag({
    content: '.mw-btn { transition: background-color 0.12s ease, border-color 0.12s ease; }',
  });
  const ab = await trace(page, () => moveMouse(page, 300));
  console.log('');
  console.log('/demo · состав, y=300 С переходом на кнопках:', JSON.stringify(ab.counts));
  await withTransition.evaluate((node) => node.remove());

  const contained = await page.addStyleTag({
    content: '.mw-btn, .mw-panel-flat { contain: paint; }',
  });
  const abContain = await trace(page, () => moveMouse(page, 300));
  console.log('');
  console.log('/demo · состав, y=300 С contain:paint:', JSON.stringify(abContain.counts));
  await contained.evaluate((node) => node.remove());

  for (const y of [300, 640]) {
    const under = await whatIsAt(page, y);
    const t = await trace(page, () => moveMouse(page, y));
    console.log('');
    console.log(`/demo · состав, y=${y} (${label}):`, JSON.stringify(t.counts));
    console.log('    под курсором:', under);
    t.described.forEach((d) => console.log('   ', d));
    t.topReasons.forEach((r) => console.log('    причина:', r));
  }

  /* ── 3. /demo, шаг «Результат» с рендером и шторкой ── */
  await page.getByRole('button', { name: /Материалы/ }).click();
  await sleep(400);
  await page
    .locator('input[type=file][accept="image/*"]')
    .first()
    .setInputFiles({ name: 'room.jpg', mimeType: 'image/jpeg', buffer: photo });
  await sleep(900);
  await page.getByRole('button', { name: /Результат/ }).click();
  await sleep(500);
  await page.getByRole('button', { name: 'Рендер', exact: true }).click();
  await sleep(900);

  const resultTrace = await trace(page, () => moveMouse(page, 520));
  console.log(`\n/demo · результат (${label}):`, JSON.stringify(resultTrace.counts));
  resultTrace.described.forEach((d) => console.log('   ', d));
  resultTrace.topReasons.forEach((r) => console.log('    причина:', r));

  await paintFlash(page, `${OUT}-result-${label}.png`);

  const suspects = await audit(page);
  console.log(`\nподозреваемые (${label}):`);
  for (const [key, list] of Object.entries(suspects)) {
    console.log(`  ${key}: ${list.length ? list.join(' | ') : 'нет'}`);
  }

  await page.close();
  await browser.close();
} finally {
  server.kill();
  freePort(PORT);
}
process.exit(0);
