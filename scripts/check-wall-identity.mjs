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
 * P0-3 — физическая идентичность стен, приборов и углов:
 *   A1  /measure Г 3600 × 3000: холодильник перенесён на стену А (w1) →
 *       «ряд здесь?» на стене 4 → он на w1 (теперь стена Б), не на w4;
 *   A2  /measure П 3600 × 3000: холодильник перенесён на стену В (w3) →
 *       «ряд здесь?» на стене 2 → он на w3 (теперь стена Б), не на w4;
 *   B1  П: у угла w1–w2 верх пустой → «ряд здесь?» на стене 2 → угол
 *       w2–w3 своего выбора (слепой), а не чужого; на экране сказано, что
 *       правки стен 1 и 2 сохранены; обратно — у угла w1–w2 снова пустой
 *       верх, стены ровно такие, как до переноса;
 *   B2  П: последний модуль стены В — двустворчатый → «ряд здесь?» на
 *       стене 2 → стена w3 стала владельцем угла, створки в слепой зоне:
 *       конфликт словами с миллиметрами, цены нет, «Пересобрать стену Б»,
 *       правка не тронута; обратно — конфликта нет, правка на месте;
 *   B3  П: правки А и Б → «ряд здесь?» на стене 4 → w2 стала последней
 *       и угол w2–w3 потеряла. До P0-3b здесь ждали «совместимо, конфликта
 *       нет» — это и был дефект: слепой модуль без глухой части — одна
 *       створка во всю ширину корпуса. Теперь: красная полоса со стеной,
 *       створкой, пределом и превышением в мм, цены нет, «Дальше» и
 *       выгрузка для раскроя заперты, пересборка — стены w2 по её wallId;
 *       после пересборки w4 и w1 те же, правка А на месте;
 *
 * P0-3b — модуль после смены роли угла проходит правила производства:
 *   B4  Г: правки А и Б в П → форма «Угловая» → w2 теряет угол: створки
 *       названы; «ряд здесь?» в Г правку в другой роли не ставит — ложной
 *       тревоги нет, правки названы словами; обратно — конфликт снова,
 *       пересборка w2, стена А с правкой та же;
 *   B5  прямая: правка А в П → «Прямая» → w1 теряет угол: створки
 *       названы, цены нет, выгрузка заперта, пересборка w1;
 *   B6  П 3600 × 2436, у угла w2–w3 верх пустой: глухая часть — свой
 *       корпус не шире одной створки → «ряд здесь?» на стене 4 → ложной
 *       тревоги нет, цена на экране, выгрузка открыта;
 *   LG  старый объект в базе (закрепление холодильника номером стены,
 *       углы массивом без меток, выбранное решение): открылся — холодильник
 *       на той стене, где его закрепили, угол прежний; «ряд здесь?» —
 *       холодильник остаётся на своей физической стене. Объект, организация
 *       и пользователь заводятся служебным ключом и удаляются.
 *
 * Сравнение — по разметке схемы: у каждой стены блок `[data-wall-block]`,
 * у модуля — идентификатор (вид, отметка, прибор, стена) и ширина. Ноль
 * найденных стен, модулей или приборов — FAIL со словами.
 *
 * Снимки — в `.capture-check/wall-identity/`. Инструмент глазной
 * проверки, в `verify` не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

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

/** Замер из четырёх стен по кругу на /measure, П-образная, шаг «Размеры». */
async function measureU(browser, lengths) {
  return measureShape(browser, lengths, 'u_shape');
}

/** Замер из четырёх стен по кругу на /measure (a, b, a, b), форма `kind`, шаг «Размеры». */
async function measureShape(browser, [a, b], kind) {
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
  await page.locator(`[data-shape-kind="${kind}"]`).click();
  await sleep(3000);
  return page;
}

/* ─────────────────────────  P0-3: стена по физическому wallId  ───────────────────────── */

/** Физические стены блоков схемы по порядку: метка модулей «…@w1». */
const wallIdsOf = (list) => list.map((block) => block.modules[0]?.wallId ?? 'пусто');
/** Блок схемы физической стены. */
const blockOfWall = (list, wallId) => list.find((block) => block.modules[0]?.wallId === wallId);
/** На какой физической стене стоит прибор: одна стена — её id, иначе слова. */
function applianceWall(list, appliance) {
  const blocks = list.filter((block) => block.modules.some((m) => m.appliance === appliance));
  if (blocks.length === 0) return 'НЕТ НА СХЕМЕ';
  if (blocks.length > 1) return `НА ${blocks.length} СТЕНАХ`;
  return blocks[0].modules.find((m) => m.appliance === appliance).wallId;
}
const countOf = (list, appliance) =>
  list.reduce((sum, block) => sum + block.modules.filter((m) => m.appliance === appliance).length, 0);

/** Перенос прибора на стену композиции `toWall` — кнопкой панели модуля. */
async function moveAppliance(page, list, appliance, toWall) {
  const block = list.find((b) => b.modules.some((m) => m.appliance === appliance));
  if (!block) return `${appliance}: на схеме его нет`;
  const unit = block.modules.find((m) => m.appliance === appliance);
  if (!(await select(page, block.wall, unit.id))) return `${unit.id}: модуль на схеме не нажимается`;
  const button = page.locator(`[data-appliance-move] [data-move-appliance="${toWall}"]`).filter({ visible: true });
  if ((await button.count()) !== 1) return `кнопки переноса на стену ${toWall} нет (${await button.count()})`;
  await button.click();
  await sleep(1800);
  return null;
}

