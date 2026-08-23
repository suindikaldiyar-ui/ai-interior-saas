'use client';

import { useCallback, useState } from 'react';
import { captureScene } from '@/lib/captureRegistry';
import { PROJECTS_BUCKET, storageUrl } from '@/lib/supabase/config';
import { buildCatalogRefs, renderVariant, urlToDataUrl } from '@/lib/renderClient';
import { assertSameConfiguration } from '@/lib/millwork/fingerprint';
import { useInteriorStore } from '@/store/useInteriorStore';
import type { Variant } from '@/types/millwork';
import type { RunAngle } from '@/types/render';

/**
 * Рендер комплектаций.
 *
 * Три варианта, а не шесть: клиент сравнивает три БЮДЖЕТА одной своей кухни,
 * а не шесть стилей чужой. Раскладка у всех трёх одна, поэтому кадр снимается
 * один раз — геометрия во всех трёх картинках совпадает до модуля.
 */

// Таблица стилей живёт в модуле без 'use client': её читает и сервер.
export { MILLWORK_STYLE_IDS, VARIANT_STYLE } from './styles';

const COUNTERTOP_TEXT: Record<string, string> = {
  ldsp: 'столешница ЛДСП 38 мм с кромкой',
  quartz: 'столешница из кварцевого агломерата',
  solid_wood: 'столешница из массива дуба',
};

const HARDWARE_TEXT: Record<string, string> = {
  standard: 'фурнитура стандарт, накладные ручки',
  soft_close: 'фурнитура с доводчиками',
  blum: 'фурнитура Blum, ящики Tandembox',
};

/**
 * Чем эта комплектация отличается от соседней — словами, для модели.
 * Числа сюда не попадают: геометрию держит кадр, а не текст.
 */
export function variantNotes(variant: Variant): string {
  const o = variant.run.options;
  const parts = [
    `комплектация «${variant.title}»`,
    COUNTERTOP_TEXT[o.countertop] ?? '',
    HARDWARE_TEXT[o.hardwareClass] ?? '',
    o.upperToCeiling ? 'верхний ряд до потолка' : 'верхний ряд стандартной высоты',
    o.integratedHandles ? 'ручки-профили, фасады без накладных ручек' : '',
    o.hasCornice ? 'карниз по верхнему ряду' : '',
  ].filter(Boolean);

  return parts.join(', ');
}

/**
 * Один захват на три запроса. Внутри одного вызова роута три картинки
 * не уместятся в 60 с Vercel Hobby, поэтому запросы идут врозь.
 */
/**
 * Стиль выбирает человек, а не таблица.
 *
 * Раньше стиль был жёстко привязан к комплектации: «премиум» рисовался
 * премиум-модерном и никак иначе. Но бюджет и вкус — разные вещи, и
 * клиенту в скандинавской квартире не нужен графит с подсветкой.
 */
export const RENDER_CHOICES: { id: string; title: string }[] = [
  { id: 'scandi', title: 'Скандинавский' },
  { id: 'warm-minimal', title: 'Тёплый минимализм' },
  { id: 'premium-modern', title: 'Премиум-модерн' },
];

/** По умолчанию — премиум-модерн: он продаёт лучше остальных. */
export const DEFAULT_RENDER_STYLE = 'premium-modern';

export function isRenderStyle(id: string | null | undefined): boolean {
  return RENDER_CHOICES.some((s) => s.id === id);
}

export type MillworkRenderInput = {
  variants: Variant[];
  /** Фотография помещения клиента, dataURL. Без неё рендер рисует свои стены. */
  roomPhoto?: string | null;
  /** Ракурс clay-кадра. Подбирается под ракурс фотографии. */
  angle?: RunAngle;
  /** Объект в базе: с ним картинки уезжают в Storage и живут по ссылке. */
  projectId?: string | null;
  /** Выбранный стиль. Без него берётся стиль по умолчанию. */
  styleId?: string;
};

/**
 * Картинка из ответа модели — в Storage, в состоянии остаётся ссылка.
 *
 * Три base64-картинки по полтора мегабайта — это не «немного памяти»:
 * вкладка держит их в состоянии, каждая перерисовка таскает строку, а
 * планшет замерщика начинает захлёбываться ровно в тот момент, когда
 * клиент смотрит на экран. По ссылке картинку рисует браузер, а не React.
 *
 * Без объекта в базе (демонстрация) оставляем как есть: складывать некуда.
 */
