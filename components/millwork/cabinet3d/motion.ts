/**
 * КТО СЕЙЧАС ДВИЖЕТСЯ — УЧЁТ БЕЗ three.js.
 *
 * Захвату кадра нужен ровно один вопрос: доехали ли створки и ящики
 * (`settled`). Жил учёт в `useSlide` рядом с хуком на `useFrame`, и
 * захват, спросив его, статически тянул `@react-three/fiber` и three.js в
 * первую загрузку `/demo` через `lib/millwork/render.ts` (слой 53). Здесь
 * только счётчик и ожидание по кадрам браузера — сцена и её движок сюда
 * не входят.
 */

let movingCount = 0;

/** Сколько элементов сейчас в движении. Ноль — сцена спокойна. */
export function movingParts(): number {
  return movingCount;
}

/** Элемент тронулся: пока он едет, захват ждёт. */
export function startMoving(): void {
  movingCount += 1;
}

/** Элемент встал. */
export function stopMoving(): void {
  movingCount = Math.max(0, movingCount - 1);
}

/**
 * ЗАЯВКА НА СЛЕДУЮЩИЙ КАДР — ОДНА НА КАДР, И РЕШАЕТ ЭТО КАДР, А НЕ ЧАСЫ.
 *
 * Было: заявка отбрасывалась, если прошлая была меньше 4 мс назад. Кадры
 * браузера не обязаны идти через 16 мс — после подвисшего кадра следующий
 * приходит через 2–3 мс, на экране 240–360 Гц так всегда. При
 * `frameloop="demand"` отброшенная заявка — последний кадр: ящик вставал на
 * полпути (замерено в браузере: 136 мм из 300, 4 кадра за 60 с) и стоял,
 * пока его не тронут.
 *
 * Ключ — холст (`root`) и время ЕГО кадра (`stamp`): первая заявка кадра
 * проходит всегда, остальные в том же кадре — нет (ловушка 88: при
 * «Открыть всё» едут десятки элементов сразу).
 */
const lastStampOf = new WeakMap<object, number>();

export function frameRequestGate(root: object, stamp: number): boolean {
  if (lastStampOf.get(root) === stamp) return false;
  lastStampOf.set(root, stamp);
  return true;
}

/**
 * Ждём не по таймеру, а по факту: два кадра подряд без движения.
 *
 * Таймер соврал бы на медленной машине, а кадр, снятый в середине хода
 * ящика, показал бы модели полуоткрытую мебель.
 */
export function settled(timeoutMs = 2000): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    let calm = 0;

    const tick = () => {
      if (movingParts() === 0) calm += 1;
      else calm = 0;

      if (calm >= 2 || performance.now() - startedAt > timeoutMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}
