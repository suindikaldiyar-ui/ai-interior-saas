/**
 * Одна модель, разные ракурсы — вживую.
 *
 * Проверяется то, что нельзя доказать типами:
 *  1. на ракурсе «Спереди» размерная цепочка ложится на мебель, а не
 *     рядом, а камера — настоящая ортокамера без наклона;
 *  2. переход «спереди → общий вид» действительно переставляет камеру;
 *  3. на перспективе слоя размеров нет вовсе — проекции нет, и цепь
 *     рисовала бы неверную длину (ловушка 309).
 *
 * Где это на экране сейчас (слои 36–53): 3D — вкладка схемы
 * (`[data-schematic-tab="scene"]`) на рабочих шагах, ракурсы —
 * `[data-angle]` (Спереди · Слева · Справа · Сверху · Общий вид),
 * слой размеров — по кнопке `[data-dims-toggle]` и по умолчанию выключен
 * (ловушка 324). Прежняя версия искала вкладку «3D» на «Результате» и
 * кнопки `data-scene-view` — их нет со слоя 32, и она падала на первом же
 * нажатии.
 *
 * Нулевой селектор — падение с названием, а не пропуск.
 *
 * Инструмент глазной проверки, в `verify` не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 3219;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/unified';
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

freePort(PORT);
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
  // Дверь на время проверки снята: иначе всё упрётся в /gate.
  env: { ...process.env, SITE_PASSWORD: '' },
});

let failures = 0;
let passes = 0;
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (pass) passes += 1;
  else failures += 1;
};

async function until(read, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await read()) return true;
    await sleep(250);
  }
  return false;
}

/** Нажать ровно одну кнопку; нет её — падение с названием. */
async function press(page, selector, what) {
  const count = await page.locator(selector).count();
  if (count !== 1) {
    ok(what, false, `НУЛЕВОЙ СЕЛЕКТОР: ${selector} — найдено ${count}`);
    return false;
  }
  await page.locator(selector).click();
  return true;
}

async function toStep(page, title) {
  const button = page.locator(`nav[aria-label="Шаги работы"] button[aria-label="${title}"]`);
  await button.click({ timeout: 30_000 });
  const opened = await until(async () => (await button.getAttribute('aria-current')) === 'step', 15_000);
  if (!opened) throw new Error(`шаг «${title}» не открылся`);
  await sleep(600);
}

