import { NextResponse } from 'next/server';
import { buildHardwareImage, buildHardwareThumb } from '@/lib/composite';
import { mediaEntries, nextMediaRole, sourceUrlOf } from '@/lib/millwork/hardwareMedia';
import { CATALOG_BUCKET } from '@/lib/supabase/config';
import { supabaseServer } from '@/lib/supabase/server';
import {
  HARDWARE_IMAGE_KINDS,
  HARDWARE_IMAGE_RIGHTS,
  type CatalogAsset,
  type HardwareImageKind,
  type HardwareImageRights,
  type HardwareMediaEntry,
} from '@/types/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;

/**
 * ИЗОБРАЖЕНИЯ ПОЗИЦИИ ФУРНИТУРЫ (HARDWARE-PHOTO-PERF-01).
 *
 * POST multipart `{ itemId, file, kind, rights, rightsNote, sourceUrl?, caption?, primary? }`
 *   — файл. Принимается ТОЛЬКО с `rights: 'VERIFIED'` и словами, чем право
 *   подтверждено: файл с непроверенными правами в публичный каталог не
 *   кладётся. Оригинал и миниатюра — без обрезки (`buildHardwareImage`,
 *   `buildHardwareThumb`), путь с отметкой времени: замена не отдаёт
 *   прежний файл из кэша браузера.
 * POST JSON `{ action: 'link', itemId, kind, rights, sourceUrl, caption? }` — ссылка у
 *   производителя без копии файла (права любые).
 * POST JSON `{ action: 'primary' | 'rights' | 'remove', itemId, key, rights? }` —
 *   главное изображение, права, снять. `key` — роль файла (`hw-2`) или адрес
 *   ссылки. Права файла сняты с VERIFIED — файл удаляется из Storage, у
 *   записи остаётся ссылка (если была). Снять — убрать привязку; позиция
 *   каталога остаётся.
 *
 * Пишет клиент пользователя: RLS не даст тронуть позицию чужой организации —
 * она просто не найдётся. Запись о файле проверяется (слой 52): файл без
 * строки в `catalog_assets` удаляется, и это сказано словами.
 */

type Supabase = NonNullable<ReturnType<typeof supabaseServer>>;
type ItemRow = {
  id: string;
  org_id: string;
  article: string;
  meta: Record<string, unknown> | null;
  catalog_assets: Pick<CatalogAsset, 'id' | 'kind' | 'role' | 'storage_path'>[] | null;
};

const today = () => new Date().toISOString().slice(0, 10);
const words = (status: number, error: string) => NextResponse.json({ error }, { status });

async function loadItem(supabase: Supabase, itemId: string): Promise<ItemRow | null> {
  const { data, error } = await supabase
    .from('catalog_items')
    .select('id, org_id, article, meta, catalog_assets(id, kind, role, storage_path)')
    .eq('id', itemId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as ItemRow;
}

/** Записать `meta.media` — остальное в `meta` как было. */
async function saveMedia(supabase: Supabase, row: ItemRow, media: HardwareMediaEntry[]): Promise<string | null> {
  const meta = { ...(row.meta ?? {}) };
  if (media.length > 0) meta.media = media;
  else delete meta.media;
  const { error } = await supabase.from('catalog_items').update({ meta }).eq('id', row.id);
  return error ? error.message : null;
}

/** Файлы роли: строки `catalog_assets` и объекты Storage. */
async function dropFiles(supabase: Supabase, row: ItemRow, role: string): Promise<string | null> {
  const files = (row.catalog_assets ?? []).filter((asset) => asset.role === role);
  if (files.length === 0) return null;
  const { error: rowsError } = await supabase.from('catalog_assets').delete().eq('item_id', row.id).eq('role', role);
  if (rowsError) return rowsError.message;
  const { error: storageError } = await supabase.storage.from(CATALOG_BUCKET).remove(files.map((asset) => asset.storage_path));
  /* Строки уже сняты: каталог файла не видит. Остаток в Storage — в лог, не в слова человеку. */
  if (storageError) console.error(`[фото фурнитуры] ${row.id}: файлы роли ${role} не удалились из Storage —`, storageError.message);
  return null;
}

const kindOf = (value: unknown): HardwareImageKind | null => HARDWARE_IMAGE_KINDS.find((k) => k === value) ?? null;
const rightsOf = (value: unknown): HardwareImageRights | null => HARDWARE_IMAGE_RIGHTS.find((r) => r === value) ?? null;
const textOf = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : undefined);

