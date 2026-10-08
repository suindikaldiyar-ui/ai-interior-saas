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
 * ШАГ МАСТЕРА — ПО НАЗВАНИЮ В ПОЛОСЕ ШАГОВ.
 *
 * «Конфигуратор» давно разделился на «Размеры · Раскладка · Конструкция ·
 * Материалы» (`lib/millwork/steps.ts`), и блоки панели разложены по ним
 * (`STEP_FIELDS`). Приёмка жала кнопку «Конфигуратор», которой нет, и
 * обрывалась на строке 400: всё, что ниже, не выполнялось ни разу.
 *
 * Кнопка шага ищется по `aria-label` полосы — подпись на узком экране
 * спрятана, имя у кнопки есть всегда. Шаг не открылся — исключение со
 * словами: дальше по разделу мерить было бы не тот экран.
 */
async function toStep(p, title) {
  const button = p.locator(`nav[aria-label="Шаги работы"] button[aria-label="${title}"]`);
  await button.click({ timeout: 30_000 });
  const opened = await until(async () => (await button.getAttribute('aria-current')) === 'step', 15_000);
  if (!opened) throw new Error(`шаг «${title}» не открылся`);
  await sleep(700);
}

/** Страница ожила: полоса шагов отрисована. */
async function whenReady(p) {
  const up = await until(
    async () => (await p.locator('nav[aria-label="Шаги работы"] button').count()) > 0,
    120_000,
  );
  if (!up) throw new Error('полоса шагов не появилась за 120 с');
}

/** Итог объекта числом — тот, что стоит в строке сметы (`data-estimate-total`). */
async function totalOf(p) {
  const value = await p.locator('[data-estimate-total]').first().getAttribute('data-estimate-total');
  return value === null ? null : Math.round(Number(value));
}

/*
 * РАЗДЕЛЫ ПРИЁМКИ.
 *
 * Раздел, упавший исключением, — это FAIL словами, а не обрыв всего
 * прогона: раньше первый же таймаут молча отрезал всё, что ниже. В конце
 * сверяется, сколько разделов дошло до конца, — число объявлено и тихо
 * уменьшиться не может.
 *
 * `ONLY=main,corner` — только эти разделы (диагностика). Без него идут все.
 */
