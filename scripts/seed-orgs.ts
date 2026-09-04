/**
 * РАЗОВЫЙ БЭКФИЛЛ: каталог и демо-объект уже созданным организациям.
 *
 *   npx tsx scripts/seed-orgs.ts            # что будет сделано, без записи
 *   npx tsx scripts/seed-orgs.ts --apply    # записать
 *   npx tsx scripts/seed-orgs.ts --apply --org <uuid>   # одну организацию
 *
 * Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.
 *
 * Организации, заведённые до сида, стоят пустыми: смета считает по ставкам
 * каталога, ставок нет — на экране нули. Здесь вызывается ТОТ ЖЕ код, что
 * при создании организации (`seedOrg`), а не вторая его копия: две похожие
 * ветки разъехались бы на первой правке прайса, и компания получала бы
 * разный каталог в зависимости от того, как она попала в систему.
 *
 * Идемпотентен по содержимому: уже заполненный каталог не дублируется,
 * второй демо-объект не появляется. Прогонять повторно безопасно.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedOrg } from '../lib/orgSeed';

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

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !SERVICE) {
  console.log(
    '\nПропущено: не заданы NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Бэкфилл пишет в чужие организации и идёт только сервисным ключом.\n',
  );
  process.exit(0);
}

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const onlyOrg = args[args.indexOf('--org') + 1];
const orgFilter = args.includes('--org') && onlyOrg ? onlyOrg : null;

/*
 * Сервисный ключ обходит RLS целиком — иначе не получится: у нас нет
 * сессии участника ни одной из этих организаций.
 */
const service = createClient(URL_, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  let query = service.from('orgs').select('id, name, slug').order('created_at');
  if (orgFilter) query = query.eq('id', orgFilter);

  const { data: orgs, error } = await query;
  if (error) {
    console.error(`Не удалось прочитать организации: ${error.message}`);
    process.exit(1);
  }
  if (!orgs || orgs.length === 0) {
    console.log('Организаций нет.');
    return;
  }

  console.log(
    `\n${apply ? 'Бэкфилл' : 'Проверка (без записи)'}: организаций ${orgs.length}\n`,
  );

  let seededCatalog = 0;
  let seededDemo = 0;
  let failed = 0;

  for (const org of orgs) {
    const id = String(org.id);
    const label = `${org.name ?? ''} (${org.slug ?? id.slice(0, 8)})`;

    if (!apply) {
      /*
       * Сухой прогон только СЧИТАЕТ. Показываем ровно то, на что смотрит
       * сам сид: сколько товаров в каталоге и есть ли демо-объект.
       */
      const [{ count: items }, { count: demos }] = await Promise.all([
        service.from('catalog_items').select('id', { count: 'exact', head: true }).eq('org_id', id),
        service
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', id)
          .not('millwork->>demoSeed', 'is', null),
      ]);

      console.log(
        `  ${label}: товаров ${items ?? 0}, демо-объектов ${demos ?? 0}` +
          `${(items ?? 0) === 0 || (demos ?? 0) === 0 ? '  → будет заполнено' : '  → уже заполнено'}`,
      );
      continue;
    }

    const result = await seedOrg(service, id);

    const parts: string[] = [];
    if (result.catalog.error) {
      parts.push(`каталог: ОШИБКА — ${result.catalog.error}`);
      failed++;
    } else {
      parts.push(
        `каталог: +${result.catalog.added} товаров, +${result.catalog.addedCategories} категорий` +
          `${result.catalog.skipped ? `, пропущено ${result.catalog.skipped}` : ''}`,
      );
      if (result.catalog.added > 0) seededCatalog++;
    }

    if (result.demo.error) {
      parts.push(`демо: ОШИБКА — ${result.demo.error}`);
      failed++;
    } else if (result.demo.created) {
      parts.push(`демо: создан, смета ${Math.round(result.demo.total ?? 0)} ₸`);
      seededDemo++;
    } else {
      parts.push('демо: уже есть');
    }

    console.log(`  ${label}\n      ${parts.join('\n      ')}`);
  }

  if (!apply) {
    console.log('\nЗапись не выполнялась. Повторите с --apply.\n');
    return;
  }

  console.log(
    `\nГотово: каталог заполнен у ${seededCatalog}, демо-объектов создано ${seededDemo}` +
      `${failed ? `, ошибок ${failed}` : ''}.\n`,
  );

  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
