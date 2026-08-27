'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import CabinetModule3D from './CabinetModule3D';
import { useCabinetParts } from './parts';
import { moduleCarcassHeightMm } from '@/lib/millwork/fill';
import { GEOMETRY } from '@/lib/millwork/modules';
import { zoneProfile } from '@/lib/millwork/zones';
import { useInteriorStore } from '@/store/useInteriorStore';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '@/types/catalog';
import type { Run } from '@/types/millwork';

/**
 * Интерактивный гарнитур.
 *
 * Клиент тыкает в ящик — ящик выезжает; тыкает в дверь — дверь
 * распахивается на 90°, видно полки и штангу. Всё это чистая геометрия:
 * ни одного запроса к модели. Рендер стоит денег за каждую картинку,
 * а эта сцена может крутиться на встрече хоть час.
 *
 * И она закрывает главный пробел: клиент не умеет читать чертёж, но
 * открытый ящик понимает без объяснений.
 */

const MM = 1000;

type Props = {
  run: Run;
  production?: ProductionSettings;
  /** Габариты комнаты нужны, чтобы поставить ряд к стене. */
  roomWidthM: number;
  roomDepthM: number;
  facadeColor?: string;
  counterColor?: string;
};

export default function Cabinet3D({
  run,
  production = DEFAULT_PRODUCTION,
  roomWidthM,
  roomDepthM,
  facadeColor = '#D8D2C6',
  counterColor = '#3C3B37',
}: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const openParts = useInteriorStore((s) => s.openParts);
  const cutaway = useInteriorStore((s) => s.cutaway);
  const toggleOpenPart = useInteriorStore((s) => s.toggleOpenPart);

  /*
   * Окошко для приёмки (`scripts/check-cabinet3d.mjs`): сколько элементов
   * открыто. Мерить интерактив иначе нечем — из браузера состояние стора
   * не видно, а именно оно тут и проверяется. Только чтение.
   */
  useEffect(() => {
    const w = window as unknown as { __mwOpenParts?: () => number };
    w.__mwOpenParts = () => useInteriorStore.getState().openParts.length;
    return () => {
      delete w.__mwOpenParts;
    };
  }, []);

  const parts = useCabinetParts(
    useMemo(
      () => ({ facade: facadeColor, carcass: '#B9B2A4', counter: counterColor }),
      [facadeColor, counterColor],
    ),
  );

  const zone = zoneProfile(run.zone);
  const thicknessM = production.carcassMm / MM;
  const depthM = zone.depthMm / MM;
  const plinthM = GEOMETRY.base.plinthH / MM;

  /*
   * Размеры и положение считаются один раз на состав: при каждом кадре
   * пересчитывать нечего, а `useMemo` тут не украшение — ряд из семи
   * модулей это десятки мешей.
   */
  const modules = useMemo(
    () =>
      run.modules.map((unit) => {
        const heightMm = moduleCarcassHeightMm(unit, run);
        const isUpper = unit.kind === 'upper' || unit.kind === 'corner_upper';

        return {
          unit,
          x: unit.offsetMm / MM,
          // Верхние висят, нижние стоят на цоколе.
          y: isUpper
            ? GEOMETRY.upper.bottomFromFloor / MM
            : unit.section
              ? plinthM
              : plinthM,
          heightM: heightMm / MM,
          depthM: isUpper ? GEOMETRY.upper.depth / MM : depthM,
        };
      }),
    [run, depthM, plinthM],
  );

  const uppers = useMemo(
    () =>
      run.upperSegments.flatMap((segment) =>
        segment.modules.map((unit) => ({
          unit,
          // offsetMm у верхних модулей уже абсолютный: прибавлять начало
          // сегмента нельзя, иначе ряд уезжает за стену.
          x: unit.offsetMm / MM,
          y: GEOMETRY.upper.bottomFromFloor / MM,
          heightM: moduleCarcassHeightMm(unit, run) / MM,
          depthM: GEOMETRY.upper.depth / MM,
        })),
      ),
    [run],
  );

  const lengthM = run.lengthMm / MM;

  /*
   * Ряд стоит у дальней стены и центрируется по комнате — так же, как его
   * ставит `KitchenScene`: сцена одна, и мебель в ней не должна прыгать.
   */
  const originX = -Math.min(lengthM, roomWidthM) / 2;
  const originZ = -roomDepthM / 2 + depthM;

  const hasCountertop = zone.hasCountertop;
  const counterTopY = GEOMETRY.base.plinthH + GEOMETRY.base.carcassH;

  return (
    <group ref={groupRef} position={[originX, 0, originZ]}>
      <SceneProbe group={groupRef} />

      {/* Цоколь: одна планка на весь ряд, как в цеху. */}
      <mesh
        geometry={parts.box}
        material={parts.carcass}
        position={[lengthM / 2, plinthM / 2, -depthM / 2 - 0.02]}
        scale={[lengthM, plinthM, depthM * 0.9]}
        receiveShadow
      />

      {[...modules, ...uppers].map((entry) => (
        <CabinetModule3D
          key={entry.unit.id}
          unit={entry.unit}
          x={entry.x}
          y={entry.y}
          heightM={entry.heightM}
          depthM={entry.depthM}
          thicknessM={thicknessM}
          parts={parts}
          openParts={openParts}
          onToggle={toggleOpenPart}
          cutaway={cutaway}
        />
      ))}

      {/* Столешница: там, где она в этой зоне есть. */}
      {hasCountertop && (
        <mesh
          geometry={parts.box}
          material={parts.counter}
          position={[
            lengthM / 2,
            (counterTopY + GEOMETRY.base.countertopH / 2) / MM,
            -depthM / 2 - 0.02,
          ]}
          scale={[lengthM, GEOMETRY.base.countertopH / MM, depthM + 0.04]}
          castShadow
          receiveShadow
        />
      )}
    </group>
  );
}

