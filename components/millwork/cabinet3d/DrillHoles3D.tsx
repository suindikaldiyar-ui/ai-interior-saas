'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Hole3d, Part3d } from '@/lib/millwork/drillHoles3d';
import type { Fastener3d } from '@/lib/millwork/fasteners3d';
import { DRILL_ROLE_TITLE, type DrillRole } from '@/lib/millwork/drillingPlan';
import { useInteriorStore } from '@/store/useInteriorStore';

/**
 * ПРИСАДКА 3D В СЦЕНЕ (ТЗ 2026-10-31, § 11).
 *
 * Отверстия — операции `drillingPlan`, перенесённые на коробки сцены
 * (`drillHoles3d`): устье на грани детали, ось — внутрь, Ø и глубина — числа
 * операции. Своего числа здесь нет ни одного: цилиндр — это Ø × глубина,
 * поставленный по оси. Над гранью он выступает на 0,3 мм, иначе крышка
 * цилиндра спорит с гранью детали за каждый пиксель.
 *
 * Это инженерный вид: в «Интерьере» его нет вовсе (сцена его не монтирует),
 * а отверстия, закрытые фасадом, закрыты и здесь — глубина не отключается.
 * Отверстия видны там, где их видно на детали: на открытой створке, на
 * внутренней пласти боковины за открытой дверцей, снаружи боковины.
 */

/** Цвет вида отверстия — один на сцену и подписи панели. */
export const DRILL_ROLE_COLOR: Record<DrillRole, string> = {
  hinge_cup: '#D9482B',
  hinge_cup_fix: '#E9895B',
  hinge_plate: '#E0A21C',
  runner_cabinet: '#8E5BD6',
  runner_drawer: '#B78AF0',
  handle: '#D6458F',
  shelf_support: '#2C8FD6',
  confirmat_face: '#2E9E55',
  confirmat_edge: '#1F6F3C',
};

const PROUD_M = 0.0003;
const UP = new THREE.Vector3(0, 1, 0);

/** Пачка отверстий одного вида: один вызов отрисовки. */
function RoleBatch({ role, holes, dim }: { role: DrillRole; holes: Hole3d[]; dim: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const geometry = useMemo(() => new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1, false), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: DRILL_ROLE_COLOR[role], transparent: dim, opacity: dim ? 0.35 : 1, depthWrite: !dim }),
    [role, dim],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  /*
   * Матрицы — и при смене материала (ловушка 723): материал в `args`, R3F
   * пересоздаёт меш, и новый рождается с единичными матрицами.
   */
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    const at = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const size = new THREE.Vector3();
    holes.forEach((hole, i) => {
      dir.set(hole.dir[0], hole.dir[1], hole.dir[2]);
      turn.setFromUnitVectors(UP, dir);
      /* От 0,3 мм над устьем до дна; сквозное — и на 0,3 мм за выходом. */
      const length = hole.depthM + PROUD_M * (hole.through ? 2 : 1);
      at.set(hole.at[0], hole.at[1], hole.at[2]).addScaledVector(dir, length / 2 - PROUD_M);
      size.set(hole.diameterM, length, hole.diameterM);
      matrix.compose(at, turn, size);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [holes, material, invalidate]);
  return (
    <instancedMesh
      key={holes.length}
      ref={ref}
      args={[geometry, material, holes.length]}
      name={`drill:${role}`}
      /* Вид, а не мебель: путь-трассировка и счётчики мебели его не берут (`helper`). */
      userData={{ helper: true, drill: role, holes: holes.length, dim }}
      renderOrder={2}
    />
  );
}

const same = (a: THREE.Matrix4, b: THREE.Matrix4) => a.elements.every((v, i) => Math.abs(v - b.elements[i]) < 1e-7);

/**
 * ОТВЕРСТИЯ ЕДУТ С ДЕТАЛЬЮ. Чашки петель — на тыле створки, и видны они
 * только у открытой; отверстие, оставшееся там, где створка была закрыта,
 * висело бы в воздухе. Здесь — сдвиг подвижной детали сцены (`part:<ИД>` и
 * группа хода над ним) от её закрытого положения: закрытое снимается, пока
 * деталь закрыта и стоит; открыта до показа — отверстия прячутся, пока не
 * закроют (закрытого положения ещё не видели). Своей позы хода здесь нет.
 */
