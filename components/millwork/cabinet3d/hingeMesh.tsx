'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { BoxDraw, HingeDraw } from '@/lib/millwork/cabinetBoxes';
import { hingeHalfMesh, hingeLinkSegments, pushBeam, type MeshData } from '@/lib/millwork/hingeMeshData';
import { hingeParts } from '@/lib/millwork/hingeModel';
import { reportSceneAnomaly } from './sceneAnomalies';
import { TwinModel } from './twinAsset';

/**
 * ПЕТЛИ В СЦЕНЕ (HW-03).
 *
 * Сетка — `hingeHalfMesh` (мм → метры), начало — ось чашки на тыле фасада.
 * Закрытые петли — пачкой на модель, половину и сторону (`HingeBatch`): чашка
 * с фланцем, корпусом шарнира и звеньями в закрытой позе; планка и плечо на
 * боковине. Открытая створка везёт чашку своей сеткой (`HingeMesh`), а звенья
 * строит `HingeLinks` на каждом шаге хода: одна точка на плече, другая на
 * корпусе шарнира, повёрнутая вместе с полотном.
 */

const MM = 1000;
type Entry = { geometry: THREE.BufferGeometry; users: number };
const cache = new Map<string, Entry>();

export function hingeGeometryKey(draw: HingeDraw, fine: boolean, withLinks: boolean): string {
  return `${draw.model.key}|${draw.half}|${draw.mirror ? 'R' : 'L'}|${draw.sideInnerXMm}|${fine ? 'f' : 'c'}|${withLinks ? 'l' : ''}|${draw.twin?.asset.sha256 ?? ''}`;
}

