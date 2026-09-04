/**
 * ВИЗУАЛИЗАЦИЯ ДЕМО-ОБЪЕКТА — РОВНО ОДИН РАЗ, РУКАМИ.
 *
 *   npm run demo:render -- --org <uuid>
 *   npm run demo:render -- --org <uuid> --force     # перерисовать поверх
 *
 * ТРАТИТ один настоящий запрос к image-модели. Нужны NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY и собранный проект (`npm run build`).
 *
 * Почему скриптом, а не страницей: публичную демо-страницу открывает кто
 * угодно сколько угодно раз, а каждая картинка стоит денег. Поэтому картинка
 * кладётся заранее и один раз, а страница её только читает. Генерации при
 * открытии страницы и при создании организации нет нигде.
 *
 * БЕЗ --force СКРИПТ ОТКАЗЫВАЕТСЯ ПЕРЕЗАПИСЫВАТЬ. Ссылка уже есть — значит
 * за неё уже заплачено и её уже видели; молча потратить второй запрос и
 * подменить показанную компании картинку нельзя.
 *
 * Как снимается кадр: тем же путём, что у замерщика — страница `/demo`
 * поднимается в браузере, конфигуратор сам делает beauty и clay проходы и
 * сам зовёт `/api/ai/render`. Второй ветки захвата не существует: она
 * разошлась бы с продуктом на первой правке сцены.
 *
 * ОТПЕЧАТОК СВЕРЯЕТСЯ ПЕРЕД СОХРАНЕНИЕМ. Кадр снят с ряда, и если этот ряд
 * не тот, что лежит в демо-объекте организации, картинка покажет одну кухню,
 * а чертёж рядом — другую. Расхождение — отказ, а не предупреждение.
 */
import { execSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3291;
const BASE = `http://localhost:${PORT}`;
const PROJECTS_BUCKET = 'projects';
/** Признак демо-объекта: тот же ключ, что ставит `lib/millwork/demoProject.ts`. */
const DEMO_SEED_KEY = 'demo-v1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadEnv() {
  try {
    const text = readFileSync(join(ROOT, '.env.local'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const value = match[2].replace(/^["']|["']$/g, '');
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  } catch {
    /* файла нет — читаем только окружение */
  }
}

function freePort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, {
      encoding: 'utf8',
    });
    for (const line of out.split(/\r?\n/)) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== '0') {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      }
    }
  } catch {
    /* никто не слушает */
  }
}

