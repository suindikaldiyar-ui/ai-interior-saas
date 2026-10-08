/**
 * ИДЕНТИЧНОСТЬ СТЕН УГЛОВОЙ И П-ОБРАЗНОЙ КУХНИ — В БРАУЗЕРЕ, ПУТЁМ ЭКРАНА.
 *
 * Запуск: node scripts/check-wall-identity.mjs   (нужен build)
 *
 * Правка — это правка ОДНОЙ стены. Операция на стене Б не имеет права
 * менять стену А и наоборот; «Удалить» убирает ровно выбранный модуль;
 * смена угла и формы не перекладывает правки между стенами. А техника,
 * которую заказали, не исчезает молча: раскладка ставит прибор или
 * называет причину миллиметрами — на экране, а не только на той стене,
 * которую сейчас выбрали.
 *
 * Сценарии:
 *   L1  демо, Г (угол у стены А): правка А → Б та же; правка Б → А та же;
 *       удаление холодильника на правленой стене Б → холодильника нет
 *       нигде, а стена А с её правкой — та же до модуля;
 *   L2  демо, Г: угол «верх пустой» → стена Б → холодильник → «Удалить»
 *       (подтверждённый повтор) → стена А та же, холодильника нет;
 *   L3  демо, Г: замена модуля стены Б карточкой библиотеки → стена А та
 *       же, на месте модуля Б — выбранная карточка;
 *   L4  демо, Г, без правок: удаление холодильника на стене Б, собранной
 *       раскладкой, → стена А та же, холодильника нет, первый модуль Б на
 *       месте;
 *   U1  /measure 3600 × 3000, П (углы у А и у Б): правки А, Б, В (замена
 *       модуля карточкой) не задевают других стен; смена угла Б–В (владелец
 *       Б) не теряет и не переносит правок; П → Г → П — правки на своих
 *       стенах; удаление прибора стены В убирает ровно его;
 *   U2  /measure 3200 × 2400, П: духовка либо стоит на стене, либо на экране
 *       (при выбранной стене А) названа причина: свободно X мм, нужно Y мм,
 *       не хватает Z мм — и числа сходятся;
 *   U3  /measure 3600 × 3000, П: правки А и Б → «ряд здесь?» на стене 2 →
 *       стены композиции w2, w3, w4, у каждой — модули только своей стены,
 *       правок w1 и w2 нет на чужих стенах → ряд обратно на стену 1 → все
 *       три стены ровно такие, как до переноса.
 *
 * Сравнение — по разметке схемы: у каждой стены блок `[data-wall-block]`,
 * у модуля — идентификатор (вид, отметка, прибор, стена) и ширина. Ноль
 * найденных стен, модулей или приборов — FAIL со словами.
 *
 * Снимки — в `.capture-check/wall-identity/`. Инструмент глазной
 * проверки, в `verify` не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 3241;
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/wall-identity';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, { encoding: 'utf8' });
    for (const line of out.split(/\r?\n/)) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== '0') execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    }
  } catch {
    /* никто не слушает */
  }
}

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}${detail ? `  ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? `  ${detail}` : ''}`);
  }
};

async function until(read, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await read()) return true;
    await sleep(250);
  }
  return false;
}

async function toStep(page, title) {
  const button = page.locator(`nav[aria-label="Шаги работы"] button[aria-label="${title}"]`);
  await button.click({ timeout: 30_000 });
  const opened = await until(async () => (await button.getAttribute('aria-current')) === 'step', 15_000);
  if (!opened) throw new Error(`шаг «${title}» не открылся`);
  await sleep(600);
}

async function ready(page) {
  const ok = await until(async () => (await page.locator('nav[aria-label="Шаги работы"] button').count()) > 0, 120_000);
  if (!ok) throw new Error('полоса шагов не появилась за 120 с');
}

/* ─────────────────────────  что на схеме  ───────────────────────── */

