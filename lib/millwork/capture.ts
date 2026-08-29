'use client';

import { captureScene } from '@/lib/captureRegistry';
import { settled } from '@/components/millwork/cabinet3d/useSlide';
import { useInteriorStore } from '@/store/useInteriorStore';
import type { CaptureFraming, CaptureResult } from '@/types/render';

/**
 * Кадр для рендера снимается с ЗАКРЫТОЙ мебели.
 *
 * Это ровно та же ловушка, что была с гизмо: всё, что видно в кадре, модель
 * считает частью мебели. Открытый ящик в clay-кадре — и в рендере клиенту
 * приедет кухня с выдвинутым ящиком.
 *
 * Ждём не по таймеру, а по факту: `settled()` возвращает управление после
 * двух кадров подряд без движения. Таймер соврал бы на медленной машине,
 * а кадр в середине хода ящика показал бы полуоткрытую мебель.
 */
export async function captureForRender(
  framing: CaptureFraming = 'run',
): Promise<CaptureResult> {
  const store = useInteriorStore.getState();

  if (store.openParts.length > 0) store.closeAllParts();
  // Разрез — вид для разговора, а не для съёмки: без фасадов модель
  // нарисует кухню без фасадов.
  if (store.cutaway) store.setCutaway(false);

  /*
   * Подсветка витрины гаснет на время съёмки. Это та же ловушка, что с
   * открытым ящиком: светящаяся полоса в clay-кадре читается моделью как
   * часть мебели, и в рендер приезжает кухня со светящейся щелью.
   */
  const wasLit = store.displayLit;
  if (wasLit) store.setDisplayLit(false);

  await settled();

  try {
    return await captureScene(framing);
  } finally {
    // Кадр снят — на встрече подсветка снова нужна.
    if (wasLit) useInteriorStore.getState().setDisplayLit(true);
  }
}
