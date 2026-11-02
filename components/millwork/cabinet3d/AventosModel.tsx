'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PartBox } from '@/lib/millwork/cabinetBoxes';
import { aventosFrontPivots, aventosLinks, aventosPose, type AventosLink } from '@/lib/millwork/aventos';
import type { Pt } from '@/lib/millwork/hingeLinkage';
import { useInteriorStore } from '@/store/useInteriorStore';
import { HANDLE_ENV_INTENSITY, cadEnvironment } from './cadLook';
import { liftTravelOf, onLiftTravel } from './liftTravel';

/**
 * ПОДЪЁМНИК AVENTOS В СЦЕНЕ (решение владельца 2026-11-01, п. 4) — механизм, а не коробки.
 *
 * На боковине — корпус механизма с крышкой (серый пластик, как заглушки 22K8000 HGR), рычаги —
 * стальные звенья с осями, на тыле фасада — крепление (20S4200). Поза — доля хода створки
 * (`liftTravel`: её сообщает `InteractiveDoor` в том же кадре), звенья — `aventosLinks`, крепление —
 * `aventosPose`: те же функции, по которым ходит фасад (`liftPose` с механизмом). Длина каждого
 * звена на ходу постоянна — зонд `__mwAventos` её меряет.
 */

type Mats = { steel: THREE.MeshStandardMaterial; housing: THREE.MeshStandardMaterial; cover: THREE.MeshStandardMaterial; pin: THREE.MeshStandardMaterial };
const matCache = new WeakMap<THREE.WebGLRenderer, Map<string, Mats>>();
function materialsFor(gl: THREE.WebGLRenderer, economy: boolean): Mats {
  let map = matCache.get(gl);
  if (!map) {
    map = new Map();
    matCache.set(gl, map);
  }
  const key = economy ? 'e' : 'f';
  let m = map.get(key);
  if (!m) {
    const env = economy ? null : cadEnvironment(gl);
    const steel = new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 1, roughness: 0.32, envMap: env, envMapIntensity: env ? HANDLE_ENV_INTENSITY : 1 });
    steel.name = 'aventos:steel';
    const pin = new THREE.MeshStandardMaterial({ color: '#e3e5e8', metalness: 1, roughness: 0.18, envMap: env, envMapIntensity: env ? HANDLE_ENV_INTENSITY : 1 });
    pin.name = 'aventos:pin';
    const housing = new THREE.MeshStandardMaterial({ color: '#8d9095', metalness: 0.6, roughness: 0.38, envMap: env, envMapIntensity: env ? 0.7 : 1 });
    housing.name = 'aventos:housing';
    const cover = new THREE.MeshStandardMaterial({ color: '#a7aaae', metalness: 0, roughness: 0.55 });
    cover.name = 'aventos:cover';
    m = { steel, pin, housing, cover };
    map.set(key, m);
  }
  return m;
}

