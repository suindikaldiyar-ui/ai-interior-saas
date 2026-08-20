import { NextResponse } from 'next/server';
import { PROJECTS_BUCKET } from '@/lib/supabase/config';
import { supabaseServer } from '@/lib/supabase/server';
import type { FurnitureItem, RoomConfig } from '@/types/interior';
import type { Measurements, ProjectSelections } from '@/types/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type PublishRequest = {
  projectId?: string | null;
  clientName?: string;
  clientPhone?: string;
  room: RoomConfig;
  items: FurnitureItem[];
  selections: ProjectSelections;
  measurements: Measurements;
  renders: { styleId: string; image: string; durationMs?: number }[];
};

function fromDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  return {
    mime: match[1],
    buffer: Buffer.from(match[2].replace(/\s/g, ''), 'base64'),
  };
}

/** Сохраняет проект и его рендеры, возвращает ссылку для клиента. */
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

  let body: PublishRequest;
  try {
    body = (await request.json()) as PublishRequest;
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать запрос.' }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1);

  const orgId = membership?.[0]?.org_id as string | undefined;
  if (!orgId) {
    return NextResponse.json({ error: 'У пользователя нет организации.' }, { status: 400 });
  }

  const payload = {
    org_id: orgId,
    client_name: body.clientName ?? '',
    client_phone: body.clientPhone ?? '',
    room: body.room ?? {},
    items: body.items ?? [],
    selections: body.selections ?? {},
    measurements: body.measurements ?? {},
    status: 'sent' as const,
  };

  // RLS сама не даст записать в чужую организацию.
  const { data: project, error: projectError } = body.projectId
    ? await supabase
        .from('projects')
        .update(payload)
        .eq('id', body.projectId)
        .select('id, share_token')
        .single()
    : await supabase.from('projects').insert(payload).select('id, share_token').single();

  if (projectError || !project) {
    return NextResponse.json(
      { error: `Не удалось сохранить проект: ${projectError?.message ?? 'нет данных'}` },
      { status: 500 },
    );
  }

  const saved: string[] = [];
  const failed: string[] = [];

  for (const render of body.renders ?? []) {
    const decoded = fromDataUrl(render.image ?? '');
    if (!decoded) {
      failed.push(render.styleId);
      continue;
    }

    const ext = decoded.mime.includes('png') ? 'png' : 'jpg';
    const path = `${orgId}/${project.id}/${render.styleId}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(PROJECTS_BUCKET)
      .upload(path, decoded.buffer, { contentType: decoded.mime, upsert: true });

    if (uploadError) {
      failed.push(render.styleId);
      continue;
    }

    // Снимок выбора на момент рендера: цены в каталоге поменяются,
    // а что именно было показано клиенту — останется.
    const { error: insertError } = await supabase.from('renders').insert({
      project_id: project.id,
      org_id: orgId,
      style_id: render.styleId,
      selections_snapshot: body.selections ?? {},
      image_path: path,
      duration_ms: render.durationMs ?? null,
    });

    if (insertError) failed.push(render.styleId);
    else saved.push(render.styleId);
  }

  return NextResponse.json({
    ok: true,
    projectId: project.id,
    shareToken: project.share_token,
    shareUrl: `/p/${project.share_token}`,
    saved,
    failed,
  });
}
