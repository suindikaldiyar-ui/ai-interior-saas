'use client';

import { useEffect, useMemo } from 'react';
import type * as THREE from 'three';
import type { PartBox } from '@/lib/millwork/cabinetBoxes';
import type { PlanPath } from '@/lib/millwork/radius';
import { shapedGeometry } from './radiusGeometry';

/**
 * ПЛИТА ПО КОНТУРУ (OVAL & RADIUS) — столешница над радиусными модулями
 * (`slabOutline`) и цоколь под ними (`radiusPlinths`): контур — мм ряда,
 * высота — мм от пола. Та же призма, что у деталей (`shapedGeometry`).
 */
export function PlanPlate({
  name,
  path,
  y0Mm,
  y1Mm,
  material,
  castShadow = false,
  receiveShadow = false,
}: {
  name: string;
  path: PlanPath;
  y0Mm: number;
  y1Mm: number;
  material: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const geometry = useMemo(
    () => shapedGeometry([{ form: { kind: 'plate', path, y0: y0Mm, y1: y1Mm }, originM: [0, 0, 0] }]),
    [path, y0Mm, y1Mm],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh name={name} geometry={geometry} material={material} castShadow={castShadow} receiveShadow={receiveShadow} />;
}

/**
 * РАДИУСНЫЕ ДЕТАЛИ ОДНОГО МАТЕРИАЛА — ОДНОЙ СЕТКОЙ (OVAL & RADIUS).
 *
 * Дно и полки по контуру, гнутые дверцы, подложка и рейки на дуге не
 * единичный куб, и в пачку `InstancedBoxes` они не идут: их форма — призма
 * детали (`formPrism`), та же, что режет раскрой. Детали одного материала
 * сливаются в один буфер — один вызов отрисовки на материал, как у пачек.
 * Пересобирается буфер только со сменой состава.
 *
 * Имя — `shaped:<роль>:<ключ>`: приёмка считает радиусные детали в кадре и
 * сверяет их со списком движка.
 */
export default function ShapedBatch({
  name,
  boxes,
  material,
  castShadow = false,
  receiveShadow = false,
}: {
  name: string;
  boxes: PartBox[];
  material: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const geometry = useMemo(
    () => shapedGeometry(boxes.flatMap((box) => (box.shape ? [{ form: box.shape.form, originM: box.shape.originM }] : []))),
    [boxes],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (boxes.length === 0) return null;
  return (
    <mesh
      name={name}
      geometry={geometry}
      material={material}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      userData={{ shapedParts: boxes.length }}
    />
  );
}
