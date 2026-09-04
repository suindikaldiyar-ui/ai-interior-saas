import { NextResponse } from 'next/server';
import { seedTypicalCatalog } from '@/lib/catalog';
import { TYPICAL_PRICE_LIST } from '@/lib/millwork/rates';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Типовой прайс по кнопке.
 *
 * Тот же путь, что при создании организации (`seedTypicalCatalog`): две
 * копии этой логики разъехались бы на первой правке прайса, и компания
 * получала бы разный каталог в зависимости от того, как она пришла.
 *
 * Здесь идём КЛИЕНТОМ ПОЛЬЗОВАТЕЛЯ: RLS сама не даст записать в чужую
 * организацию, и обходить её ради удобства незачем.
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

  let body: { orgId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать запрос.' }, { status: 400 });
  }

  const orgId = String(body.orgId ?? '');
  if (!orgId) {
    return NextResponse.json({ error: 'Нужен orgId.' }, { status: 400 });
  }

  const result = await seedTypicalCatalog(supabase, orgId);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    added: result.added,
    addedCategories: result.addedCategories,
    skipped: result.skipped,
    total: TYPICAL_PRICE_LIST.length,
  });
}
