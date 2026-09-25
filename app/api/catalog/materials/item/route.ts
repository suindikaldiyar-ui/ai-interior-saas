import { NextResponse } from 'next/server';
import catalogFile from '@/data/catalog/catalog.json';
import { ensureCategories } from '@/lib/catalog';
import {
  collectionCategory,
  collectionCategoryKey,
  manualMaterialRow,
  materialDefs,
  parseMaterialFile,
  type ManualMaterialInput,
} from '@/lib/millwork/materialCatalog';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * СВОЯ ПОЗИЦИЯ В ЛЮБУЮ КОЛЛЕКЦИЮ.
 *
 * Пакеты EGGER, Grandex и КЕДР ещё не пришли, а клиент уже выбирает: его
 * декор заводится руками — код, название, цвет или фото с настоящим
 * размером, цена. Строка та же, что у загрузки файла
 * (`manualMaterialRow`): у своей позиции нет своих правил.
 *
 * Фото уходит следующим запросом в `/api/catalog/upload` — одна дверь для
 * файлов каталога на весь продукт.
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

  let body: ManualMaterialInput & { orgId?: string; collectionId?: string };
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'catalog.json не читается' },
      { status: 500 },
    );
  }

  const collection = defs.collections.find((c) => c.id === body.collectionId);
  if (!collection) {
    return NextResponse.json(
      { error: `Коллекции «${String(body.collectionId)}» нет в каталоге материалов.` },
      { status: 400 },
    );
  }

  let row;
  try {
    row = manualMaterialRow(collection, {
      code: String(body.code ?? ''),
      name: String(body.name ?? ''),
      hex: body.hex ?? null,
      price: body.price ?? null,
      finishPrices: body.finishPrices ?? null,
      photoSizeMm: body.photoSizeMm ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Позиция не собралась.' },
      { status: 400 },
    );
  }

  /*
   * Код занят — отказ словами ДО записи: артикул в каталоге организации
   * один, и вторая строка с ним упала бы на уникальном ключе базы.
   */
  const { data: taken, error: takenError } = await supabase
    .from('catalog_items')
    .select('id')
    .eq('org_id', orgId)
    .eq('article', row.article)
    .limit(1);
  if (takenError) {
    return NextResponse.json({ error: `Нет доступа к каталогу: ${takenError.message}` }, { status: 500 });
  }
  if ((taken ?? []).length > 0) {
    return NextResponse.json(
      { error: `Код «${row.article}» уже есть в каталоге — возьмите другой.` },
      { status: 409 },
    );
  }

  const categories = await ensureCategories(supabase, orgId, [collectionCategory(collection)]);
  const categoryId = categories.byKey.get(collectionCategoryKey(collection.id));
  if (categories.error || !categoryId) {
    return NextResponse.json(
      { error: `Категория коллекции «${collection.label}» не завелась: ${categories.error ?? 'нет строки'}` },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from('catalog_items')
    .insert({
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
    })
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: `Позиция не записалась: ${error?.message ?? 'нет данных'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: data.id });
}
