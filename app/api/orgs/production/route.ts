import { NextResponse } from 'next/server';
import { productionSettings } from '@/types/catalog';
import { currentOrg, supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Настройки цеха. Правит владелец или менеджер: от этих чисел зависит
 * раскрой, а не оформление.
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
      { error: 'Настройки цеха правит владелец или менеджер.' },
      { status: 403 },
    );
  }

  let body: { production?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    /* пустое тело — вернутся значения по умолчанию */
  }

  // Разбираем тем же кодом, что и чтение: в базу попадает только то,
  // что расчёт деталей умеет применить.
  const production = productionSettings(body.production);

  const { error } = await supabase
    .from('orgs')
    .update({ production })
    .eq('id', org.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, production });
}
