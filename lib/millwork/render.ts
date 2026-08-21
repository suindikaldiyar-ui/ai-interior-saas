'use client';

import { captureScene } from '@/lib/captureRegistry';
import { buildCatalogRefs, renderVariant, urlToDataUrl } from '@/lib/renderClient';
import { assertSameConfiguration } from '@/lib/millwork/fingerprint';
import { useInteriorStore } from '@/store/useInteriorStore';
import type { Variant, VariantKey } from '@/types/millwork';
import type { RunAngle } from '@/types/render';

/**
 * Рендер комплектаций.
 *
 * Три варианта, а не шесть: клиент сравнивает три БЮДЖЕТА одной своей кухни,
 * а не шесть стилей чужой. Раскладка у всех трёх одна, поэтому кадр снимается
 * один раз — геометрия во всех трёх картинках совпадает до модуля.
 */

/** Стиль подобран под бюджет, а не наоборот. */
export const VARIANT_STYLE: Record<VariantKey, string> = {
  basic: 'scandi',
  optimal: 'warm-minimal',
  premium: 'premium-modern',
};

export const MILLWORK_STYLE_IDS = [
  VARIANT_STYLE.basic,
  VARIANT_STYLE.optimal,
  VARIANT_STYLE.premium,
];

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
export type MillworkRenderInput = {
  variants: Variant[];
  /** Фотография помещения клиента, dataURL. Без неё рендер рисует свои стены. */
  roomPhoto?: string | null;
  /** Ракурс clay-кадра. Подбирается под ракурс фотографии. */
  angle?: RunAngle;
};

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
    VARIANT_STYLE[variant.key],
    store.lastCapture,
    [],
    catalogRefs,
    variantNotes(variant),
    photo,
  );
}

export async function runMillworkRenders({
  variants,
  roomPhoto,
  angle = 'front',
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

  const styleIds = variants.map((v) => VARIANT_STYLE[v.key]);
  useInteriorStore.getState().startRenderBatch(styleIds, capture);

  await Promise.allSettled(
    variants.map((variant) =>
      renderVariant(
        VARIANT_STYLE[variant.key],
        capture,
        [],
        catalogRefs,
        variantNotes(variant),
        photo,
      ),
    ),
  );
}
