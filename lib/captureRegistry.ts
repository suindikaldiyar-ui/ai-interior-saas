'use client';

import type { CaptureFraming, CaptureResult } from '@/types/render';

/**
 * Реестр функции захвата, намеренно без единого импорта three.
 *
 * Если бы captureScene жил рядом с кодом рендерера, страница статически
 * тянула бы three.js в основной бандл и dynamic(ssr:false) у RoomCanvas
 * перестал бы что-либо экономить.
 */

export const CAPTURE_WIDTH = 1536;
export const CAPTURE_HEIGHT = 1024;
export const CAPTURE_ASPECT = CAPTURE_WIDTH / CAPTURE_HEIGHT;

/** JPEG, не PNG: PNG на 1536×1024 в base64 — 3–5 МБ и гарантированный 413. */
export const JPEG_QUALITY = 0.92;

/** Имя группы ContactShadows — в clay-проходе её надо погасить. */
export const CONTACT_SHADOWS_NAME = '__contact_shadows';

/** Плоскости «неба» за окнами — в clay-проходе гасятся вместе с фоном. */
export const SKY_NAME = '__sky';

/**
 * Второй слой защиты от служебных элементов в кадре.
 *
 * captureMode убирает их через React, но полагаться только на это рискованно:
 * достаточно одного нового хелпера, который забыли завести под флаг. Поэтому
 * всё служебное помечается userData.helper, и перед кадром сцена обходится
 * traverse-ом и гасится принудительно.
 */
export const HELPER_FLAG = 'helper';

type CaptureFn = (framing: CaptureFraming) => Promise<CaptureResult>;

let registered: CaptureFn | null = null;

export function registerCapture(fn: CaptureFn | null): void {
  registered = fn;
}

export function isCaptureReady(): boolean {
  return registered !== null;
}

export function captureScene(framing: CaptureFraming): Promise<CaptureResult> {
  if (!registered) {
    return Promise.reject(
      new Error('Вьюпорт ещё не инициализирован — подождите пару секунд.'),
    );
  }
  return registered(framing);
}
