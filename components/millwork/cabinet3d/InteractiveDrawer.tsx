'use client';

import { useRef } from 'react';
import type * as THREE from 'three';
import { useSlide } from './useSlide';
import { useTouchTarget } from './useTouchTarget';
import type { CabinetParts } from './parts';

/**
 * Ящик, который выезжает.
 *
 * Клиент не умеет читать чертёж, но выдвинутый ящик понимает без
 * объяснений. Это и есть главный довод на встрече — и он бесплатный:
 * никаких запросов к модели, чистая геометрия.
 */

/** Реальный ход направляющих: 300 мм. */
export const DRAWER_TRAVEL_M = 0.3;

type Props = {
  id: string;
  open: boolean;
  onToggle: (id: string) => void;
  /** Габариты в метрах, начало координат — левый нижний угол корпуса. */
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  thickness: number;
  parts: CabinetParts;
  /** Разрез: фасады убраны, видно короб ящика. */
  cutaway: boolean;
  gap: number;
  integratedHandle: boolean;
};

export default function InteractiveDrawer({
  id,
  open,
  onToggle,
  x,
  y,
  width,
  height,
  depth,
  thickness,
  parts,
  cutaway,
  gap,
  integratedHandle,
}: Props) {
  const group = useRef<THREE.Group>(null);
  const touch = useRef<THREE.Mesh>(null);

  useSlide({
    target: open ? DRAWER_TRAVEL_M : 0,
    initial: open ? DRAWER_TRAVEL_M : 0,
    apply: (value) => {
      const el = group.current;
      if (el) el.position.z = value;
    },
  });

  const boxH = Math.max(0.06, height - 0.04);
  const inner = Math.max(0.05, width - 2 * thickness);

  /*
   * Палец попадает не в кромку фронта, а «примерно туда». Невидимый
   * коллайдер раздувается до 44 px НА ЭКРАНЕ — в миллиметрах эта задача
   * не решается, на телефоне фронт ящика сам по себе в несколько пикселей.
   */
  useTouchTarget(touch, { width, height, depth });

  return (
    <group ref={group} position={[x + width / 2, y + height / 2, 0]}>
      {/* Невидимая зона касания. */}
      <mesh
        ref={touch}
        name={`part:${id}`}
        position={[0, 0, depth / 2]}
        geometry={parts.box}
        material={parts.hit}
        scale={[width, height, depth]}
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

      {/* Короб: дно, две боковины, задняя стенка. */}
      <mesh
        geometry={parts.box}
        material={parts.carcass}
        position={[0, -boxH / 2 + thickness / 2, 0]}
        scale={[inner, thickness, depth * 0.9]}
      />
      <mesh
        geometry={parts.box}
        material={parts.carcass}
        position={[-inner / 2, 0, 0]}
        scale={[thickness, boxH, depth * 0.9]}
      />
      <mesh
        geometry={parts.box}
        material={parts.carcass}
        position={[inner / 2, 0, 0]}
        scale={[thickness, boxH, depth * 0.9]}
      />
      <mesh
        geometry={parts.box}
        material={parts.carcass}
        position={[0, 0, -depth * 0.45]}
        scale={[inner, boxH, thickness]}
      />

      {/* Фронт. В разрезе его нет: он закрывает ровно то, ради чего смотрят. */}
      {!cutaway && (
        <>
          <mesh
            geometry={parts.box}
            material={parts.front}
            position={[0, 0, depth / 2 + thickness / 2]}
            scale={[width - 2 * gap, height - 2 * gap, thickness]}
            castShadow
          />

          {/* Ручка: профиль по верхней кромке либо накладная скоба. */}
          {integratedHandle ? (
            <mesh
              geometry={parts.box}
              material={parts.metal}
              position={[0, height / 2 - gap - 0.01, depth / 2 + thickness + 0.004]}
              scale={[width - 2 * gap, 0.02, 0.015]}
            />
          ) : (
            <mesh
              geometry={parts.box}
              material={parts.metal}
              position={[0, 0, depth / 2 + thickness + 0.012]}
              scale={[Math.min(0.26, width * 0.5), 0.016, 0.016]}
            />
          )}
        </>
      )}
    </group>
  );
}
