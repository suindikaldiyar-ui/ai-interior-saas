'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { BoxDraw } from '@/lib/millwork/cabinetBoxes';
import type { FrontRelief } from '@/types/millwork';
import type { ReliefLeaf, ReliefOrient } from '@/lib/millwork/facadeRelief';
import { REAL_SIZE_SHIFT, realSizeShiftOf, shiftKeyOf } from './realSizeMap';
import { useReliefGeometry } from './reliefGeometry';

/** Пустой габарит: у пачки без рельефа хук сетки ничего не строит. */
const NO_LEAF: ReliefLeaf = { widthMm: 0, heightMm: 0, thicknessMm: 0 };
/** Фасад Б Г-образного модуля смотрит влево: +Z сетки поворачивается в −X. */
const FACE_LEFT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

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
  /** `part` — идентификатор подвижной детали: по нему её рисунок тот же и закрытой, и на ходу. */
  boxes: (BoxDraw & { part?: string })[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Имя меша: по нему приёмка находит пачку в графе сцены. */
  name?: string;
  /**
   * ПАЧКА НЕСЁТ СДВИГ РИСУНКА (P3D-LDSP) — у фасадов и корпуса своего декора,
   * где на материале бывает карта. Значение — соль места неподвижной детали
   * в ключе сдвига: ряд (две стены угла с боковиной в одной и той же точке
   * своего ряда иначе получили бы один кусок рисунка). Нет — пачка без
   * атрибута, как раньше.
   */
  shiftSalt?: string;
  /**
   * ПАЧКА ФАСАДОВ С РЕЛЬЕФОМ (P3D-MDF): одна сетка рисунка на все
   * экземпляры одного габарита. Экземпляр ставится НА МЕСТО коробки — тот
   * же центр, масштаб 1: сетка уже в метрах фасада. `face` — куда смотрит
   * лицо (фасад Б угла — влево). Нет — единичный куб, растянутый по коробке.
   */
  relief?: { relief: FrontRelief; leaf: ReliefLeaf; face?: '-x'; orient?: ReliefOrient };
};

export default function InstancedBoxes({
  boxes,
  geometry,
  material,
  castShadow = false,
  receiveShadow = false,
  name,
  shiftSalt,
  relief,
}: Props) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const reliefGeometry = useReliefGeometry(relief?.relief, relief?.leaf ?? NO_LEAF, relief?.orient);
  const base = reliefGeometry ?? geometry;

  /*
   * Ключ состава: пока коробки те же, матрицы не трогаем вовсе. Считать
   * их каждый кадр — та же трата, от которой мы уходим.
   */
  const key = useMemo(
    () => boxes.map((b) => `${b.position.join(',')}|${b.scale.join(',')}|${b.part ?? ''}`).join(';'),
    [boxes],
  );

  /*
   * СВОЁ МЕСТО НА ПЛИТЕ (P3D-LDSP): сдвиг рисунка у каждого экземпляра —
   * атрибутом пачки (`realSizeMap`). Геометрия своя у пачки: число
   * экземпляров у пачек разное, общая коробка такой атрибут не держит.
   */
  const batchGeometry = useMemo(() => {
    if (shiftSalt === undefined) return base;
    /*
     * Сетку рельефа не копируем: она большая (рифление — тысячи
     * треугольников) и общая у пачки и едущих створок. Своя у пачки только
     * обёртка с атрибутом сдвига, буферы вершин — те же.
     */
    const own = reliefGeometry ? new THREE.BufferGeometry() : base.clone();
    if (reliefGeometry) {
      for (const name of ['position', 'normal', 'uv']) {
        const attribute = reliefGeometry.getAttribute(name);
        if (attribute) own.setAttribute(name, attribute);
      }
      own.boundingBox = reliefGeometry.boundingBox;
      own.boundingSphere = reliefGeometry.boundingSphere;
      own.userData = reliefGeometry.userData;
    }
    const data = new Float32Array(Math.max(1, boxes.length) * 2);
    boxes.forEach((box, i) => {
      const [u, v] = realSizeShiftOf(shiftKeyOf(box, shiftSalt));
      data[i * 2] = u;
      data[i * 2 + 1] = v;
    });
    own.setAttribute(REAL_SIZE_SHIFT, new THREE.InstancedBufferAttribute(data, 2));
    return own;
    // Состав — в `key`: массив пересоздаётся чаще, чем меняются коробки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, key, shiftSalt]);
  /*
   * Своя геометрия пачки освобождается с ней; общая коробка и общая сетка
   * рельефа — нет (сетку отпускает её хук). Обёртку рельефа не освобождаем
   * вовсе: `dispose` снял бы с видеокарты ОБЩИЕ буферы вершин.
   */
  useEffect(() => () => {
    if (batchGeometry !== base && !reliefGeometry) batchGeometry.dispose();
  }, [batchGeometry, base, reliefGeometry]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();

    /* Рельеф: сетка уже в метрах фасада — на место коробки, масштаб 1, лицо куда смотрит фасад. */
    const placed = reliefGeometry !== null;
    if (placed && relief?.face === '-x') quaternion.copy(FACE_LEFT);
    boxes.forEach((box, i) => {
      position.set(box.position[0], box.position[1], box.position[2]);
      if (placed) scale.set(1, 1, 1);
      else scale.set(box.scale[0], box.scale[1], box.scale[2]);
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
  }, [key, invalidate, batchGeometry]);

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
      args={[batchGeometry, material, boxes.length]}
      /*
       * ИД ДЕТАЛИ ПО ЭКЗЕМПЛЯРУ (R01): приёмка находит полку и перегородку
       * отсека в НАРИСОВАННОМ графе и сверяет её матрицу с раскроем.
       */
      userData={{ partIds: boxes.map((box) => box.partId ?? null) }}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}
