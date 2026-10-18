import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { supabaseServer } from '@/lib/supabase/server';
import { REFERENCE_TEXTURES } from '@/lib/millwork/referenceTextures.generated';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ОБРАЗЕЦ ДЕКОРА ИЗ БРОШЮРЫ — ТОЛЬКО ВОШЕДШЕМУ (REFERENCE_ONLY).
 *
 * Карточка выбора и деталь в 3D берут образец здесь. Это картинка из PDF
 * производителя, сопоставленная с позицией по коду и структуре дословно
 * (`scripts/build-reference-textures.ts`), а не кроп страницы «где-то
 * здесь»: у кропа пакета были поля, рамки соседей и значки.
 *
 * Права на изображения не подтверждены, поэтому файлов нет ни в `public`,
 * ни в Storage, ни в git: они лежат в папке образцов на ЭТОМ сервере
 * (`REFERENCE_TEXTURE_DIR`, по умолчанию рядом с пакетом проверки) и
 * отдаются только вошедшему, с `private` в кэше. Нет папки — 404 словами:
 * карточка и деталь остаются цветом образца и говорят, почему.
 *
 * Ключ — `meta.provenance.preview` позиции (`EGGER/H1113_ST10_p81.webp`):
 * он уже лежит в строках базы, и записей в базу не нужно.
 */
const DEFAULT_DIR = 'CATALOG_STAGING/99_IMPORT_QUEUE/EGGER_GRANDEX_REFERENCE';
const KEY = /^(EGGER|GRANDEX)\/[A-Za-z0-9_.+-]+\.webp$/;

export async function GET(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Образец поставщика виден только после входа.' }, { status: 401 });

  const key = new URL(request.url).searchParams.get('file') ?? '';
  const reference = KEY.test(key) ? REFERENCE_TEXTURES[key] : undefined;
  if (!reference) return NextResponse.json({ error: 'У этой позиции нет образца из брошюры.' }, { status: 404 });

  const root = resolve(process.env.REFERENCE_TEXTURE_DIR || DEFAULT_DIR);
  const path = resolve(join(root, reference.file));
  if (!path.startsWith(root + sep)) return NextResponse.json({ error: 'У этой позиции нет образца из брошюры.' }, { status: 404 });

  try {
    const bytes = await readFile(path);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'content-type': 'image/webp',
        'cache-control': 'private, max-age=3600',
        /* Пометка для того, кто откроет ответ: справочный образец, не для публикации и не PBR. */
        'x-material-preview': 'REFERENCE_ONLY; rights NOT_VERIFIED; not seamless; scale assumed',
      },
    });
  } catch (error) {
    /* Нет файла — законный ответ «образцов на этом сервере нет»; любая другая ошибка — ошибка, а не тишина. */
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    return NextResponse.json(
      {
        error:
          'Образец недоступен на этом сервере: папки образцов здесь нет (права на изображения не подтверждены, ' +
          'в git и Storage они не кладутся). Цвет позиции — средний цвет образца.',
      },
      { status: 404 },
    );
  }
}
