import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ОБРАЗЕЦ ИЗ ПАКЕТА ПРОВЕРКИ ПОСТАВЩИКА — ТОЛЬКО ДЛЯ КАРТОЧКИ, ТОЛЬКО ВОШЕДШЕМУ (P3).
 *
 * Кропы образцов EGGER и GRANDEX вырезаны из PDF поставщиков, и права на
 * их публикацию не подтверждены. Поэтому они не лежат ни в `public`, ни в
 * Storage, ни в репозитории: файл читается из папки пакета на этом сервере
 * (`SUPPLIER_REVIEW_ASSETS`, по умолчанию папка staging) и отдаётся только
 * вошедшему сотруднику, с `private` в кэше. Нет файла — 404 словами:
 * карточка покажет цвет и скажет, что образец недоступен.
 *
 * На детали в 3D образец не идёт вовсе — там средний цвет образца.
 */
const DEFAULT_DIR = 'CATALOG_STAGING/99_IMPORT_QUEUE/EGGER_GRANDEX/assets';
const FILE = /^(EGGER|GRANDEX)\/[A-Za-z0-9_.+-]+\.webp$/;

export async function GET(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Образец поставщика виден только после входа.' }, { status: 401 });

  const name = new URL(request.url).searchParams.get('file') ?? '';
  if (!FILE.test(name)) return NextResponse.json({ error: 'Такого образца в пакете нет.' }, { status: 400 });

  const root = resolve(process.env.SUPPLIER_REVIEW_ASSETS || DEFAULT_DIR);
  const path = resolve(join(root, name));
  if (!path.startsWith(root + sep)) return NextResponse.json({ error: 'Такого образца в пакете нет.' }, { status: 400 });

  try {
    const bytes = await readFile(path);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'content-type': 'image/webp',
        'cache-control': 'private, max-age=3600',
        /* Пометка для того, кто откроет ответ: это справочный кроп, не для публикации. */
        'x-material-preview': 'PDF_PRINT_SWATCH_REFERENCE_ONLY; rights NOT_VERIFIED',
      },
    });
  } catch (error) {
    /* Нет файла — законный ответ «на этом сервере пакета нет»; любая другая ошибка — ошибка, а не тишина. */
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    return NextResponse.json(
      { error: 'Образец недоступен на этом сервере: пакета проверки здесь нет. Цвет позиции — среднее по образцу.' },
      { status: 404 },
    );
  }
}