/** Выбор угла `index` в панели угла: карточка `key`. Пусто — выбран. */
async function chooseCorner(page, index, key) {
  await toStep(page, 'Размеры');
  const corner = page.locator(`[data-corner-index="${index}"]`);
  if ((await corner.count()) !== 1) return `угла ${index} нет`;
  await corner.click();
  await sleep(1500);
  const card = page.locator(`[data-corner-card="${key}"]`).filter({ visible: true });
  if ((await card.count()) !== 1) return `карточки ${key} нет`;
  if ((await card.getAttribute('data-refused')) === '1') return `карточка ${key} отказывает: ${await card.getAttribute('title')}`;
  if ((await card.getAttribute('aria-pressed')) !== 'true') {
    await card.click();
    await sleep(2200);
  }
  return null;
}

/** Выбор угла `index` словами: «низ/верх». Угла нет — `null`. */
async function cornerAt(page, index) {
  await toStep(page, 'Размеры');
  const corner = page.locator(`[data-corner-index="${index}"]`);
  if ((await corner.count()) !== 1) return null;
  return `${await corner.getAttribute('data-corner-lower')}/${await corner.getAttribute('data-corner-upper')}`;
}

/** Все уточнения экрана текстом: «ещё N» раскрывается. */
async function softText(page) {
  const more = page.locator('[data-soft-warnings] button', { hasText: /^ещё \d+$/ });
  if ((await more.count()) > 0) {
    await more.first().click();
    await sleep(300);
  }
  return (await page.locator('[data-soft-warnings] li').allInnerTexts()).join(' | ');
}

/** Замена модуля карточкой библиотеки той же ширины и вида `variant`. */
async function replaceWith(page, wall, unit, variants) {
  if (!(await select(page, wall, unit.id))) return `${unit.id}: модуль на схеме не нажимается`;
  for (const variant of variants) {
    const card = page
      .locator(`[data-card][data-refused="0"][aria-pressed="false"][data-width="${unit.widthMm}"][data-variant="${variant}"]`)
      .filter({ visible: true });
    if ((await card.count()) === 0) continue;
    await card.first().click();
    await sleep(1800);
    return null;
  }
  return `${unit.id}: карточек ${variants.join('/')} шириной ${unit.widthMm} мм нет`;
}

async function footerText(page) {
  return (await page.locator('footer').innerText()).replace(/\s+/g, ' ');
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
  const hiddenL = await softText(page);
  check(
    'П → Г: на экране сказано, что правка стены 3 замера сохранена и сейчас не участвует',
    /Стена 3 замера/.test(hiddenL) && /сохранена ручная раскладка/.test(hiddenL),
    hiddenL.slice(0, 260) || 'УТОЧНЕНИЙ НЕТ',
  );
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
  const hiddenU = await softText(page);
  check('Г → П: строки о сохранённой правке больше нет — она снова на стене', !/сохранена ручная раскладка/.test(hiddenU), hiddenU.slice(0, 200) || 'уточнений нет');

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

/* ─────────────────────────  A1: Г, прибор закреплён за физической стеной  ───────────────────────── */

async function scenarioA1(browser) {
  console.log('\n── A1. Г 3600 × 3000: холодильник на w1 → «ряд здесь?» на стене 4 → холодильник на w1');
  const page = await measureShape(browser, [3600, 3000], 'corner_l');
  await toStep(page, 'Раскладка');
  const start = await rows(page);
  check('Г из замера: стены w1, w2', wallIdsOf(start).join(',') === 'w1,w2', wallIdsOf(start).join(', ') || 'НУЛЕВОЙ СЕЛЕКТОР: стен нет');
  check('холодильник по правилу на w2 (короткая стена)', applianceWall(start, 'fridge') === 'w2', applianceWall(start, 'fridge'));
  const refused = await moveAppliance(page, start, 'fridge', 0);
  const pinned = await rows(page);
  check(
    'холодильник перенесён на стену А — физическую w1, и он один',
    !refused && applianceWall(pinned, 'fridge') === 'w1' && countOf(pinned, 'fridge') === 1,
    refused ?? `стоит на ${applianceWall(pinned, 'fridge')}, штук ${countOf(pinned, 'fridge')}`,
  );
  const moved = await runWallHere(page, 4);
  check('ряд перенесён на стену 4', moved, moved ? 'ряд здесь — стена 4' : 'кнопки «ряд здесь?» у стены 4 нет');
  await toStep(page, 'Раскладка');
  const shifted = await rows(page);
  check('стены композиции — w4, w1', wallIdsOf(shifted).join(',') === 'w4,w1', wallIdsOf(shifted).join(', ') || 'НУЛЕВОЙ СЕЛЕКТОР: стен нет');
  const fridge = blockOfWall(shifted, 'w1')?.modules.find((m) => m.appliance === 'fridge');
  check(
    'холодильник остался на физической стене w1 — теперь это стена Б',
    applianceWall(shifted, 'fridge') === 'w1' && countOf(shifted, 'fridge') === 1,
    `стоит на ${applianceWall(shifted, 'fridge')}${fridge ? ` (${fridge.id}, ${fridge.widthMm} мм)` : ''} · стены ${wallIdsOf(shifted).join(', ')}`,
  );
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/A1-L-fridge-on-w1.png` });
  const back = await runWallHere(page, 1);
  await toStep(page, 'Раскладка');
  const restored = await rows(page);
  check(
    'ряд вернулся на стену 1: стены w1, w2, холодильник на w1',
    back && wallIdsOf(restored).join(',') === 'w1,w2' && applianceWall(restored, 'fridge') === 'w1',
    `стены ${wallIdsOf(restored).join(', ')} · холодильник на ${applianceWall(restored, 'fridge')}`,
  );
  await page.close();
}

/* ─────────────────────────  A2: П, прибор закреплён за стеной В  ───────────────────────── */

async function scenarioA2(browser) {
  console.log('\n── A2. П 3600 × 3000: холодильник на w3 → «ряд здесь?» на стене 2 → холодильник на w3');
  const page = await measureShape(browser, [3600, 3000], 'u_shape');
  await toStep(page, 'Раскладка');
  const start = await rows(page);
  check('П из замера: стены w1, w2, w3', wallIdsOf(start).join(',') === 'w1,w2,w3', wallIdsOf(start).join(', ') || 'НУЛЕВОЙ СЕЛЕКТОР: стен нет');
  check('холодильник по правилу на w2', applianceWall(start, 'fridge') === 'w2', applianceWall(start, 'fridge'));
  const refused = await moveAppliance(page, start, 'fridge', 2);
  const pinned = await rows(page);
  check(
    'холодильник перенесён на стену В — физическую w3',
    !refused && applianceWall(pinned, 'fridge') === 'w3' && countOf(pinned, 'fridge') === 1,
    refused ?? `стоит на ${applianceWall(pinned, 'fridge')}`,
  );
  const moved = await runWallHere(page, 2);
  check('ряд перенесён на стену 2', moved, moved ? 'ряд здесь — стена 2' : 'кнопки «ряд здесь?» у стены 2 нет');
  await toStep(page, 'Раскладка');
  const shifted = await rows(page);
  check('стены композиции — w2, w3, w4', wallIdsOf(shifted).join(',') === 'w2,w3,w4', wallIdsOf(shifted).join(', ') || 'НУЛЕВОЙ СЕЛЕКТОР: стен нет');
  check(
    'холодильник остался на физической стене w3 — теперь это стена Б',
    applianceWall(shifted, 'fridge') === 'w3' && countOf(shifted, 'fridge') === 1,
    `стоит на ${applianceWall(shifted, 'fridge')} · стены ${wallIdsOf(shifted).join(', ')}`,
  );
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/A2-U-fridge-on-w3.png` });
  const back = await runWallHere(page, 1);
  await toStep(page, 'Раскладка');
  const restored = await rows(page);
  check(
    'ряд вернулся на стену 1: холодильник на w3 — стене В',
    back && wallIdsOf(restored).join(',') === 'w1,w2,w3' && applianceWall(restored, 'fridge') === 'w3',
    `стены ${wallIdsOf(restored).join(', ')} · холодильник на ${applianceWall(restored, 'fridge')}`,
  );
  await page.close();
}

