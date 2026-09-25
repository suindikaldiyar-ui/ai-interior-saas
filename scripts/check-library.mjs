/**
 * БИБЛИОТЕКА МОДУЛЕЙ — В БРАУЗЕРЕ, ТЕМ ЖЕ ПУТЁМ, ЧТО ЭКРАН.
 *
 * Приёмка `test:millwork` меряет движок: карточки, отказы, разницу смет.
 * Но цену на экране считает рабочее место со СВОИМИ восемью аргументами
 * сметы (снятые галочки, школа цеха, фрезеровка, декоры), и разойтись с
 * карточкой она может только здесь — в шве между движком и экраном.
 * Поэтому цена сверяется по итогу, который ВИДИТ человек.
 *
 * Сценарии:
 *   1. демо по готовому решению: панель по выбору модуля, N карточек от
 *      движка; замена той же ширины; замена УЖЕ жестом — соседи и мойка
 *      на месте, справа пустота ровно на разницу; вставка в пустоту
 *      жестом; итог на экране сдвигается ровно на число с карточки;
 *   2. столешница: плита, которую нарисовала сцена, равна метражу в смете;
 *   3. кладовка над колонной: вариант, который не собирается, — серая
 *      карточка с причиной, а не «та же цена»;
 *   4. угловая кухня (стены А и Б) и П-образная (стена В): замена уже и
 *      вставка в пустоту, те же сверки миллиметров и денег;
 *   5. «Собрать самому» → пустая стена → «Дальше» заперто и сказано
 *      почему → нажали на пустоту → поставили модуль → «Дальше» открыто.
 *
 * Любое расхождение — FAIL и ненулевой код выхода. Ноль найденного —
 * FAIL с внятной строкой, а не молчаливый пропуск.
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

/** Пустоты активной стены на схеме. */
const READ_GAPS = `(() => {
  const scope =
    document.querySelector('[data-wall-block][aria-current="true"]') || document;
  return [...scope.querySelectorAll('[data-gap-from]')].map((n) => ({
    from: Number(n.getAttribute('data-gap-from')),
    width: Number(n.getAttribute('data-gap-width')),
    row: n.getAttribute('data-gap-row'),
  }));
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

/** Нажать на модуль в АКТИВНОЙ либо в заданной стене. */
async function clickModule(page, id, block = null) {
  await page.evaluate(
    ([moduleId, wallBlock]) => {
      const scope =
        wallBlock === null
          ? document.querySelector('[data-wall-block][aria-current="true"]') || document
          : document.querySelector(`[data-wall-block="${wallBlock}"]`) || document;
      const g = [...scope.querySelectorAll('[data-module-id]')].find(
        (n) => n.getAttribute('data-module-id') === moduleId,
      );
      g?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    },
    [id, block],
  );
}

/** Нажать на пустоту активной стены. */
async function clickGap(page, from) {
  await page.evaluate((fromMm) => {
    const scope =
      document.querySelector('[data-wall-block][aria-current="true"]') || document;
    scope
      .querySelector(`[data-gap-from="${fromMm}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, from);
}

/** Карточка с посчитанной ценой: цена считается, когда её видно. */
async function pricedCard(page, predicate, label) {
  const panel = await waitFor(page, READ_PANEL, (p) => p && p.cards.length > 0);
  if (!panel) return { error: `НУЛЕВОЙ СЕЛЕКТОР: ${label}: панель не открылась` };

  const wanted = panel.cards.find((c) => predicate(c) && !c.refused);
  if (!wanted) {
    const grey = panel.cards.filter((c) => predicate(c));
    return {
      error:
        `НУЛЕВОЙ СЕЛЕКТОР: ${label}: доступной карточки нет` +
        (grey[0] ? ` · серых ${grey.length}: «${grey[0].reason}»` : ' · таких карточек нет вовсе'),
    };
  }

  /* Прокрутить к карточке, чтобы цена посчиталась. */
  await page.evaluate((key) => {
    document.querySelector(`[data-card="${key}"]`)?.scrollIntoView({ block: 'center' });
  }, wanted.key);
  const priced = await waitFor(
    page,
    READ_PANEL,
    (p) => p && p.cards.some((c) => c.key === wanted.key && c.delta !== '' && c.delta !== null),
    30_000,
  );
  const card = priced?.cards.find((c) => c.key === wanted.key);
  if (!card || card.delta === '' || card.delta === null) {
    return { error: `${label}: цена на карточке ${wanted.key} так и не посчиталась` };
  }
  return { card };
}