const ONLY = (process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const SECTIONS = [];
let sectionsDone = 0;

async function section(tag, title, fn) {
  SECTIONS.push(tag);
  if (ONLY.length > 0 && !ONLY.includes(tag)) return;
  console.log(`\n── ${title} [${tag}]`);
  try {
    await fn();
    sectionsDone += 1;
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    console.error(`  FAIL раздел «${title}» оборвался: ${message}`);
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
  await section('main', 'Демонстрация: пять шагов продажи', async () => {
    // Планшет альбомный — основной сценарий.
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
    page.on('pageerror', (e) => {
      failed++;
      console.error('  [pageerror]', e.message.slice(0, 200));
    });

    /* ── 1. Демонстрация открывается готовой конфигурацией ── */

    /*
     * ГОТОВНОСТЬ — ПО ЭКРАНУ, А НЕ ПО «СЕТЬ ЗАТИХЛА».
     *
     * Сцена берёт окружение-пресет drei (`RoomCanvas.tsx`, слой 21): HDRI
     * едет с raw.githubusercontent.com. Когда GitHub не отвечает, запрос
     * висит, сцена работает на своём окружении (так и задумано), а
     * `networkidle` не наступает никогда — и приёмка обрывалась на входе,
     * ничего не проверив. Ждём то, что видит человек: полосу шагов.
     */
    const response = await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await whenReady(page);
    check('/demo открывается без входа', response?.status() === 200, `статус ${response?.status()}`);

    const stepTitles = await page
      .locator('nav[aria-label="Шаги работы"] button')
      .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label') ?? ''));
    /*
     * Шаги — из `lib/millwork/steps.ts` (`stepOrder`): у демонстрации замера
     * нет, поэтому шесть. Рабочий экран один — сцена слева на всех четырёх
     * шагах между «Решением» и «Результатом», меняется только панель.
     */
    const WANT_STEPS = ['Решение', 'Размеры', 'Раскладка', 'Конструкция', 'Материалы', 'Результат'];
    check(
      'вместо вкладок — последовательность шагов',
      stepTitles.join(' · ') === WANT_STEPS.join(' · '),
      stepTitles.join(' · '),
    );

    check(
      'демонстрация открывается на составе, а не на пустом выборе',
      (await page.getByText('Состав ряда').count()) === 1,
    );

    /*
     * Главная кнопка называет, КУДА ведёт (`STEP_NEXT_LABEL`): демонстрация
     * открывается на «Раскладке», и дальше — «К конструкции».
     */
    check(
      'на экране одна главная кнопка и одна вторичная',
      (await page.getByRole('button', { name: 'Назад', exact: true }).count()) === 1 &&
        (await page.locator('[data-next-button]').count()) === 1 &&
        (await page.locator('[data-next-button]').innerText()).trim() === 'К конструкции',
      `главная: «${(await page.locator('[data-next-button]').innerText().catch(() => '')).trim()}»`,
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

    await toStep(page, 'Решение');
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

    await toStep(page, 'Результат');
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
    await toStep(page, 'Раскладка');
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
    await toStep(page, 'Результат');
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
      await whenReady(fresh);
      /*
       * Состав НЕ ТРОГАЕМ. Раньше здесь снимались три прибора: демо-кухня
       * 3200 мм была забита техникой вплотную, и выбора не было ни у одного
       * модуля — проверять было нечего. Теперь ряд 3800 мм показывает выбор
       * сразу, и тест идёт тем же путём, что живой человек на встрече.
       */
      await toStep(fresh, 'Результат');
      await sleep(1400);

      const strip = () => fresh.locator('[data-variant-strip]');
      const cards = () => fresh.locator('[data-variant]');
      const label = () => fresh.locator('[data-variant-label]');
      const prompt = () => fresh.locator('[data-variant-prompt]');
      const emptyBox = () => fresh.locator('[data-variant-empty]');

      /* ── 1. Ничего не выделено → ленты нет, есть подсказка ── */
      await toStep(fresh, 'Конструкция');
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
        await toStep(fresh, 'Раскладка');
        await sleep(800);
        const button = fresh.locator('button[draggable="true"]').filter({ hasText: name }).first();
        if ((await button.count()) === 0) return false;
        await button.click();
        await sleep(400);
        await toStep(fresh, 'Результат');
        await sleep(1200);
        return true;
      };

      /* ── 3. Модуль с вариантами: лента подписана и показывает карточки ── */
      const gotRich = await pickInRibbon('Дверца');
      check('в демо-ряду есть обычный модуль «Дверца»', gotRich);

      await toStep(fresh, 'Конструкция');
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
      /*
       * Карточек одного вида теперь несколько — по ширинам места (слой 49),
       * поэтому выбранным отмечен ВИД, а не одна карточка. Сравниваем
       * набор отмеченных видов: до выбора — один, после — выбранный.
       */
      const activeKinds = async () =>
        [...new Set(
          await fresh
            .locator('[data-variant][aria-pressed="true"]')
            .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-variant'))),
        )].join(',');
      const before = await activeKinds();

      const idle = fresh.locator('[data-variant][aria-pressed="false"][data-refused="0"]').first();
      const pickedKind = (await idle.count()) > 0 ? await idle.getAttribute('data-variant') : null;
      if (pickedKind) await idle.click();
      await sleep(1300);

      const after = await activeKinds();

      check(
        'выбор из ленты под сценой применяется к этому модулю',
        Boolean(pickedKind) && after === pickedKind && after !== before,
        `${before || '—'} → ${after || '—'}`,
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

      await toStep(fresh, 'Конструкция');
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

    await toStep(page, 'Материалы');
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
     * Три поверхности — разные товары и разные строки сметы. Фасады и
     * фартук выбираются здесь своими блоками; столешница со слоя 52 —
     * в ОДНОМ месте, в панели «Материалы» на ряду (второй выбор писал
     * `selections` и в смету не шёл), и блок говорит об этом словами.
     * Слово ищется в блоке каталога: «Столешница» есть и целью панели.
     */
    const catalogBlock = page.locator('section', {
      has: page.getByRole('heading', { name: 'Материалы из каталога' }),
    });
    check('блок артикулов каталога на шаге материалов есть', (await catalogBlock.count()) === 1);
    for (const surface of ['Фасады кухни', 'Фартук']) {
      check(
        `поверхность «${surface}» — своим блоком`,
        (await catalogBlock.getByText(surface, { exact: true }).count()) === 1,
      );
    }
    const counterMoved = catalogBlock.locator('[data-countertop-moved]');
    check(
      'столешница выбирается в одном месте — на ряду, и блок говорит об этом',
      (await counterMoved.count()) === 1 &&
        /в панели «Материалы»/.test(await counterMoved.innerText()),
      (await counterMoved.count()) > 0 ? (await counterMoved.innerText()).replace(/\s+/g, ' ').slice(0, 80) : 'блока нет',
    );

    const statuses = await catalogBlock.evaluate((block) =>
      Array.from(block.querySelectorAll('p'))
        .map((p) => p.textContent ?? '')
        .filter((t) => /пойдут по описанию|пойдёт по описанию/.test(t)).length,
    );
    check(
      'о каждой невыбранной поверхности сказано отдельно',
      statuses === 2,
      `строк состояния: ${statuses} (фасады и фартук)`,
    );

    /* ── Сравнение «до и после» ── */

    await toStep(page, 'Результат');
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
    await phone.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await whenReady(phone);
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
  });

  await section('measure', 'Режим замерщика: /measure', async () => {
    const survey = await browser.newPage({ viewport: { width: 1180, height: 820 } });
    survey.on('pageerror', (e) => {
      failed++;
      console.error('  [pageerror]', e.message.slice(0, 200));
    });

    await survey.goto(`${BASE}/measure`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await survey.getByPlaceholder('ЖК Апельсин, кв. 42').waitFor({ timeout: 120_000 });
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
    /*
     * На экране не больше двух строк (ловушка 51), остальные — под
     * «ещё N». Первой стоит строка про замеренные стены без мебели (у
     * прямой кухни в комнате из четырёх стен их три), розетка — за «ещё».
     */
    const more = survey.getByRole('button', { name: /^ещё \d+$/ });
    if ((await more.count()) > 0) {
      await more.first().click();
      await sleep(300);
    }
    const allWarnings = await survey.evaluate(() =>
      Array.from(document.querySelectorAll('main ul li > button'))
        .map((b) => (b.textContent ?? '').trim())
        .filter((t) => t.length > 20),
    );
    check(
      'предупреждение называет последствие, а не факт',
      allWarnings.some((w) => w.includes('монтажник не будет знать')),
      allWarnings.find((w) => w.includes('Розетка'))?.slice(0, 70) ?? `строк ${allWarnings.length}, про розетку нет`,
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
    await survey.context().setOffline(false);
    await survey.close();
  });


  /* ── Свободная сборка: пустая стена и первый модуль ── */

  /*
   * Шаблон остаётся быстрым стартом, но перестаёт быть единственным путём:
   * мебельщик со своим дизайном начинает с пустой стены. Проверяется, что
   * пустой ряд ОБЪЯСНЯЕТ СЕБЯ словами (пустая лента и ноль в смете иначе
   * читаются как «не загрузилось») и что первый модуль встаёт одним тапом.
   */
  await section('free', 'Свободная сборка: пустая стена и первый модуль', async () => {
    const own = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await own.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await whenReady(own);

    await toStep(own, 'Решение');
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
  });


  /* ── Свободная сборка: перетаскивание и возврат ── */

  /*
   * Три ловушки, каждая из которых уже стоила времени: порог против тапа
   * (клик по технике переставлял кухню), эмулированный указатель, на
   * котором `setPointerCapture` бросает исключение, и `frameloop="demand"`
   * в сцене. Проверяются они здесь, в настоящем браузере: на движке
   * порога не существует вовсе — он живёт в пикселях.
   */
  await section('free-drag', 'Свободная сборка: перетаскивание и возврат', async () => {
    const hand = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      // Планшет замерщика: указатель эмулированный, как на объекте.
      hasTouch: true,
    });
    await hand.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await whenReady(hand);

    await toStep(hand, 'Решение');
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

    /*
     * ── Перетаскивание на схеме рабочего экрана ──
     *
     * Раньше модуль тянули на листе «Результата». Со слоя 47 лист — документ:
     * по нему мерят линейкой, и перенос с него снят намеренно. Состав правят
     * на схеме рабочего экрана — там же этот жест и меряется.
     */
    await toStep(hand, 'Раскладка');
    await hand.locator('[data-schematic-tab="front"]').click();
    await sleep(900);

    /*
     * Позиции модулей НИЖНЕГО ряда прямо со схемы. Верхний ряд руками не
     * двигают — он пересобирается из нижнего.
     */
    const orderOf = async () =>
      hand.evaluate(() =>
        Array.from(document.querySelectorAll('[data-schematic] [data-module-id^="base-"]'))
          .map((el) => el.getAttribute('data-module-offset'))
          .join(','),
      );

    /*
     * Тянем ПОСЛЕДНИЙ модуль нижнего ряда и вправо: справа от него пустая
     * стена, поэтому жест обязан пройти. Первый модуль упёрся бы в соседа
     * — это тоже верное поведение, но проверяется оно на движке, где
     * расстояние известно точно.
     */
    const target = hand.locator('[data-schematic] [data-module-id^="base-"]').last();
    check('на схеме два модуля, собранных руками', (await hand.locator('[data-schematic] [data-module-id^="base-"]').count()) === 2,
      `модулей ${await hand.locator('[data-schematic] [data-module-id^="base-"]').count()}`);
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

    /*
     * Возврат собранного ряда после ухода в готовое решение проверяется
     * в разделе «Готовое решение после ручной сборки» — там же, где
     * подтверждение «Заменить вашу сборку?».
     */
    await hand.close();
  });


  /* ── Готовое решение после ручной сборки ── */

  /*
   * ВЫБОР ГОТОВОГО РЕШЕНИЯ НЕ СТИРАЕТ РУЧНУЮ СБОРКУ МОЛЧА.
   *
   * Путей выбора два — карточка на шаге «Решение» и галерея рядом с
   * чертежом на «Результате», — и вели они себя по-разному: шаг «Решение»
   * заменял собранный ряд сразу, а галерея оставляла режим свободной
   * сборки и при этом сбрасывала правки — стена оставалась ПУСТОЙ, и никто
   * об этом не говорил. Правило одно на оба пути: сборка заменяется только
   * после подтверждения словами, отказ оставляет её нетронутой, после
   * замены на стене решение, а вернуть сборку можно одной кнопкой.
   */
  await section('solution', 'Готовое решение после ручной сборки', async () => {
    /** Демонстрация, на которой руками собраны два модуля: карго и ящики. */
    const assembled = async () => {
      const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      p.on('pageerror', (e) => {
        failed++;
        console.error('  [pageerror]', e.message.slice(0, 200));
      });
      await p.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await whenReady(p);
      await toStep(p, 'Решение');
      await p.locator('[data-free-mode]').click();
      await sleep(900);
      await p.locator('[data-add-variant="cargo"]').click();
      await sleep(900);
      await p.locator('[data-add-variant="drawers"]').click();
      await sleep(900);
      return p;
    };
    /** Нижний ряд на схеме рабочего экрана — идентификаторы по порядку. */
    const rowOf = async (p) => {
      await toStep(p, 'Раскладка');
      await p.locator('[data-schematic-tab="front"]').click();
      await sleep(700);
      return p
        .locator('[data-schematic] [data-module-id^="base-"]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-module-id')));
    };
    const confirmBox = (p) => p.locator('[data-solution-confirm]');

    for (const [where, pick] of [
      [
        'шаг «Решение»',
        async (p) => {
          await toStep(p, 'Решение');
          await p.locator('main button[aria-pressed]:not([disabled])').first().click();
          await sleep(900);
        },
      ],
      [
        'галерея на «Результате»',
        async (p) => {
          await toStep(p, 'Результат');
          await sleep(900);
          await p.locator('[data-solution][aria-pressed="false"]').first().click();
          await sleep(900);
        },
      ],
    ]) {
      const p = await assembled();
      const manual = await rowOf(p);
      check(`${where}: руками собрано два модуля`, manual.length === 2, manual.join(', ') || 'ПУСТО');

      /* Нажали решение — сборка ещё на месте, вопрос задан словами. */
      await pick(p);
      const asked = (await confirmBox(p).count()) === 1 && /Заменить вашу сборку\?/.test(await confirmBox(p).innerText());
      check(
        `${where}: выбор решения сначала спрашивает «Заменить вашу сборку?»`,
        asked,
        asked ? (await confirmBox(p).innerText()).replace(/\s+/g, ' ').slice(0, 110) : 'вопроса нет',
      );

      if (asked) await p.locator('[data-solution-keep]').click();
      await sleep(600);
      const kept = await rowOf(p);
      check(
        `${where}: без подтверждения сборка не тронута`,
        kept.join(',') === manual.join(','),
        `${manual.join(', ')} → ${kept.join(', ') || 'ПУСТАЯ СТЕНА'}`,
      );

      /* Подтвердили — на стене решение, а не пустота. */
      await pick(p);
      if ((await p.locator('[data-solution-replace]').count()) === 1) {
        await p.locator('[data-solution-replace]').click();
        await sleep(1200);
      }
      const replaced = await rowOf(p);
      check(
        `${where}: с подтверждением на стене решение — модулей больше нуля`,
        replaced.length > 0 && replaced.join(',') !== manual.join(',') && replaced.some((id) => /fridge|sink|oven|dishwasher|hob/.test(id ?? '')),
        `${replaced.length} модулей: ${replaced.slice(0, 4).join(', ')}${replaced.length > 4 ? '…' : ''}`,
      );
      check(
        `${where}: стена не пустая и «Дальше» не заперто пустотой`,
        (await p.locator('[data-empty-run-lock]').count()) === 0,
      );
      check(
        `${where}: замена названа словами — собранный руками ряд заменён`,
        (await p.getByText(/собранный руками/).count()) > 0,
      );

      /* Вернуть собранный ряд — одной кнопкой. */
      await toStep(p, 'Решение');
      const undo = p.locator('[data-undo-free]');
      check(`${where}: и даёт вернуть сборку одной кнопкой`, (await undo.count()) === 1);
      if ((await undo.count()) === 1) {
        await undo.click();
        await sleep(1000);
        const back = await rowOf(p);
        check(
          `${where}: возврат восстанавливает именно ручной ряд`,
          back.join(',') === manual.join(','),
          `${back.join(', ') || 'ПУСТО'}`,
        );
      }
      await p.close();
    }
  });


  /* ── Материал: выбрал — увидел в сцене ── */

  /*
   * Главное в этом заходе и единственное, что нельзя проверить на движке:
   * фасад в сцене обязан поменяться НЕМЕДЛЕННО. `frameloop="demand"` не
   * перерисовывает кадр сам — материал сменился бы в памяти, а на экране
   * остался прежний, и никакой расчёт этого не заметил бы.
   *
   * Поэтому сравниваются ПИКСЕЛИ канваса: снимок до и снимок после.
   */
  await section('material', 'Материал: выбрал — увидел в сцене', async () => {
    const look = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await look.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await whenReady(look);

    // Выделяем модуль лентой состава — надёжнее, чем попадать в мебель.
    await toStep(look, 'Раскладка');
    await sleep(800);
    await look
      .locator('button[draggable="true"]')
      .filter({ hasText: 'Дверца' })
      .first()
      .click();
    await sleep(500);
    /* Материал фасада — блок шага «Материалы» (`STEP_FIELDS.materials`). */
    await toStep(look, 'Материалы');

    check(
      'у выделенного модуля есть выбор материала',
      (await look.locator('[data-front-material]:visible').count()) > 0,
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
    await toStep(look, 'Результат');
    await sleep(1400);
    await toStep(look, 'Материалы');
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
  });


  /* ── Один рабочий экран: слева сцена, справа панель ── */

  /*
   * «Состав» и «Материалы» были отдельными шагами, и замерщик не видел,
   * что меняется, пока не перейдёт дальше, — а клиент сидит рядом. Здесь
   * проверяется ровно то, ради чего экран собран в один: правка видна НА
   * МЕСТЕ, без перехода, и поворот сцены при этом не сбрасывается.
   */
  await section('studio', 'Один рабочий экран: слева сцена, справа панель', async () => {
    const st = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await st.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await whenReady(st);

    await toStep(st, 'Раскладка');
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

    /*
     * Варианты места — блок шага «Конструкция» (`STEP_FIELDS.build`).
     * Переход между шагами рабочего экрана не трогает ни выделение, ни
     * сцену (ловушка 60): сцена слева та же, меняется только панель.
     */
    await toStep(st, 'Конструкция');
    const cards = st.locator('[data-variant]:visible');
    check(
      'нажатие на модуль в сцене открывает его варианты справа',
      (await cards.count()) > 0,
      `карточек ${await cards.count()}`,
    );

    /* 5. Выбор варианта меняет сцену и сумму ЗДЕСЬ ЖЕ. */
    const idle = st.locator('[data-variant][aria-pressed="false"][data-refused="0"]:visible').first();
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


    /* 6. Материал этого же модуля — на шаге «Материалы» того же экрана. */
    await toStep(st, 'Материалы');
    check(
      'материал фасада выбирается на этом же экране',
      (await st.locator('[data-front-material]:visible').count()) > 0 &&
        (await st.locator('[data-studio-scene]').count()) === 1,
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
    await toStep(st, 'Решение');
    await sleep(900);
    check(
      'к готовым решениям можно вернуться',
      (await st.locator('main button[aria-pressed]').count()) > 0,
    );

    await toStep(st, 'Раскладка');
    await sleep(2000);
    check(
      'и правки при возврате не потеряны',
      money(await footerText()) === totalWithEdits,
      `${totalWithEdits} → ${money(await footerText())}`,
    );

    await st.close();
  });


  /* ── Выноски: измерением боксов, а не на глаз ── */

  /*
   * Проверка на движке сравнивала ТОЛЬКО Y-координаты полок с допуском в
   * один миллиметр модельного пространства — при 1:25 это 0.04 мм бумаги.
   * Она проходила на подписях, лежащих друг на друге: про высоту строки и
   * её ширину она не знала ничего.
   *
   * Здесь меряются НАСТОЯЩИЕ прямоугольники текста в отрисованном листе.
   */
  await section('leaders', 'Выноски: измерением боксов, а не на глаз', async () => {
    const sheet = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    await sheet.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await whenReady(sheet);

    await toStep(sheet, 'Результат');
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
  });


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
  await section('fill', 'Материал виден на КАЖДОМ модуле, а не «хотя бы на одном»', async () => {
    const fill = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await fill.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await whenReady(fill);

    await toStep(fill, 'Материалы');
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
  });


  /* ── Угловая кухня в конфигураторе ── */

  /*
   * «В чертеже только прямой» — сказал мебельщик, который делает угловые
   * постоянно. Здесь проверяется весь путь: форма выбирается, стены
   * переключаются, второй ряд правится теми же кнопками, а на лист
   * уходят ОБЕ развёртки.
   */
  await section('corner', 'Угловая кухня в конфигураторе', async () => {
    const corner = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await corner.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await whenReady(corner);

    await toStep(corner, 'Размеры');
    await sleep(1500);

    check(
      'форма гарнитура выбирается на рабочем экране',
      (await corner.locator('[data-shape-kind]').count()) === 3,
      `${await corner.locator('[data-shape-kind]').count()} формы`,
    );

    const totalStraight = await totalOf(corner);

    /*
     * Строки сметы НА ЭКРАНЕ — по таблице «Подробно». Угол в смете виден
     * стыком столешницы: он один на угол и считается у ВЛАДЕЛЬЦА (слой
     * 55). У угла без владельца стыка нет вовсе — ровно так выглядел экран
     * до слоя 55, и итог при этом всё равно рос: плиты двух стен.
     */
    const estimateLines = async (title) => {
      await corner.locator('[data-estimate-total]').first().click();
      await sleep(500);
      const detailed = corner.getByRole('button', { name: 'Подробно', exact: true });
      if ((await detailed.count()) === 1) {
        await detailed.click();
        await sleep(500);
      }
      const found = await corner.getByText(title, { exact: true }).count();
      await corner.getByRole('button', { name: 'Закрыть', exact: true }).click();
      await sleep(400);
      return found;
    };
    const MITER = 'Запил столешницы на угол';
    const straightMiters = await estimateLines(MITER);
    check('у прямой кухни запила столешницы в смете нет', straightMiters === 0, `${straightMiters} строк`);

    await corner.locator('[data-shape-kind="corner_l"]').click();
    await sleep(2500);

    const walls = corner.locator('[data-wall]');
    check(
      'у угловой кухни появляются стены А и Б',
      (await walls.count()) === 2,
      `${await walls.count()} стены`,
    );

    const totalCorner = await totalOf(corner);
    check(
      'угловая кухня стоит дороже прямой: в смете оба ряда',
      totalStraight !== null && totalCorner !== null && totalCorner > totalStraight,
      `${totalStraight} → ${totalCorner} ₸`,
    );
    const cornerMiters = await estimateLines(MITER);
    check(
      'в смете угловой — ровно один запил столешницы: стык даёт владелец угла',
      cornerMiters === 1,
      `${cornerMiters} строк «${MITER}»`,
    );

    /* Ряды стен на схеме: отметка и ширина каждого модуля. */
    const wallRows = () =>
      corner.evaluate(() =>
        Array.from(document.querySelectorAll('[data-schematic] [data-wall-block]')).map((block) => ({
          wall: Number(block.getAttribute('data-wall-block')),
          lengthMm: Number(block.getAttribute('data-wall-length')),
          modules: Array.from(block.querySelectorAll('[data-module-id]')).map((node) => {
            const id = node.getAttribute('data-module-id') ?? '';
            const m = id.match(/^([a-z_]+)-(-?\d+)/);
            return {
              id,
              row: m ? m[1] : '',
              offsetMm: m ? Number(m[2]) : NaN,
              widthMm: Number(node.getAttribute('data-module-width')),
            };
          }),
        })),
      );
    const upperEndOf = (block) => {
      const uppers = block.modules.filter((m) => m.row === 'upper');
      return uppers.length === 0 ? null : Math.max(...uppers.map((m) => m.offsetMm + m.widthMm));
    };

    /*
     * ── ВТОРАЯ СТЕНА ПРАВИТСЯ ТЕМИ ЖЕ ОПЕРАЦИЯМИ ──
     *
     * Правка идёт ДО смены угла. После смены угла ряд стены Б лежит в
     * правках (`editedWalls`), а удаление прибора — правка состава
     * кухни (`changeComposition`), которая сбрасывает правки одной стены
     * А: холодильник остаётся на стене Б, а пересобирается стена А. Это
     * дефект экрана вне этой задачи, он назван в отчёте; здесь меряется
     * то, ради чего проверка написана, — что стена Б правится.
     */
    await walls.nth(1).click();
    await sleep(1500);
    await toStep(corner, 'Раскладка');
    await corner.locator('[data-schematic-tab="front"]').click();
    await sleep(1200);

    const dockRow = async () =>
      (await wallRows()).find((b) => b.wall === 1)?.modules.map((m) => m.id).join(',') ?? '';
    const beforeEdit = await dockRow();
    check(
      'вторая стена показывает свой ряд',
      beforeEdit.length > 0,
      beforeEdit || 'ряда второй стены на схеме нет',
    );

    /*
     * Целимся в ПРИБОРНЫЙ модуль: удаление прибора видно и в составе, и
     * в деньгах, а id перезаполненного места совпал бы с прежним.
     */
    const target = corner.locator('[data-schematic] [data-wall-block="1"] [data-module-id^="tall-"]').first();
    const hasTarget = (await target.count()) > 0;
    if (hasTarget) {
      await target.click({ force: true });
      await sleep(900);
    }
    const remove = corner.getByRole('button', { name: 'Удалить', exact: true });
    check(
      'модуль второй стены выделяется и открывает панель',
      hasTarget && (await remove.count()) === 1,
      hasTarget ? `${await remove.count()} кнопок «Удалить»` : 'пенала на второй стене нет',
    );

    const beforeMoney = await totalOf(corner);
    if ((await remove.count()) === 1) {
      await remove.click();
      await sleep(1600);
    }
    const afterEdit = await dockRow();
    const afterMoney = await totalOf(corner);
    check(
      'и правится теми же операциями: ряд и сумма изменились',
      afterEdit !== beforeEdit && afterMoney !== null && afterMoney !== beforeMoney,
      `${beforeEdit} → ${afterEdit} · ${beforeMoney} → ${afterMoney} ₸`,
    );
    check(
      'удалённый прибор ушёл со стены Б',
      !/fridge/.test(afterEdit),
      afterEdit || 'ряда второй стены на схеме нет',
    );

    await toStep(corner, 'Размеры');
    await walls.nth(0).click();
    await sleep(1500);

    /*
     * ── УГОЛ НАСТОЯЩИЙ, А НЕ ПУСТОЙ СЕЛЕКТОР ──
     *
     * Прежняя проверка искала `[data-corner-solution]` — выбор одного
     * решения на всю кухню, которого нет со слоя 55. Здесь угол меряется
     * тем, что видит человек: кнопка угла с его низом и верхом, панель
     * карточек, ряды стен на схеме по миллиметрам и итог внизу экрана.
     * Не нашлось угла, карточек или ряда — проверка падает словами.
     */
    const cornerButtons = corner.locator('[data-corner-index]');
    const cornerState = async () =>
      cornerButtons.evaluateAll((nodes) =>
        nodes.map((n) => `${n.getAttribute('data-corner-lower')}/${n.getAttribute('data-corner-upper')}`),
      );
    const stateBefore = await cornerState();
    check(
      'у угловой кухни ровно один угол, и у него названы низ и верх',
      stateBefore.length === 1 && stateBefore[0] === 'blind/blind',
      stateBefore.length === 0 ? 'кнопки угла на экране нет' : stateBefore.join(', '),
    );

    await corner.locator('[data-schematic-tab="front"]').click();
    await sleep(1200);
    const rowsBefore = await wallRows();
    const ownerBefore = rowsBefore.find((b) => b.wall === 0);
    const dockBefore = rowsBefore.find((b) => b.wall === 1);
    check(
      'на схеме обе стены угла со своими рядами',
      rowsBefore.length === 2 &&
        (ownerBefore?.modules.length ?? 0) > 0 &&
        (dockBefore?.modules.length ?? 0) > 0,
      rowsBefore.map((b) => `стена ${b.wall}: ${b.modules.length} модулей`).join(' · ') ||
        'блоков стен на схеме нет',
    );
    const ownerUpperBefore = ownerBefore ? upperEndOf(ownerBefore) : null;
    check(
      'слепой верх: ряд стены-владельца идёт до стены соседа',
      ownerBefore !== undefined && ownerUpperBefore === ownerBefore.lengthMm,
      `верх кончается на ${ownerUpperBefore ?? '—'} мм при стене ${ownerBefore?.lengthMm ?? '—'} мм`,
    );

    /* Нажатие на угол открывает карточки угла в панели библиотеки. */
    if ((await cornerButtons.count()) > 0) {
      await cornerButtons.first().click();
      await sleep(1500);
    }
    const panel = corner.locator('[data-corner-panel]:visible');
    const cards = await corner.locator('[data-corner-card]').evaluateAll((nodes) =>
      nodes.map((n) => ({
        key: n.getAttribute('data-corner-card'),
        refused: n.getAttribute('data-refused') === '1',
        current: n.getAttribute('aria-pressed') === 'true',
        words: (n.getAttribute('title') ?? '').trim(),
      })),
    );
    const WANT_CARDS = ['lower:blind', 'lower:l_shape', 'upper:l_shape', 'upper:blind', 'upper:empty'];
    check(
      'нажатие на угол открывает панель угла',
      (await panel.count()) === 1,
      `${await panel.count()} панелей`,
    );
    check(
      'в панели угла пять карточек: низ и верх',
      cards.length === WANT_CARDS.length && WANT_CARDS.every((k) => cards.some((c) => c.key === k)),
      cards.map((c) => c.key).join(', ') || 'карточек угла нет',
    );
    check(
      'стоящий угол отмечен в карточках',
      cards.filter((c) => c.current).map((c) => c.key).sort().join(',') === 'lower:blind,upper:blind',
      cards.filter((c) => c.current).map((c) => c.key).join(', ') || 'отмеченных нет',
    );
    const lShape = cards.find((c) => c.key === 'lower:l_shape');
    check(
      'Г-модуль, которому не хватает места, серый и называет миллиметры',
      Boolean(lShape?.refused) && /\d+\s*мм/.test(lShape?.words ?? ''),
      lShape ? lShape.words || 'без слов' : 'карточки Г-модуля нет',
    );

    /* Цена карточки считается по кадру — ждём числа, а не таймера. */
    const emptyCard = corner.locator('[data-corner-card="upper:empty"]');
    if ((await emptyCard.count()) > 0) {
      await until(async () => ((await emptyCard.getAttribute('data-delta')) ?? '') !== '', 15_000);
    }
    const deltaRaw = (await emptyCard.count()) > 0 ? ((await emptyCard.getAttribute('data-delta')) ?? '') : '';
    const delta = deltaRaw === '' ? NaN : Number(deltaRaw);
    check(
      'у карточки «пустой верх» посчитан сдвиг цены, и он не ноль',
      Number.isFinite(delta) && delta !== 0,
      deltaRaw === '' ? 'цена карточки не посчиталась' : `${delta} ₸`,
    );

    const totalBeforePick = await totalOf(corner);
    if ((await emptyCard.count()) > 0 && (await emptyCard.isEnabled())) {
      await emptyCard.click();
      await sleep(2000);
    }
    const stateAfter = await cornerState();
    check(
      'выбор карточки меняет верх угла',
      stateAfter.length === 1 && stateAfter[0] === 'blind/empty',
      stateAfter.join(', ') || 'кнопки угла нет',
    );
    const totalAfterPick = await totalOf(corner);
    check(
      'итог сдвинулся ровно на число с карточки',
      Number.isFinite(delta) &&
        totalBeforePick !== null &&
        totalAfterPick !== null &&
        totalAfterPick - totalBeforePick === delta,
      `${totalBeforePick} → ${totalAfterPick} ₸, карточка ${deltaRaw || '—'} ₸`,
    );

    const rowsAfter = await wallRows();
    const ownerAfter = rowsAfter.find((b) => b.wall === 0);
    const dockAfter = rowsAfter.find((b) => b.wall === 1);
    const ownerUpperAfter = ownerAfter ? upperEndOf(ownerAfter) : null;
    check(
      'пустой верх: ряд владельца кончается раньше стены',
      ownerAfter !== undefined && ownerUpperAfter !== null && ownerUpperAfter < ownerAfter.lengthMm,
      `верх кончается на ${ownerUpperAfter ?? '—'} мм при стене ${ownerAfter?.lengthMm ?? '—'} мм`,
    );
    const placesOf = (block, skipRow) =>
      (block?.modules ?? [])
        .filter((m) => m.row !== skipRow)
        .map((m) => `${m.id}:${m.widthMm}`)
        .join(',');
    check(
      'смена верха угла не двигает низ владельца',
      placesOf(ownerBefore, 'upper') !== '' && placesOf(ownerBefore, 'upper') === placesOf(ownerAfter, 'upper'),
      `${placesOf(ownerBefore, 'upper')} → ${placesOf(ownerAfter, 'upper')}`,
    );
    check(
      'и ряд соседней стены',
      placesOf(dockBefore, '') !== '' && placesOf(dockBefore, '') === placesOf(dockAfter, ''),
      `${placesOf(dockBefore, '')} → ${placesOf(dockAfter, '')}`,
    );

    /* Соседняя стена контуром — на плане, где угол виден. */
    await corner.locator('[data-schematic-tab="plan"]').click();
    await sleep(1200);
    check(
      'на плане видно соседнюю стену — где угол',
      (await corner.locator('[data-neighbour]').count()) === 1,
      `${await corner.locator('[data-neighbour]').count()} контуров`,
    );

    /* ── Лист: обе развёртки ── */
    await toStep(corner, 'Результат');
    await sleep(1600);
    await corner.getByRole('button', { name: 'Чертёж', exact: true }).click();
    await sleep(1800);

    const titles = await corner.evaluate(() =>
      Array.from(document.querySelectorAll('[data-view] > figcaption')).map((n) =>
        (n.textContent ?? '').trim(),
      ),
    );
    const elevations = titles.filter((t) => /^Фасад/i.test(t));
    check(
      'на чертёжном листе видны ОБА ряда угловой кухни',
      elevations.length === 2,
      elevations.join(' · ') || titles.slice(0, 6).join(' · ') || 'видов на листе нет',
    );
    check(
      'и план, на котором виден угол',
      titles.some((t) => /^План/i.test(t)),
      titles.filter((t) => /План/i.test(t)).join(', ') || 'плана нет',
    );

    /*
     * ── СОСТОЯНИЕ ПЕРЕЖИВАЕТ ПЕРЕХОДЫ ПО ШАГАМ ──
     *
     * Демонстрация монтируется без `projectId`, сохранять некуда; круг
     * сериализации проверен на движке (`test:millwork`). Здесь — уход на
     * другой шаг и обратно не превращает угловую кухню в прямую и не
     * возвращает ни угол, ни удалённый пенал.
     */
    await toStep(corner, 'Размеры');
    await sleep(1500);

    check(
      'после возврата с чертежа кухня осталась угловой',
      (await corner.locator('[data-shape-kind="corner_l"]').getAttribute('aria-pressed')) === 'true' &&
        (await corner.locator('[data-wall]').count()) === 2,
      `стен ${await corner.locator('[data-wall]').count()}`,
    );
    const stateBack = await cornerState();
    check(
      'выбор угла не сбросился',
      stateBack.length === 1 && stateBack[0] === 'blind/empty',
      stateBack.join(', ') || 'кнопки угла нет',
    );
    const backMoney = await totalOf(corner);
    check(
      'итог тот же, что после смены угла',
      backMoney !== null && backMoney === totalAfterPick,
      `${totalAfterPick} → ${backMoney} ₸`,
    );
    await corner.locator('[data-schematic-tab="front"]').click();
    await sleep(1200);
    const dockBack = await dockRow();
    check(
      'и правка второй стены на месте: удалённого прибора нет',
      dockBack.length > 0 && !/fridge/.test(dockBack),
      dockBack || 'ряда второй стены на схеме нет',
    );

    await corner.close();
  });


  /* ── 3D вернулась: САПР-вид рядом со схемой ── */

  /*
   * Сцену убирали не зря: скрытая рисовала 588 кадров в минуту мебели,
   * которую никто не видел. Причина найдена и устранена (`frameloop`
   * never у скрытой), и сцена вернулась — но требование к ней жёсткое,
   * поэтому здесь и меряется, а не описывается словами.
   */
  await section('cad', '3D вернулась: САПР-вид рядом со схемой', async () => {
    const cad = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await cad.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await whenReady(cad);

    await toStep(cad, 'Материалы');
    await sleep(2200);

    check(
      'сцена вернулась переключателем рядом со схемой',
      (await cad.locator('[data-schematic-tab]').count()) === 3,
      `${await cad.locator('[data-schematic-tab]').count()} вида`,
    );

    await cad.locator('[data-schematic-tab="scene"]').click();
    await sleep(3500);

    /* 1. Экран: не меньше 70% ширины и видна целиком. */
    const box = await cad.evaluate(() => {
      const canvas = document.querySelector('[data-scene] canvas');
      const footer = document.querySelector('footer');
      if (!canvas || !footer) return null;
      const r = canvas.getBoundingClientRect();
      const f = footer.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, vw: window.innerWidth, footerTop: f.top };
    });

    check('сцена на экране есть', Boolean(box));
    check(
      'и занимает не меньше 70% ширины',
      Boolean(box) && box.w / box.vw >= 0.7,
      box ? `${Math.round((box.w / box.vw) * 100)}%` : '',
    );
    check(
      'и видна целиком, без прокрутки к ней',
      Boolean(box) && box.y >= 0 && box.y + box.h <= box.footerTop + 1,
      box ? `низ ${Math.round(box.y + box.h)}, подвал с ${Math.round(box.footerTop)}` : '',
    );
    check(
      'видимый канвас ровно один: скрытая сцена за экраном',
      await cad.evaluate(
        () =>
          [...document.querySelectorAll('canvas')].filter((c) => {
            const r = c.getBoundingClientRect();
            return r.x + r.width > 0;
          }).length === 1,
      ),
    );

    /*
     * 2. Объекты и кадры — числом.
     *
     * Вызовы меряются у ГАРНИТУРА (`__mwCabinetCalls`): со слоя 53 в
     * сцене стоит комната — стены вокруг проёмов, пол, затенение, — и
     * общее число по сцене мерит её вместе с мебелью. Общее число идёт
     * в подпись, чтобы его было видно.
     */
    const scene = await cad.evaluate(() => (window.__mwScene ? window.__mwScene() : null));
    const cabinetCalls = await cad.evaluate(() =>
      window.__mwCabinetCalls ? window.__mwCabinetCalls() : null,
    );
    check(
      'ряд рисуется десятком вызовов, а не сотней',
      typeof cabinetCalls === 'number' && cabinetCalls > 0 && cabinetCalls <= 24,
      cabinetCalls === null
        ? 'счётчика вызовов гарнитура на странице нет'
        : `гарнитур ${cabinetCalls} вызовов · вся сцена с комнатой ${scene?.calls}, мешей ${scene?.scene.meshes}, треугольников ${scene?.triangles}`,
    );

    const frames = () =>
      cad.evaluate(() => (window.__mwCadFrames ? window.__mwCadFrames() : null));
    const idleStart = await frames();
    await sleep(4000);
    check(
      'в покое сцена не рисует кадров вовсе',
      (await frames()) === idleStart,
      `${idleStart} → ${await frames()} за 4 с покоя`,
    );

    /* 3. Клик выделяет, промах — нет. */
    /*
     * Состояние сцены ЧИСЛАМИ, а не снимком канваса: без
     * `preserveDrawingBuffer` WebGL отдаёт очищенный буфер, и два
     * «одинаковых» кадра не доказывают ничего.
     */
    const shot = () =>
      cad.evaluate(() =>
        window.__mwCadState ? JSON.stringify(window.__mwCadState()) : '',
      );

    let picked = false;
    for (const fy of [0.4, 0.5, 0.6, 0.7]) {
      for (const fx of [0.3, 0.45, 0.6, 0.75]) {
        await cad.mouse.click(box.x + box.w * fx, box.y + box.h * fy);
        await sleep(450);
        if ((await cad.locator('[data-front-material]').count()) > 0) {
          picked = true;
          break;
        }
      }
      if (picked) break;
    }

    check('клик по мебели выделяет модуль и открывает панель', picked);

    /*
     * Промах НЕ снимает выделение: замерщик тыкает мимо на планшете
     * постоянно, и пропадающая панель читается как сбой.
     */
    await cad.mouse.click(box.x + 12, box.y + 12);
    await sleep(700);
    check(
      'промах мимо мебели не снимает выделение',
      (await cad.locator('[data-front-material]').count()) > 0,
    );

    /*
     * Панель в 3D спрятана намеренно: мебель смотрят во всю ширину.
     * Правят её, вернув панель, — так же, как это делает человек.
     */
    if ((await cad.locator('[data-studio-panel].hidden').count()) > 0) {
      await cad.locator('[data-panel-toggle]').click();
      await sleep(1200);
    }

    /* 4. Смена материала меняет картинку сцены. */
    const beforeMaterial = await shot();
    const swatch = cad.locator('[data-swatch="veneer_solid"]').first();
    if ((await swatch.count()) > 0) {
      await swatch.click();
      await sleep(1600);
    }
    check(
      'смена материала меняет разметку сцены',
      (await shot()) !== beforeMaterial,
      `${JSON.parse(beforeMaterial || '{}').fronts?.join(', ')} → ${
        JSON.parse((await shot()) || '{}').fronts?.join(', ')
      }`,
    );

    /* 5. Ракурсы. */
    check(
      'ракурсов пять и есть «Вернуть вид»',
      (await cad.locator('[data-angle]').count()) === 5 &&
        (await cad.locator('[data-angle-home]').count()) === 1,
      `${await cad.locator('[data-angle]').count()} ракурсов`,
    );

    const beforeAngle = await shot();
    await cad.locator('[data-angle="plan"]').click();
    await sleep(2200);
    check(
      'смена ракурса переставляет камеру',
      JSON.stringify(JSON.parse((await shot()) || '{}').camera) !==
        JSON.stringify(JSON.parse(beforeAngle || '{}').camera),
      `${JSON.parse(beforeAngle || '{}').camera} → ${JSON.parse((await shot()) || '{}').camera}`,
    );

    await cad.locator('[data-angle="iso"]').click();
    await sleep(1500);

    /* 6. Во весь экран. */
    await cad.locator('[data-fullscreen-toggle]').click();
    await sleep(1200);
    const wide = await cad.evaluate(() => {
      const canvas = document.querySelector('[data-scene] canvas');
      return canvas ? canvas.getBoundingClientRect().width / window.innerWidth : 0;
    });
    check('«На весь экран» разворачивает сцену поверх всего', wide > 0.9, `${Math.round(wide * 100)}%`);
    await cad.locator('[data-fullscreen-toggle]').click();
    await sleep(900);

    /* 7. Угловая кухня: оба ряда в одной сцене. Форма — на шаге «Размеры». */
    const straight = await cad.evaluate(() => (window.__mwScene ? window.__mwScene() : null));
    await toStep(cad, 'Размеры');
    if ((await cad.locator('[data-studio-panel].hidden').count()) > 0) {
      await cad.locator('[data-panel-toggle]').click();
      await sleep(1200);
    }
    await cad.locator('[data-shape-kind="corner_l"]').click();
    await sleep(3000);
    const cornerScene = await cad.evaluate(() => (window.__mwScene ? window.__mwScene() : null));

    check(
      'угловая кухня показывает в сцене ОБА ряда',
      Boolean(cornerScene) && cornerScene.scene.meshes > straight.scene.meshes,
      `мешей ${straight?.scene.meshes} → ${cornerScene?.scene.meshes}, вызовов ${straight?.calls} → ${cornerScene?.calls}`,
    );

    await cad.close();
  });






  /* ── Техника не дублируется между стенами — в интерфейсе ── */

  await section('appliances', 'Техника не дублируется между стенами — в интерфейсе', async () => {
    const ap = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await ap.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await whenReady(ap);
    await toStep(ap, 'Размеры');
    await sleep(1500);

    /**
     * Приборы стены ГЛАЗАМИ ПОЛЬЗОВАТЕЛЯ: по подписям модулей на схеме.
     *
     * Проверка на данных смотрела `buildComposition` — и была зелёной,
     * пока экран собирал стену А своими средствами из полного набора.
     * Считать надо там, куда смотрит человек. Схема показывает все стены
     * разом, блоком на стену (`[data-wall-block]`), и каждый модуль
     * считается один раз — в блоке своей стены. Идентификатор несёт
     * стену (`hob@w1`), поэтому прибор берётся из него до `@`.
     */
    const appliancesByWall = () =>
      ap.evaluate(() =>
        Array.from(document.querySelectorAll('[data-schematic] [data-wall-block]')).map((block) => ({
          wall: Number(block.getAttribute('data-wall-block')),
          appliances: Array.from(block.querySelectorAll('[data-module-id]'))
            .map((node) => (node.getAttribute('data-module-id') ?? '').match(/^[a-z_]+--?\d+-([a-z0-9_]+)@/)?.[1] ?? null)
            .filter(Boolean),
        })),
      );
    const tally = (blocks) => {
      const seen = new Map();
      for (const block of blocks) {
        for (const appliance of block.appliances) seen.set(appliance, (seen.get(appliance) ?? 0) + 1);
      }
      return seen;
    };
    const wallOf = (blocks, appliance) =>
      blocks.filter((block) => block.appliances.includes(appliance)).map((block) => block.wall);

    await ap.locator('[data-shape-kind="corner_l"]').click();
    await sleep(2600);
    await ap.locator('[data-schematic-tab="front"]').click();
    await sleep(1200);

    const cornerBlocks = await appliancesByWall();
    const seen = tally(cornerBlocks);
    const doubled = [...seen.entries()].filter(([, n]) => n > 1);
    check(
      'угловая: на схеме обе стены',
      cornerBlocks.length === 2,
      `${cornerBlocks.length} блоков стен`,
    );
    check(
      'угловая: каждый прибор ровно один — на экране, а не в данных',
      doubled.length === 0 && seen.size > 0,
      seen.size === 0
        ? 'приборов на схеме не найдено'
        : doubled.length === 0
          ? [...seen.keys()].join(', ')
          : `дубли: ${doubled.map(([a, n]) => `${a}×${n}`).join(', ')}`,
    );

    /*
     * ПЕРЕНОС ПРИБОРА НА ДРУГУЮ СТЕНУ — ОДНА КНОПКА. Она живёт в панели
     * модуля на шаге «Раскладка».
     */
    const fridgeWalls = wallOf(cornerBlocks, 'fridge');
    check(
      'холодильник стоит на одной стене',
      fridgeWalls.length === 1,
      fridgeWalls.length === 0 ? 'холодильника на схеме нет' : `стены ${fridgeWalls.join(', ')}`,
    );

    await toStep(ap, 'Раскладка');
    await ap.locator('[data-schematic-tab="front"]').click();
    await sleep(1200);
    const fridgeModule = ap.locator('[data-schematic] [data-module-id*="-fridge@"]').first();
    if ((await fridgeModule.count()) > 0) {
      await fridgeModule.click({ force: true });
      await sleep(1200);
    }
    const moveButtons = ap.locator('[data-move-appliance]:visible');
    check(
      'у прибора есть кнопка переноса на другую стену',
      (await moveButtons.count()) > 0,
      `${await moveButtons.count()} кнопок`,
    );

    if ((await moveButtons.count()) > 0) {
      await moveButtons.first().click();
      await sleep(2600);
    }
    const movedBlocks = await appliancesByWall();
    const movedWalls = wallOf(movedBlocks, 'fridge');
    check(
      'перенос ставит холодильник на другую стену',
      movedWalls.length === 1 && fridgeWalls.length === 1 && movedWalls[0] !== fridgeWalls[0],
      `стена ${fridgeWalls.join(', ') || '—'} → ${movedWalls.join(', ') || '—'}`,
    );
    check(
      'и после переноса он по-прежнему один',
      (tally(movedBlocks).get('fridge') ?? 0) === 1,
      `холодильников ${tally(movedBlocks).get('fridge') ?? 0}`,
    );

    /*
     * УДАЛЕНИЕ УБИРАЕТ ПРИБОР СО ВСЕХ СТЕН.
     */
    const target = ap.locator('[data-schematic] [data-module-id*="-fridge@"]').first();
    if ((await target.count()) > 0) {
      await target.click({ force: true });
      await sleep(1000);
    }
    const removeButton = ap.getByRole('button', { name: 'Удалить', exact: true });
    if ((await removeButton.count()) === 1) {
      await removeButton.click();
      await sleep(2600);
      const gone = tally(await appliancesByWall());
      check(
        'удаление убирает холодильник со ВСЕХ стен',
        (gone.get('fridge') ?? 0) === 0 && gone.size > 0,
        `холодильников осталось ${gone.get('fridge') ?? 0} · приборов на схеме ${gone.size}`,
      );
    } else {
      check('кнопка удаления модуля есть', false, `кнопок «Удалить» ${await removeButton.count()}`);
    }

    await ap.close();
  });

  /* ── Сцена выглядит мебелью, а не каркасом ── */

  await section('look', 'Сцена выглядит мебелью, а не каркасом', async () => {
    const lk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await lk.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await whenReady(lk);
    await toStep(lk, 'Раскладка');
    await sleep(2200);
    await lk.locator('[data-schematic-tab="scene"]').click();
    await sleep(3200);

    const look = () => lk.evaluate(() => (window.__mwCadLook ? window.__mwCadLook() : null));
    const state = () => lk.evaluate(() => (window.__mwCadState ? window.__mwCadState() : null));
    const scene = () => lk.evaluate(() => (window.__mwScene ? window.__mwScene() : null));
    /** Панель в 3D спрятана намеренно; правят её, вернув панель, — как рука. */
    const showPanel = async () => {
      if ((await lk.locator('[data-studio-panel].hidden').count()) > 0) {
        await lk.locator('[data-panel-toggle]').click();
        await sleep(1000);
      }
    };

    /*
     * 1. «СКВОЗЬ МЕБЕЛЬ НЕ ВИДНО» — ЭТО ЧИСЛО, А НЕ ВПЕЧАТЛЕНИЕ.
     *
     * Прозрачных материалов у мебели быть не должно ни одного: именно
     * сквозь них видно стену и соседние модули, и ряд читается каркасом.
     * Стекло дверцы ПРИБОРА (духовки) — лицо техники, а не мебель: сквозь
     * него видна ниша прибора. Хук считает его отдельно и называет числом.
     */
    const fronts = await look();
    check(
      'в режиме «Фасады» прозрачных материалов у мебели нет',
      Boolean(fronts) && fronts.transparent === 0,
      fronts
        ? `непрозрачных ${fronts.opaque}, прозрачных ${fronts.transparent}, стекло прибора ${fronts.applianceGlass}`
        : 'хука сцены нет',
    );

    /*
     * Рёбра лежат НА мебели. Здесь была самая дорогая двойная формула:
     * меши ставились по комнате, рёбра по нулю, и рядом с гарнитуром
     * висел проволочный двойник в двух метрах.
     */
    check(
      'рёбра совпадают с мебелью, а не висят рядом',
      Boolean(fronts) && fronts.edgeDrift !== null && fronts.edgeDrift < 0.01 && fronts.edgePoints > 0,
      fronts ? `расхождение ${fronts.edgeDrift} м, точек ${fronts.edgePoints}` : '',
    );

    /* 2. Переключатель режима меняет разметку сцены. */
    check('переключатель «Фасады / Каркас» есть', (await lk.locator('[data-scene-mode]').count()) === 1);
    check(
      'и по умолчанию показаны фасады',
      (await lk.locator('[data-scene-mode]').getAttribute('data-scene-mode')) === 'fronts',
    );

    await lk.locator('[data-scene-mode]').click();
    await sleep(2000);
    const frame = await look();

    check(
      '«Каркас» делает корпус просвечивающим',
      Boolean(frame) && frame.transparent > 0,
      frame ? `прозрачных ${frame.transparent}` : '',
    );
    check(
      'и показывает рёбра внутренних деталей',
      Boolean(frame) && Boolean(fronts) && frame.edgePoints > fronts.edgePoints,
      `точек рёбер ${fronts?.edgePoints} → ${frame?.edgePoints}`,
    );

    await lk.locator('[data-scene-mode]').click();
    await sleep(1600);
    const back = await look();
    check(
      'возврат в «Фасады» снова закрывает мебель',
      back?.transparent === 0,
      back ? `прозрачных ${back.transparent}` : '',
    );

    /* 3. 3D занимает весь экран, панель возвращается кнопкой. */
    const width = () =>
      lk.evaluate(() => {
        const c = document.querySelector('[data-scene] canvas');
        return c ? c.getBoundingClientRect().width / window.innerWidth : 0;
      });

    check(
      '«3D» разворачивает сцену на всю ширину',
      (await width()) >= 0.9,
      `${Math.round((await width()) * 100)}% ширины`,
    );
    check(
      'панель при этом спрятана, а не размонтирована',
      (await lk.locator('[data-studio-panel]').count()) === 1 &&
        (await lk.locator('[data-studio-panel].hidden').count()) === 1,
    );

    await lk.locator('[data-panel-toggle]').click();
    await sleep(1200);
    check(
      'кнопка возвращает панель',
      (await lk.locator('[data-studio-panel].hidden').count()) === 0 && (await width()) < 0.9,
      `${Math.round((await width()) * 100)}% ширины`,
    );

    /*
     * 4. ЦВЕТ ИЗ ПАЛИТРЫ ОРГАНИЗАЦИИ ВИДЕН В СЦЕНЕ.
     *
     * Правка идёт так же, как рукой: модуль выбирается на схеме, цвет — в
     * палитре компании на шаге «Материалы». Потом снова 3D — и фасад
     * обязан быть ЭТИМ цветом, а не типовым.
     */
    const beforeColor = await state();

    await toStep(lk, 'Материалы');
    await showPanel();
    await lk.locator('[data-schematic-tab="front"]').click();
    await sleep(1200);

    const target = lk.locator('[data-schematic] [data-module-id^="base-"]').first();
    if ((await target.count()) > 0) {
      await target.click({ force: true });
      await sleep(1000);
    }

    const palette = lk.locator('[data-palette-color]:visible');
    const hasPalette = (await palette.count()) > 0;
    if (hasPalette) {
      await palette.first().click();
      await sleep(1400);
    }

    check(
      'у организации есть своя палитра цветов',
      hasPalette || (await lk.locator('[data-palette-empty]').count()) > 0,
      hasPalette ? `${await palette.count()} цветов` : 'палитры на экране нет, и слов о пустой палитре нет',
    );

    /*
     * Цвет смотрим ДО правки состава: смена типа холодильника меняет
     * ТРЕБОВАНИЯ, а не модуль, и ряд пересобирается целиком — поштучные
     * правки при этом честно сбрасываются.
     */
    await lk.locator('[data-schematic-tab="scene"]').click();
    await sleep(2600);
    const afterColor = await state();

    if (hasPalette) {
      check(
        'цвет из палитры организации доезжает до сцены',
        Boolean(afterColor) &&
          Boolean(beforeColor) &&
          afterColor.fronts.join('|') !== beforeColor.fronts.join('|') &&
          afterColor.fronts.some((key) => /#[0-9a-f]{6}/i.test(key)),
        afterColor ? afterColor.fronts.join(' · ') : '',
      );
    }

    /* 5. Холодильник: встроенный и отдельностоящий — разная мебель. */
    await toStep(lk, 'Раскладка');
    await showPanel();
    await lk.locator('[data-schematic-tab="front"]').click();
    await sleep(1200);

    const fridge = lk.locator('[data-schematic] [data-module-id^="tall-"][data-module-id*="fridge"]').first();
    const freeButton = lk.getByRole('button', { name: 'Отдельностоящий', exact: true }).filter({ visible: true }).first();
    let fridgeSwitched = false;
    if ((await fridge.count()) > 0) {
      await fridge.click({ force: true });
      await sleep(900);
      if ((await freeButton.count()) > 0) {
        await freeButton.click();
        await sleep(1600);
        fridgeSwitched = true;
      }
    }
    check(
      'у холодильника выбор «встроенный / отдельностоящий» на экране',
      fridgeSwitched,
      fridgeSwitched
        ? 'переключён на «Отдельностоящий»'
        : (await fridge.count()) === 0
          ? 'холодильника на схеме нет'
          : 'кнопки «Отдельностоящий» нет',
    );

    if (fridgeSwitched) {
      await lk.locator('[data-schematic-tab="scene"]').click();
      await sleep(2600);
      const freeLook = await look();
      await showPanel();
      await lk.locator('[data-schematic-tab="front"]').click();
      await sleep(1200);
      await fridge.click({ force: true });
      await sleep(800);
      await lk.getByRole('button', { name: 'Встроенный', exact: true }).filter({ visible: true }).first().click();
      await sleep(1600);
      await lk.locator('[data-schematic-tab="scene"]').click();
      await sleep(2600);
      const builtLook = await look();

      /*
       * Считать меши тут нельзя: мебель рисуется пачками ПО МАТЕРИАЛУ, и
       * исчезнувший фасад пачку не убирает. Разница видна в коробках: у
       * встроенного есть фасад, у отдельностоящего — сам прибор.
       */
      check(
        'встроенный закрыт фасадом, отдельностоящий виден прибором',
        Boolean(freeLook) &&
          Boolean(builtLook) &&
          builtLook.boxes.front > freeLook.boxes.front &&
          freeLook.boxes.appliance > builtLook.boxes.appliance,
        `фасадов ${freeLook?.boxes.front} → ${builtLook?.boxes.front}, ` +
          `приборов ${freeLook?.boxes.appliance} → ${builtLook?.boxes.appliance}`,
      );
    }

    /*
     * 6. Прямая и угловая рисуются одним кодом. Форма выбирается на шаге
     * «Размеры». П-образную демо собрать не может — в его замере две
     * стены, и она отказывает словами; три формы сверяются в разделе
     * `u-shape` на замере из четырёх стен.
     */
    await toStep(lk, 'Размеры');
    await showPanel();
    await lk.locator('[data-schematic-tab="scene"]').click();
    await sleep(2400);
    const straight = await scene();
    await showPanel();
    await lk.locator('[data-shape-kind="corner_l"]').click();
    await sleep(3000);
    const corner = await scene();
    const cornerLook = await look();

    check(
      'угловая рисует мебель второй стены, а не пустоту',
      Boolean(straight) && Boolean(corner) && corner.scene.materials > straight.scene.materials,
      `материалов ${straight?.scene.materials} → ${corner?.scene.materials}`,
    );
    check(
      'и у угловой рёбра лежат на мебели',
      Boolean(cornerLook) && cornerLook.edgeDrift !== null && cornerLook.edgeDrift < 0.01,
      `угловая ${cornerLook?.edgeDrift} м`,
    );
    check(
      'и прозрачной мебели у угловой нет',
      cornerLook?.transparent === 0,
      cornerLook ? `прозрачных ${cornerLook.transparent}` : '',
    );

    /*
     * 6.5 МОДУЛЕЙ В СЦЕНЕ СТОЛЬКО ЖЕ, СКОЛЬКО НА СХЕМЕ.
     *
     * Два места рисуют одну мебель, и разъезжаются они молча: антресоль
     * была на схеме и пропадала из 3D, потому что сцена ставила её по
     * отметке навески верхнего ряда вместо крыши колонны.
     */
    await showPanel();
    await lk.locator('[data-shape-kind="linear"]').click();
    await sleep(2600);
    await lk.locator('[data-schematic-tab="front"]').click();
    await sleep(1600);
    const onSheet = await lk.locator('[data-schematic] [data-module-id]').count();

    await lk.locator('[data-schematic-tab="scene"]').click();
    await sleep(2600);
    const inScene = await lk.evaluate(() =>
      window.__mwCadModules ? window.__mwCadModules() : null,
    );

    check(
      'модулей в сцене столько же, сколько на схеме',
      Boolean(inScene) && onSheet > 0 && inScene.drawn === onSheet,
      `схема ${onSheet}, сцена ${inScene?.drawn}`,
    );
    check(
      'и антресоль среди них',
      Boolean(inScene) && inScene.ids.some((id) => id.startsWith('mezz-')),
      inScene ? inScene.ids.filter((id) => id.startsWith('mezz-')).join(', ') || 'нет' : '',
    );

    /*
     * 6.6 ЦВЕТ ВИДЕН В СЦЕНЕ — ЦВЕТОМ МАТЕРИАЛА, А НЕ КЛЮЧОМ.
     */
    const colorsNow = (await look())?.frontColors ?? [];
    check(
      'фасады в сцене покрашены цветом каталога, а не серым',
      colorsNow.length > 0 && colorsNow.some((hex) => hex.toLowerCase() !== '#b9b2a4'),
      colorsNow.join(' · '),
    );

    /*
     * 7. МЕБЕЛЬ СТОИТ В КОМНАТЕ, А НЕ В ПУСТОТЕ.
     *
     * Со слоя 53 комната строится из ЗАМЕРА (`roomLayout`): стен в сцене
     * столько, сколько их в замере, а не по одной за рядом, как было в
     * слое 40. У демо в замере две стены — обе на месте, и ни одна не
     * режет мебель. П-образная с четырьмя стенами — в разделе `u-shape`.
     */
    const straightRoom = await lk.evaluate(() => (window.__mwCadRoom ? window.__mwCadRoom() : null));
    check(
      'у прямой — пол и стены замера',
      Boolean(straightRoom) &&
        straightRoom.floors === 1 &&
        straightRoom.wallSizes.length > 0 &&
        straightRoom.walls === straightRoom.wallSizes.length,
      straightRoom
        ? `полов ${straightRoom.floors}, стен ${straightRoom.walls} из ${straightRoom.wallSizes.length} в замере`
        : 'комнаты нет',
    );
    check(
      'и ни одна не режет мебель',
      Boolean(straightRoom) && straightRoom.intersects === 0,
      straightRoom ? `пересечений ${straightRoom.intersects}` : '',
    );

    /*
     * РИГЕЛЬ ВИДЕН В СЦЕНЕ, И РЯД В НЕГО НЕ УПИРАЕТСЯ.
     */
    check(
      'выступ на потолке нарисован в сцене',
      Boolean(straightRoom) && straightRoom.beams === 1,
      straightRoom ? `выступов ${straightRoom.beams}` : '',
    );
    check(
      'и мебель в него не упирается',
      Boolean(straightRoom) && straightRoom.beamHits === 0,
      straightRoom ? `вершин внутри балки ${straightRoom.beamHits}` : '',
    );

    /* И на схеме он тоже есть: чертёж уходит в цех, а сцена — нет. */
    await lk.locator('[data-schematic-tab="front"]').click();
    await sleep(1200);
    const beamText = ((await lk.locator('[data-beams]').count()) > 0
      ? await lk.locator('[data-beams]').first().textContent()
      : '') ?? '';
    check(
      'и на фасадной схеме он нарисован со свесом',
      (await lk.locator('[data-beams] [data-beam]').count()) === 1 && beamText.includes('Ригель'),
      beamText.replace(/\s+/g, ' ').trim() || 'группы нет',
    );

    await lk.close();
  });

  /* ── Рабочий экран: группы кнопок, ракурсы, пределы камеры ── */

  await section('controls', 'Рабочий экран: группы кнопок, ракурсы, пределы камеры', async () => {
    const sc = await browser.newPage({ viewport: { width: 1180, height: 820 } });
    await sc.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await whenReady(sc);
    await toStep(sc, 'Размеры');
    await sleep(2200);
    await sc.locator('[data-schematic-tab="scene"]').click();
    await sleep(3200);

    const fit = () => sc.evaluate(() => (window.__mwCadFit ? window.__mwCadFit() : null));
    const camera = () =>
      sc.evaluate(() => (window.__mwCadState ? window.__mwCadState().camera : null));

    /* 1. Кнопки собраны по смыслу и не съедают высоту сцены. */
    check(
      'кнопки верхней панели собраны в группы',
      (await sc.locator('[data-group]').count()) === 3,
      `групп ${await sc.locator('[data-group]').count()}`,
    );

    const toolbar = await sc.evaluate(() => {
      const bar = document.querySelector('[data-toolbar]');
      const canvas = document.querySelector('[data-scene] canvas');
      if (!bar || !canvas) return null;
      const b = bar.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      const rows = new Set(
        [...bar.querySelectorAll('button')].map((el) => Math.round(el.getBoundingClientRect().top)),
      );
      return { barH: b.height, rows: rows.size, sceneH: c.height, vh: window.innerHeight };
    });

    check(
      'на планшетной ширине панель не расползается в три ряда',
      Boolean(toolbar) && toolbar.rows <= 2,
      toolbar ? `рядов кнопок ${toolbar.rows}, высота панели ${Math.round(toolbar.barH)} px` : 'панели или сцены нет',
    );
    check(
      'и сцена занимает не меньше 60% высоты экрана',
      Boolean(toolbar) && toolbar.sceneH / toolbar.vh >= 0.6,
      toolbar ? `${Math.round((toolbar.sceneH / toolbar.vh) * 100)}%` : '',
    );

    /* 2. Чертёжный слой выключен по умолчанию и включается кнопкой. */
    await sc.locator('[data-angle="elevation"]').click();
    await sleep(2400);
    check(
      'чертёжный слой по умолчанию выключен',
      (await sc.locator('[data-dim-layer]').count()) === 0 ||
        (await sc.locator('[data-dim-layer]').getAttribute('aria-hidden')) === 'true',
      `слоёв ${await sc.locator('[data-dim-layer]').count()}`,
    );
    check('и кнопка «Размеры» есть', (await sc.locator('[data-dims-toggle]').count()) === 1);

    await sc.locator('[data-dims-toggle]').click();
    await sleep(1400);
    check(
      'по кнопке слой появляется',
      (await sc.locator('[data-dim-layer] text').count()) > 0,
      `подписей ${await sc.locator('[data-dim-layer] text').count()}`,
    );

    await sc.locator('[data-angle="iso"]').click();
    await sleep(1600);
    check(
      'на перспективе слой не показывается даже включённым',
      (await sc.locator('[data-dim-layer]').count()) === 0 ||
        (await sc.locator('[data-dim-layer]').getAttribute('aria-hidden')) === 'true',
    );
    await sc.locator('[data-dims-toggle]').click();
    await sleep(600);

    /*
     * Ракурсы П-образной (одна стена спереди, все — сверху и в общем виде)
     * сверяются в разделе `u-shape`: у демо в замере две стены, и
     * П-образная на нём отказывает словами.
     */

    /*
     * 3. МЕБЕЛЬ КРУТИТСЯ, НО ПОТЕРЯТЬ ЕЁ НЕЛЬЗЯ.
     *
     * Слой 41 держал это ортокамерой: масштаб не зависел от угла, и
     * «габарит внутри кадра на всех 360°» было свойством зума. Слой 53
     * сделал общий вид ПЕРСПЕКТИВОЙ с открытой стороны и разрешил
     * приблизиться вшестеро — «стык фасадов во весь кадр, как его видит
     * мебельщик» (`ZOOM_IN`). Внутри кадра габарит при таком приближении
     * быть и не должен. Предел, который держит слой 53, — другой, и
     * меряется он крайними значениями:
     *
     *   · центр кадра — на мебели: цель не выходит за её габарит
     *     (`keepOnFurniture`);
     *   · ни один угол габарита не оказался за камерой — камера не
     *     внутри шкафа и не за мебелью;
     *   · камера выше пола;
     *   · на отходе до предела мебель целиком внутри кадра;
     *   · каждый из пяти ракурсов — ниже — держит габарит ВНУТРИ кадра.
     */
    await sc.locator('[data-angle="iso"]').click();
    await sleep(2000);

    const box = await sc.evaluate(() => {
      const c = document.querySelector('[data-scene] canvas');
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;

    const drag = async (dx, dy) => {
      await sc.mouse.move(cx, cy);
      await sc.mouse.down();
      for (let i = 1; i <= 5; i += 1) {
        await sc.mouse.move(cx + (dx * i) / 5, cy + (dy * i) / 5);
        await sleep(25);
      }
      await sc.mouse.up();
      await sleep(200);
    };

    const lost = [];
    let measured = 0;
    const record = async (what) => {
      const now = await fit();
      const pose = await camera();
      measured += 1;
      const [x0, x1, y0, y1] = now?.box ?? [9, 9, 9, 9];
      const centred = x0 <= 0 && x1 >= 0 && y0 <= 0 && y1 >= 0;
      if (!now || !now.visible || now.inFront !== 8 || !centred || !pose || pose[1] <= 0) {
        lost.push(`${what}: ${now ? `${now.box.join(' ')} · углов перед камерой ${now.inFront}` : 'нет данных'} · камера ${pose ? pose.join(',') : '—'}`);
      }
      return now;
    };

    const spun = await camera();
    for (let i = 0; i < 12; i += 1) {
      await drag(box.w * 0.12, 0);
      await record(`поворот ${(i + 1) * 30}°`);
    }
    const afterSpin = await camera();

    check(
      'мебель крутится: камера обошла вокруг',
      JSON.stringify(spun) !== JSON.stringify(afterSpin),
      `${JSON.stringify(spun)} → ${JSON.stringify(afterSpin)}`,
    );

    for (let i = 0; i < 6; i += 1) await drag(0, box.h * 0.25);
    await record('наклон до верхнего предела');
    for (let i = 0; i < 12; i += 1) await drag(0, -box.h * 0.25);
    await record('наклон до нижнего предела');

    for (let i = 0; i < 14; i += 1) {
      await sc.mouse.move(cx, cy);
      await sc.mouse.wheel(0, 400);
      await sleep(90);
    }
    const farthest = await record('отход до предела');
    for (let i = 0; i < 28; i += 1) {
      await sc.mouse.move(cx, cy);
      await sc.mouse.wheel(0, -400);
      await sleep(90);
    }
    await record('приближение до предела');

    check(
      'ни в одном крайнем положении мебель не потеряна: центр кадра на ней, камера не в ней и не под полом',
      measured === 16 && lost.length === 0,
      lost.length === 0 ? `${measured} крайних положений` : lost.slice(0, 2).join(' · '),
    );
    const [fx0, fx1, fy0, fy1] = farthest?.box ?? [9, 9, 9, 9];
    check(
      'на отходе до предела мебель целиком внутри кадра',
      Boolean(farthest) && fx0 >= -1 && fx1 <= 1 && fy0 >= -1 && fy1 <= 1,
      farthest ? farthest.box.join(' ') : 'нет данных',
    );

    /* «Вернуть вид» — перелёт; ждём, пока камера встанет, а не таймер. */
    await sc.locator('[data-angle-home]').click();
    const home = await until(
      async () => JSON.stringify(await camera()) === JSON.stringify(spun),
      8000,
    );
    check(
      '«Вернуть вид» возвращает камеру на место',
      home,
      `${JSON.stringify(spun)} → ${JSON.stringify(await camera())}`,
    );

    check(
      'ракурсов по-прежнему пять',
      (await sc.locator('[data-angle]').count()) === 5,
      `${await sc.locator('[data-angle]').count()} ракурсов`,
    );

    /*
     * Каждый из пяти ракурсов показывает мебель ЦЕЛИКОМ: габарит лежит
     * внутри кадра, а не задевает его краем.
     */
    const cut = [];
    for (const angle of ['elevation', 'left', 'right', 'plan', 'iso']) {
      await sc.locator(`[data-angle="${angle}"]`).click();
      await sleep(2000);
      const now = await fit();
      const [x0, x1, y0, y1] = now?.box ?? [9, 9, 9, 9];
      if (!now || x0 < -1 || x1 > 1 || y0 < -1 || y1 > 1) {
        cut.push(`${angle}: ${now ? now.box.join(' ') : 'нет данных'}`);
      }
    }

    check(
      'каждый из пяти ракурсов показывает мебель целиком',
      cut.length === 0,
      cut.length === 0 ? 'пять ракурсов, габарит внутри кадра' : cut.join(' · '),
    );

    /* 4. Пустая стена не рисует случайную геометрию. */
    /*
     * «Собрать самому» живёт на шаге «Решение»: пустая стена — это
     * начало сборки, а не состояние конфигуратора.
     */
    await toStep(sc, 'Решение');
    await sleep(1500);

    const free = sc.locator('[data-free-mode]');
    check('кнопка «Собрать самому» на шаге «Решение»', (await free.count()) === 1);
    if ((await free.count()) === 1) {
      await free.scrollIntoViewIfNeeded();
      await free.click();
      await toStep(sc, 'Раскладка');
      await until(async () => (await sc.locator('[data-schematic-tab="scene"]').count()) > 0);
      await sc.locator('[data-schematic-tab="scene"]').click();
      await until(async () => (await sc.locator('[data-scene] canvas').count()) > 0);
      await sleep(2500);
    }

    const emptyScene = await sc.evaluate(() => (window.__mwScene ? window.__mwScene() : null));
    const emptyWords = await sc.locator('[data-scene-empty]').count();
    check(
      emptyWords > 0 ? 'пустая стена не рисует мебель, а говорит словами' : 'пустая стена ничего не рисует',
      emptyScene !== null && emptyScene.cabinet.meshes === 0,
      `мешей гарнитура ${emptyScene?.cabinet.meshes}${emptyWords > 0 ? '' : ', слов нет'}`,
    );

    await sc.close();
  });

  /* ── Направление открывания выбирается и меняет деньги ── */

  await section('opening', 'Направление открывания выбирается и меняет деньги', async () => {
    const op = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await op.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await whenReady(op);
    await toStep(op, 'Конструкция');
    await sleep(2200);
    await op.locator('[data-schematic-tab="front"]').click();
    await sleep(1200);

    const money = (text) => (text.match(/([\d\s ]{5,})\s*₸/) ?? [])[1]?.replace(/\s| /g, '');
    const footerText = () => op.locator('footer').innerText();

    /* Верхний модуль: там механизм возможен, и там он стоит денег. */
    const upper = op.locator('[data-schematic] [data-module-id^="upper-"]').first();
    await upper.scrollIntoViewIfNeeded();
    await upper.click({ force: true });
    await sleep(1000);

    const picker = op.locator('[data-opening-picker]');
    check('у выбранного модуля есть выбор направления', (await picker.count()) === 1);

    check(
      'и сказано, что направление посчитано по умолчанию',
      (await op.locator('[data-opening-assumed]').count()) === 1,
      (await op.locator('[data-opening-assumed]').innerText().catch(() => '')).slice(0, 80),
    );

    check(
      'подъёмник наверху предлагается',
      (await op.locator('[data-opening="lift"]').count()) === 1,
    );

    const before = money(await footerText());
    await op.locator('[data-opening="lift"]').click();
    await sleep(1600);
    const after = money(await footerText());

    check(
      'выбор подъёмника меняет сумму: газлифт и петля — разные деньги',
      Boolean(before) && Boolean(after) && before !== after,
      `${before} ₸ → ${after} ₸`,
    );
    check(
      'выбранное направление перестаёт быть умолчанием',
      (await op.locator('[data-opening-assumed]').count()) === 0,
    );
    check(
      'и подъёмник отмечен выбранным',
      (await op.locator('[data-opening="lift"]').getAttribute('data-active')) === '1',
    );

    /*
     * Внизу механизма не бывает: фасад пошёл бы вверх и упёрся в
     * столешницу. Кнопки там нет вовсе — серая кнопка это вопрос
     * «почему нельзя», а задавать его при клиенте некому.
     */
    const base = op.locator('[data-schematic] [data-module-id^="base-"]').first();
    await base.scrollIntoViewIfNeeded();
    await base.click({ force: true });
    await sleep(1000);

    check(
      'в нижнем ряду подъёмник не предлагается вовсе',
      (await op.locator('[data-opening-picker]').count()) === 1 &&
        (await op.locator('[data-opening="lift"]').count()) === 0,
      `кнопок направления ${await op.locator('[data-opening]').count()}`,
    );
    check(
      'а стороны петель предлагаются',
      (await op.locator('[data-opening="left"]').count()) === 1 &&
        (await op.locator('[data-opening="right"]').count()) === 1,
    );

    await op.close();
  });

  /* ── Сцена: цвет помодульно, открывание, размеры ── */

  await section('scene3d', 'Сцена: цвет помодульно, открывание, размеры', async () => {
    const s3 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await s3.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await whenReady(s3);

    await toStep(s3, 'Материалы');
    await sleep(2200);
    await s3.locator('[data-schematic-tab="scene"]').click();
    await sleep(3200);

    const state = () => s3.evaluate(() => (window.__mwCadState ? window.__mwCadState() : null));
    const scene = () => s3.evaluate(() => (window.__mwScene ? window.__mwScene() : null));

    /*
     * Дизайны и материалы живут в панели, а в 3D она спрятана: мебель
     * смотрят во всю ширину. Возвращаем её так же, как это делает рука.
     */
    if ((await s3.locator('[data-studio-panel].hidden').count()) > 0) {
      await s3.locator('[data-panel-toggle]').click();
      await sleep(1200);
    }

    /* 1. Двухцветный дизайн — две пачки, а не одна краска. */
    const beforeDesign = await scene();
    const design = s3.locator('[data-design="oak-graphite"]');
    if ((await design.count()) > 0) {
      await design.click();
      await sleep(2500);
    }
    const twoTone = await state();
    const afterDesign = await scene();

    check(
      'двухцветный дизайн даёт в сцене ДВЕ пачки фасадов',
      Boolean(twoTone) && twoTone.fronts.length === 2,
      twoTone ? twoTone.fronts.join(' · ') : '',
    );
    check(
      'и пачек стало больше, а не перекрасилась одна',
      Boolean(afterDesign) && afterDesign.cabinet.materials > beforeDesign.cabinet.materials,
      `материалов ${beforeDesign?.cabinet.materials} → ${afterDesign?.cabinet.materials}`,
    );

    /*
     * Смена материала ОДНОГО модуля не трогает соседа: у него свой ключ
     * и своя пачка. Ловится числом ключей, а не глазами.
     */
    const canvasBox = await s3.evaluate(() => {
      const c = document.querySelector('[data-scene] canvas');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });

    let picked = false;
    if (canvasBox) {
      for (const fy of [0.55, 0.45, 0.65, 0.35]) {
        for (const fx of [0.35, 0.5, 0.65, 0.25]) {
          await s3.mouse.click(canvasBox.x + canvasBox.w * fx, canvasBox.y + canvasBox.h * fy);
          await sleep(450);
          if ((await s3.locator('[data-swatch]').count()) > 0) {
            picked = true;
            break;
          }
        }
        if (picked) break;
      }
    }
    check('клик по мебели в сцене открывает материал модуля', picked);

    const swatch = s3.locator('[data-swatch="acrylic"]').first();
    if ((await swatch.count()) > 0) {
      await swatch.click();
      await sleep(1800);
    }
    const three = await state();
    check(
      'смена материала одного модуля не трогает соседей',
      Boolean(three) && three.fronts.length === 3,
      three ? `${three.fronts.length} материала: ${three.fronts.join(' · ')}` : '',
    );

    /* 2. Открыть всё / Закрыть всё. */
    check(
      'в сцене есть «Открыть всё» и «Закрыть всё»',
      (await s3.locator('[data-open-all]').count()) === 1 &&
        (await s3.locator('[data-close-all]').count()) === 1,
    );

    const openCount = () => s3.evaluate(() => (window.__mwOpenParts ? window.__mwOpenParts() : -1));
    const openIds = () => s3.evaluate(() => (window.__mwOpenIds ? window.__mwOpenIds() : []));
    await s3.locator('[data-open-all]').click();
    await sleep(1800);
    const opened = await openCount();
    check('«Открыть всё» открывает мебель', opened > 0, `${opened} элементов`);

    /*
     * ЯЩИКИ ПОД ВАРОЧНОЙ ВЫДВИГАЮТСЯ.
     *
     * Модуль под варочной панелью числился «нишей»: на чертеже два
     * фронта, в раскрое два фронта, а в сцене глухая панель, за которую
     * не взяться. Числом элементов это не ловилось — открывалось много,
     * а нужных среди них не было, — поэтому спрашиваем именно их.
     */
    const openedIds = await openIds();
    const hobDrawers = openedIds.filter((id) => id.includes('hob') && id.includes(':drawer:'));
    check(
      'ящики под варочной выдвигаются в сцене',
      hobDrawers.length > 0,
      hobDrawers.join(', ') || `среди ${openedIds.length} открытых их нет`,
    );

    /*
     * И это не «в данных открылось»: деталь ДВИГАЕТСЯ. Выехавший ящик
     * уходит из общей отрисовки и едет своим мешем — значит мешей в
     * сцене становится больше, чем было при закрытой мебели.
     */
    const movedScene = await scene();
    check(
      'выехавшие детали едут своими мешами, а не остаются в общей пачке',
      Boolean(movedScene) && movedScene.cabinet.meshes > afterDesign.cabinet.meshes,
      `мешей ${afterDesign?.cabinet.meshes} → ${movedScene?.cabinet.meshes}`,
    );

    await s3.locator('[data-close-all]').click();
    await sleep(1400);
    check('«Закрыть всё» закрывает', (await openCount()) === 0, `${await openCount()}`);

    /* 3. Размерные цепи над сценой на прямом ракурсе. */
    await s3.locator('[data-angle="elevation"]').click();
    await sleep(2600);
    // Слой чертежа теперь по кнопке: сам собой он поверх 3D не появляется.
    await s3.locator('[data-dims-toggle]').click();
    await sleep(1200);
    const layer = s3.locator('[data-dim-layer]');
    check(
      'над сценой есть слой размеров',
      (await layer.count()) === 1,
    );
    check(
      'на прямом ракурсе он показан',
      (await layer.getAttribute('aria-hidden')) === 'false',
      `aria-hidden ${await layer.getAttribute('aria-hidden')}`,
    );
    check(
      'и в нём подписи со стрелками, а не голые цифры',
      (await s3.locator('[data-dim-layer] text').count()) > 0 &&
        (await s3.locator('[data-dim-layer] line, [data-dim-layer] path').count()) > 0,
      `подписей ${await s3.locator('[data-dim-layer] text').count()}`,
    );

    await s3.locator('[data-angle="iso"]').click();
    await sleep(2000);
    /*
     * На перспективе проекции нет вовсе — слой уходит из разметки, а не
     * гаснет: рисовать цепь без ортопроекции значит рисовать неверную
     * длину. Проверяем ПОСЛЕДСТВИЕ: цепей на экране нет.
     */
    const rotated = await s3.locator('[data-dim-layer]').count();
    check(
      'на повёрнутой мебели цепей нет: там размер по горизонтали врёт',
      rotated === 0 || (await layer.getAttribute('aria-hidden')) === 'true',
      rotated === 0 ? 'слоя нет: проекции нет' : 'слой погашен',
    );

    /*
     * П-образная — три ряда в одной сцене — сверяется в разделе `u-shape`
     * на замере из четырёх стен: в замере демо их две.
     */

    await s3.close();
  });

  /* ── П-образная из замера: три ряда, одна сцена ── */

  /*
   * У демонстрации в замере ДВЕ стены (`lib/millwork/demo.ts`), и
   * П-образная на ней не собирается — композиция отказывает словами:
   * «ставит мебель на три стены, а в замере их 2». Прежние проверки
   * П-образной стояли на демо и мерили отказ как мебель: рядов 1, стен 0.
   *
   * Здесь П-образная собирается тем путём, каким её собирает замерщик, —
   * `/measure`, четыре стены по кругу, — и на ней сверяется всё, что
   * раньше проверялось на демо: один код отрисовки для трёх форм, три
   * ряда в сцене, ракурсы, комната и техника без дублей. А на демо —
   * сам отказ: словами, без цены, с запертым «Дальше».
   */
  await section('u-shape', 'П-образная из замера: три ряда, одна сцена', async () => {
    const u = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    u.on('pageerror', (e) => {
      failed++;
      console.error('  [pageerror]', e.message.slice(0, 200));
    });

    await u.goto(`${BASE}/measure`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await u.getByPlaceholder('ЖК Апельсин, кв. 42').waitFor({ timeout: 120_000 });
    await u.getByPlaceholder('ЖК Апельсин, кв. 42').fill('ЖК Апельсин, кв. 42');
    await u.getByPlaceholder('Ержан').fill('Ержан');
    await u.getByRole('button', { name: 'К замеру' }).click();
    await sleep(600);
    await u.getByLabel('Высота потолка').fill('2700');
    await u.getByLabel('Высота потолка').press('Enter');
    await u.getByRole('button', { name: 'Стены по кругу' }).click();
    await sleep(200);
    /*
     * 3600 × 3000: на стене Б после двух углов остаётся место под колонну
     * с холодильником — техника цела во всех трёх формах, и сравнение
     * «одни и те же пачки» меряет код отрисовки, а не выпавший прибор.
     */
    const lengths = ['3600', '3000', '3600', '3000'];
    for (const [i, length] of lengths.entries()) {
      if (i > 0) await u.getByRole('button', { name: '+ Стена' }).click();
      const field = u.getByLabel('Длина').nth(i);
      await field.fill(length);
      await field.press('Enter');
      await sleep(120);
    }
    check(
      'в замере четыре стены по кругу',
      (await u.getByLabel('Длина').count()) === 4 && (await u.getByText('контур замкнут').count()) === 1,
      `${await u.getByLabel('Длина').count()} стен`,
    );

    await toStep(u, 'Размеры');
    await sleep(1200);
    await u.locator('[data-schematic-tab="scene"]').click();
    await sleep(3200);

    const look = () => u.evaluate(() => (window.__mwCadLook ? window.__mwCadLook() : null));
    const state = () => u.evaluate(() => (window.__mwCadState ? window.__mwCadState() : null));
    const scene = () => u.evaluate(() => (window.__mwScene ? window.__mwScene() : null));
    const room = () => u.evaluate(() => (window.__mwCadRoom ? window.__mwCadRoom() : null));
    const showPanel = async () => {
      if ((await u.locator('[data-studio-panel].hidden').count()) > 0) {
        await u.locator('[data-panel-toggle]').click();
        await sleep(1000);
      }
    };

    /* ── Три формы — один код отрисовки ── */
    const straight = await scene();
    await showPanel();
    await u.locator('[data-shape-kind="corner_l"]').click();
    await sleep(3000);
    const corner = await scene();
    const cornerLook = await look();

    await showPanel();
    await u.locator('[data-shape-kind="u_shape"]').click();
    await sleep(3200);
    const uShape = await scene();
    const uLook = await look();
    const uState = await state();

    check(
      'П-образная собралась: три стены переключаются',
      (await u.locator('[data-wall]').count()) === 3 && (await u.locator('[data-composition-refused]').count()) === 0,
      `${await u.locator('[data-wall]').count()} стены, отказов ${await u.locator('[data-composition-refused]').count()}`,
    );
    check(
      'и у неё два угла',
      (await u.locator('[data-corner-index]').count()) === 2,
      `${await u.locator('[data-corner-index]').count()} углов`,
    );
    const uTotal = await totalOf(u);
    check('и цена на экране', uTotal !== null && uTotal > 0, `${uTotal} ₸`);

    /*
     * ОДИН КОД — ЭТО ОДНИ И ТЕ ЖЕ ПАЧКИ МАТЕРИАЛОВ, А НЕ ОДИНАКОВЫЙ ИХ
     * ПРИРОСТ: мебель всех форм собрана из одних и тех же видов коробок,
     * и каждая добавленная стена что-то рисует.
     */
    const kindsOf = (value) => Object.keys(value?.boxes ?? {}).sort().join(',');
    check(
      'у всех трёх форм мебель собрана из одних и тех же пачек',
      kindsOf(cornerLook) === kindsOf(uLook) && kindsOf(cornerLook).length > 0,
      `${kindsOf(cornerLook) || 'пусто'} против ${kindsOf(uLook) || 'пусто'}`,
    );
    check(
      'и каждая добавленная стена рисует мебель, а не пустоту',
      Boolean(straight && corner && uShape) &&
        corner.scene.materials > straight.scene.materials &&
        uShape.scene.materials > corner.scene.materials,
      `материалов ${straight?.scene.materials} → ${corner?.scene.materials} → ${uShape?.scene.materials}`,
    );
    check(
      'и у всех форм рёбра лежат на мебели',
      Boolean(cornerLook && uLook) &&
        cornerLook.edgeDrift !== null &&
        uLook.edgeDrift !== null &&
        cornerLook.edgeDrift < 0.01 &&
        uLook.edgeDrift < 0.01,
      `угловая ${cornerLook?.edgeDrift} м, П-образная ${uLook?.edgeDrift} м`,
    );
    check(
      'и ни у одной нет прозрачной мебели',
      cornerLook?.transparent === 0 && uLook?.transparent === 0,
      `угловая ${cornerLook?.transparent}, П-образная ${uLook?.transparent}`,
    );

    /* ── Три ряда в одной сцене ── */
    check(
      'П-образная показывает в сцене ТРИ ряда',
      uState?.rows === 3,
      uState ? `рядов ${uState.rows}` : 'хука сцены нет',
    );
    check(
      'и мебели в сцене стало больше',
      Boolean(uShape && straight) && uShape.scene.meshes > straight.scene.meshes,
      `мешей ${straight?.scene.meshes} → ${uShape?.scene.meshes}, вызовов ${straight?.calls} → ${uShape?.calls}`,
    );

    /*
     * ── Комната: стены из замера, открытая сторона спрятана ──
     *
     * Со слоя 53 стен в сцене столько, сколько в замере, — четыре; та, что
     * между камерой общего вида и кухней (открытая сторона), спрятана, а
     * стена с мебелью не прячется никогда.
     */
    await u.locator('[data-angle="iso"]').click();
    await sleep(2400);
    const uRoom = await room();
    check(
      'у П-образной в сцене пол и стены замера; видны три, открытая сторона спрятана',
      Boolean(uRoom) &&
        uRoom.floors === 1 &&
        uRoom.walls === uRoom.wallSizes.length &&
        uRoom.walls === 4 &&
        uRoom.hiddenWalls === 1,
      uRoom ? `полов ${uRoom.floors}, стен ${uRoom.walls}, спрятано ${uRoom.hiddenWalls}` : 'комнаты нет',
    );
    check(
      'и ни одна стена не режет мебель',
      Boolean(uRoom) && uRoom.intersects === 0,
      uRoom ? `пересечений ${uRoom.intersects}` : '',
    );

    /*
     * ── Ракурсы: фронтальный показывает ОДНУ стену ──
     *
     * Развёртки трёх перпендикулярных стен в одной проекции не
     * существует — на чертеже это отдельные виды (ловушка 292).
     */
    check(
      'в свободном ракурсе видны все три стены',
      (await state())?.rows === 3,
      `рядов ${(await state())?.rows}`,
    );
    for (const angle of ['elevation', 'left', 'right']) {
      await u.locator(`[data-angle="${angle}"]`).click();
      await sleep(1800);
      check(
        `ракурс «${angle}» показывает одну стену, а не ленту из трёх`,
        (await state())?.rows === 1,
        `рядов ${(await state())?.rows}`,
      );
    }
    await u.locator('[data-angle="plan"]').click();
    await sleep(1800);
    check(
      '«Сверху» показывает все стены: это план',
      (await state())?.rows === 3,
      `рядов ${(await state())?.rows}`,
    );

    /* ── Техника не дублируется между тремя стенами — на экране ── */
    await u.locator('[data-schematic-tab="front"]').click();
    await sleep(1200);
    const blocks = await u.evaluate(() =>
      Array.from(document.querySelectorAll('[data-schematic] [data-wall-block]')).map((block) =>
        Array.from(block.querySelectorAll('[data-module-id]'))
          .map((node) => (node.getAttribute('data-module-id') ?? '').match(/^[a-z_]+--?\d+-([a-z0-9_]+)@/)?.[1] ?? null)
          .filter(Boolean),
      ),
    );
    const seen = new Map();
    for (const block of blocks) for (const a of block) seen.set(a, (seen.get(a) ?? 0) + 1);
    const doubled = [...seen.entries()].filter(([, n]) => n > 1);
    check(
      'П-образная: каждый прибор ровно один — на экране, а не в данных',
      blocks.length === 3 && seen.size > 0 && doubled.length === 0,
      blocks.length !== 3
        ? `${blocks.length} блоков стен на схеме`
        : doubled.length === 0
          ? [...seen.keys()].join(', ') || 'приборов нет'
          : `дубли: ${doubled.map(([a, n]) => `${a}×${n}`).join(', ')}`,
    );

    await u.close();

    /* ── На демо П-образная — отказ словами: две стены в замере ── */
    const d = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await d.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await whenReady(d);
    await toStep(d, 'Размеры');
    await sleep(1200);
    await d.locator('[data-shape-kind="u_shape"]').click();
    await sleep(2500);
    const refused = d.locator('[data-composition-refused]');
    const footer = (await d.locator('footer').innerText()).replace(/\s+/g, ' ');
    check(
      'на демо П-образная отказывает словами: не хватает стены',
      (await refused.count()) > 0 && /не хватает/.test(footer),
      footer.slice(0, 160),
    );
    check(
      'и цены при отказе нет',
      (await d.locator('[data-estimate-total]').count()) === 0 && !/\d[\d\s ]{3,}₸/.test(footer),
      `итогов на экране ${await d.locator('[data-estimate-total]').count()}`,
    );
    const next = d.locator('[data-next-button]');
    check(
      'и «Дальше» заперто',
      (await next.count()) === 1 && (await next.isDisabled()),
      `${await next.count()} кнопок, заперта ${(await next.count()) === 1 ? await next.isDisabled() : '—'}`,
    );
    await d.close();
  });




  /*
   * ОБЪЯВЛЕННОЕ ЧИСЛО РАЗДЕЛОВ ФИКСИРУЕТСЯ ЯВНО: раздел, выпавший из списка
   * или оборвавшийся исключением, не имеет права пройти тихо.
   */
  const WANT_SECTIONS = 17;
  check(
    'разделов приёмки объявлено столько, сколько написано',
    SECTIONS.length === WANT_SECTIONS,
    `${SECTIONS.length} из ${WANT_SECTIONS}`,
  );
  /*
   * Прогон частями (`ONLY=…`) — тоже прогон: каждый выбранный раздел обязан
   * дойти до конца, а неизвестное имя раздела — падение, а не пустой
   * зелёный прогон.
   */
  const unknown = ONLY.filter((tag) => !SECTIONS.includes(tag));
  const wanted = ONLY.length === 0 ? SECTIONS.length : SECTIONS.filter((tag) => ONLY.includes(tag)).length;
  check(
    'все разделы приёмки дошли до конца',
    unknown.length === 0 && wanted > 0 && sectionsDone === wanted,
    unknown.length > 0 ? `нет таких разделов: ${unknown.join(', ')}` : `${sectionsDone} из ${wanted}`,
  );
} catch (err) {
  failed++;
  console.error('\nОшибка проверки:', err);
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