async function main() {
  let up = false;
  for (let i = 0; i < 120 && !up; i += 1) {
    try {
      up = (await fetch(BASE)).ok;
    } catch {
      /* поднимается */
    }
    if (!up) await sleep(1000);
  }
  if (!up) throw new Error(`сервер на ${BASE} не поднялся за 120 с`);

  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const ready = await until(
    async () => (await page.locator('nav[aria-label="Шаги работы"] button').count()) > 0,
    120_000,
  );
  if (!ready) throw new Error('полоса шагов не появилась за 120 с');

  await toStep(page, 'Раскладка');
  if (!(await press(page, '[data-schematic-tab="scene"]', 'вкладка «3D» рядом со схемой'))) return finish(browser);
  const scene = await until(async () => (await page.locator('[data-scene] canvas').count()) > 0, 30_000);
  ok('сцена смонтирована', scene);
  await sleep(2500);

  /* ── 1. «Спереди»: размеры лежат на мебели, камера — фасад ── */
  if (!(await press(page, '[data-angle="elevation"]', 'ракурс «Спереди»'))) return finish(browser);
  await sleep(1800);
  ok(
    'слой размеров по умолчанию выключен',
    (await page.locator('[data-dim-layer]').count()) === 0 ||
      (await page.locator('[data-dim-layer]').getAttribute('aria-hidden')) === 'true',
    `слоёв ${await page.locator('[data-dim-layer]').count()}`,
  );
  if (!(await press(page, '[data-dims-toggle]', 'кнопка «Размеры»'))) return finish(browser);
  await until(async () => (await page.locator('[data-dim-sheet]').count()) === 1, 10_000);
  await sleep(800);
  await page.screenshot({ path: `${OUT}/elevation.png` });

  const aligned = await page.evaluate(() => {
    const w = window;
    const sheet = document.querySelector('[data-dim-sheet]');
    if (!sheet) return { error: 'НУЛЕВОЙ СЕЛЕКТОР: слоя размеров нет в DOM' };
    if (!w.__mwRunBox) return { error: 'сцена не отдаёт габарит ряда (__mwRunBox)' };

    const box = w.__mwRunBox();
    if (!box) return { error: 'габарит ряда пустой' };

    const rect = sheet.getBoundingClientRect();
    // Внутренняя геометрия чертежа: поля 74 + 640 + 26, цепочка 56 + 16.
    const scale = rect.width / 740;
    const drawLeft = rect.left + 74 * scale;
    const drawRight = drawLeft + 640 * scale;
    const floor = rect.bottom - 72 * scale;

    return {
      dxLeft: Math.round(drawLeft - box.left),
      dxRight: Math.round(drawRight - box.right),
      dyFloor: Math.round(floor - box.bottom),
      opacity: Number(getComputedStyle(sheet.parentElement).opacity),
      labels: sheet.querySelectorAll('text').length,
    };
  });

  /*
   * Вид «Спереди» обязан быть НАСТОЯЩИМ фасадом. OrbitControls
   * подхватывают активную камеру и двигают её даже выключенными — камера
   * уезжала на четверть метра вверх и наклонялась на полтора градуса.
   * Глазами это неотличимо от фасада, числом — сразу видно.
   */
  const camera = await page.evaluate(() => {
    const box = window.__mwRunBox?.();
    const fresh = window.__mwProject?.();
    const layer = document.querySelector('[data-dim-layer]');
    return {
      type: box ? box.cameraType : null,
      tilt: box ? Math.max(...box.cameraRot.map((v) => Math.abs(v))) : null,
      driftPx: fresh && layer ? Math.abs(fresh.originY - Number(layer.dataset.originY)) : null,
    };
  });

  ok('ракурс «Спереди» снят ортокамерой', camera.type === 'OrthographicCamera', String(camera.type));
  ok('камера не наклонена', camera.tilt !== null && camera.tilt < 0.001, `наклон ${camera.tilt}`);
  ok(
    'слой знает то же, что сцена',
    camera.driftPx !== null && camera.driftPx < 0.5,
    `расхождение ${camera.driftPx === null ? '—' : camera.driftPx.toFixed(2)} px`,
  );

  if (aligned.error) {
    ok('размеры лежат на мебели', false, aligned.error);
  } else {
    console.log(
      `  расхождение: слева ${aligned.dxLeft} px, справа ${aligned.dxRight} px, пол ${aligned.dyFloor} px`,
    );
    ok('слой размеров видим и с подписями', aligned.opacity > 0.9 && aligned.labels > 0, `opacity ${aligned.opacity}, подписей ${aligned.labels}`);
    ok('левый край цепочки на мебели', Math.abs(aligned.dxLeft) <= 1, `${aligned.dxLeft} px`);
    ok('правый край цепочки на мебели', Math.abs(aligned.dxRight) <= 1, `${aligned.dxRight} px`);
    ok('пол чертежа на полу сцены', Math.abs(aligned.dyFloor) <= 1, `${aligned.dyFloor} px`);
  }

  /*
   * ── 2. Камера действительно переезжает ──
   *
   * ПЛАВНОСТЬ здесь не меряется и мериться не может: в headless нет GPU,
   * софтверный растеризатор даёт 1–2 кадра в секунду (ловушка 97). Поэтому
   * проверяется факт переезда: ряд на общем виде виден иначе, чем спереди.
   */
  const before = await page.evaluate(() => window.__mwRunBox?.() ?? null);
  if (!(await press(page, '[data-angle="iso"]', 'ракурс «Общий вид»'))) return finish(browser);
  await sleep(2200);
  const after = await page.evaluate(() => window.__mwRunBox?.() ?? null);

  ok(
    'камера переезжает на общий вид',
    Boolean(before && after) && Math.abs(after.left - before.left) > 10 && after.cameraType === 'PerspectiveCamera',
    before && after
      ? `левый край ${Math.round(before.left)} → ${Math.round(after.left)} px, камера ${after.cameraType}`
      : 'нет габарита',
  );
  await page.screenshot({ path: `${OUT}/general.png` });

  /*
   * ── 3. На перспективе цепи нет вовсе ──
   *
   * Слой убирается из разметки, а не гасится прозрачностью: проекции на
   * перспективе нет, и размер по горизонтали на повёрнутой мебели мерил
   * бы не ту длину (ловушка 309). Кнопка при этом остаётся включённой.
   */
  ok(
    'на перспективе слоя размеров нет вовсе, хотя кнопка включена',
    (await page.locator('[data-dim-layer]').count()) === 0 &&
      (await page.locator('[data-dims-toggle]').getAttribute('aria-pressed')) === 'true',
    `слоёв ${await page.locator('[data-dim-layer]').count()}, кнопка ${await page.locator('[data-dims-toggle]').getAttribute('aria-pressed')}`,
  );

  /* Вернулись на «Спереди» — цепь снова на мебели. */
  await press(page, '[data-angle="elevation"]', 'снова «Спереди»');
  const back = await until(async () => (await page.locator('[data-dim-sheet]').count()) === 1, 10_000);
  ok('вернулись на «Спереди» — цепь снова на экране', back);

  /* ── 4. Частота кадров — числом, без порога (ловушка 97) ── */
  const fps = await page.evaluate(async () => {
    let frames = 0;
    const tick = () => {
      frames += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await new Promise((r) => setTimeout(r, 2000));
    return Math.round(frames / 2);
  });
  console.log(`  кадров страницы в секунду: ${fps}`);

  /* ── 5. Вид сверху — снимок для глаз ── */
  await press(page, '[data-angle="plan"]', 'ракурс «Сверху»');
  await sleep(1800);
  await page.screenshot({ path: `${OUT}/plan.png` });

  return finish(browser);
}

async function finish(browser) {
  await browser.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(`  FAIL ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => {
    server.kill();
    try {
      execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' });
    } catch {
      /* уже остановлен */
    }
    freePort(PORT);
  });