/* ─────────────────────────  B1: угол по физической паре стен, скрытые правки  ───────────────────────── */

async function scenarioB1(browser) {
  console.log('\n── B1. П: угол w1–w2 — верх пустой → «ряд здесь?» на стене 2 → угол w2–w3 свой, правки названы');
  const page = await measureShape(browser, [3600, 3000], 'u_shape');
  const refused = await chooseCorner(page, 0, 'upper:empty');
  const chosen = await cornerAt(page, 0);
  check('угол w1–w2: верх пустой', !refused && chosen === 'blind/empty', refused ?? chosen ?? 'УГЛА НЕТ');
  const secondBefore = await cornerAt(page, 1);
  await toStep(page, 'Раскладка');
  const before = await rows(page);
  check('П: стены w1, w2, w3', wallIdsOf(before).join(',') === 'w1,w2,w3', wallIdsOf(before).join(', ') || 'НУЛЕВОЙ СЕЛЕКТОР: стен нет');

  const moved = await runWallHere(page, 2);
  check('ряд перенесён на стену 2', moved, moved ? 'ряд здесь — стена 2' : 'кнопки «ряд здесь?» у стены 2 нет');
  const first = await cornerAt(page, 0);
  const second = await cornerAt(page, 1);
  check(
    'угол w2–w3 (теперь первый) — его собственный выбор, а не пустой верх угла w1–w2',
    first === secondBefore && first !== 'blind/empty',
    `первый угол ${first ?? 'НЕТ'} · был у w2–w3 ${secondBefore ?? 'НЕТ'}`,
  );
  check('второй угол w3–w4 — новый, по умолчанию', second === 'blind/blind', second ?? 'УГЛА НЕТ');
  await toStep(page, 'Раскладка');
  const shifted = await rows(page);
  check('стены композиции — w2, w3, w4', wallIdsOf(shifted).join(',') === 'w2,w3,w4', wallIdsOf(shifted).join(', ') || 'НУЛЕВОЙ СЕЛЕКТОР: стен нет');
  const hidden = await softText(page);
  check(
    'на экране сказано: правки стен 1 и 2 замера сохранены и вернутся',
    /Стена 1 замера/.test(hidden) && /Стена 2 замера/.test(hidden) && /сохранена ручная раскладка/.test(hidden),
    hidden.slice(0, 320) || 'УТОЧНЕНИЙ НЕТ',
  );
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/B1-U-corner-transfer.png` });

  const back = await runWallHere(page, 1);
  const firstBack = await cornerAt(page, 0);
  check('обратно: у угла w1–w2 снова пустой верх', back && firstBack === 'blind/empty', firstBack ?? 'УГЛА НЕТ');
  await toStep(page, 'Раскладка');
  const restored = await rows(page);
  for (const [wall, label] of [[0, 'А'], [1, 'Б'], [2, 'В']]) {
    same(`обратно: стена ${label} та же, что до переноса`, wallOf(before, wall), wallOf(restored, wall));
  }
  const hiddenBack = await softText(page);
  check('обратно: строки о сохранённых правках нет', !/сохранена ручная раскладка/.test(hiddenBack), hiddenBack.slice(0, 200) || 'уточнений нет');
  await page.close();
}

/* ─────────────────────────  B2: правленая стена стала владельцем угла — конфликт  ───────────────────────── */

async function scenarioB2(browser) {
  console.log('\n── B2. П: двустворчатый модуль в конце стены В → «ряд здесь?» на стене 2 → конфликт угла');
  const page = await measureShape(browser, [3600, 3000], 'u_shape');
  await toStep(page, 'Раскладка');
  const start = await rows(page);
  const c = wallOf(start, 2);
  const last = c?.modules
    .filter((m) => m.row === 'base' && !m.appliance)
    .sort((x, y) => y.offsetMm + y.widthMm - (x.offsetMm + x.widthMm))[0];
  check('у стены В (w3) есть обычный модуль у её конца', Boolean(last) && last.offsetMm + last.widthMm === c.lengthMm, last ? `${last.id} ${last.widthMm} мм до ${last.offsetMm + last.widthMm} из ${c.lengthMm}` : 'НУЛЕВОЙ СЕЛЕКТОР: модуля нет');
  const refused = last ? await replaceWith(page, 2, last, ['door_two', 'drawers']) : 'модуля нет';
  const edited = await rows(page);
  const now = blockOfWall(edited, 'w3')?.modules.find((m) => m.id === last?.id);
  check('модуль у конца стены В заменён — не распашная дверца', !refused && Boolean(now) && now.variant !== 'door', refused ?? `${now?.id}: ${last?.variant} → ${now?.variant}`);
  const totalBefore = await totalOf(page);

  const moved = await runWallHere(page, 2);
  check('ряд перенесён на стену 2', moved, moved ? 'ряд здесь — стена 2' : 'кнопки «ряд здесь?» у стены 2 нет');
  await toStep(page, 'Раскладка');
  const shifted = await rows(page);
  check('стена w3 теперь стена Б', wallIdsOf(shifted)[1] === 'w3', wallIdsOf(shifted).join(', ') || 'НУЛЕВОЙ СЕЛЕКТОР: стен нет');
  const kept = blockOfWall(shifted, 'w3')?.modules.find((m) => m.id === last?.id);
  check('правка стены w3 не тронута молча: модуль тот же и того же вида', Boolean(kept) && kept.variant === now?.variant && kept.widthMm === now?.widthMm, kept ? `${kept.id} ${kept.variant} ${kept.widthMm} мм` : 'МОДУЛЯ НЕТ');
  const footer = await footerText(page);
  const conflict = /Стена Б:/.test(footer) && /угл/.test(footer) && /\d+ мм/.test(footer) && /Пересоберите/.test(footer);
  check(
    'красная полоса называет конфликт роли угла с миллиметрами',
    conflict,
    `подвал: ${footer.slice(0, 300)}`,
  );
  check('цены нет, пока конфликт не снят', (await page.locator('[data-estimate-total]').count()) === 0 && (await page.locator('[data-composition-refused]').count()) === 1, `сумм на экране ${await page.locator('[data-estimate-total]').count()}`);
  check('выход назван кнопкой «Пересобрать стену Б»', (await page.locator('[data-rebuild-wall="1"]').count()) === 1, `кнопок ${await page.locator('[data-rebuild-wall="1"]').count()}`);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/B2-U-corner-conflict.png` });

  const back = await runWallHere(page, 1);
  await toStep(page, 'Раскладка');
  const restored = await rows(page);
  const footerBack = await footerText(page);
  check('обратно: конфликта нет, цена на месте', back && !/Пересоберите/.test(footerBack) && (await totalOf(page)) === totalBefore, `итог ${await totalOf(page)} при прежнем ${totalBefore}`);
  same('обратно: стена В (w3) та же, правка на месте', blockOfWall(edited, 'w3'), blockOfWall(restored, 'w3'));
  await page.close();
}

