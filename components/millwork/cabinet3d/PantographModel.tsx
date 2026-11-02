'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PartBox } from '@/lib/millwork/cabinetBoxes';
import { VITAFLEX_PRINTED, VITAFLEX_TRACE, pantographPose, type PantographFinish } from '@/lib/millwork/pantograph';
import { useInteriorStore } from '@/store/useInteriorStore';
import { HANDLE_ENV_INTENSITY, cadEnvironment } from './cadLook';
import { useSlide } from './useSlide';

/**
 * ПАНТОГРАФ В СЦЕНЕ (решение владельца 2026-11-01, п. 3) — механизм, а не брусок.
 *
 * На каждой боковине отсека — корпус механизма с осью; тяги обеих сторон поворачиваются ОДНОЙ
 * величиной (`pantographPose` — их концы держит одна штанга), штанга идёт по дуге без поворота,
 * ручка висит на середине штанги. Нажатие опускает или поднимает; нажатие на ходу — останавливает
 * в промежуточном положении (угол — `openDegrees`, состояние сцены). Геометрия — `pantographGeometry`
 * (мм модуля), модель ставится от центра коробки (`anchorMm` ↔ `position`).
 */

const BODY: Record<PantographFinish, string> = {
  white: '#eeeeea',
  grey: '#9a9c9f',
  black: '#1e1f21',
  brown: '#4b382c',
  anthracite: '#3a3c40',
};

type Mats = { body: THREE.MeshStandardMaterial; trim: THREE.MeshStandardMaterial; chrome: THREE.MeshStandardMaterial };
const matCache = new WeakMap<THREE.WebGLRenderer, Map<string, Mats>>();
function materialsFor(gl: THREE.WebGLRenderer, body: PantographFinish, economy: boolean): Mats {
  let map = matCache.get(gl);
  if (!map) {
    map = new Map();
    matCache.set(gl, map);
  }
  const key = `${body}|${economy ? 'e' : 'f'}`;
  let m = map.get(key);
  if (!m) {
    const env = economy ? null : cadEnvironment(gl);
    const chrome = new THREE.MeshStandardMaterial({ color: '#d9dbde', metalness: 1, roughness: 0.14, envMap: env, envMapIntensity: env ? HANDLE_ENV_INTENSITY : 1 });
    chrome.name = 'pantograph:chrome';
    const bodyMat = new THREE.MeshStandardMaterial({ color: BODY[body], metalness: 0.15, roughness: 0.42, envMap: env, envMapIntensity: env ? 0.6 : 1 });
    bodyMat.name = `pantograph:${body}`;
    const trim = new THREE.MeshStandardMaterial({ color: new THREE.Color(BODY[body]).multiplyScalar(body === 'white' ? 0.86 : 1.25), metalness: 0, roughness: 0.6 });
    trim.name = `pantograph:${body}:plastic`;
    m = { body: bodyMat, trim, chrome };
    map.set(key, m);
  }
  return m;
}

const MM = 1000;
/** Плоский контур (u — вдоль Z, v — вдоль Y), выдавленный вдоль X на `thick` мм, начало — x0. */
function extrudeZY(points: [number, number][], x0: number, thick: number, inward: 1 | -1): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z / MM, y / MM)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick / MM, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 2, curveSegments: 10 });
  /* (u, v, e) → (x = e, y = v, z = −u): поворот вокруг Y на +90°. */
  g.rotateY(Math.PI / 2);
  g.translate(inward === 1 ? x0 / MM : (x0 - thick) / MM, 0, 0);
  g.computeVertexNormals();
  return g;
}
function roundRect(z0: number, y0: number, z1: number, y1: number, r: number): [number, number][] {
  const pts: [number, number][] = [];
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
/** Тяга: полоса шириной `w` по S-образной средней линии от оси (0, 0) к концу `tip` (мм). */
function armOutline(tip: [number, number], w: number, bend: number): [number, number][] {
  const n = 24;
  const len = Math.hypot(tip[0], tip[1]);
  const u: [number, number] = [tip[0] / len, tip[1] / len];
  const nrm: [number, number] = [-u[1], u[0]];
  const mid: [number, number][] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const off = bend * Math.sin(2 * Math.PI * t) * (1 - t * 0.3);
    mid.push([u[0] * len * t + nrm[0] * off, u[1] * len * t + nrm[1] * off]);
  }
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= n; i += 1) {
    const a = mid[Math.max(0, i - 1)];
    const b = mid[Math.min(n, i + 1)];
    const d = [b[0] - a[0], b[1] - a[1]];
    const l = Math.hypot(d[0], d[1]) || 1;
    const p: [number, number] = [-d[1] / l, d[0] / l];
    /* К концам полоса шире: проушина у оси, захват штанги у конца. */
    const ww = (w / 2) * (i === 0 || i === n ? 1.25 : 1);
    left.push([mid[i][0] + p[0] * ww, mid[i][1] + p[1] * ww]);
    right.push([mid[i][0] - p[0] * ww, mid[i][1] - p[1] * ww]);
  }
  return [...left, ...right.reverse()];
}

