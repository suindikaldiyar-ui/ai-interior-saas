'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import { useSlide } from './useSlide';
import {
  L_PAIR_FIRST_LEG,
  lPairMotion,
  lPairStroke,
  lPairTarget,
  leafOpenAngle,
  type ModulePlacement,
  type PosedBox,
} from '@/lib/millwork/cabinetBoxes';
import { useShiftedBox, type CabinetParts } from './parts';
import type { FrontRelief, Module } from '@/types/millwork';
import type { HardwareItem } from '@/types/catalog';
import { realSizeShiftOf } from './realSizeMap';
import { useReliefGeometry, useShiftedRelief } from './reliefGeometry';
import { gripOrient } from '@/lib/millwork/facadeRelief';
import { isUpperRow } from '@/lib/millwork/modules';
import { useInteriorStore } from '@/store/useInteriorStore';
import { HandleMesh } from './handleMesh';

/**
 * ДВЕ НЕЗАВИСИМЫЕ ДВЕРЦЫ ВЕРХНЕГО Г-МОДУЛЯ (P0, видео заказчика).
 *
 * У каждой дверцы своя петля у дальнего края своей ноги и свой ключ
 * (`door:0` — нога А, `door:1` — нога Б); за ними — сплошное угловое
 * пространство с Г-образными полками. Карусели и механизма нет.
 *
 * ОТКРЫВАЮТСЯ ПО ОЧЕРЕДИ, ОДНИМ ХОДОМ ПАРЫ (`lPairStroke`): дверца А
 * закрывает угол, и первой ей не открыться — её кромка на ходу идёт в
 * дверцу Б. Нажали на А при закрытой Б — открываются обе: сначала Б,
 * потом А. Нажали на Б при открытой А — закрываются обе: сначала А.
 * Положения на любом ходу — `lPairPoses`, те же, что меряет проверка у
 * угла; угол раскрытия — петли каталога на дверце (`leafOpenAngle`),
 * не выбрана — 90°, как у створок сцены.
 *
 * Закрытую пару рисует пачка ряда (`lCornerBoxes`); свои меши — на время
 * хода и пока хоть одна дверца открыта.
 */
type Look = { material?: THREE.MeshStandardMaterial; relief?: FrontRelief };

type Props = {
  unit: Module;
  openA: boolean;
  openB: boolean;
  onToggle: (id: string) => void;
  /** Место модуля — в осях модуля: группа модуля уже стоит на своём месте. */
  place: ModulePlacement;
  gap: number;
  thickness: number;
  integratedHandle: boolean;
  hardware?: Map<string, HardwareItem>;
  parts: CabinetParts;
  /** Фасад каждой дверцы — свой (`leafFrontWithMilling` по `door:0` и `door:1`). */
  lookOf: (leaf: string) => Look | undefined;
  frontMaterial?: THREE.MeshStandardMaterial;
  onActive?: (id: string, active: boolean) => void;
  showFronts?: boolean;
  showHandles?: boolean;
  /** Нога Г-модуля слева — модуль в начале ряда (`lLegOf`). */
  legSide?: 'left' | 'right';
  /** Дверцы витрины (P1): стекло и профиль рамки — материалы отрисовщика. */
  glassMaterial?: THREE.Material;
  profileMaterial?: THREE.Material;
};