function Carried({ carrier, children }: { carrier: string; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const invalidate = useThree((state) => state.invalidate);
  const openParts = useInteriorStore((state) => state.openParts);
  const open = useRef(openParts);
  open.current = openParts;
  const pose = useRef<{ rest: THREE.Matrix4 | null; last: THREE.Matrix4 | null }>({ rest: null, last: null });
  useFrame(() => {
    const own = ref.current;
    /* own → «drill-holes» → корень ряда. */
    const root = own?.parent?.parent;
    if (!own || !root) return;
    const mover = root.getObjectByName(`part:${carrier}`)?.parent;
    if (!mover) {
      if (!own.visible) return;
      own.visible = false;
      invalidate();
      return;
    }
    root.updateWorldMatrix(true, false);
    mover.updateWorldMatrix(true, false);
    const rel = root.matrixWorld.clone().invert().multiply(mover.matrixWorld);
    const p = pose.current;
    const closed = !open.current.includes(carrier);
    if (closed && (!p.rest || (p.last && same(p.last, rel)))) p.rest = rel.clone();
    p.last = rel;
    const visible = Boolean(p.rest);
    const delta = p.rest ? rel.clone().multiply(p.rest.clone().invert()) : new THREE.Matrix4();
    if (own.visible !== visible || !same(own.matrix, delta)) {
      own.visible = visible;
      own.matrix.copy(delta);
      own.matrixWorldNeedsUpdate = true;
      invalidate();
    }
  });
  return (
    <group ref={ref} matrixAutoUpdate={false} name={`drill-carried:${carrier}`}>
      {children}
    </group>
  );
}

/**
 * КРЕПЁЖ ВНУТРИ ДЕТАЛИ (§ 9): стержень конфирмата по паре отверстий плана.
 * Он лежит в материале целиком. Сквозь материал (полупрозрачно, без глубины)
 * он рисуется только у подсвеченной детали, которую стягивает (боковина, дно,
 * крыша): весь крепёж кухни сквозь закрытые фасады читался стержнями в
 * воздухе, а у подсвеченной дверцы — стержнями поперёк неё. Остальной — с
 * глубиной: виден там, где виден его канал (в разрезе).
 */
function FastenerBatch({ fasteners, xray }: { fasteners: Fastener3d[]; xray: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const geometry = useMemo(() => new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1, false), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#7D8590', transparent: xray, opacity: xray ? 0.75 : 1, depthTest: !xray, depthWrite: !xray }),
    [xray],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    const at = new THREE.Vector3();
    const dir = new THREE.Vector3();
    fasteners.forEach((f, i) => {
      dir.set(f.dir[0], f.dir[1], f.dir[2]);
      turn.setFromUnitVectors(UP, dir);
      at.set(f.at[0], f.at[1], f.at[2]).addScaledVector(dir, f.lengthM / 2);
      matrix.compose(at, turn, new THREE.Vector3(f.diameterM, f.lengthM, f.diameterM));
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [fasteners, material, invalidate]);
  return (
    <instancedMesh
      key={fasteners.length}
      ref={ref}
      args={[geometry, material, fasteners.length]}
      name="fastener:confirmat"
      userData={{ helper: true, fastener: 'confirmat', count: fasteners.length, xray }}
      renderOrder={4}
    />
  );
}

/** Подсветка детали «Показать в 3D»: контур её коробки; по имени её находит камера (`part:drill:<ИД>`). */
function PartOutline({ part }: { part: Part3d }) {
  const geometry = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group name={`part:drill:${part.partId}`} position={part.position} userData={{ helper: true, drillPart: part.partId }}>
      <lineSegments geometry={geometry} scale={[part.scale[0] + 0.004, part.scale[1] + 0.004, part.scale[2] + 0.004]} renderOrder={3}>
        <lineBasicMaterial color="#D9482B" depthTest={false} transparent opacity={0.95} />
      </lineSegments>
    </group>
  );
}

let mounted = 0;

export default function DrillHoles3D({ holes, parts, focus, fasteners = [] }: { holes: Hole3d[]; parts: Part3d[]; focus: string | null; fasteners?: Fastener3d[] }) {
  const scene = useThree((state) => state.scene);
  /* Пачки: по виду и подсветке — и отдельно у каждой подвижной детали (едут с ней). */
  const batches = useMemo(() => {
    const map = new Map<string, { carrier: string | null; role: DrillRole; dim: boolean; holes: Hole3d[] }>();
    for (const hole of holes) {
      const dim = Boolean(focus) && hole.partId !== focus;
      const carrier = hole.carrier ?? null;
      const key = `${carrier ?? ''}|${hole.role}|${dim ? 1 : 0}`;
      const entry = map.get(key) ?? { carrier, role: hole.role, dim, holes: [] };
      entry.holes.push(hole);
      map.set(key, entry);
    }
    return Array.from(map.entries());
  }, [holes, focus]);
  const fixed = batches.filter(([, b]) => !b.carrier);
  /* Конфирматы корпуса не едут; у едущей детали их нет (царга и фронт крепятся фурнитурой). */
  const fixedFasteners = useMemo(() => fasteners.filter((f) => !f.carrier && !(focus && f.parts.includes(focus))), [fasteners, focus]);
  const xrayFasteners = useMemo(() => fasteners.filter((f) => !f.carrier && Boolean(focus) && f.parts.includes(focus!)), [fasteners, focus]);
  const carried = useMemo(() => {
    const map = new Map<string, [string, (typeof batches)[number][1]][]>();
    for (const entry of batches) {
      if (!entry[1].carrier) continue;
      map.set(entry[1].carrier, [...(map.get(entry[1].carrier) ?? []), entry]);
    }
    return Array.from(map.entries());
  }, [batches]);
  const focused = focus ? parts.find((p) => p.partId === focus) ?? null : null;

  /*
   * ОКОШКО ПРИЁМКИ: что нарисовано — по мешам сцены, а не по данным
   * (`check-hardware PART=drilling`): отверстий по видам, подсвеченная деталь
   * и мировые точки устьев её отверстий. Сцена одна на все ряды — считаем её целиком.
   */
  useEffect(() => {
    mounted += 1;
    const w = window as unknown as { __mwDrill3d?: () => unknown };
    w.__mwDrill3d = () => {
      const byRole: Record<string, number> = {};
      let total = 0;
      let dimmed = 0;
      let hidden = 0;
      let confirmats = 0;
      let confirmatsXray = 0;
      scene.traverse((object) => {
        if (object.userData?.fastener === 'confirmat' && object instanceof THREE.InstancedMesh) {
          confirmats += object.count;
          if (object.userData.xray) confirmatsXray += object.count;
        }
        const role = object.userData?.drill as string | undefined;
        if (!role || !(object instanceof THREE.InstancedMesh)) return;
        byRole[role] = (byRole[role] ?? 0) + object.count;
        total += object.count;
        if (object.userData.dim) dimmed += object.count;
        for (let o: THREE.Object3D | null = object; o; o = o.parent) {
          if (!o.visible) {
            hidden += object.count;
            break;
          }
        }
      });
      /* Едущие пачки: видна ли и насколько ушла от закрытого положения (угол — по матрице сдвига). */
      const carried: Record<string, { visible: boolean; movedM: number; turnedDeg: number }> = {};
      scene.traverse((object) => {
        if (!object.name.startsWith('drill-carried:')) return;
        const position = new THREE.Vector3();
        const turn = new THREE.Quaternion();
        object.matrix.decompose(position, turn, new THREE.Vector3());
        carried[object.name.slice('drill-carried:'.length)] = {
          visible: object.visible,
          movedM: position.length(),
          turnedDeg: (2 * Math.acos(Math.min(1, Math.abs(turn.w))) * 180) / Math.PI,
        };
      });
      const outline = scene.getObjectByProperty('name', `part:drill:${focus ?? '-'}`);
      const outlineCenter = outline ? new THREE.Box3().setFromObject(outline).getCenter(new THREE.Vector3()) : null;
      return { total, byRole, dimmed, hidden, carried, confirmats, confirmatsXray, focus, outline: outlineCenter ? [outlineCenter.x, outlineCenter.y, outlineCenter.z] : null };
    };
    return () => {
      mounted -= 1;
      if (mounted === 0) delete w.__mwDrill3d;
    };
  }, [scene, focus, batches]);

  return (
    <group name="drill-holes">
      {fixed.map(([key, batch]) => (
        <RoleBatch key={key} role={batch.role} holes={batch.holes} dim={batch.dim} />
      ))}
      {carried.map(([carrier, list]) => (
        <Carried key={carrier} carrier={carrier}>
          {list.map(([key, batch]) => (
            <RoleBatch key={key} role={batch.role} holes={batch.holes} dim={batch.dim} />
          ))}
        </Carried>
      ))}
      {fixedFasteners.length > 0 && <FastenerBatch fasteners={fixedFasteners} xray={false} />}
      {xrayFasteners.length > 0 && <FastenerBatch key="xray" fasteners={xrayFasteners} xray />}
      {focused && !focused.carrier && <PartOutline part={focused} />}
      {focused?.carrier && (
        <Carried carrier={focused.carrier}>
          <PartOutline part={focused} />
        </Carried>
      )}
    </group>
  );
}

/** Легенда вида: цвет и название — те же, что у отверстий в сцене. */
export function drillLegend(holes: Hole3d[]): { role: DrillRole; title: string; color: string; count: number }[] {
  const count = new Map<DrillRole, number>();
  for (const hole of holes) count.set(hole.role, (count.get(hole.role) ?? 0) + 1);
  return Array.from(count.entries()).map(([role, n]) => ({ role, title: DRILL_ROLE_TITLE[role], color: DRILL_ROLE_COLOR[role], count: n }));
}
