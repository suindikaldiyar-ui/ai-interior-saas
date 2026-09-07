/**
 * ЖИВОЙ ПРОГОН: визуализация показывает то же, что чертёж.
 *
 * ТРАТИТ настоящие запросы к image-модели — ровно ТРИ, по одному на прогон.
 * Состав специально с витриной и ящиками: именно их модель раньше рисовала
 * сплошными дверцами.
 *
 * Складывает в .capture-check/render-fronts/: чертёж выбранного состава,
 * промпт (без картинок) и три полученные визуализации — чтобы сверить
 * глазами число модулей, ящики, витрину и отсутствие лишних шкафов.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 3224;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/render-fronts';
/*
 * Прогонов ЗА ЗАПУСК. Каждый — настоящий запрос к image-модели: их считают
 * деньгами, поэтому число задано явно, а не «пока не надоест».
 */
const RUNS = Number(process.env.RUNS ?? 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function saveDataUrl(name, dataUrl) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(String(dataUrl).trim());
  if (!match) return 0;
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  const ext = match[1].includes('png') ? 'png' : 'jpg';
  writeFileSync(`${OUT}/${name}.${ext}`, buffer);
  return Math.round(buffer.length / 1024);
}

freePort(PORT);
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
  env: { ...process.env, SITE_PASSWORD: '' },
});

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  /*
   * Промпт перехватываем на лету: по нему видно, что уехало в модель, и
   * его же читает человек, когда картинка вышла не той.
   */
  const prompts = [];
  page.on('request', (request) => {
    if (!request.url().includes('/api/ai/render') || request.method() !== 'POST') return;
    try {
      const body = JSON.parse(request.postData() ?? '{}');
      prompts.push(body);
    } catch {
      /* тело не читается — не страшно */
    }
  });

  for (let i = 0; i < 90; i += 1) {
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

  /* ── Состав: витрина наверху ── */
  const modules = page.locator('[data-view="elevation"] [data-glyph]');
  const count = await modules.count();
  let picked = null;

  for (let i = 0; i < Math.min(count, 14); i += 1) {
    await modules.nth(i).click({ force: true });
    await sleep(300);
    const display = page.locator('[data-variant="upper_display"]');
    if ((await display.count()) > 0) {
      await display.click();
      await sleep(600);
      picked = 'upper_display';
      break;
    }
  }

  console.log(picked ? '  состав: витрина с подсветкой поставлена' : '  ПЛОХО витрину поставить не удалось');

  /*
   * ── Материал: готовый дизайн на весь ряд ──
   *
   * Филёнчатая эмаль — самый требовательный случай: без описания рамы и
   * вставки модель рисует гладкую панель. Ставим её ДО отрисовки, иначе
   * живой прогон подтверждает только наполнение.
   */
  // Дизайны живут на шаге состава — туда и обратно.
  await page.getByRole('button', { name: /Состав/ }).first().click();
  await sleep(900);
  const design = page.locator('[data-design="classic-framed"]');
  if ((await design.count()) > 0) {
    await design.first().click();
    await sleep(1200);
    console.log('  материал: филёнчатая эмаль применена ко всему ряду');
  } else {
    console.log('  ПЛОХО кнопки дизайна нет');
  }
  await page.getByRole('button', { name: /Результат/ }).first().click();
  await sleep(1400);

  /* ── Чертёж этого состава — для сверки глазами ── */
  const sheet = page.locator('[data-view="elevation"]').first();
  await sheet.screenshot({ path: `${OUT}/drawing.png` }).catch(() => undefined);

  /* ── Три прогона ── */
  for (let run = 1; run <= RUNS; run += 1) {
    const button = page
      .getByRole('button', { name: /Отрисовать кухню|Отрисовать заново/ })
      .first();

    if ((await button.count()) === 0) {
      console.log('  ПЛОХО кнопки отрисовки нет');
      break;
    }

    /*
     * Запоминаем картинку ДО запроса: ждать «появления любой» нельзя —
     * на экране уже висит прошлая, и прогон засчитался бы мгновенно,
     * сохранив тот же файл дважды.
     */
    const readImage = () =>
      page.evaluate(() => {
        const images = [...document.querySelectorAll('img')]
          .map((img) => img.getAttribute('src') ?? '')
          .filter((src) => src.startsWith('data:image') || src.includes('/storage/'));
        return images.sort((a, b) => b.length - a.length)[0] ?? null;
      });

    const previous = await readImage();
    const started = Date.now();
    await button.click();

    // Ответ модели идёт до 60 с; ждём с запасом и без опроса вслепую.
    let image = null;
    for (let i = 0; i < 90; i += 1) {
      await sleep(2000);
      const now = await readImage();
      if (now && now !== previous) {
        image = now;
        break;
      }
    }

    const seconds = Math.round((Date.now() - started) / 1000);

    if (!image) {
      const error = await page.evaluate(() => {
        const node = [...document.querySelectorAll('p, div')].find((el) =>
          /не получилось|ошибка|повторить/i.test(el.textContent ?? ''),
        );
        return (node?.textContent ?? '').trim().slice(0, 160);
      });
      console.log(`  прогон ${run}: картинки нет за ${seconds} с. ${error}`);
      continue;
    }

    const kb = image.startsWith('data:') ? saveDataUrl(`render-${run}`, image) : 0;
    if (!kb) {
      // Картинка уехала в Storage — забираем по ссылке.
      const buffer = await page.evaluate(async (src) => {
        const res = await fetch(src);
        const blob = await res.arrayBuffer();
        return Array.from(new Uint8Array(blob));
      }, image);
      writeFileSync(`${OUT}/render-${run}.jpg`, Buffer.from(buffer));
    }

    console.log(`  прогон ${run}: картинка получена за ${seconds} с`);

    // Следующий прогон — тот же состав, новый запрос.
    await sleep(1500);
  }

  /* ── Что уехало в модель ── */
  if (prompts.length > 0) {
    /*
     * Сохраняем СОСТАВ, а не тело целиком: в теле мегабайты base64, а
     * читать человеку нужно ровно то, что описывает мебель.
     */
    const last = prompts[prompts.length - 1];
    const items = (last.items ?? []).map((item) => ({
      label: item.label,
      meta: {
        runModules: item.meta?.runModules,
        runUppers: item.meta?.runUppers,
        runOptions: item.meta?.runOptions,
      },
    }));
    writeFileSync(`${OUT}/items.json`, JSON.stringify(items, null, 2), 'utf8');
    console.log(`  запросов к модели: ${prompts.length}`);
  }

  await browser.close();
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
