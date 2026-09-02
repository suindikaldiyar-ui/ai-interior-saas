'use client';

import { useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * ВЫДЕЛЕННЫЙ МОДУЛЬ В СЦЕНЕ: РАМКА И РУЧКА ШИРИНЫ.
 *
 * Замерщик показывает клиенту 3D, а не чертёж, и правку он делает там же,
 * где смотрит. Выделение здесь то же самое, что на чертеже: выбрал модуль
 * в сцене — он подсвечен и в эскизе, и наоборот.
 *
 * Ширина ТЯНЕТСЯ, а не вводится числом: на планшете это одно движение
 * пальцем вместо клавиатуры. Шаг 50 мм — цех всё равно считает пятёрками,
 * а миллиметровая точность пальцем недостижима и даёт ложное ощущение
 * контроля.
 */

/** Шаг ширины при перетаскивании. */
export const WIDTH_STEP_MM = 50;

type Props = {
  /** Левый край модуля от левого края ряда, метры. */
  x: number;
  y: number;
  widthM: number;
  heightM: number;
  depthM: number;
  /** Ширина в миллиметрах: от неё считается шаг перетаскивания. */
  widthMm: number;
  onWidth: (widthMm: number) => void;
};

export default function ModuleHandles({
  x,
  y,
  widthM,
  heightM,
  depthM,
  widthMm,
  onWidth,
}: Props) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);

  /*
   * Состояние перетаскивания живёт в ref: `setPointerCapture` для
   * эмулированного указателя бросает исключение и молча роняет
   * обработчик (ловушка 62), а состояние React на каждом движении —
   * это поток перерисовок.
   */
  const drag = useRef<{ startX: number; startWidth: number; mmPerPx: number } | null>(null);

  const frame = useMemo(() => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(geometry);
    geometry.dispose();
    return edges;
  }, []);

  const frameMaterial = useMemo(
    () => new THREE.LineBasicMaterial({ color: '#C08B3E' }),
    [],
  );

  const gripMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#C08B3E' }),
    [],
  );

  const gripGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  /** Сколько миллиметров мебели приходится на пиксель экрана прямо сейчас. */
  const measureScale = (): number => {
    const rect = gl.domElement.getBoundingClientRect();
    const toPx = (worldX: number) => {
      const point = new THREE.Vector3(worldX, y + heightM / 2, 0).project(camera);
      return ((point.x + 1) / 2) * rect.width;
    };

    const left = toPx(x);
    const right = toPx(x + widthM);
    const px = Math.abs(right - left);
    // Модуль, стоящий к камере ребром, дал бы деление на ноль.
    return px > 4 ? widthMm / px : 0;
  };

  const stop = () => {
    drag.current = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    document.body.style.cursor = '';
  };

  const move = (event: PointerEvent) => {
    const state = drag.current;
    if (!state) return;

    const deltaMm = (event.clientX - state.startX) * state.mmPerPx;
    const wanted = Math.round((state.startWidth + deltaMm) / WIDTH_STEP_MM) * WIDTH_STEP_MM;
    if (wanted !== widthMm) onWidth(wanted);
  };

  return (
    <group>
      {/* Рамка выделения: то же выделение, что на чертеже. */}
      <lineSegments
        geometry={frame}
        material={frameMaterial}
        position={[x + widthM / 2, y + heightM / 2, -depthM / 2]}
        scale={[widthM, heightM, depthM]}
      />

      {/*
        * Ручка ширины стоит на правом краю модуля — там, где ряд и
        * поедет. Она заметно толще самой кромки: пальцем нужно попасть.
        */}
      <mesh
        name="module-grip"
        geometry={gripGeometry}
        material={gripMaterial}
        position={[x + widthM, y + heightM / 2, 0.02]}
        scale={[0.03, Math.min(0.18, heightM * 0.4), 0.03]}
        onPointerDown={(event) => {
          event.stopPropagation();
          const mmPerPx = measureScale();
          if (mmPerPx === 0) return;

          drag.current = {
            startX: event.nativeEvent.clientX,
            startWidth: widthMm,
            mmPerPx,
          };
          document.body.style.cursor = 'ew-resize';
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', stop);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = 'ew-resize';
        }}
        onPointerOut={() => {
          if (!drag.current) document.body.style.cursor = '';
        }}
      />
    </group>
  );
}
