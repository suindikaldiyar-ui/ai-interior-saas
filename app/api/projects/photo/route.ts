import { NextResponse } from 'next/server';
import { PROJECTS_BUCKET, storageUrl } from '@/lib/supabase/config';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Снимки помещения в папке объекта начинаются так — и только они. */
const ROOM_FILE_PREFIX = 'room-';

type ProjectPhotos = {
  id: string;
  org_id: string;
  source_photo_path: string | null;
  source_photos: { path: string; name?: string }[] | null;
};

async function projectOf(supabase: NonNullable<ReturnType<typeof supabaseServer>>, projectId: string) {
  // RLS отсечёт чужой объект: строка просто не найдётся.
  const { data } = await supabase
    .from('projects')
    .select('id, org_id, source_photo_path, source_photos')
    .eq('id', projectId)
    .maybeSingle();
  return data as ProjectPhotos | null;
}

/**
 * ПРЕЖНИЙ ГЛАВНЫЙ СНИМОК — ПРОЧЬ ФАЙЛОМ, КАК ПРЕЖНИЙ РЕНДЕР (слой 54).
 *
 * Сначала объект указывает на новое, потом удаляется старое: упади
 * удаление — у объекта останется лишний файл, а не ни одного снимка.
 * Тем же проходом уходят файлы оборванных загрузок — снимки помещения,
 * на которые объект больше не ссылается. Не вышло — словами, не молча.
 */
async function removeStale(
  supabase: NonNullable<ReturnType<typeof supabaseServer>>,
  project: ProjectPhotos,
  kept: string[],
): Promise<string | null> {
  const folder = `${project.org_id}/${project.id}`;
  const { data: listed, error: listError } = await supabase.storage
    .from(PROJECTS_BUCKET)
    .list(folder, { search: ROOM_FILE_PREFIX, limit: 100 });
  if (listError) return `прежние снимки не прочитались: ${listError.message}`;

  const stale = (listed ?? [])
    .filter((file) => file.name.startsWith(ROOM_FILE_PREFIX))
    .map((file) => `${folder}/${file.name}`)
    .filter((path) => !kept.includes(path));
  if (stale.length === 0) return null;

  const { error } = await supabase.storage.from(PROJECTS_BUCKET).remove(stale);
  return error ? `прежние снимки не удалились: ${error.message}` : null;
}

/**
 * Снимок помещения клиента.
 *
 * Файл приходит уже сжатым до 1600 px: жать на сервере поздно — мегабайты
 * с телефона к этому моменту уже проехали по мобильному интернету замерщика.
 * Главный снимок дублируется в `source_photo_path`, по нему рендер берёт
 * основу кадра.
 *
 * `replace=1` — главный снимок из рабочего места: он у объекта ОДИН.
 * Добавленный там жил только в памяти вкладки и пропадал на перезагрузке;
 * теперь он ложится в Storage, объект указывает на него, а прежний
 * главный снимок удаляется. Замер (`/measure`) по-прежнему кладёт все свои
 * снимки списком — без `replace`.
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
  const replace = String(form?.get('replace') ?? '') === '1';

  if (!projectId || !(file instanceof File)) {
    return NextResponse.json({ error: 'Нужны projectId и файл.' }, { status: 400 });
  }

  const project = await projectOf(supabase, projectId);
  if (!project) {
    return NextResponse.json({ error: 'Объект не найден.' }, { status: 404 });
  }

  const path = `${project.org_id}/${projectId}/${ROOM_FILE_PREFIX}${Date.now()}.jpg`;
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
  const previous = replace ? project.source_photo_path : null;
  const photos = [
    ...existing.filter((photo) => !previous || photo.path !== previous),
    { path, name: file.name },
  ];
  const patch: Record<string, unknown> = { source_photos: photos };
  if (isPrimary || replace) patch.source_photo_path = path;

  const { error } = await supabase.from('projects').update(patch).eq('id', projectId);
  if (error) {
    /* Объект на файл не указывает — файл без ссылки не оставляем. */
    await supabase.storage.from(PROJECTS_BUCKET).remove([path]);
    return NextResponse.json({ error: `Снимок не записан в объект: ${error.message}` }, { status: 500 });
  }

  const warning = replace
    ? await removeStale(
        supabase,
        project,
        photos.map((photo) => photo.path),
      )
    : null;

  return NextResponse.json({
    ok: true,
    path,
    url: storageUrl(PROJECTS_BUCKET, path),
    warning: warning ? `Фото сохранено, но ${warning}.` : null,
  });
}

/**
 * «Убрать» в рабочем месте снимает главный снимок С ОБЪЕКТА.
 *
 * Иначе убранное фото возвращалось бы на следующем открытии — клиент
 * увидел бы снимок, который замерщик при нём убрал.
 */
export async function DELETE(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { projectId?: string } | null;
  if (!body?.projectId) return NextResponse.json({ error: 'Нужен projectId.' }, { status: 400 });

  const project = await projectOf(supabase, body.projectId);
  if (!project) return NextResponse.json({ error: 'Объект не найден.' }, { status: 404 });

  const previous = project.source_photo_path;
  const existing = Array.isArray(project.source_photos) ? project.source_photos : [];
  const photos = existing.filter((photo) => photo.path !== previous);

  const { error } = await supabase
    .from('projects')
    .update({ source_photo_path: null, source_photos: photos })
    .eq('id', project.id);
  if (error) {
    return NextResponse.json({ error: `Фото не снялось с объекта: ${error.message}` }, { status: 500 });
  }

  const warning = await removeStale(
    supabase,
    project,
    photos.map((photo) => photo.path),
  );
  return NextResponse.json({ ok: true, warning: warning ? `Фото снято, но ${warning}.` : null });
}