/**
 * ЗАМЕНА УЖЕ ЖЕСТОМ: соседи и мойка на месте, справа пустота ровно на
 * разницу, итог на экране сдвигается ровно на число с карточки.
 */
async function narrowerReplace(page, label, pickTarget) {
  console.log(`\n  ── ${label}: замена уже`);
  const row = await page.evaluate(READ_BASE);
  const target = pickTarget(row);
  if (!target) {
    check(`${label}: есть обычный модуль для замены`, false, `НУЛЕВОЙ СЕЛЕКТОР · ${row.map((m) => m.id).join(' ')}`);
    return null;
  }
  await clickModule(page, target.id);

  /*
   * Карточка уже — той ширины, что есть в панели: у нестандартного
   * модуля (540) карточки «ширина − 150» нет, ширины там стандартные.
   * Берём самую широкую из тех, что уже хотя бы на 150 мм: в такую
   * пустоту встаёт самый узкий корпус.
   */
  const listed = (await waitFor(page, READ_PANEL, (p) => p && p.cards.length > 0))?.cards ?? [];
  const narrower = listed
    .filter((c) => c.variant === target.variant && c.width <= target.width - 150)
    .sort((a, b) => b.width - a.width);
  const chosenWidth = narrower[0]?.width;
  const got = chosenWidth
    ? await pricedCard(
        page,
        (c) => c.variant === target.variant && c.width === chosenWidth,
        `${label}: «${target.variant} ${chosenWidth}»`,
      )
    : { error: `НУЛЕВОЙ СЕЛЕКТОР: ${label}: карточек «${target.variant}» уже на 150 мм нет в панели` };
  if (got.error) {
    check(`${label}: карточка уже доступна`, false, got.error);
    return null;
  }
  const cut = target.width - got.card.width;

  const totalBefore = await page.evaluate(READ_TOTAL);
  await page.evaluate((key) => document.querySelector(`[data-card="${key}"]`)?.click(), got.card.key);
  const rowAfter = await waitFor(
    page,
    READ_BASE,
    (r) => r.some((m) => m.offset === target.offset && m.width === target.width - cut),
  );
  await sleep(800);
  const totalAfter = await page.evaluate(READ_TOTAL);
  const gaps = await page.evaluate(READ_GAPS);
  const gap = gaps.find((g) => g.row === 'base' && g.from === target.offset + target.width - cut);
  const placed = rowAfter.find((m) => m.offset === target.offset);

  console.log(
    `  ${target.id} ${target.offset}:${target.width} → ${placed ? `${placed.offset}:${placed.width}` : '—'} · ` +
      `итог ${totalBefore} → ${totalAfter} · карточка ${got.card.delta}`,
  );
  check(
    `${label}: модуль стоит от своего левого края и стал уже`,
    placed?.width === target.width - cut,
    placed ? `${placed.offset}:${placed.width}` : 'МОДУЛЯ НЕТ',
  );
  check(
    `${label}: модулей столько же — добор не дописан`,
    rowAfter.length === row.length,
    `${row.length} → ${rowAfter.length}`,
  );
  check(
    `${label}: соседи на месте до миллиметра`,
    spots(rowAfter, target.offset) === spots(row, target.offset),
    `${spots(row, target.offset)} → ${spots(rowAfter, target.offset)}`,
  );
  check(
    `${label}: справа пустота ровно на разницу`,
    gap?.width === cut,
    gap ? `пусто ${gap.from}+${gap.width}` : `НУЛЕВОЙ СЕЛЕКТОР · пустоты: ${gaps.map((g) => `${g.row} ${g.from}+${g.width}`).join(' ') || 'нет'}`,
  );
  check(
    `${label}: итог на экране сдвинулся ровно на число с карточки`,
    totalBefore !== null && totalAfter !== null && totalAfter - totalBefore === Number(got.card.delta),
    `разница ${totalAfter - totalBefore}, на карточке ${got.card.delta}`,
  );
  return gap ?? null;
}

