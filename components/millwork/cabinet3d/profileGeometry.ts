import * as THREE from 'three';
import { metalProfileOutline, type MetalProfileKind } from '@/lib/millwork/metalProfiles';

/**
 * ГЕОМЕТРИЯ СЕЧЕНИЯ МЕТАЛЛИЧЕСКОЙ ДЕТАЛИ (ТЗ 2026-10-31, § 5, 8).
 *
 * Контур движка (`metalProfileOutline`) — в единичном квадрате, выдавлен на
 * единицу вдоль Z и отцентрован: коробка пачки масштабирует его своим
 * габаритом так же, как единичный куб. Одна геометрия на вид, сечение в
 * целых миллиметрах и сторону — десятки царг и секций ряда делят её; живёт
 * со вкладкой (их несколько видов на кухню).
 */
const cache = new Map<string, THREE.BufferGeometry>();

export function profileGeometry(kind: MetalProfileKind, widthM: number, heightM: number, inner: 1 | -1): THREE.BufferGeometry {
  const w = Math.round(widthM * 10000) / 10;
  const h = Math.round(heightM * 10000) / 10;
  const key = `${kind}|${w}|${h}|${inner}`;
  const known = cache.get(key);
  if (known) return known;
  const outline = metalProfileOutline(kind, w, h, inner);
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(0, 0, -0.5);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  cache.set(key, geometry);
  return geometry;
}

/** Геометрия коробки: сечение профиля, если оно у неё есть, иначе единичный куб пачки. */
export function boxGeometryOf(box: { section?: MetalProfileKind; sectionInner?: 1 | -1; scale: [number, number, number] }, cube: THREE.BufferGeometry): THREE.BufferGeometry {
  return box.section ? profileGeometry(box.section, box.scale[0], box.scale[1], box.sectionInner ?? 1) : cube;
}

/** Ключ пачки сечения: вид, сечение в десятых мм и сторона — одна геометрия на ключ. */
export function sectionKey(box: { section?: MetalProfileKind; sectionInner?: 1 | -1; scale: [number, number, number] }): string | null {
  if (!box.section) return null;
  return `${box.section}|${Math.round(box.scale[0] * 10000)}|${Math.round(box.scale[1] * 10000)}|${box.sectionInner ?? 1}`;
}
