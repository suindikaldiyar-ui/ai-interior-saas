'use client';

import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { useSlide } from './useSlide';
import { useTouchTarget } from './useTouchTarget';
import { doorLinkOf, doorPivot, doorShift, leafLocal, leafPointAt, type FrontRect, type PartBox } from '@/lib/millwork/cabinetBoxes';
import { useShiftedBox, type CabinetParts } from './parts';
import type { FrontRelief } from '@/types/millwork';
import { realSizeShiftOf } from './realSizeMap';
import { glassOfRelief, useReliefGeometry, useShiftedRelief } from './reliefGeometry';
import type { ReliefOrient } from '@/lib/millwork/facadeRelief';
import { GLASS_PANE_M, GLASS_PANE_Z_M } from '@/lib/millwork/cabinetBoxes';
import { useInteriorStore } from '@/store/useInteriorStore';
import { HandleMesh } from './handleMesh';
import { HingeLinks, HingeMesh } from './hingeMesh';
import type { HingeDraw } from '@/lib/millwork/cabinetBoxes';
import { liftPose, type LiftMechanism, type LiftMotion } from '@/lib/millwork/liftKinematics';
import { setLiftTravel } from './liftTravel';

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
  /**
   * РЕЛЬЕФ МДФ ЭТОЙ СТВОРКИ (P3D-MDF) — тот же, что у неё закрытой в пачке:
   * открылась — рисунок едет вместе с полотном, а не становится коробкой.
   */
  relief?: FrontRelief;
  /** Разворот рисунка с фрезерованной ручкой — тот же, что у створки в пачке (`gripOrient`). */
  reliefOrient?: ReliefOrient;
  /** Зазор вокруг полотна, метры. По нему читается щель между фасадами. */
  gap: number;
  /**
   * Створка поехала или встала.
   *
   * Пока она стоит закрытой, её рисует общая отрисовка ряда; поехала —
   * ряд убирает её из своей пачки, чтобы не было двух дверей сразу.
   */
  onActive?: (id: string, active: boolean) => void;
  /**
   * ЧТО ЕДЕТ С ПОЛОТНОМ (HARDWARE-01): чашки петель, рычаг подъёмника и
   * ручка (HANDLE-REAL) — коробки той же пачки (координаты модуля).
   * Закрытую створку их рисует пачка; открытую — она сама, иначе петли
   * пропадали на ходу, а ручка ставилась своей формулой не туда.
   */
  riders?: PartBox[];
  /**
   * ДВЕРЬ ВИТРИНЫ В РАМЕ (V3D-02): полотна ЛДСП нет — едут рама и стекло
   * («седоками», коробки `displayDoorBoxes` той же пачки).
   */
  panelless?: boolean;
  /** Стекло этой двери — вида, выбранного у модуля (`glassLook`). Нет — прежнее стекло сцены. */
  glassMaterial?: THREE.Material;
  /** Рамка двери витрины (P1) — покрытия, выбранного у модуля (`profileLook`). Нет — металл сцены. */
  profileMaterial?: THREE.Material;
  /**
   * СЛОЙ «ФАСАДЫ» (STAGE A): выключен — полотна в кадре нет, но створка
   * по-прежнему ходит, и «седоки» включённых слоёв (петли в виде «только
   * фурнитура») едут с ней. Нажать невидимое полотно нельзя: зона касания
   * тогда не ловит указатель, и нажатие доходит до того, что видно за ним.
   */
  showPanel?: boolean;
  /**
   * ВИД ХОДА ПОДЪЁМНИКА (HW-07): по классу позиции на месте модуля. Пусто —
   * поворот вверх, как было. Поза — `liftPose`, та же, что меряет `leafPoses`.
   */
  liftMotion?: LiftMotion | null;
  /**
   * МЕХАНИЗМ ПОДЪЁМНИКА (AVENTOS, решение владельца 2026-11-01, п. 4): фасад — шатун модели, поза —
   * `liftPose` с механизмом, та же, что меряет `leafPoses`; доля хода уходит рычагам (`setLiftTravel`).
   */
  liftMech?: LiftMechanism | null;
  /** Деталь полотна в осях места (F9): закрытая коробка пачки — ходит та же деталь. */
  rect?: FrontRect | null;
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
  relief,
  reliefOrient,
  gap,
  onActive,
  riders,
  panelless = false,
  glassMaterial,
  profileMaterial,
  showPanel = true,
  liftMotion = null,
  liftMech = null,
  rect = null,
}: Props) {
  const economy = useInteriorStore((state) => state.economyMode);
  const group = useRef<THREE.Group>(null);
  /* Сдвиг полотна до поворота — у параллельного и «вверх и назад» подъёмника. */
  const lifted = useRef<THREE.Group>(null);
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

  /*
   * ШАРНИРНАЯ КИНЕМАТИКА (решение владельца 2026-11-01): у петли с четырёхзвенником
   * створка ходит по нему и раскрывается на паспортный угол; чашка остаётся на
   * звеньях плеча. Без механизма — прежний поворот у кромки с выносом (слой 55).
   */
  const link = opening === 'left' || opening === 'right' ? doorLinkOf((riders ?? []).find((box) => box.hinge?.half === 'cup')?.hinge) : null;
  const pivot = doorPivot(opening, x, y, width, height, thickness, link);
  /* Угол, заданный створке (45°, 90° — показ), не больше полного. */
  const degree = useInteriorStore((state) => state.openDegrees[id]);
  const full = Math.abs(pivot.angle);
  /* У механизма угол показа — угол фасада механизма (107° у HK top): доля хода — от него. */
  const mechDeg = liftMech && liftMech.model.openDeg > 0 ? liftMech.model.openDeg : 0;
  /* Ограничитель угла подъёмника (задача B): «открыто» — до его угла, а не до паспортного. */
  const limited = liftMech?.limitDeg && mechDeg > 0 ? Math.min(full, (liftMech.limitDeg / mechDeg) * full) : full;
  const wanted =
    degree === undefined ? limited : mechDeg > 0 ? Math.min(limited, Math.max(0, degree / mechDeg) * full) : Math.min(full, Math.max(0, (degree * Math.PI) / 180));
  const target = open ? Math.sign(pivot.angle) * wanted : 0;
  /* Угол створки на этом кадре — для звеньев петли (HW-03). */
  const angleRef = useRef(target);
  /*
   * Звенья — у процедурной петли и у петли с четырёхзвенником (её звенья — оси
   * механизма, у модели реестра тоже: в файле их нет, они ходят сами по себе).
   */
  const hingeDraws = (riders ?? []).filter((box) => box.hinge?.half === 'cup' && box.hinge.model.linkage).map((box) => box.hinge as HingeDraw);
  /*
   * ПЕТЛЯ БЕЗ МЕХАНИЗМА (условная или каталога без кинематики, решение владельца 2026-11-01): на ходу
   * звенья не рисуются — растягивающееся звено выдавало бы условный поворот за настоящую петлю. Чашка
   * остаётся в отверстии фасада и едет с ним; кинематика «не подтверждена» — словами в «Открывании».
   */
  /* Точка полотна в закрытой позе (местные оси модуля) → та же точка при угле: одна `leafPointAt` со сценой и приёмкой. */
  const toCarcass = (p: [number, number, number], angle: number): [number, number, number] => leafPointAt(pivot, p, angle);

  useSlide({
    target,
    initial: target,
    apply: (value) => {
      angleRef.current = value;
      const el = group.current;
      if (!el) return;
      if (opening === 'lift' && (liftMech || liftMotion === 'parallel_lift' || liftMotion === 'swing_over')) {
        /* Доля хода — от угла, которым его ведёт `useSlide`; поза — одна функция со проверкой. */
        const u = pivot.angle === 0 ? 0 : value / pivot.angle;
        const pose = liftPose(liftMotion, u, height, thickness, liftMech);
        el.rotation.x = pose.angle;
        if (lifted.current) lifted.current.position.set(0, pose.liftY, pose.liftZ);
        if (liftMech) setLiftTravel(id, u);
        return;
      }
      if (pivot.axis === 'x') el.rotation.x = value;
      else {
        el.rotation.y = value;
        /* Петля выносит полотно вперёд по ходу (`doorKick`, слой 55) или ведёт его четырёхзвенником (`doorShift`). */
        const [dx, dz] = doorShift(pivot, value);
        el.position.x = pivot.origin[0] + dx;
        el.position.z = pivot.origin[2] + dz;
      }
    },
    onSettle: () => {
      if (!openRef.current) setActive(false);
    },
  });

  const [panelX, panelY] = pivot.panel;
  const local = leafLocal({ opening, width, height, thickness, gap, rect });
  /* Рисунок полотна — тот же кусок дерева, что у него закрытого в пачке. */
  const panelBox = useShiftedBox(parts.box, id);
  /* Сетка рельефа — того же габарита, что закрытое полотно (`leafLocal` = `doorBoxes`). */
  const reliefGeometry = useShiftedRelief(
    useReliefGeometry(
      relief,
      {
        widthMm: local.panel.size[0] * 1000,
        heightMm: local.panel.size[1] * 1000,
        thicknessMm: local.panel.size[2] * 1000,
      },
      reliefOrient,
    ),
    realSizeShiftOf(id),
  );
  /* Стекло рамы витрины едет с полотном: те же числа, что у створки в пачке (`doorBoxes`). */
  const glass = glassOfRelief(reliefGeometry);
  return (
    /*
     * Ось вращения стоит на ПЕРЕДНЕЙ плоскости корпуса (z = 0): модуль
     * нарисован от нуля вглубь, и петля живёт именно здесь. Смещать группу
     * на половину глубины нельзя — дверь оторвётся от шкафа.
     */
    <>
    {/* Звенья петли — вне группы полотна: одним концом на плече корпуса, другим на чашке (HW-03). */}
    {active && hingeDraws.length > 0 && <HingeLinks draws={hingeDraws} material={parts.metal} toCarcass={toCarcass} angleRef={angleRef} part={id} />}
    <group
      ref={group}
      position={[pivot.origin[0] + doorShift(pivot, target)[0], pivot.origin[1], pivot.origin[2] + doorShift(pivot, target)[1]]}
    >
      <group ref={lifted} name={liftMech ? `lift:${liftMech.model.key}` : liftMotion ? `lift:${liftMotion}` : undefined}>
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
        onClick={
          showPanel
            ? (event) => {
                event.stopPropagation();
                onToggle(id);
              }
            : undefined
        }
        onPointerOver={
          showPanel
            ? (event) => {
                event.stopPropagation();
                document.body.style.cursor = 'pointer';
              }
            : undefined
        }
        onPointerOut={
          showPanel
            ? () => {
                document.body.style.cursor = '';
              }
            : undefined
        }
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
      {!panelless && showPanel && (
        <mesh
          geometry={reliefGeometry ?? panelBox}
          material={frontMaterial ?? parts.front}
          position={local.panel.at}
          scale={reliefGeometry ? [1, 1, 1] : local.panel.size}
          castShadow
        />
      )}
      {glass && showPanel && (
        <mesh
          geometry={parts.box}
          material={glassMaterial ?? parts.glass}
          renderOrder={2}
          position={[
            local.panel.at[0] + (glass[0] + glass[2]) / 2 / 1000,
            local.panel.at[1] + (glass[1] + glass[3]) / 2 / 1000,
            local.panel.at[2] - local.panel.size[2] / 2 + GLASS_PANE_Z_M,
          ]}
          scale={[(glass[2] - glass[0]) / 1000, (glass[3] - glass[1]) / 1000, GLASS_PANE_M]}
        />
      )}

      {/*
        * Петли, рычаг и ручка: место в пачке минус ось — в кадре полотна они
        * стоят там же, где у закрытого. Ручка — своей моделью (HANDLE-REAL);
        * «Без ручки» и фрезерованная ручка коробки не дают вовсе.
        */}
      {riders?.map((box, i) => {
        const at: [number, number, number] = [
          box.position[0] - pivot.origin[0],
          box.position[1] - pivot.origin[1],
          box.position[2] - pivot.origin[2],
        ];
        if (box.hinge) {
          /* Чашка петли своей сеткой: начало сетки — ось чашки, а не центр коробки узла. */
          const o = box.hinge.origin;
          return <HingeMesh key={`rider-${i}`} draw={box.hinge} position={[o[0] - pivot.origin[0], o[1] - pivot.origin[1], o[2] - pivot.origin[2]]} material={parts.metal} fine={!economy} />;
        }
        return box.handle ? (
          <HandleMesh key={`rider-${i}`} draw={box.handle} position={at} fine={!economy} part={box.part ?? id} />
        ) : (
          <mesh
            key={`rider-${i}`}
            name={`rider:${box.node ?? 'metal'}`}
            geometry={parts.box}
            material={
              box.material === 'glass'
                ? (glassMaterial ?? parts.glass)
                : box.profile && profileMaterial
                  ? profileMaterial
                  : parts.metal
            }
            renderOrder={box.material === 'glass' ? 2 : 0}
            position={at}
            scale={box.scale}
            castShadow={box.node === 'frame'}
          />
        );
      })}
        </>
      )}
      </group>
    </group>
    </>
  );
}
