'use client';

import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { useSlide } from './useSlide';
import { useTouchTarget } from './useTouchTarget';
import { useShiftedBox, type CabinetParts } from './parts';
import type { FrontRelief } from '@/types/millwork';
import { realSizeShiftOf } from './realSizeMap';
import { useReliefGeometry, useShiftedRelief } from './reliefGeometry';
import type { ReliefOrient } from '@/lib/millwork/facadeRelief';
import { DRAWER_TRAVEL_M, type FrontRect, type PartBox } from '@/lib/millwork/cabinetBoxes';
import { useInteriorStore } from '@/store/useInteriorStore';
import { HandleMesh } from './handleMesh';

/**
 * Ящик, который выезжает.
 *
 * Клиент не умеет читать чертёж, но выдвинутый ящик понимает без
 * объяснений. Это и есть главный довод на встрече — и он бесплатный:
 * никаких запросов к модели, чистая геометрия.
 */

/*
 * Ход направляющих (300 мм) живёт в движке (`DRAWER_TRAVEL_M`, слой 55):
 * его меряет проверка открывания у угла, и второго числа быть не должно.
 */
export { DRAWER_TRAVEL_M };

type Props = {
  id: string;
  open: boolean;
  onToggle: (id: string) => void;
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
  /** Рельеф МДФ фронта (P3D-MDF): тот же, что у задвинутого в пачке. */
  relief?: FrontRelief;
  /** Разворот рисунка с фрезерованной ручкой — тот же, что у фронта в пачке (`gripOrient`). */
  reliefOrient?: ReliefOrient;
  /** Разрез: фасады убраны, видно короб ящика. */
  cutaway: boolean;
  gap: number;
  /**
   * РУЧКА ФРОНТА (HANDLE-REAL) — коробка той же пачки, в координатах модуля:
   * своей формулы ручки у ящика больше нет. «Без ручки» и фрезерованная во
   * фронте ручка коробки не дают — на ходу ручки нет, как и у задвинутого.
   */
  handle?: PartBox;
  /** Ящик поехал или встал: задвинутый рисуется вместе со всем рядом. */
  onActive?: (id: string, active: boolean) => void;
  /**
   * СЛОИ (STAGE A): фронт — слой «Фасады», короб — слой «Ящики». Ящик едет
   * всегда, а в кадре — только включённое: короб в «Наполнении» выезжает
   * без фронта, фронт в «Фасадах» — без короба. Нажать можно то, что видно.
   */
  showFront?: boolean;
  showBox?: boolean;
  /** Фронт — деталь деталировки (F9): размер закрытой коробки пачки. Пусто — место минус два зазора. */
  front?: FrontRect | null;
  /** Ход, метры (HW-04): модель направляющей на месте модуля (`runnerModelOf`). Пусто — условные 300 мм. */
  travelM?: number;
};

