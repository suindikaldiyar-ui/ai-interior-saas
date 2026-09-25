/**
 * БИБЛИОТЕКА МОДУЛЕЙ — В БРАУЗЕРЕ, ТЕМ ЖЕ ПУТЁМ, ЧТО ЭКРАН.
 *
 * Приёмка `test:millwork` меряет движок: карточки, отказы, разницу смет.
 * Но цену на экране считает рабочее место со СВОИМИ восемью аргументами
 * сметы (снятые галочки, школа цеха, фрезеровка, декоры), и разойтись с
 * карточкой она может только здесь — в шве между движком и экраном.
 * Поэтому цена сверяется по итогу, который ВИДИТ человек.
 *
 * Сценарий:
 *   1. демо по готовому решению: выбрали модуль → панель → N карточек,
 *      где N отдаёт движок, а не константа в этом файле;
 *   2. нажали доступную карточку → вид модуля сменился, модулей
 *      столько же, соседи на месте в миллиметрах, итог на экране
 *      сдвинулся РОВНО на число с карточки;
 *   3. «Собрать самому» → пустая стена → «Дальше» заперто и сказано
 *      почему → нажали на пустоту → поставили модуль → «Дальше» открыто.
 *
 * Любое расхождение — FAIL и ненулевой код выхода. Снимки: панель
 * открыта, до и после замены.
 *
 * Инструмент глазной проверки, в `verify` не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 3224;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/library';
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
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
  env: { ...process.env, SITE_PASSWORD: '' },
});

let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok   ${name}${detail ? `  ${detail}` : ''}`);
  else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? `  ${detail}` : ''}`);
  }
};

/** Нижний ряд активной стены — прямо из разметки схемы. */
const READ_BASE = `(() => {
  const scope =
    document.querySelector('[data-wall-block][aria-current="true"]') || document;
  return [...scope.querySelectorAll('[data-module-id]')]
    .filter((g) => (g.getAttribute('data-move-row') || 'base') === 'base')
    .map((g) => ({
      id: g.getAttribute('data-module-id'),
      offset: Number(g.getAttribute('data-module-offset')),
      width: Number(g.getAttribute('data-module-width')),
      variant: g.getAttribute('data-module-variant'),
    }))
    .sort((a, b) => a.offset - b.offset);
})()`;

/** Итог сметы на экране — числом, как его видит человек. */
const READ_TOTAL = `(() => {
  const n = document.querySelector('[data-estimate-total]');
  return n ? Number(n.getAttribute('data-estimate-total')) : null;
})()`;

/** Панель библиотеки: сколько карточек отдал движок и что нарисовано. */
const READ_PANEL = `(() => {
  const panel = document.querySelector('[data-library="1"]');
  if (!panel) return null;
  const grid = panel.querySelector('[data-library-cards]');
  const cards = [...panel.querySelectorAll('[data-card]')].map((n) => ({
    key: n.getAttribute('data-card'),
    variant: n.getAttribute('data-variant'),
    width: Number(n.getAttribute('data-width')),
    refused: n.getAttribute('data-refused') === '1',
    current: n.getAttribute('aria-pressed') === 'true',
    delta: n.getAttribute('data-delta'),
    disabled: n.disabled,
    picture: Boolean(n.querySelector('img[src^="data:image/png"]')),
    reason: n.getAttribute('title'),
  }));
  return {
    engine: grid ? Number(grid.getAttribute('data-library-cards')) : null,
    cards,
  };
})()`;

const spots = (row, skip) =>
  row
    .filter((m) => m.offset !== skip)
    .map((m) => `${m.offset}:${m.width}`)
    .join(' ');

