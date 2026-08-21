import { NextResponse } from 'next/server';
import { PROJECTS_BUCKET } from '@/lib/supabase/config';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Снимок помещения клиента.
 *
 * Файл приходит уже сжатым до 1600 px: жать на сервере поздно — мегабайты
 * с телефона к этому моменту уже проехали по мобильному интернету замерщика.
 * Главный снимок дублируется в `source_photo_path`, по нему рендер берёт
 * основу кадра.
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
  const projectId = String(form?.get('projectId') ?? '');
  const isPrimary = String(form?.get('primary') ?? '') === '1';

  if (!projectId || !(file instanceof File)) {
    return NextResponse.json({ error: 'Нужны projectId и файл.' }, { status: 400 });
  }

  // RLS отсечёт чужой объект: строка просто не найдётся.
  const { data: project } = await supabase
    .from('projects')
    .select('id, org_id, source_photos')
    .eq('id', projectId)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: 'Объект не найден.' }, { status: 404 });
  }

  const path = `${project.org_id}/${projectId}/room-${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(PROJECTS_BUCKET)
    .upload(path, file, { contentType: 'image/jpeg', upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: `Снимок не загрузился: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const existing = Array.isArray(project.source_photos) ? project.source_photos : [];
  const patch: Record<string, unknown> = {
    source_photos: [...existing, { path, name: file.name }],
  };
  if (isPrimary) patch.source_photo_path = path;

  const { error } = await supabase.from('projects').update(patch).eq('id', projectId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, path });
}
