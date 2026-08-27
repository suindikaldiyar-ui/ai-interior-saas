'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * ЗОНА КАСАНИЯ МЕРЯЕТСЯ В ПИКСЕЛЯХ, А НЕ В МИЛЛИМЕТРАХ.
 *
 * Дверца 200 мм в ряду 3200 мм на телефоне — это восемь пикселей: замер
 * показал ровно 8×39 px. Пальцем в неё не попасть, и «увеличенный
 * коллайдер» в миллиметрах ничего не решает — он тоже сжимается вместе с
 * кадром.
 *
 * Поэтому коллайдер раздувается до размера, который на ЭКРАНЕ даёт
 * минимум 44 px: считаем, сколько метров приходится на пиксель на этом
 * расстоянии от камеры, и масштабируем невидимый меш.
 */

/** Минимальная цель касания, пиксели экрана. */
export const MIN_TOUCH_PX = 44;

/** Перещёт делаем не каждый кадр, а когда камера заметно сдвинулась. */
const REBUILD_EPS = 0.02;

export function useTouchTarget(
  mesh: React.RefObject<THREE.Mesh>,
  size: { width: number; height: number; depth: number },
): void {
  const lastDistance = useRef(0);
  const world = useRef(new THREE.Vector3());

  const camera = useThree((state) => state.camera);
  const viewport = useThree((state) => state.size);

  useFrame(() => {
    const el = mesh.current;
    if (!el) return;

    el.getWorldPosition(world.current);
    const distance = camera.position.distanceTo(world.current);
    if (Math.abs(distance - lastDistance.current) < REBUILD_EPS) return;
    lastDistance.current = distance;

    const perspective = camera as THREE.PerspectiveCamera;
    const fov = ((perspective.fov ?? 45) * Math.PI) / 180;
    // Сколько метров в одном пикселе на этом расстоянии.
    const metersPerPixel = (2 * distance * Math.tan(fov / 2)) / Math.max(1, viewport.height);
    const minWorld = MIN_TOUCH_PX * metersPerPixel;

    el.scale.set(
      Math.max(size.width, minWorld),
      Math.max(size.height, minWorld),
      Math.max(size.depth, 0.02),
    );
  });
}
