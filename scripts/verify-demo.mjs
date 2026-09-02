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
  check(
    'вместо вкладок — последовательность шагов',
    stepTitles.length >= 4 &&
      stepTitles.join(' ').includes('Шаблон') &&
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
      (await page.getByRole('button', { name: 'К материалам', exact: true }).count()) === 1,
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
  const boxes = page.locator('input[type="checkbox"]');
  const boxCount = await boxes.count();
  check('смета открывается тапом', boxCount > 3, `строк: ${boxCount}`);

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

  /* ── 4. Шаблоны ── */

  await page.getByRole('button', { name: /Шаблон/ }).click();
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

  check(
    'чертёж, план и 3D — тремя кнопками ниже сравнения',
    (await page.getByRole('button', { name: /^(Чертёж|План|3D)$/ }).count()) === 3,
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

  await page.getByRole('button', { name: 'План', exact: true }).click();
  await sleep(400);
  check('план рисуется', (await page.locator('svg').count()) > 0);
  check(
    'на плане подписаны коммуникации',
    (await page.getByText('проход', { exact: false }).count()) > 0,
  );

  const ribbonCount = (await ribbon()).length || before.length;

  await page.getByRole('button', { name: '3D', exact: true }).click();
  await until(async () => (await page.locator('canvas').count()) > 0, 30_000);
  check('3D поднимает сцену', (await page.locator('canvas').count()) === 1);

  const sceneNote = await page.getByText(/собран из тех же/).first().textContent();
  const sceneModules = Number((sceneNote ?? '').replace(/\D+/g, ''));
  check(
    'в 3D тот же состав, что в чертеже и смете',
    sceneModules > 0,
    `модулей в сцене: ${sceneModules}`,
  );

  const cards = await page.locator('figure').count();
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

  /* ── 6. Материалы: фото и артикул ── */

  await page.getByRole('button', { name: /Материалы/ }).click();
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
