'use client';

import * as THREE from 'three';

/**
 * ФРЕЗЕРОВАННЫЙ ФАСАД: ВЕРТИКАЛЬНЫЕ БОРОЗДКИ.
 *
 * Фрезеровка — это не цвет и не блеск, а рельеф: на фасаде видно, что по
 * нему прошла фреза. Плоский цвет вместо неё превращает дорогой фасад в
 * крашеную панель, и клиент не понимает, за что доплачивает.
 *
 * Карта нормалей рисуется ТУТ ЖЕ, на канвасе: файл пришлось бы тянуть из
 * сети, а сцена обязана работать в квартире без интернета. Считается
 * один раз на вкладку и живёт в модуле.
 */

/** Шаг бороздок в пикселях текстуры: на фасаде это примерно 40 мм. */
const GROOVE_PERIOD = 16;
const SIZE = 256;

let cached: THREE.CanvasTexture | null = null;

export function milledNormalMap(): THREE.CanvasTexture | null {
  if (cached) return cached;
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const image = ctx.createImageData(SIZE, SIZE);

  for (let x = 0; x < SIZE; x += 1) {
    /*
     * Синус по горизонтали — это и есть бороздка: наклон поверхности
     * меняется плавно, а не ступенькой, иначе на фасаде видны полосы
     * вместо фрезеровки.
     */
    const phase = (x % GROOVE_PERIOD) / GROOVE_PERIOD;
    const slope = Math.sin(phase * Math.PI * 2);

    // Нормаль в тангенциальном пространстве: X — наклон, Z — «вверх».
    const nx = Math.round(128 + slope * 90);
    const ny = 128;
    const nz = 255;

    for (let y = 0; y < SIZE; y += 1) {
      const i = (y * SIZE + x) * 4;
      image.data[i] = nx;
      image.data[i + 1] = ny;
      image.data[i + 2] = nz;
      image.data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Бороздки идут по фасаду сверху вниз с шагом около 40 мм: на дверце
  // 400 мм это десяток борозд, как на настоящей фрезеровке.
  texture.repeat.set(6, 1);
  texture.needsUpdate = true;

  cached = texture;
  return texture;
}
