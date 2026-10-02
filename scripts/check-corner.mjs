/**
 * УГОЛ В БРАУЗЕРЕ — ТЕМ ЖЕ ПУТЁМ, ЧТО ЧЕЛОВЕК (слой 55).
 *
 * Приёмка `test:millwork` меряет угол движком путём экрана: владельца,
 * места рядов, пересечения, плиту, открывание, Г-модуль, хвост и смену
 * угла. Здесь — шов между движком и экраном, которого движок не видит:
 *
 *   1. демо → угловая: у угла своя кнопка с тем, что в нём стоит;
 *   2. нажатие на угловой модуль на схеме открывает панель вариантов угла —
 *      ту же панель библиотеки, что у модулей;
 *   3. каждая доступная карточка угла: нажали — угол сменился (кнопка угла
 *      называет новый выбор), модули стены А, кроме углового, стоят на тех
 *      же отметках, модули стены Б — на тех же местах в мире (расстояние до
 *      дальней стены не изменилось), итог на экране сдвинулся ровно на
 *      число с карточки;
 *   4. серая карточка называет причину числом в миллиметрах;
 *   5. снимки сцены на каждом типе угла: закрытая и «Открыть всё».
 *
 * Любое расхождение — FAIL и ненулевой код выхода. Ноль найденного —
 * FAIL с внятной строкой, а не молчаливый пропуск.
 *
 * Инструмент глазной проверки, в `verify` не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 3221;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/corner';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, { encoding: 'utf8' });
    for (const line of out.split(/\r?\n/)) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== '0') execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    }
  } catch {
    /* никто не слушает */
  }
}

let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok   ${name}${detail ? `  ${detail}` : ''}`);
  else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? `  ${detail}` : ''}`);
  }
};

/** Модули стены на схеме: ряд, отметка, ширина, вид — прямо из разметки. */
const READ_WALL = (wall) => `(() => {
  const block = document.querySelector('[data-wall-block="${wall}"]');
  if (!block) return null;
  return [...block.querySelectorAll('[data-module-id]')].map((g) => ({
    id: g.getAttribute('data-module-id'),
    row: g.getAttribute('data-move-row') || 'base',
    offset: Number(g.getAttribute('data-module-offset')),
    width: Number(g.getAttribute('data-module-width')),
  }));
})()`;

/** Длина ряда стены: подпись кнопки стены «Стена Б · 1140». */
const READ_LENGTHS = `(() => [...document.querySelectorAll('[data-wall]')].map((b) =>
  Number(((b.textContent || '').split('·')[1] || '').replace(/\\D/g, '')),
))()`;

/** Что стоит в углах — с кнопок углов. */
const READ_CORNERS = `(() => [...document.querySelectorAll('[data-corner-index]')].map((b) => ({
  index: Number(b.getAttribute('data-corner-index')),
  lower: b.getAttribute('data-corner-lower'),
  upper: b.getAttribute('data-corner-upper'),
  text: (b.textContent || '').trim(),
})))()`;

const READ_TOTAL = `(() => {
  const n = document.querySelector('[data-estimate-total]');
  return n ? Number(n.getAttribute('data-estimate-total')) : null;
})()`;

/** Панель угла: заголовок, пометка размеров и карточки. */
const READ_CORNER_PANEL = `(() => {
  const panel = document.querySelector('[data-corner-panel]');
  if (!panel) return null;
  return {
    title: (panel.querySelector('h3')?.textContent || '').trim(),
    unconfirmed: (panel.querySelector('[data-corner-unconfirmed]')?.textContent || '').trim(),
    engine: Number(panel.querySelector('[data-corner-cards]')?.getAttribute('data-corner-cards') ?? -1),
    cards: [...panel.querySelectorAll('[data-corner-card]')].map((n) => ({
      key: n.getAttribute('data-corner-card'),
      refused: n.getAttribute('data-refused') === '1',
      current: n.getAttribute('aria-pressed') === 'true',
      delta: n.getAttribute('data-delta'),
      reason: n.getAttribute('title'),
    })),
  };
})()`;

