import { NextResponse } from 'next/server';
import { CATALOG_BUCKET, storageUrl } from '@/lib/supabase/config';
import { currentOrg, supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Брендирование организации: название, логотип, акцентный цвет, слаг.
 *
 * СЛАГ НЕ ЕДЕТ ЗА НАЗВАНИЕМ. Это главная ловушка этого роута: компания
 * переименовалась, а по адресу `/demo/<slug>` ей уже ушла ссылка письмом.
 * Пересчитай слаг из имени — и живая ссылка отдаст 404 у человека, который
 * как раз собрался смотреть. Поэтому имя и слаг здесь два независимых поля,
 * и слаг меняется ТОЛЬКО когда его прислали явно и осознанно.
 *
 * Форма, а не JSON: вместе с полями приезжает файл логотипа.
 */
export async function POST(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const org = await currentOrg();
  if (!org) return NextResponse.json({ error: 'Нет организации.' }, { status: 400 });
  if (org.role !== 'owner' && org.role !== 'manager') {
    return NextResponse.json(
      { error: 'Брендирование правит владелец или менеджер.' },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать форму.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  const name = String(form.get('name') ?? '').trim();
  if (name) patch.name = name;

  const accent = String(form.get('accent_color') ?? '').trim();
  if (accent) {
    if (!HEX.test(accent)) {
      return NextResponse.json(
        { error: 'Акцентный цвет — шестнадцатеричный, вида #C08B3E.' },
        { status: 400 },
      );
    }
    patch.accent_color = accent;
  }

  /*
   * Слаг принимается ТОЛЬКО когда поле прислано и отличается от текущего.
   * Пустое поле — это «не трогать», а не «стереть»: адрес без слага не
   * существует, и молча обнулить его значит выключить демо-страницу.
   */
  const rawSlug = form.get('slug');
  if (rawSlug !== null) {
    const slug = String(rawSlug)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (slug && slug !== org.slug) {
      if (slug.length < 2) {
        return NextResponse.json({ error: 'Слаг короче двух символов.' }, { status: 400 });
      }
      patch.slug = slug;
    }
  }

  const file = form.get('logo');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_LOGO_BYTES) {
      return NextResponse.json({ error: 'Логотип тяжелее 2 МБ.' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Логотип должен быть картинкой.' }, { status: 400 });
    }

    /*
     * Первым сегментом пути — id организации: на нём стоит политика записи
     * в Storage (`is_org_member` от первой папки). Чужую папку не тронуть
     * даже подделанным запросом.
     */
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const path = `${org.id}/brand/logo-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(CATALOG_BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Логотип не загрузился: ${uploadError.message}` },
        { status: 500 },
      );
    }

    patch.logo_url = storageUrl(CATALOG_BUCKET, path);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, changed: [] });
  }

  const { data, error } = await supabase
    .from('orgs')
    .update(patch)
    .eq('id', org.id)
    .select('slug, name, logo_url, accent_color')
    .maybeSingle();

  if (error) {
    const taken = error.code === '23505';
    return NextResponse.json(
      { error: taken ? 'Такой слаг уже занят другой компанией.' : error.message },
      { status: taken ? 409 : 500 },
    );
  }

  return NextResponse.json({ ok: true, changed: Object.keys(patch), org: data });
}