function arg(flag) {
  const i = process.argv.indexOf(`--${flag}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const orgId = arg('org');
const force = process.argv.includes('--force');

if (!SUPABASE_URL || !SERVICE) {
  console.log('\nНужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.\n');
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.log('\nНужен GEMINI_API_KEY: скрипт делает настоящий запрос к модели.\n');
  process.exit(1);
}
if (!orgId) {
  console.log('\nnpm run demo:render -- --org <uuid> [--force]\n');
  process.exit(1);
}

const service = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(String(dataUrl).trim());
  if (!match) return null;
  return {
    mime: match[1],
    buffer: Buffer.from(match[2].replace(/\s/g, ''), 'base64'),
  };
}

async function main() {
  /* ── 1. Организация и её демо-объект ── */
  const { data: org } = await service
    .from('orgs')
    .select('id, name, slug, plan')
    .eq('id', orgId)
    .maybeSingle();

  if (!org) {
    console.error(`Организации ${orgId} нет.`);
    process.exit(1);
  }

  const { data: project } = await service
    .from('projects')
    .select('id, org_id, address, millwork')
    .eq('org_id', org.id)
    .eq('millwork->>demoSeed', DEMO_SEED_KEY)
    .limit(1)
    .maybeSingle();

  if (!project) {
    console.error(
      `У «${org.name}» нет демо-объекта. Сначала: npm run seed:orgs -- --apply --org ${org.id}`,
    );
    process.exit(1);
  }

  const millwork = project.millwork ?? {};
  const variant = millwork.selectedVariant ?? 'optimal';
  const expected = millwork.runs?.[variant]?.fingerprint;

  if (!expected) {
    console.error('В демо-объекте нет сохранённого ряда — рисовать нечего.');
    process.exit(1);
  }

  /* ── 2. Уже есть? Без --force не трогаем ── */
  if (millwork.demoRender?.path && !force) {
    console.log(
      `\nВизуализация у «${org.name}» уже есть:\n  ${millwork.demoRender.path}` +
        `\n  снята ${millwork.demoRender.createdAt}` +
        '\n\nПерерисовать (ещё один платный запрос): добавьте --force\n',
    );
    process.exit(0);
  }

  console.log(`\n«${org.name}» (${org.slug}) · объект ${project.address}`);
  console.log(`  отпечаток ряда: ${expected.slice(0, 24)}`);
  console.log(force && millwork.demoRender?.path ? '  --force: рисуем заново' : '  рисуем первый раз');

  /* ── 3. Кадр и рендер тем же путём, что у замерщика ── */
  freePort(PORT);
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
    // Дверь снята: скрипт упёрся бы в /gate и упал с непонятным «страница не та».
    env: { ...process.env, SITE_PASSWORD: '' },
  });

  let saved = null;

  try {
    for (let i = 0; i < 90; i += 1) {
      try {
        const res = await fetch(BASE);
        if (res.ok || res.status < 500) break;
      } catch {
        await sleep(1000);
      }
    }

    const browser = await chromium.launch({
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    /*
     * Отпечаток кадра берём ИЗ ЗАПРОСА, а не из своей копии раскладки:
     * так сверяется ровно то, что уехало в модель.
     */
    let sentFingerprint = null;
    page.on('request', (req) => {
      if (!req.url().includes('/api/ai/render') || req.method() !== 'POST') return;
      try {
        const body = JSON.parse(req.postData() ?? '{}');
        sentFingerprint = body.items?.[0]?.meta?.fingerprint ?? null;
      } catch {
        /* тело не читается */
      }
    });

    const answered = [];
    page.on('response', async (res) => {
      if (!res.url().includes('/api/ai/render')) return;
      try {
        answered.push(await res.json());
      } catch {
        /* тело уже прочитано */
      }
    });

    await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await sleep(3500);
    await page.getByRole('button', { name: /Результат/ }).first().click({ timeout: 90_000 });
    await sleep(1500);

    const button = page
      .getByRole('button', { name: /Отрисовать кухню|Отрисовать заново/ })
      .first();

    if ((await button.count()) === 0) {
      throw new Error('Кнопки отрисовки нет — страница не собралась.');
    }

    await button.click();
    for (let i = 0; i < 180 && answered.length === 0; i += 1) await sleep(1000);
    await browser.close();

    const answer = answered[0];
    if (!answer) throw new Error('Модель не ответила за 180 с.');
    if (answer.error) throw new Error(`Модель отказала: ${answer.error}`);
    if (!answer.image) throw new Error('В ответе нет картинки.');

    /*
     * СВЕРКА ОТПЕЧАТКА. Кадр снят с какого-то ряда; если это не ряд из
     * демо-объекта, картинка покажет одну кухню, а чертёж рядом — другую.
     */
    if (sentFingerprint && sentFingerprint !== expected) {
      throw new Error(
        `Кадр снят с другого ряда: ${sentFingerprint.slice(0, 24)} ≠ ${expected.slice(0, 24)}. ` +
          'Картинка разошлась бы с чертежом — не сохраняю.',
      );
    }
    if (!sentFingerprint) {
      console.log('  ВНИМАНИЕ отпечаток в запросе не найден — сверить не с чем.');
    }

    const decoded = decodeDataUrl(answer.image);
    if (!decoded) throw new Error('Картинка не разобралась.');

    /* ── 4. В Storage и в объект ── */
    const styleId = answer.styleId ?? 'demo';
    const ext = decoded.mime.includes('png') ? 'png' : 'jpg';
    const path = `${org.id}/${project.id}/demo-${styleId}-${Date.now()}.${ext}`;

    const { error: uploadError } = await service.storage
      .from(PROJECTS_BUCKET)
      .upload(path, decoded.buffer, { contentType: decoded.mime, upsert: true });

    if (uploadError) throw new Error(`Storage: ${uploadError.message}`);

    const demoRender = {
      path,
      styleId,
      fingerprint: expected,
      createdAt: new Date().toISOString(),
    };

    const { error: saveError } = await service
      .from('projects')
      .update({ millwork: { ...millwork, demoRender } })
      .eq('id', project.id);

    if (saveError) throw new Error(`Не записалась ссылка: ${saveError.message}`);

    saved = { path, kb: Math.round(decoded.buffer.length / 1024), styleId };
  } finally {
    server.kill();
    freePort(PORT);
  }

  console.log(
    `\nГотово: ${saved.kb} КБ, стиль ${saved.styleId}` +
      `\n  ${saved.path}` +
      `\n\nОткройте: /demo/${org.slug}\n`,
  );
}

main().catch((e) => {
  console.error(`\n${e.message}\n`);
  freePort(PORT);
  process.exit(1);
});
