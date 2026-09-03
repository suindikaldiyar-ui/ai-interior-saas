/**
 * Чертёжный лист — вживую.
 *
 * Проверяется то, чего не докажут типы:
 *  1. на листе одновременно фасад, два разреза и план;
 *  2. у каждого вида есть подпись и масштаб;
 *  3. масштаб НАСТОЯЩИЙ: при 1:25 тысяча миллиметров мебели занимает на
 *     бумаге сорок миллиметров;
 *  4. в штампе стоит номер листа.
 *
 * Меряем в режиме печати: на экране лист уменьшен под ширину окна, и мерить
 * там бессмысленно — на бумаге он натуральный.
 *
 * Инструмент глазной проверки, в `verify` не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 3222;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/sheet';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Длина ряда в демонстрации. */
const DEMO_RUN_MM = 3200;
/** Поле рисунка внутри вида: 74 + 640 + 26 условных единиц. */
const FIELD_RATIO = 640 / 740;

function freePort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, {
      encoding: 'utf8',
    });
    for (const line of out.split(/\r?\n/)) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== '0')
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
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

let failures = 0;
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? '  ok  ' : '  ПЛОХО'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures += 1;
};

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(BASE);
      if (res.ok || res.status < 500) break;
    } catch {
      await sleep(1000);
    }
  }

  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(3500);
  await page.getByRole('button', { name: /Результат/ }).first().click({ timeout: 90_000 });
  await sleep(1500);

  /* ── 1. Состав листа ── */
  const views = await page.evaluate(() =>
    [...document.querySelectorAll('[data-view]')].map((el) => ({
      id: el.getAttribute('data-view'),
      caption: (el.querySelector('figcaption')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    })),
  );

  const ids = views.map((v) => v.id);
  ok(
    'на листе фасад, разрезы, план и аксонометрия',
    ['elevation', 'section', 'section-inside', 'plan', 'axon', 'axon-inside'].every((id) =>
      ids.includes(id),
    ),
    ids.join(', '),
  );
  ok(
    'у каждого вида подпись и масштаб',
    views.length > 0 && views.every((v) => /1:\d+/.test(v.caption) && v.caption.length > 5),
    views.map((v) => v.caption).join(' · '),
  );

  /* ── Лист на экране: вписан, а не обрезан ── */
  await page.evaluate(() => {
    document.querySelector('[data-view="plan"]')?.scrollIntoView({ block: 'center' });
  });
  await sleep(500);

  const onScreen = await page.evaluate(() => {
    const page1 = document.querySelector('[data-sheet-page]');
    const fit = document.querySelector('.mw-sheet-fit');
    if (!page1 || !fit) return null;
    const box = page1.getBoundingClientRect();
    return {
      overflowPx: Math.round(box.right - fit.getBoundingClientRect().right),
      visible: box.width > 100,
    };
  });

  ok(
    'на экране лист вписан в ширину, а не обрезан',
    Boolean(onScreen && onScreen.visible && onScreen.overflowPx <= 2),
    onScreen ? `вылет ${onScreen.overflowPx} px` : 'листа нет',
  );

  await page.screenshot({ path: `${OUT}/screen.png` });

  /* ── Выноски: есть, не пересекаются и не лезут на размеры ── */
  const leaders = await page.evaluate(() => {
    const group = document.querySelector('[data-leaders]');
    if (!group) return null;
    const texts = [...group.querySelectorAll('text')].map((t) => ({
      text: (t.textContent ?? '').trim(),
      box: t.getBoundingClientRect(),
    }));

    let overlaps = 0;
    for (let i = 0; i < texts.length; i += 1) {
      for (let j = i + 1; j < texts.length; j += 1) {
        const a = texts[i].box;
        const b = texts[j].box;
        const hit = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        if (hit) overlaps += 1;
      }
    }

    const pairs = [];
    for (let i = 0; i < texts.length; i += 1) {
      for (let j = i + 1; j < texts.length; j += 1) {
        const a = texts[i].box;
        const b = texts[j].box;
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
          pairs.push(`${texts[i].text.slice(0, 18)} ↔ ${texts[j].text.slice(0, 18)}`);
        }
      }
    }

    return {
      count: texts.length,
      overlaps,
      pairs,
      sample: texts.slice(0, 3).map((t) => t.text),
    };
  });

  if (!leaders) {
    ok('на фасаде есть выноски с материалами', false, 'выносок нет');
  } else {
    ok(
      'на фасаде есть выноски с материалами',
      leaders.count >= 5,
      `${leaders.count} шт. · ${leaders.sample.join(' | ')}`,
    );
    ok('выноски не наезжают друг на друга', leaders.overlaps === 0, `пересечений: ${leaders.overlaps}`);
    if (leaders.overlaps > 0) console.log('  пары:', leaders.pairs.join(' · '));
  }

  /* ── Отраслевые обозначения ── */
  const symbols = await page.evaluate(() => {
    const kinds = [...document.querySelectorAll('[data-symbol]')].map((el) =>
      el.getAttribute('data-symbol'),
    );
    const count = (kind) => kinds.filter((k) => k === kind).length;
    return {
      swing: count('swing'),
      drawer: count('drawer'),
      legend: count('legend'),
      all: kinds.filter((k, i) => kinds.indexOf(k) === i),
    };
  });

  ok(
    'распашные фасады показаны диагоналями',
    symbols.swing > 0,
    `диагоналей: ${symbols.swing} · знаки: ${symbols.all.join(', ')}`,
  );
  ok('легенда коммуникаций есть на плане', symbols.legend > 0);

  /* ── 2. Масштаб на бумаге ── */
  await page.emulateMedia({ media: 'print' });
  await sleep(600);

  const measured = await page.evaluate(() => {
    const probe = document.querySelector('.mw-sheet-probe');
    const pxPerMm = (probe?.getBoundingClientRect().width ?? 0) / 100;
    const read = (id) => {
      const el = document.querySelector(`[data-view="${id}"]`);
      if (!el) return null;
      const caption = el.querySelector('figcaption')?.textContent ?? '';
      const den = Number((caption.match(/1:(\d+)/) ?? [])[1] ?? 0);
      return { widthPx: el.getBoundingClientRect().width, den };
    };
    return { pxPerMm, elevation: read('elevation'), plan: read('plan') };
  });

  if (!measured.pxPerMm || !measured.elevation) {
    ok('лист меряется в печати', false, JSON.stringify(measured));
  } else {
    const { pxPerMm, elevation } = measured;
    // Ширина мебели на бумаге = ширина вида минус поля под отметки.
    // С выносками вид шире: поле рисунка — это 640 единиц из 1120.
    const runOnPaperMm = (elevation.widthPx / pxPerMm) * (640 / 1240);
    const expected = DEMO_RUN_MM / elevation.den;

    console.log(
      `  фасад: ${elevation.widthPx.toFixed(1)} px · ${(elevation.widthPx / pxPerMm).toFixed(1)} мм бумаги · масштаб 1:${elevation.den}`,
    );
    ok(
      'масштаб настоящий: ряд занимает столько, сколько обещает подпись',
      Math.abs(runOnPaperMm - expected) <= 1.5,
      `${runOnPaperMm.toFixed(1)} мм против ${expected.toFixed(1)} мм`,
    );

    const per1000 = 1000 / elevation.den;
    ok(
      'тысяча миллиметров мебели — это ожидаемые миллиметры бумаги',
      Math.abs((runOnPaperMm / DEMO_RUN_MM) * 1000 - per1000) <= 0.5,
      `${((runOnPaperMm / DEMO_RUN_MM) * 1000).toFixed(1)} мм на 1000 мм при 1:${elevation.den}`,
    );
  }

  /* ── 3. Штамп и номер листа ── */
  const stamp = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('[data-sheet-page]')];
    return {
      pages: pages.length,
      labels: pages.map((p) => ((p.textContent ?? '').match(/Лист \d+ из \d+/) ?? [''])[0]),
      hasObject: (document.body.textContent ?? '').includes('Объект'),
    };
  });

  ok('в штампе есть номер листа', stamp.labels.every(Boolean), stamp.labels.join(' · '));
  ok('штамп заполнен', stamp.hasObject, `листов: ${stamp.pages}`);

  /* ── Примечания и позиция ── */
  const notes = await page.evaluate(() => {
    const text = document.body.textContent ?? '';
    const lists = [...document.querySelectorAll('[data-sheet-page] ol')];
    return {
      items: lists.map((ol) => ol.querySelectorAll('li').length),
      hasMillimetres: text.includes('Все размеры даны в миллиметрах'),
      hasWalls: text.includes('чистовой отделки стен'),
      position: (text.match(/МИ-поз\.\d+/) ?? [''])[0],
      product: text.includes('Кухонный гарнитур'),
    };
  });

  ok(
    'девять примечаний на каждом листе',
    notes.items.length > 0 && notes.items.every((n) => n >= 9),
    `по листам: ${notes.items.join(', ')}`,
  );
  ok('примечания называют то, ради чего они есть', notes.hasMillimetres && notes.hasWalls);
  ok('в штампе стоит позиция и изделие', Boolean(notes.position) && notes.product, notes.position);

  await page.screenshot({ path: `${OUT}/print.png`, fullPage: true });
  await page.emulateMedia({ media: 'screen' });

  await browser.close();
  console.log(failures === 0 ? '\nвсё сходится' : `\nпровалов: ${failures}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    server.kill();
    freePort(PORT);
  });
