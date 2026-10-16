'use client';

import { useRef } from 'react';
import { useFrame, type RootState } from '@react-three/fiber';
import { frameRequestGate, startMoving, stopMoving } from './motion';

/**
 * АНИМАЦИЯ НА useFrame, А НЕ НА СТОРОННЕЙ БИБЛИОТЕКЕ.
 *
 * В проекте стоит `frameloop="demand"` — это лечение мерцания, менять его
 * нельзя. Любая библиотека анимации двигает объекты вне цикла R3F, и кадр
 * просто не перерисовывается: анимация «не работает» при полностью верном
 * коде. Поэтому доводка своя, на `useFrame` + `invalidate()`.
 *
 * Учёт движущихся элементов живёт в `motion.ts`, без three.js: захват
 * кадра обязан дождаться, пока всё доедет, и спрашивает он учёт, а не хук.
 */

/** Меньше половины миллиметра — считаем, что приехали. */
const EPSILON = 0.0005;

/** Доля пути за кадр: мягкое торможение без пружины и перелёта. */
const EASING = 0.18;

/**
 * Один `invalidate()` на кадр, а не по одному из каждого меша.
 *
 * При «Открыть всё» едут десятки ящиков одновременно; каждый со своим
 * вызовом — это десятки лишних заявок на перерисовку в одном кадре. Кадр
 * узнаётся по часам холста (`clock.elapsedTime` обновляется перед
 * `useFrame`), а не по 4 мс между заявками: часы отбрасывали заявку
 * следующего кадра, если он пришёл быстро, и ход вставал на полпути
 * (`frameRequestGate`).
 */
function requestFrame(state: RootState): void {
  if (frameRequestGate(state.clock, state.clock.elapsedTime)) state.invalidate();
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

  useFrame((state) => {
    const delta = target - value.current;

    if (Math.abs(delta) < EPSILON) {
      if (moving.current) {
        value.current = target;
        apply(target);
        moving.current = false;
        stopMoving();
        onSettle?.();
        // Последний кадр после остановки: иначе элемент замрёт в миллиметре
        // от цели, и это будет видно на кадре захвата.
        requestFrame(state);
      }
      return;
    }

    if (!moving.current) {
      moving.current = true;
      startMoving();
    }

    value.current += delta * EASING;
    apply(value.current);
    requestFrame(state);
  });
}