async function waitFor(page, script, test, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  let value = await page.evaluate(script);
  while (!test(value) && Date.now() < until) {
    await sleep(300);
    value = await page.evaluate(script);
  }
  return value;
}

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
  await page.evaluate(() => document.querySelector('[data-schematic-tab="front"]')?.click());
  await sleep(1500);

  /* ───────────── 1. Выбор модуля открывает панель ───────────── */
  console.log('\n  ── демо по готовому решению: замена модуля');

  const row0 = await page.evaluate(READ_BASE);
  /*
   * ОБЫЧНЫЙ модуль: у приборного библиотеки нет вовсе (её место
   * отвечает словами). Идентификатор без прибора в хвосте — это он.
   */
  const target = row0.find((m) => /^base-\d+$/.test(m.id.split('@')[0]));
  if (!target) {
    throw new Error(
      `НУЛЕВОЙ СЕЛЕКТОР: в нижнем ряду нет обычного модуля · ${row0.map((m) => m.id).join(' ')}`,
    );
  }
  console.log(`  выбираем: ${target.id} (${target.offset}:${target.width}, ${target.variant})`);
  const canvasesBefore = await page.evaluate(() => document.querySelectorAll('canvas').length);

  await page.evaluate((id) => {
    const scope =
      document.querySelector('[data-wall-block][aria-current="true"]') || document;
    const g = [...scope.querySelectorAll('[data-module-id]')].find(
      (n) => n.getAttribute('data-module-id') === id,
    );
    g?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, target.id);

  const opened = await waitFor(page, READ_PANEL, (p) => p && p.cards.length > 0);
  if (!opened) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: панель библиотеки не открылась после выбора модуля');

  check(
    'выбор модуля открыл панель библиотеки',
    opened.cards.length > 0,
    `карточек на экране ${opened.cards.length}`,
  );
  /*
   * N ОТДАЁТ ДВИЖОК. Число в этом файле не записано: панель обязана
   * показать ровно столько, сколько вернул `libraryCards`, — ни одна
   * не потерялась по дороге к экрану.
   */
  check(
    'на экране столько карточек, сколько отдал движок',
    opened.engine !== null && opened.engine === opened.cards.length && opened.engine > 0,
    `движок ${opened.engine} · на экране ${opened.cards.length}`,
  );
  check(
    'текущая карточка отмечена и стоит первой',
    opened.cards[0]?.current === true && opened.cards.filter((c) => c.current).length === 1,
    opened.cards[0] ? `${opened.cards[0].key}` : '—',
  );
  check(
    'серые карточки не нажимаются и называют причину',
    opened.cards.filter((c) => c.refused).every((c) => c.disabled && /\d/.test(c.reason ?? '')),
    `серых ${opened.cards.filter((c) => c.refused).length}`,
  );

  /* Цены и картинки считаются для видимых — ждём их. */
  const priced = await waitFor(
    page,
    READ_PANEL,
    (p) => p && p.cards.some((c) => !c.refused && !c.current && c.delta !== '' && c.delta !== null),
    30_000,
  );
  await sleep(1500);
  const shown = await page.evaluate(READ_PANEL);
  const pictures = shown.cards.filter((c) => c.picture).length;
  check(
    'картинки видимых карточек нарисованы',
    pictures > 0,
    `с картинкой ${pictures} из ${shown.cards.length}`,
  );
  /*
   * ОДИН ОТРИСОВЩИК. Холст картинок в документ не вставляется вовсе:
   * пятьдесят холстов WebGL браузер не держит, и гаснет сцена рядом.
   * Число холстов на странице от картинок расти не должно.
   */
  const canvasesAfter = await page.evaluate(() => document.querySelectorAll('canvas').length);
  check(
    'картинки не добавили на страницу ни одного холста',
    canvasesAfter === canvasesBefore,
    `холстов до ${canvasesBefore} · после ${canvasesAfter}`,
  );

  await page.screenshot({ path: `${OUT}/panel-open.png` });

  const pick = priced?.cards.find(
    (c) => !c.refused && !c.current && c.delta !== '' && c.delta !== null,
  );
  if (!pick) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: нет доступной карточки с посчитанной ценой');

  const totalBefore = await page.evaluate(READ_TOTAL);
  const rowBefore = await page.evaluate(READ_BASE);
  const delta = Number(pick.delta);
  console.log(`  карточка: ${pick.key} (${pick.variant} ${pick.width}) · обещает ${delta} ₸`);
  console.log(`  итог до: ${totalBefore} ₸`);

  await page.screenshot({ path: `${OUT}/before-replace.png` });

  await page.evaluate((key) => {
    const n = document.querySelector(`[data-card="${key}"]`);
    n?.click();
  }, pick.key);

  const rowAfter = await waitFor(
    page,
    READ_BASE,
    (row) => row.some((m) => m.offset === target.offset && m.variant === pick.variant),
  );
  await sleep(800);
  const totalAfter = await page.evaluate(READ_TOTAL);
  console.log(`  итог после: ${totalAfter} ₸`);

  const placed = rowAfter.find((m) => m.offset === target.offset);

  check(
    'вид модуля сменился на выбранный',
    placed?.variant === pick.variant,
    `${target.variant} → ${placed?.variant ?? 'МОДУЛЯ НЕТ'}`,
  );
  check(
    'модулей в ряду столько же',
    rowAfter.length === rowBefore.length,
    `${rowBefore.length} → ${rowAfter.length}`,
  );
  check(
    'соседи на месте до миллиметра',
    spots(rowAfter, target.offset) === spots(rowBefore, target.offset),
    `${spots(rowBefore, target.offset)} → ${spots(rowAfter, target.offset)}`,
  );
  /*
   * ГЛАВНОЕ ЧИСЛО. Карточка обещала разницу — итог на экране обязан
   * сдвинуться ровно на неё. Разошлось — значит карточка и итог
   * посчитаны разными сметами, и клиент видит обе цифры сразу.
   */
  check(
    'итог на экране сдвинулся ровно на число с карточки',
    totalBefore !== null && totalAfter !== null && totalAfter - totalBefore === delta,
    `${totalBefore} → ${totalAfter}: разница ${
      totalAfter !== null && totalBefore !== null ? totalAfter - totalBefore : '—'
    }, на карточке ${delta}`,
  );

  await page.screenshot({ path: `${OUT}/after-replace.png` });

  /* ───────────── 2. Пустая стена ───────────── */
  console.log('\n  ── пустая стена: сборка с нуля');

  const freeBtn = await page.$('[data-free-mode]');
  if (!freeBtn) {
    /* Кнопка живёт на шаге выбора решения — возвращаемся туда. */
    await page.getByRole('button', { name: /Решение|Шаблон/ }).first().click({ timeout: 30_000 });
    await sleep(1200);
  }
  await page.evaluate(() => document.querySelector('[data-free-mode]')?.click());
  await sleep(1500);
  await page.evaluate(() => document.querySelector('[data-schematic-tab="front"]')?.click());
  await sleep(1200);

  const emptyRow = await page.evaluate(READ_BASE);
  const lock = await page.evaluate(
    () => document.querySelector('[data-empty-run-lock]')?.textContent ?? null,
  );
  const nextLocked = await page.evaluate(
    () => document.querySelector('[data-next-button]')?.disabled ?? null,
  );

  check('стена пустая: модулей в ряду нет', emptyRow.length === 0, `модулей ${emptyRow.length}`);
  check('«Дальше» заперто', nextLocked === true, `disabled=${nextLocked}`);
  check('и сказано почему — словами рядом с кнопкой', Boolean(lock), lock ?? 'СТРОКИ НЕТ');

  const gaps = await page.evaluate(() =>
    [...document.querySelectorAll('[data-gap-from]')].map((n) => ({
      from: Number(n.getAttribute('data-gap-from')),
      width: Number(n.getAttribute('data-gap-width')),
    })),
  );
  if (gaps.length === 0) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: на пустой стене нет пустого места для нажатия');
  check(
    'пустая стена — одно пустое место во всю длину',
    gaps.length === 1 && gaps[0].from === 0,
    gaps.map((g) => `${g.from}+${g.width}`).join(' '),
  );

  await page.evaluate(() => {
    document
      .querySelector('[data-gap-from="0"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  const gapPanel = await waitFor(page, READ_PANEL, (p) => p && p.cards.length > 0);
  if (!gapPanel) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: нажатие на пустоту не открыло библиотеку');

  check(
    'нажатие на пустоту открыло ту же панель',
    gapPanel.cards.length > 0 && gapPanel.engine === gapPanel.cards.length,
    `карточек ${gapPanel.cards.length}, доступно ${gapPanel.cards.filter((c) => !c.refused).length}`,
  );

  /*
   * КАРТИНКИ РИСУЮТСЯ ПО МЕРЕ ПРОКРУТКИ. Здесь встаёт каждая карточка,
   * и у каждой будет картинка — но не сразу, а когда карточку видно:
   * сто двадцать отрисовок подряд — это пауза на планшете.
   */
  await sleep(2500);
  const drawnTop = (await page.evaluate(READ_PANEL)).cards.filter((c) => c.picture).length;
  await page.evaluate(() => {
    const cards = document.querySelectorAll('[data-library="1"] [data-card]');
    cards[cards.length - 1]?.scrollIntoView({ block: 'center' });
  });
  const scrolled = await waitFor(
    page,
    READ_PANEL,
    (p) => p && p.cards[p.cards.length - 1]?.picture,
    30_000,
  );
  const drawnAll = scrolled.cards.filter((c) => c.picture).length;
  check(
    'до прокрутки нарисованы не все картинки — только видимые',
    drawnTop > 0 && drawnTop < gapPanel.cards.length,
    `нарисовано ${drawnTop} из ${gapPanel.cards.length}`,
  );
  check(
    'прокрутка к концу панели дорисовала последнюю карточку',
    Boolean(scrolled.cards[scrolled.cards.length - 1]?.picture) && drawnAll > drawnTop,
    `было ${drawnTop} · стало ${drawnAll}`,
  );
  await page.screenshot({ path: `${OUT}/empty-wall-panel.png` });

  const first = gapPanel.cards.find((c) => !c.refused);
  if (!first) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: на пустой стене нет ни одной доступной карточки');

  await page.evaluate((key) => document.querySelector(`[data-card="${key}"]`)?.click(), first.key);
  const builtRow = await waitFor(page, READ_BASE, (row) => row.length > 0);
  await sleep(800);

  check(
    'модуль встал в пустоту у края стены',
    builtRow.length === 1 && builtRow[0].offset === 0 && builtRow[0].variant === first.variant,
    builtRow.map((m) => `${m.offset}:${m.width}:${m.variant}`).join(' ') || 'ПУСТО',
  );

  const unlocked = await page.evaluate(
    () => document.querySelector('[data-next-button]')?.disabled ?? null,
  );
  const lockGone = await page.evaluate(() => !document.querySelector('[data-empty-run-lock]'));
  check('с первым модулем «Дальше» открылось', unlocked === false, `disabled=${unlocked}`);
  check('и строка замка ушла', lockGone);

  await page.screenshot({ path: `${OUT}/empty-wall-first-module.png` });

  await browser.close();
} catch (error) {
  failed += 1;
  console.log(`  FAIL ${error instanceof Error ? error.message : String(error)}`);
} finally {
  server.kill();
  freePort(PORT);
}

console.log(`\n  снимки: ${OUT}`);
console.log(`  ПАДЕНИЙ: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
