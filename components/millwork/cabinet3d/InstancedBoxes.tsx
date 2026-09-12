'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { BoxDraw } from '@/lib/millwork/cabinetBoxes';

/**
 * ОДИН ВЫЗОВ ОТРИСОВКИ НА ВЕСЬ КОРПУС.
 *
 * Корпуса модулей — это десятки одинаковых коробок из одного материала,
 * которые не двигаются вовсе. Каждая была отдельным мешем: на ряду из
 * тринадцати модулей выходило под сотню вызовов отрисовки, и столько же
 * во втором проходе, теневом. На планшете это и есть разница между
 * «крутится» и «дёргается».
 *
 * `InstancedMesh` рисует их за один вызов. Матрицы пересобираются только
 * при смене состава: раскладка меняется по нажатию, а не каждый кадр.
 *
 * Сюда попадает только НЕПОДВИЖНОЕ. Двери и ящики ездят каждый по своей
 * дуге и остаются обычными мешами — инстанс с анимацией пришлось бы
 * переписывать матрицами вручную, а выигрыш там нулевой: их единицы.
 */

type Props = {
  boxes: BoxDraw[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Имя меша: по нему приёмка находит пачку в графе сцены. */
  name?: string;
};

export default function InstancedBoxes({
  boxes,
  geometry,
  material,
  castShadow = false,
  receiveShadow = false,
  name,
}: Props) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);

  /*
   * Ключ состава: пока коробки те же, матрицы не трогаем вовсе. Считать
   * их каждый кадр — та же трата, от которой мы уходим.
   */
  const key = useMemo(
    () => boxes.map((b) => `${b.position.join(',')}|${b.scale.join(',')}`).join(';'),
    [boxes],
  );

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();

    boxes.forEach((box, i) => {
      position.set(box.position[0], box.position[1], box.position[2]);
      scale.set(box.scale[0], box.scale[1], box.scale[2]);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    });

    mesh.count = boxes.length;
    mesh.instanceMatrix.needsUpdate = true;
    // Границы считаются по матрицам: без этого мебель пропадает при
    // отсечении по камере, хотя стоит в кадре.
    mesh.computeBoundingSphere();
    invalidate();
    // `key` меняется вместе с составом; сам массив пересоздаётся чаще.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, invalidate]);

  if (boxes.length === 0) return null;

  return (
    <instancedMesh
      ref={ref}
      name={name}
      /*
       * Число экземпляров задаётся при создании буфера, поэтому меняем
       * его вместе с составом через `key`: R3F пересоздаст меш, а не
       * оставит буфер на прежнюю длину.
       */
      key={boxes.length}
      args={[geometry, material, boxes.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}
