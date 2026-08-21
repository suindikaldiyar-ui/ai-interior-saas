import { NextResponse } from 'next/server';
import { parseOrgTemplates } from '@/lib/millwork/templates';
import { currentOrg, supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Типовые решения компании. Правит владелец или менеджер. */
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
      { error: 'Типовые решения правит владелец или менеджер.' },
      { status: 403 },
    );
  }

  let body: { templates?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    /* пустое тело — сохранится пустой список */
  }

  /*
   * Разбираем тем же кодом, что и чтение: в базу попадает только то,
   * что конфигуратор сумеет развернуть. Мусорный шаблон в списке хуже,
   * чем его отсутствие — замерщик выберет его при клиенте.
   */
  const clean = parseOrgTemplates(body.templates).map((t) => ({
    ...t,
    id: t.id.replace(/^org:/, ''),
  }));

  const { error } = await supabase
    .from('orgs')
    .update({ run_templates: clean })
    .eq('id', org.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, saved: clean.length });
}
