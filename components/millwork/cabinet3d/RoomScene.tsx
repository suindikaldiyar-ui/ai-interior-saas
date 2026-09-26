'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CAD_ROOM, cadShadeMaterial, cadShadeQuaternion } from './cadLook';
import { roomBoxes, wallsFacingAway, type Room, type RoomBox, type RoomWall } from '@/lib/millwork/room';

/**
 * КОМНАТА В СЦЕНЕ — ИЗ `roomLayout`, И ТОЛЬКО ИЗ НЕЁ (слой 53).
 *
 * Стены — коробки от внутренней грани наружу, собранные прямоугольниками
 * вокруг проёмов (`roomBoxes`); пол — по контуру комнаты, а не плоскость
 * по радиусу мебели; ригель, колонна и короб — объёмом, если вынос
 * замерен, и контуром на стене, если нет. Допущение замера полупрозрачно.
 *
 * СТЕНЫ МЕЖДУ КАМЕРОЙ И КУХНЕЙ ПРЯЧУТСЯ — и считается это от ПОЗЫ
 * камеры, а не каждым кадром: проверка стоит в `useFrame`, но
 * `invalidate` не зовёт, поэтому кадр рисуется только тогда, когда его
 * попросил кто-то другой (вращение, перелёт, правка). Ноль кадров в
 * покое от этого не страдает.
 */

const DEG = Math.PI / 180;

/**
 * Полоса затенения: центр, два орта плоскости и размер. Тёмный край — у
 * `−xAxis`: так полосу не надо крутить углами, она задаётся тем, куда
 * смотрит.
 */
type Strip = {
  key: string;
  position: [number, number, number];
  xAxis: [number, number, number];
  yAxis: [number, number, number];
  size: [number, number];
};

/**
 * ЗАТЕНЕНИЕ В УГЛАХ И У ПОЛА.
 *
 * Полосы на стыках: пол у стены, стена у пола, стена у стены. Это не
 * постобработка и не второй проход — плоскости с градиентом, собранные
 * один раз на комнату. Угол от этого читается углом, а не стыком двух
 * одинаково освещённых листов.
 */
function cornerStrips(wall: RoomWall, next: RoomWall | undefined, widthM: number): Strip[] {
  const L = wall.lengthMm / 1000;
  const H = wall.heightMm / 1000;
  const sx = wall.startMm[0] / 1000;
  const sz = wall.startMm[1] / 1000;
  const dir: [number, number, number] = [wall.dir[0], 0, wall.dir[1]];
  const inward: [number, number, number] = [wall.inward[0], 0, wall.inward[1]];
  const up: [number, number, number] = [0, 1, 0];
  const neg = (v: [number, number, number]): [number, number, number] => [-v[0], -v[1], -v[2]];
  const lift = 0.0015;
  const out: Strip[] = [];

  // Пол у стены: тёмный край на грани стены, светлеет в комнату.
  out.push({
    key: `floor-${wall.id}`,
    position: [sx + (L / 2) * dir[0] + (widthM / 2) * inward[0], lift, sz + (L / 2) * dir[2] + (widthM / 2) * inward[2]],
    xAxis: inward,
    yAxis: dir,
    size: [widthM, L],
  });
  // Стена у пола: тёмный край внизу.
  out.push({
    key: `base-${wall.id}`,
    position: [sx + (L / 2) * dir[0] + lift * inward[0], widthM / 2, sz + (L / 2) * dir[2] + lift * inward[2]],
    xAxis: up,
    yAxis: neg(dir),
    size: [widthM, L],
  });

  // Стык со следующей стеной: на этой — у её конца, на следующей — у начала.
  if (next) {
    out.push({
      key: `corner-${wall.id}`,
      position: [sx + (L - widthM / 2) * dir[0] + lift * inward[0], H / 2, sz + (L - widthM / 2) * dir[2] + lift * inward[2]],
      xAxis: neg(dir),
      yAxis: neg(up),
      size: [widthM, H],
    });
    const nDir: [number, number, number] = [next.dir[0], 0, next.dir[1]];
    const nIn: [number, number, number] = [next.inward[0], 0, next.inward[1]];
    const nsx = next.startMm[0] / 1000;
    const nsz = next.startMm[1] / 1000;
    out.push({
      key: `corner-in-${next.id}`,
      position: [nsx + (widthM / 2) * nDir[0] + lift * nIn[0], H / 2, nsz + (widthM / 2) * nDir[2] + lift * nIn[2]],
      xAxis: nDir,
      yAxis: up,
      size: [widthM, H],
    });
  }
  return out;
}