/** ВСТАВКА В ПУСТОТУ ЖЕСТОМ. */
async function gapInsert(page, label, gap) {
  console.log(`\n  ── ${label}: вставка в пустоту ${gap.from}+${gap.width}`);
  const row = await page.evaluate(READ_BASE);
  await clickGap(page, gap.from);

  const got = await pricedCard(page, (c) => c.width <= gap.width, `${label}: вставка в ${gap.from}`);
  if (got.error) {
    check(`${label}: в пустоту есть доступная карточка`, false, got.error);
    return;
  }

  const totalBefore = await page.evaluate(READ_TOTAL);
  await page.evaluate((key) => document.querySelector(`[data-card="${key}"]`)?.click(), got.card.key);
  const rowAfter = await waitFor(page, READ_BASE, (r) => r.some((m) => m.offset === gap.from));
  await sleep(800);
  const totalAfter = await page.evaluate(READ_TOTAL);
  const fresh = rowAfter.find((m) => m.offset === gap.from);

  check(
    `${label}: модуль встал в пустоту, на её отметку`,
    Boolean(fresh) && fresh.width === got.card.width,
    fresh ? `${fresh.offset}:${fresh.width} ${fresh.variant}` : 'НЕ ВСТАЛ',
  );
  check(
    `${label}: модулей стало на один больше`,
    rowAfter.length === row.length + 1,
    `${row.length} → ${rowAfter.length}`,
  );
  check(
    `${label}: соседи на месте до миллиметра`,
    spots(rowAfter, gap.from) === spots(row, gap.from),
    `${spots(row, gap.from)} → ${spots(rowAfter, gap.from)}`,
  );
  check(
    `${label}: итог на экране сдвинулся ровно на число с карточки`,
    totalBefore !== null && totalAfter !== null && totalAfter - totalBefore === Number(got.card.delta),
    `разница ${totalAfter - totalBefore}, на карточке ${got.card.delta}`,
  );
}

/** СТОЛЕШНИЦА: плита сцены против метража сметы. */
async function countertop(page, label) {
  await page.evaluate(() => document.querySelector('[data-schematic-tab="scene"]')?.click());
  const slabs = await waitFor(
    page,
    `(() => (window.__mwCadCounter ? window.__mwCadCounter() : null))()`,
    (v) => v && Object.keys(v).length > 0,
    30_000,
  );
  const lines = await page.evaluate(() => (window.__mwEstimateLines ? window.__mwEstimateLines() : null));
  await page.evaluate(() => document.querySelector('[data-schematic-tab="front"]')?.click());
  await sleep(1200);

  if (!slabs || !lines) {
    check(`${label}: столешница в сцене и в смете`, false, `НУЛЕВОЙ СЕЛЕКТОР: сцена ${slabs ? 'есть' : 'нет'} · смета ${lines ? 'есть' : 'нет'}`);
    return;
  }
  const drawn = Object.values(slabs).flat().reduce((sum, mm) => sum + mm, 0);
  /*
   * Столешница бывает НЕСКОЛЬКИМИ строками: у стен угловой кухни свой
   * вид плиты, и смета объекта складывает их по ключу. Сверяется сумма.
   */
  const counterLines = lines.filter(
    (l) => l.key.startsWith('countertop_') && l.key !== 'countertop_plinth' && l.key !== 'countertop_miter',
  );
  const billed = counterLines.length
    ? Math.round(counterLines.reduce((sum, l) => sum + l.quantity, 0) * 1000)
    : null;
  check(
    `${label}: плита в сцене равна метражу столешницы в смете`,
    billed !== null && drawn === billed,
    `сцена ${drawn} мм (${Object.entries(slabs).map(([w, l]) => `${w}: ${l.join('+')}`).join(' · ')}) · ` +
      `смета ${billed ?? 'СТРОКИ НЕТ'} мм (${counterLines.map((l) => `${l.key} ${l.quantity}`).join(' + ')})`,
  );
}