function build(draw: HingeDraw, fine: boolean, withLinks: boolean): THREE.BufferGeometry {
  const mesh = hingeHalfMesh(draw.model, draw.half, draw.sideInnerXMm, draw.mirror, fine, withLinks);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions.map((v) => v / MM), 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
  geometry.setIndex(mesh.indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function useHingeGeometry(draw: HingeDraw | undefined, fine: boolean, withLinks: boolean): THREE.BufferGeometry | null {
  const key = draw ? hingeGeometryKey(draw, fine, withLinks) : null;
  const geometry = useMemo(() => {
    if (!draw || !key) return null;
    let entry = cache.get(key);
    if (!entry) {
      entry = { geometry: build(draw, fine, withLinks), users: 0 };
      cache.set(key, entry);
    }
    return entry.geometry;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!key) return;
    const entry = cache.get(key);
    if (!entry) return;
    entry.users += 1;
    return () => {
      entry.users -= 1;
      if (entry.users <= 0) {
        entry.geometry.dispose();
        cache.delete(key);
      }
    };
  }, [key]);
  return geometry;
}

/** Сколько сеток петель держит сцена — приёмка сверяет, что смена петли их не копит. */
export function hingeGeometryCount(): number {
  return cache.size;
}

/** Пачка закрытых петель одной модели, половины и стороны: один вызов отрисовки. */
export function HingeBatch({
  boxes,
  material,
  fine,
  castShadow,
}: {
  boxes: (BoxDraw & { part?: string; hinge?: HingeDraw })[];
  material: THREE.Material;
  fine: boolean;
  castShadow: boolean;
}) {
  const draw = boxes[0]?.hinge;
  const geometry = useHingeGeometry(draw, fine, draw?.half === 'cup');
  const ref = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    boxes.forEach((box, i) => {
      const o = box.hinge!.origin;
      matrix.makeTranslation(o[0], o[1], o[2]);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [boxes, geometry, material, invalidate]);
  /* Модель из реестра 3D (ТЗ 2026-10-31, § 6): на каждую петлю — модель файла на её оси чашки. */
  if (draw?.twin) {
    const twin = draw.twin;
    return (
      <>
        {boxes.map((box, i) => (
          <TwinModel key={i} twin={twin} role={box.hinge!.half === 'cup' ? 'moving' : 'fixed'} anchorM={box.hinge!.origin} mirror={box.hinge!.mirror} name="hinge-twin" />
        ))}
        {/* Звенья четырёхзвенника закрытых петель — в файле их нет: одна сетка на пачку. */}
        {draw.half === 'cup' && draw.model.linkage && <ClosedLinks boxes={boxes} material={material} />}
      </>
    );
  }
  if (!geometry || boxes.length === 0) return null;
  return (
    <instancedMesh
      key={`${boxes.length}|${geometry.uuid}`}
      ref={ref}
      name="hinge"
      args={[geometry, material, boxes.length]}
      castShadow={castShadow}
      userData={{ hingeHalf: draw?.half, hingeModel: draw?.model.key, hingeStatus: draw?.model.status }}
    />
  );
}

/** Звенья закрытых петель с четырёхзвенником (модель реестра): одна сетка на пачку, метры ряда. */
function ClosedLinks({ boxes, material }: { boxes: (BoxDraw & { hinge?: HingeDraw })[]; material: THREE.Material }) {
  const geometry = useMemo(() => {
    const mesh: MeshData = { positions: [], normals: [], indices: [] };
    for (const box of boxes) {
      const h = box.hinge!;
      const sx = h.mirror ? -1 : 1;
      const at = (p: [number, number, number]): [number, number, number] => [h.origin[0] * 1000 + p[0] * sx, h.origin[1] * 1000 + p[1], h.origin[2] * 1000 + p[2]];
      for (const link of hingeParts(h.model, h.sideInnerXMm).links) pushBeam(mesh, at(link.fixed), at(link.moving), link.widthMm, false, link.thicknessMm ?? link.widthMm);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions.map((v) => v / MM), 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
    g.setIndex(mesh.indices);
    g.computeBoundingSphere();
    return g;
  }, [boxes]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh name="hinge-links-closed" geometry={geometry} material={material} castShadow />;
}

/** Чашка на едущем полотне — в координатах группы створки. */
export function HingeMesh({ draw, position, material, fine }: { draw: HingeDraw; position: [number, number, number]; material: THREE.Material; fine: boolean }) {
  const geometry = useHingeGeometry(draw, fine, false);
  /* Едущая чашка из реестра 3D — часть «moving» модели на той же оси. */
  if (draw.twin) return <TwinModel twin={draw.twin} role="moving" anchorM={position} mirror={draw.mirror} name="rider:hinge" />;
  if (!geometry) return null;
  return <mesh name="rider:hinge" geometry={geometry} material={material} position={position} castShadow />;
}

/**
 * ЗВЕНЬЯ НА ХОДУ: неподвижная точка — на плече (корпус), подвижная — на
 * корпусе шарнира чашки, которую `toCarcass` переводит из осей полотна в оси
 * ряда (тот же поворот, что у группы створки). Брусок ставится между ними.
 */
export function HingeLinks({
  draws,
  material,
  toCarcass,
  angleRef,
  part,
}: {
  draws: HingeDraw[];
  material: THREE.Material;
  /** Створка, чьи это звенья, — приёмке (`__mwHingeLinks(part)`). */
  part?: string;
  /** Точка (метры ряда, закрытая поза) → та же точка полотна при угле `angle`. */
  toCarcass: (p: [number, number, number], angle: number) => [number, number, number];
  angleRef: { current: number };
}) {
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  /* Длины звеньев в закрытой позе: на ходу у жёсткого звена они те же (приёмка сверяет). */
  const closedLengths = useMemo(() => hingeLinkSegments(draws, (p) => p).map((seg) => seg.length), [draws]);
  const count = closedLengths.length;
  const up = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const reported = useRef(false);
  const apply = () => {
    hingeLinkSegments(draws, (p) => toCarcass(p, angleRef.current)).forEach((pose, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      /*
       * ПРЕДОХРАНИТЕЛЬ: звено длиннее физически возможного — ошибка осей, а не
       * петля. Не рисуется, разработчику — диагностика (`__mwSceneAnomalies`).
       */
      const anomalous = !(pose.length <= pose.maxLength);
      mesh.visible = !anomalous;
      if (anomalous) {
        if (!reported.current) {
          reported.current = true;
          reportSceneAnomaly({ what: 'hinge-link', lengthM: pose.length, maxM: pose.maxLength });
        }
        return;
      }
      mesh.userData.length = pose.length;
      mesh.userData.closed = closedLengths[i];
      mesh.position.set(...pose.mid);
      /* Пластина звена: длина по оси звена, толщина вдоль осей шарнира (Y), ширина — в плоскости хода. */
      mesh.scale.set(pose.length + pose.width, pose.thickness, pose.width);
      mesh.quaternion.setFromUnitVectors(up, new THREE.Vector3(...pose.dir));
    });
  };
  /* Поза на каждом кадре хода: угол створки пишет `useSlide` через `angleRef`. */
  useFrame(() => apply());
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          name="hinge-link"
          geometry={geometry}
          material={material}
          userData={{ part }}
        />
      ))}
    </>
  );
}