/**
 * Окошко замера для `scripts/check-cabinet3d.mjs`: сколько мешей и
 * материалов в сцене. Производительность здесь не декларируется, а
 * меряется — ряд 3200 мм это десятки объектов, и их надо считать.
 */
function SceneProbe({ group }: { group: React.RefObject<THREE.Group> }) {
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const w = window as unknown as {
      __mwScene?: () => unknown;
      __mwPartPoint?: (id: string) => { x: number; y: number } | null;
    };

    const count = (root: THREE.Object3D | null) => {
      let meshes = 0;
      const materials = new Set<string>();
      root?.traverse((object) => {
        const mesh = object as unknown as { isMesh?: boolean; material?: { uuid?: string } };
        if (!mesh.isMesh) return;
        meshes += 1;
        if (mesh.material?.uuid) materials.add(mesh.material.uuid);
      });
      return { meshes, materials: materials.size };
    };

    w.__mwScene = () => ({ cabinet: count(group.current), scene: count(scene) });

    /** Какие элементы вообще открываются: проверке нужно во что целиться. */
    (w as { __mwOpenableIds?: () => string[] }).__mwOpenableIds = () => {
      const ids: string[] = [];
      group.current?.traverse((object) => {
        if (object.name.startsWith('part:')) ids.push(object.name.slice(5));
      });
      return ids;
    };

    /**
     * Размер зоны касания в ЭКРАННЫХ пикселях. На телефоне ящик высотой
     * 140 мм — полоска в полсантиметра, и попасть в неё пальцем нельзя;
     * поэтому у элементов есть увеличенный невидимый коллайдер, и его
     * размер надо мерить, а не обещать.
     */
    (w as { __mwPartSize?: (id: string) => { w: number; h: number } | null }).__mwPartSize = (
      id: string,
    ) => {
      const target = group.current?.getObjectByName(`part:${id}`);
      if (!target) return null;

      const box = new THREE.Box3().setFromObject(target);
      const rect = gl.domElement.getBoundingClientRect();
      const toScreen = (v: THREE.Vector3) => {
        const p = v.clone().project(camera);
        return { x: ((p.x + 1) / 2) * rect.width, y: ((1 - p.y) / 2) * rect.height };
      };

      const a = toScreen(box.min);
      const b = toScreen(box.max);
      return { w: Math.round(Math.abs(b.x - a.x)), h: Math.round(Math.abs(b.y - a.y)) };
    };

    /** Экранные координаты элемента: проверка кликает по мебели, а не наугад. */
    w.__mwPartPoint = (id: string) => {
      const target = group.current?.getObjectByName(`part:${id}`);
      if (!target) return null;

      const point = new THREE.Vector3();
      target.getWorldPosition(point);
      point.project(camera);

      const box = gl.domElement.getBoundingClientRect();
      return {
        x: box.left + ((point.x + 1) / 2) * box.width,
        y: box.top + ((1 - point.y) / 2) * box.height,
      };
    };

    return () => {
      delete w.__mwScene;
      delete w.__mwPartPoint;
      delete (w as { __mwOpenableIds?: unknown }).__mwOpenableIds;
      delete (w as { __mwPartSize?: unknown }).__mwPartSize;
    };
  }, [scene, camera, gl, group]);

  return null;
}

/** Все открываемые элементы ряда: по ним работает «Открыть всё». */
export function openablePartIds(run: Run): string[] {
  const ids: string[] = [];

  for (const unit of [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)]) {
    if (unit.appliance) continue;

    unit.fill?.drawerHeights.forEach((_, i) => ids.push(`${unit.id}:drawer:${i}`));

    if (unit.frontType === 'door') {
      for (let i = 0; i < unit.doorCount; i++) ids.push(`${unit.id}:door:${i}`);
    }
  }

  return ids;
}
