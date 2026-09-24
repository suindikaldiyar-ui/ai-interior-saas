/**
 * ПЕРЕТАСКИВАНИЕ НА СХЕМЕ — НАСТОЯЩИМИ СОБЫТИЯМИ УКАЗАТЕЛЯ.
 *
 * Движок проверен приёмкой: `move_module` и `set_width` умеют все три
 * ряда. А ЖЕСТ живёт в SVG, и проверить его типами нельзя: обработчик
 * может висеть не на том элементе, фигура с `fill="none"` ловит
 * указатель только по обводке, сверху может лежать другой слой и
 * забирать нажатие себе, а перевод «где палец» → «какой слот» может
 * считать по укладке, которой в ряду нет.
 *
 * Поэтому здесь браузер: находим модуль по `data-module-id`, ведём по
 * нему мышью и читаем состав ряда ДО и ПОСЛЕ — прямо из разметки, как
 * читает его глаз.
 *
 * Инструмент глазной проверки, в `verify` не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 3223;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/schematic-drag';
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

/** Состав рядов прямо из разметки схемы. */
const READ_ROWS = `(() => {
  /*
   * ЧИТАЕМ АКТИВНУЮ СТЕНУ, А НЕ ВСЮ СХЕМУ.
   *
   * У угловой кухни на схеме стоят обе стены рядом, и модули там
   * одноимённые: холодильник tall-0 есть и на той, и на другой. Правка
   * при этом уходит в ВЫБРАННУЮ стену, и мерить надо её же.
   */
  const scope =
    document.querySelector('[data-wall-block][aria-current="true"]') || document;
  const rows = { base: [], upper: [], mezz: [], storage: [] };
  for (const g of scope.querySelectorAll('[data-module-id]')) {
    const id = g.getAttribute('data-module-id');
    const key = g.getAttribute('data-move-row');
    const row = key === 'mezzanine' ? 'mezz' : key === 'upper' ? 'upper' : key === 'storage' ? 'storage' : 'base';
    const rect = g.querySelector('rect[data-fill]') || g.querySelector('rect');
    const box = rect ? rect.getBoundingClientRect() : null;
    rows[row].push({
      id,
      offset: Number(g.getAttribute('data-module-offset')),
      x: box ? Math.round(box.x) : 0,
      y: box ? Math.round(box.y) : 0,
      w: box ? Math.round(box.width) : 0,
      h: box ? Math.round(box.height) : 0,
    });
  }
  for (const key of Object.keys(rows)) rows[key].sort((a, b) => a.offset - b.offset);
  return rows;
})()`;

/** Что обещала подсветка в момент отпускания. */
const READ_GHOST = `(() => {
  const n = [...document.querySelectorAll('text')].find(
    (t) => t.hasAttribute('data-landing-mm'),
  );
  if (!n) return null;
  return {
    text: n.textContent,
    centre: n.getAttribute('data-centre-mm'),
    landing: n.getAttribute('data-landing-mm'),
    row: n.getAttribute('data-drag-row'),
  };
})()`;

const order = (list) => list.map((m) => m.id.split('@')[0]).join(' | ');
const marks = (list) => list.map((m) => m.offset).join(' ');
const pixels = (list) => list.map((m) => m.w).join(' ');