/** Ряды всех стен со схемы: стена, длина, модули (id, ряд, отметка, ширина). */
async function rows(page) {
  await page.locator('[data-schematic-tab="front"]').click();
  await sleep(700);
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-schematic] [data-wall-block]')).map((block) => ({
      wall: Number(block.getAttribute('data-wall-block')),
      lengthMm: Number(block.getAttribute('data-wall-length')),
      modules: Array.from(block.querySelectorAll('[data-module-id]')).map((node) => {
        const id = node.getAttribute('data-module-id') ?? '';
        const m = id.match(/^([a-z_]+)-(-?\d+)(?:-([a-z0-9_]+))?@(.+)$/);
        return {
          id,
          row: m ? m[1] : '',
          offsetMm: m ? Number(m[2]) : NaN,
          appliance: m?.[3] ?? null,
          wallId: m?.[4] ?? null,
          widthMm: Number(node.getAttribute('data-module-width')),
          variant: node.getAttribute('data-module-variant') ?? '',
        };
      }),
    })),
  );
}

const sig = (block) =>
  block ? block.modules.map((m) => `${m.id}:${m.widthMm}${m.variant ? `:${m.variant}` : ''}`).join(' ') : 'СТЕНЫ НЕТ';
const wallOf = (list, wall) => list.find((block) => block.wall === wall);
const appliancesOf = (list) => list.flatMap((block) => block.modules.map((m) => m.appliance).filter(Boolean));
const holder = (list, appliance) => list.filter((block) => block.modules.some((m) => m.appliance === appliance)).map((b) => b.wall);

/** Обычный модуль нижнего ряда не у края стены — удалить его можно без угла и прибора. */
function plainInside(block) {
  return block?.modules.find(
    (m) => m.row === 'base' && !m.appliance && m.offsetMm > 0 && m.offsetMm + m.widthMm < block.lengthMm,
  );
}

async function select(page, wall, id) {
  const node = page.locator(`[data-schematic] [data-wall-block="${wall}"] [data-module-id="${id}"]`).first();
  if ((await node.count()) === 0) return false;
  await node.click({ force: true });
  await sleep(900);
  return true;
}

async function remove(page) {
  const button = page.locator('[data-module-action="remove"]').filter({ visible: true });
  if ((await button.count()) !== 1) return false;
  if (await button.isDisabled()) return false;
  await button.click();
  await sleep(1600);
  return true;
}

/**
 * ПРАВКА СТЕНЫ — ЗАМЕНА МОДУЛЯ КАРТОЧКОЙ БИБЛИОТЕКИ ТОЙ ЖЕ ШИРИНЫ.
 *
 * Удаление у слепого угла и у края стены не всегда возможно, а замена той
 * же ширины соседей не двигает (ловушка 433) — правка ровно одного модуля.
 * Возвращает, какой модуль и на что заменён; `null` — карточки нет.
 */
async function replaceOn(page, list, wall) {
  const block = wallOf(list, wall);
  /* Сначала нижний ряд, потом верхний: у слепого угла нижний модуль меняется только на дверцу. */
  const plain = (row) => (block?.modules ?? []).filter((m) => m.row === row && !m.appliance);
  for (const target of [...plain('base'), ...plain('upper')]) {
    if (!(await select(page, wall, target.id))) continue;
    const cards = page
      .locator(`[data-card][data-refused="0"][aria-pressed="false"][data-width="${target.widthMm}"]`)
      .filter({ visible: true });
    if ((await cards.count()) === 0) continue;
    const variant = await cards.first().getAttribute('data-variant');
    await cards.first().click();
    await sleep(1800);
    return { id: target.id, widthMm: target.widthMm, from: target.variant, variant };
  }
  return null;
}

/**
 * Правка стены: замена карточкой, а где заменить нечего (у слепого угла
 * нижний модуль меняется только на дверцу, у кладовки над колонной
 * библиотеки нет) — снятие шкафа верхнего ряда не у края: соседи в
 * верхнем ряду остаются на местах (ловушка 410).
 */
async function editOn(page, list, wall) {
  const replaced = await replaceOn(page, list, wall);
  if (replaced) return replaced;
  const uppers = (wallOf(list, wall)?.modules ?? []).filter((m) => m.row === 'upper' && !m.appliance);
  for (const target of uppers.length > 2 ? uppers.slice(1, -1) : uppers) {
    if (!(await select(page, wall, target.id))) continue;
    if (!(await remove(page))) continue;
    return { id: target.id, widthMm: target.widthMm, from: target.variant, variant: null, removed: true };
  }
  return null;
}

