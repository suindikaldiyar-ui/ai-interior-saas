import { WOOD_TILE_MM, type WoodPattern } from './millwork/woodPattern';
import { woodPixels, type WoodWindow } from './millwork/woodPixels';

/**
 * ДЕМОНСТРАЦИОННЫЙ РИСУНОК ДЕРЕВА — ПИКСЕЛИ ИЗ ФОНОВОГО ПОТОКА.
 *
 * Поток один на вкладку и живёт, пока жива она: рисунок нужен то сцене,
 * то карточке, то картинке библиотеки, и каждый раз поднимать поток — это
 * лишняя загрузка кода. Запросы идут очередью по номеру.
 *
 * Где потоков нет (сервер, приёмка в node), считает тот же `woodPixels`
 * здесь же — это не запасной путь «на всякий случай», а единственный
 * доступный там.
 */
type Answer =
  | { id: number; width: number; height: number; pixels: Uint8ClampedArray }
  | { id: number; error: string };

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (pixels: Uint8ClampedArray) => void; reject: (error: Error) => void }>();

function ensureWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  const created = new Worker(new URL('./millwork/woodPattern.worker.ts', import.meta.url));
  created.onmessage = (event: MessageEvent<Answer>) => {
    const answer = event.data;
    const pending = waiting.get(answer.id);
    if (!pending) return;
    waiting.delete(answer.id);
    if ('error' in answer) pending.reject(new Error(`Рисунок дерева не посчитан: ${answer.error}`));
    else pending.resolve(answer.pixels);
  };
  created.onerror = (event) => {
    /* Поток упал целиком — каждый ждущий узнаёт причину, следующий запрос поднимет новый. */
    const reason = new Error(`Поток рисунка дерева упал: ${event.message || 'без сообщения'}`);
    for (const pending of Array.from(waiting.values())) pending.reject(reason);
    waiting.clear();
    created.terminate();
    if (worker === created) worker = null;
  };
  worker = created;
  return created;
}

/** Пиксели плитки рисунка: RGBA, sRGB. */
export function woodPixelsAsync(
  pattern: WoodPattern,
  width: number,
  height: number,
  window?: WoodWindow,
): Promise<Uint8ClampedArray> {
  const thread = ensureWorker();
  if (!thread) return Promise.resolve(woodPixels(pattern, width, height, window));
  seq += 1;
  const id = seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    thread.postMessage({ id, pattern, width, height, window });
  });
}

/**
 * МАЛЕНЬКИЙ ОБРАЗЕЦ РИСУНКА ДЛЯ КАРТОЧКИ И СПИСКА — data URL.
 *
 * Окно плитки 150 × 150 мм в 256 × 256 пикселях — тот же рисунок, что в
 * сцене, тем же генератором (`woodPixels` с окном): кольца и поры
 * привязаны к миллиметрам плитки. Окно считается за миллисекунды, а не
 * секунды целой плитки. 256 — чтобы полоса образца в карточке (во всю
 * ширину панели) не была мыльной. Кэш на вкладку по адресу рисунка: строки
 * списка просят его много раз.
 */
const swatches = new Map<string, Promise<string>>();
const SWATCH_PX = 256;
const SWATCH_MM = 150;
const SWATCH_AT: [number, number] = [0.12, 0.31];

export function woodSwatchUrl(pattern: WoodPattern, key: string): Promise<string> {
  const cached = swatches.get(key);
  if (cached) return cached;
  const window: WoodWindow = [
    SWATCH_AT[0],
    SWATCH_AT[1],
    SWATCH_AT[0] + SWATCH_MM / WOOD_TILE_MM[0],
    SWATCH_AT[1] + SWATCH_MM / WOOD_TILE_MM[1],
  ];
  const made = woodPixelsAsync(pattern, SWATCH_PX, SWATCH_PX, window).then((pixels) => {
    const canvas = document.createElement('canvas');
    canvas.width = SWATCH_PX;
    canvas.height = SWATCH_PX;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Холст 2D недоступен: образец рисунка не нарисовать.');
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels), SWATCH_PX, SWATCH_PX), 0, 0);
    return canvas.toDataURL('image/png');
  });
  swatches.set(key, made);
  made.catch(() => swatches.delete(key));
  return made;
}