/* ─────────────────────────  P0-3b: модуль после смены роли угла  ───────────────────────── */

/**
 * ПРЕДЕЛ ОДНОЙ РАСПАШНОЙ СТВОРКИ — порог `frontPlan` (`SINGLE_DOOR_MAX_MM`):
 * шире движок ставит две. Что это тот же порог, сверяет `test:millwork`.
 */
const SINGLE_LEAF_MAX_MM = 600;

/** Модули ряда, доходящие до конца стены: у владельца угла это слепые модули. */
function cornerEndModules(block) {
  return (block?.modules ?? []).filter(
    (m) => (m.row === 'base' || m.row === 'upper') && !m.appliance && m.offsetMm + m.widthMm === block.lengthMm,
  );
}

/** Подвал числами: красная полоса, суммы, «Дальше», кнопки пересборки и их стены. */
async function lockState(page) {
  return {
    text: await footerText(page),
    totals: await page.locator('[data-estimate-total]').count(),
    refused: await page.locator('[data-composition-refused]').count(),
    nextDisabled: await page.locator('[data-next-button]').isDisabled(),
    rebuild: await page
      .locator('[data-rebuild-wall-id]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-rebuild-wall-id'))),
  };
}

/** Красная полоса называет стену, каждую створку шире предела, предел и превышение. */
function namesLeaves(text, label, units) {
  return (
    units.length > 0 &&
    text.includes(`${label}:`) &&
    text.includes(`${SINGLE_LEAF_MAX_MM} мм`) &&
    /Пересоберите/.test(text) &&
    units.every((m) => text.includes(`${m.widthMm} мм`) && text.includes(`на ${m.widthMm - SINGLE_LEAF_MAX_MM} мм`))
  );
}

/** «Результат» → «Детализировка»: заперта ли выгрузка для раскроя и почему. */
async function exportState(page) {
  await toStep(page, 'Результат');
  const tab = page.getByRole('button', { name: 'Детализировка', exact: true }).filter({ visible: true });
  if ((await tab.count()) !== 1) return { found: false, disabled: null, reason: `кнопок «Детализировка» ${await tab.count()}` };
  await tab.click();
  await sleep(1200);
  const button = page.getByRole('button', { name: 'Выгрузить для раскроя', exact: true }).filter({ visible: true });
  const count = await button.count();
  if (count !== 1) return { found: false, disabled: null, reason: `кнопок «Выгрузить для раскроя» ${count}` };
  const lock = page.locator('[data-export-lock]').filter({ visible: true });
  return {
    found: true,
    disabled: await button.isDisabled(),
    reason: (await lock.count()) > 0 ? (await lock.first().innerText()).replace(/\s+/g, ' ') : '',
  };
}
const exportWords = (state) =>
  state.found ? `кнопка ${state.disabled ? 'заперта' : 'открыта'} · ${state.reason || 'причины нет'}` : `НУЛЕВОЙ СЕЛЕКТОР: ${state.reason}`;