async function toStep(page, name) {
  await page.getByRole('button', { name }).first().click({ timeout: 30_000 });
  await sleep(1500);
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

  /* ───────────── 1. Панель по выбору модуля ───────────── */
  console.log('\n  ── демо по готовому решению: панель');

  const row0 = await page.evaluate(READ_BASE);
  const plainOf = (row) => row.find((m) => /^base-\d+$/.test(m.id.split('@')[0]));
  const target = plainOf(row0);
  if (!target) {
    throw new Error(
      `НУЛЕВОЙ СЕЛЕКТОР: в нижнем ряду нет обычного модуля · ${row0.map((m) => m.id).join(' ')}`,
    );
  }
  console.log(`  выбираем: ${target.id} (${target.offset}:${target.width}, ${target.variant})`);
  const canvasesBefore = await page.evaluate(() => document.querySelectorAll('canvas').length);

  await countertop(page, 'демо до правок');

  await clickModule(page, target.id);
  const opened = await waitFor(page, READ_PANEL, (p) => p && p.cards.length > 0);
  if (!opened) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: панель библиотеки не открылась после выбора модуля');

  check('выбор модуля открыл панель библиотеки', opened.cards.length > 0, `карточек на экране ${opened.cards.length}`);
  /*
   * N ОТДАЁТ ДВИЖОК. Число в этом файле не записано: панель обязана
   * показать ровно столько, сколько вернул `libraryCards`.
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
    `серых ${opened.cards.filter((c) => c.refused).length} из ${opened.cards.length}`,
  );

  await sleep(2500);
  const shown = await page.evaluate(READ_PANEL);
  const pictures = shown.cards.filter((c) => c.picture).length;
  check('картинки видимых карточек нарисованы', pictures > 0, `с картинкой ${pictures} из ${shown.cards.length}`);
  const canvasesAfter = await page.evaluate(() => document.querySelectorAll('canvas').length);
  check(
    'картинки не добавили на страницу ни одного холста',
    canvasesAfter === canvasesBefore,
    `холстов до ${canvasesBefore} · после ${canvasesAfter}`,
  );
  await page.screenshot({ path: `${OUT}/panel-open.png` });

  /* ── замена той же ширины: вид сменился, всё остальное на месте ── */
  {
    const got = await pricedCard(
      page,
      (c) => !c.current && c.width === target.width && c.variant !== target.variant,
      'замена той же ширины',
    );
    if (got.error) check('замена той же ширины доступна', false, got.error);
    else {
      const totalBefore = await page.evaluate(READ_TOTAL);
      const rowBefore = await page.evaluate(READ_BASE);
      await page.evaluate((key) => document.querySelector(`[data-card="${key}"]`)?.click(), got.card.key);
      const rowAfter = await waitFor(
        page,
        READ_BASE,
        (row) => row.some((m) => m.offset === target.offset && m.variant === got.card.variant),
      );
      await sleep(800);
      const totalAfter = await page.evaluate(READ_TOTAL);
      const placed = rowAfter.find((m) => m.offset === target.offset);
      check('вид модуля сменился на выбранный', placed?.variant === got.card.variant, `${target.variant} → ${placed?.variant ?? 'МОДУЛЯ НЕТ'}`);
      check('модулей в ряду столько же', rowAfter.length === rowBefore.length, `${rowBefore.length} → ${rowAfter.length}`);
      check(
        'соседи на месте до миллиметра',
        spots(rowAfter, target.offset) === spots(rowBefore, target.offset),
        `${spots(rowBefore, target.offset)} → ${spots(rowAfter, target.offset)}`,
      );
      check(
        'итог на экране сдвинулся ровно на число с карточки',
        totalBefore !== null && totalAfter !== null && totalAfter - totalBefore === Number(got.card.delta),
        `${totalBefore} → ${totalAfter}: разница ${totalAfter - totalBefore}, на карточке ${got.card.delta}`,
      );
      await page.screenshot({ path: `${OUT}/after-replace.png` });

      /* Вернуть вариант: дальше меряем замену уже от исходного. */
      const back = await pricedCard(page, (c) => c.variant === target.variant && c.width === target.width, 'возврат');
      if (!back.error) {
        await page.evaluate((key) => document.querySelector(`[data-card="${key}"]`)?.click(), back.card.key);
        await sleep(1200);
      }
    }
  }

  /* ───────────── 2. Замена уже и вставка в пустоту — демо ───────────── */
  const demoGap = await narrowerReplace(page, 'демо', (row) => row.find((m) => m.id === target.id));
  await page.screenshot({ path: `${OUT}/narrower-demo.png` });
  await countertop(page, 'демо с пустотой внутри ряда');
  if (demoGap) {
    await gapInsert(page, 'демо', demoGap);
    await page.screenshot({ path: `${OUT}/gap-filled-demo.png` });
  }

  /* ───────────── 3. Кладовка над колонной ───────────── */
  {
    console.log('\n  ── кладовка над колонной: вариант, который не собирается');
    const storage = await page.evaluate(() => {
      const scope =
        document.querySelector('[data-wall-block][aria-current="true"]') || document;
      const g = [...scope.querySelectorAll('[data-module-id]')].find(
        (n) => n.getAttribute('data-move-row') === 'storage',
      );
      return g ? g.getAttribute('data-module-id') : null;
    });
    if (!storage) check('на схеме есть кладовка над колонной', false, 'НУЛЕВОЙ СЕЛЕКТОР');
    else {
      await clickModule(page, storage);
      await sleep(1500);
      const strip = await page.evaluate(() =>
        [...document.querySelectorAll('[data-variant-strip] button[data-variant]')].map((n) => ({
          kind: n.getAttribute('data-variant'),
          disabled: n.disabled,
          reason: n.getAttribute('title') ?? '',
          text: n.textContent ?? '',
        })),
      );
      console.log(`  ${storage}: вариантов в ленте ${strip.length}`);
      const lies = strip.filter((c) => !c.disabled || /та же цена|0 ₸/.test(c.text));
      check(
        'вариант, который не собирается, — серая карточка с причиной, а не «та же цена»',
        lies.length === 0,
        strip.length === 0
          ? 'вариантов в ленте нет'
          : lies.length
            ? `врут ${lies.length} из ${strip.length}: ${lies.slice(0, 3).map((c) => `${c.kind} «${c.text.trim().slice(-14)}»`).join(' · ')}`
            : `серых ${strip.length} · «${strip[0].reason}»`,
      );
    }
  }

  /* ───────────── 4. Угловая и П-образная ───────────── */
  /*
   * У демо-замера ДВЕ стены (3800 и 1800): П-образную из него не собрать,
   * и стены В в браузере нет. Её меряет `test:millwork` на композиции из
   * трёх стен тем же путём движка; здесь — угловая, стены А и Б.
   */
  for (const [shape, walls] of [['corner_l', [0, 1]]]) {
    await toStep(page, /Размеры/);
    const switched = await page.evaluate((kind) => {
      const b = document.querySelector(`[data-shape-kind="${kind}"]`);
      if (!b) return false;
      b.click();
      return true;
    }, shape);
    if (!switched) {
      check(`форма ${shape} выбирается`, false, 'НУЛЕВОЙ СЕЛЕКТОР: кнопки формы нет');
      continue;
    }
    await sleep(2000);
    await toStep(page, /Раскладка/);
    await page.evaluate(() => document.querySelector('[data-schematic-tab="front"]')?.click());
    await sleep(1500);

    for (const wall of walls) {
      const label = `${shape === 'corner_l' ? 'угловая' : 'П-образная'} · стена ${'АБВ'[wall]}`;
      const plainId = await page.evaluate((w) => {
        const block = document.querySelector(`[data-wall-block="${w}"]`);
        if (!block) return null;
        const g = [...block.querySelectorAll('[data-module-id]')].find(
          (n) =>
            (n.getAttribute('data-move-row') || 'base') === 'base' &&
            /^base-\d+$/.test((n.getAttribute('data-module-id') || '').split('@')[0]) &&
            Number(n.getAttribute('data-module-width')) >= 450,
        );
        return g ? g.getAttribute('data-module-id') : null;
      }, wall);
      if (!plainId) {
        check(`${label}: есть обычный модуль шириной от 450`, false, 'НУЛЕВОЙ СЕЛЕКТОР');
        continue;
      }
      /* Нажатие на модуль делает его стену активной. */
      await clickModule(page, plainId, wall);
      await sleep(1500);
      await page.keyboard.press('Escape').catch(() => {});

      const gap = await narrowerReplace(page, label, (row) => row.find((m) => m.id === plainId));
      await page.screenshot({ path: `${OUT}/narrower-${shape}-${wall}.png` });
      if (gap) await gapInsert(page, label, gap);
      await countertop(page, label);
    }
  }

  /* ───────────── 5. Пустая стена ───────────── */
  console.log('\n  ── пустая стена: сборка с нуля');

  /* Пустая стена меряется на прямой кухне: форма возвращается. */
  await toStep(page, /Размеры/);
  await page.evaluate(() => document.querySelector('[data-shape-kind="linear"]')?.click());
  await sleep(1500);

  const freeBtn = await page.$('[data-free-mode]');
  if (!freeBtn) {
    await page.getByRole('button', { name: /Решение|Шаблон/ }).first().click({ timeout: 30_000 });
    await sleep(1200);
  }
  await page.evaluate(() => document.querySelector('[data-free-mode]')?.click());
  await sleep(1500);
  await page.evaluate(() => document.querySelector('[data-schematic-tab="front"]')?.click());
  await sleep(1200);

  const emptyRow = await page.evaluate(READ_BASE);
  const lock = await page.evaluate(() => document.querySelector('[data-empty-run-lock]')?.textContent ?? null);
  const nextLocked = await page.evaluate(() => document.querySelector('[data-next-button]')?.disabled ?? null);

  check('стена пустая: модулей в ряду нет', emptyRow.length === 0, `модулей ${emptyRow.length}`);
  check('«Дальше» заперто', nextLocked === true, `disabled=${nextLocked}`);
  check('и сказано почему — словами рядом с кнопкой', Boolean(lock), lock ?? 'СТРОКИ НЕТ');

  const gaps0 = await page.evaluate(READ_GAPS);
  const baseGap = gaps0.find((g) => g.row === 'base' && g.from === 0);
  if (!baseGap) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: на пустой стене нет пустого места нижнего ряда');
  check(
    'пустая стена — пустота нижнего ряда во всю длину',
    baseGap.width > 0,
    gaps0.map((g) => `${g.row} ${g.from}+${g.width}`).join(' · '),
  );

  await clickGap(page, 0);
  const gapPanel = await waitFor(page, READ_PANEL, (p) => p && p.cards.length > 0);
  if (!gapPanel) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: нажатие на пустоту не открыло библиотеку');
  check(
    'нажатие на пустоту открыло ту же панель',
    gapPanel.cards.length > 0 && gapPanel.engine === gapPanel.cards.length,
    `карточек ${gapPanel.cards.length}, доступно ${gapPanel.cards.filter((c) => !c.refused).length}`,
  );

  /*
   * КАРТИНКИ РИСУЮТСЯ ПО МЕРЕ ПРОКРУТКИ: у всех будет картинка, но не
   * сразу — сто отрисовок подряд это пауза на планшете.
   */
  await sleep(2500);
  const drawnTop = (await page.evaluate(READ_PANEL)).cards.filter((c) => c.picture).length;
  await page.evaluate(() => {
    const cards = document.querySelectorAll('[data-library="1"] [data-card]');
    cards[cards.length - 1]?.scrollIntoView({ block: 'center' });
  });
  const scrolled = await waitFor(page, READ_PANEL, (p) => p && p.cards[p.cards.length - 1]?.picture, 30_000);
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

  /*
   * ВЕРХНИЙ РЯД НА ПУСТОЙ СТЕНЕ — ТОЖЕ ПУСТОТА, А НЕ АВТОСБОРКА.
   */
  const upperAfter = await page.evaluate(() => {
    const scope =
      document.querySelector('[data-wall-block][aria-current="true"]') || document;
    return {
      modules: [...scope.querySelectorAll('[data-module-id]')].filter(
        (g) => g.getAttribute('data-move-row') === 'upper',
      ).length,
      gaps: [...scope.querySelectorAll('[data-gap-row="upper"]')].length,
    };
  });
  check(
    'после нижнего модуля верхний ряд сам не вырос, и он — пустота',
    upperAfter.modules === 0 && upperAfter.gaps > 0,
    `верхних модулей ${upperAfter.modules} · пустот верхнего ряда ${upperAfter.gaps}`,
  );

  const unlocked = await page.evaluate(() => document.querySelector('[data-next-button]')?.disabled ?? null);
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
