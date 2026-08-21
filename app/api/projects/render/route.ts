import { NextResponse } from 'next/server';
import { PROJECTS_BUCKET } from '@/lib/supabase/config';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Картинка выбранной комплектации — в Storage.
 *
 * До этого рендеры жили только в памяти вкладки: клиент по ссылке видел
 * чертёж и смету, но не видел свою кухню. А именно сравнение «фотография
 * против рендера» и доказывает, что планировка не поехала.
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

  let body: { projectId?: string; styleId?: string; image?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать запрос.' }, { status: 400 });
  }

  const decoded = fromDataUrl(body.image ?? '');
  if (!body.projectId || !body.styleId || !decoded) {
    return NextResponse.json(
      { error: 'Нужны projectId, styleId и картинка.' },
      { status: 400 },
    );
  }

  // RLS отсечёт чужой объект: строка просто не найдётся.
  const { data: project } = await supabase
    .from('projects')
    .select('id, org_id')
    .eq('id', body.projectId)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: 'Объект не найден.' }, { status: 404 });
  }

  const ext = decoded.mime.includes('png') ? 'png' : 'jpg';
  const path = `${project.org_id}/${project.id}/${body.styleId}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(PROJECTS_BUCKET)
    .upload(path, decoded.buffer, { contentType: decoded.mime, upsert: true });

  if (uploadError) {
    return NextResponse.json(
      { error: `Картинка не загрузилась: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { error } = await supabase.from('renders').insert({
    project_id: project.id,
    org_id: project.org_id,
    style_id: body.styleId,
    image_path: path,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, path });
}
