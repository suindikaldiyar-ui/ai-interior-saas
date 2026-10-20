'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { FrontRelief } from '@/types/millwork';
import { reliefMesh, reliefMeshKey, type ReliefLeaf } from '@/lib/millwork/facadeRelief';
import { REAL_SIZE_SHIFT } from './realSizeMap';

/**
 * ГЕОМЕТРИЯ РЕЛЬЕФА ФАСАДА В СЦЕНЕ (P3D-MDF).
 *
 * Сетку считает чистый `reliefMesh` (его меряет приёмка), здесь она только
 * кладётся в буфер three. Одинаковых фасадов в ряду много — четыре двери
 * 446 × 2392 одного рисунка, — и сетка у них одна: кэш по рисунку и
 * габариту, с учётом, кто её держит. Отпустил последний — буфер
 * освобождается: правка параметров фрезеровки не копит в видеопамяти
 * сетки прежних значений.
 *
 * Держат её пачка закрытых фасадов (`InstancedBoxes` в режиме «на месте»)
 * и едущая створка: открытая дверь — та же сетка, что закрытая в пачке,
 * поэтому рисунок не прыгает в момент открывания.
 */

type Entry = { geometry: THREE.BufferGeometry; users: number };
const cache = new Map<string, Entry>();

function build(relief: FrontRelief, leaf: ReliefLeaf): THREE.BufferGeometry {
  const mesh = reliefMesh(relief, leaf);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  /* Чем стал фасад и почему — для приёмки и подписи: рисунок мог не встать. */
  geometry.userData = { relief: true, drawn: mesh.drawn, refusal: mesh.refusal, triangles: mesh.triangles };
  return geometry;
}

/** Сетка из кэша (построить, если её нет) — без учёта, кто держит. */
export function peekReliefGeometry(relief: FrontRelief, leaf: ReliefLeaf): THREE.BufferGeometry {
  const key = reliefMeshKey(relief, leaf);
  let entry = cache.get(key);
  if (!entry) {
    entry = { geometry: build(relief, leaf), users: 0 };
    cache.set(key, entry);
  }
  return entry.geometry;
}

/** Взять сетку и запомнить, что её держат. */
export function acquireReliefGeometry(relief: FrontRelief, leaf: ReliefLeaf): THREE.BufferGeometry {
  const geometry = peekReliefGeometry(relief, leaf);
  cache.get(reliefMeshKey(relief, leaf))!.users += 1;
  return geometry;
}

/** Отпустить сетку; последний отпустивший освобождает буфер. */
export function releaseReliefGeometry(relief: FrontRelief, leaf: ReliefLeaf): void {
  const key = reliefMeshKey(relief, leaf);
  const entry = cache.get(key);
  if (!entry) return;
  entry.users -= 1;
  if (entry.users <= 0) {
    entry.geometry.dispose();
    cache.delete(key);
  }
}

/** Сколько сеток рельефа держит сцена — приёмка сверяет, что правки их не копят. */
export function reliefGeometryCount(): number {
  return cache.size;
}

/** Габарит фасада по коробке: лицо на зрителя — X × Y × Z, фасад Б угла — Z × Y × X. */
export function leafOfBox(scale: [number, number, number], face?: '-x'): ReliefLeaf {
  const [sx, sy, sz] = scale;
  return face === '-x'
    ? { widthMm: sz * 1000, heightMm: sy * 1000, thicknessMm: sx * 1000 }
    : { widthMm: sx * 1000, heightMm: sy * 1000, thicknessMm: sz * 1000 };
}

/**
 * Сетка рельефа для одного меша (едущая створка). Пока рельефа нет —
 * `null`, и меш рисует свою коробку, как раньше.
 */
export function useReliefGeometry(relief: FrontRelief | undefined, leaf: ReliefLeaf): THREE.BufferGeometry | null {
  const key = relief ? reliefMeshKey(relief, leaf) : null;
  /* Сетка — сразу, в отрисовке; учёт держащих — в эффекте, парой «взял — отпустил». */
  const geometry = useMemo(
    () => (relief ? peekReliefGeometry(relief, leaf) : null),
    // Ключ — рисунок и габарит: сам объект рельефа пересоздаётся чаще.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  useEffect(() => {
    if (!relief) return;
    acquireReliefGeometry(relief, leaf);
    return () => releaseReliefGeometry(relief, leaf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return geometry;
}

/**
 * СЕТКА ЕДУЩЕГО ФАСАДА СО СДВИГОМ РИСУНКА — тот же кусок дерева, что у него
 * закрытого в пачке (ключ — идентификатор детали, `realSizeShiftOf`).
 * Буферы вершин общие с кэшем; своя у меша только обёртка и атрибут сдвига,
 * поэтому `dispose` её не вызывается: он снял бы с видеокарты общие буферы.
 */
export function useShiftedRelief(geometry: THREE.BufferGeometry | null, shift: [number, number]): THREE.BufferGeometry | null {
  return useMemo(() => {
    if (!geometry) return null;
    const own = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const attribute = geometry.getAttribute(name);
      if (attribute) own.setAttribute(name, attribute);
    }
    const count = geometry.getAttribute('position').count;
    const data = new Float32Array(count * 2);
    for (let i = 0; i < count; i += 1) {
      data[i * 2] = shift[0];
      data[i * 2 + 1] = shift[1];
    }
    own.setAttribute(REAL_SIZE_SHIFT, new THREE.BufferAttribute(data, 2));
    own.boundingBox = geometry.boundingBox;
    own.boundingSphere = geometry.boundingSphere;
    own.userData = geometry.userData;
    return own;
    // Сдвиг — пара чисел от идентификатора: сравниваем значения, а не массив.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, shift[0], shift[1]]);
}
