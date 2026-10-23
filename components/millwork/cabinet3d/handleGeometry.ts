import * as THREE from 'three';
import { handleBoundsMm } from '@/lib/millwork/handleModel';
import { handleMesh, type HandleMeshData } from '@/lib/millwork/handleMeshData';
import type { HandleDraw } from '@/lib/millwork/cabinetBoxes';

/**
 * СЕТКА РУЧКИ В БУФЕРЕ THREE (HANDLE-REAL) — без React: её берут и сцена
 * (`handleMesh.tsx`, с кэшем и учётом держащих), и отрисовщик картинок
 * (`moduleThumb`). Считает сетку чистый `handleMesh` — его меряет приёмка;
 * здесь она только переводится в метры и центрируется В ЦЕНТРЕ ГАБАРИТА:
 * экземпляр встаёт на место коробки ручки (`PartBox.position`) без
 * растяжения, как рельеф фасада.
 */

const MM = 1000;

function toGeometry(data: HandleMeshData, center: [number, number, number]): THREE.BufferGeometry {
  const positions = new Float32Array(data.positions.length);
  for (let i = 0; i < data.positions.length; i += 3) {
    positions[i] = (data.positions[i] - center[0]) / MM;
    positions[i + 1] = (data.positions[i + 1] - center[1]) / MM;
    positions[i + 2] = (data.positions[i + 2] - center[2]) / MM;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.normals), 3));
  geometry.setIndex(data.indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export type HandleGeometry = { body: THREE.BufferGeometry; accent: THREE.BufferGeometry | null };

/** Тело ручки и её кольца или дно — в метрах, центр в центре габарита. */
export function buildHandleGeometry(draw: HandleDraw, fine: boolean): HandleGeometry {
  const mesh = handleMesh(draw.model, draw.orient, draw.frontMm, fine);
  const box = handleBoundsMm(draw.model, draw.orient, draw.frontMm);
  const center: [number, number, number] = [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
  const body = toGeometry(mesh.body, center);
  const accent = mesh.accent ? toGeometry(mesh.accent, center) : null;
  /* Чем ручка нарисована — для приёмки: форма, статус, габарит в мм и треугольники. */
  const triangles = mesh.body.indices.length / 3 + (mesh.accent ? mesh.accent.indices.length / 3 : 0);
  const info = {
    handle: true,
    key: draw.model.key,
    shape: draw.model.shape,
    status: draw.model.status,
    orient: draw.orient,
    sizeMm: [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]].map((v) => Math.round(v * 100) / 100),
    triangles,
    accent: mesh.accentKind,
  };
  body.userData = info;
  if (accent) accent.userData = { ...info, part: 'accent' };
  return { body, accent };
}

/** Чем закрашено второе тело ручки: резиновые кольца кнопки или тёмное дно врезной. */
export function accentKindOf(draw: HandleDraw, geometry: HandleGeometry): 'rubber' | 'cavity' | null {
  if (!geometry.accent) return null;
  return draw.model.shape === 'flush' ? 'cavity' : 'rubber';
}