/** Смена формы на шаге «Размеры». */
async function chooseShape(page, kind) {
  await toStep(page, 'Размеры');
  const button = page.locator(`[data-shape-kind="${kind}"]`);
  if ((await button.count()) !== 1) return false;
  await button.click();
  await sleep(2500);
  return (await button.getAttribute('aria-pressed')) === 'true';
}

/** Нажатие кнопки пересборки стены `wallId` в красной полосе. */
async function rebuildWall(page, wallId) {
  const button = page.locator(`[data-rebuild-wall-id="${wallId}"]`);
  if ((await button.count()) !== 1) return false;
  await button.click();
  await sleep(1800);
  return true;
}

/* ─────────────────────────  B3: П, «ряд здесь?» — стена Б теряет угол  ───────────────────────── */

async function scenarioB3(browser) {
  console.log('\n── B3. П: правки А и Б → «ряд здесь?» на стене 4 → w2 теряет угол w2–w3: створки шире предела названы (P0-3b)');
  const page = await measureShape(browser, [3600, 3000], 'u_shape');
  await toStep(page, 'Раскладка');
  const start = await rows(page);
  const editA = await editOn(page, start, 0);
  const editB = await editOn(page, await rows(page), 1);
  const edited = await rows(page);
  check(
    'правки стен А (w1) и Б (w2) применились',
    carries(blockOfWall(edited, 'w1'), editA) && carries(blockOfWall(edited, 'w2'), editB),
    `${editWords(editA)} · ${editWords(editB)}`,
  );
  const wide = cornerEndModules(blockOfWall(edited, 'w2')).filter((m) => m.widthMm > SINGLE_LEAF_MAX_MM);
  check(
    'у угла w2–w3 у стены w2 слепые модули шире одной створки',
    wide.length > 0,
    wide.map((m) => `${m.id} ${m.widthMm} мм`).join(' · ') || 'НУЛЕВОЙ СЕЛЕКТОР: у конца стены w2 нет модулей шире предела',
  );
  const cornerB = await cornerAt(page, 0);

  const moved = await runWallHere(page, 4);
  check('ряд перенесён на стену 4', moved, moved ? 'ряд здесь — стена 4' : 'кнопки «ряд здесь?» у стены 4 нет');
  const cornerAfter = await cornerAt(page, 1);
  check('угол w1–w2 (теперь второй) сохранил свой выбор', cornerAfter === cornerB, `был ${cornerB ?? 'НЕТ'} · стал ${cornerAfter ?? 'НЕТ'}`);
  await toStep(page, 'Раскладка');
  const shifted = await rows(page);
  check('стены композиции — w4, w1, w2: w2 последняя и угла у своего конца не имеет', wallIdsOf(shifted).join(',') === 'w4,w1,w2', wallIdsOf(shifted).join(', ') || 'НУЛЕВОЙ СЕЛЕКТОР: стен нет');
  same('модули w2 те же, правка не изменена молча', blockOfWall(edited, 'w2'), blockOfWall(shifted, 'w2'));
  const state = await lockState(page);
  check('красная полоса называет стену В, створки, предел и превышение в мм', namesLeaves(state.text, 'Стена В', wide), `подвал: ${state.text.slice(0, 480)}`);
  check('цены нет, «Дальше» заперто', state.totals === 0 && state.refused === 1 && state.nextDisabled, `сумм ${state.totals} · «Дальше» ${state.nextDisabled ? 'заперто' : 'ОТКРЫТО'}`);
  check('кнопка пересборки — физической стены w2', state.rebuild.length === 1 && state.rebuild[0] === 'w2', `кнопки: ${state.rebuild.join(', ') || 'НЕТ'}`);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/B3-U-invalid-leaf.png` });
  const locked = await exportState(page);
  check('выгрузка для раскроя заперта, причина названа', locked.found && locked.disabled === true && locked.reason.length > 0, exportWords(locked));
  await page.screenshot({ path: `${OUT}/B3-U-export-locked.png` });

  await toStep(page, 'Раскладка');
  const rebuilt = (await rebuildWall(page, 'w2')) ? await rows(page) : null;
  const after = await lockState(page);
  check('пересборка стены w2: конфликта нет, цена на месте', Boolean(rebuilt) && !/Пересоберите/.test(after.text) && after.totals === 1, rebuilt ? after.text.slice(0, 200) : 'кнопки пересборки w2 нет');
  same('стена w4 та же после пересборки', blockOfWall(shifted, 'w4'), blockOfWall(rebuilt ?? [], 'w4'));
  same('стена w1 та же после пересборки', blockOfWall(shifted, 'w1'), blockOfWall(rebuilt ?? [], 'w1'));
  check('стена w2 собрана заново для своей роли', Boolean(rebuilt) && sig(blockOfWall(rebuilt, 'w2')) !== sig(blockOfWall(shifted, 'w2')), rebuilt ? sig(blockOfWall(rebuilt, 'w2')) : 'СТЕНЫ НЕТ');
  const open = await exportState(page);
  check('после пересборки выгрузка для раскроя открыта', open.found && open.disabled === false && open.reason === '', exportWords(open));

  const back = await runWallHere(page, 1);
  await toStep(page, 'Раскладка');
  const restored = await rows(page);
  check('ряд вернулся на стену 1: правка стены А (w1) на месте', back && carries(blockOfWall(restored, 'w1'), editA), editWords(editA));
  same('стена w3 та же, что в начале', blockOfWall(start, 'w3'), blockOfWall(restored, 'w3'));
  await page.close();
}

/* ─────────────────────────  B4: Г — стена Б теряет угол формой; «ряд здесь?» в Г  ───────────────────────── */

async function scenarioB4(browser) {
  console.log('\n── B4. Г: правки А и Б в П → «Угловая» → w2 теряет угол w2–w3; «ряд здесь?» в Г ложной тревоги не даёт (P0-3b)');
  const page = await measureShape(browser, [3600, 3000], 'u_shape');
  await toStep(page, 'Раскладка');
  const start = await rows(page);
  const editA = await editOn(page, start, 0);
  const editB = await editOn(page, await rows(page), 1);
  const edited = await rows(page);
  check(
    'правки стен А (w1) и Б (w2) применились',
    carries(blockOfWall(edited, 'w1'), editA) && carries(blockOfWall(edited, 'w2'), editB),
    `${editWords(editA)} · ${editWords(editB)}`,
  );
  const wide = cornerEndModules(blockOfWall(edited, 'w2')).filter((m) => m.widthMm > SINGLE_LEAF_MAX_MM);
  check('у угла w2–w3 у стены w2 слепые модули шире одной створки', wide.length > 0, wide.map((m) => `${m.id} ${m.widthMm} мм`).join(' · ') || 'НУЛЕВОЙ СЕЛЕКТОР');

  const toL = await chooseShape(page, 'corner_l');
  await toStep(page, 'Раскладка');
  const asL = await rows(page);
  check('форма «Угловая»: стены w1, w2', toL && wallIdsOf(asL).join(',') === 'w1,w2', wallIdsOf(asL).join(', ') || 'НУЛЕВОЙ СЕЛЕКТОР: стен нет');
  same('Г: правка стены w2 не изменена молча', blockOfWall(edited, 'w2'), blockOfWall(asL, 'w2'));
  same('Г: стена w1 с правкой та же', blockOfWall(edited, 'w1'), blockOfWall(asL, 'w1'));
  const state = await lockState(page);
  check('Г: красная полоса называет стену Б, створки, предел и превышение в мм', namesLeaves(state.text, 'Стена Б', wide), `подвал: ${state.text.slice(0, 480)}`);
  /*
   * Прежнее поведение (P0, не P0-3b): в Г варочная по правилу раздачи
   * уходит на стену А, а стена А правлена — прибор в правленый ряд сам
   * не встаёт, и это вторая блокирующая строка. Расхождение со стеной
   * идёт в канале первым, поэтому кнопка — у стены w2.
   */
  check('Г: варочная, ушедшая на правленую стену А, названа второй строкой (P0)', /Варочная панель/.test(state.text), state.text.slice(0, 480));
  check('Г: цены нет, «Дальше» заперто, пересборка — w2', state.totals === 0 && state.nextDisabled && state.rebuild.join(',') === 'w2', `сумм ${state.totals} · «Дальше» ${state.nextDisabled ? 'заперто' : 'ОТКРЫТО'} · кнопки ${state.rebuild.join(', ') || 'НЕТ'}`);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/B4-L-invalid-leaf.png` });

  /* «Ряд здесь?» в Г: правка соседа встаёт только соседом-стыкующимся, правка А — только на А. */
  const moved = await runWallHere(page, 4);
  await toStep(page, 'Раскладка');
  const shifted = await rows(page);
  const calm = await lockState(page);
  check(
    'Г, «ряд здесь?» на стене 4: стены w4, w1 — ложной тревоги нет, цена на экране, «Дальше» открыто',
    moved && wallIdsOf(shifted).join(',') === 'w4,w1' && !/Пересоберите/.test(calm.text) && calm.totals === 1 && !calm.nextDisabled,
    `стены ${wallIdsOf(shifted).join(', ')} · сумм ${calm.totals} · «Дальше» ${calm.nextDisabled ? 'ЗАПЕРТО' : 'открыто'} · ${calm.text.slice(0, 160)}`,
  );
  const soft = await softText(page);
  check('… а сохранённые правки w1 и w2 названы словами', /Стена 1 замера/.test(soft) && /Стена 2 замера/.test(soft), soft.slice(0, 300) || 'СТРОКИ НЕТ');

  const back = await runWallHere(page, 1);
  await toStep(page, 'Раскладка');
  const again = await lockState(page);
  check('обратно на стену 1: конфликт стены Б назван снова — правка не пропала', back && namesLeaves(again.text, 'Стена Б', wide), again.text.slice(0, 240));
  const rebuilt = (await rebuildWall(page, 'w2')) ? await rows(page) : null;
  const fine = await lockState(page);
  check(
    'пересборка стены w2: строки о створке нет, стена Б собрана заново (строка о варочной на стене А — прежняя, P0)',
    Boolean(rebuilt) && !/превышает допустимую ширину/.test(fine.text) && !/Стена Б:/.test(fine.text) &&
      sig(blockOfWall(rebuilt, 'w2')) !== sig(blockOfWall(asL, 'w2')),
    rebuilt ? fine.text.slice(0, 240) : 'кнопки пересборки w2 нет',
  );
  same('стена w1 с правкой та же после пересборки w2', blockOfWall(asL, 'w1'), blockOfWall(rebuilt ?? [], 'w1'));
  await page.close();
}

