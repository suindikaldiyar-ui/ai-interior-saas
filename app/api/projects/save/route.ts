import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import type { MillworkState, ProjectStatus } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SaveRequest = {
  projectId: string;
  millwork?: MillworkState;
  total?: number;
  status?: ProjectStatus;
};

/**
 * Автосохранение состояния конфигуратора.
 *
 * Сохраняем результат целиком, а не параметры для пересчёта: объект обязан
 * открыться ровно таким, каким его закрыли. Пересчёт по изменившемуся
 * каталогу дал бы другую сумму, и подписанный документ разошёлся бы с тем,
 * что видел клиент.
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

  let body: SaveRequest;
  try {
    body = (await request.json()) as SaveRequest;
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать запрос.' }, { status: 400 });
  }

  if (!body?.projectId) {
    return NextResponse.json({ error: 'Нужен projectId.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.millwork) patch.millwork = { ...body.millwork, savedAt: new Date().toISOString() };
  if (typeof body.total === 'number') patch.total = body.total;
  if (body.status) patch.status = body.status;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, savedAt: null });
  }

  // RLS сама отсечёт чужой объект: строка просто не найдётся.
  const { data, error } = await supabase
    .from('projects')
    .update(patch)
    .eq('id', body.projectId)
    .select('id, updated_at')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Объект не найден.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, savedAt: data.updated_at });
}
