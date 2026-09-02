/**
 * Одна модель, три вида — вживую.
 *
 * Проверяется то, что нельзя доказать типами:
 *  1. на виде «Чертёж» размерная цепочка ложится на мебель, а не рядом;
 *  2. переход «чертёж → три четверти» действительно анимируется, а не
 *     прыгает кадром;
 *  3. при этом не проседает частота кадров.
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
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? '  ok  ' : '  ПЛОХО'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures += 1;
};

async function pickView(page, view) {
  // Кнопки вида ищем по атрибуту: подпись «Как чертёж» есть и во вкладках
  // результата, и выбор по тексту увёл бы проверку на другой экран.
  await page.locator(`button[data-scene-view="${view}"]`).first().click();
  // Перелёт длится 600 мс; ждём с запасом на софтверный WebGL.
  await sleep(1400);
}

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
  await sleep(1200);
  await page.getByRole('button', { name: '3D', exact: true }).first().click();
  await sleep(2500);

  /* ── 1. Размеры совпадают с мебелью ── */
  await pickView(page, 'elevation');
  await page.screenshot({ path: `${OUT}/elevation.png` });

  const aligned = await page.evaluate(() => {
    const w = window;
    const sheet = document.querySelector('[data-dim-sheet]');
    if (!sheet) return { error: 'слоя размеров нет в DOM' };
    if (!w.__mwRunBox) return { error: 'сцена не отдаёт габарит ряда' };

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
    };
  });

  /*
   * Вид «как чертёж» обязан быть НАСТОЯЩИМ фасадом. OrbitControls
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
      driftPx:
        fresh && layer ? Math.abs(fresh.originY - Number(layer.dataset.originY)) : null,
    };
  });

  ok('вид «как чертёж» снят ортокамерой', camera.type === 'OrthographicCamera', String(camera.type));
  ok('камера не наклонена', camera.tilt !== null && camera.tilt < 0.001, `наклон ${camera.tilt}`);
  ok(
    'слой знает то же, что сцена',
    camera.driftPx !== null && camera.driftPx < 0.5,
    `расхождение ${camera.driftPx?.toFixed?.(2)} px`,
  );

  if (aligned.error) {
    ok('размеры лежат на мебели', false, aligned.error);
  } else {
    console.log(
      `  расхождение: слева ${aligned.dxLeft} px, справа ${aligned.dxRight} px, пол ${aligned.dyFloor} px`,
    );
    ok('слой размеров видим', aligned.opacity > 0.9, `opacity ${aligned.opacity}`);
    ok('левый край цепочки на мебели', Math.abs(aligned.dxLeft) <= 1, `${aligned.dxLeft} px`);
    ok('правый край цепочки на мебели', Math.abs(aligned.dxRight) <= 1, `${aligned.dxRight} px`);
    ok('пол чертежа на полу сцены', Math.abs(aligned.dyFloor) <= 1, `${aligned.dyFloor} px`);
  }

  /*
   * ── 2. Камера действительно переезжает ──
   *
   * ПЛАВНОСТЬ здесь не меряется и мериться не может: в headless нет GPU,
   * софтверный растеризатор даёт 1–2 кадра в секунду (ловушка 97), и любой
   * перелёт укладывается в один кадр. Поэтому проверяется факт переезда:
   * ряд после переключения виден иначе, чем на чертеже.
   */
  const before = await page.evaluate(() => window.__mwRunBox?.() ?? null);
  await pickView(page, 'perspective');
  const after = await page.evaluate(() => window.__mwRunBox?.() ?? null);

  ok(
    'камера переезжает на объём',
    Boolean(before && after) && Math.abs(after.left - before.left) > 10,
    before && after ? `левый край ${Math.round(before.left)} → ${Math.round(after.left)} px` : 'нет габарита',
  );

  await sleep(400);
  await page.screenshot({ path: `${OUT}/perspective.png` });

  const hiddenLayer = await page.evaluate(() => {
    const sheet = document.querySelector('[data-dim-layer]');
    // Слой остаётся в разметке и гаснет: пропасть рывком он не должен.
    return sheet ? Number(getComputedStyle(sheet).opacity) : -1;
  });
  ok('в объёме размеры гаснут, а не исчезают', hiddenLayer === 0, `opacity ${hiddenLayer}`);

  /* ── 3. Частота кадров ── */
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
  console.log(`  кадров в секунду после перехода: ${fps}`);

  /* ── 4. Вид сверху ── */
  await pickView(page, 'plan');
  await page.screenshot({ path: `${OUT}/plan.png` });

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
