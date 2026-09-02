'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

/**
 * АНИМАЦИЯ НА useFrame, А НЕ НА СТОРОННЕЙ БИБЛИОТЕКЕ.
 *
 * В проекте стоит `frameloop="demand"` — это лечение мерцания, менять его
 * нельзя. Любая библиотека анимации двигает объекты вне цикла R3F, и кадр
 * просто не перерисовывается: анимация «не работает» при полностью верном
 * коде. Поэтому доводка своя, на `useFrame` + `invalidate()`.
 *
 * Здесь же живёт учёт движущихся элементов: захват кадра обязан дождаться,
 * пока всё доедет, а не спать по таймеру.
 */

/** Меньше половины миллиметра — считаем, что приехали. */
const EPSILON = 0.0005;

/** Доля пути за кадр: мягкое торможение без пружины и перелёта. */
const EASING = 0.18;

/* ─────────────────  Кто сейчас движется  ───────────────── */

let movingCount = 0;
let lastInvalidateAt = 0;

/** Сколько элементов сейчас в движении. Ноль — сцена спокойна. */
export function movingParts(): number {
  return movingCount;
}

/**
 * Один `invalidate()` на кадр, а не по одному из каждого меша.
 *
 * При «Открыть всё» едут десятки ящиков одновременно; каждый со своим
 * вызовом — это десятки лишних заявок на перерисовку в одном кадре.
 */
function requestFrame(invalidate: () => void): void {
  const now = performance.now();
  if (now - lastInvalidateAt < 4) return;
  lastInvalidateAt = now;
  invalidate();
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

/* ─────────────────  Сам ход  ───────────────── */

export type SlideOptions = {
  /** Куда едем. */
  target: number;
  /** Что делать со значением каждый кадр. */
  apply: (value: number) => void;
  /** Стартовое значение: с него начинается первый кадр. */
  initial?: number;
  /**
   * Элемент доехал и встал.
   *
   * По этому событию закрытая дверца возвращается в общую отрисовку:
   * пока она едет, у неё свой меш, а стоящая рисуется вместе со всеми
   * одним вызовом.
   */
  onSettle?: () => void;
};

/**
 * Доводка одного значения до цели.
 *
 * Возвращать ничего не нужно: значение отдаётся через `apply`, а объект
 * three двигается напрямую — React в кадре не участвует.
 */
export function useSlide({ target, apply, initial = target, onSettle }: SlideOptions): void {
  const value = useRef(initial);
  const moving = useRef(false);
  const invalidate = useThree((state) => state.invalidate);

  useFrame(() => {
    const delta = target - value.current;

    if (Math.abs(delta) < EPSILON) {
      if (moving.current) {
        value.current = target;
        apply(target);
        moving.current = false;
        movingCount = Math.max(0, movingCount - 1);
        onSettle?.();
        // Последний кадр после остановки: иначе элемент замрёт в миллиметре
        // от цели, и это будет видно на кадре захвата.
        requestFrame(invalidate);
      }
      return;
    }

    if (!moving.current) {
      moving.current = true;
      movingCount += 1;
    }

    value.current += delta * EASING;
    apply(value.current);
    requestFrame(invalidate);
  });
}
