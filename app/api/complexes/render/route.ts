import { NextResponse } from 'next/server';
import { READY_FIELDS, toReady } from '@/lib/complexes';
import { PROJECTS_BUCKET } from '@/lib/supabase/config';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Визуализация готового проекта планировки — в Storage.
 *
 * ГЛАВНАЯ ЧЕСТНОСТЬ ЗДЕСЬ: у планировки ЖК НЕТ фотографии помещения.
 * Квартира не сдана или сдана без отделки, снимка конкретного клиента
 * не существует. Значит гарнитур в кадре настоящий — размеры, состав,
 * техника по проекту, — а комната придумана моделью. Публичная страница
 * обязана сказать это словами рядом с картинкой; здесь мы только следим,
 * чтобы картинка была ОДНА на проект: перерисовать можно, копить нельзя.
 */

function fromDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(String(dataUrl).trim());
  if (!match) return null;
  return {
    mime: match[1],
    buffer: Buffer.from(match[2].replace(/\s/g, ''), 'base64'),
  };
}

export async function POST(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    image?: string;
  };

  const decoded = fromDataUrl(body.image ?? '');
  if (!body.projectId || !decoded) {
    return NextResponse.json({ error: 'Нужны projectId и картинка.' }, { status: 400 });
  }

  /*
   * Чужой проект не найдётся: RLS уже применена к этому запросу, а связь
   * с организацией идёт через планировку и ЖК.
   */
  const { data: project } = await supabase
    .from('ready_projects')
    .select(`${READY_FIELDS}, floor_plans!inner(id, complex_id, complexes!inner(org_id))`)
    .eq('id', body.projectId)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: 'Проект не найден.' }, { status: 404 });
  }

  const plan = (project as unknown as {
    floor_plans: { id: string; complex_id: string; complexes: { org_id: string } };
  }).floor_plans;

  const previous = (project as unknown as { render_path: string | null }).render_path;
  const ext = decoded.mime.includes('png') ? 'png' : 'jpg';
  const path = `${plan.complexes.org_id}/${plan.complex_id}/${plan.id}/${body.projectId}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(PROJECTS_BUCKET)
    .upload(path, decoded.buffer, { contentType: decoded.mime, upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: `Картинка не загрузилась: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from('ready_projects')
    .update({ render_path: path })
    .eq('id', body.projectId)
    .select(READY_FIELDS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: `Не удалось сохранить путь: ${error?.message ?? 'нет данных'}` },
      { status: 500 },
    );
  }

  /*
   * Один рендер на проект: прежний файл удаляем. Копить их незачем —
   * показывается всё равно последний, а место в Storage платное.
   */
  if (previous && previous !== path) {
    await supabase.storage.from(PROJECTS_BUCKET).remove([previous]).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, project: toReady(data as never), path });
}
