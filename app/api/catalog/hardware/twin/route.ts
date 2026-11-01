import { NextResponse } from 'next/server';
import { CATALOG_BUCKET } from '@/lib/supabase/config';
import { supabaseServer } from '@/lib/supabase/server';
import { parseTwin } from '@/lib/millwork/hardwareTwin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Предел файла модели: GLB петли или направляющей — сотни килобайт; 30 МБ — уже не модель, а сборка. */
const MAX_BYTES = 30 * 1024 * 1024;

/**
 * РЕЕСТР 3D-ФУРНИТУРЫ (ТЗ 2026-10-31, § 3–4) — «Импорт CAD-фурнитуры».
 *
 * POST `{ action: 'upload-url', itemId, sha256, bytes, rights }` — ссылка на
 *   загрузку GLB в Storage мимо функции хостинга (предел 4,5 МБ тела). Файл
 *   хранится ТОЛЬКО при подтверждённом праве (`rights: 'VERIFIED'`): корзина
 *   каталога открыта на чтение, и CAD производителя без права в неё не
 *   кладётся — то же правило, что у фото фурнитуры (слой 61).
 * POST `{ action: 'save', itemId, twin }` — запись `meta.twin` после загрузки:
 *   запись строго разобрана (`parseTwin`), файл обязан лежать на месте и быть
 *   того размера, путь — только в папке этой позиции. `meta.hardware` и
 *   остальное `meta` не трогаются: импорт фактов реестр не стирает.
 * POST `{ action: 'remove', itemId }` — снять модель: файлы папки удаляются,
 *   `meta.twin` снимается; позиция каталога остаётся.
 *
 * Пишет клиент пользователя — RLS не даст тронуть позицию чужой организации:
 * она просто не найдётся.
 */
type Body = { action?: string; itemId?: string; sha256?: string; bytes?: number; rights?: string; twin?: unknown };

async function itemOf(supabase: NonNullable<ReturnType<typeof supabaseServer>>, itemId: string) {
  const { data } = await supabase.from('catalog_items').select('id, org_id, article, meta').eq('id', itemId).maybeSingle();
  return data as { id: string; org_id: string; article: string; meta: Record<string, unknown> | null } | null;
}

const folderOf = (item: { org_id: string; id: string }) => `${item.org_id}/hardware-cad/${item.id}`;

export async function POST(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) return NextResponse.json({ error: 'Хранилище не настроено.' }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Тело запроса — не JSON.' }, { status: 400 });
  }
  if (!body.itemId) return NextResponse.json({ error: 'Нужен itemId позиции каталога.' }, { status: 400 });
  const item = await itemOf(supabase, body.itemId);
  if (!item) return NextResponse.json({ error: 'Позиция не найдена в каталоге организации.' }, { status: 404 });
  if (!item.article.startsWith('MFR-')) {
    return NextResponse.json({ error: 'Модель из реестра 3D ставится на позицию производителя («MFR-…»).' }, { status: 400 });
  }
  const folder = folderOf(item);

  if (body.action === 'upload-url') {
    if (body.rights !== 'VERIFIED') {
      return NextResponse.json(
        { error: 'Файл модели хранится только с подтверждённым правом использования: корзина каталога открыта на чтение. Без права — запишите ссылку на источник.' },
        { status: 400 },
      );
    }
    if (!body.sha256 || !/^[0-9a-f]{64}$/.test(body.sha256)) return NextResponse.json({ error: 'Нужен sha256 файла (64 шестнадцатеричных знака).' }, { status: 400 });
    if (typeof body.bytes !== 'number' || !(body.bytes > 0) || body.bytes > MAX_BYTES) {
      return NextResponse.json({ error: `Размер файла — от 1 байта до ${MAX_BYTES / 1024 / 1024} МБ.` }, { status: 400 });
    }
    const path = `${folder}/${body.sha256}.glb`;
    const { data, error } = await supabase.storage.from(CATALOG_BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error || !data) {
      return NextResponse.json({ error: `Хранилище не выдало ссылку на загрузку: ${error?.message ?? 'пустой ответ'}` }, { status: 500 });
    }
    return NextResponse.json({ path, token: data.token, uploadUrl: data.signedUrl });
  }

  if (body.action === 'save') {
    const twin = parseTwin(body.twin);
    if (!twin) {
      return NextResponse.json(
        { error: 'Запись модели неполная: нужны статус, файл (путь, размер, sha256), источник с лицензией и правом, габарит, монтажная точка, роли частей и проверка.' },
        { status: 400 },
      );
    }
    const name = twin.asset.path.slice(folder.length + 1);
    if (!twin.asset.path.startsWith(`${folder}/`) || name !== `${twin.asset.sha256}.glb`) {
      return NextResponse.json({ error: 'Файл модели не из папки этой позиции.' }, { status: 400 });
    }
    if (twin.source.rights !== 'VERIFIED') {
      return NextResponse.json({ error: 'Файл модели хранится только с подтверждённым правом использования.' }, { status: 400 });
    }
    const { data: listed, error: listError } = await supabase.storage.from(CATALOG_BUCKET).list(folder, { limit: 100 });
    if (listError) return NextResponse.json({ error: `Хранилище не прочиталось: ${listError.message}` }, { status: 500 });
    const file = (listed ?? []).find((f) => f.name === name);
    if (!file) return NextResponse.json({ error: 'Файл модели не дошёл до хранилища — загрузите ещё раз.' }, { status: 409 });
    const size = (file.metadata as { size?: number } | null)?.size;
    if (typeof size === 'number' && size !== twin.asset.bytes) {
      return NextResponse.json({ error: `В хранилище ${size} байт, а в записи ${twin.asset.bytes} — файл не тот.` }, { status: 409 });
    }
    const meta = { ...(item.meta ?? {}), twin };
    const { error } = await supabase.from('catalog_items').update({ meta }).eq('id', item.id);
    if (error) return NextResponse.json({ error: `Запись модели не сохранилась: ${error.message}` }, { status: 500 });
    /* Прежние файлы этой позиции — больше не нужны: модель одна на артикул. */
    const stale = (listed ?? []).filter((f) => f.name !== name).map((f) => `${folder}/${f.name}`);
    if (stale.length > 0) {
      const { error: removeError } = await supabase.storage.from(CATALOG_BUCKET).remove(stale);
      if (removeError) console.error(`[реестр 3D] ${item.article}: прежние файлы не удалились —`, removeError.message);
    }
    return NextResponse.json({ ok: true, twin, removedStale: stale.length });
  }

  if (body.action === 'remove') {
    const { data: listed, error: listError } = await supabase.storage.from(CATALOG_BUCKET).list(folder, { limit: 100 });
    if (listError) return NextResponse.json({ error: `Хранилище не прочиталось: ${listError.message}` }, { status: 500 });
    const paths = (listed ?? []).map((f) => `${folder}/${f.name}`);
    if (paths.length > 0) {
      const { error: removeError } = await supabase.storage.from(CATALOG_BUCKET).remove(paths);
      if (removeError) return NextResponse.json({ error: `Файлы модели не удалились: ${removeError.message}` }, { status: 500 });
    }
    const meta = { ...(item.meta ?? {}) };
    delete meta.twin;
    const { error } = await supabase.from('catalog_items').update({ meta }).eq('id', item.id);
    if (error) return NextResponse.json({ error: `Запись модели не снялась: ${error.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, removed: paths.length });
  }

  return NextResponse.json({ error: 'Действие — upload-url, save или remove.' }, { status: 400 });
}
