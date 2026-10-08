/**
 * ФОТО ПОМЕЩЕНИЯ СОХРАНЯЕТСЯ С ОБЪЕКТОМ — В БРАУЗЕРЕ, НА НАСТОЯЩЕМ ОБЪЕКТЕ.
 *
 * Запуск: node scripts/check-photo.mjs   (нужен build и ключи Supabase)
 *
 * Фото, добавленное в рабочем месте, жило только в памяти вкладки: в
 * состояние объекта оно не входило, в Storage не уходило, и после
 * перезагрузки страницы его не было. Клиент, открыв объект на следующий
 * день, видел «без фото — настроение, а не ваша квартира».
 *
 * Здесь — тем же путём, что рука, на объекте настоящей организации:
 *   1. объект без фото → «Материалы» → добавить фото → перезагрузить →
 *      фото на месте, в Storage ровно ОДИН файл, и он — фото объекта;
 *   2. заменить фото → перезагрузить → на месте новое, файл по-прежнему
 *      один: прежний удалён, как прежний рендер по чертежу (слой 54);
 *   3. «Убрать» → перезагрузить → фото нет, файлов в папке объекта 0.
 *
 * Организация, пользователь, объект и файлы заводятся служебным ключом и
 * удаляются. Нулевой селектор — FAIL со словами, а не пропуск.
 *
 * Инструмент глазной проверки, в `verify` не входит.
 */
import { execSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const PORT = 3233;
const BASE = `http://localhost:${PORT}`;
const BUCKET = 'projects';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* .env.local читаем сами: next start его прочтёт, а этот процесс — нет. */
try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^['"]|['"]$/g, '');
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
} catch {
  /* файла нет — ниже это названо словами */
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

async function until(read, ok, timeoutMs) {
  const started = Date.now();
  let value = await read();
  while (!ok(value) && Date.now() - started < timeoutMs) {
    await sleep(300);
    value = await read();
  }
  return value;
}

/** Полосатый JPEG: настоящий кадр, а не пиксель — сжатие в браузере его примет. */
const stripes = (w, h, a, b) =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
        Array.from(
          { length: 12 },
          (_, i) => `<rect x="${(i * w) / 12}" y="0" width="${w / 24}" height="${h}" fill="${i % 2 ? a : b}"/>`,
        ).join('') +
        `</svg>`,
    ),
  )
    .flatten({ background: '#cccccc' })
    .jpeg({ quality: 88 })
    .toBuffer();

async function toStep(page, title) {
  const button = page.locator(`nav[aria-label="Шаги работы"] button[aria-label="${title}"]`);
  await button.click({ timeout: 30_000 });
  const opened = await until(
    async () => button.getAttribute('aria-current'),
    (v) => v === 'step',
    15_000,
  );
  if (opened !== 'step') throw new Error(`шаг «${title}» не открылся`);
  await sleep(600);
}

/** Что про фото помещения на экране: картинка, её адрес и состояние записи. */
const READ_PHOTO = `(() => {
  const block = document.querySelector('[data-photo-first]');
  if (!block) return null;
  const img = block.querySelector('img');
  return {
    src: img ? img.getAttribute('src') ?? '' : null,
    save: block.getAttribute('data-photo-save'),
    words: block.querySelector('[data-photo-error]')?.textContent ?? null,
  };
})()`;

