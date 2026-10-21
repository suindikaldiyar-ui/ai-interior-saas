import { NextResponse } from 'next/server';
import { ensureCategories } from '@/lib/catalog';
import { TYPICAL_CATEGORIES } from '@/lib/millwork/rates';
import {
  HARDWARE_FACTS,
  HARDWARE_FACTS_CHECKED_AT,
  HARDWARE_NOT_FOUND,
  HARDWARE_SOURCES,
  MFR_ARTICLE_PREFIX,
  csvHardwareRows,
  planHardwareImport,
  uploadedFacts,
  type HardwareExistingRow,
} from '@/lib/millwork/hardwareCatalog';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Своя пачка CSV — текстом не больше 4 МБ: больше — частями, а не одним запросом на предел функции. */
const CSV_LIMIT = 4_000_000;

/**
 * ФУРНИТУРА ПРОИЗВОДИТЕЛЕЙ В КАТАЛОГ ОРГАНИЗАЦИИ (HARDWARE-01).
 *
 * POST `{ orgId, dryRun: true }` — что ляжет из фактов производителей
 * (`data/catalog/hardware.json`): по группам A–I и производителям, новые,
 * обновляемые, без изменений, конфликты. POST `{ orgId, confirm: true }` —
 * запись, только после показа: случайный запрос мимо экрана ничего не
 * пишет (ловушка 133). Своя пачка — `rows` (JSON: строки или записи фактов)
 * либо `csv` (текст файла, раскодированный на экране тем же `decodeCsvBuffer`,
 * что у прайса): те же записи и та же проверка, мусор отклоняется построчно.
 *
 * Ключ — артикул «MFR-<производитель>-<артикул>»: повтор не добавляет ни
 * строки. У своей строки обновляется только запись изделия
 * (`meta.hardware`); цена, название, активность и единица продажи,
 * указанная компанией, не трогаются; ничего не удаляется. Пишет клиент
 * пользователя — RLS не даст тронуть чужую организацию.
 */

/** Строки организации с артикулом «MFR-…» — страницами: PostgREST режет по 1000. */
async function existingHardware(
  supabase: NonNullable<ReturnType<typeof supabaseServer>>,
  orgId: string,
): Promise<{ rows: HardwareExistingRow[]; error: string | null }> {
  const PAGE = 1000;
  const rows: HardwareExistingRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('catalog_items')
      .select('id, article, meta')
      .eq('org_id', orgId)
      .like('article', `${MFR_ARTICLE_PREFIX}%`)
      .order('article')
      .range(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    for (const row of (data ?? []) as { id: string; article: string; meta: Record<string, unknown> | null }[]) {
      rows.push({ id: String(row.id), article: String(row.article), meta: row.meta ?? null });
    }
    if (!data || data.length < PAGE) break;
  }
  return { rows, error: null };
}

export async function POST(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  let body: { orgId?: string; dryRun?: boolean; confirm?: boolean; rows?: unknown; csv?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать запрос.' }, { status: 400 });
  }
  const orgId = String(body.orgId ?? '');
  if (!orgId) return NextResponse.json({ error: 'Нужен orgId.' }, { status: 400 });

  /* Каталог чужой организации — отказ словами ДО чтения и записи. */
  const { data: member, error: memberError } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .limit(1);
  if (memberError) return NextResponse.json({ error: `Нет доступа к каталогу: ${memberError.message}` }, { status: 500 });
  if (!member?.length) {
    return NextResponse.json({ error: 'Это каталог другой организации: в него фурнитура не загружается.' }, { status: 403 });
  }

  /* Своя пачка — те же записи: мусор отклоняется построчно, причины словами. */
  if (typeof body.csv === 'string' && body.csv.length > CSV_LIMIT) {
    return NextResponse.json({ error: `Файл больше ${CSV_LIMIT / 1_000_000} МБ текста — разделите его на части.` }, { status: 413 });
  }
  const upload =
    body.rows !== undefined
      ? uploadedFacts(body.rows)
      : typeof body.csv === 'string'
        ? uploadedFacts(csvHardwareRows(body.csv))
        : null;
  if (upload && upload.facts.length === 0 && upload.errors.length === 0) {
    return NextResponse.json({ error: 'В файле нет ни одной строки позиций: первая строка — заголовок колонок, дальше позиции.' }, { status: 400 });
  }
  const facts = upload ? upload.facts : HARDWARE_FACTS;

  const existing = await existingHardware(supabase, orgId);
  if (existing.error) return NextResponse.json({ error: `Нет доступа к каталогу: ${existing.error}` }, { status: 500 });

  const plan = planHardwareImport(existing.rows, facts);
  const errors = [...(upload?.errors ?? []), ...plan.errors];
  const summary = {
    source: upload ? 'upload' : 'facts',
    checkedAt: HARDWARE_FACTS_CHECKED_AT,
    sources: HARDWARE_SOURCES,
    notFound: HARDWARE_NOT_FOUND,
    items: facts.length,
    byGroup: plan.byGroup,
    byManufacturer: plan.byManufacturer,
    insert: plan.insert.length,
    update: plan.update.length,
    unchanged: plan.unchanged.length,
    conflicts: plan.conflicts,
    errors,
  };

  if (body.dryRun) return NextResponse.json({ ok: true, dryRun: true, orgId, ...summary });
  if (body.confirm !== true) {
    return NextResponse.json(
      { error: 'Фурнитура записывается только после показа того, что ляжет: сначала «Показать», потом «Загрузить».' },
      { status: 409 },
    );
  }

  /* Товар без категории не вставляется никогда (ловушка 45): категория «Фурнитура» типового прайса. */
  const wanted = TYPICAL_CATEGORIES.filter((category) => category.key === 'hardware');
  const categories = await ensureCategories(supabase, orgId, wanted);
  if (categories.error) return NextResponse.json({ error: `Не удалось завести категорию: ${categories.error}` }, { status: 500 });
  const categoryId = categories.byKey.get('hardware');
  if (!categoryId) return NextResponse.json({ error: 'Категория «Фурнитура» не завелась — позициям некуда лечь.' }, { status: 500 });

  let added = 0;
  const CHUNK = 200;
  for (let at = 0; at < plan.insert.length; at += CHUNK) {
    const payload = plan.insert.slice(at, at + CHUNK).map((row) => ({
      org_id: orgId,
      category_id: categoryId,
      article: row.article,
      name_ru: row.name_ru,
      name_kk: row.name_kk,
      price: row.price,
      unit: row.unit,
      meta: row.meta,
      is_active: true,
    }));
    const { data, error } = await supabase.from('catalog_items').insert(payload).select('id');
    if (error) {
      return NextResponse.json(
        { error: `Добавлено ${added} из ${plan.insert.length}, дальше не записалось: ${error.message}. Повтор начнёт с того же места.`, added },
        { status: 500 },
      );
    }
    added += data?.length ?? 0;
  }

  let updated = 0;
  for (const row of plan.update) {
    const { error } = await supabase.from('catalog_items').update({ meta: row.meta }).eq('id', row.id).eq('org_id', orgId);
    if (error) {
      return NextResponse.json(
        { error: `Добавлено ${added}, обновлено ${updated} из ${plan.update.length}, дальше не записалось: ${error.message}`, added, updated },
        { status: 500 },
      );
    }
    updated += 1;
  }

  return NextResponse.json({ ok: true, orgId, ...summary, added, updated });
}