/** Главное изображение — одно: новое главное снимает признак с остальных. */
function withPrimary(media: HardwareMediaEntry[], key: string | null): HardwareMediaEntry[] {
  return media.map((entry) => {
    const next = { ...entry };
    delete next.primary;
    if (key !== null && (entry.role ?? entry.sourceUrl) === key) next.primary = true;
    return next;
  });
}

export async function POST(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) return words(503, 'Supabase не настроен.');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return words(401, 'Требуется вход.');

  /* ── Файл ── */
  if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return words(400, 'Не удалось прочитать форму.');
    }
    const itemId = String(form.get('itemId') ?? '');
    const file = form.get('file');
    const kind = kindOf(form.get('kind'));
    const rights = rightsOf(form.get('rights'));
    const rightsNote = textOf(form.get('rightsNote'));
    const sourceUrl = sourceUrlOf(form.get('sourceUrl'));
    const caption = textOf(form.get('caption'));
    const primary = String(form.get('primary') ?? '') === '1';
    if (!itemId || !(file instanceof File)) return words(400, 'Нужны позиция и файл.');
    if (!kind) return words(400, 'Не сказано, что на изображении: фото товара, фото серии, пример установки или чертёж.');
    if (rights !== 'VERIFIED') {
      return words(
        400,
        'Файл с непроверенными или ограниченными правами в каталог не загружается: привяжите ссылку на изображение у производителя или загрузите своё фото с подтверждёнными правами.',
      );
    }
    if (!rightsNote) return words(400, 'Скажите, чем подтверждено право на изображение: «своя съёмка», «письмо производителя от …».');
    if (file.size > MAX_BYTES) return words(400, 'Файл больше 12 МБ.');

    const row = await loadItem(supabase, itemId);
    if (!row) return words(404, 'Позиция не найдена в каталоге вашей организации.');
    if (!row.article.startsWith('MFR-') && !(row.meta && typeof row.meta.hardware === 'object')) {
      return words(400, 'Это не позиция фурнитуры: изображения фурнитуры привязываются к позициям фурнитуры.');
    }

    let image: Buffer;
    let thumb: Buffer;
    try {
      const source = Buffer.from(await file.arrayBuffer());
      [image, thumb] = await Promise.all([buildHardwareImage(source), buildHardwareThumb(source)]);
    } catch (error) {
      console.error('[фото фурнитуры] изображение не обработалось:', error);
      return words(400, 'Не удалось обработать изображение. Нужен JPEG, PNG или WebP.');
    }

    const media = mediaEntries(row.meta?.media);
    const role = nextMediaRole(media, (row.catalog_assets ?? []) as CatalogAsset[]);
    const stamp = Date.now();
    const files = [
      { kind: 'photo' as const, path: `${row.org_id}/hardware/${row.id}/${role}-photo-${stamp}.jpg`, body: image, type: 'image/jpeg' },
      { kind: 'swatch' as const, path: `${row.org_id}/hardware/${row.id}/${role}-thumb-${stamp}.webp`, body: thumb, type: 'image/webp' },
    ];
    const uploaded: string[] = [];
    const undo = async () => {
      if (uploaded.length) await supabase.storage.from(CATALOG_BUCKET).remove(uploaded);
      await supabase.from('catalog_assets').delete().eq('item_id', row.id).eq('role', role);
    };
    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      const { error } = await supabase.storage
        .from(CATALOG_BUCKET)
        .upload(f.path, f.body, { contentType: f.type, cacheControl: '31536000', upsert: false });
      if (error) {
        await undo();
        return words(500, `Загрузка не удалась: ${error.message}`);
      }
      uploaded.push(f.path);
      const { error: rowError } = await supabase
        .from('catalog_assets')
        .insert({ item_id: row.id, org_id: row.org_id, kind: f.kind, role, storage_path: f.path, sort_order: i });
      if (rowError) {
        console.error(`[фото фурнитуры] ${row.id}: запись ${role}-${f.kind} не легла —`, rowError.message);
        await undo();
        return words(500, 'Файл не привязан: запись о файле не сохранилась. Повторите загрузку.');
      }
    }

    const entry: HardwareMediaEntry = { role, kind, rights: 'VERIFIED', rightsNote, checkedAt: today() };
    if (sourceUrl) entry.sourceUrl = sourceUrl;
    if (caption) entry.caption = caption;
    const next = [...media, entry];
    const finalMedia = primary || !next.some((e) => e.primary) ? withPrimary(next, role) : next;
    const saveError = await saveMedia(supabase, row, finalMedia);
    if (saveError) {
      await undo();
      return words(500, `Файл не привязан: запись позиции не сохранилась — ${saveError}`);
    }
    return NextResponse.json({ ok: true, role, media: finalMedia, assets: files.map((f) => ({ kind: f.kind, role, storage_path: f.path })) });
  }

  /* ── Ссылка, главное, права, снять ── */
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return words(400, 'Не удалось прочитать запрос.');
  }
  const itemId = String(body.itemId ?? '');
  if (!itemId) return words(400, 'Нужна позиция.');
  const row = await loadItem(supabase, itemId);
  if (!row) return words(404, 'Позиция не найдена в каталоге вашей организации.');
  const media = mediaEntries(row.meta?.media);
  const key = String(body.key ?? '');
  const at = media.findIndex((entry) => (entry.role ?? entry.sourceUrl) === key);

  switch (body.action) {
    case 'link': {
      const kind = kindOf(body.kind);
      const rights = rightsOf(body.rights);
      const sourceUrl = sourceUrlOf(body.sourceUrl);
      if (!kind || !rights) return words(400, 'Нужны вид изображения и состояние прав.');
      if (!sourceUrl) return words(400, 'Нужен адрес https:// страницы изображения у производителя.');
      if (media.some((entry) => entry.sourceUrl === sourceUrl)) return words(400, 'Эта ссылка у позиции уже есть.');
      const entry: HardwareMediaEntry = { kind, rights, sourceUrl, checkedAt: today() };
      const caption = textOf(body.caption);
      if (caption) entry.caption = caption;
      const next = [...media, entry];
      const saveError = await saveMedia(supabase, row, next);
      return saveError ? words(500, `Ссылка не сохранилась: ${saveError}`) : NextResponse.json({ ok: true, media: next });
    }
    case 'primary': {
      if (at < 0) return words(404, 'Такого изображения у позиции нет.');
      const next = withPrimary(media, key);
      const saveError = await saveMedia(supabase, row, next);
      return saveError ? words(500, `Не сохранилось: ${saveError}`) : NextResponse.json({ ok: true, media: next });
    }
    case 'rights': {
      if (at < 0) return words(404, 'Такого изображения у позиции нет.');
      const rights = rightsOf(body.rights);
      if (!rights) return words(400, 'Нужно состояние прав: VERIFIED, NOT_VERIFIED или RESTRICTED.');
      const entry = media[at];
      if (rights === 'VERIFIED' && !entry.role) {
        return words(400, 'У ссылки нет файла: чтобы показывать изображение, загрузите его файлом с подтверждёнными правами.');
      }
      let next = media.map((e, i) => (i === at ? { ...e, rights } : e));
      /* Право снято — файл уходит из Storage; у записи остаётся ссылка, если она была. */
      if (rights !== 'VERIFIED' && entry.role) {
        const dropError = await dropFiles(supabase, row, entry.role);
        if (dropError) return words(500, `Файл не удалился: ${dropError}`);
        next = next
          .map((e, i) => {
            if (i !== at) return e;
            const link = { ...e };
            delete link.role;
            delete link.primary;
            return link;
          })
          .filter((e) => e.role || e.sourceUrl);
      }
      const saveError = await saveMedia(supabase, row, next);
      return saveError ? words(500, `Не сохранилось: ${saveError}`) : NextResponse.json({ ok: true, media: next });
    }
    case 'remove': {
      if (at < 0) return words(404, 'Такого изображения у позиции нет.');
      const entry = media[at];
      if (entry.role) {
        const dropError = await dropFiles(supabase, row, entry.role);
        if (dropError) return words(500, `Файл не удалился: ${dropError}`);
      }
      const rest = media.filter((_, i) => i !== at);
      const next = entry.primary && rest.length > 0 ? withPrimary(rest, rest[0].role ?? rest[0].sourceUrl ?? null) : rest;
      const saveError = await saveMedia(supabase, row, next);
      return saveError ? words(500, `Не сохранилось: ${saveError}`) : NextResponse.json({ ok: true, media: next });
    }
    default:
      return words(400, 'Неизвестное действие: link, primary, rights или remove.');
  }
}
