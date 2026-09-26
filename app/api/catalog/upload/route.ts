import { NextResponse } from 'next/server';
import { buildComposite, buildPhoto, buildSwatch, buildTexture } from '@/lib/composite';
import { CATALOG_BUCKET } from '@/lib/supabase/config';
import { supabaseServer } from '@/lib/supabase/server';
import {
  ASSET_ROLES,
  isSurfaceKind,
  type AppliesTo,
  type AssetKind,
  type AssetRole,
} from '@/types/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;

type Prepared = { kind: AssetKind; role: AssetRole; buffer: Buffer };

/**
 * Какой файл чем становится.
 *
 * Фасад кухни — это композит: кроп фактуры плюс полоска цвета. Именно по нему
 * модель воспроизводит тон и текстуру.
 * Фотография смонтированной кухни идёт ТОЛЬКО в карточку интерфейса: пошли её
 * модели — и та затащит чужую комнату вместе с её планировкой и светом.
 */
const ROLE_NEEDS_COMPOSITE: AssetRole[] = ['main', 'facade', 'countertop', 'backsplash'];

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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать форму.' }, { status: 400 });
  }

  const itemId = String(form.get('itemId') ?? '');
  const file = form.get('file');
  const rawRole = String(form.get('role') ?? 'main');
  const role: AssetRole = ASSET_ROLES.includes(rawRole as AssetRole)
    ? (rawRole as AssetRole)
    : 'main';
  // Фотография смонтированного изделия — только для карточки, не для модели.
  const asPhoto = String(form.get('asPhoto') ?? '') === '1';
  /*
   * ФОТО МАТЕРИАЛА В НАСТОЯЩЕМ РАЗМЕРЕ (слой 51).
   *
   * Позиция каталога материалов знает, сколько миллиметров на фото
   * (`tiling.moduleSize`). Обрезка в квадрат, как у тайла покрытия,
   * сделала бы этот размер ложью: на квадрате уже не 600 × 450 мм, а
   * неизвестно что. Текстура кладётся целиком, с пропорциями.
   */
  const realSize = String(form.get('realSize') ?? '') === '1';

  if (!itemId || !(file instanceof File)) {
    return NextResponse.json({ error: 'Нужны itemId и файл.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Файл больше 12 МБ.' }, { status: 400 });
  }

  // RLS сам отсечёт чужую организацию: строка просто не найдётся.
  const { data: item, error: itemError } = await supabase
    .from('catalog_items')
    .select('id, org_id, tiling, meta, catalog_categories!inner(key, applies_to)')
    .eq('id', itemId)
    .single();

  if (itemError || !item) {
    return NextResponse.json({ error: 'Товар не найден.' }, { status: 404 });
  }

  const row = item as unknown as {
    id: string;
    org_id: string;
    tiling: Record<string, unknown>;
    meta: Record<string, unknown>;
    catalog_categories: { key: string; applies_to: AppliesTo };
  };

  const source = Buffer.from(await file.arrayBuffer());
  const isSurface = isSurfaceKind(row.catalog_categories.applies_to);
  // Зоне (кухне) композит нужен так же, как покрытию: по нему модель берёт
  // цвет и фактуру фасада. Не нужен он только фотографии готового изделия.
  const wantsComposite = !asPhoto && (isSurface || ROLE_NEEDS_COMPOSITE.includes(role));

  let prepared: Prepared[];
  let averageColor: string | null = null;

  try {
    if (wantsComposite) {
      // Композит собирается на сервере при загрузке: менеджер грузит одно фото,
      // а в рендер уходит подготовленный референс.
      const composite = await buildComposite(source);
      averageColor = composite.averageColor;
      prepared = [
        {
          kind: 'texture',
          role,
          buffer: realSize ? await buildPhoto(source, 2048) : await buildTexture(source),
        },
        { kind: 'swatch', role, buffer: await buildSwatch(source) },
        { kind: 'composite', role, buffer: composite.buffer },
      ];
    } else {
      prepared = [
        { kind: 'photo', role: 'main', buffer: await buildPhoto(source) },
        { kind: 'swatch', role: 'main', buffer: await buildSwatch(source) },
      ];
    }
  } catch (error) {
    console.error('[загрузка] изображение не обработалось:', error);
    return NextResponse.json(
      { error: 'Не удалось обработать изображение. Нужен JPEG, PNG или WebP.' },
      { status: 400 },
    );
  }

  const uploaded: { kind: AssetKind; role: AssetRole; path: string }[] = [];

  for (const asset of prepared) {
    const path = `${row.org_id}/${row.catalog_categories.key}/${row.id}/${asset.role}-${asset.kind}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from(CATALOG_BUCKET)
      .upload(path, asset.buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Загрузка не удалась: ${uploadError.message}` },
        { status: 500 },
      );
    }

    /*
     * ЗАПИСЬ О ФАЙЛЕ ПРОВЕРЯЕТСЯ (слой 52).
     *
     * Файл без строки в `catalog_assets` лежит в Storage, но каталог его
     * не видит: фото не ляжет на фасад, композит не уйдёт в рендер, а
     * ответ говорил «Готово». Не записалось — отказ словами, причина в лог.
     */
    // Один файл на связку вид + поверхность — сначала чистим старую запись.
    const { error: clearError } = await supabase
      .from('catalog_assets')
      .delete()
      .eq('item_id', row.id)
      .eq('kind', asset.kind)
      .eq('role', asset.role);
    if (clearError) {
      console.error(`[загрузка] ${row.id}: старая запись ${asset.role}-${asset.kind} не удалилась —`, clearError.message);
      return NextResponse.json(
        { error: 'Файл загружен, но каталог его не увидит: прежняя запись о файле не удалилась. Повторите загрузку.' },
        { status: 500 },
      );
    }

    const { error: insertError } = await supabase.from('catalog_assets').insert({
      item_id: row.id,
      org_id: row.org_id,
      kind: asset.kind,
      role: asset.role,
      storage_path: path,
      sort_order: uploaded.length,
    });
    if (insertError) {
      console.error(`[загрузка] ${row.id}: запись ${asset.role}-${asset.kind} не легла —`, insertError.message);
      return NextResponse.json(
        { error: 'Файл загружен, но каталог его не увидит: запись о файле не сохранилась. Повторите загрузку.' },
        { status: 500 },
      );
    }

    uploaded.push({ kind: asset.kind, role: asset.role, path });
  }

  if (averageColor) {
    // Усреднённый цвет уходит и в tiling (покрытия), и в meta (зоны):
    // по нему 3D показывает, светлая кухня или тёмная, ещё до рендера.
    const metaKey =
      role === 'facade' ? 'facadeColor' : role === 'countertop' ? 'counterColor' : role === 'backsplash' ? 'apronColor' : null;

    const { error: colorError } = await supabase
      .from('catalog_items')
      .update({
        tiling: { ...(row.tiling ?? {}), averageColor },
        ...(metaKey ? { meta: { ...(row.meta ?? {}), [metaKey]: averageColor } } : {}),
      })
      .eq('id', row.id);
    if (colorError) {
      console.error(`[загрузка] ${row.id}: средний цвет не записался —`, colorError.message);
      return NextResponse.json(
        { error: 'Файл загружен, но цвет позиции не сохранился: сцена покажет прежний цвет. Повторите загрузку.' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true, assets: uploaded, averageColor });
}