/** Стоит ли на стене эта правка: заменённый модуль с новым видом либо снятого модуля нет. */
const carries = (block, edit) =>
  Boolean(edit) &&
  (edit.removed
    ? !(block?.modules ?? []).some((m) => m.id === edit.id)
    : (block?.modules ?? []).some((m) => m.id === edit.id && m.variant === edit.variant));
const editWords = (edit) => (edit ? `${edit.id}: ${edit.removed ? 'снят' : `${edit.from} → ${edit.variant}`}` : 'правки нет');

async function totalOf(page) {
  const node = page.locator('[data-estimate-total]').first();
  if ((await node.count()) === 0) return null;
  const value = Number(await node.getAttribute('data-estimate-total'));
  return Number.isFinite(value) ? value : null;
}

/** Стена, модули которой сравниваются, — та же до модуля. */
function same(name, before, after) {
  check(name, Boolean(before) && sig(before) === sig(after), `${sig(before)}  →  ${sig(after)}`);
}

/** Демонстрация в угловой форме, шаг «Раскладка». */
async function demoCorner(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => {
    failed += 1;
    console.log('  [ошибка страницы]', e.message.slice(0, 160));
  });
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await ready(page);
  await toStep(page, 'Размеры');
  await page.locator('[data-shape-kind="corner_l"]').click();
  await sleep(2500);
  return page;
}

/** Замер из четырёх стен по кругу на /measure, П-образная, шаг «Раскладка». */
async function measureU(browser, [a, b]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => {
    failed += 1;
    console.log('  [ошибка страницы]', e.message.slice(0, 160));
  });
  await page.goto(`${BASE}/measure`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByPlaceholder('ЖК Апельсин, кв. 42').waitFor({ timeout: 120_000 });
  await page.getByPlaceholder('ЖК Апельсин, кв. 42').fill('ЖК Апельсин, кв. 42');
  await page.getByPlaceholder('Ержан').fill('Ержан');
  await page.getByRole('button', { name: 'К замеру' }).click();
  await sleep(600);
  await page.getByLabel('Высота потолка').fill('2700');
  await page.getByLabel('Высота потолка').press('Enter');
  await page.getByRole('button', { name: 'Стены по кругу' }).click();
  await sleep(200);
  for (const [i, length] of [a, b, a, b].entries()) {
    if (i > 0) await page.getByRole('button', { name: '+ Стена' }).click();
    const field = page.getByLabel('Длина').nth(i);
    await field.fill(String(length));
    await field.press('Enter');
    await sleep(120);
  }
  await toStep(page, 'Размеры');
  await page.locator('[data-shape-kind="u_shape"]').click();
  await sleep(3000);
  return page;
}

/* ─────────────────────────  L1: правки А и Б, удаление на Б  ───────────────────────── */

