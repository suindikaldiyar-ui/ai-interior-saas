import { NextResponse } from 'next/server';
import { supabaseServer, supabaseService } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Первая организация для нового пользователя.
 *
 * Идёт через сервисный ключ: политика orgs разрешает вставку только своим
 * участникам, а участников у только что созданной организации ещё нет —
 * без обхода RLS запись невозможна в принципе.
 */
export async function POST(request: Request) {
  const supabase = supabaseServer();
  const service = supabaseService();

  if (!supabase || !service) {
    return NextResponse.json(
      { error: 'Supabase не настроен (нужен и SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });
  }

  const existing = await service
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1);

  if (existing.data && existing.data.length > 0) {
    return NextResponse.json({ ok: true, orgId: existing.data[0].org_id });
  }

  let body: { name?: string; slug?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* пустое тело — подставим значения по умолчанию */
  }

  const name = (body.name ?? '').trim() || 'Моя компания';
  const slug =
    (body.slug ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || `org-${user.id.slice(0, 8)}`;

  const { data: org, error: orgError } = await service
    .from('orgs')
    .insert({ name, slug })
    .select('id')
    .single();

  if (orgError || !org) {
    return NextResponse.json(
      { error: `Не удалось создать организацию: ${orgError?.message ?? 'нет данных'}` },
      { status: 500 },
    );
  }

  const { error: memberError } = await service
    .from('org_members')
    .insert({ org_id: org.id, user_id: user.id, role: 'owner' });

  if (memberError) {
    return NextResponse.json(
      { error: `Организация создана, но участник не добавлен: ${memberError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, orgId: org.id });
}
