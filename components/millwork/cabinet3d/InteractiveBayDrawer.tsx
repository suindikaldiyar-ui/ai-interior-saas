'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import { useSlide } from './useSlide';
import { useTouchTarget } from './useTouchTarget';
import { useShiftedBox, type CabinetParts } from './parts';
import { realSizeShiftOf } from './realSizeMap';
import { leafOfBox, useReliefGeometry, useShiftedRelief } from './reliefGeometry';
import { DRAWER_TRAVEL_M, type PartBox } from '@/lib/millwork/cabinetBoxes';
import { useInteriorStore } from '@/store/useInteriorStore';
import { HandleMesh } from './handleMesh';

/**
 * ЯЩИК ОТСЕКА (R02A), КОТОРЫЙ ВЫЕЗЖАЕТ.
 *
 * Рисует РОВНО те коробки, что лежат в общей пачке, — фасад и габарит
 * рабочей зоны из `bayDrawerBoxes` либо детали короба по комплекту и
 * ходовую половину направляющей (HARDWARE-01), — только своим мешем и со
 * сдвигом: второй геометрии ящика в сцене нет. Ход — наглядный: 300 мм
 * (`DRAWER_TRAVEL_M`), а не ход направляющей из паспорта.
 *
 * Каждый ящик — свой ключ: открытый один не трогает остальные.
 */

type Props = {
  id: string;
  open: boolean;
  onToggle: (id: string) => void;
  /** Коробки этого ящика в координатах модуля (метры): те же, что в пачке. */
  boxes: PartBox[];
  parts: CabinetParts;
  /** Материал фасада ЭТОГО модуля: открытый фасад не меняет цвет. */
  frontMaterial?: THREE.MeshStandardMaterial;
  /** Ящик поехал или встал: задвинутый рисуется вместе со всем рядом. */
  onActive?: (id: string, active: boolean) => void;
  /**
   * ХОД, метры (HARDWARE-01). Пусто — вперёд на `DRAWER_TRAVEL_M`, как у
   * ящика. Пантограф едет вниз и вперёд, полотно купе — вбок: вектор
   * считает движок (`sceneSlides`), здесь он только применяется.
   */
  vectorM?: [number, number, number];
};

export default function InteractiveBayDrawer({ id, open, onToggle, boxes, parts, frontMaterial, onActive, vectorM }: Props) {
  const travel: [number, number, number] = vectorM ?? [0, 0, DRAWER_TRAVEL_M];
  const economy = useInteriorStore((state) => state.economyMode);
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

  useSlide({
    target: open ? 1 : 0,
    initial: open ? 1 : 0,
    apply: (value) => {
      const el = group.current;
      if (el) el.position.set(travel[0] * value, travel[1] * value, travel[2] * value);
    },
    onSettle: () => {
      if (!openRef.current) setActive(false);
    },
  });

  /* Зона касания — габарит всех коробок ящика: фасад и рабочая зона за ним. */
  const hit = useMemo(() => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const box of boxes) {
      x0 = Math.min(x0, box.position[0] - box.scale[0] / 2);
      x1 = Math.max(x1, box.position[0] + box.scale[0] / 2);
      y0 = Math.min(y0, box.position[1] - box.scale[1] / 2);
      y1 = Math.max(y1, box.position[1] + box.scale[1] / 2);
      z0 = Math.min(z0, box.position[2] - box.scale[2] / 2);
      z1 = Math.max(z1, box.position[2] + box.scale[2] / 2);
    }
    return {
      center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] as [number, number, number],
      size: [x1 - x0, y1 - y0, z1 - z0] as [number, number, number],
    };
  }, [boxes]);

  useTouchTarget(touch, { width: hit.size[0], height: hit.size[1], depth: hit.size[2] });

  /* Фронт ящика — тот же кусок дерева, что у него закрытого в пачке (ключ — идентификатор ящика). */
  const frontBox = useShiftedBox(parts.box, id);
  /* Рельеф МДФ фронта (P3D-MDF) — с коробки фронта той же пачки (`bayDrawerBoxes`). */
  const front = boxes.find((box) => box.material === 'front');
  const reliefGeometry = useShiftedRelief(
    useReliefGeometry(front?.relief, leafOfBox(front?.scale ?? [0, 0, 0]), front?.reliefOrient),
    realSizeShiftOf(id),
  );
  const materialOf = (box: PartBox) =>
    box.material === 'front'
      ? (frontMaterial ?? parts.front)
      : box.material === 'inner'
        ? parts.inner
        : box.material === 'metal'
          ? parts.metal
          : parts.carcass;

  return (
    <group ref={group}>
      <mesh
        ref={touch}
        name={`part:${id}`}
        position={hit.center}
        geometry={parts.box}
        material={parts.hit}
        visible={false}
        scale={hit.size}
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
      {active &&
        boxes.map((box, i) =>
          /* Ручка едет своей моделью, той же, что у задвинутого в пачке (HANDLE-REAL). */
          box.handle ? (
            <HandleMesh key={`handle-${i}`} draw={box.handle} position={box.position} fine={!economy} part={box.part ?? id} />
          ) : (
            <mesh
              key={`${box.partId ?? box.panel ?? 'box'}-${i}`}
              name={box.node ? `mech:${box.node}` : box.panel ? `panel:${box.panel}` : undefined}
              geometry={box.material === 'front' ? (reliefGeometry ?? frontBox) : parts.box}
              material={materialOf(box)}
              position={box.position}
              scale={box.material === 'front' && reliefGeometry ? [1, 1, 1] : box.scale}
              castShadow={box.material === 'front'}
            />
          ),
        )}
    </group>
  );
}