async function scenarioL1(browser) {
  console.log('\n── L1. Г: правка А, правка Б, удаление холодильника на правленой стене Б');
  const page = await demoCorner(browser);
  await toStep(page, 'Раскладка');
  const start = await rows(page);
  check('на схеме две стены, на каждой есть модули', start.length === 2 && start.every((b) => b.modules.length > 0), start.map((b) => `${b.wall}:${b.modules.length}`).join(' · ') || 'НУЛЕВОЙ СЕЛЕКТОР: стен нет');
  const fridgeAt = holder(start, 'fridge');
  check('холодильник стоит на стене Б', fridgeAt.length === 1 && fridgeAt[0] === 1, `стены ${fridgeAt.join(', ') || 'нет'}`);

  /* Правка стены А: убрать обычный модуль. */
  const targetA = plainInside(wallOf(start, 0));
  const editedA = targetA && (await select(page, 0, targetA.id)) && (await remove(page));
  const afterA = await rows(page);
  check('правка стены А применилась', Boolean(editedA) && !wallOf(afterA, 0)?.modules.some((m) => m.id === targetA.id), targetA ? targetA.id : 'обычного модуля на стене А нет');
  same('правка стены А не меняет стену Б', wallOf(start, 1), wallOf(afterA, 1));

  /* Правка стены Б: убрать обычный модуль у начала ряда. */
  const targetB = wallOf(afterA, 1)?.modules.find((m) => m.row === 'base' && !m.appliance);
  const editedB = targetB && (await select(page, 1, targetB.id)) && (await remove(page));
  const afterB = await rows(page);
  check('правка стены Б применилась', Boolean(editedB) && sig(wallOf(afterB, 1)) !== sig(wallOf(afterA, 1)), targetB ? targetB.id : 'обычного модуля на стене Б нет');
  same('правка стены Б не меняет стену А', wallOf(afterA, 0), wallOf(afterB, 0));

  /* Удаление прибора на правленой стене Б. */
  const fridge = wallOf(afterB, 1)?.modules.find((m) => m.appliance === 'fridge');
  const totalBefore = await totalOf(page);
  const removed = fridge && (await select(page, 1, fridge.id)) && (await remove(page));
  const afterF = await rows(page);
  const totalAfter = await totalOf(page);
  check('«Удалить» на холодильнике нажимается', Boolean(removed), fridge ? fridge.id : 'холодильника на стене Б нет');
  check('холодильника нет ни на одной стене', !appliancesOf(afterF).includes('fridge'), appliancesOf(afterF).join(', '));
  same('удаление на стене Б не меняет стену А (её правка на месте)', wallOf(afterB, 0), wallOf(afterF, 0));
  const leftOfFridge = (block) =>
    sig({ modules: (block?.modules ?? []).filter((m) => m.row === 'base' && fridge && m.offsetMm + m.widthMm <= fridge.offsetMm) });
  check('модули стены Б левее холодильника на местах', Boolean(fridge) && leftOfFridge(wallOf(afterB, 1)) === leftOfFridge(wallOf(afterF, 1)), `${leftOfFridge(wallOf(afterB, 1)) || 'пусто'} → ${leftOfFridge(wallOf(afterF, 1)) || 'пусто'}`);
  console.log(`  ··   итог ${totalBefore} → ${totalAfter} ₸`);
  await page.close();
}

/* ─────────────────────────  L2: подтверждённый повтор  ───────────────────────── */