export default function RoomScene({ room }: { room: Room }) {
  const boxes = useMemo(() => roomBoxes(room), [room]);
  const unitBox = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const unitEdges = useMemo(() => new THREE.EdgesGeometry(unitBox), [unitBox]);

  /*
   * Материалы — по одному на роль и состояние, а не на коробку: стен
   * бывает три, кусков у них десяток, и материал на каждый — это
   * десяток шейдеров ради одного цвета.
   */
  const materials = useMemo(() => {
    const solid = (color: string) =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.95,
        metalness: 0,
        /*
         * Задняя стенка корпуса и грань стены лежат в ОДНОЙ плоскости:
         * данные не двигаем, а стене даём уступить в глубине. Без этого
         * мерцание на каждом шкафу у стены.
         */
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 2,
      });
    const assumed = (color: string) => {
      const material = solid(color);
      material.transparent = true;
      material.opacity = CAD_ROOM.assumedOpacity;
      material.depthWrite = false;
      return material;
    };
    const floor = new THREE.MeshStandardMaterial({
      color: CAD_ROOM.floor,
      roughness: 0.92,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 2,
    });
    const floorAssumed = floor.clone();
    floorAssumed.transparent = true;
    floorAssumed.opacity = CAD_ROOM.assumedOpacity;
    floorAssumed.depthWrite = false;
    return {
      wall: solid(CAD_ROOM.wall),
      wallAssumed: assumed(CAD_ROOM.wall),
      object: solid(CAD_ROOM.object),
      objectAssumed: assumed(CAD_ROOM.object),
      contour: new THREE.MeshBasicMaterial({
        color: CAD_ROOM.contour,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
      contourLine: new THREE.LineBasicMaterial({ color: CAD_ROOM.contour }),
      floor,
      floorAssumed,
      shade: cadShadeMaterial(CAD_ROOM.corner),
    };
  }, []);

  useEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose();
      unitBox.dispose();
      unitEdges.dispose();
    },
    [materials, unitBox, unitEdges],
  );

  /* Пол по контуру комнаты: многоугольник на уровне пола. */
  const floorGeometry = useMemo(() => {
    if (!room.floor || room.floor.length < 3) return null;
    const shape = new THREE.Shape(room.floor.map(([x, z]) => new THREE.Vector2(x / 1000, -z / 1000)));
    return new THREE.ShapeGeometry(shape);
  }, [room.floor]);
  useEffect(() => () => floorGeometry?.dispose(), [floorGeometry]);

  const strips = useMemo(
    () =>
      new Map(
        room.walls.map((wall, i) => [wall.index, cornerStrips(wall, room.walls[i + 1], CAD_ROOM.cornerM)]),
      ),
    [room.walls],
  );

  /* ── Какие стены закрывают кухню от камеры ── */
  const groups = useRef(new Map<number, THREE.Group>());
  const get = useThree((state) => state.get);
  const pose = useRef('');

  const cull = () => {
    const camera = get().camera;
    const hidden = new Set(wallsFacingAway(room, [camera.position.x * 1000, camera.position.z * 1000]));
    groups.current.forEach((group, index) => {
      group.visible = !hidden.has(index);
    });
  };

  useFrame(() => {
    const p = get().camera.position;
    const key = `${p.x.toFixed(3)}:${p.z.toFixed(3)}`;
    if (key === pose.current) return;
    pose.current = key;
    cull();
  });

  useEffect(() => {
    pose.current = '';
    cull();
    // Комната сменилась — пересчитать, кто её закрывает, сразу.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const materialOf = (box: RoomBox): THREE.Material => {
    if (box.role === 'contour') return materials.contour;
    if (box.role === 'object') return box.state === 'assumed' ? materials.objectAssumed : materials.object;
    return box.state === 'assumed' ? materials.wallAssumed : materials.wall;
  };

  return (
    <group name="room">
      {floorGeometry && (
        <mesh
          name="floor"
          geometry={floorGeometry}
          material={room.floorState === 'assumed' ? materials.floorAssumed : materials.floor}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        />
      )}

      {room.walls.map((wall) => (
        <group
          key={wall.id}
          name={`wall:${wall.id}`}
          userData={{ wallIndex: wall.index, lengthMm: wall.lengthMm, heightMm: wall.heightMm }}
          ref={(node) => {
            if (node) groups.current.set(wall.index, node);
            else groups.current.delete(wall.index);
          }}
        >
          {boxes
            .filter((box) => box.wallIndex === wall.index)
            .map((box) => (
              <group
                key={box.key}
                position={box.center}
                rotation={[0, box.rotationYDeg * DEG, 0]}
                scale={box.size}
              >
                <mesh
                  name={box.role === 'wall' || box.role === 'corner' ? 'wall-piece' : `${box.kind}:${box.objectId}`}
                  userData={{ role: box.role, objectId: box.objectId, kind: box.kind }}
                  geometry={unitBox}
                  material={materialOf(box)}
                  receiveShadow={box.role !== 'contour'}
                />
                {box.role === 'contour' && (
                  <lineSegments geometry={unitEdges} material={materials.contourLine} />
                )}
              </group>
            ))}

          {(strips.get(wall.index) ?? []).map((strip) => (
            <mesh
              key={strip.key}
              name="shade"
              position={strip.position}
              quaternion={cadShadeQuaternion(strip.xAxis, strip.yAxis)}
              material={materials.shade}
              renderOrder={1}
            >
              <planeGeometry args={strip.size} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
