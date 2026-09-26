import { NextResponse } from 'next/server';
import catalogFile from '@/data/catalog/catalog.json';
import { ensureCategories } from '@/lib/catalog';
import {
  collectionCategory,
  collectionCategoryKey,
  collectionPriceRow,
  materialDefs,
  parseMaterialFile,
} from '@/lib/millwork/materialCatalog';
import { MATERIAL_FINISHES } from '@/lib/millwork/materialFinishes';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ЦЕНА КОЛЛЕКЦИИ НА ПОВЕРХНОСТЬ (слой 52).
 *
 * 1825 цветов RAL по одному не заведёт никто: цена ставится у коллекции —
 * «эмаль RAL матовая — за м²». Хранится она строкой того же
 * `catalog_items` со ставкой (`meta.estimateKey`), в категории своей
 * коллекции: второго места под цены нет, и её читает тот же
 * `ratesFromCatalog`, что остальные ставки. Позиция со своей ценой
 * сильнее — это решает `materialPrice`, а не этот роут.
 *
 * Тело: `{ orgId, collectionId, prices: { <поверхность>: число | null } }`.
 * `null` — «цена не задана»: колонка NOT NULL хранит его нулём.
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

  let body: { orgId?: string; collectionId?: string; prices?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать запрос.' }, { status: 400 });
  }

  const orgId = String(body.orgId ?? '');
  if (!orgId) return NextResponse.json({ error: 'Нужен orgId.' }, { status: 400 });

  let defs;
  try {
    defs = materialDefs(parseMaterialFile(catalogFile));
  } catch (error) {
    console.error('[цена коллекции] catalog.json не читается:', error);
    return NextResponse.json({ error: 'Каталог материалов не читается.' }, { status: 500 });
  }

  const collection = defs.collections.find((c) => c.id === body.collectionId);
  if (!collection) {
    return NextResponse.json(
      { error: `Коллекции «${String(body.collectionId)}» нет в каталоге материалов.` },
      { status: 400 },
    );
  }

  /*
   * Поверхность — только своя: цена «глянца» у коллекции без глянца
   * ни на что бы не легла, а записанная — выглядела бы действующей.
   */
  const prices = body.prices ?? {};
  const entries = Object.entries(prices);
  if (entries.length === 0) {
    return NextResponse.json({ error: 'Нет ни одной цены.' }, { status: 400 });
  }
  const rows = [];
  for (const [surface, raw] of entries) {
    if (!collection.finishes.includes(surface)) {
      return NextResponse.json(
        { error: `У коллекции «${collection.label}» нет поверхности «${surface}».` },
        { status: 400 },
      );
    }
    const price = raw === null || raw === '' ? null : Number(raw);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      return NextResponse.json(
        { error: `Цена — число от нуля. Для «${MATERIAL_FINISHES[surface]?.label ?? surface}» пришло «${String(raw)}».` },
        { status: 400 },
      );
    }
    rows.push(collectionPriceRow(collection, surface, price ?? 0, MATERIAL_FINISHES[surface]?.label ?? surface));
  }

  const categories = await ensureCategories(supabase, orgId, [collectionCategory(collection)]);
  const categoryId = categories.byKey.get(collectionCategoryKey(collection.id));
  if (categories.error || !categoryId) {
    console.error('[цена коллекции] категория не завелась:', categories.error ?? 'нет строки');
    return NextResponse.json(
      { error: `Категория коллекции «${collection.label}» не завелась — цене некуда лечь.` },
      { status: 500 },
    );
  }

  /*
   * Одна строка на пару «коллекция + поверхность»: артикул выводится из
   * них, и повторный ввод цены правит ту же строку, а не заводит вторую.
   * Клиентом пользователя: RLS не даст записать в чужую организацию.
   */
  const { error } = await supabase.from('catalog_items').upsert(
    rows.map((row) => ({
      org_id: orgId,
      category_id: categoryId,
      article: row.article,
      name_ru: row.name_ru,
      name_kk: row.name_kk,
      price: row.price,
      unit: row.unit,
      tiling: row.tiling,
      meta: row.meta,
      is_active: true,
    })),
    { onConflict: 'org_id,article' },
  );

  if (error) {
    console.error('[цена коллекции] запись не легла:', error.message);
    return NextResponse.json({ error: 'Цена коллекции не сохранилась. Повторите.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, saved: rows.map((row) => row.article) });
}
