import { NextResponse } from 'next/server';
import { ensureCategories } from '@/lib/catalog';
import { TYPICAL_CATEGORIES } from '@/lib/millwork/rates';
import { KIRA_CATALOG, KIRA_CATEGORIES, KIRA_EXCLUDED, planKiraImport, type KiraExistingRow } from '@/lib/millwork/kiraCatalog';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * МОДЕЛИ МДФ-ФАСАДОВ KIRA В КАТАЛОГ ОРГАНИЗАЦИИ (слой 58).
 *
 * POST `{ orgId, dryRun: true }` — что ляжет: по категориям сайта, новые,
 * обновляемые, без изменений и конфликты. POST `{ orgId, confirm: true }` —
 * запись: только после показа, случайный запрос мимо экрана ничего не
 * пишет (ловушка 133). Повторный импорт не добавляет ни строки: ключ —
 * артикул «KIRA-<код>»; у своей строки обновляются только происхождение и
 * рисунок, цену, название и прочее компании импорт не трогает; ничего не
 * удаляет. Пишет клиент пользователя — RLS не даст тронуть чужую организацию.
 */

/** Строки организации с артикулом «KIRA-…» — страницами: PostgREST режет по 1000. */
async function existingKira(
  supabase: NonNullable<ReturnType<typeof supabaseServer>>,
  orgId: string,
): Promise<{ rows: KiraExistingRow[]; error: string | null }> {
  const PAGE = 1000;
  const rows: KiraExistingRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('catalog_items')
      .select('id, article, meta')
      .eq('org_id', orgId)
      .like('article', 'KIRA-%')
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

  let body: { orgId?: string; dryRun?: boolean; confirm?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать запрос.' }, { status: 400 });
  }
  const orgId = String(body.orgId ?? '');
  if (!orgId) return NextResponse.json({ error: 'Нужен orgId.' }, { status: 400 });

  /*
   * Каталог чужой организации — отказ словами ДО чтения и записи. RLS и так
   * не даст ничего записать, но говорит он строкой Postgres, а не причиной.
   */
  const { data: member, error: memberError } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .limit(1);
  if (memberError) return NextResponse.json({ error: `Нет доступа к каталогу: ${memberError.message}` }, { status: 500 });
  if (!member?.length) return NextResponse.json({ error: 'Это каталог другой организации: в него модели KIRA не загружаются.' }, { status: 403 });

  const existing = await existingKira(supabase, orgId);
  if (existing.error) return NextResponse.json({ error: `Нет доступа к каталогу: ${existing.error}` }, { status: 500 });

  const plan = planKiraImport(existing.rows);
  const summary = {
    models: KIRA_CATALOG.length,
    categories: KIRA_CATEGORIES.map((category) => ({ key: category.key, title: category.title, listed: category.listed })),
    excluded: KIRA_EXCLUDED,
    byCategory: plan.byCategory,
    insert: plan.insert.length,
    update: plan.update.length,
    unchanged: plan.unchanged.length,
    conflicts: plan.conflicts,
  };

  if (body.dryRun) return NextResponse.json({ ok: true, dryRun: true, orgId, ...summary });
  if (body.confirm !== true) {
    return NextResponse.json(
      { error: 'Модели KIRA записываются только после показа того, что ляжет: сначала «Показать», потом «Загрузить».' },
      { status: 409 },
    );
  }

  /* Товар без категории не вставляется никогда (ловушка 45): категория «Материалы» — та же, что у фрезеровок. */
  const wanted = TYPICAL_CATEGORIES.filter((category) => category.key === 'materials');
  const categories = await ensureCategories(supabase, orgId, wanted);
  if (categories.error) return NextResponse.json({ error: `Не удалось завести категорию: ${categories.error}` }, { status: 500 });
  const categoryId = categories.byKey.get('materials');
  if (!categoryId) return NextResponse.json({ error: 'Категория «Материалы» не завелась — моделям некуда лечь.' }, { status: 500 });

  let added = 0;
  if (plan.insert.length > 0) {
    const payload = plan.insert.map((row) => ({
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
      return NextResponse.json({ error: `Модели не записались: ${error.message}. Повтор начнёт с того же места.`, added: 0 }, { status: 500 });
    }
    added = data?.length ?? 0;
  }

  let updated = 0;
  for (const row of plan.update) {
    const { error } = await supabase.from('catalog_items').update({ meta: row.meta }).eq('id', row.id).eq('org_id', orgId);
    if (error) {
      /* Часть уже легла — говорим, сколько: повтор найдёт обновлённые среди «без изменений». */
      return NextResponse.json(
        { error: `Добавлено ${added}, обновлено ${updated} из ${plan.update.length}, дальше не записалось: ${error.message}`, added, updated },
        { status: 500 },
      );
    }
    updated += 1;
  }

  return NextResponse.json({ ok: true, orgId, ...summary, added, updated });
}
