'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import { useSlide } from './useSlide';
import { useTouchTarget } from './useTouchTarget';
import { OPEN_ANGLE, type PartBox } from '@/lib/millwork/cabinetBoxes';
import type { CabinetParts } from './parts';
import { shapedGeometry } from './radiusGeometry';

/**
 * ГНУТАЯ СТВОРКА, КОТОРАЯ РАСПАХИВАЕТСЯ (OVAL & RADIUS).
 *
 * Полотно — та же форма, что лежит в пачке ряда закрытым (`BoxDraw.shape`,
 * деталь `radiusParts`): открылась — едет своим мешем, встала — вернулась в
 * пачку. Ось — у петельного конца дуги на передней плоскости корпуса
 * (`bentLeavesOf`), поворот и вынос вперёд — те же, что у плоской створки и у
 * проверки хода (`bentLeafPoses`): петля выносит полотно на толщину фасада.
 */

type Props = {
  id: string;
  open: boolean;
  onToggle: (id: string) => void;
  opening: 'left' | 'right';
  /** Ось, метры модуля [x, z]. */
  pivotM: [number, number];
  /** Полотно закрытым — коробка пачки с формой, в координатах модуля. */
  panel: PartBox;
  /** Толщина фасада, метры: на неё петля выносит полотно вперёд. */
  thickness: number;
  parts: CabinetParts;
  frontMaterial?: THREE.MeshStandardMaterial;
  onActive?: (id: string, active: boolean) => void;
  /** Чашки петель — коробки той же пачки, в координатах модуля. */
  riders?: PartBox[];
  /** Слой «Фасады» выключен: полотна нет, нажать нечего. */
  showPanel?: boolean;
};

export default function InteractiveBentDoor({
  id,
  open,
  onToggle,
  opening,
  pivotM,
  panel,
  thickness,
  parts,
  frontMaterial,
  onActive,
  riders,
  showPanel = true,
}: Props) {
  const group = useRef<THREE.Group>(null);
  const touch = useRef<THREE.Mesh>(null);
  const [active, setActive] = useState(open);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (open) setActive(true);
  }, [open]);
  useEffect(() => {
    onActive?.(id, active);
  }, [id, active, onActive]);

  useTouchTarget(touch, { width: panel.scale[0], height: panel.scale[1], depth: Math.max(panel.scale[2], 0.06) });

  const sign = opening === 'left' ? -1 : 1;
  const target = open ? sign * OPEN_ANGLE : 0;
  useSlide({
    target,
    initial: target,
    apply: (value) => {
      const el = group.current;
      if (!el) return;
      el.rotation.y = value;
      /* Петля выносит полотно вперёд по ходу — как у плоской (`doorKick`). */
      el.position.z = pivotM[1] + thickness * Math.abs(Math.sin(value));
    },
    onSettle: () => {
      if (!openRef.current) setActive(false);
    },
  });

  /* Сетка полотна — в осях модуля; в группе оси она сдвинута на минус ось. */
  const geometry = useMemo(
    () => (panel.shape ? shapedGeometry([{ form: panel.shape.form, originM: [0, 0, 0] }]) : null),
    [panel.shape],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);

  const local = (at: [number, number, number]): [number, number, number] => [at[0] - pivotM[0], at[1], at[2] - pivotM[1]];

  return (
    <group ref={group} position={[pivotM[0], 0, pivotM[1] + thickness * Math.abs(Math.sin(target))]} rotation={[0, target, 0]}>
      <mesh
        ref={touch}
        name={`part:${id}`}
        geometry={parts.box}
        material={parts.hit}
        visible={false}
        position={local(panel.position)}
        scale={[panel.scale[0], panel.scale[1], Math.max(panel.scale[2], 0.06)]}
        onClick={
          showPanel
            ? (event) => {
                event.stopPropagation();
                onToggle(id);
              }
            : undefined
        }
        onPointerOver={
          showPanel
            ? (event) => {
                event.stopPropagation();
                document.body.style.cursor = 'pointer';
              }
            : undefined
        }
        onPointerOut={
          showPanel
            ? () => {
                document.body.style.cursor = '';
              }
            : undefined
        }
      />
      {active && (
        <>
          {showPanel && geometry && (
            <mesh
              name={`bent:${id}`}
              geometry={geometry}
              material={frontMaterial ?? parts.front}
              position={[-pivotM[0], 0, -pivotM[1]]}
              castShadow
            />
          )}
          {riders?.map((box, i) => (
            <mesh
              key={`rider-${i}`}
              name={`rider:${box.node ?? 'metal'}`}
              geometry={parts.box}
              material={parts.metal}
              position={local(box.position)}
              scale={box.scale}
            />
          ))}
        </>
      )}
    </group>
  );
}