export default function InteractiveCornerPair({
  unit,
  openA,
  openB,
  onToggle,
  place,
  gap,
  thickness,
  integratedHandle,
  hardware,
  parts,
  lookOf,
  frontMaterial,
  onActive,
  showFronts = true,
  showHandles = true,
  legSide,
  glassMaterial,
  profileMaterial,
}: Props) {
  const economy = useInteriorStore((state) => state.economyMode);
  const idA = `${unit.id}:door:0`;
  const idB = `${unit.id}:door:1`;
  const meshes = useRef<(THREE.Object3D | null)[]>([]);
  const target = lPairTarget(openA, openB);
  const [active, setActive] = useState(target > 0);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (target > 0) setActive(true);
  }, [target]);

  useEffect(() => {
    onActive?.(idA, active);
    onActive?.(idB, active);
  }, [idA, idB, active, onActive]);

  /*
   * Ход каждой дверцы — функция доли (`lPairMotion`): ручка, размеры и петли
   * считаются один раз, в кадре хода — только положение. Угол — петли
   * каталога на дверце (`leafOpenAngle`), не выбрана — 90°.
   */
  const motions = useMemo(() => {
    const fixed = { x: place.x, y: place.y, heightM: place.heightM, depthM: place.depthM, thicknessM: place.thicknessM, zM: place.zM };
    const options = { gapM: gap, frontThicknessM: thickness, integratedHandles: integratedHandle, hardware, ...(legSide ? { legSide } : {}) };
    return [0, 1].map((leg) =>
      lPairMotion(unit, fixed, leg as 0 | 1, { ...options, openAngle: leafOpenAngle(unit, `door:${leg}`, hardware, 'left').angle }),
    );
  }, [unit, place.x, place.y, place.heightM, place.depthM, place.thicknessM, place.zM, gap, thickness, integratedHandle, hardware, legSide]);
  /* Нога А, затем нога Б — порядок коробок постоянный на любом ходу: меш держит свою коробку. */
  const posesAt = (u: number): { leg: 0 | 1; pose: PosedBox }[] => {
    const { a, b } = lPairStroke(u);
    return [
      ...motions[0](a).map((pose) => ({ leg: 0 as const, pose })),
      ...motions[1](b).map((pose) => ({ leg: 1 as const, pose })),
    ];
  };

  useSlide({
    target,
    initial: target,
    apply: (u) => {
      posesAt(u).forEach(({ pose }, i) => {
        const mesh = meshes.current[i];
        if (!mesh) return;
        mesh.position.set(pose.center[0], pose.center[1], pose.center[2]);
        mesh.rotation.y = pose.yaw;
      });
    },
    onSettle: () => {
      if (targetRef.current === 0) setActive(false);
    },
  });

  const closed = posesAt(0);
  const shown = posesAt(target);

  /*
   * РЕЛЬЕФ МДФ КАЖДОЙ ДВЕРЦЫ (P3D-MDF): размер полотна — в его собственных
   * осях (`lPairPoses` отдаёт ширину по X полотна), поворот — `yaw` хода.
   * Рисунок с ручкой — к открываемому краю: А на петлях слева, Б — справа.
   */
  const frontOf = (leg: 0 | 1) => closed.find((entry) => entry.leg === leg && entry.pose.role === 'front')?.pose;
  const lookA = lookOf('door:0');
  const lookB = lookOf('door:1');
  const sizeMm = (pose: PosedBox | undefined) => ({
    widthMm: (pose?.size[0] ?? 0) * 1000,
    heightMm: (pose?.size[1] ?? 0) * 1000,
    thicknessMm: (pose?.size[2] ?? 0) * 1000,
  });
  const upper = isUpperRow(unit);
  const reliefA = useShiftedRelief(useReliefGeometry(lookA?.relief, sizeMm(frontOf(0)), gripOrient(lookA?.relief, 'left', upper)), realSizeShiftOf(idA));
  const reliefB = useShiftedRelief(useReliefGeometry(lookB?.relief, sizeMm(frontOf(1)), gripOrient(lookB?.relief, 'right', upper)), realSizeShiftOf(idB));
  const boxA = useShiftedBox(parts.box, idA);
  const boxB = useShiftedBox(parts.box, idB);

  /* Нажатие держит порядок: А без Б не открывается, Б при открытой А закрывает и её. */
  const press = (leg: 0 | 1) => {
    if (leg === L_PAIR_FIRST_LEG) {
      if (openB && openA) onToggle(idA);
      onToggle(idB);
      return;
    }
    if (!openA && !openB) onToggle(idB);
    onToggle(idA);
  };

  return (
    <group>
      {/* Зоны касания — по закрытым полотнам; не рисуются (ловушка 179), луч их находит. */}
      {showFronts &&
        closed
          .filter((entry) => entry.pose.role === 'front')
          .map(({ leg, pose }) => (
            <mesh
              key={`hit-${leg}`}
              name={`part:${leg === 0 ? idA : idB}`}
              geometry={parts.box}
              material={parts.hit}
              visible={false}
              position={pose.center}
              rotation={[0, pose.yaw, 0]}
              scale={[pose.size[0], pose.size[1], Math.max(pose.size[2], 0.06)]}
              onClick={(event) => {
                event.stopPropagation();
                press(leg);
              }}
            />
          ))}

      {active &&
        shown.map(({ leg, pose }, i) => {
          /* Рамка и стекло дверцы витрины (P1) — слой «Фасады», как полотно. */
          if (pose.role === 'frame' || pose.role === 'glass') {
            if (!showFronts) return null;
            return (
              <mesh
                key={`leaf-${i}`}
                name={`leaf:${leg === 0 ? idA : idB}:${i}`}
                ref={(mesh) => {
                  meshes.current[i] = mesh;
                }}
                geometry={parts.box}
                material={pose.role === 'glass' ? (glassMaterial ?? parts.metal) : (profileMaterial ?? parts.metal)}
                position={pose.center}
                rotation={[0, pose.yaw, 0]}
                scale={pose.size}
                renderOrder={pose.role === 'glass' ? 2 : 0}
              />
            );
          }
          if (pose.role === 'front') {
            if (!showFronts || pose.panelless) return null;
            const relief = leg === 0 ? reliefA : reliefB;
            const look = leg === 0 ? lookA : lookB;
            return (
              <mesh
                key={`leaf-${i}`}
                /* Имя — как у «книжки» (`leaf:<деталь>:<n>`): по нему зонд сцены находит едущие меши (`__mwCadLeaves`). */
                name={`leaf:${leg === 0 ? idA : idB}:${i}`}
                ref={(mesh) => {
                  meshes.current[i] = mesh;
                }}
                geometry={relief ?? (leg === 0 ? boxA : boxB)}
                material={look?.material ?? frontMaterial ?? parts.front}
                position={pose.center}
                rotation={[0, pose.yaw, 0]}
                scale={relief ? [1, 1, 1] : pose.size}
                castShadow
              />
            );
          }
          if (!showHandles) return null;
          /* Ручка — своей моделью в группе, которую ведёт ход (HANDLE-REAL); чашки петель — металлом. */
          return pose.role === 'handle' && pose.handle ? (
            <group
              key={`leaf-${i}`}
              name={`leaf:${leg === 0 ? idA : idB}:${i}`}
              ref={(group) => {
                meshes.current[i] = group;
              }}
              position={pose.center}
              rotation={[0, pose.yaw, 0]}
            >
              <HandleMesh draw={pose.handle} position={[0, 0, 0]} fine={!economy} part={leg === 0 ? idA : idB} />
            </group>
          ) : (
            <mesh
              key={`leaf-${i}`}
              name={pose.role === 'hinge' ? `rider:hinge:${leg === 0 ? idA : idB}` : `leaf:${leg === 0 ? idA : idB}:${i}`}
              ref={(mesh) => {
                meshes.current[i] = mesh;
              }}
              geometry={parts.box}
              material={parts.metal}
              position={pose.center}
              rotation={[0, pose.yaw, 0]}
              scale={pose.size}
            />
          );
        })}
    </group>
  );
}