async function waitFor(page, script, test, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  let value = await page.evaluate(script);
  while (!test(value) && Date.now() < until) {
    await sleep(300);
    value = await page.evaluate(script);
  }
  return value;
}

async function toStep(page, name) {
  await page.getByRole('button', { name }).first().click({ timeout: 30_000 });
  await sleep(1500);
}

/** Сцена: закрытая и «Открыть всё» — по снимку на тип угла. */
async function snapshots(page, slug) {
  await page.evaluate(() => document.querySelector('[data-schematic-tab="scene"]')?.click());
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await sleep(3500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((n) => /Общий вид/.test((n.textContent || '').trim()));
    b?.click();
  });
  await sleep(2500);
  const canvas = await page.$('canvas');
  if (canvas) await canvas.screenshot({ path: `${OUT}/${slug}-closed.png` });
  const opened = await page.evaluate(() => {
    const b = document.querySelector('[data-open-all]');
    if (!b) return false;
    b.click();
    return true;
  });
  await sleep(3500);
  if (canvas) await canvas.screenshot({ path: `${OUT}/${slug}-open.png` });
  await page.evaluate(() => document.querySelector('[data-close-all]')?.click());
  await sleep(1500);
  await page.evaluate(() => document.querySelector('[data-schematic-tab="front"]')?.click());
  await sleep(1500);
  check(`снимки сцены «${slug}»: закрытая и «Открыть всё»`, Boolean(canvas) && opened, canvas ? `${OUT}/${slug}-*.png` : 'КАНВАСА НЕТ');
}

/** Отметки, которые обязаны остаться: у стены А — всё, кроме углового; у Б — расстояние до дальней стены. */
function keptSpots(wallA, wallB, lengthA, lengthB) {
  const cornerA = (m) =>
    /^corner_/.test(m.id.split('@')[0]) ||
    (m.row === 'base' && m.offset + m.width >= lengthA - 0.5) ||
    (m.row === 'upper' && m.offset + m.width >= lengthA - 421);
  return {
    a: wallA.filter((m) => !cornerA(m)).map((m) => `${m.row}:${m.offset}+${m.width}`).sort(),
    b: wallB.map((m) => `${m.row}:${lengthB - m.offset}-${m.width}`).sort(),
  };
}

freePort(PORT);
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
  env: { ...process.env, SITE_PASSWORD: '' },
});

