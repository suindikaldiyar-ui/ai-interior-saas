import { NextResponse } from 'next/server';
import { decodeCsvBuffer, normalizeUnit, parseCatalogCsv } from '@/lib/csv';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать форму.' }, { status: 400 });
  }

  const orgId = String(form.get('orgId') ?? '');
  const file = form.get('file');

  if (!orgId || !(file instanceof File)) {
    return NextResponse.json({ error: 'Нужны orgId и файл.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Файл больше 8 МБ.' }, { status: 400 });
  }

  const text = decodeCsvBuffer(new Uint8Array(await file.arrayBuffer()));
  const parsed = parseCatalogCsv(text);

  if (parsed.rows.length === 0) {
    return NextResponse.json(
      {
        error: 'Не удалось разобрать файл.',
        errors: parsed.errors,
        headers: parsed.headers,
      },
      { status: 400 },
    );
  }

  // Категории должны существовать: applies_to определяет поведение товара
  // в сцене, угадывать его по выгрузке нельзя.
  const { data: categories, error: catError } = await supabase
    .from('catalog_categories')
    .select('id, key, unit')
    .eq('org_id', orgId);

  if (catError) {
    return NextResponse.json(
      { error: `Нет доступа к каталогу: ${catError.message}` },
      { status: 403 },
    );
  }

  const byKey = new Map((categories ?? []).map((c) => [c.key, c]));
  const errors = [...parsed.errors];
  const unknownKeys = new Set<string>();

  const payload = parsed.rows.flatMap((row) => {
    const category = byKey.get(row.category_key);
    if (!category) {
      unknownKeys.add(row.category_key);
      return [];
    }
    return [
      {
        org_id: orgId,
        category_id: category.id,
        article: row.article,
        name_ru: row.name,
        price: row.price,
        unit: row.unit ? normalizeUnit(row.unit) : category.unit,
        is_active: true,
      },
    ];
  });

  if (unknownKeys.size > 0) {
    errors.push(
      `Неизвестные категории: ${Array.from(unknownKeys).join(', ')}. Заведите их в каталоге и повторите импорт — эти строки пропущены.`,
    );
  }

  let imported = 0;
  if (payload.length > 0) {
    // Повторный импорт той же выгрузки обновляет цены, а не плодит дубли.
    const { data, error } = await supabase
      .from('catalog_items')
      .upsert(payload, { onConflict: 'org_id,article' })
      .select('id');

    if (error) {
      return NextResponse.json(
        { error: `Импорт не удался: ${error.message}`, errors },
        { status: 500 },
      );
    }
    imported = data?.length ?? 0;
  }

  return NextResponse.json({
    ok: true,
    imported,
    skipped: parsed.rows.length - imported,
    errors,
  });
}