const MM = 1000;
/** Плоский контур в осях механизма ([z, y], мм), выдавленный вдоль X на `thick` мм от x0 (метры группы). */
function extrudeZY(points: Pt[], x0: number, thick: number, inward: 1 | -1): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z / MM, y / MM)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick / MM, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 2, curveSegments: 10 });
  g.rotateY(Math.PI / 2);
  g.translate(inward === 1 ? x0 / MM : (x0 - thick) / MM, 0, 0);
  g.computeVertexNormals();
  return g;
}
function roundRect(z0: number, y0: number, z1: number, y1: number, r: number): Pt[] {
  const pts: Pt[] = [];
  const corner = (cz: number, cy: number, a0: number) => {
    for (let i = 0; i <= 6; i += 1) {
      const a = a0 + (Math.PI / 2) * (i / 6);
      pts.push([cz + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  corner(z1 - r, y0 + r, -Math.PI / 2);
  corner(z1 - r, y1 - r, 0);
  corner(z0 + r, y1 - r, Math.PI / 2);
  corner(z0 + r, y0 + r, Math.PI);
  return pts;
}
/** Звено: полоса шириной w со скруглёнными концами вдоль +Z (в осях [z, y]) длиной len. */
function linkOutline(len: number, w: number): Pt[] {
  const r = w / 2;
  const pts: Pt[] = [];
  for (let i = 0; i <= 12; i += 1) {
    const a = -Math.PI / 2 + (Math.PI * i) / 12;
    pts.push([len + r * Math.cos(a), r * Math.sin(a)]);
  }
  for (let i = 0; i <= 12; i += 1) {
    const a = Math.PI / 2 + (Math.PI * i) / 12;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

/* Зонды приёмки: поза каждого механизма в мире. */
const probes = new Map<string, () => unknown>();
export function aventosProbe(): unknown[] {
  return Array.from(probes.values()).map((f) => f());
}

type Props = { box: PartBox; onToggle: (id: string) => void; shadows: boolean };

export function AventosModel({ box, onToggle, shadows }: Props) {
  const draw = box.aventos!;
  const { model, door, xMm, inward, underMm, anchorMm, frontTopMm, leafCenterXMm } = draw;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const economy = useInteriorStore((s) => s.economyMode);
  const mats = useMemo(() => materialsFor(gl, economy), [gl, economy]);
  /* Зонд — только у холста, который рисует (ловушка 800). */
  const drawing = useThree((s) => s.frameloop !== 'never');
  const root = useRef<THREE.Group>(null);
  const linkRefs = useRef<(THREE.Group | null)[]>([]);
  const bracket = useRef<THREE.Group>(null);
  const uRef = useRef(liftTravelOf(door));

  /* Точка механизма ([z, y] мм) → местные метры группы (от центра коробки). */
  /* Плоскость звеньев — сразу за корпусом механизма (34 мм от боковины). */
  const sideX = xMm + inward * (model.housing.sideMm + 4);
  const L = (z: number, y: number, x = sideX): [number, number, number] => [(x - anchorMm[0]) / MM, (underMm + y - anchorMm[1]) / MM, (z - anchorMm[2]) / MM];

  const parts = useMemo(() => {
    const h = model.housing;
    const off = new THREE.Matrix4().makeTranslation(-anchorMm[0] / MM, -(anchorMm[1] - underMm) / MM, -anchorMm[2] / MM);
    const housing = extrudeZY(roundRect(h.z0, h.y0, h.z1 - 1, h.y1, 10), xMm, h.sideMm - 3, inward).applyMatrix4(off);
    const cover = extrudeZY(roundRect(h.z0 + 8, h.y0 + 10, h.z1 - 10, h.y1 - 8, 7), xMm + inward * (h.sideMm - 3), 3, inward).applyMatrix4(off);
    const links0 = aventosLinks(model, 0);
    const links = links0.map((link: AventosLink) => {
      const len = Math.hypot(link.to[0] - link.from[0], link.to[1] - link.from[1]);
      const w = link.role === 'arm' ? 16 : 12;
      const thick = link.role === 'arm' ? 4 : 3;
      return { len, geo: extrudeZY(linkOutline(len, w), 0, thick, 1) };
    });
    const pinGeo = new THREE.CylinderGeometry(4 / MM, 4 / MM, 14 / MM, 18);
    pinGeo.rotateZ(Math.PI / 2);
    /* Крепление фасада: пластина на тыле от первого до последнего самореза, проушина с осями звеньев. */
    const sy = model.bracket.screwsY;
    const pivots = aventosFrontPivots(model);
    const plateY0 = Math.min(...sy) - 14;
    const plateY1 = Math.max(...sy) + 14;
    /* Пластина — поперёк плоскости рычагов (x 20…50 от боковины), проушина — в плоскости звеньев (30…46). */
    const plate = extrudeZY(roundRect(-6, plateY0, 0, plateY1, 2), inward * 20, 30, inward);
    const lugZ0 = Math.min(-6, ...pivots.map((p) => p[0] - 9));
    const lugY0 = Math.min(plateY0, ...pivots.map((p) => p[1] - 9));
    const lugY1 = Math.max(plateY0 + 30, ...pivots.map((p) => p[1] + 9));
    const lug = extrudeZY(roundRect(lugZ0, lugY0, -6, lugY1, 5), inward * 30, 16, inward);
    const screwGeo = new THREE.CylinderGeometry(4.5 / MM, 4.5 / MM, 2 / MM, 16);
    screwGeo.rotateX(Math.PI / 2);
    return { housing, cover, links, pinGeo, plate, lug, screwGeo, pivots, sy };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, xMm, inward, underMm, anchorMm]);
  useEffect(
    () => () => {
      parts.housing.dispose();
      parts.cover.dispose();
      for (const l of parts.links) l.geo.dispose();
      for (const g of [parts.pinGeo, parts.plate, parts.lug, parts.screwGeo]) g.dispose();
    },
    [parts],
  );

  /* Поза при доле хода: звенья — от своей оси к другой, крепление — поза фасада (`rotation.x = −θ`). */
  const apply = (u: number) => {
    uRef.current = u;
    const links = aventosLinks(model, u);
    links.forEach((link, i) => {
      const g = linkRefs.current[i];
      if (!g) return;
      g.position.set(...L(link.from[0], link.from[1], sideX + inward * i * 6));
      g.rotation.x = -Math.atan2(link.to[1] - link.from[1], link.to[0] - link.from[0]);
    });
    const pose = aventosPose(model, u);
    if (bracket.current) {
      bracket.current.position.set(...L(pose.shift[0], pose.shift[1], xMm));
      bracket.current.rotation.x = -pose.theta;
    }
  };
  useEffect(() => {
    apply(liftTravelOf(door));
    invalidate();
    return onLiftTravel(door, (u) => apply(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, door]);

  useEffect(() => {
    if (!drawing) return;
    const key = `${door}|${inward}`;
    probes.set(key, () => {
      root.current?.updateWorldMatrix(true, true);
      const world = (o: THREE.Object3D | null | undefined, p: [number, number, number]) => {
        if (!o) return null;
        const v = new THREE.Vector3(...p).applyMatrix4(o.matrixWorld);
        return [v.x, v.y, v.z];
      };
      const links = parts.links.map((l, i) => {
        const g = linkRefs.current[i];
        const a = world(g, [0, 0, 0]);
        const b = world(g, [0, 0, l.len / MM]);
        return { from: a, to: b, lengthMm: a && b ? Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * MM : null, designMm: l.len };
      });
      /*
       * Ось звена на креплении — через ФАСАД: группа полотна `InteractiveDoor` (родитель зоны касания
       * `part:<створка>`), в её осях — точка оси на тыле фасада. Конец звена обязан стоять на ней.
       */
      const touch = scene.getObjectByName(`part:${door}`);
      const leafGroup = touch?.parent ?? null;
      leafGroup?.updateWorldMatrix(true, false);
      const onFront = parts.pivots.map((p) => world(leafGroup, [(sideX - leafCenterXMm) / MM, (p[1] - frontTopMm) / MM, p[0] / MM]));
      return {
        door,
        side: inward === 1 ? 'left' : 'right',
        family: model.family,
        key: model.key,
        armSet: model.armSet ?? null,
        u: uRef.current,
        theta: (aventosPose(model, uRef.current).theta * 180) / Math.PI,
        links,
        onFront,
        materials: [mats.steel.name, mats.housing.name, mats.cover.name],
        ownEnv: Boolean(mats.steel.envMap),
        words: model.words,
      };
    });
    return () => {
      probes.delete(key);
    };
  });

  const click = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    onToggle(door);
  };

  return (
    <group ref={root} position={box.position} name={`aventos:${door}`} userData={{ part: door }}>
      <mesh geometry={parts.housing} material={mats.housing} castShadow={shadows} name="aventos:housing" onClick={click} />
      <mesh geometry={parts.cover} material={mats.cover} name="aventos:cover" />
      {parts.links.map((l, i) => (
        <group
          key={i}
          ref={(g) => {
            linkRefs.current[i] = g;
          }}
        >
          <mesh geometry={l.geo} material={mats.steel} castShadow={shadows} name={`aventos:${aventosLinks(model, 0)[i].role}`} onClick={click} />
          <mesh geometry={parts.pinGeo} material={mats.pin} position={[0, 0, 0]} name="aventos:pin" />
          <mesh geometry={parts.pinGeo} material={mats.pin} position={[0, 0, l.len / MM]} name="aventos:pin" />
        </group>
      ))}
      {/* Крепление фасада: едет с фасадом той же позой (`aventosPose`). */}
      <group ref={bracket}>
        <mesh geometry={parts.plate} material={mats.steel} castShadow={shadows} name="aventos:bracket" />
        <mesh geometry={parts.lug} material={mats.steel} name="aventos:bracket-lug" />
        {parts.sy.map((y) => (
          <mesh key={y} geometry={parts.screwGeo} material={mats.pin} position={[(inward * 35) / MM, y / MM, -6.5 / MM]} name="aventos:screw" />
        ))}
      </group>
    </group>
  );
}