try {
  for (let i = 0; i < 120; i++) {
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log('  [ошибка страницы]', e.message.slice(0, 160)));

  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(3500);
  await page.getByRole('button', { name: /Раскладка/ }).first().click({ timeout: 90_000 });
  await sleep(1200);

  /* ── 1. Угловая: у угла своя кнопка ── */
  await toStep(page, /Размеры/);
  const switched = await page.evaluate(() => {
    const b = document.querySelector('[data-shape-kind="corner_l"]');
    if (!b) return false;
    b.click();
    return true;
  });
  if (!switched) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: кнопки формы «угловая» нет');
  await sleep(2500);
  const corners0 = await waitFor(page, READ_CORNERS, (list) => list.length > 0);
  check(
    'у угловой кухни одна кнопка угла с тем, что в нём стоит',
    corners0.length === 1 && Boolean(corners0[0].lower) && Boolean(corners0[0].upper),
    corners0[0] ? `«${corners0[0].text}»` : 'КНОПКИ УГЛА НЕТ',
  );
  if (corners0.length === 0) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: кнопки угла нет');

  await toStep(page, /Раскладка/);
  await page.evaluate(() => document.querySelector('[data-schematic-tab="front"]')?.click());
  await sleep(1500);

  /* ── 2. Нажатие на угловой модуль открывает панель угла ── */
  const lengths0 = await page.evaluate(READ_LENGTHS);
  const wallA0 = await page.evaluate(READ_WALL(0));
  if (!wallA0 || wallA0.length === 0) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: модулей стены А на схеме нет');
  const cornerUnit = wallA0
    .filter((m) => m.row === 'base' && m.offset + m.width >= lengths0[0] - 0.5)
    .sort((x, y) => y.offset - x.offset)[0];
  if (!cornerUnit) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: у стены А нет модуля в углу · длина ${lengths0[0]}`);
  await page.evaluate((id) => {
    const block = document.querySelector('[data-wall-block="0"]');
    const g = [...(block?.querySelectorAll('[data-module-id]') ?? [])].find((n) => n.getAttribute('data-module-id') === id);
    g?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, cornerUnit.id);
  const panel0 = await waitFor(page, READ_CORNER_PANEL, (p) => p && p.cards.length > 0);
  check(
    'нажатие на угловой модуль открывает панель угла в библиотеке',
    Boolean(panel0) && panel0.cards.length > 0 && panel0.engine === panel0.cards.length,
    panel0 ? `«${panel0.title}» · карточек ${panel0.cards.length}` : `ПАНЕЛИ НЕТ · модуль ${cornerUnit.id}`,
  );
  if (!panel0) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: панель угла не открылась');
  check(
    'размеры угла названы типовыми — «не подтверждено цехом»',
    /не подтверждено цехом/.test(panel0.unconfirmed),
    panel0.unconfirmed || 'ПОМЕТКИ НЕТ',
  );
  await page.screenshot({ path: `${OUT}/panel.png` });
  await snapshots(page, `${corners0[0].lower}-${corners0[0].upper}`);

  /* ── 3, 4. Каждая карточка угла ── */
  let changes = 0;
  let refusals = 0;
  const seen = new Set([`${corners0[0].lower}-${corners0[0].upper}`]);
  const done = new Set();
  for (let round = 0; round < 8; round += 1) {
    const panel = await waitFor(page, READ_CORNER_PANEL, (p) => p && p.cards.length > 0);
    if (!panel) {
      check('панель угла остаётся открытой после смены', false, 'ПАНЕЛИ НЕТ');
      break;
    }
    for (const card of panel.cards.filter((c) => c.refused)) {
      refusals += 1;
      check(`серая карточка ${card.key} называет причину числом`, /\d+ мм/.test(card.reason || ''), `«${card.reason}»`);
    }
    const corner = (await page.evaluate(READ_CORNERS))[0];
    const from = `${corner.lower}-${corner.upper}`;
    /* Сначала — угол, которого ещё не было; потом — обратный переход, которого ещё не делали. */
    const next =
      panel.cards.find((c) => !c.refused && !c.current && !seen.has(nextKey(corner, c.key))) ??
      panel.cards.find((c) => !c.refused && !c.current && !done.has(`${from}>${nextKey(corner, c.key)}`));
    if (!next) break;
    done.add(`${from}>${nextKey(corner, next.key)}`);

    /* Цена карточки считается, когда её видно. */
    await page.evaluate((key) => document.querySelector(`[data-corner-card="${key}"]`)?.scrollIntoView({ block: 'center' }), next.key);
    const priced = await waitFor(
      page,
      READ_CORNER_PANEL,
      (p) => p && p.cards.some((c) => c.key === next.key && c.delta !== '' && c.delta !== null),
      30_000,
    );
    const delta = Number(priced?.cards.find((c) => c.key === next.key)?.delta);

    const lengthsBefore = await page.evaluate(READ_LENGTHS);
    const aBefore = await page.evaluate(READ_WALL(0));
    const bBefore = await page.evaluate(READ_WALL(1));
    const totalBefore = await page.evaluate(READ_TOTAL);
    await page.evaluate((key) => document.querySelector(`[data-corner-card="${key}"]`)?.click(), next.key);
    const after = await waitFor(
      page,
      READ_CORNERS,
      (list) => list[0] && `${list[0].lower}-${list[0].upper}` === nextKey(corner, next.key),
    );
    await sleep(1500);
    const lengthsAfter = await page.evaluate(READ_LENGTHS);
    const aAfter = await page.evaluate(READ_WALL(0));
    const bAfter = await page.evaluate(READ_WALL(1));
    const totalAfter = await waitFor(page, READ_TOTAL, (t) => t !== totalBefore, 10_000);

    const label = `${corner.lower}/${corner.upper} → ${next.key}`;
    const changed = after[0] && `${after[0].lower}-${after[0].upper}` === nextKey(corner, next.key);
    check(`${label}: угол сменился — кнопка угла называет новый выбор`, Boolean(changed), after[0] ? `«${after[0].text}»` : 'КНОПКИ НЕТ');
    const keepBefore = keptSpots(aBefore, bBefore, lengthsBefore[0], lengthsBefore[1]);
    const keepAfter = keptSpots(aAfter, bAfter, lengthsAfter[0], lengthsAfter[1]);
    const movedA = keepBefore.a.filter((spot) => !keepAfter.a.includes(spot));
    const movedB = keepBefore.b.filter((spot) => !keepAfter.b.includes(spot));
    check(
      `${label}: остальные модули стоят, где стояли`,
      movedA.length === 0 && movedB.length === 0 && keepBefore.a.length > 0 && keepBefore.b.length > 0,
      `стена А ${keepBefore.a.length} модулей, сдвинулось ${movedA.length}${movedA[0] ? ` (${movedA[0]})` : ''} · ` +
        `стена Б ${keepBefore.b.length}, сдвинулось ${movedB.length}${movedB[0] ? ` (${movedB[0]})` : ''} · ` +
        `ряд Б ${lengthsBefore[1]} → ${lengthsAfter[1]} мм`,
    );
    check(
      `${label}: итог на экране сдвинулся ровно на число с карточки`,
      Number.isFinite(delta) && totalAfter !== null && totalBefore !== null && totalAfter - totalBefore === delta,
      `${totalBefore} → ${totalAfter} ₸ (${totalAfter - totalBefore}) при карточке ${delta}`,
    );
    console.log(`  стена А до:    ${aBefore.map((m) => `${m.row[0]}${m.offset}+${m.width}`).join(' ')}`);
    console.log(`  стена А после: ${aAfter.map((m) => `${m.row[0]}${m.offset}+${m.width}`).join(' ')}`);
    console.log(`  стена Б до:    ${bBefore.map((m) => `${m.row[0]}${m.offset}+${m.width}`).join(' ')}`);
    console.log(`  стена Б после: ${bAfter.map((m) => `${m.row[0]}${m.offset}+${m.width}`).join(' ')}`);
    changes += 1;
    const slug = `${after[0].lower}-${after[0].upper}`;
    seen.add(slug);
    await snapshots(page, slug);

    /* Панель угла снова: модуль в углу мог смениться — нажимаем кнопку угла. */
    await toStep(page, /Размеры/);
    await page.evaluate(() => document.querySelector('[data-corner-index="0"]')?.click());
    await sleep(800);
    await toStep(page, /Раскладка/);
    await page.evaluate(() => document.querySelector('[data-schematic-tab="front"]')?.click());
    await sleep(1200);
  }

  check('смен угла в браузере больше нуля', changes > 0, `смен ${changes}, серых карточек ${refusals}`);

  await browser.close();
  console.log(`\n  снимки: ${OUT}`);
} finally {
  server.kill();
  freePort(PORT);
}

console.log(`\n${failed === 0 ? 'всё сошлось' : `расхождений: ${failed}`}\n`);
process.exit(failed === 0 ? 0 : 1);

/** Выбор угла после карточки: «низ:вид» меняет низ, «верх:вид» — верх. */
function nextKey(corner, key) {
  const [level, kind] = key.split(':');
  return level === 'lower' ? `${kind}-${corner.upper}` : `${corner.lower}-${kind}`;
}
