'use client';

import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { useSlide } from './useSlide';
import { useTouchTarget } from './useTouchTarget';
import { doorPivot } from '@/lib/millwork/cabinetBoxes';
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

  const pivot = doorPivot(opening, x, y, width, height);
  const target = open ? pivot.angle : 0;

  useSlide({
    target,
    initial: target,
    apply: (value) => {
      const el = group.current;
      if (!el) return;
      if (pivot.axis === 'x') el.rotation.x = value;
      else el.rotation.y = value;
    },
    onSettle: () => {
      if (!openRef.current) setActive(false);
    },
  });

  const [panelX, panelY] = pivot.panel;
  return (
    /*
     * Ось вращения стоит на ПЕРЕДНЕЙ плоскости корпуса (z = 0): модуль
     * нарисован от нуля вглубь, и петля живёт именно здесь. Смещать группу
     * на половину глубины нельзя — дверь оторвётся от шкафа.
     */
    <group ref={group} position={pivot.origin}>
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
      <mesh
        geometry={parts.box}
        material={frontMaterial ?? parts.front}
        position={[panelX, panelY, thickness / 2]}
        scale={[width - 2 * gap, height - 2 * gap, thickness]}
        castShadow
      />

      {/*
        * Ручка. Без неё фасад читается как панель, а не как дверь.
        * Профиль по верхней кромке при integratedHandles, иначе скоба.
        */}
      {integratedHandle ? (
        <mesh
          geometry={parts.box}
          material={parts.metal}
          position={[panelX, panelY + height / 2 - gap - 0.01, thickness + 0.004]}
          scale={[width - 2 * gap, 0.02, 0.015]}
        />
      ) : opening === 'lift' || opening === 'flap' ? (
        /*
         * У механизма ручка на СВОБОДНОМ крае — за него и берутся: у
         * подъёмника снизу, у откидного сверху. Скоба сбоку читалась бы
         * как распашная дверь, а это другая мебель.
         */
        <mesh
          geometry={parts.box}
          material={parts.metal}
          position={[
            panelX,
            panelY + (opening === 'lift' ? -height / 2 + 0.04 : height / 2 - 0.04),
            thickness + 0.012,
          ]}
          scale={[Math.min(0.24, width * 0.5), 0.016, 0.016]}
        />
      ) : (
        <mesh
          geometry={parts.box}
          material={parts.metal}
          position={[
            panelX + (opening === 'left' ? width / 2 - 0.05 : -width / 2 + 0.05),
            panelY,
            thickness + 0.012,
          ]}
          scale={[0.016, Math.min(0.22, height * 0.4), 0.016]}
        />
      )}
        </>
      )}
    </group>
  );
}