/* Зонды приёмки: поза каждого пантографа в мире. */
const probes = new Map<string, () => unknown>();
export function pantographProbe(): unknown[] {
  return Array.from(probes.values()).map((f) => f());
}

type Props = { box: PartBox; open: boolean; onToggle: (id: string) => void; shadows: boolean };

export function PantographModel({ box, open, onToggle, shadows }: Props) {
  const draw = box.pantograph!;
  const id = box.part!;
  const { geom, spec, anchorMm } = draw;
  const gl = useThree((s) => s.gl);
  const economy = useInteriorStore((s) => s.economyMode);
  const degree = useInteriorStore((s) => s.openDegrees[id]);
  const mats = useMemo(() => materialsFor(gl, spec.body, economy), [gl, spec.body, economy]);
  const T = VITAFLEX_TRACE;
  const swingDeg = Math.abs((geom.swingRad * 180) / Math.PI);
  const target = open ? (degree !== undefined ? Math.max(0, Math.min(1, degree / swingDeg)) : 1) : 0;
  const value = useRef(target);
  const lastDir = useRef<1 | -1>(open ? 1 : -1);
  const arms = useRef<(THREE.Group | null)[]>([]);
  const rail = useRef<THREE.Group>(null);
  const root = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  /* Зонд — только у холста, который рисует (ловушка 800): скрытая сцена захвата монтирует ту же модель. */
  const drawing = useThree((s) => s.frameloop !== 'never');

  /* Точка модуля (мм) → местные метры группы. */
  const L = (x: number, y: number, z: number): [number, number, number] => [(x - anchorMm[0]) / MM, (y - anchorMm[1]) / MM, (z - anchorMm[2]) / MM];

  const parts = useMemo(() => {
    const housingThick = VITAFLEX_PRINTED.housingFromSideMm - T.armThicknessMm - 6;
    const h = geom.housing;
    const sides = geom.sides.map((side) => {
      /* Корпус и крышка — в местных метрах группы (от `anchorMm`). */
      const housing = extrudeZY(roundRect(h.z0, h.y0, h.z1, h.y1, 18), side.x, housingThick, side.inward).translate(-anchorMm[0] / MM, -anchorMm[1] / MM, -anchorMm[2] / MM);
      const cover = extrudeZY(roundRect(h.z0 + 14, h.y0 + 18, h.z1 - 14, h.y1 - 40, 12), side.x + side.inward * housingThick, 2, side.inward).translate(-anchorMm[0] / MM, -anchorMm[1] / MM, -anchorMm[2] / MM);
      const armX = side.x + side.inward * (housingThick + 6);
      const tip: [number, number] = [geom.raised.z - geom.pivot.z, geom.raised.y - geom.pivot.y];
      const arm = extrudeZY(armOutline(tip, T.armWidthMm, T.armBendMm), armX, T.armThicknessMm, side.inward);
      return { side, housing, cover, arm, armX, tip };
    });
    const railLen = geom.railToMm - geom.railFromMm;
    const railGeo = new THREE.CylinderGeometry(T.railDiameterMm / 2 / MM, T.railDiameterMm / 2 / MM, railLen / MM, 28);
    railGeo.rotateZ(Math.PI / 2);
    const capGeo = new THREE.CylinderGeometry((T.railDiameterMm / 2 + 2.5) / MM, (T.railDiameterMm / 2 + 2.5) / MM, 8 / MM, 24);
    capGeo.rotateZ(Math.PI / 2);
    const pinGeo = new THREE.CylinderGeometry(9 / MM, 9 / MM, 10 / MM, 20);
    pinGeo.rotateZ(Math.PI / 2);
    const rodGeo = new THREE.CylinderGeometry(T.handleRodDiameterMm / 2 / MM, T.handleRodDiameterMm / 2 / MM, T.handleLengthMm / MM, 16);
    const gripGeo = new THREE.CapsuleGeometry(T.handleGripDiameterMm / 2 / MM, (T.handleGripLengthMm - T.handleGripDiameterMm) / MM, 6, 16);
    const clampGeo = new THREE.BoxGeometry(44 / MM, 34 / MM, 34 / MM);
    const touchGeo = new THREE.BoxGeometry(1, 1, 1);
    return { sides, railGeo, capGeo, pinGeo, rodGeo, gripGeo, clampGeo, touchGeo, railLen };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geom, T, anchorMm]);
  useEffect(
    () => () => {
      for (const s of parts.sides) {
        s.housing.dispose();
        s.cover.dispose();
        s.arm.dispose();
      }
      for (const g of [parts.railGeo, parts.capGeo, parts.pinGeo, parts.rodGeo, parts.gripGeo, parts.clampGeo, parts.touchGeo]) g.dispose();
    },
    [parts],
  );

  const apply = (s: number) => {
    value.current = s;
    const pose = pantographPose(geom, s);
    /* Обе тяги — один угол: синхронность задана механизмом, а не двумя анимациями. */
    for (const g of arms.current) if (g) g.rotation.x = -pose.armRad;
    if (rail.current) rail.current.position.set(...L((geom.railFromMm + geom.railToMm) / 2, pose.rail.y, pose.rail.z));
  };
  useSlide({ target, initial: target, apply });
  /* Поза при монтаже (и после пересборки сеток): до первого хода `useSlide` её не ставит. */
  useEffect(() => {
    apply(value.current);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts]);

  useEffect(() => {
    if (!drawing) return;
    probes.set(id, () => {
      root.current?.updateWorldMatrix(true, true);
      const world = (o: THREE.Object3D | null | undefined, p: [number, number, number]) => {
        if (!o) return null;
        const v = new THREE.Vector3(...p).applyMatrix4(o.matrixWorld);
        return [v.x, v.y, v.z];
      };
      const sides = parts.sides.map((s, i) => ({
        pivot: world(arms.current[i], [s.armX / MM, 0, 0]),
        tip: world(arms.current[i], [s.armX / MM, s.tip[1] / MM, s.tip[0] / MM]),
        rotationX: arms.current[i]?.rotation.x ?? null,
      }));
      return {
        id,
        article: spec.article,
        body: spec.body,
        rail: spec.rail,
        handle: spec.handle,
        s: value.current,
        armDeg: ((arms.current[0]?.rotation.x ?? 0) * 180) / Math.PI,
        sides,
        railEnds: [world(rail.current, [-parts.railLen / 2 / MM, 0, 0]), world(rail.current, [parts.railLen / 2 / MM, 0, 0])],
        handleTop: world(rail.current, [0, -17 / MM, 0]),
        clash: draw.clash,
        materials: [mats.body.name, mats.chrome.name, mats.trim.name],
        ownEnv: Boolean(mats.chrome.envMap),
      };
    });
    return () => {
      probes.delete(id);
    };
  });

  const click = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    const moving = Math.abs(value.current - target) > 0.003;
    const store = useInteriorStore.getState();
    if (moving) {
      /* На ходу — стоп: механизм встаёт в промежуточном положении. */
      store.setOpenDegree(id, value.current * swingDeg);
      if (!open) onToggle(id);
      invalidate();
      return;
    }
    const held = degree !== undefined && value.current > 0.003 && value.current < 0.997;
    store.setOpenDegree(id, null);
    if (held) {
      /* Стоял посередине — продолжает в обратную сторону от последнего хода. */
      lastDir.current = lastDir.current === 1 ? -1 : 1;
      if ((lastDir.current === 1) !== open) onToggle(id);
      invalidate();
      return;
    }
    lastDir.current = open ? -1 : 1;
    onToggle(id);
  };

  const railMat = spec.rail === 'chrome' ? mats.chrome : mats.body;
  const handleMat = spec.handle === 'chrome' ? mats.chrome : mats.body;
  const handleCenterY = -(17 + T.handleLengthMm / 2);
  return (
    <group ref={root} position={box.position} name={`pantograph:${id}`} userData={{ part: id }}>
      {parts.sides.map((s, i) => (
        <group key={i}>
          <mesh geometry={s.housing} material={mats.body} castShadow={shadows} name="pantograph:housing" />
          <mesh geometry={s.cover} material={mats.trim} name="pantograph:cover" />
          {/* Ось тяги на корпусе. */}
          <mesh geometry={parts.pinGeo} material={mats.chrome} position={L(s.armX - s.side.inward * 3, geom.pivot.y, geom.pivot.z)} name="pantograph:pivot" />
          {/* Тяга поворачивается вокруг своей оси (X) — группа на оси. */}
          <group
            ref={(g) => {
              arms.current[i] = g;
            }}
            position={L(0, geom.pivot.y, geom.pivot.z)}
          >
            <mesh geometry={s.arm} material={mats.body} castShadow={shadows} name="pantograph:arm" onClick={click} />
          </group>
        </group>
      ))}
      {/* Штанга с заглушками и ручка: идут по дуге, не поворачиваясь. */}
      <group ref={rail}>
        <mesh geometry={parts.railGeo} material={railMat} castShadow={shadows} name="pantograph:rail" onClick={click} />
        {/* Зона касания штанги с ручкой (не рисуется): палец попадает в штангу Ø 25, а не в щель рядом. */}
        <mesh
          geometry={parts.touchGeo}
          visible={false}
          name={`part:${id}`}
          scale={[parts.railLen / MM, 0.07, 0.07]}
          onClick={click}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = '';
          }}
        />
        <mesh geometry={parts.capGeo} material={mats.trim} position={[-parts.railLen / 2 / MM, 0, 0]} name="pantograph:cap" />
        <mesh geometry={parts.capGeo} material={mats.trim} position={[parts.railLen / 2 / MM, 0, 0]} name="pantograph:cap" />
        <mesh geometry={parts.clampGeo} material={mats.trim} name="pantograph:clamp" onClick={click} />
        <mesh geometry={parts.rodGeo} material={handleMat} position={[0, handleCenterY / MM, 0]} name="pantograph:handle" onClick={click} />
        <mesh geometry={parts.gripGeo} material={mats.trim} position={[0, (-(17 + T.handleLengthMm) - T.handleGripLengthMm / 2 + 10) / MM, 0]} name="pantograph:grip" onClick={click} />
      </group>
    </group>
  );
}
