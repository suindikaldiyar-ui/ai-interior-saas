import { NextResponse } from 'next/server';
import { PLANS_BUCKET } from '@/lib/complexes';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Схема планировки.
 *
 * ЧЕРТЁЖ ЗАСТРОЙЩИКА СЮДА НЕ ГРУЗЯТ. Схема должна быть своя: построенная
 * из своего замера или нарисованная заново. Название ЖК и тип квартиры —
 * факты, их называть можно; чужую графику брать нельзя.
 *
 * Файл приходит уже сжатым с клиента — по той же причине, что и снимок
 * помещения: мегабайты с планшета едут по мобильному интернету.
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

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const planId = String(form?.get('planId') ?? '');

  if (!planId || !(file instanceof File)) {
    return NextResponse.json({ error: 'Нужны planId и файл.' }, { status: 400 });
  }

  // Чужая планировка не найдётся: RLS уже применена к этому запросу.
  const { data: plan } = await supabase
    .from('floor_plans')
    .select('id, complex_id, complexes!inner(id, org_id)')
    .eq('id', planId)
    .maybeSingle();

  if (!plan) return NextResponse.json({ error: 'Планировка не найдена.' }, { status: 404 });

  const orgId = (plan as unknown as { complexes: { org_id: string } }).complexes.org_id;
  // Первый сегмент пути — org_id: по нему работает политика Storage.
  const path = `${orgId}/${plan.complex_id}/${planId}-${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(PLANS_BUCKET)
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: `Схема не загрузилась: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { error } = await supabase
    .from('floor_plans')
    .update({ scheme_path: path })
    .eq('id', planId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, path });
}
