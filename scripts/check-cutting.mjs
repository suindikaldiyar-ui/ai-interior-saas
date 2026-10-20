/**
 * КАРТА РАСКРОЯ В БРАУЗЕРЕ (CUT-01) — на настоящей организации и объекте.
 *
 * Запуск (после `npm run build`): `node scripts/check-cutting.mjs`
 *   PART=flow — компьютер 1440 × 900: Studio → «Документы» → «Деталировка» →
 *     «Карта раскроя →» → листа нет (выпуск заперт словами) → выбрать лист
 *     ЛДСП и ХДФ → раскладка сама → «не подтверждено цехом» → галочка →
 *     выпуск открыт; детали деталировки = детали карты до штуки, пересечений
 *     0; масштаб кнопками и колесом, сдвиг; нажатие на деталь — карточка;
 *     «Все листы»; CSV и PDF скачиваются и сходятся с раскладкой; объект при
 *     выгрузке не меняется; «Сохранить для цеха» → перезагрузка → та же
 *     раскладка (подпись); ошибок страницы и консоли нет.
 *   PART=tablet — планшет 1024 × 768 с касанием: «Документы» → «Карта
 *     раскроя», лист и кнопки в экране, прокрутки по ширине нет, касание
 *     детали — карточка, масштаб кнопками; ошибок нет.
 * Временная организация заводится служебным ключом и удаляется; уборка
 * проверяется чтением. Рендер по чертежу (path tracing) не запускается.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = Number(process.env.PORT_CUT ?? 3286);
const BASE = `http://localhost:${PORT}`;
const OUT = '.capture-check/cutting';
const PARTS = (process.env.PART ?? 'flow,tablet').split(',').map((s) => s.trim()).filter(Boolean);
const KNOWN = ['flow', 'tablet'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
};
class Stop extends Error {}
const must = (name, ok, detail) => {
  check(name, ok, ok ? '' : detail);
  if (!ok) throw new Stop(`${name}: ${detail}`);
};

function buildId() {
  try {
    return readFileSync(resolve('.next/BUILD_ID'), 'utf8').trim();
  } catch {
    throw new Stop('нет сборки в .next — сначала npm run build');
  }
}
function freePort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, { encoding: 'utf8' });
    for (const line of out.split(/\r?\n/)) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== '0') execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    }
  } catch {
    /* порт свободен — убирать нечего */
  }
}
function loadEnv() {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

/* ─────────────────────────  объект: шкаф спальни путём экрана  ───────────────────────── */

const WALLS = [3000, 2800, 3000, 2800];
const CEILING = 2600;
const known = (value) => ({ state: 'measured', value });
const survey = () => ({
  ceilingHeightMm: known(CEILING),
  walls: WALLS.map((l, i) => ({ id: `w${i + 1}`, lengthMm: known(l), turn: 'right', turnDeg: 90, openings: [], isRunWall: i === 0 })),
  comms: [],
  photos: [],
  clientNotes: '',
  steps: { ceiling: 'done', walls: 'done', openings: 'todo', comms: 'todo', photos: 'todo' },
  measuredBy: 'CUT-01',
  measuredAt: '2026-10-20',
});
const measurement = (stamp) => ({
  id: `m-${stamp}`,
  ceilingHeightMm: CEILING,
  walls: WALLS.map((l, i) => ({ id: `w${i + 1}`, lengthMm: l, angleDeg: 90, openings: [] })),
  comms: [],
  photos: [],
  measuredBy: 'CUT-01',
  measuredAt: '2026-10-20',
  notes: '',
});
/** Шкаф спальни 900 + 1000 по две створки — тот же ряд путём экрана, что у приёмки P3D-MDF. */
function fixtureRun() {
  const out = execSync('npx tsx scripts/mdf-look-fixture.ts', {
    input: JSON.stringify({ states: { s0: { ops: [] } } }),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(out);
}

/* ─────────────────────────  экран  ───────────────────────── */

async function waitFor(page, fn, test, ms = 20_000, arg = undefined) {
  const until = Date.now() + ms;
  let value = await page.evaluate(fn, arg);
  while (!test(value) && Date.now() < until) {
    await sleep(250);
    value = await page.evaluate(fn, arg);
  }
  return value;
}
async function tool(page, key) {
  const b = page.locator(`[data-studio-rail] [data-studio-tool="${key}"]`);
  if ((await b.count()) === 0) return false;
  await b.first().click({ timeout: 15_000 });
  await sleep(400);
  return true;
}
const saved = (page) => waitFor(page, () => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? null, (v) => v === 'saved', 30_000);
async function openStudio(page, projectId) {
  await page.goto(`${BASE}/project/${projectId}/room`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('[data-studio-root]', { timeout: 60_000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-studio-rail] [data-studio-tool]');
    return Boolean(el && Object.keys(el).some((k) => k.startsWith('__reactProps')));
  }, undefined, { timeout: 60_000 });
  await sleep(800);
}
const cutting = (page) => page.evaluate(() => (window.__mwCutting ? window.__mwCutting() : null));
const mapAttr = (page, name) => page.evaluate((n) => document.querySelector('[data-cutting-map]')?.getAttribute(n) ?? null, name);

/** Независимо от продукта: пересечения, поле листа, текстура и счёт — по снимку раскладки. */
function audit(snap) {
  const problems = [];
  for (const sheet of snap.sheets) {
    for (let i = 0; i < sheet.placements.length; i += 1) {
      const a = sheet.placements[i];
      if (!(a.w > 0 && a.h > 0)) problems.push(`лист ${sheet.number}: ${a.id} без площади`);
      if (a.x < 0 || a.y < 0 || a.x + a.w > sheet.lengthMm + 1e-6 || a.y + a.h > sheet.widthMm + 1e-6) problems.push(`лист ${sheet.number}: ${a.id} за листом`);
      for (let j = i + 1; j < sheet.placements.length; j += 1) {
        const b = sheet.placements[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 1e-6 && oy > 1e-6) problems.push(`лист ${sheet.number}: ${a.id} × ${b.id}`);
      }
    }
  }
  const placed = snap.sheets.reduce((s, sheet) => s + sheet.placements.length, 0);
  const ids = snap.sheets.flatMap((sheet) => sheet.placements.map((p) => `${p.partId}#${p.id}`));
  if (new Set(ids).size !== ids.length) problems.push('деталь на листах дважды');
  const parts = snap.parts.reduce((s, p) => s + p.qty, 0);
  if (snap.pieces !== parts) problems.push(`деталей в карте ${snap.pieces} при ${parts} в деталировке`);
  return { problems, placed, parts };
}

/* ─────────────────────────  PDF и CSV по байтам  ───────────────────────── */

function pdfFacts(bytes) {
  const latin = Buffer.from(bytes).toString('latin1');
  const problems = [];
  if (!latin.startsWith('%PDF-1.4')) problems.push('нет %PDF-1.4');
  if (!latin.trimEnd().endsWith('%%EOF')) problems.push('нет %%EOF');
  const pages = (latin.match(/\/Type \/Page /g) ?? []).length;
  const count = Number((/\/Count (\d+)/.exec(latin) ?? [])[1]);
  if (count !== pages) problems.push(`/Count ${count} при ${pages} страницах`);
  const start = /startxref\n(\d+)\n%%EOF\s*$/.exec(latin);
  if (!start) problems.push('нет startxref');
  else {
    const table = latin.slice(Number(start[1]));
    const head = /^xref\n0 (\d+)\n/.exec(table);
    if (!head) problems.push('startxref не на xref');
    else {
      const rows = table.split('\n').slice(3, 2 + Number(head[1]));
      rows.forEach((row, i) => {
        const at = Number(row.slice(0, 10));
        if (!latin.startsWith(`${i + 1} 0 obj`, at)) problems.push(`xref: объект ${i + 1} не на ${at}`);
      });
    }
  }
  /* Картинки страниц: JPEG, размер из маркера SOF. */
  const sizes = [];
  const re = /\/Width (\d+) \/Height (\d+) \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode \/Length (\d+) >>\nstream\n/g;
  for (let m = re.exec(latin); m; m = re.exec(latin)) {
    const from = m.index + m[0].length;
    const jpeg = Buffer.from(bytes).subarray(from, from + Number(m[3]));
    let w = 0;
    let h = 0;
    for (let i = 2; i < jpeg.length - 9; ) {
      if (jpeg[i] !== 0xff) break;
      const marker = jpeg[i + 1];
      const length = jpeg.readUInt16BE(i + 2);
      if (marker === 0xc0 || marker === 0xc2) {
        h = jpeg.readUInt16BE(i + 5);
        w = jpeg.readUInt16BE(i + 7);
        break;
      }
      i += 2 + length;
    }
    const ok = jpeg[0] === 0xff && jpeg[1] === 0xd8 && jpeg[jpeg.length - 2] === 0xff && jpeg[jpeg.length - 1] === 0xd9;
    sizes.push({ dict: `${m[1]}×${m[2]}`, sof: `${w}×${h}`, ok });
  }
  return { pages, images: sizes.length, sizes, problems };
}

function csvCells(line) {
  const out = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ';') {
      out.push(cell);
      cell = '';
    } else cell += ch;
  }
  out.push(cell);
  return out;
}
const CSV_HEADER = 'PartID;ModuleID;PartName;LengthMm;WidthMm;Quantity;Material;ThicknessMm;GrainDirection;EdgeBanding;SheetNumber;PositionX;PositionY;RotationDeg';

async function download(page, click, timeout = 180_000) {
  const [file] = await Promise.all([page.waitForEvent('download', { timeout }), click()]);
  const path = await file.path();
  return { name: file.suggestedFilename(), bytes: readFileSync(path) };
}

/* ─────────────────────────  организация  ───────────────────────── */

async function withOrg(label, browser, body, { viewport, touch = false }) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const made = { users: [], orgs: [], projects: [] };
  try {
    const email = `cut-${stamp}@example.test`;
    const password = `Pw-${stamp}-cut!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    made.users.push(data.user.id);
    const { data: org, error: orgError } = await service.from('orgs').insert({ slug: `cut-${stamp}`, name: `Проверка карты раскроя ${label}` }).select('id').single();
    if (orgError) throw new Error(`insert org: ${orgError.message}`);
    made.orgs.push(org.id);
    const { error: memberError } = await service.from('org_members').insert({ org_id: org.id, user_id: data.user.id, role: 'owner' });
    if (memberError) throw new Error(`insert member: ${memberError.message}`);
    const jar = [];
    const ssr = createServerClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => jar.map(({ name, value }) => ({ name, value })),
        setAll: (list) => {
          for (const c of list) {
            const at = jar.findIndex((x) => x.name === c.name);
            if (at >= 0) jar.splice(at, 1);
            if (c.value) jar.push(c);
          }
        },
      },
    });
    const { error: signError } = await ssr.auth.signInWithPassword({ email, password });
    if (signError) throw new Error(`signIn: ${signError.message}`);
    const context = await browser.newContext({ viewport, hasTouch: touch, acceptDownloads: true });
    await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', sameSite: 'Lax' })));
    const page = await context.newPage();
    const errors = [];
    const consoleErrors = [];
    const requests = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
    });
    page.on('request', (r) => {
      if (r.url().includes('/api/')) requests.push(`${r.method()} ${r.url().replace(BASE, '')}`);
    });
    const seeded = await page.request.post(`${BASE}/api/catalog/seed-rates`, { data: { orgId: org.id } });
    if (!seeded.ok()) throw new Error(`типовой прайс не заведён: ${seeded.status()}`);
    const fx = fixtureRun();
    const { data: project, error: projectError } = await service
      .from('projects')
      .insert({
        org_id: org.id,
        client_name: 'Проверка',
        status: 'in_progress',
        address: `Карта раскроя ${label}`,
        zone: 'Спальня',
        measurements: measurement(stamp),
        millwork: { survey: survey(), requirements: fx.requirements, runs: { optimal: fx.runs.s0 }, selectedVariant: 'optimal' },
      })
      .select('id')
      .single();
    if (projectError) throw new Error(`insert project: ${projectError.message}`);
    made.projects.push(project.id);
    await body({ service, org, page, errors, consoleErrors, requests, projectId: project.id });
  } finally {
    for (const id of made.projects) await service.from('projects').delete().eq('id', id);
    for (const id of made.orgs) {
      await service.from('catalog_items').delete().eq('org_id', id);
      await service.from('catalog_categories').delete().eq('org_id', id);
      await service.from('orgs').delete().eq('id', id);
    }
    for (const id of made.users) await service.auth.admin.deleteUser(id);
    const left = [];
    for (const id of made.orgs) {
      if (((await service.from('orgs').select('id').eq('id', id)).data ?? []).length) left.push(`организация ${id}`);
      if (((await service.from('catalog_items').select('id').eq('org_id', id)).data ?? []).length) left.push(`позиции ${id}`);
    }
    for (const id of made.projects) if (((await service.from('projects').select('id').eq('id', id)).data ?? []).length) left.push(`объект ${id}`);
    check(`${label}: уборка временной организации проверена чтением`, left.length === 0, left.join(', ') || 'удалено');
  }
}

const projectRow = async (service, id) => (await service.from('projects').select('millwork, updated_at').eq('id', id).single()).data;

/* ═════════════════════════  FLOW (компьютер)  ═════════════════════════ */

async function partFlow(browser) {
  console.log('\n── FLOW (1440 × 900): Studio → Деталировка → Карта раскроя → лист → раскладка → PDF и CSV → сохранить → перезагрузить');
  await withOrg(
    'FLOW',
    browser,
    async ({ service, org, page, errors, consoleErrors, requests, projectId }) => {
      await openStudio(page, projectId);
      await saved(page);

      /* Деталировка: сколько деталей в таблице — штуками. */
      must('FLOW инструмент «Документы»', await tool(page, 'documents'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="documents"]');
      await page.locator('[data-studio-doc="panels"]').first().click();
      await page.waitForSelector('[data-panel-row]', { timeout: 30_000 });
      const detailQty = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-panel-row]')).reduce((s, tr) => s + Number(tr.getAttribute('data-part-qty') ?? 0), 0),
      );
      const toMap = page.locator('[data-open-cutting]');
      must('FLOW в деталировке кнопка «Карта раскроя →»', (await toMap.count()) === 1, `НУЛЕВОЙ СЕЛЕКТОР: [data-open-cutting] ×${await toMap.count()}`);
      await toMap.first().click();
      await page.waitForSelector('[data-cutting-map]', { timeout: 60_000 });
      await sleep(500);
      mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: `${OUT}/flow-1-no-sheet.png`, timeout: 120_000 });
      const before = await cutting(page);
      must('FLOW карта отдаёт снимок раскладки', Boolean(before), 'НУЛЕВОЙ СЕЛЕКТОР: window.__mwCutting');
      const noSheet = before.groups.filter((g) => !g.format);
      check(
        'FLOW.1 «Деталировка → Карта раскроя»: детали карты = детали таблицы до штуки; листа у цеха нет — группы не разложены и выпуск заперт словами «Лист не выбран»',
        before.pieces === detailQty &&
          detailQty > 0 &&
          noSheet.length === before.groups.length &&
          before.sheets.length === 0 &&
          before.release.ok === false &&
          before.release.reasons.some((r) => r.startsWith('Лист не выбран')),
        `в таблице ${detailQty} · в карте ${before.pieces} · групп без листа ${noSheet.length} из ${before.groups.length} · «${(before.release.reasons[0] ?? 'ПРИЧИНЫ НЕТ').slice(0, 120)}»`,
      );

      /* Выбрать лист ЛДСП, затем ХДФ. */
      const pickFormat = async (key, format) => {
        await page.locator(`[data-cut-group-button="${key}"]`).first().click();
        await sleep(300);
        const chip = page.locator(`[data-sheet-picker="${key}"] [data-sheet-format="${format}"]`);
        must(`FLOW выбор листа ${format} для ${key}`, (await chip.count()) === 1, `НУЛЕВОЙ СЕЛЕКТОР: [data-sheet-picker="${key}"] [data-sheet-format="${format}"]`);
        await chip.first().click();
        await sleep(400);
      };
      const ldspKey = before.groups.find((g) => g.key.startsWith('ldsp:'))?.key;
      const hdfKey = before.groups.find((g) => g.key.startsWith('hdf:'))?.key;
      must('FLOW в карте группы ЛДСП и ХДФ', Boolean(ldspKey && hdfKey), `группы: ${before.groups.map((g) => g.key).join(', ')}`);
      await pickFormat(ldspKey, '2800x2070');
      const afterLdsp = await waitFor(page, () => (window.__mwCutting ? window.__mwCutting() : null), (s) => Boolean(s && s.sheets.length > 0), 20_000);
      await pickFormat(hdfKey, '2800x2070');
      const unconfirmed = await waitFor(page, () => (window.__mwCutting ? window.__mwCutting() : null), (s) => Boolean(s && s.groups.every((g) => g.format)), 20_000);
      await page.screenshot({ path: `${OUT}/flow-2-unconfirmed.png`, timeout: 120_000 });
      check(
        'FLOW.2 выбрал лист — раскладка сама: ЛДСП и ХДФ на листах; выпуск по-прежнему заперт: пропил и обрезка «не подтверждено цехом»',
        afterLdsp.sheets.length > 0 &&
          unconfirmed.groups.every((g) => g.format && g.sheets > 0) &&
          unconfirmed.placed === unconfirmed.pieces &&
          unconfirmed.release.ok === false &&
          unconfirmed.release.reasons.length === 1 &&
          unconfirmed.release.reasons[0].includes('не подтверждено цехом'),
        `листов ${unconfirmed.sheets.length} · разложено ${unconfirmed.placed}/${unconfirmed.pieces} · «${(unconfirmed.release.reasons[0] ?? '').slice(0, 110)}»`,
      );
      await page.locator('[data-cut-confirmed]').first().check();
      const open = await waitFor(page, () => (window.__mwCutting ? window.__mwCutting() : null), (s) => Boolean(s && s.release.ok), 20_000);
      const verdict = audit(open);
      const shownSheet = await page.evaluate(() => {
        const svg = document.querySelector('[data-sheet-view]');
        return svg ? { number: Number(svg.getAttribute('data-sheet-view')), drawn: svg.querySelectorAll('[data-cut-piece]').length } : null;
      });
      const expectedOnSheet = open.sheets.find((s) => s.number === shownSheet?.number)?.placements.length ?? -1;
      await page.screenshot({ path: `${OUT}/flow-3-sheet.png`, timeout: 120_000 });
      check(
        'FLOW.3 «цех подтвердил» — выпуск открыт; деталь на листе — ровно одна, пересечений 0, за лист не выходит; на экране нарисовано столько деталей листа, сколько в раскладке; ошибок проверки 0',
        open.release.ok && verdict.problems.length === 0 && open.errors.length === 0 && shownSheet !== null && shownSheet.drawn === expectedOnSheet && expectedOnSheet > 0,
        `${verdict.problems.slice(0, 3).join(' | ') || `листов ${open.sheets.length}, деталей ${verdict.placed}/${verdict.parts}`} · лист ${shownSheet?.number}: нарисовано ${shownSheet?.drawn} из ${expectedOnSheet} · подпись ${open.signature}`,
      );

      /* Масштаб, сдвиг, выбор детали. */
      const zoom = () => page.evaluate(() => Number(document.querySelector('[data-sheet-view]')?.getAttribute('data-zoom') ?? 'NaN'));
      const viewBox = () => page.evaluate(() => document.querySelector('[data-sheet-view]')?.getAttribute('viewBox') ?? '');
      const z0 = await zoom();
      await page.locator('[data-zoom-button="in"]').first().click();
      await page.locator('[data-zoom-button="in"]').first().click();
      const z1 = await zoom();
      /* Нажатия на кнопки под листом прокручивают область: лист возвращается в экран перед жестом. */
      await page.locator('[data-sheet-view]').first().scrollIntoViewIfNeeded();
      const box = await page.locator('[data-sheet-view]').first().boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -300);
      await sleep(200);
      const z2 = await zoom();
      const vb0 = await viewBox();
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 6 });
      await page.mouse.up();
      const vb1 = await viewBox();
      await page.locator('[data-zoom-button="fit"]').first().click();
      const z3 = await zoom();
      check(
        'FLOW.4 масштаб и сдвиг: «+» дважды и колесо — крупнее, протаскивание двигает лист, «Вписать» — целиком',
        Math.abs(z0 - 1) < 0.01 && z1 > z0 && z2 > z1 && vb1 !== vb0 && Math.abs(z3 - 1) < 0.01,
        `масштаб ${z0} → ${z1} → колесо ${z2} → вписать ${z3} · viewBox ${vb0 === vb1 ? 'НЕ сдвинулся' : 'сдвинулся'}`,
      );
      const piece = page.locator('[data-sheet-view] [data-cut-piece]').first();
      const pieceId = await piece.getAttribute('data-cut-piece');
      await page.locator('[data-sheet-view]').first().scrollIntoViewIfNeeded();
      const pieceBox = await piece.boundingBox();
      await page.mouse.click(pieceBox.x + pieceBox.width / 2, pieceBox.y + pieceBox.height / 2);
      await sleep(300);
      const card = await page.evaluate(() => {
        const el = document.querySelector('[data-cut-part-card]');
        return el ? { id: el.getAttribute('data-cut-part-card'), text: el.textContent ?? '', edges: el.querySelector('[data-part-edges]')?.textContent ?? '' } : null;
      });
      await page.screenshot({ path: `${OUT}/flow-4-part.png`, timeout: 120_000 });
      check(
        'FLOW.5 нажатие на деталь — её карточка: номер, размер, лист, X и Y, поворот, кромка по сторонам с длиной',
        card?.id === pieceId && /Лист \d+ · X/.test(card?.text ?? '') && /Кромка:/.test(card?.edges ?? ''),
        card ? `${card.id}: ${card.text.slice(0, 160)}` : 'НУЛЕВОЙ СЕЛЕКТОР: [data-cut-part-card]',
      );

      /* Все листы — у группы ЛДСП, где их несколько. */
      await page.locator(`[data-cut-group-button="${ldspKey}"]`).first().click();
      await sleep(300);
      await page.locator('[data-sheet-tab="all"]').first().click();
      await sleep(400);
      const thumbs = await page.locator('[data-sheet-thumb]').count();
      const groupSheets = open.groups.find((g) => g.key === ldspKey)?.sheets ?? -1;
      await page.screenshot({ path: `${OUT}/flow-5-all-sheets.png`, timeout: 120_000 });
      check('FLOW.6 «Все листы» — миниатюр столько, сколько листов группы', thumbs === groupSheets && thumbs > 0, `миниатюр ${thumbs} · листов ЛДСП ${groupSheets}`);

      /* Выгрузки не трогают объект. */
      const rowBefore = await projectRow(service, projectId);
      const requestsBefore = requests.length;
      const csv = await download(page, () => page.locator('[data-cut-csv]').first().click());
      const text = new TextDecoder('windows-1251').decode(csv.bytes);
      const lines = text.split('\r\n').filter(Boolean);
      const rows = lines.slice(1).map(csvCells);
      const placements = open.sheets.flatMap((s) => s.placements.map((p) => ({ ...p, sheet: s.number })));
      const byId = new Map(placements.map((p) => [p.id, p]));
      const off = rows.filter((cells) => {
        const p = byId.get(cells[0]);
        return !p || cells[10] !== String(p.sheet) || cells[11] !== String(p.x) || cells[12] !== String(p.y) || cells[13] !== String(p.rotation);
      });
      check(
        'FLOW.7 CSV: заголовок из 14 колонок задания, строка на деталь — столько, сколько на листах; номер, лист, X, Y и поворот у каждой — как в раскладке; кодировка windows-1251',
        lines[0] === CSV_HEADER && rows.length === placements.length && off.length === 0 && /карта раскроя/.test(csv.name),
        `${csv.name} · строк ${rows.length} при ${placements.length} · расхождений ${off.length}${off[0] ? ` (${off[0].slice(0, 4).join(';')})` : ''}`,
      );
      const t0 = Date.now();
      const pdf = await download(page, () => page.locator('[data-cut-pdf]').first().click());
      const pdfMs = Date.now() - t0;
      const facts = pdfFacts(pdf.bytes);
      const tablePages = Math.ceil(placements.length / 44);
      const wantPages = 1 + open.sheets.length + tablePages;
      check(
        'FLOW.8 PDF: файл PDF, страниц — сводка, по листу на страницу и таблица деталей; на каждой странице картинка JPEG 2105 × 1488 (A4 при 180 dpi); xref указывает на объекты',
        facts.problems.length === 0 && facts.pages === wantPages && facts.images === wantPages && facts.sizes.every((s) => s.ok && s.dict === '2105×1488' && s.sof === '2105×1488'),
        `${pdf.name} · ${Math.round(pdf.bytes.length / 1024)} кБ за ${pdfMs} мс · страниц ${facts.pages} при ${wantPages} · ${facts.problems.slice(0, 2).join('; ')}`,
      );
      const rowAfter = await projectRow(service, projectId);
      const exportRequests = requests.slice(requestsBefore);
      check(
        'FLOW.9 выгрузка CSV и PDF объект не меняет: состояние и время записи те же, запросов к серверу за выгрузку 0',
        JSON.stringify(rowAfter.millwork) === JSON.stringify(rowBefore.millwork) && rowAfter.updated_at === rowBefore.updated_at && exportRequests.length === 0,
        `запросов ${exportRequests.length}${exportRequests[0] ? ` (${exportRequests[0]})` : ''} · updated_at ${rowBefore.updated_at === rowAfter.updated_at ? 'тот же' : 'ПОМЕНЯЛСЯ'}`,
      );

      /* Сохранить для цеха → перезагрузить → та же раскладка. */
      await page.locator('[data-cut-save]').first().click();
      await waitFor(page, () => document.querySelector('[data-cut-save-state]')?.getAttribute('data-cut-save-state') ?? null, (v) => v === 'saved', 20_000);
      const stored = (await service.from('orgs').select('production').eq('id', org.id).single()).data?.production?.cutting ?? null;
      await openStudio(page, projectId);
      await tool(page, 'documents');
      await page.locator('[data-studio-doc="cutting"]').first().click();
      await page.waitForSelector('[data-cutting-map]', { timeout: 60_000 });
      const again = await waitFor(page, () => (window.__mwCutting ? window.__mwCutting() : null), (s) => Boolean(s && s.sheets.length > 0), 20_000);
      check(
        'FLOW.10 «Сохранить для цеха» → в настройках организации листы ЛДСП и ХДФ и галочка цеха; после перезагрузки — та же раскладка (подпись) и выпуск открыт',
        Boolean(stored) &&
          stored.confirmed === true &&
          stored.sheets.some((s) => s.stock === ldspKey.split(':').slice(0, 2).join(':') && s.lengthMm === 2800 && s.widthMm === 2070) &&
          stored.sheets.some((s) => s.stock === hdfKey.split(':').slice(0, 2).join(':')) &&
          again?.signature === open.signature &&
          again?.release.ok === true,
        `в базе: ${JSON.stringify(stored?.sheets ?? null)} · подтверждено ${stored?.confirmed} · подпись ${open.signature} → ${again?.signature}`,
      );
      check('FLOW ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width: 1440, height: 900 } },
  );
}

/* ═════════════════════════  TABLET  ═════════════════════════ */

async function partTablet(browser) {
  console.log('\n── TABLET (1024 × 768, касание): «Документы» → «Карта раскроя»; лист и кнопки в экране; касание детали');
  await withOrg(
    'TABLET',
    browser,
    async ({ service, org, page, errors, consoleErrors, projectId }) => {
      /* Листы цеха уже заведены — как после «Сохранить для цеха». */
      const cutting0 = {
        kerfMm: 4,
        trimMm: 10,
        minRemnantMm: 300,
        rotate: true,
        confirmed: true,
        texture: {},
        sheets: [
          { stock: 'ldsp:16', lengthMm: 2800, widthMm: 2070 },
          { stock: 'hdf:3', lengthMm: 2800, widthMm: 2070 },
        ],
      };
      const { data: current } = await service.from('orgs').select('production').eq('id', org.id).single();
      await service.from('orgs').update({ production: { ...(current?.production ?? {}), cutting: cutting0 } }).eq('id', org.id);
      await openStudio(page, projectId);
      must('TABLET инструмент «Документы»', await tool(page, 'documents'), 'НУЛЕВОЙ СЕЛЕКТОР: [data-studio-tool="documents"]');
      const row = page.locator('[data-studio-doc="cutting"]');
      must('TABLET строка «Карта раскроя» в документах', (await row.count()) === 1, `НУЛЕВОЙ СЕЛЕКТОР: [data-studio-doc="cutting"] ×${await row.count()}`);
      await row.first().tap();
      await page.waitForSelector('[data-sheet-view]', { timeout: 60_000 });
      await sleep(500);
      const snap = await cutting(page);
      const layout = await page.evaluate(() => {
        const viewport = document.querySelector('[data-studio-viewport]');
        const scroller = viewport?.firstElementChild;
        const svg = document.querySelector('[data-sheet-view]')?.getBoundingClientRect();
        const vp = viewport?.getBoundingClientRect();
        const buttons = Array.from(document.querySelectorAll('[data-zoom-button], [data-sheet-tab], [data-cut-pdf], [data-cut-csv]')).map((b) => b.getBoundingClientRect());
        /* Высота кнопки — та, что задаёт сама Studio (`--h-button`): плотнее мастера, но в палец. */
        const root = document.querySelector('[data-studio-root]');
        const standard = root ? parseFloat(getComputedStyle(root).getPropertyValue('--h-button')) : NaN;
        return {
          pageScroll: document.scrollingElement.scrollWidth - window.innerWidth,
          inner: scroller ? scroller.scrollWidth - scroller.clientWidth : -1,
          svgInside: Boolean(svg && vp && svg.left >= vp.left - 1 && svg.right <= vp.right + 1 && svg.width > 300),
          svgWidth: Math.round(svg?.width ?? 0),
          viewportWidth: Math.round(vp?.width ?? 0),
          touch: Number.isFinite(standard) && buttons.length > 0 && buttons.every((b) => b.height >= standard - 0.5),
          standard,
          lowest: Math.round(Math.min(...buttons.map((b) => b.height))),
          buttons: buttons.length,
        };
      });
      await page.screenshot({ path: `${OUT}/tablet-1-map.png`, timeout: 120_000 });
      check(
        'TABLET.1 на 1024 px карта в рабочей области: лист целиком по ширине, прокрутки по ширине нет ни у страницы, ни у области, кнопки — не ниже кнопки Studio (--h-button)',
        Boolean(snap) && snap.release.ok && layout.pageScroll <= 0 && layout.inner <= 1 && layout.svgInside && layout.touch,
        `лист ${layout.svgWidth} из ${layout.viewportWidth} px · прокрутка страницы ${layout.pageScroll}, области ${layout.inner} · кнопок ${layout.buttons}, самая низкая ${layout.lowest} px при высоте кнопки Studio ${layout.standard} px: ${layout.touch ? 'в норме' : 'НИЖЕ'} · выпуск ${snap?.release.ok ? 'открыт' : 'заперт'}`,
      );
      const piece = page.locator('[data-sheet-view] [data-cut-piece]').first();
      const pieceId = await piece.getAttribute('data-cut-piece');
      await page.locator('[data-sheet-view]').first().scrollIntoViewIfNeeded();
      const box = await piece.boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await sleep(400);
      const card = await page.evaluate(() => document.querySelector('[data-cut-part-card]')?.getAttribute('data-cut-part-card') ?? null);
      const z0 = await page.evaluate(() => Number(document.querySelector('[data-sheet-view]')?.getAttribute('data-zoom') ?? 'NaN'));
      await page.locator('[data-zoom-button="in"]').first().tap();
      const z1 = await page.evaluate(() => Number(document.querySelector('[data-sheet-view]')?.getAttribute('data-zoom') ?? 'NaN'));
      await page.screenshot({ path: `${OUT}/tablet-2-part.png`, timeout: 120_000 });
      check('TABLET.2 касание детали — её карточка; «+» касанием — крупнее', card === pieceId && z1 > z0, `карточка ${card} при ${pieceId} · масштаб ${z0} → ${z1}`);
      check('TABLET ошибок страницы и консоли нет', errors.length === 0 && consoleErrors.length === 0, [...errors, ...consoleErrors].slice(0, 3).join(' | '));
    },
    { viewport: { width: 1024, height: 768 }, touch: true },
  );
}

/* ═════════════════════════  запуск  ═════════════════════════ */

const unknownParts = PARTS.filter((p) => !KNOWN.includes(p));
if (unknownParts.length > 0 || PARTS.length === 0) {
  console.log(`Неизвестные части: ${unknownParts.join(', ') || 'пусто'} — есть ${KNOWN.join(', ')}`);
  process.exit(1);
}
loadEnv();
mkdirSync(OUT, { recursive: true });
let server = null;
let browser;
const done = [];
try {
  freePort(PORT);
  server = spawn('npx', ['next', 'start', '-p', String(PORT)], { stdio: 'ignore', shell: true, env: { ...process.env, SITE_PASSWORD: '' } });
  console.log(`Сборка ${buildId()} · снимки: ${OUT}`);
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      /* сервер ещё поднимается */
    }
    await sleep(1000);
  }
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  for (const part of PARTS) {
    try {
      if (part === 'flow') await partFlow(browser);
      if (part === 'tablet') await partTablet(browser);
      done.push(part);
    } catch (error) {
      check(`${part}: дошла до конца`, false, error instanceof Error ? error.message : String(error));
    }
  }
} finally {
  await browser?.close();
  if (server) {
    server.kill();
    try {
      execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' });
    } catch {
      /* сервер уже остановлен */
    }
    freePort(PORT);
  }
}
check(`части дошли до конца: ${done.join(', ') || '—'} из ${PARTS.join(', ')}`, done.length === PARTS.length);
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
