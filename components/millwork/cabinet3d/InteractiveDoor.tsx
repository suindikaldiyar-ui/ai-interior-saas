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
  /** Зазор вокруг полотна, метры. По нему читается щель между фасадами. */
  gap: number;
  /** Ручка-профиль по верхней кромке вместо накладной скобы. */
  integratedHandle: boolean;
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
  gap,
  integratedHandle,
}: Props) {
  const group = useRef<THREE.Group>(null);
  const touch = useRef<THREE.Mesh>(null);

  // Зона касания не меньше 44 px на экране: полотно 200 мм на телефоне
  // само по себе восемь пикселей.
  useTouchTarget(touch, { width, height, depth: 0.06 });
  void depth;

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
    /*
     * Ось вращения стоит на ПЕРЕДНЕЙ плоскости корпуса (z = 0): модуль
     * нарисован от нуля вглубь, и петля живёт именно здесь. Смещать группу
     * на половину глубины нельзя — дверь оторвётся от шкафа.
     */
    <group ref={group} position={[hingeX, y + height / 2, 0]}>
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

      {/*
        * Полотно стоит ВПЕРЕДИ корпуса и уже проёма на два зазора: тёмная
        * щель между фасадами — главный признак мебели. Без неё ряд читается
        * как крашеная стена.
        */}
      <mesh
        geometry={parts.box}
        material={parts.front}
        position={[panelX, 0, thickness / 2]}
        scale={[width - 2 * gap, height - 2 * gap, thickness]}
        castShadow
      />

      {/*
        * Ручка. Без неё фасад читается как панель, а не как дверь.
        * Профиль по верхней кромке при integratedHandles, иначе скоба.
        */}
      {integratedHandle ? (
        <mesh
          geometry={parts.box}
          material={parts.metal}
          position={[panelX, height / 2 - gap - 0.01, thickness + 0.004]}
          scale={[width - 2 * gap, 0.02, 0.015]}
        />
      ) : (
        <mesh
          geometry={parts.box}
          material={parts.metal}
          position={[
            panelX + (hinge === 'left' ? width / 2 - 0.05 : -width / 2 + 0.05),
            0,
            thickness + 0.012,
          ]}
          scale={[0.016, Math.min(0.22, height * 0.4), 0.016]}
        />
      )}
    </group>
  );
}
