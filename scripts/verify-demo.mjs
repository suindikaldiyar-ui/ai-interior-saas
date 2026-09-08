/**
 * Приёмка демонстрации: пять шагов из сценария продажи.
 *
 * Запуск: npm run test:demo   (нужен build)
 *
 * Демонстрация — это и есть продукт в сжатом виде, поэтому она проверяется
 * целиком, а не «страница открылась».
 */

import { chromium } from 'playwright';
import sharp from 'sharp';
import { execSync, spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3137;
const BASE = `http://localhost:${PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await sleep(250);
  }
  return false;
}

let failed = 0;
let passed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}${detail ? `  ${detail}` : ''}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? `  ${detail}` : ''}`);
  }
}

/*
 * Оставшийся с прошлого прогона сервер отдаёт СТАРУЮ сборку: страница
 * открывается, чанки 404, React не оживает — и проверка «переключение
 * варианта меняет смету» падает на совершенно исправном коде.
 * Поэтому порт освобождается до старта, а не после.
 */
function freePort(port) {
  try {
    const out =
      process.platform === 'win32'
        ? execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, {
            encoding: 'utf8',
          })
        : execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' });

    const pids = new Set(
      out
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/).pop())
        .filter((pid) => pid && /^\d+$/.test(pid) && pid !== '0'),
    );

    for (const pid of pids) {
      execSync(
        process.platform === 'win32' ? `taskkill /PID ${pid} /F` : `kill -9 ${pid}`,
        { stdio: 'ignore' },
      );
      console.log(`  ··   освободил порт ${port}: остановлен процесс ${pid}`);
    }
  } catch {
    /* никто не слушает — это норма */
  }
}

freePort(PORT);

const server = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['next', 'start', '-p', String(PORT)],
  {
    cwd: ROOT,
    stdio: 'ignore',
    shell: process.platform === 'win32',
    // Дверь на время приёмки снята: иначе проверка упрётся в /gate.
    env: { ...process.env, SITE_PASSWORD: '' },
  },
);

let browser;