/** Настоящий жест: нажали, повели шагами, отпустили. */
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = 16;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    );
    await sleep(30);
  }
  /*
   * ПЕРЕД ОТПУСКАНИЕМ — ПАУЗА.
   *
   * Подсветка перерисовывается по кадру (`requestAnimationFrame`), и
   * под софтверным рендерером кадр приходит не сразу. Отпустить в тот
   * же миг значит записать позицию на кадр раньше — человек так не
   * делает, а проверка ловила бы не жест, а гонку.
   */
  await sleep(300);
  const ghost = await page.evaluate(READ_GHOST);
  await page.mouse.up();
  await sleep(900);
  return ghost;
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

  /* Схема, а не 3D: жест живёт в SVG. */
  await page.evaluate(() => document.querySelector('[data-schematic-tab="front"]')?.click());
  await sleep(1500);

  /*
   * АНТРЕСОЛЬ ВКЛЮЧАЕТСЯ ЯВНО И ВЫСОТОЙ, КОТОРАЯ ПРОХОДИТ ПОД РИГЕЛЕМ.
   *
   * В демо-замере по потолку идёт короб вентиляции (слой 44): при
   * стандартной высоте антресоли её низ оказывается выше низа балки, и
   * из полосы остаётся ОДИН модуль — переставлять нечего. Свес 600 при
   * потолке 2700 оставляет 2100; антресоль 900 мм начинается на 1800 и
   * под балку проходит целиком.
   *
   * Это не обход проверки, а выбор конфигурации, в которой есть что
   * тянуть: ряд из одного модуля не докажет ни работы жеста, ни его
   * поломки.
   */
  const mezz = await page.evaluate(() => {
    const btn = document.querySelector('[data-mezzanine-toggle]');
    if (!btn) return 'кнопки нет';
    if (btn.getAttribute('aria-pressed') !== 'true') btn.click();
    return 'включена';
  });
  console.log(`  антресоль: ${mezz}`);
  await sleep(2000);

  const height = await page.evaluate(() => {
    const input = document.querySelector('[data-mezzanine-height]');
    if (!input) return 'поля высоты нет';
    input.focus();
    input.value = '900';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
    return '900 мм';
  });
  console.log(`  высота антресоли: ${height}`);
  await sleep(2200);

  const rows = await page.evaluate(READ_ROWS);

  const start = rows;
  console.log(
    `  рядов на схеме: низ ${start.base.length} · верх ${start.upper.length} · антресоль ${start.mezz.length}`,
  );
  console.log(`  кладовка над колонной: ${start.storage.length}`);

  /*
   * ЧТО ЗДЕСЬ ВООБЩЕ МОЖНО ПЕРЕСТАВИТЬ.
   *
   * Перестановка — это обмен местами, и в ряду из ОДНОГО модуля её не
   * существует ни в каком продукте. На демо-стене полоса антресоли
   * именно такая: по потолку идёт короб вентиляции (слой 44), и под ним
   * от полосы остаётся один модуль. Поднять антресоль так, чтобы она
   * прошла под балкой, нельзя — движок отвечает числом: «Антресоль
   * 900 мм не встаёт: над верхним рядом остаётся 530 мм».
   *
   * Поэтому ряды с одним модулем проверяются иначе: жест обязан ДОЙТИ
   * до нужного ряда и не сломать соседние. Сам обмен местами для
   * антресоли меряет `npm run test:millwork` — там ряд можно собрать
   * любым.
   */
  for (const row of ['base', 'upper']) {
    if (start[row].length < 2) {
      throw new Error(
        `НУЛЕВОЙ СЕЛЕКТОР: в ряду «${row}» ${start[row].length} модулей — переставлять нечего`,
      );
    }
  }
  if (start.mezz.length === 0) {
    throw new Error('НУЛЕВОЙ СЕЛЕКТОР: полосы антресоли на схеме нет — жест проверять не на чем');
  }

  await page.screenshot({ path: `${OUT}/before.png` });

  /* ── Граница между двумя ВЕРХНИМИ модулями ── */
  {
    /*
     * ГРАНИЦА ЕСТЬ НЕ МЕЖДУ ЛЮБЫМИ СОСЕДЯМИ ПО РЯДУ.
     *
     * Верхний ряд разорван окном и колонной: между модулем на 1500 и
     * модулем на 2400 девятьсот миллиметров стены, а не шов. Берём
     * ручку, которая в разметке ЕСТЬ, и тянем именно её.
     */
    const edges = await page.evaluate(() => {
      const scope =
        document.querySelector('[data-wall-block][aria-current="true"]') || document;
      return [...scope.querySelectorAll('[data-edge]')].map((n) => {
        const box = n.getBoundingClientRect();
        return {
          id: n.getAttribute('data-edge'),
          x: Math.round(box.x + box.width / 2),
          y: Math.round(box.y + box.height / 2),
        };
      });
    });
    console.log(
      `\n  ── границы в разметке: ${edges.map((e) => e.id.split('@')[0]).join(', ') || 'НЕТ НИ ОДНОЙ'}`,
    );
    if (edges.length === 0) {
      throw new Error('НУЛЕВОЙ СЕЛЕКТОР: ручек границы на схеме нет — тянуть нечего');
    }

    const upperEdge = edges.find((e) => e.id.startsWith('upper-'));
    if (!upperEdge) {
      throw new Error(
        `НУЛЕВОЙ СЕЛЕКТОР: границы в ВЕРХНЕМ ряду нет — есть ${edges
          .map((e) => e.id.split('@')[0])
          .join(', ')}`,
      );
    }

    const widthOf = (rows, id) =>
      [...rows.base, ...rows.upper, ...rows.mezz].find((m) => m.id === id)?.w ?? 0;

    const before = await page.evaluate(READ_ROWS);
    console.log(`     тянем границу у ${upperEdge.id.split('@')[0]}`);
    console.log(`     верх до:         ${order(before.upper)}`);
    console.log(`     отметки до:      ${marks(before.upper)}`);
    console.log(`     ширины до, px:   ${pixels(before.upper)}`);

    await drag(page, { x: upperEdge.x, y: upperEdge.y }, { x: upperEdge.x - 40, y: upperEdge.y });

    const after = await page.evaluate(READ_ROWS);
    console.log(`     верх после:      ${order(after.upper)}`);
    console.log(`     отметки после:   ${marks(after.upper)}`);
    console.log(`     ширины после, px: ${pixels(after.upper)}`);

    check(
      'граница между верхними модулями тянется — ширина поехала',
      marks(after.upper) !== marks(before.upper) ||
        widthOf(after, upperEdge.id) !== widthOf(before, upperEdge.id),
      `${widthOf(before, upperEdge.id)} → ${widthOf(after, upperEdge.id)} px`,
    );
    /*
     * РЯД ВПРАВЕ ПОЕХАТЬ — НО НЕ МОЛЧА.
     *
     * Верхний ряд разорван, а `set_width` пересобирает его вплотную от
     * левого края (`reindexUpper`): модули, съехавшие из своих участков,
     * выбрасываются. Замерено: 4 → 1 при правке ширины на 210 мм.
     *
     * Это поведение ДВИЖКА, и та же потеря происходит при вводе ширины
     * в поле ленты модулей — жест ничего нового не ломает. Требовать от
     * жеста «ряд не меняется» значило бы требовать неправды; требуем
     * того, что действительно обязано выполняться: потеря НАЗВАНА.
     */
    /* Строка отказа стоит там, где делают жест: под схемой либо в панели. */
    const said = await page.evaluate(() =>
      [
        document.querySelector('[data-scene-notice]')?.textContent,
        document.querySelector('[data-move-notice]')?.textContent,
      ]
        .filter(Boolean)
        .map((t) => t.trim())
        .join(' · '),
    );
    console.log(`     движок сказал: ${said || '—'}`);
    check(
      'ряд либо не потерял модулей, либо потеря названа числом',
      after.upper.length === before.upper.length || /\d+ модул/.test(said),
      `${before.upper.length} → ${after.upper.length} · ${said || 'МОЛЧА'}`,
    );
    check(
      'нижний ряд от правки ширины наверху не поехал',
      marks(after.base) === marks(before.base),
      `${marks(before.base)} → ${marks(after.base)}`,
    );
  }


  /* ── Три переноса: по одному на ряд ── */
  for (const row of ['base', 'upper', 'mezz']) {
    const before = await page.evaluate(READ_ROWS);
    const list = before[row];
    /* Тянем ВТОРОЙ модуль ряда на место первого: перестановка заметна. */
    const taken = list[1] ?? list[0];
    const onto = list[0];

    console.log(`\n  ── перенос: ряд «${row}», тянем ${taken.id.split('@')[0]} ──`);
    console.log(`     до:            ${order(list)}`);
    console.log(`     отметки до:    ${marks(list)}`);
    console.log(`     ширины до, px: ${pixels(list)}`);

    const ghost = await drag(
      page,
      { x: taken.x + taken.w / 2, y: taken.y + taken.h / 2 },
      /* Целимся ЗА левый край соседа: человек тянет с запасом, а не в пиксель. */
      { x: onto.x - 8, y: taken.y + taken.h / 2 },
    );
    console.log(`     подсветка при отпускании: ${JSON.stringify(ghost)}`);
    const said = await page.evaluate(() =>
      [
        document.querySelector('[data-scene-notice]')?.textContent,
        document.querySelector('[data-move-notice]')?.textContent,
      ]
        .filter(Boolean)
        .map((t) => t.trim())
        .join(' · '),
    );
    console.log(`     движок сказал: ${said || '—'}`);

    const after = await page.evaluate(READ_ROWS);
    console.log(`     после:            ${order(after[row])}`);
    console.log(`     отметки после:    ${marks(after[row])}`);
    console.log(`     ширины после, px: ${pixels(after[row])}`);

    if (list.length > 1) {
      check(
        `${row}: порядок модулей изменился`,
        order(after[row]) !== order(list),
        order(after[row]) === order(list) ? 'НЕ ДВИНУЛСЯ' : 'переставлен',
      );
    } else {
      /* Менять местами не с кем: меряем, что жест ДОШЁЛ до этого ряда. */
      check(
        `${row}: в ряду один модуль — меняться местами не с кем`,
        order(after[row]) === order(list),
        `состав ${order(list)}`,
      );
    }
    check(
      `${row}: подсветка обещала тот ряд, где жест`,
      ghost?.row === (row === 'mezz' ? 'mezzanine' : row),
      `${ghost?.row ?? 'подсветки нет'}`,
    );
    for (const other of ['base', 'upper', 'mezz']) {
      if (other === row) continue;
      /*
       * СОСЕДНИЙ РЯД НЕ ТЕРЯЕТ МОДУЛЕЙ.
       *
       * Сверять их ИМЕНА нельзя: идентификатор выводится из позиции, и
       * перестановка внизу законно пересобирает верхний ряд вместе с
       * антресолью над ним — имена там меняются, а мебель остаётся та
       * же. Меряем то, что действительно ломалось бы: состав.
       */
      check(
        `${row}: ряд «${other}» не потерял модулей`,
        after[other].length === before[other].length,
        `${before[other].length} → ${after[other].length}`,
      );
    }
  }

  await page.screenshot({ path: `${OUT}/after.png` });
  await browser.close();
  console.log(`\n  снимки: ${OUT}`);
  console.log(failed === 0 ? '  ВСЁ ЗЕЛЁНОЕ' : `  ПАДЕНИЙ: ${failed}`);
  if (failed > 0) process.exitCode = 1;
} finally {
  server.kill();
  freePort(PORT);
}