async function openMaterials(page, projectId) {
  await page.goto(`${BASE}/project/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await until(
    () => page.locator('nav[aria-label="Шаги работы"] button').count(),
    (n) => n > 0,
    120_000,
  );
  await toStep(page, 'Материалы');
  return page.evaluate(READ_PHOTO);
}

async function scenario(browser) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !ANON || !SERVICE || /your-project|example/.test(URL)) {
    check('Supabase доступен для проверки фото', false, 'НЕ ПРОВЕРЕНО: нет ключей в .env.local');
    return;
  }

  const service = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = Date.now();
  const email = `photo-${stamp}@example.test`;
  const password = `Pw-${stamp}-photo!`;
  const made = { user: null, org: null, project: null };

  /** Файлы фото в папке объекта — по Storage, а не по экрану. */
  const filesOf = async () => {
    const folder = `${made.org}/${made.project}`;
    const { data, error } = await service.storage.from(BUCKET).list(folder, { limit: 100 });
    if (error) throw new Error(`Storage не прочитался: ${error.message}`);
    return (data ?? []).filter((f) => f.name && !f.name.startsWith('.')).map((f) => `${folder}/${f.name}`);
  };
  const rowOf = async () => {
    const { data, error } = await service
      .from('projects')
      .select('source_photo_path, source_photos')
      .eq('id', made.project)
      .single();
    if (error) throw new Error(`объект не прочитался: ${error.message}`);
    return data;
  };

  try {
    const { data: created, error: userError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userError) throw new Error(`createUser: ${userError.message}`);
    made.user = created.user.id;

    const { data: org, error: orgError } = await service
      .from('orgs')
      .insert({ slug: `photo-${stamp}`, name: `Проверка фото ${stamp}` })
      .select('id')
      .single();
    if (orgError) throw new Error(`insert org: ${orgError.message}`);
    made.org = org.id;

    const { error: memberError } = await service
      .from('org_members')
      .insert({ org_id: org.id, user_id: created.user.id, role: 'owner' });
    if (memberError) throw new Error(`insert member: ${memberError.message}`);

    /* Куки ставит сама библиотека: формат сессии не подделывается. */
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
    check('вход настоящим пользователем', jar.length > 0, `кук ${jar.length}`);

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
    check('типовой прайс заведён организации', seeded.ok(), `${seeded.status()}`);

    const { data: project, error: projectError } = await service
      .from('projects')
      .insert({
        org_id: org.id,
        address: 'Проверка фото',
        zone: 'Кухня',
        client_name: 'Проверка',
        measurements: {
          id: `m-${stamp}`,
          ceilingHeightMm: 2700,
          walls: [{ id: 'a', lengthMm: 3800, angleDeg: 90, openings: [] }],
          comms: [],
          photos: [],
          measuredBy: 'проверка',
          measuredAt: new Date().toISOString(),
          notes: '',
        },
        millwork: { templateId: 'linear-column' },
        status: 'in_progress',
      })
      .select('id')
      .single();
    if (projectError) throw new Error(`insert project: ${projectError.message}`);
    made.project = project.id;

    /* ── 1. Добавить → перезагрузить → на месте, файл один ── */
    const before = await openMaterials(page, project.id);
    check(
      'у нового объекта фото нет, и блок фото — первым в панели',
      Boolean(before) && before.src === null,
      before ? `картинка ${before.src === null ? 'нет' : 'есть'}` : 'НУЛЕВОЙ СЕЛЕКТОР: [data-photo-first] нет на экране',
    );
    const input = page.locator('[data-photo-first] input[type="file"]');
    if ((await input.count()) !== 1) {
      check('кнопка «Добавить фото помещения» есть', false, `НУЛЕВОЙ СЕЛЕКТОР: полей файла ${await input.count()}`);
      return;
    }
    await input.setInputFiles({ name: 'kitchen.jpg', mimeType: 'image/jpeg', buffer: await stripes(1200, 900, '#6b4f2a', '#d9c3a0') });
    const added = await until(() => page.evaluate(READ_PHOTO), (v) => v?.save === 'saved' || v?.save === 'error', 30_000);
    check(
      'запись фото подтверждена на экране',
      added?.save === 'saved',
      added ? `состояние ${added.save ?? 'нет'}${added.words ? ` · «${added.words}»` : ''}` : 'блока фото нет',
    );
    const shown = await page.evaluate(READ_PHOTO);
    check('фото на экране сразу', Boolean(shown?.src), shown?.src ? 'есть' : 'нет');

    const afterReload = await openMaterials(page, project.id);
    check(
      'после перезагрузки фото на месте',
      Boolean(afterReload?.src),
      afterReload?.src ? afterReload.src.slice(0, 90) : 'ФОТО ПРОПАЛО',
    );
    const files1 = await filesOf();
    const row1 = await rowOf();
    check('в Storage ровно один файл фото', files1.length === 1, `${files1.length}: ${files1.join(', ') || 'пусто'}`);
    check(
      'и объект указывает на него',
      files1.length === 1 && row1.source_photo_path === files1[0],
      `source_photo_path ${row1.source_photo_path ?? 'null'}`,
    );
    check(
      'на экране — этот же файл из Storage, а не копия в памяти',
      files1.length === 1 && Boolean(afterReload?.src?.includes(files1[0].split('/').pop())),
      afterReload?.src ? afterReload.src.split('/').pop() : '—',
    );

    /* ── 2. Заменить → перезагрузить → новое, файл по-прежнему один ── */
    const replaceInput = page.locator('[data-room-photo-input]');
    if ((await replaceInput.count()) === 0) {
      check('«Заменить фото» есть', false, 'НУЛЕВОЙ СЕЛЕКТОР: [data-room-photo-input] нет на экране');
    } else {
      await replaceInput.first().setInputFiles({ name: 'kitchen-2.jpg', mimeType: 'image/jpeg', buffer: await stripes(1400, 1000, '#2a4f6b', '#a0c3d9') });
      const replaced = await until(
        () => page.evaluate(READ_PHOTO),
        (v) => v?.save === 'saved' && v?.src?.startsWith('data:'),
        30_000,
      );
      check('замена записана', replaced?.save === 'saved', replaced ? `состояние ${replaced.save}` : 'блока нет');
      const afterReplace = await openMaterials(page, project.id);
      const files2 = await filesOf();
      const row2 = await rowOf();
      check('после замены и перезагрузки фото на месте', Boolean(afterReplace?.src), afterReplace?.src ? 'есть' : 'ФОТО ПРОПАЛО');
      check(
        'в Storage по-прежнему один файл — новый, прежний удалён',
        files2.length === 1 && files2[0] !== files1[0] && row2.source_photo_path === files2[0],
        `${files2.length}: ${files2.join(', ') || 'пусто'} · было ${files1[0] ?? '—'}`,
      );
      check(
        'список снимков объекта не копит прежний',
        Array.isArray(row2.source_photos) && row2.source_photos.filter((p) => p.path === files1[0]).length === 0,
        `${(row2.source_photos ?? []).map((p) => p.path.split('/').pop()).join(', ') || 'пусто'}`,
      );
    }

    /* ── 3. Убрать → перезагрузить → фото нет, файлов 0 ── */
    const remove = page.getByRole('button', { name: 'Убрать', exact: true });
    if ((await remove.count()) === 0) {
      check('кнопка «Убрать» есть', false, 'НУЛЕВОЙ СЕЛЕКТОР: кнопки «Убрать» нет');
    } else {
      await remove.first().click();
      const removed = await until(() => page.evaluate(READ_PHOTO), (v) => v?.save === 'saved' || v?.save === 'error', 30_000);
      check('снятие фото записано', removed?.save === 'saved' && removed.src === null, removed ? `состояние ${removed.save}` : 'блока нет');
      const afterRemove = await openMaterials(page, project.id);
      const files3 = await filesOf();
      const row3 = await rowOf();
      check('после «Убрать» и перезагрузки фото нет', Boolean(afterRemove) && afterRemove.src === null, afterRemove?.src ?? 'нет');
      check(
        'и в Storage файлов объекта 0, указатель снят',
        files3.length === 0 && row3.source_photo_path === null,
        `${files3.length} файлов · source_photo_path ${row3.source_photo_path ?? 'null'}`,
      );
    }

    await context.close();
  } finally {
    /* Уборка: файлы объекта, организация каскадом, пользователь. */
    if (made.org && made.project) {
      try {
        const left = await filesOf();
        if (left.length) await service.storage.from(BUCKET).remove(left);
      } catch (error) {
        console.log(`  [уборка] файлы объекта не удалились: ${error instanceof Error ? error.message : error}`);
      }
    }
    if (made.org) {
      const { error } = await service.from('orgs').delete().eq('id', made.org);
      if (error) console.log(`  [уборка] организация ${made.org} не удалилась: ${error.message}`);
    }
    if (made.user) {
      const { error } = await service.auth.admin.deleteUser(made.user);
      if (error) console.log(`  [уборка] пользователь ${made.user} не удалился: ${error.message}`);
    }
  }
}

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
  console.log('\n── Фото помещения сохраняется с объектом');
  await scenario(browser);
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
