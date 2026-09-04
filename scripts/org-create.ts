/**
 * ЗАВЕДЕНИЕ ДЕМО-КОМПАНИИ ОДНОЙ КОМАНДОЙ.
 *
 *   npm run org:create -- --name "Кухни Плюс" --slug kuhni-plus --email a@b.kz
 *   npm run org:create -- --name "Кухни Плюс" --slug kuhni-plus --email a@b.kz \
 *                         --accent "#C08B3E" --plan trial
 *
 * Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.
 *
 * Что делает:
 *   1. заводит организацию (или находит существующую по слагу);
 *   2. ставит plan='demo' — генерация у неё выключена на сервере;
 *   3. приглашает владельца по почте;
 *   4. сидит каталог и демо-объект ТЕМ ЖЕ `seedOrg`, что и первый вход;
 *   5. печатает адрес демо-страницы и ссылку входа.
 *
 * ИДЕМПОТЕНТЕН. Повторный запуск с тем же слагом ничего не дублирует:
 * организация находится по слагу, каталог и демо-объект проверяются
 * по содержимому. Сорваться на середине и перезапустить — нормально.
 *
 * СЛАГ ЗАДАЁТСЯ РУКАМИ И ИЗ НАЗВАНИЯ НЕ ВЫВОДИТСЯ. По этому адресу уходит
 * ссылка компании; вывели бы его из имени — переименование сломало бы
 * живую ссылку.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedOrg } from '../lib/orgSeed';
import { DEMO_PLAN } from '../lib/plan';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** .env.local читаем сами: next здесь не участвует. */
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

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE) {
  console.log(
    '\nНужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Организация заводится сервисным ключом: у нового владельца ещё нет\n' +
      'членства, и RLS отсекла бы вставку до того, как оно появится.\n',
  );
  process.exit(1);
}

function arg(flag: string): string | null {
  const i = process.argv.indexOf(`--${flag}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const name = arg('name');
const rawSlug = arg('slug');
const email = arg('email');
const accent = arg('accent') ?? '#C08B3E';
const plan = arg('plan') ?? DEMO_PLAN;
const baseUrl = (arg('base') ?? process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');

if (!name || !rawSlug) {
  console.log(
    '\nnpm run org:create -- --name "Кухни Плюс" --slug kuhni-plus --email owner@kuhni.kz\n\n' +
      '  --name    название компании (видно на демо-странице и на входе)\n' +
      '  --slug    адрес демо-страницы, задаётся РУКАМИ и из имени не выводится\n' +
      '  --email   почта владельца: ему уйдёт приглашение (необязательно)\n' +
      '  --accent  акцентный цвет, по умолчанию #C08B3E\n' +
      `  --plan    тариф, по умолчанию «${DEMO_PLAN}» — генерация выключена\n`,
  );
  process.exit(1);
}

const slug = rawSlug
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

if (slug !== rawSlug.trim().toLowerCase()) {
  console.log(`  слаг приведён к виду адреса: «${rawSlug}» → «${slug}»`);
}

const service = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  /* ── 1. Организация ── */
  const { data: existing } = await service
    .from('orgs')
    .select('id, name, slug, plan')
    .eq('slug', slug)
    .maybeSingle();

  let orgId: string;

  if (existing) {
    orgId = String(existing.id);
    console.log(`\nОрганизация «${existing.name}» уже есть (${slug}) — дозаполняем.`);
    if (existing.plan !== plan) {
      await service.from('orgs').update({ plan }).eq('id', orgId);
      console.log(`  тариф: ${existing.plan} → ${plan}`);
    }
  } else {
    const { data, error } = await service
      .from('orgs')
      .insert({ name, slug, accent_color: accent, plan })
      .select('id')
      .single();

    if (error || !data) {
      console.error(`Не удалось создать организацию: ${error?.message ?? 'нет данных'}`);
      process.exit(1);
    }
    orgId = String(data.id);
    console.log(`\nОрганизация «${name}» создана · тариф ${plan}`);
  }

  /* ── 2. Приглашение владельца ── */
  if (email) {
    const { error } = await service.from('org_invites').insert({
      org_id: orgId,
      email: email.trim().toLowerCase(),
      role: 'owner',
    });

    if (error) {
      // Повторный запуск: приглашение уже лежит — это не ошибка.
      console.log(`  приглашение: ${error.message}`);
    } else {
      console.log(`  приглашение владельца: ${email}`);
    }
  }

  /* ── 3. Каталог и демо-объект — тем же кодом, что при первом входе ── */
  const seeded = await seedOrg(service, orgId);

  if (seeded.catalog.error) {
    console.error(`  каталог: ОШИБКА — ${seeded.catalog.error}`);
  } else {
    console.log(
      `  каталог: +${seeded.catalog.added} товаров, +${seeded.catalog.addedCategories} категорий` +
        (seeded.catalog.skipped ? `, пропущено ${seeded.catalog.skipped}` : ''),
    );
  }

  if (seeded.demo.error) {
    console.error(`  демо-объект: ОШИБКА — ${seeded.demo.error}`);
  } else if (seeded.demo.created) {
    console.log(`  демо-объект: создан, смета ${Math.round(seeded.demo.total ?? 0)} ₸`);
  } else {
    console.log('  демо-объект: уже есть');
  }

  /* ── 4. Адреса ── */
  const origin = baseUrl || 'http://localhost:3000';
  console.log(
    `\nДемо-страница:  ${origin}/demo/${slug}` +
      `\nВход компании:  ${origin}/login?org=${slug}&next=%2Fprojects` +
      `\nБренд и адрес:  ${origin}/admin/branding  (логотип и цвет)` +
      `\n\nВизуализации пока нет — блок на странице честно пуст.` +
      `\nОтрисовать один раз:  npm run demo:render -- --org ${orgId}\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