async function offloadToStorage(styleId: string, projectId?: string | null): Promise<void> {
  if (!projectId) return;

  const store = useInteriorStore.getState();
  const image = store.renderVariants.find((v) => v.styleId === styleId)?.image;
  if (!image || !image.startsWith('data:')) return;

  try {
    const res = await fetch('/api/projects/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, styleId, image }),
    });
    const data = (await res.json()) as { path?: string };
    if (!data.path) return;

    useInteriorStore.getState().updateVariant(styleId, {
      image: storageUrl(PROJECTS_BUCKET, data.path),
    });
  } catch {
    /* не уехало — картинка остаётся в памяти, показывать всё равно есть что */
  }
}

/**
 * Повтор одного варианта на уже снятом кадре.
 *
 * Обычно достаточно одного повтора: модель редко ошибается дважды подряд.
 * Кадр заново не снимается — геометрия обязана остаться той же, иначе
 * клиент сравнивал бы две разные кухни.
 */
export async function rerenderMillworkVariant(
  variant: Variant,
  roomPhoto?: string | null,
  projectId?: string | null,
  styleId: string = DEFAULT_RENDER_STYLE,
): Promise<void> {
  const store = useInteriorStore.getState();
  if (!store.lastCapture) return;

  const photo = roomPhoto
    ? roomPhoto.startsWith('data:')
      ? roomPhoto
      : await urlToDataUrl(roomPhoto)
    : undefined;

  const catalogRefs = await buildCatalogRefs();

  await renderVariant(
    styleId,
    store.lastCapture,
    [],
    catalogRefs,
    variantNotes(variant),
    photo,
  );
  await offloadToStorage(styleId, projectId);
}

export async function runMillworkRenders({
  variants,
  roomPhoto,
  angle = 'front',
  projectId,
  styleId = DEFAULT_RENDER_STYLE,
}: MillworkRenderInput): Promise<void> {
  /*
   * Кадр всегда «на ряд»: сравнивать с чертежом можно только целый ряд.
   * Сторону съёмки задаёт фотография — модель не должна мирить два ракурса.
   */
  const capture = await captureScene(
    angle === 'left' ? 'run-left' : angle === 'right' ? 'run-right' : 'run',
  );

  /*
   * Из объекта снимок приходит ссылкой на Storage, из формы — уже dataURL.
   * Модель принимает только inline-данные, поэтому ссылку доводим здесь,
   * а не молча теряем фотографию.
   */
  const photo = roomPhoto
    ? roomPhoto.startsWith('data:')
      ? roomPhoto
      : await urlToDataUrl(roomPhoto)
    : undefined;

  /*
   * Кадр снят — сверяем, что в сцене стоял тот же ряд, что в смете.
   * Расхождение здесь означает, что клиенту показали бы картинку одной
   * кухни и цену другой, поэтому это исключение, а не предупреждение.
   */
  const sceneItem = useInteriorStore
    .getState()
    .items.find((item) => item.type === 'kitchen_unit');
  const sceneFingerprint = String(
    (sceneItem?.meta as Record<string, unknown> | undefined)?.fingerprint ?? '',
  );
  for (const variant of variants) {
    assertSameConfiguration('Рендер', variant.run.fingerprint, sceneFingerprint);
  }

  const catalogRefs = await buildCatalogRefs();

  useInteriorStore.getState().startRenderBatch([styleId], capture);

  await Promise.allSettled(
    variants.map((variant) =>
      renderVariant(
        styleId,
        capture,
        [],
        catalogRefs,
        variantNotes(variant),
        photo,
      ).then(() => offloadToStorage(styleId, projectId)),
    ),
  );
}

/**
 * Состояние отрисовки одно на весь экран результата.
 *
 * Кнопка живёт в двух местах — крупная в пустой половине сравнения и
 * обычная у карточки, — и обе обязаны знать одно и то же «сейчас рисуем».
 * Два независимых состояния дали бы две кнопки с разным мнением.
 */
export function useMillworkRender(input: MillworkRenderInput) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { variants, roomPhoto, angle, projectId, styleId } = input;

  const render = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await runMillworkRenders({ variants, roomPhoto, angle, projectId, styleId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Кадр снять не удалось.');
    } finally {
      setBusy(false);
    }
  }, [variants, roomPhoto, angle, projectId, styleId]);

  /** Повтор: кадр остаётся тем же, меняется только картинка. */
  const rerender = useCallback(
    async (variant: Variant) => {
      setBusy(true);
      setError(null);
      try {
        await rerenderMillworkVariant(variant, roomPhoto, projectId, styleId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Повтор не удался.');
      } finally {
        setBusy(false);
      }
    },
    [roomPhoto, projectId, styleId],
  );

  return { busy, error, render, rerender };
}
