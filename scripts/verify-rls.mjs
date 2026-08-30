/**
 * Приёмка мультиарендности: запрос из-под чужого org_id обязан вернуть ноль строк.
 *
 * Запуск: npm run test:rls
 * Нужны NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY и применённая миграция 0001_catalog.sql.
 *
 * Скрипт создаёт две организации с двумя пользователями, пишет в каждую по
 * товару и проверяет, что участник одной не видит и не может править другую.
 * За собой убирает.
 *
 * Мультиарендность без такого теста — это не мультиарендность.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** .env.local читаем сами: next dev здесь не участвует. */
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

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.log(
    '\nПропущено: не заданы NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY\n' +
      'или SUPABASE_SERVICE_ROLE_KEY. Мультиарендность НЕ проверена.\n',
  );
  process.exit(0);
}

/*
 * Ключи бывают заполнены заглушкой из .env.local.example. Тогда честный ответ —
 * «не проверено», а не падение с «fetch failed»: красный прогон по проекту,
 * которого нет, прячет настоящие поломки.
 */
const reachable = await fetch(`${URL}/auth/v1/health`, {
  headers: { apikey: ANON },
  signal: AbortSignal.timeout(10_000),
})
  .then((r) => r.ok)
  .catch(() => false);

if (!reachable) {
  console.log(
    `\nПропущено: проект ${URL} недоступен (заглушка в .env.local или нет сети).\n` +
      'Мультиарендность НЕ проверена.\n',
  );
  process.exit(0);
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

const service = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now().toString(36);
const made = { users: [], orgs: [] };

/*
 * Миграция 0008 может быть ещё не применена к этому проекту. Тогда честный
 * ответ — «не проверено» по этому разделу, а не падение всего прогона:
 * красный прогон по несуществующей таблице прячет настоящие поломки.
 */
const libraryReady = !(await service.from('complexes').select('id').limit(1)).error;

async function makeTenant(label) {
  const email = `rls-${label}-${stamp}@example.test`;
  const password = `Pw-${stamp}-${label}!`;

  const { data: created, error: userError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError) throw new Error(`createUser: ${userError.message}`);
  made.users.push(created.user.id);

  const { data: org, error: orgError } = await service
    .from('orgs')
    .insert({ slug: `rls-${label}-${stamp}`, name: `RLS ${label} ${stamp}` })
    .select('id')
    .single();
  if (orgError) throw new Error(`insert org: ${orgError.message}`);
  made.orgs.push(org.id);

  const { error: memberError } = await service
    .from('org_members')
    .insert({ org_id: org.id, user_id: created.user.id, role: 'owner' });
  if (memberError) throw new Error(`insert member: ${memberError.message}`);

  const { data: category, error: catError } = await service
    .from('catalog_categories')
    .insert({
      org_id: org.id,
      key: `cat-${label}`,
      name_ru: `Категория ${label}`,
      applies_to: 'floor',
      unit: 'm2',
    })
    .select('id')
    .single();
  if (catError) throw new Error(`insert category: ${catError.message}`);

  const { data: item, error: itemError } = await service
    .from('catalog_items')
    .insert({
      org_id: org.id,
      category_id: category.id,
      article: `ART-${label}-${stamp}`,
      name_ru: `Товар ${label}`,
      price: 1000,
      unit: 'm2',
    })
    .select('id')
    .single();
  if (itemError) throw new Error(`insert item: ${itemError.message}`);

  const { data: project, error: projectError } = await service
    .from('projects')
    .insert({ org_id: org.id, client_name: `Клиент ${label}` })
    .select('id, share_token')
    .single();
  if (projectError) throw new Error(`insert project: ${projectError.message}`);

  /*
   * Библиотека планировок принадлежит организации так же, как каталог:
   * двадцать обмеренных планировок — это её актив, и чужой сотрудник
   * не должен видеть их ни строкой.
   */
  let complexId = null;
  let planId = null;

  if (libraryReady) {
    const { data: complex, error: complexError } = await service
      .from('complexes')
      .insert({
        org_id: org.id,
        slug: `zk-${label}-${stamp}`,
        name: `ЖК ${label} ${stamp}`,
        developer: 'Застройщик',
        city: 'Астана',
      })
      .select('id')
      .single();
    if (complexError) throw new Error(`insert complex: ${complexError.message}`);
    complexId = complex.id;

    const { data: plan, error: planError } = await service
      .from('floor_plans')
      .insert({
        complex_id: complex.id,
        slug: `plan-${label}-${stamp}`,
        code: `3К-${label}`,
        rooms: 3,
        area_m2: 90.5,
      })
      .select('id')
      .single();
    if (planError) throw new Error(`insert floor plan: ${planError.message}`);
    planId = plan.id;
  }

  return {
    email,
    password,
    orgId: org.id,
    categoryId: category.id,
    itemId: item.id,
    project,
    complexId,
    planId,
  };
}

async function signIn(tenant) {
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: tenant.email,
    password: tenant.password,
  });
  if (error) throw new Error(`signIn: ${error.message}`);
  return client;
}

