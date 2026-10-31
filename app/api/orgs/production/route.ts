import { NextResponse } from 'next/server';
import { cuttingSettings, drillingSettings, productionSettings } from '@/types/catalog';
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

  let body: { production?: unknown; cutting?: unknown; drilling?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    /* пустое тело — вернутся значения по умолчанию */
  }

  /*
   * ТОЛЬКО РАСКРОЙ (CUT-01): карта раскроя присылает свои настройки, и
   * остальное у цеха не трогается — читается из базы и пишется обратно
   * как было. Экран объекта несёт отметки объекта поверх цеховых, и отдай
   * он весь набор, отметки одного объекта стали бы школой всего цеха.
   */
  /*
   * ТОЛЬКО ПРИСАДКА (HW-08) — так же: экран «Присадка» присылает правила
   * присадки цеха, остальное читается из базы и пишется как было.
   */
  if (body.production === undefined && (body.cutting !== undefined || body.drilling !== undefined)) {
    const { data, error: readError } = await supabase.from('orgs').select('production').eq('id', org.id).maybeSingle();
    if (readError) return NextResponse.json({ error: `Настройки цеха не прочитались: ${readError.message}` }, { status: 500 });
    const stored = (data?.production ?? {}) as Record<string, unknown>;
    const production = productionSettings({
      ...stored,
      ...(body.cutting !== undefined ? { cutting: cuttingSettings(body.cutting) } : {}),
      ...(body.drilling !== undefined ? { drilling: drillingSettings(body.drilling) } : {}),
    });
    const { error } = await supabase.from('orgs').update({ production }).eq('id', org.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, production });
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
