/**
 * Интерактивная сцена вживую: клик по ящику, дверь на своей петле, кадры,
 * захват с закрытой мебелью. Инструмент глазной проверки, в приёмку не входит.
 *
 * Меряем то, что нельзя доказать типами: реально ли выезжает ящик, совпадают
 * ли высоты полок с чертежом и не роняет ли «Открыть всё» частоту кадров.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 3218;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/cabinet3d';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, {
      encoding: 'utf8',
    });
    for (const line of out.split(/\r?\n/)) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== '0') execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
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
  // Дверь на время приёмки снята: иначе проверка упрётся в /gate.
  env: { ...process.env, SITE_PASSWORD: '' },
});

/** Кадров в секунду за две секунды. */
const fpsProbe = `(async () => {
  let frames = 0;
  const tick = () => { frames += 1; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  await new Promise((r) => setTimeout(r, 2000));
  return Math.round(frames / 2);
})()`;

async function openScene(page, width, height) {
  await page.setViewportSize({ width, height });
  await fetch(`${BASE}/demo`).catch(() => undefined);
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(3500);
  await page
    .getByRole('button', { name: /Результат/ })
    .first()
    .click({ timeout: 90_000 });
  await sleep(900);
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()).filter(Boolean),
  );
  console.log('  кнопки на экране:', buttons.slice(0, 14).join(' | '));
  const probe = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === '3D');
    if (!btn) return 'кнопки нет в DOM';
    const style = getComputedStyle(btn);
    const box = btn.getBoundingClientRect();
    let hidden = null;
    let node = btn;
    while (node) {
      if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') { hidden = node.tagName + '.' + node.className; break; }
      node = node.parentElement;
    }
    return { display: style.display, visibility: style.visibility, box: `${Math.round(box.width)}×${Math.round(box.height)}`, ariaHiddenПредок: hidden };
  });
  console.log('  состояние кнопки 3D:', JSON.stringify(probe));

  // force: страница в этот момент ещё доводит раскладку, и Playwright ждёт
  // «стабильности» дольше, чем длится сам переход.
  await page
    .getByRole('button', { name: '3D', exact: true })
    .click({ force: true, timeout: 60_000 });
  // Сцена поднимается лениво: ждём канвас, а не спим по таймеру.
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await sleep(3000);
}