try {
  console.log('\nПодготовка двух арендаторов');
  const a = await makeTenant('a');
  const b = await makeTenant('b');
  console.log(`  готово: org A ${a.orgId}, org B ${b.orgId}`);

  const clientA = await signIn(a);

  console.log('\nИзоляция каталога');

  const ownItems = await clientA.from('catalog_items').select('id, org_id');
  check(
    'свои товары видны',
    (ownItems.data ?? []).some((r) => r.id === a.itemId),
    `видно строк: ${ownItems.data?.length ?? 0}`,
  );
  check(
    'чужие товары не видны в общем списке',
    !(ownItems.data ?? []).some((r) => r.org_id === b.orgId),
  );

  const foreignById = await clientA.from('catalog_items').select('id').eq('id', b.itemId);
  check(
    'запрос чужого товара по id возвращает ноль строк',
    (foreignById.data ?? []).length === 0,
    `строк: ${foreignById.data?.length ?? 0}`,
  );

  const foreignByOrg = await clientA
    .from('catalog_items')
    .select('id')
    .eq('org_id', b.orgId);
  check(
    'запрос из-под чужого org_id возвращает пусто',
    (foreignByOrg.data ?? []).length === 0,
    `строк: ${foreignByOrg.data?.length ?? 0}`,
  );

  const foreignCategories = await clientA
    .from('catalog_categories')
    .select('id')
    .eq('org_id', b.orgId);
  check(
    'чужие категории не видны',
    (foreignCategories.data ?? []).length === 0,
  );

  console.log('\nЗапись в чужую организацию');

  const insertForeign = await clientA.from('catalog_items').insert({
    org_id: b.orgId,
    category_id: b.categoryId,
    article: `HACK-${stamp}`,
    name_ru: 'Чужой товар',
    unit: 'm2',
  });
  check(
    'вставка в чужой каталог отклонена',
    Boolean(insertForeign.error),
    insertForeign.error?.message?.slice(0, 80) ?? 'ошибки нет — это провал',
  );

  const updateForeign = await clientA
    .from('catalog_items')
    .update({ price: 1 })
    .eq('id', b.itemId)
    .select('id');
  check(
    'правка чужого товара не затронула ни строки',
    (updateForeign.data ?? []).length === 0,
    `строк: ${updateForeign.data?.length ?? 0}`,
  );

  const priceAfter = await service
    .from('catalog_items')
    .select('price')
    .eq('id', b.itemId)
    .single();
  check(
    'цена чужого товара осталась прежней',
    Number(priceAfter.data?.price) === 1000,
    `цена: ${priceAfter.data?.price}`,
  );

  console.log('\nПроекты и организации');

  const foreignProjects = await clientA
    .from('projects')
    .select('id')
    .eq('org_id', b.orgId);
  check('чужие проекты не видны', (foreignProjects.data ?? []).length === 0);

  const foreignOrg = await clientA.from('orgs').select('id').eq('id', b.orgId);
  check('чужая организация не видна', (foreignOrg.data ?? []).length === 0);

  console.log('\nБиблиотека планировок');

  if (!libraryReady) {
    console.log('  пропущено: миграция 0008_complexes.sql не применена к этому проекту');
  }

  if (libraryReady) {
  const ownComplexes = await clientA.from('complexes').select('id, org_id');
  check(
    'свои ЖК видны',
    (ownComplexes.data ?? []).some((r) => r.id === a.complexId),
    `видно строк: ${ownComplexes.data?.length ?? 0}`,
  );
  check(
    'чужие ЖК не видны в общем списке',
    !(ownComplexes.data ?? []).some((r) => r.org_id === b.orgId),
  );

  const foreignComplex = await clientA.from('complexes').select('id').eq('id', b.complexId);
  check(
    'запрос чужого ЖК по id возвращает ноль строк',
    (foreignComplex.data ?? []).length === 0,
    `строк: ${foreignComplex.data?.length ?? 0}`,
  );

  const foreignPlan = await clientA.from('floor_plans').select('id').eq('id', b.planId);
  check(
    'чужая планировка не видна',
    (foreignPlan.data ?? []).length === 0,
    `строк: ${foreignPlan.data?.length ?? 0}`,
  );

  // Замер чужой планировки — это подмена размеров в чужом объекте.
  const hijack = await clientA
    .from('floor_plans')
    .update({ measured_at: new Date().toISOString(), measured_by: 'чужой' })
    .eq('id', b.planId)
    .select('id');
  check(
    'замер в чужую планировку не записывается',
    (hijack.data ?? []).length === 0,
    `строк: ${hijack.data?.length ?? 0}`,
  );

  const readyInForeign = await clientA.from('ready_projects').insert({
    floor_plan_id: b.planId,
    zone: 'kitchen',
    title: 'Чужой готовый проект',
  });
  check(
    'готовый проект в чужую планировку не вставляется',
    Boolean(readyInForeign.error),
    readyInForeign.error?.message?.slice(0, 80) ?? 'ошибки нет — это провал',
  );

  const anonPlans = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonRead = await anonPlans.from('floor_plans').select('id');
  check(
    'анонимный запрос к планировкам не отдаёт ничего',
    (anonRead.data ?? []).length === 0,
    `строк: ${anonRead.data?.length ?? 0}`,
  );

  }

  console.log('\nКабинет клиента');
  check(
    'share_token длинный и случайный, а не последовательный id',
    typeof b.project.share_token === 'string' && b.project.share_token.length >= 32,
    `длина: ${b.project.share_token?.length}`,
  );

  const anonClient = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonProjects = await anonClient.from('projects').select('id');
  check(
    'анонимный запрос к проектам не отдаёт ничего',
    (anonProjects.data ?? []).length === 0,
    `строк: ${anonProjects.data?.length ?? 0}`,
  );

  await clientA.auth.signOut();
} catch (err) {
  failed++;
  console.error('\nОшибка проверки:', err instanceof Error ? err.message : err);
} finally {
  console.log('\nУборка');
  for (const orgId of made.orgs) {
    await service.from('orgs').delete().eq('id', orgId);
  }
  for (const userId of made.users) {
    await service.auth.admin.deleteUser(userId).catch(() => undefined);
  }
  console.log(`  удалено организаций: ${made.orgs.length}, пользователей: ${made.users.length}`);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