async function scenarioL2(browser) {
  console.log('\n── L2. Г: угол «верх пустой» → стена Б → холодильник → «Удалить»');
  const page = await demoCorner(browser);
  const corner = page.locator('[data-corner-index="0"]');
  check('кнопка угла есть', (await corner.count()) === 1, `${await corner.count()} кнопок`);
  await corner.click();
  await sleep(1500);
  const card = page.locator('[data-corner-card="upper:empty"]');
  if ((await card.count()) === 1 && (await card.getAttribute('aria-pressed')) !== 'true') {
    await card.click();
    await sleep(2000);
  }
  check('угол: низ слепой, верх пустой', (await corner.getAttribute('data-corner-upper')) === 'empty', `верх ${await corner.getAttribute('data-corner-upper')}`);

  await page.locator('[data-wall="1"]').click();
  await sleep(1200);
  await toStep(page, 'Раскладка');
  const before = await rows(page);
  const totalBefore = await totalOf(page);
  const fridge = wallOf(before, 1)?.modules.find((m) => m.appliance === 'fridge');
  const removed = fridge && (await select(page, 1, fridge.id)) && (await remove(page));
  const after = await rows(page);
  const totalAfter = await totalOf(page);
  check('«Удалить» на холодильнике стены Б нажимается', Boolean(removed), fridge ? fridge.id : 'холодильника на стене Б нет');
  check('холодильника нет ни на одной стене', !appliancesOf(after).includes('fridge'), appliancesOf(after).join(', '));
  same('стена А та же до модуля, верхний шкаф у угла на месте', wallOf(before, 0), wallOf(after, 0));
  const base0 = (block) => block?.modules.find((m) => m.row === 'base' && m.offsetMm === 0);
  check('первый модуль стены Б на месте', Boolean(base0(wallOf(before, 1))) && `${base0(wallOf(before, 1))?.id}:${base0(wallOf(before, 1))?.widthMm}` === `${base0(wallOf(after, 1))?.id}:${base0(wallOf(after, 1))?.widthMm}`, `${base0(wallOf(before, 1))?.id} → ${base0(wallOf(after, 1))?.id ?? 'нет'}`);
  console.log(`  ··   стена Б: ${sig(wallOf(before, 1))}  →  ${sig(wallOf(after, 1))}`);
  console.log(`  ··   итог ${totalBefore} → ${totalAfter} ₸`);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/L-wallB-delete.png` });
  await page.close();
}

/* ─────────────────────────  L3: замена на стене Б  ───────────────────────── */

async function scenarioL3(browser) {
  console.log('\n── L3. Г: замена модуля стены Б карточкой библиотеки');
  const page = await demoCorner(browser);
  await toStep(page, 'Раскладка');
  const before = await rows(page);
  const target = wallOf(before, 1)?.modules.find((m) => m.row === 'base' && !m.appliance);
  const picked = target && (await select(page, 1, target.id));
  const cards = page.locator(`[data-card][data-refused="0"][aria-pressed="false"][data-width="${target?.widthMm}"]`).filter({ visible: true });
  check('у модуля стены Б есть карточки замены той же ширины', Boolean(picked) && (await cards.count()) > 0, target ? `${target.id} · карточек ${await cards.count()}` : 'обычного модуля на стене Б нет');
  const key = (await cards.count()) > 0 ? await cards.first().getAttribute('data-card') : null;
  if (key) {
    await cards.first().click();
    await sleep(1800);
  }
  const after = await rows(page);
  same('замена на стене Б не меняет стену А', wallOf(before, 0), wallOf(after, 0));
  const reselected = target && (await select(page, 1, target.id));
  const current = key ? await page.locator(`[data-card="${key}"]`).first().getAttribute('aria-pressed') : null;
  check('на месте модуля Б — выбранная карточка', Boolean(reselected) && current === 'true', `${key ?? 'карточки нет'} · стоит сейчас ${current}`);
  const others = (block) => sig({ modules: (block?.modules ?? []).filter((m) => m.id !== target?.id) });
  check('остальные модули стены Б на местах', others(wallOf(before, 1)) === others(wallOf(after, 1)), `${others(wallOf(before, 1))} → ${others(wallOf(after, 1))}`);
  await page.close();
}

/* ─────────────────────────  L4: удаление на стене, собранной раскладкой  ───────────────────────── */

async function scenarioL4(browser) {
  console.log('\n── L4. Г без правок: удаление холодильника на стене Б, собранной раскладкой');
  const page = await demoCorner(browser);
  await toStep(page, 'Раскладка');
  const before = await rows(page);
  const fridge = wallOf(before, 1)?.modules.find((m) => m.appliance === 'fridge');
  const removed = fridge && (await select(page, 1, fridge.id)) && (await remove(page));
  const after = await rows(page);
  check('«Удалить» на холодильнике стены Б нажимается', Boolean(removed), fridge ? fridge.id : 'холодильника на стене Б нет');
  check('холодильника нет ни на одной стене', !appliancesOf(after).includes('fridge'), appliancesOf(after).join(', '));
  same('стена А та же до модуля', wallOf(before, 0), wallOf(after, 0));
  const base0 = (block) => block?.modules.find((m) => m.row === 'base' && m.offsetMm === 0);
  check(
    'первый модуль стены Б на месте',
    Boolean(base0(wallOf(before, 1))) && `${base0(wallOf(before, 1))?.id}:${base0(wallOf(before, 1))?.widthMm}` === `${base0(wallOf(after, 1))?.id}:${base0(wallOf(after, 1))?.widthMm}`,
    `${base0(wallOf(before, 1))?.id} → ${base0(wallOf(after, 1))?.id ?? 'нет'}`,
  );
  console.log(`  ··   стена Б: ${sig(wallOf(before, 1))}  →  ${sig(wallOf(after, 1))}`);
  await page.close();
}

/* ─────────────────────────  U1: П, правки трёх стен  ───────────────────────── */

async function scenarioU1(browser) {
  console.log('\n── U1. П 3600 × 3000: правки А, Б, В; угол у Б; П → Г → П; удаление на В');
  const page = await measureU(browser, [3600, 3000]);
  check('П-образная собралась: три стены, два угла', (await page.locator('[data-wall]').count()) === 3 && (await page.locator('[data-corner-index]').count()) === 2, `стен ${await page.locator('[data-wall]').count()}, углов ${await page.locator('[data-corner-index]').count()}`);
  await toStep(page, 'Раскладка');
  const start = await rows(page);
  check('на схеме три стены с модулями', start.length === 3 && start.every((b) => b.modules.length > 0), start.map((b) => `${b.wall}:${b.modules.length}`).join(' · ') || 'НУЛЕВОЙ СЕЛЕКТОР: стен нет');
  const ownWall = (list) => list.every((block) => block.modules.every((m) => m.wallId === block.modules[0]?.wallId));
  check('у каждой стены модули только своей стены', ownWall(start) && new Set(start.map((b) => b.modules[0]?.wallId)).size === 3, start.map((b) => b.modules[0]?.wallId).join(', '));

  let current = start;
  const edits = {};
  for (const [wall, label] of [[0, 'А'], [1, 'Б'], [2, 'В']]) {
    const edit = await editOn(page, current, wall);
    const next = await rows(page);
    check(
      `правка стены ${label} применилась`,
      carries(wallOf(next, wall), edit) && sig(wallOf(next, wall)) !== sig(wallOf(current, wall)),
      edit ? editWords(edit) : `на стене ${label} нечего ни заменить, ни снять`,
    );
    for (const other of [0, 1, 2].filter((w) => w !== wall)) {
      same(`правка стены ${label} не меняет стену ${['А', 'Б', 'В'][other]}`, wallOf(current, other), wallOf(next, other));
    }
    edits[wall] = edit;
    current = next;
  }
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/U-three-walls.png` });

  /* Смена угла Б–В: владелец — стена Б. */
  await toStep(page, 'Размеры');
  const cornerB = page.locator('[data-corner-index="1"]');
  await cornerB.click();
  await sleep(1500);
  const free = page.locator('[data-corner-card][data-refused="0"][aria-pressed="false"]');
  const freeKey = (await free.count()) > 0 ? await free.first().getAttribute('data-corner-card') : null;
  if (freeKey) {
    await free.first().click();
    await sleep(2200);
  }
  check('угол Б–В сменился', Boolean(freeKey), freeKey ?? 'свободной карточки угла нет');
  await toStep(page, 'Раскладка');
  const afterCorner = await rows(page);
  same('смена угла Б–В не меняет стену А', wallOf(current, 0), wallOf(afterCorner, 0));
  for (const [wall, label] of [[1, 'Б'], [2, 'В']]) {
    check(
      `правка стены ${label} пережила смену угла`,
      carries(wallOf(afterCorner, wall), edits[wall]),
      edits[wall] ? `${editWords(edits[wall])}: ${carries(wallOf(afterCorner, wall), edits[wall]) ? 'на месте' : 'ПРОПАЛА'}` : 'правки не было',
    );
  }
  check('и модули не переехали между стенами', ownWall(afterCorner) && new Set(afterCorner.map((b) => b.modules[0]?.wallId)).size === 3, afterCorner.map((b) => b.modules[0]?.wallId).join(', '));

  /* П → Г → П: правки остаются на своих стенах. */
  await toStep(page, 'Размеры');
  await page.locator('[data-shape-kind="corner_l"]').click();
  await sleep(2500);
  await toStep(page, 'Раскладка');
  const asL = await rows(page);
  same('П → Г: стена А та же', wallOf(afterCorner, 0), wallOf(asL, 0));
  check(
    'П → Г: правка стены Б на ней',
    carries(wallOf(asL, 1), edits[1]),
    edits[1] ? `${editWords(edits[1])} · ${sig(wallOf(asL, 1))}` : 'правки не было',
  );
  await toStep(page, 'Размеры');
  await page.locator('[data-shape-kind="u_shape"]').click();
  await sleep(2500);
  await toStep(page, 'Раскладка');
  const backU = await rows(page);
  for (const [wall, label] of [[0, 'А'], [1, 'Б'], [2, 'В']]) {
    same(`Г → П: стена ${label} та же, что до смены формы`, wallOf(afterCorner, wall), wallOf(backU, wall));
  }

  /* Удаление прибора на стене В. */
  const cBlock = wallOf(backU, 2);
  const appliance = cBlock?.modules.find((m) => m.row === 'base' && m.appliance);
  const done = appliance && (await select(page, 2, appliance.id)) && (await remove(page));
  const afterDel = await rows(page);
  check('прибор стены В удаляется', Boolean(done) && !appliancesOf(afterDel).includes(appliance.appliance), appliance ? appliance.id : 'прибора на стене В нет');
  same('удаление на стене В не меняет стену А', wallOf(backU, 0), wallOf(afterDel, 0));
  same('и стену Б', wallOf(backU, 1), wallOf(afterDel, 1));
  const left = (block) => sig({ modules: (block?.modules ?? []).filter((m) => m.row === 'base' && appliance && m.offsetMm + m.widthMm <= appliance.offsetMm) });
  check('модули стены В левее прибора на местах', Boolean(appliance) && left(cBlock) === left(wallOf(afterDel, 2)), `${left(cBlock) || 'пусто'} → ${left(wallOf(afterDel, 2)) || 'пусто'}`);
  await page.close();
}

