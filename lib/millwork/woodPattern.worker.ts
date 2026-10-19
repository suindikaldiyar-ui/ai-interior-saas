import type { WoodPattern } from './woodPattern';
import { woodPixels, type WoodWindow } from './woodPixels';

/**
 * РИСУНОК ДЕРЕВА — В ФОНОВОМ ПОТОКЕ.
 *
 * Плитка 2048 × 2048 — четыре миллиона пикселей и одна-две секунды счёта:
 * на главном потоке планшета это секунды стоящей страницы при каждом новом
 * декоре. Здесь считает тот же `woodPixels`, что приёмка меряет в node, —
 * второй формулы рисунка нет. Пиксели уходят обратно передачей буфера, без
 * копии.
 */
type Ask = { id: number; pattern: WoodPattern; width: number; height: number; window?: WoodWindow };
type Answer =
  | { id: number; width: number; height: number; pixels: Uint8ClampedArray }
  | { id: number; error: string };

const scope = self as unknown as {
  postMessage: (message: Answer, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<Ask>) => void) | null;
};

scope.onmessage = (event) => {
  const { id, pattern, width, height, window } = event.data;
  try {
    const pixels = woodPixels(pattern, width, height, window);
    scope.postMessage({ id, width, height, pixels }, [pixels.buffer]);
  } catch (error) {
    /* Не молча: причина уходит обратно и встаёт в лог страницы. */
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
