'use client';

import { useRef } from 'react';
import type * as THREE from 'three';
import { useSlide } from './useSlide';
import { useTouchTarget } from './useTouchTarget';
import type { CabinetParts } from './parts';

/**
 * Дверь, которая распахивается.
 *
 * Вращается вокруг ПЕТЕЛЬНОГО КРАЯ, а не вокруг центра: дверь на средней
 * оси выглядит как вращающаяся вывеска и сразу читается как неправда.
 * Поэтому группа стоит на петле, а полотно сдвинуто внутри неё на
 * полширины.
 */

type Props = {
  id: string;
  open: boolean;
  onToggle: (id: string) => void;
  /** Сторона петель. Совпадает с треугольником на чертеже. */
  hinge: 'left' | 'right';
  /** Габариты в метрах, начало координат — левый нижний угол корпуса. */
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  thickness: number;
  parts: CabinetParts;
};

/** Распахнутая дверь: 90°. */
const OPEN_ANGLE = Math.PI / 2;

export default function InteractiveDoor({
  id,
  open,
  onToggle,
  hinge,
  x,
  y,
  width,
  height,
  depth,
  thickness,
  parts,
}: Props) {
  const group = useRef<THREE.Group>(null);
  const touch = useRef<THREE.Mesh>(null);

  // Зона касания не меньше 44 px на экране: полотно 200 мм на телефоне
  // само по себе восемь пикселей.
  useTouchTarget(touch, { width, height, depth: 0.06 });

  // Петля слева — дверь уходит влево, то есть поворот положительный.
  const sign = hinge === 'left' ? 1 : -1;
  const target = open ? sign * OPEN_ANGLE : 0;

  useSlide({
    target,
    initial: target,
    apply: (value) => {
      const el = group.current;
      if (el) el.rotation.y = value;
    },
  });

  // Ось вращения стоит на петельном крае, полотно смещено внутрь группы.
  const hingeX = hinge === 'left' ? x : x + width;
  const panelX = hinge === 'left' ? width / 2 : -width / 2;
  return (
    <group ref={group} position={[hingeX, y + height / 2, depth / 2]}>
      <mesh
        ref={touch}
        name={`part:${id}`}
        geometry={parts.box}
        material={parts.hit}
        position={[panelX, 0, 0]}
        scale={[width, height, 0.06]}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      />

      <mesh
        geometry={parts.box}
        material={parts.front}
        position={[panelX, 0, 0]}
        scale={[width - 0.004, height - 0.004, thickness]}
        castShadow
      />
    </group>
  );
}
