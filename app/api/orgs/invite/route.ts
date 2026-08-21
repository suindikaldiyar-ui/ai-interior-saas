import { NextResponse } from 'next/server';
import { ORG_ROLES, normalizeEmail, type OrgRole } from '@/lib/invites';
import { currentOrg, supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Пригласить сотрудника по почте. Роли раздают владелец и менеджер. */
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
      { error: 'Приглашать может владелец или менеджер.' },
      { status: 403 },
    );
  }

  let body: { email?: string; role?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* пустое тело — отсеется по адресу */
  }

  const email = normalizeEmail(body.email ?? '');
  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Нужен адрес почты.' }, { status: 400 });
  }

  const role = (ORG_ROLES as readonly string[]).includes(body.role ?? '')
    ? (body.role as OrgRole)
    : 'surveyor';

  // Владельца назначает только владелец: менеджер не поднимает себе ровню.
  if (role === 'owner' && org.role !== 'owner') {
    return NextResponse.json({ error: 'Роль владельца назначает владелец.' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('org_invites')
    .upsert(
      { org_id: org.id, email, role, invited_by: user.id, accepted_at: null },
      { onConflict: 'org_id,email' },
    )
    .select('id, email, role, accepted_at, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, invite: data });
}

/** Отозвать приглашение. */
export async function DELETE(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Нужен id.' }, { status: 400 });

  // RLS отсечёт чужое приглашение: строка просто не найдётся.
  const { error } = await supabase.from('org_invites').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