/* ─────────────────────────  U2: духовка на П 3200 × 2400  ───────────────────────── */

async function scenarioU2(browser) {
  console.log('\n── U2. П 3200 × 2400: духовка стоит или причина названа миллиметрами');
  const page = await measureU(browser, [3200, 2400]);
  check('выбрана стена А', (await page.locator('[data-wall="0"]').getAttribute('aria-pressed')) === 'true');
  const list = await rows(page);
  check('на схеме три стены с модулями', list.length === 3 && list.every((b) => b.modules.length > 0), list.map((b) => `${b.wall}:${b.modules.length}`).join(' · ') || 'НУЛЕВОЙ СЕЛЕКТОР: стен нет');
  const present = appliancesOf(list);
  const footer = (await page.locator('footer').innerText()).replace(/\s+/g, ' ');
  const reason = footer.match(/(Стена [АБВ])[^.]*Духовой шкаф[^.]*свободно (\d+) мм, нужно (\d+) мм, не хватает (\d+) мм/);
  if (present.includes('oven')) {
    check('духовка стоит на стене', true, `стены ${holder(list, 'oven').join(', ')}`);
  } else {
    const [, wall, free, need, missing] = reason ?? [];
    check(
      'духовки на схеме нет — и причина на экране при выбранной стене А',
      Boolean(reason),
      reason ? reason[0] : `приборы на схеме: ${present.join(', ') || 'нет'} · подвал: ${footer.slice(0, 200)}`,
    );
    check(
      'числа причины сходятся: свободно + не хватает = нужно, нужно = ширина духовки 600',
      Boolean(reason) && Number(free) + Number(missing) === Number(need) && Number(need) === 600 && Number(missing) > 0,
      reason ? `${wall}: свободно ${free}, нужно ${need}, не хватает ${missing}` : 'причины нет',
    );
    check(
      'причина называет стену, где стоят пеналы',
      Boolean(reason) && wall === `Стена ${['А', 'Б', 'В'][holder(list, 'fridge')[0] ?? -1] ?? '?'}`,
      reason ? `${wall}, холодильник на стене ${holder(list, 'fridge').join(', ')}` : 'причины нет',
    );
  }
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/U-3200-oven.png` });
  await page.close();
}

/* ─────────────────────────  U3: ряд на другой стене замера  ───────────────────────── */

/** «ряд здесь?» у стены замера с этим номером (1…4) на шаге «Замер». */
async function runWallHere(page, number) {
  await toStep(page, 'Замер');
  await page.getByRole('button', { name: 'Стены по кругу' }).click();
  await sleep(400);
  const row = page.locator('[data-survey-step="walls"] > div').nth(number - 1);
  const button = row.getByRole('button', { name: 'ряд здесь?', exact: true });
  if ((await button.count()) !== 1) return false;
  await button.click();
  await sleep(1500);
  return (await row.getByRole('button', { name: 'ряд здесь', exact: true }).count()) === 1;
}

async function scenarioU3(browser) {
  console.log('\n── U3. П 3600 × 3000: правки А и Б → «ряд здесь?» на стене 2 → обратно');
  const page = await measureU(browser, [3600, 3000]);
  await toStep(page, 'Раскладка');
  const start = await rows(page);
  check('на схеме три стены w1, w2, w3', start.map((b) => b.modules[0]?.wallId).join(',') === 'w1,w2,w3', start.map((b) => b.modules[0]?.wallId ?? 'пусто').join(', ') || 'НУЛЕВОЙ СЕЛЕКТОР: стен нет');
  const editA = await editOn(page, start, 0);
  const afterA = await rows(page);
  const editB = await editOn(page, afterA, 1);
  const edited = await rows(page);
  check(
    'правки стен А и Б применились',
    carries(wallOf(edited, 0), editA) && carries(wallOf(edited, 1), editB) &&
      sig(wallOf(edited, 0)) !== sig(wallOf(start, 0)) && sig(wallOf(edited, 1)) !== sig(wallOf(start, 1)),
    `${editWords(editA)} · ${editWords(editB)}`,
  );

  const moved = await runWallHere(page, 2);
  check('ряд перенесён на стену 2', moved, moved ? 'ряд здесь — стена 2' : 'кнопки «ряд здесь?» у стены 2 нет');
  await toStep(page, 'Раскладка');
  const shifted = await rows(page);
  const order = shifted.map((b) => b.modules[0]?.wallId ?? 'пусто');
  check('стены композиции — w2, w3, w4 по обходу от рабочей', order.join(',') === 'w2,w3,w4', order.join(', ') || 'НУЛЕВОЙ СЕЛЕКТОР: стен нет');
  check(
    'у каждой стены модули только своей стены',
    shifted.length === 3 && shifted.every((block) => block.modules.length > 0 && block.modules.every((m) => m.wallId === block.modules[0].wallId)),
    shifted.map((b) => `${b.wall}: ${Array.from(new Set(b.modules.map((m) => m.wallId))).join('+')}`).join(' · '),
  );
  /* Стена w1 в композицию больше не входит: её модулей (правленого ряда стены А) нет нигде. */
  const onBlocks = (wallId) => shifted.filter((b) => b.modules.some((m) => m.wallId === wallId)).map((b) => b.wall);
  check(
    'правленый ряд стены w1 не лёг на чужую стену',
    Boolean(editA) && onBlocks('w1').length === 0,
    `модули w1 на стенах: ${onBlocks('w1').join(', ') || 'нигде'}`,
  );
  /* Стена w2 стала рабочей: её правленый ряд соседней стены не встаёт ни на w3, ни на w4. */
  check(
    'правленый ряд стены w2 не лёг на стену w3 или w4',
    Boolean(editB) && onBlocks('w2').every((wall) => wall === 0),
    `модули w2 на стенах: ${onBlocks('w2').join(', ') || 'нигде'}`,
  );

  const back = await runWallHere(page, 1);
  check('ряд вернулся на стену 1', back, back ? 'ряд здесь — стена 1' : 'кнопки «ряд здесь?» у стены 1 нет');
  await toStep(page, 'Раскладка');
  const restored = await rows(page);
  for (const [wall, label] of [[0, 'А'], [1, 'Б'], [2, 'В']]) {
    same(`стена ${label} та же, что до переноса ряда`, wallOf(edited, wall), wallOf(restored, wall));
  }
  await page.close();
}

/* ─────────────────────────  запуск  ───────────────────────── */

freePort(PORT);
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
  env: { ...process.env, SITE_PASSWORD: '' },
});

let browser;
try {
  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    try {
      up = (await fetch(BASE)).ok;
    } catch {
      /* поднимается */
    }
    if (!up) await sleep(1000);
  }
  if (!up) throw new Error(`сервер на ${BASE} не поднялся за 120 с`);
  browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });
  const only = (process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const scenarios = {
    L1: scenarioL1,
    L2: scenarioL2,
    L3: scenarioL3,
    L4: scenarioL4,
    U1: scenarioU1,
    U2: scenarioU2,
    U3: scenarioU3,
  };
  const unknown = only.filter((key) => !(key in scenarios));
  if (unknown.length > 0) throw new Error(`нет таких сценариев: ${unknown.join(', ')}`);
  for (const [key, run] of Object.entries(scenarios)) {
    if (only.length > 0 && !only.includes(key)) continue;
    try {
      await run(browser);
    } catch (error) {
      failed += 1;
      console.log(`  FAIL сценарий ${key} оборвался: ${error instanceof Error ? error.message.split('\n')[0] : error}`);
    }
  }
} catch (error) {
  failed += 1;
  console.log(`  FAIL ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser?.close();
  server.kill();
  try {
    execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' });
  } catch {
    /* уже остановлен */
  }
  freePort(PORT);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