/* ─────────────────────────  B5: прямая — стена А теряет угол  ───────────────────────── */

async function scenarioB5(browser) {
  console.log('\n── B5. Прямая: правка стены А в П → «Прямая» → w1 теряет угол w1–w2: створки названы (P0-3b)');
  const page = await measureShape(browser, [3600, 3000], 'u_shape');
  await toStep(page, 'Раскладка');
  const start = await rows(page);
  const editA = await editOn(page, start, 0);
  const edited = await rows(page);
  check('правка стены А (w1) применилась', carries(wallOf(edited, 0), editA), editWords(editA));
  const wide = cornerEndModules(wallOf(edited, 0)).filter((m) => m.widthMm > SINGLE_LEAF_MAX_MM);
  check('у угла w1–w2 у стены w1 слепые модули шире одной створки', wide.length > 0, wide.map((m) => `${m.id} ${m.widthMm} мм`).join(' · ') || 'НУЛЕВОЙ СЕЛЕКТОР');

  const toLinear = await chooseShape(page, 'linear');
  await toStep(page, 'Раскладка');
  const asLinear = await rows(page);
  check('форма «Прямая»: одна стена, правка на месте', toLinear && asLinear.length === 1 && carries(wallOf(asLinear, 0), editA), `стен ${asLinear.length} · ${editWords(editA)}`);
  const state = await lockState(page);
  check('прямая: красная полоса называет стену А, створки, предел и превышение в мм', namesLeaves(state.text, 'Стена А', wide), `подвал: ${state.text.slice(0, 480)}`);
  check('прямая: цены нет, «Дальше» заперто, пересборка — w1', state.totals === 0 && state.nextDisabled && state.rebuild.join(',') === 'w1', `сумм ${state.totals} · «Дальше» ${state.nextDisabled ? 'заперто' : 'ОТКРЫТО'} · кнопки ${state.rebuild.join(', ') || 'НЕТ'}`);
  const locked = await exportState(page);
  check('прямая: выгрузка для раскроя заперта', locked.found && locked.disabled === true, exportWords(locked));
  await toStep(page, 'Раскладка');
  const rebuilt = (await rebuildWall(page, 'w1')) ? await rows(page) : null;
  const fine = await lockState(page);
  check('пересборка стены w1: конфликта нет, цена на месте', Boolean(rebuilt) && !/Пересоберите/.test(fine.text) && fine.totals === 1, rebuilt ? fine.text.slice(0, 200) : 'кнопки пересборки w1 нет');
  await page.close();
}

