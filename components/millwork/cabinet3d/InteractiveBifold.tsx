'use client';

import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { useSlide } from './useSlide';
import { bifoldPoses, type ModulePlacement, type PosedBox } from '@/lib/millwork/cabinetBoxes';
import type { CabinetParts } from './parts';
import type { Module } from '@/types/millwork';

/**
 * ДВА ФАСАДА Г-ОБРАЗНОГО МОДУЛЯ, КОТОРЫЕ ОТКРЫВАЮТСЯ ВМЕСТЕ (слой 55).
 *
 * Фасад Б висит на петлях у боковины Б, фасад А — на фасаде Б: потянул
 * за ручку на А — пара сложилась и ушла от угла в комнату. Ключ
 * открывания один (`<модуль>:door:0`), и открыть одну половину без другой
 * нельзя — так эту мебель и делают.
 *
 * Положения обоих фасадов на любом ходу считает `bifoldPoses` — та же
 * функция, по которой проверка меряет, что пара не задевает фасадов и
 * ручек соседней стены. Своих координат здесь нет.
 *
 * Закрытая пара рисуется вместе со всем рядом (`lCornerBoxes`); свой меш
 * появляется на время хода и держится, пока пара не встанет обратно.
 */
type Props = {
  id: string;
  unit: Module;
  open: boolean;
  onToggle: (id: string) => void;
  /** Место модуля — в осях модуля: группа модуля уже стоит на своём месте. */
  place: ModulePlacement;
  gap: number;
  thickness: number;
  integratedHandle: boolean;
  parts: CabinetParts;
  frontMaterial?: THREE.MeshStandardMaterial;
  onActive?: (id: string, active: boolean) => void;
};

export default function InteractiveBifold({
  id,
  unit,
  open,
  onToggle,
  place,
  gap,
  thickness,
  integratedHandle,
  parts,
  frontMaterial,
  onActive,
}: Props) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const [active, setActive] = useState(open);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (open) setActive(true);
  }, [open]);

  useEffect(() => {
    onActive?.(id, active);
  }, [id, active, onActive]);

  const posesAt = (s: number): PosedBox[] =>
    bifoldPoses(unit, place, { gapM: gap, frontThicknessM: thickness, integratedHandles: integratedHandle }, s);

  const target = open ? 1 : 0;
  useSlide({
    target,
    initial: target,
    apply: (s) => {
      posesAt(s).forEach((pose, i) => {
        const mesh = meshes.current[i];
        if (!mesh) return;
        mesh.position.set(pose.center[0], pose.center[1], pose.center[2]);
        mesh.rotation.y = pose.yaw;
      });
    },
    onSettle: () => {
      if (!openRef.current) setActive(false);
    },
  });

  const closed = posesAt(0);
  const shown = posesAt(open ? 1 : 0);

  return (
    <group>
      {/*
        * Зоны касания — по закрытым фасадам: на них нажимают, когда пара
        * закрыта. Не рисуются (ловушка 179), но луч их находит.
        */}
      {closed
        .filter((pose) => pose.role === 'front')
        .map((pose, i) => (
          <mesh
            key={`hit-${i}`}
            name={`part:${id}`}
            geometry={parts.box}
            material={parts.hit}
            visible={false}
            position={pose.center}
            rotation={[0, pose.yaw, 0]}
            scale={[
              Math.max(pose.size[0], 0.06),
              pose.size[1],
              Math.max(pose.size[2], 0.06),
            ]}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(id);
            }}
          />
        ))}

      {active &&
        shown.map((pose, i) => (
          <mesh
            key={`leaf-${i}`}
            ref={(mesh) => {
              meshes.current[i] = mesh;
            }}
            geometry={parts.box}
            material={pose.role === 'handle' ? parts.metal : (frontMaterial ?? parts.front)}
            position={pose.center}
            rotation={[0, pose.yaw, 0]}
            scale={pose.size}
            castShadow={pose.role === 'front'}
          />
        ))}
    </group>
  );
}