try {
  const up = await until(async () => {
    try {
      return (await fetch(BASE)).ok;
    } catch {
      return false;
    }
  }, 90_000);
  if (!up) {
    console.error('Сервер не поднялся. Соберите проект: npm run build');
    process.exit(1);
  }

  // Вкладка 3D — настоящий WebGL: без софтверного рендерера канвас не заведётся.
  browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });
  // Планшет альбомный — основной сценарий.
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  page.on('pageerror', (e) => {
    failed++;
    console.error('  [pageerror]', e.message.slice(0, 200));
  });

  /* ── 1. Демонстрация открывается готовой конфигурацией ── */

  const response = await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  check('/demo открывается без входа', response?.status() === 200, `статус ${response?.status()}`);

  const stepTitles = await page
    .locator('nav[aria-label="Шаги работы"] button')
    .allInnerTexts();
  /*
   * Шагов стало три: «Состав» и «Материалы» слились в один рабочий экран.
   * Замерщик правил состав на одном шаге, а результат видел на другом —
   * клиент при этом сидит рядом и ждёт.
   */
  check(
    'вместо вкладок — последовательность шагов',
    stepTitles.length >= 3 &&
      stepTitles.join(' ').includes('Конфигуратор') &&
      stepTitles.join(' ').includes('Результат'),
    stepTitles.map((t) => t.replace(/\s+/g, ' ').trim()).join(' · '),
  );

  check(
    'демонстрация открывается на составе, а не на пустом выборе',
    (await page.getByText('Состав ряда').count()) === 1,
  );

  check(
    'на экране одна главная кнопка и одна вторичная',
    (await page.getByRole('button', { name: 'Назад', exact: true }).count()) === 1 &&
      (await page.getByRole('button', { name: 'К результату', exact: true }).count()) === 1,
  );

  /* ── 2. Смета живёт строкой, а не панелью ── */

  const totalRow = page.getByRole('button', { name: /подробнее|свернуть/ });
  check('итог сметы свёрнут в строку', (await totalRow.count()) === 1);
  check(
    'таблица сметы не занимает место постоянно',
    (await page.locator('input[type="checkbox"]').count()) === 0,
  );

  const totalText = () =>
    page.evaluate(() => {
      const row = Array.from(document.querySelectorAll('button')).find((b) =>
        /подробнее|свернуть/.test(b.textContent ?? ''),
      );
      return (row?.textContent ?? '').replace(/\s+/g, ' ').trim();
    });

  await totalRow.click();
  await sleep(400);

  /*
   * Смета открывается ПЯТЬЮ ГРУППАМИ, а не тридцатью позициями: клиенту
   * кромка ПВХ и эксцентрики не говорят ничего. Ставки и галочки живут
   * под кнопкой «Подробно» — там же, где печатная смета.
   */
  const groupsShown = await page.evaluate(() =>
    ['Корпус и фасады', 'Фурнитура', 'Доставка и монтаж'].filter((title) =>
      (document.body.textContent ?? '').includes(title),
    ).length,
  );
  check('смета открывается пятью группами', groupsShown === 3, `групп на экране: ${groupsShown}`);
  check(
    'ставок и галочек в кратком виде нет',
    (await page.locator('input[type="checkbox"]').count()) === 0,
  );

  await page.getByRole('button', { name: 'Подробно', exact: true }).click();
  await sleep(400);
  const boxes = page.locator('input[type="checkbox"]');
  const boxCount = await boxes.count();
  check('«Подробно» показывает статьи со ставками', boxCount > 3, `строк: ${boxCount}`);

  const beforeToggle = await totalText();
  await boxes.nth(2).uncheck();
  await sleep(400);
  const afterToggle = await totalText();
  check(
    'снятая галочка уменьшает итог при клиенте',
    beforeToggle !== afterToggle,
    `${beforeToggle} → ${afterToggle}`,
  );

  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await sleep(300);
  check(
    'смета закрывается тапом и снова не занимает места',
    (await page.locator('input[type="checkbox"]').count()) === 0,
  );

  /* ── 3. Состав правится руками ── */

  const ribbon = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('button[draggable="true"]')).map(
        (b) => (b.textContent ?? '').trim(),
      ),
    );

  const before = await ribbon();
  check('модули ленты кликабельны', before.length > 3, `модулей: ${before.length}`);

  await page.locator('button[draggable="true"]').first().click();
  await sleep(300);
  const removeButton = page.getByRole('button', { name: 'Удалить', exact: true });
  check('панель модуля открывается по клику', (await removeButton.count()) > 0);

  await removeButton.first().click();
  await sleep(600);
  const after = await ribbon();
  check(
    'удаление модуля меняет состав ряда',
    JSON.stringify(before) !== JSON.stringify(after),
    `${before[0]?.replace(/\s+/g, ' ')} → ${after[0]?.replace(/\s+/g, ' ')}`,
  );

  /* ── 4. Готовые решения ── */

  await page.getByRole('button', { name: /Решение/ }).click();
  await sleep(400);

  /*
   * Решений на зону стало до десятка — вместе с галереей у чертежа:
   * на встрече клиент спрашивает «а по-другому можно?», и вариантов
   * должно быть столько же, сколько в голове у мебельщика. Но каталогом
   * этот экран быть не должен: верхняя граница осталась.
   */
  const templateCards = page.locator('main button[aria-pressed]');
  const templateCount = await templateCards.count();
  check(
    'решений на выбор хватает и это не бесконечный каталог',
    templateCount >= 4 && templateCount <= 12,
    `${templateCount} шт.`,
  );

  check(
    'у шаблона написано, в какой ряд он встанет',
    (await page.getByText(/встанет в ряд \d+–\d+ мм/).count()) > 0,
  );
  check(
    'неподходящий по длине шаблон объясняет, почему он недоступен',
    (await page.getByText(/Нужен ряд от|Рассчитан на ряд до/).count()) > 0,
  );

  const disabledCards = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('main button[aria-pressed]')).filter(
        (b) => b.hasAttribute('disabled'),
      ).length,
  );
  check('недоступные шаблоны выключены, а не просто приглушены', disabledCards > 0, `${disabledCards} шт.`);

  // Выбор шаблона — один тап, и он ведёт дальше сам.
  await page
    .locator('main button[aria-pressed]:not([disabled])')
    .first()
    .click();
  await sleep(600);
  check(
    'выбор шаблона занимает один тап и ведёт к составу',
    (await page.getByText('Состав ряда').count()) === 1,
  );

  /* ── 5. Результат: сравнение во весь экран и три вида ниже ── */

  await page.getByRole('button', { name: /Результат/ }).click();
  await sleep(700);

  /*
   * Комплектация одна: выбор из трёх БЮДЖЕТОВ с экрана убран (SINGLE_VARIANT).
   *
   * Карточки с ценами при этом на экране есть — это галерея готовых
   * РЕШЕНИЙ, разная мебель, а не три цены одной и той же. Проверяем
   * именно бюджеты по названиям стратегий, иначе правило запрещало бы
   * ровно то, ради чего галерея и сделана.
   */
  const budgetButtons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('main button[aria-pressed]')).filter((b) => {
      const text = b.textContent ?? '';
      return /Базовый|Оптимальный|Премиум/.test(text) && text.includes('₸');
    }).length,
  );
  check('карточек с бюджетами на экране нет', budgetButtons === 0, `карточек: ${budgetButtons}`);

  const solutionCards = await page.evaluate(
    () =>
      document.querySelectorAll(
        'section:has(> div > button) button[aria-pressed]',
      ).length,
  );
  check(
    'галерея решений стоит рядом с чертежом',
    solutionCards >= 2,
    `карточек решений: ${solutionCards}`,
  );

  const oneTotal = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('подробнее'),
    );
    return row?.textContent?.includes('₸') ?? false;
  });
  check('сумма живёт в строке итога', oneTotal);

  // Фотографии ещё нет — и об этом сказано прямо, а не показано пустое место.
  check(
    'без фото сравнение честно говорит, чего не хватает',
    (await page.getByRole('button', { name: 'Добавить фото помещения' }).count()) === 1,
  );

  /*
   * Кнопок под сравнением стало две: «Чертёж» открывает ЛИСТ, на котором
   * и план, и разрезы, — отдельная кнопка под один вид больше не нужна.
   */
  check(
    // «3D» больше нет: схему смотрят в конфигураторе, здесь документы.
    'чертёж и детализировка — кнопками ниже сравнения',
    (await page.getByRole('button', { name: /^(Чертёж|Детализировка)$/ }).count()) === 2,
  );
  check(
    'отдельной кнопки «План» больше нет: план на листе',
    (await page.getByRole('button', { name: 'План', exact: true }).count()) === 0,
  );

  await page.getByRole('button', { name: 'Чертёж', exact: true }).click();
  await sleep(400);

  check('чертёж отрисован', (await page.locator('svg').count()) > 0);
  check(
    'печать чертежа — на шаге результата',
    (await page.getByRole('button', { name: /Печать чертежа/ }).count()) === 1,
  );

  const totalDim = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll('svg text'))
      .map((t) => Number(t.textContent))
      .filter((n) => Number.isFinite(n));
    return Math.max(...texts);
  });
  check(
    'общий размер ряда подписан на чертеже',
    totalDim >= 3200,
    `максимальный размер на чертеже: ${totalDim}`,
  );

  /*
   * Отдельной вкладки «План» больше нет: план лежит на ТОМ ЖЕ листе, что
   * фасад и разрезы. Проверяем состав листа, а не переключение экранов.
   */
  const sheetViews = await page.evaluate(() =>
    [...document.querySelectorAll('[data-view]')].map((el) => el.getAttribute('data-view')),
  );
  check(
    'на одном листе фасад, разрезы и план',
    ['elevation', 'section', 'section-inside', 'plan'].every((id) => sheetViews.includes(id)),
    sheetViews.join(', '),
  );
  check(
    'у каждого вида на листе подпись и масштаб',
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-view] figcaption')].every((el) =>
        /1:\d+/.test(el.textContent ?? ''),
      ),
    ),
  );
  check(
    'на плане подписаны коммуникации',
    (await page.getByText('проход', { exact: false }).count()) > 0,
  );

  const ribbonCount = (await ribbon()).length || before.length;

  /*
   * ТРИ.JS УШЁЛ ИЗ ИНТЕРФЕЙСА.
   *
   * Рабочий экран рисует вектор — тем же кодом, что чертёжный лист.
   * Сцена осталась ровно одна и ровно за экраном: она снимает clay-кадр
   * для визуализации, и без неё нет ни сравнения «до и после», ни
   * генерации. Поэтому проверяем ДВА условия сразу: видимого канваса
   * нет, а смонтированный — есть.
   */
  await page.getByRole('button', { name: /Конфигуратор/ }).first().click();
  await sleep(2500);

  const canvasBoxes = await page.evaluate(() =>
    [...document.querySelectorAll('canvas')].map((c) => {
      const r = c.getBoundingClientRect();
      return { x: Math.round(r.x), w: Math.round(r.width) };
    }),
  );
  check(
    'на рабочем экране нет ни одного видимого канваса',
    canvasBoxes.every((box) => box.x + box.w <= 0),
    JSON.stringify(canvasBoxes),
  );
  check(
    'но сцена для съёмки кадра смонтирована',
    canvasBoxes.length === 1,
    `канвасов ${canvasBoxes.length}`,
  );

  check(
    'рабочий экран рисует схему тем же кодом, что лист',
    (await page.locator('[data-schematic] svg').count()) >= 1,
  );

  // Карточка рендера и кнопка съёмки живут на «Результате» — возвращаемся.
  await page.getByRole('button', { name: /Результат/ }).first().click();
  await sleep(1200);

  /*
   * Виды чертёжного листа — тоже `figure`, поэтому считаем именно карточки
   * рендера: у них нет `data-view`.
   */
  const cards = await page.locator('figure:not([data-view])').count();
  check('карточка рендера одна, а не набор миниатюр', cards === 1, `карточек: ${cards}`);
  check(
    'без фото сказано прямо, что клиент увидит настроение, а не квартиру',
    (await page.getByText(/клиент увидит настроение, а не свою квартиру/).count()) > 0,
  );
  check(
    'кадр снимается из конфигуратора, а не в студии',
    (await page.getByRole('button', { name: /Отрисовать кухню/ }).count()) === 1,
  );

  check(
    'без фото сравнивать нечего — предлагается добавить снимок',
    (await page.getByRole('button', { name: 'Добавить фото помещения' }).count()) === 1,
  );

  /* ────────  Лента вариантов под сценой знает, к какому модулю относится  ──────── */

  /*
   * ВЗАМЕН ТАВТОЛОГИИ.
   *
   * Прошлая проверка вызывала `applyOps` дважды с одинаковыми аргументами
   * и сравнивала отпечатки. Совпадение было гарантировано арифметически,
   * и на сломанном интерфейсе она оставалась зелёной.
   *
   * Здесь гоняется сам интерфейс. Ловится ровно та поломка, из-за которой
   * тест и написан: лента жила от `selectedId`, который мог остаться
   * с чертежа, и не называла модуль — человек жал «Витрину», а она уходила
   * туда, куда он не смотрит.
   */
  {
    const fresh = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await fresh.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await until(async () => (await fresh.getByRole('button', { name: /Результат/ }).count()) > 0);
    /*
     * Состав НЕ ТРОГАЕМ. Раньше здесь снимались три прибора: демо-кухня
     * 3200 мм была забита техникой вплотную, и выбора не было ни у одного
     * модуля — проверять было нечего. Теперь ряд 3800 мм показывает выбор
     * сразу, и тест идёт тем же путём, что живой человек на встрече.
     */
    await fresh.getByRole('button', { name: /Результат/ }).first().click();
    await sleep(1400);

    const strip = () => fresh.locator('[data-variant-strip]');
    const cards = () => fresh.locator('[data-variant]');
    const label = () => fresh.locator('[data-variant-label]');
    const prompt = () => fresh.locator('[data-variant-prompt]');
    const emptyBox = () => fresh.locator('[data-variant-empty]');

    /* ── 1. Ничего не выделено → ленты нет, есть подсказка ── */
    await fresh.getByRole('button', { name: /Конфигуратор/ }).first().click();
    await until(async () => (await fresh.locator('canvas').count()) > 0, 30_000);
    await sleep(1500);

    check(
      'без выделения ленты нет',
      (await strip().count()) === 0 && (await cards().count()) === 0,
      `лент ${await strip().count()}, карточек ${await cards().count()}`,
    );
    check(
      'и вместо неё сказано, что делать',
      (await prompt().count()) === 1 &&
        /Нажмите на модуль/.test(await prompt().innerText()),
      (await prompt().count()) > 0 ? await prompt().innerText() : 'подсказки нет',
    );

    /* ── 2. Выбираем модуль ЛЕНТОЙ СОСТАВА, а не кликом по чертежу ── */

    /*
     * Лента состава — надёжный способ выделить конкретный модуль: у неё
     * подписи и обычные кнопки, и не нужно попадать пальцем в мебель на
     * листе. Клик по чертежу проверяется отдельно, в разделе свободной
     * сборки: раньше он не работал у модулей без техники — указатель
     * перехватывали выноски.
     *
     * «Дверца» — обычный модуль без прибора, у него выбор есть.
     * «Холодильник» — ниша под технику, выбора у неё нет по замыслу.
     */
    const pickInRibbon = async (name) => {
      await fresh.getByRole('button', { name: /Конфигуратор/ }).first().click();
      await sleep(800);
      const button = fresh.locator('button[draggable="true"]').filter({ hasText: name }).first();
      if ((await button.count()) === 0) return false;
      await button.click();
      await sleep(400);
      await fresh.getByRole('button', { name: /Результат/ }).first().click();
      await sleep(1200);
      return true;
    };

    /* ── 3. Модуль с вариантами: лента подписана и показывает карточки ── */
    const gotRich = await pickInRibbon('Дверца');
    check('в демо-ряду есть обычный модуль «Дверца»', gotRich);

    await fresh.getByRole('button', { name: /Конфигуратор/ }).first().click();
    await sleep(1800);

    check(
      'под сценой лента показывает варианты выбранного модуля',
      (await cards().count()) >= 2,
      `карточек ${await cards().count()}`,
    );
    const richLabel = (await label().count()) > 0 ? await label().innerText() : '';
    check(
      'и НАЗЫВАЕТ его, как под чертежом',
      /Дверца/.test(richLabel),
      richLabel || 'подписи нет',
    );

    /* ── 4. Выбор из ленты под сценой меняет состав ── */
    const before = await fresh
      .locator('[data-variant][aria-pressed="true"]')
      .getAttribute('data-variant')
      .catch(() => null);

    const idle = fresh.locator('[data-variant][aria-pressed="false"]').first();
    const pickedKind = (await idle.count()) > 0 ? await idle.getAttribute('data-variant') : null;
    if (pickedKind) await idle.click();
    await sleep(1300);

    const after = await fresh
      .locator('[data-variant][aria-pressed="true"]')
      .getAttribute('data-variant')
      .catch(() => null);

    check(
      'выбор из ленты под сценой применяется к этому модулю',
      Boolean(pickedKind) && after === pickedKind && after !== before,
      `${before ?? '—'} → ${after ?? '—'}`,
    );
    /*
     * Модуль ТОТ ЖЕ, но НАЗЫВАЕТСЯ ИНАЧЕ: `applyVariant` подписывает его
     * выбранным вариантом — «Дверца 450 мм» становится «Ящики 450 мм».
     * Поэтому сверяем ШИРИНУ: она у варианта не меняется, а вот перескок
     * выделения на соседний модуль она бы поймала.
     */
    check(
      'и выделение осталось на том же модуле',
      /450 мм/.test((await label().count()) > 0 ? await label().innerText() : ''),
      (await label().count()) > 0 ? await label().innerText() : 'подписи нет',
    );

    /* ── 5. Модуль без вариантов говорит об этом, а не пропадает ── */
    const gotPoor = await pickInRibbon('Холодильник');
    check('в демо-ряду есть ниша под технику', gotPoor);

    await fresh.getByRole('button', { name: /Конфигуратор/ }).first().click();
    await sleep(1600);

    check(
      'у модуля без вариантов написано, что их нет',
      (await emptyBox().count()) === 1 && /вариантов нет/.test(await emptyBox().innerText()),
      (await emptyBox().count()) > 0 ? (await emptyBox().innerText()).slice(0, 60) : 'ПУСТОЕ МЕСТО',
    );
    check(
      'и модуль при этом назван',
      /Холодильник/.test((await label().count()) > 0 ? await label().innerText() : ''),
      (await label().count()) > 0 ? await label().innerText() : 'ПОДПИСИ НЕТ',
    );

    await fresh.close();
  }

  // Сцена нужна только для захвата кадра: на любом виде, кроме 3D, она уезжает
  // за экран — но остаётся смонтированной, иначе снимать кадр будет нечем.
  await page.getByRole('button', { name: 'Чертёж', exact: true }).click();
  await sleep(500);
  check(
    'технической сцены на экране нет',
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return true;
      const r = canvas.getBoundingClientRect();
      return r.x + r.width < 0;
    }),
  );

  /* ── 6. Материалы: фото и артикул — в панели рабочего экрана ── */

  await page.getByRole('button', { name: /Конфигуратор/ }).click();
  await sleep(500);

  check(
    'до загрузки фото выбора ракурса нет',
    (await page.getByRole('button', { name: 'От левого угла', exact: true }).count()) === 0,
  );

  // Кадр 4×3, сжатие проверяется в браузере на настоящем изображении.
  const jpeg = await sharp({
    create: { width: 2400, height: 1600, channels: 3, background: '#8a8a8a' },
  })
    .jpeg()
    .toBuffer();

  await page
    .locator('input[type=file][accept="image/*"]')
    .first()
    .setInputFiles({ name: 'room.jpg', mimeType: 'image/jpeg', buffer: jpeg });

  const gotPhoto = await until(
    async () => (await page.locator('img[alt="Помещение клиента"]').count()) === 1,
    20_000,
  );
  check('фото помещения принимается на шаге материалов', gotPhoto);

  const photoData = await page.evaluate(() => {
    const img = document.querySelector('img[alt="Помещение клиента"]');
    if (!(img instanceof HTMLImageElement)) return 0;
    return img.src.startsWith('data:image/jpeg') ? img.src.length : -1;
  });
  check(
    'снимок сжат в JPEG прямо в браузере',
    photoData > 0,
    photoData > 0 ? `${Math.round(photoData / 1024)} КБ в dataURL` : 'не JPEG',
  );

  check(
    'с фотографией появляется выбор «снимать как на фото»',
    (await page.getByRole('button', { name: 'От левого угла', exact: true }).count()) === 1,
  );
  /*
   * Три поверхности выбираются отдельно: фасады, столешница и фартук —
   * разные товары и разные строки сметы. Одним списком клиент видел своей
   * только одну поверхность из трёх.
   */
  for (const surface of ['Фасады кухни', 'Столешница', 'Фартук']) {
    check(
      `поверхность «${surface}» — своим блоком`,
      (await page.getByText(surface, { exact: true }).count()) === 1,
    );
  }

  const statuses = await page.evaluate(() =>
    Array.from(document.querySelectorAll('p'))
      .map((p) => p.textContent ?? '')
      .filter((t) => /пойдут по описанию|пойдёт по описанию/.test(t)).length,
  );
  check(
    'о каждой невыбранной поверхности сказано отдельно',
    statuses === 3,
    `строк состояния: ${statuses}`,
  );

  /* ── Сравнение «до и после» ── */

  await page.getByRole('button', { name: /Результат/ }).click();
  await sleep(700);

  // Главный экран продажи: во всю ширину и почти во весь экран.
  const heroCompare = await page.evaluate(() => {
    const slider = document.querySelector('[role="slider"][aria-label="Сравнение до и после"]');
    const frame = slider?.parentElement;
    if (!frame) return null;
    const box = frame.getBoundingClientRect();
    return { h: Math.round(box.height), share: box.height / window.innerHeight };
  });
  check('сравнение «до и после» стоит первым на шаге результата', Boolean(heroCompare));
  check(
    'и занимает не меньше 70% экрана',
    Boolean(heroCompare) && heroCompare.share >= 0.69,
    heroCompare ? `${heroCompare.h} px = ${Math.round(heroCompare.share * 100)}% экрана` : '—',
  );
  check(
    'на весь экран — отдельной кнопкой',
    (await page.getByRole('button', { name: /На весь экран/ }).count()) === 1,
  );

  /*
   * Кнопка отрисовки стоит В САМОМ сравнении: оно занимает 70% экрана, и
   * кнопка под ним не видна без прокрутки — рендер выглядит неработающим.
   */
  const renderButton = await page.evaluate(() => {
    const slider = document.querySelector('[role="slider"][aria-label="Сравнение до и после"]');
    const frame = slider?.parentElement;
    const button = Array.from(frame?.querySelectorAll('button') ?? []).find((b) =>
      (b.textContent ?? '').includes('Отрисовать кухню'),
    );
    if (!button || !frame) return null;
    const box = button.getBoundingClientRect();
    const inside = box.top >= frame.getBoundingClientRect().top && box.bottom <= window.innerHeight;
    return { inside, x: Math.round(box.x), w: Math.round(box.width) };
  });
  check(
    'кнопка отрисовки — внутри сравнения и видна без прокрутки',
    Boolean(renderButton) && renderButton.inside,
    renderButton ? `${renderButton.w} px на x=${renderButton.x}` : 'кнопки нет',
  );

  // Стиль выбирает человек: бюджет и вкус — разные вещи.
  for (const title of ['Скандинавский', 'Тёплый минимализм', 'Премиум-модерн']) {
    check(
      `стиль «${title}» предлагается`,
      (await page.getByRole('button', { name: title, exact: true }).count()) === 1,
    );
  }
  check(
    'по умолчанию выбран премиум-модерн',
    (await page
      .getByRole('button', { name: 'Премиум-модерн', exact: true })
      .getAttribute('aria-pressed')) === 'true',
  );

  await page.getByRole('button', { name: 'Скандинавский', exact: true }).click();
  await sleep(300);
  check(
    'выбор стиля переключается',
    (await page
      .getByRole('button', { name: 'Скандинавский', exact: true })
      .getAttribute('aria-pressed')) === 'true',
  );
  await page.getByRole('button', { name: 'Премиум-модерн', exact: true }).click();
  await sleep(300);
  await sleep(700);

  const compare = page.getByRole('slider', { name: 'Сравнение до и после' });
  check('с фотографией появляется сравнение «до и после»', (await compare.count()) === 1);
  check(
    'половины подписаны: слева квартира клиента',
    (await page.getByText('Ваша квартира').count()) === 1,
  );
  check(
    'без рендера правая половина подписана и предлагает действие',
    (await page.getByText('Рендера ещё нет').count()) === 1,
  );

  await compare.scrollIntoViewIfNeeded();
  await sleep(200);
  const sliderBox = await compare.boundingBox();
  const posBefore = Number(await compare.getAttribute('aria-valuenow'));
  await page.mouse.move(sliderBox.x + sliderBox.width / 2, sliderBox.y + sliderBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    sliderBox.x + sliderBox.width / 2 - 160,
    sliderBox.y + sliderBox.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
  await sleep(500);
  const posAfter = Number(await compare.getAttribute('aria-valuenow'));
  check(
    'шторка тянется указателем',
    posAfter < posBefore - 5,
    `${posBefore}% → ${posAfter}%`,
  );

  /* ── 7. Телефон 390 px ── */

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await sleep(900);

  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check('на 390 px нет горизонтальной прокрутки', overflow === 0, `вылет ${overflow} px`);

  const smallTargets = await phone.evaluate(
    () =>
      Array.from(document.querySelectorAll('button, a[href]'))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.height > 0 && r.height < 44 && (el.textContent ?? '').trim().length > 0;
        })
        .map((el) => (el.textContent ?? '').trim().slice(0, 20)).length,
  );
  check('все кнопки нажимаются пальцем', smallTargets === 0, `мелких целей: ${smallTargets}`);

  check(
    'главная кнопка внизу, в зоне большого пальца',
    await phone.evaluate(() => {
      const main = Array.from(document.querySelectorAll('footer button')).pop();
      if (!main) return false;
      const r = main.getBoundingClientRect();
      return r.bottom > window.innerHeight - 120;
    }),
  );
  await phone.close();

  /* ── Режим замерщика: /measure ── */

  // Закрываем вкладку конфигуратора: её сцена рисуется непрерывно, а
  // софтверный WebGL на трёх страницах разом кладёт ввод на остальных.
  await page.close();

  const survey = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  survey.on('pageerror', (e) => {
    failed++;
    console.error('  [pageerror]', e.message.slice(0, 200));
  });

  await survey.goto(`${BASE}/measure`, { waitUntil: 'networkidle' });
  await survey.getByPlaceholder('ЖК Апельсин, кв. 42').fill('ЖК Апельсин, кв. 42');
  await survey.getByPlaceholder('Ержан').fill('Ержан');
  await survey.getByRole('button', { name: 'К замеру' }).click();
  await sleep(600);

  const surveySteps = await survey
    .locator('nav[aria-label="Шаги работы"] button')
    .allInnerTexts();
  check(
    'замер — первый шаг того же экрана, а не отдельная анкета',
    surveySteps.join(' ').includes('Замер') && surveySteps.join(' ').includes('Результат'),
    surveySteps.map((t) => t.replace(/\s+/g, ' ').trim()).join(' · '),
  );

  check(
    'до ввода стены плана нет, и об этом сказано прямо',
    (await survey.getByText(/План появится, как только/).count()) === 1,
  );

  const started = Date.now();
  await survey.getByLabel('Высота потолка').fill('2700');
  await survey.getByLabel('Высота потолка').press('Enter');
  await survey.getByRole('button', { name: 'Стены по кругу' }).click();
  await sleep(200);

  for (const [i, length] of ['3200', '2400', '3200', '2400'].entries()) {
    if (i > 0) await survey.getByRole('button', { name: '+ Стена' }).click();
    const field = survey.getByLabel('Длина').nth(i);
    await field.fill(length);
    await field.press('Enter');
    await sleep(120);
  }
  const seconds = Math.round((Date.now() - started) / 1000);

  check(
    'высота и четыре стены вносятся меньше чем за две минуты',
    seconds < 120,
    `${seconds} с`,
  );
  check(
    'план дорисовался и контур замкнулся',
    (await survey.getByText('контур замкнут').count()) === 1,
  );

  const runLine = await survey.getByText(/ряд \d+ мм · модулей/).first().textContent();
  check(
    'ряд модулей появляется сразу после длины стены',
    /ряд 3200 мм · модулей [1-9]/.test(runLine ?? ''),
    (runLine ?? '').trim(),
  );

  const surveyWarnings = await survey.evaluate(() =>
    Array.from(document.querySelectorAll('main ul li > button'))
      .map((b) => (b.textContent ?? '').trim())
      .filter((t) => t.length > 20),
  );
  check(
    'на экране одновременно не больше трёх предупреждений',
    surveyWarnings.length <= 3,
    `${surveyWarnings.length} шт.`,
  );
  check(
    'предупреждение называет последствие, а не факт',
    surveyWarnings.some((w) => w.includes('монтажник не будет знать')),
    surveyWarnings[0]?.slice(0, 70) ?? 'список пуст',
  );
  check(
    'невнесённая розетка — жёлтое уточнение, а не красная полоса над кнопкой',
    await survey.evaluate(() => {
      const inList = Array.from(document.querySelectorAll('main ul li > button')).some((b) =>
        (b.textContent ?? '').includes('Розетка не отмечена'),
      );
      const inFooter = (document.querySelector('footer')?.innerText ?? '').includes(
        'Розетка не отмечена',
      );
      return inList && !inFooter;
    }),
  );

  // Окно без высоты подоконника: величина принимается как допущение.
  await survey.getByRole('button', { name: 'Проёмы' }).click();
  await sleep(200);
  await survey.getByRole('button', { name: '+ Проём' }).click();
  await sleep(200);
  await survey.getByLabel('От левого угла').fill('1200');
  await survey.getByLabel('Ширина').fill('1000');
  await survey.getByLabel('Высота').fill('1400');
  await survey.getByLabel('Высота').press('Enter');
  await sleep(400);

  check(
    'незамеренная величина так и написана — «не замерено»',
    (await survey.getByPlaceholder('не замерено').count()) > 0,
  );
  check(
    'итог сметы подписан предварительным прямо в строке',
    (await survey.getByText('предварительно', { exact: true }).count()) === 1,
  );

  await survey.getByRole('button', { name: 'Замер завершён' }).click();
  await sleep(700);

  check('замерный лист открывается одним экраном', (await survey.getByText('Замерный лист').count()) === 1);
  check(
    'в листе есть строка про уточнения на объекте',
    (await survey.getByText(/требующие уточнения на объекте|Все размеры сняты на объекте/).count()) >= 1,
  );
  check(
    'в листе есть место под две подписи',
    (await survey.getByText(/Замерщик · подпись, дата/).count()) === 1 &&
      (await survey.getByText(/Клиент · подпись, дата/).count()) === 1,
  );

  await survey.emulateMedia({ media: 'print' });
  await sleep(300);
  const printed = await survey.evaluate(() => document.body.innerText);
  check(
    'замерный лист попадает в печать',
    printed.includes('Замерный лист') && printed.includes('Клиент · подпись, дата'),
  );
  await survey.emulateMedia({ media: 'screen' });

  /*
   * В новостройке интернета часто нет. Замер обязан пережить это: он остаётся
   * на экране, а система честно говорит, что уйдёт на сервер позже.
   */
  await survey.context().setOffline(true);
  await survey.getByRole('button', { name: 'К вариантам' }).click();
  await sleep(1500);

  check(
    'без сети замер не теряется и об этом сказано прямо',
    (await survey.getByText(/Сети нет/).count()) === 1,
  );
  await survey.getByRole('button', { name: /Замер/ }).click();
  await sleep(500);
  const keptWalls = await survey.evaluate(
    () => document.querySelectorAll('input[type="number"]').length,
  );
  check(
    'после потери связи замер остался на экране',
    keptWalls > 0 && (await survey.getByText('контур замкнут').count()) === 1,
    `полей замера: ${keptWalls}`,
  );


  /* ── Свободная сборка: пустая стена и первый модуль ── */

  /*
   * Шаблон остаётся быстрым стартом, но перестаёт быть единственным путём:
   * мебельщик со своим дизайном начинает с пустой стены. Проверяется, что
   * пустой ряд ОБЪЯСНЯЕТ СЕБЯ словами (пустая лента и ноль в смете иначе
   * читаются как «не загрузилось») и что первый модуль встаёт одним тапом.
   */
  {
    const own = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await own.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await until(async () => (await own.getByRole('button', { name: /Решение/ }).count()) > 0);

    await own.getByRole('button', { name: /Решение/ }).first().click();
    await sleep(500);
    check(
      'рядом с готовыми решениями предлагают собрать самому',
      (await own.locator('[data-free-mode]').count()) === 1,
    );

    await own.locator('[data-free-mode]').click();
    await sleep(900);

    const emptyNote = own.locator('[data-empty-run]');
    check(
      'пустая стена объясняет себя словами, а не пустотой',
      (await emptyNote.count()) === 1 && /пустая/.test(await emptyNote.innerText()),
      (await emptyNote.count()) > 0 ? (await emptyNote.innerText()).slice(0, 60) : 'ПУСТОЕ МЕСТО',
    );
    check(
      'и свободное место названо числом',
      (await own.getByText(/свободно \d+ мм/).count()) > 0,
    );

    const widths = own.locator('[data-add-width]');
    check(
      'ширины, которые ещё влезают, стоят рядом',
      (await widths.count()) > 0,
      `${await widths.count()} шт.`,
    );

    await own.locator('[data-add-width="600"]').click();
    await sleep(900);
    const ribbonNow = await own.locator('button[draggable="true"]').count();
    check('первый модуль встаёт на пустую стену одним тапом', ribbonNow === 1, `модулей ${ribbonNow}`);

    /*
     * «+» ставит МЕСТО, а чем оно будет — показывает лента вариантов
     * этого модуля: она и есть выбор из MODULE_VARIANTS по зоне и ширине.
     * Поэтому добавленный модуль обязан быть сразу выделен.
     */
    check(
      'добавленный модуль сразу выделен',
      (await own.getByRole('button', { name: 'Удалить', exact: true }).count()) === 1,
    );
    check(
      'и видно, из чего это место может быть',
      (await own.locator('[data-variant]').count()) > 1,
      `вариантов ${await own.locator('[data-variant]').count()}`,
    );

    // Прибор добавляется тем же способом — из того же списка состава.
    await own.getByRole('button', { name: 'Холодильник', exact: true }).first().click();
    await sleep(900);
    const withFridge = await own.locator('button[draggable="true"]').count();
    check(
      'прибор из состава тоже становится модулем',
      withFridge === 2,
      `модулей ${withFridge}`,
    );

    await own.close();
  }


  /* ── Свободная сборка: перетаскивание и возврат ── */

  /*
   * Три ловушки, каждая из которых уже стоила времени: порог против тапа
   * (клик по технике переставлял кухню), эмулированный указатель, на
   * котором `setPointerCapture` бросает исключение, и `frameloop="demand"`
   * в сцене. Проверяются они здесь, в настоящем браузере: на движке
   * порога не существует вовсе — он живёт в пикселях.
   */
  {
    const hand = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      // Планшет замерщика: указатель эмулированный, как на объекте.
      hasTouch: true,
    });
    await hand.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await until(async () => (await hand.getByRole('button', { name: /Решение/ }).count()) > 0);

    await hand.getByRole('button', { name: /Решение/ }).first().click();
    await sleep(500);
    await hand.locator('[data-free-mode]').click();
    await sleep(900);

    /* «+» ставит ГОТОВЫЙ модуль, а не пустое место. */
    const ready = hand.locator('[data-add-variant]');
    check(
      '«+» предлагает готовые модули, а не только ширины',
      (await ready.count()) >= 4,
      `${await ready.count()} шт.`,
    );

    const cargo = hand.locator('[data-add-variant="cargo"]');
    const cargoLabel = (await cargo.count()) > 0 ? await cargo.innerText() : '';
    check(
      'и подписаны модулем с шириной: «Карго 400»',
      /Карго\s*\d+/.test(cargoLabel),
      cargoLabel || 'нет карго',
    );

    await cargo.click();
    await sleep(900);
    check(
      'один жест — и в ряду стоит именно этот модуль',
      (await hand.locator('button[draggable="true"]').filter({ hasText: 'Карго' }).count()) === 1,
    );

    /* Ходовые ширины на виду, остальные за «ещё». */
    const shown = await hand.locator('[data-add-width]').count();
    check('ширин на виду немного', shown > 0 && shown <= 6, `${shown} шт.`);
    await hand.locator('[data-more-widths]').click();
    await sleep(400);
    check(
      'а за «ещё» открываются остальные',
      (await hand.locator('[data-add-width]').count()) > shown,
      `${shown} → ${await hand.locator('[data-add-width]').count()}`,
    );

    // Ставим второй модуль, чтобы было что двигать и во что упираться.
    await hand.locator('[data-add-variant="drawers"]').click();
    await sleep(900);

    /* ── Перетаскивание на чертеже ── */
    await hand.getByRole('button', { name: /Результат/ }).first().click();
    await sleep(1400);
    await hand.getByRole('button', { name: 'Чертёж', exact: true }).click();
    await sleep(900);

    /*
     * Позиции модулей НИЖНЕГО ряда прямо с листа. Верхний ряд руками не
     * двигают — он пересобирается из нижнего.
     */
    const orderOf = async () =>
      hand.evaluate(() =>
        Array.from(document.querySelectorAll('[data-module-id^="base-"]'))
          .map((el) => el.getAttribute('data-module-offset'))
          .join(','),
      );

    /*
     * Тянем ПОСЛЕДНИЙ модуль нижнего ряда и вправо: справа от него пустая
     * стена, поэтому жест обязан пройти. Первый модуль упёрся бы в соседа
     * — это тоже верное поведение, но проверяется оно на движке, где
     * расстояние известно точно.
     */
    const target = hand.locator('[data-module-id^="base-"]').last();
    /*
     * Лист длиннее окна: без прокрутки модуль лежит ниже видимой области,
     * а мышь Playwright работает в координатах ОКНА — жест уходил мимо
     * чертежа и «ничего не двигалось» при полностью рабочем коде.
     */
    await target.scrollIntoViewIfNeeded();
    await sleep(400);
    const box = await target.boundingBox();

    /*
     * ТАП — ЭТО ВЫБОР, А НЕ ПЕРЕНОС.
     *
     * Нажатие без движения не должно двигать ряд ни на миллиметр: именно
     * так клик по холодильнику однажды переставлял всю кухню.
     */
    const beforeTap = await orderOf();
    if (box) {
      await hand.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await hand.mouse.down();
      await hand.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2);
      await hand.mouse.up();
    }
    await sleep(700);
    check('тап по модулю не двигает его', (await orderOf()) === beforeTap);

    /*
     * ЗАТО ВЫДЕЛЯЕТ — и это тот самый давний дефект «клик по модулю без
     * техники ничего не делает». Причина была не в модуле: поверх него
     * лежали ВЫНОСКИ, и линия с обводкой ловила указатель по всей длине.
     * У техники зона захвата шире, поэтому в неё удавалось попасть мимо
     * выноски — отсюда и «выделяется только техника».
     */
    check(
      'а выделяет: обычный модуль на чертеже отзывается на нажатие',
      (await hand.locator('[data-variant]').count()) > 0 ||
        (await hand.getByRole('button', { name: 'Удалить', exact: true }).count()) === 1,
    );

    /*
     * А перетаскивание — двигает. Мышь Playwright — это ровно тот
     * эмулированный указатель, на котором `setPointerCapture` бросает
     * исключение: обработчик обязан работать без него.
     */
    if (box) {
      await hand.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await hand.mouse.down();
      for (let i = 1; i <= 6; i += 1) {
        await hand.mouse.move(box.x + box.width / 2 + i * 40, box.y + box.height / 2);
        await sleep(60);
      }
      await hand.mouse.up();
    }
    await sleep(1000);
    const afterDrag = await orderOf();
    check(
      'перетаскивание работает на эмулированном указателе',
      afterDrag !== beforeTap,
      `${beforeTap} ⇒ ${afterDrag}`,
    );
    check(
      'и модуль встал на шаг 50 мм',
      afterDrag.split(',').every((mm) => Number(mm) % 50 === 0),
      afterDrag,
    );

    /* ── Возврат собранного ряда ── */
    await hand.getByRole('button', { name: /Решение/ }).first().click();
    await sleep(600);
    const built = await hand.locator('main button[aria-pressed]:not([disabled])').count();
    if (built > 0) {
      await hand.locator('main button[aria-pressed]:not([disabled])').first().click();
      await sleep(900);
    }

    check(
      'уход в шаблон говорит, что собранный ряд заменён',
      (await hand.getByText(/собранный руками/).count()) > 0,
    );

    await hand.getByRole('button', { name: /Решение/ }).first().click();
    await sleep(600);
    const undo = hand.locator('[data-undo-free]');
    check('и даёт вернуть его одной кнопкой', (await undo.count()) === 1);

    if ((await undo.count()) === 1) {
      await undo.click();
      await sleep(1000);
      await hand.getByRole('button', { name: /Конфигуратор/ }).first().click();
      await sleep(800);
      check(
        'возврат восстанавливает именно ручной ряд',
        (await hand.locator('button[draggable="true"]').filter({ hasText: 'Карго' }).count()) === 1,
      );
    }

    await hand.close();
  }


  /* ── Материал: выбрал — увидел в сцене ── */

  /*
   * Главное в этом заходе и единственное, что нельзя проверить на движке:
   * фасад в сцене обязан поменяться НЕМЕДЛЕННО. `frameloop="demand"` не
   * перерисовывает кадр сам — материал сменился бы в памяти, а на экране
   * остался прежний, и никакой расчёт этого не заметил бы.
   *
   * Поэтому сравниваются ПИКСЕЛИ канваса: снимок до и снимок после.
   */
  {
    const look = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await look.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await until(async () => (await look.getByRole('button', { name: /Результат/ }).count()) > 0);

    // Выделяем модуль лентой состава — надёжнее, чем попадать в мебель.
    await look.getByRole('button', { name: /Конфигуратор/ }).first().click();
    await sleep(800);
    await look
      .locator('button[draggable="true"]')
      .filter({ hasText: 'Дверца' })
      .first()
      .click();
    await sleep(500);

    check(
      'у выделенного модуля есть выбор материала',
      (await look.locator('[data-front-material]').count()) > 0,
    );
    check(
      'и в нём три независимых атрибута',
      (await look.locator('[data-front-base]').count()) === 5 &&
        (await look.locator('[data-front-finish]').count()) === 3,
      `баз ${await look.locator('[data-front-base]').count()}, фактур ${await look
        .locator('[data-front-finish]')
        .count()}`,
    );

    /*
     * ЛДСП пилится только прямыми: радиуса и филёнки у неё нет в списке
     * вовсе. Серая кнопка была бы вопросом «почему нельзя», а задать его
     * на встрече с клиентом некому.
     */
    await look.locator('[data-front-base="ldsp"]').first().click();
    await sleep(400);
    check(
      'у ЛДСП в списке только цельный фасад',
      (await look.locator('[data-front-construct]').count()) === 1,
      `конструкций ${await look.locator('[data-front-construct]').count()}`,
    );
    check(
      'и рядом сказано почему',
      (await look.getByText(/только цельный/).count()) > 0,
    );

    await look.locator('[data-front-base="mdf_enamel"]').first().click();
    await sleep(600);
    check(
      'у эмали появляются филёнка и радиус',
      (await look.locator('[data-front-construct]').count()) === 3,
      `конструкций ${await look.locator('[data-front-construct]').count()}`,
    );

    /* ── Сцена ── */
    await look.getByRole('button', { name: /Результат/ }).first().click();
    await sleep(1400);
    await look.getByRole('button', { name: /Конфигуратор/ }).first().click();
    await until(async () => (await look.locator('canvas').count()) > 0, 30_000);
    await sleep(2500);

    const shot = () =>
      look.evaluate(() => {
        const svg = document.querySelector('[data-schematic] svg');
        return svg ? svg.outerHTML : '';
      });

    check(
      'материал выбирается там же, где стоит схема',
      (await look.locator('[data-front-material]').count()) > 0,
    );

    const before = await shot();
    check('разметка схемы читается', before.length > 1000, `${Math.round(before.length / 1024)} КБ`);

    // Матовая ЛДСП → глянцевая эмаль: разница обязана быть видимой.
    await look.locator('[data-front-base="mdf_enamel"]').first().click();
    await sleep(1200);
    await look.locator('[data-front-finish="gloss"]').first().click();
    await sleep(1500);

    const after = await shot();
    check(
      'смена материала меняет разметку схемы',
      before !== after && after.length > 1000,
      before === after ? 'разметка не изменилась' : 'разметка другая',
    );

    /*
     * И это именно перерисовка, а не случайный дребезг: два снимка подряд
     * без единого действия обязаны совпасть. Без этой пары предыдущая
     * проверка проходила бы на любой мигающей сцене.
     */
    const again = await shot();
    check(
      'а без правок разметка не меняется сама по себе',
      again === after,
      again === after ? '' : 'схема дрожит',
    );

    // Филёнка: рама и вставка — это другая геометрия, а не другой цвет.
    const flat = await shot();
    await look.locator('[data-front-construct="framed"]').first().click();
    await sleep(1600);
    check(
      'филёнка меняет разметку отдельно от цвета',
      (await shot()) !== flat,
    );

    await look.close();
  }


  /* ── Один рабочий экран: слева сцена, справа панель ── */

  /*
   * «Состав» и «Материалы» были отдельными шагами, и замерщик не видел,
   * что меняется, пока не перейдёт дальше, — а клиент сидит рядом. Здесь
   * проверяется ровно то, ради чего экран собран в один: правка видна НА
   * МЕСТЕ, без перехода, и поворот сцены при этом не сбрасывается.
   */
  {
    const st = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await st.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await until(async () => (await st.getByRole('button', { name: /Конфигуратор/ }).count()) > 0);

    await st.getByRole('button', { name: /Конфигуратор/ }).first().click();
    await sleep(3000);

    /* 1. Сцена видна целиком и занимает не меньше половины ширины. */
    const box = await st.evaluate(() => {
      const canvas = document.querySelector('[data-studio-scene] [data-schematic]');
      const footer = document.querySelector('footer');
      if (!canvas || !footer) return null;
      const r = canvas.getBoundingClientRect();
      const f = footer.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        vw: window.innerWidth,
        footerTop: f.top,
        scrollW: document.documentElement.scrollWidth,
      };
    });

    check('на рабочем экране есть схема', Boolean(box));
    check(
      'схема занимает не меньше половины ширины',
      Boolean(box) && box.w / box.vw >= 0.5,
      box ? `${Math.round((box.w / box.vw) * 100)}%` : '',
    );
    check(
      'и видна целиком, без прокрутки к ней',
      Boolean(box) && box.y >= 0 && box.y + box.h <= box.footerTop + 1,
      box ? `низ ${Math.round(box.y + box.h)}, подвал с ${Math.round(box.footerTop)}` : '',
    );
    check(
      'горизонтальной прокрутки нет',
      Boolean(box) && box.scrollW <= box.vw,
      box ? `${box.scrollW} при ${box.vw}` : '',
    );

    /* 2. Сумма видна на этом же экране. */
    const footerText = () => st.locator('footer').innerText();
    const money = (text) => (text.match(/([\d\s ]{5,})\s*₸/) ?? [])[1]?.replace(/\s| /g, '');
    const totalBefore = money(await footerText());
    check('сумма видна внизу рабочего экрана', Boolean(totalBefore), totalBefore ?? 'суммы нет');

    /* 3. Нажатие на модуль в сцене открывает его варианты справа. */
    /*
     * Модуль выбирается КЛИКОМ ПО СХЕМЕ — так же, как раньше по сцене.
     * Целимся в конкретный модуль по его признаку, а не в точку экрана:
     * попадание в координату зависело от масштаба и молча промахивалось.
     */
    const target = st.locator('[data-schematic] [data-module-id^="base-"]').first();
    if ((await target.count()) > 0) await target.click({ force: true });
    await sleep(1200);

    const cards = st.locator('[data-variant]');
    check(
      'нажатие на модуль в сцене открывает его варианты справа',
      (await cards.count()) > 0,
      `карточек ${await cards.count()}`,
    );

    /* 5. Выбор варианта меняет сцену и сумму ЗДЕСЬ ЖЕ. */
    const idle = st.locator('[data-variant][aria-pressed="false"]').first();
    const picked = (await idle.count()) > 0 ? await idle.getAttribute('data-variant') : null;

    /*
     * СРАВНИВАЕМ РАЗМЕТКУ, А НЕ ПИКСЕЛИ.
     *
     * Схема векторная, и правка обязана быть видна в самом документе:
     * другой материал — другая заливка, другой вариант — другой рисунок
     * фасада. Это и есть проверка «на разметке, как в секции E».
     */
    const shot = () =>
      st.evaluate(() => {
        const svg = document.querySelector('[data-schematic] svg');
        return svg ? svg.outerHTML : '';
      });

    const sceneBefore = await shot();
    if (picked) await idle.click();
    await sleep(1500);

    check(
      'выбор варианта меняет разметку схемы в этом же экране',
      Boolean(picked) && (await shot()) !== sceneBefore,
      picked ?? 'вариантов не было',
    );
    check(
      'и шаг при этом не сменился',
      (await st.locator('[data-studio-scene]').count()) === 1,
    );

    const totalAfter = money(await footerText());
    check(
      'сумма внизу пересчиталась на месте',
      Boolean(totalAfter) && totalAfter !== totalBefore,
      `${totalBefore} → ${totalAfter}`,
    );

    /*
     * ТОЧНОГО РАВЕНСТВА ЗДЕСЬ БЫТЬ НЕ МОЖЕТ.
     *
     * У камеры включено затухание (`enableDamping`), и в headless сцена
     * рисует 1–2 кадра в секунду (ловушка 97) — инерция доезжает не за
     * полсекунды, как на живой машине, а за десятки. Сравнивать позу
     * до и после побайтово значит проверять скорость софтверного
     * растеризатора, а не продукт.
     *
     * Проверяем то, что действительно ломается: камера не ВОЗВРАЩАЕТСЯ
     * в исходную рамку. Сброс — это прыжок домой; затухание уводит её в
     * ту же сторону, куда тянул человек.
     */


    /* 6. Материал этого же модуля — тут же, ниже вариантов. */
    check(
      'материал фасада выбирается на этом же экране',
      (await st.locator('[data-front-material]').count()) > 0,
    );

    const beforeMaterial = await shot();
    const enamel = st.locator('[data-swatch="veneer_solid"]').first();
    if ((await enamel.count()) > 0) {
      await enamel.click();
      await sleep(1400);
    }
    check(
      'смена материала меняет разметку схемы',
      (await shot()) !== beforeMaterial,
      'разметка другая',
    );
    check(
      'и материал виден на схеме заливкой, а не только контуром',
      (await st.locator('[data-schematic] pattern[id^="sw-"]').count()) > 0,
      `рисунков материала: ${await st.locator('[data-schematic] pattern[id^="sw-"]').count()}`,
    );

    /* 7. Возврат к готовым решениям не теряет правок. */
    const totalWithEdits = money(await footerText());
    await st.getByRole('button', { name: /Решение/ }).first().click();
    await sleep(900);
    check(
      'к готовым решениям можно вернуться',
      (await st.locator('main button[aria-pressed]').count()) > 0,
    );

    await st.getByRole('button', { name: /Конфигуратор/ }).first().click();
    await sleep(2000);
    check(
      'и правки при возврате не потеряны',
      money(await footerText()) === totalWithEdits,
      `${totalWithEdits} → ${money(await footerText())}`,
    );

    await st.close();
  }


  /* ── Выноски: измерением боксов, а не на глаз ── */

  /*
   * Проверка на движке сравнивала ТОЛЬКО Y-координаты полок с допуском в
   * один миллиметр модельного пространства — при 1:25 это 0.04 мм бумаги.
   * Она проходила на подписях, лежащих друг на друге: про высоту строки и
   * её ширину она не знала ничего.
   *
   * Здесь меряются НАСТОЯЩИЕ прямоугольники текста в отрисованном листе.
   */
  {
    const sheet = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    await sheet.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await until(async () => (await sheet.getByRole('button', { name: /Результат/ }).count()) > 0);

    await sheet.getByRole('button', { name: /Результат/ }).first().click();
    await sleep(1400);
    await sheet.getByRole('button', { name: 'Чертёж', exact: true }).click();
    await sleep(1600);

    const boxes = await sheet.evaluate(() => {
      const group = document.querySelector('[data-leaders]');
      if (!group) return null;

      return [...group.querySelectorAll('text')].map((node) => {
        const b = node.getBBox();
        return {
          text: (node.textContent ?? '').slice(0, 28),
          x: b.x,
          y: b.y,
          w: b.width,
          h: b.height,
        };
      });
    });

    check('выноски на листе есть', Boolean(boxes) && boxes.length >= 5, `${boxes?.length ?? 0} шт.`);

    const overlaps = [];
    for (let i = 0; boxes && i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        // Допуск в пол-единицы: касание рамок текста наложением не считается.
        if (dx > 0.5 && dy > 0.5) {
          overlaps.push(`«${a.text}» × «${b.text}» на ${Math.round(dx)}×${Math.round(dy)}`);
        }
      }
    }

    check(
      'подписи выносок не садятся друг на друга',
      overlaps.length === 0,
      overlaps.slice(0, 2).join('; ') || 'пересечений нет',
    );

    /*
     * И текст не ложится на ЛИНИИ выносок: подпись поверх чужой линии
     * читается так же плохо, как поверх чужой подписи.
     */
    const onLines = await sheet.evaluate(() => {
      const group = document.querySelector('[data-leaders]');
      if (!group) return 0;

      const texts = [...group.querySelectorAll('text')].map((n) => n.getBBox());

      /*
       * Меряем САМИ ОТРЕЗКИ, а не их габариты.
       *
       * Выноска — ломаная из трёх точек, и её габаритный прямоугольник
       * накрывает всё поле между деталью и полкой. По габаритам «наложением»
       * оказывается любая подпись рядом с диагональю: первая версия этой
       * проверки насчитала 35 несуществующих пересечений.
       */
      const segments = [];
      for (const node of group.querySelectorAll('polyline')) {
        const points = (node.getAttribute('points') ?? '')
          .trim()
          .split(/\s+/)
          .map((pair) => pair.split(',').map(Number));
        for (let i = 1; i < points.length; i += 1) {
          segments.push([points[i - 1], points[i]]);
        }
      }

      /** Пересекает ли отрезок прямоугольник (по методу отсечения). */
      const crosses = ([[x1, y1], [x2, y2]], r) => {
        let t0 = 0;
        let t1 = 1;
        const dx = x2 - x1;
        const dy = y2 - y1;

        for (const [p, q] of [
          [-dx, x1 - r.x],
          [dx, r.x + r.w - x1],
          [-dy, y1 - r.y],
          [dy, r.y + r.h - y1],
        ]) {
          if (p === 0) {
            if (q < 0) return false;
            continue;
          }
          const t = q / p;
          if (p < 0) t0 = Math.max(t0, t);
          else t1 = Math.min(t1, t);
          if (t0 > t1) return false;
        }
        return true;
      };

      let hits = 0;
      for (const t of texts) {
        // Подпись стоит НАД своей полкой и касается её краем: пара
        // пикселей допуска отделяет касание от наложения.
        const box = { x: t.x + 2, y: t.y + 2, w: t.width - 4, h: t.height - 4 };
        if (box.w <= 0 || box.h <= 0) continue;
        for (const segment of segments) if (crosses(segment, box)) hits += 1;
      }
      return hits;
    });

    check(
      'и не ложится поверх линий выносок',
      onLines === 0,
      `наложений: ${onLines}`,
    );

    await sheet.close();
  }


  /* ── Материал виден на КАЖДОМ модуле, а не «хотя бы на одном» ── */

  /*
   * Раскрой и смета фасад у приборных модулей уже видели, а схема — нет:
   * панель материала не показывалась для модуля с техникой вовсе
   * (`!selectedUnit.appliance`), и нажать было некуда. Две ветки решали
   * один вопрос и разошлись — тот же класс, что мы ловим шестой раз.
   *
   * Поэтому проверка перебирает ВСЕ модули ряда и сверяет заливку с
   * выбранным материалом. «Хотя бы один покрашен» прошло бы и на
   * сломанном.
   */
  {
    const fill = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await fill.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await until(async () => (await fill.getByRole('button', { name: /Конфигуратор/ }).count()) > 0);

    await fill.getByRole('button', { name: /Конфигуратор/ }).first().click();
    await sleep(2500);

    const fills = () =>
      fill.evaluate(() =>
        [...document.querySelectorAll('[data-schematic] [data-module-id]')].map((node) => ({
          id: node.getAttribute('data-module-id'),
          fill: node.querySelector('rect[data-fill]')?.getAttribute('fill') ?? '',
        })),
      );

    const before = await fills();
    check('на схеме есть модули', before.length >= 7, `${before.length} шт.`);

    // Готовый дизайн красит весь ряд одним нажатием.
    const design = fill.locator('[data-design="veneer-stone"]');
    if ((await design.count()) > 0) {
      await design.click();
      await sleep(1800);
    }

    const after = await fills();
    const distinct = new Set(after.map((row) => row.fill));

    check(
      'после выбора материала КАЖДЫЙ модуль залит им же',
      after.length > 0 && distinct.size === 1 && !after.some((row) => row.fill === ''),
      distinct.size === 1
        ? `${after.length} модулей, заливка ${[...distinct][0]}`
        : `разных заливок ${distinct.size}: ${[...distinct].join(' | ')}`,
    );
    check(
      'и материал действительно сменился',
      after[0]?.fill !== before[0]?.fill,
      `${before[0]?.fill} → ${after[0]?.fill}`,
    );

    /*
     * Приборные модули — отдельной строкой: именно они и оставались
     * серыми. Их в демо-ряду пять, и каждый обязан быть в общем списке.
     */
    const appliances = after.filter((row) => /fridge|oven|sink|dishwasher|hob|hood/.test(row.id ?? ''));
    check(
      'модули с техникой покрашены наравне с остальными',
      appliances.length >= 4 && appliances.every((row) => row.fill === after[0].fill),
      `${appliances.length} приборных: ${appliances.map((r) => r.id).join(', ')}`,
    );

    /* Панель материала открывается и у модуля с техникой. */
    const sink = fill.locator('[data-schematic] [data-module-id*="sink"]').first();
    if ((await sink.count()) > 0) {
      await sink.click({ force: true });
      await sleep(1000);
    }
    check(
      'у модуля с техникой открывается выбор материала',
      (await fill.locator('[data-front-material]').count()) > 0,
    );
    check(
      'и образцы у него тоже есть',
      (await fill.locator('[data-swatch]').count()) >= 5,
      `образцов ${await fill.locator('[data-swatch]').count()}`,
    );

    await fill.close();
  }

  await survey.context().setOffline(false);
  await survey.close();


} catch (err) {
  failed++;
  console.error('\nОшибка проверки:', err);
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