export default function InteractiveDrawer({
  id,
  open,
  onToggle,
  x,
  y,
  width,
  height,
  depth,
  thickness,
  parts,
  frontMaterial,
  relief,
  reliefOrient,
  cutaway,
  gap,
  handle,
  onActive,
  showFront = true,
  showBox = true,
  front = null,
  travelM = DRAWER_TRAVEL_M,
}: Props) {
  const economy = useInteriorStore((state) => state.economyMode);
  const hit = showFront || showBox || Boolean(handle);
  const group = useRef<THREE.Group>(null);
  const touch = useRef<THREE.Mesh>(null);

  /*
   * Задвинутый ящик рисуется вместе со всем рядом одним вызовом. Свой
   * меш живёт только пока ящик выехал или едет обратно.
   */
  const [active, setActive] = useState(open);
  const openRef = useRef(open);
  /* Фронт ящика — тот же кусок дерева, что у него задвинутого в пачке. */
  const frontBox = useShiftedBox(parts.box, id);
  /* Габарит фронта — тот же, что в `drawerBoxes`: деталь деталировки (F9). */
  const frontW = front ? front.w : width - 2 * gap;
  const frontH = front ? front.h : height - 2 * gap;
  const reliefGeometry = useShiftedRelief(
    useReliefGeometry(
      relief,
      {
        widthMm: frontW * 1000,
        heightMm: frontH * 1000,
        thicknessMm: thickness * 1000,
      },
      reliefOrient,
    ),
    realSizeShiftOf(id),
  );
  openRef.current = open;

  useEffect(() => {
    if (open) setActive(true);
  }, [open]);

  useEffect(() => {
    onActive?.(id, active);
  }, [id, active, onActive]);

  useSlide({
    target: open ? travelM : 0,
    initial: open ? travelM : 0,
    apply: (value) => {
      const el = group.current;
      if (el) el.position.z = value;
    },
    onSettle: () => {
      if (!openRef.current) setActive(false);
    },
  });

  const boxH = Math.max(0.06, height - 0.04);
  const inner = Math.max(0.05, width - 2 * thickness);

  /*
   * Палец попадает не в кромку фронта, а «примерно туда». Невидимый
   * коллайдер раздувается до 44 px НА ЭКРАНЕ — в миллиметрах эта задача
   * не решается, на телефоне фронт ящика сам по себе в несколько пикселей.
   */
  useTouchTarget(touch, { width, height, depth });

  return (
    <group ref={group} position={[x + width / 2, y + height / 2, 0]}>
      {/* Невидимая зона касания. */}
      <mesh
        ref={touch}
        name={`part:${id}`}
        position={[0, 0, -depth / 2]}
        geometry={parts.box}
        material={parts.hit}
        /*
         * Зона касания не рисуется вовсе. Прозрачный меш всё равно уходит
         * в рендер: тринадцать модулей давали больше тридцати вызовов
         * отрисовки на то, чего не видно. Луч указателя невидимые объекты
         * по-прежнему находит — проверено кликом по мебели.
         */
        visible={false}
        scale={[width, height, depth]}
        onClick={
          hit
            ? (event) => {
                event.stopPropagation();
                onToggle(id);
              }
            : undefined
        }
        onPointerOver={
          hit
            ? (event) => {
                event.stopPropagation();
                document.body.style.cursor = 'pointer';
              }
            : undefined
        }
        onPointerOut={
          hit
            ? () => {
                document.body.style.cursor = '';
              }
            : undefined
        }
      />

      {/*
        * Короб: дно, две боковины, задняя стенка. Как и фронт, рисуется
        * только пока ящик выехал: задвинутый живёт в общей отрисовке.
        */}
      {active && (
        <>
      {showBox && (
        <>
      <mesh
        geometry={parts.box}
        material={parts.carcass}
        position={[0, -boxH / 2 + thickness / 2, -depth / 2]}
        scale={[inner, thickness, depth * 0.9]}
      />
      <mesh
        geometry={parts.box}
        material={parts.carcass}
        position={[-inner / 2, 0, -depth / 2]}
        scale={[thickness, boxH, depth * 0.9]}
      />
      <mesh
        geometry={parts.box}
        material={parts.carcass}
        position={[inner / 2, 0, -depth / 2]}
        scale={[thickness, boxH, depth * 0.9]}
      />
      <mesh
        geometry={parts.box}
        material={parts.carcass}
        position={[0, 0, -depth / 2 - depth * 0.45]}
        scale={[inner, boxH, thickness]}
      />
        </>
      )}

      {/* Фронт. В разрезе его нет: он закрывает ровно то, ради чего смотрят. */}
      {!cutaway && (
        <>
          {showFront && (
          <mesh
            geometry={reliefGeometry ?? frontBox}
            material={frontMaterial ?? parts.front}
            position={[0, 0, thickness / 2]}
            scale={reliefGeometry ? [1, 1, 1] : [frontW, frontH, thickness]}
            castShadow
          />
          )}

          {/* Ручка — та же коробка пачки, своей моделью: место в модуле минус начало группы ящика. */}
          {handle?.handle && (
            <HandleMesh
              draw={handle.handle}
              position={[handle.position[0] - (x + width / 2), handle.position[1] - (y + height / 2), handle.position[2]]}
              fine={!economy}
              part={handle.part ?? id}
            />
          )}
        </>
      )}
        </>
      )}
    </group>
  );
}