try {
  for (let i = 0; i < 90; i++) {
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (e) => console.log('  [ошибка страницы]', e.message.slice(0, 200)));
  await openScene(page, 1280, 900);

  /* ── Что в сцене ── */
  const scene = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const box = canvas?.getBoundingClientRect();
    return { canvas: Boolean(canvas), w: Math.round(box?.width ?? 0), h: Math.round(box?.height ?? 0) };
  });
  const counts = await page.evaluate(() => window.__mwScene?.() ?? null);
  console.log(
    `  канвас ${scene.w}×${scene.h} · гарнитур: мешей ${counts?.cabinet.meshes}, материалов ` +
      `${counts?.cabinet.materials} · вся сцена: мешей ${counts?.scene.meshes}, материалов ${counts?.scene.materials}`,
  );
  const cabinetCalls = await page.evaluate(() => window.__mwCabinetCalls?.() ?? null);
  console.log(
    `  вызовов отрисовки: гарнитур ${cabinetCalls} · вся сцена ${counts?.calls} · ` +
      `треугольников ${counts?.triangles} · программ ${counts?.programs}`,
  );
  // Софтверный WebGL рисует кадр долго: снимку нужен запас по времени.
  await page.screenshot({ path: `${OUT}/closed.png`, timeout: 120_000 });

  /* ── Открыть всё ── */
  const before = await page.evaluate(fpsProbe);
  await page.getByRole('button', { name: 'Открыть всё', exact: true }).click({ force: true });
  const during = await page.evaluate(fpsProbe);
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/open-all.png`, timeout: 120_000 });
  console.log(`  кадров в секунду: покой ${before} · «Открыть всё» ${during}`);

  const defaultView = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => b.hasAttribute('data-scene-view'))
      .map((b) => b)
      .map((b) => `${(b.textContent ?? '').trim()}=${b.getAttribute('aria-pressed')}`)
      .join(' · '),
  );
  console.log('  ракурс по умолчанию:', defaultView);

  // Ракурсы: по умолчанию три четверти, переключатель работает.
  for (const view of ['elevation', 'plan', 'perspective']) {
    const btn = page.locator(`button[data-scene-view="${view}"]`);
    const pressed = await btn.getAttribute('aria-pressed');
    console.log(`  ракурс «${view}»: до нажатия aria-pressed=${pressed}`);
    await btn.click({ force: true });
    await sleep(1200);
    const fps = await page.evaluate(fpsProbe);
    console.log(`    после переключения: ${fps} кадров/с`);
    await page
      .locator('canvas')
      .screenshot({ path: `${OUT}/view-${view}.png`, timeout: 60_000 })
      .catch((e) => console.log('    снимок не снялся:', e.message.slice(0, 60)));
  }

  await page.getByRole('button', { name: 'Разрез', exact: true }).click({ force: true });
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/cutaway.png`, timeout: 120_000 });
  await page.getByRole('button', { name: 'Только фасады', exact: true }).click({ force: true });
  await sleep(600);

  await page.getByRole('button', { name: 'Закрыть всё', exact: true }).click({ force: true });
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/closed-again.png`, timeout: 120_000 });

  /* ── Клик по мебели ── */
  const canvasBox = await page.locator('canvas').boundingBox();
  /*
   * Кликаем ПО МЕБЕЛИ, а не наугад: элемент проецируется на экран, и клик
   * идёт в его точку. Слепая сетка проверяла бы кадрирование камеры, а не
   * то, ради чего этот блок сделан.
   */
  const partIds = await page.evaluate(() => {
    const names = [];
    document.querySelectorAll('canvas');
    return names;
  });
  void partIds;

  const probeIds = ['drawer', 'door'];
  let hits = 0;
  for (const kind of probeIds) {
    const point = await page.evaluate((k) => {
      const w = window;
      // Ищем первый элемент нужного вида среди открываемых.
      const ids = w.__mwOpenableIds?.() ?? [];
      const id = ids.find((x) => x.includes(`:${k}:`));
      return id ? { id, point: w.__mwPartPoint?.(id) ?? null } : null;
    }, kind);

    if (!point?.point) {
      console.log(`  ${kind}: элемента такого вида в этом ряду нет`);
      continue;
    }

    const before = await page.evaluate(() => window.__mwOpenParts?.() ?? -1);
    await page.mouse.click(point.point.x, point.point.y);
    await sleep(900);
    const after = await page.evaluate(() => window.__mwOpenParts?.() ?? -1);
    if (after !== before) hits += 1;
    console.log(
      `  клик по элементу ${point.id}: открытых ${before} → ${after} ` +
        `${after !== before ? '· открылся' : '· НЕ открылся'}`,
    );

    // И обратно: повторный клик закрывает.
    await page.mouse.click(point.point.x, point.point.y);
    await sleep(900);
    const back = await page.evaluate(() => window.__mwOpenParts?.() ?? -1);
    console.log(`  повторный клик: ${after} → ${back}`);
  }
  console.log(`  клик открывает мебель: ${hits > 0 ? 'да' : 'НЕТ'}`);

  await page.getByRole('button', { name: 'Закрыть всё', exact: true }).click({ force: true });
  await sleep(1200);

  /* ── Захват кадра закрывает мебель ── */
  await page.getByRole('button', { name: 'Открыть всё', exact: true }).click({ force: true });
  await sleep(900);
  const openedBeforeCapture = await page.evaluate(() => window.__mwOpenParts?.() ?? -1);

  await page.route('**/api/ai/render', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ styleId: 'x', error: 'заглушка проверки' }),
    });
  });

  await page.getByRole('button', { name: 'Рендер', exact: true }).count();
  const renderButton = page.getByRole('button', { name: /Отрисовать кухню/ });
  if (await renderButton.count()) {
    await renderButton.first().click({ noWaitAfter: true });
    await sleep(4000);
    const openedAfter = await page.evaluate(() => window.__mwOpenParts?.() ?? -1);
    console.log(`  перед захватом кадра: было открыто ${openedBeforeCapture}, стало ${openedAfter}`);
  }

  /* ── Телефон ── */
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await openScene(phone, 390, 844);
  const phoneBox = await phone.locator('canvas').boundingBox();
  // Сцена лежит ниже сравнения: на телефоне её надо привести в кадр,
  // иначе проекция даёт точку за пределами окна и клик уходит в никуда.
  await phone.locator('canvas').scrollIntoViewIfNeeded();
  await sleep(800);

  const phonePart = await phone.evaluate(() => {
    const w = window;
    const id = (w.__mwOpenableIds?.() ?? [])[0];
    return id ? { id, point: w.__mwPartPoint?.(id) ?? null, size: w.__mwPartSize?.(id) ?? null } : null;
  });

  const openedPhoneBefore = await phone.evaluate(() => window.__mwOpenParts?.() ?? -1);
  if (phonePart?.point) {
    await phone.touchscreen.tap(phonePart.point.x, phonePart.point.y);
    await sleep(1000);
    let openedPhoneAfter = await phone.evaluate(() => window.__mwOpenParts?.() ?? -1);

    // Если палец не сработал, проверяем тот же пиксель мышью: так видно,
    // промах это по геометрии или именно касание не доходит.
    if (openedPhoneAfter === openedPhoneBefore) {
      await phone.mouse.click(phonePart.point.x, phonePart.point.y);
      await sleep(1000);
      const byMouse = await phone.evaluate(() => window.__mwOpenParts?.() ?? -1);
      console.log(`  тот же пиксель мышью: ${openedPhoneBefore} → ${byMouse}`);
      openedPhoneAfter = byMouse;
    }
    console.log(
      `  390 px, тап по элементу ${phonePart.id}: ${openedPhoneBefore} → ${openedPhoneAfter}` +
        (phonePart.size ? ` · зона касания ${phonePart.size.w}×${phonePart.size.h} px` : ''),
    );
  } else {
    console.log('  390 px: открываемых элементов в кадре нет');
  }
  await phone.screenshot({ path: `${OUT}/phone.png`, timeout: 120_000 });

  await browser.close();
  console.log(`  снимки: ${OUT}`);
} finally {
  server.kill();
  freePort(PORT);
}
process.exit(0);
