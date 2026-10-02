'use client';

import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { useSlide } from './useSlide';
import { useTouchTarget } from './useTouchTarget';
import { doorKick, doorPivot, leafLocal } from '@/lib/millwork/cabinetBoxes';
import type { CabinetParts } from './parts';

/**
 * Дверь, которая распахивается.
 *
 * Вращается вокруг ПЕТЕЛЬНОГО КРАЯ, а не вокруг центра: дверь на средней
 * оси выглядит как вращающаяся вывеска и сразу читается как неправда.
 * Поэтому группа стоит на петле, а полотно сдвинуто внутри неё на
 * полширины.
 */

type Props = {
  id: string;
  open: boolean;
  onToggle: (id: string) => void;
  /**
   * Куда открывается фасад. То же поле, что рисует диагональ на чертеже
   * и по которому смета считает фурнитуру: сцена показывает мебель, а не
   * придумывает вторую.
   */
  opening: 'left' | 'right' | 'lift' | 'flap';
  /** Габариты в метрах, начало координат — левый нижний угол корпуса. */
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  thickness: number;
  parts: CabinetParts;
  /**
   * Материал ЭТОГО фасада.
   *
   * У каждого модуля он свой, а `parts.front` — общий на сцену: открытая
   * створка иначе меняла бы цвет в момент открывания.
   */
  frontMaterial?: THREE.MeshStandardMaterial;
  /** Зазор вокруг полотна, метры. По нему читается щель между фасадами. */
  gap: number;
  /** Ручка-профиль по верхней кромке вместо накладной скобы. */
  integratedHandle: boolean;
  /**
   * Створка поехала или встала.
   *
   * Пока она стоит закрытой, её рисует общая отрисовка ряда; поехала —
   * ряд убирает её из своей пачки, чтобы не было двух дверей сразу.
   */
  onActive?: (id: string, active: boolean) => void;
};


export default function InteractiveDoor({
  id,
  open,
  onToggle,
  opening,
  x,
  y,
  width,
  height,
  depth,
  thickness,
  parts,
  frontMaterial,
  gap,
  integratedHandle,
  onActive,
}: Props) {
  const group = useRef<THREE.Group>(null);
  const touch = useRef<THREE.Mesh>(null);

  /*
   * Закрытая дверь рисуется НЕ ЗДЕСЬ: она уходит в общую отрисовку ряда
   * одним вызовом вместе с остальными фасадами. Свой меш появляется на
   * время открывания и держится, пока дверь не встанет обратно, — иначе
   * створка исчезала бы на полпути.
   */
  const [active, setActive] = useState(open);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (open) setActive(true);
  }, [open]);

  useEffect(() => {
    onActive?.(id, active);
  }, [id, active, onActive]);

  // Зона касания не меньше 44 px на экране: полотно 200 мм на телефоне
  // само по себе восемь пикселей.
  useTouchTarget(touch, { width, height, depth: 0.06 });
  void depth;

  const pivot = doorPivot(opening, x, y, width, height, thickness);
  const target = open ? pivot.angle : 0;

  useSlide({
    target,
    initial: target,
    apply: (value) => {
      const el = group.current;
      if (!el) return;
      if (pivot.axis === 'x') el.rotation.x = value;
      else {
        el.rotation.y = value;
        /* Петля выносит полотно вперёд по ходу (`doorKick`, слой 55). */
        el.position.z = pivot.origin[2] + doorKick(pivot, value);
      }
    },
    onSettle: () => {
      if (!openRef.current) setActive(false);
    },
  });

  const [panelX, panelY] = pivot.panel;
  const local = leafLocal({ opening, width, height, thickness, gap, integratedHandle });
  return (
    /*
     * Ось вращения стоит на ПЕРЕДНЕЙ плоскости корпуса (z = 0): модуль
     * нарисован от нуля вглубь, и петля живёт именно здесь. Смещать группу
     * на половину глубины нельзя — дверь оторвётся от шкафа.
     */
    <group
      ref={group}
      position={[pivot.origin[0], pivot.origin[1], pivot.origin[2] + doorKick(pivot, target)]}
    >
      <mesh
        ref={touch}
        name={`part:${id}`}
        geometry={parts.box}
        material={parts.hit}
        /*
         * Зона касания не рисуется вовсе. Прозрачный меш всё равно уходит
         * в рендер: тринадцать модулей давали больше тридцати вызовов
         * отрисовки на то, чего не видно. Луч указателя невидимые объекты
         * по-прежнему находит — проверено кликом по мебели.
         */
        visible={false}
        position={[panelX, panelY, 0]}
        scale={[width, height, 0.06]}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      />

      {/*
        * Полотно стоит ВПЕРЕДИ корпуса и уже проёма на два зазора: тёмная
        * щель между фасадами — главный признак мебели. Без неё ряд читается
        * как крашеная стена.
        *
        * Рисуется, только пока створка открыта или едет: закрытая уходит
        * в общую отрисовку ряда.
        */}
      {active && (
        <>
      {/*
        * ПОЛОТНО И РУЧКА — ИЗ `leafLocal` (слой 55): те же числа меряет
        * проверка открывания у угла (`leafPoses`). Своих координат у
        * компонента нет — иначе картинка и проверка разойдутся.
        */}
      <mesh
        geometry={parts.box}
        material={frontMaterial ?? parts.front}
        position={local.panel.at}
        scale={local.panel.size}
        castShadow
      />

      {/*
        * Ручка. Без неё фасад читается как панель, а не как дверь.
        * Профиль по верхней кромке при integratedHandles, у механизма — на
        * свободном крае, иначе скоба.
        */}
      <mesh
        geometry={parts.box}
        material={parts.metal}
        position={local.handle.at}
        scale={local.handle.size}
      />
        </>
      )}
    </group>
  );
}
