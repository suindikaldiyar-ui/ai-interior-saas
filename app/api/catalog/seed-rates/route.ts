import { NextResponse } from 'next/server';
import { TYPICAL_CATEGORIES, TYPICAL_PRICE_LIST } from '@/lib/millwork/rates';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Типовой прайс для быстрого старта.
 *
 * Это ОРИЕНТИР, а не цены компании — интерфейс говорит об этом прямо.
 * Смысл в том, чтобы новый пользователь увидел работающую смету в первый
 * визит, а не упёрся в пустой каталог. Существующие товары не перезаписываем:
 * если компания уже завела свою цену, она главнее любого среднего значения.
 */
export async function POST(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });
  }

  let body: { orgId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать запрос.' }, { status: 400 });
  }

  const orgId = String(body.orgId ?? '');
  if (!orgId) {
    return NextResponse.json({ error: 'Нужен orgId.' }, { status: 400 });
  }

  // RLS сама не даст записать в чужую организацию.
  const { error: catError } = await supabase.from('catalog_categories').upsert(
    TYPICAL_CATEGORIES.map((c, i) => ({
      org_id: orgId,
      key: c.key,
      name_ru: c.name,
      applies_to: c.appliesTo,
      unit: c.unit,
      sort_order: i,
    })),
    { onConflict: 'org_id,key' },
  );

  if (catError) {
    return NextResponse.json(
      { error: `Не удалось завести категории: ${catError.message}` },
      { status: 403 },
    );
  }

  const { data: categories } = await supabase
    .from('catalog_categories')
    .select('id, key')
    .eq('org_id', orgId);

  const byKey = new Map((categories ?? []).map((c) => [c.key, c.id]));

  const { data: existing } = await supabase
    .from('catalog_items')
    .select('article')
    .eq('org_id', orgId);

  const known = new Set((existing ?? []).map((i) => i.article));

  const payload = TYPICAL_PRICE_LIST.filter((r) => !known.has(r.article)).map((r) => ({
    org_id: orgId,
    category_id: byKey.get(r.categoryKey),
    article: r.article,
    name_ru: r.name,
    price: r.price,
    unit: r.unit,
    meta: { estimateKey: r.estimateKey, typical: true },
    is_active: true,
  }));

  if (payload.length === 0) {
    return NextResponse.json({ ok: true, added: 0, skipped: TYPICAL_PRICE_LIST.length });
  }

  const { data, error } = await supabase.from('catalog_items').insert(payload).select('id');

  if (error) {
    return NextResponse.json(
      { error: `Не удалось загрузить прайс: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    added: data?.length ?? 0,
    skipped: TYPICAL_PRICE_LIST.length - payload.length,
  });
}
