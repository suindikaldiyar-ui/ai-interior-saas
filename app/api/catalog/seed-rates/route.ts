import { NextResponse } from 'next/server';
import { ensureCategories } from '@/lib/catalog';
import { TYPICAL_CATEGORIES, TYPICAL_PRICE_LIST, orphanTypicalRates } from '@/lib/millwork/rates';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Типовой прайс для быстрого старта.
 *
 * Это ОРИЕНТИР, а не цены компании — интерфейс говорит об этом прямо.
 * Смысл в том, чтобы новый пользователь увидел работающую смету в первый
 * визит, а не упёрся в пустой каталог.
 *
 * Порядок здесь обязателен: СНАЧАЛА КАТЕГОРИИ, ПОТОМ ТОВАРЫ. `category_id`
 * объявлен NOT NULL, и на пустом каталоге загрузка падала целиком —
 * четыре категории зон (шкаф-купе, прихожая, ТВ-зона, санузел) в прайсе
 * были, а в списке категорий их не завели.
 *
 * Ни существующие категории, ни существующие артикулы не трогаем: если
 * компания уже завела свою цену или свою категорию, она главнее любого
 * среднего значения.
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

  /*
   * Прайс уехал вперёд категорий — это наша ошибка, а не пользователя.
   * Говорим прямо, вместо того чтобы уронить вставку на NOT NULL.
   */
  const orphans = orphanTypicalRates();
  if (orphans.length > 0) {
    return NextResponse.json(
      {
        error:
          `В типовом прайсе ${orphans.length} позиций без категории: ` +
          `${Array.from(new Set(orphans.map((r) => r.categoryKey))).join(', ')}. ` +
          'Это ошибка прайса, а не каталога.',
      },
      { status: 500 },
    );
  }

  // RLS сама не даст записать в чужую организацию.
  const categories = await ensureCategories(supabase, orgId, TYPICAL_CATEGORIES);
  if (categories.error) {
    return NextResponse.json(
      { error: `Не удалось завести категории: ${categories.error}` },
      { status: 403 },
    );
  }

  const { data: existing, error: itemsError } = await supabase
    .from('catalog_items')
    .select('article')
    .eq('org_id', orgId);

  if (itemsError) {
    return NextResponse.json(
      { error: `Нет доступа к каталогу: ${itemsError.message}` },
      { status: 403 },
    );
  }

  const known = new Set((existing ?? []).map((i) => i.article));

  /*
   * Товар без найденной категории не вставляем НИКОГДА: строка с пустым
   * `category_id` роняет весь батч, и пользователь остаётся вообще без
   * прайса — ровно то, с чего началась эта поломка.
   */
  const payload = TYPICAL_PRICE_LIST.filter((r) => !known.has(r.article)).flatMap((r) => {
    const categoryId = categories.byKey.get(r.categoryKey);
    if (!categoryId) return [];

    return [
      {
        org_id: orgId,
        category_id: categoryId,
        article: r.article,
        name_ru: r.name,
        price: r.price,
        unit: r.unit,
        meta: { estimateKey: r.estimateKey, typical: true },
        is_active: true,
      },
    ];
  });

  if (payload.length === 0) {
    return NextResponse.json({
      ok: true,
      added: 0,
      addedCategories: categories.created,
      skipped: TYPICAL_PRICE_LIST.length,
    });
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
    addedCategories: categories.created,
    skipped: TYPICAL_PRICE_LIST.length - payload.length,
  });
}