/* ─────────────────────────  B6: допустимая — створка без угла в пределе  ───────────────────────── */

async function scenarioB6(browser) {
  console.log('\n── B6. П 3600 × 2436: у угла w2–w3 верх пустой, глухая часть — свой корпус → «ряд здесь?» на стене 4 → ложной тревоги нет (P0-3b)');
  const page = await measureShape(browser, [3600, 2436], 'u_shape');
  const refused = await chooseCorner(page, 1, 'upper:empty');
  const chosen = await cornerAt(page, 1);
  check('у угла w2–w3 верх пустой', !refused && chosen === 'blind/empty', refused ?? chosen ?? 'УГЛА НЕТ');
  await toStep(page, 'Раскладка');
  const start = await rows(page);
  const end = cornerEndModules(blockOfWall(start, 'w2'));
  check(
    'у конца стены w2 — один нижний глухой корпус не шире одной створки',
    end.length === 1 && end[0].row === 'base' && end[0].widthMm <= SINGLE_LEAF_MAX_MM,
    end.map((m) => `${m.id} ${m.widthMm} мм`).join(' · ') || 'НУЛЕВОЙ СЕЛЕКТОР: у конца стены w2 модулей нет',
  );
  const editB = await editOn(page, start, 1);
  const edited = await rows(page);
  check('правка стены Б (w2) применилась', carries(blockOfWall(edited, 'w2'), editB), editWords(editB));

  const moved = await runWallHere(page, 4);
  await toStep(page, 'Раскладка');
  const shifted = await rows(page);
  check('ряд на стене 4: стены w4, w1, w2', moved && wallIdsOf(shifted).join(',') === 'w4,w1,w2', wallIdsOf(shifted).join(', ') || 'НУЛЕВОЙ СЕЛЕКТОР: стен нет');
  same('модули w2 те же, правка на месте', blockOfWall(edited, 'w2'), blockOfWall(shifted, 'w2'));
  const state = await lockState(page);
  check(
    'ложной тревоги нет: красной полосы нет, цена на экране, «Дальше» открыто, пересобирать нечего',
    !/Пересоберите/.test(state.text) && state.totals === 1 && !state.nextDisabled && state.rebuild.length === 0,
    `сумм ${state.totals} · «Дальше» ${state.nextDisabled ? 'ЗАПЕРТО' : 'открыто'} · кнопки ${state.rebuild.join(', ') || 'нет'} · ${state.text.slice(0, 160)}`,
  );
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/B6-U-valid.png` });
  const open = await exportState(page);
  check('выгрузка для раскроя открыта', open.found && open.disabled === false && open.reason === '', exportWords(open));
  await page.close();
}

/* ─────────────────────────  LG: старый объект в базе  ───────────────────────── */

function loadEnv() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

/** Стены замера по кругу: формат `Survey` и формат `Measurement` объекта. */
function legacyRoom(stamp) {
  const lengths = [3600, 3000, 3600, 3000];
  const known = (value) => ({ state: 'measured', value });
  return {
    survey: {
      ceilingHeightMm: known(2700),
      walls: lengths.map((lengthMm, i) => ({
        id: `w${i + 1}`,
        lengthMm: known(lengthMm),
        turn: 'right',
        turnDeg: 90,
        openings: [],
        isRunWall: i === 0,
      })),
      comms: [],
      photos: [],
      clientNotes: '',
      steps: { ceiling: 'done', walls: 'done', openings: 'todo', comms: 'todo', photos: 'todo' },
      measuredBy: 'проверка',
      measuredAt: '2026-10-08',
    },
    measurement: {
      id: `m-${stamp}`,
      ceilingHeightMm: 2700,
      walls: lengths.map((lengthMm, i) => ({ id: `w${i + 1}`, lengthMm, angleDeg: 90, openings: [] })),
      comms: [],
      photos: [],
      measuredBy: 'проверка',
      measuredAt: '2026-10-08',
      notes: '',
    },
  };
}

async function scenarioLG(browser) {
  console.log('\n── LG. Старый объект: холодильник закреплён номером стены, углы массивом, решение выбрано');
  loadEnv();
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !ANON || !SERVICE || /your-project|example/.test(URL)) {
    check('старый объект: ключи Supabase есть', false, 'НЕ ПРОВЕРЕНО — нет ключей Supabase в .env.local');
    return;
  }
  const service = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = Date.now();
  const email = `identity-${stamp}@example.test`;
  const password = `Pw-${stamp}-identity!`;
  const made = { user: null, org: null, project: null };
  try {
    const { data: created, error: userError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (userError) throw new Error(`createUser: ${userError.message}`);
    made.user = created.user.id;
    const { data: org, error: orgError } = await service
      .from('orgs')
      .insert({ slug: `identity-${stamp}`, name: `Проверка идентичности ${stamp}` })
      .select('id')
      .single();
    if (orgError) throw new Error(`insert org: ${orgError.message}`);
    made.org = org.id;
    const { error: memberError } = await service.from('org_members').insert({ org_id: org.id, user_id: created.user.id, role: 'owner' });
    if (memberError) throw new Error(`insert member: ${memberError.message}`);

    const jar = [];
    const ssr = createServerClient(URL, ANON, {
      cookies: {
        getAll: () => jar.map(({ name, value }) => ({ name, value })),
        setAll: (list) => {
          for (const cookie of list) {
            const at = jar.findIndex((c) => c.name === cookie.name);
            if (at >= 0) jar.splice(at, 1);
            if (cookie.value) jar.push(cookie);
          }
        },
      },
    });
    const { error: signError } = await ssr.auth.signInWithPassword({ email, password });
    if (signError) throw new Error(`signIn: ${signError.message}`);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies(
      jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' })),
    );
    const page = await context.newPage();
    page.on('pageerror', (e) => {
      failed += 1;
      console.log('  [ошибка страницы]', e.message.slice(0, 160));
    });
    const seeded = await page.request.post(`${BASE}/api/catalog/seed-rates`, { data: { orgId: org.id } });
    if (!seeded.ok()) throw new Error(`типовой прайс не заведён: ${seeded.status()}`);

    const room = legacyRoom(stamp);
    /*
     * Состояние старого формата: закрепление НОМЕРОМ стены обхода (0 — стена
     * А, то есть w1 на момент записи), выбор углов массивом без меток стен,
     * выбранное готовое решение.
     */
    const { data: project, error: projectError } = await service
      .from('projects')
      .insert({
        org_id: org.id,
        address: 'Проверка идентичности стен',
        zone: 'Кухня',
        client_name: 'Проверка',
        measurements: room.measurement,
        millwork: {
          templateId: 'linear-column',
          shape: 'corner_l',
          corners: [{ lower: 'l_shape', upper: 'empty' }],
          survey: room.survey,
          requirements: {
            zone: 'kitchen',
            appliances: ['fridge', 'oven', 'sink600', 'dishwasher45', 'hob', 'hood'],
            tallSide: 'left',
            options: {
              hasUpper: true,
              upperToCeiling: false,
              hardwareClass: 'standard',
              countertop: 'ldsp',
              hasCornice: false,
              integratedHandles: false,
            },
            applianceWalls: { fridge: 0 },
          },
        },
        status: 'in_progress',
      })
      .select('id')
      .single();
    if (projectError) throw new Error(`insert project: ${projectError.message}`);
    made.project = project.id;

    await page.goto(`${BASE}/project/${project.id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await ready(page);
    const corner0 = await cornerAt(page, 0);
    check('открылся тем углом, каким сохранён: w1–w2 — Г-модуль, верх пустой', corner0 === 'l_shape/empty', corner0 ?? 'УГЛА НЕТ');
    await toStep(page, 'Раскладка');
    const opened = await rows(page);
    check('стены объекта — w1, w2', wallIdsOf(opened).join(',') === 'w1,w2', wallIdsOf(opened).join(', ') || 'НУЛЕВОЙ СЕЛЕКТОР: стен нет');
    check(
      'холодильник на той стене, где его закрепили: w1, без переназначения',
      applianceWall(opened, 'fridge') === 'w1' && countOf(opened, 'fridge') === 1,
      `стоит на ${applianceWall(opened, 'fridge')} · закреплён номером 0 = w1`,
    );
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/LG-legacy-open.png` });

    const moved = await runWallHere(page, 4);
    check('ряд перенесён на стену 4', moved, moved ? 'ряд здесь — стена 4' : 'кнопки «ряд здесь?» у стены 4 нет');
    const shiftedCorner = await cornerAt(page, 0);
    check('угол w4–w1 — свой (по умолчанию), Г-модуль угла w1–w2 к нему не переехал', shiftedCorner === 'blind/blind', shiftedCorner ?? 'УГЛА НЕТ');
    await toStep(page, 'Раскладка');
    const shifted = await rows(page);
    check(
      'после переноса ряда холодильник на физической стене w1 (теперь стена Б)',
      wallIdsOf(shifted).join(',') === 'w4,w1' && applianceWall(shifted, 'fridge') === 'w1',
      `стены ${wallIdsOf(shifted).join(', ')} · холодильник на ${applianceWall(shifted, 'fridge')}`,
    );
    const back = await runWallHere(page, 1);
    const backCorner = await cornerAt(page, 0);
    await toStep(page, 'Раскладка');
    const restored = await rows(page);
    check(
      'обратно: угол w1–w2 снова Г-модуль, холодильник на w1',
      back && backCorner === 'l_shape/empty' && applianceWall(restored, 'fridge') === 'w1',
      `угол ${backCorner ?? 'НЕТ'} · холодильник на ${applianceWall(restored, 'fridge')}`,
    );
    await context.close();
  } finally {
    if (made.project) await service.from('projects').delete().eq('id', made.project);
    if (made.org) await service.from('orgs').delete().eq('id', made.org);
    if (made.user) await service.auth.admin.deleteUser(made.user);
  }
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
    A1: scenarioA1,
    A2: scenarioA2,
    B1: scenarioB1,
    B2: scenarioB2,
    B3: scenarioB3,
    B4: scenarioB4,
    B5: scenarioB5,
    B6: scenarioB6,
    LG: scenarioLG,
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
