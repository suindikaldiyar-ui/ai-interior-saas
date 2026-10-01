import { NextResponse } from 'next/server';
import { PROJECTS_BUCKET, storageUrl } from '@/lib/supabase/config';
import { supabaseServer } from '@/lib/supabase/server';
import { PATHTRACE_FILE_PREFIX, PATHTRACE_STYLE_ID } from '@/lib/millwork/pathtrace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * РЕНДЕР ПО ЧЕРТЕЖУ СОХРАНЯЕТСЯ С ОБЪЕКТОМ (слой 54).
 *
 * PNG 1920×1080 весит мегабайты, а через функцию хостинга больше 4.5 МБ не
 * пройдёт — поэтому файл едет прямо в Storage по подписанной ссылке, а
 * здесь две короткие операции:
 *
 *   POST {projectId}   → ссылка на загрузку в папку объекта;
 *   PUT  {projectId, path, …} → файл на месте — строка `renders`, прежний
 *                        рендер по чертежу удалён вместе с файлом.
 *
 * Рендер по чертежу у объекта один: перерисовать можно, копить нельзя
 * (ловушка 152). Строка — в той же `renders` (ловушка 19), отличает её
 * `style_id`.
 */

type Body = {
  projectId?: string;
  path?: string;
  durationMs?: number;
  samples?: number;
  width?: number;
  height?: number;
};

async function readBody(request: Request): Promise<Body | null> {
  try {
    return (await request.json()) as Body;
  } catch {
    return null;
  }
}

async function projectOf(supabase: NonNullable<ReturnType<typeof supabaseServer>>, projectId: string) {
  // RLS отсечёт чужой объект: строка просто не найдётся.
  const { data } = await supabase.from('projects').select('id, org_id').eq('id', projectId).maybeSingle();
  return data as { id: string; org_id: string } | null;
}

export async function POST(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) return NextResponse.json({ error: 'Хранилище не настроено.' }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const body = await readBody(request);
  if (!body?.projectId) return NextResponse.json({ error: 'Нужен projectId.' }, { status: 400 });

  const project = await projectOf(supabase, body.projectId);
  if (!project) return NextResponse.json({ error: 'Объект не найден.' }, { status: 404 });

  const path = `${project.org_id}/${project.id}/${PATHTRACE_FILE_PREFIX}${Date.now()}.png`;
  const { data, error } = await supabase.storage.from(PROJECTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json(
      { error: `Хранилище не выдало ссылку на загрузку: ${error?.message ?? 'пустой ответ'}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ path, uploadUrl: data.signedUrl });
}

export async function PUT(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) return NextResponse.json({ error: 'Хранилище не настроено.' }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const body = await readBody(request);
  if (!body?.projectId || !body.path) {
    return NextResponse.json({ error: 'Нужны projectId и path.' }, { status: 400 });
  }

  const project = await projectOf(supabase, body.projectId);
  if (!project) return NextResponse.json({ error: 'Объект не найден.' }, { status: 404 });

  /* Путь — только в папке этого объекта и только файл рендера по чертежу. */
  const folder = `${project.org_id}/${project.id}`;
  const name = body.path.slice(folder.length + 1);
  if (!body.path.startsWith(`${folder}/`) || !name.startsWith(PATHTRACE_FILE_PREFIX) || name.includes('/')) {
    return NextResponse.json({ error: 'Файл не из папки этого объекта.' }, { status: 400 });
  }

  /* Файл обязан лежать на месте: строка без файла — картинка, которой нет. */
  const { data: listed, error: listError } = await supabase.storage
    .from(PROJECTS_BUCKET)
    .list(folder, { search: PATHTRACE_FILE_PREFIX, limit: 100 });
  if (listError) {
    return NextResponse.json({ error: `Хранилище не прочиталось: ${listError.message}` }, { status: 500 });
  }
  if (!(listed ?? []).some((file) => file.name === name)) {
    return NextResponse.json({ error: 'Картинка не дошла до хранилища — загрузите ещё раз.' }, { status: 409 });
  }

  const { data: inserted, error: insertError } = await supabase
    .from('renders')
    .insert({
      project_id: project.id,
      org_id: project.org_id,
      style_id: PATHTRACE_STYLE_ID,
      image_path: body.path,
      duration_ms: typeof body.durationMs === 'number' ? Math.round(body.durationMs) : null,
    })
    .select('id')
    .single();
  if (insertError || !inserted) {
    return NextResponse.json({ error: `Строка рендера не записалась: ${insertError?.message}` }, { status: 500 });
  }

  /*
   * ПРЕЖНИЙ РЕНДЕР — ПРОЧЬ, И СТРОКОЙ, И ФАЙЛОМ.
   *
   * Сначала новая строка, потом удаление старой: упади удаление — у
   * объекта останутся две картинки, а не ни одной. Файлы, оставшиеся от
   * оборванных загрузок, уходят тем же проходом.
   */
  const problems: string[] = [];
  const { data: old, error: oldError } = await supabase
    .from('renders')
    .select('id, image_path')
    .eq('project_id', project.id)
    .eq('style_id', PATHTRACE_STYLE_ID)
    .neq('id', inserted.id);
  if (oldError) problems.push(`прежние строки не прочитались: ${oldError.message}`);
  if ((old ?? []).length > 0) {
    const { error } = await supabase
      .from('renders')
      .delete()
      .in(
        'id',
        (old ?? []).map((row) => row.id),
      );
    if (error) problems.push(`прежние строки не удалились: ${error.message}`);
  }
  const stale = (listed ?? [])
    .filter((file) => file.name.startsWith(PATHTRACE_FILE_PREFIX) && file.name !== name)
    .map((file) => `${folder}/${file.name}`);
  if (stale.length > 0) {
    const { error } = await supabase.storage.from(PROJECTS_BUCKET).remove(stale);
    if (error) problems.push(`прежние файлы не удалились: ${error.message}`);
  }

  return NextResponse.json({
    ok: true,
    url: storageUrl(PROJECTS_BUCKET, body.path),
    /* Не молчим: картинка сохранена, но прибрать за прошлым не вышло. */
    warning: problems.length > 0 ? `Новая картинка сохранена, но ${problems.join('; ')}.` : null,
  });
}
