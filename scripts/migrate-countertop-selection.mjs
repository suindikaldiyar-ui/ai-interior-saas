/**
 * ПЕРЕНОС ПРЕЖНЕГО ВЫБОРА СТОЛЕШНИЦЫ НА РЯД (слой 52).
 *
 * Столешницу выбирали в двух местах: шаг «Материалы» писал её в
 * `selections['zone:countertop']`, панель каталога — операцией
 * `set_countertop` в `Run.countertopMaterial`. В смету шёл только ряд.
 * Остаётся один путь — ряд; этот скрипт переносит на ряд то, что было
 * выбрано прежним путём и сохранено в объекте.
 *
 * Запуск:
 *   node scripts/migrate-countertop-selection.mjs          — пробный: только считает
 *   node scripts/migrate-countertop-selection.mjs --apply  — переносит
 *
 * Что считается:
 *   — объекты, у которых в `projects.selections` есть `zone:countertop`;
 *   — из них объекты конфигуратора (есть `millwork.runs` или `wallRuns`):
 *     выбор ложится на КАЖДЫЙ сохранённый ряд без своей столешницы и
 *     снимается из `selections`;
 *   — объекты без сохранённого ряда: переносить некуда, называются;
 *   — выбор, указывающий на позицию, которой в каталоге организации нет:
 *     не переносится, называется.
 *
 * Молча не пропускается ничего: каждая строка попадает в один из списков.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const KEY = 'zone:countertop';

/* .env.local читаем сами: этот процесс не Next. */
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

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  console.log('НЕ ПРОВЕРЕНО: нет NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в .env.local');
  process.exit(1);
}

const service = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

/** Все объекты — страницами: PostgREST отдаёт не больше 1000 строк. */
async function allProjects() {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await service
      .from('projects')
      .select('id, org_id, address, selections, millwork')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`объекты не прочитались: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

const projects = await allProjects();
const withChoice = projects.filter((row) => {
  const value = row.selections?.[KEY];
  return typeof value === 'string' && value.trim() !== '';
});

const moved = [];
const noRun = [];
const missingItem = [];

for (const row of withChoice) {
  const itemId = String(row.selections[KEY]).trim();
  const millwork = row.millwork ?? {};
  const runs = Object.entries(millwork.runs ?? {});
  const wallRuns = Object.entries(millwork.wallRuns ?? {});

  if (runs.length === 0 && wallRuns.length === 0) {
    noRun.push(row);
    continue;
  }

  const { data: item, error } = await service
    .from('catalog_items')
    .select('id, article, name_ru')
    .eq('id', itemId)
    .eq('org_id', row.org_id)
    .maybeSingle();
  if (error) throw new Error(`позиция ${itemId} объекта ${row.id} не прочиталась: ${error.message}`);
  if (!item) {
    missingItem.push({ row, itemId });
    continue;
  }

  /* На ряд — только если у ряда своей столешницы нет: выбор панели сильнее. */
  let touched = 0;
  const put = (run) => {
    if (!run || run.countertopMaterial) return run;
    touched += 1;
    return { ...run, countertopMaterial: { itemId } };
  };
  const nextMillwork = {
    ...millwork,
    runs: Object.fromEntries(runs.map(([key, run]) => [key, put(run)])),
    ...(wallRuns.length > 0 ? { wallRuns: Object.fromEntries(wallRuns.map(([key, run]) => [key, put(run)])) } : {}),
  };
  const nextSelections = { ...row.selections };
  delete nextSelections[KEY];

  moved.push({ row, item, touched });

  if (APPLY) {
    const { error: writeError } = await service
      .from('projects')
      .update({ millwork: nextMillwork, selections: nextSelections })
      .eq('id', row.id);
    if (writeError) throw new Error(`объект ${row.id} не записался: ${writeError.message}`);
  }
}

console.log(`объектов всего: ${projects.length}`);
console.log(`с прежним выбором столешницы (selections['${KEY}']): ${withChoice.length}`);
console.log(`  ${APPLY ? 'перенесено' : 'будет перенесено'} на ряд: ${moved.length}`);
for (const { row, item, touched } of moved) {
  console.log(`    ${row.id} «${row.address ?? ''}»: ${item.article} «${item.name_ru}» → рядов ${touched}`);
}
console.log(`  без сохранённого ряда — переносить некуда: ${noRun.length}`);
for (const row of noRun) console.log(`    ${row.id} «${row.address ?? ''}»`);
console.log(`  позиции нет в каталоге организации — не переносится: ${missingItem.length}`);
for (const { row, itemId } of missingItem) console.log(`    ${row.id}: ${itemId}`);
if (!APPLY && moved.length > 0) console.log('\nпробный прогон: запишет только с --apply');
