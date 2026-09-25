import { NextResponse } from 'next/server';
import catalogFile from '@/data/catalog/catalog.json';
import { ensureCategories } from '@/lib/catalog';
import {
  collectionCategory,
  collectionCategoryKey,
  collectionOf,
  materialDefs,
  parseMaterialFile,
  planMaterialImport,
  type MaterialFile,
} from '@/lib/millwork/materialCatalog';
import { supabaseServer } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * КАТАЛОГ МАТЕРИАЛОВ ИЗ `data/catalog/catalog.json`.
 *
 * GET — коллекции и поверхности, всё, что нужно панели, без 1825 строк
 * RAL. `?items=1` — вместе с позициями: так их получает демонстрация, у
 * которой нет базы и каталог живёт во вкладке.
 *
 * POST — загрузить файл в каталог организации. Повторная загрузка не
 * добавляет ни строки: ключ позиции — коллекция + код, и уже лежащие
 * позиции не перезаписываются — после загрузки они принадлежат компании.
 */

function readFile(): MaterialFile | NextResponse {
  try {
    return parseMaterialFile(catalogFile);
  } catch (error) {
    /* Файл не читается — называем место в файле, а не падаем стеком. */
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'catalog.json не читается' },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const file = readFile();
  if (file instanceof NextResponse) return file;
  const withItems = new URL(request.url).searchParams.get('items') === '1';
  return NextResponse.json(withItems ? file : materialDefs(file));
}

/** Артикулы организации с коллекцией — страницами: PostgREST режет по 1000. */
async function existingArticles(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ rows: { article: string; collection: string | null }[]; error: string | null }> {
  const PAGE = 1000;
  const rows: { article: string; collection: string | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('catalog_items')
      .select('article, catalog_categories(key)')
      .eq('org_id', orgId)
      .order('article')
      .range(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    for (const row of (data ?? []) as unknown as {
      article: string;
      catalog_categories: { key: string } | null;
    }[]) {
      rows.push({ article: String(row.article), collection: collectionOf({ category: row.catalog_categories }) });
    }
    if (!data || data.length < PAGE) break;
  }
  return { rows, error: null };
}

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
  if (!orgId) return NextResponse.json({ error: 'Нужен orgId.' }, { status: 400 });

  const file = readFile();
  if (file instanceof NextResponse) return file;

  /* Клиентом пользователя: RLS сама не даст записать в чужую организацию. */
  const existing = await existingArticles(supabase, orgId);
  if (existing.error) {
    return NextResponse.json({ error: `Нет доступа к каталогу: ${existing.error}` }, { status: 500 });
  }

  const plan = planMaterialImport(file, existing.rows);

  /* Категории — только тем коллекциям, чьи позиции сейчас ложатся. */
  const needed = file.collections.filter((collection) =>
    plan.rows.some((row) => row.collectionId === collection.id),
  );
  const categories = await ensureCategories(supabase, orgId, needed.map(collectionCategory));
  if (categories.error) {
    return NextResponse.json({ error: `Не удалось завести категории: ${categories.error}` }, { status: 500 });
  }

  /* Товар без категории не вставляется НИКОГДА (ловушка 45): сказать до записи. */
  const homeless = needed.find((collection) => !categories.byKey.has(collectionCategoryKey(collection.id)));
  if (homeless) {
    return NextResponse.json(
      { error: `Категория коллекции «${homeless.label}» не завелась — её позициям некуда лечь.` },
      { status: 500 },
    );
  }

  let added = 0;
  const CHUNK = 500;
  for (let at = 0; at < plan.rows.length; at += CHUNK) {
    const payload = plan.rows.slice(at, at + CHUNK).map((row) => {
      return {
        org_id: orgId,
        category_id: categories.byKey.get(collectionCategoryKey(row.collectionId)),
        article: row.article,
        name_ru: row.name_ru,
        name_kk: row.name_kk,
        price: row.price,
        unit: row.unit,
        tiling: row.tiling,
        meta: row.meta,
        is_active: true,
      };
    });

    const { data, error } = await supabase.from('catalog_items').insert(payload).select('id');
    if (error) {
      /* Часть уже легла — говорим, сколько, чтобы повтор знал, откуда продолжать. */
      return NextResponse.json(
        {
          error: `Загружено ${added} из ${plan.rows.length}, дальше не записалось: ${error.message}`,
          added,
        },
        { status: 500 },
      );
    }
    added += data?.length ?? 0;
  }

  return NextResponse.json({
    ok: true,
    added,
    skipped: plan.skipped,
    conflicts: plan.conflicts,
    byCollection: plan.byCollection,
  });
}
